import { adminGet } from './admin-request'

export type AdminOrderTypeFilter = 'ALL' | 'MEMBERSHIP' | 'RECHARGE'

export interface AdminOrderPaymentSummary {
  count: number
  latestStatus: string
  latest: null | {
    id: string
    provider: string
    channel: string
    status: string
    expectedAmount: string
    paidAmount: string
    currency: string
    verifiedAt: string | null
    paidAt: string | null
  }
}

export interface AdminOrderBenefitSummary {
  count: number
  latestStatus: string
  counts: Record<string, number>
  latest: null | {
    id: string
    grantType: string
    status: string
    amount: number
    grantedAt: string | null
    revokedAt: string | null
    reason: string | null
  }
}

export interface AdminUnifiedOrderItem {
  id: string
  orderType: 'MEMBERSHIP' | 'RECHARGE'
  orderNo: string
  orderStatus: string
  paymentStatus: string
  refundStatus: string
  title: string
  totalAmount: string
  paidAmount: string
  currency: string
  points: number
  bonusPoints: number
  channel: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
  canceledAt: string | null
  refundedAt: string | null
  user: null | {
    id: string
    name: string
    email: string
    phone: string
  }
  membership: null | {
    levelName: string
    planName: string
    startTime: string | null
    endTime: string | null
    sourceType: string
  }
  recharge: null | {
    packageName: string
    packageLabel: string
  }
  paymentTransactions: AdminOrderPaymentSummary
  benefitGrants: AdminOrderBenefitSummary
}

export interface ListAdminOrdersOptions {
  keyword?: string
  orderType?: AdminOrderTypeFilter
  orderStatus?: string
  paymentStatus?: string
  benefitStatus?: string
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}

export interface AdminUnifiedOrderListResult {
  items: AdminUnifiedOrderItem[]
  summary: {
    totalCount: number
    totalPages: number
    page: number
    pageSize: number
  }
}

const ADMIN_ORDERS_BASE_PATH = '/api/admin/orders'

export const listAdminOrders = async (options: ListAdminOrdersOptions = {}) => {
  return adminGet<AdminUnifiedOrderListResult>(ADMIN_ORDERS_BASE_PATH, {
    query: {
      keyword: String(options.keyword || '').trim(),
      orderType: options.orderType || 'ALL',
      orderStatus: String(options.orderStatus || 'ALL').trim(),
      paymentStatus: String(options.paymentStatus || 'ALL').trim(),
      benefitStatus: String(options.benefitStatus || 'ALL').trim(),
      createdFrom: String(options.createdFrom || '').trim(),
      createdTo: String(options.createdTo || '').trim(),
      page: options.page || 1,
      pageSize: options.pageSize || 20,
    },
  })
}
