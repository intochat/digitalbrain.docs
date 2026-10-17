# Unified Presentation Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Ino, Assistant, and Creator-generated apps through one workspace authority and explicit app-owned presentation roots.

**Architecture:** Apps publish a typed root after preparing UI neurons. Workspace owns hosting and focus; Flutter reads that state and renders roots using the existing palette. Creator generates the same preparation/publication behaviors as first-party apps.

**Tech Stack:** C#, Orleans, the brain's compiled behavior runtime, Flutter/Dart, Flame, Aspire, digitalbrain-mcp.

**Spec:** `docs/superpowers/specs/2026-10-12-presentation-hosting-design.md` (approved).

**Planning status:** Draft with a verified prerequisite. Not ready for execution: Task 0 requires a separately approved assignment-identity design. Downstream interfaces are proposed planning decisions and must be finalized against that prerequisite before implementation. No product code was changed while writing this plan.

## Global Constraints

- The workspace owns visibility and focus. An app owns its work and presentation. The connector draws workspace state and reports input.
- Presentation is a field containing a neuron reference, not a fifth runtime object.
- There is one root authority in app state, not another root declaration in the manifest.
- Persist concrete arrays. Use internal helpers rather than self-calling a non-reentrant grain.
- One hosted instance per app is sufficient.
- Compilation remains the publish gate. Publish, Marketplace, Install, and FeatureLoader remain the program-sharing path.
- No model is introduced into presentation rendering.
- Map every changed C# and Dart symbol through LSP before editing; clean diagnostics, per-project builds, module unit/E2E checks, then runtime verification. Never build the solution.
- No per-app tests. Test module contracts with real grains using the shared harness; prove authored app behavior through the running system.
- Use an isolated worktree at execution time. Preserve the unrelated `Directory.Packages.props` change in the current checkout.

## Review Focus

- A delayed old execution uses the same behavior name as its replacement: reject its publication even if it supplies the newest revision (Task 0 prerequisite, Task 2 acceptance).
- Close or switch brains while a root read completes: a late result must neither mount in the wrong brain nor restore focus (Tasks 3 and 5).
- A root is legitimately empty, unsupported, inaccessible, or fails after an earlier success: distinguish these states without guessing a surface (Tasks 2 and 5).
- Two clients change workspace state concurrently: conflict recovery must retain the command identity and never replay navigation as a new action (Tasks 3 and 5).
- A watch disconnects between subscription and snapshot: recover the current root and workspace without polling or a renderer-driven `open` loop (Tasks 3 and 5).

## Planning findings and execution gate

`RuntimeEdge.InvokeAsync` calls `Identity(session, invocation.Behavior)`. `BrainRuntimeNeuron.Identity` looks up the currently assigned program by behavior name. `BehaviorIdentity` carries principal and owner; `CallerContext` carries app identity, but neither includes a verified assignment generation. `ProgramView` exposes a content hash, not an assignment generation. Therefore the traced path cannot prove that a caller is the current execution of a replaced behavior. This is a source-level finding, not a runtime exploit claim.

Do not stamp the current generation merely by looking up the submitted behavior name: that would bless old execution as new. Do not accept a setting, public hash, or script parameter as execution authority. The approved spec explicitly requires an independent design decision if current identity is insufficient.

There is also a dependency issue: Apps.Contracts references only DigitalBrain, while `UiChildRef` currently lives in Flutter.Contracts. Move the existing small record to the shared vocabulary rather than introduce a module-contract dependency or duplicate the record.

## File ownership map

Paths below are relative to the repository root. Use these exact directory aliases in task file lists:

| Alias | Directory |
|---|---|
| `AppsC` | `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts` |
| `Apps` | `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps` |
| `AppsT` | `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` |
| `FlutterC` | `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts` |
| `Flutter` | `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter` |
| `FlutterT` | `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests` |
| `Dart` | `src/DigitalBrain.Modules/Google/Flutter/app` |
| `CSharp` | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp` |

Task 1 owns vocabulary placement; Task 2 owns app readiness; Task 3 owns hosting state and transport; Task 4 owns behavior integration and Creator; Task 5 owns connector composition. Task 6 proves the integrated experience and removes remaining rival paths. Execute in dependency order; tasks are not independent parallel work.

### Task 0: Resolve assignment identity before product edits

**Read/map:** `CSharp/Edge/RuntimeEdge.cs`, `CSharp/Runtime/IBrainRuntimeEdge.cs`, `CSharp/Runtime/BrainRuntimeNeuron.cs`, `CSharp/Runtime/BrainRuntimeState.cs`, `CSharp/Sessions/SessionTokens.cs`, `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/V1/RuntimeProtocol.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/CallerContext.cs`.

**Consumes:** the spec's host-verified assignment requirement.
**Produces:** a separately approved contract for execution-bound assignment identity and its destination-side validation. This plan deliberately does not invent that contract.

- [ ] Map the issuance, sandbox delivery, call transport, trusted stamping, replacement, retirement, and destination validation paths through LSP. Record the exact symbols and callers in the prerequisite design.
- [ ] Propose an assignment-bound credential carried by the trusted runtime client, with revocation on replacement and validation at the destination mutation. Explicitly address in-flight calls and the shared sandbox session trust boundary; adding a public revision field alone is insufficient.
- [ ] Define real runtime tests for old/new executions sharing a behavior name, same-content reassignment, forged current revision, retirement, and replacement between edge authentication and grain mutation.
- [ ] Obtain approval of that prerequisite design. Finalize this plan's revision source and mutation guard against it, then review the executable plan before starting product changes.

This gate follows both the approved spec and CLAUDE.md's instruction not to improvise run-token tightening. It is not permission to implement a broad runtime security redesign.

### Task 1: Share the existing typed UI reference

**Files:** Move `FlutterC/Shared/UiChildRef.cs` to `src/DigitalBrain/Presentation/UiChildRef.cs`; modify affected contract consumers discovered by LSP; test `src/Testing/DigitalBrain.Architecture.Tests/BoundaryFacts.cs`.

**Consumes:** existing `UiChildRef(string Kind, string Name)`.
**Produces:** the same record and serializer alias `ui.child-ref` from the DigitalBrain assembly. Keep its namespace for this narrow assembly move; do not create a forwarding shim or a second record.

- [ ] Add an architecture assertion that the reference is in the DigitalBrain assembly and Apps.Contracts still references only the shared vocabulary; run the architecture project and observe the intended failure.
- [ ] Move the record and update symbol references where necessary. Preserve JSON `kind`/`name` shape and the serializer alias. Map any assembly-qualified consumers and the sandbox contract fingerprint.
- [ ] Build the DigitalBrain, Apps.Contracts, and Flutter.Contracts projects separately and run architecture checks. Require clean LSP diagnostics and no module-to-module contract reference.
- [ ] Commit only this vocabulary move and its architecture assertion.

### Task 2: Persist discoverable app readiness

**Files:** Create `AppsC/Apps/AppPresentation.cs` and `AppsT/Apps/AppPresentationFacts.cs`; modify `AppsC/Apps/IApp.cs`, `AppsC/Apps/AppSnapshot.cs`, `Apps/Apps/AppState.cs`, `Apps/Apps/AppNeuron.cs`, `Apps/Runtimes/CSharpAppRuntime.cs`, and `Dart/core/lib/src/models/installed_app.dart`.

**Consumes:** shared `UiChildRef` and Task 0's approved assignment guard.
**Produces:** `AppPresentation(long ProgramRevision, long Revision, UiChildRef? Root, string? Error)` in app state/snapshot; `Task SetPresentation(long expectedProgramRevision, UiChildRef root)` and `Task FailPresentation(long expectedProgramRevision, string error)` on `IApp`. The generation source remains gated by Task 0, not guessed from `Version` or `BuildAttempt`.

- [ ] Add real-grain facts: first publication persists a root; identical publication leaves its revision unchanged; failure clears readiness and records an error; success clears the error; foreign app/root ownership and stale assignment are refused; replacement clears old readiness; reactivation retains current readiness.
- [ ] Run `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*Presentation*"`; require the new API/behavior failures before implementation.
- [ ] Implement success/failure persistence through internal helpers, including `AppState.Clone`, snapshot construction, assignment invalidation, and existing app-change notification. Reject blank kinds/keys and invalid ownership. Do not call the grain through its own interface.
- [ ] Update the Dart snapshot mirror and its parser tests in the same task. Null root plus null error is unprepared; null root plus error is failed; non-null root is prepared. A prepared empty text value is valid.
- [ ] Rerun the focused facts and the affected projects' builds. Confirm the old-execution test from Task 0 exercises the actual edge rather than a forged test-only caller. Commit.

### Task 3: Make workspace the hosting authority

**Files:** Modify `FlutterC/Workspace/IWorkspace.cs`, `FlutterC/Workspace/WorkspaceState.cs`, `Flutter/Workspace/WorkspaceNeuron.cs`, `Flutter/Workspace/WorkspaceEndpoints.cs`, `FlutterT/Workspace/WorkspaceFacts.cs`, `FlutterT/Workspace/WorkspaceWindowHttpFacts.cs`, and `Dart/core/lib/src/models/workspace_models.dart`.

**Consumes:** app keys and presentation state from Task 2.
**Produces:** spec methods `Show(app, operationId, expectedRevision)`, `Close(app, operationId, expectedRevision)`, `SetHome(app, expectedRevision)`, and `SetCompanion(appOrNull, expectedRevision)`, returning `Task`; snapshot fields `HomeApp`, `CompanionApp`, concrete `OpenApps`, and `FocusedApp` alongside unrelated workspace data.

- [ ] Add facts asserting Show focuses once, duplicate Show cannot steal newer focus, duplicate Close cannot undo a later reopen, conflicting reuse of an operation ID is refused, stale revisions preserve state, foreign-brain app keys are refused, and closing the focused app selects Home. Reactivate the grain and repeat duplicate requests.
- [ ] Run the Flutter module's workspace facts and observe intended failures.
- [ ] Persist navigation and operation receipts together. Check a known operation before optimistic revision rejection, so retries can return without replaying the effect. Publish only after a successful save; reconstruct required preparation from durable state after restart.
- [ ] Add authenticated `/brains/{brain}/workspace/show`, `/close`, `/home`, and `/companion` POST routes using the brain-scoped workspace. Requests mirror the method parameters; successful endpoints read and return current workspace state, conflicts return 409. Keep one workspace snapshot read path and connected-source handling.
- [ ] Replace the workspace SSE race (its comment explicitly says it only narrows the gap) with the existing registered-watch/snapshot pattern. Test a mutation at the subscription boundary and stream reconnection without polling.
- [ ] Update Dart wire models and concurrency tests in the same task. Verify module tests and builds, then commit.

### Task 4: Prepare apps through behaviors and ground Creator

**Files:** Create `features/os/Workspace/app.cs`, `Workspace.cs`, and separate `workspace-changed.cs` / `app-changed.cs` reactions; modify `features/os/Ino/open.cs`, `features/os/Assistant/open.cs`, `features/os/Assistant/Assistant.cs`, `Apps/Authoring/AgentPrompts.cs`, `Apps/Apps/Creator.cs`, `CSharp/Authoring/CSharpScriptSandbox.cs`, `AppsT/Apps/AppCreatorFacts.cs`, and `AppsT/BuilderContractSearchFacts.cs`.

**Consumes:** workspace/app state and Task 2 publication methods.
**Produces:** an OS behavior bundle that reconciles required presentation preparation from workspace/app state; first-party and Creator-produced apps publish roots without changing workspace focus.

- [ ] Before editing, map existing OS startup/default installation and cross-app subscription authorization. The behavior must be installed through the normal feature path and have existing enforced access to workspace/app changes. If that scope is unavailable, stop for the spec's cross-app-scope decision; do not add a new bypass.
- [ ] Add module-level Creator facts asserting the authoring contract includes a visible-result obligation, `open` prepares/publishes a root, and discovered contracts contain the root publication API. Use the existing fake Creator model/harness; do not add per-app tests.
- [ ] Implement Workspace reactions with one `await foreach` over one source each. Rebuild desired preparation from Home, Companion, OpenApps, and current app assignment/readiness. Retain preparation attempt/outcome state in neurons; an unchanged failure is displayed until explicit retry, not retried on every change signal.
- [ ] Ino composes and publishes its scene root. Assistant composes and publishes its surface root. Neither opens a window or selects Stage/workspace focus during preparation. Repeated preparation preserves conversation state.
- [ ] Update Author, Builder, and sandbox examples together: expose an `IText` root for the minimal generated app; use the exact Task 2 methods; never write a `/surface` expectation into the client or declare a duplicate root in the manifest.
- [ ] Run Creator module facts, build affected projects, and compile-check the changed bundles through the existing feature gate. Commit.

**Remaining planning dependency:** the exact preparation receipt/explicit-retry contract must be finalized after Task 0 so it keys attempts by verified assignment and does not turn app progress into an infinite reopen loop. This draft must not be treated as executable before that interface is recorded.

### Task 5: Render main and companion through one app host

**Files:** Modify `Dart/core/lib/src/ui_client.dart`, `Dart/ui/lib/src/composition/application_surface.dart`, `Dart/ui/lib/src/composition/neuron_view.dart`, `Dart/shell/lib/workspace/workspace_app.dart`, `workspace_store.dart`, `workspace_remote_controller.dart`, and `workspace_desktop.dart`; remove top-level StageHost selection from its caller. Update `Dart/shell/test/application_surface_test.dart`, `workspace_app_open_test.dart`, `workspace_focus_test.dart`, `workspace_remote_controller_test.dart`, and `workspace_channel_wiring_test.dart`.

**Consumes:** server-owned workspace snapshot and app presentation states.
**Produces:** a read/watch app host that passes the published root to NeuronView; client hosting commands with stable operation IDs; no fabricated surface/window result.

- [ ] Add widget/client tests for a scene root, text root without surface wrapper, prepared empty text, pending/error/unsupported roots, root replacement, remount without `open`, and inaccessible apps. Test a brain switch while an earlier read completes.
- [ ] Add hosting tests: Home in main area without focus; focused app replaces main; companion remains; focused companion suppresses duplicate mount; close returns Home. Assert client reconciliation never invents a different focus.
- [ ] Implement app-state read/watch and explicit retry using the finalized Task 4 interface. Wire existing scene clients and neuron watches through the generic host. Route actions through the normal edge neuron APIs.
- [ ] Remove `openApp`/`openDockedApp` fabricated results and shell-local navigation authority. Show commands go to workspace; mounting prepared UI only reads. Keep optimistic feedback distinct from authoritative focus.
- [ ] Test wide/narrow layouts with existing shell sizing conventions: a collapsed companion remains directly reachable, and an Assistant answer exposes unread state without stealing focus. Map existing conversation read-state before deciding its storage; absence of durable read-state is a plan amendment, not local widget-only state.
- [ ] Run `flutter analyze` and `flutter test` from `Dart/shell`, and focused tests in `Dart/ui` and `Dart/core`. Hot reload/restart the connected Flutter app when executing the change. Commit.

### Task 6: Remove competing entry points and prove the slice

**Files:** Modify `features/os/Ino/dock.cs` (remove its competing routing reaction), `features/os/BrainView/open.cs`, first-party `open.cs` callers found by LSP, `features/os/DataVisualizer/Views.cs`, `FlutterC/Workspace/WorkspaceWindows.cs`, old workspace endpoints and shell entry points found by references. Update existing module integration facts rather than creating per-app tests.

**Consumes:** the unified host and publication path.
**Produces:** the end-to-end acceptance evidence and removal of all five rival hosting paths named in the spec.

- [ ] Inventory every old Open/OpenSurface/Stage navigation call through LSP, including runtime-bound feature scripts and Dart mirrors. Migrate each app preparation path to root publication. Convert table/data opening to selecting content within its owning app, then showing that app; retain one instance per app and no parallel table focus owner.
- [ ] Verify Stage is no longer mounted as an alternative OS host. Keep `IScene` rendering and only app-internal scene navigation that has a concrete caller. Remove obsolete endpoints/helpers after their callers are migrated; no compatibility shims.
- [ ] Run affected module unit/E2E suites using their shared InProcess/Aspire targets, per-project builds, clean LSP diagnostics, and Flutter checks. Require existing table/data and Circle entry paths to pass as well as Ino/Assistant.
- [ ] Run `dotnet run digitalbrain.cs`. Confirm Aspire resources Healthy; inspect failing resource logs before proceeding. Through digitalbrain-mcp, confirm caller/brain, discover the changed contracts, set Home/Companion, and drive Show/Close/read operations.
- [ ] Use Creator to generate the text-only app, invoke its domain operation, host its published text root, and confirm no surface wrapper is required. Open Ino and verify a scene root. Complete an Assistant turn while the generated app is focused and verify the answer stays available.
- [ ] Exercise late completion after Close, duplicate commands after focus changes, grain reactivation, script-cache restart, stale assignment publication, preparation failure, and reconnect. Confirm app/root/workspace state and matching traces/logs, including connector evidence of the chosen root.
- [ ] Record exact commands, outcomes, and unresolved credential limitations in the execution report. Commit the integration changes only after evidence supports the acceptance claims.

## Verification commands

Run commands from the repository root unless stated otherwise. Every build uses an affected `.csproj`, never `DigitalBrain.slnx`.

```powershell
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet run digitalbrain.cs
```

The prerequisite's execution plan must add its own exact runtime-edge tests. Use the existing target selection conventions for E2E runs rather than inventing flags. UI checks run `flutter analyze` and `flutter test` in each affected Dart package. Passing tests mean zero failures; runtime acceptance additionally requires Healthy resources, real neuron state, and supporting telemetry.

## Self-review and handoff

The spec's ownership, readiness, Creator, connector, deletion, and acceptance requirements are mapped to tasks. Three interfaces remain explicitly gated rather than falsely finalized: verified assignment identity (Task 0), durable preparation/retry receipts (Task 4), and the existing durable conversation read-state integration (Task 5). The latter two are implementation-planning follow-ups after the identity prerequisite; neither may be implemented as process-local state.

Recommendation: resolve the assignment-identity prerequisite first, finalize this plan, then choose an execution method. Native execution is a reasonable default because the tasks share tightly coupled C#/Dart contracts and must run in order. No execution method has been selected by the user, and no product implementation is authorized by this draft.
