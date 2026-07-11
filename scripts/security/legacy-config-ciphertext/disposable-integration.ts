import { prepareDisposableInventoryRun, type DisposableInventoryRuntimeEnv } from './disposable-database-guard'
import { runLegacyConfigInventory } from './inventory'
import {
  createDisposableInventoryPrismaClient,
  PrismaReadonlyInventoryRepository,
  QueryAuditCounter,
  verifyReadonlyDatabasePermissions,
} from './prisma-readonly-repository'
import { buildInventoryReport } from './report'

const snapshotRepository = async (repository: PrismaReadonlyInventoryRepository) => ({
  legacyProviders: await repository.listLegacyProviderConfigs(),
  currentProviders: await repository.listCurrentProviders(),
  storage: await repository.listStorageConfigs(),
})

export const runDisposablePrismaInventory = async (options: {
  mode: string
  env: DisposableInventoryRuntimeEnv
  workspaceRoot: string
  outputDirectory: string
  sourceCommit: string
}) => {
  const audit = new QueryAuditCounter()
  const prepared = prepareDisposableInventoryRun(
    options.mode,
    options.env,
    options.workspaceRoot,
    options.outputDirectory,
    databaseUrl => createDisposableInventoryPrismaClient(databaseUrl, audit),
  )
  const client = prepared.client

  try {
    await verifyReadonlyDatabasePermissions(client, prepared.databaseId)
    const repository = new PrismaReadonlyInventoryRepository(client)
    const before = await snapshotRepository(repository)
    const inventory = await runLegacyConfigInventory(repository, prepared.keys)
    const after = await snapshotRepository(repository)
    audit.assertReadOnly()

    return {
      databaseId: prepared.databaseId,
      report: buildInventoryReport(inventory, {
        sourceCommit: options.sourceCommit,
        environmentClass: 'disposable-loopback-test',
      }),
      queryAudit: audit.report(),
      beforeAfterUnchanged: JSON.stringify(before) === JSON.stringify(after),
    }
  } finally {
    await client.$disconnect?.()
  }
}
