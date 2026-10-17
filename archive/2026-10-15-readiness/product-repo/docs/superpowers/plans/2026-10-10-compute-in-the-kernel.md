# Compute in the Kernel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This plan is executed by an orchestrator driving parallel OpenCode instances** — see "Orchestration" first.

**Goal:** Every piece of work runs inside a kernel-stamped *trace* (cause + payer + budget); every cost anywhere is recorded against it; the Compute module disappears into the Framework (vocabulary for modules) and Platform (ledger, accounting) rings; the shell's Compute screen shows balance and usage by origin / app / synapse / neuron.

**Architecture:** `Trace` joins `Signal` as kernel-stamped provenance (like `Publisher`). The Framework carries it on the grain call path (`RequestContext`) and into synapse processes (the existing `TraceParent` on `SignalBatchEvent`), and gives modules one seam, `ICostMeter`. The Platform implements the meter with two plain grains (not neurons, so no edge can address them): a hash-chained per-account `LedgerGrain` and a per-brain `UsageGrain`. Prices are declared by the module that owns the resource (AI declares model prices), not by a central price book. Budget enforcement moves from a call-filter stage to the meter: work stops where cost happens.

**Tech Stack:** .NET 11 RC, Orleans 10.3.1, xUnit v3 (`DigitalBrain.Testing.Module`), Flutter shell.

**Spec:** this document's "Design" section (ratified from the 2026-10-10 brainstorm: *missing causality is the main source of complexity*). Reference design for later phases: `E:\intochat\ComputeMesh` (ledger hash chain, micro-USD, fee split).

## Design (the spec this plan argues from)

1. **Trace** = `{ TraceId, Payer (account), Brain, Origin (neuron that started it), Budget? }`. Started only at a trusted edge: an HTTP/shell call, a connector event (mail arrived, timer). Everything a synapse publishes or calls while handling a traced signal inherits it. A trace is never forged by user code: like `Publisher`, the kernel overwrites it.
2. **Cost** = `{ Trace, Resource, Quantity, Unit, Micros, Synapse?, App?, Neuron? }`, money as `long` micro-credits (1 credit = $0.000001, USD-pegged, internal ledger; no token yet).
3. **Who pays:** local work on the payer's own node is metered at 0 micros. A resource bought with a deployment Integration is charged list price × (1 + platform fee). A resource used through the user's own Connection is metered at 0.
4. **Fee:** platform fee is config `DigitalBrain:Platform:Fees:PlatformPercent` (default `25`) applied as a surcharge on charged costs; author revenue from priced app operations is out of scope for this plan (phase 2).
5. **Compute leaves the module ring.** Vocabulary → `DigitalBrain`; seam → `DigitalBrain.Framework`; ledger/accounting → `DigitalBrain.Platform`. `src/DigitalBrain.Modules/DigitalBrain/Compute/**` is deleted at the end. `IntentContext`, `IIntentUsageSink`, `IMeterSink`, `MeterEvent`, `AllowanceCallFilterStage` are deleted.
6. Out of scope (later plans): distributed compute market, distributed storage, payouts, author revenue split, cross-brain budgets.

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>.csproj`, `dotnet test --project <test project>`.
- Warnings are errors, nullable on, central package versions; no new packages.
- Grain state uses concrete arrays, never `IReadOnlyList`.
- No `ConfigureAwait(false)` in grain code. ASCII only in source (no fullwidth punctuation).
- No `/// <summary>` boilerplate; tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- No state compatibility, no migrations, no legacy shims: delete replaced code in the same task.
- Money is `long` micros everywhere. Never `decimal`/`double` in ledger state.
- Commit explicit files only (`git add <file> <file>`), never a directory.

## Review Focus

1. A synapse reacting to a signal from **another brain's** neuron: the trace payer must stay the original payer, not the reacting brain. (Task 3 test.)
2. **Redelivery** (at-least-once): the same cost recorded twice for one `(TraceId, CostId)` must be charged once. (Task 5 test.)
3. **Budget exhausted mid-trace**: the next metered call throws `BudgetExhaustedException`, nothing is charged beyond the budget, and the trace shows as stopped. (Task 6 test.)
4. **Kernel delivery strips caller context** (`NeuronCallFilter.cs:23-34`): the trace must survive that strip. (Task 3 test.)
5. **Shell opened with no edge client**: the Compute button must not be silently disabled; it shows the panel with a "not connected" state. (Task 1 test.)

---

## Orchestration (how the orchestrator runs OpenCode)

**Roles.** The orchestrator (Claude session) writes the contracts itself (Task 2), dispatches every other task to an OpenCode instance, reviews each diff, runs the tests, commits explicit files, and does the live verification (Task 12). OpenCode never commits.

**Command** (run from repo root via Bash `run_in_background: true`, one per task):

```bash
opencode run --model openrouter/~deepseek/deepseek-v4-flash-latest --auto "$(cat docs/superpowers/plans/opencode-prompts/task-N.md)" > "$SCRATCH/opencode-task-N.log" 2>&1
```

**Prompt file per task** (`docs/superpowers/plans/opencode-prompts/task-N.md`, written by the orchestrator before dispatch) contains, in order: the Global Constraints section verbatim; the task section verbatim; the exact list of files it may touch ("touch nothing else"); "do not run git; do not read package XML docs; stop after the task's test command passes".

**Concurrency rules.**
- Run in **waves**; inside a wave, tasks touch **disjoint projects**. Max 4 instances at once.
- Wave 1 (after Task 2 lands): Task 1 (Flutter), 3 (Framework), 4 (AI). Wave 2: Task 5 (Platform), 8 (AI + Framework deletions), 9 (CSharp + Client). Wave 3: Task 7 (Platform), 10 (Framework + ServiceDefaults). Wave 4: Task 6 (Platform). Wave 5: Task 11 (alone — deletes across projects). Then Task 12.
- Before a wave: `git status` must be clean. After each instance exits: `git diff --stat`; any file outside the task's list → `git checkout -- <file>`.

**Review gate per task (orchestrator).**
1. `git diff` read fully; reject garbled text (grep the diff for non-ASCII: `git diff | grep -nP '[^\x00-\x7F]'`).
2. LSP diagnostics clean on touched files; build the touched projects; run the task's test command.
3. Pass → commit explicit files with the task's message. Fail once → re-dispatch with the failure output appended to the prompt. Fail twice → orchestrator implements the task itself.

**Stopping a run.** TaskStop leaves `opencode.exe run` alive. Kill it explicitly, then restore its files:

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='opencode.exe'\" | Where-Object { $_.CommandLine -match 'run --model' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```

**Model note.** DeepSeek V4 Flash was 1/5 usable on 2026-10-09; it does well only on narrow, fully specified edits. That is why contracts (Task 2) and deletion (Task 11) are the orchestrator's, and every dispatched task names its files and shows its code.

---

### Task 1: Compute button opens even without an edge client (orchestrator or OpenCode)

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart:1005`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/compute_usage_panel.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/compute_entry_point_test.dart`

**Interfaces:** Produces `ComputeUsagePanel(client: DigitalBrainUiClient?)` — null client renders a "Not connected to a brain" state.

- [ ] **Step 1: Find why `edge` is null at runtime.** Read `shell/lib/main.dart` around line 60-80 where `edge` is built; note the condition. Record the cause in the commit message. If `edge` is null because a config value is missing in the AppHost launch, fix that wiring instead and keep the remaining steps.
- [ ] **Step 2: Failing test** — add to `compute_entry_point_test.dart`:

```dart
testWidgets('compute button opens a not-connected panel without a client', (tester) async {
  await tester.pumpWidget(buildWorkspace(programmingClient: null));
  await tester.tap(find.byKey(const Key('compute-usage-button')));
  await tester.pumpAndSettle();
  expect(find.text('Not connected to a brain'), findsOneWidget);
});
```

(Use the file's existing workspace builder helper; if it is named differently, use that name.)
- [ ] **Step 3: Run** `flutter test test/compute_entry_point_test.dart` from `shell/` → FAIL.
- [ ] **Step 4: Implement** — line 1005 becomes `onCompute: () => _openCompute(context),`; `_openCompute` passes `widget.programmingClient` (nullable) to `ComputeUsagePanel`; the panel's `build` returns `const Center(child: Text('Not connected to a brain'))` when `client == null`.
- [ ] **Step 5: Run** `flutter analyze` and `flutter test` from `shell/` → PASS.
- [ ] **Step 6: Commit** `git add` the three files; `git commit -m "Shell: Compute opens without an edge client"`.

### Task 2: Trace and cost vocabulary (ORCHESTRATOR ONLY)

**Files:**
- Create: `src/DigitalBrain/Signals/Trace.cs`
- Modify: `src/DigitalBrain/Signals/Signal.cs` (add `Trace`)
- Create: `src/DigitalBrain/Compute/Cost.cs`, `src/DigitalBrain/Compute/CostSummary.cs`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/TraceContext.cs`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/ICostMeter.cs`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/IPriceList.cs`
- Test: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs` (ring still holds)

**Interfaces — Produces (every later task uses these exact names):**

```csharp
// DigitalBrain/Signals/Trace.cs
namespace DigitalBrain;

[GenerateSerializer, Alias("brain.trace")]
public sealed record Trace
{
    [Id(0)] public required string TraceId { get; init; }
    [Id(1)] public required string PayerAccountId { get; init; }
    [Id(2)] public required string BrainId { get; init; }
    [Id(3)] public required NeuronId Origin { get; init; }
    [Id(4)] public long? BudgetMicros { get; init; }
}

// Signal.cs gains, stamped by the runtime exactly like Publisher:
[Id(1)] public Trace? Trace { get; init; }

// DigitalBrain/Compute/Cost.cs
namespace DigitalBrain.Compute;

public enum Resource { Model = 0, Script = 1, Http = 2, Storage = 3, Operation = 4 }

[GenerateSerializer, Alias("compute.cost")]
public sealed record Cost
{
    [Id(0)] public required string TraceId { get; init; }
    [Id(1)] public required string CostId { get; init; }      // idempotency key inside the trace
    [Id(2)] public required Resource Resource { get; init; }
    [Id(3)] public required string Item { get; init; }        // "gpt-5.1:input", "cpu-ms", "gmail.send"
    [Id(4)] public required decimal Quantity { get; init; }
    [Id(5)] public required string Unit { get; init; }
    [Id(6)] public required long Micros { get; init; }        // charged, fee included; 0 when local/own key
    [Id(7)] public string? Synapse { get; init; }
    [Id(8)] public string? App { get; init; }
    [Id(9)] public string? Neuron { get; init; }
    [Id(10)] public DateTimeOffset At { get; init; }
}

// DigitalBrain/Compute/CostSummary.cs — what the shell reads
public enum UsageGrouping { Origin = 0, App = 1, Synapse = 2, Neuron = 3, Resource = 4 }
[GenerateSerializer, Alias("compute.cost-row")]
public sealed record CostRow([property: Id(0)] string Key, [property: Id(1)] long Micros, [property: Id(2)] long Count);
[GenerateSerializer, Alias("compute.cost-summary")]
public sealed record CostSummary([property: Id(0)] long BalanceMicros, [property: Id(1)] long SpentMicros, [property: Id(2)] CostRow[] Rows);

// Framework/Compute/TraceContext.cs
public static class TraceContext
{
    public const string RequestContextKey = "digitalbrain.trace";
    public static Trace? Current { get; }                 // RequestContext first, then AsyncLocal
    public static IDisposable Enter(Trace trace);         // sets both, restores on dispose
    public static Trace Begin(string payerAccountId, string brainId, NeuronId origin, long? budgetMicros = null); // new TraceId = Activity.Current?.TraceId or Guid
}

// Framework/Compute/ICostMeter.cs
public sealed class BudgetExhaustedException(string traceId) : Exception($"Trace {traceId} has no budget left.");
public enum Funding { Local = 0, OwnConnection = 1, Integration = 2 }
public interface ICostMeter
{
    // Prices quantity via IPriceList, applies funding + platform fee, records against TraceContext.Current.
    // No current trace => recorded against the caller's brain under a synthetic "untraced" trace.
    ValueTask<Cost> RecordAsync(CostKind kind, string item, decimal quantity, string unit, Funding funding, string costId, CancellationToken cancellationToken = default);
}

// Framework/Compute/IPriceList.cs — modules register prices for what they own
public interface IPriceList
{
    // Micros per one unit at list price, or null when this list does not price the item.
    long? MicrosPerUnit(CostKind kind, string item);
}
```

- [ ] **Step 1:** Write the files above; `Signal.Trace` gets the same remark as `Publisher` (stamped by the runtime, overwriting caller).
- [ ] **Step 2:** LSP diagnostics clean; `dotnet build src/DigitalBrain/DigitalBrain.csproj` and `src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj`.
- [ ] **Step 3:** `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests` → PASS (vocabulary ring holds no handles; `Cost`/`Trace` are plain records).
- [ ] **Step 4:** Write the OpenCode prompt files `docs/superpowers/plans/opencode-prompts/task-{1,3..10}.md` per Orchestration.
- [ ] **Step 5: Commit** explicit files: `"Kernel: trace and cost vocabulary"`.

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

### Task 7: Platform usage aggregation (OpenCode, wave 3)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/IUsageGrain.cs`, `UsageGrain.cs`, `UsageState.cs`
- Test: `src/Testing/DigitalBrain.Platform.Tests/UsageFacts.cs`

**Interfaces — Produces:** `internal interface IUsageGrain : IGrainWithStringKey` (key = brain id): `Task Add(Cost cost); Task<CostRow[]> Group(UsageGrouping by, DateTimeOffset since, int take); Task<Cost[]> Recent(int take);`. State: `Cost[] Recent` (ring buffer, last 5_000) and `UsageBucket[] Daily` where `UsageBucket(string Day, UsageGrouping By, string Key, long Micros, long Count)`. Group reads buckets; key for `Origin` is the trace origin — so `Cost` alone is not enough: store `Origin` in the bucket by having `Add(Cost cost, string origin)`. **Use this signature: `Task Add(Cost cost, string origin)`.** Task 6 passes `TraceContext.Current?.Origin.ToString() ?? "untraced"`.

- [ ] **Step 1: Failing facts** — `UsageGroupsByAppSynapseNeuronAndOrigin`, `TheMostExpensiveComesFirst`, `RowsSinceExcludeOlderDays`, `UsageSurvivesReactivation` (concrete arrays).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `"Platform: per-brain usage aggregation"`.

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

### Task 9: Synapse runs report CPU time (OpenCode, wave 2)

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Program.cs` / `BehaviorLoader.cs` — measure `Process.GetCurrentProcess().TotalProcessorTime` delta per delivered batch, per synapse
- Modify: `src/Client/DigitalBrain.Client/Runtime/V1/RuntimeProtocol.cs:42` — `AcknowledgeReport(Subscription, Watermark, long CpuMicroseconds)`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs:226-229` — on ack, `TraceContext.Enter(batch trace)` then `meter.RecordAsync(CostKind.Script, "cpu-ms", cpuMicros / 1000m, "ms", Funding.Local, $"{subscription}:{watermark}")`
- Modify: `BrainRuntimeNeuron.Batch(...)` (`:382`) — fill `SignalBatchEvent.TraceParent` from the first signal's `Trace.TraceId`, and remember the batch's `Trace` for the ack
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/...` — `AnAcknowledgedBatchRecordsItsCpuTime` with `FakeSandbox` and a recording meter

- [ ] Steps: failing fact → FAIL → implement → PASS (CSharp unit + E2E suites) → commit `"Synapse runs report CPU time"`.

### Task 10: Connector HTTP calls are metered (OpenCode, wave 3)

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/MeteredHttpHandler.cs` (`DelegatingHandler`): after each response records `CostKind.Http`, item `"{clientName}:{method}"`, quantity 1, unit `"call"`, funding `Integration` when the request carries the header `x-digitalbrain-funding: integration` else `OwnConnection`, costId = `Guid.NewGuid()` per request
- Modify: `src/Aspire/DigitalBrain.ServiceDefaults/ServiceDefaultsExtensions.cs:32` — `http.AddHttpMessageHandler<MeteredHttpHandler>()` (only when an `ICostMeter` is registered)
- Test: Framework test `AnHttpCallThroughAFactoryClientIsRecorded`

- [ ] Steps: failing fact → FAIL → implement → PASS → commit `"Connector HTTP calls are metered"`. Raw `HttpClient` users (Playwright, Salesforce, Aspire bridge) are listed in the commit body as unmetered for a follow-up.

### Task 11: Compute surface moves to the Platform; module deleted (ORCHESTRATOR)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/ComputeEndpoints.cs` — mounted on `BrainRoutes.Group`: `GET /brains/{id}/compute?by=app|synapse|neuron|origin|resource&since=` → `CostSummary`; `GET /brains/{id}/compute/recent?take=` → `Cost[]`; `POST /brains/{id}/compute/credit` (owner only; dev top-up, simulated)
- Delete: `src/DigitalBrain.Modules/DigitalBrain/Compute/**`, its entry in `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:22`, the project refs in `DigitalBrain.Modules.AI.Tests.csproj:6`, `DigitalBrain.slnx`, `Framework/Metering/Metering.cs`
- Modify: Flutter `core/lib/src/ui_client.dart:528-555` → one `readCompute(brainId, by, since)` and `readComputeRecent`; `compute_usage_panel.dart` shows balance, spent, a grouping selector (Origin / App / Synapse / Neuron / Resource) and rows sorted by micros; delete `compute_usage_history.dart` / `compute_usage_details.dart` if they no longer have a caller
- Modify: `src/Testing/DigitalBrain.Architecture.Tests` if it lists the Compute module
- Test: Platform endpoint facts; `flutter test`

- [ ] Steps: map every reference with LSP (`findReferences` on `IMeterSink`, `MeterEvent`, `IAllowanceLedger`, `IComputeUsage`) → edit → diagnostics clean → build every touched project → run Platform, AI, CSharp, Architecture tests and `flutter analyze && flutter test` → commit `"Compute lives in the kernel; module deleted"`.

### Task 12: Seen running (ORCHESTRATOR)

- [ ] `dotnet run digitalbrain.cs` from repo root; `mcp__aspire__list_resources` all Healthy.
- [ ] Through `digitalbrain-mcp`: `neurons_context`; credit the brain via `POST /brains/{id}/compute/credit`; trigger an app operation that makes an LLM call and a synapse run.
- [ ] `GET /brains/{id}/compute?by=synapse` shows the synapse's CPU row and the model row with non-zero micros (Integration-funded) and the fee applied.
- [ ] `list_traces`: the HTTP request span and the model span share the TraceId recorded on the costs.
- [ ] Shell: Compute button opens the panel with balance and grouped rows.
- [ ] Set a tiny budget on a trace (dev endpoint or test origin) and confirm the next model call fails with `BudgetExhaustedException` in `list_structured_logs`.
- [ ] Update memory: compute lives in the kernel; record OpenCode success rate for this plan.
