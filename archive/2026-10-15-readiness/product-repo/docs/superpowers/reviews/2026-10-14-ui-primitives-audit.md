# UI primitive and renderer audit — 2026-10-14

Source audit only. No application code was changed; no tests or running UI were exercised. Codegraph was used first, followed by direct reads for the uncovered source ranges. Findings establish expressiveness and wiring from source, not runtime correctness.

All abbreviated paths below are relative to `src/DigitalBrain.Modules/Google/Flutter/`: **C** = `DigitalBrain.Modules.Flutter.Contracts`, **R** = `DigitalBrain.Modules.Flutter`, **U** = `app/ui/lib/src`, **T** = `app/ui/test/composition`. Line numbers describe the inspected snapshot.

## Current foundation

Apps can own durable composition now: `C/Surface/ISurface.cs:7-25` declares revisioned surface state containing child neuron references; `C/Layout/ILayout.cs:7-26` declares revisioned layout state. `R/Surface/SurfaceNeuron.cs:12-22` validates children, compares revisions, persists before publishing, and restores state after a failed write. The shell recursively renders the graph through `U/composition/neuron_view.dart:284-301`. This is a useful base to extend, rather than replace with a parallel UI system.

`UiChildRef` currently contains only `Kind` and `Name` (`src/DigitalBrain/Flutter/UiChildRef.cs:3-6`). There is no instance-level semantic, style, constraint or viewport metadata on that reference. C# `UiParts` is only a key-name helper (`C/UiParts.cs:3-6`); Dart `UiPart` is a distinct sealed metadata hierarchy with nine chat-embedded kinds (`U/models/ui_part.dart:13-29`). These are not one universal typed composition contract.

## Exact palette coverage

`C/UIVocabulary.cs:5-39` has **35** kind constants. `U/composition/renderer_registry.dart:29-63` lists **33**, omitting `chat` and `composer`. Its dedicated set at lines 66-85 has **18** members, not 19. `NeuronView` actually has **20** case kinds: those 18 plus `chat` and `composer` (lines 374-830).

| Coverage | Kinds | Meaning |
|---|---|---|
| Direct composition renderers | surface, layout, collection, button, text, textfield, select, tabs, table, chart, card, person, form | Dedicated switch implementation exists; this does not certify complete interaction or styling support. |
| Host/capability-dependent renderers | imagecanvas, voiceinput, webbrowser, scene, fileinput | Image canvas requires `imageBuilder` or shows unavailable text (817-819); voice has a default implementation (661-672); browser without action callback shows only title (619-660); scene has specialized client/state paths (319-340, 740-744); file picking is textual (263-274). |
| Implemented but absent from registry | chat, composer | Specialized rendering at 384-475. Registry queries incorrectly call these unsupported. |
| Declared, no direct composition case | toggle, slider, progress, infobar, image, video, graph, calendar, clock, map, rating, color, expander, tree, sheet | **15** kinds reach `_FallbackRenderer` (829-830), which reports unsupported. The fallback is visible recovery UX, not a functional toggle, image, calendar, etc. Some kinds have standalone/chat widgets; that does not make them composable through this path. |

The registry is metadata, not a renderer factory: `NeuronView` dispatches a separate switch. `T/renderer_registry_test.dart:5-24` asserts the registry's own length 33 and self-consistency, not parity with C# or actual rendering. This is a concrete drift blind spot.

Field registry declares 12 kinds, nine dedicated: PlainText, LongText, Number, Email, Url, Date, Boolean, Choice, Secret. DateTime, MultiChoice and Reference fall back to plain text (`U/composition/renderer_registry.dart:88-114`). This is usable for displaying/editing raw text, but lacks the intended temporal, multi-selection and reference-selection behavior. Do not equate fallback with semantic completeness.

## Blockers and requirements

### P1 — Palette metadata can promise capabilities the renderer cannot deliver

Resolve the 15 missing composition renderers in priority order based on the OS screens being migrated. Reuse existing controls and contracts where practical; extend their definitions only for missing semantics. Make one authoritative descriptor inventory drive C# declarations, client capability discovery and registry fixtures. Each descriptor needs contract/schema version, event signatures, renderer availability and device requirements. Unknown kinds must keep a visible, diagnostic fallback; required unsupported capabilities must be detected before opening/installing an app. Runtime-generated C# can compose installed generic capabilities; arbitrary new native rendering capabilities still require a Flutter/module release.

### P1 — Layout cannot express a full app-owned desktop shell

`LayoutDefinition` contains only mode, children, gap, extents and follow-end (`C/Layout/ILayout.cs:14-15`). Server modes are row, column, split, stack and list (`R/Layout/LayoutNeuron.cs:15-18`). In Flutter, split is just a horizontal Flex, not a draggable splitter; stack expands all children; list eagerly constructs a Column within a scroll view (`U/composition/neuron_view.dart:476-554, 845-890`). There is no layout-level grid/wrap, alignment, padding, min/max sizing, weighted flex, adaptive rules, positioned stack children or resizable divider in these contracts.

Extend existing layout/child definitions with bounded, typed constraints, flex weights, alignment, padding, overflow policy, adaptive breakpoints and role-based styling tokens. Specify safe-area and viewport insets. Add resizable split state only if the OS needs persistence; pointer drag mechanics belong in Flutter while accepted extents belong in neurons. Avoid unrestricted CSS-like maps and feature-name branches.

For an app-composed bottom bar, C# should declare its layout, buttons/selectors, active/disabled badges and actions. A generic **viewport host reference** must let that composition embed the active window/application surface with bounds, clipping, focus and input routing. This may extend existing workspace/surface capabilities rather than introduce another neuron type. Flutter supplies device bounds, safe insets and focus mechanics, and renders the active viewport specified by state; it must not choose which applications or bottom-bar actions exist. Responsive rules should evaluate locally from declared constraints without a server round trip per pixel.

### P1 — Large data has incomplete compositional virtualization and paging

Generic list composition mounts all children, capped silently at 128; recursion is guarded at depth 16 (`U/composition/neuron_view.dart:315-317, 363-372`). Every mounted child independently reads/watches or polls. Table builds every DataRow in nested scroll views (710-737). These limits bound damage but do not provide scalable virtualization.

Collection does use `ListView.separated` (not wholly eager) in `U/composition/ui_collection_view.dart:34-52`. C# limits collection definitions to 500 items (`R/Collection/CollectionNeuron.cs:15`), and its definition carries a cursor (`C/Collection/ICollectionView.cs:16-18`). The reusable widget offers `onLoadMore` at lines 20-21 and 85-101, but `NeuronView` never passes it or the cursor (763-816). Thus paging capability exists partially but is not composed end-to-end here.

Add a typed page/window request and response on existing collection/table contracts, stable item identity, loading/end/error state, selection preservation, cancellation and virtualization budgets. A virtual list of referenced item surfaces should mount/watch only the visible range with overscan. Test bounds and lifecycle, not just final pixel output. Reject oversized composition with a diagnosable error rather than silently dropping children.

### P1 — Interaction contract consistency needs explicit closure

NeuronView dispatches untyped maps with kind-specific shapes. Collection includes current revision (768-810); text input does not (935-943). Buttons may bypass event dispatch and activate external URLs or host activation JSON (238-256). Browser callbacks call `send` directly instead of the shared event queue (642-659). These may be intentional, but a generic OS needs a documented common envelope and authoritative validation on the server.

Define identity, expected revision/context, interaction ID, event type and typed payload. Persist domain decisions in C# and keep only ephemeral input/focus/gesture state in Flutter. Preserve ordered edit-then-submit delivery, reject stale context and duplicate commands safely, handle permission loss, and specify optimistic reconciliation. Collection local selection currently masks server selection via `selection ?? definition['selection']` (795) and is set before dispatch (802); verify rollback/reconciliation when dispatch fails or external state changes.

File input currently reads one whole file into memory and decodes arbitrary bytes as UTF-8 with malformed input allowed (263-274). Extend existing file input to generic binary/reference transfer with size/type/cancel/progress semantics before claiming general OS file attachment support.

### P1 — Accessibility and visual language are not app-declarable

There is some accessibility: loading live regions (330-332, 354-357), collection error/live/loading semantics and item labels (`U/composition/ui_collection_view.dart:75, 89-92, 127-134`), Material controls, and declared Enter-submit behavior (966-994). This is not an absence of accessibility.

However `UiChildRef`, SurfaceDefinition and LayoutDefinition have no application-declared role, accessible name/description, heading level, focus order/group, shortcut, live-state policy or meaningful disabled reason. Extend existing definitions with a shared semantic envelope, focus identifiers, command/shortcut bindings and semantic design tokens (spacing, typography, emphasis, state colors); Flutter resolves tokens with theme/text scale/reduced-motion/high-contrast settings. Test composed keyboard traversal, screen-reader names, focus restoration, large text, RTL and narrow viewports. Keep native semantics for native controls; do not wrap everything in conflicting custom roles.

### P2 — Watch and extension behavior needs a declared host capability boundary

NeuronView can subscribe and reopen streams, otherwise polling every two seconds (`U/composition/neuron_view.dart:73, 90-92, 112-145`). `ApplicationSurface` provides loader/action callbacks but no watch, image, secret, voice or scene adapter (`U/composition/application_surface.dart:62-78`), so this entry path uses polling and does not expose all host capabilities. Other entry paths may provide them; this is a path-specific gap, not a claim that the whole shell polls.

Define one generic host capability interface and use it consistently at every application root. Prefer subscription/batched invalidation; bound active watches and reconnect reads. Keep native execution, credential storage, browser embedding and hardware capture inside connector adapters. Add protocol/version negotiation and explicit unsupported capability states, without permitting app-authored native Dart execution.

## Verification acceptance

Existing useful suites include `T/primitive_surface_test.dart` (360×600 nested tree, declared Enter target and follow-end); `T/renderer_registry_test.dart` (currently self-consistency only); `T/neuron_view_watch_test.dart`, `T/neuron_view_initialization_test.dart`, `T/form_wire_test.dart`, `T/form_renderer_test.dart`, `T/ui_collection_view_test.dart`, `T/short_layout_test.dart`, `T/window_states_test.dart`, `T/neuron_scene_host_test.dart`, and C# `tests/DigitalBrain.Modules.Flutter.Tests/Composition/CompositionFacts.cs` / `FormCompositionFacts.cs`. Their presence is observed; passing status was not assessed.

Required additions: generated C#→JSON→Dart golden fixtures for every kind/event; actual render-and-interact parity for every advertised kind; capability-unavailable cases; revision conflicts and replay; refresh during text entry; failed selection reconciliation; paged 10k logical items with bounded mounts/watch count; nested-scroll/focus preservation; malformed definitions/cycles/oversize failure; every migrated OS surface at narrow/wide/high-text-scale sizes; no business/application-name dispatch in Flutter. Add a boundary test that changes bottom-bar composition in C# and observes it without rebuilding Flutter.

Implementation completion still requires the repository's LSP mapping/diagnostics, project builds and relevant Flutter/C# unit/E2E suites, then Healthy Aspire resources, real neuron operations through digitalbrain-mcp, state readback and telemetry. Visual and assistive-technology validation remains necessary for layout/accessibility claims; neuron-state tests alone do not prove rendered usability.
