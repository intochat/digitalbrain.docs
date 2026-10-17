# Flame / Ino / BrainView redesign — implementation plan

Spec: `docs/superpowers/specs/2026-10-12-flame-redesign-proposal.md`. Decisions: **A** (schema-validated data
nodes), **S2** (one stage-key resolver), unknown node **types** stay placeholders. Scope: part 9 only.

Goal: a scene that Dart cannot render is refused at `Set` (and caught by tests), instead of degrading silently;
and the stage has one key resolver. No change to the data-scene model, to D1–D5, or to the unknown-type
placeholder behaviour.

## Global constraints

- Per-project build/test, never the `.slnx`. Warnings are errors; nullable on; no `/// <summary>`.
- Grain state keeps concrete arrays. A C# wire-shape change updates the Dart mirror in the same task.
- Facts are sentence-named with `TestContext.Current.CancellationToken`; real grains via
  `TestBrain.Create().WithModule<FlameModule>()`.
- The schema is a contracts artifact (`DigitalBrain.Modules.Flame.Contracts`), so scripts and the renderer see
  one vocabulary; `SceneValidation` (module) enforces it; Dart consumes a checked-in JSON generated from it.

## The schema (contracts)

New `FlameSchema.cs` in `DigitalBrain.Modules.Flame.Contracts`:

```csharp
public enum FlameParamKind { Text, Number, Color, Json, Choice, Boolean }

public sealed record FlameParam(string Key, FlameParamKind Kind, bool Required = false, string[]? Choices = null);
public sealed record FlameNodeType(string Type, FlameParam[] Parameters, string[] Inputs);

public static class FlameSchema
{
    public static readonly FlameNodeType[] Nodes;              // the ten vocabulary types
    public static FlameNodeType? For(string type);
    public static readonly string[] Gestures = ["tap", "drag", "hover"];
    public static readonly string[] TweenProperties = ["x", "y", "scale", "rotation", "opacity"];
    public static readonly string[] TweenCurves = ["linear", "easeIn", "easeOut", "easeInOut"];
}
```

Domains:

| Type | Params (key: kind, req) |
|------|-------------------------|
| `circle` | `radius`:Number, `color`:Color |
| `rect` | `width`:Number, `height`:Number, `color`:Color, `corner`:Number |
| `text` | `text`:Text req, `size`:Number, `color`:Color, `align`:Choice{left,center,right} |
| `sprite` | `src`:Text req, `width`:Number, `height`:Number |
| `path` | `d`:Text req |
| `particles` | `count`:Number, `speed`:Number, `color`:Color |
| `group` | — |
| `ino_sphere` | `mood`:Choice{idle,listening,thinking,acting,speaking,error,disconnected}, `radius`:Number, `hue`:Number |
| `brain_graph` | `source`:Choice{events,static}, `filter`:Choice{apps,all}, `selected`:Text, `layout`:Choice{sphere}, `title`:Text |
| `activity_ring` | `items`:Json, `radius`:Number |

`Json` means the value must parse as the element's JSON (the renderer reads a JSON array); `Color` is
`#rrggbb` or `#aarrggbb`; `Number` is invariant-culture double; `Text` is any non-empty string.

## Tasks

### Task 1 — the schema and its fact (contracts)
Files: create `…/Flame.Contracts/FlameSchema.cs`; test `…/Flame.Tests/Schema/FlameSchemaFacts.cs`.
- Facts: `TheSchemaCoversExactlyTheVocabularyNodeTypes` (`FlameSchema.Nodes.Select("Type")` equals
  `FlameVocabulary.NodeTypes`); `EveryChoiceParamNamesItsDomain`.
- Build the contracts project. Commit.

### Task 2 — Set validates known types, accepts unknown (module)
Files: modify `…/Flame/Scene/SceneValidation.cs`; test `…/Flame.Tests/Scene/SceneSchemaFacts.cs`.
- For each node: if `FlameSchema.For(node.Type)` is null, accept (placeholder, Review Focus 4); else each
  declared parameter is present-if-required, every provided key is declared, and the value parses for its kind
  (Number invariant, Color `#rrggbb`/`#aarrggbb`, Json parses, Choice ∈ domain); every `node.Inputs` ∈
  `FlameSchema.Gestures`; every tween property/curve ∈ the domains. Recurse children. Reason strings name the
  node and key.
- Facts: `ASceneWithAnUnknownParameterKeyIsRefused`, `AKnownTypeMissingARequiredParameterIsRefused`,
  `AChoiceValueOutsideItsDomainIsRefused` (`mood:"sleepy"`), `AnUnknownNodeTypeIsStillAcceptedAsAPlaceholder`
  (keeps the review focus), `AGestureOutsideTheVocabularyIsRefused`.
- Run the Flame suite (`SceneSetFacts`, `SceneSchemaFacts`). Commit.

### Task 3 — the Dart schema mirror and parity
Files: create `app/core/lib/src/models/flame_schema.json` (generated content) and
`app/core/lib/src/models/node_schema.dart`; test `app/core/test/node_schema_test.dart`; modify
`node_components.dart` / `ino_sphere.dart` / `activity_ring.dart` / `brain_graph.dart` to read params through
`node_schema.dart` typed getters (missing/invalid → throw in tests, never `orElse: idle`); a Flame fact
`TheCheckedInDartSchemaMatchesTheContracts` (test `…/Flame.Tests/Schema/DartSchemaParityFacts.cs`) reads the
JSON via the repository root and asserts it equals `FlameSchema`.
- The JSON is checked in and updated by hand when the schema changes; the fact's failure message says so.
- `flutter test` + `flutter analyze` in `app/core` and `app/ui`; Flame suite. Commit.

### Task 4 — S2, one stage-key resolver (module + apps)
Files: create `…/Flame/Stage/StageKey.cs`; modify `StageNeuron.cs` (drop `OwnerKeyOf`/`ScopeOf` bodies to call
it), `FlameEndpoints.cs`, `features/os/Ino/Ino.cs`, `features/os/BrainView/BrainView.cs`; test additions in
`…/Flame.Tests/Stage/StageFacts.cs` and a `StageKeyFacts.cs`.
- `StageKey.For(CallerContext caller)` returns the owner alias `{brain}/stage/owner` for the brain's owner and
  the digest `{brain}/stage/{sha256hex(account + "\0" + principal)}` otherwise — the two forms one function
  owns. `StageKey.OwnerOf(brainId)` returns the alias for synapse callers that cannot compute a digest.
- Facts: the existing stage facts stay green; a new `TheResolverOwnsBothKeyForms`.
- Flame suite, `FeatureCompileFacts`, OS unit; `flutter test` (apps unchanged in behaviour). Commit.

### Task 5 — regression net and live re-verify
- Flame 28+, Flutter module, Apps, OS unit, Architecture (6 known); `flutter test` core/ui/shell.
- Live: re-run Flame Task 11's steps (Ino open → Fire think → assistant dock → BrainView → Report → shell
  follows the stage) and confirm a deliberately-broken scene is refused with a named reason.

## Notes

- Unknown node **types** are accepted (`placeholder`), so existing scenes keep working; unknown **keys on a
  known type** are now refused — the one behaviour change, and the point of the redesign.
- `brain_graph.layout` becomes `Choice{sphere}` (F6: only sphere exists); the Dart fallback is deleted.
- `mood` accepts the full seven-value renderer domain; Ino's presence machine still uses its six states.
