import crypto from 'node:crypto'
import { deriveEncryptionKey, resolveEncryptionSecrets } from '../config-encryption/secrets'

const IV_LENGTH = 12

export const encryptProviderApiKey = (plainText?: string | null) => {
  if (!plainText) return null

  const { current } = resolveEncryptionSecrets('provider')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(current), iv)
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`
}

export const decryptProviderApiKey = (encryptedText?: string | null) => {
  if (!encryptedText) return ''

  const [ivBase64, authTagBase64, payloadBase64] = encryptedText.split('.')
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error('Provider configuration ciphertext format is invalid.')
  }

  const secrets = resolveEncryptionSecrets('provider')
  for (const secret of [secrets.current, secrets.previous].filter(Boolean) as string[]) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveEncryptionKey(secret),
        Buffer.from(ivBase64, 'base64'),
      )
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'))
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadBase64, 'base64')),
        decipher.final(),
      ])
      return decrypted.toString('utf8')
    } catch {
      // Try the previous approved rotation key without exposing crypto internals.
    }
  }

  throw new Error('Provider configuration ciphertext cannot be decrypted.')
}

export const maskApiKey = (apiKey?: string | null) => {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return apiKey
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
}
