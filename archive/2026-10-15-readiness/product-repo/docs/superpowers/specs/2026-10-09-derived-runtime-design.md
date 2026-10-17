# Derived runtime: five sources of complexity, removed

**Status:** approved in chat 2026-10-09. Refactoring; no new concept. Each section names the
complexity observed in the 2026-10-09 live run, the principle it violates, and the one change that
removes it. Order of implementation: 2, 3, 1, 4, 5.

## 1. Installed first-party apps are reconciled, never manually updated

**Observed.** After every code change the owner's brain kept running the previous assistant and
calculator until `POST /brains/{id}/apps/{name}/update` was posted by hand. Everything else in the
OS is derived state rebuilt from code; installed apps were the one copy that drifted.

**Change.** `ShippedAppReconciler` (Apps module, runs after the shipped catalog is published at
startup and on every brain activation through the existing creation handler): for every app in the
brain whose `Origin.Source` is `Shipped` and whose snapshot is not `Edited`, compare
`Origin.Version` to the catalog's version with `AppVersions.Compare`; when the catalog is newer,
call the same path `AppInstaller.Update` uses (`Replace` then `RecordOrigin`). Edited copies are
untouched, as today. The reconciler publishes `AppReconciled(name, from, to)` so the shell and
traces show it. The update endpoint stays for third-party origins.

**Facts.** A brain with an older unedited shipped app is on the catalog version after startup; an
edited app keeps its program; a third-party origin is not touched; the signal names the versions.

## 2. Inference is neuron state, and model readiness is resource health

**Observed.** `IRouter.Route` and `ISystemOne.Ask` are synchronous grain calls that block on an
HTTP inference under the 30 s Orleans response timeout. The local model's first call cold-starts
for 58 s, so the first route after boot always fails, and the assistant's synapse blocks on it.

**Change, readiness.** The `systemone` adapter's `/health` performs one minimal inference
(`model` from `SYSTEMONE_MODEL`, a one-option choice) and answers 503 until it succeeds, so Aspire
marks the resource healthy only when the model is warm, and the OS waits on that health as it does
today. No timeout is raised anywhere.

**Change, routes as state.** `IRouter` gains the one-way shape every slow operation in the OS
has: `Task Ask(RouteRequest request)` where `RouteRequest(Guid Id, string State, string[]? Allowed)`
records the request in the router's state with status `Routing`, and the router answers by writing
`RouteResult` into its state for that id and publishing `Routed(Id, Contract, Method, Confidence)`.
`Route`, `Dispatch` and `Achieve` stay for callers that can wait (the MCP tool, tests) and are
implemented over the same path. `SystemOneNeuron.Ask` keeps its contract but the HTTP call runs
outside the grain's turn (`[OneWay]` worker through `this.AsReference<ISystemOneWork>()`, result
delivered as `SystemOneDecided`), so a slow model never holds a grain activation.

**Change, the assistant.** `send.cs` posts `Ask` and ends. A new synapse `routed.cs` reacts to
`Routed` for the assistant's own request ids: above the gate and direct, it dispatches; otherwise it
starts the agent turn with the hint. The request id is the `AppRequested.RequestId`, so the two
synapses share no state but the router's.

**Facts.** A route whose model takes longer than the Orleans timeout still completes and publishes
`Routed`; the assistant answers a direct route with no agent run; the adapter health is 503 before
the first successful inference and 200 after.

## 3. Jev routes over a routable catalog, apps first

**Observed.** The local model chose `IGpt54.GenerateStreaming` at 0.9 for "open calculator": the
catalog it saw had every model marker and infrastructure contract.

**Change.** `[Routable]` is a contract attribute in the vocabulary ring; `ContractCatalog` exposes
`Routable()` and the router routes over that only. Model markers, `ILLM`, `ISystemOne`, `IAgent`,
runtime, identity and integration contracts are not routable. Routing is two-tier: the first
System One question is over the brain's installed apps' operations (`"{app}.{operation}"` with the
manifest descriptions as criteria, read through `IAppIndex`), with a last option `"something else"`;
only when that wins does the second tier ask over routable contracts. `RouteResult` gains
`App` and `Operation` so an app route carries no contract fill step: `Dispatch` of an app route is
`IApp.Request(operation, input)` with the state as input, no language model. `IsDirect` moves out of
the assistant into `RouteResult.IsDirect` (an app route, or a routable `Read`/`List`).

**Facts.** "open calculator" with a scripted System One that answers the app tier yields an app
route with no model call at all; model markers never appear in the routable catalog; a
non-routable contract cannot be routed even when asked for by name in `allowed`.

## 4. A request reaches a synapse that subscribes later

**Observed.** `IApp.Request` publishes and forgets; a request posted before the synapse subscribed
is lost, so facts and the shell wait for subscriptions first.

**Change.** A neuron may retain its recent signals: `IRetainsSignals` in the vocabulary ring with
`Task<RetainedSignal[]> Retained(string signal, long since)`; `AppNeuron` implements it for
`AppRequested` with a bounded array of the last 64 requests (concrete array in state). When the brain
runtime's `Subscribed` creates a subscription on a neuron that retains the signal, it seeds the
subscription's `Pending` with the retained signals newer than the subscription's own watermark
(zero for a new subscription), so delivery stays at-least-once and dedup stays the synapse's job as
today. Nothing else changes: the E2E waits on subscription become unnecessary and are removed.

**Facts.** A request posted before the synapse subscribes is delivered once the synapse subscribes;
a re-subscribing synapse does not receive requests it acknowledged; the 65th request evicts the
oldest and counts it dropped.

## 5. One identity scheme for every run

**Observed.** Fixed ports and shared build outputs mean one host at a time per machine, and three
sessions took turns.

**Change.** The Launcher's identity scheme (port block, service id, cluster id, storage container
from a name) is the single source: `DigitalBrainHostingOptions.Named` already reads it from
configuration; the AppHost reads a profile name (`DigitalBrain:Profile`, default `dev`) and derives
ports and identity from it, and `aspire run --profile x` (via the AppHost's launch profiles) runs a
second host beside the first. E2E hosts use the same derivation with a random profile. This section
is aligned with the brain-profiles design the Photocraft session is writing; whichever lands first
owns `DigitalBrainProfiles`, and the other consumes it. No duplicate profile code.

**Facts.** Two AppHosts with different profiles start on one machine; an E2E host never binds 5080.

## Out of scope

Replacing the local System One model, OpenCode tooling, the self-improving loop's own promotion
policy.
