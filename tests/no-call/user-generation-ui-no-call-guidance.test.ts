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
      storageConfigs: [{
        id: 'storage-1',
        endpoint: 'https://oss.example.invalid',
        bucket: 'must-not-leak',
        accessKeyEncrypted: 'must-not-leak',
        secretKeyEncrypted: 'must-not-leak',
        isEnabled: true,
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
    const viteConfig = readText('vite.config.ts')

    assert.match(api, /\/api\/generation\/preflight-status/)
    assert.match(page, /getGenerationPreflightStatus/)
    assert.match(page, /generationPreflightStatus/)
    assert.match(page, /:generation-preflight-status=/)
    assert.match(page, /main-content-G632JF\.new-conversation\.with-sidebar/)
    assert.match(generator, /generationPreflightStatus/)
    assert.match(generator, /generationAvailabilityMessage/)
    assert.match(generator, /generationSubmitBlocked/)
    assert.match(generator, /no-call/)
    assert.match(generator, /真实 AI Provider/)
    assert.match(generator, /不会扣积分/)
    assert.match(generator, /不会上传 OSS\/S3/)
    assert.match(generator, /Provider/)
    assert.match(generator, /模型/)
    assert.match(generator, /存储/)
    assert.match(generator, /generation-preflight-summary/)
    assert.match(generator, /@media screen and \(max-width: 640px\)/)
    assert.match(generator, /min-width:\s*0/)
    assert.match(generator, /ElMessage\.warning/)
    assert.match(index, /generation-preflight-status/)
    assert.match(viteConfig, /['"]\/api['"]/)
    assert.match(viteConfig, /localhost:5409/)
    assert.ok(index.indexOf('generation-preflight-status') > -1)
    assert.ok(index.indexOf('generation-preflight-status') < index.indexOf('frontend-static'))
  })

  it('keeps /generate no-call guidance usable in narrow mobile layouts', () => {
    const page = readText('src/views/generate/generate.vue')
    const pageCss = readText('src/views/generate/generate.css')
    const generator = readText('src/components/generate/ContentGenerator.vue')

    assert.match(pageCss, /@media screen and \(max-width:\s*640px\)/)
    assert.match(pageCss, /\.global-dreamina-container[\s\S]*min-width:\s*0/)
    assert.match(pageCss, /\.entry-erESAd[\s\S]*min-width:\s*0/)
    assert.match(pageCss, /\.content-wrapper-cF1zaN[\s\S]*min-width:\s*0/)
    assert.match(pageCss, /\.main-container-nXfW_A[\s\S]*min-width:\s*0/)
    assert.match(pageCss, /\.content-TZbgMr[\s\S]*min-width:\s*0/)
    assert.match(pageCss, /\.generate-conversation-sidebar[\s\S]*display:\s*none/)
    assert.match(pageCss, /\.main-content-G632JF\.new-conversation\.with-sidebar[\s\S]*padding-left:\s*0/)
    assert.match(pageCss, /\.main-content-G632JF\.new-conversation\.with-sidebar[\s\S]*width:\s*100%/)
    assert.match(page, /main-content-G632JF\.new-conversation\.with-sidebar/)
    assert.match(generator, /generation-preflight-notice/)
    assert.match(generator, /generation-preflight-summary/)
    assert.match(generator, /@media screen and \(max-width: 640px\)/)
    assert.match(generator, /\.dimension-layout-FUl4Nj[\s\S]*min-width:\s*0/)
    assert.match(generator, /\.generation-preflight-notice[\s\S]*width:\s*100%/)
    assert.match(generator, /\.generation-preflight-summary[\s\S]*grid-template-columns:\s*1fr/)
  })

  it('returns user-safe readiness summaries for provider, model, storage, and no-call gates', () => {
    const overview = __generationPreflightStatusTestHooks.buildGenerationPreflightStatusFromRecords({
      providers: [{
        id: 'provider-1',
        isEnabled: false,
        models: [],
      }],
      storageConfigs: [],
      env: {},
    })
    const text = JSON.stringify(overview)

    assert.equal(overview.generationAvailable, false)
    assert.equal(overview.willCallProvider, false)
    assert.equal(overview.willUploadStorage, false)
    assert.equal(overview.willChargePoints, false)
    assert.equal(overview.storageSummary.hasEnabledStorage, false)
    assert.equal(overview.storageSummary.enabledStorageCount, 0)
    assert.deepEqual(
      overview.statusItems.map(item => item.key),
      ['provider', 'model', 'storage', 'external-call', 'points']
    )
    assert.match(overview.userMessage, /真实 AI Provider/)
    assert.match(overview.userMessage, /不会扣积分/)
    assert.match(overview.userMessage, /不会上传 OSS\/S3/)
    assert.match(overview.actionHint, /Provider/)
    assert.match(overview.actionHint, /模型/)
    assert.match(overview.actionHint, /存储/)
    assert.doesNotMatch(text, /bucket/i)
    assert.doesNotMatch(text, /endpoint/i)
    assert.doesNotMatch(text, /apiKeyEncrypted/i)
    assert.doesNotMatch(text, /secret/i)
    assert.doesNotMatch(text, /token/i)
  })
})
