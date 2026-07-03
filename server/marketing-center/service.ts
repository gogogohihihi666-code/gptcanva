import prisma from '../db/prisma'
import { runPrismaTransactionWithRetry } from '../db/retry'
import { invalidateRedisCachePatterns, invalidateRedisCaches } from '../redis/cache-manager'
import { getOrSetJsonCache } from '../redis/json-cache'
import { REDIS_CONFIG, isRedisEnabled } from '../redis/config'
import { acquireRedisLock, releaseRedisLock, type RedisLockHandle } from '../redis/lock'
import { redisKeys } from '../redis/keys'
import { runPaymentSecretInjectionPreflight } from './payment/preflight'
import { resolvePaymentProvider } from './payment/provider-registry'
import {
  applyCapabilityFlags,
  type ModelCapabilityFlags,
  type ModelCapabilitySpec,
} from '../../src/shared/provider-capability'

const MARKETING_CENTER_OVERVIEW_SCOPE = 'marketing-center-overview'
const MARKETING_CENTER_GUEST_OVERVIEW_CACHE_KEY = redisKeys.cache(MARKETING_CENTER_OVERVIEW_SCOPE, 'guest')
const MARKETING_CENTER_OVERVIEW_CACHE_PATTERN = redisKeys.cache(MARKETING_CENTER_OVERVIEW_SCOPE, '*')
const buildMarketingCenterUserOverviewCacheKey = (userId: string) => {
  return redisKeys.cache(MARKETING_CENTER_OVERVIEW_SCOPE, `user:${userId}`)
}

const buildSerialNo = (prefix: string) => {
  const now = new Date()
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  const timestamp = now.getFullYear()
    + pad(now.getMonth() + 1)
    + pad(now.getDate())
    + pad(now.getHours())
    + pad(now.getMinutes())
    + pad(now.getSeconds())
    + pad(now.getMilliseconds(), 3)
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return prefix + timestamp + random
}

const startOfToday = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const formatDateKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

const formatMonthKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1)
}

const formatWeekKey = (date: Date) => {
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = current.getUTCDay() || 7
  current.setUTCDate(current.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((current.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return String(current.getUTCFullYear()) + '-W' + String(weekNo).padStart(2, '0')
}

// Prisma Decimal 在用户侧接口里也统一转成字符串金额，保证与后台返回格式一致。
const isDecimalLike = (value: unknown): value is { toNumber?: () => number; toString: () => string } => {
  return Boolean(
    value
    && typeof value === 'object'
    && (
      typeof (value as { toNumber?: () => number }).toNumber === 'function'
      || (value as { constructor?: { name?: string } }).constructor?.name === 'Decimal'
    ),
  )
}

// 将用户侧营销接口返回中的 BigInt / Decimal 递归转换为可序列化值。
const serializeMarketingCenterRecord = <T>(value: T): T => {
  if (typeof value === 'bigint') {
    return Number(value) as T
  }

  if (isDecimalLike(value)) {
    return value.toString() as T
  }

  // Date 需要优先转成 ISO 字符串，否则继续走对象递归时会被展开成空对象。
  if (value instanceof Date) {
    return value.toISOString() as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeMarketingCenterRecord(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializeMarketingCenterRecord(item)]),
    ) as T
  }

  return value
}

const buildCyclePrefix = (cycleType: string, now = new Date()) => {
  if (cycleType === 'DAILY') return formatDateKey(now)
  if (cycleType === 'WEEKLY') return formatWeekKey(now)
  if (cycleType === 'MONTHLY') return formatMonthKey(now)
  return 'ONCE'
}

export const invalidateMarketingCenterOverviewCache = async (userId?: string | null) => {
  const normalizedUserId = String(userId || '').trim()
  if (normalizedUserId) {
    await invalidateRedisCaches([buildMarketingCenterUserOverviewCacheKey(normalizedUserId)])
    return
  }

  await invalidateRedisCachePatterns([MARKETING_CENTER_OVERVIEW_CACHE_PATTERN])
}

// BuildingAI 风格会员计费规则。
const parseMembershipPlanConfig = (value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return {
      benefits: Array.isArray(record.benefits) ? record.benefits : [],
      billing: Array.isArray(record.billing) ? record.billing : [],
    }
  }

  return {
    benefits: Array.isArray(value) ? value : [],
    billing: [],
  }
}

const normalizeMembershipBillingRule = (item: Record<string, unknown>) => ({
  levelId: String(item.levelId || '').trim(),
  salesPrice: Number(item.salesPrice || 0),
  originalPrice: item.originalPrice === null || item.originalPrice === undefined || String(item.originalPrice || '').trim() === '' ? null : Number(item.originalPrice),
  label: String(item.label || '').trim() || null,
  status: item.status === false ? false : true,
})

// 一个计划可以展开为多个前台套餐卡片。
const expandMembershipPlansByBilling = (plans: any[], levels: any[]) => {
  const levelMap = new Map(levels.map((item) => [item.id, item]))

  return plans.flatMap((plan) => {
    const config = parseMembershipPlanConfig(plan.benefitsJson)
    const billingRules = (Array.isArray(config.billing) ? config.billing : [])
      .map((item) => normalizeMembershipBillingRule(item as Record<string, unknown>))
      .filter((item) => item.levelId && item.status)

    return billingRules.map((rule, index) => ({
      ...plan,
      id: `${plan.id}::${rule.levelId}`,
      planId: plan.id,
      levelId: rule.levelId,
      label: rule.label || plan.label,
      salesPrice: rule.salesPrice,
      originalPrice: rule.originalPrice,
      level: levelMap.get(rule.levelId) || null,
      benefitsJson: config.benefits,
      billingIndex: index,
      billingRules,
    }))
  })
}

const parsePlanPurchaseSelection = (value: string) => {
  const [planId, levelId] = String(value || '').split('::')
  return {
    planId: String(planId || '').trim(),
    levelId: String(levelId || '').trim(),
  }
}

const readCurrentPointBalance = async (userId: string, tx: typeof prisma | any = prisma) => {
  const latestLog = await tx.pointAccountLog.findFirst({
    where: { userId },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  })
  return latestLog?.balanceAfter || 0
}

// 在事务内对用户主表加行锁，串行化同一用户的积分账本写入。
// 必须在事务开头调用，且后续的余额读取/写入必须使用同一个 tx。
// 解决问题：原实现仅靠 prisma.$transaction 的原子性，并发扣点会读到相同 balanceAfter 导致超扣。
const lockUserBillingRow = async (tx: any, userId: string) => {
  await tx.$queryRaw`SELECT id FROM app_users WHERE id = ${userId} FOR UPDATE`
}

const appendPointLog = async (tx: any, input: {
  userId: string
  changeType: any
  action: any
  changeAmount: number
  sourceType: any
  sourceId?: string | null
  rechargeOrderId?: string | null
  subscriptionId?: string | null
  associationNo?: string | null
  remark?: string | null
  idempotencyKey?: string | null
  metaJson?: unknown
}) => {
  const idempotencyKey = String(input.idempotencyKey || '').trim() || null
  if (idempotencyKey) {
    const existing = await tx.pointAccountLog.findFirst({
      where: { idempotencyKey },
    })
    if (existing) {
      return existing
    }
  }

  const currentBalance = await readCurrentPointBalance(input.userId, tx)
  const nextBalance = input.action === 'DECREASE'
    ? currentBalance - Math.abs(input.changeAmount)
    : currentBalance + Math.abs(input.changeAmount)

  return tx.pointAccountLog.create({
    data: {
      userId: input.userId,
      subscriptionId: input.subscriptionId || null,
      rechargeOrderId: input.rechargeOrderId || null,
      accountNo: buildSerialNo('PTS'),
      changeType: input.changeType,
      action: input.action,
      changeAmount: Math.abs(input.changeAmount),
      balanceAfter: nextBalance,
      availableAmount: nextBalance,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      associationNo: input.associationNo || null,
      remark: input.remark || null,
      idempotencyKey,
      metaJson: (input.metaJson ?? null) as any,
    },
  })
}


const readModelBillingPower = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0
  }

  const defaultParams = value as Record<string, unknown>
  const billingRule = defaultParams.billingRule
  if (!billingRule || typeof billingRule !== 'object' || Array.isArray(billingRule)) {
    return 0
  }

  return Math.max(0, Number((billingRule as Record<string, unknown>).power || 0))
}

// 读取后台模型配置中的积分消耗规则，统一给生成链路使用。
// capabilityFlags 用于"联网搜索 / 深度思考"等扩展能力开关，按 capabilityJson 配置的
// billingMultiplier 放大基础点数，让额外成本能反映在用户扣点上。
export const resolveGenerationPointCost = async (input: {
  providerId: string
  modelKey: string
  endpointType: 'chat' | 'image' | 'video'
  capabilityFlags?: ModelCapabilityFlags | null
}) => {
  const providerId = String(input.providerId || '').trim()
  const modelKey = String(input.modelKey || '').trim()
  const category = String(input.endpointType || '').trim().toUpperCase()

  if (!providerId || !modelKey || (category !== 'CHAT' && category !== 'IMAGE' && category !== 'VIDEO')) {
    return {
      pointCost: 0,
      modelId: '',
      modelName: '',
    }
  }

  const model = await prisma.aiModel.findFirst({
    where: {
      providerId,
      modelKey,
      category: category as any,
      isEnabled: true,
    },
    select: {
      id: true,
      name: true,
      defaultParamsJson: true,
      capabilityJson: true,
    },
  })

  if (!model) {
    return {
      pointCost: 0,
      modelId: '',
      modelName: '',
    }
  }

  // 基础点数。
  const basePointCost = readModelBillingPower(model.defaultParamsJson)

  // 应用能力开关倍率（联网/深度思考通常更贵），未配置或不支持则倍率为 1。
  const capabilitySpec = (() => {
    const value = model.capabilityJson
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as ModelCapabilitySpec
  })()
  const applied = applyCapabilityFlags(input.capabilityFlags || null, capabilitySpec)
  const finalPointCost = Math.max(0, Math.ceil(basePointCost * (applied.billingMultiplier || 1)))

  return {
    pointCost: finalPointCost,
    modelId: model.id,
    modelName: model.name,
  }
}

// 在真正发起对话/图片/视频生成前扣减积分，并落一条可追踪的消费流水。
export const consumeGenerationPoints = async (input: {
  userId: string
  pointCost: number
  sourceId: string
  associationNo: string
  endpointType: 'chat' | 'image' | 'video'
  providerId: string
  modelKey: string
  modelName?: string
  metaJson?: unknown
}) => {
  const pointCost = Math.max(0, Number(input.pointCost || 0))
  if (pointCost <= 0) {
    return null
  }

  return runPrismaTransactionWithRetry(async (tx) => {
    // 行锁优先：锁住用户主表行，串行化该用户的积分账本写入。
    await lockUserBillingRow(tx, input.userId)

    const currentBalance = await readCurrentPointBalance(input.userId, tx)
    if (currentBalance < pointCost) {
      const error = new Error(`积分不足，当前剩余 ${currentBalance}，需要 ${pointCost}`) as Error & {
        code?: string
        currentBalance?: number
        requiredPoints?: number
      }
      error.code = 'INSUFFICIENT_POINTS'
      error.currentBalance = currentBalance
      error.requiredPoints = pointCost
      throw error
    }

    return appendPointLog(tx, {
      userId: input.userId,
      changeType: 'CONSUME',
      action: 'DECREASE',
      changeAmount: pointCost,
      sourceType: 'GENERATION_CONSUME',
      sourceId: input.sourceId,
      associationNo: input.associationNo,
      remark: input.endpointType === 'video'
        ? '视频生成消耗积分'
        : input.endpointType === 'image'
          ? '图片生成消耗积分'
          : '对话消耗积分',
      metaJson: {
        endpointType: input.endpointType,
        providerId: input.providerId,
        modelKey: input.modelKey,
        modelName: input.modelName || '',
        ...(input.metaJson && typeof input.metaJson === 'object' && !Array.isArray(input.metaJson)
          ? input.metaJson as Record<string, unknown>
          : {}),
      },
    })
  }, {
    operationName: 'consume_generation_points',
  })
}

// 上游请求失败时自动退回本次生成消耗，避免用户为失败结果付费。
export const refundGenerationPoints = async (input: {
  userId: string
  pointCost: number
  sourceId: string
  associationNo: string
  endpointType: 'chat' | 'image' | 'video'
  providerId: string
  modelKey: string
  modelName?: string
  metaJson?: unknown
}) => {
  const pointCost = Math.max(0, Number(input.pointCost || 0))
  if (pointCost <= 0) {
    return null
  }

  const result = await runPrismaTransactionWithRetry(async (tx) => {
    // 退款也走行锁：避免与并发扣点交错，让账本写入按事务严格串行。
    await lockUserBillingRow(tx, input.userId)

    return appendPointLog(tx, {
      userId: input.userId,
      changeType: 'REFUND',
      action: 'INCREASE',
      changeAmount: pointCost,
      sourceType: 'GENERATION_CONSUME',
      sourceId: input.sourceId,
      associationNo: input.associationNo,
      remark: input.endpointType === 'video'
        ? '视频生成失败，积分已退回'
        : input.endpointType === 'image'
          ? '图片生成失败，积分已退回'
          : '对话失败，积分已退回',
      metaJson: {
        endpointType: input.endpointType,
        providerId: input.providerId,
        modelKey: input.modelKey,
        modelName: input.modelName || '',
        ...(input.metaJson && typeof input.metaJson === 'object' && !Array.isArray(input.metaJson)
          ? input.metaJson as Record<string, unknown>
          : {}),
      },
    })
  }, {
    operationName: 'refund_generation_points',
  })

  await invalidateMarketingCenterOverviewCache(input.userId)
  return result
}

// 在生成任务记录创建完成后，把 generationRecordId 追写回积分消费流水，便于后续做失败补偿与审计。
export const attachGenerationPointRecordId = async (input: {
  associationNo: string
  userId: string
  generationRecordId: string
}) => {
  const associationNo = String(input.associationNo || '').trim()
  const userId = String(input.userId || '').trim()
  const generationRecordId = String(input.generationRecordId || '').trim()

  if (!associationNo || !userId || !generationRecordId) {
    return null
  }

  const pointLog = await prisma.pointAccountLog.findFirst({
    where: {
      associationNo,
      userId,
      sourceType: 'GENERATION_CONSUME',
      changeType: 'CONSUME',
    },
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  })

  if (!pointLog) {
    return null
  }

  const currentMeta = pointLog.metaJson && typeof pointLog.metaJson === 'object' && !Array.isArray(pointLog.metaJson)
    ? pointLog.metaJson as Record<string, unknown>
    : {}

  if (String(currentMeta.generationRecordId || '').trim() === generationRecordId) {
    return pointLog
  }

  return prisma.pointAccountLog.update({
    where: { id: pointLog.id },
    data: {
      metaJson: {
        ...currentMeta,
        generationRecordId,
      } as any,
    },
  })
}

const addDuration = (startTime: Date, durationUnit: string, durationValue: number) => {
  const nextDate = new Date(startTime)
  const normalizedUnit = String(durationUnit || 'MONTH').toUpperCase()
  const value = Math.max(1, durationValue || 1)
  if (normalizedUnit === 'DAY') {
    nextDate.setDate(nextDate.getDate() + value)
    return nextDate
  }
  if (normalizedUnit === 'YEAR') {
    nextDate.setFullYear(nextDate.getFullYear() + value)
    return nextDate
  }
  nextDate.setMonth(nextDate.getMonth() + value)
  return nextDate
}

const activateMembership = async (tx: any, input: {
  userId: string
  levelId: string
  sourceType: any
  sourceId: string
  startTime?: Date
  durationDays?: number | null
  durationUnit?: string
  durationValue?: number
  bonusPoints?: number
  metaJson?: unknown
}) => {
  const now = input.startTime || new Date()
  const activeSubscription = await tx.userSubscription.findFirst({
    where: {
      userId: input.userId,
      levelId: input.levelId,
      status: 'ACTIVE',
      endTime: { gt: now },
    },
    orderBy: { endTime: 'desc' },
  })

  const subscriptionStartTime = activeSubscription?.endTime && activeSubscription.endTime > now
    ? activeSubscription.endTime
    : now

  const subscriptionEndTime = input.durationDays && input.durationDays > 0
    ? new Date(subscriptionStartTime.getTime() + input.durationDays * 86400000)
    : addDuration(subscriptionStartTime, input.durationUnit || 'MONTH', input.durationValue || 1)

  await tx.userSubscription.updateMany({
    where: {
      userId: input.userId,
      status: 'ACTIVE',
      levelId: { not: input.levelId },
    },
    data: {
      status: 'EXPIRED',
    },
  })

  const subscription = await tx.userSubscription.upsert({
    where: {
      userId_levelId: {
        userId: input.userId,
        levelId: input.levelId,
      },
    },
    update: {
      status: 'ACTIVE',
      startTime: subscriptionStartTime,
      endTime: subscriptionEndTime,
      updatedAt: new Date(),
    },
    create: {
      userId: input.userId,
      levelId: input.levelId,
      status: 'ACTIVE',
      startTime: subscriptionStartTime,
      endTime: subscriptionEndTime,
    },
  })

  if ((input.bonusPoints || 0) > 0) {
    await appendPointLog(tx, {
      userId: input.userId,
      subscriptionId: subscription.id,
      changeType: 'MEMBERSHIP_BONUS',
      action: 'INCREASE',
      changeAmount: input.bonusPoints || 0,
      sourceType: 'MEMBERSHIP_ORDER',
      sourceId: input.sourceId,
      associationNo: input.sourceId,
      remark: '会员开通赠送积分',
      metaJson: input.metaJson,
    })
  }

  return subscription
}

const grantRewardByTrigger = async (tx: any, input: {
  userId: string
  triggerType: 'LOGIN_DAILY' | 'REGISTER_ONCE' | 'CHECKIN_DAILY'
  sourceId?: string | null
  remark?: string
  metaJson?: unknown
}) => {
  const rewardRules = await tx.rewardRule.findMany({
    where: {
      triggerType: input.triggerType,
      isEnabled: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  const results: Array<{ ruleId: string; rewardPoints: number; claimId: string }> = []
  for (const rule of rewardRules) {
    const cyclePrefix = buildCyclePrefix(rule.cycleType)
    const claimedCount = await tx.rewardClaimRecord.count({
      where: {
        userId: input.userId,
        ruleId: rule.id,
        cycleKey: {
          startsWith: cyclePrefix,
        },
      },
    })

    if (claimedCount >= Math.max(1, rule.limitPerCycle || 1)) {
      continue
    }

    const claimRecord = await tx.rewardClaimRecord.create({
      data: {
        userId: input.userId,
        ruleId: rule.id,
        triggerType: rule.triggerType,
        cycleKey: cyclePrefix + '#' + String(claimedCount + 1),
        rewardPoints: rule.rewardPoints,
        claimStatus: 'SUCCESS',
        sourceId: input.sourceId || null,
        metaJson: (input.metaJson ?? null) as any,
      },
    })

    if ((rule.rewardPoints || 0) > 0) {
      await appendPointLog(tx, {
        userId: input.userId,
        changeType: 'REWARD',
        action: 'INCREASE',
        changeAmount: rule.rewardPoints,
        sourceType: rule.triggerType === 'CHECKIN_DAILY' ? 'CHECKIN' : 'REWARD_RULE',
        sourceId: claimRecord.id,
        associationNo: claimRecord.id,
        remark: input.remark || rule.name,
        metaJson: {
          triggerType: rule.triggerType,
          ruleCode: rule.code,
          ruleName: rule.name,
        },
      })
    }

    results.push({
      ruleId: rule.id,
      rewardPoints: rule.rewardPoints,
      claimId: claimRecord.id,
    })
  }

  return results
}

type CommercialOrderTypeValue = 'MEMBERSHIP' | 'RECHARGE'
type LocalPaymentConfirmInput = {
  orderType: CommercialOrderTypeValue | string
  orderNo: string
  paidAmount?: number | string
  idempotencyKey?: string
  channelTransactionNo?: string
  provider?: string
  providerPaymentId?: string
  providerTransactionId?: string
  channel?: 'ALIPAY' | 'WECHAT' | 'MANUAL' | 'OTHER'
  paidAt?: Date | string | null
  rawPayload?: unknown
}

const isLocalPaymentSimulationEnabled = () => {
  if (process.env.NODE_ENV === 'production') {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_LOCAL_PAYMENT_SIMULATION || '').trim().toLowerCase())
}

const normalizeCommercialOrderType = (value: unknown): CommercialOrderTypeValue => {
  const normalizedValue = String(value || '').trim().toUpperCase()
  if (normalizedValue === 'MEMBERSHIP' || normalizedValue === 'RECHARGE') {
    return normalizedValue
  }

  throw new Error('订单类型不支持')
}

const normalizeOrderNo = (value: unknown) => {
  const orderNo = String(value || '').trim().toUpperCase()
  if (!orderNo) {
    throw new Error('订单号不能为空')
  }

  return orderNo
}

const toAmountNumber = (value: unknown) => {
  if (value && typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return Number((value as { toString: () => string }).toString())
  }

  return Number(value || 0)
}

const toAmountCents = (value: unknown) => Math.round(toAmountNumber(value) * 100)

const normalizePositiveAmount = (value: unknown, fallback: unknown) => {
  const amount = value === undefined || value === null || String(value).trim() === ''
    ? toAmountNumber(fallback)
    : Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('支付金额不合法')
  }

  return amount
}

const assertPaymentAmountMatches = (expectedAmount: unknown, paidAmount: unknown) => {
  if (toAmountCents(expectedAmount) !== toAmountCents(paidAmount)) {
    throw new Error(`支付金额不一致，订单应付 ${toAmountNumber(expectedAmount).toFixed(2)}，实际支付 ${toAmountNumber(paidAmount).toFixed(2)}`)
  }
}

const SENSITIVE_PAYMENT_PAYLOAD_KEY_PATTERN = /(secret|token|password|cookie|authorization|signature|sign|api[-_]?key|access[-_]?key|private[-_]?key|credential)/i

const sanitizePaymentRawPayload = (value: unknown, depth = 0): unknown => {
  if (depth > 8) {
    return '[REDACTED:DEPTH_LIMIT]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePaymentRawPayload(item, depth + 1))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (SENSITIVE_PAYMENT_PAYLOAD_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]']
      }

      return [key, sanitizePaymentRawPayload(item, depth + 1)]
    }),
  )
}

const recordPaymentTransaction = async (tx: any, input: {
  userId: string
  orderType: CommercialOrderTypeValue
  orderNo: string
  expectedAmount: unknown
  paidAmount: number
  idempotencyKey?: string
  channelTransactionNo?: string
  provider?: string
  providerPaymentId?: string
  providerTransactionId?: string
  channel?: 'ALIPAY' | 'WECHAT' | 'MANUAL' | 'OTHER'
  status: 'INTENT_CREATED' | 'VERIFIED' | 'REJECTED'
  paidAt?: Date | string | null
  failureReason?: string
  rawPayload?: unknown
}) => {
  const idempotencyKey = String(input.idempotencyKey || '').trim() || null
  const provider = String(input.provider || 'LOCAL').trim().toUpperCase()
  const providerPaymentId = String(input.providerPaymentId || '').trim() || null
  const providerTransactionId = String(input.providerTransactionId || '').trim() || null
  const channelTransactionNo = String(input.channelTransactionNo || '').trim()
    || providerTransactionId
    || providerPaymentId
    || `${provider}-${input.orderType}-${input.orderNo}-${idempotencyKey || 'NO-IDEMPOTENCY'}`
  const paidAt = input.paidAt
    ? input.paidAt instanceof Date
      ? input.paidAt
      : new Date(input.paidAt)
    : null

  if (idempotencyKey) {
    const existing = await tx.paymentTransaction.findFirst({
      where: {
        orderType: input.orderType,
        orderNo: input.orderNo,
        idempotencyKey,
      },
    })
    if (existing) {
      return existing
    }
  }

  return tx.paymentTransaction.create({
    data: {
      userId: input.userId,
      orderType: input.orderType,
      orderNo: input.orderNo,
      provider,
      providerPaymentId,
      providerTransactionId,
      channel: input.channel || 'MANUAL',
      channelTransactionNo,
      idempotencyKey,
      status: input.status,
      expectedAmount: input.expectedAmount,
      paidAmount: input.paidAmount,
      currency: 'CNY',
      verifiedAt: input.status === 'VERIFIED' ? new Date() : null,
      paidAt: input.status === 'VERIFIED' ? (paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : new Date()) : null,
      failureReason: input.failureReason || null,
      rawPayloadJson: sanitizePaymentRawPayload(input.rawPayload ?? null) as any,
    },
  })
}

const createSuccessfulBenefitGrant = async (tx: any, input: {
  userId: string
  orderType: CommercialOrderTypeValue
  orderNo: string
  grantType: 'MEMBERSHIP' | 'POINTS' | 'MEMBERSHIP_BONUS_POINTS'
  benefitId?: string | null
  paymentTransactionId?: string | null
  amount?: number
  reason: string
  metaJson?: unknown
}) => {
  const existing = await tx.benefitGrant.findFirst({
    where: {
      orderType: input.orderType,
      orderNo: input.orderNo,
      grantType: input.grantType,
    },
  })

  if (existing?.status === 'SUCCESS') {
    return existing
  }

  const data = {
    userId: input.userId,
    orderType: input.orderType,
    orderNo: input.orderNo,
    grantType: input.grantType,
    status: 'SUCCESS',
    benefitId: input.benefitId || null,
    paymentTransactionId: input.paymentTransactionId || null,
    amount: Math.max(0, Number(input.amount || 0)),
    reason: input.reason,
    metaJson: (input.metaJson ?? null) as any,
    grantedAt: new Date(),
  }

  if (existing) {
    return tx.benefitGrant.update({
      where: { id: existing.id },
      data,
    })
  }

  return tx.benefitGrant.create({ data })
}

// 用户登录成功后触发每日登录奖励。
export const grantLoginReward = async (userId: string) => {
  const result = await prisma.$transaction(async (tx) => {
    return grantRewardByTrigger(tx, {
      userId,
      triggerType: 'LOGIN_DAILY',
      remark: '每日登录奖励',
    })
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

// 新用户注册成功后发放一次性注册奖励。
export const grantRegisterReward = async (userId: string) => {
  const result = await prisma.$transaction(async (tx) => {
    return grantRewardByTrigger(tx, {
      userId,
      triggerType: 'REGISTER_ONCE',
      remark: '新用户注册奖励',
    })
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

// 获取用户侧营销中心总览。
export const getMarketingCenterOverview = async (userId?: string | null) => {
  const normalizedUserId = String(userId || '').trim()
  const cacheKey = normalizedUserId
    ? buildMarketingCenterUserOverviewCacheKey(normalizedUserId)
    : MARKETING_CENTER_GUEST_OVERVIEW_CACHE_KEY

  return getOrSetJsonCache({
    key: cacheKey,
    ttlSeconds: normalizedUserId ? 120 : 600,
    factory: async () => {
      const [rawMembershipPlans, membershipLevels, rechargePackages, rewardRules] = await Promise.all([
        prisma.membershipPlan.findMany({
          where: { isEnabled: true },
          include: { level: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.membershipLevel.findMany({ where: { isEnabled: true } }),
        prisma.rechargePackage.findMany({
          where: { isEnabled: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.rewardRule.findMany({
          where: { isEnabled: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      ])

      const membershipPlans = expandMembershipPlansByBilling(rawMembershipPlans, membershipLevels)

      if (!normalizedUserId) {
        return serializeMarketingCenterRecord({
          user: null,
          points: {
            balance: 0,
            available: 0,
            logs: [],
          },
          subscription: null,
          membershipPlans,
          rechargePackages,
          rewardRules,
          cardRedeemRecords: [],
          checkin: {
            checkedInToday: false,
            currentRecord: null,
          },
        })
      }

      const [currentUser, currentBalance, activeSubscription, recentPointLogs, recentRedeemRecords, todayCheckinRecord] = await Promise.all([
        prisma.appUser.findUnique({
          where: { id: normalizedUserId },
          select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
        }),
        readCurrentPointBalance(normalizedUserId),
        prisma.userSubscription.findFirst({
          where: {
            userId: normalizedUserId,
            status: 'ACTIVE',
            endTime: { gt: new Date() },
          },
          include: { level: true },
          orderBy: { endTime: 'desc' },
        }),
        prisma.pointAccountLog.findMany({
          where: { userId: normalizedUserId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 10,
        }),
        prisma.cardRedeemRecord.findMany({
          where: { userId: normalizedUserId },
          include: { batch: true, rewardLevel: true },
          orderBy: [{ createdAt: 'desc' }],
          take: 10,
        }),
        prisma.userCheckinRecord.findUnique({
          where: {
            userId_checkinDate: {
              userId: normalizedUserId,
              checkinDate: formatDateKey(new Date()),
            },
          },
        }),
      ])

      return serializeMarketingCenterRecord({
        user: currentUser,
        points: {
          balance: currentBalance,
          available: currentBalance,
          logs: recentPointLogs,
        },
        subscription: activeSubscription,
        membershipPlans,
        rechargePackages,
        rewardRules,
        cardRedeemRecords: recentRedeemRecords,
        checkin: {
          checkedInToday: Boolean(todayCheckinRecord),
          currentRecord: todayCheckinRecord,
        },
      })
    },
  })
}

// 用户签到。
export const performUserCheckin = async (userId: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const today = formatDateKey(new Date())
    const existing = await tx.userCheckinRecord.findUnique({
      where: {
        userId_checkinDate: {
          userId,
          checkinDate: today,
        },
      },
    })
    if (existing) {
      throw new Error('今天已经签到过了')
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = formatDateKey(yesterday)
    const previousRecord = await tx.userCheckinRecord.findUnique({
      where: {
        userId_checkinDate: {
          userId,
          checkinDate: yesterdayKey,
        },
      },
    })

    const rewardResults = await grantRewardByTrigger(tx, {
      userId,
      triggerType: 'CHECKIN_DAILY',
      remark: '每日签到奖励',
      metaJson: { checkinDate: today },
    })

    const rewardPoints = rewardResults.reduce((sum, item) => sum + item.rewardPoints, 0)
    const checkinRecord = await tx.userCheckinRecord.create({
      data: {
        userId,
        rewardClaimId: rewardResults[0]?.claimId || null,
        checkinDate: today,
        consecutiveDays: previousRecord ? previousRecord.consecutiveDays + 1 : 1,
        rewardPoints,
      },
    })

    return serializeMarketingCenterRecord({
      checkinRecord,
      rewardResults,
      currentBalance: await readCurrentPointBalance(userId, tx),
    })
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

// 用户购买会员计划。
export const createMembershipPurchaseOrder = async (userId: string, selectedPlanId: string) => {
  const result = await runPrismaTransactionWithRetry(async (tx) => {
    const selection = parsePlanPurchaseSelection(selectedPlanId)
    const plan = await tx.membershipPlan.findFirst({
      where: { id: selection.planId, isEnabled: true },
      include: { level: true },
    })
    if (!plan) {
      throw new Error('会员计划不存在或已下架')
    }

    const planConfig = parseMembershipPlanConfig(plan.benefitsJson)
    const matchedBillingRule = (Array.isArray(planConfig.billing) ? planConfig.billing : [])
      .map((item) => normalizeMembershipBillingRule(item as Record<string, unknown>))
      .find((item) => item.levelId === selection.levelId && item.status)
    if (!matchedBillingRule) {
      throw new Error('当前会员计费规则不存在或已停用')
    }

    const order = await tx.membershipOrder.create({
      data: {
        userId,
        levelId: matchedBillingRule.levelId,
        planId: plan.id,
        orderNo: buildSerialNo('VIP'),
        sourceType: 'DIRECT_PURCHASE',
        status: 'PENDING',
        totalAmount: matchedBillingRule.salesPrice,
        paidAmount: 0,
        bonusPoints: plan.bonusPoints,
        startTime: null,
        endTime: null,
        paidAt: null,
        metaJson: {
          planName: plan.name,
          planLabel: plan.label,
          durationType: plan.durationType,
          durationValue: plan.durationValue,
          durationUnit: plan.durationUnit,
          billingLevelId: matchedBillingRule.levelId,
          billingLabel: matchedBillingRule.label,
          salesPrice: matchedBillingRule.salesPrice,
          originalPrice: matchedBillingRule.originalPrice,
          bonusPoints: plan.bonusPoints,
          benefits: planConfig.benefits,
          createdForPayment: true,
        },
      },
    })

    return serializeMarketingCenterRecord({
      order,
      subscription: null,
      currentBalance: await readCurrentPointBalance(userId, tx),
      payment: {
        status: 'PENDING',
        willCallProvider: false,
      },
    })
  }, {
    operationName: 'create_membership_purchase_order',
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

// 用户创建充值订单并立即入账。
export const createRechargePurchaseOrder = async (userId: string, rechargePackageId: string) => {
  const result = await runPrismaTransactionWithRetry(async (tx) => {
    const rechargePackage = await tx.rechargePackage.findFirst({
      where: { id: rechargePackageId, isEnabled: true },
    })
    if (!rechargePackage) {
      throw new Error('充值套餐不存在或已下架')
    }

    const order = await tx.rechargeOrder.create({
      data: {
        userId,
        rechargePackageId: rechargePackage.id,
        orderNo: buildSerialNo('RCH'),
        payChannel: 'MANUAL',
        payStatus: 'PENDING',
        refundStatus: 'NONE',
        points: rechargePackage.points,
        bonusPoints: rechargePackage.bonusPoints,
        totalAmount: rechargePackage.price,
        paidAmount: 0,
        packageSnapshotJson: {
          name: rechargePackage.name,
          label: rechargePackage.label,
          price: rechargePackage.price,
          originalPrice: rechargePackage.originalPrice,
          points: rechargePackage.points,
          bonusPoints: rechargePackage.bonusPoints,
          createdForPayment: true,
        },
        paidAt: null,
      },
    })

    return serializeMarketingCenterRecord({
      order,
      currentBalance: await readCurrentPointBalance(userId, tx),
      payment: {
        status: 'PENDING',
        willCallProvider: false,
      },
    })
  }, {
    operationName: 'create_recharge_purchase_order',
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

// 用户兑换卡密。
type PaymentIntentCreateInput = {
  orderType: CommercialOrderTypeValue | string
  orderNo: string
  provider?: string
  paymentChannel?: string
  clientIp?: string | null
  returnUrl?: string | null
  notifyUrl?: string | null
}

type PaymentWebhookHandleInput = {
  provider?: string
  headers?: Record<string, string | string[] | undefined>
  rawBody?: string
  parsedBody?: unknown
}

type PaymentSecretPreflightInput = {
  provider?: string
  environment?: string
}

const normalizePaymentChannel = (value: unknown) => {
  const channel = String(value || 'MOCK').trim().toUpperCase()
  if (!/^[A-Z0-9_-]{1,32}$/.test(channel)) {
    throw new Error('payment channel is invalid')
  }
  return channel
}

const readOrderForPayment = async (tx: any, orderType: CommercialOrderTypeValue, orderNo: string, includePlan = false) => {
  if (orderType === 'MEMBERSHIP') {
    return tx.membershipOrder.findUnique({
      where: { orderNo },
      include: includePlan ? { plan: true } : undefined,
    })
  }

  return tx.rechargeOrder.findUnique({
    where: { orderNo },
  })
}

const lockPaymentOrderRow = async (tx: any, orderType: CommercialOrderTypeValue, orderNo: string) => {
  if (orderType === 'MEMBERSHIP') {
    await tx.$queryRaw`SELECT id FROM membership_orders WHERE order_no = ${orderNo} FOR UPDATE`
    return
  }

  await tx.$queryRaw`SELECT id FROM recharge_orders WHERE order_no = ${orderNo} FOR UPDATE`
}

const getOrderPaymentStatus = (orderType: CommercialOrderTypeValue, order: any) => {
  return String(orderType === 'MEMBERSHIP' ? order.status : order.payStatus)
}

const updateOrderPaymentStatus = async (tx: any, orderType: CommercialOrderTypeValue, orderId: string, status: 'PAYING') => {
  if (orderType === 'MEMBERSHIP') {
    return tx.membershipOrder.update({
      where: { id: orderId },
      data: { status },
    })
  }

  return tx.rechargeOrder.update({
    where: { id: orderId },
    data: {
      payStatus: status,
      payChannel: 'OTHER',
    },
  })
}

const assertOrderCanCreatePaymentIntent = (orderType: CommercialOrderTypeValue, order: any, userId: string) => {
  if (!order || order.userId !== userId) {
    throw new Error('payment order not found')
  }

  const status = getOrderPaymentStatus(orderType, order)
  if (status !== 'PENDING' && status !== 'PAYING') {
    throw new Error(`payment order status does not allow intent creation: ${status}`)
  }
}

const createPaymentIntentInTransaction = async (tx: any, userId: string, payload: PaymentIntentCreateInput) => {
  const orderType = normalizeCommercialOrderType(payload.orderType)
  const orderNo = normalizeOrderNo(payload.orderNo)
  const paymentChannel = normalizePaymentChannel(payload.paymentChannel)
  const provider = resolvePaymentProvider(payload.provider || 'MOCK')

  await lockPaymentOrderRow(tx, orderType, orderNo)
  const order = await readOrderForPayment(tx, orderType, orderNo)
  assertOrderCanCreatePaymentIntent(orderType, order, userId)

  const amount = toAmountNumber(order.totalAmount)
  const intent = await provider.createPaymentIntent({
    orderId: order.id,
    orderType,
    orderNo: order.orderNo,
    userId,
    amount,
    currency: 'CNY',
    subject: orderType === 'MEMBERSHIP' ? `Membership order ${order.orderNo}` : `Recharge order ${order.orderNo}`,
    paymentChannel,
    clientIp: payload.clientIp || null,
    returnUrl: payload.returnUrl || null,
    notifyUrl: payload.notifyUrl || null,
  })

  const paymentTransaction = await recordPaymentTransaction(tx, {
    userId,
    orderType,
    orderNo: order.orderNo,
    expectedAmount: order.totalAmount,
    paidAmount: 0,
    idempotencyKey: `INTENT-${intent.provider}-${orderType}-${order.orderNo}`,
    channelTransactionNo: `INTENT-${intent.providerPaymentId}`,
    provider: intent.provider,
    providerPaymentId: intent.providerPaymentId,
    providerTransactionId: undefined,
    channel: 'OTHER',
    status: 'INTENT_CREATED',
    rawPayload: intent.rawPayloadJson,
  })

  const updatedOrder = getOrderPaymentStatus(orderType, order) === 'PAYING'
    ? order
    : await updateOrderPaymentStatus(tx, orderType, order.id, 'PAYING')

  return serializeMarketingCenterRecord({
    order: updatedOrder,
    paymentIntent: intent,
    paymentTransaction,
  })
}

export const createMarketingPaymentIntent = async (userId: string, payload: PaymentIntentCreateInput) => {
  const result = await runPrismaTransactionWithRetry((tx) => createPaymentIntentInTransaction(tx, userId, payload), {
    operationName: 'create_marketing_payment_intent',
  })
  await invalidateMarketingCenterOverviewCache(userId)
  return result
}

export const preflightPaymentSecretInjection = async (payload: PaymentSecretPreflightInput = {}) => {
  return runPaymentSecretInjectionPreflight(payload)
}

const parseWebhookBody = (payload: PaymentWebhookHandleInput) => {
  if (payload.parsedBody !== undefined) {
    return payload.parsedBody
  }
  const rawBody = String(payload.rawBody || '').trim()
  return rawBody ? JSON.parse(rawBody) : {}
}

const assertWebhookOrderMatches = (order: any, event: any) => {
  if (!order) {
    throw new Error('payment webhook order not found')
  }
  if (String(order.id) !== String(event.orderId)) {
    throw new Error('payment webhook order id mismatch')
  }
  if (event.userId && String(order.userId) !== String(event.userId)) {
    throw new Error('payment webhook user id mismatch')
  }
}

const processPaymentWebhookEventInTransaction = async (tx: any, event: any) => {
  const orderType = normalizeCommercialOrderType(event.orderType)
  const orderNo = normalizeOrderNo(event.orderNo)
  const order = await readOrderForPayment(tx, orderType, orderNo, orderType === 'MEMBERSHIP')
  assertWebhookOrderMatches(order, event)

  if (event.status !== 'PAID') {
    return serializeMarketingCenterRecord({
      order,
      ignored: true,
      status: event.status,
    })
  }

  if (getOrderPaymentStatus(orderType, order) === 'BENEFIT_GRANTED') {
    return serializeMarketingCenterRecord({
      order,
      alreadyGranted: true,
      currentBalance: await readCurrentPointBalance(order.userId, tx),
    })
  }

  const input = {
    orderType,
    orderNo,
    paidAmount: event.amount,
    idempotencyKey: event.idempotencyKey,
    channelTransactionNo: event.providerTransactionId,
    provider: event.provider,
    providerPaymentId: event.providerPaymentId,
    providerTransactionId: event.providerTransactionId,
    channel: 'OTHER' as const,
    paidAt: event.paidAt,
    rawPayload: event.rawPayloadJson,
  }

  if (orderType === 'MEMBERSHIP') {
    return confirmMembershipPaymentInTransaction(tx, order.userId, input)
  }
  return confirmRechargePaymentInTransaction(tx, order.userId, input)
}

export const handleMarketingPaymentWebhook = async (payload: PaymentWebhookHandleInput) => {
  const provider = resolvePaymentProvider(payload.provider || 'MOCK')
  const parsedBody = parseWebhookBody(payload)
  const verifyInput = {
    headers: payload.headers || {},
    rawBody: payload.rawBody || JSON.stringify(parsedBody),
    parsedBody,
  }
  const verified = await provider.verifyWebhookSignature(verifyInput)
  if (!verified) {
    throw new Error('payment webhook signature verification failed')
  }

  const event = await provider.parseWebhookEvent(verifyInput)
  const lock = await acquireRedisLock(redisKeys.commercialOrderLock(event.orderType, event.orderNo), REDIS_CONFIG.taskLockTtlMs)
  if (isRedisEnabled() && !lock) {
    throw new Error('payment webhook is already locked')
  }

  try {
    const result = await runPrismaTransactionWithRetry(async (tx) => {
      return processPaymentWebhookEventInTransaction(tx, event)
    }, {
      operationName: 'handle_marketing_payment_webhook',
    })

    await invalidateMarketingCenterOverviewCache(event.userId || null)
    return result
  } finally {
    await releaseRedisLock(lock)
  }
}

const confirmMembershipPaymentInTransaction = async (tx: any, userId: string, input: LocalPaymentConfirmInput) => {
  await tx.$queryRaw`SELECT id FROM membership_orders WHERE order_no = ${input.orderNo} FOR UPDATE`
  const order = await tx.membershipOrder.findUnique({
    where: { orderNo: input.orderNo },
    include: { plan: true },
  })

  if (!order || order.userId !== userId) {
    throw new Error('会员订单不存在')
  }

  if (order.status === 'BENEFIT_GRANTED') {
    return serializeMarketingCenterRecord({
      order,
      alreadyGranted: true,
      currentBalance: await readCurrentPointBalance(userId, tx),
    })
  }

  if (!['PENDING', 'PAYING', 'PAID'].includes(String(order.status))) {
    throw new Error(`会员订单当前状态不允许确认支付: ${order.status}`)
  }

  const paidAmount = normalizePositiveAmount(input.paidAmount, order.totalAmount)
  try {
    assertPaymentAmountMatches(order.totalAmount, paidAmount)
  } catch (error: any) {
    await recordPaymentTransaction(tx, {
      userId,
      orderType: 'MEMBERSHIP',
      orderNo: order.orderNo,
      expectedAmount: order.totalAmount,
      paidAmount,
      idempotencyKey: input.idempotencyKey,
      channelTransactionNo: input.channelTransactionNo,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      providerTransactionId: input.providerTransactionId,
      channel: input.channel,
      status: 'REJECTED',
      paidAt: input.paidAt,
      failureReason: error?.message || '支付金额不一致',
      rawPayload: input.rawPayload,
    })
    throw error
  }

  const paymentTransaction = await recordPaymentTransaction(tx, {
    userId,
    orderType: 'MEMBERSHIP',
    orderNo: order.orderNo,
    expectedAmount: order.totalAmount,
    paidAmount,
    idempotencyKey: input.idempotencyKey,
    channelTransactionNo: input.channelTransactionNo,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    providerTransactionId: input.providerTransactionId,
    channel: input.channel,
    status: 'VERIFIED',
    paidAt: input.paidAt,
    rawPayload: input.rawPayload,
  })

  const paidAt = new Date()
  await tx.membershipOrder.update({
    where: { id: order.id },
    data: {
      status: 'PAID',
      paidAmount,
      paidAt,
    },
  })

  const subscription = await activateMembership(tx, {
    userId,
    levelId: order.levelId,
    sourceType: order.sourceType,
    sourceId: order.id,
    startTime: paidAt,
    durationUnit: order.plan?.durationUnit || 'month',
    durationValue: order.plan?.durationValue || 1,
    bonusPoints: 0,
    metaJson: {
      orderNo: order.orderNo,
      planId: order.planId,
      paymentTransactionId: paymentTransaction.id,
    },
  })

  const membershipGrant = await createSuccessfulBenefitGrant(tx, {
    userId,
    orderType: 'MEMBERSHIP',
    orderNo: order.orderNo,
    grantType: 'MEMBERSHIP',
    benefitId: subscription.id,
    paymentTransactionId: paymentTransaction.id,
    amount: 1,
    reason: '会员订单支付确认后发放会员权益',
    metaJson: {
      subscriptionId: subscription.id,
      levelId: order.levelId,
      paymentTransactionId: paymentTransaction.id,
    },
  })

  let bonusPointLog = null
  let bonusPointGrant = null
  if ((order.bonusPoints || 0) > 0) {
    bonusPointLog = await appendPointLog(tx, {
      userId,
      subscriptionId: subscription.id,
      changeType: 'MEMBERSHIP_BONUS',
      action: 'INCREASE',
      changeAmount: order.bonusPoints,
      sourceType: 'MEMBERSHIP_ORDER',
      sourceId: order.id,
      associationNo: order.orderNo,
      idempotencyKey: `POINT-MEMBERSHIP-BONUS-${order.orderNo}`,
      remark: '会员订单赠送积分到账',
      metaJson: {
        orderNo: order.orderNo,
        paymentTransactionId: paymentTransaction.id,
      },
    })

    bonusPointGrant = await createSuccessfulBenefitGrant(tx, {
      userId,
      orderType: 'MEMBERSHIP',
      orderNo: order.orderNo,
      grantType: 'MEMBERSHIP_BONUS_POINTS',
      benefitId: bonusPointLog.id,
      paymentTransactionId: paymentTransaction.id,
      amount: order.bonusPoints,
      reason: '会员订单支付确认后发放赠送积分',
      metaJson: {
        pointLogId: bonusPointLog.id,
        paymentTransactionId: paymentTransaction.id,
      },
    })
  }

  const updatedOrder = await tx.membershipOrder.update({
    where: { id: order.id },
    data: {
      status: 'BENEFIT_GRANTED',
      startTime: subscription.startTime,
      endTime: subscription.endTime,
    },
  })

  return serializeMarketingCenterRecord({
    order: updatedOrder,
    subscription,
    paymentTransaction,
    benefitGrants: [membershipGrant, bonusPointGrant].filter(Boolean),
    pointLog: bonusPointLog,
    currentBalance: await readCurrentPointBalance(userId, tx),
  })
}

const confirmRechargePaymentInTransaction = async (tx: any, userId: string, input: LocalPaymentConfirmInput) => {
  await tx.$queryRaw`SELECT id FROM recharge_orders WHERE order_no = ${input.orderNo} FOR UPDATE`
  const order = await tx.rechargeOrder.findUnique({
    where: { orderNo: input.orderNo },
  })

  if (!order || order.userId !== userId) {
    throw new Error('充值订单不存在')
  }

  if (order.payStatus === 'BENEFIT_GRANTED') {
    return serializeMarketingCenterRecord({
      order,
      alreadyGranted: true,
      currentBalance: await readCurrentPointBalance(userId, tx),
    })
  }

  if (!['PENDING', 'PAYING', 'PAID'].includes(String(order.payStatus))) {
    throw new Error(`充值订单当前状态不允许确认支付: ${order.payStatus}`)
  }

  const paidAmount = normalizePositiveAmount(input.paidAmount, order.totalAmount)
  try {
    assertPaymentAmountMatches(order.totalAmount, paidAmount)
  } catch (error: any) {
    await recordPaymentTransaction(tx, {
      userId,
      orderType: 'RECHARGE',
      orderNo: order.orderNo,
      expectedAmount: order.totalAmount,
      paidAmount,
      idempotencyKey: input.idempotencyKey,
      channelTransactionNo: input.channelTransactionNo,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      providerTransactionId: input.providerTransactionId,
      channel: input.channel,
      status: 'REJECTED',
      paidAt: input.paidAt,
      failureReason: error?.message || '支付金额不一致',
      rawPayload: input.rawPayload,
    })
    throw error
  }

  const paymentTransaction = await recordPaymentTransaction(tx, {
    userId,
    orderType: 'RECHARGE',
    orderNo: order.orderNo,
    expectedAmount: order.totalAmount,
    paidAmount,
    idempotencyKey: input.idempotencyKey,
    channelTransactionNo: input.channelTransactionNo,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    providerTransactionId: input.providerTransactionId,
    channel: input.channel,
    status: 'VERIFIED',
    paidAt: input.paidAt,
    rawPayload: input.rawPayload,
  })

  const totalPoints = (order.points || 0) + (order.bonusPoints || 0)
  const pointLog = await appendPointLog(tx, {
    userId,
    rechargeOrderId: order.id,
    changeType: 'RECHARGE',
    action: 'INCREASE',
    changeAmount: totalPoints,
    sourceType: 'RECHARGE_ORDER',
    sourceId: order.id,
    associationNo: order.orderNo,
    idempotencyKey: `POINT-RECHARGE-${order.orderNo}`,
    remark: '充值订单支付确认后积分到账',
    metaJson: {
      points: order.points,
      bonusPoints: order.bonusPoints,
      paymentTransactionId: paymentTransaction.id,
    },
  })

  const pointGrant = await createSuccessfulBenefitGrant(tx, {
    userId,
    orderType: 'RECHARGE',
    orderNo: order.orderNo,
    grantType: 'POINTS',
    benefitId: pointLog.id,
    paymentTransactionId: paymentTransaction.id,
    amount: totalPoints,
    reason: '充值订单支付确认后发放积分',
    metaJson: {
      pointLogId: pointLog.id,
      paymentTransactionId: paymentTransaction.id,
    },
  })

  const updatedOrder = await tx.rechargeOrder.update({
    where: { id: order.id },
    data: {
      payStatus: 'BENEFIT_GRANTED',
      paidAmount,
      paidAt: new Date(),
    },
  })

  return serializeMarketingCenterRecord({
    order: updatedOrder,
    pointLog,
    paymentTransaction,
    benefitGrants: [pointGrant],
    currentBalance: await readCurrentPointBalance(userId, tx),
  })
}

export const confirmLocalPaymentAndGrantBenefits = async (userId: string, payload: LocalPaymentConfirmInput) => {
  if (!isLocalPaymentSimulationEnabled()) {
    throw new Error('本地支付确认未启用，生产环境禁止使用该入口')
  }

  const orderType = normalizeCommercialOrderType(payload.orderType)
  const orderNo = normalizeOrderNo(payload.orderNo)
  const lock = await acquireRedisLock(redisKeys.commercialOrderLock(orderType, orderNo), REDIS_CONFIG.taskLockTtlMs)
  if (isRedisEnabled() && !lock) {
    throw new Error('local payment confirmation is already locked')
  }

  try {
    const result = await runPrismaTransactionWithRetry(async (tx) => {
      const input = {
        ...payload,
        orderType,
        orderNo,
        rawPayload: {
          ...(payload.rawPayload && typeof payload.rawPayload === 'object' && !Array.isArray(payload.rawPayload)
            ? payload.rawPayload as Record<string, unknown>
            : {}),
          localSimulation: true,
          willCallProvider: false,
        },
      }

      if (orderType === 'MEMBERSHIP') {
        return confirmMembershipPaymentInTransaction(tx, userId, input)
      }

      return confirmRechargePaymentInTransaction(tx, userId, input)
    }, {
      operationName: 'confirm_local_payment_and_grant_benefits',
    })

    await invalidateMarketingCenterOverviewCache(userId)
    return result
  } finally {
    await releaseRedisLock(lock)
  }
}

export const __commercialPaymentTestHooks = {
  createPaymentIntentInTransaction,
  processPaymentWebhookEventInTransaction,
  confirmMembershipPaymentInTransaction,
  confirmRechargePaymentInTransaction,
  isLocalPaymentSimulationEnabled,
  normalizeCommercialOrderType,
  normalizeOrderNo,
  recordPaymentTransaction,
  sanitizePaymentRawPayload,
}

export const redeemCardCode = async (userId: string, code: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const normalizedCode = String(code || '').trim().toUpperCase()
    if (!normalizedCode) {
      throw new Error('请输入卡密')
    }

    const cardCode = await tx.cardCode.findFirst({
      where: { code: normalizedCode },
      include: {
        batch: true,
        rewardLevel: true,
      },
    })

    if (!cardCode) {
      throw new Error('卡密不存在')
    }
    if (cardCode.status !== 'UNUSED') {
      throw new Error('该卡密已使用或不可用')
    }
    if (!cardCode.batch.isEnabled) {
      throw new Error('当前卡密批次已停用')
    }
    if (cardCode.expiresAt && cardCode.expiresAt.getTime() < Date.now()) {
      await tx.cardCode.update({
        where: { id: cardCode.id },
        data: { status: 'EXPIRED' },
      })
      throw new Error('该卡密已过期')
    }

    const redeemRecord = await tx.cardRedeemRecord.create({
      data: {
        cardCodeId: cardCode.id,
        batchId: cardCode.batchId,
        userId,
        rewardType: cardCode.batch.rewardType,
        rewardPoints: cardCode.batch.rewardPoints,
        rewardLevelId: cardCode.batch.rewardLevelId,
        rewardDays: cardCode.batch.rewardDays,
        remark: '卡密兑换成功',
      },
    })

    await tx.cardCode.update({
      where: { id: cardCode.id },
      data: {
        status: 'USED',
        usedByUserId: userId,
        usedAt: new Date(),
      },
    })

    await tx.cardBatch.update({
      where: { id: cardCode.batchId },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    })

    let subscription = null
    if (cardCode.batch.rewardType === 'POINTS') {
      await appendPointLog(tx, {
        userId,
        changeType: 'CARD_REDEEM',
        action: 'INCREASE',
        changeAmount: cardCode.batch.rewardPoints,
        sourceType: 'CARD_REDEEM',
        sourceId: redeemRecord.id,
        associationNo: cardCode.code,
        remark: '卡密兑换积分到账',
        metaJson: {
          batchId: cardCode.batchId,
          cardCodeId: cardCode.id,
        },
      })
    } else if (cardCode.batch.rewardLevelId) {
      const order = await tx.membershipOrder.create({
        data: {
          userId,
          levelId: cardCode.batch.rewardLevelId,
          planId: null,
          orderNo: buildSerialNo('CDK'),
          sourceType: 'CARD_REDEEM',
          status: 'PAID',
          totalAmount: 0,
          paidAmount: 0,
          bonusPoints: 0,
          paidAt: new Date(),
          metaJson: {
            redeemRecordId: redeemRecord.id,
            cardCode: cardCode.code,
          },
        },
      })

      subscription = await activateMembership(tx, {
        userId,
        levelId: cardCode.batch.rewardLevelId,
        sourceType: 'CARD_REDEEM',
        sourceId: order.id,
        durationDays: cardCode.batch.rewardDays || 30,
        bonusPoints: 0,
        metaJson: { redeemRecordId: redeemRecord.id },
      })

      await tx.membershipOrder.update({
        where: { id: order.id },
        data: {
          startTime: subscription.startTime,
          endTime: subscription.endTime,
        },
      })
    }

    return {
      redeemRecord,
      subscription,
      currentBalance: await readCurrentPointBalance(userId, tx),
    }
  })

  await invalidateMarketingCenterOverviewCache(userId)
  return result
}
