# CSharp Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the CSharp module one run shape, durable at-least-once subscriptions, one module, one key grammar and the Time/Gmail layout, and declare the sandbox as a connector.

**Architecture:** `CSharpFileNeuron` keeps `Program`, `Subscriptions: Subscription[]` and `Run: RunRecord?`; one reconcile path decides whether a run is due (on Start, on a signal arrival, on the reminder). A subscription is a watermarked buffer: `DrainPending` returns the batch and its watermark without clearing, `Acknowledge` trims up to the watermark after the edge has handed the batch to the stream, overflow past the cap is counted and published. Authoring is an option of `CSharpModule`, not a second module. Every file key is `{brainScope}/csharp/{name}` composed by `CSharpFileKeys.For`.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains and reminders, xUnit v3 facts over `ModuleTest.Create().WithModule<CSharpModule>()` and the in-project `FakeSandbox`, Aspire hosting.

**Spec:** the CSharp section of `docs/superpowers/specs/2026-10-07-module-audit.md` (the diagnosis) and the seven ratified decisions, restated below because no design document carries them.

## Ratified decisions (restated; not reopened)

1. One run shape. `CSharpFileState` holds `Program`, `Subscriptions: Subscription[]`, `Run: RunRecord?`. "Armed" and "always-on" are one thing; the `Trigger` field is deleted; Describe, Authorize, ReceiveReminder, WakeAsync/Fire and ResumeWatches stop re-deriving the mode.
2. Durable at-least-once subscriptions: `Pending: string[]`, `Delivered: long`; `DrainPending` returns batch plus watermark and does not clear; `Acknowledge(runId, neuron, signal, watermark)` trims; overflow increments `Dropped` and publishes `CSharpFileChanged`; the cap is `CSharpOptions`; the edge acknowledges after the batch is handed on.
3. One module: `CSharpAuthoringModule` and its hosting are deleted; `CSharpOptions.Authoring = true` (default) gates the authoring tools and `/csharp` routes.
4. One key: `{brainScope}/csharp/{name}` through `CSharpFileKeys.For` in Contracts.
5. The sandbox is a connector declared on `CSharpModule`, naming `ICSharpFile` and its signals.
6. Layout `Files/` (+ `Signals/`), `Catalog/`, `Edge/`, `Sandbox/`, `Authoring/`, namespace equals folder; `CSharpSandbox` constants leave Contracts; `RepositoryRoot` has one copy, in Aspire.Hosting.
7. No migrations, shims or aliases; concrete arrays in state; no grain self-calls (one-way `this.AsReference<T>()`); never raise a timeout or add polling to make a check pass.

## Findings made while planning (read before approving)

These are facts the plan had to deal with. Each is handled by a task; the ones marked **decision** need your eye.

- **The Apps drop-tests plan is mid-landing in this working tree, not landed.** HEAD already has `c0332a0d6` (publish gate is compilation) and `5894770ef` (nothing runs tests), but `git status` still shows staged deletions and modified Apps files, and the tree changed while this plan was being written. This plan assumes those commits are complete before Phase B starts. Task 3 and Task 4 touch `RecordingCSharpFile.cs` and `AppNeuronFacts.cs`; Phase B begins with `git status` clean of Apps changes, or stops and asks.
- **`DigitalBrain.Modules.Microsoft.CSharp.Tests` does not compile at HEAD.** `SynapseFacts.cs`, `CSharpFileNeuronFacts.cs:26`, `CSharpSubscriptionFacts.cs:330` and `ScriptEdgeFacts.cs:386` still use `ISynapse`, `SynapseChanged`, `SynapseWatch`, `.Alive`, `.Watches`, `.Program` (12 errors, verified with `dotnet build`). The module itself, Hosting, Deployment, Apps.Tests, Assistant.Tests and Client.Tests.Unit build. Task 1 repairs this first; nothing else can be seen green before it.
- **LSP coverage.** `csharp-ls` indexed the CSharp rings and their tests but returned nothing from Apps, OS, AppHost or Assistant (for example `AppProgramKey.For` has a caller in `CSharpAppRuntime.cs:57` and LSP reported none). The caller table below marks every row `LSP` or `text`; `text` rows are cross-checked with a text search per the repo's own `lsp-references-cross-check` rule. Phase B re-runs `findReferences` before every deletion and treats a disagreement as a stop.
- **Baseline builds.** `OS.Tests.Unit`, `OS.Tests.E2E`, `Architecture.Tests` and `AppHost` failed once with `MSB3021` file locks and built clean after `dotnet build-server shutdown`. Baselines are retaken in Task 1.
- **Decision (consequence of 1): `Arm` cannot survive.** An armed file is "wake per signal of one neuron"; that is exactly a subscription, and the `Trigger` field is deleted. So `ICSharpFile.Arm`, `CSharpTrigger`, `CSharpFileSnapshot.Trigger`, the `csharp_arm` tool, `ICSharpFileTrigger.Fire`, the `CSharpFile__Trigger` environment variable and `DigitalBrainConnection.Trigger<T>()` in `DigitalBrain.Client` are deleted in Task 3. A script that wants wake-per-signal writes `brain.On<T>`. Nothing in `src/` outside tests and prompt text uses them (text search; Dart has no `trigger` key).
- **Decision (interpretation of 2): "acknowledge after the batch is handed to the script".** I read this as: `ScriptEdge.Draining` acknowledges once every signal of a batch has been handed to the SSE response (it resumes after the last `yield`). The wire between the edge and `DigitalBrain.Client` does not change. This closes the window the audit named (the edge dying after `Pending = []`), but a script that dies after receipt and before handling still loses what the edge already acknowledged. The stronger reading, where the client acknowledges over a new `scripts/v1/ack` call after the script's loop body ran, needs a protocol addition and has a liveness hazard (a script that `break`s after one signal leaves its last signal unacknowledged and is woken again on every reconcile). It is not planned; say so at review if you want it.
- **Decision (consequence of 1): `Authorize` becomes exact-id.** Today a subscribed standalone file keeps every signed token alive because a wake-run must authorize before its id is saved. Task 5 records the run before launching it for every file (today only app-bound files do), so `Authorize` is `Run is { Active: true } && runId == Run.Id`. Side effects, both pinned by facts: stale tokens stop speaking after a restart, and a launch that throws (sandbox cannot start) leaves the intent recorded so the reminder retries.
- **Decision (consequence of 5): the connector flips an existing fact and shows in the shell.** `RunTokensFacts.RunTokenInfrastructureIsNotAUserConnector` asserts the opposite of decision 5 and `README.md` says the same; both are rewritten in Task 7. `Platform` requires at least one auth method, so the connector declares `["run-token"]` with `OptionalIntegrations = ["csharp"]` (the Supabase shape); it will appear in `GET /connectors` and the shell's connect menu. No Platform change is planned.
- **Decision (consequence of 6): the sandbox wire DTOs stay in two assemblies.** The Sandbox project is an image built alone (`Dockerfile` copies only its own folder, `csproj` takes no references), so it cannot share a file with the module. The module keeps one copy under `Sandbox/`, the image keeps its own, and a parity fact fails when they drift. Run status stops being a bare `"Running"` string in the module (`SandboxRunStates.Running`).
- **Decision (consequence of 6): `RepositoryRoot` collapses to the Aspire.Hosting copy.** `CSharpModule` currently walks up to `DigitalBrain.slnx` itself. The module loses that fallback and reads `SourceRoot` from options; `CSharpModuleHosting` projects the resolved root into the brain's environment (`DigitalBrain:Modules:csharp:Options:SourceRoot`). Hosts that are neither started by the AppHost nor given `WithSandbox(root)` get no `#:project` directives, which is already the session-pool behaviour. `CSharpFileNeuronFacts.AnUnsetSourceRootFallsBackToTheRepository` is replaced.
- **Not in scope, noticed:** `AspireSandboxRunner.EnsureSandboxAsync` polls up to four minutes inside the grain's `Start` turn (audit "State in process"); `ScriptEdge.Stamp` collapses per-run Compute allowances. Neither is touched; rule 7 forbids adding polling to make anything pass.

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`: `dotnet build <csproj>`, `dotnet test --project <test project directory>`.
- Grain state uses concrete arrays (`string[]`, `Subscription[]`), never `IReadOnlyList` or collection-expression wrappers.
- No self-calls on non-reentrant grains; signal-triggered work goes through `this.AsReference<T>()` one-way.
- No `/// <summary>` boilerplate; inline comments only for what code cannot say, and true.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; real grains, `FakeSandbox`, `RecordingCSharpFile`; no hand-rolled hosts.
- No state compatibility: reshape grain state and wire records freely, renumber `[Id]`s, no migrations, no legacy aliases.
- Never raise a timeout or add polling to make a check pass. New facts wait on signals the grain publishes (`brain.Observe<T>`), not on delays.
- LSP `findReferences` before every deletion; grep only for scripts, Dart, docs and csproj lines (and as the stated cross-check where LSP is blind). Diagnostics clean before building.
- The working tree has other people's uncommitted work. Every commit stages explicit paths (`git add <paths>`), never `-A` or `-a`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the ratified decisions imply that the headline facts would not catch. Each has a test in the owning task.

1. An acknowledgement with a stale watermark (below `Delivered`), a forged one (beyond what is pending) or one that races an overflow must neither throw nor trim signals the stream never saw. Task 2 (`AnAcknowledgementNeverTrimsPastWhatIsPendingOrBelowWhatWasDelivered`, `AnAcknowledgementOlderThanAnOverflowDoesNotDiscardTheNewestSignals`).
2. A hot swap must keep `Delivered` and `Dropped`, or a redelivery after the swap replays acknowledged signals. Task 5 (`SwappingKeepsTheWatermarkAndTheDropCount`).
3. A launch that throws must not lose the intent, and a token from an earlier run must stop speaking, for files with and without subscriptions. Task 5 (`AFailedLaunchKeepsTheIntentSoTheReconcileRetries`, `AStaleRunTokenStopsSpeakingAfterARestart`).
4. A name or scope that could reach another file's key (`../x`, `a/b`, `catalog`, a scope containing `/` or `:`) must be refused, and a file keyed under another brain must refuse the caller now that `Access` is key-derived. Task 4 (`CSharpFileKeysFacts`, `AFileKeyedUnderAnotherBrainRefusesTheCaller`).
5. Authoring off must hide both halves, tools and routes, while the script edge and the compile gate (`IScriptSandbox`) stay. Task 6 (`AuthoringOffHidesTheToolsAndTheRoutesButKeepsTheScriptEdge`).

## Caller sites (found before planning)

`LSP` = `csharp-ls findReferences`; `text` = text search cross-check because LSP returned nothing for that ring (see Findings). Line numbers are at the time of planning; the executor re-runs the search at the start of each task.

| Symbol | Sites | How |
|---|---|---|
| `ICSharpFile` (41 refs) | CSharp: `CSharpFileNeuron.cs:18`, `ScopedCSharpTools.cs:89,92`, `ScriptEdge.cs:61`, `CSharpAppBindingGuard.cs:9`, `CSharpFileView.cs:8`; tests: `AppBindingTestHost.cs:24`, `CSharpTriggerFacts.cs:92-100`, `CSharpSubscriptionFacts.cs` (6), `CSharpFileNeuronFacts.cs` (7), `ScriptSandboxFacts.cs:19`, `ContractDiscoveryFacts.cs:24`, `SynapseFacts.cs` (4), `ScriptEdgeFacts.cs` (12). Apps: `Runtimes/CSharpAppRuntime.cs` (Deploy, Swap, Retire), `tests/Support/RecordingCSharpFile.cs`. OS E2E: `CSharpFileContainerFacts.cs:48-51,101,120`, `ShippedSynapseFacts.cs:35-38` | LSP (CSharp), text (Apps, OS) |
| `ICSharpFile.Arm`, `CSharpTrigger`, `CSharpFileSnapshot.Trigger` | `ScopedCSharpTools.cs:40-45` (`csharp_arm`), `CSharpFileNeuron.cs` (`Arm`, `Fire`, `IsArmed`, `Trigger` in 12 places), `CSharpRegistryResources.cs:10-11`, `CSharpContractDiscovery.cs:30-33` (prompt text), `ScriptRunEnvironment.cs:27`; tests: `CSharpTriggerFacts.cs`, `CSharpSubscriptionFacts.cs:283-293`, `SynapseFacts.cs:49`, `ScriptEdgeFacts.cs:35`; Apps tests `RecordingCSharpFile.cs` (`Arm`); OS E2E `CSharpFileContainerFacts.cs:32,85`; Client `DigitalBrainConnection.cs:36` (`Trigger<T>`); Dart: none | text (no LSP hit on the record), Dart grep |
| `ICSharpFileEdge.DrainPending` (13 refs) | `ICSharpFileEdge.cs:16`, `CSharpFileNeuron.cs:23,223`, `ScriptEdge.cs:76`, `CSharpSubscriptionFacts.cs:33,34,65,83,101,105,123,124,140` | LSP |
| `CSharpCatalogStore.FileKey` (7 refs) | `CSharpCatalogStore.cs:16`, `ScopedCSharpTools.cs:92`, `CSharpInventoryProvider.cs:16`, `CSharpCatalogFacts.cs:18,22`, `InventoryFacts.cs:27` | LSP |
| `AppProgramKey.For` / `CSharpAppRuntime.FileKey` | `AppProgramKey.cs:11`, `CSharpAppRuntime.cs:14,22,37,57`, `AppNeuronFacts.cs:253-254`, OS E2E `ShippedSynapseFacts.cs:33` | text |
| `"e2e/…"` keys | OS E2E `CSharpFileContainerFacts.cs:48,49,51` | text |
| `specs/{app}/{guid}` key | only `Apps/Verification/TestScriptRunner.cs:25`, deleted by the Apps drop-tests commits; none remain | text |
| `CSharpAuthoringModule` / `CSharpAuthoringModuleHosting` / `AddCSharpAuthoring` (9 refs) | `CSharpAuthoringModule.cs:8`, `CSharpAuthoringModuleHosting.cs:5`, `CSharpAuthoringHosting.cs`, tests `AuthoringCompositionFacts.cs:13`, `InventoryFacts.cs:13`, `CSharpCatalogFacts.cs:28,46,59`, `CSharpCompositionFacts.cs:16`, `CSharpRouteFacts.cs:50`; OsCatalog `OsCatalog.cs:23`; AppHost `AppHost.cs:55-56`; `Framework.Tests.Unit/ModuleIdFacts.cs:8` uses the string `"csharp-authoring"` only as a sample id | LSP (CSharp), text (OS, AppHost) |
| `CSharpSandbox` (13 refs) | `CSharpSandbox.cs:3`, `FakeAspire.cs:19`, `CSharpDirectives.cs:21`, `CSharpModuleHosting.cs:20-26`, `AspireSandboxRunner.cs:54,57,66,80,97`, `CSharpDeployment.cs:90`, OS E2E `CSharpFileContainerFacts.cs:73` | LSP + text |
| `CSharpModule.FindRepositoryRoot` / `RepositoryRoot.Find` | `CSharpModule.cs:25,58`, `CSharpFileNeuronFacts.cs:176`; `CSharpModuleHosting.cs:18`, `RepositoryRoot.cs`. (OS/Architecture/Flutter tests have their own private copies; not CSharp's, untouched.) | LSP |
| `CSharpDeploymentSettings` | Assistant tests `InventoryFacts.cs:68`; hosting/deployment/runner/env in CSharp | text |
| `OsCatalog` module list, AppHost hosting list | `OsCatalog.cs:23-24`, `AppHost.cs:55-56`; `OS.Tests.Unit/ProductCompositionFacts.cs` (`EveryReferencedHostingAdapterBelongsToACatalogModule`) | text |
| Dart `shell/lib/workspace/csharp/csharp_manager.dart` | reads only `status`, `exitCode`, `startedAt` from the file JSON (`csharp_manager.dart:24-40,292`, `csharp_detail.dart:141`); the JSON changes (drops `trigger`, subscription views gain `delivered`/`dropped`) touch none of them. No Dart change; verified by `grep -n "trigger\|subscriptions\|pending"` over `shell/lib/workspace/csharp` (no hits). | text |

## File structure after the plan

Contracts (`DigitalBrain.Modules.Microsoft.CSharp.Contracts`; references only `DigitalBrain`):

```
Files/ICSharpFile.cs                 Inspect, Write, Configure, Start, Swap, Stop, Delete, ReadLogs
Files/CSharpFileSnapshot.cs          CSharpFileStatus, CSharpFileSnapshot, CSharpSubscriptionView(Neuron, Signal, Pending, Delivered, Dropped)
Files/CSharpFileKeys.cs              For(scope, name)
Files/ICSharpAppBinding.cs
Files/Signals/CSharpFileChanged.cs
Catalog/IContractVocabulary.cs       unchanged content
```

Module (`DigitalBrain.Modules.Microsoft.CSharp`):

```
CSharpModule.cs                      registrations, Connector, options-gated authoring
Configuration/CSharpOptions.cs       SourceRoot, AspireApplication, MaximumPending, Authoring; CSharpDeploymentSettings (root namespace)
Files/CSharpFileNeuron.cs            the grain: one run shape, one reconcile path
Files/CSharpFileState.cs             Program, Settings, Subscriptions, Run, AppId, AppBrain; RunRecord
Files/Subscription.cs                Subscription(Neuron, Signal, Pending, Delivered, Dropped) + Arrive / Acknowledge
Files/ICSharpFileArrivals.cs         one-way self-reference
Files/CSharpFileActivation.cs, CSharpAppBindingGuard.cs
Files/Signals/CSharpPendingArrived.cs   internal doorbell
Catalog/CSharpCatalogNeuron.cs, CSharpCatalogStore.cs, ICSharpCatalog.cs      file descriptions
Catalog/ContractVocabulary.cs, CSharpContractDiscovery.cs, CSharpDirectives.cs, CSharpScriptCheck.cs
Edge/ScriptEdge.cs, ScriptEdgeEndpoints.cs, ICSharpFileEdge.cs (+ RunAuthorization, PendingBatch), RunTokens.cs, ScriptContracts.cs, ScriptRunEnvironment.cs
Sandbox/CSharpSandbox.cs             hosting constants
Sandbox/ICSharpRunner.cs, AspireSandboxRunner.cs, SessionPoolRunner.cs, SandboxRunsApi.cs, SandboxWire.cs (the module's one copy of the DTOs), CSharpRunState.cs
Authoring/ScopedCSharpTools.cs, CSharpToolService.cs, CSharpAgentTools.cs, CSharpAuthoringEndpoints.cs, CSharpScriptSandbox.cs, CSharpFileView.cs, WriteCSharpFileRequest.cs, CSharpInventoryProvider.cs, CSharpRegistryResources.cs
```

Deleted by the end: `CSharpAuthoringModule.cs`, `Authoring/CSharpAuthoringHosting.cs`, `CSharpAuthoringModuleHosting.cs`, `CSharpTrigger.cs`, `ICSharpFileTrigger.cs`, `ScriptSubscription.cs` (becomes `Subscription.cs`), `Execution/SandboxMessages.cs` (becomes `Sandbox/SandboxWire.cs`), `Contracts/Execution/CSharpSandbox.cs`, `CSharpModule.FindRepositoryRoot`.

Namespaces after Task 8: `DigitalBrain.Microsoft.CSharp.Files`, `.Files.Signals`, `.Catalog`, `.Edge`, `.Sandbox`, `.Authoring`; `CSharpModule`, `CSharpOptions`, `CSharpDeploymentSettings` stay in `DigitalBrain.Microsoft.CSharp`.

## Build and test matrix

Projects (paths relative to the repo root):

| Short | Path |
|---|---|
| Contracts | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/DigitalBrain.Modules.Microsoft.CSharp.Contracts.csproj` |
| Module | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj` |
| Hosting | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting/DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting.csproj` |
| Deployment | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/DigitalBrain.Modules.Microsoft.CSharp.Deployment.csproj` |
| Sandbox | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/DigitalBrain.Modules.Microsoft.CSharp.Sandbox.csproj` |
| CSharp.Tests | `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests` |
| Client / Client.Tests | `src/DigitalBrain.Client/DigitalBrain.Client/DigitalBrain.Client.csproj` / `src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit` |
| Apps / Apps.Tests | `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj` / `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` |
| Assistant.Tests | `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests` |
| OS | `src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` |
| OS.Unit / OS.E2E | `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` / `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` |
| AppHost | `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` |
| Architecture.Tests | `src/Testing/DigitalBrain.Architecture.Tests` |

**Ring build** (run at the end of every task; every project must report `0 Error(s)`). Run `dotnet build-server shutdown` first if an `MSB3021` lock appears; a lock is not a pass and not a failure of the change:

```bash
for p in \
  src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/DigitalBrain.Modules.Microsoft.CSharp.Contracts.csproj \
  src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj \
  src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting/DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting.csproj \
  src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/DigitalBrain.Modules.Microsoft.CSharp.Deployment.csproj \
  src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/DigitalBrain.Modules.Microsoft.CSharp.Sandbox.csproj \
  src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj \
  src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit/DigitalBrain.Client.Tests.Unit.csproj \
  src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj \
  src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/DigitalBrain.Modules.Assistant.Tests.csproj \
  src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj \
  src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj \
  src/Testing/DigitalBrain.Architecture.Tests/DigitalBrain.Architecture.Tests.csproj \
  src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj; do
  echo "=== $p"; dotnet build "$p" 2>&1 | grep -E "error|Error\(s\)" | sed 's/\[.*//' | sort -u | head -8
done
```

Test commands (run the ones a task names; the closing regression net is CSharp.Tests, Apps.Tests, OS.Unit, Architecture.Tests, Client.Tests, Assistant.Tests):

```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*SentenceName*"
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
```

OS.E2E needs Docker and Linux containers; it is compiled in every task's ring build and run only in Task 9.

Task order keeps every project green at every commit: Task 1 (tests compile) → Task 2 (durable delivery, additive plus the `DrainPending` return type) → Task 3 (trigger surface deleted) → Task 4 (one key, `Access` key-derived) → Task 5 (one run shape) → Task 6 (one module) → Task 7 (connector) → Task 8 (layout and namespaces) → Task 9 (seen running).

---

### Task 1: Make the CSharp tests compile and take the baselines

**Files:**
- Modify: `tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpFileNeuronFacts.cs:26-36`
- Modify: `tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpSubscriptionFacts.cs:330`
- Modify: `tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/ScriptEdgeFacts.cs:380-392`
- Rename + rewrite: `tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SynapseFacts.cs` → `CSharpFileSnapshotFacts.cs`

**Interfaces:**
- Consumes: `ICSharpFile`, `CSharpFileSnapshot`, `CSharpSubscriptionView(Neuron, Signal, Pending)`, `CSharpFileChanged(FileId)`.
- Produces: a compiling, green CSharp.Tests; recorded baseline counts for every project in the regression net.

- [ ] **Step 1: Confirm the failure**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep -c "error CS"`
Expected: `24` lines of `error CS` (12 distinct errors, reported twice); sources `ISynapse`, `SynapseChanged`, `SynapseWatch`, `Alive`, `Watches`, `Read`, `Program`.

- [ ] **Step 2: Rewrite the synapse-vocabulary facts in the file's own vocabulary**

`git mv tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SynapseFacts.cs tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpFileSnapshotFacts.cs`, then replace the content:

```csharp
using DigitalBrain.Microsoft.CSharp;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

public sealed class CSharpFileSnapshotFacts
{
    [Fact]
    public async Task AStartedFileRunsAndListsOneSubscriptionPerStreamedSubscription()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var file = brain.Get<ICSharpFile>("workspace/files/running");
        await file.Write("Console.WriteLine(1);", ct);
        var started = await file.Start(ct);
        Assert.Equal(CSharpFileStatus.Running, started.Status);
        Assert.Empty(started.Subscriptions);

        var pinger = brain.Get<IPinger>("pinger").GetGrainId().ToString();
        await file.AsReference<ICSharpFileEdge>().Subscribed(sandbox.LatestRunId, pinger, nameof(Pinged));

        var inspected = await file.Inspect(ct);
        Assert.Equal([new CSharpSubscriptionView(pinger, nameof(Pinged), 0)], inspected.Subscriptions);
        Assert.Equal("Console.WriteLine(1);", inspected.Source);
    }

    [Fact]
    public async Task AStoppedFileKeepsItsSourceAndIsNoLongerWanted()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await SandboxBrain.StartAsync(new FakeSandbox(), ct);
        var file = brain.Get<ICSharpFile>("workspace/files/stopped");
        await file.Write("Console.WriteLine(2);", ct);
        await file.Start(ct);

        var stopped = await file.Stop(ct);

        Assert.False(stopped.ShouldRun);
        Assert.Equal("Console.WriteLine(2);", stopped.Source);
    }

    [Fact]
    public async Task CSharpFileChangedIsPublishedOnWriteStartStopAndDelete()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await SandboxBrain.StartAsync(new FakeSandbox(), ct);
        var file = brain.Get<ICSharpFile>("workspace/files/changes");
        await using var changes = await brain.Observe<CSharpFileChanged>(file, ct);
        await file.Write("Console.WriteLine(4);", ct);
        await file.Start(ct);
        await file.Stop(ct);
        await file.Delete(ct);
        for (var i = 0; i < 4; i++) { Assert.Equal("workspace/files/changes", (await changes.NextAsync(ct: ct)).FileId); }
    }
}
```

The armed-file fact of the old `SynapseFacts` is dropped: `Arm` is deleted in Task 3 and the capability it asserted goes with it.

- [ ] **Step 3: Fix the three remaining sites**

`CSharpFileNeuronFacts.cs:26` and `:36`: `Observe<SynapseChanged>` → `Observe<CSharpFileChanged>`, `.SynapseId` → `.FileId`.

`CSharpSubscriptionFacts.cs:330`: `nameof(SynapseChanged)` → `nameof(CSharpFileChanged)`.

`ScriptEdgeFacts.cs:380-392`: replace the fact that called `ISynapse.Read` with:

```csharp
    [Fact]
    public async Task AScriptCanCallInspectOnTheCSharpFile()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct, silo => silo.Services.AddSingleton(new ScriptContracts([typeof(IPinger).Assembly, typeof(ICSharpFile).Assembly])));
        const string fileId = "workspace/files/edge-inspect";
        var token = await StartAsAlice(brain, sandbox, fileId, ct);
        var edge = brain.SiloServices.GetRequiredService<ScriptEdge>();
        var inspected = await edge.InvokeAsync(token, (typeof(ICSharpFile).FullName!, fileId, nameof(ICSharpFile.Inspect), []), ct);
        Assert.True(inspected!.Value.TryGetProperty("status", out _));
    }
```

- [ ] **Step 4: Build and run the whole CSharp suite**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`
Expected: all pass. Write the `total/failed/succeeded` line into the commit message body. If something fails that is not a stale-vocabulary remnant, stop and report it; do not edit the failing production code in this task.

- [ ] **Step 5: Take the baselines for the regression net**

Run each of: Apps.Tests, OS.Unit, Architecture.Tests, Client.Tests, Assistant.Tests (commands above) and record `total/failed` for each next to the CSharp number in the commit body. Run the Ring build once. Any pre-existing red is recorded as such in the commit body and listed in the final report; it is not "fixed" here.

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp/tests
git commit -m "CSharp tests: drop the synapse vocabulary the module no longer has

SynapseFacts becomes CSharpFileSnapshotFacts in ICSharpFile terms; baselines: <paste the counts>

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Durable at-least-once subscriptions

**Files:**
- Rename: `Files/ScriptSubscription.cs` → `Files/Subscription.cs` (keeps `CSharpPendingArrived` at the bottom until Task 8)
- Modify: `Files/CSharpFileState.cs` (`Subscriptions` type), `Files/CSharpFileNeuron.cs` (`Enqueue`, `DrainPending`, new `Acknowledge`, `Describe`, injected options, `MaximumPending` const removed)
- Modify: `Edge/ICSharpFileEdge.cs` (`DrainPending` returns `PendingBatch`, new `Acknowledge`, `PendingBatch` record), `Edge/ScriptEdge.cs` (`Draining` acknowledges)
- Modify: `Configuration/CSharpOptions.cs` (`MaximumPending`), Contracts `CSharpFileSnapshot.cs` (`CSharpSubscriptionView` gains `Delivered`, `Dropped`)
- Test: `tests/…/CSharpSubscriptionFacts.cs`, `tests/…/ScriptEdgeFacts.cs`, `tests/…/CSharpFileSnapshotFacts.cs`

**Interfaces:**
- Consumes: `Neuron<TState>.Save(next, changed, acted)`, `ScriptEdgeProtocol.Json`, `brain.Observe<T>`.
- Produces (later tasks rely on these exact shapes):
  - `internal sealed record Subscription(string Neuron, string Signal, string[] Pending, long Delivered, long Dropped)` with `long Watermark => Delivered + Pending.Length`, `Subscription Arrive(string json, int cap)`, `Subscription Acknowledge(long watermark)`.
  - `internal sealed record PendingBatch(string[] Signals, long Watermark)`.
  - `ICSharpFileEdge`: `Task<PendingBatch> DrainPending(string runId, string neuron, string signal)`, `Task Acknowledge(string runId, string neuron, string signal, long watermark)`.
  - `CSharpOptions.MaximumPending` (default 64, validated ≥ 1).
  - `CSharpSubscriptionView(string Neuron, string Signal, int Pending, long Delivered, long Dropped)`.

Sequence arithmetic: `Pending[i]` is signal number `Delivered + 1 + i`. A drain's watermark is the number of its last signal. `Acknowledge(w)` removes `clamp(w - Delivered, 0, Pending.Length)` signals from the front and adds that to `Delivered`. `Arrive` past the cap removes the oldest, adds one to `Delivered` and one to `Dropped`.

- [ ] **Step 1: Write the failing facts**

Add to `CSharpSubscriptionFacts.cs` (the new helper `Arrivals` is private to the class; `CSharpPendingArrived` is internal and visible through `InternalsVisibleTo`):

```csharp
    [Fact]
    public async Task DrainingDoesNotClearUntilTheBatchIsAcknowledged()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/acknowledging", pinger, ct);
        var edge = file.AsReference<ICSharpFileEdge>();
        var source = pinger.GetGrainId().ToString();
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        await pinger.Ping(1);
        await pinger.Ping(2);
        await Arrivals(arrivals, 2, ct);

        var first = await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged));
        var again = await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged));

        Assert.Equal(2, first.Signals.Length);
        Assert.Equal(2, first.Watermark);
        Assert.Equal(first.Signals, again.Signals);

        await edge.Acknowledge(sandbox.LatestRunId, source, nameof(Pinged), first.Watermark);

        Assert.Empty((await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged))).Signals);
        var view = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((0, 2L, 0L), (view.Pending, view.Delivered, view.Dropped));
    }

    [Fact]
    public async Task AnAcknowledgementNeverTrimsPastWhatIsPendingOrBelowWhatWasDelivered()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/clamped", pinger, ct);
        var edge = file.AsReference<ICSharpFileEdge>();
        var source = pinger.GetGrainId().ToString();
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        for (var number = 1; number <= 3; number++) { await pinger.Ping(number); }
        await Arrivals(arrivals, 3, ct);

        await edge.Acknowledge(sandbox.LatestRunId, source, nameof(Pinged), 1);
        var afterOne = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((2, 1L), (afterOne.Pending, afterOne.Delivered));

        await edge.Acknowledge(sandbox.LatestRunId, source, nameof(Pinged), 0);   // stale: nothing to do
        Assert.Equal(2, Assert.Single((await file.Inspect(ct)).Subscriptions).Pending);

        await edge.Acknowledge(sandbox.LatestRunId, source, nameof(Pinged), 99);  // forged: only what exists
        var settled = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((0, 3L), (settled.Pending, settled.Delivered));
    }

    [Fact]
    public async Task OverflowPastTheCapCountsTheDropAndPublishesFileChangedWhileTheCapItselfDropsNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct, silo => silo.Services.PostConfigure<CSharpOptions>(options => options.MaximumPending = 3));
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/overflowing", pinger, ct);
        var edge = file.AsReference<ICSharpFileEdge>();
        var source = pinger.GetGrainId().ToString();
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        await using var changes = await brain.Observe<CSharpFileChanged>(file, ct);

        for (var number = 1; number <= 3; number++) { await pinger.Ping(number); }
        await Arrivals(arrivals, 3, ct);
        var atCap = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((3, 0L, 0L), (atCap.Pending, atCap.Delivered, atCap.Dropped));   // nothing is dropped below the cap

        await pinger.Ping(4);
        await Arrivals(arrivals, 1, ct);

        Assert.Equal("workspace/overflowing", (await changes.NextAsync(ct: ct)).FileId);   // the overflow is a published fact
        var overflowed = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((3, 1L, 1L), (overflowed.Pending, overflowed.Delivered, overflowed.Dropped));
        var batch = await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged));
        Assert.Equal(4, batch.Watermark);
        Assert.Equal(["""{"number":2}""", """{"number":3}""", """{"number":4}"""], batch.Signals);
    }

    [Fact]
    public async Task AnAcknowledgementOlderThanAnOverflowDoesNotDiscardTheNewestSignals()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct, silo => silo.Services.PostConfigure<CSharpOptions>(options => options.MaximumPending = 3));
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/racing", pinger, ct);
        var edge = file.AsReference<ICSharpFileEdge>();
        var source = pinger.GetGrainId().ToString();
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        for (var number = 1; number <= 3; number++) { await pinger.Ping(number); }
        await Arrivals(arrivals, 3, ct);
        var inFlight = await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged));   // 1..3, watermark 3

        await pinger.Ping(4);                                                                 // drops 1
        await Arrivals(arrivals, 1, ct);
        await edge.Acknowledge(sandbox.LatestRunId, source, nameof(Pinged), inFlight.Watermark);

        var view = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((1, 3L, 1L), (view.Pending, view.Delivered, view.Dropped));
        Assert.Equal(["""{"number":4}"""], (await edge.DrainPending(sandbox.LatestRunId, source, nameof(Pinged))).Signals);
    }

    [Fact]
    public void TheCapIsAnOptionThatMustBeAtLeastOne()
    {
        Assert.Equal(64, new CSharpOptions().MaximumPending);
        Assert.Throws<ArgumentOutOfRangeException>(() => new CSharpOptions { MaximumPending = 0 }.Validate());
    }

    private static async Task Arrivals<T>(SignalProbe<T> probe, int count, CancellationToken ct) where T : Signal
    {
        for (var i = 0; i < count; i++) { await probe.NextAsync(ct: ct); }
    }
```

(`SignalProbe<T>` is what `brain.Observe<T>` returns, from `DigitalBrain.Testing`; add the using if the test file lacks it.)

Add to `ScriptEdgeFacts.cs`:

```csharp
    [Fact]
    public async Task ABatchWhoseEdgeDiedMidwayIsRedeliveredAfterReconnectUntilItIsAcknowledged()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await Brain(sandbox, ct);
        var edge = brain.SiloServices.GetRequiredService<ScriptEdge>();
        const string fileId = "workspace-a/redelivery";
        var token = await StartAsAlice(brain, sandbox, fileId, ct);
        var file = brain.Get<ICSharpFile>(fileId);
        var pinger = brain.Get<IPinger>("pinger");
        var contract = typeof(IPinger).FullName!;

        using var dying = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var firstConnection = await edge.OpenSignalsAsync(token, contract, "pinger", nameof(Pinged), dying.Token);
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        await pinger.Ping(1);
        await pinger.Ping(2);
        await arrivals.NextAsync(ct: ct);
        await arrivals.NextAsync(ct: ct);
        await using (var first = firstConnection.GetAsyncEnumerator(dying.Token))
        {
            // The connection dies after one signal of a two-signal batch was handed on.
            Assert.Equal(["""{"number":1}"""], await ReadAsync(first, 1, ct));
        }
        await dying.CancelAsync();
        Assert.Equal(2, Assert.Single((await file.Inspect(ct)).Subscriptions).Pending);

        using var live = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var secondConnection = await edge.OpenSignalsAsync(token, contract, "pinger", nameof(Pinged), live.Token);
        await using var second = secondConnection.GetAsyncEnumerator(live.Token);
        Assert.Equal(["""{"number":1}""", """{"number":2}"""], await ReadAsync(second, 2, ct));

        // Asking for more is what hands the batch over: the edge acknowledges, publishing CSharpFileChanged.
        await using var changes = await brain.Observe<CSharpFileChanged>(file, ct);
        var more = second.MoveNextAsync().AsTask();
        await changes.NextAsync(ct: ct);
        var view = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((0, 2L), (view.Pending, view.Delivered));
        await live.CancelAsync();
        try { await more; } catch (OperationCanceledException) { }
    }

    private static async Task<string[]> ReadAsync(IAsyncEnumerator<string> stream, int count, CancellationToken ct)
    {
        var items = new List<string>();
        while (items.Count < count && await stream.MoveNextAsync()) { items.Add(stream.Current); }
        return [.. items];
    }
```

Update the existing facts for the new return type (LSP `findReferences` on `ICSharpFileEdge.DrainPending` lists every site): `drained.Count` → `drained.Signals.Length`, `drained[0]` → `drained.Signals[0]`, `Assert.Single(await edge.DrainPending(...))` → `Assert.Single((await edge.DrainPending(...)).Signals)`, `Assert.Empty(await edge.DrainPending(...))` → `Assert.Empty((await edge.DrainPending(...)).Signals)`, `is { Count: > 0 }` → `is { Signals.Length: > 0 }`. Delete `PendingSignalsAreBoundedAndTheOldestAreDropped` (it referenced `CSharpFileNeuron.MaximumPending` and drops silently; the two overflow facts above replace it). In `CSharpFileSnapshotFacts` the expected view becomes `new CSharpSubscriptionView(pinger, nameof(Pinged), 0, 0, 0)`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep -E "error CS" | sed 's/\[.*//' | sort -u`
Expected: errors for `PendingBatch`, `Acknowledge`, `Signals`, `MaximumPending`, `Delivered`, `Dropped` not existing.

- [ ] **Step 3: Implement the state, the contract and the edge**

`Files/Subscription.cs` (replaces `ScriptSubscription.cs`; keep `CSharpPendingArrived` at the bottom):

```csharp
using DigitalBrain;
using DigitalBrain.Framework;

namespace DigitalBrain.Microsoft.CSharp;

// One durable subscription a script declared by opening a signal stream. Pending[i] is signal number
// Delivered + 1 + i: delivery is at-least-once, so a batch stays here until it is acknowledged and a
// drain whose consumer died is simply drained again. Past the cap the oldest signal is dropped and
// counted, never silently. Arrays, not interface lists: grain storage round-trips this state through JSON.
[GenerateSerializer, Alias("microsoft.csharp.subscription")]
internal sealed record Subscription(
    [property: Id(0)] string Neuron,
    [property: Id(1)] string Signal,
    [property: Id(2)] string[] Pending,
    [property: Id(3)] long Delivered,
    [property: Id(4)] long Dropped)
{
    public long Watermark => Delivered + Pending.Length;

    public Subscription Arrive(string json, int cap)
        => Pending.Length < cap
            ? this with { Pending = [.. Pending, json] }
            : this with { Pending = [.. Pending.Skip(1), json], Delivered = Delivered + 1, Dropped = Dropped + 1 };

    public Subscription Acknowledge(long watermark)
    {
        var trim = (int)Math.Clamp(watermark - Delivered, 0, Pending.Length);
        return trim == 0 ? this : this with { Pending = Pending[trim..], Delivered = Delivered + trim };
    }
}

[GenerateSerializer, Alias("microsoft.csharp.pending-arrived")]
internal sealed record CSharpPendingArrived([property: Id(0)] string FileId) : Signal;
```

`Edge/ICSharpFileEdge.cs`:

```csharp
[GenerateSerializer, Alias("microsoft.csharp.pending-batch")]
internal sealed record PendingBatch([property: Id(0)] string[] Signals, [property: Id(1)] long Watermark);

// ... in the interface:
    Task<PendingBatch> DrainPending(string runId, string neuron, string signal);
    Task Acknowledge(string runId, string neuron, string signal, long watermark);
```

`Files/CSharpFileState.cs`: `[Id(8)] public Subscription[] Subscriptions { get; init; } = [];`.

`Configuration/CSharpOptions.cs`:

```csharp
    // Signals buffered per subscription while nothing drains; past it the oldest is dropped and counted.
    public int MaximumPending { get; set; } = 64;
    ...
    public void Validate()
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(AspireApplication);
        ArgumentOutOfRangeException.ThrowIfLessThan(MaximumPending, 1);
    }
```

Contracts `CSharpFileSnapshot.cs`: `CSharpSubscriptionView` gains `[property: Id(3)] long Delivered, [property: Id(4)] long Dropped`.

`Files/CSharpFileNeuron.cs`: add `IOptions<CSharpOptions> options` to the primary constructor (`using Microsoft.Extensions.Options;`), delete `internal const int MaximumPending = 64;`, add `nameof(ICSharpFileEdge.Acknowledge)` to the public-operation list in `Access`, and replace `Enqueue`, `DrainPending`, `Describe`'s view and add `Acknowledge`:

```csharp
    // Buffers the signal on the subscription it matches, then wakes a run to drain it.
    public async Task Enqueue(Signal signal)
    {
        var json = JsonSerializer.Serialize(signal, signal.GetType(), ScriptEdgeProtocol.Json);
        var name = signal.GetType().Name;
        var cap = options.Value.MaximumPending;
        var matched = false;
        var overflowed = false;
        var next = Snapshot.Subscriptions.Select(s =>
        {
            if (s.Signal != name || s.Neuron != signal.Publisher.Name) { return s; }
            matched = true;
            var arrived = s.Arrive(json, cap);
            overflowed |= arrived.Dropped > s.Dropped;
            return arrived;
        }).ToArray();
        if (!matched) { return; }
        // The arrival rings the doorbell; an overflow is also a durable change subscribers can see.
        await Save(Snapshot with { Subscriptions = next }, new CSharpPendingArrived(FileId), overflowed ? new CSharpFileChanged(FileId) : null);
        await WakeAsync();
    }

    public async Task<PendingBatch> DrainPending(string runId, string neuron, string signal)
    {
        await RequireSpeakingRun(runId);
        var subscription = Snapshot.Subscriptions.FirstOrDefault(s => s.Neuron == neuron && s.Signal == signal);
        return subscription is null ? new([], 0) : new(subscription.Pending, subscription.Watermark);
    }

    public async Task Acknowledge(string runId, string neuron, string signal, long watermark)
    {
        await RequireSpeakingRun(runId);
        var subscription = Snapshot.Subscriptions.FirstOrDefault(s => s.Neuron == neuron && s.Signal == signal);
        if (subscription is null) { return; }
        var trimmed = subscription.Acknowledge(watermark);
        if (trimmed.Delivered == subscription.Delivered) { return; }
        await Save(Snapshot with
        {
            Subscriptions = Snapshot.Subscriptions.Select(s => s == subscription ? trimmed : s).ToArray(),
        }, new CSharpFileChanged(FileId));
    }
```

`Describe`: `.Select(s => new CSharpSubscriptionView(s.Neuron, s.Signal, s.Pending.Length, s.Delivered, s.Dropped))`. Every other use of `ScriptSubscription` becomes `Subscription` (LSP `findReferences` lists them; `Subscribed` builds `new(neuron, signal, [], 0, 0)`).

`Edge/ScriptEdge.cs`, in `Draining`, replace the drain line:

```csharp
                var batch = await file.DrainPending(run, neuron, signal).ConfigureAwait(false);
                foreach (var json in batch.Signals) { yield return json; }
                // Resuming here means the consumer asked for more: every signal of the batch reached the stream.
                // A connection that dies mid-batch never gets here, so the whole batch is drained again.
                if (batch.Signals.Length > 0) { await file.Acknowledge(run, neuron, signal, batch.Watermark).ConfigureAwait(false); }
```

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`
Expected: all pass, including the six new facts. Then the Ring build: `0 Error(s)` everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp
git commit -m "CSharp: a drained batch stays until it is acknowledged; overflow is counted and published

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Armed is subscribed — delete the trigger surface

**Files:**
- Modify: Contracts `ICSharpFile.cs` (remove `Arm`), `CSharpFileSnapshot.cs` (remove `Trigger`; `Subscriptions` becomes `[Id(8)]`)
- Delete: Contracts `CSharpTrigger.cs`
- Modify: `Files/CSharpFileNeuron.cs`, `Files/ICSharpFileTrigger.cs` (only `Enqueue` stays), `Authoring/ScopedCSharpTools.cs`, `CSharpRegistryResources.cs`, `Catalog/CSharpContractDiscovery.cs`, `Execution/ScriptRunEnvironment.cs`
- Modify: Client `DigitalBrain.Client/DigitalBrainConnection.cs` (delete `Trigger<T>`)
- Modify: Apps tests `Support/RecordingCSharpFile.cs` (delete `Arm`); OS E2E `CSharpFileContainerFacts.cs` (delete the triggered scenario)
- Delete: `tests/…/CSharpTriggerFacts.cs`; delete `AnArmedFileIgnoresSameTypedSignalsFromOtherWatchedSources` in `CSharpSubscriptionFacts.cs`; delete the `file.Arm(...)` line in `ScriptEdgeFacts.cs:35`
- Test: `tests/…/CSharpSubscriptionFacts.cs`

**Interfaces:**
- Consumes: Task 2's `Subscription`, `PendingBatch`.
- Produces: `ICSharpFile` without `Arm`; `CSharpFileSnapshot(Id, Source, Settings, Status, ExitCode, StartedAt, ShouldRun, Failures) { Subscriptions }`; `ScriptRunEnvironment.Create(fileId, runId, settings)` (no trigger parameter); a neuron whose only modes are "always-on" and "subscribed" (collapsed in Task 5).

- [ ] **Step 1: Re-map with LSP and text before deleting anything**

Run LSP `findReferences` on `ICSharpFile.Arm`, `CSharpTrigger` and `CSharpFileSnapshot.Trigger`; text-search `CSharpFile__Trigger`, `CSharpFile:Trigger`, `csharp_arm`, `.Trigger<` and the Dart folder (`grep -rn "trigger\|subscriptions\|pending" src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/csharp`). Compare with the caller table; a site not in the table stops the task.

- [ ] **Step 2: Write the failing fact**

Add to `CSharpSubscriptionFacts.cs`:

```csharp
    [Fact]
    public async Task AWakeRunIsNotToldWhichSignalWokeItBecauseTheStreamCarriesIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/untriggered", pinger, ct);
        sandbox.ExitLatest(0);
        await Reconcile(file);

        await pinger.Ping(1);
        await Eventually(() => sandbox.Started == 2, ct);

        var wake = sandbox.Requests.Where(FakeSandbox.IsStart).Last();
        Assert.Null(wake.Body!["environment"]!["CSharpFile__Trigger"]);
        Assert.Equal(1, Assert.Single((await file.Inspect(ct)).Subscriptions).Pending);   // the signal waits for the stream, not the environment
    }
```

This fact passes today because wake-runs already carry no trigger; it stays red-then-green only as a guard. The compile-level failure that drives Step 3 is the removal itself: delete `Arm` from `ICSharpFile` first, then the build errors list every remaining site.

- [ ] **Step 3: Delete the surface**

Contracts: remove `Arm` and its comment from `ICSharpFile`; delete `CSharpTrigger.cs`; in `CSharpFileSnapshot` drop `[property: Id(8)] CSharpTrigger? Trigger` and renumber `Subscriptions` to `[Id(8)]`.

`CSharpFileNeuron.cs`: delete `Arm`, `Fire`, `IsArmed`, the `Trigger` field reads, and `ICSharpFileTrigger.Fire`; the surviving shapes are:

```csharp
    Task INeuronObserver.OnSignalAsync(Signal signal)
        => Snapshot.Subscriptions.Any(s => s.Signal == signal.GetType().Name && s.Neuron == signal.Publisher.Name)
            ? this.AsReference<ICSharpFileTrigger>().Enqueue(signal)
            : Task.CompletedTask;

    internal void ResumeWatches()
    {
        if (Snapshot.Subscriptions.Length > 0) { RenewSourceWatches(dueTime: TimeSpan.Zero); }
    }
```

In `ReceiveReminder` delete the `Snapshot.Trigger is not null` branch; in `RenewSourceWatches` delete the `Trigger` watch; in `Authorize` the condition becomes `runId == Snapshot.RunId || (Snapshot.AppId is null && Snapshot.Subscriptions.Length > 0)`; `Describe` drops `Snapshot.Trigger` and its `Trigger: null` pattern; `Start`/`Swap`/`Stop`/`BindApp` stop assigning `Trigger`; `StartRunAsync(next, Signal? trigger, ct)` becomes `StartRunAsync(next, ct)` and calls `environment.Create(FileId, runId, next.Settings)`. `ICSharpFileTrigger` keeps only `[OneWay] Task Enqueue(Signal signal);`.

`ScriptRunEnvironment.Create(string fileId, string runId, IReadOnlyDictionary<string, string> settings)`: delete the `Signal? trigger` parameter, the `CSharpFile__Trigger` line, and the `System.Text.Json` using if unused.

`ScopedCSharpTools.cs`: delete the `csharp_arm` method (lines 40-46). `CSharpRegistryResources.cs`: drop `csharp_arm` from the tool list and replace the sentence "csharp_arm installs a signal trigger." with "A file that subscribes with brain.On<T> is woken by the signals it subscribed to." `CSharpContractDiscovery.cs`: replace the three comment lines about arming with `// A file that subscribes with brain.On<T>() is woken by each signal that arrives while it is not running.` (the example keeps its `await foreach (var tick in brain.On<TimerTick>(...))`).

Client `DigitalBrainConnection.cs:36`: delete `Trigger<T>()` and, if nothing else uses it, the `Configuration["CSharpFile:Trigger"]` plumbing it read.

Apps tests `RecordingCSharpFile.cs`: delete `Arm`. OS E2E `CSharpFileContainerFacts.cs`: delete `TriggeredSource`, `triggerTimerId`, `triggered`, the "armed file" block and its `Delete`; keep the rest of the scenario. Delete `CSharpTriggerFacts.cs` (its behaviours are covered by `FailingWakeRunsClearTheSubscriptionsAndDisarm`, `StoppingClearsSubscriptionsAndNothingWakes`, `ASubscribedFileStillWakesAfterItsActivationIsCollected`), `AnArmedFileIgnoresSameTypedSignalsFromOtherWatchedSources`, and the `Arm` line in `ScriptEdgeFacts.cs:35`.

- [ ] **Step 4: Build clean, then test**

LSP diagnostics clean on the touched files, then the Ring build (`0 Error(s)` everywhere, including Apps.Tests and OS.E2E which compile `RecordingCSharpFile` and the scenario), then:

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`, `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit`, `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: all pass; counts are the Task 1 baselines minus the deleted facts (list the deleted facts in the commit body).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp src/DigitalBrain.Client src/DigitalBrain.Modules/DigitalBrain/Apps/tests src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
git commit -m "CSharp: armed is subscribed; Arm, CSharpTrigger, csharp_arm and brain.Trigger<T> are gone

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One key — `{brainScope}/csharp/{name}`

**Files:**
- Create: Contracts `CSharpFileKeys.cs`; test `tests/…/CSharpFileKeysFacts.cs`
- Modify: `Authoring/CSharpCatalogStore.cs` (delete `FileKey`, keep `ValidateFileId` for descriptions), `Authoring/ScopedCSharpTools.cs:92`, `CSharpInventoryProvider.cs:16`, `Files/CSharpFileNeuron.cs` (`Access`; `Write` stops capturing the owner)
- Modify: Apps `Runtimes/AppProgramKey.cs`, `Runtimes/CSharpAppRuntime.cs`; Apps tests `Apps/AppNeuronFacts.cs:253-254`
- Modify: OS E2E `CSharpFileContainerFacts.cs:48-51`, `ShippedSynapseFacts.cs:33-38`
- Modify: tests `CSharpCatalogFacts.cs:18,22`, `InventoryFacts.cs:27`, `ScriptEdgeFacts.cs` (bare ids), `AppBindingTestHost.cs`

**Interfaces:**
- Consumes: `NeuronAccess.ForBrainKey`, `BrainScope.IsValidId`.
- Produces: `public static class CSharpFileKeys { public static string For(string scope, string name); }` in `DigitalBrain.Microsoft.CSharp`; `AppProgramKey.For(string appKey, int generation, string path)` unchanged in signature, returning `CSharpFileKeys.For(scope, "app-" + digest)`; a `CSharpFileNeuron.Access` that is `PublicOperation` for the four edge operations and `base.Access` for everything else.

- [ ] **Step 1: Write the failing facts**

`tests/…/CSharpFileKeysFacts.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Microsoft.CSharp;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

public sealed class CSharpFileKeysFacts
{
    [Fact]
    public void AKeyIsTheBrainScopeTheCSharpSegmentAndTheName()
        => Assert.Equal("alpha/csharp/report", CSharpFileKeys.For("alpha", "report"));

    [Theory]
    [InlineData("../other")]
    [InlineData("other/program")]
    [InlineData("C:\\private")]
    [InlineData("")]
    [InlineData("catalog")]
    public void ANameThatCouldReachAnotherKeyIsRefused(string name)
        => Assert.Throws<ArgumentException>(() => CSharpFileKeys.For("alpha", name));

    [Theory]
    [InlineData("")]
    [InlineData("a/b")]
    [InlineData("a:b")]
    [InlineData("a\\b")]
    public void AScopeThatIsNotABrainIdIsRefused(string scope)
        => Assert.Throws<ArgumentException>(() => CSharpFileKeys.For(scope, "report"));

    [Fact]
    public void EveryKeyBelongsToItsBrainForAccessChecks()
        => Assert.Equal("alpha", NeuronAccess.ForBrainKey(CSharpFileKeys.For("alpha", "report")).Scope);

    [Theory]
    [InlineData("personal")]
    [InlineData("a/b")]
    [InlineData("a:b")]
    [InlineData("")]
    public void ContractsAndTheFrameworkAgreeOnWhatABrainIdIs(string scope)
        => Assert.Equal(BrainScope.IsValidId(scope), Record.Exception(() => CSharpFileKeys.For(scope, "x")) is null);
}
```

Add to `ScriptEdgeFacts.cs`:

```csharp
    [Fact]
    public async Task AFileKeyedUnderAnotherBrainRefusesTheCaller()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Brain(new FakeSandbox(), ct);
        CallerContextStamper.Stamp(Alice);
        try
        {
            await brain.AuthorizeCallerAsync();
            var elsewhere = brain.Get<ICSharpFile>(CSharpFileKeys.For("another-brain", "file"));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => elsewhere.Inspect(ct));
            var own = brain.Get<ICSharpFile>(CSharpFileKeys.For(Alice.BrainId, "file"));
            Assert.Equal(CSharpFileStatus.Stopped, (await own.Inspect(ct)).Status);
        }
        finally { Orleans.Runtime.RequestContext.Clear(); }
    }
```

Add to `AppNeuronFacts.cs` (replacing the two assertions at 253-254):

```csharp
        var expected = Enumerable.Range(0, 3).Select(generation => AppProgramKey.For(IApp.Key(Brain, "keyed"), generation, "synapses/new.cs"));
        Assert.Contains(deployed.Id, expected);
        Assert.StartsWith(Brain + "/csharp/app-", deployed.Id, StringComparison.Ordinal);
        Assert.DoesNotContain("keyed", deployed.Id, StringComparison.Ordinal);   // unguessable from the app's name
```

Update `CSharpCatalogFacts.cs:18,22` and `InventoryFacts.cs:27` to `CSharpFileKeys.For(...)` with the same assertions (`ModelCannotSelectAnExternalScopeOrPath` keeps its three inputs).

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep "CSharpFileKeys" | head -3`
Expected: `The name 'CSharpFileKeys' does not exist`.

- [ ] **Step 3: Implement**

Contracts `CSharpFileKeys.cs`:

```csharp
namespace DigitalBrain.Microsoft.CSharp;

// The one grammar for an ICSharpFile key. The brain scope leads, so the framework's access check
// finds the owning brain from the key alone; "catalog" is the catalog neuron's segment, not a file.
public static class CSharpFileKeys
{
    public static string For(string scope, string name)
    {
        if (string.IsNullOrWhiteSpace(scope) || scope.Length > 200 || scope.AsSpan().IndexOfAny('/', '\\', ':') >= 0)
        { throw new ArgumentException("A brain scope is a non-empty id without separators.", nameof(scope)); }
        if (string.IsNullOrWhiteSpace(name) || name.Length > 100 || name == "catalog"
            || name.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_'))
        { throw new ArgumentException("Use a C# file name of 1–100 ASCII letters, digits, hyphens or underscores.", nameof(name)); }
        return $"{scope}/csharp/{name}";
    }
}
```

`CSharpCatalogStore`: delete `FileKey` and the `System.Security.Cryptography`/`System.Text.Json` usings; `ValidateFileId` stays (descriptions) and calls `CSharpFileKeys.For(scope, id)` instead of duplicating the rule: `_ = CSharpFileKeys.For(scope, id);`. `ScopedCSharpTools.File` and `CSharpInventoryProvider.Persisted` call `CSharpFileKeys.For(scope, id)` / `(scope, file.Id)`.

Apps `AppProgramKey.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Microsoft.CSharp;

namespace DigitalBrain.Apps;

// The key of a deployed app program: {brain}/csharp/app-{digest of app, generation and bundle path}.
// The name is a digest, so nothing but the app that knows its own name and generation can compute
// another app's program key; the owning-app check on the file stays the actual guard.
internal static class AppProgramKey
{
    public static string For(string appKey, int generation, string path)
    {
        var marker = appKey.IndexOf("/apps/", StringComparison.Ordinal);
        if (marker <= 0) { throw new ArgumentException("An app key is {brain}/apps/{name}.", nameof(appKey)); }
        var digest = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(appKey + "\0" + generation + "\0" + path)))[..32];
        return CSharpFileKeys.For(appKey[..marker], "app-" + digest);
    }
}
```

`CSharpAppRuntime.cs` needs no change (it already delegates to `AppProgramKey.For`). OS E2E: `listener`/`broken` become `brain.Get<ICSharpFile>(CSharpFileKeys.For("e2e", timerId))` and `CSharpFileKeys.For("e2e", "broken-" + timerId)`; `ShippedSynapseFacts` needs no change (it calls `AppProgramKey.For`).

`CSharpFileNeuron`:

```csharp
    public override NeuronAccess Access(string operation) =>
        // The script edge's inbound operations authenticate with the run token the edge has already
        // verified; the neuron re-checks the run id itself. Same rule as a webhook.
        operation is nameof(ICSharpFileEdge.Authorize) or nameof(ICSharpFileEdge.Subscribed)
            or nameof(ICSharpFileEdge.DrainPending) or nameof(ICSharpFileEdge.Acknowledge)
            ? NeuronAccess.PublicOperation
            : base.Access(operation);
```

and `Write` becomes `=> Save(Snapshot with { Source = program }, new CSharpFileChanged(FileId))` (it no longer records an owner: access is the key's, and `Start`/`Swap` set the run's owner). Update the stamped Alice facts in `ScriptEdgeFacts.cs` that use bare ids (`"predictable-behavior"`, `"victim-app"` host stays, `"reused-file"`, `"standalone"`) to `CSharpFileKeys.For(Alice.BrainId, name)`; `AppBindingTestHost.Start/Bind` already take the file key as given.

- [ ] **Step 4: Run to verify they pass**

LSP diagnostics clean, Ring build clean, then CSharp.Tests, Apps.Tests, OS.Unit and Architecture.Tests (`RepositoryLayoutFacts` guards the Contracts reference rule; `CSharpFileKeys` uses nothing but BCL).
Expected: all pass. If a stamped fact fails with `UnauthorizedAccessException` after the key change, its key is bare or foreign-scoped; fix the key, never the access rule.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp src/DigitalBrain.Modules/DigitalBrain/Apps src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
git commit -m "CSharp: one file key, {brainScope}/csharp/{name}, composed in Contracts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One run shape — `RunRecord`, one reconcile path, exact-id `Authorize`

**Files:**
- Modify: `Files/CSharpFileState.cs` (full rewrite below), `Files/CSharpFileNeuron.cs` (full rewrite below), `Files/ICSharpFileTrigger.cs` → rename to `Files/ICSharpFileArrivals.cs`
- Modify: tests `CSharpFileNeuronFacts.cs`, `CSharpSubscriptionFacts.cs`, `ScriptEdgeFacts.cs` (compile-level references to `ShouldRun`/`RunId` are via the snapshot and need no change)

**Interfaces:**
- Consumes: Task 2 (`Subscription`, `PendingBatch`, `Acknowledge`), Task 3 (no triggers), Task 4 (`Access`).
- Produces:
  - `internal sealed record RunRecord(string Id, string Owner, CallerContext? Caller, int Failures, bool Active)`.
  - `CSharpFileState { Program, Settings, Subscriptions, Run: RunRecord?, AppId, AppBrain }`.
  - `internal interface ICSharpFileArrivals { [OneWay] Task Arrived(Signal signal); }`.
  - Behaviour: `Authorize(runId).Active ⇔ Run is { Active: true } && runId == Run.Id`; a run is recorded before it launches; `CSharpFileSnapshot.Status` is `Restarting` whenever the reconcile would launch a run.

- [ ] **Step 1: Write the failing facts**

Add to `CSharpSubscriptionFacts.cs` (its `Subscribed`, `Reconcile`, `Eventually` helpers are already `internal static`/private to the class; make `Reconcile` `internal static` as `Subscribed` is):

```csharp
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AFileWithAndWithoutSubscriptionsDisarmsAfterTheSameNumberOfFailedRuns(bool subscribed)
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = brain.Get<ICSharpFile>("workspace/one-path/" + subscribed);
        await file.Write("Console.WriteLine(1);", ct);
        await file.Start(ct);
        if (subscribed)
        {
            await file.AsReference<ICSharpFileEdge>().Subscribed(sandbox.LatestRunId, pinger.GetGrainId().ToString(), nameof(Pinged));
            await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
            await pinger.Ping(1);                       // waits for the stream; nothing drains it
            await arrivals.NextAsync(ct: ct);
        }

        while ((await file.Inspect(ct)).ShouldRun)
        {
            sandbox.ExitLatest(1);
            await Reconcile(file);
        }

        var disarmed = await file.Inspect(ct);
        Assert.Equal(CSharpFileNeuron.MaximumFailures, sandbox.Started);
        Assert.Equal(CSharpFileNeuron.MaximumFailures, disarmed.Failures);
        Assert.Empty(disarmed.Subscriptions);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AStaleRunTokenStopsSpeakingAfterARestart(bool subscribed)
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = brain.Get<ICSharpFile>("workspace/stale/" + subscribed);
        await file.Write("Console.WriteLine(1);", ct);
        await file.Start(ct);
        var first = sandbox.LatestRunId;
        var edge = file.AsReference<ICSharpFileEdge>();
        if (subscribed) { await edge.Subscribed(first, pinger.GetGrainId().ToString(), nameof(Pinged)); }

        await file.Swap("Console.WriteLine(2);", ct);

        Assert.NotEqual(first, sandbox.LatestRunId);
        Assert.False((await edge.Authorize(first)).Active);
        Assert.True((await edge.Authorize(sandbox.LatestRunId)).Active);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AFileWhoseRunIsLostWhileSomethingIsDueReportsRestarting(bool subscribed)
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var pinger = brain.Get<IPinger>("pinger");
        var file = brain.Get<ICSharpFile>("workspace/restarting/" + subscribed);
        await file.Write("Console.WriteLine(1);", ct);
        await file.Start(ct);
        if (subscribed)
        {
            await file.AsReference<ICSharpFileEdge>().Subscribed(sandbox.LatestRunId, pinger.GetGrainId().ToString(), nameof(Pinged));
            await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
            await pinger.Ping(1);
            await arrivals.NextAsync(ct: ct);
        }

        sandbox.LoseEveryRun();

        Assert.Equal(CSharpFileStatus.Restarting, (await file.Inspect(ct)).Status);
    }

    [Fact]
    public async Task ASubscribedFileThatFinishedCleanlyWithNothingPendingIsWaitingNotRestarting()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct);
        var file = await Subscribed(brain, sandbox, "workspace/waiting", brain.Get<IPinger>("pinger"), ct);

        sandbox.ExitLatest(0);

        var waiting = await file.Inspect(ct);
        Assert.Equal(CSharpFileStatus.Exited, waiting.Status);
        Assert.True(waiting.ShouldRun);
    }

    [Fact]
    public async Task SwappingKeepsTheWatermarkAndTheDropCount()
    {
        var ct = TestContext.Current.CancellationToken;
        var sandbox = new FakeSandbox();
        await using var brain = await SandboxBrain.StartAsync(sandbox, ct, silo => silo.Services.PostConfigure<CSharpOptions>(options => options.MaximumPending = 2));
        var pinger = brain.Get<IPinger>("pinger");
        var file = await Subscribed(brain, sandbox, "workspace/swap-watermark", pinger, ct);
        var edge = file.AsReference<ICSharpFileEdge>();
        await using var arrivals = await brain.Observe<CSharpPendingArrived>(file, ct);
        for (var number = 1; number <= 3; number++) { await pinger.Ping(number); }   // 1 dropped
        for (var i = 0; i < 3; i++) { await arrivals.NextAsync(ct: ct); }
        await edge.Acknowledge(sandbox.LatestRunId, pinger.GetGrainId().ToString(), nameof(Pinged), 2);

        await file.Swap("Console.WriteLine(2);", ct);

        var view = Assert.Single((await file.Inspect(ct)).Subscriptions);
        Assert.Equal((1, 2L, 1L), (view.Pending, view.Delivered, view.Dropped));
    }
```

Add to `CSharpFileNeuronFacts.cs`:

```csharp
    [Fact]
    public async Task AFailedLaunchKeepsTheIntentSoTheReconcileRetries()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Brain(new FakeSandbox(), ct);
        var aspire = brain.Get<IFakeAspireProbe>(new CSharpOptions().AspireApplication);
        await aspire.FailStarts();
        var file = brain.Get<ICSharpFile>("workspace/retrying");
        await file.Write("Console.WriteLine(1);", ct);

        await Assert.ThrowsAsync<InvalidOperationException>(() => file.Start(ct));
        Assert.True((await file.Inspect(ct)).ShouldRun);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Reconcile(file));
        Assert.Equal(2, await aspire.Starts());   // the reconcile asked the sandbox to start again
    }
```

- [ ] **Step 2: Run to verify they fail**

Run the CSharp.Tests project with `-- --filter-method` for each of `"*SubscriptionsDisarmsAfterTheSame*"`, `"*StaleRunToken*"`, `"*FailedLaunchKeeps*"`, `"*WatermarkAndTheDropCount*"`, `"*RunIsLostWhileSomethingIsDue*"`.
Expected: `AStaleRunTokenStopsSpeakingAfterARestart(subscribed: True)` fails (the old token still speaks), `AFailedLaunchKeepsTheIntentSoTheReconcileRetries` fails (`ShouldRun` is false after a failed launch), `AFileWhoseRunIsLostWhileSomethingIsDueReportsRestarting(True)` fails (reports `Stopped`).

- [ ] **Step 3: Implement**

`Files/CSharpFileState.cs`:

```csharp
using DigitalBrain.Framework;

namespace DigitalBrain.Microsoft.CSharp;

// Run is null until the file is first started. Active says the file is wanted: a stopped, finished or
// disarmed file keeps its record so Inspect and ReadLogs still address its last run.
[GenerateSerializer, Alias("microsoft.csharp.run-record")]
internal sealed record RunRecord(
    // A new run per launch, so a stale run can never be addressed again.
    [property: Id(0)] string Id,
    // The principal who started it; production keys its sandbox session (one container per user) by it.
    [property: Id(1)] string Owner,
    // The caller who started it; the script edge speaks for this caller as an app.
    [property: Id(2)] CallerContext? Caller,
    // Consecutive non-zero exits since the last Start.
    [property: Id(3)] int Failures,
    [property: Id(4)] bool Active);

[GenerateSerializer, Alias("microsoft.csharp.file-state")]
internal sealed record CSharpFileState
{
    [Id(0)] public string Program { get; init; } = "";
    [Id(1)] public Dictionary<string, string> Settings { get; init; } = new(StringComparer.Ordinal);
    // Durable subscriptions the current program registered by streaming; they outlive its runs.
    [Id(2)] public Subscription[] Subscriptions { get; init; } = [];
    [Id(3)] public RunRecord? Run { get; init; }
    [Id(4)] public string? AppId { get; init; }
    [Id(5)] public string? AppBrain { get; init; }
}
```

`Files/ICSharpFileArrivals.cs` (replaces `ICSharpFileTrigger.cs`):

```csharp
using DigitalBrain;
using DigitalBrain.Framework;
using Orleans.Concurrency;
using Orleans.Metadata;

namespace DigitalBrain.Microsoft.CSharp;

// One-way so the publishing neuron never waits while a run starts (possibly the sandbox too).
[Alias("microsoft.csharp.file-arrivals"), DefaultGrainType("microsoft.csharp.file")]
internal interface ICSharpFileArrivals : IGrainWithStringKey
{
    [OneWay] Task Arrived(Signal signal);
}
```

`Files/CSharpFileNeuron.cs` (complete; `Subscribed`, `RequireSource`, `RequireBoundAccess`, `BindApp`'s guards and the `[GeneratedRegex]` are carried over from the current file unchanged except where shown):

```csharp
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DigitalBrain.Client.Edge.V1;
using DigitalBrain.Framework;
using Microsoft.Extensions.Options;
using Orleans.Timers;

namespace DigitalBrain.Microsoft.CSharp;

// Start records the intent to keep the program running; the reconcile (a reminder, or a signal arriving
// for a subscription) decides, in one place, whether a run is due. A program that holds no subscription
// is due until it exits cleanly; a program that holds subscriptions is due while something is pending.
[GrainType("microsoft.csharp.file")]
internal sealed partial class CSharpFileNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CSharpFileState> store,
    ICSharpRunner runner,
    ScriptRunEnvironment environment,
    IReminderRegistry reminders,
    IOptions<CSharpOptions> options)
    : Neuron<CSharpFileState>(store), ICSharpFile, ICSharpAppBinding, ICSharpFileArrivals, ICSharpFileEdge, IRemindable, INeuronObserver
{
    public override NeuronAccess Access(string operation) =>
        operation is nameof(ICSharpFileEdge.Authorize) or nameof(ICSharpFileEdge.Subscribed)
            or nameof(ICSharpFileEdge.DrainPending) or nameof(ICSharpFileEdge.Acknowledge)
            ? NeuronAccess.PublicOperation
            : base.Access(operation);

    internal const int MaximumSourceBytes = 128 * 1024;
    internal const int MaximumFailures = 5;
    internal const string ReconcileReminder = "reconcile";
    // Orleans reminders fire at most once a minute.
    internal static readonly TimeSpan ReconcilePeriod = TimeSpan.FromMinutes(1);
    private const int MaximumSettings = 64;
    private readonly Dictionary<string, INeuron> _watched = new(StringComparer.Ordinal);
    private IGrainTimer? _watchRenewal;
    private string FileId => this.GetPrimaryKeyString();

    private enum Verdict { Wait, Finished, Run }

    internal void RequireBoundAccess(GrainId? source, string method)
    {
        if (Snapshot.AppId is not { } app) { return; }
        if (Snapshot.AppBrain != BrainScope.CurrentId())
        { throw new UnauthorizedAccessException("This behavior belongs to another brain."); }
        if (method is nameof(Write) or nameof(Configure) or nameof(Start) or nameof(Stop) or nameof(Delete)
            && (source?.Type.ToString() != DigitalBrain.Framework.AppGrainType.Name || source?.Key.ToString() != app))
        { throw new UnauthorizedAccessException("Only the owning Apps grain may change a bound behavior."); }
    }

    public async Task BindApp(string appId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(appId);
        var brain = BrainScope.CurrentId();
        if (Snapshot.AppId is not null && (Snapshot.AppId != appId || Snapshot.AppBrain != brain))
        { throw new UnauthorizedAccessException("The behavior is already bound to another app."); }
        if (Snapshot.AppId is not null) { return; }
        await StopCurrentRunAsync(CancellationToken.None);
        await Save(Snapshot with { AppId = appId, AppBrain = brain, Run = null, Subscriptions = [] }, new CSharpFileChanged(FileId));
    }

    // A source's own signal may be what activated this file, so watching it now would deadlock;
    // the renewal timer's first tick watches it right after activation instead.
    internal void ResumeWatches()
    {
        if (Snapshot.Run is { Active: true } && Snapshot.Subscriptions.Length > 0) { RenewSourceWatches(dueTime: TimeSpan.Zero); }
    }

    public async Task<CSharpFileSnapshot> Inspect(CancellationToken cancellationToken = default)
        => Describe(await StateAsync(cancellationToken));

    public Task Write(string program, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(program);
        if (Encoding.UTF8.GetByteCount(program) > MaximumSourceBytes) { throw new ArgumentException($"Source exceeds {MaximumSourceBytes} bytes.", nameof(program)); }
        return Save(Snapshot with { Program = program }, new CSharpFileChanged(FileId));
    }

    public Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(settings);
        if (settings.Count > MaximumSettings) { throw new ArgumentException($"At most {MaximumSettings} settings are allowed.", nameof(settings)); }
        if (settings.Keys.FirstOrDefault(name => !SettingName().IsMatch(name)) is { } invalid)
        { throw new ArgumentException($"Setting '{invalid}' must contain only letters, digits and underscores.", nameof(settings)); }
        return Save(Snapshot with { Settings = new(settings, StringComparer.Ordinal) }, new CSharpFileChanged(FileId));
    }

    public async Task<CSharpFileSnapshot> Start(CancellationToken cancellationToken = default)
    {
        RequireSource();
        await UnwatchSourcesAsync();
        await StopCurrentRunAsync(cancellationToken);
        await reminders.RegisterOrUpdateReminder(this.GetGrainId(), ReconcileReminder, ReconcilePeriod, ReconcilePeriod);
        // A fresh start is a fresh intent: the new program re-registers its subscriptions by running.
        await LaunchAsync(Snapshot with { Subscriptions = [] }, FreshRun(), cancellationToken);
        return Describe(await StateAsync(cancellationToken));
    }

    public async Task<CSharpFileSnapshot> Swap(string source, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(source);
        if (Encoding.UTF8.GetByteCount(source) > MaximumSourceBytes) { throw new ArgumentException($"Source exceeds {MaximumSourceBytes} bytes.", nameof(source)); }
        // An edit is not a fresh intent: keep the durable subscriptions, their watermarks and their
        // buffered signals, and keep watching their sources, so nothing published during the restart is
        // lost; the new run drains the buffers when it re-subscribes.
        await StopCurrentRunAsync(cancellationToken);
        await reminders.RegisterOrUpdateReminder(this.GetGrainId(), ReconcileReminder, ReconcilePeriod, ReconcilePeriod);
        await LaunchAsync(Snapshot with { Program = source }, FreshRun(), cancellationToken);
        await WatchSourcesAsync();
        return Describe(await StateAsync(cancellationToken));
    }

    public async Task<CSharpFileSnapshot> Stop(CancellationToken cancellationToken = default)
    {
        await StopReconcilingAsync();
        await UnwatchSourcesAsync();
        await StopCurrentRunAsync(cancellationToken);
        var state = await StateAsync(cancellationToken);
        await Save(Snapshot with { Run = Snapshot.Run is { } run ? run with { Active = false } : null, Subscriptions = [] }, new CSharpFileChanged(FileId));
        return Describe(state);
    }

    public Task<string> ReadLogs(int tail = 200, CancellationToken cancellationToken = default)
        => Snapshot.Run is { } run ? runner.LogsAsync(run.Owner, run.Id, tail, cancellationToken) : Task.FromResult("");

    public async Task Delete(CancellationToken cancellationToken = default)
    {
        await StopReconcilingAsync();
        await UnwatchSourcesAsync();
        await StopCurrentRunAsync(cancellationToken);
        await Save(new CSharpFileState(), new CSharpFileChanged(FileId));
        DeactivateOnIdle();
    }

    Task INeuronObserver.OnSignalAsync(Signal signal)
        => Snapshot.Subscriptions.Any(s => s.Signal == signal.GetType().Name && s.Neuron == signal.Publisher.Name)
            ? this.AsReference<ICSharpFileArrivals>().Arrived(signal)
            : Task.CompletedTask;

    // Buffers the signal on the subscription it matches, then lets the reconcile decide about a run.
    public async Task Arrived(Signal signal)
    {
        var json = JsonSerializer.Serialize(signal, signal.GetType(), ScriptEdgeProtocol.Json);
        var name = signal.GetType().Name;
        var cap = options.Value.MaximumPending;
        var matched = false;
        var overflowed = false;
        var next = Snapshot.Subscriptions.Select(s =>
        {
            if (s.Signal != name || s.Neuron != signal.Publisher.Name) { return s; }
            matched = true;
            var arrived = s.Arrive(json, cap);
            overflowed |= arrived.Dropped > s.Dropped;
            return arrived;
        }).ToArray();
        if (!matched) { return; }
        await Save(Snapshot with { Subscriptions = next }, new CSharpPendingArrived(FileId), overflowed ? new CSharpFileChanged(FileId) : null);
        await ReconcileAsync();
    }

    public async Task Subscribed(string runId, string neuron, string signal)
    {
        await RequireSpeakingRun(runId);
        if (!GrainId.TryParse(neuron, out _)) { throw new ArgumentException($"'{neuron}' is not a neuron id such as time.timer/tea.", nameof(neuron)); }
        // Watching itself would deadlock this non-reentrant grain and self-feed on every save.
        if (neuron == this.GetGrainId().ToString()) { throw new ArgumentException("A script cannot subscribe to its own file.", nameof(neuron)); }
        ArgumentException.ThrowIfNullOrWhiteSpace(signal);
        if (!Snapshot.Subscriptions.Any(existing => existing.Neuron == neuron && existing.Signal == signal))
        {
            await Save(Snapshot with { Subscriptions = [.. Snapshot.Subscriptions, new(neuron, signal, [], 0, 0)] }, new CSharpFileChanged(FileId));
        }
        await WatchSourcesAsync();
    }

    public async Task<PendingBatch> DrainPending(string runId, string neuron, string signal)
    {
        await RequireSpeakingRun(runId);
        var subscription = Snapshot.Subscriptions.FirstOrDefault(s => s.Neuron == neuron && s.Signal == signal);
        return subscription is null ? new([], 0) : new(subscription.Pending, subscription.Watermark);
    }

    public async Task Acknowledge(string runId, string neuron, string signal, long watermark)
    {
        await RequireSpeakingRun(runId);
        var subscription = Snapshot.Subscriptions.FirstOrDefault(s => s.Neuron == neuron && s.Signal == signal);
        if (subscription is null) { return; }
        var trimmed = subscription.Acknowledge(watermark);
        if (trimmed.Delivered == subscription.Delivered) { return; }
        await Save(Snapshot with
        {
            Subscriptions = Snapshot.Subscriptions.Select(s => s == subscription ? trimmed : s).ToArray(),
        }, new CSharpFileChanged(FileId));
    }

    private async Task RequireSpeakingRun(string runId)
    {
        var authorization = await Authorize(runId);
        if (!authorization.Active) { throw new UnauthorizedAccessException("This run no longer speaks for its file."); }
    }

    public Task ReceiveReminder(string reminderName, TickStatus status)
        => reminderName == ReconcileReminder ? ReconcileAsync() : Task.CompletedTask;

    // The one place a run is decided. Runs are not retried on a schedule of their own: a failure counts
    // when the next run is due, and after MaximumFailures the file disarms instead of burning a run on
    // every signal or tick.
    private async Task ReconcileAsync()
    {
        if (Snapshot.Run is not { Active: true } run) { await StopReconcilingAsync(); return; }
        if (_watched.Count == 0 && Snapshot.Subscriptions.Length > 0) { await WatchSourcesAsync(); }
        var state = await runner.InspectAsync(run.Owner, run.Id, CancellationToken.None);
        switch (Judge(state))
        {
            case Verdict.Wait:
                return;
            case Verdict.Finished:
                await StopReconcilingAsync();
                await Save(Snapshot with { Run = run with { Active = false, Failures = 0 } }, new CSharpFileChanged(FileId));
                return;
        }
        var failures = state switch
        {
            { Status: CSharpFileStatus.Exited, ExitCode: not 0 } => run.Failures + 1,
            { Status: CSharpFileStatus.Exited } => 0,
            // The run or its whole sandbox is gone; that is not the program's failure.
            _ => run.Failures,
        };
        if (failures >= MaximumFailures)
        {
            await StopReconcilingAsync();
            await UnwatchSourcesAsync();
            await Save(Snapshot with { Run = run with { Active = false, Failures = failures }, Subscriptions = [] }, new CSharpFileChanged(FileId));
            return;
        }
        await LaunchAsync(Snapshot, run with { Id = Guid.NewGuid().ToString("N"), Failures = failures }, CancellationToken.None);
    }

    private Verdict Judge(CSharpRunState state)
        => state.Status == CSharpFileStatus.Running ? Verdict.Wait
            : Snapshot.Subscriptions.Length == 0
                ? state is { Status: CSharpFileStatus.Exited, ExitCode: 0 } ? Verdict.Finished : Verdict.Run
                : Snapshot.Subscriptions.Any(s => s.Pending.Length > 0) ? Verdict.Run : Verdict.Wait;

    // The run is recorded before it launches: the sandbox can reach the edge before StartAsync returns,
    // and the edge authorizes by exactly this id. A launch that throws leaves the intent recorded, so the
    // reminder retries it.
    private async Task LaunchAsync(CSharpFileState basis, RunRecord run, CancellationToken cancellationToken)
    {
        await Save(basis with { Run = run }, new CSharpFileChanged(FileId));
        await runner.StartAsync(new CSharpRun(run.Owner, run.Id, basis.Program, environment.Create(FileId, run.Id, basis.Settings)), cancellationToken);
    }

    private static RunRecord FreshRun()
    {
        var (principal, context) = CallerContextStamper.TryGet(out var caller) ? (caller.PrincipalId, caller) : ("system", null);
        return new(Guid.NewGuid().ToString("N"), principal, context, Failures: 0, Active: true);
    }

    private Task<CSharpRunState> StateAsync(CancellationToken cancellationToken)
        => Snapshot.Run is { } run ? runner.InspectAsync(run.Owner, run.Id, cancellationToken) : Task.FromResult(CSharpRunState.Stopped);

    private async Task WatchSourcesAsync()
    {
        RenewSourceWatches(dueTime: ObserverRenewal);
        var observer = this.AsReference<INeuronObserver>();
        foreach (var source in _watched.Values) { await source.Watch(observer); }
    }

    // Sources keep observers for a lease; renewing on a timer also keeps this activation alive.
    private void RenewSourceWatches(TimeSpan dueTime)
    {
        _watched.Clear();
        foreach (var subscription in Snapshot.Subscriptions)
        {
            if (!_watched.ContainsKey(subscription.Neuron))
            { _watched[subscription.Neuron] = GrainFactory.GetGrain<INeuron>(GrainId.Parse(subscription.Neuron)); }
        }
        var observer = this.AsReference<INeuronObserver>();
        var sources = _watched.Values.ToArray();
        _watchRenewal?.Dispose();
        _watchRenewal = sources.Length == 0 ? null : this.RegisterGrainTimer(
            async _ => { foreach (var source in sources) { await source.Watch(observer); } },
            new GrainTimerCreationOptions { DueTime = dueTime, Period = ObserverRenewal, Interleave = true, KeepAlive = true });
    }

    private async Task UnwatchSourcesAsync()
    {
        _watchRenewal?.Dispose();
        _watchRenewal = null;
        if (_watched.Count == 0) { return; }
        var observer = this.AsReference<INeuronObserver>();
        var sources = _watched.Values.ToArray();
        _watched.Clear();
        foreach (var source in sources) { await source.Unwatch(observer); }
    }

    // A token speaks for exactly the current run while the file is wanted.
    public Task<RunAuthorization> Authorize(string runId)
        => Task.FromResult(new RunAuthorization(
            Snapshot.Run is { Active: true } run && runId.Length > 0 && runId == run.Id,
            Snapshot.Run?.Caller is { } owner
                ? owner with { AppId = Snapshot.AppId is { } app && Snapshot.AppBrain == BrainScope.Create(owner.AccountId, owner.BrainId).Id ? app : FileId }
                : null));

    private Task StopCurrentRunAsync(CancellationToken cancellationToken)
        => Snapshot.Run is { } run ? runner.StopAsync(run.Owner, run.Id, cancellationToken) : Task.CompletedTask;

    private async Task StopReconcilingAsync()
    {
        if (await reminders.GetReminder(this.GetGrainId(), ReconcileReminder) is { } reminder)
        {
            await reminders.UnregisterReminder(this.GetGrainId(), reminder);
        }
    }

    private void RequireSource()
    {
        if (Snapshot.AppId is not null && Snapshot.AppBrain != BrainScope.CurrentId())
        { throw new UnauthorizedAccessException("This behavior belongs to another brain."); }
        if (string.IsNullOrWhiteSpace(Snapshot.Program)) { throw new InvalidOperationException("Write the C# source before starting it."); }
    }

    // A wanted file that is between runs reports Restarting: the reconcile will launch the next one.
    private CSharpFileSnapshot Describe(CSharpRunState state)
        => new(FileId, Snapshot.Program, Snapshot.Settings,
            Snapshot.Run is { Active: true } && Judge(state) == Verdict.Run ? CSharpFileStatus.Restarting : state.Status,
            state.ExitCode, state.StartedAt, Snapshot.Run is { Active: true }, Snapshot.Run?.Failures ?? 0)
        { Subscriptions = Snapshot.Subscriptions.Select(s => new CSharpSubscriptionView(s.Neuron, s.Signal, s.Pending.Length, s.Delivered, s.Dropped)).ToArray() };

    [GeneratedRegex("^[A-Za-z0-9_]{1,128}$")]
    private static partial Regex SettingName();
}
```

`CSharpFileActivation` is unchanged (`neuron.ResumeWatches()`).

- [ ] **Step 4: Run to verify they pass**

LSP diagnostics clean; Ring build clean; then:

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`, `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: all pass. If an older fact now fails, decide by reading it: a fact that encoded a deleted mode is deleted with a sentence in the commit body; a fact that encodes a guarantee (for example `ASignalWithNoLiveRunWakesOne`, `PendingLeftByALostRunIsRedeliveredByTheReconcile`, `ACleanWakeRunResetsTheFailureCount`, `ASecondSignalDuringAWakeRunQueuesInsteadOfStartingAnotherRun`) is a regression in the new neuron and the neuron is fixed.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp
git commit -m "CSharp: one run shape; a run is recorded before it launches and a token speaks for exactly its run

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One module — authoring is an option

**Files:**
- Modify: `CSharpModule.cs`, `Configuration/CSharpOptions.cs` (`Authoring`)
- Delete: `CSharpAuthoringModule.cs`, `Authoring/CSharpAuthoringHosting.cs`, Hosting `CSharpAuthoringModuleHosting.cs`
- Modify: OS `OsCatalog.cs:23`, AppHost `AppHost.cs:55-56`
- Modify: tests `AuthoringCompositionFacts.cs`, `CSharpCompositionFacts.cs`, `CSharpRouteFacts.cs`, `InventoryFacts.cs`, `CSharpCatalogFacts.cs` (`WithModule<CSharpAuthoringModule>` → `WithModule<CSharpModule>`)

**Interfaces:**
- Consumes: `builder.Configuration.GetModuleOptions<CSharpOptions>("csharp")`, `IHttpModule.Configure(IEndpointRouteBuilder)`.
- Produces: `CSharpOptions.Authoring` (default `true`); `CSharpModule` registers `CSharpAgentTools`, `CSharpRegistryResources`, the scoped `ScopedCSharpTools` and maps `/csharp` only when `Authoring`; always registers the script edge, `CSharpToolService`, `CSharpCatalogStore`, `IScriptSandbox`, the inventory provider.

- [ ] **Step 1: Write the failing facts**

Replace `AuthoringCompositionFacts.cs`:

```csharp
using System.Net;
using DigitalBrain.AI.Agents;
using DigitalBrain.Framework;
using DigitalBrain.Microsoft.CSharp;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

public sealed class AuthoringCompositionFacts
{
    [Fact(Timeout = 120_000)]
    public async Task AuthoringOffHidesTheToolsAndTheRoutesButKeepsTheScriptEdge()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var on = await ModuleTest.Create().WithModule<CSharpModule>().WithReminders().WithHttpEdge().StartAsync(ct);
        using var available = await on.HttpClient.GetAsync("/brains/authoring-on/csharp/", ct);
        Assert.Equal(HttpStatusCode.OK, available.StatusCode);
        Assert.Single(on.SiloServices.GetServices<IAgentToolFactory>().OfType<CSharpAgentTools>());
        Assert.Single(on.SiloServices.GetServices<IRegistryResourceProvider>().OfType<CSharpRegistryResources>());

        await using var off = await ModuleTest.Create().WithModule<CSharpModule, CSharpOptions>(options => options.Authoring = false).WithReminders().WithHttpEdge().StartAsync(ct);
        using var unavailable = await off.HttpClient.GetAsync("/brains/authoring-off/csharp/", ct);
        Assert.Equal(HttpStatusCode.NotFound, unavailable.StatusCode);
        Assert.Empty(off.SiloServices.GetServices<IAgentToolFactory>().OfType<CSharpAgentTools>());
        Assert.Empty(off.SiloServices.GetServices<IRegistryResourceProvider>().OfType<CSharpRegistryResources>());
        // What the Apps publish gate and the script edge need stays composed.
        Assert.True(off.SiloServices.GetRequiredService<CSharpToolService>().CanRun);
        Assert.NotNull(off.SiloServices.GetRequiredService<DigitalBrain.Apps.IScriptSandbox>());
        Assert.NotNull(off.SiloServices.GetRequiredService<ScriptEdge>());
    }

    [Fact]
    public void CSharpModuleIsTheOnlyCSharpModule()
        => Assert.Null(typeof(CSharpModule).Assembly.GetType("DigitalBrain.Microsoft.CSharp.CSharpAuthoringModule"));
}
```

In `CSharpCompositionFacts.cs` replace the `authoring` theory body's module selection with `ModuleTest.Create().WithModule<CSharpModule, CSharpOptions>(options => options.Authoring = authoring)`, keeping its assertions. In `CSharpRouteFacts.cs`: `CSharpAuthoringIsServedOnlyUnderTheBrainRoute` maps with `new CSharpModule().Configure(app)` after `builder.Services.AddSingleton<ScriptEdge>(_ => null!)`; `ExecutionCompositionDoesNotMapCSharpAuthoringRoutes` registers `builder.Services.Configure<CSharpOptions>(options => options.Authoring = false)` before `new CSharpModule().Configure(app)`; both register `Configure<CSharpOptions>` explicitly so the module's endpoint code can read `IOptions<CSharpOptions>` from `app.Services`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep -E "Authoring" | sed 's/\[.*//' | sort -u | head -3`
Expected: `'CSharpOptions' does not contain a definition for 'Authoring'`.

- [ ] **Step 3: Implement**

`Configuration/CSharpOptions.cs`:

```csharp
    // The agent tools, the registry entry and the /csharp console routes. The script edge and the
    // compile gate the Apps module uses are not authoring and stay on either way.
    public bool Authoring { get; set; } = true;
```

`CSharpModule.cs`:

```csharp
    public override void Configure(ISiloBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var options = builder.Configuration.GetModuleOptions<CSharpOptions>("csharp");
        builder.AddIncomingGrainCallFilter<CSharpAppBindingGuard>();
        builder.Services.AddOptions<CSharpOptions>()
            .Configure<IConfiguration>((target, configuration) => configuration.PopulateModuleOptions("csharp", target));
        builder.Services.AddOptions<CSharpDeploymentSettings>().BindConfiguration(CSharpDeploymentSettings.SectionName);
        builder.Services.TryAddSingleton<CSharpCatalogStore>();
        builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IActivationHandler<CSharpFileNeuron>, CSharpFileActivation>());
        builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryInventoryProvider, CSharpInventoryProvider>());
        builder.Services.TryAddSingleton<CSharpToolService>();
        builder.Services.TryAddSingleton<DigitalBrain.Apps.IScriptSandbox, CSharpScriptSandbox>();
        // ... the remaining existing registrations (TimeProvider, RunTokens, IIntegrationStartup,
        // ScriptRunEnvironment, ScriptContracts, IContractVocabulary, ScriptEdge, directives, discovery,
        // script check, the runner choice) are unchanged, and each appears exactly once.
        if (options.Authoring)
        {
            builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IAgentToolFactory, CSharpAgentTools>());
            builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IRegistryResourceProvider, CSharpRegistryResources>());
            builder.Services.TryAddScoped(provider => provider.GetRequiredService<CSharpToolService>().ForScope(BrainScope.CurrentId()));
        }
    }

    public void Configure(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        endpoints.MapScriptEdge();
        if (endpoints.ServiceProvider.GetRequiredService<IOptions<CSharpOptions>>().Value.Authoring) { CSharpAuthoringEndpoints.Map(endpoints); }
    }
```

(the `SourceRoot` post-configure and `FindRepositoryRoot` stay until Task 8). Delete `CSharpAuthoringModule.cs`, `Authoring/CSharpAuthoringHosting.cs`, `CSharpAuthoringModuleHosting.cs`; remove `new DigitalBrain.Microsoft.CSharp.CSharpAuthoringModule(),` from `OsCatalog.cs` and `.WithHosting<CSharpAuthoringModuleHosting>()` from `AppHost.cs` (move the semicolon to the `CSharpModuleHosting` line). Switch every `WithModule<CSharpAuthoringModule>` in tests to `WithModule<CSharpModule>`.

- [ ] **Step 4: Run to verify they pass**

LSP diagnostics clean; Ring build clean; then CSharp.Tests, OS.Unit (`EveryReferencedHostingAdapterBelongsToACatalogModule`, `ProductMatchesTheReferenceCompositionModuleSet`) and Assistant.Tests.
Expected: all pass. A module-id fact elsewhere that names `csharp-authoring` (`Framework.Tests.Unit/ModuleIdFacts.cs:8`) uses it as a sample string only; do not touch it.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs src/DigitalBrain.AppHost/AppHost.cs
git commit -m "CSharp: one module; authoring is the Authoring option, on by default

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The sandbox is a connector

**Files:**
- Modify: `CSharpModule.cs` (`Connector`), `README.md`
- Modify: `tests/…/RunTokensFacts.cs:12-35` (invert the first fact)
- Create: `tests/…/CSharpConnectorFacts.cs`

**Interfaces:**
- Consumes: `ConnectorDefinition(Id, DisplayName, AuthMethods, RequiredIntegrations) { ExternalSystem, OptionalIntegrations, Neurons, Signals }`, `ConnectorDiscovery` (reads a public static `Connector`).
- Produces: `public static ConnectorDefinition Connector` on `CSharpModule`.

- [ ] **Step 1: Write the failing facts**

`tests/…/CSharpConnectorFacts.cs`:

```csharp
using System.Text.Json;
using DigitalBrain.Microsoft.CSharp;
using Xunit;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

public sealed class CSharpConnectorFacts
{
    [Fact]
    public void TheConnectorNamesTheFileNeuronAndItsPublicSignal()
    {
        var connector = CSharpModule.Connector;
        Assert.Equal("csharp", connector.Id);
        Assert.Equal([typeof(ICSharpFile)], connector.Neurons);
        Assert.Equal([typeof(CSharpFileChanged)], connector.Signals);
        Assert.Empty(connector.RequiredIntegrations);
        Assert.Equal(["csharp"], connector.OptionalIntegrations);
    }

    [Fact]
    public async Task TheSandboxIsListedAsAConnector()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<CSharpModule>().WithHttpEdge().StartAsync(ct);
        var response = await brain.HttpClient.GetAsync("/connectors", ct);
        response.EnsureSuccessStatusCode();
        using var catalog = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var listed = Assert.Single(catalog.RootElement.EnumerateArray(), item => item.GetProperty("id").GetString() == "csharp");
        Assert.Equal(["ICSharpFile"], listed.GetProperty("neurons").EnumerateArray().Select(name => name.GetString()));
        Assert.Equal(["CSharpFileChanged"], listed.GetProperty("signals").EnumerateArray().Select(name => name.GetString()));
    }
}
```

In `RunTokensFacts.cs` delete `RunTokenInfrastructureIsNotAUserConnector` entirely (its `GET /connectors` assertion is the opposite of the new fact, and its `Connect(...)` half asserted that the deployment does not offer `csharp`, which is no longer true). The other facts of the file stay.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep Connector | sed 's/\[.*//' | sort -u | head -2`
Expected: `'CSharpModule' does not contain a definition for 'Connector'`.

- [ ] **Step 3: Implement**

In `CSharpModule`, next to `Integration`:

```csharp
    // The sandbox is the external system behind ICSharpFile, the way Gmail is behind IGmail. Its only
    // credential is the deployment's run-token key, so there is nothing for a user to authorize beyond
    // the token a run is issued; Platform requires one auth method, and "run-token" names that one.
    public static ConnectorDefinition Connector { get; } = new("csharp", "C# sandbox", ["run-token"], [])
    {
        ExternalSystem = "C# sandbox",
        OptionalIntegrations = ["csharp"],
        Neurons = [typeof(ICSharpFile)],
        Signals = [typeof(CSharpFileChanged)],
    };
```

(add `using DigitalBrain.Framework.Platform.Integrations;` — already present for `IntegrationSchema`). `CSharpPendingArrived` stays internal and unlisted: it is the grain's doorbell, not part of the contract.

`README.md`: replace the paragraph "The module declares deployment infrastructure ... CSharp does not appear in `GET /connectors`." with: the sandbox is declared as the `csharp` connector (neuron `ICSharpFile`, signal `CSharpFileChanged`), its run-token key is the optional Integration `csharp`, and the connector appears in `GET /connectors`; keep the paragraph about `RunTokenKey` and the Integration/Connection distinction.

- [ ] **Step 4: Run to verify they pass**

LSP diagnostics clean; Ring build clean; then CSharp.Tests and OS.Unit.
Expected: all pass, including the two new facts. Check the shell does not crash on the new entry: `grep -n "authMethods\|run-token" src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/connections/*.dart` and read the hit sites; if the connect menu has an auth-method switch with no default, report it in the commit body rather than editing Dart in this task.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp
git commit -m "CSharp: the sandbox is a connector behind ICSharpFile

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Layout, namespaces, one copy of the sandbox constants, DTOs and `RepositoryRoot`

**Files (git mv, then namespace edits; names stay unless stated):**

Contracts: `ICSharpFile.cs`, `CSharpFileSnapshot.cs`, `ICSharpAppBinding.cs` → `Files/`; `Signals/CSharpFileChanged.cs` → `Files/Signals/`; `Execution/CSharpSandbox.cs` leaves (moves into the module).

Module: `Files/` keeps `CSharpFileNeuron`, `CSharpFileState`, `Subscription`, `ICSharpFileArrivals`, `CSharpFileActivation`, `CSharpAppBindingGuard`; `CSharpPendingArrived` moves out of `Subscription.cs` into `Files/Signals/CSharpPendingArrived.cs`. `Authoring/CSharpCatalogNeuron.cs`, `CSharpCatalogStore.cs`, `ICSharpCatalog.cs` → `Catalog/`. `CSharpInventoryProvider.cs`, `CSharpRegistryResources.cs` → `Authoring/`. `Edge/` keeps its files and gains `ScriptRunEnvironment.cs` (from `Execution/`). `Execution/*` → `Sandbox/` (`ICSharpRunner`, `AspireSandboxRunner`, `SessionPoolRunner`, `SandboxRunsApi`, `CSharpRunState`); `Execution/SandboxMessages.cs` → `Sandbox/SandboxWire.cs`; new `Sandbox/CSharpSandbox.cs`.

- Delete: `CSharpModule.FindRepositoryRoot` and the `SourceRoot` post-configure; the module's `RepositoryRoot` walk
- Modify: Hosting `CSharpModuleHosting.cs` (projection of `SourceRoot`), `RepositoryRoot.cs` stays as the one copy
- Modify (using/namespace fallout, compile-driven): Apps (`CSharpAppRuntime.cs`, `TestScript…` none left), Apps tests, OS `OsCatalog.cs`, OS E2E facts, Assistant tests `InventoryFacts.cs`, Deployment `CSharpDeployment.cs`, AppHost `AppHost.cs`, all CSharp tests
- Test: `tests/…/SandboxWireFacts.cs` (new), `tests/…/CSharpFileNeuronFacts.cs` (replace `AnUnsetSourceRootFallsBackToTheRepository`), `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs` (new fact)

**Interfaces:**
- Consumes: everything above.
- Produces: namespaces `DigitalBrain.Microsoft.CSharp.Files`, `.Files.Signals`, `.Catalog`, `.Edge`, `.Sandbox`, `.Authoring`; `public static class CSharpSandbox` in `.Sandbox` (module assembly); `internal static class SandboxRunStates { const string Running = "Running"; const string Exited = "Exited"; }`; the Hosting projection of `DigitalBrain:Modules:csharp:Options:SourceRoot`.

- [ ] **Step 1: Write the failing facts**

`tests/…/SandboxWireFacts.cs`:

```csharp
using DigitalBrain.Microsoft.CSharp.Sandbox;
using Xunit;

namespace DigitalBrain.Modules.Microsoft.CSharp.Tests;

// The Sandbox image is built alone and cannot share a file with the module, so each side keeps its
// own copy of the HTTP shapes; this fact is what keeps the two honest.
public sealed class SandboxWireFacts
{
    private static string[] Shape(Type type)
        => [.. type.GetProperties().OrderBy(property => property.Name, StringComparer.Ordinal).Select(property => $"{property.Name}:{property.PropertyType}")];

    [Fact]
    public void TheBrainsCopyOfTheRunRequestMatchesTheImagesCopy()
        => Assert.Equal(Shape(typeof(RunRequest)), Shape(typeof(SandboxRunRequest)));

    [Fact]
    public void TheBrainsCopyOfTheRunStatusMatchesTheImagesCopy()
        => Assert.Equal(Shape(typeof(RunStatus)), Shape(typeof(SandboxRunStatus)));

    [Fact]
    public void TheRunStatesTheBrainComparesAreTheOnesTheImageSends()
        => Assert.Equal([RunStatuses.Running, RunStatuses.Exited], [SandboxRunStates.Running, SandboxRunStates.Exited]);
}
```

Replace `AnUnsetSourceRootFallsBackToTheRepository` in `CSharpFileNeuronFacts.cs`:

```csharp
    [Fact]
    public async Task ASourceRootTheHostConfiguresIsTheOneTheModuleReads()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Path.GetFullPath(Path.GetTempPath());
        await using var brain = await ModuleTest.Create().WithModule<CSharpModule, CSharpOptions>(options => options.WithSandbox(root)).StartAsync(ct);

        Assert.Equal(root, brain.SiloServices.GetRequiredService<IOptions<CSharpOptions>>().Value.SourceRoot);
    }

    [Fact]
    public async Task WithoutAConfiguredSourceRootTheModuleHasNoRepositoryAndInventsNone()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<CSharpModule>().StartAsync(ct);

        Assert.Null(brain.SiloServices.GetRequiredService<IOptions<CSharpOptions>>().Value.SourceRoot);
    }
```

Add to `OS.Tests.Unit/ProductCompositionFacts.cs`:

```csharp
    [Fact]
    public async Task TheAppHostProjectsTheRepositoryRootIntoTheBrainForTheCSharpModule()
    {
        await using var appHost = await DistributedApplicationTestingBuilder.CreateAsync<AppHost::Projects.DigitalBrain_AppHost>(
            ["Parameters:Modules-digitalbrain-master-key=synthetic-composition-test-key-32chars"], TestContext.Current.CancellationToken);
        var runtime = appHost.Resources.Single(resource => resource.Name == "IntoChat");
        var environment = new Dictionary<string, object>();
        var context = new EnvironmentCallbackContext(appHost.ExecutionContext, runtime, environment, TestContext.Current.CancellationToken);
        foreach (var callback in runtime.Annotations.OfType<EnvironmentCallbackAnnotation>()) { await callback.Callback(context); }
        var key = DigitalBrainConfiguration.EnvironmentName(DigitalBrainConfiguration.ModuleOptionsSection("csharp") + ":SourceRoot");
        var root = Assert.IsType<string>(environment[key]);
        Assert.True(File.Exists(Path.Combine(root, "DigitalBrain.slnx")));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj 2>&1 | grep -E "SandboxRunRequest|SandboxRunStates|Sandbox'" | sed 's/\[.*//' | sort -u | head -3`
Expected: `The type or namespace name 'Sandbox' does not exist in the namespace 'DigitalBrain.Microsoft.CSharp'`.

- [ ] **Step 3: Move and rewrite**

Do it in this order so the build tells you what is left: (1) `git mv` every file in the layout list; (2) set each file's `namespace` to its folder (`Files`, `Files.Signals`, `Catalog`, `Edge`, `Sandbox`, `Authoring`; `CSharpModule`, `CSharpOptions` and `CSharpDeploymentSettings` keep `DigitalBrain.Microsoft.CSharp`); (3) build each project and add the `using DigitalBrain.Microsoft.CSharp.<Folder>;` lines the compiler asks for in Module, Hosting, Deployment, Apps, Apps.Tests, Assistant.Tests, OS, OS.Unit, OS.E2E, AppHost and the CSharp tests. Orleans aliases are explicit on every grain interface and record, so no persisted or wire name changes; confirm with `grep -rn "\[Alias" src/DigitalBrain.Modules/Microsoft/CSharp --include=*.cs | grep -v "/obj/"` that each moved type kept its alias line.

`Sandbox/CSharpSandbox.cs` (moved from Contracts, public, now in the module so scripts never see hosting constants):

```csharp
namespace DigitalBrain.Microsoft.CSharp.Sandbox;

public static class CSharpSandbox
{
    public const string ResourceName = "csharp-sandbox";
    public const int Port = 8080;
    // The sandbox mounts the repository here, so scripts reference contracts by #:project path.
    public const string SourceMount = "/brain";
    public const string SourceProject = "src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox";
}
```

`Sandbox/SandboxWire.cs` (replaces `Execution/SandboxMessages.cs`):

```csharp
namespace DigitalBrain.Microsoft.CSharp.Sandbox;

// The brain's one copy of the sandbox host's HTTP shapes. The image keeps its own, checked by SandboxWireFacts.
internal sealed record SandboxRunRequest(string Source, Dictionary<string, string> Environment);

internal sealed record SandboxRunStatus(string Identifier, string Status, int? ExitCode, DateTimeOffset StartedAt);

internal static class SandboxRunStates
{
    public const string Running = "Running";
    public const string Exited = "Exited";
}
```

`SandboxRunsApi.InspectAsync`: `run.Status == SandboxRunStates.Running ? CSharpFileStatus.Running : CSharpFileStatus.Exited`.

`CSharpModule`: delete `FindRepositoryRoot`, the `PostConfigure` that assigned `SourceRoot`, and the `using` it needed. `Hosting/CSharpModuleHosting.cs`: keep `RepositoryRoot.Find()` (the one copy) and add, after the sandbox is declared:

```csharp
        brain.AddProjection(new SourceRootProjection(options.SourceRoot));
    ...
    // The silo reads the same root the sandbox mounts; the module no longer searches for it.
    private sealed class SourceRootProjection(string sourceRoot) : DigitalBrainModuleProjection
    {
        public override void Apply<TResource>(IResourceBuilder<TResource> builder)
            => builder.WithEnvironment(DigitalBrainConfiguration.EnvironmentName(
                DigitalBrainConfiguration.ModuleOptionsSection("csharp") + ":" + nameof(CSharpOptions.SourceRoot)), sourceRoot);
    }
```

- [ ] **Step 4: Build clean and run the regression net**

LSP diagnostics clean on every touched project; the Ring build `0 Error(s)` everywhere; then run all of: CSharp.Tests, Apps.Tests, OS.Unit, Architecture.Tests, Client.Tests, Assistant.Tests.
Expected: all pass with the Task 1 baselines adjusted for the facts added and deleted since (list the arithmetic in the commit body). If `Architecture.Tests` has a namespace or ring fact that fails, read it and fix the layout, not the fact. `grep -n "trigger\|subscriptions\|pending" src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/csharp/*.dart` is still empty; run `flutter analyze` from `src/DigitalBrain.Modules/Google/Flutter/app/shell` only if that grep stops being empty.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp src/DigitalBrain.Modules/DigitalBrain src/DigitalBrain.OS src/DigitalBrain.AppHost
git commit -m "CSharp: Files, Catalog, Edge, Sandbox, Authoring; namespace equals folder; one sandbox wire and one repository root

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Seen running

**Files:** none (evidence only). Do not edit code in this task; a failure here sends you back to the owning task.

**What `digitalbrain-mcp` can and cannot show.** `ICSharpFileEdge` (`Authorize`, `Subscribed`, `DrainPending`, `Acknowledge`) is internal, so it is absent from the contract catalog `neurons_search` reads: drain and acknowledge cannot be called by hand. They are exercised by a real script through the script edge, and what MCP shows is the effect on the public `ICSharpFile.Inspect` snapshot (`subscriptions[].pending/delivered/dropped`) and `ReadLogs`. The "drain survives a dead edge" guarantee is proven by `ABatchWhoseEdgeDiedMidwayIsRedeliveredAfterReconnectUntilItIsAcknowledged` (real grain, real `ScriptEdge`), not by this task; and because the edge acknowledges once the batch reached the stream, an end-to-end redelivery after killing a live sandbox cannot be provoked here. Say exactly that in the report.

- [ ] **Step 1: Start the system and check health**

Run (background): `aspire run` from `src/DigitalBrain.AppHost`. Then `mcp__aspire__list_resources`: every resource must be Running/Healthy (the `csharp-sandbox` resource starts stopped by design, `WithExplicitStart`; that is expected and is started on demand by the first script). If one is not, `mcp__aspire__list_console_logs` for it before anything else. If Docker is unavailable, stop here, run nothing further in this task, and report which steps could not run.

- [ ] **Step 2: Establish caller and brain**

`mcp__digitalbrain-mcp__neurons_context`; record the caller and the brain id `B`. `neurons_search` for `ICSharpFile` and `ITimer`; confirm `ICSharpFile` has no `Arm` and `ITimer.Start` exists.

- [ ] **Step 3: Write a file with one subscription, start it**

Via `neurons_call` on `ICSharpFile` keyed `B/csharp/verify-sub` (the one key grammar):

- `Write` with the `Samples/timer-report.cs` program (it subscribes with `brain.On<TimerTick>(timer)` and prints `TimerTick …`), `Configure` `{ "TimerId": "verify-tick" }`, `Start`.
- `ReadLogs` until it shows `TimerReport ready` (this waits on the sandbox's first build; do not shorten or poll with a short timeout, and do not raise one: if the sandbox takes minutes, read the `csharp-sandbox` console logs).
- `Inspect`: expect `status: Running` and exactly one entry in `subscriptions` with `pending: 0, delivered: 0, dropped: 0`.

- [ ] **Step 4: Publish the signal and read the effect**

`neurons_call` `ITimer` keyed `verify-tick`: `Start` with a zero delay so one `TimerTick` publishes. Then `ReadLogs` until `TimerTick verify-tick` appears, and `Inspect`: expect `subscriptions[0].delivered == 1`, `pending == 0`, `dropped == 0` (the edge drained, handed the batch to the stream and acknowledged it).

- [ ] **Step 5: Confirm the spans and log lines**

`mcp__aspire__list_traces` filtered to the brain resource and `list_trace_structured_logs` for the trace of the `ITimer.Start` call and of the `Inspect` call: expect the grain-call spans for `ICSharpFile` `Subscribed`, `DrainPending` and `Acknowledge` (edge calls) and, in structured logs, whatever the framework logs for the `CSharpFileChanged` publication. `CSharpFileChanged` is a signal, not necessarily a span: record exactly which spans and log lines exist, with trace ids. If no `CSharpFileChanged` evidence exists in telemetry, report that plainly instead of claiming it.

- [ ] **Step 6: Authoring off, seen once**

Stop the AppHost, set `DigitalBrain:Modules:csharp:Options:Authoring=false` in the AppHost launch settings or environment for one run only (do not commit it), `aspire run`, then `neurons_search` / the registry listing must not offer the `csharp_*` tools and `GET /brains/{B}/csharp/` must return 404 while `Inspect` on the file still works. Revert the setting.

- [ ] **Step 7: Clean up and run the regression net**

`Delete` the verify file (`ICSharpFile.Delete`), stop `aspire run`. Run CSharp.Tests, Apps.Tests, OS.Unit, Architecture.Tests, Client.Tests and Assistant.Tests one last time, and the OS.E2E CSharp facts if Docker is up: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*TheSandboxStartsOnDemand*"` and `-- --filter-method "*EveryShippedSynapseIsAlive*"`. Expected: green; paste the `total/failed` lines into the final report.

- [ ] **Step 8: Commit**

No code changes means no commit. If a doc or a fact needed a correction discovered here, it is fixed in the owning task's files and committed as `CSharp: <what the running system showed>`.

---

## Self-review

**Spec coverage.** Decision 1 → Tasks 3 (Trigger deleted) and 5 (one path; every re-derivation named in the audit is now `Judge` or exact-id `Authorize`). Decision 2 → Task 2 (`DrainPending`, `Acknowledge`, `Dropped`, option cap, edge ack) with the interpretation flagged. Decision 3 → Task 6. Decision 4 → Task 4 (`CSharpCatalogStore.FileKey`, `AppProgramKey`, tests, E2E; no `specs/…` key survives the Apps drop-tests commits; `RecordingCSharpFile.cs` composes no key and changes in Task 3 only). Decision 5 → Task 7. Decision 6 → Task 8 (layout, namespaces, `CSharpSandbox`, DTOs, `RepositoryRoot`). Decision 7 → Global Constraints; no task adds a timeout or polling, and the one place the audit found polling (`EnsureSandboxAsync`) is left alone and named. Required facts: drain survives a dead edge (Task 2), overflow visible (Task 2), one path for both shapes (Task 5), authoring off hides tools and routes (Task 6), connector listed (Task 7).

**Placeholder scan.** The only deliberately open items are the commit-body test counts (they come from the runs), and the Task 6 "remaining registrations unchanged" comment, which refers to lines that exist verbatim in `CSharpModule.cs` today.

**Type consistency.** `Subscription`, `PendingBatch`, `RunRecord`, `ICSharpFileArrivals.Arrived`, `CSharpFileKeys.For`, `CSharpOptions.MaximumPending`/`Authoring`, `CSharpSubscriptionView(Neuron, Signal, Pending, Delivered, Dropped)` and `CSharpFileSnapshot(Id, Source, Settings, Status, ExitCode, StartedAt, ShouldRun, Failures)` are spelled the same in every task that uses them.

**Known limits of this plan.** Test code was written against the harness as read, not compiled; Task 1 Step 4 and each Step 2 are where a wrong helper name surfaces. `Arm` and `brain.Trigger<T>()` deletions, the exact-id `Authorize`, the connector appearing in the shell and the edge-side acknowledgement are decisions the ratified text implies but does not state; they are listed under Findings for your review.
