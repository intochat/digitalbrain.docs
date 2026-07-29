# Architecture: hosting, durability, and testing

This authority owns hosting, durable-state, observability, and proof-tier rationale.

## 7. Hosting and durability

AppHost declares infrastructure explicitly and the silo composes it (see §3).
`AddDigitalBrain(name)` creates one complete durable profile: a brain-scoped Azure Storage resource
supplying Blob-backed neuron journals and Table-backed Orleans clustering and reminders. Aspire run
mode uses Azurite for that resource; deployment points the same profile at real Azure Storage. The
three derived resources have brain-scoped names and journal readiness is attached to the silo. An
`AsClient()` reference necessarily receives clustering discovery, but never reminders, journals,
protection material, or durable-resource waits. No generic durability-provider abstraction is
introduced until a second *complete* journaling, clustering, and reminder profile actually exists —
one profile does not justify an abstraction over profiles.

Any selected AI or MCP-backed module also causes AppHost to declare one brain-scoped secret containing
a Base64-encoded 256-bit durable-state key. Run mode generates a cryptographically random key and
persists it for local durability; Publish mode has no default and requires the secret from the
deployment environment. The key is projected only to silos, never clients, and is shared by every
silo in that brain. It encrypts MAF direct sessions and MCP OAuth tokens with distinct purposes today;
supervised workflow checkpoints are a designed purpose on the same package (§8). Provider modules do
not create their own keys or process-local key rings.

The production AppHost also exposes this documentation through Aspire's official JavaScript resource
lifecycle:

```csharp
builder.AddViteApp("website", "../../docs")
    .WithExternalHttpEndpoints();
```

`Aspire.Hosting.JavaScript` owns dependency installation and the VitePress process. The resource is
named `website`, its working directory is `docs`, and Aspire allocates its externally exposed HTTP
endpoint; there is no custom npm installer or fixed port.

Every normal production AppHost build runs the repository `RefreshCodeGraph` target. It initializes
the graph when `.codegraph/codegraph.db` is absent and synchronizes it otherwise, and a command failure
fails the build. Because `aspire start` and `aspire run` perform that AppHost build, the graph served by
the configured project MCP is refreshed through the ordinary application lifecycle rather than a
second checked-in dependency inventory.

### Observability

Synapse journals are the durable causal truth. OpenTelemetry is a diagnostic projection and never the
audit source — traces sample, expire, and get dropped, and an audit trail that does any of those
things is not an audit trail.

Telemetry forms one correlated chain:

```text
Kernel synapse span
  -> MAF workflow and agent spans
     -> model-client and capability spans
```

Spans carry the identity attributes that let a trace be joined back to the journal — receiver,
synapse, and correlation today, with owner, neuron, synapse type, and causation as the ratified target
set. Sensitive content is off by default, and turning it on is a deliberate act. Aspire receives the
OTLP output.

### Testing

`DigitalBrain.Testing` is the one public packable testing product, and it is development-only. Proofs
run at three tiers; there is no parallel fake runtime:

```text
L0  Compiler/shape     DigitalBrain.Tests contracts, packages, and generators
L1  Kernel semantics   real three-silo DigitalBrainFixture + method-scoped TestBrain
L2  AppHost system     assembly-owned DigitalBrainAppHostFixture<TAppHost> + method-scoped RunningAppHost
```

**Proof quality (preference order).** Prefer product types and product constants over test-local
string tables; prefer runtime or project-graph evidence over `File.ReadAllText` / source-grep of
AppHost or `Program.cs`. Source-grep pins are theater when a product constant, compile graph, or
running resource already carries the same fact. Lower quote density is not a win if literals only
moved into helper tables. Do not invent Behavior or calendar-Time product APIs to make a proof
green.

**L1** is the default depth for module semantics and durability. One `DigitalBrainFixture` owns one
real three-silo cluster and permits one active method-scoped `TestBrain` at a time. Tests therefore
serialize within a fixture, while separate test assemblies may run in parallel. Each `TestBrain`
receives an isolated owner namespace, deterministic clock, closed durability faults, typed
committed-journal evidence, and always-on failure artifacts. `TestOwner` is the isolated owner
identity, and `TestNeuron<T>` is its typed neuron handle.

**L2** is reserved for AppHost composition, real resource `Healthy` state, HTTP endpoints, and
bounded cleanup and failure evidence. Product silo restart is not an L2 resource-command path (see
below). An assembly-owned `DigitalBrainAppHostFixture<TAppHost>` creates one method-scoped
`RunningAppHost`. The package-internal lease is the only AppHost serialization owner; test projects
do not add xUnit collections or global parallelization switches. Each test binds each runtime
resource name once and keeps that handle:

```csharp
await using var host = await fixture.StartAsync(cancellationToken);
var silo = host.Resource("silo");
await silo.WaitUntilHealthyAsync(cancellationToken);
using var client = silo.CreateHttpClient();
```

Cleanup remains graph-owned: it uses Aspire resource commands and terminal observations, and never enumerates or kills processes by name. L1 remains the default for neuron and module semantics. Product silo restart is proven through L1 `TestNeuron.RestartHostAsync` (in-process cluster), not through AppHost resource-restart commands.

Substitutes stop at the closed external edges: scripted `IChatClient` via
`DigitalBrainTestBuilder.ConfigureChatClient` (module smoke), scripted southbound MCP sessions via
internal `ConfigureMcpSessionFactory` / `IMcpClientSessionFactory` (Integrations L1), and the
framework-owned `TimeProvider` already registered on every L1 test. Neurons, journals, filters, and
module logic stay real. The current testing framework adds no Behavior program interface or fixture
hierarchy because the rail is unbuilt. In the approved runtime model, the owner-scoped
`BehaviorNeuron` is the Neuron and its single-file program is not (see §5).


