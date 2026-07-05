import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_PROVIDER_HEALTH_PATH, isAdminProviderHealthPath } from '../../server/admin-provider-health/constants'
import { __adminProviderHealthTestHooks } from '../../server/admin-provider-health/service'

describe('admin provider health no-call preflight', () => {
  it('exposes only the readonly GET provider health path', () => {
    assert.equal(ADMIN_PROVIDER_HEALTH_PATH, '/api/admin/provider-health')
    assert.equal(isAdminProviderHealthPath('/api/admin/provider-health'), true)
    assert.equal(isAdminProviderHealthPath('/api/admin/provider-health/test'), false)
    assert.equal(isAdminProviderHealthPath('/api/provider-config/providers/provider-id/test'), false)
  })

  it('builds no-call defaults that cannot trigger providers, storage, tasks, or smoke', () => {
    const overview = __adminProviderHealthTestHooks.buildEmptyProviderHealthOverview()

    assert.equal(overview.readonly, true)
    assert.equal(overview.willCallExternal, false)
    assert.equal(overview.willCallProvider, false)
    assert.equal(overview.willUploadStorage, false)
    assert.equal(overview.willCreateGenerationTask, false)
    assert.equal(overview.willChargePoints, false)
    assert.equal(overview.realProviderSmokeAllowed, false)
    assert.equal(overview.smokeGateSummary.realProviderSmokeAllowed, false)
    assert.ok(overview.generatedAt)
  })

  it('redacts sensitive provider, storage, env, and raw payload fields', () => {
    const result = __adminProviderHealthTestHooks.sanitizeProviderHealthValue({
      provider: {
        id: 'provider-1',
        name: 'Demo provider',
        apiKeyEncrypted: 'must-not-leak',
        token: 'must-not-leak',
        rawPayloadJson: {
          secret: 'must-not-leak',
        },
      },
      storage: {
        OSS_ACCESS_KEY: 'must-not-leak',
        OSS_SECRET: 'must-not-leak',
        endpoint: 'https://example.invalid',
      },
      nested: {
        safe: 'visible',
      },
    })

    const text = JSON.stringify(result)
    assert.doesNotMatch(text, /apiKeyEncrypted/)
    assert.doesNotMatch(text, /OSS_ACCESS_KEY/)
    assert.doesNotMatch(text, /OSS_SECRET/)
    assert.doesNotMatch(text, /rawPayloadJson/)
    assert.doesNotMatch(text, /must-not-leak/)
    assert.match(text, /visible/)
    assert.match(text, /redactedFields/)
  })

  it('reports readonly risk items without allowing real external calls', () => {
    const overview = __adminProviderHealthTestHooks.buildProviderHealthOverviewFromRecords({
      providers: [
        {
          id: 'provider-1',
          code: 'demo',
          name: 'Demo provider',
          baseUrl: 'https://api.example.com/v1',
          apiKeyEncrypted: '',
          apiKeyHint: '',
          isEnabled: true,
          models: [],
        },
      ],
      legacyProviders: [],
      storageConfigs: [],
      env: {},
    })

    assert.equal(overview.providerSummary.total, 1)
    assert.equal(overview.providerSummary.enabled, 1)
    assert.equal(overview.modelSummary.total, 0)
    assert.equal(overview.storageSummary.total, 0)
    assert.equal(overview.willCallExternal, false)
    assert.equal(overview.willCallProvider, false)
    assert.equal(overview.willUploadStorage, false)
    assert.equal(overview.realProviderSmokeAllowed, false)
    assert.equal(overview.riskItems.some(item => item.status === 'BLOCKED'), true)

    const text = JSON.stringify(overview)
    assert.doesNotMatch(text, /apiKeyEncrypted/)
    assert.doesNotMatch(text, /secret/i)
    assert.doesNotMatch(text, /token/i)
    assert.doesNotMatch(text, /rawPayloadJson/)
  })
})
