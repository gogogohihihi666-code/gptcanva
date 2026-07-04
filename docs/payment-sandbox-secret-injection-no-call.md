# Payment Sandbox Secret Injection Preflight

This project keeps payment sandbox preparation in no-call mode until a human operator injects real sandbox credentials outside Git.

## Scope

- `POST /api/marketing/payment-secret-preflight` validates provider configuration shape.
- The preflight reads environment variables but never returns secret values.
- The preflight always reports:
  - `will_call_external=false`
  - `will_charge_real_money=false`
  - `will_create_real_payment=false`
  - `will_grant_benefit=false`

## Required Sandbox Env Names

- `PAYMENT_PROVIDER`
- `PAYMENT_ENVIRONMENT`
- `PAYMENT_ALIPAY_ENABLED`
- `PAYMENT_WECHAT_ENABLED`
- `PAYMENT_AGGREGATOR_ENABLED`
- `PAYMENT_SANDBOX_REAL_CALLS_ALLOWED`
- `ALIPAY_SANDBOX_APP_ID`
- `ALIPAY_SANDBOX_PRIVATE_KEY`
- `ALIPAY_SANDBOX_PUBLIC_KEY`
- `ALIPAY_SANDBOX_GATEWAY_URL`
- `WECHATPAY_SANDBOX_MCH_ID`
- `WECHATPAY_SANDBOX_APP_ID`
- `WECHATPAY_SANDBOX_API_V3_KEY`
- `WECHATPAY_SANDBOX_PRIVATE_KEY`
- `WECHATPAY_SANDBOX_CERTIFICATE`
- `WECHATPAY_SANDBOX_SERIAL_NO`
- `PAYMENT_AGGREGATOR_SANDBOX_PROVIDER_CODE`
- `PAYMENT_AGGREGATOR_SANDBOX_MERCHANT_ID`
- `PAYMENT_AGGREGATOR_SANDBOX_APP_ID`
- `PAYMENT_AGGREGATOR_SANDBOX_SECRET`
- `PAYMENT_AGGREGATOR_SANDBOX_GATEWAY_URL`
- `PAYMENT_AGGREGATOR_SANDBOX_PRIVATE_KEY`
- `PAYMENT_AGGREGATOR_SANDBOX_PUBLIC_KEY`
- `PAYMENT_NOTIFY_URL`
- `PAYMENT_RETURN_URL`
- `PAYMENT_WEBHOOK_SECRET`

Real `.env` files, PEM/key/certificate bundles, and secret folders are ignored by Git.

## Private Injection Locations

Real payment sandbox variables must only be injected into one of these private locations:

- `.env.local`
- `.env.sandbox.local`
- server secret store
- deployment platform secret store

Real payment sandbox variables must not be written to:

- `.env.example`
- `.env.production`
- `.env.production.example`
- Git tracked files
- docs
- tests
- logs
- chat records
- screenshots
