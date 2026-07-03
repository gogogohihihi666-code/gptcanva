import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockPaymentProvider, MOCK_PAYMENT_VALID_SIGNATURE } from '../../server/marketing-center/payment/mock-payment-provider'
import { __paymentProviderRegistryTestHooks, resolvePaymentProvider } from '../../server/marketing-center/payment/provider-registry'
import { __commercialPaymentTestHooks } from '../../server/marketing-center/service'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
})

type StoredRecord = Record<string, any>

const makeFindFirst = (items: StoredRecord[]) => async (args?: any) => {
  const where = args?.where || {}
  return items.find((item) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).every(([nestedKey, nestedValue]) => item[key]?.[nestedKey] === nestedValue)
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
        if (!input.membershipOrder || input.membershipOrder.orderNo !== where.orderNo) return null
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
        if (!input.rechargeOrder || input.rechargeOrder.orderNo !== where.orderNo) return null
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
        ) || (
          data.providerPaymentId
          && item.provider === data.provider
          && item.providerPaymentId === data.providerPaymentId
        ) || (
          data.providerTransactionId
          && item.provider === data.provider
          && item.providerTransactionId === data.providerTransactionId
        ))
        if (duplicate) throw new Error('duplicate payment transaction')
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
        if (duplicate) throw new Error('duplicate benefit grant')
        const record = { id: next('grant'), ...data }
        records.benefitGrants.push(record)
        return record
      },
      update: async ({ where, data }: any) => {
        const record = records.benefitGrants.find((item) => item.id === where.id)
        if (!record) throw new Error('benefit grant not found')
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
        if (userLogs.length) return userLogs[userLogs.length - 1]
        return input.pointBalance ? { balanceAfter: input.pointBalance } : null
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

const membershipOrder = (status = 'PAYING') => ({
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
  plan: { durationUnit: 'MONTH', durationValue: 1 },
})

const rechargeOrder = (payStatus = 'PAYING') => ({
  id: 'order_recharge_1',
  userId: 'user_1',
  orderNo: 'RCH_TEST_1',
  payStatus,
  points: 100,
  bonusPoints: 20,
  totalAmount: 9.9,
  paidAmount: 0,
})

const paidWebhookEvent = (overrides: Partial<Record<string, any>> = {}) => ({
  provider: 'MOCK',
  providerPaymentId: 'MOCK_PAY_RECHARGE_RCH_TEST_1',
  providerTransactionId: 'MOCK_TX_1',
  orderId: 'order_recharge_1',
  orderNo: 'RCH_TEST_1',
  orderType: 'RECHARGE',
  userId: 'user_1',
  amount: 9.9,
  currency: 'CNY',
  status: 'PAID',
  paidAt: new Date('2026-07-03T00:00:00.000Z'),
  rawPayloadJson: {
    token: 'already-redacted-by-provider',
  },
  idempotencyKey: 'WEBHOOK-MOCK-MOCK_TX_1',
  ...overrides,
})

describe('payment provider adapter no-call', () => {
  it('mock provider creates a no-call payment intent with redacted raw payload', async () => {
    const provider = createMockPaymentProvider()
    const intent = await provider.createPaymentIntent({
      orderId: 'order_recharge_1',
      orderType: 'RECHARGE',
      orderNo: 'RCH_TEST_1',
      userId: 'user_1',
      amount: 9.9,
      currency: 'CNY',
      subject: 'Recharge order RCH_TEST_1',
      paymentChannel: 'MOCK',
    })

    assert.equal(intent.provider, 'MOCK')
    assert.equal(intent.willCallExternal, false)
    assert.match(intent.paymentUrl || '', /^mock:\/\/payment\//)
    assert.match(intent.qrCodePayload || '', /^mock-payment:/)
    assert.equal((intent.rawPayloadJson as any).token, '[REDACTED]')
  })

  it('production disables mock provider as a real provider substitute', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(__paymentProviderRegistryTestHooks.isMockProviderAllowed(), false)
    assert.throws(() => resolvePaymentProvider('MOCK'), /disabled in production/)
  })

  it('creates payment intent and moves recharge order to PAYING without duplicate transactions', async () => {
    process.env.NODE_ENV = 'development'
    const { tx, records } = makeMockTx({ rechargeOrder: rechargeOrder('PENDING') })

    const first = await __commercialPaymentTestHooks.createPaymentIntentInTransaction(tx, 'user_1', {
      orderType: 'RECHARGE',
      orderNo: 'RCH_TEST_1',
      provider: 'MOCK',
      paymentChannel: 'MOCK',
    })
    const second = await __commercialPaymentTestHooks.createPaymentIntentInTransaction(tx, 'user_1', {
      orderType: 'RECHARGE',
      orderNo: 'RCH_TEST_1',
      provider: 'MOCK',
      paymentChannel: 'MOCK',
    })

    assert.equal(first.order.payStatus, 'PAYING')
    assert.equal(second.order.payStatus, 'PAYING')
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.paymentTransactions[0].status, 'INTENT_CREATED')
    assert.equal(records.paymentTransactions[0].provider, 'MOCK')
    assert.equal(records.paymentTransactions[0].providerPaymentId, 'MOCK_PAY_RECHARGE_RCH_TEST_1')
    assert.equal(records.benefitGrants.length, 0)
    assert.equal(records.pointLogs.length, 0)
  })

  it('mock webhook signature failure never reaches entitlement issuance', async () => {
    const provider = createMockPaymentProvider()
    const verified = await provider.verifyWebhookSignature({
      headers: {},
      rawBody: '{}',
      parsedBody: { mockSignature: 'bad-signature' },
    })
    assert.equal(verified, false)
  })

  it('mock webhook parser redacts sensitive raw payload fields', async () => {
    const provider = createMockPaymentProvider()
    const event = await provider.parseWebhookEvent({
      headers: { 'x-mock-payment-signature': MOCK_PAYMENT_VALID_SIGNATURE },
      rawBody: '{}',
      parsedBody: {
        mockSignature: MOCK_PAYMENT_VALID_SIGNATURE,
        providerPaymentId: 'MOCK_PAY_RECHARGE_RCH_TEST_1',
        providerTransactionId: 'MOCK_TX_1',
        orderId: 'order_recharge_1',
        orderNo: 'RCH_TEST_1',
        orderType: 'RECHARGE',
        amount: 9.9,
        token: 'sample-token',
        password: 'sample-password',
        cookie: 'sample-cookie',
        authorization: 'Bearer sample',
        apiKey: 'sample-api-key',
        nested: { signature: 'sample-signature' },
      },
    })

    assert.equal((event.rawPayloadJson as any).mockSignature, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).token, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).password, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).cookie, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).authorization, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).apiKey, '[REDACTED]')
    assert.equal((event.rawPayloadJson as any).nested.signature, '[REDACTED]')
  })

  it('rejects missing orders and amount mismatch without granting benefits', async () => {
    const missing = makeMockTx({})
    await assert.rejects(
      __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(missing.tx, paidWebhookEvent()),
      /order not found/,
    )
    assert.equal(missing.records.paymentTransactions.length, 0)
    assert.equal(missing.records.benefitGrants.length, 0)
    assert.equal(missing.records.pointLogs.length, 0)

    const mismatch = makeMockTx({ rechargeOrder: rechargeOrder() })
    await assert.rejects(
      __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(mismatch.tx, paidWebhookEvent({ amount: 8.8 })),
      /支付金额/,
    )
    assert.equal(mismatch.records.paymentTransactions.length, 1)
    assert.equal(mismatch.records.paymentTransactions[0].status, 'REJECTED')
    assert.equal(mismatch.records.benefitGrants.length, 0)
    assert.equal(mismatch.records.pointLogs.length, 0)
  })

  it('successful recharge webhook grants points once and repeated webhook is idempotent', async () => {
    const { tx, records } = makeMockTx({ rechargeOrder: rechargeOrder() })

    const first = await __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(tx, paidWebhookEvent())
    const second = await __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(tx, paidWebhookEvent())

    assert.equal(first.order.payStatus, 'BENEFIT_GRANTED')
    assert.equal(second.alreadyGranted, true)
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.benefitGrants.length, 1)
    assert.equal(records.pointLogs.length, 1)
    assert.equal(records.paymentTransactions[0].providerTransactionId, 'MOCK_TX_1')
    assert.equal(records.pointLogs[0].changeAmount, 120)
  })

  it('successful membership webhook grants membership and bonus points once', async () => {
    const { tx, records } = makeMockTx({ membershipOrder: membershipOrder() })
    const event = paidWebhookEvent({
      providerPaymentId: 'MOCK_PAY_MEMBERSHIP_VIP_TEST_1',
      providerTransactionId: 'MOCK_TX_MEMBER_1',
      orderId: 'order_membership_1',
      orderNo: 'VIP_TEST_1',
      orderType: 'MEMBERSHIP',
      amount: 29.9,
      idempotencyKey: 'WEBHOOK-MOCK-MOCK_TX_MEMBER_1',
    })

    const first = await __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(tx, event)
    const second = await __commercialPaymentTestHooks.processPaymentWebhookEventInTransaction(tx, event)

    assert.equal(first.order.status, 'BENEFIT_GRANTED')
    assert.equal(second.alreadyGranted, true)
    assert.equal(records.paymentTransactions.length, 1)
    assert.equal(records.subscriptions.length, 1)
    assert.equal(records.benefitGrants.length, 2)
    assert.equal(records.pointLogs.length, 1)
    assert.deepEqual(records.benefitGrants.map((item) => item.grantType).sort(), ['MEMBERSHIP', 'MEMBERSHIP_BONUS_POINTS'])
  })

  it('keeps provider adapter routes and frontend no-auto-call guardrails in place', () => {
    const constants = readText('server/marketing-center/constants.ts')
    const handler = readText('server/marketing-center/request-handler.ts')
    const store = readText('src/stores/marketing-center.ts')
    const schema = readText('prisma/schema.prisma')

    assert.match(constants, /MARKETING_CENTER_PAYMENT_INTENT_PATH/)
    assert.match(constants, /MARKETING_CENTER_PAYMENT_WEBHOOK_MOCK_PATH/)
    assert.match(handler, /handleMarketingPaymentWebhook/)
    assert.match(handler, /createMarketingPaymentIntent/)
    assert.match(schema, /providerPaymentId/)
    assert.match(schema, /providerTransactionId/)
    assert.match(schema, /INTENT_CREATED/)
    assert.doesNotMatch(store, /createMarketingPaymentIntent/)
    assert.doesNotMatch(store, /payment-intents/)
  })
})
