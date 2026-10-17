# Aspire candidate container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A change to the brain's own source is proven in a disposable Docker container verified over MCP by the live cluster, then promoted by restarting the live cluster on the new sha; the Launcher, Revisions module and Aspire bridge are deleted.

**Architecture:** Build-order step 1 of the spec. `ICandidates` (per brain, queue) and `ICandidate` (one per sha, stage machine ported from `RevisionNeuron`) live in the Aspire module, alongside `ICluster` (deployment-global, `Restart` only in this step). Two internal connector seams do all host work: `ICandidateHost` (git worktree, build gate, `aspire publish` → `docker compose` project, storage seed, health, removal) and `IClusterHost` (fast-forward the live checkout, build, restart the silo resource through the AppHost's Aspire MCP). Verification drives the candidate through `IMcpServer` neurons, one per candidate endpoint.

**Tech Stack:** .NET 11 RC, Orleans, Aspire (`aspire publish` Docker Compose environment, `aspire mcp`), Docker Compose, Azure.Storage.Blobs (Azurite), ModelContextProtocol client via `IMcpServer`, xUnit v3 + `DigitalBrain.Testing.Module`.

**Spec:** `docs/superpowers/specs/2026-10-10-aspire-instance-neuron-design.md`

## Global Constraints

- LSP for every code change (C# `csharp-ls`): findReferences/goToImplementation before editing, diagnostics clean after. Never grep for code.
- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project <test project>`.
- Kill any test run over 5 minutes and debug the hang; never raise a timeout or add polling to make a check pass.
- Warnings are errors, nullable on, central package versions in `Directory.Packages.props`.
- Concrete arrays in grain state, never `IReadOnlyList`.
- No self-calls on non-reentrant grains; signal-triggered work uses a one-way `this.AsReference<T>()`.
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains via `ModuleTest.Create().WithModule<AspireModule>()`, fakes injected with `.ConfigureSilo(silo => silo.Services.AddSingleton<…>(fake))` (modules register with `TryAddSingleton`).
- Every brain-owned key starts with its brain: `ICandidate.Key(brain, sha) = "{brain}/aspire/candidate/{sha}"`, `ICandidates` keyed `{brain}`. `ICluster` is deployment-global, keyed `"cluster"`.
- No retries; every failure is a terminal stage with a reason. Budgets come from the `VerificationPlan`.
- Commit explicit files only (parallel sessions share the tree); never `git add` a directory.
- The connectors are the only code touching git, Docker, processes, ports and storage endpoints. They require the Integration `DigitalBrain:Integrations:aspire:Workdir`.

## Review Focus

1. **Live checkout is dirty when promoting** (parallel sessions edit the repo root) → `Restart` must refuse with `Failed(Promote, "live tree dirty: …")` and never stash, reset or merge over it. Pinned in Task 6.
2. **The silo restarting itself mid-call** → `Promote` saves `Promoted` and publishes `CandidatePromoted` *before* the cluster restart is issued, and the restart is issued one-way so the dying grain call never reports a failure for a restart that succeeded. Pinned in Task 4.
3. **Orphan compose projects after a crash or a lost `Discard`** → on `ICandidates` activation every `candidate-*` compose project without a live `ICandidate` in `Starting..Verified` is removed. Pinned in Task 7.
4. **Two proposals at once** → the second queues and starts only when the first ends (Verified→Promoted, Failed, Discarded). Pinned in Task 3.
5. **Candidate reachable from or reaching live** → the compose project has no deployment Integrations except the LLM and its storage is its own Azurite seeded by copy; the copy must download/upload (two Azurite instances cannot `StartCopyFromUri` each other). Pinned in Task 5.

---

## File map

Contracts — `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/`
- Create `Candidates/ICandidate.cs`, `Candidates/ICandidates.cs`, `Candidates/CandidateSnapshot.cs`, `Candidates/VerificationPlan.cs`, `Candidates/CandidateSignals.cs`
- Create `Cluster/ICluster.cs`, `Cluster/ClusterSignals.cs`
- Delete `IAspire.cs`, `AspireResource.cs`, `Signals/ResourceStateChanged.cs`, `Bridge/*`

Module — `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/`
- Create `Candidates/CandidateNeuron.cs`, `Candidates/CandidateState.cs`, `Candidates/CandidateIndexNeuron.cs`, `Candidates/ICandidateHost.cs`
- Create `Verification/ICandidateVerifier.cs`, `Verification/CandidateVerifier.cs`
- Create `Cluster/ClusterNeuron.cs`, `Cluster/IClusterHost.cs`
- Create `Host/DockerCandidateHost.cs`, `Host/Git.cs` (moved from Launcher), `Host/ProcessRunner.cs` (moved), `Host/StorageSeeder.cs`, `Host/AspireClusterHost.cs`, `Host/AspireCli.cs`
- Modify `AspireModule.cs`, `Configuration/AspireOptions.cs`
- Delete `Bridge/*`, `Resources/*` (InfrastructureEndpoints moves to read `ICluster`)

Hosting — `.../DigitalBrain.Modules.Microsoft.Aspire.Aspire.Hosting/AspireModuleHosting.cs`: remove bridge key + `AspireBridgeClient`; add the compose environment publisher.

Tests — `.../tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/`
- Create `FakeCandidateHost.cs`, `FakeClusterHost.cs`, `FakeVerifier.cs`, `CandidateFacts.cs`, `CandidateIndexFacts.cs`, `CandidateVerifierFacts.cs`, `ClusterFacts.cs`, `StorageSeederFacts.cs`, `DockerCandidateHostFacts.cs`
- Move `ScriptedMcpServer.cs` from Revisions tests
- Delete `AspireNeuronFacts.cs`

Deleted wholesale (Task 8): `src/DigitalBrain.Launcher/**`, `src/DigitalBrain.Modules/DigitalBrain/Revisions/**`, OS E2E `FakeLauncherHost.cs`.

---

### Task 0: Spike — candidate as a compose project, restart picks up new code

Throwaway; the output is two recorded answers in this plan, not code.

**Files:** none kept. Notes appended to this plan under "Spike results".

- [ ] **Step 1: Publish the AppHost as Docker Compose.** Verify against current docs first (`mcp__aspire__search_docs` "docker compose publish"). In a scratch worktree:

```bash
git worktree add --detach ../db-spike HEAD
cd ../db-spike
aspire publish --project src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj --publisher docker-compose --output-path ./.candidate
docker compose -p candidate-spike -f ./.candidate/docker-compose.yaml up -d --build
```

Expected: it publishes, or fails asking for `builder.AddDockerComposeEnvironment(...)`. If it asks, add `builder.AddDockerComposeEnvironment("candidate")` in the spike AppHost only and retry. Record: the env name, which resources come up, the host ports for the silo's MCP (container 5081) and the dashboard, and whether the dashboard exposes an MCP endpoint with a `list_traces` tool.

- [ ] **Step 2: Restart semantics.** With `dotnet run digitalbrain.cs` running, edit a log line in `DigitalBrain.OS`, run `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`, then `mcp__aspire__execute_resource_command` `restart` on the silo resource. Record whether the restarted silo runs the rebuilt binary (look for the edited log line via `list_structured_logs`).

- [ ] **Step 3: Record results** under "Spike results" at the end of this plan: compose env name; MCP/dashboard host port mapping; dashboard MCP yes/no and tool name; restart picks up rebuild yes/no. If restart does *not* pick up the rebuild, `AspireClusterHost.Restart` (Task 6) uses `stop` → build → `start` instead of `restart`; if the dashboard has no MCP, span checks (Task 4) read `aspire mcp start` over stdio against the candidate's dashboard (the existing `AspireCliTelemetry` approach, moved into `Host/AspireCli.cs`). Remove the spike worktree: `git worktree remove ../db-spike --force`.

---

### Task 1: Contracts

**Files:**
- Create: `.../Aspire.Contracts/Candidates/VerificationPlan.cs`, `CandidateSnapshot.cs`, `CandidateSignals.cs`, `ICandidate.cs`, `ICandidates.cs`
- Create: `.../Aspire.Contracts/Cluster/ICluster.cs`, `ClusterSignals.cs`

**Interfaces:**
- Produces: every type below, namespace `DigitalBrain.Microsoft.Aspire`.

- [ ] **Step 1: Write the contracts.**

`Candidates/VerificationPlan.cs` (moved verbatim from Revisions, aliases renamed, `AspireKey` dropped — resources are read from the candidate's dashboard):

```csharp
namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("aspire.expectation")]
public sealed record NeuronExpectation(
    [property: Id(0)] string Contract,
    [property: Id(1)] string Key,
    [property: Id(2)] string Method,
    [property: Id(3)] string Arguments,
    [property: Id(4)] string Expected);

// Written by the change's author: what to ask the candidate and what it must answer. The budget is
// the plan's, never a global timeout.
[GenerateSerializer, Alias("aspire.plan")]
public sealed record VerificationPlan(
    [property: Id(0)] NeuronExpectation[] Calls,
    [property: Id(1)] string[] HealthyResources,
    [property: Id(2)] string[] Spans,
    [property: Id(3)] TimeSpan Budget);

[GenerateSerializer, Alias("aspire.check")]
public sealed record VerificationCheck([property: Id(0)] string Name, [property: Id(1)] bool Passed, [property: Id(2)] string Detail);

[GenerateSerializer, Alias("aspire.report")]
public sealed record VerificationReport([property: Id(0)] VerificationCheck[] Checks, [property: Id(1)] TimeSpan Elapsed)
{
    public bool Passed => Checks.All(check => check.Passed);
}
```

`Candidates/CandidateSnapshot.cs`:

```csharp
namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("aspire.candidate.stage")]
public enum CandidateStage { Proposed, Queued, Building, Starting, Healthy, Verifying, Verified, Promoted, Failed, Discarded }

[GenerateSerializer, Alias("aspire.candidate.proposal")]
public sealed record CandidateProposal(
    [property: Id(0)] string Branch,
    [property: Id(1)] string Summary,
    [property: Id(2)] Dictionary<string, string> Files,
    [property: Id(3)] VerificationPlan Plan);

[GenerateSerializer, Alias("aspire.candidate.snapshot")]
public sealed record CandidateSnapshot(
    [property: Id(0)] string Sha,
    [property: Id(1)] string Branch,
    [property: Id(2)] string Summary,
    [property: Id(3)] CandidateStage Stage,
    [property: Id(4)] string? McpEndpoint,
    [property: Id(5)] VerificationPlan? Plan,
    [property: Id(6)] VerificationReport? Report,
    [property: Id(7)] string? Failure,
    [property: Id(8)] CandidateStage[] History);
```

`Candidates/CandidateSignals.cs`:

```csharp
namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("aspire.candidate.changed")]
public sealed record CandidateChanged([property: Id(0)] string Sha, [property: Id(1)] CandidateStage Stage) : Signal;
[GenerateSerializer, Alias("aspire.candidate.started")]
public sealed record CandidateStarted([property: Id(0)] string Sha, [property: Id(1)] string McpEndpoint) : Signal;
[GenerateSerializer, Alias("aspire.candidate.healthy")]
public sealed record CandidateHealthy([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("aspire.candidate.verified")]
public sealed record CandidateVerified([property: Id(0)] string Sha, [property: Id(1)] VerificationReport Report) : Signal;
[GenerateSerializer, Alias("aspire.candidate.promoted")]
public sealed record CandidatePromoted([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("aspire.candidate.failed")]
public sealed record CandidateFailed([property: Id(0)] string Sha, [property: Id(1)] CandidateStage Stage, [property: Id(2)] string Reason) : Signal;
```

`Candidates/ICandidate.cs`:

```csharp
using Orleans.Concurrency;

namespace DigitalBrain.Microsoft.Aspire;

// One disposable container built from a worktree; keyed {brain}/aspire/candidate/{sha}.
[Alias("aspire.candidate"), DefaultGrainType("aspire.candidate")]
public interface ICandidate : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<CandidateSnapshot> Read();
    Task<CandidateSnapshot> Propose(string branch, string summary, VerificationPlan plan);
    Task<CandidateSnapshot> Queue();
    [AlwaysInterleave, ResponseTimeout("00:30:00")] Task<CandidateSnapshot> Start();
    [AlwaysInterleave, ResponseTimeout("00:30:00")] Task<CandidateSnapshot> Verify();
    [ResponseTimeout("00:05:00")] Task<CandidateSnapshot> Promote();
    Task<CandidateSnapshot> Discard();

    static string Key(string brainId, string sha) => $"{brainId}/aspire/candidate/{sha}";
}
```

`Candidates/ICandidates.cs`:

```csharp
using Orleans.Concurrency;

namespace DigitalBrain.Microsoft.Aspire;

// The brain's candidates: at most one live, the rest queued. Keyed by brain id.
[Alias("aspire.candidates"), DefaultGrainType("aspire.candidates")]
public interface ICandidates : INeuron
{
    [ResponseTimeout("00:05:00")] Task<string> Propose(CandidateProposal proposal);
    [ReadOnly, AlwaysInterleave] Task<string?> Live();
    Task Ended(string sha);
}
```

`Cluster/ICluster.cs` and `Cluster/ClusterSignals.cs`:

```csharp
using Orleans.Concurrency;

namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("aspire.cluster.stage")]
public enum ClusterStage { Steady, Restarting }

[GenerateSerializer, Alias("aspire.cluster.snapshot")]
public sealed record ClusterSnapshot([property: Id(0)] string? Sha, [property: Id(1)] ClusterStage Stage, [property: Id(2)] string? Failure);

// The live cluster on the fixed ports; deployment-global, keyed "cluster". Step 1 promotes by restart only.
[Alias("aspire.cluster"), DefaultGrainType("aspire.cluster")]
public interface ICluster : INeuron
{
    const string Key = "cluster";
    [Public, ReadOnly, AlwaysInterleave] Task<ClusterSnapshot> Read();
    [ResponseTimeout("00:15:00")] Task Restart(string sha);
}

[GenerateSerializer, Alias("aspire.cluster.restarting")]
public sealed record ClusterRestarting([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("aspire.cluster.restart-failed")]
public sealed record ClusterRestartFailed([property: Id(0)] string Sha, [property: Id(1)] string Reason) : Signal;
```

- [ ] **Step 2: Delete the old contract files** `IAspire.cs`, `AspireResource.cs`, `Signals/ResourceStateChanged.cs`, `Bridge/AspireBridgeCommand.cs`, `Bridge/AspireBridgeCommandResult.cs`, `Bridge/AspireBridgeRoutes.cs`. Before deleting each, run LSP `findReferences` on its type; every reference is in a file this plan deletes or rewrites (Tasks 2–8). Remove `"DigitalBrain.Microsoft.Aspire.AspireResource"` entries from `src/Testing/DigitalBrain.Architecture.Tests/CollectionCompatibilitySamples.json` (lines ~269, ~276).

- [ ] **Step 3: Build the contracts.**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/DigitalBrain.Modules.Microsoft.Aspire.Contracts.csproj`
Expected: success (the module project will not build until Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Candidates/VerificationPlan.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Candidates/CandidateSnapshot.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Candidates/CandidateSignals.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Candidates/ICandidate.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Candidates/ICandidates.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Cluster/ICluster.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Cluster/ClusterSignals.cs src/Testing/DigitalBrain.Architecture.Tests/CollectionCompatibilitySamples.json
git rm src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/IAspire.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/AspireResource.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Signals/ResourceStateChanged.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Bridge/AspireBridgeCommand.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Bridge/AspireBridgeCommandResult.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/Bridge/AspireBridgeRoutes.cs
git commit -m "Aspire contracts: candidates and cluster replace the resource bridge"
```

---

### Task 2: Connector seams, module wiring, fakes

**Files:**
- Create: `.../Aspire/Candidates/ICandidateHost.cs`, `.../Aspire/Cluster/IClusterHost.cs`, `.../Aspire/Verification/ICandidateVerifier.cs`
- Modify: `.../Aspire/AspireModule.cs`, `.../Aspire/Configuration/AspireOptions.cs`
- Delete: `.../Aspire/Bridge/*`, `.../Aspire/Resources/AspireNeuron.cs`, `AspireState.cs`, `IAspireResourceReporter.cs`
- Modify: `.../Aspire/Resources/InfrastructureEndpoints.cs`, `InfrastructureView.cs` (read `ICluster`)
- Create tests: `FakeCandidateHost.cs`, `FakeClusterHost.cs`, `FakeVerifier.cs`
- Delete tests: `AspireNeuronFacts.cs`

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces:

```csharp
namespace DigitalBrain.Microsoft.Aspire.Candidates;

public sealed record CandidateWorktree(string Sha, string Path);
public sealed record CandidateEndpoints(string McpEndpoint, string DashboardEndpoint, string UiEndpoint);

// The only seam touching git, docker and storage for candidates.
public interface ICandidateHost
{
    Task<CandidateWorktree> Prepare(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct);
    Task Build(string sha, CancellationToken ct);                 // throws CandidateHostException with the failing output
    Task<CandidateEndpoints> Start(string sha, CancellationToken ct);
    Task WaitHealthy(string sha, TimeSpan budget, CancellationToken ct); // TimeoutException past budget
    Task Remove(string sha, CancellationToken ct);
    Task<string[]> Running(CancellationToken ct);                  // shas with a candidate-{sha} compose project
}

public sealed class CandidateHostException(string message) : Exception(message);
```

```csharp
namespace DigitalBrain.Microsoft.Aspire.Cluster;

public interface IClusterHost
{
    Task<string> CurrentSha(CancellationToken ct);
    Task Restart(string sha, CancellationToken ct); // throws ClusterHostException; the caller's silo may die during it
}

public sealed class ClusterHostException(string message) : Exception(message);
```

```csharp
namespace DigitalBrain.Microsoft.Aspire.Verification;

public interface ICandidateVerifier
{
    Task<VerificationReport> Verify(string brainId, string sha, CandidateEndpoints endpoints, VerificationPlan plan, CancellationToken ct);
}
```

- [ ] **Step 1: Write the seams above** in the three files.

- [ ] **Step 2: Rewrite `AspireModule.cs`:**

```csharp
public sealed class AspireModule() : Module<AspireOptions>(new ModuleId("aspire")), IHttpModule
{
    public override System.Reflection.Assembly? Contracts => typeof(ICandidate).Assembly;

    public static IntegrationSchema Integration { get; } = IntegrationSchema.For("aspire", "Aspire host")
        .RequiresSetting("Workdir");

    public override void Configure(ISiloBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        builder.Services.AddHttpClient();
        builder.Services.TryAddSingleton<IProcessRunner, ProcessRunner>();
        builder.Services.TryAddSingleton<ICandidateHost, DockerCandidateHost>();
        builder.Services.TryAddSingleton<IClusterHost, AspireClusterHost>();
        builder.Services.TryAddSingleton<ICandidateVerifier, CandidateVerifier>();
    }

    public void Configure(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        InfrastructureEndpoints.Map(endpoints);
    }
}
```

Check with LSP how `IntegrationSchema` is declared on `GitHubModule` (`GitHubModule.cs:16`) and match it. `DockerCandidateHost`, `AspireClusterHost`, `CandidateVerifier`, `ProcessRunner` are created in Tasks 4–6; until then stub each as `internal sealed class X : I… { … => throw new NotSupportedException(); }` in its final file so the module builds, and replace the stubs in their tasks.

- [ ] **Step 3: `AspireOptions`** — replace `ApplicationName` with what the hosts need:

```csharp
public sealed class AspireOptions : IModuleOptions
{
    public static readonly string ConfigurationRoot = DigitalBrainConfiguration.ModuleSection(new ModuleId("aspire"));

    public string AppHostProject { get; set; } = "src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj";
    public string SiloResource { get; set; } = "os";
    public string GrainStateContainer { get; set; } = DigitalBrainNames.GrainStateContainer;
    public string LiveBlobEndpoint { get; set; } = "http://127.0.0.1:10000/devstoreaccount1";
    public TimeSpan StartBudget { get; set; } = TimeSpan.FromMinutes(10);

    public void Validate()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(AppHostProject);
        ArgumentException.ThrowIfNullOrWhiteSpace(SiloResource);
    }
}
```

Confirm the silo resource's real name with `mcp__aspire__list_resources` and set the default to it.

- [ ] **Step 4: `InfrastructureEndpoints`** — replace the `IAspire.ListResources` call with `grains.GetGrain<ICluster>(ICluster.Key).Read(ct)`; `InfrastructureView.Join` takes the `ClusterSnapshot` and marks the `aspire` module row `Running/Healthy` when `Stage == Steady && Sha is not null`, else `Unknown`. Use LSP `findReferences` on `InfrastructureView.Join` and update every caller and its facts.

- [ ] **Step 5: Delete** `Bridge/AspireBridge.cs`, `Bridge/AspireBridgeEndpoints.cs`, `Resources/AspireNeuron.cs`, `Resources/AspireState.cs`, `Resources/IAspireResourceReporter.cs`, tests `AspireNeuronFacts.cs`.

- [ ] **Step 6: Fakes** in the test project:

```csharp
internal sealed class FakeCandidateHost : ICandidateHost
{
    private int _next;
    public List<string> Calls { get; } = [];
    public HashSet<string> Live { get; } = new(StringComparer.Ordinal);
    public string? FailBuild { get; set; }
    public bool Healthy { get; set; } = true;

    public Task<CandidateWorktree> Prepare(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct)
    {
        var sha = $"sha{++_next:0000}";
        Calls.Add($"prepare {sha}");
        return Task.FromResult(new CandidateWorktree(sha, $"/work/{sha}"));
    }

    public Task Build(string sha, CancellationToken ct)
    {
        Calls.Add($"build {sha}");
        return FailBuild is null ? Task.CompletedTask : throw new CandidateHostException(FailBuild);
    }

    public Task<CandidateEndpoints> Start(string sha, CancellationToken ct)
    {
        Calls.Add($"start {sha}");
        Live.Add(sha);
        return Task.FromResult(new CandidateEndpoints("http://localhost:5191", "http://localhost:5198", "http://localhost:5190"));
    }

    public Task WaitHealthy(string sha, TimeSpan budget, CancellationToken ct)
    {
        Calls.Add($"healthy {sha}");
        return Healthy ? Task.CompletedTask : throw new TimeoutException($"{sha} not healthy within {budget}");
    }

    public Task Remove(string sha, CancellationToken ct)
    {
        Calls.Add($"remove {sha}");
        Live.Remove(sha);
        return Task.CompletedTask;
    }

    public Task<string[]> Running(CancellationToken ct) => Task.FromResult(Live.ToArray());
}

internal sealed class FakeClusterHost : IClusterHost
{
    public List<string> Calls { get; } = [];
    public string Current { get; set; } = "live000";
    public string? Refuse { get; set; }

    public Task<string> CurrentSha(CancellationToken ct) => Task.FromResult(Current);

    public Task Restart(string sha, CancellationToken ct)
    {
        Calls.Add($"restart {sha}");
        if (Refuse is not null) { throw new ClusterHostException(Refuse); }
        Current = sha;
        return Task.CompletedTask;
    }
}

internal sealed class FakeVerifier : ICandidateVerifier
{
    public VerificationReport Report { get; set; } = new([new("context", true, "ok")], TimeSpan.FromSeconds(1));
    public Task<VerificationReport> Verify(string brainId, string sha, CandidateEndpoints endpoints, VerificationPlan plan, CancellationToken ct)
        => Task.FromResult(Report);
}
```

- [ ] **Step 7: Build module + tests.**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/DigitalBrain.Modules.Microsoft.Aspire.Tests.csproj`
Expected: success (LSP diagnostics clean first). `InfrastructureFacts` adjusted in Step 4 pass:
`dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests`

- [ ] **Step 8: Commit** every created/modified/deleted file by explicit path (`git add <files>`, `git rm <files>`), message `Aspire module: connector seams replace the bridge`.

---

### Task 3: `ICandidate` stage machine and `ICandidates` queue

**Files:**
- Create: `.../Aspire/Candidates/CandidateState.cs`, `CandidateNeuron.cs`, `CandidateIndexNeuron.cs`
- Test: `CandidateFacts.cs`, `CandidateIndexFacts.cs`

**Interfaces:**
- Consumes: Task 1 contracts; `ICandidateHost`, `ICandidateVerifier` (Task 2). Promote is Task 4; this task stops at Verified/Failed/Discarded.
- Produces: grain types `aspire.candidate`, `aspire.candidates`; `CandidateState` with `Endpoints` persisted.

- [ ] **Step 1: Write the failing facts** (`CandidateFacts.cs`):

```csharp
public sealed class CandidateFacts
{
    internal static readonly VerificationPlan Plan = new([new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "*")], ["os"], [], TimeSpan.FromMinutes(5));

    internal static Task<ModuleBrain> StartAsync(FakeCandidateHost host, ICandidateVerifier verifier, CancellationToken ct, FakeClusterHost? cluster = null)
        => ModuleTest.Create().WithModule<AspireModule>()
            .ConfigureSilo(silo =>
            {
                silo.Services.AddSingleton<ICandidateHost>(host);
                silo.Services.AddSingleton(verifier);
                silo.Services.AddSingleton<IClusterHost>(cluster ?? new FakeClusterHost());
            })
            .StartAsync(ct);

    [Fact]
    public async Task ACandidateWalksProposedBuildingStartingHealthyVerifyingVerified()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost();
        await using var brain = await StartAsync(host, new FakeVerifier(), ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
        await using var started = await brain.Observe<CandidateStarted>(candidate, ct);
        await using var verified = await brain.Observe<CandidateVerified>(candidate, ct);

        await candidate.Propose("os-runtime", "change", Plan);
        Assert.Equal(CandidateStage.Healthy, (await candidate.Start()).Stage);
        Assert.Equal("http://localhost:5191", (await started.NextAsync(ct: ct)).McpEndpoint);
        var final = await candidate.Verify();

        Assert.Equal(CandidateStage.Verified, final.Stage);
        Assert.True((await verified.NextAsync(ct: ct)).Report.Passed);
        Assert.Equal([CandidateStage.Proposed, CandidateStage.Building, CandidateStage.Starting, CandidateStage.Healthy, CandidateStage.Verifying, CandidateStage.Verified], final.History);
        Assert.Equal(["build sha0001", "start sha0001", "healthy sha0001"], host.Calls);
    }

    [Fact]
    public async Task ABuildFailureFailsAtBuildingWithTheOutputAndNeverStarts()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost { FailBuild = "CS0103: The name 'x' does not exist" };
        await using var brain = await StartAsync(host, new FakeVerifier(), ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
        await using var failed = await brain.Observe<CandidateFailed>(candidate, ct);

        await candidate.Propose("os-runtime", "change", Plan);
        var final = await candidate.Start();

        Assert.Equal(CandidateStage.Failed, final.Stage);
        var signal = await failed.NextAsync(ct: ct);
        Assert.Equal(CandidateStage.Building, signal.Stage);
        Assert.Contains("CS0103", signal.Reason, StringComparison.Ordinal);
        Assert.DoesNotContain("start sha0001", host.Calls);
    }

    [Fact]
    public async Task AnUnhealthyCandidateFailsAtStartingAndIsRemoved()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost { Healthy = false };
        await using var brain = await StartAsync(host, new FakeVerifier(), ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));

        await candidate.Propose("os-runtime", "change", Plan);
        var final = await candidate.Start();

        Assert.Equal(CandidateStage.Failed, final.Stage);
        Assert.Contains("remove sha0001", host.Calls);
    }

    [Fact]
    public async Task AMissedExpectationFailsAtVerifyingNamingItAndRemovesTheContainer()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost();
        var verifier = new FakeVerifier { Report = new([new("context", true, "ok"), new("call IApp owner/apps/calculator Read", false, "expected 4; answered 5")], TimeSpan.FromSeconds(2)) };
        await using var brain = await StartAsync(host, verifier, ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));

        await candidate.Propose("os-runtime", "change", Plan);
        await candidate.Start();
        var final = await candidate.Verify();

        Assert.Equal(CandidateStage.Failed, final.Stage);
        Assert.StartsWith("call IApp owner/apps/calculator Read", final.Failure, StringComparison.Ordinal);
        Assert.Contains("remove sha0001", host.Calls);
    }

    [Fact]
    public async Task DiscardRemovesTheContainerOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost();
        await using var brain = await StartAsync(host, new FakeVerifier(), ct);
        var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));

        await candidate.Propose("os-runtime", "change", Plan);
        await candidate.Start();
        await candidate.Discard();
        var final = await candidate.Discard();

        Assert.Equal(CandidateStage.Discarded, final.Stage);
        Assert.Single(host.Calls, call => call == "remove sha0001");
    }
}
```

`CandidateIndexFacts.cs`:

```csharp
public sealed class CandidateIndexFacts
{
    private static CandidateProposal Proposal(string summary) => new("os-runtime", summary, new() { ["README.md"] = summary }, CandidateFacts.Plan);

    [Fact]
    public async Task TheFirstProposalStartsAndTheSecondQueuesUntilTheFirstEnds()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeCandidateHost();
        await using var brain = await CandidateFacts.StartAsync(host, new FakeVerifier(), ct);
        var index = brain.Get<ICandidates>("owner");
        var first = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
        await using var firstHealthy = await brain.Observe<CandidateHealthy>(first, ct);

        Assert.Equal("sha0001", await index.Propose(Proposal("one")));
        await firstHealthy.NextAsync(ct: ct);
        Assert.Equal("sha0002", await index.Propose(Proposal("two")));

        var second = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0002"));
        Assert.Equal(CandidateStage.Queued, (await second.Read()).Stage);
        Assert.Equal("sha0001", await index.Live());

        await using var secondHealthy = await brain.Observe<CandidateHealthy>(second, ct);
        await first.Discard();
        await secondHealthy.NextAsync(ct: ct);
        Assert.Equal("sha0002", await index.Live());
    }
}
```

- [ ] **Step 2: Run to see them fail.**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests -- --filter-class "*Candidate*Facts"`
Expected: FAIL — no grain implements `aspire.candidate`.

- [ ] **Step 3: Implement.** `CandidateState.cs`:

```csharp
[GenerateSerializer, Alias("aspire.candidate.state")]
internal sealed record CandidateState
{
    [Id(0)] public string Branch { get; init; } = "";
    [Id(1)] public string Summary { get; init; } = "";
    [Id(2)] public CandidateStage Stage { get; init; }
    [Id(3)] public CandidateEndpoints? Endpoints { get; init; }
    [Id(4)] public VerificationPlan? Plan { get; init; }
    [Id(5)] public VerificationReport? Report { get; init; }
    [Id(6)] public string? Failure { get; init; }
    [Id(7)] public CandidateStage[] History { get; init; } = [];
}
```

`CandidateEndpoints` must be serializable: add `[GenerateSerializer, Alias("aspire.candidate.endpoints")]` and `[property: Id(n)]` to it in `ICandidateHost.cs`.

`CandidateNeuron.cs` — ported from `RevisionNeuron` (shown in the spec research; same `Move`/`Fail`/`Require` helpers), with these differences:

```csharp
[GrainType("aspire.candidate")]
internal sealed class CandidateNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CandidateState> store,
    ICandidateHost host,
    ICandidateVerifier verifier,
    IOptions<AspireOptions> options)
    : Neuron<CandidateState>(store), ICandidate
{
    private string Key => this.GetPrimaryKeyString();
    private string Sha => Key[(Key.LastIndexOf('/') + 1)..];
    private string BrainId => BrainKey.BrainOf(Key);
    private ICandidates Index => GrainFactory.GetGrain<ICandidates>(BrainId);

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
        await Move(CandidateStage.Building, Snapshot, null);
        try { await host.Build(Sha, CancellationToken.None); }
        catch (CandidateHostException error) { await Fail(error.Message); return Describe(); }

        await Move(CandidateStage.Starting, Snapshot, null);
        try
        {
            var endpoints = await host.Start(Sha, CancellationToken.None);
            await Save(Snapshot with { Endpoints = endpoints }, new CandidateStarted(Sha, endpoints.McpEndpoint));
            await host.WaitHealthy(Sha, options.Value.StartBudget, CancellationToken.None);
            await Move(CandidateStage.Healthy, Snapshot, new CandidateHealthy(Sha));
        }
        catch (Exception error) when (error is TimeoutException or CandidateHostException)
        {
            await Fail(error.Message);
            await host.Remove(Sha, CancellationToken.None);
        }
        return Describe();
    }

    public async Task<CandidateSnapshot> Verify()
    {
        Require(CandidateStage.Healthy);
        var plan = Snapshot.Plan ?? throw new InvalidOperationException($"Candidate {Sha} has no plan.");
        var endpoints = Snapshot.Endpoints ?? throw new InvalidOperationException($"Candidate {Sha} has no endpoints.");
        await Move(CandidateStage.Verifying, Snapshot, null);
        using var budget = new CancellationTokenSource(plan.Budget);
        VerificationReport report;
        try { report = await verifier.Verify(BrainId, Sha, endpoints, plan, budget.Token); }
        catch (OperationCanceledException) when (budget.IsCancellationRequested)
        {
            await Fail($"budget {plan.Budget} exceeded");
            await host.Remove(Sha, CancellationToken.None);
            return Describe();
        }
        if (report.Passed) { await Move(CandidateStage.Verified, Snapshot with { Report = report }, new CandidateVerified(Sha, report)); }
        else
        {
            var missed = report.Checks.First(check => !check.Passed);
            await Fail($"{missed.Name}: {missed.Detail}", Snapshot with { Report = report });
            await host.Remove(Sha, CancellationToken.None);
        }
        return Describe();
    }

    public Task<CandidateSnapshot> Promote() => throw new NotSupportedException("Task 4");

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

    // The failed signal names the stage the candidate was in, so a report reads "Building failed", not "Failed failed".
    private async Task Fail(string reason, CandidateState? from = null)
    {
        var failedAt = Snapshot.Stage;
        await Move(CandidateStage.Failed, (from ?? Snapshot) with { Failure = reason }, new CandidateFailed(Sha, failedAt, reason));
        await Index.Ended(Sha);
    }

    private Task Move(CandidateStage stage, CandidateState next, Signal? acted)
        => Save(next with { Stage = stage, History = [.. next.History, stage] }, new CandidateChanged(Sha, stage), acted);

    private CandidateSnapshot Describe()
        => new(Sha, Snapshot.Branch, Snapshot.Summary, Snapshot.Stage, Snapshot.Endpoints?.McpEndpoint, Snapshot.Plan, Snapshot.Report, Snapshot.Failure, Snapshot.History);
}
```

Check `Neuron<TState>.Save` overloads with LSP (`RevisionNeuron` uses `Save(state, signal, signal?)` and `Save(state, signal)`); match them.

`CandidateIndexNeuron.cs` — port `RevisionIndexNeuron` (53 lines) to the new types: `Propose(CandidateProposal p)` calls `host.Prepare(p.Branch, p.Summary, p.Files, ct)`, then `ICandidate.Propose(p.Branch, p.Summary, p.Plan)`; if `Live` is null, save `Live = sha` and call the one-way `this.AsReference<ICandidateIndexWork>().StartLive(sha)` (which calls `ICandidate.Start()`), else enqueue and call `candidate.Queue()`. `Ended(sha)` clears `Live` when it matches, pops the next queued sha into `Live` and starts it the same way. State: `Live` (string?), `Queue` (string[]). Copy `IRevisionIndexWork` as `ICandidateIndexWork` with `[OneWay] Task StartLive(string sha)`.

- [ ] **Step 4: Run the facts.**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests -- --filter-class "*Candidate*Facts"`
Expected: PASS (6 facts).

- [ ] **Step 5: Commit** the five files by explicit path, message `Aspire: candidate stage machine and per-brain queue`.

---

### Task 4: Promote by restart, `ICluster`

**Files:**
- Create: `.../Aspire/Cluster/ClusterNeuron.cs`, `ClusterState.cs`
- Modify: `.../Aspire/Candidates/CandidateNeuron.cs` (`Promote`)
- Test: `ClusterFacts.cs`, add facts to `CandidateFacts.cs`

**Interfaces:**
- Consumes: `IClusterHost` (Task 2), `ICandidate` (Task 3).
- Produces: grain type `aspire.cluster`; `ICandidate.Promote()` implemented.

- [ ] **Step 1: Failing facts.** Add to `CandidateFacts`:

```csharp
[Fact]
public async Task PromoteIsRefusedUntilTheCandidateIsVerified()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await StartAsync(new FakeCandidateHost(), new FakeVerifier(), ct);
    var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
    await candidate.Propose("os-runtime", "change", Plan);
    await candidate.Start();

    await Assert.ThrowsAsync<InvalidOperationException>(() => candidate.Promote());
}

[Fact]
public async Task AVerifiedCandidateIsPromotedBeforeTheClusterRestartsOnItsSha()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeCandidateHost();
    var cluster = new FakeClusterHost();
    await using var brain = await StartAsync(host, new FakeVerifier(), ct, cluster);
    var candidate = brain.Get<ICandidate>(ICandidate.Key("owner", "sha0001"));
    var live = brain.Get<ICluster>(ICluster.Key);
    await using var promoted = await brain.Observe<CandidatePromoted>(candidate, ct);
    await using var restarting = await brain.Observe<ClusterRestarting>(live, ct);

    await candidate.Propose("os-runtime", "change", Plan);
    await candidate.Start();
    await candidate.Verify();
    var final = await candidate.Promote();

    Assert.Equal(CandidateStage.Promoted, final.Stage);
    Assert.Equal("sha0001", (await promoted.NextAsync(ct: ct)).Sha);
    Assert.Equal("sha0001", (await restarting.NextAsync(ct: ct)).Sha);
    Assert.Contains("remove sha0001", host.Calls);
    Assert.Equal(["restart sha0001"], cluster.Calls);
}
```

`ClusterFacts.cs`:

```csharp
public sealed class ClusterFacts
{
    [Fact]
    public async Task ARefusedRestartLeavesTheClusterSteadyOnTheOldShaWithTheReason()
    {
        var ct = TestContext.Current.CancellationToken;
        var cluster = new FakeClusterHost { Refuse = "live tree dirty: src/A.cs" };
        await using var brain = await CandidateFacts.StartAsync(new FakeCandidateHost(), new FakeVerifier(), ct, cluster);
        var live = brain.Get<ICluster>(ICluster.Key);
        await using var failed = await brain.Observe<ClusterRestartFailed>(live, ct);

        await live.Restart("sha0001");

        Assert.Equal("live tree dirty: src/A.cs", (await failed.NextAsync(ct: ct)).Reason);
        var snapshot = await live.Read();
        Assert.Equal(ClusterStage.Steady, snapshot.Stage);
        Assert.Equal("live000", snapshot.Sha);
    }
}
```

- [ ] **Step 2: Run, expect FAIL** (`--filter-class "*ClusterFacts"` and `--filter-method "*Promote*"`).

- [ ] **Step 3: Implement.** `ClusterState`: `[Id(0)] string? Sha`, `[Id(1)] ClusterStage Stage`, `[Id(2)] string? Failure`.

```csharp
[GrainType("aspire.cluster")]
internal sealed class ClusterNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<ClusterState> store,
    IClusterHost host)
    : Neuron<ClusterState>(store), ICluster
{
    public async Task<ClusterSnapshot> Read()
    {
        var sha = Snapshot.Sha ?? await host.CurrentSha(CancellationToken.None);
        return new(sha, Snapshot.Stage, Snapshot.Failure);
    }

    // The silo running this call is one of the silos being restarted: the Restarting state is saved
    // first, so the cluster that comes back up reads it and completes to Steady on activation.
    public async Task Restart(string sha)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sha);
        var previous = Snapshot.Sha ?? await host.CurrentSha(CancellationToken.None);
        await Save(Snapshot with { Stage = ClusterStage.Restarting, Failure = null }, new ClusterRestarting(sha));
        try { await host.Restart(sha, CancellationToken.None); }
        catch (ClusterHostException error)
        {
            await Save(Snapshot with { Stage = ClusterStage.Steady, Sha = previous, Failure = error.Message }, new ClusterRestartFailed(sha, error.Message));
            return;
        }
        await Save(Snapshot with { Stage = ClusterStage.Steady, Sha = sha }, null);
    }

    public override async Task OnActivateAsync(CancellationToken ct)
    {
        await base.OnActivateAsync(ct);
        if (Snapshot.Stage == ClusterStage.Restarting)
        {
            var current = await host.CurrentSha(ct);
            await Save(Snapshot with { Stage = ClusterStage.Steady, Sha = current }, null);
        }
    }
}
```

Check with LSP whether `Save` accepts a null signal and how `Neuron<T>` exposes activation (override name/signature); match it.

`CandidateNeuron.Promote`:

```csharp
public async Task<CandidateSnapshot> Promote()
{
    if (Snapshot.Stage != CandidateStage.Verified || !Snapshot.History.Contains(CandidateStage.Verified))
    { throw new InvalidOperationException($"Candidate {Sha} is {Snapshot.Stage}; only a Verified candidate can be promoted."); }
    await host.Remove(Sha, CancellationToken.None);
    await Move(CandidateStage.Promoted, Snapshot, new CandidatePromoted(Sha));
    await Index.Ended(Sha);
    // Recorded before the restart: the silo answering this call is about to be replaced.
    await GrainFactory.GetGrain<ICluster>(ICluster.Key).AsReference<IClusterWork>().RestartOneWay(Sha);
    return Describe();
}
```

Add to `Cluster/`: `[Alias("aspire.cluster.work"), DefaultGrainType("aspire.cluster")] internal interface IClusterWork : IGrainWithStringKey { [OneWay] Task RestartOneWay(string sha); }`, implemented by `ClusterNeuron` as `=> Restart(sha)`. Confirm the `AsReference<T>` helper's exact name/namespace with LSP (CLAUDE.md: "one-way self-reference: `this.AsReference<T>()`"); if it only exists for `this`, use `GrainFactory.GetGrain<IClusterWork>(ICluster.Key)`.

The `AVerifiedCandidate…` fact observes `ClusterRestarting` asynchronously because the restart is one-way.

- [ ] **Step 4: Run all module facts, expect PASS.**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests`

- [ ] **Step 5: Commit** explicit files, message `Aspire: promote a verified candidate by restarting the cluster on its sha`.

---

### Task 4b: Verification through `IMcpServer`

**Files:**
- Create: `.../Aspire/Verification/CandidateVerifier.cs` (replaces stub)
- Move: `ScriptedMcpServer.cs` from `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/` to the Aspire tests
- Modify: Aspire module csproj — add ProjectReference to `DigitalBrain.Modules.Mcp.Contracts`; Aspire module's test csproj — add `DigitalBrain.Modules.Mcp` so `IMcpServer` is hosted (`.WithModule<McpModule>()`; confirm the module class name with LSP)
- Test: `CandidateVerifierFacts.cs` (port `RevisionVerifierFacts.cs`)

**Interfaces:**
- Consumes: `IMcpServer.Connect(McpServerSpec, ct)`, `IMcpServer.Run(string tool, string arguments, ct)` → `ToolResult` (inspect `ToolResult` with LSP goToDefinition for its text and error members; the code below calls them `Text` and `IsError` — rename to the real members).
- Produces: `CandidateVerifier : ICandidateVerifier`.

- [ ] **Step 1: Port the facts.** Read `RevisionVerifierFacts.cs` and `ScriptedMcpServer.cs`; rewrite each fact against `CandidateVerifier` with `ModuleTest.Create().WithModule<AspireModule>().WithModule<McpModule>()`, endpoints `new CandidateEndpoints(scripted.Url, scripted.Url, scripted.Url)`. Keep the existing fact names; add:

```csharp
[Fact]
public async Task TheCandidateIsReachedThroughOneMcpServerNeuronPerSha()
{
    var ct = TestContext.Current.CancellationToken;
    await using var scripted = ScriptedMcpServer.Answering(context: """{"brainId":"owner"}""");
    await using var brain = await ModuleTest.Create().WithModule<AspireModule>().WithModule<McpModule>().StartAsync(ct);
    var verifier = brain.Services.GetRequiredService<ICandidateVerifier>();

    await verifier.Verify("owner", "sha0001", new(scripted.Url, scripted.Url, scripted.Url), new([], [], [], TimeSpan.FromMinutes(1)), ct);

    var server = await brain.Get<IMcpServer>("owner/mcp/candidate-sha0001").Read();
    Assert.True(server.Connected);
}
```

Adjust `ScriptedMcpServer.Answering(...)`'s name to what the moved file actually exposes.

- [ ] **Step 2: Run, expect FAIL** (stub throws).

- [ ] **Step 3: Implement.**

```csharp
internal sealed class CandidateVerifier(IGrainFactory grains) : ICandidateVerifier
{
    public async Task<VerificationReport> Verify(string brainId, string sha, CandidateEndpoints endpoints, VerificationPlan plan, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentNullException.ThrowIfNull(plan);
        var clock = Stopwatch.StartNew();
        var brain = grains.GetGrain<IMcpServer>($"{brainId}/mcp/candidate-{sha}");
        await brain.Connect(new McpServerSpec($"candidate {sha}", $"{endpoints.McpEndpoint.TrimEnd('/')}/brains/{brainId}/mcp"), ct);
        var dashboard = grains.GetGrain<IMcpServer>($"{brainId}/mcp/candidate-{sha}-dashboard");
        if (plan.HealthyResources.Length > 0 || plan.Spans.Length > 0)
        {
            await dashboard.Connect(new McpServerSpec($"candidate {sha} dashboard", endpoints.DashboardEndpoint), ct);
        }

        List<VerificationCheck> checks = [];
        foreach (var check in Checks(brainId, plan, brain, dashboard))
        {
            VerificationCheck outcome;
            try { outcome = await check(ct); }
            catch (Exception error) when (error is InvalidOperationException or JsonException)
            { outcome = new(checks.Count.ToString(CultureInfo.InvariantCulture), false, error.Message); }
            checks.Add(outcome);
            if (!outcome.Passed) { break; }
        }
        await brain.Disconnect(ct);
        await dashboard.Disconnect(ct);
        return new([.. checks], clock.Elapsed);
    }

    private static IEnumerable<Func<CancellationToken, Task<VerificationCheck>>> Checks(string brainId, VerificationPlan plan, IMcpServer brain, IMcpServer dashboard)
    {
        yield return async ct =>
        {
            var answered = (await Call(brain, "neurons_context", new { }, ct)).GetProperty("brainId").GetString();
            return new("context", answered == brainId, $"candidate answers for brain '{answered}'");
        };
        foreach (var resource in plan.HealthyResources)
        {
            yield return async ct =>
            {
                var text = (await Call(dashboard, "list_resources", new { }, ct)).GetRawText();
                var healthy = text.Contains($"\"{resource}\"", StringComparison.Ordinal) && text.Contains("Healthy", StringComparison.Ordinal);
                return new($"resource {resource}", healthy, healthy ? "Running/Healthy" : text);
            };
        }
        foreach (var call in plan.Calls)
        {
            yield return async ct =>
            {
                var answer = await Call(brain, "neurons_call", new { contract = call.Contract, key = call.Key, method = call.Method, arguments = call.Arguments }, ct);
                var text = answer.ValueKind == JsonValueKind.Null ? "null" : answer.GetRawText();
                var passed = call.Expected == "*" || text.Contains(call.Expected, StringComparison.Ordinal);
                return new($"call {call.Contract} {call.Key} {call.Method}", passed, passed ? text : $"expected {call.Expected}; answered {text}");
            };
        }
        foreach (var span in plan.Spans)
        {
            yield return async ct =>
            {
                var text = (await Call(dashboard, "list_traces", new { }, ct)).GetRawText();
                var count = CountOf(text, span);
                return new($"span {span}", count > 0, $"{count} span(s)");
            };
        }
    }

    private static async Task<JsonElement> Call(IMcpServer server, string tool, object arguments, CancellationToken ct)
    {
        var result = await server.Run(tool, JsonSerializer.Serialize(arguments), ct);
        if (result.IsError) { throw new InvalidOperationException($"{tool}: {result.Text}"); }
        return JsonDocument.Parse(result.Text.Length == 0 ? "null" : result.Text).RootElement.Clone();
    }

    private static int CountOf(string text, string value)
    {
        var count = 0;
        for (var at = text.IndexOf(value, StringComparison.Ordinal); at >= 0; at = text.IndexOf(value, at + value.Length, StringComparison.Ordinal)) { count++; }
        return count;
    }
}
```

The dashboard tool names (`list_resources`, `list_traces`) and endpoint come from the Task 0 spike; if the spike found no dashboard MCP, replace the dashboard `IMcpServer` with `AspireCli` over stdio (Task 5 Step 4) and keep the check names.

- [ ] **Step 4: Run all module facts, expect PASS.**

- [ ] **Step 5: Commit** explicit files, message `Aspire: verify candidates through MCP server neurons`.

---

### Task 5: `DockerCandidateHost` and storage seeding

**Files:**
- Move: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/Git.cs` → `.../Aspire/Host/Git.cs`; `IProcessRunner.cs` and `SystemProcessRunner.cs` → `.../Aspire/Host/ProcessRunner.cs` (rename `SystemProcessRunner` → `ProcessRunner`; drain stdout/stderr of started processes so they never block)
- Move: `Telemetry/AspireCliTelemetry.cs` → `.../Aspire/Host/AspireCli.cs` (only if the spike needs it)
- Create: `.../Aspire/Host/StorageSeeder.cs`, `.../Aspire/Host/DockerCandidateHost.cs`
- Modify: Aspire module csproj — `Azure.Storage.Blobs` PackageReference (already central; confirm in `Directory.Packages.props`)
- Test: `StorageSeederFacts.cs`, `DockerCandidateHostFacts.cs`, `FakeProcessRunner.cs` (moved from Launcher tests)

**Interfaces:**
- Consumes: `IModuleIntegrations<AspireModule>.Get("aspire").ReadAsync()` for `Workdir`; `AspireOptions`.
- Produces: `DockerCandidateHost : ICandidateHost`; `StorageSeeder.Copy(BlobContainerClient from, BlobContainerClient to, ct)`.

- [ ] **Step 1: Failing facts.**

`StorageSeederFacts.cs` (Azurite via the existing test fixture — find with LSP how `DigitalBrain.Aspire.Testing` or module tests start Azurite; if no fixture exists, use two `BlobContainerClient`s on one Azurite in two containers, which still exercises download/upload):

```csharp
public sealed class StorageSeederFacts(AzuriteFixture azurite) : IClassFixture<AzuriteFixture>
{
    [Fact]
    public async Task EveryBlobIsCopiedByContentNotByUri()
    {
        var ct = TestContext.Current.CancellationToken;
        var from = azurite.Container("live-" + Guid.NewGuid().ToString("N"));
        var to = azurite.Container("candidate-" + Guid.NewGuid().ToString("N"));
        await from.CreateAsync(cancellationToken: ct);
        await from.GetBlobClient("grain/a").UploadAsync(BinaryData.FromString("a"), ct);
        await from.GetBlobClient("grain/b").UploadAsync(BinaryData.FromString("b"), ct);

        await StorageSeeder.Copy(from, to, ct);

        Assert.Equal("a", (await to.GetBlobClient("grain/a").DownloadContentAsync(ct)).Value.Content.ToString());
        Assert.Equal("b", (await to.GetBlobClient("grain/b").DownloadContentAsync(ct)).Value.Content.ToString());
    }
}
```

`DockerCandidateHostFacts.cs` with `FakeProcessRunner` (records `file args` lines, returns scripted results):

```csharp
public sealed class DockerCandidateHostFacts
{
    [Fact]
    public async Task BuildRunsTheCompileAndTestGateInTheWorktreeAndReportsTheFailingOutput()
    {
        var ct = TestContext.Current.CancellationToken;
        var processes = new FakeProcessRunner { Fail = ("dotnet", "error CS0103: The name 'x' does not exist") };
        var host = DockerCandidateHostFor(processes, workdir: "/repo");

        var error = await Assert.ThrowsAsync<CandidateHostException>(() => host.Build("abc1234", ct));

        Assert.Contains("CS0103", error.Message, StringComparison.Ordinal);
        Assert.Contains(processes.Runs, run => run.StartsWith("dotnet build", StringComparison.Ordinal) && run.EndsWith("@/repo/.candidates/abc1234", StringComparison.Ordinal));
    }

    [Fact]
    public async Task StartPublishesComposeAndBringsUpAProjectNamedForTheSha()
    {
        var ct = TestContext.Current.CancellationToken;
        var processes = new FakeProcessRunner();
        var host = DockerCandidateHostFor(processes, workdir: "/repo");

        await host.Start("abc1234", ct);

        Assert.Contains(processes.Runs, run => run.StartsWith("aspire publish", StringComparison.Ordinal));
        Assert.Contains(processes.Runs, run => run.StartsWith("docker compose -p candidate-abc1234", StringComparison.Ordinal) && run.Contains(" up -d", StringComparison.Ordinal));
    }

    [Fact]
    public async Task RunningListsOnlyCandidateComposeProjects()
    {
        var ct = TestContext.Current.CancellationToken;
        var processes = new FakeProcessRunner { Output = ("docker", "candidate-abc1234\nother-project\ncandidate-def5678\n") };
        var host = DockerCandidateHostFor(processes, workdir: "/repo");

        Assert.Equal(["abc1234", "def5678"], await host.Running(ct));
    }
}
```

`DockerCandidateHostFor` builds the host with a fake `IModuleIntegrations<AspireModule>` returning `Workdir = "/repo"` and a no-op seeder; port the existing Launcher `FakeProcessRunner` and extend it with `Fail`, `Output` and a `Runs` list formatted `"{file} {args}@{workingDirectory}"`.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `StorageSeeder`:**

```csharp
// Two Azurite instances cannot copy by URI from each other: copy by content.
internal static class StorageSeeder
{
    public static async Task Copy(BlobContainerClient from, BlobContainerClient to, CancellationToken ct)
    {
        await to.DeleteIfExistsAsync(cancellationToken: ct);
        await to.CreateAsync(cancellationToken: ct);
        await foreach (var item in from.GetBlobsAsync(cancellationToken: ct))
        {
            var content = await from.GetBlobClient(item.Name).DownloadContentAsync(ct);
            await to.GetBlobClient(item.Name).UploadAsync(content.Value.Content, overwrite: true, ct);
        }
    }
}
```

Check the `GetBlobsAsync` overload against the referenced Azure.Storage.Blobs version with context7 before writing.

- [ ] **Step 4: Implement `DockerCandidateHost`:**

```csharp
internal sealed class DockerCandidateHost(
    IProcessRunner processes,
    IModuleIntegrations<AspireModule> integrations,
    IOptions<AspireOptions> options,
    IHttpClientFactory http) : ICandidateHost
{
    private const string AzuriteKey = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

    private async Task<string> Workdir(CancellationToken ct)
        => (await integrations.Get("aspire").ReadAsync(ct)).Setting("Workdir")
           ?? throw new CandidateHostException("no aspire integration");

    private static string Worktree(string workdir, string sha) => Path.Combine(workdir, ".candidates", sha);
    private static string Project(string sha) => "candidate-" + sha;

    public async Task<CandidateWorktree> Prepare(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct)
    {
        var workdir = await Workdir(ct);
        var git = new Git(processes, workdir);
        var staging = Path.Combine(workdir, ".candidates", "staging-" + Guid.NewGuid().ToString("N"));
        await git.AddWorktree(staging, ct);
        foreach (var (relative, content) in files)
        {
            var target = Path.GetFullPath(Path.Combine(staging, relative.Replace('/', Path.DirectorySeparatorChar)));
            if (!target.StartsWith(staging + Path.DirectorySeparatorChar, StringComparison.Ordinal)) { throw new CandidateHostException($"{relative} is outside the worktree"); }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            await File.WriteAllTextAsync(target, content, ct);
        }
        await git.Stage(staging, ct);
        await git.Commit(staging, summary, ct);
        var sha = await git.ShortSha(staging, ct);
        var worktree = Worktree(workdir, sha);
        Directory.Move(staging, worktree);
        await git.Run(workdir, ct, "worktree", "repair", worktree);
        return new(sha, worktree);
    }

    // The gate: the OS host and every test project under the touched modules build; their unit suites pass.
    public async Task Build(string sha, CancellationToken ct)
    {
        var worktree = Worktree(await Workdir(ct), sha);
        await Run("dotnet", ["build", options.Value.AppHostProject], worktree, ct);
        foreach (var tests in await TouchedTestProjects(worktree, ct))
        {
            await Run("dotnet", ["test", "--project", tests], worktree, ct);
        }
    }

    public async Task<CandidateEndpoints> Start(string sha, CancellationToken ct)
    {
        var worktree = Worktree(await Workdir(ct), sha);
        var output = Path.Combine(worktree, ".candidate");
        await Run("aspire", ["publish", "--project", options.Value.AppHostProject, "--output-path", output], worktree, ct);
        var compose = Path.Combine(output, "docker-compose.yaml");
        await Run("docker", ["compose", "-p", Project(sha), "-f", compose, "up", "-d", "azurite"], worktree, ct);
        var candidateBlobs = await PortOf(sha, compose, "azurite", 10000, worktree, ct);
        await StorageSeeder.Copy(
            Blobs(options.Value.LiveBlobEndpoint).GetBlobContainerClient(options.Value.GrainStateContainer),
            Blobs($"http://127.0.0.1:{candidateBlobs}/devstoreaccount1").GetBlobContainerClient(options.Value.GrainStateContainer), ct);
        await Run("docker", ["compose", "-p", Project(sha), "-f", compose, "up", "-d", "--build"], worktree, ct);
        var mcp = await PortOf(sha, compose, options.Value.SiloResource, 5081, worktree, ct);
        var ui = await PortOf(sha, compose, options.Value.SiloResource, 5080, worktree, ct);
        var dashboard = await PortOf(sha, compose, "dashboard", 18888, worktree, ct);
        return new($"http://localhost:{mcp}", $"http://localhost:{dashboard}/mcp", $"http://localhost:{ui}");
    }

    public async Task WaitHealthy(string sha, TimeSpan budget, CancellationToken ct)
    {
        var worktree = Worktree(await Workdir(ct), sha);
        var compose = Path.Combine(worktree, ".candidate", "docker-compose.yaml");
        var mcp = await PortOf(sha, compose, options.Value.SiloResource, 5081, worktree, ct);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(budget);
        var client = http.CreateClient("aspire.candidate");
        while (!deadline.IsCancellationRequested)
        {
            try { if ((await client.GetAsync($"http://localhost:{mcp}/health", deadline.Token)).IsSuccessStatusCode) { return; } }
            catch (HttpRequestException) { }
            catch (OperationCanceledException) when (deadline.IsCancellationRequested) { break; }
            try { await Task.Delay(TimeSpan.FromSeconds(2), deadline.Token); } catch (OperationCanceledException) { break; }
        }
        ct.ThrowIfCancellationRequested();
        throw new TimeoutException($"Candidate {sha} did not answer /health within {budget}.");
    }

    public async Task Remove(string sha, CancellationToken ct)
        => await Run("docker", ["compose", "-p", Project(sha), "down", "-v", "--remove-orphans"], await Workdir(ct), ct);

    public async Task<string[]> Running(CancellationToken ct)
    {
        var listed = await Run("docker", ["compose", "ls", "-a", "--format", "{{.Name}}"], await Workdir(ct), ct);
        return [.. listed.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(name => name.StartsWith("candidate-", StringComparison.Ordinal))
            .Select(name => name["candidate-".Length..])];
    }

    private async Task<int> PortOf(string sha, string compose, string service, int containerPort, string worktree, CancellationToken ct)
    {
        var mapped = await Run("docker", ["compose", "-p", Project(sha), "-f", compose, "port", service, containerPort.ToString(CultureInfo.InvariantCulture)], worktree, ct);
        return int.Parse(mapped[(mapped.LastIndexOf(':') + 1)..], CultureInfo.InvariantCulture);
    }

    private async Task<string[]> TouchedTestProjects(string worktree, CancellationToken ct)
    {
        var changed = await Run("git", ["diff", "--name-only", "HEAD~1", "HEAD"], worktree, ct);
        return [.. changed.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(path => ModuleRoot(path))
            .OfType<string>()
            .Distinct(StringComparer.Ordinal)
            .Select(root => Path.Combine(worktree, root, "tests"))
            .Where(Directory.Exists)
            .SelectMany(tests => Directory.EnumerateDirectories(tests))];
    }

    // src/DigitalBrain.Modules/{Vendor}/{Module}/… → that module's folder.
    private static string? ModuleRoot(string path)
    {
        var parts = path.Split('/');
        return parts.Length > 4 && parts[0] == "src" && parts[1] == "DigitalBrain.Modules" ? string.Join('/', parts[..4]) : null;
    }

    private async Task<string> Run(string file, string[] args, string workingDirectory, CancellationToken ct)
    {
        var result = await processes.RunAsync(file, args, workingDirectory, null, ct);
        if (result.ExitCode != 0) { throw new CandidateHostException($"{file} {string.Join(' ', args)} failed: {Tail(result.Output + result.Error)}"); }
        return result.Output.Trim();
    }

    private static string Tail(string output) => output.Length <= 4000 ? output : output[^4000..];

    private static BlobServiceClient Blobs(string endpoint)
        => new(new Uri(endpoint), new StorageSharedKeyCredential("devstoreaccount1", AzuriteKey));
}
```

The service names `azurite`, `dashboard`, the silo service and the container ports come from the Task 0 spike's compose file; replace them with the recorded values. Read `IntegrationSnapshot` with LSP for the real accessor of a setting (written here as `.Setting("Workdir")`). The candidate gets no deployment Integrations except the LLM: in the compose file only the LLM key environment variables are kept — implement as a post-publish step that removes every `DigitalBrain__Integrations__*` variable except `DigitalBrain__Integrations__openrouter__*` from `docker-compose.yaml` (and its `.env`), with a fact in `DockerCandidateHostFacts` asserting the stripped file.

- [ ] **Step 5: Run module facts, expect PASS.** Run `StorageSeederFacts` too.

- [ ] **Step 6: Commit** explicit files, message `Aspire: candidates run as docker compose projects seeded from live storage`.

---

### Task 6: `AspireClusterHost` (restart the live cluster on a sha)

**Files:**
- Create: `.../Aspire/Host/AspireClusterHost.cs` (replaces stub)
- Test: `AspireClusterHostFacts.cs`

**Interfaces:**
- Consumes: `IProcessRunner`, `Git`, `AspireOptions`, Workdir integration; the AppHost's Aspire MCP via `aspire mcp start` (stdio) — `execute_resource_command`.
- Produces: `AspireClusterHost : IClusterHost`.

- [ ] **Step 1: Failing facts.**

```csharp
public sealed class AspireClusterHostFacts
{
    [Fact]
    public async Task ADirtyLiveTreeRefusesTheRestartAndTouchesNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        var processes = new FakeProcessRunner { Output = ("git", " M src/A.cs\n") };
        var host = AspireClusterHostFor(processes, workdir: "/repo");

        var error = await Assert.ThrowsAsync<ClusterHostException>(() => host.Restart("abc1234", ct));

        Assert.StartsWith("live tree dirty: ", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(processes.Runs, run => run.StartsWith("git merge", StringComparison.Ordinal) || run.StartsWith("git stash", StringComparison.Ordinal) || run.StartsWith("git reset", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ACleanTreeFastForwardsBuildsAndRestartsTheSiloResource()
    {
        var ct = TestContext.Current.CancellationToken;
        var processes = new FakeProcessRunner();
        var host = AspireClusterHostFor(processes, workdir: "/repo");

        await host.Restart("abc1234", ct);

        Assert.Equal(
            ["git status --porcelain@/repo", "git merge --ff-only abc1234@/repo", "dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj@/repo", "aspire resource os restart@/repo"],
            processes.Runs.Select(run => run.Replace("\n", "", StringComparison.Ordinal)).ToArray());
    }
}
```

The last expected line is whatever the spike settled on for restart (Task 0 Step 2): either one `restart` command or `stop` → build → `start`; write the fact to that order before implementing.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.**

```csharp
internal sealed class AspireClusterHost(IProcessRunner processes, IModuleIntegrations<AspireModule> integrations, IOptions<AspireOptions> options) : IClusterHost
{
    private async Task<string> Workdir(CancellationToken ct)
        => (await integrations.Get("aspire").ReadAsync(ct)).Setting("Workdir")
           ?? throw new ClusterHostException("no aspire integration");

    public async Task<string> CurrentSha(CancellationToken ct)
        => await Run("git", ["rev-parse", "--short=7", "HEAD"], await Workdir(ct), ct);

    // Never stashes, resets or merges over local edits: parallel sessions share this tree.
    public async Task Restart(string sha, CancellationToken ct)
    {
        var workdir = await Workdir(ct);
        var dirty = await Run("git", ["status", "--porcelain"], workdir, ct);
        if (dirty.Length > 0) { throw new ClusterHostException("live tree dirty: " + dirty.Replace('\n', ' ')); }
        await Run("git", ["merge", "--ff-only", sha], workdir, ct);
        await Run("dotnet", ["build", "src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj"], workdir, ct);
        await Run("aspire", ["resource", options.Value.SiloResource, "restart"], workdir, ct);
    }

    private async Task<string> Run(string file, string[] args, string workingDirectory, CancellationToken ct)
    {
        var result = await processes.RunAsync(file, args, workingDirectory, null, ct);
        if (result.ExitCode != 0) { throw new ClusterHostException($"{file} {string.Join(' ', args)} failed: {result.Error}"); }
        return result.Output.Trim();
    }
}
```

The `aspire resource … restart` CLI form is a placeholder for whatever the spike verified (the Aspire CLI command or `aspire mcp start` → `execute_resource_command`); check the current CLI with `mcp__aspire__search_docs` "resource command restart" and use the verified form in both the fact and the code.

- [ ] **Step 4: Run module facts, expect PASS.**

- [ ] **Step 5: Commit** explicit files, message `Aspire: the live cluster restarts on a promoted sha, never over local edits`.

---

### Task 7: Orphan candidates are removed on activation

**Files:**
- Modify: `.../Aspire/Candidates/CandidateIndexNeuron.cs`
- Test: `CandidateIndexFacts.cs`

- [ ] **Step 1: Failing fact.**

```csharp
[Fact]
public async Task ComposeProjectsNoLiveCandidateOwnsAreRemovedWhenTheIndexActivates()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeCandidateHost();
    host.Live.Add("orphan1");
    await using var brain = await CandidateFacts.StartAsync(host, new FakeVerifier(), ct);

    Assert.Null(await brain.Get<ICandidates>("owner").Live());

    Assert.Contains("remove orphan1", host.Calls);
}
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** in `CandidateIndexNeuron.OnActivateAsync` (after base): for each sha in `await host.Running(ct)`, read `ICandidate.Key(BrainId, sha)`; if its stage is not one of `Building, Starting, Healthy, Verifying, Verified`, call `host.Remove(sha, ct)`. Candidates are per brain but compose projects are per host: only remove shas whose `ICandidate` in *this* brain is not live **and** that no other brain claims — read `IKernel.Instances<ICandidate>()` across brains (find the enumerator with LSP; `SelfImprove.RenderListAsync` uses `brain.Kernel.Instances<IRevision>`) and skip any sha with a live instance anywhere.

- [ ] **Step 4: Run module facts, expect PASS.**

- [ ] **Step 5: Commit** explicit files, message `Aspire: orphan candidate containers are removed on activation`.

---

### Task 8: Delete the Launcher, Revisions and the bridge; rewire the OS and SelfImprove

**Files:**
- Delete: `src/DigitalBrain.Launcher/**` (both projects), `src/DigitalBrain.Modules/DigitalBrain/Revisions/**` (four projects + tests), `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/FakeLauncherHost.cs`
- Modify: `DigitalBrain.slnx` (remove `/Launcher/` and `/Modules/DigitalBrain/Revisions/` folders), `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:32`, `src/DigitalBrain.AppHost/AppHost.cs:24,61`, `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj:27`, `src/DigitalBrain.AppHost/appsettings.json:23-27` (remove `revisions`; add `"Integrations": { "aspire": { "Workdir": "../.." } }` in the dev profile — confirm how dev-profile Integrations are written in `appsettings.Development.json` / the dev profile from `b1efc6c8b`), `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs:27` (fact becomes `TheOperatingSystemComposesTheAspireModule`), `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/SelfImproveFacts.cs`, `SelfImproveHostFixture.cs`, `ProductE2E.cs:7`, `src/DigitalBrain.Platform/DigitalBrain.Platform/Workshop/IWorkshop.cs:8` (comment: `… → ICluster.Restart`)
- Modify: `.../Aspire.Aspire.Hosting/AspireModuleHosting.cs` — remove `BridgeKeyProjection` and the `AspireBridgeClient` hosted service; delete `AspireBridgeClient.cs`; add the Docker Compose environment the spike required (`builder.AddDockerComposeEnvironment("candidate")`, only applied in publish mode)
- Modify: `features/os/SelfImprove/*.cs`

- [ ] **Step 1: Map every reference** with LSP `findReferences` on `IRevision`, `IRevisions`, `RevisionsModule`, `RevisionsModuleHosting`, `ILauncherClient`, `AspireBridgeClient`. Every hit is in the file list above; any other hit gets added to this task before deleting.

- [ ] **Step 2: Rewrite SelfImprove** against the new contracts (they are compiled into the sandbox from `DigitalBrain.Microsoft.Aspire`):

`SelfImprove.cs`: `using DigitalBrain.Microsoft.Aspire;` instead of `DigitalBrain.Revisions`; `Parse` returns `CandidateProposal` and builds `VerificationPlan(calls, healthyResources, spans, budget)` (no `AspireKey`; drop it from `PlanJson`); `RenderListAsync` enumerates `brain.Kernel.Instances<ICandidate>(…)` and reads `ICandidate`, and adds a first line from `brain.Get<ICluster>(ICluster.Key).Read()`: `Live: {sha} ({stage})`.

`request.cs`: `brain.Get<ICandidates>(SelfImprove.Scope(brain)).Propose(SelfImprove.Parse(request.Input))`.

`healthy.cs`: `On<CandidateChanged>(index)` → `ICandidate` → `On<CandidateHealthy>(candidate)` → `await candidate.Verify()` (no plan argument).

`verified.cs`: on `CandidateVerified`, `if ((await candidate.Read()).Stage == CandidateStage.Verified) { await candidate.Promote(); }`.

`failed.cs`: `On<CandidateFailed>`; report text unchanged in shape.

`app.cs`: bump `Version` to `"1.1.0"`; spec comment: "verified is promoted by restarting the live cluster on the candidate's sha; the window reconnects".

- [ ] **Step 3: Delete and edit** the files listed. Remove the deleted projects from `DigitalBrain.slnx`.

- [ ] **Step 4: Build every affected project** (LSP diagnostics clean first):

```bash
dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj
dotnet build src/Testing/DigitalBrain.Architecture.Tests/DigitalBrain.Architecture.Tests.csproj
```

Expected: all succeed. The features compile-check runs at OS boot (`FeatureCatalog`); `SelfImprove` must compile there (Task 9 confirms).

- [ ] **Step 5: Run suites.**

```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

Expected: PASS. Then `SelfImproveFacts` in OS E2E rewritten against `FakeCandidateHost`/`FakeClusterHost` registered through `SelfImproveHostFixture.ConfigureSilo` (replacing `FakeLauncherHost`): request → candidate Healthy → Verified → Promoted → `ClusterRestarting`:
`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*SelfImproveFacts"`

- [ ] **Step 6: Commit** explicit paths (`git rm -r` is allowed for the two deleted project trees since every file in them goes; list each other file by path), message `Delete the Launcher, Revisions module and Aspire bridge; SelfImprove runs on candidates`.

---

### Task 9: Seen running

- [ ] **Step 1: Start.** `dotnet run digitalbrain.cs` from the repo root. `mcp__aspire__list_resources`: every resource Running/Healthy; otherwise `list_console_logs` for it first.

- [ ] **Step 2: Commit the tree** so the live checkout is clean for promote (only this plan's work; other sessions' edits must be committed or the restart correctly refuses — that refusal is itself worth seeing once).

- [ ] **Step 3: Drive it** through `digitalbrain-mcp` (`localhost:5081/mcp`):
  - `neurons_context`: confirm brain and caller.
  - `neurons_call` the SelfImprove app `request` with a change set adding a Calculator operation (files: the new `features/os/Calculator/*.cs` synapse and the bumped `app.cs`), plan: calls `IApp {brain}/apps/calculator Read` expecting the new operation name, healthy resources `["os"]`, spans `[]`, budget `00:20:00`.
  - Watch `ICandidate {brain}/aspire/candidate/{sha}` via `neurons_get` through Building → Starting → Healthy → Verifying → Verified → Promoted. `docker compose ls` shows `candidate-{sha}` while it runs and not after.
  - After promote the silo restarts; reconnect, `neurons_get ICluster cluster` → `Steady`, sha = the candidate's; Calculator lists the new operation.

- [ ] **Step 4: Telemetry.** `list_traces` shows `CandidateNeuron` Start/Verify spans and the `IMcpServer` Run spans into the candidate; `list_structured_logs` shows the compose and restart commands; no error logs.

- [ ] **Step 5: Failure path once.** Request a change set whose `.cs` does not compile: `CandidateFailed(Building)` with the compiler line in the SelfImprove report; no compose project created.

- [ ] **Step 6: Update CLAUDE.md** repo map: drop the Launcher mention; under Self-programming apps note "Self-improvement: `ICandidate` containers verified over MCP, promoted by `ICluster.Restart`". Commit explicitly.

---

## Spike results

Verified 2026-10-10 against Aspire CLI 13.6.0, Docker 29.8.2 (evidence: task-0 report in `.superpowers/sdd/2026-10-10-aspire-candidate-container/task-0-report.md`).

**1. Compose environment and publish command.**
- `aspire publish` has no `--publisher`/`--project` flags in 13.6. Without a compose environment it emits only Bicep (`main.bicep`, `Modules-storage*/`). Compose needs `builder.AddDockerComposeEnvironment("candidate")` (package `Aspire.Hosting.Docker` 13.6.0, not referenced today) — env name `candidate`.
- Working command: `aspire publish --apphost src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj -o <dir> --non-interactive --nologo` → `<dir>/docker-compose.yaml` + `<dir>/.env` (unfilled) + Bicep for storage.
- Image build/fill step is `aspire do prepare-candidate` (step name `prepare-{env}`). It built the container/Dockerfile images, then **hung silently >15 min at the `prepare-candidate` step** (no log line; Azure storage outputs it cannot resolve). Do not use it; build images ourselves.
- Trap: the first publish writes `~/.aspire/deployments/<hash>/production.json`; every later publish/do run of that AppHost then crashes in `DigitalBrainProfiles.AddDigitalBrainProfiles` (`ArgumentException: Stream was not readable` — the deployment state is a one-shot stream config source and our profile insert reloads sources). Fix `AddDigitalBrainProfiles` (don't trigger a reload of stream sources) or delete that state dir before each publish.

**2. Generated services, ports, boot.**
- Services: `candidate-dashboard` (image `mcr.microsoft.com/dotnet/nightly/aspire-dashboard:13.6`; `18888` UI published to a random host port, `18889` OTLP gRPC / `18890` OTLP HTTP expose-only), `operatingsystem` (silo; `HTTP_PORTS=${OPERATINGSYSTEM_PORT}`, silo 8001 / gateway 8002, **no host port**), `digitalbrain-mcp` (separate service, `${DIGITALBRAIN_MCP_PORT}`, no host port — MCP is NOT on the silo: OS `/mcp` → 404), plus `modules-ollama`, `modules-qdrant-server`, `modules-clickhouse-server`, `csharp-sandbox`, `systemone`, `modules-{photo,film}craft-{mcp,web}`. Fixed ports 5080/5081 are not carried (`isProxied:false` ports become `${X_PORT}` vars).
- **No storage service**: `useAzureStorage: true` publishes Azure Storage as Bicep; clustering/reminders/grainstate point at `${MODULES_STORAGE_OUTPUTS_TABLEENDPOINT}`/`BLOBENDPOINT`. The candidate must add Azurite itself (e.g. `PublishAsDockerComposeService`/`ConfigureComposeFile`, or the hosting library emits an azurite container under a compose env).
- **Project images are not built**: repo-wide `EnableSdkContainerSupport=false` (Directory.Build.props) makes Aspire's `build-OperatingSystem` report success in 10 s with no image. `dotnet publish src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -p:PublishProfile=Container -p:ContainerRepository=operatingsystem -p:ContainerImageTag=<sha> -c Release` works (port 8080, features baked at `features`, `DigitalBrain__Standalone=true`).
- `DigitalBrain__Modules__apps__Options__Features` is written as the host path `E:\...eatures` — wrong inside a container; the Container profile value (`features`) must win.
- Host ports: `docker compose -p <p> port operatingsystem 8080` → `0.0.0.0:53139`; `port candidate-dashboard 18888` → `0.0.0.0:53136` (ephemeral, read after `up`).
- **Candidate silo boots and answers `/health` → `Healthy 200`** with: azurite + clickhouse + postgres services; env `Orleans__*` providers + `ConnectionStrings__{clustering,reminders,grainstate}` (azurite dev account), `DigitalBrain__Auth__Posture=Open`, base64 `DigitalBrain__MasterKey`, base64 `DigitalBrain__Integrations__csharp__RunTokenKey`, `DigitalBrain__Integrations__clickhouse__ConnectionString`, `DigitalBrain__Integrations__postgres__ConnectionString`. Each was a hard boot failure when missing (Posture, ClickHouse unavailable, RunTokenKey, Postgres unavailable). Master key is bound to storage: a fresh volume per candidate (`down -v`).
- Integrations env naming in the compose file: `DigitalBrain__Integrations__{id}__{Field}` (e.g. `DigitalBrain__Integrations__openai__ApiKey: "${MODULES_OPENAI_API_KEY}"`, `..__google-oauth__ClientId`, `..__clickhouse__ConnectionString`); module options `DigitalBrain__Modules__{id}__Options__{Prop}`.

**3. Dashboard MCP: no.** The 13.6 dashboard has no MCP endpoint (`POST /mcp` → 400, UI port). It does serve the telemetry HTTP API `GET /api/telemetry/traces` (OTLP JSON; anonymous with `ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true`), and the CLI reads it: `aspire otel traces --dashboard-url http://localhost:<port> --format Json [--search ...] [-t <traceId>]` (also `aspire otel logs|spans`) — verified, it listed the candidate's `DigitalBrain.OS: features.load` trace. MCP over stdio: `aspire agent mcp --dashboard-url <url> --api-key <key>` (dashboard started with `Dashboard__Api__AuthMode=ApiKey`, `Dashboard__Api__PrimaryApiKey`). Task 4 should use `aspire otel ... --format Json` (or the HTTP API directly) rather than an MCP session.

**4. Restart semantics: yes.** Live silo resource: display name `OperatingSystem` (instance `OperatingSystem-<suffix>`; `digitalbrain-mcp` likewise). After `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`, `aspire resource OperatingSystem restart --apphost src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj --non-interactive --nologo` (exit 0, "restarted successfully") ran the rebuilt binary: the added marker line appeared in the resource's console log. Caveat: the silo was stopped (Finished) at build time, so file locking of a *running* silo's DLLs during `dotnet build` was not exercised — prefer `stop` → build → `start`, or the built-in project command `rebuild` ("Stop the resource, rebuild the project from source, and restart"; `aspire resource OperatingSystem rebuild`), which Aspire 13.6 exposes on every project resource (`OperatingSystem-rebuilder-*` helper).
