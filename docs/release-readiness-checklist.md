# Release Readiness Checklist

`HUMAN_GITHUB_ENVIRONMENT_APPROVAL_CONFIGURATION_REQUIRED`

The production deployment workflow references the GitHub `production` environment. Required reviewers and environment protection rules must be configured manually in the GitHub repository settings before any deployment is authorized.

Date: 2026-07-11

This checklist defines the work that must be completed before moving the current local no-call MVP toward any remote push, real provider smoke, real payment validation, storage smoke, or production deployment.

Last domain and brand update: 2026-07-09.

Last frozen baseline update: 2026-07-11.

## Current Frozen Version

- Current frozen code baseline: `7527333`.
- Documentation commits after this point record the baseline only and do not alter its code acceptance conclusion.
- Current status: local no-call MVP frozen.
- GitHub push status: not pushed.
- Deployment status: not deployed.
- Real external calls: not performed.
- Real payment calls: forbidden.
- Real AI Provider calls: forbidden.
- Real OSS / S3 upload, read, delete, and signed URL tests: forbidden.

The frozen local state has passed the authorized no-call checks, including backend/admin no-call flows, `/generate` no-call guidance, `/account` demo user acceptance, readonly generation history and result details, local demo fixture seed / clean, user-facing payment parked UI, dev server env bootstrap, OKWook brand integration, and anonymous authentication-route acceptance.

Latest frozen-baseline regression evidence at `7527333`:

- `npm.cmd run test`: PASS, 76 tests passed.
- `npm.cmd run build:service`: PASS.
- `npm.cmd run build`: PASS.
- First `npm.cmd run seed:no-call-demo`: PASS, `createdTotal=37`.
- Second `npm.cmd run seed:no-call-demo`: PASS, `createdTotal=0`, `updatedTotal=37`.
- `npm.cmd run seed:no-call-demo:clean`: PASS, `removedTotal=37`, `preservedNonDemoRecords=true`.
- `5409 /api/system-init/status`: PASS, returned 200 JSON.
- `5010 /api/system-init/status`: PASS, returned 200 JSON.
- `5010 /`: PASS, did not redirect to `/install`.

Additional modules included in the frozen baseline:

- User-facing plan, membership, and point recharge payment parked UI.
- Parked state does not create a real payment order or local order.
- Parked state does not open `ScanPayModal`.
- Parked state does not call `purchaseMembership` or `purchaseRecharge`.
- Parked state does not grant membership or add points.
- `dev:server` loads `.env.development` for local development.
- `DATABASE_URL` is loaded before the Prisma phase without printing the value.
- Production mode refuses the dev env bootstrap path.
- `/account` readonly generation history, result placeholders, and task details are accepted without result URL loading or task mutation.
- Fixture coverage includes `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, and `STOPPED` generation states.
- Fixture reuses an existing local ordinary user, preserves that user during clean, and explicitly refuses an administrator email collision.
- Account task content-width chain is accepted at 390px: 390px global shell, 314px task content/card, 284px action, fully visible 49px status label, and `scrollWidth/clientWidth = 390/390` without relying on clipping to hide an oversized layout.
- Dark-theme generation detail dialog contrast is accepted; the 1280px desktop layout remains accepted.
- OKWook and `www.okwook.com` user-visible brand integration is accepted for local no-call use.
- Anonymous `/` acceptance: the approved brand, Chinese and English slogans, and domain are present; only ordinary-user phone/email verification-code login is shown; no administrator account field or `ADMIN_PASSWORD` is displayed.
- `/login` acceptance: the independent route opens a usable ordinary-user login UI, defaults to phone verification-code login, supports phone/email switching, and restores its context after refresh.
- `/register` acceptance: the independent route opens a usable ordinary-user entry; it states that first verification-code login creates the account, supports phone/email switching, has an operable agreement checkbox, exposes no administrator fields, adds no registration API, preserves `allowSignUp`, and does not bypass verification.
- Anonymous `/account` acceptance: `mode=user` and safe redirects are retained for `/account` and `/account?tab=tasks`, including after refresh.
- Administrator route-context acceptance: `/admin/dashboard`, `/admin/providers`, `/admin/storage`, `/admin/provider-health`, `/admin/orders`, `/admin/generations`, and `/admin/audit-logs` retain `mode=admin` and their original safe redirect. Unauthenticated visitors do not see administrator content; the administrator entry does not substitute ordinary-user login inputs; refresh retains the context; `mode=admin` does not grant administrator permission; the ordinary-user administrator guard remains effective.
- Redirect validation accepts only safe same-origin paths and rejects external HTTPS targets, double-slash targets, encoded double-slash targets, `javascript:` targets, and other malicious external redirects.
- `/install` acceptance: after initialization it returns safely to `/`, does not present a re-initialization form, and does not trigger initialization writes.
- Mobile route acceptance: `/`, `/login`, and `/register` PASS at 390px with `scrollWidth/clientWidth = 390/390`; login and registration dialogs have approximately 374px visible width.

## Brand And Domain Record

Current approved brand and domain notes:

- Primary domain: `www.okwook.com`.
- DNS nameservers: `a.share-dns.com`, `b.share-dns.net`.
- English slogan: "Confront It OK. Astonish It Wo. Command It OK."
- Chinese slogan: "直面挑战，震撼全场，掌控一切。"

These values are recorded for release planning only. This document update does not configure DNS, request certificates, change production environment variables, deploy the application, or open any real payment, AI Provider, storage, or generation gate.

## Release Entry Requirements

Before release work can begin, complete and record the following:

- Fix GitHub HTTPS credentials.
- Perform an ordinary `git push origin master` only after explicit authorization.
- Confirm remote commit alignment after push.
- Review production environment variables.
- Check database migrations against the production target.
- Document the production backup strategy.
- Document the production rollback strategy.
- Configure domain, HTTPS, and reverse proxy routing.
- Configure logs, retention, and alerting.
- Check administrator account security, including password policy and access scope.
- Complete a separately authorized authenticated-administrator brand-shell acceptance if it is required before release.

## Domain Go-Live Checklist

Domain setup is not performed in this no-deploy documentation task. Before go-live, complete and record each item:

- Confirm DNS resolution for `www.okwook.com`.
- Decide and document the root-domain strategy for `okwook.com`, including whether it redirects to `www.okwook.com`.
- Confirm `www` and root-domain redirect behavior in both HTTP and HTTPS.
- Request and install the HTTPS certificate only in an authorized deployment task.
- Configure reverse proxy routing for frontend traffic and API traffic.
- Decide whether HSTS is enabled at launch, including preload posture and rollback implications.
- Set production `FRONTEND_URL` in the approved secret or environment system.
- Set production `API_BASE_URL` in the approved secret or environment system.
- Confirm payment webhook callback domain and path before any payment sandbox or production payment work.
- Confirm email sending domain, SPF, DKIM, and DMARC before production email sending.
- Confirm CORS allowlist includes only the intended production origins.
- Confirm logs do not print tokens, cookies, authorization headers, API keys, certificates, webhook secrets, signed URLs, base64 payloads, bucket-sensitive values, endpoint-sensitive values, or raw provider responses.

## GitHub Push Checklist

Current state:

- Multiple local commits have not been pushed.
- Force push is forbidden.
- Tag push, backup push, mirror push, and broad remote updates are forbidden.

Before any push:

- Obtain explicit authorization for GitHub push.
- Repair credentials without printing tokens, cookies, passwords, or secrets.
- Run `git status --short` and confirm the working tree is clean.
- Run `git log --oneline origin/master..HEAD` and review the exact outgoing commits.
- Run `git push --dry-run origin master`.
- Proceed only with ordinary `git push origin master` after dry-run passes.
- Do not use `--force`, `--force-with-lease`, `--tags`, `--mirror`, or broad refspecs.

After push:

- Confirm local HEAD and remote branch point at the intended commit.
- Confirm no production secret files were pushed.
- Record the pushed commit range.

## Production Environment Checklist

Before deployment:

- Confirm all required production environment variables are present in the approved secret store.
- Confirm `.env.production` and real secret files are not tracked by Git.
- Confirm no local demo fixture gate is enabled.
- Confirm no no-call demo seed script is configured to run in production.
- Confirm production database connection, Redis connection, and storage settings are isolated from local development.
- Confirm administrator bootstrap or system-init behavior cannot overwrite an existing production administrator.
- Confirm logs redact tokens, cookies, passwords, API keys, certificates, webhook secrets, signed URLs, bucket-sensitive values, endpoint-sensitive values, base64 payloads, and raw provider responses.

## Production Startup and Migration Controls

The production application startup command runs configuration preflight and then starts the service. It does not run Prisma migration, database push, seed, or demo fixture commands automatically.

Before a separately authorized production migration:

1. Complete and verify the database backup.
2. Set `NODE_ENV=production` in the approved secret or environment system.
3. Temporarily set `OKWOOK_ALLOW_PRODUCTION_MIGRATION=1` and `OKWOOK_PRODUCTION_BACKUP_VERIFIED=1` only in the authorized migration process.
4. Run `npm.cmd run db:migrate:production` and record only the command outcome, never database connection details.
5. Verify the migration outcome, then reset both migration authorization variables to `0` or remove them.
6. Run production startup preflight, start the application, and perform only authorized health checks.

Production preflight must fail before binding a port when any of these conditions is unmet:

- `DATABASE_URL`, `SERVER_PORT`, or a strict HTTPS `CORS_ALLOWED_ORIGINS` allowlist is missing or invalid.
- A local, demo, payment simulation, real Provider, real storage, or debug-header gate is enabled.
- Verification-code login has no real, separately authorized delivery adapter. The current no-call baseline intentionally has no such adapter, so production verification-code login remains unavailable.

`allowAutoFill` and debug verification-code responses are forcibly disabled in production. This task neither configures nor calls a real SMS or email delivery provider.

## Configuration Encryption Secret Controls

Provider and Object Storage configuration use separate current encryption keys. Production startup preflight rejects missing, weak, placeholder, known legacy fallback, or duplicate key material before the application binds a port.

- `PROVIDER_CONFIG_SECRET` and `STORAGE_CONFIG_SECRET` must be independently generated strong values in the approved secret system.
- `PROVIDER_CONFIG_SECRET_PREVIOUS` and `STORAGE_CONFIG_SECRET_PREVIOUS` are optional decrypt-only rotation values.
- A previous key may be present only during an authorized rotation window. It must differ from every active key in both scopes.
- New ciphertext always uses the current key while existing ciphertext may be read with the previous key during the rotation window.
- The current ciphertext format has no embedded key version. Do not delete a previous key until a separately authorized read verification and migration plan has completed.
- Legacy fallback ciphertext requires a dedicated compatibility and re-encryption task. This task does not connect to a production database, modify stored ciphertext, or run bulk re-encryption.

## Database Migration Checklist

Before production migration:

- Review the exact Prisma migration files to be applied.
- Confirm the production database backup has completed.
- Confirm restore procedure has been rehearsed.
- Confirm migration rollback or mitigation plan is documented.
- Run migration checks in a staging or disposable environment first.
- Confirm demo fixture data cannot be seeded into production.
- Confirm no migration changes unique administrator points, real user balances, real orders, or real generation tasks without approval.

## Backup And Rollback Checklist

Before first production deploy:

- Create a database backup.
- Verify backup integrity.
- Rehearse restore into a non-production target.
- Document application rollback steps.
- Document database rollback or forward-fix strategy.
- Preserve the previous deploy artifact or image.
- Define the rollback trigger conditions.
- Define who can authorize rollback.

## Payment Launch Checklist

Current state:

- Payment Provider is parked.
- Real payment is forbidden.
- Direct production payment is forbidden.

Before any payment launch:

- Obtain explicit authorization for payment sandbox validation.
- Run payment sandbox preflight first.
- Configure only sandbox credentials in an approved secret store.
- Do not print merchant IDs, private keys, certificates, webhook secrets, authorization headers, signatures, raw payloads, or provider responses.
- Execute one controlled sandbox payment.
- Verify webhook signature validation.
- Verify webhook idempotency.
- Verify order state transition.
- Verify benefit grant.
- Verify point recharge or membership activation.
- Verify payment failure state.
- Verify refund or failed order state where supported.
- Verify repeated webhook delivery does not duplicate points, membership, benefit grants, or audit logs.
- Restore payment gates to the intended state after the smoke.

Before production payment:

- Review sandbox evidence.
- Review logging redaction.
- Review reconciliation process.
- Review customer support and refund procedure.
- Obtain a separate production-payment authorization.

## AI Provider Smoke Checklist

Current state:

- AI Provider real smoke has not been executed.
- Real AI Provider calls are forbidden.

Before any AI Provider smoke:

- Obtain explicit authorization for the smoke.
- Name the exact Provider.
- Name the exact model.
- Name the test user.
- Define maximum call count.
- Define maximum cost exposure.
- Define whether test points may be deducted.
- Define whether test results may be uploaded to storage.
- Keep Provider, model, and storage gates closed except for the narrow authorized smoke window.
- Do not print API keys, tokens, authorization headers, signed URLs, base64 payloads, raw request bodies, or raw provider responses.
- Confirm the generated task is clearly marked as a test.
- Confirm failure handling and audit logs remain redacted.
- Restore the Provider gate immediately after smoke.

## OSS / S3 Upload Checklist

Current state:

- Real OSS / S3 upload has not been executed.
- Real storage upload, read, delete, and signed URL tests are forbidden.

Before storage smoke:

- Obtain explicit authorization for real storage smoke.
- Use a dedicated test bucket or test prefix.
- Define the exact object key prefix and cleanup scope.
- Verify `PutObject` with a harmless test object.
- Verify `GetObject` only for the test object.
- Verify `DeleteObject` only for the test object.
- Verify signed URL generation only if separately authorized.
- Do not print access keys, secret keys, bucket-sensitive values, endpoint-sensitive values, signed URLs, base64 payloads, or raw storage responses.
- Restore storage gate immediately after smoke.
- Confirm test objects are cleaned up.

## Deployment Checklist

Deployment is forbidden until separately authorized.

Before deployment:

- Complete the GitHub push checklist.
- Confirm the intended branch and commit are pushed.
- Confirm production environment variables are complete.
- Confirm DNS resolution and root-domain redirect strategy are complete.
- Confirm HTTPS certificate and reverse proxy routing are complete.
- Confirm production `FRONTEND_URL`, production `API_BASE_URL`, payment webhook domain, email sending domain, and CORS allowlist are complete.
- Confirm local demo fixture gate is disabled.
- Confirm no no-call demo seed runs in production.
- Confirm `.env.production` is not committed.
- Confirm production database backup is complete.
- Confirm rollback steps are documented.
- Confirm health checks are configured.
- Confirm logs and alerts are configured.
- Confirm first deploy validation is limited in scope.
- Confirm no real Provider, payment, or storage gate is opened unless separately authorized.

After deployment:

- Run only the authorized health checks.
- Verify system-init does not redirect unexpectedly.
- Verify admin login and least-privilege access.
- Verify read-only admin pages load.
- Verify `/generate` remains in the intended gate state.
- Verify no unexpected payment, Provider, storage, email, SMS, or webhook calls occur.

## Current Forbidden Actions

The following remain forbidden unless a later task grants explicit, narrow authorization:

- Real payment calls.
- Real AI Provider calls.
- Real OSS / S3 uploads, reads, deletes, or signed URL tests.
- Deployment.
- GitHub push.
- Force push.
- Printing tokens, secrets, cookies, API keys, certificates, webhook secrets, bucket-sensitive values, endpoint-sensitive values, signed URLs, base64 payloads, raw payloads, raw provider responses, or raw storage responses.
- Opening real payment, Provider, storage, or generation gates.
- Creating real production generation tasks.
- Deducting real user or administrator points.
- Running demo fixture seed in production.

## Recommended Release Sequence

1. Keep local development under no-call constraints.
2. Fix GitHub credentials in a separately authorized task.
3. Run the GitHub push checklist and perform an ordinary push only after dry-run passes.
4. Run production environment, migration, backup, and rollback checks.
5. Perform payment sandbox validation in a separate authorized task.
6. Perform AI Provider smoke in a separate authorized task.
7. Perform OSS / S3 smoke in a separate authorized task.
8. Deploy only after push, env, migration, backup, rollback, smoke, and logging checks are complete.
