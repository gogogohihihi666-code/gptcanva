# AI Provider No-Call Preflight

This project keeps AI Provider and storage verification in no-call mode until a human operator explicitly authorizes a real smoke test.

## Current Phase Boundary

The current phase does not allow:

- Real Provider smoke tests.
- Real model calls.
- Real OSS or S3 uploads.
- Injection of real API keys into tracked files, logs, screenshots, docs, tests, or chat records.
- Creation of real generation tasks for provider verification.
- Point deduction for verifying real provider calls.
- Printing or exposing tokens, secrets, cookies, API keys, bucket names, endpoints, signed URLs, base64 payloads, certificates, provider raw responses, or raw payload JSON.

The current phase allows only no-call preflight checks.

## `/admin/provider-health`

`/admin/provider-health` is a readonly administrator health-check page.

It may:

- Read database configuration summaries.
- Read environment variable names and present / missing / placeholder status.
- Show whether provider, model, generation, worker, storage, and smoke gates are satisfied.
- Show no-call flags such as `willCallExternal=false`, `willCallProvider=false`, `willUploadStorage=false`, and `realProviderSmokeAllowed=false`.

It must not:

- Decrypt `apiKeyEncrypted`.
- Return real API keys or secret values.
- Call an AI Provider.
- Call provider connectivity test endpoints.
- Upload storage test files.
- Create generation tasks.
- Deduct or refund points.
- Modify Provider, Model, or Storage configuration.

## Allowed Display

The no-call preflight may display:

- `provider_code`
- `model_code`
- Environment variable names.
- Whether an environment variable is present.
- Whether an environment variable appears to be a placeholder.
- Whether `base_url` is empty or placeholder-like.
- `enabled`, `visible`, and `approved` status, if supported by the existing schema.
- Storage provider type.
- Whether a bucket or endpoint is configured, without exposing the real value.
- `willCallExternal=false`
- `willCallProvider=false`
- `willUploadStorage=false`
- `realProviderSmokeAllowed=false`

## Forbidden Display

The no-call preflight must not display:

- Plain API keys.
- Plain tokens.
- Plain secrets.
- Cookies.
- Authorization headers.
- Private keys.
- OSS access keys or secret keys.
- Signed URLs.
- Base64 images or payloads.
- `rawPayloadJson`.
- Provider raw responses.
- Certificate bodies.
- Webhook secrets.

## Editable Admin Pages

`/admin/providers` and `/admin/storage` are editable configuration pages. They are not no-call health-check pages.

Observed editable or high-risk entries:

- `/admin/providers`
  - Create, edit, and delete Provider configuration.
  - Create, edit, delete, enable, discover, and batch-import models.
  - Provider connectivity test through the existing test endpoint.
- `/admin/storage`
  - Create and edit storage configuration.
  - Activate a storage configuration.
  - Storage upload / delete connectivity test through the existing test endpoint.

During no-call phases, do not click test, save, create, delete, activate, discover, import, or enable controls on these pages unless a later task explicitly authorizes that exact operation.

## Real Smoke Unparking Conditions

A real AI Provider smoke test is allowed only after explicit human authorization in the task thread.

Before any real smoke:

- The authorization task name must be explicit.
- The Provider must be explicit.
- The model must be explicit.
- The maximum call count must be explicit and should default to one.
- Cost risk must be acknowledged.
- A test task and test user must be identified.
- Required gate environment variables must be set in a private environment or secret store.
- `/admin/provider-health` no-call preflight must pass.
- The operator must confirm that no key, signed URL, base64 payload, raw provider response, certificate body, or secret value will be printed.
- The operator must confirm that the gate will be restored immediately after the smoke test.

## Human Authorization Template

```text
I explicitly authorize one AI Provider real smoke test.
Provider: <provider_code>
Model: <model_code>
Test user: <test_user_id>
Allow creation of a test generation task: true
Allow deduction of test points: true / false
Allow upload of test result to storage: true / false
Allow real Provider call: true
Maximum call count: 1
Restore gate immediately after completion: true
Do not print keys, signed URLs, base64, raw responses, certificates, or secret values: true
Allow git push: false
Allow deployment: false
Operator:
Authorization expires at:
```

No field in this template should contain an API key, token, private key, certificate body, signed URL, webhook secret, bucket value, endpoint value, or base64 payload.
