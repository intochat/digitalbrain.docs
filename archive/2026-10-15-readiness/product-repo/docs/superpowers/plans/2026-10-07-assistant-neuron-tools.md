# Assistant and digitalbrain-mcp Act Through Neuron Contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The assistant and `digitalbrain-mcp` share one neuron-contract tool surface, so "which tables are in Supabase?" → "show data from Demo" works through `IPostgresServer` and the Data Visualizer app, and the capability registry, module table windows and Supabase's Postgres copy are deleted.

**Architecture:** A `NeuronSurface` in `DigitalBrain.Framework` (contract lookup, search, reflective call) is the single implementation; the Assistant module adapts it to `AIFunction`s and `digitalbrain-mcp` adapts it to MCP tools, with shared names and descriptions. Apps are reached as neurons (`IApp.Invoke` + a new push-based `IApp.Await`). Everything that existed to steer the model to hand-written tools is removed.

**Tech Stack:** .NET 11 RC, Orleans, Microsoft.Extensions.AI, ModelContextProtocol C# SDK, xUnit v3, `DigitalBrain.Testing.Module`, Aspire.

**Spec:** `docs/superpowers/specs/2026-10-07-assistant-neuron-tools-design.md`

## Spec amendments found while planning

These follow from the code and are binding for this plan:

1. **Shared core, not shared factories.** `digitalbrain-mcp` is a brain *client* process; `CSharpAgentTools` and `WorkspaceFormTools` need silo services. Parity is: the `neurons_*` tools come from one `NeuronSurface` with one set of names/descriptions in both hosts. Claude reaches authoring and app operations through contracts (`IApp.WriteBehavior`, `IApp.Invoke`) or by talking to the assistant app.
2. **`neurons_list` lists contracts** (today's MCP meaning), not keys. Keys come from contracts (`IAppIndex.List`) and from the documented key shapes `{brainScope}/apps/{name}` and `connection/{brain}/{connector}/{id}`. `IConnectionIndex` stays `[PlatformOnly]`. `list_neurons` / `list_active_neurons` / `list_synapses` are removed with `RegistryInventoryTools`.
3. **`neurons_context` joins the shared set** so the model knows its brain id when forming keys.
4. **Brain boundary is the neuron's own access check**, as it is for MCP today; no key-prefix check in tool code (key shapes differ per neuron).
5. **`IPostgresServer` is already a `ConnectionNeuron`** keyed `connection/{brain}/postgres/{id}` — no Postgres work is needed for Supabase-as-connection.
6. **`IApp.Await(Guid)`** is added: `Invoke` returns a pending invocation and today's `AppCalls.AwaitResponse` polls every 200 ms, which the project forbids.

## Global Constraints

- LSP (`csharp-ls`) for every symbol change: `findReferences` before moving or deleting a type; LSP diagnostics clean before building. Never grep code.
- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project <test project>`.
- Warnings are errors; nullable on; no boilerplate `/// <summary>`; tests are facts with sentence names using `TestContext.Current.CancellationToken`.
- No state compatibility: reshape grain state freely; wipe Azurite on a `wireType` error.
- No timeouts raised, no polling added to make anything pass.
- A C# record wire-shape change updates Dart in the same task.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A platform-only contract named in `neurons_call`** (e.g. `IConnectionIndex`, `IConnectionInbound`) must be refused as unknown, not invoked — test in Task 1.
2. **The assistant calling a neuron it may not touch** (another brain's app) must fail at the neuron's access check with the app as caller — test in Task 3.
3. **`IApp.Await` on an invocation that already finished, or that fails** must return immediately / return the failed invocation, never hang — tests in Task 2.
4. **Malformed `arguments` JSON or wrong arity in `neurons_call`** must return a repairable error to the model, not fault the turn — test in Task 3.
5. **The assistant prompt naming a removed tool** (`discover_capabilities`, `postgres_schema`) must not exist anywhere after the change — check in Task 7.

---

### Task 1: `NeuronSurface` in Framework; digitalbrain-mcp uses it

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Modules/NeuronSurface.cs`
- Move: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/Tools/NeuronContracts.cs` → `src/DigitalBrain.Framework/DigitalBrain.Framework/Modules/NeuronContracts.cs` (namespace `DigitalBrain.Framework`)
- Modify: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/Tools/NeuronTools.cs`, `src/DigitalBrain.Mcp/DigitalBrain.Mcp/McpHosting.cs`, `src/DigitalBrain.Mcp/DigitalBrain.Mcp/McpCaller.cs`
- Test: `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronContractFacts.cs` (update namespace), create `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronSurfaceFacts.cs`

**Interfaces:**
- Produces:
  - `public sealed class NeuronContracts(IEnumerable<Assembly>)` with `Names`, `Find(string)`, `static Assembly[] Deployed()` (unchanged API, new namespace).
  - `public sealed class NeuronSurface(IDigitalBrain brain, NeuronContracts contracts, NeuronTypeSearch search)` with
    `IReadOnlyList<string> List()`,
    `Task<IReadOnlyList<NeuronTypeHit>> Search(string query, CancellationToken ct)`,
    `string Get(string contract, string key)`,
    `Task<JsonElement?> Call(string contract, string key, string method, string arguments, CancellationToken ct)`.
  - `public static class NeuronSurfaceTools` with constants `ListName = "neurons_list"`, `SearchName = "neurons_search"`, `GetName = "neurons_get"`, `CallName = "neurons_call"`, `ContextName = "neurons_context"` and matching `*Description` strings.

- [ ] **Step 1: Map.** LSP `findReferences` on `NeuronContracts`, `NeuronTools`, `McpCaller.Context`. Record every site; they all change in this task.

- [ ] **Step 2: Write the failing tests** (`NeuronSurfaceFacts.cs`):

```csharp
using System.Text.Json;
using DigitalBrain.Framework;

namespace DigitalBrain.Mcp.Tests.Unit;

public sealed class NeuronSurfaceFacts
{
    [Fact]
    public void APlatformOnlyContractIsNotAddressable()
    {
        var contracts = new NeuronContracts(NeuronContracts.Deployed());
        Assert.DoesNotContain(typeof(DigitalBrain.Framework.Platform.Connections.IConnectionIndex).FullName!, contracts.Names);
        Assert.Throws<ArgumentException>(() => contracts.Find(typeof(DigitalBrain.Framework.Platform.Connections.IConnectionIndex).FullName!));
    }

    [Fact]
    public void ToolNamesAndDescriptionsAreDefinedOnce()
    {
        Assert.Equal(["neurons_list", "neurons_search", "neurons_get", "neurons_call", "neurons_context"],
            [NeuronSurfaceTools.ListName, NeuronSurfaceTools.SearchName, NeuronSurfaceTools.GetName, NeuronSurfaceTools.CallName, NeuronSurfaceTools.ContextName]);
        Assert.All(new[] { NeuronSurfaceTools.ListDescription, NeuronSurfaceTools.SearchDescription, NeuronSurfaceTools.GetDescription,
            NeuronSurfaceTools.CallDescription, NeuronSurfaceTools.ContextDescription }, description => Assert.False(string.IsNullOrWhiteSpace(description)));
    }

    [Fact]
    public async Task WatchIsNotCallable()
    {
        var surface = new NeuronSurface(new FakeBrain(), new NeuronContracts(NeuronContracts.Deployed()), null!);
        await Assert.ThrowsAsync<ArgumentException>(() => surface.Call(typeof(DigitalBrain.Apps.IApp).FullName!, "b/apps/x", "Watch", "[null]", TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task MalformedArgumentsAreAnArgumentError()
    {
        var surface = new NeuronSurface(new FakeBrain(), new NeuronContracts(NeuronContracts.Deployed()), null!);
        await Assert.ThrowsAsync<ArgumentException>(() => surface.Call(typeof(DigitalBrain.Apps.IApp).FullName!, "b/apps/x", "Read", "{not json", TestContext.Current.CancellationToken));
    }
}
```

`FakeBrain` is the existing test double implementing `IDigitalBrain` (LSP `goToImplementation` on `IDigitalBrain` in test projects; reference its project or copy the minimal `Get<T>` that returns a `DispatchProxy` — prefer the existing one).

- [ ] **Step 3: Run, expect FAIL (types missing).**
Run: `dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit -- --filter-class "*NeuronSurfaceFacts*"`

- [ ] **Step 4: Move `NeuronContracts`** to Framework (namespace `DigitalBrain.Framework`); update the MCP test's `using`.

- [ ] **Step 5: Create `NeuronSurface.cs`** — the body of today's `NeuronTools.Call/Get/List/Search` with stamping removed (the host stamps) and JSON errors normalised:

```csharp
using System.Reflection;
using System.Text.Json;

namespace DigitalBrain.Framework;

public static class NeuronSurfaceTools
{
    public const string ListName = "neurons_list";
    public const string SearchName = "neurons_search";
    public const string GetName = "neurons_get";
    public const string CallName = "neurons_call";
    public const string ContextName = "neurons_context";

    public const string ListDescription = "List neuron contracts you can address. Pass the full type name to neurons_get and neurons_call.";
    public const string SearchDescription = "Search neuron contracts by what they do. Returns each match's contract type name, methods and signals.";
    public const string GetDescription = "Resolve a neuron. contract is a full type name from neurons_list; key is the grain key: an app is {brainScope}/apps/{name}, a connection is connection/{brain}/{connector}/{id}.";
    public const string CallDescription = "Call a neuron method. arguments is a JSON array, one element per method argument, omitting CancellationToken. Watch and Unwatch are not callable. To use an app: IApp.Invoke with {invocationId, operation, input}, then IApp.Await with that invocationId.";
    public const string ContextDescription = "Read who you are acting as and the current brain id and scope, for forming neuron keys.";
}

public sealed class NeuronSurface(IDigitalBrain brain, NeuronContracts contracts, NeuronTypeSearch search)
{
    private static readonly HashSet<string> ObserverMethods = [nameof(INeuron.Watch), nameof(INeuron.Unwatch)];
    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
    private static readonly MethodInfo GetNeuron = typeof(IDigitalBrain).GetMethod(nameof(IDigitalBrain.Get))!;

    public IReadOnlyList<string> List() => [.. contracts.Names.Order(StringComparer.Ordinal)];

    public Task<IReadOnlyList<NeuronTypeHit>> Search(string query, CancellationToken ct) => search.Search(query, ct: ct);

    public string Get(string contract, string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        return Neuron(contracts.Find(contract), key).GetGrainId().ToString();
    }

    public async Task<JsonElement?> Call(string contract, string key, string method, string arguments, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentException.ThrowIfNullOrWhiteSpace(method);
        var type = contracts.Find(contract);
        JsonElement[] payload;
        try { payload = JsonSerializer.Deserialize<JsonElement[]>(arguments, Json) ?? []; }
        catch (JsonException error) { throw new ArgumentException("arguments must be a JSON array: " + error.Message, nameof(arguments)); }
        var target = type.GetMethods().Concat(type.GetInterfaces().SelectMany(inherited => inherited.GetMethods()))
            .Where(candidate => candidate.Name == method && !ObserverMethods.Contains(candidate.Name))
            .SingleOrDefault(candidate => candidate.GetParameters().Count(IsArgument) == payload.Length)
            ?? throw new ArgumentException($"{type.Name} has no method {method} taking {payload.Length} arguments.");
        var parameters = target.GetParameters();
        var values = new object?[parameters.Length];
        for (int index = 0, argument = 0; index < parameters.Length; index++)
        {
            try { values[index] = IsArgument(parameters[index]) ? payload[argument++].Deserialize(parameters[index].ParameterType, Json) : ct; }
            catch (JsonException error) { throw new ArgumentException($"Argument {argument} of {method}: {error.Message}", nameof(arguments)); }
        }
        object? returned;
        try { returned = target.Invoke(Neuron(type, key), values); }
        catch (TargetInvocationException error) when (error.InnerException is not null) { throw error.InnerException; }
        if (returned is not Task task) { throw new NotSupportedException($"{type.Name}.{target.Name} does not return a Task."); }
        await task.ConfigureAwait(false);
        if (!target.ReturnType.IsGenericType) { return null; }
        var result = target.ReturnType.GetProperty(nameof(Task<object>.Result))!.GetValue(task);
        return JsonSerializer.SerializeToElement(result, target.ReturnType.GetGenericArguments()[0], Json);
    }

    private IAddressable Neuron(Type contract, string key)
        => (IAddressable)GetNeuron.MakeGenericMethod(contract).Invoke(brain, [new NeuronId(key)])!;

    private static bool IsArgument(ParameterInfo parameter) => parameter.ParameterType != typeof(CancellationToken);
}
```

- [ ] **Step 6: Rewire MCP.** `NeuronTools` keeps `[McpServerTool]` methods but each one is `caller.Stamp(); return surface.X(...)`, with `Name = NeuronSurfaceTools.*Name` and `Description(NeuronSurfaceTools.*Description)`. `McpCaller.Context` uses `ContextName`/`ContextDescription`. In `McpHosting`: `services.AddSingleton(new NeuronContracts(NeuronContracts.Deployed()));` and `services.AddScoped<NeuronSurface>();` (scoped because `IDigitalBrain` is scoped there); `ContractCatalog` uses the same `Deployed()` assemblies.

- [ ] **Step 7: LSP diagnostics clean; build and test.**
Run: `dotnet build src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj` then `dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit`
Expected: PASS (all facts, including the existing `NeuronContractFacts`, `McpIdentityFacts`).

- [ ] **Step 8: Commit** — `Framework: NeuronSurface is the one neuron-contract tool core; digitalbrain-mcp adapts it`.

---

### Task 2: `IApp.Await` — an app answer is pushed, not polled

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs`
- Modify: the `IApp` implementation (`Invoke` at `AppNeuron` ~line 374; find it with LSP `goToImplementation` on `IApp.Invoke`)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppCalls.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/AppAwaitFacts.cs`

**Interfaces:**
- Produces: `[AlwaysInterleave, ResponseTimeout("00:05:00")] Task<AppInvocation> Await(Guid invocationId);` on `IApp` — returns the invocation once it is `Completed` or `Failed`; returns at once if it already is; throws `KeyNotFoundException` for an unknown id.
- `AppCalls.AwaitResponse` keeps its signature and calls `Await` once (no loop, no `Task.Delay`).

- [ ] **Step 1: Map.** LSP `findReferences` on `IApp.Invoke`, `IApp.Respond`, `IApp.ReadInvocation`, `AppCalls.AwaitResponse`, `AppCalls.Ask`.

- [ ] **Step 2: Write the failing tests.** Build the app the way neighbouring Apps facts do (LSP `findReferences` on `IApp.Create` in `DigitalBrain.Modules.Apps.Tests` and copy that setup, including the caller stamp):

```csharp
[Fact]
public async Task AwaitReturnsTheAnswerWhenTheScriptResponds()
{
    var (brain, app) = await CreatedAppWithOperation("echo"); // helper copied from neighbouring facts
    var invocation = await app.Invoke(new(Guid.NewGuid(), "echo", "hi"));
    var waiting = app.Await(invocation.Id);
    Assert.False(waiting.IsCompleted);
    await app.Respond(new AppResponse(invocation.Id, "hi back", null));
    var done = await waiting.WaitAsync(TestContext.Current.CancellationToken);
    Assert.Equal(InvocationStatus.Completed, done.Status);
    Assert.Equal("hi back", done.Output);
}

[Fact]
public async Task AwaitOnAFinishedInvocationReturnsAtOnce()
{
    var (_, app) = await CreatedAppWithOperation("echo");
    var invocation = await app.Invoke(new(Guid.NewGuid(), "echo", "hi"));
    await app.Respond(new AppResponse(invocation.Id, null, "boom"));
    var done = await app.Await(invocation.Id).WaitAsync(TestContext.Current.CancellationToken);
    Assert.Equal(InvocationStatus.Failed, done.Status);
    Assert.Equal("boom", done.Error);
}

[Fact]
public async Task AwaitOnAnUnknownInvocationIsNotFound()
{
    var (_, app) = await CreatedAppWithOperation("echo");
    await Assert.ThrowsAsync<KeyNotFoundException>(() => app.Await(Guid.NewGuid()));
}
```

- [ ] **Step 3: Run, expect FAIL** (`Await` missing).
Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppAwaitFacts*"`

- [ ] **Step 4: Implement.** Contract:

```csharp
    // Completes when the app's script answers the invocation; at once if it already has.
    [Orleans.Concurrency.AlwaysInterleave, ResponseTimeout("00:05:00")] Task<AppInvocation> Await(Guid invocationId);
```

Neuron (in-memory waiters; `Await` only reads, so interleaving is safe):

```csharp
    private readonly Dictionary<Guid, TaskCompletionSource<AppInvocation>> waiters = [];

    public Task<AppInvocation> Await(Guid invocationId)
    {
        var invocation = Snapshot.Invocations.Find(item => item.Id == invocationId)
            ?? throw new KeyNotFoundException($"No invocation {invocationId}.");
        if (invocation.Status != InvocationStatus.Pending) { return Task.FromResult(invocation); }
        if (!waiters.TryGetValue(invocationId, out var waiter))
        { waiters[invocationId] = waiter = new(TaskCreationOptions.RunContinuationsAsynchronously); }
        return waiter.Task;
    }
```

At the end of `Respond`, after the state is saved with the finished invocation:

```csharp
        if (waiters.Remove(response.InvocationId, out var waiter)) { waiter.TrySetResult(finished); }
```

(`finished` is the `AppInvocation` `Respond` returns.) `AppCalls.AwaitResponse` becomes:

```csharp
    public static async Task<string> AwaitResponse(this IApp app, Guid invocationId, CancellationToken cancellationToken = default)
    {
        var invocation = await app.Await(invocationId).WaitAsync(cancellationToken);
        if (invocation.Status == InvocationStatus.Failed) { throw new InvalidOperationException(invocation.Error ?? "The app failed."); }
        return invocation.Output ?? "";
    }
```

- [ ] **Step 5: LSP diagnostics clean; run Apps tests.**
Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS.

- [ ] **Step 6: Commit** — `Apps: IApp.Await pushes an invocation's answer; AppCalls stops polling`.

---

### Task 3: `NeuronAgentTools` — the assistant gets the shared surface

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/NeuronAgentTools.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantModule.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/NeuronAgentToolsFacts.cs`

**Interfaces:**
- Consumes: `NeuronSurface`, `NeuronContracts`, `NeuronSurfaceTools` (Task 1); `IApp.Await` (Task 2).
- Produces: `internal sealed class NeuronAgentTools(NeuronSurface surface) : IAgentToolFactory` returning five `AIFunction`s named by `NeuronSurfaceTools.*Name`. Errors of kind `ArgumentException`, `KeyNotFoundException`, `UnauthorizedAccessException`, `InvalidOperationException` become `{ isError = true, message }` results.

- [ ] **Step 1: Write the failing tests** using the module harness (`ModuleTest.Create().WithModule<AssistantModule>().WithModule<AppsModule>()` — copy the exact builder calls from an existing Assistant fact that uses `ModuleTest`; LSP `findReferences` on `ModuleTest.Create` in this test project):

```csharp
public sealed class NeuronAgentToolsFacts
{
    [Fact]
    public async Task TheToolsAreTheSharedSurface()
    {
        await using var host = await AssistantHost();
        var names = host.Services.GetServices<IAgentToolFactory>().OfType<NeuronAgentTools>().Single()
            .Create(() => new("scope", "run", "call")).Select(tool => tool.Name);
        Assert.Equal([NeuronSurfaceTools.ListName, NeuronSurfaceTools.SearchName, NeuronSurfaceTools.GetName,
            NeuronSurfaceTools.CallName, NeuronSurfaceTools.ContextName], names);
    }

    [Fact]
    public async Task ACallRunsAsTheCallingAppAndAForeignAppIsRefused()
    {
        await using var host = await AssistantHost();
        StampAppCaller(host, brain: "alice", app: "assistant");   // CallerKind.App, as AgentTurnLoop sees it
        var call = Tool(host, NeuronSurfaceTools.CallName);
        var foreign = await call.InvokeAsync(new() {
            ["contract"] = typeof(IApp).FullName, ["key"] = IApp.Key(BrainScope.Create("bob", "bob").Id, "datavisualizer"),
            ["method"] = "Read", ["arguments"] = "[]" }, TestContext.Current.CancellationToken);
        Assert.True(((JsonElement)foreign!).GetProperty("isError").GetBoolean());
    }

    [Fact]
    public async Task WrongArityIsARepairableError()
    {
        await using var host = await AssistantHost();
        StampAppCaller(host, brain: "alice", app: "assistant");
        var result = await Tool(host, NeuronSurfaceTools.CallName).InvokeAsync(new() {
            ["contract"] = typeof(IApp).FullName, ["key"] = "x", ["method"] = "Read", ["arguments"] = "[1,2,3]" },
            TestContext.Current.CancellationToken);
        Assert.Contains("has no method Read taking 3 arguments", ((JsonElement)result!).GetProperty("message").GetString());
    }
}
```

`AssistantHost`, `StampAppCaller` and `Tool` are private helpers in the file: the host builder from the neighbouring fact; the caller stamp shaped like `DiscoveryFacts.Caller` but `Kind = CallerKind.App, AppId = IApp.Key(scope, app)`; `Tool` picks the `AIFunction` by name from `NeuronAgentTools.Create`.

- [ ] **Step 2: Run, expect FAIL.**
Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests -- --filter-class "*NeuronAgentToolsFacts*"`

- [ ] **Step 3: Implement `NeuronAgentTools.cs`:**

```csharp
using System.ComponentModel;
using DigitalBrain.AI.Tools;
using DigitalBrain.Framework;
using Microsoft.Extensions.AI;

namespace DigitalBrain.Assistant;

// The assistant acts through the same neuron surface digitalbrain-mcp serves; the caller is
// whoever runs the turn (the assistant app), and each neuron's own access decides.
internal sealed class NeuronAgentTools(NeuronSurface surface) : IAgentToolFactory
{
    public IReadOnlyList<AIFunction> Create(Func<AgentToolContext> context) =>
    [
        AIFunctionFactory.Create(() => surface.List(), NeuronSurfaceTools.ListName, NeuronSurfaceTools.ListDescription),
        AIFunctionFactory.Create(([Description("What you want to do.")] string query, CancellationToken ct) =>
            Guard(async () => (object)await surface.Search(query, ct)), NeuronSurfaceTools.SearchName, NeuronSurfaceTools.SearchDescription),
        AIFunctionFactory.Create((string contract, string key) =>
            Guard(() => Task.FromResult<object>(surface.Get(contract, key))), NeuronSurfaceTools.GetName, NeuronSurfaceTools.GetDescription),
        AIFunctionFactory.Create((string contract, string key, string method, string arguments, CancellationToken ct) =>
            Guard(async () => (object?)await surface.Call(contract, key, method, arguments, ct) ?? new { ok = true }),
            NeuronSurfaceTools.CallName, NeuronSurfaceTools.CallDescription),
        AIFunctionFactory.Create(() => CallerContextStamper.Require(), NeuronSurfaceTools.ContextName, NeuronSurfaceTools.ContextDescription),
    ];

    private static async Task<object> Guard(Func<Task<object>> action)
    {
        try { return await action(); }
        catch (Exception error) when (error is ArgumentException or KeyNotFoundException or UnauthorizedAccessException or InvalidOperationException)
        { return new { isError = true, message = error.Message }; }
    }
}
```

In `AssistantModule.Configure`:

```csharp
        silo.Services.TryAddSingleton(new NeuronContracts(NeuronContracts.Deployed()));
        silo.Services.TryAddSingleton<NeuronSurface>();
        silo.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, NeuronAgentTools>());
```

(`NeuronTypeSearch` and `ContractCatalog` are already registered by `BrainHosting.AddContractCatalog`; confirm with LSP `findReferences` on `AddContractCatalog`. If the silo's `IDigitalBrain` is scoped, register `NeuronSurface` scoped to match.)

- [ ] **Step 4: LSP diagnostics clean; run the Assistant tests.** Expected: the three new facts PASS; existing facts PASS.

- [ ] **Step 5: Commit** — `Assistant: the neuron surface is the assistant's tool set`.

---

### Task 4: Delete Postgres.Windows

**Files:**
- Delete: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/` and `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests/`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:27`, `src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` (project reference), `DigitalBrain.slnx`, the gitignored `DigitalBrain-lsp.sln` if present
- Modify: `src/DigitalBrain.Modules/Postgres/README.md` (drop the windows section)

- [ ] **Step 1: Map.** LSP `findReferences` on `PostgresWindowsModule`, `PostgresTools`, `PostgresAppResources`, `LiveTableWindows` (the last is Supabase-owned; note who uses it). Every reference outside the two deleted folders must be in the files above or in Task 5.
- [ ] **Step 2: Delete the folders; remove the module from `OsCatalog`, the project reference and the `.slnx` entries.**
- [ ] **Step 3: Build and test the OS host.**
Run: `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` then `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` and `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: PASS. A composition fact that names the windows module is updated to the new module list in this step.
- [ ] **Step 4: Commit** — `Postgres: remove the windows module; data is shown by the Data Visualizer app`.

---

### Task 5: Supabase keeps only its backing store

**Files:**
- Delete from `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/`: `Query/*` (`ISupabase` and records), `Tables/*`, keep `SupabaseNames.cs` only if still referenced after Step 3.
- Delete from `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/`: `Query/SupabaseNeuron.cs`, `Query/AmbientSupabaseSource.cs`, `Query/SupabaseSourceFactory.cs`, `Query/SupabaseQueryGuard.cs`, `Query/SupabaseCells.cs`, `Query/SupabaseTypeMap.cs` (each only if LSP shows no backing-store use), `Table/*`, `Windows/*`, `SupabaseRegistryResources.cs`
- Delete tests: `Query/*`, `Table/*`, `TableHttpFacts.cs`, `TableRouteFacts.cs`, `TableWindowToolFacts.cs`, `FakeSupabaseProvider.cs` (if unused)
- Modify: `SupabaseModule.cs` (connector), `src/DigitalBrain.Modules/Supabase/README.md`
- Modify (Dart): `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart` and shell tests `workspace_data_window_test.dart`, `workspace_table_loading_test.dart`, `connect_window_test.dart` where they reference the removed table endpoints

**Interfaces:**
- Produces: `SupabaseModule` with no neurons, no agent tools, no endpoints; `SupabaseBackingStore`, `SupabaseConnectionSettings`, `SupabaseHealthCheck`, `SupabaseModuleOptions` and hosting unchanged.

- [ ] **Step 1: Map.** LSP `findReferences` on `ISupabase`, `ISupabaseTable`, `ISupabaseProvider`, `SupabaseProvider`, `LiveTableWindows`, `TableEndpoints`, `SupabaseRegistryResources`, `SupabaseModule.Connector`. Classify each file: backing store (keep) vs user surface (delete).
- [ ] **Step 2: Decide the connector.** With `Neurons` and `Signals` empty, the Supabase connector offers nothing a user can authorize. Remove `Connector` from `SupabaseModule` and its registration; `/connectors` then lists `postgres` for databases. If LSP shows the backing-store Integration needs the connector declaration (`OptionalIntegrations = ["supabase"]`), keep the declaration with empty `Neurons` instead, and say so in the commit message.
- [ ] **Step 3: Delete the user surface files and tests from Step 1; update `SupabaseModule.Configure`.**
- [ ] **Step 4: Dart.** Remove the client calls and test cases for the deleted table routes. Run from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter analyze` and `flutter test` — expected clean/PASS.
- [ ] **Step 5: Build and test.**
Run: `dotnet build src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/DigitalBrain.Modules.Supabase.csproj`, `dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests`, `dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests.Hosting`, `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`
Expected: PASS (BackingStore, ConnectionCredential, IntegrationMaterialization, configuration and hosting facts remain).
- [ ] **Step 6: Commit** — `Supabase: a Supabase database is a postgres connection; the module keeps its backing store`.

---

### Task 6: Remove the capability registry and tool offers

**Files:**
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Discovery/RegistryDiscovery.cs`
- Delete (Assistant): `RegistryDiscoveryService.cs`, `RegistryDiscoveryTools.cs`, `CapabilityDiscoveryNeuron.cs`, `ICapabilityDiscovery.cs`, `RegistryInventoryTools.cs`; tests `DiscoveryFacts.cs`, `RegistryDiscoveryFacts.cs`, `InventoryFacts.cs`, `AgentToolSelectionFacts.cs`
- Delete (Apps): `AppsRegistryResources.cs`, `AppAgentTools.cs`; their registrations in `AppsModule.cs`
- Delete (CSharp): `Authoring/CSharpRegistryResources.cs`; its registration in `CSharpModule.cs`
- Modify (AI): `DigitalBrain.Modules.AI.Contracts/Tools/AgentTools.cs` — remove `AgentToolOffer`, `AgentToolBinding`, `IAgentToolSource.SourceId`, `IAgentToolSource.OpenBoundAsync`, `AgentToolContext.DatabaseSource`; `DigitalBrain.Modules.AI/Agents/AgentTurnLoop.cs` — remove the offer/binding branch (lines ~58-70, ~188-194) so a turn's tools are fixed at start; delete `tests/.../Agents/AgentToolOfferFacts.cs`
- Modify: `AssistantModule.Configure` (drop the registry registrations)

**Interfaces:**
- Produces: `AgentToolContext(string ScopeId, string RunId, string CallId)` with no extra properties; `IAgentToolSource` with only `OpenAsync`; `AgentTurnLoop` opens tools once per turn.
- Note: `IRegistry` / `PlatformRegistry` / `IRegistryInventoryProvider` (Framework/Platform inventory) are **not** in scope; keep them unless LSP shows `RegistryInventoryTools` was their only consumer, in which case leave them and report it as a follow-up.

- [ ] **Step 1: Map.** LSP `findReferences` on `RegistryCapability`, `IRegistryResourceProvider`, `ICapabilityDiscovery`, `AgentToolOffer`, `AgentToolBinding`, `OpenBoundAsync`, `DatabaseSource`, `AppAgentTools`, `RegistryInventoryTools`. Every reference must be in a file listed above or already deleted by Tasks 4–5.
- [ ] **Step 2: Write the failing test** in `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentToolFacts.cs`:

```csharp
[Fact]
public void AToolCannotChangeTheTurnsToolSet()
{
    var contracts = typeof(IAgentToolFactory).Assembly;
    Assert.Null(contracts.GetType("DigitalBrain.AI.Tools.AgentToolOffer"));
    Assert.Null(contracts.GetType("DigitalBrain.AI.Tools.AgentToolBinding"));
    Assert.Null(typeof(IAgentToolSource).GetMethod("OpenBoundAsync"));
    Assert.Null(typeof(AgentToolContext).GetProperty("DatabaseSource"));
}
```

- [ ] **Step 3: Run, expect FAIL** (the types still exist).
Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*AToolCannotChangeTheTurnsToolSet*"`
- [ ] **Step 4: Delete and simplify** per Files. `AgentTurnLoop`: tools = factories' tools filtered to the turn's names plus `IAgentToolSource.OpenAsync(names)` sessions, opened once.
- [ ] **Step 5: LSP diagnostics clean; build and test** AI, Assistant, Apps, CSharp test projects:
`dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`, `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests`, `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`, `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`, `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: PASS.
- [ ] **Step 6: Commit** — `Assistant: no capability registry; a turn's tools are fixed at start`.

---

### Task 7: The assistant app uses the shared surface

**Files:**
- Modify: `src/DigitalBrain.OS/Apps/Assistant/synapses/chat.cs:27`
- Modify: `src/DigitalBrain.OS/Apps/Assistant/prompts/system.md`
- Modify: `src/DigitalBrain.OS/Apps/Assistant/app.json` (version `1.0.2` → `1.1.0`)
- Test: `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/AssistantScenarioFacts.cs`

- [ ] **Step 1: Write the failing scenario fact** with a scripted LLM over real grains (`ModuleTest` with Assistant, Apps, AI and Postgres modules; Postgres provider faked the way Postgres module tests fake it — LSP `findReferences` on `IConnectionPostgresProviderFactory` in Postgres tests). Script: (1) `neurons_context`, (2) `neurons_call(IPostgresServer, "connection/{brain}/postgres/supabase", "ReadSchema", "[{}]")`, (3) answer. Assert the transcript has those two tool results without `isError` and the schema result names `Demo`. Second script: `neurons_call(IApp, "{scope}/apps/datavisualizer", "Invoke", "[{invocationId, operation:"show", input:"{...}"}]")` then `"Await"`; with a fake app script responding, assert the awaited invocation is `Completed`.
- [ ] **Step 2: Run, expect FAIL** (assistant tools list still names removed tools).
- [ ] **Step 3: Update `chat.cs:27`:**

```csharp
string[] Tools = ["neurons_context", "neurons_search", "neurons_list", "neurons_get", "neurons_call",
    "csharp_contracts", "csharp_write", "csharp_run", "show_form", "show_view"];
```

- [ ] **Step 4: Rewrite `prompts/system.md`** around this recipe (keep any product-tone lines already there):

```markdown
You act in the person's brain through neuron contracts.

1. `neurons_context` tells you the brain. Keys: an app is `{scope}/apps/{name}`; a connection is
   `connection/{brain}/{connector}/{id}` (a database the person added is connector `postgres`).
2. Find what can do the job with `neurons_search`, then `neurons_call` it.
3. To show data, use an app: `IApp.Invoke` on `{scope}/apps/datavisualizer` with operation `show`
   (`{title, kind: table|chart, source: "sql", sql}`), then `IApp.Await` with the invocationId.
   Read an app's operations with `IApp.Read`.
4. Databases: `IPostgresServer.ReadSchema` lists tables; `Query` runs one read-only SELECT.
5. When nothing fits, write a behavior with the csharp tools.
6. If a tool answers `isError`, repair the call and retry; do not stop at a listing.
```

- [ ] **Step 5: Check no removed tool is named anywhere.** Search text (not code) under `src/DigitalBrain.OS/Apps` and `src/IntoChat/Apps` for `discover_capabilities`, `select_capability`, `list_neurons`, `postgres_schema`, `supabase_schema`, `show_postgres_query_table`, `show_supabase_query_table`, `table_read`, `table_refine`. Expected: no hits.
- [ ] **Step 6: Run the Assistant tests and `DigitalBrain.OS.Tests.Unit` (the shipped-app publisher compiles `chat.cs`).** Expected: PASS.
- [ ] **Step 7: Commit** — `Assistant app: acts through neuron contracts and shows data with the Data Visualizer`.

---

### Task 8: Verify end to end, as a person and as Claude

No code unless a step fails; a failure is fixed in the owning task's files and committed there.

- [ ] **Step 1: Run.** Stop any running AppHost and orphaned `DigitalBrain.*` processes. If an Orleans `wireType` error appears at activation, wipe Azurite (state was reshaped). From `src/DigitalBrain.AppHost`: `aspire start`. `mcp__aspire__list_resources`: every resource Running/Healthy (resource `OperatingSystem`).
- [ ] **Step 2: Tool parity.** `digitalbrain-mcp` `tools/list` contains `neurons_list`, `neurons_search`, `neurons_get`, `neurons_call`, `neurons_context` with descriptions equal to `NeuronSurfaceTools`.
- [ ] **Step 3: Connection.** Through `digitalbrain-mcp`, as the user: create the `postgres` connection `supabase` with the Supabase connection string (the user supplies it in chat or it is already provisioned; never typed by Claude from elsewhere) via `IConnection.Connect("connection-string", …)` on `connection/{brain}/postgres/supabase`; `IConnection.Probe` → `Connected`. Bind the Data Visualizer `db` slot: `IApp.Configure({}, {"db": "connection/{brain}/postgres/supabase"})` on `{scope}/apps/datavisualizer`.
- [ ] **Step 4: Claude directly.** `neurons_call(IPostgresServer, connection/{brain}/postgres/supabase, ReadSchema, [{}])` lists `Demo`; `IApp.Invoke` show `select * from demo` + `IApp.Await` → `Completed`; the view's table neuron read through `neurons_call` has rows.
- [ ] **Step 5: As a person.** `IApp.Invoke` on `{scope}/apps/assistant` `send` "which tables are in Supabase?", wait for the run, `transcript` shows `neurons_call … ReadSchema` and an answer naming `Demo`. Then `send` "show data from Demo"; transcript shows `IApp.Invoke … show` and `Await`; the Data Visualizer window has rows.
- [ ] **Step 6: Telemetry.** `list_traces` shows the turn's tool spans with caller `os/assistant`; MCP spans with the user caller; `list_structured_logs` has no `discover_capabilities`/`select_capability`.
- [ ] **Step 7: Regression net.** Unit suites of every touched project (Mcp, Apps, Assistant, AI, CSharp, Supabase, Supabase.Hosting, OS, Architecture) and the E2E suites of Apps/Assistant if present.
- [ ] **Step 8: Commit** any fixes; report results with the transcript excerpts.
