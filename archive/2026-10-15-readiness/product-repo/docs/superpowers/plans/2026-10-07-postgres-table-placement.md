# Postgres Table Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Capacity facet. A Postgres table's location becomes a typed placement pinned at the first Define, chosen by the app's `tables` slot binding or the deployment's `Isolation` policy.

**Architecture:** `TablePlacements` (Postgres-internal) resolves `Connection(key)` from the app's bound `tables` slot, else `BrainDatabase(name)` under `DatabasePerBrain`, else `Shared`. `TableNeuron` pins the result. Shared and BrainDatabase placements run through `TableStore` and `PostgresSourceRegistry`. Connection placements run inside `PostgresServerNeuron` through an internal `IPostgresTableHost`, so the credential never leaves its neuron. Apps refuses rebinding `tables` through `IAppStorageHook.RequireRebindable`. Framework gains `ServiceUnavailableException` (503).

**Tech Stack:** .NET 11 RC, Orleans, Npgsql, Aspire, xunit v3 over `ModuleTest.Create()`.

**Spec:** `docs/superpowers/specs/2026-10-07-postgres-table-placement-design.md`

## Global Constraints

- LSP first (CLAUDE.md): before each edit, `findReferences` / `goToImplementation` on every symbol touched. Run csharp-ls from the repo root (`DigitalBrain-lsp.sln`). Diagnostics must be clean before building.
- Build and test per project, never the `.slnx`.
- Concrete arrays in grain state. No state compatibility: reshape `TableState` freely. If activation fails with a `wireType` error, wipe Azurite.
- No `/// <summary>`. Facts with sentence names and `TestContext.Current.CancellationToken`.
- Commit explicit files only (a parallel session shares the tree).
- Refusal texts, exact:
  - Rebind: `The tables slot cannot be rebound while this app owns tables.`
  - Missing admin: `AdminConnection is required when Postgres isolation is DatabasePerBrain.`
- Reserved slot: name `tables`, connector `postgres`.

## Review Focus

1. **A revoked or unreachable bound Connection must return 503, not 409 and not a silent Shared write.** Test in Task 4.
2. **Binding `tables` for the first time while the app already owns Shared tables must be refused.** Otherwise the app's data splits. Test in Task 5.
3. **Re-sending the same binding id (idempotent Configure) must not be refused.** Test in Task 5.
4. **Under `DatabasePerBrain` with no `AdminConnection`, startup must fail with the exact message,** not the first Define. Test in Task 3.
5. **A table pinned to `BrainDatabase` must keep its placement after the policy flips to `Shared` and the silo restarts.** Test in Task 3.

---

### Task 1: Framework `ServiceUnavailableException` replaces `CapacityUnavailableException`

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/ServiceUnavailableException.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Capacity/CapacityUnavailableException.cs`. `CapacityResolver` and `InactivePostgresProvisioner` throw `PostgresUnavailableException("Postgres capacity is not provisioned.")` until Task 3 deletes them. `ICapacity.cs` goes in Task 3.
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Http/ModuleRouteGuard.cs:10`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/ScriptEdgeEndpoints.cs:41`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/PostgresQueryException.cs:8`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/Pinger.cs:15,35`, plus any edge fact that asserts `RefusalMessage` (find it with `findReferences`)

**Interfaces:**
- Produces: `public class ServiceUnavailableException(string message) : Exception(message)` in namespace `DigitalBrain.Framework`, `[GenerateSerializer, Alias("framework.service-unavailable")]`.

- [ ] **Step 1: Write the failing test** in the Postgres tests (`PostgresFacts.cs`):

```csharp
[Fact]
public void APostgresOutageIsAServiceUnavailableRefusal()
    => Assert.IsAssignableFrom<DigitalBrain.Framework.ServiceUnavailableException>(new PostgresUnavailableException("down"));
```

- [ ] **Step 2: Run it and confirm it fails to compile.** `dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests -- --filter-method "*ServiceUnavailableRefusal*"`
- [ ] **Step 3: Implement.**

```csharp
namespace DigitalBrain.Framework;

// The system behind a neuron is down or not provisioned; HTTP surfaces map it to 503.
[GenerateSerializer, Alias("framework.service-unavailable")]
public class ServiceUnavailableException(string message) : Exception(message);
```

```csharp
// PostgresQueryException.cs:8
public sealed class PostgresUnavailableException(string message) : DigitalBrain.Framework.ServiceUnavailableException(message);
```

  - `ModuleRouteGuard`: replace the `Capacity.CapacityUnavailableException` catch with `catch (ServiceUnavailableException error)`. Keep it first, ahead of `InvalidOperationException`.
  - `ScriptEdgeEndpoints.Refusal`: `if (error is DigitalBrain.Framework.ServiceUnavailableException)`.
  - `Pinger.RefuseCapacity`: rename to `RefuseUnavailable` and throw `new ServiceUnavailableException("Sorry, the service is not available at the moment.")`. Assert that text in the edge fact.
  - Check that the `PostgresUnavailableException` `[GenerateSerializer]`/alias attributes (if present) still compile with the new base.
- [ ] **Step 4: Run** the Postgres, CSharp and Framework unit suites. Expect PASS.
- [ ] **Step 5: Commit** the files listed: `Framework: ServiceUnavailableException is the 503 refusal; Postgres outages stop answering 409`.

### Task 2: Typed `TablePlacement` and placement-keyed `TableStore`

**Files:**
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Tables/TablePlacement.cs`
- Modify: `Tables/ITableStore.cs`, `Tables/TableStore.cs:121-127`, `PostgresSourceRegistry.cs`, `Tables/TableNeuron.cs`
- Modify tests: `tests/.../PostgresWriteTableFacts.cs` (`MemoryTables` signatures), `tests/.../Tables/*`

**Interfaces:**
- Produces:

```csharp
namespace DigitalBrain.Postgres.Tables;

public enum TablePlacementKind { Shared, BrainDatabase, Connection }

// Where a table lives, pinned at first Define. Name is the database (BrainDatabase) or the
// connection grain key (Connection); Shared has none. Flat on purpose: JSON grain storage.
[GenerateSerializer, Alias("postgres.table-placement")]
public sealed record TablePlacement([property: Id(0)] TablePlacementKind Kind, [property: Id(1)] string? Name = null)
{
    public static readonly TablePlacement Shared = new(TablePlacementKind.Shared);
    public static TablePlacement BrainDatabase(string name) => new(TablePlacementKind.BrainDatabase, name);
    public static TablePlacement Connection(string key) => new(TablePlacementKind.Connection, key);
}
```

  - Every `ITableStore` method replaces `string origin` with `TablePlacement placement`.
  - `IPostgresSourceRegistry.Get(TablePlacement placement, CancellationToken ct = default)` serves Shared and BrainDatabase. It throws `ArgumentException` for Connection.
  - `TableState`: `[Id(2)] public TablePlacement? Placement` replaces `Origin`.

- [ ] **Step 1: Failing test.** Rewrite the existing pinned-origin fact in `PostgresWriteTableFacts` so it asserts `MemoryTables` receives `TablePlacement.Shared` for Define, Upsert and Drop.
- [ ] **Step 2: Run and confirm it fails to compile.**
- [ ] **Step 3: Implement.** Replace `origin` parameters across `TableStore`. `Execute` calls `registry.Get(placement, …)`. In `PostgresSourceRegistry.Get`, map `Shared` to the platform builder and `BrainDatabase(name)` to the admin builder with `Database = name`. Key the source cache by `(revision, placement)`. Delete the `"db:"` prefix parsing. `TableNeuron` stays on `capacity.Resolve` in this task, mapping `"platform"` to `TablePlacement.Shared` and `"db:x"` to `BrainDatabase("x")` (removed in Task 3). Delete `PostgresCapacityKind.OriginOrPlatform`; the pinned placement is never null after Define.
- [ ] **Step 4: Run** the Postgres unit suite. Expect PASS.
- [ ] **Step 5: Commit**: `Postgres: tables pin a typed placement, not an origin string`.

### Task 3: Isolation policy, `BrainDatabases`, delete the Capacity facet

**Files:**
- Create: `DigitalBrain.Modules.Postgres/Configuration/PostgresIsolation.cs`, `Tables/TablePlacements.cs`, `BrainDatabases.cs` (renamed from `DockerPostgresProvisioner.cs`)
- Modify: `Configuration/PostgresModuleOptions.cs:10`, `PostgresHosting.cs:36-41`, `PostgresSourceRegistry.cs` (startup validation), `Tables/TableNeuron.cs`
- Modify: `DigitalBrain.Modules.Postgres.Aspire.Hosting/PostgresHostingExtensions.cs:86`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs:43` (remove `services.AddCapacity();`)
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Capacity/ICapacity.cs`, `src/DigitalBrain.Platform/DigitalBrain.Platform/Capacity/` (both), `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Capacity/CapacityResolverFacts.cs`, the `ICapacity` assert in `PlatformHostingFacts.cs:19`, `PostgresCapacityKind` and `PostgresConfiguredSource` in `PostgresSourceRegistry.cs`, `InactivePostgresProvisioner`
- Rename tests: `PostgresCapacityFacts.cs` → `PostgresIsolationFacts.cs`. Update `PostgresAspireHostingFacts.cs:99-122`.

**Interfaces:**
- Produces:

```csharp
public enum PostgresIsolation { Shared, DatabasePerBrain }
// PostgresModuleOptions
public PostgresIsolation Isolation { get; set; } = PostgresIsolation.Shared;

internal sealed class BrainDatabases(IIntegrationHandle integration, Func<string, string, CancellationToken, Task>? createDatabase = null)
{
    public static string DatabaseName(string brainId);           // unchanged: "brain_" + sha256[..16]
    public Task<string> Ensure(string brainId, CancellationToken ct); // returns the database name
}

internal interface ITablePlacements
{
    Task<TablePlacement> Resolve(TableOwner owner, CancellationToken ct);
}
```

- [ ] **Step 1: Failing facts** in `PostgresIsolationFacts`:
  - `UnderSharedIsolationTablesArePlacedShared`: resolve for `new TableOwner("brain-1", "brain-1/apps/x")` and expect `TablePlacement.Shared`.
  - `UnderDatabasePerBrainEachBrainGetsItsOwnDatabase`: use `Isolation = DatabasePerBrain` and a fake `createDatabase`. Expect `BrainDatabase(BrainDatabases.DatabaseName("brain-1"))`, different for `brain-2`, and `Ensure` idempotent.
  - `DatabasePerBrainWithoutAnAdminConnectionFailsAtStartup`: `StartAsync` throws `InvalidOperationException` with `AdminConnection is required when Postgres isolation is DatabasePerBrain.` (Review Focus 4)
  - `APinnedBrainDatabaseSurvivesAPolicyFlipAndRestart`: Define under DatabasePerBrain, flip `Isolation` to Shared, deactivate the table, Upsert. `MemoryTables` receives `BrainDatabase(...)`. (Review Focus 5)
  - Keep `DatabaseNamesAreStableHashedAndDistinctPerBrain`, retargeted to `BrainDatabases.DatabaseName`.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**

```csharp
internal sealed class TablePlacements(IOptions<PostgresModuleOptions> options, BrainDatabases databases) : ITablePlacements
{
    public async Task<TablePlacement> Resolve(TableOwner owner, CancellationToken ct)
        => options.Value.Isolation == PostgresIsolation.DatabasePerBrain
            ? TablePlacement.BrainDatabase(await databases.Ensure(owner.BrainId, ct))
            : TablePlacement.Shared;
}
```

  - `TableNeuron` takes `ITablePlacements placements` instead of `ICapacity`. In `Define`: `var placement = state.State.Placement ?? await placements.Resolve(TableOwner.Current(), CancellationToken.None);`
  - `PostgresHosting`: register `BrainDatabases` (built from `integrations.Get("postgres")`) and `ITablePlacements` as `TryAddSingleton` (tests override them). Remove both Capacity registrations.
  - `PostgresSourceRegistry`: `needAdmin = options.Value.Isolation == PostgresIsolation.DatabasePerBrain || placement.Kind == TablePlacementKind.BrainDatabase`. Change the missing-admin throw to the exact Global Constraints message. `InitializeAsync` already runs `Get(Shared)` at startup, which enforces it there.
  - `PostgresHostingExtensions:86`: set the option key `"Isolation"` to `"DatabasePerBrain"` instead of `ProvisionPerBrain=true`. The `AdminConnection` wiring is unchanged.
  - Delete the files listed. Use LSP `findReferences` on each deleted symbol until there are none left.
- [ ] **Step 4: Run** the Postgres, Postgres Hosting, Platform unit and Architecture suites. Expect PASS.
- [ ] **Step 5: Commit**: `Postgres: Isolation policy places tables; the Capacity facet is gone`.

### Task 4: `Connection` placement through the app's `tables` slot

**Files:**
- Create: `DigitalBrain.Modules.Postgres/Tables/IPostgresTableHost.cs`
- Modify: `Tables/TablePlacements.cs`, `Tables/TableNeuron.cs`, `PostgresServerNeuron.cs`, `Tables/TableStore.cs` (add a fixed-source constructor)
- Test: `tests/.../Tables/ConnectionPlacementFacts.cs`

**Interfaces:**
- Consumes: `IApp.Read()` → `AppSnapshot.Manifest.Slots` (`AppSlot(Name, Connector)`), `AppSnapshot.Connections` (slot → connection id). `ConnectionKeys.For(brainId, "postgres", id)`. `IApp.Key(brainId, name)` format `{brain}/apps/{name}`.
- Produces:

```csharp
internal interface IPostgresTableHost : IGrainWithStringKey
{
    Task Define(string table, TableDefinition definition);
    Task Drop(string table);
    Task<bool> Upsert(string table, TableDefinition definition, TableValue[] key, TableValue[] values);
    Task<bool> Delete(string table, TableDefinition definition, TableValue[] key);
    Task<TableValue[]?> Read(string table, TableDefinition definition, TableValue[] key);
    Task<TableValue[][]> Page(string table, TableDefinition definition, int offset, int limit);
}
public const string TablesSlot = "tables"; // on TablePlacements
```

- [ ] **Step 1: Failing facts** (stamp a caller for app `brain/apps/a`, real `IApp` grain created with a manifest declaring `tables`):
  - `ABoundTablesSlotPlacesTablesInThatConnection`: Configure `tables` → `c1`, Define, and expect `state.Placement == Connection(ConnectionKeys.For(brain, "postgres", "c1"))`. Use a fake `IPostgresTableHost`, or `RecordingCSharpFile`-style registration of a test connection neuron, to record the call.
  - `AnUndeclaredOrUnboundSlotFallsBackToThePolicy`: expect `Shared`.
  - `AnotherPostgresSlotDoesNotRedirectTables`: a manifest with `db`/postgres bound gives `Shared`.
  - `AnUnavailableBoundConnectionRefusesWithServiceUnavailable`: the host throws `PostgresUnavailableException`; `Upsert` surfaces `ServiceUnavailableException` and no Shared write is recorded. (Review Focus 1)
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.** `TablePlacements` gains an `IGrainFactory grains` constructor parameter.

```csharp
// TablePlacements.Resolve, before the policy:
if (await BoundConnection(owner) is { } key) { return TablePlacement.Connection(key); }

private async Task<string?> BoundConnection(TableOwner owner)
{
    if (!owner.AppId.Contains("/apps/", StringComparison.Ordinal)) { return null; } // a bare behavior owns no slots
    var app = await grains.GetGrain<IApp>(owner.AppId).Read();
    return app.Manifest.Slots.Any(s => s.Name == TablesSlot && s.Connector == "postgres")
        && app.Connections.TryGetValue(TablesSlot, out var id)
        ? ConnectionKeys.For(owner.BrainId, "postgres", id) : null;
}
```

  - `TableNeuron`: replace each `provider.XAsync(placement, …)` with a private `Tables()` dispatch. If `Placement.Kind == Connection`, call `GrainFactory.GetGrain<IPostgresTableHost>(Placement.Name!)`; otherwise call `provider` (`ITableStore`) with the placement.
  - `PostgresServerNeuron : …, IPostgresTableHost`: each method is `UseCredentialAsync((credential, _) => new TableStore(credential.Value).XAsync(TablePlacement.Shared, …), CancellationToken.None)` and keeps the brain check `WithProvider` already applies. If the connection has no credential (revoked), throw `PostgresUnavailableException("This table's connection is not available.")`. Check `Neuron.Access` for the new operations with `goToDefinition` and require `BrainScope.CurrentId()` the way the other operations do.
  - `TableStore(string connectionString)`: a constructor over a single `NpgsqlDataSource`, disposed per call like `ConnectionPostgresProvider`.
- [ ] **Step 4: Run** the Postgres suite. Expect PASS.
- [ ] **Step 5: Commit**: `Postgres: an app's bound tables slot places its tables in that connection`.

### Task 5: Refuse rebinding `tables` while the app owns tables

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IAppStorageHook.cs`, `.../DigitalBrain.Modules.Apps/Apps/AppNeuron.cs:118-128`, `Postgres/.../Tables/TableStorageHook.cs`
- Test: `Apps/tests/DigitalBrain.Modules.Apps.Tests/Runtimes/StorageHookFacts.cs`, `Postgres/tests/.../Tables/TableStorageHookFacts.cs`

**Interfaces:**

```csharp
public interface IAppStorageHook
{
    Task OnRetired(string brainId, string appKey, string[] storageKeys, CancellationToken cancellationToken);
    // Throws when the app's stored data depends on the slot's current binding.
    Task RequireRebindable(string brainId, string appKey, string slot, CancellationToken cancellationToken) => Task.CompletedTask;
}
```

- [ ] **Step 1: Failing facts.**
  - Apps: `ConfigureAsksStorageHooksBeforeChangingASlotBinding`: `RecordingHook` records `(slot)` when `db` changes from absent to `c1`, and does not record when `c1` is re-sent. (Review Focus 3)
  - Apps: `ARefusingHookLeavesTheBindingUnchanged`: the hook throws `InvalidOperationException`, Configure throws, and `Read().Connections` is unchanged.
  - Postgres: `FirstBindingTablesIsRefusedOnceTheAppOwnsSharedTables` (Review Focus 2) and `BindingTablesIsAllowedBeforeAnyTableExists`.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.** In `AppNeuron.Configure`, before cloning:

```csharp
foreach (var (slot, id) in connections ?? [])
{
    if (Snapshot.Connections.TryGetValue(slot, out var current) && current == id) { continue; }
    foreach (var hook in storageHooks)
    { await hook.RequireRebindable(Snapshot.BrainScopeId ?? "", this.GetPrimaryKeyString(), slot, CancellationToken.None); }
}
```

```csharp
// TableStorageHook
public async Task RequireRebindable(string brainId, string appKey, string slot, CancellationToken cancellationToken)
{
    if (slot != TablePlacements.TablesSlot) { return; }
    if ((await Grains.GetGrain<ITableIndex>(new TableOwner(brainId, appKey).Key).ReadTables()).Length > 0)
    { throw new InvalidOperationException("The tables slot cannot be rebound while this app owns tables."); }
}
```

- [ ] **Step 4: Run** the Apps and Postgres suites. Expect PASS.
- [ ] **Step 5: Commit**: `Apps: storage hooks veto rebinding a slot their data depends on`.

### Task 6: Docs and seeing it run

**Files:** `src/DigitalBrain.Modules/Postgres/README.md` (replace the `ProvisionPerBrain`/capacity paragraph with Isolation and the `tables` slot), `CLAUDE.md` (Connectors section: one line on the `tables` slot), `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/Authoring/AgentPrompts.cs` (one line telling the Creator about the optional `tables` slot).

- [ ] **Step 1:** Edit the docs and the prompt line.
- [ ] **Step 2:** `aspire run` from `src/DigitalBrain.AppHost`. Wipe Azurite first, because `TableState` is reshaped. `list_resources`: all Healthy.
- [ ] **Step 3:** Through `digitalbrain-mcp`, Define a table in two brains and check that `postgres.table` state shows `BrainDatabase` with different names. Bind a test app's `tables` slot to a Postgres connection, Define, and read back `Connection(...)`. Rebind, and confirm the 409 refusal text.
- [ ] **Step 4:** `list_traces` / `list_structured_logs` show the Define spans against the expected database. Look for no `capacity` log lines.
- [ ] **Step 5:** Re-run the unit suites of every touched project (Framework, Platform, Postgres, Postgres Hosting, Apps, CSharp, Architecture). Commit: `Postgres: placement documented and verified live`.
