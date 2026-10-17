# Derived Runtime Section 3 Implementation Plan: Jev routes over a routable catalog, apps first

> **For agentic workers (OpenCode):** you implement exactly ONE task below. Read the spec first:
> `docs/superpowers/specs/2026-10-09-derived-runtime-design.md` (section 3). Read `CLAUDE.md`. Stay inside the
> files your task lists. Do not commit - the orchestrator reviews and commits.

**Goal:** Jev's menu stops being "every model marker and infrastructure contract". `[Routable]` is a
contract attribute in the vocabulary ring; `ContractCatalog` exposes `Routable()`. Routing is two-tier:
first a System One question over the brain's installed apps' operations (`"{app}.{operation}"`, read through
`IAppIndex`), with a last option `"something else"`; only when that wins does Jev ask over routable
contracts. `RouteResult` gains `App` and `Operation`, so an app route carries no contract-fill step:
`Dispatch` of an app route is `IApp.Request(operation, input)` with the state as input and no language
model. `IsDirect` moves out of the assistant into `RouteResult.IsDirect` (an app route, or a routable
`Read`/`List`).

**Depends on (cross-section, land before this wave):**
- **Section 2 (lands first):** `IRouter.Ask(RouteRequest)` / `Pending(Guid)` / `PendingRoute`, `Routed`
  carries the request `Id`, `RouterNeuron` decides through the one-way `IRouterWork.Decide(Guid)` path with a
  private `Decide(state, allowed, ask, ct)` seam, the assistant splits into `send.cs` (posts `Ask`, ends) and
  `routed.cs` (reacts to `Routed`, reads `Pending`), and `Assistant.IsDirect`/`AskModel` live in `lib/Assistant.cs`.
  Section 3 layers on that shape; executors land the same change on the post-2 files. Files shared with 2:
  `IRouter`, `Routed`, `RouterNeuron`, `RouterState`, `RouteResultFacts`/`SystemOneRouterFacts`/`AssistantGateFacts`,
  `send.cs`, `routed.cs`, `lib/Assistant.cs`, `app.json`/`app.spec.md`. Section 2 must be merged and green first.
- **Section 1 (orthogonal):** `ShippedAppReconciler` - no overlap with routing.
- **Section 4 (orthogonal):** `IRetainsSignals` on `AppNeuron` - no overlap; an app route's `IApp.Request`
  works with or without retention.
- **Section 5 (orthogonal):** run identity/profiles - no overlap.
- **Already in the tree (Tool Sources, Task 0/A/B):** `CapabilityCatalog`, `IRuntimeCapabilitySource`,
  `NeuronType.Key` (`Id(6)`) and `Tool` (`Id(7)`), `IToolSource`, the Tools/Mcp/Playwright modules. This plan
  keeps keyed tool entries routable through their `Key`, and marks no tool-infrastructure contract.

**Out of scope for this plan:** the shell's route display, the MCP `neurons_search` surface (it stays over
`CapabilityCatalog.Read`, all contracts), `IRouter`'s one-way `Ask` path shape (section 2 owns it), and adding
the app tier to `Achieve` (open question, see the end).

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, xunit v3. The branch `os-runtime` carries uncommitted section-2 work: never `git add -A`;
  stage only the file lists each task names.
- Build and test **per project**, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj` / `dotnet test --project src/<test-project-dir>`.
  Cap test runs at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, not a timeout to raise.
- Warnings are errors, nullable on, package versions only in `Directory.Packages.props` (no new packages here).
- No `/// <summary>` boilerplate. Inline comments only for what code cannot say. Match surrounding style
  (file-scoped namespaces, primary constructors, expression bodies, `ConfigureAwait(false)` in Framework).
- Contract attributes in the vocabulary ring: namespace exactly `DigitalBrain`, interface-targeted,
  `Inherited = false` - the vocabulary (attribute) rule in `VocabularyRingFacts` requires the type to be an
  attribute and to live in the `DigitalBrain` namespace.
- Grain state: `[GenerateSerializer]` records with **concrete arrays / Dictionary**, never `IReadOnlyList`.
  Every `[Alias]` unique. No self-calls on non-reentrant grains. No state compatibility, no migration shims.
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains via
  `await using var brain = await ModuleTest.Create().WithModule<...>().StartAsync(ct);`
  (`src/Testing/DigitalBrain.Testing.Module`), scripted System One via `LoopbackServer`/`FakeModelServer`,
  chat models that cannot panic via `StubChatClient`.
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`, `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`,
  `src/DigitalBrain.AppHost/*`. The orchestrator wires those (this plan adds no module, so nothing to wire).
- Done = your project(s) build with 0 warnings and your tests pass. Report the exact commands and output.

---

## Wave S3

### Task S3-1: `[Routable]` in the vocabulary ring; `ContractCatalog.Routable()` and `IsRoutable()`

**Executor:** Claude (contract/ring change).

**Files:**
- Create `src/DigitalBrain/Neurons/RoutableAttribute.cs`
- Modify `src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/ContractCatalog.cs`
- Create `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RoutableCatalogFacts.cs`

**Produces:**
```csharp
// src/DigitalBrain/Neurons/RoutableAttribute.cs
namespace DigitalBrain;

// A contract the router may choose from: a person-facing capability Jev can carry a request to.
// Model markers, the AI runtime (ISystemOne, IAgent, IModelCatalog, IRouter), identity, integration
// and tool infrastructure are left unmarked, so Jev never routes to them.
[AttributeUsage(AttributeTargets.Interface, AllowMultiple = false, Inherited = false)]
public sealed class RoutableAttribute : Attribute
{
    public static bool AppliesTo(Type contract)
    {
        ArgumentNullException.ThrowIfNull(contract);
        return contract.IsDefined(typeof(RoutableAttribute), inherit: false);
    }
}
```
In `ContractCatalog` (namespace `DigitalBrain.Framework.Contracts`), after `Read()`:
```csharp
    // The router's menu, contract half: contracts marked [Routable] and nothing else. Keyed runtime
    // tool entries are concrete instances the router adds on their own; this is the types-only set.
    public IReadOnlyList<NeuronType> Routable()
    {
        lock (_gate)
        {
            return Array.AsReadOnly(Read().Where(type => IsRoutable(type.Contract)).ToArray());
        }
    }

    public bool IsRoutable(string contractFullName)
        => _neurons.TryGetValue(contractFullName, out var contract) && RoutableAttribute.AppliesTo(contract);
```
No other change; `Read()` and `Signals` stay as the search surface.

**Facts** (`src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RoutableCatalogFacts.cs`, full file):
```csharp
using DigitalBrain;
using DigitalBrain.Framework.Contracts;
using DigitalBrain.Framework.Modules;

namespace DigitalBrain.Framework.Tests.Unit;

public sealed class RoutableCatalogFacts
{
    [Fact]
    public void RoutableExposesOnlyMarkedContractsWhileReadKeepsEverything()
    {
        var catalog = new ContractCatalog(new ModuleInventory([new RoutableFixtureModule()]));

        Assert.Contains(catalog.Routable(), type => type.Id == "routable.fixture");
        Assert.DoesNotContain(catalog.Routable(), type => type.Id == "routable.plain");
        Assert.Contains(catalog.Read(), type => type.Id == "routable.plain");
    }

    [Fact]
    public void IsRoutableIsFalseForUnmarkedAndUnknownContracts()
    {
        var catalog = new ContractCatalog(new ModuleInventory([new RoutableFixtureModule()]));

        Assert.True(catalog.IsRoutable(typeof(IRoutableFixture).FullName!));
        Assert.False(catalog.IsRoutable(typeof(IPlainFixture).FullName!));
        Assert.False(catalog.IsRoutable("No.Such.Contract"));
    }
}

public sealed class RoutableFixtureModule() : Module(new ModuleId(nameof(RoutableFixtureModule)))
{
    public override System.Reflection.Assembly? Contracts => typeof(RoutableFixtureModule).Assembly;
    public override void Configure(Orleans.Hosting.ISiloBuilder silo) { }
}

[Routable, Alias("routable.fixture")]
public interface IRoutableFixture : INeuron { Task Ping(); }

[Alias("routable.plain")]
public interface IPlainFixture : INeuron { Task Ping(); }
```

**Verify:**
- `dotnet build src/DigitalBrain/DigitalBrain.csproj`
- `dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj`
- `timeout 300 dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-class "*RoutableCatalogFacts*"`
- `timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"`
  (the attribute must sit inside the vocabulary rule; a namespace other than `DigitalBrain` fails it)

**Commit:** `git add src/DigitalBrain/Neurons/RoutableAttribute.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/ContractCatalog.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RoutableCatalogFacts.cs`
`git commit -m "routing: [Routable] marks the router's menu; ContractCatalog exposes Routable()"`

---

### Task S3-2: mark the person-facing contracts `[Routable]`; a menu fact over real modules

**Executor:** DeepSeek (narrow, fully specified edits).

**Files (16 contract interfaces across 6 contract projects; `[Routable]` goes on its own line
immediately above the existing `[Alias(...)]`; every file is in a `DigitalBrain.*` namespace, so the
attribute resolves through the enclosing namespace, no `using` to add):**
- `src/DigitalBrain.Modules/Time/DigitalBrain.Modules.Time.Contracts/Timers/ITimer.cs`, `IReminder` in `.../Reminders/IReminder.cs`
- `src/DigitalBrain.Modules/DigitalBrain/Machine/DigitalBrain.Modules.Machine.Contracts/Console/IConsole.cs`, `IFileSystem` in `.../Files/IFileSystem.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/ICSharpFile.cs`
- `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/IPostgresServer.cs`, `ITable` in `.../Tables/ITable.cs`
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs`, `IAppIndex` in `.../Apps/IAppIndex.cs`, `IAppStudio` in `.../Studio/IAppStudio.cs`
- `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Text/IText.cs`, `IChat` in `.../Chat/IChat.cs`, `ICalendar` in `.../Calendar/ICalendar.cs`, `IWorkspace` in `.../Workspace/IWorkspace.cs`, `IForm` in `.../Form/IForm.cs`, `IWebBrowser` in `.../WebBrowser/IWebBrowser.cs`

Example edit (one of sixteen, the rest identical in shape):
```csharp
using DigitalBrain;
namespace DigitalBrain.Time.Timers;

[Routable]
[Alias("timer")]
[Orleans.Metadata.DefaultGrainType("timer")]
public interface ITimer : INeuron
```
Rationale for the set: the base capabilities a person commands in natural language (it is the
assistant's own composed surface plus the timer/text the router's facts already exercise, plus
`IAppStudio`, which the Jev console's `OpenBuiltApps` depends on). Everything not marked stays
excluded: every `IAiMarker`/`ILLM` model marker, `ISystemOne`, `IAgent`, `IAgentContext`,
`IModelCatalog`, `IRouter`, `IGroupChat`, media/embedding/voice markers, `IKernel`,
`IConnectionRequests`, `IBrainRuntime`, `IToolSource`/`IToolSources`, `IMcpServer`, `IPlaywright`,
`IRevision(s)`, `IAspire`, `IRoslyn`, the compute ledger/usage, and the Flutter read/state parts
that are not commanded (`ISurface`, `IComposer`, `IButton`, `ITextField`, `IToggle`, `ISelect`, ...).

**Facts** - create `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RoutableCatalogFacts.cs`
(full file; fails until S3-1 and every marker above exist):
```csharp
using DigitalBrain.AI;
using DigitalBrain.Framework.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests;

// The router's menu is the person-facing capability set. The AI module's own contracts are the
// regression the section fixes: the observed run routed "open calculator" to IGpt54.GenerateStreaming
// because the menu had every model marker. Now a marker is never in the menu.
public sealed class RoutableCatalogFacts
{
    [Fact]
    public async Task TheRoutableCatalogIsThePersonFacingCapabilitiesOnly()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await ModuleTest.Create()
            .WithModule<AIModule>()
            .WithModule<DigitalBrain.Apps.AppsModule>()
            .WithModule<DigitalBrain.Time.TimeModule>()
            .WithModule<DigitalBrain.Flutter.FlutterModule>()
            .WithReminders()
            .StartAsync(ct);
        var routable = host.SiloServices.GetRequiredService<ContractCatalog>().Routable();

        Assert.DoesNotContain(routable, type => type.Id.StartsWith("ai.llm.", StringComparison.Ordinal));
        Assert.DoesNotContain(routable, type => type.Id is "agent" or "ai.systemone" or "ai.models" or "ai.router" or "tools.sources");
        Assert.Contains(routable, type => type.Id == "timer");
        Assert.Contains(routable, type => type.Id == "text");
        Assert.Contains(routable, type => type.Id == "apps.app2");
    }
}
```

**Verify:**
- Build each marked contract project, then the impl projects that compile them:
  `dotnet build src/DigitalBrain.Modules/Time/DigitalBrain.Modules.Time.Contracts/DigitalBrain.Modules.Time.Contracts.csproj`
  `dotnet build src/DigitalBrain.Modules/DigitalBrain/Machine/DigitalBrain.Modules.Machine.Contracts/DigitalBrain.Modules.Machine.Contracts.csproj`
  `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/DigitalBrain.Modules.Microsoft.CSharp.Contracts.csproj`
  `dotnet build src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/DigitalBrain.Modules.Postgres.Contracts.csproj`
  `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj`
  `dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj`
- `timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*RoutableCatalogFacts*"`
- `timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"`

**Commit:** `git add` the 16 contract files and `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RoutableCatalogFacts.cs`
`git commit -m "routing: mark the person-facing contracts routable; the AI ring never appears in the menu"`

---

### Task S3-3: the two-tier router - apps first, then routable contracts

**Executor:** Claude (contract/grain/runtime-shape change).

**Files:**
- Modify `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteResult.cs`
- Modify `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs`
- Modify `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj` (add one ProjectReference)
- Modify `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RouteResultFacts.cs`
- Modify `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs`
- Modify `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs`

**Produces 1 - `RouteResult` (contract, new ids after `Tool`):**
```csharp
// src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteResult.cs
using System.Globalization;
using System.Text;

namespace DigitalBrain.AI.Routing;

// The chosen contract (full type name) and method, with the router's confidence in that choice.
// An app route names the app and operation instead of a contract fill path; Dispatch then posts
// IApp.Request with the state as input and no language model runs.
[GenerateSerializer, Alias("ai.route-result")]
public sealed record RouteResult(
    [property: Id(0)] string Contract,
    [property: Id(1)] string Method,
    [property: Id(2)] double Confidence,
    [property: Id(3)] Dictionary<string, double> Probabilities,
    [property: Id(4)] string? Key = null,
    [property: Id(5)] string? Tool = null,
    [property: Id(6)] string? App = null,
    [property: Id(7)] string? Operation = null)
{
    private const int MaxAlternatives = 3;

    // Directly executable without the language model: an app route, or a routable pure read.
    // Only the router produces routes, and it routes over routable contracts only.
    public bool IsDirect => App is not null || Method is "Read" or "List";

    // The chosen route, then the next most likely catalog ids. Ids are Orleans aliases (what the
    // catalog asked Jev over), so a reader maps them back through the catalog, not by name.
    public string Hint() { /* unchanged */ }
}
```
`Hint()` and `RouteOutcome`/`PendingRoute` are unchanged.

**Produces 2 - `RouterNeuron` (on the section-2 shape).** Add `using DigitalBrain.Apps;`. The private
`Decide` starts with the app tier and routes the contract tier over `Routable()` + keyed tools:
```csharp
    private async Task<RouteResult> Decide(string state, string[]? allowed, Func<SystemOneRequest, Task<SystemOneResult>> ask, CancellationToken ct)
    {
        if (await AppTier(state, ask, ct) is { } app) { return app; }
        var types = await RoutableTypes(allowed, ct);
        if (types.Length == 0) { throw new InvalidOperationException("No contracts are available to route over."); }

        var moment = AwareOfState(state);
        var criteria = types.ToDictionary(type => type.Id, type => (string?)Trim(type.Description), StringComparer.Ordinal);
        var contractQuestions = new Dictionary<string, SystemOneQuestion>(StringComparer.Ordinal);
        var chunks = Chunk(criteria).ToArray();
        for (var index = 0; index < chunks.Length; index++)
        { contractQuestions["capability_" + index] = new SystemOneQuestion.Choice("Which capability can carry out this request?", chunks[index]); }
        var contractAnswer = await ask(new SystemOneRequest(moment, contractQuestions));

        var (chosenId, confidence, probabilities) = Best(contractAnswer);
        var chosen = types.Single(type => type.Id == chosenId);
        if (chosen.Key is not null)
        {
            return new RouteResult(chosen.Contract, "Run", confidence, probabilities, chosen.Key, chosen.Tool);
        }
        var methods = chosen.Methods.Select(MethodName).Where(name => !NotCallable.Contains(name)).Distinct(StringComparer.Ordinal).ToArray();
        if (methods.Length == 0)
        {
            return new RouteResult(chosen.Contract, "", confidence, probabilities);
        }

        var methodAnswer = await ask(new SystemOneRequest(moment,
            new() { ["method"] = new SystemOneQuestion.Choice("Which method carries out this request?", methods.ToDictionary(name => name, _ => (string?)null, StringComparer.Ordinal)) }));
        var method = methodAnswer.Answers["method"] is SystemOneAnswer.Choice { Value.Length: > 0 } picked ? picked.Value : methods[0];
        return new RouteResult(chosen.Contract, method, confidence, probabilities);
    }
```
New private helpers next to `Decide`:
```csharp
    // The first of two tiers: the brain's installed apps' operations. A "something else" answer falls
    // through to the routable contracts. An app route carries the app and operation, so Dispatch has
    // no contract to fill: it posts IApp.Request with the state as input, no language model runs.
    private async Task<RouteResult?> AppTier(string state, Func<SystemOneRequest, Task<SystemOneResult>> ask, CancellationToken ct)
    {
        var factory = ServiceProvider.GetRequiredService<IGrainFactory>();
        var criteria = new Dictionary<string, string?>(StringComparer.Ordinal);
        string[] names;
        // A host without the Apps module has no app tier.
        try { names = [.. await factory.GetGrain<IAppIndex>(Scope).List()]; }
        catch (Exception error) when (error is not OperationCanceledException) { return null; }
        foreach (var name in names)
        {
            AppSnapshot snapshot;
            try { snapshot = await factory.GetGrain<IApp>(IApp.Key(Scope, name)).Read(); }
            catch (Exception error) when (error is not OperationCanceledException) { continue; }
            foreach (var operation in snapshot.Manifest.Operations)
            { criteria[name + "." + operation.Name] = string.IsNullOrWhiteSpace(operation.Description) ? null : Trim(operation.Description); }
        }
        if (criteria.Count == 0) { return null; }
        criteria["something else"] = "The request is not about an installed app. Choose this to route over the brain's contracts.";
        var moment = AwareOfState(state);
        var questions = new Dictionary<string, SystemOneQuestion>(StringComparer.Ordinal);
        var chunks = Chunk(criteria).ToArray();
        for (var index = 0; index < chunks.Length; index++)
        { questions["app_" + index] = new SystemOneQuestion.Choice("Which installed app operation can carry out this request?", chunks[index]); }
        var answer = await ask(new SystemOneRequest(moment, questions));
        var (chosen, confidence, probabilities) = Best(answer);
        if (chosen == "something else") { return null; }
        var split = chosen.IndexOf('.');
        if (split <= 0 || split >= chosen.Length - 1) { return null; }
        return new RouteResult(typeof(IApp).FullName, nameof(IApp.Request), confidence, probabilities,
            App: chosen[..split], Operation: chosen[(split + 1)..]);
    }

    // The second tier's menu: contracts marked [Routable] plus the concrete runtime tool entries the
    // brain's capability sources report (a tool carries its Key and needs no contract question).
    // Model markers, the AI runtime and integration contracts are never routable.
    private async Task<IReadOnlyList<NeuronType>> RoutableTypes(string[]? allowed, CancellationToken ct)
    {
        var catalog = ServiceProvider.GetRequiredService<ContractCatalog>();
        var capabilities = await Capabilities().Read(Scope, ct);
        return capabilities
            .Where(type => type.Key is not null || catalog.IsRoutable(type.Contract))
            .Where(type => allowed is null || allowed.Contains(type.Contract, StringComparer.Ordinal))
            .ToArray();
    }
```
`Dispatch` gains the app branch before the fill step:
```csharp
    public async Task<RouteOutcome> Dispatch(string state, string[]? allowed, CancellationToken ct)
    {
        var route = await Route(state, allowed, ct);
        if (route.Confidence < Gate || route.Method.Length == 0)
        { return new RouteOutcome(route, false, Error: "The request was not clear enough to route."); }
        if (route.App is not null)
        {
            var appKey = IApp.Key(Scope, route.App);
            try
            {
                var requestId = await ServiceProvider.GetRequiredService<IGrainFactory>().GetGrain<IApp>(appKey).Request(route.Operation!, state);
                return new RouteOutcome(route, true, appKey, null, requestId.ToString());
            }
            catch (Exception error) when (error is not OperationCanceledException)
            { return new RouteOutcome(route, false, appKey, null, Error: error.Message); }
        }
        var (key, arguments) = await Fill(state, route, ct);
        try
        {
            var result = await ServiceProvider.GetRequiredService<NeuronSurface>().Call(route.Contract, key, route.Method, arguments, ct);
            return new RouteOutcome(route, true, key, arguments, result?.GetRawText());
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { return new RouteOutcome(route, false, key, arguments, Error: error.Message); }
    }
```
`Achieve` routes over the same menu: replace its `var types = (await Capabilities().Read(Scope, ct))...`
with `var types = (await RoutableTypes(allowed, ct)).ToArray();` (the keyed-tool branch inside the loop
and the `finish` option are unchanged).

**Produces 3 - `DigitalBrain.Modules.AI.csproj`:** add to the existing `ProjectReference` item group:
```xml
    <ProjectReference Include="../../../DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj" />
```

**Facts.** `RouteResultFacts.cs` gains two facts (failing first - `RouteResult` has no `IsDirect` today):
```csharp
    [Fact]
    public void AnAppRouteIsDirectWithNoContractToFill()
    {
        var route = new RouteResult(typeof(DigitalBrain.Apps.IApp).FullName, nameof(DigitalBrain.Apps.IApp.Request), 0.95, new(), App: "calculator", Operation: "open");

        Assert.True(route.IsDirect);
    }

    [Fact]
    public void ARoutableReadOrListIsDirectAndARoutineCallIsNot()
    {
        Assert.True(new RouteResult("X", "Read", 0.9, new()).IsDirect);
        Assert.True(new RouteResult("X", "List", 0.9, new()).IsDirect);
        Assert.False(new RouteResult("X", "Start", 0.9, new()).IsDirect);
    }
```
(add `using DigitalBrain.AI.Routing;` stays; the file already has it; add `using DigitalBrain.Apps;`).

`SystemOneRouterFacts.cs`: `Start` composes the Apps module so the app tier can read `IAppIndex`:
```csharp
        return ModuleTest.Create().WithExecution(new TestExecutionOptions
        {
            PrivateConfiguration = new Dictionary<string, string?>
            {
                [IntegrationSchema.Key("typesafe", "ApiKey")] = "test-key",
                [IntegrationSchema.Key("typesafe", "Endpoint")] = endpoint,
            },
        })
            .WithModule<AIModule>()
            .WithModule<DigitalBrain.Apps.AppsModule>()
            .WithModule<DigitalBrain.Compute.ComputeModule>()
            .WithModule<DigitalBrain.Flutter.FlutterModule>()
            .WithModule<DigitalBrain.Time.TimeModule>()
            .WithReminders()
            .ConfigureSilo(builder => { builder.Services.AddSingleton(model); silo?.Invoke(builder); })
            .StartAsync(ct);
```
New facts (failing first - the router has no app tier, and `Route` routes over the full catalog):
```csharp
    [Fact]
    public async Task OpenCalculatorRoutesToTheAppWithoutAnyModelCall()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        const string App = """{"model":"jev","answers":{"app_0":{"type":"choice","choice":"calculator.open","confidence":0.95,"probabilities":{"calculator.open":0.95,"something else":0.05}}}}""";
        var reply = server.ReplyOnce("application/json", App, ct);
        await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        var app = host.Get<IApp>(IApp.Key(Scope, "calculator"));
        await app.Create(new AppManifest("Calculator", "keypad", [new("open", "open the keypad")], [], []), "spec");
        await using var requested = await host.SubscribeAsync<AppRequested>(app, ct);
        await using var signals = requested.ReadAllAsync(ct).GetAsyncEnumerator(ct);

        var outcome = await host.Get<IRouter>(Scope).Dispatch("open calculator", null, ct);

        Assert.True(outcome.Dispatched, outcome.Error);
        Assert.Equal(typeof(IApp).FullName, outcome.Route.Contract);
        Assert.Equal("Request", outcome.Route.Method);
        Assert.Equal(("calculator", "open"), (outcome.Route.App, outcome.Route.Operation));
        Assert.True(outcome.Route.IsDirect);
        Assert.Null(outcome.Arguments);
        Assert.True(await signals.MoveNextAsync());
        Assert.Equal("open", signals.Current.Operation);
        Assert.Equal("open calculator", signals.Current.Input);
        await reply;
    }

    [Fact]
    public async Task SomethingElseFallsThroughToTheRoutableContracts()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        const string AppElse = """{"model":"jev","answers":{"app_0":{"type":"choice","choice":"something else","confidence":0.6,"probabilities":{"something else":0.6,"calculator.open":0.4}}}}""";
        const string Contract = """{"model":"jev","answers":{"capability_0":{"type":"choice","choice":"timer","confidence":0.91,"probabilities":{"timer":0.91}}}}""";
        const string Method = """{"model":"jev","answers":{"method":{"type":"choice","choice":"Start","confidence":0.88,"probabilities":{"Start":0.88}}}}""";
        var replies = new[]
        {
            server.ReplyOnce("application/json", AppElse, ct),
            server.ReplyOnce("application/json", Contract, ct),
            server.ReplyOnce("application/json", Method, ct),
        };
        await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        await host.Get<IApp>(IApp.Key(Scope, "calculator")).Create(new AppManifest("Calculator", "keypad", [new("open", "open the keypad")], [], []), "spec");

        var route = await host.Get<IRouter>(Scope).Route("open calculator", null, ct);

        Assert.Null(route.App);
        Assert.Equal(typeof(DigitalBrain.Time.Timers.ITimer).FullName, route.Contract);
        Assert.Equal("Start", route.Method);
        await Task.WhenAll(replies);
    }

    [Fact]
    public async Task ANonRoutableContractIsNotRoutedEvenWhenAllowedByName()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
        Stamp();
        await host.AuthorizeCallerAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            host.Get<IRouter>(Scope).Route("answer with a model", [typeof(DigitalBrain.AI.Models.IModelCatalog).FullName!], ct));
    }
```
(add `using DigitalBrain.Apps;`, `using DigitalBrain.Apps.Signals;`, `using DigitalBrain.AI.Models;` to the file.)

`AssistantGateFacts.cs`: its scripted `Choose` must answer the app-tier question for the calculator's
operation whenever `calculator` exists:
```csharp
    // Scripted Jev: the app tier picks the calculator's operation, the capability question picks
    // `contractId`, the method question picks `method`.
    private static string Choose(JsonElement request, string contractId, string method, double confidence)
    {
        var answers = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var question in request.GetProperty("questions").EnumerateObject())
        {
            var options = question.Value.GetProperty("criteria").EnumerateObject().Select(option => option.Name).ToArray();
            var pick = question.Name.StartsWith("app_", StringComparison.Ordinal)
                ? (options.Contains("calculator.open", StringComparison.Ordinal) ? "calculator.open" : options[0])
                : options.Contains(contractId) ? contractId : options.Contains(method) ? method : options[0];
            var probabilities = options.ToDictionary(option => option, option => option == pick ? confidence : (options.Length > 1 ? (1 - confidence) / (options.Length - 1) : 0.0));
            answers[question.Name] = new { type = "choice", choice = pick, probabilities, confidence };
        }
        return JsonSerializer.Serialize(new { model = "fake-jev", answers });
    }
```
And `AboveTheGateTheAssistantAnswersWithoutAnAgentTurn` asserts the app route and the absence of any
model request:
```csharp
        var route = await router.Route("open calculator", null, ct);
        Assert.True(route.Confidence >= 0.8 && route.Contract == typeof(IApp).FullName && route.Method == nameof(IApp.Request));
        Assert.Equal(("calculator", "open"), (route.App, route.Operation));
        var outcome = await router.Dispatch("open calculator", [route.Contract], ct);

        Assert.True(outcome.Dispatched, outcome.Error);
        Assert.Empty(AllChatRequests(model));
        Assert.True(await signals.MoveNextAsync());
        Assert.Equal("open", signals.Current.Operation);
```
The other `AssistantGateFacts` facts pass with the existing scripted helpers: `BelowTheGate...`'s host has no
apps, so the app tier short-circuits and the capability question still picks `apps.app2`/`Request`;
`WhenSystemOneIsUnavailable...` throws from the contract question before any app-tier ask (no apps).

**Verify:**
- `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/DigitalBrain.Modules.AI.Contracts.csproj`
- `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj`
- `timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests` (whole suite: `--filter-class "*SystemOneRouterFacts*"`, `--filter-class "*AssistantGateFacts*"`, `--filter-class "*RouteResultFacts*"` after a full green run)
- `timeout 300 dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit` (MCP reads `CapabilityCatalog`, not `Routable()`, so nothing there moves; prove it still passes)

**Commit:** `git add` the six files listed above
`git commit -m "routing: two-tier Jev - installed apps first, then routable contracts; app routes dispatch IApp.Request directly"`

---

### Task S3-4: the assistant reads `RouteResult.IsDirect`

**Executor:** DeepSeek (narrow edits).

**Files:**
- Modify `src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs`
- Modify `src/DigitalBrain.OS/Apps/Assistant/synapses/routed.cs`
- Modify `src/DigitalBrain.OS/Apps/Assistant/app.json`
- Modify `src/DigitalBrain.OS/Apps/Assistant/app.spec.md`

**Produces.** In `lib/Assistant.cs`, delete the `IsDirect` helper (it moved onto `RouteResult`):
```csharp
    // What Jev may carry out without the language model: an app operation, or a read that changes nothing.
    public static bool IsDirect(RouteResult route)
        => (route.Contract == typeof(IApp).FullName && route.Method == nameof(IApp.Request))
            || route.Method is "Read" or "List";
```
In `synapses/routed.cs`, the direct branch consumes the record's own property:
```csharp
        else if (route.Confidence >= Assistant.RouteGate(snapshot) && route.IsDirect)
```
In `app.json` bump the version:
```json
  "version": "1.7.0",
```
In `app.spec.md` adjust the Jev paragraph (section 2's wording) so it names app routes as the app tier:
replace `A route the router is at least \`RouteGate\` (default 0.8) sure of, and that is an app operation
(\`IApp.Request\`) or a pure read, is carried out directly through the router;` with `A route the router is
at least \`RouteGate\` (default 0.8) sure of, and that names an app operation (the route carries the app and
operation) or a pure read of a routable contract, is carried out directly through the router;`.

**Verify:**
- `timeout 300 dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-class "*OsShippedAppFacts*"`
  (`EveryOsProgramCompilesAgainstCurrentContracts` compiles `routed.cs` against `RouteResult.IsDirect`;
  `send.cs` no longer references `Assistant.IsDirect`)
- `timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*AssistantGateFacts*"`
  (these drive the same gate calls the synapse makes)

**Commit:** `git add src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs src/DigitalBrain.OS/Apps/Assistant/synapses/routed.cs src/DigitalBrain.OS/Apps/Assistant/app.json src/DigitalBrain.OS/Apps/Assistant/app.spec.md`
`git commit -m "assistant: direct means RouteResult.IsDirect, not a helper"`

---

### Task S3-5: verification loop - aspire run, digitalbrain-mcp, telemetry

**Executor:** DeepSeek (run only; no new files). Do this after S3-1..S3-4 are committed.

**Run:**
1. Build clean (per project): `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj`
   and `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`. LSP diagnostics clean.
2. `dotnet run --project src/DigitalBrain.AppHost` (Aspire; if it is already up, note it and proceed).
   Then `mcp__aspire__list_resources`: every resource Running/Healthy before touching the brain.
   If one is not, read `mcp__aspire__list_console_logs` for it first.
3. Drive through `digitalbrain-mcp` (`localhost:5081/mcp`; `/brains/{brainId}/mcp` selects a brain),
   acting as the owner of the brain that has the shipped calculator app:
   - `neurons_context`: confirm the caller and brain.
   - `neurons_search` "calculator": the calculator's contract entry appears.
   - `neurons_call` the router (`DigitalBrain.AI.Routing.IRouter`, key `{brainId}`, method `Dispatch`,
     arguments `["open calculator", null]`): the `RouteOutcome` names `App == "calculator"`,
     `Operation == "open"`, `Dispatched == true`, `Arguments == null` (an app route carries no
     contract fill) and a result request id.
   - `neurons_call` the app (`IApp`, key `{brainId}/apps/calculator`, method `Read`, arguments `[]`):
     the snapshot shows the app Live; confirm the operation landed by reading the calculator's result
     neuron the app's own synapse wrote (the app's request/id path).
4. Confirm in telemetry with the Aspire MCP:
   - `mcp__aspire__list_traces` search "ai.router": the dispatch trace shows the router's span, one
     System One answer span for the **app tier** (question ids `app_0...`), the `apps.app2.Request`
     span -- and **no** `Generate`/`GenerateStreaming` (LLM) span on that trace.
   - `mcp__aspire__list_trace_structured_logs` on that trace: follow the router's decision and the
     app request end to end.
   - `mcp__aspire__list_structured_logs` search "ai.router.decided": the decision record for the
     app route ("open calculator" -> `DigitalBrain.Apps.IApp.Request`).
5. Regression net: rerun the S3-1..S3-4 unit suites plus
   `timeout 300 dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` and
   `timeout 300 dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`.
   If a fact exposes a real gap, fix it in the owning S3 task and re-run from there -- never raise a
   timeout or add polling to make a check pass.

**Git:** none (run only). Report the exact `list_resources`, mcp call arguments, and trace ids. Done means
the app route ran with no LLM span.

---

## Orchestrator (after S3-1..S3-5)

No new modules, hosting, slnx entries or `OsCatalog` changes: this section changes contracts and one grain
implementation only. The orchestrator reviews the four commits, runs the architecture suite
(`timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`) once more against the
merged tree, then the S3-5 verification loop.

**Open questions (raised, not resolved by this plan):**
- Should `Achieve` also route through the app tier first? The spec fixes `Route`/`Dispatch`; the Jev console
  (`Apps/Router`) keeps achieving over routable contracts (IApp included), which still reaches an app by
  method fill. If the console should prefer app operations, it is a small follow-up inside `Achieve`.
- Is the 16-contract `[Routable]` set the right breadth? It matches the assistant's composed surface plus the
  timer/text the router already served and `IAppStudio` for building. Connectors (Gmail, Salesforce,
  ClickHouse, GitHub, IRepository) stay unmarked until a fact demands them; adding one is a one-line attribute.
- The app tier reads every indexed app's manifest on every `Decide`. Fine for personal brains; if app counts
  grow large, the chunk limit of 255 options already splits the question.