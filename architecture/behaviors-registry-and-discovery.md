# Architecture: Behaviors, registry, and discovery

This authority owns the designed Behavior rail, pre-rail composition, and discovery rationale.

## 5. Behaviors and scripting

Status: Designed

Behavior **proposal, approval, installation, execution, and rollback** remain **Designed,
unbuilt**. The approved post-rail design is
`docs/superpowers/specs/2026-07-26-behavior-operating-system-runtime-design.md`. It still composes
typed module vocabulary without bypassing journals.

The final distinction is:

```text
BehaviorNeuron = owner-scoped neuron identity, journal, state, authority, and revisions
Behavior program = immutable single-file C# logic executed on behalf of that neuron
```

`BehaviorNeuron : Neuron, IBehavior`; the program does not inherit `Neuron`. One registered grain
implementation hosts all `(OwnerId, BehaviorId)` instances and their immutable approved revisions.
Installed revisions may react to typed synapse subscriptions and expose schema-validated intent
entry points. Semantic search discovers candidates, but exact catalog identity, schema, active
revision, ownership, and grants authorize execution.

What *is* Built today for OS boot (does not flip §5 Status to Built):

- Owner-scoped **`IDigitalBrainNeuron`** (Kernel `DigitalBrainNeuron`) — product “brain is up”
  grain; idempotent `Activate()` emits **`DigitalBrainActivated`** once per owner (durable flag).
- Client facade **`IDigitalBrain.ActivateAsync()`** talks to that neuron; `SendAsync` / `EmitAsync`
  ensure activation first. Hosted clients also run a start-time activation hosted service.
- Marker **`IBehavior : INeuron`** — synapse-activated OS behaviors (not `Get` targets).
- First compiled OS Behavior: Flutter module `OpenHomeOnActivationBehavior` implements
  `IHandle<DigitalBrainActivated>` and opens shell home (`desk` / `home` / `Home`) via `IShell`.
- Pre-rail compositions under `samples/DigitalBrain.Compositions` remain helpers
  (`ActivateDigitalBrain` → `ActivateAsync`; `BootOnActivation` pull path still valid).

These compiled grains are migration inputs, not the final identity model. The approved migration
moves OS policy out of Flutter, folds the compositions into installed revisions, and deletes the
duplicate path only after journal-backed BDD proves the replacement.

When the behavior compiler exists it will be contract-only:

- **Allowed:** the Behavior API, `DigitalBrain.Abstractions`, selected module contracts, approved BCL
  types, and the small Behavior SDK.
- **Forbidden:** `IGrainFactory`, `IChatClient`, provider SDKs, MCP protocol types, `HttpClient`,
  `IServiceProvider`, filesystem and process APIs, reflection, ambient time/random, and native
  interop.

Runtime behavior installation is designed and not yet built. The only path to a *user-authored*
live behavior remains a human-approved proposal with a journaled, reversible decision. Compiled
first-vertical OS Behaviors ship through source control and a rebuild — honest, not the full rail.
The approved rail compiles a proposal once in an isolated build worker, runs BDD, stores a
content-addressed revision, and executes that exact artifact through a constrained context and
capability broker. Unknown AI/community code runs outside the silo. A .NET file-based app,
single-file deployment, or `AssemblyLoadContext` is not treated as a security boundary.

### OS composition before the rail

Shell policy, post-auth UX orchestration, and OS surface “apps” that only compose vocabulary still
live as ordinary C# under `samples/DigitalBrain.Compositions`, one public sealed class per file.
Bodies use only `IDigitalBrain` + selected `*.Contracts` + approved BCL + Microsoft.Extensions.AI
message types where AI compositions need them. They are pull-invoked by tests (or thin wrappers
over `ActivateAsync`) and are not the install rail.

**Activation → first screen (Built L1; install rail still Designed):**

```text
IDigitalBrain.ActivateAsync()
  → IDigitalBrainNeuron.Activate()              // owner-scoped brain grain, once (durable)
  → EmitAsync(DigitalBrainActivated(Owner))     // brain outgoing journal
  → OpenHomeOnActivationBehavior.HandleAsync    // IBehavior + IHandle (Flutter module)
    → IShell.Open(OpenScene home/Home) on desk
      → SceneOpened                             // Flutter vocabulary; Ui SSE projects this only
```

- **`DigitalBrainActivated`** — Built substrate synapse (`db.digitalbrain-activated`, `OwnerId` only).
- **`IDigitalBrainNeuron` / `DigitalBrainNeuron`** — Built emitter; not session; not AppHost
  `Program` chrome; not module capsule `ICompiledModule.Activate`.
- **First Behavior** — Built compiled `IHandle<DigitalBrainActivated>` in Flutter module (opens
  home). Synapse-activated, not name-dispatched.
- **Flutter UI** still consumes **`SceneOpened` only** (SSE). It does not subscribe to activation.
- **L1 proof:** `DigitalBrain.Compositions.Tests` — activate only → activation journal + home
  `SceneOpened` without pull `BootOnActivation`. Not Built-live AppHost OS Healthy as a separate
  claim.

Honesty split (do not blur):

- **Shell / OS boot:** brain neuron activation + first Behavior; compositions
  `ActivateDigitalBrain` / `BootOnActivation` / `OpenHome` / `PostAuthBootstrap` / `NavigateShell`
  remain pre-rail helpers.
- **Multi-module surfaces:** `CountdownSurface` (Flutter + `ICountdown`), `AiPaneSurface` (Flutter +
  `ILlama32`). Compose existing vocabulary; no new durable process type.
- **OS-scene-only surface:** `AccountEnrichmentSurface` opens the enrichment scene. It is **not** the Gmail→Salesforce
  enrichment process and not an approval rail.

`samples/DigitalBrain.AccountEnrichment` is currently a **compiled process neuron** and remains
Built Integrations L1 until migration. In the approved model it becomes a Behavior over Google and
Salesforce contracts: its durable private process state belongs to `BehaviorNeuron`; it does not
justify new public module vocabulary. Delete the compiled sample only after equivalent recovery and
journal BDD is green.

The Behavior SDK keeps this coherent rather than creating a second language: the same constrained
program is exercised by local BDD and by the installed executor. Production applications take
`IDigitalBrain` from DI (`AddDigitalBrainClient(owner)`). `DigitalBrainClient.Connect` remains only
for Testing and host wiring that already hold an `IGrainFactory` — it is not the Behavior program
boundary.

```csharp
// IDigitalBrain brain from DI, TestBrain.Client, or Connect wiring
await brain.SendAsync<IAnalyst>(
    "incident-42",
    new SummaryRequested("Summarize the incident."));
```

`IDigitalBrain` is the owner-scoped client contract, and `DigitalBrainClient` is its implementation
and the only public client facade. A brain is hosting state held by `DigitalBrainBuilder`, not a
concrete `DigitalBrain` neuron or an addressable root-neuron interface. Owner identity is ambient to
the client.
`SendAsync<TNeuron>()` enters through the owner-bound session and derives the target neuron type from
the interface; `EmitAsync()` broadcasts a fact through the same deliberate entry point. The client
returns only owner-bound typed capability proxies, never an untyped root. Authentication remains an
edge responsibility — an Orleans client is a trusted cluster peer.

Inside the brain, one neuron calls another typed capability directly:

```csharp
public sealed class Analyst(ILlama32 llama) : Neuron, IAnalyst, IHandle<SummaryRequested>
{
    public Task HandleAsync(SummaryRequested request, CancellationToken cancellationToken)
        => llama.Respond([new ChatMessage(ChatRole.User, request.Prompt)]);
}
```

## 6. Registry and discovery

There are two canonical catalogs with different authority:

- The generated module catalog owns the compile-time CLR universe. Its entries derive from the
  public namespace and contract type name, documentation, method and parameter types, handled and
  emitted synapse aliases, and owning module. Runtime installation never adds CLR neuron or synapse
  types.
- The owner-scoped Behavior catalog owns installed immutable revisions, subscriptions, intent
  schemas, grants, descriptions, and provenance. Installation updates this catalog and the
  subscription projection atomically.

Vector indexes are derived projections over both catalogs. They rank candidates only; they never
authorize an invocation or resolve a runtime type by similarity.

Natural-language programming is intended to follow one path:

```text
"Read the Gmail message that just arrived"
                      ↓
derived vector search over the generated catalog
                      ↓
DigitalBrain.Google.IGmail
                      ↓
exact typed neuron proxy
```

The rule that keeps this safe: a vector index may *rank* candidates and may never execute an invented
type or bypass exact catalog resolution. The index is derived and disposable; the catalog is the
source of truth. Losing the index costs discovery quality, never correctness.

What exists today is the compile-time module catalog and the generated dispatch composition described
in §3. The canonical neuron catalog assembled from public contracts and synapse vocabulary, and the
semantic index derived from it, do not exist yet — the vocabulary rules in §3 are what make them
writable later without another redesign.


