import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { runDisposablePrismaInventory } from '../../scripts/security/legacy-config-ciphertext/disposable-integration'

test('Prisma inventory reads a pre-provisioned disposable database without writes', async () => {
  const result = await runDisposablePrismaInventory({
    mode: 'inventory',
    env: process.env,
    workspaceRoot: resolve(import.meta.dirname, '../..'),
    outputDirectory: resolve(import.meta.dirname, '../../.codex-temp/legacy-config-inventory'),
    sourceCommit: 'disposable-integration-test',
  })

  assert.equal(result.databaseId, 'okwook_inventory_disposable_test12345678')
  assert.equal(result.queryAudit.totalQueryCount, 11)
  assert.equal(result.queryAudit.allowedReadQueryCount, 11)
  assert.equal(result.queryAudit.writeQueryCount, 0)
  assert.equal(result.queryAudit.unknownQueryCount, 0)
  assert.equal(result.beforeAfterUnchanged, true)
  assert.equal(result.report.result.providerLegacy.totalRecords > 0, true)
  assert.equal(result.report.result.providerCurrent.totalRecords > 0, true)
  assert.equal(result.report.result.storage.totalRecords > 0, true)
  assert.equal((result.report.result.providerLegacy.classifications.LEGACY_FALLBACK_DECRYPTABLE ?? 0) > 0, true)
  assert.equal((result.report.result.providerCurrent.classifications.PREVIOUS_DECRYPTABLE ?? 0) > 0, true)
  assert.equal((result.report.result.storage.accessKeyClassifications.CURRENT_DECRYPTABLE ?? 0) > 0, true)
  assert.equal((result.report.result.storage.secretKeyClassifications.LEGACY_FALLBACK_DECRYPTABLE ?? 0) > 0, true)
  assert.equal((result.report.result.storage.rowSummaries.PARTIAL_LEGACY ?? 0) > 0, true)

  const serialized = JSON.stringify(result)
  for (const forbidden of ['databaseUrl', 'ciphertext', 'plaintext', 'endpoint', 'bucket', 'password']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'))
  }
})
