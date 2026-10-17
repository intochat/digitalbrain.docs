# Postgres Module Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the Postgres module into the Time module's shape: a server neuron at the root, a `Tables` vocabulary with its own signals, and nothing in the module that answers Assistant or Supabase questions.

**Architecture:** The Postgres runtime keeps two neuron kinds, the server (`IPostgresServer`) and app-owned tables (`ITable`), plus the per-app table index that scopes them. Everything that bridges Postgres tables to the Assistant's tools and to Supabase's live table windows moves to a sibling module, `DigitalBrain.Modules.Postgres.Windows`, which is the only project referencing both Postgres and Supabase runtimes. Hand-built owner keys (`JsonSerializer.Serialize(new[] { brain, app })`) collapse into one `TableOwner` type.

**Tech Stack:** .NET 11, Orleans grains, xUnit v3 (`TestContext.Current.CancellationToken`), `ModuleTest.Create().WithModule<...>()` from `DigitalBrain.Testing.Module`.

**Spec:** The design discussion in this session; the module contract in `CLAUDE.md` ("Module contract" bullet) and the Time module at `src/DigitalBrain.Modules/Time` as the reference shape.

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet test src/<path>`.
- Persisted grain state has no compatibility obligations: rename state records and grain types freely, never add migration code.
- No `/// <summary>` boilerplate; small inline comments only for what code cannot say.
- Tests are facts with sentence-shaped names and use real grains through `ModuleTest`.
- Public neuron contracts must carry an Orleans `[Alias]`; keep every existing alias string unchanged (`postgres`, `postgres.table`, `postgres.table.*`) so the contract catalog ids do not move.
- `[PlatformOnly]` interfaces never live in a `*.Contracts` project after this plan.
- The Postgres runtime project may reference only `DigitalBrain.Modules.Postgres.Contracts`, `DigitalBrain.Modules.Apps.Contracts` (for `IAppStorageHook`) and `DigitalBrain.Framework`.
- Pre-existing failures to ignore (identical on the untouched tree): `ConfigurationKeyFacts`, `ModuleKeyGrammarFacts`, `RepositoryLayoutFacts.EveryProjectHasOneSolutionEntryInItsPhysicalGroup`, `TestTierFacts` in Architecture tests; `BrandingFacts` and `IdentityHostOptionsFacts` in OS unit tests. Re-check `RepositoryLayoutFacts` after Task 4 adds solution entries: it must not gain new failures.

## Review Focus

1. An owner key with a third element or a non-JSON string reaches `TableOwner.Parse` through a grain key: it must throw `UnauthorizedAccessException`, never `IndexOutOfRangeException` (Task 1 test).
2. A script calling `ITable.Define` with an app caller whose `AppId` is empty must be refused before any index registration (Task 3 keeps the `Scope()` guard; `PostgresWriteTableFacts` covers it).
3. The Assistant's `postgres_schema(appTables: true)` after the move must still refuse app-kind callers (Task 4 keeps `PostgresAppSourceFacts.HostDiscoveryRetainsPinnedOriginAndRejectsAppAndOtherBrainCallers`).
4. The OS boots with the new module in the catalog and no Aspire hosting adapter for it: `ProductCompositionFacts.EveryReferencedHostingAdapterBelongsToACatalogModule` only checks adapters map to catalog ids, so a module without an adapter is fine (Task 5 verifies).
5. A `TableOwner` built for brain A used against the index grain of brain B must be refused by the lifecycle guard (Task 3 guard test).

---

### Task 1: TableOwner replaces hand-built owner keys

**Files:**
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Tables/TableOwner.cs`
- Create: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/Tables/TableOwnerFacts.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Apps/PostgresAppStorageHook.cs:17,20`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresAppResources.cs:61,85`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresTableNeuron.cs:34-43`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresTableResources.cs:24-35`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresTablesNeuron.cs:74-104` (the guard)
- Modify: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresWriteTableFacts.cs:40,104,121,452`
- Modify: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresAppSourceFacts.cs:64,108,117`

**Interfaces:**
- Produces: `public readonly record struct TableOwner(string BrainId, string AppId)` with `string Key`, `static TableOwner Parse(string key)`, `static TableOwner Current(CallerContext caller)`.

- [ ] **Step 1: Write the failing test**

```csharp
using DigitalBrain.Enforcement;
using DigitalBrain.Postgres.Tables;

namespace DigitalBrain.Modules.Postgres.Tests.Tables;

public sealed class TableOwnerFacts
{
    [Fact]
    public void AnOwnerRoundTripsThroughItsGrainKey()
    {
        var owner = new TableOwner("brain-1", "brain-1/apps/notes");
        Assert.Equal(owner, TableOwner.Parse(owner.Key));
        Assert.Equal("[\"brain-1\",\"brain-1/apps/notes\"]", owner.Key);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[\"one\"]")]
    [InlineData("[\"one\",\"two\",\"three\"]")]
    [InlineData("[\"\",\"app\"]")]
    [InlineData("[\"brain\",null]")]
    public void AMalformedKeyIsRefusedAsUnauthorized(string key)
        => Assert.Throws<UnauthorizedAccessException>(() => TableOwner.Parse(key));

    [Fact]
    public void TheCurrentOwnerComesFromTheStampedCallerAndRequiresAnApp()
    {
        var caller = new CallerContext
        {
            PrincipalId = "alice", AccountId = "alice", BrainId = "brain-1",
            Kind = CallerKind.App, AppId = "brain-1/apps/notes", StampedBy = TrustedEdge.AppProxy,
        };
        Assert.Equal(new TableOwner("brain-1", "brain-1/apps/notes"), TableOwner.Current(caller));
        Assert.Throws<UnauthorizedAccessException>(() => TableOwner.Current(caller with { AppId = "" }));
        Assert.Throws<UnauthorizedAccessException>(() => TableOwner.Current(caller with { StampedBy = TrustedEdge.AuthenticatedHttp, Kind = CallerKind.User }));
    }
}
```

Note: `TableOwner.Current` reads the brain from `BrainScope.CurrentId()` in production. For the unit test pass the caller explicitly; see the implementation signature below.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests --filter "FullyQualifiedName~TableOwnerFacts"`
Expected: build error, `TableOwner` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
using System.Text.Json;
using DigitalBrain.Enforcement;
using DigitalBrain.Framework.Enforcement;

namespace DigitalBrain.Postgres.Tables;

// The identity every app table and table index is keyed by: one brain, one installed app.
// The key is the grain key; it is parsed back wherever a guard needs to know whose grain it is.
public readonly record struct TableOwner(string BrainId, string AppId)
{
    public string Key => JsonSerializer.Serialize(new[] { BrainId, AppId });

    public static TableOwner Parse(string key)
    {
        string?[]? parts;
        try { parts = JsonSerializer.Deserialize<string?[]>(key); }
        catch (JsonException) { parts = null; }
        if (parts is not [{ } brain, { } app] || string.IsNullOrWhiteSpace(brain) || string.IsNullOrWhiteSpace(app))
        { throw new UnauthorizedAccessException("This storage key does not name a brain and an app."); }
        return new(brain, app);
    }

    // The owner a stamped caller may act as. Only trusted callers reach table neurons, and an app
    // caller is an owner only when the kernel stamped its app id.
    public static TableOwner Current(CallerContext caller)
    {
        ArgumentNullException.ThrowIfNull(caller);
        if (!CallerContextStamper.IsTrusted(caller) || string.IsNullOrWhiteSpace(caller.AppId))
        { throw new UnauthorizedAccessException("A trusted brain and app caller is required."); }
        return new(caller.BrainId, caller.AppId);
    }

    public static TableOwner Current() => Current(CallerContextStamper.Require()) with { BrainId = BrainScope.CurrentId() };
}
```

Check `CallerContextStamper.IsTrusted` in `src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/CallerContextStamper.cs` before relying on it for the third assertion: if a `User` caller stamped by `AuthenticatedHttp` counts as trusted there, keep the assertion on the empty `AppId` only and drop the third `Assert.Throws`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests --filter "FullyQualifiedName~TableOwnerFacts"`
Expected: PASS.

- [ ] **Step 5: Replace every hand-built key in the runtime**

In `PostgresTableNeuron.Scope()` replace the body with:

```csharp
    private string Scope()
    {
        var scope = TableOwner.Current().Key;
        if (state.State.Owner is { } owner && owner != scope)
        { throw new UnauthorizedAccessException("This table belongs to another brain or app."); }
        return scope;
    }
```

In `PostgresAppStorageHook.OnRetired` replace both `JsonSerializer.Serialize(new[] { brainId, ... })` with `new TableOwner(brainId, appKey).Key` and `new TableOwner(brainId, key).Key`.

In `PostgresAppResources` lines 61 and 85 replace with `new TableOwner(scope, app).Key` and `new TableOwner(scope, identity[0]).Key`.

In `PostgresTableResources.DescribeResource` replace the `scope` deserialization and checks with:

```csharp
        var caller = CallerContextStamper.Require();
        if (!CallerContextStamper.IsTrusted(caller) || caller.Kind == CallerKind.App) { throw new UnauthorizedAccessException("This table belongs to another brain or app."); }
        var scope = TableOwner.Parse(owner);
        if (scope.BrainId != BrainScope.CurrentId() || state.State.Owner != owner)
        { throw new UnauthorizedAccessException("This table belongs to another brain or app."); }
        await Tables(owner).RequireOpen();
        var table = state.State.Accepted ?? throw new PostgresQueryException("This table has not finished being defined.");
        return new(scope.AppId, this.GetPrimaryKeyString(), PostgresCapacityKind.OriginOrPlatform(state.State.Origin), table);
```

In `PostgresLifecycleGuard.Invoke` replace every `JsonSerializer.Deserialize<string?[]>(...)` plus its `scope.Length != 2 || scope[0] != BrainScope.CurrentId()` check with `TableOwner.Parse(...)` followed by `if (scope.BrainId != BrainScope.CurrentId()) { throw ... }`. There are two sites (the `ReadTables` branch and the lifetime branch). Remove the `using System.Text.Json;` lines that become unused.

- [ ] **Step 6: Replace the keys in tests**

`PostgresWriteTableFacts` lines 40, 104, 121: `new TableOwner(BrainScope.CurrentId(), "app").Key`. Line 452: `new TableOwner(BrainScope.Create("alice", brain).Id, file).Key`.
`PostgresAppSourceFacts` lines 64, 108, 117: `new TableOwner(scope, "install").Key`, `new TableOwner(BrainScope.CurrentId(), "install").Key`, `new TableOwner(BrainScope.CurrentId(), "other-install").Key`. Add `using DigitalBrain.Postgres.Tables;` to both files.

- [ ] **Step 7: Run the Postgres suite**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: all pass (68 before this task, now 68 + 3 new facts; 3 live-gated skips).

- [ ] **Step 8: Commit**

```bash
git add src/DigitalBrain.Modules/Postgres
git commit -m "Postgres: one TableOwner type for app table keys"
```

---

### Task 2: Contracts become a server plus a Tables vocabulary

**Files:**
- Rename: `Contracts/IPostgres.cs` → `Contracts/IPostgresServer.cs`
- Create: `Contracts/Tables/ITable.cs`, `Contracts/Tables/TableDefinition.cs`, `Contracts/Tables/Signals/TableDefined.cs`, `Contracts/Tables/Signals/RowUpserted.cs`, `Contracts/Tables/Signals/RowDeleted.cs`
- Delete: `Contracts/IPostgresTable.cs`, `Contracts/IPostgresTables.cs`
- Move: `Contracts/Configuration/PostgresModuleOptions.cs` → `Contracts/PostgresModuleOptions.cs` (namespace unchanged, `DigitalBrain.Postgres`)
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Tables/TableIndex.cs` (the two platform-only interfaces)
- Create: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/ContractShapeFacts.cs`
- Modify: every runtime and test file that names the renamed types (list in Step 5)

(All `Contracts/` paths are under `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/`.)

**Interfaces:**
- Produces, namespace `DigitalBrain.Postgres`: `IPostgresServer` (alias `postgres`; members unchanged from `IPostgres`).
- Produces, namespace `DigitalBrain.Postgres.Tables`: `ITable` (alias `postgres.table`), `TableColumn`, `TableDefinition`, `TableValue`, `AcceptedTable` (alias `postgres.table.accepted`, was `PostgresTableDefinition`).
- Produces, namespace `DigitalBrain.Postgres.Tables.Signals`: `TableDefined`, `RowUpserted`, `RowDeleted`.
- Produces, runtime namespace `DigitalBrain.Postgres.Tables`: `[PlatformOnly] public interface ITableIndex : INeuron` (was `IPostgresTables`), `[PlatformOnly] public interface ITableLifetime : INeuron` (was `IPostgresTableLifetime`).

- [ ] **Step 1: Write the failing shape test**

```csharp
using DigitalBrain.Postgres;

namespace DigitalBrain.Modules.Postgres.Tests;

public sealed class ContractShapeFacts
{
    [Fact]
    public void TheContractsAssemblyExportsTheServerAndTheTablesVocabularyOnly()
    {
        var assembly = typeof(IPostgresServer).Assembly;
        var neurons = assembly.GetExportedTypes()
            .Where(type => type.IsInterface && typeof(INeuron).IsAssignableFrom(type))
            .Select(type => type.FullName).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(["DigitalBrain.Postgres.IPostgresRows", "DigitalBrain.Postgres.IPostgresServer", "DigitalBrain.Postgres.Tables.ITable"], neurons);
        Assert.DoesNotContain(assembly.GetExportedTypes(), type => PlatformOnlyAttribute.AppliesTo(type));
        var signals = assembly.GetExportedTypes().Where(type => typeof(Signal).IsAssignableFrom(type) && type != typeof(Signal))
            .Select(type => type.Namespace).Distinct().ToArray();
        Assert.Equal(["DigitalBrain.Postgres.Tables.Signals"], signals);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests --filter "FullyQualifiedName~ContractShapeFacts"`
Expected: build error, `IPostgresServer` does not exist.

- [ ] **Step 3: Write the contracts**

`Contracts/IPostgresServer.cs`:

```csharp
using Orleans.Concurrency;

namespace DigitalBrain.Postgres;

[Alias("postgres"), Orleans.Metadata.DefaultGrainType("postgres")]
public interface IPostgresServer : INeuron
{
    [ReadOnly, Alias("query")]
    Task<PostgresQueryResult> Query(PostgresQuery query);

    // Reads tables and columns of the configured database; omit Table for the index.
    [ReadOnly, Alias("schema")]
    Task<PostgresSchema> ReadSchema(ReadPostgresSchema query);

    [ReadOnly, Alias("connection")]
    Task<PostgresConnection> ReadConnection();
}
```

`Contracts/Tables/ITable.cs`:

```csharp
namespace DigitalBrain.Postgres.Tables;

// Use a unique grain key per installed table. First Define binds it permanently to the
// stamped brain and app; every subsequent operation requires that same caller scope.
[Alias("postgres.table"), Orleans.Metadata.DefaultGrainType("postgres.table")]
public interface ITable : INeuron
{
    Task<AcceptedTable> Define(TableDefinition definition);
    Task<bool> Upsert(TableValue[] key, TableValue[] values);
    Task<bool> Delete(TableValue[] key);
    Task<TableValue[]?> Read(TableValue[] key);
    Task<TableValue[][]> Page(int offset = 0, int limit = 200);
}
```

`Contracts/Tables/TableDefinition.cs`:

```csharp
namespace DigitalBrain.Postgres.Tables;

[GenerateSerializer, Alias("postgres.table.column")]
public sealed record TableColumn([property: Id(0)] string Name, [property: Id(1)] string Type);

[GenerateSerializer, Alias("postgres.table.definition")]
public sealed record TableDefinition([property: Id(0)] TableColumn[] Columns, [property: Id(1)] string[] PrimaryKey);

// Json is a single JSON value, including quotes for text. Null is allowed outside the key.
[GenerateSerializer, Alias("postgres.table.value")]
public sealed record TableValue([property: Id(0)] string Column, [property: Id(1)] string Json);

[GenerateSerializer, Alias("postgres.table.accepted")]
public sealed record AcceptedTable([property: Id(0)] string Table, [property: Id(1)] TableDefinition Definition, [property: Id(2)] long Revision);
```

`Contracts/Tables/Signals/TableDefined.cs`:

```csharp
namespace DigitalBrain.Postgres.Tables.Signals;

[GenerateSerializer, Alias("postgres.table.defined")]
public sealed record TableDefined([property: Id(0)] string Table, [property: Id(1)] long Revision) : Signal;
```

`Contracts/Tables/Signals/RowUpserted.cs`:

```csharp
namespace DigitalBrain.Postgres.Tables.Signals;

[GenerateSerializer, Alias("postgres.table.upserted")]
public sealed record RowUpserted([property: Id(0)] string Table, [property: Id(1)] TableValue[] Key) : Signal;
```

`Contracts/Tables/Signals/RowDeleted.cs`:

```csharp
namespace DigitalBrain.Postgres.Tables.Signals;

[GenerateSerializer, Alias("postgres.table.deleted")]
public sealed record RowDeleted([property: Id(0)] string Table, [property: Id(1)] TableValue[] Key) : Signal;
```

Runtime `Tables/TableIndex.cs` (the index contract moves out of Contracts; the neuron follows in Task 3):

```csharp
namespace DigitalBrain.Postgres.Tables;

// One index per TableOwner: which tables the app defined, and whether its storage is retired.
[PlatformOnly]
public interface ITableIndex : INeuron
{
    [Orleans.Concurrency.ReadOnly] Task<string[]> ReadTables();
    [Orleans.Concurrency.AlwaysInterleave] Task Register(string tableId);
    [Orleans.Concurrency.AlwaysInterleave] Task RequireOpen();
    Task Retire();
}

[PlatformOnly]
public interface ITableLifetime : INeuron
{
    Task Retire(string owner);
}
```

Delete `Contracts/IPostgres.cs`, `Contracts/IPostgresTable.cs`, `Contracts/IPostgresTables.cs`. Move `Contracts/Configuration/PostgresModuleOptions.cs` to `Contracts/PostgresModuleOptions.cs` and delete the empty `Configuration` folder.

- [ ] **Step 4: Rename the uses across the module**

From `src/DigitalBrain.Modules/Postgres` run (Git Bash):

```bash
grep -rl --include=*.cs -E 'IPostgresTables|IPostgresTableLifetime|IPostgresTable\b|IPostgres\b|PostgresTableDefinition' . | grep -v '/obj/' | xargs sed -i -E \
  -e 's/\bIPostgresTableLifetime\b/ITableLifetime/g' \
  -e 's/\bIPostgresTables\b/ITableIndex/g' \
  -e 's/\bIPostgresTable\b/ITable/g' \
  -e 's/\bIPostgres\b/IPostgresServer/g' \
  -e 's/\bPostgresTableDefinition\b/AcceptedTable/g'
```

Then add `using DigitalBrain.Postgres.Tables;` to every runtime and test file that now fails to resolve `ITable`, `TableDefinition`, `TableValue`, `AcceptedTable`, `ITableIndex` or `ITableLifetime`, and `using DigitalBrain.Postgres.Tables.Signals;` where `TableDefined`, `RowUpserted` or `RowDeleted` are published or asserted. Expected files: `PostgresModule.cs`, `PostgresTableNeuron.cs`, `PostgresTablesNeuron.cs`, `PostgresTableResources.cs`, `PostgresTableProvider.cs`, `IPostgresTableProvider.cs`, `PostgresTablePolicy.cs`, `PostgresAppResources.cs`, `PostgresAppLiveSource.cs`, `Apps/PostgresAppStorageHook.cs`, `PostgresNeuron.cs`, `Data/PostgresRowSourceNeuron.cs`, and tests `PostgresWriteTableFacts.cs`, `PostgresAppSourceFacts.cs`, `PostgresFacts.cs`, `PostgresTableFacts.cs`.

The `Aspire.Hosting` project uses only `PostgresModuleOptions` and `PostgresModule`; it needs no change.

- [ ] **Step 5: Build and run the shape test and the suite**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: PASS including `ContractShapeFacts`.

Then: `dotnet build src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting` and `dotnet build src/DigitalBrain.Mcp/DigitalBrain.Mcp` and `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps`.
Expected: all succeed (these reference the contracts but name none of the renamed types).

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/Postgres
git commit -m "Postgres contracts: IPostgresServer and the Tables vocabulary"
```

---

### Task 3: Runtime layout: server at the root, Tables folder

**Files (all under `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/`):**
- Rename: `PostgresNeuron.cs` → `PostgresServerNeuron.cs` (class `PostgresServerNeuron`)
- Move+rename: `PostgresTableNeuron.cs` → `Tables/TableNeuron.cs` (`TableNeuron`, `TableState`)
- Move+rename: `PostgresTablesNeuron.cs` → `Tables/TableIndexNeuron.cs` (`TableIndexNeuron`, `TableIndexState`) and `Tables/TableLifecycleGuard.cs` (`TableLifecycleGuard`, split out of the same file)
- Move+rename: `PostgresTablePolicy.cs` → `Tables/TablePolicy.cs` (`TablePolicy`)
- Move+rename: `PostgresTableProvider.cs` → `Tables/TableStore.cs` (`TableStore`), `IPostgresTableProvider.cs` → `Tables/ITableStore.cs` (`ITableStore`)
- Move+rename: `Apps/PostgresAppStorageHook.cs` → `Tables/TableStorageHook.cs` (`TableStorageHook`); delete the empty `Apps` folder
- Move+rename: `PostgresTableResources.cs` → `Tables/TableDescriptor.cs` (`ITableDescriptor`, `TableDescription`; was `IPostgresTableResource`, `PostgresAppTableResource`), made `public`
- Keep at root: `PostgresModule.cs`, `PostgresHosting.cs`, `PostgresProvider.cs`, `IPostgresProvider.cs`, `IntegrationPostgresProvider.cs`, `PostgresQueryGuard.cs`, `PostgresCells.cs`, `PostgresTypeMap.cs`, `PostgresConnectionSettings.cs`, `PostgresSourceRegistry.cs`, `DockerPostgresProvisioner.cs`, `Data/PostgresRowSourceNeuron.cs`
- Leave untouched for Task 4: `PostgresAppResources.cs`, `PostgresTools.cs`, `PostgresRegistryResources.cs`, `PostgresAppLiveSource.cs`, `PostgresIntegrationLiveSource.cs`, `PostgresInventoryProvider.cs`
- Create: `tests/DigitalBrain.Modules.Postgres.Tests/Tables/TableLifecycleGuardFacts.cs`

**Interfaces:**
- Produces: `public interface ITableStore` (members identical to today's `IPostgresTableProvider`), `public interface ITableDescriptor : INeuron { Task<TableDescription> Describe(string owner); }`, `public sealed record TableDescription(string AppId, string TableId, string Origin, AcceptedTable Table)`, `public static class PostgresCapacityKind` (was internal).
- Consumes: `TableOwner` (Task 1), `ITableIndex`/`ITableLifetime` (Task 2).

- [ ] **Step 1: Write the failing guard test**

```csharp
using DigitalBrain.Enforcement;
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Framework.Platform.Integrations;
using DigitalBrain.Postgres;
using DigitalBrain.Postgres.Tables;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.Postgres.Tests.Tables;

public sealed class TableLifecycleGuardFacts
{
    [Fact]
    public async Task AnIndexOfAnotherBrainRefusesEveryCallerAndAnAppCallerCannotReadItsOwnIndex()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<PostgresModule>().ConfigureSilo(silo =>
        {
            silo.Configuration[IntegrationSchema.Key("postgres", "ConnectionString")] = "Host=localhost;Database=platform;Username=reader";
            silo.Services.AddSingleton<ITableStore>(new PostgresWriteTableFacts.MemoryTables());
        }).StartAsync(ct);
        CallerContextStamper.Stamp(new()
        {
            PrincipalId = "alice", AccountId = "alice", BrainId = "brain",
            Kind = CallerKind.Platform, StampedBy = TrustedEdge.Platform,
        });
        await brain.AuthorizeCallerAsync();
        var foreign = brain.Get<ITableIndex>(new TableOwner("other-brain", "install").Key);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => foreign.ReadTables());
        var malformed = brain.Get<ITableIndex>("not a key");
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => malformed.ReadTables());

        CallerContextStamper.Stamp(new()
        {
            PrincipalId = "alice", AccountId = "alice", BrainId = "brain",
            Kind = CallerKind.App, AppId = "install", StampedBy = TrustedEdge.AppProxy,
        });
        await brain.AuthorizeCallerAsync();
        var own = brain.Get<ITableIndex>(new TableOwner(BrainScope.CurrentId(), "install").Key);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => own.ReadTables());
    }
}
```

If `PostgresWriteTableFacts.MemoryTables` is `private`, make it `internal` in that file.

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests --filter "FullyQualifiedName~TableLifecycleGuardFacts"`
Expected: build error, `ITableStore` does not exist.

- [ ] **Step 3: Move and rename the files**

From `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres`:

```bash
mkdir -p Tables
git mv PostgresNeuron.cs PostgresServerNeuron.cs
git mv PostgresTableNeuron.cs Tables/TableNeuron.cs
git mv PostgresTablesNeuron.cs Tables/TableIndexNeuron.cs
git mv PostgresTablePolicy.cs Tables/TablePolicy.cs
git mv PostgresTableProvider.cs Tables/TableStore.cs
git mv IPostgresTableProvider.cs Tables/ITableStore.cs
git mv Apps/PostgresAppStorageHook.cs Tables/TableStorageHook.cs
git mv PostgresTableResources.cs Tables/TableDescriptor.cs
rmdir Apps
```

Then rename the symbols across the module (runtime and tests), from `src/DigitalBrain.Modules/Postgres`:

```bash
grep -rl --include=*.cs -E 'PostgresNeuron|PostgresTableNeuron|PostgresTablesNeuron|PostgresTablesState|PostgresTableState|PostgresTablePolicy|PostgresTableProvider|IPostgresTableProvider|PostgresAppStorageHook|IPostgresTableResource|PostgresAppTableResource|PostgresLifecycleGuard|DescribeResource' . | grep -v '/obj/' | xargs sed -i -E \
  -e 's/\bPostgresNeuron\b/PostgresServerNeuron/g' \
  -e 's/\bPostgresTableNeuron\b/TableNeuron/g' \
  -e 's/\bPostgresTablesNeuron\b/TableIndexNeuron/g' \
  -e 's/\bPostgresTablesState\b/TableIndexState/g' \
  -e 's/\bPostgresTableState\b/TableState/g' \
  -e 's/\bPostgresTablePolicy\b/TablePolicy/g' \
  -e 's/\bIPostgresTableProvider\b/ITableStore/g' \
  -e 's/\bPostgresTableProvider\b/TableStore/g' \
  -e 's/\bPostgresAppStorageHook\b/TableStorageHook/g' \
  -e 's/\bIPostgresTableResource\b/ITableDescriptor/g' \
  -e 's/\bPostgresAppTableResource\b/TableDescription/g' \
  -e 's/\bPostgresLifecycleGuard\b/TableLifecycleGuard/g' \
  -e 's/\bDescribeResource\b/Describe/g'
```

Set `namespace DigitalBrain.Postgres.Tables;` in every file under `Tables/`. Add `using DigitalBrain.Postgres.Tables;` to root files that reference the moved types (`PostgresHosting.cs`, `PostgresModule.cs`, and the Task 4 leftovers `PostgresAppResources.cs`, `PostgresAppLiveSource.cs`, `PostgresTools.cs`, `PostgresInventoryProvider.cs`) and to tests.

Make these `public`: `ITableStore`, `ITableDescriptor`, `TableDescription`, `PostgresCapacityKind` (in `PostgresSourceRegistry.cs`). Task 4's sibling module needs them.

- [ ] **Step 4: Split the guard out of the index neuron**

Cut the `TableLifecycleGuard` class from `Tables/TableIndexNeuron.cs` into `Tables/TableLifecycleGuard.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;

namespace DigitalBrain.Postgres.Tables;

// Every index and lifetime call names its owner; the guard checks the owner is this brain's and
// the source is the one grain type allowed to make that call.
internal sealed class TableLifecycleGuard : IIncomingGrainCallFilter
{
    public async Task Invoke(IIncomingGrainCallContext context)
    {
        var contract = context.InterfaceMethod.DeclaringType;
        if (contract == typeof(ITableIndex) && context.InterfaceMethod.Name == nameof(ITableIndex.ReadTables))
        {
            var owner = TableOwner.Parse(context.TargetId.Key.ToString()!);
            if (owner.BrainId != BrainScope.CurrentId()) { throw new UnauthorizedAccessException("This storage belongs to another brain."); }
            var caller = CallerContextStamper.Require();
            if (!CallerContextStamper.IsTrusted(caller) || caller.Kind == DigitalBrain.Enforcement.CallerKind.App)
            { throw new UnauthorizedAccessException("Only trusted host code may read app storage."); }
        }
        else if (contract == typeof(ITableIndex) || contract == typeof(ITableLifetime))
        {
            var source = context.SourceId;
            var expected = contract == typeof(ITableLifetime) ? TableIndexNeuron.GrainType
                : context.InterfaceMethod.Name == nameof(ITableIndex.Retire) ? AppGrainType.Name : TableNeuron.GrainType;
            if (source is null || source.Value.Type.ToString() != expected)
            { throw new UnauthorizedAccessException("Only the owning module may change table lifetime."); }
            var ownerKey = contract == typeof(ITableIndex) ? context.TargetId.Key.ToString()! : (string)context.Request.GetArgument(0)!;
            var owner = TableOwner.Parse(ownerKey);
            if (owner.BrainId != BrainScope.CurrentId()) { throw new UnauthorizedAccessException("This storage belongs to another brain."); }
            if (contract == typeof(ITableLifetime) && source.Value.Key.ToString() != ownerKey)
            { throw new UnauthorizedAccessException("This table belongs to another owner."); }
            if (contract == typeof(ITableIndex) && context.InterfaceMethod.Name == nameof(ITableIndex.Register)
                && source.Value.Key.ToString() != (string)context.Request.GetArgument(0)!)
            { throw new UnauthorizedAccessException("A table can only register itself."); }
        }
        await context.Invoke();
    }
}
```

Add `public const string GrainType = "postgres.tables";` to `TableIndexNeuron` and `public const string GrainType = "postgres.table";` to `TableNeuron`, and use them in their `[GrainType(...)]` attributes so the guard and the attribute cannot drift.

- [ ] **Step 5: Lean `PostgresHosting.AddPostgres`**

Replace the `AddPostgres` body's service lines with this ordering (behaviour identical, grouped by concern; the lines that register `PostgresAppResources`, `PostgresInventoryProvider`, `PostgresRegistryResources`, `AddLiveTables`, both `ILiveTableSource` registrations and `PostgresTools` stay for now and move in Task 4):

```csharp
        services.AddSingleton<PostgresRegistration>();
        services.AddOptions<PostgresModuleOptions>()
            .Configure<IConfiguration>((options, configuration) => configuration.PopulateModuleOptions("postgres", options))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ConnectionName), "Postgres requires a connection name.")
            .ValidateOnStart();
        // Server
        services.TryAddSingleton<PostgresSourceRegistry>();
        services.TryAddSingleton<IPostgresSourceRegistry>(provider => provider.GetRequiredService<PostgresSourceRegistry>());
        services.AddSingleton<IIntegrationStartup>(provider => provider.GetRequiredService<PostgresSourceRegistry>());
        services.TryAddSingleton<IPostgresProvider, IntegrationPostgresProvider>();
        services.AddSingleton<ICapacityConfiguredSource>(provider =>
            new PostgresConfiguredSource(active: !provider.GetRequiredService<IOptions<PostgresModuleOptions>>().Value.ProvisionPerBrain));
        services.AddSingleton<ICapacityProvisioner>(provider =>
            provider.GetRequiredService<IOptions<PostgresModuleOptions>>().Value.ProvisionPerBrain
                ? new DockerPostgresProvisioner(provider.GetRequiredService<IModuleIntegrations<PostgresModule>>().Get("postgres"))
                : new InactivePostgresProvisioner());
        services.AddHealthChecks().AddCheck<PostgresHealthCheck>("postgres", tags: ["ready"]);
        // Tables
        services.TryAddSingleton<ITableStore, TableStore>();
        services.AddSingleton<IIncomingGrainCallFilter, TableLifecycleGuard>();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<DigitalBrain.Apps.IAppStorageHook, TableStorageHook>());
        // Moves to Postgres.Windows in the next task.
        services.TryAddSingleton<PostgresAppResources>();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryInventoryProvider, PostgresInventoryProvider>());
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryResourceProvider, PostgresRegistryResources>());
        services.AddLiveTables();
        services.TryAddKeyedSingleton<ILiveTableSource>("postgres", (provider, _) =>
            new PostgresIntegrationLiveSource(provider.GetRequiredService<IPostgresSourceRegistry>(), PostgresCapacityKind.PlatformOrigin));
        services.TryAddKeyedSingleton<ILiveTableSource>(KeyedService.AnyKey, (provider, key) =>
            key is string name && name.StartsWith(PostgresAppResources.SourcePrefix, StringComparison.Ordinal) ? new PostgresAppLiveSource(
                () => provider.GetRequiredService<PostgresAppResources>().Resolve((string)key!, CancellationToken.None),
                origin => new PostgresIntegrationLiveSource(provider.GetRequiredService<IPostgresSourceRegistry>(), origin))
                : throw new DigitalBrain.Supabase.Tables.SupabaseTableSourceException("The requested table source is not configured."));
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, PostgresTools>());
```

- [ ] **Step 6: Run the suite**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: PASS including `TableLifecycleGuardFacts`. Then `dotnet build src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting` succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain.Modules/Postgres
git commit -m "Postgres runtime: server at the root, Tables folder"
```

---

### Task 4: Postgres.Windows takes the Assistant and Supabase bridge

**Files:**
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/DigitalBrain.Modules.Postgres.Windows.csproj`
- Create: `.../DigitalBrain.Modules.Postgres.Windows/PostgresWindowsModule.cs`
- Create: `.../DigitalBrain.Modules.Postgres.Windows/PostgresWindowsHosting.cs`
- Move (git mv) from `DigitalBrain.Modules.Postgres/` into `DigitalBrain.Modules.Postgres.Windows/`: `PostgresAppResources.cs`, `PostgresTools.cs`, `PostgresRegistryResources.cs`, `PostgresAppLiveSource.cs`, `PostgresIntegrationLiveSource.cs`, `PostgresInventoryProvider.cs`
- Create: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests/DigitalBrain.Modules.Postgres.Windows.Tests.csproj`
- Move from `tests/DigitalBrain.Modules.Postgres.Tests/` into `tests/DigitalBrain.Modules.Postgres.Windows.Tests/`: `PostgresAppSourceFacts.cs`, `PostgresDiscoveryFacts.cs`, `PostgresTableFacts.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/DigitalBrain.Modules.Postgres.csproj` (drop Supabase, AspNetCore and the Azure packages if unused; keep Apps.Contracts)
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresHosting.cs` (remove the "Moves to Postgres.Windows" block and the `AI.Agents`/`Supabase` usings)
- Modify: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/DigitalBrain.Modules.Postgres.Tests.csproj` (drop Flutter and Supabase references)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:27` (add the module)
- Modify: `DigitalBrain.slnx:123-131` (add both projects)

**Interfaces:**
- Consumes: `IPostgresSourceRegistry`, `PostgresCapacityKind`, `ITableIndex`, `ITableDescriptor`, `TableDescription`, `TableOwner`, `IPostgresProvider` from the Postgres runtime; `LiveTableWindows`, `ILiveTableSource`, `LiveTableHosting` from Supabase; `IAgentToolFactory` from AI contracts; `IApp`, `IAppIndex` from Apps contracts.
- Produces: `public sealed class PostgresWindowsModule : Module` with id `postgres-windows`.

- [ ] **Step 1: Create the projects**

`DigitalBrain.Modules.Postgres.Windows.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Shows Postgres platform and app tables in the workspace: Assistant tools, discovery and live table sources.</Description>
    <RootNamespace>DigitalBrain.Modules.Postgres.Windows</RootNamespace>
    <NoWarn>$(NoWarn);ORLEANSEXP005;CA1812</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../DigitalBrain.Modules.Postgres/DigitalBrain.Modules.Postgres.csproj" />
    <ProjectReference Include="../../Supabase/DigitalBrain.Modules.Supabase/DigitalBrain.Modules.Supabase.csproj" />
    <ProjectReference Include="../../DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj" />
    <ProjectReference Include="../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
    <InternalsVisibleTo Include="DigitalBrain.Modules.Postgres.Windows.Tests" />
  </ItemGroup>
</Project>
```

`DigitalBrain.Modules.Postgres.Windows.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../../../../Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.Postgres.Windows/DigitalBrain.Modules.Postgres.Windows.csproj" />
    <ProjectReference Include="../../../Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj" />
    <ProjectReference Include="../DigitalBrain.Modules.Postgres.Tests/DigitalBrain.Modules.Postgres.Tests.csproj" />
  </ItemGroup>
  <ItemGroup><Using Include="DigitalBrain.Testing.Module" /></ItemGroup>
</Project>
```

The reference to the Postgres test project is for `PostgresWriteTableFacts.MemoryTables` and `ResearchCapacity`, which `PostgresAppSourceFacts` uses. Make both `public` in their files. Check `Directory.Build.props` under `src` for how test projects pick up xunit; the Time test project has nothing extra, so neither does this one.

- [ ] **Step 2: Write the module and hosting**

`PostgresWindowsModule.cs`:

```csharp
using DigitalBrain.Framework;
using Orleans.Hosting;

namespace DigitalBrain.Postgres.Windows;

public sealed class PostgresWindowsModule() : Module(new ModuleId("postgres-windows"))
{
    public override void Configure(ISiloBuilder silo) => silo.AddPostgresWindows();
}
```

`PostgresWindowsHosting.cs`:

```csharp
using DigitalBrain.AI.Agents;
using DigitalBrain.Framework;
using DigitalBrain.Supabase;
using DigitalBrain.Supabase.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Orleans.Hosting;

namespace DigitalBrain.Postgres.Windows;

public static class PostgresWindowsHosting
{
    public static ISiloBuilder AddPostgresWindows(this ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        var services = silo.Services;
        services.TryAddSingleton<PostgresAppResources>();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryInventoryProvider, PostgresInventoryProvider>());
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryResourceProvider, PostgresRegistryResources>());
        services.AddLiveTables();
        services.TryAddKeyedSingleton<ILiveTableSource>("postgres", (provider, _) =>
            new PostgresIntegrationLiveSource(provider.GetRequiredService<IPostgresSourceRegistry>(), PostgresCapacityKind.PlatformOrigin));
        services.TryAddKeyedSingleton<ILiveTableSource>(KeyedService.AnyKey, (provider, key) =>
            key is string name && name.StartsWith(PostgresAppResources.SourcePrefix, StringComparison.Ordinal) ? new PostgresAppLiveSource(
                () => provider.GetRequiredService<PostgresAppResources>().Resolve((string)key!, CancellationToken.None),
                origin => new PostgresIntegrationLiveSource(provider.GetRequiredService<IPostgresSourceRegistry>(), origin))
                : throw new DigitalBrain.Supabase.Tables.SupabaseTableSourceException("The requested table source is not configured."));
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, PostgresTools>());
        return silo;
    }
}
```

Move the six runtime files with `git mv` and set their namespace to `DigitalBrain.Postgres.Windows`; add `using DigitalBrain.Postgres;` and `using DigitalBrain.Postgres.Tables;` where they reference `IPostgresProvider`, `IPostgresSourceRegistry`, `PostgresCapacityKind`, `ITableIndex`, `ITableDescriptor`, `TableDescription`, `TableOwner`, `PostgresQueryException`, `PostgresUnavailableException`.

Delete the "Moves to Postgres.Windows" block from `PostgresHosting.AddPostgres` and its now-unused usings (`DigitalBrain.AI.Agents`, `DigitalBrain.Supabase`, `DigitalBrain.Supabase.Windows`).

- [ ] **Step 3: Cut the Postgres runtime's references**

`DigitalBrain.Modules.Postgres.csproj` item group becomes:

```xml
  <ItemGroup>
    <ProjectReference Include="../../DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj" />
    <ProjectReference Include="../DigitalBrain.Modules.Postgres.Contracts/DigitalBrain.Modules.Postgres.Contracts.csproj" />
    <ProjectReference Include="../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
    <PackageReference Include="Npgsql" />
    <InternalsVisibleTo Include="DigitalBrain.Modules.Postgres.Tests" />
  </ItemGroup>
```

Build. If `Azure.Storage.Blobs` or `Microsoft.Orleans.Persistence.AzureStorage` are referenced by any remaining file (grep `Azure` in the runtime), put that package back; otherwise leave them out. The `Microsoft.AspNetCore.App` framework reference is needed only if a remaining file uses health-check types from AspNetCore; `Microsoft.Extensions.Diagnostics.HealthChecks` comes through Framework, so try without it first.

`DigitalBrain.Modules.Postgres.Tests.csproj` drops the Flutter and Supabase references.

Move the three test files with `git mv`, set their namespace to `DigitalBrain.Modules.Postgres.Windows.Tests`, add `using DigitalBrain.Postgres.Windows;`, and change every `ModuleTest.Create().WithModule<PostgresModule>()` in them to `.WithModule<PostgresModule>().WithModule<PostgresWindowsModule>()` (keep the `FlutterModule` where already present).

- [ ] **Step 4: Register the module**

`OsCatalog.cs`: insert `new DigitalBrain.Postgres.Windows.PostgresWindowsModule(),` after the `PostgresModule` line.

`DigitalBrain.slnx`: add inside `/Modules/Postgres/`:

```xml
    <Project Path="src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/DigitalBrain.Modules.Postgres.Windows.csproj" />
```

and inside `/Modules/Postgres/tests/`:

```xml
    <Project Path="src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests/DigitalBrain.Modules.Postgres.Windows.Tests.csproj" />
```

Also add the Windows module's runtime project as a reference wherever the OS host project references the Postgres runtime (grep `DigitalBrain.Modules.Postgres.csproj` under `src/DigitalBrain.OS` and `src/IntoChat`; add the sibling line next to each hit).

- [ ] **Step 5: Run every affected suite**

```
dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests
dotnet test src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test src/Testing/DigitalBrain.Architecture.Tests
```

Expected: Postgres and Postgres.Windows green; Supabase and Apps unchanged; OS and Architecture show only the pre-existing failures listed in Global Constraints. `ProductMatchesTheReferenceCompositionModuleSet` must pass with `postgres-windows` in the catalog.

- [ ] **Step 6: Commit**

```bash
git add DigitalBrain.slnx src/DigitalBrain.Modules/Postgres src/DigitalBrain.OS
git commit -m "Postgres.Windows: Assistant tools and live table sources leave the Postgres module"
```

---

### Task 5: Aspire hosting options and end-to-end smoke

**Files:**
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting/PostgresHostingExtensions.cs:13-24`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting/PostgresModuleHosting.cs:26-34`
- Delete: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting/Configuration/PostgresHostingOptions.cs`

**Interfaces:**
- Consumes: `PostgresResourceOptions` from Contracts (fields `Enabled`, `DatabaseName`, `PersistentStorage`) and `PostgresModuleOptions.ConnectionName`.

- [ ] **Step 1: Run the hosting facts to see the baseline**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests.Hosting`
Expected: PASS (record the count).

- [ ] **Step 2: Remove the duplicated options record**

`PostgresHostingExtensions.WithPostgres` becomes:

```csharp
    public static DigitalBrainModuleBuilder<PostgresModuleHosting> WithPostgres(
        this DigitalBrainModuleBuilder<PostgresModuleHosting> module, string connectionName, PostgresResourceOptions hosting)
    {
        ArgumentNullException.ThrowIfNull(module);
        ArgumentNullException.ThrowIfNull(hosting);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionName);
        ArgumentException.ThrowIfNullOrWhiteSpace(hosting.DatabaseName);
        State(module).Enable(new(connectionName, hosting.DatabaseName, hosting.PersistentStorage));
        return module;
    }
```

`PostgresModuleHosting.Configure` becomes:

```csharp
        if (options.Hosting.Enabled) { module.WithPostgres(options.ConnectionName, options.Hosting); }
        else { module.WithExternalConnection(options.ConnectionName); }
```

Delete `Configuration/PostgresHostingOptions.cs` and the empty folder.

- [ ] **Step 3: Run hosting facts again**

Run: `dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests.Hosting`
Expected: same count, all PASS.

- [ ] **Step 4: Smoke the AppHost**

From `src/DigitalBrain/AppHost/DigitalBrain.AppHost` run `aspire run` and wait for all resources to report Healthy. Open the dashboard, confirm the `IntoChat` resource logs show no exception naming `Postgres`, then stop it.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting
git commit -m "Postgres hosting: provision from the module's own options"
```

---

## Self-review notes

- Coverage: server rename (Task 2), Tables folder with `ITable` and signals (Task 2, 3), root `PostgresServerNeuron` (Task 3), owner key type (Task 1), leak removal and reference cut (Task 4), hosting unchanged except the duplicate record (Task 5).
- Deferred on purpose: lifting the live table window engine out of Supabase into a neutral module. `PostgresWindowsModule` is the seam that makes that a later, local change.
- Type names used consistently: `TableOwner`, `ITableIndex`, `ITableLifetime`, `ITableStore`, `TableStore`, `ITableDescriptor`, `TableDescription`, `AcceptedTable`, `IPostgresServer`, `PostgresServerNeuron`, `TableNeuron`, `TableIndexNeuron`, `TableLifecycleGuard`, `TableStorageHook`, `PostgresWindowsModule`.
