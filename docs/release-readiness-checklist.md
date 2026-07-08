# Release Readiness Checklist

Date: 2026-07-08

This checklist defines the work that must be completed before moving the current local no-call MVP toward any remote push, real provider smoke, real payment validation, storage smoke, or production deployment.

## Current Frozen Version

- Current HEAD: `5dc92b0`.
- Current status: local no-call MVP frozen.
- GitHub push status: not pushed.
- Deployment status: not deployed.
- Real external calls: not performed.
- Real payment calls: forbidden.
- Real AI Provider calls: forbidden.
- Real OSS / S3 upload, read, delete, and signed URL tests: forbidden.

The frozen local state has passed the authorized no-call checks, including backend/admin no-call flows, `/generate` no-call guidance, `/account` demo user acceptance, and local demo fixture seed / clean.

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
