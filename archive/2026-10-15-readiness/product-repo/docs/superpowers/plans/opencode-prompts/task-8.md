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
### Task 8: LLM calls meter through ICostMeter (OpenCode, wave 2)

**Files:**
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Clients/AIClients.cs:46` and the chat/embedding client usage path
- Delete: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Metering/GrainIntentUsageSink.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/IntentContext.cs`, `Metering/IntentUsage.cs` — only after LSP `findReferences` shows every caller updated in this task
- Test: update `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests` facts that used the intent sink

**Interfaces:** After each model response with usage: `meter.RecordAsync(CostKind.Model, $"{model}:input", inputTokens / 1_000_000m, "mtok", funding, $"{responseId}:input")` and the same for cached / reasoning / output. `funding = Integration` when the client was built from a deployment Integration, `OwnConnection` when from the user's Connection, `Local` for a local model endpoint.

- [ ] **Step 1:** Failing fact `AChatResponseRecordsInputAndOutputCosts` using a scripted LLM and a recording `ICostMeter` fake.
- [ ] **Step 2–4:** FAIL → implement → PASS; the AI test project passes entirely.
- [ ] **Step 5: Commit** `"AI: model usage meters through the kernel"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
