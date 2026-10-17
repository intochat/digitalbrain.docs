# One host, one harness: Orleans as a module and tests that run the product recipe

Ratified 2026-10-10. Supersedes the package and target sections of
`2026-10-09-brain-profiles-and-test-targets-design.md`; the profile mechanism from that spec stays.

## Problem

The test harness is a second, hand-built implementation of the host. The product composes a brain
in `DigitalBrain.OS/Program.cs` through `AddDigitalBrainServer`, `AddDigitalBrainPlatform`,
`AddMachinePartLogWhenConfigured`, `UsePlatformHttp`, `MapDigitalBrainModules` and
`MapDigitalBrainPlatform`. That recipe exists only inside a `WebApplication`, so
`DigitalBrain.Testing.Module` rebuilds the silo from parts on an Orleans `InProcessTestCluster`
and `ModuleHttpEdge` rebuilds the web pipeline in a second DI container bridged by a snapshot of
silo service types and a per-request fallback provider. Every host change is mirrored by hand and
the mirror needs `InternalsVisibleTo` on Platform.

The substrate's external systems (membership table, grain state store, reminder table) are
hand-wired in four places with four mechanisms: the AppHost (`AddDigitalBrain` picks Azurite or
memory and projects bespoke `Orleans__*` environment keys), the server builder
(`UseAzureStorage` flag), the OS (`AddMachinePartLogWhenConfigured`) and the harness (memory
providers plus `SessionGrainStorage`). That is why the recipe has flags and the harness has a copy.

Measured in test code outside `src/Testing`: `SiloServices` reach-through 222 hits in 74 files,
`ConfigureSilo` 98, `CallerContextStamper.Stamp` 93 in 56 files, `AuthorizeCallerAsync` 87,
`IGrainStorage` surgery 48, raw `AddInMemoryCollection` 47. Tests patch DI and forge identity
because the harness gives them no vocabulary for "a fake external system" or "a person with a brain".

## Design

### 1. Orleans' external systems are a module: `orleans`

The silo is the kernel's substrate and is not a module. What Orleans talks to on the outside is
a connector's shape, so it becomes one module under the Microsoft vendor:

```
src/DigitalBrain.Modules/Microsoft/Orleans/
  DigitalBrain.Modules.Microsoft.Orleans.Contracts/   ICluster (membership), ClusterChanged
  DigitalBrain.Modules.Microsoft.Orleans/             OrleansModule, storage providers, cluster neuron
  DigitalBrain.Modules.Microsoft.Orleans.Aspire.Hosting/  OrleansModuleHosting: Azurite resources → integration
  tests/DigitalBrain.Modules.Microsoft.Orleans.Tests/
```

- `OrleansModule : Module<OrleansOptions>`, id `orleans`. Integration schema `orleans` offers
  (never requires) secrets `Clustering`, `GrainState`, `Reminders` (connection strings) and
  setting `GrainStateContainer`. An absent integration means localhost clustering, memory grain
  storage for both `cluster` and `platform` stores and memory reminders. A present one means
  Azure Table clustering and reminders and Azure Blob grain storage with the storage serializer,
  exactly what `ServerHostingExtensions` registers today under `UseAzureStorage`.
- Memory providers read and write a `MemoryStores` object registered as a singleton
  (`ConcurrentDictionary<string, (byte[] State, long ETag)>` per store plus the membership
  table). A host that registers its own `MemoryStores` before the module configures keeps state
  across a host rebuild; that is what a silo restart is in a test.
- Connector `orleans`: neuron `ICluster` keyed `{brainId}/orleans/cluster`, `Read()` returns the
  membership snapshot (silo name, address, status, role, build sha from the running assembly) read
  from `IManagementGrain`; signal `ClusterChanged` on membership change.
- `OrleansModuleHosting` on the AppHost side owns what `AddDigitalBrain` does today for storage:
  Azurite emulator, tables and blobs, persistent lifetime and volume, projected into the
  `orleans` integration through `DigitalBrainConfiguration.IntegrationEnvironmentName`. The
  `Orleans__Clustering__ServiceKey`, `Orleans__Reminders__ServiceKey` and
  `Orleans__GrainStorage__*` environment keys go away. The `DigitalBrainBuilder` keeps
  `ClusterId`, `ServiceId`, `Orleans` resource and `Clustering`/`Reminders`/`GrainState`
  references so clients and the E2E client can still find them, but they are set by the module
  hosting, not by `AddDigitalBrain`.
- The Aspire module keeps roll and restart. Its neuron is renamed `IDeployment` keyed
  `{brainId}/aspire/deployment` with `Restart(sha)`, `Roll(sha)` and `Read()`; its signal is
  `DeploymentChanged`. `SiloView`, `Silos()` and membership reading move to the orleans
  contracts. The Aspire module references the orleans contracts for `ICluster`.
- Platform keeps the part log. `AddMachinePartLog` still replaces the `cluster` grain storage
  when a machine role is configured; it runs after the orleans module's providers, as today.
- Kernel registration keeps wrapping the `cluster` storage through `TryAddKernelRegistration`
  after every module has configured.

### 2. One host recipe, used by the OS and by every test

Two public calls in `DigitalBrain.Aspire.Server` (renamed target namespace `DigitalBrain.Server`
stays out of scope; the project name stays):

```csharp
builder.AddDigitalBrainServer(server => server.AddOperatingSystem());   // host side
app.MapDigitalBrainServer();                                            // web side
```

- `AddDigitalBrainServer` does what it does today minus the `UseAzureStorage` branch, plus
  `AddDigitalBrainPlatform()` and `AddMachinePartLogWhenConfigured()` (moved from the OS into
  the server, since every brain host needs them). `DigitalBrainServerBuilder` loses
  `UseAzureStorage`. `UseOrleansDashboard` stays.
- `MapDigitalBrainServer` does `UsePlatformHttp`, `MapDefaultEndpoints`, `MapDigitalBrainModules`,
  `MapDigitalBrainPlatform` and, when the dashboard was asked for, `MapOrleansDashboard`.
- `Program.cs` becomes those two calls plus `app.Run()`.
- The identity posture and master key stay configuration (`DigitalBrain:MasterKey`,
  `AuthOptions.PostureKey`); nothing in the recipe branches on test versus production.

### 3. One harness: `DigitalBrain.Testing`

One builder, one brain type, three targets. The module tier and the E2E tier differ only in the
target.

```csharp
await using var brain = await TestBrain.Create()
    .WithModule<TimeModule>()                               // composition (in-process target only)
    .WithIntegration(AIModule.Integration, "Endpoint", model.Endpoint)   // typed, any target
    .WithOptions<AppsModule, AppsOptions>(o => o.Features = path)
    .ConfigureServices(s => s.AddSingleton<IScriptSandbox>(fake))        // escape hatch, in-process only
    .StartAsync(ct);

var alice = await brain.PersonAsync("alice", ct);           // registered account + owned brain
using (alice.AsCaller()) { await brain.Get<IApp>(alice.Key("apps/hello")).Read(); }
await alice.Http.PostAsJsonAsync($"/brains/{alice.BrainId}/apps/hello/request", ...);
```

- `ITestBrain : IDigitalBrain, IBrainSubscriptions, IAsyncDisposable` with `Get<T>(string)`,
  `HttpClient`, `PersonAsync`, `Observe<T>`, `RunBehavior`, `DeactivateAsync`, `RestartAsync`,
  `Services` (in-process only; throws on other targets).
- `InProcessTarget`: a real `WebApplication` on `http://127.0.0.1:0` built with
  `AddDigitalBrainServer(server => modules…)` and `MapDigitalBrainServer()`, with the `orleans`
  integration absent and a harness-owned `MemoryStores`. `RestartAsync` stops the app, builds a
  new one over the same `MemoryStores` and swaps the client. No `InProcessTestCluster`, no
  `ModuleHttpEdge`, no `FallbackServiceProvider`, no `InternalsVisibleTo` on Platform.
- `AspireTarget` (package `DigitalBrain.Testing.Aspire`): today's `AspireTestSession` behind the
  same `ITestBrain`; `WithModule` throws (the AppHost owns composition), `WithOptions` becomes the
  existing `ReplaceOptions` projection, `WithIntegration` writes the integration keys into the
  private configuration file.
- `RemoteTarget`: connects to a URL; only HTTP and the gRPC neuron channel, no grain client.
- `Person`: `PersonAsync(name)` registers through `/identity/register` on the brain's HTTP edge,
  keeps a cookie client, and exposes `AsCaller()` which stamps the same `CallerContext` the
  authenticated edge would. It replaces every hand-written stamp, `AuthorizeCallerAsync`,
  `ProvisionOwner` and `IBrain.Create(new Owner(...))` in tests. In the Open posture the default
  person is the synthetic owner.
- Fakes live at the integration boundary. `FakeModelServer` is the pattern: a fake external
  system reached through the real adapter by an integration key. Each module that talks out
  gains, where missing, the same shape in its own test project (fake Gmail token endpoint, fake
  sandbox host, fake ClickHouse) and is selected with `WithIntegration`. DI replacement through
  `ConfigureServices` remains for in-process-only seams (`TimeProvider`, `IScriptSandbox`,
  flaky `IGrainStorage`) and is the exception, not the setup.
- Browser (`DigitalBrain.Testing.Playwright`): `OpenBrowserAsync` as an extension on
  `ITestBrain` from the Aspire target; Playwright, OTLP collector and browser container move here.
- Product-only helpers (reference brain, shell reset, lead data, workspace browser, Twitter
  fakes) move to `src/DigitalBrain.OS/DigitalBrain.OS.Testing` (not packable, namespace
  `DigitalBrain.OS.Testing`). `DigitalBrain.Testing.Reference` is deleted.
- Packages: `DigitalBrain.Testing` (depends on `DigitalBrain.Framework`, `DigitalBrain.Aspire.Server`,
  `DigitalBrain.Client.Orleans`, `DigitalBrain.Testing.Model` folded in), `DigitalBrain.Testing.Aspire`,
  `DigitalBrain.Testing.Playwright`. `DigitalBrain.Aspire.Testing` (composition facts) stays.
  The reflected `ModuleBuilderFactory` and the build-transitive `.targets` are deleted; Aspire
  tests start a real AppHost type through `DistributedApplicationTestingBuilder.CreateAsync<T>`.

### 4. Test simplification rules (applied per module by a subagent)

For every test project:

1. Boot through `TestBrain.Create()`; delete per-project host fixtures that only wrap a boot.
2. Replace `CallerContextStamper.Stamp`, `RequestContext.Remove`, `AuthorizeCallerAsync`,
   `ProvisionOwner`, `IBrain.Create(new Owner…)` with `PersonAsync`/`AsCaller()`.
3. Replace raw integration key strings and `AddInMemoryCollection` with `WithIntegration(schema, field, value)`.
4. Replace `ConfigureSilo` DI swaps of an external system with a wire-level fake behind
   `WithIntegration`; keep `ConfigureServices` only for clocks, sandboxes and storage faults.
5. Replace `TestWait.UntilAsync` polling with `Observe<T>` on the signal the neuron publishes;
   where no signal exists, the module gets one (a neuron that changes state publishes).
6. One fact per behavior, sentence-shaped name, `TestContext.Current.CancellationToken`, no
   `Timeout` attribute beyond the project default, no `Task.Delay`.
7. Delete facts that test the harness, Orleans or the DI container rather than the module.
8. `SiloServices`/`Services` reach-through only to read a module singleton the fact asserts on,
   never to configure.

### 5. Architecture rules (DigitalBrain.Architecture.Tests)

- Packable testing projects reference no Platform internals, no OS, no AppHost.
- No test project references `Orleans.TestingHost`.
- `CallerContextStamper.Stamp` appears in no test project outside `src/Testing`.
- `DigitalBrain.Aspire.Server` references no Azure storage package; only the orleans module does.
- `TestTierFacts` keeps its tier rules; the baseline file ends empty.

## Out of scope

Profiles (already landed), brain-as-data mesh, cross-app subscription scopes, the gRPC neuron
channel plan.
