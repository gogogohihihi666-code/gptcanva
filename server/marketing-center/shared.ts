import { readJsonBody, sendJson } from '../ai-gateway/shared'

export interface MarketingCenterCardRedeemPayload {
  code?: string
}

export interface MarketingCenterMembershipOrderPayload {
  planId?: string
}

export interface MarketingCenterRechargeOrderPayload {
  rechargePackageId?: string
}

export interface MarketingCenterLocalPaymentConfirmPayload {
  orderType?: 'MEMBERSHIP' | 'RECHARGE' | string
  orderNo?: string
  paidAmount?: number | string
  idempotencyKey?: string
  channelTransactionNo?: string
}

export interface MarketingCenterPaymentIntentPayload {
  orderType?: 'MEMBERSHIP' | 'RECHARGE' | string
  orderNo?: string
  provider?: string
  paymentChannel?: string
  clientIp?: string
  returnUrl?: string
  notifyUrl?: string
}

// 统一读取营销中心请求体。
export const readMarketingCenterBody = async <T = Record<string, unknown>>(req: any) => {
  const payload = await readJsonBody(req)
  return payload as T
}

// 统一返回营销中心错误。
export const sendMarketingCenterError = (res: any, statusCode: number, message: string) => {
  sendJson(res, statusCode, {
    message,
    error: {
      type: 'marketing_center_error',
      message,
    },
  })
}
