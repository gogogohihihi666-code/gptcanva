# Payment Provider Parked Status

Real payment provider integration is parked for the current personal development phase.

No Alipay, WeChat Pay, or aggregator sandbox credentials are available in this repository or in the current runtime. Real provider wiring, sandbox smoke, payment URL creation, QR code creation, real webhook receipt, real payment transaction creation, and production benefit grant are not authorized.

Current documented status:

- `PAYMENT_REAL_PROVIDER_STATUS=parked`
- `PAYMENT_SANDBOX_READY=false`
- `PAYMENT_REAL_SMOKE_ALLOWED=false`
- `will_call_external=false`
- `will_charge_real_money=false`
- `will_create_real_payment=false`
- `will_grant_benefit=false`

These status values are documentation-only guardrails for this phase. Do not add real provider credentials to tracked files.

## Retained No-Call Payment Foundation

- Commercial order state machine
- `PENDING`, `PAYING`, `BENEFIT_GRANTED`, and failure/refund-adjacent states
- `PaymentTransaction`
- `BenefitGrant`
- `PointAccountLog` idempotency
- Redis order lock with TTL and token-checked release
- Local payment simulation gate for non-production development only
- Mock payment provider
- Payment intent abstraction
- Webhook event mapping
- Payment provider preflight
- Payment secret preflight
- No-call payment tests

## Parked Real Provider Work

Do not implement or enable these paths until a later, explicitly authorized stage:

- Alipay real or sandbox API calls
- WeChat Pay real or sandbox API calls
- Aggregator real or sandbox API calls
- Real payment QR code creation
- Real payment redirect URL creation
- Real webhook receipt from a provider
- Real payment transaction writes caused by provider callbacks
- Real benefit grants caused by provider callbacks
- Production payment collection

## Before Unparking

Complete all of the following before any real provider smoke is attempted:

1. Choose a payment channel: Alipay, WeChat Pay, or aggregator.
2. Prepare a merchant entity or third-party collection plan.
3. Prepare sandbox or test credentials outside Git.
4. Store credentials only in a private env file or secret store.
5. Run `payment-secret-preflight`.
6. Obtain explicit human authorization for one sandbox payment smoke.
7. Verify webhook signature validation.
8. Verify `PaymentTransaction` idempotency.
9. Verify `BenefitGrant` is not duplicated.
10. Run a production small-amount payment verification only after a separate production authorization.

## Allowed Work While Parked

- User registration and login
- Email verification
- Membership plan display
- Point balance display
- Task creation
- Image generation task state machine
- Task list and result pages
- Admin order search
- Admin user entitlement search
- Admin manual point grant or deduction with permission checks and audit logs
- Quota consumption and failure rollback
- Provider no-call and mock tests
- Deployment preflight and security checks

## Private Credential Rules

Real payment credentials must not be written to:

- `.env.example`
- `.env.production`
- `.env.production.example`
- `.env.development.example`
- `docs/`
- `tests/`
- Git tracked files
- logs
- chat records
- screenshots

Real payment credentials may only be injected into:

- `.env.local`
- `.env.sandbox.local`
- server secret store
- deployment platform secret store

