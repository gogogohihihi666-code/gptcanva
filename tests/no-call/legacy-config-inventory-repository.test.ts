import assert from 'node:assert/strict'
import test from 'node:test'
import { runLegacyConfigInventory } from '../../scripts/security/legacy-config-ciphertext/inventory'
import { InMemoryLegacyConfigInventoryRepository, type LegacyConfigInventoryRepository } from '../../scripts/security/legacy-config-ciphertext/repositories'
import { encryptConfigCiphertext } from '../../scripts/security/legacy-config-ciphertext/classifier'

test('inventory counts provider tables independently and summarizes both storage fields', async () => {
  const providerSecret = 'provider-synthetic-secret-material-0123456789'
  const storageSecret = 'storage-synthetic-secret-material-01234567890'
  const repository = new InMemoryLegacyConfigInventoryRepository({
    legacyProviderConfigs: [{ apiKeyEncrypted: encryptConfigCiphertext('legacy-provider', providerSecret) }],
    currentProviders: [{ apiKeyEncrypted: encryptConfigCiphertext('current-provider', providerSecret) }],
    storageConfigs: [{
      accessKeyEncrypted: encryptConfigCiphertext('access', storageSecret),
      secretKeyEncrypted: encryptConfigCiphertext('secret', storageSecret),
    }],
  })

  const result = await runLegacyConfigInventory(repository, {
    provider: { current: providerSecret },
    storage: { current: storageSecret },
  })

  assert.equal(result.providerLegacy.totalRecords, 1)
  assert.equal(result.providerCurrent.totalRecords, 1)
  assert.deepEqual(result.storage.rowSummaries, { BOTH_CURRENT: 1 })
})

test('repository contract exposes read operations only', () => {
  const methods = Object.getOwnPropertyNames(InMemoryLegacyConfigInventoryRepository.prototype)
  assert.deepEqual(methods.sort(), ['constructor', 'listCurrentProviders', 'listLegacyProviderConfigs', 'listStorageConfigs'].sort())
  const repository: LegacyConfigInventoryRepository = new InMemoryLegacyConfigInventoryRepository()
  assert.equal(typeof repository.listStorageConfigs, 'function')
})

test('inventory rejects Provider and Storage key reuse before querying a repository', async () => {
  let accessed = false
  const repository: LegacyConfigInventoryRepository = {
    listLegacyProviderConfigs: async () => { accessed = true; return [] },
    listCurrentProviders: async () => [],
    listStorageConfigs: async () => [],
  }
  const sharedSecret = 'shared-synthetic-secret-material-012345678901234'

  await assert.rejects(
    () => runLegacyConfigInventory(repository, {
      provider: { current: sharedSecret },
      storage: { current: sharedSecret },
    }),
    /independent/i,
  )
  assert.equal(accessed, false)
})
