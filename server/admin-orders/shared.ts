import { sendJson } from '../ai-gateway/shared'
import { readPaginationQuery } from '../shared/pagination'

export type AdminOrderTypeFilter = 'ALL' | 'MEMBERSHIP' | 'RECHARGE'
export type AdminOrderStatusFilter = 'ALL' | string
export type AdminPaymentStatusFilter = 'ALL' | 'NO_TRANSACTION' | string
export type AdminBenefitStatusFilter = 'ALL' | 'NO_GRANT' | string

export interface AdminOrdersQuery {
  keyword: string
  orderType: AdminOrderTypeFilter
  orderStatus: AdminOrderStatusFilter
  paymentStatus: AdminPaymentStatusFilter
  benefitStatus: AdminBenefitStatusFilter
  createdFrom: string
  createdTo: string
  page: number
  pageSize: number
}

const normalizeOrderType = (value: string): AdminOrderTypeFilter => {
  const normalized = value.trim().toUpperCase()
  return normalized === 'MEMBERSHIP' || normalized === 'RECHARGE' ? normalized : 'ALL'
}

const normalizeStatus = (value: string, fallback = 'ALL') => {
  return value.trim().toUpperCase() || fallback
}

export const readAdminOrdersQuery = (requestUrl: string): AdminOrdersQuery => {
  const url = new URL(requestUrl, 'http://localhost')
  const pagination = readPaginationQuery(url.searchParams, {
    defaultPageSize: 20,
    maxPageSize: 100,
  })

  return {
    keyword: String(url.searchParams.get('keyword') || '').trim(),
    orderType: normalizeOrderType(String(url.searchParams.get('orderType') || 'ALL')),
    orderStatus: normalizeStatus(String(url.searchParams.get('orderStatus') || 'ALL')),
    paymentStatus: normalizeStatus(String(url.searchParams.get('paymentStatus') || 'ALL')),
    benefitStatus: normalizeStatus(String(url.searchParams.get('benefitStatus') || 'ALL')),
    createdFrom: String(url.searchParams.get('createdFrom') || '').trim(),
    createdTo: String(url.searchParams.get('createdTo') || '').trim(),
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
}

export const sendAdminOrdersError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, {
    message,
    error: {
      type: 'admin_orders_error',
      message,
    },
  })
}
