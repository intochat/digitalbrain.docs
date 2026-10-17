# Aspire 1/3 — Candidate Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A change to the brain's own source is proven in a disposable Docker container (`ICandidate`) verified by the live cluster over MCP, then promoted by a cold restart of the live cluster onto the new build; the Launcher, Revisions module and Aspire bridge are deleted.

**Architecture:** The Aspire module (`src/DigitalBrain.Modules/Microsoft/Aspire`) is rewritten around two neurons: `ICandidate` (`aspire/candidate/{sha}`, `{brain}`-prefixed) and `ICluster` (`aspire/cluster`). Two connectors behind internal interfaces do all host work: `ICandidateHost` (git, dotnet, docker, Azurite) and `IClusterHost` (the AppHost's resources through `aspire mcp start` over stdio). The live silos run a published build from `{Workdir}/builds/{sha}` chosen by `{Workdir}/live.json`, so restarting the silo resource switches code without restarting the AppHost.

**Tech Stack:** .NET 11 RC, Orleans, Aspire 13, ModelContextProtocol C# SDK (`McpClient`, `StdioClientTransport`, `HttpClientTransport`), Docker CLI, Azure.Storage.Blobs, xunit v3 via `DigitalBrain.Testing.Module`.

**Spec:** `docs/superpowers/specs/2026-10-10-aspire-instance-neuron-design.md` (build order step 1).

## Global Constraints

- Follow `CLAUDE.md`: LSP (csharp-ls) for every definition/reference before changing; LSP diagnostics clean; build per project, never the `.slnx`; warnings are errors; nullable on; central package versions in `Directory.Packages.props`.
- No boilerplate `/// <summary>`; sentence-shaped fact names; `TestContext.Current.CancellationToken`; real grains via `ModuleTest.Create().WithModule<AspireModule>()`.
- Concrete arrays in grain state, never `IReadOnlyList`.
- No retries, no raised timeouts, no polling added to make a check pass; every failure is a terminal stage with a reason.
- Commit explicit files only (`git add <path>...`), never a directory; parallel sessions share the tree.
- Kill any test run over 5 minutes and debug the hang.
- Grain keys start with the brain: `{brain}/aspire/candidate/{sha}`, `{brain}/aspire/cluster`.
- Module id stays `aspire`; namespace stays `DigitalBrain.Microsoft.Aspire`.
- Integration id `aspire`, required setting `Workdir`. Modules read it only through `IModuleIntegrations<AspireModule>`.
- Promote in this plan always uses `ICluster.Restart(sha)`; `Roll` arrives in plan 2, classification in plan 3.

## Review Focus

- Candidate code must have no route to live credentials or the live cluster's storage: the container gets only the LLM integration env and its own Azurite; assert the env passed to `docker run` contains no `DigitalBrain__Integrations__` key other than the LLM's.
- `Promote` called twice (double click / at-least-once synapse delivery) must not restart twice: second call on `Promoted` returns the snapshot unchanged.
- `ICluster.Restart` runs on a silo that is itself restarted: the stage must be persisted before the command and completed on the next activation (`Restarting(sha)` + current build == sha → `Steady`).
- A crash leaving `candidate-*` containers: `ICandidateHost.Orphans` removed on cluster activation.
- A second `Propose` while one candidate is live queues instead of starting a second container.

---

## File Structure

```
src/DigitalBrain.Modules/Microsoft/Aspire/
  DigitalBrain.Modules.Microsoft.Aspire.Contracts/
    ICandidate.cs              contract + Key()
    ICluster.cs                contract + Key()
    CandidateSnapshot.cs       CandidateStage, CandidateSnapshot, CandidateEndpoints
    ClusterSnapshot.cs         ClusterStage, SiloView, ClusterSnapshot
    VerificationPlan.cs        moved from Revisions (namespace changed)
    Signals/CandidateSignals.cs
    Signals/ClusterSignals.cs
    (deleted) IAspire.cs, AspireResource.cs, Signals/ResourceStateChanged.cs, Bridge/*
  DigitalBrain.Modules.Microsoft.Aspire/
    AspireModule.cs            Integration + Connector declarations, DI
    Candidates/CandidateNeuron.cs, CandidateState.cs, CandidateQueueNeuron.cs (ICandidates index)
    Candidates/ICandidateHost.cs, DockerCandidateHost.cs, Git.cs, ProcessRunner.cs, AzuriteCopy.cs
    Verification/CandidateVerifier.cs, ICandidateVerifier.cs
    Cluster/ClusterNeuron.cs, ClusterState.cs, IClusterHost.cs, AspireCliClusterHost.cs, LiveBuild.cs
    Resources/InfrastructureEndpoints.cs, InfrastructureView.cs   (rewired to ICluster)
    (deleted) Bridge/*, Resources/AspireNeuron.cs, AspireState.cs, IAspireResourceReporter.cs
  DigitalBrain.Modules.Microsoft.Aspire.Aspire.Hosting/
    AspireModuleHosting.cs     silo-from-build wiring (no bridge)
  tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/
    FakeCandidateHost.cs, FakeClusterHost.cs, FakeVerifier.cs
    CandidateFacts.cs, CandidateQueueFacts.cs, CandidateVerifierFacts.cs, ClusterFacts.cs, DockerCandidateHostFacts.cs
    (deleted) AspireNeuronFacts.cs
```

---

### Task 1: Contracts

**Files:**
- Create: the Contracts files listed above.
- Delete: `Contracts/IAspire.cs`, `Contracts/AspireResource.cs`, `Contracts/Signals/ResourceStateChanged.cs`, `Contracts/Bridge/*.cs` — **only after** LSP `findReferences` on each type; every reference is in files this plan deletes or rewrites (Task 7 list). Record any other reference and handle it in Task 7.
- Test: compiles; covered by later facts.

**Interfaces — Produces:**

```csharp
namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("aspire.candidate.stage")]
public enum CandidateStage { Proposed, Queued, Building, Starting, Healthy, Verifying, Verified, Promoting, Promoted, Discarded, Failed }

[GenerateSerializer, Alias("aspire.candidate.endpoints")]
public sealed record CandidateEndpoints([property: Id(0)] string Mcp, [property: Id(1)] string Ui);

[GenerateSerializer, Alias("aspire.candidate.snapshot")]
public sealed record CandidateSnapshot(
    [property: Id(0)] string Sha,
    [property: Id(1)] string Branch,
    [property: Id(2)] string Summary,
    [property: Id(3)] CandidateStage Stage,
    [property: Id(4)] CandidateEndpoints? Endpoints,
    [property: Id(5)] VerificationPlan? Plan,
    [property: Id(6)] VerificationReport? Report,
    [property: Id(7)] string? Failure,
    [property: Id(8)] CandidateStage[] History);

[GenerateSerializer, Alias("aspire.candidate.proposal")]
public sealed record CandidateProposal(
    [property: Id(0)] string Branch,
    [property: Id(1)] string Summary,
    [property: Id(2)] Dictionary<string, string> Files,
    [property: Id(3)] VerificationPlan Plan);

[Alias("aspire.candidate"), DefaultGrainType("aspire.candidate")]
public interface ICandidate : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<CandidateSnapshot> Read();
    Task<CandidateSnapshot> Propose(string branch, string summary, VerificationPlan plan);
    Task<CandidateSnapshot> Queue();
    [AlwaysInterleave, ResponseTimeout("00:20:00")] Task<CandidateSnapshot> Start();
    [AlwaysInterleave, ResponseTimeout("00:30:00")] Task<CandidateSnapshot> Verify();
    [ResponseTimeout("00:10:00")] Task<CandidateSnapshot> Promote();
    Task<CandidateSnapshot> Discard();
    static string Key(string brainId, string sha) => $"{brainId}/aspire/candidate/{sha}";
}

// The per-brain index: writes the files into a fresh worktree, queues, starts the next.
[Alias("aspire.candidates"), DefaultGrainType("aspire.candidates")]
public interface ICandidates : INeuron
{
    [ResponseTimeout("00:05:00")] Task<string> Propose(CandidateProposal proposal);
    [ReadOnly, AlwaysInterleave] Task<string?> Live();
    Task Ended(string sha);
    static string Key(string brainId) => $"{brainId}/aspire/candidates";
}

[GenerateSerializer, Alias("aspire.cluster.stage")]
public enum ClusterStage { Steady, Restarting, Rolling }

[GenerateSerializer, Alias("aspire.cluster.silo")]
public sealed record SiloView([property: Id(0)] string Name, [property: Id(1)] string Sha, [property: Id(2)] string State, [property: Id(3)] string? Health);

[GenerateSerializer, Alias("aspire.cluster.snapshot")]
public sealed record ClusterSnapshot(
    [property: Id(0)] string CurrentSha,
    [property: Id(1)] ClusterStage Stage,
    [property: Id(2)] string? TargetSha,
    [property: Id(3)] SiloView[] Silos);

[Alias("aspire.cluster"), DefaultGrainType("aspire.cluster")]
public interface ICluster : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<ClusterSnapshot> Read();
    [AlwaysInterleave] Task<SiloView[]> Silos(CancellationToken cancellationToken = default);
    [ResponseTimeout("00:10:00")] Task<ClusterSnapshot> Restart(string sha);
    static string Key(string brainId) => $"{brainId}/aspire/cluster";
}
```

`VerificationPlan.cs`: move `NeuronExpectation`, `VerificationPlan`, `VerificationCheck`, `VerificationReport` verbatim from `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/VerificationPlan.cs`, change namespace to `DigitalBrain.Microsoft.Aspire`, aliases to `aspire.expectation|plan|check|report`, and replace `AspireKey` (id 4) with nothing — `HealthyResources` now names candidate health paths; keep the record shape otherwise:

```csharp
[GenerateSerializer, Alias("aspire.plan")]
public sealed record VerificationPlan(
    [property: Id(0)] NeuronExpectation[] Calls,
    [property: Id(1)] string[] Spans,
    [property: Id(2)] TimeSpan Budget);
```

Signals (`Signals/CandidateSignals.cs`), each `: Signal`, `[GenerateSerializer]`, alias `aspire.candidate.<name>`:
`CandidateChanged(string Sha, CandidateStage Stage)`, `CandidateStarted(string Sha, CandidateEndpoints Endpoints)`, `CandidateHealthy(string Sha)`, `CandidateVerified(string Sha, VerificationReport Report)`, `CandidatePromoted(string Sha)`, `CandidateFailed(string Sha, CandidateStage Stage, string Reason)`.
`Signals/ClusterSignals.cs`: `ClusterChanged(string CurrentSha, ClusterStage Stage, string? TargetSha)`.

- [x] **Step 1:** LSP `findReferences` on `IAspire`, `AspireResource`, `ResourceStateChanged`, `AspireBridgeCommand`, `AspireBridgeCommandResult`, `AspireBridgeRoutes`; write the list into the task notes.
- [x] **Step 2:** Create the new contract files above.
- [x] **Step 3:** `dotnet build src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/DigitalBrain.Modules.Microsoft.Aspire.Contracts.csproj` → success (old types still present; deletion in Task 7).
- [x] **Step 4:** Commit: `git add <each new file>`; `git commit -m "Aspire: candidate and cluster contracts"`.

---

### Task 2: Connector seams and fakes

**Files:**
- Create: `Candidates/ICandidateHost.cs`, `Cluster/IClusterHost.cs`, `Verification/ICandidateVerifier.cs`
- Create: `tests/.../FakeCandidateHost.cs`, `FakeClusterHost.cs`, `FakeVerifier.cs`

**Interfaces — Produces:**

```csharp
namespace DigitalBrain.Microsoft.Aspire.Candidates;

internal sealed record PreparedCandidate(string Sha, string Worktree);
internal sealed record RunningCandidate(string Sha, CandidateEndpoints Endpoints, string Container);

// The only code that touches git, dotnet, docker and Azurite for candidates.
internal interface ICandidateHost
{
    Task<PreparedCandidate> Prepare(string baseSha, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct);
    Task BuildGate(string sha, CancellationToken ct);                 // dotnet build + touched tests; throws CandidateHostException
    Task<string> Publish(string sha, CancellationToken ct);           // returns build folder {Workdir}/builds/{sha}
    Task<RunningCandidate> Run(string sha, CancellationToken ct);     // image + azurite + copy of live storage
    Task WaitHealthy(string sha, TimeSpan budget, CancellationToken ct); // throws TimeoutException
    Task Commit(string sha, string branch, CancellationToken ct);     // fast-forward branch to sha
    Task Remove(string sha, CancellationToken ct);                    // container + its azurite + network
    Task<string[]> Orphans(string[] known, CancellationToken ct);     // removes candidate-* containers not in known, returns removed
}

internal sealed class CandidateHostException(string stage, string message) : Exception(message)
{
    public string Stage { get; } = stage;
}
```

```csharp
namespace DigitalBrain.Microsoft.Aspire.Cluster;

// The live AppHost, reached through `aspire mcp start` over stdio.
internal interface IClusterHost
{
    Task<string> CurrentSha(CancellationToken ct);                        // from {Workdir}/live.json
    Task SetLive(string sha, CancellationToken ct);                       // writes live.json (build must exist)
    Task<SiloView[]> Silos(CancellationToken ct);                         // list_resources filtered to silo replicas
    Task RestartSilos(CancellationToken ct);                              // execute_resource_command restart on the silo resource
}
```

```csharp
namespace DigitalBrain.Microsoft.Aspire.Verification;

internal interface ICandidateVerifier
{
    Task<VerificationReport> Verify(string brainId, string sha, CandidateEndpoints endpoints, VerificationPlan plan, CancellationToken ct);
}
```

Fakes (tests): `FakeCandidateHost` records `Calls` (`"prepare"`, `"gate {sha}"`, `"publish {sha}"`, `"run {sha}"`, `"healthy {sha}"`, `"commit {sha} {branch}"`, `"remove {sha}"`), returns sha `"sha0001"`, `"sha0002"`… from `Prepare`, endpoints `http://localhost:5191` / `5190`; flags `FailAt` (string stage name → throws `CandidateHostException`), `Healthy` (false → `WaitHealthy` throws `TimeoutException`), `Orphaned` (string[] returned by `Orphans`). Captures `RunEnvironment` dictionary for Review Focus #1 (the docker host fills it; the fake just exposes the same property for the neuron-level assertion that nothing else is passed). `FakeClusterHost`: `Current` (string, default `"base000"`), `Restarts` (int), `SetLive` sets `Current`, `Silos` returns two `SiloView("silo-0"/"silo-1", Current, "Running", "Healthy")`. `FakeVerifier`: `Passed` flag, returns a report with one check.

- [x] **Step 1:** Create the interfaces and fakes.
- [x] **Step 2:** Build the module and test projects (`dotnet build src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/DigitalBrain.Modules.Microsoft.Aspire.Tests.csproj`). Tests project needs `InternalsVisibleTo` — check with LSP whether the module already grants it (the Revisions module did for its tests); add `<InternalsVisibleTo Include="DigitalBrain.Modules.Microsoft.Aspire.Tests" />` to the module csproj if missing.
- [x] **Step 3:** Commit explicit files: `"Aspire: candidate and cluster host seams"`.

---

### Task 3: CandidateNeuron stage machine

**Files:**
- Create: `Candidates/CandidateNeuron.cs`, `Candidates/CandidateState.cs`
- Test: `tests/.../CandidateFacts.cs`

**Interfaces:** Consumes Task 1 contracts, Task 2 seams. `CandidateNeuron` is a port of `RevisionNeuron` (`src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionNeuron.cs`) with: `Start` = `BuildGate` → `Publish` → `Run` → `WaitHealthy`; `Verify` takes the plan from state; `Promote` = `Commit` → `ICluster.Restart(sha)` → `Remove` → `Promoted`.

`CandidateState`:

```csharp
[GenerateSerializer, Alias("aspire.candidate.state")]
internal sealed record CandidateState
{
    [Id(0)] public string Branch { get; init; } = "";
    [Id(1)] public string Summary { get; init; } = "";
    [Id(2)] public CandidateStage Stage { get; init; } = CandidateStage.Proposed;
    [Id(3)] public CandidateEndpoints? Endpoints { get; init; }
    [Id(4)] public VerificationPlan? Plan { get; init; }
    [Id(5)] public VerificationReport? Report { get; init; }
    [Id(6)] public string? Failure { get; init; }
    [Id(7)] public CandidateStage[] History { get; init; } = [];
}
```

Key: `ICandidate.Key(brain, sha)`; parse `Sha` as last segment, `BrainId` via `BrainKey.BrainOf(Key)` (as `RevisionNeuron` does). Budget for `WaitHealthy` = `plan.Budget`.

- [x] **Step 1: Write failing facts** in `CandidateFacts.cs`:

```csharp
public sealed class CandidateFacts
{
    private static readonly VerificationPlan Plan = new([new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "*")], [], TimeSpan.FromMinutes(5));

    private static Task<ModuleBrain> StartAsync(FakeCandidateHost host, FakeClusterHost cluster, FakeVerifier verifier, CancellationToken ct)
        => ModuleTest.Create().WithModule<AspireModule>()
            .ConfigureSilo(silo =>
            {
                silo.Services.AddSingleton<ICandidateHost>(host);
                silo.Services.AddSingleton<IClusterHost>(cluster);
                silo.Services.AddSingleton<ICandidateVerifier>(verifier);
            })
            .StartAsync(ct);

    [Fact]
    public async Task ACandidateWalksBuildingStartingHealthyVerifiedPromoted()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost();
        var cluster = new FakeClusterHost();
        await using var brain = await StartAsync(host, cluster, new FakeVerifier(), ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
        await using var promoted = await brain.Observe<CandidatePromoted>(candidate, ct);

        await candidate.Propose("os-runtime", "change", Plan);
        Assert.Equal(CandidateStage.Healthy, (await candidate.Start()).Stage);
        Assert.Equal(CandidateStage.Verified, (await candidate.Verify()).Stage);
        var final = await candidate.Promote();

        Assert.Equal(CandidateStage.Promoted, final.Stage);
        Assert.Equal("sha0001", (await promoted.NextAsync(ct: ct)).Sha);
        Assert.Equal("sha0001", cluster.Current);
        Assert.Equal(1, cluster.Restarts);
        Assert.Equal(["gate sha0001", "publish sha0001", "run sha0001", "healthy sha0001", "commit sha0001 os-runtime", "remove sha0001"], host.Calls);
    }

    [Fact]
    public async Task PromoteIsRefusedBeforeVerification() { /* Propose, Start, Promote → InvalidOperationException; cluster.Restarts == 0 */ }

    [Fact]
    public async Task PromotingTwiceRestartsTheClusterOnce() { /* walk to Promoted, Promote again → Stage Promoted, cluster.Restarts == 1 */ }

    [Fact]
    public async Task AFailedBuildGateEndsAtBuildingWithItsReason() { /* host.FailAt = "gate"; Start → Failed; CandidateFailed.Stage == Building; host.Calls has no "run" */ }

    [Fact]
    public async Task AnUnhealthyCandidateFailsAtStartingAndIsRemoved() { /* host.Healthy = false; Start → Failed; Calls ends with "remove sha0001" */ }

    [Fact]
    public async Task AMissedExpectationFailsAtVerifyingAndRemovesTheContainer() { /* verifier.Passed = false; Verify → Failed, Failure names the check; Calls ends with "remove sha0001" */ }
}
```

Write the commented facts in full in the same style as the first (arrange with the fakes, act, assert the listed values).

- [x] **Step 2:** `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests -- --filter-class "*CandidateFacts"` → FAIL (types missing).
- [x] **Step 3: Implement `CandidateNeuron`.**

```csharp
[GrainType("aspire.candidate")]
internal sealed class CandidateNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CandidateState> store,
    ICandidateHost host,
    ICandidateVerifier verifier)
    : Neuron<CandidateState>(store), ICandidate
{
    private string Key => this.GetPrimaryKeyString();
    private string Sha => Key[(Key.LastIndexOf('/') + 1)..];
    private string BrainId => BrainKey.BrainOf(Key);
    private ICandidates Index => GrainFactory.GetGrain<ICandidates>(ICandidates.Key(BrainId));
    private ICluster Cluster => GrainFactory.GetGrain<ICluster>(ICluster.Key(BrainId));

    public Task<CandidateSnapshot> Read() => Task.FromResult(Describe());

    public async Task<CandidateSnapshot> Propose(string branch, string summary, VerificationPlan plan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(branch);
        ArgumentNullException.ThrowIfNull(plan);
        if (Exists && Snapshot.History.Length > 0) { throw new InvalidOperationException($"Candidate {Sha} is already {Snapshot.Stage}."); }
        await Move(CandidateStage.Proposed, new CandidateState { Branch = branch, Summary = summary, Plan = plan }, null);
        return Describe();
    }

    public async Task<CandidateSnapshot> Queue()
    {
        Require(CandidateStage.Proposed);
        await Move(CandidateStage.Queued, Snapshot, null);
        return Describe();
    }

    public async Task<CandidateSnapshot> Start()
    {
        Require(CandidateStage.Proposed, CandidateStage.Queued);
        var plan = Snapshot.Plan!;
        try
        {
            await Move(CandidateStage.Building, Snapshot, null);
            await host.BuildGate(Sha, CancellationToken.None);
            await host.Publish(Sha, CancellationToken.None);
            await Move(CandidateStage.Starting, Snapshot, null);
            var running = await host.Run(Sha, CancellationToken.None);
            await Move(CandidateStage.Starting, Snapshot with { Endpoints = running.Endpoints }, new CandidateStarted(Sha, running.Endpoints));
            await host.WaitHealthy(Sha, plan.Budget, CancellationToken.None);
            await Move(CandidateStage.Healthy, Snapshot, new CandidateHealthy(Sha));
        }
        catch (Exception error) when (error is CandidateHostException or TimeoutException or InvalidOperationException)
        {
            await Fail(error.Message, removeContainer: Snapshot.Stage == CandidateStage.Starting);
        }
        return Describe();
    }

    public async Task<CandidateSnapshot> Verify()
    {
        Require(CandidateStage.Healthy);
        var plan = Snapshot.Plan!;
        await Move(CandidateStage.Verifying, Snapshot, null);
        using var budget = new CancellationTokenSource(plan.Budget);
        VerificationReport report;
        try { report = await verifier.Verify(BrainId, Sha, Snapshot.Endpoints!, plan, budget.Token); }
        catch (OperationCanceledException) when (budget.IsCancellationRequested) { await Fail($"budget {plan.Budget} exceeded", removeContainer: true); return Describe(); }
        catch (Exception error) when (error is InvalidOperationException or HttpRequestException) { await Fail(error.Message, removeContainer: true); return Describe(); }
        if (report.Passed) { await Move(CandidateStage.Verified, Snapshot with { Report = report }, new CandidateVerified(Sha, report)); }
        else
        {
            var failed = report.Checks.First(check => !check.Passed);
            await Fail($"{failed.Name}: {failed.Detail}", removeContainer: true, Snapshot with { Report = report });
        }
        return Describe();
    }

    public async Task<CandidateSnapshot> Promote()
    {
        if (Snapshot.Stage == CandidateStage.Promoted) { return Describe(); }
        if (Snapshot.Stage != CandidateStage.Verified) { throw new InvalidOperationException($"Candidate {Sha} is {Snapshot.Stage}; only a Verified candidate can be promoted."); }
        await Move(CandidateStage.Promoting, Snapshot, null);
        await host.Commit(Sha, Snapshot.Branch, CancellationToken.None);
        await Cluster.Restart(Sha);
        await host.Remove(Sha, CancellationToken.None);
        await Move(CandidateStage.Promoted, Snapshot, new CandidatePromoted(Sha));
        await Index.Ended(Sha);
        return Describe();
    }

    public async Task<CandidateSnapshot> Discard()
    {
        if (Snapshot.Stage is CandidateStage.Promoted or CandidateStage.Discarded) { return Describe(); }
        if (Snapshot.Endpoints is not null) { await host.Remove(Sha, CancellationToken.None); }
        await Move(CandidateStage.Discarded, Snapshot, null);
        await Index.Ended(Sha);
        return Describe();
    }

    private void Require(params CandidateStage[] stages)
    {
        if (!stages.Contains(Snapshot.Stage)) { throw new InvalidOperationException($"Candidate {Sha} is {Snapshot.Stage}; expected {string.Join(" or ", stages)}."); }
    }

    // The failed signal names the stage the candidate was in.
    private async Task Fail(string reason, bool removeContainer, CandidateState? from = null)
    {
        var failedAt = Snapshot.Stage;
        if (removeContainer) { await host.Remove(Sha, CancellationToken.None); }
        await Move(CandidateStage.Failed, (from ?? Snapshot) with { Failure = reason }, new CandidateFailed(Sha, failedAt, reason));
        await Index.Ended(Sha);
    }

    private Task Move(CandidateStage stage, CandidateState next, Signal? acted)
        => Save(next with { Stage = stage, History = [.. next.History, stage] }, new CandidateChanged(Sha, stage), acted);

    private CandidateSnapshot Describe()
        => new(Sha, Snapshot.Branch, Snapshot.Summary, Snapshot.Stage, Snapshot.Endpoints, Snapshot.Plan, Snapshot.Report, Snapshot.Failure, Snapshot.History);
}
```

Before relying on `Save(next, params Signal?[])` and `Exists`, LSP `goToDefinition` on `Neuron<TState>.Save` in `RevisionNeuron` to confirm the overload accepts two signals including a null; adapt calls if it does not.

`Index.Ended` needs `ICandidates` (Task 4). For this task, register `ICandidates` stub-free: write Task 4's neuron first if the facts need it, or order Steps so Task 4 lands in the same commit. **Decision:** implement Task 4 in this task's commit; its facts are Task 4.

- [x] **Step 4:** `ClusterNeuron.Restart` is needed by the first fact — implement Task 5 Step 3's minimal `ClusterNeuron` here too (same commit), facts in Task 5.
- [x] **Step 5:** Register in `AspireModule.Configure(ISiloBuilder)`: `TryAddSingleton<ICandidateVerifier, CandidateVerifier>()`, `TryAddSingleton<ICandidateHost, DockerCandidateHost>()`, `TryAddSingleton<IClusterHost, AspireCliClusterHost>()` (implementations from Tasks 6, 8, 9; until they exist, leave the registrations commented out of this commit and add them in their tasks — tests inject fakes).
- [x] **Step 6:** Run the filter → PASS (6 facts).
- [x] **Step 7:** Commit explicit files: `"Aspire: candidate stage machine"`.

---

### Task 4: ICandidates index (queueing)

**Files:**
- Create: `Candidates/CandidateQueueNeuron.cs`, `Candidates/CandidateQueueState.cs`
- Test: `tests/.../CandidateQueueFacts.cs`

Port of `RevisionIndexNeuron.cs` (`src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionIndexNeuron.cs`, read it fully first). Differences: `Propose` calls `host.Prepare(baseSha: await Cluster.Read() → CurrentSha, proposal.Summary, proposal.Files, ct)`, then `ICandidate.Propose(branch, summary, plan)`; starts via a one-way self reference (`this.AsReference<ICandidateQueueWork>()` with `[OneWay] Task StartLive(string sha)`), queues otherwise. State: `string? Live`, `string[] Queue` (concrete array).

- [x] **Step 1: Failing facts:**

```csharp
[Fact]
public async Task ASecondProposalQueuesUntilTheFirstEnds()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeCandidateHost { Healthy = false };   // first candidate ends quickly at Failed
    await using var brain = await CandidateFacts.StartAsync(host, new FakeClusterHost(), new FakeVerifier(), ct);
    var index = brain.Get<ICandidates>(ICandidates.Key("owner"));
    var second = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0002"));
    await using var secondStarted = await brain.Observe<CandidateStarted>(second, ct);

    var first = await index.Propose(new("b", "one", [], Plan));
    var queued = await index.Propose(new("b", "two", [], Plan));

    Assert.Equal("sha0001", first);
    Assert.Equal("sha0002", queued);
    Assert.Equal("sha0002", (await secondStarted.NextAsync(ct: ct)).Sha);   // started only after sha0001 ended
    Assert.True(host.Calls.IndexOf("remove sha0001") < host.Calls.IndexOf("run sha0002"));
}

[Fact]
public async Task TheCandidateIsPreparedFromTheLiveClustersSha()
{   // cluster.Current = "live123"; Propose → host.PreparedFrom == "live123"
}
```

(Make `CandidateFacts.StartAsync` and `Plan` `internal static` so both fact classes share them. Add `PreparedFrom` to `FakeCandidateHost`.)

- [x] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `"Aspire: candidates queue one at a time per brain"`.

---

### Task 5: ClusterNeuron (restart only)

**Files:**
- Create: `Cluster/ClusterNeuron.cs`, `Cluster/ClusterState.cs`
- Test: `tests/.../ClusterFacts.cs`

Behavior:
- `Restart(sha)`: if `Stage == Restarting && TargetSha == sha` return; persist `Stage = Restarting, TargetSha = sha` **before** acting; `await host.SetLive(sha)`; `await host.RestartSilos()`. The calling silo may die here; that is expected.
- `OnActivateAsync`: `var current = await host.CurrentSha(ct)`; if `Stage == Restarting && current == TargetSha` → save `Steady, CurrentSha = current, TargetSha = null` with `ClusterChanged`; also call `host.Orphans`-equivalent through `ICandidateHost.Orphans(known)` where `known` = `Live` and `Queue` of the brain's `ICandidates` (Review Focus #4).
- `Silos()` returns `host.Silos(ct)`.

- [x] **Step 1: Failing facts:**

```csharp
[Fact]
public async Task RestartPointsTheLiveBuildAtTheShaAndRestartsTheSilos()
{   // Restart("sha0001") → cluster.Current == "sha0001", Restarts == 1, Read().Stage == Restarting
}

[Fact]
public async Task ARestartIsCompletedByTheNextActivationOnTheNewBuild()
{   // Restart("sha0001"); brain.Deactivate(cluster grain) (find the ModuleBrain helper via LSP; if none, use IGrainManagementExtension / `DeactivateOnIdle` through a test-only interface) ; Read() → Steady, CurrentSha "sha0001"
}

[Fact]
public async Task RestartingToTheSameShaTwiceRestartsOnce() { }

[Fact]
public async Task OrphanCandidateContainersAreRemovedOnActivation()
{   // host.Orphaned = ["candidate-dead"]; activate cluster → host.Calls contains "orphans"
}
```

Fill the bodies in the style of Task 3.

- [x] Steps 2–5: fail, implement, pass, commit `"Aspire: cluster restarts onto a build and completes on reactivation"`.

---

### Task 6: CandidateVerifier over IMcpServer

**Files:**
- Create: `Verification/CandidateVerifier.cs`
- Modify: module csproj — ProjectReference to `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/DigitalBrain.Modules.Mcp.Contracts` (check with LSP whether `IMcpServer` is reachable already).
- Test: `tests/.../CandidateVerifierFacts.cs`; reuse `ScriptedMcpServer.cs` from `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/ScriptedMcpServer.cs` — **move** it into this test project (it is deleted with Revisions in Task 7).

Port of `RevisionVerifier.cs` with these changes:
- No `McpNeuronClient`: connect `IMcpServer` keyed `{brain}/mcp/candidate-{sha}` with `Connect(new McpServerSpec($"candidate {sha}", $"{endpoints.Mcp}/brains/{brainId}/mcp"))`, then `Run("neurons_context", "{}")`, `Run("neurons_call", json)`. Parse `ToolResult` text as JSON (LSP `goToDefinition` on `ToolResult` for its shape). `Disconnect` in `finally`.
- Resource checks removed (plan no longer has them); the first check stays `context` (child answers for the brain), the second is `activation`: `neurons_call` on `DigitalBrain.Apps.IApps`-equivalent list — **find via LSP** the kernel/app index contract that enumerates the brain's apps, and call its read method; passes when it answers without error (proves copied state activates).
- Spans: the candidate exports OTLP to the live dashboard with `OTEL_SERVICE_NAME=candidate-{sha}` (Task 8). Spans check uses `IClusterHost.Spans(serviceName, spanName, ct)` → add that method to `IClusterHost` (`Task<int> Spans(string service, string span, CancellationToken ct)`, implemented in Task 9 via the Aspire MCP `list_traces` tool, as `AspireCliTelemetry` did) and to `FakeClusterHost` (`SpanCounts` dictionary).

- [x] **Step 1:** Failing facts: `ACandidateAnsweringForAnotherBrainFailsTheContextCheck`, `ACallAnsweringTheExpectedTextPasses`, `AMissingSpanFailsWithItsCount`, `VerificationStopsAtTheFirstFailedCheck` — each wires `ScriptedMcpServer` (read the moved file to see how it scripts answers) and asserts `report.Checks` names/`Passed`.
- [x] Steps 2–5: fail, implement, pass, commit `"Aspire: candidates verified through IMcpServer"`.

---

### Task 7: Delete the Launcher, Revisions and the bridge; rewire references

**Files (delete):** `src/DigitalBrain.Launcher/**` (both projects), `src/DigitalBrain.Modules/DigitalBrain/Revisions/**` (all 4 projects + tests), `Aspire/Bridge/*`, `Aspire.Hosting/AspireBridgeClient.cs`, `Resources/AspireNeuron.cs`, `AspireState.cs`, `IAspireResourceReporter.cs`, `tests/.../AspireNeuronFacts.cs`, old contract files from Task 1, `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/FakeLauncherHost.cs`.

**Files (modify)** — every site from the research, confirm each with LSP/text search before editing:
- `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:32` remove `RevisionsModule`.
- `src/DigitalBrain.AppHost/AppHost.cs:16,24,61` remove Revisions hosting; keep `AspireModuleHosting`.
- `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj:27` remove Revisions hosting reference.
- `src/DigitalBrain.AppHost/appsettings.json:23-27` remove `revisions` options.
- `DigitalBrain.slnx:63-67, 158-161` remove Revisions and Launcher entries.
- `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs:27` replace `TheOperatingSystemComposesTheRevisionsModule` with `TheOperatingSystemComposesTheAspireModule` (assert `AspireModule` present).
- `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/SelfImproveFacts.cs`, `SelfImproveHostFixture.cs`: rewrite against `ICandidates` with `FakeCandidateHost`/`FakeClusterHost` injected via `ConfigureSilo` (move both fakes to `src/Testing` only if the E2E project cannot reference the module test project; prefer `InternalsVisibleTo` + linking the two fake files via `<Compile Include=... Link=...>`).
- `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ProductE2E.cs:7` remove unused `using`.
- `src/Testing/DigitalBrain.Architecture.Tests/CollectionCompatibilitySamples.json:269,276` remove `AspireResource` samples; add samples for `CandidateSnapshot`, `ClusterSnapshot`, `CandidateState` if the architecture test requires every state type to have one (run it to see).
- `src/DigitalBrain.Platform/DigitalBrain.Platform/Workshop/IWorkshop.cs:8` comment: `IAspire.RestartResource` → `ICluster.Restart`.
- `Resources/InfrastructureEndpoints.cs`, `InfrastructureView.cs`: read `ICluster.Silos()` instead of `IAspire.ListResources`; the `aspire` row shows the silos.
- `AspireModuleHosting.cs`: remove bridge key projection and the hosted `AspireBridgeClient`.
- `AspireOptions.cs`: drop `ApplicationName` if no reference remains.

- [x] **Step 1:** LSP `findReferences` on `RevisionsModule`, `IRevision`, `IRevisions`, `ILauncherClient`, `AspireModule.ConfigurationRoot`, `AspireOptions.ApplicationName`; text search (not code) for `Launcher`, `revisions` in json/slnx/csproj/md.
- [x] **Step 2:** Delete and modify as listed.
- [x] **Step 3:** Build each affected project: AppHost, OS, OS.Tests.Unit, OS.Tests.E2E, Aspire module + tests, Architecture.Tests.
- [x] **Step 4:** Run `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests`, `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`, `src/Testing/DigitalBrain.Architecture.Tests` → PASS.
- [x] **Step 5:** Commit explicit files (use `git add -u <each deleted/modified path>` per path, plus new files): `"Aspire: delete Launcher, Revisions and the bridge"`.

---

### Task 8: DockerCandidateHost

**Files:**
- Create: `Candidates/DockerCandidateHost.cs`, `Candidates/Git.cs`, `Candidates/ProcessRunner.cs`, `Candidates/AzuriteCopy.cs`
- Modify: `AspireModule.cs` — Integration + Connector declarations; DI registration.
- Test: `tests/.../DockerCandidateHostFacts.cs` (uses a fake `IProcessRunner`).

Declarations in `AspireModule`:

```csharp
public static IntegrationSchema Integration { get; } = IntegrationSchema.For("aspire", "Aspire")
    .RequiresSetting("Workdir");

public static ConnectorDefinition Connector => new("aspire", "Aspire", [], ["aspire"])
{
    Neurons = [typeof(ICandidate), typeof(ICluster)],
    Signals = [typeof(CandidatePromoted), typeof(CandidateFailed), typeof(ClusterChanged)],
};
```

Check with LSP how `GitHubModule` exposes `Integration`/`Connector` and whether `AuthMethods` may be empty (find `ConnectorDefinition` validation); mirror it. The AppHost must provision the integration: find how the AppHost sets `DigitalBrain:Integrations:{id}:{Field}` (LSP on `IntegrationSchema.For` usages in `src/DigitalBrain.AppHost`) and set `aspire:Workdir` to `{repo}/.digitalbrain` (gitignored — add to `.gitignore`).

`Git.cs`, `ProcessRunner.cs`: port `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/Git.cs`, `IProcessRunner.cs`, `SystemProcessRunner.cs` verbatim (internal, namespace `DigitalBrain.Microsoft.Aspire.Candidates`) **before** Task 7 deletes them — copy in this task's Step 1 if Task 7 already ran, recover from `git show HEAD~N:path`. Fix the undrained stdout in `Start` by not redirecting output for long-running processes.

`AzuriteCopy.cs`: port `AzuriteStorageCopier` but copy **between two endpoints**: `CopyAsync(BlobServiceClient from, string sourceContainer, BlobServiceClient to, string destinationContainer, ct)` with download/upload (cross-account `StartCopyFromUri` fails without SAS).

`DockerCandidateHost` (paths from `Workdir` read via `IModuleIntegrations<AspireModule>.Get("aspire").ReadAsync()`):
- `Prepare`: `git worktree add --detach {Workdir}/worktrees/staging-{guid} {baseSha}` (in the repository = parent of `Workdir`), write files, `git add -A`, `git commit -m summary`, short sha, move to `{Workdir}/worktrees/{sha}`, `git worktree repair`.
- `BuildGate`: in the worktree, `dotnet build` each project under directories touched by the commit (`git diff --name-only {baseSha} HEAD` → nearest `.csproj`), then `dotnet test --project` for each touched module's `tests/*` project. Non-zero exit → `CandidateHostException("gate", lastLinesOfOutput)`.
- `Publish`: `dotnet publish src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -c Release -o {Workdir}/builds/{sha}` then `docker build -t digitalbrain-candidate:{sha} -f {Workdir}/Candidate.Dockerfile {Workdir}/builds/{sha}` where `Candidate.Dockerfile` is written once by the host:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:11.0-preview
WORKDIR /app
COPY . .
ENTRYPOINT ["dotnet", "DigitalBrain.OS.dll"]
```

  (Verify the aspnet 11 preview image tag with context7/microsoft-learn before writing.)
- `Run`: allocate ports `5190 + 10*n` for the first free block (check `docker ps` and listeners); `docker network create candidate-{sha}`; `docker run -d --name candidate-{sha}-azurite --network candidate-{sha} -p {p+5}:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0`; copy the live grain-state container (`DigitalBrainNames.GrainStateContainer`, from the live Azurite endpoint — find the live connection string key via LSP on `DigitalBrainNames.GrainStateContainerKey` usages) to the candidate Azurite; `docker run -d --name candidate-{sha} --network candidate-{sha} -p {p}:5080 -p {p+1}:5081 -e ... digitalbrain-candidate:{sha}`. Environment: the exact config the OS host needs to boot standalone — **discover by reading** how `DigitalBrain.AppHost` projects env into the OS resource (`DigitalBrainHostingExtensions.cs:32-121`) and reproduce: Orleans localhost clustering, `Orleans__ServiceId=intochat-c{sha}`, `Orleans__ClusterId=intochat-c{sha}`, grain storage connection = candidate Azurite, `DigitalBrain__Http__UiPort=5080`, `McpPort=5081`, `OTEL_EXPORTER_OTLP_ENDPOINT` = live dashboard OTLP (`host.docker.internal`), `OTEL_SERVICE_NAME=candidate-{sha}`, and only the LLM integration keys copied from the live process config. Record the env in `LastRunEnvironment` for the Review Focus fact.
- `WaitHealthy`: probe `http://localhost:{p+1}/health` until OK or budget — this is a readiness wait on a fresh process bounded by the plan's budget, not a retry of a failed check; fail early when `docker inspect -f {{.State.Running}}` is false.
- `Commit`: `git update-ref refs/heads/{branch} {sha}` in the repository.
- `Remove`: `docker rm -f candidate-{sha} candidate-{sha}-azurite`, `docker network rm candidate-{sha}`; ignore "No such container".
- `Orphans(known)`: `docker ps -a --filter name=candidate- --format {{.Names}}`, remove those whose sha is not in `known`.

- [x] **Step 1: Failing facts** with a recording fake `IProcessRunner`:
  - `TheCandidateContainerGetsNoIntegrationButTheModel` — `Run` then assert `LastRunEnvironment.Keys.Where(k => k.StartsWith("DigitalBrain__Integrations__"))` are all LLM keys.
  - `RemoveDeletesTheContainerItsAzuriteAndItsNetwork` — command list.
  - `OrphansRemovesOnlyUnknownCandidates`.
  - `AFailingBuildRaisesAGateErrorWithTheOutputTail`.
- [x] Steps 2–4: fail, implement, pass.
- [x] **Step 5:** Register `DockerCandidateHost` in `AspireModule.Configure`.
- [x] **Step 6:** Commit `"Aspire: Docker candidate host"`.

---

### Task 9: Live silos run a build; AspireCliClusterHost

**Files:**
- Create: `Cluster/AspireCliClusterHost.cs`, `Cluster/LiveBuild.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs` (or wherever the OS silo resource is added — find via LSP on the AppHost's `AddDigitalBrain`/`WithHosting` chain), `AspireModuleHosting.cs`.
- Test: hosting fact in `tests/.../InfrastructureFacts.cs` (or the Aspire.Testing project used by hosting facts).

`LiveBuild` (shared by AppHost and module — put it in `DigitalBrain.Modules.Microsoft.Aspire.Contracts` only if both can reference it; otherwise duplicate the 15 lines in the hosting project): reads/writes `{Workdir}/live.json` `{ "sha": "...", "path": "{Workdir}/builds/{sha}" }` atomically (write tmp + `File.Move` overwrite, as `RevisionsFile` did).

AppHost: when `{Workdir}/live.json` exists, the OS silo resource is `AddExecutable("os", "dotnet", workdir, args => [LiveBuild.Read(workdir).Path + "/DigitalBrain.OS.dll"])` with the same environment, endpoints (5080/5081 fixed) and references as the project resource; when it does not exist, the project resource as today (first boot from source). Verify against Aspire docs (context7: "Aspire AddExecutable WithArgs callback evaluated on restart") that the args callback is re-evaluated on resource restart; if it is not, use `WithCommand`-free alternative: restart the executable via `ResourceCommandService` after rewriting a `run.cmd`/shell shim the executable points at. Write the chosen mechanism into the task notes.

`AspireCliClusterHost` implements `IClusterHost` with one stdio `McpClient` (`StdioClientTransport` running `aspire mcp start`), call `select_apphost` with the AppHost project path, then:
- `Silos`: `list_resources` → resources whose name starts with `os` → `SiloView(name, LiveBuild sha, state, health)`.
- `RestartSilos`: `execute_resource_command` `{ resourceName: "os", commandName: "resource-restart" }` (check exact tool argument names by listing tools first, `ListToolsAsync`).
- `Spans(service, span)`: `list_traces` filtered by resource/service name, count the span name (port of `AspireCliTelemetry`).
- `CurrentSha` / `SetLive`: `LiveBuild`.

- [x] **Step 1:** Hosting fact: `TheSiloRunsTheLiveBuildWhenOneIsSet` — write a temp `live.json`, build the AppHost model via `DigitalBrain.Aspire.Testing`, assert the `os` resource is an `ExecutableResource` whose args contain the build path.
- [x] Steps 2–4: fail, implement, pass. Register `AspireCliClusterHost`.
- [x] **Step 5:** Commit `"Aspire: live silos run a published build; cluster host over aspire mcp"`.

---

### Task 10: SelfImprove app on candidates

**Files (modify):** `features/os/SelfImprove/SelfImprove.cs`, `request.cs`, `healthy.cs`, `verified.cs`, `failed.cs`, `open.cs`, `app.cs` (spec comment + bump `Version` to `2.0.0`).

Mechanical rename: `DigitalBrain.Revisions` → `DigitalBrain.Microsoft.Aspire`; `IRevisions` → `ICandidates.Key(scope)`; `IRevision.Key` → `ICandidate.Key`; `RevisionProposal` → `CandidateProposal`; `RevisionChanged/Healthy/Verified/Failed` → `Candidate*`; `RevisionStage` → `CandidateStage`; `revision.Verify(snapshot.Plan)` → `candidate.Verify()`. `PlanJson` drops `HealthyResources` and `AspireKey`. `RenderListAsync` appends the cluster line: `` $"Live: `{cluster.CurrentSha}` — {cluster.Stage}" `` from `ICluster.Read()`.

- [x] **Step 1:** Edit. **Step 2:** Compile-check via the features catalog test: find the test that compile-checks `./features` at boot (LSP on `FeatureCatalog`) and run it. **Step 3:** Commit `"SelfImprove: candidates and the live cluster"`.

---

### Task 11: Verification loop (done means seen running)

- [x] **Step 1:** `docker info` works; `dotnet run digitalbrain.cs` from repo root. `mcp__aspire__list_resources`: all Running/Healthy.
- [x] **Step 2:** First boot from source; publish the current HEAD once so the live cluster runs a build: through `digitalbrain-mcp` `neurons_call` `ICluster.Restart` with the current sha after `DockerCandidateHost.Publish` (or propose a no-op candidate). Confirm `live.json` and the `os` resource is the executable.
- [x] **Step 3:** Through `digitalbrain-mcp`, `neurons_call` the SelfImprove app `request` with a change set adding a Calculator operation (`features/os/Calculator`) and a plan calling it. Watch: `docker ps` shows `candidate-{sha}`; `CandidateVerified` then `CandidatePromoted`; `ICluster.Read()` → `Steady` on the new sha; the shell reconnects; the new operation answers on 5081.
- [x] **Step 4:** `list_traces` shows `candidate-{sha}` spans and the cluster restart; `list_structured_logs` has no errors from `aspire.candidate`/`aspire.cluster`.
- [x] **Step 5:** Failure path: a change set that does not compile → `Failed(Building)`, no container left (`docker ps -a`).
- [x] **Step 6:** Regression: module tests, OS unit + E2E, Architecture tests.
- [x] **Step 7:** Commit any fixes; note results in the plan's checkboxes.

Task 11 notes (2026-10-10, report `.superpowers/sdd/2026-10-10-aspire-1-candidate-container/task-11-report.md`):
- **Bootstrap (first promote from a source-booted AppHost):** the AppHost picks executable-vs-project at model build, so before the first `dotnet run digitalbrain.cs`: `git worktree add --detach .digitalbrain/worktrees/{sha} HEAD`; `dotnet publish src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -c Release -o .digitalbrain/builds/{sha}/os` and the same for `src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj` into `.../mcp`; remove the worktree; write `.digitalbrain/live.json` = `{"sha":"{sha}","path":"<abs>/.digitalbrain/builds/{sha}"}`; start the AppHost. OperatingSystem and digitalbrain-mcp then run as executables on that build; later rolls go through `ICluster.Restart` with no AppHost restart. Remove live.json to return to source mode.
- Step 1-2: all resources Running/Healthy; OS + MCP ran `builds/ac8ec6f/{os,mcp}`; ICluster.Restart rolled live through b5741a9 … 545d595 (Steady each time).
- Step 3: candidate ddf9423 (Calculator `add`) Building→Starting→Healthy→Verifying→Verified→Promoting→Promoted; report: context, activation, two calls and `span features.load` (1 span) passed in 2.45s; ICluster Steady on ddf9423; `add 2+3` on 5081 set `owner/apps/calculator/sum` = 5. Shell reconnect not checked.
- Step 4: 134 spans from `candidate-ddf9423` (features.load trace 8ec43de9772ecaec8848626dd3062aba); ICluster/Restart trace e7f4ec90e2320d292738afce19c69144; no aspire.candidate/aspire.cluster errors after the fixes.
- Step 5: f254c14 (non-compiling Broken.cs) Failed at Building (CS1525) in ~6s, no candidate container or network, worktree kept, report names the stage.
- Step 6: Aspire module 41/41, Aspire.Hosting unit 37/37, OS unit 30/30, MCP unit 26/26, CSharp 141/142 (CpuMetering fact fails without our change too). OS E2E: 5 synapse/shell facts fail the same way at ac8ec6f; SelfImprove E2E not run (it would promote into the shared branch). Architecture: 7 failures, 5 fail at 80dbe6e as well; DockerCandidateHost/LiveBuildHostingFacts entries are ours and need a ruling (see report).
- Fixes found live: 14 commits b5741a9..1a0d0b6 (MCP carries Aspire contracts; runtime watch isolation; detached silo restart; restart that never took settles; candidate postgres admin + supabase + no Foundry transcription; verifier call arguments; activation reconciles features; SelfImprove follows each candidate to its end; ServiceDefaults honours OTEL_SERVICE_NAME; candidate export cadence; promotion fast-forwards the checked-out tree; Promote finishes on the new build).
