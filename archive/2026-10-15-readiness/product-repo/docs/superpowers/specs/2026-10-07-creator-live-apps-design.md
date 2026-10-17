# Creator and live apps: creation is not distribution

Ratified 2026-10-07. Supersedes the draft-pipeline model of app authoring. Related
issues: dissolves #137/#138/#141, requires #139/#140 first, carries #142.

## The diagnosis this design answers

Making an app for yourself traversed five aggregates — draft → package revision →
verification → publish → install → deploy — because creation was modeled as
distribution: packages, gates, receipts and generations exist so *someone else* can
safely get your app, yet they sat on the critical path of making one. There was no
first-class "app being created," only a batch compiler pipeline (`AppDraft.Build`:
attempts, document hashes, a grain locked through 3×12 model rounds) ending in a
distribution artifact shipped back to its own author. Key enabling fact: commits were
never green-gated — only `Publish` is — so history never needed the pipeline either.

## Ratified doctrine

1. **The live app is the primary artifact.** Creating an app means it exists — installed
   in your brain, running, editable — from the first moment. We program the system at
   runtime: the app under creation runs **live-real** (your account bindings), not in a
   simulation.
2. **Saved private apps may be red.** Your brain is your workspace; broken apps persist,
   get revisited, get fixed. Green is the price of the marketplace, not of existence.
3. **Tests are the publish gate — exactly and only.** The entire verification machinery
   (scratch installs, scripted connectors, `AppScenarioSuite`, structured verdicts) is
   unchanged; it guards the public boundary.
4. **Scenarios are the proof, the live app is the experience.** Scenario runs are always
   deterministic (scratch + scripted connectors) and run *beside* the live app,
   incrementally and continuously. Two truths, separated in the UI: "what it's doing"
   vs "what's proven."

## The two aggregates

- **App** (`IApp`, per brain): alive, editable, private, allowed red. State: manifest
  (settings, account slots, operations), behaviors (one `ICSharpFile` each), the
  scenario document (stable scenario IDs; the free-text spec is `ExportSpec` — a view,
  never a stored peer), current per-scenario verdicts. Appears in the brain's app menu
  by existing in the `IApps` index, as today.
- **Package** (`IPackage`, `owner/name`): history and sharing only, never on the
  creation path. Private by default; `Publish` is the sole gate; the marketplace lists
  published packages GitHub-style (`intochat/customerresearcher`). Commit, fork, pull,
  proposals unchanged.

## The live editable app

- Editing a behavior writes its `ICSharpFile` and restarts it: **per-behavior hot-swap**.
  Whole-app generation deployment survives only for install/upgrade of a package.
  Durable subscriptions + watermarks make restart-and-resume the normal case.
- A behavior that fails to compile or start marks itself red; the rest of the app keeps
  running. Per-behavior failure isolation — plus small, self-contained behaviors and the
  Creator's live run/signal feed — is the safety story for live-real editing. The
  accepted, named risk: a buggy edit can act on real accounts; that is what programming
  the system at runtime means. No sandbox-by-default (explicitly rejected).
- Manifest edits apply to the running app with `Configure` semantics.

## The Creator loop

- The Author/Builder agents become **Creator services** operating on the live app:
  a request updates the scenario document (Author), the affected behaviors are written
  or edited (Builder, with its existing contract-search/read/check tools), hot-swap
  applies them, verdicts refresh. No batch `Build`, no attempts list, no draft grain;
  the loop runs in services/workers, the app grain only receives edits and stays
  responsive.
- **Incremental scenario runs**: on any edit, only affected scenarios re-run — the
  stable scenario IDs and scenario-to-source associations (`app.authoring.json`) are the
  dependency map. Each run uses today's mechanics in miniature: scratch install,
  scripted connectors, one structured verdict. Full-suite runs on demand and always at
  publish.
- The Creator window is the IDE: scenario list with live verdicts, behavior sources,
  live run/signal feed, the app's own UI surface updating as it runs.

## Save, publish, fork, install

- **Save = commit** the live app's content to its package, creating `userid/appname` on
  first save. Red commits allowed (they always were). History enables revisit/update.
- **Publish = the existing gate**, unchanged: full verification green or refused; the
  package becomes public in the marketplace.
- **Install of other people's apps unchanged**: revision → settings/account resolution →
  generation deploy. **Fork** = materialize a revision as a new live app in your brain
  with its own package lineage. **Upgrade** of installed marketplace apps unchanged.
  First-party apps ship exactly as today (`ShippedAppPublisher`).

## What dies

- `AppDraft`/`AppDraftsNeuron` and everything only they needed: the attempts list,
  `VerifiedDocumentHash`, `ProposeConversion`/`AppDocumentConversion`, spec-only forks,
  the `intochat.app-draft*` identities (they die rather than get renamed).
- The batch `Build()` loop in a grain turn (#141 dissolves).
- The spec/document duality (#138 dissolves: the document is canonical on the app).
- `App.cs`'s migration museum (#137 shrinks to pure deletion under the dev-only ruling).

## Sequencing

#140 (finish the `IAppRuntime` seam — the live app deploys through runtimes) →
#139 (delete `PackageContent.Source` — the live app edits files, one representation) →
this redesign (absorbing #137, #138, #141) → #142 (remaining de-branding rides along).

## Testing

Facts: edit → hot-swap → resume at watermark; a red app persists, reloads, and lists;
save-commit succeeds red; publish refuses red; fork materializes a live app; incremental
selection re-runs exactly the affected scenario IDs; two-brain isolation of Creator
edits; behavior-level failure isolation (one broken behavior, app still serving).
Flutter Creator screens mirror every wire-shape change in the same commit. Scenario
verdict mechanics, the publish gate, and install/upgrade paths keep their existing
suites green throughout.
