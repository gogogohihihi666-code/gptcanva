import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchWithBurstRateRetry } from '../../server/generation-tasks/upstream-helpers'
import { uploadBufferToActiveObjectStorage } from '../../server/storage-config/service'
import { __adminDangerousActionGateTestHooks } from '../../server/no-call/admin-dangerous-action-gate'

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

const clearGenerationNoCallEnv = () => {
  delete process.env.AI_PROVIDER_REAL_TEST_ALLOWED
  delete process.env.AI_PROVIDER_REAL_SMOKE_ALLOWED
  delete process.env.AI_PROVIDER_REAL_GENERATION_ALLOWED
  delete process.env.OBJECT_STORAGE_REAL_TEST_ALLOWED
  delete process.env.OBJECT_STORAGE_REAL_UPLOAD_ALLOWED
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
    assert.match(String(error?.message || ''), /人工授权 gate|浜哄伐鎺堟潈 gate/)
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

describe('generation flow no-call e2e preflight', () => {
  it('blocks generation Provider execution by default before fetch can run', async () => {
    clearGenerationNoCallEnv()
    let fetchCalled = false
    globalThis.fetch = (async () => {
      fetchCalled = true
      throw new Error('fetch must not be called')
    }) as typeof fetch

    await assertBlockedNoCallError(() => fetchWithBurstRateRetry({
      url: 'https://provider.example.invalid/v1/chat/completions',
      init: { method: 'POST' },
      signal: new AbortController().signal,
      stage: 'generation_no_call_test',
      detail: { providerId: 'provider-1', modelKey: 'model-1' },
      logGenerationTask: () => {},
      timeoutMs: 10,
    }))

    assert.equal(fetchCalled, false)
  })

  it('blocks generation storage upload by default before reading storage config or sending objects', async () => {
    clearGenerationNoCallEnv()

    await assertBlockedNoCallError(() => uploadBufferToActiveObjectStorage({
      key: 'no-call-preflight.txt',
      buffer: Buffer.from('no-call preflight'),
      mimeType: 'text/plain',
    }))
  })

  it('exposes safe generation no-call gate status without enabling real external calls', () => {
    clearGenerationNoCallEnv()

    const providerGate = __adminDangerousActionGateTestHooks.getAdminDangerousActionGateStatus(
      'generation-provider-execution' as any,
    )
    const storageGate = __adminDangerousActionGateTestHooks.getAdminDangerousActionGateStatus(
      'generation-storage-upload' as any,
    )

    assert.equal(providerGate.allowed, false)
    assert.equal(providerGate.blocked, true)
    assert.equal(providerGate.willCallExternal, false)
    assert.equal(providerGate.willCallProvider, false)
    assert.equal(providerGate.willUploadStorage, false)

    assert.equal(storageGate.allowed, false)
    assert.equal(storageGate.blocked, true)
    assert.equal(storageGate.willCallExternal, false)
    assert.equal(storageGate.willCallProvider, false)
    assert.equal(storageGate.willUploadStorage, false)
  })

  it('keeps task creation, failed-task audit, and refund settlement gates wired', () => {
    const lifecycleService = readText('server/generation-tasks/task-lifecycle-service.ts')
    const generationService = readText('server/generation-tasks/service.ts')
    const executionStrategies = readText('server/generation-tasks/execution-strategies.ts')
    const providerService = readText('server/provider-config/service.ts')
    const marketingService = readText('server/marketing-center/service.ts')

    assert.match(lifecycleService, /resolveGenerationPointCost/)
    assert.match(lifecycleService, /consumeGenerationPoints/)
    assert.match(lifecycleService, /runTaskInBackground/)

    assert.match(providerService, /provider \|\| !provider\.isEnabled/)
    assert.match(providerService, /isEnabled:\s*true[\s\S]*modelKey/)
    assert.match(marketingService, /readModelBillingPower/)
    assert.match(marketingService, /pointCost:\s*finalPointCost/)

    assert.match(generationService, /refundTaskPointsIfNeeded/)
    assert.match(executionStrategies, /handleFailed[\s\S]*refundTaskPointsIfNeeded/)
    assert.match(executionStrategies, /handleFailed[\s\S]*updateGenerationRecord[\s\S]*error:\s*errorMessage/)
    assert.match(executionStrategies, /syncSharedTaskRuntime\(task,\s*'failed'\)/)
  })
})
