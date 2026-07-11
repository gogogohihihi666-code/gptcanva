import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  resolveEncryptionSecrets,
  validateProductionEncryptionSecrets,
} from '../../server/config-encryption/secrets'
import { getProductionConfigErrors } from '../../server/production-config/preflight'
import { decryptProviderApiKey, encryptProviderApiKey } from '../../server/provider-config/crypto'
import { decryptStorageSecretKey, encryptStorageSecretKey } from '../../server/storage-config/crypto'

const root = resolve(import.meta.dirname, '../..')
const readProjectFile = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8')
const createSecret = () => crypto.randomBytes(48).toString('base64url')

test('configuration encryption rejects missing and weak current secrets', () => {
  assert.throws(
    () => resolveEncryptionSecrets('provider', {}),
    /PROVIDER_CONFIG_SECRET/,
  )
  assert.throws(
    () => resolveEncryptionSecrets('storage', { STORAGE_CONFIG_SECRET: 'short' }),
    /STORAGE_CONFIG_SECRET/,
  )
  assert.throws(
    () => resolveEncryptionSecrets('provider', { PROVIDER_CONFIG_SECRET: 'placeholder-value' }),
    /PROVIDER_CONFIG_SECRET/,
  )
})

test('production encryption validation requires independent provider and storage material', () => {
  const sharedSecret = createSecret()
  assert.throws(
    () => validateProductionEncryptionSecrets({
      PROVIDER_CONFIG_SECRET: sharedSecret,
      STORAGE_CONFIG_SECRET: sharedSecret,
    }),
    /independent/,
  )

  const result = validateProductionEncryptionSecrets({
    PROVIDER_CONFIG_SECRET: createSecret(),
    STORAGE_CONFIG_SECRET: createSecret(),
  })
  assert.equal(result.valid, true)

  const preflightErrors = getProductionConfigErrors({
    NODE_ENV: 'production',
    DATABASE_URL: 'present-for-test-only',
    SERVER_PORT: '5409',
    CORS_ALLOWED_ORIGINS: 'https://www.okwook.com',
    AUTH_VERIFICATION_DELIVERY_PROVIDER: 'reserved',
    PROVIDER_CONFIG_SECRET: sharedSecret,
    STORAGE_CONFIG_SECRET: sharedSecret,
  })
  assert.equal(preflightErrors.some(error => error.includes('independent')), true)
})

test('provider ciphertext remains readable during an explicit previous-key rotation window', () => {
  const originalCurrent = process.env.PROVIDER_CONFIG_SECRET
  const originalPrevious = process.env.PROVIDER_CONFIG_SECRET_PREVIOUS
  const firstSecret = createSecret()
  const secondSecret = createSecret()

  try {
    process.env.PROVIDER_CONFIG_SECRET = firstSecret
    delete process.env.PROVIDER_CONFIG_SECRET_PREVIOUS
    const encrypted = encryptProviderApiKey('fixture-api-key')

    process.env.PROVIDER_CONFIG_SECRET = secondSecret
    process.env.PROVIDER_CONFIG_SECRET_PREVIOUS = firstSecret
    assert.equal(decryptProviderApiKey(encrypted), 'fixture-api-key')
  } finally {
    if (originalCurrent === undefined) delete process.env.PROVIDER_CONFIG_SECRET
    else process.env.PROVIDER_CONFIG_SECRET = originalCurrent
    if (originalPrevious === undefined) delete process.env.PROVIDER_CONFIG_SECRET_PREVIOUS
    else process.env.PROVIDER_CONFIG_SECRET_PREVIOUS = originalPrevious
  }
})

test('storage ciphertext remains readable during an explicit previous-key rotation window', () => {
  const originalCurrent = process.env.STORAGE_CONFIG_SECRET
  const originalPrevious = process.env.STORAGE_CONFIG_SECRET_PREVIOUS
  const firstSecret = createSecret()
  const secondSecret = createSecret()

  try {
    process.env.STORAGE_CONFIG_SECRET = firstSecret
    delete process.env.STORAGE_CONFIG_SECRET_PREVIOUS
    const encrypted = encryptStorageSecretKey('fixture-storage-key')

    process.env.STORAGE_CONFIG_SECRET = secondSecret
    process.env.STORAGE_CONFIG_SECRET_PREVIOUS = firstSecret
    assert.equal(decryptStorageSecretKey(encrypted), 'fixture-storage-key')
  } finally {
    if (originalCurrent === undefined) delete process.env.STORAGE_CONFIG_SECRET
    else process.env.STORAGE_CONFIG_SECRET = originalCurrent
    if (originalPrevious === undefined) delete process.env.STORAGE_CONFIG_SECRET_PREVIOUS
    else process.env.STORAGE_CONFIG_SECRET_PREVIOUS = originalPrevious
  }
})

test('crypto modules have no source fallback and production preflight includes encryption validation', () => {
  const providerCrypto = readProjectFile('server/provider-config/crypto.ts')
  const storageCrypto = readProjectFile('server/storage-config/crypto.ts')
  const productionPreflight = readProjectFile('server/production-config/preflight.ts')

  assert.doesNotMatch(providerCrypto, /DEFAULT_SECRET/)
  assert.doesNotMatch(storageCrypto, /DEFAULT_SECRET/)
  assert.doesNotMatch(storageCrypto, /\|\|\s*process\.env\.PROVIDER_CONFIG_SECRET/)
  assert.match(productionPreflight, /validateProductionEncryptionSecrets/)
})

test('production templates and release checklist document independent current and previous encryption keys', () => {
  const productionTemplate = readProjectFile('.env.production.example')
  const dockerTemplate = readProjectFile('.env.docker.example')
  const checklist = readProjectFile('docs/release-readiness-checklist.md')

  for (const variableName of [
    'PROVIDER_CONFIG_SECRET_PREVIOUS',
    'STORAGE_CONFIG_SECRET_PREVIOUS',
  ]) {
    assert.match(productionTemplate, new RegExp(variableName))
    assert.match(dockerTemplate, new RegExp(variableName))
  }

  assert.match(checklist, /Configuration Encryption Secret Controls/)
  assert.match(checklist, /legacy fallback ciphertext/i)
})
