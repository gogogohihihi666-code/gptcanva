import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { __adminAuditLogTestHooks } from '../../server/admin-audit-logs/service'

describe('admin audit log business summary', () => {
  it('builds a readable point adjustment summary without exposing sensitive data', () => {
    const view = __adminAuditLogTestHooks.buildAdminAuditBusinessView({
      id: 'audit-1',
      action: 'admin_user_points_adjust',
      targetType: 'app_user',
      targetId: 'user-123',
      beforeJson: {
        currentPointBalance: 20,
        request: {
          action: 'INCREASE',
          changeAmount: 50,
          remark: 'after-sale adjustment',
          secret: 'should-not-appear',
        },
      },
      afterJson: {
        balanceAfter: 70,
        rawPayloadJson: { token: 'should-not-appear' },
      },
    })

    assert.equal(view.businessModule, '积分调整')
    assert.equal(view.riskLevel, 'MEDIUM')
    assert.match(view.businessSummary, /user-123/)
    assert.match(view.businessSummary, /50/)
    assert.match(view.businessSummary, /after-sale adjustment/)
    assert.doesNotMatch(view.beforeJsonPreview || '', /should-not-appear/)
    assert.doesNotMatch(view.afterJsonPreview || '', /should-not-appear/)
    assert.doesNotMatch(view.afterJsonPreview || '', /rawPayloadJson/)
    assert.match(view.afterJsonPreview || '', /redactedFields/)
  })

  it('maps system configuration changes to a high risk business module', () => {
    const view = __adminAuditLogTestHooks.buildAdminAuditBusinessView({
      id: 'audit-2',
      action: 'admin_system_config_update',
      targetType: 'system_config',
      targetId: 'payment',
      beforeJson: { enabled: false },
      afterJson: { enabled: true, apiKey: 'should-not-appear' },
    })

    assert.equal(view.businessModule, '系统配置')
    assert.equal(view.riskLevel, 'HIGH')
    assert.match(view.businessSummary, /系统配置/)
    assert.doesNotMatch(view.afterJsonPreview || '', /should-not-appear/)
  })
})
