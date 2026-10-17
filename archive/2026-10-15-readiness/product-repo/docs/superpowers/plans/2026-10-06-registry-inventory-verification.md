# Registry federation verification

Implementation revision: `ab8cc0e793266757cd681067200ba5ee702321d0` on `os`.
Verification date: 2026-10-05 (the ratified design/plan filenames are dated 2026-10-06).

## Unit suites

Each project was run separately with `dotnet test --project <project> -p:CodeGraphRefresh=false`.
Final verification used a clean worktree at the implementation revision because concurrent
Creator/App runtime work in the shared checkout was changing the build inputs. No solution-wide
test command was used. These are actual test-run summary counts:

| Suite | Succeeded | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Framework | 116 | 0 | 0 |
| Platform | 139 | 0 | 0 |
| Architecture | 35 | 0 | 0 |
| Apps | 117 | 0 | 0 |
| Time | 20 | 0 | 0 |
| Assistant | 80 | 0 | 0 |
| CSharp | 89 | 0 | 1 |
| Postgres | 74 | 0 | 3 |
| OS | 44 | 0 | 0 |
| **Total** | **714** | **0** | **4** |

Existing opt-in skips: CSharp's `ComposedQdrantSearchesTheRealVectorStore` requires
`DIGITALBRAIN_QDRANT_TEST_CONNECTION`; Postgres's `LivePostgresTablePagesFiltersAndAggregates`,
`LiveProviderReportsTheConnectedDatabaseAndEnforcesReadOnlyQueries`, and
`LiveTablesAreParameterizedIdempotentAndVisibleThroughTheReadDoor` require the documented
live Postgres connection variables. The new inventory isolation facts all ran.

## E2E suites

Sequential, per-project runs with the same command and default build-output paths:

| Suite | Succeeded | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Framework E2E | 15 | 0 | 0 |
| OS E2E | 18 | 0 | 2 |
| Platform E2E | 2 | 0 | 0 |
| Aspire Hosting E2E | 1 | 0 | 0 |
| **Total** | **36** | **0** | **2** |

Framework's final output:

```text
Test run summary: Passed!
  total: 15
  failed: 0
  succeeded: 15
  skipped: 0
  duration: 4m 25s 279ms
```

OS's final output:

```text
Test run summary: Passed!
  total: 20
  failed: 0
  succeeded: 18
  skipped: 2
  duration: 4m 51s 678ms
```

The two existing live golden journeys (`J1CustomersJourneyPassesGoldenThreshold` and
`J2aCardFormJourneyPassesGoldenThreshold`) require `DIGITALBRAIN_E2E_LIVE_MODEL=1` and
`DIGITALBRAIN_E2E_MODEL_API_KEY`. Scripted/browser journeys ran.

## Aspire smoke

Run from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` in the verification worktree:

```powershell
$env:DigitalBrain__Http__UiPort='55080'
$env:DigitalBrain__Http__McpPort='55081'
aspire run --isolated --non-interactive
```

Separate ports avoid the user's running development instance. Started the on-demand
`csharp-sandbox` with `aspire resource <name> start`. The final `aspire describe --format Json`
snapshot reported **38 / 38 resources Running and Healthy**, including IntoChat,
digitalbrain-mcp, FlutterShell, csharp-sandbox, and every Modules resource.

An initial overlapping smoke launch interrupted an E2E fixture; that run was discarded.
Initial smoke retries also exposed fixed-port contention and stale seeded integration endpoints
after port changes. The verification worktree's own disposable volumes were reset, then the
successful smoke ran from fresh state. The shared checkout's development instance and its
volumes were left intact. The verification AppHost and its disposable resources were stopped
after capturing health, before the final sequential E2E run.

## Review and rulings

One independent final review found a cross-provider census race: a provider's aggregate reads
could activate another domain's grain before that domain sampled liveness. A deterministic
failing regression reproduced it. The fix captures a single request-owned census before
fan-out; the regression and full Platform suite pass. An additional fact proves census
failure is attributed without losing a healthy provider's records and is retried next request.
Time fault-injection coverage proves missed index writes do not block scheduling/cancellation
or leave failed writes in the in-memory read model. No minor findings were deferred.

Implementation rulings, including coverage costs, are recorded in the design:

- A request owns a transient census snapshot; no cross-request cache. This prevents discovery's
  own reads changing another provider's liveness sample, but does not promise a transaction
  across independent user mutations of domain membership.
- Apps uses its existing membership and StorageFiles, including historical raw keys. Legacy
  unindexed installations are absent; historical tracked files may remain visible.
- Connections entries share their owning aggregate's type/key. Active describes that aggregate,
  not an independent activation for each connection.
- CSharp has an existing authoring catalog. Direct bypass callers are absent; app files belong
  to Apps coverage. Postgres likewise follows installed-app ownership and excludes direct or
  legacy owners without that membership path. No replacement indexes were built.
- Time's existing Start/Stop contracts implement the plan's Set/Arm intent. Best-effort index
  failures may leave missing/stale intent; timer execution remains activation-local. Unstamped
  starts and preexisting unscoped key semantics are outside per-brain coverage; this work does
  not add per-neuron ownership enforcement or persisted ownership state.
- Census records remain in-process; IRegistry remains DI-only. Flutter/GroupChat inventory and
  HTTP/script surfaces stay outside this change. The closed storage gate was not re-probed.
