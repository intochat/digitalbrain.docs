# DataVisualizer: data logic is a behavior, not a contract

Draft 2026-10-06. Answers "why is `DigitalBrain` full of things that are not the four words"
and "how does a UI table show live Postgres rows with filters the user changes".

## Diagnosis

The OS has one type system: C#, compiled, with the rule "the type system is the grammar". A second,
runtime-interpreted one grew in the gaps wherever two neurons wanted to agree on data *and logic*
without a script between them. Logic got encoded as data, and every source had to interpret it.

There are two instances of that second type system today, and neither is acknowledged:

1. **`DigitalBrain.Data`** in the kernel: `IRowSource`, `IStoredRows`, `RowQuery` (string operators,
   aggregates, `Check`, `Degrade`), `SourceCapabilities`. Interpreted by `RowQuerySql`,
   `RowQueryEvaluator`, `PostgresRowSourceNeuron`, `SupabaseRowSourceNeuron`, and read through by
   `ITable.Bind` / `IChart.Bind`. **Nothing in production calls any of it.** No Dart screen mirrors
   `SourceNeuronId` or `Query`. It is dead weight that pulled a module-sized concern into the ring
   that is supposed to hold four words.
2. **Supabase live tables**: `ISupabaseTable` (`CreateFromQuery`, `UpdateView` with filters, sort,
   visible columns, `Aggregate`, `ReadSummary`), `QueryPlanCompiler`, `SupabaseTablePolicy`,
   `SupabaseTableReadPolicy`, `LiveTableWindows`, `TableEndpoints`, `LiveTableJson`, the Postgres.Windows
   tools, and the Dart `TableSnapshot` / `TableViewUpdate` / `updateWorkspaceTable`. **This is the path
   the shell and the Assistant use.** It is a query language with a UI, hosted in a vendor module,
   that also serves `postgres` and `postgres-app:*` sources.

Both exist for the same reason: nobody wanted to write the behavior. The four-words design already
says where the logic goes. A filter box is an edge neuron a human drives; a table is an edge neuron a
human reads; Postgres is an edge neuron; the thing that joins them with filtering and reactivity is a
**behavior**, exactly as `On<Clicked>(button)` is the same mechanism as `On<Posted>(elon)`.

The same diagnosis covers the other kernel folders. `Enforcement/`, `Types/` and `Integrations/`
landed in `DigitalBrain` because a module contract took a Framework shape as a parameter
(`IAllowanceLedger.AuthorizeAsync(CallRequest)`, `IForm.SetSecret(SecretRef)`, `FieldKind` on form
fields) and the only assembly both sides could see was the kernel.

## Doctrine

1. **C# is the only type system.** No declarative query, filter or field-kind language crosses a
   neuron contract. Transformation, filtering, grouping and joining are LINQ or SQL written by a
   behavior.
2. **Modules are neurons and signals.** Postgres answers SQL and reports schema. Flutter renders what
   it is given and signals what the human did. Neither knows about the other.
3. **A module contract owns its inputs.** A `*.Contracts` assembly references `DigitalBrain` and other
   `*.Contracts` only. It never takes a Framework shape; the module runtime maps.
4. **Logic with reactivity is an app.** `DataVisualizer` is a first-party OS app made of behaviors,
   shipped from `src/DigitalBrain.OS/Apps`, verified and published at startup like Assistant and
   Settings. It encapsulates every piece of data-view complexity.
5. **The kernel is the four words.** After this work `DigitalBrain` holds `INeuron`, `IBrain` and its
   three shapes, `IDigitalBrain`, `INeuronObserver`, `ISignalSubscription<T>`, `Signal`, and the two
   attributes. `VocabularyRingFacts` allows one namespace and no allowlist.

## What DataVisualizer is

An OS app at `src/DigitalBrain.OS/Apps/DataVisualizer`, account `os`, registered in `OsApps`.

**A view** is `{ id, title, kind: table | chart, source, sql, filterColumns[] }`. `source` names a
neuron: a brain's `IPostgresServer` (`postgres`), an `ISupabase`, or an app-owned `postgres.table`.
The SQL is the program for that view. Filters are *parameters* of it, never concatenated text.

**Operations** (`app.json`):

| Operation | Input | Effect |
|-----------|-------|--------|
| `open` | | Composes the app surface: list of views, "new view" form. |
| `show` | JSON view definition | Creates the view, runs it once, opens a window: filter fields above a table, or a chart. Answers the view id. |
| `refine` | `{ view, filters }` | Sets filter values and re-runs. Used by the Assistant; the human uses the fields. |
| `read` | `{ view }` | Answers the current rows as JSON (Assistant tool replacement for `table_read`). |
| `close` | `{ view }` | Removes the view and its window. |

**Behaviors**, one per concern:

- `views.cs`: answers operations, keeps the view registry, composes windows. The registry lives in an
  app-owned `postgres.table` named `views` (the storage the Apps module already gives apps and retires
  through `IAppStorageHook`). Rebuilding windows from the registry on start is idempotent.
- `runner.cs`: runs a view's SQL with its current filter values through `IPostgresServer.Query` (or
  `ISupabase.Query`), maps columns and rows with LINQ, and calls `ITable.Replace` or `IChart.Render`.
  Re-runs on `RowUpserted` / `RowDeleted` from app-owned tables the view reads, and on `ReminderTick`
  for a view that asked for a refresh period.
- `filters.cs`: `On<TextChanged>(filterField)` and `On<Selected>(filterSelect)` per view; writes the
  value into the view's filter set and asks the runner to re-run. This is "change the live query from
  the UI".

**Reactivity**, honestly: Postgres has no change feed and we will not add triggers to user databases.
Live means: re-run on filter change, re-run on app-table signals, re-run on a reminder. That is a
connector property, and adding `LISTEN/NOTIFY` later is a Postgres module feature, not an app change.

**Tests** (`tests.cs`), deterministic over a scratch copy with scripted connectors:

- show a table view over an app-owned table and read the rows back
- typing a filter value replaces the rows with the filtered set and the SQL carried parameters
- a chart view renders points from an aggregate query
- an upsert into the source table re-renders the view
- restarting the behaviors rebuilds the same windows, no duplicates
- closing a view removes the window and the registry row

Scenarios against a real Postgres server are "(live)" and exempt from the gate.

## Module changes DataVisualizer needs

- **Postgres**: `PostgresQuery` gains `PostgresParameter[] Parameters` (name, value as text, type
  hint); the provider binds them with Npgsql. `PostgresQueryGuard` unchanged. Same for
  `SupabaseQuery`.
- **Flutter**: `AppUiEndpoints` learns the `table` and `chart` kinds so an app surface can embed them
  (`OwnsUi` already accepts `/apps/` names). `ITable` keeps `Replace` and `Read`; `IChart` keeps
  `Render`, `Append`, `Read`. `TextField` and `Select` already publish the signals the filters need.
- **Apps**: nothing new if app-owned `postgres.table` is available in the scratch test harness. If it
  is not, the fallback is a keyed-document state neuron in the Apps module; that is a contract
  addition and gets its own bounded design before it is built.

## Ordered plan

Each stage ends green: LSP clean, affected projects built, their unit and E2E suites run, and for
stages 3 and 4 the running system driven through `digitalbrain-mcp` and confirmed in traces.

### Stage 1. Delete the orphaned kernel data layer

Zero production callers, so this goes first and thins the kernel immediately.

Delete:
- `src/DigitalBrain/Data/*` (four files)
- `src/DigitalBrain.Framework/DigitalBrain.Framework/Data/*` (`StoredRowsNeuron`, `RowQueryEvaluator`,
  `RowQuerySql`, `RowCells`)
- `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Data/RowSourceAddress.cs`
- `IPostgresRows.cs`, `PostgresRowSourceNeuron.cs`; `ISupabaseRows.cs`, `SupabaseRowSourceNeuron.cs`
- `ITable.Bind`, `SetView`, `TableState.Sort/Filter/SourceNeuronId/Query`; `IChart.Bind`,
  `ChartState.SourceNeuronId/Query`; the read-through branches in `TableNeuron.Read` and
  `ChartNeuron.Read`; `UiKitEndpoints` `tables/{name}/view`
- Dart: the dead `readTable`, `createTable`, `updateTableView` in `ui_client.dart`

Tests: remove `StoredRowsFacts`, `RowQuerySqlFacts`, `PostgresRowSourceFacts`,
`SupabaseRowSourceFacts`; trim `ViewFacts` to `Replace`/`Render`; drop the `IRowSource` assertions in
`ScriptEdgeFacts`; remove `DigitalBrain.Data` from `VocabularyRingFacts.Namespaces`.

Verify: build `DigitalBrain`, `Framework`, `Flutter`, `Postgres`, `Supabase`; run their suites plus
`Architecture.Tests`, `Microsoft.CSharp.Tests`; `flutter analyze` and `flutter test` in the shell.

### Stage 2. Module primitives

Three bounded changes, independent of each other, each with its own facts:

- 2a Postgres and Supabase: parameterised `Query`.
- 2b Flutter: `table` and `chart` kinds in `AppUiEndpoints`, Dart renders them inside an app surface.
- 2c Confirm app-owned `postgres.table` works in `ModuleTest` scratch installs (a fact in
  `Apps.Tests`); if not, design the state neuron.

### Stage 3. DataVisualizer app

- Write `app.spec.md` first (the program), then `tests.cs`, then the three behaviors, in that order,
  the way the Creator does it.
- Register `new OsApp("os", "datavisualizer")` in `OsApps`.
- Startup verification must publish it green.
- Drive it live: `neurons_call` the app's `show` with a SQL view, `neurons_get` the table state, call
  the filter `TextField.Set`, read the table again, and follow one trace from the `TextChanged` signal
  to `ITable.Replace`.

### Stage 4. Retire the Supabase live-table system

Depends on stage 3, because the Assistant loses its data tools otherwise.

- Assistant tools: `show_postgres_query_table`, `show_supabase_query_table`, `table_read`,
  `table_refine` become invocations of DataVisualizer's `show`, `read`, `refine` through
  `IApp.Invoke`. `postgres_schema` and `supabase_schema` stay.
- Delete Supabase `Windows/`, `Table/` (`ISupabaseTable` and its nine records, `QueryPlanCompiler`,
  both policies), `TableEndpoints`, `LiveTableJson`, and the Postgres.Windows tool wrappers that only
  fed `LiveTableWindows`. `PostgresAppResources` survives only if `postgres_schema` still needs it.
- Dart: remove `TableSnapshot`, `TableViewUpdate`, `readWorkspaceTable`, `updateWorkspaceTable`, and
  the filter UI in `workspace_app.dart` that posts to `/tables/{id}/view`. The table window becomes a
  plain `ITable` view inside the DataVisualizer surface.
- Delete their tests; add Assistant route facts for the new tool bodies.

### Stage 5. Finish thinning the kernel

Independent of stages 2 to 4; same principle, contracts own their inputs.

- 5a `Enforcement/` → `DigitalBrain.Framework.Enforcement`. `IAllowanceLedger.AuthorizeAsync` takes a
  Compute-owned `AllowanceRequest`; `AllowanceCallFilterStage` maps from `CallRequest`.
  `CallerContext`, `CallerKind`, `TrustedEdge` move with it; no contract uses them.
- 5b `Types/` → `DigitalBrain.Framework.Types`. `IForm` gets its own `FormFieldKind` and
  `FormSecret(reference, label, isSet)`; `FormNeuron`, `AppUiEndpoints` and `WorkspaceFormTools` map.
  `TypeValidationException` stays a wire exception, declared beside `IForm`.
- 5c `Integrations/` → a new `DigitalBrain.Platform.Contracts` assembly (not `[PlatformAssembly]`),
  prepended in `ModuleInventory.ContractAssemblies()` next to the vocabulary so scripts can still
  request an account.
- 5d `VocabularyRingFacts`: `Namespaces = ["DigitalBrain"]`, empty allowlist. The kernel's `csproj`
  description becomes literally true.

## Out of scope

- A Postgres change feed (`LISTEN/NOTIFY`).
- Cross-app subscription scopes, renderable palette / UiPart, run-token tightening (open fronts).
- Any new shared "row" shape between modules. Behaviors map with LINQ.
