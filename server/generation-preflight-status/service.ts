import { prisma } from '../db/prisma'
import { getAdminDangerousActionGateStatus } from '../no-call/admin-dangerous-action-gate'

type GenerationPreflightProviderRecord = {
  id?: string
  isEnabled?: boolean | null
  apiKeyEncrypted?: string | null
  apiKeyHint?: string | null
  models?: Array<{
    id?: string
    category?: string | null
    isEnabled?: boolean | null
    defaultParamsJson?: unknown
  }>
}

type GenerationPreflightStorageRecord = {
  id?: string
  isEnabled?: boolean | null
  isDefault?: boolean | null
  endpoint?: string | null
  bucket?: string | null
  accessKeyEncrypted?: string | null
  secretKeyEncrypted?: string | null
}

interface GenerationPreflightStatusInput {
  providers: GenerationPreflightProviderRecord[]
  storageConfigs?: GenerationPreflightStorageRecord[]
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
  databaseConfigured?: boolean
}

const nowIso = () => new Date().toISOString()

const readModelPointCost = (defaultParamsJson: unknown) => {
  if (!defaultParamsJson || typeof defaultParamsJson !== 'object' || Array.isArray(defaultParamsJson)) {
    return 0
  }

  const billingRule = (defaultParamsJson as Record<string, unknown>).billingRule
  if (!billingRule || typeof billingRule !== 'object' || Array.isArray(billingRule)) {
    return 0
  }

  return Math.max(0, Number((billingRule as Record<string, unknown>).power || 0))
}

const isEnabled = (item: { isEnabled?: boolean | null }) => item.isEnabled === true

const readModels = (providers: GenerationPreflightProviderRecord[]) => {
  return providers.flatMap(provider => provider.models || [])
}

const buildStatusItem = (input: {
  key: string
  label: string
  status: 'PASS' | 'WARN' | 'BLOCKED' | 'UNKNOWN'
  text: string
}) => input

export const buildGenerationPreflightStatusFromRecords = (input: GenerationPreflightStatusInput) => {
  const providers = input.providers || []
  const storageConfigs = input.storageConfigs || []
  const models = readModels(providers)
  const enabledProviders = providers.filter(isEnabled)
  const enabledModels = models.filter(isEnabled)
  const enabledImageModels = enabledModels.filter(model => String(model.category || '').toUpperCase() === 'IMAGE')
  const enabledChatModels = enabledModels.filter(model => String(model.category || '').toUpperCase() === 'CHAT')
  const pricedModels = enabledModels.filter(model => readModelPointCost(model.defaultParamsJson) > 0)
  const enabledStorageConfigs = storageConfigs.filter(isEnabled)
  const providerGate = getAdminDangerousActionGateStatus('generation-provider-execution', input.env as NodeJS.ProcessEnv)
  const storageGate = getAdminDangerousActionGateStatus('generation-storage-upload', input.env as NodeJS.ProcessEnv)
  const hasEnabledProvider = enabledProviders.length > 0
  const hasEnabledModel = enabledModels.length > 0
  const hasEnabledStorage = enabledStorageConfigs.length > 0
  const hasProviderGate = providerGate.allowed === true
  const generationAvailable = Boolean(input.databaseConfigured !== false && hasEnabledProvider && hasEnabledModel && hasProviderGate)
  const blockedReasons = [
    input.databaseConfigured === false ? 'DATABASE_UNAVAILABLE' : '',
    hasProviderGate ? '' : 'NO_CALL_PROVIDER_GATE',
    storageGate.allowed === true ? '' : 'NO_CALL_STORAGE_GATE',
    hasEnabledProvider ? '' : 'NO_ENABLED_PROVIDER',
    hasEnabledModel ? '' : 'NO_ENABLED_MODEL',
    hasEnabledStorage ? '' : 'NO_ENABLED_STORAGE',
  ].filter(Boolean)
  const statusItems = [
    buildStatusItem({
      key: 'provider',
      label: 'Provider 状态',
      status: hasEnabledProvider ? 'WARN' : 'BLOCKED',
      text: hasEnabledProvider ? '已有启用 Provider，但真实外呼 gate 仍关闭。' : 'Provider 未就绪或未启用。',
    }),
    buildStatusItem({
      key: 'model',
      label: '模型状态',
      status: hasEnabledModel ? 'WARN' : 'BLOCKED',
      text: hasEnabledModel ? '已有启用模型，但当前 no-call 阶段不创建任务。' : '模型未就绪或未启用。',
    }),
    buildStatusItem({
      key: 'storage',
      label: '存储状态',
      status: hasEnabledStorage ? 'WARN' : 'BLOCKED',
      text: hasEnabledStorage ? '已有启用存储配置，但当前不会上传 OSS/S3。' : '存储未就绪或未启用，当前不会上传 OSS/S3。',
    }),
    buildStatusItem({
      key: 'external-call',
      label: '真实外呼',
      status: 'BLOCKED',
      text: 'no-call gate 已关闭真实 AI Provider 调用。',
    }),
    buildStatusItem({
      key: 'points',
      label: '积分扣除',
      status: 'BLOCKED',
      text: '提交已在任务创建前阻断，不会扣积分。',
    }),
  ]

  return {
    readonly: true,
    generatedAt: nowIso(),
    databaseConfigured: input.databaseConfigured !== false,
    generationAvailable,
    noCallMode: !generationAvailable,
    status: generationAvailable ? 'AVAILABLE' : 'NO_CALL_BLOCKED',
    userTitle: generationAvailable ? '生成服务可用' : '生成暂不可用',
    userMessage: generationAvailable
      ? '当前生成服务已满足基础配置。'
      : '当前处于 no-call 预检阶段，暂不会调用真实 AI Provider，不会创建真实生成任务，不会扣积分，不会上传 OSS/S3。',
    actionHint: generationAvailable
      ? '可以提交生成任务。'
      : '请等待管理员完成 Provider、模型和存储配置检查，并明确授权真实生成 gate 后再使用。',
    blockedReasons,
    providerSummary: {
      hasEnabledProvider,
      enabledProviderCount: enabledProviders.length,
    },
    modelSummary: {
      hasEnabledModel,
      enabledModelCount: enabledModels.length,
      enabledImageModelCount: enabledImageModels.length,
      enabledChatModelCount: enabledChatModels.length,
      pricedModelCount: pricedModels.length,
    },
    storageSummary: {
      hasEnabledStorage,
      enabledStorageCount: enabledStorageConfigs.length,
    },
    statusItems,
    gateSummary: {
      providerGateName: providerGate.gateName,
      storageGateName: storageGate.gateName,
      realProviderGenerationAllowed: false,
      realStorageUploadAllowed: false,
    },
    willCallExternal: false,
    willCallProvider: false,
    willUploadStorage: false,
    willCreateGenerationTask: false,
    willChargePoints: false,
    realProviderGenerationAllowed: false,
    realStorageUploadAllowed: false,
  }
}

export const getGenerationPreflightStatus = async (input?: { databaseConfigured?: boolean }) => {
  if (input?.databaseConfigured === false) {
    return buildGenerationPreflightStatusFromRecords({
      providers: [],
      storageConfigs: [],
      databaseConfigured: false,
      env: process.env,
    })
  }

  const [providers, storageConfigs] = await Promise.all([
    prisma.aiProvider.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        isEnabled: true,
        models: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            category: true,
            isEnabled: true,
            defaultParamsJson: true,
          },
        },
      },
    }),
    prisma.objectStorageConfig.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        isEnabled: true,
        isDefault: true,
      },
    }),
  ])

  return buildGenerationPreflightStatusFromRecords({
    providers,
    storageConfigs,
    databaseConfigured: true,
    env: process.env,
  })
}

export type GenerationPreflightStatus = ReturnType<typeof buildGenerationPreflightStatusFromRecords>

export const __generationPreflightStatusTestHooks = {
  buildGenerationPreflightStatusFromRecords,
}
