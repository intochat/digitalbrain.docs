# Creator & Live Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live app becomes the primary artifact (created running, edited per behavior, allowed red); the package becomes history + sharing only, with Publish the sole green gate.

**Architecture:** Four sequential stages, each a shippable commit chain on `os`: (A) finish the runtime seam and delete App.cs's migration museum (#140 + #137); (B) delete the legacy `PackageContent.Source` representation (#139); (C) the live-app redesign — editable apps, Creator services replacing AppDraft, save=commit, publish=gate (#138 + #141); (D) de-brand what survives (#142). Dev-only ruling applies throughout: hard deletes, no data migrations, reinstall/reconnect acceptable; append-only `[Id]` discipline kept anyway.

**Tech Stack:** Orleans 10 grains, .NET 11, module rings (DigitalBrain / Framework / Platform), Flutter shell (Dart), xunit facts via ModuleTest real-grain clusters.

**Spec:** docs/superpowers/specs/2026-10-07-creator-live-apps-design.md

## Global Constraints

- Build/test per project, never the .slnx. Smoke: `aspire run` from src/DigitalBrain/AppHost/DigitalBrain.AppHost, all resources Healthy.
- Persisted types: `[Alias]`, append `[Id(n)]`, never renumber; retired fields keep their ids reserved as comments; concrete arrays only.
- Signals publish only from their source neuron; no publish-as-someone-else.
- No secrets in options; no LLM in the publish gate or signal path (Creator services may call models; verification never does — scripted connectors only).
- Wire-shape changes mirror in the Dart shell in the same commit.
- Grain hazards: no self-calls on non-reentrant grains; long work (model loops, verification) never runs inside a grain turn.
- Dev-only ruling (ratified): deleting persisted fields/aggregates without data migration is allowed; say so in the commit message each time.

## Review Focus

1. Editing a behavior while its old script is mid-run: the swap must restart the file and resume at the watermark, never double-deliver (Stage C Task C2 fact: edit during an in-flight signal; handler dedup observed).
2. A red app at brain restart: reactivation of an app whose behavior fails to compile must keep the app Listed + Installed with the failure on the behavior, not throw on activation (C2 fact: reload red app).
3. Publish with stale verdicts: Creator verdicts are advisory; `Publish` must re-run the full suite and refuse on red regardless of green-looking cached verdicts (C4 fact: tamper a verdict, publish still re-verifies).
4. Uninstall with the Postgres module absent: with AbandonStorage deleted, uninstall must fail loudly when the storage hook cannot run, not drop table ownership silently (A3 fact).
5. Fork of a revision whose scenarios are red (allowed red history): fork must still materialize a live app (red), not refuse (C5 fact).

---

## Stage A — Runtime seam + delete the museum (#140, #137)

### Task A1: IDeployableRuntime seam

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Runtimes/IDeployableRuntime.cs`
- Create: `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Apps/CSharpAppRuntime.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Workspace/App.cs` (Deploy/Retire/FileKey move out)
- Modify: CSharp module registration; Apps module loses `DigitalBrain.Microsoft.CSharp` using in App.cs
- Test: Apps tests (AppFacts) + CSharp tests

**Interfaces (Produces):**
```csharp
// Apps runtime assembly. A runtime that materializes an app's programs as running neurons.
public interface IDeployableRuntime
{
    string Name { get; } // matches PackageManifest.RuntimeName
    // Writes+configures+starts one ICSharpFile (or equivalent) per program; returns the storage keys deployed.
    Task<string[]> Deploy(AppDeployment deployment, CancellationToken ct);
    Task Retire(string appKey, string[] storageKeys, CancellationToken ct);
}
public sealed record AppDeployment(string AppKey, string BrainId, int Generation,
    IReadOnlyDictionary<string, string> Programs, IReadOnlyDictionary<string, string> Configuration);
```
`CSharpAppRuntime` owns the `app-csharp-` + SHA256 file-key derivation (moved verbatim from `App.FileKey`), `ICSharpAppBinding.BindApp`, Write/Configure/Start, Delete on retire. `App.cs` resolves `IEnumerable<IDeployableRuntime>` by manifest runtime name; a runtime with no deployable registered deploys nothing (GroupChat/Prompt answer via `IAppRuntimeWorker` as today). The ten `== PackageManifest.CSharpRuntime` string checks in App.cs/AppService/AppPublishing collapse to "is there a deployable runtime named X".

- [x] Write failing Apps fact: installing a csharp app with a registered `CSharpAppRuntime` deploys files (observable via `RecordingCSharpFile`/FakeSandbox pattern already used in AppFacts) while `App.cs` no longer references `ICSharpFile` directly.
- [x] Implement seam; move code; run Apps + CSharp suites.
- [x] Commit: `refactor(apps): csharp becomes a deployable runtime, not a special case (#140)`

### Task A2: Postgres storage hook

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Runtimes/IAppStorageHook.cs`
- Create: `src/Modules/Postgres/DigitalBrain.Modules.Postgres/Apps/PostgresAppStorageHook.cs`
- Modify: `App.cs` (drop `DigitalBrain.Postgres` using, `PostgresScopes` sniffing, `IPostgresTable` assembly checks)

**Interfaces (Produces):**
```csharp
public interface IAppStorageHook
{
    // After a deployment: carry storage ownership to the new generation's keys.
    Task Deployed(string brainId, string appKey, string[] storageKeys, CancellationToken ct);
    // On uninstall: retire everything the app owned.
    Task Retired(string brainId, string appKey, string[] storageKeys, CancellationToken ct);
}
```
Postgres registers the hook; it owns table-owners migrate/retire. `AppState.PostgresScopes` field retires (id reserved). Hooks run for every app — the hook itself no-ops cheaply when the app owns no tables.

- [x] Failing fact: uninstalling an app invokes the registered hook with the app's storage keys (fake hook in Apps tests); Postgres suite covers its hook against real tables (existing live-gated facts).
- [x] Implement; run Apps + Postgres suites. Commit: `refactor(apps): storage ownership moves behind IAppStorageHook (#140)`

### Task A3: Delete the museum

**Files:**
- Modify: `App.cs` — delete `BackfillStorageFiles` + `StorageHistoryKnown`, `Adopt`/`IAppAdoption`, `IAppStorageHandover`/`ReadStorageOwners`, `AbandonStorage`/`PendingAbandonStorage`/`AbandonedStorage`, the `IAppGrantMigration` call, all `"table-owners-v1"` ensures (now inside the Postgres hook), and merge `Receipts`+`LifecycleReceipts` into one list (`Receipts`; `LifecycleReceipts` id reserved).
- Modify/Delete: `Workspace/IAppAdoption.cs`, `Contracts/Workspace/AbandonAppStorage.cs`, abandon-storage route in `PackageEndpoints.cs:52`, `AppRequirementsException.RestorePostgres` (uninstall with hook unable to run now throws plainly).
- Test: AppFacts/AppRequirementFacts prune deleted behaviors; new fact per Review Focus 4.

- [x] Delete, fix facts, run Apps suite + OS unit. Commit: `refactor(apps)!: delete the migration museum — dev-only, no data carried (#137)`

## Stage B — One file model (#139)

### Task B1: Delete PackageContent.Source

**Files:**
- Modify: `Contracts/Packages/PackageContent.cs` — `Source` property deleted outright (dev-only; `[Id(1)]` reserved with comment); `Programs()` filters `Files` only; `SourcePath` stays as a conventional path.
- Modify call sites: `AppDraftNeuron.cs:131,197,209` (Read file-merge, Implement, BuiltApp.Source), `MarketplaceService.cs:23`, `PackageRules.cs:44`, any `content.Source` consumers (grep).
- Modify: Builder prompt/output — `BuiltApp` record loses `Source`; `AgentPrompts.Builder` tells the model to write `behaviors/*.cs` (and may write `app.cs` as an ordinary file).
- Shipped apps: `WordCount/app.cs` becomes a `Files` entry via the shipped-source loaders (`DirectoryShippedAppSource` reads it into Files).
- Test: PackageCommitFacts/serialization facts updated; a fact that a legacy-shaped payload with Source still deserializes (id reserved) but new commits never write it.

- [x] Implement, run Apps suite + E2E compile, commit: `refactor(apps)!: one file model — PackageContent.Source deleted (#139)`

## Stage C — The live app and the Creator (#138, #141, the redesign)

### Task C1: Editable app surface on IApp

**Files:**
- Modify: `Contracts/Workspace/` — new operations on `IApp`:
```csharp
Task<AppSnapshot> Create(CreateApp request);            // scaffold: name/title/runtime; installs empty, running, red
Task<AppSnapshot> WriteBehavior(string path, string source, Guid operationId); // upsert behaviors/x.cs, hot-swap that file
Task<AppSnapshot> DeleteBehavior(string path, Guid operationId);
Task<AppSnapshot> SaveDocument(AppAuthoringDocument document, Guid operationId); // scenarios canonical on the app
Task<AppContent> ReadContent();                          // manifest + files + document + verdicts
```
- `AppState` gains `[Id(next)] Dictionary<string,string> Files`, `[Id] AppAuthoringDocument? Document`, `[Id] AppScenarioVerdict[] Verdicts` (append ids after existing).
- `WriteBehavior` deploys exactly that file through the Stage A `IDeployableRuntime` (per-file deploy — add `DeployOne(AppDeployment, string path)` default method or deploy with a single-entry Programs map); failure to start records a per-behavior error on the snapshot, app stays Installed.
- The free-text spec is `AppDocumentCodec.ExportSpec(Document)` — computed, never stored.
- Test: new `LiveAppFacts` — create → write behavior → file deployed; edit → same key redeployed; broken source → behavior error recorded, app still answers `Read`; reload red app (Review Focus 2); two brains isolated.

- [x] Facts first, implement, Apps suite green, commit: `feat(apps): the live editable app — created running, edited per behavior, allowed red`

### Task C2: Watermark/resume + in-flight edit fact

- [x] Fact per Review Focus 1 in LiveAppFacts using `RecordingCSharpFile`/FakeSandbox: signal in flight, behavior edited, delivery resumes at watermark without double-handling. (Mechanics are CSharp-module behavior; the fact pins the composition.) Commit with C1 if small.

### Task C3: Creator services replace AppDraft (#141)

**Files:**
- Create: `Authoring/CreatorService.cs` (DI service): `Author(appKey, request)` and `Implement(appKey, instruction)` — the existing Author/Builder agent loops moved verbatim out of `AppDraftNeuron` (same prompts, tools, retries), now *editing the live app* via `IApp.SaveDocument`/`WriteBehavior`. Runs in the service, never a grain turn; the app grain stays responsive.
- Create: `Authoring/ScenarioRunService.cs`: `Run(appKey, scenarioIds?)` — incremental verification: scratch install + scripted connectors per affected scenario (`app.authoring.json` associations = dependency map), writes verdicts back via a dedicated `IApp.RecordVerdicts(AppScenarioVerdict[], Guid operationId)`.
- Delete: `AppDraftNeuron.cs`, `AppDraftsNeuron.cs`, `AppDraftDocuments.cs`, `AppDocumentConversion.cs`, Contracts `Authoring/AppDraft*.cs`, `IAppDraft*.cs` (the `intochat.app-draft*` identities die — dev-only).
- Modify: `MarketplaceEndpoints.cs` — `/packages/drafts*` routes replaced by Creator routes on the app:
  `POST /apps/{owner}/{name}/creator/author`, `/creator/implement`, `/creator/run` (+ existing app read). Draft list route deleted; the app menu is the apps index.
- Modify: Assistant tools that referenced drafts (grep `IAppDraft`, draft tool names) → Creator routes.
- Modify Dart in same commit: `app_draft_controller.dart`, `create_app_screen.dart`, `apps_screen.dart` re-point to Creator endpoints (functional adaptation; full Creator IDE UX is a follow-up issue).
- Test: `CreatorFacts` with scripted LLMs — author populates document on live app; implement writes behaviors and hot-swaps; run records per-scenario verdicts; only affected scenarios re-run (fact: edit one behavior, only its scenarios' verdicts change).

- [x] Facts, implement, Apps + Assistant suites, `flutter analyze` + `flutter test`, commit: `feat(apps)!: Creator services on the live app; the draft pipeline is deleted (#138, #141)`

### Task C4: Save = commit, Publish = the gate

**Files:**
- Modify: `AppService`/`PackageEndpoints` — `POST /apps/{owner}/{name}/save` commits `ReadContent()` to package `owner/name` (creating it on first save; red allowed — commits were never gated). `Publish` unchanged except it reads the latest committed revision and re-runs full verification (Review Focus 3 fact: stale/tampered app verdicts don't bypass the gate).
- `ShippedAppPublisher` unchanged (commit→verify→publish→install path for first-party stays).
- Test: save red app → revision exists; publish red → refused; publish green → marketplace lists.

- [x] Facts, implement, commit: `feat(apps): save commits history, publish stays the only gate`

### Task C5: Fork → live app; install unchanged

- Modify: fork endpoint materializes the forked revision as a live app in the caller's brain (install + content copy into `Files`/`Document`), red allowed (Review Focus 5 fact).
- [x] Fact, implement, Apps suite + both E2E suites, commit: `feat(apps): fork materializes a live app`

## Stage D — De-brand what survives (#142)

### Task D1: Renames + glue move

- Rename remaining `intochat.*` Apps identities (grep Contracts + runtime; draft ones died in C3) to `apps.*` — dev-only hard rename, no identity shims; note in commit.
- Move `BuiltInSettingsEndpoints`/`BuiltInSettingsOptions` to DigitalBrain.OS composition; delete Apps→Flutter.Contracts ProjectReference.
- [x] Run Apps + OS suites, packaging-manifest test, commit: `refactor(apps)!: apps.* identities; product glue returns to the host (#142)`

## Closure

- [x] Full pass: Apps, CSharp, Postgres, Assistant, OS unit; Framework+OS E2E; `aspire run` smoke all Healthy.
- [x] Close #137, #138, #139, #140, #141, #142 with evidence comments; file the follow-up issue "Creator IDE UX in the shell" for the full visual experience.
