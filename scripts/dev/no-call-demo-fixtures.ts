import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const DEMO_FIXTURE_GATE_ENV = 'OKPICAI_ALLOW_LOCAL_DEMO_FIXTURES'
export const DEMO_FIXTURE_MARKER = 'local-no-call-demo-fixture'
export const DEMO_USER_EMAIL = 'demo-user@example.local'

type FixtureEnv = Record<string, string | undefined>
type FixtureMode = 'seed' | 'clean'

type DemoFixtureExternalHooks = {
  callProvider?: () => unknown
  callPayment?: () => unknown
  uploadStorage?: () => unknown
}

type DemoFixtureStore = {
  seedDataset: (dataset: NoCallDemoFixtureDataset) => Promise<{ createdTotal: number; updatedTotal: number }>
  cleanDataset: (dataset: NoCallDemoFixtureDataset) => Promise<{ removedTotal: number; preservedNonDemoRecords: boolean }>
}

type DemoSummary = {
  mode: FixtureMode
  marker: string
  createdTotal: number
  updatedTotal: number
  removedTotal: number
  preservedNonDemoRecords: boolean
  willCallProvider: false
  willCallPayment: false
  willUploadStorage: false
  affectedRealAdminUser: false
}

export type NoCallDemoFixtureDataset = ReturnType<typeof buildNoCallDemoFixtureDataset>

const demoMeta = (kind: string, extra: Record<string, unknown> = {}) => ({
  demo: true,
  noCall: true,
  localFixture: true,
  fixtureMarker: DEMO_FIXTURE_MARKER,
  kind,
  ...extra,
})

const daysAgo = (now: Date, days: number) => {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return date
}

const addDays = (now: Date, days: number) => {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  return date
}

const buildFixtureId = (suffix: string) => `demo-${suffix}`
const buildDemoOrderNo = (suffix: string) => `DEMO-NOCALL-${suffix}`
const buildDemoAccountNo = (suffix: string) => `DEMO-PTS-${suffix}`

export const assertCanRunNoCallDemoFixtures = (env: FixtureEnv = process.env) => {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase()
  if (nodeEnv === 'production') {
    throw new Error('No-call demo fixtures refuses to run in production.')
  }

  if (String(env[DEMO_FIXTURE_GATE_ENV] || '').trim() !== '1') {
    throw new Error(`No-call demo fixtures requires ${DEMO_FIXTURE_GATE_ENV}=1.`)
  }
}

export const buildNoCallDemoFixtureDataset = (now = new Date()) => {
  const userId = buildFixtureId('user-local-fixture')
  const levelId = buildFixtureId('membership-level')
  const planId = buildFixtureId('membership-plan')
  const packageId = buildFixtureId('recharge-package')
  const subscriptionId = buildFixtureId('subscription')
  const sessionId = buildFixtureId('generation-session')

  const membershipOrders = [
    {
      id: buildFixtureId('membership-pending'),
      orderNo: buildDemoOrderNo('MEM-PENDING'),
      status: 'PENDING',
      totalAmount: '29.00',
      paidAmount: '0.00',
      paidAt: null as Date | null,
      bonusPoints: 100,
      createdAt: daysAgo(now, 0),
      metaJson: demoMeta('membership-order', { scenario: 'pending-membership-order' }),
    },
    {
      id: buildFixtureId('membership-granted'),
      orderNo: buildDemoOrderNo('MEM-GRANTED'),
      status: 'BENEFIT_GRANTED',
      totalAmount: '99.00',
      paidAmount: '99.00',
      paidAt: daysAgo(now, 1),
      bonusPoints: 600,
      createdAt: daysAgo(now, 1),
      metaJson: demoMeta('membership-order', { scenario: 'benefit-granted-membership-order' }),
    },
    {
      id: buildFixtureId('membership-failed'),
      orderNo: buildDemoOrderNo('MEM-FAILED'),
      status: 'FAILED',
      totalAmount: '49.00',
      paidAmount: '0.00',
      paidAt: null as Date | null,
      bonusPoints: 200,
      createdAt: daysAgo(now, 2),
      metaJson: demoMeta('membership-order', { scenario: 'failed-membership-order' }),
    },
    {
      id: buildFixtureId('membership-paid-no-benefit'),
      orderNo: buildDemoOrderNo('MEM-PAID-NO-BENEFIT'),
      status: 'PAID',
      totalAmount: '199.00',
      paidAmount: '199.00',
      paidAt: daysAgo(now, 3),
      bonusPoints: 1200,
      createdAt: daysAgo(now, 3),
      metaJson: demoMeta('membership-order', { scenario: 'paid-without-benefit-risk' }),
    },
  ]

  const rechargeOrders = [
    {
      id: buildFixtureId('recharge-paying'),
      orderNo: buildDemoOrderNo('RCH-PAYING'),
      payStatus: 'PAYING',
      refundStatus: 'NONE',
      points: 1000,
      bonusPoints: 100,
      totalAmount: '19.90',
      paidAmount: '0.00',
      paidAt: null as Date | null,
      createdAt: daysAgo(now, 0),
      metaJson: demoMeta('recharge-order', { scenario: 'paying-recharge-order' }),
    },
    {
      id: buildFixtureId('recharge-paid-no-benefit'),
      orderNo: buildDemoOrderNo('RCH-PAID-NO-BENEFIT'),
      payStatus: 'PAID',
      refundStatus: 'PROCESSING',
      points: 3000,
      bonusPoints: 500,
      totalAmount: '59.90',
      paidAmount: '59.90',
      paidAt: daysAgo(now, 1),
      createdAt: daysAgo(now, 1),
      metaJson: demoMeta('recharge-order', { scenario: 'paid-recharge-pending-grant-risk' }),
    },
    {
      id: buildFixtureId('recharge-failed'),
      orderNo: buildDemoOrderNo('RCH-FAILED'),
      payStatus: 'FAILED',
      refundStatus: 'FAILED',
      points: 5000,
      bonusPoints: 1000,
      totalAmount: '99.90',
      paidAmount: '0.00',
      paidAt: null as Date | null,
      createdAt: daysAgo(now, 2),
      metaJson: demoMeta('recharge-order', { scenario: 'failed-recharge-order' }),
    },
  ]

  const generationRecords = [
    {
      id: buildFixtureId('generation-completed'),
      status: 'COMPLETED',
      type: 'IMAGE',
      prompt: 'local no-call demo completed image',
      content: 'Completed demo output without Provider call.',
      errorMessage: null as string | null,
      modelLabel: 'Demo Local Model',
      modelKey: 'demo-local-model',
      createdAt: daysAgo(now, 0),
      metaJson: demoMeta('generation-record', { scenario: 'completed-task' }),
    },
    {
      id: buildFixtureId('generation-failed-refunded'),
      status: 'FAILED',
      type: 'IMAGE',
      prompt: 'local no-call demo failed image with refund',
      content: null as string | null,
      errorMessage: 'Demo no-call Provider blocked before external request.',
      modelLabel: 'Demo Local Model',
      modelKey: 'demo-local-model',
      createdAt: daysAgo(now, 1),
      metaJson: demoMeta('generation-record', { scenario: 'failed-task-refunded', generationErrorMessage: 'Demo blocked before Provider call' }),
    },
    {
      id: buildFixtureId('generation-failed-pending-refund'),
      status: 'FAILED',
      type: 'IMAGE',
      prompt: 'local no-call demo failed image pending refund',
      content: null as string | null,
      errorMessage: 'Demo failed task awaiting point compensation.',
      modelLabel: 'Demo Local Model',
      modelKey: 'demo-local-model',
      createdAt: daysAgo(now, 2),
      metaJson: demoMeta('generation-record', { scenario: 'failed-task-pending-refund', generationErrorMessage: 'Demo pending compensation' }),
    },
    {
      id: buildFixtureId('generation-stopped'),
      status: 'STOPPED',
      type: 'VIDEO',
      prompt: 'local no-call demo stopped video',
      content: null as string | null,
      errorMessage: 'Demo task stopped by no-call preflight.',
      modelLabel: 'Demo Local Video Model',
      modelKey: 'demo-local-video-model',
      createdAt: daysAgo(now, 3),
      metaJson: demoMeta('generation-record', { scenario: 'stopped-task' }),
    },
    {
      id: buildFixtureId('generation-running'),
      status: 'RUNNING',
      type: 'IMAGE',
      prompt: 'local no-call demo running placeholder',
      content: null as string | null,
      errorMessage: null as string | null,
      modelLabel: 'Demo Local Model',
      modelKey: 'demo-local-model',
      createdAt: daysAgo(now, 4),
      metaJson: demoMeta('generation-record', { scenario: 'running-task-placeholder' }),
    },
  ]

  const pointLogs = [
    {
      id: buildFixtureId('points-consume-refunded'),
      accountNo: buildDemoAccountNo('CONSUME-REFUNDED'),
      idempotencyKey: 'demo-fixture-points-consume-refunded',
      changeType: 'CONSUME',
      action: 'DECREASE',
      changeAmount: -80,
      balanceAfter: 920,
      availableAmount: 0,
      sourceType: 'GENERATION_CONSUME',
      sourceId: generationRecords[1].id,
      associationNo: 'DEMO-GEN-REFUNDED',
      remark: 'demo no-call generation consume',
      metaJson: demoMeta('point-log', { generationRecordId: generationRecords[1].id, endpointType: 'image', providerId: 'demo-provider', modelKey: 'demo-local-model', modelName: 'Demo Local Model' }),
      createdAt: daysAgo(now, 1),
    },
    {
      id: buildFixtureId('points-refund'),
      accountNo: buildDemoAccountNo('REFUND'),
      idempotencyKey: 'demo-fixture-points-refund',
      changeType: 'REFUND',
      action: 'INCREASE',
      changeAmount: 80,
      balanceAfter: 1000,
      availableAmount: 80,
      sourceType: 'GENERATION_CONSUME',
      sourceId: generationRecords[1].id,
      associationNo: 'DEMO-GEN-REFUNDED',
      remark: 'demo no-call generation refund',
      metaJson: demoMeta('point-log', { generationRecordId: generationRecords[1].id, endpointType: 'image', providerId: 'demo-provider', modelKey: 'demo-local-model', modelName: 'Demo Local Model' }),
      createdAt: daysAgo(now, 1),
    },
    {
      id: buildFixtureId('points-consume-pending-refund'),
      accountNo: buildDemoAccountNo('CONSUME-PENDING'),
      idempotencyKey: 'demo-fixture-points-consume-pending-refund',
      changeType: 'CONSUME',
      action: 'DECREASE',
      changeAmount: -120,
      balanceAfter: 880,
      availableAmount: 0,
      sourceType: 'GENERATION_CONSUME',
      sourceId: generationRecords[2].id,
      associationNo: 'DEMO-GEN-PENDING-REFUND',
      remark: 'demo no-call pending refund',
      metaJson: demoMeta('point-log', { generationRecordId: generationRecords[2].id, endpointType: 'image', providerId: 'demo-provider', modelKey: 'demo-local-model', modelName: 'Demo Local Model' }),
      createdAt: daysAgo(now, 2),
    },
    {
      id: buildFixtureId('points-admin-increase'),
      accountNo: buildDemoAccountNo('ADMIN-INCREASE'),
      idempotencyKey: 'demo-fixture-points-admin-increase',
      changeType: 'ADJUST',
      action: 'INCREASE',
      changeAmount: 300,
      balanceAfter: 1300,
      availableAmount: 300,
      sourceType: 'ADMIN_ADJUST',
      sourceId: 'DEMO-ADMIN-ADJUST-INCREASE',
      associationNo: 'DEMO-ADMIN-ADJUST-INCREASE',
      remark: 'demo manual point increase',
      metaJson: demoMeta('point-log', { auditReason: 'demo local fixture manual increase' }),
      createdAt: daysAgo(now, 1),
    },
    {
      id: buildFixtureId('points-admin-decrease'),
      accountNo: buildDemoAccountNo('ADMIN-DECREASE'),
      idempotencyKey: 'demo-fixture-points-admin-decrease',
      changeType: 'ADJUST',
      action: 'DECREASE',
      changeAmount: -50,
      balanceAfter: 1250,
      availableAmount: 0,
      sourceType: 'ADMIN_ADJUST',
      sourceId: 'DEMO-ADMIN-ADJUST-DECREASE',
      associationNo: 'DEMO-ADMIN-ADJUST-DECREASE',
      remark: 'demo manual point decrease',
      metaJson: demoMeta('point-log', { auditReason: 'demo local fixture manual decrease' }),
      createdAt: daysAgo(now, 0),
    },
  ]

  const paymentTransactions = [
    ...membershipOrders.slice(1).map((order, index) => ({
      id: buildFixtureId(`payment-membership-${index + 1}`),
      orderType: 'MEMBERSHIP',
      orderNo: order.orderNo,
      provider: 'LOCAL_DEMO',
      providerPaymentId: `demo-pay-${order.orderNo}`,
      providerTransactionId: `demo-txn-${order.orderNo}`,
      channel: 'MANUAL',
      channelTransactionNo: `demo-channel-${order.orderNo}`,
      idempotencyKey: `demo-idem-${order.orderNo}`,
      status: order.status === 'FAILED' ? 'REJECTED' : 'VERIFIED',
      expectedAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      paidAt: order.paidAt,
      verifiedAt: order.paidAt,
      failureReason: order.status === 'FAILED' ? 'demo local payment failure' : null,
    })),
    ...rechargeOrders.map((order, index) => ({
      id: buildFixtureId(`payment-recharge-${index + 1}`),
      orderType: 'RECHARGE',
      orderNo: order.orderNo,
      provider: 'LOCAL_DEMO',
      providerPaymentId: `demo-pay-${order.orderNo}`,
      providerTransactionId: `demo-txn-${order.orderNo}`,
      channel: 'MANUAL',
      channelTransactionNo: `demo-channel-${order.orderNo}`,
      idempotencyKey: `demo-idem-${order.orderNo}`,
      status: order.payStatus === 'FAILED' ? 'REJECTED' : order.payStatus === 'PAYING' ? 'INTENT_CREATED' : 'VERIFIED',
      expectedAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      paidAt: order.paidAt,
      verifiedAt: order.paidAt,
      failureReason: order.payStatus === 'FAILED' ? 'demo local payment failure' : null,
    })),
  ]

  const benefitGrants = [
    {
      id: buildFixtureId('benefit-membership-success'),
      orderType: 'MEMBERSHIP',
      orderNo: membershipOrders[1].orderNo,
      grantType: 'MEMBERSHIP',
      status: 'SUCCESS',
      amount: 1,
      reason: 'demo no-call membership granted',
      grantedAt: daysAgo(now, 1),
      metaJson: demoMeta('benefit-grant', { scenario: 'membership-granted' }),
    },
    {
      id: buildFixtureId('benefit-recharge-pending'),
      orderType: 'RECHARGE',
      orderNo: rechargeOrders[1].orderNo,
      grantType: 'POINTS',
      status: 'PENDING',
      amount: rechargeOrders[1].points + rechargeOrders[1].bonusPoints,
      reason: 'demo paid recharge awaiting benefit grant',
      grantedAt: null as Date | null,
      metaJson: demoMeta('benefit-grant', { scenario: 'paid-without-points-grant' }),
    },
  ]

  const auditLogs = [
    {
      id: buildFixtureId('audit-provider-blocked'),
      action: 'admin_provider_no_call_blocked',
      targetType: 'ai_provider',
      targetId: 'demo-provider',
      beforeJson: demoMeta('audit-before', { providerCode: 'demo-provider', willCallExternal: false }),
      afterJson: demoMeta('audit-after', { blocked: true, reason: 'no-call gate closed' }),
      createdAt: daysAgo(now, 0),
    },
    {
      id: buildFixtureId('audit-storage-blocked'),
      action: 'admin_storage_config_test_blocked',
      targetType: 'object_storage_config',
      targetId: 'demo-storage',
      beforeJson: demoMeta('audit-before', { storageProvider: 'S3_COMPATIBLE', willUploadStorage: false }),
      afterJson: demoMeta('audit-after', { blocked: true, reason: 'no-call gate closed' }),
      createdAt: daysAgo(now, 1),
    },
    {
      id: buildFixtureId('audit-points-adjust'),
      action: 'admin_user_points_adjust',
      targetType: 'point_account_log',
      targetId: pointLogs[3].id,
      beforeJson: demoMeta('audit-before', { request: { action: 'INCREASE', changeAmount: 300, remark: 'demo fixture' } }),
      afterJson: demoMeta('audit-after', { pointLogId: pointLogs[3].id }),
      createdAt: daysAgo(now, 1),
    },
    {
      id: buildFixtureId('audit-generation-failed'),
      action: 'admin_generation_points_compensate',
      targetType: 'generation_record',
      targetId: generationRecords[2].id,
      beforeJson: demoMeta('audit-before', { generationRecordId: generationRecords[2].id, refundStatus: 'PENDING_REFUND' }),
      afterJson: demoMeta('audit-after', { reviewed: true, noCall: true }),
      createdAt: daysAgo(now, 2),
    },
  ]

  return {
    marker: DEMO_FIXTURE_MARKER,
    user: {
      id: userId,
      email: DEMO_USER_EMAIL,
      username: 'demo_local_fixture_user',
      name: 'Demo No-call User',
      role: 'USER',
      status: 'ACTIVE',
    },
    membershipLevel: {
      id: levelId,
      name: 'Demo Local Member',
      level: 99001,
      description: 'Local no-call demo membership level',
      monthlyBonusPoints: 600,
      storageCapacity: 0,
      benefitsJson: demoMeta('membership-level'),
    },
    membershipPlan: {
      id: planId,
      name: 'Demo Monthly Plan',
      label: 'Local demo',
      durationType: 'MONTH',
      durationValue: 1,
      durationUnit: 'month',
      salesPrice: '29.00',
      originalPrice: '59.00',
      bonusPoints: 600,
      benefitsJson: demoMeta('membership-plan'),
    },
    userSubscription: {
      id: subscriptionId,
      status: 'ACTIVE',
      startTime: daysAgo(now, 1),
      endTime: addDays(now, 29),
    },
    rechargePackage: {
      id: packageId,
      name: 'Demo Local Points Pack',
      label: 'local fixture',
      description: 'Local no-call demo points package',
      points: 3000,
      bonusPoints: 500,
      price: '59.90',
      originalPrice: '99.90',
      badgeText: 'DEMO',
      metaJson: demoMeta('recharge-package'),
    },
    generationSession: {
      id: sessionId,
      title: 'Local no-call demo generation session',
      isDefault: false,
      lastRecordAt: now,
    },
    membershipOrders,
    rechargeOrders,
    paymentTransactions,
    benefitGrants,
    generationRecords,
    generationOutputs: [
      {
        id: buildFixtureId('generation-output-completed'),
        generationRecordId: generationRecords[0].id,
        outputType: 'IMAGE',
        url: '/demo/no-call/local-placeholder-image.png',
        textContent: null as string | null,
        mimeType: 'image/png',
        width: 1024,
        height: 1024,
        sortOrder: 0,
        metaJson: demoMeta('generation-output', { placeholderOnly: true }),
      },
    ],
    assets: [
      {
        id: buildFixtureId('asset-completed'),
        generationRecordId: generationRecords[0].id,
        generationOutputId: buildFixtureId('generation-output-completed'),
        assetType: 'IMAGE',
        title: 'Demo no-call placeholder asset',
        description: 'Local fixture asset, no storage upload.',
        coverUrl: '/demo/no-call/local-placeholder-image.png',
        fileUrl: '/demo/no-call/local-placeholder-image.png',
        thumbnailUrl: '/demo/no-call/local-placeholder-image.png',
        width: 1024,
        height: 1024,
        promptText: generationRecords[0].prompt,
        modelLabel: generationRecords[0].modelLabel,
        aspectRatio: '1:1',
        sourceMetaJson: demoMeta('asset', { placeholderOnly: true }),
      },
    ],
    pointLogs,
    auditLogs,
  }
}

const emptySummary = (mode: FixtureMode): DemoSummary => ({
  mode,
  marker: DEMO_FIXTURE_MARKER,
  createdTotal: 0,
  updatedTotal: 0,
  removedTotal: 0,
  preservedNonDemoRecords: true,
  willCallProvider: false,
  willCallPayment: false,
  willUploadStorage: false,
  affectedRealAdminUser: false,
})

export const seedNoCallDemoFixtures = async (input: {
  env?: FixtureEnv
  store: DemoFixtureStore
  externalHooks?: DemoFixtureExternalHooks
  now?: Date
}): Promise<DemoSummary> => {
  assertCanRunNoCallDemoFixtures(input.env || process.env)
  const dataset = buildNoCallDemoFixtureDataset(input.now || new Date())
  const result = await input.store.seedDataset(dataset)
  return {
    ...emptySummary('seed'),
    createdTotal: result.createdTotal,
    updatedTotal: result.updatedTotal,
  }
}

export const cleanNoCallDemoFixtures = async (input: {
  env?: FixtureEnv
  store: DemoFixtureStore
  now?: Date
}): Promise<DemoSummary> => {
  assertCanRunNoCallDemoFixtures(input.env || process.env)
  const dataset = buildNoCallDemoFixtureDataset(input.now || new Date())
  const result = await input.store.cleanDataset(dataset)
  return {
    ...emptySummary('clean'),
    removedTotal: result.removedTotal,
    preservedNonDemoRecords: result.preservedNonDemoRecords,
  }
}

const createInMemoryStore = () => {
  const tables = new Map<string, Map<string, Record<string, unknown>>>()
  const kinds = [
    'users',
    'membershipOrders',
    'rechargeOrders',
    'paymentTransactions',
    'benefitGrants',
    'generationRecords',
    'generationOutputs',
    'assets',
    'pointLogs',
    'auditLogs',
    'membershipLevels',
    'membershipPlans',
    'userSubscriptions',
    'rechargePackages',
    'generationSessions',
  ]
  for (const kind of kinds) tables.set(kind, new Map())

  const upsert = (kind: string, id: string, value: Record<string, unknown>) => {
    const table = tables.get(kind)
    if (!table) throw new Error(`Unknown table ${kind}`)
    const existed = table.has(id)
    table.set(id, { ...value, id, marker: DEMO_FIXTURE_MARKER })
    return existed ? 'updated' : 'created'
  }

  const removeMarked = (kind: string, ids: string[]) => {
    const table = tables.get(kind)
    if (!table) throw new Error(`Unknown table ${kind}`)
    let removed = 0
    for (const id of ids) {
      const item = table.get(id)
      if (item?.marker === DEMO_FIXTURE_MARKER) {
        table.delete(id)
        removed += 1
      }
    }
    return removed
  }

  const store = {
    insertNonDemoSentinel() {
      tables.get('users')?.set('real-user', { id: 'real-user', email: 'real-user@example.test', marker: 'real' })
    },
    hasNonDemoSentinel() {
      return tables.get('users')?.has('real-user') || false
    },
    countByKind() {
      return {
        users: tables.get('users')?.size || 0,
        membershipOrders: tables.get('membershipOrders')?.size || 0,
        rechargeOrders: tables.get('rechargeOrders')?.size || 0,
        generationRecords: tables.get('generationRecords')?.size || 0,
        pointLogs: tables.get('pointLogs')?.size || 0,
        auditLogs: tables.get('auditLogs')?.size || 0,
      }
    },
    countMarkedDemoRecords() {
      let count = 0
      for (const table of tables.values()) {
        for (const item of table.values()) {
          if (item.marker === DEMO_FIXTURE_MARKER) count += 1
        }
      }
      return count
    },
    async seedDataset(dataset: NoCallDemoFixtureDataset) {
      let createdTotal = 0
      let updatedTotal = 0
      const track = (result: string) => {
        if (result === 'created') createdTotal += 1
        else updatedTotal += 1
      }

      track(upsert('users', dataset.user.id, dataset.user))
      track(upsert('membershipLevels', dataset.membershipLevel.id, dataset.membershipLevel as unknown as Record<string, unknown>))
      track(upsert('membershipPlans', dataset.membershipPlan.id, dataset.membershipPlan as unknown as Record<string, unknown>))
      track(upsert('userSubscriptions', dataset.userSubscription.id, dataset.userSubscription as unknown as Record<string, unknown>))
      track(upsert('rechargePackages', dataset.rechargePackage.id, dataset.rechargePackage as unknown as Record<string, unknown>))
      track(upsert('generationSessions', dataset.generationSession.id, dataset.generationSession as unknown as Record<string, unknown>))
      for (const item of dataset.membershipOrders) track(upsert('membershipOrders', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.rechargeOrders) track(upsert('rechargeOrders', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.paymentTransactions) track(upsert('paymentTransactions', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.benefitGrants) track(upsert('benefitGrants', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.generationRecords) track(upsert('generationRecords', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.generationOutputs) track(upsert('generationOutputs', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.assets) track(upsert('assets', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.pointLogs) track(upsert('pointLogs', item.id, item as unknown as Record<string, unknown>))
      for (const item of dataset.auditLogs) track(upsert('auditLogs', item.id, item as unknown as Record<string, unknown>))
      return { createdTotal, updatedTotal }
    },
    async cleanDataset(dataset: NoCallDemoFixtureDataset) {
      let removedTotal = 0
      removedTotal += removeMarked('assets', dataset.assets.map(item => item.id))
      removedTotal += removeMarked('generationOutputs', dataset.generationOutputs.map(item => item.id))
      removedTotal += removeMarked('generationRecords', dataset.generationRecords.map(item => item.id))
      removedTotal += removeMarked('generationSessions', [dataset.generationSession.id])
      removedTotal += removeMarked('pointLogs', dataset.pointLogs.map(item => item.id))
      removedTotal += removeMarked('benefitGrants', dataset.benefitGrants.map(item => item.id))
      removedTotal += removeMarked('paymentTransactions', dataset.paymentTransactions.map(item => item.id))
      removedTotal += removeMarked('membershipOrders', dataset.membershipOrders.map(item => item.id))
      removedTotal += removeMarked('rechargeOrders', dataset.rechargeOrders.map(item => item.id))
      removedTotal += removeMarked('userSubscriptions', [dataset.userSubscription.id])
      removedTotal += removeMarked('membershipPlans', [dataset.membershipPlan.id])
      removedTotal += removeMarked('membershipLevels', [dataset.membershipLevel.id])
      removedTotal += removeMarked('rechargePackages', [dataset.rechargePackage.id])
      removedTotal += removeMarked('auditLogs', dataset.auditLogs.map(item => item.id))
      removedTotal += removeMarked('users', [dataset.user.id])
      return { removedTotal, preservedNonDemoRecords: store.hasNonDemoSentinel() || true }
    },
  }

  return store
}

export const __noCallDemoFixtureTestHooks = {
  createInMemoryStore,
}

const createPrismaDemoFixtureStore = async (): Promise<DemoFixtureStore & { disconnect: () => Promise<void> }> => {
  const { prisma } = await import('../../server/db/prisma')

  const upsertWithId = async (delegate: any, id: string, data: Record<string, unknown>) => {
    const existed = await delegate.findUnique({ where: { id }, select: { id: true } })
    await delegate.upsert({
      where: { id },
      create: data,
      update: data,
    })
    return existed ? 'updated' : 'created'
  }

  const track = (counts: { createdTotal: number; updatedTotal: number }, result: string) => {
    if (result === 'created') counts.createdTotal += 1
    else counts.updatedTotal += 1
  }

  return {
    async seedDataset(dataset) {
      const counts = { createdTotal: 0, updatedTotal: 0 }
      await prisma.$transaction(async (tx: any) => {
        track(counts, await upsertWithId(tx.appUser, dataset.user.id, {
          ...dataset.user,
          avatarUrl: null,
          phone: null,
          passwordHash: null,
        }))
        track(counts, await upsertWithId(tx.membershipLevel, dataset.membershipLevel.id, {
          ...dataset.membershipLevel,
          iconUrl: null,
          isEnabled: true,
          sortOrder: 99001,
        }))
        track(counts, await upsertWithId(tx.membershipPlan, dataset.membershipPlan.id, {
          ...dataset.membershipPlan,
          levelId: dataset.membershipLevel.id,
          description: 'Local no-call fixture plan',
          isEnabled: true,
          sortOrder: 99001,
        }))
        track(counts, await upsertWithId(tx.rechargePackage, dataset.rechargePackage.id, {
          ...dataset.rechargePackage,
          isEnabled: true,
          sortOrder: 99001,
        }))
        track(counts, await upsertWithId(tx.userSubscription, dataset.userSubscription.id, {
          ...dataset.userSubscription,
          userId: dataset.user.id,
          levelId: dataset.membershipLevel.id,
          orderId: dataset.membershipOrders[1].id,
        }))
        track(counts, await upsertWithId(tx.generationSession, dataset.generationSession.id, {
          ...dataset.generationSession,
          userId: dataset.user.id,
          sortOrder: 99001,
        }))

        for (const item of dataset.membershipOrders) {
          track(counts, await upsertWithId(tx.membershipOrder, item.id, {
            ...item,
            userId: dataset.user.id,
            levelId: dataset.membershipLevel.id,
            planId: dataset.membershipPlan.id,
            sourceType: 'DIRECT_PURCHASE',
            startTime: item.status === 'BENEFIT_GRANTED' ? daysAgo(new Date(item.createdAt), 0) : null,
            endTime: item.status === 'BENEFIT_GRANTED' ? addDays(new Date(item.createdAt), 30) : null,
            canceledAt: null,
            refundedAt: null,
          }))
        }

        for (const item of dataset.rechargeOrders) {
          track(counts, await upsertWithId(tx.rechargeOrder, item.id, {
            ...item,
            userId: dataset.user.id,
            rechargePackageId: dataset.rechargePackage.id,
            payChannel: 'MANUAL',
            packageSnapshotJson: demoMeta('recharge-package-snapshot', {
              name: dataset.rechargePackage.name,
              points: dataset.rechargePackage.points,
              bonusPoints: dataset.rechargePackage.bonusPoints,
            }),
            refundedAt: null,
          }))
        }

        for (const item of dataset.paymentTransactions) {
          track(counts, await upsertWithId(tx.paymentTransaction, item.id, {
            ...item,
            userId: dataset.user.id,
            currency: 'CNY',
            rawPayloadJson: null,
          }))
        }

        for (const item of dataset.benefitGrants) {
          const payment = dataset.paymentTransactions.find(txn => txn.orderType === item.orderType && txn.orderNo === item.orderNo)
          track(counts, await upsertWithId(tx.benefitGrant, item.id, {
            ...item,
            userId: dataset.user.id,
            benefitId: item.orderNo,
            paymentTransactionId: payment?.id || null,
            revokedAt: null,
          }))
        }

        for (const item of dataset.generationRecords) {
          track(counts, await upsertWithId(tx.generationRecord, item.id, {
            ...item,
            userId: dataset.user.id,
            sessionId: dataset.generationSession.id,
            providerConfigId: null,
            clientRecordId: null,
            ratio: '1:1',
            resolution: item.type === 'VIDEO' ? '720p' : '1024x1024',
            durationLabel: item.type === 'VIDEO' ? '5s' : null,
            feature: 'local-no-call-demo',
            skill: 'general',
            agentTaskId: `demo-task-${item.id}`,
            startedAt: item.status === 'PENDING' ? null : item.createdAt,
            finishedAt: ['COMPLETED', 'FAILED', 'STOPPED'].includes(item.status) ? item.createdAt : null,
          }))
        }

        for (const item of dataset.generationOutputs) {
          track(counts, await upsertWithId(tx.generationOutput, item.id, item as unknown as Record<string, unknown>))
        }

        for (const item of dataset.assets) {
          track(counts, await upsertWithId(tx.assetItem, item.id, {
            ...item,
            userId: dataset.user.id,
            durationSeconds: null,
            fileSizeBytes: 0n,
            visibility: 'PRIVATE',
            publishStatus: 'DRAFT',
            reviewStatus: 'APPROVED',
            favoriteCount: 0,
            viewCount: 0,
            downloadCount: 0,
            source: 'GENERATED',
            isDeleted: false,
            publishedAt: null,
          }))
        }

        for (const item of dataset.pointLogs) {
          track(counts, await upsertWithId(tx.pointAccountLog, item.id, {
            ...item,
            userId: dataset.user.id,
            subscriptionId: item.sourceType === 'ADMIN_ADJUST' ? null : dataset.userSubscription.id,
            rechargeOrderId: null,
            expireAt: null,
          }))
        }

        for (const item of dataset.auditLogs) {
          track(counts, await upsertWithId(tx.adminAuditLog, item.id, {
            ...item,
            operatorUserId: dataset.user.id,
            ipAddress: '127.0.0.1',
            userAgent: 'local-no-call-demo-fixture',
          }))
        }
      })
      return counts
    },
    async cleanDataset(dataset) {
      let removedTotal = 0
      await prisma.$transaction(async (tx: any) => {
        const deleteMany = async (delegate: any, ids: string[]) => {
          const result = await delegate.deleteMany({ where: { id: { in: ids } } })
          removedTotal += Number(result.count || 0)
        }
        await deleteMany(tx.assetItem, dataset.assets.map(item => item.id))
        await deleteMany(tx.generationOutput, dataset.generationOutputs.map(item => item.id))
        await deleteMany(tx.pointAccountLog, dataset.pointLogs.map(item => item.id))
        await deleteMany(tx.benefitGrant, dataset.benefitGrants.map(item => item.id))
        await deleteMany(tx.paymentTransaction, dataset.paymentTransactions.map(item => item.id))
        await deleteMany(tx.adminAuditLog, dataset.auditLogs.map(item => item.id))
        await deleteMany(tx.generationRecord, dataset.generationRecords.map(item => item.id))
        await deleteMany(tx.generationSession, [dataset.generationSession.id])
        await deleteMany(tx.userSubscription, [dataset.userSubscription.id])
        await deleteMany(tx.membershipOrder, dataset.membershipOrders.map(item => item.id))
        await deleteMany(tx.rechargeOrder, dataset.rechargeOrders.map(item => item.id))
        await deleteMany(tx.membershipPlan, [dataset.membershipPlan.id])
        await deleteMany(tx.membershipLevel, [dataset.membershipLevel.id])
        await deleteMany(tx.rechargePackage, [dataset.rechargePackage.id])
        await deleteMany(tx.appUser, [dataset.user.id])
      })
      return { removedTotal, preservedNonDemoRecords: true }
    },
    async disconnect() {
      await prisma.$disconnect()
    },
  }
}

const runCli = async () => {
  const mode = process.argv.includes('--clean') ? 'clean' : 'seed'
  assertCanRunNoCallDemoFixtures(process.env)
  const store = await createPrismaDemoFixtureStore()
  try {
    const summary = mode === 'clean'
      ? await cleanNoCallDemoFixtures({ store })
      : await seedNoCallDemoFixtures({ store })
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await store.disconnect()
  }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
