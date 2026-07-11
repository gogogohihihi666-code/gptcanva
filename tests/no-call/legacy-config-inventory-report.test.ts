import assert from 'node:assert/strict'
import test from 'node:test'
import { buildInventoryReport, formatInventorySummary } from '../../scripts/security/legacy-config-ciphertext/report'
import type { LegacyConfigInventoryResult } from '../../scripts/security/legacy-config-ciphertext/types'

const result: LegacyConfigInventoryResult = {
  providerLegacy: { totalRecords: 1, classifications: { LEGACY_FALLBACK_DECRYPTABLE: 1 } },
  providerCurrent: { totalRecords: 1, classifications: { CURRENT_DECRYPTABLE: 1 } },
  storage: {
    totalRecords: 1,
    accessKeyClassifications: { CURRENT_DECRYPTABLE: 1 },
    secretKeyClassifications: { LEGACY_FALLBACK_DECRYPTABLE: 1 },
    rowSummaries: { PARTIAL_LEGACY: 1 },
  },
}

test('inventory report contains only count-level decision evidence', () => {
  const report = buildInventoryReport(result, { sourceCommit: 'synthetic-test', environmentClass: 'isolated-test' })
  const serialized = JSON.stringify(report)

  assert.equal(report.decision, 'PHASE_B_REQUIRED')
  assert.match(formatInventorySummary(report), /legacyAffectedFields=2/)
  for (const forbidden of ['ciphertext', 'plaintext', 'endpoint', 'bucket', 'database', 'rowId', 'apiKey']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'))
  }
})
