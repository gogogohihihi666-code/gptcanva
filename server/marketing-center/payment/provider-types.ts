export type PaymentProviderCode = 'MOCK' | 'ALIPAY' | 'WECHAT' | 'AGGREGATOR'
export type PaymentIntentStatus = 'INTENT_CREATED' | 'CLOSED'
export type PaymentWebhookStatus = 'PAID' | 'FAILED' | 'CLOSED' | 'REFUNDED'

const SENSITIVE_PROVIDER_PAYLOAD_KEY_PATTERN = /(secret|token|password|cookie|authorization|signature|sign|api[-_]?key|access[-_]?key|private[-_]?key|credential)/i

export const sanitizeProviderPayload = (value: unknown, depth = 0): unknown => {
  if (depth > 8) {
    return '[REDACTED:DEPTH_LIMIT]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderPayload(item, depth + 1))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (SENSITIVE_PROVIDER_PAYLOAD_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]']
      }

      return [key, sanitizeProviderPayload(item, depth + 1)]
    }),
  )
}

export interface PaymentProviderConfig {
  provider: PaymentProviderCode
  enabled: boolean
  noCall: boolean
  displayName: string
}

export interface CreatePaymentIntentInput {
  orderId: string
  orderType: 'MEMBERSHIP' | 'RECHARGE'
  orderNo: string
  userId: string
  amount: number
  currency: string
  subject: string
  paymentChannel: string
  clientIp?: string | null
  returnUrl?: string | null
  notifyUrl?: string | null
}

export interface PaymentIntentResult {
  provider: PaymentProviderCode
  providerPaymentId: string
  orderId: string
  orderNo: string
  amount: number
  currency: string
  status: PaymentIntentStatus
  paymentUrl?: string | null
  qrCodePayload?: string | null
  expiresAt: Date
  rawPayloadJson: unknown
  willCallExternal: false
}

export interface VerifyWebhookSignatureInput {
  headers: Record<string, string | string[] | undefined>
  rawBody: string
  parsedBody: unknown
}

export interface PaymentWebhookEvent {
  provider: PaymentProviderCode
  providerTransactionId: string
  providerPaymentId: string
  orderId: string
  orderNo: string
  orderType: 'MEMBERSHIP' | 'RECHARGE'
  userId?: string | null
  amount: number
  currency: string
  status: PaymentWebhookStatus
  paidAt: Date | null
  rawPayloadJson: unknown
  idempotencyKey: string
}

export interface PaymentProvider {
  config: PaymentProviderConfig
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>
  verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean>
  parseWebhookEvent(input: VerifyWebhookSignatureInput): Promise<PaymentWebhookEvent>
  closePayment?(providerPaymentId: string): Promise<{ providerPaymentId: string; closed: boolean; willCallExternal: false }>
  refund?(input: { providerPaymentId: string; amount: number; reason?: string }): Promise<{ providerPaymentId: string; refunded: boolean; willCallExternal: false }>
}
