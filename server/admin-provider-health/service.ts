import { prisma } from '../db/prisma'

type RiskStatus = 'PASS' | 'WARN' | 'BLOCKED' | 'UNKNOWN'

interface ProviderHealthRecord {
  id?: string
  code?: string | null
  name?: string | null
  baseUrl?: string | null
  apiKeyEncrypted?: string | null
  apiKeyHint?: string | null
  isEnabled?: boolean | null
  models?: Array<{
    id?: string
    category?: string
    name?: string | null
    modelKey?: string | null
    isEnabled?: boolean | null
  }>
}

interface LegacyProviderHealthRecord {
  id?: string
  name?: string | null
  baseUrl?: string | null
  apiKeyEncrypted?: string | null
  apiKeyHint?: string | null
  isEnabled?: boolean | null
  customModels?: Array<{
    id?: string
    category?: string
    label?: string | null
    modelKey?: string | null
    isEnabled?: boolean | null
  }>
}

interface StorageHealthRecord {
  id?: string
  code?: string | null
  name?: string | null
  endpoint?: string | null
  bucket?: string | null
  accessKeyEncrypted?: string | null
  secretKeyEncrypted?: string | null
  isEnabled?: boolean | null
  isDefault?: boolean | null
}

interface ProviderHealthInput {
  providers: ProviderHealthRecord[]
  legacyProviders: LegacyProviderHealthRecord[]
  storageConfigs: StorageHealthRecord[]
  env?: Record<string, string | undefined>
}

const SENSITIVE_PROVIDER_HEALTH_KEY_PATTERN = /(rawPayloadJson|api.?key|access.?key|secret|token|password|cookie|authorization|signature|private.?key|merchant.?id|mch.?id|app.?id|certificate|signed.?url|base64|webhook.?secret|credential|encrypted|OSS_ACCESS_KEY|OSS_SECRET)/i
const PLACEHOLDER_VALUE_PATTERN = /(example|placeholder|change-?me|your-|test-|dummy|mock|localhost|127\.0\.0\.1)/i

const nowIso = () => new Date().toISOString()

const isPresent = (value: unknown) => String(value || '').trim().length > 0

const isPlaceholder = (value: unknown) => {
  const normalized = String(value || '').trim()
  if (!normalized) return true
  return PLACEHOLDER_VALUE_PATTERN.test(normalized)
}

const countEnabled = <T extends { isEnabled?: boolean | null }>(items: T[]) => items.filter(item => item.isEnabled).length

const getModels = (providers: ProviderHealthRecord[]) => providers.flatMap(provider => provider.models || [])

const getLegacyModels = (providers: LegacyProviderHealthRecord[]) => providers.flatMap(provider => provider.customModels || [])

const buildRiskItem = (input: {
  key: string
  title: string
  status: RiskStatus
  summary: string
}) => input

export const sanitizeProviderHealthValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => sanitizeProviderHealthValue(item))
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const safeEntries = entries
      .filter(([key]) => !SENSITIVE_PROVIDER_HEALTH_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeProviderHealthValue(item)])
    return {
      ...Object.fromEntries(safeEntries),
      ...(safeEntries.length < entries.length ? { redactedFields: entries.length - safeEntries.length } : {}),
    }
  }
  return value
}

export const buildEmptyProviderHealthOverview = () => ({
  readonly: true,
  generatedAt: nowIso(),
  providerSummary: {
    total: 0,
    enabled: 0,
    withEnvKeyReference: 0,
    missingKey: 0,
    placeholderBaseUrl: 0,
    legacyTotal: 0,
    items: [] as Array<Record<string, unknown>>,
  },
  modelSummary: {
    total: 0,
    enabled: 0,
    visible: 0,
    approved: 0,
    priced: 0,
    legacyTotal: 0,
    items: [] as Array<Record<string, unknown>>,
  },
  generationGateSummary: {
    hasEnabledProvider: false,
    hasEnabledModel: false,
    hasPricingGate: false,
    willCreateGenerationTask: false,
    willChargePoints: false,
    summary: 'No generation task is created by this check.',
  },
  workerGateSummary: {
    noCallGatePresent: true,
    willCallProvider: false,
    summary: 'This preflight does not import or execute generation workers.',
  },
  storageSummary: {
    total: 0,
    enabled: 0,
    defaultConfigured: false,
    missingCredential: 0,
    placeholderEndpoint: 0,
    willUploadStorage: false,
    items: [] as Array<Record<string, unknown>>,
  },
  smokeGateSummary: {
    realProviderSmokeAllowed: false,
    gateName: 'AI_PROVIDER_REAL_SMOKE_ALLOWED',
    gatePresent: false,
    summary: 'Real provider smoke is disabled for this readonly preflight.',
  },
  riskItems: [] as Array<ReturnType<typeof buildRiskItem>>,
  willCallExternal: false,
  willCallProvider: false,
  willUploadStorage: false,
  willCreateGenerationTask: false,
  willChargePoints: false,
  realProviderSmokeAllowed: false,
})

export const buildProviderHealthOverviewFromRecords = (input: ProviderHealthInput) => {
  const providers = input.providers || []
  const legacyProviders = input.legacyProviders || []
  const storageConfigs = input.storageConfigs || []
  const env = input.env || {}
  const models = getModels(providers)
  const legacyModels = getLegacyModels(legacyProviders)
  const enabledProviders = countEnabled(providers)
  const enabledModels = countEnabled(models)
  const enabledStorage = countEnabled(storageConfigs)
  const missingKey = providers.filter(provider => provider.isEnabled && !isPresent(provider.apiKeyHint) && !isPresent(provider.apiKeyEncrypted)).length
  const placeholderBaseUrl = providers.filter(provider => isPlaceholder(provider.baseUrl)).length
  const missingStorageCredential = storageConfigs.filter(config => config.isEnabled && (!isPresent(config.accessKeyEncrypted) || !isPresent(config.secretKeyEncrypted))).length
  const placeholderEndpoint = storageConfigs.filter(config => isPlaceholder(config.endpoint) || isPlaceholder(config.bucket)).length
  const realProviderSmokeAllowed = String(env.AI_PROVIDER_REAL_SMOKE_ALLOWED || '').trim().toLowerCase() === 'true'
  const defaultStorageConfigured = storageConfigs.some(config => config.isDefault && config.isEnabled)

  const overview = buildEmptyProviderHealthOverview()
  overview.providerSummary = {
    total: providers.length,
    enabled: enabledProviders,
    withEnvKeyReference: providers.filter(provider => isPresent(provider.apiKeyHint)).length,
    missingKey,
    placeholderBaseUrl,
    legacyTotal: legacyProviders.length,
    items: providers.slice(0, 8).map(provider => sanitizeProviderHealthValue({
      id: provider.id,
      code: provider.code,
      name: provider.name,
      isEnabled: Boolean(provider.isEnabled),
      baseUrlStatus: isPlaceholder(provider.baseUrl) ? 'PLACEHOLDER_OR_EMPTY' : 'CONFIGURED',
      credentialStatus: isPresent(provider.apiKeyHint) || isPresent(provider.apiKeyEncrypted) ? 'REFERENCE_PRESENT' : 'MISSING',
      modelCount: provider.models?.length || 0,
    }) as Record<string, unknown>),
  }
  overview.modelSummary = {
    total: models.length,
    enabled: enabledModels,
    visible: enabledModels,
    approved: enabledModels,
    priced: 0,
    legacyTotal: legacyModels.length,
    items: models.slice(0, 8).map(model => sanitizeProviderHealthValue({
      id: model.id,
      name: model.name,
      category: model.category,
      modelKey: model.modelKey,
      isEnabled: Boolean(model.isEnabled),
      pricingStatus: 'UNKNOWN',
    }) as Record<string, unknown>),
  }
  overview.generationGateSummary = {
    hasEnabledProvider: enabledProviders > 0,
    hasEnabledModel: enabledModels > 0,
    hasPricingGate: false,
    willCreateGenerationTask: false,
    willChargePoints: false,
    summary: 'Readonly check only inspects configuration and never enters task lifecycle.',
  }
  overview.storageSummary = {
    total: storageConfigs.length,
    enabled: enabledStorage,
    defaultConfigured: defaultStorageConfigured,
    missingCredential: missingStorageCredential,
    placeholderEndpoint,
    willUploadStorage: false,
    items: storageConfigs.slice(0, 8).map(config => sanitizeProviderHealthValue({
      id: config.id,
      code: config.code,
      name: config.name,
      isEnabled: Boolean(config.isEnabled),
      isDefault: Boolean(config.isDefault),
      endpointStatus: isPlaceholder(config.endpoint) ? 'PLACEHOLDER_OR_EMPTY' : 'CONFIGURED',
      bucketStatus: isPlaceholder(config.bucket) ? 'PLACEHOLDER_OR_EMPTY' : 'CONFIGURED',
      credentialStatus: isPresent(config.accessKeyEncrypted) && isPresent(config.secretKeyEncrypted) ? 'REFERENCE_PRESENT' : 'MISSING',
    }) as Record<string, unknown>),
  }
  overview.smokeGateSummary = {
    realProviderSmokeAllowed: false,
    gateName: 'AI_PROVIDER_REAL_SMOKE_ALLOWED',
    gatePresent: isPresent(env.AI_PROVIDER_REAL_SMOKE_ALLOWED),
    summary: realProviderSmokeAllowed
      ? 'Env gate is present, but this endpoint still reports real smoke as disabled and performs no calls.'
      : 'Real provider smoke is disabled for this readonly preflight.',
  }

  overview.riskItems = [
    buildRiskItem({
      key: 'provider-config',
      title: 'Provider configuration',
      status: providers.length === 0 ? 'BLOCKED' : missingKey || placeholderBaseUrl ? 'WARN' : 'PASS',
      summary: providers.length === 0 ? 'No provider configuration found.' : `${enabledProviders} enabled provider(s), ${missingKey} missing key reference(s).`,
    }),
    buildRiskItem({
      key: 'model-config',
      title: 'Model configuration',
      status: models.length === 0 ? 'BLOCKED' : enabledModels === 0 ? 'WARN' : 'PASS',
      summary: `${models.length} model(s), ${enabledModels} enabled.`,
    }),
    buildRiskItem({
      key: 'storage-config',
      title: 'Storage configuration',
      status: storageConfigs.length === 0 ? 'WARN' : missingStorageCredential || placeholderEndpoint ? 'WARN' : 'PASS',
      summary: `${enabledStorage} enabled storage config(s). This endpoint will not upload files.`,
    }),
    buildRiskItem({
      key: 'no-call-gate',
      title: 'No-call gate',
      status: 'PASS',
      summary: 'Provider calls, task creation, point charging, storage uploads, and real smoke are disabled.',
    }),
  ]

  return sanitizeProviderHealthValue({
    ...overview,
    readonly: true,
    willCallExternal: false,
    willCallProvider: false,
    willUploadStorage: false,
    willCreateGenerationTask: false,
    willChargePoints: false,
    realProviderSmokeAllowed: false,
  }) as ReturnType<typeof buildEmptyProviderHealthOverview>
}

export const getAdminProviderHealthOverview = async () => {
  const [providers, legacyProviders, storageConfigs] = await Promise.all([
    prisma.aiProvider.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        models: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    }),
    prisma.aiProviderConfig.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        customModels: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    }),
    prisma.objectStorageConfig.findMany({
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  return buildProviderHealthOverviewFromRecords({
    providers,
    legacyProviders,
    storageConfigs,
    env: {
      AI_PROVIDER_REAL_SMOKE_ALLOWED: process.env.AI_PROVIDER_REAL_SMOKE_ALLOWED,
      VITE_PROVIDER_DEFAULT_BASE_URL: process.env.VITE_PROVIDER_DEFAULT_BASE_URL,
    },
  })
}

export const __adminProviderHealthTestHooks = {
  buildEmptyProviderHealthOverview,
  buildProviderHealthOverviewFromRecords,
  sanitizeProviderHealthValue,
}
