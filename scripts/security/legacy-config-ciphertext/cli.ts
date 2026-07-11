import { assertInventoryAuthorized } from './authorization'
import { runLegacyConfigInventory, type InventoryKeySets } from './inventory'
import type { LegacyConfigInventoryRepository } from './repositories'
import { buildInventoryReport } from './report'
import type { LegacyConfigInventoryReport } from './types'

type RuntimeEnv = Record<string, string | undefined>

export interface InventoryCliOptions {
  env?: RuntimeEnv
  repository?: LegacyConfigInventoryRepository
  keys?: InventoryKeySets
  sourceCommit?: string
  environmentClass?: string
}

export const runInventoryCli = async (
  argumentsList: string[],
  options: InventoryCliOptions = {},
): Promise<LegacyConfigInventoryReport> => {
  if (argumentsList.length !== 1 || argumentsList[0] !== 'inventory') {
    throw new Error('Legacy configuration tool only supports inventory mode.')
  }
  assertInventoryAuthorized(options.env)
  if (!options.repository || !options.keys) {
    throw new Error('Inventory repository and isolated key material must be configured by an authorized runner.')
  }
  const result = await runLegacyConfigInventory(options.repository, options.keys)
  return buildInventoryReport(result, {
    sourceCommit: options.sourceCommit ?? 'unknown',
    environmentClass: options.environmentClass ?? 'isolated',
  })
}
