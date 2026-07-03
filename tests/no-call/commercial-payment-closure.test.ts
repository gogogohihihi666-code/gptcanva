import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { __commercialPaymentTestHooks } from '../../server/marketing-center/service'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

const originalNodeEnv = process.env.NODE_ENV
const originalLocalPaymentFlag = process.env.ENABLE_LOCAL_PAYMENT_SIMULATION

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }

  if (originalLocalPaymentFlag === undefined) {
    delete process.env.ENABLE_LOCAL_PAYMENT_SIMULATION
  } else {
    process.env.ENABLE_LOCAL_PAYMENT_SIMULATION = originalLocalPaymentFlag
  }
})

type StoredRecord = Record<string, any>

const makeFindFirst = (items: StoredRecord[]) => async (args?: any) => {
  const where = args?.where || {}
  return items.find((item) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      return true
    }
    return item[key] === value
  })) || null
}

const makeMockTx = (input: {
  membershipOrder?: StoredRecord
  rechargeOrder?: StoredRecord
  pointBalance?: number
}) => {
  let nextId = 1
  const records = {
    paymentTransactions: [] as StoredRecord[],
    benefitGrants: [] as StoredRecord[],
    pointLogs: [] as StoredRecord[],
    subscriptions: [] as StoredRecord[],
  }

  const next = (prefix: string) => `${prefix}_${nextId++}`

  const tx: any = {
    $queryRaw: async () => [{ id: 'locked' }],
    membershipOrder: {
      findUnique: async ({ where }: any) => {
        if (!input.membershipOrder || input.membershipOrder.orderNo !== where.orderNo) {
          return null
        }
        return input.membershipOrder
      },
      update: async ({ where, data }: any) => {
        assert.equal(where.id, input.membershipOrder?.id)
        Object.assign(input.membershipOrder as StoredRecord, data)
        return { ...(input.membershipOrder as StoredRecord) }
      },
    },
    rechargeOrder: {
      findUnique: async ({ where }: any) => {
        if (!input.rechargeOrder || input.rechargeOrder.orderNo !== where.orderNo) {
          return null
        }
        return input.rechargeOrder
      },
      update: async ({ where, data }: any) => {
        assert.equal(where.id, input.rechargeOrder?.id)
        Object.assign(input.rechargeOrder as StoredRecord, data)
        return { ...(input.rechargeOrder as StoredRecord) }
      },
    },
    paymentTransaction: {
      findFirst: makeFindFirst(records.paymentTransactions),
      create: async ({ data }: any) => {
        const duplicate = records.paymentTransactions.find((item) => (
          item.orderType === data.orderType
          && item.channel === data.channel
          && item.channelTransactionNo === data.channelTransactionNo
        ) || (
          data.idempotencyKey
          && item.orderType === data.orderType
          && item.orderNo === data.orderNo
          && item.idempotencyKey === data.idempotencyKey
        ))
        if (duplicate) {
          throw new Error('duplicate payment transaction')
        }
        const record = { id: next('pay'), ...data }
        records.paymentTransactions.push(record)
        return record
      },
    },
    benefitGrant: {
      findFirst: makeFindFirst(records.benefitGrants),
      create: async ({ data }: any) => {
        const duplicate = records.benefitGrants.find((item) => (
          item.orderType === data.orderType
          && item.orderNo === data.orderNo
          && item.grantType === data.grantType
        ))
        if (duplicate) {
          throw new Error('duplicate benefit grant')
        }
        const record = { id: next('grant'), ...data }
        records.benefitGrants.push(record)
        return record
      },
      update: async ({ where, data }: any) => {
        const record = records.benefitGrants.find((item) => item.id === where.id)
        if (!record) {
          throw new Error('benefit grant not found')
        }
        Object.assign(record, data)
        return record
      },
    },
    pointAccountLog: {
      findFirst: async (args?: any) => {
        const idempotencyKey = args?.where?.idempotencyKey
        if (idempotencyKey) {
          return records.pointLogs.find((item) => item.idempotencyKey === idempotencyKey) || null
        }
        const userId = args?.where?.userId
        const userLogs = records.pointLogs.filter((item) => item.userId === userId)
        if (userLogs.length) {
          return userLogs[userLogs.length - 1]
        }
        return input.pointBalance
          ? { balanceAfter: input.pointBalance }
          : null
      },
      create: async ({ data }: any) => {
        if (data.idempotencyKey && records.pointLogs.some((item) => item.idempotencyKey === data.idempotencyKey)) {
          throw new Error('duplicate point log')
        }
        const record = { id: next('point'), ...data }
        records.pointLogs.push(record)
        return record
      },
    },
    userSubscription: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      upsert: async ({ create, update }: any) => {
        const existing = records.subscriptions.find((item) => item.userId === create.userId && item.levelId === create.levelId)
        if (existing) {
          Object.assign(existing, update)
          return existing
        }
        const record = { id: next('sub'), ...create }
        records.subscriptions.push(record)
        return record
      },
    },
  }

  return { tx, records }
}

const membershipOrder = (status = 'PENDING') => ({
  id: 'order_membership_1',
  userId: 'user_1',
  levelId: 'level_pro',
  planId: 'plan_1',
  orderNo: 'VIP_TEST_1',
  sourceType: 'DIRECT_PURCHASE',
  status,
  totalAmount: 29.9,
  paidAmount: 0,
  bonusPoints: 80,
  plan: {
    durationUnit: 'MONTH',
    durationValue: 1,
  },
})

const rechargeOrder = (payStatus = 'PENDING') => ({
  id: 'order_recharge_1',
  userId: 'user_1',
  orderNo: 'RCH_TEST_1',
  payStatus,
  points: 100,
  bonusPoints: 20,
  totalAmount: 9.9,
  paidAmount: 0,
})

describe('commercial payment no-call closure', () => {
  it('creates membership and recharge orders as pending without local entitlement calls', () => {
    const service = readText('server/marketing-center/service.ts')
    const membershipBlock = service.slice(
      service.indexOf('export const createMembershipPurchaseOrder'),
      service.indexOf('export const createRechargePurchaseOrder'),
    )
    const rechargeBlock = service.slice(
      service.indexOf('export const createRechargePurchaseOrder'),
      service.indexOf('const confirmMembershipPaymentInTransaction'),
    )

    assert.match(membershipBlock, /status:\s*'PENDING'/)
    assert.match(membershipBlock, /paidAmount:\s*0/)
    assert.match(membershipBlock, /subscription:\s*null/)
    assert.match(membershipBlock, /willCallProvider:\s*false/)
    assert.doesNotMatch(membershipBlock, /activateMembership\(/)
    assert.doesNotMatch(membershipBlock, /appendPointLog\(/)

    assert.match(rechargeBlock, /payStatus:\s*'PENDING'/)
    assert.match(rechargeBlock, /paidAmount:\s*0/)
    assert.match(rechargeBlock, /willCallProvider:\s*false/)
    assert.doesNotMatch(rechargeBlock, /appendPointLog\(/)
  })

  it('rejects local payment simulation when disabled or in production', () => {
    process.env.NODE_ENV = 'development'
    process.env.ENABLE_LOCAL_PAYMENT_SIMULATION = 'false'
    assert.equal(__commercialPaymentTestHooks.isLocalPaymentSimulationEnabled(), false)

    process.env.NODE_ENV = 'production'
    process.env.ENABLE_LOCAL_PAYMENT_SIMULATION = 'true'
    assert.equal(__commercialPaymentTestHooks.isLocalPaymentSimulationEnabled(), false)

    process.env.NODE_ENV = 'development'
    process.env.ENABLE_LOCAL_PAYMENT_SIMULATION = 'true'
    assert.equal(__commercialPaymentTestHooks.isLocalPaymentSimulationEnabled(), true)
  })

  it('grants recharge points once and makes repeated confirmation idempotent', async () => {
    const { tx, records } = makeMockTx({ rechargeOrder: rechargeOrder() })

    const result = await __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(tx, 'user_1', {
      orderType: 'RECHARGE',
      orderNo: 'RCH_TEST_1',
      paidAmount: 9.9,
      idempotencyKey: 'idem_recharge_1',
      rawPayload: {
        provider: 'LOCAL',
        token: 'should-not-be-stored',
        nested: { signature: 'should-not-be-stored' },
      },
    })

    assert.equal(result.order.payStatus, 'BENEFIT_GRANTED')
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.benefitGrants.length, 1)
    assert.equal(records.pointLogs.length, 1)
    assert.equal(records.pointLogs[0].changeAmount, 120)
    assert.equal(records.pointLogs[0].idempotencyKey, 'POINT-RECHARGE-RCH_TEST_1')
    assert.equal(records.benefitGrants[0].paymentTransactionId, records.paymentTransactions[0].id)
    assert.equal(records.paymentTransactions[0].rawPayloadJson.token, '[REDACTED]')
    assert.equal(records.paymentTransactions[0].rawPayloadJson.nested.signature, '[REDACTED]')

    const repeated = await __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(tx, 'user_1', {
      orderType: 'RECHARGE',
      orderNo: 'RCH_TEST_1',
      paidAmount: 9.9,
      idempotencyKey: 'idem_recharge_1',
    })

    assert.equal(repeated.alreadyGranted, true)
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.benefitGrants.length, 1)
    assert.equal(records.pointLogs.length, 1)
  })

  it('grants membership and membership bonus points once', async () => {
    const { tx, records } = makeMockTx({ membershipOrder: membershipOrder() })

    const result = await __commercialPaymentTestHooks.confirmMembershipPaymentInTransaction(tx, 'user_1', {
      orderType: 'MEMBERSHIP',
      orderNo: 'VIP_TEST_1',
      paidAmount: 29.9,
      idempotencyKey: 'idem_membership_1',
    })

    assert.equal(result.order.status, 'BENEFIT_GRANTED')
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.subscriptions.length, 1)
    assert.equal(records.benefitGrants.length, 2)
    assert.equal(records.pointLogs.length, 1)
    assert.deepEqual(records.benefitGrants.map((item) => item.grantType).sort(), ['MEMBERSHIP', 'MEMBERSHIP_BONUS_POINTS'])
    assert.equal(records.pointLogs[0].idempotencyKey, 'POINT-MEMBERSHIP-BONUS-VIP_TEST_1')

    const repeated = await __commercialPaymentTestHooks.confirmMembershipPaymentInTransaction(tx, 'user_1', {
      orderType: 'MEMBERSHIP',
      orderNo: 'VIP_TEST_1',
      paidAmount: 29.9,
      idempotencyKey: 'idem_membership_1',
    })

    assert.equal(repeated.alreadyGranted, true)
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.subscriptions.length, 1)
    assert.equal(records.benefitGrants.length, 2)
    assert.equal(records.pointLogs.length, 1)
  })

  it('rejects forbidden order states, wrong users, missing orders, and amount mismatch', async () => {
    for (const status of ['FAILED', 'REFUNDING', 'PARTIAL_REFUNDED', 'CANCELED', 'CLOSED']) {
      const { tx, records } = makeMockTx({ rechargeOrder: rechargeOrder(status) })
      await assert.rejects(
        __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(tx, 'user_1', {
          orderType: 'RECHARGE',
          orderNo: 'RCH_TEST_1',
          paidAmount: 9.9,
        }),
      )
      assert.equal(records.paymentTransactions.length, 0)
      assert.equal(records.benefitGrants.length, 0)
      assert.equal(records.pointLogs.length, 0)
    }

    const wrongUser = makeMockTx({ rechargeOrder: rechargeOrder() })
    await assert.rejects(
      __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(wrongUser.tx, 'user_2', {
        orderType: 'RECHARGE',
        orderNo: 'RCH_TEST_1',
        paidAmount: 9.9,
      }),
    )
    assert.equal(wrongUser.records.paymentTransactions.length, 0)

    const missing = makeMockTx({})
    await assert.rejects(
      __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(missing.tx, 'user_1', {
        orderType: 'RECHARGE',
        orderNo: 'RCH_TEST_404',
        paidAmount: 9.9,
      }),
    )
    assert.equal(missing.records.paymentTransactions.length, 0)

    const mismatch = makeMockTx({ rechargeOrder: rechargeOrder() })
    await assert.rejects(
      __commercialPaymentTestHooks.confirmRechargePaymentInTransaction(mismatch.tx, 'user_1', {
        orderType: 'RECHARGE',
        orderNo: 'RCH_TEST_1',
        paidAmount: 8.8,
        idempotencyKey: 'bad_amount',
      }),
    )
    assert.equal(mismatch.records.paymentTransactions.length, 1)
    assert.equal(mismatch.records.paymentTransactions[0].status, 'REJECTED')
    assert.equal(mismatch.records.benefitGrants.length, 0)
    assert.equal(mismatch.records.pointLogs.length, 0)
  })

  it('keeps redis lock, database constraints, and frontend no-call guardrails in place', () => {
    const service = readText('server/marketing-center/service.ts')
    const redisLock = readText('server/redis/lock.ts')
    const schema = readText('prisma/schema.prisma')
    const migration = readText('prisma/migrations/202607030001_commercial_payment_closure/migration.sql')
    const frontendApi = readText('src/api/marketing-center.ts')
    const frontendStore = readText('src/stores/marketing-center.ts')

    assert.match(service, /acquireRedisLock\(redisKeys\.commercialOrderLock\(orderType,\s*orderNo\),\s*REDIS_CONFIG\.taskLockTtlMs\)/)
    assert.match(service, /isRedisEnabled\(\)\s*&&\s*!lock/)
    assert.match(service, /releaseRedisLock\(lock\)/)
    assert.match(redisLock, /'PX'/)
    assert.match(redisLock, /ARGV\[1\]/)
    assert.match(redisLock, /redis\.call\("get", KEYS\[1\]\) == ARGV\[1\]/)

    assert.match(schema, /@@unique\(\[orderType,\s*channel,\s*channelTransactionNo\]/)
    assert.match(schema, /@@unique\(\[orderType,\s*orderNo,\s*idempotencyKey\]/)
    assert.match(schema, /@@unique\(\[orderType,\s*orderNo,\s*grantType\]/)
    assert.match(schema, /idempotencyKey\s+String\?\s+@unique/)
    assert.match(schema, /paymentTransactionId\s+String\?/)
    assert.match(migration, /uk_point_account_logs_idempotency_key/)
    assert.match(migration, /fk_benefit_grants_payment_transaction/)

    assert.match(frontendApi, /export const confirmMarketingLocalPayment/)
    assert.doesNotMatch(frontendStore, /confirmMarketingLocalPayment/)
    assert.doesNotMatch(frontendStore, /payment-confirm-local/)
  })
})
