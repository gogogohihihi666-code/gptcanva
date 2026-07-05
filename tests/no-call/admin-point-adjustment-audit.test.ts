import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { __adminUsersTestHooks } from '../../server/admin-users/service'

describe('admin point adjustment audit gate', () => {
  it('requires an audit reason for manual point adjustments', () => {
    assert.throws(
      () => __adminUsersTestHooks.normalizeAdminPointAdjustmentRemark('   '),
      /请填写调整原因，便于审计追踪/,
    )
  })

  it('requires a meaningful audit reason for manual point adjustments', () => {
    assert.throws(
      () => __adminUsersTestHooks.normalizeAdminPointAdjustmentRemark('补发'),
      /请填写调整原因，便于审计追踪/,
    )
  })

  it('trims and keeps a valid audit reason', () => {
    assert.equal(
      __adminUsersTestHooks.normalizeAdminPointAdjustmentRemark('  活动补发积分  '),
      '活动补发积分',
    )
  })
})
