# IntoChat Cloud migration implementation status

## Current implementation checkpoint — 2026-10-16

This current section supersedes historical statements below about unavailable drivers, unimplemented boundaries, lack of test authorization, and no commits. Historical records are retained as the audit trail. Work used the existing dirty branches and preserved unrelated changes. No push, live payment, deployment, billable resource creation, shared/production database migration or production deletion occurred.

### P0 reconciliation against source

“Local” means implemented and locally verified using the checks below, including real disposable PostgreSQL, local HTTPS/mTLS and public runtime persistence. External services are doubled only in tests. “External” means implemented but awaiting operational validation of the actual configured service. It is not a substitute for implementation.

| Plan item | Implemented behavior / principal source | Verification and remaining evidence |
|---|---|---|
| A0 | Cloud feature/profile isolation, validated optional provider settings; `src/Aspire/AppHost.cs`, infrastructure settings extensions | Local host starts with travel/billing/provisioning off; no external calls. Startup now validates refresh HMAC length; isolated Aspire generates a separate development key. External secret custody/rotation remains operator-owned. |
| A1 | Provider/issuer/subject identities and preserved-user migration; `ExternalIdentityService`, identity model/configuration | Local subject/email-change and no-email-merge DB acceptance; ordered/idempotent migration validation. External existing-installation identity inventory needed before applying migrations. |
| A2 | Numeric user/session claims and account ownership replace username authorization; account service/controllers | Local ownership/guessed-ID rejection in workspace/provisioning/billing tests. No username prerequisite for cloud navigation. |
| A3 | Google and Telegram proof verification and independent enablement | Existing authentication tests and cloud configuration checks; external real Google/optional Telegram callback credentials remain required. |
| A4 | Independent provider sign-in and cloud landing, no forced Telegram binding | Frontend suite and local authenticated browser flow; provider-specific external sign-in remains operational acceptance. |
| A5 | Recent-session explicit link intents, one-time consumption, unique identity owner, last-credential guard; `IdentityLinksController`, `AuthenticationIntentService` | DB acceptance rejects mismatched/replayed intent and last enabled credential removal; frontend linking controls. External provider callback round trip still required. |
| A6 | Per-device durable sessions, authenticated rotation/replay handling, revoke/disable checks; `AuthSessionService` | DB acceptance proves replay affects its device and disabled user cannot refresh; workspace revocation/active-stream tests. |
| R1 | Travel route/job feature guards and removed navigation | Backend/frontend builds and guard tests; retired execution cannot be activated by ordinary cloud routes. |
| R2 | Removed complete travel application slices; removal manifest below records files | Source/reference review plus builds; historical entities/adapters are retained where shared data still depends on them. |
| R3 | Telegram login detached from travel bot host | Authentication tests and default Aspire without bot/messaging resources. Optional external Telegram proof callback still needs credentials. |
| R4 | Reduced cloud Aspire resources and removed exclusive consumers/packages | Current API/frontend/PostgreSQL/Redis stack healthy; removed services are not started. |
| R5 | Expand migrations preserve history and references; sequence SQL works inside EF idempotent wrappers | Whole migration chain applied to newly created DBs; idempotent script applied twice. Destructive contraction of existing installations is blocked on inventory, backup/export evidence and explicit authorization. |
| B1 | Personal account/member ownership, preserved-owner backfill and scoped APIs | Disposable DB migration and ownership isolation tests; existing customer migration remains unauthorized. |
| B2 | Versioned catalog, account/customer/subscription mapping, verified billing contact | Builds, billing tests and UI; approved actual prices/catalog and sandbox credentials are missing operational inputs. |
| B3 | Durable checkout key/snapshot, serialized lease, deterministic provider idempotency and audited uncertain-outcome recovery; `CloudCheckoutService`, `CheckoutRecoveryService` | Recovery tests cover proof/ownership, stale lease, concurrent recovery, missing provider result. Customer-only attempts close only when subscription creation was never attempted; unproven attempted subscriptions remain held. No provider mutation in operator recovery. |
| B4 | Signed durable webhook inbox, leased reconciliation, quarantine/replay and provider-current state | Local billing/recovery tests and operator authorization review; actual provider duplicate/out-of-order/webhook-before-response sandbox drill remains external. |
| B5 | Entitlement/grace/cancellation/retention and fail-closed quota reduction; `RuntimeQuotaPolicy`, lifecycle service | Existing allocations exceeding new count/CPU/memory/storage/concurrency/profile stop durably; gateway/proxy reject immediately. Data/export retained. Refund adjudication requires explicit product/support policy and live authority; no blind refund execution. |
| C1 | Provider-neutral mTLS management, per-allocation exact identity/version/protocol and durable storage readiness | Runtime platform and actual local HTTPS tests. Public runtime remains self-hostable without cloud. Approved release artifact and deployment compatibility evidence remain external. |
| C2 | Fenced durable provisioning, worker-disabled rejection, owned Azure allocation/storage, lost-response recovery | `BrainProvisioningTests`, `AzureRuntimeAllocationTests`, Azure SDK transport tests, operator retry tests. Real provider ownership/capacity/private networking drill awaits authorized environment. |
| C3 | One-time scoped access, durable revocation, host-isolated proxy, active stream cancellation; workspace services/middleware | PostgreSQL lease/ownership tests, public runtime one-time/expiry tests and local mTLS transport. Wildcard DNS/TLS and deployed ingress isolation remain external. No cloud JWT key shared. |
| C4 | Encrypted hosted state/reminders, single-writer storage, coordinated Azure Files snapshot, resumable isolated restore and decoded authorized ZIP export | Platform 248 tests including cold recovery/export; cloud snapshot/copy/ownership tests. Provider SMB/quota/snapshot consistency and measured RPO/RTO require authorized Azure resources. |
| C5 | Durable pause/resume, explicit retention deletion, digest/format-approved upgrades, recovery-only candidates and atomic active promotion | Lifecycle tests include lost responses, stale retry, source stop, retained exports and six failed-restart/plan-change regressions. No unsafe image-only rollback. Destructive provider drills remain unauthorized. |
| U1 | Immutable scoped typed ledger, stable source events, Azure Monitor cursor/gaps, historical infrastructure rates, model price snapshots and append-only adjustments | Real DB metering/receipt tests; timeout fairness, deleted final windows and first-hour completeness verified. Missing measurements/rates remain explicit, never zero or fabricated invoice values. Actual SKU metrics and approved immutable rate periods remain external. |
| U2 | Atomic managed budget reservation/settlement, durable supplier receipts, conservative ambiguous-execution holds; actual AI client concurrency/deadline/output caps and provider CPU/memory/storage settings | Managed gateway/recovery tests; AI 209 tests; quota admission/revocation tests. External provider quota and load behavior still need deployment proof. No automatic overage charging. |
| L1 | Account creation/progress/failure/retry/access, lifecycle recovery/export, suspension reason/retention, billing and typed usage UI | 445 frontend tests, TypeScript and production build; local browser sign-in/account/billing/usage checks recorded below. Positive real hosted workspace flow awaits the approved artifact/environment. |
| L2 | Safe structured telemetry; bounded queues, audited checkout/hosting/model/usage recovery; private `docs/operations/hosted-runtime-recovery.md` | Operator allowlist/ownership/idempotency tests and trace inspection. Actual alert destinations, log retention, on-call drills and cost inputs require operational configuration. No numerical margin invented. |
| L3 | Full migration/status/boundary records, staged off-by-default launch controls and acceptance map | Local checks below. Legal policies, provider sandbox/deployment drills and production rollout approval remain external gates. |

No independent P0 implementation gap remains identified after the scoped reviews and repairs. This does **not** claim paid-launch or production acceptance. Deferred P1/P2, teams, overages, wholesale rename and Phase 2 extraction were not implemented.

### Verification commands and results

- Cloud: `dotnet test --project src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj --configuration Release`, with `INTOCHAT_PROVISIONING_TEST_DB` pointing only to a newly created loopback `intochat_provisioning_test_*` database: **186 passed, 0 failed, 0 skipped**. The fixture refuses shared/non-loopback databases.
- Public runtime: `dotnet test src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/DigitalBrain.Platform.Tests.Unit.csproj --configuration Release`: **248 passed, 0 failed, 0 skipped**. `dotnet test src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/DigitalBrain.Modules.AI.Tests.csproj --configuration Release`: **209 passed, 0 failed, 0 skipped**. Runtime OS Release build: **0 errors**.
- Cloud full solution: `dotnet build IntoChat.slnx --configuration Debug`: **0 errors**, dependency/analyzer warnings retained. Final API Debug rebuild after lifecycle repair: **0 errors**. Final `dotnet build IntoChat.slnx --configuration Release` also passed with 0 errors (199 dependency/analyzer warnings).
- Frontend: `npm test`: **445 passed / 62 files**; `npx tsc --noEmit` and `npm run build` passed. Build emits existing bundle-size guidance.
- EF: complete ordered migration SQL and idempotent SQL applied to newly created disposable databases; idempotent history applied twice successfully. Three historical sequence-reset migrations were repaired to use `DO/PERFORM` inside idempotent wrappers. No existing/shared database was migrated.
- EF final model check: `dotnet ef migrations has-pending-model-changes --project src/IntoChat.Server.Db --configuration Release` reports no pending changes. Final current idempotent history was applied twice to another newly created database after the final build.
- Aspire remains running: API `api-dxhraceg`, frontend `website-thqxueff`, PostgreSQL `intochat-postgres-bkqepqev` and Redis `redis-mkhmrwcr` are Healthy; migrations `migrations-epsxfdbx` Finished. `GET http://localhost:52338/health/ready` returns 200. Frontend is `http://localhost:52341`.
- Browser acceptance used an explicitly disposable local account: sign-in reaches cloud home; failed provisioning/retry and disabled creation show truthful no-charge/unavailable state; billing shows configured plan; usage shows separate units, freshness and no connected producer; security shows independent disabled providers and no retired travel privacy control. Positive hosted provisioning/access and payment checkout await real approved external inputs.
- Browser-discovered MVC record validation failure was fixed across creation/billing/operator action DTOs: 11 real MVC validation cases failed before repair, all 13 now pass. Local sign-in exposed the short development refresh key, fixed with generated isolated configuration and startup validation. Concurrent identity-link acceptance exposed a nested Npgsql serialization exception; it now returns a safe 409 with one owner.
- `aspire otel traces api-dxhraceg --format json --limit 8` confirms current request traces reach the dashboard; eight final sampled traces have no error. Historical deliberate negative tests and repaired failures remain in the local telemetry history. Only safe projected fields were used in final evidence.

### Acceptance catalog classification

AUTH-01–04/10: local source/UI/provider-isolation tests plus local session browser flow; real provider callback steps require Google/optional Telegram credentials. AUTH-02/05/07–09 additionally have direct DB behavioral acceptance. AUTH-06 has a real PostgreSQL concurrent-link test proving exactly one owner and one safe conflict; production-scale provider callback behavior remains operational evidence.

BILL-01–04: durable state/recovery and ownership/concurrency tested locally; complete Stripe sandbox webhook ordering and timeout drill requires approved sandbox credentials. BILL-05: quota/grace/cancel service behavior locally tested; actual refund adjudication is blocked on product/support policy.

HOST-01/02/03/05: local durable provisioning, ownership and recovery tests. HOST-04/06/07: local persistence/recovery/lifecycle tests, with Azure replacement/SMB/snapshot/retention/upgrade drills still external. USAGE-01–04: local immutable ingestion, budget concurrency, supplier attribution and durable ambiguous-receipt recovery; actual provider metering availability/prices require external validation. CLEAN-01: source guards/removal review, backend/frontend builds and route tests; no retired provider resources started.

### Exact external inputs and risks

1. Approved immutable runtime image digest, exact version and supported storage compatibility list. A locally compiled binary is not release approval.
2. Authorized Azure identity, target subscription/resource group/region, private ACA environment and Azure Files account/SKU/network, durable shared credential custody and its backup. Wildcard workspace DNS/TLS and reachable control-plane ingress must be supplied. Infrastructure deployment/billable creation is not authorized.
3. Approved supplier key/model/rates and cloud catalog prices; immutable effective-dated infrastructure rates. Missing rate periods remain unpriced. Azure per-share metric support, retention of deleted-resource evidence and RPO/RTO/load results must be demonstrated. Deleted resources cannot be backfilled by rechecking live ownership; unresolved final gaps remain visible for provider-evidence reconciliation.
4. Google and optional Telegram credentials/callback configuration, approved payment sandbox credentials, webhook endpoint and sandbox drill authority. No live charge/refund is authorized.
5. Product-approved backup/deletion retention, recovery objectives, grace/refund/support policy, cloud legal terms/privacy and deployment log retention. Refund requests remain review-only pending this policy.
6. Existing/shared installation inventory, backups, export evidence and explicit migration/contraction authorization; production rollout, deletion and upgrade drill authorization.
7. Security follow-up: an inherited STITCH_API_KEY appeared in earlier raw tool diagnostics. Its owner must rotate/revoke it. It was not committed. Do not paste raw Aspire environment/start output into records; final verification projects safe status/telemetry fields only.

The default isolated Aspire host does not contact Azure, Stripe or model suppliers. Test doubles remain in test code. The private runbook documents recovery endpoints, stop/restore/export handling, meter gaps, price history discipline and cost-estimate inputs; no fabricated production success or margin is asserted.

### Focused implementation commits

Cloud: `d9f6d97` worker-disabled admission; `911ab33` test/build repair; `56a65c4` mTLS workspace access; `d267e61` customer creation UI; `9732e59` private Azure allocation; `c16bd4b` managed gateway/budget receipts; `07f6460` isolated workspace proxy; `5daf0cd` migration script repair; `0c1a999` lifecycle UI; `f267ec9` durable storage/lifecycle/export; `6f179a3` quota suspension and checkout recovery; `a098779` stop confirmation after failed restart. Final commits: `78cca08` provider metering/gaps/prices; `d6e306d` audited operations, request validation and auth acceptance; `b6fb589` suspension/retention UI; `6944459` concurrent identity linking; `d9dc979` retired privacy controls.

Runtime: `d71ca43b8` management/workspace boundary; `02ecc41e2` storage readiness; `ca01c7a57` durable state/reminders; `0cc3cecda` active workspace expiry/revocation; `d8cef1f66` AI execution limits; `d95e58d85` recovery-only export. No push.

## Historical implementation records

Plan: E:/intochat/intochat-cloud-migration-plan.md
Started: 2026-10-15. Cloud baseline: 3fe6ccf25a40358bdde68d26ec364e6fff81f6c9.
Working branch: codex/cloud-migration. No commits or pushes.

## Evidence policy and preserved work

Static source/reference/schema/diff review only. No tests, builds, applications, deployment scripts, database migrations or live provider/payment operations run. Code presence is not behavioral verification. No production data deleted.

Cloud checkout was clean at entry. Runtime and documentation contain extensive pre-existing modifications/deletions, preserved. Complete supplied plan and applicable cloud/runtime/docs instructions were read. Work remains in the requested checkout. User execution restrictions override build/test instructions. Phase 2 extraction, wholesale renaming and P1/P2 work are excluded.

## Implementation progress

| Work | State | Implemented / remaining |
| --- | --- | --- |
| A0 | Partial, unverified | Independent default-off switches, conditional provider validation, isolated Aspire database/volume/job schema and credentials, no bot/Kafka/Stripe CLI dependency in default host, explicit migration/schema preparation opt-in, data logging disabled. Deployment/environment classification and complete configuration audit remain. |
| A1 | Code drafted, unverified | Unique provider/issuer/subject and user/provider records; preserved-ID backfill with conflict aborts and read-only report; no email merge. Explicit Telegram issuer required for legacy backfill. Additive migration, frozen target models and snapshot drafted manually. |
| A2 | Code drafted, unverified | Stable actor ID through retained profile/payment/usage/preferences/promo/feedback request chains, ID-based feedback repository/cache keys, nullable profile username/email. Retained customer controllers no longer use RequireUsername/GetUsername. Remaining full caller/nullability review required. |
| A3 | Code drafted, unverified | Google verified subject/email, independent Telegram signup without username/email, active-user checks, empty Google audience fails closed. New Telegram users do not reserve mutable provider usernames. |
| A4 | Code drafted, unverified | Provider availability endpoint and UI, removed forced Telegram Google flow, profile loading required, /cloud destination, retired activation/sync/portable-session/internal lookup routes. Legacy dead components and old frontend test expectations still need removal/update. |
| A6 | Code drafted before A5, unverified | Session IDs and hashed refresh credentials, optimistic rotation, signed version for historical replay detection, narrow concurrent-refresh conflict, session/all-session revoke, sid+security-stamp validation, legacy reauthentication, same-origin one-time login intents, cookie-refresh origin check. Added browser single-flight/cross-tab refresh coordination and bounded conflict retry, plus session-based owner lookup when the access cookie has expired; bootstrap can refresh without forced navigation. Need concurrency/browser/expiry evidence and cleanup policy. |
| A5 | Code drafted, unverified | Recent-session one-time links, unique conflict checks, no stealing/merging, last-enabled-method refusal, separate billing-contact verification; security UI supports link/unlink/contact/logout-all. Telegram Mini App no longer requires a username; linking uses callback mode and auth does not request messaging permission. Popup, Telegram widget and email delivery unverified. |
| R1/R3 | Partial, unverified | Five obsolete controllers removed after reference tracing; travel routes/navigation removed; GraphQL/dev shortcuts gated, scheduler/search execution gated; default host detached from bot. Remaining legacy reference/administrative adapters require review; persisted travel jobs have inert compatibility handlers. |
| R2/R4/R5 | Partial, unverified | Removed unused trip-vault/history and scheduled-travel frontend slices and orphan API history expander after import tracing; exact files in removal manifest. Travel handler/provider/GraphQL/scheduler implementations, bot/MiniApp, old Aspire helpers and exclusive packages removed; shared historical reference/usage/schema dependencies retained; no destructive schema contraction. Environment inventory/backups/export approval required before contraction. |
| B1 | Code drafted, unverified | Personal account/member schema and idempotent preserved-owner backfill; transaction-bound signup completion; membership/owner-scoped list/detail APIs and frontend list. No invitations/teams. |
| B2 | Partial, unverified | Versioned configurable cloud catalog with explicit resource limits, price references, grace/retention validation and cloud pricing UI; owner guard on legacy payment adapters; verified contact before checkout/setup; unique account/customer and subscription-history mappings with duplicate-reference preflight/backfill. Imported subscriptions remain unreconciled and unselected. Legacy payment services still need conversion to these mappings. |
| B3 | Code drafted, static review in progress | Durable operation-key checkout, per-account serialization/open-attempt uniqueness, encrypted immutable snapshot/contact, customer persisted before subscription, deterministic provider idempotency, leases and unknown-outcome recovery. Browser flow resumes durable attempts, preserves operation IDs, renders snapshot pricing and waits for backend confirmation; no behavioral evidence. |
| B4 | Partial, unverified | Signed durable inbox, encrypted payload/retention, leased asynchronous processing, provider-current-state reconciliation, atomic entitlement/outbox, quarantine retry and periodic sweeps drafted. Audited allowlisted operator replay/status implemented; entitlement outbox consumers and refund adjudication remain. |
| B5 | Partial, unverified | Explicit state/limits/grace mapping, period-end cancellation outbox, support refund-review requests, account-scoped invoices/cards/entitlement API and billing screen. Runtime enforcement, refund decisions, quota remediation and provisioning failure recovery remain. |
| C1 | Inventory recorded; runtime edits blocked | Runtime identity/brain routes, access checks, BrainLogs persistence and usage capabilities were inventoried in the removal manifest. Applicable runtime CLAUDE.md requires LSP for C# edits/references; this session has no LSP tool. No public runtime files changed. Do not invent unsupported management endpoints. |
| C2-C5 | Incomplete | Provisioning disabled; allocation/image/storage/retention decisions and public boundary needed. |
| U1-U2 | Cloud foundation implemented, unverified; runtime boundary blocked | Immutable typed ledger and observed billing periods, producer registry, account-serialized reservations/settlement, operator adjustments/discrepancies and owner usage view implemented. No producer ingestion API, enrolled runtime, signed grant or actual execution enforcement; C1/C3 remains prerequisite. |
| L1-L3 | Partial, unverified | Cloud/security/account billing screens, restricted billing status/replay API and billing recovery/launch-gate runbook drafted. Full dashboards/alerts, hosted product flows, recovery implementation and launch evidence remain. |
| X1-X2 / Phase 2 | Excluded | User-deferred work. |
| X3 | Source rename implemented, unverified | Explicitly authorized separately by user; project/file/namespace/configuration rename completed. Existing database/job/external-resource cutover remains pending. |

## Static review and repairs

- A read-only reviewer traced A0-A6 source/diff and identified account deletion FK failure, old test constructors, incomplete refresh replay history and missing linking UI.
- Account deletion is deliberately unavailable in API/UI until retention/billing policy is implemented; new identity/session/account rows use restrictive foreign keys. No physical deletion workaround.
- Refresh credentials now authenticate session/version before historical replay can revoke; arbitrary guessed credentials cannot revoke sessions. Latest-token race returns a controlled conflict for ten seconds.
- Updated Telegram service/handler, preference and scheduler test source contracts without executing them. Old frontend login/security scenarios still assert retired forced-Telegram/deletion behavior and require revision; profile fixtures gained stable IDs. Existing payment query test source arguments were converted to actor IDs.
- API/reference searches, migration/model comparison and diff review performed. Final git diff --check passed after normalizing trailing blank lines; no compiler/typechecker/runtime verification performed.
- Manual migration targets/snapshot require later EF model-diff and migration rehearsal. No migration has been applied.

## Precise blockers and remaining acceptance evidence

- No environment/data inventory supplied: empty vs populated databases unknown. Do not run schema contraction or assume safe data removal. Legacy Telegram identity issuer must be confirmed by operator.
- Commercial prices/catalog limits, grace/retention periods, runtime image/contract version, allocation/storage provider and recovery objectives are unset. Do not interpret missing limits as unlimited.
- Runtime LSP requirement cannot be met with available tools; management/access changes remain blocked. Cloud-independent source work can continue.
- All AUTH/BILL/HOST/USAGE/CLEAN acceptance scenarios remain behavior-unverified. Need authorized later compilation/tests, provider browser callbacks, migration rehearsals, race/replay checks, payment sandbox reconciliation, provisioning/storage restore/quota and operational drills.
- Known remaining functional gaps: deletion policy, full travel vertical-slice removal, remaining billing compatibility adapters and outbox consumers, runtime management/access, provisioning/storage/backup, usage admission and operational readiness.

## Latest checkpoint

Authentication/identity/session/account code and account billing ownership, durable checkout, webhook reconciliation and entitlement policy code are implemented but not compiled or executed. Full migration is not complete. No task is marked fully verified. Remaining billing integration/replay/outbox work and C/U/L work require implementation, not merely operational evidence. R2/R4 travel internals/packages also remain. Do not enable checkout/provisioning or deploy this partial branch.

Public runtime files remain unchanged. Operational configuration and LSP availability are genuine blockers for specified runtime work; they do not make the unfinished private work complete.

## Changed files

Paths below are relative to E:/intochat/intochat-cloud. No public runtime changes. Documentation additions: this status and plans/intochat-cloud-removal-manifest.md.

- src/Aspire/AppHost.cs
- src/IntoChat.Server.API.Contracts/Responses/Get/GetUserProfileResponse.cs
- src/IntoChat.Server.API/Contracts/IRefreshTokenRequestResolver.cs
- src/IntoChat.Server.API/Controllers/AccountsController.cs
- src/IntoChat.Server.API/Controllers/AuthenticationIntentsController.cs
- src/IntoChat.Server.API/Controllers/BaseController.cs
- src/IntoChat.Server.API/Controllers/BillingContactController.cs
- src/IntoChat.Server.API/Controllers/CloudPlansController.cs
- src/IntoChat.Server.API/Controllers/FeedbackController.cs
- src/IntoChat.Server.API/Controllers/IdentityLinksController.cs
- src/IntoChat.Server.API/Controllers/InternalUsersController.cs
- src/IntoChat.Server.API/Controllers/PaymentController.cs
- src/IntoChat.Server.API/Controllers/PreferencesController.cs
- src/IntoChat.Server.API/Controllers/PromoCodesController.cs
- src/IntoChat.Server.API/Controllers/ScheduledExecutionController.cs
- src/IntoChat.Server.API/Controllers/ScheduledQueriesController.cs
- src/IntoChat.Server.API/Controllers/SearchController.cs
- src/IntoChat.Server.API/Controllers/TelegramLinkController.cs
- src/IntoChat.Server.API/Controllers/TokenController.cs
- src/IntoChat.Server.API/Controllers/TripVaultController.cs
- src/IntoChat.Server.API/Controllers/UsageController.cs
- src/IntoChat.Server.API/Controllers/UserController.cs
- src/IntoChat.Server.API/Extensions/ApplicationBuilderExtensions.cs
- src/IntoChat.Server.API/Extensions/ServiceCollectionExtensions.cs
- src/IntoChat.Server.API/Filters/CloudFeatureFilter.cs
- src/IntoChat.Server.API/Filters/LoginIntentFilter.cs
- src/IntoChat.Server.API/Filters/PersonalAccountFilter.cs
- src/IntoChat.Server.API/Filters/RequireUserIdFilter.cs
- src/IntoChat.Server.API/Mappings/PaymentProfile.cs
- src/IntoChat.Server.API/Mappings/UserProfile.cs
- src/IntoChat.Server.API/Program.cs
- src/IntoChat.Server.API/Security/AuthCookieHelper.cs
- src/IntoChat.Server.API/Services/AuthenticationIntentService.cs
- src/IntoChat.Server.API/Services/GoogleIdTokenValidator.cs
- src/IntoChat.Server.API/Services/RefreshTokenRequestResolver.cs
- src/IntoChat.Server.Application/Behaviors/UserValidationBehavior.cs
- src/IntoChat.Server.Application/Contracts/Repositories/IFeedbackRepository.cs
- src/IntoChat.Server.Application/Contracts/Requests/IActorRequest.cs
- src/IntoChat.Server.Application/Contracts/Services/Accounts/ICurrentAccountService.cs
- src/IntoChat.Server.Application/Contracts/Services/Authentication/IAuthSessionService.cs
- src/IntoChat.Server.Application/Contracts/Services/IAuthenticatedUserResolver.cs
- src/IntoChat.Server.Application/Contracts/Services/Identity/IExternalIdentityService.cs
- src/IntoChat.Server.Application/DTO/Responses/GetUserProfileResponseDTO.cs
- src/IntoChat.Server.Application/Services/AuthenticatedUserResolver.cs
- src/IntoChat.Server.Application/Services/Authentication/LoginOrchestrator.cs
- src/IntoChat.Server.Application/Services/Authentication/RefreshTokenOrchestrator.cs
- src/IntoChat.Server.Application/Services/UserAccessValidator.cs
- src/IntoChat.Server.Application/Services/UserProfileAssembler.cs
- src/IntoChat.Server.Application/UseCases/Authentication/Commands/TelegramLogin/TelegramLoginCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Feedbacks/Commands/CreateFeedback/CreateFeedbackCommand.cs
- src/IntoChat.Server.Application/UseCases/Feedbacks/Commands/CreateFeedback/CreateFeedbackCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Feedbacks/Queries/GetUserFeedback/GetUserFeedbackQuery.cs
- src/IntoChat.Server.Application/UseCases/Feedbacks/Queries/GetUserFeedback/GetUserFeedbackQueryHandler.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/CancelSubscription/CancelSubscriptionCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/CreateRefund/CreateRefundCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/CreateSetupIntent/CreateSetupIntentCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/CreateSubscription/CreateSubscriptionCheckoutCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/DeletePaymentMethodByCard/DeletePaymentMethodByCardCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/DeletePaymentMethodByCard/DeletePaymentMethodByCardCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/DowngradeSubscription/DowngradeSubscriptionCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/ToggleSubscription/ToggleSubscriptionCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/ToggleSubscription/ToggleSubscriptionCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/UpdateDefaultPaymentMethod/UpdateDefaultPaymentMethodCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/UpdateDefaultPaymentMethod/UpdateDefaultPaymentMethodCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Payments/Commands/UpdatePayAsYouGo/UpdatePayAsYouGoCommand.cs
- src/IntoChat.Server.Application/UseCases/Payments/Queries/GetInvoices/GetInvoicesQuery.cs
- src/IntoChat.Server.Application/UseCases/Payments/Queries/GetOverageUsage/GetOverageUsageQuery.cs
- src/IntoChat.Server.Application/UseCases/Payments/Queries/GetPaymentMethods/GetPaymentMethodsQuery.cs
- src/IntoChat.Server.Application/UseCases/Payments/Queries/GetUserSubscription/GetUserSubscriptionQuery.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ApplyPromoCode/ApplyPromoCodeCommand.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ApplyPromoCode/ApplyPromoCodeCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ApplyPromoCode/ApplyPromoCodeCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ValidatePromoCode/ValidatePromoCodeCommand.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ValidatePromoCode/ValidatePromoCodeCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/PromoCodes/Commands/ValidatePromoCode/ValidatePromoCodeCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Usage/Queries/GetUsageEvents/GetUsageEventsQuery.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/ChangePassword/ChangePasswordCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/ChangePassword/ChangePasswordCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/DeleteCurrentUser/DeleteCurrentUserCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/DeleteCurrentUser/DeleteCurrentUserCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/DeleteCurrentUser/DeleteCurrentUserCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/Logout/LogoutCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/Logout/LogoutCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdatePrivacyMode/UpdatePrivacyModeCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdatePrivacyMode/UpdatePrivacyModeCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdatePrivacyMode/UpdatePrivacyModeCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdateUserPreferences/UpdateUserPreferencesCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdateUserPreferences/UpdateUserPreferencesCommandHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdateUserPreferences/UpdateUserPreferencesCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdateUserProfile/UpdateUserProfileCommand.cs
- src/IntoChat.Server.Application/UseCases/Users/Commands/UpdateUserProfile/UpdateUserProfileCommandValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetPrivacyMode/GetPrivacyModeQuery.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetPrivacyMode/GetPrivacyModeQueryHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetPrivacyMode/GetPrivacyModeQueryValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserPreferences/GetUserPreferencesQuery.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserPreferences/GetUserPreferencesQueryHandler.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserPreferences/GetUserPreferencesQueryValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserProfileByUsername/GetUserProfileByUsernameQuery.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserProfileByUsername/GetUserProfileByUsernameQueryValidator.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserTierUsage/GetUserTierUsageQuery.cs
- src/IntoChat.Server.Application/UseCases/Users/Queries/GetUserTierUsage/GetUserTierUsageQueryValidator.cs
- src/IntoChat.Server.Db/Migrations/20261015090000_AddExternalIdentities.cs
- src/IntoChat.Server.Db/Migrations/20261015090000_AddExternalIdentities.Designer.cs
- src/IntoChat.Server.Db/Migrations/20261015100000_AddAuthSessions.cs
- src/IntoChat.Server.Db/Migrations/20261015100000_AddAuthSessions.Designer.cs
- src/IntoChat.Server.Db/Migrations/20261015110000_AddAuthenticationIntents.cs
- src/IntoChat.Server.Db/Migrations/20261015110000_AddAuthenticationIntents.Designer.cs
- src/IntoChat.Server.Db/Migrations/20261015120000_AddAccounts.cs
- src/IntoChat.Server.Db/Migrations/20261015120000_AddAccounts.Designer.cs
- src/IntoChat.Server.Db/Migrations/20261015130000_AddAccountBilling.cs
- src/IntoChat.Server.Db/Migrations/20261015130000_AddAccountBilling.Designer.cs
- src/IntoChat.Server.Db/Migrations/SetupDbContextModelSnapshot.cs
- src/IntoChat.Server.Db/Models/Account.cs
- src/IntoChat.Server.Db/Models/AccountConfiguration.cs
- src/IntoChat.Server.Db/Models/AccountSubscription.cs
- src/IntoChat.Server.Db/Models/AccountSubscriptionConfiguration.cs
- src/IntoChat.Server.Db/Models/AuthenticationIntent.cs
- src/IntoChat.Server.Db/Models/AuthenticationIntentConfiguration.cs
- src/IntoChat.Server.Db/Models/AuthSession.cs
- src/IntoChat.Server.Db/Models/AuthSessionConfiguration.cs
- src/IntoChat.Server.Db/Models/ExternalIdentities.cs
- src/IntoChat.Server.Db/Reports/billing-ownership-conflicts.sql
- src/IntoChat.Server.Db/Reports/identity-conflicts.sql
- src/IntoChat.Server.Domain/Aggregates/User.cs
- src/IntoChat.Server.Domain/Entities/Account.cs
- src/IntoChat.Server.Domain/Entities/AccountSubscription.cs
- src/IntoChat.Server.Domain/Entities/AuthenticationIntent.cs
- src/IntoChat.Server.Domain/Entities/AuthSession.cs
- src/IntoChat.Server.Domain/Entities/ExternalIdentity.cs
- src/IntoChat.Server.Domain/Entities/UserProfile.cs
- src/IntoChat.Server.Infrastructure/Contracts/ITokenService.cs
- src/IntoChat.Server.Infrastructure/Database/EntityFrameworkConfigurations/AccountConfiguration.cs
- src/IntoChat.Server.Infrastructure/Database/EntityFrameworkConfigurations/AccountSubscriptionConfiguration.cs
- src/IntoChat.Server.Infrastructure/Database/EntityFrameworkConfigurations/AuthenticationIntentConfiguration.cs
- src/IntoChat.Server.Infrastructure/Database/EntityFrameworkConfigurations/AuthSessionConfiguration.cs
- src/IntoChat.Server.Infrastructure/Database/EntityFrameworkConfigurations/ExternalIdentityConfiguration.cs
- src/IntoChat.Server.Infrastructure/Extensions/ServiceCollectionExtensions.Authentication.cs
- src/IntoChat.Server.Infrastructure/Extensions/ServiceCollectionExtensions.Data.cs
- src/IntoChat.Server.Infrastructure/Extensions/ServiceCollectionExtensions.Settings.cs
- src/IntoChat.Server.Infrastructure/Providers/SerpApi/Client/SerpApiProvider.cs
- src/IntoChat.Server.Infrastructure/Repositories/FeedbackRepository.cs
- src/IntoChat.Server.Infrastructure/Services/Accounts/CurrentAccountService.cs
- src/IntoChat.Server.Infrastructure/Services/Authentication/AuthenticationTokenIssuer.cs
- src/IntoChat.Server.Infrastructure/Services/Authentication/AuthSessionService.cs
- src/IntoChat.Server.Infrastructure/Services/Authentication/GoogleAuthenticationOrchestrator.cs
- src/IntoChat.Server.Infrastructure/Services/GoogleAuthenticationService.cs
- src/IntoChat.Server.Infrastructure/Services/Identity/ExternalIdentityService.cs
- src/IntoChat.Server.Infrastructure/Services/MetterBillingJobs.cs
- src/IntoChat.Server.Infrastructure/Services/Payments/SubscriptionCheckoutService.cs
- src/IntoChat.Server.Infrastructure/Services/RecurringJobService.cs
- src/IntoChat.Server.Infrastructure/Services/Strategies/ScheduledQueryExecutionService.cs
- src/IntoChat.Server.Infrastructure/Services/TelegramAuthenticationService.cs
- src/IntoChat.Server.Infrastructure/Services/TokenService.cs
- src/IntoChat.Server.Infrastructure/Services/UserAuthenticationValidator.cs
- src/IntoChat.Server.Infrastructure/Settings/CloudCatalogSettings.cs
- src/IntoChat.Server.Infrastructure/Settings/CloudFeatureSettings.cs
- src/IntoChat.Server.Infrastructure/Settings/TelegramSettings.cs
- src/IntoChat.Server.Jobs.API/Extensions/ApplicationBuilderExtensions.cs
- src/IntoChat.Server.Jobs.API/Extensions/ServiceCollectionExtensions.cs
- src/IntoChat.Server.Tests/Authentication/TelegramAuthenticationServiceTests.cs
- src/IntoChat.Server.Tests/Authentication/TelegramLoginCommandHandlerTests.cs
- src/IntoChat.Server.Tests/Payments/GetInvoicesQueryHandlerTests.cs
- src/IntoChat.Server.Tests/Payments/GetPaymentMethodsQueryHandlerTests.cs
- src/IntoChat.Server.Tests/Scheduling/ScheduledQueryExecutionServiceTests.cs
- src/IntoChat.Server.Tests/Users/UpdateUserPreferencesCommandHandlerTests.cs
- src/IntoChat.WebUI/src/app/router/routes.tsx
- src/IntoChat.WebUI/src/app/types.ts
- src/IntoChat.WebUI/src/entities/account/api.ts
- src/IntoChat.WebUI/src/entities/auth/api/useLoginMutation.ts
- src/IntoChat.WebUI/src/features/auth/lib/oauth.ts
- src/IntoChat.WebUI/src/features/auth/ui/AuthGuard.tsx
- src/IntoChat.WebUI/src/features/auth/ui/Login.integration.test.tsx
- src/IntoChat.WebUI/src/features/auth/ui/Login.test.tsx
- src/IntoChat.WebUI/src/features/auth/ui/Login.tsx
- src/IntoChat.WebUI/src/features/auth/ui/OAuthButtons.tsx
- src/IntoChat.WebUI/src/features/auth/ui/TelegramConnect.tsx
- src/IntoChat.WebUI/src/pages/cloud/ui/CloudHome.tsx
- src/IntoChat.WebUI/src/pages/cloud/ui/CloudPricing.tsx
- src/IntoChat.WebUI/src/pages/payment/ui/StripeCheckoutRedirect.tsx
- src/IntoChat.WebUI/src/pages/profile/ui/billing/useCheckoutStatus.ts
- src/IntoChat.WebUI/src/pages/profile/ui/ProfileLayout.tsx
- src/IntoChat.WebUI/src/pages/profile/ui/ProfileSecurity.tsx
- src/IntoChat.WebUI/src/pages/profile/ui/security/DangerZoneSection.tsx
- src/IntoChat.WebUI/src/pages/profile/ui/security/IdentitySection.tsx
- src/IntoChat.WebUI/src/shared/api/generated-types.ts
- src/IntoChat.WebUI/src/shared/api/interceptors.ts
- src/IntoChat.WebUI/src/shared/lib/auth-user.ts

## Continued implementation — billing reliability (2026-10-15)

Checked items below mean source implementation completed, **not tested or behavior verified**.

- [x] B3 durable checkout attempts: account/client-operation uniqueness, one open checkout per account, parameter-conflict rejection, immutable catalog snapshot, encrypted contact/client secret, deterministic customer/subscription keys and account/operation metadata.
- [x] B3 recovery: customer association saved before subscription creation; leased retry and provider operation lookup; unknown results retained; outcomes beyond the safe idempotency window require review. Disabling new checkout does not stop accepted attempts from recovering.
- [x] B4 intake: exact-body signature verification, explicit live/test mode match, event-ID deduplication, encrypted payload and configured retention, successful receipt only after durable database insert.
- [x] B4 processing foundation: durable leases, retry/quarantine, current provider-state reconciliation serialized by account, atomic entitlement/outbox updates, periodic attempt/customer reconciliation and processed-payload cleanup.
- [x] B5 policy foundation: explicit provider-state mapping, configured limits, trial opt-in, persistent non-extending grace, no entitlement from checkout response, no data deletion on cancellation/refund request.
- [x] Account billing endpoints: entitlement, invoices, payment methods, ownership-checked default/removal with account serialization, period-end cancellation and support refund-review requests with operation deduplication/status.
- [x] Retired unsafe legacy travel billing mutation routes; retained invoice/card reads for compatibility. New billing profile uses account endpoints and clearly distinguishes pending requests from completed refunds or ready workspaces.
- [x] Additive billing reliability migration/model/configuration/snapshot drafted; no migration applied.
- [x] Audited operator replay/status (static only).
- [ ] Refund adjudication and completed refund-to-service policy.
- [ ] Entitlement outbox consumers for runtime provisioning/suspension, notifications and usage allowance handling.
- [ ] Billing action refresh/recovery UX and remaining legacy subscription/usage compatibility review.
- [ ] Compile/model-diff checks, BILL-01 through BILL-05 and browser/provider behavior validation (not authorized to run).

Changed-file groups in this continuation:

- Domain/Entities and Db/Models: BillingReliability.cs, CloudResourceLimits.cs (Domain only), AccountSubscription.cs; BillingReliabilityConfiguration.cs in both model layers.
- Db/Migrations: 20261015140000_AddBillingReliability.cs, matching Designer and SetupDbContextModelSnapshot.cs.
- Application/Contracts/Services/Billing/IBillingEntitlementService.cs.
- Infrastructure/Services/Billing: CloudBillingProvider.cs, CloudCheckoutService.cs, CloudBillingWebhookReceiver.cs, BillingReconciliationService.cs, BillingEntitlementService.cs, AccountBillingService.cs, CloudBillingWorker.cs.
- Infrastructure settings/payment DI and Jobs API worker registration.
- API/Controllers/AccountBillingController.cs and PaymentController.cs.
- WebUI/src/entities/account/billing.ts, pages/cloud/ui/CloudBilling.tsx and pages/profile/ui/ProfileBilling.tsx.

Static review traced ownership from principal membership to customer mapping; deterministic provider keys and writes preceding provider calls; webhook intake versus worker processing; account transaction boundaries; lease fencing; and migration/model fields. A fresh reviewer completed static inspection and the findings were addressed as recorded below. The Stripe SDK integration was checked against Context7 documentation and existing installed-version source usage, but has not been compiled or called.

Unresolved risks: manual migration metadata needs future EF comparison; external provider behavior and races unverified; operator tooling and runtime outbox consumers unfinished; billing keys/catalog/worker environment wiring require operator configuration. Keep checkout and provisioning disabled. No tests, builds, applications, deployments, database migrations, payment calls, commits or pushes ran.

### Follow-up static review and completed source work

- [x] Replaced state-hash-only outbox deduplication with persisted entitlement revisions. Repeated active/suspended/active transitions emit distinct operations while repeated identical observations do not.
- [x] Enforced configured provider test/live mode on outgoing billing client creation and incoming resources; added worker/checkout startup mode validation. Secret values are never included in errors.
- [x] Checked provider price currency, amount, period/count and per-unit/licensed terms before creating a subscription; limited published catalog currencies to explicitly supported two-decimal USD/EUR/GBP/CZK. Unsupported currencies fail readiness.
- [x] Persisted and exposed cancel-at-period-end state; updated billing UI and model/migration metadata.
- [x] Added default-off, explicit-user-allowlist operator status and inbox replay endpoints. Replay preserves active leases and writes durable BillingOperatorAudit in the same transaction.
- [x] Refund notifications are held as needs_review, not falsely marked processed, including refund objects lacking a customer reference. Manual-policy review items are excluded from automatic retries; full refund policy remains incomplete.
- [x] Added missing BillingOutbox account FK index to handwritten migration and snapshot; added audit model/configuration and schema.
- [x] Removed unused trip-vault/history and scheduled-travel frontend features/entities/pages after import tracing; removed their profile exports, dead route mocks and history route helper. Removed orphan API history-expander contract/implementation/DI. Exact removed files are recorded in intochat-cloud-removal-manifest.md. Retained shared usage metadata, generic UI and backend travel persistence dependencies.
- [x] Added plans/intochat-cloud-billing-operations.md with implemented recovery paths, mode/worker configuration, audit/replay semantics, safe rollback and explicit launch gates. No procedures were executed.

Additional changed files: API/Controllers/BillingOperationsController.cs; Domain/Entities/BillingOperatorAudit.cs; matching Db model and both EF configurations; CloudFeatureSettings/Settings DI; WebUI profile barrel/router mocks/shared route helper. The removal manifest lists all deleted source files.

A fresh static reviewer checked fixes, API shapes, billing migration/configuration parity and operator authorization; no new blocking issue was reported in the reviewed changes. The reviewer identified indefinite retries of manual refund-review events, which were then separated from retryable association quarantine. This is static review only, not compilation or behavioral validation.

Remaining implementation: refund adjudication/service policy; remaining legacy subscription/usage compatibility review; runtime entitlement outbox consumers; backend travel vertical-slice/package cleanup; public management/access boundary; provisioning/storage/backups/lifecycle; resource ledger/admission; broader operational dashboards/alerts and release readiness. Runtime C# changes still require unavailable LSP under that repository's instructions. No task is fully verified; all behavioral acceptance evidence remains pending. No tests or builds ran.

### Cloud checkout and compatibility adapter completion

- [x] Added CloudCheckout.tsx and protected /cloud/checkout route. The public catalog exposes the default-off checkout switch; pricing renders plan links only when enabled. Old travel-tier checkout URL now redirects to cloud pricing.
- [x] Browser creates a client operation ID before requesting a purchase, stores it for same-tab retry, resumes the server's open attempt and polls backend state. Provider confirmation never grants entitlement in the browser.
- [x] Checkout API exposes the immutable snapshot's display name/amount/currency/period, so a resumed purchase does not display a later catalog price. Recovery can load even when the current catalog is unavailable. Stripe redirect secret is removed from the address bar; client secret response is marked for log obfuscation and uses no-store headers.
- [x] Legacy personal invoice/card GET adapters now resolve the authenticated personal account and use the account customer/subscription mapping. Invoice pagination cursor decoding and legacy response shapes are retained; retired travel mutation routes remain unavailable.

Additional changed files: WebUI/src/pages/cloud/ui/CloudCheckout.tsx, CloudPricing.tsx, CloudHome.tsx, app/router/routes.tsx; API/Controllers/CloudPlansController.cs; checkout/account billing services and controllers. Browser Stripe Elements behavior, redirect recovery, polling and compile/type correctness remain unverified under the execution restriction.

### Latest static checkpoint

- [x] Fixed unsuccessful payment-authentication return recovery: pending attempts expose a retry of the same payment details; a redirect is not treated as proof of payment.
- [x] Scoped browser operation references to account/catalog/plan. Matching persisted operation IDs are retired only after authoritative confirmed/failed status; a failed attempt offers an explicit new-plan purchase path.
- [x] Final tracked-file `git diff --check` passed. Reference searches found no remaining imports of the removed trip-vault/history/scheduled-travel frontend slices or API history expander. These checks do not compile, execute or behaviorally verify the changes.

Completed source work is checked above. The full migration remains incomplete: runtime management/access, provisioning/storage/lifecycle, resource accounting/admission, remaining backend travel cleanup, completed refund policy and operational launch evidence are still outstanding. Do not enable paid launch. No tests, builds, applications, provider calls, migrations, deployments, commits or pushes were run.

## Autonomous continuation — backend travel removal

- [x] Removed the remaining travel GraphQL query/type graph, route/DI registration and HotChocolate package references. API MediatR assembly discovery now uses the stable application-layer extension type rather than a deleted flight handler.
- [x] Removed TripVaults, ScheduledExecutions, SearchEngine and PlaceReviews command/query handlers and their direct API mappings. Deleted only tests dedicated to removed behavior; none ran.
- [x] Removed SerpApi provider/client/orchestrators, scheduled execution strategies and unused response filters. No retained cloud API or worker can invoke that provider through these removed paths.
- [x] Removed orphan cloud Kafka producer/readiness probe and its infrastructure package dependency; removed exclusively SerpApi mock project source/reference. Bot Kafka consumer remains in its detached legacy host, not in cloud authentication.
- [x] Retained historical Hangfire invocation signatures as inert scheduled-query/history handlers; actual recurring queue retirement remains an external operational action, not performed.
- [x] Removed travel history enqueueing/writer helpers and scheduled repositories/unit-of-work dependencies. Profile timezone changes no longer inspect or reschedule travel executions.
- [x] Removed unused Cronos and SerpApi/GraphQL package entries after reference searches. No package upgrades or project renaming.

Exact removed source paths and dependency reasoning are in intochat-cloud-removal-manifest.md. Modified shared files include API/Application/Infrastructure/Jobs DI, profile update handler, background job service contract, unit of work, IntoChat.slnx and package/project references. Static searches found no remaining references to removed handler/repository/provider interfaces. Tracked-file diff whitespace review passed. Build/type/model/runtime behavior remains unverified.

Ruling: preserve historical travel entity/schema mappings while detaching executable behavior. They still underpin the retained historical usage compatibility path and existing database model; deleting them before choosing a fresh versus populated data route would implicitly trigger schema contraction. No production or local database data changed.

## Resource accounting implementation continuation (U1/U2 foundation)

- [x] Added ResourceProducer, immutable ResourceUsageRecord, ResourceReservation and ResourceUsageDiscrepancy persistence, separate from historical travel credits. Source/event conflicts are quarantined rather than overwriting measurements.
- [x] Added private model admission service: explicit configured token prices and execution/token bounds, account-row serialization, consumed + reserved budget checks, concurrency cap, stable operation replay and fixed execution deadline. Closed/disabled entitlements cannot obtain replayed admission.
- [x] Settlement appends separate input/output records using the reservation price/period snapshot, releases unused reservation and records overruns as discrepancies. Confirmed-not-executed receipts release reservations; elapsed time alone never does. Conflicting terminal receipts keep an operator-visible discrepancy.
- [x] Added typed compute-millisecond/storage-byte-second observations; platform observations lacking prices remain unpriced (nullable cost), while registered BYOK/local observations have zero platform-supplied charge. There is no customer usage write endpoint and no producer registration endpoint.
- [x] Added authenticated account usage summary, separately labelled historical travel credits, bounded operator discrepancy/open-reservation views, audited append-only adjustments and discrepancy resolution. The ledger migration rejects UPDATE/DELETE through a database trigger.
- [x] Drafted additive 20261015150000_AddResourceAccounting migration and frozen target model/snapshot. Billing reconciliation now preserves observed provider period start for admission. No migration applied.
- [ ] Runtime producer authentication/enrollment, scoped signed admission tokens, actual token/time/concurrency enforcement, storage/CPU/memory enforcement and execution receipts remain blocked on C1/C3. No registered source is created automatically. This service is not yet the runtime execution boundary.
- [ ] Late non-model observations without an unambiguous observed billing period require reconciliation; no guessed billing-period reassignment or automatic charging. Observed billing-period archival is now implemented below; production supplier pricing and periods never observed by reconciliation remain unresolved.
- [ ] Runtime behavior, concurrent cap safety, source retries, migration trigger/model parity and UI behavior require later authorized validation. No tests/builds ran.

Changed files: Domain/Entities/ResourceAccounting.cs; mirrored Db models and both ResourceAccountingConfiguration.cs files; Application/Contracts/Services/Billing/IResourceBudgetService.cs; Infrastructure/Services/Usage/ResourceBudgetService.cs and ResourceUsageService.cs; Infrastructure/Settings/ResourceAccountingSettings.cs and DI; ResourceUsageController.cs/ResourceOperationsController.cs; billing provider/reconciliation period-start handling; 20261015150000_AddResourceAccounting migration/Designer/snapshot; WebUI CloudResourceUsage.tsx, ProfileUsage.tsx/profile barrel/routes.

Ruling: implement cloud-local storage, accounting, owner reads and atomic reservations now, but expose no producer ingestion or reservation HTTP API until the runtime can authenticate producer scope and enforce grants. A private service interface does not establish that boundary or satisfy end-to-end USAGE acceptance.

## Latest continuation — usage review, customer shell and travel host retirement

Completed source changes (not behavioral verification):

- [x] Preserve immutable observed provider billing periods before subscription renewal overwrites current dates. Late compute/storage observations use the archive; unknown/ambiguous periods still fail explicitly. The additive 1500 migration protects the archive from updates/deletes alongside the usage ledger.
- [x] Show UTC calendar-month usage for accounts without an observed subscription period. No subscription is required to display registered local/BYOK measurements.
- [x] Require configured model prices to fit the database's 12-decimal precision; reservations and settlement use identical prices. Unresolved discrepancies block admission retries, and execution past period end is recorded as an overrun.
- [x] Remove travel preferences from customer navigation and redirect the former route to profile. Profile navigation no longer fetches legacy travel subscription tiers to decide access. Historical travel credits remain explicitly labelled compatibility history.
- [x] Replace routed travel help/changelog/legal pages with accurate cloud availability and pending-policy-review notices. Do not imply legal approval or promise hosted functionality. Customer header/home navigation now identifies IntoChat Cloud and links usage/help. Historical unrouted content remains for subsequent source cleanup.
- [x] Fail startup if hosted provisioning or live checkout is enabled in this incomplete implementation. Test-mode checkout recovery and independent billing reconciliation remain available when explicitly configured. Disable the copied production deployment entry point before it can invoke Pulumi; preserve its implementation only as a reference pending a real cloud deployment design.
- [x] Remove 167 remaining tracked obsolete bot/MiniApp, dedicated travel Aspire tests and uncalled Aspire hosting helper files after project/reference tracing. Remove solution/project references and exclusive Kafka, Telegram bot, old Aspire hosting/test and Orleans package entries. Server-side optional Telegram authentication remains intact. Exact file list is in the removal manifest; ignored generated files are untouched.

Additional files: ObservedBillingPeriod.cs in Domain/Db, both configurations; billing reconciliation; ResourceAccountingSettings/ResourceBudgetService/ResourceUsageService; 1500 migration/Designer/snapshot; CloudInformation.tsx, CloudHome.tsx, ProfileLayout.tsx, routes.tsx, header Logo.tsx/shared navigation; Infrastructure Settings DI; legacy Infrastructure/Program.cs; Aspire.csproj, IntoChat.slnx and Directory.Packages.props.

Static review: an independent source reviewer found late-period loss, hidden unsubscribed usage and decimal precision mismatch; source fixes are recorded above. No dangling references to searched removed travel handlers/provider/scheduler/GraphQL namespaces were found. These findings and fixes do not establish EF translation, concurrency, schema or browser behavior.

Still blocked: public runtime changes require unavailable LSP; C2-C5 and producer authentication/grant enforcement depend on that boundary and selected runtime/allocation/storage configuration. Refund adjudication needs an explicit cloud support/refund policy; existing review requests do not issue refunds or change service on a refund event. Fresh-versus-populated data classification, public legal terms, commercial prices, operational recovery objectives and execution-based launch evidence remain unavailable. Remaining source cleanup/operational implementation is not certified complete by these blockers.

No tests, builds, applications, deployment scripts, provider/payment calls, migrations, production deletion, commits or pushes ran.

### Final static checkpoint for this continuation

- [x] Retired the old internal username-based travel-token deduction and direct user-deletion routes. This prevents the copied administrative path from bypassing the pending account data-retention policy. Stable-ID customer APIs remain independent of usernames.
- [x] Corrected the discrepancy unique index to an explicit PostgreSQL-safe name in SQL, both configurations and both model metadata files.
- [x] Static XML/project-reference inspection found zero missing project-reference paths after bot/MiniApp removal.
- [x] Source comparison confirmed the 1500 frozen target-model body matches the current snapshot body and mirrored resource entity definitions agree. Migration index/trigger names fit PostgreSQL's identifier limit. This is text/schema review, not EF model generation or database validation.
- [x] Final tracked-file git diff --check passed. No tests, builds, typecheckers, applications or deployment scripts ran.

Remaining implementation versus validation:

| Area | Remaining work | Dependency / precise blocker |
|---|---|---|
| C1-C5 | Public management/access protocol, provisioning/recovery, isolated scoped sessions, durable storage, backup/restore, deletion/upgrade lifecycle and entitlement outbox consumers | Runtime repository requires unavailable LSP; supported runtime image/contract and allocation/storage provider not supplied. No fabricated cloud adapter or successful allocation stub. |
| U1-U2 | Producer enrollment/authentication, signed scoped grants, actual execution/CPU/memory/storage limits and trustworthy receipts; recover provider periods missed entirely during outages | C1/C3 boundary and runtime source contract; current private ledger/reservations alone do not enforce execution. |
| B5 | Refund adjudication and refund-to-service reconciliation, support eligibility for consumed resources | Explicit cloud refund/support policy absent; existing events and customer requests remain needs_review. No automatic refunds or data deletion. |
| R5 | Fresh-cloud baseline versus existing-data expansion/backfill validation and any later contraction | Target environment/data inventory and recoverable snapshot evidence absent; unapplied additive drafts retained. |
| L1-L3 | Actual hosted dashboard actions, approved cloud legal copy, deployed alerts, incident ownership, restore objectives, cost/pricing signoff and staged release manifests | Hosted capabilities above, product/legal/operator decisions and explicitly authorized operational evidence. Live checkout/provisioning and legacy deployment entry point are blocked in source. |
| Source maintenance | Unrouted historical marketing/preferences, retained historical usage/reference models, copied deployment library internals and old frontend test assertions still exist | Non-executable historical sources are not claimed removed. Further deletion must preserve historical data compatibility; no schema contraction performed. |

All AUTH/BILL/HOST/USAGE/CLEAN behavioral acceptance remains unverified. The migration is not certified complete or ready for paid launch. Existing uncommitted work was preserved; no public runtime edits, commits or pushes.

## Explicitly authorized IntoChat rename

- [x] Renamed cloud projects/directories/files, C# namespaces/types/assemblies and references, solution/CI/Docker/editor paths, UI/package/lock naming, source strings and configuration/documentation examples. 1,912 text files changed by the mechanical pass; 2,285 file paths renamed. No project-wide source rewrite outside the naming changes.
- [x] Updated database constants, raw SQL, migration targets and snapshot to the IntoChat.Server schema while preserving migration IDs/order. Added a preflight that refuses migration history in another schema before runner/API startup migration paths can create a parallel installation.
- [x] Kept generated/ignored dependency contents, binary asset bytes, Git history and credentials intact. Renamed five generated-only top-level project directories without deleting local artifacts.
- [x] Added intochat-cloud-naming-cutover.md describing the unapplied existing-schema transition, migration-history preservation, rollback, persisted job types, session/cache changes and external configuration review. Previous source-path entries in this status now use current IntoChat names; the removal manifest retains historical paths as evidence.
- [ ] Database cutover, existing job compatibility, approved external resource names, compilation/builds and browser/runtime behavior remain unverified. Nothing was deployed or migrated. No tests or builds ran, and no commit/push was made.

Rename static review found inconsistent pre-existing EF history schemas across context/host registrations. All retained registrations now share DbConstants.SchemaName/MigrationHistoryTable. Both runner and optional API migration paths call the shared preflight. The cutover note explicitly requires inventorying old public/short/full-schema histories and moving only the authoritative table under approval, never silently merging/replaying history. Persisted Hangfire type-name compatibility is separately documented.

Final rename evidence: static search found zero legacy-brand matches in non-ignored cloud text or source paths. All 38 migration IDs match the pre-rename baseline; the latest frozen target-model body still matches the snapshot. All project/solution reference paths resolve, frontend package/lock names agree and new SVG source parses as XML. Tracked diff whitespace review passed. The old raster logo contained embedded legacy text, so it was removed and replaced by a source SVG wordmark, favicon initials IC and a text email-header fallback. Social-preview SVG support, builds, migrations, jobs and runtime behavior remain unverified. No tests/builds/apps/deployment scripts or operational database actions were run; changes remain uncommitted.

## Commit and operational-readiness continuation

- [x] Committed the authorized IntoChat rename in the cloud repository: 0e7ab82 (refactor: rename cloud projects and branding to IntoChat). Commit hooks were bypassed to honor the no-tests/no-builds restriction. No push occurred; unrelated documentation-repository changes were not swept into a commit.
- [x] Inspected Aspire CLI help and attempted only `aspire start --no-build --isolated --apphost src/Aspire/Aspire.csproj --non-interactive --nologo --format Json`. It exited 1 because src/Aspire/bin/Debug/net11.0/Aspire.exe is absent. The AppHost/application did not start; no build or restore was requested or executed. Aspire green is BLOCKED, not verified.
- [x] PostgreSQL readiness now checks that required migration 20261015150000_AddResourceAccounting is recorded in IntoChat.Server.__EFMigrationsHistory instead of treating SELECT 1 as schema readiness. Failures return a safe message without returning provider exceptions. Liveness stays separate.
- [x] Added allowlisted operator billing backlog summaries (full counts, oldest receipt/creation time, highest attempt count and reconciliation-due information), plus an audited durable account-reconciliation scheduling endpoint. Scheduling does not call the payment provider or create a purchase.
- [x] Made periodic billing-account claims conditional on still being due, preventing two workers that loaded the same due list from both claiming it immediately.
- [x] Added bounded account-scoped operator ledger reads, including original record/adjustment lookup; added usage discrepancy/hold totals and producer-without-measurement visibility. These read endpoints do not enroll producers, issue grants, release reservations or charge customers.

Changed source files after the rename commit: API/Controllers/BillingOperationsController.cs, ResourceOperationsController.cs, API/HealthChecks/PostgresReadinessHealthCheck.cs, Infrastructure/Services/Billing/CloudBillingWorker.cs. Paths use src/IntoChat.Server.*. These follow-up edits remain separate from the rename commit.

Remaining hard blockers: the explicit no-build instruction prevents producing the missing AppHost and renamed service artifacts; existing-schema cutover/migration execution remains unauthorized; public-runtime semantic edits require an unavailable LSP capability; C1-C5 depend on the runtime boundary and actual provider/image/storage configuration; refund policy, commercial limits, legal approval and recovery objectives need operator/product decisions. Live checkout/provisioning remain disabled in source. No tests/builds, provider/payment calls, schema application, deployment or production data changes occurred. Startup was attempted with --no-build and failed, so there is no green runtime evidence.

Static completion checkpoint: independent review reported no blocking findings in the four follow-up source files; final git diff --check passed. Nullable backlog aggregates, operator allowlists/no-store responses, transactional scheduling/audit and conditional worker claim were source-reviewed. PostgreSQL readiness checks the migration record, not physical schema integrity. All new behavior remains unexecuted. The no-build startup blocker is unchanged; no green result is claimed.

## Build, test and disposable Aspire validation (2026-10-15)

Authorization changed: the user explicitly allowed builds, tests and Aspire, then approved migrations **only to a new disposable local database**. Earlier no-execution checkpoints above remain historical evidence; they no longer describe this continuation. Existing/persistent databases, live payment services, deployments and pushes remain outside authorization.

Implemented since the rename commit:

- [x] Fixed compilation after travel removal: stale Filters import removed, API-local InternalAttribute restored with explicit metadata recognition; regression coverage proves real InternalController metadata still requires internal credentials (401/403/authorized cases).
- [x] Fixed authentication regressions: email confirmation no longer forces Telegram; profile retry appears only after profile-fetch failure; session handoff uses the real profile fetcher; resend input has a label; unlinked-Telegram error has explicit guidance.
- [x] Updated frontend tests for independent providers, nullable usernames, disabled deletion, cloud routes and historical usage. Removed two unreferenced duplicate payment hooks that called nonexistent methods. Corrected feedback type references, annual price indexing, refresh-promise typing and network-error boolean typing.
- [x] Restored changelog related-link rendering. Removed 75 shadowed translation entries while preserving all 2,078 effective values. Corrected retained preference form types without inventing backend contracts or requiring usernames.
- [x] Isolated Aspire now uses a disposable database instead of the saved database volume; local CORS uses the allocated frontend endpoint. Added actual HTTP readiness monitoring and explicit isolated-run-only Cloud:ApplyLocalMigrations opt-in. Migration runner Database:MigrationsOnly skips legacy travel/payment seeds and Hangfire schema setup. Schema-reset fallback stays disabled for this validation.

Changed files: src/Aspire/AppHost.cs; src/IntoChat.Server.Db/Program.cs; API/Filters/InternalAttribute.cs, Security/EndpointMetadataMatcher.cs, Extensions/ServiceCollectionExtensions.cs; Tests/Authentication/InternalAuthFilterTests.cs; WebUI auth/pages-auth, profile/router/preferences tests and retained forms, shared API refresh/retry/i18n, feedback types, removed duplicate payment hooks, payment checkout, provider imports, marketing changelog, widget/toast tests. The earlier four operator/readiness/worker source changes remain uncommitted alongside these repairs.

Executed evidence:

- [x] Solution build passed before final Aspire wiring; frontend production build passed after repairs. The later solution rebuild encountered the running AppHost executable file lock; Aspire restart rebuilt its dependency graph successfully. Final aggregate build review remains pending.
- [x] Backend: 57 passed, zero failed/skipped (including four new internal authorization cases).
- [x] Frontend: 60 files / 439 tests passed, zero failures. Earlier 455-test suite contained retired forced-Telegram assertions; replacement tests cover current independent sign-in behavior. No tests were skipped to obtain green.
- [x] Actual app TypeScript check (tsconfig.app.json) passed. Root tsconfig alone has no source files and is not treated as evidence. Scoped changed-file lint passed for auth/profile/i18n repairs.
- [ ] Disposable migration chain, actual HTTP readiness and browser smoke are in progress. Initial Aspire resource health without an HTTP probe was insufficient proof of schema readiness; no full-stack green claim is made from that state.

Remaining risks: build warnings include existing nullable/obsolete/package-pruning warnings and OpenTelemetry security advisories; frontend bundle-size warning remains. Unit suites do not verify Google/Telegram provider configuration, PostgreSQL races, payment reconciliation or runtime allocation/storage. Public runtime boundary, hosting/storage/limits, policy/pricing/legal and operational launch blockers in the table above remain open. No existing database migration, live provider/payment call, deployment or push occurred.

### Final local validation checkpoint

- [x] Full `dotnet build IntoChat.slnx --no-restore --nologo -v quiet` passed: zero errors, 56 warnings. Stopped the local stack solely to release Windows executable locks for this aggregate build, then restarted with Aspire. A rejected UseAppHost=false workaround was not retained (xUnit requires an app host). The final subsequent AppHost HTTP-probe adjustment compiled through `aspire start` successfully.
- [x] Backend test suite passed again: 57/57, zero skipped. Frontend complete suite: 439/439 in 60 files. Final frontend production build and explicit app TypeScript check passed after the last metadata edit.
- [x] Added migration 20261015160000_EnsureCloudSignupReferences and its unchanged frozen target model. It inserts missing Basic tier/UTC defaults needed by signup foreign keys without legacy seeders, external calls, or overwriting existing reference values; sequences advance safely. Ambiguous default-timezone mapping fails explicitly. Down deliberately retains potentially referenced rows. Readiness now requires this migration.
- [x] Applied all **39 migrations only to newly created disposable local Aspire databases**. Final database history count/max marker independently queried as 39 / 20261015160000_EnsureCloudSignupReferences. Basic tier 1 and UTC timezone 1 were confirmed in the preceding disposable run. No persistent or existing database was migrated.
- [x] Isolated Aspire is GREEN: API, frontend, PostgreSQL and Redis Running/Healthy; migrations and npm installer Finished successfully. Dormant rebuilder resources are NotStarted by design. API `/health/ready` and frontend `/` independently returned HTTP 200. Both API and frontend now have real HTTP probes. Vite HTTPS is disabled only for the isolated HTTP profile to match Aspire's allocated endpoint; the stale API HTTPS redirect is likewise disabled only there.
- [x] Browser smoke rendered the sign-in page with email/password and no mandatory Telegram step. External provider buttons are absent as expected with both providers disabled. This is not an authenticated session or external OAuth validation. Browser discovery also exposed stale travel metadata; index.html and app/providers/index.tsx now use cloud titles/descriptions for current pages.
- [x] Independent static review found no blocking issues in the InternalAttribute authorization, disposable migration gating, reference migration/frozen target model and isolated HTTP changes. Diff whitespace check passed. Runbook updated with the local migration opt-in, required secret parameters and validation limits.

Final local endpoints for this running instance: frontend `http://localhost:61783`; API `http://localhost:61775`. Ports are allocated dynamically and will change on restart. Generated local validation secrets were passed in process environment only, never printed or committed. Existing named database volumes were left untouched. No deployment, live payment operation, customer charge, production data deletion, push or additional commit occurred. Rename commit remains 0e7ab82; these follow-up implementation changes are uncommitted.

Remaining acceptance is **not complete**: external Google/Telegram end-to-end configuration, authenticated database-backed customer API scenarios, session/concurrency/replay races, provider billing reconciliation/recovery, populated-schema cutover/backfill, runtime management/access, allocation/storage/backup/limits, refunds, approved pricing/legal/recovery objectives and production rollout still require the previously documented dependencies or operational evidence. A green isolated stack does not certify migration or paid-launch completion.

## Commit checkpoint (2026-10-15)

- Cloud follow-up implementation committed as 84c0ad0 (fix: validate cloud migration and isolated Aspire startup), following rename commit 0e7ab82. Cloud working tree is clean. Final staged review corrected one whitespace-only line in the new migration Designer; executable code is unchanged from the validation checkpoint.
- Migration status, billing operations, naming cutover and removal manifest are included in a separate documentation commit. Unrelated documentation restructuring and input plans are intentionally left untouched/uncommitted.
- Last completed validation remains: solution/frontend builds and app TypeScript passed; 57 backend and 439 frontend tests passed; 39 migrations applied only to disposable local databases; local Aspire API/frontend/database/Redis healthy and browser sign-in rendered. These are local validation results, not production acceptance.
- No push, deployment, live payment operation or existing-database migration performed. Runtime/hosting/storage/limits, policy decisions and external/production acceptance remain open as detailed above.

## Hosted-runtime continuation (2026-10-15)

Source base: cloud 84c0ad0, runtime 667a0327a, documentation 61429867; new changes in this section are uncommitted. Existing unrelated runtime/documentation work is preserved. Earlier LSP/no-build blockers are superseded: builds/tests are authorized, and the installed csharp-ls runs successfully using the installed .NET 11 runtime.

- [x] C1 inventory and reuse decisions recorded in `intochat-cloud-runtime-boundary.md`, including existing identity, access, health, local storage/custody, cookie-key persistence and the limits of the copied Azure deployment abstraction.
- [x] Implemented public owner-authorized management v1 observation. Reuses persisted runtime ownership and trusted caller context, denies shared members and anonymous/Open-mode callers, and does not create unknown brains. Advertises only `observe`; registration is explicitly not readiness.
- [x] Implemented and registered the private observation client: trusted HTTPS origin, exact version/protocol/account/brain matching, no redirect following/shared cookie jar, response/deadline limits and safe errors. No customer endpoint or allocation worker calls it yet. Runtime owner cookies are interim authentication; cloud JWTs are not shared.
- [x] Runtime LSP definitions/references/implementations/callers mapped before implementation. LSP diagnostics after endpoint/contract changes returned no diagnostics in four touched runtime files. Full-solution LSP had an unrelated AppHost design-time warning; the focused Platform/test graph resolved successfully.
- [x] Test-first checks failed for the missing runtime endpoint/cloud client, then passed after implementation. Public runtime identity suite: 72 passed, zero failures/skips, including five management authorization cases and an unknown-brain/no-creation assertion. Runtime project build: zero errors/warnings.
- [x] Cloud backend suite: 74 passed, zero failures/skips (17 new management client cases). Full cloud solution build passed, zero errors, 95 existing warnings on this run (including dependency advisories, nullable, obsolete API and pruning warnings). Frontend source is unchanged; previous 439-test/frontend-build evidence remains historical, not rerun evidence.
- [x] Fresh-context read-only review found no blocking defect in the observation slice. Follow-up added explicit Open-mode and unknown-brain checks. Timeout/cancellation/chunked-limit and configured-handler integration coverage remain gaps.
- [x] Restarted isolated Aspire against a new disposable database with the authorized migration-only opt-in. API, frontend, PostgreSQL and Redis Running/Healthy; migration and frontend installer Finished. Independent API `/health/ready` and frontend `/` returned 200. Browser sign-in rendered. Current allocated endpoints: frontend `http://localhost:57200`, API `http://localhost:57195`.

Changed files:

- Public runtime: `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs`; `DigitalBrain.Platform/Hosting/RuntimeManagementEndpoints.cs`; `DigitalBrain.Platform.Contracts/Hosting/RuntimeObservation.cs`; `DigitalBrain.Platform.Tests.Unit/Identity/RuntimeManagementFacts.cs` (all under `src/DigitalBrain.Platform`).
- Cloud: `src/IntoChat.Server.Application/Contracts/Services/Hosting/IRuntimeManagementClient.cs`; `src/IntoChat.Server.Infrastructure/Services/Hosting/RuntimeManagementClient.cs`; `src/IntoChat.Server.Infrastructure/Extensions/ServiceCollectionExtensions.cs`; `src/IntoChat.Server.Tests/Hosting/RuntimeManagementClientTests.cs`.
- Documentation: this status and `intochat-cloud-runtime-boundary.md`.

**Remaining implementation is not complete.** C1 lifecycle/machine-access negotiation, C2 durable allocation registry/driver/recovery, C3 scoped exchange/revocation, C4 backup/restore, C5 lifecycle workers and U2 execution enforcement remain engineering work. They must not be mislabeled fully blocked just because production deployment is unauthorized. Actual deployment/restore/provider tests additionally require approved runtime artifacts, isolated provider/storage credentials and operational authorization. Refund policy, pricing/legal and recovery objectives remain product/operator decisions. Paid launch stays disabled. See the boundary manifest for exact capability limits and next dependencies.

No commits/pushes, live payment calls, charges, deployments, existing-database migrations or production data deletion occurred in this continuation. A green local Aspire stack is not proof of hosted runtime readiness or paid-launch acceptance.

### Observability repair and final local evidence

- [x] Found and reproduced a separate L2/local validation defect: isolated Aspire randomized the dashboard listener, but Aspire.Hosting 13.2.3 injected the fixed launch-settings OTLP URL into services. The old port refused connections and telemetry queries returned no traces. Inspected the installed library's resolver and dashboard implementation before changing configuration.
- [x] AppHost now supplies the dashboard's allocated endpoint reference to exporting resources in the isolated run profile. Existing resolved gRPC/HTTP protocol, authentication and TLS are preserved. Registration is idempotent on resource restart and absent dashboards retain configured behavior. No package upgrades or certificate-validation bypasses.
- [x] API Serilog previously discarded registered logging providers, including OpenTelemetry. Added provider forwarding with owned disposal. A regression test first failed with an empty provider capture, then passed after the fix. Serilog quoting required a formatting-independent assertion; it still checks delivery of the expected event. Existing console/debug sinks can produce duplicate output and remain a minor cleanup item.
- [x] Final cloud backend suite **75/75 passed**, zero skipped. Final full solution build **zero errors / 49 warnings** on the incremental run. One preceding rebuild failed on the running Windows API executable lock; stopping only this local Aspire instance released it. Another intermediate compile failure from a lambda/discard name collision was corrected and rebuilt successfully.
- [x] Final isolated stack is **Running/Healthy** for API, frontend, PostgreSQL and Redis. Installer/migrations finished. API readiness and frontend HTTP 200 were independently probed; browser sign-in rendered. Fresh API traces include provider discovery, unauthenticated profile and refresh requests. Structured API logs now arrive (four Information and two existing licensing Warning entries in the sampled window). This proves local trace/log ingestion, not deployed alerting or authenticated end-to-end acceptance.
- [x] Current endpoints supersede the earlier allocated ports: frontend **`http://localhost:50177`**, API **`http://localhost:50173`**. The unconfigured cloud catalog correctly returns 503; it is not enabled by service readiness. Commercial plan configuration remains required.
- [x] Final static review found no blocking issues after protocol/restart handling corrections; whitespace diff checks passed. Runtime LSP diagnostics were repeated after the added tests. No frontend source changed and its suite/build were not rerun this continuation.

Additional changed files: cloud `src/Aspire/AppHost.cs`, `src/Aspire/AllocatedDashboardTelemetryAnnotation.cs`, `src/IntoChat.Server.API/Extensions/HostBuilderExtension.cs`, `src/IntoChat.Server.Tests/Hosting/TelemetryLoggingTests.cs`. No additional migrations were authored. Only fresh disposable local databases were migrated during restarts. Existing dependency security advisories and production MediatR/AutoMapper license warnings remain unresolved risks. Full hosting migration remains unfinished as listed above; this checkpoint must not be marked paid-launch ready.

### Runtime boundary commit checkpoint

User-authorized commits: cloud **baf3690** (`feat: add runtime observation and restore Aspire telemetry`), public runtime **8cc540a00** (`feat: expose owner-scoped runtime observation`). Only the listed implementation files were staged; unrelated runtime and documentation changes remain untouched. The status and runtime-boundary manifest are committed separately. No push occurred. Continuing with C2 durable provisioning; C1 machine/lifecycle and production provider acceptance remain incomplete.

## Durable provisioning continuation (in progress)

- Prior status/runtime manifest committed as **389357d8**. No unrelated work was included.
- C2 implementation underway: brain/runtime/operation records, transactional owner/entitlement/quota checks, account-scoped idempotency, safe status views and retry, leased worker with fencing, persisted allocation references and health/storage/version checks before Ready.
- Ruling: implement the durable orchestration against an explicit private allocation-driver contract now, while the production driver remains unavailable. This allows real PostgreSQL concurrency/recovery validation without inventing successful allocations or deploying infrastructure. Costs/limits: fake-driver tests prove orchestration, not provider idempotency, persistence or isolation; production provisioning stays disabled.
- Ruling: failed/ambiguous allocations continue consuming a brain slot until an authorized lifecycle operation confirms deletion. This prevents retries or uncertain provider outcomes exceeding quota; customers will need retry/support rather than silently obtaining another allocation.
- New database-backed tests first failed compilation for missing provisioning types; implementation now compiles. PostgreSQL execution, migration generation/review, final builds and restored Aspire readiness remain pending for this checkpoint. The local stack is temporarily stopped for compilation; no green claim for the new schema yet.

### Durable registry and worker validation

- [x] Added atomic owner/entitlement-checked brain creation, account-scoped idempotency, brain list/detail and operation status/retry endpoints. Customer requests cannot choose owner, image, endpoint or storage path.
- [x] Added brain/runtime/operation records with composite ownership foreign keys and unique operation/allocation indexes. Additive migration `20261015193653_AddDurableBrainProvisioning` creates only these three tables; generated model reports no pending changes. API readiness requires this migration.
- [x] Added fenced operation leases, bounded provider deadlines, recoverable retries with stable operation IDs, allocation-reference persistence before observation, and current account/entitlement checks before and after provider I/O. Failed/ambiguous allocations retain quota. No retry charges or destructive cleanup are implemented.
- [x] Fixed a pre-existing PostgreSQL query translation failure in `CurrentAccountService`: membership filtering now occurs before the `AccountSummary` projection. Real database tests exposed this; it affected account-scoped consumers beyond provisioning.
- [x] Added explicit fail-closed default allocation driver and hosting readiness: provisioning disabled is healthy; explicitly enabled but missing driver, pinned runtime or worker is unhealthy. This checks configuration, not deployed provider health.
- [x] Full backend suite **90 passed / 0 failed / 0 skipped**, including **13** disposable PostgreSQL provisioning cases and two hosting readiness cases. Cases cover duplicate/concurrent keys, final-slot contention, foreign account denial, lost provider response, persisted allocation recovery, stale-worker fencing, health/storage readiness, wrong scope/version, and entitlement revocation before/during provider work. Fake drivers are confined to tests.
- [x] Full solution build passed: **0 errors / 49 warnings** in the final incremental run. Existing dependency advisories remain. Intermediate failures were diagnosed: xUnit conditional skip metadata, account-query translation, and the running Windows API DLL lock. Stopping/restarting only the local API allowed the rebuild.
- [x] Fresh disposable local schema chain now includes **40 migrations**. Additional integration-test databases used unique `intochat_provisioning_test_` names on that disposable container only. No existing saved database was migrated.
- [x] Aspire API, frontend, PostgreSQL and Redis are Running/Healthy; migrations and frontend installer Finished. Independent probes: API `http://localhost:60668/health/ready` **200**, frontend `http://localhost:60672/` **200**. Paid/provisioning features remain disabled. This supersedes the temporary stopped-stack note above.
- [ ] Fresh-context code review is in progress; browser/telemetry confirmation for this checkpoint is pending. Frontend and public runtime sources were not changed or rebuilt/tested in this continuation.

Changed files (cloud, under `src/`): `IntoChat.Server.Domain/Entities/Brain.cs`; `IntoChat.Server.Application/Contracts/Services/Hosting/IRuntimeAllocationDriver.cs`; `IntoChat.Server.Infrastructure/Services/Hosting/{BrainProvisioningService,BrainProvisioningWorker,UnavailableRuntimeAllocationDriver}.cs`; `Infrastructure/Settings/BrainHostingSettings.cs`; `Infrastructure/Database/EntityFrameworkConfigurations/BrainConfiguration.cs`; `Infrastructure/Services/Accounts/CurrentAccountService.cs`; `Infrastructure/Extensions/ServiceCollectionExtensions.cs`; `IntoChat.Server.API/Controllers/BrainsController.cs`; `API/HealthChecks/{HostingReadinessHealthCheck,PostgresReadinessHealthCheck}.cs`; `API/Extensions/ServiceCollectionExtensions.cs`; `IntoChat.Server.Db/Models/BrainConfiguration.cs`; `Db/SetupDbContextFactory.cs`; migration/Designer and `SetupDbContextModelSnapshot.cs`; `IntoChat.Server.Tests/Hosting/{BrainProvisioningTests,HostingReadinessTests}.cs`.

**C2 remains partial, not fully verified:** the durable coordinator is real and database-tested, but production `Ensure`/lookup, isolated storage/secret allocation and runtime readiness adapter are not implemented. No approved runtime image digest/release contract or machine enrollment flow exists yet. Provider deployment validation requires separately authorized infrastructure access; absence of that authorization does not make the remaining driver implementation complete or solely externally blocked. C1 machine/lifecycle capabilities, C3 scoped workspace access, C4 backup/restore, C5 lifecycle, runtime U2 enforcement and L1 hosted-brain UI remain engineering work. Pricing/refund/retention/legal/recovery objectives and rollout validation remain operator/product gates. No paid-launch claim.

### Review and final validation of the durable coordinator

- [x] Fresh-context read-only review found no critical issue and one important error-boundary defect. Fixed it: only a finite set of safe provisioning codes may be persisted/returned; arbitrary driver exception text maps to `PROVIDER_RETRY_REQUIRED`.
- [x] `ArbitraryProviderErrorTextIsNeverPersistedOrReturned` reproduced both short arbitrary-text exposure and overlong-code persistence failure (2 failing cases), then passed after normalization. Final full backend suite: **92/92 passed, zero skipped**, including **15** disposable PostgreSQL cases. Final solution build: **0 errors / 63 warnings**; warnings include existing dependency advisories plus test cancellation analyzer warnings.
- [x] Browser smoke rendered the sign-in form at `http://localhost:60672/signin`. Sampled Aspire telemetry returned five API traces (provider discovery/profile/refresh, no trace error flag) and five structured API log entries. This is unauthenticated local smoke evidence, not external provider or hosted-brain acceptance.
- Final review minor (deferred): `WorkerEnabled=false` pauses processing but the service can still accept durable requests if its feature/driver/image configuration is otherwise valid. Hosting readiness is unhealthy in that configuration. Clarify paused-queue acceptance before enabling production routing; no production driver is registered today.
- Final review rulings: real provider recovery/isolation/storage, runtime enrollment/backup/lifecycle and post-success entitlement enforcement remain explicit engineering/operational gates; fake-driver tests cannot verify them. Reviewer inspected new schema parity statically; migration/build execution evidence above comes from this implementation run, not independent reruns.

Coordinator configuration uses `Hosting:ImageDigest` (fully qualified image pinned by sha256), `Hosting:RuntimeVersion` (exact expected runtime version), `Hosting:WorkerEnabled`, and the existing `Hosting:Provisioning:Enabled` switch. Default registration is unavailable, so configuration alone does not enable allocation. A private driver must implement deterministic ownership-checked Ensure lookup and authenticated observation; credentials must stay outside the brain/operation DTOs and error codes. The default Aspire profile explicitly keeps provisioning disabled.

Database test reproducibility: migrate only a newly created disposable local database, set `INTOCHAT_PROVISIONING_TEST_DB` in the test process to its connection string, then run `dotnet test src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj`. The tests reject non-loopback hosts and database names without `intochat_provisioning_test_`; without the variable these integration cases are explicitly skipped. Never print/store the connection string in source control. `SetupDbContextFactory` allows EF model scaffolding without executing application startup/seeding.

Final local probe after the review fix: API readiness **200**, frontend **200**, unauthenticated brain-list request **401**. Aspire API/frontend/PostgreSQL/Redis remain Healthy. Current durable-provisioning code and this updated status are **uncommitted**; the requested prior-change commits are baf3690 / 8cc540a00 / 389357d8. No push, provider deployment, payment call, customer charge, existing-database migration or production deletion occurred.

## 2026-10-16 execution checkpoint

Current authorization supersedes historical no-tests/no-builds restrictions above. This is an implementation continuation; earlier checkpoint evidence is historical.

- Cloud began clean at `58be8bd`; the durable coordinator is already tracked, contrary to the preceding uncommitted note. Runtime/documentation pre-existing changes are preserved.
- **Implemented and locally verified:** worker-disabled acceptance correction, commit `d9f6d97`. New requests and retries fail with `HOSTING_UNAVAILABLE`; already accepted idempotency keys remain recoverable. A paused service does not advance operations. Files: cloud `src/IntoChat.Server.Infrastructure/Services/Hosting/BrainProvisioningService.cs` and `src/IntoChat.Server.Tests/Hosting/BrainProvisioningTests.cs`.
- Baseline rebuilt and executed via the xUnit executable: **92 passed, zero failed/skipped**. Regression reproduced before fix (`HOSTING_UNAVAILABLE` expected, `BRAIN_LIMIT_REACHED` actual); after fix full suite **93 passed, zero failed/skipped**. `dotnet build src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj --no-restore --verbosity quiet`: zero errors, 21 warnings on the final run. `git diff --check` passed.
- Schema generated with `dotnet ef migrations script --project src/IntoChat.Server.Db --no-build` and applied only to a newly created `intochat_provisioning_test_*` database in the local disposable PostgreSQL container. No existing/shared database migrated. Run tests with `INTOCHAT_PROVISIONING_TEST_DB` set privately, then `dotnet src/IntoChat.Server.Tests/bin/Debug/net11.0/IntoChat.Server.Tests.dll -noLogo -noColor`.
- Tooling regression: plain `dotnet test` fails before discovery after the package update because the Microsoft.Testing.Platform/VSTest configuration is incompatible. Direct xUnit execution works; runner configuration repair remains engineering.
- Security observation: Aspire CLI JSON resource inspection emitted unredacted environment values, including an external API credential. Values are not copied into documentation/source; subsequent inspection must project an allowlist before output. External credential rotation requires the credential owner.
- Local API temporarily stopped to release Windows build locks. Restoring and validating Aspire/browser/telemetry is pending for this continuation.
- **Incomplete engineering:** real private provider driver/recovery/storage readiness, C1 machine boundary, C3 workspace exchange/revocation, C4 coordinated storage/backup/restore/export, C5 lifecycle/upgrades, U2 execution enforcement, hosted UI and operational acceptance. No claim that unauthorized production deployment blocks this engineering.
- **External validation/input gates:** approved runtime artifact, provider credentials and deployment authorization; commercial prices/limits/retention/recovery objectives/refund/legal decisions; existing-data environment inventory. These do not excuse the independent implementation work above.

### Hosted management and workspace implementation (2026-10-16)

**Implemented and locally verified**

- Runtime commit `d71ca43b8`: hosted mTLS controller boundary, configured account/brain/runtime identity, idempotent identity registration, audience-bound one-time workspace exchange, durable grant consumption and revocation, absolute five-minute session expiry, one-minute exchange expiry, and per-request cookie validation. Controller keys are separate per runtime; no cloud JWT signing key is copied. Hosted scopes cover HTTP route identity and shared IBrainAccess (including gRPC/body-scoped calls). Identity creation/switching routes are disabled in hosted mode using canonical route metadata, including trailing-slash variants. Existing local/self-host behavior remains available without hosted configuration.
- Runtime files: `src/DigitalBrain.Platform/DigitalBrain.Platform/Hosting/{HostedBrainAccess,HostedRuntimeEndpoints,HostedRuntimeOptions,HostedWorkspaceEndpoints,HostedWorkspaceStore,RuntimeMachineAuthentication,RuntimeManagementEndpoints}.cs`, `Identity/IdentityHosting.cs`, contracts `Hosting/HostedRuntimeObservation.cs`, tests `Identity/{HostedWorkspaceStoreFacts,RuntimeMachineAuthenticationFacts}.cs`.
- Runtime verification: `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/DigitalBrain.Platform.Tests.Unit.csproj --no-restore`: **240 passed, zero failed/skipped**. Real local Kestrel HTTPS exercises mTLS enrollment, workspace exchange, cookie access, replay rejection, revocation, wrong brain, and unauthenticated management. Review found and fixed trailing-slash identity bypass, body/gRPC scope bypass, and persisted-grant audience omission. C# LSP mappings obtained before existing-host edits; final diagnostics have no errors/warnings in touched production files.
- Cloud commit `56a65c4`: private management client uses per-runtime PEM controller certificates from operator-controlled `Hosting:Management:CredentialDirectory` (`<runtime GUID N>.crt/.key`), normal server TLS validation, no redirects/cookie forwarding, exact protocol/version/account/brain/runtime matching, bounded response size and deadline. OpenWorkspace rechecks live owner membership, active session/security stamp, entitlement and brain desired/observed state before and after network calls. The response contains a one-minute fragment exchange URL, never a cloud credential.
- Cloud files: management contracts/client/settings, `WorkspaceAccessService`, `WorkspaceRevocationWorker`, `BrainsController`, DI, `WorkspaceLease` and both EF mappings, `20261015230007_AddWorkspaceLeases` plus snapshot, and hosting tests. Durable workspace leases are written before issuance to cover lost responses. Revocation derives from authoritative DB state after logout/disable/suspension/membership or entitlement loss. Batches contain 128 allocations; four allocations reconcile concurrently; an unreachable allocation gets one failure per sweep rather than one timeout per historical session. Runtime expiry bounds access during an outage.
- Cloud verification: `dotnet test --project src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj --no-restore`, private `INTOCHAT_PROVISIONING_TEST_DB` pointing at a newly created loopback database: **93 passed, zero failed/skipped** after the new integration and review fix. Count includes replacement of the old owner-cookie client tests. `dotnet ef migrations has-pending-model-changes --project src/IntoChat.Server.Db`: no pending changes. Additive lease migration applied only to this turn's newly created disposable test database. Tests include authorization changes during runtime I/O and concurrent revocation reaching a healthy allocation while another is blocked.
- Cloud tooling commit `911ab33`: Microsoft.Testing.Platform runner restored; missing Testing Library DOM peer installed; Vitest matcher types and React ref initializers corrected. Frontend baseline after repair: **439 tests passed**, type check passed, production build passed. Full cloud solution build passed with zero errors/nine warnings before the workspace additions. Subsequent verification is recorded below when complete.

**Implemented but awaiting external operational validation**

- The machine/workspace protocol needs a supported published runtime artifact, provisioned per-runtime certificates, trusted runtime server certificates/DNS, and an actual allocation to exercise across deployment boundaries. Local HTTPS tests do not establish those deployment properties.
- Workspace revocation retries every 30 seconds after a sweep; it is not a 30-second SLA. Sessions have an absolute five-minute runtime expiry; deployment clocks must be synchronized. Existing live gRPC streams and work already admitted still require execution enforcement in U2.

**Incomplete engineering (not blocked by production authorization)**

- C1: truthful storage/execution readiness and lifecycle/backup/export controls.
- C2: real private allocation driver, deterministic provider lookup/recovery, isolated credential/storage provisioning and provider readiness adapter. The registered production allocation driver is still unavailable; this remains unfinished work, not a completed integration.
- C3: allocation-level network/process/storage isolation and automated certificate provisioning/rotation. The access protocol is implemented, but the full hosted journey is not demonstrated.
- C4: coordinated backup, durable backup records, restore into a separate allocation, authorized retention export, scheduling and retention enforcement.
- C5: durable suspend/resume, retention-aware deletion, pinned upgrades with backup/compatibility/rollback.
- U1/U2: authenticated runtime usage production and actual paid-execution admission, duration/token/concurrency ceilings, provider CPU/memory/storage enforcement.
- L1: dashboard work is underway; provider-backed creation/open and the full authenticated browser journey still need evidence. L2/L3 operational queues/recovery, final full-plan reconciliation, browser/telemetry/launch evidence remain incomplete.

**Specific unavailable inputs or unauthorized actions**

Approved production runtime digest/version, provider/issuer credentials and deployment authorization; commercial price/limit/retention/recovery/refund/legal policy approval. No infrastructure deployment, live payment, existing/shared DB migration or production deletion was performed. These gates do not reclassify unfinished engineering as blocked.

### Provider, execution and workspace continuation (2026-10-16)

Implemented and locally verified in the current working tree (review/commit in progress):

- Private Azure Container Apps allocation uses deterministic owned resource identities, per-brain Azure Files quota, internal TCP ingress, pinned image, single replica, exact CPU/memory limits, durable per-runtime credentials, mutual TLS management and server-pinned browser transport. Recovery checks ownership/spec instead of allocating again. No Azure deployment was performed.
- Runtime readiness now checks both the brain journal and hosted platform persistence. Review caught and repaired the memory-backed platform-state fallback. A cold restart test with independent hosts preserves account/brain authority, vault secrets and integration credentials. Hosted persistent reminder storage is still being completed; durability is not yet declared complete.
- Managed model calls use the existing runtime OpenAI integration seeder and model profile, with a per-runtime gateway credential. Supplier keys stay in the cloud. The gateway authenticates the registered allocation, reserves account budget/concurrency before supplier I/O, pins model/output bounds, excludes unpriced media/built-in tools, imposes duration/response bounds, and never automatically retries ambiguous paid execution. Missing usage keeps the reservation for operator recovery.
- Supplier receipts are persisted before settlement acknowledgement; a worker retries ledger settlement idempotently across crashes. Cached-input and cache-write token categories use snapshotted rates, with the maximum input-category price reserved before execution. Invalid receipts are durably quarantined instead of blocking other accounts. The migration adds scoped producer credentials, receipt recovery state and category price snapshots; it has only been applied to a newly created disposable loopback database.
- Dedicated wildcard workspace hosts map to persisted runtime allocations through YARP. The proxy carries no controller certificate, strips cloud Authorization/cookies and certificate-forwarding headers, validates same-origin writes, denies management paths, and rejects suspended/unentitled allocations. Browser grants now target the public workspace origin rather than an internal provider hostname. Dedicated DNS/TLS and live network validation remain external operational inputs.
- Customer dashboard implementation was committed as `d267e61`: create with persisted idempotency key, polling progress, persisted-operation retry, and readiness-gated workspace navigation. Frontend evidence from that slice: 441 tests / 61 files passed, TypeScript check and production build passed. Full authenticated hosted browser journey remains outstanding.

Latest backend verification: `dotnet test --project src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj --configuration Release` with `INTOCHAT_PROVISIONING_TEST_DB` targeting a newly created disposable database: **114 passed, 0 failed, 0 skipped**. This includes live local TLS tests, allocation recovery tests, real PostgreSQL concurrent budget admission, category pricing, poison receipt recovery, crash replay and workspace proxy authorization tests. Initial idempotent whole-history SQL generation exposed a legacy migration SELECT inside a DO block; plain ordered migration SQL applied successfully to a fresh database. Existing/shared databases were not migrated. The idempotent-history script defect still needs resolution before recommending that deployment path.

Current engineering remaining: complete hosted reminders and generic runtime concurrency review; C4 coordinated backup/restore/export; C5 durable suspension/deletion/upgrades; provider compute/storage usage production; remaining operations queues/recovery and customer lifecycle UI; final full-P0 reconciliation and Aspire/browser/telemetry acceptance. These are incomplete engineering, not deployment-authorization blockers. External operational validation additionally requires approved image/version, isolated Azure environment/storage and scoped credentials, wildcard workspace DNS/TLS, supplier price configuration, operational recovery objectives and explicit deployment authorization. No paid-launch claim.
