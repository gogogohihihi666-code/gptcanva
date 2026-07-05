import { adminGet } from './admin-request'
import type { PersistedGenerationRecord } from './generation-records'

export type AdminGenerationRecordStatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'stopped'
export type AdminGenerationRecordTypeFilter = 'all' | PersistedGenerationRecord['type']
export type AdminGenerationRefundStatusFilter = 'all' | 'refunded' | 'pending_refund' | 'not_refundable' | 'compensable'

export interface AdminGenerationPointAuditLogItem {
  id: string
  accountNo: string
  changeType: string
  action: string
  changeAmount: number
  balanceAfter: number
  availableAmount: number
  sourceId: string
  associationNo: string
  remark: string
  endpointType: string
  providerId: string
  modelKey: string
  modelName: string
  createdAt: string
}

export interface AdminGenerationPointAuditSummary {
  pointLogId: string
  pointAmount: number
  refundStatus: 'UNKNOWN' | 'REFUNDED' | 'PENDING_REFUND' | 'NOT_REFUNDABLE'
  refundAmount: number
  isCompensable: boolean
  compensationSummary: string
  relatedPointLogs: AdminGenerationPointAuditLogItem[]
}

export interface AdminGenerationRecordItem extends PersistedGenerationRecord {
  user: {
    id: string
    name: string
    email: string
    phone: string
    avatarUrl: string
  }
  pointAudit: AdminGenerationPointAuditSummary
}

export interface ListAdminGenerationRecordsOptions {
  keyword?: string
  userKeyword?: string
  modelKeyword?: string
  errorKeyword?: string
  status?: AdminGenerationRecordStatusFilter
  refundStatus?: AdminGenerationRefundStatusFilter
  type?: AdminGenerationRecordTypeFilter
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
}

export interface AdminGenerationRecordListResult {
  items: AdminGenerationRecordItem[]
  summary: {
    totalCount: number
    totalPages: number
    page: number
    pageSize: number
  }
}

const ADMIN_GENERATION_RECORDS_BASE_PATH = '/api/admin/generation-records'

// 查询后台全站生成记录列表。
export const listAdminGenerationRecords = async (options: ListAdminGenerationRecordsOptions = {}) => {
  return adminGet<AdminGenerationRecordListResult>(ADMIN_GENERATION_RECORDS_BASE_PATH, {
    query: {
      keyword: String(options.keyword || '').trim(),
      userKeyword: String(options.userKeyword || '').trim(),
      modelKeyword: String(options.modelKeyword || '').trim(),
      errorKeyword: String(options.errorKeyword || '').trim(),
      status: options.status || 'all',
      refundStatus: options.refundStatus || 'all',
      type: options.type || 'all',
      createdFrom: String(options.createdFrom || '').trim(),
      createdTo: String(options.createdTo || '').trim(),
      page: options.page || 1,
      pageSize: options.pageSize || 10,
    },
  })
}
