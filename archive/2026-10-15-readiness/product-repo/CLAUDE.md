# DigitalBrain

DigitalBrain is a personal "alive OS" on Orleans: every capability is a **neuron**, every neuron
speaks in **signals**. Users program their brain at runtime by talking to it — the system writes
itself — and what they build is shareable, forkable and verified before it reaches anyone else.
IntoChat is one product on top of the OS; the Flutter shell is its workspace UI.

## Non-negotiables

- **LSP for all code work** (C# and Dart): find every definition, reference, implementation and caller
  through LSP before changing anything; edit; then LSP diagnostics must be clean. Never grep code.
- **Done means seen running**: Aspire resources Healthy → driven via `digitalbrain-mcp` → confirmed in traces/logs.
- **Brainstorm only for design**: new concepts, contract/module-shape changes, open fronts. Everything else: do it and verify.

## The four words

Everything is one of these. Anything that looks like a fifth concept is a design smell — stop and ask.

| Word | What it is | In code |
|------|-----------|---------|
| **Neuron** | Stateful, addressable grain. State lives here, never in a process. | `INeuron`, `IBrain` |
| **Signal** | Typed fact. `Signal.Publisher` is kernel-stamped; provenance is inviolable, no publish-as-someone-else. | `Signal` |
| **Behavior** | C# compiled by the brain, loaded into the brain's sandbox session; it subscribes and acts through neuron contracts. The unit of user-programmed logic. | `brain.On<T>(source)` |
| **Connector** | Bridge from an edge neuron to its external system — Gmail, Twitter, and the Flutter shell (the *human's* connector). | `ConnectorDefinition` |

UI is not a layer: a button is an edge neuron whose external system is a person, so
`On<Clicked>(button)` and `On<Posted>(elon)` are the same mechanism.

**Brains.** A brain is itself a neuron (`IBrain`); a user has one or more. The registry and every
scope are per brain: `BrainScope.CurrentId()` reads the brain from the kernel-stamped caller, and
module endpoints mount under `BrainRoutes.Group` → `/brains/{brainId}` (id validation + membership
filter applied once).

## Local runtime deployment

The default AppHost runs one OS runtime on the Windows PC and one MCP client host.
Devices are connectors; they do not host a second brain. Windows keeps its stable device ID,
explicit connection and allowed folders. Identity, circles and marketplace authorities run locally.
There is no network trust host, machine admission, part lease, cross-machine forwarding or volunteer mesh.

Neuron state and durable signals share an encrypted local journal under
`DigitalBrain:Platform:Storage:Directory` (default `.digitalbrain/brain-store`). Platform identity and
credentials retain their configured persistent store. Back up both stores and the configured custody
key together while stopped. Never point two runtimes at the same directory. Missing or mismatched keys
refuse startup; do not replace keys to bypass that refusal. Previous distributed stores require an
explicit migration; this change does not convert them automatically.

An update restarts the sole runtime and interrupts active calls. Front URLs remain stable; clients
reconnect. Candidates use fresh isolated data and keys, so their tests do not prove migration of live
state. Rollback is only safe between builds with compatible persisted formats.
See `docs/superpowers/specs/2026-10-14-single-runtime-devices-design.md`.

## Repo map

Three framework rings, one per consumer — the project graph mirrors script visibility.

| Ring | Consumer | Holds |
|------|----------|-------|
| `src/DigitalBrain` | scripts, `*.Contracts`, clients | The vocabulary: the four words + every script/client-facing contract (what the kernel's compiled types ship into the sandbox). Never Orleans hosting. |
| `src/DigitalBrain.Framework` | module authors | Neuron runtime, module declaration, HTTP surface, SDK helpers, platform-facing interfaces. |
| `src/DigitalBrain.Platform` | host composers only | Kernel/credential implementation: plain grains, not neurons, so no edge can address them. |

The OS host is `src/DigitalBrain.OS` (`OsCatalog` composes the modules); `src/DigitalBrain.AppHost` runs it
under Aspire with the `digitalbrain-mcp` server. `dotnet run digitalbrain.cs` from the repo root starts it
(a file-based launcher for the AppHost; arguments after `--` go to the AppHost).

First-party apps live in `features/{owner}/{App}/` at the repo root (`features/os`, `features/intochat`;
the folder name under `features/` is the owner account). The AppHost passes that folder as
`DigitalBrain:Modules:apps:Options:Features`; the published image carries a copy at `{app}/features`.

### Module shape

Every module lives at `src/DigitalBrain.Modules/<Vendor>/<Module>/`:

```
DigitalBrain.Modules.X.Contracts/       neuron interfaces + signals; references only DigitalBrain
DigitalBrain.Modules.X/                 XModule : Module / Module<XOptions>, neurons, connector, endpoints
DigitalBrain.Modules.X.Aspire.Hosting/  XModuleHosting : ModuleHosting<XModule>   (if it needs infrastructure)
DigitalBrain.Modules.X.Deployment/      XDeployment : ModuleDeployment<XModule>   (if it deploys)
tests/DigitalBrain.Modules.X.Tests/     facts over real grains via DigitalBrain.Testing
```

Tests use the shared harness, never a hand-rolled host: `TestBrain.Create().WithModule<XModule>()`
(`src/Testing/DigitalBrain.Testing`, the same `AddDigitalBrainServer` recipe the OS boots); hosting facts use
`DigitalBrain.Aspire.Testing`; E2E picks the Aspire target (`DigitalBrain.Testing.Aspire`, `DigitalBrain.OS.Testing`).
Ring boundaries and config-key ownership are enforced by `src/Testing/DigitalBrain.Architecture.Tests`.

## Connectors, integrations, configuration

- **Connector** — `ConnectorDefinition` a module ships: auth methods, neurons/signals, required/optional Integrations.
- **Connection** — what a *user* authorizes, per brain at `/brains/{id}/connections`. A connection is the
  connector's own neuron at `connection/{brain}/{connector}/{id}` holding sealed credential state; modules
  receive deployment credentials through `IModuleIntegrations<TModule>`. An app keeps its `ITable`s in a
  user's database by declaring the reserved slot `{"name": "tables", "connector": "postgres"}` and binding it.
- **Integration** — what the *deployment* provisions, `DigitalBrain:Integrations:{id}:{Field}`, held by a kernel grain (not a neuron).
  Modules receive credentials only through `IModuleIntegrations<TModule>` — never read credential config.
- **Configuration** — options are plain config at `DigitalBrain:Modules:{id}:Options:{Property}`, every key
  derived from `DigitalBrainConfiguration.ModuleSection`/`ModuleOptionsSection`. No secrets in options.

## Self-programming apps

A user app is an app neuron (`IApp`, keyed `{brainScope}/apps/{name}`) holding a folder of `.cs` files:

```
app.cs       `static class App`: Name, Version and the AppManifest (title, icon, operations, settings,
             account slots); its leading comment is the spec, the program in natural language
*.cs         a synapse when it has top-level statements (one reaction each), otherwise a shared class
             compiled into every synapse — the split is syntactic (`CSharpScriptCheck.IsShared`)
icon.svg …   other files are data the program reads
```

`app.cs` is read by syntax only (`AppDeclaration`, Roslyn), never run; it compiles with the bundle.
Inside the neuron the manifest and spec are state; `app.cs` is how a bundle/folder carries them.

- **Spec is the program, the LLM is a compiler.** The Creator (`Apps/Creator.cs`,
  `Apps/Authoring/AgentPrompts.cs`) writes the spec, then the behaviors. There is no model at
  runtime. **The type system is the grammar:** a behavior is expressible exactly when it compiles
  against the installed contracts.
- **Compilation is the publish gate.** `IApp.Publish`/Export refuse a bundle whose `.cs` files do
  not compile (`IScriptSandbox.Check`). There are no per-app tests; verification is seeing the app
  run through `aspire run` and `digitalbrain-mcp`.
- **A synapse is one reaction: one `await foreach` over one `brain.On<T>(source)`. An app's own operations arrive as `AppRequested`; nothing waits for a script, a result is neuron state.** `brain.On<T>(source)` is a durable subscription
  inside the grain, with a watermark. Script processes are caches: they get reaped and re-run from the
  top. So setup must be cheap and idempotent, state lives in neurons, delivery is at-least-once (dedup
  through neuron state), and derived state is rebuilt from scratch rather than patched.
- **Publish → Marketplace → Install.** Install is the only way an app crosses brains. Every bundle that
  crosses (Install, Update, the features reconcile) loads through one path, `FeatureLoader`: it imports or
  replaces the program and records `Origin`; settings and slots bind to the installer's own connections. Updates
  replace the program and keep the data. Editing the program detaches the copy from its origin.
  First-party apps are the `./features` folder: loaded and compile-checked at boot (`FeatureCatalog`),
  listed in the Marketplace under their owner, installed as OS defaults, and brought to the folder's
  version on every brain activation (`FeatureReconciler`). Every program assignment is recorded in the
  kernel as a feature (`IKernel.Features`, its signal types in `Types()`).

Open design fronts (don't improvise): cross-app subscription scopes, renderable palette / UiPart,
run-token tightening.

## Way of working

**LSP is the main dev tool** for C# (`csharp-ls` over `DigitalBrain.slnx`) and Dart (`dart language-server`
over `src/DigitalBrain.Modules/Google/Flutter/app`). It is read-only — it maps a change, Edit makes it:
1. **Map** — `goToDefinition`, `findReferences`, `goToImplementation`, `incomingCalls` find every site
   the change touches. Never grep for code.
2. **Edit** — change the symbol and each site it found.
3. **Confirm** — LSP diagnostics clean, then build. Runtime-bound sites LSP can't see (script contracts,
   Dart mirrors of C# records) are caught by the verification loop.

**codegraph** (`codegraph_explore`) is for general understanding of the repo's structure — orienting in
an unfamiliar area, not for precise symbol work.

**context7 / microsoft-learn** — verify Orleans, Aspire, .NET and Flutter APIs against current docs
before coding against them; the SDK is a preview (`global.json`: .NET 11 RC).

**Build and test per project, never the `.slnx`** (Windows handshake bug):
```bash
dotnet build src/<path>/<Project>.csproj
dotnet test --project src/<path-to-test-project>
dotnet test --project src/<path-to-test-project> -- --filter-method "*SentenceName*"
```
Run a module's E2E suite alongside its unit suite; compile live-gated scenarios when credentials are
missing. `DigitalBrain.OS.Tests.Unit` covers host composition only — module behavior belongs in the
module's tests.

**Flutter shell:** `flutter analyze` and `flutter test` from
`src/DigitalBrain.Modules/Google/Flutter/app/shell`. A C# record wire-shape change updates the Dart
screens in the same change.

**Brainstorm only when it's needed** — a new concept, a contract or module-shape change, or an open
design front: propose and wait, no edits. Bugs, wiring, tests and refactors inside the existing design:
just do it and verify.

## Verification loop

A change is done only when the running system shows it. Unit tests catch regressions; they don't
prove the feature works.

1. **Build clean.** LSP diagnostics show no errors, then build each affected project.
2. **Run it.** Start the app with `dotnet run digitalbrain.cs` from the repo root (or `aspire run` from
   `src/DigitalBrain.AppHost`). Then call
   `mcp__aspire__list_resources`: every resource must be Running/Healthy. If one isn't, read
   `list_console_logs` for it before doing anything else.
3. **Drive it through `digitalbrain-mcp`** (`localhost:5081/mcp`; `/brains/{brainId}/mcp` selects a brain):
   - `neurons_context`: confirm which caller and brain you're acting as.
   - `neurons_search` / `neurons_list`: find the contract you changed.
   - `neurons_get` / `neurons_call`: run the changed path on a real neuron and read back its state.

   UI changes are verified the same way, not with Playwright. The shell is a connector, so its
   windows, buttons and workspace are edge neurons: inspect them through `digitalbrain-mcp`.
4. **Confirm in telemetry** with the Aspire MCP: `list_traces` should show the spans you expect,
   `list_structured_logs` the log lines you expect, and `list_trace_structured_logs` lets you follow
   one trace end to end. If the telemetry doesn't match what you expected, the change isn't done.
5. **Regression net.** Run the unit and E2E suites of every project you touched (the same facts run on `TestBrain`'s InProcess or Aspire target).

When something fails, fix the readiness or design problem. Never raise a timeout or add polling to
make a check pass.

## Code style

- No boilerplate `/// <summary>`. Names carry the meaning; inline comments only for what code can't
  say, and keep them true (a stale comment is a bug).
- Warnings are errors, nullable is on, package versions are central (`Directory.Packages.props`).
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`. Use real
  grains over mocks: `TestBrain.Create().WithModule<…>()`, `FakeSandbox`, `RecordingCSharpFile`,
  scripted LLMs.

## Hazards

- **No state compatibility.** There's no stored data to keep, so reshape grain state freely. No
  migrations, no legacy shims.
- **Concrete arrays in grain state**, not `IReadOnlyList`. The JSON storage serializer can't
  round-trip collection-expression wrappers, and the failure only shows up on reactivation.
- **No self-calls on non-reentrant grains**, because they deadlock. For signal-triggered work, use a
  one-way self-reference: `this.AsReference<T>()`.
- **`ObserverManager` watches need lease renewal.**
- **A reshaped grain state fails at activation or silo start** as an Orleans `wireType`/deserialisation
  error (e.g. `integration.registration/integration/clickhouse` read at `IntegrationSeeder`). Wipe the local
  storage volume (Azurite); no migration shims.
- **An app's program is compiled and assigned whole by `IBrainPrograms.Assign`; a write that does not compile fails the write.**
