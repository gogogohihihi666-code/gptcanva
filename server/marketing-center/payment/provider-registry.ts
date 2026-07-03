import { createMockPaymentProvider } from './mock-payment-provider'
import type { PaymentProvider, PaymentProviderCode } from './provider-types'

const normalizeProviderCode = (value: unknown): PaymentProviderCode => {
  const provider = String(value || 'MOCK').trim().toUpperCase()
  if (provider === 'MOCK' || provider === 'ALIPAY' || provider === 'WECHAT' || provider === 'AGGREGATOR') {
    return provider
  }
  throw new Error('payment provider is unsupported')
}

const isMockProviderAllowed = () => {
  if (process.env.NODE_ENV === 'production') {
    return false
  }
  return true
}

export const resolvePaymentProvider = (value: unknown): PaymentProvider => {
  const provider = normalizeProviderCode(value)

  if (provider === 'MOCK') {
    if (!isMockProviderAllowed()) {
      throw new Error('mock payment provider is disabled in production')
    }
    return createMockPaymentProvider()
  }

  throw new Error('real payment provider is not implemented in no-call phase')
}

export const __paymentProviderRegistryTestHooks = {
  normalizeProviderCode,
  isMockProviderAllowed,
}
