import assert from 'node:assert/strict'
import test from 'node:test'
import { assertInventoryAuthorized } from '../../scripts/security/legacy-config-ciphertext/authorization'

test('legacy configuration inventory requires its exact authorization gate', () => {
  for (const value of [undefined, '', 'true', 'yes', 'on', '0']) {
    assert.throws(
      () => assertInventoryAuthorized({ OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY: value }),
      /not authorized/i,
    )
  }

  assert.doesNotThrow(() => assertInventoryAuthorized({ OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY: '1' }))
})
