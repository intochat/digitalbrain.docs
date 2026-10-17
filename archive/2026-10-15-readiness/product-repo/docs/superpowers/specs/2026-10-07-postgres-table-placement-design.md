# Postgres table placement replaces the Capacity facet

Ratified 2026-10-07 (grilling session, all recommendations accepted).

## Problem

`Framework/Capacity` (`ICapacity`, `ICapacityConfiguredSource`, `ICapacityProvisioner`,
`CapacityUnavailableException`) and `Platform/Capacity` (`CapacityResolver`, `AddCapacity`) were
introduced 2026-10-01 to give local `aspire run` one database per brain while production shared one
database. The facet has one consumer (`TableNeuron.Define`), one kind (`"postgres"`), an unread
`CapacityScope.AppId`, an unread `ResolvedCapacity.Kind`, a `"platform"`/`"db:…"` origin-string
protocol, `":inactive"` kinds that encode a boolean, and an exception two HTTP mappers special-case.

It is a third owner of "where does a brain's data live", next to Integration (deployment) and
Connection (user). The path apps use (`ITable`) never consults Connections, and local and
production isolate brains differently.

## Decisions

1. **Delete the Capacity facet** in Framework and Platform with its tests, `AddCapacity()`,
   `ProvisionPerBrain`, `PostgresConfiguredSource`, `InactivePostgresProvisioner`,
   `PostgresCapacityKind` and the origin strings.
2. **App-declared slot.** An app redirects its tables by declaring the reserved slot
   `{"name": "tables", "connector": "postgres"}` in `app.json`. Binding it (`IApp.Configure`) to one
   of the brain's Postgres Connections places the app's tables there. Unbound or undeclared means
   the platform default. The slot is optional: `ITable` works without it. *(Reserved name chosen
   during planning: DataVisualizer's `db` Postgres slot means "the database I visualize", so "any
   Postgres slot" would be ambiguous.)*
3. **Placement is typed and pinned** at the first `Define`: `TablePlacement` is
   `Shared | BrainDatabase(name) | Connection(key)`. Every later operation uses only the pinned
   value. A change to the slot binding or the deployment policy never moves an existing table.
4. **Rebinding is refused while tables exist.** `IApp.Configure` changing an existing `tables`
   binding is refused (409) when the app owns any table. This goes through `IAppStorageHook`, so
   Apps stays unaware of Postgres.
5. **Unavailable means refuse.** A pinned Connection that is revoked or unreachable throws
   `PostgresUnavailableException`, and the request returns 503. There is never a fallback to Shared.
6. **Deployment isolation policy:** option `DigitalBrain:Modules:postgres:Options:Isolation` =
   `Shared` (code default) | `DatabasePerBrain`. `DatabasePerBrain` creates `brain_<sha256[..16]>`
   on first use over Integration secret `postgres:AdminConnection`, which is required and validated
   at startup when that policy is selected. The AppHost sets `DatabasePerBrain`. One code path runs
   locally and in production.
7. **The isolation policy does not apply inside a Connection database.** Tables go into the user's
   database under their usual physical names.
8. **Under `Shared`,** brains stay apart through today's brain-scoped physical table names.
9. **Framework `ServiceUnavailableException`** (maps to 503 in `ModuleRouteGuard` and the script
   edge) replaces `CapacityUnavailableException`. `PostgresUnavailableException` derives from it,
   which also fixes outages currently returning 409 (it derived from `InvalidOperationException`).
10. **The Connection credential never leaves its neuron.** Table operations for a `Connection`
    placement run inside `PostgresServerNeuron` (the connection's own grain) through an internal
    `IPostgresTableHost` contract.

## Out of scope

Moving existing tables between placements. A per-brain isolation choice (tiers). A schema per
brain under `Shared`. A publish-gate check that an app using `ITable` declares the slot.
