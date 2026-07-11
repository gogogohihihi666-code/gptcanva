type RuntimeEnv = Record<string, string | undefined>
import { validateProductionEncryptionSecrets } from '../config-encryption/secrets'

const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5010',
  'http://127.0.0.1:5010',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

export const PRODUCTION_DISABLED_GATES = [
  'OKPICAI_ALLOW_LOCAL_DEMO_FIXTURES',
  'ENABLE_LOCAL_PAYMENT_SIMULATION',
  'AI_PROVIDER_REAL_GENERATION_ALLOWED',
  'AI_PROVIDER_REAL_SMOKE_ALLOWED',
  'AI_PROVIDER_REAL_TEST_ALLOWED',
  'OBJECT_STORAGE_REAL_TEST_ALLOWED',
  'OBJECT_STORAGE_REAL_UPLOAD_ALLOWED',
  'AI_GATEWAY_DEBUG_HEADERS',
  'AUTH_VERIFICATION_DEBUG_AUTOFILL',
] as const

const isEnabled = (value: unknown) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())

const isProduction = (env: RuntimeEnv) => String(env.NODE_ENV || '').trim().toLowerCase() === 'production'

const isValidPort = (value: unknown) => {
  const port = Number(String(value || '').trim())
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

export const parseProductionCorsAllowedOrigins = (rawValue: unknown) => {
  const rawOrigins = String(rawValue || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (!rawOrigins.length) {
    throw new Error('CORS_ALLOWED_ORIGINS is required in production.')
  }

  const origins = rawOrigins.map((rawOrigin) => {
    if (rawOrigin === '*' || rawOrigin.includes('*')) {
      throw new Error('CORS_ALLOWED_ORIGINS must not contain a wildcard in production.')
    }

    let parsed: URL
    try {
      parsed = new URL(rawOrigin)
    } catch {
      throw new Error('CORS_ALLOWED_ORIGINS contains an invalid origin.')
    }

    const isExactOrigin = rawOrigin === parsed.origin || rawOrigin === `${parsed.origin}/`
    const isLocalhost = (
      parsed.hostname === 'localhost'
      || parsed.hostname.endsWith('.localhost')
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '::1'
      || parsed.hostname === '[::1]'
    )
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== '/'
      || !isExactOrigin
      || isLocalhost
    ) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTPS origins only in production.')
    }

    return parsed.origin
  })

  return Array.from(new Set(origins))
}

export const resolveCorsAllowedOrigins = (env: RuntimeEnv = process.env) => {
  if (isProduction(env)) {
    return parseProductionCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS)
  }

  const configuredOrigins = String(env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return configuredOrigins.length ? Array.from(new Set(configuredOrigins)) : LOCAL_DEVELOPMENT_ORIGINS
}

export const getProductionConfigErrors = (env: RuntimeEnv = process.env) => {
  const errors: string[] = []

  if (!isProduction(env)) {
    errors.push('NODE_ENV must be production.')
  }
  if (!String(env.DATABASE_URL || '').trim()) {
    errors.push('DATABASE_URL is required.')
  }
  if (!isValidPort(env.SERVER_PORT)) {
    errors.push('SERVER_PORT must be a valid port.')
  }

  try {
    parseProductionCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'CORS_ALLOWED_ORIGINS is invalid.')
  }

  for (const gateName of PRODUCTION_DISABLED_GATES) {
    if (isEnabled(env[gateName])) {
      errors.push(`${gateName} must be disabled in production.`)
    }
  }

  try {
    validateProductionEncryptionSecrets(env)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Configuration encryption secrets are invalid.')
  }

  if (!String(env.AUTH_VERIFICATION_DELIVERY_PROVIDER || '').trim()) {
    errors.push('AUTH_VERIFICATION_DELIVERY_PROVIDER is required for production verification-code login.')
  }
  errors.push('AUTH_VERIFICATION_DELIVERY_READY cannot be satisfied until a real delivery adapter is implemented.')

  return errors
}

export const assertProductionConfig = (env: RuntimeEnv = process.env) => {
  const errors = getProductionConfigErrors(env)
  if (errors.length) {
    throw new Error(`Production preflight failed: ${errors.join(' ')}`)
  }

  return {
    allowedOrigins: parseProductionCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
  }
}
