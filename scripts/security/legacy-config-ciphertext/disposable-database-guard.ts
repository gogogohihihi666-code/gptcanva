import { relative, resolve, sep } from 'node:path'
import { assertInventoryAuthorized } from './authorization'
import type { InventoryKeySets } from './inventory'

export type DisposableInventoryRuntimeEnv = Record<string, string | undefined>

const DATABASE_ID_PATTERN = /^okwook_inventory_disposable_[a-z0-9_]{8,64}$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const DISPOSABLE_GATE = 'OKWOOK_ALLOW_DISPOSABLE_INVENTORY_DB'
const INTEGRATION_GATE = 'OKWOOK_RUN_DISPOSABLE_INVENTORY_DB_TEST'

const secretNames = {
  provider: {
    current: 'OKWOOK_DISPOSABLE_PROVIDER_CURRENT_SECRET',
    previous: 'OKWOOK_DISPOSABLE_PROVIDER_PREVIOUS_SECRET',
    legacy: 'OKWOOK_DISPOSABLE_PROVIDER_LEGACY_SECRET',
  },
  storage: {
    current: 'OKWOOK_DISPOSABLE_STORAGE_CURRENT_SECRET',
    previous: 'OKWOOK_DISPOSABLE_STORAGE_PREVIOUS_SECRET',
    legacy: 'OKWOOK_DISPOSABLE_STORAGE_LEGACY_SECRET',
  },
} as const

const readRequired = (env: DisposableInventoryRuntimeEnv, name: string) => {
  const value = String(env[name] || '').trim()
  if (!value) throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  return value
}

const resolveKeys = (env: DisposableInventoryRuntimeEnv): InventoryKeySets => {
  const keys = {
    provider: {
      current: readRequired(env, secretNames.provider.current),
      previous: readRequired(env, secretNames.provider.previous),
      legacy: readRequired(env, secretNames.provider.legacy),
    },
    storage: {
      current: readRequired(env, secretNames.storage.current),
      previous: readRequired(env, secretNames.storage.previous),
      legacy: readRequired(env, secretNames.storage.legacy),
    },
  }
  const materials = [
    keys.provider.current,
    keys.provider.previous,
    keys.provider.legacy,
    keys.storage.current,
    keys.storage.previous,
    keys.storage.legacy,
  ]
  if (materials.some(value => Buffer.byteLength(value, 'utf8') < 32) || new Set(materials).size !== materials.length) {
    throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  }
  return keys
}

const validateOutputDirectory = (workspaceRoot: string, outputDirectory: string) => {
  const allowedRoot = resolve(workspaceRoot, '.codex-temp', 'legacy-config-inventory')
  const target = resolve(outputDirectory)
  const pathFromAllowedRoot = relative(allowedRoot, target)
  if (pathFromAllowedRoot === '..' || pathFromAllowedRoot.startsWith(`..${sep}`)) {
    throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  }
}

export const prepareDisposableInventoryRun = <T>(
  mode: string,
  env: DisposableInventoryRuntimeEnv,
  workspaceRoot: string,
  outputDirectory: string,
  prismaFactory: (databaseUrl: string) => T,
) => {
  if (mode !== 'inventory') throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  try {
    assertInventoryAuthorized(env)
  } catch {
    throw new Error('NOT_AUTHORIZED')
  }
  if (env[DISPOSABLE_GATE] !== '1' || env[INTEGRATION_GATE] !== '1') {
    throw new Error('NOT_AUTHORIZED')
  }

  const databaseId = readRequired(env, 'OKWOOK_DISPOSABLE_INVENTORY_DATABASE_ID')
  if (!DATABASE_ID_PATTERN.test(databaseId)) throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')

  const rawUrl = readRequired(env, 'OKWOOK_DISPOSABLE_INVENTORY_DATABASE_URL')
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  }
  const selectedDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  const username = decodeURIComponent(parsed.username).toLowerCase()
  if (
    !['mysql:', 'mariadb:'].includes(parsed.protocol)
    || !LOOPBACK_HOSTS.has(parsed.hostname)
    || selectedDatabase !== databaseId
    || !parsed.username
    || !parsed.password
    || ['root', 'admin', 'administrator'].includes(username)
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('DISPOSABLE_DATABASE_GUARD_REJECTED')
  }

  validateOutputDirectory(workspaceRoot, outputDirectory)
  const keys = resolveKeys(env)
  const client = prismaFactory(rawUrl)
  return { client, databaseId, keys }
}
