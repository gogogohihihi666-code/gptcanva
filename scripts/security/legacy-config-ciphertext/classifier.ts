import crypto from 'node:crypto'
import type { FieldClassification } from './types'

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export interface InventoryKeySet {
  current: string
  previous?: string
  legacy?: string
}

const deriveKey = (secret: string) => crypto.createHash('sha256').update(secret).digest()

const decodeBase64Segment = (segment: string) => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(segment) || segment.length % 4 !== 0) return null
  const decoded = Buffer.from(segment, 'base64')
  return decoded.toString('base64') === segment ? decoded : null
}

const parseCiphertext = (value: string) => {
  const segments = value.split('.')
  if (segments.length !== 3) return null
  const [ivSegment, tagSegment, payloadSegment] = segments
  const iv = decodeBase64Segment(ivSegment)
  const authTag = decodeBase64Segment(tagSegment)
  const payload = decodeBase64Segment(payloadSegment)
  if (!iv || !authTag || !payload || iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || payload.length === 0) {
    return null
  }
  return { iv, authTag, payload }
}

const canDecrypt = (ciphertext: NonNullable<ReturnType<typeof parseCiphertext>>, secret: string) => {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), ciphertext.iv)
    decipher.setAuthTag(ciphertext.authTag)
    decipher.update(ciphertext.payload)
    decipher.final()
    return true
  } catch {
    return false
  }
}

export const encryptConfigCiphertext = (plainText: string, secret: string) => {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

export const classifyCiphertext = (
  value: string | null | undefined,
  keys: InventoryKeySet,
): FieldClassification => {
  if (!value) return 'EMPTY'
  const ciphertext = parseCiphertext(value)
  if (!ciphertext) return 'INVALID_FORMAT'

  const matches = [
    ['CURRENT_DECRYPTABLE', keys.current],
    ['PREVIOUS_DECRYPTABLE', keys.previous],
    ['LEGACY_FALLBACK_DECRYPTABLE', keys.legacy],
  ].flatMap(([classification, secret]) => secret && canDecrypt(ciphertext, secret)
    ? [classification as FieldClassification]
    : [])

  if (matches.length === 0) return 'UNDECRYPTABLE'
  if (matches.length > 1) return 'MULTIPLE_KEY_MATCH'
  return matches[0]
}
