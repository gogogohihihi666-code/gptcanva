# Full-Stack Feature Matrix

Audit date: 2026-07-12. `V4_REAL_EXTERNAL_RUN` and `V5_PRODUCTION_OBSERVED` were not claimed in this no-call audit.

| Domain | Feature | Implementation | Automated verification | Local temporary run | Real run | Deployment status | Missing work | Priority |
|---|---|---|---|---|---|---|---|---|
| Public | Brand, title, description, canonical | COMPLETE | `okwook-brand-domain` V2 | V3 metadata PASS | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Visual public-page render regression | P1 |
| Public | Home page and footer | PARTIAL | Brand assertions V2 | V3 failed visible-content check | EXTERNAL_VALIDATION_DEFERRED | BLOCKS_DEPLOYMENT | Investigate blank route render | P1 |
| Public | Login entry | COMPLETE | `login-user-entry`, `auth-login-route-context` V2 | V3 blank in current browser | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Fresh anonymous browser regression | P1 |
| Public | Registration entry | COMPLETE | `register-entry`, consent tests V2 | V3 blank in current browser | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Fresh anonymous browser regression | P1 |
| Public | 404 route | NOT_IMPLEMENTED | V0 | V0 | N/A | NON_BLOCKING_GAP | Add catch-all route | P3 |
| Public | Install redirect after initialization | COMPLETE | Production/init tests V2 | V3 URL stays `/install`, visible content blank | N/A | DEPLOY_READY_LOCAL_MODE | Browser regression investigation | P1 |
| Auth | Phone/email code login | COMPLETE | Login, consent, session tests V2 | V3 UI unavailable in current session | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Real delivery adapter | P1 |
| Auth | Auto-registration | COMPLETE | `register-entry` V2 | V3 UI unavailable in current session | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Real delivery adapter | P1 |
| Auth | Admin login context and redirects | COMPLETE | Route-context tests V2 | V3 ordinary user denied | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Authenticated admin shell coverage | P2 |
| Auth | Redirect validation | COMPLETE | Route-context tests V2 | V3 static/browser historical evidence | N/A | DEPLOY_READY_LOCAL_MODE | Add browser regression test | P2 |
| Auth | Production debug-code hard disable | COMPLETE | Production preflight V2 | V3 no-call preflight | N/A | DEPLOY_READY_LOCAL_MODE | Real delivery enablement contract | P1 |
| Account | Membership and points display | COMPLETE | Payment parked test V2 | V0 current user page blank | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Browser recovery | P1 |
| Account | Generation history and detail | COMPLETE | History safety test V2 | V0 current user page blank | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Fixture browser run | P2 |
| Account | Five task states fixture | COMPLETE | Fixture test V2 | V3 historical fixture evidence | N/A | DEPLOY_READY_LOCAL_MODE | Re-run current browser fixture coverage | P2 |
| Generate | Form and model selection | COMPLETE | No-call guidance tests V2 | V0 page blank | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Browser regression and real Provider validation | P1 |
| Generate | Task creation and lifecycle | COMPLETE | No-call preflight V2 | V3 no-call gate | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Provider/Storage integration | P1 |
| Generate | Provider execution | PARTIAL | Fail-closed preflight V2 | V3 no-call blocked | EXTERNAL_VALIDATION_DEFERRED | ENABLEMENT_REQUIRES_REAL_VALIDATION | Authorized temporary and real smoke | P1 |
| Generate | Failure refund linkage | COMPLETE | Admin/refund and payment tests V2 | V3 fake adapter | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Real Provider failure drill | P1 |
| Payment | Plans and recharge UI | COMPLETE | Payment parked V2 | V0 page blank | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Browser recovery | P1 |
| Payment | Order state and benefit grant | COMPLETE | Commercial closure V2 | V3 mock webhook | EXTERNAL_VALIDATION_DEFERRED | ENABLEMENT_REQUIRES_REAL_VALIDATION | Sandbox contract, webhook, reconciliation | P1 |
| Payment | Real provider adapters | PARTIAL | Injection preflight V2 | V3 mock only | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Sandbox then production validation | P1 |
| Provider | Config CRUD and encrypted storage | COMPLETE | Encryption tests V2 | V3 synthetic/disposable evidence | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Real configuration review | P1 |
| Provider | Current/previous key rotation | COMPLETE | Encryption tests V2 | V3 synthetic keys | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Controlled production rotation drill | P1 |
| Provider | Legacy ciphertext inventory | COMPLETE | Inventory tests V2 | V3 historical disposable run; current command lacks Gate | EXTERNAL_VALIDATION_DEFERRED | POST_DEPLOY_CHECK | Isolated real replica when one exists | P2 |
| Provider | Health/model discovery | PARTIAL | Dangerous-action gate V2 | V3 blocked safely | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Authorized real smoke | P1 |
| Storage | Config CRUD and encryption | COMPLETE | Encryption and gate tests V2 | V3 synthetic/disposable evidence | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Real configuration review | P1 |
| Storage | Upload/download/signed URL/delete | PARTIAL | Dangerous-action gate V2 | V3 blocked safely | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Temporary object store and real smoke | P1 |
| Storage | Local uploads fallback | COMPLETE | Static/source evidence V1 | V0 | N/A | DEPLOY_READY_LOCAL_MODE | Local upload integration test | P2 |
| Admin | Dashboard risk overview | COMPLETE | Dashboard test V2 | V0 authenticated admin unavailable | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Human local admin acceptance | P2 |
| Admin | Provider and Storage management | COMPLETE | Gate tests V2 | V0 authenticated admin unavailable | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Authenticated admin and real smoke | P2 |
| Admin | Orders and refund audit | COMPLETE | Order/refund tests V2 | V0 authenticated admin unavailable | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Authenticated list acceptance | P2 |
| Admin | Audit log summaries | COMPLETE | Audit tests V2 | V0 authenticated admin unavailable | N/A | DEPLOY_READY_LOCAL_MODE | Authenticated list acceptance | P2 |
| Admin | Ordinary-user rejection | COMPLETE | Route guard tests V2 | V3 `/admin-forbidden` PASS | N/A | DEPLOY_READY_LOCAL_MODE | Add anonymous isolated browser run | P2 |
| Assets | Image asset management | PARTIAL | V0 | V0 | EXTERNAL_VALIDATION_DEFERRED | NON_BLOCKING_GAP | Workflow and persistence coverage | P2 |
| Assets | Video generation/editor/canvas actions | SCAFFOLD_ONLY | V0 | V0 | EXTERNAL_VALIDATION_DEFERRED | NON_BLOCKING_GAP | Resolve three explicit TODOs | P2 |
| Canvas | Upload | SCAFFOLD_ONLY | V0 | V0 | EXTERNAL_VALIDATION_DEFERRED | NON_BLOCKING_GAP | Implement upload flow | P2 |
| Workflow | Definitions and canvas persistence | COMPLETE | V1 static source | V0 | EXTERNAL_VALIDATION_DEFERRED | NON_BLOCKING_GAP | End-to-end test | P2 |
| System | Init protection and health | COMPLETE | Production and bootstrap tests V2 | V3 5409/5010 JSON PASS | N/A | DEPLOY_READY_LOCAL_MODE | Browser visual regression | P1 |
| System | Production preflight | COMPLETE | Preflight test V2 | V3 synthetic env | N/A | DEPLOY_READY_LOCAL_MODE | Human secret-manager runbook | P1 |
| System | Migration separation | COMPLETE | Preflight/migration tests V2 | V3 gate test | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_LOCAL_MODE | Backup/migration drill | P1 |
| Database | Prisma schema and migrations | COMPLETE | V1 build/source | V3 disposable inventory historical evidence | EXTERNAL_VALIDATION_DEFERRED | POST_DEPLOY_CHECK | Production migration and restore drill | P1 |
| Database | Backup/restore/rollback | NOT_IMPLEMENTED | V0 | V0 | EXTERNAL_VALIDATION_DEFERRED | BLOCKS_DEPLOYMENT | Design and drill | P1 |
| Redis | Runtime locks, idempotency, rate limits | COMPLETE | Payment/generation tests V2 | V0 | EXTERNAL_VALIDATION_DEFERRED | DEPLOY_READY_FEATURE_DISABLED | Redis failure/degradation test | P2 |
| Observability | Sensitive logging safeguards | PARTIAL | Redaction tests V2 | V0 | EXTERNAL_VALIDATION_DEFERRED | BLOCKS_DEPLOYMENT | Global logging policy and alert drill | P1 |
| Operations | Local startup chain | COMPLETE | Bootstrap test V2 | V3 Docker, MariaDB, 5409, 5010 healthy | N/A | DEPLOY_READY_LOCAL_MODE | None | P2 |
| Operations | CI validation | COMPLETE | CI gate test V2 | V1 workflow source | N/A | DEPLOY_READY_LOCAL_MODE | GitHub run evidence after authorized push | P2 |
| Operations | Image publication | COMPLETE | CI gate test V2 | V1 workflow source | EXTERNAL_VALIDATION_DEFERRED | POST_DEPLOY_CHECK | Manual registry publication approval | P2 |
| Operations | Deployment workflow | COMPLETE | CI gate test V2 | V1 workflow source | EXTERNAL_VALIDATION_DEFERRED | BLOCKS_DEPLOYMENT | GitHub environment protection and rehearsal | P0 |
| Operations | Domain/HTTPS/proxy | PARTIAL | Brand source test V2 | V1 metadata only | EXTERNAL_VALIDATION_DEFERRED | BLOCKS_DEPLOYMENT | DNS, cert, proxy, redirect validation | P1 |
| Discoverability | robots/sitemap/manifest | NOT_IMPLEMENTED | V0 | V0 | N/A | NON_BLOCKING_GAP | Add when public launch is planned | P3 |

Counts: 50 independently assessed features. COMPLETE 37, PARTIAL 8, SCAFFOLD_ONLY 2, NOT_IMPLEMENTED 3, DEPRECATED 0, NOT_APPLICABLE 0. The verification-level numbers are evidence references across feature rows, so one feature can hold V2 automated evidence alongside V0 current browser evidence. No V4 or V5 evidence is claimed in this audit.
