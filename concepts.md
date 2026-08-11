# Concepts

DigitalBrain is a private workspace whose durable components communicate through typed contracts.
These names are part of the architecture: using them consistently matters because source,
serialized state, topology, and product language meet at these boundaries.

## Workspace and actor

A **workspace** is one installed DigitalBrain and its membership. The runtime currently addresses
that installation with an `OwnerId`; the checked-in local AppHost uses the logical owner key `dev`.
That key selects the Orleans-owned brain. It is not a login account and does not authenticate a
person.

A stored user has a stable `PrincipalId` and one workspace role:

| Role | Current meaning |
| --- | --- |
| Owner | First bootstrap account; may administer membership |
| Admin | May create users and administer membership |
| Builder | Workspace member reserved for authoring capability |
| Viewer | Workspace member with ordinary product access |

An **actor** is the durable stamp carried by user-initiated work: `PrincipalId` plus username. The
Kernel derives it from authenticated claims. Integration authorization and tokens are bound to the
principal rather than to a client-supplied neuron name.

## Neuron

A **neuron** is a durable, owner-bound Orleans grain with a typed interface and deterministic
`NeuronId`. It receives direct capability calls and synapse deliveries, owns state, and processes a
normal Orleans turn single-threadedly.

The public grain adapter stays small. Journal, outbox, message, capability, authorization, and
delivery-memory responsibilities live in focused collaborators. The runtime does not use
handwritten partial classes; source-generated partial wire interfaces remain valid contracts.

## Synapse and request synapse

A **synapse** is an immutable typed fact. Delivery adds an envelope containing the source neuron,
sequence, correlation and causation identifiers, and timestamp. A neuron declares facts it accepts
with `IHandle<TSynapse>`.

A **request synapse** is a `RequestSynapse<TResponse>`: a synapse addressed to one neuron with one
typed synapse response. It gives `IDigitalBrain.Get<TNeuron>().FireAsync(request)` a reply contract.
Ordinary emitted facts have no reply contract.

Keep these paths distinct:

- `SendAsync(receiver, fact)` and a named client `FireAsync` target one neuron.
- `EmitAsync(fact)` and receiver-free client `FireAsync` route a fact through registered broadcast
  handlers and live connection-graph edges.
- A typed neuron interface call is a capability request. The Kernel reifies its durable outcome;
  it is not an unrecorded shortcut around the synapse model.

## Journal and outbox

Every neuron owns bounded **incoming** and **outgoing** journals. The incoming journal records what
the neuron accepted; the outgoing journal records what it committed. Readers can resume after a
sequence instead of asking the neuron to replay arbitrary in-memory events.

The outgoing journal is also the **outbox**. A handling turn stages outgoing deliveries, commits
the journal checkpoint, and then drains delivery work. Delivery is at least once, so receivers keep
bounded delivery memory and deduplicate already-settled deliveries.

## Connection graph

A **connection** is a durable route:

```text
source neuron + emitted synapse alias -> target neuron + optional transform
```

The **connection graph** stores those routes. It is the long-lived topology of the brain, not an
execution plan: a connection says where a fact goes, while an Execution owns steps, effects,
waiting, retry, and reconciliation.

An **integration** is different. It is a user's account in an external system such as Gmail or
Salesforce. Connections are inside the brain; integrations cross its security boundary.

## Module

A **module** is trusted code composed at startup. Its project family normally contains:

```text
Contracts             permanent neuron and synapse interfaces
Runtime               neuron implementations and the module configuration hook
Aspire.Hosting        optional external-resource projection
```

Contract assemblies produce reflected capability manifests. Runtime assemblies contribute neuron
implementations, broadcast handlers, and `IModule` configuration hooks. AppHost selection controls
external resources; Kernel composition controls which contracts and implementations are available
inside the silo. Those catalogs are currently explicit and duplicated.

Google and Salesforce are thin provider definitions over the shared SDK MCP/OAuth rail. Their
Contracts projects remain module boundaries; in particular,
`DigitalBrain.Modules.Salesforce.Contracts` is permanent product architecture.

## Execution vocabulary

An **Execution** is one durable run toward a `Goal`. It is the product's only job/work mechanism.

| Term | Meaning now |
| --- | --- |
| Goal | Immutable description of the desired result |
| Execution | Durable identity and state for one run |
| Attempt | One worker generation advancing that Execution |
| Operation | One externally observable effect with a stable caller-supplied key |
| Blocker | Typed reason the Execution cannot currently advance |
| Worker | Allow-listed neuron that accepts, continues, or cancels an Attempt |

Receipts and operation rows are bounded. If a dispatched external effect loses its outcome, the
Execution enters `OutcomeUncertain`; it does not automatically repeat the effect. An explicit
resolution must complete it, fail it, or allow a retry.

The ratified product vocabulary also reserves **Task** for a future user-visible goal. There is no
current Tasks module, so current implementation documentation uses Execution.

## Surface

A **surface** is a durable declarative UI document opened into a principal-scoped Flutter shell.
Buttons, charts, diagrams, notes, and chat cards are typed UI vocabulary. A surface is not a Flutter
widget serialized by the model and is not an execution engine.

Current chat contracts and the `Chat` neuron still live in the UI module. HTTP chat names such as
`main` are rewritten to a principal-scoped internal instance, so two users can use the same local
name without sharing a transcript.

## Wire alias

A **wire alias** is the stable Orleans serialization or grain-contract name attached with
`[Alias(...)]`. Aliases such as `db.execution`, `chat.send-message`, `ui.surface`,
`time.timer-elapsed`, `memory.store-vector`, and `introspection.read-topology-request` are permanent
compatibility contracts. C# type names and project layout may evolve; a persisted alias cannot be
casually renamed or reused.

See the [wire-contract reference](/reference/wire-contracts) for the identity and compatibility
rules.

## Product state

**Implemented now.** Workspace identity, neurons, synapses, dual journals, outbox delivery,
connection routing, modules, durable Execution, surfaces, and permanent aliases exist in production
source.

**Known limitation.** The northbound MCP host does not yet derive a verified actor, so its chat
tools still use unscoped names and a fixed operator actor. The Kernel HTTP edge does perform
principal scoping.

**Ratified next.** **Conversation** becomes a domain module between UI and AI. **Behavior** becomes
a named, approved, versioned composition of existing vocabulary running out of process with no
ambient authority. Today the Flutter Behavior Studio is preview/demo-only: no Behavior host,
approval/install rail, or execution path exists.
