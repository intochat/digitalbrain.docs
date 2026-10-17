# gRPC neuron channel: the shell subscribes instead of polling — design

**Status:** proposed 2026-10-10, pending approval. Builds on
`2026-10-10-mvp-ino-circles-logic-design.md` ("the shell never polls") and the existing
`GET /brains/{id}/live` signal feed.

## What was measured (baseline, 2026-10-10, local Aspire, YARP front → silo)

| Path | Cost | Source |
|---|---|---|
| One HTTP round trip through the front (`/brains/{id}`, `/apps`, `/apps/node`) | 4–7 ms warm, 20–27 ms first call | `curl` ×15, traces |
| `/brains/{id}/infrastructure` (strip poll every 5 s) | 360–700 ms, all inside `ICluster/Silos` (Aspire CLI) | traces |
| `/brains/{id}/connections` (polled every 5 s with the strip) | 2–40 ms | traces |
| App request `POST /apps/{name}/request` | 14–42 ms to `202` | `curl` |
| Every rendered node (`NeuronView`) | one `GET /apps/node` every **2 s**, recursively per child | `neuron_view.dart:100`, `:217` |
| Workspace change | SSE carries only `{revision}`; the shell then `GET`s the whole snapshot | `WorkspaceEndpoints.cs:42`, `workspace_remote_controller.dart` |

Conclusion: HTTP is not the slow part. A round trip is single-digit milliseconds. What makes the
UI feel slow is **when** the shell asks: a node changed by a synapse is seen up to 2 s later, and a
window with N nodes costs N requests every 2 s whether or not anything changed. The infrastructure
strip is the one genuinely slow call, and the MVP spec already turns it into a signal.

Not measured: synapse reaction time (the calculator's `open` produced no surface on the running
instance; its sandbox reported connection errors). That is a sandbox readiness problem, not transport.

## The fundamental problem

Inside the OS there are two operations: call a neuron contract, and subscribe to a signal from a
source. The shell does neither directly. It has ~40 hand-written routes, each with a hand-mirrored
Dart model, and it polls where it should subscribe. Every contract crosses the boundary three times
by hand (C# record, route, Dart `fromJson`), in two styles (REST pull, SSE push), and nothing checks
the Dart side against the C# side.

**Rule (from the MVP spec, now applied to every node):** every live thing on screen is a signal the
shell subscribes to. A node's state is the retained last signal of its source; a change is the next
signal. No timers.

## Design: one generic channel, two RPCs, the C# contracts as the only schema

### 1. The service (Platform ring, hosted by the kernel, not a module)

One proto, fixed, never grows a type per contract:

```proto
service Neurons {
  rpc Call  (CallRequest)  returns (CallReply);        // unary
  rpc Watch (WatchRequest) returns (stream SignalEnvelope); // server streaming
}
message CallRequest  { string contract = 1; string key = 2; string method = 3; bytes arguments = 4; } // JSON array
message CallReply    { bytes result = 1; string error = 2; }                                           // JSON
message WatchRequest { repeated Source sources = 1; }
message Source       { string key = 1; repeated string types = 2; }   // signal type names, as /live today
message SignalEnvelope { string source = 1; string type = 2; string publisher = 3; int64 sequence = 4; bytes payload = 5; }
```

- `Call` is `NeuronSurface.Call` (what `digitalbrain-mcp`'s `neurons_call` already runs): the stamped
  caller, the brain from the route, each neuron's own access check. Nothing new is authorised.
- `Watch` is `LiveSignalEndpoints.Stream` generalised: for each source, the retained last signal of
  each type first, then live ones through `brain.On<T>(source, onSubscribed)`. One stream per
  screen, many sources, added or removed by opening a new `Watch` (grpc-web has no client streaming,
  so a subscription set is immutable per call; a screen opens one call per window).
- Mounted under `/brains/{brainId}/` so `BrainRoutes` membership and id validation apply once, as for
  HTTP. gRPC-Web (`Grpc.AspNetCore.Web`) is enabled because the shell targets web and the YARP front
  speaks HTTP/1.1 to the silos; native gRPC stays available for desktop and mobile on the same service.
- Framework gains `IGrpcModule { void Configure(IEndpointRouteBuilder) }` beside `IHttpModule` so a
  module can map a gRPC service of its own later. Nothing in this change needs it beyond the kernel's
  `Neurons` service; it exists so the seam is symmetric with HTTP.

### 2. The schema is the C# contracts

`arguments`, `result` and `payload` are JSON with the same `JsonSerializerDefaults.Web` the HTTP
surface uses today. The Dart side gets a generated mirror: a `dart run` tool in
`src/DigitalBrain.Modules/Google/Flutter/app/core/tool/` reads the Contracts assemblies (the same
reflection `NeuronTypeSearch` uses, exposed as `GET /contracts/schema` on the kernel) and emits
`lib/src/generated/contracts.dart`: one Dart record per signal and per contract method result, plus
`watch<T>()` / `call()` wrappers. The generated file is checked in; `flutter analyze` fails when the
C# contracts move and the file is stale (CI runs the generator and diffs).

This is phase 2. Phase 1 (the comparison) uses the generic channel with `Map<String, dynamic>`
payloads, exactly as `NeuronView` consumes today.

### 3. Shell changes (phase 1)

- `DigitalBrainUiClient` gains `NeuronChannel` (`call`, `watch`) built on `package:grpc`
  (`GrpcWebClientChannel` on web, `ClientChannel` elsewhere), reusing the client's base URI and auth
  cookie/header.
- `NeuronView` loses its timer. It takes a `watch(kind, name)` stream: the first envelope is the
  retained state (what `load` returned), later envelopes are changes. `load` stays for callers that
  have no channel (tests, gallery).
- `WorkspaceRemoteController` subscribes to `WorkspaceChanged` with its payload instead of the
  revision ping + refetch. `WorkspaceChanged` carries the snapshot it already has on the server.
- The HTTP routes stay. Nothing is deleted in phase 1; the comparison runs both.

### 4. The comparison

Same screen (calculator window, N nodes), same instance, both paths instrumented:

| Metric | How |
|---|---|
| Requests per minute per open window | Aspire traces, count of `GET /apps/node` vs one `Neurons/Watch` span |
| Change-to-render latency | the signal carries `Published` (already stamped); the shell logs `now - Published` when it renders; p50/p95 over 50 button presses |
| Bytes per change | response size of the refetch vs envelope size |
| First paint of a window | time from `open` to all nodes rendered |

Expected result, stated up front so the comparison is honest: poll → subscribe is the large win
(2 s worst case → one round trip). gRPC-Web vs SSE over the same HTTP/1.1 front is a small win
(framing, one connection, binary-safe payload) and the numbers will say how small. If the delta
between SSE `/live` and gRPC-Web is within noise, the channel still earns its place by being the one
transport with a schema and a generated client; that decision is taken on the numbers, not before.

### 4a. Status of the comparison (2026-10-10)

Phase 1 is implemented and merged on `os-runtime` (Platform `Neurons` service, Dart `NeuronChannel`,
watched `NeuronView`, shell wiring; facts green across Platform, core, ui and shell). **The live
numbers are pending**: the measurement needs the machine's fixed container ports, which another
session's multi-hour acceptance run holds. Run it from Task 8 of the plan when the machine is free
and fill the table above; until then the before/after is the baseline table at the top of this
document and the design argument, not a measured delta.

### 5. What does not change

Signals, neurons, behaviors, connectors. The shell remains the human's connector; it now speaks the
system's two operations directly. No new concept: `Call` and `Watch` are `neurons_call` and
`brain.On<T>`.

## Out of scope

Replacing the HTTP routes (after the comparison, separately). Client-streaming or bidirectional
RPCs (grpc-web cannot). The Dart contract generator (phase 2, its own plan). QUIC / mesh transport
(federation plan).

## Verification

- Module tests over real grains: `Neurons/Call` runs a contract method with the stamped caller;
  `Neurons/Watch` yields the retained signal first, then a published one; a non-member brain is
  refused at the route.
- `flutter analyze` / `flutter test`: `NeuronView` renders from a stream, no timer; the controller
  reconciles from a `WorkspaceChanged` payload.
- Seen running: Aspire Healthy, the shell's calculator window rendered through `Watch`; traces show
  one `Neurons/Watch` span per window and zero `GET /apps/node` while it is open; the comparison
  table filled from `list_traces`.
