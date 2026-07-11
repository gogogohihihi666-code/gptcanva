import { classifyCiphertext, type InventoryKeySet } from './classifier'
import type { LegacyConfigInventoryRepository } from './repositories'
import type {
  ClassificationCounts,
  FieldClassification,
  LegacyConfigInventoryResult,
  StorageRowSummary,
  StorageRowSummaryCounts,
} from './types'

export interface InventoryKeySets {
  provider: InventoryKeySet
  storage: InventoryKeySet
}

const assertDistinctKeySets = (keys: InventoryKeySets) => {
  const materials = [
    keys.provider.current,
    keys.provider.previous,
    keys.provider.legacy,
    keys.storage.current,
    keys.storage.previous,
    keys.storage.legacy,
  ].filter((value): value is string => Boolean(value))
  if (new Set(materials).size !== materials.length) {
    throw new Error('Provider and storage inventory key material must remain independent.')
  }
}

const count = <T extends string>(counts: Partial<Record<T, number>>, value: T) => {
  counts[value] = (counts[value] ?? 0) + 1
}

const summarizeStorageRow = (
  access: FieldClassification,
  secret: FieldClassification,
): StorageRowSummary => {
  const pair = [access, secret]
  if (pair.every(value => value === 'EMPTY')) return 'EMPTY'
  if (pair.includes('INVALID_FORMAT')) return 'HAS_INVALID_FIELD'
  if (pair.includes('UNDECRYPTABLE') || pair.includes('MULTIPLE_KEY_MATCH')) return 'HAS_UNDECRYPTABLE_FIELD'
  if (pair.every(value => value === 'CURRENT_DECRYPTABLE')) return 'BOTH_CURRENT'
  if (pair.every(value => value === 'LEGACY_FALLBACK_DECRYPTABLE')) return 'BOTH_LEGACY'
  if (pair.includes('LEGACY_FALLBACK_DECRYPTABLE')) return 'PARTIAL_LEGACY'
  if (pair.every(value => value === 'PREVIOUS_DECRYPTABLE')) return 'PREVIOUS_ONLY'
  return 'MIXED_KEYS'
}

const summarizeProviderRows = (records: Array<{ apiKeyEncrypted: string | null }>, keys: InventoryKeySet) => {
  const classifications: ClassificationCounts = {}
  for (const record of records) count(classifications, classifyCiphertext(record.apiKeyEncrypted, keys))
  return { totalRecords: records.length, classifications }
}

export const runLegacyConfigInventory = async (
  repository: LegacyConfigInventoryRepository,
  keys: InventoryKeySets,
): Promise<LegacyConfigInventoryResult> => {
  assertDistinctKeySets(keys)
  const [legacyProviderConfigs, currentProviders, storageConfigs] = await Promise.all([
    repository.listLegacyProviderConfigs(),
    repository.listCurrentProviders(),
    repository.listStorageConfigs(),
  ])
  const accessKeyClassifications: ClassificationCounts = {}
  const secretKeyClassifications: ClassificationCounts = {}
  const rowSummaries: StorageRowSummaryCounts = {}

  for (const record of storageConfigs) {
    const access = classifyCiphertext(record.accessKeyEncrypted, keys.storage)
    const secret = classifyCiphertext(record.secretKeyEncrypted, keys.storage)
    count(accessKeyClassifications, access)
    count(secretKeyClassifications, secret)
    count(rowSummaries, summarizeStorageRow(access, secret))
  }

  return {
    providerLegacy: summarizeProviderRows(legacyProviderConfigs, keys.provider),
    providerCurrent: summarizeProviderRows(currentProviders, keys.provider),
    storage: {
      totalRecords: storageConfigs.length,
      accessKeyClassifications,
      secretKeyClassifications,
      rowSummaries,
    },
  }
}
