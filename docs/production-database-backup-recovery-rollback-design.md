# Production Database Backup, Recovery, And Rollback Design

Date: 2026-07-12

## Status And Scope

Status: `DESIGN_ONLY_HUMAN_GATE_REQUIRED`.

This design covers the production MariaDB database used by the application. It does not configure a backup destination, create credentials, connect to a production database, run a backup, restore data, apply Prisma migrations, or deploy an application image.

Object Storage objects, source control, Docker images, and third-party Provider data have separate backup responsibilities. A database backup can preserve object metadata, but it cannot restore an object whose storage provider has lost it.

## Recovery Targets

| Target | Approved value | Measurement |
|---|---:|---|
| Recovery point objective (RPO) | 4 hours | The latest restorable database state is no more than four hours behind the incident declaration time. |
| Recovery time objective (RTO) | 4 hours | From incident approval to a healthy application using the approved restored database state. |

The current 2 vCPU, 2 GB RAM, 30 GB disk, and 5 Mbps VPS profile is suitable only while the measured restore rehearsal remains within these targets. A failed rehearsal, disk pressure, or database growth beyond the measured capacity blocks production readiness until the plan is resized.

## Existing Controls And Gaps

Existing controls:

- Application startup does not run Prisma migrations, database push, seed, or fixtures automatically.
- `db:migrate:production` requires production mode, an explicit migration gate, and a backup-verification gate.
- Prisma migrations are append-only deployment artifacts. No automated schema downgrade path exists.

Missing controls:

- No scheduled database backup implementation.
- No encrypted off-host backup destination.
- No backup manifest or integrity verification record.
- No isolated restore runbook or restore rehearsal evidence.
- No retention, disk-capacity, escalation, or rollback authorization contract.

## Design Decisions

### Backup Layers

Use two layers after separate implementation authorization:

1. A consistent full logical MariaDB backup at least once every 24 hours.
2. Binary-log archives copied to the protected off-host destination at least once every hour.

The full backup provides a known baseline. Binary logs allow recovery from that baseline to a point close to the incident. The hourly archive cadence provides margin against the approved four-hour RPO.

The future backup command must use an InnoDB-consistent method such as `mariadb-dump --single-transaction` only after confirming the production tables are eligible for that method. It must include schema, data, triggers, routines, and events where the deployment uses them. It must never print database URLs, passwords, dump contents, or binary-log contents.

### Storage And Encryption

- The primary backup copy must leave the application VPS. A backup on the same 30 GB disk does not meet this design.
- The destination may be an approved encrypted object store, a managed backup service, or a separately administered backup server. Provider choice needs a later authorization.
- Encrypt backups before or during transfer. Store encryption keys in a secret manager independent from the application database password and independent from Provider and Storage configuration secrets.
- Keep backup manifests and general logs count-only. A manifest may record UTC time, backup ID, size, hash, MariaDB version, schema migration state, and binary-log range. It must not contain connection strings, credentials, table contents, tokens, or user data.

### Retention And Capacity

Initial proposed retention, subject to measured database size and backup-destination capacity:

| Copy | Retention | Purpose |
|---|---:|---|
| Local encrypted staging copy | 48 hours maximum | Transfer retry only; delete after verified off-host receipt. |
| Off-host daily full backup | 35 days | Operational recovery. |
| Off-host weekly full backup | 12 weeks | Delayed incident discovery. |
| Binary logs | At least 48 hours after the associated full backup is verified | Point-in-time recovery window. |

The implementation must reserve enough free VPS disk for the application, database, temporary dump, and binary logs. It must stop before disk exhaustion and alert before the configured free-space threshold. The threshold, dump size limit, and transfer rate must be based on the first isolated rehearsal, not guessed from VPS capacity alone.

## Authorization Gates

The following are proposed gates for a later implementation. They are documentation only in this task and do not exist as active runtime variables.

| Gate | Required human evidence | Permitted action |
|---|---|---|
| Backup job enablement | Destination ownership, encryption key custody, retention approval, service account review | Schedule backup only. |
| Restore rehearsal | Isolated target proof, no-route-to-production proof, approved backup ID, maintenance owner | Restore into a disposable non-production database only. |
| Production incident restore | Incident ID, two-person approval, chosen recovery point, customer-impact approval | Restore or point-in-time recovery against production. |
| Production migration | Verified backup ID and a passing isolated restore rehearsal within the approved freshness window | Existing migration gate may be enabled for one authorized run. |

The backup operator, restore operator, and approving incident owner should be distinct people when staffing permits. A restore target must use separate credentials and a distinct database identity. It must not reuse the production application account.

## Backup Run Contract

Each future backup run must:

1. Verify that it is running in the approved production backup context and that the destination is off-host.
2. Use a dedicated minimum-privilege database account. The exact privileges require a MariaDB-version and backup-tool review before implementation.
3. Capture the full backup and the relevant binary-log coordinates without logging data values.
4. Encrypt and transfer the artifact.
5. Verify receipt, size, and cryptographic hash at the destination.
6. Write a redacted manifest and success or failure outcome to protected operational records.
7. Remove expired local staging artifacts only after off-host verification succeeds.
8. Alert on failure, missing cadence, low disk, hash mismatch, destination capacity, or elapsed time that threatens RPO.

A failed backup must preserve prior known-good backups. It must not overwrite them.

## Isolated Restore Rehearsal

Run at least monthly and before every authorized production migration that changes schema or high-value data behavior.

1. Select a verified backup and its associated binary-log range.
2. Provision an isolated disposable MariaDB target through a separately authorized process.
3. Prove the target cannot route to production hosts, production credentials, production object storage, payment, AI Provider, or email/SMS services.
4. Restore the full backup and apply binary logs only through the pre-approved recovery point.
5. Validate backup hash, restore command outcome, database engine health, schema migration state, and non-sensitive table-level count checks.
6. Start an application process only with all real-call gates closed. Run authorized local health and readonly checks.
7. Measure elapsed restore time and data age. Record whether RPO <= 4 hours and RTO <= 4 hours.
8. Destroy the isolated restore target and its temporary decrypted artifacts under the approved retention and deletion policy.

The rehearsal report must contain only backup IDs, UTC timestamps, durations, version identifiers, counts, status, and approver identities. It must not include database URLs, credentials, user records, provider configuration, raw payloads, or decrypted data.

## Production Incident Recovery

Production restore requires a separately authorized incident procedure. The default sequence is:

1. Declare the incident and freeze application writes.
2. Select the approved full backup and point-in-time target.
3. Preserve relevant application and database audit evidence without copying secrets or raw user data into the incident record.
4. Restore under two-person approval.
5. Validate database health, migration state, critical readonly checks, and no-call gates before reopening writes.
6. Record actual RPO and RTO, then conduct a follow-up review.

No restore should silently replace a running production database. The chosen recovery point and expected data-loss window require explicit approval.

## Application And Database Rollback

| Condition | Recovery approach |
|---|---|
| Application-only regression with schema compatibility | Deploy the previously verified immutable image after approval. |
| Migration failure before data-impacting change | Stop migration, retain the verified backup, and use a reviewed forward-fix or restore decision. |
| Migration completed with data or schema impact | Prefer a reviewed forward-fix. Use backup and point-in-time recovery only through the incident restore gate. |
| Database corruption or accidental destructive write | Freeze writes and restore to the approved point in time. |

Prisma migration files do not provide a general automatic rollback mechanism. Every future migration must declare whether rollback uses application image reversal, forward-fix, or backup restoration.

## Acceptance Evidence

The design becomes operationally accepted only when all items are recorded:

- Off-host encrypted destination approved and tested.
- Minimum-privilege backup and restore accounts reviewed.
- Full backup receipt and hash verification pass.
- Binary-log archival cadence meets the four-hour RPO.
- Isolated restore rehearsal passes without production connectivity.
- Measured restore duration is at most four hours.
- Measured recoverable data age is at most four hours.
- Disk, backup failure, destination capacity, and missed-cadence alerts are tested.
- Rollback decision owner and incident authorization contacts are recorded outside this repository.

## Explicit Non-Goals

- No production database connection.
- No backup, restore, migration, seed, fixture, or deletion command.
- No external storage account, bucket, key, credential, or secret configuration.
- No deployment, GitHub workflow dispatch, payment call, AI Provider call, or Object Storage upload.

## Follow-Up Tasks

1. Implement a synthetic-only backup manifest and authorization validator with no database or storage access.
2. Approve a backup destination and secret-management design.
3. Implement backup and restore tooling in separate, reviewable commands with dry-run and isolated-target guards.
4. Run an authorized isolated restore rehearsal.
5. Update the production migration gate to require a fresh passing rehearsal reference, not only a manually asserted backup flag.
