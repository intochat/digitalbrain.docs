# Flame Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scenes become edge neurons a C# synapse writes and the Flutter shell renders with Flame: a scene stack per person (Escape → Home), Ino as a living scene, apps docked beside it, and a brain view that reads the brain's own activity.

**Architecture:** A new `DigitalBrain.Modules.Flame` module ships two contracts, `IScene` (a declarative scene graph with state machines) and `IStage` (the per-person scene stack), their neurons and UiKit-style HTTP endpoints. The Flutter shell gains one renderer for the child type `scene` (a `FlameGame` per mounted scene), prefab components for the pieces that must look amazing (`ino_sphere`, `activity_ring`, `brain_graph`), and a stage view that renders the stack and overlays an app's widget surface inside the App scene. Two first-party apps under `features/os/` (Ino, BrainView) drive it from synapses. Apps never render into Flame; only OS-owned scenes do.

**Tech Stack:** .NET 11 RC / Orleans (grains, `Neuron<TState>`), ASP.NET minimal endpoints (`UiHttp`), xunit facts over `TestBrain`, Flutter + Flame (`digitalbrain_ui`, `digitalbrain_flutter` packages), Roslyn-checked C# synapses under `features/os`.

**Spec:** `docs/superpowers/specs/2026-10-11-flame-stage-design.md`

## Global Constraints

- Branch: new branch from `master` in its own worktree (spec D7). The `os-runtime` branch is not touched.
- Module layout follows `src/DigitalBrain.Modules/<Vendor>/<Module>/`: the Flame module lives at `src/DigitalBrain.Modules/DigitalBrain/Flame/` (vendor `DigitalBrain`, like Circles and Apps). The spec's shorter path is realized this way; `RepositoryLayoutFacts` pins the vendor layout.
- Contracts project references only `DigitalBrain` (ring rule); the module references `DigitalBrain.Framework`; the Flutter module may reference Flame contracts, never the reverse.
- Grain state holds concrete arrays (`SceneNode[]`, `StageEntry[]`), never `IReadOnlyList`/collection-expression wrappers.
- Scene limits at `Set`: unique node ids; ≤ 4096 nodes; parameters ≤ 64 KiB total; every transition names existing states and events; every machine's initial state exists.
- Scene key grammar: `{brainScope}/apps/{app}/scenes/{name}`; stage key: the shell's per-person scope (same digest as `IShellState`).
- Node types v1: `circle`, `rect`, `text`, `sprite`, `path`, `particles`, `group`, `ino_sphere`, `brain_graph`, `activity_ring`. Unknown type → placeholder, never a crash.
- Access: a scene admits `Set` from its own app (kernel-stamped `CallerContext.AppId` equals the app in the key) or from a `Platform`/`User` caller of the same brain; `Fire` and `Report` admit the shell (`User` kind, same brain) and the owning app. The stage admits only the person whose scope is its key (same rule as `ShellStateNeuron.RequireOwner`).
- Build and test per project, never the `.slnx`. Warnings are errors; nullable on; no `/// <summary>`.
- Tests are facts with sentence names and `TestContext.Current.CancellationToken`; real grains via `TestBrain.Create().WithModule<FlameModule>()`.
- Flutter: `flutter analyze` and `flutter test` clean in `src/DigitalBrain.Modules/Google/Flutter/app/ui` and `.../app/shell`. A C# record wire-shape change updates the Dart mirror in the same task.
- Commits: explicit file paths only; subject style `Area: sentence of what is now true`; end with the attribution line the session gives.
- Done means seen running (Task 11): Aspire resources Healthy, driven through `digitalbrain-mcp`, confirmed in traces and logs.

## Review Focus

1. A `Set` whose transition names a state that does not exist must be refused before any state is written, and the previous definition must still read back unchanged. (Task 2 test `ASetWithAnUnknownTransitionStateIsRefusedAndThePreviousDefinitionStands`.)
2. `Fire` with an event no transition listens to in the current state must be a no-op that publishes nothing, not an error that breaks the shell's input loop. (Task 3 test `AnEventNoTransitionListensToChangesNothingAndPublishesNothing`.)
3. A person's stage must never be readable or movable by another person's session in the same brain. (Task 4 test `AnotherPersonsSessionIsRefusedTheStage`.)
4. The shell must render an older scene with a node type it does not know as a placeholder, and keep rendering the rest of the scene. (Task 6 test `an unknown node type renders a placeholder and the siblings`.)
5. `Back` on a stack holding only Home must stay on Home and publish nothing, so an extra Escape never blanks the screen. (Task 4 test `BackOnHomeStaysOnHomeAndPublishesNothing`.)

---

### Task 1: Flame contracts project

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/DigitalBrain.Modules.Flame.Contracts.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/FlameVocabulary.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Scene/IScene.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Scene/SceneDefinition.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Scene/Signals/SceneSignals.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Stage/IStage.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/Stage/Signals/StageChanged.cs`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/RepositoryLayoutFacts.cs` only if its project list is explicit (read it first; `Repository.cs` discovers `DigitalBrain.Modules.*` projects by name, so likely nothing to add)

**Interfaces:**
- Produces (everything below is consumed by Tasks 2–10 verbatim):

```csharp
namespace DigitalBrain.Flame;

public static class FlameVocabulary
{
    public const string SceneType = "scene";
    public const string StageType = "stage";
    public const int MaxNodes = 4096;
    public const int MaxParameterBytes = 64 * 1024;
    public static readonly string[] NodeTypes =
        ["circle", "rect", "text", "sprite", "path", "particles", "group", "ino_sphere", "brain_graph", "activity_ring"];
}
```

```csharp
namespace DigitalBrain.Flame.Scene;

[Alias("scene"), Orleans.Metadata.DefaultGrainType(FlameVocabulary.SceneType)]
public interface IScene : INeuron
{
    static string Key(string brainScope, string app, string name) => brainScope + "/apps/" + app + "/scenes/" + name;
    Task Set(SceneDefinition definition, long expectedRevision);
    Task Fire(string eventName, string? nodeId = null);
    // The shell reports a person's gesture on a node; the neuron publishes it as SceneInput.
    Task Report(string nodeId, string kind, double x, double y, string? payload);
    [ReadOnly] Task<SceneState> Read();
}

[GenerateSerializer, Alias("flame.transform")]
public sealed record Transform([property: Id(0)] double X = 0, [property: Id(1)] double Y = 0, [property: Id(2)] double Z = 0,
    [property: Id(3)] double Scale = 1, [property: Id(4)] double Rotation = 0, [property: Id(5)] double Opacity = 1);

[GenerateSerializer, Alias("flame.tween")]
public sealed record Tween([property: Id(0)] string Property, [property: Id(1)] double From, [property: Id(2)] double To,
    [property: Id(3)] int Milliseconds, [property: Id(4)] string Curve = "easeInOut", [property: Id(5)] bool Repeat = false);

[GenerateSerializer, Alias("flame.node")]
public sealed record SceneNode([property: Id(0)] string Id, [property: Id(1)] string Type, [property: Id(2)] Transform Transform,
    [property: Id(3)] string? Style, [property: Id(4)] Dictionary<string, string> Parameters, [property: Id(5)] SceneNode[] Children,
    [property: Id(6)] Tween[] Tweens, [property: Id(7)] string[] Inputs);

[GenerateSerializer, Alias("flame.node-patch")]
public sealed record NodePatch([property: Id(0)] string NodeId, [property: Id(1)] string? Style, [property: Id(2)] Dictionary<string, string>? Parameters,
    [property: Id(3)] Transform? Transform, [property: Id(4)] Tween[]? Tweens);

[GenerateSerializer, Alias("flame.state")]
public sealed record StateDef([property: Id(0)] string Name, [property: Id(1)] NodePatch[] Apply);

[GenerateSerializer, Alias("flame.transition")]
public sealed record Transition([property: Id(0)] string From, [property: Id(1)] string Event, [property: Id(2)] string To);

[GenerateSerializer, Alias("flame.machine")]
public sealed record StateMachine([property: Id(0)] string Id, [property: Id(1)] string Initial, [property: Id(2)] StateDef[] States, [property: Id(3)] Transition[] Transitions);

[GenerateSerializer, Alias("flame.camera")]
public sealed record SceneCamera([property: Id(0)] double X = 0, [property: Id(1)] double Y = 0, [property: Id(2)] double Zoom = 1);

[GenerateSerializer, Alias("flame.scene-definition")]
public sealed record SceneDefinition([property: Id(0)] SceneNode[] Nodes, [property: Id(1)] StateMachine[] Machines,
    [property: Id(2)] SceneCamera Camera, [property: Id(3)] string Background = "#0B0F14");

[GenerateSerializer, Alias("flame.scene-state")]
public sealed class SceneState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public long Revision { get; set; }
    [Id(2)] public SceneDefinition Definition { get; set; } = new([], [], new());
    [Id(3)] public Dictionary<string, string> Current { get; set; } = [];   // machine id → current state
}
```

```csharp
namespace DigitalBrain.Flame.Scene.Signals;

[GenerateSerializer, Alias("flame.scene-changed")]
public sealed record SceneChanged([property: Id(0)] string Name, [property: Id(1)] long Revision) : Signal;

[GenerateSerializer, Alias("flame.scene-entered")]
public sealed record SceneEntered([property: Id(0)] string Name, [property: Id(1)] string Machine, [property: Id(2)] string State) : Signal;

[GenerateSerializer, Alias("flame.scene-input")]
public sealed record SceneInput([property: Id(0)] string Name, [property: Id(1)] string NodeId, [property: Id(2)] string Kind,
    [property: Id(3)] double X, [property: Id(4)] double Y, [property: Id(5)] string? Payload) : Signal;
```

```csharp
namespace DigitalBrain.Flame.Stage;

[Alias("stage"), Orleans.Metadata.DefaultGrainType(FlameVocabulary.StageType)]
public interface IStage : INeuron
{
    Task Go(string sceneKey, string? dockSurfaceKey = null);
    Task Back();
    Task Home();
    Task SetHome(string sceneKey);
    [ReadOnly] Task<StageState> Read();
}

[GenerateSerializer, Alias("flame.stage-entry")]
public sealed record StageEntry([property: Id(0)] string SceneKey, [property: Id(1)] string? DockSurfaceKey);

[GenerateSerializer, Alias("flame.stage-state")]
public sealed class StageState
{
    [Id(0)] public string Name { get; set; } = "";
    [Id(1)] public long Revision { get; set; }
    [Id(2)] public string Home { get; set; } = "";
    [Id(3)] public StageEntry[] Stack { get; set; } = [];
}
```

```csharp
namespace DigitalBrain.Flame.Stage.Signals;

[GenerateSerializer, Alias("flame.stage-changed")]
public sealed record StageChanged([property: Id(0)] string Name, [property: Id(1)] long Revision, [property: Id(2)] string Top) : Signal;
```

- [ ] **Step 1: Create the contracts project**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Flame module contracts: scenes and the stage, edge neurons a Flame renderer draws.</Description>
    <RootNamespace>DigitalBrain.Modules.Flame.Contracts</RootNamespace>
    <NoWarn>$(NoWarn);CS1591</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../../../../DigitalBrain/DigitalBrain.csproj" />
  </ItemGroup>
  <ItemGroup><PackageReference Include="Microsoft.Orleans.Sdk" PrivateAssets="all" /></ItemGroup>
</Project>
```

Then write the six source files with the code in **Interfaces** above (one file each: `FlameVocabulary.cs`, `Scene/IScene.cs` holding `IScene`, `Scene/SceneDefinition.cs` holding the records and `SceneState`, `Scene/Signals/SceneSignals.cs`, `Stage/IStage.cs` holding `IStage`, `StageEntry`, `StageState`, `Stage/Signals/StageChanged.cs`). Each file starts with `using DigitalBrain;` and, where `[ReadOnly]` appears, `using Orleans.Concurrency;`.

- [ ] **Step 2: Build**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts/DigitalBrain.Modules.Flame.Contracts.csproj`
Expected: 0 warnings, 0 errors.

- [ ] **Step 3: Run the Architecture suite's vocabulary and layout facts**

Run: `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"` and `-- --filter-class "*RepositoryLayoutFacts*"`
Expected: `VocabularyRingFacts` green (the new Contracts assembly joins the ring automatically). `RepositoryLayoutFacts` has one known pre-existing failure (Roslyn entries); no new failure naming Flame. If a Flame project is reported, fix the project path, not the fact.

- [ ] **Step 4: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame.Contracts
git commit -m "Flame: scene and stage contracts — a scene is an edge neuron a Flame renderer draws"
```

---

### Task 2: FlameModule and SceneNeuron.Set/Read with validation

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/DigitalBrain.Modules.Flame.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameModule.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Scene/SceneNeuron.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Scene/SceneValidation.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/DigitalBrain.Modules.Flame.Tests.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scene/SceneSetFacts.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scenes.cs` (test scene builders)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:41` (add `new DigitalBrain.Flame.FlameModule(),` after Circles)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` (project reference to the Flame module)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs` (the module list fact, if it enumerates module ids: add `flame`)

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces: `FlameModule : Module, IHttpModule` (id `flame`; `Configure(IEndpointRouteBuilder)` is empty until Task 5); `SceneNeuron` grain type `scene`; `SceneValidation.Check(SceneDefinition)` throwing `ArgumentException` with the reason.

- [ ] **Step 1: Write the failing facts**

`Scenes.cs`:

```csharp
using DigitalBrain.Flame.Scene;

namespace DigitalBrain.Modules.Flame.Tests;

internal static class Scenes
{
    public static SceneNode Node(string id, string type = "circle", params SceneNode[] children)
        => new(id, type, new Transform(), null, [], children, [], []);

    public static StateMachine Machine(string id, string initial, string[] states, params Transition[] transitions)
        => new(id, initial, [.. states.Select(s => new StateDef(s, []))], transitions);

    public static SceneDefinition Ino() => new(
        [Node("sphere", "ino_sphere")],
        [Machine("presence", "idle", ["idle", "thinking", "speaking"],
            new("idle", "think", "thinking"), new("thinking", "speak", "speaking"), new("speaking", "rest", "idle"), new("thinking", "rest", "idle"))],
        new SceneCamera());
}
```

`Scene/SceneSetFacts.cs`:

```csharp
using DigitalBrain.Flame;
using DigitalBrain.Flame.Scene;
using DigitalBrain.Flame.Scene.Signals;
using Xunit;

namespace DigitalBrain.Modules.Flame.Tests.Scene;

public sealed class SceneSetFacts
{
    private const string Key = "owner/apps/ino/scenes/home";

    [Fact]
    public async Task SetPublishesChangedAndReadReturnsTheWholeGraphWithInitialStates()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await using var changes = await brain.Observe<SceneChanged>(scene, ct);
        await scene.Set(Scenes.Ino(), 0);
        var changed = await changes.NextAsync(ct: ct);
        Assert.Equal(Key, changed.Name);
        Assert.Equal(1, changed.Revision);
        var state = await scene.Read();
        Assert.Equal("ino_sphere", state.Definition.Nodes[0].Type);
        Assert.Equal("idle", state.Current["presence"]);
    }

    [Fact]
    public async Task AStaleRevisionIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await Assert.ThrowsAsync<InvalidOperationException>(() => scene.Set(Scenes.Ino(), 0));
        Assert.Equal(1, (await scene.Read()).Revision);
    }

    [Fact]
    public async Task ASetWithAnUnknownTransitionStateIsRefusedAndThePreviousDefinitionStands()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        var broken = new SceneDefinition([Scenes.Node("a")],
            [Scenes.Machine("m", "idle", ["idle"], new("idle", "go", "nowhere"))], new SceneCamera());
        var error = await Assert.ThrowsAsync<ArgumentException>(() => scene.Set(broken, 1));
        Assert.Contains("nowhere", error.Message);
        var state = await scene.Read();
        Assert.Equal(1, state.Revision);
        Assert.Equal("sphere", state.Definition.Nodes[0].Id);
    }

    [Fact]
    public async Task DuplicateNodeIdsAnUnknownInitialStateAndTooManyNodesAreRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await Assert.ThrowsAsync<ArgumentException>(() => scene.Set(new([Scenes.Node("a"), Scenes.Node("a")], [], new()), 0));
        await Assert.ThrowsAsync<ArgumentException>(() => scene.Set(new([Scenes.Node("a")], [Scenes.Machine("m", "gone", ["idle"])], new()), 0));
        var many = Enumerable.Range(0, FlameVocabulary.MaxNodes + 1).Select(i => Scenes.Node("n" + i)).ToArray();
        await Assert.ThrowsAsync<ArgumentException>(() => scene.Set(new(many, [], new()), 0));
    }

    [Fact]
    public async Task AnUnknownNodeTypeIsAcceptedSoAnOlderShellCanStillShowAPlaceholder()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(new([Scenes.Node("x", "hologram")], [], new()), 0);
        Assert.Equal("hologram", (await scene.Read()).Definition.Nodes[0].Type);
    }

    [Fact]
    public async Task TheGraphSurvivesReactivation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await brain.Deactivate(scene, ct);
        var state = await scene.Read();
        Assert.Single(state.Definition.Nodes);
        Assert.Equal(4, state.Definition.Machines[0].Transitions.Length);
    }
}
```

If `TestBrain` has no `Deactivate`, use the same reactivation helper the Flutter module's `SurfacePreservesOrderedChildrenAndRejectsStaleWritesAfterReactivation` fact uses (read that fact in `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Composition/`), and keep the fact's assertions.

Tests csproj:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <Using Include="DigitalBrain.Testing" />
    <ProjectReference Include="../../../../../Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.Flame/DigitalBrain.Modules.Flame.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests`
Expected: build failure, `FlameModule` not found.

- [ ] **Step 3: Implement the module and neuron**

Module csproj:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Flame module: scene and stage neurons the Flutter shell renders with Flame.</Description>
    <RootNamespace>DigitalBrain.Modules.Flame</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../DigitalBrain.Modules.Flame.Contracts/DigitalBrain.Modules.Flame.Contracts.csproj" />
    <ProjectReference Include="../../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <InternalsVisibleTo Include="DigitalBrain.Modules.Flame.Tests" />
  </ItemGroup>
</Project>
```

`FlameModule.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Modules;
using Microsoft.AspNetCore.Routing;
using Orleans.Hosting;

namespace DigitalBrain.Flame;

// Flame: scenes are edge neurons whose external system is a person; the Flutter shell draws them with Flame.
// Apps write scenes and fire events; the shell reports gestures; the stage is the person's scene stack.
public sealed class FlameModule() : Module(new ModuleId("flame")), IHttpModule
{
    public override System.Reflection.Assembly? Contracts => typeof(Scene.IScene).Assembly;

    public override void Configure(ISiloBuilder silo) => ArgumentNullException.ThrowIfNull(silo);

    public void Configure(IEndpointRouteBuilder endpoints) => ArgumentNullException.ThrowIfNull(endpoints);
}
```

`Scene/SceneValidation.cs`:

```csharp
using System.Text;
using DigitalBrain.Flame.Scene;

namespace DigitalBrain.Flame;

internal static class SceneValidation
{
    public static void Check(SceneDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(definition);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var count = 0;
        var bytes = 0L;
        void Walk(SceneNode node)
        {
            if (string.IsNullOrWhiteSpace(node.Id)) { throw new ArgumentException("Every node needs an id."); }
            if (!ids.Add(node.Id)) { throw new ArgumentException($"Node id '{node.Id}' appears twice."); }
            if (++count > FlameVocabulary.MaxNodes) { throw new ArgumentException($"A scene holds at most {FlameVocabulary.MaxNodes} nodes."); }
            foreach (var (k, v) in node.Parameters) { bytes += Encoding.UTF8.GetByteCount(k) + Encoding.UTF8.GetByteCount(v); }
            if (bytes > FlameVocabulary.MaxParameterBytes) { throw new ArgumentException($"Scene parameters exceed {FlameVocabulary.MaxParameterBytes} bytes."); }
            foreach (var child in node.Children) { Walk(child); }
        }
        foreach (var node in definition.Nodes) { Walk(node); }
        var machines = new HashSet<string>(StringComparer.Ordinal);
        foreach (var machine in definition.Machines)
        {
            if (!machines.Add(machine.Id)) { throw new ArgumentException($"Machine id '{machine.Id}' appears twice."); }
            var states = machine.States.Select(s => s.Name).ToHashSet(StringComparer.Ordinal);
            if (!states.Contains(machine.Initial)) { throw new ArgumentException($"Machine '{machine.Id}' starts in unknown state '{machine.Initial}'."); }
            foreach (var t in machine.Transitions)
            {
                if (!states.Contains(t.From)) { throw new ArgumentException($"Machine '{machine.Id}' transitions from unknown state '{t.From}'."); }
                if (!states.Contains(t.To)) { throw new ArgumentException($"Machine '{machine.Id}' transitions to unknown state '{t.To}'."); }
                if (string.IsNullOrWhiteSpace(t.Event)) { throw new ArgumentException($"Machine '{machine.Id}' has a transition without an event."); }
            }
            foreach (var patch in machine.States.SelectMany(s => s.Apply))
            {
                if (!ids.Contains(patch.NodeId)) { throw new ArgumentException($"Machine '{machine.Id}' patches unknown node '{patch.NodeId}'."); }
            }
        }
    }
}
```

`Scene/SceneNeuron.cs`:

```csharp
using DigitalBrain.Flame.Scene;
using DigitalBrain.Flame.Scene.Signals;
using DigitalBrain.Framework;
using Orleans.Concurrency;
using Orleans.Runtime;

namespace DigitalBrain.Flame;

[GrainType(FlameVocabulary.SceneType)]
internal sealed class SceneNeuron([PersistentState("state", DigitalBrainNames.ClusterGrainStorage)] IPersistentState<SceneState> store)
    : Neuron<SceneState>(store), IScene
{
    public Task Set(SceneDefinition definition, long expectedRevision)
    {
        SceneValidation.Check(definition);
        var next = Snapshot;
        if (next.Revision != expectedRevision) { throw new InvalidOperationException($"Scene changed (revision {next.Revision}); read it and set again."); }
        next.Name = this.GetPrimaryKeyString();
        next.Revision++;
        next.Definition = definition;
        next.Current = definition.Machines.ToDictionary(m => m.Id, m => m.Initial, StringComparer.Ordinal);
        return Save(next, new SceneChanged(next.Name, next.Revision));
    }

    public Task Fire(string eventName, string? nodeId = null) => throw new NotImplementedException();   // Task 3
    public Task Report(string nodeId, string kind, double x, double y, string? payload) => throw new NotImplementedException();   // Task 3

    [ReadOnly] public Task<SceneState> Read() { Snapshot.Name = this.GetPrimaryKeyString(); return Task.FromResult(Snapshot); }
}
```

Add the module to `OsCatalog.BuiltIn()` after `CirclesModule` and the project reference to `DigitalBrain.OS.csproj` (mirror the Circles reference's relative path). If `ProductCompositionFacts` lists module ids, add `"flame"` in alphabetical position.

- [ ] **Step 4: Run the facts and the OS unit suite**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests`
Expected: 6 pass.
Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: green (composition facts see the new module).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs
git commit -m "Flame: a scene neuron validates and stores a whole graph, and the OS composes the module"
```

---

### Task 3: Fire, Report and the access rules

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Scene/SceneNeuron.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/SceneAccess.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scene/SceneFireFacts.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scene/SceneAccessFacts.cs`

**Interfaces:**
- Consumes: Task 1 `IScene.Fire/Report`, signals; Task 2 neuron.
- Produces: `Fire` applies the first transition whose `From` is the machine's current state and whose `Event` matches; publishes `SceneEntered(name, machine, to)` per machine moved; `Report` publishes `SceneInput`. `SceneAccess.RequireWriter(key)` / `RequireReporter(key)` using `CallerContextStamper.TryGet`.

- [ ] **Step 1: Write the failing facts**

```csharp
using DigitalBrain.Flame.Scene;
using DigitalBrain.Flame.Scene.Signals;
using Xunit;

namespace DigitalBrain.Modules.Flame.Tests.Scene;

public sealed class SceneFireFacts
{
    private const string Key = "owner/apps/ino/scenes/home";

    [Fact]
    public async Task FireMovesTheMachineAndPublishesEntered()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await using var entered = await brain.Observe<SceneEntered>(scene, ct);
        await scene.Fire("think");
        var signal = await entered.NextAsync(ct: ct);
        Assert.Equal("presence", signal.Machine);
        Assert.Equal("thinking", signal.State);
        Assert.Equal("thinking", (await scene.Read()).Current["presence"]);
    }

    [Fact]
    public async Task AnEventNoTransitionListensToChangesNothingAndPublishesNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await using var entered = await brain.Observe<SceneEntered>(scene, ct);
        await scene.Fire("speak");   // idle has no "speak"
        Assert.Equal("idle", (await scene.Read()).Current["presence"]);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => entered.NextAsync(timeout: TimeSpan.FromMilliseconds(300), ct: ct));
    }

    [Fact]
    public async Task TheCurrentStateSurvivesReactivation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await scene.Fire("think");
        await brain.Deactivate(scene, ct);
        Assert.Equal("thinking", (await scene.Read()).Current["presence"]);
    }

    [Fact]
    public async Task ReportPublishesSceneInputWithTheNodeAndGesture()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await using var inputs = await brain.Observe<SceneInput>(scene, ct);
        await scene.Report("sphere", "tap", 0.5, 0.5, null);
        var input = await inputs.NextAsync(ct: ct);
        Assert.Equal("sphere", input.NodeId);
        Assert.Equal("tap", input.Kind);
        Assert.Equal(Key, input.Name);
    }

    [Fact]
    public async Task ReportOnAnUnknownNodeIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var scene = brain.Get<IScene>(Key);
        await scene.Set(Scenes.Ino(), 0);
        await Assert.ThrowsAsync<ArgumentException>(() => scene.Report("ghost", "tap", 0, 0, null));
    }
}
```

If `NextAsync` has no `timeout` parameter, use the no-signal idiom the Flutter module's facts use for "publishes nothing" (search `Flutter.Tests` for `NextAsync` with a short timeout or a `Task.WhenAny` against `Task.Delay`), and keep the assertion.

`SceneAccessFacts.cs` — use the harness's caller stamping. `TestBrain` exposes a way to act as a stamped caller (read `src/Testing/DigitalBrain.Testing` for `AsCaller`, `WithCaller`, or the `CallerContextStamper` usage in `DigitalBrain.Modules.Circles.Tests`, which stamps App and User callers); write these facts with that idiom:

```csharp
public sealed class SceneAccessFacts
{
    private const string Key = "owner/apps/ino/scenes/home";

    [Fact]
    public async Task AnotherAppCannotSetAnAppsScene()   // App caller with AppId "owner/apps/files" is refused Set on an ino scene
    { /* stamp App caller AppId=owner/apps/files → Assert.ThrowsAsync<UnauthorizedAccessException>(Set) */ }

    [Fact]
    public async Task TheOwningAppCanSetAndTheShellCanReportAndFire()   // App caller AppId=owner/apps/ino sets; User caller of brain owner reports and fires
    { /* Set as ino app; Report + Fire as User → no throw */ }

    [Fact]
    public async Task AUserOfAnotherBrainIsRefused()   // User caller with BrainId "bob" on an "owner/..." scene
    { /* Assert.ThrowsAsync<UnauthorizedAccessException>(Read-side Report) */ }
}
```

Write the bodies in full with the harness idiom found; the three sentences above are the assertions each must make.

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests -- --filter-class "*SceneFireFacts*"`
Expected: FAIL with `NotImplementedException`.

- [ ] **Step 3: Implement**

`SceneAccess.cs`:

```csharp
using DigitalBrain.Framework;

namespace DigitalBrain.Flame;

// A scene is its app's: only that app, or a person/platform caller of the same brain, writes it; the shell
// (a User caller of the brain) reports gestures and fires events; nobody outside the brain touches it.
internal static class SceneAccess
{
    public static string BrainOf(string key) => key[..key.IndexOf("/apps/", StringComparison.Ordinal)];
    public static string AppOf(string key) => key[..key.IndexOf("/scenes/", StringComparison.Ordinal)];

    public static void RequireWriter(string key)
    {
        if (!CallerContextStamper.TryGet(out var caller) || caller.Kind == CallerKind.Platform) { return; }
        RequireBrain(caller, key);
        if (caller.Kind == CallerKind.App && !string.Equals(caller.AppId, AppOf(key), StringComparison.Ordinal))
        { throw new UnauthorizedAccessException($"Scene {key} belongs to {AppOf(key)}."); }
    }

    public static void RequireReporter(string key)
    {
        if (!CallerContextStamper.TryGet(out var caller) || caller.Kind == CallerKind.Platform) { return; }
        RequireBrain(caller, key);
        if (caller.Kind == CallerKind.App && !string.Equals(caller.AppId, AppOf(key), StringComparison.Ordinal))
        { throw new UnauthorizedAccessException($"Scene {key} belongs to {AppOf(key)}."); }
    }

    private static void RequireBrain(CallerContext caller, string key)
    {
        if (!string.Equals(caller.BrainId, BrainOf(key), StringComparison.Ordinal))
        { throw new UnauthorizedAccessException("This scene belongs to another brain."); }
    }
}
```

In `SceneNeuron`: call `SceneAccess.RequireWriter(this.GetPrimaryKeyString())` first in `Set`; replace the two stubs:

```csharp
    public async Task Fire(string eventName, string? nodeId = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(eventName);
        SceneAccess.RequireReporter(this.GetPrimaryKeyString());
        var next = Snapshot;
        var moved = new List<SceneEntered>();
        foreach (var machine in next.Definition.Machines)
        {
            var current = next.Current[machine.Id];
            var transition = machine.Transitions.FirstOrDefault(t => t.From == current && t.Event == eventName);
            if (transition is null) { continue; }
            next.Current[machine.Id] = transition.To;
            moved.Add(new SceneEntered(this.GetPrimaryKeyString(), machine.Id, transition.To));
        }
        if (moved.Count == 0) { return; }
        next.Name = this.GetPrimaryKeyString();
        await Save(next, moved[0]);
        foreach (var signal in moved.Skip(1)) { await Publish(signal); }
    }

    public Task Report(string nodeId, string kind, double x, double y, string? payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(nodeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        SceneAccess.RequireReporter(this.GetPrimaryKeyString());
        if (!Contains(Snapshot.Definition.Nodes, nodeId)) { throw new ArgumentException($"Scene has no node '{nodeId}'."); }
        return Publish(new SceneInput(this.GetPrimaryKeyString(), nodeId, kind, x, y, payload));
    }

    private static bool Contains(SceneNode[] nodes, string id) => nodes.Any(n => n.Id == id || Contains(n.Children, id));
```

`Publish` is the `Neuron` base method that emits a signal without saving (read `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs`; if the base only offers `Save(state, signal)`, use `Save(Snapshot, signal)` for `Report` and leave the revision untouched — a report is not a change).

- [ ] **Step 4: Run all Flame facts**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests`
Expected: 14 pass.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Scene/SceneNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/SceneAccess.cs src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scene/SceneFireFacts.cs src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Scene/SceneAccessFacts.cs
git commit -m "Flame: a scene's machines move on Fire, a person's gesture becomes SceneInput, and only the owning app writes"
```

---

### Task 4: StageNeuron

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Stage/StageNeuron.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Stage/StageFacts.cs`

**Interfaces:**
- Consumes: Task 1 `IStage`, `StageState`, `StageEntry`, `StageChanged`.
- Produces: grain type `stage`; owner rule identical to `ShellStateNeuron.RequireOwner` (key = `ShellPersistenceEndpoints.Scope(brainId, accountId, principalId)`; that helper is `internal` to the Flutter module — copy its digest logic into `StageNeuron` as `private static string ScopeOf(CallerContext)` rather than referencing the Flutter module; the Dart side computes the same key it uses for the workspace neuron).

- [ ] **Step 1: Write the failing facts**

```csharp
using DigitalBrain.Flame.Stage;
using DigitalBrain.Flame.Stage.Signals;
using Xunit;

namespace DigitalBrain.Modules.Flame.Tests.Stage;

public sealed class StageFacts
{
    private const string Key = "owner/stage/abc123";   // in production: the person's shell scope digest

    [Fact]
    public async Task GoPushesAndPublishesTheTop()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var stage = brain.Get<IStage>(Key);
        await stage.SetHome("owner/apps/ino/scenes/home");
        await using var changes = await brain.Observe<StageChanged>(stage, ct);
        await stage.Go("owner/apps/ino/scenes/home", "owner/apps/files/surface");
        var changed = await changes.NextAsync(ct: ct);
        Assert.Equal("owner/apps/ino/scenes/home", changed.Top);
        var state = await stage.Read();
        Assert.Equal(2, state.Stack.Length);
        Assert.Equal("owner/apps/files/surface", state.Stack[^1].DockSurfaceKey);
    }

    [Fact]
    public async Task BackPopsToThePreviousEntry()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var stage = brain.Get<IStage>(Key);
        await stage.SetHome("owner/apps/ino/scenes/home");
        await stage.Go("owner/apps/brainview/scenes/brain");
        await stage.Back();
        var state = await stage.Read();
        Assert.Single(state.Stack);
        Assert.Equal("owner/apps/ino/scenes/home", state.Stack[0].SceneKey);
    }

    [Fact]
    public async Task BackOnHomeStaysOnHomeAndPublishesNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var stage = brain.Get<IStage>(Key);
        await stage.SetHome("owner/apps/ino/scenes/home");
        var before = (await stage.Read()).Revision;
        await using var changes = await brain.Observe<StageChanged>(stage, ct);
        await stage.Back();
        Assert.Equal(before, (await stage.Read()).Revision);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => changes.NextAsync(timeout: TimeSpan.FromMilliseconds(300), ct: ct));
    }

    [Fact]
    public async Task HomeClearsTheStackToTheHomeScene()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        var stage = brain.Get<IStage>(Key);
        await stage.SetHome("owner/apps/ino/scenes/home");
        await stage.Go("a/apps/x/scenes/1"); await stage.Go("a/apps/x/scenes/2"); await stage.Go("a/apps/x/scenes/3");
        await stage.Home();
        var state = await stage.Read();
        Assert.Single(state.Stack);
        Assert.Equal("owner/apps/ino/scenes/home", state.Stack[0].SceneKey);
    }

    [Fact]
    public async Task GoBeforeSetHomeIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<FlameModule>().StartAsync(ct);
        await Assert.ThrowsAsync<InvalidOperationException>(() => brain.Get<IStage>(Key).Go("a/apps/x/scenes/1"));
    }

    [Fact]
    public async Task AnotherPersonsSessionIsRefusedTheStage()
    {
        // Stamp a User caller whose (brain, account, principal) digest is not Key → Read throws UnauthorizedAccessException.
        // Use the same stamping idiom as SceneAccessFacts (Task 3).
    }
}
```

Write the last fact's body in full with the Task 3 idiom.

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests -- --filter-class "*StageFacts*"`
Expected: FAIL (no grain implements `IStage`).

- [ ] **Step 3: Implement**

```csharp
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Flame.Stage;
using DigitalBrain.Flame.Stage.Signals;
using DigitalBrain.Framework;
using Orleans.Concurrency;
using Orleans.Runtime;

namespace DigitalBrain.Flame;

// The stage is the person's scene stack: Home is its floor, Escape pops, and only the session whose
// scope digest is the key may read or move it (the same rule as the shell's workspace neuron).
[GrainType(FlameVocabulary.StageType)]
internal sealed class StageNeuron([PersistentState("state", DigitalBrainNames.ClusterGrainStorage)] IPersistentState<StageState> store)
    : Neuron<StageState>(store), IStage
{
    private void RequireOwner()
    {
        if (CallerContextStamper.TryGet(out var caller) && caller.Kind != CallerKind.Platform
            && ScopeOf(caller) != this.GetPrimaryKeyString())
        { throw new UnauthorizedAccessException("This stage belongs to another person."); }
    }

    // Mirrors ShellPersistenceEndpoints.Scope in the Flutter module: brain + digest of account and principal.
    internal static string ScopeOf(CallerContext caller)
        => caller.BrainId + "/stage/" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(caller.AccountId + "\n" + caller.PrincipalId)))[..32];

    public Task SetHome(string sceneKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sceneKey);
        RequireOwner();
        var next = Snapshot;
        next.Name = this.GetPrimaryKeyString();
        next.Home = sceneKey;
        next.Stack = [new StageEntry(sceneKey, null)];
        next.Revision++;
        return Save(next, new StageChanged(next.Name, next.Revision, sceneKey));
    }

    public Task Go(string sceneKey, string? dockSurfaceKey = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sceneKey);
        RequireOwner();
        var next = Snapshot;
        if (next.Home.Length == 0) { throw new InvalidOperationException("Set a home scene before navigating."); }
        next.Name = this.GetPrimaryKeyString();
        next.Stack = [.. next.Stack, new StageEntry(sceneKey, dockSurfaceKey)];
        next.Revision++;
        return Save(next, new StageChanged(next.Name, next.Revision, sceneKey));
    }

    public Task Back()
    {
        RequireOwner();
        var next = Snapshot;
        if (next.Stack.Length <= 1) { return Task.CompletedTask; }
        next.Name = this.GetPrimaryKeyString();
        next.Stack = next.Stack[..^1];
        next.Revision++;
        return Save(next, new StageChanged(next.Name, next.Revision, next.Stack[^1].SceneKey));
    }

    public Task Home()
    {
        RequireOwner();
        var next = Snapshot;
        if (next.Home.Length == 0) { throw new InvalidOperationException("Set a home scene before navigating."); }
        if (next.Stack.Length == 1 && next.Stack[0].SceneKey == next.Home && next.Stack[0].DockSurfaceKey is null) { return Task.CompletedTask; }
        next.Name = this.GetPrimaryKeyString();
        next.Stack = [new StageEntry(next.Home, null)];
        next.Revision++;
        return Save(next, new StageChanged(next.Name, next.Revision, next.Home));
    }

    [ReadOnly] public Task<StageState> Read() { RequireOwner(); Snapshot.Name = this.GetPrimaryKeyString(); return Task.FromResult(Snapshot); }
}
```

Check the exact digest `ShellPersistenceEndpoints.Scope` computes (read `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Workspace/ShellPersistenceEndpoints.cs`) and make `ScopeOf` produce the same string with `/stage/` in place of its segment, so the Dart client can derive the stage key from the workspace key by one segment swap. Record the exact rule as a comment on `ScopeOf`.

- [ ] **Step 4: Run all Flame facts**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests`
Expected: 20 pass.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Stage/StageNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Stage/StageFacts.cs
git commit -m "Flame: the stage is the person's scene stack — Go pushes, Back pops, Home is the floor, and only its owner moves it"
```

---

### Task 5: HTTP endpoints for the shell

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameEndpoints.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameModule.cs` (`Configure(IEndpointRouteBuilder)` calls `FlameEndpoints.Map`)
- Create: `src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/FlameEndpointFacts.cs`

**Interfaces:**
- Consumes: `UiHttp.MapGet/MapPost` from the Flutter module's `UiKit/UiHttp.cs` — read it; if `UiHttp` is `internal` to the Flutter module, copy the two helpers (they are thin wrappers over `BrainRoutes.Group(endpoints).MapGet/MapPost` under `/ui/`) into `FlameEndpoints` rather than referencing the Flutter module.
- Produces, all under `/brains/{brainId}/ui/`:
  - `GET scenes/{name}` → `SceneState` (name is the full scene key, URL-encoded)
  - `POST scenes/{name}/fire` body `{ "event": "...", "nodeId": null }`
  - `POST scenes/{name}/report` body `{ "nodeId", "kind", "x", "y", "payload" }`
  - `GET stage` → `StageState` for the caller's own scope (the endpoint derives the key with `StageNeuron.ScopeOf(caller)`)
  - `POST stage/go` body `{ "sceneKey", "dockSurfaceKey" }`, `POST stage/back`, `POST stage/home`, `POST stage/home/set` body `{ "sceneKey" }`

- [ ] **Step 1: Write the failing fact**

Find the Flutter module's fact that drives `buttons/{name}/click` over HTTP (search `src/DigitalBrain.Modules/Google/Flutter/tests` for `"/click"`); it shows how `TestBrain` exposes an HTTP client for module endpoints. Mirror it:

```csharp
public sealed class FlameEndpointFacts
{
    [Fact]
    public async Task TheShellReadsASceneFiresAnEventAndReportsAGestureOverHttp()
    {
        // arrange: TestBrain with FlameModule and HTTP; Set the Ino scene through the grain
        // GET  /brains/owner/ui/scenes/owner%2Fapps%2Fino%2Fscenes%2Fhome  → 200, JSON current.presence == "idle"
        // POST /brains/owner/ui/scenes/.../fire   {"event":"think"}       → 200; grain Read shows "thinking"
        // POST /brains/owner/ui/scenes/.../report {"nodeId":"sphere","kind":"tap","x":0.5,"y":0.5} → 200
    }

    [Fact]
    public async Task TheShellMovesItsOwnStageOverHttp()
    {
        // POST stage/home/set {"sceneKey":"owner/apps/ino/scenes/home"} → 200
        // POST stage/go {"sceneKey":"owner/apps/brainview/scenes/brain"} → 200
        // GET  stage → stack length 2
        // POST stage/back → 200; GET stage → stack length 1
    }
}
```

Write both bodies in full with the HTTP idiom found.

- [ ] **Step 2: Run to verify failure** — Expected: 404s.

- [ ] **Step 3: Implement `FlameEndpoints`**

```csharp
using DigitalBrain.Flame.Scene;
using DigitalBrain.Flame.Stage;
using DigitalBrain.Framework;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace DigitalBrain.Flame;

internal static class FlameEndpoints
{
    internal sealed record FireBody(string Event, string? NodeId);
    internal sealed record ReportBody(string NodeId, string Kind, double X, double Y, string? Payload);
    internal sealed record GoBody(string SceneKey, string? DockSurfaceKey);
    internal sealed record HomeBody(string SceneKey);

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var ui = BrainRoutes.Group(endpoints).MapGroup("/ui");
        ui.MapGet("/scenes/{name}", (string name, IGrainFactory grains) => grains.GetGrain<IScene>(name).Read());
        ui.MapPost("/scenes/{name}/fire", async (string name, FireBody body, IGrainFactory grains) => { await grains.GetGrain<IScene>(name).Fire(body.Event, body.NodeId); return Results.Ok(); });
        ui.MapPost("/scenes/{name}/report", async (string name, ReportBody body, IGrainFactory grains) => { await grains.GetGrain<IScene>(name).Report(body.NodeId, body.Kind, body.X, body.Y, body.Payload); return Results.Ok(); });
        ui.MapGet("/stage", (IGrainFactory grains) => Stage(grains).Read());
        ui.MapPost("/stage/go", async (GoBody body, IGrainFactory grains) => { await Stage(grains).Go(body.SceneKey, body.DockSurfaceKey); return Results.Ok(); });
        ui.MapPost("/stage/back", async (IGrainFactory grains) => { await Stage(grains).Back(); return Results.Ok(); });
        ui.MapPost("/stage/home", async (IGrainFactory grains) => { await Stage(grains).Home(); return Results.Ok(); });
        ui.MapPost("/stage/home/set", async (HomeBody body, IGrainFactory grains) => { await Stage(grains).SetHome(body.SceneKey); return Results.Ok(); });
    }

    private static IStage Stage(IGrainFactory grains)
    {
        if (!CallerContextStamper.TryGet(out var caller)) { throw new UnauthorizedAccessException("No caller."); }
        return grains.GetGrain<IStage>(StageNeuron.ScopeOf(caller));
    }
}
```

Keep the route shapes that `BrainRoutes.Group` and the Flutter `UiHttp` use (membership filter, id validation come from the group). If `UiHttp` exposes reusable `MapGet<TNeuron,TState>` helpers publicly, prefer them.

- [ ] **Step 4: Run the Flame suite** — Expected: 22 pass.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameEndpoints.cs src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameModule.cs src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/FlameEndpointFacts.cs
git commit -m "Flame: the shell reads scenes, fires events, reports gestures and moves its stage over the brain's /ui routes"
```

---

### Task 6: Dart scene model and the Flame scene renderer

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/pubspec.yaml` (add `flame`)
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/scene_models.dart` (Dart mirror of `SceneState`, `SceneDefinition`, `SceneNode`, `Transform`, `Tween`, `StateMachine`, `StateDef`, `NodePatch`, `Transition`, `SceneCamera`)
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/scene_client.dart` (GET scene, POST fire, POST report, GET/POST stage — same base URL and auth as `ui_client.dart`'s `/brains/{ws}/ui/...` calls)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/digitalbrain_flutter.dart` (export both)
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/scene_game.dart` (`SceneGame extends FlameGame`: builds components from nodes, applies state patches, runs tweens, reports gestures)
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/node_components.dart` (one component per v1 primitive type + `PlaceholderNode`)
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/scene_view.dart` (`SceneView` widget: loads `SceneState`, hosts `GameWidget<SceneGame>`, re-applies on change)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/composition/renderer_registry.dart` (add `'scene'` to `uiKinds` and `dedicatedUiKinds`)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/composition/neuron_view.dart` (`case 'scene': return SceneView(...)` next to `case 'chart'`)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/digitalbrain_ui.dart` (export `scene_view.dart`)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/ui/test/flame/scene_game_test.dart`, `src/DigitalBrain.Modules/Google/Flutter/app/core/test/scene_models_test.dart`

**Interfaces:**
- Consumes: Task 1 JSON shapes (System.Text.Json web defaults: camelCase property names; `Current` is a map), Task 5 routes.
- Produces: `SceneGame.apply(SceneState state)` (diff by node id: add, remove, patch), `SceneGame.onInput` callback `(nodeId, kind, x, y, payload)`, `SceneView(key: sceneKey, client: SceneClient)`; `SceneClient.read/fire/report/stage/go/back/home/setHome`. `SceneGame` exposes `componentFor(String nodeId)` for tests and prefabs (Task 7).

- [ ] **Step 1: Add Flame and write the failing tests**

Run in `app/ui`: `flutter pub add flame` (record the resolved version in the commit message). Then:

`core/test/scene_models_test.dart`:

```dart
import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a scene state round-trips the wire shape the C# neuron serializes', () {
    final json = {
      'name': 'owner/apps/ino/scenes/home',
      'revision': 3,
      'definition': {
        'nodes': [
          {'id': 'sphere', 'type': 'ino_sphere', 'transform': {'x': 0, 'y': 0, 'z': 0, 'scale': 1, 'rotation': 0, 'opacity': 1},
           'style': null, 'parameters': {'mood': 'calm'}, 'children': [], 'tweens': [], 'inputs': ['tap']},
        ],
        'machines': [
          {'id': 'presence', 'initial': 'idle', 'states': [{'name': 'idle', 'apply': []}, {'name': 'thinking', 'apply': [
              {'nodeId': 'sphere', 'style': null, 'parameters': {'mood': 'busy'}, 'transform': null, 'tweens': null}]}],
           'transitions': [{'from': 'idle', 'event': 'think', 'to': 'thinking'}]},
        ],
        'camera': {'x': 0, 'y': 0, 'zoom': 1},
        'background': '#0B0F14',
      },
      'current': {'presence': 'thinking'},
    };
    final state = SceneState.fromJson(json);
    expect(state.revision, 3);
    expect(state.definition.nodes.single.type, 'ino_sphere');
    expect(state.current['presence'], 'thinking');
    expect(state.definition.machines.single.states[1].apply.single.parameters?['mood'], 'busy');
  });
}
```

`ui/test/flame/scene_game_test.dart`:

```dart
import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:digitalbrain_ui/digitalbrain_ui.dart';
import 'package:flame_test/flame_test.dart';
import 'package:flutter_test/flutter_test.dart';

SceneState scene(List<Map<String, Object?>> nodes, {Map<String, String> current = const {}, List<Map<String, Object?>> machines = const []}) =>
    SceneState.fromJson({'name': 's', 'revision': 1, 'current': current,
      'definition': {'nodes': nodes, 'machines': machines, 'camera': {'x': 0, 'y': 0, 'zoom': 1}, 'background': '#000000'}});

Map<String, Object?> node(String id, String type, {Map<String, String> params = const {}, List<String> inputs = const []}) => {
  'id': id, 'type': type, 'transform': {'x': 10, 'y': 10, 'z': 0, 'scale': 1, 'rotation': 0, 'opacity': 1},
  'style': '#ffffff', 'parameters': params, 'children': [], 'tweens': [], 'inputs': inputs};

void main() {
  final flameTester = FlameTester(SceneGame.new);

  flameTester.testGameWidget('primitive nodes become components keyed by id', setUp: (game, _) async {
    game.apply(scene([node('a', 'circle'), node('b', 'rect'), node('c', 'text', params: {'text': 'hi'})]));
    await game.ready();
  }, verify: (game, _) async {
    expect(game.componentFor('a'), isNotNull);
    expect(game.componentFor('b'), isNotNull);
    expect(game.componentFor('c'), isNotNull);
  });

  flameTester.testGameWidget('an unknown node type renders a placeholder and the siblings', setUp: (game, _) async {
    game.apply(scene([node('a', 'circle'), node('x', 'hologram')]));
    await game.ready();
  }, verify: (game, _) async {
    expect(game.componentFor('a'), isNotNull);
    expect(game.componentFor('x'), isA<PlaceholderNode>());
  });

  flameTester.testGameWidget('a later apply removes nodes that left and patches the current state', setUp: (game, _) async {
    game.apply(scene([node('a', 'circle'), node('b', 'rect')]));
    await game.ready();
    game.apply(scene([node('a', 'circle', params: {'radius': '40'})],
        machines: [{'id': 'm', 'initial': 's1', 'states': [{'name': 's1', 'apply': []}, {'name': 's2', 'apply': [
          {'nodeId': 'a', 'style': '#ff0000', 'parameters': null, 'transform': null, 'tweens': null}]}], 'transitions': []}],
        current: {'m': 's2'}));
    await game.ready();
  }, verify: (game, _) async {
    expect(game.componentFor('b'), isNull);
    expect(game.componentFor('a')!.style, '#ff0000');
  });

  flameTester.testGameWidget('a tap on a node with the tap input reports it', setUp: (game, _) async {
    game.apply(scene([node('a', 'circle', inputs: ['tap'])]));
    await game.ready();
  }, verify: (game, tester) async {
    final reports = <String>[];
    game.onInput = (nodeId, kind, x, y, payload) => reports.add('$nodeId:$kind');
    game.simulateTap('a');
    expect(reports, ['a:tap']);
  });
}
```

Add `flame_test` to `ui` dev_dependencies with `flutter pub add --dev flame_test`.

- [ ] **Step 2: Run to verify failure**

Run in `app/core`: `flutter test test/scene_models_test.dart` → fails (no `SceneState`). In `app/ui`: `flutter test test/flame` → fails (no `SceneGame`).

- [ ] **Step 3: Implement**

`scene_models.dart`: immutable Dart classes with `fromJson` mirroring the C# records; property names camelCase; `Transform.fromJson` defaults match C# defaults (scale 1, opacity 1). Follow `brain_models.dart` style in the same folder.

`scene_client.dart` (same construction as `UiClient`; read `ui_client.dart` for base URL, headers and error mapping):

```dart
final class SceneClient {
  SceneClient(this._http, this._base, this.workspace);
  final http.Client _http; final Uri _base; final String workspace;

  Uri _ui(String path) => _base.resolve('/brains/${Uri.encodeComponent(workspace)}/ui/$path');
  Future<SceneState> read(String sceneKey) async =>
      SceneState.fromJson(await _getJson(_ui('scenes/${Uri.encodeComponent(sceneKey)}')));
  Future<void> fire(String sceneKey, String event, {String? nodeId}) =>
      _post(_ui('scenes/${Uri.encodeComponent(sceneKey)}/fire'), {'event': event, 'nodeId': nodeId});
  Future<void> report(String sceneKey, String nodeId, String kind, double x, double y, {String? payload}) =>
      _post(_ui('scenes/${Uri.encodeComponent(sceneKey)}/report'), {'nodeId': nodeId, 'kind': kind, 'x': x, 'y': y, 'payload': payload});
  Future<StageState> stage() async => StageState.fromJson(await _getJson(_ui('stage')));
  Future<void> go(String sceneKey, {String? dockSurfaceKey}) => _post(_ui('stage/go'), {'sceneKey': sceneKey, 'dockSurfaceKey': dockSurfaceKey});
  Future<void> back() => _post(_ui('stage/back'), const {});
  Future<void> home() => _post(_ui('stage/home'), const {});
  Future<void> setHome(String sceneKey) => _post(_ui('stage/home/set'), {'sceneKey': sceneKey});
  // _getJson/_post: copy UiClient's request helpers (auth header, JSON decode, non-2xx → exception with body).
}
```

`StageState`/`StageEntry` Dart mirrors go in `scene_models.dart` too.

`node_components.dart`: `abstract class NodeComponent extends PositionComponent { String nodeId; String? style; Map<String,String> params; void patch(NodePatch p); }` with `CircleNode`, `RectNode`, `TextNode`, `SpriteNode` (parameter `src`, loaded via `Flame.images` from the shell's asset base; a failed load falls back to a `RectNode`), `PathNode` (parameter `d` as an SVG-like move/line list), `ParticlesNode` (Flame `ParticleSystemComponent`, params `count`, `speed`, `color`), `GroupNode` (children), `PlaceholderNode` (dashed rect + type label). Style strings are `#rrggbb` or `#aarrggbb`.

`scene_game.dart`:

```dart
final class SceneGame extends FlameGame {
  final _byId = <String, NodeComponent>{};
  void Function(String nodeId, String kind, double x, double y, String? payload)? onInput;
  SceneState? _state;

  NodeComponent? componentFor(String id) => _byId[id];

  void apply(SceneState state) {
    _state = state;
    final seen = <String>{};
    void walk(SceneNode node, Component parent) {
      seen.add(node.id);
      var component = _byId[node.id];
      if (component == null || component.typeName != node.type) {
        component?.removeFromParent();
        component = NodeComponents.build(node) ?? PlaceholderNode(node);
        _byId[node.id] = component;
        parent.add(component);
      } else {
        component.update_(node);   // transform, style, params from the definition
      }
      for (final child in node.children) { walk(child, component); }
    }
    for (final node in state.definition.nodes) { walk(node, world); }
    for (final id in _byId.keys.where((k) => !seen.contains(k)).toList()) { _byId.remove(id)!.removeFromParent(); }
    // Current states: apply every patch of each machine's current state, in machine order.
    for (final machine in state.definition.machines) {
      final current = state.current[machine.id] ?? machine.initial;
      final def = machine.states.firstWhere((s) => s.name == current, orElse: () => machine.states.first);
      for (final patch in def.apply) { _byId[patch.nodeId]?.patch(patch); }
    }
    camera.viewfinder.zoom = state.definition.camera.zoom;
  }

  // Tap routing: the topmost component under the point whose node declared the gesture reports it.
  void report(NodeComponent component, String kind, Vector2 at, [String? payload]) =>
      onInput?.call(component.nodeId, kind, at.x, at.y, payload);

  @visibleForTesting
  void simulateTap(String nodeId) { final c = _byId[nodeId]!; if (c.inputs.contains('tap')) report(c, 'tap', c.position); }
}
```

`NodeComponent` implements `TapCallbacks`/`DragCallbacks` (Flame mixins) and calls `game.report` for the gestures its `inputs` list names. Tweens use Flame `Effect`s (`MoveEffect`, `ScaleEffect`, `OpacityEffect`, `RotateEffect`) built from `Tween.property`.

`scene_view.dart`: a `StatefulWidget` that reads the scene through `SceneClient.read`, builds one `SceneGame`, calls `apply`, and re-reads on the shell's live-signal notification for that neuron key (the same subscription path `NeuronView` uses to refresh a chart on `ChartChanged`; reuse it for `SceneChanged`/`SceneEntered`). `onInput` → `client.report`.

Register `'scene'` in `renderer_registry.dart` (both lists) and in `neuron_view.dart`'s switch.

- [ ] **Step 4: Run tests and analyze**

Run in `app/core`: `flutter test`, `flutter analyze`. In `app/ui`: `flutter test`, `flutter analyze`.
Expected: all green, 0 analyzer issues. The existing `ui_gallery_test`/registry tests that enumerate kinds must still pass (update their expected kind list if they pin it).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Google/Flutter/app/ui/pubspec.yaml src/DigitalBrain.Modules/Google/Flutter/app/ui/pubspec.lock src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/scene_models.dart src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/scene_client.dart src/DigitalBrain.Modules/Google/Flutter/app/core/lib/digitalbrain_flutter.dart src/DigitalBrain.Modules/Google/Flutter/app/core/test/scene_models_test.dart src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/composition/renderer_registry.dart src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/composition/neuron_view.dart src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/digitalbrain_ui.dart src/DigitalBrain.Modules/Google/Flutter/app/ui/test/flame
git commit -m "Shell: a scene child renders through Flame — nodes become components, state patches apply, gestures report back"
```

---

### Task 7: Prefabs — ino_sphere, activity_ring, brain_graph

**Files:**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/prefabs/ino_sphere.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/prefabs/activity_ring.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/prefabs/brain_graph.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/node_components.dart` (`NodeComponents.build` resolves the three prefab types)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/ui/test/flame/prefabs_test.dart`

**Interfaces:**
- Consumes: `NodeComponent`, `SceneGame` (Task 6); the existing `InoPresence` palette and motion (`ui/lib/src/lumen/ino_presence.dart`, `lumen_palette.dart`) as the visual reference; `BrainSnapshot`/`BrainNeuron`/`BrainSynapse`/`BrainActivity` from `core/lib/src/models/brain_models.dart` and the `/brain/events` SSE loader the `BrainGraphPanel` already uses.
- Produces: parameters each prefab understands:
  - `ino_sphere`: `mood` ∈ {idle, listening, thinking, acting, speaking, error, disconnected}, `radius`, `hue`. Mood is normally set by a state patch.
  - `activity_ring`: `items` = JSON array of `{id,label,kind,progress}` (≤ 24), `radius`. Each item is a tappable child with `inputs: [tap]` reporting `payload = id`.
  - `brain_graph`: `source` ∈ {`events` (the `/brain/events` stream), `static`}, `filter` ∈ {apps, all}, `selected` node id, `layout` ∈ {sphere, force}. Nodes project from a rotating 3D sphere (depth → scale and alpha); edges are synapses; each `BrainActivity` becomes a pulse travelling its edge. Tap on a node reports `payload = neuron id`; drag rotates (presentation only, never reported).

- [ ] **Step 1: Write the failing tests**

```dart
void main() {
  final flameTester = FlameTester(SceneGame.new);

  flameTester.testGameWidget('ino_sphere changes its look with mood', setUp: (game, _) async {
    game.apply(scene([node('ino', 'ino_sphere', params: {'mood': 'idle'})]));
    await game.ready();
  }, verify: (game, _) async {
    final sphere = game.componentFor('ino') as InoSphere;
    final idle = sphere.glow;
    sphere.patch(NodePatch(nodeId: 'ino', parameters: {'mood': 'thinking'}));
    game.update(0.5);
    expect(sphere.glow, isNot(idle));
    expect(sphere.mood, InoMood.thinking);
  });

  flameTester.testGameWidget('activity_ring lays out one tappable child per item and reports its id', setUp: (game, _) async {
    game.apply(scene([node('ring', 'activity_ring', params: {'items': '[{"id":"r1","label":"Routing","kind":"route","progress":0.4},{"id":"b2","label":"timer","kind":"behavior","progress":1}]'})]));
    await game.ready();
  }, verify: (game, _) async {
    final ring = game.componentFor('ring') as ActivityRing;
    expect(ring.items.length, 2);
    final reports = <String?>[];
    game.onInput = (id, kind, x, y, payload) => reports.add(payload);
    ring.simulateTap('b2');
    expect(reports, ['b2']);
  });

  flameTester.testGameWidget('brain_graph projects a static snapshot into nodes with depth and pulses activity along edges', setUp: (game, _) async {
    game.apply(scene([node('brain', 'brain_graph', params: {'source': 'static', 'filter': 'all'})]));
    await game.ready();
    final graph = game.componentFor('brain') as BrainGraph;
    graph.show(BrainSnapshot.fromJson({
      'rootId': 'owner', 'scope': 'owner', 'observedAt': '2026-10-11T00:00:00Z', 'truncated': false,
      'nodes': [{'id': 'a', 'type': 'app', 'name': 'ino', 'label': 'Ino', 'module': 'apps', 'role': 'app', 'status': 'active'},
                {'id': 'b', 'type': 'router', 'name': 'router', 'label': 'Router', 'module': 'ai', 'role': 'kernel', 'status': 'active'}],
      'synapses': [{'id': 'a-b', 'from': 'a', 'to': 'b', 'signal': 'Routed'}],
      'activity': [{'neuronId': 'b', 'operationId': 'op1', 'kind': 'BehaviorRan', 'at': '2026-10-11T00:00:01Z'}],
      'correlations': [],
    }));
    game.update(0.1);
  }, verify: (game, _) async {
    final graph = game.componentFor('brain') as BrainGraph;
    expect(graph.nodeCount, 2);
    expect(graph.edgeCount, 1);
    expect(graph.pulses, isNotEmpty);
    final depths = graph.projectedDepths();
    expect(depths.values.every((d) => d >= -1 && d <= 1), isTrue);
  });
}
```

Use the exact `BrainSnapshot.fromJson` field names from `brain_models.dart` (read it; adjust the test JSON keys to its parser, not the other way round).

- [ ] **Step 2: Run to verify failure** — `flutter test test/flame/prefabs_test.dart` fails (no prefab classes).

- [ ] **Step 3: Implement the three prefabs**

`ino_sphere.dart`: `InoSphere extends NodeComponent`. A layered look: core disc with a radial gradient in the lumen green palette, two orbiting rings (`CircleComponent` children rotated by `RotateEffect`), a soft halo whose `glow` (0..1) eases toward a mood target (idle 0.3, listening 0.6, thinking 0.9 with faster ring spin, acting 1.0 with a particle burst, speaking pulsing 0.5↔0.9, error red tint, disconnected grey, no motion). `patch` reads `mood`; `update(dt)` eases glow and spin. Honour `MediaQuery.disableAnimationsOf` the way `InoPresence` does by exposing `animations` flag the `SceneView` sets.

`activity_ring.dart`: `ActivityRing extends NodeComponent` parses `items`, places up to 24 `RingItem` children evenly on the circle, each a small pill (icon by `kind`, label, progress arc), tappable, `simulateTap(id)` for tests. New items ease in from the centre; removed ones fade out.

`brain_graph.dart`: `BrainGraph extends NodeComponent`. Holds a `BrainSnapshot`; positions nodes on a unit sphere (Fibonacci sphere for `layout=sphere`; a cheap spring layout on the sphere for `force`), rotates with a slow idle spin plus drag delta, projects to 2D with depth `z ∈ [-1,1]` → scale 0.6..1.2 and alpha 0.35..1. Edges are lines between projected points; pulses are small `CircleComponent`s moving from `from` to `to` over 600 ms for every new `BrainActivity` (keyed by `neuronId:operationId`, deduped). `filter=apps` hides nodes whose `role` is not `app`/`synapse`. `source=events` subscribes through the same loader `BrainGraphPanel` uses (`SignalsLoader`/the SSE client in `digitalbrain_flutter`); `source=static` waits for `show()`. Tap on a projected node → `game.report(this, 'tap', at, node.id)`. `nodeCount`, `edgeCount`, `pulses`, `projectedDepths()` for tests.

Register the three in `NodeComponents.build`.

- [ ] **Step 4: Run tests and analyze** — `flutter test`, `flutter analyze` in `app/ui`: green, 0 issues.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/prefabs src/DigitalBrain.Modules/Google/Flutter/app/ui/lib/src/flame/node_components.dart src/DigitalBrain.Modules/Google/Flutter/app/ui/test/flame/prefabs_test.dart
git commit -m "Shell: Ino's sphere, the activity ring and the projected brain graph are Flame prefabs a scene can place"
```

---

### Task 8: The stage view in the shell

**Files:**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/stage/stage_view.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/stage/stage_controller.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart` (mount `StageView` as the root when the stage has a home; fall back to today's desktop when it has none, so an OS without the Ino app is unchanged)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_routes.dart` (Escape shortcut → `StageController.home()`)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/stage_view_test.dart`

**Interfaces:**
- Consumes: `SceneClient` (Task 6), `SceneView`, `StageState`; the existing `ApplicationSurface` widget (`shell/lib/workspace/application_surface.dart`) for the docked widget tree; the shell's live-signal subscription for `StageChanged`.
- Produces: `StageController` (ChangeNotifier) with `stage`, `refresh()`, `go/back/home`; `StageView` renders the top entry: the scene full-bleed; when `dockSurfaceKey != null`, a `Row` with the scene at 320 px (Ino as orb) and `ApplicationSurface(surfaceKey)` filling the rest, animated with `AnimatedSwitcher` (300 ms). Escape (`LogicalKeyboardKey.escape`) → `controller.home()` unless a text field has focus.

- [ ] **Step 1: Write the failing widget tests**

```dart
void main() {
  testWidgets('with no home the stage view shows the classic desktop', (tester) async {
    final controller = StageController.fake(StageState(name: 's', revision: 0, home: '', stack: const []));
    await tester.pumpWidget(StageHost(controller: controller, desktop: const Text('desktop'), client: FakeSceneClient()));
    expect(find.text('desktop'), findsOneWidget);
  });

  testWidgets('the top entry renders its scene and a docked surface beside it', (tester) async {
    final controller = StageController.fake(StageState(name: 's', revision: 2, home: 'owner/apps/ino/scenes/home',
        stack: const [StageEntry(sceneKey: 'owner/apps/ino/scenes/home', dockSurfaceKey: null),
                      StageEntry(sceneKey: 'owner/apps/ino/scenes/home', dockSurfaceKey: 'owner/apps/files/surface')]));
    await tester.pumpWidget(StageHost(controller: controller, desktop: const SizedBox(), client: FakeSceneClient()));
    await tester.pump();
    expect(find.byType(SceneView), findsOneWidget);
    expect(find.byType(ApplicationSurface), findsOneWidget);
  });

  testWidgets('Escape asks the stage to go home', (tester) async {
    final client = FakeSceneClient();
    final controller = StageController.fake(StageState(name: 's', revision: 1, home: 'owner/apps/ino/scenes/home',
        stack: const [StageEntry(sceneKey: 'owner/apps/ino/scenes/home', dockSurfaceKey: null),
                      StageEntry(sceneKey: 'owner/apps/brainview/scenes/brain', dockSurfaceKey: null)]), client: client);
    await tester.pumpWidget(StageHost(controller: controller, desktop: const SizedBox(), client: client));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(client.calls, contains('home'));
  });
}
```

`FakeSceneClient` implements `SceneClient`'s surface recording calls and returning an empty scene; put it in `shell/test/stage_fakes.dart`.

- [ ] **Step 2: Run to verify failure** — `flutter test test/stage_view_test.dart` fails.

- [ ] **Step 3: Implement**

`StageController`: holds `StageState`, `refresh()` calls `client.stage()`, subscribes to `StageChanged` for its own stage key through the shell's live-signal stream (the same mechanism `workspace_store.dart` uses for `WorkspaceChanged`; read it), `go/back/home` call the client then `refresh()`. `StageController.fake(state, {client})` for tests.

`StageHost` (in `stage_view.dart`): `controller.stage.home.isEmpty ? desktop : StageView(...)`; `StageView` builds the top entry as described; wraps in `Shortcuts`/`Actions` binding Escape to `controller.home()`, skipped when `FocusManager.instance.primaryFocus?.context` is inside an `EditableText`.

In `workspace_app.dart`, create the controller with the real `SceneClient` (same base URL and workspace as `UiClient`) and wrap the current desktop widget in `StageHost(desktop: <current desktop>)`.

- [ ] **Step 4: Run tests and analyze** — `flutter test`, `flutter analyze` in `app/shell`: green, 0 issues.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/stage src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_routes.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/stage_view_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/stage_fakes.dart
git commit -m "Shell: the stage renders the person's scene stack, docks an app's surface beside the scene, and Escape goes home"
```

---

### Task 9: The Ino app

**Files:**
- Create: `features/os/Ino/app.cs`, `features/os/Ino/Ino.cs` (shared), `features/os/Ino/open.cs`, `features/os/Ino/presence-routed.cs`, `features/os/Ino/presence-turn.cs`, `features/os/Ino/presence-ran.cs`, `features/os/Ino/dock.cs`, `features/os/Ino/icon.svg`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json` (OS defaults list `DigitalBrain:Modules:apps:Options:Apps` — add `{ "publisher": "os", "name": "ino" }`; read `OsAppsOptions` for the exact shape)
- Test: the existing feature compile gate (`FeatureCatalog` boot fact in `DigitalBrain.OS.Tests.Unit` or the Apps module's features facts — find the fact that compile-checks every folder under `features/` and run it)

**Interfaces:**
- Consumes: `IScene`, `IStage` (Task 1 contracts, now installed in the sandbox), `Routed` (`DigitalBrain.AI.Routing.Signals`), `TurnStarted/TurnCompleted/TurnFailed` (the assistant's agent conversation signals, see `features/os/Assistant/projection-*.cs` for the exact source neuron and types), `BehaviorRan` (`DigitalBrain.Microsoft.CSharp.Runtime.Signals`, source `microsoft.csharp.runs/{scope}/runs` as `features/os/Memory/runs.cs` does), `AppRequested` on the Assistant app.
- Produces: scenes `{scope}/apps/ino/scenes/welcome` and `{scope}/apps/ino/scenes/home`; the stage's home is set to the home scene on `open`.

- [ ] **Step 1: Write app.cs**

```csharp
/*
# Ino

Ino is the person's assistant as a presence: a living sphere at the centre of the home scene, surrounded by
what the brain is doing right now. Ino never does work itself; it shows the work of the router, the
assistant's turns and every behavior that runs, and it moves the stage so the app the person asked for
appears beside it. Escape brings the person back to this scene.

Inputs are plain text.
- open: composes the welcome and home scenes, sets the stage's home to the home scene and goes there.

## Scenario: Opening Ino puts the person on the home scene

Invoking "open" composes "home" with the ino_sphere in its idle state and an empty activity ring, and the
stage's top is the home scene.

## Scenario: A route turns Ino thoughtful

When the router publishes Routed, the presence machine moves to "thinking"; when the assistant's turn
completes it moves to "speaking" and then back to "idle".
*/

using DigitalBrain.Apps;

static class App
{
    public const string Name = "ino";
    public const string Version = "1.0.0";

    public static readonly AppManifest Manifest = new(
        Title: "Ino",
        Description: "Your assistant as a presence: a living sphere showing what your brain is doing, and the way home.",
        Operations: [new("open", "Compose Ino's scenes and make the home scene the stage's home.")],
        Settings: [],
        Slots: [],
        Icon: "icon.svg");
}
```

- [ ] **Step 2: Write the shared class `Ino.cs`**

```csharp
using DigitalBrain.Client;
using DigitalBrain.Flame.Scene;
using DigitalBrain.Flame.Stage;

// Shared by every Ino synapse: keys, the two scenes (always rebuilt whole, never patched) and the presence events.
public static class Ino
{
    public static string Key(DigitalBrainConnection brain) => brain.Setting("App")!;
    public static string Scope(DigitalBrainConnection brain) => brain.Setting("Brain") ?? Key(brain)[..Key(brain).IndexOf("/apps/", StringComparison.Ordinal)];
    public static string HomeKey(DigitalBrainConnection brain) => Key(brain) + "/scenes/home";
    public static string WelcomeKey(DigitalBrainConnection brain) => Key(brain) + "/scenes/welcome";

    public static IScene Home(DigitalBrainConnection brain) => brain.Get<IScene>(HomeKey(brain));

    static SceneNode Sphere(double scale) => new("ino", "ino_sphere", new Transform(Scale: scale), null,
        new() { ["mood"] = "idle", ["radius"] = "120" }, [], [], ["tap"]);

    static StateMachine Presence() => new("presence", "idle",
        [
            new("idle", [new("ino", null, new() { ["mood"] = "idle" }, null, null)]),
            new("listening", [new("ino", null, new() { ["mood"] = "listening" }, null, null)]),
            new("thinking", [new("ino", null, new() { ["mood"] = "thinking" }, null, null)]),
            new("acting", [new("ino", null, new() { ["mood"] = "acting" }, null, null)]),
            new("speaking", [new("ino", null, new() { ["mood"] = "speaking" }, null, null)]),
            new("error", [new("ino", null, new() { ["mood"] = "error" }, null, null)]),
        ],
        [
            new("idle", "listen", "listening"), new("listening", "think", "thinking"), new("idle", "think", "thinking"),
            new("thinking", "act", "acting"), new("acting", "act", "acting"), new("acting", "speak", "speaking"), new("thinking", "speak", "speaking"),
            new("speaking", "rest", "idle"), new("thinking", "rest", "idle"), new("acting", "rest", "idle"), new("listening", "rest", "idle"),
            new("thinking", "fail", "error"), new("acting", "fail", "error"), new("error", "rest", "idle"),
        ]);

    public static SceneDefinition WelcomeScene() => new([Sphere(1.4)], [Presence()], new SceneCamera(), "#070A0F");

    public static SceneDefinition HomeScene(string itemsJson) => new(
        [
            Sphere(1.0),
            new("ring", "activity_ring", new Transform(), null, new() { ["items"] = itemsJson, ["radius"] = "220" }, [], [], []),
        ],
        [Presence()], new SceneCamera(), "#0B0F14");

    public static async Task Compose(DigitalBrainConnection brain, string itemsJson = "[]")
    {
        var welcome = brain.Get<IScene>(WelcomeKey(brain));
        await welcome.Set(WelcomeScene(), (await welcome.Read()).Revision);
        var home = Home(brain);
        await home.Set(HomeScene(itemsJson), (await home.Read()).Revision);
    }

    // Fire never throws into a synapse loop: a presence event that finds no transition is a no-op by contract,
    // and a scene not yet composed is simply skipped.
    public static async Task Fire(DigitalBrainConnection brain, string eventName)
    {
        try { await Home(brain).Fire(eventName); }
        catch (Exception) when (!brain.Stopping.IsCancellationRequested) { }
    }
}
```

- [ ] **Step 3: Write the synapses**

`open.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flame.Stage;

// "open": compose both scenes, make home the stage's floor and go there.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
await foreach (var request in brain.On(app, "open", brain.Stopping))
{
    await Ino.Compose(brain);
    var stage = brain.Get<IStage>(brain.Setting("Stage") ?? Ino.Scope(brain) + "/stage/owner");
    await stage.SetHome(Ino.HomeKey(brain));
}
```

The stage key a script may address: the stage is per person and keyed by the shell's scope digest, which a synapse cannot compute. Resolve this in Task 9 by giving `IStage` a brain-level alias: in `StageNeuron`, accept the key `{brain}/stage/owner` for the brain's owner principal (the Open posture's single person), and have `FlameEndpoints.Stage` map a caller whose account is the brain owner to that same key. Record this as a plan ruling in the ledger: *the owner's stage key is `{brain}/stage/owner`; other members get the digest key.* Add the fact `TheOwnersStageIsAddressableAsBrainSlashStageSlashOwner` to `StageFacts` and update `ScopeOf` accordingly (Task 4's commit is amended by a follow-up commit here, not rewritten).

`presence-routed.cs`:

```csharp
using DigitalBrain.AI.Routing;
using DigitalBrain.AI.Routing.Signals;
using DigitalBrain.Client;

// A route decided: Ino is thinking.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var router = brain.Get<IRouter>(Ino.Scope(brain));
await foreach (var routed in brain.On<Routed>(router, brain.Stopping)) { await Ino.Fire(brain, "think"); }
```

`presence-turn.cs`: one synapse, one subscription — pick `TurnCompleted` on the assistant's main conversation neuron (copy the source key from `features/os/Assistant/projection-completed.cs`) and fire `speak` then, after `Task.Delay(TimeSpan.FromSeconds(2), brain.Stopping)`, `rest`. A second file `presence-turn-failed.cs` subscribes `TurnFailed` and fires `fail` then `rest` after 3 s. A third `presence-turn-started.cs` subscribes `TurnStarted` and fires `listen`.

`presence-ran.cs`: subscribes `BehaviorRan` on `microsoft.csharp.runs/{scope}/runs` (as `features/os/Memory/runs.cs`), skips runs of Ino's own synapses (behavior key starts with `Ino.Key(brain)`), fires `act`, and rebuilds the home scene's `items` from the last 12 runs (id = run id, label = behavior file name, kind = "behavior", progress = 1) through `Ino.Compose(brain, itemsJson)`.

`dock.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Client;
using DigitalBrain.Flame.Stage;

// When the assistant dispatches an operation to another app, that app's surface docks beside Ino.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var assistant = brain.Get<IApp>(Ino.Scope(brain) + "/apps/assistant");
var stage = brain.Get<IStage>(brain.Setting("Stage") ?? Ino.Scope(brain) + "/stage/owner");
await foreach (var dispatched in brain.On<AppDispatched>(assistant, brain.Stopping))
{
    if (dispatched.App == Ino.Key(brain) || dispatched.App.EndsWith("/apps/assistant", StringComparison.Ordinal)) { continue; }
    await stage.Go(Ino.HomeKey(brain), dispatched.App + "/surface");
}
```

If no `AppDispatched` signal exists on the Assistant app, subscribe instead to `Routed` and use `routed`'s chosen app key (read `features/os/Assistant/routed.cs` `Carry` for the field that names the app); the test scenario in `app.cs` stays the same.

- [ ] **Step 4: Compile-check through the feature gate and add the OS default**

Add `{ "publisher": "os", "name": "ino" }` to the OS defaults in `appsettings.json` (same shape as the existing entries). Run the fact that compile-checks `./features` (search `DigitalBrain.OS.Tests.Unit` and `DigitalBrain.Modules.Apps.Tests` for `FeatureCatalog`); Expected: green, Ino listed.

- [ ] **Step 5: Commit**

```bash
git add features/os/Ino src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/Stage/StageNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Flame/DigitalBrain.Modules.Flame/FlameEndpoints.cs src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/Stage/StageFacts.cs
git commit -m "OS: Ino is an app — a living sphere whose presence follows routes, turns and runs, and the stage's home"
```

---

### Task 10: The BrainView app

**Files:**
- Create: `features/os/BrainView/app.cs`, `features/os/BrainView/BrainView.cs`, `features/os/BrainView/open.cs`, `features/os/BrainView/selected.cs`, `features/os/BrainView/icon.svg`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json` (OS default `{ "publisher": "os", "name": "brainview" }`)

**Interfaces:**
- Consumes: `IScene`, `IStage`, `SceneInput`; `brain_graph` prefab parameters (Task 7); `ICard`, `ILayout`, `ISurface` from the Flutter vocabulary for the synapse panel; `BehaviorRan` for the run list.
- Produces: scene `{scope}/apps/brainview/scenes/brain` with one `brain_graph` node (`source=events`, `filter=apps`, `inputs=[tap]`); surface `{scope}/apps/brainview/surface` holding the selected synapse's card and its last runs.

- [ ] **Step 1: app.cs**

```csharp
/*
# BrainView

The brain as a living picture: every neuron a point on a slowly turning sphere, every subscription an edge,
every signal a pulse along it. Tapping a point selects it; the panel beside the picture shows the synapse's
last runs and the trace of each. The picture reads the brain's own activity stream; this app only composes
the scene and keeps the panel in step with the selection. Until the kernel activity projection lands, the
picture is built from behavior runs and says so in its title.

Inputs are plain text.
- open: composes the brain scene and the panel, and puts the scene on the stage with the panel docked.

## Scenario: Opening the brain view shows the picture

Invoking "open" composes the "brain" scene with a brain_graph node and the stage's top is that scene with
the panel surface docked.

## Scenario: Tapping a neuron fills the panel

A SceneInput with kind "tap" on the brain_graph node selects the neuron its payload names, and the panel
card's title is that neuron's key.
*/
using DigitalBrain.Apps;

static class App
{
    public const string Name = "brainview";
    public const string Version = "1.0.0";
    public static readonly AppManifest Manifest = new(
        Title: "Brain",
        Description: "See your brain think: neurons, subscriptions and live signals, down to one synapse's runs.",
        Operations: [new("open", "Compose the brain scene and put it on the stage.")],
        Settings: [], Slots: [], Icon: "icon.svg");
}
```

- [ ] **Step 2: `BrainView.cs`, `open.cs`, `selected.cs`**

`BrainView.cs`: `Key`, `Scope`, `SceneKey = Key + "/scenes/brain"`, `Compose(brain)` which sets the scene

```csharp
new SceneDefinition(
    [new("graph", "brain_graph", new Transform(), null,
        new() { ["source"] = "events", ["filter"] = "apps", ["layout"] = "sphere", ["title"] = "Behavior runs (kernel activity projection pending)" }, [], [], ["tap"])],
    [], new SceneCamera(), "#05080C")
```

and the panel surface (`ISurface` with a `column` layout of `ICard` `Key + "/cards/selected"` and `IText` `Key + "/runs"`), always rebuilt.

`open.cs`: on `open`, `Compose`, then `IStage.Go(SceneKey, Key + "/surface")` using the same stage key rule as Ino.

`selected.cs`: `await foreach (var input in brain.On<SceneInput>(brain.Get<IScene>(SceneKey), brain.Stopping))`; when `input.Kind == "tap"` and `input.Payload is { } neuronKey`, set the card to `(neuronKey, "Selected neuron")`, rebuild the scene with `["selected"] = neuronKey`, and write the last 10 `BehaviorRan` entries whose behavior key starts with `neuronKey` into the `IText` (one line each: file, outcome, duration, trace id) — read them through the runs neuron's read method (`features/os/Memory/runs.cs` shows the contract).

- [ ] **Step 3: Compile gate and OS default** — add the default; run the features compile fact; Expected: green.

- [ ] **Step 4: Commit**

```bash
git add features/os/BrainView src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json
git commit -m "OS: the brain view is an app — a turning sphere of neurons with pulses, and a panel for the selected synapse"
```

---

### Task 11: Live verification (controller)

**Files:** none; results go to the plan's ledger (`.superpowers/sdd/2026-10-11-flame-stage/progress.md` plus a committed note in `docs/superpowers/ledgers/2026-10-11-flame-stage.md`).

- [ ] **Step 1: Run the OS** from the worktree root: `dotnet run digitalbrain.cs`. `mcp__aspire__list_resources`: every resource Running/Healthy. If a peer AppHost is live on 5081, run isolated with other ports as the brain-as-data ledger describes.
- [ ] **Step 2: Through `digitalbrain-mcp`:** `neurons_context`; `neurons_list` contract `DigitalBrain.Flame.Scene.IScene` lists `owner/apps/ino/scenes/home` and `.../welcome` after `IApp.Request ["open",""]` on `owner/apps/ino`; `neurons_get` the home scene: `current.presence == "idle"`, nodes `ino` and `ring`. `neurons_call` `Fire ["think"]` → `current.presence == "thinking"`. `neurons_get` `DigitalBrain.Flame.Stage.IStage` `owner/stage/owner`: home is the Ino home scene.
- [ ] **Step 3: Dock:** ask the assistant (`IApp.Request ["send","open calculator"]` on `owner/apps/assistant`); the stage's top gains `dockSurfaceKey == owner/apps/calculator/surface`. `neurons_call` `Home []` → stack length 1.
- [ ] **Step 4: Brain view:** `IApp.Request ["open",""]` on `owner/apps/brainview`; the stage's top is the brain scene with the panel docked. `neurons_call` `Report ["graph","tap",0.5,0.5,"owner/apps/ino"]` → the panel card title becomes `owner/apps/ino`.
- [ ] **Step 5: Shell:** with the Flutter shell running (desktop or `flutter run -d chrome`), Ino's sphere is on screen, turns to the thinking look on a route, Escape returns home, the brain view shows points and pulses. Inspect through MCP, not Playwright.
- [ ] **Step 6: Telemetry:** `list_traces` shows `IScene.Set`, `IScene.Fire`, `IStage.Go`; `list_structured_logs` shows the Ino synapses' `BehaviorSubscribed` and `BehaviorRan` lines. Record every result.
- [ ] **Step 7: Regression net:** Flame, Flutter module, Apps, OS unit, Architecture (6 known) suites; `flutter test` in core, ui and shell.

---

### Task 12 (gate, after the brain-as-data complexity review): kernel activity projection

Not written yet by decision (spec D6/D7). When the complexity review has reported, add here: `IBrainActivity` per brain (bounded ring of 4096 events: source neuron, signal type, subscription hit or none, behavior run, duration, trace id) filled at the kernel's signal trace point; `brain_graph` `source=activity`; BrainView switches its title and filter. Until then BrainView runs on behavior runs and its title says so.

---

## Self-review notes

- Spec coverage: D1 (Tasks 6, 8), D2 (1–5), D3 (1, 6, 7), D4 (1, 3, 4), D5 (9), D6 (10 interim, 12 gate), D7 (Global Constraints). Welcome, Home, App, Brain scenes (8, 9, 10); Circle scene is only a stack entry and needs no task. Error handling: stale revision (2), unknown type placeholder (6), limits (2), stage pointing at a missing scene (8: `SceneView` renders a placeholder and `StageController.refresh` drops entries whose scene read fails with 404 — add that branch in Task 8 Step 3), reconnect (8: everything is re-read). Testing section: facts (2–5), ring fact (1), Flutter tests (6–8), live (11).
- Added beyond the spec sketch: `IScene.Report` (the shell has no other way to produce `SceneInput`), `IStage.SetHome`, the owner stage key `{brain}/stage/owner` (Task 9 ruling). Each is recorded where introduced.
- Type consistency checked: `SceneNode` positional order (Id, Type, Transform, Style, Parameters, Children, Tweens, Inputs) is used identically in Tasks 2, 9 and 10; `NodePatch` order (NodeId, Style, Parameters, Transform, Tweens) likewise.
