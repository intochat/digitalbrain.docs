# One workspace, app-owned presentations

Date: 2026-10-12
Status: written spec approved on 2026-10-12; implementation planning in progress.
Scope: presentation discovery and hosting for Ino, Assistant, ordinary apps, and Creator-generated apps. No implementation is included.

This supersedes the top-level Stage ownership and scene-only navigation portions of `2026-10-11-flame-stage-design.md`. Its typed scene boundary and connector rendering remain valid.

## The problem

Several parts of the OS independently decide what the person is looking at. The Flutter client sends `open` and invents an app's `/surface` and `/window`. App behaviors can also open windows. Stage holds another navigation stack and replaces the desktop when it has a home scene. The desktop shows Assistant only when no window is focused. Ino separately observes routes and decides what to dock.

Opening Ino can therefore produce a reference to a surface it never creates. An Assistant answer can exist in neurons while the host hides it. A common root reference alone leaves these competing decisions intact.

The workspace owns visibility and focus. An app owns its work and presentation. The connector draws workspace state and reports input. Running work, composing its presentation, and bringing it into view are separate actions.

## The four words

- **Neuron:** app state holds the presentation root; UI neurons hold its contents; the workspace neuron holds hosting choices.
- **Signal:** typed facts invalidate views and trigger behaviors. Publisher identity remains kernel-stamped.
- **Behavior:** one reaction prepares or rebuilds a presentation from neuron state, or responds to a workspace change.
- **Connector:** Flutter renders known neuron kinds and reports the person's input through edge neurons. Flame rendering is part of this connector implementation.

Presentation is a field containing a neuron reference, not a fifth runtime object. There is no persona service, presentation engine, new UI language, or second program loader.

## Minimal contracts

These sketches specify responsibilities and semantics. Exact declaration placement, serialization attributes, and reuse of existing revision types must be mapped through LSP before implementation. They are not drop-in C#.

### App discovery and readiness

Reuse the existing typed UI child reference shape: a kind and a neuron key. An app publishes its root into its own state rather than relying on a shell naming convention.

```csharp
// Held in AppSnapshot.
record AppPresentation(
    long ProgramRevision,
    long Revision,
    UiChildRef? Root,
    string? Error);

// Added to IApp.
Task SetPresentation(long expectedProgramRevision, UiChildRef root);
```

`ProgramRevision` identifies the installed program assignment, not a publisher's version label. Root publication must be attributable to the executing assignment through host-verified identity; a number supplied by a script is not sufficient authority. Reuse existing execution identity where it proves this property. If it cannot, run-token tightening is a prerequisite requiring an explicit design decision, not a setting-based workaround.

Semantics:

- A null root means the current program has not prepared its presentation. Error state explains a failed preparation; neither state renders as an empty successful app.
- The composing behavior writes its initial UI, then publishes the root. The app validates ownership and rejects stale-program publication.
- Identical publication is idempotent. Changed publication advances the presentation revision. Content updates are watched on the referenced neurons.
- Program replacement invalidates readiness for the prior assignment. Reopening does not erase a valid root merely because the shell remounted.
- Preparation failure is recorded in app state under the same assignment guard. The exact failure mutation must accompany the success mutation in the implementation plan; unrelated progress text is not a readiness protocol.
- App change signals expose readiness and root replacement. Reuse existing signals where their semantics suffice.
- There is one root authority in app state, not another root declaration in the manifest.

For this slice, `open` means idempotently prepare the presentation. It does not select placement, focus the workspace, or rerun business operations. A prepared app can be displayed by reading state alone. Headless apps without a presentation remain inspectable through an explicit generic fallback; they do not receive an invented surface.

One hosted instance per app is sufficient. A scene, surface, layout, or text neuron may be the root. An app need not create a surface wrapper solely to be hosted.

### Workspace hosting

Reshape the existing workspace neuron toward this hosting state; the sketch does not erase unrelated workspace responsibilities such as connected-source state.

```csharp
record WorkspaceState(
    long Revision,
    string HomeApp,
    string? CompanionApp,
    string[] OpenApps,
    string? FocusedApp);

Task Show(string app, string operationId, long expectedRevision);
Task Close(string app, string operationId, long expectedRevision);
Task SetHome(string app, long expectedRevision);
Task SetCompanion(string? app, long expectedRevision);
```

App values are explicit brain-scoped app keys. The workspace stores hosted app identities, not copied roots. Discovery follows the app's current presentation state.

- `Show` records the app as open and focused. A workspace behavior requests preparation when required; a command does not wait for a script result.
- The behavior rebuilds required work from current workspace and app state. At-least-once delivery and reactivation cannot lose a pending preparation or require process-local coordination.
- Operation IDs deduplicate show and close commands through neuron state. A reused ID with different contents is refused. A duplicate applied operation must not restore an old focus or reopen a closed app.
- Closing the focused app returns to Home for this slice. Other open apps remain reachable. A late preparation result cannot reopen an app or change focus.
- Home and Companion are workspace choices. Defaults name Ino and Assistant; rendering does not branch on those app names.
- Hosting changes require workspace authority. Publishing an app root never grants that authority or changes focus.
- Root replacement and app updates are observed while hosted. An unavailable app or invalid root produces an explicit error with a retry or return action.

Persist concrete arrays. Use internal helpers rather than self-calling a non-reentrant grain. Mutation notifications and behavior recovery must preserve the durable-work guarantee; the implementation plan must map the existing delivery mechanism rather than assume a save and a separate publish are atomic.

### Connector boundary

There is one rendering entry point:

```text
Hosted app key -> AppSnapshot.Presentation -> typed neuron reference -> renderer
```

The connector reads complete state, watches typed changes, resynchronizes after interruption, renews observer leases, and closes the snapshot/subscription gap. Input goes through the addressed edge neuron; the renderer cannot publish as the person or another app.

`ISurface` retains control/document composition. `IScene` retains scene semantics. Stage must cease to be a competing top-level host. Scene-stack functionality can remain internal to an app where required; workspace placement and focus have one authority.

New domain neurons render without shell changes by composing supported kinds. New native drawing primitives still require connector support. Unsupported kinds show an explicit fallback. Flame frame loops and GPU resources are disposable; semantic scene state lives in neurons.

Initial root publication establishes readiness, not a distributed transaction across children. Ordinary child states may update independently. An experience requiring a whole-tree atomic switch uses generation-specific children and a final root switch; that machinery is not required of every app.

## User flow

Default workspace: Home is Ino, Companion is Assistant, no focused work.

On a wide display, Ino's scene occupies the main area and Assistant's conversation and composer occupy the companion area. Opening an ordinary app replaces the main area's content with its published root. Assistant remains present. Closing the app returns to Ino.

On a narrow display, the companion collapses into an explicit conversation control with unread state. An answer remains directly reachable while another app has focus. Focusing Assistant expands the same conversation in the main area and suppresses duplicate companion rendering. This comparison uses hosted app identity, not an Assistant-specific branch.

Ino remains Home rather than permanently consuming screen space beside every app. Continuous sphere visibility would be a later explicit composition choice.

Example: the person asks Assistant to create a reading tracker. Assistant shows Creator's progress. Creator produces behaviors that populate the tracker neurons and publish its root. The result identifies the tracker app. Opening that result changes workspace focus; it does not manufacture a surface address. The explanation stays in the companion conversation.

## Creator uses the same path

The existing Creator Author writes a spec and manifest. Builder receives them, existing files, and the sandbox's authoring instructions. It discovers neuron interfaces and signals through `search_contracts` and `read_contracts`, then generates behaviors and calls `check_csharp`. Discovery is grounded in the brain's kernel type catalog. Flutter exposes its contracts assembly; Creator does not inspect Flutter widgets.

The gap is that Author defaults to `ask`, Builder has only a general instruction to compose UI, and the sandbox example writes `/answer` without making it discoverable. Compilation validates the code but does not prove that opening the app reveals its result.

Creator's presentation obligation becomes:

> After this behavior runs, which neuron holds the result, and how does the person reach it from the app's published root?

Author records this visible outcome in the spec. Builder uses installed contracts to generate domain behaviors, presentation rebuild behaviors, and an idempotent `open` reaction that prepares and publishes the root. Each behavior remains one reaction over one source. A word counter can expose an `IText`; a tracker can expose a layout or surface; Ino exposes a scene.

Creator does not create workspace windows, invent root addresses for the host, or choose placement. First-party and generated apps follow the same contract. Compilation remains the publish gate. Publish, Marketplace, Install, and FeatureLoader remain the program-sharing path. No model is introduced into presentation rendering.

## What this replaces

The implementation is not complete while these paths still independently control hosting:

1. Client-generated `/surface` and `/window` results after `open`.
2. App behaviors choosing their own window placement as part of presentation preparation.
3. StageHost selecting between Stage and desktop as rival top-level experiences.
4. Ino independently interpreting routes to dock other apps.
5. Assistant rendered only as the desktop's empty state.

Existing table/data entry points must map to the same workspace authority, without retaining a parallel focus owner. General multi-document hosting is outside the first slice; the implementation plan must identify existing callers before changing their contracts.

## Pressure test

1. **Does a root reference alone fix this?** No. It removes guessing; sole workspace ownership removes competing navigation decisions.
2. **Is a persona a fifth object?** No. It is app state plus behaviors and referenced UI neurons. A separate autonomous persona service is outside this design.
3. **Does opening execute business work?** Only idempotent preparation is requested. Rendering and remounting do not rerun business operations.
4. **Can completion steal focus?** No. Root publication and attention are separate from authorized hosting commands.
5. **Can delayed old code announce readiness?** No. Assignment identity must be host-verified. If current identity cannot enforce this, resolve that prerequisite before implementation.
6. **Can valid empty UI be distinguished from unprepared UI?** Yes. Root publication marks readiness; child contents may legitimately be empty.
7. **Must Ino and Assistant merge?** No. Presence/activity and conversation can be composed without coupling lifecycles. Workspace owns their placement.
8. **Can every new render kind appear without updating Flutter?** No. Composition of known kinds can; a new native primitive needs connector support.
9. **Does compilation prove visibility?** No. Running the open path and inspecting the hosted root proves the experience.
10. **Does this implement Circle replay?** No. Hosting is the prerequisite slice. Captured editions, deterministic playback, attribution evidence, and replay authority remain a separate design.

## First vertical slice and acceptance

Host Ino, Assistant, and one Creator-generated text-only app through the same workspace path. The generated app deliberately has no surface wrapper, proving that the host follows the published root.

Acceptance scenarios:

- Open Ino: its scene root appears; no nonexistent surface window is created.
- Open the generated app: its text root appears while Assistant remains visible or directly reachable on narrow layouts.
- Complete an Assistant response with another app focused: the conversation retains the answer and its unread state is exposed when collapsed.
- Focus the companion app: the same conversation expands without a duplicate companion instance.
- Close an app while preparation is pending: completion does not reopen or refocus it.
- Redeliver Show and Close after focus changes: previous operations cannot undo newer navigation.
- Reactivate app and workspace grains and restart script caches: durable choices recover without duplicate effects.
- Replace a program: old readiness is invalidated, and publication from the superseded assignment is refused.
- Fail preparation or use an unsupported root kind: the host shows a meaningful state rather than an empty successful window.

Implementation verification follows CLAUDE.md: map symbols with C# and Dart LSP, obtain clean diagnostics, build affected projects, run module unit/E2E checks and Flutter checks, then launch `dotnet run digitalbrain.cs`. Confirm Aspire resources are Healthy, drive the actual edge neurons through digitalbrain-mcp, read app/root/workspace state, and confirm the expected path and retries in traces/logs. Do not add per-app tests or substitute compilation for seeing the experience running.

## Scope boundaries

This spec approves one workspace authority, runtime root publication, and a shared Creator/first-party hosting flow. It does not settle universal per-neuron personas, arbitrary 3D primitives, multiple document instances, replay capture, or cross-brain execution. Cross-app subscription scope and execution identity must use existing enforced boundaries; insufficient boundaries are explicit prerequisites, not permission to invent a fifth concept.

The contract sketches require an implementation plan after written-spec review. Product code has not been changed or runtime-verified by this design work.
