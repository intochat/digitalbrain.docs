# Technical backlog and acceptance gates

This backlog translates observed code and verification gaps into actionable release work. Priorities are proposed; they are not evidence of staffed commitments or promised dates. An owner below is a **role**, not an assertion that the team has that person. Scope is the current implementation, without a prerequisite rewrite.

## Release gate: reproducible controlled deployment

**Problem:** OS compilation passes, but the OS test graph is blocked by a NuGet advisory; cloud workflows still publish an absent MiniApp project. Operational configuration and deployed compatibility have not been verified.

**Outcome:** an operator deploys an identifiable cloud/runtime pair and can safely admit test accounts.

- **Evidence:** [verification](./verification), `.github/workflows/ci.yml`, cloud workflow discrepancy in [repository boundaries](../reference/repositories).
- **Scope/deliverables:** resolve MessagePack dependency finding, correct delivery targets, produce image/version/configuration manifest, define secured identity and durable storage, cold-start the minimal bundle.
- **Non-goals:** general frontend rewrite, activating every connector, public marketplace.
- **Dependencies:** target environment, controller certificates, key custody and selected service configuration.
- **Acceptance/validation:** clean restore/build/tests without audit suppression; expected runtime version/identity observation; sign-in, workspace open, install/launch and restart pass in isolated deployment.
- **Risk/owner:** P0 for release delivery; release/platform engineer role. Stop promotion on mismatched identity, data loss or a security gate bypass.
- **Exit:** repeatable deployment and documented rollback path. No effort estimate until environment access and dependency remediation are understood.

## Paid-use gate: enforce and reconcile spending

**Problem:** runtime accounting occurs after provider dispatch and swallows meter errors; direct runtime calls are not proven to traverse cloud admission. Internal ledger balance does not represent money collected.

**Outcome:** users understand the charge, and concurrent work obeys the promised financial limit.

- **Evidence:** [billing](./billing), `MeteringChatClient.RecordAsync`, `CostMeter.RecordAsync`, `LedgerGrain.Charge`; cloud `ManagedModelGateway` and `ResourceBudgetService`.
- **Scope/deliverables:** select prepaid/postpaid policy; map every funded path; reserve/settle or equivalent admission; durable idempotency; explicit unknown-price behavior; provider/payment reconciliation.
- **Non-goals:** sophisticated marketplace revenue sharing before a paid first-party pilot.
- **Dependencies:** provider price sources, actual payment contract, payer identity, refund responsibility.
- **Acceptance/validation:** concurrent traces, retries, partial streams, crash between charge and usage, late replay and duplicate payment webhook cannot violate the declared policy; reconcile provider cost and collected payment.
- **Risk/owner:** P0 before platform-funded pilot; backend/billing role. Stop funded traffic if a path bypasses admission or reconciliation cannot explain a discrepancy.
- **Exit:** tested financial invariant plus operator kill switch; measured unit economics remain separate from code readiness.

## Trust gate: isolation and untrusted execution

**Problem:** authority and scoped tokens exist, but effective deployment isolation, MCP egress and hostile generated-code containment are unverified.

**Outcome:** one user or publisher cannot access another user's state, credentials or compute budget.

- **Evidence:** [security](./security), `DirectoryBrainAccess`, `GrantCallFilterStage`, `SandboxEndpoints`, `SessionRunner`, `McpServerNeuron`.
- **Scope/deliverables:** two-account negative tests across all transports; private sandbox ingress; execution quotas; filesystem/egress policy; revocation; MCP side-effect retry rules.
- **Non-goals:** claiming formal certification from a unit suite.
- **Dependencies:** actual container/session-pool topology and controller trust configuration.
- **Acceptance/validation:** forged identifiers, stale tokens, infinite loops, private endpoint probes, secret reads and cross-tenant subscriptions are denied or bounded; an operator can revoke a publisher and active connection.
- **Risk/owner:** P0 before untrusted publishers or sensitive connector access; security/platform role. Narrow to trusted first-party apps if isolation evidence is insufficient.
- **Exit:** recorded adversarial test results for the exact deployed policy and images.

## Reliability gate: recover useful application outcomes

**Problem:** default installation can partially fail; generation workers are process-local; historical creative-app cold-start failures remain unreproduced on the current snapshot.

**Outcome:** the user sees a truthful state and can recover without losing work or duplicating external actions.

- **Evidence:** `OsDefaults.Created`, `AppWorkQueue`, `BrainRuntimeNeuron`, sandbox `Session`; [historical browser record](../assessment/app-journey-verification-2026-10-16).
- **Scope/deliverables:** per-app readiness display, generation restart policy, cancel semantics, fault-injection tests, explicit MCP service startup dependencies and bounded teardown.
- **Non-goals:** a universal exactly-once guarantee over arbitrary third-party APIs.
- **Dependencies:** isolated browser stack and stubs; separately bounded live-model quality evaluation.
- **Acceptance/validation:** cold start and process kill during generation/tool action converge to a visible result or actionable failure; recipient installs a digest-pinned release; retries do not duplicate write effects.
- **Risk/owner:** P1 for pilot usefulness; runtime/application role. Narrow the initial bundle when a dependency cannot start reliably.
- **Exit:** repeated representative journeys pass; any live-model success rate remains measured separately with its dataset and denominator.

## Data gate: restore, retention and provenance

**Problem:** portable export omits credentials and authority, and no deployed recovery drill was performed. Application deletion and shared memory do not by themselves specify whole-product retention.

**Outcome:** users can inspect source context, export their data and understand deletion; operators can recover an account after failure.

- **Evidence:** `HostedRecoveryHost`, `BrainLog`, `features/os/Memory/Memory.cs`, cloud recovery/lifecycle services.
- **Scope/deliverables:** data-class retention map, backup/key ownership, restore runbook, version compatibility and deletion propagation through indexes/external storage.
- **Non-goals:** treating a JSON export as a byte-identical backup.
- **Dependencies:** selected storage backend, key custody, jurisdiction/product retention decisions.
- **Acceptance/validation:** restore an encrypted test backup into an isolated target; verify identities, app versions, records and scheduled work; inspect exported provenance and declared omissions.
- **Risk/owner:** P0 before irreplaceable user data, otherwise P1; platform/operations role. Stop rollout after unrecoverable state or an unexplained export omission.
- **Exit:** measured restore outcome and signed-off retention choices; proposed recovery targets become commitments only after testing.

## Ecosystem gate: independent publication

**Problem:** catalog/version mechanisms exist, but external developer onboarding, review, abuse response and payment responsibilities are not demonstrated operations.

**Outcome:** an independent developer publishes a useful compatible application that another user can safely adopt.

- **Evidence:** `OsCatalog`, `AppNeuron.Publish`, `AppInstaller.InstallPublication`, [matrix](./matrix).
- **Scope/deliverables:** versioned SDK example, compatibility policy, publisher identity, review checklist, disclosure/permissions, support and removal procedure.
- **Non-goals:** counting built-in modules as marketplace demand.
- **Dependencies:** deployment, trust, recovery and paid-use gates as applicable; repeated first-party user outcomes.
- **Acceptance/validation:** a developer outside the implementation workflow follows docs, publishes a digest-pinned application, receives actionable rejection feedback when invalid, and has a second account install and use it.
- **Risk/owner:** P1 before external marketplace; developer-experience/product role. Keep a curated catalog if onboarding or useful adoption does not materialize.
- **Exit:** independently reproduced publication and adoption, with operational ownership. Timing depends on evidence, not an invented calendar.

## Founder decisions still required

Choose the first deployment environment and pilot bundle; decide which paid paths are allowed initially; identify responsibility for custody/recovery and payment reconciliation; define retention/export promises; and establish who can approve or remove external publications. These decisions can be recorded while reversible documentation and local verification continue. See the [decision register](../reference/decisions) and [roadmap](../roadmap/).
