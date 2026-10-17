You are implementing ONE task of a plan in the C# / Orleans repo at E:\intochat\digitalbrain (branch os-runtime). Other agents are editing other projects in the same tree at the same time.

HARD RULES
- Touch only the files listed in the task's **Files** block (plus a new test file it names). If you truly need another file, stop and explain instead.
- Do NOT run git (no commit, no checkout, no stash). Do not read NuGet package XML docs.
- ASCII only in source. No ConfigureAwait(false) in grain code. No /// <summary> boilerplate.
- The shared contracts already exist; read them first, use their exact names:
  src/DigitalBrain/Signals/Trace.cs, src/DigitalBrain/Signals/Signal.cs, (Cost, CostKind, CostRow, CostSummary, UsageGrouping live in namespace DigitalBrain.Framework.Compute)
  src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/{TraceContext.cs,ICostMeter.cs,IPriceList.cs,Cost.cs,CostSummary.cs}
- Read CLAUDE.md for repo conventions. Build per project (dotnet build <csproj>), never the .slnx. Tests: dotnet test --project <test project dir> -- --filter-class "*Name*".
- Test project names: Framework unit tests = src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit ; Platform unit tests = src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit ; AI = src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests ; CSharp = src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests . Follow patterns of existing facts in those projects (harness, naming).
- Kill any test run that exceeds 5 minutes and fix the hang rather than waiting.
- Stop when the task's tests pass and the touched projects build with 0 warnings. Finish by printing the list of files you changed.

GLOBAL CONSTRAINTS

- Build and test per project, never the `.slnx`: `dotnet build src/<path>.csproj`, `dotnet test --project <test project>`.
- Warnings are errors, nullable on, central package versions; no new packages.
- Grain state uses concrete arrays, never `IReadOnlyList`.
- No `ConfigureAwait(false)` in grain code. ASCII only in source (no fullwidth punctuation).
- No `/// <summary>` boilerplate; tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- No state compatibility, no migrations, no legacy shims: delete replaced code in the same task.
- Money is `long` micros everywhere. Never `decimal`/`double` in ledger state.
- Commit explicit files only (`git add <file> <file>`), never a directory.

YOUR TASK
### Task 7: Platform usage aggregation (OpenCode, wave 3)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/IUsageGrain.cs`, `UsageGrain.cs`, `UsageState.cs`
- Test: `src/Testing/DigitalBrain.Platform.Tests/UsageFacts.cs`

**Interfaces — Produces:** `internal interface IUsageGrain : IGrainWithStringKey` (key = brain id): `Task Add(Cost cost); Task<CostRow[]> Group(UsageGrouping by, DateTimeOffset since, int take); Task<Cost[]> Recent(int take);`. State: `Cost[] Recent` (ring buffer, last 5_000) and `UsageBucket[] Daily` where `UsageBucket(string Day, UsageGrouping By, string Key, long Micros, long Count)`. Group reads buckets; key for `Origin` is the trace origin — so `Cost` alone is not enough: store `Origin` in the bucket by having `Add(Cost cost, string origin)`. **Use this signature: `Task Add(Cost cost, string origin)`.** Task 6 passes `TraceContext.Current?.Origin.ToString() ?? "untraced"`.

- [ ] **Step 1: Failing facts** — `UsageGroupsByAppSynapseNeuronAndOrigin`, `TheMostExpensiveComesFirst`, `RowsSinceExcludeOlderDays`, `UsageSurvivesReactivation` (concrete arrays).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `"Platform: per-brain usage aggregation"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
