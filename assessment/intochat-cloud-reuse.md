# IntoChat Cloud: TripRadar reuse assessment

Date: 2026-10-15. Source: E:\intochat\intochat-cloud, commit 3fe6ccf25a40358bdde68d26ec364e6fff81f6c9.

Status: architectural proposal grounded in static source review. No tests, builds, application startup, payment calls, deployment, or code deletion were performed. Source presence is not proof of production reliability. This copy has a different HEAD from the previously reviewed TripRadar repository.

## Decision

Use the copied repository as the private platform foundation. Retain its layered application structure, account infrastructure, Stripe integration, billing UI, and operational patterns. Replace its travel domain with cloud account ownership, hosted-brain lifecycle, and resource entitlements.

The strongest reuse is the commercial application surrounding the runtime. The largest new capability is reliable hosting of DigitalBrain instances. Payment code does not provide provisioning, tenant isolation, durable brain storage, or secure platform-to-runtime access.

Keep one public runtime implementation for local, self-hosted, and managed use. A local installation must work without a paid cloud account. Customers pay for services IntoChat operates: hosted execution, persistent storage, managed model usage, backup, and convenience.

## Keep, adapt, remove, build

Paths below are relative to the copied repository unless stated otherwise.

| Area | Evidence | Decision |
|---|---|---|
| Backend structure | API, API.Contracts, Application, Domain, Infrastructure, Db projects | Keep layering. Start as a modular application; no need to turn every module into a service. |
| Payment integration | Infrastructure/Services/Payments and Providers/Stripe | Keep provider integration and orchestration; adapt account ownership and commercial policies. |
| Checkout | SubscriptionCheckoutService.cs; WebUI/src/pages/payment/ui/SubscriptionCheckout.tsx | Keep server-selected prices and Stripe Elements integration. Replace Essential/Advanced travel plans, copy, routes, and branding. |
| Billing self-service | API/Controllers/PaymentController.cs | Keep invoice, card, subscription, cancellation, and refund capabilities. Review policies individually; their presence does not make them appropriate for resource hosting. |
| Google authentication | API/Services/GoogleIdTokenValidator.cs; Infrastructure/Services/GoogleAuthenticationService.cs | Keep validation/session infrastructure with corrections to linking and onboarding. |
| Customer profile | User/UserProfile and profile UI | Adapt to stable user IDs, separate external identities and account memberships. User is a person; billing account is the owner/payer. |
| Usage allowance | UserLimitService.cs, UserLimits/*, UsageEventWriter.cs | Reuse reservation/commit/rollback concepts. Replace service-credit semantics with explicit resource accounting. |
| Overage collection | MetterPaymentProcessor.cs, OverageBillingRecords | Reuse batching, processing locks, Stripe idempotency support, reconciliation concepts. Do not expose automatic overages in the first release. |
| Persistence | TripRadarDbContext.cs, entity configurations and repositories | Keep database access patterns; build a platform schema without travel entities. This database is not brain storage. |
| Frontend structure | shared/entities/features/pages; auth/payment/profile | Keep UI primitives, API infrastructure, and feature organization. Build cloud dashboard and hosted-brain entry points. |
| Travel product | ScheduledFlight/Hotel/LocalPlace/EventQuery; TripVault; TripQueryHistory; travel reference data | Remove from the platform after tracing consumers, migrations, seeds, jobs, routes, and contracts. |
| Travel providers | Providers/SerpApi and travel-specific services | Remove platform dependencies. A future travel application may use public runtime connectors separately. |
| Telegram | Bot, MiniApp; UserAuthenticationValidator.cs | Remove compulsory Telegram onboarding and bot/session coupling from the cloud core. Optional messaging belongs to a later integration. |
| Scheduling | Jobs.API, background job services | Keep useful billing/reconciliation job mechanisms; remove scheduled travel searches. Runtime automation remains a runtime responsibility. |
| Deployment | Aspire/AppHost.cs and DeploymentKit | Adapt selectively. Host currently wires Kafka, bot, website, server, and real APIs. It is not a minimal cloud topology. |
| Localization and service defaults | Localization projects; ServiceDefaults | Retain where used; replace travel messages. Deployment kit existence is not evidence of verified IntoChat operations. |
| Hosted brains | No corresponding cloud ownership/provisioning model found in reviewed domain | Build lifecycle, routing, runtime identity, storage allocation, backup/restore, and upgrade management. |

## What is genuinely strong in this foundation

Payments are more than a placeholder checkout button. The API exposes subscription checkout, setup/payment methods, invoices, cancellation, tier changes, refunds, and metered-billing controls. SubscriptionCheckoutService resolves prices from server-side tier/billing-period data. StripeGateway separates business orchestration from the provider adapter.

StripeWebhookHandler requires a signing secret/signature outside an explicitly enabled development bypass. It distinguishes retryable processing errors. Subscription services use transaction scopes and have deferred downgrade behavior.

MetterPaymentProcessor claims rows using processing IDs, includes stale-lock cleanup, supplies Stripe idempotency keys, and records invoice IDs. InvoicePaymentSucceededHandler includes reconciliation of overage records. These are useful implementation details to preserve.

UserLimitService already separates eligibility, reservation, commit, and rollback. The frontend has reusable checkout/card/cancellation components rather than a single tangled payment page.

This supports choosing reuse. It does not support a numerical claim such as “80% production ready”: the missing hosting layer carries a large part of the new product's responsibility.

## Specific changes required before paid launch

### 1. Google signup must create a usable cloud account

UserAuthenticationValidator.ValidateForLogin rejects users without TelegramUserId or username. That prevents the intended Google-only onboarding.

GoogleAuthenticationService automatically associates an existing email account with a new Google identity. Replace this with explicit identity linking backed by proof of control of the existing account. The reviewed UserProfileConfiguration indexes GoogleId without uniqueness. Model external identities with a unique provider/subject identity and a stable internal user ID.

GoogleIdTokenValidator validates the token against configured audiences. TokenController passes identity attributes into login; the inspected route does not explicitly check EmailVerified. Define verification and linking policy, including non-Gmail Google accounts, rather than treating email equality as identity proof.

Keep Gmail connector authorization separate: signing into IntoChat must not request mailbox access. A customer connects Gmail to a specific brain later.

### 2. Customer identity is not the billing or runtime ownership model

The current payment routes resolve a username, and subscriptions/usage attach to UserId. Introduce:

- User and ExternalIdentity: the person and their login identities.
- Account and Membership: the resource owner, payer, and authorized people.
- BillingCustomer, Subscription, Entitlement: commercial state for that account.
- Brain and RuntimeInstance: logical workspace versus its running deployment.
- StorageAllocation and Backup: durable data and recovery metadata.
- UsageRecord and ProvisioningOperation: accountable consumption and retryable lifecycle work.

Start with one personal account per user and one owner role. A membership model avoids tying every future resource directly to a person without requiring a full teams product at launch.

### 3. Payment delivery requires durable recovery

SubscriptionCheckoutService creates a Stripe customer and starts checkout before persisting a newly created customer mapping. SubscriptionCreatedHandler can acknowledge an event even when no local customer mapping is found. This creates a source-visible race/failure window in which an event can be accepted before it can be associated with its owner.

Persist the customer association before starting checkout, make checkout creation repeatable, and reconcile orphaned/missing associations. Do not grant service solely from a browser success redirect.

No durable event-ID inbox/deduplication store was found in the reviewed webhook path or DbContext. This is a review gap, not a claim that every handler lacks local duplicate protections. Subscription-created handling can reset allowances and send mail; business effects must be idempotent as well as provider requests. Use a durable webhook inbox and an outbox for notifications/provisioning, with replay and reconciliation.

### 4. Define what happens when payment stops

SubscriptionUpdatedHandler recognizes active, trialing, past_due and unpaid for linkage. SubscriptionWebhookHandler's state application retrieves an active subscription only. Non-active states can therefore return success without applying a cloud suspension policy in this path.

Specify trial eligibility, payment grace, restriction of new work, cancellation at period end, data retention, export, and eventual deletion. Cancellation must not instantly destroy a customer's brain. Provisioning failure after payment must have a visible recovery/refund path.

RefundService is coupled to monthly-token/tier eligibility. Keep the refund mechanism but replace travel-credit refund rules with a policy appropriate to hosting and consumed resources.

### 5. Travel credits are not cloud resource measurements

Tier exposes TokensPerMonthLimit. UserLimitDecisionService resolves a fixed service token cost. UsageEvent contains user, service type, consumed tokens, source, and optional TripVaultId; its constructor generates a new GUID.

For cloud accounting, record account, brain, runtime operation, resource unit, quantity, time, price version, and a stable originating event ID. A fresh GUID on each ingestion attempt is not retry deduplication. Distinguish model input/output tokens, compute time and storage quantities; a marketed credit balance can sit above those measurements.

Only charge resources supplied by IntoChat. Local compute and user-paid model keys must not be counted as platform-provided consumption. Local clients cannot be trusted as the authority for billable hosted usage.

The monthly overage worker selects the previous calendar month. That is a policy choice to revisit against subscription billing periods and late-arriving usage. Existing idempotency keys are a useful start; late batches, retries after partial failure, and settlement reconciliation still need a defined model.

### 6. Hosting and persistence remain the major new subsystem

Implement provisioning states such as requested, provisioning, ready, failed, suspended, and deleting. Operations need durable IDs, retry behavior and visible customer status.

Each hosted brain needs an enforceable isolation boundary, persistent data beyond container restarts, protected secrets, resource limits, backup and restoration, and a supported runtime version. A shared customer database or an Azure storage helper does not establish those properties.

Use a versioned management API and authenticated runtime identity. The platform may start/stop a runtime and issue short-lived, audience-scoped access. It must not edit runtime tables directly or give a runtime the platform's customer database credentials.

## Proposed repository and folder boundary

This is a target structure, not a demand for an immediate wholesale rename.

```text
E:/intochat/
  digitalbrain/                         PUBLIC
    src/
      ...existing runtime projects...
      ...runtime management contracts...
    modules/                           connectors and capabilities
    deploy/                            local/self-host packaging

  intochat-cloud/                      PRIVATE; copied TripRadar
    src/
      IntoChat.Cloud.API/
      IntoChat.Cloud.Application/
        Identity/
        Accounts/
        Billing/
        Entitlements/
        Brains/
        Provisioning/
        Usage/
      IntoChat.Cloud.Domain/
      IntoChat.Cloud.Infrastructure/
        Persistence/
        Payments/
        RuntimeClient/
        Hosting/
        Storage/
        Notifications/
      IntoChat.Cloud.Db/
      IntoChat.Cloud.Worker/
      IntoChat.Cloud.Web/
      IntoChat.Cloud.ServiceDefaults/
    deploy/                            managed hosting infrastructure
    docs/                              private operational/internal details

  digitalbrain.docs/                   product/public documentation
    product/
    assessment/
    plans/
```

Folders within the private application are sufficient initially; avoid creating a separate service for each folder. Keep existing project names during early extraction if that reduces churn; rename after the boundaries stabilize.

Cloud consumes versioned public runtime contracts and container images. The public runtime must not depend on private platform packages. DigitalBrain.Platform currently contains runtime/kernel infrastructure; its name alone is not a reason to move it private.

Platform database: customer identities, membership, payment references, entitlements, brain registry, provision jobs, usage and backup metadata.
Runtime storage: conversations, app definitions, execution state, connector bindings, files and brain data.
Managed object storage: artifacts/backups with per-brain authorization. Secrets need a distinct controlled storage policy.

## Ordered transition plan

1. **Define the first paid journey and boundaries.** Google signup -> personal account -> choose hosting plan -> provision persistent brain -> open workspace -> see usage and billing. Define included storage/compute and spending limits before price implementation.
2. **Extract the reusable customer shell.** Keep auth/profile/billing UI and backend. Remove Telegram requirement. Add stable identity/account ownership. Retire travel routes, jobs and providers together with their registrations and schema dependencies.
3. **Connect one hosted brain end to end.** Add provisioning, scoped access, restart persistence, resource isolation, failure recovery and export. Pin a runtime release.
4. **Attach billing to entitlements.** Durable payment processing, account subscription state, grace/cancellation policies and reconciliation. Enable paid access only when resource readiness and entitlements agree.
5. **Introduce measured usage with hard caps.** Preserve accurate internal resource records. Launch with included allowances and explicit limits; add opt-in overage charging after accounting/reconciliation is established.
6. **Complete launch operations.** Backup/restore process, runtime upgrades/rollback, failed-job visibility, account deletion/retention workflow, support diagnostics, and deployment configuration specific to IntoChat.

For a new empty platform database, a fresh platform baseline is simpler than carrying travel schema history indefinitely. If any deployment has real data, preserve migrations and plan explicit data conversion instead. Do not rewrite migration history on an assumption that copied code implies an empty database.

Remove Kafka only after identifying remaining producers/consumers. The current host explicitly needs it for the bot; that does not prove the retained billing platform needs it. Keep background processing where billing and provisioning need durable asynchronous execution.

## Product readiness conclusion

Reusable commercial foundation: substantial and concrete.
Ready to deploy as IntoChat Cloud today: not established.
Main blockers: independent Google onboarding, account/brain ownership, recoverable billing-to-entitlement transitions, hosted runtime isolation and lifecycle, persistent storage/recovery, resource accounting.

The recommended first release sells a persistent managed DigitalBrain with clear included resources. Local open-source operation remains free of mandatory platform dependencies. Bring-your-own-compute cloud coordination, advanced teams, public discovery, and automatic overages can follow without blocking that first commercial loop.

## Review boundaries

Deepest review: checkout, subscription events, Google login policy, usage model and monthly overage processing. Frontend checkout was inspected as source, not rendered. Deployment kit and several supporting projects were inventoried, not exhaustively audited. No assertion is made about their deployed configuration, provider account setup, visual quality, or operational success. Findings are architecture/product readiness evidence, not a completed security audit.

