type RuntimeEnv = Record<string, string | undefined>

const INVENTORY_GATE = 'OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY'

export const assertInventoryAuthorized = (env: RuntimeEnv = process.env) => {
  if (env[INVENTORY_GATE] !== '1') {
    throw new Error('Legacy configuration inventory is not authorized.')
  }
}
