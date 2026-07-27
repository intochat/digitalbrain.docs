# Architecture

DigitalBrain is an AI-native operating system for durable agents on Orleans and Aspire. The kernel
owns durable, typed neuron mechanics; modules own domain vocabulary; behaviors compose that
vocabulary into logic. This page is the plan of record. Code is the source of truth for detail — what
lives here is the reasoning that code cannot state about itself.

<ArchitectureMap />

## The vision

> A brain you program by writing ordinary C#, and that can program itself.

Users compose neurons and synapses in C# today, and ultimately describe behaviors in natural
language. DigitalBrain is not a generic agent framework and not an application shell.

## The shape in six lines

- The typed interface is the surface, the synapse is the substrate, the generator is the bridge.
- A synapse is a **fact** — a thin record, broadcast, no reply.
- An interface method is a **request** — directed at a capability, and it replies.
- Both are journaled; neither is privileged.
- **Modules own vocabulary.** Compile-time, needs a rebuild.
- **Behaviors own logic.** Every future install is a human-approved, journaled, reversible proposal.

## The kernel

`DigitalBrain.Kernel.Neuron` owns neuron mechanics and nothing else: receive and dispatch incoming
synapses, emit and send outgoing ones, journal traffic in both directions, persist operational state,
and enforce owner, delivery, and concurrency invariants.

The test for a proposed kernel change is simple:

> If the kernel would have to know what an LLM, a mailbox, or a CRM record is, the change belongs in
> a module.

### Typed requests are reified as causal facts

A typed interface call is a request, not a synapse — but it still has to be visible in the journal.
The kernel commits a fact *about* the call rather than turning the call into one:

1. Before invoking, the caller commits `CapabilityRequested`.
2. Its `SynapseDelivery` travels through the Orleans `RequestContext`.
3. The target commits that delivery to its incoming journal *before* the method body runs.
4. The target executes with that delivery as its causal context.
5. Synapses emitted during the call inherit the correlation and use the request's `SynapseId` as
   their causation.
6. `CapabilityCompleted`, `CapabilityFailed`, or `CapabilityRejected` records the outcome.

These facts carry identity, caller, target, contract, method, correlation, causation, timestamp, and
outcome — and deliberately nothing else. Arguments, prompts, secrets, tokens, return values, and
exception content never enter a kernel journal. A module that needs payload-level audit emits its own
typed fact.

Be clear about what this buys: it records attempted, accepted, completed, failed, rejected, and
visibly incomplete requests. It is **not** exactly-once RPC. Safe retries remain the responsibility of
domain `CommandId`, revision fencing, provider idempotency, and reconciliation.

### The one deliberate exception

A private off-turn runner has to carry an already-committed request across the Kernel/AI assembly
boundary, and it is not a neuron. `CapabilityDelegation` is the single public type that exists for
this. It is sealed, opaque, non-constructible by consumers, hidden from IntelliSense, and
non-semantic — never a neuron contract, synapse, registry entry, or behavior vocabulary. The kernel
alone mints, carries, validates, durably redeems, and records outcomes for it.

A raw non-neuron call, a forged context, a replay, or a mismatched source, owner, target, or
operation is rejected before the target's method body starts. Consumption is durable before
invocation, so a crash may require a fresh request and delegation — the cross-grain boundary is not
exactly once.

## The module model

Each domain ships as its own package family: `.Contracts`, the runtime, and an optional
`.Aspire.Hosting`. Contracts reference only `DigitalBrain.Abstractions` — never a provider SDK. The
one deliberate exception is `AI.Contracts`, whose bridge references `Tasks.Contracts`; the reverse is
forbidden.

Cross-provider mechanics live in deeper packages rather than copied module code: `DigitalBrain.Security`
owns purpose-bound durable encryption, and `DigitalBrain.Integrations.Mcp` owns southbound transport,
OAuth and token-cache mechanics, and canonical fingerprint mechanics. Those shared packages never
acquire Gmail or Salesforce vocabulary and never decide which tools are safe.

### Namespaces are the vocabulary

Package names carry packaging detail and may say `Modules` and `Contracts`. Public namespaces carry
meaning and never do:

```text
DigitalBrain.AI.ILLM
DigitalBrain.AI.Ollama.ILlama32
DigitalBrain.Google.IGmail
DigitalBrain.Tasks.ITask
```

The namespace and type name **are** the identity. There is no descriptor, enum, tier, or lookup table
that resolves to them. This is also the vocabulary a future natural-language layer resolves against,
which is why it is architecture rather than naming taste.

### Selection is explicit

```csharp
var brain = builder.AddDigitalBrain("brain");

brain.AddModule<AIModule>(ai => ai.WithLlm<Llama32>());
brain.AddModule<GoogleModule>(google => google.WithGmail());

builder.AddProject<Projects.DigitalBrain_Host>("silo").WithReference(brain);
```

Package reference means *available*. `AddModule<T>()` means *selected and configured*. Each module is
added exactly once; a repeat call is a composition error, not a merge.

Compilation turns every referenced module into a typed executable capsule and generates the catalog
from those capsules. Startup fails when AppHost selects a module the compiled catalog does not
contain. Runtime assembly scanning is not a mechanism this framework has — a catalog discoverable at
runtime is a catalog that can drift from the code that was compiled.

One brain is one homogeneous Orleans cluster. Executables with different catalogs must not share a
brain and rely on placement luck.

## The modules

| Module | Status |
| --- | --- |
| <a id="ai"></a>**AI** | Built. Direct `Respond` owns a protected `AgentSession`. Microsoft.Extensions.AI is the public conversation boundary; MAF types stay internal. Supervised durable checkpoints are designed. |
| <a id="tasks"></a>**Tasks** | Built. Start/Cancel lifecycle closed by a test-only `IWorker`. Supervised MAF-per-attempt workers remain designed. |
| <a id="google"></a>**Google** | Built. A southbound semantic capability boundary (`IGmail`). L1 proves an admitted `get_message` and refusal on failed safety annotations, against a scripted MCP edge rather than live cloud. |
| <a id="salesforce"></a>**Salesforce** | Built. Human-approved proposal and approval evidence at the provider boundary. |
| <a id="time"></a>**Time** | Built — `ICountdown` only. Reminder, interval, and calendar scheduling and DST records remain designed and unbuilt. |
| <a id="flutter"></a>**Flutter** | Built at code and L0/L1: first-vertical vocabulary, journal proofs, the C# northbound UI edge, module-owned `WithUiEdge`/`WithFlutterHost` projection, a pure-Dart headless host, and Windows chrome. Full product chrome, multi-principal IdP edge, and live product AppHost topology remain unproven. |
| <a id="memory"></a>**Memory** | Deliberately out of scope. |

## Behaviors

**Status: Designed.** Proposal, approval, installation, execution, and rollback are not built. No
compiler, worker, broker, or installer exists in code.

The distinction that governs the design:

```text
BehaviorNeuron = owner-scoped neuron identity, journal, state, authority, and revisions
Behavior program = immutable single-file C# logic executed on behalf of that neuron
```

`BehaviorNeuron : Neuron, IBehavior`; the program does **not** inherit `Neuron`. One registered grain
implementation hosts every `(OwnerId, BehaviorId)` instance and its immutable approved revisions.

When the compiler exists it will be contract-only. Allowed: the Behavior API,
`DigitalBrain.Abstractions`, selected module contracts, approved BCL types, and the Behavior SDK.
Forbidden: `IGrainFactory`, `IChatClient`, provider SDKs, MCP protocol types, `HttpClient`,
`IServiceProvider`, filesystem and process APIs, reflection, ambient time and random, and native
interop.

Unknown code executes **outside** the silo through a constrained context and capability broker. A
file-based app, single-file deployment, or `AssemblyLoadContext` is not treated as a security
boundary.

Until the rail exists, OS composition lives as ordinary C# under `samples/DigitalBrain.Compositions`.
Those are pre-rail helpers, not installed Behaviors. Changes arrive the ordinary way — through source
control and a rebuild.

### Registry and discovery

Two catalogs with different authority. The generated module catalog owns the compile-time CLR
universe; runtime installation never adds CLR neuron or synapse types. The owner-scoped Behavior
catalog owns installed revisions, subscriptions, intent schemas, and grants.

Vector indexes are derived projections over both. The rule that keeps natural-language programming
safe:

> An index may **rank** candidates. It may never execute an invented type or bypass exact catalog
> resolution. The index is derived and disposable; the catalog is the source of truth.

Losing the index costs discovery quality, never correctness.

## Hosting and durability

`AddDigitalBrain(name)` creates one complete durable profile: a brain-scoped Azure Storage resource
supplying Blob-backed journals and Table-backed clustering and reminders. Run mode uses Azurite;
deployment points the same profile at Azure Storage. No generic durability-provider abstraction is
introduced until a second *complete* profile actually exists — one profile does not justify an
abstraction over profiles.

Any selected AI or MCP-backed module causes AppHost to declare one brain-scoped 256-bit durable-state
key, projected only to silos and never to clients. It encrypts MAF direct sessions and MCP OAuth
tokens under distinct purposes.

`AsClient()` is a security boundary. A client projection receives the clustering connection required
for gateway discovery and nothing else — never reminders, journals, protection material, or
durable-resource waits.

Synapse journals are the durable causal truth. OpenTelemetry is a diagnostic projection and never the
audit source: traces sample, expire, and get dropped, and an audit trail that does any of those things
is not an audit trail.

## Testing

`DigitalBrain.Testing` is the one public packable testing product, and it is development-only. Proofs
run at three tiers, with no parallel fake runtime:

```text
L0  Contracts and generators   public surface, vocabulary, wire goldens
L1  Kernel semantics           real three-silo DigitalBrainFixture + method-scoped TestBrain
L2  AppHost system             assembly-owned DigitalBrainAppHostFixture<TAppHost>
```

**A test earns its place by failing when product behavior breaks. It does not earn its place by
failing when the build graph changes.** Prefer product types and product constants over test-local
string tables, and runtime evidence over source-grep. A pin on project counts, package counts,
assembly references, or filesystem layout is theater — it restates the build system to itself.

L1 is the default depth. One fixture owns one real three-silo cluster and permits one active
`TestBrain` at a time, each with an isolated owner namespace, deterministic clock, closed durability
faults, and typed committed-journal evidence. Substitutes stop at the closed external edges: a
scripted `IChatClient`, scripted southbound MCP sessions, and the framework-owned `TimeProvider`.
Neurons, journals, filters, and module logic stay real.

## Known limitations

Each is a boundary someone chose, not a defect waiting to be found.

- **An Orleans client is a trusted cluster peer.** Owner binding is a correctness boundary, not an
  authentication claim — a process that can reach the cluster can name any owner. Authenticate at the
  edge and do not publish clustering endpoints.
- **Journal history is bounded.** A feed retains 512 entries or 512 KB, whichever binds first, and
  compacts behind it, answering older cursors with a snapshot and a reset. Effectively-once
  processing is windowed too: a neuron remembers its last 4096 handled deliveries.
- **Delivery ordering is local.** FIFO per target and at least once. A refusing receiver blocks only
  later deliveries aimed at itself. There is no cross-target ordering, and none is promised.
- **Broadcast addresses handler types**, resolving one correlation-derived instance of each rather
  than a standing subscriber.
- **Client observation is not a timeline stream.** The facade sends and emits; a durable per-owner
  timeline and reconnect lifecycle are not built.
- **Supervised workflow checkpoints, the OpenTelemetry MAF chain, and DevUI are not built.**

## Rejected

Each was argued and turned down. Reintroducing one is a design change with a case to make, not a
configuration choice.

- **AI logic in the kernel** — inference, provider names, prompts, OAuth, UI contracts, semantic
  memory all belong to modules.
- **Provider routing tiers, balancing, capability scores, or fallback catalogs.** Hosting is the
  easiest way to smuggle these back.
- **Public model metadata** — no descriptor, enum, or lookup table that resolves to a model.
- **Runtime module scanning**, **raw MCP clients crossing module boundaries**, and **any raw invoke
  escape hatch**. A model receives selected exact function schemas or nothing.
- **A second client facade** and **compatibility shims** for shapes already deleted.
- **The MAF Durable Extension and MAF Harness-as-core** — the first duplicates Orleans durability,
  the second would make DigitalBrain a second agent loop.
- **A recurrence library adopted because it is the obvious one.** Ical.Net with Noda Time remains
  open; treating it as decided is what is rejected.
- **A public `IFlutter` god neuron**, a Flutter-embedded silo, and Behavior product APIs before the
  install rail exists.

## Still open

Nothing here is settled. Do not implement one as though a decision has been taken, and do not infer
its shape from a neighbouring module.

- The internal calendar recurrence library, and the reminder, recurring, calendar, and DST record
  shapes.
- The exact CLR records for the capability-tool seam.
- Flutter descriptor algebra and richer chrome vocabulary.
- Product journal observation on `IDigitalBrain`.
- Memory architecture, entirely.

One assumption is load-bearing and unmeasured: **that a model can reliably emit behaviour scripts.**
That benchmark, and the proposal and install rail it justifies, remain deliberately outside the built
foundation.
