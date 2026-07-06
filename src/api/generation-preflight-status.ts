import { buildApiUrl } from './http'
import { readApiData } from './response'

export interface GenerationPreflightStatus {
  readonly: boolean
  generatedAt: string
  databaseConfigured: boolean
  generationAvailable: boolean
  noCallMode: boolean
  status: 'AVAILABLE' | 'NO_CALL_BLOCKED'
  userTitle: string
  userMessage: string
  actionHint: string
  blockedReasons: string[]
  providerSummary: {
    hasEnabledProvider: boolean
    enabledProviderCount: number
  }
  modelSummary: {
    hasEnabledModel: boolean
    enabledModelCount: number
    enabledImageModelCount: number
    enabledChatModelCount: number
    pricedModelCount: number
  }
  gateSummary: {
    providerGateName: string
    storageGateName: string
    realProviderGenerationAllowed: boolean
    realStorageUploadAllowed: boolean
  }
  willCallExternal: boolean
  willCallProvider: boolean
  willUploadStorage: boolean
  willCreateGenerationTask: boolean
  willChargePoints: boolean
  realProviderGenerationAllowed: boolean
  realStorageUploadAllowed: boolean
}

export const getGenerationPreflightStatus = async () => {
  const response = await fetch(buildApiUrl('/api/generation/preflight-status'), {
    method: 'GET',
    credentials: 'include',
  })

  return readApiData<GenerationPreflightStatus>(response, {
    showErrorMessage: false,
  })
}
