import { sendJson } from '../ai-gateway/shared'
import { readPaginationQuery } from '../shared/pagination'

export type AdminGenerationRecordStatusFilter = 'ALL' | 'COMPLETED' | 'FAILED' | 'RUNNING' | 'STOPPED'
export type AdminGenerationRecordTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AGENT' | 'DIGITAL_HUMAN' | 'MOTION' | 'RESEARCH'
export type AdminGenerationRefundStatusFilter = 'ALL' | 'REFUNDED' | 'PENDING_REFUND' | 'NOT_REFUNDABLE' | 'COMPENSABLE'

export interface AdminGenerationRecordsQuery {
  keyword: string
  userKeyword: string
  modelKeyword: string
  errorKeyword: string
  status: AdminGenerationRecordStatusFilter
  refundStatus: AdminGenerationRefundStatusFilter
  type: AdminGenerationRecordTypeFilter
  createdFrom?: Date
  createdTo?: Date
  page: number
  pageSize: number
}

// 解析后台生成记录列表筛选参数。
export const readAdminGenerationRecordsQuery = (requestUrl: string): AdminGenerationRecordsQuery => {
  const url = new URL(requestUrl, 'http://localhost')
  const rawStatus = String(url.searchParams.get('status') || 'ALL').trim().toUpperCase()
  const rawRefundStatus = String(url.searchParams.get('refundStatus') || 'ALL').trim().toUpperCase()
  const rawType = String(url.searchParams.get('type') || 'ALL').trim().replaceAll('-', '_').toUpperCase()
  const createdFromText = String(url.searchParams.get('createdFrom') || '').trim()
  const createdToText = String(url.searchParams.get('createdTo') || '').trim()
  const createdFrom = createdFromText ? new Date(createdFromText) : undefined
  const createdTo = createdToText ? new Date(createdToText) : undefined
  const pagination = readPaginationQuery(url.searchParams, {
    defaultPageSize: 10,
    maxPageSize: 100,
  })

  return {
    keyword: String(url.searchParams.get('keyword') || '').trim(),
    userKeyword: String(url.searchParams.get('userKeyword') || '').trim(),
    modelKeyword: String(url.searchParams.get('modelKeyword') || '').trim(),
    errorKeyword: String(url.searchParams.get('errorKeyword') || '').trim(),
    status: rawStatus === 'COMPLETED' || rawStatus === 'FAILED' || rawStatus === 'RUNNING' || rawStatus === 'STOPPED'
      ? rawStatus
      : 'ALL',
    refundStatus: rawRefundStatus === 'REFUNDED' || rawRefundStatus === 'PENDING_REFUND' || rawRefundStatus === 'NOT_REFUNDABLE' || rawRefundStatus === 'COMPENSABLE'
      ? rawRefundStatus
      : 'ALL',
    type: rawType === 'IMAGE' || rawType === 'VIDEO' || rawType === 'AGENT' || rawType === 'DIGITAL_HUMAN' || rawType === 'MOTION' || rawType === 'RESEARCH'
      ? rawType
      : 'ALL',
    createdFrom: createdFrom && !Number.isNaN(createdFrom.getTime()) ? createdFrom : undefined,
    createdTo: createdTo && !Number.isNaN(createdTo.getTime()) ? createdTo : undefined,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
}

// 返回统一的后台生成记录错误。
export const sendAdminGenerationRecordsError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, {
    message,
    error: {
      type: 'admin_generation_records_error',
      message,
    },
  })
}
