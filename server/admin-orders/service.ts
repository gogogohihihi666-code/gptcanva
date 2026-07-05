import prisma from '../db/prisma'
import { buildPageResult, resolvePagination } from '../shared/pagination'
import type { AdminOrdersQuery } from './shared'

type AdminOrderType = 'MEMBERSHIP' | 'RECHARGE'

interface OrderPair {
  orderType: AdminOrderType
  orderNo: string
}

const isDecimalLike = (value: unknown): value is { toString: () => string } => {
  return Boolean(
    value
    && typeof value === 'object'
    && (
      typeof (value as { toNumber?: () => number }).toNumber === 'function'
      || (value as { constructor?: { name?: string } }).constructor?.name === 'Decimal'
    ),
  )
}

const serializeValue = <T>(value: T): T => {
  if (typeof value === 'bigint') return Number(value) as T
  if (isDecimalLike(value)) return value.toString() as T
  if (value instanceof Date) return value.toISOString() as T
  if (Array.isArray(value)) return value.map((item) => serializeValue(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializeValue(item)]),
    ) as T
  }
  return value
}

const parseDateBoundary = (value: string, endOfDay = false) => {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    date.setHours(23, 59, 59, 999)
  }
  return date
}

const buildCreatedAtWhere = (query: AdminOrdersQuery) => {
  const gte = parseDateBoundary(query.createdFrom)
  const lte = parseDateBoundary(query.createdTo, true)
  if (!gte && !lte) return undefined
  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  }
}

const buildMembershipWhere = (query: AdminOrdersQuery) => {
  const keyword = query.keyword
  return {
    ...(query.orderStatus !== 'ALL' ? { status: query.orderStatus as any } : {}),
    ...(buildCreatedAtWhere(query) ? { createdAt: buildCreatedAtWhere(query) } : {}),
    ...(keyword
      ? {
          OR: [
            { orderNo: { contains: keyword } },
            { user: { id: { contains: keyword } } },
            { user: { name: { contains: keyword } } },
            { user: { email: { contains: keyword } } },
            { user: { phone: { contains: keyword } } },
            { level: { name: { contains: keyword } } },
            { plan: { name: { contains: keyword } } },
          ],
        }
      : {}),
  }
}

const buildRechargeWhere = (query: AdminOrdersQuery) => {
  const keyword = query.keyword
  return {
    ...(query.orderStatus !== 'ALL' ? { payStatus: query.orderStatus as any } : {}),
    ...(buildCreatedAtWhere(query) ? { createdAt: buildCreatedAtWhere(query) } : {}),
    ...(keyword
      ? {
          OR: [
            { orderNo: { contains: keyword } },
            { user: { id: { contains: keyword } } },
            { user: { name: { contains: keyword } } },
            { user: { email: { contains: keyword } } },
            { user: { phone: { contains: keyword } } },
            { rechargePackage: { name: { contains: keyword } } },
          ],
        }
      : {}),
  }
}

const buildPairKey = (pair: OrderPair) => `${pair.orderType}:${pair.orderNo}`

const summarizePaymentTransactions = (transactions: any[]) => {
  const sorted = [...transactions].sort((left, right) => {
    const rightTime = new Date(right.createdAt || right.paidAt || 0).getTime()
    const leftTime = new Date(left.createdAt || left.paidAt || 0).getTime()
    return rightTime - leftTime
  })
  const latest = sorted[0] || null

  return serializeValue({
    count: sorted.length,
    latestStatus: latest ? String(latest.status || '') : 'NO_TRANSACTION',
    latest: latest
      ? {
          id: latest.id,
          provider: latest.provider,
          channel: latest.channel,
          status: latest.status,
          expectedAmount: latest.expectedAmount,
          paidAmount: latest.paidAmount,
          currency: latest.currency,
          verifiedAt: latest.verifiedAt,
          paidAt: latest.paidAt,
        }
      : null,
  })
}

const summarizeBenefitGrants = (grants: any[]) => {
  const sorted = [...grants].sort((left, right) => {
    const rightTime = new Date(right.createdAt || right.grantedAt || 0).getTime()
    const leftTime = new Date(left.createdAt || left.grantedAt || 0).getTime()
    return rightTime - leftTime
  })
  const latest = sorted[0] || null
  const counts = sorted.reduce<Record<string, number>>((acc, grant) => {
    const status = String(grant.status || 'UNKNOWN')
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return serializeValue({
    count: sorted.length,
    latestStatus: latest ? String(latest.status || '') : 'NO_GRANT',
    counts,
    latest: latest
      ? {
          id: latest.id,
          grantType: latest.grantType,
          status: latest.status,
          amount: latest.amount,
          grantedAt: latest.grantedAt,
          revokedAt: latest.revokedAt,
          reason: latest.reason,
        }
      : null,
  })
}

const mapMembershipOrder = (order: any, payments: any[], grants: any[]) => ({
  id: order.id,
  orderType: 'MEMBERSHIP' as AdminOrderType,
  orderNo: order.orderNo,
  orderStatus: String(order.status || ''),
  paymentStatus: String(order.status || ''),
  refundStatus: order.refundedAt ? 'REFUNDED' : 'NONE',
  title: order.plan?.name || order.level?.name || 'Membership order',
  totalAmount: order.totalAmount,
  paidAmount: order.paidAmount,
  currency: 'CNY',
  points: order.bonusPoints || 0,
  bonusPoints: order.bonusPoints || 0,
  channel: '',
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  paidAt: order.paidAt,
  canceledAt: order.canceledAt,
  refundedAt: order.refundedAt,
  user: order.user
    ? {
        id: order.user.id,
        name: order.user.name || '',
        email: order.user.email || '',
        phone: order.user.phone || '',
      }
    : null,
  membership: {
    levelName: order.level?.name || '',
    planName: order.plan?.name || '',
    startTime: order.startTime,
    endTime: order.endTime,
    sourceType: order.sourceType,
  },
  recharge: null,
  paymentTransactions: summarizePaymentTransactions(payments),
  benefitGrants: summarizeBenefitGrants(grants),
})

const mapRechargeOrder = (order: any, payments: any[], grants: any[]) => ({
  id: order.id,
  orderType: 'RECHARGE' as AdminOrderType,
  orderNo: order.orderNo,
  orderStatus: String(order.payStatus || ''),
  paymentStatus: String(order.payStatus || ''),
  refundStatus: String(order.refundStatus || ''),
  title: order.rechargePackage?.name || 'Recharge order',
  totalAmount: order.totalAmount,
  paidAmount: order.paidAmount,
  currency: 'CNY',
  points: order.points || 0,
  bonusPoints: order.bonusPoints || 0,
  channel: order.payChannel || '',
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  paidAt: order.paidAt,
  canceledAt: null,
  refundedAt: order.refundedAt,
  user: order.user
    ? {
        id: order.user.id,
        name: order.user.name || '',
        email: order.user.email || '',
        phone: order.user.phone || '',
      }
    : null,
  membership: null,
  recharge: {
    packageName: order.rechargePackage?.name || '',
    packageLabel: order.rechargePackage?.label || '',
  },
  paymentTransactions: summarizePaymentTransactions(payments),
  benefitGrants: summarizeBenefitGrants(grants),
})

const matchesDerivedFilters = (item: any, query: AdminOrdersQuery) => {
  if (query.paymentStatus !== 'ALL' && item.paymentTransactions.latestStatus !== query.paymentStatus) {
    return false
  }
  if (query.benefitStatus !== 'ALL' && item.benefitGrants.latestStatus !== query.benefitStatus) {
    return false
  }
  return true
}

const groupByPair = (records: any[]) => {
  const grouped = new Map<string, any[]>()
  records.forEach((record) => {
    const key = buildPairKey({
      orderType: String(record.orderType || '') as AdminOrderType,
      orderNo: String(record.orderNo || ''),
    })
    grouped.set(key, [...(grouped.get(key) || []), record])
  })
  return grouped
}

export const listAdminOrders = async (query: AdminOrdersQuery) => {
  const [membershipOrders, rechargeOrders] = await Promise.all([
    query.orderType === 'RECHARGE'
      ? Promise.resolve([])
      : prisma.membershipOrder.findMany({
          where: buildMembershipWhere(query),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            user: true,
            level: true,
            plan: true,
          },
        }),
    query.orderType === 'MEMBERSHIP'
      ? Promise.resolve([])
      : prisma.rechargeOrder.findMany({
          where: buildRechargeWhere(query),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            user: true,
            rechargePackage: true,
          },
        }),
  ])

  const pairs = [
    ...membershipOrders.map((order: any) => ({ orderType: 'MEMBERSHIP' as const, orderNo: order.orderNo })),
    ...rechargeOrders.map((order: any) => ({ orderType: 'RECHARGE' as const, orderNo: order.orderNo })),
  ].filter((pair) => pair.orderNo)

  const [paymentTransactions, benefitGrants] = pairs.length
    ? await Promise.all([
        prisma.paymentTransaction.findMany({
          where: {
            OR: pairs.map((pair) => ({
              orderType: pair.orderType,
              orderNo: pair.orderNo,
            })),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.benefitGrant.findMany({
          where: {
            OR: pairs.map((pair) => ({
              orderType: pair.orderType,
              orderNo: pair.orderNo,
            })),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ])
    : [[], []]

  const paymentMap = groupByPair(paymentTransactions)
  const benefitMap = groupByPair(benefitGrants)
  const allItems = [
    ...membershipOrders.map((order: any) => mapMembershipOrder(
      order,
      paymentMap.get(buildPairKey({ orderType: 'MEMBERSHIP', orderNo: order.orderNo })) || [],
      benefitMap.get(buildPairKey({ orderType: 'MEMBERSHIP', orderNo: order.orderNo })) || [],
    )),
    ...rechargeOrders.map((order: any) => mapRechargeOrder(
      order,
      paymentMap.get(buildPairKey({ orderType: 'RECHARGE', orderNo: order.orderNo })) || [],
      benefitMap.get(buildPairKey({ orderType: 'RECHARGE', orderNo: order.orderNo })) || [],
    )),
  ]
    .filter((item) => matchesDerivedFilters(item, query))
    .sort((left, right) => {
      const rightTime = new Date(right.createdAt || 0).getTime()
      const leftTime = new Date(left.createdAt || 0).getTime()
      return rightTime - leftTime
    })

  const pagination = resolvePagination(query, allItems.length, {
    defaultPageSize: 20,
    maxPageSize: 100,
  })
  const items = allItems.slice(pagination.skip, pagination.skip + pagination.pageSize)

  return buildPageResult(serializeValue(items), pagination)
}

export const __adminOrdersTestHooks = {
  summarizePaymentTransactions,
  summarizeBenefitGrants,
}
