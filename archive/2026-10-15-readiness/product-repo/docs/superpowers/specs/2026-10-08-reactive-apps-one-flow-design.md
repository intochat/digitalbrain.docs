# Reactive apps, one flow

Date: 2026-10-08. Status: approved in conversation, ready for a plan.

## Problem

One fact, "this app's program with these settings should be running in this brain", is stored in
six places (app bundle, deploy ledgers in `AppState`, one `CSharpFileState` per synapse, the
runtime's `BehaviorAssignment`, the sandbox's loaded set, and the invocation list with in-memory
waiters). Every hop between them is an imperative delta that can land half-way, so each layer grew
its own repair: tracked keys, stored deploy errors, a dead `ProgramGeneration`, per-behavior
failure counts and disarming, reload timers, a 5-minute `Await`, a pending-invocation re-read in
every script. A plain request ("open the assistant") rides a durable pub/sub pipeline into a
long-lived process and, when any layer is stale, the caller waits forever. Wiping storage "fixes"
it only because it resets every copy at once.

## Vision

A brain is neurons exchanging signals. A behavior is **one reaction**: a synapse file that is one
`await foreach` over one `brain.On<T>(source)`, acting through neurons. The sandbox is a process
holding all of a brain's compiled reactions. Nothing is request/response: the shell, the
assistant's agent and other apps all act by publishing signals and watching neurons.

The script-facing contract (`IDigitalBrain`: `Get`, `On`, `Self`; `DigitalBrainClient.ConnectAsync`)
does not change.

```csharp
// assistant/synapses/open.cs
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(brain.Setting("App")!);
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "open") { continue; }
    await Ui.Compose(brain, app);                                                   // lib/Ui.cs, same assembly
    if (request.Input != "docked")
    { await brain.Get<IWorkspace>(brain.Setting("Brain")!).EnsureOpenAsync("assistant", "Assistant", Ui.Window(app), brain.Stopping); }
}

// assistant/synapses/new.cs
await foreach (var clicked in brain.On<ButtonClicked>(brain.Get<IButton>(app.Key + "/new"), brain.Stopping))
{ await brain.Get<IText>(app.Key + "/conversation").Set("c-" + clicked.RequestId.ToString("N")); }
```

Two clicks are two signals in the subscription buffer, handled one after the other, each once.

## What stays (the architecture)

- Source neurons publish on `Save`; `BrainRuntimeNeuron` is the Orleans observer (`Watch`/`Unwatch`
  with lease renewal), one per brain.
- `Subscription(Pending, Delivered, Dropped)` with watermark and acknowledgement: the durability.
- Sandbox session over SSE and the HTTP runtime edge with a session token; heartbeat, silence
  limit, reconcile reminder, token rotation: the brain is the only thing that can relaunch a dead
  process.
- `NeuronProxy` calls from scripts through the edge, kernel-stamped as the app.
- `CSharpFileNeuron` for standalone behaviors a person writes outside an app.
- The loop form of `On<T>` and the `onSubscribed` recovery hook.

## What changes

### 1. Operations are one signal the app publishes about itself

`IApp` loses `Invoke`, `Respond`, `Await`, `Pending`, `ReadInvocation`, `ReadInvocations`. It gains:

```csharp
// Publishes AppRequested. The caller never waits for a script: it reads the neurons the script writes.
Task Request(string operation, string input);
```

```csharp
// Apps.Contracts/Signals — replaces AppInvoked and AppInvocationCompleted
public sealed record AppRequested(string Operation, string Input, Guid RequestId) : Signal;
```

`Request` validates the operation against the manifest (as `Invoke` does), bounds the input at
64 KiB, stamps a fresh `RequestId`, and `Save`s with the signal. No invocation list, no waiters,
no cap. `AppState.Invocations` and `AppCalls` (`Ask`, `AwaitResponse`) are removed; `AppInvocations`
(the `Invocations(...)` helper) is removed.

Surface edges:

- HTTP: `POST /brains/{id}/apps/{name}/request {operation, input}` answers 202 with `{requestId}`.
  `POST .../ask` is removed. `AgentPrompts` and the Creator teach `Request`.
- Shell: opening an app calls `Request("open", docked ? "docked" : "")` and renders the app's
  surface neuron `{brain}/apps/{name}/surface`, which every shipped app already composes. The
  window for the undocked case is opened by the script through `IWorkspace`, as today.
- Agents and other apps: `brain.Get<IApp>(key).Request(op, input)`, then read the neuron the app's
  spec names. There is no reply signal; a result is neuron state.
- An app that needs to re-trigger itself (`refresh` in DataVisualizer, `refresh-connections` in
  Settings) calls `app.Request(...)` and the reacting synapse handles it; nothing awaits it.

### 2. One program per app, deployed by the brain runtime

A Roslyn compilation has one entry point, so a program is one assembly per `synapses/*.cs`, each
compiled together with every `lib/*.cs` (shared classes), and the program's hash is the hash of its
synapse hashes. The compiler is the existing `CSharpScriptCheck`, extended to share `lib/`.

The CSharp module exposes one public neuron contract for programs, so the Apps module never sees
the compiler or the assembly store:

```csharp
// CSharp.Contracts
[Alias("microsoft.csharp.programs"), DefaultGrainType("microsoft.csharp.runtime")]
public interface IBrainPrograms : IGrainWithStringKey
{
    // Compiles, stores and runs: a source that does not compile throws and assigns nothing.
    Task<ProgramView> Assign(string owner, Dictionary<string, string> sources, Dictionary<string, string> settings);
    Task Retire(string owner);
    Task<ProgramView?> Describe(string owner);
}
public sealed record ProgramView(string Owner, string Hash, IReadOnlyList<BehaviorView> Behaviors);
```

`AppNeuron` deploys through a one-method seam in Apps.Contracts, `IAppRuntime`
(`Deploy(appKey, sources, configuration)`, `Retire(appKey)`), implemented in the Apps module by
`CSharpAppRuntime` calling `IBrainPrograms` for the app's brain:

```csharp
private Task Deploy() => runtime is null ? Task.CompletedTask
    : runtime.Deploy(this.GetPrimaryKeyString(), Sources(), Configuration(), CancellationToken.None);
```

Every mutation that touches a `.cs` file or a setting ends with `await Deploy();` (`WriteBehavior`,
`CompleteBuild`, `Configure`, `Rollback`, `Import`, `Replace`). `Delete` calls `Retire`. A write
whose program does not compile fails the write with the compiler's message; nothing is stored "red".

Removed: `IDeployableRuntime`, `RuntimeDeployment`, `AppProgramKey`, `ICSharpAppBinding` and
`CSharpAppBindingGuard`, `BindApp`/`RequireBoundAccess`/`AppId`/`AppBrain` on `CSharpFileNeuron`;
from `AppState`: `StorageFiles`, `DeployedFiles`, `BehaviorErrors`, `ProgramGeneration`,
`Invocations`. `AppState` gains `Principal` (the caller context captured on `Create`/`Import`, the
identity the program acts as). `IAppStorageHook.OnRetired(brainId, appKey, ct)` loses the storage
keys: storage is per app, not per file.

### 3. The runtime grain assigns programs, not files

`BehaviorAssignment` becomes:

```csharp
// Owner is the app key (or a standalone file key); Principal is who the program acts as.
internal sealed record ProgramAssignment(string Owner, string Hash, Dictionary<string, string> Settings,
    CallerContext? Principal, BehaviorAssembly[] Behaviors);
internal sealed record BehaviorAssembly(string Path, string Hash);   // behavior id = Owner + "/" + Path
```

`Assign(owner, …)` replaces every behavior of that owner at once; `Retire(owner)` removes them. A
behavior id is `{owner}/{path}`, stable across edits, so an edited synapse keeps its subscriptions
and their buffered signals (today's Swap semantics). Subscriptions of a path the new program lacks
are dropped. `Identity(session, behavior)` finds the program whose owner prefixes the behavior id
and answers `(Principal, Owner)`; the edge stamps calls as app `Owner`.

Removed: per-behavior `Status`, `Failures`, `LastFailure`, `ExitCode` from state; `ReloadLater`,
`MaximumFailures`, disarming. `Reported` keeps the sandbox's last status per behavior in memory
only, for `Describe`. The contracts-fingerprint refusal on `Connected` stays.

### 4. The sandbox is unchanged on the wire

`AssignmentEvent`, `RetireEvent`, `ReadyEvent` and the batches keep their shape: the runtime sends
one `AssignmentEvent` per synapse (behavior id `{owner}/{path}`) and one `RetireEvent` per removed
synapse. The only sandbox change: a behavior that exits with an error is restarted by the sandbox
itself with exponential backoff (1 s, 2 s, 4 s … capped at 60 s) for as long as it stays assigned.
Nothing is disarmed.

### 5. Shipped apps

Every shipped app is rewritten to the one-reaction-per-file form: `AppRequested` loops instead of
`Invocations`/`Pending`/`Respond`; `WhenAny`-joined loops split into files; shared code moves to
`lib/`. Apps: `os/assistant`, `os/datavisualizer`, `os/settings`, `intochat/customerresearcher`,
`intochat/wordcount`. `CustomerResearcher.activity.cs`, which reads `ReadInvocations()` to project
history, keeps its own history in a neuron it owns.

## Reliability, by case

- Click while the sandbox is down: buffered in the subscription, delivered on reconnect, handled once.
- Write that does not compile: the write fails with the compiler's message.
- Sandbox dies: heartbeat silence, reminder relaunch, `Assignments` resends the programs, synapses
  re-subscribe, `Subscribed` pushes what waited.
- Two mirrors remain, both legitimate: the app's bundle (truth) and the runtime's `owner → hash`
  (what to run), kept equal by one idempotent `Assign` on every bundle change and resent on every
  reconnect.

## Not in scope

Cross-brain subscription scopes, the renderable palette, run-token tightening (open fronts).
Renaming `IKernel` to `IBrain`. The loop-form `On<T>` API stays as is.

## Verification

Unit: Apps and CSharp module suites rewritten for `Request`/`AppRequested`, program assignment and
the sandbox's program runs. E2E: `DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts` drives a shipped
app through `Request` and reads the surface neuron. Live: `aspire run`, open the assistant through
the shell, click "New conversation" twice, see two `AppRequested`-free `ButtonClicked` reactions in
traces and the transcript cleared each time; write a non-compiling synapse through the Creator and
see the write refused.
