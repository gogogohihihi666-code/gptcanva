type RuntimeEnv = Record<string, string | undefined>

export interface VerificationDeliveryReadiness {
  deliveryProviderConfigured: boolean
  deliveryAvailable: boolean
  willReturnDebugCode: boolean
}

const isProduction = (env: RuntimeEnv) => String(env.NODE_ENV || '').trim().toLowerCase() === 'production'

export const getVerificationDeliveryReadiness = (
  env: RuntimeEnv = process.env,
  allowAutoFill = false,
): VerificationDeliveryReadiness => {
  const production = isProduction(env)
  const deliveryProviderConfigured = Boolean(String(env.AUTH_VERIFICATION_DELIVERY_PROVIDER || '').trim())

  return {
    deliveryProviderConfigured,
    // No real SMS or email adapter exists in the current no-call baseline.
    deliveryAvailable: false,
    willReturnDebugCode: !production && allowAutoFill,
  }
}

export const assertVerificationDeliveryAvailable = (env: RuntimeEnv = process.env) => {
  const readiness = getVerificationDeliveryReadiness(env)
  if (isProduction(env) && !readiness.deliveryAvailable) {
    throw new Error('Verification-code delivery is unavailable in production.')
  }

  return readiness
}
