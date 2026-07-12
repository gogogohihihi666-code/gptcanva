import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  assertSyntheticBackupManifestAuthorized,
} from '../../scripts/security/production-backup-rehearsal/authorization'
import {
  createSyntheticBackupRehearsalManifest,
} from '../../scripts/security/production-backup-rehearsal/manifest'

const root = resolve(import.meta.dirname, '../..')

const approvedEnv = () => ({
  NODE_ENV: 'test',
  OKWOOK_ALLOW_SYNTHETIC_BACKUP_MANIFEST: '1',
  OKWOOK_SYNTHETIC_BACKUP_REHEARSAL_ONLY: '1',
})

test('synthetic backup manifest requires exact test-only authorization gates', () => {
  for (const env of [
    {},
    { ...approvedEnv(), NODE_ENV: 'production' },
    { ...approvedEnv(), OKWOOK_ALLOW_SYNTHETIC_BACKUP_MANIFEST: 'true' },
    { ...approvedEnv(), OKWOOK_SYNTHETIC_BACKUP_REHEARSAL_ONLY: '0' },
  ]) {
    assert.throws(() => assertSyntheticBackupManifestAuthorized(env), /not authorized/i)
  }

  assert.doesNotThrow(() => assertSyntheticBackupManifestAuthorized(approvedEnv()))
})

test('synthetic backup manifest measures approved recovery objectives without sensitive fields', () => {
  const manifest = createSyntheticBackupRehearsalManifest({
    backupId: 'synthetic-backup-20260712-001',
    backupKind: 'FULL_LOGICAL',
    recoveryPointAt: '2026-07-12T00:00:00.000Z',
    incidentDeclaredAt: '2026-07-12T03:30:00.000Z',
    recoveryCompletedAt: '2026-07-12T03:50:00.000Z',
    artifactByteCount: 1048576,
    sha256: 'a'.repeat(64),
    schemaMigrationCount: 11,
  })

  assert.deepEqual(manifest, {
    schemaVersion: 'backup-rehearsal-manifest-v1',
    environmentClass: 'SYNTHETIC_TEST_ONLY',
    backupId: 'synthetic-backup-20260712-001',
    backupKind: 'FULL_LOGICAL',
    artifactByteCount: 1048576,
    integrity: { algorithm: 'sha256', verified: true },
    schemaMigrationCount: 11,
    recoveryObjectives: {
      rpoMinutes: 210,
      rtoMinutes: 20,
      rpoTargetMinutes: 240,
      rtoTargetMinutes: 240,
      rpoMet: true,
      rtoMet: true,
    },
  })
  assert.equal(JSON.stringify(manifest).includes('sha256'), true)
  assert.equal(JSON.stringify(manifest).includes('a'.repeat(64)), false)
})

test('synthetic backup manifest rejects invalid evidence and missed recovery objectives', () => {
  const input = {
    backupId: 'synthetic-backup-20260712-002',
    backupKind: 'BINARY_LOG_ARCHIVE' as const,
    recoveryPointAt: '2026-07-12T00:00:00.000Z',
    incidentDeclaredAt: '2026-07-12T04:01:00.000Z',
    recoveryCompletedAt: '2026-07-12T04:02:00.000Z',
    artifactByteCount: 1,
    sha256: 'b'.repeat(64),
    schemaMigrationCount: 0,
  }

  assert.throws(() => createSyntheticBackupRehearsalManifest(input), /RPO/)
  assert.throws(
    () => createSyntheticBackupRehearsalManifest({ ...input, recoveryPointAt: 'not-a-time' }),
    /timestamp/i,
  )
  assert.throws(
    () => createSyntheticBackupRehearsalManifest({ ...input, recoveryPointAt: '2026-07-12T00:02:00.000Z', sha256: 'invalid' }),
    /sha256/i,
  )
})

test('synthetic backup rehearsal module has no database, filesystem, process, network, or storage integration', () => {
  for (const relativePath of [
    'scripts/security/production-backup-rehearsal/authorization.ts',
    'scripts/security/production-backup-rehearsal/manifest.ts',
  ]) {
    const source = readFileSync(resolve(root, relativePath), 'utf8')
    assert.doesNotMatch(source, /node:(fs|child_process|http|https|net)|Prisma|fetch\(|mariadb|mysql|S3|spawn\(/i)
  }
})
