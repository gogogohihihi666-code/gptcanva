import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildAccountGenerationHistoryItems } from '../../server/account-generation-history/service'

const root = resolve(import.meta.dirname, '../..')
const readText = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('user generation history readonly no-call', () => {
  it('builds a safe user-facing history without URLs, raw payloads, or provider responses', () => {
    const items = buildAccountGenerationHistoryItems({
      records: [
        {
          id: 'demo-record-12345678',
          userId: 'demo-user',
          type: 'IMAGE',
          status: 'FAILED',
          prompt: 'A safe prompt summary for the user',
          modelLabel: 'Demo Local Model',
          modelKey: 'demo-local-model',
          ratio: '1:1',
          resolution: '1024x1024',
          errorMessage: 'Provider blocked: token=must-not-leak https://example.invalid/result',
          startedAt: new Date('2026-07-10T09:00:00.000Z'),
          finishedAt: new Date('2026-07-10T09:01:00.000Z'),
          createdAt: new Date('2026-07-10T08:59:00.000Z'),
          outputs: [{ outputType: 'IMAGE', url: '/demo/no-call/local-placeholder-image.png' }],
        },
      ],
      pointLogs: [
        {
          userId: 'demo-user',
          sourceId: 'demo-record-12345678',
          changeType: 'CONSUME',
          changeAmount: -80,
          metaJson: { rawPayloadJson: { token: 'must-not-leak' } },
        },
      ],
    })

    assert.equal(items.length, 1)
    assert.equal(items[0].status, 'FAILED')
    assert.equal(items[0].pointCost, 80)
    assert.equal(items[0].refundStatus, 'PENDING_REFUND')
    assert.equal(items[0].compensationStatus, 'PENDING')
    assert.equal(items[0].hasLocalDemoResult, false)
    assert.equal(items[0].resultCount, 1)

    const serialized = JSON.stringify(items)
    assert.equal(serialized.includes('must-not-leak'), false)
    assert.equal(serialized.includes('rawPayloadJson'), false)
    assert.equal(serialized.includes('https://example.invalid'), false)
    assert.equal(serialized.includes('url'), false)
  })

  it('keeps the account UI on the readonly history path with no retry, task creation, or result URL loading', () => {
    const page = readText('src/views/account/AccountManagement.vue')
    const api = readText('src/api/account-generation-history.ts')
    const handler = readText('server/account-generation-history/request-handler.ts')
    const service = readText('server/account-generation-history/service.ts')
    const css = readText('src/views/account/account-center.css')

    assert.match(page, /listAccountGenerationHistory/)
    assert.match(page, /generation-history-detail/)
    assert.match(page, /account-task-status-label/)
    assert.match(page, /no-call/)
    assert.doesNotMatch(page, /listGenerationRecords/)
    assert.doesNotMatch(page, /createGenerationTask/)
    assert.doesNotMatch(page, /stopGenerationTask/)
    assert.doesNotMatch(page, /getRecordResultUrls/)
    assert.doesNotMatch(page, /ScanPayModal/)

    assert.match(api, /\/api\/account\/generation-history/)
    assert.match(api, /method:\s*'GET'/)
    assert.doesNotMatch(api, /method:\s*'POST'/)
    assert.doesNotMatch(api, /payUrl/)

    assert.match(handler, /req\.method === 'GET'/)
    assert.doesNotMatch(handler, /req\.method === 'POST'/)
    assert.doesNotMatch(handler, /rawPayloadJson/)
    assert.doesNotMatch(handler, /provider response/i)

    assert.match(service, /where:\s*\{ userId: currentUserId \}/)
    assert.match(service, /where:\s*\{[\s\S]*userId: currentUserId/)
    assert.doesNotMatch(service, /signed url/i)
    assert.match(css, /@media \(max-width: 480px\)/)
    assert.match(css, /\.generation-history-detail__summary[\s\S]*grid-template-columns:\s*1fr/)
    assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.account-task-overview[\s\S]*min-width:\s*0[\s\S]*width:\s*100%/)
    assert.match(css, /\.generation-history-detail\s*\{[\s\S]*--el-dialog-bg-color:\s*#[0-9a-f]{6}/i)
    assert.match(css, /\.generation-history-detail[\s\S]*\.el-dialog__title[\s\S]*color:\s*#[0-9a-f]{6}/i)
  })
})
