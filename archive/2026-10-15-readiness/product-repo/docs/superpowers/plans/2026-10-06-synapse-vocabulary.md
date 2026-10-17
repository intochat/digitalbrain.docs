# Synapse Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/DigitalBrain` the literal four words by adding `ISynapse`, shrinking `IDigitalBrain` to resolve-and-watch, moving brain signals into the ring, and renaming app `behaviors/` to `synapses/`.

**Architecture:** Three commits, each green on its own. Commit 1 reshapes the ring and moves subscription handles to Framework (`ISignalSubscription<T>`, `IBrainSubscriptions`) and rewrites every caller to `IDigitalBrain.On<T>`. Commit 2 adds `ISynapse` and makes `ICSharpFile` its C# dialect (`Read` returns `SynapseSnapshot`, the rich view is `Inspect`). Commit 3 renames the bundle folder, prompts and first-party apps and adds `list_synapses`.

**Tech Stack:** .NET 11 RC, Orleans (grain interfaces, `[GenerateSerializer]`, `[Alias]`), xUnit v3 (`TestContext.Current.CancellationToken`), the module test harness `ModuleTest.Create().WithModule<…>()`, `FakeSandbox`, Aspire for the verification loop.

**Spec:** `docs/superpowers/specs/2026-10-06-synapse-vocabulary-design.md`

## Global Constraints

- LSP for all symbol work: `findReferences` before each rename, diagnostics clean before each build. Never grep for code.
- Build and test per project, never the `.slnx`: `dotnet build <csproj>`, `dotnet test --project <dir>`.
- Warnings are errors, nullable on, central package versions. No `/// <summary>` boilerplate.
- Concrete arrays in grain state and wire records (`SynapseWatch[]`, never `IReadOnlyList`).
- No state compatibility: aliases and shapes may change freely; no migrations.
- Vocabulary ring references only `Microsoft.Orleans.Core.Abstractions` (pinned by `VocabularyReferencesOnlyAbstractions`).
- The ring holds no handles: no public type derives from `IAsyncDisposable`/`IDisposable`, no member returns one.
- `IDigitalBrain` has exactly two members: `Get<T>` (`where T : class, INeuron`) and `On<T>` (`IAsyncEnumerable<T>`).
- `ISynapse.Read` returns `SynapseSnapshot`; the C# rich view is `Inspect`. No method hiding on any neuron contract.
- Synapse keys match `*/synapses/*` for Apps-owned synapses; standalone catalog files keep hashed keys.
- The registry (`IRegistry`, providers, `TimeInventory`) is untouched.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A script that `break`s out of `await foreach (… in brain.On<T>(…))` must close its SSE stream and HTTP response; otherwise every early exit leaks a connection. Pinned in Task 3.
2. `ICSharpFile` now exposes both `Read` (from `ISynapse`) and `Inspect`; the script edge must dispatch each unambiguously, and a script calling `Read` on an `ICSharpFile` proxy must get a `SynapseSnapshot`. Pinned in Task 7.
3. An armed synapse that is waiting (no live run) must report `Alive = false` and its trigger as a watch; a reader must not conclude the synapse is dead or detached. Pinned in Task 7.
4. `WriteBehavior` called with the old `behaviors/` path must be refused with a message naming `synapses/`, so an outdated Creator prompt fails loudly instead of deploying nothing. Pinned in Task 8.
5. On the Orleans client, a consumer that cancels mid-stream must leave no subscription in `BrainClient`'s tracked set, or disposal of the client hangs on dead subscriptions. Pinned in Task 2.

---

### Task 1: Pin the ring's new shape in architecture facts

**Files:**
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs`

**Interfaces:**
- Produces: the failing facts that Tasks 2 and 6 make pass. Root set `[INeuron, IBrain, ISynapse, IDigitalBrain, INeuronObserver]`.

- [ ] **Step 1: Replace the roots and add three facts**

In `VocabularyRingFacts.cs` change the `Roots` line to:

```csharp
private static readonly Type[] Roots = [typeof(INeuron), typeof(IBrain), typeof(ISynapse), typeof(IDigitalBrain), typeof(INeuronObserver)];
```

Add after `VocabularyReferencesOnlyAbstractions`:

```csharp
[Fact]
public void TheRingHoldsNoHandles()
{
    var offenders = PublicTypes()
        .Where(t => typeof(IAsyncDisposable).IsAssignableFrom(t) || typeof(IDisposable).IsAssignableFrom(t)
            || t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Any(m => typeof(IAsyncDisposable).IsAssignableFrom(Unwrap(m.ReturnType).First()) || typeof(IDisposable).IsAssignableFrom(Unwrap(m.ReturnType).First())))
        .Select(t => t.FullName!).Order().ToArray();
    Assert.True(offenders.Length == 0, "Ring types that are or return handles:\n" + string.Join("\n", offenders));
}

[Fact]
public void TheBrainSeenByAProgramHasExactlyResolveAndWatch()
{
    var members = typeof(IDigitalBrain).GetMethods().Select(m => m.Name).Order().ToArray();
    Assert.Equal(["Get", "On"], members);
    Assert.False(typeof(IAsyncDisposable).IsAssignableFrom(typeof(IDigitalBrain)));
    var get = typeof(IDigitalBrain).GetMethod("Get")!;
    Assert.Contains(typeof(INeuron), get.GetGenericArguments()[0].GetGenericParameterConstraints());
}

[Fact]
public void EverySynapseContractCarriesAnAlias()
{
    var offenders = Ring.SelectMany(a => a.GetExportedTypes())
        .Where(t => t.IsInterface && typeof(ISynapse).IsAssignableFrom(t) && t.GetCustomAttribute<AliasAttribute>() is null)
        .Select(t => t.FullName!).Order().ToArray();
    Assert.True(offenders.Length == 0, "Synapse contracts without an alias:\n" + string.Join("\n", offenders));
}
```

- [ ] **Step 2: Build the test project and confirm it fails to compile on `ISynapse`**

Run: `dotnet build src/Testing/DigitalBrain.Architecture.Tests/DigitalBrain.Architecture.Tests.csproj`
Expected: error CS0246 `ISynapse` not found. Leave it red; Task 2 and Task 6 turn it green. Do not commit yet.

---

### Task 2: Reshape the ring and the Orleans client

**Files:**
- Create: `src/DigitalBrain/Brain/IBrain.cs`, `src/DigitalBrain/Brain/BrainSnapshot.cs`, `src/DigitalBrain/Brain/EstablishBrain.cs`, `src/DigitalBrain/Brain/Signals/Activated.cs`, `src/DigitalBrain/Brain/Signals/NeuronActivity.cs`, `src/DigitalBrain/Brain/Signals/NeuronActivated.cs`, `src/DigitalBrain/Brain/Signals/NeuronDeactivated.cs`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/ISignalSubscription.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/IBrainSubscriptions.cs`
- Delete: `src/DigitalBrain/IBrain.cs`, `src/DigitalBrain/ISignalSubscription.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/NeuronActivity.cs`, `…/NeuronActivated.cs`, `…/NeuronDeactivated.cs`
- Modify: `src/DigitalBrain/IDigitalBrain.cs`, `src/DigitalBrain/DigitalBrain.csproj`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Neuron.cs`, `LocalSignalHub.cs`, `Hosting/BrainHosting.cs`, `Brain/BrainNeuron.cs`
- Modify: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans/BrainClient.cs`, `BrainClientHosting.cs`, `SignalSubscription.cs`
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/SubscriptionLifetimeFacts.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RuntimeSignalFacts.cs`, `LocalObserverFacts.cs`

**Interfaces:**
- Produces:
  - `DigitalBrain.IDigitalBrain { T Get<T>(string id) where T : class, INeuron; IAsyncEnumerable<T> On<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal; }`
  - `DigitalBrain.Framework.ISignalSubscription<T> : IAsyncDisposable { Task Completion { get; } IAsyncEnumerable<T> ReadAllAsync(CancellationToken ct = default); }`
  - `DigitalBrain.Framework.IBrainSubscriptions { Task<ISignalSubscription<T>> SubscribeAsync<T>(INeuron source, CancellationToken ct = default) where T : Signal; }`
  - Brain signals `DigitalBrain.Activated`, `DigitalBrain.NeuronActivity`, `DigitalBrain.NeuronActivated`, `DigitalBrain.NeuronDeactivated` (namespace `DigitalBrain`, unchanged aliases).

- [ ] **Step 1: Write the failing Orleans-client fact**

Append to `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/SubscriptionLifetimeFacts.cs` (same class, reuse its existing cluster/brain setup helpers as the neighbouring facts do):

```csharp
[Fact]
public async Task OnClosesItsSubscriptionWhenTheConsumerCancelsMidStream()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await Options().StartAsync(ct);
    var source = brain.Get<ITestEmitter>("on-cancel");
    using var consumer = CancellationTokenSource.CreateLinkedTokenSource(ct);
    var first = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var reading = Task.Run(async () =>
    {
        await foreach (var _ in brain.On<Number>(source, consumer.Token)) { first.TrySetResult(); }
    }, ct);
    await source.Emit(1);
    await first.Task.WaitAsync(TimeSpan.FromSeconds(10), ct);
    consumer.Cancel();
    await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reading);
    var client = (BrainClient)brain.Client();
    Assert.Equal(0, client.TrackedSubscriptions);
}
```

`ITestEmitter`/`Number` are declared in that project's `TestNeurons.cs`; `Options()` is the file's existing builder helper; `brain.Client()` is the `BrainSimulationExtensions` accessor returning the inner `IDigitalBrain` (the `BrainClient`). Add `internal int TrackedSubscriptions { get { lock (_gate) { return _subscriptions.Count; } } }` to `BrainClient` in Step 3 (the test project already has `InternalsVisibleTo`; if not, add `<InternalsVisibleTo Include="DigitalBrain.Client.Orleans.Tests.Unit" />` to the Client.Orleans csproj).

- [ ] **Step 2: Run it to see it fail**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*OnClosesItsSubscription*"`
Expected: compile error, `IDigitalBrain` has no `On`.

- [ ] **Step 3: Reshape the ring**

`src/DigitalBrain/IDigitalBrain.cs`:

```csharp
namespace DigitalBrain;

// The brain as a program sees it: resolve a neuron, watch a neuron. No handles; the loop is the connection.
public interface IDigitalBrain
{
    T Get<T>(string id) where T : class, INeuron;
    IAsyncEnumerable<T> On<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal;
}
```

Delete `src/DigitalBrain/ISignalSubscription.cs`. Delete `src/DigitalBrain/IBrain.cs` and create:

`src/DigitalBrain/Brain/IBrain.cs`:
```csharp
namespace DigitalBrain;

[Alias("brain"), Orleans.Metadata.DefaultGrainType("brain")]
public interface IBrain : INeuron
{
    Task<BrainSnapshot> Read();
    Task<BrainSnapshot> Establish(EstablishBrain request);
}
```

`src/DigitalBrain/Brain/BrainSnapshot.cs`:
```csharp
namespace DigitalBrain;

[GenerateSerializer, Alias("brain.snapshot")]
public sealed record BrainSnapshot
{
    [Id(0)] public required string BrainId { get; init; }
    [Id(1)] public required string Name { get; init; }
    [Id(2)] public required string OwnerAccountId { get; init; }
    [Id(3)] public DateTimeOffset EstablishedAt { get; init; }
}
```

`src/DigitalBrain/Brain/EstablishBrain.cs`:
```csharp
namespace DigitalBrain;

[GenerateSerializer, Alias("brain.establish")]
public sealed record EstablishBrain([property: Id(0)] string Name, [property: Id(1)] string OwnerAccountId);
```

`src/DigitalBrain/Brain/Signals/Activated.cs`:
```csharp
namespace DigitalBrain;

// Published when an established brain wakes: once right after Establish, and again on every
// later activation. Handlers are idempotent; this is the signal the operating system itself
// boots on, and any app can subscribe to it the same way.
[GenerateSerializer, Alias("brain.activated")]
public sealed record Activated(
    [property: Id(0)] string BrainId,
    [property: Id(1)] string OwnerAccountId,
    [property: Id(2)] string Name) : Signal;
```

`src/DigitalBrain/Brain/Signals/NeuronActivity.cs`, `NeuronActivated.cs`, `NeuronDeactivated.cs`: the three records from `src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/` moved verbatim with `namespace DigitalBrain;`. Delete the Framework copies. `ModuleLoaded.cs` and `ILocalSignalHub.cs` stay in Framework.

`src/DigitalBrain/DigitalBrain.csproj` description: `<Description>Neuron, signal, synapse, brain.</Description>`.

- [ ] **Step 4: Framework handles**

`src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/ISignalSubscription.cs`:
```csharp
namespace DigitalBrain.Framework;

public interface ISignalSubscription<T> : IAsyncDisposable where T : Signal
{
    Task Completion { get; }
    IAsyncEnumerable<T> ReadAllAsync(CancellationToken cancellationToken = default);
}
```

`src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/IBrainSubscriptions.cs`:
```csharp
namespace DigitalBrain.Framework;

// Silo code and the test harness that need a handle (completion, explicit disposal). Programs use IDigitalBrain.On.
public interface IBrainSubscriptions
{
    Task<ISignalSubscription<T>> SubscribeAsync<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal;
}
```

Use LSP `findReferences` on `NeuronActivity`, `NeuronActivated`, `NeuronDeactivated`, `Activated`: in `Neuron.cs`, `LocalSignalHub.cs`, `Hosting/BrainHosting.cs`, `Brain/BrainNeuron.cs`, `Framework.Tests.Unit/RuntimeSignalFacts.cs`, `LocalObserverFacts.cs`, and the two CSharp tests `ContractCatalogFacts.cs`, `TypeSearchFacts.cs` drop `using DigitalBrain.Framework.Signals;` where it only served those types (keep it where `ModuleLoaded`/`ILocalSignalHub` are used).

- [ ] **Step 5: Orleans client**

`BrainClient.cs` becomes:

```csharp
using System.Runtime.CompilerServices;
using DigitalBrain;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Signals;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Client.Orleans;

internal sealed class BrainClient(IClusterClient cluster, IOptions<SubscriptionOptions> options, ILogger<BrainClient> logger, ILocalSignalHub? hub = null)
    : IDigitalBrain, IBrainSubscriptions, IAsyncDisposable
{
    private readonly Lock _gate = new();
    private readonly HashSet<IAsyncDisposable> _subscriptions = [];
    private bool _disposed;

    internal int TrackedSubscriptions { get { lock (_gate) { return _subscriptions.Count; } } }

    public T Get<T>(string id) where T : class, INeuron => cluster.GetGrain<T>(id);

    public async IAsyncEnumerable<T> On<T>(INeuron source, [EnumeratorCancellation] CancellationToken cancellationToken = default) where T : Signal
    {
        await using var subscription = await SubscribeAsync<T>(source, cancellationToken).ConfigureAwait(false);
        await foreach (var signal in subscription.ReadAllAsync(cancellationToken).ConfigureAwait(false)) { yield return signal; }
    }

    public async Task<ISignalSubscription<T>> SubscribeAsync<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal
    {
        // body unchanged from today
    }

    // Remove and DisposeAsync unchanged
}
```

`SignalSubscription.cs`: its `: ISignalSubscription<T>` now resolves to the Framework type (`using DigitalBrain.Framework;`).

`BrainClientHosting.AddDigitalBrainClient`:
```csharp
services.TryAddSingleton<BrainClient>();
services.TryAddSingleton<IDigitalBrain>(provider => provider.GetRequiredService<BrainClient>());
services.TryAddSingleton<IBrainSubscriptions>(provider => provider.GetRequiredService<BrainClient>());
```

- [ ] **Step 6: Build the four projects and run the fact**

Run:
```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj && dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj && dotnet build src/DigitalBrain.Client/DigitalBrain.Client.Orleans/DigitalBrain.Client.Orleans.csproj
```
Expected: ring and Framework build. Client.Orleans may still fail on `DigitalBrain.Client.Orleans.Tests.Unit` consumers only after Task 4; the library itself builds.

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*OnClosesItsSubscription*"`
Expected: PASS. Existing facts in that project that call `brain.SubscribeAsync` compile because `BrainClient` still implements it; if a fact holds the brain as `IDigitalBrain`, cast to `IBrainSubscriptions`.

Do not commit yet (the tree does not build end to end until Task 4).

---

### Task 3: Script client: `On<T>` is the only watching verb

**Files:**
- Modify: `src/DigitalBrain.Client/DigitalBrain.Client/DigitalBrainConnection.cs`, `src/DigitalBrain.Client/DigitalBrain.Client/Edge/EdgeSignalSubscription.cs`
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit/EdgeSignalFacts.cs`

**Interfaces:**
- Consumes: `IDigitalBrain` from Task 2.
- Produces: `DigitalBrainConnection : IDigitalBrain, IAsyncDisposable` with `Get<T>`, `On<T>`, `Setting`, `Trigger<T>`, `Stopping`. `EdgeSignalSubscription<T>` stays internal and gains a public-to-assembly `bool IsOpen` for tests.

- [ ] **Step 1: Write the failing fact**

Append to `EdgeSignalFacts`:

```csharp
[Fact]
public async Task BreakingOutOfOnClosesTheStream()
{
    var ct = TestContext.Current.CancellationToken;
    var events = string.Concat(Enumerable.Range(0, 3).Select(i => $"event: {ScriptEdgeProtocol.SignalEvent}\ndata: {{\"value\":{i}}}\n\n"));
    var handler = new Handler(events);
    using var http = new HttpClient(handler) { BaseAddress = new("https://example.test") };
    var connection = DigitalBrainConnection.ForTests(http);
    var source = connection.Get<ISource>("source");
    await foreach (var signal in connection.On<Changed>(source, ct)) { Assert.Equal(0, signal.Value); break; }
    Assert.True(handler.Disposed, "the SSE response must be disposed when the consumer breaks out");
}
```

Extend the fact file's `Handler`: give the returned `HttpResponseMessage` a content whose stream reports disposal. Replace `Handler` with:

```csharp
private sealed class Handler(string events) : HttpMessageHandler
{
    public bool Disposed { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(events);
        var content = new StreamContent(new Observed(bytes, () => Disposed = true));
        content.Headers.ContentType = new("text/event-stream");
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
    }
    private sealed class Observed(byte[] bytes, Action onDispose) : MemoryStream(bytes)
    {
        protected override void Dispose(bool disposing) { onDispose(); base.Dispose(disposing); }
    }
}
```

Add to `DigitalBrainConnection`: `internal static DigitalBrainConnection ForTests(HttpClient http) => new(new ConfigurationBuilder().Build(), http);` (the test project already has `InternalsVisibleTo`).

- [ ] **Step 2: Run it to see it fail**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit -- --filter-method "*BreakingOutOfOn*"`
Expected: compile error on `ForTests`, then after adding it, the fact fails only if the stream is not disposed. It should pass once `On` disposes the subscription; verify it is red first by temporarily returning before the `await using`.

- [ ] **Step 3: Implement**

In `DigitalBrainConnection`:
- Class declaration: `public sealed class DigitalBrainConnection : IDigitalBrain, IAsyncDisposable`.
- `Get<T>`: constraint `where T : class, INeuron`.
- Delete `SubscribeAsync`. `On<T>` becomes:

```csharp
public async IAsyncEnumerable<T> On<T>(INeuron source, [EnumeratorCancellation] CancellationToken cancellationToken = default) where T : Signal
{
    if (source is not NeuronProxy neuron) { throw new ArgumentException("Watch a neuron obtained from this connection's Get.", nameof(source)); }
    await using var subscription = await EdgeSignalSubscription<T>.OpenAsync(_edge, neuron, cancellationToken).ConfigureAwait(false);
    await foreach (var signal in subscription.ReadAllAsync(cancellationToken).ConfigureAwait(false)) { yield return signal; }
}
```

In `EdgeSignalSubscription<T>`: drop `: ISignalSubscription<T>` (keep the members; the class is internal and self-describing). `OpenAsync` returns `Task<EdgeSignalSubscription<T>>`.

- [ ] **Step 4: Run the Client unit suite**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit`
Expected: all PASS, including the two existing `EdgeSignalFacts` (they call `OpenAsync` directly and still compile).

Do not commit yet.

---

### Task 4: Every caller of the old session shape

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppInvocations.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Workspace/WorkspaceEndpoints.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/ScriptEdge.cs`, `Authoring/CSharpScriptSandbox.cs`, `Samples/timer-report.cs`
- Modify: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/Tools/NeuronTools.cs`
- Modify: `src/Testing/DigitalBrain.Testing/BrainTestExtensions.cs`, `Observation/BehaviorRun.cs`, `Observation/SignalProbe.cs`
- Modify: `src/Testing/DigitalBrain.Testing.Module/Host/ModuleBrain.cs`, `src/Testing/DigitalBrain.Testing.E2E/Host/E2EBrain.cs`, `Hosted/AspireTestSession.cs`
- Modify: every other file LSP `findReferences` lists for `IDigitalBrain.SubscribeAsync` and `ISignalSubscription<T>` (known today: `Supabase/Windows/TableEndpoints.cs`, `Supabase/Windows/LiveTableWindows.cs`, `Flutter/Shared/AppUiEndpoints.cs`, `Apps/AppsEndpoints.cs`, `Assistant/AgentEndpoints.cs`, `Compute/ComputeEndpoints.cs`, `Platform/Identity/IdentityEndpoints.cs`, and the tests that observe signals).

**Interfaces:**
- Consumes: `IDigitalBrain.On<T>`, `IBrainSubscriptions.SubscribeAsync<T>` from Task 2.

- [ ] **Step 1: Map with LSP**

Run LSP `findReferences` on `IDigitalBrain` (`src/DigitalBrain/IDigitalBrain.cs`) and on `ISignalSubscription` (`src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/ISignalSubscription.cs`). Record the full list in the task's working notes; every site below plus any new one it reveals is in scope.

- [ ] **Step 2: Contracts helper**

`AppInvocations.Invocations` body:

```csharp
// Subscribe before recovery so a new invocation cannot fall between the two paths: On opens its
// stream (and the brain acknowledges it) before the first MoveNext returns, and we only call
// Pending after priming that enumerator.
await using var live = brain.On<AppInvoked>(app, cancellationToken).GetAsyncEnumerator(cancellationToken);
var first = live.MoveNextAsync();
var pending = await app.Pending();
var recovered = pending.Select(x => x.Id).ToHashSet();
foreach (var invocation in pending) { yield return new(invocation.Id, invocation.Operation, invocation.Input); }
while (await first)
{
    var invoked = live.Current;
    first = live.MoveNextAsync();
    if (recovered.Remove(invoked.InvocationId)) { continue; }
    if ((await app.Pending()).Any(current => current.Id == invoked.InvocationId)) { yield return invoked; }
}
```

Note for the implementer: `EdgeSignalSubscription.OpenAsync` returns only after the edge's `ready` event, and the edge registers the durable subscription before sending it (`ScriptEdge.OpenSignalsAsync`). The first `MoveNextAsync` therefore awaits that registration before awaiting a signal, which keeps the ordering guarantee. Add that sentence as the comment above; keep it true.

- [ ] **Step 3: Silo endpoints use `On`**

`WorkspaceEndpoints.Events`:
```csharp
var initial = await workspace.Read().WaitAsync(ct);
http.Response.ContentType = "text/event-stream";
http.Response.Headers.CacheControl = "no-cache";
var brainId = CallerContextStamper.Require().BrainId;
await Write(initial.Revision);
await foreach (var change in digitalBrain.On<WorkspaceChanged>(workspace, ct)) { await Write(change.Revision); }
```
Wait: the original subscribed before `Read` so a change between read and subscribe is not lost. Keep that order by priming the enumerator exactly as in Step 2:
```csharp
await using var changes = digitalBrain.On<WorkspaceChanged>(workspace, ct).GetAsyncEnumerator(ct);
var next = changes.MoveNextAsync();
var initial = await workspace.Read().WaitAsync(ct);
… await Write(initial.Revision);
while (await next) { await Write(changes.Current.Revision); next = changes.MoveNextAsync(); }
```
Apply the same prime-then-read shape to every endpoint on the LSP list that subscribed before an initial read. Endpoints that only streamed may use plain `await foreach`.

- [ ] **Step 4: Script edge keeps its handle**

`ScriptEdge` constructor: `(RunTokens tokens, ScriptContracts contracts, IGrainFactory grains, IBrainSubscriptions subscriptions)`; the doorbell line becomes `await subscriptions.SubscribeAsync<Signal>(…)`. `Draining` keeps its `ISignalSubscription<Signal>` parameter with `using DigitalBrain.Framework;`.

`CSharpScriptSandbox.AuthoringDescription` invocation-answering shape becomes:
```
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(brain.Setting("App")!);
await foreach (var invoked in app.Invocations(brain, brain.Stopping)) { await app.Respond(Answer(invoked.InvocationId, invoked.Input)); }
```

`Samples/timer-report.cs`: replace the subscribe/ReadAllAsync pair with `await foreach (var tick in brain.On<TimerTick>(timer, brain.Stopping))`.

- [ ] **Step 5: MCP tools**

`NeuronTools`: `GetNeuron` reflection stays; it calls `IDigitalBrain.Get<T>` with neuron contract types, which satisfy the new `INeuron` constraint. Build will confirm; no code change expected.

- [ ] **Step 6: Testing harness**

`BrainTestExtensions.Observe<T>`:
```csharp
public static async Task<SignalProbe<T>> Observe<T>(this IDigitalBrain brain, INeuron source, CancellationToken cancellationToken = default) where T : Signal
{
    ArgumentNullException.ThrowIfNull(brain);
    var subscriptions = brain as IBrainSubscriptions ?? throw new ArgumentException("Observe needs a brain that hands out subscription handles (the test harness brains do).", nameof(brain));
    var subscription = await subscriptions.SubscribeAsync<T>(source, cancellationToken).ConfigureAwait(false);
    …
}
```
`SignalProbe<T>`: `using DigitalBrain.Framework;` for `ISignalSubscription<T>`.

`BehaviorRun.ObservedBrain` implements `IDigitalBrain, IBrainSubscriptions`, wrapping an inner that is both (`inner as IBrainSubscriptions` resolved once in the constructor, throwing the same message as above if absent):
```csharp
public T Get<T>(string id) where T : class, INeuron => inner.Get<T>(id);
public async IAsyncEnumerable<T> On<T>(INeuron source, [EnumeratorCancellation] CancellationToken cancellationToken = default) where T : Signal
{
    await using var subscription = await SubscribeAsync<T>(source, cancellationToken).ConfigureAwait(false);
    await foreach (var signal in subscription.ReadAllAsync(cancellationToken).ConfigureAwait(false)) { yield return signal; }
}
public async Task<ISignalSubscription<T>> SubscribeAsync<T>(INeuron source, CancellationToken cancellationToken = default) where T : Signal
{
    var subscription = await subscriptions.SubscribeAsync<T>(source, cancellationToken).ConfigureAwait(false);
    Ready(source.GetGrainId(), typeof(T)).TrySetResult();
    return subscription;
}
```
Remove `DisposeAsync` from `ObservedBrain` (the interface no longer requires it; `BehaviorRun` itself stays disposable).

`ModuleBrain` and `E2EBrain`: declare `: IDigitalBrain, IBrainSubscriptions, IAsyncDisposable, ITrackedBrain`; `Get<T>` constraint `INeuron`; add `On<T>` delegating to the inner `IDigitalBrain.On`; keep `SubscribeAsync` delegating to the inner resolved as `IBrainSubscriptions` (in `ModuleBrain`, resolve `cluster.Client.ServiceProvider.GetRequiredService<IBrainSubscriptions>()` next to the existing `IDigitalBrain` lookup; in `E2EBrain`, `_session.Brain` must expose both, so `AspireTestSession.Brain` becomes typed as `BrainClient`-equivalent via two properties `Brain` and `Subscriptions`).

- [ ] **Step 7: Build every touched project, then the suites**

Run, in order:
```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
dotnet build src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj
dotnet build src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj
dotnet build src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
```
Expected: all build. Fix any site the LSP list contained that the compiler still flags.

Run:
```bash
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Testing.Module.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit
```
Expected: Architecture still fails only `EverySynapseContractCarriesAnAlias` and the roots fact (no `ISynapse` yet) — those turn green in Task 6; everything else PASS. If Architecture cannot compile at all, temporarily keep `typeof(ISynapse)` out of `Roots` and the alias fact commented with `// Task 6` and restore both in Task 6.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Ring: IDigitalBrain is resolve and watch; handles move to Framework; brain signals live in the ring

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: First-party programs watch with `On`

**Files:**
- Modify: `src/DigitalBrain.OS/Apps/DataVisualizer/behaviors/run-on-change.cs`, `run-on-filter.cs`, `run-on-row.cs`, `run-on-tick.cs`
- Modify: `src/DigitalBrain.OS/Apps/Settings/behaviors/app.cs`, `src/IntoChat/Apps/WordCount/behaviors/app.cs`
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ShippedAppVerificationFacts.cs` (existing; it is the gate for shipped bundles)

**Interfaces:**
- Consumes: `brain.On<T>(source, ct)` and `app.Invocations(brain, ct)`.

- [ ] **Step 1: Invocation loops**

`Settings/behaviors/app.cs` and `WordCount/behaviors/app.cs`: replace the three lines (subscribe, replay `Pending`, `ReadAllAsync` loop) with one loop; `Invocations` already recovers pending first:

```csharp
await foreach (var invoked in app.Invocations(brain, brain.Stopping)) { await app.Respond(await Answer(invoked.InvocationId, invoked.Operation)); }
```
(WordCount: `Count(invoked.InvocationId, invoked.Input)`.)

- [ ] **Step 2: DataVisualizer pumps**

In each `run-on-*.cs`, the `registryChanges` subscription becomes `await foreach (var _ in brain.On<TextChanged>(registry, brain.Stopping)) { … }` with the same body the `ReadAllAsync` loop had. The `Pump<T>` helper in `run-on-filter.cs`, `run-on-row.cs`, `run-on-tick.cs` becomes:

```csharp
Task Pump<T>(INeuron source, string id, CancellationToken ct) where T : Signal => Task.Run(async () =>
{
    while (!ct.IsCancellationRequested)
    {
        try { await foreach (var _ in brain.On<T>(source, ct)) { await RunView(id); } }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
        catch (Exception error) { Console.WriteLine($"{typeof(T).Name} stream of {source} stopped, rewatching: {error.Message}"); }
        await Task.Delay(TimeSpan.FromSeconds(1), ct).ContinueWith(_ => { });
        if (!ct.IsCancellationRequested) { try { await RunView(id); } catch (Exception error) { Console.WriteLine($"rerun after rewatch failed: {error.Message}"); } }
    }
}, CancellationToken.None);
```
Call sites that did `await Pump<…>(…)` keep awaiting (it returns the started task immediately as before).

- [ ] **Step 3: Compile the bundles the way the brain does**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: PASS (bundle facts read the folders; no `SubscribeAsync` left: `grep -rn "SubscribeAsync" src/DigitalBrain.OS/Apps src/IntoChat/Apps src/DigitalBrain.Modules/Microsoft/CSharp/Samples` prints nothing).

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*ShippedApp*"`
Expected: PASS; each shipped bundle builds in the sandbox and goes live. If a bundle fails to compile, the test output names the file and line.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Apps: first-party programs watch with On and recover through Invocations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `ISynapse` in the ring

**Files:**
- Create: `src/DigitalBrain/Synapse/ISynapse.cs`, `src/DigitalBrain/Synapse/SynapseSnapshot.cs`, `src/DigitalBrain/Synapse/SynapseWatch.cs`, `src/DigitalBrain/Synapse/Signals/SynapseChanged.cs`
- Test: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs` (from Task 1)

**Interfaces:**
- Produces:
  - `DigitalBrain.ISynapse : INeuron { Task<SynapseSnapshot> Read(CancellationToken = default); Task Write(string program, CancellationToken = default); Task<SynapseSnapshot> Start(CancellationToken = default); Task<SynapseSnapshot> Stop(CancellationToken = default); Task Delete(CancellationToken = default); }`
  - `SynapseSnapshot(string Id, string Program, bool Alive, SynapseWatch[] Watches, string? LastError)`
  - `SynapseWatch(string Neuron, string Signal, int Pending)`
  - `SynapseChanged(string SynapseId) : Signal`

- [ ] **Step 1: Write the four files**

`Synapse/ISynapse.cs`:
```csharp
namespace DigitalBrain;

// A durable connection with a program: it watches neurons and acts through neuron contracts,
// lives in its brain and survives every process. Dialects (a C# file, later others) derive from it.
[Alias("synapse")]
public interface ISynapse : INeuron
{
    Task<SynapseSnapshot> Read(CancellationToken cancellationToken = default);
    Task Write(string program, CancellationToken cancellationToken = default);
    // Starting may build a sandbox on any runtime; the timeout is the word's, not a dialect's.
    [ResponseTimeout("00:05:00")] Task<SynapseSnapshot> Start(CancellationToken cancellationToken = default);
    [ResponseTimeout("00:05:00")] Task<SynapseSnapshot> Stop(CancellationToken cancellationToken = default);
    [ResponseTimeout("00:05:00")] Task Delete(CancellationToken cancellationToken = default);
}
```

`Synapse/SynapseSnapshot.cs`:
```csharp
namespace DigitalBrain;

[GenerateSerializer, Alias("synapse.snapshot")]
public sealed record SynapseSnapshot(
    [property: Id(0)] string Id,
    [property: Id(1)] string Program,
    [property: Id(2)] bool Alive,
    [property: Id(3)] SynapseWatch[] Watches,
    [property: Id(4)] string? LastError);
```

`Synapse/SynapseWatch.cs`:
```csharp
namespace DigitalBrain;

// Neuron is the watched neuron's grain id ("time.timer/tea"); Signal is the signal type's name ("TimerTick").
[GenerateSerializer, Alias("synapse.watch")]
public sealed record SynapseWatch([property: Id(0)] string Neuron, [property: Id(1)] string Signal, [property: Id(2)] int Pending);
```

`Synapse/Signals/SynapseChanged.cs`:
```csharp
namespace DigitalBrain;

[GenerateSerializer, Alias("synapse.changed")]
public sealed record SynapseChanged([property: Id(0)] string SynapseId) : Signal;
```

- [ ] **Step 2: Build the ring and run the architecture facts**

Run: `dotnet build src/DigitalBrain/DigitalBrain.csproj && dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: PASS, including `EveryPublicVocabularyTypeIsANeuronContractASignalOrAShapeTheyCarry` (the snapshot and watch are reachable from `ISynapse`), `TheRingHoldsNoHandles`, `TheBrainSeenByAProgramHasExactlyResolveAndWatch`, `EverySynapseContractCarriesAnAlias`. If Task 4 left `ISynapse` commented out of `Roots`, restore it now.

- [ ] **Step 3: Commit**

```bash
git add src/DigitalBrain src/Testing/DigitalBrain.Architecture.Tests
git commit -m "Ring: ISynapse, the fourth word's type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The C# file is a synapse

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/ICSharpFile.cs`
- Delete: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Signals/CSharpFileChanged.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileNeuron.cs`
- Modify: every caller of `ICSharpFile.Read` and `CSharpFileChanged` (LSP `findReferences`; known: `Apps/Runtimes/CSharpAppRuntime.cs`, `AppNeuron.cs`, CSharp endpoints, `CSharpFileNeuronFacts.cs`, `CSharpSubscriptionFacts.cs`, `CSharpTriggerFacts.cs`, `ScriptEdgeFacts.cs`, `CSharpRouteFacts.cs`, `ContractVocabularyFacts.cs`, `CSharpCatalogFacts.cs`, OS E2E `CSharpFileContainerFacts.cs`)
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SynapseFacts.cs`

**Interfaces:**
- Consumes: `ISynapse`, `SynapseSnapshot`, `SynapseWatch`, `SynapseChanged` from Task 6.
- Produces: `ICSharpFile : ISynapse` with `Inspect`, `Configure`, `Swap`, `Arm`, `ReadLogs`. `CSharpFileNeuron` publishes `SynapseChanged(FileId)` wherever it published `CSharpFileChanged(FileId)`.

- [ ] **Step 1: Write the failing facts**

`SynapseFacts.cs` (`SandboxBrain.StartAsync(sandbox, ct)` is the shared brain factory in that project; `FakeSandbox.LatestRunId` is the run id of the last start):

```csharp
using DigitalBrain.Microsoft.CSharp;
using Xunit;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

public sealed class SynapseFacts
{
    [Fact]
    public async Task AStartedSynapseIsAliveAndListsOneWatchPerStreamedSubscription()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var file = brain.Get<ICSharpFile>("workspace/synapses/alive");
        await file.Write("Console.WriteLine(1);", ct);
        var started = await file.Start(ct);
        Assert.True(started.Alive);
        Assert.Empty(started.Watches);

        await file.AsReference<ICSharpFileEdge>().Subscribed(sandbox.LatestRunId, "time.timer/tea", "TimerTick");
        var synapse = await ((ISynapse)file).Read(ct);
        Assert.Equal([new SynapseWatch("time.timer/tea", "TimerTick", 0)], synapse.Watches);
        Assert.Equal("Console.WriteLine(1);", synapse.Program);
        Assert.Null(synapse.LastError);
    }

    [Fact]
    public async Task AStoppedSynapseKeepsItsProgramAndIsNotAlive()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await SandboxBrain.StartAsync(new FakeSandbox(), ct);
        var file = brain.Get<ICSharpFile>("workspace/synapses/stopped");
        await file.Write("Console.WriteLine(2);", ct);
        await file.Start(ct);
        var stopped = await file.Stop(ct);
        Assert.False(stopped.Alive);
        Assert.Equal("Console.WriteLine(2);", stopped.Program);
    }

    [Fact]
    public async Task AnArmedSynapseListsItsTriggerAsAWatchWhileWaiting()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await SandboxBrain.StartAsync(new FakeSandbox(), ct);
        var file = brain.Get<ICSharpFile>("workspace/synapses/armed");
        await file.Write("Console.WriteLine(3);", ct);
        await file.Arm(new CSharpTrigger("time.timer/tea", "TimerTick"), ct);
        var synapse = await ((ISynapse)file).Read(ct);
        Assert.False(synapse.Alive);
        Assert.Equal([new SynapseWatch("time.timer/tea", "TimerTick", 0)], synapse.Watches);
    }

    [Fact]
    public async Task SynapseChangedIsPublishedOnWriteStartStopAndDelete()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await SandboxBrain.StartAsync(new FakeSandbox(), ct);
        var file = brain.Get<ICSharpFile>("workspace/synapses/changes");
        await using var changes = await brain.Observe<SynapseChanged>(file, ct);
        await file.Write("Console.WriteLine(4);", ct);
        await file.Start(ct);
        await file.Stop(ct);
        await file.Delete(ct);
        for (var i = 0; i < 4; i++) { Assert.Equal("workspace/synapses/changes", (await changes.NextAsync(ct: ct)).SynapseId); }
    }
}
```

Add to `ScriptEdgeFacts.cs`:

```csharp
[Fact]
public async Task AScriptCanCallReadOnASynapseAndInspectOnTheCSharpFileWithoutAmbiguity()
{
    var ct = TestContext.Current.CancellationToken;
    var sandbox = new FakeSandbox();
    await using var brain = await Brain(sandbox, ct);
    const string fileId = "workspace/synapses/edge-read";
    await StartAsAlice(brain, sandbox, fileId, ct);
    var token = LatestToken(sandbox);
    var edge = brain.SiloServices.GetRequiredService<ScriptEdge>();
    var synapse = await edge.InvokeAsync(token, (typeof(ICSharpFile).FullName!, fileId, nameof(ISynapse.Read), []), ct);
    Assert.True(synapse!.Value.TryGetProperty("program", out _));
    var rich = await edge.InvokeAsync(token, (typeof(ICSharpFile).FullName!, fileId, nameof(ICSharpFile.Inspect), []), ct);
    Assert.True(rich!.Value.TryGetProperty("status", out _));
}
```
`Brain`, `StartAsAlice` and `LatestToken` are private helpers already in `ScriptEdgeFacts.cs` (lines 353-387 today). Resolve the edge the way the sibling facts in that file do; if they do not use `SiloServices`, copy their construction.

- [ ] **Step 2: Run to see them fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*SynapseFacts*"`
Expected: compile errors (`ISynapse` not implemented by `ICSharpFile`, no `Inspect`, no `SynapseChanged` published).

- [ ] **Step 3: Contract**

`ICSharpFile.cs`:
```csharp
using DigitalBrain;
using Orleans.Metadata;

namespace DigitalBrain.Microsoft.CSharp;

// The C# dialect of a synapse: Read/Write/Start/Stop/Delete are the word's; the rest is how this
// runner hosts it. Inspect is the rich view beside ISynapse.Read, not a hiding of it.
[Alias("microsoft.csharp.file"), DefaultGrainType("microsoft.csharp.file")]
public interface ICSharpFile : ISynapse
{
    Task<CSharpFileSnapshot> Inspect(CancellationToken cancellationToken = default);
    Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default);
    // An edit, not a fresh intent: the new source restarts the run but keeps the file's durable
    // subscriptions and their buffered signals, so a hot-swapped behavior resumes where it was.
    [ResponseTimeout("00:05:00")] Task<CSharpFileSnapshot> Swap(string source, CancellationToken cancellationToken = default);
    // Waits for the trigger's signal instead of running now; every matching signal starts one run that reads it with brain.Trigger<T>().
    Task<CSharpFileSnapshot> Arm(CSharpTrigger trigger, CancellationToken cancellationToken = default);
    Task<string> ReadLogs(int tail = 200, CancellationToken cancellationToken = default);
}
```
Delete `Signals/CSharpFileChanged.cs`.

- [ ] **Step 4: Neuron**

In `CSharpFileNeuron.cs`:
- Rename today's `Read` to `Inspect` (LSP rename, so callers follow).
- `Start`/`Stop` currently return `Task<CSharpFileSnapshot>`; `ISynapse` wants `Task<SynapseSnapshot>`. Keep the rich implementations as private `StartFile`/`StopFile` returning `CSharpFileSnapshot`, and add:

```csharp
public async Task<SynapseSnapshot> Read(CancellationToken cancellationToken = default)
    => AsSynapse(await Inspect(cancellationToken));

async Task<SynapseSnapshot> ISynapse.Start(CancellationToken cancellationToken) => AsSynapse(await StartFile(cancellationToken));
async Task<SynapseSnapshot> ISynapse.Stop(CancellationToken cancellationToken) => AsSynapse(await StopFile(cancellationToken));

private SynapseSnapshot AsSynapse(CSharpFileSnapshot file)
{
    var watches = file.Subscriptions.Select(s => new SynapseWatch(s.Neuron, s.Signal, s.Pending)).ToList();
    if (file.Trigger is { } trigger && !watches.Any(w => w.Neuron == trigger.Neuron && w.Signal == trigger.Signal))
    { watches.Add(new(trigger.Neuron, trigger.Signal, 0)); }
    var failed = file.Status == CSharpFileStatus.Exited && file.ExitCode is not 0;
    return new(file.Id, file.Source, file.Status is CSharpFileStatus.Running or CSharpFileStatus.Restarting, [.. watches], failed ? LastLogTail() : null);
}
```
where `LastLogTail()` returns the last 20 log lines through the existing `runner` the way `ReadLogs` does (synchronous access is not available, so make `AsSynapse` async and `await ReadLogs(20, cancellationToken)` when `failed`). `ICSharpFile` consumers that need the rich snapshot after start call `Inspect` (the public `Start` on the class can stay returning `CSharpFileSnapshot` only if no interface declares it; since `ICSharpFile` no longer declares `Start`, make the rich ones private and expose `Start`/`Stop` only through `ISynapse`).
- `Write(string source, …)` parameter renamed `program` to match the contract.
- Replace every `new CSharpFileChanged(FileId)` with `new SynapseChanged(FileId)` (LSP `findReferences` on the deleted type lists all 14 sites in this file).

- [ ] **Step 5: Callers**

LSP `findReferences` on `ICSharpFile.Read` before the rename gives the list; after the rename to `Inspect`, build each: `CSharpAppRuntime.cs`, `AppNeuron.cs`, CSharp HTTP endpoints, the MCP tools if they special-case file reads. Callers that used `Start`/`Stop` return values as `CSharpFileSnapshot` switch to `await file.Start(ct); var snapshot = await file.Inspect(ct);`.

Tests: in `CSharpFileNeuronFacts`, `CSharpSubscriptionFacts`, `CSharpTriggerFacts`, `CSharpRouteFacts`, `ScriptEdgeFacts`, OS E2E `CSharpFileContainerFacts`: `file.Read(ct)` → `file.Inspect(ct)`; `Observe<CSharpFileChanged>` → `Observe<SynapseChanged>` with `.FileId` → `.SynapseId`; `(await file.Start(ct)).Status` → `await file.Start(ct); (await file.Inspect(ct)).Status`. `ContractVocabularyFacts` and `CSharpCatalogFacts` enumerate member names: update their expected lists to include `Inspect` and the inherited `Read`.

- [ ] **Step 6: Run the suites**

Run:
```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: all PASS, including the four `SynapseFacts` and the new `ScriptEdgeFacts` fact.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "CSharp: the file neuron is the C# dialect of a synapse

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Bundles say `synapses/`; the assistant can list them

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppFiles.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`, `AppsInventoryProvider.cs`, `Authoring/AgentPrompts.cs`, `Authoring/BuilderTools.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpScriptSandbox.cs`
- Rename (git mv): `src/DigitalBrain.OS/Apps/{Assistant,DataVisualizer,Settings}/behaviors` → `synapses`; `src/IntoChat/Apps/{CustomerResearcher,WordCount}/behaviors` → `synapses`; update `src/IntoChat/Apps/CustomerResearcher/app.authoring.json` paths
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/RegistryInventoryTools.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppNeuronFacts.cs`, `AppInstallerFacts.cs`, `AppCreatorFacts.cs`, and every test file listing `behaviors/` (Apps tests ×11, `CSharpScriptCheckFacts.cs`, OS unit ×3)
- Test: `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/InventoryFacts.cs`

**Interfaces:**
- Produces: `AppFiles.SynapsesPrefix = "synapses/"`, `AppFiles.IsSynapse(string path)`; `IApp.WriteBehavior` keeps its name (contract method rename is out of scope); assistant tool `list_synapses`.

- [ ] **Step 1: Write the failing facts**

In `AppNeuronFacts.cs` add:
```csharp
[Fact]
public async Task ASynapseIsKeyedUnderTheAppsSynapsesFolderAndTheOldFolderIsRefused()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await Start();
    var app = brain.Get<IApp>(IApp.Key(Brain, "keyed"));
    await app.Create(Manifest(), "## Scenario: Keys\nIt keys.");
    var refused = await Assert.ThrowsAsync<ArgumentException>(() => app.WriteBehavior("behaviors/old.cs", "// p", Guid.NewGuid()));
    Assert.Contains("synapses/", refused.Message, StringComparison.Ordinal);
    var snapshot = await app.WriteBehavior("synapses/new.cs", "// p", Guid.NewGuid());
    Assert.Contains("synapses/new.cs", snapshot.Files.Keys);
    var file = await brain.Get<ICSharpFile>(IApp.Key(Brain, "keyed") + "/synapses/new.cs").Inspect(ct);
    Assert.Equal(IApp.Key(Brain, "keyed") + "/synapses/new.cs", file.Id);
}
```
`Start()`, `Manifest()` and the `Brain` constant are the helpers at the top of `AppNeuronFacts.cs`. If `WriteBehavior` deploys through a sandbox this harness lacks, start the brain the way the existing `WriteBehavior` fact in that file does (it configures `FakeSandbox` through `ConfigureSilo`).

In `AppInstallerFacts.cs` add an assertion to the existing install fact that enumerates copied files: `Assert.Contains(installed.Files.Keys, AppFiles.IsSynapse);` and that the installed synapse file neuron key contains `/synapses/`.

In `AppCreatorFacts.cs`, in the fact that drives the Creator with a scripted model, assert the produced bundle contains at least one key for which `AppFiles.IsSynapse` holds and none starting with `behaviors/`.

In Assistant `InventoryFacts.cs` add:
```csharp
[Fact]
public async Task ListSynapsesReturnsOnlySynapseTypedRecordsOfTheCallersBrain()
{
    var ct = TestContext.Current.CancellationToken;
    await using var host = await ModuleTest.Create().WithModule<AppsModule>().WithModule<AssistantModule>().WithModule<TimeModule>().WithReminders().StartAsync(ct);
    Stamp("one");
    await host.AuthorizeCallerAsync();
    var scope = BrainScope.CurrentId();
    await host.Get<IReminder>(scope + "/standup").Start(TimeSpan.FromHours(1), TimeSpan.FromDays(1));
    var app = host.Get<IApp>(IApp.Key(scope, "one"));
    await app.Create(new("one", "One", [], [], []), "## Scenario: Lists\nIt lists.");
    await app.BeginBuild(null);
    await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["synapses/app.cs"] = "// p" }, null);
    var model = new InventoryModel("list_synapses");
    using var services = new ServiceCollection().AddSingleton<IChatClient>(model)
        .AddSingleton<IEnumerable<IAgentToolFactory>>(host.SiloServices.GetServices<IAgentToolFactory>()).BuildServiceProvider();
    var events = new List<AgentTurnEvent>();
    await foreach (var item in new AgentTurnRunner(services).RunAsync(new("assistant", "run", scope, [],
        "Which synapses exist in this brain?", null, ToolNames: AssistantDefinition.Product.Tools), ct))
    { events.Add(item); }
    Assert.Empty(events.OfType<AgentTurnEvent.Failed>());
    Assert.NotNull(model.Inventory);
    Assert.All(model.Inventory.Records, record => Assert.Equal("microsoft.csharp.file", record.TypeId));
    Assert.Contains(model.Inventory.Records, record => record.Key.EndsWith("/synapses/app.cs", StringComparison.Ordinal));
    Assert.DoesNotContain(model.Inventory.Records, record => record.TypeId == "reminder");
}
```
`Stamp` and `InventoryModel` are already defined in `InventoryFacts.cs`; the scripted model calls the named tool once and captures its `RegistryInventory`. `AssistantDefinition.Product.Tools` (line 16 of `AssistantDefinition.cs`) must gain `"list_synapses"` for the tool to be offered.

- [ ] **Step 2: Run to see them fail**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*ASynapseIsKeyed*"`
Expected: FAIL (`IsSynapse` missing; old folder accepted).

- [ ] **Step 3: Implement**

`AppFiles.cs`:
```csharp
public const string SynapsesPrefix = "synapses/";
public static bool IsSynapse(string path)
    => path.StartsWith(SynapsesPrefix, StringComparison.Ordinal) && path.EndsWith(".cs", StringComparison.Ordinal);
```
Remove `BehaviorsPrefix` and `IsBehavior`; LSP `findReferences` on each gives the nine `AppNeuron.cs` sites and `AppsInventoryProvider.cs`. The `WriteBehavior` guard message becomes `"A synapse is a synapses/*.cs file."`; the `WriteFile` guard becomes `"Programs are written through WriteBehavior, which deploys them under synapses/."`.

`AgentPrompts.cs` line 79 and `BuilderTools.cs` line 20: `behaviors/notify.cs` → `synapses/notify.cs`. `CSharpScriptSandbox.AuthoringDescription`: `"behaviors/<name>.cs"` → `"synapses/<name>.cs"`, and "Each behavior" → "Each synapse".

Rename folders:
```bash
for app in Assistant DataVisualizer Settings; do git mv src/DigitalBrain.OS/Apps/$app/behaviors src/DigitalBrain.OS/Apps/$app/synapses; done
for app in CustomerResearcher WordCount; do git mv src/IntoChat/Apps/$app/behaviors src/IntoChat/Apps/$app/synapses; done
```
Edit `src/IntoChat/Apps/CustomerResearcher/app.authoring.json`: the three `behaviors/…` entries become `synapses/…`.

`RegistryInventoryTools.Create` adds:
```csharp
async Task<RegistryInventory> Synapses(CancellationToken ct)
{
    RequireScope();
    var all = await registry.Persisted(null, ct);
    var synapseTypes = catalog.Types.Where(t => t.IsInterface && typeof(ISynapse).IsAssignableFrom(t))
        .Select(t => t.GetCustomAttribute<AliasAttribute>()?.Alias).OfType<string>().ToHashSet(StringComparer.Ordinal);
    return all with { Records = all.Records.Where(r => synapseTypes.Contains(r.TypeId)).ToArray() };
}
```
and registers `AIFunctionFactory.Create(Synapses, "list_synapses", "List the current brain's synapses: durable programs that watch neurons and act. Records are attributed to their owning Domain (apps for app-owned synapses, csharp for standalone files).")`. The constructor becomes `RegistryInventoryTools(IRegistry registry, ModuleInventory catalog)`; `ModuleInventory` lives in `DigitalBrain.Framework` (`Composition/ModuleInventory.cs`) and is registered by the host. Build the synapse type set from `catalog.ContractAssemblies().SelectMany(a => a.GetExportedTypes())`, not `catalog.Types` (those are the `Module` subclasses). Add `"list_synapses"` to `AssistantDefinition.Product.Tools`. `TypeId` for C# files is `microsoft.csharp.file`, which is also the alias on `ICSharpFile`, so the alias set matches the record type ids.

- [ ] **Step 4: Update tests that spell the old folder**

Replace `behaviors/` with `synapses/` and `AppFiles.IsBehavior` with `AppFiles.IsSynapse` in: Apps tests (`AppInstallerFacts`, `AppNeuronFacts`, `AppOriginFacts`, `AppPublishFacts`, `AppRouteFacts`, `AppSharingFacts`, `AppVerifyFacts`, `MarketplaceRouteFacts`, `DirectoryShippedAppSourceFacts`, `Runtimes/DeployableRuntimeFacts`, `Runtimes/StorageHookFacts`), `CSharpScriptCheckFacts.cs`, OS unit (`OsAssistantAppFacts`, `OsBootFacts`, `VendorAppFacts`).

- [ ] **Step 5: Run the suites**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: all PASS. `grep -rn "behaviors/" src --include=*.cs --include=*.json --include=*.md | grep -v /obj/ | grep -v docs/` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Apps: bundles carry synapses/, the assistant lists synapses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Seen running

**Files:**
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ShippedAppVerificationFacts.cs`
- No production code; this task is the CLAUDE.md verification loop.

- [ ] **Step 1: Add the end-to-end fact**

In `ShippedAppVerificationFacts` add a fact beside `EveryOsAppPassesItsTestsInTheSandbox`, starting the brain the same way and reading the installed defaults of the `shipped` brain (the names are the ones `OsApps.cs` line 51 registers):

```csharp
[Fact]
public async Task EveryShippedSynapseIsAliveAndReadsAsASynapse()
{
    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
    deadline.CancelAfter(TimeSpan.FromMinutes(15));
    var ct = deadline.Token;
    await using var brain = await ReferenceBrain.Create()
        .ConfigureModule<CSharpModule, CSharpOptions>(csharp => csharp.WithSandbox(RepositoryRoot()))
        .StartAsync(ct);
    var scope = BrainScope.Create("owner", "shipped").Id;
    // Any authenticated request establishes the brain; Establish provisions the OS defaults.
    (await brain.HttpClient.GetAsync("/brains/shipped/apps", ct)).EnsureSuccessStatusCode();
    foreach (var name in new[] { "settings", "assistant", "datavisualizer" })
    {
        var app = await brain.Get<IApp>(IApp.Key(scope, name)).Read();
        var synapses = app.Files.Keys.Where(AppFiles.IsSynapse).ToArray();
        Assert.NotEmpty(synapses);
        foreach (var path in synapses)
        {
            var key = IApp.Key(scope, name) + "/" + path;
            var synapse = await brain.Get<ISynapse>(key).Read(ct);
            while (!synapse.Alive)
            {
                // The sandbox builds the first run; the sibling fact polls verdicts the same way.
                await Task.Delay(TimeSpan.FromSeconds(1), ct);
                synapse = await brain.Get<ISynapse>(key).Read(ct);
            }
            Assert.NotEmpty(synapse.Program);
        }
    }
}
```
The establishing GET must be a route the Apps module serves under `/brains/{id}/apps`; if the list route differs, use the request the sibling fact's import uses, minus the import body.

- [ ] **Step 2: Run it**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*EveryShippedSynapse*"`
Expected: PASS.

- [ ] **Step 3: Aspire run and MCP drive**

Start the app: from `src/DigitalBrain.AppHost`, `aspire run`. Then with the Aspire MCP: `list_resources` must show every resource Running/Healthy. Through `digitalbrain-mcp` (`localhost:5081/mcp`):
1. `neurons_context` — confirm caller and brain.
2. `neurons_search` for `ISynapse` — the contract appears, with `ICSharpFile` as its dialect.
3. `neurons_get` on `{brainScope}/apps/settings/synapses/app.cs` as `ISynapse` — snapshot has `alive: true`, `program` non-empty, `watches` containing the app's `AppInvoked` watch.
4. `neurons_call` `Stop` then `Start` on it; `neurons_get` again shows `alive: true`.
5. Assistant: call `list_synapses` through the assistant tool path (`neurons_call` on the agent neuron or the `/brains/{id}/…` route the Assistant tests use) and confirm only `microsoft.csharp.file` records.

- [ ] **Step 4: Telemetry**

Aspire MCP `list_traces`: a trace for the `Stop`/`Start` calls with the sandbox run span; `list_structured_logs` filtered by the synapse key shows the start line; `list_trace_structured_logs` on that trace follows it end to end. If a span or log you expect is missing, the change is not done.

- [ ] **Step 5: Regression net**

```bash
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Testing.Module.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test --project src/DigitalBrain.Modules/Time/tests/DigitalBrain.Modules.Time.Tests
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
```
And from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter analyze` (no Dart change is expected; this confirms it).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "OS: every shipped synapse reads alive end to end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
