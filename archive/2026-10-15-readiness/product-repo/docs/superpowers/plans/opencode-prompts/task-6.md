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
### Task 6: Platform cost meter with budgets and the fee (OpenCode, wave 4)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/CostMeter.cs` (`internal sealed class CostMeter : ICostMeter`), `FeeOptions.cs`, `ITraceBudgetGrain.cs`, `TraceBudgetGrain.cs`
- Modify: Platform hosting registration (the file that registers Platform services; find it via LSP `findReferences` on an existing Platform `AddSingleton`) — register `ICostMeter`, bind `FeeOptions` from `DigitalBrain:Platform:Fees`
- Test: `src/Testing/DigitalBrain.Platform.Tests/CostMeterFacts.cs`

**Interfaces:** Consumes `ICostMeter`, `IPriceList` (all registered instances, first non-null wins), `ILedgerGrain` (Task 5), `IUsageGrain.Add(Cost cost, string origin)` (Task 7; origin = `TraceContext.Current?.Origin.ToString() ?? "untraced"`). `FeeOptions { int PlatformPercent = 25; }`. `ITraceBudgetGrain` (key = TraceId): `Task<bool> TrySpend(long micros, long budget)`.

Pricing rule: `listMicros = ceil(MicrosPerUnit * quantity)`; `Local` / `OwnConnection` → `Micros = 0`; `Integration` → `Micros = listMicros + ceil(listMicros * PlatformPercent / 100)`. Unpriced item → `Micros = 0` and a warning log `"Unpriced {Kind} {Item}"`.

- [ ] **Step 1: Failing facts** — `AnIntegrationCallIsChargedListPlusTheFee` (list 1000 → 1250), `AnOwnConnectionCallIsMeteredAtZero`, `ACallOverBudgetThrowsAndChargesNothing` (Review Focus 3), `NoCurrentTraceChargesTheCallersBrainUntraced`, `TheCostLandsInTheBrainUsage`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `"Platform: cost meter with budgets and fee"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
