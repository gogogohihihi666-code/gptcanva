import {
  type CreatePaymentIntentInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentWebhookEvent,
  type VerifyWebhookSignatureInput,
  sanitizeProviderPayload,
} from './provider-types'

const MOCK_SIGNATURE_HEADER = 'x-mock-payment-signature'
const MOCK_VALID_SIGNATURE = 'mock-valid-signature'

const readHeader = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const value = headers[name] || headers[name.toLowerCase()]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

const readBodyRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('mock payment webhook body must be an object')
  }

  return value as Record<string, unknown>
}

const readRequiredString = (record: Record<string, unknown>, key: string) => {
  const value = String(record[key] || '').trim()
  if (!value) {
    throw new Error(`mock payment webhook missing ${key}`)
  }
  return value
}

const readPositiveAmount = (record: Record<string, unknown>, key: string) => {
  const value = Number(record[key])
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`mock payment webhook invalid ${key}`)
  }
  return value
}

const normalizeOrderType = (value: unknown): 'MEMBERSHIP' | 'RECHARGE' => {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'MEMBERSHIP' || normalized === 'RECHARGE') {
    return normalized
  }
  throw new Error('mock payment webhook orderType must be MEMBERSHIP or RECHARGE')
}

export const createMockPaymentProvider = (): PaymentProvider => ({
  config: {
    provider: 'MOCK',
    enabled: true,
    noCall: true,
    displayName: 'No-call mock payment provider',
  },

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    const providerPaymentId = `MOCK_PAY_${input.orderType}_${input.orderNo}`
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    return {
      provider: 'MOCK',
      providerPaymentId,
      orderId: input.orderId,
      orderNo: input.orderNo,
      amount: input.amount,
      currency: input.currency,
      status: 'INTENT_CREATED',
      paymentUrl: `mock://payment/${providerPaymentId}`,
      qrCodePayload: `mock-payment:${providerPaymentId}`,
      expiresAt,
      rawPayloadJson: sanitizeProviderPayload({
        provider: 'MOCK',
        providerPaymentId,
        orderId: input.orderId,
        orderNo: input.orderNo,
        orderType: input.orderType,
        userId: input.userId,
        amount: input.amount,
        currency: input.currency,
        subject: input.subject,
        paymentChannel: input.paymentChannel,
        noCall: true,
        token: 'mock-sensitive-value',
      }),
      willCallExternal: false,
    }
  },

  async verifyWebhookSignature(input: VerifyWebhookSignatureInput) {
    const headerSignature = readHeader(input.headers, MOCK_SIGNATURE_HEADER)
    const body = input.parsedBody && typeof input.parsedBody === 'object'
      ? input.parsedBody as Record<string, unknown>
      : {}
    const bodySignature = String(body.mockSignature || '').trim()
    return headerSignature === MOCK_VALID_SIGNATURE || bodySignature === MOCK_VALID_SIGNATURE
  },

  async parseWebhookEvent(input: VerifyWebhookSignatureInput): Promise<PaymentWebhookEvent> {
    const body = readBodyRecord(input.parsedBody)
    const orderType = normalizeOrderType(body.orderType)
    const providerPaymentId = readRequiredString(body, 'providerPaymentId')
    const providerTransactionId = readRequiredString(body, 'providerTransactionId')
    const status = String(body.status || 'PAID').trim().toUpperCase()

    if (status !== 'PAID' && status !== 'FAILED' && status !== 'CLOSED' && status !== 'REFUNDED') {
      throw new Error('mock payment webhook status is unsupported')
    }

    const paidAtValue = String(body.paidAt || '').trim()
    const paidAt = paidAtValue ? new Date(paidAtValue) : new Date()
    if (Number.isNaN(paidAt.getTime())) {
      throw new Error('mock payment webhook paidAt is invalid')
    }

    return {
      provider: 'MOCK',
      providerPaymentId,
      providerTransactionId,
      orderId: readRequiredString(body, 'orderId'),
      orderNo: readRequiredString(body, 'orderNo').toUpperCase(),
      orderType,
      userId: String(body.userId || '').trim() || null,
      amount: readPositiveAmount(body, 'amount'),
      currency: String(body.currency || 'CNY').trim().toUpperCase() || 'CNY',
      status: status as PaymentWebhookEvent['status'],
      paidAt,
      rawPayloadJson: sanitizeProviderPayload(body),
      idempotencyKey: `WEBHOOK-MOCK-${providerTransactionId}`,
    }
  },

  async closePayment(providerPaymentId: string) {
    return {
      providerPaymentId,
      closed: true,
      willCallExternal: false,
    }
  },

  async refund(input: { providerPaymentId: string }) {
    return {
      providerPaymentId: input.providerPaymentId,
      refunded: true,
      willCallExternal: false,
    }
  },
})

export const MOCK_PAYMENT_SIGNATURE_HEADER = MOCK_SIGNATURE_HEADER
export const MOCK_PAYMENT_VALID_SIGNATURE = MOCK_VALID_SIGNATURE
