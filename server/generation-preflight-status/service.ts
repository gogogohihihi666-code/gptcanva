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

interface GenerationPreflightStatusInput {
  providers: GenerationPreflightProviderRecord[]
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

export const buildGenerationPreflightStatusFromRecords = (input: GenerationPreflightStatusInput) => {
  const providers = input.providers || []
  const models = readModels(providers)
  const enabledProviders = providers.filter(isEnabled)
  const enabledModels = models.filter(isEnabled)
  const enabledImageModels = enabledModels.filter(model => String(model.category || '').toUpperCase() === 'IMAGE')
  const enabledChatModels = enabledModels.filter(model => String(model.category || '').toUpperCase() === 'CHAT')
  const pricedModels = enabledModels.filter(model => readModelPointCost(model.defaultParamsJson) > 0)
  const providerGate = getAdminDangerousActionGateStatus('generation-provider-execution', input.env as NodeJS.ProcessEnv)
  const storageGate = getAdminDangerousActionGateStatus('generation-storage-upload', input.env as NodeJS.ProcessEnv)
  const hasEnabledProvider = enabledProviders.length > 0
  const hasEnabledModel = enabledModels.length > 0
  const hasProviderGate = providerGate.allowed === true
  const generationAvailable = Boolean(input.databaseConfigured !== false && hasEnabledProvider && hasEnabledModel && hasProviderGate)
  const blockedReasons = [
    input.databaseConfigured === false ? 'DATABASE_UNAVAILABLE' : '',
    hasProviderGate ? '' : 'NO_CALL_PROVIDER_GATE',
    hasEnabledProvider ? '' : 'NO_ENABLED_PROVIDER',
    hasEnabledModel ? '' : 'NO_ENABLED_MODEL',
  ].filter(Boolean)

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
      : '当前处于 no-call 预检阶段，真实 AI Provider 调用未开放；页面不会创建生成任务、不会扣积分、不会上传存储。',
    actionHint: generationAvailable
      ? '可以提交生成任务。'
      : '请等待管理员完成 Provider 健康检查并明确授权真实生成 gate 后再使用。',
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
      databaseConfigured: false,
      env: process.env,
    })
  }

  const providers = await prisma.aiProvider.findMany({
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
  })

  return buildGenerationPreflightStatusFromRecords({
    providers,
    databaseConfigured: true,
    env: process.env,
  })
}

export type GenerationPreflightStatus = ReturnType<typeof buildGenerationPreflightStatusFromRecords>

export const __generationPreflightStatusTestHooks = {
  buildGenerationPreflightStatusFromRecords,
}
