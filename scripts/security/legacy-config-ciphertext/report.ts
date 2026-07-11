import crypto from 'node:crypto'
import type { ClassificationCounts, LegacyConfigInventoryReport, LegacyConfigInventoryResult } from './types'

const countClassification = (counts: ClassificationCounts, classification: keyof ClassificationCounts) => counts[classification] ?? 0

const manualReviewCount = (result: LegacyConfigInventoryResult) => [
  result.providerLegacy.classifications,
  result.providerCurrent.classifications,
  result.storage.accessKeyClassifications,
  result.storage.secretKeyClassifications,
].reduce((total, counts) => total
  + countClassification(counts, 'INVALID_FORMAT')
  + countClassification(counts, 'UNDECRYPTABLE')
  + countClassification(counts, 'MULTIPLE_KEY_MATCH'), 0)

const legacyAffectedCount = (result: LegacyConfigInventoryResult) => [
  result.providerLegacy.classifications,
  result.providerCurrent.classifications,
  result.storage.accessKeyClassifications,
  result.storage.secretKeyClassifications,
].reduce((total, counts) => total + countClassification(counts, 'LEGACY_FALLBACK_DECRYPTABLE'), 0)

export const buildInventoryReport = (
  result: LegacyConfigInventoryResult,
  context: { sourceCommit: string; environmentClass: string; toolVersion?: string },
): LegacyConfigInventoryReport => {
  const legacyAffectedFields = legacyAffectedCount(result)
  const manualReviewRequired = manualReviewCount(result) > 0
  return {
    reportId: crypto.randomUUID(),
    toolVersion: context.toolVersion ?? 'phase-a-inventory-only',
    sourceCommit: context.sourceCommit,
    environmentClass: context.environmentClass,
    authorization: 'APPROVED',
    tables: [
      { table: 'ai_provider_configs', fields: ['api_key_encrypted'] },
      { table: 'ai_providers', fields: ['api_key_encrypted'] },
      { table: 'object_storage_configs', fields: ['access_key_encrypted', 'secret_key_encrypted'] },
    ],
    result,
    legacyAffectedFields,
    decision: manualReviewRequired
      ? 'MANUAL_REVIEW_REQUIRED'
      : legacyAffectedFields > 0 ? 'PHASE_B_REQUIRED' : 'ZERO_AFFECTED_FIELDS',
  }
}

export const formatInventorySummary = (report: LegacyConfigInventoryReport) => [
  `reportId=${report.reportId}`,
  `decision=${report.decision}`,
  `legacyAffectedFields=${report.legacyAffectedFields}`,
].join('\n')
