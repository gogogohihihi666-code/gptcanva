export const FIELD_CLASSIFICATIONS = [
  'EMPTY',
  'INVALID_FORMAT',
  'CURRENT_DECRYPTABLE',
  'PREVIOUS_DECRYPTABLE',
  'LEGACY_FALLBACK_DECRYPTABLE',
  'UNDECRYPTABLE',
  'MULTIPLE_KEY_MATCH',
] as const

export type FieldClassification = (typeof FIELD_CLASSIFICATIONS)[number]

export const STORAGE_ROW_SUMMARIES = [
  'BOTH_CURRENT',
  'BOTH_LEGACY',
  'PARTIAL_LEGACY',
  'PREVIOUS_ONLY',
  'MIXED_KEYS',
  'HAS_INVALID_FIELD',
  'HAS_UNDECRYPTABLE_FIELD',
  'EMPTY',
] as const

export type StorageRowSummary = (typeof STORAGE_ROW_SUMMARIES)[number]

export type ClassificationCounts = Partial<Record<FieldClassification, number>>
export type StorageRowSummaryCounts = Partial<Record<StorageRowSummary, number>>

export interface ProviderInventorySummary {
  totalRecords: number
  classifications: ClassificationCounts
}

export interface StorageInventorySummary {
  totalRecords: number
  accessKeyClassifications: ClassificationCounts
  secretKeyClassifications: ClassificationCounts
  rowSummaries: StorageRowSummaryCounts
}

export interface LegacyConfigInventoryResult {
  providerLegacy: ProviderInventorySummary
  providerCurrent: ProviderInventorySummary
  storage: StorageInventorySummary
}

export interface LegacyConfigInventoryReport {
  reportId: string
  toolVersion: string
  sourceCommit: string
  environmentClass: string
  authorization: 'APPROVED'
  tables: Array<{ table: string; fields: string[] }>
  result: LegacyConfigInventoryResult
  legacyAffectedFields: number
  decision: 'ZERO_AFFECTED_FIELDS' | 'PHASE_B_REQUIRED' | 'MANUAL_REVIEW_REQUIRED'
}
