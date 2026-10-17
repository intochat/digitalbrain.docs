# Flame / Ino / BrainView redesign — proposal

Status: proposal, for the user's decision. No code changed. Scoped to part 9 of
`docs/superpowers/reviews/2026-10-12-brain-as-data-complexity.md`; the other eight parts stay parked.

## Intent

The Flame subsystem works and is seen running (Flame Task 11). The redesign is not a rewrite of its
behaviour — it closes the one load-bearing smell the complexity review found: **the C#/Dart scene boundary
cannot fail loudly.** A scene node is `Type: string` + `Parameters: Dictionary<string, string>`
(`SceneDefinition.cs:14-16`); `FlameVocabulary.NodeTypes` is referenced nowhere and `SceneValidation` never
inspects `Type` or a parameter key (`SceneValidation.cs:14-23`); the meaning of every node lives in a Dart
`switch` on the same strings (`node_components.dart:225-237`) and ~26 `param('…')` read sites, with the mood
vocabulary re-declared in Dart (a 7th value, `ino_sphere.dart:9-17`) and silent `orElse: idle` fallbacks. So a
C# writer and the Dart reader can disagree with no failure: rename a state, typo `mood`, and the sphere just
renders idle.

Everything else is kept. The four-words model holds: a scene is an edge neuron whose external system is a
person (spec D1–D5). A scene stays data a kernel stores, replays and shares (D3). The shell still renders an
unknown node type as a placeholder so a newer scene never breaks an older shell (Review Focus 4). Apps still
write scenes from C# synapses; Ino's presence is still a scene, not its own neuron.

## The redesign, in one line

Make the node vocabulary and its parameter schema **one source of truth the C# publish gate enforces**, so a
scene that Dart cannot render is refused at `Set`/`Publish` instead of degrading silently — while keeping a
scene a data value an LLM authors.

## Option A — schema-validated data nodes (recommended)

Keep `SceneNode(Type, Transform, Style, Parameters, Children, Tweens, Inputs)` on the wire, but add:

- **`FlameSchema`** in the Flame contracts: for each known type (`circle`, `rect`, `text`, `sprite`, `path`,
  `particles`, `group`, `ino_sphere`, `brain_graph`, `activity_ring`) the parameter keys, required/optional, the
  value parser (number, color `#rrggbb`/`#aarrggbb`, JSON array, enum), and the enum domains (`mood`, `source`,
  `filter`, `layout`). One C# artifact.
- **`SceneValidation.Check`** validates known types and their parameter keys/values against `FlameSchema`
  (unknown *types* still pass — forward compatibility, Review Focus 4; unknown *keys on a known type* are
  refused, since Dart will ignore them).
- **A parity artifact**: `FlameSchema` is emitted to a small `flame-schema.json` by a Flame-module fact; the
  Dart `node_schema.dart` (type list, param keys, enum domains) is generated from it, or asserted against it by a
  `flutter test`, so the two languages cannot drift.
- The Dart interpreter keeps its `switch`, but each arm reads parameters through the schema (typed getters), and
  a missing/invalid param fails the widget test rather than falling back.

| | |
|---|---|
| **Fails loudly** | Yes for known types/params at `Set` and in Dart tests; unknown types remain placeholders. |
| **Cost** | Low–medium: one contracts file + validator + a parity test; Dart gains a schema mirror; Ino/BrainView need no change (they already build valid scenes). No wire change. |
| **Loses** | The freedom to put arbitrary string params on a known node type; a hand-written scene must name real keys. (D3's "data a kernel stores" is preserved.) |

## Option B — codegen both sides from one vocabulary

As A, but the C# validator **and** the Dart models/interpreter are generated from one vocabulary (C# source
generator for the module; a Dart generator run in `flutter test`/`build_runner`). The parity *test* becomes a
build step.

| | |
|---|---|
| **Fails loudly** | Yes, and parity is structural, not tested — adding a node type touches one place. |
| **Cost** | Medium–high: a generator in each toolchain, more infra; overkill for 10 node types today. |
| **Loses** | The hand-written Dart interpreter arm and its place to put bespoke animation. |

## Option C — a closed typed node union

Replace `SceneNode` with an abstract record and one sealed subtype per type with typed fields
(`CircleNode(double Radius, …)`, `InoSphereNode(InoMood Mood, …)`, …), serialized polymorphically. The type
system *is* the schema.

| | |
|---|---|
| **Fails loudly** | At compile/deserialize time — the strongest. |
| **Cost** | High: a wire change (the Dart mirror updates in the same change, per plan Global Constraints); Ino/BrainView rewritten to typed records; contract versioning for new/removed types. |
| **Loses** | Hand-written JSON/data scenes with arbitrary params; the graceful unknown-type placeholder (deserializing an unknown subtype fails — forward compatibility moves to contract versioning, which we do not have yet). |

## Secondary fixes (independent; recommended)

- **S1 — one Dart diff layer.** Keep whole-definition `Set` (cheap, and the synapse-cache model relies on
  "state is rebuilt from scratch"), but consolidate the five Dart diff paths (`SceneGame.apply`,
  `NodeComponent.configure` signature string, tween restart key, `ActivityRing.leaving`, stage revision compare)
  into one component-level `apply(state)` with a single per-node version. Cost: small; loses nothing.
- **S2 — one stage-key resolver.** `StageNeuron.OwnerKeyOf`/`ScopeOf` (`StageNeuron.cs:19,40`) and
  `FlameEndpoints` (`:64`) plus apps hardcoding `/stage/owner` (`Ino.cs:18`, `BrainView.cs:25`) become one
  `StageKey.For(caller)` helper. Cost: small; loses the raw alias only if a script cannot compute a digest
  (it can't — keep the alias inside the helper).
- **S3 — one upsert helper.** The read-revision → `Set(expected)` → retry idiom (`Ino.cs:60,67`,
  `BrainView.cs:40`) becomes `SceneClient.Upsert(key, mutate)`. Cost: small; keeps the explicit `Set` throw for
  direct callers.

## Migration and testing

- No wire change for Option A; one wire change for C (`SceneNode` subtypes) that updates `scene_models.dart` in
  the same task.
- Flame facts: `ASceneWithAnUnknownParameterKeyIsRefused`, `ASceneWithAnUnknownNodeTypeIsAcceptedAsAPlaceholder`
  (keeps Review Focus 4), and the `flame-schema.json` parity fact. Dart: a schema test; the existing
  `scene_game_test`/`prefabs_test` tighten to schema-typed getters.
- Live: re-run Flame Task 11's steps (Ino open → Fire → dock → BrainView → shell follows the stage).
- Architecture: no ring change (schema stays in the Flame contracts).

## What I need you to pick

1. **A / B / C** for the node boundary (recommend **A** now, B later if the node set grows).
2. Whether to also do **S1 / S2 / S3** (recommend **S2 + S3**; S1 optional).
3. Confirm unknown node **types** stay placeholders (recommend yes, per Review Focus 4).

On your pick I will write the implementation plan (tasks, files, facts) and then execute it.
