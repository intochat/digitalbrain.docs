# Phase 2: Reusable DigitalBrain Modules from IntoChat Cloud

> For agentic workers: use the executing-plans workflow when implementation is requested. This is a future phase, not authorization to begin extraction, deployment, payment operations or tests.

**Goal:** Extract reusable capabilities from the completed IntoChat Cloud platform into public DigitalBrain modules, then consume those capabilities from IntoChat Cloud without duplicating integrations or exposing private platform policy.

**Architecture:** Public modules provide provider integrations and reusable execution capabilities. Private cloud code owns customer relationships, pricing, entitlements and hosting policy. Extract framework-independent provider code first, add neuron adapters, and migrate cloud execution only after reliability and operational boundaries are established.

**Tech stack:** Existing .NET provider integrations, DigitalBrain neurons/Orleans, connection-scoped credentials, persistent operation state and journaled signals. Retain the existing cloud application and database for customer/business state.

**Spec:** [Phase 1 cloud migration plan](./intochat-cloud-migration.md) and the subsequent architecture discussion about reusing cloud capabilities through DigitalBrain modules.

**Status:** Proposed future work. Phase 1 completion has not been asserted. Created 2026-10-15.

## Entry gate: finish Phase 1 first

Do not make reusable-module extraction a dependency of completing the initial cloud migration.

Start Phase 2 only after Phase 1's core migration and paid-launch scope are implemented: independent authentication, travel removal, account ownership, recoverable billing, hosted runtime integration, persistent storage, usage limits and operational recovery. Phase 1's explicitly deferred P1/P2 work, such as teams, automatic overages and mechanical renaming, does not block this phase.

Before starting:

- [ ] Review actual Phase 1 implementation and current repository HEADs; previous source paths are anchors, not immutable architecture.
- [ ] Record the operational evidence and unresolved limitations of the implemented cloud platform.
- [ ] Confirm that extraction preserves current billing and customer behavior.
- [ ] Identify the authoritative owner of each persisted record and external side effect.
- [ ] Select a reversible first extraction with no schema or payment-policy change.

The user instruction not to run tests remains in effect until changed. Acceptance criteria below describe required behavior, not permission to execute tests. Do not represent source inspection as evidence of runtime reliability.

## Global constraints

- Keep the public runtime usable locally without a cloud account.
- Never make public packages depend on the private cloud repository.
- Keep one provider implementation shared by direct cloud services and neuron adapters.
- Do not move TripRadar/IntoChat user, tier or account entities into public provider contracts.
- Keep platform Stripe credentials isolated from customer-owned Stripe connections.
- Do not execute platform billing inside customer-controlled brains.
- Treat provider operations and signal delivery as retryable; never assume exactly-once external effects.
- Do not publish secrets, customer data, infrastructure credentials or private operating policy.
- Keep Google/Telegram identity login distinct from Gmail/Telegram application connectors.
- Do not replace working cloud services merely to maximize the number of neurons.

## Review focus

1. A provider accepts an operation before the process crashes: recover the same operation without repeating a charge.
2. A webhook or signal is delivered twice or out of order: reconcile provider state and apply each business effect once.
3. Customer apps and platform billing use the same module: credentials, permissions and data remain isolated.
4. A module version changes while operations are pending: preserve serialization compatibility and operation recovery.
5. A module service is unavailable: retain accepted work and customer state; avoid activating a second competing writer.

## Public capability versus private product policy

| Public/reusable capability | Private IntoChat policy |
|---|---|
| Create Stripe customer/checkout and inspect subscription | Which cloud plan a customer can buy |
| Receive and normalize verified provider events | Which entitlement a plan grants |
| Create refund and report provider outcome | Whether a customer qualifies for a refund |
| Deliver email or Telegram message | IntoChat templates, consent and notification rules |
| Store/retrieve scoped artifacts | Hosting allocation and customer retention policy |
| Record typed usage and reserve a budget | Prices, margins, included allowances and overage rules |
| Runtime management protocol | IntoChat infrastructure topology and deployment decisions |

Generic subscription/entitlement abstractions may become public later, after there are multiple real consumers. Do not generalize IntoChat's commercial rules prematurely.

## Target package structure

Proposed structure in the public runtime repository; align naming with current module conventions at implementation time:

```text
digitalbrain/
  src/DigitalBrain.Modules/
    Stripe/
      DigitalBrain.Integrations.Stripe/          provider adapter, no neuron dependency
      DigitalBrain.Modules.Stripe.Contracts/    commands, results, signals
      DigitalBrain.Modules.Stripe/              neurons, persistence, webhook ingress
      DigitalBrain.Modules.Stripe.Aspire.Hosting/
    Email/
      ...provider adapter, contracts, module...
    Telegram/
      ...messaging capability if not already available...
```

Private consumption:

```text
intochat-cloud/
  ...existing application...
  Billing/             IntoChat subscription and entitlement policy
  Hosting/             private managed-brain orchestration
  Notifications/       IntoChat templates and customer preferences
  Integrations/        adapters consuming versioned public packages/contracts
```

These are logical boundaries, not instructions to rename Phase 1 projects again. Prefer extending an existing module over creating a duplicate.

## P2-01. Inventory and separate provider code

**Priority:** first.
**Source anchors:** cloud Infrastructure/Services/Payments/StripeGateway.cs, Providers/Stripe/Client/StripeApiProvider.cs, Services/StripeWebhookHandler.cs and Services/Handlers/Stripe.

- [ ] Trace provider calls, DTO mappings, credentials, retry behavior and business-state updates in the completed Phase 1 implementation.
- [ ] Classify each method as provider transport, generic operation reliability or private application policy.
- [ ] Extract only provider transport and provider-owned request/result types into the public integration package.
- [ ] Remove references to User, Tier, account repositories, cloud entitlements and private application errors from extracted contracts.
- [ ] Inject scoped credentials/configuration; never rely on mutable global Stripe credentials.
- [ ] Keep cloud calling the extracted adapter directly at first.
- [ ] Version the package and document its supported provider API contract.

**Acceptance:** Cloud behavior is unchanged; the public package has no private dependency. Each external operation still has one owner. Rollback is a package/adapter change, not a customer-data rewrite.

## P2-02. Define the Stripe module contract

**Priority:** after P2-01.
**Create:** module Contracts project, command/result records, signals and connection definition.

Start with a small interface such as IStripe. Split into checkout/subscription/invoice interfaces only when it improves actual usage.

Proposed operations:

| Command/query | Required semantics |
|---|---|
| CreateCustomer | Stable operation ID and recoverable customer reference |
| CreateCheckout | Explicit customer/price references, operation ID, approved return destinations |
| GetSubscription | Provider state plus freshness/version information |
| ListInvoices | Scoped customer reference, bounded pagination |
| CancelSubscription | Explicit timing and operation ID |
| CreateRefund | Explicit provider payment reference, amount policy and operation ID |
| GetOperationStatus | Pending/succeeded/failed/unknown outcome with recoverable provider references |

Proposed signals: CheckoutCompleted, SubscriptionChanged, InvoicePaid, InvoicePaymentFailed and RefundUpdated.

- [ ] Define module-owned serializable records with stable aliases/field IDs following framework conventions.
- [ ] Include provider event ID, connection identity, resource reference and relevant occurrence time in event envelopes.
- [ ] Require operation IDs for mutations and reject reuse with different parameters.
- [ ] Define amounts using currency-aware minor units; avoid assuming every currency has two decimal places.
- [ ] Separate verified provider facts from private entitlement decisions.
- [ ] Keep credentials, raw sensitive payloads and unnecessary customer data out of signals.
- [ ] Document which operations are privileged and how application permissions constrain them.

**Acceptance:** An app author can use Stripe without importing IntoChat account or pricing types. Publishing a signal never implies that a cloud brain has already been provisioned.

## P2-03. Implement connection-scoped neurons and reliable operations

**Priority:** after P2-02.
**Reference:** existing Twilio module's ConnectionNeuron, provider adapter, connection definition and webhook entry point; framework Neuron and RevisionedNeuron.

- [ ] Implement one connected merchant-account boundary for credential ownership and routing.
- [ ] Keep operation/subscription history in appropriately bounded records or dedicated neurons; avoid one ever-growing account state object.
- [ ] Persist an operation intent before calling the provider; carry its stable idempotency identity across retries.
- [ ] Track unresolved outcomes when the provider request times out or local persistence fails after provider success.
- [ ] Reconcile unresolved operations against provider state before permitting a replacement operation.
- [ ] Preserve durable deduplication for the required financial lifetime; do not copy Twilio's bounded recent-message cache as the financial ledger.
- [ ] Enforce connection/brain ownership and capability-level access before accepting mutations.
- [ ] Keep read-only queries distinct from financial mutations for authorization and application tooling.

**Acceptance:** A retry after a crash cannot silently create a second intended purchase/refund. Per-neuron execution ordering is not claimed to be an external transaction guarantee.

## P2-04. Implement verified ingress and durable signals

**Priority:** after P2-03.
**Create:** Stripe module HTTP ingress, inbox/reconciliation handling and signal projection.

- [ ] Verify provider signatures using the correct connection/endpoint secret before accepting an event.
- [ ] Persist verified incoming events with unique provider event IDs before acknowledging durable receipt.
- [ ] Route events by trusted provider/connection mappings; never trust an arbitrary brain ID or unverified metadata as authorization.
- [ ] Reconcile unordered updates with current provider state; record unmatched events for recovery.
- [ ] Persist operation changes and their signal intent with a recoverable atomicity/outbox strategy appropriate to the selected framework storage.
- [ ] Publish normalized signals only after durable state acceptance.
- [ ] Give business subscribers durable progress and effect deduplication. A live observer notification alone cannot be the authority for granting paid access.
- [ ] Define retry, replay, retention and operator recovery for failed ingestion/projection.

**Framework consideration:** Current Neuron code journals signals before observer notification. Its state-and-signal persistence path depends on storage capabilities; some paths journal after the state write. Verify the selected storage guarantee and close the failure window explicitly. RevisionedNeuron deduplicates local operations but does not make a Stripe side effect atomic with local storage.

**Acceptance:** Duplicate/reordered events cannot reset allowances or grant resources repeatedly. Missed live notifications can be recovered from durable state/journal processing.

## P2-05. Consume the module from IntoChat Cloud

**Priority:** after P2-03/P2-04 reliability acceptance.
**Modify:** private billing adapter and orchestration; retain customer database and commercial rules.

Preferred migration sequence:

1. Cloud consumes the extracted provider package directly.
2. A reference DigitalBrain application uses the neuron module with an independently configured merchant connection.
3. Cloud adopts the neuron interface where it adds value, through a platform-owned service deployment.

- [ ] Deploy the module in a dedicated platform-owned runtime/service if adopting neuron execution.
- [ ] Keep that service independent of customer subscriptions and customer-brain lifecycles; a customer suspension cannot stop payment reconciliation.
- [ ] Authenticate cloud-to-module calls and restrict platform merchant connection access to private service identities.
- [ ] Map provider facts to IntoChat entitlements in private code.
- [ ] Migrate existing provider IDs and pending operation references; never recreate subscriptions merely to change execution architecture.
- [ ] Choose one active writer for each account/operation during cutover.
- [ ] Compare read-only state projections before switching commands; never shadow-write financial operations.
- [ ] On rollback stop new mutations, reconcile in-flight operations, then switch the writer. Do not run old and new billing writers simultaneously.

**Acceptance:** Cloud and a separate DigitalBrain app reuse the same public capability. Neither can access the other's merchant credentials or customer records. There is no circular dependency in which running the billing service requires a paid customer brain.

## P2-06. Extract email delivery

**Priority:** next reusable capability; independent of cloud adopting neuron-based billing.

- [ ] Inventory the existing cloud email provider and template boundary.
- [ ] Extract transport into a public provider adapter and neuron module.
- [ ] Define send command with recipient, content/template payload, operation ID and sender connection.
- [ ] Define accepted/delivered/failed signals only to the extent the provider actually reports them.
- [ ] Keep IntoChat templates, branding, consent and notification policy private.
- [ ] Make retries explicit, accounting for providers that cannot guarantee idempotent sends.
- [ ] Keep delivery state free of unnecessary sensitive message content.

**Acceptance:** A generic app can send its own email; the module does not know IntoChat subscription tiers or notification rules.

## P2-07. Add Telegram messaging and scoped artifact storage selectively

**Priority:** after Stripe/email, driven by real application consumers.

**Telegram messaging:**

- [ ] Reuse any existing DigitalBrain Telegram capability before extracting new code.
- [ ] Keep messaging credentials, chat authorization and inbound message validation scoped.
- [ ] Expose send/message events without importing travel commands or platform login behavior.
- [ ] Keep Google/Telegram customer authentication outside this messaging module.

**Artifact storage:**

- [ ] Reuse existing runtime storage abstractions where they already fit.
- [ ] Expose authorized upload/download/list/delete operations with scoped references and limits.
- [ ] Keep infrastructure credentials and arbitrary host filesystem access out of app contracts.
- [ ] Distinguish app file storage from the runtime's own persistence and backup infrastructure.

**Acceptance:** Each module has a concrete second consumer and adds a reusable capability without duplicating an existing framework service.

## P2-08. Evaluate metering and entitlements only after usage stabilizes

**Priority:** later; not required to complete Stripe/email extraction.

- [ ] Review Phase 1 resource ledger and reservation semantics after real use.
- [ ] Extract typed measurement, stable event identity and reservation/settlement primitives if they are broadly useful.
- [ ] Keep tariffs, included allowances, margins, overage consent and suspension policy private.
- [ ] Keep user-owned compute/model resources distinct from platform-provided billable usage.
- [ ] Extract subscription/entitlement abstractions only when at least two real applications demonstrate the shared model.
- [ ] Reuse the Time module for appropriate scheduling capabilities rather than porting the entire legacy travel scheduler.

**Acceptance:** Public metering is useful without adopting IntoChat's business model or price catalog.

## Deliberately retained in the private platform

- Customer account ownership, membership and commercial relationships.
- IntoChat plan catalog, price mapping, entitlements and refund eligibility.
- Managed-brain provisioning strategy and infrastructure topology.
- Customer retention, support and operational policies.
- Platform authentication bootstrap and session authority.

Provider verification helpers may be reusable, but moving platform login into a customer neuron creates a bootstrap problem: the person needs authentication before they own or can access that brain. Treat any future identity-module design as a separate architecture decision.

Travel functionality, if revived, should become a separate app/module consumer. It should not return as a dependency of the cloud platform.

## Completion criteria

Phase 2's core deliverable is Stripe plus email reuse; Telegram, artifact storage and metering are follow-on candidates.

- [ ] Public packages contain no private cloud dependencies.
- [ ] Cloud uses the shared provider implementation.
- [ ] A separate DigitalBrain reference app can use the Stripe module with its own connection.
- [ ] Credentials and permissions are isolated between platform and customer connections.
- [ ] Financial operations, webhook handling and downstream effects have durable recovery semantics.
- [ ] Module contracts and package compatibility are documented.
- [ ] Public examples describe operations, signals, connection setup and limitations.
- [ ] Rollback preserves pending operations and existing provider resources.
- [ ] Any unverified runtime behavior remains explicitly marked.

No code conversion, deployment or tests were performed in writing this plan.

