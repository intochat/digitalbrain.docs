# Brain runtime: one sandbox session per brain

Date: 2026-10-07. Status: design, approved in conversation section by section.

## Problem

The unit of execution is a process per script per run. `SandboxRuns` writes `app.cs` and a
`Directory.Build.props` referencing the `DigitalBrain.Client` project and runs `dotnet run` for
every launch. One behavior costs an MSBuild restore and compile and hundreds of MB; a thousand
behaviors is a thousand compiles and a thousand processes. Everything heavy in the module
compensates for that choice:

- `CSharpFileNeuron` keeps a one-minute Orleans reminder, a run record, failure counts and three
  run modes per file, and inspects its run over HTTP every tick.
- Every `brain.On<T>` opens its own server-sent events stream with a doorbell and a five-second
  sweep, so a brain with a thousand behaviors holds a thousand connections into the OS.
- Two runners (`AspireSandboxRunner` polling the Aspire bridge for up to four minutes inside a
  grain call, `SessionPoolRunner` against Azure Container Apps), two Dockerfiles, two compilers
  (Roslyn in the silo for `Check`, `dotnet run` in the sandbox for the real thing).
- Production keys a session by principal, idles it out after five minutes without runs, yet a
  subscribed script counts as running, so one behavior holds a Hyper-V session forever and the
  pool caps at twenty sessions. `Dockerfile.production` copies only `src/DigitalBrain.Modules`
  but builds `src/DigitalBrain.Client`; no CI job builds it.
- Startup is chained to all of this: OS readiness waits on the `os-defaults` health check, which
  waits on every shipped app publishing in one sequential loop, publishing starts behaviors,
  behaviors wait on a `WithExplicitStart` sandbox container that Aspire rebuilds (new tag, 1.2 GB
  image) on every start, while the silo probes its health every few seconds for four minutes.
  A fresh `aspire run` is healthy after about 4.5 minutes and E2E harnesses time out before that.

Nothing reacts to sign-in; whether a user's behaviors are alive is a per-file accident.

## Decisions

1. **Unit of execution: one host process per brain, holding compiled behaviors as loaded
   assemblies.** Behaviors within a brain are mutually trusted; the security boundary is the
   per-brain session (a Hyper-V session in production). Each behavior runs as its own task in a
   collectible `AssemblyLoadContext` for unloading and crash containment, not for security.
2. **Sessions are per brain, not per principal.** Every scope, registry and token is per brain; a
   user with two brains gets two sessions.
3. **The sandbox host is an HTTP edge client, never an Orleans client.** An Orleans client joins
   the cluster, reaches every grain and has no per-brain authority. `DigitalBrain.Client.Orleans`
   stays for trusted first-party processes (`digitalbrain-mcp`).
4. **The OS silo compiles; the sandbox never compiles.** `CSharpScriptCheck` becomes a compiler
   that emits; assemblies are stored by content hash in blob storage. The sandbox image is a
   runtime image with no SDK.
5. **Readiness never depends on the sandbox.** Publishing a bundle compiles it in-process;
   starting its behaviors is asynchronous work of the brain runtime neuron.
6. **The sandbox stays an Integration** the deployment provisions (pool endpoint, token key).
   The `csharp` connector declaration remains as the catalog entry behind the behavior neuron.
7. **No state compatibility.** The per-file grain, both runners, the Aspire bridge dependency,
   `CSharpDirectives`, `SourceRoot`, run-token claims and both Dockerfiles are deleted, not
   migrated.

## Components

### Compiler (silo)

`CSharpScriptCheck.Compile(files)` returns diagnostics and, when clean, one emitted assembly
and symbols per file. It is the single compiler: `AppNeuron.RequireCompiles` (publish gate) and
the Creator's check tool call it. `IScriptSandbox.Check` is renamed to `Compile` and returns the
hashes alongside diagnostics. References are the host's loaded assemblies, as today.
`#:project` directives are gone; a behavior is plain C# with usings. The implicit global usings
stay (`System`, collections, `System.Linq`, threading, `DigitalBrain`, `DigitalBrain.Client`).

### Assembly store (silo)

`IBehaviorAssemblies` with `Put(bytes) -> hash` and `ReadUrl(hash, ttl)`. Backed by the blob
storage the OS already uses (Azurite locally, Azure Storage in production), container
`behaviors`, blob name = SHA-256 of the bytes. Content addressing means an app installed in a
thousand brains compiles once per distinct source. The read URL is a short-lived SAS the brain
hands the host inside an assignment.

### Behavior neuron (silo)

`ICSharpFile` shrinks to a record: `Program`, `AssemblyHash`, `Settings`, app binding
(`AppId`, `AppBrain`), last reported `Status`, `ExitCode`, `Failures`. Operations: `Write`,
`Configure`, `Start`, `Swap`, `Stop`, `Delete`, `Inspect`, `ReadLogs`. `Start` and `Swap`
compile, store, then hand the behavior to the brain runtime; they return as soon as the desired
set is saved. No reminder, no watch, no run record, no `ICSharpFileEdge`.

### Brain runtime neuron (silo)

`IBrainRuntime`, keyed `{brainScope}/runtime`, one per brain, non-reentrant with a one-way
self-reference for signal arrivals. State:

```
Behaviors: BehaviorAssignment[]   // id, assembly hash, settings, generation
Subscriptions: Subscription[]      // behavior id, source neuron, signal, Pending[], Delivered, Dropped
Session: SessionRecord?            // id, token id, contracts fingerprint, last heartbeat
```

Rules, all decided in one `Reconcile`:

- **Session wanted** while `Behaviors` is non-empty. `Assign`, `Swap`, `Retire` edit the set and
  reconcile. Reconcile ensures the session exists through the runner and pushes the diff of
  assignments down the stream.
- **Sign-in** calls `Touch` on the brain's runtime through the brain-scoped group. Empty set:
  nothing. Otherwise it is an ensure, warming the session before the first window opens.
- **Keep-alive** is one reminder per brain, every minute while the session is wanted, checking
  the session through the pool and relaunching a gone one. The host heartbeats on the stream;
  the reminder is the backstop, not the detector.
- **Watching** is one observer registration per distinct source across all behaviors, with
  lease renewal on a grain timer, rebuilt on activation. An arriving signal is appended to every
  matching subscription's `Pending` (cap `MaximumPending`, oldest dropped and counted) and
  pushed down the stream.
- **Failures** are per behavior: the host reports exit and exception; after `MaximumFailures`
  that behavior is disarmed and the rest keep running.
- **Session end**: when the set empties, the runtime tells the session to stop and clears the
  record. No idle timer in the host.

### Session runner (silo)

One class, `SessionRunner`, replaces `ICSharpRunner` and both implementations. It knows a base
address and an auth callback:

| Environment | Base address | Auth |
|---|---|---|
| local | the `csharp-sandbox` container endpoint Aspire injects | none |
| Azure | session pool management endpoint, `identifier=b-<sha256(brainId)[..32]>` | `DefaultAzureCredential`, `https://dynamicsessions.io/.default` |

Operations: `Ensure(brain, token, edgeUrl)`, `Exists(brain)`, `Stop(brain)`. `Ensure` posts
`/sessions/{brain}` with the edge URL and session token; the host connects back. No health
polling in grain calls: a session that is not up is reported `Starting` and the reminder retries.

### Session token (silo)

HMAC-SHA256 with the `csharp` Integration's `RunTokenKey`, claims `{Brain, Session, Expires}`,
one-hour lifetime, rotated by the brain over the stream before expiry. Development keeps the
process-local key with its warning.

### Edge (silo, under `BrainRoutes.Group`)

| Direction | Route | Carries |
|---|---|---|
| host → brain | `POST runtime/v1/invoke` | contract, key, method, arguments, behavior id |
| host → brain | `POST runtime/v1/report` | subscribe / acknowledge / behavior status / heartbeat / contracts fingerprint |
| brain → host | `GET runtime/v1/stream` | assignments, token rotation, signal batches (subscription id, signals, watermark) |

Invoke is stamped as today: the owner's `CallerContext` re-stamped `CallerKind.App` behind the
app proxy, `AppId` resolved from the behavior's binding. The behavior id reaches Compute so
limits apply per behavior. Only neuron contracts from the `ContractCatalog` are callable and
`[PlatformOnly]` is refused, as now. A subscribe is registered before the first batch is sent
so a refusal surfaces immediately. An unacknowledged batch is resent on reconnect; delivery is
at-least-once with the watermark as the dedup key, as CLAUDE.md promises. The host refuses a
contracts fingerprint that differs from the silo's, loudly, in the session record.

### Sandbox host (image `csharp-sandbox`)

A slim ASP.NET process serving `POST /sessions/{brain}` (local: many sessions per process;
Azure: one, the pool routes by identifier) and `/health`. Per session it holds one
`SessionConnection`: the stream reader, an `HttpClient` for invoke and report, the token. For
each assignment it downloads the assembly by hash into a content-addressed cache, loads it in a
collectible `AssemblyLoadContext`, and runs its entry point on a task with a `brain.Stopping`
token. `DigitalBrainClient.ConnectAsync(args)` inside a behavior resolves, through an
`AsyncLocal` the host sets around the entry point, to that session's connection with the
behavior's settings; `brain.Get<T>` and `brain.On<T>` keep their signatures and semantics.
`On<T>` registers a subscription over report and reads batches from the stream, acknowledging
after the enumerator consumed a batch. Logs are captured per behavior (ring buffer, `LogLines`)
and served to the brain on request. Swap unloads one behavior's context and loads the new hash
without touching the others. The image is built from the same build as the OS image and bakes
`DigitalBrain`, `DigitalBrain.Client` and every `*.Contracts` assembly; it reports their
fingerprint on connect.

## Hosting

**Local.** `CSharpModuleHosting` declares `csharp-sandbox` as an always-on container from one
Dockerfile, no explicit start, no repository mount, no NuGet volume, no `IAspire` dependency.
The silo receives the container endpoint and its own edge URL (rewritten to
`host.docker.internal`) as the module's deployment settings. The image is built once per
`aspire run` from the repository's build output, so contracts match by construction.

**Azure.** `CSharpDeployment` keeps the environment, subnet and HTTPS-only egress and the
session pool with `ContainerType = CustomContainer`. Changes: identifier per brain, no
`Sandbox__IdleShutdown`, `MaxConcurrentSessions` sized as capacity, `ReadySessionInstances`
kept for warm starts. A CI job builds and pushes the sandbox image with the OS image's tag and
fixes the OS Dockerfile path in `deploy.yml`.

## Startup and readiness

- `ShippedAppPublisher` publishes bundles; `Publish` compiles in-process and records assignments.
  It no longer waits on a running sandbox. The loop stays sequential (bundles are few) but each
  bundle's failure is its own log line, as today.
- `os-defaults` readiness means "default apps are published", which is now milliseconds after
  storage is healthy.
- The brain runtime neurons of the publisher brains start their sessions after readiness, as
  ordinary reconcile work.
- E2E harnesses keep their current budget and no timeout is raised.

## Deleted

`CSharpFileNeuron` as supervisor, `RunRecord`, `ICSharpFileEdge`, `ICSharpFileArrivals`,
`CSharpFileActivation`, `ICSharpRunner`, `AspireSandboxRunner`, `SessionPoolRunner`,
`SandboxRunsApi`, `SandboxWire` and `SandboxContracts` (one DTO set in the host, shared by
reference through `DigitalBrain.Client`), `CSharpDirectives`, `CSharpOptions.SourceRoot` and
`AspireApplication`, `CSharpDeploymentSettings.SandboxProbeUrl`, `ScriptRunEnvironment`,
`ScriptEdge` and `ScriptEdgeEndpoints` (replaced by the runtime edge), `DotNetScriptLauncher`,
`SandboxRuns`, `IdleShutdown`, `Dockerfile` and `Dockerfile.production` (one Dockerfile), the
`csharp-sandbox` dependency on `DigitalBrain.Modules.Microsoft.Aspire`, `#:project` lines in
shipped apps and the Creator prompt, `FakeSandbox` and `FakeAspire` in tests (replaced by an
in-process fake host speaking the runtime edge).

## Testing

- Module tests over real grains: compile and store; assign, swap and retire edit the desired set
  and the session wanted flag; signal arrival appends and pushes; acknowledge trims; failures
  disarm one behavior; sign-in touch ensures a session; fingerprint mismatch refuses.
- A fake sandbox host in tests (`FakeSessionHost`) speaks the three routes in-process so edge
  facts run without Docker.
- Sandbox host unit tests: load, run, unload a compiled behavior; `ConnectAsync` resolves the
  ambient session; stream reconnect redelivers an unacknowledged batch.
- Verification loop: `aspire run` with the sandbox container Running and the OS healthy within
  the normal budget; through `digitalbrain-mcp` deploy an app, read the brain runtime's desired
  set and session record, click a button in the shell, follow one trace from the button signal
  through the stream to the behavior's invoke and back.

## Out of scope

Cross-app subscription scopes, the renderable palette, per-app isolation inside a brain, moving
compilation to its own service, Bicep or azd (deployment stays Pulumi).
