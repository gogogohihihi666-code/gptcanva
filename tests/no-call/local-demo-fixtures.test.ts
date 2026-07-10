import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_FIXTURE_GATE_ENV,
  DEMO_FIXTURE_MARKER,
  __noCallDemoFixtureTestHooks,
  assertCanRunNoCallDemoFixtures,
  buildNoCallDemoFixtureDataset,
  cleanNoCallDemoFixtures,
  seedNoCallDemoFixtures,
} from '../../scripts/dev/no-call-demo-fixtures'

const allowedEnv = {
  NODE_ENV: 'development',
  [DEMO_FIXTURE_GATE_ENV]: '1',
}

describe('local no-call demo fixtures', () => {
  it('rejects production and closed-gate runs before any data write', () => {
    assert.throws(
      () => assertCanRunNoCallDemoFixtures({
        NODE_ENV: 'production',
        [DEMO_FIXTURE_GATE_ENV]: '1',
      }),
      /refuses to run in production/i,
    )

    assert.throws(
      () => assertCanRunNoCallDemoFixtures({
        NODE_ENV: 'development',
      }),
      /OKPICAI_ALLOW_LOCAL_DEMO_FIXTURES=1/,
    )
  })

  it('builds only marked local no-call data without sensitive or external payloads', () => {
    const dataset = buildNoCallDemoFixtureDataset(new Date('2026-07-07T08:00:00.000Z'))
    const text = JSON.stringify(dataset)

    assert.equal(dataset.marker, DEMO_FIXTURE_MARKER)
    assert.equal(dataset.user.email, 'demo-user@example.local')
    assert.ok(dataset.membershipOrders.some(order => order.status === 'PENDING'))
    assert.ok(dataset.membershipOrders.some(order => order.status === 'BENEFIT_GRANTED'))
    assert.ok(dataset.membershipOrders.some(order => order.status === 'FAILED'))
    assert.ok(dataset.rechargeOrders.some(order => order.payStatus === 'PAYING'))
    assert.ok(dataset.rechargeOrders.some(order => order.payStatus === 'PAID'))
    const generationStatuses = new Set(dataset.generationRecords.map(record => record.status))
    for (const status of ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'STOPPED']) {
      assert.equal(generationStatuses.has(status), true, `missing ${status} demo generation record`)
    }
    const pendingRecord = dataset.generationRecords.find(record => record.status === 'PENDING')
    assert.ok(pendingRecord)
    assert.equal(pendingRecord.content, null)
    assert.equal(pendingRecord.errorMessage, null)
    assert.ok(dataset.pointLogs.some(log => log.changeType === 'CONSUME'))
    assert.ok(dataset.pointLogs.some(log => log.changeType === 'REFUND'))
    assert.ok(dataset.pointLogs.some(log => log.sourceType === 'ADMIN_ADJUST'))
    assert.ok(dataset.auditLogs.some(log => log.action.includes('provider')))

    assert.doesNotMatch(text, /apiKeyEncrypted/i)
    assert.doesNotMatch(text, /signedUrl/i)
    assert.doesNotMatch(text, /signed URL/i)
    assert.doesNotMatch(text, /OSS_ACCESS_KEY/i)
    assert.doesNotMatch(text, /OSS_SECRET/i)
    assert.doesNotMatch(text, /rawPayloadJson/i)
    assert.doesNotMatch(text, /base64/i)
    assert.doesNotMatch(text, /demo-admin@example.local/i)
  })

  it('keeps fixed fixture ids within Prisma varchar limits', () => {
    const dataset = buildNoCallDemoFixtureDataset(new Date('2026-07-07T08:00:00.000Z'))
    const ids: string[] = []
    const collectIds = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(collectIds)
        return
      }
      const record = value as Record<string, unknown>
      if (typeof record.id === 'string') {
        ids.push(record.id)
      }
      Object.values(record).forEach(collectIds)
    }

    collectIds(dataset)

    assert.equal(ids.length > 0, true)
    for (const id of ids) {
      assert.equal(id.length <= 36, true, `${id} exceeds 36 chars`)
    }
  })

  it('seeds idempotently without Provider, payment, storage, or production-user side effects', async () => {
    const store = __noCallDemoFixtureTestHooks.createInMemoryStore()
    const externalCalls: string[] = []

    const first = await seedNoCallDemoFixtures({
      env: allowedEnv,
      store,
      externalHooks: {
        callProvider: () => externalCalls.push('provider'),
        callPayment: () => externalCalls.push('payment'),
        uploadStorage: () => externalCalls.push('storage'),
      },
      now: new Date('2026-07-07T08:00:00.000Z'),
    })
    const second = await seedNoCallDemoFixtures({
      env: allowedEnv,
      store,
      now: new Date('2026-07-07T08:00:00.000Z'),
    })

    assert.deepEqual(externalCalls, [])
    assert.equal(first.willCallProvider, false)
    assert.equal(first.willCallPayment, false)
    assert.equal(first.willUploadStorage, false)
    assert.equal(first.affectedRealAdminUser, false)
    assert.equal(second.createdTotal, 0)
    assert.equal(second.updatedTotal > 0, true)

    const counts = store.countByKind()
    assert.equal(counts.users, 1)
    assert.equal(counts.membershipOrders >= 4, true)
    assert.equal(counts.rechargeOrders >= 3, true)
    assert.equal(counts.generationRecords >= 5, true)
    assert.equal(counts.pointLogs >= 5, true)
    assert.equal(counts.auditLogs >= 4, true)
  })

  it('creates membership orders before subscriptions that reference them', async () => {
    const store = __noCallDemoFixtureTestHooks.createInMemoryStore()

    await seedNoCallDemoFixtures({
      env: allowedEnv,
      store,
      now: new Date('2026-07-07T08:00:00.000Z'),
    })

    const operationKinds = store.getOperationKinds()
    assert.ok(operationKinds.indexOf('membershipOrders') > -1)
    assert.ok(operationKinds.indexOf('userSubscriptions') > -1)
    assert.equal(
      operationKinds.indexOf('membershipOrders') < operationKinds.indexOf('userSubscriptions'),
      true,
    )
  })

  it('clean removes only marked demo data and preserves non-demo records', async () => {
    const store = __noCallDemoFixtureTestHooks.createInMemoryStore()
    store.insertNonDemoSentinel()

    const first = await seedNoCallDemoFixtures({
      env: allowedEnv,
      store,
      now: new Date('2026-07-07T08:00:00.000Z'),
    })
    const clean = await cleanNoCallDemoFixtures({
      env: allowedEnv,
      store,
    })

    assert.equal(clean.removedTotal > 0, true)
    assert.equal(clean.removedTotal, first.createdTotal)
    assert.equal(store.countMarkedDemoRecords(), 0)
    assert.equal(store.hasNonDemoSentinel(), true)
    assert.equal(clean.preservedNonDemoRecords, true)
  })
})
