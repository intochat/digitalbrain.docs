# MVP: live shell, Ino, replay, files, themes, rules, circles — design

**Status:** approved in chat 2026-10-10 (option A for rules). Builds on
`2026-10-09-shell-desktop-design.md` (dock, assistant island), `2026-10-10-aspire-instance-neuron-design.md`
(`ICluster`, `ClusterChanged`) and `2026-10-10-federation-circles-mesh-design.md` (circles Q6, Q11, Q14; mesh
transport stays there). Nothing here is a fifth concept: every item is a neuron, a signal, a behavior or a
connector.

## Main source of complexity, and the rule that fixes it

The Home infrastructure strip is the only part of the shell that **polls** (5 s timer → HTTP → `ICluster.Silos()`
→ `aspire describe` process → file read), pads every non-Aspire module with an "Unknown" row, merges connections
into the same row type on the client, and replaces the list wholesale each tick. Wholesale replacement is why
nothing animates: there is no previous state to animate from. Everything else in the system is a signal.

**Rule:** the shell never polls. Every live thing on screen is a signal the shell subscribes to and diffs. Animation
is the visible diff between two signal values. The same rule gives Ino's presence, the brain-development replay and
the circle chat for free.

## 1. Infrastructure strip is a signal

- `ClusterChanged` (Aspire contracts, `Contracts/Signals/ClusterSignals.cs`) carries the silos:
  `ClusterChanged(string Stage, string Sha, SiloState[] Silos)` with
  `SiloState(string Id, string Sha, string State, string Health)` (concrete array, not `IReadOnlyList`).
- `ClusterNeuron` owns the sampling: an Orleans timer reads `AspireCliClusterHost.Silos()` and publishes
  `ClusterChanged` **only when the value differs** from the last published one; the retained last value seeds late
  subscribers like other neurons do. The CLI call moves from "per shell tick" to "per cluster, when changed".
- Deleted: `GET /brains/{id}/infrastructure`, `InfrastructureEndpoints`, `InfrastructureView`, `InfrastructureRow`,
  the Dart `infrastructure.dart` model and `readInfrastructure()`, the `"Unknown"` placeholder rows, the connection
  merge in the strip and the `loadConnections` parameter.
- The strip renders only Aspire silos from `ClusterChanged`, keyed by `Id`, with implicit animations on
  enter/leave/state change (`AnimatedSwitcher`/`AnimatedContainer`, honoring reduced motion).

## 2. Ino is the assistant's activity made visible

- `IApp.Progress` becomes `Progress(string State, string Detail)` and publishes
  `AppActivity(string App, string State, string Detail)` (Apps contracts, `Signals/AppActivity.cs`) besides keeping the
  activity line. `State` is one of `idle, listening, accepted, working, reading, searching, waiting, completed,
  attention, disconnected` — the Dart `InoPresenceState` names, verbatim. The Creator's build loop reports its
  rounds through it (`working` while building, `reading`/`searching` on the tool it runs, `completed`/`attention`).
- The assistant app's synapses report `listening` on `send`, `working` during the turn, `completed` on answer,
  `attention` on failure or rejection.
- The dock's assistant island renders `InoPresence` driven by the latest `AppActivity` of the `assistant` app and shows
  `Detail` as a caption. When no app is focused Ino is centered and floats; with a focused app it docks. Replaces
  `AssistantCat`.

## 3. Brain development is replayable

- `ISignalJournal` gains `ReadSince(BrainId brain, long since, int limit)` returning journalled signals in sequence
  order. `NoSignalJournal` returns empty; `PartSignalJournal` reads every part of the brain through
  `PartLog.SignalsSince`.
- `GET /brains/{id}/signals?since=&limit=` (Platform routes under `BrainRoutes.Group`) returns
  `{ "next": seq, "signals": [...] }`, each signal with its type name, publisher, sequence and payload.
- Home shows the brain graph (`LumenBrainGraph`) fed by the existing brain SSE feed (`watchBrain`): new neurons,
  apps and synapses appear with an entry animation. A scrub bar reads `/signals` from 0 and replays the graph's
  growth; the live feed resumes at the end.

## 4. Files are an app

- `features/os/Files` (`files`): operations `open`, `browse(path)`, `read(path)`. Its surface lists the connected
  Windows machine's roots and folders through `IFileSystem.List`, and shows a `.cs` file as the neuron it is: the
  synapse source plus the owning app's state. "Open my files" is Jev/assistant routing to `files.open`.

## 5. Themes

- `UiTheme` gains named palettes `midnight` (today's dark), `paper` (today's light) and `lumen` (green-black, Ino's
  colour). The `theme` setting holds the palette name; Settings shows a picker; switching animates
  (`themeAnimationDuration`).

## 6. Rules: a behavior that judges instead of acts (option A)

- `DigitalBrain/Synapses/ILogic.cs`: `interface ILogic<TSignal> where TSignal : Signal { Verdict Validate(TSignal signal); }`
  with `record Verdict(bool Allowed, string Reason) { static Verdict Allow(); static Verdict Reject(string reason); }`.
  A rule is a **shared class** in the app bundle (no top-level statements), pure, no I/O.
- `IScriptSandbox` gains `Judge(bundle, Signal) → Verdict[]`: compiles the bundle's shared classes in the brain's
  sandbox session and runs every `ILogic<T>` whose `T` matches the signal.
- `AppNeuron.Request` runs `Judge` over the would-be `AppRequested` **before** publishing it. Any rejection publishes
  `AppRejected(string Operation, string Rule, string Reason)` instead, and the request is not a fact. The activity
  feed records it and Ino shows `attention`.
- The Creator's authoring prompt asks for the domain rules first (`rules/*.cs`), then the synapses. The publish gate
  compiles rules like everything else.

## 7. Circles: communication and compute share, inside one cluster

- Module `src/DigitalBrain.Modules/DigitalBrain/Circles/` (`Contracts`, module, tests).
  `ICircle` keyed `{brain}/circles/{name}`: `Invite(brainId)`, `Accept()`, `Leave(brainId)`, `Members()`,
  `Share(appName)`, `Unshare(appName)`, `SetComputeShare(int percent)` (0–25), `State()`.
  `ICircleChat` keyed `{circleKey}/chat`: `Say(text)`, `Read(since)`; participants are member brains, human or model.
- Signals: `CircleChanged(Name, Members[], SharedApps[], ComputeSharePercent)`, `CircleInvited(Name, From)`,
  `CircleSpoke(Name, Speaker, Text, Sequence)`. Delivery to member brains uses the cross-brain path Install already
  uses; the mesh transport is out of scope.
- Compute: `Funding.Circle(circleKey)` on `ICostMeter`; a member's call funded by a circle draws from that circle's
  share of the owner's budget, up to `ComputeSharePercent`. The platform's 25% is fixed and shown, never a setting.
- `features/os/Circle` app: surface with members, invitations, shared apps, chat and the compute-share slider in its
  toolbar. The shell gets a Circles entry on Home.

## Out of scope

Mesh transport, QUIC, machine leases (federation plan). Rive assets for Ino (code-drawn face stays). Human-to-human
chat outside circles. `Synapse<TLogic>` as a type: a rule is a shared class, a synapse stays one `await foreach`.

## Verification

Each item: module tests over real grains, `flutter analyze`/`flutter test` clean, then seen running under Aspire and
driven through `digitalbrain-mcp`: `ClusterChanged` with silos in `neurons_get`, `AppActivity` in traces while the
assistant answers, `/signals` replaying a fresh brain, `files.open` producing a surface, a circle invite accepted
between two brains and `CircleSpoke` arriving at both.
