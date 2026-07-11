import assert from 'node:assert/strict'
import test from 'node:test'
import { runInventoryCli } from '../../scripts/security/legacy-config-ciphertext/cli'
import { InMemoryLegacyConfigInventoryRepository } from '../../scripts/security/legacy-config-ciphertext/repositories'
import { encryptConfigCiphertext } from '../../scripts/security/legacy-config-ciphertext/classifier'

test('inventory CLI rejects unsupported modes before repository access', async () => {
  let accessed = false
  const repository = new InMemoryLegacyConfigInventoryRepository()
  repository.listLegacyProviderConfigs = async () => { accessed = true; return [] }

  await assert.rejects(
    () => runInventoryCli(['reencrypt'], { env: { OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY: '1' }, repository }),
    /only supports inventory/i,
  )
  assert.equal(accessed, false)
})

test('inventory CLI validates authorization before repository access', async () => {
  let accessed = false
  const repository = new InMemoryLegacyConfigInventoryRepository()
  repository.listLegacyProviderConfigs = async () => { accessed = true; return [] }

  await assert.rejects(() => runInventoryCli(['inventory'], { env: {}, repository }), /not authorized/i)
  assert.equal(accessed, false)
})

test('inventory CLI emits a count-only report for an injected synthetic repository', async () => {
  const providerSecret = 'provider-cli-synthetic-secret-material-0123456789'
  const storageSecret = 'storage-cli-synthetic-secret-material-01234567890'
  const report = await runInventoryCli(['inventory'], {
    env: { OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY: '1' },
    repository: new InMemoryLegacyConfigInventoryRepository({
      currentProviders: [{ apiKeyEncrypted: encryptConfigCiphertext('input-only-value', providerSecret) }],
    }),
    keys: { provider: { current: providerSecret }, storage: { current: storageSecret } },
    sourceCommit: 'test-commit',
    environmentClass: 'isolated-test',
  })

  assert.equal(report.decision, 'ZERO_AFFECTED_FIELDS')
  assert.equal(report.providerCurrent, undefined)
  assert.equal(JSON.stringify(report).includes('input-only-value'), false)
})
