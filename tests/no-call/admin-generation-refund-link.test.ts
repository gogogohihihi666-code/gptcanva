import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildGenerationPointAuditMap } from '../../server/admin-generation-records/service'

describe('admin generation refund audit summaries', () => {
  it('links failed generation records to consume and refund point logs without raw payloads', () => {
    const consumeLog = {
      id: 'log-consume-1',
      userId: 'user-1',
      accountNo: 'PAL-001',
      changeType: 'CONSUME',
      action: 'DECREASE',
      changeAmount: -12,
      balanceAfter: 88,
      availableAmount: 88,
      sourceType: 'GENERATION_CONSUME',
      sourceId: 'task-1',
      associationNo: 'GEN-001',
      remark: 'consume',
      metaJson: {
        generationRecordId: 'record-failed',
        endpointType: 'image',
        providerId: 'provider-1',
        modelKey: 'mock-image',
        modelName: 'Mock Image',
        rawPayloadJson: { token: 'must-not-leak' },
      },
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
    }
    const refundLog = {
      ...consumeLog,
      id: 'log-refund-1',
      changeType: 'REFUND',
      action: 'INCREASE',
      changeAmount: 12,
      balanceAfter: 100,
      availableAmount: 100,
      remark: 'refund',
      createdAt: new Date('2026-07-01T10:05:00.000Z'),
    }

    const auditMap = buildGenerationPointAuditMap({
      records: [
        { id: 'record-failed', status: 'FAILED', errorMessage: 'provider timeout' },
        { id: 'record-stopped', status: 'STOPPED', errorMessage: 'user stopped' },
      ],
      pointLogs: [
        consumeLog,
        refundLog,
        {
          ...consumeLog,
          id: 'log-consume-2',
          associationNo: 'GEN-002',
          changeAmount: -6,
          metaJson: {
            ...consumeLog.metaJson,
            generationRecordId: 'record-stopped',
          },
        },
      ],
    })

    const refunded = auditMap.get('record-failed')
    assert.equal(refunded?.pointAmount, 12)
    assert.equal(refunded?.refundStatus, 'REFUNDED')
    assert.equal(refunded?.refundAmount, 12)
    assert.equal(refunded?.isCompensable, false)
    assert.equal(refunded?.relatedPointLogs.length, 2)

    const compensable = auditMap.get('record-stopped')
    assert.equal(compensable?.pointAmount, 6)
    assert.equal(compensable?.refundStatus, 'PENDING_REFUND')
    assert.equal(compensable?.refundAmount, 0)
    assert.equal(compensable?.isCompensable, true)
    assert.equal(compensable?.relatedPointLogs.length, 1)

    const serialized = JSON.stringify(Array.from(auditMap.values()))
    assert.equal(serialized.includes('must-not-leak'), false)
    assert.equal(serialized.includes('rawPayloadJson'), false)
    assert.equal(serialized.includes('token'), false)
  })
})
