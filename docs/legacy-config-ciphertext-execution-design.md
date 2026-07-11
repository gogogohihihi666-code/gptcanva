# Legacy Configuration Ciphertext Execution Design

Date: 2026-07-11

## Purpose

This document defines a future offline process for inventorying and, only with separate authorization, re-encrypting historical Provider and Object Storage configuration ciphertext.

Runtime baseline: `1abd175`

Audit evidence: `docs/legacy-config-ciphertext-migration-audit.md`

Historical risk classification: `POSSIBLE`
Database-level existence: `NOT_VERIFIED`

This document designs a tool. It does not create a tool, database connection, runtime API, administrator page, migration, seed, fixture, or deployment behavior.

## Isolation Model

The future tool belongs under `scripts/security/legacy-config-ciphertext/` with separate modules for CLI validation, inventory, classification, reporting, database access, and re-encryption.

The tool must remain outside these paths and flows:

- `server/index.ts`
- `scripts/start-production.mjs`
- normal Prisma migration commands
- application HTTP routes
- administrator pages
- GitHub push workflows

The default command mode is read-only inventory. A write-capable command requires a separately selected mode and all write authorization gates.

## Scope Inventory

| Scope | Table | Field | Inventory unit | Re-encryption unit |
|---|---|---|---|---|
| Provider legacy configuration | `ai_provider_configs` | `api_key_encrypted` | one field | one field |
| Provider current configuration | `ai_providers` | `api_key_encrypted` | one field | one field |
| Object Storage | `object_storage_configs` | `access_key_encrypted` | one field | one field |
| Object Storage | `object_storage_configs` | `secret_key_encrypted` | one field | one field |

Both Provider tables require independent counts and independent handling. A copied ciphertext can exist in both tables. Content equality never authorizes deduplication or skipping a physical record.

## Key Material Boundary

The future offline process receives six isolated roles from an approved secret system:

- Provider current
- Provider previous
- Provider legacy decrypt-only
- Storage current
- Storage previous
- Storage legacy decrypt-only

Rules:

- No secret is accepted through CLI arguments, command history, temporary files, reports, or shell tracing.
- Legacy decrypt-only material exists only in the isolated offline process.
- Legacy material performs decryption only.
- Current material performs new encryption only.
- Previous material performs rotation-window decryption only.
- Every key role remains distinct across Provider and Storage scopes.
- Process exit clears in-memory references through normal process termination and leaves no persisted secret artifact.
- Logs, exceptions, and reports contain neither values, fragments, lengths, hashes, nor fingerprints.

The future tool should extract or reuse a pure AES-256-GCM format primitive. That primitive receives explicit in-memory key material and preserves the established 12-byte IV and Base64 three-part format. It must not import runtime fallback resolution or reintroduce a legacy fallback into the online application.

## Phase A Read-Only Inventory

### Authorization

Required gate:

```text
OKWOOK_ALLOW_LEGACY_CONFIG_INVENTORY=1
```

Only the exact string `1` authorizes inventory. Missing, empty, or alternate truthy values terminate before database access. The gate value is never logged.

### Database Boundary

- Use a dedicated read-only database account with `SELECT` limited to the three target tables.
- Start a read-only transaction where the database supports it.
- Disable query parameter logging.
- Do not run Prisma migration, seed, fixture, business services, Provider calls, Storage calls, or upload code.
- Do not alter `updated_at`, row state, configuration activation, or any business table.

### Field Classification

Each non-empty field receives exactly one classification:

| Classification | Definition | Phase B eligibility |
|---|---|---|
| `EMPTY` | Empty value accepted by the field contract | No write |
| `INVALID_FORMAT` | Value fails the established three-part Base64 format check | Manual review |
| `CURRENT_DECRYPTABLE` | Only the scope current key decrypts the value | No write |
| `PREVIOUS_DECRYPTABLE` | Current fails and scope previous succeeds | No write unless a separate current-key rotation is authorized |
| `LEGACY_FALLBACK_DECRYPTABLE` | Current and previous fail, legacy decrypt-only succeeds | Eligible for Phase B |
| `UNDECRYPTABLE` | No permitted key decrypts the value | Manual review |
| `MULTIPLE_KEY_MATCH` | More than one permitted key decrypts the value | Manual review |

Classification relies on authenticated decryption attempts. It never infers status from a prefix, an error message, a field length, or a ciphertext appearance.

### Storage Row Summary

`object_storage_configs` receives an additional row summary:

- `BOTH_CURRENT`
- `BOTH_LEGACY`
- `PARTIAL_LEGACY`
- `PREVIOUS_ONLY`
- `MIXED_KEYS`
- `HAS_INVALID_FIELD`
- `HAS_UNDECRYPTABLE_FIELD`
- `EMPTY`

`PARTIAL_LEGACY` permits field-level re-encryption only for the confirmed legacy field. A current-decryptable sibling remains untouched. Any invalid, undecryptable, or multiple-match field blocks automatic writes for that field.

### Safe Report Contract

Phase A writes a count-level report to protected operator storage. It contains:

- generated report identifier
- tool version and source commit
- approved environment class
- target table and field names
- counts by field classification
- counts by Storage row summary
- start and completion timestamps
- inventory authorization outcome
- zero affected fields decision or Phase B required decision

The report excludes row identifiers, ciphertext, plaintext, endpoint, bucket, database endpoint, database name, connection string, credentials, key material, key metadata, and query parameters.

## Phase B Controlled Re-encryption

Phase B starts only when Phase A reports one or more `LEGACY_FALLBACK_DECRYPTABLE` fields and a separate authorization is granted.

### Authorization Gates

All values must equal the exact string `1`:

```text
OKWOOK_ALLOW_LEGACY_CONFIG_REENCRYPT=1
OKWOOK_LEGACY_CONFIG_BACKUP_VERIFIED=1
OKWOOK_LEGACY_CONFIG_WRITE_FREEZE_VERIFIED=1
```

The process also requires one of these anti-miswrite controls:

- `OKWOOK_LEGACY_CONFIG_REPORT_ID` bound to the approved Phase A report
- `OKWOOK_LEGACY_CONFIG_EXPECTED_AFFECTED_FIELDS` matching the approved count exactly

Missing gates, non-exact values, absent report binding, count mismatch, or any report anomaly terminates before a write-capable database connection is opened.

### Write Isolation

- Use a separate least-privilege write account limited to the target columns in the three target tables.
- Exclude schema change privileges and all user, order, points, generation, payment, audit, and session tables.
- Freeze Provider and Storage configuration writes for the maintenance window before Phase B.
- Use bounded transactions and optimistic field conditions. The write condition protects against a changed ciphertext between inventory and update.
- Never call application configuration save services, Provider connectivity tests, Storage tests, uploads, or network clients.

### Per-field Procedure

1. Re-read the target field inside the controlled transaction.
2. Re-classify the field with current, previous, and legacy decrypt-only material.
3. Continue only for `LEGACY_FALLBACK_DECRYPTABLE`.
4. Decrypt in memory with scope legacy decrypt-only material.
5. Encrypt in memory with the scope current key.
6. Verify the newly produced ciphertext decrypts with the scope current key before the update.
7. Update only the selected field with an optimistic original-value condition.
8. Re-read and verify current-key decryptability after the update.
9. Emit counts and status codes only.

The procedure never overwrites a current-decryptable, previous-decryptable, invalid, undecryptable, or multiple-match field.

## Backup and Rollback

Phase B requires verified backup evidence before its write account is used.

- Preserve original ciphertext in an access-controlled rollback export outside normal application tables.
- Protect that export with independently managed migration backup controls.
- Retain it for the approved rollback window.
- A rollback restores only fields written by the approved report and uses the same optimistic protections.
- A failed post-write verification stops the batch and moves the affected field to manual review.

## Test Strategy

Before any authorized database use, test the future tool with synthetic keys and synthetic ciphertext only.

- Verify every field classification.
- Verify Provider and Storage scope separation.
- Verify current and previous behavior.
- Verify legacy decrypt-only behavior.
- Verify reports contain counts without protected data.
- Verify read-only mode emits zero writes.
- Verify each missing gate terminates before connection.
- Verify count mismatch, report mismatch, invalid format, undecryptable data, and multiple matches terminate safely.
- Verify rollback planning with synthetic affected fields.

## Release Decision

Production release receives one of two acceptable evidence paths:

1. Phase A reports zero legacy affected fields, zero invalid fields, zero undecryptable fields, and zero multiple-key matches.
2. Phase B completes with approved backup, frozen writes, count-level audit evidence, post-write current-key verification, rollback retention, and legacy material removal.

Until one path is complete, historical configuration ciphertext remains an unresolved production release gate.
