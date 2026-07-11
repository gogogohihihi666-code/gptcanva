import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PrismaReadonlyInventoryRepository,
  QueryAuditCounter,
  verifyReadonlyDatabasePermissions,
  type InventoryPrismaClient,
} from '../../scripts/security/legacy-config-ciphertext/prisma-readonly-repository'

const databaseId = 'okwook_inventory_disposable_test12345678'

const createFakeClient = (grants: string[]): InventoryPrismaClient => ({
  $queryRawUnsafe: async <T = unknown>(query: string): Promise<T> => (query === 'SELECT DATABASE() AS databaseName'
    ? [{ databaseName: databaseId }]
    : grants.map(grant => ({ grant }))) as T,
  aiProviderConfig: {
    findMany: async (args: unknown) => {
      assert.deepEqual(args, { select: { id: true, apiKeyEncrypted: true, updatedAt: true } })
      return [{ id: 'legacy-1', apiKeyEncrypted: null, updatedAt: new Date(0) }]
    },
  },
  aiProvider: {
    findMany: async (args: unknown) => {
      assert.deepEqual(args, { select: { id: true, apiKeyEncrypted: true, updatedAt: true } })
      return [{ id: 'current-1', apiKeyEncrypted: null, updatedAt: new Date(0) }]
    },
  },
  objectStorageConfig: {
    findMany: async (args: unknown) => {
      assert.deepEqual(args, { select: { id: true, accessKeyEncrypted: true, secretKeyEncrypted: true, updatedAt: true } })
      return [{ id: 'storage-1', accessKeyEncrypted: '', secretKeyEncrypted: '', updatedAt: new Date(0) }]
    },
  },
})

test('permission verifier accepts only scoped USAGE and SELECT grants', async () => {
  const client = createFakeClient([
    "GRANT USAGE ON *.* TO `inventory_reader`@`localhost`",
    `GRANT SELECT ON \`${databaseId}\`.* TO \`inventory_reader\`@\`localhost\``,
  ])

  await assert.doesNotReject(() => verifyReadonlyDatabasePermissions(client, databaseId))
})

test('permission verifier rejects broad, write, and unparseable grants without returning grant text', async () => {
  for (const grant of [
    "GRANT SELECT ON *.* TO `reader`@`localhost`",
    `GRANT SELECT, INSERT ON \`${databaseId}\`.* TO \`reader\`@\`localhost\``,
    'unexpected privilege format',
  ]) {
    const client = createFakeClient([grant])
    await assert.rejects(
      () => verifyReadonlyDatabasePermissions(client, databaseId),
      error => error instanceof Error
        && error.message === 'READONLY_PRIVILEGE_NOT_VERIFIED'
        && !error.message.includes(grant),
    )
  }
})

test('Prisma repository queries only approved models and fields', async () => {
  const repository = new PrismaReadonlyInventoryRepository(createFakeClient([]))

  assert.equal((await repository.listLegacyProviderConfigs()).length, 1)
  assert.equal((await repository.listCurrentProviders()).length, 1)
  assert.equal((await repository.listStorageConfigs()).length, 1)
  assert.deepEqual(Object.getOwnPropertyNames(PrismaReadonlyInventoryRepository.prototype).sort(), [
    'constructor',
    'listCurrentProviders',
    'listLegacyProviderConfigs',
    'listStorageConfigs',
  ].sort())
})

test('query audit reports reads and rejects writes or unknown statements', () => {
  const audit = new QueryAuditCounter()
  audit.record('SELECT `id` FROM `ai_providers`')
  audit.record('SHOW GRANTS FOR CURRENT_USER()')
  audit.record('UPDATE `ai_providers` SET `api_key_encrypted` = ?')
  audit.record('SET SESSION TRANSACTION READ ONLY')

  assert.deepEqual(audit.report(), {
    totalQueryCount: 4,
    allowedReadQueryCount: 2,
    writeQueryCount: 1,
    unknownQueryCount: 1,
  })
  assert.throws(() => audit.assertReadOnly(), /READONLY_QUERY_AUDIT_FAILED/)
})
