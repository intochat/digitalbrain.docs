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
### Task 3: The kernel stamps and carries the trace (OpenCode, wave 1)

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs:55-61`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/NeuronCallFilter.cs:23-34`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/CallerContextStamper.cs` (begin a trace when stamping at a trusted edge)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/TraceOutgoingFilter.cs` + register in `Runtime/Hosting/BrainHosting.cs:22-23`
- Test: `src/Testing/DigitalBrain.Framework.Tests/TraceFacts.cs` (create; if the Framework test project is named differently, put it next to existing `NeuronCallFilter` facts)

**Interfaces:** Consumes `Trace`, `TraceContext` (Task 2). Produces: every published signal has `Trace == TraceContext.Current` (or null if none); every outgoing grain call carries `RequestContext["digitalbrain.trace"]`.

- [ ] **Step 1: Failing facts**

```csharp
public sealed class TraceFacts
{
    [Fact]
    public async Task APublishedSignalCarriesTheCurrentTrace()
    {
        await using var host = await ModuleTest.Create().WithModule<TestNeuronModule>().StartAsync(TestContext.Current.CancellationToken);
        var trace = TraceContext.Begin("acct-1", "brain-1", new NeuronId("brain-1/button"));
        using var _ = TraceContext.Enter(trace);
        var signal = await host.PublishAndCaptureAsync(new Clicked(), TestContext.Current.CancellationToken);
        Assert.Equal(trace.TraceId, signal.Trace?.TraceId);
    }

    [Fact]
    public async Task AUserSetTraceIsOverwrittenAtPublish()
    {
        // publish a signal with Trace = forged; expect Trace == TraceContext.Current (null here)
    }

    [Fact]
    public async Task KernelDeliveryKeepsTheTraceWhileStrippingTheCaller() { /* NeuronCallFilter path */ }

    [Fact]
    public async Task AReactionInAnotherBrainKeepsTheOriginalPayer() { /* Review Focus 1 */ }
}
```

Use the harness helpers that already exist in `DigitalBrain.Testing.Module`; where `PublishAndCaptureAsync` does not exist, capture via an `INeuronObserver` exactly like existing Framework signal facts do.
- [ ] **Step 2: Run** `dotnet test --project <framework test project> -- --filter-class "*TraceFacts*"` → FAIL.
- [ ] **Step 3: Implement**
  - `PublishAsync`: `var stamped = signal with { Publisher = Id, Trace = TraceContext.Current };`
  - `TraceOutgoingFilter : IOutgoingGrainCallFilter`: if `TraceContext.Current` is set and `RequestContext.Get(key)` is null, set it.
  - `NeuronCallFilter` strip block (lines 23-34): when removing the caller context for a kernel delivery, enter `TraceContext.Enter(signal.Trace)` for the call duration if the delivered signal has one.
  - `CallerContextStamper.Stamp`: if no trace is current, `TraceContext.Enter(TraceContext.Begin(caller.AccountId, caller.BrainId, origin))` where `origin` is the edge neuron id when known, else `NeuronId` of `{brain}/edge`.
- [ ] **Step 4: Run** the facts → PASS; then the whole Framework test project → PASS.
- [ ] **Step 5: Commit** explicit files: `"Kernel: signals and calls carry the trace"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
