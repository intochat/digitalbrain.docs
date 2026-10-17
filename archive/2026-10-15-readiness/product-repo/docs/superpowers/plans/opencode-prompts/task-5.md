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
### Task 5: Platform ledger grain (OpenCode, wave 2)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/ILedgerGrain.cs`, `LedgerGrain.cs`, `LedgerState.cs`
- Test: `src/Testing/DigitalBrain.Platform.Tests/LedgerFacts.cs` (or the existing Platform test project)

**Interfaces — Produces:**

```csharp
internal interface ILedgerGrain : IGrainWithStringKey   // key = account id
{
    Task<long> Balance();
    Task<bool> Charge(Cost cost);          // false when already charged (TraceId, CostId); throws BudgetExhaustedException via budget check in Task 6, not here
    Task Credit(string entryId, long micros, string reason);
    Task<LedgerEntry[]> Entries(int take);
    Task<bool> Verify();                   // recomputes the hash chain
}
[GenerateSerializer] public sealed record LedgerEntry([property: Id(0)] string EntryId, [property: Id(1)] long Micros, [property: Id(2)] string Reason, [property: Id(3)] DateTimeOffset At, [property: Id(4)] string PrevHash, [property: Id(5)] string Hash);
// LedgerState: long Balance; LedgerEntry[] Entries; string[] RecentKeys (last 10_000 idempotency keys)
```

Hash = SHA-256 hex of `$"{PrevHash}|{EntryId}|{Micros}|{Reason}|{At:O}"`; genesis PrevHash = `""`. Charge entry id = `$"{cost.TraceId}/{cost.CostId}"`, micros negative. Grain is a plain Orleans grain with `[PersistentState("ledger")]`, not a neuron.

- [ ] **Step 1: Failing facts** — `ChargingTheSameCostTwiceChargesOnce`, `CreditThenChargeLeavesTheDifference`, `ARewrittenEntryFailsVerification` (mutate state via a test-only seam or by constructing state directly), `BalanceSurvivesReactivation` (deactivate via harness, read again).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `"Platform: hash-chained ledger"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
