# Cloud implementation inventory

IntoChat Cloud implements identity, Stripe account billing, durable runtime provisioning, workspace access, resource accounting and lifecycle operations. This inventory separates **implementation**, **local verification** and **production verification**. An implemented feature does not become missing because live acceptance was outside this audit.

Snapshot: 17 October 2026, `intochat-cloud`, SHA `d9dc9798ca5bfc2b93e2b2b12cd3f3033047d2c6`. Preserved pre-existing modifications: `src/Aspire/AppHost.cs`, `src/IntoChat.WebUI/src/features/auth/lib/oauth.test.ts`, `src/IntoChat.WebUI/src/shared/config/env.ts`. No application edits were made for this inventory.

## Evidence and status definitions

- **Implemented:** concrete behavior exists in the active composition. **Partial:** only the stated subset is delivered. **Stub:** explicit fallback/unavailable implementation. **Not found:** no implementation located in the inspected scope. **Excluded:** retained code/artifacts outside the active cloud surface.
- **S:** source inspection, no feature-specific executed result claimed. **T:** named test file belongs to a freshly run suite; this does not assert every branch passed. **DB:** relevant database acceptance was not rerun in the fresh DB-free run.
- **NV:** production behavior **not verified in this audit**. It does not mean never tested, broken or undeployed. Every row has this separate production axis.

Checks executed earlier in this audit at the recorded snapshot: **120 passed, 66 skipped, 0 failed / 186 .NET tests**, with `INTOCHAT_PROVISIONING_TEST_DB` cleared; **447 frontend tests passed / 62 files**. These application suites were not rerun for the documentation correction. Commands and historical disposable-PostgreSQL evidence remain in [evidence](../reference/evidence) and [verification](./verification). Test files identify evidence locations, not invented per-feature pass counts.

Exact path prefixes used below: **API** = `src/IntoChat.Server.API/`; **Infra** = `src/IntoChat.Server.Infrastructure/`; **App** = `src/IntoChat.Server.Application/`; **Web** = `src/IntoChat.WebUI/src/`; **Tests** = `src/IntoChat.Server.Tests/`. Prefix plus quoted path is the exact repository-relative source. Symbols follow `::`.

## Identity and sessions

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Password login | Implemented | API `Controllers/TokenController.cs::GetTokenAsync`; Infra `Services/Authentication/PasswordVerificationService.cs::VerifyAsync`, `ConsumeDummyCheckAsync` verify credentials and perform dummy verification for missing credentials. | S; DB: Tests `Authentication/CloudIdentityAcceptanceTests.cs`. | NV |
| Signup and email confirmation | Implemented | API `Controllers/UserController.cs::CreateUser`, `ConfirmEmail`, `ResendEmailConfirmation` dispatch creation and confirmation commands. | T: Web `pages/auth/EmailConfirmed.test.tsx`, `EmailSent.test.tsx`; DB identity acceptance. | NV |
| Password recovery/change | Implemented | API `Controllers/UserController.cs::ForgotPassword`, `ResetPassword`, `ChangePassword`; App `UseCases/Users/Commands/ResetPassword/ResetPasswordCommandHandler.cs`. | S; no live recovery email check. | NV |
| Google sign-in | Implemented, configurable | API `Controllers/TokenController.cs::GoogleLoginAsync`, `Services/GoogleIdTokenValidator.cs`; Infra `Services/Authentication/GoogleAuthenticationOrchestrator.cs::HandleGoogleLoginAsync`. Provider exposure follows feature settings. | T: Web `features/auth/lib/oauth.test.ts`; DB identity acceptance; no live callback run. | NV |
| Telegram sign-in | Implemented, configurable | API `Controllers/TokenController.cs::TelegramLoginAsync`; Infra `Services/TelegramAuthValidationService.cs`, `Services/Authentication/TelegramInitDataParser.cs::TryParse` validate signed proof. | T: Tests `Authentication/TelegramAuthenticationServiceTests.cs`, `TelegramLoginCommandHandlerTests.cs`. | NV |
| Login intent and origin binding | Implemented | API `Controllers/AuthenticationIntentsController.cs::Create`, `Services/AuthenticationIntentService.cs`, `Filters/LoginIntentFilter.cs`: allowed-origin check, short-lived cookie and intent consumption. | S; DB identity acceptance. | NV |
| Provider linking/unlinking | Implemented | API `Controllers/IdentityLinksController.cs::LinkGoogle`, `LinkTelegram`, `Unlink`: recent session, one-time intent, uniqueness transaction and last-sign-in-method protection. | DB: identity acceptance; T: Web `pages/profile/ui/ProfileSecurity.test.tsx`. | NV |
| Refresh/logout/all-session revocation | Implemented | Infra `Services/Authentication/AuthSessionService.cs::CreateAsync`, `RefreshAsync`, `RevokeCurrentAsync`; API `Controllers/UserController.cs::LogoutAll`, `Logout`. | S; DB identity acceptance. | NV |
| Development authentication | Implemented, development-only | API `Extensions/DevelopmentAuthEndpoints.cs` provides development endpoint composition, not another public provider. | T: Tests `Authentication/DevelopmentAuthEndpointsTests.cs`. | NV |
| MFA/passkeys | Not found | Source search for MFA/TOTP/WebAuthn/TwoFactor found only `src/IntoChat.DeploymentKit/Settings/AuthSettings.cs::EnableTwoFactorAuth` and legal copy, not enrollment/challenge/recovery. | S, bounded negative search. | NV |

## Accounts, profile and support

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Personal account creation | Implemented | Infra `Services/Accounts/CurrentAccountService.cs::EnsurePersonalAccountAsync` creates account and owner membership inside signup transaction with conflict-safe inserts. | DB: Tests `Authentication/CloudIdentityAcceptanceTests.cs`. | NV |
| Account list and membership | Implemented for owners | API `Controllers/AccountsController.cs::List`, `Get`; Infra `Services/Accounts/CurrentAccountService.cs::RequireMembershipAsync` requires both owner membership and account ownership. | S; DB acceptance separate. | NV |
| Team invitations/delegated roles | Not found | `CurrentAccountService.Accessible` selects owner membership. No invitation/team-role management controller located. Membership storage is not a team UI. | S. | NV |
| Billing contact verification | Implemented | API `Controllers/BillingContactController.cs::RequestVerification` replaces an unverified/synthetic contact, checks uniqueness and requests email confirmation. | S; no live delivery check. | NV |
| Profile read/edit | Implemented | API `Controllers/UserController.cs::GetUserProfile`, `UpdateUserProfile`; Web `pages/profile/ui/ProfileMain.tsx`, `NameInlineEditor.tsx`. | T: Web `pages/profile/ui/ProfileMain.test.tsx`, `NameInlineEditor.test.tsx`, `InlineEditor.test.tsx`. | NV |
| Preferences/reference lists | Implemented backend; UI partly retired | API `Controllers/PreferencesController.cs`, `Controllers/PortalController.cs` expose preferences/language/currency/timezone data. Web `app/router/routes.tsx::AppRoutes` redirects preferences to profile. | T: Tests `Users/UpdateUserPreferencesCommandHandlerTests.cs`; Web `pages/profile/ui/ProfilePreferences.test.tsx`. | NV |
| Marketing unsubscribe | Implemented | API `Controllers/UserController.cs::UnsubscribeMarketingEmails`; Web `pages/marketing/ui/Unsubscribe.tsx`. | S. | NV |
| Feedback | Implemented | API `Controllers/FeedbackController.cs`; App `UseCases/Feedbacks/Commands/CreateFeedback/CreateFeedbackHandler.cs`; Web `pages/feedback/ui/Feedback.tsx`. | S. | NV |
| User deletion/legacy activation | Excluded active routes | API `Controllers/UserController.cs::DeleteCurrentUser`, `ActivateUser`, `SyncTelegramUsername` use `CloudFeature("retired")`; API `Filters/CloudFeatureFilter.cs::OnAuthorization` returns 503 for this feature. Handlers remain. | S. | NV |
| Internal user operations | Implemented, restricted | API `Controllers/InternalUsersController.cs`, `Filters/InternalAuthFilter.cs` implement internal operations/authentication. | T: Tests `Users/InternalUsersControllerTests.cs`, `Authentication/InternalAuthFilterTests.cs`. | NV |

## Stripe account checkout and reconciliation

These are active **account** billing capabilities, distinct from older user-tier payment services below.

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Cloud plan catalog | Implemented, configurable | API `Controllers/CloudPlansController.cs`; Infra `Settings/CloudCatalogSettings.cs`; Web `pages/cloud/ui/CloudPricing.tsx`. IDs, catalog version and commercial settings feed checkout. | S; route tests do not validate commercial configuration. | NV |
| Durable checkout | Implemented | Infra `Services/Billing/CloudCheckoutService.cs::StartAsync`, `GetAsync`, `OpenAsync`, `AdvanceAsync`; API `Controllers/AccountBillingController.cs::Start`. Persists operations and checks membership/feature/catalog state. | S; DB checkout fixtures separate. | NV |
| Stripe customer creation | Implemented | Infra `Services/Billing/CloudBillingProvider.cs::CreateCustomerAsync` creates account-associated metadata with operation-scoped Stripe idempotency. | S; no live customer creation claimed. | NV |
| Card subscription creation | Implemented | `CloudBillingProvider.CreateSubscriptionAsync` validates price/currency/amount/recurrence/licensed usage/live-test mode; creates `default_incomplete` card subscription and obtains confirmation secret. | S. | NV |
| Checkout payment UI | Implemented | Web `pages/cloud/ui/CloudCheckout.tsx`, `shared/providers/StripeProvider.tsx`; API `AccountBillingController.Get` returns account checkout status. | Frontend suite executed; no live card payment observed. | NV |
| Signed webhook ingestion | Implemented | Infra `Services/Billing/CloudBillingWebhookReceiver.cs::HandleWebhookAsync` validates signature/mode, encrypts payload, inserts durable inbox and deduplicates provider event ID. | S; DB durability not rerun. | NV |
| Reconciliation/out-of-order handling | Implemented | Infra `Services/Billing/BillingReconciliationService.cs::ReconcileAccountAsync` locks account, rereads provider state, detects subscription conflicts, updates entitlement/outbox and preserves billing periods. | S; DB path not exercised by DB-free run. | NV |
| Webhook retries/review states | Implemented | `BillingReconciliationService.ProcessInboxAsync` leases work, records backoff, quarantines association errors and routes refunds to `needs_review`; Infra `Services/Billing/CloudBillingWorker.cs` drives processing. | S. | NV |
| Checkout recovery | Implemented | Infra `Services/Billing/CheckoutRecoveryService.cs::RecoverAsync`; API `Controllers/BillingOperationsController.cs::RecoverCheckout` validates explicit provider/customer recovery. | T/DB: Tests `Hosting/CheckoutRecoveryTests.cs`; DB fixtures skipped. | NV |
| Subscription entitlements | Implemented | Infra `Services/Billing/BillingEntitlementService.cs::Apply`, `GetAsync` derives new/existing-work permission and limits from subscription/account state. | S; DB acceptance not freshly claimed. | NV |

## Billing management and retained payment services

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Account invoices | Implemented | Infra `Services/Billing/AccountBillingService.cs::InvoicesAsync`; API `Controllers/AccountBillingController.cs::Invoices` resolve account customer and retrieve invoice data. | T: Tests `Payments/GetInvoicesQueryHandlerTests.cs` covers query adaptation, not all provider calls. | NV |
| Saved cards/default/removal | Implemented | `AccountBillingService.PaymentMethodsAsync`, `PaymentMethodSummaryAsync`, `ChangePaymentMethodAsync`; API `AccountBillingController.SetDefault`, `Remove`. | T: Tests `Payments/GetPaymentMethodsQueryHandlerTests.cs`; no live mutation. | NV |
| Account cancellation | Implemented | `AccountBillingService.RequestActionAsync`, `ProcessCancellationAsync`; `CloudBillingProvider.CancelAtPeriodEndAsync` applies period-end cancellation with idempotency. | S. | NV |
| Account refund request/review | Implemented review workflow | API `AccountBillingController.Refund`; `AccountBillingService.RequestActionAsync` stores `refund.review` as `needs_review`; refund webhook events also enter review. | S. | NV |
| Automated account refund execution | Partial | Review/request/inbox state exists; active account API does not execute the old user refund service. Automatic account settlement is not demonstrated by the review endpoint. | S. | NV |
| Older checkout/renewal/downgrade | Excluded active routes; implemented retained services | Infra `Services/Payments/SubscriptionCheckoutService.cs`, `SubscriptionManagementService.cs`, `SubscriptionLifecycleService.cs`, `Internal/DeferredDowngradeService.cs`; API `Controllers/PaymentController.cs` marks legacy subscription mutations retired. | S. | NV |
| Older automatic user refund | Excluded active route; implemented retained service | Infra `Services/Payments/RefundService.cs::CreateRefundAsync` checks active subscription/token eligibility, gets payment intent, calls Stripe refund, downgrades to Basic and sends email. | S; distinct from account refund review. | NV |
| Promo codes | Implemented API; not integrated into account checkout | API `Controllers/PromoCodesController.cs`; App `UseCases/PromoCodes/Commands/ApplyPromoCode/ApplyPromoCodeCommandHandler.cs`; Infra `Services/Payments/PromoCodeService.cs`, `Services/PromoCodeValidationService.cs`. Active `StartCloudCheckout` has no promo parameter. | S. | NV |
| Old Stripe webhook handlers | Excluded primary dispatch | Infra `Services/StripeWebhookHandler.cs`, `Services/Handlers/Stripe/NoOpStripeEventHandler.cs` and specific handlers remain; `Extensions/ServiceCollectionExtensions.Payments.cs::AddStripeWebhookServices` binds webhook interface to **CloudBillingWebhookReceiver**. | S; retained handlers do not establish current delivery to that path. | NV |
| Hosted customer portal/other processors | Not found | No Stripe `BillingPortal` session creation found. API `Controllers/PortalController.cs` serves reference data, not billing portal. No second active cloud payment processor located. | S, bounded search. | NV |

## Provisioning and workspace access

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Brain creation/listing | Implemented | Infra `Services/Hosting/BrainProvisioningService.cs::CreateAsync`, `ListAsync`, `GetAsync`; API `Controllers/BrainsController.cs`: account-scoped durable creation, idempotency and entitlement/limit checks. | T/DB: Tests `Hosting/BrainProvisioningTests.cs`, `BrainRequestValidationTests.cs`. | NV |
| Provisioning worker/retry | Implemented | `BrainProvisioningService.AdvanceAsync`, `RetryAsync`; Infra `Services/Hosting/BrainProvisioningWorker.cs` advances durable operations. | DB: `BrainProvisioningTests.cs`; S. | NV |
| Azure runtime allocation | Implemented, configurable | Infra `Services/Hosting/AzureRuntimeAllocationDriver.cs::EnsureAsync`, `ObserveAsync` creates/observes configured runtime resources. | T: Tests `Hosting/AzureRuntimeAllocationTests.cs`, `AzureRuntimeResourcesTests.cs`; doubles, not paid deployment. | NV |
| Azure management transport | Implemented | Infra `Services/Hosting/AzureRuntimeResources.cs::GetAsync`, `PutAsync`, `ActionAsync`, `DeleteAsync`, `StorageKeyAsync`. | T: `AzureRuntimeResourcesTests.cs`. | NV |
| Unconfigured allocation fallback | Stub, intentional | Infra `Services/Hosting/UnavailableRuntimeAllocationDriver.cs::EnsureAsync`, `ObserveAsync` deny unavailable provisioning; concrete Azure driver exists separately. | T: Tests `Hosting/HostingReadinessTests.cs`; S. | NV |
| Runtime protocol/readiness | Implemented | Infra `Services/Hosting/RuntimeManagementClient.cs::ObserveAsync`, `EnsureAsync` validate runtime identity and management responses. | T: Tests `Hosting/RuntimeManagementClientTests.cs`, `HostingReadinessTests.cs`. | NV |
| Credential custody/transport | Implemented | Infra `Services/Hosting/RuntimeCredentialStore.cs::EnsureAsync`, `CloneCustodyAsync`, `DeleteAsync`; `RuntimeManagementClient.CreateClient`, `CreateWorkspaceInvoker`. | T: Tests `Hosting/RuntimeCredentialTransportTests.cs`. | NV |
| Workspace admission | Implemented | Infra `Services/Hosting/WorkspaceAccessService.cs::OpenAsync` issues expiring exchange for account/brain; `RuntimeManagementClient.IssueWorkspaceAsync` crosses management boundary. | T/DB: Tests `Hosting/WorkspaceAccessTests.cs`. | NV |
| Workspace proxy | Implemented | API `Middlewares/WorkspaceProxyMiddleware.cs` forwards admitted traffic to runtime. | T: Tests `Hosting/WorkspaceProxyTests.cs`; no deployed wildcard ingress check. | NV |
| Lease revocation/quotas | Implemented | Infra `Services/Hosting/WorkspaceRevocationWorker.cs::ReconcileAsync`, `RuntimeManagementClient.RevokeWorkspaceAsync`, `RuntimeQuotaPolicy.IsSatisfiedAsync`. | T/DB: `WorkspaceAccessTests.cs`; S. | NV |

## Runtime lifecycle and storage

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Owner lifecycle request | Implemented | Infra `Services/Hosting/BrainLifecycleService.cs::RequestAsync` validates owner/state/idempotency and accepts backup/restore/export/suspend/resume/delete/upgrade. | T/DB: Tests `Hosting/BrainLifecycleTests.cs`, `LifecyclePolicyTests.cs`. | NV |
| Suspend/resume | Implemented | `BrainLifecycleService.CreateAsync` records desired state; Infra `Services/Hosting/AzureRuntimeLifecycle.cs::SetRunningAsync` applies it. | T/DB: lifecycle fixtures. | NV |
| Backup snapshots | Implemented | `BrainLifecycleService.BackupsAsync`, `AdvanceAsync`; `AzureRuntimeLifecycle.SnapshotAsync` creates provider snapshot and durable backup record. | T/DB: lifecycle fixtures; no live drill. | NV |
| Restore candidate/activation | Implemented | `AzureRuntimeLifecycle.RestoreAsync`, `ActivateAsync`; lifecycle state machine restores and activates a candidate runtime. | T/DB: lifecycle fixtures. | NV |
| Export | Implemented | `BrainLifecycleService.ExportTargetAsync`; API `Controllers/BrainLifecycleController.cs` exposes lifecycle/export with ownership/operation checks. | T/DB: lifecycle fixtures; no production archive verified. | NV |
| Approved upgrades | Implemented, configurable | `BrainLifecycleService.RequestAsync` requires approved version compatible with storage/contract; availability follows configuration/worker state. | T: `LifecyclePolicyTests.cs`; DB transitions separate. | NV |
| Retained deletion | Implemented, configurable | `BrainLifecycleService.CreateAsync` sets retention; progression uses `AzureRuntimeLifecycle.DeleteAsync`. | T/DB: lifecycle fixtures. | NV |
| Backup expiry/cleanup | Implemented | `BrainLifecycleService.ExpireAsync`, `AzureRuntimeLifecycle.DeleteSnapshotAsync` clean up expired snapshots. | T/DB: lifecycle fixtures. | NV |
| Lifecycle worker/reconciliation | Implemented | Infra `Services/Hosting/BrainLifecycleWorker.cs`; `BrainLifecycleService.ReconcileAsync`, `RetryAsync`, `RequireCurrentRetryAsync`. | T: Tests `Hosting/HostingOperationsTests.cs`; DB transitions separate. | NV |
| Storage resources/metadata | Implemented | Azure allocation/lifecycle and `RuntimeCredentialStore` manage runtime storage/custody; Infra `Database/IntoChatDbContext.cs` stores cloud metadata. Cloud backups are distinct from runtime file features. | T: allocation/resource fixtures; no production RPO/RTO result. | NV |

## Resource usage, budgets and managed inference

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Usage producer identity | Implemented | Infra `Services/Usage/RuntimeProducerRegistrar.cs::RegisterAsync`, `AuthenticateAsync` bind producer to account/brain/runtime and verify credential. | S; DB separate. | NV |
| Resource observations | Implemented | Infra `Services/Usage/ResourceUsageService.cs::RecordObservationAsync` records source/event identity, resource kind, quantity and timestamp. | S; DB separate. | NV |
| Summaries/unpriced usage | Implemented | `ResourceUsageService.SummaryAsync`, `UsageTotal` expose quantity, nullable cost and unpriced count; Web `pages/cloud/ui/CloudResourceUsage.tsx` displays usage. | Frontend suite; S, not supplier invoice reconciliation. | NV |
| Accounting corrections | Implemented | `ResourceUsageService.AdjustAsync`; API `Controllers/ResourceOperationsController.cs::Adjust` requires operation/reason and records adjustments. | S. | NV |
| Azure metering/backfill | Implemented | Infra `Services/Usage/AzureResourceMetering.cs::ReadAsync`; `Services/Usage/AzureMeteringWorker.cs::AzureMeteringReconciler.ReconcileAsync`, `ReadWindowAsync` use durable cursors. | T: Tests `Hosting/AzureResourceMeteringTests.cs`; no live bill fetched. | NV |
| Model budget reservation | Implemented | Infra `Services/Usage/ResourceBudgetService.cs::ReserveAsync` reserves before dispatch; `SettleAsync` settles usage; `ReleaseUnexecutedAsync` releases confirmed unexecuted work. | S/DB; non-DB pass totals do not establish transaction correctness. | NV |
| Managed inference gateway | Implemented, configurable | Infra `Services/Usage/ManagedModelGateway.cs::ExecuteAsync` bounds payload/token/output, reserves, forwards supplier request, handles streaming/JSON, validates usage and avoids automatic paid-call retry. | T: Tests `Hosting/ManagedModelGatewayTests.cs`. | NV |
| Durable receipts/recovery | Implemented | Infra `Services/Usage/ManagedModelReceipts.cs::RecordAsync`, `RecoverAsync`; uncertain/canceled/unmeasured work retains reservation for recovery. | T/DB: Tests `Hosting/ManagedModelRecoveryTests.cs`. | NV |
| Operator settlement/release | Implemented | API `Controllers/ModelOperationsController.cs::Pending`, `Retry`, `Settle`, `Release`; nonexecution evidence required to release uncertain work. | T/DB: recovery fixtures; S. | NV |
| Older token/overage accounting | Excluded primary account budget model; retained code | Infra `Services/UserLimits/UserTokenReservationService.cs`, `UserTokenCommitService.cs`, `Services/OverageBillingService.cs`, `MetterPaymentProcessor.cs`; historical usage UI remains. | S. | NV |

Cloud budget admission protects calls traversing the cloud gateway. The companion runtime also builds direct AI clients from deployment integration credentials or local endpoints; this inventory does not assert every runtime inference path crosses that gateway. This is not a claim of user BYOK support in those AI clients. See [providers](./providers), [billing](./billing) and [architecture](./architecture).

## Operations, delivery and customer interface

| Capability | Implementation | Actual behavior and source | Local verification | Production |
|---|---|---|---|---|
| Billing operator API | Implemented | API `Controllers/BillingOperationsController.cs::Status`, `Backlog`, `Replay`, `ScheduleReconciliation`, `RecoverCheckout`. | S; DB effects separate. | NV |
| Hosting operator API | Implemented | API `Controllers/HostingOperationsController.cs::Queues`, `Retry` expose durable provisioning/lifecycle queues. | T: Tests `Hosting/HostingOperationsTests.cs`. | NV |
| Resource operator API | Implemented | API `Controllers/ResourceOperationsController.cs::ProviderCursors`, `Backfill`, `Status`, `Records`, `Backlog`, `Resolve`. | S. | NV |
| Dedicated admin frontend | Not found | Web `app/router/routes.tsx::AppRoutes` contains cloud/auth/profile/feedback/information routes, no operator dashboard. Operator APIs exist independently. | T: Web `app/router/routes.test.tsx`; S. | NV |
| Customer cloud dashboard | Implemented | Web `pages/cloud/ui/CloudHome.tsx`, `AccountBrains.tsx`, `BrainLifecycle.tsx`, `CloudBilling.tsx`, `CloudResourceUsage.tsx`. | T: Web `pages/cloud/ui/AccountBrains.test.tsx`, `BrainLifecycle.test.tsx`. | NV |
| Public information/navigation | Implemented | Web `app/router/routes.tsx::AppRoutes` maps pricing/help/legal; old home redirects to cloud, old checkout to pricing. | T: route tests; Web `pages/profile/ui/ProfileLayout.test.tsx`. | NV |
| Local stack orchestration | Implemented | `src/Aspire/AppHost.cs` composes services/profiles/feature switches. No stack newly launched for this inventory. | S; historical checks in evidence. | NV |
| Azure/Pulumi deployment building blocks | Implemented | `src/IntoChat.Infrastructure/Program.cs`, `IntoChatDeploymentConfiguration.cs`; `src/IntoChat.DeploymentKit/Services/InfrastructureBuilder.cs`, `DeploymentOrchestrator.cs`, `DatabaseMigrationService.cs`. | S; deployment not executed. | NV |
| Delivery workflows | Partial | `.github/workflows/preview.yml`, `deploy-prod.yml` reference absent `src/IntoChat.MiniApp/IntoChat.MiniApp.csproj`. Concrete deployment library does not repair stale workflow references. | Fresh `Test-Path` false; no pipeline run. | NV |
| Health/telemetry/background jobs | Implemented | `src/IntoChat.ServiceDefaults/Extensions.cs`; API health checks; `src/IntoChat.Server.Jobs.API/Program.cs`, `Filters/HangfireDashboardAuthorizationFilter.cs`, `Jobs/DeferredDowngradeJob.cs`, `Jobs/TokenDeductionJob.cs`. | T: Tests `Hosting/TelemetryLoggingTests.cs`; job host not deployed in audit. | NV |

## Whole-project coverage

Every immediate `src/` project/folder was inventoried. Generated `bin`, `obj`, `node_modules`, `dist` are excluded from source counts. Empty historical folders do not establish shipped applications.

| Project/folder | Coverage | Representative source/boundary |
|---|---|---|
| `src/Aspire` | Implemented local orchestration | `AppHost.cs` |
| `src/IntoChat.Server.API`, `src/IntoChat.Server.API.Contracts` | Controllers, middleware, filters, health and transport DTOs | `Controllers/BrainsController.cs`, `Controllers/TokenController.cs`; DTOs are not separate products |
| `src/IntoChat.Server.Application`, `src/IntoChat.Server.Domain` | Use cases/contracts/DTOs and account/runtime/billing domain; retained travel contracts identified | `UseCases/`, `Contracts/`; domain `Entities/AccountSubscription.cs` |
| `src/IntoChat.Server.Infrastructure` | Provider adapters, persistence, repositories, identity, billing, hosting, usage, email, cache/locks | `Services/`, `Repositories/`, `Database/`, `Extensions/` |
| `src/IntoChat.Server.Db` | Migration executable/schema history/seed catalogs including October cloud migrations | `Program.cs`, `Seeding/DbSeeder.cs`, `Migrations/20261015130000_AddAccountBilling.cs` |
| `src/IntoChat.Server.Comms.Core`, `src/IntoChat.ServiceDefaults` | Shared result/error/extensions and telemetry/health defaults | `SharedKernel/`, `Extensions/`; defaults `Extensions.cs` |
| `src/IntoChat.Server.Jobs.API` | Job host and dashboard authorization; token/downgrade jobs | `Program.cs`, `Jobs/`, `Filters/HangfireDashboardAuthorizationFilter.cs` |
| `src/IntoChat.DeploymentKit`, `src/IntoChat.Infrastructure` | Deployment library and Pulumi composition | `Services/DeploymentOrchestrator.cs`; infrastructure `Program.cs`, `Pulumi.yaml` |
| `src/IntoChat.WebUI` | Active cloud/auth/profile UI, hooks/shared UI; retained components not all routed | `src/app/router/routes.tsx`; feature-sliced app/entities/features/pages/shared/widgets |
| `src/IntoChat.Server.Tests` | Hosting/auth/payment/reference-data fixtures | Fresh 120 passed/66 skipped; references above and [verification](./verification) |

## Supporting capabilities and legacy exclusions

| Capability/folder | Implementation | Actual scope/source | Local verification | Production |
|---|---|---|---|---|
| Localization/generator | Implemented tooling; retained travel data | `src/IntoChat.Localization/flight-translations.json`, `src/IntoChat.Localization.Generator/Program.cs`; Infra `Services/TranslationService.cs`. | T: Tests `Emails/TranslationServiceTests.cs`; generator not run. | NV |
| Email delivery/templates | Implemented | Infra `Services/Emails/EmailService.cs`, `SubscriptionEmailService.cs`, `EmailTemplateGeneratorService.cs`: registration/recovery/subscription/refund messaging. | S; translation tests are not delivery acceptance. | NV |
| Cache/locks/security helpers | Implemented support | Infra `Services/CacheService.cs`, `PostgresDistributedLockService.cs`, `LocalDistributedLockService.cs`, `BlindIndexService.cs`, `RefreshTokenHasher.cs`, `RecoveryTokenHasher.cs`. | S; no production performance/security certification. | NV |
| Travel remnants | Excluded primary cloud product | App `UseCases/Airports/Queries/SearchAirports/SearchAirportsQueryHandler.cs`, `UseCases/Locations/Queries/SearchLocations/SearchLocationsQueryHandler.cs`, `UseCases/Airlines/Queries/GetAirlines/GetAirlinesQueryHandler.cs`; Infra `Services/Strategies/ScheduledQueryExecutionService.cs`; TripVault/scheduled migration history. | T: Tests `Airports/SearchAirportsQueryHandlerTests.cs`, `Locations/SearchLocationsQueryHandlerTests.cs`, `Airports/CityTranslationProviderTests.cs`. | NV |
| Telegram bot executable | Excluded/absent source | `src/IntoChat.Bot`, `src/IntoChat.Bot.Tests`: no non-generated source in this snapshot. Telegram login and API `Services/TelegramChatNotifier.cs` remain separate concrete capabilities. | Directory inventory. | NV |
| MiniApp/mocks/Aspire tests | Excluded/absent source | `src/IntoChat.MiniApp`, `src/IntoChat.Server.Mocks`, `src/IntoChat.Aspire.Tests`: no non-generated source. MiniApp project referenced by workflows absent. | Directory inventory and file check. | NV |
| Historical TripRadar folders | Excluded/no current source | All `src/TripRadar.*`: Aspire.Tests, Bot, Bot.Tests, DeploymentKit, Infrastructure, MiniApp, Server.API, Server.API.Contracts, Server.Application, Server.Comms.Core, Server.Db, Server.Domain, Server.Infrastructure, Server.Jobs.API, Server.Mocks, Server.Tests, ServiceDefaults have zero non-generated source files. | Directory inventory. | NV |
| Repository support material | Excluded feature count | `.agents`, `.claude`, `.kiro`, `.superpowers` are process material; `.github` covered above; `docs/operations/hosted-runtime-recovery.md` is guidance; `.vs`, `TestResults`, logs/caches are local artifacts. | Guidance is not a completed recovery drill. | NV |

Cloud does not own the companion runtime's application catalog, Flutter workspace, Orleans execution, marketplace or provider-connection UI. See the [repository map](../reference/repositories). Acceptance can target these specific implemented flows: [verification](./verification), [operations](./operations), [backlog](./backlog).
