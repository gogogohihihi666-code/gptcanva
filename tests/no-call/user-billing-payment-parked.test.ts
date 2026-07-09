import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('user billing and plan entry payment parked no-call', () => {
  it('keeps membership and recharge visible while blocking payment order creation', () => {
    const modal = readText('src/components/MarketingModal.vue')
    const store = readText('src/stores/marketing-center.ts')
    const api = readText('src/api/marketing-center.ts')
    const css = readText('src/components/MarketingModal.css')

    assert.match(modal, /paymentParkedNotice/)
    assert.match(modal, /支付暂未开启/)
    assert.match(modal, /当前不会创建真实支付单/)
    assert.match(modal, /当前不会创建订单/)
    assert.match(modal, /当前不会跳转真实支付渠道/)
    assert.match(modal, /当前不会扣款/)
    assert.match(modal, /当前不会自动发会员/)
    assert.match(modal, /当前不会自动增加积分/)
    assert.match(modal, /本地 demo fixture/)
    assert.match(modal, /会员套餐/)
    assert.match(modal, /积分充值/)

    assert.match(modal, /const isBillingPaymentParked = computed\(\(\) => true\)/)
    assert.match(modal, /:disabled="isMembershipPurchaseBlocked\(plan\)"/)
    assert.match(modal, /:disabled="isRechargePurchaseBlocked"/)
    assert.match(modal, /handlePaymentParkedAction/)
    assert.match(modal, /ElMessage\.info\(paymentParkedToast/)

    assert.doesNotMatch(modal, /import ScanPayModal/)
    assert.doesNotMatch(modal, /<ScanPayModal/)
    assert.doesNotMatch(modal, /openMembershipScanPay/)
    assert.doesNotMatch(modal, /openRechargeScanPay/)
    assert.doesNotMatch(modal, /scanPayVisible/)
    assert.doesNotMatch(modal, /purchaseMembership/)
    assert.doesNotMatch(modal, /purchaseRecharge/)
    assert.doesNotMatch(modal, /payUrl/)

    assert.match(store, /purchaseMembership/)
    assert.match(store, /purchaseRecharge/)
    assert.match(api, /\/api\/marketing\/membership-orders/)
    assert.match(api, /\/api\/marketing\/recharge-orders/)
    assert.match(css, /@media screen and \(max-width:480px\)/)
    assert.match(css, /paymentParkedNotice/)
  })
})
