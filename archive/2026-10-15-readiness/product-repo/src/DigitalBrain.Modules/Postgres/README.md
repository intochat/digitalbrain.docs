# Postgres table neurons

`IPostgresTable` is a script-visible contract in the module's Contracts assembly.
It offers `Define`, `Upsert`, `Delete`, `Read`, and bounded `Page` operations.
The existing `IPostgres.Query` guard and server-side read-only transactions are unchanged.

Choose a unique grain key for each installed table. First `Define` permanently binds
that neuron to the kernel-stamped brain and app identity. All subsequent operations,
including reads and repeated definitions, require the same owner. No method accepts
a scope or physical table name. The physical name hashes the stamped scope and grain
key; guessing another neuron's key cannot grant access to its rows. Unstamped calls
are refused. Host-bound behavior files share their installed app's `AppId`; standalone
scripts retain file-scoped identity. This does not add cross-app sharing.

Definitions contain up to 32 columns, using `text`, `number` (Postgres `numeric`),
`boolean`, `timestamptz`, or `jsonb`, and one or more primary-key columns. Identifiers
are ASCII letters/digits/underscores, up to 63 characters, starting with a letter or
underscore. Validated identifiers are also quoted to preserve case and reserved words.
Definitions may reorder columns, but changing their names, types, or keys is refused.
Creation and physical-schema validation run under a transaction-scoped advisory lock.
Accepted definitions, ownership, and revision are persisted as concrete-array grain state.

`TableValue.Json` contains one JSON value. Keys must supply exactly the primary-key
columns; upserts supply every remaining column, using JSON `null` for absent values.
All values use database parameters. Upserts return `true` for an insert or changed row,
and `false` for an identical retry. `Delete` returns whether a row existed. Paging is
ordered by the primary key, with a nonnegative offset and a limit of 1–1000.
Rows remain in Postgres, not grain state. No schema migration or automatic timestamp
is implied: callers supply timestamps as data, including a timezone.

`TableDefined`, `RowUpserted`, and `RowDeleted` carry table identity and, for row
changes, key values. The kernel stamps the publisher. Unchanged retries do not publish
another row signal. Database changes and signal publication are separate operations,
following the module's existing publication convention; this is not a transactional outbox.

`Define` returns the physical table name for existing database readers. These are
ordinary tables in `public`. The existing general SQL read surface retains its
configured database-role visibility; table-neuron ownership does not change that
surface's read permissions.

A database a person adds is a `postgres` connection, `{brain}/connection/postgres/{id}`, served by
`IPostgresServer` (`ReadSchema`, `Query`). The assistant and `digitalbrain-mcp` reach it through
`neurons_call`; data is shown by the Data Visualizer app, whose `db` slot binds to that connection.

## Assessment before implementation

The existing unit suite covered read-query normalization and refusal of writes,
schema/connection reads, connection validation, typed cell conversion, keyed pool
wiring, Aspire hosting, and selection of the Postgres live-table read source.
`PostgresTestControls` was a canned `IPostgresProvider` fake, with no writable storage.
`PostgresProviderFacts` and the live-table fact used the optional
`DIGITALBRAIN_POSTGRES_TEST_CONNECTION` gate. CustomerResearcher's
`PostgresResearchFacts` used `CUSTOMER_RESEARCH_TEST_POSTGRES` for its parameterized,
workspace-filtered store. Supabase and ClickHouse likewise separated guard rejection
tests from provider-backed behavior tests. Missing coverage included declarative
schemas, write semantics, retries, scope enforcement, reactivation, and signal provenance.
Actual parameterization and database constraint behavior required live tests; an
in-memory provider alone could not verify them.

`PostgresWriteTableFacts` adds real-grain tests with an in-memory table provider, plus
a live fact accepting either gate above. Its customer-research example uses only
`IPostgresTable`, retaining the business columns and JSON evidence while replacing the
caller-supplied workspace column with enforced table ownership. The compiled
CustomerResearcher module and its store were since removed: the shipped
customer-researcher package writes through `IPostgresTable` from its behavior script.

Run tests per project:

```powershell
dotnet test src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests.Unit
```

The requested `docs/superpowers/specs/2026-09-29-programmable-brain-vision-design.md`
was absent from this checkout. `CLAUDE.md` supplied the four-word model and persistence rules.

## Verification on 2026-10-01

Both project test commands built successfully and passed against the local Aspire
Postgres instance: Postgres 50/50 and CustomerResearcher 12/12, with no skipped tests.
`aspire run --detach` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` started successfully.
All running resources reported Healthy. The configured sandbox, rebuild helpers,
and Azure environment remained NotStarted.

## Connections and deployment credentials

The module's ConnectorDefinition declares supported authentication methods and Integration
dependencies. Platform delivers credentials through scoped async Integration handles; credential
values never belong in module options. User authorizations are per-brain connection neurons holding
sealed credentials. The offered connector catalog is `GET /connectors`, and user connections are managed
at `/brains/{id}/connections`. Provision deployment credentials with
`DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under `DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Postgres requires Integration `postgres:ConnectionString` for its selected platform source.
Optional secret `AdminConnection` is required, and validated at startup, when option
`DigitalBrain:Modules:postgres:Options:Isolation` is `DatabasePerBrain` (the code default is `Shared`;
the AppHost selects `DatabasePerBrain`). Both are released through module-scoped handles after Platform
seeding.

## Table placement

A table's placement is typed and pinned at its first Define: `Shared` (the platform database, brains
kept apart by brain-scoped physical names), `BrainDatabase` (`brain_<sha256[..16]>`, created on first
use over `AdminConnection` under `DatabasePerBrain`), or `Connection` (the user's own database). An app
redirects its tables by declaring the reserved slot `{"name": "tables", "connector": "postgres"}` and
binding it to one of the brain's Postgres connections; the isolation policy does not apply there.
Connection table operations run inside the connection's neuron, so its credential never leaves it.
A pinned table never moves: rebinding `tables` is refused (409) while the app owns tables, and an
unavailable placement answers 503 (`ServiceUnavailableException`), never a fallback to Shared. The Postgres owner migration
is invoked by Platform's narrow startup service after credential initialization.
