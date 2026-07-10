import { buildApiUrl } from './http'
import { readApiData } from './response'

export type AccountGenerationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED'
export type AccountGenerationRefundStatus = 'NONE' | 'REFUNDED' | 'PENDING_REFUND' | 'NOT_REQUIRED'
export type AccountGenerationCompensationStatus = 'NONE' | 'COMPLETED' | 'PENDING'

export interface AccountGenerationHistoryItem {
  id: string
  safeTaskId: string
  type: string
  status: AccountGenerationStatus
  modelLabel: string
  promptSummary: string
  inputSummary: string
  errorSummary: string
  pointCost: number
  refundedPoints: number
  refundStatus: AccountGenerationRefundStatus
  compensationStatus: AccountGenerationCompensationStatus
  resultCount: number
  hasLocalDemoResult: boolean
  createdAt: string
  startedAt: string
  finishedAt: string
  timeline: Array<{ key: string; at: string }>
}

export const listAccountGenerationHistory = async () => {
  const response = await fetch(buildApiUrl('/api/account/generation-history'), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
  return readApiData<AccountGenerationHistoryItem[]>(response)
}
