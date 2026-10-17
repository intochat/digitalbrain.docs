# Module Identity & Configuration Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One module mechanism across the whole system — a module is an object that knows its `ModuleId`; hosting/deployment claim it through a generic parameter; every configuration value travels the one grammar under `DigitalBrain:Modules:{id}:Options`; no attributes, no string type names, no private configuration roots.

**Architecture:** `Module` abstract class (constructor-enforced `ModuleId`) lives whole in `DigitalBrain.Contracts`; `DigitalBrain.Kernel` keeps only the Orleans.Server runtime machinery. The catalog holds instances. `ModuleHosting<TModule>` / `ModuleDeployment<TModule>` replace `[ModuleHosting]`/`[ModuleDeployment]`; discovery scans referenced assemblies of known roots. AI stops being a grammar exception: hosting declarations become typed on the adapter, options bind under the standard section only.

**Tech Stack:** .NET / C# 13, Orleans (Core.Abstractions in Contracts, Server in Kernel), Aspire hosting, xUnit.

**Spec:** `docs/superpowers/specs/2026-10-05-module-identity-amendment.md` (amends `docs/superpowers/specs/2026-10-04-module-self-description-design.md`)

## Global Constraints

- Build/test per project, never the `.slnx` (Windows handshake bug): `dotnet test src/<path-to-test-project>`.
- Persisted grain state rules unchanged (`[Id(n)]` append-only, concrete arrays) — this plan must not touch grain state types.
- No boilerplate `/// <summary>`; names carry meaning; small comments only for what code cannot say.
- Tests: sentence-shaped names, `TestContext.Current.CancellationToken`, real grains/components over mocks.
- `ModuleId` grammar: ASCII letters, digits, hyphens — exactly the rule currently inlined in `DigitalBrainBuilder.Register`.
- Configuration grammar: only `DigitalBrainConfiguration` implements key conventions; module options live under `DigitalBrain:Modules:{id}:Options`.
- Final smoke: `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`, all resources Healthy.
- Commits at each task end, message style `refactor:`/`feat:`/`test:` as in recent history, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Two module ids differing only by case** (`"AI"` vs `"ai"`): configuration sections are case-insensitive, so they would collide downstream — registration must treat them as duplicates. Pinned by test in Task 1 (`ModuleId` equality is case-insensitive) and Task 4 (duplicate registration throws).
2. **A composed module whose hosting package is absent from the test host**: must compose with no adapter, silently — not throw. Pinned by test in Task 5 (scanner returns null for unclaimed module).
3. **A composed module whose deployment contributor is missing from the deployment program**: must fail loudly naming the module, not deploy half a system. Pinned by test in Task 6.
4. **Legacy `DigitalBrain:AI:*` keys in an environment after migration**: would be silently ignored, reviving config as dead weight. Pinned in Task 9: the runtime refuses to start when the legacy section is present (one guard, one test).
5. **An options type whose `Validate()` throws during `Flatten`/`Compile` with defaults**: `Compile` calls `Validate()` on code-declared options; a validation requiring external facts breaks composition at startup. Pinned in Task 8: `AIOptions.Validate()` with defaults is a no-op test.

## Status (2026-10-05)

Tasks 1–7 are implemented and committed (`21deb6bb8` … `fc3219c0d`): `ModuleId`, `Module` in
Contracts, the 21-module migration, instance catalog, `ModuleHosting<TModule>` +
`ModuleHostingScan`, `ModuleDeployment<TModule>` + scan-based `Discover`, attributes deleted.
Remaining: Tasks 8–12. A repo-wide audit found the AI diseases in other modules too, so the
grammar/purity work now covers **every module**, not just AI — Tasks 10 and 11 below carry the
inventory.

---

### Task 1: `ModuleId` — the typed identity and grammar owner

**Files:**
- Create: `src/DigitalBrain/DigitalBrain.Contracts/ModuleId.cs`
- Modify: `src/DigitalBrain/DigitalBrain.Contracts/DigitalBrainConfiguration.cs`
- Test: `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit/ModuleIdFacts.cs` (create)

**Interfaces:**
- Produces: `readonly record struct ModuleId` with `ModuleId(string value)` ctor, `string Value`, `ToString()`, case-insensitive equality. `DigitalBrainConfiguration.ModuleSection(ModuleId)`, `ModuleOptionsSection(ModuleId)`, `BrainModuleOptionsSection(string brainName, ModuleId)` overloads; the existing `string` overloads remain and delegate through `new ModuleId(id)`, so the grammar now validates at every boundary.

- [x] **Step 1: Write the failing tests**

```csharp
namespace DigitalBrain.Kernel.Tests.Unit;

public sealed class ModuleIdFacts
{
    [Theory]
    [InlineData("postgres")] [InlineData("ai")] [InlineData("csharp-authoring")]
    public void A_valid_id_round_trips_as_its_string(string value)
        => Assert.Equal(value, new DigitalBrain.Contracts.ModuleId(value).ToString());

    [Theory]
    [InlineData("")] [InlineData(" ")] [InlineData("a b")] [InlineData("a_b")] [InlineData("a:b")]
    public void An_id_outside_the_grammar_cannot_be_constructed(string value)
        => Assert.ThrowsAny<ArgumentException>(() => new DigitalBrain.Contracts.ModuleId(value));

    [Fact]
    public void Ids_differing_only_by_case_are_the_same_id()
        => Assert.Equal(new DigitalBrain.Contracts.ModuleId("AI"), new DigitalBrain.Contracts.ModuleId("ai"));

    [Fact]
    public void The_configuration_sections_speak_module_id()
        => Assert.Equal("DigitalBrain:Modules:ai:Options",
            DigitalBrain.Contracts.DigitalBrainConfiguration.ModuleOptionsSection(new DigitalBrain.Contracts.ModuleId("ai")));
}
```

- [x] **Step 2: Run to verify they fail** — `dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit --filter ModuleIdFacts` → compile error (`ModuleId` not defined).

- [x] **Step 3: Implement**

```csharp
namespace DigitalBrain.Contracts;

// A module's name on every channel: configuration sections, registration, hosting, deployment.
// Valid by construction; configuration keys are case-insensitive, so equality is too.
public readonly record struct ModuleId
{
    public ModuleId(string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        if (value.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-'))
        { throw new ArgumentException($"'{value}' is not a module id: ASCII letters, digits, hyphens.", nameof(value)); }
        Value = value;
    }

    public string Value { get; }
    public override string ToString() => Value;
    public bool Equals(ModuleId other) => string.Equals(Value, other.Value, StringComparison.OrdinalIgnoreCase);
    public override int GetHashCode() => StringComparer.OrdinalIgnoreCase.GetHashCode(Value ?? string.Empty);
}
```

In `DigitalBrainConfiguration` add overloads and route the string ones through them:

```csharp
public static string ModuleSection(ModuleId moduleId) => $"{ModulesSectionName}:{moduleId}";
public static string ModuleSection(string moduleId) => ModuleSection(new ModuleId(moduleId));
public static string ModuleOptionsSection(ModuleId moduleId) => ModuleSection(moduleId) + ":Options";
public static string ModuleOptionsSection(string moduleId) => ModuleOptionsSection(new ModuleId(moduleId));
public static string BrainModuleOptionsSection(string brainName, ModuleId moduleId)
    => $"DigitalBrain:Brains:{brainName}:Modules:{moduleId}:Options";
public static string BrainModuleOptionsSection(string brainName, string moduleId)
    => BrainModuleOptionsSection(brainName, new ModuleId(moduleId));
```

- [x] **Step 4: Run tests** — same filter → PASS. Also `dotnet build src/DigitalBrain/DigitalBrain.Contracts`.
- [x] **Step 5: Commit** — `feat: ModuleId owns the module name grammar`

---

### Task 2: `Module` abstract class in Contracts

**Files:**
- Create: `src/DigitalBrain/DigitalBrain.Contracts/Module.cs`
- Test: `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit/ModuleFacts.cs` (create)

**Interfaces:**
- Consumes: `ModuleId` (Task 1), `IModuleOptions` (existing), `ISiloBuilder` from Orleans.Core.Abstractions (Contracts already references it — verify before coding; if `ISiloBuilder` turns out to live in a Server-only assembly, STOP and surface it: the relocation leg of the spec depends on this fact).
- Produces: `public abstract class Module { protected Module(ModuleId id); public ModuleId Id { get; } public abstract void Configure(ISiloBuilder silo); }` and `public abstract class Module<TOptions> : Module where TOptions : class, IModuleOptions, new()` with the same ctor.

> **Deviation (recorded 2026-10-05, executor):** the pre-coding verification found the premise false:
> `Orleans.Hosting.ISiloBuilder` is defined in `Microsoft.Orleans.Runtime` (verified for the resolved
> `10.3.1` and for `10.1.1-preview.1`/`10.2.2`), not `Orleans.Core.Abstractions`. It is reachable only
> through `Microsoft.Orleans.Server`. Per the plan's own STOP instruction this was surfaced and the
> design owner chose to add `Microsoft.Orleans.Runtime` (10.3.1, pinned in `Directory.Packages.props`)
> to `DigitalBrain.Contracts` — the least change that keeps every Task 3–9 code shape verbatim. The
> spec §2 text ("`ISiloBuilder` is defined in Orleans.Core.Abstractions, which Contracts already
> references") is thereby factually wrong and is amended in Task 10; the boundary decision (module
> declaration in Contracts; runtime in Kernel) is unchanged, but Contracts now also carries the
> Orleans.Runtime assembly reference.

- [x] **Step 1: Write the failing test**

```csharp
public sealed class ModuleFacts
{
    private sealed class ExampleOptions : DigitalBrain.Contracts.IModuleOptions { public void Validate() { } }
    private sealed class ExampleModule() : DigitalBrain.Contracts.Module<ExampleOptions>(new("example"))
    { public override void Configure(Orleans.Hosting.ISiloBuilder silo) { } }

    [Fact]
    public void A_module_knows_its_id_from_birth()
        => Assert.Equal("example", new ExampleModule().Id.ToString());
}
```

- [x] **Step 2: Run to verify it fails** — compile error.
- [x] **Step 3: Implement**

```csharp
using Orleans.Hosting;

namespace DigitalBrain.Contracts;

public abstract class Module
{
    protected Module(ModuleId id) => Id = id;
    public ModuleId Id { get; }
    public abstract void Configure(ISiloBuilder silo);
}

public abstract class Module<TOptions> : Module where TOptions : class, IModuleOptions, new()
{
    protected Module(ModuleId id) : base(id) { }
}
```

- [x] **Step 4: Run tests** → PASS.
- [x] **Step 5: Commit** — `feat: Module is an object that knows its name`

---

### Task 3: The migration — every module becomes a `Module`, Kernel keeps only machinery

This task is one compilation unit: interface swap + 21 module classes + the Kernel composition machinery + the server builder. One commit at the end; the build is the gate, existing suites are the tests.

**Files:**
- Delete: `src/DigitalBrain/Kernel/DigitalBrain.Kernel/IModule.cs`
- Modify (module classes — replace `: IModule<TOptions>` with `: Module<TOptions>(new ModuleId("<id>"))` using primary-constructor syntax, copying `<id>` verbatim from the class's current `[ModuleId("...")]` attribute, deleting that attribute and `Configure` gains `override`; a module implementing bare `IModule` derives `Module` the same way):
  - `src/Modules/AI/DigitalBrain.Modules.AI/AIModule.cs`
  - `src/Modules/ClickHouse/DigitalBrain.Modules.ClickHouse/ClickHouseModule.cs`
  - `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs`
  - `src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantModule.cs`
  - `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/ComputeModule.cs`
  - `src/Modules/DigitalBrain/Registry/DigitalBrain.Modules.Registry/RegistryModule.cs`
  - `src/Modules/DigitalBrain/Specs/DigitalBrain.Modules.Specs/SpecsModule.cs`
  - `src/Modules/Files/DigitalBrain.Modules.Files/FilesModule.cs`
  - `src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter/FlutterModule.cs`
  - `src/Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail/GoogleModule.cs`
  - `src/Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/AspireModule.cs`
  - `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/CSharpAuthoringModule.cs`
  - `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/CSharpModule.cs`
  - `src/Modules/Microsoft/GitHub/DigitalBrain.Modules.Microsoft.GitHub/GitHubModule.cs`
  - `src/Modules/Microsoft/Playwright/DigitalBrain.Modules.Microsoft.Playwright/PlaywrightModule.cs`
  - `src/Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresModule.cs`
  - `src/Modules/Qdrant/DigitalBrain.Modules.Qdrant/QdrantModule.cs`
  - `src/Modules/Salesforce/DigitalBrain.Modules.Salesforce/SalesforceModule.cs`
  - `src/Modules/Supabase/DigitalBrain.Modules.Supabase/SupabaseModule.cs`
  - `src/Modules/Time/DigitalBrain.Modules.Time/TimeModule.cs`
  - `src/Testing/DigitalBrain.Testing.E2E/Demo/TwitterFakes.cs` (test module — same pattern)
- Modify (Kernel composition machinery, `src/DigitalBrain/Kernel/DigitalBrain.Kernel/Composition/`): `ModuleDefinition.cs`, `ModuleDraft.cs`, `ModuleConfiguration.cs`, `ModuleComposition.cs`, `ModuleInventory.cs`, `ModuleOptionsSerialization.cs`, `BrainCompositionBuilder.cs`, `BrainComposition.cs`
- Modify: `src/Aspire/DigitalBrain.Aspire.Server/DigitalBrainServerBuilder.cs`
- Modify: fix remaining compile errors in `DigitalBrain.Sdk`, `DigitalBrain.Testing`, `DigitalBrain.Testing.E2E`, `DigitalBrain.Kernel.AspNetCore` by the same substitution (`IModule` → `Module`, `ModuleIdentity.Get(typeof(T))` → instance `.Id`); do NOT touch `ModuleIdentity.cs` or the attributes yet (Task 7 deletes them once hosting/deployment stop reading them).

**Interfaces:**
- Consumes: `Module`, `Module<TOptions>`, `ModuleId` (Tasks 1–2).
- Produces (later tasks rely on these exact shapes):
  - `ModuleDefinition(Module Module, IReadOnlyDictionary<string, string?> Settings)` — holds the instance, not the `Type`; expose `public Type ModuleType => Module.GetType();` for sites that key by type.
  - `ModuleOptionsSerialization.Compile<TModule, TOptions>(TOptions options) where TModule : Module<TOptions>, new()` → `new ModuleDefinition(new TModule(), FlattenOptions(options, new TModule().Id.ToString()))` (construct the module once, reuse).
  - `DigitalBrainServerBuilder.AddModule(Module module)` replaces `AddModule(Type)` and `AddModule<TModule>()` gains `where TModule : Module, new()` → `AddModule(new TModule())`; internal store becomes `Dictionary<string, Module>` keyed `module.Id.ToString()` with `StringComparer.OrdinalIgnoreCase`, `TryAdd` failure message unchanged; `SelectModules` returns `Module[]` and drops the null-factory check (there is no factory).
  - Generic constraints repo-wide change from `class, IModule, new()` to `Module, new()` — `ModuleConfiguration<TModule>`, `BrainCompositionBuilder.WithModule<TModule>`, `ModuleTestBuilder.WithModule<TModule>`, `E2ETestBuilder.WithModule<TModule>`.

> **Deviations (recorded 2026-10-05, executor):**
> - `BrainCompositionBuilder.RequireModules` and `ModuleTestBuilder.RequireModules` now take
>   `IEnumerable<Module>` instead of `IEnumerable<Type>` (modules are instances; callers construct
>   one). The two call sites (`WebBrowserFacts`, `AssistantStreamFacts`) were updated to `[new X()]`.
>   This also removes the last non-generic `Activator.CreateInstance(moduleType)` from the
>   composition machinery.
> - `ModuleOptionsSlot.For` now detects the options type by walking base types for `Module<>`
>   (the base class) instead of `GetInterfaces()` for `IModule<>`.
> - `CompositionFacts.NonModuleTypeFailsImmediately` was deleted: `ModuleDefinition` now takes a
>   `Module` instance, so "a non-module type" is unrepresentable (a compile error), and there is no
>   runtime guard left to test.
> - `ModuleHostChannel.CreateModule` reconstructs a module from its serialized type in the
>   cross-process E2E runtime host; that process boundary genuinely needs reflection and is outside
>   the composition machinery the spec's Activator deletion targets. Recorded, not improvised.
> - `ModuleInventory` was left `IReadOnlyList<Type>` (unchanged): it is fed `ModuleDefinition.ModuleType`
>   and its consumers (registry, integration discovery, script contracts) key by assembly/type, not
>   by module instance. Listed in the plan as possibly needing a change; none was required.
> - `CompositionBoundaryFacts.SampleModule`/`BoundaryModule` keep their `[ModuleId]` attributes
>   until Task 5, because `DigitalBrainBuilder.WithModule(Type)` (Aspire.Hosting) still reads the
>   attribute; the same instance-based migration applies to them once Task 5 deletes that overload.

- [x] **Step 1: Switch the Kernel composition machinery** to the `Produces` shapes above. Where `ModuleIdentity.Get(typeof(TModule))` appears, replace with a constructed instance's `.Id.ToString()`.
- [x] **Step 2: Migrate the 21 module classes.** Pattern (before → after):

```csharp
// before
[ModuleId("clickhouse")]
[ModuleHosting("…")]          // leave other attributes in place for now
public sealed class ClickHouseModule : IModule<ClickHouseModuleOptions>
{ public void Configure(ISiloBuilder silo) { … } }

// after ([ModuleId] deleted; [ModuleHosting]/[ModuleDeployment] stay until Tasks 5–6)
[ModuleHosting("…")]
public sealed class ClickHouseModule() : Module<ClickHouseModuleOptions>(new ModuleId("clickhouse"))
{ public override void Configure(ISiloBuilder silo) { … } }
```

A module with an explicit constructor body keeps it and chains `: base(new ModuleId("…"))` instead.
- [x] **Step 3: Update `DigitalBrainServerBuilder` and sweep remaining compile errors.** Build in dependency order and fix by the same substitutions only: `dotnet build src/DigitalBrain/DigitalBrain.Contracts && dotnet build src/DigitalBrain/Kernel/DigitalBrain.Kernel && dotnet build src/Aspire/DigitalBrain.Aspire.Server && dotnet build src/DigitalBrain/OS/DigitalBrain.OS && dotnet build src/Testing/DigitalBrain.Testing.E2E`
- [x] **Step 4: Run the kernel and OS suites** — `dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit` and `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`. Expected: PASS except facts that assert the old attribute/tuple shapes (`OsCatalogFacts`, `ProductCompositionFacts` lines using `ModuleIdentity.Get`) — update those asserts to `module.Id.ToString()` over catalog instances in Task 4; if they fail here, note and proceed to Task 4 within the same session, but do not commit red.
- [x] **Step 5: Commit** (with Task 4 if the suites interlock) — `refactor: a module is an instance that knows its id; IModule is gone`

---

### Task 4: The catalog holds instances

**Files:**
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/OsCatalog.cs`
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs`, `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs`

**Interfaces:**
- Consumes: `Module`, `DigitalBrainServerBuilder.AddModule(Module)` (Task 3).
- Produces: `OsCatalog.Modules : IReadOnlyList<Module>` — later tasks and tests iterate instances.

- [x] **Step 1: Update the catalog**

```csharp
public static IReadOnlyList<Module> Modules { get; } =
[
    new DigitalBrain.AI.AIModule(),
    new DigitalBrain.ClickHouse.ClickHouseModule(),
    // … same 20 entries as today, `typeof(X)` → `new X()`
];

public static DigitalBrainServerBuilder AddOperatingSystem(this DigitalBrainServerBuilder server)
{
    ArgumentNullException.ThrowIfNull(server);
    foreach (var module in Modules) { server.AddModule(module); }
    server.ConfigureServices(services => services.AddOperatingSystemApps());
    return server;
}
```

Update the class comment: modules describe themselves on the instance (id in the constructor), the catalog lists instances.
- [x] **Step 2: Add the duplicate-id fact** (Review Focus 1) to `OsCatalogFacts`:

```csharp
[Fact]
public void No_two_catalog_modules_share_an_id_even_by_case()
{
    var ids = OsCatalog.Modules.Select(m => m.Id.ToString().ToLowerInvariant()).ToArray();
    Assert.Equal(ids.Length, ids.Distinct().Count());
}
```

And a `DigitalBrainServerBuilder` fact (in `DigitalBrain.OS.Tests.Unit` or the Aspire server's suite): registering two modules whose ids differ only by case throws `InvalidOperationException`.
- [x] **Step 3: Update existing facts** — replace `OsCatalog.Modules.Select(ModuleIdentity.Get)` with `OsCatalog.Modules.Select(m => m.Id.ToString())`; `ProductCompositionFacts` hosting-coverage checks keep working against `module.GetType()` until Task 5 replaces attribute probing.
- [x] **Step 4: Run** `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit` → PASS.
- [x] **Step 5: Commit** — `refactor: the catalog is instances; the instance is the descriptor`

---

### Task 5: Hosting claims its module through the generic parameter

**Files:**
- Modify: `src/Aspire/DigitalBrain.Aspire.Hosting/Composition/IDigitalBrainModuleHosting.cs`
- Create: `src/Aspire/DigitalBrain.Aspire.Hosting/Composition/ModuleHosting.cs`
- Delete: `src/Aspire/DigitalBrain.Aspire.Hosting/Composition/ModuleHostingResolution.cs`
- Modify: `src/Aspire/DigitalBrain.Aspire.Hosting/Composition/DigitalBrainBuilder.cs` (delete `WithModule(Type)`; `Register` loses the inline id-grammar check and the `hosting.Id != id` cross-check; `WithHosting` keys by `hosting.Module`)
- Modify (12 adapters, `public sealed class XModuleHosting : IDigitalBrainModuleHosting { public string Id => "x"; … }` → `: ModuleHosting<XModule>`, delete the `Id` property, `Configure` gains `override`): `AIModuleHosting.cs`, `ClickHouseModuleHosting.cs`, `FlutterModuleHosting.cs`, `GmailModuleHosting.cs`, `AspireModuleHosting.cs`, `CSharpAuthoringModuleHosting.cs`, `CSharpModuleHosting.cs`, `GitHubModuleHosting.cs`, `PostgresModuleHosting.cs`, `QdrantModuleHosting.cs`, `SalesforceModuleHosting.cs`, `SupabaseModuleHosting.cs` (paths as enumerated in the repo — each `src/Modules/<…>/<…>.Aspire.Hosting/`)
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Hosted/ModuleHostingAdapters.cs` — becomes the scanner
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs` — coverage check reads scanner results instead of `[ModuleHosting]`
- Test: `src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit/ModuleHostingScanFacts.cs` (create)
- Note: each `*.Aspire.Hosting` csproj must reference its module's runtime project (for `typeof(XModule)`); most already do via Contracts — add the ProjectReference where missing.

**Interfaces:**
- Consumes: `Module`, `ModuleId`.
- Produces:

```csharp
public interface IDigitalBrainModuleHosting
{
    ModuleId Module { get; }
    void Configure(DigitalBrainBuilder brain);
}

public abstract class ModuleHosting<TModule> : IDigitalBrainModuleHosting where TModule : Module, new()
{
    public ModuleId Module { get; } = new TModule().Id;
    public abstract void Configure(DigitalBrainBuilder brain);
}
```

and the scanner (in `DigitalBrain.Aspire.Hosting`, used by Testing):

```csharp
public static class ModuleHostingScan
{
    // Adapters referenced by the given root assemblies, indexed by the module they claim.
    // An unclaimed module simply has no adapter — absence of the package is not an error.
    public static IReadOnlyDictionary<ModuleId, IDigitalBrainModuleHosting> Resolve(params Assembly[] roots)
    {
        var adapters = new Dictionary<ModuleId, IDigitalBrainModuleHosting>();
        var seen = new HashSet<string>();
        var queue = new Queue<Assembly>(roots);
        while (queue.TryDequeue(out var assembly))
        {
            if (!seen.Add(assembly.FullName!)) { continue; }
            foreach (var reference in assembly.GetReferencedAssemblies())
            {
                try { queue.Enqueue(Assembly.Load(reference)); }
                catch (FileNotFoundException) { } catch (FileLoadException) { }
            }
            foreach (var type in assembly.GetExportedTypes())
            {
                if (type.IsAbstract || !typeof(IDigitalBrainModuleHosting).IsAssignableFrom(type)) { continue; }
                var adapter = (IDigitalBrainModuleHosting)Activator.CreateInstance(type)!;
                adapters[adapter.Module] = adapter;
            }
        }
        return adapters;
    }
}
```

(`Assembly.Load` of an *already-referenced* assembly name here is dependency walking from a known root, not soft-reference magic — the catches only skip trimmed facades.)

- [x] **Step 1: Write the failing scan facts**

```csharp
public sealed class ModuleHostingScanFacts
{
    [Fact]
    public void An_adapter_referenced_by_the_root_is_found_under_its_module()
    {
        var adapters = ModuleHostingScan.Resolve(typeof(DigitalBrain.Postgres.Aspire.Hosting.PostgresModuleHosting).Assembly);
        Assert.IsType<DigitalBrain.Postgres.Aspire.Hosting.PostgresModuleHosting>(
            adapters[new DigitalBrain.Contracts.ModuleId("postgres")]);
    }

    [Fact]
    public void A_module_with_no_referenced_adapter_is_simply_unclaimed()
    {
        var adapters = ModuleHostingScan.Resolve(typeof(ModuleHostingScanFacts).Assembly);
        Assert.False(adapters.ContainsKey(new DigitalBrain.Contracts.ModuleId("no-such-module")));
    }
}
```

(Adjust the adapter namespace to the file's actual one.)

> **Deviations (recorded 2026-10-05, executor):**
> - Every `*.Aspire.Hosting` csproj gained its module's runtime `ProjectReference` (11 projects) so
>   `typeof(XModule)` is in scope; none had it transitively via Contracts.
> - `DigitalBrainBuilder` gained the plan-suggested public
>   `WithModule(Module module, IDigitalBrainModuleHosting? hosting = null, IReadOnlyDictionary<string,string?>? settings = null)`.
> - `ModuleHostingResolutionFacts.cs` was deleted with its subject; `ModuleHostingScanFacts.cs` (created)
>   replaces it. The Aspire.Hosting test project gained a Postgres hosting `ProjectReference` for the
>   scanner fact.
> - `ProductCompositionFacts`'s attribute-coverage fact became
>   `EveryReferencedHostingAdapterBelongsToACatalogModule` (scanner over the test assembly's
>   references); the Postgres hosting fact that asserted attribute resolution became
>   `A_hosting_adapter_claims_its_module_through_the_generic_parameter`.
> - `DigitalBrainModuleBuilder<TModule>` reads `new TModule().Module.ToString()` (was `.Id`).
> - `CompositionBoundaryFacts`'s `[ModuleId]` attributes were removed and its calls moved to
>   `WithModule(new X())`, per Task 5.
- [x] **Step 2: Run to verify failure**, then implement the interface change, `ModuleHosting<TModule>`, the scanner, and migrate all 12 adapters. Delete `ModuleHostingResolution.cs`, `WithModule(Type)`, the `Register` id-grammar check (now `ModuleId`'s job — `Register` takes `ModuleId id`), and the `hosting.Id != id` guard.
- [x] **Step 3: Rewrite the Testing bridge** — `ModuleHostingAdapters.AddModules` resolves adapters once via `ModuleHostingScan.Resolve(Assembly.GetEntryAssembly()!, typeof(ModuleHostingAdapters).Assembly)` and for each `ModuleDefinition` calls the (now adapter-explicit) registration: `brain.Register(definition.Module.Id, adapters.GetValueOrDefault(definition.Module.Id), definition.Settings)` — expose the needed overload as `public DigitalBrainBuilder WithModule(Module module, IDigitalBrainModuleHosting? hosting, IReadOnlyDictionary<string,string?>? settings)` if `Register` stays private.
- [x] **Step 4: Rewire `ProductCompositionFacts`** — "every catalog module that has infrastructure has an adapter" now asserts via `ModuleHostingScan.Resolve` over the test assembly's references instead of `IsDefined(typeof(ModuleHostingAttribute))`.
- [x] **Step 5: Run** `dotnet test src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.Unit`, `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`, and one module hosting suite (`dotnet test src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests.Hosting`) → PASS.
- [x] **Step 6: Commit** — `refactor: hosting claims its module through the generic parameter`

---

### Task 6: Deployment claims its module the same way

**Files:**
- Modify: `src/DigitalBrain/Deployment/DigitalBrain.Deployment/IDigitalBrainModuleDeployment.cs` — add `ModuleId Module { get; }`; create `ModuleDeployment<TModule>` base beside it (same shape as `ModuleHosting<TModule>`: `public ModuleId Module { get; } = new TModule().Id;`)
- Modify: `src/DigitalBrain/Deployment/DigitalBrain.Deployment/DigitalBrainDeployment.cs:186-198` — `Discover` scans instead of `Type.GetType`
- Modify (4 contributors → `: ModuleDeployment<XModule>`): `src/Modules/AI/DigitalBrain.Modules.AI.Deployment/AIDeployment.cs`, `src/Modules/ClickHouse/DigitalBrain.Modules.ClickHouse.Deployment/ClickHouseDeployment.cs`, `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/CSharpDeployment.cs`, `src/Modules/Qdrant/DigitalBrain.Modules.Qdrant.Deployment/QdrantDeployment.cs`
- Test: the Deployment ring's existing test project (locate via `src/DigitalBrain/Deployment/tests/`; add `ModuleDeploymentDiscoveryFacts.cs`)

**Interfaces:**
- Consumes: `ModuleId`, `Module`.
- Produces: `Discover(IReadOnlyList<ModuleId> composedModules, params Assembly[] roots)` → `List<IDigitalBrainModuleDeployment>`; same assembly-walk as `ModuleHostingScan` (extract the walk into a shared private helper only if both live in one assembly — they don't; duplicate the 15 lines, each ring owns its scan). A composed module id with no discovered contributor **and** whose module type is known to require one: today's rule is "attribute present → contributor must resolve"; the new rule is "contributor present → it deploys; composed module with no contributor → skipped", EXCEPT the deployment program asserts coverage explicitly: after the scan, `Discover` throws naming any id in `composedModules` that previously had a `[ModuleDeployment]`-style contributor — concretely, keep a loud error when a contributor type exists in the scan for no composed module (dead reference) and rely on the deployment E2E/manifest test for coverage.

- [x] **Step 1: Write the failing discovery facts** (mirror the two scan facts of Task 5 against `QdrantDeployment` + Review Focus 3: composing id `"qdrant"` with roots that do NOT reference the Qdrant Deployment project yields a result not containing it, and the deployment program's coverage check — `AspireManifest`/composition test — fails loudly; place the loud check where today's `?? throw new InvalidOperationException(… "Reference the module's Deployment project")` lives, keyed by the composed module list the manifest already carries).
- [x] **Step 2: Implement** the interface member, the base class, the scan, migrate the 4 contributors, delete the `GetCustomAttribute<ModuleDeploymentAttribute>` path.
- [x] **Step 3: Run** the Deployment test project → PASS.
- [x] **Step 4: Commit** — `refactor: deployment claims its module through the generic parameter`

> **Deviations (recorded 2026-10-05, executor):**
> - The plan assumed the manifest already carries composed module **ids**. In reality the manifest
>   carried a legacy numeric type-name array (`DigitalBrain__Modules__N`, produced by nothing in the
>   current AppHost and read only by the deployment). To keep the one-grammar id list, `AspireManifest`
>   gained `ComposedModuleIds(runtime)`, reading ids from the id-keyed `DigitalBrain__Modules__{id}__…`
>   entries the AppHost does emit; `Runtime` detection accepts those keys (and still the fixture's
>   numeric `__0`). `AspireManifest.Modules(runtime)` (type names) is left for compatibility but is no
>   longer used by `RunAsync`.
> - `Discover` was made `internal` with `InternalsVisibleTo("DigitalBrain.Deployment.Tests")` so the
>   discovery facts can exercise it; the Deployment test project references the Qdrant Deployment
>   project.
> - `ModuleDeployment<TModule>` declares `public abstract void Deploy(ModuleDeploymentContext)`
>   (required for an abstract class implementing the interface), so the 4 contributors' `Deploy`
>   gains `override`.
> - The loud check is the dead-reference throw (a scanned contributor whose module is not composed);
>   a composed module with no contributor is skipped and coverage fails at the existing
>   `manifestValues.Missing` deploy-time check, as the Produces text allows.

---

### Task 7: Delete the attribute machinery

**Files:**
- Modify: `src/DigitalBrain/DigitalBrain.Contracts/ModuleIdentity.cs` — delete the file (`ModuleIdAttribute`, `ModuleHostingAttribute`, `ModuleDeploymentAttribute`, `ModuleIdentity`)
- Modify: every module class still carrying `[ModuleHosting(…)]` / `[ModuleDeployment(…)]` (the Task 3 list) — delete the attributes and their now-unused `using DigitalBrain.Contracts;` if dangling
- Modify: any残 remaining reference (grep `ModuleIdentity\.|ModuleIdAttribute|ModuleHostingAttribute|ModuleDeploymentAttribute` across `src/` — Task 3's sweep left only attribute writers and the two rings now migrated)

- [x] **Step 1: Delete and sweep.** `grep -rn "ModuleIdentity\.\|ModuleIdAttribute\|ModuleHostingAttribute\|ModuleDeploymentAttribute" src --include=*.cs | grep -v obj` must return nothing.
- [x] **Step 2: Build the full dependency chain** (Contracts → Kernel → Aspire.Server → Aspire.Hosting → OS → Deployment → Testing.E2E) and run: Kernel unit, OS unit, Aspire.Hosting unit, Deployment tests → PASS.
- [x] **Step 3: Commit** — `refactor: the module attributes are gone`

---

### Task 8: AI hosting goes typed — the declaration leaves the options

Today the AppHost's typed picks (`ai.WithLlm<IGpt56Luna>()` in `AppHost.cs:36-41`) are flattened to marker-name strings inside `AIOptions.Hosting`, shipped through configuration, and re-resolved to models in `AIModuleHosting` — typed → string → typed. The declaration moves onto the adapter.

**Files:**
- Modify: `src/Aspire/DigitalBrain.Aspire.Hosting/Composition/DigitalBrainBuilder.cs` — add `WithHosting<THosting>(Action<THosting> configure)` (instantiate, configure, then register)
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/AIModuleHosting.cs` — the adapter carries the typed declaration:

```csharp
public sealed class AIModuleHosting : ModuleHosting<AIModule>
{
    private readonly List<LLMModel> _llms = [];
    private readonly List<EmbeddingModel> _embeddings = [];
    private LLMModel? _defaultLlm;
    private EmbeddingModel? _defaultEmbedding;

    public AIModuleHosting WithLlm<TMarker>() where TMarker : ILLM
    { Add(_llms, Model<TMarker>()); return this; }
    public AIModuleHosting WithDefaultLlm<TMarker>() where TMarker : ILLM
    { _defaultLlm = Model<TMarker>(); Add(_llms, _defaultLlm); return this; }
    public AIModuleHosting WithDefaultEmbedding<TMarker>() where TMarker : IEmbedding
    { /* same shape via EmbeddingModel.FindByMarker(typeof(TMarker)) */ return this; }

    private static LLMModel Model<TMarker>() where TMarker : ILLM
        => LLMModel.FindByMarker(typeof(TMarker))
           ?? throw new InvalidOperationException($"{typeof(TMarker).Name} is not in the LLM catalog.");
    // Configure(DigitalBrainBuilder) drives AIHostingState from _llms/_embeddings/_default* directly —
    // no FindByMarkerName, no options.Hosting. Defaults project to configuration as today
    // (AIHostingState writes DefaultModelKey env), now sourced from the typed picks.
}
```

(Keep reading genuine options — `Telemetry.EnableSensitiveData`, `Default.Transcription`, `Tavily.Enabled` — from module options as today.)
- Modify: `src/DigitalBrain/AppHost/DigitalBrain.AppHost/AppHost.cs:36-41` — `.WithHosting<AIModuleHosting, AIOptions>(ai => { ai.WithLlm<…>(); … })` becomes `.WithHosting<AIModuleHosting>(ai => ai.WithLlm<IGpt56Luna>().WithDefaultLlm<IDeepSeekV41Flash>().WithDefaultEmbedding<ITextEmbedding3Small>())` — move any remaining `AIOptions` lambda values into the standard options channel (appsettings) per the ratified design.
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Configuration/AIOptions.cs` — delete `Hosting` property and both `Validate()` catalog checks (`Validate()` becomes empty or checks only its own values); `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Configuration/AIHostingOptions.cs` — delete file; `AIOptionsExtensions.cs` — the `WithLlm`-on-options family moves to the adapter (delete here; they wrote marker strings into `Hosting`).
- Modify: `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.E2E/E2EBoundaryFacts.cs:21` — `Assert.Empty(options.Hosting.Llms)` asserted the boundary keeps hosting out of the silo; replace with a compile-level fact: the property no longer exists, so assert instead that `AIOptions` exposes no member named `Hosting` is unnecessary — delete the line and keep the fact's remaining assertions.
- Test: AI hosting test project (locate under `src/Modules/AI/tests/`): add facts.

**Interfaces:**
- Produces: `DigitalBrainBuilder.WithHosting<THosting>(Action<THosting> configure) where THosting : IDigitalBrainModuleHosting, new()`.

- [x] **Step 1: Write the failing facts** — (a) `AIModuleHosting` configured with `WithLlm<IGpt56Luna>()` provisions that model (assert via the hosting state the existing AI hosting tests already inspect); (b) Review Focus 5: `new AIOptions().Validate()` does not throw.
- [x] **Step 2: Implement** per the file list; run the AI module test suites and `dotnet build src/DigitalBrain/AppHost/DigitalBrain.AppHost`.
- [x] **Step 3: Run** `dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.E2E --filter E2EBoundaryFacts` and the AI suites → PASS.
- [x] **Step 4: Commit** — `refactor: AI model provisioning is a typed hosting declaration`

---

### Task 9: AI joins the one grammar — `DigitalBrain:AI` dies

**Files:**
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Configuration/AIOptions.cs` — delete `SectionName` and all 8 derived key constants and `CopyFrom`; keys that other code genuinely needs become:

```csharp
// in AIKeys.cs (new, DigitalBrain.Modules.AI.Contracts/Configuration/), through the grammar:
public static class AIKeys
{
    public static readonly string Options = DigitalBrainConfiguration.ModuleOptionsSection(new ModuleId("ai"));
    public static readonly string DefaultModel = Options + ":Default:Model";
    public static readonly string DefaultEmbedding = Options + ":Default:Embedding";
    public static readonly string DefaultTranscription = Options + ":Default:Transcription";
    public static readonly string DefaultImage = Options + ":Default:Image";
    public static readonly string OllamaEndpoint = Options + ":Ollama:Endpoint";
    public static readonly string TavilyEnabled = Options + ":Tavily:Enabled";
    public static readonly string TelemetryEnableSensitiveData = Options + ":Telemetry:EnableSensitiveData";
}
```

- Modify consumers (replace `AIOptions.<Key>` with `AIKeys.<Key>`): `src/Modules/AI/DigitalBrain.Modules.AI/AIModule.cs:21` (`McpServersKey`), `Clients/AIClients.cs:19-23`, `ModelProfiles.cs:36,89`, `Voice/VoiceToTextHosting.cs`, `Voice/FoundryLocalTranscriptionService.cs`, `WebSearch/TavilyWebSearch.cs:10`, `…AI.Aspire.Hosting/AIHostingExtensions.cs:16,19`, `…AI.Aspire.Hosting/Configuration/AIHostingState.cs:81,92`
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/AIOptionsRuntime.cs` — single bind plus the legacy guard (Review Focus 4):

```csharp
internal static AIOptions Read(IConfiguration configuration)
{
    if (configuration.GetSection("DigitalBrain:AI").Exists())
    { throw new InvalidOperationException("DigitalBrain:AI moved to DigitalBrain:Modules:ai:Options — migrate the keys."); }
    var options = configuration.GetModuleOptions<AIOptions>("ai");
    ProjectOllamaModelMarkers(options, configuration);   // reads under AIKeys.Options + ":Ollama"
    return options;
}
internal static void Register(IServiceCollection services)
{
    services.AddOptions<AIOptions>().Configure<IConfiguration>((options, configuration)
        => configuration.PopulateModuleOptions("ai", ReadInto(options, configuration)));
    // simplest shape that keeps Populate semantics without CopyFrom — bind directly:
    // services.AddOptions<AIOptions>().Configure<IConfiguration>((o, c) => c.GetSection(AIKeys.Options).Bind(o)); then Validate + ProjectOllamaModelMarkers(o, c);
    services.AddOptions<AIWorkspaceOptions>().BindConfiguration(AIWorkspaceOptions.SectionName);
}
```

(Pick the direct-`Bind` shape; `CopyFrom` is deleted.)
- Modify: `src/Aspire/DigitalBrain.ServiceDefaults/Configuration/ServiceTelemetryOptions.cs` — the reference-free mirror string updates to `DigitalBrain:Modules:ai:Options:Telemetry:EnableSensitiveData` (comment stays: it mirrors `AIKeys.TelemetryEnableSensitiveData`).
- Modify: `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.E2E/ContentCaptureFacts.cs:17` — env name derives from `AIKeys.TelemetryEnableSensitiveData`.
- Modify: every `appsettings*.json` / launch profile carrying `DigitalBrain:AI` or `DigitalBrain__AI` keys (grep `"DigitalBrain:AI\|DigitalBrain__AI"` across `src/` including `*.json`, `*.pubxml`, Dockerfiles) — rewrite under `DigitalBrain:Modules:ai:Options:`.
- Modify: `src/Testing/tests/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json` — remove `AIOptions.cs` from the baseline (the ratchet enforces the win; `AIKeys.cs` must qualify as grammar-derived — if the ratchet flags it, the ratchet's rule is "keys built from DigitalBrainConfiguration calls are owned", so verify the fact's detection and add `AIKeys.cs` to the baseline only if strictly necessary, with a comment).

- [x] **Step 1: Write the failing fact** — in the AI module's unit suite: configuration carrying `DigitalBrain:AI:Default:Model` makes `AIOptionsRuntime.Read` throw with the migration message; configuration carrying `DigitalBrain:Modules:ai:Options:Default:Model=Fable5` binds into `options.Default.Model`.
- [x] **Step 2: Implement** per the file list; sweep with `grep -rn "DigitalBrain:AI\|DigitalBrain__AI" src --include=*.cs --include=*.json --include=*.pubxml | grep -v obj` — only the legacy guard string and the `AIKeys` mirror comment may remain.
- [x] **Step 3: Run** the AI suites, `dotnet test src/Testing/tests/DigitalBrain.Architecture.Tests`, `dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.E2E --filter ContentCaptureFacts` → PASS.
- [x] **Step 4: Commit** — `refactor: AI speaks the one configuration grammar`

---

### Task 10: Hosting declarations leave the options — every module

The AI pattern (Task 8) generalizes: three more modules carry hosting declarations inside their
`IModuleOptions`, flattened through configuration and re-read by their adapter. Each moves onto
the adapter via the `WithHosting<THosting>(Action<THosting> configure)` overload Task 8 added,
one module per commit, same shape as `AIModuleHosting`.

**Inventory (verify each with `grep -n "Hosting" <module>.Contracts/Configuration/*.cs` before
editing — if a `Hosting` member turns out to be consumed silo-side, it is not a hosting
declaration; leave it and note the deviation):**

- **ClickHouse**: `ClickHouseModuleOptions.Hosting.Seeds` (and the `Validate()` seed check —
  moves with it); AppHost's `database.WithClickHouse()` configures the adapter instead.
  Files: `src/Modules/ClickHouse/DigitalBrain.Modules.ClickHouse.Contracts/Configuration/ClickHouseModuleOptions.cs`,
  `…ClickHouse.Aspire.Hosting/ClickHouseModuleHosting.cs`, AppHost line 45, ClickHouse test suites.
  Also re-assess `ClickHouseModuleOptions.ResolveConnection(IConfiguration)` against the
  Validate law: an options method taking `IConfiguration` is the same impurity — move the
  resolution to the consumer that owns the configuration.
- **Flutter**: `FlutterModuleOptions.Hosting` (`Kind`, `ResourceName`, `ShellName`, `ChatName`)
  and the whole `Validate()` body (it validates only hosting values). `flutter.RunDesktopApp()`
  becomes an adapter method. Files:
  `src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Configuration/FlutterModuleOptions.cs`,
  `…Flutter.Aspire.Hosting/FlutterModuleHosting.cs` + `ShellHostingExtensions.cs`, AppHost line 51.
- **Postgres**: the `Options:Hosting:DatabaseName` key shape
  (`PostgresAspireHostingFacts` pins it; `database.WithPostgres(options => options.DatabaseName = …)`)
  — the database name is a provisioning decision; it moves to `PostgresModuleHosting` as a typed
  property. Files: `src/Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/Configuration/PostgresModuleOptions.cs`,
  `…Postgres.Aspire.Hosting/PostgresModuleHosting.cs`, AppHost line 47,
  `src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests.Hosting/PostgresAspireHostingFacts.cs`.

Per module: (1) failing fact — adapter configured typed provisions the same resources the
options-driven path did (assert via the module's existing hosting facts); (2) move the
declaration, delete the options member and its `Validate()` lines; (3) run that module's unit +
hosting suites and `dotnet build src/DigitalBrain/AppHost/DigitalBrain.AppHost`; (4) commit
`refactor: <module> hosting declaration is typed on the adapter`.

---

### Task 11: Every module joins the one grammar — private roots die

Module-owned configuration outside `DigitalBrain:Modules:{id}:Options` migrates in. Audit
inventory (re-grep before editing: `grep -rn '"DigitalBrain:' src/Modules --include=*.cs | grep -v obj | grep -v Tests`):

| Module | Legacy root/keys | Target |
|---|---|---|
| AI | `DigitalBrain:Workspace` (`AIWorkspaceOptions.SectionName`) | `…Modules:ai:Options:Workspace:*` (fold into Task 9's key move if executed together) |
| CSharp | `DigitalBrain:CSharp` (`CSharpOptions.SectionName`, `CSharpDeploymentSettings` reads it) | `…Modules:csharp:Options:*`; deployment-owned values read the same section via `AIKeys`-style grammar-derived class `CSharpKeys` |
| GitHub | `DigitalBrain:Microsoft:GitHub` (`GitHubModuleOptions.SectionName`) | `…Modules:github:Options:*` |
| Salesforce | `DigitalBrain:Salesforce:OAuth` (`SalesforceOAuthOptions.SectionName`) | `…Modules:salesforce:Options:OAuth:*` |
| Aspire | `DigitalBrain:Microsoft:Aspire` (`AspireOptions.ConfigurationRoot`) | `…Modules:aspire:Options:*` (use the module's actual id from its constructor) |
| Apps | `DigitalBrain:Apps:AuthorModel`, `:BuilderModel`, `:ShipOnStartup`, `DigitalBrain:ShippedApps` (+ AppHost `IntoChatShippedAppsPathKey`) | `…Modules:apps:Options:*` (ShippedApps keys included; update AppHost literal) |
| Time | `DigitalBrain:Time:MinimumReminderPeriod` | `…Modules:time:Options:MinimumReminderPeriod` |
| Flutter (hosting ring) | `DigitalBrain:Flutter:Hosting` (`FlutterHostOptions`) | dissolves into Task 10's typed adapter declaration; any residue → `…Modules:flutter:Options:*` |

**Decision rows — confirm owner with the user if unclear, do not guess silently:**
- Postgres `DigitalBrain:Capacity:Postgres:AdminConnection`: module-owned (→ postgres options) or a platform capacity contract (stays, documented as platform-owned). Recommend platform-owned: it is seeded by deployment for the capacity ring, not read as a module option.
- Flutter `ShellNames.OwnerKey = "DigitalBrain:Owner"`: brain/platform-scoped identity, likely not a module option — document, don't move, unless investigation shows only Flutter reads it.

**Out of scope (ring-owned, not module options — do not touch):** Platform identity/auth/cors
(`DigitalBrain:Auth`, `:Identity*`, `:Cors`), host keys (`:Standalone`,
`:Hosting:PersistentStorage`, `:Http:*`, `:KeyVault:Uri`, `:MasterKey`, `:ConfigurationFile`,
`:Edge`/`:Token`, `:Testing:*`), and the sandbox process's own `Sandbox` root
(`SandboxOptions` — a separate executable with its own configuration domain).

**Mechanics per module (one commit each, smallest first — Time, then Aspire, GitHub,
Salesforce, Apps, CSharp):**
1. Failing fact: value under the new section binds; value under the legacy root is refused.
2. Replace the `SectionName`/key constants with a grammar-derived `<Module>Keys` class (the
   `AIKeys` shape from Task 9: `DigitalBrainConfiguration.ModuleOptionsSection(new ModuleId("<id>")) + ":…"`).
3. Migrate every consumer, `appsettings*.json`, pubxml/Dockerfile env forms (`DigitalBrain__…`).
4. Legacy guard: extend one shared check — add the legacy root to a static list in a new
   `src/DigitalBrain/OS/DigitalBrain.OS/LegacyConfigurationGuard.cs` run at server startup
   (beside `AddOperatingSystem`), throwing the migration message naming old → new section; the
   AI guard from Task 9 moves into this list too, so there is exactly one guard mechanism.
5. Shrink `src/Testing/tests/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json` as
   each file stops carrying raw literals — the ratchet is the enforcement that this never
   regresses.
6. Add one new architecture fact: within `src/Modules/**`, every `"DigitalBrain:`-prefixed
   literal outside the baseline starts with `DigitalBrain:Modules:` — pinning "no module is
   exempt from the grammar" permanently.

---

### Task 12: Full verification and ratification

- [x] **Step 1: Build every ring**: Contracts, Kernel, Aspire.Server, Aspire.Hosting, OS, Deployment, Testing, Testing.E2E, AppHost.
- [x] **Step 2: Run the suites**: Kernel unit, Kernel E2E, OS unit, Architecture, Aspire.Hosting unit, Deployment, AI module suites, every module suite touched by Tasks 10–11 (ClickHouse, Flutter, Postgres, CSharp, GitHub, Salesforce, Apps, Time, Aspire), IntoChat E2E composition/routes.
- [x] **Step 3: Smoke**: `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` — all resources Healthy; exercise one AI call if credentials are available, else confirm the AI module composes.
- [x] **Step 4: Ratify** — mark `docs/superpowers/specs/2026-10-05-module-identity-amendment.md` header "Ratified <date>"; update `CLAUDE.md`'s module-contract paragraph (module options under the one grammar, `Module` abstract class, no attributes) in the same commit.
- [x] **Step 5: Commit** — `docs: ratify module identity unification`

---

## Self-Review (performed)

- **Spec coverage**: §1 ModuleId → Task 1; §2 Module in Contracts → Tasks 2–3; §3 catalog instances → Task 4; §4 generic claims → Tasks 5–6; §5 scans → Tasks 5–6; §6 Validate law → Task 8; §7 one grammar → Task 9; Deleted list → Tasks 3, 5, 6, 7, 8, 9.
- **Known open point for the executor**: Task 6's coverage rule (what exactly fails loudly when a composed module lacks a deployment contributor) preserves today's semantics — attribute-present-implies-resolvable becomes contributor-referenced-implies-used plus the manifest-level coverage check; if the Deployment test project reveals a different existing guarantee, match it, don't invent one.
- **Type consistency**: `ModuleDefinition(Module, Settings)` (Task 3) is what Task 5's Testing bridge consumes; `ModuleHostingScan.Resolve(params Assembly[])` (Task 5) mirrors Task 6's `Discover`; `AIKeys` (Task 9) replaces constants Task 8 still references at its end — executor order is 8 then 9 as written.
- **2026-10-05 scope extension**: Tasks 10–11 added after the repo-wide audit; execution order is 8 → 9 → 10 → 11 → 12. Task 10 depends on Task 8's `WithHosting<THosting>(Action<THosting>)` overload; Task 11's shared `LegacyConfigurationGuard` absorbs Task 9's AI-only guard (if Task 9 ran first, refactor its guard into the list when Task 11 lands).
