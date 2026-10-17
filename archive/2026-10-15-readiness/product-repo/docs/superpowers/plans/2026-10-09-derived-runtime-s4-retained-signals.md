# Retained Signals Implementation Plan (spec section 4)

> **For agentic workers (OpenCode):** you implement exactly ONE task below. Read the spec first:
> `docs/superpowers/specs/2026-10-09-derived-runtime-design.md` (section 4). Read `CLAUDE.md`. Stay inside
> the files your task lists. Do not commit - the orchestrator reviews and commits.

**Goal:** `IApp.Request` publishes and forgets; a request posted before the synapse subscribed is lost, so
facts and the E2E wait for subscriptions first. This section adds retention: a neuron may implement
`IRetainsSignals` (vocabulary ring), `AppNeuron` keeps the last 64 `AppRequested` in its state, and the
brain runtime's `Subscribed` seeds a new subscription's `Pending` with the retained backlog. Delivery
stays at-least-once and dedup stays the synapse's job. The E2E subscription waits are removed.

**Depends on** (spec order 2, 3, 1, 4, 5):
- Section 2 changes the assistant `send.cs` synapse and the E2E `AssistantGateFacts.cs` /
  `RouterHostFixture.cs` (its facts keep posting through `IApp.Request`). This section removes the
  subscription waits in those same E2E files, so Task S4-4 rebases onto section 2's final versions.
- Section 1 adds a `ShippedAppReconciler` in the Apps module and may touch `AppNeuron.cs` /
  `AppInstaller.cs`; it does not touch `Request`, `AppState` retention fields, or the runtime. Merge
  conflicts on `AppNeuron.cs` are resolved by the orchestrator.
- Section 3 changes `RouteResult`/the router; it touches none of this section's files.
- No dependency on section 5.

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, xunit v3.
- Build and test **per project**, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<test-project-dir>`.
  Cap every test run at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, not a timeout to raise.
- Warnings are errors, nullable on. No `/// <summary>` boilerplate. Inline comments only for what code
  cannot say. Match surrounding style (file-scoped namespaces, primary constructors, expression bodies).
- Grain state: `[GenerateSerializer]` records with **concrete arrays / Dictionary**, never `IReadOnlyList`.
  Every `[Alias]` unique, every `[Id]` unique per state. No self-calls on non-reentrant grains.
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains via
  `ModuleTest.Create().WithModule<...>().StartAsync(ct)`, no mocks of grains. Signal JSON in pending
  batches is read through `SignalJson` helpers.
- Neuron keys start with the brain id: `{brainId}/...`. The brain runtime's edge methods are
  `PublicOperation`; the seeding call to `IRetainsSignals.Retained` carries the same caller context and
  passes the per-brain access check (`NeuronCallFilter`, scope from the app's key).
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`, `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`,
  `src/DigitalBrain.AppHost/*`. The orchestrator wires those.
- A change to grain state (Task S4-2) reshapes `AppState`; the orchestrator wipes the local storage
  volume (Azurite) before the verification run, per CLAUDE.md hazards. No migration shims.
- Done = your project(s) build with 0 warnings and your tests pass. Report the exact commands and output.

---

## Task S4-1: `IRetainsSignals` + `RetainedSignal` in the vocabulary ring

**Executor:** Claude - vocabulary-ring contract change.

**Files:**
- Create `src/DigitalBrain/Neurons/IRetainsSignals.cs`
- Create `src/DigitalBrain/Signals/RetainedSignal.cs`

**Context.** `src/DigitalBrain` is the vocabulary ring (`INeuron`, `Signal`, `SignalId`).
`DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs` accepts a public `DigitalBrain` type when it is
(a) a contract (`interface : INeuron`), (b) a signal, or (c) a `[GenerateSerializer]` shape reachable
from a ring contract's methods. `Neuron.cs` stamps `Signal.Publisher` at publish
(`signal with { Publisher = Id }`); a retained copy must carry the same stamp so late delivery looks
identical to live delivery.

**Implementation.**

`src/DigitalBrain/Neurons/IRetainsSignals.cs`:

```csharp
namespace DigitalBrain;

// A neuron that keeps a bounded buffer of its recent signals, so a subscription created after they
// were published still receives them. The brain runtime seeds a new subscription's backlog from here;
// a neuron that does not retain contributes nothing. Delivery stays at-least-once: deduplicating
// against its own acknowledged facts stays the synapse's job.
public interface IRetainsSignals : INeuron
{
    // The retained signals of kind `signal` (the signal's type name, as a subscription stores it)
    // whose sequence is newer than `since` - the subscription's watermark, zero for a new one - in
    // sequence order. Empty when this neuron retains no such signal.
    Task<RetainedSignal[]> Retained(string signal, long since);
}
```

`src/DigitalBrain/Signals/RetainedSignal.cs`:

```csharp
namespace DigitalBrain;

// One retained signal: its place in the publisher's retention order and the stamped fact itself.
[GenerateSerializer, Alias("brain.retained-signal")]
public sealed record RetainedSignal([property: Id(0)] long Sequence, [property: Id(1)] Signal Signal);
```

`IRetainsSignals` resolves in both consumers via namespace nesting (`DigitalBrain.Apps`,
`DigitalBrain.Microsoft.CSharp.Runtime`), as `Signal` and `INeuron` do today.

**Fact (no new test project; the architecture suite guards the seam):** run
`dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"`
- `EveryPublicVocabularyTypeIsANeuronContractASignalOrAShapeTheyCarry`,
`VocabularyTypesLiveOnlyInTheVocabularyNamespaces`, `TheRingHoldsNoHandles` and
`TheBrainSeenByAProgramHasExactlyGetOnAndSelf` must stay green. `IRetainsSignals` fits the contract
clause; `RetainedSignal` fits the serializable-shape clause (reachable from `Retained`). `IRetainsSignals`
has no `[DefaultGrainType]`, exactly like `INeuron`, so it never hijacks grain-type resolution.

**Verify:** `dotnet build src/DigitalBrain/DigitalBrain.csproj` and the architecture filter above.

**Build/test commands:**
```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"
```

**git add:** `src/DigitalBrain/Neurons/IRetainsSignals.cs src/DigitalBrain/Signals/RetainedSignal.cs`
**commit:** `Add IRetainsSignals and RetainedSignal to the vocabulary ring`

---

## Task S4-2: `AppNeuron` retains `AppRequested`

**Executor:** Claude - grain-state change.

**Files:**
- Modify `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`
- Modify `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppState.cs`
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRetentionFacts.cs`

**Context.** `AppNeuron` (`Neuron<AppState>`, grain type `apps.app2`) currently publishes `AppRequested`
and forgets (`Request`, line 382). `AppState` ids run to 22. `AppRequestFacts.cs` shows the harness:
`ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct); app.Create(new AppManifest("Echo", "echoes", [new("open", "")], [], []), "spec");`.
`Signal.Publisher` is `NeuronId`; the grain's own `Id` (`Neuron.Id`) is the stamp `PublishAsync` applies.

**Implementation.**

`AppState.cs` - add two fields and clone them:

```csharp
    [Id(23)] public RetainedSignal[] RequestRetention { get; set; } = [];
    [Id(24)] public long RequestSequence { get; set; }
```

```csharp
        RequestRetention = [.. RequestRetention],
        RequestSequence = RequestSequence,
```

`AppNeuron.cs` - implement the contract and retain in `Request`:

```csharp
internal sealed class AppNeuron(...)
    : Neuron<AppState>(store), IApp, IRetainsSignals
{
    private const int MaxHistory = 20;
    private const int MaxActivity = 50;
    private const int MaxPayloadLength = 64 * 1024;
    private const int MaxReceipts = 64;
    private const int RetainedCapacity = 64;
```

```csharp
    public async Task<Guid> Request(string operation, string input)
    {
        RequireCreated();
        ArgumentException.ThrowIfNullOrWhiteSpace(operation);
        ArgumentNullException.ThrowIfNull(input);
        if (!Snapshot.Manifest!.Operations.Any(candidate => candidate.Name == operation))
        {
            throw new ArgumentException(
                $"{operation} is not an operation of {Name()}. It offers: {string.Join(", ", Snapshot.Manifest.Operations.Select(candidate => candidate.Name))}.");
        }
        if (input.Length > MaxPayloadLength) { throw new ArgumentException("A request input is at most 64 KiB."); }
        var id = Guid.NewGuid();
        // A request is a fact for the app's synapses; it is published for whoever is watching and kept
        // for whoever subscribes later, so a synapse that starts after the request still gets it.
        var next = Snapshot.Clone();
        var retained = new RetainedSignal(next.RequestSequence + 1, new AppRequested(operation, input, id) with { Publisher = Id });
        next.RequestSequence = retained.Sequence;
        next.RequestRetention = [.. next.RequestRetention.TakeLast(RetainedCapacity - 1), retained];
        await Save(next, new AppRequested(operation, input, id));
        return id;
    }
```

Add the retention reader (a public-operation-free plain read; `NeuronCallFilter` allows the same-brain
runtime caller through `access.Scope`):

```csharp
    public Task<RetainedSignal[]> Retained(string signal, long since)
        => Task.FromResult(signal == nameof(AppRequested)
            ? [.. Snapshot.RequestRetention.Where(candidate => candidate.Sequence > since)]
            : []);
```

`RetainedSignal` and `IRetainsSignals` resolve through the `DigitalBrain` namespace nesting.

**Facts** - `AppRetentionFacts.cs` (test the grain's own contract through the concrete `AppNeuron`;
`IRetainsSignals` has no `[DefaultGrainType]`, so tests use `app.AsReference<IRetainsSignals>()` rather
than `brain.Get<IRetainsSignals>(key)`):

```csharp
using DigitalBrain.Apps.Signals;

namespace DigitalBrain.Apps.Tests.Apps;

// A request is retained by its app for synapses that subscribe later: the app answers IRetainsSignals
// with the bounded backlog, newest last, so the brain runtime can seed a late subscription.
public sealed class AppRetentionFacts
{
    private const string Brain = "app-retention-facts";

    private static async Task<(IApp App, IRetainsSignals Retains)> CreatedAppAsync(ModuleBrain brain, string name, CancellationToken ct)
    {
        var app = brain.Get<IApp>(IApp.Key(Brain, name));
        await app.Create(new AppManifest(name, "", [new("open", "")], [], []), "spec");
        return (app, app.AsReference<IRetainsSignals>());
    }

    [Fact]
    public async Task ARequestIsRetainedInPublishOrderWithIncreasingSequences()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var (app, retains) = await CreatedAppAsync(brain, "echo", ct);

        var first = await app.Request("open", "one");
        var second = await app.Request("open", "two");

        var retained = await retains.Retained(nameof(AppRequested), 0);
        Assert.Equal(2, retained.Length);
        Assert.Equal([1L, 2L], retained.Select(item => item.Sequence).ToArray());
        var ids = retained.Select(item => Assert.IsType<AppRequested>(item.Signal).RequestId).ToArray();
        Assert.Equal([first, second], ids);
    }

    [Fact]
    public async Task RetainedFiltersToSignalsNewerThanSince()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var (app, retains) = await CreatedAppAsync(brain, "filter", ct);
        await app.Request("open", "one");
        await app.Request("open", "two");

        var retained = await retains.Retained(nameof(AppRequested), 1);

        var item = Assert.Single(retained);
        Assert.Equal(2, item.Sequence);
        Assert.Equal("two", Assert.IsType<AppRequested>(item.Signal).Input);
    }

    [Fact]
    public async Task ARetainingNeuronReturnsNothingForSignalsItDoesNotRetain()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var (app, retains) = await CreatedAppAsync(brain, "shy", ct);
        await app.Request("open", "one");

        Assert.Empty(await retains.Retained("SomeOtherSignal", 0));
    }

    [Fact]
    public async Task The65thRequestEvictsTheOldestRetainedOne()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var (app, retains) = await CreatedAppAsync(brain, "bounded", ct);
        var first = await app.Request("open", "0");
        for (var i = 1; i < 65; i++) { await app.Request("open", i.ToString()); }

        var retained = await retains.Retained(nameof(AppRequested), 0);

        Assert.Equal(64, retained.Length);
        Assert.Equal(65, retained[^1].Sequence);
        Assert.DoesNotContain(first, retained.Select(item => Assert.IsType<AppRequested>(item.Signal).RequestId).ToArray());
    }
}
```

**Verify:** build the Apps module; run the four facts, then the whole Apps suite (which includes
`AppRequestFacts`, `AppNeuronFacts`, `AppCreatorFacts` - they must stay green), then the architecture
state and ring facts.

**Build/test commands:**
```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
timeout 300 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppRetentionFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*PersistedStateFacts*"
```

**git add:** `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppState.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRetentionFacts.cs`
**commit:** `AppNeuron retains its recent AppRequested signals for late subscribers`

---

## Task S4-3: the brain runtime seeds a new subscription from retention

**Executor:** Claude - runtime-shape change.

**Files:**
- Modify `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs`
- Modify `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj`
- Modify `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/RuntimeBrain.cs`
- Modify `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SignalJson.cs`
- Create `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SubscribedRetentionFacts.cs`

**Context.** `BrainRuntimeNeuron.Subscribed` (line 179) creates `new Subscription(id, behavior, neuron,
signal, [], 0, 0)` when none exists. `Subscription.Pending` holds pre-serialized signal JSON; `Arrived`
serializes `JsonSerializer.Serialize(signal, signal.GetType(), RuntimeProtocol.Json)`. Seeds must be
serialized identically. The harness `RuntimeBrain.StartAsync` composes `CSharpModule` with a
`FakeSessionHost`; the CSharp test project references Time, Platform, Sandbox and CSharp - but not the
Apps module. `Pinger` lacks retention (guards the "not retaining" path).

The seeding is ordered watch-first-then-seed so a request published between the retention snapshot and
the watch registration is never lost: anything newer than the snapshot arrives through the watch into
`Pending`, and the merge keeps at-least-once semantics (possible duplicate in a narrow race is the
synapse's dedup to bear). Only NEW subscriptions seed; an existing subscription (a re-subscribing
synapse) keeps its acknowledged watermark, so acknowledged requests are never reissued.

**Implementation.**

`BrainRuntimeNeuron.cs` - replace the `if (existing is null)` branch of `Subscribed` (lines 188-193):

```csharp
        if (existing is null)
        {
            existing = new(Guid.NewGuid().ToString("N"), behavior, neuron, signal, [], 0, 0);
            // A source that retains the signal seeds the new subscription with the backlog the synapse
            // missed. Watch before seeding: anything published between the seed and the watch arrives
            // through the watch itself, and a duplicate is at-least-once's to bear; nothing is lost.
            await Save(Snapshot with { Subscriptions = [.. Snapshot.Subscriptions, existing] }, Changed());
            await WatchSourcesAsync();
            var seeded = await SeedRetainedAsync(neuron, signal, existing.Watermark);
            if (seeded.Length > 0)
            {
                var current = Snapshot.Subscriptions.First(s => s.Id == existing.Id);
                var known = seeded.ToHashSet(StringComparer.Ordinal);
                existing = current with { Pending = [.. seeded, .. current.Pending.Where(json => !known.Contains(json))] };
                await Save(Snapshot with { Subscriptions = [.. Snapshot.Subscriptions.Where(s => s.Id != existing.Id), existing] }, Changed());
            }
        }
```

Add the helper next to `Batch`; `JsonSerializer`/`RuntimeProtocol` are already in scope; `IRetainsSignals`
and `RetainedSignal` resolve through the `DigitalBrain` namespace:

```csharp
    // A source that retains the signal seeds a new subscription with the backlog the synapse missed.
    // A source without retention contributes nothing: the cast fails and there is nothing to seed.
    private async Task<string[]> SeedRetainedAsync(string neuron, string signal, long since)
    {
        try
        {
            var retained = await GrainFactory.GetGrain<IRetainsSignals>(GrainId.Parse(neuron)).Retained(signal, since);
            return [.. retained.Select(item => JsonSerializer.Serialize(item.Signal, item.Signal.GetType(), RuntimeProtocol.Json))];
        }
        catch (InvalidCastException)
        {
            return [];
        }
    }
```

The cast is resolved by full grain id exactly as `GetGrain<INeuron>(GrainId.Parse(neuron))` is today
(line 425); a non-retaining target surfaces `InvalidCastException` and seeds nothing. If the observed
exception type differs at runtime, broaden the catch accordingly (see Open Questions).

`RuntimeBrain.cs` - add a harness that composes `AppsModule` with `CSharpModule` (same session host
configuration as `StartAsync`):

```csharp
    public static Task<ModuleBrain> StartWithAppsAsync(FakeSessionHost host, CancellationToken ct)
    {
        var builder = ModuleTest.Create().WithModule<AppsModule>().WithModule<CSharpModule>().WithReminders()
            .ConfigureSilo(silo =>
            {
                silo.Services.AddHttpClient<SessionRunner>().ConfigurePrimaryHttpMessageHandler(() => host);
                silo.Services.AddSingleton(new MemoryBehaviorAssemblies());
                silo.Services.AddSingleton(new ScriptContracts([typeof(IPinger).Assembly, typeof(ICSharpFile).Assembly]));
                silo.Services.PostConfigure<CSharpDeploymentSettings>(options =>
                {
                    options.EdgeUrl = "http://edge.test/";
                    options.SandboxUrl = FakeSessionHost.Url;
                });
            });
        return builder.StartAsync(ct);
    }
```

Add `using DigitalBrain.Apps;` to `RuntimeBrain.cs`.

`DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj` - add the Apps module reference (same hop count as
the existing Time reference):

```xml
    <ProjectReference Include="../../../../DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj" />
```

`SignalJson.cs` - add a helper for `AppRequested` payloads on the pending wire:

```csharp
    public static Guid RequestId(string json) => JsonDocument.Parse(json).RootElement.GetProperty("requestId").GetGuid();
```

**Facts** - `SubscribedRetentionFacts.cs`. `IBrainRuntimeEdge.Subscribed` is the edge the sandbox calls;
`PendingBatches` reads the durable backlog; pending stays buffered while the session is only
`Starting` (it "speaks" until refused), so a connected host is not required. Drop counting is the
existing `Subscription.Arrive` overflow path (`Dropped`), observable through
`BehaviorView.Subscriptions[].Dropped`. The App request cap (64) equals `CSharpOptions.MaximumPending`
(64), so the seeded batch fills the cap and the 65th live arrival is the one that evicts and drops.

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Microsoft.CSharp.Runtime;
using DigitalBrain.Microsoft.CSharp.Runtime.Signals;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

// AppNeuron retains AppRequested; a synapse that subscribes after its app's requests were published
// still receives them because Subscribed seeds the new subscription's backlog from that retention.
public sealed class SubscribedRetentionFacts
{
    private const string Brain = "retention-brain";
    private const string Echo = Brain + "/apps/echo";
    private const string Behavior = Echo + "/synapses/a.cs";

    [Fact]
    public async Task ARequestPostedBeforeTheSynapseSubscribesIsSeededIntoPending()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartWithAppsAsync(new FakeSessionHost(), ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "echo"));
        await app.Create(new AppManifest("Echo", "", [new("open", "")], [], []), "spec");
        await Programs(brain).Assign(Echo, new() { ["synapses/a.cs"] = RuntimeBrain.Idle }, []);
        var session = (await Runtime(brain).Inspect(ct)).SessionId!;
        var first = await app.Request("open", "one");
        var second = await app.Request("open", "two");

        var subscription = await Edge(brain).Subscribed(session, Behavior, app.GetGrainId().ToString(), nameof(AppRequested));

        var pending = Assert.Single(await Edge(brain).PendingBatches(session));
        Assert.Equal(subscription, pending.Subscription);
        Assert.Equal([first, second], pending.Signals.Select(SignalJson.RequestId).ToArray());
        // Seeding is durable: a reactivated runtime still holds the backlog.
        await brain.DeactivateAsync(Runtime(brain), ct);
        var resumed = (await Runtime(brain).Inspect(ct)).SessionId!;
        Assert.Equal(2, Assert.Single(await Edge(brain).PendingBatches(resumed)).Signals.Length);
    }

    [Fact]
    public async Task ANeuronThatDoesNotRetainLeavesANewSubscriptionUnseeded()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartWithAppsAsync(new FakeSessionHost(), ct);
        await Programs(brain).Assign(Echo, new() { ["synapses/a.cs"] = RuntimeBrain.Idle }, []);
        var session = (await Runtime(brain).Inspect(ct)).SessionId!;
        var pinger = brain.Get<IPinger>("pinger");

        await Edge(brain).Subscribed(session, Behavior, pinger.GetGrainId().ToString(), nameof(Pinged));

        Assert.Empty(await Edge(brain).PendingBatches(session));
    }

    [Fact]
    public async Task AReSubscribingSynapseDoesNotReceiveRetainedRequestsItAcknowledged()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartWithAppsAsync(new FakeSessionHost(), ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "echo"));
        await app.Create(new AppManifest("Echo", "", [new("open", "")], [], []), "spec");
        await Programs(brain).Assign(Echo, new() { ["synapses/a.cs"] = RuntimeBrain.Idle }, []);
        var session = (await Runtime(brain).Inspect(ct)).SessionId!;
        await app.Request("open", "one");
        var subscription = await Edge(brain).Subscribed(session, Behavior, app.GetGrainId().ToString(), nameof(AppRequested));
        Assert.Single(Assert.Single(await Edge(brain).PendingBatches(session)).Signals);

        await Edge(brain).Acknowledge(session, subscription, 1);
        var again = await Edge(brain).Subscribed(session, Behavior, app.GetGrainId().ToString(), nameof(AppRequested));

        Assert.Equal(subscription, again);
        Assert.Empty(await Edge(brain).PendingBatches(session));
    }

    [Fact]
    public async Task The65thRequestEvictsTheOldestSeededOneAndCountsItDropped()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartWithAppsAsync(new FakeSessionHost(), ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "echo"));
        await app.Create(new AppManifest("Echo", "", [new("open", "")], [], []), "spec");
        await Programs(brain).Assign(Echo, new() { ["synapses/a.cs"] = RuntimeBrain.Idle }, []);
        var session = (await Runtime(brain).Inspect(ct)).SessionId!;
        var first = await app.Request("open", "0");
        for (var i = 1; i < 65; i++) { await app.Request("open", i.ToString()); }
        await Edge(brain).Subscribed(session, Behavior, app.GetGrainId().ToString(), nameof(AppRequested));
        Assert.Equal(64, Assert.Single(await Edge(brain).PendingBatches(session)).Signals.Length);
        await using var changes = await brain.Observe<BrainRuntimeChanged>(Runtime(brain), ct);

        await app.Request("open", "65");
        await changes.NextAsync(ct: ct);

        var pending = Assert.Single(await Edge(brain).PendingBatches(session));
        Assert.Equal(64, pending.Signals.Length);
        Assert.DoesNotContain(first, pending.Signals.Select(SignalJson.RequestId).ToArray());
        var sub = Assert.Single(Assert.Single((await Runtime(brain).Inspect(ct)).Behaviors).Subscriptions,
            s => s.Neuron == app.GetGrainId().ToString());
        Assert.Equal(1, sub.Dropped);
    }

    private static IBrainPrograms Programs(ModuleBrain brain) => brain.Grains().GetGrain<IBrainPrograms>(BrainRuntimeKeys.For(Brain));

    private static IBrainRuntime Runtime(ModuleBrain brain) => brain.Get<IBrainRuntime>(BrainRuntimeKeys.For(Brain));

    private static IBrainRuntimeEdge Edge(ModuleBrain brain) => brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For(Brain));
}
```

The drop fact's timing mirrors `BrainRuntimeNeuronFacts.AcknowledgementBatchesPersistIndependentWatermarksAndRejectInvalidBatches`
(line 34): publish, then wait for the arrival's `BrainRuntimeChanged`.

**Verify:** build the CSharp module and its tests; run the new facts, the pre-existing
`BrainRuntimeNeuronFacts` (they must stay green - seeding only runs for new subscriptions, and
`ANeuroThatDoesNotRetainLeavesANewSubscriptionUnseeded` covers every Pinger-based existing fact), then
the full CSharp tests and the architecture ring/state facts.

**Build/test commands:**
```bash
dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj
timeout 300 dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*SubscribedRetentionFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*BrainRuntimeNeuronFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"
```

**git add:** `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs
src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj
src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/RuntimeBrain.cs
src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SignalJson.cs
src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SubscribedRetentionFacts.cs`
**commit:** `The brain runtime seeds a new subscription with its source's retained backlog`

---

## Task S4-4: E2E facts no longer wait for a subscription before posting

**Executor:** DeepSeek - narrow fully-specified edits.

**Files (all in `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/`):**
- Modify `RouterHostFixture.cs`
- Modify `RouterHostFacts.cs`
- Modify `AssistantGateFacts.cs`
- Modify `BrainRuntimeFacts.cs`

**Context.** After S4-1..3, a request is retained by its app until a synapse subscribes, so a fact may
post before the subscription exists. The three waits below exist only to avoid losing a request between
post and subscribe; they are removed. `IDE0005` is disabled, so leftover usings are not build errors,
but remove the now-unused `using DigitalBrain.Microsoft.CSharp.Runtime;` from `RouterHostFixture.cs` for
tidiness.

**Edits.**

`RouterHostFixture.cs` - delete lines 17-28 (the comment and the whole helper):

```csharp
    // A request is a signal, delivered only to a synapse that is already subscribed; a fact waits for
    // the app's synapse before it posts, so the request cannot be lost between.
    internal static Task UntilSynapseSubscribedAsync(E2EBrain brain, string app, string synapse, CancellationToken ct)
    {
        var scope = brain.WorkspaceId;
        var runtime = brain.Get<IBrainRuntime>(BrainRuntimeKeys.For(scope));
        var behavior = $"{scope}/apps/{app}/synapses/{synapse}";
        return TestWait.UntilAsync(async token => (await runtime.Inspect(token)).Behaviors,
            behaviors => behaviors.Any(candidate => candidate.Id == behavior && candidate.Subscriptions.Length > 0),
            TimeSpan.FromMinutes(2), ct);
    }
```

and remove `using DigitalBrain.Microsoft.CSharp.Runtime;` from the file's usings. Keep the fixture's
`StartBrainAsync` and the scripted fake-model helpers (`Fill`, `Choose`, `Text`) untouched.

`RouterHostFacts.cs` - remove this line:

```csharp
        await RouterHostFixture.UntilSynapseSubscribedAsync(Brain, "router", "dispatch.cs", ct);
```

`AssistantGateFacts.cs` - remove both lines:

```csharp
        await RouterHostFixture.UntilSynapseSubscribedAsync(Brain, "assistant", "send.cs", ct);
        await RouterHostFixture.UntilSynapseSubscribedAsync(Brain, "calculator", "calculator.cs", ct);
```

`BrainRuntimeFacts.cs` - remove lines 57-63 (the comment and the inline wait) from
`ARequestReachesASynapseAndItsAnswerIsANeuron`:

```csharp
        // A request is a signal, so it is delivered only to a synapse that is already subscribed. Wait
        // until the imported program's synapse has subscribed, then ask: the request cannot be lost between.
        var runtime = Brain.Get<IBrainRuntime>(BrainRuntimeKeys.For(scope));
        var behavior = $"{scope}/apps/{bundle.Name}/synapses/app.cs";
        await TestWait.UntilAsync(async token => (await runtime.Inspect(token)).Behaviors,
            behaviors => behaviors.Any(candidate => candidate.Id == behavior && candidate.Subscriptions.Length > 0),
            TimeSpan.FromMinutes(2), ct);
```

Both removed blocks were the only other consumer of `TestWait` in these files; `TestWait` and
`BrainRuntimeKeys` come from global/`DigitalBrain` usings, so no remaining `using` goes stale (the
`using DigitalBrain.Microsoft.CSharp.Runtime;` in `BrainRuntimeFacts.cs` stays - `IBrainRuntime`/
`BrainRuntimeKeys` are still used by `Assert.Equal(SessionStatus.Connected, ...)`).

No subscription wait exists anywhere else: `SelfImproveFacts` posts and polls neuron state, and the
Flutter shell neither waits nor subscribes before posting (`ui_client.dart` post is fire-and-forget).

**Verify:** build the E2E project; the run itself is the verification-loop task below (these are
live Aspire tests), but the compile must be clean here.

**Build/test commands:**
```bash
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj
```

**git add:** `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/RouterHostFixture.cs
src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/RouterHostFacts.cs
src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssistantGateFacts.cs
src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs`
**commit:** `E2E facts post requests without waiting for a synapse subscription`

---

## Task S4-5: verification loop (orchestrator + Claude)

**Executor:** Claude - runs the system and reads telemetry.

Per CLAUDE.md, done means seen running. All four tasks above are merged and built; storage volume wiped
(Azurite) because `AppState` reshaped.

1. **Build clean.** LSP diagnostics show no errors in `src/DigitalBrain`,
   `DigitalBrain.Modules.Apps`, `DigitalBrain.Modules.Microsoft.CSharp`, the two test projects; then
   `dotnet build` each affected project with 0 warnings.
2. **Run it.** `aspire run` from `src/DigitalBrain.AppHost`. Call `mcp__aspire__list_resources`: every
   resource must be Running/Healthy (the OS, the csharp-sandbox container, Postgres, Qdrant, Azurite).
   If one is not, read `list_console_logs` for it before anything else.
3. **Drive it through `digitalbrain-mcp`** (`localhost:5081/mcp`; `/brains/{brainId}/mcp` selects a
   brain):
   - `neurons_context`: confirm the caller and brain.
   - `neurons_search` / `neurons_list` for the `apps.app2` contract: find the app neuron and the brain
     runtime (`microsoft.csharp.runtime`) at `{brainId}/runtime`.
   - `neurons_call` `IApp.Request` on an installed app whose synapse reacts to `AppRequested` (e.g. the
     calculator: `{brainId}/apps/calculator`, `Request`, `["open", ""]`) posted immediately, then read
     back the answer neuron's state. Because `Subscribed` was already established, this proves live
     delivery still works end to end; the late-subscribe path is proven by Task S4-3's facts and the
     E2E suite below.
   - `neurons_get` the brain runtime and confirm the subscription for `{brainId}/apps/calculator` +
     `AppRequested` reports a pending backlog that drains after the sandbox reacts.
4. **Confirm in telemetry.** `list_traces` should show `IApp.Request` publishing `AppRequested`
   (span on `apps.app2`), then `IBrainRuntimeArrivals.Arrived` (span on the runtime) after seeding,
   and the sandbox reaction span; `list_trace_structured_logs` on that trace shows the publish,
   the seed, and the synapse reaction. If the traces do not include the arrival, the change is not done.
5. **Regression net.** Run the E2E suite that exercises the removed waits and the retained path:
   `RouterHostFacts.ARequestRoutesThroughJevAndStartsTheTimer`,
   `AssistantGateFacts.OpenCalculatorIsDispatchedByJevWithoutAnAgentTurn`,
   `BrainRuntimeFacts.ARequestReachesASynapseAndItsAnswerIsANeuron`, plus the Apps and CSharp unit
   suites from Tasks S4-2 and S4-3.

```bash
timeout 300 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
timeout 300 dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
# E2E (Aspire live: RouterHostFixture / ReferenceBrainFixture)
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*RouterHostFacts*"
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*AssistantGateFacts*"
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*BrainRuntimeFacts*"
```

**git add:** none (verification only; report the aspire/mcp/telemetry output).

---

## Open questions

1. **The lost-publish race at seeding.** The plan seeds watch-first-then-save, so a request published
   between the retention snapshot and the watch registration is delivered through the watch instead of
   lost; the merge may then deliver it twice. At-least-once plus the synapse's dedup makes the duplicate
   acceptable. Confirm the spec's "dedup stays the synapse's job" covers this duplicate shape.
2. **The exact exception for non-retaining sources.** The guard catches `InvalidCastException`, per
   Orleans's documented failure when a grain reference is invoked against an interface the target grain
   does not implement. If the running build surfaces another exception type (a build of the dispatcher
   that reports `MissingMethodException`), broaden the catch in `SeedRetainedAsync`; the behavior
   contract is unchanged.
3. **Signal-name matching.** `Retained(signal, ...)` matches the runtime's stored type-name semantics
   (`typeof(T).Name`, e.g. `AppRequested`), not the alias. This keeps the vocabulary shape free of the
   client protocol; if a future retention wants alias matching, the filtering moves into the runtime.
4. **Cap alignment.** The app's retention cap (64) equals `CSharpOptions.MaximumPending` (64). A host
   configured below 64 would hold a seeded pending larger than its arrival cap; delivery is unaffected
   (the cap only guards `Arrive`), and the first overflow drop counts on the next live arrival. No code
   change unless misconfiguration becomes real.
5. **Merge with sections 2 and 1.** Section 2 touches `AssistantGateFacts.cs` / `RouterHostFixture.cs`
   and section 1 touches `AppNeuron.cs`; each runs before section 4, so Task S4-4 rebases onto section
   2's final files and `AppNeuron.cs` merges by hand. The orchestrator owns both.