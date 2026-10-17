# Module Self-Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One source per module fact — id, hosting adapter and deployment on the module type; composition in `OsCatalog` as types; the OS image enables its catalog by default; the AppHost states only deployment decisions.

**Architecture:** Add `[ModuleHosting]` (kernel attribute, soft type-name reference like `[ModuleDeployment]`), resolve it in `DigitalBrain.Aspire.Hosting`, rework `DigitalBrainBuilder`/`DigitalBrainServerBuilder` to be keyed by type, flip `SelectModules` to enabled-unless-disabled, and delete every hand-kept transcription (AppHost `WithModule` chain, Dockerfile ENV block, pubxml list, `ModuleHostingAdapters`).

**Tech Stack:** .NET 11, Aspire 13, xUnit (`dotnet test` per project; never the `.slnx`).

**Spec:** `docs/superpowers/specs/2026-10-04-module-self-description-design.md`

## Global Constraints

- Build/test per project; smoke with `aspire run` from `src/DigitalBrain/AppHost` at the end.
- No boilerplate `/// <summary>`; comments only for what code cannot say.
- Tests: sentence-shaped names, `TestContext.Current.CancellationToken`, real grains/builders over mocks.
- `ModuleIdentity.Get` keeps its type-name fallback (ad-hoc test modules rely on it).
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

- A `[ModuleHosting]` naming a type whose assembly is absent must yield null (silo composes the module; no infra), not throw — covered in Task 2.
- A `[ModuleHosting]` naming a type that exists but does not implement `IDigitalBrainModuleHosting` must throw a clear error — covered in Task 2.
- Config `DigitalBrain:Modules:{id}:Enabled=true` for a module the server never registered must still throw (a deployment naming an unknown module is a bug) — covered in Task 4.
- `Enabled=false` must actually exclude a catalog module after the inversion — covered in Task 4.
- Registering the same module twice on `DigitalBrainBuilder` must still throw after `_modules` is reworked — covered in Task 3.

---

### Task 1: `[ModuleHosting]` attribute + annotate the 12 hosted modules

**Files:**
- Create: `src/DigitalBrain/Kernel/DigitalBrain.Kernel/Composition/ModuleHostingAttribute.cs`
- Modify: the 12 module classes that have Aspire hosting adapters (list in step 2)

**Interfaces:**
- Produces: `DigitalBrain.Kernel.ModuleHostingAttribute` with `string TypeName { get; }` — Task 2 resolves it.

- [ ] **Step 1: Write the attribute** (mirrors `ModuleDeploymentAttribute.cs`)

```csharp
namespace DigitalBrain.Kernel;

// Names a module's Aspire hosting adapter without the module depending on the hosting stack.
[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class ModuleHostingAttribute(string typeName) : Attribute
{
    public string TypeName { get; } = typeName;
}
```

- [ ] **Step 2: Annotate the modules** — add `[ModuleHosting("…")]` beside the existing `[ModuleId]`. Exact strings (adapter full name, hosting assembly name):

| Module class | Attribute argument |
|---|---|
| `AIModule` | `DigitalBrain.AI.Aspire.Hosting.AIModuleHosting, DigitalBrain.Modules.AI.Aspire.Hosting` |
| `ClickHouseModule` | `DigitalBrain.ClickHouse.Aspire.Hosting.ClickHouseModuleHosting, DigitalBrain.Modules.ClickHouse.Aspire.Hosting` |
| `FlutterModule` | `DigitalBrain.Flutter.Aspire.Hosting.FlutterModuleHosting, DigitalBrain.Modules.Flutter.Aspire.Hosting` |
| `GmailModule` (class in GoogleModule.cs) | `DigitalBrain.Google.Gmail.GmailModuleHosting, DigitalBrain.Modules.Google.Gmail.Aspire.Hosting` |
| `AspireModule` | `DigitalBrain.Microsoft.Aspire.AspireModuleHosting, DigitalBrain.Modules.Microsoft.Aspire.Aspire.Hosting` |
| `CSharpAuthoringModule` | `DigitalBrain.Microsoft.CSharp.CSharpAuthoringModuleHosting, DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting` |
| `CSharpModule` | `DigitalBrain.Microsoft.CSharp.CSharpModuleHosting, DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting` |
| `GitHubModule` | `DigitalBrain.Microsoft.GitHub.GitHubModuleHosting, DigitalBrain.Modules.Microsoft.GitHub.Aspire.Hosting` |
| `PostgresModule` | `DigitalBrain.Postgres.Aspire.Hosting.PostgresModuleHosting, DigitalBrain.Modules.Postgres.Aspire.Hosting` |
| `QdrantModule` | `DigitalBrain.Qdrant.Aspire.Hosting.QdrantModuleHosting, DigitalBrain.Modules.Qdrant.Aspire.Hosting` |
| `SalesforceModule` | `DigitalBrain.Salesforce.Aspire.Hosting.SalesforceModuleHosting, DigitalBrain.Modules.Salesforce.Aspire.Hosting` |
| `SupabaseModule` | `DigitalBrain.Supabase.Aspire.Hosting.SupabaseModuleHosting, DigitalBrain.Modules.Supabase.Aspire.Hosting` |

Before writing each, confirm the adapter's namespace from `src/Testing/DigitalBrain.Testing.E2E/Hosted/ModuleHostingAdapters.cs` (it constructs every one — note Gmail/GitHub/Aspire/CSharp adapters sit in the module's own namespace, not an `.Aspire.Hosting` sub-namespace); confirm each assembly name from the hosting project's csproj filename.

- [ ] **Step 3: Build** `dotnet build src/DigitalBrain/Kernel/DigitalBrain.Kernel` and one annotated module, e.g. `dotnet build src/Modules/Postgres/DigitalBrain.Modules.Postgres`. Expected: clean.

- [ ] **Step 4: Commit** `feat: modules name their Aspire hosting adapter on the type`

### Task 2: Attribute resolution in `DigitalBrain.Aspire.Hosting`

**Files:**
- Create: `src/Aspire/DigitalBrain.Aspire.Hosting/Brain/ModuleHostingResolution.cs`
- Test: `src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit/ModuleHostingResolutionFacts.cs`

**Interfaces:**
- Consumes: `ModuleHostingAttribute` (Task 1).
- Produces: `static IDigitalBrainModuleHosting? ModuleHostingResolution.Resolve(Type moduleType)` — Tasks 3, 6 call it.

- [ ] **Step 1: Write failing tests** (the test project already references Postgres + Time modules via existing facts' references; add project references if missing)

```csharp
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Kernel;

namespace DigitalBrain.Aspire.Hosting.Tests.Unit;

public sealed class ModuleHostingResolutionFacts
{
    [Fact]
    public void AModuleWithAHostingAttributeResolvesItsAdapter()
    {
        var hosting = ModuleHostingResolution.Resolve(typeof(DigitalBrain.Postgres.PostgresModule));
        Assert.NotNull(hosting);
        Assert.Equal("postgres", hosting!.Id);
    }

    [Fact]
    public void AModuleWithoutInfrastructureResolvesToNoAdapter()
        => Assert.Null(ModuleHostingResolution.Resolve(typeof(DigitalBrain.Time.TimeModule)));

    [Fact]
    public void AnAbsentHostingAssemblyMeansNoAdapterRatherThanAFailure()
        => Assert.Null(ModuleHostingResolution.Resolve(typeof(AbsentHostingModule)));

    [Fact]
    public void AHostingTypeThatIsNotAnAdapterIsAnError()
        => Assert.Throws<InvalidOperationException>(() => ModuleHostingResolution.Resolve(typeof(WrongHostingModule)));

    [ModuleId("absent")]
    [ModuleHosting("No.Such.Type, No.Such.Assembly")]
    private sealed class AbsentHostingModule : IModule
    { public void Configure(Orleans.Hosting.ISiloBuilder silo) { } }

    [ModuleId("wrong")]
    [ModuleHosting("System.Text.StringBuilder, System.Runtime")]
    private sealed class WrongHostingModule : IModule
    { public void Configure(Orleans.Hosting.ISiloBuilder silo) { } }
}
```

- [ ] **Step 2: Run to verify failure** `dotnet test src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit --filter-class "*ModuleHostingResolutionFacts*"` — FAIL: `ModuleHostingResolution` not defined.

- [ ] **Step 3: Implement**

```csharp
using System.Reflection;
using DigitalBrain.Kernel;

namespace DigitalBrain.Aspire.Hosting;

public static class ModuleHostingResolution
{
    // A missing assembly is a composition without that module's infrastructure, not an error;
    // a present type that is not an adapter is a bug in the attribute.
    public static IDigitalBrainModuleHosting? Resolve(Type moduleType)
    {
        ArgumentNullException.ThrowIfNull(moduleType);
        if (moduleType.GetCustomAttribute<ModuleHostingAttribute>() is not { } attribute) { return null; }
        if (Type.GetType(attribute.TypeName, throwOnError: false) is not { } hostingType) { return null; }
        if (!typeof(IDigitalBrainModuleHosting).IsAssignableFrom(hostingType))
        { throw new InvalidOperationException($"'{attribute.TypeName}' on {moduleType.Name} is not an {nameof(IDigitalBrainModuleHosting)}."); }
        return (IDigitalBrainModuleHosting)Activator.CreateInstance(hostingType)!;
    }
}
```

- [ ] **Step 4: Run tests — PASS.** (If the Postgres/Time module or their hosting packages aren't referenced by the test project, add `ProjectReference`s for `DigitalBrain.Modules.Postgres`, `DigitalBrain.Modules.Postgres.Aspire.Hosting`, `DigitalBrain.Modules.Time`.)

- [ ] **Step 5: Commit** `feat: hosting adapters resolve from the module type`

### Task 3: `DigitalBrainBuilder` keyed by type; Enabled projection deleted

**Files:**
- Modify: `src/Aspire/DigitalBrain.Aspire.Hosting/Brain/DigitalBrainBuilder.cs`
- Modify: `src/Aspire/DigitalBrain.Aspire.Hosting/Brain/DigitalBrainHostingExtensions.cs:119-124` (delete Enabled loop)
- Modify tests: `src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit/ModuleOptionOverlayFacts.cs`, `.../Postgres/PostgresAspireHostingFacts.cs`, `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit/CompositionBoundaryFacts.cs`

**Interfaces:**
- Consumes: `ModuleHostingResolution.Resolve`, `ModuleIdentity.Get`.
- Produces (new public surface; Tasks 6–7 rely on these exact signatures):
  - `DigitalBrainBuilder WithModule(Type moduleType, IReadOnlyDictionary<string, string?>? settings = null)` — id from `ModuleIdentity`, adapter from `ModuleHostingResolution`.
  - `DigitalBrainBuilder WithHosting<THosting>() where THosting : IDigitalBrainModuleHosting, new()`
  - `DigitalBrainBuilder WithHosting<THosting, TOptions>(Action<TOptions>? configure = null)` (same body as today's typed `WithModule`, renamed)
  - `DigitalBrainBuilder WithHosting(IDigitalBrainModuleHosting hosting, IReadOnlyDictionary<string, string?>? settings = null)`
  - The string-first `public WithModule(string, …)` and old `WithModule<THosting>()/<THosting,TOptions>()` are **removed**; the string core becomes `private Register(string id, IDigitalBrainModuleHosting?, IReadOnlyDictionary<string,string?>?)` with today's body (validation, overlay compilation, duplicate check, module node, `hosting?.Configure(this)`) minus nothing — only visibility changes.

- [ ] **Step 1: Rework the builder.** Rename today's `WithModule(string, hosting, settings)` body to `private DigitalBrainBuilder Register(...)` unchanged. Add:

```csharp
public DigitalBrainBuilder WithModule(Type moduleType, IReadOnlyDictionary<string, string?>? settings = null)
{
    ArgumentNullException.ThrowIfNull(moduleType);
    return Register(ModuleIdentity.Get(moduleType), ModuleHostingResolution.Resolve(moduleType), settings);
}
public DigitalBrainBuilder WithHosting(IDigitalBrainModuleHosting hosting, IReadOnlyDictionary<string, string?>? settings = null)
{
    ArgumentNullException.ThrowIfNull(hosting);
    return Register(hosting.Id, hosting, settings);
}
public DigitalBrainBuilder WithHosting<THosting>() where THosting : IDigitalBrainModuleHosting, new()
    => WithHosting(new THosting());
public DigitalBrainBuilder WithHosting<THosting, TOptions>(Action<TOptions>? configure = null)
    where THosting : IDigitalBrainModuleHosting, new() where TOptions : class, DigitalBrain.Contracts.IModuleOptions, new()
{
    var hosting = new THosting();
    var options = new TOptions();
    configure?.Invoke(options);
    options.Validate();
    return WithHosting(hosting, HostingModuleOptions.Flatten(options, hosting.Id));
}
```

Keep `_modules` (duplicate check + `Modules` property) but delete the Enabled env loop in `DigitalBrainHostingExtensions.WithReference` (lines writing `DigitalBrain__Modules__{module}__Enabled`). `Register`'s hosting-id-mismatch check (`hosting.Id != id`) stays for the Type path (catches a wrong `[ModuleHosting]` pairing).

- [ ] **Step 2: Update tests to the new surface.**
  - `PostgresAspireHostingFacts`: `brain.WithModule("postgres", new PostgresModuleHosting(), cfg)` → `brain.WithHosting(new PostgresModuleHosting(), cfg)`. The "wrong id" fact (`WithModule("other", new PostgresModuleHosting())`) is now unrepresentable through `WithHosting`; replace it with a fact that `WithModule(typeof(PostgresModule), cfg)` resolves the postgres adapter (assert via the same observable the other facts use — the provisioned resources).
  - `ModuleOptionOverlayFacts`: give each fact a private sample module type and use `WithModule(typeof(...), settings)`:

```csharp
[ModuleId("example")]
private sealed class ExampleModule : DigitalBrain.Kernel.IModule
{ public void Configure(Orleans.Hosting.ISiloBuilder silo) { } }
```

    (second fact: `[ModuleId("OverlaidModule")] private sealed class OverlaidModule …`). Add a `DigitalBrain.Kernel` project reference to the test project if missing.
  - `CompositionBoundaryFacts` (kernel tests): same pattern — a `[ModuleId("sample")] SampleModule`/`[ModuleId("module")] BoundaryModule` and `WithModule(typeof(...))`; the duplicate-registration fact asserts `WithModule(typeof(BoundaryModule))` twice throws.
  - Any fact that asserted `DigitalBrain__Modules__*__Enabled` env projection is deleted with the projection.

- [ ] **Step 3: Run** `dotnet test src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit` and `dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit` — PASS. (AppHost and Testing ring won't compile yet; that's Tasks 6–7.)

- [ ] **Step 4: Commit** `feat: DigitalBrainBuilder keyed by module type; Enabled projection removed`

### Task 4: Server enables registered modules unless disabled

**Files:**
- Modify: `src/Aspire/DigitalBrain.Aspire.Server/DigitalBrainServerBuilder.cs`
- Test: add `src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit/ModuleSelectionFacts.cs` (the Server project's tests live in this suite per the existing layout; confirm by where `DigitalBrainServerBuilder` facts sit today — if none exist, this file is the first)

**Interfaces:**
- Produces: `DigitalBrainServerBuilder.AddModule(Type moduleType)`; `AddModule<TModule>()`; `SelectModules` semantics: all registered modules run except `DigitalBrain:Modules:{id}:Enabled=false`; `Enabled=true` naming an unregistered id still throws.

- [ ] **Step 1: Write failing tests**

```csharp
using DigitalBrain.Aspire.Server;
using DigitalBrain.Kernel;
using Microsoft.Extensions.Configuration;

namespace DigitalBrain.Aspire.Hosting.Tests.Unit;

public sealed class ModuleSelectionFacts
{
    [Fact]
    public void ARegisteredModuleRunsWithoutAnyConfiguration()
    {
        var server = new DigitalBrainServerBuilder().AddModule(typeof(SampleModule));
        var modules = server.SelectModules(new ConfigurationBuilder().Build());
        Assert.Single(modules);
        Assert.IsType<SampleModule>(modules[0]);
    }

    [Fact]
    public void ADisabledModuleStaysOut()
    {
        var server = new DigitalBrainServerBuilder().AddModule(typeof(SampleModule));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["DigitalBrain:Modules:sample:Enabled"] = "false" }).Build();
        Assert.Empty(server.SelectModules(configuration));
    }

    [Fact]
    public void EnablingAnUnknownModuleIsAnError()
    {
        var server = new DigitalBrainServerBuilder().AddModule(typeof(SampleModule));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["DigitalBrain:Modules:ghost:Enabled"] = "true" }).Build();
        Assert.Throws<InvalidOperationException>(() => server.SelectModules(configuration));
    }

    [ModuleId("sample")]
    public sealed class SampleModule : IModule
    { public void Configure(Orleans.Hosting.ISiloBuilder silo) { } }
}
```

`SelectModules` is `internal`; if the test assembly lacks access, add `<InternalsVisibleTo Include="DigitalBrain.Aspire.Hosting.Tests.Unit" />` to the Server csproj.

- [ ] **Step 2: Run — FAIL** (`AddModule(Type)` missing; selection semantics differ).

- [ ] **Step 3: Implement** in `DigitalBrainServerBuilder`:

```csharp
public DigitalBrainServerBuilder AddModule(Type moduleType)
{
    ArgumentNullException.ThrowIfNull(moduleType);
    if (!typeof(IModule).IsAssignableFrom(moduleType) || moduleType.IsAbstract || moduleType.GetConstructor(Type.EmptyTypes) is null)
    { throw new ArgumentException("Select a concrete module with a public parameterless constructor.", nameof(moduleType)); }
    return AddModule(ModuleIdentity.Get(moduleType), () => (IModule)Activator.CreateInstance(moduleType)!);
}
public DigitalBrainServerBuilder AddModule<TModule>() where TModule : class, IModule, new()
    => AddModule(typeof(TModule));

internal IModule[] SelectModules(IConfiguration configuration)
{
    var sections = configuration.GetSection("DigitalBrain:Modules").GetChildren().ToArray();
    foreach (var section in sections)
    {
        if (section.GetValue<bool?>("Enabled") == true && !_modules.ContainsKey(section.Key))
        { throw new InvalidOperationException($"Selected module '{section.Key}' is not registered in this server."); }
    }
    var disabled = sections.Where(section => section.GetValue<bool?>("Enabled") == false)
        .Select(section => section.Key).ToHashSet(StringComparer.Ordinal);
    return _modules.Where(pair => !disabled.Contains(pair.Key))
        .Select(pair => pair.Value() ?? throw new InvalidOperationException($"Factory for '{pair.Key}' returned null.")).ToArray();
}
```

Keep the existing `AddModule(string id, Func<IModule>)` (the id-keyed primitive) — `AddModule(Type)` funnels into it; the old `AddModule<TModule>(string id)` overload is removed (update any caller to the new forms).

- [ ] **Step 4: Run tests — PASS.**

- [ ] **Step 5: Commit** `feat: the server runs its registered modules unless configuration disables them`

### Task 5: `OsCatalog` is types

**Files:**
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/OsCatalog.cs`
- Test: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs` (new)

**Interfaces:**
- Produces: `static IReadOnlyList<Type> OsCatalog.Modules`; `AddOperatingSystem` unchanged in name/shape.

- [ ] **Step 1: Write failing test**

```csharp
using DigitalBrain.Kernel;
using DigitalBrain.OS;

namespace DigitalBrain.OS.Tests.Unit;

public sealed class OsCatalogFacts
{
    [Fact]
    public void EveryCatalogModuleDeclaresItsIdOnTheType()
    {
        Assert.NotEmpty(OsCatalog.Modules);
        foreach (var module in OsCatalog.Modules)
        {
            Assert.True(module.IsDefined(typeof(ModuleIdAttribute), inherit: false),
                $"{module.FullName} carries no [ModuleId].");
        }
    }

    [Fact]
    public void CatalogIdsAreUnique()
    {
        var ids = OsCatalog.Modules.Select(ModuleIdentity.Get).ToArray();
        Assert.Equal(ids.Length, ids.Distinct(StringComparer.Ordinal).Count());
    }
}
```

- [ ] **Step 2: Run — FAIL** (`Modules` is tuples).

- [ ] **Step 3: Rewrite `OsCatalog`**

```csharp
using DigitalBrain.Aspire.Server;

namespace DigitalBrain.OS;

// The one place the operating system's module composition is named. Modules describe
// themselves ([ModuleId], [ModuleHosting], [ModuleDeployment]); the catalog only lists them.
// A distribution is a diff against this composition, not a copy of it.
public static class OsCatalog
{
    public static IReadOnlyList<Type> Modules { get; } =
    [
        typeof(DigitalBrain.AI.AIModule),
        typeof(DigitalBrain.ClickHouse.ClickHouseModule),
        typeof(DigitalBrain.Apps.AppsModule),
        typeof(DigitalBrain.Assistant.AssistantModule),
        typeof(DigitalBrain.Compute.ComputeModule),
        typeof(DigitalBrain.Registry.RegistryModule),
        typeof(DigitalBrain.Specs.SpecsModule),
        typeof(DigitalBrain.Files.FilesModule),
        typeof(DigitalBrain.Flutter.FlutterModule),
        typeof(DigitalBrain.Google.Gmail.GmailModule),
        typeof(DigitalBrain.Microsoft.Aspire.AspireModule),
        typeof(DigitalBrain.Microsoft.CSharp.CSharpAuthoringModule),
        typeof(DigitalBrain.Microsoft.CSharp.CSharpModule),
        typeof(DigitalBrain.Microsoft.GitHub.GitHubModule),
        typeof(DigitalBrain.Microsoft.Playwright.PlaywrightModule),
        typeof(DigitalBrain.Postgres.PostgresModule),
        typeof(DigitalBrain.Qdrant.QdrantModule),
        typeof(DigitalBrain.Salesforce.SalesforceModule),
        typeof(DigitalBrain.Supabase.SupabaseModule),
        typeof(DigitalBrain.Time.TimeModule),
    ];

    public static DigitalBrainServerBuilder AddOperatingSystem(this DigitalBrainServerBuilder server)
    {
        ArgumentNullException.ThrowIfNull(server);
        foreach (var module in Modules) { server.AddModule(module); }
        // The OS is the composition plus its apps; a distribution cannot forget them.
        server.ConfigureServices(services => services.AddOperatingSystemApps());
        return server;
    }
}
```

Update the one remaining reader of the tuple shape: `PathTruthFacts.ContainerModuleListsAgreeAndResolve` uses `OsCatalog.Modules.Select(entry => entry.Id)` — that whole fact is deleted in Task 8; if the compile breaks before then, adjust it to `Select(ModuleIdentity.Get)` temporarily.

- [ ] **Step 4: Run** `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit` — PASS.

- [ ] **Step 5: Commit** `feat: OsCatalog lists module types; ids come from the modules`

### Task 6: Testing ring resolves adapters from the attribute

**Files:**
- Delete: `src/Testing/DigitalBrain.Testing.E2E/Hosted/ModuleHostingAdapters.cs` (the `For` map)
- Modify: same file's `AddModules` — keep the extension, drop the map

**Interfaces:**
- Consumes: `DigitalBrainBuilder.WithModule(Type, settings)` (Task 3).

- [ ] **Step 1: Replace the file's contents**

```csharp
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Kernel;
namespace DigitalBrain.Testing.E2E;

internal static class ModuleHostingAdapters
{
    internal static DigitalBrainBuilder AddModules(this DigitalBrainBuilder brain, IReadOnlyList<ModuleDefinition> modules)
    {
        foreach (var module in ModuleComposition.Resolve(modules))
        { brain.WithModule(module.ModuleType, module.Configuration); }
        return brain;
    }
}
```

- [ ] **Step 2: Build** `dotnet build src/Testing/DigitalBrain.Testing.E2E` — clean.

- [ ] **Step 3: Run one module E2E-composing unit suite as a canary**, e.g. `dotnet test src/Modules/Time/tests/DigitalBrain.Modules.Time.Tests.Unit` (pick the Time module's actual test project path; any fast module suite that goes through `ModuleTest` works). Expected: PASS.

- [ ] **Step 4: Commit** `refactor: test hosts resolve hosting adapters from the module type`

### Task 7: The AppHost speaks only deployment

**Files:**
- Modify: `src/DigitalBrain/AppHost/AppHost.cs`
- Modify: `src/DigitalBrain/AppHost/appsettings.json` (add the moved option values)

**Interfaces:**
- Consumes: `WithHosting<THosting>()`, `WithHosting<THosting, TOptions>(configure)` (Task 3).

- [ ] **Step 1: Rewrite the chain.** Delete every `WithModule("…")` string call (playwright, time, files, compute, registry, specs, apps, assistant) — composition is the silo's. Rename remaining typed calls to `WithHosting`, keeping only deployment decisions in code:

```csharp
var digitalBrain = builder.AddDigitalBrain(ProductSurfaceResources.Modules, serviceId: "intochat", options: new() { UseAzureStorage = true, Dashboard = true })
    .WithHttpIdentity(new("intochat.session", "IntoChat.v1", IntoChatConfiguration.ProtectionContainerName))
    .WithHosting<DigitalBrain.AI.Aspire.Hosting.AIModuleHosting, AIOptions>(ai =>
    {
        ai.WithLlm<IGpt56Luna>();
        ai.WithDefaultLlm<IDeepSeekV41Flash>();
        ai.WithDefaultEmbedding<ITextEmbedding3Small>();
        ai.WithVoiceToText<IWhisperLargeV3Turbo>();
        ai.WithTavilySearch();
    })
    .WithHosting<DigitalBrain.Qdrant.Aspire.Hosting.QdrantModuleHosting, QdrantModuleOptions>(qdrant => qdrant.WithHostedQdrant())
    .WithHosting<DigitalBrain.ClickHouse.Aspire.Hosting.ClickHouseModuleHosting, ClickHouseModuleOptions>(database => database.WithClickHouse())
    .WithHosting<DigitalBrain.Supabase.Aspire.Hosting.SupabaseModuleHosting, SupabaseModuleOptions>(database => database.WithConnection("supabase"))
    .WithHosting<DigitalBrain.Postgres.Aspire.Hosting.PostgresModuleHosting, PostgresModuleOptions>(database => database.WithPostgres(options => options.DatabaseName = "digitalbrain"))
    .WithHosting<DigitalBrain.Google.Gmail.GmailModuleHosting, GmailModuleOptions>(gmail => gmail.WithGmail())
    .WithHosting<DigitalBrain.Salesforce.Aspire.Hosting.SalesforceModuleHosting, SalesforceModuleOptions>(salesforce => salesforce.WithHostedMcp())
    .WithHosting<DigitalBrain.Microsoft.GitHub.GitHubModuleHosting>()
    .WithHosting<DigitalBrain.Flutter.Aspire.Hosting.FlutterModuleHosting, FlutterModuleOptions>(flutter => flutter.RunDesktopApp())
    .WithHosting<DigitalBrain.Microsoft.Aspire.AspireModuleHosting>()
    .WithHosting<DigitalBrain.Microsoft.CSharp.CSharpModuleHosting>()
    .WithHosting<DigitalBrain.Microsoft.CSharp.CSharpAuthoringModuleHosting>();
```

`ai.Telemetry.EnableSensitiveData = true` moves to `appsettings.json`:

```json
"DigitalBrain": { "Modules": { "ai": { "Options": { "Telemetry": { "EnableSensitiveData": "true" } } } } }
```

(merge into the existing file's structure; the `Register` overlay already lifts `DigitalBrain:Modules:ai:Options:*` keys from AppHost configuration into the silo's env. Verify the flattened key by checking `HostingModuleOptions.Flatten`'s output shape for the nested `Telemetry` property and match it.)

- [ ] **Step 2: Build** `dotnet build src/DigitalBrain/AppHost` — clean.

- [ ] **Step 3: Run host-composition tests** `dotnet test src/IntoChat/Tests/IntoChat.Tests.Unit` — expect `CompositionFacts` green (it starts the AppHost model); `PathTruthFacts` may fail on the list-agreement fact — that deletion is Task 8; if it blocks, do Task 8's test deletion in this commit instead and say so in the message.

- [ ] **Step 4: Commit** `feat: the AppHost states deployment decisions only`

### Task 8: Delete the transcriptions (Dockerfile, pubxml, PathTruthFacts)

**Files:**
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/Dockerfile` — delete every `DigitalBrain__Modules__*__Enabled` ENV line (keep `IntoChat__Hosted__Enabled`, `DigitalBrain__Standalone`, and the rest)
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/Properties/PublishProfiles/Container.pubxml` — delete every `ContainerEnvironmentVariable` whose `Include` starts with `DigitalBrain__Modules__`
- Modify: `src/IntoChat/Tests/IntoChat.Tests.Unit/PathTruthFacts.cs` — delete `ContainerModuleListsAgreeAndResolve`; keep `TheBrowserModuleSelectedByTheAppHostShipsWithTheRuntime`
- Modify: both files' comments that say "module set checked against AppHost composition by the host unit suite" — now false; replace with "The image enables the OS catalog; configuration may disable modules (`DigitalBrain__Modules__{id}__Enabled=false`)."

- [ ] **Step 1: Make the edits above.**

- [ ] **Step 2: Run** `dotnet test src/IntoChat/Tests/IntoChat.Tests.Unit` — PASS.

- [ ] **Step 3: Commit** `feat: the image is the composition; enabled-list transcriptions deleted`

### Task 9: Flutter options bind from configuration; Program.cs drops the code-set title

**Files:**
- Modify: `src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter/FlutterModule.cs`
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/Program.cs` (delete the `Configure<FlutterModuleOptions>` line and its comment)
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/appsettings.json` (carry the IntoChat title as configuration)
- Test: the Flutter module's unit test project (find it under `src/Modules/Google/Flutter/`; add `FlutterOptionsBindingFacts.cs`)

**Interfaces:**
- Produces: `FlutterModuleOptions` bound from `DigitalBrain:Modules:flutter:Options` in the silo.

- [ ] **Step 1: Write failing test** (in the Flutter module's unit test project; follow that project's existing host-building pattern — if it uses `ModuleTest.Create().WithModule<FlutterModule>()`, assert through a resolved `IOptions<FlutterModuleOptions>`):

```csharp
[Fact]
public void TheAssistantTitleComesFromModuleConfiguration()
{
    var silo = new HostBuilder().UseOrleans(silo =>
    {
        silo.UseLocalhostClustering();
        new FlutterModule().Configure(silo);
    }).ConfigureAppConfiguration(configuration => configuration.AddInMemoryCollection(
        new Dictionary<string, string?> { ["DigitalBrain:Modules:flutter:Options:AssistantTitle"] = "IntoChat" })).Build();
    var options = silo.Services.GetRequiredService<IOptions<FlutterModuleOptions>>();
    Assert.Equal("IntoChat", options.Value.AssistantTitle);
}
```

(Adapt construction to the project's prevailing test idiom; the assertion — options value comes from the configuration key — is the fact.)

- [ ] **Step 2: Run — FAIL** (no binding registered).

- [ ] **Step 3: Implement** in `FlutterModule.Configure(ISiloBuilder silo)` (mirroring the Time module's pattern):

```csharp
public void Configure(ISiloBuilder silo)
{
    ArgumentNullException.ThrowIfNull(silo);
    silo.Services.AddOptions<FlutterModuleOptions>().Configure<IConfiguration>(
        static (options, configuration) => configuration.GetSection("DigitalBrain:Modules:flutter:Options").Bind(options));
}
```

- [ ] **Step 4: Move the value.** Delete from `Program.cs`:

```csharp
// FlutterModuleOptions has no configuration binding in the silo, so the shell title is code.
builder.Services.Configure<DigitalBrain.Flutter.FlutterModuleOptions>(options => options.AssistantTitle = "IntoChat");
```

Add to the OS `appsettings.json`: `"DigitalBrain": { "Modules": { "flutter": { "Options": { "AssistantTitle": "IntoChat" } } } }` (merged into existing structure).

- [ ] **Step 5: Run** the Flutter module unit suite and `dotnet build src/DigitalBrain/OS/DigitalBrain.OS` — PASS/clean.

- [ ] **Step 6: Commit** `feat: Flutter options bind from configuration; the shell title is configuration`

### Task 10: Full verification

- [ ] **Step 1: Build everything that moved:** OS, AppHost, Aspire.Hosting, Aspire.Server, Testing.E2E, both IntoChat test projects, OS tests.
- [ ] **Step 2: Run the unit suites:** Kernel, Aspire.Hosting.Tests.Unit, OS.Tests.Unit, IntoChat.Tests.Unit, the Flutter module suite, one module canary suite.
- [ ] **Step 3: Smoke:** `aspire run` from `src/DigitalBrain/AppHost`; all resources Healthy; the silo log shows the full catalog composing (all 20 modules).
- [ ] **Step 4: Commit** anything remaining; update `CLAUDE.md`'s module-contract paragraph if it mentions the old `Enabled` opt-in semantics.
