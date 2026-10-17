# Neuron Space UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One screen draws every neuron the same way: a Flame sphere with fixed slots around it, navigated by zoom over a workspace path, with Ino, Files and a new Friends app as the three reference apps.

**Architecture:** An app publishes one `Presentation(Sphere, Side, Main)` into its own state under the program-revision guard; the workspace neuron holds only `Path` and `Open`; a Flutter-module neuron (`{brain}/space`) derives one Flame scene per brain from those and writes it into the Flame scene neuron the shell already streams. Sphere behavior is a `BehaviorTree` in scene data, validated by `FlameSchema` and run in Dart with `flame_behavior_tree`. The optimistic-concurrency guard and idempotent operation replay live once, in the base neuron, and the conflict crosses the script boundary typed.

**Tech Stack:** .NET 11 RC / Orleans (grains), ASP.NET minimal APIs, Roslyn scripts (`features/`), Flutter + Flame 1.38 + `flame_behavior_tree` ^0.1.5+5 (`behavior_tree` ^0.1.5+1), xunit facts on `TestBrain`, `flutter test`.

**Spec:** `docs/superpowers/specs/2026-10-13-neuron-space-ui-design.md`. Companion: `docs/superpowers/reviews/2026-10-13-ui-complexity-review.md` (decisions 1–7, 9, 10 accepted; 8 out of scope). Still-valid prior specs it builds on: `2026-10-12-presentation-hosting-design.md` (presentation root, program-revision guard), `2026-10-12-flame-redesign-proposal.md` Option A (`FlameSchema` + parity JSON).

## Global Constraints

- LSP first for every C# and Dart edit (`csharp-ls` over `DigitalBrain-lsp.sln`, `dart language-server`); if `csharp-ls` fails under the .NET 11 RC SDK, use `codegraph_explore` plus per-project builds and say so in the task report. Never grep for code.
- Build and test per project, never `DigitalBrain.slnx`. Test runs are killed and debugged after 5 minutes.
- Tests are facts on `TestBrain.Create().WithModule<…>().StartAsync(ct)` with `TestContext.Current.CancellationToken`; real grains, no mocks, no hand-rolled hosts.
- Concrete arrays in grain state; whole rebuilds; no self-calls on non-reentrant grains (`[OneWay]` or `this.AsReference<T>()`); no state migration: when a reshaped grain fails at activation, wipe the Azurite volume and say so.
- Never raise a timeout or add polling to make a check pass.
- Warnings are errors, nullable on, no `/// <summary>` boilerplate, comments only for what code cannot say.
- A C# wire-shape change updates the Dart mirror (`app/core/lib/src/models/*.dart`) in the same task.
- Commit explicit files only (`git add <file> …`, never a directory); every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Done means seen running: `dotnet run digitalbrain.cs` from the repo root, every Aspire resource Healthy (`mcp__aspire__list_resources`), the path driven through `digitalbrain-mcp` (`neurons_context`, `neurons_call`, `neurons_get`), spans and logs read back with `list_traces` / `list_structured_logs`. No Playwright.
- Brainstorm nothing. If a step cannot be done inside the spec, stop and report the conflict.
- Reserved blackboard keys are exactly `running` and `attention`; a script write to either is refused.
- `Path[0]` is always the brain id; a fresh brain seeds `Path = [brain, "{brain}/apps/ino"]`.

## Review Focus

1. `Back` when `Path` has only the brain, and `Home` when already home: both are no-ops that still record the operation id, never an error. (Task 4 fact `BackAtHomeAndHomeAtHomeAreNoOps`.)
2. `Close` of the focused app pops every path entry at or under that app, so the person never looks at a closed neuron. (Task 4 fact `ClosingTheFocusedAppPopsThePath`.)
3. A presentation whose `Side` or `Main` names a neuron outside the publishing app's brain is refused at publish, so a slot can never render another brain's private neuron. (Task 4 fact `ASlotOutsideTheBrainIsRefused`.)
4. A behavior tree deeper than 16 levels or larger than 256 nodes is refused at the publish gate, so a hostile tree cannot stall the Dart tick. (Task 3 fact `AnOversizedTreeIsRefused`.)
5. A circle member who leaves vanishes from the Friend field on the next rebuild and their posts stop being readable through the space, with no copy left in the viewer's brain. (Task 8 fact `AMemberWhoLeavesVanishesFromTheField`.)

---

## File structure (decided here, used by every task)

| Responsibility | File |
|---|---|
| Typed revision conflict (both sides of the script boundary) | `src/DigitalBrain/Neurons/RevisionConflictException.cs` |
| Revisioned state contract + base commit helper | `src/DigitalBrain/Neurons/IRevisioned.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/RevisionedNeuron.cs` |
| Behavior tree records | `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Scene/BehaviorTree.cs` |
| Tree + sphere schema | `…/Flame.Contracts/FlameSchema.cs` (extended), `docs/superpowers/contracts/flame-schema.json` (extended) |
| Tree validation | `…/DigitalBrain.Modules.Flame/Scene/SceneValidation.cs` (extended) |
| Presentation records + app API | `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/Presentation.cs`, `IApp.cs`, `AppSnapshot.cs`, `Signals/PresentationChanged.cs` |
| Presentation guard in the app neuron | `…/DigitalBrain.Modules.Apps/Apps/AppNeuron.Presentation.cs` (new partial) |
| Workspace path | `…/Flutter.Contracts/Workspace/IWorkspace.cs`, `WorkspaceState.cs`; `…/DigitalBrain.Modules.Flutter/Workspace/WorkspaceNeuron.cs`, `WorkspaceEndpoints.cs` |
| Derived scene | `…/DigitalBrain.Modules.Flutter/Space/ISpace.cs`, `SpaceNeuron.cs`, `SpaceComposer.cs` (pure derivation), `SpaceWatcher.cs` (in-silo trigger) |
| Shell screen | `app/shell/lib/space/neuron_space.dart`, `space_field.dart`, `space_slots.dart`, `space_toolbar.dart`, `space_controller.dart` |
| Dart tree runtime | `app/ui/lib/src/flame/behavior/tree_models.dart` (in core: `app/core/lib/src/models/tree_models.dart`), `app/ui/lib/src/flame/behavior/tree_runtime.dart`, `app/ui/lib/src/flame/behavior/default_idle_tree.dart`, `app/ui/lib/src/flame/prefabs/sphere.dart` |
| Friends app | `features/os/Friends/app.cs`, `Friends.cs`, `open.cs`, `post.cs`, `view.cs`, `icon.svg` |

---

### Task 1: Pre-work deletions (Stage, UiKit edge, readUi)

**Files:**
- Delete: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Stage/StageNeuron.cs`, `…/Flame.Contracts/Stage/IStage.cs`, `…/Flame.Contracts/Stage/StageKey.cs`, `…/Flame.Contracts/Stage/Signals/StageChanged.cs`, `…/Flame/tests/DigitalBrain.Modules.Flame.Tests/Stage/StageFacts.cs`, `…/Stage/StageKeyFacts.cs`
- Modify: `…/DigitalBrain.Modules.Flame/FlameEndpoints.cs` (drop the four `/stage*` routes, `GoBody`, `HomeBody`, `Stage(...)`), `…/Flame.Contracts/FlameVocabulary.cs` (drop `StageType`), `…/Flame.Tests/FlameEndpointFacts.cs` (drop `TheShellMovesItsOwnStageOverHttp`)
- Delete: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/UiKit/UiKitEndpoints.cs` and every DTO file in `…/UiKit/` except `Table.cs`; `…/tests/DigitalBrain.Modules.Flutter.Tests/UiKitRouteFacts.cs` (its two `tables` cases move to `AppUiRouteFacts.cs`)
- Modify: `…/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs` (add the two tables routes), `…/Shared/UiHttp.cs` (keep; it is what the tables routes use), `…/FlutterModule.cs` (remove `endpoints.MapUiKit()`)
- Delete (Dart): `app/shell/lib/stage/stage_controller.dart`, `stage_view.dart`, `app/shell/test/stage_view_test.dart`, `app/shell/test/stage_fakes.dart`
- Modify (Dart): `app/core/lib/src/scene_client.dart` (drop `stage`, `go`, `back`, `home`, `setHome`), `app/core/lib/src/models/scene_models.dart` (drop `StageEntry`, `StageState`), `app/core/lib/src/ui_client.dart` (drop `readUi` at line 789 and `_ui/$collection` helper if unused), `app/core/lib/digitalbrain_flutter.dart` exports.

**Interfaces:**
- Produces: `AppUiEndpoints` maps `GET /brains/{brainId}/ui/tables/{name}` and `POST /brains/{brainId}/ui/tables/{name}/replace` (unchanged shapes, `TableReplace(Title, Columns, Rows)`).

- [ ] **Step 1: Map every reference with LSP**

For each of `IStage`, `StageKey`, `StageChanged`, `StageNeuron.KeyFor`, `FlameVocabulary.StageType`, `UiKitEndpoints.MapUiKit`, `UiScope`, and the Dart `SceneClient.stage/go/back/home/setHome`, `StageState`, `readUi`: run `findReferences`. Expected: no reference outside the files listed above (the review verified Stage has no caller in `shell/lib` and no C# caller outside Flame; `readUi` has no product caller). If a reference appears elsewhere, stop and report it before deleting.

- [ ] **Step 2: Move the tables facts first**

Add to `…/Flutter.Tests/AppUiRouteFacts.cs` the two route-presence assertions copied verbatim from `UiKitRouteFacts.cs` lines 50 and 80 (`"GET /brains/{brainId}/ui/tables/{name}"`, `"POST /brains/{brainId}/ui/tables/{name}/replace"`), using the same route-listing fixture that file already uses for `/apps/node`.

Run: `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests -- --filter-class "*AppUiRouteFacts*"`
Expected: the two new facts PASS (routes still mapped by `UiKitEndpoints`).

- [ ] **Step 3: Move the tables routes into `AppUiEndpoints.Map`**

```csharp
// AppUiEndpoints.Map, after the /event route:
UiHttp.MapGet<ITable, TableState>(endpoints, "tables", neuron => neuron.Read());
UiHttp.MapPost(endpoints, "tables/{name}/replace", async (string name, TableReplace body, IGrainFactory grains, CancellationToken ct) =>
{
    await grains.GetGrain<ITable>(name).Replace(body.Title, body.Columns, body.Rows).WaitAsync(ct);
    return Results.Accepted();
});
```
Delete `UiKitEndpoints.cs`, every `UiKit/*.cs` except `Table.cs`, remove `endpoints.MapUiKit();` from `FlutterModule.Configure`, delete `UiKitRouteFacts.cs`.

- [ ] **Step 4: Delete Stage**

Delete the six Stage files, strip `FlameEndpoints` to the three scene routes, drop `StageType` and `using DigitalBrain.Flame.Stage;` everywhere LSP showed, drop the stage fact in `FlameEndpointFacts.cs`.

- [ ] **Step 5: Delete the Dart stage and readUi**

Delete the four Dart files; remove the five stage methods from `SceneClient`, `StageEntry`/`StageState` from `scene_models.dart`, `readUi` from `ui_client.dart`; fix exports.

- [ ] **Step 6: Build, analyze, test**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/DigitalBrain.Modules.Flame.csproj
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter analyze && flutter test
cd ../core && dart analyze && dart test
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: all green; LSP diagnostics clean in every touched file.

- [ ] **Step 7: Run it and commit**

`dotnet run digitalbrain.cs`; `mcp__aspire__list_resources` all Healthy; `neurons_search` for `stage` returns nothing; `GET /brains/{brain}/ui/tables/{name}` answers through `digitalbrain-mcp` or curl. Commit the explicit files:
```bash
git add <each deleted/modified path>
git commit -m "Delete Stage and the UiKit edge; tables routes move under AppUiEndpoints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Revision guard in the base neuron, typed conflict across the script boundary

**Files:**
- Create: `src/DigitalBrain/Neurons/RevisionConflictException.cs`, `src/DigitalBrain/Neurons/IRevisioned.cs`, `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/RevisionedNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/RuntimeEdgeEndpoints.cs:38-52` (`Refusal`), `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/SessionConnection.cs:247-254` (`EnsureSuccessAsync`), `src/DigitalBrain.Framework/DigitalBrain.Framework/Http/ModuleRouteGuard.cs:15`
- Modify (throw sites → `RevisionConflictException`): `…/DigitalBrain.Modules.Flutter/Workspace/WorkspaceNeuron.cs` (`RequireRevision`), `…/Flame/Scene/SceneNeuron.cs:17`, and the expected-revision checks in `SurfaceNeuron.cs`, `LayoutNeuron.cs`, `CollectionNeuron.cs`, `ImageCanvasNeuron.cs`, `ShellStateNeuron.cs` (LSP: `workspaceSymbol "expectedRevision"` then each `!=` check)
- Delete: `WorkspaceRevisionConflictException` (in `…/Flutter.Contracts/Workspace/IWorkspace.cs`), `WorkspaceWindows.RetryOnConflictAsync` (file `…/Flutter.Contracts/Workspace/WorkspaceWindows.cs`; `EnsureOpenAsync` stays until Task 4, now a single attempt)
- Modify (hand-rolled retries → one attempt, conflict propagates): `features/os/Router/Jev.cs:37-47`, `features/os/Engineer/Engineer.cs:308-322`, `features/os/Assistant/Assistant.cs:183-211`, `features/os/DataVisualizer/Views.cs:113-135`, `features/intochat/CustomerResearcher/ActivityProjection.cs:17-25`, `features/os/Memory/Memory.cs:231-240`
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RevisionedNeuronFacts.cs` (new), `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/RevisionConflictEdgeFacts.cs` (new), `…/Flutter.Tests/Workspace/WorkspaceFacts.cs` (adjust)

**Interfaces:**
- Produces:
```csharp
namespace DigitalBrain;
[GenerateSerializer, Alias("revision-conflict")]
public sealed class RevisionConflictException(string message, long currentRevision) : InvalidOperationException(message)
{
    [Id(0)] public long CurrentRevision { get; } = currentRevision;
    public const string Code = "RevisionConflict";   // the X-DigitalBrain-Refusal header value
}

public interface IRevisioned<TSelf> where TSelf : IRevisioned<TSelf>
{
    long Revision { get; }
    string[] Operations { get; }                 // applied operation ids, newest last, at most 64
    TSelf Advanced(string operationId);          // Revision + 1 and the id recorded
}

namespace DigitalBrain.Framework;
public abstract class RevisionedNeuron<TState>(IPersistentState<TState> store) : Neuron<TState>(store)
    where TState : class, IRevisioned<TState>
{
    // Returns false when the operation was already applied (a replay changes nothing and announces nothing).
    protected async Task<bool> Commit(string operationId, long expectedRevision, Func<TState, TState> change, Func<TState, Signal> changed);
    protected static void RequireRevision(long expectedRevision, long currentRevision);
}
```
- HTTP: a `RevisionConflictException` leaves the runtime edge as **409** with header `X-DigitalBrain-Refusal: RevisionConflict` and body `{"message":…, "currentRevision":N}`; `SessionConnection.EnsureSuccessAsync` rebuilds `RevisionConflictException(message, currentRevision)` from that; `ModuleRouteGuard` and `WorkspaceEndpoints.Respond` answer the shell with 409 `{error, currentRevision}`.

- [ ] **Step 1: Write the failing facts for the base guard**

`src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RevisionedNeuronFacts.cs` using whatever in-process neuron harness that project already uses for `Neuron<TState>` (LSP: `workspaceSymbol "Neuron<"` inside the Unit test project; reuse its fixture):
```csharp
[GenerateSerializer, Alias("test.counter-state")]
public sealed record CounterState([property: Id(0)] long Revision = 0, [property: Id(1)] string[] Operations = null!, [property: Id(2)] int Value = 0) : IRevisioned<CounterState>
{
    public string[] Operations { get; init; } = Operations ?? [];
    public CounterState Advanced(string operationId) => this with { Revision = Revision + 1, Operations = [.. Operations.TakeLast(63), operationId] };
}
[GenerateSerializer, Alias("test.counter-changed")] public sealed record CounterChanged([property: Id(0)] long Revision) : Signal;
public interface ICounter : INeuron { Task Add(string operationId, long expectedRevision, int by); Task<CounterState> Read(); }
[GrainType("test.counter")]
public sealed class CounterNeuron([PersistentState("counter", DigitalBrainNames.ClusterGrainStorage)] IPersistentState<CounterState> store) : RevisionedNeuron<CounterState>(store), ICounter
{
    public Task Add(string operationId, long expectedRevision, int by) => Commit(operationId, expectedRevision, s => s with { Value = s.Value + by }, s => new CounterChanged(s.Revision));
    public Task<CounterState> Read() => Task.FromResult(Snapshot);
}

[Fact] public async Task AStaleRevisionIsRefusedWithTheCurrentOne()
{   // Add("a",0,1) ok; Add("b",0,1) throws RevisionConflictException with CurrentRevision == 1 }
[Fact] public async Task AReplayedOperationChangesNothing()
{   // Add("a",0,1); Add("a",0,1) again → no throw, Value still 1, Revision still 1 }
[Fact] public async Task AReplayOutlivesReactivation()
{   // Add("a",0,1); DeactivateAsync; Add("a",0,1) → no change }
```
Run: `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-class "*RevisionedNeuronFacts*"` → FAIL (types missing).

- [ ] **Step 2: Implement the three ring types**

`RevisionedNeuron.Commit`: if `Snapshot.Operations.Contains(operationId, StringComparer.Ordinal)` return false; `RequireRevision(expectedRevision, Snapshot.Revision)`; `var next = change(Snapshot).Advanced(operationId);` `await Save(next, changed(next)); return true;`. `RequireRevision` throws `new RevisionConflictException($"Expected revision {expected}; current revision is {current}.", current)`. Run the facts → PASS.

- [ ] **Step 3: Write the failing edge fact**

`…/Microsoft.CSharp.Tests/RevisionConflictEdgeFacts.cs`: using that project's existing script-session fixture (LSP: find the fact that already posts to `RuntimeProtocol.Invoke`, copy its setup), invoke a neuron method that throws `RevisionConflictException(…, 7)` and assert: status 409, header `X-DigitalBrain-Refusal` == `RevisionConflict`, body JSON `currentRevision` == 7; then through a `SessionConnection` assert the thrown exception `is RevisionConflictException { CurrentRevision: 7 }`. Run → FAIL.

- [ ] **Step 4: Map the conflict on both edges**

`RuntimeEdgeEndpoints.Refusal`: before the switch,
```csharp
if (error is RevisionConflictException conflict)
{
    http.Response.Headers[RuntimeProtocol.RefusalHeader] = RevisionConflictException.Code;
    return Results.Json(new { message = conflict.Message, currentRevision = conflict.CurrentRevision }, statusCode: StatusCodes.Status409Conflict);
}
```
`SessionConnection.EnsureSuccessAsync`: when `codes.Single() == RevisionConflictException.Code`, parse the body and `throw new RevisionConflictException(message, currentRevision)` (the body is JSON; `detail` is the raw string — parse with `JsonDocument`). `ModuleRouteGuard`: `catch (RevisionConflictException e) => Results.Json(new { error = e.Message, currentRevision = e.CurrentRevision }, statusCode: 409)` before the `InvalidOperationException` arm. Same arm in `WorkspaceEndpoints.Respond`. Run → PASS.

- [ ] **Step 5: Retarget every throw site and delete the retries**

Replace `WorkspaceRevisionConflictException` with `RevisionConflictException` (delete the old class); every `expectedRevision != Revision` throw in the five Flutter kinds and `SceneNeuron.Set` throws `RevisionConflictException(message, Snapshot.Revision)`. Delete `RetryOnConflictAsync`; `EnsureOpenAsync` becomes one `workspace.Open(...)` with `state.Revision`.
Each feature site becomes a single attempt with no `catch` of the conflict (a synapse that hits a conflict ends its iteration; the next signal or the re-run rebuilds from current state):
- `Jev.OpenWindow`: one `workspace.EnsureOpenAsync(...)`.
- `Engineer.OpenWindowAsync`: one `EnsureOpenAsync`.
- `Assistant.OpenWindowAsync`: read, return if open, one `Open`.
- `DataVisualizer.ChangeWorkspaceAsync`: read, `plan(state)`, one call; delete `WorkspaceAttempts`.
- `CustomerResearcher.ActivityProjection.Project`: `await Rebuild(brain, key);` only.
- `Memory.ReadIndex`: one read; when `current.Count != generation.Rows` throw `new RevisionConflictException("The memory index switched generation while it was read.", generation.Number)` so the caller rebuilds.
Remove the comments that describe the 422 path (they are now false).

- [ ] **Step 6: Build and test every touched project; run live; commit**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Client/DigitalBrain.Client/DigitalBrain.Client.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Live: `dotnet run digitalbrain.cs`; all Healthy; the features compile at boot (`FeatureCatalog` logs no compile error — `list_structured_logs` filtered on `FeatureCatalog`); through `digitalbrain-mcp` call `IWorkspace.Open` twice with the same `expectedRevision` and read back the 409 with `currentRevision`; `list_traces` shows the second call's span with the conflict. Commit explicit files.

---

### Task 3: Flame behavior trees (contract, schema, validation, Dart runtime)

**Files:**
- Create: `…/Flame.Contracts/Scene/BehaviorTree.cs`
- Modify: `…/Flame.Contracts/Scene/SceneDefinition.cs` (remove `NodePatch`, `StateDef`, `Transition`, `StateMachine`; `SceneDefinition(Nodes, Camera, Background)`; `SceneNode` gains `[Id(8)] BehaviorTree? Tree = null`; `SceneState` loses `Current`), `…/Flame.Contracts/FlameSchema.cs`, `…/Flame.Contracts/FlameVocabulary.cs` (add `"sphere"` to `NodeTypes`, `MaxTreeNodes = 256`, `MaxTreeDepth = 16`), `…/Flame/Scene/SceneNeuron.cs` (drop `Fire`, `Keep`, machines; `IScene.Fire` and `SceneEntered` deleted), `…/Flame/Scene/SceneValidation.cs`, `…/Flame.Contracts/Scene/IScene.cs`, `…/Flame.Contracts/Scene/Signals/SceneSignals.cs`, `…/Flame/FlameEndpoints.cs` (drop `/fire`), `docs/superpowers/contracts/flame-schema.json`
- Modify tests: `…/Flame.Tests/Scenes.cs`, `SceneFireFacts.cs` (delete), `SceneSetFacts.cs`, `SceneSchemaFacts.cs`, `Schema/SchemaParityFacts.cs`, `Schema/FlameSchemaFacts.cs`; add `Scene/BehaviorTreeFacts.cs`
- Dart create: `app/core/lib/src/models/tree_models.dart`, `app/ui/lib/src/flame/behavior/tree_runtime.dart`, `app/ui/lib/src/flame/behavior/default_idle_tree.dart`, `app/ui/lib/src/flame/prefabs/sphere.dart`, tests `app/ui/test/flame/tree_runtime_test.dart`, `app/ui/test/flame/sphere_test.dart`
- Dart modify: `app/ui/pubspec.yaml` (add `flame_behavior_tree: ^0.1.5+5`), `app/core/lib/src/models/scene_models.dart` (remove `StateMachine`, `StateDef`, `NodePatch`, `SceneTransition`, `SceneState.current`; `SceneNode.tree`), `app/core/lib/src/scene_client.dart` (drop `fire`), `app/ui/lib/src/flame/scene_game.dart` (drop machine apply; attach trees), `app/ui/lib/src/flame/node_components.dart` (add `sphere` arm), `app/ui/lib/src/flame/node_schema.dart`, `app/ui/test/flame/node_schema_test.dart`, `scene_game_test.dart`, `prefabs_test.dart`
- Feature scripts still calling `IScene.Fire`/machines (`features/os/Ino/Ino.cs`, `features/os/BrainView/BrainView.cs` builds `SceneDefinition` with 4 args) must compile at boot: update `BrainView.BrainScene` to the 3-arg definition now; Ino's machine code is replaced in Task 6, so for this task Ino's `Presence()`/`Fire`/`RestFrom` are reduced to no-ops that compile (`Fire` becomes an empty method, `WelcomeScene`/`HomeScene` pass no machines) — Task 6 deletes them.

**Interfaces:**
- Produces (C#, Flame contracts):
```csharp
namespace DigitalBrain.Flame.Scene;

public static class TreeKinds
{
    public const string Selector = "selector", Sequence = "sequence", Repeat = "repeat", Condition = "condition",
        Wait = "wait", MoveTo = "moveTo", Scale = "scale", Fade = "fade", Pulse = "pulse";
    public static readonly string[] All = [Selector, Sequence, Repeat, Condition, Wait, MoveTo, Scale, Fade, Pulse];
    public static readonly string[] Composite = [Selector, Sequence, Repeat];
}

// One closed shape for every node, as SceneNode is: the kind decides which fields mean something.
[GenerateSerializer, Alias("flame.tree-node")]
public sealed record TreeNode(
    [property: Id(0)] string Kind,
    [property: Id(1)] TreeNode[] Children,
    [property: Id(2)] string? Key = null,      // condition: blackboard key
    [property: Id(3)] string? Value = null,    // condition: expected value
    [property: Id(4)] double Seconds = 0,      // wait, moveTo, scale, fade, pulse
    [property: Id(5)] double X = 0,            // moveTo
    [property: Id(6)] double Y = 0,            // moveTo
    [property: Id(7)] double Factor = 1,       // scale
    [property: Id(8)] double Alpha = 1,        // fade
    [property: Id(9)] double Amplitude = 0,    // pulse
    [property: Id(10)] bool Memory = false)    // sequence: a running child is resumed on the next tick
{
    public static TreeNode Selector(params TreeNode[] children) => new(TreeKinds.Selector, children);
    public static TreeNode Sequence(bool memory, params TreeNode[] children) => new(TreeKinds.Sequence, children, Memory: memory);
    public static TreeNode Repeat(TreeNode child) => new(TreeKinds.Repeat, [child]);
    public static TreeNode Condition(string key, string value) => new(TreeKinds.Condition, [], key, value);
    public static TreeNode Wait(double seconds) => new(TreeKinds.Wait, [], Seconds: seconds);
    public static TreeNode MoveTo(double x, double y, double seconds) => new(TreeKinds.MoveTo, [], Seconds: seconds, X: x, Y: y);
    public static TreeNode Scale(double factor, double seconds) => new(TreeKinds.Scale, [], Seconds: seconds, Factor: factor);
    public static TreeNode Fade(double alpha, double seconds) => new(TreeKinds.Fade, [], Seconds: seconds, Alpha: alpha);
    public static TreeNode Pulse(double amplitude, double seconds) => new(TreeKinds.Pulse, [], Seconds: seconds, Amplitude: amplitude);
}

[GenerateSerializer, Alias("flame.behavior-tree")]
public sealed record BehaviorTree([property: Id(0)] TreeNode Root);
```
- `FlameSchema` gains: `public static readonly string[] ReservedBlackboardKeys = ["running", "attention"];`, `public sealed record TreeTask(string Kind, double MinSeconds, double MaxSeconds, double MinValue, double MaxValue)` with `public static readonly TreeTask[] Tasks` = wait 0..60 s; moveTo seconds 0..10, x/y −4096..4096; scale 0..10 s, factor 0.1..4; fade 0..10 s, alpha 0..1; pulse 0..10 s, amplitude 0..1. And the node type `new("sphere", [Needed("icon"), Text("title"), Text("description"), Json("blackboard"), Json("side"), Json("main"), Json("toolbar"), Choice("state", "ready", "unready", "error"), Text("error"), Text("neuron"), Boolean("focused")])`.
- `SceneValidation.Check(SceneDefinition definition, string[] declaredBlackboardKeys)` — the second argument lists keys `Condition.Key` may name besides the reserved ones (the sphere's own keys). A tree's node kinds must be in `TreeKinds.All`; composite nodes need ≥1 child (`repeat` exactly 1), leaves none; depth ≤ `MaxTreeDepth`, count ≤ `MaxTreeNodes`; task parameters in range. `SceneNeuron.Set` calls it with the sphere's `blackboard` keys parsed from the node's `blackboard` JSON object (a `Condition.Key` is valid when reserved or present in that object).
- `SceneValidation.CheckTree(BehaviorTree tree, string[] declaredKeys)` is public (Task 4's presentation guard calls it).
- `IScene`: `Set(SceneDefinition, long expectedRevision)`, `Report(...)`, `Read()`. `SceneSignals`: `SceneChanged`, `SceneInput` only.
- JSON mirror `flame-schema.json` gains `"treeKinds": [...]`, `"treeTasks": [{kind,minSeconds,maxSeconds,minValue,maxValue}]`, `"reservedBlackboardKeys": ["running","attention"]`, `"maxTreeNodes": 256`, `"maxTreeDepth": 16`, and the `sphere` node entry.
- Dart `TreeNode` / `BehaviorTreeDef` models (`tree_models.dart`), `buildTree(BehaviorTreeDef, SphereBlackboard, SphereBody)` → a `behavior_tree` `BaseNode` (`tree_runtime.dart`), `defaultIdleTree()` (`default_idle_tree.dart`), `SphereComponent extends PositionComponent with HasBehaviorTree` (`sphere.dart`) exposing `blackboard` (a `Map<String,String>` the game updates on each `apply`) and reading the tree from the node.

- [ ] **Step 1: Write the failing C# facts**

`…/Flame.Tests/Scene/BehaviorTreeFacts.cs`:
```csharp
public sealed class BehaviorTreeFacts
{
    static SceneDefinition Sphere(BehaviorTree? tree, string blackboard = """{"mood":"idle"}""") => new(
        [new("ino", "sphere", new Transform(), null, new() { ["icon"] = "ino", ["blackboard"] = blackboard }, [], [], ["tap"]) { Tree = tree }],
        new SceneCamera());

    [Fact] public void AValidPresenceTreeIsAccepted()
        => SceneValidation.Check(Sphere(new(TreeNode.Selector(
            TreeNode.Sequence(false, TreeNode.Condition("mood", "thinking"), TreeNode.Pulse(0.2, 1)),
            TreeNode.Sequence(false, TreeNode.Condition("running", "true"), TreeNode.Pulse(0.1, 2)),
            TreeNode.Repeat(TreeNode.Wait(1))))));
    [Fact] public void AConditionOnAnUndeclaredKeyIsRefused()
        => Assert.Contains("unread", Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(TreeNode.Condition("unread", "1"))))).Message);
    [Fact] public void AnUnknownTreeKindIsRefused()
        => Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(new TreeNode("spin", [])))));
    [Fact] public void ARepeatNeedsExactlyOneChild()
        => Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(new TreeNode(TreeKinds.Repeat, [])))));
    [Fact] public void ATaskOutOfRangeIsRefused()
        => Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(TreeNode.Fade(1.5, 1)))));
    [Fact] public void AnOversizedTreeIsRefused()
    {
        TreeNode deep = TreeNode.Wait(1);
        for (var i = 0; i < 17; i++) { deep = TreeNode.Repeat(deep); }
        Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(deep))));
        var wide = TreeNode.Selector([.. Enumerable.Range(0, 257).Select(_ => TreeNode.Wait(1))]);
        Assert.Throws<ArgumentException>(() => SceneValidation.Check(Sphere(new(wide))));
    }
    [Fact] public void ANullTreeIsAccepted() => SceneValidation.Check(Sphere(null));
}
```
Extend `SchemaParityFacts` to assert `treeKinds`, `treeTasks`, `reservedBlackboardKeys`, `maxTreeNodes`, `maxTreeDepth` against `FlameSchema`/`FlameVocabulary`. Add to `SceneSchemaFacts` a fact that `SceneNeuron.Set` refuses a tree whose condition names an undeclared key (through the grain, `TestBrain.Create().WithModule<FlameModule>()`, key `owner/a/apps/ino/scenes/home`).
Run: `dotnet test --project …/DigitalBrain.Modules.Flame.Tests` → FAIL to compile.

- [ ] **Step 2: Implement the contract, schema, validation; delete the machine**

Write `BehaviorTree.cs` as above; reshape `SceneDefinition.cs`; extend `FlameSchema`/`FlameVocabulary`; `SceneValidation.Check` walks nodes as today, then for each node with a `Tree` calls `CheckTree(tree, KeysOf(node))` where `KeysOf` parses `Parameters["blackboard"]` as a JSON object and returns its property names (empty when absent). `SceneNeuron.Set` becomes: access, `Check`, `RequireRevision`, save `SceneState{Name,Revision+1,Definition}`. Delete `Fire`, `SceneEntered`, the `/fire` route, `SceneFireFacts.cs`; fix `Scenes.cs` (no `Machine` helper; `Ino()` carries a tree instead). Update `flame-schema.json`. Make `BrainView.BrainScene` and Ino compile (see Files). Run the Flame tests → PASS. Build `features` at boot later in Step 6.

- [ ] **Step 3: Write the failing Dart tests**

`app/ui/test/flame/tree_runtime_test.dart` (the two reference shapes from the Flame examples, written as our trees):
```dart
// robot: selector( sequence(condition charge=low, moveTo(0,0,1), wait(1)), sequence(condition task=patrol, repeat(moveTo(100,0,2))) )
// traffic: sequence(memory: true, fade(1,0.5), wait(2), fade(0.2,0.5), wait(1))
test('a selector picks the first branch whose condition holds', () { /* blackboard charge=low → body receives moveTo(0,0) */ });
test('a memory sequence resumes its running child on the next tick', () { /* tick twice during wait(2): second tick does not restart fade */ });
test('repeat ticks its child again after success', () { ... });
test('an unknown kind renders as a no-op leaf that fails', () { ... });
```
`app/ui/test/flame/sphere_test.dart`: `SphereComponent` with a null tree uses `defaultIdleTree()`; with blackboard `running=true` the default tree pulses (scale oscillates between ticks); with `attention=true` the badge flag is set. Extend `node_schema_test.dart` for the new JSON sections. Run `flutter test test/flame` in `app/ui` → FAIL.

- [ ] **Step 4: Implement the Dart runtime**

Add the dependency, `flutter pub get`. `tree_models.dart`: `TreeNode.fromJson` mirroring the C# fields, `BehaviorTreeDef(root)`. `tree_runtime.dart`: `buildTree` maps selector→`Selector`, sequence→`Sequence` (memory=false) or a local `_MemorySequence extends BaseNode` (memory=true), repeat→local `_Repeat extends BaseNode` (ticks child; on success/failure resets and returns running), condition→`Condition(() => blackboard[key] == value)`, tasks→`Task(() => body.begin(kind, params) … running until elapsed)`. Read the package API with `mcp__dart__read_package_uris` (`package:behavior_tree/behavior_tree.dart`, `package:flame_behavior_tree/flame_behavior_tree.dart`) before writing; the names `Selector`, `Sequence`, `Task`, `Condition`, `BaseNode`, `NodeStatus`, `HasBehaviorTree`, `treeRoot`, `tickInterval` are confirmed. `default_idle_tree.dart`: `selector( sequence(condition running=true, pulse(0.08, 1.2)), sequence(condition attention=true, pulse(0.04, 0.6)), repeat(wait(1)) )`. `sphere.dart`: draws the icon circle, title/description labels above, attention badge, applies `moveTo/scale/fade/pulse` through Flame effects on `body`. `scene_game.dart`: drop machine application; `apply` sets each `SphereComponent.blackboard` from the node's `blackboard` JSON and `treeRoot` from `node.tree ?? defaultIdleTree()`; `node_components.dart` gains the `sphere` arm. Run → PASS; `flutter analyze` clean.

- [ ] **Step 5: Build everything touched, run the suites**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/DigitalBrain.Modules.Flame.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
cd src/DigitalBrain.Modules/Google/Flutter/app/ui && flutter analyze && flutter test
cd ../core && dart analyze && dart test
cd ../shell && flutter analyze && flutter test
```

- [ ] **Step 6: Run it, drive it, commit**

`dotnet run digitalbrain.cs`; Healthy; `list_structured_logs` shows no feature compile error; through `digitalbrain-mcp`: `neurons_call` `IScene.Set` on `{brain}/apps/brainview/scenes/brain` with a sphere node carrying the presence tree (expectedRevision from `neurons_get`), then with a condition on `unread` and read back the refusal; `list_traces` shows both `Set` spans. Commit explicit files (including `pubspec.lock` of `ui`).

---

### Task 4: Workspace path, presentation in app state, derived scene

**Files:**
- Modify: `…/Flutter.Contracts/Workspace/IWorkspace.cs`, `WorkspaceState.cs`; delete `OpenWindow.cs`, `WindowReference.cs`, `WorkspaceOpenResult.cs`, `WorkspaceWindow.cs`, `WorkspaceWindows.cs`, `FirstRunState.cs` (with `WorkspaceStarterCatalog`)
- Modify: `…/DigitalBrain.Modules.Flutter/Workspace/WorkspaceNeuron.cs` (rewrite on `RevisionedNeuron`), `WorkspaceEndpoints.cs` (routes `GET ""`, `POST /show`, `/back`, `/home`, `/close`, `/reports`; delete `/events`, `/windows/*`, `/focus`, `/presentation`, `/connected-sources`), `FlutterModuleOptions.cs` (drop `AssistantTitle` if only FirstRun used it — LSP), `FlutterModule.cs` (register `SpaceWatcher`, map nothing new)
- Create: `…/DigitalBrain.Modules.Flutter/Space/ISpace.cs`, `SpaceNeuron.cs`, `SpaceComposer.cs`, `SpaceWatcher.cs`
- Modify: `…/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj` (add `ProjectReference` to `DigitalBrain.Modules.Flame.Contracts`), `…/Flame/SceneAccess.cs` (brain-level `{brain}/space` key)
- Apps: create `…/Apps.Contracts/Apps/Presentation.cs`, `…/Apps.Contracts/Signals/PresentationChanged.cs`; modify `IApp.cs`, `AppSnapshot.cs` (`[Id(15)] AppPresentation? Presentation`), `AppManifest.cs` (delete `Entry`, its validation), `…/Apps.Contracts.csproj` (reference `Flame.Contracts`), `…/DigitalBrain.Modules.Apps/Apps/AppState.cs` (`ProgramRevision`, `Presentation`), `AppNeuron.cs` (`Deploy` bumps `ProgramRevision`; `Configuration(next)` passes `"ProgramRevision"`), create `AppNeuron.Presentation.cs`
- Scripts/Dart: `app/core/lib/src/models/workspace_models.dart` (`WorkspaceSnapshot(revision, path, open)`), `ui_client.dart` (`readWorkspace`, `showNeuron`, `backNeuron`, `homeNeuron`, `closeNeuron`; delete `openApp`, `closeWorkspaceWindow`, `reopenWorkspaceWindow`, `focusWorkspaceWindow`, `configureWorkspacePresentation`, `setConnectedSources`, `watchWorkspace`, `watchWorkspaceChannel`), `app/shell/test/core/workspace_models_test.dart`
- Feature scripts that referenced windows/Entry must still compile at boot: `Assistant.OpenWindowAsync`, `routed.cs:83-93`, `Jev.OpenWindow`, `Engineer.OpenWindowAsync`, `SelfImprove.OpenWindowAsync`, `DataVisualizer` window helpers, `CustomerResearcher/open.cs` — in this task each becomes `workspace.Show(appKey, operationId, (await workspace.Read()).Revision)` where it opened its own window (Tasks 6–9 replace them with presentations). Every `app.cs` drops `Entry:`.
- Tests: rewrite `…/Flutter.Tests/Workspace/WorkspaceFacts.cs`, delete `WorkspaceHostingFacts.cs`, `WorkspaceWindowHttpFacts.cs`, adjust `WorkspaceRouteFacts.cs`; create `…/Flutter.Tests/Space/SpaceFacts.cs`; create `…/Apps.Tests/Apps/AppPresentationFacts.cs`; adjust `AppManifestFacts.cs`.

**Interfaces:**
- Produces (Apps contracts):
```csharp
namespace DigitalBrain.Apps;
[GenerateSerializer, Alias("apps.sphere")]
public sealed record Sphere([property: Id(0)] string Icon, [property: Id(1)] string[] BlackboardKeys, [property: Id(2)] BehaviorTree? Tree = null);
[GenerateSerializer, Alias("apps.presentation")]
public sealed record Presentation([property: Id(0)] Sphere Sphere, [property: Id(1)] UiChildRef? Side = null, [property: Id(2)] UiChildRef? Main = null);
// Held in AppSnapshot.Presentation; null until the current program published once.
[GenerateSerializer, Alias("apps.app-presentation")]
public sealed record AppPresentation(
    [property: Id(0)] long ProgramRevision, [property: Id(1)] long Revision,
    [property: Id(2)] Presentation? Root, [property: Id(3)] string? Error,
    [property: Id(4)] Dictionary<string, string> Blackboard);

// IApp additions:
// Script-callable, only by the executing assignment (caller.Kind == App, caller.AppId == this key, expectedProgramRevision == ProgramRevision).
Task<AppSnapshot> Present(long expectedProgramRevision, Presentation presentation);
Task<AppSnapshot> FailPresentation(long expectedProgramRevision, string error);
// Declared keys only; a reserved key is refused with ArgumentException.
Task<AppSnapshot> WriteBlackboard(long expectedProgramRevision, Dictionary<string, string> values);
// Module only: the reserved keys.
[Internal] Task Stamp(string key, string value);

// Signal: namespace DigitalBrain.Apps.Signals
[GenerateSerializer, Alias("apps.presentation-changed")]
public sealed record PresentationChanged([property: Id(0)] string App, [property: Id(1)] long ProgramRevision, [property: Id(2)] long Revision) : Signal;
```
A script learns its program revision from `long.Parse(brain.Setting("ProgramRevision")!)`.
- Produces (Flutter contracts):
```csharp
[GenerateSerializer, Alias("ui.workspace-state")]
public sealed record WorkspaceState([property: Id(0)] long Revision, [property: Id(1)] string[] Path, [property: Id(2)] string[] Open);

public interface IWorkspace : INeuron
{
    Task<WorkspaceState> Show(string app, string operationId, long expectedRevision);   // push; `app` is an app key, a `{brain}/profile` key or a `{brain}/posts/{id}` key
    Task<WorkspaceState> Back(string operationId, long expectedRevision);               // pop one
    Task<WorkspaceState> Home(string operationId, long expectedRevision);               // pop to Path[0]
    Task<WorkspaceState> Close(string app, string operationId, long expectedRevision);  // remove from Open, pop it off Path
    [ReadOnly] Task<WorkspaceState> Read();
}
```
`WorkspaceStorage : IRevisioned<WorkspaceStorage>` with `Revision`, `Operations`, `Path`, `Open`; `Read()` of a never-written workspace answers `Path = [brain, brain + "/apps/ino"]`, `Open = [brain + "/apps/ino"]`, `Revision = 0`. `Show(x)`: appends `x` to `Path` unless `Path[^1] == x`; adds to `Open` when `x` is an app key of this brain. A key must start with `brain + "/"` or be a member brain's `/profile` or `/posts/` key (the space checks membership at rebuild; the workspace checks the shape only).
- Produces (Flutter module, internal):
```csharp
[Alias("ui.space")] public interface ISpace : IGrainWithStringKey { [OneWay] Task Rebuild(); }
// SpaceNeuron : Neuron, ISpace, keyed by the brain id. Rebuild reads IWorkspace, every IApp in the brain
// (kernel.InstancesIn), the circle brains the person is in and their members' profiles/posts (Task 8 adds those),
// derives the SceneDefinition through SpaceComposer.Compose and writes it with grains.GetGrain<IScene>(brain + "/space").Set(def, current.Revision).
internal static class SpaceComposer
{
    public static SceneDefinition Compose(WorkspaceState workspace, SpaceEntry[] field);   // pure, tested directly
    public sealed record SpaceEntry(string Key, string Title, string Description, AppPresentation? Presentation, AppToolbarEntry[] Toolbar);
}
```
Sphere node per entry: id = entry key, type `sphere`, `Parameters`: `icon`, `title`, `description`, `blackboard` (JSON of the presentation blackboard plus stamped reserved keys), `side`/`main` (JSON `{kind,name}` or absent), `toolbar` (JSON array), `state` (`ready` when `Root != null`, `error` when `Error != null`, else `unready`), `error`, `neuron` (the key), `focused` (`true` for `Path[^1]`); `Tree = Presentation.Root?.Sphere.Tree`; `Transform` places entries on a ring of radius 320 around the origin in key order, the focused one at `Scale = 2.2`, others `1`; `Camera = new(x, y, 1)` of the focused sphere. Field rule: focus is the brain → every app plus every friend; focus is an app → that app alone (plus Home behind it); focus is a friend → their posts (Task 8).
- `SpaceWatcher : BackgroundService` subscribes to the in-silo `LocalSignalHub.Subscribe<WorkspaceChanged>()`, `Subscribe<PresentationChanged>()`, `Subscribe<AppActivity>()` and calls `grains.GetGrain<ISpace>(brainId).Rebuild()`; for `AppActivity` it first calls `IApp.Stamp("running", state is "working" or "reading" or "searching" or "listening" ? "true" : "false")` and `Stamp("attention", state == "attention" ? "true" : "false")`. `WorkspaceNeuron` also calls `grains.GetGrain<ISpace>(brain).Rebuild()` after every save (one-way, so no deadlock), and `SpaceNeuron` rebuilds on activation.
- `SceneAccess`: a key `{brain}/space` is the brain's own derived scene: `BrainOf` returns the prefix before `/space`; writers are Platform, unstamped, or User/Assistant of that brain (an App caller is refused); reporters the same.
- Dart: `WorkspaceSnapshot(revision, path, open)`; `ui_client` `showNeuron(workspace, key, operationId, expectedRevision)` etc. posting `{app, operationId, expectedRevision}`.

- [ ] **Step 1: Write the failing workspace facts**

Rewrite `WorkspaceFacts.cs`:
```csharp
[Fact] public async Task AFreshBrainLandsOnIno()
{   // Read() → Path == ["owner/a", "owner/a/apps/ino"], Open == ["owner/a/apps/ino"], Revision 0 }
[Fact] public async Task ShowPushesAndBackPops()
{   // Show("owner/a/apps/files","op1",0) → Path ends files, Open contains files, Revision 1; Back("op2",1) → Path ends ino }
[Fact] public async Task BackAtHomeAndHomeAtHomeAreNoOps()
{   // Home("h1",0) → Path == [brain, ino]? No: Home pops to Path[0] → Path == [brain]; Back("b1",1) at [brain] → unchanged, Revision 2 (recorded) }
[Fact] public async Task ClosingTheFocusedAppPopsThePath()
{   // Show(files); Close(files) → Path ends ino, Open lacks files }
[Fact] public async Task AStaleRevisionIsRefusedAndAReplayIsIdempotent()
{   // Show(files,"op",0) twice → second changes nothing; Show(memory,"op2",0) → RevisionConflictException CurrentRevision 1 }
[Fact] public async Task AKeyOutsideTheBrainIsRefused()
{   // Show("other/b/apps/x") → ArgumentException }
[Fact] public async Task ThePathSurvivesReactivation()
{   // Show(files); DeactivateAsync; Read() still ends files }
```
Run: `dotnet test --project …/DigitalBrain.Modules.Flutter.Tests -- --filter-class "*WorkspaceFacts*"` → FAIL to compile.

- [ ] **Step 2: Rewrite the workspace neuron and endpoints**

Delete the window/first-run/configure types and `WorkspaceWindows`; write `WorkspaceNeuron : RevisionedNeuron<WorkspaceStorage>` using `Commit` for all four commands; `Read()` seeds the fresh path without writing; after a committed save call `grains.GetGrain<ISpace>(brain).Rebuild()`. Endpoints: four `POST` commands + `GET` + `/reports`; delete `Events`. Dart models/client updated. Run the facts → PASS.

- [ ] **Step 3: Write the failing presentation facts**

`…/Apps.Tests/Apps/AppPresentationFacts.cs` (use that project's existing scripted-runtime fixture, `Support/ScriptedRuntime.cs`, and a `Person` from `TestBrain` so `AsApp(appKey)` stamps the caller):
```csharp
[Fact] public async Task TheExecutingAssignmentPublishesAndAStaleOneIsRefused()
{   // create app; read ProgramRevision via snapshot; using person.AsApp(key): Present(rev, new(new Sphere("icon.svg", ["mood"]))) → Presentation.Root set, Revision 1, PresentationChanged published
    // Present(rev-1, …) → InvalidOperationException; replace the program (WriteBehavior) → Presentation null (invalidated); Present(old rev) refused }
[Fact] public async Task AnotherAppOrAPersonCannotPublish() { /* person.AsCaller() → UnauthorizedAccessException; AsApp(otherKey) → refused */ }
[Fact] public async Task IdenticalPublicationIsIdempotent() { /* Present twice same value → Revision unchanged, one signal */ }
[Fact] public async Task ASlotOutsideTheBrainIsRefused() { /* Main = new("text", "other/b/apps/x/text") → ArgumentException */ }
[Fact] public async Task AnInvalidTreeIsRefusedAtPublish() { /* Sphere tree with Condition("unread") not declared → ArgumentException (SceneValidation.CheckTree) */ }
[Fact] public async Task ScriptsWriteDeclaredKeysAndReservedKeysAreStamped()
{   // WriteBlackboard(rev, {mood: thinking}) ok; WriteBlackboard(rev, {running: true}) → ArgumentException; WriteBlackboard(rev,{unread:"1"}) → ArgumentException (undeclared)
    // Stamp("running","true") (no caller / Platform) → Blackboard[running]=="true"; Stamp from person.AsApp → refused by [Internal] }
[Fact] public async Task FailurePresentsAsError() { /* FailPresentation(rev,"boom") → Root null, Error "boom" */ }
```
Run → FAIL.

- [ ] **Step 4: Implement the presentation guard**

`AppState`: `[Id(30)] long ProgramRevision`, `[Id(31)] AppPresentation? Presentation`; `Clone` copies both. `AppNeuron.Deploy` (line ~627): `next.ProgramRevision++` and `Presentation = null` in the same write that lands the program; `Configuration(...)` adds `["ProgramRevision"] = state.ProgramRevision.ToString(CultureInfo.InvariantCulture)`. `AppNeuron.Presentation.cs`:
```csharp
public async Task<AppSnapshot> Present(long expectedProgramRevision, Presentation presentation)
{
    RequireExecutingAssignment(expectedProgramRevision);
    ArgumentNullException.ThrowIfNull(presentation);
    foreach (var slot in new[] { presentation.Side, presentation.Main }.OfType<UiChildRef>())
    { if (!slot.Name.StartsWith(Snapshot.BrainScopeId + "/", StringComparison.Ordinal)) { throw new ArgumentException("A slot names a neuron of this brain."); } }
    if (presentation.Sphere.BlackboardKeys.Intersect(FlameSchema.ReservedBlackboardKeys).Any()) { throw new ArgumentException("running and attention are reserved blackboard keys."); }
    if (presentation.Sphere.Tree is { } tree) { SceneValidation.CheckTree(tree, presentation.Sphere.BlackboardKeys); }
    var current = Snapshot.Presentation;
    if (current is { Root: { } root, Error: null } && root == presentation) { return Describe(Snapshot); }
    var next = Snapshot.Clone();
    next.Presentation = new(Snapshot.ProgramRevision, (current?.Revision ?? 0) + 1, presentation, null, new(current?.Blackboard ?? [], StringComparer.Ordinal));
    await Persist(next, new PresentationChanged(Key(), next.ProgramRevision, next.Presentation.Revision));
    return Describe(Snapshot);
}
```
(`SceneValidation` is internal to the Flame module; move `CheckTree` into `FlameSchema` in Flame.Contracts as `FlameSchema.CheckTree(BehaviorTree, string[] declaredKeys)` so Apps can call it, and have `SceneValidation` delegate.) `RequireExecutingAssignment`: `CallerContextStamper.TryGet` must give `Kind == App && AppId == key`, else `UnauthorizedAccessException`; `expectedProgramRevision != Snapshot.ProgramRevision` → `InvalidOperationException("The program was replaced; this assignment may not publish.")`. `WriteBlackboard`, `FailPresentation`, `Stamp` follow the same shape. Reuse the neuron's existing `Persist`/announce helper that publishes a signal with the write (LSP: find how `Progress` publishes `AppActivity`). Delete `AppManifest.Entry` and its validation; fix `AppManifestFacts`. Run → PASS.

- [ ] **Step 5: Write the failing space facts**

`…/Flutter.Tests/Space/SpaceFacts.cs` with `TestBrain.Create().WithModule<FlutterModule>().WithModule<AppsModule>().WithModule<FlameModule>()` plus the Apps test `ScriptedRuntime` (reference `DigitalBrain.Modules.Flame` and the Apps test support in the Flutter test csproj as needed):
```csharp
[Fact] public void TheComposerPlacesTheFocusedSphereUnderTheCamera()
{   // SpaceComposer.Compose(new(0, [brain, ino], [ino]), [ino entry ready with Main, files entry unready]) → ino node focused=true scale 2.2, camera at its x/y, files state unready, main JSON on ino only }
[Fact] public async Task APublishedPresentationAppearsInTheDerivedScene()
{   // create app files, Present as the app; read IScene "owner/a/space" → a sphere node id == files key with icon and state ready }
[Fact] public async Task ShowAndBackMoveTheCameraTarget()
{   // Show(files) → focused == files, camera moved; Back → focused ino }
[Fact] public async Task RunningFollowsActivityAndAScriptWriteToItIsRefused()
{   // app.Progress("working","…") → space sphere blackboard running=="true"; WriteBlackboard(running) refused }
[Fact] public async Task AScriptCannotWriteTheSpaceScene()
{   // person.AsApp(files): IScene("owner/a/space").Set(...) → UnauthorizedAccessException }
```
Run → FAIL.

- [ ] **Step 6: Implement the space**

`ISpace`, `SpaceNeuron` (`[GrainType("ui.space")]`, stateless `Neuron`, `Rebuild` catches and logs per-app read failures and still writes the scene), `SpaceComposer`, `SpaceWatcher` (registered in `FlutterModule.Configure(ISiloBuilder)` as a hosted service via `silo.Services.AddHostedService<SpaceWatcher>()`), `SceneAccess` change, csproj reference. `Rebuild` lists apps with `kernel.InstancesIn(brain, kernel.TypeOf(typeof(IApp)), ct)` as `FeatureReconciler` does. Run the space facts → PASS.

- [ ] **Step 7: Make the features compile at boot, update Dart, run every suite**

Patch the scripts listed under Files (window opens → `Show`), drop `Entry:` from every `app.cs`. Dart: models, client, `workspace_models_test.dart`. The shell still compiles against the old screens for now: `workspace_app.dart` call sites of the deleted client methods are stubbed to the new `showNeuron`/`readWorkspace` (it is rewritten in Task 5); `flutter analyze` must be clean.
```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
cd src/DigitalBrain.Modules/Google/Flutter/app/core && dart analyze && dart test && cd ../shell && flutter analyze && flutter test
```

- [ ] **Step 8: Run it, drive it, commit**

`dotnet run digitalbrain.cs`. If `ui.workspace` or `apps.app2` fails at activation with a wireType/deserialisation error, stop the host, wipe the Azurite volume, restart, and say so in the report. All Healthy. Through `digitalbrain-mcp`: `neurons_get IWorkspace {brain}` → `Path` ends `/apps/ino`; `neurons_call Show` files; `neurons_get IScene {brain}/space` → focused sphere is files; `Back`; `list_traces` shows `Show` → `Rebuild` → `Set` spans; `list_structured_logs` shows no `SpaceNeuron` warning. Commit explicit files.

---

### Task 5: Shell — one screen, four regions, zoom

**Files:**
- Create: `app/shell/lib/space/neuron_space.dart` (`NeuronSpace` screen), `space_field.dart` (`SpaceField`: `SceneView` of `{brain}/space` with camera animation), `space_slots.dart` (`SideSlot`, `MainSlot` wrapping `NeuronView`), `space_toolbar.dart` (`SpaceToolbar` built on the existing `Dock` entries + Home button), `space_controller.dart` (`SpaceController`: holds `WorkspaceSnapshot`, the current `SceneState`, issues `show/back/home/close` with fresh operation ids, re-reads on `RevisionConflict`)
- Modify: `app/shell/lib/workspace/workspace_app.dart` (body becomes `NeuronSpace`; delete `_homeChoice`, `_home`, `_homeScreen`, `_work`, `_dock`, `_islands`, `reconcileWorkspace` calls, persistence wiring), `workspace_store.dart` (delete `WorkspacePresentation`, `WorkspaceProject.presentence`, `reconcileWorkspace`, `remoteManaged`, `WorkspacePersistence`, `MemoryWorkspacePersistence`, `WorkspaceSaveConflict`; keep `WorkspacePreferences` + its local persistence), `main.dart` (`persistenceKey` only for preferences), `app/ui/lib/src/composition/neuron_view.dart` (delete `WindowStateView`, `FirstRunView`), `renderer_registry.dart` if it lists `window`/`firstrun`
- Delete: `app/shell/lib/workspace/workspace_desktop.dart`, `home/home_screen.dart`, `dock/assistant_island.dart`, `workspace_islands.dart`, `neuron_workspace_persistence.dart`, `app/ui/lib/src/lumen/ino_presence.dart`, `lumen_brain_graph.dart`, `app/ui/lib/src/components/graph/*` **only if** LSP shows no use outside Home (otherwise keep `UiGraph` for slots and delete only its Home use), `app/ui/lib/src/flame/prefabs/ino_sphere.dart`, `brain_graph.dart` (the field is spheres only; BrainView's `brain_graph` node type is removed from `FlameSchema`/`FlameVocabulary`/JSON/Dart schema in this task and BrainView's scene becomes a `sphere`-only scene in Task 9), tests `workspace_desktop_test.dart`, `home_screen_test.dart`, `assistant_island_test.dart`, `first_run_test.dart`, `workspace_presentation_test.dart`, `neuron_workspace_persistence_test.dart`, `workspace_focus_test.dart`, `workspace_window_client_test.dart`, `workspace_companion_test.dart`, `workspace_app_open_test.dart`, `workspace_data_window_test.dart`, `customer_researcher_window_test.dart`, `brain_graph_panel_test.dart`, `lumen_brain_graph_entry_test.dart`
- Delete C#: `…/DigitalBrain.Modules.Flutter/Workspace/ShellStateNeuron.cs`, `ShellPartNeuron.cs`, `ShellSnapshotParts.cs`, `ShellHeadState.cs`, `ShellPartState.cs`, `ShellRead.cs`, `IShellState.cs`, `IShellPart.cs`, `ShellPersistenceEndpoints.cs`; tests `ShellPersistenceFacts.cs`, `Workspace/ShellPersistenceHttpFacts.cs`; `FlutterModule.Configure` drops `MapShellPersistence`
- Create tests: `app/shell/test/space/neuron_space_test.dart`, `space_controller_test.dart`, `space_slots_test.dart`

**Interfaces:**
- Consumes: `WorkspaceSnapshot(revision, path, open)`, `ui_client.showNeuron/backNeuron/homeNeuron/closeNeuron/readWorkspace`, `SceneClient.read/report`, `watchNode(brain, 'scene', '$brain/space')`, sphere node parameters (`side`, `main`, `toolbar`, `title`, `description`, `state`, `error`, `focused`, `neuron`).
- Produces: `SpaceController` API — `Future<void> show(String key)`, `back()`, `home()`, `close(String key)`, `ValueListenable<SpaceView> view` where `SpaceView(SceneState scene, String focused, UiChildRef? side, UiChildRef? main, List<AppToolbarEntry> toolbar, String title, String description, String state, String? error)` is read off the focused sphere node.
- Layout: full-bleed `SpaceField`; left column 320 px `SideSlot` when `side != null`; `MainSlot` fills the area right of the sphere when `main != null` (the field keeps the focused sphere at x = 28 % of width then, 50 % otherwise); bottom `SpaceToolbar` 64 px with the Home button at bottom-left; title/description above the sphere. Zoom: on a focused-key change the field animates camera and focus scale over 420 ms (`Curves.easeInOutCubic`) and slots fade/slide in over 240 ms; `MediaQuery.disableAnimationsOf(context)` → durations zero; identical scene revision → no animation; reconnect replays nothing (the controller keeps the last focused key).

- [ ] **Step 1: Write the failing shell tests**

`neuron_space_test.dart` (fake `DigitalBrainUiClient` and `SceneClient` as the existing shell tests do — look at `application_fixture.dart`):
```dart
testWidgets('a fresh brain shows Ino focused with its main slot and the Home button', ...);   // scene with ino focused, main chat ref → finds SideSlot absent, MainSlot present, Semantics 'Home'
testWidgets('tapping a sphere posts Show and the slots swap after the zoom', ...);           // report tap → controller.show(key) called with fresh op id; after pump 500ms new main
testWidgets('Home pops to the brain', ...);
testWidgets('reduced motion cuts the flight', ...);                                           // with disableAnimations, slots are present after one pump
testWidgets('each slot kind renders in its region', ...);                                     // text in side, surface in main
testWidgets('an errored presentation shows the attention badge and the error in main', ...);
```
`space_controller_test.dart`: a 409 from `showNeuron` re-reads and retries once with the returned `currentRevision`; identical revision does not rebuild the view. Run `flutter test test/space` → FAIL.

- [ ] **Step 2: Build the screen**

Implement the five Dart files; wire `WorkspaceApp.build` to `NeuronSpace`; keep `WorkspacePreferences` with its local store; keep settings/connections windows reachable from the toolbar's Settings entry as an app sphere (`settings` is an app). Run the tests → PASS.

- [ ] **Step 3: Delete the old screens, the lumen copies, ShellState**

Delete everything listed; remove `brain_graph` from the schema on both sides and the JSON; `flutter analyze` in `shell` and `ui`, `dart analyze` in `core`; delete the C# shell-state files and facts; build and test the Flutter module project; `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`.

- [ ] **Step 4: Run it and commit**

`dotnet run digitalbrain.cs`; Healthy (the `shell` resource builds the web app — read `list_console_logs` for it if not). Through `digitalbrain-mcp`: `neurons_get IScene {brain}/space` focused ino; the shell is a connector, so its state is the workspace + space neurons — confirm `Show(files)` from the MCP moves the focused sphere the shell draws (`list_traces` shows the `Rebuild`). Commit explicit files.

---

### Task 6: Ino — presence tree on blackboard mood

**Files:**
- Modify: `features/os/Ino/app.cs` (spec text, version `2.0.0`, `Operations: [open]`, `Toolbar: [new("open", Icon: "chat", Label: "New conversation")]` only if `open` is the right operation — the toolbar entries are `new("new-conversation", …)` and `new("voice", …)` routed as the Assistant's operations; keep what the manifest validator accepts: toolbar entries must be this app's operations, so declare `Operations: [open, new-conversation, voice]`), `features/os/Ino/Ino.cs` (rewrite: `Presence()` tree, `Present(brain)`), `features/os/Ino/open.cs`
- Create: `features/os/Ino/presence.cs` (one synapse over `AppActivity` of the Assistant), `features/os/Ino/new-conversation.cs`, `features/os/Ino/voice.cs` (forward to the Assistant's `new`/`voice-begin` operations by `IApp.Request`)
- Delete: `features/os/Ino/ring.cs` (the recent-apps history), `listen.cs`, `think.cs`, `speak.cs`, `fail.cs` (the four presence synapses — LSP/`ls` for the exact names), the welcome scene code
- Modify: `features/os/Assistant/app.cs` spec (its `Progress` states are the mood source; no code change needed beyond what Task 9 does)

**Interfaces:**
- Consumes: `IApp.Present`, `WriteBlackboard`, `brain.Setting("ProgramRevision")`, `AppActivity`.
- Produces (Ino.cs):
```csharp
public static class Ino
{
    public static string Key(DigitalBrainConnection brain) => brain.Setting("App")!;
    public static string Scope(DigitalBrainConnection brain) => brain.Setting("Brain") ?? Key(brain)[..Key(brain).IndexOf("/apps/", StringComparison.Ordinal)];
    public static string AssistantKey(DigitalBrainConnection brain) => Scope(brain) + "/apps/assistant";
    public static long ProgramRevision(DigitalBrainConnection brain) => long.Parse(brain.Setting("ProgramRevision")!, CultureInfo.InvariantCulture);

    // idle, listening, thinking, acting, speaking, error, read from the blackboard key "mood".
    public static BehaviorTree Presence() => new(TreeNode.Selector(
        TreeNode.Sequence(false, TreeNode.Condition("mood", "listening"), TreeNode.Scale(1.08, 0.4), TreeNode.Scale(1.0, 0.4)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "thinking"), TreeNode.Pulse(0.12, 1.0)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "acting"), TreeNode.Pulse(0.2, 0.5)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "speaking"), TreeNode.Fade(0.8, 0.3), TreeNode.Fade(1.0, 0.3)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "error"), TreeNode.Scale(0.9, 0.2), TreeNode.Wait(0.6), TreeNode.Scale(1.0, 0.2)),
        TreeNode.Repeat(TreeNode.Wait(1))));

    public static Presentation Presentation(DigitalBrainConnection brain)
        => new(new Sphere("icon.svg", ["mood"], Presence()), Side: null, Main: new UiChildRef(UIVocabulary.SurfaceType, AssistantKey(brain) + "/surface"));

    public static Task Present(DigitalBrainConnection brain) => brain.Get<IApp>(Key(brain)).Present(ProgramRevision(brain), Presentation(brain));

    public static string MoodOf(string activityState) => activityState switch
    {
        "listening" or "accepted" => "listening", "working" or "waiting" => "thinking",
        "reading" or "searching" => "acting", "completed" => "speaking", "attention" => "error", _ => "idle",
    };
}
```
`presence.cs`: `await foreach (var activity in brain.On<AppActivity>(brain.Get<IApp>(Ino.AssistantKey(brain)), brain.Stopping)) { await brain.Get<IApp>(Ino.Key(brain)).WriteBlackboard(Ino.ProgramRevision(brain), new() { ["mood"] = Ino.MoodOf(activity.State) }); }`. The Assistant's synapses already report their state through `Progress` (`listening` when a message arrives, `working` while answering, `completed`, `attention` on failure): that is the write of mood; Ino maps it to its declared key. `open.cs`: `await Ino.Present(brain);` at startup and on each `open`; on failure `FailPresentation`. Main slot: the Assistant's surface already composes the transcript chat and the composer with voice; it is the chat with voice.

- [ ] **Step 1: Write the code**

Rewrite the three files, create the three synapses, delete the five. `app.cs` spec paragraph: "Ino is the assistant's presence. Its sphere's mood follows the assistant's activity; its main slot is the assistant's selected conversation. open publishes the presentation." Bump `Version`.

- [ ] **Step 2: Compile gate**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*FeatureCatalog*"
```
Expected: the catalog compiles `os/ino` (the facts that load `./features` pass).

- [ ] **Step 3: Run it, drive it, commit**

`dotnet run digitalbrain.cs`; Healthy. `digitalbrain-mcp`: `neurons_get IApp {brain}/apps/ino` → `Presentation.Root.Sphere.Tree` present, `Main` = assistant surface; `neurons_call IApp {brain}/apps/assistant Progress("working","x")` → `neurons_get` Ino blackboard `mood == "thinking"`; `neurons_get IScene {brain}/space` ino node `blackboard` carries it; a fresh brain (create one through the MCP or the `/identity` route) reads `Path` ending `/apps/ino`. `list_traces`: `AppActivity` → `presence` behavior run → `WriteBlackboard` → `Rebuild`. Commit explicit files.

---

### Task 7: Files — side, main, toolbar from one publish

**Files:**
- Modify: `features/os/Files/app.cs` (version bump; `Operations: [open, browse, read, up]`; `Toolbar: [new("up", Icon: "arrow-up", Label: "Up"), new("open", Icon: "folder", Label: "Storages")]`), `features/os/Files/open.cs` (publish instead of layout/surface), `features/os/Files/Machine.cs` (`Storages` list into a side collection `appKey + "/storages"`; breadcrumbs stay on the listing)
- Create: `features/os/Files/up.cs` (parent breadcrumb of the current location → `browse`), `features/os/Files/storage-activated.cs` (`CollectionActivated` on `/storages` → `browse` that storage)

**Interfaces:**
- Produces: `open.cs` startup:
```csharp
var main = brain.Get<ILayout>(appKey + "/main");
await main.Set(new("column", [new(UIVocabulary.TextFieldType, appKey + "/filter"), new(UIVocabulary.CollectionType, appKey + "/listing"), new(UIVocabulary.TextType, appKey + "/content")], Extents: [64, 0, 0]), (await main.Read()).Revision);
await app.Present(long.Parse(brain.Setting("ProgramRevision")!, CultureInfo.InvariantCulture),
    new(new Sphere("icon.svg", []), Side: new(UIVocabulary.CollectionType, appKey + "/storages"), Main: new(UIVocabulary.LayoutType, appKey + "/main")));
```
No `/surface`, no window. `Machine.Browse` also writes `/storages`: one `CollectionItem` per Windows connection (label = storage label) plus, under the selected storage, one per allowed root. Breadcrumbs remain on `/listing` (the toolbar's "Up" uses them).

- [ ] **Step 1: Write the code** — as above; delete the surface set and the `using DigitalBrain.Flutter.Surface`.
- [ ] **Step 2: Compile gate** — the FeatureCatalog facts as in Task 6.
- [ ] **Step 3: Run it, drive it, commit** — `digitalbrain-mcp`: `Show(files)`; `neurons_get IScene {brain}/space` → files node `side` = storages collection, `main` = layout, `toolbar` has Up and Storages; `neurons_call IApp files Request("browse","")`; `neurons_get ICollectionView {brain}/apps/files/storages` lists the connected PC (or the not-connected empty label). Traces show `browse` → collection `Set`. Commit explicit files.

---

### Task 8: Friends and posts

**Files:**
- Create: `features/os/Friends/{app.cs,Friends.cs,open.cs,post.cs,icon.svg}`; add Friends to OS personal-brain defaults and default/catalog facts.
- Modify: Circles `ICircleChat`, `CircleChatNeuron`, `CircleNeuron`, `CircleSignals`; add real `FriendsPublicationFacts`.
- Create/modify: Flutter `CircleMembers`, `ISpace`, `SpaceNeuron`, `SpaceComposer`, `SpaceWatcher`, `FlutterModule`, `AppUiEndpoints`, typed leaf readers in `PersonNeuron` and `CardNeuron`; real `FriendsSpaceFacts`.
- Modify: Dart UI client/node contracts, person renderer, renderer registry/gallery; focused watch and stale-view facts.

**Interfaces:**
- Produces (app manifest): `Name = "friends"`, `Version = "1.0.0"`, `Operations: [new("open", "Publish the Friends presentation."), new("post", "Post the input text to every circle you are in.")]`, `Settings: []`, `Slots: []`, `Icon: "icon.svg"`, `Toolbar: [new("post", Kind: AppToolbarKinds.Text, Label: "Post")]`.
- Neurons: profile `IPerson` at `{brain}/profile` (`Set(displayName, avatarUrl)`; `open` seeds it from the brain's owner display name when empty — `brain.Setting("Brain")` is the brain id; the name comes from `IConnectionRequests`? No: use the kernel's membership display name via `IIdentityClient` is server-side only; a script seeds `"Me"` and the person edits it later — profile editing beyond name/avatar is out of scope); post `ICard` at `{brain}/posts/{id}` (`Set(title: first 60 chars, body: text)`); own index `ICollectionView` at `{brain}/posts` (items newest first, id = post key, label = title); circle index: `ICircleChat.PublishPost(postKey, requestId)` in every circle from `ICircleFactory.Circles()`.
- Friends presentation: `Presentation(new Sphere("icon.svg", ["unread"]), Side: new("collection", appKey + "/circles"), Main: new("text", appKey + "/about"))` — the side lists circles; friends themselves are spheres in the brain's field, not slot content.
- Space derivation (`CircleMembers.FriendsOf(brainId)`): for each circle in `ICircleFactory.Circles()` of the brain, `ICircle.State().Members` minus the viewer's account → each member's personal brain id via `IIdentityClient` (LSP: the method that lists an account's brains, as `CircleFactoryNeuron.Circles` uses `BrainsOf`), deduplicated. A friend entry: key `{friendBrain}/profile`, title = `IPerson.Read().DisplayName`, description = "Friend", presentation: sphere icon `person`, side = `{friendBrain}/posts` collection, main = `{friendBrain}/profile` person. Focus on a friend → field = their posts read from the circle chat lines `post {friendBrain}/posts/…`; a post entry: key = the post key, title = card title, presentation sphere icon `post`, main = the `ICard`. The module reads with `grains.GetGrain<…>` (server side, no copies); a member who left is not in `Members` on the next rebuild, and every stale typed read is denied. Legacy circle chat references are accepted only when their speaker owns the referenced author brain.
- Workspace: `Show("{friendBrain}/profile")` and `Show("{friendBrain}/posts/{id}")` are accepted by shape (a `/profile` or `/posts/` key); `Open` is unchanged for them.

- [ ] **Step 1: Resolve the publication gate (user-authorized replacement)**

Inspect both `NeuronCallFilter` and `CircleChatNeuron.Member`. Keep ordinary `Say`/`Read` unchanged; add method-shared `PublishPost` with the original verified personal-owner Friends App caller, canonical own-post reference and current circle membership. Check authorization before durable publication-receipt deduplication. Do not widen generic policy or impersonate a circle caller. Real TestBrain RED/GREEN must cover current member, nonmember/removed member, forged scope/app/other author, legacy circle-scoped publication and retained replay.

- [ ] **Step 2: Write the failing space facts**

`FriendsSpaceFacts.cs` with `TestBrain` composed as `CircleBrainRooms.Start` does (Apps over `./features`, Circles, Flutter, Flame; `NoRuntime`):
```csharp
[Fact] public async Task ACircleMembersProfileAppearsInTheFriendField()
{   // alice creates circle, bob joins; bob sets {bob}/profile "Bob"; read IScene "{alice}/space" → sphere "{bob}/profile" titled Bob }
[Fact] public async Task FocusingAFriendShowsTheirPosts()
{   // bob writes ICard {bob}/posts/p1 and Say("post {bob}/posts/p1"); alice Show({bob}/profile) → field has sphere {bob}/posts/p1, main of focused = person }
[Fact] public async Task OpeningAPostIsTheSameZoom() { /* Show({bob}/posts/p1) → focused node main = card */ }
[Fact] public async Task AMemberWhoLeavesVanishesFromTheField() { /* ICircle.Remove(bob) → rebuild → no {bob}/profile sphere, Show({bob}/profile) still accepted by shape but the field has no such node */ }
```
Run → FAIL.

- [ ] **Step 3: Implement the module side** - `CircleMembers`, composer entries, and `SpaceWatcher` rebuild on CircleChanged (previous and current member brains) and CircleSpoke. Also consume canonical PersonChanged/CardChanged for author and current shared-circle viewers, and CircleMembershipRevoked immediately after trust removal. The module-only immutable member-ID snapshot can interleave during rotation; ordinary circle State/Remove cannot. Tests pause real rotation and prove both scenes/slots clear before release. Typed viewer-scoped ISpace.ReadProfile/ReadPost/ReadPosts recheck both trust-directory and circle-snapshot membership for viewer/author, and speaker-owned published references per request. The friend index is a transient filtered projection, never the author global index. HTTP delegates only exact profile/post/index shapes to the neuron; collection activation validates a visible reference then navigates the viewer workspace. The shell watches viewer scene changes, renders person slots and clears cached data on denied reads. Keep the verified viewer caller throughout and use narrow module-only leaf readers. Resolve viewer ownership from the runtime machine trust directory to avoid brain-creation cycles. Include a real creation-lifecycle regression. Run RED then GREEN.

- [ ] **Step 4: Write the app** — the five files; `post.cs`: `await foreach (var request in brain.On(app, "post", brain.Stopping))` → id = `request.RequestId.ToString("N")`, write card only if absent, prepend own index entry only if absent, `PublishPost` in each circle with `request.RequestId.ToString()`. Compile gate as Task 6.

- [ ] **Step 5: Run it, drive it, commit** — two brains in the running OS (the owner and a second account through `/identity`, or the circle route), create a circle, join, `post` through `digitalbrain-mcp`, `Show` the friend from the other brain, `neurons_get IScene {brain}/space` shows the post sphere; traces show `post` → `PublishPost` → `Rebuild`. Commit explicit files.

---

### Task 9: Every other first-party app publishes once

**Files:** one edit per site the review lists, replacing the `/main` → `/surface` → `/window` block (and any `OpenWindowAsync`/`EnsureOpenAsync`/`Show` shim from Task 4) with one `Present`:
- `features/os/Memory/open.cs:57-71` → `Present(rev, new(new Sphere("icon.svg", []), Main: new("layout", appKey + "/main")))`; delete the surface set.
- `features/os/Settings/open.cs:50-58` → same shape.
- `features/os/Engineer/Engineer.cs:299-322` → `ComposeAsync` publishes; delete `OpenWindowAsync`.
- `features/os/DataVisualizer/Views.cs:60-135` → `ComposeHome` publishes `Main: layout appKey/main`; views become content of the main layout (one hosted instance per app); delete `OpenWindowAsync`, `OpenViewWindowAsync`, `CloseViewWindowAsync`, `ChangeWorkspaceAsync`, `EnsureWindowAsync` and their callers (LSP `findReferences`).
- `features/os/Circle/CircleView.cs:18-24` → publish `Main: layout app/main`; `open` input `"docked"` loses its meaning — delete that branch and the spec sentence.
- `features/os/CircleRoom/Room.cs:20-26` → same.
- `features/os/BrainView/BrainView.cs:21-55` → the scene becomes a `sphere`-only scene is wrong: BrainView's graph was a Flame prefab now deleted; its presentation is `Main: layout app/main` with the `/panel` column (`cards/selected`, `runs`) and no scene (the brain's field is Home itself). Delete `SceneKey`, `BrainScene`, `ComposeScene` and their callers.
- `features/os/SelfImprove/SelfImprove.cs:80-91` → publish; delete `OpenWindowAsync`.
- `features/os/Assistant/Assistant.cs:183-211` + `open.cs` → `ComposeAsync` publishes `Main: surface Key/surface` (the surface stays: it is the chat Ino's main also shows); delete `OpenWindowAsync`.
- `features/os/Assistant/routed.cs:83-93` → `workspace.Show(IApp.Key(scope, route.App), routed.Id.ToString(), state.Revision)`; the "has no workspace entry" branch goes.
- `features/intochat/CustomerResearcher/open.cs:20-40` → publish; delete the window branch.
- `features/os/Router/Jev.cs:28-47` → `OpenWindow` becomes `Show` of the app key; delete surface references.
- `features/os/Calculator`, `FilmCraft`, `PhotoCraft`, `WordCount`, `SvLoans`: each `open.cs` (or its compose helper) publishes `Main` = its existing root layout/surface; `app.cs` already lost `Entry`.
- Remove `Entry` mentions from every `app.cs` spec paragraph; bump each `Version` patch.

- [ ] **Step 1: Map each site with LSP** (`findReferences` on `ISurface`, `IWorkspace`, `EnsureOpenAsync`, `OpenWindowAsync` in `features/`) and confirm the list above is complete; add any site found.
- [ ] **Step 2: Edit each site** — one publish per app, no surface wrapper unless the surface is the root the app already composes.
- [ ] **Step 3: Compile gate** — `dotnet test --project …/DigitalBrain.Modules.Apps.Tests -- --filter-method "*FeatureCatalog*"`; also `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`.
- [ ] **Step 4: Run it, drive it, commit** — `dotnet run digitalbrain.cs`; Healthy; `neurons_get IScene {brain}/space` at Home lists every installed app as a sphere with `state == ready` (or `error` with text) — none `unready` after the programs start; `Show` three of them and read their `main`; `list_structured_logs` filtered on `SpaceNeuron` shows no warning. Final regression net:
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter analyze && flutter test
```
Commit explicit files.

---

## Self-review

- **Spec coverage.** §1 Presentation/Sphere/blackboard/reserved keys → Task 4; Workspace shape and seed → Task 4; derived scene and "never stored by a script" → Task 4 (`SceneAccess` refuses App writers on `{brain}/space`); Flame contract, validation, schema parity, placeholders → Task 3; §2 one screen, zoom, reduced motion, no replay on reconnect, toolbar, Home, deletions → Task 5; §3 Ino → Task 6, Files → Task 7, Friends/posts → Task 8; §4 flow/failures/cross-brain/provenance/state → Tasks 4 and 8; §5 contract facts → Tasks 3, 4, 8; Flutter tests → Tasks 3, 5; live loop → every task's last step; delivery order → Tasks 3→4→5→6→7→8 with deletions as each lands (Task 1 pre-work, Task 2 the guard first, Task 9 the remaining apps).
- **Placeholders.** None: every step names files, code or the exact command.
- **Type consistency.** `RevisionConflictException(message, currentRevision)` everywhere; `Present(long expectedProgramRevision, Presentation)`; `WorkspaceState(Revision, Path, Open)`; `ISpace.Rebuild()`; sphere parameters `icon,title,description,blackboard,side,main,toolbar,state,error,neuron,focused` used by Tasks 4, 5, 8.
- **Review Focus.** Each line has its fact in Tasks 3, 4 and 8.
- **Honest gaps.** Task 8 historical Say conflict is resolved by the explicit authorization decision appended to the spec; a dedicated PublishPost retains the caller and all filter stages. Run-token tightening stays an open front: the presentation guard uses the kernel-stamped `AppId` plus the program revision, the boundaries that exist today.

Task8 review round1 decision: emit durable CircleMembershipRevoked immediately after successful trust removal, before key rotation/commit. Rebuild previous member brains on that signal. A module-only member-ID snapshot read may interleave solely to return an immutable copy, without waits/writes; ordinary State/Remove stay nonreentrant. Read derivation still intersects trust and snapshot membership because the snapshot may be mid-operation. Cost: one narrow internal read and signal contract. PersonChanged/CardChanged canonical profile/post signals rebuild author and current shared-circle viewers so mounted slots and sphere metadata refresh. Real-grain tests must observe updates and paused-removal invalidation without navigation or explicit rebuild after the triggering mutation.

Final-review fix decision: Friends persists a revision-CAS collection of initial destination circle IDs per request under its app, before card creation/index/fanout. Retries use only that immutable audience (including empty), while PublishPost repeats current membership/ownership/provenance checks. Existing card/index without an audience is recorded with an empty audience, never inferred from current membership; legacy partial publication is intentionally not repaired automatically. Partial new fanout retries retain their original destinations and per-circle receipts prevent duplicates. SpaceWatcher also consumes AppChanged using the kernel publisher key, covering idle create/manifest/delete without changing wire contracts or navigation. Tests exercise real retained requests and signal-driven scenes.

Final scoped follow-up: replay sends only to saved audience IDs still returned by the author's current circle membership. PublishPost retains its own current-membership guard. If a call races with removal and throws UnauthorizedAccessException, re-read current circles and skip only when that exact destination is now absent; otherwise rethrow. Other failures remain visible. The saved audience is never expanded or rewritten, and removal of one destination must not terminate processing of the other destinations or later requests.
