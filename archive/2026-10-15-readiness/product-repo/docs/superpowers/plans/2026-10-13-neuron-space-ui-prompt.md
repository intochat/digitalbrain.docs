# Implementation prompt: neuron space UI

Paste this into a fresh session in `E:\intochat\digitalbrain` on branch `os-runtime`.

---

Implement the neuron space UI redesign. Two documents are the source of truth; read both fully before
anything else:

- Spec (approved): `docs/superpowers/specs/2026-10-13-neuron-space-ui-design.md`
- Complexity review with decision table: `docs/superpowers/reviews/2026-10-13-ui-complexity-review.md`

Decisions already taken from the review's table: items 1 through 7, 9 and 10 are all accepted as
written. Item 8 (collapsing the 38 UI kinds into a generic `Part<T>`) is NOT in scope; leave the
kinds as they are.

Start by invoking `superpowers:writing-plans` against the spec to produce
`docs/superpowers/plans/2026-10-13-neuron-space-ui.md`, then execute it with
`superpowers:subagent-driven-development`. Keep this order, one task group at a time, each verified
before the next starts:

1. **Pre-work deletions.** Remove the Flame Stage neuron, `IStage`, `StageKey`, `StageChanged`, the
   stage routes, `shell/lib/stage/`, `scene_client` stage calls and `stage_view_test.dart`. Remove
   `UiKitEndpoints` and its DTOs except the `/ui/tables` routes, which move under `AppUiEndpoints`.
   Remove the Dart `readUi` call. Commit.
2. **Revision guard in the base neuron.** One expected-revision check and idempotent `operationId`
   replay in `Neuron`, a typed conflict that crosses the script boundary (HTTP 409 with the current
   revision, mapped to a typed exception in `DigitalBrainConnection`). Delete every hand-rolled retry
   loop and message-text match the review lists in S1. Commit.
3. **Flame behavior trees.** Replace `StateMachine` with `BehaviorTree` in `SceneDefinition` per spec
   section 1. `FlameSchema` + `SceneValidation.Check` validate tree shape, blackboard keys and task
   ranges. A Flame fact emits the schema JSON; a Flutter test asserts parity. Dart runs trees with the
   `flame_behavior_tree` package; a default idle tree ships in the shell. Commit.
4. **Workspace Path and derived scene.** Reshape `WorkspaceNeuron` to `WorkspaceState(Revision, Path,
   Open)` with `Show`, `Back`, `Home`, `Close`; delete windows, focus, receipts for windows,
   `FirstRunState`, `WorkspaceStarterCatalog`, `Configure`, `WorkspaceWindows`, `AppManifest.Entry`.
   Add `Presentation(Sphere, Side, Main)` and the blackboard to app state under the program-revision
   guard; reserved keys `running` and `attention` are module-stamped. The Flutter module derives one
   scene per brain and serves it on the scene stream; the workspace SSE is deleted. Commit.
5. **Shell.** One screen: Flame field + four regions (side, main, toolbar, Home button), zoom as the
   only transition, reduced motion cuts. Delete `WorkspaceDesktop`, `HomeScreen`, `AssistantIsland`,
   `WorkspacePresentation`, `reconcileWorkspace`, `_homeChoice`, the shell snapshot persistence and
   `ShellStateNeuron` + parts + `/shell/state`; keep `WorkspacePreferences` per device. Spheres are
   Flame only: delete the lumen presence and graph copies and `UiGraph` on Home. Commit.
6. **Ino.** Presence tree on blackboard `mood`; the Assistant's synapses write `mood`; delete Ino's
   state machine, presence synapses, copied `Conversation`, welcome scene and scene-parameter history.
   Main slot is the assistant conversation as chat with voice. Sign-in lands on Ino. Commit.
7. **Files.** Side = storages and roots, main = listing + filter + preview, toolbar = breadcrumbs +
   Storages. One `Presentation` publish replaces the `/main` → `/surface` → `/window` block. Commit.
8. **Friends.** New `features/os/Friends` app per spec section 3: profile neuron `{brain}/profile`,
   posts `{brain}/posts/{id}` with their own presentation, `post` and `open`, circle publication path,
   member index in the circle brain. Commit.
9. **Every other first-party app** replaces its composition block with one publish (the twelve sites
   the review lists). Commit.

Non-negotiables from `CLAUDE.md` apply to every task:

- LSP (csharp-ls over the root sln, dart language-server) for every definition, reference and
  caller before an edit; diagnostics clean after. If csharp-ls is unavailable under the .NET 11 RC
  SDK, use codegraph plus per-project builds and say so.
- Build and test per project, never the `.slnx`. Tests are facts on
  `TestBrain.Create().WithModule<…>()`; no hand-rolled hosts, no mocks where a real grain works.
- Done means seen running: `dotnet run digitalbrain.cs`, every Aspire resource Healthy, the path
  driven through `digitalbrain-mcp` (`neurons_context`, `neurons_call`, `neurons_get`), spans and
  logs confirmed in the Aspire MCP. For the shell: a fresh brain lands on Ino with chat, Files shows
  its folder, a Friend shows a post. No Playwright.
- Concrete arrays in grain state, whole rebuilds, no self-calls on non-reentrant grains, no state
  migration (wipe Azurite when a reshape fails at activation and say that you did).
- Never raise a timeout or add polling to make a check pass.
- Commit explicit files only, never by directory; end commit messages with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Brainstorm nothing: the design is fixed. If a task cannot be done inside the spec, stop and report
  the conflict instead of improvising a fifth concept.

Report after each task group with what was deleted, what was added, the test commands run and their
output, and the `digitalbrain-mcp` calls that showed it running.
