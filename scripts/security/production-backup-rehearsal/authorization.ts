type RuntimeEnv = Record<string, string | undefined>

const SYNTHETIC_MANIFEST_GATE = 'OKWOOK_ALLOW_SYNTHETIC_BACKUP_MANIFEST'
const SYNTHETIC_REHEARSAL_GATE = 'OKWOOK_SYNTHETIC_BACKUP_REHEARSAL_ONLY'

export const assertSyntheticBackupManifestAuthorized = (env: RuntimeEnv = process.env) => {
  const errors: string[] = []

  if (String(env.NODE_ENV || '').trim().toLowerCase() !== 'test') {
    errors.push('NODE_ENV=test is required.')
  }
  if (env[SYNTHETIC_MANIFEST_GATE] !== '1') {
    errors.push(`${SYNTHETIC_MANIFEST_GATE}=1 is required.`)
  }
  if (env[SYNTHETIC_REHEARSAL_GATE] !== '1') {
    errors.push(`${SYNTHETIC_REHEARSAL_GATE}=1 is required.`)
  }

  if (errors.length > 0) {
    throw new Error(`Synthetic backup manifest is not authorized. ${errors.join(' ')}`)
  }
}
