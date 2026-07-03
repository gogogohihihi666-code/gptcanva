import { readCurrentSessionUser, requireCurrentSessionUser } from '../auth/session'
import { sendJson } from '../ai-gateway/shared'
import {
  MARKETING_CENTER_CARD_REDEEM_PATH,
  MARKETING_CENTER_CHECKIN_PATH,
  MARKETING_CENTER_LOCAL_PAYMENT_CONFIRM_PATH,
  MARKETING_CENTER_MEMBERSHIP_ORDER_PATH,
  MARKETING_CENTER_OVERVIEW_PATH,
  MARKETING_CENTER_PAYMENT_INTENT_PATH,
  MARKETING_CENTER_PAYMENT_WEBHOOK_MOCK_PATH,
  MARKETING_CENTER_RECHARGE_ORDER_PATH,
} from './constants'
import {
  createMembershipPurchaseOrder,
  createMarketingPaymentIntent,
  createRechargePurchaseOrder,
  confirmLocalPaymentAndGrantBenefits,
  getMarketingCenterOverview,
  handleMarketingPaymentWebhook,
  performUserCheckin,
  redeemCardCode,
} from './service'
import {
  readMarketingCenterBody,
  sendMarketingCenterError,
  type MarketingCenterCardRedeemPayload,
  type MarketingCenterLocalPaymentConfirmPayload,
  type MarketingCenterMembershipOrderPayload,
  type MarketingCenterPaymentIntentPayload,
  type MarketingCenterRechargeOrderPayload,
} from './shared'

const normalizeLocalPaymentConfirmPayload = (payload: MarketingCenterLocalPaymentConfirmPayload) => {
  const orderType = String(payload.orderType || '').trim().toUpperCase()
  const orderNo = String(payload.orderNo || '').trim()
  const paidAmount = payload.paidAmount

  if (orderType !== 'MEMBERSHIP' && orderType !== 'RECHARGE') {
    throw new Error('local payment orderType must be MEMBERSHIP or RECHARGE')
  }
  if (!orderNo) {
    throw new Error('local payment orderNo is required')
  }
  if (paidAmount !== undefined && paidAmount !== null && String(paidAmount).trim() !== '') {
    const parsedAmount = Number(paidAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      throw new Error('local payment paidAmount is invalid')
    }
  }

  return {
    orderType,
    orderNo,
    paidAmount,
    idempotencyKey: String(payload.idempotencyKey || '').trim(),
    channelTransactionNo: String(payload.channelTransactionNo || '').trim(),
  }
}

const normalizePaymentIntentPayload = (payload: MarketingCenterPaymentIntentPayload) => {
  const orderType = String(payload.orderType || '').trim().toUpperCase()
  const orderNo = String(payload.orderNo || '').trim()

  if (orderType !== 'MEMBERSHIP' && orderType !== 'RECHARGE') {
    throw new Error('payment intent orderType must be MEMBERSHIP or RECHARGE')
  }
  if (!orderNo) {
    throw new Error('payment intent orderNo is required')
  }

  return {
    orderType,
    orderNo,
    provider: String(payload.provider || 'MOCK').trim().toUpperCase(),
    paymentChannel: String(payload.paymentChannel || 'MOCK').trim().toUpperCase(),
    clientIp: String(payload.clientIp || '').trim() || null,
    returnUrl: String(payload.returnUrl || '').trim() || null,
    notifyUrl: String(payload.notifyUrl || '').trim() || null,
  }
}

// 处理用户侧营销中心请求。
export const handleMarketingCenterRequest = async (req: any, res: any) => {
  try {
    const requestPath = String(req.url || '').split('?')[0] || ''

    if (req.method === 'GET' && requestPath === MARKETING_CENTER_OVERVIEW_PATH) {
      const currentUser = await readCurrentSessionUser(req)
      sendJson(res, 200, { data: await getMarketingCenterOverview(currentUser?.id || null) })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_PAYMENT_WEBHOOK_MOCK_PATH) {
      const payload = await readMarketingCenterBody<Record<string, unknown>>(req)
      sendJson(res, 200, {
        data: await handleMarketingPaymentWebhook({
          provider: 'MOCK',
          headers: req.headers || {},
          parsedBody: payload,
        }),
        message: 'payment webhook processed',
      })
      return
    }

    const currentUser = await requireCurrentSessionUser(req, res)
    if (!currentUser) {
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_CHECKIN_PATH) {
      sendJson(res, 200, {
        data: await performUserCheckin(currentUser.id),
        message: '签到成功',
      })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_CARD_REDEEM_PATH) {
      const payload = await readMarketingCenterBody<MarketingCenterCardRedeemPayload>(req)
      sendJson(res, 200, {
        data: await redeemCardCode(currentUser.id, String(payload.code || '').trim()),
        message: '卡密兑换成功',
      })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_MEMBERSHIP_ORDER_PATH) {
      const payload = await readMarketingCenterBody<MarketingCenterMembershipOrderPayload>(req)
      sendJson(res, 200, {
        data: await createMembershipPurchaseOrder(currentUser.id, String(payload.planId || '').trim()),
        message: '会员订单已创建，等待支付确认',
      })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_RECHARGE_ORDER_PATH) {
      const payload = await readMarketingCenterBody<MarketingCenterRechargeOrderPayload>(req)
      sendJson(res, 200, {
        data: await createRechargePurchaseOrder(currentUser.id, String(payload.rechargePackageId || '').trim()),
        message: '充值订单已创建，等待支付确认',
      })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_LOCAL_PAYMENT_CONFIRM_PATH) {
      const payload = await readMarketingCenterBody<MarketingCenterLocalPaymentConfirmPayload>(req)
      const normalizedPayload = normalizeLocalPaymentConfirmPayload(payload)
      sendJson(res, 200, {
        data: await confirmLocalPaymentAndGrantBenefits(currentUser.id, normalizedPayload),
        message: '本地支付确认已处理',
      })
      return
    }

    if (req.method === 'POST' && requestPath === MARKETING_CENTER_PAYMENT_INTENT_PATH) {
      const payload = await readMarketingCenterBody<MarketingCenterPaymentIntentPayload>(req)
      sendJson(res, 200, {
        data: await createMarketingPaymentIntent(currentUser.id, normalizePaymentIntentPayload(payload)),
        message: 'payment intent created',
      })
      return
    }

    sendMarketingCenterError(res, 405, 'Method Not Allowed')
  } catch (error: any) {
    sendMarketingCenterError(res, 500, error?.message || '处理营销中心请求失败')
  }
}
