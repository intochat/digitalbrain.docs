# Shell as a Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shell becomes a desktop: one focused app fills the working area, the bottom bar is Home | the focused app's toolbar (the dock) | user and compute, Home is an overview of running apps, infrastructure health and the Marketplace, and the assistant island is nothing but the assistant app's own toolbar.

**Architecture:** `AppManifest` gains an optional `Toolbar` array validated against the app's `Operations` (C#, `DigitalBrain.Modules.Apps.Contracts`); the shipped-folder JSON round-trips it; the assistant and calculator manifests declare toolbars. The Aspire module exposes `GET /brains/{brainId}/infrastructure`, the join of `ModuleInventory` with `IAspire.ListResources`, because the shell speaks HTTP only. In Dart, `AppManifest`/`AppToolbarEntry`/`InfrastructureRow` mirror the C# records in `digitalbrain_flutter` (core); the shell gains `workspace/dock/dock.dart` (renders a toolbar, posts `AppRequested` through `DigitalBrainUiClient.requestApp`), `workspace/dock/assistant_island.dart` (the cat and the `text` kind), `workspace/home/infrastructure_strip.dart`, a `focusedWindow` on `WorkspaceStore`, a single-window `WorkspaceDesktop`, and a three-island `WorkspaceIslands`. The controls-position toggle, the side panel and the dock preference go away.

**Tech Stack:** .NET 11 RC / Orleans (xunit v3 facts over `ModuleTest.Create().WithModule<…>()`), Flutter 3 / Dart 3.13 (`flutter_test`), Aspire for running, `digitalbrain-mcp` for driving.

**Spec:** docs/superpowers/specs/2026-10-09-shell-desktop-design.md

## Global Constraints

- LSP for every C# and Dart symbol change: `goToDefinition`, `findReferences`, `incomingCalls` before editing; diagnostics clean before each build. Never grep for code.
- Build and test per project, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project> -- --filter-method "*Name*"`.
- Flutter: `flutter analyze` and `flutter test <file>` from `src/DigitalBrain.Modules/Google/Flutter/app/shell`.
- Warnings are errors, nullable on, central package versions. No `/// <summary>`; names carry meaning; comments only for what code cannot say.
- Tests are sentence-named facts; C# facts use `TestContext.Current.CancellationToken`; real grains over mocks.
- Grain state holds concrete arrays (`AppToolbarEntry[]?`), never `IReadOnlyList`.
- No state compatibility: reshape records freely, no migrations, no legacy shims. A reshaped grain state fails at activation as an Orleans `wireType` error: wipe the local Azurite volume, do not add shims.
- Commits: `git add` explicit files only (parallel sessions share the tree), never directories. Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- A task is done when its test passes and the project builds; the feature is done when the verification loop (last task) shows it running.
- Never raise a timeout or add polling to make a check pass. The strip's periodic refresh is product behavior (the same pattern as `ComputeUsagePanel`'s 30 s auto refresh), not a test aid.

## Review Focus

1. **`AppManifest` is a positional record with `[Id(5)] Icon` already; `Toolbar` is `[Id(6)] AppToolbarEntry[]? = null`.** Every write path (`Create`, `SaveManifest`, `CompleteBuild`, `Import`, `Replace`) must go through `Validated()` or a bad manifest lands in state. Pinned to Task 1, `AnAppRefusesAManifestWhoseToolbarNamesAnUnknownOperation`.
2. **Shipped JSON round trip.** `ShippedAppFolder.ToBundle` uses `JsonSerializerDefaults.Web` (camelCase, case-insensitive); `kind` is optional and defaults to `button`; `min`/`max` are numbers. `ToBundle` validates so a bad OS manifest fails at `Source.Load()`. Pinned to Task 1, `AShippedFolderCarriesItsToolbarThroughLoadAndSave`, and Task 2's OS facts.
3. **The join rule.** Aspire resource names come from `DigitalBrainBuilder.ResourceName` as `{Name}-{name}` (`Modules-postgres-server`); a module owns a resource when its id is a dash-separated segment of the name. `aspire` has no resource of its own: its row is the AppHost, `Running/Healthy` once anything has been reported, else `Unknown`. Pinned to Task 3, `ModulesJoinTheResourcesThatCarryTheirIdAndAspireIsTheAppHost`.
4. **The dock never waits.** A button posts `(operation, "")`, a toggle `"on"`/`"off"`, a slider the value as text on release only, a text field the typed text on submit and then clears. Pinned to Task 6, `each kind posts its operation with the input the spec names`.
5. **Focus derivation.** `focusedWindow` is the active window when it is open and not minimized, else the last visible one, else null; null means the assistant is the focused app (working area = its docked surface, dock = its toolbar). Home stays the start view when nothing is open; the Home island toggles the overview. Pinned to Task 7, `the focused window is the active open window, else the last visible one`, and Task 11's rewritten `assistant_app_test.dart`.

---

## Task 1: `AppManifest.Toolbar` with validation and shipped-JSON round trip

**Files**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppManifest.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/EmbeddedShippedAppSource.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppManifestFacts.cs` (create)

**Interfaces**
- Produces:
  ```csharp
  public static class AppToolbarKinds { Button = "button", Toggle = "toggle", Slider = "slider", Text = "text"; static readonly string[] All; }
  [GenerateSerializer, Alias("apps.toolbar-entry")]
  public sealed record AppToolbarEntry([property: Id(0)] string Operation, [property: Id(1)] string Kind = AppToolbarKinds.Button,
      [property: Id(2)] string? Icon = null, [property: Id(3)] string? Label = null, [property: Id(4)] double? Min = null, [property: Id(5)] double? Max = null);
  public sealed record AppManifest(…, [property: Id(5)] string? Icon = null, [property: Id(6)] AppToolbarEntry[]? Toolbar = null)
  { public AppManifest Validated(); }   // throws InvalidDataException
  ```
- Consumes: `AppNeuron.Create/SaveManifest/CompleteBuild/Import/Replace` (assign `next.Manifest`), `ShippedAppFolder.ToBundle/ToFiles`, `DirectoryShippedAppSource(string root, string publisher).Load()`.

**Steps**

- [ ] Write the failing facts in `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppManifestFacts.cs`:

```csharp
namespace DigitalBrain.Apps.Tests.Apps;

// The dock renders a manifest's toolbar; a manifest names only what its app can answer.
public sealed class AppManifestFacts
{
    private static AppManifest Manifest(params AppToolbarEntry[] toolbar)
        => new("Player", "plays", [new("play", "Play"), new("volume", "Set the volume")], [], [], Toolbar: toolbar);

    [Fact]
    public void AToolbarEntryMustNameADeclaredOperation()
    {
        var error = Assert.Throws<InvalidDataException>(() => Manifest(new("stop")).Validated());
        Assert.Contains("stop", error.Message, StringComparison.Ordinal);
        Assert.Contains("play", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AKindIsOneOfTheFourNamed()
    {
        Assert.Throws<InvalidDataException>(() => Manifest(new("play", Kind: "knob")).Validated());
        foreach (var kind in new[] { "button", "toggle", "text" })
        {
            var manifest = Manifest(new("play", Kind: kind));
            Assert.Same(manifest, manifest.Validated());
        }
    }

    [Fact]
    public void ASliderNeedsMinBelowMax()
    {
        Assert.NotNull(Manifest(new("volume", Kind: "slider", Min: 0, Max: 100)).Validated());
        Assert.Throws<InvalidDataException>(() => Manifest(new("volume", Kind: "slider", Min: 100, Max: 0)).Validated());
        Assert.Throws<InvalidDataException>(() => Manifest(new("volume", Kind: "slider")).Validated());
    }

    [Fact]
    public void AManifestWithoutAToolbarIsValid()
        => Assert.Null(new AppManifest("Echo", "echoes", [new("ask", "")], [], []).Validated().Toolbar);

    [Fact]
    public async Task AnAppRefusesAManifestWhoseToolbarNamesAnUnknownOperation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var app = brain.Get<IApp>(IApp.Key("manifest-facts", "player"));
        await app.Create(Manifest(new("play", Icon: "play", Label: "Play")), "spec");

        await Assert.ThrowsAsync<InvalidDataException>(() => app.SaveManifest(Manifest(new("stop")), Guid.NewGuid()));
        await Assert.ThrowsAsync<InvalidDataException>(() => app.Create(Manifest(new("stop")), "spec"));

        Assert.Equal("play", Assert.Single((await app.Read()).Manifest.Toolbar!).Operation);
    }

    [Fact]
    public void AShippedFolderCarriesItsToolbarThroughLoadAndSave()
    {
        var root = Directory.CreateTempSubdirectory("toolbar-manifest-").FullName;
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "player"));
            File.WriteAllText(Path.Combine(root, "player", "app.json"), """
                {"name":"player","title":"Player","description":"plays","version":"1.0.0",
                 "operations":[{"name":"play","description":"Play"},{"name":"volume","description":"Volume"}],
                 "settings":[],
                 "toolbar":[{"operation":"play","icon":"play","label":"Play"},
                            {"operation":"volume","kind":"slider","icon":"volume","min":0,"max":100}]}
                """);
            var bundle = Assert.Single(new DirectoryShippedAppSource(root, "vendor").Load());

            Assert.Equal([("play", "button", null), ("volume", "slider", 100d)],
                bundle.Manifest.Toolbar!.Select(entry => (entry.Operation, entry.Kind, entry.Max)));
            Assert.Contains("\"toolbar\"", ShippedAppFolder.ToFiles(bundle)["app.json"], StringComparison.Ordinal);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void AShippedFolderWithABadToolbarFailsToLoad()
    {
        var root = Directory.CreateTempSubdirectory("toolbar-bad-").FullName;
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "player"));
            File.WriteAllText(Path.Combine(root, "player", "app.json"), """
                {"name":"player","title":"Player","description":"plays","version":"1.0.0","operations":[],"settings":[],
                 "toolbar":[{"operation":"play"}]}
                """);
            Assert.Throws<InvalidDataException>(() => new DirectoryShippedAppSource(root, "vendor").Load());
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
```

  (Note the second `Create` in the grain fact: `Create` on an already created app throws `InvalidOperationException` before validation, so the fact targets `SaveManifest` for the state check and relies on `Create` of a *fresh* key being validated below — see the implementation; if `Create` after creation reaches the "already have an app" check first, replace that line with `brain.Get<IApp>(IApp.Key("manifest-facts", "other")).Create(Manifest(new("stop")), "spec")`.)

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*AppManifestFacts*"`. Expected: build failure `error CS0246: The type or namespace name 'AppToolbarEntry' could not be found`.

- [ ] Implement the records in `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppManifest.cs` (replace the `AppManifest` record; keep `AppOperation`, `AppSetting`, `AppSlot` as they are):

```csharp
public static class AppToolbarKinds
{
    public const string Button = "button";
    public const string Toggle = "toggle";
    public const string Slider = "slider";
    public const string Text = "text";
    public static readonly string[] All = [Button, Toggle, Slider, Text];
}

// One control in the dock: how an operation the app declares is shown, and what input it posts
// (a button "", a toggle "on"/"off", a slider its value as text on release, a text field its text on submit).
[GenerateSerializer, Alias("apps.toolbar-entry")]
public sealed record AppToolbarEntry(
    [property: Id(0)] string Operation,
    [property: Id(1)] string Kind = AppToolbarKinds.Button,
    [property: Id(2)] string? Icon = null,
    [property: Id(3)] string? Label = null,
    [property: Id(4)] double? Min = null,
    [property: Id(5)] double? Max = null);

[GenerateSerializer, Alias("apps.manifest2")]
public sealed record AppManifest(
    [property: Id(0)] string Title,
    [property: Id(1)] string Description,
    [property: Id(2)] AppOperation[] Operations,
    [property: Id(3)] AppSetting[] Settings,
    [property: Id(4)] AppSlot[] Slots,
    [property: Id(5)] string? Icon = null,
    [property: Id(6)] AppToolbarEntry[]? Toolbar = null)
{
    // The dock renders only what the app can answer: every entry names a declared operation with one of the four kinds.
    public AppManifest Validated()
    {
        foreach (var entry in Toolbar ?? [])
        {
            if (!Operations.Any(operation => operation.Name == entry.Operation))
            {
                throw new InvalidDataException($"Toolbar entry '{entry.Operation}' is not an operation of this app. It offers: "
                    + string.Join(", ", Operations.Select(operation => operation.Name)) + ".");
            }
            if (!AppToolbarKinds.All.Contains(entry.Kind, StringComparer.Ordinal))
            { throw new InvalidDataException($"Toolbar entry '{entry.Operation}' has kind '{entry.Kind}'; a kind is button, toggle, slider or text."); }
            if (entry.Kind == AppToolbarKinds.Slider && !(entry.Min < entry.Max))
            { throw new InvalidDataException($"Toolbar slider '{entry.Operation}' needs min below max."); }
        }
        return this;
    }
}
```

- [ ] In `AppNeuron.cs`, route every manifest assignment through `Validated()` (LSP `findReferences` on `AppState.Manifest` setter confirms these five sites):
  - `Create`: `next.Manifest = manifest.Validated();` (place before `next.BrainScopeId = BrainId();` so the "already have an app" check still runs first).
  - `SaveManifest`: `next.Manifest = manifest.Validated();`
  - `CompleteBuild`: inside `if (manifest is not null)`, `next.Manifest = manifest.Validated();`
  - `Import`: `next.Manifest = bundle.Manifest.Validated();`
  - `Replace`: `next.Manifest = bundle.Manifest.Validated();`

- [ ] In `EmbeddedShippedAppSource.cs` (`ShippedAppFolder`): add the JSON record, parse and write it, and validate on load:

```csharp
    internal static AppBundle ToBundle(string folder, IReadOnlyDictionary<string, string> files)
    {
        var manifestText = files.GetValueOrDefault(ManifestFile) ?? throw new InvalidDataException($"Shipped app {folder} has no {ManifestFile}.");
        var manifest = JsonSerializer.Deserialize<AppJson>(manifestText, Json) ?? throw new InvalidDataException($"{folder}/{ManifestFile} is empty.");
        var bundleFiles = files
            .Where(file => file.Key is not ManifestFile and not AppFiles.SpecPath)
            .ToDictionary(file => file.Key, file => file.Value, StringComparer.Ordinal);
        return new(manifest.Name, manifest.Version ?? "1.0.0",
            new AppManifest(
                manifest.Title,
                manifest.Description,
                [.. manifest.Operations.Select(operation => new AppOperation(operation.Name, operation.Description))],
                [.. manifest.Settings.Select(setting => new AppSetting(setting.Name, setting.Description, setting.Default))],
                [.. (manifest.Slots ?? []).Select(slot => new AppSlot(slot.Name, slot.Connector))],
                manifest.Icon,
                manifest.Toolbar is null ? null
                    : [.. manifest.Toolbar.Select(entry => new AppToolbarEntry(entry.Operation, entry.Kind ?? AppToolbarKinds.Button, entry.Icon, entry.Label, entry.Min, entry.Max))])
                .Validated(),
            files.GetValueOrDefault(AppFiles.SpecPath, ""),
            bundleFiles);
    }

    internal static Dictionary<string, string> ToFiles(AppBundle bundle)
    {
        var manifest = new AppJson(bundle.Name, bundle.Manifest.Title, bundle.Manifest.Description,
            [.. bundle.Manifest.Operations.Select(operation => new OperationJson(operation.Name, operation.Description))],
            [.. bundle.Manifest.Settings.Select(setting => new SettingJson(setting.Name, setting.Description, setting.Default))],
            bundle.Version,
            bundle.Manifest.Slots.Length == 0 ? null : [.. bundle.Manifest.Slots.Select(slot => new SlotJson(slot.Name, slot.Connector))],
            bundle.Manifest.Icon,
            bundle.Manifest.Toolbar is { Length: > 0 } toolbar
                ? [.. toolbar.Select(entry => new ToolbarJson(entry.Operation, entry.Kind, entry.Icon, entry.Label, entry.Min, entry.Max))]
                : null);
        // … unchanged below
    }

    private sealed record AppJson(string Name, string Title, string Description, IReadOnlyList<OperationJson> Operations, IReadOnlyList<SettingJson> Settings,
        string? Version = null, IReadOnlyList<SlotJson>? Slots = null, string? Icon = null, IReadOnlyList<ToolbarJson>? Toolbar = null);
    private sealed record ToolbarJson(string Operation, string? Kind, string? Icon, string? Label, double? Min, double? Max);
```

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*AppManifestFacts*"`. Expected: 7 passed.
- [ ] Run the whole Apps suite to catch the grain-state reshape: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`. Expected: all pass.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppManifest.cs src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/EmbeddedShippedAppSource.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppManifestFacts.cs
  git commit -m "Apps: a manifest declares a toolbar, validated against its operations

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 2: The assistant and calculator declare toolbars

**Files**
- Modify: `src/DigitalBrain.OS/Apps/Assistant/app.json`, `src/DigitalBrain.OS/Apps/Assistant/app.spec.md`
- Modify: `src/DigitalBrain.OS/Apps/Calculator/app.json`, `src/DigitalBrain.OS/Apps/Calculator/app.spec.md`
- Create: `src/DigitalBrain.OS/Apps/Calculator/synapses/clear.cs`
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsAssistantAppFacts.cs` (modify), `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCalculatorAppFacts.cs` (create)

**Interfaces**
- Consumes: `EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()`, `AppBundle.Manifest.Toolbar`, `brain.On<AppRequested>(IApp, CancellationToken)`, `IText.Set(string)`.
- Produces: assistant operations `open, send, new, voice`; toolbar `[{send,text},{voice,button,mic}]`; calculator operations `open, clear`; toolbar `[{clear,button,backspace,"Clear"}]`.

**Steps**

- [ ] Change the fact in `OsAssistantAppFacts.cs` and add the toolbar fact:

```csharp
        Assert.Equal(["open", "send", "new", "voice"], bundle.Manifest.Operations.Select(operation => operation.Name));
```
```csharp
    [Fact]
    public void TheAssistantToolbarIsATextFieldAndAVoiceButton()
    {
        var bundle = new EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()
            .Single(app => app.Name == "assistant");

        Assert.Equal([("send", "text", (string?)null), ("voice", "button", "mic")],
            bundle.Manifest.Toolbar!.Select(entry => (entry.Operation, entry.Kind, entry.Icon)));
    }
```

- [ ] Create `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCalculatorAppFacts.cs`:

```csharp
using DigitalBrain.Apps;

namespace DigitalBrain.OS.Tests.Unit;

public sealed class OsCalculatorAppFacts
{
    [Fact]
    public void TheCalculatorDeclaresAClearButtonAndTheSynapseThatAnswersIt()
    {
        var bundle = new EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()
            .Single(app => app.Name == "calculator");

        Assert.Equal(["open", "clear"], bundle.Manifest.Operations.Select(operation => operation.Name));
        var clear = Assert.Single(bundle.Manifest.Toolbar!);
        Assert.Equal(("clear", "button", "backspace", "Clear"), (clear.Operation, clear.Kind, clear.Icon, clear.Label));
        Assert.Contains("synapses/clear.cs", bundle.Files.Keys);
    }
}
```

- [ ] Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*OsAssistantAppFacts*"` and `… --filter-method "*OsCalculatorAppFacts*"`. Expected: both fail on `Assert.Equal` (operations are `["open","send","new"]` / `["open"]`, `Toolbar` is null).

- [ ] Replace `src/DigitalBrain.OS/Apps/Assistant/app.json`:

```json
{
  "name": "assistant",
  "title": "Assistant",
  "description": "Talk to your brain: ask questions, find capabilities and open what you need.",
  "version": "1.4.0",
  "icon": "icon.svg",
  "operations": [
    {
      "name": "open",
      "description": "Compose the assistant surface; input \"docked\" composes it for the working area without opening a window."
    },
    {
      "name": "send",
      "description": "Start a turn in the current conversation with this message; the transcript neuron shows the answer."
    },
    {
      "name": "new",
      "description": "Start a new conversation; the conversation neuron holds its id."
    },
    {
      "name": "voice",
      "description": "Begin a voice message from the dock; the composer neuron captures and transcribes it."
    }
  ],
  "settings": [
    {
      "name": "Model",
      "description": "Model catalog id; empty uses the deployment default.",
      "default": ""
    }
  ],
  "toolbar": [
    { "operation": "send", "kind": "text", "label": "Message your brain" },
    { "operation": "voice", "icon": "mic", "label": "Voice" }
  ]
}
```

- [ ] Append to `src/DigitalBrain.OS/Apps/Assistant/app.spec.md`, after the "Opening docked" scenario:

```markdown
## Scenario: The dock is the assistant's toolbar

The manifest's toolbar is a text field for "send" and a mic button for "voice". Submitting the
field posts "send" with the text; the transcript shows the answer. The shell renders this toolbar
as its assistant island; nothing in the shell is assistant-specific beyond the cat it draws beside it.
```

- [ ] Replace `src/DigitalBrain.OS/Apps/Calculator/app.json`:

```json
{
  "name": "calculator",
  "title": "Calculator",
  "description": "A keypad that evaluates arithmetic expressions.",
  "version": "1.1.0",
  "icon": "icon.svg",
  "operations": [
    {
      "name": "open",
      "description": "Open the calculator keypad."
    },
    {
      "name": "clear",
      "description": "Empty the display."
    }
  ],
  "settings": [],
  "toolbar": [
    { "operation": "clear", "icon": "backspace", "label": "Clear" }
  ]
}
```

- [ ] Create `src/DigitalBrain.OS/Apps/Calculator/synapses/clear.cs` (one reaction, like `Assistant/synapses/new.cs`):

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Flutter.Text;

// The dock's Clear button: the request empties the display, the same neuron every key press reads.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var display = brain.Get<IText>(appKey + "/display");
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "clear") { continue; }
    await display.Set("");
}
```

- [ ] Append to `src/DigitalBrain.OS/Apps/Calculator/app.spec.md`:

```markdown
## Scenario: Clear from the dock empties the display

The toolbar's Clear button posts "clear"; the display neuron becomes empty whatever it held.
```

- [ ] Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*OsAssistantAppFacts*"`, `… "*OsCalculatorAppFacts*"`, and `… "*EveryOsProgramCompilesAgainstCurrentContracts*"` (proves `clear.cs` compiles against the installed contracts). Expected: all pass.
- [ ] Commit:
  ```
  git add src/DigitalBrain.OS/Apps/Assistant/app.json src/DigitalBrain.OS/Apps/Assistant/app.spec.md src/DigitalBrain.OS/Apps/Calculator/app.json src/DigitalBrain.OS/Apps/Calculator/app.spec.md src/DigitalBrain.OS/Apps/Calculator/synapses/clear.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsAssistantAppFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCalculatorAppFacts.cs
  git commit -m "OS apps: the assistant and calculator declare their toolbars

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 3: `GET /brains/{brainId}/infrastructure` joins the inventory with Aspire resources

**Files**
- Create: `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Resources/InfrastructureView.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Resources/InfrastructureEndpoints.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/AspireModule.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/InfrastructureFacts.cs` (create)

**Interfaces**
- Consumes: `ModuleInventory.Modules` (`IReadOnlyList<Module>`, `Module.Id.Value`), `IAspire.ListResources(CancellationToken)` keyed by `AspireOptions.ApplicationName`, `AspireResource(Name, Type, State, Health, Urls)`, `BrainRoutes.Group(IEndpointRouteBuilder, string)`, `ModuleRouteGuard.Guard`.
- Produces:
  ```csharp
  public sealed record InfrastructureRow(string Module, string Resource, string State, string? Health);
  public static class InfrastructureView { public static IReadOnlyList<InfrastructureRow> Join(IEnumerable<string> moduleIds, IReadOnlyList<AspireResource> resources); }
  // HTTP: GET /brains/{brainId}/infrastructure → 200 [ { module, resource, state, health } ]
  ```

**Steps**

- [ ] Write `InfrastructureFacts.cs`:

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using DigitalBrain.Microsoft.Aspire;

namespace DigitalBrain.Modules.Microsoft.Aspire.Tests;

// What the brain stands on: each composed module with the AppHost resource that carries its id.
public sealed class InfrastructureFacts
{
    [Fact]
    public void ModulesJoinTheResourcesThatCarryTheirIdAndAspireIsTheAppHost()
    {
        var rows = InfrastructureView.Join(["postgres", "aspire", "clickhouse", "ai"],
        [
            new("Modules-postgres-server", "Container", "Running", "Healthy", []),
            new("Modules-postgres-database", "Database", "Running", null, []),
            new("Modules-clickhouse", "Container", "Exited", "Unhealthy", []),
            new("OperatingSystem", "Project", "Running", "Healthy", []),
        ]);

        Assert.Equal(
        [
            ("aspire", "apphost", "Running", "Healthy"),
            ("clickhouse", "Modules-clickhouse", "Exited", "Unhealthy"),
            ("postgres", "Modules-postgres-database", "Running", (string?)null),
            ("postgres", "Modules-postgres-server", "Running", "Healthy"),
        ], rows.Select(row => (row.Module, row.Resource, row.State, row.Health)));
    }

    [Fact]
    public void WithoutAnyReportTheAppHostIsUnknown()
        => Assert.Equal(("aspire", "Unknown", (string?)null),
            InfrastructureView.Join(["aspire"], []).Select(row => (row.Module, row.State, row.Health)).Single());

    [Fact]
    public async Task TheBrainRouteAnswersTheJoinedRows()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create()
            .WithModule<AspireModule>()
            .ConfigureModule<AspireModule, AspireOptions>(aspire => aspire.ApplicationName = "DigitalBrain")
            .WithHttpEdge()
            .StartAsync(ct);
        await brain.Grains.GetGrain<IAspireResourceReporter>("DigitalBrain")
            .Report(new("Modules-aspire-dashboard", "Container", "Running", "Healthy", []));

        var rows = await brain.HttpClient.GetFromJsonAsync<JsonElement>("/brains/ws-infra/infrastructure", ct);

        var aspire = Assert.Single(rows.EnumerateArray());
        Assert.Equal(("aspire", "apphost", "Running", "Healthy"),
            (aspire.GetProperty("module").GetString(), aspire.GetProperty("resource").GetString(),
             aspire.GetProperty("state").GetString(), aspire.GetProperty("health").GetString()));
    }
}
```

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests -- --filter-method "*InfrastructureFacts*"`. Expected: build failure `error CS0103: The name 'InfrastructureView' does not exist`.

- [ ] Create `Resources/InfrastructureView.cs`:

```csharp
namespace DigitalBrain.Microsoft.Aspire;

[GenerateSerializer, Alias("microsoft.aspire.infrastructure-row")]
public sealed record InfrastructureRow(
    [property: Id(0)] string Module,
    [property: Id(1)] string Resource,
    [property: Id(2)] string State,
    [property: Id(3)] string? Health);

// A module owns a resource when its id is a dash-separated segment of the resource's name
// ("Modules-postgres-server" belongs to "postgres": DigitalBrainBuilder.ResourceName joins with
// dashes). The aspire module's row is the AppHost itself: it has reported, or nothing is known.
public static class InfrastructureView
{
    public static IReadOnlyList<InfrastructureRow> Join(IEnumerable<string> moduleIds, IReadOnlyList<AspireResource> resources)
    {
        ArgumentNullException.ThrowIfNull(moduleIds);
        ArgumentNullException.ThrowIfNull(resources);
        var rows = new List<InfrastructureRow>();
        foreach (var module in moduleIds.Order(StringComparer.Ordinal))
        {
            if (module == "aspire")
            {
                rows.Add(resources.Count > 0 ? new(module, "apphost", "Running", "Healthy") : new(module, "apphost", "Unknown", null));
                continue;
            }
            foreach (var resource in resources
                .Where(resource => resource.Name.Split('-').Contains(module, StringComparer.OrdinalIgnoreCase))
                .OrderBy(resource => resource.Name, StringComparer.Ordinal))
            { rows.Add(new(module, resource.Name, resource.State, resource.Health)); }
        }
        return rows;
    }
}
```

- [ ] Create `Resources/InfrastructureEndpoints.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Modules;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Microsoft.Aspire;

// The shell's Home reads this: the composed modules joined with the AppHost's resource state.
internal static class InfrastructureEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        BrainRoutes.Group(endpoints, "/infrastructure").AddEndpointFilter(ModuleRouteGuard.Guard)
            .MapGet("", async ([FromServices] ModuleInventory inventory, [FromServices] IOptions<AspireOptions> options, IGrainFactory grains, CancellationToken ct) =>
            {
                var resources = await grains.GetGrain<IAspire>(options.Value.ApplicationName).ListResources(ct);
                return Results.Ok(InfrastructureView.Join(inventory.Modules.Select(module => module.Id.Value), resources));
            });
    }
}
```

- [ ] In `AspireModule.cs`, `Configure(IEndpointRouteBuilder endpoints)` becomes:

```csharp
    public void Configure(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        endpoints.MapAspireBridge();
        InfrastructureEndpoints.Map(endpoints);
    }
```

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests -- --filter-method "*InfrastructureFacts*"`. Expected: 3 passed. Then the whole Aspire suite: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests`. Expected: all pass.
- [ ] Build the architecture gate: `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`. Expected: pass (the Aspire module references only Framework; `ModuleInventory` is a Framework type).
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Resources/InfrastructureView.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Resources/InfrastructureEndpoints.cs src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/AspireModule.cs src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/InfrastructureFacts.cs
  git commit -m "Aspire: /brains/{id}/infrastructure joins the module inventory with resource state

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 4: Dart mirrors — `AppManifest`, `AppToolbarEntry`, `InfrastructureRow` and the client reads

**Files**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/app_manifest.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/infrastructure.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/digitalbrain_flutter.dart` (two `export` lines)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart` (`readAppManifest`, `readInfrastructure`)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/core/app_manifest_models_test.dart` (create)

**Interfaces**
- Consumes: `GET /brains/{b}/apps/{name}` → `{ name, manifest: { title, description, operations: [{name, description}], icon, toolbar: [{operation, kind, icon, label, min, max}] | null }, … }` (`AppsEndpoints.View`); `GET /brains/{b}/infrastructure` → `[{module, resource, state, health}]`; `DigitalBrainUiClient.jsonRequest(String method, String path, [Object? body])`.
- Produces:
  ```dart
  enum AppToolbarKind { button, toggle, slider, text; static AppToolbarKind parse(String? value) }
  class AppToolbarEntry { String operation; AppToolbarKind kind; String? icon, label; double? min, max; factory fromJson }
  class AppManifest { String title, description; List<String> operations; String? icon; List<AppToolbarEntry> toolbar; factory fromJson }
  class InfrastructureRow { String module, resource, state; String? health; factory fromJson }
  Future<AppManifest> DigitalBrainUiClient.readAppManifest(String brainId, String appId)
  Future<List<InfrastructureRow>> DigitalBrainUiClient.readInfrastructure(String brainId)
  ```

**Steps**

- [ ] Write `shell/test/core/app_manifest_models_test.dart`:

```dart
import 'dart:convert';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('a manifest carries its toolbar with kinds and slider bounds', () {
    final manifest = AppManifest.fromJson({
      'title': 'Player',
      'description': 'plays',
      'icon': 'icon.svg',
      'operations': [
        {'name': 'play', 'description': ''},
        {'name': 'volume', 'description': ''},
      ],
      'toolbar': [
        {'operation': 'play', 'icon': 'play', 'label': 'Play'},
        {'operation': 'volume', 'kind': 'slider', 'icon': 'volume', 'min': 0, 'max': 100},
      ],
    });
    expect(manifest.operations, ['play', 'volume']);
    expect(manifest.toolbar.map((entry) => entry.kind), [
      AppToolbarKind.button,
      AppToolbarKind.slider,
    ]);
    expect(manifest.toolbar.last.max, 100);
    expect(manifest.toolbar.first.label, 'Play');
  });

  test('a manifest without a toolbar has none', () {
    expect(
      AppManifest.fromJson({'title': 'Echo', 'operations': [], 'toolbar': null}).toolbar,
      isEmpty,
    );
    expect(AppToolbarKind.parse('knob'), AppToolbarKind.button);
  });

  test('the client reads a manifest from the app view', () async {
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async {
        expect(request.url.path, '/brains/b1/apps/player');
        return http.Response(
          jsonEncode({
            'name': 'player',
            'manifest': {
              'title': 'Player',
              'description': '',
              'operations': [
                {'name': 'play', 'description': ''},
              ],
              'toolbar': [
                {'operation': 'play'},
              ],
            },
          }),
          200,
        );
      }),
    );
    final manifest = await client.readAppManifest('b1', 'player');
    expect(manifest.toolbar.single.operation, 'play');
    client.close();
  });

  test('the client reads infrastructure rows', () async {
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async {
        expect(request.url.path, '/brains/b1/infrastructure');
        return http.Response(
          jsonEncode([
            {'module': 'postgres', 'resource': 'Modules-postgres-server', 'state': 'Running', 'health': 'Healthy'},
            {'module': 'aspire', 'resource': 'apphost', 'state': 'Unknown', 'health': null},
          ]),
          200,
        );
      }),
    );
    final rows = await client.readInfrastructure('b1');
    expect(rows.map((row) => row.module), ['postgres', 'aspire']);
    expect(rows.last.health, isNull);
    client.close();
  });
}
```

- [ ] Run from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter test test/core/app_manifest_models_test.dart`. Expected: compile error `Undefined class 'AppManifest'`.

- [ ] Create `core/lib/src/models/app_manifest.dart`:

```dart
// Mirrors DigitalBrain.Apps.AppManifest and AppToolbarEntry as the shell reads them from
// GET /brains/{brain}/apps/{name} under "manifest".

enum AppToolbarKind {
  button,
  toggle,
  slider,
  text;

  // The server validates kinds; an unknown one is wire drift and shows as a button.
  static AppToolbarKind parse(String? value) =>
      values.firstWhere((kind) => kind.name == value, orElse: () => button);
}

class AppToolbarEntry {
  const AppToolbarEntry({
    required this.operation,
    this.kind = AppToolbarKind.button,
    this.icon,
    this.label,
    this.min,
    this.max,
  });
  final String operation;
  final AppToolbarKind kind;
  final String? icon, label;
  final double? min, max;
  factory AppToolbarEntry.fromJson(Map<String, dynamic> json) =>
      AppToolbarEntry(
        operation: json['operation'] as String,
        kind: AppToolbarKind.parse(json['kind'] as String?),
        icon: json['icon'] as String?,
        label: json['label'] as String?,
        min: (json['min'] as num?)?.toDouble(),
        max: (json['max'] as num?)?.toDouble(),
      );
}

class AppManifest {
  const AppManifest({
    required this.title,
    required this.description,
    required this.operations,
    this.icon,
    this.toolbar = const [],
  });
  final String title, description;
  final List<String> operations;
  final String? icon;
  final List<AppToolbarEntry> toolbar;
  factory AppManifest.fromJson(Map<String, dynamic> json) => AppManifest(
    title: json['title'] as String? ?? '',
    description: json['description'] as String? ?? '',
    operations: [
      for (final operation in json['operations'] as List? ?? const [])
        Map<String, dynamic>.from(operation as Map)['name'] as String,
    ],
    icon: json['icon'] as String?,
    toolbar: [
      for (final entry in json['toolbar'] as List? ?? const [])
        AppToolbarEntry.fromJson(Map<String, dynamic>.from(entry as Map)),
    ],
  );
}
```

- [ ] Create `core/lib/src/models/infrastructure.dart`:

```dart
// Mirrors DigitalBrain.Microsoft.Aspire.InfrastructureRow: a module and the Aspire resource it stands on.
class InfrastructureRow {
  const InfrastructureRow({
    required this.module,
    required this.resource,
    required this.state,
    this.health,
  });
  final String module, resource, state;
  final String? health;
  factory InfrastructureRow.fromJson(Map<String, dynamic> json) =>
      InfrastructureRow(
        module: json['module'] as String,
        resource: json['resource'] as String,
        state: json['state'] as String? ?? 'Unknown',
        health: json['health'] as String?,
      );
}
```

- [ ] In `core/lib/digitalbrain_flutter.dart` add, among the model exports:

```dart
export 'src/models/app_manifest.dart';
export 'src/models/infrastructure.dart';
```

- [ ] In `core/lib/src/ui_client.dart`, after `listInstalledApps` (and add `import 'models/app_manifest.dart';` and `import 'models/infrastructure.dart';` beside the existing model imports):

```dart
  /// The manifest an app declares, read from the same view its detail page uses.
  Future<AppManifest> readAppManifest(String brainId, String appId) async {
    final body = await jsonRequest(
      'GET',
      '/brains/${Uri.encodeComponent(brainId)}/apps/${Uri.encodeComponent(appId)}',
    );
    return AppManifest.fromJson(
      Map<String, dynamic>.from((body as Map)['manifest'] as Map),
    );
  }

  /// What the brain stands on: each composed module with its Aspire resource state.
  Future<List<InfrastructureRow>> readInfrastructure(String brainId) async {
    final body = await jsonRequest(
      'GET',
      '/brains/${Uri.encodeComponent(brainId)}/infrastructure',
    );
    return [
      for (final row in body as List)
        InfrastructureRow.fromJson(Map<String, dynamic>.from(row as Map)),
    ];
  }
```

- [ ] Run: `flutter test test/core/app_manifest_models_test.dart`. Expected: 4 passed. Then `flutter analyze` from `app/shell` and from `app/core`. Expected: no issues.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/app_manifest.dart src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/models/infrastructure.dart src/DigitalBrain.Modules/Google/Flutter/app/core/lib/digitalbrain_flutter.dart src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/core/app_manifest_models_test.dart
  git commit -m "Shell core: AppManifest, AppToolbarEntry and InfrastructureRow mirror the C# records

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 5: The shell's icon vocabulary for toolbar entries

**Files**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/app_icon.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/app_icon_test.dart` (modify)

**Interfaces**
- Produces: `IconData? shellIcon(String name)` — the named set a manifest's `icon` may use; `null` for anything else (a bundle path).

**Steps**

- [ ] Add to `test/app_icon_test.dart` inside `main()`:

```dart
  test('toolbar icon names resolve to the shell icon set, paths do not', () {
    expect(shellIcon('play'), Icons.play_arrow_rounded);
    expect(shellIcon('mic'), Icons.mic_rounded);
    expect(shellIcon('backspace'), Icons.backspace_outlined);
    expect(shellIcon('icon.svg'), isNull);
  });
```

- [ ] Run: `flutter test test/app_icon_test.dart`. Expected: `The function 'shellIcon' isn't defined`.

- [ ] Add to `lib/workspace/home/app_icon.dart` after the `IconLoader` typedef:

```dart
// The dock's icon vocabulary: a toolbar entry names one of these or a file in its bundle.
IconData? shellIcon(String name) => switch (name) {
  'play' => Icons.play_arrow_rounded,
  'pause' => Icons.pause_rounded,
  'stop' => Icons.stop_rounded,
  'mic' => Icons.mic_rounded,
  'send' => Icons.send_rounded,
  'volume' => Icons.volume_up_rounded,
  'backspace' => Icons.backspace_outlined,
  'clear' => Icons.clear_rounded,
  'add' => Icons.add_rounded,
  'refresh' => Icons.refresh_rounded,
  'search' => Icons.search_rounded,
  'settings' => Icons.settings_outlined,
  'home' => Icons.home_outlined,
  _ => null,
};
```

- [ ] Run: `flutter test test/app_icon_test.dart`. Expected: 4 passed.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/app_icon.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/app_icon_test.dart
  git commit -m "Shell: the icon names a toolbar entry may use

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 6: The dock and the assistant island

**Files**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/dock/assistant_island.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/dock/dock.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/dock_test.dart` (create)

**Interfaces**
- Consumes: `AppManifest`, `AppToolbarEntry`, `AppToolbarKind` (Task 4); `shellIcon`, `AppIcon(title:, path:, load:, size:)`, `IconLoader` (`app_icon.dart`).
- Produces:
  ```dart
  typedef DockRequest = Future<void> Function(String operation, String input);
  class Dock extends StatelessWidget { Dock({required String app, required AppManifest manifest, required DockRequest onRequest, IconLoader? loadIcon, String? iconRoute}); }
  class AssistantCat extends StatelessWidget;                       // key 'assistant-cat'
  class DockTextField extends StatefulWidget { DockTextField({required String hint, required ValueChanged<String> onSubmit}); }
  ```
  Entry keys: `ValueKey('dock-{operation}')`.

**Steps**

- [ ] Write `test/dock_test.dart`:

```dart
import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:digitalbrain_flutter_shell/workspace/dock/assistant_island.dart';
import 'package:digitalbrain_flutter_shell/workspace/dock/dock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const player = AppManifest(
  title: 'Player',
  description: 'plays',
  operations: ['play', 'mute', 'volume', 'say'],
  toolbar: [
    AppToolbarEntry(operation: 'play', icon: 'play', label: 'Play'),
    AppToolbarEntry(operation: 'mute', kind: AppToolbarKind.toggle, label: 'Mute'),
    AppToolbarEntry(operation: 'volume', kind: AppToolbarKind.slider, min: 0, max: 100),
    AppToolbarEntry(operation: 'say', kind: AppToolbarKind.text, label: 'Say'),
  ],
);

const assistant = AppManifest(
  title: 'Assistant',
  description: '',
  operations: ['open', 'send', 'new', 'voice'],
  toolbar: [
    AppToolbarEntry(operation: 'send', kind: AppToolbarKind.text, label: 'Message your brain'),
    AppToolbarEntry(operation: 'voice', icon: 'mic', label: 'Voice'),
  ],
);

Widget host(String app, AppManifest manifest, List<(String, String)> posted) =>
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Dock(
            app: app,
            manifest: manifest,
            onRequest: (operation, input) async => posted.add((operation, input)),
          ),
        ),
      ),
    );

void main() {
  testWidgets('each kind posts its operation with the input the spec names', (
    tester,
  ) async {
    final posted = <(String, String)>[];
    await tester.pumpWidget(host('player', player, posted));

    await tester.tap(find.byKey(const ValueKey('dock-play')));
    await tester.tap(find.byKey(const ValueKey('dock-mute')));
    await tester.pump();
    expect(posted, [('play', ''), ('mute', 'on')]);

    await tester.drag(find.byKey(const ValueKey('dock-volume')), const Offset(60, 0));
    await tester.pumpAndSettle();
    expect(posted, hasLength(3));
    expect(posted[2].$1, 'volume');
    expect(double.parse(posted[2].$2), greaterThan(0));

    await tester.enterText(find.byKey(const ValueKey('dock-say')), 'hello');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(posted.last, ('say', 'hello'));
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, '');
    expect(find.byKey(const ValueKey('assistant-cat')), findsNothing);
  });

  testWidgets('an empty submit posts nothing', (tester) async {
    final posted = <(String, String)>[];
    await tester.pumpWidget(host('player', player, posted));
    await tester.enterText(find.byKey(const ValueKey('dock-say')), '   ');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect(posted, isEmpty);
  });

  testWidgets('the assistant toolbar is the assistant island: the cat, then its entries', (
    tester,
  ) async {
    final posted = <(String, String)>[];
    await tester.pumpWidget(host('assistant', assistant, posted));

    expect(find.byKey(const ValueKey('assistant-cat')), findsOneWidget);
    expect(find.byType(DockTextField), findsOneWidget);
    expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
    final cat = tester.getTopLeft(find.byKey(const ValueKey('assistant-cat')));
    final field = tester.getTopLeft(find.byType(DockTextField));
    final mic = tester.getTopLeft(find.byKey(const ValueKey('dock-voice')));
    expect(cat.dx, lessThan(field.dx));
    expect(field.dx, lessThan(mic.dx));

    await tester.tap(find.byKey(const ValueKey('dock-voice')));
    expect(posted, [('voice', '')]);
  });
}
```

- [ ] Run: `flutter test test/dock_test.dart`. Expected: `Target of URI doesn't exist: 'package:digitalbrain_flutter_shell/workspace/dock/dock.dart'`.

- [ ] Create `lib/workspace/dock/assistant_island.dart`:

```dart
import 'package:flutter/material.dart';

// The cat: the assistant's face in the middle of the dock. The rest of the island is the
// assistant app's own toolbar, rendered by the dock like any other.
class AssistantCat extends StatelessWidget {
  const AssistantCat({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: CircleAvatar(
        key: const ValueKey('assistant-cat'),
        radius: 16,
        backgroundColor: scheme.primaryContainer,
        child: Icon(Icons.pets_rounded, size: 18, color: scheme.onPrimaryContainer),
      ),
    );
  }
}

// The text kind: one line; submit posts the trimmed text and clears the field.
class DockTextField extends StatefulWidget {
  const DockTextField({super.key, required this.hint, required this.onSubmit});

  final String hint;
  final ValueChanged<String> onSubmit;

  @override
  State<DockTextField> createState() => _DockTextFieldState();
}

class _DockTextFieldState extends State<DockTextField> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    widget.onSubmit(trimmed);
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 360,
    child: TextField(
      controller: _controller,
      decoration: InputDecoration(
        hintText: widget.hint,
        isDense: true,
        border: const OutlineInputBorder(),
      ),
      textInputAction: TextInputAction.send,
      onSubmitted: _submit,
    ),
  );
}
```

- [ ] Create `lib/workspace/dock/dock.dart`:

```dart
import 'dart:async';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter/material.dart';

import '../home/app_icon.dart';
import 'assistant_island.dart';

typedef DockRequest = Future<void> Function(String operation, String input);

// The focused app's toolbar. Every entry posts the app a request and waits for nothing: the
// app's answer is neuron state its surface shows.
class Dock extends StatelessWidget {
  const Dock({
    super.key,
    required this.app,
    required this.manifest,
    required this.onRequest,
    this.loadIcon,
    this.iconRoute,
  });

  final String app;
  final AppManifest manifest;
  final DockRequest onRequest;
  final IconLoader? loadIcon;
  // The route serving the app's own icon file; an entry naming that file renders it.
  final String? iconRoute;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (app == 'assistant') const AssistantCat(),
      for (final entry in manifest.toolbar)
        _DockEntry(
          key: ValueKey('dock-entry-${entry.operation}'),
          entry: entry,
          manifestIcon: manifest.icon,
          iconRoute: iconRoute,
          loadIcon: loadIcon,
          onRequest: onRequest,
        ),
    ],
  );
}

class _DockEntry extends StatefulWidget {
  const _DockEntry({
    super.key,
    required this.entry,
    required this.onRequest,
    this.manifestIcon,
    this.iconRoute,
    this.loadIcon,
  });

  final AppToolbarEntry entry;
  final DockRequest onRequest;
  final String? manifestIcon, iconRoute;
  final IconLoader? loadIcon;

  @override
  State<_DockEntry> createState() => _DockEntryState();
}

class _DockEntryState extends State<_DockEntry> {
  bool _on = false;
  double? _value;

  AppToolbarEntry get entry => widget.entry;
  String get label => entry.label ?? entry.operation;

  void _post(String input) => unawaited(widget.onRequest(entry.operation, input));

  Widget _icon() {
    final name = entry.icon;
    final data = name == null ? null : shellIcon(name);
    if (data != null) return Icon(data, size: 22);
    if (name != null && name == widget.manifestIcon && widget.iconRoute != null) {
      return AppIcon(
        title: label,
        path: widget.iconRoute,
        load: widget.loadIcon,
        size: 22,
      );
    }
    return Text(label);
  }

  static String _text(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toString();

  @override
  Widget build(BuildContext context) {
    final min = entry.min ?? 0, max = entry.max ?? 1;
    return switch (entry.kind) {
      AppToolbarKind.button => IconButton(
        key: ValueKey('dock-${entry.operation}'),
        tooltip: label,
        onPressed: () => _post(''),
        icon: _icon(),
      ),
      AppToolbarKind.toggle => Tooltip(
        message: label,
        child: Switch(
          key: ValueKey('dock-${entry.operation}'),
          value: _on,
          onChanged: (value) {
            setState(() => _on = value);
            _post(value ? 'on' : 'off');
          },
        ),
      ),
      AppToolbarKind.slider => SizedBox(
        width: 140,
        child: Slider(
          key: ValueKey('dock-${entry.operation}'),
          min: min,
          max: max,
          value: (_value ?? min).clamp(min, max),
          label: label,
          onChanged: (value) => setState(() => _value = value),
          onChangeEnd: (value) => _post(_text(value)),
        ),
      ),
      AppToolbarKind.text => DockTextField(
        key: ValueKey('dock-${entry.operation}'),
        hint: label,
        onSubmit: _post,
      ),
    };
  }
}
```

- [ ] Run: `flutter test test/dock_test.dart`. Expected: 3 passed. `flutter analyze`: no issues.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/dock/dock.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/dock/assistant_island.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/dock_test.dart
  git commit -m "Shell: the dock renders a manifest's toolbar; the assistant island is the assistant's toolbar

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 7: `WorkspaceStore.focusedWindow` and `appOfWindow`

**Files**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_focus_test.dart` (create)

**Interfaces**
- Produces:
  ```dart
  String? appOfWindow(String windowId);          // 'calculator' for 'brain-1/apps/calculator/window', else null
  String? get WorkspaceStore.focusedWindow;      // active & visible, else last visible, else null
  ```
- Consumes: `WorkspacePresentation.openArtifactIds/minimizedArtifactIds/activeArtifactId`, `openArtifact`, `focusWindow`, `minimizeArtifact`, `closeArtifact`, `addArtifact`.

**Steps**

- [ ] Write `test/workspace_focus_test.dart`:

```dart
import 'package:digitalbrain_flutter_shell/workspace/workspace_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('the focused window is the active open window, else the last visible one', () {
    final store = WorkspaceStore(persistence: MemoryWorkspacePersistence());
    expect(store.focusedWindow, isNull);
    store.addArtifact(
      WorkspaceArtifact(id: 'b/apps/calculator/window', title: 'Calculator', kind: 'surface'),
    );
    store.addArtifact(
      WorkspaceArtifact(id: 'b/apps/assistant/window', title: 'Assistant', kind: 'surface'),
    );
    store.openArtifact('b/apps/calculator/window');
    store.openArtifact('b/apps/assistant/window');
    expect(store.focusedWindow, 'b/apps/assistant/window');

    store.focusWindow('b/apps/calculator/window');
    expect(store.focusedWindow, 'b/apps/calculator/window');

    store.minimizeArtifact('b/apps/calculator/window');
    expect(store.focusedWindow, 'b/apps/assistant/window');

    store.closeArtifact('b/apps/assistant/window');
    expect(store.focusedWindow, isNull);
    store.dispose();
  });

  test('a window id names its app', () {
    expect(appOfWindow('brain-1/apps/calculator/window'), 'calculator');
    expect(appOfWindow('account-x/ws/apps/assistant/window'), 'assistant');
    expect(appOfWindow('app-csharp'), isNull);
    expect(appOfWindow('brain-1/apps/calculator/surface'), isNull);
  });
}
```

- [ ] Run: `flutter test test/workspace_focus_test.dart`. Expected: `The getter 'focusedWindow' isn't defined`.

- [ ] In `workspace_store.dart`, add after the top-level helpers (`_map`, `_strings`, `_text`):

```dart
/// The app that owns a window keyed {brain}/apps/{name}/window; null for any other window.
String? appOfWindow(String windowId) =>
    RegExp(r'^.+/apps/([^/]+)/window$').firstMatch(windowId)?.group(1);
```

  and in `WorkspaceStore`, after `currentConversation`:

```dart
  /// The one window the desktop shows: the active window when it is open and not minimized,
  /// otherwise the most recently opened one that is. Null means the assistant is the focused app.
  String? get focusedWindow {
    final p = currentProject.presentation;
    final visible = p.openArtifactIds
        .where((id) => !p.minimizedArtifactIds.contains(id))
        .toList();
    if (visible.isEmpty) return null;
    final active = p.activeArtifactId;
    return active != null && visible.contains(active) ? active : visible.last;
  }
```

- [ ] Run: `flutter test test/workspace_focus_test.dart`. Expected: 2 passed.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_focus_test.dart
  git commit -m "Shell store: focusedWindow and appOfWindow

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 8: The desktop shows exactly one window

**Files**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_desktop.dart` (rewrite)
- Delete: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_window_drag_test.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_desktop_test.dart` (create)

**Interfaces**
- Consumes: `WorkspaceStore.focusedWindow`, `WorkspaceStore.closeArtifact(String)`, `WorkspaceArtifact`, `uiArtifactIcon(String kind)` (`digitalbrain_ui`).
- Produces: `WorkspaceDesktop({required WorkspaceStore store, required Widget Function(WorkspaceArtifact) editorBuilder, Object? Function(WorkspaceArtifact)? editorStateToken})` — the same constructor; renders the focused window only, keyed `window-{id}`, with a close button keyed `window-close-{id}`. `workspaceWindowRect`, drag, resize, snap, minimize and maximize controls are removed (LSP `findReferences` on `workspaceWindowRect` shows no user outside this file and the deleted test).

**Steps**

- [ ] Delete `test/workspace_window_drag_test.dart` (`git rm src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_window_drag_test.dart`) and write `test/workspace_desktop_test.dart`:

```dart
import 'package:digitalbrain_flutter_shell/workspace/workspace_desktop.dart';
import 'package:digitalbrain_flutter_shell/workspace/workspace_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('the desktop shows only the focused window and close closes it', (
    tester,
  ) async {
    final store = WorkspaceStore(persistence: MemoryWorkspacePersistence());
    store.addArtifact(
      WorkspaceArtifact(id: 'note', title: 'Notes', kind: 'document'),
    );
    store.addArtifact(
      WorkspaceArtifact(id: 'plan', title: 'Plan', kind: 'document'),
    );
    store.openArtifact('note');
    store.openArtifact('plan');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListenableBuilder(
            listenable: store,
            builder: (_, _) => WorkspaceDesktop(
              store: store,
              editorBuilder: (artifact) => Text('editor ${artifact.title}'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('editor Plan'), findsOneWidget);
    expect(find.text('editor Notes'), findsNothing);
    expect(find.byKey(const ValueKey('window-drag-plan')), findsNothing);

    store.focusWindow('note');
    await tester.pumpAndSettle();
    expect(find.text('editor Notes'), findsOneWidget);
    expect(find.text('editor Plan'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('window-close-note')));
    await tester.pumpAndSettle();
    expect(find.text('editor Plan'), findsOneWidget);
    expect(store.currentProject.presentation.openArtifactIds, ['plan']);

    await tester.tap(find.byKey(const ValueKey('window-close-plan')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('desktop-empty')), findsOneWidget);
    store.dispose();
  });

  testWidgets('an editor keeps its identity while its window stays focused', (
    tester,
  ) async {
    final store = WorkspaceStore(persistence: MemoryWorkspacePersistence());
    store.addArtifact(
      WorkspaceArtifact(id: 'note', title: 'Notes', kind: 'document'),
    );
    store.openArtifact('note');
    var builds = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListenableBuilder(
            listenable: store,
            builder: (_, _) => WorkspaceDesktop(
              store: store,
              editorBuilder: (artifact) {
                builds++;
                return Text(artifact.title);
              },
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final before = builds;
    store.save();
    await tester.pumpAndSettle();
    expect(builds, before);
    store.dispose();
  });
}
```

- [ ] Run: `flutter test test/workspace_desktop_test.dart`. Expected: the first fact fails at `expect(find.text('editor Notes'), findsNothing)` (today both windows are in the stack) or at `find.byKey(const ValueKey('desktop-empty'))`.

- [ ] Replace `lib/workspace/workspace_desktop.dart` with:

```dart
import 'package:digitalbrain_ui/digitalbrain_ui.dart';
import 'package:flutter/material.dart';

import 'workspace_store.dart';

// The working area: exactly one window, the focused one, filling it. Every other open window is
// "running" and reachable from Home. Chrome is the title bar and close; the editor keeps its
// identity while its content changes.
class WorkspaceDesktop extends StatefulWidget {
  const WorkspaceDesktop({
    super.key,
    required this.store,
    required this.editorBuilder,
    this.editorStateToken,
  });
  final WorkspaceStore store;
  final Widget Function(WorkspaceArtifact) editorBuilder;
  final Object? Function(WorkspaceArtifact)? editorStateToken;
  @override
  State<WorkspaceDesktop> createState() => _WorkspaceDesktopState();
}

class _WorkspaceDesktopState extends State<WorkspaceDesktop> {
  WorkspaceStore get store => widget.store;

  Object _editorToken(WorkspaceArtifact artifact) => Object.hash(
    artifact.title,
    artifact.kind,
    artifact.content,
    artifact.data['_dirty'],
    artifact.data['_revision'],
    widget.editorStateToken?.call(artifact),
  );

  @override
  Widget build(BuildContext context) {
    final id = store.focusedWindow;
    final artifact = id == null
        ? null
        : store.currentProject.artifacts.where((a) => a.id == id).firstOrNull;
    if (artifact == null) {
      return const SizedBox.shrink(key: ValueKey('desktop-empty'));
    }
    final colors = Theme.of(context).colorScheme;
    return Material(
      key: ValueKey('window-${artifact.id}'),
      color: colors.surfaceContainerLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: colors.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          SizedBox(
            height: 44,
            child: Row(
              children: [
                const SizedBox(width: 12),
                Icon(
                  uiArtifactIcon(artifact.kind),
                  size: 17,
                  color: colors.onSurfaceVariant,
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(
                    artifact.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                IconButton(
                  key: ValueKey('window-close-${artifact.id}'),
                  tooltip: 'Close window',
                  onPressed: () => store.closeArtifact(artifact.id),
                  icon: const Icon(Icons.close, size: 16),
                  style: IconButton.styleFrom(
                    minimumSize: const Size(32, 40),
                    padding: const EdgeInsets.all(7),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                const SizedBox(width: 3),
              ],
            ),
          ),
          Divider(height: 1, color: colors.outlineVariant.withValues(alpha: .6)),
          Expanded(
            child: RepaintBoundary(
              child: _PinnedEditor(
                token: _editorToken(artifact),
                builder: () => widget.editorBuilder(artifact),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PinnedEditor extends StatefulWidget {
  const _PinnedEditor({required this.token, required this.builder});
  final Object token;
  final Widget Function() builder;
  @override
  State<_PinnedEditor> createState() => _PinnedEditorState();
}

class _PinnedEditorState extends State<_PinnedEditor> {
  late Widget _child = widget.builder();
  @override
  void reassemble() {
    super.reassemble();
    _child = widget.builder();
  }

  @override
  void didUpdateWidget(_PinnedEditor old) {
    super.didUpdateWidget(old);
    if (old.token != widget.token) _child = widget.builder();
  }

  @override
  Widget build(BuildContext context) => _child;
}
```

- [ ] Run: `flutter test test/workspace_desktop_test.dart`. Expected: 2 passed. `flutter analyze`: no issues (the `dart:math` import and `workspaceWindowRect` are gone with the file).
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_desktop.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_desktop_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_window_drag_test.dart
  git commit -m "Shell desktop: one focused window fills the working area

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 9: Home is the overview — running apps with live previews

**Files**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/home_screen_test.dart` (add one fact)

**Interfaces**
- Produces:
  ```dart
  class RunningApp { const RunningApp({required String windowId, required String app, required String title}); }
  HomeScreen({…existing…, List<RunningApp> running = const [], ValueChanged<String>? onFocus, ValueChanged<String>? onStop,
              Widget Function(RunningApp app)? surfaceBuilder, Widget? infrastructure});
  ```
  Keys: `home-running`, `running-{app}`, `stop-{app}`, `home-infrastructure`. Order: Running → Infrastructure → My apps → Marketplace.
- Consumes: `AppIcon`, `_Tile` (unchanged).

**Steps**

- [ ] Add to `test/home_screen_test.dart` inside `main()`:

```dart
  testWidgets('running apps come first with a live preview; tap focuses, close stops', (
    tester,
  ) async {
    final server = _FakeHome();
    final focused = <String>[], stopped = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeScreen(
            workspaceId: 'b1',
            request: server.request,
            onOpen: (_) async {},
            running: const [
              RunningApp(
                windowId: 'b1/apps/calculator/window',
                app: 'calculator',
                title: 'Calculator',
              ),
            ],
            surfaceBuilder: (app) =>
                Text('surface of ${app.app}', key: ValueKey('preview-${app.app}')),
            onFocus: focused.add,
            onStop: stopped.add,
            infrastructure: const Text(
              'strip',
              key: ValueKey('fake-strip'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final running = tester.getTopLeft(find.byKey(const ValueKey('home-running')));
    final strip = tester.getTopLeft(find.byKey(const ValueKey('home-infrastructure')));
    final myApps = tester.getTopLeft(find.byKey(const ValueKey('home-my-apps')));
    expect(running.dy, lessThan(strip.dy));
    expect(strip.dy, lessThan(myApps.dy));
    expect(find.byKey(const ValueKey('preview-calculator')), findsOneWidget);
    expect(find.byKey(const ValueKey('fake-strip')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('stop-calculator')));
    expect(stopped, ['b1/apps/calculator/window']);
    await tester.tap(find.text('Calculator'));
    expect(focused, ['b1/apps/calculator/window']);
  });
```

- [ ] Run: `flutter test test/home_screen_test.dart`. Expected: `No named parameter with the name 'running'`.

- [ ] In `home_screen.dart`, add after `LocalApp`:

```dart
// A window of an app neuron, open in this brain: what Home shows as running.
class RunningApp {
  const RunningApp({
    required this.windowId,
    required this.app,
    required this.title,
  });
  final String windowId, app, title;
}
```

  Extend the `HomeScreen` constructor and fields (keep every existing parameter except `dock`/`onDock`, which Task 11 removes; leave them for now):

```dart
    this.running = const [],
    this.onFocus,
    this.onStop,
    this.surfaceBuilder,
    this.infrastructure,
```
```dart
  final List<RunningApp> running;
  final ValueChanged<String>? onFocus, onStop;
  // A small, non-interactive render of the app's surface for its tile.
  final Widget Function(RunningApp app)? surfaceBuilder;
  final Widget? infrastructure;
```

  In `build`, insert before the `Text('My apps', …)` child:

```dart
        if (widget.running.isNotEmpty) ...[
          Text(
            'Running',
            key: const ValueKey('home-running'),
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [
              for (final app in widget.running)
                _RunningTile(
                  key: ValueKey('running-${app.app}'),
                  app: app,
                  icon: AppIcon(
                    title: app.title,
                    path:
                        '/brains/$_brain/apps/${Uri.encodeComponent(app.app)}/icon',
                    load: widget.loadIcon,
                    size: 28,
                  ),
                  preview: widget.surfaceBuilder?.call(app),
                  onTap: () => widget.onFocus?.call(app.windowId),
                  onStop: () => widget.onStop?.call(app.windowId),
                ),
            ],
          ),
          const SizedBox(height: 32),
        ],
        if (widget.infrastructure != null) ...[
          Text(
            'Infrastructure',
            key: const ValueKey('home-infrastructure'),
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          widget.infrastructure!,
          const SizedBox(height: 32),
        ],
```

  Add the tile widget at the end of the file:

```dart
class _RunningTile extends StatelessWidget {
  const _RunningTile({
    super.key,
    required this.app,
    required this.icon,
    required this.onTap,
    required this.onStop,
    this.preview,
  });

  final RunningApp app;
  final Widget icon;
  final Widget? preview;
  final VoidCallback onTap, onStop;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 260,
    height: 200,
    child: Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 44,
              child: Row(
                children: [
                  const SizedBox(width: 10),
                  icon,
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      app.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  IconButton(
                    key: ValueKey('stop-${app.app}'),
                    tooltip: 'Stop',
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: onStop,
                  ),
                ],
              ),
            ),
            Expanded(
              child: IgnorePointer(
                child: ExcludeSemantics(
                  child: preview == null
                      ? const SizedBox.shrink()
                      : FittedBox(
                          fit: BoxFit.cover,
                          alignment: Alignment.topLeft,
                          clipBehavior: Clip.hardEdge,
                          child: SizedBox(width: 720, height: 480, child: preview),
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
```

- [ ] Run: `flutter test test/home_screen_test.dart`. Expected: 5 passed.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/home_screen_test.dart
  git commit -m "Shell Home: running apps with live previews, an infrastructure slot, the Marketplace below

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 10: The infrastructure strip

**Files**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/infrastructure_strip.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/infrastructure_strip_test.dart` (create)

**Interfaces**
- Consumes: `InfrastructureRow` (Task 4); the connections list as `GET /brains/{b}/connections` answers it: `[{connectorId, connectionId, authMethodId, status, …}]` with `status` one of `Connected|Expired|Failing|Disconnected` (the same values `connect_window.dart`'s `connectionStatus` switches on).
- Produces:
  ```dart
  enum InfrastructureHealth { green, amber, red }
  InfrastructureHealth infrastructureHealth(String state, String? health);
  Color infrastructureColor(InfrastructureHealth health);
  class InfrastructureStrip extends StatefulWidget {
    InfrastructureStrip({required Future<List<InfrastructureRow>> Function() load,
                        Future<Object?> Function()? loadConnections, ValueChanged<String>? onTap,
                        Duration refreshEvery = const Duration(seconds: 5)});
  }
  ```
  Keys: `infra-{module}-{resource}` (chip), `infra-dot-{module}-{resource}` (the colored `CircleAvatar`), `infrastructure-error`.

**Steps**

- [ ] Write `test/infrastructure_strip_test.dart`:

```dart
import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:digitalbrain_flutter_shell/workspace/home/infrastructure_strip.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('health is green when healthy or connected, amber while unknown, red when down', () {
    expect(infrastructureHealth('Running', 'Healthy'), InfrastructureHealth.green);
    expect(infrastructureHealth('Connected', null), InfrastructureHealth.green);
    expect(infrastructureHealth('Starting', null), InfrastructureHealth.amber);
    expect(infrastructureHealth('Running', null), InfrastructureHealth.amber);
    expect(infrastructureHealth('Unknown', null), InfrastructureHealth.amber);
    expect(infrastructureHealth('Running', 'Unhealthy'), InfrastructureHealth.red);
    expect(infrastructureHealth('Exited', null), InfrastructureHealth.red);
    expect(infrastructureHealth('FailedToStart', null), InfrastructureHealth.red);
    expect(infrastructureHealth('Disconnected', null), InfrastructureHealth.red);
    expect(infrastructureHealth('Failing', null), InfrastructureHealth.red);
  });

  testWidgets('the strip shows a chip per resource and connection, refreshes, and a tap names the module', (
    tester,
  ) async {
    var state = 'Running';
    final tapped = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: InfrastructureStrip(
            refreshEvery: const Duration(milliseconds: 100),
            load: () async => [
              InfrastructureRow(
                module: 'postgres',
                resource: 'Modules-postgres-server',
                state: state,
                health: state == 'Running' ? 'Healthy' : null,
              ),
            ],
            loadConnections: () async => [
              {'connectorId': 'gmail', 'connectionId': 'me', 'status': 'Connected'},
            ],
            onTap: tapped.add,
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byKey(const ValueKey('infra-postgres-Modules-postgres-server')), findsOneWidget);
    expect(find.byKey(const ValueKey('infra-gmail-connection me')), findsOneWidget);
    CircleAvatar dot() => tester.widget(
      find.byKey(const ValueKey('infra-dot-postgres-Modules-postgres-server')),
    );
    expect(dot().backgroundColor, Colors.green);

    state = 'Exited';
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pump();
    expect(dot().backgroundColor, Colors.red);

    await tester.tap(find.byKey(const ValueKey('infra-postgres-Modules-postgres-server')));
    expect(tapped, ['postgres']);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a failed load says so', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: InfrastructureStrip(
            load: () async => throw StateError('kernel unreachable'),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('infrastructure-error')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
```

- [ ] Run: `flutter test test/infrastructure_strip_test.dart`. Expected: `Target of URI doesn't exist: '…/infrastructure_strip.dart'`.

- [ ] Create `lib/workspace/home/infrastructure_strip.dart`:

```dart
import 'dart:async';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter/material.dart';

enum InfrastructureHealth { green, amber, red }

// Aspire health decides first, then state. A connection row carries its status as the state.
InfrastructureHealth infrastructureHealth(String state, String? health) {
  if (health == 'Healthy' || state == 'Connected') return InfrastructureHealth.green;
  if (health == 'Unhealthy' ||
      state == 'Exited' ||
      state == 'FailedToStart' ||
      state == 'Stopped' ||
      state == 'Disconnected' ||
      state == 'Failing') {
    return InfrastructureHealth.red;
  }
  return InfrastructureHealth.amber;
}

Color infrastructureColor(InfrastructureHealth health) => switch (health) {
  InfrastructureHealth.green => Colors.green,
  InfrastructureHealth.amber => Colors.amber,
  InfrastructureHealth.red => Colors.red,
};

// One chip per module resource and per user connection, colored by health, re-read on an
// interval: the registry's state changes under us (ResourceStateChanged) and the shell has no
// signal stream for it, so the strip reads like ComputeUsagePanel does.
class InfrastructureStrip extends StatefulWidget {
  const InfrastructureStrip({
    super.key,
    required this.load,
    this.loadConnections,
    this.onTap,
    this.refreshEvery = const Duration(seconds: 5),
  });

  final Future<List<InfrastructureRow>> Function() load;
  final Future<Object?> Function()? loadConnections;
  final ValueChanged<String>? onTap;
  final Duration refreshEvery;

  @override
  State<InfrastructureStrip> createState() => _InfrastructureStripState();
}

class _InfrastructureStripState extends State<InfrastructureStrip> {
  List<InfrastructureRow> _rows = const [];
  String? _error;
  Timer? _refresh;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _refresh = Timer.periodic(widget.refreshEvery, (_) => unawaited(_load()));
  }

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await widget.load();
      final connections = await widget.loadConnections?.call();
      if (!mounted) return;
      setState(() {
        _rows = [
          ...rows,
          for (final item in connections as List? ?? const [])
            InfrastructureRow(
              module: '${(item as Map)['connectorId']}',
              resource: 'connection ${item['connectionId']}',
              state: '${item['status']}',
            ),
        ];
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 12,
    runSpacing: 12,
    children: [
      if (_error != null)
        Text(
          _error!,
          key: const ValueKey('infrastructure-error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      for (final row in _rows)
        ActionChip(
          key: ValueKey('infra-${row.module}-${row.resource}'),
          avatar: CircleAvatar(
            key: ValueKey('infra-dot-${row.module}-${row.resource}'),
            radius: 5,
            backgroundColor: infrastructureColor(
              infrastructureHealth(row.state, row.health),
            ),
          ),
          label: Text(row.module),
          tooltip:
              '${row.resource}: ${row.state}${row.health == null ? '' : ' (${row.health})'}',
          onPressed: widget.onTap == null ? null : () => widget.onTap!(row.module),
        ),
    ],
  );
}
```

- [ ] Run: `flutter test test/infrastructure_strip_test.dart`. Expected: 3 passed. `flutter analyze`: no issues.
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/infrastructure_strip.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/infrastructure_strip_test.dart
  git commit -m "Shell Home: the infrastructure strip, one chip per resource and connection, colored by health

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 11: Three islands, the dock wired, and the controls toggle, side panel and dock preference removed

**Files**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_islands.dart` (rewrite)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart` (drop `dockTop`, `assistantRight`, `dock`, `chatCollapsed`, `chatWidth`, `toggleChat`, `setChatWidth`)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_settings.dart` (drop the two switches)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart` (drop `dock`, `onDock`)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/app_detail_screen.dart` (drop `dock`, `onDock`, `_dock`, `_toggleDock`, the `dock-app` button)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/application_fixture.dart`, `test/assistant_app_test.dart`, `test/app_detail_screen_test.dart`, `test/workspace_app_shell_test.dart` (create)

**Interfaces**
- Produces:
  ```dart
  WorkspaceIslands({required WorkspaceStore store, required Widget dock, required VoidCallback onNewWorkspace, onSavedWork, onSearch, onSettings, onHome,
                    VoidCallback? onConfiguration, onCompute; Future<void> Function()? onSwitchAccount; bool home = false});
  ```
  Left island: the Home button (tooltip `Home`, key `home-island`). Center: `dock`. Right: Compute, Search, Settings (wide), Profile menu (display name, Switch account, each workspace as a checked item, New workspace, Saved work, Settings, Workspace configuration).
- Consumes: `Dock`, `DockTextField` (Task 6), `AppManifest` + `DigitalBrainUiClient.readAppManifest/requestApp/openDockedApp/readInfrastructure/workspaceConnectionsRequest` (Task 4), `WorkspaceStore.focusedWindow`/`appOfWindow` (Task 7), `HomeScreen.running/onFocus/onStop/surfaceBuilder/infrastructure` (Task 9), `InfrastructureStrip` (Task 10), `ConnectWindow({required ConnectionsRequest request, ConnectionsRequest? connectorRequest, String? initialConnectorId, Future<void> Function(Uri)? onOpen})`, `NeuronView(kind:, name:, load:, enabled:)`.

**Steps**

- [ ] Update the test fixture. In `test/application_fixture.dart` add, after `assistantSummary`:

```dart
/// GET /brains/{b}/apps/assistant: the view the dock reads its toolbar from.
const assistantView = {
  'name': 'assistant',
  'manifest': {
    'title': 'Assistant',
    'description': 'Chat with your brain',
    'icon': null,
    'operations': [
      {'name': 'open', 'description': ''},
      {'name': 'send', 'description': ''},
      {'name': 'new', 'description': ''},
      {'name': 'voice', 'description': ''},
    ],
    'toolbar': [
      {'operation': 'send', 'kind': 'text', 'label': 'Message your brain'},
      {'operation': 'voice', 'icon': 'mic', 'label': 'Voice'},
    ],
  },
};
```

  In `ApplicationServer.send`, before the `/apps` list branch:

```dart
    if (request.url.path.endsWith('/apps/assistant')) {
      return _json(assistantView);
    }
    if (request.url.path.endsWith('/infrastructure')) {
      return _json(const [
        {'module': 'aspire', 'resource': 'apphost', 'state': 'Running', 'health': 'Healthy'},
      ]);
    }
    if (request.url.path.endsWith('/connections')) {
      return _json(const <Object>[]);
    }
```

  Change `ApplicationFixture.start` to drop the `dock` parameter: `static Future<ApplicationFixture> start(WidgetTester tester) async { final server = ApplicationServer(); final store = WorkspaceStore(persistence: MemoryWorkspacePersistence()); …` (the rest unchanged). Update the doc comment above the class to "The shell started against the fake kernel, with one workspace; Home is the start view, the dock is the assistant island."

- [ ] Rewrite `test/assistant_app_test.dart`'s first fact and the two docking facts (keep the two `openApp` facts as they are):

```dart
  testWidgets('with nothing open, Home is in front and the dock is the assistant island', (
    tester,
  ) async {
    final fixture = await ApplicationFixture.start(tester);

    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-cat')), findsOneWidget);
    expect(find.byType(DockTextField), findsOneWidget);
    expect(find.byType(ApplicationSurface), findsNothing);
    expect(fixture.server.requestsTo('/brains/${fixture.brainId}/apps/assistant/request'), isEmpty);

    // Submitting the island's field posts "send" to the assistant; nothing waits for an answer.
    await tester.enterText(find.byType(DockTextField), 'hello');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    final sent = fixture.server.requestsTo('/brains/${fixture.brainId}/apps/assistant/request').single;
    expect((sent.body['operation'], sent.body['input']), ('send', 'hello'));
    await fixture.dispose();
  });

  testWidgets('pressing Home with nothing open shows the assistant, the default focused app', (
    tester,
  ) async {
    final fixture = await ApplicationFixture.start(tester);
    await tester.tap(find.byTooltip('Home'));
    await tester.pumpAndSettle();

    expect(find.byType(HomeScreen), findsNothing);
    expect(find.byType(ApplicationSurface), findsOneWidget);
    final opened = fixture.server.requestsTo('/brains/${fixture.brainId}/apps/assistant/request').single;
    expect((opened.body['operation'], opened.body['input']), ('open', 'docked'));
    expect(fixture.renderedSurface, '${fixture.brainId}/apps/assistant/surface');
    expect(find.byTooltip('Side panel'), findsNothing);
    await fixture.dispose();
  });

  test('preferences no longer carry a dock, controls position or side panel side', () {
    final json = WorkspacePreferences().toJson();
    expect(json.containsKey('dock'), isFalse);
    expect(json.containsKey('dockTop'), isFalse);
    expect(json.containsKey('assistantRight'), isFalse);
  });
```
  Add `import 'package:digitalbrain_flutter_shell/workspace/dock/assistant_island.dart';` and `import 'package:digitalbrain_flutter_shell/workspace/home/home_screen.dart';` at the top; remove the now-unused `MockClient`/`http`/`jsonEncode` imports if nothing else in the file uses them.

- [ ] Write `test/workspace_app_shell_test.dart` (the dock follows the focused window; Home lists it as running):

```dart
import 'package:digitalbrain_flutter_shell/workspace/dock/assistant_island.dart';
import 'package:digitalbrain_flutter_shell/workspace/home/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'application_fixture.dart';

void main() {
  testWidgets('a focused app without a toolbar leaves the assistant island in the dock', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1600, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final fixture = await ApplicationFixture.start(tester);

    await fixture.openApp('assistant');
    expect(fixture.store.focusedWindow, '${fixture.brainId}/apps/assistant/window');
    expect(find.byKey(const ValueKey('assistant-cat')), findsOneWidget);
    expect(find.byType(DockTextField), findsOneWidget);

    await tester.tap(find.byTooltip('Home'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('running-assistant')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('stop-assistant')));
    await tester.pumpAndSettle();
    expect(
      fixture.server.requestsTo('/brains/${fixture.brainId}/windows/${fixture.brainId}/apps/assistant/window/close'),
      isNotEmpty,
    );
    await fixture.dispose();
  });
}
```
  (The close route is whatever `DigitalBrainUiClient.closeWorkspaceWindow` posts; read it with LSP `goToDefinition` on `closeWorkspaceWindow` and put that exact path in the assertion before running.)

- [ ] In `test/app_detail_screen_test.dart` delete the fact `an installed openable app can be docked and undocked`.

- [ ] Run: `flutter test test/assistant_app_test.dart test/workspace_app_shell_test.dart`. Expected: compile errors (`DockTextField` not rendered by `WorkspaceApp`, `start` still takes `dock`, preferences still carry `dock`).

- [ ] Rewrite `lib/workspace/workspace_islands.dart`:

```dart
import 'dart:ui';

import 'package:flutter/material.dart';

import 'workspace_store.dart';

// The bottom bar: Home | the dock | user and compute. The dock is the focused app's toolbar,
// handed in by the workspace; nothing here knows what it holds.
class WorkspaceIslands extends StatelessWidget {
  const WorkspaceIslands({
    super.key,
    required this.store,
    required this.dock,
    required this.onNewWorkspace,
    required this.onSavedWork,
    required this.onSearch,
    required this.onSettings,
    required this.onHome,
    this.onConfiguration,
    this.onCompute,
    this.onSwitchAccount,
    this.home = false,
  });
  final WorkspaceStore store;
  final Widget dock;
  final VoidCallback onNewWorkspace, onSavedWork, onSearch, onSettings, onHome;
  final VoidCallback? onCompute, onConfiguration;
  final Future<void> Function()? onSwitchAccount;
  final bool home;

  Widget island(BuildContext context, Widget child) => ClipRRect(
    borderRadius: BorderRadius.circular(19),
    child: BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withValues(alpha: .9),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant
                .withValues(alpha: .45),
          ),
          borderRadius: BorderRadius.circular(19),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: .14),
              blurRadius: 24,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          child: child,
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final narrow = c.maxWidth < 900;
      final project = store.currentProject;
      final homeIsland = island(
        context,
        IconButton(
          key: const Key('home-island'),
          tooltip: 'Home',
          onPressed: onHome,
          icon: Icon(
            Icons.apps_rounded,
            size: 23,
            color: home ? Theme.of(context).colorScheme.primary : null,
          ),
        ),
      );
      final account = island(
        context,
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              key: const Key('compute-usage-button'),
              tooltip: 'Compute',
              onPressed: onCompute,
              icon: const Icon(Icons.speed_outlined, size: 18),
            ),
            IconButton(
              tooltip: 'Search',
              onPressed: onSearch,
              icon: const Icon(Icons.search, size: 21),
            ),
            if (!narrow)
              IconButton(
                tooltip: 'Settings',
                onPressed: onSettings,
                icon: const Icon(Icons.settings_outlined, size: 20),
              ),
            PopupMenuButton<String>(
              tooltip: 'Profile',
              position: PopupMenuPosition.over,
              icon: CircleAvatar(
                radius: 14,
                backgroundColor: Theme.of(context).colorScheme.primary
                    .withValues(alpha: .15),
                child: Icon(
                  Icons.person_outline,
                  size: 18,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
              onSelected: (value) {
                switch (value) {
                  case 'switch-account':
                    onSwitchAccount?.call();
                  case 'settings':
                    onSettings();
                  case 'configuration':
                    onConfiguration?.call();
                  case 'new':
                    onNewWorkspace();
                  case 'saved':
                    onSavedWork();
                  default:
                    store.selectProject(value);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  enabled: false,
                  child: Text(
                    store.settings.displayName.isEmpty
                        ? 'Personal account'
                        : store.settings.displayName,
                  ),
                ),
                const PopupMenuDivider(),
                if (onSwitchAccount != null)
                  const PopupMenuItem(
                    value: 'switch-account',
                    child: ListTile(
                      leading: Icon(Icons.switch_account_outlined),
                      title: Text('Switch account'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                for (final p in store.projects)
                  CheckedPopupMenuItem(
                    value: p.id,
                    checked: p.id == project.id,
                    child: Text(p.title),
                  ),
                const PopupMenuItem(value: 'new', child: Text('New workspace')),
                const PopupMenuItem(value: 'saved', child: Text('Saved work')),
                const PopupMenuDivider(),
                const PopupMenuItem(value: 'settings', child: Text('Settings')),
                if (onConfiguration != null)
                  const PopupMenuItem(
                    value: 'configuration',
                    child: Text('Workspace configuration'),
                  ),
              ],
            ),
          ],
        ),
      );
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            homeIsland,
            Flexible(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: island(context, dock),
                ),
              ),
            ),
            account,
          ],
        ),
      );
    },
  );
}
```

- [ ] In `workspace_store.dart`: in `WorkspacePresentation` delete the fields `chatCollapsed`, `chatWidth`, their `toJson` entries and their `fromJson` lines; in `WorkspaceStore` delete `toggleChat` and `setChatWidth`, and in `load()` delete the line `project.presentation.chatCollapsed = false;`. In `WorkspacePreferences` delete `dockTop`, `assistantRight`, `dock`, their `toJson` entries and their `fromJson` cascades (and the `// The installed app shown in the side panel.` comment). LSP `findReferences` on each deleted member must show only `workspace_app.dart`, `workspace_islands.dart`, `workspace_settings.dart` and tests touched in this task.

- [ ] In `workspace_settings.dart` delete the two `SwitchListTile`s titled `'Dock at top'` and `'Side panel on the right'`.

- [ ] In `home_screen.dart` delete the `dock` and `onDock` parameters/fields and their two uses inside `_details(...)`. In `app_detail_screen.dart` delete the `dock`/`onDock` parameters and fields, `late String _dock`, `_toggleDock`, and the `OutlinedButton` keyed `dock-app`.

- [ ] In `workspace_app.dart`:
  1. Add imports `import 'dock/dock.dart';` and `import 'home/infrastructure_strip.dart';`.
  2. Delete the field `bool … _mobileWork` (keep `_ready`, `_directory`), and add:
     ```dart
       final _manifests = <String, Future<AppManifest>>{};

       Future<AppManifest> _manifest(DigitalBrainUiClient client, String brain, String app) =>
           _manifests['$brain/$app'] ??= client.readAppManifest(brain, app);

       // The dock shows the focused app's toolbar. Without a focused window, or when the focused
       // app declares no toolbar, it shows the assistant's: the assistant is the default focused app.
       Future<(String, AppManifest)> _dockOf(DigitalBrainUiClient client, String brain, String? focused) async {
         final app = focused == null ? null : appOfWindow(focused);
         if (app != null) {
           final manifest = await _manifest(client, brain, app);
           if (manifest.toolbar.isNotEmpty) return (app, manifest);
         }
         return ('assistant', await _manifest(client, brain, 'assistant'));
       }

       Widget _dock(BuildContext context) {
         final client = widget.programmingClient;
         if (client == null) return const SizedBox(width: 40, height: 40);
         final project = store.currentProject;
         final focused = store.focusedWindow;
         return FutureBuilder<(String, AppManifest)>(
           key: ValueKey('dock-${project.id}-${focused ?? 'assistant'}'),
           future: _dockOf(client, project.id, focused),
           builder: (context, snapshot) {
             final shown = snapshot.data;
             if (shown == null) return const SizedBox(width: 40, height: 40);
             final (app, manifest) = shown;
             return Dock(
               app: app,
               manifest: manifest,
               loadIcon: client.readBytes,
               iconRoute:
                   '/brains/${Uri.encodeComponent(project.id)}/apps/${Uri.encodeComponent(app)}/icon',
               onRequest: (operation, input) =>
                   client.requestApp(project.id, app, operation, input),
             );
           },
         );
       }
     ```
  3. Replace `_work`:
     ```dart
       // The working area: the focused window, or the assistant's docked surface when nothing is open.
       Widget _work(BuildContext context) {
         final client = widget.programmingClient;
         final project = store.currentProject;
         if (store.focusedWindow == null) {
           if (client == null) {
             return const Center(child: Text('Open something from Home.'));
           }
           return ApplicationSurface(
             key: ValueKey('${project.id}/assistant'),
             client: client,
             workspace: project.id,
             application: 'assistant',
             start: () => client.openDockedApp(project.id, 'assistant'),
             onActivate: (result) => _accept(result),
           );
         }
         return WorkspaceDesktop(
           key: ValueKey('desktop-${project.id}'),
           store: store,
           editorBuilder: _pane,
           editorStateToken: (artifact) => Object.hash(
             _tables[artifact.id],
             _tableErrors[artifact.id],
             artifact.data['selected'],
             artifact.data['refresh'],
           ),
         );
       }
     ```
  4. Delete `_dockedApp` and replace `_workspace` with `Widget _workspace(BuildContext context) => _main(context);`.
  5. In `_homeScreen()` delete `dock:`/`onDock:` and add:
     ```dart
           running: [
             for (final id in project.presentation.openArtifactIds)
               if (appOfWindow(id) case final app?)
                 RunningApp(
                   windowId: id,
                   app: app,
                   title: project.artifacts.where((a) => a.id == id).firstOrNull?.title ?? app,
                 ),
           ],
           surfaceBuilder: client == null
               ? null
               : (app) => NeuronView(
                   kind: 'surface',
                   name: app.windowId.replaceFirst(RegExp(r'/window$'), '/surface'),
                   load: (kind, name) => client.appRequest(
                     project.id,
                     'node?${Uri(queryParameters: {'kind': kind, 'name': name}).query}',
                   ),
                   enabled: false,
                 ),
           onFocus: (id) {
             store.focusWindow(id);
             setState(() => _homeChoice = false);
           },
           onStop: store.closeArtifact,
           infrastructure: client == null
               ? null
               : InfrastructureStrip(
                   load: () => client.readInfrastructure(project.id),
                   loadConnections: () => client.workspaceConnectionsRequest(project.id, ''),
                   onTap: (module) => _openConnections(context, module),
                 ),
     ```
     and in `onAppsChanged` add `_manifests.clear();` before `_loadApps(project.id);`. Give `_homeScreen` a `BuildContext context` parameter and pass it from `_main`.
  6. Add:
     ```dart
       void _openConnections(BuildContext context, String module) {
         final request = _connectionsRequest;
         if (request == null) return;
         showDialog<void>(
           context: context,
           builder: (dialogContext) => Dialog(
             clipBehavior: Clip.antiAlias,
             child: SizedBox(
               width: 560,
               height: 520,
               child: ConnectWindow(
                 request: request,
                 connectorRequest: _connectorRequest,
                 initialConnectorId: module,
                 onOpen: widget.onOpenUrl,
               ),
             ),
           ),
         );
       }
     ```
  7. In `build`, replace the two conditional `_islands(context)` lines with a single `_islands(context)` after the `Expanded`. In `_islands`, delete `sidePanel:` and `onRestore:` and add `dock: _dock(context)`.
  8. In `_openCompute`, the dialog becomes `alignment: Alignment.bottomRight, insetPadding: const EdgeInsets.only(left: 12, right: 12, top: 12, bottom: 76)`.
  9. In `_openApplication`, after `_accept(...)`, add `_manifests.remove('${project.id}/$application');` so an edited manifest is re-read the next time its app is focused.

- [ ] Run LSP diagnostics on `workspace_app.dart`, `workspace_store.dart`, `workspace_settings.dart`, `home_screen.dart`, `app_detail_screen.dart`; then `flutter analyze`. Expected: no issues.
- [ ] Run: `flutter test test/assistant_app_test.dart test/workspace_app_shell_test.dart test/app_detail_screen_test.dart test/navigation_actions_test.dart test/local_app_shell_test.dart test/settings_redesign_test.dart test/workspace_app_open_test.dart test/core/workspace_models_test.dart`. Expected: all pass (`navigation_actions_test` still finds `Home` and `Profile` → `Switch account`; on a phone width the side-panel segment is gone, so delete its `if (width < 760) { tap 'Workspace' }` block).
- [ ] Commit:
  ```
  git add src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_islands.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_settings.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/home/app_detail_screen.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/application_fixture.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/assistant_app_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/app_detail_screen_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_app_shell_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/navigation_actions_test.dart
  git commit -m "Shell: Home | dock | account; the side panel, controls toggle and dock preference are gone

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 12: Whole-shell analyze and test

**Files**
- Test: every file under `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/` and `src/DigitalBrain.Modules/Google/Flutter/app/core`.

**Interfaces**
- Consumes: everything above. Produces nothing new.

**Steps**

- [ ] From `src/DigitalBrain.Modules/Google/Flutter/app/core`: `flutter analyze` then `flutter test`. Expected: no issues, all pass.
- [ ] From `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter analyze` then `flutter test`. Expected: no issues, all pass. A failure is a real regression of this plan: fix it in the task that introduced it (same commit discipline), never by skipping the test.
- [ ] Run `dart format --set-exit-if-changed lib test` in `app/shell` and `dart format --set-exit-if-changed lib` in `app/core`. Expected: exit 0. If it reformats, commit the formatting with the file list it printed:
  ```
  git add <each file dart format listed>
  git commit -m "Shell: formatting

  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
  ```

---

## Task 13: Verification loop — the desktop seen running

**Files**
- None created. Reads: `src/DigitalBrain.AppHost`, the running OS, traces.

**Interfaces**
- Consumes: `aspire run`, `mcp__aspire__list_resources`, `mcp__aspire__list_console_logs`, `mcp__aspire__list_traces`, `mcp__aspire__list_structured_logs`, `mcp__aspire__list_trace_structured_logs`; `digitalbrain-mcp` at `localhost:5081/mcp` (`neurons_context`, `neurons_search`, `neurons_get`, `neurons_call`); the Flutter desktop app Aspire launches (`FlutterModuleHosting.RunDesktopApp`).

**Steps**

- [ ] Build clean, per project:
  `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj`,
  `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj`,
  `dotnet build src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/DigitalBrain.Modules.Microsoft.Aspire.csproj`,
  `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`,
  `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj`. Expected: 0 warnings, 0 errors.
- [ ] Wipe the local Azurite volume before starting (the `apps.manifest2` state and the shell's saved presentation were reshaped; an activation `wireType` error on `{brain}/apps/assistant` is this reshape, not a bug — no shims).
- [ ] Start: `aspire run` from `src/DigitalBrain.AppHost`. Then `mcp__aspire__list_resources`: every resource `Running`/`Healthy`, including `OperatingSystem`, `digitalbrain-mcp`, `Modules-postgres-server`, the Flutter desktop resource. If one is not, `mcp__aspire__list_console_logs` for it before anything else.
- [ ] `neurons_context` through `digitalbrain-mcp` (`/brains/{brainId}/mcp` for the signed-in brain): confirm the caller and brain. `neurons_search` for `IApp`; `neurons_call` `Read` on `{brain}/apps/calculator`: the answer's `manifest.operations` is `open, clear` and `manifest.toolbar` is `[{operation: clear, kind: button, icon: backspace, label: Clear}]`; `Read` on `{brain}/apps/assistant`: `toolbar` is `[{send, text}, {voice, button, mic}]`, version `1.4.0`.
- [ ] In the shell: the bar is at the bottom with Home | the assistant island (cat, text field, mic) | compute and profile; no "Move controls" or "Side panel" items in the profile menu. Open Calculator from Home: the working area is the calculator window alone, the dock shows the Clear button. Type `12+3` on the keypad, press `=`, then press the dock's Clear.
- [ ] `neurons_get` `IText` `{brain}/apps/calculator/display`: `Markdown` is `""`. `mcp__aspire__list_traces` for `OperatingSystem`: a trace for `POST /brains/{brain}/apps/calculator/request` whose spans include the `IApp.Request` grain call; `mcp__aspire__list_trace_structured_logs` on it shows the `AppRequested` publish for operation `clear`; `mcp__aspire__list_structured_logs` shows the calculator program's `clear.cs` behavior reacting (the csharp runtime logs the behavior's subscription delivery). If the request trace exists but no reaction log follows, the synapse is not running: read the brain runtime's console logs, do not retry.
- [ ] Press Home: the overview shows Calculator and Assistant tiles with live surface renders (the calculator tile shows its empty display and keypad), the Infrastructure strip with green chips for `aspire`, `postgres`, `clickhouse`, `qdrant`, the My apps grid and the Marketplace below. Tap the Assistant tile: it fills the working area and the dock is the assistant island.
- [ ] `neurons_call` `IAspire.StopResource` with `Modules-postgres-server` (key: the AppHost application name shown by `neurons_search` for `IAspire`). Within the strip's refresh interval the `postgres` chip turns red; `mcp__aspire__list_resources` shows the resource stopped; `mcp__aspire__list_traces` shows `ResourceStateChanged` published by `microsoft.aspire` through the bridge (`POST …/bridge/resources`). Then `StartResource` and watch it return to green.
- [ ] Tap the red/green `postgres` chip: the Connections window opens with `postgres` preselected.
- [ ] Submit "what is 2+2" in the assistant island: the transcript in the assistant surface shows the turn; the trace shows `POST /brains/{brain}/apps/assistant/request` with operation `send`.
- [ ] Regression net: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`, `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests`, `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`, `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` (live-gated scenarios compile when credentials are missing), `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`, and `flutter test` in `app/shell` and `app/core`. Expected: all pass. Kill any run over 5 minutes and debug the hang.
- [ ] Nothing to commit in this task; the branch is `os-runtime`, every task's commit is already on it. Do not push unless asked.

## Spec gaps found while planning

- The shell is HTTP-only; neither `IAspire.ListResources` nor `ModuleInventory` was reachable from Dart. Task 3 adds `GET /brains/{brainId}/infrastructure` (no new neuron contract, an endpoint on the existing Aspire module).
- "Every app neuron whose runtime is running (`IAppRuntime` state)": `IAppRuntime` exposes `Deploy`/`Retire` only and the shell cannot read `IBrainPrograms.Describe`. "Running" is derived from the brain's open windows keyed `{brain}/apps/{name}/window`; the tile's close closes that window (`IWorkspace.Close`) — it does not retire the program.
- The assistant's `voice` operation exists only because its toolbar names it; no synapse reacts to `AppRequested("voice")` yet (voice capture today starts from the composer's own control). The button posts and nothing answers until a synapse is written.
- "`icon` … or a path in the bundle": only `/apps/{name}/icon` serves a bundle file. An entry naming the manifest's icon file renders it; any other bundle path renders its label.
- `ResourceStateChanged` is not streamed to the shell (`/events` carries workspace revisions only); the strip re-reads on an interval.
- "Left island, Home. One button." displaces the workspace switcher; it moves into the profile menu.
- "The local System One adapter" has no Aspire resource; it does not appear in the strip until the AI module reports one.
