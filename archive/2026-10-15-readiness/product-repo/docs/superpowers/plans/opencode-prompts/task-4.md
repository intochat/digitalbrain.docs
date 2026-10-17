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
### Task 4: AI module declares its own prices (OpenCode, wave 1)

**Files:**
- Move: `src/DigitalBrain.Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/PriceBook/pricebook.v0.json` → `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Pricing/models.prices.json` (embedded resource)
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Pricing/ModelPriceList.cs` (`internal sealed class ModelPriceList : IPriceList`), register in `AIModule` silo configuration as `IPriceList`
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/ModelPriceListFacts.cs`

**Interfaces:** Item grammar `"{model}:{input|cached|reasoning|output}"`, unit `"token"`, unit `"mtok"`: `MicrosPerUnit` returns `long` micros per **million** tokens (= `usd_per_million_tokens * 1_000_000`), and callers pass `quantity = tokens / 1_000_000m`.

- [ ] **Step 1: Failing fact**

```csharp
[Fact]
public void AKnownModelInputIsPricedPerMillionTokens()
{
    var list = new ModelPriceList();
    Assert.Equal(1_250_000L, list.MicrosPerUnit(CostKind.Model, "gpt-5.1:input")); // use a model + rate actually present in the json
}

[Fact]
public void AnUnknownModelIsNotPriced() => Assert.Null(new ModelPriceList().MicrosPerUnit(CostKind.Model, "nope:input"));
```

- [ ] **Step 2–4:** run → FAIL; implement by deserializing the embedded json once (static lazy) into `Dictionary<string,long>` of `usd_per_million_tokens * 1_000_000`; run → PASS.
- [ ] **Step 5: Commit** `"AI: models declare their own prices"` (do **not** delete the Compute copy; Task 11 does).
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
