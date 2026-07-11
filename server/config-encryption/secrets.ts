import crypto from 'node:crypto'

type RuntimeEnv = Record<string, string | undefined>

export type EncryptionSecretScope = 'provider' | 'storage'

export interface EncryptionSecretSet {
  current: string
  previous?: string
}

const SECRET_VARIABLES: Record<EncryptionSecretScope, { current: string; previous: string }> = {
  provider: {
    current: 'PROVIDER_CONFIG_SECRET',
    previous: 'PROVIDER_CONFIG_SECRET_PREVIOUS',
  },
  storage: {
    current: 'STORAGE_CONFIG_SECRET',
    previous: 'STORAGE_CONFIG_SECRET_PREVIOUS',
  },
}

const LEGACY_FALLBACK_FINGERPRINTS = new Set([
  'd224278a3cbbf6338621c898a5bed88b7676516888b6240e96279b258978b051',
  '815ab4acf444b9fd6ff0dff3c749a3be67a689184725374f2378f0a59a6f246b',
])

const MIN_SECRET_BYTES = 32
const placeholderPattern = /(change|your|example|placeholder|dummy|default|password|secret|test)/i

const fingerprintSecret = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex')

const assertSecretStrength = (value: string, variableName: string) => {
  const byteLength = Buffer.byteLength(value, 'utf8')
  const uniqueCharacterCount = new Set(value).size

  if (byteLength < MIN_SECRET_BYTES || uniqueCharacterCount < 8 || placeholderPattern.test(value)) {
    throw new Error(`${variableName} must contain strong secret material.`)
  }
  if (LEGACY_FALLBACK_FINGERPRINTS.has(fingerprintSecret(value))) {
    throw new Error(`${variableName} must not use a legacy fallback secret.`)
  }
}

const readSecret = (env: RuntimeEnv, variableName: string, required: boolean) => {
  const value = String(env[variableName] || '').trim()
  if (!value && required) {
    throw new Error(`${variableName} is required.`)
  }
  if (value) {
    assertSecretStrength(value, variableName)
  }
  return value
}

export const resolveEncryptionSecrets = (
  scope: EncryptionSecretScope,
  env: RuntimeEnv = process.env,
): EncryptionSecretSet => {
  const names = SECRET_VARIABLES[scope]
  const current = readSecret(env, names.current, true)
  const previous = readSecret(env, names.previous, false)

  if (previous && fingerprintSecret(previous) === fingerprintSecret(current)) {
    throw new Error(`${names.previous} must differ from ${names.current}.`)
  }

  return previous ? { current, previous } : { current }
}

export const deriveEncryptionKey = (secret: string) => crypto.createHash('sha256').update(secret).digest()

export const validateProductionEncryptionSecrets = (env: RuntimeEnv = process.env) => {
  const provider = resolveEncryptionSecrets('provider', env)
  const storage = resolveEncryptionSecrets('storage', env)
  const fingerprints = [
    fingerprintSecret(provider.current),
    ...(provider.previous ? [fingerprintSecret(provider.previous)] : []),
    fingerprintSecret(storage.current),
    ...(storage.previous ? [fingerprintSecret(storage.previous)] : []),
  ]

  if (new Set(fingerprints).size !== fingerprints.length) {
    throw new Error('Provider and storage encryption secrets must remain independent.')
  }

  return { valid: true as const }
}
