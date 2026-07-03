import type { PaymentProviderCode } from './provider-types'

export type PaymentSecretInjectionEnvironment = 'mock' | 'sandbox' | 'production'
export type PaymentSecretInjectionChannel = 'mock' | 'alipay' | 'wechat' | 'aggregator'

type EnvFieldKind = 'plain' | 'url' | 'private_key' | 'public_key' | 'certificate' | 'webhook_secret' | 'serial_no'

interface RequiredEnvSpec {
  name: string
  kind: EnvFieldKind
  requiredInSandbox: boolean
}

interface ProviderSecretSpec {
  provider: PaymentProviderCode
  channel: PaymentSecretInjectionChannel
  enabledEnv: string
  requiredEnv: RequiredEnvSpec[]
}

export interface PaymentSecretInjectionPreflightInput {
  provider?: unknown
  environment?: unknown
}

export interface PaymentSecretInjectionPreflightResult {
  provider: PaymentProviderCode
  channel: PaymentSecretInjectionChannel
  environment: PaymentSecretInjectionEnvironment
  enabled: boolean
  status: 'PASS' | 'WARN' | 'FAIL'
  missingEnv: string[]
  placeholderEnv: string[]
  invalidEnv: string[]
  checks: Array<{
    code: string
    status: 'PASS' | 'WARN' | 'FAIL'
    message: string
    env?: string
  }>
  will_call_external: false
  will_charge_real_money: false
  will_create_real_payment: false
  will_grant_benefit: false
  ready_for_manual_sandbox_auth: boolean
}

const PROVIDER_SPECS: Record<PaymentProviderCode, ProviderSecretSpec> = {
  MOCK: {
    provider: 'MOCK',
    channel: 'mock',
    enabledEnv: 'PAYMENT_MOCK_ENABLED',
    requiredEnv: [],
  },
  ALIPAY: {
    provider: 'ALIPAY',
    channel: 'alipay',
    enabledEnv: 'PAYMENT_ALIPAY_ENABLED',
    requiredEnv: [
      { name: 'ALIPAY_SANDBOX_APP_ID', kind: 'plain', requiredInSandbox: true },
      { name: 'ALIPAY_SANDBOX_PRIVATE_KEY', kind: 'private_key', requiredInSandbox: true },
      { name: 'ALIPAY_SANDBOX_PUBLIC_KEY', kind: 'public_key', requiredInSandbox: true },
      { name: 'ALIPAY_SANDBOX_GATEWAY_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_NOTIFY_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_RETURN_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_WEBHOOK_SECRET', kind: 'webhook_secret', requiredInSandbox: true },
    ],
  },
  WECHAT: {
    provider: 'WECHAT',
    channel: 'wechat',
    enabledEnv: 'PAYMENT_WECHAT_ENABLED',
    requiredEnv: [
      { name: 'WECHATPAY_SANDBOX_MCH_ID', kind: 'plain', requiredInSandbox: true },
      { name: 'WECHATPAY_SANDBOX_APP_ID', kind: 'plain', requiredInSandbox: true },
      { name: 'WECHATPAY_SANDBOX_API_V3_KEY', kind: 'webhook_secret', requiredInSandbox: true },
      { name: 'WECHATPAY_SANDBOX_PRIVATE_KEY', kind: 'private_key', requiredInSandbox: true },
      { name: 'WECHATPAY_SANDBOX_CERTIFICATE', kind: 'certificate', requiredInSandbox: false },
      { name: 'WECHATPAY_SANDBOX_SERIAL_NO', kind: 'serial_no', requiredInSandbox: true },
      { name: 'PAYMENT_NOTIFY_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_RETURN_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_WEBHOOK_SECRET', kind: 'webhook_secret', requiredInSandbox: true },
    ],
  },
  AGGREGATOR: {
    provider: 'AGGREGATOR',
    channel: 'aggregator',
    enabledEnv: 'PAYMENT_AGGREGATOR_ENABLED',
    requiredEnv: [
      { name: 'PAYMENT_AGGREGATOR_SANDBOX_APP_ID', kind: 'plain', requiredInSandbox: true },
      { name: 'PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID', kind: 'plain', requiredInSandbox: true },
      { name: 'PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_NOTIFY_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_RETURN_URL', kind: 'url', requiredInSandbox: true },
      { name: 'PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY', kind: 'private_key', requiredInSandbox: true },
      { name: 'PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY', kind: 'public_key', requiredInSandbox: true },
      { name: 'PAYMENT_WEBHOOK_SECRET', kind: 'webhook_secret', requiredInSandbox: true },
    ],
  },
}

const PLACEHOLDER_PATTERN = /^(your_|your-|placeholder|example|changeme|change-me|replace_me|replace-me|dummy|test)/i

export const normalizePaymentSecretProvider = (value: unknown): PaymentProviderCode => {
  const provider = String(value || process.env.PAYMENT_PROVIDER || 'MOCK').trim().toUpperCase()
  if (provider === 'MOCK' || provider === 'ALIPAY' || provider === 'WECHAT' || provider === 'AGGREGATOR') {
    return provider
  }
  throw new Error('payment preflight provider is unsupported')
}

export const normalizePaymentSecretEnvironment = (value: unknown): PaymentSecretInjectionEnvironment => {
  const environment = String(value || process.env.PAYMENT_ENVIRONMENT || 'mock').trim().toLowerCase()
  if (environment === 'mock' || environment === 'sandbox' || environment === 'production') {
    return environment
  }
  throw new Error('payment preflight environment is unsupported')
}

const isEnabled = (envName: string, fallback: boolean) => {
  const raw = process.env[envName]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback
  }
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase())
}

const isPlaceholderValue = (value: string) => {
  const normalized = value.trim()
  return !normalized
    || PLACEHOLDER_PATTERN.test(normalized)
    || normalized.includes('your-domain.example')
    || normalized.includes('example.invalid')
}

const hasPrivateKeyShape = (value: string) => {
  const normalized = value.trim()
  return normalized.includes('-----BEGIN') && normalized.includes('PRIVATE KEY') && normalized.includes('-----END')
}

const hasPublicKeyOrCertificateShape = (value: string) => {
  const normalized = value.trim()
  return normalized.includes('-----BEGIN') && normalized.includes('-----END')
}

const hasUrlShape = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

const hasSecretShape = (value: string) => value.trim().length >= 16
const hasSerialNoShape = (value: string) => /^[A-Z0-9]{8,64}$/i.test(value.trim())

const isInvalidEnvValue = (kind: EnvFieldKind, value: string) => {
  if (kind === 'url') return !hasUrlShape(value)
  if (kind === 'private_key') return !hasPrivateKeyShape(value)
  if (kind === 'public_key' || kind === 'certificate') return !hasPublicKeyOrCertificateShape(value)
  if (kind === 'webhook_secret') return !hasSecretShape(value)
  if (kind === 'serial_no') return !hasSerialNoShape(value)
  return false
}

const pushCheck = (
  checks: PaymentSecretInjectionPreflightResult['checks'],
  code: string,
  status: 'PASS' | 'WARN' | 'FAIL',
  message: string,
  env?: string,
) => {
  checks.push({ code, status, message, ...(env ? { env } : {}) })
}

export const runPaymentSecretInjectionPreflight = (
  input: PaymentSecretInjectionPreflightInput = {},
): PaymentSecretInjectionPreflightResult => {
  const provider = normalizePaymentSecretProvider(input.provider)
  const environment = normalizePaymentSecretEnvironment(input.environment)
  const spec = PROVIDER_SPECS[provider]
  const enabled = provider === 'MOCK'
    ? isEnabled(spec.enabledEnv, true)
    : isEnabled(spec.enabledEnv, false)
  const checks: PaymentSecretInjectionPreflightResult['checks'] = []
  const missingEnv: string[] = []
  const placeholderEnv: string[] = []
  const invalidEnv: string[] = []

  if (enabled) {
    pushCheck(checks, 'PROVIDER_ENABLED', 'PASS', 'provider is enabled for configuration preflight')
  } else {
    pushCheck(checks, 'PROVIDER_ENABLED', 'FAIL', 'provider is disabled for configuration preflight')
  }

  if (provider === 'MOCK' && (environment === 'production' || process.env.NODE_ENV === 'production')) {
    pushCheck(checks, 'PRODUCTION_MOCK_DISABLED', 'FAIL', 'mock provider is disabled for production payment')
  } else {
    pushCheck(checks, 'PRODUCTION_MOCK_DISABLED', 'PASS', 'mock provider is not being treated as production payment')
  }

  if (provider !== 'MOCK' && environment !== 'sandbox') {
    pushCheck(checks, 'PROVIDER_ENVIRONMENT_MATCH', 'FAIL', 'real payment provider preflight must use sandbox environment in this phase')
  } else {
    pushCheck(checks, 'PROVIDER_ENVIRONMENT_MATCH', 'PASS', 'provider and environment are compatible with no-call preflight')
  }

  if (environment === 'sandbox') {
    for (const item of spec.requiredEnv) {
      const value = String(process.env[item.name] || '').trim()
      if (!value) {
        if (!item.requiredInSandbox) {
          continue
        }
        missingEnv.push(item.name)
        pushCheck(checks, 'ENV_MISSING', 'FAIL', `${item.name} is missing`, item.name)
        continue
      }

      if (isPlaceholderValue(value)) {
        placeholderEnv.push(item.name)
        pushCheck(checks, 'ENV_PLACEHOLDER', 'WARN', `${item.name} still contains a placeholder`, item.name)
        continue
      }

      if (isInvalidEnvValue(item.kind, value)) {
        invalidEnv.push(item.name)
        pushCheck(checks, 'ENV_INVALID_FORMAT', 'FAIL', `${item.name} format is invalid`, item.name)
        continue
      }

      pushCheck(checks, 'ENV_PRESENT', 'PASS', `${item.name} is present`, item.name)
    }
  }

  const manualRealCallsAllowed = String(process.env.PAYMENT_SANDBOX_REAL_CALLS_ALLOWED || 'false').trim().toLowerCase() === 'true'
  if (provider !== 'MOCK' && manualRealCallsAllowed) {
    pushCheck(checks, 'SANDBOX_REAL_CALL_AUTHORIZATION', 'WARN', 'manual sandbox authorization flag is present, but this preflight remains no-call')
  } else {
    pushCheck(checks, 'SANDBOX_REAL_CALL_AUTHORIZATION', 'PASS', 'sandbox real calls are not authorized in this phase')
  }

  pushCheck(checks, 'NO_EXTERNAL_CALLS', 'PASS', 'will_call_external=false')
  pushCheck(checks, 'NO_REAL_MONEY', 'PASS', 'will_charge_real_money=false')
  pushCheck(checks, 'NO_REAL_PAYMENT', 'PASS', 'will_create_real_payment=false')
  pushCheck(checks, 'NO_BENEFIT_GRANT', 'PASS', 'will_grant_benefit=false')

  const hasFail = checks.some((item) => item.status === 'FAIL')
  const hasWarn = checks.some((item) => item.status === 'WARN')
  const status = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS'

  return {
    provider,
    channel: spec.channel,
    environment,
    enabled,
    status,
    missingEnv,
    placeholderEnv,
    invalidEnv,
    checks,
    will_call_external: false,
    will_charge_real_money: false,
    will_create_real_payment: false,
    will_grant_benefit: false,
    ready_for_manual_sandbox_auth: provider !== 'MOCK'
      && environment === 'sandbox'
      && enabled
      && missingEnv.length === 0,
  }
}

export const __paymentSecretPreflightTestHooks = {
  isInvalidEnvValue,
  isPlaceholderValue,
  normalizePaymentSecretEnvironment,
  normalizePaymentSecretProvider,
}
