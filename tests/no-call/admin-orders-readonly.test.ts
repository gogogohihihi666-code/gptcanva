import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { __adminOrdersTestHooks } from '../../server/admin-orders/service'
import { readAdminOrdersQuery } from '../../server/admin-orders/shared'

describe('admin orders readonly query', () => {
  it('normalizes unsupported filters to readonly defaults', () => {
    const query = readAdminOrdersQuery('/api/admin/orders?orderType=unknown&paymentStatus=PAID&benefitStatus=SUCCESS&page=2&pageSize=500')

    assert.equal(query.orderType, 'ALL')
    assert.equal(query.paymentStatus, 'PAID')
    assert.equal(query.benefitStatus, 'SUCCESS')
    assert.equal(query.page, 2)
    assert.equal(query.pageSize, 100)
  })

  it('serializes payment summaries without raw payload or secret material', () => {
    const summary = __adminOrdersTestHooks.summarizePaymentTransactions([
      {
        id: 'txn_1',
        status: 'PAID',
        provider: 'LOCAL',
        channel: 'MOCK',
        expectedAmount: { toString: () => '10.00' },
        paidAmount: { toString: () => '10.00' },
        currency: 'CNY',
        paidAt: new Date('2026-07-05T01:02:03.000Z'),
        verifiedAt: new Date('2026-07-05T01:02:04.000Z'),
        rawPayloadJson: {
          token: 'must-not-leak',
          providerSecret: 'must-not-leak',
          signature: 'must-not-leak',
        },
      },
    ])

    assert.equal(summary.count, 1)
    assert.equal(summary.latestStatus, 'PAID')
    assert.deepEqual(Object.keys(summary.latest || {}).sort(), [
      'channel',
      'currency',
      'expectedAmount',
      'id',
      'paidAmount',
      'paidAt',
      'provider',
      'status',
      'verifiedAt',
    ])
    assert.equal(JSON.stringify(summary).includes('must-not-leak'), false)
  })
})
