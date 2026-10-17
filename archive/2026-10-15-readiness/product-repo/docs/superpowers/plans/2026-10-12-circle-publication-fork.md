# Circle publication and fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native execution was already selected. Steps use checkbox syntax for tracking.

**Goal:** Publish immutable app releases into Circle, then install the selected release into a personal brain or a member's circle and prove both copies execute in the running app.

**Architecture:** Retain releases on the existing app neuron, derive the feed from marketplace discovery, and extend the existing loader with atomic create-only installation. Circle factory and circle contracts enforce destination ownership; existing typed UI renders the journey. A generic shell navigation action carries explicit user navigation across brains without granting membership.

**Tech Stack:** Existing C#/Orleans contracts and state, Apps/Circles modules, runtime C# feature behaviors, Flutter typed controls and workspace connector.

**Spec:** `docs/superpowers/specs/2026-10-12-circle-publication-fork-design.md`, approved 2026-10-12.

## Global Constraints

- Preserve existing identity and Assistant changes, original workspace state and all benchmark evidence. Work in the current checkout for the requested local running-app workflow; do not reset storage or bulk-stage unrelated files.
- Public forks require sign-in, not friendship; circle installation requires current destination membership. Never trust a client-supplied publisher or bringing-member identity without resolving it against server state.
- Exact reference means publisher, source account/brain, app name, version and digest. No fallback to latest or private draft history.
- Use concrete arrays in grain state and existing compile-gated app loading. No new runtime, executable post format, permission bypass, Assistant routing change or generic UI DSL.
- Read-only preview only. No Try live, friendship implementation, 3D renderer or public deployment in this plan.
- LSP definition/reference/implementation/incoming-call mapping precedes C#/Dart edits. Map runtime feature call shapes as well; compiler/live checks cover sites outside the solution index.
- Run tests per project, never the solution. No timeout increases or readiness polling added to conceal failures.
- Keep changes uncommitted through live verification to preserve the current mixed working tree. Record scoped file lists and task results in `.superpowers/sdd/2026-10-12-circle-publication-fork/progress.md`; integration is separate.

## Review Focus

1. Same version label with changed content, including delete/recreation: stale posts never install substituted code (Task 1).
2. Concurrent imports and a lost response: no replacement, duplicate deployment or overwrite of subsequent user edits (Task 2).
3. A former member retries a previously authorized circle operation: membership is checked again before any change (Task 3).
4. A publication disappears or one publisher is offline during feed loading: successful cards remain, failures are visible, and selection does not silently change (Tasks 3–4).
5. A remount or delayed UI signal arrives after selecting another release: only the submitted immutable reference is installed, and completion never steals focus (Tasks 4–5).

## Task 1: Retain and export immutable published releases

**Files** (under `src/DigitalBrain.Modules/DigitalBrain/Apps/`):
- Create `DigitalBrain.Modules.Apps.Contracts/Apps/AppPublication.cs` for reference and public summary records.
- Create `DigitalBrain.Modules.Apps/Apps/AppPublicationDigest.cs` for deterministic hashing.
- Modify `DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs`, `DigitalBrain.Modules.Apps/Apps/AppState.cs`, and `DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`.
- Create `tests/DigitalBrain.Modules.Apps.Tests/Apps/AppPublicationFacts.cs`; retain existing `AppPublishFacts` and `AppRetentionFacts` coverage.

**Interfaces:**
- `AppPublicationRef(string Publisher, AppSource.Brain Source, string Name, string Version, string Digest)`.
- `AppPublication(AppPublicationRef Reference, DateTimeOffset PublishedAt, AppManifest Manifest, string? Preview)`.
- `IApp.PublishedReleases() -> Task<AppPublication[]>`, public/read-only.
- `IApp.ExportRelease(string version, string digest) -> Task<AppBundle>`, public/read-only; this is distinct from private `ExportVersion`.
- `AppPublicationDigest.Of(AppBundle bundle) -> string`, lowercase SHA-256 hex, versioned canonical encoding. Hash manifest/spec/files, not configured settings/connections or runtime state. Sort JSON object property names and file paths ordinally, preserve array order, serialize UTF-8 with invariant JSON; prefix the canonical payload with `digitalbrain-release-v1`.
- State retains concrete release records containing the bundle, original publication timestamp, publisher/source and digest. Preserve the existing latest `Published` field for current consumers.

- [ ] Map `Publish`, `ExportPublished`, `ExportVersion`, `Import`, `Replace`, `Delete`, `AppState.Clone` and contract callers through LSP. Inspect the current .NET SHA-256/JSON APIs through official docs before implementation.
- [ ] Write regression facts: `PublishedReleaseSurvivesMoreThanTwentyDraftEdits` publishes A, performs 25 edits, publishes B and requires A's files/manifest/digest; `DraftVersionsAreNeverPublicReleases`; `RepublishingIdenticalContentKeepsItsTimeAndDigest`; `ChangedContentCannotReuseAPublishedVersion`; `RecreatedAppCannotSatisfyAnOldDigest`; `DigestIsIndependentOfDictionaryInsertionOrder` and changes with manifest/spec/file changes.
- [ ] Run `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*AppPublicationFacts*"`. Expected RED: missing new API/types or assertions demonstrating current single-release behavior.
- [ ] Implement retention only after compile success. Before first append, preserve an existing legacy `Published` record using its stored timestamp. Reads also include that record before another publish, without mutating on a read. Republish repairs the existing marketplace listing without changing publication identity. Use publication records, never draft history, for public reads. Unknown or mismatched release throws not-found; deleted app has no public releases.
- [ ] Use `preview.txt` as the optional published sample, capped at 16,384 characters for the public summary. Preview is returned as plain text; its complete original file still participates in the digest. No workspace reads or remote assets.
- [ ] Run the Apps suite above without the filter; expected PASS. Record clean LSP diagnostics and the verified behavior before Task 2.

## Task 2: Exact, create-only installation with safe retries

**Files** (same Apps root):
- Modify `DigitalBrain.Modules.Apps.Contracts/Apps/AppOrigin.cs`, `.../Apps/IApp.cs`, `DigitalBrain.Modules.Apps/Apps/AppState.cs`, `.../Apps/AppNeuron.cs`, `.../Features/FeatureLoader.cs`, `.../Marketplace/AppInstaller.cs`.
- Create `DigitalBrain.Modules.Apps.Contracts/Apps/AppInstallReceipt.cs` and `tests/DigitalBrain.Modules.Apps.Tests/Apps/ExactAppInstallFacts.cs`.

**Interfaces:**
- Extend `AppOrigin` with optional `PublicationDigest` and `InstalledByAccount` fields. Existing constructors keep their defaults.
- `AppInstallReceipt(Guid OperationId, AppPublicationRef Publication, string TargetName, string AccountId)`; destination is the target neuron key. Persist this receipt atomically with the first import, outside the bounded generic receipt cache.
- Extend `IApp.Import(AppBundle bundle, AppOrigin? origin = null, AppInstallReceipt? installation = null)`. Ordinary import retains existing behavior. When installation is supplied, validate its name/source/version/digest/account against bundle, origin and stamped caller.
- `FeatureLoader.Create(string brain, string name, AppBundle bundle, AppOrigin origin, AppInstallReceipt installation, CancellationToken ct) -> Task<AppSnapshot>` calls Import directly; it never checks Read and switches to Replace.
- `AppInstaller.InstallPublication(AppPublicationRef publication, string targetName, Guid operationId, CancellationToken ct) -> Task<AppSnapshot>` resolves catalog/source/exact export and uses `BrainScope.CurrentId()` as destination. Existing `Install`/`Update` signatures stay unchanged.

- [ ] Map Import/Replace/Land/Origin/loader callers and tests via LSP. Map `AppOrigin` Dart consumers; optional extra JSON fields must not break their current parsing.
- [ ] Write RED facts for installing A after B; default settings and empty connections; unknown digest/source rejected before target creation; two concurrent creates for the same name yield one copy without Replace; a new operation ID on an occupied name conflicts; identical operation returns the existing copy without repeating successful deployment; changed parameters under the same ID fail; retry cannot replace a subsequently edited copy.
- [ ] Run `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*ExactAppInstallFacts*"`. Expected RED on missing exact-install API or create/retry assertions.
- [ ] Implement catalog publisher/source checks and exact export. Refuse empty operation IDs and invalid target names before writes. Preserve original name/version/digest in origin when the local name differs. A same-brain fork is allowed under a distinct unused target name.
- [ ] In the target neuron, match persisted receipt before accepting a retry. A successful or subsequently edited copy is returned without redeployment; a failed/deploying, unedited copy may resume only when its current program still matches the original receipt. Never replace its program on retry. A mismatched receipt is a conflict. Existing non-install imports still reject occupied names.
- [ ] Persist installed program, provenance and receipt before deployment as the existing Land path does. Failure stays Failed/Deploying with its receipt, enabling truthful recovery. Ensure normal updates do not leave an old digest falsely describing newly installed content: exact installs preserve the digest, latest updates recompute the release digest or clear that optional field when unavailable.
- [ ] Run full Apps suite; expected PASS. Include storage/reactivation round-trip coverage for release and receipt records.

## Task 3: Typed Circle browsing and member-authorized destination

**Files** (under `src/DigitalBrain.Modules/DigitalBrain/Circles/`):
- Modify `DigitalBrain.Modules.Circles.Contracts/DigitalBrain.Modules.Circles.Contracts.csproj` to reference Apps.Contracts, plus `ICircleFactory.cs` and `ICircle.cs`.
- Create `DigitalBrain.Modules.Circles.Contracts/CirclePublications.cs` for the feed result records.
- Modify `DigitalBrain.Modules.Circles/CircleFactoryNeuron.cs` and `CircleNeuron.cs`; use existing Apps registration and loader rather than another host/coordinator.
- Create `tests/DigitalBrain.Modules.Circles.Tests/CirclePublicationFacts.cs` using `CircleBrainRooms`.

**Interfaces:**
- `CirclePublicationFeed(AppPublication[] Items, string[] UnavailablePublishers, string PrincipalId)`; failures carry publisher labels, no exception/credential dumps.
- `ICircleFactory.Publications(string? publisher = null) -> Task<CirclePublicationFeed>`.
- `ICircleFactory.Fork(AppPublicationRef publication, string targetName, Guid operationId) -> Task<AppSnapshot>`.
- `ICircle.BringPublication(AppPublicationRef publication, string targetName, Guid operationId) -> Task<AppSnapshot>`.
- Long-running fork/bring contracts use the existing ten-minute response-timeout convention for app deployment; this is contract parity, not increasing a failed readiness timeout.

- [ ] Map factory Own/Create/Circles and circle MemberChange/Share/CommitCore through LSP, including script identity propagation. Inspect `BrainKind` lookup and require a personal destination for factory Fork; ordinary scope equality alone does not distinguish a circle.
- [ ] Add RED facts: feed returns A and B sorted by publication time then stable reference; optional publisher filter; unavailable source returns partial results with notice; personal fork uses the stamped personal brain; non-owner member can bring A; outsider and removed member cannot bring or retry; no publisher connections copied; origin records publisher and bringing account separately; occupied circle name is untouched; deployment failure remains inspectable and retry reconciles SharedApps exactly once.
- [ ] Run `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests -- --filter-method "*CirclePublicationFacts*"`. Expected RED: new contracts absent.
- [ ] Implement feed discovery using marketplace brain-source listings and public `PublishedReleases`, excluding shipped folder entries without retained releases. Sort deterministically; never fail the entire successful subset because one source is unavailable. Factory reads/Fork call Own and validate personal ownership; return server-stamped PrincipalId for My profile.
- [ ] Bring calls MemberChange before resolving/installing and on each retry. Use the Apps installer in the already stamped circle scope. After failure, read the target and add it to SharedApps only if its persisted receipt matches this operation/account/reference; then propagate the deployment failure. Do not import or share connections. Keep existing Share semantics unchanged.
- [ ] Run full Circles and Apps suites, plus `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`. Expected PASS; no new implementation-ring dependency beyond the existing Circles-to-Apps reference.

## Task 4: Circle UI, immutable selection and explicit cross-brain navigation

**Files:**
- Modify `features/os/Circle/app.cs`, `CircleView.cs`, `open.cs`; add `Publications.cs`, `navigate.cs`, `activate.cs`, `fork.cs`.
- Modify `features/os/CircleRoom/app.cs`, `Room.cs`; add `publication.cs`, `bring.cs` and `PublicationView.cs`.
- Map then minimally extend `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart` and, if needed for the existing host callback, `workspace_desktop.dart`.
- Add `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/workspace_publication_navigation_test.dart`. Extend generic UI tests only where renderer behavior changes; feature behavior acceptance runs in the real app, per CLAUDE.md.

**UI interfaces and state:**
- Retain Circle's `surface` entry. Use `ICollectionView` for Feed/profile cards and breadcrumbs, `ICard` for static metadata/preview, `IForm` for target name, and `IButton` for explicit commands. Set `FileMode=false` for publication lists.
- Store authoritative navigation as JSON in `{app}/navigation` through existing `IText`; keys are `page`, `publisher`, `publication`, `operationId`. Derived card text and layout are not navigation authority. A form key is scoped by selected publication digest so delayed events cannot target a different release.
- New Circle operations: `navigate` accepts navigation JSON; `fork` accepts the complete publication reference, target name and operation ID. Existing `open` refreshes current navigation, never resets it. Existing `create` remains available.
- New CircleRoom operations: `publication` accepts the exact reference to display/confirm; `bring` accepts reference, name and operation ID. CircleRoom retains chat and existing sharing controls while adding the publication pane.
- Generic button activation payload: `{kind:"workspace", brainId, application, operation?, input?}`. The shell validates brainId against authenticated `/identity/brains`, selects/hydrates that workspace through its existing store/controller path, opens the app's manifest entry, and issues an explicit optional `IApp.Request(operation,input)` in that destination. This is a user click action, never automatic completion behavior. No arbitrary URL, contract name or JavaScript execution is accepted.

- [ ] Map actual typed-control signals, Form.Define preservation, Button.SetActivation, shell activation handlers, identity brain refresh and workspace Open through LSP. Verify caller identity propagation on AppRequested before relying on it for Fork/Bring; tests must assert the member account reaches the contracts.
- [ ] Write widget RED tests for the generic activation: an authorized destination receives the explicit operation/input; unknown/nonmember brain causes no open or request; opening preserves other workspaces' drafts; navigation failure keeps the current view; the immutable reference is passed without resolving latest. Run `flutter test test/workspace_publication_navigation_test.dart` from the shell; expected RED.
- [ ] Implement the generic navigation action through existing membership and workspace APIs. Keep all normal button/content activation working. Tests must cover both remote-managed typed windows and any legacy hosted-surface callback that remains supported.
- [ ] Compose Feed/My profile/Circles and readable collection breadcrumbs. Load summaries through Task 3; card activation carries the full exact reference. Render `preview.txt` as plain text through card body, not markdown with remote embeds. Show “No sample preview published.” when absent and a partial-feed retry notice when needed.
- [ ] Initialize target name once per selected publication; preserve form draft on refresh. Fork/Bring submission captures reference/name/account-bound operation ID before running. Replayed explicit action reuses the ID; changing name or publication creates another ID. Handle only explicit activation/submit signals, not configuration notifications.
- [ ] For Bring, list membership-derived circle choices; clicking one uses the generic workspace activation to show CircleRoom's exact-publication confirmation. Installation occurs only on that destination's explicit confirmation. Do not call a circle under a fabricated personal-brain scope.
- [ ] After install, show version/provenance and actual deployment state. Missing declared connections show Needs setup; link to the existing app configuration view using the shell's current mechanism. Show Open app only as an explicit action. An unavailable source/name conflict retains the form and selection. Refresh/reconnect/late completion may update content, never focus or window membership.
- [ ] Advance the actual current Circle and CircleRoom feature versions by one patch after inspecting them; do not overwrite an independently changed version. Validate complete feature bundles with the existing compiler/catalog path.
- [ ] Run shell `flutter analyze` and `flutter test`, and the Flutter module test project `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests`. Expected PASS. Perform hot reload/restart if Dart changed; live feature update is Task 5.

## Task 5: Running-app acceptance, preservation and final review

**Files:**
- Create `docs/superpowers/reviews/2026-10-12-circle-publication-fork.md`.
- Create live harness/evidence under a fresh timestamped child of `artifacts/circle-publication-fork/`. Reuse the authenticated native probes from `artifacts/vlad-local-identity/` and workspace snapshot logic from `docs/superpowers/loop/assistant-benchmark.py`; never overwrite prior labels/artifacts.

- [ ] Capture the current principal/account, selected project/conversation, draft, focus, open-window set and feature versions. Save a scoped git status/diff inventory so existing identity/Assistant work is distinguishable.
- [ ] Build affected projects individually, start/update Aspire normally, inspect unhealthy logs before proceeding, and verify active resources Running/Healthy. Apply feature changes through the normal catalog reconciliation/update path. Inspect installed Circle/CircleRoom source/version; source edits alone are not deployment evidence.
- [ ] Sign in as Vlad and a clearly labeled local test account. Create a test circle, invite/accept the test account through existing human routes, then use that non-owner member for Bring. Do not expose generated credentials in artifacts or logs.
- [ ] Build an echo app with `preview.txt`, execute A and publish A. Capture A's exact reference and files; make 25 draft edits, build/execute/publish B. Use actual Circle typed control events to open Vlad's profile, select A, fork A personally under a new name, and bring A into the circle under another name. Read both installed bundles and execute their echo operations: require A's output, not B's. Inspect original publisher and bringing account independently.
- [ ] Exercise a target-name conflict, invalid digest and outsider Bring; require no target mutation. Use a published connection-dependent app to verify Needs setup and empty recipient connections. Test refresh with a typed draft name and another focused window; require preservation and no second install.
- [ ] Restart/reactivate through the normal app path, re-read A and both copies, and retry the same successful operation ID. Require unchanged code/provenance and no duplicate shared-app entry or user-data reset. Test retry after membership removal through module facts and at least one authenticated runtime refusal.
- [ ] Prefer authenticated `digitalbrain-mcp` throughout. If the previously documented MCP machine/account boundary still fails, retain that failure and use authenticated OS HTTP/native gRPC plus shell inspection as the approved spec allows. Do not change membership or contract permissions to make verification pass.
- [ ] Confirm Aspire traces for publication, exact export/import, circle command and actual behavior execution. Record compile, deployment, successful execution and visual/control results separately. Retain failed attempts and do not convert an unobserved UI result into a pass.
- [ ] Restore original selected account/workspace, conversation, draft, focus and open-window set; compare to the saved snapshot. Keep and list intentional new test accounts/apps/circle. Do not reset storage or remove user work.
- [ ] Run one fresh final code review under requesting-code-review. Fix correctness/security findings with reproducing tests and rerun affected suites. Record unresolved limitations, review outcome, test commands and trace references in the report. Leave scoped changes reviewable and uncommitted.

## Plan self-review

All approved requirements have an owning task. The exact-release records from Task 1 are consumed unchanged by installation, Circle contracts and UI; private draft export remains private. Create-only retry authority lives in the target app neuron, rather than a read-before-write check in a service. The circle owns membership/indexing; the shell owns explicit cross-brain navigation; feature scripts own presentation. The newly identified generic navigation extension is included explicitly and does not give scripts permission to change identity. Live acceptance includes both destinations, older-version retention, execution and state restoration.
