# Compute Ledger Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Compute module's five parallel money records into one authoritative ledger (the allowance reservation→settlement record), delete the hand-rolled radix-tree storage engine, move the metering seam into the Framework ring, and retire the "workspace" vocabulary from compute contracts.

**Architecture:** `AllowanceLedgerNeuron` becomes the single writer of economic facts (reserve + settle). Wallet, CostLedger and their stores are deleted; everything they answered is derived from settled reservations. Meter events and usage rows become plain bounded grain state (month-sharded meters, capped per-scope usage logs) instead of a content-addressed copy-on-write tree. `MeterEvent`/`IMeterSink` move to `DigitalBrain.Framework.Metering` so the AI module stops referencing Compute's contracts.

**Tech Stack:** .NET 11, Orleans grains (`Neuron` base), xUnit v3 (`ModuleTest.Create().WithModule<ComputeModule>()`), JSON grain storage.

**Spec:** This plan's header plus the diagnosis ratified in conversation on 2026-10-05 (five parallel ledgers → one; storage tree deleted; seam to Framework; WorkspaceId→BrainId). No separate spec document exists; this section is the spec.

## Global Constraints

- Build/test per project only, never the `.slnx`: `dotnet test src/<path>` / `dotnet build src/<path>`.
- Persisted grain state: append `[Id(n)]`, never renumber. Keep existing Orleans `[Alias(...)]` strings exactly as they are (e.g. `"compute.meter-event"`) even where the C# property names change — aliases are the wire identity.
- This codebase is pre-production: JSON-persisted property renames (WorkspaceId→BrainId) need no data migration, but every rename must keep its `[Id(n)]` slot.
- Concrete arrays in grain state, never `IReadOnlyList` collection-expression wrappers.
- No boilerplate `/// <summary>`; comments only for what code cannot say.
- Tests: sentence-shaped fact names, `TestContext.Current.CancellationToken`, real grains via `ModuleTest`.
- `FakeInvoicingProvider` stays registered in `ComputeModule.Configure` — Gate G-2 forbids a real Stripe adapter; it is a production stand-in, not a test fake. Do not move it.
- Keep `MeterReconciliation` and `StatementBuilder` (pure, grain-free); `StatementBuilder` switches its charge input from `LedgerEntry` to settled `AllowanceReservation`s.
- Commit after every task; end each commit message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Review Focus

Failure modes the spec implies but no existing test exercises — each line's pinning test is added to the owning task:

1. **A meter batch spanning a month boundary** must land each event in its own month shard and both must be readable by period — Task 3 test `ABatchSpanningTwoMonthsLandsInBothPeriods`.
2. **`/compute/summary` after wallet deletion** must still show per-account isolation (Alice's settled spend never leaks into Bob's summary) — Task 2 updates `BrainRouteIsolationFacts` to settle through the allowance ledger and keeps both assertions.
3. **Usage-log cap eviction** must drop the oldest rows and keep the paging cursor stable over the survivors — Task 3 test `TheUsageLogEvictsOldestRowsPastTheCapAndStillPages`.
4. **Meter idempotency across grain reactivation**: the same (IntentId, MeterId, Step) appended after `DeactivateAsync` must still dedup — Task 3 test `ADuplicateMeterEventAfterReactivationIsNotRecordedTwice`.
5. **Renamed persisted state reloads**: an allowance granted before `DeactivateAsync` must evaluate identically after reactivation with the renamed `BrainId` properties — Task 4 extends the existing reload fact in `AllowanceFacts` to grant → deactivate → authorize.

---

### Task 1: Move the metering seam to Framework

The AI module (emitter) and Compute (collector) both touch `MeterEvent`/`IMeterSink`; the seam is platform-facing and belongs in the Framework ring, like `ICallFilterStage`. The move also renames `WorkspaceId`→`BrainId` on `MeterEvent` (same `[Id]` slot, same alias).

**Files:**
- Create: `src/DigitalBrain/Framework/DigitalBrain.Framework/Metering/Metering.cs`
- Modify: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute.Contracts/Metering.cs` (keep only `ComputeUnits` + `IPriceBook`)
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/Metering/GrainIntentUsageSink.cs`, `src/Modules/AI/DigitalBrain.Modules.AI/Metering/IntentMeterEvents.cs` (usings + `BrainId`)
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj` (drop the Compute.Contracts ProjectReference)
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/Clients/AIClients.cs` (using only)
- Modify (usings + `BrainId`): `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/Metering/DurableMeterSink.cs`, `Metering/IMeterStore.cs`, `Metering/InMemoryMeterStore.cs`, `Metering/RecurringMeters.cs`, `Storage/StorageSampler.cs`, `Storage/NeuronComputeStores.cs`, `Billing/StatementBuilder.cs`, `ComputeModule.cs`
- Tests touched: `src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Metering/MeteringFacts.cs`, `src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests/MeterFacts.cs`, `BillingFacts.cs`

**Interfaces:**
- Consumes: nothing from other tasks (do this task first).
- Produces: `namespace DigitalBrain.Framework.Metering` containing `MeterEvent` (record, property `BrainId` at `[Id(3)]`, all other members unchanged), `enum MeterSource`, `IMeterSink`, `IBatchMeterSink`. Later tasks import this namespace.

- [ ] **Step 1: Create the Framework seam file**

`src/DigitalBrain/Framework/DigitalBrain.Framework/Metering/Metering.cs` — the exact content of today's `MeterEvent`/`MeterSource`/`IMeterSink`/`IBatchMeterSink` from `Compute.Contracts/Metering.cs`, with namespace and one rename:

```csharp
namespace DigitalBrain.Framework.Metering;

public enum MeterSource
{
    ChatClient = 0,
    EmbeddingGenerator = 1,
    CallFilter = 2,
    StorageSampler = 3,
}

// Idempotency key: (IntentId, MeterId, Step). Recurring meters use a synthetic intent id per period.
[GenerateSerializer, Alias("compute.meter-event")]
public sealed record MeterEvent
{
    [Id(0)] public required string IntentId { get; init; }
    [Id(1)] public required string MeterId { get; init; }
    [Id(2)] public required string Step { get; init; }
    [Id(3)] public required string BrainId { get; init; }
    [Id(4)] public required decimal Quantity { get; init; }
    [Id(5)] public required string Unit { get; init; }
    [Id(6)] public required MeterSource Source { get; init; }
    [Id(7)] public string? AppId { get; init; }
    [Id(8)] public string? CostBasis { get; init; }
    [Id(9)] public DateTimeOffset OccurredAt { get; init; }
}

public interface IMeterSink
{
    ValueTask RecordAsync(MeterEvent meterEvent, CancellationToken cancellationToken = default);
}

// A sink that persists a whole intent's meter events together: one store round-trip, same
// idempotency key per event. Sinks that only implement IMeterSink are called event by event.
public interface IBatchMeterSink : IMeterSink
{
    ValueTask<int> RecordBatchAsync(IReadOnlyList<MeterEvent> meterEvents, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 2: Shrink Compute.Contracts/Metering.cs**

Keep only `ComputeUnits` and `IPriceBook` (delete the moved types from that file; file remains, namespace `DigitalBrain.Compute` unchanged).

- [ ] **Step 3: Repoint AI module**

In `GrainIntentUsageSink.cs` and `IntentMeterEvents.cs`: replace `using DigitalBrain.Compute;` with `using DigitalBrain.Framework.Metering;` and `WorkspaceId = workspaceId ?? string.Empty` with `BrainId = workspaceId ?? string.Empty`. Also rename the local parameter `workspaceId` → `brainId` in both files (it is fed from `intent.ScopeId`, which is a brain scope). In `AIClients.cs`, update the using the same way if it names `DigitalBrain.Compute`. Remove from `DigitalBrain.Modules.AI.csproj`:

```xml
<ProjectReference Include="../../DigitalBrain/Compute/DigitalBrain.Modules.Compute.Contracts/DigitalBrain.Modules.Compute.Contracts.csproj" />
```

- [ ] **Step 4: Repoint Compute module internals**

Add `using DigitalBrain.Framework.Metering;` to every Compute file in this task's list that uses the moved types; replace every `WorkspaceId =` on a `MeterEvent` construction with `BrainId =` (`RecurringMeters.Accrue`, `StorageSampler.SampleAsync`; rename their `workspaceId` parameters to `brainId`).

- [ ] **Step 5: Build both modules and run their suites**

```bash
dotnet build src/Modules/AI/DigitalBrain.Modules.AI && dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests && dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests
```

Fix compile fallout in the two test projects (usings + `BrainId` property) until green. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/DigitalBrain/Framework src/Modules/AI src/Modules/DigitalBrain/Compute
git commit -m "refactor(compute): move metering seam to Framework ring

MeterEvent/IMeterSink are the platform-facing contract between emitters
(AI module) and the collector (Compute); they live beside ICallFilterStage
now, and the AI module no longer references Compute's contracts.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Collapse the ledgers — one writer of economic facts

Delete `IWallet`, `ICostLedger`, `LedgerEntry`, both ledger neurons and all three ledger stores. Nothing in production ever charged them; the allowance ledger's reservation→settlement record is the authoritative spend. `/compute/summary`'s `chargedCompute` becomes the settled total. `StatementBuilder` takes settled reservations instead of `LedgerEntry` charges.

**Files:**
- Delete: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute.Contracts/Ledger.cs`
- Delete: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/Ledger/` (whole folder: `WalletNeuron.cs`, `CostLedgerNeuron.cs`, `ILedgerStore.cs`, `InMemoryLedgerStore.cs`)
- Modify: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/Storage/NeuronComputeStores.cs` (delete `NeuronLedgerStore` class)
- Modify: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/ComputeModule.cs` (drop `ILedgerStore` registration)
- Modify: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/ComputeEndpoints.cs`
- Modify: `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute/Billing/StatementBuilder.cs`
- Modify tests: `LedgerFacts.cs` (delete file), `AllowanceFacts.cs`, `BillingFacts.cs`, `ChaosChargeFacts.cs`
- Modify: `src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/Identity/BrainRouteIsolationFacts.cs`

**Interfaces:**
- Consumes: Task 1's `DigitalBrain.Framework.Metering.MeterEvent` (StatementBuilder signature).
- Produces: `StatementBuilder.Build(string accountId, string period, IReadOnlyList<AllowanceReservation> settled, IReadOnlyList<MeterEvent> meters, IPriceBook priceBook, DateTimeOffset generatedAt)`. `/compute/summary` JSON shape: `{ chargedCompute, settledCompute, reservedCompute, LimitCompute, SpentCompute, HardStopped }` where `chargedCompute == settledCompute` (kept one release for the Flutter shell; remove in a later change).

- [ ] **Step 1: Write the failing statement test**

In `BillingFacts.cs`, replace the `LedgerEntry`-based fact(s) with:

```csharp
[Fact]
public void AStatementRollsSettledReservationsAndRecurringMetersIntoLines()
{
    var settled = new AllowanceReservation
    {
        ReservationId = "intent-1:neuron:chat", AllowanceId = "budget",
        ReservedCompute = 5m, SettledCompute = 3m, Settled = true,
        OccurredAt = Now, IntentId = "intent-1", BrainId = "brain-1",
        AppId = "app-1", Operation = "chat",
    };
    var meter = RecurringMeters.Accrue("brain-1", "storage.gb_month", 2m, "gb_month", Now);
    var statement = StatementBuilder.Build("account", "2026-09", [settled], [meter], new PriceBook(), Now);

    Assert.Equal(2, statement.Lines.Count);
    var call = statement.Lines.Single(line => !line.Recurring);
    Assert.Equal(3m, call.Compute);
    Assert.Equal("chat", call.Operation);
    Assert.Equal("app-1", call.AppId);
}
```

Note: `BrainId` on `AllowanceReservation` arrives in Task 4; until then use `WorkspaceId = "brain-1"` here and let Task 4's rename sweep update it.

- [ ] **Step 2: Run it to make sure it fails**

```bash
dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests --filter "AStatementRollsSettledReservationsAndRecurringMetersIntoLines"
```

Expected: FAIL (compile error — `Build` still takes `LedgerEntry`).

- [ ] **Step 3: Rework StatementBuilder**

Replace the charges block in `StatementBuilder.Build` (keep the recurring-meters block and helpers as they are):

```csharp
internal static MonthlyStatement Build(
    string accountId,
    string period,
    IReadOnlyList<AllowanceReservation> settled,
    IReadOnlyList<MeterEvent> meters,
    IPriceBook priceBook,
    DateTimeOffset generatedAt)
{
    // ... null/whitespace guards unchanged, with `settled` guarded instead of `charges` ...
    lines.AddRange(settled
        .Where(reservation => reservation.Settled && reservation.SettledCompute > 0
            && InPeriod(reservation.OccurredAt, periodStart, periodEnd))
        .GroupBy(reservation => (reservation.AppId, reservation.Operation))
        .Select(group => new StatementLine
        {
            AppId = group.Key.AppId,
            Operation = group.Key.Operation,
            Compute = group.Sum(reservation => reservation.SettledCompute),
            Count = group.Count(),
            Recurring = false,
        }));
    // recurring block + totals unchanged
}
```

- [ ] **Step 4: Delete the wallet/cost-ledger layer**

Delete `Contracts/Ledger.cs`, the `Ledger/` folder, the `NeuronLedgerStore` class inside `NeuronComputeStores.cs`, the `"ledger/"` grain-key routing it owned, and `LedgerFacts.cs`. In `ComputeModule.Configure`, remove the line `services.TryAddSingleton<ILedgerStore, NeuronLedgerStore>();`.

- [ ] **Step 5: Rework the summary endpoint**

In `ComputeEndpoints.cs`:

```csharp
endpoints.MapGet("/compute/summary", async (IDigitalBrain brain, CancellationToken ct) =>
{
    var accountId = CallerContextStamper.Require().AccountId;
    var ledger = brain.Get<IAllowanceLedger>(accountId);
    var limits = await ledger.ReadLimitsAsync(ct);
    var settled = await ledger.ReadSettledAsync(cancellationToken: ct);
    return Results.Ok(new
    {
        // chargedCompute mirrors settledCompute while the Flutter shell still reads it.
        chargedCompute = settled,
        settledCompute = settled,
        reservedCompute = await ledger.ReadReservedAsync(cancellationToken: ct),
        limits.LimitCompute,
        limits.SpentCompute,
        limits.HardStopped,
    });
});
```

- [ ] **Step 6: Fix the two test sites that charged the wallet**

`AllowanceFacts.UsageSummaryKeepsWalletChargesSettlementsAndReservationsSeparateAfterReload`: delete the `IWallet` lines and the `ReadChargedAsync` assertion; rename the fact `SettlementsAndReservationsSurviveReload`; keep every ledger assertion.

`BrainRouteIsolationFacts`: replace the `IWallet.ChargeAsync` block with a settle through the ledger (reusing the account the test already stamps for Alice):

```csharp
var aliceLedger = brain.Get<DigitalBrain.Compute.IAllowanceLedger>(alicePerson.Account);
await aliceLedger.GrantAsync(new DigitalBrain.Compute.Allowance
{
    AllowanceId = "budget", AccountId = alicePerson.Account, WorkspaceId = aliceWorkspace,
    Level = DigitalBrain.Compute.ApprovalLevel.StandingBudget,
    Scope = DigitalBrain.Compute.AllowanceScope.Always,
    LimitCompute = 100m, PriceBookVersion = "v0", GrantedAt = DateTimeOffset.UtcNow,
}, ct);
```

then authorize+settle 7m via the same `CallRequest` shape `AllowanceFacts.Paid(...)` builds (copy that helper locally: `new CallRequest { Caller = new CallerContext { PrincipalId = alicePerson.Account, AccountId = alicePerson.Account, BrainId = aliceWorkspace, Kind = CallerKind.Person, StampedBy = TrustedEdge.Http, IntentId = "private-charge" }, TargetNeuron = "neuron", Operation = "chat", EstimatedCompute = 7m, HasSideEffects = true }` — check `AllowanceFacts`'s actual helper and `PriceBookVersion` handling and mirror it; the grant's `PriceBookVersion` must equal `new PriceBook().Version` or authorization demands re-consent). Assert `aliceSummary.chargedCompute == 7m` and `bobSummary.chargedCompute == 0m` as before. `ChaosChargeFacts`: drop any wallet usage, keep the settle-path chaos assertions.

- [ ] **Step 7: Run the suites**

```bash
dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests && dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E --filter "BrainRouteIsolation"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/Modules/DigitalBrain/Compute src/DigitalBrain/Framework/tests
git commit -m "refactor(compute): one ledger — settlement is the charge

Wallet, CostLedger, LedgerEntry and their stores are gone; nothing in
production ever wrote them. The allowance reservation→settlement record
is the single economic fact; summary and statements derive from it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Delete the radix-tree storage engine

Replace `ComputeRecordTree` + immutable `ComputePartNeuron` parts with plain bounded grain state. `IComputeRecords` (Put/Read/Page) and the `NeuronMeterStore`/`NeuronUsageStore` routing survive; the implementation becomes a capped, deduped list. Meters shard per month so no grain grows unbounded; `IMeterStore.ReadAsync` takes the period it reads.

**Files:**
- Delete: `Storage/ComputeRecordTree.cs`, `Storage/ComputePartNeuron.cs`, `Storage/IComputePart.cs`, `Storage/ComputePartState.cs`
- Modify: `Storage/ComputeRecordsState.cs`, `Storage/ComputeRecordsNeuron.cs`, `Storage/NeuronComputeStores.cs`, `Metering/IMeterStore.cs`, `Metering/InMemoryMeterStore.cs`, `Billing/` call sites of `ReadAsync`
- Modify tests: `NeuronStoreFacts.cs`, `MeterFacts.cs`
  (all paths under `src/Modules/DigitalBrain/Compute/DigitalBrain.Modules.Compute[/tests]`)

**Interfaces:**
- Consumes: Task 1's `MeterEvent` (`BrainId`).
- Produces: `IMeterStore.AppendAsync(MeterEvent, ct)` / `AppendBatchAsync(IReadOnlyList<MeterEvent>, ct)` unchanged; `IMeterStore.ReadAsync(string period, CancellationToken)` where `period` is `"yyyy-MM"`. `IComputeRecords` unchanged: `Task<int> Put(ComputeStoredRecord[] records, bool overwrite)`, `Task<ComputeStoredRecord[]> Read()`, `Task<ComputeRecordPage> Page(string? before, int limit)`. `ComputeStoredRecord(string Id, string Payload, string SortKey, long Revision)` unchanged.

- [ ] **Step 1: Write the failing facts**

Add to `MeterFacts.cs`:

```csharp
[Fact]
public async Task ABatchSpanningTwoMonthsLandsInBothPeriods()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<ComputeModule>().StartAsync(ct);
    var store = brain.Services.GetRequiredService<IMeterStore>();
    var september = Meter("intent-1", new DateTimeOffset(2026, 9, 30, 23, 0, 0, TimeSpan.Zero));
    var october = Meter("intent-2", new DateTimeOffset(2026, 10, 1, 1, 0, 0, TimeSpan.Zero));
    Assert.Equal(2, await store.AppendBatchAsync([september, october], ct));
    Assert.Single(await store.ReadAsync("2026-09", ct));
    Assert.Single(await store.ReadAsync("2026-10", ct));
}

[Fact]
public async Task ADuplicateMeterEventAfterReactivationIsNotRecordedTwice()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<ComputeModule>().StartAsync(ct);
    var store = brain.Services.GetRequiredService<IMeterStore>();
    var meter = Meter("intent-1", new DateTimeOffset(2026, 9, 10, 0, 0, 0, TimeSpan.Zero));
    Assert.True(await store.AppendAsync(meter, ct));
    await brain.DeactivateAsync(brain.Get<IComputeRecords>("meters/2026-09"), ct);
    Assert.False(await store.AppendAsync(meter, ct));
    Assert.Single(await store.ReadAsync("2026-09", ct));
}
```

with a local helper `Meter(string intent, DateTimeOffset at) => new MeterEvent { IntentId = intent, MeterId = "llm.m.input_tokens", Step = "input_tokens", BrainId = "brain-1", Quantity = 1m, Unit = "tokens", Source = MeterSource.ChatClient, OccurredAt = at };` (mirror the file's existing style; if `IComputeRecords` is internal use the store round-trip only and deactivate via the module test's silo helper the file already uses elsewhere). Add to `NeuronStoreFacts.cs`:

```csharp
[Fact]
public async Task TheUsageLogEvictsOldestRowsPastTheCapAndStillPages()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<ComputeModule>().StartAsync(ct);
    var store = brain.Services.GetRequiredService<IUsageStore>();
    for (var i = 0; i < ComputeRecordsNeuron.Cap + 10; i++)
    {
        await store.AppendAsync("account", "brain-1", $"row-{i}", "{}", ct);
    }
    var page = await store.ReadAsync("account", "brain-1", 1, null, ct);
    Assert.Equal($"row-{ComputeRecordsNeuron.Cap + 9}", page.Items[0].Id);
    var all = new List<string>();
    string? cursor = null;
    do
    {
        var next = await store.ReadAsync("account", "brain-1", 100, cursor, ct);
        all.AddRange(next.Items.Select(row => row.Id));
        cursor = next.NextCursor;
    } while (cursor is not null);
    Assert.Equal(ComputeRecordsNeuron.Cap, all.Count);
    Assert.DoesNotContain("row-0", all);
}
```

- [ ] **Step 2: Run them to verify they fail**

```bash
dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests --filter "ABatchSpanningTwoMonthsLandsInBothPeriods|ADuplicateMeterEventAfterReactivationIsNotRecordedTwice|TheUsageLogEvictsOldestRowsPastTheCapAndStillPages"
```

Expected: FAIL (`ReadAsync(string, ct)` overload and `Cap` do not exist; eviction not implemented).

- [ ] **Step 3: Reimplement ComputeRecordsNeuron on plain state**

`Storage/ComputeRecordsState.cs`:

```csharp
[GenerateSerializer]
internal sealed class ComputeRecordsState
{
    [Id(0)] public string? Root { get; set; }           // retired tree root; kept so old state still deserializes
    [Id(1)] public ComputeStoredRecord[] Records { get; set; } = [];
}
```

`Storage/ComputeRecordsNeuron.cs` (same `[GrainType("compute.records")]`, same interface):

```csharp
// A non-reentrant writer serializes deduplication; records live directly in grain state.
// Every log this grain backs is bounded: meters shard per month, usage evicts past Cap.
[GrainType("compute.records")]
internal sealed class ComputeRecordsNeuron(
    [PersistentState("records", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<ComputeRecordsState> state)
    : Neuron, IComputeRecords
{
    internal const int Cap = 10_000;

    public async Task<int> Put(ComputeStoredRecord[] records, bool overwrite)
    {
        if (records.Length > 1000) { throw new ArgumentException("At most 1000 records per batch."); }
        var byId = state.State.Records.ToDictionary(record => record.Id, StringComparer.Ordinal);
        var changed = 0;
        foreach (var record in records)
        {
            var old = byId.GetValueOrDefault(record.Id);
            if (old is not null && (!overwrite || record.Revision < old.Revision)) { continue; }
            var next = old is null ? record : record with { SortKey = old.SortKey };
            if (old == next) { continue; }
            byId[record.Id] = next;
            changed++;
        }
        if (changed == 0) { return 0; }
        var kept = byId.Values.OrderBy(record => record.SortKey, StringComparer.Ordinal).ToArray();
        if (kept.Length > Cap) { kept = kept[^Cap..]; }
        var previous = state.State;
        state.State = new ComputeRecordsState { Records = kept };
        try { await state.WriteStateAsync(); }
        catch { state.State = previous; throw; }
        return changed;
    }

    public Task<ComputeStoredRecord[]> Read() => Task.FromResult(state.State.Records);

    public Task<ComputeRecordPage> Page(string? before, int limit)
    {
        if (limit is < 1 or > 100) { throw new ArgumentException("Invalid page size."); }
        var slice = state.State.Records.Reverse<ComputeStoredRecord>()
            .Where(record => before is null || StringComparer.Ordinal.Compare(record.SortKey, before) < 0)
            .Take(limit + 1).ToArray();
        var rows = slice.Take(limit).ToArray();
        return Task.FromResult(new ComputeRecordPage(rows, slice.Length > limit ? rows[^1].SortKey : null));
    }
}
```

Delete `ComputeRecordTree.cs`, `ComputePartNeuron.cs`, `IComputePart.cs`, `ComputePartState.cs`. Keep `ComputeStoredRecord` (move its record declaration into `ComputeRecordsState.cs` or `IComputeRecords.cs` — it lived in the deleted tree file).

- [ ] **Step 4: Shard meters by month**

`Metering/IMeterStore.cs`: change `ReadAsync()` to `ValueTask<IReadOnlyList<MeterEvent>> ReadAsync(string period, CancellationToken cancellationToken = default);` (period `"yyyy-MM"`). In `NeuronComputeStores.cs`, `NeuronMeterStore`:

```csharp
private IComputeRecords Records(string period) => grains.GetGrain<IComputeRecords>("meters/" + period);
private static string Period(MeterEvent value) => value.OccurredAt.UtcDateTime.ToString("yyyy-MM", CultureInfo.InvariantCulture);
// AppendBatchAsync groups by Period(event) and Puts each group into its month grain, summing the results.
// ReadAsync(period) reads the one month grain.
```

Update `InMemoryMeterStore` to the same interface (filter its list by period on read). Update every `ReadAsync()` call site: `MeterFacts` passes the period its events use; `StorageSampler` tests likewise; any statement-building call site passes the statement's `period` argument.

- [ ] **Step 5: Run the three new facts plus the full compute suite**

```bash
dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests
```

Expected: PASS. If `NeuronStoreFacts` asserted tree-specific behavior (immutability errors, checksum messages), rewrite those asserts to the store contract (dedup, revision overwrite, paging) — the contract, not the engine, is the fact.

- [ ] **Step 6: Commit**

```bash
git add -A src/Modules/DigitalBrain/Compute
git commit -m "refactor(compute): plain bounded grain state replaces the record tree

The copy-on-write radix tree, immutable parts and checksum machinery are
gone. Meters shard per month, usage logs cap at 10k rows per scope; the
IComputeRecords contract (dedup, revision overwrite, paging) is unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Retire "workspace" from compute vocabulary

Rename every persisted and parameter use of workspace to brain across Compute contracts and implementation. Keep every `[Id(n)]` slot and `[Alias]` string. "Workspace" survives only in the Flutter window-layout vocabulary, which this module does not touch.

**Files:**
- Modify: `Contracts/Allowances.cs` (`Allowance.WorkspaceId`→`BrainId`, `AllowanceReservation.WorkspaceId`→`BrainId`, `PendingApproval.WorkspaceId`→`BrainId`, `LimitPolicy.WorkspaceLimitCompute`→`BrainLimitCompute`, `IAllowanceLedger.ReadReservedAsync/ReadSettledAsync` parameter `workspaceId`→`brainId`)
- Modify: `Contracts/Usage/IComputeUsage.cs` (`workspace` parameters→`brainId`)
- Modify: `Allowances/AllowanceLedgerNeuron.cs`, `Allowances/AllowanceRules.cs`, `Usage/UsageStore.cs` (`IUsageStore` + `UsagePaging` parameter names), `Usage/ComputeUsageNeuron.cs`, `Storage/NeuronComputeStores.cs`
- Modify: every Compute test file referencing the old names; `src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/Identity/BrainRouteIsolationFacts.cs` (the `Allowance` built in Task 2); `src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantTurnExecution.cs` and `ComputeUsageEndpoints.cs` (named arguments only, if they name `workspace:`)

**Interfaces:**
- Consumes: everything prior; this is the final sweep.
- Produces: compute contracts with no `Workspace*` member anywhere (`grep -ri workspace` under `src/Modules/DigitalBrain/Compute` returns only, at most, comments explaining the rename — prefer zero hits).

- [ ] **Step 1: Extend the reload fact to pin renamed-state round-trip**

In `AllowanceFacts`, extend the reload fact from Task 2 (`SettlementsAndReservationsSurviveReload`): after the existing assertions, grant a fresh allowance, `await brain.DeactivateAsync(ledger, ct);` again, then authorize a paid call against it and assert it is allowed — grant written before reactivation must evaluate after it.

- [ ] **Step 2: Apply the rename**

Mechanical, compiler-driven: rename the members and parameters listed above, then chase every compile error. In `AllowanceRules`, `EffectiveCap`/`AssessLimits` read `policy.BrainLimitCompute`; the comparison fields all become `reservation.BrainId`/`allowance.BrainId` against `caller.BrainId`. Do not change `[Id(n)]` numbers, `[Alias]` strings, or route paths.

- [ ] **Step 3: Verify no stragglers**

Run: `grep -rni workspace src/Modules/DigitalBrain/Compute --include=*.cs | grep -v obj/`
Expected: no output.

- [ ] **Step 4: Run every touched suite**

```bash
dotnet test src/Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests && dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests && dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E --filter "BrainRouteIsolation" && dotnet build src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(compute): brain vocabulary replaces workspace in contracts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Whole-host verification

**Files:** none created; verification only.

**Interfaces:** consumes everything.

- [ ] **Step 1: OS composition suite**

```bash
dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit
```

Expected: PASS (host composition still wires ComputeModule).

- [ ] **Step 2: Aspire smoke**

Run `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`; wait until all resources report Healthy; hit `GET /compute/summary` through the host once if a stamped client is at hand, otherwise Healthy resources suffice. Stop it.

- [ ] **Step 3: Commit any stragglers and request review**

If verification forced fixes, commit them (same attribution line). Then use superpowers:requesting-code-review for the branch.
