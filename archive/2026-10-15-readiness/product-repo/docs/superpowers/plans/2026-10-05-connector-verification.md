# Connector migration verification

Implementation remains on branch `os`. Builds and tests ran by project, never through the solution. All prior serializer IDs were compared before adopting renamed CLR keys; compatibility notes are in `2026-10-05-connector-identity-migration.md`.

## Passing checks

| Project / check | Result |
| --- | --- |
| Framework unit, including renamed enum identity anchors | 114 passed |
| Platform unit, including legacy JSON and connection reactivation | 129 passed |
| Platform durable identity migration and E2E port isolation | 2 passed |
| Framework end-to-end, including idle/J1 trace budgets | 15 passed, 0 skipped |
| OS unit and retired configuration guards | 43 passed |
| OS end-to-end | 19 passed, 0 failed, 2 optional live-model skips |
| Architecture, including module credential boundaries and persisted identity baseline | 35 passed |
| AI | 105 passed |
| CSharp | 80 passed |
| Salesforce | 16 passed |
| Gmail | 13 passed |
| GitHub runtime / hosting | 14 / 4 passed |
| Supabase runtime / hosting | 67 / 3 passed |
| ClickHouse | 7 passed |
| Postgres runtime / hosting | 77 / 8 passed; all 3 live database cases exercised, 0 skips |
| Apps / Assistant | 114 / 64 passed |
| Flutter C# runtime / hosting | 92 / 7 passed |
| Flutter shell | `flutter analyze`: no issues; `flutter test`: 122 passed |
| Client / Client.Orleans | 3 / 15 passed |
| MCP | 8 passed |
| Deployment | 5 passed |
| Aspire hosting | 24 passed |
| Module testing harness | 12 passed |
| AppHost and transitive production projects | Build succeeded, 0 warnings and 0 errors |
| Changed module hosting/deployment projects | Passed; details in per-area reports |
| Whitespace | `git diff --check` passed |

## Aspire smoke

Ran `aspire run --no-build --detach --non-interactive --format Json` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` after a successful build. The final repeat build succeeded with zero warnings and errors. At 2026-10-05 05:41:39 UTC, **38 monitored resources were Healthy**, with no unhealthy resources. IntoChat, digitalbrain-mcp, and FlutterShell were Running/Healthy, as were Postgres, Supabase, ClickHouse, Qdrant, storage, and the configured AI resources.

Four resources had no health check and correctly remained NotStarted: the deployment-only Azure environment, on-demand CSharp sandbox, and the two rebuild helpers. No resource was waiting or failed. Stopped the AppHost with `aspire stop`; persistent containers and data were preserved.

For this local smoke, the existing AppHost user-secret Supabase connection was copied into its canonical `DigitalBrain:Integrations:supabase:ConnectionString` seed key. No credential values were written into repository files.

## Final end-to-end run

Framework E2E passed all 15 tests with no skips in 3m33s. OS E2E passed 19 tests with no failures in 6m45s; two optional live-model tests were skipped because their explicit live-provider configuration was not enabled. Both runners exited successfully.

Coverage includes idle/J1 trace budgets, browser query and table flows, user-authorized Supabase Connections, and CSharp sharing/install with the recipient's Connection. Test hosts isolate HTTP ports and seed the production-mode CSharp signing key. Database providers check Integration readiness on each operation and reuse materialized clients only while the Integration revision remains unchanged. Final run logs and fixture details are recorded in `e2e-migration-report.md`.

## Review fixes verified

- Atomic Integration release keeps settings, revision, and credential pairs coherent during updates. AI, Gmail, Salesforce, and GitHub consume that release for multi-field operations.
- Already resolved AI clients observe revision changes and credential removal.
- Supabase user connections do not depend on deployment backing-store credentials; explicit backing-store selection controls startup and health validation.
- Gmail OAuth starts from a named Connection, verifies mailbox ownership, binds state to principal/account/brain/connection and rejects unbound/replayed state, and protects callback telemetry. Signed Google Pub/Sub pushes fan out only to matching active Connections.
- Existing JSON names, aliases, grain keys, storage names, and member IDs remain stable. Legacy authentication methods are inferred only when unambiguous.

Per-area evidence: `ai-migration-report.md`, `oauth-migration-report.md`, `database-migration-report.md`, `publishing-migration-report.md`, `gmail-migration-report.md`, `shell-migration-report.md`, and `e2e-migration-report.md`. Review records: `core-review.md` and `module-review.md`.

## Live Postgres validation

A new task-owned ephemeral Postgres 18.3 container enabled all three previously gated tests without touching existing databases. The final full run passed 77/77 with zero skips. Coverage includes provider/schema metadata, table paging/filtering/aggregation, parameterized and idempotent writes, authorization boundaries, and deactivation/reactivation. The fixture explicitly verifies that an App cannot use the deployment-wide raw SQL door; trusted test inspection then checks persisted data. The container was removed after verification of its exact identity. Passwords stayed in child-process environment variables and were not logged.
