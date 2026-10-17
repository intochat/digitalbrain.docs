# Alive OS — feature map, main source of complexity, priorities

Date: 2026-10-11 · Status: **for discussion, nothing ratified** · Branch read: `os-runtime` (+ the a3 worktree)

How this was produced: 16 read-only agents. 9 mapped the repo: the Flutter shell, the UI neurons, the app/synapse
runtime, kernel observability, the self-improve loop, Circles/marketplace, testing, Ino, and composition. 7 researched
outside sources: Flame, 3D graph rendering, Rive/Lottie, Widgetbook and server-driven UI, social code-sharing
platforms, scenario testing, and live/self-modifying systems. A second pass then ran 3 blind diagnosticians,
3 adversarial skeptics, a fact-checker (20 claims: 16 confirmed, 4 partly, 0 refuted; corrections applied below)
and a completeness critic.

---

## 1. What you asked for, as I understood it

- **The product.** One self-improving OS with Ino built in. Every event is visible live: a synapse runs, and you see UI
  appear, state change, navigation happen.
- **The surface.**
  - Scenes: Ino's home, then a menu/control center on Esc, then Circles, then the brain itself as a navigable 3D world
    drawn with Flame.
  - The visual target is game-like beauty with themes. Flutter is only a visualizer; all logic lives in neurons.
- **The platform.**
  - The OS is made of shareable synapses that are easy to update.
  - It has a social layer where apps and behaviors are public under their author's name, with a policy you accept at
    sign-up.
- **Engineering.**
  - Testing that loads an app from a folder and clicks through its scenarios.
  - The self-improving loop rebuilt on the clean architecture.
- **Urgency.** You want to start using it as soon as possible.

Assumptions I made, which you should correct:

- I read "change the loop as well" as "the self-improve loop should also be watchable live".
- The screenshot you mentioned did not come through.

---

## 2. Main source of complexity

### 2.1 The short answer

This time it is not one missing concept. It is **one decision that has never been made, plus two missing pieces, plus
a process problem.**

**The unmade decision: where the line runs between the compiled platform and the live program.**

Git history shows the same fork tried, killed or deferred five times since June:

| When | What happened |
|---|---|
| June | GeneratedNeuron + PackAlcEmbodier |
| July | A universal neuron + KindCatalog |
| 08-12 | A cell grain + CalculatorKind. Its log warned that work landing before this decision "will be built twice". |
| 08-18 | The cell tier was retired by omission, not by a ruling. |
| 09-29 | "New renderables ship with modules." |
| 10-09 | The kernel spec deferred "script-defined neurons" again (`FeatureTypes.cs:7-8`). |

Because the line was never drawn, the project builds both sides of it at once. Every large pile of complexity sits on
that line:

| Pile | What it costs today |
|---|---|
| **Self-improvement aims at the compiled side** | In-OS CI/CD rebuilt in four generations: candidate containers, rolling cluster, ContractDiff, compatibility gate, Module and Shell Builders. On a3 that is about 11k lines; about 96% of the runtime code exists only for the host path. The behavior path passes (B Step 2). The module path is 0/12 (Step 3). Promotion strands OS-b (Step 5): the rollback records Steady without restarting it, and the MCPs keep running the candidate build. Plan C is blocked by construction, because all three of its capabilities are compiled. |
| **The UI vocabulary is compiled per widget** | 34 widget kinds, each a compiled grain. About 19 production places per component across C# and Dart, and about 390 hand-kept kind entries in 14 tables. 16 kinds render "Not supported yet". The "renderable palette" was deferred in 7+ docs. |
| **Live programs have no typed home for state** | Apps use widget neurons as their database: Settings keeps preferences as JSON in an `IText`, DataVisualizer keeps its view registry in `IText`, CustomerResearcher keeps its queue in `IText`. |

Successful live systems (Erlang, Val Town, Unison, Darklang, Urbit) all chose **a small frozen kernel plus one live
code unit with one load path**. The hybrids that work (Home Assistant, Node-RED) never let the system modify its own
platform tier. DigitalBrain does both, and the self-improve loop tries to re-implement Erlang's relup on Orleans,
which is the part Erlang practitioners themselves avoid.

**Missing piece 1: runs are not facts.**

- What the kernel has: `TypeKind` is `{ Neuron, Signal, Connector }` (`TypeEntry.cs:23`), and kernel ruling Q4 sent
  activity to OpenTelemetry, outside the system.
- What already exists, unused: "synapse S took signal X of trace T, cost C" is known in
  `BrainRuntimeNeuron.AcknowledgeMany`. It is used only for billing (the trace is memory-only, CPU is process-wide),
  and the only outward fact is a payload-less `BrainRuntimeChanged`. `Trace` landed for paying, not for reading.
- The result:
  - 13 overlapping "activity" notions.
  - The brain graph always sends `activity: []` (`BrainEventsEndpoints.cs:180-181`).
  - Ino's face is hand-reported from 6 call sites.
  - Cost per synapse/app/neuron is never set (`CostMeter.cs:46-56`).
  - Tests use 28 `Task.Delay` calls in 17 fact files to guess "is it done".
- Fixing it is cheap, and it carries the most leverage for the alive vision: it blocks 14 of your 27 ideas.

**Missing piece 2: the human connector's neuron boundary is in the wrong place.** It is too fine at the widget (a
persistent grain per button) and missing at the viewport (no neuron for what the person is looking at).

- Opening the Calculator touches 23 UI grains, and every re-open rewrites 22 of them (22 writes, 22 signals). It
  costs 28 calls and 23 gRPC streams.
- The shell became a second application:
  - `WorkspaceStore` (882 lines) is saved as an opaque blob, keyed by account rather than brain, with a C# validator
    that mirrors the Dart shape.
  - About 37 REST routes and 4 SSE feeds.
  - The generic gRPC `Call` has 0 production callers, and `Watch` is a ping whose payload is discarded before an HTTP
    re-read.
- This is **independent** of piece 1 and of the state gap. Circle and Assistant already have typed domain neurons,
  yet they still copy them into stored widget grains (`CircleView.cs:65-93`; 6 Assistant `projection-*.cs`
  synapses).

**The process problem. This is what makes it *feel* fundamentally wrong, and it is not architectural.**

- About 77% of the last 300 commits (≈15 h) are infrastructure or process: 35% trust/mesh/parts/keys, 21% test
  migration, 12% plans, 9% Aspire/hosting. About 14% are product-facing.
- Two fronts reshape the same host: os-runtime's AppHost front-routes only `OperatingSystem-a`
  (`AppHost.cs:93-95`, part-log lease), while a3's roll requires a routable peer (`AspireCliClusterHost.cs:152`).
  After the pending merge, a roll can never pass its precondition.
- Mesh Task 27 (TPM agreement keys) is being written in the working tree right now.
- os-runtime is 466 commits ahead of master, and CI only triggers on master and PRs (`ci.yml:3-7`).

### 2.2 What the panel disagreed on, and how I resolved it

- **The blind diagnosticians:**
  - Two named "a program cannot declare a neuron / the compiled-vs-live fork" as the root. They argued from
    complexity accounting and from history.
  - One named "execution is not a fact", arguing from leverage on your ideas.
- **The skeptics** refuted my first framing, "the fourth word isn't real: one root with four faces":
  - Views do not follow from programs lacking state (the Circle/Assistant counterexample).
  - The kernel already records programs as Features; it lacks their hash, their behaviors and their runs.
  - "Script-defined neuron contracts" would be a runtime schema language, a fifth concept in disguise. Orleans cannot
    add grain types to a running silo, and sandboxed code must not enter silo load contexts.
  - Apps can **already** declare typed state at runtime through Postgres `ITable.Define`.
- **The resolution:** the fork is real and is the main source, but the fix is a **ruling**, not a new concept. Rule
  that contracts stay compiled, give apps typed records over what exists, and point self-improvement at the live
  tier. Runs and views are separate, co-equal pieces to build.

### 2.3 The ruling I would propose (decision D1)

| Tier | Holds | Released how |
|---|---|---|
| **Compiled kernel** | Orleans host + kernel; generic neuron kinds, including typed records/tables; connectors to external systems (one generic webhook + outbound HTTP covers most new ones); the renderer catalog (Flutter/Flame/Rive components) | PR + CI, human-promoted, plain restart. The A1 candidate stays as CI. |
| **Live unit = app bundle** | Everything else: Ino, home, menu, Circles, built-in apps, scenes, the self-improve loop's logic, other people's apps | `IBrainPrograms.Assign` / FeatureLoader / Marketplace. Content-hashed and revertible (`IApp.Rollback` exists). |

Consequences:
- "Script-defined neuron contracts" is closed as a non-goal.
- The Engineer writes bundles.
- The rolling-cluster/compat-gate machinery leaves the user's loop.
- "The type system is the grammar" stays true. The grammar just stops being something the loop rewrites.

---

## 3. Feature map

Priorities:
- **P0**: decide or unblock this week.
- **P1**: the first usable, alive product.
- **P2**: beauty, scale, going public.
- **P3**: later or maybe.

"Ideas" are your numbered ideas (index in §7).

### D — Decisions only you can make (P0, no code)

| ID | Decision | Ideas | Notes |
|---|---|---|---|
| D1 | Rule the compiled/live line (§2.3) | 21, 25, 26 | Ends the fork that keeps coming back |
| D2 | Self-improvement: **pivot** to the runtime path (park A2/A3 roll and the Module/Shell Builder; rewrite C), or **continue** the handoff (fix roll, Luna runs, C with Engineer-built modules) | 21, 27 | Continuing costs 2–4 days of live sessions (every past one was cut short by the environment) plus a topology fight with the part log. Pivoting delays the "brain builds a module" demo, which went 0/12. |
| D3 | Freeze mesh: park Task 27's mesh half (agreement keys, TPM ECDH, rotation, in the tree now), Tasks 28–30, and Task 25 storage credits. Social runs on one cluster first. | 15, 26 | Keep the Stage A part log on: it is the only signal journal (`SignalJournal.cs:3-4`) |
| D4 | One integration line: tag a3 and do not merge it (if D2 = pivot) | 27 | A merge cannot satisfy the roll precondition |
| D5 | `IFlameEngine` as you described it, or a renderer-agnostic **scene neuron** with Flame as the connector's renderer. And Flame scope: all UI, or world/scenes/transitions with Flutter overlays for text, forms and accessibility. | 1, 6 | Research recommends the scene neuron (see §5.1) |
| D6 | Change the principle "a button is an edge neuron" to **"the window/scene is the edge neuron; its widgets are nodes in its view document"** | 12, 13 | Rewrites a CLAUDE.md line and the digitalbrain-mcp recipes (`IButton.Click` becomes a `ViewEvent`) |
| D7 | What "use it ASAP" means: (a) you, daily, on the desktop; (b) a public launch at digitalbrain.tech; (c) the Musk→Bitcoin demo | 3, 26 | Decides whether Google sign-in, terms, Commons and hosting are P1 or P2 |
| D8 | Navigation: does Esc go to Home or to the Menu? Where do "running activities / rolling shows" live? Where does a user land after sign-in, Home or Circles? | 5, 11, 18 | You wrote both "home on escape" and "menu page is when user clicks escape" |
| D9 | "Guarantee scenarios": a CI theory only, or also a verification badge before an app is shared? | 16, 23 | Touches the 2026-10-06/07 "no app tests" ruling |
| D10 | Circles: the public community (Discussions-style) or Plan 8's private custody circle? An app or a module? Do Task 26 rulings R124–R131 still stand? Founder auto-invite, or "my public behaviors under my name"? | 15, 18 | R126 forbids script-made memberships |
| D11 | Update channels: NuGet for kernel/connectors plus hash-addressed Marketplace releases for apps, or NuGet for everything? | 25 | |

### V — Unblock velocity (P0, existing design, no brainstorm)

| ID | Item | Ideas | Today |
|---|---|---|---|
| V1 | Configurable infra ports, so an AppHost runs beside other sessions | 26 | Fixed ports. Every A2/A3/B live run was cut short by clashes, disk or docker. |
| V2 | CI on os-runtime; fix the 6 architecture reds, including the real `RouterDecided` missing-`[Id]` serialization bug (AI owner) and the orphaned `src/Modules/Microsoft/Roslyn` | 22, 24 | `ci.yml` ignores os-runtime |
| V3 | Lean boot profile `dotnet run digitalbrain.cs use`: one OS silo **with** the part log, one MCP; no OS-b cloud machine, volunteer storage, live-build switch, fronts or candidate hosting | 19, 26 | Every dev boot is a mesh test rig: trust cluster, 2 OS machines, 2 MCPs, 2 fronts, ~10 infra resources |
| V4 | Circle app as an OS default | 15 | Not in `OsApps.cs:38`; new users never see Circles |
| V5 | Wire the shell's host hooks (secret vault, image canvas, voice) | 10 | Secret fields are read-only in production; `storeSecret` has no caller |
| V6 | Assistant app fixes in `features/os/Assistant`: the composer path lacks `IMcpServer`/`IPageTools`; guard `AskModel` (possible crash loop); rewrite the stale `app.cs` spec | 8 | The spec still describes the removed Invoke/Await model |
| V7 | Runtime hot paths: stop persisting/journaling heartbeats and acks; make `IBrainRuntimeEdge.Identity` read-only/interleaved; skip unchanged widget writes on re-open | 14 | Full state saved every 20 s, on each arrival and on each ack; every script call takes a turn on one grain |
| V8 | Deletions: orphan UI kit (~3.6k lines); IntoChat-era agents (`intocaht`); unmapped `/chats/*/brain` calls; dead `IUiBinding` dispatch; 66 test-only UiKit routes; 4 empty root files; 5 bin/obj-only test dirs; dead Roslyn module; stale Dockerfile path | cleanup | |
| V9 | Show "my brains" in the shell through the existing `IKernelView.Brains()` | 10 | The kernel answers it; there is no HTTP route and the shell reads its own blob |
| V10 | One gRPC `Watch` per window instead of one per widget (Dart only; the proto already takes repeated sources) | 3, 12 | Required on web: a browser allows ~6 connections per origin |

### K — Kernel and runtime

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| K1 | **Runs are facts.** `BehaviorStarted`/`BehaviorRan` (behavior, source, signal type, trace, duration, outcome) published unjournaled from the runtime. Features gain program hash + behaviors. Reverses kernel ruling Q4 for runs only. | 5, 7, 8, 13, 14, 21, 23 | P1 | Brainstorm #1 (small) |
| K2 | `Settled(trace)` / brain `Idle`, documented as covering synapse batches only (not agents or timers) | 22, 23, 24 | P1 | K1 |
| K3 | Signal id + cause (behavior, input signal, actor) stamped at `Neuron.Stamp`/`RuntimeEdge`; per-item trace instead of the batch's first trace | 7, 14 | P2 | K1 |
| K4 | Cost attribution: fill `Cost.Synapse/App/Neuron`; keep trace budget/origin across the sandbox edge | 7, 10 | P1 | K1 |
| K5 | **Typed app state without new contracts:** `brain.Table<TRecord>(name)` over the existing `ITable`; placement fallback when no `tables` slot is bound; typed operations `brain.On<TInput>(app, op)`; additive-only record check at Publish | 9, 12, 25 | P2 (first part of step 5, before U1) | Brainstorm (small) |
| K6 | Script-defined neuron contracts (generic host grain) | 25 | P3 | Recommend closing as a non-goal (D1) |
| K7 | Actor on facts: requester on `AppRequested` (author ≠ payer) | 15, 16 | P2 | Brainstorm |
| K8 | Neuron-level/wildcard subscriptions (`React(sources, rebuild)`), collapsing Assistant's 6 projection synapses and CustomerResearcher's 3 into one each | 9 | P2 | Brainstorm (synapse vocabulary) |
| K9 | Generic **webhook edge neuron** + **outbound HTTP connector** (compiled once). Twitter, prices etc. become synapse apps. | 25, 27 | P1 for C | D1 |

### O — Live brain data path

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| O1 | Per-brain activity stream over the existing gRPC `Watch`: topology with kernel-stamped ownership (no key-prefix guessing) + aggregated pulses at 4–10 Hz. Replaces `/brain/events` (activity always empty), the 3-feed `/live` whitelist and the replay REST pages. | 5, 7, 13, 14 | P1 | K1 |
| O2 | Per-synapse drill-down: runs, logs, spans (sandbox spans need an `ActivitySource`, none exported today), cost | 7, 21 | P2 | K1, K4 |
| O3 | Replay / time scrub on the same reducer, with a stable journal cursor | 7 | P3 | O1 |
| O4 | Privacy: the stream carries ids, types and counts only; payloads go through authorized calls; owner-only | 7, 15 | with O1 | |

### U — UI model (server contracts)

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| U1 | **Surface view document.** The window/scene is the edge neuron. Its state is one view document (catalog components + data). `ViewChanged` carries the value, so the client never re-reads. `ViewEvent` is input and stays addressable by MCP and E2E. Domain state never lives in widgets. | 4, 9, 12, 13, 20 | P2 | D6, brainstorm #3, K5 |
| U2 | **Scene neuron** per device in your home brain: route (home/menu/circles/brain/app), focus target, theme. Esc and menu are events on it. Camera motion stays client-local. Replaces the `IShellState` blob and `WorkspaceStore`. | 5, 10, 11, 12, 13 | P1 minimal | Brainstorm #2 (route/focus/theme only) |
| U3 | One catalog source generating C# builders, the Dart registry, Widgetbook stories and Creator prompts (collapses ~14 kind tables) | 9, 20 | P2 | U1 |
| U4 | Default view per contract, so any neuron is visible without hand-written projection synapses | 13 | P2 | U1 |
| U5 | One theme vocabulary (today midnight/paper/lumen vs system/light/dark); later theme tokens as state | 9 | P1 / P2 | U2 |
| U6 | Retire side channels: `/apps/node`, `/apps/event`, the SSE feeds, 2 s polling, the shell blob | 12 | P2 | U1, U2 |

### R — Renderer (Flutter / Flame / Rive)

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| R1 | **Ino orb**: fragment-shader sphere (~120 lines of GLSL: fbm displacement, fresnel rim, inner flow), springs between states, frozen when idle; reads `AppActivity` now and the Ino neuron later | 2 | P1 | none |
| R2 | **Minimal 2.5D Flame brain**: today's topology + run pulses + heat-following camera + tap → overlay with `IBrainRuntime.Describe`/`Logs`. Engine paused when idle. Flame 1.38.2 stable APIs. | 7, 11, 14 | P1 | O1 for pulses |
| R3 | Full brain world: 3D force layout; semantic zoom (Circles galaxy → brain → app lobe → synapse); **spatial navigation** (zoom into an app and its UI appears in-world, Esc zooms out); flutter_scene spike gate for true 3D; replaces `LumenBrainGraph` and `UiGraph` | 7, 11, 13 | P2 | R2, U2, U4 |
| R4 | Flame for scenes, transitions and game-like chrome; Flutter overlays for text, forms and accessibility | 1, 6 | P2 | D5, U2 |
| R5 | `flame_behavior_tree` presets for presentation only (Ino idle/move-to, camera director), never business logic | 6 | P3 | |
| R6 | Rive: a generic rive kind bound to neuron state (projection only), for Ino's expression, activity cards and connection tiles. `.riv` needs the paid editor; self-host the WASM. | 2, 6 | P3 | U1 |
| R7 | Widgetbook v4 catalog + goldens (replaces the 1,426-line hand-built gallery) | 20, 22 | P2 | U3 |
| R8 | Shell = pure renderer of scene + surfaces over `Call`/`Watch` only | 12 | P2 | U1, U2 |
| R9 | **Rule from day one:** every new visual (orb, menu tiles, run cards, brain renderer) is a pure function of a view-model record, never wired to REST inside the widget, so it moves into the catalog unchanged | 12, 20 | P1 | |

### X — Experience: OS apps and flows

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| X1 | **Home = Ino scene**: orb + caption + composer + running tiles. Creator builds animate Ino too (drop the assistant-only filter, `assistant_island.dart:36,65`). | 2, 8 | P1 Dart-first; P2 as an app | R1, R9 |
| X2 | **Menu / control center** (Esc or menu button): brains, connections and integration usage, settings + accounts, active tasks, Circles | 5, 10 | P1 as view-model components; P2 as an app | V5, V9, K4, O1 |
| X3 | Brain view scene | 7, 11 | P1 minimal / P2 full | R2 / R3 |
| X4 | Landing at digitalbrain.tech: Ino offers Google sign-in or registration | 3 | P2 (P1 if D7 = public) | Google as a platform identity (today only a Gmail connection), S6, P5. Pre-auth Ino has no brain or payer, so it is a scripted client scene. |
| X5 | Built-in apps on surfaces: Calculator first (23 grains → 1 surface + 1 typed state, a `Keypad` component), then Circle, Settings, Assistant (8 of 14 synapses copy state into UI), DataVisualizer | 9, 20 | P2 | U1, K5 |
| X6 | Twitter-like app, friends list, chat, editor, code-editor components | 9 | P2/P3 | U1, U3, S3, S8 |
| X7 | Running activities as "rolling show" viewports | 5 | P2 | O1, D8 |
| X8 | First-sign-in route (Home or Circles) as scene state | 18 | P2 | D8, U2 |

### I — Ino

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| I1 | Ino presence neuron: turn (idle/listening/thinking/working/speaking/waiting), activity, detail, target, trace. Folded from agent-turn signals + `AppActivity` now, runs later. One retained signal over `Watch`. | 2, 8 | P1 | The "cross-app subscription scopes" front, or module code meanwhile |
| I2 | Ino navigates and draws: the scene neuron and surface `Show` are its tools; it awaits outcomes through K2 | 8, 9 | P2 | U1, U2, K2 |
| I3 | One Ino: one entry path, one contract list, one loop (today the dock and the window composer differ, and there are 4 agent loops) | 8 | P1/P2 | AI module owner |
| I4 | Ino writes apps (`IAppStudio`), so what it builds is shareable | 8, 16 | P2 | L1 |

### S — Social, Circles, sharing

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| S1 | Release identity: program content hash + parent hash on Feature/AppVersionRecord/Marketplace; refuse re-publishing an unedited installed copy | 16, 25 | P2 | |
| S2 | Install safety: per-program claims at the runtime edge (today any behavior in a session can act as any app); capabilities shown at install; verification ladder (compile → scenarios → LLM capability check → human review for featured/reported); opt-in or verified-only updates; revoke | 15, 16 | P2/P3 | T2, D9 |
| S3 | **Commons**: a public brain running an `os/circles` app as synapses (post, comment, vote, answer, report, moderate, follow, Trending, a thread per listing) | 15 | P2 | K7, S1, D10 |
| S4 | Gist-like public apps/behaviors under the author's name, with lineage, likes, installs and a public page | 16 | P2 | S1 |
| S5 | Single-file app format (for gists and the starter) | 16, 19 | P2 | |
| S6 | Terms clickwrap (versioned, timestamped) at sign-up | 17 | P2 (P1 if public) | |
| S7 | Founder invite, declinable, or follow | 18 | P3 | D10 (R126) |
| S8 | Follow graph + notifications | 9, 15 | P2 | S3 |
| S9 | A real creator account owns first-party apps (`efea3fdc1` reverted owners to folder strings) | 18, 19 | P2 | |

### L — Self-improvement

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| L1 | **Loop on the runtime path**: the Engineer writes app bundles (`IAppStudio`, `IBrainPrograms.Assign`), stages them in an in-process TestBrain, runs their scenarios, assigns live, and reverts with `IApp.Rollback` | 21, 25 | P1 | D2, T1, T2 |
| L2 | Compiled changes become a PR + CI with a human promote (A1's candidate kept as CI) | 21 | P1 | D1, D2 |
| L3 | Watchable loop: builder runs show as activity in the brain view | 21 | P2 | O1 |
| L4 | **C (Musk→Bitcoin) as the first product demo** on the runtime path: K9, chart markers, app built by the Engineer, watched live | 14, 27 | P1/P2 | K9, L1 |
| L5 | Only if D2 = continue: a first-class write tool (WriteFile content is escaped inside a JSON-string argument; the uncapped run made 170 reads and 0 writes), Luna runs, roll fixes (pre-flight routability, peer check before the irreversible drain, rollback that restores every moved instance) | 27 | — | D2 |
| L6 | SelfImprove app: nested `await foreach` in `healthy.cs`/`verified.cs`; markdown-only surface | 21 | P2 | |

### T — Testing

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| T1 | **In-process sandbox target**: `TestBrain.WithApp(folder)` runs real synapses in-process (the `Sessions(..., HttpMessageHandler edge)` seam exists) | 22, 23 | P1 | none |
| T2 | **Scenario runner ("LiveViewTest for neurons")**: one generic theory over every app's `## Scenario:` sections; act → settle → assert through a headless Screen; verb grammar owned per UI kind; each scenario must fail on the empty program; no per-app test files | 23 | P1 | T1, K2 (stopgap: runtime pending == 0) |
| T3 | Replace the sleeps (28 `Task.Delay` in 17 facts, 21 sleep sites) with Settled or channel-backed fakes | 24 | P1 | K2 |
| T4 | Speed tier: a no-host tier on a fake `IDigitalBrain` for algorithms; one shared brain per class; per-component clock (the host-wide `FakeTimeProvider` freezes Orleans → 60 s hangs); cut the 216 `Fact(Timeout)`; 4 facts have timeouts over 5 min | 22 | P2 | |
| T5 | Leftovers: dashboard as a module + restore its 2 deleted facts; GitHub `ApiBase` integration; `SandboxUrl` integration; Playwright provider; **revised target** of 11 hand-built hosts → 0 (27 of the 38 `AddInMemoryCollection` calls are legitimate config binding); flaky `ReactFacts` (coalesce race + 500 ms sleep) and `PartLogFacts` (host-wide clock + `BatchDelay` race); CLAUDE.md names `FakeSandbox`/`RecordingCSharpFile`, which do not exist | 24 | P2 | |
| T6 | Watchable test runs: point the runner at a visible brain | 23 | with T2 | O1 |
| T7 | Flutter renderer tests per kind (Widgetbook + goldens + one semantics test per kind); delete the 23 shell tests pinning REST paths and the 19 pinning `WorkspaceStore` as logic moves | 22 | P2 | R7, R8 |

### P — Packaging, distribution, hosting

| ID | Feature | Ideas | Pri | Blocked by |
|---|---|---|---|---|
| P1 | Starter = V3 now; later the starter *is* the composition, not a launcher for an Aspire graph | 19 | P1 | V3 |
| P2 | First-party apps decoupled from the image (A1's synapse-only Calculator change went through Docker and a cluster restart) | 25 | P2 | |
| P3 | DigitalBrain as an app of itself, listed in the Marketplace under a real account | 19 | P2 | S9 |
| P4 | NuGet: 74 projects packable, 0 pushed, version mismatch (`0.1.0-alpha.1` vs `VERSION` `0.0.1`) | 25 | P3 | D11 |
| P5 | Public cloud OS at digitalbrain.tech: domain, TLS, Flutter web deploy, sign-up rate limits, self-hosted Rive WASM | 3 | P2 (P1 if public) | D7 |

### W — Work in flight (recommendations, pending D2–D4)

| ID | Plan | Recommendation | Cost if wrong |
|---|---|---|---|
| W1 | A2 roll defect fix | Park | Roll fixes later cost 1–3 days |
| W2 | A3 deferred live checks | Park with A2 | The state-compat ratchet (`AdditiveStateFacts`, 94 fixtures) can be retired with it |
| W3 | B Engineer Steps 3/5 | Park the Module/Shell Builder; harvest `IAppStudio.Start/Revise` (~124 lines) into L1 | The "brain builds a module" demo is delayed |
| W4 | C acceptance | Rewrite onto the runtime path (L4). Its "no hand-written module" rule changes, because webhook and HTTP become kernel pieces. | You lose an acceptance test of exactly what precedents say an agent should not own |
| W5 | Batched live session | Replace with one runtime-path verification session after L1 | |
| W6 | a3 → os-runtime merge | Tag a3; do not merge (53 ahead, ~268 behind) | The merge gets harder over time |
| W7 | Brain-as-data | Freeze Task 25; park Task 27's mesh half and Tasks 28–30; keep the part log on | The R1–R134 plan stays valid; resuming is a branch merge |
| W8 | Hard rules from the handoff | Keep: own ports first; never edit `src/DigitalBrain.Modules/AI/**`; commit with `--only`; kill test runs over 5 min; no timeout band-aids; end reports with model success rates and every Ruling line | |

---

## 4. Recommended order: product-first, foundations underneath

The skeptics' strongest point: if architecture comes first, phases 1–3 produce nothing you can see and open four
contract fronts at once, the same pattern that produced 39 open plans. So **ship an alive slice on today's
architecture** and pull each foundation in only when a visible feature needs it. Design sessions run in parallel on
paper.

| Step | What | Size | Visible result |
|---|---|---|---|
| 0 | **Decision day**: D1–D4, D7, D8 | no code | Stop the bleeding: mesh frozen, handoff decided, one integration line |
| 1 | **Unblock**: V1–V10 | 1–2 days | A lean boot you can run daily; Circles visible; integrations connectable |
| 2 | **Brainstorm #1 → K1, K2, K4, O1.** In parallel: T1, T2 (stopgap settle), T3. | small design, ~week | Runs become a stream; tests stop sleeping |
| 3 | **Alive slice**: R1 orb home (can start in step 1), X2 menu as view-model components, R2 Flame brain with pulses and follow camera, I1 Ino presence, U2 minimal scene neuron (brainstorm #2) | ~1–2 weeks | You watch a click or a post travel through the brain |
| 4 | **Self-improvement on the runtime path**: L1, L2, K9, L4 (C as the demo, watched live) | ~week | The brain builds an app and you watch it happen |
| 5 | **Brainstorm #3 → views as values**: K5, U1, U3, U4, X5 (Calculator, then Home and Menu as apps), R7, R8, U6 | biggest | Beautiful built-in apps; Flutter becomes a pure renderer |
| 6 | **Public**: S1–S9, X4, P5 | — | digitalbrain.tech, Commons, shared apps |

Every step ends "seen running": Aspire healthy → driven through digitalbrain-mcp → confirmed in traces.

---

## 5. Research digest

### 5.1 Flame (ideas 1, 6)
- **Versions.** Flame 1.38.2 is stable. 2.0.0-dev.1 needs Flutter 3.47 / Dart 3.13, which matches the local toolchain
  (3.47.6 / 3.13.5), but it brings API churn and a `material_ui` migration.
- **What Flame is good for:** the brain world, the camera director, signal pulses, scene transitions.
- **What it is bad for:** text input, forms, scrolling, accessibility. Those stay Flutter widgets layered as overlays.
- **3D options.** `flame_3d` is experimental and has **no Windows support**. `flutter_scene` 0.24.3 covers web and
  Windows but is pre-1.0.
- **State machines.** Flame core has none. `flame_behavior_tree` (the examples you linked) suits presentation AI only.
  It has 55 downloads, and its name clashes with our *Behavior*.
- **Why a scene neuron rather than `IFlameEngine`.**
  - A renderer-named contract leaks a Dart library into the vocabulary.
  - Imperative per-frame calls over gRPC would be dropped by the bounded `DropOldest` Watch (`NeuronsService.cs:46`)
    and persisted by mutators.
  - The fit is a neuron holding *intent* (route, focus, camera target, nodes from a closed palette), with Flutter/Flame
    reconciling by node id so the diff is the animation.

### 5.2 3D brain (idea 7)
- **The data is the hard part, not the pixels.** Both existing graph renderers use fixed ring/grid layouts with no LOD,
  and their feed has no execution in it.
- **Phase 1 renderer:** a Flame 2.5D impostor renderer.
  - Drawing: `drawRawAtlas` spheres, additive glow, a `drawVertices` filament mesh, pooled comet particles, a nebula
    shader.
  - Layout: a seeded 3D force layout (app lobes on a Fibonacci sphere, connectors on the outer shell).
  - Navigation: semantic zoom and a heat-weighted follow camera.
- **True 3D gate:** a 2-day `flutter_scene` spike (5k instanced spheres, 10k particles, bloom, web raycast, ≥55 fps on
  an iGPU).
- **Rejected:** `three_js` (ANGLE defects) and three.js in an `HtmlElementView` (it breaks overlay pointer events and
  accessibility).
- **How the four words map:** neuron = sphere, synapse = filament into its app lobe, signal = particle,
  connector = outer shell, brain = scene, Circles = galaxy.

### 5.3 Ino's presence (ideas 2, 6)
- **Rive** 0.14.x (`rive_native`) replaced state-machine inputs with view-model data binding.
  - It breaks often and has had Windows crash fixes.
  - On web it loads its WASM from jsDelivr unless self-hosted.
  - `.riv` files need the paid editor to export, and the LLM cannot write them.
- **Lottie** has no state and no interactivity, so it is out for Ino.
- **Recommendation:** a shader orb now; Rive later as an expression layer bound to Ino's state; keep the CustomPaint
  face as the test fallback.
- **"As many state machines as possible":** domain state machines live in neurons. Rive state machines are
  projections only, and reconnecting mid-animation must give the same picture.

### 5.4 Widgetbook and server-driven UI (idea 20)
- **What mature server-driven UI systems share.** rfw, Stac, DivKit, Airbnb Ghost, Shopify, Lyft, Glance, LiveView,
  Hotwire, Elm and A2UI all do the same three things:
  - state lives in one model;
  - structure lives in **one document per surface**;
  - components are **section-sized**.
- **What stays on the client:** pressed states, transitions and animation.
- **None of them** makes each button a persisted server object.
- **Widgetbook v4** (beta): use cases, knobs and addons, with optional Cloud review and golden diffs. **It does not make
  the calculator beautiful.** Fewer, richer components do. Widgetbook makes designing, reviewing and regression-guarding
  them cheap.
- **Our 1,426-line gallery** is already a proto-Widgetbook that injects fixtures into the real `NeuronView`.

### 5.5 Social sharing (ideas 15–18)
- **What the working precedents share.** Gists, Val Town, Hugging Face Spaces, Sandstorm, Raycast, Figma Community,
  Home Assistant blueprints and Obsidian all have an addressable artifact with declared authority, plus a thin social
  layer: profile, remix lineage, one like signal, threads on the artifact plus one global space, Trending/Newest.
- **Moderation that scales to agent-written code:** automated checks on every version, plus human review of flagged
  releases, plus a kill switch.
- **Auto-update spreads compromises fast:** the Nx Console case (May 2026) pushed a trojan to a verified publisher's
  users within minutes.
- **Legal:** DSA Articles 16–17 (report, statement of reasons) apply from the first public post.
- **Founder auto-join:** Mastodon reverted auto-following the admin in 2021, so make it a declinable invite.

### 5.6 Testing by simulating a user (ideas 22, 23)
- **The closest analog is Phoenix LiveViewTest.** Our UI is already a typed server-side tree (Workspace → Surface →
  Layout → `IButton.Click`/`IText.Read`), so the test is a peer of the renderer and not a pixel problem.
- **The real sandbox host code** (`Sessions`, `BehaviorLoader`) already runs in-process in CSharp tests. Nothing wires
  it to a real TestBrain.
- **All 6 Calculator scenarios fit** a small verb grammar.
- **Rules against rot:**
  - no per-app test files;
  - each scenario must fail on the empty program;
  - executable vs prose counts are reported;
  - LLMs explore and propose scenarios but are never the gate.

### 5.7 Live and self-modifying systems
- **Self-improving agents.** Voyager and Devin grow skill libraries on a frozen platform. Darwin-Gödel Machine and
  AlphaEvolve mutate small code offline against evaluators. **None of them rolls its own production runtime.**
- **Engineer B's failure was predictable.** "85–170 exploratory calls, no writes" is the expected symptom of aiming a
  small model at a 52k-line compiled tier.

---

## 6. Built-in apps and custom UIs: reality check (idea 20)

- **Calculator today**
  - What it is: 16 default Material `TextButton`s in 4 generic rows. `ButtonState` has no tone or variant, so no
    renderer can draw a keypad without a contract change.
  - Every re-open rewrites 22 grains and triggers 22 shell refetches.
  - A key press costs 2 storage writes and 3 signals.
  - The expression lives in the display widget ("State is the display neuron").
- **Calculator on a surface + catalog**
  - What it becomes: one `Keypad` component (press animation, haptics, display transition), 1 surface + 1 typed
    state.
  - Open drops from 28 calls and 23 streams to 1 `Show` and 1 stream. A key press drops to 1 write and 1
    `ViewChanged`.
  - It gets Widgetbook stories across themes and goldens.
- **Other first-party apps**
  - Assistant: 8 of 14 synapses copy agent state into UI.
  - DataVisualizer: view registry kept as JSON in `IText`; one "show" triggers 2+ refreshes.
  - Circle: text cards; `share`/`set-share` only change what is displayed.
  - Settings: preferences as JSON in `IText`, while the shell keeps its own clashing theme vocabulary.
- **Across all 12 apps** (3,459 lines): 21.7% UI composition, 42.8% boilerplate, 35.5% domain logic, so about 2.5
  lines of plumbing per line of logic. The Flutter shell plus UI kit (22.5k Dart lines) is 6.5× larger than all
  feature app code.
- **The Creator** cannot produce a beautiful app today:
  - its prompts carry no UI vocabulary;
  - layout has only Mode/Gap/Extents;
  - beauty lives in Dart.
  - U1 + U3 (catalog-generated Creator prompts) fix this.

---

## 7. Idea → feature index

| # | Your idea | Features |
|---|---|---|
| 1 | IFlameEngine neuron over gRPC | D5, R4, R2 |
| 2 | Ino sphere showing what it does | R1, I1, X1 |
| 3 | digitalbrain.tech landing, Google/register | X4, P5, D7, V10 |
| 4 | Simple but powerful UI | U1, U5, R9 |
| 5 | Esc menu, all running activities, rolling shows | X2, X7, O1, D8 |
| 6 | Flame components, state machines | R4, R5, R6 |
| 7 | 3D live brain, follow camera, synapse telemetry | R2, R3, O1, O2, K3 |
| 8 | Ino navigates, observes, draws UI | I1, I2, I3, V6 |
| 9 | Compose custom UI (Twitter-like, friends, themes) | U1, U3, U5, X6, K5, K8 |
| 10 | Control dashboard: connections, accounts, tasks, brains | X2, V5, V9, K4 |
| 11 | Scenes home → menu → Circles → brain | U2, X1–X3, D8 |
| 12 | Flutter is only a visualizer; home as an app | R8, U6, U2, V10, R9 |
| 13 | Default visualizer for any synapse with UI | U4, R3 |
| 14 | Every event visible live | K1, O1, R2, V7 |
| 15 | Circles: discuss, share, use, comment, vote | S3, V4, D10 |
| 16 | Public apps/behaviors like gists under your name | S1, S4, S5 |
| 17 | Platform policy at sign-up | S6 |
| 18 | Land in Circles; creator invite | S7, S9, X8, D10 |
| 19 | Starter file; DigitalBrain as an app of itself | P1, P3, S5 |
| 20 | Built-in apps quality; Widgetbook | X5, R7, U3, §6 |
| 21 | Self-improvement on the clean architecture, watchable | D2, L1–L6 |
| 22 | Better, cleaner, faster testing | T1, T4, V2 |
| 23 | Load an app folder, simulate clicks, guarantee scenarios | T1, T2, T6, D9 |
| 24 | One-host-testing leftovers | T3, T5, V2 |
| 25 | OS made only of synapses; update = latest NuGet | D1, D11, K5, K9, P2, P4 |
| 26 | One product, ASAP | D7, V3, §4 |
| 27 | In-flight A/B/C, merge, mesh | D2–D4, W1–W8 |

## 8. Fact-check corrections applied

- **Calculator:** 23 grains are involved, but a re-open rewrites 22 of them. The display and the window are not
  rewritten.
- **OS silos:** os-runtime runs two OS processes, but only `OperatingSystem-a` is front-routed. `OperatingSystem-b` is
  a separate-cluster cloud machine, matches the roll's `{role}-b` pattern, and can never pass its readiness check.
- **AcknowledgeMany data:** it has CPU (process-wide) and the batch trace (in memory only, and only for the first
  traced signal). The synapse can be derived from state but is never recorded.
- **Renderers:** 16 kinds fall back to "Not supported yet". `chat` and `composer` are missing from the registry but
  still render, so 18 kinds render.
- **Commits:** 77% infrastructure/process, 9% runtime/synapse API, 14% product.
