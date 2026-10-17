# Apps Simplification — one neuron, two signals, two agents

Ratified 2026-10-05. Supersedes the packages/workspace/marketplace design of the Apps module
wherever the two conflict; the four-word standard
(`2026-09-29-programmable-brain-vision-design.md`) still governs.

## Why

The Apps module grew ~90 source files — a packages layer with git semantics (commit, fork, pull,
proposals, publish), a workspace vocabulary (install/upgrade/configure/uninstall), a marketplace,
an authoring-document codec, a runtimes abstraction — around what the product actually is: one
agent writes scenarios, another writes C#, the sandbox runs it. The Creator timeout
(`POST …/creator/implement` dying at the Flutter client's 30s `jsonRequest` limit while a
12-round Builder loop ran inside the request) was a symptom: long-lived state living in an
in-flight HTTP request because no neuron owned it. The Time module (two neurons, two signals) is
the shape every module should have. This design rebuilds Apps to that shape.

## The app neuron

`IApp : INeuron`, keyed `{brain}/apps/{name}`. The only durable thing. One state record:

- **Manifest** — title, description, operations, settings (name, description, value).
- **Spec** — `app.spec.md` text, free prose with `## Scenario: <name>` headings. A scenario's
  identity is its heading; there is no separate authoring document, codec, or stable-ID file.
- **Files** — `path → C# source` (`tests.cs`, `behaviors/*.cs`). Each behavior file is its own
  `ICSharpFile` in the sandbox, bound to the app identity (unchanged mechanics).
- **Connections** — `slot → connection id`: the user-provided credentials
  (`gmail("myaddress")`). Never exported.
- **Version** — semver, bumped on every saved change: patch by default, minor when the spec
  changes.
- **History** — the last 20 versions as `(version, manifest, spec, files)`, oldest dropped.
  Rollback restores a version and bumps.
- **Status** — `Drafted | Building | Live | Failed`.
- **Activity** — a short human-readable feed of the current/last background run
  ("round 3: compile-checking tests.cs"; on failure, the error).
- **Verified** — `version → green/red`: which versions passed their tests and may be shared.

Deleting the app deletes its sandbox files and state. C# is the only runtime; the `IAppRuntime`
abstraction is deleted.

## Signals

- `AppChanged(name, version, status)` — published on any state change: spec saved, build started
  or finished, settings changed. The shell and any behavior follow this one signal.
- `AppVerified(name, version, green)` — the tests-gate fact; the share path requires it.

No run signals, no package/directory/proposal signals.

## The Creator flow

Two agents, unchanged in spirit — the LLM is a compiler, never a runtime interpreter; no model in
the signal path or the share gate.

- **Create** — `POST /brains/{id}/apps {text}`: one Author LLM call names the app and writes the
  scenario spec; the neuron exists, status `Drafted`, when the call returns. Synchronous, with a
  ~3-minute client timeout (one inference call; `csharpRequest` already allows 3 minutes).
- **Author** — `POST …/apps/{name}/author {text}`: same call shape, revises the spec of an
  existing app.
- **Implement** — `POST …/apps/{name}/implement {text?}`: returns **202 immediately**. The
  neuron flips to `Building`; the Builder loop (contract search / contract read / compile-check
  tools, ≤12 rounds) runs in the background, appending to `Activity` and publishing `AppChanged`
  per step. Success: files written as behaviors, version bumped, status `Live`. Failure: status
  `Failed`, error in `Activity`. Retry = press Implement again. A silo restart mid-build loses
  only that attempt: the stale `Building`/`Failed` status invites a re-trigger; builds do not
  resume.
- **Verify** — `POST …/apps/{name}/verify`: same 202/background pattern; runs `tests.cs` through
  the sandbox test runner, records green/red for the current version, publishes `AppVerified`.
  Tests still play the connector (scripted models, real timers); one verdict per scenario,
  verdicts bind by scenario heading; silence never passes.

Tests gate **sharing only**: while iterating in your own brain the Builder hot-swaps freely and a
red app is a state to revisit, never a refusal.

## Sharing = export/import a verified version

An app exports to a plain bundle (`app.json`: manifest, version, spec, files).

- **Export** is allowed only for a green version. `Connections` never leave; settings export with
  default values only.
- **Import** creates an app neuron from the bundle (refusing a name clash): status `Live`, files
  installed into the sandbox, connection slots empty — the receiver binds their own connections
  before dependent behaviors run.
- Forking is not a concept: an imported copy is yours to edit; edits bump your own history from
  the imported baseline.
- First-party apps (`src/IntoChat/Apps/`) are bundles in the repo that the host verifies once and
  imports at startup; `ShippedAppPublisher` shrinks to that.

## HTTP surface

```
GET    /brains/{id}/apps                    list
POST   /brains/{id}/apps        {text}      create (Author) — sync, 3-min timeout
GET    /brains/{id}/apps/{name}             read: manifest, spec, files, status, activity, versions
POST   /brains/{id}/apps/{name}/author      {text} — sync
POST   /brains/{id}/apps/{name}/implement   {text?} — 202, background build
POST   /brains/{id}/apps/{name}/verify      202, background test run
PUT    /brains/{id}/apps/{name}/settings    settings + connection bindings
POST   /brains/{id}/apps/{name}/ask         invoke an operation
POST   /brains/{id}/apps/{name}/rollback    {version}
GET    /brains/{id}/apps/{name}/export      bundle (green versions only)
POST   /brains/{id}/apps/import             {bundle}
DELETE /brains/{id}/apps/{name}
```

All under `BrainRoutes.Group` as today (id validation + membership once).

## Deleted

- **Packages layer**: `PackageNeuron`, `PackageDirectoryNeuron`, `IPackage`,
  `IPackageDirectory`, and the commit/fork/pull/propose/accept/close/publish/revision/listing
  contract records. Git semantics are replaced by the in-neuron version history.
- **Workspace vocabulary**: `IApps`, `InstallApp`/`UpgradeApp`/`ConfigureApp`/`UninstallApp`
  and their request records. Install does not exist (create or import); configure = the settings
  endpoint; uninstall = DELETE.
- **Marketplace**: `MarketplaceService`, `MarketplaceEndpoints`, listings, proposals.
- **Authoring document machinery**: `AppAuthoringDocument`, `AppDocumentCodec`,
  `AppSpecVocabulary`, `app.authoring.json`.
- **Runtimes abstraction**: `IAppRuntime` and its registration; C# sandbox is the runtime.
- **CreatorService as request-scoped loops**: Author shrinks to one call; the Builder loop moves
  behind the neuron's background build. No in-request agent conversations anywhere.
- **Flutter package plumbing**: fork/publish/proposal UI, revision pickers, workspace-app
  vocabulary. "Workspace" survives only as the shell's window-layout word.

Kept: `IScriptSandbox`, `ICSharpFile`, sandbox containers, `TestScriptRunner` and
`dbtest:json`/scenario-verdict parsing, `AppScenarioSuite`, Builder tools and (simplified)
prompts, invoke/ask operations, grants, per-brain scoping.

## Flutter shell

- The Creator screen fires Implement/Verify and follows `Status`/`Activity` through the existing
  brain SSE stream; no request held open past 202. Create/Author use the 3-minute timeout.
- Apps list and app screen re-shape to the new wire records; Dart mirrors the C# records in the
  same change.

## Migration

None. Existing installed apps, packages, proposals, and revisions are dev-only state and are
dropped. Legacy file-owned Postgres tables of running behaviors are not touched by this design;
app files re-bind under the new neuron identity on re-create/import.

## Testing

Module tests in `DigitalBrain.Modules.Apps.Tests`, current style: real grains via
`ModuleTest.Create().WithModule<…>()`, scripted LLMs for Author/Builder, `FakeSandbox` /
`RecordingCSharpFile`, `ScriptedTestRunner` for verification. New facts to cover: version bumping
and rollback; background implement (202 → Building → Live/Failed with Activity and `AppChanged`);
export refuses red versions; import strips connections and installs files; name-clash refusal;
startup import of shipped bundles. Grain hazards apply: the background build must drive the
neuron through one-way self-references (`AsReference<T>()`), never blocking a grain turn for the
loop.

## Non-goals (for now)

Resumable builds across silo restarts; parallel builds of one app; any marketplace/directory;
cross-brain app discovery; non-C# runtimes. Each returns, if ever, as its own small design.
