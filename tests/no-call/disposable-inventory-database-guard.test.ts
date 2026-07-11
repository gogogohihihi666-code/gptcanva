import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  prepareDisposableInventoryRun,
  type DisposableInventoryRuntimeEnv,
} from '../../scripts/security/legacy-config-ciphertext/disposable-database-guard'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const outputDirectory = resolve(workspaceRoot, '.codex-temp/legacy-config-inventory')
const databaseId = 'okwook_inventory_disposable_test12345678'

const validEnv = (): DisposableInventoryRuntimeEnv => ({
  OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY: '1',
  OKWOOK_ALLOW_DISPOSABLE_INVENTORY_DB: '1',
  OKWOOK_RUN_DISPOSABLE_INVENTORY_DB_TEST: '1',
  OKWOOK_DISPOSABLE_INVENTORY_DATABASE_ID: databaseId,
  OKWOOK_DISPOSABLE_INVENTORY_DATABASE_URL: `mysql://readonly:synthetic-password@127.0.0.1:3306/${databaseId}`,
  OKWOOK_DISPOSABLE_PROVIDER_CURRENT_SECRET: 'provider-current-synthetic-material-00000001',
  OKWOOK_DISPOSABLE_PROVIDER_PREVIOUS_SECRET: 'provider-previous-synthetic-material-0000002',
  OKWOOK_DISPOSABLE_PROVIDER_LEGACY_SECRET: 'provider-legacy-synthetic-material-000000003',
  OKWOOK_DISPOSABLE_STORAGE_CURRENT_SECRET: 'storage-current-synthetic-material-0000000004',
  OKWOOK_DISPOSABLE_STORAGE_PREVIOUS_SECRET: 'storage-previous-synthetic-material-000000005',
  OKWOOK_DISPOSABLE_STORAGE_LEGACY_SECRET: 'storage-legacy-synthetic-material-00000000006',
})

test('disposable inventory guard validates every gate before invoking Prisma factory', () => {
  for (const variableName of [
    'OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY',
    'OKWOOK_ALLOW_DISPOSABLE_INVENTORY_DB',
    'OKWOOK_RUN_DISPOSABLE_INVENTORY_DB_TEST',
  ] as const) {
    const env = validEnv()
    env[variableName] = 'true'
    let factoryCalls = 0
    assert.throws(
      () => prepareDisposableInventoryRun('inventory', env, workspaceRoot, outputDirectory, () => { factoryCalls += 1 }),
      /NOT_AUTHORIZED/,
    )
    assert.equal(factoryCalls, 0)
  }
})

test('disposable inventory guard rejects non-loopback, wrong database, and unsafe output paths', () => {
  const cases = [
    { url: `mysql://readonly:synthetic-password@db.example.com:3306/${databaseId}`, outputDirectory },
    { url: 'mysql://readonly:synthetic-password@127.0.0.1:3306/canana_mind', outputDirectory },
    { url: `mysql://root:synthetic-password@127.0.0.1:3306/${databaseId}`, outputDirectory },
    { url: `mysql://readonly:synthetic-password@127.0.0.1:3306/${databaseId}`, outputDirectory: workspaceRoot },
  ]

  for (const item of cases) {
    const env = validEnv()
    env.OKWOOK_DISPOSABLE_INVENTORY_DATABASE_URL = item.url
    let factoryCalls = 0
    assert.throws(
      () => prepareDisposableInventoryRun('inventory', env, workspaceRoot, item.outputDirectory, () => { factoryCalls += 1 }),
      /DISPOSABLE_DATABASE_GUARD_REJECTED/,
    )
    assert.equal(factoryCalls, 0)
  }
})

test('disposable inventory guard returns isolated keys and invokes factory once after validation', () => {
  let factoryCalls = 0
  const prepared = prepareDisposableInventoryRun('inventory', validEnv(), workspaceRoot, outputDirectory, () => {
    factoryCalls += 1
    return { marker: 'synthetic-client' }
  })

  assert.equal(factoryCalls, 1)
  assert.deepEqual(prepared.client, { marker: 'synthetic-client' })
  assert.equal(prepared.databaseId, databaseId)
  assert.notEqual(prepared.keys.provider.current, prepared.keys.storage.current)
})
