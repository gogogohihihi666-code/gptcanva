import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  assertProductionConfig,
  parseProductionCorsAllowedOrigins,
} from '../../server/production-config/preflight'
import { assertProductionMigrationAuthorization } from '../../scripts/production/migration-authorization.mjs'
import { getVerificationDeliveryReadiness } from '../../server/auth/verification-delivery'

const root = resolve(import.meta.dirname, '../..')
const readProjectFile = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8')

const validProductionEnv = () => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'present-for-test-only',
  SERVER_PORT: '5409',
  CORS_ALLOWED_ORIGINS: 'https://www.okwook.com, https://okwook.com',
  AUTH_VERIFICATION_DELIVERY_PROVIDER: 'external-adapter',
  AUTH_VERIFICATION_DELIVERY_READY: 'true',
})

test('production preflight fails closed for missing or unsafe configuration', () => {
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), CORS_ALLOWED_ORIGINS: '' }),
    /CORS_ALLOWED_ORIGINS/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), CORS_ALLOWED_ORIGINS: '*' }),
    /CORS_ALLOWED_ORIGINS/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), CORS_ALLOWED_ORIGINS: 'http://localhost:5010' }),
    /CORS_ALLOWED_ORIGINS/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), CORS_ALLOWED_ORIGINS: 'https://preview.localhost' }),
    /CORS_ALLOWED_ORIGINS/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), CORS_ALLOWED_ORIGINS: 'https://www.okwook.com/path' }),
    /CORS_ALLOWED_ORIGINS/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), DATABASE_URL: '' }),
    /DATABASE_URL/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), SERVER_PORT: '0' }),
    /SERVER_PORT/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), AUTH_VERIFICATION_DELIVERY_READY: 'false' }),
    /AUTH_VERIFICATION_DELIVERY_READY/,
  )
  assert.throws(
    () => assertProductionConfig({ ...validProductionEnv(), AI_PROVIDER_REAL_TEST_ALLOWED: 'true' }),
    /AI_PROVIDER_REAL_TEST_ALLOWED/,
  )
})

test('production preflight accepts a precise HTTPS origin list and local development keeps localhost', () => {
  assert.throws(
    () => assertProductionConfig(validProductionEnv()),
    /AUTH_VERIFICATION_DELIVERY_READY/,
  )
  assert.deepEqual(parseProductionCorsAllowedOrigins('https://www.okwook.com, https://okwook.com'), [
    'https://www.okwook.com',
    'https://okwook.com',
  ])
  assert.deepEqual(parseProductionCorsAllowedOrigins('https://www.okwook.com,https://www.okwook.com'), [
    'https://www.okwook.com',
  ])
})

test('verification delivery is unavailable in production until an external adapter is explicitly ready', () => {
  assert.deepEqual(
    getVerificationDeliveryReadiness({ NODE_ENV: 'production' }),
    { deliveryProviderConfigured: false, deliveryAvailable: false, willReturnDebugCode: false },
  )
  assert.deepEqual(
    getVerificationDeliveryReadiness({
      NODE_ENV: 'production',
      AUTH_VERIFICATION_DELIVERY_PROVIDER: 'external-adapter',
      AUTH_VERIFICATION_DELIVERY_READY: 'true',
    }),
    { deliveryProviderConfigured: true, deliveryAvailable: false, willReturnDebugCode: false },
  )
  assert.deepEqual(
    getVerificationDeliveryReadiness({ NODE_ENV: 'development' }, true),
    { deliveryProviderConfigured: false, deliveryAvailable: false, willReturnDebugCode: true },
  )
})

test('production startup excludes migration and exposes an explicitly gated migration command', () => {
  const packageJson = JSON.parse(readProjectFile('package.json')) as { scripts: Record<string, string> }
  const startScript = readProjectFile('scripts/start-production.mjs')
  const migrationScriptPath = 'scripts/production/run-migration.mjs'
  const migrationScript = readProjectFile(migrationScriptPath)
  const migrationAuthorization = readProjectFile('scripts/production/migration-authorization.mjs')

  assert.doesNotMatch(startScript, /prisma\s*,\s*\[\s*['"]migrate['"]\s*,\s*['"]deploy['"]\s*\]/)
  assert.doesNotMatch(startScript, /databaseName|databaseAddress|summarizePrismaMigrateOutput/)
  assert.equal(packageJson.scripts['db:migrate:production'], `node ${migrationScriptPath}`)
  assert.equal(existsSync(resolve(root, migrationScriptPath)), true)
  assert.match(migrationScript, /assertProductionMigrationAuthorization/)
  assert.match(migrationAuthorization, /OKWOOK_ALLOW_PRODUCTION_MIGRATION/)
  assert.match(migrationAuthorization, /OKWOOK_PRODUCTION_BACKUP_VERIFIED/)
  assert.match(migrationAuthorization, /NODE_ENV/)
  assert.match(migrationScript, /prisma/)
  assert.doesNotMatch(migrationScript, /seed:no-call-demo|seed\s*:/)
  assert.doesNotMatch(migrationScript, /DATABASE_URL.*console|console.*DATABASE_URL/)
})

test('production migration requires the environment and both explicit authorization gates', () => {
  assert.throws(
    () => assertProductionMigrationAuthorization({ NODE_ENV: 'production' }),
    /OKWOOK_ALLOW_PRODUCTION_MIGRATION/,
  )
  assert.throws(
    () => assertProductionMigrationAuthorization({
      NODE_ENV: 'production',
      OKWOOK_ALLOW_PRODUCTION_MIGRATION: '1',
    }),
    /OKWOOK_PRODUCTION_BACKUP_VERIFIED/,
  )
  assert.throws(
    () => assertProductionMigrationAuthorization({
      NODE_ENV: 'development',
      OKWOOK_ALLOW_PRODUCTION_MIGRATION: '1',
      OKWOOK_PRODUCTION_BACKUP_VERIFIED: '1',
    }),
    /NODE_ENV/,
  )
})

test('authentication code strategies hard-disable debug codes in production', () => {
  const phoneStrategy = readProjectFile('server/auth/strategies/phone-code.ts')
  const emailStrategy = readProjectFile('server/auth/strategies/email-code.ts')
  const authService = readProjectFile('server/auth/service.ts')

  assert.match(phoneStrategy, /getVerificationDeliveryReadiness/)
  assert.match(emailStrategy, /getVerificationDeliveryReadiness/)
  assert.match(authService, /NODE_ENV.*production/)
  assert.match(authService, /allowAutoFill:\s*false/)
})

test('production templates document migration authorization, delivery readiness, and closed no-call gates', () => {
  const productionTemplate = readProjectFile('.env.production.example')
  const dockerTemplate = readProjectFile('.env.docker.example')
  const checklist = readProjectFile('docs/release-readiness-checklist.md')

  for (const variableName of [
    'OKWOOK_ALLOW_PRODUCTION_MIGRATION',
    'OKWOOK_PRODUCTION_BACKUP_VERIFIED',
    'AUTH_VERIFICATION_DELIVERY_PROVIDER',
    'AUTH_VERIFICATION_DELIVERY_READY',
    'OKPICAI_ALLOW_LOCAL_DEMO_FIXTURES',
    'AI_PROVIDER_REAL_TEST_ALLOWED',
    'OBJECT_STORAGE_REAL_UPLOAD_ALLOWED',
  ]) {
    assert.match(productionTemplate, new RegExp(variableName))
  }

  assert.match(dockerTemplate, /AUTH_VERIFICATION_DELIVERY_PROVIDER/)
  assert.match(checklist, /Production Startup and Migration Controls/)
  assert.match(checklist, /does not run Prisma migration, database push, seed, or demo fixture commands automatically/i)
})
