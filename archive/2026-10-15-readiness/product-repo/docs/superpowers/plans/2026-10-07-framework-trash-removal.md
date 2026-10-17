# Framework Trash Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove from `src/DigitalBrain.Framework` everything that is dead, duplicated or legacy and does not depend on the apps/behaviors redesign, so the Framework is the neuron runtime and nothing else.

**Architecture:** Each task deletes or collapses one thing inside the existing design. State that was kept in a "document store" becomes a neuron's own grain state. Nothing new is introduced except one catalog neuron in the C# module and one opt-in Orleans dashboard hook in the silo host composer. Items that exist only for the assistant's C# tool plane (Discovery, NeuronTypeSearch, IVectorStore, Capacity, Metering, IntentContext, AppGrainType) are out of scope: they are removed by the apps redesign, not here.

**Tech Stack:** .NET 11 RC, Orleans 10.3.1, Aspire, xunit v3, `ModuleTest` harness (`src/Testing/DigitalBrain.Testing.Module`).

**Spec:** The agreed list in the conversation of 2026-10-07: (1) Persistence folder → one catalog neuron, (2) dead symbols, (3) BrainScope single id, (4) legacy aliases and "do not touch" comments, (5) redundant usings and XML summaries, (6) one exception-to-HTTP mapper, plus the Orleans dashboard constant finding a real home in `DigitalBrain.Aspire.Server`.

## Global Constraints

- Warnings are errors, nullable on, package versions central (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- LSP for every rename/delete: `findReferences` first, edit every site, diagnostics clean. LSP line/character positions were unreliable in this session (several false "no references"); every delete step re-confirms with a text search before deleting.
- Concrete collection types in grain state (`Dictionary<,>`, arrays), never `IReadOnlyList`.
- No `/// <summary>` blocks; inline comments only for what code cannot say.
- No state compatibility: aliases and keys may change freely; no migrations.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; real grains via `ModuleTest.Create().WithModule<…>()` over mocks.
- Done means seen running: Aspire resources Healthy, driven through `digitalbrain-mcp`, confirmed in traces/logs.
- Branch: `framework-cleanup` off `master`. Commit per task. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Two C# workspaces with the same file id** must stay separate after the catalog becomes a neuron keyed by scope. Pinned in Task 1 by `WorkspacesKeepSeparateCatalogs`.
2. **Catalog describe with a name over 120 characters** must store nothing and touch no file neuron. Pinned in Task 1 by `ARejectedDescriptionStoresNoSource` (kept) and `CatalogRejectsInvalidIdsAndOversizedDescriptions` (rewritten).
3. **Silo restart** must keep catalog entries. Pinned in Task 1 by `CatalogSurvivesDeactivation`.
4. **A route that throws `FileNotFoundException` or `IOException`** from the Flutter app UI endpoints must still answer 404/503 with a JSON `error` the shell reads, after the two mappers merge. Pinned in Task 7 by `UiEndpointErrorsKeepTheirStatusAndErrorField`.
5. **The Orleans dashboard must not be reachable anonymously in Secured posture.** Pinned in Task 3 by `TheOrleansDashboardRequiresASession`.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the branch**

```bash
git checkout -b framework-cleanup
```

---

### Task 1: The C# catalog is a neuron; the Persistence folder goes

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/ICSharpCatalog.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpCatalogNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpCatalogStore.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpCatalogFacts.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Persistence/` (9 files)
- Delete: `src/Testing/DigitalBrain.Testing/InMemoryDocumentStore.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/PersistenceFacts.cs` (remove the two document-store facts; keep `FailedWriteRollsStateBack` and `DeactivationKeepsStateAndDoesNotReplaySignals`)

**Interfaces:**
- Consumes: `CSharpDescription(string Id, string Name, string Purpose, DateTimeOffset CreatedAt)` (existing record in `CSharpCatalogStore.cs`), `IDigitalBrain.Get<T>(string id)`.
- Produces: `ICSharpCatalog` keyed `{scope}/csharp/catalog`; `CSharpCatalogStore(IDigitalBrain brain)` keeps the same public methods `Describe`, `List`, `Read`, `Remove`, `FileKey` so `ScopedCSharpTools`, `CSharpInventoryProvider`, `CSharpToolService` do not change.

- [ ] **Step 1: Write the failing facts**

Replace the body of `CSharpCatalogFacts.cs` with facts over real grains. Keep `ModelCannotSelectAnExternalScopeOrPath`, `WorkspacesReceiveDifferentNeuronKeys`, `AHostWithoutTheCSharpModuleRefusesToRunFiles`, `ARejectedDescriptionStoresNoSource` (the last two now construct `new CSharpCatalogStore(brain)` with the `RecordingBrain`, which still records zero calls because validation throws before any grain call). Replace the two `InMemoryDocumentStore` facts with:

```csharp
[Fact]
public async Task CatalogKeepsTheNameWhenOnlyPurposeIsOmittedAndSurvivesDeactivation()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<CSharpModule>().StartAsync(ct);
    var store = new CSharpCatalogStore(brain.SiloServices.GetRequiredService<IDigitalBrain>());

    await store.Describe("workspace-one", "timer", "Timer status", "Show ticks", ct);
    await store.Describe("workspace-one", "timer", null, null, ct);
    await brain.DeactivateAsync(brain.Get<ICSharpCatalog>("workspace-one/csharp/catalog"), ct);

    var described = Assert.Single(await store.List("workspace-one", ct));
    Assert.Equal(("Timer status", "Show ticks"), (described.Name, described.Purpose));
    await store.Remove("workspace-one", "timer", ct);
    Assert.Empty(await store.List("workspace-one", ct));
    await Assert.ThrowsAsync<KeyNotFoundException>(() => store.Read("workspace-one", "timer", ct));
}

[Fact]
public async Task WorkspacesKeepSeparateCatalogs()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<CSharpModule>().StartAsync(ct);
    var store = new CSharpCatalogStore(brain.SiloServices.GetRequiredService<IDigitalBrain>());

    await store.Describe("workspace-one", "timer", "Timer", "", ct);

    Assert.Single(await store.List("workspace-one", ct));
    Assert.Empty(await store.List("workspace-two", ct));
}

[Fact]
public async Task CatalogRejectsInvalidIdsAndOversizedDescriptions()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<CSharpModule>().StartAsync(ct);
    var store = new CSharpCatalogStore(brain.SiloServices.GetRequiredService<IDigitalBrain>());

    await Assert.ThrowsAsync<ArgumentException>(() => store.Describe("workspace-one", "../timer", "Name", "", ct));
    await Assert.ThrowsAsync<ArgumentException>(() => store.Describe("workspace-one", "timer", "Name", new string('x', 4001), ct));
    Assert.Empty(await store.List("workspace-one", ct));
}
```

Check how other C# module facts start the module (`CSharpCompositionFacts.cs`) and copy the exact `WithModule` chain they use if `CSharpModule` needs companions (Time, Qdrant) to start.

- [ ] **Step 2: Run the facts to see them fail**

```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*CSharpCatalogFacts*"
```
Expected: compile error, `ICSharpCatalog` does not exist.

- [ ] **Step 3: Add the neuron contract and state**

`ICSharpCatalog.cs`:

```csharp
using Orleans.Metadata;

namespace DigitalBrain.Microsoft.CSharp;

// The human-facing names of a workspace's C# files, keyed "{scope}/csharp/catalog". Lives in the
// module runtime assembly, not Contracts: the assistant's tools are its only caller.
[Alias("csharp.catalog"), DefaultGrainType("csharp.catalog")]
public interface ICSharpCatalog : INeuron
{
    Task<CSharpDescription> Describe(string id, string? name, string? purpose);
    [Orleans.Concurrency.ReadOnly] Task<CSharpDescription[]> List();
    [Orleans.Concurrency.ReadOnly] Task<CSharpDescription> Read(string id);
    Task Remove(string id);

    static string Key(string scope) => scope + "/csharp/catalog";
}

[GenerateSerializer, Alias("csharp.catalog.state")]
public sealed class CSharpCatalogState
{
    [Id(0)] public Dictionary<string, CSharpDescription> Files { get; set; } = new(StringComparer.Ordinal);
}
```

Add `[GenerateSerializer, Alias("csharp.description")]` and `[property: Id(n)]` to `CSharpDescription` in `CSharpCatalogStore.cs`.

- [ ] **Step 4: Add the neuron**

`CSharpCatalogNeuron.cs`:

```csharp
namespace DigitalBrain.Microsoft.CSharp;

[GrainType("csharp.catalog")]
internal sealed class CSharpCatalogNeuron([PersistentState("catalog", DigitalBrain.Framework.DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CSharpCatalogState> state)
    : DigitalBrain.Framework.Neuron, ICSharpCatalog
{
    private const int MaxFilesPerWorkspace = 500;

    public async Task<CSharpDescription> Describe(string id, string? name, string? purpose)
    {
        var files = state.State.Files;
        if (!files.TryGetValue(id, out var current))
        {
            if (files.Count >= MaxFilesPerWorkspace)
            { throw new InvalidOperationException($"This workspace has reached its {MaxFilesPerWorkspace}-file limit."); }
            current = new(id, id, "", DateTimeOffset.UtcNow);
        }
        var described = current with
        {
            Name = string.IsNullOrWhiteSpace(name) ? current.Name : name.Trim(),
            Purpose = purpose?.Trim() ?? current.Purpose,
        };
        var previous = state.State;
        state.State = new CSharpCatalogState { Files = new(files, StringComparer.Ordinal) { [id] = described } };
        try { await state.WriteStateAsync(); }
        catch { state.State = previous; throw; }
        return described;
    }

    public Task<CSharpDescription[]> List()
        => Task.FromResult(state.State.Files.Values.OrderBy(file => file.Name, StringComparer.OrdinalIgnoreCase).ToArray());

    public Task<CSharpDescription> Read(string id)
        => Task.FromResult(state.State.Files.TryGetValue(id, out var file) ? file
            : throw new KeyNotFoundException($"{id} is not a C# file in this workspace."));

    public async Task Remove(string id)
    {
        if (!state.State.Files.ContainsKey(id)) { return; }
        var previous = state.State;
        var files = new Dictionary<string, CSharpDescription>(state.State.Files, StringComparer.Ordinal);
        files.Remove(id);
        state.State = new CSharpCatalogState { Files = files };
        try { await state.WriteStateAsync(); }
        catch { state.State = previous; throw; }
    }
}
```

- [ ] **Step 5: Make the store a façade over the neuron**

Rewrite `CSharpCatalogStore.cs` so the class keeps `FileKey`, `ValidateFileId` and the name/purpose length checks, and forwards to the neuron:

```csharp
public sealed class CSharpCatalogStore(IDigitalBrain brain)
{
    public static string FileKey(string scope, string id) { ValidateFileId(scope, id); return "csharp-" + Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { scope, id }))); }

    private static void ValidateFileId(string scope, string id) { /* unchanged */ }

    public Task<CSharpDescription> Describe(string scope, string id, string? name, string? purpose, CancellationToken ct)
    {
        ValidateFileId(scope, id);
        if (name is { Length: > 120 } || purpose is { Length: > 4000 })
        { throw new ArgumentException("A name is at most 120 characters and a purpose at most 4000."); }
        return Catalog(scope).Describe(id, name, purpose).WaitAsync(ct);
    }

    public Task<CSharpDescription[]> List(string scope, CancellationToken ct) => Catalog(scope).List().WaitAsync(ct);
    public Task<CSharpDescription> Read(string scope, string id, CancellationToken ct) => Catalog(scope).Read(id).WaitAsync(ct);
    public Task Remove(string scope, string id, CancellationToken ct) => Catalog(scope).Remove(id).WaitAsync(ct);

    private ICSharpCatalog Catalog(string scope) => brain.Get<ICSharpCatalog>(ICSharpCatalog.Key(scope));
}
```

Delete the `CSharpCatalog` class and the `IGrainFactory` constructor. `CSharpModule.Configure` and `CSharpAuthoringHosting` already register the store as a singleton; DI now supplies `IDigitalBrain` (registered by `AddDigitalBrain` as `CurrentBrain`). Remove `using Orleans;` if it becomes unused.

- [ ] **Step 6: Run the C# module facts**

```bash
dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
```
Expected: PASS, including `InventoryFacts` and `CSharpCompositionFacts`.

- [ ] **Step 7: Delete the Persistence folder and its doubles**

```bash
git rm -r src/DigitalBrain.Framework/DigitalBrain.Framework/Persistence
git rm src/Testing/DigitalBrain.Testing/InMemoryDocumentStore.cs
```
Remove `ClusterDocumentStoreWritesThroughGrainState` and `ReservedButUncommittedDocumentsRemainInvisibleAndCanBeRetried` from `PersistenceFacts.cs`. Run `findReferences` on `IDocumentStore`, `GrainDocumentStore`, `IDocumentGrain` and a text search for `DocumentStore` under `src/`; expected zero hits outside deleted files.

- [ ] **Step 8: Build and test Framework and Testing**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
```
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "C# catalog is a neuron; remove the Framework document store

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Dead symbols

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/ModuleOptionsSerialization.cs` (remove `SelectedModuleNames`)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Composition/ModuleOptionsFacts.cs:70` (remove the assertion / fact that only exercises it)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Types/SchemaExtensions.cs` (remove `ToJsonSchema` and `JsonFormat`; keep `McpFormPrimitive` and `ToMcpFormPrimitive`, which `TypeCatalog.McpFormKinds` uses)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Sdk/Types/TypeCatalogFacts.cs` (drop the `ToJsonSchema` assertions at lines 45, 59, 72 and the whole `EveryTypeSchemaCarriesTheXIntochatExtensions` fact with its `RequiredSchemaExtensions` field)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/ModuleDefinition.cs` (remove the `dependencies` parameter and `Dependencies` property)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/ModuleComposition.cs` (remove `visiting`, cycle detection and the dependency recursion; `Resolve` keeps dedupe and the conflict checks)

Confirmed alive, do not touch: `PopulateModuleOptions`, `GetModuleOptions`, `IMeterSink`, `IBatchMeterSink`, `MeterSource`, `MeterEvent`, `EnvironmentName`, `BrainModuleOptionsSection`.

- [ ] **Step 1: Re-confirm each symbol is dead**

For each of `SelectedModuleNames`, `ToJsonSchema`, `Dependencies` (on `ModuleDefinition`): LSP `findReferences` and a text search over `src/`. Expected: production hits only in the defining file; test hits only in the files listed above.

- [ ] **Step 2: Remove them and adjust tests**

`ModuleComposition.Resolve` becomes:

```csharp
public static IReadOnlyList<ModuleDefinition> Resolve(IReadOnlyList<ModuleDefinition> modules)
{
    ArgumentNullException.ThrowIfNull(modules);
    Dictionary<ModuleId, ModuleDefinition> selected = [];
    List<ModuleDefinition> ordered = [];
    foreach (var module in modules)
    {
        if (selected.TryGetValue(module.Id, out var previous))
        {
            if (previous.ModuleType != module.ModuleType || previous.Settings.Count != module.Settings.Count ||
                previous.Settings.Any(pair => !module.Settings.TryGetValue(pair.Key, out var value) || pair.Value != value))
            { throw new InvalidOperationException($"Conflicting definitions for module '{module.Id}'."); }
            continue;
        }
        selected.Add(module.Id, module);
        ordered.Add(module);
    }
    Dictionary<string, string?> configuration = new(StringComparer.OrdinalIgnoreCase);
    foreach (var module in ordered)
    {
        foreach (var pair in module.Settings)
        {
            if (configuration.TryGetValue(pair.Key, out var value) && value != pair.Value)
            { throw new InvalidOperationException($"Conflicting configuration key '{pair.Key}'."); }
            configuration[pair.Key] = pair.Value;
        }
    }
    return ordered.AsReadOnly();
}
```

- [ ] **Step 3: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
```
Expected: PASS. `CompositionFacts` (dedupe, conflicts, dependency order via declaration order) still green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Framework: drop unused SelectedModuleNames, ToJsonSchema and module dependencies

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The Orleans dashboard lives in the silo host composer

Why here: Orleans 10 ships `Microsoft.Orleans.Dashboard` (already versioned in `Directory.Packages.props`, referenced by no project). Its recommended deployment is co-hosted with the silo: `siloBuilder.AddDashboard()` plus `app.MapOrleansDashboard(routePrefix)`. That is exactly what `DigitalBrain.Aspire.Server` composes, and co-hosting means it ships in the same image whether the host runs under Aspire, standalone or as the Docker container, with no extra resource. The Aspire AppHost can later add a URL annotation to the brain resource; that is a follow-up, not this task. A Framework constant that nobody reads is the wrong home.

**Files:**
- Create: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/OrleansDashboard.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrain.Aspire.Server.csproj` (add `<PackageReference Include="Microsoft.Orleans.Dashboard" />`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrainServerBuilder.cs` (add `internal bool Dashboard` and `UseOrleansDashboard()`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs` (inside `UseOrleans`: `if (definition.Dashboard) { silo.AddDashboard(); }`)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/Program.cs` (`server.UseAzureStorage().UseOrleansDashboard().AddOperatingSystem()` and `app.MapOrleansDashboard();` after `app.UsePlatformHttp()`)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Hosting/DigitalBrainNames.cs` (remove `OrleansDashboardPath`)
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/Identity/OrleansDashboardFacts.cs`

- [ ] **Step 1: Write the failing E2E fact**

Follow the shape of `CookieProtectionFacts.cs` in the same folder (it starts the hosted OS in Secured posture and issues HTTP requests). Add:

```csharp
[Fact]
public async Task TheOrleansDashboardRequiresASession()
{
    var ct = TestContext.Current.CancellationToken;
    // copy the Secured-posture session setup from CookieProtectionFacts
    var anonymous = await session.Http.GetAsync("/orleans/", ct);
    Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    var signedIn = await session.SignedInHttp.GetAsync("/orleans/", ct);
    Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);
}
```
Use the exact client helpers `CookieProtectionFacts` uses for anonymous and signed-in requests.

- [ ] **Step 2: Run it to see it fail**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E -- --filter-method "*TheOrleansDashboardRequiresASession*"
```
Expected: FAIL, 404 for both.

- [ ] **Step 3: Add the server hook**

`OrleansDashboard.cs`:

```csharp
using Microsoft.AspNetCore.Builder;
using Orleans.Dashboard;

namespace DigitalBrain.Aspire.Server;

// Co-hosted in the silo, so it ships in every image. Mapped behind the host's authentication:
// grain state and method profiles are operator data.
public static class OrleansDashboard
{
    public const string Path = "/orleans";

    public static WebApplication MapOrleansDashboard(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        if (app.Services.GetRequiredService<DigitalBrainServerBuilder>().Dashboard)
        { Orleans.Dashboard.DashboardEndpointRouteBuilderExtensions.MapOrleansDashboard(app, routePrefix: Path).RequireAuthorization(); }
        return app;
    }
}
```
Verify the exact extension class and parameter name against the package with the microsoft-learn docs (`MapOrleansDashboard(routePrefix:)`, `AddDashboard()` on `ISiloBuilder`) before coding.

In `DigitalBrainServerBuilder`: `internal bool Dashboard { get; private set; }` and `public DigitalBrainServerBuilder UseOrleansDashboard() { Dashboard = true; return this; }`.

- [ ] **Step 4: Run the fact and the Aspire server unit facts**

```bash
dotnet build src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrain.Aspire.Server.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E -- --filter-method "*TheOrleansDashboardRequiresASession*"
```
Expected: PASS. If `RequireAuthorization` returns 401 in Open posture too, that is the intended posture rule (Open treats anonymous as owner through the platform's handler); if the handler does not satisfy the default policy in Open posture, add a second fact for Open posture expecting 200 and fix by using the platform's existing policy name instead of the default policy. Read `IdentityHosting.cs` for the policy name.

- [ ] **Step 5: Remove the Framework constant and commit**

Delete `OrleansDashboardPath` from `DigitalBrainNames.cs`.

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
git add -A
git commit -m "Orleans dashboard is an opt-in of the silo host, mapped behind authentication

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: BrainScope has one id

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/BrainScope.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Integrations/Accounts/ScopedConnections.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Workspace/ProblemReportEndpoint.cs:17-19`
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Enforcement/BrainScopeFacts.cs`

`Name` is always equal to `Id` (`Create` returns `new(name, owner, name)`); its three readers are `ScopedConnections` and `ProblemReportEndpoint`. `Owner` has one reader (`AgentEndpoints.cs:41`) and stays.

- [ ] **Step 1: Add the failing fact**

```csharp
[Fact]
public void AScopeIsItsIdAndOwnerOnly()
{
    var scope = BrainScope.Create("alice", "one");
    Assert.Equal(("one", "alice"), (scope.Id, scope.Owner));
    Assert.Equal(2, typeof(BrainScope).GetConstructors().Single().GetParameters().Length);
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*AScopeIsItsIdAndOwnerOnly*"
```
Expected: FAIL (3 parameters).

- [ ] **Step 3: Collapse the record**

`BrainScope.cs`: `public sealed record BrainScope(string Id, string Owner)`, `Create` returns `new(name, owner)`. Replace the `/// <summary>` block with one inline comment: `// The brain's id is its kernel's grain key and the prefix of every neuron key inside it.`

`ScopedConnections.Visible`: `records.Where(record => record.WorkspaceId == scope.Id).DistinctBy(record => record.Id)`.

`ProblemReportEndpoint`: `scope.Name` → `scope.Id` on both lines.

Also fix the stale comment in `BrainScopeFacts.TheDerivationIsStableAndDistinctPerOwnerAndName`: the `StartsWith("workspace-")` assertion is false today (`Create("alice","one").Id` is `"one"`). Read the fact; if it currently passes only because of a different test input, keep it; if it asserts the prefix on the id, change the fact to assert `Id == name`.

- [ ] **Step 4: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "BrainScope is an id and an owner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Aliases say what the types are called now

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Capacity/CapacityUnavailableException.cs` → `Alias("capacity.unavailable")`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/CallerContextStamper.cs:57` → `Alias("enforcement.untrusted-caller")`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Integrations/Accounts/Connection.cs`, `ConnectionProbe.cs`, `IConnectionRegistry.cs`: delete every `// alias predates the integrations rename; persisted, do not touch` comment and the "Signal aliases kept: see task-6 report" comment. The alias strings `connections.*` stay: the neuron type is still named `connections` (`ConnectionNames.NeuronType`).
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Integrations/IIntegration.cs:7`, `Platform/Integrations/Accounts/ConnectionProbe.cs:1`: delete the "Orleans aliases retain the original wire identities across the SDK namespace rename" comments; drop the `[Alias("DigitalBrain.Framework.Platform.Integrations.RegistrationStatus")]` on `IntegrationStatus` and `[Alias("...AccountStatus")]`, `[Alias("...AccountProbeOutcome")]` on the two enums (enums need no alias).
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Secrets/ISecrets.cs:9`: delete the "Keep the existing Orleans identity" comment.

- [ ] **Step 1: Apply the edits, then confirm no serialized-identity fact pins the old strings**

```bash
grep -rn "DigitalBrain.Kernel\|RegistrationStatus\|AccountProbeOutcome\|AccountStatus" src --include=*.cs | grep -v /obj/
```
Expected: no hits. `SerializedIdentityFacts.cs` in Framework tests references `CapacityUnavailableException` by type; read it and update any alias string literal it asserts.

- [ ] **Step 2: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Framework aliases name the current types; no compatibility comments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Redundant usings and XML summaries

**Files (usings):** every file in `src/DigitalBrain.Framework/DigitalBrain.Framework` that declares `namespace DigitalBrain.Framework` (or a sub-namespace) and carries one of `using Orleans;`, `using Orleans.Runtime;`, `using Orleans.Hosting;`, `using DigitalBrain;`, `using DigitalBrain.Framework;`, or a `using` of its own namespace. Known list from the LSP diagnostics and a text scan: `Brain/CurrentBrain.cs` (no), `Composition/BrainCompositionBuilder.cs`, `Composition/ContractCatalog.cs` (`using DigitalBrain;`), `Composition/Module.cs`, `Composition/ModuleComposition.cs`, `Composition/ModuleConfiguration.cs`, `Composition/ModuleDefinition.cs`, `Composition/ModuleDraft.cs`, `Composition/ModuleOptionsSerialization.cs`, `Composition/ModuleOptionsSlot.cs`, `Composition/ModuleSettingsValidation.cs`, `Enforcement/CallerContextStamper.cs`, `Enforcement/CallFilter.cs`, `Enforcement/ICallFilter.cs`, `Enforcement/ICallFilterStage.cs`, `Enforcement/NeuronCallFilter.cs`, `Hosting/BrainHosting.cs`, `Hosting/RuntimeStartupTask.cs`, `LocalSignalHub.cs`, `Platform/Identity/Accounts.cs`, `Platform/Identity/Grants.cs`, `Platform/Integrations/Accounts/IConnectionRegistry.cs`, `Platform/Integrations/IIntegration.cs`, `Platform/Secrets/ISecrets.cs`, `Signals/ILocalSignalHub.cs`, `SiloSignalBus.cs`, `Types/SchemaExtensions.cs`, `Types/SecretReferences.cs`, `Types/SemanticType.cs`, `Types/TypeCatalog.cs`. `using DigitalBrain.Framework.Enforcement;` is redundant only in files whose own namespace is `DigitalBrain.Framework.Enforcement`.

**Files (summaries):** `Brain/CurrentBrain.cs`, `Brain/ICreationHandler.cs`, `Brain/IDigitalBrains.cs`, `Brain/KernelNeuron.cs`, `Enforcement/PlatformAssemblyAttribute.cs`, `Enforcement/PlatformOnlyAttribute.cs`, `IActivationHandler.cs`, `Neuron.cs` (`BrainScope.cs` done in Task 4).

- [ ] **Step 1: Remove the usings**

Remove only the lines named above. After editing, the LSP diagnostics for each file must show no CS8019/CS8933 and no new errors.

- [ ] **Step 2: Convert summaries**

Each `/// <summary>…</summary>` and `/// <remarks>…</remarks>` becomes one or two `//` lines that keep only what the name does not say. Examples:

- `IActivationHandler<TNeuron>`: `// Runs once per activation of TNeuron, in registration order, before the first call; a throw fails the activation.`
- `ICreationHandler`: `// Runs when a brain is created and is awaited by IKernel.Create; idempotent, one failing does not fail the brain.`
- `IDigitalBrains`: `// The host-side seam behind IDigitalBrain: opens the brain a caller is in. Grain<T> bypasses brains for hosts and tests.`
- `CurrentBrain`: `// What silo code gets for IDigitalBrain. Keys are still module-composed, so Get resolves the raw key.`
- `KernelNeuron`: `// The brain's first neuron: state, creation, lifecycle signals.`; `KernelActivation`: `// Publishes Activated on every wake of a created brain.`
- `Neuron`: `// Every neuron is observable and activated through IActivationHandler<T>; OnActivateAsync is sealed so the runtime owns order and failure.`; `Id` property: `// Transitional: the full grain id until keys are brain-owned.`
- `PlatformAssemblyAttribute`: `// Marks the platform ring; nothing in such an assembly is ever a program-visible contract.`
- `PlatformOnlyAttribute`: `// Reserved for trusted platform code: left out of the program catalog, refused by the program edge.`

- [ ] **Step 3: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
```
Expected: PASS, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Framework: drop redundant usings and XML summaries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: One exception-to-HTTP mapper

Today `ModuleHttp.Respond` (used twice, in `AppUiEndpoints.cs`) and `ModuleRouteGuard.Guard` (used by `AppsEndpoints.cs` and `MarketplaceEndpoints.cs`) map the same exceptions to different bodies. One endpoint filter remains: `ModuleRouteGuard.Guard`, extended with the two mappings only `Respond` had.

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Http/ModuleRouteGuard.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Http/ModuleHttp.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs:37,62`
- Test: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/` (find the existing app UI endpoint facts, add one)

- [ ] **Step 1: Find how the Dart shell reads these errors**

```bash
grep -rn "error" src/DigitalBrain.Modules/Google/Flutter/app/shell/lib --include=*.dart | grep -i "json\|\['error'\]\|detail" | head -20
```
Record whether the shell reads `error` or ProblemDetails `detail`. The merged guard must emit the field the shell reads. If it reads `error`, the merged guard emits `Results.Json(new { error = message }, statusCode: n)`; if `detail`, keep `Results.Problem`. Pick one shape for all callers and change the shell in the same commit if needed (`flutter analyze` and `flutter test` from `src/DigitalBrain.Modules/Google/Flutter/app/shell`).

- [ ] **Step 2: Write the failing fact**

In the Flutter module tests, next to the existing app UI endpoint facts (search for `"/apps/node"`):

```csharp
[Fact]
public async Task UiEndpointErrorsKeepTheirStatusAndErrorField()
{
    var ct = TestContext.Current.CancellationToken;
    // start the module brain + HTTP edge the way the neighbouring fact does
    var missing = await http.GetAsync("/brains/<id>/apps/node?kind=text&name=<other-brain>/x", ct);
    Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
    var body = await missing.Content.ReadFromJsonAsync<JsonElement>(ct);
    Assert.True(body.TryGetProperty("<field from Step 1>", out _));
    var unknown = await http.GetAsync("/brains/<id>/apps/node?kind=nope&name=<id>/x", ct);
    Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
}
```

- [ ] **Step 3: Run it to see it fail**

```bash
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests -- --filter-method "*UiEndpointErrorsKeepTheirStatusAndErrorField*"
```
Expected: FAIL (field or status differs) or PASS if the shapes already agree; either way continue.

- [ ] **Step 4: Merge**

`ModuleRouteGuard.Guard` catch list, in this order: `CapacityUnavailableException` → 503, `FileNotFoundException` → 404, `KeyNotFoundException` → 404, `ArgumentException` → 400, `UnauthorizedAccessException` → 403, `InvalidOperationException` → 409, `InvalidDataException` → 422, `IOException` → 503. Body shape per Step 1.

`AppUiEndpoints.Map`: `var apps = BrainRoutes.Group(endpoints, "/apps").AddEndpointFilter(ModuleRouteGuard.Guard);` and both handlers become plain `async (…) => { … return Results.Ok(…); }` lambdas with no `ModuleHttp.Respond` wrapper. Delete `ModuleHttp.cs`.

- [ ] **Step 5: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
git add -A
git commit -m "One exception-to-HTTP mapper for module routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Regression net and the running system

- [ ] **Step 1: Unit and E2E suites of every touched project**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
```
Expected: all PASS. Live-gated scenarios compile.

- [ ] **Step 2: Run it**

From `src/DigitalBrain.AppHost`: `aspire run`. Then `mcp__aspire__list_resources`: every resource Running/Healthy. If not, `list_console_logs` for the failing one before anything else.

- [ ] **Step 3: Drive it through digitalbrain-mcp**

- `neurons_context`: confirm caller and brain.
- `neurons_search` for `csharp.catalog`; `neurons_call` `Describe` on `{brain}/csharp/catalog` with id `probe`, name `Probe`; `neurons_get` reads it back; `List` shows it; `Remove` clears it.
- Open `http://localhost:<os-port>/orleans/` with a signed-in session in the browser pane: the dashboard renders.
- Call an app UI node endpoint with an unknown kind through the shell or `curl`: 400 with the agreed body.

- [ ] **Step 4: Telemetry**

`list_traces`: a trace for the `csharp.catalog` `Describe` call and one for the `/orleans/` request. `list_structured_logs`: no warnings from `Neuron.Observers` or the catalog. Anything unexpected means the task is not done.

---

### Task 9: Pull request and reviews

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin framework-cleanup
gh pr create --title "Framework: trash removal" --body "$(cat <<'EOF'
Removes from DigitalBrain.Framework what is dead, duplicated or legacy and independent of the apps redesign.

- The C# file catalog is a neuron (`csharp.catalog`); the Framework document store, its index grain and the in-memory double are gone.
- Dead: `SelectedModuleNames`, `SchemaExtensions.ToJsonSchema`, `ModuleDefinition.Dependencies`.
- The Orleans dashboard is an opt-in of the silo host (`UseOrleansDashboard`), mapped at `/orleans` behind authentication; the unused Framework constant is gone.
- `BrainScope` is an id and an owner.
- Aliases name the current types; the "persisted, do not touch" comments are gone (no state compatibility).
- Redundant usings and XML summaries removed.
- One exception-to-HTTP mapper (`ModuleRouteGuard.Guard`); `ModuleHttp.Respond` is gone.

Plan: docs/superpowers/plans/2026-10-07-framework-trash-removal.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Bind and watch CI**

`mcp__ccd_pr__get_status`; if the PR is not reported, `mcp__ccd_pr__bind_pr`. Read CI; offer auto-fix if red. Never poll CI by hand.

- [ ] **Step 3: Two reviews**

Run `/code-review high` on the branch, fix every confirmed finding, commit. Then `/simplify`, apply, commit. Push. If the user wants the cloud review, they trigger `/code-review ultra` themselves.
