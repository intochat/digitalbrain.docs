# Flame stage: scenes as edge neurons

Status: design, approved in conversation 2026-10-11. Next step: `superpowers:writing-plans`.

## Intent

A person opening digitalbrain.tech sees a running app, not a form. Ino, the assistant, is a living
sphere that shows what the brain is doing and offers sign-in. The interface is organized as scenes;
Escape always returns Home. A 3D-looking brain view shows live activity and lets the person drill
into a running synapse down to its telemetry. All of it is driven from C# synapses, through neurons,
over the connector the shell already has. Apps keep generating their own UI through the existing
widget vocabulary; the two never collide.

This follows the OS's own rule: UI is not a layer. A scene is an edge neuron whose external system
is a person, exactly as a button is.

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | Flame owns the stage; the widget tree owns app content. OS-owned scenes (Welcome, Home, Brain, App dock, Circle) render in Flame; an app's surface is overlaid inside the App scene as today's widget tree. | A game canvas is weak at text editing, scrolling and accessibility; the 34 widget types keep working unchanged. |
| D2 | A separate module, `DigitalBrain.Modules.Flame`, not the Flutter module. | The Flutter module is the connector to the human and the only owner of gRPC and widgets. Scripts reference only Flame contracts. |
| D3 | Scripts program a declarative scene graph; hand-built Flame pieces that must look amazing are prefab node types with named parameters. Scripts never ship Dart. | The web shell cannot compile Dart at runtime; a scene stays data a kernel can store, replay and share. |
| D4 | Two contracts: `IScene` (a renderable scene with a state machine) and `IStage` (the per-shell scene stack). | Navigation and content are different lifetimes: a scene is an app's, the stack is the person's session. |
| D5 | Ino's presence is a scene, not a neuron of its own. Assistant synapses `Fire("thinking")` etc. | One mechanism; the mode lives in neuron state, so a reconnecting shell shows the right state. |
| D6 | The brain view reads a kernel projection (every neuron, every signal, with a filter), not app-level runs only. | "See the brain think" needs signals that reached no subscriber and the kernel's own neurons. This is the one kernel seam; it lands last. |
| D7 | Work starts now on its own branch from master, in a worktree; the brain-view kernel seam waits for the brain-as-data complexity review. | The user chose to start with the neuron. The release branch is under final review and is not touched. |

## Module shape

```
src/DigitalBrain.Modules/Flame/
  DigitalBrain.Modules.Flame.Contracts/        IScene, IStage, records, signals; references DigitalBrain only
  DigitalBrain.Modules.Flame/                  FlameModule : Module, SceneNeuron, StageNeuron, SceneValidation
  tests/DigitalBrain.Modules.Flame.Tests/      facts over real grains via TestBrain.Create().WithModule<FlameModule>()
src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/flame/
  renderer: one child type "scene" in the shell's child renderer, a FlameGame per mounted scene
  prefabs: ino_sphere, brain_graph, activity_ring, particle_field
  stage: the scene-stack view, transitions, Escape handling
features/os/Ino/                               the Ino app: Welcome and Home scenes, presence synapses
features/os/BrainView/                         the brain-view app (after the kernel seam)
```

The Flutter module gains a `UIVocabulary.SceneType = "scene"` child type and a renderer for it. It
learns nothing else about Flame; the renderer reads `IScene` state like it reads `IChart` state.
`OsCatalog` composes `FlameModule`. The Architecture suite gets one fact: Flame contracts reference
only `DigitalBrain`; the Flutter module references Flame contracts, never the reverse.

## Contracts

```csharp
namespace DigitalBrain.Flame;

// Key: {brainScope}/apps/{app}/scenes/{name}. One scene, rebuilt by its app from scratch, never patched.
[Alias("scene"), DefaultGrainType(UIVocabulary.SceneType)]
public interface IScene : INeuron
{
    Task Set(SceneDefinition definition, long expectedRevision);   // whole graph; stale revision refused
    Task Fire(string eventName, string? nodeId = null);            // drives state machines; from scripts or the shell
    [ReadOnly] Task<SceneState> Read();
}

public sealed record SceneDefinition(SceneNode[] Nodes, StateMachine[] Machines, SceneCamera Camera, string Background);
public sealed record SceneNode(string Id, string Type, Transform Transform, string? Style, Dictionary<string, string> Parameters,
    SceneNode[] Children, Tween[] Tweens, string[] Inputs);          // Inputs: which gestures this node reports (tap, drag, hover)
public sealed record StateMachine(string Id, string Initial, StateDef[] States, Transition[] Transitions);
public sealed record StateDef(string Name, NodePatch[] Apply);        // what the state sets on nodes (style, params, tween)
public sealed record Transition(string From, string Event, string To);
public sealed class SceneState { string Name; long Revision; SceneDefinition Definition; Dictionary<string,string> Current; }  // machine id → state

// Signals
public sealed record SceneChanged(string Name, long Revision) : Signal;
public sealed record SceneInput(string Scene, string NodeId, string Kind, double X, double Y, string? Payload) : Signal;   // the Clicked of this world
public sealed record SceneEntered(string Scene, string Machine, string State) : Signal;   // a machine changed state

// Key: the shell's per-person scope, same as the workspace neuron. One stack per session.
[Alias("stage"), DefaultGrainType("stage")]
public interface IStage : INeuron
{
    Task Go(string sceneKey, string? dockSurfaceKey = null);  // push; dockSurfaceKey makes it an App scene with a widget overlay
    Task Back();
    Task Home();
    [ReadOnly] Task<StageState> Read();
}
public sealed class StageState { string Home; StageEntry[] Stack; long Revision; }
public sealed record StageEntry(string SceneKey, string? DockSurfaceKey);
public sealed record StageChanged(string Stage, long Revision, string Top) : Signal;
```

Node types in the first release: `circle`, `rect`, `text`, `sprite`, `path`, `particles`, `group`,
and the prefabs `ino_sphere`, `brain_graph`, `activity_ring`. The shell ignores a type it does not
know and renders a placeholder, so a newer scene never breaks an older shell. Grain state uses
concrete arrays (hazard: collection-expression wrappers do not round-trip).

Validation at `Set`: unique node ids, every transition names existing states and events, every
machine's initial state exists, at most 4096 nodes, parameters at most 64 KiB in total. A refused
`Set` fails the write and the app's status line says why, as today's surfaces do.

Access: a scene admits writes from its own app (the kernel-stamped caller's app) and reads from the
shell; `Fire` admits the shell (person input) and the owning app. The stage is the person's: the
same owner rule as `IShellState` (brain, account, principal digest).

## Scenes and the user experience

- **Welcome** (no brain yet): the shell renders a built-in Ino sphere from the connector alone and
  offers Google sign-in or registration. Once a brain exists, the Ino app's Welcome scene replaces it.
- **Home**: Ino centered, composer beneath, the activity ring around it fed by signals that already
  exist (Routed, TurnStarted, BehaviorRan, CandidateChanged) through Ino app synapses. Escape from
  anywhere pops the stack to Home; the shell calls `IStage.Home()`.
- **App**: `Go(sceneKey, dockSurfaceKey)`. Ino shrinks to an orb at the edge; the app's surface is
  the ordinary widget tree in an overlay region. Clicking inside it is still `ButtonClicked`.
- **Brain**: the brain-view app's scene, `brain_graph` prefab bound to the kernel activity projection.
  Selecting a node fires `SceneInput`; the app's synapse opens the synapse panel with runs and the
  trace id; Escape pops.
- **Circle**: a stack entry for the circle room; the social surface is a separate design.

"Ino, show me my files in Downloads": composer → router → Files app composes its surface as today →
one Assistant synapse sees the `AppRequested` it dispatched and calls `IStage.Go(inoHome, filesSurface)`
→ the shell animates. Files knows nothing about the stage.

## Data flow

Scripts write scenes and fire events; the shell watches `SceneChanged`, `SceneEntered` and
`StageChanged` through the existing watch stream and reads the neuron; the person's gestures come
back as `SceneInput`, which synapses subscribe to with `brain.On<SceneInput>(scene)`. State machine
transitions are applied in the neuron (so `Current` is state, replayable), and the shell animates
the resulting node patches. Tweens are declared, run client-side, and never reported back.

## Brain view data (D6, lands last)

A kernel projection, `IBrainActivity` keyed per brain, holding a bounded ring (4096) of events:
source neuron, signal type, subscription hit (or none), behavior run, duration, trace id. It is
filled where the kernel already traces every signal (compute-in-the-kernel). The brain-view app
rebuilds its `brain_graph` scene from it on `ActivityChanged`, with a filter (apps only / everything).
Its exact seam is decided after the brain-as-data complexity review; until then the brain view
ships from `BehaviorRan` only, labeled as such.

## Error handling

- Stale `Set` revision: refused, the app's compose loop re-reads and retries once (today's pattern).
- Unknown node type or prefab in the shell: placeholder, a warning in the shell log, never a crash.
- A scene larger than the limits: refused at `Set`.
- Stage pointing at a scene that no longer exists: the shell renders Home and the stage drops the entry on the next `Read`.
- Reconnect: the shell reads stage and scenes and redraws; nothing is in process memory.

## Testing

- Module facts over real grains: `Set` round-trips arrays after reactivation; stale revision refused;
  `Fire` moves the machine and publishes `SceneEntered`; `SceneInput` reaches a subscribing script
  (`FakeSandbox`); stage push/pop/home; owner rule on the stage; limits enforced.
- Architecture fact: ring boundaries for the Flame module.
- Flutter: `flutter test` for the renderer mapping (definition → component tree, unknown type →
  placeholder, state patch → animation target); `flutter analyze` clean.
- Live (the real verification): Ino app installed as an OS default; through `digitalbrain-mcp`,
  `neurons_get` the Welcome and Home scenes, `Fire("thinking")` and see `SceneEntered` in traces;
  `IStage.Go` with the Files surface and see the shell's stage neuron change; Escape → Home.

## Out of scope here

Circles as a social surface (discussions, votes, comments), payments, the mesh. Each is its own spec.

## Open questions for the plan

1. Where the shell's child renderer registry lives on the Dart side, so `scene` plugs in next to `chart`.
2. Whether the web build can keep 60 fps with one FlameGame per docked scene or needs one game with layers.
3. The `IBrainActivity` seam, after the complexity review.
