# IntoChat Cloud Migration Implementation Plan

> For agentic workers: implement task-by-task using the executing-plans workflow after implementation is requested. This document authorizes no deployment, data destruction, payment, or test execution. All checkboxes describe future work.

**Goal:** Convert the copied TripRadar application into a private commercial platform for the public DigitalBrain runtime, preserving useful authentication and billing capabilities while removing the travel product.

**Architecture:** Keep the existing layered modular application. Separate people, external identities, billing accounts, and hosted brains. Consume versioned public runtime contracts/images through an authenticated management boundary; never couple the runtime to the private customer database.

**Tech stack:** Existing .NET backend, EF persistence, React/TypeScript feature-sliced frontend, Stripe, existing Google/Firebase browser flow, existing Telegram identity verification, existing job infrastructure. Keep current dependency versions during extraction; no stack migration is part of this plan.

**Spec:** ../assessment/intochat-cloud-reuse.md and the product decision to separate public runtime from private cloud.
**Source baseline:** E:/intochat/intochat-cloud at 3fe6ccf25a40358bdde68d26ec364e6fff81f6c9, inspected 2026-10-15.
**Status:** Proposed execution plan. No implementation completed. Source inspection only; no tests/builds/application startup performed.

## Global constraints

- User instruction: do not run tests. This applies to executors until the user changes it. Acceptance scenarios below are requirements, not permission to execute automated or manual tests. Use read-only source/diff/schema review for currently authorized verification; record runtime behavior as unverified.
- Preserve existing edits and secrets. Do not copy credentials from TripRadar into IntoChat environments.
- Keep Google and Telegram as independent authentication providers. Neither requires the other. Keep existing password recovery for existing password accounts.
- Google is the primary onboarding option. Telegram remains optional and can be disabled independently without breaking Google.
- Telegram login is distinct from the travel bot, MiniApp product, message delivery and brain connectors.
- No account association by matching email, display name, username or chat ID alone.
- Keep existing TripRadar project/namespace names until behavior and dependency removal settle.
- Keep one public runtime. No fork of brain execution, app generation or connector logic inside the private platform.
- Platform owns billing/hosting; runtime owns brain/app behavior and enforces scoped access.
- Never infer that the target database is empty merely because the repository is a copy.
- Do not reset migrations, drop tables, run deployment scripts or contact live payment/provider APIs during extraction.
- No arbitrary resource quotas or selling prices are invented here. Unset commercial configuration blocks checkout/provisioning, with a clear operator error.
- No public production launch may be described as verified while behavior has only been inspected statically.

## Review focus

1. Google account without Telegram or username can reach profile, billing and brain APIs: tasks A2–A4.
2. One provider identity cannot attach to two people; same email does not prove identity: tasks A1/A3/A5.
3. Duplicate, reordered or interrupted payment events cannot grant duplicate resources or lose a purchase: B3/B4/C2.
4. Paid-but-not-provisioned and canceled-but-data-retained are explicit customer states: B5/C2/C5.
5. A user cannot reach another account's brain, billing or storage through a guessed ID: B1/C3/C4.

## What happens first

The first implementation batch is A0–A4: isolate configuration, introduce identity records, remove username-based authorization, fix provider login policies and simplify the Google UI path. This batch is complete only when a Google-only user is usable throughout the retained customer product.

Do not delete the bot first. First remove its authority over authentication and session creation. Then disable travel behavior, detach bot hosting, and remove its travel implementation.

### Priority and dependency map

| Order | Work package | Priority | Depends on | Outcome |
|---|---|---|---|---|
| 1 | A0–A4: independent auth | P0 | baseline | Google works without Telegram; existing Telegram identity preserved |
| 2 | A5–A6: linking and sessions | P0 before public access | A1–A4 | secure optional linking and predictable account/session behavior |
| 3 | R1–R5: travel retirement | P0 migration | A0; R3 after A4 | customer shell without travel services |
| 4 | B1–B2: accounts and product catalog | P0 | A1/A2 | clear owner/payer and cloud plans |
| 5 | B3–B5: billing reliability | P0 before charging | B1/B2 | durable commercial state and cancellation policy |
| 6 | C1–C5: hosted runtime | P0 before paid launch | B1; C2 uses B3–B5 | persistent, isolated and recoverable hosted brain |
| 7 | U1–U2: usage and limits | P0 before paid launch | B1/B2/C1 | measured platform consumption with hard caps |
| 8 | L1–L3: cloud dashboard and launch | P0 | all earlier P0 | coherent customer experience and operational readiness |
| Later | X1–X3 | P1/P2 | first paid journey | optional overages, teams/BYOC, naming cleanup |

Backend billing hardening and runtime adapter work can be developed independently after their contracts are defined. Do not make parallel schema changes to User, accounts or subscription tables without a single ordered migration owner.

## File and module map

All paths in task tables are relative to E:/intochat/intochat-cloud. Prefix aliases expand exactly as follows:

| Alias | Path |
|---|---|
| API | src/TripRadar.Server.API |
| Contracts | src/TripRadar.Server.API.Contracts |
| App | src/TripRadar.Server.Application |
| Domain | src/TripRadar.Server.Domain |
| Infra | src/TripRadar.Server.Infrastructure |
| Db | src/TripRadar.Server.Db |
| Web | src/TripRadar.WebUI/src |
| Jobs | src/TripRadar.Server.Jobs.API |
| Host | src/Aspire |
| Deploy | src/TripRadar.DeploymentKit |

Existing paths are source anchors. Create paths are proposed new files, not claims that those files already exist. Modify accompanying registrations, mapping profiles and consumers in the same change; each task requires a reference inventory before editing. Keep a file-level removal manifest under private implementation notes, with path, reason, callers, data effect and replacement.

Proposed new folders follow existing layering:
- Domain/Entities: ExternalIdentity, AuthSession, Account, AccountMembership, BillingCustomer, AccountSubscription, Entitlement, Brain, RuntimeInstance, ProvisioningOperation, StorageAllocation, Backup, ResourceUsageRecord.
- App/Contracts/Services: focused interfaces under Identity, Accounts, Billing, Hosting and Usage.
- App/UseCases: corresponding commands/queries.
- Infra/Services: implementations under Identity, Accounts, Billing, Hosting and Usage.
- Infra/Database/EntityFrameworkConfigurations: one mapping per new entity.
- API/Controllers: IdentityLinks, Accounts, Brains and cloud usage endpoints.
- Web/entities and Web/features: accounts, brains, billing and resource usage.
- Public runtime management contracts stay in the public runtime repository. Choose its actual project after inspecting its current management endpoints; do not fabricate a second protocol inside cloud.

## Shared proposed contracts

These define responsibilities and names for subsequent tasks. Use existing Result/error conventions. UserId stays long to preserve current keys; new AccountId/BrainId/OperationId/SessionId use GUIDs.

- VerifiedExternalIdentity(provider, issuer, subject, email?, emailVerified, displayName?, pictureUrl?): internal value created only by the server-side provider verifier.
- IExternalIdentityService.ResolveOrCreateAsync(identity, CancellationToken) -> Result&lt;User&gt;. Never accepts an asserted identity directly from browser JSON.
- ICurrentAccountService.RequireMembershipAsync(userId, accountId, CancellationToken) -> Result&lt;AccountMembership&gt;.
- Account-owned commands carry actorUserId and accountId separately; actor IDs come from the authenticated principal, never request bodies.
- IBillingEntitlementService.ReconcileAsync(accountId, CancellationToken) -> Result&lt;EntitlementSnapshot&gt;.
- IBrainProvisioningService.RequestAsync(accountId, brainId, operationId, CancellationToken) -> Result&lt;ProvisioningOperation&gt;.
- IRuntimeManagementClient.EnsureAsync(RuntimeDesiredState, operationId, CancellationToken) -> Result&lt;RuntimeObservedState&gt;. Desired state contains brain ID, pinned runtime version, allocation reference and resource profile; secrets are references, not serialized secret values.
- IResourceUsageService.RecordAsync(ResourceUsageInput, CancellationToken) -> Result&lt;UsageReceipt&gt;. Input contains sourceId, sourceEventId, accountId, brainId, operationId, unit, quantity, occurredAtUtc, priceVersion and attribution (platform-supplied or user-supplied).
- IResourceBudgetService.ReserveAsync(accountId, brainId, operationId, requestedBudget, CancellationToken) -> Result&lt;Reservation&gt;; CompleteAsync(reservationId, actualUsage, CancellationToken) and ReleaseAsync(reservationId, CancellationToken) settle it.
- State-changing browser endpoints use existing cookie/CSRF protections; linking uses recent authentication and one-time server-side intent.
- Public cloud resources use account-scoped routes. Every lookup includes both resource ID and authorized account ID.

## Authentication product rules

| Case | Expected behavior |
|---|---|
| New verified Google identity, no Telegram, no username | Create person and personal account; open cloud home |
| Returning Google identity | Resolve by issuer/subject; do not depend on current email or Telegram |
| Telegram identity without username | Valid identity by stable Telegram user ID; username remains optional display data |
| Telegram identity without email | Allow login/dashboard; require verified contact email at checkout, not Google linking |
| Matching email on an existing different identity | Do not merge. Offer explicit sign-in-and-link flow without disclosing private account details |
| User links both providers | Either provider returns the same internal user and personal account |
| Telegram disabled or bot service unavailable | Google/password login and customer APIs remain usable |
| Disabled platform user | Deny all provider login and refresh paths |
| Provider canceled/interrupted | Return to login with retry; do not create provider-link side effects |
| Last sign-in method removal | Refuse until another usable method is present |
| Telegram username changes | Do not change ownership or create a new user |
| Google email changes | Resolve same subject; update contact only under explicit contact policy |

Email verification is provider-specific: Telegram identity verification is not email verification. Password accounts retain email confirmation requirements. A Google verified-email attribute may establish contact verification according to configured policy but never authorizes merging two existing users.

## A0. Freeze scope and isolate the copied application

**Priority/dependencies:** P0 · first

**Files:** Modify: Host/AppHost.cs; Infra/Extensions/ServiceCollectionExtensions.Settings.cs; deployment configuration bindings. Create: Infra/Settings/CloudFeatureSettings.cs.

**Interfaces:** Produces independent feature switches used by A3/R1/B2/C2.

**Implementation steps**

- [ ] Record HEAD, existing changes, project references, configuration keys (names only), scheduled jobs and provider registrations.
- [ ] Introduce independent flags: Auth.Google.Enabled, Auth.Telegram.Enabled, Features.Travel.Enabled, Features.TelegramMessaging.Enabled, Billing.Checkout.Enabled and Hosting.Provisioning.Enabled.
- [ ] For migration configuration, default travel, Telegram messaging, checkout and provisioning off. Retain Google and optional Telegram auth only when configured. Disabling Telegram auth must not validate its secrets at startup.
- [ ] Classify target environments as fresh or carrying data using actual environment inventory before choosing schema strategy. No database connection is needed for drafting; do not assume a classification.
- [ ] Separate IntoChat provider IDs, domains, cookies, payment credentials and job namespaces from TripRadar. Keep secret values out of source and logs.
- [ ] Keep real-API startup out of verification commands; existing WithRealApis wiring must become an explicit selected environment profile.

**Acceptance and rollback considerations:** Configuration can describe Google-only cloud without bot/Kafka/travel credentials. Invalid enabled-provider configuration fails clearly; disabled optional modules do not block startup. Rollback: restore previous configuration bindings; no data changes.

## A1. Add provider-neutral identity records

**Priority/dependencies:** P0 · after A0

**Files:** Modify: Domain/Aggregates/User.cs; Domain/Entities/UserProfile.cs; Infra/Services/GoogleAuthenticationService.cs; Infra/Services/TelegramAuthenticationService.cs; Infra/Database/TripRadarDbContext.cs. Create: Domain/Entities/ExternalIdentity.cs; App/Contracts/Services/Identity/IExternalIdentityService.cs; Infra/Services/Identity/ExternalIdentityService.cs; corresponding EF configuration and Db migration.

**Interfaces:** Consumes VerifiedExternalIdentity; produces IExternalIdentityService.ResolveOrCreateAsync and unique provider identity ownership.

**Implementation steps**

- [ ] Define ExternalIdentity with internal key, UserId, Provider, Issuer, Subject, CreatedAtUtc and LastUsedAtUtc. Enforce unique Provider/Issuer/Subject and initially at most one identity per provider per user.
- [ ] Keep provider usernames, photos and emails as mutable attributes, never keys. Normalize Google's issuer consistently; scope Telegram identity to the configured identity integration and immutable numeric ID.
- [ ] Backfill existing GoogleId and TelegramUserId into identities without changing user IDs. Report duplicate external IDs as migration conflicts; never choose a winner silently.
- [ ] Make identity creation concurrency-safe using the unique constraint and reload after a collision.
- [ ] Retain legacy profile columns as compatibility data until all identity reads use the new table. Do not delete them in the same migration.
- [ ] Implement ResolveOrCreateAsync for verified server identities only. A verified identity resolves independently of email; email collision returns an explicit linking-required outcome without automatic association.

**Acceptance and rollback considerations:** Same subject returns same person; duplicate concurrent signup cannot create two owners; no email-based merge. Rollback: leave additive table in place and keep legacy columns; never drop migrated identity data to roll back application code.

## A2. Remove usernames from customer authorization

**Priority/dependencies:** P0 · before calling Google fixed

**Files:** Modify: API/Security/CurrentRequestUserProvider.cs; API/Filters/RequireUsernameFilter.cs; API/Controllers/BaseController.cs, UserController.cs, PaymentController.cs, UsageController.cs; retained App/UseCases handlers. Create: API/Filters/RequireUserIdFilter.cs if a filter remains necessary.

**Interfaces:** Produces stable actorUserId semantics for B1 and all customer APIs. TokenService already emits sub; no new identity identifier is needed.

**Implementation steps**

- [ ] Use the existing TryGetUserId implementation and token sub claim. Reject absent/invalid stable IDs; do not fall back to a client-supplied username.
- [ ] Inventory RequireUsername, GetUsername, TryGetUsername and username-based repository calls across retained REST/GraphQL/customer paths.
- [ ] Convert retained profile, billing, usage, feedback and security operations to actorUserId; replace command/query username parameters and corresponding repository lookup with ID.
- [ ] Keep provider username only for display and optional Telegram integration. Do not generate fake Telegram usernames for Google users.
- [ ] Update frontend auth-user mapping to allow null username and contact email; expose a stable internal user ID.
- [ ] Keep travel-only consumers isolated until R2 removes them; do not globally delete RequireUsernameFilter until no retained callers remain.

**Acceptance and rollback considerations:** Google person with null username can access every retained customer API; spoofed username does not affect identity. Review the complete caller inventory. Rollback: deploy compatible token readers; do not re-enable mandatory usernames for newly admitted users.

## A3. Make provider authentication independent

**Priority/dependencies:** P0 · after A1/A2

**Files:** Modify: Infra/Services/UserAuthenticationValidator.cs; Infra/Services/Authentication/GoogleAuthenticationOrchestrator.cs; Infra/Services/Authentication/AuthenticationService.cs; Infra/Services/GoogleAuthenticationService.cs; Infra/Services/TelegramAuthenticationService.cs; API/Controllers/TokenController.cs; API/Services/GoogleIdTokenValidator.cs; App/UseCases/Authentication/Commands/TelegramLogin/TelegramLoginCommandHandler.cs.

**Interfaces:** Consumes A1/A2. Produces independent session issuance for each enabled provider with provider-neutral account validation.

**Implementation steps**

- [ ] Split common account-status validation from provider-specific verification. Common login requires an active, allowed person; it never requires Telegram, username or a Google identity.
- [ ] Keep password email-confirmation policy on the password path. Treat a valid Telegram identity without email as authenticated with incomplete billing contact.
- [ ] Google route validates provider token and passes a server-created VerifiedExternalIdentity; explicitly handle missing subject and email verification policy.
- [ ] Remove automatic email linking from GoogleAuthenticationService. Preserve legitimate existing identity mappings via A1.
- [ ] Trace Telegram widget and MiniApp handlers separately: the inspected TelegramLoginCommandHandler resolves an existing Telegram ID, while creation is elsewhere. Route supported sign-in/signup through one verified identity resolution service; preserve cryptographic/freshness checks.
- [ ] Make unconfigured/disabled providers return a controlled unavailable response and hide their UI buttons.
- [ ] Review nested transaction ownership in GoogleAuthenticationOrchestrator/CreateUserAsync; one application operation owns creation and session issuance, without leaving partial user state.
- [ ] Separate request-IP audit capture from identity proof. Define trusted proxy handling; a missing optional audit IP must not strand valid provider identities.

**Acceptance and rollback considerations:** Google works with Telegram disabled and no Telegram data; Telegram identity works without a username or Google account; disabled users cannot log in through any provider. Runtime behavior remains unverified until separately authorized.

## A4. Replace forced Telegram onboarding in the frontend

**Priority/dependencies:** P0 · after A3

**Files:** Modify: Web/features/auth/lib/oauth.ts; Web/features/auth/ui/Login.tsx, Signup.tsx, OAuthButtons.tsx, LoginTelegramSection.tsx, ProtectedRoute.tsx, AuthGuard.tsx; Web/app/router/routes.tsx. Create: Web/pages/cloud/ui/CloudHome.tsx.

**Interfaces:** Produces provider-neutral cloud entry UI; consumes A3 sessions and A2 profile shape.

**Implementation steps**

- [ ] Remove telegramRequiredEmail from normal OAuth success/error navigation and remove TELEGRAM_REQUIRED as an onboarding instruction.
- [ ] Retain existing Firebase popup/redirect integration for this migration. Do not simultaneously swap identity SDKs.
- [ ] Remove pending tripradar.telegramBind.chatId from the general Google navigation decision. Explicit provider-linking callbacks own their own intent in A5.
- [ ] Navigate successful authentication to /cloud, or a validated same-origin return path; reject absolute/external return URLs.
- [ ] Load profile/session consistently after Google and Telegram sign-in. Display recoverable profile-loading failure without creating a second account.
- [ ] Add Google primary and Telegram secondary buttons driven by server-advertised provider availability. Disable travel-bot calls to action.
- [ ] Keep existing password sign-in/recovery for current password users; do not remove credentials as collateral cleanup.
- [ ] CloudHome initially shows signed-in identity and account setup status; it does not pretend a hosted brain exists.

**Acceptance and rollback considerations:** Normal Google signup never visits Telegram connect, username-sync or chat-binding screens. Telegram absence does not make protected-route checks fail. Stale browser bind keys do not hijack navigation.

## A5. Implement explicit identity linking and optional contact completion

**Priority/dependencies:** P0 before public access · after A1–A4 and A6. Implement A6 before completing A5 because link intents bind to its session ID.

**Files:** Create: API/Controllers/IdentityLinksController.cs; App/UseCases/IdentityLinks; Infra/Services/Identity/IdentityLinkService.cs; Domain/Entities/IdentityLinkIntent.cs; Web/features/auth/ui/LinkedIdentities.tsx. Modify: API/Controllers/TelegramLinkController.cs; Web/features/auth/lib/telegramBind.ts; Web/pages/profile security UI.

**Interfaces:** Produces explicit link/unlink operations and verified billing-contact status. Linking never moves accounts or subscriptions.

**Implementation steps**

- [ ] Separate identity linking from chat notification binding. An asserted chat ID never proves ownership of a login identity.
- [ ] Create a one-time link intent tied to current user, current session, chosen provider and short configured expiry; require recent authentication and CSRF protection.
- [ ] Consume a verified provider response only against that intent. Reject replay, expired intent, mismatched session and identity already owned by another user.
- [ ] If two existing users own the desired providers, stop linking and return a safe conflict. Account merge is a separate future workflow, not a hidden side effect.
- [ ] Allow unlink only when another usable sign-in method remains. Treat an unverified email address as insufficient fallback.
- [ ] For Telegram-only users collect a contact email through a separate verification flow before checkout; dashboard access remains available.
- [ ] Preserve Telegram message opt-in separately from auth linkage. No automatic subscription to bot messages on login.

**Acceptance and rollback considerations:** Google + Telegram linked to one user return the same account; concurrent linking cannot steal identities; removing final method is refused. Old chat-binding routes cannot bypass these rules.

## A6. Make sessions survive multiple providers and devices predictably

**Priority/dependencies:** P0 before public access · after A2/A3

**Files:** Modify: Infra/Services/TokenService.cs; Infra/Services/Authentication/AuthenticationTokenIssuer.cs; Infra/Services/UserAuthenticationValidator.cs; App/Services/Authentication/RefreshTokenOrchestrator.cs; API/Security/AuthCookieHelper.cs. Create: Domain/Entities/AuthSession.cs; session repository/configuration/migration.

**Interfaces:** Produces sessionId for A5 and scoped workspace access in C3.

**Implementation steps**

- [ ] Replace the single refresh token stored on UserProfile with a per-session record: session ID, user ID, hashed refresh credential, rotation version, expiry, revoked time and security-stamp snapshot.
- [ ] Keep platform session independent of provider browser SDK state. Logging out of cloud revokes cloud session and clears cookies.
- [ ] Serialize rotation per session with optimistic concurrency; define a controlled conflict for simultaneous refresh rather than silently revoking every device.
- [ ] Revoke affected session on credential replay; account disable/security action revokes all sessions using the existing security-stamp concept.
- [ ] Add current-session logout and explicit logout-all actions. Never log token values.
- [ ] Choose an explicit legacy-session migration: one forced reauthentication at cutover, communicated in release notes, while preserving user identities.
- [ ] Keep secure cookie and CSRF behavior; review anonymous login endpoints for browser login-intent correlation. A server-issued, short-lived intent and allowed-origin checks protect the token exchange; do not assume a client-only sessionStorage marker is sufficient.

**Acceptance and rollback considerations:** Login on a second device does not overwrite the first device's refresh credential; linking a provider does not create a second person; logout and disable invalidate the intended scope.

## R1. Disable travel entry points before deleting implementation

**Priority/dependencies:** P0 migration · after A0

**Files:** Modify: Web/app/router/routes.tsx; Web/pages/marketing; Web/pages/profile; API/Controllers/SearchController.cs, ScheduledQueriesController.cs, ScheduledExecutionController.cs, TripVaultController.cs; Infra/Extensions/ServiceCollectionExtensions.Scheduling.cs and BackgroundJobs.cs.

**Interfaces:** Produces a disabled travel surface and removal manifest for R2.

**Implementation steps**

- [ ] Remove travel pages from navigation and replace home/pricing copy with the cloud product skeleton.
- [ ] Gate travel REST/GraphQL routes server-side; hiding frontend routes alone is insufficient.
- [ ] Stop registering new travel schedules and explicitly retire existing recurring travel jobs in the selected target environment when operational changes are authorized.
- [ ] Keep billing jobs, deferred downgrade, account notifications and security operations registered.
- [ ] List inbound webhooks, queue consumers, bot commands and internal endpoints that can still invoke travel work.
- [ ] Mark obsolete product URLs as removed or redirect only where an actual equivalent exists; do not redirect every travel page to a misleading cloud feature.

**Acceptance and rollback considerations:** No reachable retained UI/API/job can initiate travel provider requests. Rollback is feature registration only, without dropping travel data.

## R2. Remove travel code as complete vertical slices

**Priority/dependencies:** P0 migration · after R1

**Files:** Remove after reference review: API travel controllers listed in R1; Domain scheduled travel query/TripVault/TripQueryHistory entities; related App/UseCases, Contracts, Infra repositories/providers and Web/features/scheduledRequests, Web/features/tripVault. Modify: Domain/Aggregates/User.cs; Infra/Database/TripRadarDbContext.cs; DI and mapping registrations.

**Interfaces:** Produces a smaller application graph; schema contraction belongs to R5.

**Implementation steps**

- [ ] For each slice inventory routes -> commands -> services -> providers -> persistence -> jobs -> UI and contracts. Store exact paths in the removal manifest before deletion.
- [ ] Remove trip vault/history slice, then scheduled travel queries/executions, then search/provider slices and travel-only reference data.
- [ ] Remove corresponding OpenAPI/client types, import barrels and navigation references in the same slice.
- [ ] Remove SerpApi travel adapters and travel-only credentials only after no retained consumer exists.
- [ ] Keep generic country/currency/language/timezone data where customer profiles or billing still use it. Do not classify by filename alone.
- [ ] Remove travel entity navigation collections from User and DbContext only when repositories and mappings are detached.
- [ ] Preserve payment, feedback, localization and generic UI components even if their namespaces still say TripRadar.
- [ ] Do not delete all tests as a cleanup shortcut. Retain relevant existing test sources; remove only artifacts exclusively about removed behavior, without running them.

**Acceptance and rollback considerations:** Static references show no retained caller requires removed types. Each slice is a reviewable commit with an explicit data impact and rollback boundary.

## R3. Detach Telegram login from the travel bot host

**Priority/dependencies:** P0 migration · after A4/A5/R1

**Files:** Modify: Host/AppHost.cs; Host/Hosting/Bot/BotExtensions.cs; Host/Hosting/Telegram/TelegramBotResolver.cs; Infra/Extensions/ServiceCollectionExtensions.Authentication.cs. Review/remove: src/TripRadar.Bot and src/TripRadar.MiniApp product components; API/Controllers/InternalUsersController.cs and TelegramLinkController.cs.

**Interfaces:** Produces optional Telegram authentication with no mandatory travel bot process.

**Implementation steps**

- [ ] Retain TelegramAuthValidationService and required bot identity credentials for enabled Telegram login.
- [ ] Remove unconditional server dependency on bot process and bot session-sync secret. Trace all session handoff/internal token routes before removal.
- [ ] Separate login-widget verification from inbound message processing; Telegram sign-in must not require the travel worker to run.
- [ ] Keep MiniApp authentication support only if it is an intended cloud entry surface; default the MiniApp product off and remove its travel screens.
- [ ] Remove travel bot commands, travel notification templates, and their queue handlers. Defer generic Telegram notification channel until there is a concrete customer use.
- [ ] Retire legacy chat-to-session handoff endpoints once retained frontend no longer uses them. Do not carry privileged internal auth shortcuts into the cloud platform.
- [ ] Keep provider setup documentation explaining that Telegram login can require a configured bot identity even when no bot worker is deployed.

**Acceptance and rollback considerations:** Google-only deployment needs no Telegram resources. Telegram-enabled deployment can authenticate without launching TripRadar.Bot. Disabling messaging does not disable identity login.

## R4. Reduce infrastructure only after consumers are gone

**Priority/dependencies:** P0 migration · after R2/R3

**Files:** Modify: Host/AppHost.cs; Host/Hosting/TripRadar; Infra/Extensions/ServiceCollectionExtensions.Providers.cs and BackgroundJobs.cs; Jobs/Program.cs; Deploy resource builders and project references.

**Interfaces:** Produces minimal customer API/web/worker/database topology plus required hosting resources.

**Implementation steps**

- [ ] Inventory Kafka producers/consumers after travel removal. If none remain, remove Kafka from the host and deployment; otherwise document each retained consumer before retaining it.
- [ ] Use the existing durable job mechanism for billing reconciliation and provisioning. Do not introduce a new broker just to replace a removed broker.
- [ ] Retain service defaults, health reporting and logging; remove travel-specific probes and required settings.
- [ ] Remove unused packages/project references after source consumers are gone. Keep package upgrades separate.
- [ ] Disable production side effects in default local profiles. Make mock/sandbox/live selection explicit per provider.
- [ ] Review DeploymentKit resource naming, secrets, ingress, storage and database assumptions against IntoChat; keep useful abstractions without deploying the copied topology unchanged.

**Acceptance and rollback considerations:** Each deployed dependency has a named retained consumer. No bot/Kafka/travel secret is mandatory without its feature enabled.

## R5. Perform schema cleanup using expand then contract

**Priority/dependencies:** P0 migration · after R2; destructive contraction can wait

**Files:** Modify: Infra/Database/TripRadarDbContext.cs; Db migration/model configuration; seed data and database bootstrap.

**Interfaces:** Produces schema migration instructions and a documented environment decision.

**Implementation steps**

- [ ] Select fresh-platform or existing-data route based on A0 evidence, not repository history.
- [ ] Fresh isolated database: define a cloud baseline containing retained account/billing data and new identity/account tables; retain old migration history in repository history/archive rather than applying travel seeds.
- [ ] Existing data: add new tables/columns, backfill stable links, deploy compatible reads/writes, reconcile row counts and conflicts, then schedule removal separately.
- [ ] Retain billing records, invoice references, consent and support history according to explicit retention requirements; travel removal does not authorize deleting customers.
- [ ] Remove travel seeds and migration startup dependencies from new cloud environments.
- [ ] Document rollback per migration and mark the last version supporting old schema. Data-dropping migrations require a recoverable snapshot and an explicitly authorized execution window.
- [ ] Leave unused travel tables temporarily rather than delaying auth or risking irreversible cleanup.

**Acceptance and rollback considerations:** Every retained table has an owner; no migration silently drops identity or billing data. Application rollback remains possible through the expand phase.

## B1. Introduce accounts as owners and payers

**Priority/dependencies:** P0 · after A1/A2

**Files:** Create: Domain/Entities/Account.cs and AccountMembership.cs; App/Contracts/Services/Accounts/ICurrentAccountService.cs; Infra/Services/Accounts/CurrentAccountService.cs; API/Controllers/AccountsController.cs; corresponding persistence and Web/entities/account.

**Interfaces:** Produces accountId and RequireMembershipAsync, consumed by all billing/brain/usage commands.

**Implementation steps**

- [ ] Create one personal account for each existing person using an idempotent backfill and signup operation. Add unique personal-owner constraint; preserve user IDs.
- [ ] Account has GUID ID, owner user ID, display name, status and created timestamp. Membership has account/user/role and unique account/user constraint.
- [ ] Implement owner role only for launch; keep a membership model without shipping invitations or complex roles.
- [ ] Resolve active account by authenticated membership. A browser-selected account ID is a request, never authorization.
- [ ] Add GET /api/v1/accounts and GET /api/v1/accounts/{accountId}; return only accessible accounts.
- [ ] Keep contact identity separate from billing contact; changing email does not reassign ownership.
- [ ] Ensure personal-account creation retries return the existing account instead of creating multiple accounts.

**Acceptance and rollback considerations:** Two people cannot enumerate or mutate one another's accounts. Repeated signup completion creates one personal account. Account operations work with either provider.

## B2. Move catalog and subscription ownership to accounts

**Priority/dependencies:** P0 · after B1

**Files:** Modify: Domain/Entities/UserSubscription.cs and Tier.cs; Infra/Services/Payments; API/Controllers/PaymentController.cs; Web/pages/payment/ui/SubscriptionCheckout.tsx and pricing configuration. Create: Domain/Entities/BillingCustomer.cs, AccountSubscription.cs, Entitlement.cs; account-scoped billing commands.

**Interfaces:** Produces account-owned billing and versioned plan catalog. Existing price choice remains server-controlled.

**Implementation steps**

- [ ] Map existing subscriptions/customers to personal accounts without creating new Stripe customers for already mapped owners.
- [ ] Introduce unique account-to-Stripe-customer mapping and explicit active subscription selection; preserve historical subscriptions separately.
- [ ] Keep prices/periods/currency concepts. Replace travel tier enums and Essential/Advanced assumptions with server-returned cloud plan identifiers and catalog versions.
- [ ] Plan configuration includes allowed brains, compute profile, storage allowance, included managed-model budget, billing period and price reference. No unset limit means unlimited by accident.
- [ ] Require verified billing contact before checkout. Telegram login does not require Google to satisfy this.
- [ ] Move payment-method/invoice/refund operations to account scope and re-check owner permission on every operation.
- [ ] Keep existing external API paths as temporary adapters only if they resolve the authenticated user's personal account safely; stop new username-based consumers.
- [ ] Default new checkout off until Stripe product mapping and all required resource limits are explicitly configured.

**Acceptance and rollback considerations:** Changing request tier/price/customer IDs cannot purchase an unauthorized price or inspect another account's payment data. UI and backend use the same catalog.

## B3. Make checkout creation recoverable

**Priority/dependencies:** P0 before charging · after B2

**Files:** Modify: Infra/Services/Payments/SubscriptionCheckoutService.cs, StripeGateway.cs, Internal/SubscriptionRecordService.cs; Infra/Providers/Stripe/Client/StripeApiProvider.cs. Create: Domain/Entities/CheckoutAttempt.cs and corresponding repository.

**Interfaces:** Produces a durable checkoutAttemptId used by B4/L1. Calls B2 catalog and ownership policies.

**Implementation steps**

- [ ] Create a durable checkout attempt keyed by account and client operation ID, with requested plan/version, status and provider references.
- [ ] Persist customer association before starting subscription checkout. Use deterministic provider idempotency keys derived from durable operation IDs, not a new random key on every retry.
- [ ] On timeout distinguish unknown provider outcome from confirmed failure; reconcile the attempt rather than issuing another customer/subscription blindly.
- [ ] Reject reuse of an operation key with different plan parameters.
- [ ] Prevent two simultaneous active checkout attempts from creating duplicate subscriptions; serialize per account and reconcile provider state.
- [ ] Always attach account/operation metadata, including when no promo code is present. Metadata aids reconciliation but does not replace server ownership checks.
- [ ] Persist returned checkout reference/state before replying. Display payment pending until confirmed backend state arrives.

**Acceptance and rollback considerations:** Repeated click, API retry and timeout recover the same intended purchase. A webhook arriving immediately can find the local customer association.

## B4. Add durable webhook intake and reconciliation

**Priority/dependencies:** P0 before charging · after B3

**Files:** Modify: Infra/Services/StripeWebhookHandler.cs; Infra/Services/Handlers/Stripe; Infra/Services/Payments/SubscriptionWebhookHandler.cs; API/Controllers/PaymentController.cs. Create: Domain/Entities/BillingWebhookInbox.cs and BillingOutbox.cs; Infra/Services/Billing/BillingReconciliationService.cs.

**Interfaces:** Produces reliable IBillingEntitlementService.ReconcileAsync input and commercial outbox operations for C2.

**Implementation steps**

- [ ] Verify signature before recording any event; preserve exact request-body handling and size limits.
- [ ] Persist inbox by unique provider/event ID with payload protection/retention policy, receipt timestamp, processing status, attempt count and last safe error. Acknowledge successful durable receipt; failed durable receipt returns retryable failure.
- [ ] Process inbox asynchronously with a lease. Duplicate event receipt returns the existing record without repeating side effects.
- [ ] Reconcile provider subscription state rather than trusting arrival order. Serialize per customer/subscription and prevent an older event from reactivating a canceled account.
- [ ] Persist entitlement changes and outbox messages atomically. Email, allowance resets and provisioning consume unique outbox operations after commit.
- [ ] Quarantine unassociated events with a retry/reconciliation path instead of silently discarding them.
- [ ] Represent permanent-invalid and transient-failure states separately; expose replay controls to operators with an audit trail.
- [ ] Add scheduled reconciliation of incomplete checkout attempts and account/provider discrepancies. Preserve existing useful event-specific protections.

**Acceptance and rollback considerations:** Duplicate/reordered delivery cannot send duplicate grants or reset allowance repeatedly. Database or worker failure leaves durable recoverable work.

## B5. Define subscription-to-service policy

**Priority/dependencies:** P0 before paid launch · after B4

**Files:** Modify: Infra/Services/Payments/SubscriptionStateService.cs, SubscriptionLifecycleService.cs, SubscriptionManagementService.cs, RefundService.cs; deferred downgrade jobs. Create: App/Contracts/Services/Billing/IBillingEntitlementService.cs; Infra/Services/Billing/BillingEntitlementService.cs.

**Interfaces:** Produces EntitlementSnapshot: account, plan version, effective limits, service state, effective/expiry times and reason.

**Implementation steps**

- [ ] Implement an explicit mapping for incomplete, active, trialing, past_due, unpaid, canceled and unknown provider states.
- [ ] Proposed default policy: no paid allocation for incomplete/unknown; active grants configured limits; trial grants only if trial explicitly configured; past_due blocks new paid allocations while an explicitly configured grace window governs existing execution.
- [ ] Require GracePeriod and DataRetentionPeriod configuration before enabling paid launch. Missing values fail readiness instead of silently deleting data.
- [ ] Cancel-at-period-end retains entitlement until period end. Immediate suspension stops new work but preserves data through retention policy.
- [ ] Reconcile reduced quotas without deleting excess data automatically: prevent new writes/work above limits, show remediation, preserve export path.
- [ ] Rewrite refund eligibility around unused/consumed cloud resources and support policy. Do not reuse travel-token thresholds as a hosting refund policy.
- [ ] Separate refunded-payment state from brain deletion; successful refund does not implicitly erase data.
- [ ] Define paid-but-provisioning-failed remediation: retry operation, show status, and make support refund/cancel available without double charge.

**Acceptance and rollback considerations:** Every payment state maps to a documented customer-visible service state. Cancellation, failed payment and refund cannot accidentally erase a brain.

## C1. Specify and implement the public runtime management boundary

**Priority/dependencies:** P0 · after B1

**Files:** Create private: App/Contracts/Services/Hosting/IRuntimeManagementClient.cs; Infra/Services/Hosting/RuntimeManagementClient.cs. Modify public digitalbrain: existing management/auth host and contracts after locating actual extension points.

**Interfaces:** Produces IRuntimeManagementClient and shared management protocol. Exact public source files require current runtime inventory before code edits.

**Implementation steps**

- [ ] Inventory existing runtime management, brain identity, persistence, access and health APIs before adding contracts. Record reuse versus new endpoints in the implementation manifest.
- [ ] Define versioned capabilities: ensure allocation for brain, observe readiness/version, request suspension/resume, create scoped workspace access, export, backup coordination and delete after retention authorization.
- [ ] Use account/brain/runtime identity mapping in cloud; the runtime receives its own brain scope and credentials, not the customer DB connection.
- [ ] Choose one authority for brain execution initially: one managed allocation per brain. Do not implement multi-node local/cloud synchronization in this milestone.
- [ ] Pin a supported runtime image and contract version; incompatible versions fail capability negotiation clearly.
- [ ] Keep provisioning driver private but management contract public so self-host installations remain coherent.
- [ ] Do not expose arbitrary shell commands, image names or host filesystem paths through customer APIs.

**Acceptance and rollback considerations:** Cloud can manage a brain through a versioned interface; public runtime can still start locally without cloud. No direct cloud writes into runtime tables.

## C2. Build durable brain provisioning

**Priority/dependencies:** P0 before paid launch · after C1/B5

**Files:** Create: Domain/Entities/Brain.cs, RuntimeInstance.cs, ProvisioningOperation.cs; App/UseCases/Brains/CreateBrain; Infra/Services/Hosting/BrainProvisioningService.cs; API/Controllers/BrainsController.cs; worker registrations.

**Interfaces:** Produces brainId, runtimeInstanceId and provisioning status for L1/C3.

**Implementation steps**

- [ ] Create brain registry and durable operation in one transaction after membership and entitlement checks.
- [ ] Expose POST /api/v1/accounts/{accountId}/brains with idempotency key; GET list/detail and operation status routes. Never accept owner identity from body.
- [ ] Track Requested, Provisioning, Ready, Failed, Suspending, Suspended and Deleting states; record desired and observed states separately where work is asynchronous.
- [ ] Worker leases operations, calls EnsureAsync with the same operation ID on retry, and records allocation reference before progressing.
- [ ] Recover crashes between resource creation and DB update by deterministic provider tags/operation lookup.
- [ ] Count pending allocations against brain quota; concurrent requests cannot both consume the last slot.
- [ ] On failure retain actionable operation status; do not report Ready until runtime health and storage attachment are confirmed.
- [ ] No automatic new charge on provisioning retry. Restrict destructive cleanup to allocations owned by that operation.

**Acceptance and rollback considerations:** Repeated create request yields one brain/allocation; paid failure is visible and recoverable; interrupted worker resumes without duplicate infrastructure.

## C3. Implement scoped workspace access and runtime isolation

**Priority/dependencies:** P0 before exposing hosted brains · after C2/A6

**Files:** Create: App/UseCases/Brains/OpenWorkspace; Infra/Services/Hosting/WorkspaceAccessService.cs. Modify: API/Controllers/BrainsController.cs; public runtime access validation.

**Interfaces:** Produces a scoped runtime session without coupling identity databases.

**Implementation steps**

- [ ] OpenWorkspace verifies session, membership, brain ownership and current entitlement on every request.
- [ ] Issue a short-lived, one-time exchange code bound to user/account/brain/runtime audience. Exchange it for a runtime session over authenticated server communication; never put long-lived cloud credentials in a URL.
- [ ] Do not share the platform's symmetric JWT signing key with runtimes. Use separate scoped credentials or verifiable public-key tokens according to the public contract.
- [ ] Re-check runtime scope for subsequent operations; workspace navigation success is not authorization for all brain IDs.
- [ ] Define revocation propagation for account disable, membership removal and suspension. Bound access lifetime so stale grants do not remain valid indefinitely.
- [ ] Choose initial deployment isolation: separate managed allocation and secret/storage scope per brain; provider may co-locate workloads but must enforce those boundaries.
- [ ] Enforce CPU/memory/concurrency limits and restrict runtime control-plane access. User-generated apps must not receive deployment credentials.
- [ ] Distinguish iframe/navigation concerns from authentication; document allowed origins and secure cookie/domain behavior.

**Acceptance and rollback considerations:** Guessed brain URL, copied code, wrong audience or expired exchange is denied. One compromised brain cannot use a shared platform key to impersonate customers.

## C4. Provide durable storage and backup recovery

**Priority/dependencies:** P0 before paid launch · after C1/C2

**Files:** Create: Domain/Entities/StorageAllocation.cs and Backup.cs; App/Contracts/Services/Hosting/IBrainStorageService.cs; Infra/Services/Hosting/BrainStorageService.cs; deployment storage bindings.

**Interfaces:** Produces recoverable brain storage and backup records; consumed by C5/L2.

**Implementation steps**

- [ ] Identify runtime data classes: transactional state, files/artifacts, connector secrets and backup data. Map each to durable storage and ownership.
- [ ] Allocate storage scoped to brain with stable identifiers independent of container lifetime. Do not store primary brain state only on ephemeral container disks.
- [ ] Use runtime-compatible backup coordination; copying files while state changes is not automatically a consistent backup.
- [ ] Record backup status, version, timestamps, storage reference and expiration. Keep credentials out of backup metadata.
- [ ] Define restore as a new controlled operation, with compatibility checks and safe handling of credentials before switching the active allocation.
- [ ] Provide authorized export independent of billing UI convenience; customer data access during retention must be explicit.
- [ ] Configure backup frequency, retention and recovery objectives before paid readiness. Do not promise an SLA absent operational evidence.

**Acceptance and rollback considerations:** Restart preserves state; a restore can reconstruct a supported brain; no customer can enumerate or fetch another brain's backup. These are acceptance requirements, not results of this planning session.

## C5. Implement suspension, deletion and runtime upgrades

**Priority/dependencies:** P0 before paid launch · after B5/C2–C4

**Files:** Create: App/UseCases/Brains/SuspendBrain, DeleteBrain, UpgradeBrain; Infra/Services/Hosting/BrainLifecycleService.cs; worker lifecycle handlers.

**Interfaces:** Produces durable lifecycle operations with data-preservation semantics.

**Implementation steps**

- [ ] Translate entitlement changes to desired runtime state through durable operations, never a direct webhook-to-container side effect.
- [ ] Suspension prevents new execution while preserving storage and authorized export according to policy.
- [ ] Deletion has requested, retention-pending, deleting and deleted stages. Require explicit customer action or documented retention expiry; no immediate deletion on payment failure.
- [ ] Make repeated deletion safe; clean only tagged/account-owned allocations and storage; retain minimal billing/audit evidence separately.
- [ ] Use pinned image upgrades with pre-upgrade backup and compatibility check. Rollback code only when data format remains compatible; otherwise restore to a separate allocation.
- [ ] Record operation progress and failures for support. Do not hide partial storage deletion as complete.
- [ ] Disable upgrades/deletions globally through an operational switch when recovery is needed.

**Acceptance and rollback considerations:** Cancellation does not erase data; failed upgrade is visible and recoverable; deletion does not target a different account or allocation.

## U1. Introduce an attributable resource usage ledger

**Priority/dependencies:** P0 before paid launch · after B1/C1

**Files:** Modify: Infra/Services/UsageEventWriter.cs; Domain/Entities/UsageEvent.cs; account usage APIs. Create: Domain/Entities/ResourceUsageRecord.cs; Infra/Services/Usage/ResourceUsageService.cs and persistence.

**Interfaces:** Produces IResourceUsageService.RecordAsync and account/brain usage summaries.

**Implementation steps**

- [ ] Preserve travel credit history as historical data where required; do not relabel it as cloud compute.
- [ ] Record typed units separately: managed model input/output tokens, managed compute duration and storage quantity/time. Never sum unlike units directly.
- [ ] Require stable sourceId/sourceEventId uniqueness for retry-safe ingestion. Reject same key with different measurement content into an operator discrepancy queue.
- [ ] Authenticate producer and map allowed account/brain scope server-side. Local self-reports cannot mint billable platform usage.
- [ ] Store price/catalog version and supplier attribution. User-supplied model keys and local compute have zero platform-supplied resource charge, while explicitly purchased platform services remain separately billable.
- [ ] Keep immutable measured records; corrections append adjustment records referencing originals.
- [ ] Define late-arrival handling and billing period assignment explicitly. Usage display includes freshness/settlement state.

**Acceptance and rollback considerations:** Retries do not double count; incompatible units remain separate; BYOK/local consumption is not misclassified as platform cost.

## U2. Enforce budgets before executing paid work

**Priority/dependencies:** P0 before paid launch · after U1/B5

**Files:** Adapt: Infra/Services/UserLimitService.cs and UserLimits reservation/commit patterns. Create: Infra/Services/Usage/ResourceBudgetService.cs; account/brain reservation persistence.

**Interfaces:** Produces IResourceBudgetService, reused by hosted runtime admission and usage UI.

**Implementation steps**

- [ ] Reserve expected maximum resource cost against account allowance before accepting bounded paid work.
- [ ] Use atomic account-budget updates so concurrent operations cannot overspend the final allowance.
- [ ] Settle actual measured consumption and release unused reservation; preserve operation ID across retries.
- [ ] Expire abandoned reservations only when execution status confirms they cannot still consume resources; lease timeout alone is not proof.
- [ ] Set enforced job duration/concurrency/token ceilings for variable work. When exact usage cannot be known in advance, reserve a bounded maximum and stop/reject beyond it.
- [ ] For initial launch use hard caps and clear “limit reached” behavior. Keep automatic PAYG collection disabled.
- [ ] Expose consumed, reserved, remaining and reporting timestamp, with units and plan period.
- [ ] Ensure runtime enforcement cannot be bypassed by direct workspace requests; the signed entitlement/budget boundary must cover the actual work path.

**Acceptance and rollback considerations:** Parallel jobs cannot exceed hard caps through a race; failed jobs release safely; paused/canceled plans cannot reserve new paid work.

## L1. Complete the cloud customer experience

**Priority/dependencies:** P0 before paid launch · after A4/B2/C2/U1

**Files:** Modify: Web/app/router/routes.tsx; retained profile/billing/usage pages. Create: Web/entities/brain, Web/features/brains, Web/pages/cloud.

**Interfaces:** Produces one coherent customer journey from signup to persistent workspace.

**Implementation steps**

- [ ] Implement cloud home: account, brains, create/open actions, provisioning progress and recoverable failure.
- [ ] Keep account/security/billing/usage navigation; remove travel-specific preferences and history.
- [ ] Show plan limits from server catalog; no invented unlimited claims or static travel prices.
- [ ] Checkout success page reads backend payment state and distinguishes payment received, provisioning, ready and failed.
- [ ] Display optional linked sign-in methods in security settings, separately from connected brain services such as Gmail.
- [ ] Show usage limits, suspension reason, billing-contact completion, invoices and cancellation effective date.
- [ ] Add delete/export/backup affordances only when corresponding backend capability exists.
- [ ] Replace travel marketing/legal/help copy with the actual hosted-runtime offering. Legal text requires product/legal review; this plan does not assert compliance.

**Acceptance and rollback considerations:** No success screen promises a ready brain before readiness; no Telegram prompts on Google onboarding; empty states explain the next concrete action.

## L2. Prepare operational visibility and recovery

**Priority/dependencies:** P0 before paid launch · after B4/C4/C5/U2

**Files:** Modify: Jobs registrations; service defaults and Deploy configuration. Create private operational runbooks and operator views/commands.

**Interfaces:** Produces operational ownership and recoverable failure procedures.

**Implementation steps**

- [ ] Expose failed webhook, unresolved checkout, stuck provision, missing usage, failed backup and failed lifecycle queues.
- [ ] Use correlation IDs linking account, checkout, subscription, brain and operation without logging tokens, secrets or unnecessary personal data.
- [ ] Add controlled retry/reconcile actions with authorization and audit records; no direct production SQL editing as normal support workflow.
- [ ] Separate liveness from readiness. Readiness includes required configuration, durable stores and supported runtime capability, not optional travel integrations.
- [ ] Document incident procedures for payment outage, provisioning outage, storage degradation, leaked runtime credential and restore failure.
- [ ] Define retention and data deletion behavior for logs, provider payloads and backups; preserve required billing records separately.
- [ ] Estimate infrastructure cost from chosen runtime allocation and storage profile before setting public prices. Do not equate subscription revenue with margin.

**Acceptance and rollback considerations:** Every async failure has an owner, discoverable status and bounded retry path; repeated failures cannot silently consume unlimited resources.

## L3. Stage the migration and record launch evidence

**Priority/dependencies:** P0 · final gate

**Files:** Modify deployment release manifests and private release checklist; update digitalbrain.docs status/requirements to reflect only completed work.

**Interfaces:** Produces a reviewable launch decision and honest readiness status.

**Implementation steps**

- [ ] Release additive identity/account schema first, then compatible application changes, then backfills, then remove old reads. Defer destructive contraction.
- [ ] Enable Google-only internal environment first; enable optional Telegram independently; keep checkout disabled until billing readiness.
- [ ] Enable limited hosted provisioning with a pinned runtime and explicit resource caps before accepting external paid users.
- [ ] Record each acceptance scenario's state: source-reviewed, behavior-unverified, demonstrated or blocked. No test/build execution is authorized by this plan.
- [ ] Do not infer production readiness from static review. If execution restrictions still prevent operational evidence, mark launch evidence outstanding rather than bypassing it.
- [ ] Prepare rollback that disables new checkout/provisioning while preserving access to existing accounts, billing reconciliation and customer data.
- [ ] Only after explicit deployment authorization, apply production configuration and phased feature enablement. Do not redirect TripRadar domains/customers automatically.
- [ ] Update public docs with actual availability and limitations; keep internal operations and credentials private.

**Acceptance and rollback considerations:** No enabled paid feature lacks ownership, recovery, configured limits and supporting evidence. No deployment or payment action occurs merely because this plan exists.

## X1. Enable opt-in overages only after trustworthy accounting

**Priority/dependencies:** P1 · after stable initial paid release

**Files:** Adapt: Infra/Services/MetterPaymentProcessor.cs; OverageBillingService.cs; Stripe overage adapters and usage UI.

**Interfaces:** Consumes U1/U2/B4; produces optional overage charging.

**Implementation steps**

- [ ] Retain current overage implementation as a reference until cloud units and accounting settle.
- [ ] Require explicit opt-in, spending cap and visible price schedule; hard caps remain default.
- [ ] Use settled ledger batches with stable batch IDs rather than assuming one immutable batch per calendar month.
- [ ] Reconcile invoice creation/payment and late usage; never mark a charge collected solely because an invoice object was created.
- [ ] Define payment failure and limit behavior before enabling the setting.

**Acceptance and rollback considerations:** No surprise charges; retries and late batches have explainable invoices.

## X2. Expand teams and bring-your-own-compute separately

**Priority/dependencies:** P2 · after first paid journey

**Files:** Extend account membership and runtime registration only when product scope is approved.

**Interfaces:** Consumes B1/C1; no dependency from initial release.

**Implementation steps**

- [ ] Add invitations/roles using existing account ownership rather than changing UserId semantics again.
- [ ] Specify remote-runtime enrollment, outbound connection, key revocation, offline behavior and responsibility for backup before implementing BYOC management.
- [ ] Separate billable coordination/storage services from user-owned execution.
- [ ] Keep local runtime usable without account connectivity and avoid cloud/local simultaneous-authority synchronization in this release.

**Acceptance and rollback considerations:** Future features extend established ownership/contracts without forcing local users onto paid cloud.

## X3. Rename projects after extraction is stable

**Priority/dependencies:** P2 · independently after R4

**Files:** Rename retained TripRadar.Server.*, WebUI, ServiceDefaults and deployment names to IntoChat.Cloud.* in a dedicated mechanical change.

**Interfaces:** Produces clear product naming without obscuring behavioral diffs.

**Implementation steps**

- [ ] Inventory assembly names, namespaces, generated clients, serialization names, migrations, resource names and CI references.
- [ ] Preserve persistent type/schema identifiers where a rename would change data compatibility.
- [ ] Rename source projects and presentation strings separately from live resource names.
- [ ] Do not combine mechanical rename with authentication or billing behavior changes.
- [ ] Remove compatibility aliases only after callers migrate; document package/image version changes.

**Acceptance and rollback considerations:** Rename has no intended identity, billing or persisted-data change; rollback remains mechanical.

## Removal order and retained responsibilities

| Sequence | Remove/disable | Keep | Prerequisite |
|---|---|---|---|
| 1 | Travel navigation, marketing claims, new travel schedule registration | Auth/profile/billing, stored data | Feature flags and manifest |
| 2 | Forced Telegram completion, username-sync as login gate | Independent Telegram login, optional identity linking | Stable user-ID authorization |
| 3 | Trip vault/history feature, travel scheduling feature, travel search feature | Generic preference primitives still used | All callers/consumers mapped |
| 4 | Travel bot commands, chat-to-session shortcuts, travel MiniApp | Telegram provider verification/configuration | Login no longer depends on bot |
| 5 | Travel providers, provider secrets/settings, travel-only queue consumers | Stripe/email/customer support providers | No retained consumers |
| 6 | Kafka/bot hosting only if unused; unused project/package references | Durable cloud jobs and service defaults | Infrastructure consumer inventory |
| 7 | Travel schema/seeds, legacy identity columns | Customers, identities, financial history | Backfill/reconciliation and safe contraction |
| 8 | TripRadar namespaces/resource branding | Compatible persistent identifiers | Functional extraction stable |

Do not delete IdentityHosting or other public runtime kernel functionality simply because cloud identity now exists. Platform customer login and runtime access are different boundaries.

## Concrete first implementation batch

Recommended first four review units, each scoped to a separate commit/PR if the repository uses PRs:

1. **Migration switches and identity schema (A0/A1).** Add provider-neutral identities and configuration boundaries. Preserve legacy fields. Deliver exact migration conflict report shape.
2. **Stable user authorization (A2).** Convert retained endpoint/handler chains end to end. Do not ship a partial conversion where login succeeds but billing still demands username.
3. **Independent provider login and frontend navigation (A3/A4).** Google-only onboarding, optional Telegram login, cloud home. Keep checkout/provisioning disabled.
4. **Sessions, then identity linking (A6/A5).** Implement session IDs first, then bind explicit link intents to them. Include billing contact completion before public access.

Then retire travel slices and establish account/billing ownership. Public charging waits for B3–B5, C1–C5, U1–U2 and L1–L3. Removing travel code does not itself make a hosted product ready.

## API compatibility decisions

- Preserve existing provider login URLs initially so browser migration does not require simultaneous identity SDK changes.
- Replace username authorization internally before removing username response fields; optional display fields can remain.
- Introduce account-scoped billing/brain APIs alongside legacy personal billing adapters for one migration window.
- Return stable machine-readable errors: PROVIDER_UNAVAILABLE, IDENTITY_LINK_REQUIRED, IDENTITY_ALREADY_LINKED, LAST_SIGN_IN_METHOD, BILLING_CONTACT_REQUIRED, ACCOUNT_FORBIDDEN, ENTITLEMENT_REQUIRED, LIMIT_REACHED, OPERATION_PENDING and RUNTIME_UNAVAILABLE. Use existing error transport conventions.
- Use 401 for unauthenticated requests, 403 for denied actions, and 404 for inaccessible resources where revealing existence would leak another account's data. Use 409 for conflicting operation parameters/state.
- Never return provider secrets, raw tokens, storage connection strings or infrastructure administrator endpoints.
- Browser payment completion is a navigation event; only backend reconciliation changes entitlement.

## Acceptance scenario catalog

These are future behavioral acceptance criteria, not instructions to run tests now.

| ID | Scenario | Expected outcome | Owner |
|---|---|---|---|
| AUTH-01 | New Google user with no Telegram/username | Cloud home, profile and account APIs usable | A2–A4 |
| AUTH-02 | Returning Google user after email changes | Same person/account by subject | A1/A3 |
| AUTH-03 | Valid Telegram user without username/email | Login succeeds; checkout asks for verified contact | A3/A5 |
| AUTH-04 | Telegram provider disabled | Google unaffected; no Telegram config required | A0/A3 |
| AUTH-05 | Existing email associated with different identity | No automatic merge or ownership transfer | A1/A5 |
| AUTH-06 | Same identity linked concurrently to two users | Exactly one owner; safe conflict for other | A1/A5 |
| AUTH-07 | Last credential unlink | Refused without account lockout | A5 |
| AUTH-08 | Two devices, refresh, logout-one and disable-user | Correct session scope; disabled user loses access | A6 |
| AUTH-09 | Replayed/mismatched login or link intent | Denied without linking or session confusion | A5/A6 |
| AUTH-10 | Stale Telegram bind key in browser | Ordinary Google flow still opens cloud home | A4 |
| BILL-01 | Double checkout click | One durable intended purchase | B3 |
| BILL-02 | Provider succeeds but API times out | Reconciled purchase; no duplicate subscription | B3/B4 |
| BILL-03 | Webhook before local checkout response | Durable association and eventual processing | B3/B4 |
| BILL-04 | Duplicate and reversed-order events | No duplicate grant/reset; current state reconciled | B4 |
| BILL-05 | Past due/cancel/refund | Explicit service policy, retained data | B5/C5 |
| HOST-01 | Repeated create with same operation key | One brain and allocation | C2 |
| HOST-02 | Worker dies after allocation creation | Finds original allocation on retry | C2 |
| HOST-03 | Customer guesses another brain/account ID | No access or ownership leak | B1/C3 |
| HOST-04 | Container replacement | Persistent state survives | C4 |
| HOST-05 | Payment succeeds, provisioning fails | Visible status and recoverable remediation | B5/C2/L1 |
| HOST-06 | Upgrade fails after schema change | Honest recovery path, no unsafe image-only rollback | C5 |
| HOST-07 | Cancel plan | No immediate irreversible data deletion | C5 |
| USAGE-01 | Same source event delivered twice | One measured record | U1 |
| USAGE-02 | Concurrent final-allowance reservations | Hard cap enforced atomically | U2 |
| USAGE-03 | User's own model key/local compute | No platform resource charge | U1 |
| USAGE-04 | Worker disappears with reservation | Reconcile execution before releasing allowance | U2 |
| CLEAN-01 | Retired travel route/job invoked | No travel execution/provider request | R1–R4 |

## Outstanding launch decisions, with bounded defaults

These do not block starting auth extraction; each has a named deadline.

| Decision | Proposed direction | Must be resolved before |
|---|---|---|
| Existing database/data import | Fresh isolated IntoChat database unless actual retained customers require migration; never assume | R5 schema execution |
| Initial hosting driver | Reuse relevant Azure deployment abstractions if they satisfy persistence/isolation; keep runtime client independent of provider | C2 allocation implementation |
| Plan prices and included resources | One simple hosted plan plus explicit caps; no automatic overages | B2 checkout enablement |
| Payment grace and data retention | Explicit configuration and customer-facing policy; no destructive default | B5 paid enablement |
| Recovery objectives | Define backup frequency and restoration target against actual storage design | C4/L3 |
| Telegram MiniApp | Keep login provider; MiniApp product off initially | R3 |
| New password signup | Preserve current users/recovery; Google primary, Telegram optional; avoid expanding password signup scope during extraction | A4 public UX |
| Browser Google SDK replacement | Keep existing Firebase integration initially; revisit only for a concrete benefit | Not a launch dependency |
| Provider/policy verification | Check current official Google, Telegram and Stripe contracts when implementing their integration details; this source-based plan does not freeze external API behavior | A3/B3 |
| Evidence under no-tests constraint | Maintain honest source-review status; obtain later authorization for any runtime validation required for deployment | L3 production decision |

## Rollback and work sequencing rules

- Keep a small reviewable change per task or tightly coupled acceptance unit; avoid an all-at-once rename/delete/auth rewrite.
- Add schema before readers; migrate data before removing compatibility fields; contract schema last.
- Billing and provision switches stop new business activity without stopping reconciliation of prior accepted work.
- Rollback must preserve newly registered Google-only users; restoring old Telegram-required validation is not an acceptable rollback after admitting those users.
- Rollback a provisioning release by pausing new requests and retaining known allocations; never indiscriminately tear down resources.
- Keep audit records for identity conflicts, subscription reconciliation and lifecycle operations.
- Review the plan against source again at implementation start if HEAD has changed. Do not treat line numbers or current call graphs as immutable.

## Completion and handoff

This plan covers independent authentication, optional Telegram, travel removal, account ownership, billing adaptation, hosted runtime integration, persistence, metering and launch operations.

The first success criterion is narrow and concrete: a customer can sign in with Google, without Telegram or a username, and use the retained customer shell. The final commercial criterion adds a paid, persistent, isolated brain with visible limits and recovery paths.

Implementation has not started. No tests, builds, deployment, deletion or payment operations were performed while preparing this plan.

