import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GENERATION_PREFLIGHT_STATUS_PATH,
  isGenerationPreflightStatusPath,
} from '../../server/generation-preflight-status/constants'
import { __generationPreflightStatusTestHooks } from '../../server/generation-preflight-status/service'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('user generation no-call guidance', () => {
  it('exposes only a narrow readonly generation preflight status path', () => {
    assert.equal(GENERATION_PREFLIGHT_STATUS_PATH, '/api/generation/preflight-status')
    assert.equal(isGenerationPreflightStatusPath('/api/generation/preflight-status'), true)
    assert.equal(isGenerationPreflightStatusPath('/api/generation/preflight-status/test'), false)
    assert.equal(isGenerationPreflightStatusPath('/api/admin/provider-health'), false)
  })

  it('reports no-call generation as unavailable without exposing provider or storage secrets', () => {
    const overview = __generationPreflightStatusTestHooks.buildGenerationPreflightStatusFromRecords({
      providers: [{
        id: 'provider-1',
        code: 'safe-provider-code',
        baseUrl: 'https://example.invalid',
        apiKeyEncrypted: 'must-not-leak',
        apiKeyHint: 'env:OPENAI_API_KEY',
        isEnabled: true,
        models: [{
          id: 'model-1',
          category: 'IMAGE',
          modelKey: 'image-model',
          isEnabled: true,
          defaultParamsJson: { billingRule: { power: 8 } },
        }],
      }],
      env: {},
    })
    const text = JSON.stringify(overview)

    assert.equal(overview.readonly, true)
    assert.equal(overview.generationAvailable, false)
    assert.equal(overview.noCallMode, true)
    assert.equal(overview.willCallExternal, false)
    assert.equal(overview.willCallProvider, false)
    assert.equal(overview.willUploadStorage, false)
    assert.equal(overview.willCreateGenerationTask, false)
    assert.equal(overview.willChargePoints, false)
    assert.equal(overview.realProviderGenerationAllowed, false)
    assert.equal(overview.realStorageUploadAllowed, false)
    assert.match(overview.userMessage, /no-call|暂不可用/)
    assert.doesNotMatch(text, /apiKeyEncrypted/i)
    assert.doesNotMatch(text, /must-not-leak/i)
    assert.doesNotMatch(text, /OPENAI_API_KEY/i)
    assert.doesNotMatch(text, /baseUrl/i)
    assert.doesNotMatch(text, /bucket/i)
    assert.doesNotMatch(text, /endpoint/i)
    assert.doesNotMatch(text, /signed url/i)
    assert.doesNotMatch(text, /base64/i)
    assert.doesNotMatch(text, /rawPayloadJson/i)
  })

  it('keeps /generate submit UI guided by readonly no-call status before task creation', () => {
    const api = readText('src/api/generation-preflight-status.ts')
    const page = readText('src/views/generate/generate.vue')
    const generator = readText('src/components/generate/ContentGenerator.vue')
    const index = readText('server/index.ts')

    assert.match(api, /\/api\/generation\/preflight-status/)
    assert.match(page, /getGenerationPreflightStatus/)
    assert.match(page, /generationPreflightStatus/)
    assert.match(page, /:generation-preflight-status=/)
    assert.match(generator, /generationPreflightStatus/)
    assert.match(generator, /generationAvailabilityMessage/)
    assert.match(generator, /generationSubmitBlocked/)
    assert.match(generator, /默认 no-call|no-call/)
    assert.match(generator, /ElMessage\.warning/)
    assert.match(index, /generation-preflight-status/)
  })
})
