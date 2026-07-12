# Full-Stack Test Coverage Map

Audit date: 2026-07-12. All commands below use no-call, mock, fixture, synthetic-key, or disposable boundaries. No real external service was attempted.

| Test file or group | Covered behavior | Type | Fixture/mock/disposable | Result | Material missing coverage |
|---|---|---|---|---|---|
| `admin-audit-log-business-summary` | Redacted audit summaries and risk modules | Unit | Fixture | PASS | Authenticated UI list |
| `admin-dashboard-risk-overview` | Read-only dashboard defaults | Unit | Fixture | PASS | Authenticated UI and live data |
| `admin-generation-refund-link` | Refund and generation audit linkage | Unit | Fixture | PASS | Provider failure drill |
| `admin-orders-readonly` | Safe order filters and serialization | Unit | Fixture | PASS | Authenticated UI |
| `admin-point-adjustment-audit` | Mandatory audit reason | Unit | Fixture | PASS | Admin workflow |
| `admin-provider-health-preflight` | Read-only health and redaction | Unit | Fake config | PASS | Real Provider smoke |
| `admin-provider-storage-dangerous-actions-gate` | Provider/Storage write and network gates | Unit/source | Fake config | PASS | Authorized external test |
| `auth-login-route-context` | User/admin context and redirect safety | Unit | Router state | PASS | Fresh anonymous browser |
| `auth-session-touch` | Session timestamp conflict handling | Unit | Fake repository | PASS | Browser/session expiry |
| `login-agreement-consent` | Agreement control and email-code boundary | Unit/source | Fake state | PASS | Visible UI regression |
| `login-user-entry` | User login entry hides admin authentication | Unit/source | Source assertions | PASS | Visible UI regression |
| `register-entry` | Registration entry and auto-registration notice | Unit/source | Source assertions | PASS | Visible UI regression |
| `production-startup-preflight` | CORS, migration, delivery, debug-code gates | Unit/source | Synthetic env | PASS | Real secret-manager startup |
| `config-encryption-secret` | Independent keys, weak-key rejection, rotation | Unit | Synthetic keys/ciphertext | PASS | Production rotation |
| `generation-flow-no-call-e2e-preflight` | No-call generation blocks before Provider/Storage | Integration-style | Fake adapters | PASS | Real task run |
| `user-generation-history-readonly` | Safe history and no mutation/result loading | Unit/source | Fixture | PASS | Browser history |
| `user-generation-ui-no-call-guidance` | Safe generation guidance and mobile source rules | Unit/source | Fixture | PASS | Visible UI regression |
| `local-demo-fixtures` | Idempotent seed/clean and admin collision safety | Unit | Fixture | PASS | Current browser fixture run |
| `commercial-payment-closure` | Order states, benefits, refunds, idempotency | Unit | Fake data | PASS | Sandbox callback and reconciliation |
| `payment-provider-adapter` | Mock intent/webhook, redaction, idempotency | Unit | Mock provider | PASS | Real provider adapter |
| `payment-secret-injection-preflight` | Sandbox secret shape and no-call refusal | Unit | Synthetic env | PASS | Approved sandbox run |
| `user-billing-payment-parked` | UI remains parked | Unit/source | Source assertions | PASS | Visible UI regression |
| `legacy-config-inventory-*` | Authorization, classifier, report, repository contract | Unit | Synthetic cipher data | PASS | Isolated real replica inventory |
| `disposable-inventory-database-guard` | Disposable target and pre-Prisma guard | Unit | Synthetic env | PASS | Current disposable Gate |
| `prisma-readonly-inventory-repository` | Fixed models/fields and read-only SQL audit | Unit | Fake Prisma | PASS | Current authorized disposable run |
| `ci-release-gates` | Manual image/deploy workflow and immutable references | Source | Workflow files | PASS | GitHub protection configuration |
| `dev-server-env-bootstrap` | Local development env loading without URL leak | Unit/source | Synthetic env | PASS | Production secret manager |
| `okwook-brand-domain` | Brand, domain, local API boundary | Source | Source assertions | PASS | Current visible page regression |

## Commands Executed

| Command | Result | Count/skips |
|---|---|---|
| `npm.cmd run test` | PASS | 111 passed, 0 skipped |
| `npm.cmd run build:service` | PASS | Server bundle created |
| `npm.cmd run build` | PASS with warnings | Vue type check included |
| `npm.cmd run type-check` | PASS | No count emitted |
| `npm.cmd run test:inventory:disposable` | NOT_AUTHORIZED | 1 test stopped before Prisma connection because exact Gate was absent |

No configured `lint`, `test:unit`, `test:e2e`, or standalone security script exists in `package.json`. The `test` script explicitly lists the current no-call test files, so unlisted source modules have no automated evidence unless noted in the feature matrix.
