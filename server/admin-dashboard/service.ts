import { invalidateRedisCachePatterns, invalidateRedisCaches } from '../redis/cache-manager'
import { getOrSetJsonCache } from '../redis/json-cache'
import { redisKeys } from '../redis/keys'
import { prisma } from '../db/prisma'
import { getDefaultProviderOverview } from '../provider-config/service'
import { buildAdminAuditBusinessView } from '../admin-audit-logs/service'

const ADMIN_DASHBOARD_OVERVIEW_SCOPE = 'admin-dashboard-overview'
const ADMIN_DASHBOARD_OVERVIEW_CACHE_PATTERN = redisKeys.cache(ADMIN_DASHBOARD_OVERVIEW_SCOPE, '*')
const buildAdminDashboardOverviewCacheKey = (currentUserId: string) => redisKeys.cache(ADMIN_DASHBOARD_OVERVIEW_SCOPE, currentUserId)

const startOfDay = (date: Date) => {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

const endOfDay = (date: Date) => {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

const formatDayLabel = (date: Date) => {
  return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

// 构建最近若干天的趋势统计，先用逐日 count，避免一次性引入复杂聚合。
const SENSITIVE_RISK_KEY_PATTERN = /(rawPayloadJson|api.?key|access.?key|secret|token|password|cookie|authorization|signature|private.?key|certificate|signed.?url|base64|credential|encrypted)/i

const sanitizeRiskOverviewValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => sanitizeRiskOverviewValue(item))
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const safeEntries = entries
      .filter(([key]) => !SENSITIVE_RISK_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeRiskOverviewValue(item)])
    return {
      ...Object.fromEntries(safeEntries),
      ...(safeEntries.length < entries.length ? { redactedFields: entries.length - safeEntries.length } : {}),
    }
  }
  return value
}

const toIsoString = (value: unknown) => {
  if (value instanceof Date) return value.toISOString()
  return String(value || '')
}

const readMetaRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, unknown>
  }
  return value as Record<string, unknown>
}

const buildEmptyRiskOverview = () => ({
  readonly: true,
  generatedAt: new Date().toISOString(),
  orderSummary: {
    todayOrderCount: 0,
    last7DaysOrderCount: 0,
    membershipOrderCount: 0,
    rechargeOrderCount: 0,
    statusCounts: {
      PENDING: 0,
      PAYING: 0,
      PAID: 0,
      BENEFIT_GRANTED: 0,
      FAILED: 0,
      REFUNDING: 0,
      REFUNDED: 0,
    },
    recentRiskOrders: [] as Array<Record<string, unknown>>,
  },
  failedTaskSummary: {
    failedCount: 0,
    stoppedCount: 0,
    last7DaysFailedCount: 0,
    recentFailedTasks: [] as Array<Record<string, unknown>>,
  },
  pointRiskSummary: {
    compensableCount: 0,
    pendingRefundCount: 0,
    manualAdjustmentCount: 0,
    recentPointRisks: [] as Array<Record<string, unknown>>,
  },
  auditRiskSummary: {
    highRiskCount: 0,
    recentHighRiskLogs: [] as Array<Record<string, unknown>>,
  },
})

const buildDailyTrend = async (input: {
  days: number
  count: (range: { start: Date; end: Date }) => Promise<number>
}) => {
  const today = startOfDay(new Date())
  const items: Array<{ label: string; value: number }> = []

  for (let offset = input.days - 1; offset >= 0; offset -= 1) {
    const start = new Date(today)
    start.setDate(today.getDate() - offset)
    const end = endOfDay(start)

    items.push({
      label: formatDayLabel(start),
      value: await input.count({ start, end }),
    })
  }

  return items
}

const countMembershipOrdersByStatus = async () => {
  const grouped = await prisma.membershipOrder.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  return Object.fromEntries(grouped.map(item => [String(item.status), item._count._all]))
}

const countRechargeOrdersByStatus = async () => {
  const grouped = await prisma.rechargeOrder.groupBy({
    by: ['payStatus'],
    _count: { _all: true },
  })
  return Object.fromEntries(grouped.map(item => [String(item.payStatus), item._count._all]))
}

const mergeStatusCounts = (...items: Array<Record<string, number>>) => {
  const keys = ['PENDING', 'PAYING', 'PAID', 'BENEFIT_GRANTED', 'FAILED', 'REFUNDING', 'REFUNDED']
  return Object.fromEntries(keys.map(key => [
    key,
    items.reduce((sum, item) => sum + Number(item[key] || 0), 0),
  ]))
}

const buildOrderRiskSummary = async (todayStart: Date, last7DaysStart: Date) => {
  const [
    todayMembershipOrderCount,
    todayRechargeOrderCount,
    last7DaysMembershipOrderCount,
    last7DaysRechargeOrderCount,
    membershipOrderCount,
    rechargeOrderCount,
    membershipStatusCounts,
    rechargeStatusCounts,
    riskMembershipOrders,
    riskRechargeOrders,
  ] = await Promise.all([
    prisma.membershipOrder.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.rechargeOrder.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.membershipOrder.count({ where: { createdAt: { gte: last7DaysStart } } }),
    prisma.rechargeOrder.count({ where: { createdAt: { gte: last7DaysStart } } }),
    prisma.membershipOrder.count(),
    prisma.rechargeOrder.count(),
    countMembershipOrdersByStatus(),
    countRechargeOrdersByStatus(),
    prisma.membershipOrder.findMany({
      where: {
        OR: [
          { status: { in: ['FAILED', 'REFUNDING', 'REFUNDED', 'PARTIAL_REFUNDED'] } },
          { status: 'PAID' },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        level: { select: { name: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.rechargeOrder.findMany({
      where: {
        OR: [
          { payStatus: { in: ['FAILED', 'REFUNDING', 'REFUNDED', 'PARTIAL_REFUNDED'] } },
          { payStatus: 'PAID' },
          { refundStatus: { in: ['PROCESSING', 'FAILED'] } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        rechargePackage: { select: { name: true } },
      },
    }),
  ])

  const recentRiskOrders = [
    ...riskMembershipOrders.map(order => ({
      id: order.id,
      orderType: 'MEMBERSHIP',
      orderNo: order.orderNo,
      title: order.plan?.name || order.level?.name || 'Membership order',
      status: String(order.status || ''),
      paymentStatus: String(order.status || ''),
      benefitStatus: order.status === 'BENEFIT_GRANTED' ? 'SUCCESS' : 'PENDING',
      userLabel: order.user?.name || order.user?.email || order.user?.phone || order.user?.id || '',
      createdAt: toIsoString(order.createdAt),
    })),
    ...riskRechargeOrders.map(order => ({
      id: order.id,
      orderType: 'RECHARGE',
      orderNo: order.orderNo,
      title: order.rechargePackage?.name || 'Recharge order',
      status: String(order.payStatus || ''),
      paymentStatus: String(order.payStatus || ''),
      benefitStatus: order.payStatus === 'BENEFIT_GRANTED' ? 'SUCCESS' : 'PENDING',
      refundStatus: String(order.refundStatus || ''),
      userLabel: order.user?.name || order.user?.email || order.user?.phone || order.user?.id || '',
      createdAt: toIsoString(order.createdAt),
    })),
  ]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 5)

  return sanitizeRiskOverviewValue({
    todayOrderCount: todayMembershipOrderCount + todayRechargeOrderCount,
    last7DaysOrderCount: last7DaysMembershipOrderCount + last7DaysRechargeOrderCount,
    membershipOrderCount,
    rechargeOrderCount,
    statusCounts: mergeStatusCounts(membershipStatusCounts, rechargeStatusCounts),
    recentRiskOrders,
  })
}

const buildFailedTaskRiskSummary = async (last7DaysStart: Date) => {
  const [failedCount, stoppedCount, last7DaysFailedCount, recentFailedTasks] = await Promise.all([
    prisma.generationRecord.count({ where: { status: 'FAILED' } }),
    prisma.generationRecord.count({ where: { status: 'STOPPED' } }),
    prisma.generationRecord.count({
      where: {
        status: { in: ['FAILED', 'STOPPED'] },
        createdAt: { gte: last7DaysStart },
      },
    }),
    prisma.generationRecord.findMany({
      where: { status: { in: ['FAILED', 'STOPPED'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    }),
  ])

  return sanitizeRiskOverviewValue({
    failedCount,
    stoppedCount,
    last7DaysFailedCount,
    recentFailedTasks: recentFailedTasks.map(task => ({
      id: task.id,
      status: String(task.status || ''),
      type: String(task.type || ''),
      model: task.modelLabel || task.modelKey || '',
      errorSummary: String(task.errorMessage || '').slice(0, 160),
      userLabel: task.user?.name || task.user?.email || task.user?.phone || task.user?.id || '',
      createdAt: toIsoString(task.createdAt),
      updatedAt: toIsoString(task.updatedAt),
    })),
  })
}

// 查询当前登录用户可见的后台仪表盘概览数据。
const buildPointRiskSummary = async (last7DaysStart: Date) => {
  const [consumeLogs, manualAdjustmentCount, recentManualAdjustments] = await Promise.all([
    prisma.pointAccountLog.findMany({
      where: {
        sourceType: 'GENERATION_CONSUME',
        changeType: 'CONSUME',
        createdAt: { gte: last7DaysStart },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
    prisma.pointAccountLog.count({
      where: {
        sourceType: 'ADMIN_ADJUST',
        createdAt: { gte: last7DaysStart },
      },
    }),
    prisma.pointAccountLog.findMany({
      where: {
        sourceType: 'ADMIN_ADJUST',
        createdAt: { gte: last7DaysStart },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    }),
  ])

  const associationNos = consumeLogs.map(log => String(log.associationNo || log.sourceId || '').trim()).filter(Boolean)
  const generationRecordIds = consumeLogs.map(log => String(readMetaRecord(log.metaJson).generationRecordId || '').trim()).filter(Boolean)
  const [refundLogs, generationRecords] = await Promise.all([
    associationNos.length
      ? prisma.pointAccountLog.findMany({
          where: {
            sourceType: 'GENERATION_CONSUME',
            changeType: 'REFUND',
            associationNo: { in: associationNos },
          },
          select: { associationNo: true },
        })
      : Promise.resolve([]),
    generationRecordIds.length
      ? prisma.generationRecord.findMany({
          where: { id: { in: generationRecordIds } },
          select: { id: true, status: true, errorMessage: true },
        })
      : Promise.resolve([]),
  ])
  const refundedAssociationNos = new Set(refundLogs.map(log => String(log.associationNo || '').trim()).filter(Boolean))
  const generationRecordMap = new Map(generationRecords.map(record => [record.id, record]))
  const compensableLogs = consumeLogs.filter((log) => {
    const associationNo = String(log.associationNo || log.sourceId || '').trim()
    const generationRecordId = String(readMetaRecord(log.metaJson).generationRecordId || '').trim()
    const generationRecord = generationRecordId ? generationRecordMap.get(generationRecordId) : null
    return Boolean(
      associationNo
      && !refundedAssociationNos.has(associationNo)
      && generationRecord
      && ['FAILED', 'STOPPED'].includes(String(generationRecord.status || '')),
    )
  })

  return sanitizeRiskOverviewValue({
    compensableCount: compensableLogs.length,
    pendingRefundCount: compensableLogs.length,
    manualAdjustmentCount,
    recentPointRisks: [
      ...compensableLogs.slice(0, 5).map(log => ({
        id: log.id,
        riskType: 'PENDING_REFUND',
        associationNo: log.associationNo || log.sourceId || '',
        pointAmount: Number(log.changeAmount || 0),
        sourceType: String(log.sourceType || ''),
        createdAt: toIsoString(log.createdAt),
      })),
      ...recentManualAdjustments.map(log => ({
        id: log.id,
        riskType: 'ADMIN_ADJUST',
        associationNo: log.associationNo || log.sourceId || '',
        pointAmount: Number(log.changeAmount || 0),
        action: String(log.action || ''),
        userLabel: log.user?.name || log.user?.email || log.user?.phone || log.user?.id || '',
        createdAt: toIsoString(log.createdAt),
      })),
    ].slice(0, 5),
  })
}

const buildAuditRiskSummary = async (last7DaysStart: Date) => {
  const highRiskWhere = {
    createdAt: { gte: last7DaysStart },
    OR: [
      { action: { contains: 'delete' } },
      { action: { contains: 'clear' } },
      { action: { contains: 'provider' } },
      { action: { contains: 'storage' } },
      { action: { contains: 'system_config' } },
      { targetType: { contains: 'redis' } },
      { targetType: { contains: 'system' } },
    ],
  }
  const [highRiskCount, recentLogs] = await Promise.all([
    prisma.adminAuditLog.count({ where: highRiskWhere }),
    prisma.adminAuditLog.findMany({
      where: highRiskWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    }),
  ])

  return sanitizeRiskOverviewValue({
    highRiskCount,
    recentHighRiskLogs: recentLogs.map((log) => {
      const view = buildAdminAuditBusinessView({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        beforeJson: log.beforeJson,
        afterJson: log.afterJson,
      })
      return {
        id: log.id,
        operatorLabel: log.operatorUserId || '',
        businessModule: view.businessModule,
        businessSummary: view.businessSummary,
        riskLevel: view.riskLevel,
        createdAt: toIsoString(log.createdAt),
      }
    }),
  })
}

const buildAdminDashboardRiskOverview = async () => {
  const now = new Date()
  const todayStart = startOfDay(now)
  const last7DaysStart = startOfDay(now)
  last7DaysStart.setDate(last7DaysStart.getDate() - 6)

  const [orderSummary, failedTaskSummary, pointRiskSummary, auditRiskSummary] = await Promise.all([
    buildOrderRiskSummary(todayStart, last7DaysStart),
    buildFailedTaskRiskSummary(last7DaysStart),
    buildPointRiskSummary(last7DaysStart),
    buildAuditRiskSummary(last7DaysStart),
  ])

  return {
    readonly: true,
    generatedAt: now.toISOString(),
    orderSummary,
    failedTaskSummary,
    pointRiskSummary,
    auditRiskSummary,
  }
}

export const getAdminDashboardOverview = async (currentUserId: string) => {
  const normalizedUserId = String(currentUserId || '').trim()
  return getOrSetJsonCache({
    key: buildAdminDashboardOverviewCacheKey(normalizedUserId),
    ttlSeconds: 60,
    factory: async () => {
      const todayStart = startOfDay(new Date())
      const todayEnd = endOfDay(new Date())

      const [
        totalAssets,
        publishedAssets,
        draftAssets,
        totalGenerationRecords,
        completedGenerationRecords,
        failedGenerationRecords,
        todayGenerationRecords,
        enabledStorageConfig,
        totalStorageConfigs,
        providerOverview,
      ] = await Promise.all([
        prisma.assetItem.count({
          where: {
            userId: normalizedUserId,
            isDeleted: false,
          },
        }),
        prisma.assetItem.count({
          where: {
            userId: normalizedUserId,
            isDeleted: false,
            publishStatus: 'PUBLISHED',
          },
        }),
        prisma.assetItem.count({
          where: {
            userId: normalizedUserId,
            isDeleted: false,
            publishStatus: 'DRAFT',
          },
        }),
        prisma.generationRecord.count({
          where: {
            userId: normalizedUserId,
          },
        }),
        prisma.generationRecord.count({
          where: {
            userId: normalizedUserId,
            status: 'COMPLETED',
          },
        }),
        prisma.generationRecord.count({
          where: {
            userId: normalizedUserId,
            status: 'FAILED',
          },
        }),
        prisma.generationRecord.count({
          where: {
            userId: normalizedUserId,
            createdAt: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        }),
        prisma.objectStorageConfig.findFirst({
          where: {
            userId: null,
            scene: 'global',
            isEnabled: true,
          },
          orderBy: [
            { isDefault: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        }),
        prisma.objectStorageConfig.count({
          where: {
            userId: null,
            scene: 'global',
          },
        }),
        getDefaultProviderOverview(),
      ])

      const [generationTrend, assetTrend] = await Promise.all([
        buildDailyTrend({
          days: 7,
          count: ({ start, end }) => prisma.generationRecord.count({
            where: {
              userId: normalizedUserId,
              createdAt: {
                gte: start,
                lte: end,
              },
            },
          }),
        }),
        buildDailyTrend({
          days: 7,
          count: ({ start, end }) => prisma.assetItem.count({
            where: {
              userId: normalizedUserId,
              isDeleted: false,
              createdAt: {
                gte: start,
                lte: end,
              },
            },
          }),
        }),
      ])

      const riskOverview = await buildAdminDashboardRiskOverview()

      return {
        asset: {
          total: totalAssets,
          published: publishedAssets,
          draft: draftAssets,
          trend: assetTrend,
        },
        generation: {
          total: totalGenerationRecords,
          completed: completedGenerationRecords,
          failed: failedGenerationRecords,
          today: todayGenerationRecords,
          trend: generationTrend,
        },
        runtime: {
          enabledStorageName: enabledStorageConfig?.name || '',
          enabledStorageCode: enabledStorageConfig?.code || '',
          totalStorageConfigs,
          providerBaseUrl: providerOverview?.baseUrl || '',
          providerName: providerOverview?.name || '默认生成厂商',
        },
        riskOverview,
      }
    },
  })
}

export const invalidateAdminDashboardOverviewCache = async (currentUserId?: string | null) => {
  const normalizedUserId = String(currentUserId || '').trim()
  if (normalizedUserId) {
    await invalidateRedisCaches([buildAdminDashboardOverviewCacheKey(normalizedUserId)])
    return
  }

  await invalidateRedisCachePatterns([ADMIN_DASHBOARD_OVERVIEW_CACHE_PATTERN])
}

export const __adminDashboardTestHooks = {
  buildEmptyRiskOverview,
  sanitizeRiskOverviewValue,
}
