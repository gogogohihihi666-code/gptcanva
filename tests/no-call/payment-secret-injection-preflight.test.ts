import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePaymentProvider } from '../../server/marketing-center/payment/provider-registry'
import { runPaymentSecretInjectionPreflight } from '../../server/marketing-center/payment/preflight'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

const originalEnv = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)
})

const clearPaymentEnv = () => {
  for (const key of [
    'NODE_ENV',
    'PAYMENT_PROVIDER',
    'PAYMENT_ENVIRONMENT',
    'PAYMENT_ALIPAY_ENABLED',
    'PAYMENT_WECHAT_ENABLED',
    'PAYMENT_AGGREGATOR_ENABLED',
    'PAYMENT_SANDBOX_REAL_CALLS_ALLOWED',
    'ALIPAY_SANDBOX_APP_ID',
    'ALIPAY_SANDBOX_PRIVATE_KEY',
    'ALIPAY_SANDBOX_PUBLIC_KEY',
    'ALIPAY_SANDBOX_GATEWAY_URL',
    'WECHATPAY_SANDBOX_MCH_ID',
    'WECHATPAY_SANDBOX_APP_ID',
    'WECHATPAY_SANDBOX_API_V3_KEY',
    'WECHATPAY_SANDBOX_PRIVATE_KEY',
    'WECHATPAY_SANDBOX_CERTIFICATE',
    'WECHATPAY_SANDBOX_SERIAL_NO',
    'PAYMENT_AGGREGATOR_SANDBOX_APP_ID',
    'PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE',
    'PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID',
    'PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL',
    'PAYMENT_AGGREGATOR_SANDBOX_SECRET',
    'PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY',
    'PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY',
    'PAYMENT_NOTIFY_URL',
    'PAYMENT_RETURN_URL',
    'PAYMENT_WEBHOOK_SECRET',
  ]) {
    delete process.env[key]
  }
}

const setAlipayPlaceholderEnv = () => {
  process.env.PAYMENT_ALIPAY_ENABLED = 'true'
  process.env.ALIPAY_SANDBOX_APP_ID = 'your_alipay_sandbox_app_id'
  process.env.ALIPAY_SANDBOX_PRIVATE_KEY = 'your_alipay_sandbox_private_key'
  process.env.ALIPAY_SANDBOX_PUBLIC_KEY = 'your_alipay_sandbox_public_key'
  process.env.ALIPAY_SANDBOX_GATEWAY_URL = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
  process.env.PAYMENT_NOTIFY_URL = 'https://your-domain.example/api/marketing/payment-webhooks'
  process.env.PAYMENT_RETURN_URL = 'https://your-domain.example/payment/result'
  process.env.PAYMENT_WEBHOOK_SECRET = 'your_payment_webhook_secret'
}

const setWeChatPlaceholderEnv = () => {
  process.env.PAYMENT_WECHAT_ENABLED = 'true'
  process.env.WECHATPAY_SANDBOX_MCH_ID = 'your_wechatpay_sandbox_mch_id'
  process.env.WECHATPAY_SANDBOX_APP_ID = 'your_wechatpay_sandbox_app_id'
  process.env.WECHATPAY_SANDBOX_API_V3_KEY = 'your_wechatpay_sandbox_api_v3_key'
  process.env.WECHATPAY_SANDBOX_PRIVATE_KEY = 'your_wechatpay_sandbox_private_key'
  process.env.WECHATPAY_SANDBOX_CERTIFICATE = 'your_wechatpay_sandbox_certificate'
  process.env.WECHATPAY_SANDBOX_SERIAL_NO = 'your_wechatpay_sandbox_serial_no'
  process.env.PAYMENT_NOTIFY_URL = 'https://your-domain.example/api/marketing/payment-webhooks'
  process.env.PAYMENT_RETURN_URL = 'https://your-domain.example/payment/result'
  process.env.PAYMENT_WEBHOOK_SECRET = 'your_payment_webhook_secret'
}

const setAggregatorPlaceholderEnv = () => {
  process.env.PAYMENT_AGGREGATOR_ENABLED = 'true'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_APP_ID = 'your_payment_aggregator_sandbox_app_id'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE = 'your_payment_aggregator_sandbox_provider_code'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID = 'your_payment_aggregator_sandbox_merchant_id'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL = 'https://aggregator-sandbox.example.invalid/gateway'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_SECRET = 'your_payment_aggregator_sandbox_secret'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY = 'your_payment_aggregator_sandbox_private_key'
  process.env.PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY = 'your_payment_aggregator_sandbox_public_key'
  process.env.PAYMENT_NOTIFY_URL = 'https://your-domain.example/api/marketing/payment-webhooks'
  process.env.PAYMENT_RETURN_URL = 'https://your-domain.example/payment/result'
  process.env.PAYMENT_WEBHOOK_SECRET = 'your_payment_webhook_secret'
}

const fakePrivateKeyForShape = () => [
  '-----BEGIN PRIVATE',
  'KEY-----\nnot-real-key-for-shape-only\n-----END PRIVATE',
  'KEY-----',
].join(' ')

const fakePublicKeyForShape = () => [
  '-----BEGIN PUBLIC',
  'KEY-----\nnot-real-public-key-for-shape-only\n-----END PUBLIC',
  'KEY-----',
].join(' ')

describe('payment sandbox secret injection preflight no-call', () => {
  it('fails missing Alipay sandbox env without external calls', () => {
    clearPaymentEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'ALIPAY', environment: 'sandbox' })

    assert.equal(result.status, 'FAIL')
    assert.equal(result.provider, 'ALIPAY')
    assert.equal(result.channel, 'alipay')
    assert.equal(result.environment, 'sandbox')
    assert.equal(result.enabled, false)
    assert.ok(result.missingEnv.includes('ALIPAY_SANDBOX_APP_ID'))
    assert.ok(result.missingEnv.includes('PAYMENT_NOTIFY_URL'))
    assert.equal(result.will_call_external, false)
    assert.equal(result.will_charge_real_money, false)
    assert.equal(result.will_create_real_payment, false)
    assert.equal(result.will_grant_benefit, false)
  })

  it('detects Alipay placeholder and invalid key shapes without leaking values', () => {
    clearPaymentEnv()
    setAlipayPlaceholderEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'ALIPAY', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'WARN')
    assert.equal(result.ready_for_manual_sandbox_auth, true)
    assert.ok(result.placeholderEnv.includes('ALIPAY_SANDBOX_PRIVATE_KEY'))
    assert.ok(result.placeholderEnv.includes('PAYMENT_WEBHOOK_SECRET'))
    assert.doesNotMatch(serialized, /your_alipay_sandbox_private_key/)
    assert.doesNotMatch(serialized, /your_payment_webhook_secret/)
    assert.equal(result.will_call_external, false)
  })

  it('detects non-placeholder invalid Alipay key and url formats', () => {
    clearPaymentEnv()
    process.env.PAYMENT_ALIPAY_ENABLED = 'true'
    process.env.ALIPAY_SANDBOX_APP_ID = 'sandbox-app-id-123'
    process.env.ALIPAY_SANDBOX_PRIVATE_KEY = 'invalid-private-key-shape'
    process.env.ALIPAY_SANDBOX_PUBLIC_KEY = 'invalid-public-key-shape'
    process.env.ALIPAY_SANDBOX_GATEWAY_URL = 'http://sandbox-pay.local/gateway'
    process.env.PAYMENT_NOTIFY_URL = 'not-a-url'
    process.env.PAYMENT_RETURN_URL = 'https://merchant.example.invalid/payment/result'
    process.env.PAYMENT_WEBHOOK_SECRET = 'not-placeholder-secret'

    const result = runPaymentSecretInjectionPreflight({ provider: 'ALIPAY', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'FAIL')
    assert.ok(result.invalidEnv.includes('ALIPAY_SANDBOX_PRIVATE_KEY'))
    assert.ok(result.invalidEnv.includes('ALIPAY_SANDBOX_PUBLIC_KEY'))
    assert.ok(result.invalidEnv.includes('ALIPAY_SANDBOX_GATEWAY_URL'))
    assert.ok(result.invalidEnv.includes('PAYMENT_NOTIFY_URL'))
    assert.doesNotMatch(serialized, /invalid-private-key-shape/)
    assert.equal(result.will_call_external, false)
  })

  it('fails missing WeChat Pay sandbox env without external calls', () => {
    clearPaymentEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'WECHAT', environment: 'sandbox' })

    assert.equal(result.status, 'FAIL')
    assert.equal(result.provider, 'WECHAT')
    assert.equal(result.channel, 'wechat')
    assert.equal(result.enabled, false)
    assert.ok(result.missingEnv.includes('WECHATPAY_SANDBOX_MCH_ID'))
    assert.ok(result.missingEnv.includes('WECHATPAY_SANDBOX_API_V3_KEY'))
    assert.equal(result.will_call_external, false)
    assert.equal(result.will_charge_real_money, false)
    assert.equal(result.will_create_real_payment, false)
    assert.equal(result.will_grant_benefit, false)
  })

  it('detects WeChat placeholder env without leaking values', () => {
    clearPaymentEnv()
    setWeChatPlaceholderEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'WECHAT', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'WARN')
    assert.ok(result.placeholderEnv.includes('WECHATPAY_SANDBOX_PRIVATE_KEY'))
    assert.ok(result.placeholderEnv.includes('WECHATPAY_SANDBOX_CERTIFICATE'))
    assert.ok(result.placeholderEnv.includes('WECHATPAY_SANDBOX_API_V3_KEY'))
    assert.doesNotMatch(serialized, /your_wechatpay_sandbox_private_key/)
    assert.equal(result.will_call_external, false)
  })

  it('detects optional certificate format errors when a certificate env is provided', () => {
    clearPaymentEnv()
    process.env.PAYMENT_WECHAT_ENABLED = 'true'
    process.env.WECHATPAY_SANDBOX_MCH_ID = 'sandbox-mch-123'
    process.env.WECHATPAY_SANDBOX_APP_ID = 'sandbox-app-123'
    process.env.WECHATPAY_SANDBOX_API_V3_KEY = 'not-placeholder-api-v3-key'
    process.env.WECHATPAY_SANDBOX_PRIVATE_KEY = fakePrivateKeyForShape()
    process.env.WECHATPAY_SANDBOX_CERTIFICATE = 'invalid-certificate-shape'
    process.env.WECHATPAY_SANDBOX_SERIAL_NO = 'ABCDEF1234567890'
    process.env.PAYMENT_NOTIFY_URL = 'https://merchant.example.invalid/api/marketing/payment-webhooks'
    process.env.PAYMENT_RETURN_URL = 'https://merchant.example.invalid/payment/result'
    process.env.PAYMENT_WEBHOOK_SECRET = 'not-placeholder-webhook-secret'

    const result = runPaymentSecretInjectionPreflight({ provider: 'WECHAT', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'FAIL')
    assert.ok(result.invalidEnv.includes('WECHATPAY_SANDBOX_CERTIFICATE'))
    assert.doesNotMatch(serialized, /invalid-certificate-shape/)
    assert.equal(result.will_call_external, false)
  })

  it('disables mock provider in production', () => {
    clearPaymentEnv()
    process.env.NODE_ENV = 'production'

    const result = runPaymentSecretInjectionPreflight({ provider: 'MOCK', environment: 'production' })

    assert.equal(result.status, 'FAIL')
    assert.ok(result.checks.some((item) => item.code === 'PRODUCTION_MOCK_DISABLED' && item.status === 'FAIL'))
  })

  it('fails missing aggregator sandbox env without external calls', () => {
    clearPaymentEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'AGGREGATOR', environment: 'sandbox' })

    assert.equal(result.status, 'FAIL')
    assert.equal(result.provider, 'AGGREGATOR')
    assert.equal(result.channel, 'aggregator')
    assert.equal(result.enabled, false)
    assert.ok(result.missingEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE'))
    assert.ok(result.missingEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_SECRET'))
    assert.equal(result.will_call_external, false)
    assert.equal(result.will_charge_real_money, false)
    assert.equal(result.will_create_real_payment, false)
    assert.equal(result.will_grant_benefit, false)
  })

  it('detects aggregator placeholder env without leaking values', () => {
    clearPaymentEnv()
    setAggregatorPlaceholderEnv()

    const result = runPaymentSecretInjectionPreflight({ provider: 'AGGREGATOR', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'WARN')
    assert.ok(result.placeholderEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE'))
    assert.ok(result.placeholderEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_SECRET'))
    assert.ok(result.warnings.some((warning) => warning.includes('PAYMENT_AGGREGATOR_SANDBOX_SECRET')))
    assert.doesNotMatch(serialized, /your_payment_aggregator_sandbox_secret/)
    assert.equal(result.will_call_external, false)
  })

  it('detects aggregator invalid env shapes without external calls', () => {
    clearPaymentEnv()
    process.env.PAYMENT_AGGREGATOR_ENABLED = 'true'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_APP_ID = 'sandbox-aggregator-app'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE = 'sandbox-aggregator'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID = 'sandbox-merchant'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL = 'not-a-url'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_SECRET = 'too-short'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY = 'invalid-private-key-shape'
    process.env.PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY = 'invalid-public-key-shape'
    process.env.PAYMENT_NOTIFY_URL = 'https://merchant.example.invalid/api/marketing/payment-webhooks'
    process.env.PAYMENT_RETURN_URL = 'https://merchant.example.invalid/payment/result'
    process.env.PAYMENT_WEBHOOK_SECRET = 'not-placeholder-webhook-secret'

    const result = runPaymentSecretInjectionPreflight({ provider: 'AGGREGATOR', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.status, 'FAIL')
    assert.ok(result.invalidEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL'))
    assert.ok(result.invalidEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_SECRET'))
    assert.ok(result.invalidEnv.includes('PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY'))
    assert.doesNotMatch(serialized, /invalid-private-key-shape/)
    assert.equal(result.will_call_external, false)
  })

  it('keeps sandbox provider unable to make real calls even with authorization env', () => {
    clearPaymentEnv()
    setAlipayPlaceholderEnv()
    process.env.PAYMENT_SANDBOX_REAL_CALLS_ALLOWED = 'true'

    const result = runPaymentSecretInjectionPreflight({ provider: 'ALIPAY', environment: 'sandbox' })

    assert.equal(result.will_call_external, false)
    assert.equal(result.will_charge_real_money, false)
    assert.equal(result.will_create_real_payment, false)
    assert.equal(result.will_grant_benefit, false)
    assert.throws(() => resolvePaymentProvider('ALIPAY'), /not implemented in no-call phase/)
  })

  it('keeps secrets out of response even when env values look complete', () => {
    clearPaymentEnv()
    process.env.PAYMENT_ALIPAY_ENABLED = 'true'
    process.env.ALIPAY_SANDBOX_APP_ID = 'sandbox-app-id-123'
    process.env.ALIPAY_SANDBOX_PRIVATE_KEY = fakePrivateKeyForShape()
    process.env.ALIPAY_SANDBOX_PUBLIC_KEY = fakePublicKeyForShape()
    process.env.ALIPAY_SANDBOX_GATEWAY_URL = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    process.env.PAYMENT_NOTIFY_URL = 'https://merchant.example.invalid/api/marketing/payment-webhooks'
    process.env.PAYMENT_RETURN_URL = 'https://merchant.example.invalid/payment/result'
    process.env.PAYMENT_WEBHOOK_SECRET = 'not-real-webhook-secret-for-shape-only'

    const result = runPaymentSecretInjectionPreflight({ provider: 'ALIPAY', environment: 'sandbox' })
    const serialized = JSON.stringify(result)

    assert.equal(result.will_call_external, false)
    assert.equal(result.ready_for_manual_sandbox_auth, true)
    assert.doesNotMatch(serialized, /not-real-key-for-shape-only/)
    assert.doesNotMatch(serialized, /not-real-webhook-secret-for-shape-only/)
  })

  it('keeps gitignore, route, docs, and env examples aligned', () => {
    const gitignore = readText('.gitignore')
    const envExample = readText('.env.example')
    const constants = readText('server/marketing-center/constants.ts')
    const handler = readText('server/marketing-center/request-handler.ts')
    const docs = readText('docs/payment-sandbox-secret-injection-no-call.md')

    for (const pattern of ['.env', '.env.local', '.env.*.local', '.env.production', '.env.production.local', '*.pem', '*.key', '*.p12', '*.pfx', 'certs/', 'secrets/']) {
      assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }

    assert.match(envExample, /ALIPAY_SANDBOX_PRIVATE_KEY=your_alipay_sandbox_private_key/)
    assert.match(envExample, /^PAYMENT_PROVIDER=mock/m)
    assert.match(envExample, /WECHATPAY_SANDBOX_API_V3_KEY=your_wechatpay_sandbox_api_v3_key/)
    assert.match(envExample, /WECHATPAY_SANDBOX_CERTIFICATE=your_wechatpay_sandbox_certificate/)
    assert.match(envExample, /PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE=your_payment_aggregator_sandbox_provider_code/)
    assert.match(envExample, /PAYMENT_AGGREGATOR_SANDBOX_SECRET=your_payment_aggregator_sandbox_secret/)
    assert.match(constants, /MARKETING_CENTER_PAYMENT_SECRET_PREFLIGHT_PATH/)
    assert.match(handler, /preflightPaymentSecretInjection/)
    assert.match(docs, /will_call_external=false/)
  })
})
