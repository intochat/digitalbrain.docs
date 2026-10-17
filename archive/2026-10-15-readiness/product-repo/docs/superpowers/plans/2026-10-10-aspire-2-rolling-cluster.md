# Aspire 2/3 — Rolling Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live cluster runs at least two silos and upgrades itself silo by silo (`ICluster.Roll(sha)`) with Orleans grain-interface versioning, so 5080/5081 never go down for a compatible change.

**Architecture:** The `os` silo resource gets `WithReplicas(2)`; each replica runs the build named in `live.json` at its own start, so restarting replicas one at a time *is* the rolling upgrade. `ClusterNeuron.Roll` persists `Rolling(sha, remaining[])` before each step and resumes on activation, because the silo hosting it may be the one being restarted. Orleans is configured with `BackwardCompatible` compatibility and `LatestVersion` selection, so new activations land on the newest silos and old callers keep working.

**Tech Stack:** Orleans `GrainVersioningOptions`, `[Version]`, Aspire `WithReplicas`, Aspire MCP (`list_resources`, `execute_resource_command`).

**Spec:** `docs/superpowers/specs/2026-10-10-aspire-instance-neuron-design.md` (build order step 2). **Requires plan 1 merged.**

## Global Constraints

- All Global Constraints of plan 1 apply (LSP first, per-project build/test, no retries/timeouts/polling as fixes, explicit-file commits, 5-minute test cap, concrete arrays in state).
- Fixed ports 5080 (UI) and 5081 (MCP) must stay served throughout `Roll`.
- Verify every Orleans and Aspire API used here against current docs (context7 / microsoft-learn) before coding; the SDK is .NET 11 RC.
- `Roll` is only called by `ICandidate.Promote` after plan 3; in this plan it is exposed and driven directly for verification.

## Review Focus

- The `ClusterNeuron` activation is on the replica being restarted: `Roll` must resume from persisted `remaining` on the next activation, not restart from scratch and not skip a replica.
- A replica that never becomes Running/Healthy within the step budget: stop rolling, `SetLive(previous)`, restart that replica back, end `Steady` on the previous sha with `ClusterChanged` naming the failure.
- Two replicas behind fixed host ports: confirm Aspire's proxy load-balances 5080/5081 across replicas (`isProxied` must be true for replicated resources — today it is `false`, `AppHost.cs:76,83`); the shell's long-lived connections must survive the other replica restarting (reconnect lands on the live one).
- `Roll` while `Restarting` or already `Rolling` a different sha → refused with a clear `InvalidOperationException`.
- Grain state written by the new silo must be readable by the old one during the roll (additive field): a JSON-storage round-trip fact.

---

### Task 1: Orleans versioning configured

**Files:**
- Modify: the shared silo configuration — find via LSP where `ISiloBuilder` is configured for every host (search `UseOrleans`/`AddOrleans` call sites in `src/DigitalBrain.Framework` / `src/DigitalBrain.Aspire/DigitalBrain.Aspire.ServiceDefaults`).
- Test: a fact in the Framework's unit tests (find the project that tests silo composition via LSP on that method's references).

```csharp
silo.Configure<GrainVersioningOptions>(options =>
{
    options.DefaultCompatibilityStrategy = nameof(BackwardCompatible);
    options.DefaultVersionSelectorStrategy = nameof(LatestVersion);
});
```

- [x] **Step 1:** Verify type names/namespaces with context7 (`Orleans.Configuration.GrainVersioningOptions`, `Orleans.Versions.Compatibility.BackwardCompatible`, `Orleans.Versions.Selector.LatestVersion`).
- [x] **Step 2:** Failing fact `EverySiloPrefersTheLatestCompatibleVersion`: build a silo via `ModuleTest.Create()` and resolve `IOptions<GrainVersioningOptions>`; assert both strategy names.
- [x] **Step 3:** Implement; **Step 4:** pass; **Step 5:** commit `"Orleans: backward-compatible versioning, latest version preferred"`.

### Task 2: JSON storage tolerates additive state

**Files:**
- Test: `src/Testing/DigitalBrain.Architecture.Tests/AdditiveStateFacts.cs` (or the storage serializer's own test project — find the JSON grain storage serializer via LSP on `DigitalBrainNames.DefaultGrainStorage` registration).

- [x] **Step 1:** Fact `StateWrittenWithANewFieldIsReadByTheOldShape`: two records `V1(string A)` and `V2(string A, string B)` with matching `[Id]`s; serialize `V2` with the configured storage serializer, deserialize as `V1` → `A` intact; and `V1` → `V2` gives `B` default.
- [x] **Step 2:** Run. If it passes, commit the fact (`"Storage: additive state round-trips across versions"`). If it fails, fix the serializer options (e.g. unknown-member handling) — the fix is part of this task.

### Task 3: Two silo replicas behind the fixed ports

**Files:**
- Modify: the AppHost silo resource (plan 1 Task 9 location) — `.WithReplicas(2)` for both the project and the executable variants; make the UI/MCP endpoints proxied (`isProxied: true`) so 5080/5081 balance across replicas.
- Modify: anything that assumed one silo — find via LSP: Orleans clustering in dev (localhost clustering supports one silo only; switch to Azure Table / Azurite clustering, which the hosting extensions may already support — read `DigitalBrainHostingExtensions.cs`), silo port assignment (each replica needs its own silo/gateway port; Aspire assigns per-replica when ports come from endpoints, check).
- Test: hosting fact `TheSiloRunsTwoReplicasBehindTheFixedPorts` (Aspire.Testing model inspection: `ReplicaAnnotation` count 2, endpoints 5080/5081 proxied).

- [x] Steps: failing fact → implement → pass → run the AppHost (`dotnet run digitalbrain.cs`) → `list_resources` shows `os` with two replicas Running/Healthy → `curl localhost:5081/health` OK → commit `"AppHost: two silo replicas behind 5080/5081"`.
  - Note (T3): source run verified with 2 OperatingSystem + 2 digitalbrain-mcp replicas; the live-build executable variant carries the ReplicaAnnotation but Aspire 13.6 runs executables once (needs a ruling).

### Task 4: Per-replica restart in IClusterHost

**Files:**
- Modify: `Cluster/IClusterHost.cs`, `Cluster/AspireCliClusterHost.cs`, `tests/.../FakeClusterHost.cs`

Add:

```csharp
Task RestartSilo(string name, CancellationToken ct);              // one replica, by resource name from Silos()
Task<SiloView> WaitSilo(string name, TimeSpan budget, CancellationToken ct); // Running+Healthy or TimeoutException
```

`AspireCliClusterHost`: `execute_resource_command` with the replica's resource name (replicas appear as `os-<suffix>` in `list_resources`; confirm). `WaitSilo`: readiness wait on that replica's state via `list_resources`, bounded by the caller's budget. `FakeClusterHost`: `RestartedSilos` list, `NeverHealthy` set of names → `TimeoutException`.

- [x] Steps: implement, unit fact in `ClusterFacts` for the fake's contract is unnecessary; covered by Task 5. Build. Commit with Task 5.

### Task 5: ICluster.Roll

**Files:**
- Modify: `Contracts/ICluster.cs`, `Contracts/ClusterSnapshot.cs`, `Cluster/ClusterNeuron.cs`, `Cluster/ClusterState.cs`
- Test: `tests/.../ClusterRollFacts.cs`

Contract:

```csharp
[ResponseTimeout("00:30:00")] Task<ClusterSnapshot> Roll(string sha);
```

`ClusterState` gains `[Id(n)] public string[] Remaining { get; init; } = [];` and `[Id(n+1)] public string? PreviousSha { get; init; }`. `ClusterSnapshot` gains `[property: Id(4)] string[] Remaining`.

Algorithm (each line persisted before its side effect):
1. Refuse unless `Steady` (or `Rolling` with the same `TargetSha` → resume).
2. `Silos()` → names; save `Rolling, TargetSha = sha, PreviousSha = CurrentSha, Remaining = names`; `SetLive(sha)`.
3. For each name in `Remaining`: if it is the replica hosting this activation (compare `SiloView` with the local silo — find via LSP how a grain learns its silo address, e.g. `ILocalSiloDetails`; map via the replica's endpoint/port), skip it until last. `RestartSilo(name)`; `WaitSilo(name, StepBudget)`; save `Remaining` minus name.
4. The last (self) replica: save `Remaining = [self]`, then `RestartSilo(self)` — this activation dies; `OnActivateAsync` on the new build sees `Rolling` with `Remaining == [self]` and that silo now Running on `sha` → save `Steady, CurrentSha = sha, Remaining = []`, publish `ClusterChanged`.
5. On `TimeoutException` from `WaitSilo`: `SetLive(PreviousSha)`, `RestartSilo(name)` (back to previous build), save `Steady, CurrentSha = PreviousSha`, publish `ClusterChanged(PreviousSha, Steady, null)`, throw `InvalidOperationException($"silo {name} never became healthy on {sha}")` so `ICandidate.Promote` (plan 3) records `Failed(Promoting)`.

`StepBudget`: `AspireOptions.SiloStepBudget` (default 3 minutes, option not a hard-coded constant).

- [x] **Step 1: Failing facts:**
  - `RollingRestartsEverySiloOnceAndEndsSteadyOnTheNewSha`
  - `RollingResumesFromTheRemainingSilosAfterReactivation` (deactivate the cluster grain between steps)
  - `ASiloThatNeverBecomesHealthyRollsBackToThePreviousSha` (`NeverHealthy = {"os-1"}`; `Current` back to previous; `ClusterChanged` Steady; Roll throws)
  - `RollIsRefusedWhileRestarting`
- [x] Steps 2–4: fail, implement, pass.
- [x] **Step 5:** Commit `"Aspire: the cluster rolls silo by silo"`.

### Task 6: Verification loop

- [x] **Step 1:** `dotnet run digitalbrain.cs`; two `os` replicas healthy.
- [x] **Step 2:** Publish a build of a trivially additive change (new Calculator operation) by proposing a candidate and verifying it (plan 1 flow), then call `ICluster.Roll(sha)` via `digitalbrain-mcp` `neurons_call` instead of `Promote`.
- [ ] **Step 3:** (FAIL live 2026-10-10: ~10 s 5080 hang and proxied /ready 503s while instances drain; task-6-report D1. Fix wave: drain phase, front /ready, per-instance front readiness, shell on the front landed; MCP-instance rolls and their rollback showed zero failed samples, a silo roll still lost 5080 for ~10-20 s (DCP force-kill of the stopping silo, DCP tunnel re-bind failure); not passed, see final-fix-report.md) While it rolls, loop `curl -sf localhost:5081/health` and `localhost:5080` once a second from a separate terminal and record any non-200; expected: none. The shell stays connected (check its workspace neuron through `digitalbrain-mcp`).
- [x] **Step 4:** `ICluster.Read()` → `Steady` on the new sha; both replicas on it (`Silos()`); `list_traces` shows the roll; no errors in `list_structured_logs`.
- [x] **Step 5:** Failure path with a candidate whose silo throws on start → rollback to previous sha, still serving.
- [x] **Step 6:** Regression suites of every touched project; commit fixes.
