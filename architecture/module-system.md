# Module system

Modules are trusted code assembled at startup. They add domain vocabulary and neurons without
teaching the Kernel about the domain.

## Project families

A full module can have three projects:

| Project | Responsibility | Dependency direction |
| --- | --- | --- |
| `*.Contracts` | Public neuron interfaces, synapses, identities, snapshots, permanent aliases | Kernel abstractions and deliberate contract dependencies only |
| Runtime | Neuron implementations and a parameterless `IModule` hook | Its Contracts plus shared runtime rails |
| `*.Aspire.Hosting` | AppHost extension methods, resources, parameters, environment projection, health waits | Runtime type plus Aspire-hosting packages |

Not every module needs external resources, so Execution, Time, and Introspection have no
Aspire-hosting project. The shared SDK is a runtime rail rather than a provider module.

## Kernel composition

The Kernel constructs one explicit `ModuleAssemblies` value with separate contract and
implementation assembly lists. Startup performs four operations:

1. Reflect each listed contract assembly into a `CapabilityManifest`.
2. Build the active capability and contract-type indexes.
3. Scan listed implementation assemblies for broadcast handlers.
4. Instantiate each concrete, parameterless `IModule` hook and let it configure the Orleans silo.

The current Kernel composition includes core abstractions plus AI, Execution, UI chat, Time,
Memory, Introspection, Google, Salesforce, and the SDK MCP authorization runtime. A module assembly
being referenced makes its types available; an individual neuron normally activates only when it
is addressed. `AddDigitalBrainOwner(activateOnStart: false)` does not eagerly activate the root
brain.

Source-generated partial neuron interfaces are allowed contract output. Runtime implementations
are ordinary complete classes and delegate complex concerns to collaborators.

## AppHost selection

AppHost selection is a separate concern: it decides which external resources and configuration are
projected into the running Kernel.

```csharp
brain.AddModule<AIModule>(ai =>
{
    ai.WithLlm<Gemma4>();
    ai.WithLlm<Llama32>();
});
brain.AddModule<MemoryModule>(memory => memory.WithQdrant());
brain.AddModule<UiModule>(ui => ui.WithWindowHost());
brain.AddModule<GoogleModule>(google => google.WithGmail());
brain.AddModule<SalesforceModule>(salesforce => salesforce.WithSalesforce());
```

That selection creates Ollama models, Qdrant, Flutter, OAuth parameters, the durable state
protection key, and startup dependencies. Execution, Time, Introspection, and SDK rails need no
separate AppHost call because their runtime is hosted inside the Kernel without a module-specific
external resource.

The AppHost list and Kernel `ComposedModules` list are currently duplicated. They must be reviewed
together; source has no single authoritative catalog yet.

## Scripting is not a module

`DigitalBrain.Scripting` is a separate executable cluster client. It has no Contracts/runtime/
Aspire-hosting project family, contributes no `IModule`, and is absent from Kernel's
`ModuleAssemblies`. Its location under `src/Kernel` groups it with product hosts; it does not make
the project part of the Kernel silo.

The AppHost references the Scripting project only so Aspire can launch it as an independent
resource. `brain.AsClient()` projects Orleans client configuration into that process. The generated
single-file C# app then references `DigitalBrain.Aspire` plus the module Contracts it intends to
use and joins the running cluster through `DigitalBrainClient.ConnectAsync`.

That dependency direction is deliberate:

```text
generated app -> client/Aspire helpers + existing Contracts -> Orleans cluster
Kernel silo   -> composed module runtimes
```

Generated code consumes permanent neuron and synapse interfaces; it does not become trusted module
code and cannot introduce a runtime-generated contract assembly. See
[Scripting](/architecture/scripting) for the generator, Roslyn/file-based-app path, and current
limitations.

## Current module roles

| Module or rail | Runtime contribution | Hosting contribution |
| --- | --- | --- |
| AI | Assistant, model neurons, orchestration helpers, protected direct-agent session | Ollama/Open WebUI or configured OpenAI model; current AppHost selects Gemma4 and Llama32 |
| Execution | Execution and worker neurons, receipts, operations, liveness, dispatch and recovery | None |
| UI | Chat, chat-turn worker, buttons, charts, diagrams, surfaces | Windows, web, or headless Flutter host; current AppHost selects Windows |
| Time | Durable Timer neuron and scheduling facts | None |
| Memory | Vector-memory neuron with in-memory or Qdrant store | Current AppHost selects Qdrant |
| Introspection | Topology, journal page, and journal tally reads | None |
| SDK MCP/OAuth | Generic MCP server neuron, actor-bound authorization neuron, OAuth/token rail | Provider parameters projected by provider modules |
| SDK webhook | Verified delivery ingress and duplicate/conflict facts | No provider endpoint is selected by the current AppHost |
| Google | Official Gmail MCP server definition and scopes | Google OAuth client ID, secret, and callback parameter projection |
| Salesforce | Salesforce hosted MCP definition and scopes | Salesforce public-client ID and callback projection; no client secret parameter |

Google and Salesforce deliberately do not recreate typed operations for every remote tool. The MCP
server's `tools/list` catalog is the executable provider surface, and the shared rail owns transport
and OAuth. Their Contracts projects remain retained module boundaries.
`DigitalBrain.Modules.Salesforce.Contracts` is permanent and must not be treated as deletion
residue when provider work remains catalog-driven.

## Availability, activation, and identity

These three states are different:

- **Available:** the contract and implementation assemblies are in `ModuleAssemblies`.
- **Hosted:** AppHost has selected the module's external resource/configuration projection.
- **Activated:** Orleans has activated a particular owner/name neuron instance because work reached
  it.

The module manifest describes exact public contracts. Wire aliases identify persisted interfaces
and records; C# namespaces explain domain ownership. Neither an embedding index nor an MCP catalog
may invent a neuron type or bypass exact contract resolution.

## Product state

**Implemented now.** Reflected manifests, explicit contract/implementation assembly lists,
parameterless module hooks, AppHost projections, and the current module families are wired into the
Kernel and checked-in AppHost. The Scripting executable is separately wired as a client resource,
not added to either module catalog.

**Known limitation.** Kernel and AppHost maintain two catalogs. Google and Salesforce are thin
generic-MCP definitions, so provider availability still depends on live provider credentials and
catalog reachability. Salesforce callback registration remains externally mismatched in the last
smoke.

**Ratified next.** Composition gets one authoritative seam. Conversation becomes a separate module,
while Behavior remains runtime data and approved single-file C# code—not a hot-loaded Module or
dynamically invented contract assembly.
