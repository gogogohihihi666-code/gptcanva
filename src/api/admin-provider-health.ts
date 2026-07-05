import { adminGet } from './admin-request'

export type ProviderHealthRiskStatus = 'PASS' | 'WARN' | 'BLOCKED' | 'UNKNOWN'

export interface ProviderHealthRiskItem {
  key: string
  title: string
  status: ProviderHealthRiskStatus
  summary: string
}

export interface AdminProviderHealthOverview {
  readonly: boolean
  generatedAt: string
  providerSummary: {
    total: number
    enabled: number
    withEnvKeyReference: number
    missingKey: number
    placeholderBaseUrl: number
    legacyTotal: number
    items: Array<Record<string, unknown>>
  }
  modelSummary: {
    total: number
    enabled: number
    visible: number
    approved: number
    priced: number
    legacyTotal: number
    items: Array<Record<string, unknown>>
  }
  generationGateSummary: {
    hasEnabledProvider: boolean
    hasEnabledModel: boolean
    hasPricingGate: boolean
    willCreateGenerationTask: boolean
    willChargePoints: boolean
    summary: string
  }
  workerGateSummary: {
    noCallGatePresent: boolean
    willCallProvider: boolean
    summary: string
  }
  storageSummary: {
    total: number
    enabled: number
    defaultConfigured: boolean
    missingCredential: number
    placeholderEndpoint: number
    willUploadStorage: boolean
    items: Array<Record<string, unknown>>
  }
  smokeGateSummary: {
    realProviderSmokeAllowed: boolean
    gateName: string
    gatePresent: boolean
    summary: string
  }
  riskItems: ProviderHealthRiskItem[]
  willCallExternal: boolean
  willCallProvider: boolean
  willUploadStorage: boolean
  willCreateGenerationTask: boolean
  willChargePoints: boolean
  realProviderSmokeAllowed: boolean
}

export const getAdminProviderHealthOverview = async () => {
  return adminGet<AdminProviderHealthOverview>('/api/admin/provider-health')
}
