# Architecture: Flutter and Memory

This authority owns the Flutter OS-surface status and the Memory boundary.

### 4.6 Flutter

Status: Built (first-vertical vocabulary + L0/L1 journal proofs + C# northbound UI edge + module-owned `Flutter.Aspire.Hosting` WithUiEdge/WithFlutterHost projection + **pure-Dart** headless host at `clients/digitalbrain_flutter` + Windows chrome in nested `clients/digitalbrain_flutter/shell/` (`shell/lib/main.dart` + `shell/windows/`) — **code and L0/L1 only**); Designed (full product chrome beyond key/title shell, product journal observation on IDigitalBrain, multi-principal IdP edge); **residual unproven:** live product AppHost topology (`aspire start` / `aspire run` Healthy for silo + `digitalbrain-ui` + Flutter host) — L2 today proves TestingAppHost silo **without** OS surface only; **not** Built-live

The OS surface is not a Flutter app with agents behind it. It is a brain whose **UI vocabulary** is a
Flutter module, and whose **logic** (shell policy, post-auth composition, multi-window orchestration,
settings flows) is behaviors — or, until the Behavior rail exists, ordinary C# compositions with the
same allowlist — composing that vocabulary the way AccountEnrichment composes Gmail and Salesforce.

> **Module-owned hosting (Built as projection API + L0 pins):** `AddModule<FlutterModule>(f => f.WithUiEdge().WithFlutterHost())`
> is how production AppHost composes the OS surface. Vocabulary-only `AddModule<FlutterModule>()` does
> not start Ui or Flutter resources. Aspire remains the orchestrator; ad-hoc AppHost
> `AddProject`/`AddExecutable` Flutter wiring without those host options is incomplete packaging.
> **Do not read Built as “product `aspire start` topology is green”** — live Healthy for
> `digitalbrain-ui` / Flutter host is residual until L2 quotes product topology Healthy. L0
> projection pins and TestingAppHost silo L2 are not that claim.

#### Package family and public identity

Physical packages follow the same triple as every other module:

```text
DigitalBrain.Modules.Flutter.Contracts
DigitalBrain.Modules.Flutter
DigitalBrain.Modules.Flutter.Aspire.Hosting   OS surface composition when host options selected
```

Public namespaces carry meaning and never say `Modules` or `Contracts`. The domain identity is
**`DigitalBrain.Flutter`**, matching Time (`DigitalBrain.Time`) and Google (`DigitalBrain.Google`). The
hosting package public namespace is **`DigitalBrain.Flutter.Aspire.Hosting`** (same pattern as
`DigitalBrain.AI.Aspire.Hosting`). A host-neutral `DigitalBrain.UI` rename is rejected until a second
non-Flutter host is a real consumer and this section is reversed in writing.

Flutter is the **host runtime family** (pixels, widgets, platform channels) — the same class of
concern as MCP behind Google or MAF behind AI — not a license for a public god type.

#### Semantic neurons — not `IFlutter`

Public vocabulary is small semantic capabilities. Namespace plus type name are the identity. There is
no `IFlutter` mega-neuron, no central UI root, and no second “DigitalBrain desktop” grain.

First vertical public surface (≤5 types; freeze signatures only with red→green proofs):

| Type | Kind | Role |
| --- | --- | --- |
| `DigitalBrain.Flutter.IShell` | Neuron | Addressable blank chrome / host surface for one owner-bound shell |
| `DigitalBrain.Flutter.IScene` | Neuron | Addressable content surface (scene key = neuron key) |
| `DigitalBrain.Flutter.OpenScene` | Request command | Typed method payload to open/present a scene (not a free-form route bag) |
| `DigitalBrain.Flutter.SceneOpened` | Synapse (fact) | Broadcast when a scene is open for projection |
| `DigitalBrain.Flutter.ControlActivated` | Synapse (fact) | Domain user action (control id + intent) — never Flutter widget types |

Out of the first vertical: `IWindow`, login/session policy neurons, navigation stacks, theming,
multi-window layout. Those are later vocabulary or composition over `IShell` / `IScene`.

#### Projection model

The same two primitives as the rest of the brain:

- **Synapse** = fact (broadcast or directed, no reply). Surface lifecycle and domain-relevant user
  intent use synapses (`EmitAsync` / `SendAsync`).
- **Interface method** = request (directed, replies), reified as `CapabilityRequested` → outcome.
  First vertical: `IShell.Open(OpenScene)`. Snapshot/query methods (`Current` / present) are not in
  the first five types; add them only with journal-backed recovery proofs.

Flutter rebuild is a **projection of committed journals**, never the ledger. Widget trees, scroll
offsets, hover, and frame timing stay host-local. Only domain-relevant intent and scene lifecycle that
other neurons may consume cross the boundary.

**First vertical (Built):** projection input is `SceneOpened` (scene key + title + journal sequence)
and control intents via `ControlActivated`. Host-local view models map those facts to pixels;
there is no scene-descriptor node algebra yet. C# contracts carry serializable primitives and stable
ids only — no `Widget`, `BuildContext`, Dart types, callbacks, or Flutter SDK types. **Designed:**
richer serializable descriptors (closed node kinds, action identities, revision fencing) when a
consumer needs more than key/title chrome.

Reject driving product UI from OTel or traces (journals are durable truth; OTel is diagnostic).
Reject a god widget tree with side-channel HTTP that bypasses `IDigitalBrain` typed contracts
(ProbeHost-class surface).

#### Northbound path

The Flutter/Dart host is a **client of the brain**, not a second kernel and not a silo.

```text
Flutter / Dart host  ──HTTP/JSON (+ SSE watch)──►  hosts/DigitalBrain.Ui (C# edge)
  no Orleans, no MCP tool dictionaries             auth → OwnerId (dev: config owner)
                                                   commands: IDigitalBrain only
                                                   watch: host-private session journals
                                                   AppHost: brain.AsClient()
                                                             │
                                                             ▼
                                                   DigitalBrain silo (+ FlutterModule when selected)
```

- **Built:** `hosts/DigitalBrain.Ui` — owner-bound `IDigitalBrain` edge with HTTP
  `POST /shells/{shell}/scenes`, `POST /scenes/{scene}/controls/{id}/activate`, and
  `GET /shells/{shell}/events` (SSE `scene-opened` projection from the shell **outgoing** journal via
  host-private `ISessionNeuron.ReadNeuronJournal` poll — not `IDigitalBrain` observation, not OTel).
  L1 proves command→journal and SSE→`SceneOpened` without a Dart process or host restart. Production
  AppHost selects `FlutterModule` on the silo; the **Ui edge** is an `AsClient()` peer (same trust
  split as MCP), composed by module hosting when host options are selected — not by free-floating
  Aspire folklore in every AppHost.
- **Keep** `hosts/DigitalBrain.Mcp` as agent/IDE northbound — not the product UI path (no tool
  dictionaries on UI contracts; MCP owner binding today is process config, not human IdP). Shared
  brain state means MCP (or any trusted client) may mutate owner-scoped facts that the UI edge later
  projects; that is **not** permission for Flutter to call MCP tools as the product UI bus.
- **Reject:** Dart embeds Orleans client or silo; Flutter process receives journals, protection keys,
  or reminders; attaching `brain.AsClient()` to a non-.NET Flutter resource as if it were an Orleans
  client; gRPC UiGateway / protobuf dual vocabulary; resurrected `app/` or `workspace/` product trees;
  **Aspire-only Flutter/Ui wiring with zero `FlutterModule` selection implication**.
- **Built (Dart host):** `clients/digitalbrain_wire` (dual golden pin + edge DTOs) and
  `clients/digitalbrain_flutter` — **pure Dart** package (no `sdk: flutter` at root): HTTP/SSE edge
  client, SSE parse, `ShellSurfaceController`, headless `bin/digitalbrain_host.dart`.
  `dart analyze` / `dart test` at package root are local gates for the pure-Dart **Headless** host
  (no Flutter SDK). That is **not** Desktop and not an Auto fallback.
- **Built (Windows chrome / Desktop):** nested Flutter package `clients/digitalbrain_flutter/shell/`
  (`shell/lib/main.dart` + `shell/windows/`, package `digitalbrain_flutter_shell`) Material key/title
  list from `ShellSurfaceController` / SSE `SceneOpened` only (not multi-window product chrome).
  Desktop markers and `flutter run|build windows` live under `shell/`, not the pure-Dart root.
  Proof tier is code + local Flutter/Dart jobs — **not** product AppHost Built-live.
- **Built (module hosting projection):** `DigitalBrain.Modules.Flutter.Aspire.Hosting` — `WithUiEdge` /
  `WithFlutterHost` project `digitalbrain-ui` (AsClient) and host executable
  (`DIGITALBRAIN_UI_BASE` + `DIGITALBRAIN_SHELL` only). Host mode is **explicit**: default
  `WithFlutterHost()` = Desktop (`flutter run -d windows` under `shell/`);
  `WithFlutterHost<DesktopHost>()` is the same; `WithFlutterHost<HeadlessHost>()` = pure-Dart
  **Headless**. **No Auto.** Production AppHost composes the surface via module selection.
  Proof tier for this bullet is **L0 projection pins**, not live resource Healthy.
- **Built (OS compositions, pre-Behavior rail):** `samples/DigitalBrain.Compositions` —
  shell/OS-boot `ActivateDigitalBrain` / `BootOnActivation` / `OpenHome` /
  `PostAuthBootstrap` / `NavigateShell`; multi-module surfaces `CountdownSurface`
  (Flutter+Time) and `AiPaneSurface` (Flutter+AI); OS-scene-only `AccountEnrichmentSurface`
  (opens enrichment scene — does not run Gmail→Salesforce). Contracts + Abstractions activation
  fact only; L1 journal proofs in `DigitalBrain.Compositions.Tests` (including activation →
  home). Multi-module enrichment process remains Integrations L1 (`IAccountEnrichment`); OS
  scene journals carry no secrets. Pre-rail compositions are **not** installed Behaviors.
- **Designed:** full product chrome beyond the key/title shell; production IdP principal→owner bind;
  product journal observation on `IDigitalBrain` when a non-UI consumer needs the same cursor/watch;
  optional upgrade from edge journal poll to grain `WatchNeuron` push without changing the HTTP event
  schema.
- Edge executable lives under `hosts/` (peer of MCP and the silo host). The pixel host is a
  **client** under `clients/`, not a packable module and not a second Orleans host under `hosts/`.
  Do not invent a second public client facade beside `DigitalBrainClient`.

#### Module-owned OS surface composition (Built: projection + L0; live Healthy residual)

`DigitalBrain.Modules.Flutter.Aspire.Hosting` owns AppHost composition of the OS surface when host
options are selected. Mirror AI/Google hosting: extensions on `DigitalBrainModuleBuilder<FlutterModule>`,
state via `GetOrAddState`, register a `DigitalBrainModuleProjection`. Unlike AI (which injects silo env
in `Apply`), Flutter hosting creates **peer resources** eagerly and uses `Apply` only to finish the
WaitFor graph once the silo takes `WithReference(brain)`. Production `DigitalBrain.AppHost` uses this
path only (L0 pins no hand-wired `DigitalBrain_Ui` project).

**Product sentence:**

```text
var brain = builder.AddDigitalBrain("brain");
brain.AddModule<FlutterModule>(flutter => flutter
    .WithUiEdge()                         // projects hosts/DigitalBrain.Ui as AsClient edge
    .WithFlutterHost());                  // Desktop: flutter run -d windows under shell/
// Headless (CI / pure Dart): .WithFlutterHost<HeadlessHost>()

var silo = builder.AddProject<…>("silo").WithReference(brain);
// Host WaitFor(Ui) when projected; Apply on silo WithReference: Ui WaitFor(silo)
```

| Decision | Choice | Fold if |
| --- | --- | --- |
| Package / namespace | `DigitalBrain.Modules.Flutter.Aspire.Hosting` / `DigitalBrain.Flutter.Aspire.Hosting` | Kernel types leak into hosting public API |
| Vocabulary-only selection | `AddModule<FlutterModule>()` with no `With*` = silo vocabulary only; **no** Ui/Flutter resources | Selecting the module silently starts the OS surface |
| Explicit surface | `WithUiEdge(...)` and `WithFlutterHost()` / `WithFlutterHost<DesktopHost\|HeadlessHost>()` (same selection style as AI `WithLlm<T>`; **no Auto**) | Host options invented outside module builder |
| `WithFlutterHost` without edge | Implies `WithUiEdge()` (host needs an edge base URL) | Flutter WaitFor/points at kernel, MCP, or Orleans client |
| Default Ui resource name | `digitalbrain-ui` (product northbound name, overridable) | Per-brain rename without updating edge client docs |
| Default Flutter resource name | `digitalbrain-flutter` (overridable) | Required when SDK missing without honest skip path |
| Ui project materialization | Path-based `AddProject(name, uiCsprojPath)` resolved from AppHost directory → `../DigitalBrain.Ui/DigitalBrain.Ui.csproj` (hosts layout); override via options | Hard dependency on Aspire `Projects.*` codegen inside the packable package |
| Ui trust wiring | `WithReference(brain.AsClient())` + `DigitalBrain__Owner` (default `"dev"`) | Journal, state-protection, or module list projected onto Ui |
| Flutter process | `AddExecutable` default working dir `clients/digitalbrain_flutter` (pure Dart / headless); desktop chrome requires WorkingDirectory `…/shell` (or equivalent) with `lib/main.dart` + platform folder; env **edge HTTP base + shell only** (`DIGITALBRAIN_UI_BASE`, `DIGITALBRAIN_SHELL`) | Orleans/journal/reminder env; MCP tool env as UI bus; gRPC kernel; claiming root package is a Flutter app |
| Host modes | **Explicit only:** `WithFlutterHost()` / `<DesktopHost>` = Desktop Windows chrome under `shell/`; `WithFlutterHost<HeadlessHost>()` / `<HeadlessHost>` = pure-Dart headless. Missing markers/entry **throws** — no silent Auto fallback | Auto mode, silent headless when desktop intended, omit-host without error |
| WaitFor graph | Host `WaitFor(Ui)` when host projected; Ui `WaitFor(silo)` in projection `Apply` on silo `WithReference(brain)` | Process-name kill; hand WaitFor only in every AppHost forever without module path |
| Missing Flutter SDK | Choose `WithFlutterHost<HeadlessHost>()` when desktop is not wanted; Desktop still projects `flutter run` (fail loud at process start if CLI missing) | Silent success / fake Healthy headless when AppHost asked for desktop |
| MCP host | Stays AppHost-owned peer (not Flutter module packaging) | MCP folded into Flutter hosting as product UI |
| Historical recovery | Intent only: `AddExecutable(flutter run -d …)` + edge URL env + WaitFor edge (`v0.1.18` / later `DIGITALBRAIN_V2_UI_ENDPOINT` shape). Rebind to Ui HTTP. | Restore kernel gRPC, Orleans client on Flutter, wholesale `app/` |

Removing `AddModule<FlutterModule>`, or keeping the module without `With*`, omits OS surface resources.
Package graph: hosting may reference `DigitalBrain.Modules.Flutter`, `DigitalBrain.Aspire.Hosting`, and
Aspire.Hosting APIs — not Kernel. Ui remains free of Kernel (client + Flutter contracts only). Dart
host never references Aspire or Orleans packages.

**L0 pins (hosting, in `tests/DigitalBrain.Tests/Hosting/` — selection / Ui edge / host mode):** vocabulary-only → no surface resources;
`WithUiEdge` → AsClient-only Ui; packable Kernel-free package; production AppHost uses module API;
`WithFlutterHost` env is edge URL + shell only.

#### Live host observation

Product journal **observation** on `IDigitalBrain` remains unbuilt (§8): the public facade still
sends and emits only. That gap must not invent a second semantic protocol or a ProbeHost-shaped
“watch any grain” surface.

**First live feed (Built on the edge):** host-facing SSE on `hosts/DigitalBrain.Ui` only.

| Decision | Choice | Fold if |
| --- | --- | --- |
| Where | Edge projects one owner-bound shell’s **outgoing** journal | Endpoints become generic “watch any neuron journal” (ProbeHost smell) |
| How | Host-private `ISessionNeuron.ReadNeuronJournal` poll under SSE (push/`WatchNeuron` optional later) | Kernel gains UI types |
| Transport | HTTP **SSE** JSON under the same edge (commands stay POST); cursor = journal sequence / `afterSequence` | gRPC/proto dual vocabulary returns; or WebSocket is justified by a bidirectional need |
| Public client | **No** `IDigitalBrain` watch yet | A second non-UI consumer needs the same API — then promote deliberate client observation |
| Polling `Current()` | **Not** the primary live path | Only after a real descriptor method exists with journal-backed recovery proofs |

Lessons recovered from historical `workspace/` UiSurface (design only — not a code transplant): durable
cursor, contiguous sequence / gap resync, fail-closed wire, revision fencing on actions, snapshot
recovery. Lessons **not** recovered: god feed, block AST as second ledger, kernel `UiSurface` types,
grain-addressed invoke, OTel as UI truth.

#### Historical recovery map

Recover UX loops and assets via `git show <sha>:<path>` (notably tag `v0.1.18` tree `app/`, later
`workspace/` UiSurface era, demolish `775cef63`). Do **not** wholesale copy either tree.

| Historical surface | Disposition |
| --- | --- |
| Live loop “trusted client mutates brain → host projects facts without restart” (e.g. MCP→shared state at `730e1ad4`) | **Keep loop shape**; re-bind proof to Ui edge + journals, not MCP-as-UI-gateway |
| Thin shell / theme / adaptive chrome, glass shaders as **host-local** pixels | **Optional later** host chrome only |
| Aspire “run Flutter with env for edge base URL” shape | **Adapt** into `Flutter.Aspire.Hosting` (`WithFlutterHost`) → Ui HTTP only — never journals/reminders on Flutter |
| gRPC UiGateway, dual protos, RFW product path, `ui_kit` as domain truth | **Reject** |
| OTLP / telemetry as product UI path | **Reject** |
| Live graph, neuron constructor, experience packs, 13MB lottie spikes, Widgetbook product | **Reject** (zero consumer on current `IShell`/`IScene`) |
| Workspace block AST / god `feed/main` / kernel UI DTOs / `Brain.UiGateway` grain HTTP | **Reject** |
| ProbeHost, ModuleDriver/Gherkin OS, DevTools-as-product, Simulations, `IFlutter`, Behavior APIs without rail, Flutter-embedded silo | **Must-not-return** |

Scoring rule for any restored file: it must serve the current path
**edge → `IDigitalBrain` (commands) / host-private journal watch → projection**. Pretty chrome without a
journal path is trash.

#### Auth edge

Authentication is an **application-edge** responsibility. The client is not an auth boundary; an
Orleans client is a trusted cluster peer. Bind the principal to the owner supplied to
`AddDigitalBrainClient` / `Connect`.

| Concern | Edge | Composition (post-auth / future Behavior) |
| --- | --- | --- |
| Credentials, IdP, cookies, token mint/validate | Owns | Forbidden |
| Principal → `OwnerId` mapping | Owns | Receives ambient owner only |
| Shell/scene UX after bind | May host pixels | Orchestrates via Flutter vocabulary + other modules |
| Passwords / tokens in journals | Never | Never |

Login is **not** a grain auth authority and **not** “a Behavior that authenticates.” Prefer the phrase
**post-auth composition**: edge authenticates and binds owner; composition orchestrates sign-in UX and
downstream wiring. Durable southbound tokens (if any) use `DigitalBrain.Security` purpose-bound
envelopes (MCP pattern), never journal payloads.

Dev: fixed test/config owner (MCP’s `"dev"` pattern only on non-public edges). Production: real IdP at
the edge, then the same `IDigitalBrain` programming model. Today both Ui and MCP bind
`DigitalBrain:Owner` (default `"dev"`) as a process-wide singleton — honest, not IdP.

#### Contract drift guard

Source of truth: public types in `DigitalBrain.Modules.Flutter.Contracts` (aliases, methods,
properties). Guard: checked-in normalized **golden wire-contract manifest** extracted by reflection
over that assembly; L0 asserts equality. `clients/digitalbrain_wire` uses that same Contracts golden
as the Dart-side oracle (one file; no forked copy). Codegen Dart from Contracts may later accelerate
maintenance; the gate remains golden equality, not “generator exit 0.” No protobuf dual vocabulary;
no FFI .NET-in-Dart as the pin. Thin HTTP DTOs on the Ui edge (`OpenSceneRequest`, …) are host
protocol, not a second module vocabulary.

#### Testing

| Tier | First vertical |
| --- | --- |
| L0 | Package graph: Kernel free of Flutter; Contracts free of Dart/Flutter SDK; capsule + alias + golden + hosting projection pins |
| L1 | Real multi-silo `TestBrain`; real Flutter-module neurons; **scene projected = committed journal fact**; Ui edge HTTP + SSE shell events; composition L1; no phone |
| L2 | **Residual / unproven for OS surface:** designed shape is real AppHost resources (`digitalbrain-ui` / Flutter host) with readiness, not MCP-coupled, not the default domain gate. **Green today:** `HostTests` L2 proves TestingAppHost silo Healthy **without** OS surface only. Product topology Healthy is not a Built claim. |
| L3 | Device/widget/golden — never owner of domain truth; never sole gate |

Dart unit tests prove dual golden equality and host-local scene view-model mapping; they do not replace
L1 journal proof. Domain gate remains the root `dotnet test` solution run; Dart/Flutter jobs are
path-filtered peers of the docs job.

#### Still open (do not implement as settled)

- Scene descriptor node algebra and richer chrome vocabulary beyond the first five types.
- Dart host mapping beyond key/title skeleton (first-vertical Windows chrome in nested `shell/` is
  Built at code/L0/L1; richer descriptors and product chrome remain open —
  pure-Dart `clients/digitalbrain_flutter` + nested `shell/` + `clients/digitalbrain_wire` path of
  record; not Built-live AppHost topology).
- Product journal observation API on `IDigitalBrain` (promote when a non-UI consumer needs it).
- Multi-principal edge factory beyond singleton `AddDigitalBrainClient(owner)` / process owner config.
- Full product desktop chrome, multi-window, notifications, and product-installed OS apps (sample
  compositions exist; they are not installed Behaviors).
- Optional `WatchNeuron` push upgrade (SSE poll is acceptable and Built on the edge).

### 4.7 Memory

Memory is out of scope — not designed, not deferred-with-a-shape. It carries no status line because
there is nothing to report a status about.

This is a deliberate constraint rather than an oversight. When Memory is designed it must be designed
independently, around its own vocabulary; its architecture must not be inferred from AI, Tasks, or
Time because those modules solved different problems. One rule already binds it: a future Memory may
project synapse journals, but it may never reconstruct truth by scraping traces.


