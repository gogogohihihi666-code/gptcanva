export type AdminDangerousAction =
  | 'provider-connectivity-test'
  | 'provider-model-discovery'
  | 'storage-connectivity-test'

interface AdminDangerousActionConfig {
  gateName: string
  description: string
  willCallProvider: boolean
  willUploadStorage: boolean
}

const ACTION_CONFIGS: Record<AdminDangerousAction, AdminDangerousActionConfig> = {
  'provider-connectivity-test': {
    gateName: 'AI_PROVIDER_REAL_TEST_ALLOWED',
    description: 'Provider 测试连接',
    willCallProvider: true,
    willUploadStorage: false,
  },
  'provider-model-discovery': {
    gateName: 'AI_PROVIDER_REAL_TEST_ALLOWED',
    description: 'Provider 模型发现',
    willCallProvider: true,
    willUploadStorage: false,
  },
  'storage-connectivity-test': {
    gateName: 'OBJECT_STORAGE_REAL_TEST_ALLOWED',
    description: '对象存储测试',
    willCallProvider: false,
    willUploadStorage: true,
  },
}

export class AdminNoCallGateBlockedError extends Error {
  code = 'ADMIN_NO_CALL_GATE_BLOCKED'
  statusCode = 403
  blocked = true
  willCallExternal = false
  willCallProvider = false
  willUploadStorage = false
  gateName: string
  action: AdminDangerousAction

  constructor(action: AdminDangerousAction, config: AdminDangerousActionConfig) {
    super(`${config.description} 已被默认 no-call gate 阻断；如需执行真实外呼或上传，必须先获得人工授权 gate。`)
    this.name = 'AdminNoCallGateBlockedError'
    this.action = action
    this.gateName = config.gateName
  }
}

const isGateEnabled = (value: string | undefined) => String(value || '').trim().toLowerCase() === 'true'

export const getAdminDangerousActionGateStatus = (
  action: AdminDangerousAction,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const config = ACTION_CONFIGS[action]
  const allowed = isGateEnabled(env[config.gateName])

  return {
    action,
    gateName: config.gateName,
    allowed,
    blocked: !allowed,
    willCallExternal: allowed && (config.willCallProvider || config.willUploadStorage),
    willCallProvider: allowed && config.willCallProvider,
    willUploadStorage: allowed && config.willUploadStorage,
  }
}

export const assertDangerousAdminActionAllowed = (
  action: AdminDangerousAction,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const config = ACTION_CONFIGS[action]
  if (!isGateEnabled(env[config.gateName])) {
    throw new AdminNoCallGateBlockedError(action, config)
  }
}

export const isAdminNoCallGateBlockedError = (error: unknown): error is AdminNoCallGateBlockedError => {
  return Boolean(error && typeof error === 'object' && (error as any).code === 'ADMIN_NO_CALL_GATE_BLOCKED')
}

export const __adminDangerousActionGateTestHooks = {
  getAdminDangerousActionGateStatus,
  assertDangerousAdminActionAllowed,
}
