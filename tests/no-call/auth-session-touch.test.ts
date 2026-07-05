import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { __authSessionTestHooks } from '../../server/auth/service'

describe('auth session activity touch', () => {
  it('ignores concurrent app_sessions lastActiveAt update conflicts', async () => {
    const tx = {
      appSession: {
        update: async () => {
          throw new Error("Record has changed since last read in table 'app_sessions'; try restarting transaction")
        },
      },
    }

    await assert.doesNotReject(
      __authSessionTestHooks.touchUserSessionLastActiveAt(tx as any, 'session_1'),
    )
  })

  it('keeps unexpected session update failures visible', async () => {
    const tx = {
      appSession: {
        update: async () => {
          throw new Error('database unavailable')
        },
      },
    }

    await assert.rejects(
      __authSessionTestHooks.touchUserSessionLastActiveAt(tx as any, 'session_1'),
      /database unavailable/,
    )
  })
})
