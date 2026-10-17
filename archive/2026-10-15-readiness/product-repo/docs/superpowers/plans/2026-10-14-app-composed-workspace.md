# App-composed workspace implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a DigitalBrain OS whose workspace and product views are composed by C# apps, with Flutter/Flame acting as generic human connectors.

**Architecture:** Evolve existing typed UI neurons, app presentations, and durable workspace state. A first-party Workspace app composes the full canvas and bottom bar; ordinary apps supply named views. Platform/module code enforces authority and state invariants, while local generic renderer mechanics deliver responsive interaction.

**Tech Stack:** Existing C#/Orleans app runtime, compiled synapses, Flutter/Dart UI packages, Flame scenes, Aspire, digitalbrain-mcp. No frontend framework replacement or dependency upgrade is part of this plan.

**Spec:** [Requirements and design](../specs/2026-10-14-app-composed-workspace-design.md). Read its three linked source audits before execution.

**Status:** Implementation started on `codex/app-workspace`, baseline `da065933d`. A local-brain, opt-in contracts + Workspace proof is implemented; see [slice evidence and limitations](../reviews/2026-10-14-workspace-slice-evidence.md). This does not complete M0 or M1: authority-generation binding, capability negotiation, device sessions, real usage, social views, and default-shell cutover remain pending. Unchecked tasks below retain their original acceptance gates.

## Global constraints

- C# app/synapse code owns product composition, navigation policy, durable outcomes, and animation intent.
- Flutter owns generic rendering, layout evaluation, native input/accessibility, local frame mechanics, and transport; no product-name dispatch.
- Preserve neuron/signal/behavior/connector vocabulary; no parallel executable UI runtime.
- Keep app-owned presentations, module-enforced authority, concrete arrays in persisted state, at-least-once-safe reactions, and compilation-as-publish gate.
- One app installation loader; exact published version/digest for fork; never copy another user's credentials/live data.
- No hidden automatic Discover/Ino opening, background focus stealing, or stop-on-close behavior.
- Keep scope/account/brain distinctions. Account balance is not brain-scoped usage.
- LSP definition/reference/implementation mapping before code changes, then diagnostics; build individual projects, never the solution.
- Use generic module/renderer tests; do not introduce per-generated-app unit-test projects. Shipped app behavior is accepted through live neuron scenarios.
- After Dart/Flutter code changes, hot reload or restart the connected session; record if unavailable rather than claiming seen-running completion.
- No reset of encrypted state/keys, production publication, dependency upgrade, or deletion of unrelated work.

## Delivery strategy

This spans several subsystems; execute as five reviewable milestones, with the tasks below as their concrete subplans:

| Milestone | Tasks | Independent visible result |
|---|---|---|
| M0: contracts and trust | T01–T04 | Verified capability vocabulary, generic presentation roots, typed durable workspace state |
| M1: app-composed workspace | T05–T08 | Workspace app renders canvas and quiet dock; pins, open views, Ino and real usage work |
| M2: social apps | T09–T10 | Full-view profiles/discovery and exact forks; isolated demos separately gated |
| M3: authoring and polish | T11–T14 | Unified design/semantics, Creator parity, correct optional motion and bounded large data |
| M4: cutover | T15–T16 | Old product-specific shell paths removed and release evidence complete |

Start with M0 and a deliberately small M1 proof: Workspace + calculator + profile fixture + Ino + usage. Do not postpone the generic-host proof until every primitive and social feature is built. T10's isolated demo work is not required to ship truthful static publication previews. P2 work remains explicit follow-up.

## Review focus

1. A delayed event from a formerly focused view edits the newly focused view. Cover in T03/T04/T05 context/revision tests.
2. Closing a view races with work completion/reconnect and reopens it. Cover in T04 and T16.
3. A public/shared root contains a nested private child or loses access mid-watch. Cover in T01/T03/T09.
4. A malformed app, large list, or scene monopolizes rendering/subscriptions. Cover in T02/T05/T13/T14.
5. A workspace update compiles but cannot publish a usable root, or a stored schema cannot be read. Cover in T06/T15/T16 recovery rehearsal.

## File ownership and interface map

Path aliases are used only to keep this document readable:

- **F** = `src/DigitalBrain.Modules/Google/Flutter/`
- **FC** = `F/DigitalBrain.Modules.Flutter.Contracts/`
- **FR** = `F/DigitalBrain.Modules.Flutter/`
- **FT** = `F/tests/DigitalBrain.Modules.Flutter.Tests/`
- **D** = `F/app/`; **DU** = `D/ui/lib/src/`; **DS** = `D/shell/lib/`; **DC** = `D/core/lib/src/`
- **A** = `src/DigitalBrain.Modules/DigitalBrain/Apps/`; **AC** = `A/DigitalBrain.Modules.Apps.Contracts/`; **AR** = `A/DigitalBrain.Modules.Apps/`; **AT** = `A/tests/DigitalBrain.Modules.Apps.Tests/`
- **L** = `src/DigitalBrain.Modules/DigitalBrain/Flame/`; **LC** = `L/DigitalBrain.Modules.Flame.Contracts/`; **LR** = `L/DigitalBrain.Modules.Flame/`
- **C** = `src/DigitalBrain.Modules/DigitalBrain/Circles/`

Existing owners remain responsible for their domains: Apps for presentation/publication/install, Flutter module for UI state and connector protocols, Flame for scene primitives, Circles for membership/sharing, platform for identity/billing facts. First-party feature folders own product composition. Do not move platform secrets or billing authority into scripts.

New proposed files are explicitly marked **new**. Existing files must be inspected through LSP before edits; the source audit is not a substitute for current call-site mapping.

## T01 — Lock ownership, assignment identity, and cross-app access

**Covers:** A06–A12, V13, S05–S06, Q02–Q04. **Depends:** none.

**Files:** `AR/Apps/AppNeuron.Presentation.cs`; `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/CallerContext.cs`; `FR/Shared/AppUiEndpoints.cs`; current app proxy/execution stamping definitions located by LSP; `AT/Apps/AppPresentationFacts.cs`; `FT/Space/FriendsSpaceFacts.cs`; **new** `AT/Apps/PresentationAccessFacts.cs`.

**Contract decision:** preserve trusted app identity, add host-verified assignment-generation binding if the full proxy path does not already prove it. Presentation grants permit named view reads/subscriptions and explicitly declared interactions, not arbitrary cross-brain neuron calls. A grant must resolve against current membership/visibility; a string token supplied by the app is never self-authorizing. Reuse existing grants where their semantics fit.

- [ ] Trace stamped caller from script proxy to Present, root/child reads, subscriptions, input, and assets. Record exact enforcement owners and distinguish admission checks from UI policy.
- [ ] Add `OldExecutionCannotPublishUsingCurrentRevision`: replace program, retain old execution identity, pass new numeric revision, assert denial. Existing old-number test is insufficient.
- [ ] Add `PresentationGrantDoesNotAuthorizePrivateDescendants`: shared root contains private reference; assert root policy does not leak child read/watch/asset/action.
- [ ] Add `RevokedMembershipStopsPresentationReadsAndWatch` and `AppCannotPublishAnotherAppsRoot` with real caller contexts.
- [ ] Run the owning focused test projects and confirm new cases fail for the intended missing guarantee, not harness failure.
- [ ] Implement enforcement in the actual proxy/platform/module owners; do not weaken current same-brain checks merely to mount the new workspace.
- [ ] Re-run authority cases, existing app presentation tests, and relevant framework caller tests. Commit only this boundary change.

**Exit gate:** no unresolved authority owner for a composed foreign root; no assumption that `expectedProgramRevision` alone authenticates the running assignment.

## T02 — Establish one capability truth and repair contract drift

**Covers:** U01–U02/U18, M01–M04, V08–V09/V16, A13. **Depends:** none; authority review from T01 before public exposure.

**Files:** `FC/UIVocabulary.cs`; `FR/Shared/CompositionValidation.cs`; `FR/Shared/AppUiEndpoints.cs`; `DU/composition/renderer_registry.dart`; `DU/composition/neuron_view.dart`; `DC/node_contracts.dart`; `LC/FlameSchema.cs`; `LR/Scene/SceneValidation.cs`; `DU/flame/primitive_nodes.dart`; **new** `FC/UiCapabilities.cs`; **new** `FT/Composition/CapabilityParityFacts.cs`; **new** `D/ui/test/composition/capability_parity_test.dart`.

**Proposed interface:** `UiCapability(string Kind, int SchemaVersion, string[] Actions, bool SupportsWatch, string[] RequiredDeviceCapabilities)` and a readable `UiCapabilities` snapshot. Describe support tiers separately: declared, transport-supported, composable, interactive, accessible. Renderer readiness cannot be inferred from a C# type alone.

- [ ] Freeze a generated fixture of all 35 current kinds, current fields, actions, and transport support. Reconcile chat/composer omission rather than preserving the self-consistency test's count of 33.
- [ ] Add `EveryAdvertisedCapabilityHasTransportAndRenderer`: fixture-backed assertion across C#/Dart/native/web and nested composition; unsupported kinds remain explicitly unsupported.
- [ ] Add `AcceptedSceneFieldsChangeRenderedOutput` for rect corner/radius, path fill/stroke, text alignment, and unsupported node/tree combinations. Reuse exact schema names chosen by one canonical contract.
- [ ] Add malformed-kind/version/cycle/depth/payload tests; unknown capability returns a diagnostic fallback, not a misleading functional widget.
- [ ] Implement metadata generation/validation without building a second dispatch registry beside the existing switch. Share fixtures with Creator and install checks.
- [ ] Run composition, transport, registry, and scene-schema tests; commit capability truth and correctness fixes.

**Exit gate:** “supported” means end-to-end support. Do not implement all 15 missing kinds merely to make a number look complete; prioritize T05 needs and mark others honestly until T11.

## T03 — Replace sphere-shaped app presentation with generic named views

**Covers:** A07/A10/A14, V01–V08/V11, U13. **Depends:** T01–T02.

**Files:** `AC/Apps/Presentation.cs`, `AC/Apps/IApp.cs`, `AR/Apps/AppNeuron.Presentation.cs`, `AT/Apps/AppPresentationFacts.cs`; `src/DigitalBrain/Flutter/UiChildRef.cs`; **new** `FC/Viewport/IViewport.cs`, **new** `FR/Viewport/ViewportNeuron.cs`; `DU/composition/application_surface.dart`, `DU/composition/neuron_view.dart`; **new** `D/core/lib/src/models/presentation_models.dart`, **new** `D/ui/test/composition/viewport_test.dart`.

**Proposed interfaces:**

```csharp
record PresentationView(string Id, UiChildRef Root, string[] RequiredCapabilities);
record Presentation(PresentationView[] Views);
record WorkspaceViewRef(string Id, string App, string Variant, string Context);
record ViewportDefinition(WorkspaceViewRef Target, string Interaction, string? Grant);
// Existing IApp.Present(long expectedProgramRevision, Presentation presentation) retained.
// IViewport follows the existing revisioned neuron Set/Read conventions.
```

The view reference is data, not executable behavior. `Interaction` is a validated enum in implementation (`ReadOnly`, `Interactive`), not an unrestricted string. `full` is default; no automatic fallback to another app. Resolve context in the owning app's authorized state, not through a Flutter route switch.

- [ ] Add `AppCanPublishTextRootWithoutSphere`, `ViewIdsAreUnique`, `UnknownRequiredCapabilityIsReported`, and `ProgramReplacementInvalidatesAllVariants`.
- [ ] Add `ViewportExpansionPreservesInstanceAndContext`, `MountDoesNotRunDomainOperation`, and `StaleResponseCannotReplaceNewTarget` renderer/transport cases.
- [ ] Add `NestedViewportCannotCycle` and authorization cases using T01 grants; assert failure leaves other children usable.
- [ ] Implement generic roots/variants and viewport resolution; move sphere/tree metadata into optional scene content.
- [ ] Ensure one host adapter supplies read/action/watch/assets/secrets/voice/scenes consistently; remove mount-time hidden operation requests.
- [ ] Update JSON DTO mirrors and exact fixture tests in the same change. Preserve stable widget keys across matching references.
- [ ] Run Apps presentation and Flutter viewport/initialization/watch tests. Commit contracts, DTOs, and renderer together.

**Exit gate:** a full and compact calculator share state without requiring a sphere or app-specific Dart.

## T04 — Typed durable workspace state and app-owned navigation policy

**Covers:** W01–W08/W10/W16–W18, A03–A04, Q03–Q04. **Depends:** T03.

**Files:** `FC/Workspace/IWorkspace.cs`, `FC/Workspace/WorkspaceState.cs`, `FR/Workspace/WorkspaceNeuron.cs`, `FR/Workspace/WorkspaceEndpoints.cs`, `DC/models/workspace_models.dart`, `DS/workspace/workspace_store.dart`; `FT/Workspace/WorkspaceFacts.cs`, `FT/Workspace/WorkspaceRouteFacts.cs`; **new** `FC/Workspace/WorkspaceUpdate.cs`; **new** `features/os/Workspace/Navigation.cs`.

**Proposed state:** `Revision`, `OpenViews[]`, nullable `FocusedViewId`, `Pins[]`, recent-focus ids, and context state references. Store open/focus by authenticated brain+device/session; pins by brain preference. Use a structured session identity, not arbitrary client-supplied scope.

**Proposed state API:** `Task<WorkspaceState> Apply(WorkspaceUpdate next, string operationId, long expectedRevision)` and `Read()`. Only the authorized Workspace app/session input path may apply; state validates references, uniqueness, and focused-id membership. C# Workspace policy computes open/focus/close/reorder effects; the state neuron does not decide an Ino fallback or compose a scene. Reuse revision infrastructure and bind operation ids to payload digests.

- [ ] Add `PersonAndDocumentCanRemainOpen`, `DuplicateOpenFocusesExistingView`, `SameOperationDifferentPayloadIsRejected`, `CloseLastViewLeavesNoFocus`, and `ReactivationPreservesOpenOrder`.
- [ ] Add `BackgroundCompletionCannotReopenClosedView`, `OldSessionEventCannotChangeNewAccount`, and `TwoDevicesDoNotStealFocusButSharePins`.
- [ ] Implement invariant-only state mutation and C# policy helpers; eliminate the `IsApp` restriction and automatic Ino seed for a restored empty workspace.
- [ ] Remove synchronous `ISpace.Rebuild` product coupling; emit workspace facts for app composition synapses to observe.
- [ ] Test crash/retry between command handling and root publication: accepted state is authoritative and composition reconstructs it.
- [ ] Run workspace facts and transport DTO tests; commit state + policy + mirrors.

**Exit gate:** close/focus behavior is testable state and C# app policy, not a renderer convention.

## T05 — Generic layout, input, and viewport primitives for a real workspace

**Covers:** U03–U07/U10–U11, V09–V12, W11/W15, Q08–Q09. **Depends:** T02–T04.

**Files:** `FC/Layout/ILayout.cs`, `FR/Layout/LayoutNeuron.cs`, `FC/Collection/ICollectionView.cs`, `FR/Collection/CollectionNeuron.cs`; `DU/composition/neuron_view.dart`, `DU/composition/ui_collection_view.dart`, `FR/Shared/CompositionValidation.cs`, `FR/Shared/AppUiEndpoints.cs`; **new** `FC/UiStyle.cs`, **new** `FC/UiSemantics.cs`, **new** `FC/UiInteraction.cs`; `FT/Composition/CompositionFacts.cs`; `D/ui/test/composition/primitive_surface_test.dart`, `short_layout_test.dart`, `ui_collection_view_test.dart`.

**Interfaces:** extend existing layout with typed padding/alignment/constraints/flex/overflow/adaptive rules rather than a new layout runtime. Add common `UiInteraction` identity (target, action, context, expected revision, operation id) with typed payload variants. Reuse collection cursor and wire a typed `RequestPage(cursor, requestId)` signal; a C# producer supplies the next page. Keep local pointer/IME state out of persistent geometry updates.

- [ ] Add fixture: generic column with flex viewport and fixed minimum-height bottom row containing leading/flexible-center/trailing groups; render at 1440×900, 390×844, and 200% text scale without overflow.
- [ ] Add `EditThenSubmitPreservesOrderAndContext`, `FailedOptimisticSelectionReconciles`, and `OldContextSubmitCannotSendToNewConversation`.
- [ ] Add `CollectionRequestsCursorAndDoesNotDuplicatePage`, `PageFailureRetainsExistingItems`, and 10000-item bounded-mount test with 50-item pages.
- [ ] Implement layouts, stable child keys, visible-range hosting, input envelope, and generic anchoring/overflow; no profile/dock-specific widgets.
- [ ] Extend generic controls needed for launcher, pins, focus, close, and menus. Reuse existing Material/native widgets for semantics rather than drawing all controls in Flame.
- [ ] Run module composition and Dart UI suites. Hot reload and inspect the generic fixture through neuron state plus rendered output; commit.

**Exit gate:** a bottom workspace bar is expressible entirely as ordinary typed composition.

## T06 — Ship Workspace and Launcher as C# apps

**Covers:** A01–A05/A12/A14, W01/W09–W15, O05, Q11. **Depends:** T03–T05.

**Files:** **new** `features/os/Workspace/{app.cs,Workspace.cs,Navigation.cs,open.cs,input.cs,changed.cs}`; **new** `features/os/Launcher/{app.cs,Launcher.cs,open.cs,query.cs,activate.cs}`; `AR/Features/FeatureCatalog.cs`, `AR/Features/FeatureReconciler.cs`; `DS/workspace/workspace_app.dart`, `DS/space/space_controller.dart`; **new** `DS/workspace/workspace_root_host.dart`; existing OS shipped-app acceptance fixtures.

Use separate one-reaction files where signal sources differ. `Workspace.cs` composes roots from state; `Navigation.cs` computes policy. Suggested operations: `open`, `focus`, `close`, `pin`, `unpin`, `reorder`, `launcher`. The launcher searches authorized installed apps/people/commands and emits an authorized target intent. It does not install an app when browsing it.

- [ ] Define app manifests/specs and generic host boot contract. First-run bootstrap explicitly installs required OS apps; adding feature folders alone is insufficient for existing brains.
- [ ] Compile bundles through existing app pipeline; correct missing contracts rather than patching product behavior into Dart.
- [ ] Replace top-level sphere hosting with generic root mount. Keep identity/connection/recovery mechanics in the connector.
- [ ] Compose pins/open views/Ino/usage slots and empty canvas in C#. A pinned open target appears once, with focus/attention state.
- [ ] Drive live open person/app, reorder/pin, close last, reconnect, and restart through MCP; compare persisted state and root contents.
- [ ] Change bottom-bar ordering in the Workspace program and verify the connected UI changes without a Flutter rebuild. Revert only the intentional experimental ordering, not user state.
- [ ] Exercise invalid workspace publication and known-good recovery. An edited Workspace copy is not overwritten by feature reconciliation.
- [ ] Commit only after recorded live acceptance; retain a reversible cutover flag/config at the boot boundary during integration, not two simultaneously active composition owners.

**Exit gate:** full canvas and bottom bar are genuinely app-authored, not a hard-coded preview of the mockup.

## T07 — Usage facade and C# Usage app

**Covers:** O01–O04, A11, W09. **Depends:** T01/T05–T06.

**Files:** inspect `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/ComputeEndpoints.cs`, `IUsageGrain.cs`, `UsageGrain.cs`, and existing ledger authority; **new** module under `src/DigitalBrain.Modules/DigitalBrain/Usage/` following current Contracts/implementation/tests module pattern; **new** `features/os/Usage/{app.cs,Usage.cs,open.cs,changed.cs,grouping.cs}`; `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`; retirement target `DS/workspace/compute_usage_panel.dart`.

**Proposed facade:** `IUsage.Read(UsageQuery query)` returns authenticated account balance, scoped brain spend, period, freshness, and grouped rows; `UsageChanged` invalidates views. Query permits bounded grouping (`app`, `synapse`, `neuron`, `kind`, `origin`), bounded period, and paged recent receipts. Platform adapter reads kernel facts; it cannot expose arbitrary ledger mutations or simulated credit.

- [ ] Add `UsageReadCannotCrossAccountOrBrain`, `UnavailableIsNotZero`, `GroupingAndPeriodAreBounded`, and `AppCannotCreditBalance` module tests with real caller scopes.
- [ ] Implement facade and platform adapter at existing dependency boundaries; do not reference platform implementation from scripts or module contracts.
- [ ] Compose compact balance and full Usage views with generic text/table/select primitives; group/period selection is C# state.
- [ ] Replace Dart-owned 30-second product polling with typed updates plus a documented recovery read strategy. Preserve cost attribution and stale/error timestamps.
- [ ] Drive a real metered action; confirm receipt, bottom balance/spend, grouping, and telemetry match. Use test credentials/test account for any generated usage.
- [ ] Run facade/platform tests, live scenario, and commit. Do not remove the old route until T15 confirms every entry point has moved.

## T08 — Ino, Account, Settings, Connections, and existing app migration

**Covers:** O05–O10, V01/V04/V11, W17–W18, U13. **Depends:** T03/T05–T07.

**Files:** `features/os/Ino/{app.cs,Ino.cs,open.cs}`; `features/os/Assistant/`; `features/os/Settings/`; `features/os/Files/`; other current Present callers identified by LSP; **new** `features/os/Account/` if existing Settings cannot cleanly own account UI; `DS/workspace/workspace_app.dart`, `workspace_settings.dart`, `model_settings.dart`, `csharp/`; `DU/chat/`, `DU/models/ui_part.dart`.

- [ ] Map every existing sphere/Side/Main presentation and native special-screen route. Preserve content currently in Side by moving it into app-declared layout; do not silently discard it.
- [ ] Migrate Ino to full conversation and compact/status presentations; its bottom access focuses the existing view. Do not duplicate Assistant state.
- [ ] Compose Account/Settings/Connections/build/file-management views in C# using existing secure connectors and generic forms. Keep OAuth/browser/system prompts as connector/platform capabilities.
- [ ] Consolidate chat-embedded roots with viewport contract; keep conversation identity, draft, read receipt, and voice capture context stable on remount.
- [ ] Add module/renderer regression cases for account switch with in-flight reads, changed settings, failed connection, headless apps, and preserved draft.
- [ ] Compile each changed feature bundle and drive its visible behavior live. Run relevant UI/module checks; hot reload; commit per independently completed migration.

**Exit gate:** no ordinary user-facing Settings/Usage/Connections/build screen needs a dedicated product Dart widget to exist.

## T09 — Full-workspace profiles, explicit Discover, and private/shared app visibility

**Covers:** S01–S14, W02/W13/W18, V13, A08–A10. **Depends:** T01/T03–T06/T08.

**Files:** `features/os/Friends/`, `features/os/Circle/{CircleView.cs,PublicationUi.cs}`, `features/os/CircleRoom/`; **new** `features/os/Discover/` and **new** `features/os/Profile/` only as ordinary UI compositions reusing existing domain sources; `C/DigitalBrain.Modules.Circles/CircleFactoryNeuron.cs`; `FR/Space/SpaceNeuron.cs`, `FR/Space/CircleMembers.cs`; `AR/Apps/AppNeuron.Publications.cs`, `AC/Apps/IApp.cs`, `AC/Apps/AppPublication.cs`, `AR/Marketplace/AppInstaller.cs`; `AT/Apps/AppPublicationFacts.cs`, `AppInstallerFacts.cs`.

**Decisions:** canonical person identity is account/principal-backed; brain ids and publisher handles remain distinct. Opening a profile is a view of authorized identity/data, never installing a person's app. Current public export stays public for already-public releases; private/shared distribution requires explicit visibility metadata and access checks on export/listing/assets/watch, not merely hiding a row.

- [ ] Add `ProfileUsesStablePersonViewIdentity`, `PublicListingExcludesPrivateAppsAndStars`, `SharedReleaseRequiresCurrentMembership`, and `RevokedMemberLosesNestedView` server cases.
- [ ] Add `ForkCopiesExactDigestWithoutConnectionsOrPrivateState`, `DuplicateForkReturnsSameReceipt`, and `NameCollisionDoesNotReplaceExistingApp` against common installer.
- [ ] Implement scoped social read/projection contracts and move profile/post composition out of SpaceComposer/AppUiEndpoints branches into apps.
- [ ] Compose profile Posts/Apps/Starred and conversation sections in one view. Use flat rows and named viewport variants; no sidebar required.
- [ ] Compose explicit Discover app with paged feed/search. It opens only from an intentional launcher/pin/action; completion never makes it a new default.
- [ ] Drive profile open, tab switch, message action, star, exact fork, edited origin, missing release, and revoked access through MCP and visible UI. Confirm traces and commit.

**Exit gate:** social browsing and fork loop work with truthful static/read-only previews before live demo execution is added.

## T10 — Isolated interactive previews (separate release gate)

**Covers:** V13–V15, S07–S10. **Depends:** T01/T03/T09; not required for static-preview milestone.

**Files:** `AC/Apps/AppPublication.cs`, `AR/Apps/AppNeuron.Publications.cs`, common loader/runtime admission owners found via LSP; **new** `AC/Apps/AppPreview.cs`; **new** `AR/Preview/PreviewNeuron.cs`; **new** `AT/Apps/AppPreviewFacts.cs`; profile/discovery preview synapses.

**Proposed interface:** `IAppPreview.Start(AppPublicationRef release, Guid operationId)` produces an isolated viewer-scoped instance reference, explicit expiry and budget; `Stop(Guid operationId)` disposes temporary execution. Use the common bundle loader and restricted execution identity, not a second interpreter. Static previews remain selectable and have no execute side effect.

- [ ] Set the initial demo policy to synthetic sample data, no external connection bindings, no paid inference allowance, one active demo per viewer, and 15-minute maximum lifetime. Apply the existing sandbox CPU/memory quotas as enforced ceilings; if those quotas cannot bound a demo, keep Start disabled until enforcement exists. Cancellation/restart must trigger expiry cleanup.
- [ ] Add `ScrollingPreviewDoesNotExecute`, `DemoCannotReadPublisherData`, `DemoCannotUseUndeclaredExternalConnection`, `ExpiredDemoStopsAndCleansUp`, and `ForkDoesNotImportDemoState`.
- [ ] Implement admission and sample-data protocol; show explicit Try action/cost context only where execution is needed.
- [ ] Verify compact→full uses the same demo, Stop actually stops it, usage is attributed correctly, and simultaneous viewers cannot share private state.
- [ ] Run module and live acceptance; commit. If resource isolation cannot be proven, keep previews static and report this milestone blocked rather than shipping uncontrolled execution.

## T11 — Complete the shared design and accessibility vocabulary

**Covers:** U06–U09/U12/U14–U18, W11/W15, Q06. **Depends:** T02/T05; can progress while social views are composed.

**Files:** `DU/theme/ui_tokens.dart`, `ui_theme.dart`; shared metadata from T05; primitive contracts and neuron renderers; `DU/components/workspace/ui_workspace_components.dart`; `D/ui/test/workspace_visual_test.dart`, `workspace_components_test.dart`, `workspace_chat_theme_test.dart`; **new** `D/ui/test/composition/semantics_test.dart`.

- [ ] Add semantic accent separate from success; preserve baseline spacing 8/16/24, radii 10/18, durations 120/200 ms and typography specified in the design.
- [ ] Add a theme/root token publication mechanism, scoped app overrides, roles/emphasis, and local platform text-scale/high-contrast resolution.
- [ ] Complete priority palette gaps using existing primitives: image/progress/toggle/slider and generic overlays/menus, then remaining kinds only when truly supported. Update capability fixtures with each increment.
- [ ] Complete DateTime/MultiChoice/Reference form semantics before advertising them as dedicated inputs; file attachments use bounded binary references rather than UTF-8 decoding arbitrary bytes.
- [ ] Add keyboard traversal, focus restoration, Escape dismissal, accessible labels/roles/disabled reasons/live errors, RTL, 200% text scale, and narrow-view tests.
- [ ] Render the accepted profile/workspace reference and a mixed generated app. Compare visual hierarchy, spacing, controls, and state; measure contrast rather than relying on palette names.
- [ ] Run UI/contract tests, inspect on target devices, hot reload, and commit per generic capability. No isolated profile-specific style patch in Dart.

## T12 — Align Creator and examples with the actual app UI contract

**Covers:** O08, U18, A13–A14, Q11. **Depends:** T02–T06/T11 core vocabulary.

**Files:** `AR/Authoring/AgentPrompts.cs`, `AR/Apps/Creator.cs`, `AR/Apps/FastPath/SynapseWriter.cs`; existing sandbox/contract catalog examples identified through LSP; `AT/Apps/AppCreatorFacts.cs`, `AppRuleFacts.cs`, `FastPathFacts.cs`; representative first-party app sources.

- [ ] Add authoring contract tests asserting generic Present/variant requirements, no obsolete manifest-entry advice, no sphere requirement, and truthful supported-kind discovery.
- [ ] Teach startup composition versus domain operation, stable keys, semantic tokens, explicit publication readiness, contexts, and compact/full variants using actual compilable examples.
- [ ] Ensure both full Builder and fast-path writer receive capability availability and cannot invent unsupported kinds.
- [ ] Generate calculator, tracker, timer, conversation, and mixed-content apps through actual Creator flow. Compilation plus visible results is required; no custom Dart per generated app.
- [ ] Request an unsupported capability and verify a specific refusal/remediation path rather than a fabricated UI.
- [ ] Run Apps tests, compile examples, drive generated apps live, record results, commit.

## T13 — Generic motion and Flame correctness

**Covers:** M03–M15, U16–U17. **Depends:** T02/T05/T11.

**Files:** `LC/Scene/SceneDefinition.cs`, `BehaviorTree.cs`, `FlameSchema.cs`; `LR/Scene/SceneNeuron.cs`, `SceneValidation.cs`; `DU/flame/{scene_view.dart,scene_game.dart,node_components.dart,primitive_nodes.dart}`, `DU/flame/behavior/tree_runtime.dart`, `DU/flame/prefabs/sphere.dart`; scene module tests and `D/ui/test/flame/`.

- [ ] Add `ReportRejectsUndeclaredInput`, nonfinite/bounded input tests, and typed coordinate/velocity fixtures. Unknown node types do not bypass global validation.
- [ ] Add stale async read/scene switch tests, simultaneous x/y tween tests, and declared-property visual tests from T02.
- [ ] Define generic motion data with spring/easing target, interruption, pointer capture, cancel, and reduced-motion policy. C# declares; local engine interpolates.
- [ ] Remove app-specific default sphere behavior from renderer policy or explicitly scope it as a documented generic fallback. Accept trees only on capable nodes until generic execution is implemented.
- [ ] Add preference-toggle tests covering active trees/tweens/particles/camera/overlays, with no input lock and no motion replay after reconnect.
- [ ] Add scene semantics/keyboard alternative and resource bounds for total bytes, depth, tweens, particles, assets, finite transforms, and decoding.
- [ ] Demonstrate interruptible drag on a generated scene, record frame timing and accessibility results; run tests, hot reload, commit.

**Deferred:** arbitrary Flare/Rive files, custom shaders, complex vector editor, and general game engine extensions are P2 capability projects, not hidden promises of this work.

## T14 — Lifecycle, scale, and transport hardening

**Covers:** V07–V12, U11, Q04/Q07–Q10. **Depends:** T03/T05/T08/T13.

**Files:** `DU/composition/neuron_view.dart`, `ui_collection_view.dart`; `DU/flame/scene_view.dart`; `DC/neuron_channel.dart`, native/web channel implementations, signals client; owning server watch/lease paths identified via LSP; **new** UI/core lifecycle/scale fixtures alongside existing watch tests.

- [ ] Instrument reads, active subscriptions, mounted nodes, frame build/raster, event latency, asset allocations, and disposal counts with per-view attribution.
- [ ] Add snapshot/watch race, lease renewal, offline/reconnect, old generation response, duplicate page, and disconnect-during-submit tests.
- [ ] Exercise 10000 logical rows, 50-item pages, embedded compact apps, focus changes, and closing views. Mount only visible rows plus cache extent; offscreen app work is independent.
- [ ] Run a 30-minute mixed-view soak and compare subscription/memory baselines after closing everything. Investigate leaks instead of raising timeouts or adding polling.
- [ ] Record device/viewport/data/environment alongside p95 frame timings; target each build/raster stage under 16.7 ms at 60 Hz. Separate client-local feedback from server round-trip latency.
- [ ] Run native/web parity and appropriate module/renderer suites; commit verified fixes and evidence.

## T15 — Retire old product composition paths and validate rollout

**Covers:** A01–A02/A12/A14, O07, B11, Q12. **Depends:** M1 complete, relevant migrated views from M2/M3 accepted.

**Retirement files:** `FR/Space/SpaceComposer.cs`, product composition portions of `SpaceNeuron.cs`/`SpaceWatcher.cs`; `DS/space/neuron_space.dart`, `space_controller.dart` old sphere parsing; special-view branches in `DS/workspace/workspace_app.dart`; `DS/workspace/dock/dock.dart` as a product-specific host; dedicated native Usage/settings/configuration paths after their replacements run.

Do not delete generic scene access enforcement or app toolbar contracts merely because default workspace changes. Map every caller through LSP and keep optional scene apps supported. This task removes competing ownership, not useful generic capabilities.

- [ ] Add architecture checks banning product-specific composition owners/route branches in connector paths while allowing generic capability dispatch and trusted recovery infrastructure.
- [ ] Verify all source-of-truth consumers use typed workspace/app presentation state; no hidden Dart list of open apps or automatic route-derived focus remains.
- [ ] Test installation into fresh and existing test brains, edited shipped copies, failed Workspace update, and incompatible persisted-state detection.
- [ ] Resolve storage policy with the current runtime owner. Prepare backups and version-compatible restore rehearsal before live state change; no unconditional deletion or migration shim invented from old docs.
- [ ] Remove obsolete paths only after equivalent MCP/visual acceptance, then remove temporary cutover configuration so one root authority remains.
- [ ] Run affected architecture/module/UI tests and live cutover/recovery scenario. Commit removal separately for reviewability.

## T16 — End-to-end release proof and handoff

**Covers:** Q01–Q12 and all acceptance gates. **Depends:** prior release-scope tasks complete; explicit deferred P2/demo scope recorded.

- [ ] Confirm LSP diagnostics clean and run the command matrix below for affected projects/packages.
- [ ] Start the normal runtime (`dotnet run digitalbrain.cs`); inspect Aspire resources and resolve unhealthy dependencies before acceptance.
- [ ] Through digitalbrain-mcp, identify caller/brain, open/focus/pin/reorder/close person/app/conversation, fork exact publication, and inspect final state/roots after reconnect and restart.
- [ ] Match trace ids and structured logs to tested operations; record rejected forged/stale/revoked cases as well as success.
- [ ] Hot reload/restart connected Flutter and inspect actual rendered dark/light/narrow/large-text/keyboard/reduced-motion states. Follow repository verification tools; neuron state alone cannot certify pixels or accessibility.
- [ ] Verify one changed Workspace synapse updates the product without a Flutter rebuild and a new generated app needs no shell code.
- [ ] Save evidence to `docs/superpowers/reviews/YYYY-MM-DD-app-composed-workspace-acceptance.md` with versions, commands/results, screenshots, device info, telemetry references, and deferred capabilities.
- [ ] Review the diff against requirement coverage and residual risk. Hand off for design/implementation review before merge/deploy; do not label source-only findings as passing runtime evidence.

## Command matrix

Run from repository root unless a working directory is specified. Verify current project paths before execution. These commands are planned, not run in the audit.

```powershell
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/DigitalBrain.Modules.Flutter.Tests.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Flame/tests/DigitalBrain.Modules.Flame.Tests/DigitalBrain.Modules.Flame.Tests.csproj
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests/DigitalBrain.Architecture.Tests.csproj
```

From `src/DigitalBrain.Modules/Google/Flutter/app/ui`, then `app/core`, then `app/shell`, run `flutter analyze` and `flutter test` for the affected packages. Add module-specific E2E/OS scenarios and the new Usage module test project when created. Framework/platform/circles changes require their own targeted builds/tests too; use LSP impact mapping to select them. No solution-wide build.

## Requirement coverage map

| Requirements | Tasks |
|---|---|
| A01–A05 | T04–T06, T15 |
| A06–A12 | T01, T03, T06, T07, T15 |
| A13–A14 | T02, T06, T12, T16 |
| W01–W08 | T04, T06, T16 |
| W09–W15 | T05–T08, T11 |
| W16–W18 | T04, T08–T09 |
| V01–V08 | T03–T05, T14 |
| V09–V12 | T05, T14 |
| V13–V15 | T09–T10 (live demos gated separately) |
| V16 | T02–T03, T12 |
| U01–U05 | T02, T05 |
| U06–U10 | T05, T11 |
| U11–U13 | T05, T08, T11, T14 |
| U14–U18 | T02, T11–T13 |
| M01–M04 | T02, T13 |
| M05–M14 | T13–T14 |
| M15 | Explicit P2 capability project; not first-release scope |
| S01–S14 | T09; T10 for executable demos; T08 for conversations |
| S15 | Explicit public-launch gate: block/report/abuse subplan before open-community rollout |
| O01–O04 | T07 |
| O05–O10 | T06–T08, T12 |
| Q01–Q12 | T01–T16, with final evidence in T16 |

## Plan self-review and execution checkpoint

The plan distinguishes existing mechanisms from proposed interfaces, traces requirements to tasks, and names the code owners and verification needed. It is deliberately staged: the workspace proof precedes broad social features, private distribution precedes runnable previews, and the old shell is removed after equivalent paths work.

Before coding, review the architecture decisions in the spec: generic named presentations, device-local focus/shared pins, assignment/grant enforcement, first-run/recovery policy, and preview isolation. Runtime-specific exact execution-stamping and storage-rollout decisions require T01/T15 evidence and must not be guessed. The proposed contract shapes are sufficient to start those bounded design/verification tasks but are not pre-approved production APIs.

Suggested execution: native implementation one milestone at a time, with independent review at each authority/contract boundary. The tightly coupled state/root/renderer work benefits from one implementer owning those interfaces. This suggestion is not an instruction to begin execution; the current request ends with the reviewable requirements, audits, and plan.
