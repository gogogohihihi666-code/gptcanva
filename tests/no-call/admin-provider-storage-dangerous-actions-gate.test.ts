import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { discoverProviderModels, testProviderConnectivity } from '../../server/provider-config/model-service'
import { testObjectStorageConfig } from '../../server/storage-config/service'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
  globalThis.fetch = originalFetch
})

const clearDangerousActionEnv = () => {
  delete process.env.AI_PROVIDER_REAL_TEST_ALLOWED
  delete process.env.AI_PROVIDER_REAL_SMOKE_ALLOWED
  delete process.env.OBJECT_STORAGE_REAL_TEST_ALLOWED
}

const assertBlockedNoCallError = async (run: () => Promise<unknown>) => {
  await assert.rejects(run, (error: any) => {
    const text = JSON.stringify(error)
    assert.equal(error?.code, 'ADMIN_NO_CALL_GATE_BLOCKED')
    assert.equal(error?.blocked, true)
    assert.equal(error?.willCallExternal, false)
    assert.equal(error?.willCallProvider, false)
    assert.equal(error?.willUploadStorage, false)
    assert.equal(error?.statusCode, 403)
    assert.match(String(error?.message || ''), /no-call/)
    assert.match(String(error?.message || ''), /人工授权 gate/)
    assert.doesNotMatch(text, /apiKeyEncrypted/i)
    assert.doesNotMatch(text, /secret/i)
    assert.doesNotMatch(text, /token/i)
    assert.doesNotMatch(text, /rawPayloadJson/i)
    assert.doesNotMatch(text, /bucket/i)
    assert.doesNotMatch(text, /endpoint/i)
    assert.doesNotMatch(text, /signed url/i)
    assert.doesNotMatch(text, /base64/i)
    return true
  })
}

describe('admin provider and storage dangerous actions no-call gate', () => {
  it('blocks Provider connectivity testing before any upstream fetch can run', async () => {
    clearDangerousActionEnv()
    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      throw new Error('fetch must not be called')
    }) as typeof fetch

    await assertBlockedNoCallError(() => testProviderConnectivity('provider-id'))

    assert.equal(fetchCalled, false)
  })

  it('blocks Provider model discovery before any upstream fetch can run', async () => {
    clearDangerousActionEnv()
    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      throw new Error('fetch must not be called')
    }) as typeof fetch

    await assertBlockedNoCallError(() => discoverProviderModels('provider-id'))

    assert.equal(fetchCalled, false)
  })

  it('blocks Storage connectivity testing before any upload or delete can run', async () => {
    clearDangerousActionEnv()

    await assertBlockedNoCallError(() => testObjectStorageConfig('storage-id'))
  })

  it('wires dangerous endpoints to explicit no-call gates', () => {
    const providerService = readText('server/provider-config/model-service.ts')
    const storageService = readText('server/storage-config/service.ts')
    const providerRequestHandler = readText('server/provider-config/request-handler.ts')
    const storageRequestHandler = readText('server/storage-config/request-handler.ts')

    assert.match(providerService, /assertDangerousAdminActionAllowed\('provider-connectivity-test'\)/)
    assert.match(providerService, /assertDangerousAdminActionAllowed\('provider-model-discovery'\)/)
    assert.match(storageService, /assertDangerousAdminActionAllowed\('storage-connectivity-test'\)/)
    assert.match(providerRequestHandler, /isAdminNoCallGateBlockedError\(error\)[\s\S]*\? 403/)
    assert.match(storageRequestHandler, /isAdminNoCallGateBlockedError\(error\)[\s\S]*\? 403/)
  })

  it('shows frontend no-call warnings and requires confirmation for dangerous editable-page actions', () => {
    const providerPage = readText('src/views/admin/providers/AdminProviders.vue')
    const storagePage = readText('src/views/admin/storage/AdminStorage.vue')

    assert.match(providerPage, /confirmProviderDangerousAction/)
    assert.match(providerPage, /默认 no-call/)
    assert.match(providerPage, /可能真实调用上游 Provider/)
    assert.match(providerPage, /人工授权 gate/)

    assert.match(storagePage, /confirmStorageDangerousAction/)
    assert.match(storagePage, /默认 no-call/)
    assert.match(storagePage, /可能真实上传、读取或删除对象/)
    assert.match(storagePage, /人工授权 gate/)
  })
})
