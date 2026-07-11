export interface ProviderConfigInventoryRecord {
  apiKeyEncrypted: string | null
}

export interface StorageConfigInventoryRecord {
  accessKeyEncrypted: string | null
  secretKeyEncrypted: string | null
}

export interface LegacyConfigInventoryRepository {
  listLegacyProviderConfigs(): Promise<ProviderConfigInventoryRecord[]>
  listCurrentProviders(): Promise<ProviderConfigInventoryRecord[]>
  listStorageConfigs(): Promise<StorageConfigInventoryRecord[]>
}

export class InMemoryLegacyConfigInventoryRepository implements LegacyConfigInventoryRepository {
  private readonly legacyProviderConfigs: ProviderConfigInventoryRecord[]
  private readonly currentProviders: ProviderConfigInventoryRecord[]
  private readonly storageConfigs: StorageConfigInventoryRecord[]

  constructor(records: Partial<{
    legacyProviderConfigs: ProviderConfigInventoryRecord[]
    currentProviders: ProviderConfigInventoryRecord[]
    storageConfigs: StorageConfigInventoryRecord[]
  }> = {}) {
    this.legacyProviderConfigs = records.legacyProviderConfigs ?? []
    this.currentProviders = records.currentProviders ?? []
    this.storageConfigs = records.storageConfigs ?? []
  }

  async listLegacyProviderConfigs() { return [...this.legacyProviderConfigs] }
  async listCurrentProviders() { return [...this.currentProviders] }
  async listStorageConfigs() { return [...this.storageConfigs] }
}
