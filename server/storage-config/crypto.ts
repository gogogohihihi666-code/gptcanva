import crypto from 'node:crypto'
import { deriveEncryptionKey, resolveEncryptionSecrets } from '../config-encryption/secrets'

const IV_LENGTH = 12

const encryptText = (plainText?: string | null) => {
  if (!plainText) return ''

  const { current } = resolveEncryptionSecrets('storage')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(current), iv)
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`
}

const decryptText = (encryptedText?: string | null) => {
  if (!encryptedText) return ''

  const [ivBase64, authTagBase64, payloadBase64] = encryptedText.split('.')
  if (!ivBase64 || !authTagBase64 || !payloadBase64) {
    throw new Error('Storage configuration ciphertext format is invalid.')
  }

  const secrets = resolveEncryptionSecrets('storage')
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

  throw new Error('Storage configuration ciphertext cannot be decrypted.')
}

const maskSecret = (value?: string | null) => {
  if (!value) return ''
  if (value.length <= 8) return value
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export const encryptStorageAccessKey = (plainText?: string | null) => encryptText(plainText)
export const encryptStorageSecretKey = (plainText?: string | null) => encryptText(plainText)
export const decryptStorageAccessKey = (encryptedText?: string | null) => decryptText(encryptedText)
export const decryptStorageSecretKey = (encryptedText?: string | null) => decryptText(encryptedText)
export const maskStorageAccessKey = (value?: string | null) => maskSecret(value)
export const maskStorageSecretKey = (value?: string | null) => maskSecret(value)
