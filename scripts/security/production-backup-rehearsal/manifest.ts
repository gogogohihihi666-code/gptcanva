export type SyntheticBackupKind = 'FULL_LOGICAL' | 'BINARY_LOG_ARCHIVE'

export interface SyntheticBackupRehearsalInput {
  backupId: string
  backupKind: SyntheticBackupKind
  recoveryPointAt: string
  incidentDeclaredAt: string
  recoveryCompletedAt: string
  artifactByteCount: number
  sha256: string
  schemaMigrationCount: number
}

const RPO_TARGET_MINUTES = 240
const RTO_TARGET_MINUTES = 240
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const BACKUP_ID_PATTERN = /^synthetic-backup-[a-z0-9-]+$/

const parseTimestamp = (label: string, value: string) => {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} timestamp is invalid.`)
  }
  return timestamp
}

const toWholeMinutes = (milliseconds: number) => Math.ceil(milliseconds / 60000)

export const createSyntheticBackupRehearsalManifest = (input: SyntheticBackupRehearsalInput) => {
  if (!BACKUP_ID_PATTERN.test(input.backupId)) {
    throw new Error('Synthetic backup ID is invalid.')
  }
  if (!Number.isSafeInteger(input.artifactByteCount) || input.artifactByteCount <= 0) {
    throw new Error('Synthetic artifact byte count is invalid.')
  }
  if (!Number.isSafeInteger(input.schemaMigrationCount) || input.schemaMigrationCount < 0) {
    throw new Error('Synthetic schema migration count is invalid.')
  }
  if (!SHA256_PATTERN.test(input.sha256)) {
    throw new Error('Synthetic sha256 evidence is invalid.')
  }

  const recoveryPointAt = parseTimestamp('Recovery point', input.recoveryPointAt)
  const incidentDeclaredAt = parseTimestamp('Incident declaration', input.incidentDeclaredAt)
  const recoveryCompletedAt = parseTimestamp('Recovery completion', input.recoveryCompletedAt)

  if (recoveryPointAt > incidentDeclaredAt || incidentDeclaredAt > recoveryCompletedAt) {
    throw new Error('Synthetic recovery timestamps are out of order.')
  }

  const rpoMinutes = toWholeMinutes(incidentDeclaredAt - recoveryPointAt)
  const rtoMinutes = toWholeMinutes(recoveryCompletedAt - incidentDeclaredAt)
  if (rpoMinutes > RPO_TARGET_MINUTES) {
    throw new Error(`Synthetic rehearsal misses the RPO target of ${RPO_TARGET_MINUTES} minutes.`)
  }
  if (rtoMinutes > RTO_TARGET_MINUTES) {
    throw new Error(`Synthetic rehearsal misses the RTO target of ${RTO_TARGET_MINUTES} minutes.`)
  }

  return {
    schemaVersion: 'backup-rehearsal-manifest-v1',
    environmentClass: 'SYNTHETIC_TEST_ONLY',
    backupId: input.backupId,
    backupKind: input.backupKind,
    artifactByteCount: input.artifactByteCount,
    integrity: {
      algorithm: 'sha256',
      verified: true,
    },
    schemaMigrationCount: input.schemaMigrationCount,
    recoveryObjectives: {
      rpoMinutes,
      rtoMinutes,
      rpoTargetMinutes: RPO_TARGET_MINUTES,
      rtoTargetMinutes: RTO_TARGET_MINUTES,
      rpoMet: true,
      rtoMet: true,
    },
  }
}
