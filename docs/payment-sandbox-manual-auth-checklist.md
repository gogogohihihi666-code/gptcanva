# Payment Sandbox Manual Authorization Checklist

This checklist prepares the first real payment sandbox authorization review. It does not authorize live calls by itself.

Default posture:

- `will_call_external=false`
- `will_charge_real_money=false`
- `will_create_real_payment=false`
- `will_grant_benefit=false`
- `git push=false`
- `deploy=false`

## Alipay Sandbox

Human operator must prepare these values in a private environment file or server secret store:

- `ALIPAY_SANDBOX_APP_ID`
- `ALIPAY_SANDBOX_PRIVATE_KEY`
- `ALIPAY_SANDBOX_PUBLIC_KEY`
- `ALIPAY_SANDBOX_GATEWAY_URL`
- `PAYMENT_NOTIFY_URL`
- `PAYMENT_RETURN_URL`
- `PAYMENT_WEBHOOK_SECRET`

Required decisions:

- Whether one sandbox payment request is allowed: default `no`.
- Which test user and order may be used.
- Whether sandbox webhook receipt is allowed.
- Whether test benefit grant is allowed.

## WeChat Pay Sandbox Or Test Configuration

Human operator must prepare these values in a private environment file or server secret store:

- `WECHATPAY_SANDBOX_APP_ID`
- `WECHATPAY_SANDBOX_MCH_ID`
- `WECHATPAY_SANDBOX_API_V3_KEY`
- `WECHATPAY_SANDBOX_PRIVATE_KEY`
- `WECHATPAY_SANDBOX_SERIAL_NO`
- `WECHATPAY_SANDBOX_CERTIFICATE`, if the selected flow requires a platform certificate
- `PAYMENT_NOTIFY_URL`
- `PAYMENT_RETURN_URL`
- `PAYMENT_WEBHOOK_SECRET`

Required decisions:

- Whether one sandbox payment request is allowed: default `no`.
- Whether a sandbox QR code or payment URL may be created.
- Whether sandbox webhook receipt is allowed.
- Whether test benefit grant is allowed.

## Aggregator Provider

Human operator must prepare these values after selecting the aggregator:

- `PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE`
- `PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID`
- `PAYMENT_AGGREGATOR_SANDBOX_APP_ID`
- `PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL`
- `PAYMENT_AGGREGATOR_SANDBOX_SECRET`
- `PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY`
- `PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY`
- webhook public verification key, if required by the selected provider
- `PAYMENT_NOTIFY_URL`
- `PAYMENT_RETURN_URL`

Required decisions:

- Whether the selected provider supports a true sandbox channel.
- Which sub-channel is enabled for testing.
- Whether one sandbox payment request is allowed: default `no`.
- Whether sandbox webhook receipt is allowed.
- Whether test benefit grant is allowed.

## Private Env Injection Rules

- Real secrets must only be written to local or server-private env files.
- Real secrets must not be written to `.env.example`.
- Real secrets must not be committed to Git.
- Real secrets must not be printed to logs.
- Real secrets must not appear in test snapshots.
- Real secrets must not appear in API error responses.
- PEM, key, certificate, and secret bundles must remain under ignored private paths such as `certs/` or `secrets/`.

## Test Database Requirements

- Use a rollback-friendly test database.
- Never connect payment sandbox testing to production data.
- Prepare one test user with an explicit id and role.
- Prepare one membership order or recharge order in `PENDING` or `PAYING` state.
- Prepare a cleanup script, transaction rollback plan, or disposable database snapshot.
- Run no-call preflight before any real sandbox attempt.
- Record whether test benefit grants are allowed before webhook processing is enabled.

## Public Webhook Requirements

- `PAYMENT_NOTIFY_URL` must be HTTPS and reachable by the provider sandbox.
- The webhook endpoint must point to a test environment, not production.
- Webhook verification must be enabled before benefit grant paths are allowed.
- Raw webhook payload storage must stay sanitized.
- Failed verification must not grant benefits.

## First Real Sandbox Authorization Template

Fill this template in the task thread before any real sandbox request is attempted:

```text
Provider allowed:
Environment allowed: sandbox
Maximum payment requests allowed:
Allow sandbox payment QR/payment URL creation: no
Allow real sandbox webhook receipt: no
Allow test benefit grant: no
Test user id:
Test order type:
Test order no:
Test database name:
Allow test PaymentTransaction write: no
Allow test BenefitGrant write: no
Allow git push: no
Allow deployment: no
Operator name:
Authorization expires at:
```

No field in this template should contain a private key, certificate body, API key, or webhook secret.
