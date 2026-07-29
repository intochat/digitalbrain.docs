# Architecture: kernel and module model

This authority owns the substrate and module-boundary rationale.

## 2. The kernel

`DigitalBrain.Kernel.Neuron` owns neuron mechanics and nothing else:

- Receive and dispatch incoming synapses.
- Emit, send, and reply with outgoing synapses.
- Journal and observe traffic in both directions.
- Persist operational neuron state.
- Enforce owner, delivery, and concurrency invariants.

The kernel must never contain model inference, provider names, `IChatClient`, prompts or responses,
OAuth details, UI contracts, or semantic memory. The test for a proposed kernel change is simple: if
the kernel would have to know what an LLM, a mailbox, or a CRM record is, the change belongs in a
module.

### Typed requests are reified as causal facts

A typed interface call is a request, not a synapse — but it still has to be visible in the journal.
The kernel resolves that by committing a fact *about* the call rather than turning the call into one:

1. Before invoking, the caller commits `CapabilityRequested`.
2. Its `SynapseDelivery` travels through the Orleans `RequestContext`.
3. The target commits that same delivery to its incoming journal *before* the method body runs.
4. The target executes with that delivery as its causal context.
5. Synapses emitted during the call inherit the correlation and use the request's `SynapseId` as
   their causation.
6. `CapabilityCompleted`, `CapabilityFailed`, or `CapabilityRejected` records the outcome.

These generic facts carry identity, caller, target, contract, method, correlation, causation,
timestamp, and outcome — and deliberately nothing else. Arguments, prompts, secrets, tokens, return
values, and exception content never enter a kernel journal. A module that needs payload-level audit
emits its own typed fact.

Be clear about what this buys: it records attempted, accepted, completed, failed, rejected, and
visibly incomplete requests. It is not exactly-once RPC. Safe retries remain the responsibility of
domain `CommandId`, revision fencing, provider idempotency, and reconciliation.

### The one deliberate exception

A private off-turn runner has to carry an already-committed request across the Kernel/AI assembly
boundary, and it is not a neuron. `DigitalBrain.Kernel.CapabilityDelegation` is the single public
type that exists for this. It is sealed, opaque, non-constructible by consumers, hidden from
IntelliSense, and non-semantic — never a neuron contract, synapse, registry entry, or behavior
vocabulary. The kernel alone mints, carries, validates, durably redeems, and records outcomes for it.

A delegation binds the committed request, the causal caller, the runner grain the filters physically
observe, the owner, the exact target, the contract and method, correlation and causation, and a
one-use identity. It carries nothing from Tasks, AI, MAF, checkpoints, approvals, integrations, or
leases — those semantics stay with the modules that own them. Every off-turn participant or
integration call gets its own precommitted request and its own delegation; the initiating
Task-to-worker request authorizes nothing later. A raw non-neuron call, a forged context, a replay,
or a mismatched source, owner, target, or operation is rejected before the target's method body
starts. Consumption is durable before invocation, so a crash may require a fresh request and
delegation — the cross-grain boundary is not exactly once.

## 3. The module model

Each domain ships as its own package family:

```text
DigitalBrain.Modules.<Name>.Contracts
DigitalBrain.Modules.<Name>
DigitalBrain.Modules.<Name>.Aspire.Hosting   optional
```

Most `.Contracts` packages reference only `DigitalBrain.Abstractions` — never a provider SDK.
`DigitalBrain.Modules.AI.Contracts` is the one deliberate module-contract exception: its
AI-to-Tasks.Contracts bridge references `DigitalBrain.Modules.Tasks.Contracts`, and the reverse
reference is forbidden. The runtime package owns neurons and domain behavior. Provider runtimes also
own their endpoint, scopes, exact tool policy, arguments, semantic mapping, and authority decisions.
The Aspire hosting package owns resources, parameters, and projection into the silo. Cross-provider
mechanics are deliberately deeper packages rather than copied module code:
`DigitalBrain.Security` owns purpose-bound durable encryption, and
`DigitalBrain.Integrations.Mcp` owns southbound official-SDK transport, OAuth/token-cache mechanics,
callback-scoped session lifetime, structured-result checks, and canonical fingerprint mechanics.
Provider runtimes depend inward on those mechanics; the shared packages never acquire Gmail or
Salesforce vocabulary or decide which tools are safe. This split is enforced by tests, not by
convention alone.

That southbound package is unrelated to `hosts/DigitalBrain.Mcp`, the northbound MCP server that
exposes selected Neurons through `IDigitalBrain`. The northbound host depends on public client and AI
contracts plus MCP server packages; it does not depend on Gmail, Salesforce, or
`DigitalBrain.Integrations.Mcp`.

### Namespaces are the vocabulary

Physical package names carry packaging detail and may say `Modules` and `Contracts`. Public
namespaces carry meaning and never do:

```text
DigitalBrain.AI.ILLM
DigitalBrain.AI.Ollama.ILlama32
DigitalBrain.AI.OpenAI.IGpt56
DigitalBrain.Google.IGmail
DigitalBrain.Salesforce.ISalesforce
DigitalBrain.Tasks.ITask
```

The namespace and type name *are* the identity. There is no descriptor, enum, tier, or lookup table
that resolves to them. This is also the vocabulary a future natural-language layer resolves against,
which is why it is treated as architecture rather than as naming taste.

### Selection is explicit

Infrastructure is declared in AppHost:

```csharp
var brain = builder.AddDigitalBrain("brain");

brain.AddModule<AIModule>(ai => ai.WithLlm<Llama32>());
brain.AddModule<GoogleModule>(google => google.WithGmail());
brain.AddModule<SalesforceModule>(salesforce => salesforce.WithSalesforce());

builder.AddProject<Projects.DigitalBrain_Host>("silo")
    .WithReference(brain);
```

`AddDigitalBrain(name)` is the one durable hosting call. It owns a brain-scoped Azure Storage
resource and derives clustering and reminder tables plus Blob-backed journals from it. In Aspire run
mode that same resource runs as Azurite; publishing points the unchanged durable profile at Azure
Storage. There is no separate in-memory hosting profile hidden behind local execution.

The executable remains explicit in `AddProject<Projects.DigitalBrain_Host>` because that compiled
project contains the generated module catalog. The brain resource describes infrastructure and
selected modules; it cannot manufacture an executable or a grain catalog.

The silo stays boring:

```csharp
builder.AddKeyedAzureTableServiceClient("brain-clustering");
builder.AddKeyedAzureTableServiceClient("brain-reminders");
builder.UseOrleans(silo => silo
    .AddDigitalBrain()
    .AddDigitalBrainJournalStorage(builder.Configuration));
```

The complete silo reference receives clustering, reminders, the `journal` blob, protection material
when a selected module needs it, and the durable-resource health waits. A client reference receives
the clustering connection required for Orleans gateway discovery and nothing else: never reminders,
journals, protection material, or durable-resource waits. The service project loads the Orleans Azure
clustering and reminder providers and registers Aspire's keyed `TableServiceClient`s under the exact
projected resource names. `AddDigitalBrainJournalStorage` still throws when no `journal` connection
string is configured, so an incomplete hand-wired silo does not start.

One brain is one homogeneous Orleans cluster. Executables with different grain/application catalogs
must not reference the same brain and rely on placement luck; each gets its own brain identity and
complete storage profile, even when those profiles share the same underlying Azure Storage account.

Package reference means *available*. `AddModule<T>()` means *selected and configured*. Each module is
added exactly once; a repeat call is a composition error, not a merge.

Compilation turns every referenced module into a typed executable capsule and generates the
executable's catalog from those capsules. AppHost projects the selected module manifest and its
resource configuration; startup fails when AppHost selects a module the silo's compiled catalog does
not contain. Every available capsule prepares serializers needed by its public contracts, while only
selected capsules activate runtime services and broadcast handlers. That split keeps wire types
decodable without silently running an unselected module. Runtime assembly scanning is not a mechanism
this framework has — a catalog that can be discovered at runtime is a catalog that can drift from the
code that was compiled.


