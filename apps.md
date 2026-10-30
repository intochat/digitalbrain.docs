# Apps (`App<TState>`)

In DigitalBrain, every application is a C# class decorated with `[App("<id>")]` and inheriting `App<TState>`.

## Anatomy of an `App<TState>`

1. **Typed Immutable State (`State` & `Set(next)`)**: `App<TState>` initializes `State = new TState()` and updates it via `Set(next)`.
2. **Automatic View Refresh (`Render()` & `RenderSide()`)**: After every `[On]` turn, the runtime automatically evaluates `Render()` (main view) and `RenderSide()` (optional side view) and publishes the resulting `DigitalBrain.UI.View`.
3. **Neuron Resolution (`Get<T>(key)`)**: Apps interact with neurons in their brain via `Get<T>(key)` (e.g., `Get<IMemory>("memory")`, `Get<IAspire>("aspire")`, `Get<IBdd>("bdd")`).
4. **Live Background Signal Subscriptions (`[On("sourceKey")]`)**: In addition to user-triggered operations (`[On]`), any `[On("sourceKey", Contract = typeof(ISourceContract))]` method whose parameter is a `Signal` automatically subscribes to live background signals from that neuron!

```csharp
[App("elon-tracker")]
public sealed class ElonTrackerApp : App<ElonTrackerState>
{
    // 1. User-invoked UI operation
    [On]
    public void Clear() => Set(new ElonTrackerState([]));

    // 2. Live background signal subscription from the "x.feed" neuron
    [On("x.feed", Contract = typeof(IXFeed))]
    public void OnPostReceived(XPostPublished post) =>
        Set(State with { Posts = [post, .. State.Posts] });

    // 3. Declarative UI view
    public View Render() => new(
        "Elon Tracker",
        new Collection(State.Posts.Select(p => new Entry(p.Id, p.Author, p.Text)).ToArray()));
}
```

## Rich Declarative UI Nodes (`UI.WebBrowser` & `UI.BrainScene`)

`DigitalBrain.UI` provides static `UI` and `Ui` builders for rich interactive surfaces:
- **`UI.WebBrowser(url, title, key, height, executionMode)` (`WebBrowserNode`)**: Embeds interactive WASM/Web studios (e.g., `PhotoCraft` at `http://localhost:18082` and `FilmCraft` at `http://localhost:18083`) with execution-mode badges (`wasm-ui`, `mcp`, `native-linux`).
- **`UI.BrainScene(nodes, edges, selectedId, key, pauseRotation, zoomTargetId, targetZoom)` (`BrainSceneNode`)**: Renders the interactive 3D neuron and synapse constellation with camera controls that pause orbital rotation and smoothly zoom to a selected or newly created app node.
