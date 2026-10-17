# UI area complexity review (2026-10-13)

Read-only. Three reviewers, one each for the Flutter shell, the Flutter/Flame server modules and the
first-party apps' UI composition, each asked: "I feel like there is something fundamentally wrong,
find the main source of complexity." Counts were re-verified by hand where they drive a deletion.
Companion to `2026-10-12-brain-as-data-complexity.md` part 9 and to the approved design
`../specs/2026-10-13-neuron-space-ui-design.md`. Nothing was changed; the DECISION column is the user's.

## The one root cause

**"What the person sees" has no owner.** It is held in six stores, decided at about eighteen
entry points in the shell, and rebuilt by every app by hand. Everything else below is a consequence.

| Store | Holds | Where |
|---|---|---|
| `WorkspaceNeuron` (per brain) | window dictionary, `FocusedWindow`, `Home`/`Companion` refs, receipts | `Flutter/Workspace/WorkspaceNeuron.cs:137-146` |
| `FirstRunState` | synthesized on every `Read()` while no window is open; hardcoded assistant id and starter prompts | `WorkspaceNeuron.cs:86-88`, `Contracts/Workspace/FirstRunState.cs` |
| `StageNeuron` (per person) | a second navigation stack with its own Home, Go, Back, and its own owner-digest key scheme that "mirrors `ShellPersistenceEndpoints.Scope` exactly" | `Flame/Stage/StageNeuron.cs:40-81`; **no caller in `shell/lib`, only `shell/test/stage_view_test.dart`; no C# caller outside Flame** |
| `SceneNeuron` | per-app scenes (`{app}/scenes/home`, `/scenes/welcome`) plus server-side state-machine current state | `Flame/Scene/SceneNeuron.cs:13-52` |
| `AppManifest.Entry` | a third answer to "what is this app's root" | `Apps/AppManifest.cs:44-56` |
| `ShellStateNeuron` + `ShellPartNeuron` + `ShellSnapshotParts` | a client JSON blob (projects, conversations, artifacts, window layout) up to 16 MB stored as a content-addressed tree | `Flutter/Workspace/ShellSnapshotParts.cs`, ~330 lines; only caller is the shell's local `neuron_workspace_persistence.dart` |
| Shell-local `WorkspaceStore` | its own window list (`WorkspacePresentation`: open, minimized, active, modes, bounds), merged with the remote snapshot by `reconcileWorkspace` into one list holding two kinds of window | `shell/lib/workspace/workspace_store.dart:177-238, 357-405` |
| Shell widget flags | `_homeChoice`, `_companionExpanded`, `_animateFocus`, `focusedRoot == companion`, dock visibility, browser routes | `workspace_app.dart:80-81, 167, 273-320, 932-940, 1112-1118` |

Consequences, each with evidence:

- **Focus is computed twice** (`workspace_store.dart:423-436`: remote if a snapshot exists, else a local rule), and every open, close, focus and minimize in the store branches on `remoteManaged`.
- **About eighteen places change what is shown** in the shell: nine store window methods, `_accept`, `_open`, `_openApplication`, `_launchApp`, `_activateWorkspace`, `_navigateRoute`, Home's focus/stop, the open-windows chip strip, the desktop close button.
- **Every app re-implements the shell's layout.** 15 of 16 manifests declare `Entry: new("surface", "surface")` and then build layout `/main` → surface `/surface` → window `/window` themselves in twelve places (`Files/open.cs:14-21`, `Memory/open.cs:62-69`, `Settings/open.cs:53-57`, `Engineer.cs:302-318`, `DataVisualizer/Views.cs:83-92`, `Circle/CircleView.cs:22`, `CircleRoom/Room.cs:24`, `BrainView.cs:21-55`, `SelfImprove.cs:89`, `Assistant.cs:194`, `Assistant/routed.cs:90`, `CustomerResearcher/open.cs:30`). The Assistant's `OpenWindowAsync` carries an 8-attempt retry loop; the Assistant also opens *other* apps' windows from `routed.cs:83-93`, so a domain app acts as window manager.
- **Keys are guessed from string suffixes.** Four addressing schemes (`UiParts.NameOf`, `UiScope.Key`, `IScene.Key`, the Dart regex `appOfWindow`), and `/status` ×19, `/main` ×14, `/surface` ×13, `/window` ×6 literals across features and modules. Only `/surface` and `/main` are shared, by copy, not by rule.
- **UI-only synapses outnumber domain ones.** Ino is 186 of 224 lines UI plumbing (83%): a hand-written 6-state, 18-transition machine, four presence synapses with `Task.Delay` timers and a compare-then-rest guard, recent-apps history kept as JSON inside a scene parameter. Assistant has six `projection-*.cs` files that each re-run the same whole `Project()`. Ino copies `Assistant.Conversation` verbatim (`Ino.cs:19-25` vs `Assistant.cs:146-151`) and reaches into the Assistant's private keys to recompute a mood the Assistant already publishes as `Progress`.
- **Shell-only ideas leak into app contracts.** `brain.On(app, "open")` in 13 apps means "rebuild my UI"; `app.Progress("attention", …)` reports failures of the UI rebuild itself (`Ino/open.cs:15`, `BrainView/open.cs:15`).

**Simpler shape** (what the approved spec already says, now with the evidence behind it): one
`WorkspaceState(Revision, Path, Open)` with `Show`, `Back`, `Home`, `Close`; one `Presentation(Sphere,
Side, Main)` published once per app into its own state; one derived scene. The window id is the app
key. The six stores collapse to two, the eighteen entry points to four commands, the per-app layout
code to one publish.

## Secondary sources

### S1. Optimistic concurrency hand-rolled at every call site, in two incompatible styles

- Composition kinds use `long Revision` + expected-revision checks (Surface, Layout, Collection,
  ImageCanvas, Scene, ShellState, Workspace ×4). Leaf kinds use `int Version++` with no check (38 sites).
- 39 `(await x.Read()).Revision` read-then-set sites in `features/`.
- `RetryOnConflictAsync` exists once (`WorkspaceWindows.cs:19-28`) and is used once. The conflict
  exception does not cross the script boundary (it arrives as a 422), so six features re-implement
  retry loops, three by matching message text: `Router/Jev.cs:39-46` (`Contains("Expected revision")`),
  `Engineer.cs:314-321` (`Contains("revision")`), `Assistant.cs:197-208`, `DataVisualizer/Views.cs:122-132`,
  `CustomerResearcher/ActivityProjection.cs:21-24`, `Memory.cs:234`.
- **Simpler shape:** revision guard and idempotent `operationId` live once in the base neuron.
  Workspace commands are push/pop by app key, commutative, so callers never pass a revision. Slot
  neurons are set once at startup; content goes through domain neurons with their own setters.

### S2. 38 UI kinds, each declared in about eight places

- 35 `UIVocabulary` constants, 38 `*Neuron.cs` classes, 33 `*Changed` signals, 26 UiKit DTO files.
- Per kind: contract + state, signal, neuron, vocabulary constant, `UiKitEndpoints` block,
  `AppUiEndpoints` read and event switches, three hand-kept allowlists (`CompositionValidation.cs:11`,
  `AppManifest.cs:51`, Dart `renderer_registry.dart:30-62`), the Dart renderer arm. The Dart list already
  omits `chat` and `composer`; the parity test covers only field kinds.
- About 25 of the 38 are "copy snapshot, set fields, `Version++`, publish changed".
- **Simpler shape:** one generic `Part<T>` neuron (`Set`, `Read`, `PartChanged(kind)`) with a record
  per kind and one schema both validation and Dart read. Bespoke neurons only where there is behavior:
  Chat, Composer, Form, WebBrowser, VoiceInput, Collection.

### S3. The scene graph is drawn by several separate renderers

- `NeuronView` (`ui/lib/src/composition/neuron_view.dart`, 1421 lines): a 22-arm kind switch plus a
  form-field switch, beside a hand-copied `RendererRegistry`. It also still holds `WindowStateView`
  and `FirstRunView`.
- Flame `NodeComponents.create`: a second 10-arm switch.
- Ino's presence drawn twice (`lumen/ino_presence.dart` 203 lines, `flame/prefabs/ino_sphere.dart` 179).
- The brain graph drawn three times (`lumen_brain_graph.dart` 596, `flame/prefabs/brain_graph.dart` 262,
  `components/graph/*` ~594).
- The gallery renders typed `UiPart` models (15 classes, 15 uses) while the product renders raw JSON
  through `NeuronView` (5 uses of `UiPart`): two paths, neither covering the other.
- 50 hand-written Dart model classes mirror C# records; a generated protobuf file exists and is unused.
- **Simpler shape:** spheres and the field are Flame only (delete the lumen copies and `UiGraph` on
  Home); slots are `NeuronView` only; the registry is derived from the switch or deleted; the gallery
  renders through `NeuronView` with fixture JSON.

### S4. Three HTTP edges address the same neurons differently

- `UiKitEndpoints` (283 lines, ~26 GET + 32 POST) under `/brains/{id}/ui/{collection}/{name}` with keys
  rewritten to `{brain}/ui/{name}`, a scope matching neither app keys nor `OwnsUi`. The client's
  `readUi` has **no product caller**; only the `/ui/tables` routes are used by the shell.
- `AppUiEndpoints` (`/apps/node`, `/apps/event`) and `FlameEndpoints` (`/ui/scenes/*`, `/ui/stage/*`).
- Two change streams for related data: `WorkspaceEndpoints.Events` SSE and `LiveSignalEndpoints`; the
  Dart client picks `watchWorkspace` or `watchWorkspaceChannel` by a `grpcLive` flag.
- **Simpler shape:** one node read, one event post, the workspace commands, one scene stream.

## Decision table

| # | Item | Simpler shape | Cost | What it loses | DECISION |
|---|------|---------------|------|---------------|----------|
| 1 | Six "what is shown" stores | `WorkspaceState(Path, Open)` + `Presentation` + derived scene (the spec) | High, it is the redesign | Per-window layout modes (compare/snap/bounds), local-only windows | |
| 2 | `StageNeuron`, `IStage`, `StageKey`, stage routes, `shell/lib/stage/`, `scene_client` stage calls | Delete now; dead in the shell, no C# caller | Low | Nothing in use | |
| 3 | `ShellStateNeuron` + parts + `/shell/state` + `neuron_workspace_persistence.dart` + local projects/conversations/artifacts | Delete with the local store; keep only `WorkspacePreferences` per device | Medium, tied to #1 | A client-side 16 MB cache of what neurons already hold | |
| 4 | `UiKitEndpoints` + 26 DTOs (except `/ui/tables`) | Delete; keep the table routes under `AppUiEndpoints` | Low | A gallery/test edge nobody calls | |
| 5 | Per-app `/main` → `/surface` → `/window` composition, `AppManifest.Entry`, `WorkspaceWindows` | One `Presentation` publish per app | Medium, 12 apps | Multiple windows per app (spec keeps one hosted instance) | |
| 6 | Ino's state machine, presence synapses, copied `Conversation`, scene-parameter history | Blackboard `mood`/`recent` written by the Assistant; tree in the derived scene | Low once #1 lands | Ino's independent timers | |
| 7 | Hand-rolled revision retries, message-text matching | Guard in the base neuron; commutative workspace commands; typed conflict across the script boundary | Medium | Nothing | |
| 8 | 38 UI kinds × 8 declaration sites | Generic `Part<T>` + schema; bespoke only for behaviorful kinds | High, broad | Per-kind endpoints and signals | |
| 9 | Duplicate renderers (lumen presence/graph, `UiGraph`, `UiPart` gallery path) | Flame for spheres, `NeuronView` for slots, gallery through `NeuronView` | Medium | The lumen look, if anyone prefers it | |
| 10 | Two workspace change streams | The scene stream only | Low | The `grpcLive` switch | |

## Recommended order

Items 2 and 4 are safe pre-work: dead code with no product caller, deletable before the redesign
starts and each verifiable with existing tests. Item 1 is the redesign itself and pulls 3, 5, 6 and
10 with it in the delivery order the spec already fixes. Item 7 belongs in the first task of the
redesign (the base-neuron guard), because every later task would otherwise copy the pattern again.
Items 8 and 9 are the follow-up: 9 falls out naturally when Home becomes Flame, 8 is a separate
decision because it touches the contract every app compiles against.

## Honest notes

- Workspace windows, Stage and the shell snapshot are each deliberate: windows came from the desktop
  metaphor, Stage from the Flame plan, the snapshot from the pre-neuron local shell. The complexity is
  three generations of "what is shown" never retired, not sloppiness in any one of them.
- The 38 UI kinds are not wrong individually; the cost is the eight-site declaration, which is what
  makes adding one kind feel heavy and drifts the Dart list.
- Nothing found here is unsound at runtime. The reviewers judged the revision/receipt mechanics
  correct; they are just repeated.
