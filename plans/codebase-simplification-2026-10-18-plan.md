# Codebase Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace observer-push signal delivery with pull-on-nudge over the brain log, then rebuild the test harness, CI, project structure and publishing on top of it so a clean clone passes the PR gate in under 5 minutes and the testing packages ship.

**Architecture:** One durable per-brain log is the only source of truth for signals. A publisher appends, then sends a one-way nudge carrying only a sequence; subscribers (grains, Orleans clients, the SSE edge) pull from their watermark. Tests share one warm in-process host per assembly, isolate by brain, and run the real OS composition at the wire boundary. CI builds once and shards prebuilt test modules.

**Tech Stack:** .NET 11 SDK `11.0.100-rc.1.26425.128`, Orleans 10.4, Aspire 13.6.1, xunit v3 4.0.2 on Microsoft.Testing.Platform, GitHub Actions `ubuntu-latest`, Flutter 3.47.2 (Dart mirrors), ArchUnitNET 0.13.4.

**Spec:** `E:/intochat/digitalbrain.docs/plans/codebase-simplification-2026-10-18.md`

## Global Constraints

- Work on branch `codebase-simplification` in `E:/intochat/os`; one PR per task group (marked **PR**), targeting `master`. Never push `master` or tags; prepare commands and stop.
- Commit explicit files only (`git add <paths>`), never a directory.
- Warnings are errors, nullable enabled, central package versions. `dotnet format whitespace --verify-no-changes` must pass before every commit.
- LSP (definitions, references, implementations) before changing any C# or Dart; check diagnostics after edits.
- No persisted-format change without a reader that handles the old shape and a configuration flag that keeps the old writer, until Task 1.1's version header exists. "Must survive" starts at v0.1.0 (spec item 12), so no migration tooling for pre-v0.1.0 data.
- Do not change `publish.yml` or `release.yml` if the deployment workstream has added them; only add testing packages to what they pack.
- Do not run the product. Kill any local command over 5 minutes and report the breakdown.
- Handbook (`E:/intochat/digitalbrain.docs`) owns narrative docs; `os` gets code, tests, README packaging pointers and `CLAUDE.md` updates only.
- Target: PR pipeline critical-path wall time under 5:00 on `ubuntu-latest` with a warm restore cache, measured on a real run and reported per job in the PR body.
- Keep C# wire records and Dart mirrors aligned in the same PR.
- The `intochat/platform` repo references `DigitalBrain.Platform` (`Directory.Packages.props:14`, `src/IntoChat.Distribution/*`); the rename in Task 4.1 ships a platform PR in the same step.

## Review Focus

1. A subscriber that misses a nudge (silo restart, dropped one-way call) must still receive every signal on the next nudge or reminder, because it pulls from its watermark; a watermark that advances before the signals are handled loses data. (Task 1.3, 1.5, 1.6)
2. A brain log written by the old writer (no version header) must open and read on the new reader with identical `LastSignal` and record contents; a log with an unknown higher version must refuse to open rather than truncate. (Task 1.1)
3. Two facts in one shared host, owned by different people, must never observe each other's signals or grain state, including through `IManagementGrain.GetActiveGrains` and the marketplace singleton. (Task 2.3, 2.9)
4. A `.Tests.Unit` project that starts a host, binds a socket or sleeps must fail the architecture tests, not merely be slow. (Task 2.1)
5. A test shard whose module glob matches nothing must fail the job loudly; a silent empty shard hides dropped coverage. (Task 3.2)

---

## Phase 1: Signal substrate (pull on nudge) — **PR 1a, 1b, 1c**

### Task 1.1: Versioned brain-log frames and dual-read

**Files:**
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainLog.cs` (frame header at ~193, `Append` 94-121, constructor 27-38)
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainLogModel.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainStoreOptions.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Storage/BrainLogFacts.cs`

**Interfaces:**
- Produces: `internal enum BrainLogFormat : byte { Legacy = 0, Framed = 1 }`; segment file header `"DBLG" + byte version` written by the new writer; `BrainStoreOptions.WriteFormat` (`BrainLogFormat`, default `Legacy` until Task 1.9 flips it); `BrainLog.Format` (`BrainLogFormat`, detected on open).

- [ ] **Step 1: Write failing facts in `BrainLogFacts.cs`**

```csharp
[Fact] public async Task ALegacyLogOpensOnTheFramedReaderWithTheSameCursors()
// write with WriteFormat=Legacy, reopen with WriteFormat=Framed, assert Read("g","s") and LastSignal unchanged, Format == Legacy
[Fact] public async Task AFramedLogWritesTheHeaderOnceAndAppendsAfterIt()
// assert first 5 bytes of "{generation}.log" are "DBLG\x01", Append twice, ReadSignals(0,10) returns both
[Fact] public void AnUnknownFormatVersionIsRefusedNotTruncated()
// write "DBLG\x09" to a fresh "initial.log", constructor throws InvalidDataException naming the version
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-method "*BrainLogFacts*"`
Expected: 3 failures, compile errors on `BrainLogFormat`/`WriteFormat`.

- [ ] **Step 3: Implement**

Add the enum and option; in the constructor sniff the first 5 bytes of the active segment (`Legacy` when absent or shorter); `Append` writes the header when the segment is empty and `WriteFormat == Framed`; the reader skips the header. Unknown version throws `InvalidDataException`. `BrainSnapshot` is unchanged; add `[Id(4)] BrainLogFormat Format` with default `Legacy` so old snapshots deserialize.

- [ ] **Step 4: Run all Platform storage facts**

Run: `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-namespace "DigitalBrain.Platform.Tests.Unit.Storage"`
Expected: all pass except the known Linux-only `AFailedAppendAcknowledgesNothingAndRefusesFurtherWritesUntilReopened` (fixed in Task 2.12).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainLog.cs src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainLogModel.cs src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainStoreOptions.cs src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Storage/BrainLogFacts.cs
git commit -m "storage: version brain-log segments and read legacy frames"
```

### Task 1.2: In-memory signal journal replaces the no-op journal

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/MemorySignalJournal.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SignalJournal.cs` (delete `NoSignalJournal`, lines 62+)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/BrainHosting.cs:32` (register `MemorySignalJournal`)
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Signalling/MemorySignalJournalFacts.cs`

**Interfaces:**
- Produces: `public sealed class MemorySignalJournal(IOptions<MemorySignalJournalOptions> options) : ISignalJournal` keeping a per-brain ring of `JournaledSignal` with monotonic `Sequence` per brain; `MemorySignalJournalOptions.Retain` (int, default 4096). `ISignalJournal` is unchanged: `Append`, `ReadSince(brainId, since, limit)`, `SignalsOf(publisher, since)`.

- [ ] **Step 1: Failing facts**

```csharp
[Fact] public async Task SequencesAreMonotonicPerBrainAndSignalsOfFiltersByPublisher()
[Fact] public async Task TheRingDropsTheOldestAndReportsTheFloor()   // PartSignals.Floor > since when dropped
```

- [ ] **Step 2: Run, expect compile failure. Step 3: Implement (brain id derived from `GrainId` key prefix the same way `BrainSignalJournal` does; copy that helper into `Signalling/BrainIds.cs` if it is private). Step 4: Run Framework.Tests.Unit, expect green. Step 5: Commit** `framework: in-memory signal journal is the default`.

### Task 1.3: Contracts: nudge and read

**Files:**
- Modify: `src/DigitalBrain/Neurons/INeuron.cs`, `src/DigitalBrain/Neurons/INeuronObserver.cs`
- Create: `src/DigitalBrain/Signals/SignalNudge.cs`, `src/DigitalBrain/Signals/SignalPage.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/cluster.dart:55-72` (`LiveEnvelope`: no field change; add the `nudge` event type comment) and `ui_client.dart:431-436` only if the wire changes (it does not; the SSE envelope already carries `sequence` and `replay`).
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/ExtractionFacts.cs:29` (string list of contract members)

**Interfaces:**
- Produces:

```csharp
[GenerateSerializer, Alias("brain.nudge")]
public sealed record SignalNudge([property: Id(0)] NeuronId Publisher, [property: Id(1)] long Sequence);
[GenerateSerializer, Alias("brain.signal-page")]
public sealed record SignalPage([property: Id(0)] long Floor, [property: Id(1)] long Last, [property: Id(2)] Signal[] Signals, [property: Id(3)] long[] Sequences);
public interface INeuronObserver : IGrainObserver { [OneWay] Task Nudge(SignalNudge nudge); }
public interface INeuron : IGrainWithStringKey
{
    [AlwaysInterleave] Task<Guid> Watch(INeuronObserver observer);
    [AlwaysInterleave] Task<Guid> Watch(INeuronObserver observer, string[] signals);
    [AlwaysInterleave] Task Unwatch(INeuronObserver observer);
    [AlwaysInterleave, ReadOnly] Task<SignalPage> Read(long since, int limit);
}
```

`OnSignalAsync(Signal)` is deleted in this task; every implementer breaks and is fixed in Tasks 1.4 to 1.7 inside the same PR 1a.

- [ ] **Step 1: Update `ExtractionFacts` expected member list and the `VocabularyRingFacts` reference; run `dotnet build src/DigitalBrain/DigitalBrain.csproj`, expect green. Step 2: Commit** `contracts: observers receive nudges and read signal pages`.

### Task 1.4: Neuron base publishes nudges; one indexed local hub

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs` (Notify 85-93, Announce 94-120, Observers 15-20)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/LocalSignalHub.cs`, `ILocalSignalHub.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SiloSignalBus.cs`
- Modify: callers of `SiloSignalBus.Subscribe<T>` (`AppMenuHost`, `SpaceWatcher`; find with LSP references)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/NeuronCallFilter.cs:25,103` (remove `OnSignalAsync` special case; add `Nudge`)
- Test: `Framework.Tests.Unit/WatchCycleFacts.cs`, `FilteredWatchFacts.cs`, `LocalObserverFacts.cs`, `PublishManyFacts.cs`, `SignalDeliveryContextFacts.cs`, `TraceFacts.cs`

**Interfaces:**
- Produces: `Neuron.Read(long since, int limit)` served from `ISignalJournal.SignalsOf(this.GetGrainId(), since)` with filter by registered signal names per observer applied client-side (page carries all; filtering happens in Task 1.5's subscriber); `Neuron.Notify(Signal stamped, long sequence)` calls `Observers.Notify(o => o.Nudge(new(Id, sequence)))` and `hub.Publish(source, nudge)`; `Announce` returns the last journal sequence from `ISignalJournal.Append` (change `Append` to return `long`).
- `ILocalSignalHub`: `Subscribe(GrainId source, INeuronObserver observer)`, `Unsubscribe(...)`, `Publish(GrainId source, SignalNudge nudge)`, `Subscription<T> Subscribe<T>()` kept for in-process typed listeners, backed by a `Dictionary<GrainId, List<...>>` lookup, no linear scan.

- [ ] **Step 1: Rewrite the six Framework delivery fact files to the new contract.** Replace `OnSignalAsync` test observers with `Nudge` recorders that call `source.Read(since, 100)`; keep every existing fact name; `LocalObserverFacts.ASlowObserverFailsExplicitlyWhenItsBufferFills` becomes `ASlowObserverCoalescesNudgesAndStillReadsEverything` (nudges are idempotent; a full channel drops duplicates, never signals).
- [ ] **Step 2: Run, expect failures on missing members. Step 3: Implement. Step 4: Run `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit`, expect green. Step 5: Commit** `framework: publish nudges, single indexed local hub`.

### Task 1.5: Orleans client subscription pulls

**Files:**
- Modify: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans/SignalSubscription.cs` (ConnectAsync 26, WatchAsync 54, RenewAsync 64, OnSignalAsync 80, Finish 100-115)
- Delete: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans/Watching/WatchStream.cs` (use the `DigitalBrain.Client` copy; make it `internal` + `InternalsVisibleTo`, or move it to `DigitalBrain.Client/Watching` as `public`)
- Modify: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans/BrainClient.cs`, `SubscriptionOptions`
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/SiloBrainSubscriptionFacts.cs` and siblings

**Interfaces:**
- Produces: `SignalSubscription<T>` keeps `long _watermark` initialised from `Watch`'s returned page position (change `Watch` return to `Guid` unchanged, and call `Read(0, 0)` to get `Last` as the starting watermark, or add `SubscriptionOptions.StartAt` = `Latest | Floor`); on `Nudge` it loops `Read(_watermark, options.PageSize)` until `Last == _watermark`, filters by `T`, writes to the channel. `RenewAsync` keeps re-calling `Watch` every `RenewEvery` but no longer compares activation ids; it re-reads from `_watermark` after any re-watch. `Finish` uses `TrySetResult/TrySetCanceled/TrySetException` only.

- [ ] **Step 1: Add fact `AMissedNudgeIsRecoveredOnTheNextRenewal`** (deactivate the source with `DeactivateAsync`, emit, assert the client still receives). **Step 2: Run, fail. Step 3: Implement. Step 4: Run Client.Orleans.Tests.Unit, expect green including `SiloHostedBrainClientReceivesPublication`. Step 5: Commit** `client: subscriptions pull from a watermark`.

### Task 1.6: BrainRuntimeNeuron reads instead of buffering

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs` (OnSignalAsync 608, Arrived 618, CatchUpAsync 696, WatchAsync 1158, renewal 1221, `IsNudge` 125, attribute 37)
- Modify: `.../Runtime/IBrainRuntimeArrivals.cs`, `.../Runtime/Subscription.cs`, `.../Runtime/BrainRuntimeState.cs`
- Test: `CSharp.Tests/HangingWatchFacts.cs`, `FilteredSubscriptionFacts.cs`, `BrainRuntimeNeuronFacts.cs`

**Interfaces:**
- Produces: `INeuronObserver.Nudge` on the runtime neuron records `SourceSeq` wanted per subscription and schedules one `[OneWay] Task CatchUp()` (existing). `CatchUpAsync` reads `source.Read(SourceSeq, cap)` and pushes typed signals serialised to JSON only at the edge push, never into state. `Subscription` keeps `[Id(4)] string[] Pending` for reading old state; new writes always store `Pending = []` and advance `SourceSeq`; `Arrive(json, cap)` is deleted after a `DrainLegacyPending()` that pushes old pending JSON first. Remove `[MayInterleave(nameof(IsNudge))]`, `_nudged`, `_arrivals`, `IBrainRuntimeArrivals.Arrived`.

- [ ] **Step 1: Add fact `LegacyPendingJsonIsPushedBeforeNewSignals`** (seed `BrainRuntimeState` with a `Subscription` whose `Pending` has one JSON string via `MemoryStores`, start, assert order). **Step 2: Run, fail. Step 3: Implement. Step 4: Run `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`, expect green. Step 5: Commit** `csharp runtime: pull signals from the journal, drain legacy pending`.

### Task 1.7: Flutter chat observers use nudges

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Chat/ComposerNeuron.cs` (18, 26, 46, 56, 68, 99, 308), `Chat/ChatNeuron.cs:12-15`, `Chat/ChatBinding.cs` (19, 112-122, 168, 184)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Workspace/LiveSignalEndpoints.cs:30,77,212` and `Workspace/BrainEventsEndpoints.cs:23` to source from `IBrainSubscriptions` (already pull-based after Task 1.5); keep the SSE envelope `{type, publisher, sequence, replay, payload}` byte-identical.
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/LlmNeuron.cs:65-67`, `Postgres/Tables/TableNeuron.cs:23-25` (Watch overrides compile against the new base)
- Test: `Flutter.Tests` chat facts, `AI.Tests/Inference/InterleavingFacts.cs`

- [ ] **Step 1: Run `dotnet build DigitalBrain.slnx -c Release`, fix every remaining `OnSignalAsync`/`MayInterleave(IsNudge)` site reported. Step 2: Run Flutter.Tests and AI.Tests, expect green. Step 3: Add `LiveSignalEndpointsFacts.TheEnvelopeShapeIsUnchanged` asserting the exact JSON keys against a golden string shared with Task 2.9's Dart check. Step 4: Commit** `flutter: chat neurons pull on nudge; SSE envelope unchanged`.

**PR 1a** = Tasks 1.2 to 1.7 (Task 1.1 is **PR 1b**, independent). PR body lists the deleted `OnSignalAsync` contract, the `Nudge`/`Read` additions, and the test renames.

### Task 1.8: Instance registration leaves the storage decorator — DEFERRED 2026-10-18

> Deferred during execution: about 65 plain `Neuron` grains write `IPersistentState` directly and registration lives only in the storage decorator; `IPersistentState` has no ETag setter or state name. Doing this properly needs a framework-owned state handle across ~55 `Neuron<TState>` users plus migrating the direct writers to `Save`, which is its own proposal. The AsyncLocal attach stays and now also returns the signal sequence (Task 1.4).

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Kernel/InstanceRegistration.cs` (delete decorator, keep `TryDecorate`/`TryUndecorate` as no-ops for one release or remove with callers), `Runtime/Neuron.cs` (`Neuron<TState>.Save` registers on first `Exists == false` write via `IInstanceDirectory.Register`), `Runtime/Signalling/SignalJournal.cs` (delete `Attach/TakePending/Restore/Taken`), `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainGrainStorage.cs:36-43`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Storage/IBrainStateWriter.cs`: `Task<long> WriteAsync<T>(string stateName, GrainId grain, IGrainState<T> state, Signal[] emitted)`; `BrainGrainStorage` and `MemoryStores` implement it; `Neuron<TState>.Save` calls it directly instead of `WriteStateAsync` + AsyncLocal.
- Test: Framework `PublishManyFacts.ManySignalsOfOneCallAreJournaledInOneAppend`, Platform `BrainLogFacts.ARejectedStateWriteDoesNotAppendItsSignals`, kernel instance-directory facts (find via LSP references to `IInstanceDirectory.Register`).

- [ ] **Step 1: Run the three fact groups, confirm green before. Step 2: Implement. Step 3: Run again plus `dotnet test --project src/Testing/DigitalBrain.Testing.Tests`, expect green. Step 4: Commit** `kernel: explicit state+signals write, no AsyncLocal journal`. **PR 1c.**

### Task 1.9: Multi-silo ownership and writer flip

**Files:**
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/BrainLogs.cs:20` (delete process-wide `runtime.lock`; `BrainLog`'s per-brain `writer.lock` stays)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Placement/BrainAffinePlacement.cs`: `[Serializable] public sealed class BrainAffinePlacement : PlacementStrategy` + `IPlacementDirector` that hashes the brain id prefix of the grain key to a silo from `ClusterManifest`; registered in `BrainHosting` for every neuron grain class (apply via `GrainClassFeature` or `[BrainAffine]` attribute on `Neuron`).
- Modify: `src/DigitalBrain.AppHost/RunProfile.cs:68-92` (two silos already) and `src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json` set `DigitalBrain:BrainStorage:WriteFormat = Framed` (the flip; spec item 13).
- Test: `Platform.Tests.Unit/Storage/BrainLogsFacts.TwoSetsOfLogsInOneDirectoryOwnDisjointBrains`; nightly `Framework.Tests.E2E` fact `ASignalPublishedOnSiloAIsReadFromSiloB` (uses the existing two-silo AppHost).

- [ ] **Step 1: Failing facts. Step 2: Implement placement and lock removal. Step 3: `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit`, green. Step 4: Commit** `storage: per-brain ownership, brain-affine placement, framed writer on`. **Included in PR 1c.** Handbook: add `plans/codebase-simplification-2026-10-18.md` section 13 note that Azure Files mount is a deployment-workstream requirement.

---

## Phase 2: Test harness and taxonomy — **PR 2a (rules+props), 2b (harness), 2c..2g (project conversions), 2h (scenarios)**

### Task 2.1: Tier rules in architecture tests

**Files:**
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/TestTierFacts.cs` (`AModuleHasOneTestProjectNamedTests` L15 → `AModuleTestProjectCarriesATierSuffix`; `TheEndToEndTierBelongsToTheProduct` L73 allowlist adds `DigitalBrain.OS.Tests.Integration`)
- Create: `src/Testing/DigitalBrain.Architecture.Tests/TestTierRules.cs`: `UnitTierStartsNoHost` (fails any `*Facts.cs` in a `.Tests.Unit` project containing `TestBrain.Create(`, `RuntimeBrain.`, `TcpListener`, `WebApplication.Create`, `Task.Delay(` with a literal ≥ 100, `Thread.Sleep(`), `IntegrationTierUsesTheAssemblyFixture` (every `.Tests.Integration` project has exactly one `[assembly: AssemblyFixture(typeof(...))]`), `BrowserTierOwnsPlaywright` (only `.Tests.Browser`, `.Tests.E2E`, `DigitalBrain.Testing.Playwright` and the Playwright module may reference `Microsoft.Playwright`).
- Modify: `TestTierBaseline.json` adds `"LegacyUnitTierHosts": []`.
- Modify: `ConfigurationKeyOwners.json` adds the three drifted entries from spec section 2.

- [ ] **Step 1: Write the rules against the current tree; run `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`; record the offender list into the baseline arrays (that is the ratchet). Step 2: Commit** `architecture: test tiers unit/integration/e2e/browser`. **PR 2a.**

### Task 2.2: Build conditions per tier

**Files:**
- Modify: `Directory.Build.props:43-61`

**Interfaces:**
- Produces: property `DigitalBrainNightly` (default `true`); when `'$(DigitalBrainNightly)' == 'false'`, projects ending `.Tests.E2E` or `.Tests.Browser` get `IsTestProject=false` and `IsTestingPlatformApplication=false` (keep `DigitalBrainE2E` as an alias for one release: `<DigitalBrainNightly Condition="'$(DigitalBrainE2E)' == 'false'">false</DigitalBrainNightly>`). `.Tests.Unit` projects get `<Using Remove="DigitalBrain.Testing" />` is **not** done (fakes live there); instead `UnitTierStartsNoHost` guards. Add `<DigitalBrainTestTier>` = `Unit|Integration|E2E|Browser|Hosting` derived from suffix, exported for the CI shard script via `-getProperty`.

- [ ] **Step 1: `dotnet build DigitalBrain.slnx -p:DigitalBrainNightly=false -v quiet`, assert E2E and Browser projects report `IsTestProject=false` with `dotnet msbuild -getProperty:IsTestProject`. Step 2: Commit** `build: nightly tier switch`. **PR 2a.**

### Task 2.3: Shared host fixture and slim in-process mode

**Files:**
- Create: `src/Testing/DigitalBrain.Testing/Fixtures/BrainHostFixture.cs`
- Modify: `src/Testing/DigitalBrain.Testing/TestBrain.cs` (add `WithoutHttp()`), `TestExecutionOptions.cs` (add `bool Http = true`), `Targets/InProcessTarget.cs` (skip `UseUrls`/`MapDigitalBrainServer` when `!Http`; retry `StartAsync` up to 3 times on `AddressInUseException`, picking new `FreePorts()`; set `Orleans:EnableDistributedTracing` from `TestExecutionOptions.Diagnostics`)
- Test: `src/Testing/DigitalBrain.Testing.Tests/BrainHostFixtureFacts.cs`

**Interfaces:**
- Produces:

```csharp
public abstract class BrainHostFixture : IAsyncLifetime
{
    protected abstract TestBrain Configure(TestBrain brain);
    public ITestBrain Brain { get; }                 // started once per assembly
    public Task<Person> PersonAsync(string name = "", CancellationToken ct = default); // fresh account + brain per call
    public Task<SignalProbe<T>> ObserveAsync<T>(INeuron source, Person owner, CancellationToken ct) where T : Signal;
    public ValueTask InitializeAsync(); public ValueTask DisposeAsync();
}
```

Usage: `[assembly: AssemblyFixture(typeof(MyHost))]`, `public sealed class MyHost : BrainHostFixture { protected override TestBrain Configure(TestBrain b) => b.WithModule<FooModule>(); }`, facts take `MyHost host` in the constructor.

- [ ] **Step 1: Facts** `TwoPeopleInOneHostDoNotSeeEachOthersSignals`, `WithoutHttpStartsFasterThanWithHttp` (assert no `HttpClient`, `Brain.HttpClient` throws `InvalidOperationException`), `AStartRetriesOncePortsCollide` (pre-bind the port returned by a stubbed `FreePorts`). **Step 2: Run, fail. Step 3: Implement. Step 4: Run Testing.Tests, green. Step 5: Commit** `testing: BrainHostFixture shared per assembly, slim host, port retry`. **PR 2b.**

### Task 2.4: Promote shared fakes

**Files:**
- Create: `src/Testing/DigitalBrain.Testing/Http/TokenEndpointStub.cs` (single implementation; `public sealed class TokenEndpointStub : IAsyncDisposable { static Task<TokenEndpointStub> StartAsync(CancellationToken); Uri Origin; Uri TokenEndpoint; IReadOnlyList<IReadOnlyDictionary<string,string>> Forms; }`)
- Delete: `Platform.Tests.Unit/Connections/TokenEndpointStub.cs`, `Gmail.Tests/Http/TokenEndpointStub.cs`
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Testing/Fakes/FakeCandidateHost.cs` (moved from `Microsoft.Aspire.Tests/FakeCandidateHost.cs`, `public`), `Fakes/FakeBrowserSessionProvider.cs` (from `Flutter.Tests/WebBrowser/WebBrowserFacts.cs:376` `Provider` + `Page`), `Fakes/InMemoryTelemetry.cs` (OpenTelemetry `InMemoryExporter` registration helper for the Framework telemetry facts)
- Modify: the referencing tests to use the promoted types.

- [ ] **Step 1: Move, fix usings, `dotnet build` affected test projects. Step 2: Run Platform.Tests.Unit (Connections), Gmail.Tests, Microsoft.Aspire.Tests, Flutter.Tests WebBrowser facts, green. Step 3: Commit** `testing: shared TokenEndpointStub; OS.Testing owns product fakes`. **PR 2b.**

### Task 2.5: OS composition in process

**Files:**
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Testing/OsTestBrain.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs` (add `public static IReadOnlyList<Module> InProcessModules` = `Modules` minus `{Postgres, ClickHouse, Supabase, Qdrant, ArtCraft, Windows}` with a comment per exclusion: container or OS dependency)
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.InProcessModulesIsModulesMinusTheContainerBackedOnes`

**Interfaces:**
- Produces: `public static TestBrain OsTestBrain.Create(FakeModelServer model, TokenEndpointStub tokens)` = `TestBrain.Create()` + every `OsCatalog.InProcessModules` via `WithModule` + `AddOperatingSystemApps` through `ConfigureServices` + `WithFakeModel(model)` + gmail token endpoint = `tokens.TokenEndpoint` + `WithHostConfiguration("DigitalBrain:Identity:Posture","Accounts")` + in-memory data protection (`AddDataProtection().UseEphemeralDataProtectionProvider()`).

- [ ] **Step 1: Fact. Step 2: Implement. Step 3: Run OS.Tests.Unit, green. Step 4: Commit** `os testing: OsTestBrain runs the OS composition in process`. **PR 2b.**

### Task 2.6: Convert no-host projects to `.Tests.Unit`

Projects: `Deployment.Tests`, `Architecture.Tests` (stays as is; it is a unit tier by content, rename to `DigitalBrain.Architecture.Tests.Unit`), `Modules.Microsoft.Roslyn.Tests`, `Modules.Qdrant.Tests`, `Modules.Tools.Tests`, `Modules.Monnet.Tests` (SV, convert anyway, it moves later), plus the existing `Aspire.Hosting.Tests.Unit`, `Client.Tests.Unit` (no change). Playwright: split `Modules.Microsoft.Playwright.Tests` into `.Tests.Unit` (`BrowserSessionFacts`, `PageToolsFacts`, `PlaywrightNeuronFacts`) and `.Tests.Browser` (`AppPageFacts`, `ManagedBrowserFacts`, `VisibleBrowserFacts`).

- [ ] **Step 1: For each: `git mv` folder and csproj, update `DigitalBrain.slnx`, RootNamespace follows the name automatically; fix namespaces with LSP rename. Step 2: `dotnet test --project <each>`, green. Step 3: Run Architecture tests; remove the project from `LegacyUnitTierHosts` as it becomes clean. Step 4: Commit per project** `tests: <name> is unit tier`. **PR 2c.**

### Task 2.7: Convert host-using projects to `.Tests.Integration` with one fixture each

Projects and fixture names: `Framework.Tests.Unit`→`Framework.Tests.Integration` (`FrameworkHost`), `Client.Orleans.Tests.Unit`→`.Integration` (`ClientHost`), `Mcp.Tests.Unit`→`.Integration`, `Platform.Tests.Unit`→`Authority.Tests.Integration` after Task 4.1 (do this one last), `Testing.Tests`→`Testing.Tests.Integration`, and every `Modules.*.Tests` with start sites: AI, Apps, ArtCraft, Circles, ClickHouse, Equifax, Flame, Flutter (fold `FlutterHostFixture` into the assembly fixture), Gmail (fold `GmailHost`), Mcp, Microsoft.Aspire, Microsoft.CSharp, Microsoft.GitHub, Microsoft.Orleans, Microsoft.Windows, Postgres, RiskSeal, Salesforce, Supabase, Time, Twilio. Facts that genuinely need a distinct composition (Production posture, capture off, `RuntimeBrain` with `FakeSessionHost`) keep a per-class `TestBrain` and are listed in the PR body with the reason.

- [ ] **Step 1: Per project: rename, add `Host : BrainHostFixture`, replace `await using var brain = await TestBrain.Create()...StartAsync(ct)` with `var person = await host.PersonAsync(ct)` and `host.Brain`; where a fact mutated global config, keep its own `TestBrain` and tag the class `[Trait("host","own")]`. Step 2: Delete explicit sleeps: `RuleJudgingFacts.cs:211,219` (use `FakeTimeProvider` + `RuleTimeout` injection), `SandboxSessionFacts.cs:180,235` (assert via `SignalProbe` absence with `AssertionTimeout` 200 ms), `BrainRuntimeNeuronFacts.cs:561` (await the host's `Started` TCS), `FastPathFacts.cs:1009` (`FakeTimeProvider.Advance`). Step 3: Run the project; record MTP duration before/after in the PR body. Step 4: Commit per project.** **PRs 2d (Framework, Client, Mcp, Testing), 2e (AI, Apps, Flutter, CSharp), 2f (all remaining modules), 2g (Platform/Authority).**

### Task 2.8: Fix the four real failures

- GitHub: `GitHubAppHostingExtensions.cs:20` options overload passes `options.PublicOrigin!`; make the overload forward `null` when unset, and add `GitHubAppHostingFacts` theory case asserting no `brain-github-app-client-secret` parameter when `oauth: false`. Run `Modules.Microsoft.GitHub.Tests.Hosting`, green.
- BrainLog recovery: add `internal interface IBrainLogFiles { Stream OpenAppend(string path); Stream OpenRead(string path); }` with `FileBrainLogFiles` default and a test `FaultingBrainLogFiles` that throws `IOException` on the nth append; `BrainRecoveryFacts.AFailedAppendAcknowledgesNothingAndRefusesFurtherWritesUntilReopened` uses it; also drop the `TestBrain` start there (construct `Serializer` from `new ServiceCollection().AddSerializer()`).
- Client.Orleans cleanup: covered by Task 1.5 (`TrySet*`); add a regression fact `FinishingTwiceNeverThrows`.
- CSharp address-in-use: covered by Task 2.3 retry; keep the fact unchanged and confirm green on three consecutive CI runs.
- [ ] **Commit** `tests: fix the four pre-existing failures at their cause`. **PR 2b.**

### Task 2.9: Wire-level scenarios and the Dart mirror check

**Files:**
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Integration/` project, `OsHost : BrainHostFixture` using `OsTestBrain.Create`, facts `IdentityScenarioFacts` (`RegisterLoginSessionBrainsLogout`, `ASecondPersonCannotReadTheFirstPersonsBrains`), `ConnectorOAuthScenarioFacts` (`GmailConnectStartRedirectsCallbackExchangesAndStoresTheToken` using `TokenEndpointStub` and `/connections/{id}/login` → callback with `code=fake-code`), `LiveFeedScenarioFacts` (`ALiveSubscriptionReplaysFromSequenceAfterReconnect` over `GET /brains/{brainId}/live`).
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Integration/Contracts/DartMirrorFacts.cs`: parses `app/core/lib/src/models/cluster.dart` `LiveEnvelope` fields and asserts equality with the C# envelope keys golden from Task 1.7; same for the identity session record consumed by `ui_client.dart:114,150`.
- Modify: `TestTierFacts` allowlist (Task 2.1 already adds the project).

- [ ] **Step 1: Facts fail (project missing). Step 2: Implement. Step 3: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Integration`, green, report per-fact ms (target under 500 ms each after warm host). Step 4: Commit** `os: wire-level scenarios and Dart mirror contract check`. **PR 2h.**

### Task 2.10: Nightly tier hygiene

- `Framework.Tests.E2E` and `OS.Tests.E2E`: delete `[assembly: Parallelization(Mode = None)]` and `testconfig.json parallelMode: none`; move telemetry facts to read `InMemoryTelemetry` from Task 2.4 where they do not need the dashboard; merge the Reference and CaptureOff collections where the only difference is a configuration flag into one fixture with per-fact flags, and keep Production separate. `e2e.yml` warms the four ArtCraft images too.
- [ ] **Commit** `e2e: parallel collections, fewer boots`. **PR 2h.**

---

## Phase 3: CI under 5 minutes — **PR 3**

### Task 3.1: Build once, cache well

**Files:** `.github/workflows/ci.yml`

- Jobs: `format` (restore + `dotnet format whitespace --verify-no-changes`), `build` (restore, `dotnet build -c Release -p:DigitalBrainNightly=false`, `dotnet pack --no-build -o artifacts/packages`, upload `artifacts/bin/**/*.Tests.*.dll` tree as `test-modules` and `artifacts/packages` as `packages`), `test` matrix (Task 3.2).
- Cache: key `${{ runner.os }}-nuget-${{ hashFiles('Directory.Packages.props', 'global.json') }}` (no `**/*.csproj`), `restore-keys` prefix; save on every job when `cache-hit != 'true'` (not only master); remove the "Free space" step from the PR path; add `DOTNET_CLI_TELEMETRY_OPTOUT=1`, `NUGET_PACKAGES=${{ github.workspace }}/.nuget`.
- Build output: set `UseArtifactsOutput=true` in `Directory.Build.props` so test dlls land under `artifacts/bin` for the glob.

### Task 3.2: Sharded test matrix

- `test` job: `strategy.matrix.shard: [unit, integration-a, integration-b, integration-c]`, `fail-fast: false`; download `test-modules`; run `dotnet test --test-modules "<globs for shard>" --max-parallel-test-modules 2 -- --report-trx --results-directory artifacts/trx`; the globs live in `.github/test-shards.json` (`{ "unit": ["**/*.Tests.Unit.dll","**/*.Tests.Hosting.dll"], "integration-a": [...] }`) and a step asserts each glob matched at least one module (`find` count > 0, else `exit 1`). Shard membership balanced by the MTP durations recorded in Task 2.7; rebalance by editing the JSON.
- Upload trx per shard; a final `report` job publishes a timing table into the job summary (`$GITHUB_STEP_SUMMARY`).

### Task 3.3: Nightly workflow

- `e2e.yml` → add job `browser`: `dotnet build` with `DigitalBrainNightly=true`, `pwsh bin/.../playwright.ps1 install --with-deps chromium`, run `--test-modules "**/*.Tests.Browser.dll"`. Keep `e2e` job as is plus ArtCraft warm-ups. Triggers unchanged (master push, cron). Add a final step `if: failure()` that opens or updates a GitHub issue titled `nightly red: <date>` via `gh issue create`/`gh issue comment` (spec item 6a: nightly blocks tags, not merges); `release.yml`, when it exists, is not changed by this plan.

- [ ] **Step 1: Push the branch, open the PR, read `gh run view --json jobs` timings. Step 2: Iterate shard balance until the longest job and the critical path are under 5:00 warm. Step 3: Paste the per-job table into the PR body with the cold-cache number. Commit** `ci: build once, shard tests, nightly browser tier`. **PR 3.**

---

## Phase 4: Structure and purity — **PR 4a..4e**

### Task 4.1: Rename `DigitalBrain.Platform` → `DigitalBrain.Authority` (os + platform PRs together)

- `git mv` the three projects (`Platform`, `Platform.Contracts`, `Platform.Tests.Unit`→`Authority.Tests.Integration` per Task 2.7), update `DigitalBrain.slnx:209-211`, six `ProjectReference`s, `InternalsVisibleTo`, LSP namespace rename of `DigitalBrain.Platform.*` (200 files), string literals in `Aspire.Hosting.Tests.E2E/PackedCompositionFacts.cs:65,67`, `Framework.Tests.Unit/ExtractionFacts.cs:29`, `Architecture.Tests/{BoundaryFacts,CredentialBoundaryFacts,KernelBoundaryFacts,RepositoryLayoutFacts,TestingPackageFacts}.cs`, `ConfigurationKeyOwners.json:18,19,21`. Delete `LocalRuntimeBoundaryFacts.cs`. Leave `DigitalBrain.Framework.Platform.*` namespace untouched (separate decision).
- Platform repo PR: `Directory.Packages.props:14` and `src/IntoChat.Distribution/IntoChat.Distribution.csproj:25`, `Program.cs:4` → `DigitalBrain.Authority`; merge after the os package with the new id exists on the feed (prepare, do not push).
- [ ] **Build solution, run Architecture + Authority tests, commit** `rename: DigitalBrain.Platform is DigitalBrain.Authority`. **PR 4a.**

### Task 4.2: Fold packaging-only projects

Fold list and targets (reference the spec's table; `Aspire.Testing` is **kept**: it is the model-only boundary `*.Tests.Hosting` must use without pulling `DigitalBrain.Testing`):
- Delete `Modules.Qdrant.Contracts` (empty); fix refs in Mcp, Qdrant, Qdrant.Aspire.Hosting.
- Fold `Modules.{AI,ClickHouse,Microsoft.CSharp,Qdrant}.Deployment` into their `*.Aspire.Hosting` (sources move, `Deployment.Tests` reference updated).
- Fold `Aspire.Client` into `Aspire.Server`? No: Mcp (an Orleans client) must not load the server. Fold `Aspire.Client` into `Client.Orleans` instead.
- Fold `Platform.Contracts`(now `Authority.Contracts`) into `DigitalBrain` core only if `BoundaryFacts.CredentialAndIdentityContractsResideInPlatformContracts` is rewritten to point at the new home; otherwise keep. Decision: keep (it is a real boundary with a rule).
- Fold Contracts under 100 lines whose only external consumer is `Mcp`: ArtCraft, Mcp module, Gmail, Time, Orleans, Tools (Tools is referenced by Playwright.Contracts; move those types into Playwright.Contracts), into their module project; `Mcp.csproj` then references the module project's Contracts namespace. **Check `BoundaryFacts.ScriptVisibleContractsOnlyDependOnOtherContractsAndTheNeuronAbstractions` still has a `*.Contracts` set to check; the rule scans whatever exists.**
- Update `RepositoryLayoutFacts.EveryProjectHasOneSolutionEntryInItsPhysicalGroup` expectations and `DigitalBrain.slnx`.
- [ ] **Build, run Architecture tests, commit per fold.** **PR 4b.** Report project count before/after in the PR body.

### Task 4.3: Purity

- `DigitalBrain.Mcp.csproj:31-34` remove SV Contracts references (and the `using`s they serve; LSP).
- `OsCatalog.cs:29` Windows module out of `BuiltIn()`; add `OsCatalog.WithWindowsEdge()` returning `Modules + WindowsModule`; `DigitalBrain.OS/Program.cs` opts in only when `OperatingSystem.IsWindows()`; `OsCatalog.cs:33-37` delete the SV comments; `OS.csproj` module glob excludes `Monnet;Equifax;RiskSeal;Twilio;Microsoft.Windows` until the move (`<Compile>`-style `Exclude` on the `ProjectReference` glob).
- `OsApps.cs:41` and `OsWorkspaceRoot.cs:22,35`: `intochat/customer-researcher` leaves the required set; the trusted publisher list becomes `OsAppsOptions.TrustedPublishers` (default `["os"]`); platform's distribution adds `intochat`.
- `ShellHostingExtensions.cs:139-148` Windows local desktop account and `LocalDesktopAccountFacts.cs` deleted; `FlutterHostLaunch.cs:254` stays (it is correct cross-platform code).
- `MachineRoots.cs` path comparison: `StringComparison.Ordinal` when `!OperatingSystem.IsWindows()`.
- Delete `aspire.config.json`'s stale `appHostPath` line, `Flutter/design-prototype/`.
- Branded defaults: `IdentityEndpoints.cs:22-23` consts → `IdentityHostOptions.AccountClaim` / `BrainClaim` (defaults stay `intochat.account` / `intochat.brain` because cookies persist; platform config may set them; a handbook note records the rename path for v0.2); `HostedWorkspaceEndpoints.cs` literals use the same options.
- Hosted-cloud seam: move `Platform/Hosting/*` (10 files) and `Azure.Extensions.AspNetCore.DataProtection.Blobs` into a new `src/DigitalBrain.Authority/DigitalBrain.Authority.Hosted/DigitalBrain.Authority.Hosted.csproj` (packable, `AddHostedAuthority()`), referenced by `DigitalBrain.OS` only through configuration (`HostedRuntimeOptions.SectionName` present → platform's distribution calls `AddHostedAuthority()`); `BrainStorageHosting.AddBrainStorage` loses the `HostedRuntimeOptions` branch and gains `IHostedStorageExtension` that the Hosted package implements.
- Licence: `Directory.Build.props:26` `PackageLicenseExpression` moves into a conditional group for `DigitalBrain`, `DigitalBrain.Client*`, `DigitalBrain.Aspire.Client`, `DigitalBrain.Authority.Contracts`, `DigitalBrain.Testing*`, `DigitalBrain.Aspire.Testing`, `*.Contracts`; other packables get `<PackageLicenseFile>` absent and `<PackageRequireLicenseAcceptance>false</PackageRequireLicenseAcceptance>` with a `LICENSE-PENDING.md` note (`dotnet pack` warns NU5115? verify; if a licence is mandatory for the feed, use `PackageLicenseExpression` `MIT` only on the SDK set and leave runtime packages without one). Record in the handbook `vision/commercial.md`.
- [ ] **Build, run OS.Tests.Unit, Architecture, Authority tests; commit per bullet.** **PRs 4c (Mcp/OS/Windows/apps), 4d (hosted seam + licence), 4e (branded defaults).**

---

## Phase 5: Publishing — **PR 5**

### Task 5.1: Testing packages are consumable

- READMEs: replace the three identical stubs under `src/Testing/*/README.md` with consumer sections: install, `TestBrain.Create().WithModule<>()`, `BrainHostFixture`, `TokenEndpointStub`, `FakeModelServer`; `DigitalBrain.Aspire.Testing` gets a README and `PackageReadmeFile`; `DigitalBrain.Testing.Playwright` README states the browser-install requirement.
- Verify `dotnet pack DigitalBrain.slnx -c Release -o artifacts/packages` yields `DigitalBrain.Testing`, `DigitalBrain.Testing.Aspire`, `DigitalBrain.Aspire.Testing`, `DigitalBrain.Testing.Playwright` `.nupkg` + `.snupkg` with version from `VERSION`; `TestingPackageFacts.PackableTestingProjectsReferenceNoPlatformInternalsOsOrAppHost` stays green.
- If `publish.yml`/`release.yml` exist (deployment workstream), confirm their pack step is solution-wide so these four are included; otherwise note in the PR body that `ci.yml` validates and the deployment workstream pushes. Document the `GITHUB_TOKEN` `read:packages` requirement in `README.md` of os until the repo is public.
- Handbook: [`reference/testing.md`](../reference/testing.md) with the taxonomy, the fixture pattern, the shard table, and the list of dropped or rewritten tests with reasons (from PR bodies 1a, 2c–2h).
- [ ] **Commit** `packaging: testing package READMEs and consumer docs`. **PR 5.**

---

## Execution notes (2026-10-18)

- Decision 2's "`FakeModelServer` becomes scriptable per brain" was not implemented: `ChatModelServer` (AI tests) is already keyed per fact, and a per-brain router for `FakeModelServer` is a follow-up; this is why most facts in the heavy suites keep their own host.
- The framed-log writer stays `Legacy` in the shipped OS configuration until the release after v0.1.0 (decision 13); the AppHost development configuration writes `Framed`.
- Do not tag an os release until `intochat/platform#6` (Authority rename + trusted publisher/app re-add) is merged.

## Order and gating

1. PR 1b (log versioning) and PR 1a (nudge contract) in parallel; PR 1c after both.
2. PR 2a, 2b after 1c; 2c–2h after 2b; 2g (Authority tests) after 4a.
3. PR 3 after 2h; the measured 5-minute number is reported there.
4. PR 4a may start after 1c (it is mechanical); 4b–4e after 2h.
5. PR 5 last.

Each PR body carries: verification command and expected output, test count delta, dropped/rewritten tests with reasons, and timing where measured.
