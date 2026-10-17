# Derived Runtime, Section 2: Inference Is Neuron State, and Model Readiness Is Resource Health

> **For agentic workers (OpenCode):)** you implement exactly ONE task below. Read the spec
> first: `docs/superpowers/specs/2026-10-09-derived-runtime-design.md` (Section 2 only). Read
> `CLAUDE.md`. Stay inside the files your task lists. Do not commit - the orchestrator reviews
> and commits.

**Goal:** A route whose model takes longer than the Orleans response timeout still completes and
publishes `Routed`;the assistant answers a direct route with no agent turn;the systemone
adapter health is 503 before the first successful inference and 200 after. No timeout is raised
anywhere.

**Depends on:** nothing ships this section first (spec order: 2,3,1,4,5). Section 3
( `Jev routes over a routable catalog`) later depends on this plan's `Routed(Guid Id, ...)`,
`IRouter.Ask(RouteRequest)`, `IRouter.Pending(Guid)`, and rewrites the assistant's `routed.cs`
gate when `RouteResult` gains `App`/`Operation`/`IsDirect`. Sections 1,4,5 are planned by
other sessions in parallel;do not touch their files. `RouteResult` (Section 3 shape premise)
is untouched here.{{multiline}}

{{b:70}}

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, xunit v3. Build and test **per project**, never `.slnx`:
```
dotnet build src/<path>/<Project>.csproj
dotnet test --project src/<test-project-dir>
```
- Cap every test run at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, never a
  timeout to raise.
- Warnings are errors, nullable on, package versions only in `Directory.Packages.props`. No
  `/// <summary>` boilerplate. Match surrounding style (file-scoped namespaces, primary constructors,
  expression bodies, `ConfigureAwait(false)` in Framework). Neurons followthe AgentNeuron one-way
  self worker pattern (`IAgentDriver`).
- Grain state: `[GenerateSerializer]` records with **concrete arrays**, never `IReadOnlyList`. Every
  `[Alias]` unique. No self-calls on non-reentrant grains:the one-way self-reference( `this.
  AsReference<T>()`) is the sanctioned escape.
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains
  via the harness helpers the existing facts use,no mocks of grains.
- Neuron keys start with the brain id: `{brainId}/...`. Brain of a key: text before the first `/`.
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`, `src/DigitalBrain.OS/DigitalBrain.OS/
  OsCatalog.cs`, nor `src/DigitalBrain.AppHost/*` unless a task lists them.
- Done = your project(s) build with 0 warnings and your tests pass. Report the exact commands and output.



## Task S2-1: Routes as state;SystemOne inference runs on a worker turn

**Executor:** Claude. One seam across three projects( `DigitalBrain.Modules.AI.Contracts`,
`DigitalBrain.Modules.AI`, `DigitalBrain.Modules.AI.Tests`). It removes the two synchronous grain
calls that block on HTTP( `IRouter.Route` and `ISystemOne.Ask`) under the Orleans 30 s response
timeout.

**Files:**
```
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/IRouter.cs        (modify)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteRequest.cs      (create)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/PendingRoute.cs        (create)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/Signals/RoutingSignals.cs (modify)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterState.cs                  (modify)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/IRouterWork.cs                  (create)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs                   (modify)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/ISystemOneWork.cs               (create)
src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/SystemOneNeuron.cs             (modify)
src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs       (modify)
```

**Produces** (new files in full;modified files as exact replacements;`RouteResult`  untouched):

`RouteRequest.cs`:
```csharp
namespace DigitalBrain.AI.Routing;

// One routing request posted through Ask. Id is chosen by the poster (the assistant uses
// the AppRequested.RequestId, so its two synapses share no state butthe router's).
[GenerateSerializer, Alias("ai.route-request")]
public sealed record RouteRequest(
    [property: Id(0)] Guid Id,
    [property: Id(1)] string State,
    [property: Id(2)] string[]? Allowed = null);
```

`PendingRoute.cs`:
```csharp
namespace DigitalBrain.AI.Routing;

// The router's record of one asked request: status Routing while the worker decides, Routed
// or Failed once resolved. Result/Error are the two mutually-exclusive outcomes. Bound at 64
// per router grain;workers evict the oldest resolved entry first.

[GenerateSerializer, Alias("ai.router.pending")]
public sealed record PendingRoute(
    [property: Id(0)] Guid Id,
    [property: Id(1)] string State,
    [property: Id(2)] string[]? Allowed,
    [property: Id(3)] string Status,
    [property: Id(4)] RouteResult? Result = null,
    [property: Id(5)] string? Error = null);
```

`RoutingSignals.cs`:
```csharp
using DigitalBrain;

namespace DigitalBrain.AI.Routing.Signals;

// The router's decision for one asked request:which contract and method, and how sure it was.
// Published by the Ask worker when routing finishes. Id is the RouteRequest.Id the poster asked;

// Contract is the full type name. Error (non-empty) means Jev could not decide-and-the
// assistant falls back to the agent turn with no hint.
[GenerateSerializer, Alias("ai.routed")]
public sealed record Routed(
    [property: Id(0)] Guid Id,
    [property: Id(1)] string Contract,
    [property: Id(2)] string Method,
    [property: Id(3)] double Confidence,
    [property: Id(4)] string? Error = null) : Signal;
```

`RouterState.cs`:
```csharp
using DigitalBrain;
using DigitalBrain.Framework;

namespace DigitalBrain.AI.Routing;

// One decision the router made, kept so the next request is judged against what came before it.
[GenerateSerializer, Alias("ai.router.record")]
internal sealed record RouteRecord(
    [property: Id(0)] string Request,
    [property: Id(1)] string Contract,
    [property: Id(2)] string Method);

// The router's own state:the decisions it made (most recent last)and the requests asked through
// Ask, each still Routing or settled as Routed/Failed with its result. Pending is bounded;the
// router serves them back through IRouter.Pending;nothing else reads it.
[GenerateSerializer, Alias("ai.router.storage")]
internal sealed record RouterStorage
{
    [Id(0)] public RouteRecord[] Recent { get; init; } = [],
    [Id(1)] public PendingRoute[] Pending { get; init; } = [],
}

[GenerateSerializer, Alias("ai.router.decided")]
internal sealed record RouterDecided(string Router, int Count) : Signal;
```

`IRouterWork.cs`:
```csharp
using Orleans.Concurrency;

namespace DigitalBrain.AI.Routing;

// The worker that runs a routed request off Ask's turn, on a later turn of the same grain:the
// one-way shape every slow operation in the OS has. The result is written into the router's state
//and published as Routed;no caller of Ask waits on the model.
[Orleans.Concurrency.OneWay, Orleans.Concurrency.AlwaysInterleave]
public interface IRouterWork
{
    Task RouteAsync(Guid requestId, string state, string[]? allowed);
}
```

`ISystemOneWork.cs`:
```csharp
using Orleans.Concurrency;
using DigitalBrain.AI.SystemOne;

namespace DigitalBrain.AI.SystemOne;

// The worker that takes the HTTP inference off Ask's turn, on a later turn of the same grain:so
// a slow model delays the result, never the grain. The answer is published as SystemOneDecided
//and completes the Task Ask returned.
[Orleans.Concurrency.OneWay, Orleans.Concurrency.AlwaysInterleave]
public interface ISystemOneWork
{
    Task Work(Guid requestId, SystemOneRequest request);
}
```

`SystemOneNeuron.cs`( replace whole file):
```csharp
using System.Collections.Concurrent;
using DigitalBrain.AI.SystemOne;
using DigitalBrain.AI.SystemOne.Signals;
using DigitalBrain.Framework;

namespace DigitalBrain.AI;

[GrainType("ai.systemone")]
internal sealed class SystemOneNeuron(HttpSystemOne client) : Neuron, ISystemOne, ISystemOneWork
{
    private const int MaxSummaryChars = 2000;
    private readonly ConcurrentDictionary<Guid, TaskCompletionSource<SystemOneResult>> _pending = new();

    // Keeps its contract, butthe HTTP runs on a worker turn of this same grain( a OneWay
    // self-reference), so a slow model never holds this grain's answering turn. The answer is
    // delivered as SystemOneDecided and completes the Task Ask returned.


    public Task<SystemOneResult> Ask(SystemOneRequest request, CancellationToken ct = default)
    {
        var id = Guid.NewGuid();
        var tcs = new TaskCompletionSource<SystemOneResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = tcs;

        ct.Register(() =>
        {
            _pending.TryRemove(id, out _);
            tcs.TrySetCanceled(ct);
        });
        _ = this.AsReference<ISystemOneWork>().Work(id, request);
        return tcs.Task;


    }

    public async Task Work(Guid requestId, SystemOneRequest request)
    {
        try
        {
            var result = await client.Ask(request, CancellationToken.None);
            var summary = request.State.Length <= MaxSummaryChars ?
                request.State : request.State[..MaxSummaryChars];
            // Publish before completing the caller's task, so the caller awakes after the fact is out.
            await PublishAsync(new SystemOneDecided(summary, result.Answers, Confidence(result));
            if( _pending.TryRemove(requestId, out var pending)){ pending.TrySetResult(result); }
        }
        catch (Exception error)
        {
            if( _pending.TryRemove(requestId, out var pending)){ pending.TrySetException(error); }
        }
    }

    private static double Confidence(SystemOneResult result)
    {
        var best = 0.0;
        foreach (var answer in result.Answers.Values)
        {
            var confidence = answer switch
            {
                SystemOneAnswer.Choice choice => choice.Confidence,
                SystemOneAnswer.Score score => score.Confidence,
                _ => 0.0,
            };
            if( confidence > best)){ best = confidence; }
        }
        return best;
    }
}
```

`IRouter.cs`( replace whole file):
```csharp
using Orleans.Concurrency;

namespace DigitalBrain.AI.Routing;

// A router picks a capability and method from the deployed contract catalog for unstructured
// state, using a System One model, then dispatches the call. It decides;it never generates prose.
// Ask records the request in the router's state and ends;the router answers by writing the result
// into that state and publishing Routed, so a slow model never holds any caller's turn.
[Alias("ai.router"), Orleans.Metadata.DefaultGrainType("ai.router")]
public interface IRouter : INeuron
{
    // One-way shape: post a routing request); returns once recorded. The answer is state + Routed.
    Task Ask(RouteRequest request, CancellationToken ct = default);

    // The request Ask recorded, with its outcome once routed. The state the assistant's send and
    // routed synapses share through the router. Returns null if no such request was recorded.
    // Pending is bounded at 64 per router grain, so the assistant must react to Routed promptly.
    [ReadOnly, AlwaysInterleave] Task<PendingRoute?> Pending(Guid id, CancellationToken ct = default);

    // Decide only:the catalog contract, method and confidence. No call is made. For callers
    //that can wait( the MCP tool, tests). Implemented over Ask's path:records state, routes inline.
    [AlwaysInterleave] Task<RouteResult> Route(string state, string[]? allowed = null, CancellationToken ct = default);
    [AlwaysInterleave] Task<RouteOutcome> Dispatch(string state, string[]? allowed = null, CancellationToken ct = default);
    [AlwaysInterleave, ResponseTimeout("00:15:00")] Task<GoalRun> Achieve(string goal, string[]? allowed = null, CancellationToken ct = default);
}
```

`RouterNeuron.cs`( modifier: the class declaration, the `Route` methodand the private helpers
below;everything else stays unchanged).Class declaration:
```csharp
internal sealed class RouterNeuron(
    [PersistentState("router", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<RouterStorage> store)
    : Neuron<RouterStorage>(store), IRouter, IRouterWork
```
Add `private const int MaxPending = 64;` beside the other constants. Replace the `Route` method
and add the Ask vessels( the old `Route` body becomes `RouteCore`;its three `await Remember(...)`
sites become `return new RouteResult(...)`):
```csharp
public Task Ask(RouteRequest request, CancellationToken ct = default)
{
    ArgumentNullException.ThrowIfNull(request);
    ArgumentException.ThrowIfNullOrWhiteSpace(request.State);
    return AskCore(request.Id, request.State, request.Allowed);
}

private async Task AskCore(Guid id, string state, string[]? allowed)
{
    await RecordPending(id, state, allowed);
    // OneWay:enqueues a later turn of this grain and returns once the message is sent;
    // the caller of Ask never waits on the model.
    await this.AsReference<IRouterWork>().RouteAsync(id, state, allowed);
}

[ReadOnly, AlwaysInterleave]
public Task<PendingRoute?> Pending(Guid id, CancellationToken ct = default)
    => Task.FromResult(Snapshot.Pending.FirstOrDefault(entry => entry.Id == id);

public async Task<RouteResult> Route(string state, string[]? allowed, CancellationToken ct)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(state);
    var id = Guid.NewGuid();
    await RecordPending(id, state, allowed,
    try
    {
        var result = await RouteCore(state, allowed, ct);
        await Resolve(id, state, result, notifyRouted: false);
        return result);
    }
    catch (Exception error) when (error is not OperationCanceledException)
    {
        await ResolveFailure(id, error.Message, notify: false);
        throw;
    }
}

// The worker for Ask:runs the same core over the recorded request, writes the result into state
// for that id,and answers with Routed, Slow models take as long as they need;nobody awaits.
public async Task RouteAsync(Guid requestId, string state, string[]? allowed)
{
    try
    {
        var result = await RouteCore(state, allowed, CancellationToken.None);
        await Resolve(requestId, state, result, notifyRouted: true);
    }
    catch (Exception error) when (error is not OperationCanceledException)
    { await ResolveFailure(requestId, error.Message, notify: true); }
}

// The decision itself, without touching state;the sync Route, the worker and Achieve's steps all
// own their results. It is exactly the old Route body with its Remember calls removed.
private async Task<RouteResult> RouteCore(string state, string[]? allowed, CancellationToken ct)
{
    var types = (await Capabilities().Read(Scope, ct))
        .Where(type => allowed is null || allowed.Contains(type.Contract, StringComparer.Ordinal))
        .ToArray();
    if( types.Length ==  0)){ throw new InvalidOperationException("No contracts are available to route over."); }

    var systemone = ServiceProvider.GetRequiredService<IGrainFactory>().GetGrain<ISystemOne>(Scope);
    var moment = AwareOfState(state);
    var criteria = types.ToDictionary(type => type.Id, type => (string?)Trim(type.Description), StringComparer.Ordinal);
    var contractQuestions = new Dictionary<string, SystemOneQuestion>(StringComparer.Ordinal);
    var chunks = Chunk(criteria).ToArray();
    for( var index =  0; index < chunks.Length; index++)
    { contractQuestions["capability_" + index] = new SystemOneQuestion.Choice("Which capability can carry out this request?", chunks[index]); }
    var contractAnswer = await systemone.Ask(new SystemOneRequest(moment, contractQuestions, ct);
    var( chosenId, confidence, probabilities) = Best(contractAnswer);
    var chosen = types.Single(type => type.Id == chosenId);
    if( chosen.Key is not null)
    {
        return new RouteResult(chosen.Contract, "Run", confidence, probabilities, chosen.Key, chosen.Tool);
    }
    var methods = chosen.Methods.Select(MethodName).Where(name => !NotCallable.Contains(name)).Distinct(StringComparer.Ordinal).ToArray();
    if( methods.Length ==  0)
    {
        return new RouteResult(chosen.Contract, "", confidence, probabilities);
    }
    var methodAnswer = await systemone.Ask(new SystemOneRequest(moment,
        new() { ["method"] = new SystemOneQuestion.Choice("Which method carries out this request?", methods.ToDictionary(name => name, _ => (string?)null, StringComparer.Ordinal)) }), ct);
    var method = methodAnswer.Answers["method"] is SystemOneAnswer.Choice { Value.Length: >  0 } picked ? picked.Value : methods[0];
    return new RouteResult(chosen.Contract, method, confidence, probabilities);
}

// Resolve and RecordPending keep the bounded state:recent decisions( as today)andthe pending
// requests. Routed is published only when notifyRouted is true - only the Ask worker, never a
// sync caller, so the assistant's Routed subscription sees only its own asked routes.


private Task RecordPending(Guid id, string state, string[]? allowed)
    => SaveSilently(Snapshotwith
    {
        Pending = [.. Snapshot.Pending.Where(entry => entry.Id != id).TakeLast(MaxPending - 1), new PendingRoute(id, Clip(state), allowed, "Routing")]
    });

private Task Resolve(Guid id, string state, RouteResult result, bool notifyRouted)
{
    var record = new RouteRecord(Clip(state), result.Contract, result.Method);
    var recent = Snapshot.Recent.Where(item => item.Request != record.Request || item.Contract != record.Contract).TakeLast(MaxRecent - 1).ToArray();
    var pending = Snapshot.Pending.Select(entry => entry.Id == id ? entrywith { Status = "Routed", Result = result } : entry).ToArray();
    return Save(Snapshotwith { Recent = [.. recent, record], Pending = pending },
        new RouterDecided(Key, recent.Length + 1),
        notifyRouted ? new Routed(id, result.Contract, result.Method, result.Confidence) : null;
}

// Never announcea failing sync route:the signal is only for asked requests,so the assistant's
// Routed subscription stays its own. The worker( notify=true) announces failures there too.
private Task ResolveFailure(Guid id, string error, bool notify)
{
    var pending = Snapshot.Pending.Select(entry => entry.Id == id ? entrywith { Status = "Failed", Error = error } : entry).ToArray();
    if( !notify){ return SaveSilently(Snapshotwith { Pending = pending }); }
    return Save(Snapshotwith { Pending = pending }, new Routed(id, "", "", 0, error);
}

// The terminal step of Achieve,kept for the goal loop only:logs the recent decision, no Routed.

private async Task Remember(string state, string contract, string method, double confidence)
{
    var record = new RouteRecord(Clip(state), contract, method);
    var recent = Snapshot.Recent.Where(item => item.Request != record.Request || item.Contract != record.Contract).TakeLast(MaxRecent - 1).ToArray();
    await Save(Snapshotwith { Recent = [.. recent, record] }, new RouterDecided(Key, recent.Length + 1));
}

private Task SaveSilently(RouterStorage next)
{
    var previous = store.State;
    store.State = next;
    try { return store.WriteStateAsync(); }
    catch { store.State = previous; throw; }
}
```
- `Achieve` keeps its body unchanged;its terminal `await Remember(goal, steps[^1].Contract,
  steps[^1].Method, steps[^1].Confidence);` now binds the new `Remember(state, contract, method,
  confidence)` above. The old four-argument `Remember(Guid id...` and its `Routed` publication
  are gone.



**Failing test code**( apply first;then the contract and neuron edits make it pass):
`SystemOneRouterFacts.cs` - replace `RouteIsPublishedAsARoutedSignal` with:
```csharp
[Fact]
public async Task AskIsPublishedAsARoutedSignalOnceTheRouteCompletes()
{
    var ct = TestContext.Current.CancellationToken;
    using var server = new LoopbackServer();
    const string Contract = """{"model":"jev","answers":{"capability_0":{"type":"choice","choice":"timer","confidence":0.91,"probabilities":{"timer":0.91}}}}""";
    const string Method = """{"model":"jev","answers":{"method":{"type":"choice","choice":"Start","confidence":0.88,"probabilities":{"Start":0.88}}}}""";
    var replies = new[] { server.ReplyOnce("application/json", Contract, ct), server.ReplyOnce("application/json", Method, ct) };
    await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
    Stamp();
    await host.AuthorizeCallerAsync();
    var router = host.Get<IRouter>(Scope);
    await using var routed = await host.Observe<Routed>(router, ct);
    var id = Guid.NewGuid();


    await router.Ask(new RouteRequest(id, "start a countdown please", null), ct);


    var signal = await routed.NextAsync(ct: ct);
    Assert.Equal(typeof(ITimer).FullName, signal.Contract);
    Assert.Equal("Start", signal.Method);
    Assert.Equal(0.91, signal.Confidence;
    Assert.Equal(id, signal.Id);
    var pending = await router.Pending(id, ct);
    Assert.Equal("Routed", pending!.Status);
    Assert.Equal(id, pending.Id);
    Assert.Equal("start a countdown please", pending.State);
    await Task.WhenAll(replies);
}
```
The existing facts `DispatchRoutesToTheTimerAndStartsIt`, `RouteAnswersTheChosenContractAndMethod`,
`RouteChoosesARuntimeToolOnItsKeyWithoutAMethodQuestion`, `AchieveChainsCapabilitiesUntilTheGoalIsDone`,
`ASystemOneAnswerIsPublishedAsADecision` must stay green unchanged:they drive the sync `Route`/
`Dispatch`/`Achieve` over the same `RouteCore` path,and the new `SystemOneNeuron` answers them through
the TCS worker.( `DispatchRoutesToTheTimerAndStartsIt` awaits four LoopbackServer replies,in the same
order as before.) Removing the old fact from the suite is the intended behavior change:Routed is now
the Ask lifecycle only,so the assistant never sees another caller's routes.



**Verify:**
```bash
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/IRouter.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteRequest.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/PendingRoute.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/Signals/RoutingSignals.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterState.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/IRouterWork.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/ISystemOneWork.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/SystemOneNeuron.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs
timeout 300 dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/DigitalBrain.Modules.AI.Contracts.csproj
timeout 300 dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj
timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
```
Commit message: `AI: router routes as state, IRouter.Ask answers by Routed;SystemOne inference runs on a worker turn`


## Task S2-2: The systemone adapter is healthy only when the model is warm

**Executor:** DeepSeek. Python/container change;no csproj belongs to it,so unit facts cannot
drive a Docker HTTP service in this repo's harness;verification is the orchestration loop of
Task S2-5.

**Files:**
- `src/DigitalBrain.Modules/AI/systemone-adapter/server.py`( modify)
- `src/DigitalBrain.Modules/AI/systemone-adapter/README.md`( modify:add one line noting /health
  runs a warm-up inference and answers 503 until it succeeds)

**Produces.** In `server.py` keep the existing `_client`, `_MODEL` and `/v1/systemone` route
unchanged. Replace the `health` handler with the warm-up gate:
```python
_WARM = None


def _warm() -> bool:
    """One minimal inference:a one-option choice against _MODEL, answers a probe question.
    Aspire marks the resource healthy only when the model is warm,and the OS waits on that health."""
    global _WARM
    if _WARM is not None:
        return _WARM
    try:
        completion = _client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": "STATE:\n\nQUESTIONS:\n{\"probe\": {\"type\": \"choice\", \"criteria\": {\"ok\": null}, \"instructions\": \"Answer with the only option.\"}}"}],
            response_format={"type": "json_object"},
            temperature=0.0,
            timeout=5,
        )
        raw = completion.choices[0].message.content or "{}"
        answers = json.loads(raw).get("answers", {})
        _WARM = isinstance(answers, dict) and ("probe" in answers)
    except Exception:
        _WARM = False
    return _WARM


@app.get("/health")
def health() -> Response:
    if not _warm():
        return Response(status_code=503, content="{"status": "warming"}", media_type="application/json")
    return Response(content="{"status": "ok"}", media_type="application/json")
```
Change the FastAPI import to `from fastapi import FastAPI, Request, Response`. A failed probe
stays 503 and retries on the next health check;the probe has its own 5 s bound,so health never
hangs. A successful probe caches `_WARM = True`. no timeout is raised anywhere

**Verify:** no dotnet build/test for this task( no csproj;the adapter is exercised only under
Aspire, in Task S2-5) `git add src/DigitalBrain.Modules/AI/systemone-adapter/server.py
src/DigitalBrain.Modules/AI/systemone-adapter/README.md`. Commit message: `systemone-adapter: health
runs one warm-up inference and stays 503 until it succeeds`



## Task S2-3: The assistant posts Ask and ends;a Routed synapse answers

**Executor:** Claude. The OS app bundle( a shipped program,compiled at startup by
`OsShippedAppFacts`;the shell and traces only see its mentions.



**Files:**
- `src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs`( modify:move the contracts list here as
  `Assistant.Contracts`,add the usings it needs)
- `src/DigitalBrain.OS/Apps/Assistant/synapses/send.cs`( modify:it posts Ask and ends)
- `src/DigitalBrain.OS/Apps/Assistant/synapses/routed.cs`( create:the gate between Jev and the
  agent now lives here)
- `src/DigitalBrain.OS/Apps/Assistant/app.json`( modify:bump version to `1.6.0`;nothing else)
- `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/ShippedAssistant.cs`
  ( modify:parse the contracts array out of `lib/Assistant.cs` instead of `synapses/send.cs`)

**Implementation.**

`lib/Assistant.cs` - add these usings( keep the existing ones):
```csharp
using DigitalBrain.AI.Routing;
using DigitalBrain.Integrations;
using DigitalBrain.Mcp;
using DigitalBrain.Microsoft.CSharp.Files;
using DigitalBrain.Microsoft.Playwright;
using DigitalBrain.Postgres;
```
-and the shared contracts list as a static property of `Assistant`:
```csharp
// What the model may act on:the contracts this app composes. One list, compiled with every
// synapse (it lives in the lib so send.cs and routed.cs cannot drift).

public static string[] Contracts => [typeof(IConnectionRequests);
    typeof(IPostgresServer);
    typeof(IApp);
    typeof(IAppIndex);
    typeof(IWorkspace);
    typeof(IForm);
    typeof(ICSharpFile);
    typeof(IConsole);
    typeof(IFileSystem);
    typeof(IMcpServer);
    typeof(IPageTools)]
```
Wait - the collection-expression list above invalid. The correct form( one line):
```csharp
public static string[] Contracts => [typeof(IConnectionRequests).FullName!, typeof(IPostgresServer).FullName!, typeof(IApp).FullName!, typeof(IAppIndex).FullName!, typeof(IWorkspace).FullName!, typeof(IForm).FullName!, typeof(ICSharpFile).FullName!, typeof(IConsole).FullName!, typeof(IFileSystem).FullName!, typeof(IMcpServer).FullName!, typeof(IPageTools).FullName!];
```
( `IApp`, `IAppIndex` are already visible through the existing `using DigitalBrain.Apps;`.
 The tool-sources section introduces `IMcpServer` and `IPageTools` into this branch's contracts already -the
 current `send.cs` composes them today;if they ever lag,the orchestrator lands that section's module
 first)

`synapses/send.cs` - keep the usings; replace everything from the `string[] contracts = [...]` line
through the end of the `await foreach` body with:
```csharp
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Assistant.Key(brain));

// Jev first,as state:posting Ask records the request in the router's state and ends;the routed.cs
// synapse reacts to the Routed answer. The request id is the AppRequested.RequestId, so the two
// synapses share no state butthe router's.
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if( request.Operation != "send" || request.Input.Length is < 1 or > 32000) { continue; }
    await brain.Get<IRouter>(Assistant.Scope(brain)).Ask(new RouteRequest(request.RequestId,
        request.Input, null), brain.Stopping);
}
```

`synapses/routed.cs` - create, with this exact using set and file:
```csharp
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models;
using DigitalBrain.AI.Routing;
using DigitalBrain.AI.Routing.Signals;
using DigitalBrain.Apps;

// The assistant's answer path:one reaction to one Routed. A direct, confident route dispatches
// without the language model;anything else starts the agent turn with Jev's hint. The state text
// and the route come out of the router's own state( the two synapses share nothing but it).

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Assistant.Key(brain);

await foreach ( var routed in brain.On<Routed>(brain.Get<IRouter>(Assistant.Scope(brain), brain.Stopping)))
{
    var snapshot = await app.Read();
    var router = brain.Get<IRouter>(Assistant.Scope(brain);
    var pending = await router.Pending(routed.Id, brain.Stopping;
    if( pending is not { State: { } state }){ continue; }
    if( pending.Result is { } result } && result.Confidence >= Assistant.RouteGate(
        snapshot) && Assistant.IsDirect(result))
    {
        var outcome = await router.Dispatch(state, [result.Contract], brain.Stopping;
        await Assistant.Status(brain, outcome.Dispatched
            ? $"Jev: {result.Contract}.{result.Method}({result.Confidence:0.00})  {outcome.Result ?? "done"}"
            : $"Jev chose {result.Contract}.{result.Method} but could not carry it out: {outcome.Error}");
        continue;

    }
    var hint = pending.Result is { } h ? "\n\n" + h.Hint() : "";
    var reason = pending.Result is { } r ? $"Jev unsure({r.Confidence:0.00}); asking the model"
        : pending.Status == "Failed" ? "Jev unavailable; asking the model" : "Routing the model";
    await Assistant.Status(brain, reason);
    var choice = snapshot.Settings.GetValueOrDefault("Model", "");
    var model = choice.Length >  0 ? await brain.Get<IModelCatalog>("default").Select(choice) : null;
    var conversation = brain.Get<IAgent>(Assistant.Key(brain) + "/conversations/" + await Assistant.ConversationId(brain);
    await conversation.Start(AgentTurn.Text(state, instructions: snapshot.Files.GetValueOrDefault(
        "prompts/system.md", "") + hint, contracts: Assistant.Contracts())
        with { Model = model, RunId = routed.Id.ToString("N") };
}
```
The synapse references the same contracts through `Assistant.Contracts()` as send.cs did;`Ask`/
`PendingRoute` types come from `DigitalBrain.AI.Routing`( in the using set above).

`app.json`: bump `"version": "1.5.0"` to `"version": "1.6.0"`-nothing else.

 The
settings `Model`/`RouteGate` and the operations list stay.



`ShippedAssistant.cs` - replace the two lines that read `send.cs` with:
```csharp
var assistant = File.ReadAllText(Path.Combine(directory.FullName, Path.GetDirectoryName(os)!, "..", "Apps", "Assistant", "lib", "Assistant.cs"));
var list = Regex.Match(assistant, @"public static string\[\] Contracts => \[(?<types>[^\]]*)\];").Groups["types"].Value;
```
( Keep the deployed-catalog resolution lines unchanged)



**Failing test code**( the compile gate,no test body changes in this task):
```bash
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit --filter-class "*OsShippedAppFacts*"
```
- `EveryOsProgramCompilesAgainstCurrentContracts` fails until send.cs/routed.cs compile against
  the new router contracts,which Task S2-1 published already. Run this task after S2-1.



**Verify:**
```bash
git add src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs src/DigitalBrain.OS/Apps/Assistant/synapses/send.cs src/DigitalBrain.OS/Apps/Assistant/synapses/routed.cs src/DigitalBrain.OS/Apps/Assistant/app.json src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/ShippedAssistant.cs
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj
timeout 300 dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit --filter-class "*OsShippedAppFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests --filter-class "*AssistantGateFacts*"
```
( The `AssistantGateFacts` class is renamed by Task S2-4;until then its sync facts must stay
green over S2-1's `Route`/`Dispatch`) Commit message: `Assistant: send posts Ask and ends;
a new Routed synapse gates Jev against the agent`



## Task S2-4: The assistant's async gate facts;a slow route still publishes

**Executor:** DeepSeek. Test-only task;all production shapes landed in S2-1/S2-3;these
facts drive the exact calls the new synapses make.



**Files:**
- `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs`
  ( add one fact; `AskIsPublishedAsARoutedSignalOnceTheRouteCompletes` already landed in S2-1)
- `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs`
  ( rename class to `AssistantRoutedFacts`,rewrite its two Jev-gate facts over the Ask path;keep
  `WhenSystemOneIsUnavailableTheAssistantStillRunsTheAgentTurn` unchanged. Add `using DigitalBrain.
  AI.Routing.Signals;` to the file;`RouteRequest`/`PendingRoute` live in `DigitalBrain.AI.Routing`,
  already imported)



**Failing test code.**

In `SystemOneRouterFacts.cs`,add this fact( and its `Delayed` helper;attach the `Observe<Routed>`
before the `Ask`,so the signal cannot beat the observer):
```csharp
[Fact]
public async Task AnAskReturnsWhileTheRouteIsStillRoutingAndPublishesRoutedLater()
{
    var ct = TestContext.Current.CancellationToken;
    using var server = new LoopbackServer();
    const string Contract = """{"model":"jev","answers":{"capability_0":{"type":"choice","choice":"timer","confidence":0.95,"probabilities":{"timer":0.95}}}}""";
    const string Method = """{"model":"jev","answers":{"method":{"type":"choice","choice":"Start","confidence":0.95,"probabilities":{"Start":0.95}}}}""";
    var replies = new[] { Delayed(server, Contract, ct), Delayed(server, Method, ct) };
    await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
    Stamp();
    await host.AuthorizeCallerAsync();
    var router = host.Get<IRouter>(Scope);
    await using var routed = await host.Observe<Routed>(router, ct);
    var id = Guid.NewGuid();


    await router.Ask(new RouteRequest(id, "start a countdown please", null), ct);


    // The one-way shape:the Ask returned,butthe route is still Routing until the slow model answers.
    Assert.Equal("Routing", (await router.Pending(id, ct)!.Status);
    var signal = await routed.NextAsync(ct: ct);
    Assert.Equal("Start", signal.Method);
    Assert.Equal(id, signal.Id);
    Assert.Equal("Routed", (await router.Pending(id, ct)!.Status);
    await Task.WhenAll(replies;
}

private Task<CapturedRequest> Delayed(LoopbackServer server, string body, CancellationToken ct)
    => Task.Run(async () =>
    {
        await Task.Delay(TimeSpan.FromSeconds(1.5), ct);
        return await server.ReplyOnce("application/json", body, ct);
    }, ct);
```
( The 1.5 s delay stands in for a model slower than the Orleans response bound;the exact
"longer than 30 s" case is covered by the Task S2-5 verification loop,where the unit suite
cannot wait that long.)

In `Scenarios/AssistantGateFacts.cs`:rename the class to `AssistantRoutedFacts`,update the class comment,
and rewrite the two gate facts( keeping `Start`, `Choose`, `Fill`, `AllChatRequests`, `Text`, `Stamp`,
`SystemPrompt`, `Scope`, `Calculator`, `Conversation` unchanged):
```csharp
[Fact]
public async Task AboveTheGateAnAskedRouteDispatchesWithoutAnAgentTurn()
{
    var ct = TestContext.Current.CancellationToken;
    await using var model = await FakeModelServer.StartAsync(ct;
    model.SystemOneOverride = request => Choose(request, "apps.app2", "Request", 0.95);
    model.ChatFallback = request => Fill(request, Calculator, """["open",""]""";
    await using var host = await Start(model, ct;
    Stamp();
    await host.AuthorizeCallerAsync();
    var app = host.Get<IApp>(Calculator);
    await app.Create(new AppManifest("Calculator", "keypad", [new("open", "open the keypad")], [], []),"spec");
    await using var requested = await host.SubscribeAsync<AppRequested>(app, ct);
    await using var signals = requested.ReadAllAsync(ct).GetAsyncEnumerator(ct;
    var router = host.Get<IRouter>(Scope);
    await using var routed = await host.Observe<Routed>(router, ct;
    var id = Guid.NewGuid();


    // The send synapse's calls,driven as the routed.cs gate does.
    await router.Ask(new RouteRequest(id, "open calculator", null), ct;


    var signal = await routed.NextAsync(ct: ct;
    Assert.Equal(typeof(IApp).FullName, signal.Contract);
    Assert.Equal(0.95, signal.Confidence);
    var pending = await router.Pending(id, ct;
    Assert.True(pending!.Result!.Confidence >= 0.8 &&
        pending..Result.Contract == typeof(IApp).FullName &&
        pending..Result.Method == nameof(IApp.Request);
    var outcome = await router.Dispatch(pending.State!, [signal.Contract], ct;


    Assert.True(outcome.Dispatched, outcome.Error);
    Assert.True(await signals.MoveNextAsync();
    Assert.Equal("open", signals.Current.Operation);
    Assert.DoesNotContain( AllChatRequests(model), request => Text(request).Contains(
        SystemPrompt, StringComparison.Ordinal);
}

[Fact]
public async Task BelowTheGateAnAskedRouteStartsTheAgentTurnWithJevsHints()
{
    var ct = TestContext.Current.CancellationToken;
    await using var model = await FakeModelServer.StartAsync(ct;
    model.SystemOneOverride = request => Choose(request, "apps.app2", "Request", 0.41;
    await using var host = await Start(model, ct;
    Stamp();
    await host.AuthorizeCallerAsync();
    var router = host.Get<IRouter>(Scope;
    await using var routed = await host.Observe<Routed>(router, ct;
    var id = Guid.NewGuid();


    await router.Ask(new RouteRequest(id, "what can you do?", null), ct;


    var signal = await routed.NextAsync(ct: ct;
    var pending = await router.Pending(id, ct;
    Assert.True(pending!.Result!.Confidence < 0.8;
    var events = new List<AgentTurnEvent>();
    await foreach( var item in host.Get<IAgent>(Conversation).Run(
        AgentTurn.Text(pending.State!, instructions: SystemPrompt + "\n\n" + pending.Result.Hint(), contracts: ShippedAssistant.Contracts()), ct))
    { events.Add(item; }
    Assert.Empty(events.OfType<AgentTurnEvent.Failed>());
    var turn = Assert.Single(AllChatRequests(model), request => Text(request).Contains(
        SystemPrompt, StringComparison.Ordinal);
    Assert.Contains("Likely capabilities (Jev):", Text(turn), StringComparison.Ordinal;
    Assert.Contains(typeof(IApp).FullName + ".Request (0.41)", Text(turn), StringComparison.Ordinal;
}
```
`WhenSystemOneIsUnavailableTheAssistantStillRunsTheAgentTurn` keeps its sync `Route` throws fact
-the new `Route` re-throws through the TCS worker fault path,unchanged.



**Verify:**
```bash
git add src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs
timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests --filter-method "*AskIsPublished*" --filter-method "*RoutedFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
```
Commit message: `AI tests: assistant gate over Ask/Routed;a slow route still publishes`



## Task S2-5: Verification loop over a running host

**Executor:** Claude( or the orchestrator). No code changes;drive the running system per
`CLAUDE.md`'s Verification loop.



**Files:** none( the branch is exercised as-is).

**Procedure**( each step maps to one fact in Section 2 of the spec):
```bash
git add --dry-run .     # everything committed by other tasks;nothing new here
timeout 900 dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj
timeout 900 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
timeout 900 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting
cd src/DigitalBrain.AppHost && aspire run
```
1. **Readiness fact**:`mcp__aspire__list_resources`-the`systemone` container is `Unhealthy`/`Starting` while the Ollama model cold-starts,then
   flips to`Healthy` only after the first warm-up inference succeeds. `mcp__aspire__list_console_logs` for`systemone` shows the probes answering 503( `{"status":"warming"}`)until the first inference,then 200. The OS waits on that health as today( the consumer's `WaitAnnotation` is unchanged). If any resource isn't Running/Healthy,read its console logs before anything else.
2. **Routes as state fact** - through `digitalbrain-mcp`( `localhost:5081/mcp`;`/brains/{brainId}/mcp` selects a brain):
    - `neurons_context`:confirm which caller and brain you're acting as.
    - `neurons_call` on contract `DigitalBrain.Apps.IApp`, key `{brain}/apps/assistant`, method
      `Request`, arguments `["send","open calculator"]` -> returns the `Guid` request id.
    - `neurons_call` on `DigitalBrain.AI.Routing.IRouter`, key `{brain}`, method `Pending`, arguments
      `["<the guid>","{}"]`;immediately after the send it reads `"Status":"Routing"`;after the route it
      reads `"Status":"Routed"` with `Result.Contract == "DigitalBrain.Apps.IApp"`,`Method == "Request"`,`and`Confidence >= 0.8`. The assistant answers the direct route with no agent turn:verify via `neurons_get` on the calculator's surface( its state changed (a window open)) The `neurons_call` on `Ask` stays a thin record-and-return;the model's slowness delays only the published `Routed`,never any caller's await.
3. **A route whose model takes longer than the Orleans timeout still completes**:same drive against a cold model( skip the warm-up;send immediately after boot):the`Pending` flips to`Routed` after the cold start( ~58 s),well past the 30 s Orleans response bound,and the two synapses carry the turn. This is the headline fact,which the unit suite cannot wait for.
4. **Traces**:`mcp__aspire__list_traces` search`ai.route`/`systemone`:expect spans for the
   `Request`->`Ask`->(worker)->`Routed`->`Dispatch` chain;`mcp__aspire__list_trace_structured_logs` follows one trace end to end,and shows the HTTP inference happening outside the router grain's answering turn. `list_structured_logs` shows the assistant's `Routed` reaction.
5. **Adapter health 503 before,200 after**:the console-log regime above;and/or `curl
   http://localhost:{aspire-assigned port}/health` before the warm-up -> 503,after the first route-> 200.
6. **Regression net**:the unit and E2E suites of every project touched:S2-1's AI tests,`*OsShippedAppFacts*`,the AI tests hosting project,and the AI tests with the renamed `AssistantRoutedFacts`.





## Orchestrator ( integration, after these tasks)

- No new projects in this section,so no slnx/`DigitalBrain-lsp.sln` entries or `OsCatalog` changes
  are needed.
- The assistant app version `1.6.0` is published at startup by the existing shipped-app publisher( Section
  1's reconciler later consumes it -out of scope here).
- Cross-section handoff for Section 3( the next section):this plan's `Routed(Guid Id`)`,`IRouter.Ask`/
  `Pending`, the router's Pending stateand`routed.cs`'s gate branch are its premises. Section 3 later moves
  `Assistant.IsDirect` into `RouteResult.IsDirect`-the routed.cs line `Assistant.IsDirect(result)` changes then.






## Open questions

1. **`Routed.Error` is this plan's one additive field** beyond the spec's `Routed(Id, Contract, Method,
   Confidence)`. It exists so an asked route that fails( model down) still wakes the assistant's synapse to fall back to the agent;otherwise that request would hang indefinitely. Confirm the orchestrator accepts this extension( or prefers a separate `RouteFailed` signal -which would force a second synapse,against the"a synapse is one reaction"rule).
2. **Sync `Route`/`Dispatch`/`Achieve` no longer publish `Routed`**( they keep `RouterDecided` and the
   return value). The spec keeps them"for callers that can wait"and the fact only names the Ask lifecycle's
   `Routed`;the assistant's Routed subscription must never see other callers' routes( the Router OS app's
   `Achieve` would otherwise collide) If the orchestrator wants sync paths to keep publishing,gate
   `routed.cs` needs a caller-identity field on `Routed` -a larger contract change than this section wants.
3. **The SystemOne worker is best-effort**:the `_pending` TCS lives in the activation;an activation loss
   in the gap between `Ask` and the worker turn leaves the caller's task uncompleted( the HTTP still runs and
   publishes `SystemOneDecided`). The repo's"no state compatibility"and at-least-once norms make this
   acceptable for this section;the router's async Ask( whose own caller doesn't wait) is unaffected.
4. **The assistant is the only `Ask` caller in the OS today**-so`routed.cs` structurally sees only its
   own ids. A second Ask-posting app would collide;the"cross-app subscription scopes"open design front(
   CLAUDE.md) owns that future fix.