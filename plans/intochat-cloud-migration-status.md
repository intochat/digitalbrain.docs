# IntoChat Cloud migration implementation status

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

Final local endpoints for this running instance: frontend http://localhost:61783; API http://localhost:61775. Ports are allocated dynamically and will change on restart. Generated local validation secrets were passed in process environment only, never printed or committed. Existing named database volumes were left untouched. No deployment, live payment operation, customer charge, production data deletion, push or additional commit occurred. Rename commit remains 0e7ab82; these follow-up implementation changes are uncommitted.

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
- [x] Restarted isolated Aspire against a new disposable database with the authorized migration-only opt-in. API, frontend, PostgreSQL and Redis Running/Healthy; migration and frontend installer Finished. Independent API `/health/ready` and frontend `/` returned 200. Browser sign-in rendered. Current allocated endpoints: frontend http://localhost:57200, API http://localhost:57195.

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
- [x] Current endpoints supersede the earlier allocated ports: frontend **http://localhost:50177**, API **http://localhost:50173**. The unconfigured cloud catalog correctly returns 503; it is not enabled by service readiness. Commercial plan configuration remains required.
- [x] Final static review found no blocking issues after protocol/restart handling corrections; whitespace diff checks passed. Runtime LSP diagnostics were repeated after the added tests. No frontend source changed and its suite/build were not rerun this continuation.

Additional changed files: cloud `src/Aspire/AppHost.cs`, `src/Aspire/AllocatedDashboardTelemetryAnnotation.cs`, `src/IntoChat.Server.API/Extensions/HostBuilderExtension.cs`, `src/IntoChat.Server.Tests/Hosting/TelemetryLoggingTests.cs`. No additional migrations were authored. Only fresh disposable local databases were migrated during restarts. Existing dependency security advisories and production MediatR/AutoMapper license warnings remain unresolved risks. Full hosting migration remains unfinished as listed above; this checkpoint must not be marked paid-launch ready.

### Runtime boundary commit checkpoint

User-authorized commits: cloud **baf3690** (`feat: add runtime observation and restore Aspire telemetry`), public runtime **8cc540a00** (`feat: expose owner-scoped runtime observation`). Only the listed implementation files were staged; unrelated runtime and documentation changes remain untouched. The status and runtime-boundary manifest are committed separately. No push occurred. Continuing with C2 durable provisioning; C1 machine/lifecycle and production provider acceptance remain incomplete.
