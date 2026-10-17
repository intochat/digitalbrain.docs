# Circle: exact publications and two fork destinations

Date: 2026-10-12. Status: technical design approved by the user on 2026-10-12; implementation plan follows. The user has approved the product flow and requested implementation and live verification. This document resolves the contract and ownership changes that the previous product specification explicitly left open. Runtime code has not changed in this step.

## Outcome

Vlad publishes a working app. Circle shows that release in a feed and on Vlad's profile. A visitor inspects a read-only preview and chooses **Fork to my brain** or **Bring into a circle**. Both copy the exact selected release through the existing app loader, even after Vlad publishes a newer version or makes more than 20 draft edits.

Public forks require sign-in, not friendship. Circle installation requires membership of the destination circle. A preview never runs the publisher's app for the visitor. Try live, friendship management, public-domain deployment and the 3D renderer remain outside this slice.

## Current-source findings

- `AppNeuron.Publish` stores one `AppState.Published` record and replaces the marketplace listing. `ExportPublished()` returns that one record.
- `ExportVersion(version)` reads draft history, which is bounded by `MaxHistory = 20`. It is private and must stay private; making it public would expose unpublished drafts.
- `AppInstaller.Install` resolves the latest marketplace entry and calls the common `FeatureLoader.Load`. It rejects a name collision before loading, but the loader itself chooses Import or Replace, so a new-create operation must not rely on a read-then-load check to prevent concurrent replacement.
- `AppNeuron.Import` initializes default settings and empty connections. `Replace` preserves recipient settings, connections and data. These are useful existing ownership boundaries.
- `ICircle.Share` exports the member's personal app and can copy or share its connection bindings. It cannot represent an unrelated public author's release without changing attribution or performing an unnecessary personal install first.
- `CircleNeuron.MemberChange` checks the stamped account against the circle's membership. Existing circle state owns its shared-app list.
- `features/os/Circle` currently renders circle-index cards. It has no publication feed or fork controls. Existing typed cards, buttons, text, layouts and workspace navigation can represent this flow without a new renderer.

## Choice of approach

Retain releases on their existing app neuron and derive social presentation from them. Extend existing Circle contracts to browse these releases and choose a destination. Reuse the marketplace index for discovering publishers/apps and the app loader for installation.

Using the bounded draft history would be less work but cannot satisfy stable posts. A separate social executable store or a new publication runtime would duplicate the app's code and ownership. Neither is selected.

## 1. A post identifies immutable published content

Add an append-only collection of published release records to `AppState`, separate from draft history. Each record contains the published bundle, first publication time and a deterministic content digest. Use a concrete array in persisted state. Publishing appends only after the existing compilation gate succeeds.

A publication reference carries publisher, source account/brain, app name, version and content digest. The digest covers the manifest, specification and files in a deterministic order; it excludes recipient configuration and live state. Version alone is insufficient because import/replacement or delete/recreation can reuse a version label.

Publishing identical content at an existing version is idempotent: retain its original timestamp and reference. Publishing different content at an already released version is refused; the author must create a new version. Draft changes and draft-history pruning never alter a retained release.

Add public read-only methods on `IApp` for published summaries and exact published export. These methods expose only the retained publication collection. Keep private draft `ExportVersion` unchanged. Preserve parameterless `ExportPublished()` for existing latest-release consumers.

On first publication after this change, retain the existing `Published` record before appending a new release. This preserves the release currently available in Vlad's running workspace without resetting storage. No older discarded publication can be reconstructed; report that limitation.

Deleting an app keeps the existing deletion behavior: its catalog entry is removed and its retained releases become unavailable. Already installed forks remain independent. A stale publication reference must report unavailable, never install a newer version or content from a recreated app. The digest prevents accidental substitution after recreation. Permanent public archival after deletion is not promised by this first slice.

## 2. One installation path with explicit create semantics

Extend `AppInstaller` with exact-publication installation and an explicit target app name. Resolve the source through the catalog, verify that it matches the reference, obtain the exact retained release, then verify version and digest. Any mismatch or missing release fails before changing the target.

Add create-only semantics to the existing `FeatureLoader` path. The final write must use `IApp.Import`, whose neuron turn rejects an occupied name. Do not let a concurrent creation turn a fork into Replace. Existing update/reconcile callers retain their current replacement semantics.

Record the original publisher, source app and selected version in `AppOrigin`. Carry the publication digest and initiating member account with that origin as optional provenance fields, so a persisted or interrupted install remains attributable. The caller identity comes from the stamped context, never a client-supplied author field.

Settings start from published defaults; connections start empty; runtime data is not copied. Editing a copy retains its origin and the current `Edited` behavior. Updates remain explicit. Exact-version selection must not silently become latest-version selection on retry.

Use a caller-provided operation ID to identify a retry. A retry may resume only the same publication, destination, target name and initiating account. A different request for an occupied name returns a conflict. Do not use equality of version alone as permission to overwrite or restart an existing app.

## 3. Personal and circle destinations

Extend the existing personal `ICircleFactory` with publication browsing and personal-fork commands. Its key remains scoped to the caller's personal brain, with its existing ownership check. This gives the Circle app a typed contract for the social index and personal destination; it holds no duplicate code bundles.

Extend `ICircle` with a distinct public-publication installation command. It calls `MemberChange` before resolving or importing anything, then uses the exact installation path above. Do not alter `Share` or route public forks through its private connection-sharing behavior.

The circle's installed app keeps original publisher/version/digest provenance and the bringing member account. Its name joins `SharedApps` only after a persisted import can be read back. If runtime deployment fails, preserve the installed copy and show the failure; a retry reconciles circle indexing without losing provenance or creating a second copy. Membership must be revalidated on retries.

An installed copy with missing declared slots is shown as **Needs setup**, separately from deployment/execution status. The interface offers configuration using the recipient's existing connections. Do not label a compiled bundle or a Live deployment as evidence of a successful behavior execution. The live verification uses both a no-connection runnable app and a connection-dependent setup case.

## 4. Circle presentation and navigation

Extend Circle's existing typed surface and C# behaviors. Reuse the existing Flutter theme and control renderers. No Circle-only shell routing or second UI execution system.

- Top navigation: **Feed**, **My profile**, **Circles**. Profile and selected-publication pages use readable breadcrumb labels and Back.
- Feed cards show author, app title, exact version, publication time and description. Selecting the author filters to that publisher's profile; selecting the post opens its exact reference.
- The publication page shows immutable release metadata and declared connection requirements. A publisher may include a dedicated plain-text preview file in the published bundle; render it as text, without embedded remote assets or executable widgets. If absent, show the description and “No sample preview published.” Do not inspect or render the publisher's live workspace.
- The destination form shows the chosen release, a target name and either the personal brain or one of the caller's existing circles. Name collisions remain on the form with an actionable message and preserve the selection.
- Before installation, the action describes the chosen destination and required connections. Afterward, show the actual installed status and an explicit **Open app** action. Completion does not steal focus or reopen a closed window.
- Opening a circle destination uses the existing workspace brain-navigation path; the installation command runs in that circle's stamped scope. Scripts cannot invent membership by changing a brain ID.

Feed/profile data is a projection of marketplace discovery plus retained release summaries. Sort by publication time with a stable reference tie-breaker. Loading one unavailable publisher must not fabricate an empty successful feed: retain successful entries and show a retryable partial-load notice. This local first release can enumerate the catalog; pagination/indexing is a later scale concern, not a new state store in this change.

Navigation and selected publication are authoritative UI state. Rebuilding cards may update their text but must preserve selection, draft target name, focus and open-window membership. Subscribe to explicit user-action signals rather than treating configuration writes as clicks.

## 5. Verification and preservation

Use the existing module test harness and per-project suites. LSP-map every changed C#/Dart symbol and runtime-bound call shape before editing. Keep current identity and Assistant work uncommitted and intact.

Required regression cases:

1. Publish A, make more than 20 edits, publish B, then export and fork A: same version, digest, manifest and files as A; no private draft export.
2. Duplicate publication retains its identity/time; same-version different content fails; source deletion/recreation cannot substitute content for a stale post.
3. Personal fork preserves original provenance, starts with default settings and empty connections, and remains unchanged after an upstream release.
4. Concurrent target creation and name collisions cannot trigger replacement. Retry after a lost response resumes only its original operation.
5. A non-owner circle member can bring a public release into the circle; an outsider and removed member are refused. Original author and bringing member are distinct and retained across restart.
6. Installation failure leaves truthful persisted state and can reconcile the circle index on retry. A needs-setup copy is not advertised as a successfully executed app.
7. UI actions carry the selected immutable reference through profile navigation and destination choice; refresh does not reset selection or execute an install.

For live acceptance, capture the current account, conversation, draft, focus and window set into a fresh `artifacts/circle-publication-fork/` directory. Verify Aspire health. Use Vlad plus a clearly named second local test account and a test circle. Publish and run A, publish B, use Circle controls to fork A personally and bring A into the circle, then execute both copies and inspect their files and provenance. Exercise at least one collision and one authorization refusal. Restart/reactivate and repeat exact-version readback. Retain failed attempts and inspect Aspire traces for publish, import and behavior execution.

The existing separate-MCP membership problem is not evidence of a successful Circle flow. Prefer authenticated MCP; if it still fails, record that boundary and use authenticated native OS calls plus actual shell state inspection without widening permissions. Restore the original workspace state afterward; document newly created test identities/apps/circle separately.

## Scope and next handoff

This design extends existing Apps and Circles contracts and their UI. It does not change Assistant routing, introduce vector routing, create a generic social runtime, enable Try live or deploy `digitalbrain.tech/vlad`.

After review, write the implementation plan around four verifiable deliverables: immutable release retention; exact create-only installation; member-authorized circle installation; Circle UI and live acceptance. Preserve the already selected Native execution method.
