import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { __adminDashboardTestHooks } from '../../server/admin-dashboard/service'

describe('admin dashboard readonly risk overview', () => {
  it('serializes risk items without raw payload or sensitive fields', () => {
    const item = __adminDashboardTestHooks.sanitizeRiskOverviewValue({
      id: 'risk-1',
      title: 'failed payment',
      rawPayloadJson: { token: 'should-not-appear' },
      nested: {
        secret: 'should-not-appear',
        safe: 'visible',
      },
    })

    const text = JSON.stringify(item)
    assert.doesNotMatch(text, /rawPayloadJson/)
    assert.doesNotMatch(text, /should-not-appear/)
    assert.match(text, /redactedFields/)
    assert.match(text, /visible/)
  })

  it('builds readonly empty risk overview defaults', () => {
    const overview = __adminDashboardTestHooks.buildEmptyRiskOverview()

    assert.equal(overview.orderSummary.todayOrderCount, 0)
    assert.equal(overview.failedTaskSummary.failedCount, 0)
    assert.equal(overview.pointRiskSummary.compensableCount, 0)
    assert.equal(overview.auditRiskSummary.highRiskCount, 0)
    assert.equal(overview.readonly, true)
    assert.ok(overview.generatedAt)
  })
})
