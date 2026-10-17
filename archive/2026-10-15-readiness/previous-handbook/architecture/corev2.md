# CoreV2 framework

CoreV2 is an isolated, typed framework foundation implemented on the
`codex/corev2-framework` branch of the product repository. It is not a migration of
the current V1 production runtime and it does not yet replace the V1 Aspire, Flutter,
or northbound MCP deployment paths described elsewhere in this handbook.

## Status

**Implemented on the CoreV2 branch.** The framework, deterministic proof module, and
acceptance suite are complete through the planned Task 14. The current proof has 14
abstraction tests, 110 core tests, and 22 proof tests; its release build is warning
free.

**Still pending.** CI and documentation hardening (Task 15) remain before CoreV2 is
declared release-complete. No provider integration, billing, Flutter adapter, or MCP
transport is part of this proof.

## Product boundary

Flutter and MCP are equal future product adapters. Both are constrained to the same
public control surface:

```text
discover -> invoke -> observe
```

An adapter invokes a typed, versioned Operation and observes an Activity projection.
It cannot inject an event, choose a neuron endpoint, read a raw journal, mutate graph
topology, or supply a SynapseKey. JSON and provider schemas stay at an adapter boundary;
they do not enter CoreV2's operation, graph, journal, or outbox contracts.

## Core vocabulary

| Term | Meaning |
| --- | --- |
| Operation | A public, typed and versioned request with an entry role and terminal result contract. |
| Activity | Durable, observable operation work. It owns idempotency, caller context, redacted progress/result references, and parent/child linkage. |
| Domain event | An immutable past-tense internal fact. It is either Internal or Published. |
| Capability | A typed, module-published facility callable only through an active ActivityContext, Allowed policy decision, and delegation. |
| Module manifest | Explicit declarative module inventory: roles, operations, events, reshapes, provided/required capabilities, and dependencies. No assembly or provider-tool discovery. |
| Wiring | Immutable declarative route proposal and version. Its activation stages all shards before exposing the route set together. |

Modules share contracts, not runtime implementations. A provider-backed module may use an
MCP catalog internally, but CoreV2 does not duplicate provider tools into framework
types.

## Runtime guarantees

### Activity and capability safety

- Idempotency is scoped to workspace, principal, and caller key. Reuse for a different
  operation or material input conflicts rather than silently reusing work.
- Activity views are projections. They contain status and approved contract/payload
  references only; they never expose endpoints, graph keys, journal entries, entity
  state, raw events, or capability input/output.
- Child activities preserve workspace and principal, record their parent, and can only
  receive the intersection of parent delegation and child policy.
- Capability use is keyed by Activity, CapabilityId, and a stable typed use name. A
  retry returns the completed typed result without reinvoking the capability.

### Graph, delivery, and wiring safety

- The logical graph is workspace-local and physically sharded by outbound source
  endpoint. A shard owns its SynapseKeys and revision history.
- A SynapseKey has immutable source, input contract, scope, and wiring slot. Replace
  and retire append history; there is no expiry, decay, weight, TTL, or automatic
  usage-based mutation.
- An emission resolves live routes once, then stages immutable delivery snapshots with
  the journal and outbox. Rewiring later cannot reroute that earlier emission.
- Delivery identity is deterministic from firing, SynapseKey, and revision. Receivers
  commit their state effect and delivery receipt in one receiver-owned transaction.
- Reshapes are explicitly registered, typed synchronous transforms. They have no
  ActivityContext, service provider, capability broker, cancellation callback, or
  network access.
- Wiring stages inactive revisions across required shards. An activation record exposes
  them only when every shard has acknowledged promotion; a failed replacement keeps the
  earlier active route visible.

## Deterministic proof

`BrainTestHost` starts an in-process Orleans TestCluster with a cluster-DI hosted proof
runtime grain. The proof module provides `Proof.Run@1`, `Proof.Correct@1`, published
proof events, a pure reshape, and one deterministic classifier capability.

The acceptance suite proves that a caller can invoke and observe a terminal result,
that an already staged delivery follows its old route after correction, that a later
emission follows the new route, and that retiring the route yields a visible zero-route
outcome without fabricating a business refusal. Test-only graph inspection is kept out
of the product adapter surface.

## Relationship to V1

The existing pages in this handbook remain the V1 production handbook. CoreV2 is
deliberately isolated under `src/CoreV2` with no CoreV2-to-`DigitalBrain.*` project
reference. Treat this page as the framework direction and verified branch state, not as
an instruction to operate the V1 AppHost differently.
