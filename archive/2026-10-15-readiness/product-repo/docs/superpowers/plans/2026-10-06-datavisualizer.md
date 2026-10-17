# DataVisualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove both invented query systems (the kernel `DigitalBrain.Data` layer and the Supabase live-table subsystem), thin `src/DigitalBrain` to the four words, and ship data views as a first-party OS app made of behaviors.

**Architecture:** Modules keep neurons and signals only. Postgres and Supabase answer parameterised SQL; Flutter renders tables and charts it is given and signals what the human typed. A first-party app `DataVisualizer` (`src/DigitalBrain.OS/Apps/DataVisualizer`) holds the views, runs SQL or LINQ, and rewrites UI neurons; it is the only place filtering, grouping and reactivity live. Kernel types that only existed because a module contract took a Framework shape move to Framework, and the contracts get their own input records.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains, Npgsql, file-based C# scripts (`#:project`), Flutter shell (Dart), xunit v3 facts over `ModuleTest.Create().WithModule<…>()`.

**Spec:** `docs/superpowers/specs/2026-10-06-datavisualizer-design.md`

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- Warnings are errors, nullable on, central package versions. No `/// <summary>` boilerplate.
- LSP first: before editing a symbol run `findReferences` on it; after editing, LSP diagnostics must be clean.
- Concrete arrays in grain state, never `IReadOnlyList`.
- No state compatibility work: reshape grain state freely, no migrations.
- A `*.Contracts` project references `DigitalBrain` and other `*.Contracts` projects only (`BoundaryFacts.ScriptVisibleContractsOnlyDependOnOtherContractsAndTheNeuronAbstractions`).
- Never raise a timeout or add polling to make a check pass.
- Commit after every task with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Shipped app tests (`tests.cs`) run in the live brain against the real host modules; scenarios must leave shared state as they found it and must not need a model.

## Review Focus

1. A filter value containing a quote or a semicolon must reach Postgres as a bound parameter, never as SQL text. Pinned by Task 5 (`ParametersAreBoundNotInterpolated`) and Task 9 scenario "Typing a filter value replaces the rows".
2. A behavior restart must rebuild the same windows without duplicating views or rows. Pinned by Task 9 scenario "Restarting the behaviors rebuilds the same windows".
3. A SQL view whose source is unreachable must leave the table showing the last rows plus an error card, never a blank table. Pinned by Task 9 scenario "An unreachable source keeps the last rows and reports the error" (uses an invalid table name so the error is deterministic).
4. The Assistant must still be able to open a Postgres table after the live-table system is removed. Pinned by Task 13 fact `ShowOpensADataVisualizerView`.
5. A `FieldKind` value the form does not know must still be refused with a `TypeValidationException` after the enum moves. Pinned by Task 19 fact `AnUnsupportedKindIsRejectedThroughTheFormContract`.

---

## File structure

**Stage 1 deletes** (no new files): `src/DigitalBrain/Data/*`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Data/*`, `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Data/RowSourceAddress.cs`, `…Postgres.Contracts/IPostgresRows.cs`, `…Postgres/Data/PostgresRowSourceNeuron.cs`, `…Supabase.Contracts/ISupabaseRows.cs`, `…Supabase/Data/SupabaseRowSourceNeuron.cs`, and four test files.

**Stage 2 creates**: `…Postgres.Contracts/PostgresParameter.cs`, `…Supabase.Contracts/Query/SupabaseParameter.cs`; modifies `PostgresQuery`, `SupabaseQuery`, both providers and neurons, `AppUiEndpoints`.

**Stage 3 creates** `src/DigitalBrain.OS/Apps/DataVisualizer/`: `app.json`, `app.spec.md`, `icon.svg`, `tests.cs`, `behaviors/views.cs`, `behaviors/runner.cs`, `behaviors/filters.cs`. Modifies `OsApps.cs`.

**Stage 4 deletes** the Supabase `Windows/` and `Table/` folders, `Query/QueryPlanCompiler`-adjacent files, `Postgres.Windows/PostgresTools.cs`, and the Dart `table_models.dart` filter UI; creates `…Assistant/DataViewTools.cs`.

**Stage 5 moves** `Enforcement/*`, `Types/*` to `DigitalBrain.Framework`; creates `src/DigitalBrain.Platform/DigitalBrain.Platform.Contracts/` for `Integrations/*`; adds `FormFieldKind`, `FormSecret` to `IForm.cs`; adds `AllowanceRequest` to Compute contracts.

---

# Stage 1. Delete the orphaned kernel data layer

### Task 1: Remove `Bind`, `SetView` and the read-through from the Flutter table and chart

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Table/ITable.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Chart/IChart.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Table/TableNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Chart/ChartNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/UiKit/UiKitEndpoints.cs:179-189`
- Delete: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Data/RowSourceAddress.cs`
- Delete: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Table/ViewFacts.cs`
- Test: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Table/TableFacts.cs` (create)

**Interfaces:**
- Produces: `ITable { Replace(string title, IReadOnlyList<TableColumn> columns, IReadOnlyList<IReadOnlyList<string>> rows); Read() }`, `TableState { Name, Version, Title, Columns, Rows }`; `IChart { Render, Append, Read }`, `ChartState { Name, Version, Title, Kind, Points }`. Stage 3 behaviors call exactly these.

- [ ] **Step 1: Write the failing fact**

```csharp
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Table;
using DigitalBrain.Testing.Module;
using Xunit;

namespace DigitalBrain.Modules.Flutter.Tests.Table;

public sealed class TableFacts
{
    [Fact]
    public async Task ReplaceIsTheWholeTableAndReadAnswersItBack()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<FlutterModule>().StartAsync(ct);
        var table = brain.Get<ITable>("grid");

        await table.Replace("People", [new("country", "Country"), new("n", "N")], [["us", "2"], ["uk", "1"]]);
        var read = await table.Read();

        Assert.Equal("People", read.Title);
        Assert.Equal(["country", "n"], read.Columns.Select(column => column.Id).ToArray());
        Assert.Equal(["us", "uk"], read.Rows.Select(row => row[0]).ToArray());
        Assert.Equal(1, read.Version);
        Assert.Equal(typeof(TableState).GetProperties().Select(p => p.Name).Order(), new[] { "Columns", "Name", "Rows", "Title", "Version" });
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests -- --filter-method "*ReplaceIsTheWholeTable*"`
Expected: FAIL on the property-list assertion (state still has `Sort`, `Filter`, `SourceNeuronId`, `Query`).

- [ ] **Step 3: Rewrite `ITable.cs`**

```csharp
using DigitalBrain;
using Orleans.Concurrency;

namespace DigitalBrain.Flutter.Table;

[Alias("table"), Orleans.Metadata.DefaultGrainType(UIVocabulary.TableType)]
public interface ITable : INeuron
{
    Task Replace(string title, IReadOnlyList<TableColumn> columns, IReadOnlyList<IReadOnlyList<string>> rows);
    [ReadOnly, Alias("read")] Task<TableState> Read();
}

[GenerateSerializer, Alias("ui.table-column")]
public sealed record TableColumn([property: Id(0)] string Id, [property: Id(1)] string Title);

[GenerateSerializer, Alias("ui.table-state")]
public sealed class TableState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public int Version { get; set; }
    [Id(2)] public string Title { get; set; } = "";
    [Id(3)] public List<TableColumn> Columns { get; set; } = [];
    [Id(4)] public List<List<string>> Rows { get; set; } = [];
}
```

- [ ] **Step 4: Rewrite `TableNeuron.cs`**

```csharp
using DigitalBrain;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Table.Signals;
using DigitalBrain.Framework;
using Orleans.Concurrency;
using Orleans.Runtime;

namespace DigitalBrain.Flutter.Table;

[GrainType(UIVocabulary.TableType)]
internal sealed class TableNeuron([PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<TableState> store)
    : Neuron<TableState>(store), ITable
{
    public Task Replace(string title, IReadOnlyList<TableColumn> columns, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentNullException.ThrowIfNull(columns);
        ArgumentNullException.ThrowIfNull(rows);
        var next = Snapshot;
        next.Name = this.GetPrimaryKeyString();
        next.Version++;
        next.Title = title.Trim();
        next.Columns = [.. columns];
        next.Rows = [.. rows.Select(row => row.ToList())];
        return Save(next, new TableChanged(this.GetPrimaryKeyString(), next.Version));
    }

    [ReadOnly]
    public Task<TableState> Read()
    {
        var state = Snapshot;
        state.Name = this.GetPrimaryKeyString();
        return Task.FromResult(state);
    }
}
```

- [ ] **Step 5: Edit `IChart.cs` and `ChartNeuron.cs`**

In `IChart.cs` delete the `Bind` line and the `SourceNeuronId`/`Query` properties (`Id(5)`, `Id(6)`), and the `using DigitalBrain.Data;`. In `ChartNeuron.cs` delete `using System.Globalization;`, `using DigitalBrain.Data;`, the two `next.SourceNeuronId = null; next.Query = null;` pairs, the whole `Bind` method, and replace `Read` with:

```csharp
    [ReadOnly]
    public Task<ChartState> Read()
    {
        var state = Snapshot;
        state.Name = this.GetPrimaryKeyString();
        return Task.FromResult(state);
    }
```

- [ ] **Step 6: Remove the `tables/{name}/view` route and `TableView` record**

In `UiKitEndpoints.cs` delete the `UiHttp.MapPost(endpoints, "tables/{name}/view", …)` block (five lines ending `});`). Run `findReferences` on `TableView` in the same file; delete its record declaration if nothing else uses it.

- [ ] **Step 7: Delete `RowSourceAddress.cs` and `ViewFacts.cs`**

```bash
git rm src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Data/RowSourceAddress.cs
git rm src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Table/ViewFacts.cs
```

- [ ] **Step 8: Build and run the Flutter suite**

Run: `dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj` then `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests`
Expected: build clean, all facts pass including `ReplaceIsTheWholeTableAndReadAnswersItBack`.

- [ ] **Step 9: Commit**

```bash
git add -A src/DigitalBrain.Modules/Google/Flutter
git commit -m "Flutter: tables and charts are sinks; Bind and SetView leave the contracts"
```

### Task 2: Remove the Postgres and Supabase row-source neurons

**Files:**
- Delete: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/IPostgresRows.cs`
- Delete: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Data/PostgresRowSourceNeuron.cs`
- Delete: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresRowSourceFacts.cs`
- Delete: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/ISupabaseRows.cs`
- Delete: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Data/SupabaseRowSourceNeuron.cs`
- Delete: `src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests/SupabaseRowSourceFacts.cs`

- [ ] **Step 1: Map references**

Run LSP `findReferences` on `IPostgresRows` and `ISupabaseRows`. Expected: only their own files, the neurons, the two fact files, and possibly a `ConnectorDefinition.Neurons` array in `PostgresModule.cs` / `SupabaseModule.cs`. If a module's `Connector` lists them, remove the entry.

- [ ] **Step 2: Delete the six files**

```bash
git rm src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/IPostgresRows.cs \
       src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Data/PostgresRowSourceNeuron.cs \
       src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresRowSourceFacts.cs \
       src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/ISupabaseRows.cs \
       src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Data/SupabaseRowSourceNeuron.cs \
       src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests/SupabaseRowSourceFacts.cs
```

- [ ] **Step 3: Build and test both modules**

Run:
```bash
dotnet build src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/DigitalBrain.Modules.Postgres.csproj
dotnet build src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/DigitalBrain.Modules.Supabase.csproj
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
```
Expected: clean builds, green suites.

- [ ] **Step 4: Commit**

```bash
git commit -am "Postgres, Supabase: the row-source neurons leave; SQL is the only query"
```

### Task 3: Delete the Framework data folder and the kernel `Data` namespace

**Files:**
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Data/StoredRowsNeuron.cs`, `RowQueryEvaluator.cs`, `RowQuerySql.cs`, `RowCells.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Data/StoredRowsFacts.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Sdk/Data/RowQuerySqlFacts.cs`
- Delete: `src/DigitalBrain/Data/IRowSource.cs`, `RowQuery.cs`, `RowSchema.cs`, `SourceCapabilities.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/ScriptEdgeFacts.cs:226-240`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs:28`
- Modify: `src/DigitalBrain/DigitalBrain.csproj` description

- [ ] **Step 1: Confirm nothing else references the namespace**

Run LSP `workspaceSymbol` for `RowQuery`, `IRowSource`, `IStoredRows`, `RowsReplaced`. Expected hits only in the files listed above. If another hit appears, stop and treat it as a Task 1 or 2 omission.

- [ ] **Step 2: Delete the ten files**

```bash
git rm -r src/DigitalBrain.Framework/DigitalBrain.Framework/Data \
          src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Data \
          src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Sdk/Data \
          src/DigitalBrain/Data
```

- [ ] **Step 3: Rewrite the script-edge fact**

Replace `RowSourcesAndScriptAccountsAreVisibleAndTheCredentialRegistryIsNot` in `ScriptEdgeFacts.cs` with:

```csharp
    [Fact]
    public void ScriptAccountsAreVisibleAndTheCredentialRegistryIsNot()
    {
        var contracts = new ScriptContracts([
            typeof(DigitalBrain.Integrations.IConnectionRequests).Assembly,
            typeof(DigitalBrain.Framework.Platform.Integrations.Accounts.IConnectionRegistry).Assembly,
        ]);

        Assert.Equal(
            typeof(DigitalBrain.Integrations.IConnectionRequests),
            contracts.Find(typeof(DigitalBrain.Integrations.IConnectionRequests).FullName!));
        Assert.Throws<ArgumentException>(() => contracts.Find(typeof(DigitalBrain.Framework.Platform.Integrations.Accounts.IConnectionRegistry).FullName!));
    }
```

- [ ] **Step 4: Narrow the vocabulary namespaces**

In `VocabularyRingFacts.cs` change line 28 to:

```csharp
        ["DigitalBrain", "DigitalBrain.Integrations", "DigitalBrain.Types", "DigitalBrain.Enforcement"];
```

- [ ] **Step 5: Fix the kernel description**

In `src/DigitalBrain/DigitalBrain.csproj` the `<Description>` already says `Neuron, signal, subscription, observer, and brain.`; leave it. Remove `using Orleans;` from `src/DigitalBrain/Types/TypeValidationException.cs` (LSP reports it as a redundant global using).

- [ ] **Step 6: Build and test every touched project**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: all green. `VocabularyRingFacts.VocabularyTypesLiveOnlyInTheVocabularyNamespaces` passes with the shorter list.

- [ ] **Step 7: Commit**

```bash
git commit -am "Kernel: the Data namespace leaves; no declarative query crosses a contract"
```

### Task 4: Remove the dead Dart table-client methods

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart:254-298`

- [ ] **Step 1: Confirm there are no callers**

Run: `grep -rn "readTable\b\|createTable\b\|updateTableView\b" src/DigitalBrain.Modules/Google/Flutter/app --include=*.dart`
Expected: only the three definitions in `ui_client.dart`.

- [ ] **Step 2: Delete `readTable`, `createTable`, `updateTableView`**

Remove the three methods (the block from `Future<TableSnapshot> readTable(` through the closing `);` of `updateTableView`). Keep `readWorkspaceTable` and `updateWorkspaceTable`; Stage 4 removes those.

- [ ] **Step 3: Analyze and test the shell**

Run from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter analyze` then `flutter test`
Expected: no issues, tests green.

- [ ] **Step 4: Commit**

```bash
git commit -am "Shell: drop the unreachable /ui/tables client methods"
```

---

# Stage 2. Module primitives

### Task 5: Parameterised Postgres queries

**Files:**
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/PostgresParameter.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/PostgresQuery.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/IPostgresProvider.cs` (find via `goToDefinition` on `IPostgresProvider`)
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresProvider.cs:11-21`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresServerNeuron.cs:10-21`
- Modify: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresTestControls.cs`
- Test: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresFacts.cs`

**Interfaces:**
- Produces: `PostgresParameter(string Name, string? Value)`; `PostgresQuery(string Sql, int MaxRows = 200, PostgresParameter[]? Parameters = null)`; `IPostgresProvider.QueryAsync(string sql, int maxRows, IReadOnlyList<PostgresParameter> parameters, CancellationToken ct)`. Parameters are positional in SQL (`$1`, `$2`, …) in the order given; `Name` is documentation for the caller. Stage 3 `runner.cs` depends on this signature.

- [ ] **Step 1: Write the failing facts**

Add to `PostgresFacts.cs`:

```csharp
    [Fact]
    public async Task ParametersAreBoundNotInterpolated()
    {
        await using var brain = await StartAsync();
        var result = await brain.Get<IPostgresServer>("default")
            .Query(new("select id from people where country = $1", 10, [new("country", "u's; drop table people")]));
        Assert.Equal(1, result.RowCount);
    }

    [Fact]
    public async Task MoreThanSixteenParametersAreRejected()
    {
        await using var brain = await StartAsync();
        var many = Enumerable.Range(0, 17).Select(i => new PostgresParameter($"p{i}", "x")).ToArray();
        await Assert.ThrowsAsync<PostgresQueryException>(() => brain.Get<IPostgresServer>("default").Query(new("select 1", 10, many)));
    }
```

Extend `PostgresTestControls.QueryAsync` to the new signature and assert the parameter arrives intact:

```csharp
    public Task<PostgresQueryResult> QueryAsync(string sql, int maxRows, IReadOnlyList<PostgresParameter> parameters, CancellationToken cancellationToken)
    {
        Assert.Equal(10, maxRows);
        if (parameters.Count == 1)
        {
            Assert.Equal("select id from people where country = $1", sql);
            Assert.Equal("u's; drop table people", parameters[0].Value);
        }
        else { Assert.Equal("select id from people", sql); }
        return Task.FromResult(new PostgresQueryResult([new("id", "int4", "number")], [["7"]], 1, false, 0));
    }
```

- [ ] **Step 2: Run to see them fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests -- --filter-method "*Parameters*"`
Expected: compile failure (`PostgresParameter` undefined).

- [ ] **Step 3: Add the contract**

`PostgresParameter.cs`:

```csharp
namespace DigitalBrain.Postgres;

// Positional: the n-th parameter binds $n. Value is text; PostgreSQL casts it where the SQL says so.
[GenerateSerializer, Alias("db.postgres.parameter")]
public sealed record PostgresParameter([property: Id(0)] string Name, [property: Id(1)] string? Value);
```

`PostgresQuery.cs`:

```csharp
namespace DigitalBrain.Postgres;

[GenerateSerializer]
[Alias("db.postgres.query")]
public sealed record PostgresQuery(
    [property: Id(0)] string Sql,
    [property: Id(1)] int MaxRows = PostgresQuery.DefaultMaxRows,
    [property: Id(2)] PostgresParameter[]? Parameters = null)
{
    public const int DefaultMaxRows = 200;
    public const int MaxRowsLimit = 1000;
    public const int MaxParameters = 16;
}
```

- [ ] **Step 4: Thread parameters through provider and neuron**

In `IPostgresProvider` change the query signature to `Task<PostgresQueryResult> QueryAsync(string sql, int maxRows, IReadOnlyList<PostgresParameter> parameters, CancellationToken cancellationToken);`.

In `PostgresProvider.QueryAsync` replace the body's `ReadAsync` call:

```csharp
    public async Task<PostgresQueryResult> QueryAsync(string sql, int maxRows, IReadOnlyList<PostgresParameter> parameters, CancellationToken cancellationToken)
    {
        sql = PostgresQueryGuard.Normalize(sql);
        ArgumentOutOfRangeException.ThrowIfLessThan(maxRows, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(maxRows, PostgresQuery.MaxRowsLimit);
        var started = Stopwatch.GetTimestamp();
        // The page limit binds after the caller's parameters so $1..$n in the SQL keep their meaning.
        var bound = parameters.Select(parameter => parameter.Value is null ? DBNull.Value : (object)parameter.Value).Append(maxRows + 1).ToArray();
        var (columns, rows, _) = await ReadAsync($"SELECT * FROM ({sql}) AS q LIMIT ${bound.Length}", bound, maxRows + 1, cancellationToken).ConfigureAwait(false);
        var truncated = rows.Count > maxRows;
        var page = rows.Take(maxRows).ToArray();
        return new(columns, page, page.Length, truncated, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
    }
```

In `PostgresServerNeuron.Query` add before the guard call:

```csharp
        var parameters = query.Parameters ?? [];
        if (parameters.Length > PostgresQuery.MaxParameters)
        {
            throw new PostgresQueryException($"A query takes at most {PostgresQuery.MaxParameters} parameters.");
        }
```

and change the return to `return provider.QueryAsync(sql, query.MaxRows, parameters, CancellationToken.None);`.

Run `findReferences` on `IPostgresProvider.QueryAsync` and update every other caller (Postgres.Windows `PostgresIntegrationLiveSource`, any inventory provider) to pass `[]`.

- [ ] **Step 5: Run the Postgres suite**

Run: `dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: green, including the two new facts.

- [ ] **Step 6: Commit**

```bash
git add -A src/DigitalBrain.Modules/Postgres
git commit -m "Postgres: Query takes bound parameters"
```

### Task 6: Parameterised Supabase queries

**Files:**
- Create: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/Query/SupabaseParameter.cs`
- Modify: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/Query/SupabaseQuery.cs`
- Modify: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Query/ISupabaseProvider.cs`, `SupabaseProvider.cs:10-20`, `SupabaseNeuron.cs:19-43`
- Modify: `src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests/FakeSupabaseProvider.cs`
- Test: `src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests/Query/SupabaseQueryFacts.cs`

**Interfaces:**
- Produces: `SupabaseParameter(string Name, string? Value)`, `SupabaseQuery(string Sql, int MaxRows = 200, SupabaseParameter[]? Parameters = null)`, `ISupabaseProvider.QueryAsync(string sql, int maxRows, IReadOnlyList<SupabaseParameter> parameters, CancellationToken ct)`.

- [ ] **Step 1: Write the failing fact** in `SupabaseQueryFacts.cs`, mirroring Task 5:

```csharp
    [Fact]
    public async Task ParametersReachTheProviderUnchanged()
    {
        var ct = TestContext.Current.CancellationToken;
        var provider = new FakeSupabaseProvider();
        await using var brain = await ModuleTest.Create().WithModule<SupabaseModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<ISupabaseProvider>(provider)).StartAsync(ct);
        await brain.Get<ISupabase>("default").Query(new("select 1 where $1 = 'a'", 5, [new("x", "it's")]));
        Assert.Equal("it's", Assert.Single(provider.LastParameters).Value);
    }
```

Add `public IReadOnlyList<SupabaseParameter> LastParameters { get; private set; } = [];` to `FakeSupabaseProvider` and record it in `QueryAsync`. Match how the existing facts in that file obtain a brain with the fake; copy their `ConfigureSilo` form if it differs.

- [ ] **Step 2: Run to see it fail**; expected compile failure.

- [ ] **Step 3: Implement**, same shape as Task 5: `SupabaseParameter` record with alias `db.supabase.parameter`, `Parameters` on `SupabaseQuery` with `MaxParameters = 16`, provider binding `bound = parameters…Append(maxRows + 1)` and `LIMIT ${bound.Length}`, neuron check on count. Update every `ISupabaseProvider.QueryAsync` caller found by `findReferences` to pass `[]`.

- [ ] **Step 4: Run** `dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests`; expected green.

- [ ] **Step 5: Commit** `git commit -am "Supabase: Query takes bound parameters"`.

### Task 7: App surfaces can embed tables and charts

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs:40-57`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/composition/neuron_view.dart` (the `switch (widget.kind)` at ~line 270)
- Test: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/AppUiRouteFacts.cs`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/ui/test/neuron_view_table_test.dart` (create)

**Interfaces:**
- Produces: `GET /brains/{id}/apps/node?kind=table&name=…` answers `TableState` JSON; `kind=chart` answers `ChartState` JSON. Stage 3 surfaces use `new UiChildRef("table", name)` and `new UiChildRef("chart", name)`.

- [ ] **Step 1: Write the failing route fact**

Open `AppUiRouteFacts.cs`, copy the existing fact that reads a `card` node through the route (it shows how the test host stamps the caller and builds the URL), and add:

```csharp
    [Fact]
    public async Task ATableAndAChartUnderAppsAreReadableAsAppNodes()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<FlutterModule>().StartAsync(ct);
        var scope = await brain.AuthorizeCallerAsync();
        await brain.Get<ITable>(scope + "/apps/dv/grid").Replace("People", [new("c", "Country")], [["us"]]);
        await brain.Get<IChart>(scope + "/apps/dv/pie").Render("Share", "pie", [new("1", "us", 2)]);

        var table = await brain.Http.GetFromJsonAsync<JsonElement>($"/brains/{scope}/apps/node?kind=table&name={Uri.EscapeDataString(scope + "/apps/dv/grid")}", ct);
        var chart = await brain.Http.GetFromJsonAsync<JsonElement>($"/brains/{scope}/apps/node?kind=chart&name={Uri.EscapeDataString(scope + "/apps/dv/pie")}", ct);

        Assert.Equal("People", table.GetProperty("title").GetString());
        Assert.Equal("pie", chart.GetProperty("kind").GetString());
    }
```

Use the same HTTP helper the neighbouring facts use (`brain.Http` or `ModuleHttpEdge`); the names above follow the existing fact in that file.

- [ ] **Step 2: Run to see it fail**: `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests -- --filter-method "*AppNodes*"`; expected 400 "Unknown app UI kind."

- [ ] **Step 3: Add the two kinds**

In `AppUiEndpoints.cs` add usings `using DigitalBrain.Flutter.Chart;` and `using DigitalBrain.Flutter.Table;`, and two switch arms after `"form"`:

```csharp
                "table" => Results.Ok(await brain.Get<ITable>(name).Read().WaitAsync(ct)),
                "chart" => Results.Ok(await brain.Get<IChart>(name).Read().WaitAsync(ct)),
```

- [ ] **Step 4: Run the fact**; expected PASS.

- [ ] **Step 5: Render the kinds in the shell**

In `neuron_view.dart`, inside `switch (widget.kind)`, add before `case 'card':`:

```dart
      case 'table':
        final columns = (definition['columns'] as List? ?? []).whereType<Map>().toList();
        final rows = (definition['rows'] as List? ?? []).whereType<List>().toList();
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            columns: [
              for (final column in columns) DataColumn(label: Text('${column['title'] ?? column['id']}')),
            ],
            rows: [
              for (final row in rows)
                DataRow(cells: [for (final cell in row) DataCell(Text('$cell'))]),
            ],
          ),
        );
      case 'chart':
        return UiChart(part: UiChartPart.fromMetadata(definition));
```

`UiChart` and `UiChartPart` already exist (`ui/lib/src/components/chart/ui_chart.dart`, `ui/lib/src/models/ui_part.dart`); import them. If `UiChartPart.fromMetadata` expects keys `title`, `chartKind`, `points`, map `definition['kind']` to `chartKind` before calling it.

- [ ] **Step 6: Write the Dart widget test** `neuron_view_table_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:digitalbrain_ui/src/composition/neuron_view.dart';

void main() {
  testWidgets('a table node renders its columns and rows', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: NeuronView(
        kind: 'table',
        name: 'w/apps/dv/grid',
        load: (_, _) async => {
          'title': 'People',
          'columns': [{'id': 'c', 'title': 'Country'}],
          'rows': [['us'], ['uk']],
        },
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Country'), findsOneWidget);
    expect(find.text('uk'), findsOneWidget);
  });
}
```

Use the package name the `ui` package declares in its `pubspec.yaml`.

- [ ] **Step 7: Analyze and test**: `flutter analyze` and `flutter test` in `app/ui` and `app/shell`; expected clean.

- [ ] **Step 8: Commit** `git commit -am "Flutter: app surfaces embed table and chart neurons"`.

---

# Stage 3. DataVisualizer app

Views are kept in one `IText` neuron per app (`{app}/views`) holding a JSON array, the same pattern the Assistant uses for its conversation id. State lives in a neuron; behaviors rebuild from it on every start.

**Shared shapes** (duplicated verbatim at the top of each behavior and `tests.cs`, since scripts share no code):

```csharp
// A view: what to run and where to show it. Kind is "table" or "chart"; Source is "sql" (platform
// Postgres via IPostgresServer "default") or "apptable:<tableId>" (an app-owned postgres.table read
// with Page and filtered in memory). Filters name the columns the person can filter by; each one
// is a TextField neuron whose value binds $1..$n in order, or an equality predicate for app tables.
sealed record View(string Id, string Title, string Kind, string Source, string Sql, string[] Filters, int RefreshSeconds);
```

Neuron names, all under the app key `A = brain.Setting("App")`:

| Neuron | Name |
|--------|------|
| view registry | `A/views` (`IText`, JSON array of `View`) |
| per-view filter field | `A/views/{id}/filter/{column}` (`ITextField`) |
| per-view table | `A/views/{id}/table` (`ITable`) |
| per-view chart | `A/views/{id}/chart` (`IChart`) |
| per-view status card | `A/views/{id}/status` (`ICard`) |
| per-view layout | `A/views/{id}/layout` (`ILayout`) |
| per-view surface | `A/views/{id}/surface` (`ISurface`) |
| per-view reminder | `A/views/{id}/refresh` (`IReminder`) |
| app surface | `A/surface`, `A/main` |

### Task 8: Spec, manifest and icon

**Files:**
- Create: `src/DigitalBrain.OS/Apps/DataVisualizer/app.json`, `app.spec.md`, `icon.svg`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs:52`

- [ ] **Step 1: Write `app.json`**

```json
{
  "name": "datavisualizer",
  "title": "Data Visualizer",
  "description": "Live tables and charts over your data: SQL or app tables, filtered from the UI.",
  "version": "1.0.0",
  "icon": "icon.svg",
  "operations": [
    { "name": "open", "description": "Compose the app surface listing every view." },
    { "name": "show", "description": "Create a view from JSON {title, kind: table|chart, source: sql|apptable:<id>, sql, filters: [column], refreshSeconds} and answer its id and window." },
    { "name": "refine", "description": "Set filter values for a view: JSON {view, filters: {column: value}}. Re-runs the view." },
    { "name": "read", "description": "Answer a view's current columns and rows as JSON: input is the view id." },
    { "name": "close", "description": "Remove a view and its window: input is the view id." }
  ],
  "settings": []
}
```

- [ ] **Step 2: Write `app.spec.md`**

```markdown
# Data Visualizer

A view is a program: one SQL statement against the brain's Postgres, or one app-owned table, shown
as a table or a chart. Filters are parameters of that program, never text pasted into it. Every
view has its own window: filter fields on top, the table or chart below, and a status line. Views
live in the app's registry neuron, so restarting the app rebuilds every window exactly once.

## Scenario: Showing a SQL view opens a window with the rows

Invoking "show" with a table view over `select * from (values ('us', 2), ('uk', 1)) as t(country, n)`
answers a view id and a window naming the view's surface; the view's table then holds two rows with
columns country and n.

## Scenario: Typing a filter value replaces the rows

Given a view whose SQL is `select * from (values ('us', 2), ('uk', 1)) as t(country, n) where country = $1`
with filter column country, setting the country filter field to `uk` leaves exactly one row, `uk`,
and setting it to `u's; drop table t` leaves no rows and no error.

## Scenario: A chart view renders points from an aggregate query

Invoking "show" with a chart view over `select country, sum(n) from (values ('us', 2), ('us', 3), ('uk', 1)) as t(country, n) group by 1 order by 1`
yields a bar chart with two points: uk → 1 and us → 5.

## Scenario: Changing an app table re-renders its view

Given a table view over an app-owned table `sample` with columns id, country, inserting a row
through the table neuron adds it to the view's table without any invocation.

## Scenario: Restarting the behaviors rebuilds the same windows

After two views exist, invoking "open" twice answers the same two view ids each time, and each
view's surface revision changes at most once more.

## Scenario: An unreachable source keeps the last rows and reports the error

Given a view that has rendered rows, refining it so the SQL targets a table that does not exist
leaves the previous rows in place and sets the status card's body to the error.

## Scenario: Closing a view removes it

Invoking "close" with a view id removes it from the registry, and "read" for that id answers an error.

## Scenario (live): A platform table shows live data

With a real Postgres connection, a view over `select * from information_schema.tables limit 5`
renders five rows.
```

- [ ] **Step 3: Write `icon.svg`** (copy `src/DigitalBrain.OS/Apps/Assistant/icon.svg` and change its shape to three vertical bars):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
```

- [ ] **Step 4: Register the default**

In `OsApps.cs` change the defaults array to:

```csharp
            foreach (var app in new[] { new OsApp("os", "settings"), new OsApp("os", "assistant"), new OsApp("os", "datavisualizer") })
```

- [ ] **Step 5: Commit** `git add src/DigitalBrain.OS && git commit -m "DataVisualizer: manifest, spec and default registration"`.

### Task 9: `tests.cs`

**Files:**
- Create: `src/DigitalBrain.OS/Apps/DataVisualizer/tests.cs`

- [ ] **Step 1: Write the test script**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
#:project /brain/src/Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/DigitalBrain.Modules.Postgres.Contracts.csproj
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Card;
using DigitalBrain.Flutter.Chart;
using DigitalBrain.Flutter.Surface;
using DigitalBrain.Flutter.Table;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Postgres.Tables;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var failures = 0;
const string Values = "select * from (values ('us', 2), ('uk', 1)) as t(country, n)";

await Scenario("Showing a SQL view opens a window with the rows", async () =>
{
    var shown = await Show(new { title = "People", kind = "table", source = "sql", sql = Values, filters = Array.Empty<string>() });
    var id = shown.GetProperty("view").GetString()!;
    try
    {
        var surface = shown.GetProperty("window").GetProperty("surface").GetString()!;
        if ((await brain.Get<ISurface>(surface).Read()).Definition.Title != "People") { throw new InvalidOperationException("The window surface is not titled after the view."); }
        var table = await WaitTable(id, rows => rows.Count == 2);
        if (table.Columns.Select(c => c.Id).SequenceEqual(["country", "n"]) is false) { throw new InvalidOperationException("Columns were not country, n."); }
    }
    finally { await Ask("close", id); }
});

await Scenario("Typing a filter value replaces the rows", async () =>
{
    var shown = await Show(new { title = "People", kind = "table", source = "sql", sql = Values + " where country = $1", filters = new[] { "country" } });
    var id = shown.GetProperty("view").GetString()!;
    try
    {
        var filter = brain.Get<ITextField>($"{appKey}/views/{id}/filter/country");
        await filter.Input("uk");
        var table = await WaitTable(id, rows => rows.Count == 1 && rows[0][0] == "uk");
        await filter.Input("u's; drop table t");
        await WaitTable(id, rows => rows.Count == 0);
        var status = (await brain.Get<ICard>($"{appKey}/views/{id}/status").Read()).Body;
        if (status.Contains("error", StringComparison.OrdinalIgnoreCase)) { throw new InvalidOperationException("A quoted filter value raised an error: " + status); }
    }
    finally { await Ask("close", id); }
});

await Scenario("A chart view renders points from an aggregate query", async () =>
{
    var shown = await Show(new { title = "Share", kind = "chart", source = "sql", sql = "select country, sum(n) from (values ('us', 2), ('us', 3), ('uk', 1)) as t(country, n) group by 1 order by 1", filters = Array.Empty<string>() });
    var id = shown.GetProperty("view").GetString()!;
    try
    {
        var chart = await Wait(() => brain.Get<IChart>($"{appKey}/views/{id}/chart").Read(), state => state.Points.Count == 2);
        if (chart.Points[0].Label != "uk" || chart.Points[0].Value != 1 || chart.Points[1].Value != 5) { throw new InvalidOperationException("The chart points are not uk→1, us→5."); }
    }
    finally { await Ask("close", id); }
});

await Scenario("Changing an app table re-renders its view", async () =>
{
    var sample = brain.Get<ITable>(appKey + "/sample");
    await sample.Define(new([new("id", "text"), new("country", "text")], ["id"]));
    await sample.Upsert([new("id", "\"1\"")], [new("country", "\"us\"")]);
    var shown = await Show(new { title = "Sample", kind = "table", source = "apptable:" + appKey + "/sample", sql = "", filters = Array.Empty<string>() });
    var id = shown.GetProperty("view").GetString()!;
    try
    {
        await WaitTable(id, rows => rows.Count == 1);
        await sample.Upsert([new("id", "\"2\"")], [new("country", "\"uk\"")]);
        await WaitTable(id, rows => rows.Count == 2);
    }
    finally { await Ask("close", id); await sample.Delete([new("id", "\"1\"")]); await sample.Delete([new("id", "\"2\"")]); }
});

await Scenario("Restarting the behaviors rebuilds the same windows", async () =>
{
    var a = (await Show(new { title = "A", kind = "table", source = "sql", sql = Values, filters = Array.Empty<string>() })).GetProperty("view").GetString()!;
    var b = (await Show(new { title = "B", kind = "table", source = "sql", sql = Values, filters = Array.Empty<string>() })).GetProperty("view").GetString()!;
    try
    {
        var first = JsonDocument.Parse(await Ask("open", "")).RootElement.GetProperty("views").EnumerateArray().Select(v => v.GetProperty("id").GetString()).ToArray();
        var revision = (await brain.Get<ISurface>($"{appKey}/views/{a}/surface").Read()).Revision;
        var second = JsonDocument.Parse(await Ask("open", "")).RootElement.GetProperty("views").EnumerateArray().Select(v => v.GetProperty("id").GetString()).ToArray();
        if (!first.SequenceEqual(second) || !first.Contains(a) || !first.Contains(b)) { throw new InvalidOperationException("Reopening changed the view list."); }
        var after = (await brain.Get<ISurface>($"{appKey}/views/{a}/surface").Read()).Revision;
        if (after > revision + 1) { throw new InvalidOperationException("Reopening recomposed a view more than once."); }
    }
    finally { await Ask("close", a); await Ask("close", b); }
});

await Scenario("An unreachable source keeps the last rows and reports the error", async () =>
{
    var shown = await Show(new { title = "People", kind = "table", source = "sql", sql = Values, filters = Array.Empty<string>() });
    var id = shown.GetProperty("view").GetString()!;
    try
    {
        await WaitTable(id, rows => rows.Count == 2);
        await Ask("refine", JsonSerializer.Serialize(new { view = id, sql = "select * from table_that_does_not_exist_9f3" }));
        var status = await Wait(() => brain.Get<ICard>($"{appKey}/views/{id}/status").Read(), card => card.Body.Length > 0 && !card.Body.StartsWith("ok", StringComparison.Ordinal));
        if ((await brain.Get<ITable>($"{appKey}/views/{id}/table").Read()).Rows.Count != 2) { throw new InvalidOperationException("The previous rows were lost."); }
    }
    finally { await Ask("close", id); }
});

await Scenario("Closing a view removes it", async () =>
{
    var id = (await Show(new { title = "Gone", kind = "table", source = "sql", sql = Values, filters = Array.Empty<string>() })).GetProperty("view").GetString()!;
    await Ask("close", id);
    try { await Ask("read", id); throw new InvalidOperationException("Reading a closed view succeeded."); }
    catch (InvalidOperationException error) when (error.Message.Contains("No view", StringComparison.Ordinal)) { }
});

await Scenario("(live) A platform table shows live data", async () =>
{
    var id = (await Show(new { title = "Tables", kind = "table", source = "sql", sql = "select table_name from information_schema.tables limit 5", filters = Array.Empty<string>() })).GetProperty("view").GetString()!;
    try { await WaitTable(id, rows => rows.Count == 5); }
    finally { await Ask("close", id); }
});

return failures == 0 ? 0 : 1;

async Task<JsonElement> Show(object view) => JsonDocument.Parse(await Ask("show", JsonSerializer.Serialize(view))).RootElement;

async Task<TableState> WaitTable(string id, Func<List<List<string>>, bool> ready)
    => await Wait(() => brain.Get<ITable>($"{appKey}/views/{id}/table").Read(), state => ready(state.Rows));

// Views render asynchronously after a signal; a scenario waits for the state it expects, bounded.
async Task<T> Wait<T>(Func<Task<T>> read, Func<T, bool> ready)
{
    var deadline = DateTimeOffset.UtcNow.AddSeconds(30);
    while (true)
    {
        var state = await read();
        if (ready(state)) { return state; }
        if (DateTimeOffset.UtcNow > deadline) { throw new TimeoutException("The view did not reach the expected state."); }
        await Task.Delay(200);
    }
}

async Task Scenario(string name, Func<Task> run)
{
    try { await run(); Console.WriteLine($"dbtest:pass {name}"); }
    catch (Exception error) { failures++; Console.WriteLine($"dbtest:fail {name}\t{error.Message.ReplaceLineEndings(" ")}"); }
}

async Task<string> Ask(string operation, string input)
{
    var invocation = await app.Invoke(new InvokeApp(Guid.NewGuid(), operation, input));
    var deadline = DateTimeOffset.UtcNow.AddMinutes(5);
    while (invocation.Status == InvocationStatus.Pending)
    {
        if (DateTimeOffset.UtcNow > deadline) { throw new TimeoutException("The app did not answer within 5 minutes."); }
        await Task.Delay(200);
        invocation = await app.ReadInvocation(invocation.Id);
    }
    if (invocation.Status == InvocationStatus.Failed) { throw new InvalidOperationException(invocation.Error ?? "The app failed."); }
    return invocation.Output ?? "";
}
```

- [ ] **Step 2: Compile-check the script through the sandbox checker**

Run the CSharp script check the way `CSharpScriptCheckFacts` does, or simply `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` (the file is an embedded resource, so this only confirms packaging). The real compile happens in Task 12.

- [ ] **Step 3: Commit** `git add src/DigitalBrain.OS/Apps/DataVisualizer/tests.cs && git commit -m "DataVisualizer: scenarios"`.

### Task 10: `behaviors/views.cs` (operations, registry, windows)

**Files:**
- Create: `src/DigitalBrain.OS/Apps/DataVisualizer/behaviors/views.cs`

**Interfaces:**
- Produces: the registry JSON in `A/views`; a `ViewChanged`-style trigger for the runner is the `TextChanged` signal of `A/views` itself (`IText` publishes a changed signal on `Set`; confirm its name with `workspaceSymbol TextChanged` and use that type in `runner.cs`).

- [ ] **Step 1: Write the behavior**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
#:project /brain/src/Modules/Time/DigitalBrain.Modules.Time.Contracts/DigitalBrain.Modules.Time.Contracts.csproj
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Card;
using DigitalBrain.Flutter.Layout;
using DigitalBrain.Flutter.Surface;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Time.Reminders;

sealed record View(string Id, string Title, string Kind, string Source, string Sql, string[] Filters, int RefreshSeconds);

// Operations and the registry. Every window is derived from the registry, so composing is
// idempotent: the same view composes the same neurons with the same content.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var registry = brain.Get<IText>(appKey + "/views");
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);

await foreach (var invoked in app.Invocations(brain, brain.Stopping))
{
    try { await app.Respond(new AppResponse(invoked.InvocationId, await Answer(invoked.Operation, invoked.Input), null)); }
    catch (Exception error) { await app.Respond(new AppResponse(invoked.InvocationId, null, error.Message)); }
}

async Task<string> Answer(string operation, string input)
{
    switch (operation)
    {
        case "open":
        {
            var views = await Views();
            foreach (var view in views) { await Compose(view); }
            await ComposeHome(views);
            return JsonSerializer.Serialize(new { id = appKey + "/window", title = "Data Visualizer", surface = appKey + "/surface", views = views.Select(v => new { v.Id, v.Title, v.Kind }) }, json);
        }
        case "show":
        {
            var request = JsonSerializer.Deserialize<JsonElement>(input);
            var kind = request.GetProperty("kind").GetString() is "chart" ? "chart" : "table";
            var source = request.GetProperty("source").GetString() ?? "sql";
            if (source != "sql" && !source.StartsWith("apptable:", StringComparison.Ordinal)) { throw new ArgumentException("source is sql or apptable:<tableId>."); }
            var sql = request.TryGetProperty("sql", out var s) ? s.GetString() ?? "" : "";
            if (source == "sql" && sql.Length is 0 or > 20_000) { throw new ArgumentException("A SQL view needs 1-20000 characters of SQL."); }
            var filters = request.TryGetProperty("filters", out var f) ? f.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).Take(16).ToArray() : [];
            var refresh = request.TryGetProperty("refreshSeconds", out var r) && r.TryGetInt32(out var seconds) ? Math.Clamp(seconds, 0, 86_400) : 0;
            var view = new View("v-" + Guid.NewGuid().ToString("N")[..12], request.GetProperty("title").GetString() ?? "View", kind, source, sql, filters, refresh);
            var views = (await Views()).Append(view).ToArray();
            await Compose(view);
            await Save(views);
            await ComposeHome(views);
            return JsonSerializer.Serialize(new { view = view.Id, window = new { id = $"{appKey}/views/{view.Id}/window", title = view.Title, surface = $"{appKey}/views/{view.Id}/surface" } }, json);
        }
        case "refine":
        {
            var request = JsonSerializer.Deserialize<JsonElement>(input);
            var id = request.GetProperty("view").GetString() ?? "";
            var views = await Views();
            var view = views.FirstOrDefault(v => v.Id == id) ?? throw new InvalidOperationException("No view " + id);
            if (request.TryGetProperty("filters", out var values))
            {
                foreach (var property in values.EnumerateObject())
                {
                    if (view.Filters.Contains(property.Name)) { await brain.Get<ITextField>($"{appKey}/views/{id}/filter/{property.Name}").SetValue(property.Value.GetString() ?? ""); }
                }
            }
            if (request.TryGetProperty("sql", out var sql))
            {
                var changed = view with { Sql = sql.GetString() ?? view.Sql };
                await Save(views.Select(v => v.Id == id ? changed : v).ToArray());
            }
            else
            {
                // Filter fields changed, nothing in the registry did; a registry write is still the one
                // signal the runner listens to.
                await Save(views);
            }
            return JsonSerializer.Serialize(new { view = id }, json);
        }
        case "read":
        {
            var id = input.Trim();
            _ = (await Views()).FirstOrDefault(v => v.Id == id) ?? throw new InvalidOperationException("No view " + id);
            var table = await brain.Get<DigitalBrain.Flutter.Table.ITable>($"{appKey}/views/{id}/table").Read();
            return JsonSerializer.Serialize(new { view = id, columns = table.Columns.Select(c => c.Id), rows = table.Rows }, json);
        }
        case "close":
        {
            var id = input.Trim();
            var views = await Views();
            if (views.All(v => v.Id != id)) { throw new InvalidOperationException("No view " + id); }
            await brain.Get<IReminder>($"{appKey}/views/{id}/refresh").Stop();
            await Save(views.Where(v => v.Id != id).ToArray());
            await ComposeHome(views.Where(v => v.Id != id).ToArray());
            return JsonSerializer.Serialize(new { closed = id }, json);
        }
        default: throw new ArgumentException("Unknown operation " + operation);
    }
}

async Task<View[]> Views()
{
    var text = (await registry.Read()).Markdown;
    return text.Length == 0 ? [] : JsonSerializer.Deserialize<View[]>(text, json) ?? [];
}

Task Save(View[] views) => registry.Set(JsonSerializer.Serialize(views, json));

async Task Compose(View view)
{
    var root = $"{appKey}/views/{view.Id}";
    var children = new List<UiChildRef>();
    foreach (var column in view.Filters)
    {
        await brain.Get<ITextField>($"{root}/filter/{column}").Configure(column, "text");
        children.Add(new("textfield", $"{root}/filter/{column}"));
    }
    children.Add(new(view.Kind, $"{root}/{view.Kind}"));
    children.Add(new("card", $"{root}/status"));
    var layout = brain.Get<ILayout>($"{root}/layout");
    var current = await layout.Read();
    var definition = new LayoutDefinition("column", children.ToArray());
    if (!Same(current.Definition.Children, definition.Children)) { await layout.Set(definition, current.Revision); }
    var surface = brain.Get<ISurface>($"{root}/surface");
    var state = await surface.Read();
    if (state.Definition.Title != view.Title || state.Definition.Children.Length != 1) { await surface.Set(new(view.Title, [new("layout", $"{root}/layout")]), state.Revision); }
    if (view.RefreshSeconds > 0) { await brain.Get<IReminder>($"{root}/refresh").Start(TimeSpan.FromSeconds(view.RefreshSeconds), TimeSpan.FromSeconds(view.RefreshSeconds)); }
}

async Task ComposeHome(View[] views)
{
    var list = brain.Get<ICard>(appKey + "/list");
    await list.Set("Views", views.Length == 0 ? "No views yet. Ask the assistant to show a table or a chart." : string.Join("\n", views.Select(v => $"- {v.Title} ({v.Kind}, {v.Id})")));
    var main = brain.Get<ILayout>(appKey + "/main");
    var current = await main.Read();
    if (current.Definition.Children.Length == 0) { await main.Set(new("column", [new("card", appKey + "/list")]), current.Revision); }
    var surface = brain.Get<ISurface>(appKey + "/surface");
    var state = await surface.Read();
    if (state.Definition.Title != "Data Visualizer") { await surface.Set(new("Data Visualizer", [new("layout", appKey + "/main")]), state.Revision); }
}

static bool Same(UiChildRef[] left, UiChildRef[] right) => left.Length == right.Length && left.Zip(right).All(pair => pair.First == pair.Second);
```

`UiChildRef` is the record `AppUiEndpoints` and the Settings app already use (`new("textfield", name)`); confirm its namespace with `workspaceSymbol UiChildRef` and add the using.

- [ ] **Step 2: Commit** `git add src/DigitalBrain.OS/Apps/DataVisualizer/behaviors/views.cs && git commit -m "DataVisualizer: views behavior"`.

### Task 11: `behaviors/runner.cs` (run SQL or app table, render, react)

**Files:**
- Create: `src/DigitalBrain.OS/Apps/DataVisualizer/behaviors/runner.cs`

- [ ] **Step 1: Write the behavior**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
#:project /brain/src/Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/DigitalBrain.Modules.Postgres.Contracts.csproj
#:project /brain/src/Modules/Time/DigitalBrain.Modules.Time.Contracts/DigitalBrain.Modules.Time.Contracts.csproj
using System.Globalization;
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Card;
using DigitalBrain.Flutter.Chart;
using DigitalBrain.Flutter.Table;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Text.Signals;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Flutter.TextField.Signals;
using DigitalBrain.Postgres;
using DigitalBrain.Postgres.Tables;
using DigitalBrain.Postgres.Tables.Signals;
using DigitalBrain.Time.Reminders;
using DigitalBrain.Time.Reminders.Signals;

sealed record View(string Id, string Title, string Kind, string Source, string Sql, string[] Filters, int RefreshSeconds);

// The program of every view runs here. Each run is a pure function of (view, filter values, source)
// that replaces the table or chart; the previous content survives a failed run and the status card
// carries the error. Triggers: the registry changing, a filter field changing, an app table row
// changing, a refresh reminder tick.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var registry = brain.Get<IText>(appKey + "/views");
var postgres = brain.Get<IPostgresServer>("default");
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var subscriptions = new Dictionary<string, CancellationTokenSource>(StringComparer.Ordinal);

await Reconcile();
await using var registryChanges = await brain.SubscribeAsync<TextChanged>(registry, brain.Stopping);
await foreach (var _ in registryChanges.ReadAllAsync(brain.Stopping)) { await Reconcile(); }

async Task Reconcile()
{
    var views = await Views();
    foreach (var gone in subscriptions.Keys.Except(views.Select(v => v.Id)).ToArray())
    {
        subscriptions[gone].Cancel();
        subscriptions.Remove(gone);
    }
    foreach (var view in views)
    {
        await Run(view);
        if (subscriptions.ContainsKey(view.Id)) { continue; }
        var cts = CancellationTokenSource.CreateLinkedTokenSource(brain.Stopping);
        subscriptions[view.Id] = cts;
        _ = Watch(view, cts.Token);
    }
}

async Task Watch(View view, CancellationToken ct)
{
    var root = $"{appKey}/views/{view.Id}";
    var tasks = new List<Task>();
    foreach (var column in view.Filters)
    {
        tasks.Add(brain.On<TextFieldChanged>(brain.Get<ITextField>($"{root}/filter/{column}"), ct, async _ => await Run(await Current(view.Id))));
    }
    if (view.Source.StartsWith("apptable:", StringComparison.Ordinal))
    {
        var table = brain.Get<ITable>(view.Source["apptable:".Length..]);
        tasks.Add(brain.On<RowUpserted>(table, ct, async _ => await Run(await Current(view.Id))));
        tasks.Add(brain.On<RowDeleted>(table, ct, async _ => await Run(await Current(view.Id))));
    }
    if (view.RefreshSeconds > 0)
    {
        tasks.Add(brain.On<ReminderTick>(brain.Get<IReminder>($"{root}/refresh"), ct, async _ => await Run(await Current(view.Id))));
    }
    try { await Task.WhenAll(tasks); } catch (OperationCanceledException) { }
}

async Task Run(View? view)
{
    if (view is null) { return; }
    var root = $"{appKey}/views/{view.Id}";
    var status = brain.Get<ICard>($"{root}/status");
    try
    {
        var values = new List<string>();
        foreach (var column in view.Filters) { values.Add((await brain.Get<ITextField>($"{root}/filter/{column}").Read()).Value); }
        var (columns, rows) = view.Source == "sql" ? await RunSql(view, values) : await RunAppTable(view, values);
        if (view.Kind == "chart")
        {
            var points = rows.Select((row, index) => new ChartPoint(index.ToString(CultureInfo.InvariantCulture), row.ElementAtOrDefault(0) ?? "",
                double.TryParse(row.ElementAtOrDefault(1), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0)).ToArray();
            await brain.Get<IChart>($"{root}/chart").Render(view.Title, "bar", points);
        }
        else
        {
            await brain.Get<DigitalBrain.Flutter.Table.ITable>($"{root}/table").Replace(view.Title, columns.Select(c => new TableColumn(c, c)).ToArray(), rows);
        }
        await status.Set("", $"ok · {rows.Length} rows · {DateTimeOffset.UtcNow:HH:mm:ss}");
    }
    catch (Exception error) when (error is not OperationCanceledException)
    {
        await status.Set("Error", error.Message);
    }
}

async Task<(string[] Columns, string[][] Rows)> RunSql(View view, List<string> values)
{
    var parameters = view.Filters.Select((column, index) => new PostgresParameter(column, values[index])).ToArray();
    var result = await postgres.Query(new(view.Sql, PostgresQuery.DefaultMaxRows, parameters));
    return (result.Columns.Select(c => c.Name).ToArray(), result.Rows.Select(row => row.Select(Cell).ToArray()).ToArray());
}

// An app table is read whole and filtered in memory: equality on each filter column, blank means any.
async Task<(string[] Columns, string[][] Rows)> RunAppTable(View view, List<string> values)
{
    var table = brain.Get<ITable>(view.Source["apptable:".Length..]);
    var page = await table.Page(0, PostgresQuery.DefaultMaxRows);
    var columns = page.Length == 0 ? [] : page[0].Select(cell => cell.Column).ToArray();
    var rows = page.Select(row => row.Select(cell => Cell(cell.Json)).ToArray()).ToArray();
    foreach (var (column, index) in view.Filters.Select((c, i) => (c, i)))
    {
        var wanted = values[index];
        var position = Array.IndexOf(columns, column);
        if (wanted.Length == 0 || position < 0) { continue; }
        rows = rows.Where(row => row[position] == wanted).ToArray();
    }
    return (columns, rows);
}

// Cells arrive as JSON literals; the person reads plain text.
static string Cell(string jsonLiteral)
{
    try
    {
        using var document = JsonDocument.Parse(jsonLiteral);
        return document.RootElement.ValueKind switch
        {
            JsonValueKind.String => document.RootElement.GetString() ?? "",
            JsonValueKind.Null => "",
            _ => document.RootElement.GetRawText(),
        };
    }
    catch (JsonException) { return jsonLiteral; }
}

async Task<View?> Current(string id) => (await Views()).FirstOrDefault(v => v.Id == id);

async Task<View[]> Views()
{
    var text = (await registry.Read()).Markdown;
    return text.Length == 0 ? [] : JsonSerializer.Deserialize<View[]>(text, json) ?? [];
}
```

Check two client facts before finishing: `brain.On<T>(neuron, ct, handler)` is the overload the Assistant's `chat.cs` uses for `ButtonClicked` (if the client only offers the `await foreach` form, wrap each subscription in a local `async Task` loop the same way `chat.cs` does); and the `IText` changed signal type name (`TextChanged` in `DigitalBrain.Flutter.Text.Signals`, confirm with `workspaceSymbol`).

- [ ] **Step 2: Commit** `git add src/DigitalBrain.OS/Apps/DataVisualizer/behaviors/runner.cs && git commit -m "DataVisualizer: runner behavior"`.

### Task 12: Verify the app publishes green and drive it live

**Files:**
- Modify: `src/DigitalBrain.OS/Apps/DataVisualizer/*` as the loop demands

- [ ] **Step 1: Confirm the host packages the app**

Run: `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` and `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: clean build; the shipped-apps composition facts list `datavisualizer` next to `settings` and `assistant` (if a fact enumerates the defaults explicitly, add it there).

- [ ] **Step 2: Run the system**

From `src/DigitalBrain.AppHost`: `aspire run`. Then `mcp__aspire__list_resources`; every resource Running/Healthy. The OS readiness check `os-defaults` turns healthy only when `os/datavisualizer` is published, which means `tests.cs` ran green. If it stays unhealthy, `list_console_logs` for the OS resource and read the `dbtest:fail` lines; fix the behavior and repeat. Never widen a wait.

- [ ] **Step 3: Drive it through `digitalbrain-mcp`**

1. `neurons_context` to confirm the brain.
2. `neurons_call` on the brain's `apps.app2` neuron `{brain}/apps/datavisualizer` operation `Invoke` with `{"operation":"show","input":"{\"title\":\"People\",\"kind\":\"table\",\"source\":\"sql\",\"sql\":\"select * from (values ('us', 2), ('uk', 1)) as t(country, n) where country = $1\",\"filters\":[\"country\"]}"}`.
3. `neurons_get` the returned `…/views/{id}/table`; two rows.
4. `neurons_call` `…/views/{id}/filter/country` `Input` with `uk`.
5. `neurons_get` the table again; one row.

- [ ] **Step 4: Confirm in telemetry**

`mcp__aspire__list_traces` filtered to the last minutes: a trace that starts at `ITextField.Input`, continues through the `TextFieldChanged` delivery to the runner's `IPostgresServer.Query`, and ends at `ITable.Replace`. `list_structured_logs` shows the behavior's log line for the run. If the chain is not there, the change isn't done.

- [ ] **Step 5: Commit** any fixes: `git commit -am "DataVisualizer: verified live"`.

---

# Stage 4. Retire the Supabase live-table system

### Task 13: Assistant data tools become DataVisualizer invocations

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/DataViewTools.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantModule.cs` (register the factory next to `WorkspaceFormTools`; find via `findReferences WorkspaceFormTools`)
- Modify: `src/DigitalBrain.OS/Apps/Assistant/behaviors/chat.cs:25` and `AssistantDefinition.cs:16` tool lists
- Test: `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/DataViewToolFacts.cs` (create)

**Interfaces:**
- Produces tools `show_data_view`, `refine_data_view`, `read_data_view`, `close_data_view`, each invoking the brain's `datavisualizer` app operation of the same verb through `IApp.Invoke` and waiting the way `AppAgentTools` does.

- [ ] **Step 1: Write the failing fact**

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Assistant;
using DigitalBrain.Testing.Module;
using Xunit;

namespace DigitalBrain.Modules.Assistant.Tests;

public sealed class DataViewToolFacts
{
    [Fact]
    public async Task ShowOpensADataVisualizerView()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AssistantModule>().WithModule<AppsModule>().StartAsync(ct);
        var scope = await brain.AuthorizeCallerAsync();
        var app = brain.Get<IApp>(IApp.Key(scope, "datavisualizer"));
        await brain.InstallScriptedApp(app, operations: ["show"]);   // the Apps test helper that makes a live app answer invocations from a script; see AppCreatorFacts for its name
        var tools = new DataViewTools(brain).Create(() => new AgentToolContext(scope, "run", "call"));
        var show = tools.Single(tool => tool.Name == "show_data_view");

        var answer = await show.InvokeAsync(new() { ["title"] = "People", ["kind"] = "table", ["sql"] = "select 1" }, ct);

        Assert.Contains("view", answer!.ToString(), StringComparison.Ordinal);
    }
}
```

Replace the `InstallScriptedApp` line with the exact helper `AppCreatorFacts.cs` or `AppRouteFacts.cs` uses to put a live app with a scripted responder in place; if none answers invocations, make the fact assert on the pending invocation instead (`(await app.Pending()).Single().Operation == "show"`).

- [ ] **Step 2: Run to see it fail**; compile error.

- [ ] **Step 3: Write `DataViewTools.cs`**

```csharp
using System.ComponentModel;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DigitalBrain.AI.Agents;
using DigitalBrain.Apps;
using Microsoft.Extensions.AI;

namespace DigitalBrain.Assistant;

// Data views belong to the DataVisualizer app; the assistant only asks it. One tool per operation.
public sealed class DataViewTools(IDigitalBrain brain) : IAgentToolFactory
{
    private const string App = "datavisualizer";

    public IReadOnlyList<AIFunction> Create(Func<AgentToolContext> context)
    {
        Task<object> Show([Description("Short window title.")] string title,
            [Description("table or chart.")] string kind,
            [Description("One read-only SELECT. Use $1..$n for filter parameters in the order of `filters`.")] string sql,
            [Description("Column names the person can filter by; each binds the matching $n.")] IReadOnlyList<string>? filters = null,
            CancellationToken ct = default)
            => Invoke(context(), "show", JsonSerializer.Serialize(new { title, kind, source = "sql", sql, filters = filters ?? [] }), ct);

        Task<object> Refine([Description("View id from show_data_view.")] string view,
            [Description("Filter values by column.")] IReadOnlyDictionary<string, string>? filters = null,
            [Description("Replacement SQL; omit to keep.")] string? sql = null, CancellationToken ct = default)
            => Invoke(context(), "refine", JsonSerializer.Serialize(new { view, filters, sql }), ct);

        Task<object> Read([Description("View id.")] string view, CancellationToken ct = default) => Invoke(context(), "read", view, ct);
        Task<object> Close([Description("View id.")] string view, CancellationToken ct = default) => Invoke(context(), "close", view, ct);

        return [
            AIFunctionFactory.Create(Show, "show_data_view", "Open a live table or chart over SQL in the person's workspace. Returns the view id and window."),
            AIFunctionFactory.Create(Refine, "refine_data_view", "Change a view's filter values or SQL. The same window re-renders."),
            AIFunctionFactory.Create(Read, "read_data_view", "Read a view's current columns and rows."),
            AIFunctionFactory.Create(Close, "close_data_view", "Remove a view and its window."),
        ];
    }

    private async Task<object> Invoke(AgentToolContext caller, string operation, string input, CancellationToken ct)
    {
        var app = brain.Get<IApp>(IApp.Key(caller.ScopeId, App));
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{caller.ScopeId}/{caller.RunId}/{caller.CallId}/{operation}"));
        var invocation = await app.Invoke(new(new Guid(hash.AsSpan(0, 16)), operation, input)).WaitAsync(ct);
        while (invocation.Status == InvocationStatus.Pending)
        {
            await Task.Delay(100, ct);
            invocation = await app.ReadInvocation(invocation.Id).WaitAsync(ct);
        }
        return invocation.Status == InvocationStatus.Failed
            ? new { isError = true, message = invocation.Error ?? "The view could not be changed." }
            : JsonSerializer.Deserialize<JsonElement>(invocation.Output ?? "{}");
    }
}
```

The wait loop mirrors `AppAgentTools`; it is bounded by the tool call's own cancellation, so there is no extra deadline.

- [ ] **Step 4: Register and list the tools**

In the Assistant module's `Configure(ISiloBuilder)` add `services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, DataViewTools>());`. In `chat.cs` line 25 and `AssistantDefinition.cs` line 16 append `"show_data_view", "refine_data_view", "read_data_view", "close_data_view"` to the tool arrays.

- [ ] **Step 5: Run** `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests`; expected green.

- [ ] **Step 6: Commit** `git add -A src/DigitalBrain.Modules/DigitalBrain/Assistant src/DigitalBrain.OS/Apps/Assistant && git commit -m "Assistant: data views go through DataVisualizer"`.

### Task 14: Delete the Postgres.Windows live-table tools

**Files:**
- Delete: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/PostgresTools.cs`, `PostgresIntegrationLiveSource.cs`, `PostgresAppLiveSource.cs` (find both via `workspaceSymbol`)
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/PostgresWindowsHosting.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/DigitalBrain.Modules.Postgres.Windows.csproj` (drop the Supabase reference)
- Modify or delete tests under `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests/` that reference the deleted types (`PostgresAppSourceFacts.cs` facts 3 and 4; `PostgresTableFacts.cs` if it opens windows)

- [ ] **Step 1: Keep schema discovery as a tool**

Create `PostgresSchemaTools.cs` in Postgres.Windows with only the `postgres_schema` function from `PostgresTools.cs` (the `Schema` local and its `AIFunctionFactory.Create` line), the same constructor minus `LiveTableWindows`.

- [ ] **Step 2: Rewrite `PostgresWindowsHosting.AddPostgresWindows`**

```csharp
    public static ISiloBuilder AddPostgresWindows(this ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        var services = silo.Services;
        services.TryAddSingleton<PostgresAppResources>();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryInventoryProvider, PostgresInventoryProvider>());
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryResourceProvider, PostgresRegistryResources>());
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, PostgresSchemaTools>());
        return silo;
    }
```

Change `PostgresAppResources.Describe`'s `open` entry to `new { tool = "show_data_view", arguments = new { title = "App data", kind = "table", sql = $"select * from {resource.Table.Definition…}" } }` only if the physical table name is available on `TableDescription`; otherwise set `open = new { tool = "show_data_view", note = "Query this app table by its storageTableId through the datavisualizer app's apptable source." }` and update `DiscoveredAppStorageHasExplicitOpenArgumentsRatherThanAWindowTableId` to assert the new tool name.

- [ ] **Step 3: Delete the files, fix the csproj, trim the tests, build, test**

```bash
dotnet build src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Windows/DigitalBrain.Modules.Postgres.Windows.csproj
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests
```

- [ ] **Step 4: Commit** `git commit -am "Postgres.Windows: schema discovery only; live windows leave"`.

### Task 15: Delete the Supabase table engine, windows and endpoints

**Files:**
- Delete: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Windows/` (whole folder), `Table/` (whole folder)
- Delete: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/Tables/` (whole folder)
- Modify: `src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/SupabaseModule.cs`
- Delete/modify tests: `Table/SupabaseTableFacts.cs`, `Table/SupabaseTableReadPolicyFacts.cs`, `TableHttpFacts.cs`, `TableRouteFacts.cs`, and any `LiveTable*` facts

- [ ] **Step 1: Map the blast radius**

`findReferences` on `ISupabaseTable`, `LiveTableWindows`, `ILiveTableSource`, `SupabaseTableChanged`, `QueryPlanCompiler`. Everything outside the folders above must already be gone (Task 14) or be the Flutter `WindowReference.Table` helper, which stays.

- [ ] **Step 2: Rewrite `SupabaseModule`**

Remove `IHttpModule` and `Configure(IEndpointRouteBuilder)`; the `Connector` becomes `new("supabase", "Supabase", ["connection-string"], []) { OptionalIntegrations = ["supabase"], Neurons = [typeof(ISupabase)], Signals = [] }`; in `Configure(ISiloBuilder)` drop `AddLiveTables()`, `LiveTableTools`, `ILiveTableSource`. Add a schema-only tool factory `SupabaseSchemaTools` exposing `supabase_schema` (copy the `Schema` local from `LiveTableTools`).

- [ ] **Step 3: Delete folders and tests, build, test**

```bash
git rm -r src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Windows \
          src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/Table \
          src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase.Contracts/Tables
dotnet build src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/DigitalBrain.Modules.Supabase.csproj
dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

If `Query/QueryPlanCompiler`-only helpers (`SupabaseTablePolicy`, `SupabaseTableReadPolicy`, `SupabaseTypeMap` users) lose their last caller, delete them too; `SupabaseTypeMap` stays because the provider uses it.

- [ ] **Step 4: Commit** `git commit -am "Supabase: the live-table engine leaves; the module is a SQL neuron"`.

### Task 16: Remove the shell's live-table filter UI

**Files:**
- Delete: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/table_models.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart` (remove `readWorkspaceTable`, `updateWorkspaceTable`, `_tableRequest` if unused, and the `table_models` export)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart:380-450, 500-530` (the `_tables` controllers and the `kind == 'table'` artifact branch)
- Delete: the `UiDataTable` widget and its controller (find via `grep -rn "UiDataTable" app`), `shell/test/table_navigation_test.dart`, `shell/test/workspace_data_window_test.dart`, the table part of `shell/test/core/workspace_models_test.dart`

- [ ] **Step 1: Make a `table` window reference open the neuron view**

Where `workspace_app.dart` builds a window for `reference.kind == 'table'`, render `NeuronView(kind: 'table', name: reference.neuronId, load: …)` exactly as it does for `surface` (the block around line 555). A DataVisualizer window references a `surface`, so this path only serves older references.

- [ ] **Step 2: Delete the models and controllers, analyze, test**

Run `flutter analyze` and `flutter test` in `app/core`, `app/ui`, `app/shell`; fix every removed import.

- [ ] **Step 3: Commit** `git commit -am "Shell: the live-table filter UI leaves; tables render as neurons"`.

### Task 17: Run the whole system again

- [ ] **Step 1:** `aspire run`; all resources healthy; `os-defaults` healthy.
- [ ] **Step 2:** Through `digitalbrain-mcp`, invoke the Assistant app's `send` with "show me a table of select 1 as one" and confirm in `list_traces` that `show_data_view` invoked `datavisualizer` and `ITable.Replace` ran.
- [ ] **Step 3:** `dotnet test --project` for Assistant, Apps, Flutter, Postgres, Postgres.Windows, Supabase, OS.Tests.Unit, Architecture.Tests; all green.
- [ ] **Step 4:** Commit anything the loop changed.

---

# Stage 5. Finish thinning the kernel

Principle for every task here: a module contract owns its inputs; the module runtime maps Framework shapes into them.

### Task 18: Compute owns its allowance request; `Enforcement/` moves to Framework

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute.Contracts/AllowanceRequest.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute.Contracts/Allowances.cs:136-160`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/Allowances/AllowanceCallFilterStage.cs`, `AllowancePolicySource.cs`, `AllowanceRules.cs`, `AllowanceLedgerNeuron.cs`
- Move: `src/DigitalBrain/Enforcement/CallRequest.cs`, `CallerContext.cs` → `src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/` (namespace `DigitalBrain.Framework.Enforcement`)
- Modify: every file `findReferences` lists for `CallRequest`, `CallDenial`, `CallerContext`, `CallerKind`, `TrustedEdge` (Framework, Platform, Mcp, OS, modules, tests): replace `using DigitalBrain.Enforcement;` with `using DigitalBrain.Framework.Enforcement;`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs` (drop the allowlist entries and `DigitalBrain.Enforcement` from `Namespaces`)
- Test: `src/DigitalBrain.Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests/AllowanceFacts.cs`

**Interfaces:**
- Produces: `AllowanceRequest(string AccountId, string BrainId, string? AppId, string? IntentId, CallerKind Kind, string TargetNeuron, string Operation, string[] SemanticTypeIds, decimal EstimatedCompute, bool HasSideEffects)` where `CallerKind` is Compute's own enum copy `AllowanceCallerKind { User, Assistant, App, Scheduler, Platform }`; `IAllowanceLedger.AuthorizeAsync(AllowanceRequest request, CancellationToken ct)`; `AllowanceReservations.For(AllowanceRequest)`.

- [ ] **Step 1: Write the failing fact**

In `AllowanceFacts.cs` add:

```csharp
    [Fact]
    public void TheLedgerContractTakesNoFrameworkShape()
    {
        var method = typeof(IAllowanceLedger).GetMethod(nameof(IAllowanceLedger.AuthorizeAsync))!;
        Assert.Equal(typeof(AllowanceRequest), method.GetParameters()[0].ParameterType);
        Assert.Equal(typeof(IAllowanceLedger).Assembly, typeof(AllowanceRequest).Assembly);
    }
```

- [ ] **Step 2: Run**; compile error.

- [ ] **Step 3: Add the contract record and switch the interface**

`AllowanceRequest.cs`:

```csharp
namespace DigitalBrain.Compute.Allowances;

public enum AllowanceCallerKind { User = 0, Assistant = 1, App = 2, Scheduler = 3, Platform = 4 }

[GenerateSerializer, Alias("compute.allowance-request")]
public sealed record AllowanceRequest(
    [property: Id(0)] string AccountId,
    [property: Id(1)] string BrainId,
    [property: Id(2)] string? AppId,
    [property: Id(3)] string? IntentId,
    [property: Id(4)] AllowanceCallerKind Kind,
    [property: Id(5)] string TargetNeuron,
    [property: Id(6)] string Operation,
    [property: Id(7)] string[] SemanticTypeIds,
    [property: Id(8)] decimal EstimatedCompute,
    [property: Id(9)] bool HasSideEffects);
```

In `Allowances.cs` replace `CallRequest` with `AllowanceRequest` in `AllowanceReservations.For` (`request.IntentId`, `request.TargetNeuron`, `request.Operation` keep their names) and in `IAllowanceLedger.AuthorizeAsync`. Remove `using DigitalBrain.Enforcement;` from the contracts project.

- [ ] **Step 4: Map in the runtime**

In `AllowanceCallFilterStage.EvaluateAsync` build the request:

```csharp
        var mapped = new AllowanceRequest(request.Caller.AccountId, request.Caller.BrainId, request.Caller.AppId, request.Caller.IntentId,
            (AllowanceCallerKind)(int)request.Caller.Kind, request.TargetNeuron, request.Operation, request.SemanticTypeIds, request.EstimatedCompute, request.HasSideEffects);
        var decision = await source.AuthorizeAsync(mapped, cancellationToken).ConfigureAwait(false);
```

Change `IAllowancePolicySource.AuthorizeAsync`, `AllowanceRules` (`request.Caller.X` → `request.X`, `CallerKind` → `AllowanceCallerKind`) and `AllowanceLedgerNeuron` to `AllowanceRequest`. `AllowanceDecision.Denial` keeps `CallDenial`; since `CallDenial` moves to Framework, give Compute its own `AllowanceDenial` enum with the same members and map it back in the stage (`(CallDenial)(int)decision.Denial`).

- [ ] **Step 5: Move the two kernel files**

```bash
git mv src/DigitalBrain/Enforcement/CallRequest.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/CallRequest.cs
git mv src/DigitalBrain/Enforcement/CallerContext.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/CallerContext.cs
```

Set `namespace DigitalBrain.Framework.Enforcement;` in both. Then for every file `findReferences` lists, replace the using. A quick sweep: `grep -rl "using DigitalBrain.Enforcement;" src --include=*.cs | grep -v /obj/ | xargs sed -i 's/using DigitalBrain.Enforcement;/using DigitalBrain.Framework.Enforcement;/'` followed by removing duplicates where a file now has the line twice.

- [ ] **Step 6: Narrow the ring test**

In `VocabularyRingFacts.cs`: `Allowlist = new()` (empty), `Namespaces = ["DigitalBrain", "DigitalBrain.Integrations", "DigitalBrain.Types"]`, delete `using DigitalBrain.Enforcement;`.

- [ ] **Step 7: Build and test**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

- [ ] **Step 8: Commit** `git commit -am "Enforcement leaves the kernel; Compute owns its allowance request"`.

### Task 19: Forms own their field kind and secret; `Types/` moves to Framework

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Form/IForm.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Form/FormNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs:85-103`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/WorkspaceFormTools.cs`
- Move: `src/DigitalBrain/Types/FieldKind.cs`, `SecretRef.cs`, `TypeValidationException.cs` → `src/DigitalBrain.Framework/DigitalBrain.Framework/Types/` (namespace `DigitalBrain.Framework.Types`)
- Modify: every `using DigitalBrain.Types;` site (`findReferences` on `FieldKind` and `SecretRef`: Framework Types, Platform secrets and integrations, Gmail, Salesforce, Supabase `SupabaseTypeMap`, tests)
- Test: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Form/FormFacts.cs`

**Interfaces:**
- Produces in `IForm.cs`: `enum FormFieldKind { PlainText, LongText, Number, Date, DateTime, Boolean, Choice, MultiChoice, Email, Url, Secret, Reference }`; `record FormSecret(string Reference, string Label, bool IsSet)`; `IForm.SetSecret(string fieldName, FormSecret secret)`; `FormField.Kind : FormFieldKind`; `FormFieldValue.Secret : FormSecret?`; `FormFieldState.Kind : FormFieldKind`, `.Secret : FormSecret?`; `FormValidationException(FormFieldKind Kind, string? RejectedValue, string[] AllowedValues)` as the wire exception, `[GenerateSerializer, Alias("ui.form-validation")]`.

- [ ] **Step 1: Write the failing facts** in `FormFacts.cs`

```csharp
    [Fact]
    public async Task AnUnsupportedKindIsRejectedThroughTheFormContract()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<FlutterModule>().StartAsync(ct);
        var form = brain.Get<IForm>("f");
        await form.Define(new("Sign up", [new("age", "Age", FormFieldKind.Number, Required: true)]));
        var error = await Assert.ThrowsAsync<FormValidationException>(() => form.Submit(new([new("age", "forty")])));
        Assert.Equal(FormFieldKind.Number, error.Kind);
        Assert.Equal("forty", error.RejectedValue);
    }

    [Fact]
    public void TheFormContractCarriesNoFrameworkType()
    {
        var types = typeof(IForm).Assembly.GetExportedTypes().SelectMany(t => t.GetProperties().Select(p => p.PropertyType).Concat(t.GetMethods().SelectMany(m => m.GetParameters().Select(p => p.ParameterType))));
        Assert.DoesNotContain(types, t => t.Namespace?.StartsWith("DigitalBrain.Framework", StringComparison.Ordinal) == true || t.Namespace == "DigitalBrain.Types");
    }
```

Update the existing `FormFacts`, `FormHttpFacts`, `TypeParityFacts` usages from `FieldKind`/`SecretRef`/`TypeValidationException` to the form's own names. `TypeParityFacts` asserts the Flutter kinds mirror the Framework catalog; rewrite it to compare `Enum.GetNames<FormFieldKind>()` with `Enum.GetNames<DigitalBrain.Framework.Types.FieldKind>()`, which keeps the parity but through the test, not the contract.

- [ ] **Step 2: Run**; compile errors.

- [ ] **Step 3: Rewrite the contract types in `IForm.cs`**

Replace `using DigitalBrain.Types;` with nothing; add after the interface:

```csharp
public enum FormFieldKind { PlainText, LongText, Number, Date, DateTime, Boolean, Choice, MultiChoice, Email, Url, Secret, Reference }

// A secret the form holds by reference only; the value lives in the platform ring.
[GenerateSerializer, Alias("ui.form-secret")]
public sealed record FormSecret([property: Id(0)] string Reference, [property: Id(1)] string Label, [property: Id(2)] bool IsSet);

[GenerateSerializer, Alias("ui.form-validation")]
public sealed class FormValidationException(FormFieldKind kind, string? rejectedValue, string[] allowedValues)
    : ArgumentException($"{(kind == FormFieldKind.Secret ? "(redacted)" : $"'{rejectedValue}'")} is not a valid {kind} value. Allowed {kind} values: {string.Join(", ", allowedValues)}.")
{
    [Id(0)] public FormFieldKind Kind { get; } = kind;
    [Id(1)] public string? RejectedValue { get; } = kind == FormFieldKind.Secret ? null : rejectedValue;
    [Id(2)] public string[] AllowedValues { get; } = allowedValues;
}
```

and change `FieldKind` → `FormFieldKind`, `SecretRef` → `FormSecret` throughout the file, `FormFieldSupport.Supports(FormFieldKind kind) => kind != FormFieldKind.Reference`.

- [ ] **Step 4: Map in `FormNeuron`**

Keep `using DigitalBrain.Framework.Types;`. Add two private helpers:

```csharp
    private static FieldKind Catalog(FormFieldKind kind) => (FieldKind)(int)kind;
    private static SecretRef ToRef(FormSecret secret) => new() { Reference = secret.Reference, Label = secret.Label, Status = secret.IsSet ? SecretStatus.Set : SecretStatus.Unset };
    private static FormValidationException Invalid(FormFieldKind kind, object? value, IReadOnlyList<string> allowed) => new(kind, value?.ToString(), [.. allowed]);
```

Then: `TypeCatalog.Validate(input, Catalog(field.Kind))`, `TypeCatalog.AllowedFor(Catalog(field.Kind))`, `TypeCatalog.Validate(ToRef(reference), FieldKind.Secret)`, every `throw new TypeValidationException(field.Kind, x, allowed)` → `throw Invalid(field.Kind, x, allowed)`, and wrap the `TypeCatalog.Validate` calls so a Framework `TypeValidationException` becomes `Invalid(field.Kind, error.RejectedValue, error.AllowedValues)`. The `Normalize` switch uses `FormFieldKind` members.

- [ ] **Step 5: Map at the HTTP edge and in the Assistant**

`AppUiEndpoints.cs` form `secret` branch: `await form.SetSecret(input.Field ?? "", new FormSecret(input.Value!, input.Field ?? "", true))` (keep the `SecretReferences.IsReference` guard). `WorkspaceFormTools.cs`: `Kinds` maps type ids to `FormFieldKind` via `(FormFieldKind)(int)type.Kind`; `Handle` calls `TypeCatalog.Get((FieldKind)(int)field.Kind)`; the catch list uses `FormValidationException`.

- [ ] **Step 6: Move the three kernel files**

```bash
git mv src/DigitalBrain/Types/FieldKind.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Types/FieldKind.cs
git mv src/DigitalBrain/Types/SecretRef.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Types/SecretRef.cs
git mv src/DigitalBrain/Types/TypeValidationException.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Types/TypeValidationException.cs
```

Set `namespace DigitalBrain.Framework.Types;` in each and delete the now-redundant `using DigitalBrain.Types;` lines across the repo (`grep -rl "using DigitalBrain.Types;" src --include=*.cs | grep -v /obj/`), adding `using DigitalBrain.Framework.Types;` where a file lacked it (Gmail, Salesforce, Platform secrets and integrations, Supabase `SupabaseTypeMap`, `SupabaseTableReadPolicy` if it survived Task 15).

- [ ] **Step 7: Narrow the ring test**: `Namespaces = ["DigitalBrain", "DigitalBrain.Integrations"]`.

- [ ] **Step 8: Build and test**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

Also `flutter analyze` in the shell: the form JSON `kind` strings are unchanged (`enum` names are identical), so no Dart change is expected; confirm `FormHttpFacts` still serialises `"Number"`.

- [ ] **Step 9: Commit** `git commit -am "Forms own their field kind and secret; Types leave the kernel"`.

### Task 20: `Integrations/` moves to a Platform contracts assembly

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform.Contracts/DigitalBrain.Platform.Contracts.csproj`
- Move: `src/DigitalBrain/Integrations/ConnectionRef.cs`, `IConnectionRequests.cs` → `src/DigitalBrain.Platform/DigitalBrain.Platform.Contracts/` (namespace stays `DigitalBrain.Integrations`)
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj` (reference the Contracts project)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/ModuleInventory.cs:20-26`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj` (reference Platform.Contracts; it holds no Framework types, so the ring stays acyclic)
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs`, `src/Testing/DigitalBrain.Architecture.Tests/DigitalBrain.Architecture.Tests.csproj` (the new project is under `DigitalBrain.Platform/**`, already globbed)
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpDirectives.cs` if it maps assemblies to `#:project` lines by a `Modules/` path convention; it must answer the Platform.Contracts path too
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/ScriptEdgeFacts.cs` (`ScriptAccountsAreVisibleAndTheCredentialRegistryIsNot` from Task 3 must still pass with the new assembly)

- [ ] **Step 1: Write the failing fact** in `ScriptEdgeFacts.cs`:

```csharp
    [Fact]
    public void ThePlatformContractsAssemblyIsInEveryInventory()
    {
        var inventory = new DigitalBrain.Framework.ModuleInventory([]);
        Assert.Contains(typeof(DigitalBrain.Integrations.IConnectionRequests).Assembly, inventory.ContractAssemblies());
        Assert.NotEqual(typeof(DigitalBrain.INeuron).Assembly, typeof(DigitalBrain.Integrations.IConnectionRequests).Assembly);
    }
```

- [ ] **Step 2: Run**; fails on the `NotEqual`.

- [ ] **Step 3: Create the project**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Platform neuron contracts scripts may call: account requests.</Description>
    <RootNamespace>DigitalBrain.Integrations</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Orleans.Sdk" PrivateAssets="all" />
    <ProjectReference Include="../../DigitalBrain/DigitalBrain.csproj" />
  </ItemGroup>
</Project>
```

`git mv` the two files in. Add `<ProjectReference Include="../DigitalBrain.Platform.Contracts/DigitalBrain.Platform.Contracts.csproj" />` to `DigitalBrain.Platform.csproj` and the equivalent path to `DigitalBrain.Framework.csproj`. Add the project to `DigitalBrain.slnx` and the gitignored `DigitalBrain-lsp.sln` (kill `csharp-ls` to reload).

- [ ] **Step 4: Prepend it in the inventory**

```csharp
    public IReadOnlyList<Assembly> ContractAssemblies()
        => [.. Types.Select(module => module.Assembly).Distinct()
            .SelectMany(ContractAssembliesOf)
            .Prepend(typeof(DigitalBrain.Integrations.IConnectionRequests).Assembly)
            .Prepend(typeof(INeuron).Assembly)
            .Where(assembly => !PlatformAssemblyAttribute.IsPlatform(assembly))
            .Distinct()];
```

- [ ] **Step 5: Finish the ring test**: `Namespaces = ["DigitalBrain"]`; `Roots` unchanged. Run `findReferences` on `CSharpDirectives` to confirm the `#:project` mapping handles a `src/DigitalBrain.Platform/…` path; if it hardcodes `Modules/`, extend the relative-path logic to any csproj under `src/`.

- [ ] **Step 6: Build and test**

```bash
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform.Contracts/DigitalBrain.Platform.Contracts.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

`VocabularyRingFacts.EveryPublicVocabularyTypeIsANeuronContractASignalOrAShapeTheyCarry` now sees exactly: `INeuron`, `INeuronObserver`, `ISignalSubscription<>`, `IDigitalBrain`, `IBrain`, `Activated`, `BrainSnapshot`, `EstablishBrain`, `Signal`, `PlatformAssemblyAttribute`, `PlatformOnlyAttribute`.

- [ ] **Step 7: Commit** `git commit -am "Kernel is the four words; account requests live in Platform.Contracts"`.

### Task 21: Final verification and docs

- [ ] **Step 1:** Update `CLAUDE.md` repo map row for `src/DigitalBrain` to "The vocabulary: the four words and the brain contract. Nothing else." and add `src/DigitalBrain.Platform/DigitalBrain.Platform.Contracts` to the Platform row.
- [ ] **Step 2:** `aspire run`; resources healthy; drive the DataVisualizer filter path once more via `digitalbrain-mcp` and confirm the trace.
- [ ] **Step 3:** Run every suite touched across the five stages (the list in Tasks 3, 12, 17, 19, 20); all green.
- [ ] **Step 4:** Commit `git commit -am "Docs: the kernel is the four words"`.

---

# Amendment (2026-10-06, after the Task 12 live run)

Rulings: scripts never touch the platform Postgres (A = brain-scoped connections); app tests are
out of the app model (B: delete `tests.cs`, verify live only; the model-wide removal is a separate
spec); behaviors are one script per reaction. Tasks 22-24 replace Task 12's remaining steps; Stage 4
and Task 21 follow them.

### Task 22: Connection-keyed Postgres neuron

**Files:**
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresServerNeuron.cs`
- Create: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/ConnectionPostgresProvider.cs`
- Modify: `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresHosting.cs` (register the provider factory)
- Test: `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/ConnectionPostgresFacts.cs` (create)

**Interfaces:**
- Consumes: `ConnectionKeys.For(scopeId, "postgres", connectionId)` → `connection/{scope}/postgres/{id}` and `ConnectionKeys.Parse`; `IModuleConnectionCredentials<PostgresModule>.ReadConnectionAsync("postgres", connectionId, ct)`; `BrainScope.CurrentId()`; `PostgresConnectionSettings.Parse(connectionString).ConnectionString`.
- Produces: `IPostgresServer` at key `connection/{scope}/postgres/{connectionId}` answers `Query`, `ReadSchema`, `ReadConnection` against that connection's database. Key `default` keeps today's platform behavior and today's access (platform/internal only).

- [ ] **Step 1: Failing facts** in `ConnectionPostgresFacts.cs`, over `ModuleTest.Create().WithModule<PostgresModule>()`:
  - `AScriptInItsOwnBrainQueriesItsConnectedDatabase`: register a fake `IModuleConnectionCredentials<PostgresModule>` whose `ReadConnectionAsync("postgres", "c1")` returns a connection string, and a fake `IConnectionPostgresProviderFactory` (see Step 3) mapping that string to a `PostgresTestControls`-style provider; stamp an App caller in brain `b`; `brain.Get<IPostgresServer>(ConnectionKeys.For(scope, "postgres", "c1")).Query(new("select 1", 10))` returns the fake's row.
  - `AScriptMayNotAddressAnotherBrainsConnection`: same, but the key carries a different scope id → `UnauthorizedAccessException` (or the enforcement denial the harness surfaces; assert on the type the existing `BrainRouteIsolationFacts` asserts).
  - `TheDefaultKeyStaysPlatformOnly`: an App caller calling key `default` is refused (the behavior observed live).
- [ ] **Step 2: Run** `dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests -- --filter-method "*ConnectionPostgres*"`; expected compile failure.
- [ ] **Step 3: Implement.** `ConnectionPostgresProvider : IPostgresProvider` built per call from a connection string (`NpgsqlDataSource.Create(...)` inside an `await using`, mirroring `ConnectionSupabaseProvider`); an internal `IConnectionPostgresProviderFactory { IPostgresProvider ForConnectionString(string connectionString); }` with the real implementation registered in `PostgresHosting` (so facts can swap it). In `PostgresServerNeuron`, resolve the provider per call: if `ConnectionKeys.Parse(this.GetPrimaryKeyString())` succeeds, require `parsed.BrainId == BrainScope.CurrentId()` (else throw `UnauthorizedAccessException("The connection belongs to another brain.")`), read the connection string through `IModuleConnectionCredentials<PostgresModule>`, and use `factory.ForConnectionString(...)`; otherwise use the injected platform provider as today. No `Access` override on the neuron: the key form already carries the scope.
- [ ] **Step 4: Run** the three facts and the whole Postgres suite; expected green (plus the ledgered skips).
- [ ] **Step 5: Commit** `Postgres: a connection-keyed server neuron serves a brain's own database`.

### Task 23: DataVisualizer as small behaviors, no tests

**Files:**
- Delete: `src/DigitalBrain.OS/Apps/DataVisualizer/tests.cs`, `behaviors/views.cs`, `behaviors/runner.cs`
- Modify: `app.json` (add `"slots": [{ "name": "db", "connector": "postgres" }]`; bump version to `1.0.2`), `app.spec.md` (remove every `## Scenario` section; describe the behaviors instead)
- Create: `behaviors/operations.cs`, `behaviors/run-on-change.cs`, `behaviors/run-on-filter.cs`, `behaviors/run-on-row.cs`, `behaviors/run-on-tick.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs` if a fact requires `tests.cs` per app

**Interfaces:**
- Registry: unchanged (`IText` at `{app}/views`, JSON `View[]`, `TextChanged`).
- Postgres key: `ConnectionKeys.For(brain.Setting("Brain")!, "postgres", brain.Setting("Account__db")!)`; when `Account__db` is empty a SQL view's status card reads Title `Error`, Body `Connect a Postgres database to this app.`
- The shared `Run(view)` (SQL with bound parameters, app-table page + equality filter, table `Replace`, chart `Render`, status card `""`/`ok · n rows · time` or `Error`/message) is copied verbatim into each `run-on-*.cs`; the `View` record likewise.

- [ ] **Step 1:** `operations.cs` = today's `views.cs` minus nothing (it already is one reaction: app invoked); rename only.
- [ ] **Step 2:** `run-on-change.cs`: `await foreach (var _ in brain.On<TextChanged>(registry, brain.Stopping)) { foreach (var view in await Views()) await Run(view); }` with the resubscribe loop from today's runner (1 s delay after a stream end).
- [ ] **Step 3:** `run-on-filter.cs`: on start and on every registry change, (re)subscribe to each view's filter fields; on `TextFieldChanged` run that view. Keep the subscribe-before-run order and per-view cancellation from today's runner, but no channel: a run is awaited inline in the pump (the table's `Version` orders writes).
- [ ] **Step 4:** `run-on-row.cs`: same shape over `RowUpserted`/`RowDeleted` for `apptable:` sources. `run-on-tick.cs`: same over `ReminderTick` for `RefreshSeconds > 0`.
- [ ] **Step 5:** `app.spec.md` becomes a one-paragraph description plus a table "behavior → when → reacts". Delete `tests.cs`.
- [ ] **Step 6:** `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*EveryOsProgramAndTestsFileCompiles*"` passes; the whole OS unit suite shows only the ledgered baseline failures.
- [ ] **Step 7: Commit** `DataVisualizer: one behavior per reaction, a db slot, no tests`.

### Task 24: Verify live

Same as Task 12 steps 2-5 with these changes: bind a Postgres connection to the installed app's `db` slot through the Connections endpoint (`/brains/{id}/connections`, connector `postgres`, the Aspire-provisioned database's connection string) and the app settings endpoint; `show` a SQL view with a `country` filter; `neurons_get` the table (rows); `Input` `uk` on the filter field; `neurons_get` again; cite the trace from `ITextField.Input` to `ITable.Replace`. Commit fixes individually. There is no `os-defaults`-green criterion beyond publication.
