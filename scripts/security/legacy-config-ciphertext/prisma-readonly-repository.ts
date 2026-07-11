import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import prismaClientPackage from '@prisma/client'
import type {
  LegacyConfigInventoryRepository,
  ProviderConfigInventoryRecord,
  StorageConfigInventoryRecord,
} from './repositories'

interface ReadDelegate<T> {
  findMany(args: unknown): Promise<T[]>
}

export interface InventoryPrismaClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>
  $disconnect?(): Promise<void>
  aiProviderConfig: ReadDelegate<ProviderConfigInventoryRecord>
  aiProvider: ReadDelegate<ProviderConfigInventoryRecord>
  objectStorageConfig: ReadDelegate<StorageConfigInventoryRecord>
}

export interface QueryAuditReport {
  totalQueryCount: number
  allowedReadQueryCount: number
  writeQueryCount: number
  unknownQueryCount: number
}

const WRITE_PREFIXES = [
  'INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'REPLACE', 'CREATE', 'ALTER', 'DROP',
  'TRUNCATE', 'GRANT', 'REVOKE', 'LOCK', 'CALL', 'LOAD', 'RENAME',
]

export class QueryAuditCounter {
  private totalQueryCount = 0
  private allowedReadQueryCount = 0
  private writeQueryCount = 0
  private unknownQueryCount = 0

  record(query: string) {
    this.totalQueryCount += 1
    const statement = query.trim().replace(/^\/\*[\s\S]*?\*\//, '').trim().toUpperCase()
    if (statement.startsWith('SELECT ') || statement.startsWith('SHOW ')) {
      this.allowedReadQueryCount += 1
    } else if (WRITE_PREFIXES.some(prefix => statement.startsWith(`${prefix} `))) {
      this.writeQueryCount += 1
    } else {
      this.unknownQueryCount += 1
    }
  }

  report(): QueryAuditReport {
    return {
      totalQueryCount: this.totalQueryCount,
      allowedReadQueryCount: this.allowedReadQueryCount,
      writeQueryCount: this.writeQueryCount,
      unknownQueryCount: this.unknownQueryCount,
    }
  }

  assertReadOnly() {
    if (this.writeQueryCount !== 0 || this.unknownQueryCount !== 0) {
      throw new Error('READONLY_QUERY_AUDIT_FAILED')
    }
  }
}

const normalizeGrantTarget = (target: string) => target.replaceAll('`', '').toLowerCase()

const isAllowedGrant = (grant: string, databaseId: string) => {
  const normalized = grant.trim()
  const match = normalized.match(/^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+/i)
  if (!match || /WITH\s+GRANT\s+OPTION/i.test(normalized)) return false
  const privileges = match[1].split(',').map(value => value.trim().toUpperCase())
  const target = normalizeGrantTarget(match[2])
  if (privileges.length === 1 && privileges[0] === 'USAGE' && target === '*.*') return true
  if (privileges.some(privilege => privilege !== 'SELECT')) return false
  if (target === '*.*') return false

  const allowedTargets = new Set([
    `${databaseId}.*`,
    `${databaseId}.ai_provider_configs`,
    `${databaseId}.ai_providers`,
    `${databaseId}.object_storage_configs`,
  ].map(value => value.toLowerCase()))
  return allowedTargets.has(target)
}

export const verifyReadonlyDatabasePermissions = async (
  client: InventoryPrismaClient,
  databaseId: string,
) => {
  const databaseRows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>('SELECT DATABASE() AS databaseName')
  if (databaseRows.length !== 1 || databaseRows[0].databaseName !== databaseId) {
    throw new Error('READONLY_PRIVILEGE_NOT_VERIFIED')
  }
  const grantRows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>('SHOW GRANTS FOR CURRENT_USER()')
  const grants = grantRows.flatMap(row => Object.values(row).filter((value): value is string => typeof value === 'string'))
  if (grants.length === 0 || grants.some(grant => !isAllowedGrant(grant, databaseId))) {
    throw new Error('READONLY_PRIVILEGE_NOT_VERIFIED')
  }
}

export class PrismaReadonlyInventoryRepository implements LegacyConfigInventoryRepository {
  constructor(private readonly client: InventoryPrismaClient) {}

  listLegacyProviderConfigs() {
    return this.client.aiProviderConfig.findMany({
      select: { id: true, apiKeyEncrypted: true, updatedAt: true },
    })
  }

  listCurrentProviders() {
    return this.client.aiProvider.findMany({
      select: { id: true, apiKeyEncrypted: true, updatedAt: true },
    })
  }

  listStorageConfigs() {
    return this.client.objectStorageConfig.findMany({
      select: { id: true, accessKeyEncrypted: true, secretKeyEncrypted: true, updatedAt: true },
    })
  }
}

export const createDisposableInventoryPrismaClient = (
  databaseUrl: string,
  audit: QueryAuditCounter,
): InventoryPrismaClient => {
  const { PrismaClient } = prismaClientPackage
  const client = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
    log: [{ emit: 'event', level: 'query' }],
  })
  client.$on('query', event => audit.record(event.query))
  return client as unknown as InventoryPrismaClient
}
