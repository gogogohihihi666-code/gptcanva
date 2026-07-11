import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import {
  classifyCiphertext,
  encryptConfigCiphertext,
  type InventoryKeySet,
} from '../../scripts/security/legacy-config-ciphertext/classifier'

const secret = () => crypto.randomBytes(48).toString('base64url')
const current = secret()
const previous = secret()
const legacy = secret()
const keys: InventoryKeySet = { current, previous, legacy }

test('ciphertext classifier recognizes every supported field state using synthetic data', () => {
  assert.equal(classifyCiphertext('', keys), 'EMPTY')
  assert.equal(classifyCiphertext('invalid-format', keys), 'INVALID_FORMAT')
  assert.equal(classifyCiphertext(encryptConfigCiphertext('synthetic-current', current), keys), 'CURRENT_DECRYPTABLE')
  assert.equal(classifyCiphertext(encryptConfigCiphertext('synthetic-previous', previous), keys), 'PREVIOUS_DECRYPTABLE')
  assert.equal(classifyCiphertext(encryptConfigCiphertext('synthetic-legacy', legacy), keys), 'LEGACY_FALLBACK_DECRYPTABLE')
  assert.equal(classifyCiphertext(encryptConfigCiphertext('synthetic-unreadable', secret()), keys), 'UNDECRYPTABLE')
})

test('ciphertext classifier flags duplicate synthetic key material as multiple matches', () => {
  const duplicate = secret()
  const cipherText = encryptConfigCiphertext('synthetic-duplicate', duplicate)
  assert.equal(
    classifyCiphertext(cipherText, { current: duplicate, previous: duplicate, legacy: secret() }),
    'MULTIPLE_KEY_MATCH',
  )
})

test('ciphertext cannot cross inventory scopes', () => {
  const providerCiphertext = encryptConfigCiphertext('synthetic-provider', current)
  assert.equal(classifyCiphertext(providerCiphertext, { current: secret() }), 'UNDECRYPTABLE')
})
