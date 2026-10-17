# Synapse: the fourth word becomes a type

Ratified 2026-10-06, amended the same day during planning (IDigitalBrain stays, shrunk; the C# rich view is `Inspect`). Companion to `2026-10-05-framework-restructuring.md`; leaves
`2026-10-06-registry-inventory-design.md` in force (see "What this does not change").

## Diagnosis

`src/DigitalBrain` is described as "the four words", but it holds three of them. Neuron, Signal
and Brain have types; Behavior has none, and Connector lives in Framework. In their place the
ring carries a fifth concept: the client session (`IDigitalBrain`, `ISignalSubscription<T>`),
with `IAsyncDisposable`, cancellation tokens and an `IGrainWithStringKey` constraint leaking
Orleans into what scripts see. Brain signals are packed into `IBrain.cs` instead of a
`Signals/` folder like every module's Contracts project.

The `digitalbrain-v0.2` branch ratified the sentence "neurons, connected by synapses,
exchanging signals, within a brain", tried a synapse-as-watch-handle, and reverted it: an
ephemeral handle is not worth a type. The durable, programmed connection is. It already
exists in the system as `CSharpFileNeuron`: a source program, a trigger, a `Subscriptions[]`
array with buffered signals, surviving every process. It is the fourth word with the wrong
name and the wrong home.

## The model

> Neurons, connected by synapses, exchanging signals, within a brain.

| Word | Meaning | Type |
|------|---------|------|
| Neuron | Stateful, addressable capability. State lives here, never in a process. | `INeuron` |
| Signal | Typed fact a neuron publishes; `Publisher` kernel-stamped. | `Signal` |
| Synapse | A durable connection with a program: it watches neurons and acts through neuron contracts. Lives in the brain, survives every process. | `ISynapse : INeuron` |
| Brain | The space neurons live in; establishment and ownership. | `IBrain : INeuron` |

Rules fixed by this spec:

- **A synapse is durable and has a program.** A plain `Watch` with no program (a shell's live
  window, the script edge's doorbell) is the ephemeral kernel primitive underneath, owned by a
  process and dying with it. It is not a synapse and is never listed as brain structure.
- **A synapse is a neuron.** It is addressable, keyed in its brain, and its subscriptions and
  watermarks are its own state. `brain.On<T>(source)` inside the program is how a synapse
  forms its watches; the program declares them by running.
- **Dialects sit beneath the word.** `ISynapse` carries only what a synapse means on any
  runtime. How one runner hosts it (sandbox image, settings, hot swap, per-signal arming) is
  that runner's contract, derived from `ISynapse`.
- **The ring holds no handles.** A program sees the brain through two verbs, resolve and watch
  (`IDigitalBrain.Get<T>`, `IDigitalBrain.On<T>`), both free of Orleans and of disposables.
  Subscription handles and `IAsyncDisposable` belong to the framework ring (silo code) and the
  client ring (scripts), never to the vocabulary. Contracts helpers such as
  `AppInvocations.Invocations` watch through `IDigitalBrain.On<T>`.

## The vocabulary ring after this change

```
src/DigitalBrain/
  INeuron.cs                     Watch / Unwatch, unchanged
  INeuronObserver.cs             unchanged: Watch's parameter
  IDigitalBrain.cs               Get<T> where T : INeuron, On<T> -> IAsyncEnumerable<T>; nothing else
  Signal.cs                      unchanged; Publisher stays a string (NeuronId is a later front)
  Brain/IBrain.cs                Read, Establish
  Brain/BrainSnapshot.cs
  Brain/EstablishBrain.cs
  Brain/Signals/Activated.cs
  Synapse/ISynapse.cs
  Synapse/SynapseSnapshot.cs
  Synapse/SynapseWatch.cs
  Synapse/Signals/SynapseChanged.cs                                           (was CSharpFileChanged)
  PlatformOnlyAttribute.cs, PlatformAssemblyAttribute.cs                      unchanged
```

```csharp
[Alias("synapse")]
public interface ISynapse : INeuron
{
    Task<SynapseSnapshot> Read(CancellationToken cancellationToken = default);
    Task Write(string program, CancellationToken cancellationToken = default);
    Task<SynapseSnapshot> Start(CancellationToken cancellationToken = default);
    Task<SynapseSnapshot> Stop(CancellationToken cancellationToken = default);
    Task Delete(CancellationToken cancellationToken = default);
}

[GenerateSerializer, Alias("synapse.snapshot")]
public sealed record SynapseSnapshot(
    [property: Id(0)] string Id,
    [property: Id(1)] string Program,
    [property: Id(2)] bool Alive,
    [property: Id(3)] SynapseWatch[] Watches,
    [property: Id(4)] string? LastError);

// Neuron is the watched neuron's grain id; Signal is the signal type's name.
[GenerateSerializer, Alias("synapse.watch")]
public sealed record SynapseWatch([property: Id(0)] string Neuron, [property: Id(1)] string Signal, [property: Id(2)] int Pending);

[GenerateSerializer, Alias("synapse.changed")]
public sealed record SynapseChanged([property: Id(0)] string SynapseId) : Signal;
```

`ModuleLoaded` stays in Framework: it is a composition fact, not brain structure. The per-grain
`NeuronActivated`/`NeuronDeactivated` broadcast was deleted on 2026-10-06: nothing consumed it,
and an activation ledger is the catalog design the registry spec rejected.

`IDigitalBrain` shrinks to the program's view of the brain:

```csharp
public interface IDigitalBrain
{
    T Get<T>(string id) where T : class, INeuron;
    IAsyncEnumerable<T> On<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal;
}
```

Leaving the ring:

- `ISignalSubscription<T>` → `DigitalBrain.Framework.ISignalSubscription<T>`. Silo code and the
  testing harness that need a handle (completion, explicit disposal) use a Framework-side
  `IBrainSubscriptions` service with `SubscribeAsync<T>`; the Orleans client in
  `DigitalBrain.Client.Orleans` implements both `IDigitalBrain` and `IBrainSubscriptions`.
- `IAsyncDisposable` on `IDigitalBrain`. The script connection (`DigitalBrainConnection`) and the
  Orleans client stay disposable as classes; the interface is not.
- The `IGrainWithStringKey` constraint on `Get<T>`; it becomes `INeuron`.

The script-facing `DigitalBrainConnection` keeps `Setting`, `Trigger<T>` and `Stopping`, drops
`SubscribeAsync`, and implements `On<T>` over one edge stream per enumeration. Watching has one
verb; there is no subscription handle for scripts.

The csproj description becomes "Neuron, signal, synapse, brain." `VocabularyRingFacts.Roots`
becomes `INeuron`, `IBrain`, `ISynapse`, `IDigitalBrain`, `INeuronObserver`.

## The C# dialect

```csharp
[Alias("microsoft.csharp.file"), DefaultGrainType("microsoft.csharp.file")]
public interface ICSharpFile : ISynapse
{
    // The dialect's rich view beside ISynapse.Read: no hiding, because the script edge resolves a
    // method by name and argument count across a contract and its inherited interfaces.
    Task<CSharpFileSnapshot> Inspect(CancellationToken cancellationToken = default);
    Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default);
    [ResponseTimeout("00:05:00")] Task<CSharpFileSnapshot> Swap(string source, CancellationToken cancellationToken = default);
    Task<CSharpFileSnapshot> Arm(CSharpTrigger trigger, CancellationToken cancellationToken = default);
    Task<string> ReadLogs(int tail = 200, CancellationToken cancellationToken = default);
}
```

- `Write`, `Start`, `Stop`, `Delete` are inherited. Starting a synapse may build a sandbox on
  any runtime, so the five-minute `[ResponseTimeout]` is declared on `ISynapse.Start`, `Stop`
  and `Delete` themselves; the dialect adds none of its own for those members.
- `ISynapse.Read` returns `SynapseSnapshot` derived from the same state the rich view reads:
  `Alive` is `Status is Running or Restarting`, `Watches` is `Subscriptions` plus the armed
  `Trigger` as a watch with `Pending = 0`, `LastError` is the last non-zero exit's log tail or
  null. State shape (`CSharpFileState`) is unchanged. `Inspect` returns `CSharpFileSnapshot` as
  today's `Read` does.
- `CSharpFileChanged` is deleted; the neuron publishes `SynapseChanged`.
- Grain type names do not change, so `AppGrainType` and every `GrainType` comparison keep working.

## Keys

One convention, enforced by a test: a synapse's key is `{owner}/synapses/{name}` where the
owner is a brain scope or an app key. Today's `behaviors/` segment in app-owned file keys and
the `BehaviorsPrefix` constant become `synapses/`. Standalone C# files from the authoring
catalog keep their hashed keys (the registry gate's ruling) and are listed by the CSharp
inventory provider as before.

## Apps, Assistant, shell

- App bundle: `synapses/*.cs` replaces `behaviors/*.cs`. `AppFiles.BehaviorsPrefix`,
  `AppFiles.IsBehavior`, the Creator prompts (`AgentPrompts.cs`), the sandbox authoring text
  (`CSharpScriptSandbox.cs`) and the first-party bundles under `src/DigitalBrain.OS/Apps` and
  `src/IntoChat/Apps` change in the same commit. Install and Marketplace copy synapses exactly
  as they copy behaviors; `Origin` and detachment rules are untouched.
- Inventory: `AppsInventoryProvider` and `CSharpInventoryProvider` keep reporting type
  `microsoft.csharp.file`. "List my synapses" is `IRegistry.Persisted` filtered to contracts
  assignable to `ISynapse`; `RegistryInventoryTools` gains that filter as `list_synapses`.
- Shell: no Dart mirror of the file snapshot exists, so no Flutter change. `flutter analyze`
  still runs in verification.

## What this does not change

- **The registry ruling.** `IRegistry`, `IRegistryInventoryProvider`, the Platform census and
  every provider including `TimeInventory` stay as ratified today. `IBrain` gains no
  `Neurons()`/`Synapses()`; a brain-side inventory door remains a separate ratification.
- **The script edge protocol.** `scripts/v1/invoke` and `scripts/v1/signals` are unchanged;
  `ScriptEdge` keeps `IDigitalBrain` for resolution and takes `IBrainSubscriptions` for its
  doorbell handle.
- **`Signal.Publisher`'s type.** Making it a `NeuronId` is the v0.2 follow-up and touches
  thirteen comparison sites; out of scope.
- **Framework's `Platform/` folder.** Named as a smell in the survey; its resolution is a
  separate restructuring, not folded in here.

## Migration order

Three commits, each building and green on its own:

1. **Ring reshape.** Folders, moved signals, `IDigitalBrain` shrunk, Framework
   `ISignalSubscription` and `IBrainSubscriptions`, every call site. No behavior change;
   architecture facts updated.
2. **`ISynapse`.** Added to the ring; `ICSharpFile` derives from it; `SynapseChanged`; snapshot
   derivation; key convention test.
3. **Bundle rename.** `synapses/`, prompts, first-party apps, `list_synapses`.

## Tests

Tests whose concept dies with this change: none. The registry suites survive because the
registry survives. Tests pinning behavior that is renamed are renamed, not rewritten:
`CSharpFileFacts`, `WatchCycleFacts`, the Apps behavior facts, `VocabularyRingFacts`.

New facts, all over real grains through `ModuleTest.Create().WithModule<…>()`:

- **Architecture** (`DigitalBrain.Architecture.Tests`): the ring's roots are exactly the four
  words plus `IDigitalBrain` and the observer; no public type in the ring derives from
  `IAsyncDisposable` or `IDisposable`, and no ring member returns one; `IDigitalBrain` has
  exactly the members `Get` and `On`; every contract assignable to `ISynapse` carries an alias.
- **Apps and CSharp key grammar**: every synapse key produced by Apps or the CSharp module
  matches `*/synapses/*` (pinned in the owning module's tests).
- **Client** (`DigitalBrain.Client.Tests.Unit`): `DigitalBrainConnection.On<T>` opens one edge
  stream per enumeration and closes it when the loop ends, including when the loop breaks early;
  the connection exposes no member returning a subscription handle.
- **CSharp** (`DigitalBrain.Modules.Microsoft.CSharp.Tests`): a started synapse reports
  `Alive` and one watch per streamed subscription; a stopped synapse keeps program and watches;
  a swapped program keeps buffered signals and their `Pending` counts; an armed synapse lists
  its trigger as a watch and runs once per signal; `SynapseChanged` is published on write,
  start, stop and delete with the synapse's id.
- **Apps** (`DigitalBrain.Modules.Apps.Tests`): an app's synapses are keyed
  `{app}/synapses/{name}`; install copies them and binds them to the installer's brain; the
  Creator writes `synapses/` and never `behaviors/`.
- **Assistant** (`DigitalBrain.Modules.Assistant.Tests`): `list_synapses` returns only records
  whose contract is assignable to `ISynapse`, from the ambient brain only.
- **OS E2E** (`DigitalBrain.OS.Tests.E2E`): an established brain's first-party apps expose
  their synapses through `neurons_list`, `neurons_get` on one returns a snapshot with
  `Alive = true` after startup, and the Aspire trace for the start shows the sandbox run.

Verification follows CLAUDE.md's loop: build each touched project, `aspire run`, drive the
changed path through `digitalbrain-mcp`, confirm spans and logs, then run the unit and E2E
suites of every touched project plus `flutter analyze`.
