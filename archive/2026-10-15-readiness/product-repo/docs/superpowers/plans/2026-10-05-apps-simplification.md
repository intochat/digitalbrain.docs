# Apps Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Apps module as one app neuron + two signals + two agents; delete the packages/workspace/marketplace layers; make Implement/Verify background runs so no HTTP request outlives a client timeout.

**Architecture:** `IApp` (keyed `{brain}/apps/{name}`) becomes the only durable thing: manifest, spec, files, connections, semver history, status, activity, verdicts. The Creator's Author call is synchronous (one LLM call); the Builder loop and test runs execute on a background queue that writes progress into the neuron and publishes `AppChanged`. Sharing is export/import of a green version with connections stripped.

**Tech Stack:** .NET 11 / Orleans grains (`Neuron<TState>`), ASP.NET minimal APIs under `BrainRoutes.Group`, xUnit module tests (`ModuleTest.Create().WithModule<AppsModule>()`, scripted LLMs, `FakeSandbox`), Flutter shell (Dart).

**Spec:** `docs/superpowers/specs/2026-10-05-apps-simplification-design.md`

## Global Constraints

- Build/test per project only, never the `.slnx`: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`.
- Persisted grain state: append `[Id(n)]`, never renumber; concrete arrays/dictionaries, never `IReadOnlyList` collection-expression wrappers.
- No self-calls on non-reentrant grains; background/signal-triggered grain work goes through one-way references (`AsReference<T>()`) or external services calling back in.
- `Signal.Publisher` is kernel-stamped; signals publish only from their source neuron (`PublishAsync` inside the neuron).
- Tests use `TestContext.Current.CancellationToken`, real grains, scripted LLMs; never a live model.
- The LLM is a compiler: no model in the signal path or the share gate.
- Wire-shape changes in C# records must be mirrored in the Dart screens in the same change (Task 9 pairs with Tasks 1–6).
- No boilerplate `/// <summary>`; names carry meaning.
- C# is the only runtime; nothing reintroduces a runtime abstraction.

## Review Focus

Inputs the spec implies but could slip through untested — each pinned to a task below:

1. Implement pressed while a build is already running → refused with a clear message, unless the running attempt is stale (>15 min), which re-arms instead. (Task 2)
2. Import with a name that already exists in the brain → 409 refusal, existing app untouched. (Task 5)
3. Export of a version that is red or was never verified → refused; only green versions leave. (Task 5)
4. Rollback to a version not in history → error naming the versions that exist. (Task 2)
5. Builder returns zero files or no `tests.cs` when none exists yet → build ends `Failed` with the reason in Activity, no partial writes. (Task 4)

---

### Task 1: New contracts — manifest, snapshot, signals, IApp

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppManifest.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppSnapshot.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppBundle.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs` (replaces `Workspace/IApp.cs` at the end of Task 8)
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppChanged.cs` (replace existing content)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppVerified.cs` (reshape)

**Interfaces:**
- Consumes: `INeuron`, `Signal`, `AppScenarioVerdict` (kept from `IAppVerification.cs`), `AppInvocation`/`InvokeApp`/`AppResponse`/`InvocationStatus` (kept from Workspace contracts).
- Produces (later tasks rely on these exact shapes):

```csharp
// Apps/AppManifest.cs
namespace DigitalBrain.Apps;

[GenerateSerializer, Alias("apps.operation2")]
public sealed record AppOperation([property: Id(0)] string Name, [property: Id(1)] string Description);

[GenerateSerializer, Alias("apps.setting2")]
public sealed record AppSetting([property: Id(0)] string Name, [property: Id(1)] string Description, [property: Id(2)] string Default);

// A named credential slot ("gmail"); the bound connection id is per-brain state, never shared.
[GenerateSerializer, Alias("apps.slot")]
public sealed record AppConnectionSlot([property: Id(0)] string Name, [property: Id(1)] string Connector);

[GenerateSerializer, Alias("apps.manifest2")]
public sealed record AppManifest(
    [property: Id(0)] string Title,
    [property: Id(1)] string Description,
    [property: Id(2)] AppOperation[] Operations,
    [property: Id(3)] AppSetting[] Settings,
    [property: Id(4)] AppConnectionSlot[] Slots);
```

```csharp
// Apps/AppSnapshot.cs
namespace DigitalBrain.Apps;

public enum AppStatus { Drafted, Building, Live, Failed }

[GenerateSerializer, Alias("apps.version")]
public sealed record AppVersionSummary(
    [property: Id(0)] string Version,
    [property: Id(1)] DateTimeOffset SavedAt,
    [property: Id(2)] bool? Green);

[GenerateSerializer, Alias("apps.snapshot2")]
public sealed record AppSnapshot(
    [property: Id(0)] string Name,
    [property: Id(1)] AppManifest Manifest,
    [property: Id(2)] string Spec,
    [property: Id(3)] Dictionary<string, string> Files,
    [property: Id(4)] Dictionary<string, string> Settings,
    [property: Id(5)] Dictionary<string, string> Connections,
    [property: Id(6)] string Version,
    [property: Id(7)] AppStatus Status,
    [property: Id(8)] string[] Activity,
    [property: Id(9)] AppVersionSummary[] Versions,
    [property: Id(10)] AppScenarioVerdict[] Verdicts);
```

```csharp
// Apps/AppBundle.cs — the share format; no connections, settings as defaults only.
namespace DigitalBrain.Apps;

[GenerateSerializer, Alias("apps.bundle")]
public sealed record AppBundle(
    [property: Id(0)] string Name,
    [property: Id(1)] string Version,
    [property: Id(2)] AppManifest Manifest,
    [property: Id(3)] string Spec,
    [property: Id(4)] Dictionary<string, string> Files);
```

```csharp
// Apps/IApp.cs
namespace DigitalBrain.Apps;

[Alias("apps.app2"), DefaultGrainType("apps.app2")]
public interface IApp : INeuron
{
    [Orleans.Concurrency.ReadOnly, Orleans.Concurrency.AlwaysInterleave] Task<AppSnapshot> Read();
    Task<AppSnapshot> Create(AppManifest manifest, string spec);
    Task<AppSnapshot> SaveSpec(string spec, Guid operationId);                       // minor bump
    Task<AppSnapshot> SaveManifest(AppManifest manifest, Guid operationId);          // patch bump
    [ResponseTimeout("00:10:00")] Task<AppSnapshot> WriteBehavior(string path, string source, Guid operationId); // patch bump, hot-swap
    Task<AppSnapshot> WriteFile(string path, string source, Guid operationId);       // patch bump
    Task<AppSnapshot> Configure(Dictionary<string, string> settings, Dictionary<string, string> connections);   // no bump
    Task<AppSnapshot> Rollback(string version);                                      // restore + patch bump
    Task<AppSnapshot> BeginBuild(string? instruction);   // -> Building, or throws if a fresh build runs
    Task Progress(string line);                          // appends to Activity, publishes AppChanged
    [ResponseTimeout("00:10:00")] Task<AppSnapshot> CompleteBuild(Guid attempt, Dictionary<string, string>? files, string? error);
    Task<AppSnapshot> BeginVerify();                     // -> Activity note; verdicts arrive via RecordVerdicts
    Task RecordVerdicts(AppScenarioVerdict[] verdicts, bool green);                  // publishes AppVerified
    Task<AppBundle> Export();                            // green current version only
    Task<AppSnapshot> Import(AppBundle bundle);          // throws if the app already exists
    [ResponseTimeout("00:10:00")] Task Delete();
    Task<AppInvocation> Invoke(InvokeApp request);
    Task<AppInvocation> Respond(AppResponse response);
    Task<AppInvocation> ReadInvocation(Guid invocationId);
    Task<IReadOnlyList<AppInvocation>> Pending();

    static string Key(Guid brainId, string name) => $"{brainId}/apps/{name}";
}
```

```csharp
// Signals/AppChanged.cs (replace content)
namespace DigitalBrain.Apps.Signals;

[GenerateSerializer, Alias("apps.app-changed2")]
public sealed record AppChanged(
    [property: Id(0)] string Name,
    [property: Id(1)] string Version,
    [property: Id(2)] AppStatus Status) : Signal;
```

```csharp
// Signals/AppVerified.cs (reshape)
namespace DigitalBrain.Apps.Signals;

[GenerateSerializer, Alias("apps.app-verified2")]
public sealed record AppVerified(
    [property: Id(0)] string Name,
    [property: Id(1)] string Version,
    [property: Id(2)] bool Green) : Signal;
```

Note the `2`-suffixed grain/serializer aliases: the old `apps.app`, `apps.snapshot`, `apps.app-changed` aliases stay retired with their deleted types — never reuse an alias for a different shape. New `[Id(n)]` spaces start at 0 because these are new records, not edits of persisted ones.

- [ ] **Step 1: Write the contracts exactly as above** in the listed files. Put the new `IApp` in the `Apps/` folder as `IApp2.cs` temporarily (the old `Workspace/IApp.cs` still compiles until Task 8); name the interface `IApp` inside a `#if false` guard is NOT allowed — instead name it `IAppV2` for now, with a `// renamed to IApp in the deletion sweep` comment. Everything else uses its final name.
- [ ] **Step 2: Build the contracts project**

Run: `dotnet build src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts`
Expected: success (new types coexist with old).

- [ ] **Step 3: Commit**

```bash
git add src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts
git commit -m "feat(apps): new app contracts — manifest, snapshot, bundle, signals, IAppV2"
```

---

### Task 2: AppNeuron — state, versioning, rollback, build lifecycle

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppState.cs`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppNeuronFacts.cs`

**Interfaces:**
- Consumes: Task 1's `IAppV2`, `AppManifest`, `AppSnapshot`, `AppBundle`, signals; `Neuron<TState>` (`Snapshot` property, `Save(next, changed, acted)`), existing behavior-file plumbing from the current `Workspace/AppNeuron` equivalent (`PackageNeuron`'s `WriteBehavior` wiring to `ICSharpFile`) — copy the `ICSharpFile` start/stop calls from the current app grain implementation, do not reinvent them.
- Produces: `AppNeuron : Neuron<AppState>, IAppV2` with grain type `apps.app2`; `AppState` persisted record.

```csharp
// Apps/AppState.cs
namespace DigitalBrain.Apps;

[GenerateSerializer, Alias("apps.state2")]
public sealed class AppState
{
    [Id(0)] public AppManifest? Manifest { get; set; }
    [Id(1)] public string Spec { get; set; } = "";
    [Id(2)] public Dictionary<string, string> Files { get; set; } = [];
    [Id(3)] public Dictionary<string, string> Settings { get; set; } = [];
    [Id(4)] public Dictionary<string, string> Connections { get; set; } = [];
    [Id(5)] public string Version { get; set; } = "0.0.0";
    [Id(6)] public AppStatus Status { get; set; }
    [Id(7)] public string[] Activity { get; set; } = [];
    [Id(8)] public AppVersionRecord[] History { get; set; } = [];   // capped at 20, oldest dropped
    [Id(9)] public AppScenarioVerdict[] Verdicts { get; set; } = [];
    [Id(10)] public Dictionary<string, bool> Verified { get; set; } = [];  // version -> green
    [Id(11)] public Guid BuildAttempt { get; set; }
    [Id(12)] public DateTimeOffset BuildStartedAt { get; set; }
}

[GenerateSerializer, Alias("apps.version-record")]
public sealed record AppVersionRecord(
    [property: Id(0)] string Version,
    [property: Id(1)] DateTimeOffset SavedAt,
    [property: Id(2)] AppManifest Manifest,
    [property: Id(3)] string Spec,
    [property: Id(4)] Dictionary<string, string> Files);
```

Semantics to implement (each is a fact in the test file):

- `Create` refuses if `Manifest` already set ("You already have an app named …"). Sets status `Drafted`, version `0.1.0`, records history entry, publishes `AppChanged`.
- Version bumps: `SaveSpec` minor (resets patch), `SaveManifest`/`WriteBehavior`/`WriteFile`/`Rollback` patch. Every bump appends to `History` (cap 20, drop oldest) and publishes `AppChanged`.
- `Rollback(version)` restores manifest+spec+files from history, bumps patch; unknown version → `ArgumentException` listing known versions.
- `BeginBuild`: from `Drafted`/`Live`/`Failed` → `Building`, new `BuildAttempt` guid, `BuildStartedAt = now`, Activity reset to `["build started"]`. From `Building`: refuse (`InvalidOperationException` "the Builder is already working on this app") unless `BuildStartedAt` is older than 15 minutes — then re-arm with a fresh attempt.
- `Progress(line)` appends (cap Activity at 50 lines) and publishes `AppChanged` — only while `Building`.
- `CompleteBuild(attempt, files, error)`: ignored if `attempt != BuildAttempt` (a stale worker finishing after re-arm). With `error` (or `files` null/empty): status `Failed`, error appended to Activity. With files: behaviors (`behaviors/*.cs`) hot-swap through the existing `ICSharpFile` path, other paths stored; minor bump if the set includes `tests.cs` for the first time else patch; status `Live`.
- `Export` throws unless `Verified[Version] == true`; returns bundle with `Settings`-as-defaults (manifest defaults, not bound values) and no connections.
- `Import` on a grain whose `Manifest` is set → `InvalidOperationException` (name clash). Otherwise materializes the bundle: status `Live`, version from bundle, history seeded, behaviors started in the sandbox, `Connections` empty.
- `RecordVerdicts(verdicts, green)`: stores verdicts, sets `Verified[Version]`, publishes `AppVerified`.
- `Delete` stops/deletes the app's `ICSharpFile`s and clears state.

- [ ] **Step 1: Write failing facts** (sentence-named, real grains). Representative set — write all of these:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Testing;

namespace DigitalBrain.Apps.Tests;

public sealed class AppNeuronFacts
{
    private static AppManifest Manifest(string title = "Echo") =>
        new(title, "echoes", [new("ask", "ask it")], [new("Text", "what to say", "hi")], []);

    [Fact]
    public async Task CreatingAnAppMintsVersionZeroOneZeroAndPublishesAppChanged()
    {
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(TestContext.Current.CancellationToken);
        var app = brain.Get<IAppV2>(IAppV2.Key(brain.Id, "echo"));
        var created = await app.Create(Manifest(), "## Scenario: Echoes\nIt echoes.");
        Assert.Equal("0.1.0", created.Version);
        Assert.Equal(AppStatus.Drafted, created.Status);
        var changed = await brain.Signals<AppChanged>().First(TestContext.Current.CancellationToken);
        Assert.Equal(("echo", "0.1.0", AppStatus.Drafted), (changed.Name, changed.Version, changed.Status));
    }

    [Fact]
    public async Task SavingTheSpecBumpsMinorAndSavingAFileBumpsPatch() { /* 0.1.0 -> 0.2.0 -> 0.2.1 */ }

    [Fact]
    public async Task RollbackRestoresAVersionAndRefusesUnknownOnes() { /* history round-trip; ArgumentException lists versions */ }

    [Fact]
    public async Task ASecondBuildIsRefusedWhileOneIsFreshButAStaleBuildingAppReArms() { /* BeginBuild twice -> throws; then with BuildStartedAt aged 16 min (drive via TimeProvider or a test hook on state) -> new attempt */ }

    [Fact]
    public async Task AStaleWorkersCompleteBuildIsIgnored() { /* BeginBuild -> re-arm -> CompleteBuild(oldAttempt, ...) leaves Building */ }

    [Fact]
    public async Task CompleteBuildWithFilesGoesLiveAndWithErrorGoesFailed() { /* both arms; Activity carries the error */ }

    [Fact]
    public async Task ExportRefusesUnverifiedVersionsAndStripsConnections() { /* Export before RecordVerdicts throws; after green, bundle has no connections and default settings */ }

    [Fact]
    public async Task ImportMaterializesABundleAndRefusesANameClash() { /* import -> Live, empty Connections; import again -> InvalidOperationException */ }

    [Fact]
    public async Task HistoryIsCappedAtTwentyVersions() { /* 25 bumps -> 20 entries, oldest dropped */ }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter AppNeuronFacts`
Expected: FAIL — `AppNeuron` does not exist / grain type unresolved.

- [ ] **Step 3: Implement `AppNeuron`** per the semantics list, copying the `ICSharpFile` start/stop/hot-swap calls from the current app grain (find them in `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Packages/PackageNeuron.cs` and the current app grain — the file-identity binding stays byte-for-byte in behavior). Version arithmetic:

```csharp
private static string Bump(string version, bool minor)
{
    var parts = version.Split('.');
    return minor ? $"{parts[0]}.{int.Parse(parts[1]) + 1}.0"
                 : $"{parts[0]}.{parts[1]}.{int.Parse(parts[2]) + 1}";
}
```

Register the grain in `AppsModule` the same way the module registers its existing grains (follow `TimeModule`'s pattern if unclear).

- [ ] **Step 4: Run tests to green**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter AppNeuronFacts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/DigitalBrain/Apps
git commit -m "feat(apps): AppNeuron — semver history, build lifecycle, export/import"
```

---

### Task 3: Background queue + verification wiring

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppWorkQueue.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Verification/TestScriptRunner.cs` (bind verdicts by scenario heading; drop `app.authoring.json` ID binding)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppVerifyFacts.cs`

**Interfaces:**
- Consumes: `IAppV2` (Task 1), `ITestScriptRunner` and `AppTestRun`/`AppScenarioVerdict` (kept), `ScriptedTestRunner` test double (exists).
- Produces:

```csharp
// Apps/AppWorkQueue.cs — the process is a cache: it holds no state a restart can lose
// beyond the attempt the neuron already marked Building.
internal sealed class AppWorkQueue(IServiceScopeFactory scopes, ILogger<AppWorkQueue> log)
{
    public void Enqueue(string job, Func<IServiceProvider, CancellationToken, Task> work)
        => _ = Run(job, work);

    private async Task Run(string job, Func<IServiceProvider, CancellationToken, Task> work)
    {
        await Task.Yield();
        using var scope = scopes.CreateScope();
        try { await work(scope.ServiceProvider, CancellationToken.None); }
        catch (Exception error) { log.LogError(error, "App background job {Job} failed", job); }
    }
}
```

Registered as a singleton in `AppsModule`. Verify flow: the HTTP edge (Task 6) calls `app.BeginVerify()` then enqueues a job that runs `ITestScriptRunner` against the app's current `tests.cs` + files, computes `green` with the existing `AppTestRun` rules (exit 0 AND ≥1 scenario AND all passed; one verdict per non-live scenario; verdicts bind by `## Scenario:` heading name), and calls `app.RecordVerdicts(verdicts, green)`.

- [ ] **Step 1: Write failing facts**

```csharp
[Fact]
public async Task VerifyRunsTestsInTheBackgroundAndPublishesAppVerified()
{
    // ScriptedTestRunner returns two passing verdicts named by scenario heading;
    // enqueue via the module's verify service entry point; await the AppVerified signal;
    // assert snapshot.Verified marks the current version green.
}

[Fact]
public async Task AVerifyRunWithAFailingScenarioMarksTheVersionRed() { }

[Fact]
public async Task AVerifyRunReportingNoScenariosIsNeverGreen() { }
```

- [ ] **Step 2: Run to verify failure** — `dotnet test ... --filter AppVerifyFacts` → FAIL.
- [ ] **Step 3: Implement** `AppWorkQueue`, the verify job function (a small static `AppVerifyJob.Run(IServiceProvider, brainId, name)` the endpoint and tests share), and the heading-based verdict binding in `TestScriptRunner` (delete the scenario-ID lookup; verdict `Name` must equal a spec heading, else it's reported as an unknown-scenario failure).
- [ ] **Step 4: Run to green** — same filter → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apps): background work queue and heading-bound verification"`.

---

### Task 4: Creator rewrite — sync Author, background Builder

**Files:**
- Rewrite: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/CreatorService.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs` (strip authoring-document vocabulary from both prompts; the Author emits `{name,title,description,operations,settings,slots,spec}`; the Builder emits `{files}` only)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/CreatorFacts.cs` (replace existing `CreatorFacts.cs`)

**Interfaces:**
- Consumes: `IAppV2`, `AppWorkQueue` (Task 3), `ICreatorModel` grain, `BuilderTools` (search/read/check — kept as-is), `IScriptSandbox`, `AppAuthoringPolicy` (keep `RequireSandbox`; delete `RequireRuntime`/`AvailableRuntimes`).
- Produces:

```csharp
internal sealed class CreatorService(
    IGrainFactory grains, ContractCatalog catalog, NeuronTypeSearch search,
    IOptions<AppsOptions> options, AppAuthoringPolicy policy, AppWorkQueue queue,
    IScriptSandbox? csharp = null)
{
    // Synchronous: one Author call. Returns the created/updated snapshot.
    public Task<AppSnapshot> Author(IDigitalBrain brain, string? name, string request, CancellationToken ct);

    // Returns the Building snapshot immediately; the loop runs on the queue.
    public Task<AppSnapshot> Implement(IDigitalBrain brain, string name, string? instruction);
}
```

`Author` with `name == null` creates: parse `AuthoredApp(Name, Title, Description, Operations, Settings, Slots, Spec)`, `app.Create(manifest, spec)`. With a name: `SaveManifest` + `SaveSpec`. Keep the existing retry-on-bad-JSON loop (`MaxAuthorRetries = 2`) and `Parse<T>` helper verbatim.

`Implement`: `var snapshot = await app.BeginBuild(instruction);` then enqueue a job that (1) runs the existing `BuilderConversation` loop (tools, ≤12 rounds — move the method as-is), (2) calls `app.Progress($"round {n}: {toolSummary}")` after each round via a plain grain reference (the job is outside any grain, so a direct call is safe), (3) on success calls `app.CompleteBuild(attempt, files, null)`, on any exception `app.CompleteBuild(attempt, null, error.Message)`. The attempt guid rides in the `BeginBuild` snapshot — add `[Id(13)] Guid` to… no: expose it as `AppSnapshot` does not carry it; instead `BeginBuild` returns the snapshot and the service reads the attempt from a new `Task<Guid> CurrentBuildAttempt()` method on `IAppV2` — add that one-line method in this task (contract + neuron + a line in `AppNeuronFacts`).

Builder output contract: `{ "files": { "tests.cs": "...", "behaviors/x.cs": "..." }, "operations": [...], "settings": [...] }` — operations/settings optional, folded into `SaveManifest` before `CompleteBuild`. A reply with no files, or whose files leave the app without `tests.cs`, fails the build with that reason (Review Focus #5).

- [ ] **Step 1: Write failing facts** (scripted `ICreatorModel` — follow the existing `CreatorFacts.cs` scripted-LLM setup):

```csharp
[Fact] public async Task AuthorCreatesADraftedAppFromARequest() { }
[Fact] public async Task AuthorRevisesAnExistingAppsSpec() { }
[Fact] public async Task ImplementReturnsBuildingImmediatelyAndGoesLiveWhenTheBuilderFinishes()
{
    // scripted builder: one tool round (check_csharp) then the files JSON;
    // assert the Implement call returns AppStatus.Building,
    // then await AppChanged with Status == Live and assert files + version bump.
}
[Fact] public async Task ABuilderReplyWithoutFilesFailsTheBuildWithTheReasonInActivity() { }
[Fact] public async Task ABuilderCrashLandsAsFailedNotAsAnUnhandledException() { }
```

- [ ] **Step 2: Run to verify failure** — `--filter CreatorFacts` → FAIL.
- [ ] **Step 3: Implement** the rewritten `CreatorService`, `CurrentBuildAttempt`, prompt edits.
- [ ] **Step 4: Run to green** — `--filter "CreatorFacts|AppNeuronFacts"` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(apps): Creator — synchronous Author, background Builder with progress"`.

---

### Task 5: Sharing facts — export/import edge cases

**Files:**
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppSharingFacts.cs`
- Modify: `AppNeuron.cs` only if a fact exposes a gap.

**Interfaces:** consumes Task 2's `Export`/`Import`/`RecordVerdicts`.

- [ ] **Step 1: Write the facts** (these pin Review Focus #2 and #3):

```csharp
[Fact] public async Task ExportingARedVersionIsRefused() { }
[Fact] public async Task ExportingBeforeAnyVerificationIsRefused() { }
[Fact] public async Task AnExportedBundleCarriesNoConnectionsAndDefaultSettings() { }
[Fact] public async Task ImportingIntoAnotherBrainYieldsALiveAppWithEmptyConnectionSlots()
{
    // two ModuleTest brains, or one brain and two app names if the harness is single-brain:
    // export from app A (green), import as app B, assert files equal, Connections empty, Status Live.
}
[Fact] public async Task ImportingOverAnExistingAppIsRefusedAndLeavesItUntouched() { }
[Fact] public async Task EditingAnImportedAppBumpsItsOwnHistoryFromTheImportedBaseline() { }
```

- [ ] **Step 2: Run** — `--filter AppSharingFacts`; fix any neuron gaps (likely none if Task 2 was complete); green.
- [ ] **Step 3: Commit** — `git commit -m "test(apps): sharing gate facts — green-only export, clash-safe import"`.

---

### Task 6: HTTP surface

**Files:**
- Rewrite: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs`
- Delete (in Task 8, but stop mapping now): `Authoring/MarketplaceEndpoints.cs` routes.
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRouteFacts.cs` (replace `AppsRouteFacts.cs`)

**Interfaces:**
- Consumes: `IAppV2`, `CreatorService` (Task 4), `AppWorkQueue`/`AppVerifyJob` (Task 3), `BrainRoutes.Group`, `ModuleRouteGuard.Guard`, `ModuleHttp.Respond`.
- Produces the spec's exact surface:

```csharp
var apps = BrainRoutes.Group(endpoints, "/apps").AddEndpointFilter(ModuleRouteGuard.Guard);
apps.MapGet("", List);                                         // name, title, status, version per app
apps.MapPost("", Create);                                      // {text} -> CreatorService.Author(name: null) — sync
apps.MapGet("/{name}", Read);                                  // full AppSnapshot
apps.MapPost("/{name}/author", AuthorRevise);                  // {text} — sync
apps.MapPost("/{name}/implement", Implement);                  // 202 + Building snapshot
apps.MapPost("/{name}/verify", Verify);                        // 202
apps.MapPut("/{name}/settings", Configure);                    // {settings, connections}
apps.MapPost("/{name}/ask", Ask);                              // keep today's Invoke/poll shape from AppsEndpoints.Invoke
apps.MapPost("/{name}/rollback", Rollback);                    // {version}
apps.MapGet("/{name}/export", Export);                         // AppBundle JSON; 409 if not green
apps.MapPost("/import", Import);                               // AppBundle body; 409 on clash
apps.MapDelete("/{name}", Delete);
```

`Implement` and `Verify` return `Results.Accepted($"/brains/{brainId}/apps/{name}", snapshot)`. Listing: the module ships its `IRegistryInventoryProvider` update — the app inventory enumerates `{brain}/apps/*` names (adapt the existing apps inventory provider to the new key shape in this task).

- [ ] **Step 1: Write failing route facts** (in-proc host, follow the old `AppsRouteFacts.cs` harness): create-via-POST returns the Drafted snapshot; implement returns 202 then the app reaches Live (scripted builder); export of a red app returns 409; import clash returns 409; delete removes the app from the list.
- [ ] **Step 2: Run to verify failure** — `--filter AppRouteFacts` → FAIL.
- [ ] **Step 3: Implement the endpoints**, mapping errors: `InvalidOperationException` → 409, `ArgumentException` → 422, not-found name → 404.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit** — `git commit -m "feat(apps): new /brains/{id}/apps http surface with 202 implement/verify"`.

---

### Task 7: Shipped apps = startup bundle import

**Files:**
- Rewrite: `src/IntoChat/...ShippedAppPublisher` (locate via `Grep "ShippedAppPublisher" src/IntoChat src/Modules`) to: for each app folder/embedded source, build an `AppBundle` (manifest from a small `app.json` next to the spec, `Spec` from `app.spec.md`, files from `tests.cs` + `behaviors/`), verify it once through the Task 3 verify job, and `Import` it into the product brain if absent or at an older version.
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/DirectoryShippedAppSource.cs` and `EmbeddedShippedAppSource.cs` to yield `AppBundle`s.
- Modify: the folders under `src/IntoChat/Apps/` — add `app.json` (title/description/operations/settings/slots/version) where the manifest previously came from package commits.
- Test: replace `ShippedAppPublisherFacts.cs`: a directory source with one bundle ends up as a Live app; re-running with the same version is a no-op; a bumped version re-imports.

- [ ] **Step 1: Write the failing facts** (reuse the existing facts' harness and temp-directory setup).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**; same-version idempotence compares the installed snapshot's `Version` to the bundle's.
- [ ] **Step 4: Run to green.**
- [ ] **Step 5: Commit** — `git commit -m "feat(apps): shipped apps import as verified bundles at startup"`.

---

### Task 8: Deletion sweep + rename IAppV2 → IApp

**Files (delete):**
- `DigitalBrain.Modules.Apps.Contracts/Packages/` — entire folder EXCEPT nothing (all of it; `AppToolName` moves to `Apps/` if still referenced by `AppAgentTools`).
- `DigitalBrain.Modules.Apps.Contracts/Workspace/` — delete `IApp.cs`, `IApps.cs`, `InstallApp.cs`, `UpgradeApp.cs`, `ConfigureApp.cs`, `UninstallApp.cs`, `AppStatus.cs` (old enum), `AppSnapshot.cs` (old), `LiveApp.cs`, `AppRequirementsException.cs`; KEEP `AppInvocation.cs`, `AppInvocations.cs`, `AppCalls.cs`, `AppResponse.cs`, `InvocationStatus.cs`, `InvokeApp.cs` (move them to `Apps/`).
- `DigitalBrain.Modules.Apps.Contracts/Authoring/AppAuthoringDocument.cs`, `AppSpecView.cs`, `SpecVocabulary.cs`.
- `DigitalBrain.Modules.Apps/Packages/` — entire folder.
- `DigitalBrain.Modules.Apps/Workspace/` — entire folder.
- `DigitalBrain.Modules.Apps/Authoring/MarketplaceEndpoints.cs`, `MarketplaceService.cs` (in `Authoring/`), `AppDocumentCodec.cs`, `AppSpecVocabulary.cs`.
- `DigitalBrain.Modules.Apps/Runtimes/` — entire folder; inline the C# sandbox's `AuthoringDescription` into `CreatorService` (it already handles `csharp?.AuthoringDescription`).
- `DigitalBrain.Modules.Apps/Http/` — all request records except what Task 6's endpoints introduced.
- `DigitalBrain.Modules.Apps/Shipping/` — whatever Task 7 orphaned.
- Old signals: `AppsChanged.cs`, `PackageChanged.cs`, `PackageListed.cs`, `AppInvoked.cs`/`AppInvocationCompleted.cs` KEEP (invocations survive).
- Tests: delete every fact file that exercises deleted types (`Workspace/`, package, marketplace, document facts).

**Rename:** `IAppV2` → `IApp` everywhere (contracts, neuron, service, endpoints, tests); file `Apps/IApp2.cs` → `Apps/IApp.cs`.

- [ ] **Step 1: Delete the files above**, rename `IAppV2` → `IApp` (solution-wide find/replace, then `git grep -n "IAppV2"` must return nothing).
- [ ] **Step 2: Build the module and chase fallout**

Run: `dotnet build src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps` then `dotnet build src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: compile errors in `AppsModule` registration, `AppAgentTools`, `InstalledApps` inventory, IntoChat host composition, Apps E2E — fix each by deleting dead registrations/usages, not by resurrecting types.

- [ ] **Step 3: Build dependents**

Run: `dotnet build src/IntoChat` host project(s) and `dotnet build src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`; fix composition references.

- [ ] **Step 4: Run the module suite + OS unit suite**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` and `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "refactor(apps)!: delete packages, workspace vocabulary, marketplace, runtimes, authoring codec"`.

---

### Task 9: Flutter shell

**Files:**
- Modify: `src/Modules/Google/Flutter/app/core/lib/src/ui_client.dart` — new `appsRequest` helpers:

```dart
Future<Map<String, dynamic>> createApp(String brainId, String text) async =>
  Map<String, dynamic>.from(jsonDecode((await _request(
    'POST', '/brains/${Uri.encodeComponent(brainId)}/apps',
    body: {'text': text},
    // One Author inference call; csharpRequest already allows minutes.
    timeout: const Duration(minutes: 3),
  )).body) as Map);

Future<Map<String, dynamic>> appAction(String brainId, String name, String action,
        [Map<String, Object?>? body]) async => /* POST .../apps/{name}/{action}, 30s is fine: implement/verify return 202 immediately */;
```

- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/create_app_screen.dart` — `_implement` fires `appAction(..., 'implement')`, then the screen renders `status` + `activity` from the app snapshot it refreshes on `AppChanged` arriving over the existing brain SSE stream (reuse the `watchBrain`/workspace revision plumbing the screens already use to refresh); remove the long-blocking `_perform` spinner for implement/verify.
- Modify: `apps_screen.dart`, `app_spec_view.dart` — new wire shape (name/title/status/version/activity/versions; no owner, no revisions, no proposals); delete fork/publish/proposal widgets and any revision picker.
- Test: update `app_spec_test.dart` + screen tests to the new fake endpoint paths (`/brains/{id}/apps`, `/implement` returning a Building snapshot, a follow-up read returning Live).

- [ ] **Step 1: Update the Dart tests first** to the new wire shape and watch-driven implement flow; run `flutter test` from `src/Modules/Google/Flutter/app/shell` — expected FAIL.
- [ ] **Step 2: Implement** client methods and screen changes.
- [ ] **Step 3: Run** `flutter analyze` and `flutter test` from `src/Modules/Google/Flutter/app/shell` — expected clean/PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(shell): apps screens on the new wire — 202 implement, SSE-followed activity"`.

---

### Task 10: Whole-system verification

- [ ] **Step 1: Run every touched suite**

```bash
dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit
```

Plus any IntoChat E2E project that compiled against Apps (composition + shipped-content routes; live-gated journeys compile-only).

- [ ] **Step 2: Smoke with Aspire**

Run: `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`; all resources Healthy; exercise create → implement → verify → export through the shell or curl against the running host.

- [ ] **Step 3: Final commit** — `git commit -m "chore(apps): post-simplification verification pass"` (only if fixes landed).
