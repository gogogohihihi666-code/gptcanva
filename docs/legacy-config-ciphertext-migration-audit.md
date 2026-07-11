# Legacy Configuration Ciphertext Migration Audit

Date: 2026-07-11

Scope: Provider and Object Storage configuration ciphertext only.

## Constraints

- No production database, backup, real Provider, or Object Storage was accessed.
- No ciphertext, key material, legacy fallback value, fingerprint, endpoint, bucket, or credential value was read or recorded.
- No runtime crypto behavior, database record, Prisma migration, seed, deployment, or GitHub remote was changed by this audit.

## Evidence Sources

| Source | Evidence |
|---|---|
| `prisma/schema.prisma` | Current persistent models and encrypted field names. |
| `prisma/migrations/202604260001_init/migration.sql` | Original Provider configuration and Object Storage ciphertext columns. |
| `server/provider-config/service.ts` | Provider create, update, read, legacy materialization, and delete flows. |
| `server/storage-config/service.ts` | Storage create, update, read, activation, and upload configuration flows. |
| `server/provider-config/crypto.ts` and `server/storage-config/crypto.ts` | Current compatible ciphertext parsing and decryption behavior. |
| `git log --follow` for the crypto files | Fallback logic introduction and removal commits. |

## Persistent Ciphertext Inventory

| Scope | Data model | Ciphertext field | Create or update path | Read or decrypt path | Delete path |
|---|---|---|---|---|---|
| Provider legacy configuration | `AiProviderConfig` / `ai_provider_configs` | `apiKeyEncrypted` | Historical Provider configuration create and update flow | Legacy materialization and historical configuration reads | No direct delete path found in the current Provider service. |
| Provider current configuration | `AiProvider` / `ai_providers` | `apiKeyEncrypted` | `createProvider`, `updateProvider`, legacy materialization | `getProviderDetail`, runtime Provider resolution, research Provider resolution | `deleteProvider` |
| Object Storage | `ObjectStorageConfig` / `object_storage_configs` | `accessKeyEncrypted`, `secretKeyEncrypted` | `createObjectStorageConfig`, `updateObjectStorageConfig` | List hints, active configuration resolution, upload configuration construction | No direct delete path found in the current Storage service. |

No encrypted JSON field, import flow, export flow, backup-copy flow, or fixture write using the crypto helpers was found in the audited paths. Provider legacy materialization copies an existing ciphertext field into the current Provider table without decrypting or re-encrypting it.

## Fallback Lifecycle

| Commit | Title | Path | Behavior |
|---|---|---|---|
| `3ce1b73` | `feat(配置): 接入厂商配置与对象存储上传` | Provider and Storage crypto modules | Introduced both configuration crypto modules, persistent write paths, and source-level fallback behavior. |
| `1abd175` | `fix(config): fail closed provider and storage secrets` | Provider and Storage crypto modules, production preflight | Removed source-level fallbacks and added current/previous key validation. |

The source fallback branch was reachable whenever the corresponding environment variable was absent. Historical code did not restrict that behavior by runtime environment. Administrator configuration saves therefore could have created persistent ciphertext under the fallback path in development, test, or a deployed runtime that lacked explicit configuration keys.

No repository evidence proves that a real deployment or a real configuration save used this branch. Database-level presence remains `NOT_VERIFIED`.

## Format Compatibility

Status: `FORMAT_COMPATIBLE`

| Layer | Historical and current behavior |
|---|---|
| Algorithm | AES-256-GCM |
| Key derivation | SHA-256 digest of the selected secret material |
| IV | 12-byte random IV |
| Authentication tag | Node GCM default tag behavior with `getAuthTag` and `setAuthTag` |
| Encoding | Base64 for all three binary parts |
| Serialization | `iv.tag.payload` string with `.` separator |
| Empty value | Provider returns null for empty encryption input and empty string for empty decryption input. Storage returns empty string for both empty encryption and empty decryption input. |
| Invalid ciphertext | Both modules reject malformed three-part strings. Current code also rejects values that cannot be authenticated by current or previous keys. |

The current implementation adds previous-key decryption attempts while retaining the same ciphertext format. The format does not carry a key version, key identifier, or scope marker.

## Key Compatibility

Current and previous keys are scope-specific. Current keys encrypt new values. Previous keys only participate in decryption during an approved rotation window. Production preflight rejects missing, weak, placeholder, legacy fallback, and duplicate material across Provider and Storage scopes.

Legacy fallback ciphertext cannot be read by a compliant current production configuration. The legacy fallback value is prohibited as either current or previous material. This is intentional because preserving a known source-level fallback as a production key would retain the original security exposure.

No controlled offline migration command exists today.

## Historical Data Risk

Classification: `POSSIBLE`

Evidence supporting this classification:

- A persistent Provider create and update path existed during the fallback interval.
- A persistent Storage create and update path existed during the fallback interval.
- Storage could inherit the Provider key through historical fallback resolution.
- Provider legacy materialization can copy an old ciphertext into the current Provider table.
- No production database, deployment execution record, or encrypted record inventory was examined.

This evidence does not confirm real affected rows. It establishes that affected rows could exist. Production release preparation therefore requires an offline inventory before declaring configuration encryption migration complete.

## Required Offline Migration Design

This design is intentionally not implemented by the current audit.

1. Obtain explicit authorization, verified backup, restore rehearsal evidence, and a maintenance window.
2. Run a read-only inventory against an approved non-production restore or an explicitly authorized production maintenance target. Report counts by table and field only.
3. Use an isolated migration process that receives legacy decryption material from an approved secret system. The material must never enter repository files, runtime production configuration, logs, reports, or command history.
4. For each non-empty field, parse the three-part ciphertext, attempt legacy decryption in memory, then encrypt the plaintext with the new scope-specific current key.
5. Preserve the original ciphertext in an encrypted rollback export outside the application database. Do not overwrite a row until the new ciphertext passes an in-memory decryptability check.
6. Update in small transactional batches. Record row identifiers only in protected migration audit storage, with counts and outcomes in general operational logs.
7. Cover `AiProviderConfig.apiKeyEncrypted`, `AiProvider.apiKeyEncrypted`, `ObjectStorageConfig.accessKeyEncrypted`, and `ObjectStorageConfig.secretKeyEncrypted` independently.
8. Re-run the read-only inventory. Verify no legacy-decryptable ciphertext remains in scope, verify current-key decryptability, then remove the isolated legacy material.
9. Retain the rollback export until the approved retention window closes. Do not add the legacy value to production current or previous variables.

## Release Gate

Before production release, the team must complete either:

- an authorized offline inventory proving zero affected rows, or
- an authorized offline re-encryption with backup, rollback evidence, count-level audit evidence, and post-migration validation.

No real Provider, Object Storage, payment, AI Provider, or deployment smoke is part of this gate.
