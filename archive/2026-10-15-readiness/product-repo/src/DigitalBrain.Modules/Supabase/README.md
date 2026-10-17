# Supabase

## A person's Supabase database is a postgres connection

A Supabase database is a Postgres database. A person adds theirs as a connection of the
**postgres** connector, named by them (for example `{brain}/connection/postgres/supabase`), holding
the Supabase connection string. `IPostgresServer.ReadSchema` / `Query` serve it, and the Data
Visualizer's `db` slot binds to it. This module declares no connector, neurons or endpoints.

## Deployment backing store

The module keeps only what is Supabase-specific: the deployment backing tier. It uses Integration
`supabase:ConnectionString` (provisioned at `DigitalBrain:Integrations:supabase:ConnectionString`) and
is selected by ordinary option `UseBackingStore` under `DigitalBrain:Modules:supabase:Options`.
Selecting it requires a valid provisioned credential at startup, and the `supabase` health check pings
it. Deployments that do not select it leave the tier off. Hosting helpers that select a managed or
external backing store also enable that option.
