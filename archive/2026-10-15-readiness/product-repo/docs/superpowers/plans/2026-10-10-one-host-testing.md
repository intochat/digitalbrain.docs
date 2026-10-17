# One Host, One Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orleans' external systems become the `orleans` module, the OS and every test boot through one host recipe, and one harness (`DigitalBrain.Testing`) replaces the module, E2E and reference harnesses, after which every module's test project is simplified by an Opus subagent against a fixed rule set.

**Architecture:** `OrleansModule` owns clustering, grain state and reminders behind an offered integration (absent → memory, present → Azure). `AddDigitalBrainServer` + `MapDigitalBrainServer` are the whole recipe; `Program.cs` is two calls. `TestBrain.Create()` builds a real `WebApplication` in-process (or drives an Aspire AppHost, or a remote URL) behind one `ITestBrain`, with `Person` for identity and `WithIntegration` for fakes.

**Tech Stack:** .NET 11 RC, Orleans 9, Aspire 13.6, xunit.v3 + Microsoft Testing Platform, Playwright, Azurite.

**Spec:** `docs/superpowers/specs/2026-10-10-one-host-testing-design.md`

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- LSP for all code work: `goToDefinition`/`findReferences`/`incomingCalls` before changing a symbol; diagnostics clean before build. Never grep for code; grep only non-code text.
- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`), no `/// <summary>`.
- Concrete arrays in grain state, never `IReadOnlyList`.
- No state compatibility: reshape state freely, no shims. A reshaped state fails at silo start as a wireType error; wipe the Azurite volume.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; real grains over mocks.
- Never raise a timeout or add polling to make a check pass.
- Commit explicit files only (parallel sessions share the tree); every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Any test run over 5 minutes is killed and debugged, never waited out.
- Done means seen running: Aspire resources Healthy, driven via `digitalbrain-mcp`, confirmed in traces.
- Module ring rules: `*.Contracts` references only `DigitalBrain`; a module references `DigitalBrain.Framework`, never Platform; `*.Aspire.Hosting` references `DigitalBrain.Aspire.Hosting`.
- Sweep tasks (Phase 4) run as Opus subagents (`model: "opus"`), one per test project, in parallel where their projects do not share a module.

## Review Focus

1. A host with the `orleans` integration half-filled (Clustering set, GrainState absent): the module must refuse to start with a message naming the missing field, not fall back to memory for one store. Test pinned in Task 2.
2. A silo restart in a test over `MemoryStores` with a grain whose ETag advanced before the restart: the second host must read the same ETag and a stale write must throw `InconsistentStateException`. Test pinned in Task 2.
3. The Open posture with no cookie: `PersonAsync` on an in-process brain must still return the synthetic owner (`owner`/`owner`), since every existing module fact relies on it. Test pinned in Task 8.
4. `WithIntegration` on the Aspire target with a value containing `=` or `;` (a connection string): the private configuration file must carry it verbatim, never through command-line `key=value` pairs. Test pinned in Task 11.
5. `MapDigitalBrainServer` called twice, or `AddDigitalBrainServer` with the OS catalog plus a duplicate module id: fail at startup with the module id in the message. Test pinned in Task 4.

---

## Phase 1: the `orleans` module

### Task 1: Orleans contracts project with `ICluster` membership

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Contracts/DigitalBrain.Modules.Microsoft.Orleans.Contracts.csproj`
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Contracts/ICluster.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Contracts/Signals/ClusterChanged.cs`
- Modify: `DigitalBrain.slnx` (add the three new projects under `src/DigitalBrain.Modules/Microsoft/Orleans`), and `DigitalBrain-lsp.sln` (gitignored; add the same so csharp-ls sees them; kill the server to reload)

**Interfaces:**
- Produces: `DigitalBrain.Microsoft.Orleans.ICluster` with `Task<ClusterSnapshot> Read()`, `static string Key(string brainId) => $"{brainId}/orleans/cluster"`; records `SiloView(string Name, string Address, string Status, string? Role, string Sha)`, `ClusterSnapshot(SiloView[] Silos, long Version)`; signal `ClusterChanged(ClusterSnapshot Snapshot)`.

- [ ] **Step 1: Create the csproj** (copy the Aspire contracts project's shape)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Orleans cluster membership contracts: the silos a brain runs on and when they change.</Description>
    <RootNamespace>DigitalBrain.Modules.Microsoft.Orleans.Contracts</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../../../../DigitalBrain/DigitalBrain.csproj" />
  </ItemGroup>
  <ItemGroup><PackageReference Include="Microsoft.Orleans.Sdk" PrivateAssets="all" /></ItemGroup>
</Project>
```

- [ ] **Step 2: Write `ICluster.cs`**

```csharp
using DigitalBrain;
using Orleans.Concurrency;
using Orleans.Metadata;

namespace DigitalBrain.Microsoft.Orleans;

[GenerateSerializer, Alias("orleans.cluster.silo")]
public sealed record SiloView(
    [property: Id(0)] string Name,
    [property: Id(1)] string Address,
    [property: Id(2)] string Status,
    [property: Id(3)] string? Role,
    [property: Id(4)] string Sha);

[GenerateSerializer, Alias("orleans.cluster.snapshot")]
public sealed record ClusterSnapshot([property: Id(0)] SiloView[] Silos, [property: Id(1)] long Version);

// The membership of the cluster this brain runs on, as Orleans sees it. A roll or restart is the Aspire
// module's act (IDeployment); this neuron only reports who is up.
[Alias("orleans.cluster"), DefaultGrainType("orleans.cluster")]
public interface ICluster : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<ClusterSnapshot> Read();
    static string Key(string brainId) => $"{brainId}/orleans/cluster";
}
```

- [ ] **Step 3: Write `Signals/ClusterChanged.cs`**

```csharp
using DigitalBrain;

namespace DigitalBrain.Microsoft.Orleans;

[GenerateSerializer, Alias("orleans.cluster.changed")]
public sealed record ClusterChanged([property: Id(0)] ClusterSnapshot Snapshot) : Signal;
```

- [ ] **Step 4: Build**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Contracts/DigitalBrain.Modules.Microsoft.Orleans.Contracts.csproj`
Expected: Build succeeded, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add DigitalBrain.slnx src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Contracts
git commit -m "Orleans: cluster membership contracts (ICluster, ClusterChanged)"
```

### Task 2: `OrleansModule` with memory and Azure providers behind one integration

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans/DigitalBrain.Modules.Microsoft.Orleans.csproj`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/OrleansModule.cs`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/OrleansOptions.cs`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/Storage/MemoryStores.cs`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/Storage/MemoryStoreGrainStorage.cs` (moved from `src/Testing/DigitalBrain.Testing.Module/Host/SessionGrainStorage.cs`, made public and keyed by store name)
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/Storage/OrleansStorageHosting.cs`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans/Cluster/ClusterNeuron.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests/DigitalBrain.Modules.Microsoft.Orleans.Tests.csproj`
- Create: `.../tests/DigitalBrain.Modules.Microsoft.Orleans.Tests/StorageSelectionFacts.cs`
- Create: `.../tests/DigitalBrain.Modules.Microsoft.Orleans.Tests/MemoryStoresFacts.cs`

**Interfaces:**
- Consumes: `IntegrationSchema` (`DigitalBrain.Framework.Platform.Integrations`), `DigitalBrainNames.ClusterGrainStorage`/`PlatformGrainStorage`, `Module<TOptions>`.
- Produces: `OrleansModule` (id `orleans`), `OrleansModule.Integration` (`IntegrationSchema` offering secrets `Clustering`, `GrainState`, `Reminders`, setting `GrainStateContainer`), `public sealed class MemoryStores` (singleton the host may pre-register), `public static ISiloBuilder AddOrleansStorage(this ISiloBuilder silo, IConfiguration configuration)`.

- [ ] **Step 1: csproj**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Orleans as a module: clustering, grain state and reminders as one integration; memory when it is absent.</Description>
    <RootNamespace>DigitalBrain.Modules.Microsoft.Orleans</RootNamespace>
    <NoWarn>$(NoWarn);ORLEANSEXP005</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="DigitalBrain.Modules.Microsoft.Orleans.Tests" />
    <PackageReference Include="Microsoft.Orleans.Clustering.AzureStorage" />
    <PackageReference Include="Microsoft.Orleans.Persistence.AzureStorage" />
    <PackageReference Include="Microsoft.Orleans.Reminders.AzureStorage" />
    <PackageReference Include="Microsoft.Orleans.Reminders" />
    <ProjectReference Include="../DigitalBrain.Modules.Microsoft.Orleans.Contracts/DigitalBrain.Modules.Microsoft.Orleans.Contracts.csproj" />
    <ProjectReference Include="../../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
  </ItemGroup>
</Project>
```

Add the three Azure Orleans packages to `Directory.Packages.props` at the Orleans version already pinned there (same line shape as `Microsoft.Orleans.Clustering.AzureStorage`, which `DigitalBrain.Testing.E2E` already references).

- [ ] **Step 2: `OrleansOptions.cs`**

```csharp
using DigitalBrain.Framework.Modules;

namespace DigitalBrain.Microsoft.Orleans;

public sealed class OrleansOptions : IModuleOptions
{
    // The blob container both grain stores live in when the integration is present.
    public string GrainStateContainer { get; set; } = DigitalBrain.Framework.DigitalBrainNames.GrainStateContainer;
    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(GrainStateContainer)) { throw new InvalidOperationException("GrainStateContainer is required."); }
    }
}
```

- [ ] **Step 3: `MemoryStores.cs`** — the object a host keeps across rebuilds

```csharp
using System.Collections.Concurrent;

namespace DigitalBrain.Microsoft.Orleans;

// Every memory-backed store of one process family: grain state per store name, plus the in-memory
// membership and reminder tables Orleans keeps when it clusters on localhost. A host that registers
// one instance before the module configures keeps its state across a rebuild — a silo restart in a test.
public sealed class MemoryStores
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, (byte[] State, long ETag)>> _stores = new(StringComparer.Ordinal);
    public ConcurrentDictionary<string, (byte[] State, long ETag)> Store(string name) => _stores.GetOrAdd(name, _ => new(StringComparer.Ordinal));
}
```

- [ ] **Step 4: `MemoryStoreGrainStorage.cs`** — move `SessionGrainStorage` here verbatim, rename the class, make it `public sealed`, constructor `(ConcurrentDictionary<string,(byte[] State,long ETag)> records, Serializer serializer)`.

- [ ] **Step 5: `OrleansStorageHosting.cs`**

```csharp
using Azure.Data.Tables;
using Azure.Storage.Blobs;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Integrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Orleans.Configuration;
using Orleans.Storage;

namespace DigitalBrain.Microsoft.Orleans;

public static class OrleansStorageHosting
{
    public const string ClusteringField = "Clustering";
    public const string GrainStateField = "GrainState";
    public const string RemindersField = "Reminders";

    // Providers must exist before the silo builds, so the choice is read from configuration here, not
    // from the integration grain at runtime; the Platform seeds the same keys into the integration.
    public static ISiloBuilder AddOrleansStorage(this ISiloBuilder silo, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(silo);
        ArgumentNullException.ThrowIfNull(configuration);
        var clustering = configuration[OrleansModule.Integration.Key(ClusteringField)];
        var grainState = configuration[OrleansModule.Integration.Key(GrainStateField)];
        var reminders = configuration[OrleansModule.Integration.Key(RemindersField)];
        var present = new[] { clustering, grainState, reminders }.Count(value => !string.IsNullOrWhiteSpace(value));
        if (present == 0) { return AddMemory(silo); }
        if (present < 3)
        {
            var missing = string.Join(", ", new[] { (ClusteringField, clustering), (GrainStateField, grainState), (RemindersField, reminders) }
                .Where(pair => string.IsNullOrWhiteSpace(pair.Item2)).Select(pair => pair.Item1));
            throw new InvalidOperationException($"The orleans integration is partial; missing: {missing}. Set all three or none.");
        }
        return AddAzure(silo, clustering!, grainState!, reminders!);
    }

    private static ISiloBuilder AddMemory(ISiloBuilder silo)
    {
        silo.Services.TryAddSingleton<MemoryStores>();
        silo.UseLocalhostClustering();
        silo.UseInMemoryReminderService();
        foreach (var name in new[] { DigitalBrainNames.ClusterGrainStorage, DigitalBrainNames.PlatformGrainStorage })
        {
            silo.Services.AddKeyedSingleton<IGrainStorage>(name, (provider, key) => new MemoryStoreGrainStorage(
                provider.GetRequiredService<MemoryStores>().Store((string)key!),
                provider.GetRequiredService<global::Orleans.Serialization.Serializer>()));
        }
        return silo;
    }

    private static ISiloBuilder AddAzure(ISiloBuilder silo, string clustering, string grainState, string reminders)
    {
        silo.UseAzureStorageClustering(options => options.TableServiceClient = new TableServiceClient(clustering));
        silo.UseAzureTableReminderService(options => options.TableServiceClient = new TableServiceClient(reminders));
        foreach (var name in new[] { DigitalBrainNames.ClusterGrainStorage, DigitalBrainNames.PlatformGrainStorage })
        {
            silo.AddAzureBlobGrainStorage(name, options => options.BlobServiceClient = new BlobServiceClient(grainState));
            silo.Services.AddKeyedSingleton<IGrainStorageSerializer>(name, static (services, _) =>
                new OrleansGrainStorageSerializer(services.GetRequiredService<global::Orleans.Serialization.Serializer>()));
            silo.Services.AddOptions<AzureBlobStorageOptions>(name).Configure<IOptions<OrleansOptions>>(
                static (options, module) => options.ContainerName = module.Value.GrainStateContainer);
        }
        return silo;
    }
}
```

- [ ] **Step 6: `OrleansModule.cs`**

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Modules;
using DigitalBrain.Framework.Platform.Integrations;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Microsoft.Orleans;

public sealed class OrleansModule() : Module<OrleansOptions>(new ModuleId("orleans"))
{
    public override System.Reflection.Assembly? Contracts => typeof(ICluster).Assembly;

    public static IntegrationSchema Integration { get; } = IntegrationSchema.For("orleans", "Orleans")
        .OffersSecret(OrleansStorageHosting.ClusteringField)
        .OffersSecret(OrleansStorageHosting.GrainStateField)
        .OffersSecret(OrleansStorageHosting.RemindersField);

    public static ConnectorDefinition Connector => new("orleans", "Orleans", ["deployment"], ["orleans"])
    {
        Neurons = [typeof(ICluster)],
        Signals = [typeof(ClusterChanged)],
    };

    public override void Configure(ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        silo.AddOrleansStorage(silo.Configuration);
    }
}
```

`silo.Configuration` is `ISiloBuilder.Configuration` (Orleans 9 exposes it). If LSP shows it missing on this SDK, read it as `silo.Services.BuildServiceProvider` is forbidden; instead take `IConfiguration` from the `HostApplicationBuilder` in Task 4 and pass it through `Module.Configure` via `silo.Services.AddSingleton(configuration)` registered by `AddDigitalBrainServer` before modules configure, then `silo.Services.Single(d => d.ServiceType == typeof(IConfiguration)).ImplementationInstance`.

- [ ] **Step 7: `Cluster/ClusterNeuron.cs`**

```csharp
using DigitalBrain.Framework;
using Orleans.Runtime;

namespace DigitalBrain.Microsoft.Orleans.Cluster;

[GrainType("orleans.cluster")]
internal sealed class ClusterNeuron(IGrainFactory grains) : Neuron, ICluster, IRetainsSignals
{
    private ClusterSnapshot? _last;

    public async Task<ClusterSnapshot> Read()
    {
        var hosts = await grains.GetGrain<IManagementGrain>(0).GetHosts(onlyActive: false);
        var silos = hosts.OrderBy(pair => pair.Key.ToString(), StringComparer.Ordinal)
            .Select(pair => new SiloView(pair.Key.ToString(), pair.Key.Endpoint.ToString(), pair.Value.ToString(), null, ThisAssembly.Sha))
            .ToArray();
        var next = new ClusterSnapshot(silos, (_last?.Version ?? 0) + 1);
        if (_last is null || !_last.Silos.SequenceEqual(next.Silos)) { _last = next; await PublishAsync(new ClusterChanged(next)); }
        return _last;
    }

    public Task<RetainedSignal[]> Retained(string signal, long since)
        => Task.FromResult<RetainedSignal[]>(signal == nameof(ClusterChanged) && _last is not null && _last.Version > since
            ? [new RetainedSignal(_last.Version, new ClusterChanged(_last) { Publisher = this.GetPrimaryKeyString() })] : []);
}

internal static class ThisAssembly
{
    public static readonly string Sha = typeof(ThisAssembly).Assembly.GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
        .OfType<System.Reflection.AssemblyInformationalVersionAttribute>().FirstOrDefault()?.InformationalVersion.Split('+').LastOrDefault() ?? "source";
}
```

Match `Neuron`, `PublishAsync` and `IRetainsSignals` to what `src/Testing/DigitalBrain.Testing.Module/Neurons/Pulse.cs` uses today (same base, same signatures).

- [ ] **Step 8: Test project csproj**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../../../../../Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.Microsoft.Orleans/DigitalBrain.Modules.Microsoft.Orleans.csproj" />
  </ItemGroup>
  <ItemGroup><Using Include="DigitalBrain.Testing.Module" /></ItemGroup>
</Project>
```

(The sweep in Task 19 moves it to `DigitalBrain.Testing`; until then the old harness boots it.)

- [ ] **Step 9: Failing facts — `StorageSelectionFacts.cs`**

```csharp
using DigitalBrain.Microsoft.Orleans;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Orleans.Hosting;
using Orleans.Storage;

namespace DigitalBrain.Modules.Microsoft.Orleans.Tests;

public sealed class StorageSelectionFacts
{
    [Fact]
    public void AnAbsentIntegrationSelectsMemoryStores()
    {
        var services = new ServiceCollection();
        var silo = new FakeSilo(services, new ConfigurationBuilder().Build());
        silo.AddOrleansStorage(silo.Configuration);
        Assert.Contains(services, d => d.ServiceType == typeof(MemoryStores));
        Assert.Contains(services, d => d.ServiceType == typeof(IGrainStorage) && Equals(d.ServiceKey, "cluster"));
        Assert.Contains(services, d => d.ServiceType == typeof(IGrainStorage) && Equals(d.ServiceKey, "platform"));
    }

    [Fact]
    public void APartialIntegrationRefusesToStartNamingTheMissingFields()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [OrleansModule.Integration.Key(OrleansStorageHosting.ClusteringField)] = "UseDevelopmentStorage=true",
        }).Build();
        var silo = new FakeSilo(new ServiceCollection(), configuration);
        var error = Assert.Throws<InvalidOperationException>(() => silo.AddOrleansStorage(configuration));
        Assert.Contains("GrainState", error.Message, StringComparison.Ordinal);
        Assert.Contains("Reminders", error.Message, StringComparison.Ordinal);
    }
}
```

`FakeSilo` is a minimal `ISiloBuilder` over a `ServiceCollection` and an `IConfiguration` (implement `Services`, `Configuration`, `Properties`); put it in the same file.

- [ ] **Step 10: Failing facts — `MemoryStoresFacts.cs`** (Review Focus 2)

```csharp
using DigitalBrain.Microsoft.Orleans;
using Orleans.Runtime;
using Orleans.Serialization;
using Orleans.Storage;

namespace DigitalBrain.Modules.Microsoft.Orleans.Tests;

public sealed class MemoryStoresFacts
{
    [Fact]
    public async Task AStoreKeepsItsETagAcrossProvidersAndRefusesAStaleWrite()
    {
        var stores = new MemoryStores();
        var serializer = new ServiceCollection().AddSerializer().BuildServiceProvider().GetRequiredService<Serializer>();
        var first = new MemoryStoreGrainStorage(stores.Store("cluster"), serializer);
        var id = GrainId.Create("test", "key");
        var state = new GrainState<int> { State = 1 };
        await first.WriteStateAsync("s", id, state);
        var second = new MemoryStoreGrainStorage(stores.Store("cluster"), serializer);
        var read = new GrainState<int>();
        await second.ReadStateAsync("s", id, read);
        Assert.Equal(1, read.State);
        Assert.Equal(state.ETag, read.ETag);
        var stale = new GrainState<int> { State = 2, ETag = null };
        await Assert.ThrowsAsync<InconsistentStateException>(() => second.WriteStateAsync("s", id, stale));
    }
}
```

- [ ] **Step 11: Run, expect compile failure, implement until green**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests`
Expected: 3 passed.

- [ ] **Step 12: Commit**

```bash
git add Directory.Packages.props DigitalBrain.slnx src/DigitalBrain.Modules/Microsoft/Orleans
git commit -m "Orleans module: clustering, grain state and reminders behind one offered integration; memory when absent"
```

### Task 3: `OrleansModuleHosting` takes the Azurite wiring out of `AddDigitalBrain`

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Orleans/DigitalBrain.Modules.Microsoft.Orleans.Aspire.Hosting/DigitalBrain.Modules.Microsoft.Orleans.Aspire.Hosting.csproj`
- Create: `.../DigitalBrain.Modules.Microsoft.Orleans.Aspire.Hosting/OrleansModuleHosting.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs:25-80` (`AddDigitalBrain` no longer branches on `UseAzureStorage`; it always does the memory shape: `AddOrleans().WithClusterId().WithServiceId()`, master key, posture) and `:85-125` (`WithReference` drops the four `Orleans__*` environment lines; keeps the development-clustering lines guarded by `brain.Clustering is null`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainBuilder.cs` (make `Storage`, `GrainState`, `Clustering`, `Reminders`, `ClusteringResourceName` settable by the hosting: `public ... { get; internal set; }` → `{ get; set; }`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs` (delete `UseAzureStorage`; `Named(configuration, name, useAzureStorage:)` loses the parameter)
- Modify: `src/DigitalBrain.AppHost/AppHost.cs:40-60` (`.WithHosting<OrleansModuleHosting, OrleansOptions>(orleans => orleans.WithAzurite())` right after `AddDigitalBrain`; `DigitalBrainHostingOptions.Named(builder.Configuration, "intochat")`)
- Modify: `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` (reference the new hosting project)
- Test: `src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests.Hosting/OrleansHostingFacts.cs` (new `*.Tests.Hosting` project on `DigitalBrain.Aspire.Testing`, like `DigitalBrain.Modules.Postgres.Tests.Hosting`)

**Interfaces:**
- Produces: `OrleansModuleHosting : ModuleHosting<OrleansModule>`; `OrleansModuleOptionsExtensions.WithAzurite(this OrleansOptions, Action<AzuriteOptions>? = null)` recorded on a hosting-side options wrapper exactly as `PostgresModuleOptions.WithPostgres` is (read `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Aspire.Hosting` first and mirror its mechanism for carrying hosting choices on options).

- [ ] **Step 1: Hosting facts (failing)** in the new `Tests.Hosting` project, with `AspireCompositionTest` like `PostgresHostingFacts` does:

```csharp
[Fact]
public async Task WithAzuriteProjectsTheThreeConnectionsIntoTheOrleansIntegration()
{
    using var composition = AspireCompositionTest.Create();
    var brain = composition.Builder.AddDigitalBrain("Modules")
        .WithHosting<OrleansModuleHosting, OrleansOptions>(orleans => orleans.WithAzurite());
    var silo = composition.Builder.AddProject<Projects.DigitalBrain_OS>("os").WithReference(brain);
    var environment = await composition.EnvironmentOf(silo);
    Assert.Contains(DigitalBrainConfiguration.IntegrationEnvironmentName("orleans", "Clustering"), environment.Keys);
    Assert.Contains(DigitalBrainConfiguration.IntegrationEnvironmentName("orleans", "GrainState"), environment.Keys);
    Assert.Contains(DigitalBrainConfiguration.IntegrationEnvironmentName("orleans", "Reminders"), environment.Keys);
    Assert.DoesNotContain("Orleans__Clustering__ServiceKey", environment.Keys);
}

[Fact]
public async Task WithoutAzuriteTheSiloGetsNoOrleansIntegration()
{
    using var composition = AspireCompositionTest.Create();
    var brain = composition.Builder.AddDigitalBrain("Modules").WithHosting<OrleansModuleHosting, OrleansOptions>(_ => { });
    var silo = composition.Builder.AddProject<Projects.DigitalBrain_OS>("os").WithReference(brain);
    var environment = await composition.EnvironmentOf(silo);
    Assert.DoesNotContain(environment.Keys, key => key.StartsWith(DigitalBrainConfiguration.IntegrationEnvironmentName("orleans", ""), StringComparison.Ordinal));
}
```

Use the real names of `AspireCompositionTest`'s members (read `src/Testing/DigitalBrain.Aspire.Testing/AspireCompositionTest.cs`); the two facts above name the intent.

- [ ] **Step 2: `OrleansModuleHosting.cs`**

```csharp
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Azure;
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Configuration;

namespace DigitalBrain.Microsoft.Orleans;

public sealed class OrleansModuleHosting : ModuleHosting<OrleansModule>
{
    public override void Configure(DigitalBrainBuilder brain)
    {
        ArgumentNullException.ThrowIfNull(brain);
        if (!AzuriteChoice.Of(brain, out var azurite)) { return; }
        var builder = brain.ApplicationBuilder;
        var persist = azurite.Persistent && builder.Configuration.GetValue(DigitalBrainHostingOptions.PersistentStorageKey, true);
        var storage = builder.AddAzureStorage(brain.ResourceName(DigitalBrainNames.Storage))
            .RunAsEmulator(emulator =>
            {
                emulator.WithArgs("--silent");
                if (persist) { emulator.WithLifetime(ContainerLifetime.Persistent); }
                if (azurite.DataVolume is not null) { emulator.WithDataVolume(azurite.DataVolume); }
                else if (persist) { emulator.WithDataVolume(); }
            })
            .WithParentRelationship(brain.Resource);
        var clustering = storage.AddTables(brain.ResourceName(DigitalBrainNames.Clustering));
        var reminders = storage.AddTables(brain.ResourceName(DigitalBrainNames.Reminders));
        var grainState = storage.AddBlobs(brain.ResourceName(DigitalBrainNames.GrainState));
        brain.Orleans.WithClustering(clustering).WithReminders(reminders)
            .WithGrainStorage(DigitalBrainNames.ClusterGrainStorage, grainState)
            .WithGrainStorage(DigitalBrainNames.PlatformGrainStorage, grainState);
        brain.Storage = storage; brain.GrainState = grainState; brain.Clustering = clustering; brain.Reminders = reminders;
        brain.ClusteringResourceName = clustering.Resource.Name;
        foreach (var resource in new IResource[] { storage.Resource, clustering.Resource, reminders.Resource, grainState.Resource })
        { brain.RequireHealthyBeforeStart(resource); }
        brain.AddProjection(new Connection(OrleansStorageHosting.ClusteringField, clustering));
        brain.AddProjection(new Connection(OrleansStorageHosting.GrainStateField, grainState));
        brain.AddProjection(new Connection(OrleansStorageHosting.RemindersField, reminders));
    }

    private sealed class Connection(string field, IResourceBuilder<IResourceWithConnectionString> source) : DigitalBrainModuleProjection
    {
        public override void Apply<TResource>(IResourceBuilder<TResource> builder)
            => builder.WithEnvironment(DigitalBrainConfiguration.IntegrationEnvironmentName("orleans", field), source.Resource.ConnectionStringExpression);
    }
}
```

`AzuriteChoice` reads the hosting-side choice recorded by `WithAzurite` (mirror the Postgres hosting mechanism). The `Orleans.WithClustering` lines stay so the Aspire Orleans client resource still advertises them to MCP clients; the silo itself no longer reads `Orleans__*` keys.

- [ ] **Step 3: Strip `AddDigitalBrain` and `WithReference`** as listed under Files. Delete the `UseAzureStorage` option. Keep `GrainStateContainer` projection (`DigitalBrainNames.GrainStateContainerKey`) since the orleans module's options still read it — change the module to bind `GrainStateContainer` from `DigitalBrain:Modules:orleans:Options:GrainStateContainer` and have `WithReference` project that key instead; delete `DigitalBrainNames.GrainStateContainerKey` once no reference remains (LSP `findReferences`).

- [ ] **Step 4: Build and run the hosting facts**

Run: `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj && dotnet test --project src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests.Hosting && dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit`
Expected: all pass; fix every Aspire.Hosting unit fact that asserted the deleted `Orleans__*` keys by asserting the integration keys instead.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/Orleans src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit src/DigitalBrain.AppHost DigitalBrain.slnx
git commit -m "Orleans hosting: Azurite projects into the orleans integration; AddDigitalBrain no longer wires storage"
```

### Task 4: One recipe: `AddDigitalBrainServer` + `MapDigitalBrainServer`, OS catalog lists `orleans`

**Files:**
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs` (delete the `AzureStorage` branches, `ConfigureStandaloneAzureClustering`, the two `AddKeyedAzure*Client` calls, the serializer/blob options block; add `builder.AddDigitalBrainPlatform()` and the part-log-when-configured call after `UseOrleans`; add `MapDigitalBrainServer`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrainServerBuilder.cs` (delete `UseAzureStorage`/`AzureStorage`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrain.Aspire.Server.csproj` (drop `Azure.Data.Tables`, Orleans Azure packages, Aspire Azure client packages; add reference to `DigitalBrain.Platform`)
- Move: `src/DigitalBrain.OS/DigitalBrain.OS/OsMachine.cs` → `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/MachineHosting.cs` as `AddMachinePartLogWhenConfigured(this IHostApplicationBuilder)` beside `AddMachinePartLog`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:17` (add `new DigitalBrain.Microsoft.Orleans.OrleansModule(),` first in `BuiltIn()`), `DigitalBrain.OS.csproj` (reference the orleans module)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/Program.cs` → exactly:

```csharp
using DigitalBrain.Aspire.Server;
using DigitalBrain.OS;

var builder = WebApplication.CreateBuilder(args);
// IntoChat is a distribution of the operating system: the composition is the OS's, and what is
// IntoChat's own is branding, features and configuration (the AppHost names the ./features folder).
builder.AddDigitalBrainServer(server => server.UseOrleansDashboard().AddOperatingSystem());
var app = builder.Build();
app.MapDigitalBrainServer();
app.Run();
```

- Test: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/ServerRecipeFacts.cs` (new)

**Interfaces:**
- Produces: `public static WebApplication MapDigitalBrainServer(this WebApplication app)`; `AddDigitalBrainServer` signature unchanged.

- [ ] **Step 1: Failing facts (Review Focus 5)**

```csharp
public sealed class ServerRecipeFacts
{
    [Fact]
    public void ADuplicateModuleIdFailsNamingTheModule()
    {
        var server = new DigitalBrainServerBuilder().AddModule<TimeModule>();
        var error = Assert.Throws<InvalidOperationException>(() => server.AddModule<TimeModule>());
        Assert.Contains("time", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TheRecipeHostsASiloAndTheHttpSurfaceInOneProcess()
    {
        var ct = TestContext.Current.CancellationToken;
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [DigitalBrainNames.MasterKeyConfigurationKey] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            [AuthOptions.PostureKey] = nameof(IdentityPosture.Open),
            [$"{PartsOptions.Key}:MachineDirectory"] = Directory.CreateTempSubdirectory("recipe-").FullName,
        });
        builder.AddDigitalBrainServer(server => server.AddModule<OrleansModule>().AddModule<TimeModule>());
        await using var app = builder.Build();
        app.MapDigitalBrainServer();
        await app.StartAsync(ct);
        using var http = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        using var ready = await http.GetAsync("/ready", ct);
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.True(BrainHosting.HasKernelRegistration(app.Services));
        Assert.Throws<InvalidOperationException>(() => app.MapDigitalBrainServer());
        await app.StopAsync(ct);
    }
}
```

`MapDigitalBrainServer` records a marker in `app.Services`-independent state (an `IApplicationBuilder.Properties` key `"DigitalBrain.Mapped"`) and throws on a second call.

- [ ] **Step 2: Implement** the Files changes; `MapDigitalBrainServer`:

```csharp
public static WebApplication MapDigitalBrainServer(this WebApplication app)
{
    ArgumentNullException.ThrowIfNull(app);
    if (!app.Properties.TryAdd("DigitalBrain.Mapped", true)) { throw new InvalidOperationException("MapDigitalBrainServer runs once per application."); }
    app.UsePlatformHttp();
    if (app.Services.GetRequiredService<DigitalBrainServerBuilder>().Dashboard) { app.MapOrleansDashboard(); }
    app.MapDefaultEndpoints();
    app.MapDigitalBrainModules();
    app.MapDigitalBrainPlatform();
    return app;
}
```

- [ ] **Step 3: Build, run facts, then the OS unit suite**

Run: `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj && dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit && dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: pass. `OsCatalogFacts` will list one more module; update its expected set.

- [ ] **Step 4: See it running**

Run `dotnet run digitalbrain.cs` from the repo root; `mcp__aspire__list_resources` must show every resource Healthy; `neurons_get` on `owner/orleans/cluster` through `digitalbrain-mcp` returns one silo; `list_structured_logs` shows no `Orleans__` configuration warnings.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/MachineHosting.cs src/DigitalBrain.OS/DigitalBrain.OS src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
git rm src/DigitalBrain.OS/DigitalBrain.OS/OsMachine.cs
git commit -m "One host recipe: AddDigitalBrainServer + MapDigitalBrainServer; the OS boots in two calls; orleans in the catalog"
```

### Task 5: Aspire module keeps roll and restart as `IDeployment`

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire.Contracts/ICluster.cs` → rename file `IDeployment.cs`: `ICluster`→`IDeployment` (alias `aspire.deployment`, key `{brainId}/aspire/deployment`), `ClusterSnapshot`→`DeploymentSnapshot` (drop `SiloView`; `Silos()` deleted), `ClusterStage`→`DeploymentStage`; `Signals/ClusterChanged.cs` → `DeploymentChanged`
- Modify: every reference LSP `findReferences` lists for `ICluster`, `ClusterSnapshot`, `ClusterChanged`, `SiloView`, `Silos` in `DigitalBrain.Modules.Microsoft.Aspire` (`Cluster/*.cs` → folder `Deployment/`), its tests, `features/**/*.cs` scripts, the Flutter shell Dart mirrors (`src/DigitalBrain.Modules/Google/Flutter/app` — search the Dart tree for `aspire.cluster` with `mcp__dart__rip_grep_packages`), and `AspireModule.Connector` (`Neurons = [typeof(ICandidate), typeof(IDeployment)]`, signals likewise)
- Modify: `DigitalBrain.Modules.Microsoft.Aspire.csproj` adds a reference to the orleans contracts; `DeploymentNeuron` reads membership through `ICluster.Read()` where it listed silos before.

- [ ] **Step 1:** LSP map every site (`findReferences` on each renamed symbol); write the list into the commit message body.
- [ ] **Step 2:** Rename and rewire; `dotnet build` the module, its hosting ring, the OS, the AppHost; `flutter analyze` in the shell if a Dart mirror changed.
- [ ] **Step 3:** `dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests` and `--project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` (features compile check).
- [ ] **Step 4:** Commit the explicit file list.

```bash
git commit -m "Aspire: ICluster is orleans' membership; Aspire keeps roll and restart as IDeployment"
```

---

## Phase 2: one harness

### Task 6: `DigitalBrain.Testing` gains the builder, `ITestBrain` and the in-process target

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj` (add references: `DigitalBrain.Aspire.Server`, `DigitalBrain.Modules.Microsoft.Orleans`; `FrameworkReference Microsoft.AspNetCore.App`; `xunit.v3.extensibility.core` for `IAsyncLifetime` is NOT needed — keep xunit out of the core package)
- Create: `src/Testing/DigitalBrain.Testing/TestBrain.cs`
- Create: `src/Testing/DigitalBrain.Testing/ITestBrain.cs`
- Create: `src/Testing/DigitalBrain.Testing/Targets/ITestTarget.cs`
- Create: `src/Testing/DigitalBrain.Testing/Targets/InProcessTarget.cs`
- Create: `src/Testing/DigitalBrain.Testing/Composition/TestComposition.cs` (moved from `DigitalBrain.Testing.Module/Composition/*` — `BrainCompositionBuilder`, `ModuleDraft`, `ModuleOptionsSlot`, `ModuleComposition` — unchanged except namespace `DigitalBrain.Testing`)
- Move: `src/Testing/DigitalBrain.Testing.Model/*` into `src/Testing/DigitalBrain.Testing/Model/` (namespace stays `DigitalBrain.Testing.Model`); delete the `Testing.Model` project and fix its two referencing csprojs
- Test: `src/Testing/DigitalBrain.Testing.Tests/TestBrainFacts.cs` (rename `DigitalBrain.Testing.Module.Tests.Unit` → `DigitalBrain.Testing.Tests`; keep its `TestNeurons.cs`, `LifetimeFacts.cs`)

**Interfaces:**
- Produces:

```csharp
public interface ITestBrain : IDigitalBrain, IBrainSubscriptions, IAsyncDisposable
{
    T Get<T>(string id) where T : class, INeuron;
    HttpClient HttpClient { get; }                    // the brain's HTTP edge, unauthenticated
    IServiceProvider Services { get; }                // in-process only; throws NotSupportedException elsewhere
    TestExecutionOptions Execution { get; }
    Task DeactivateAsync(IAddressable neuron, CancellationToken ct = default);
    Task RestartAsync(CancellationToken ct = default);   // in-process: rebuild over the same MemoryStores
    Task<Person> PersonAsync(string name, CancellationToken ct = default);   // Task 8
}
public sealed class TestBrain   // builder
{
    public static TestBrain Create();
    public TestBrain WithModule<TModule>(Action<ModuleConfiguration<TModule>>? configure = null) where TModule : Module, new();
    public TestBrain WithModule<TModule, TOptions>(Action<TOptions>? options = null, Action<ModuleConfiguration<TModule>>? configure = null) where TModule : Module<TOptions>, new() where TOptions : class, IModuleOptions, new();
    public TestBrain WithOptions<TModule, TOptions>(Action<TOptions> options) ...;          // ConfigureModule renamed
    public TestBrain WithIntegration(IntegrationSchema schema, string field, string value);
    public TestBrain WithIntegration(IntegrationSchema schema, string field, Uri value) => WithIntegration(schema, field, value.AbsoluteUri);
    public TestBrain WithFakeModel(FakeModelServer model);   // sugar: openai ApiKey + Endpoint
    public TestBrain WithConfiguration(string key, string? value);   // validated like PrivateConfiguration today
    public TestBrain ConfigureServices(Action<IServiceCollection> configure);   // in-process escape hatch
    public TestBrain WithExecution(TestExecutionOptions execution);
    public TestBrain WithReminders();      // no-op in-process now (memory reminders always on); kept for one release then deleted in Task 20
    public TestBrain WithFastSubscriptions(int bufferCapacity = 256);
    public TestBrain On(ITestTarget target);   // default: new InProcessTarget()
    public Task<ITestBrain> StartAsync(CancellationToken ct = default);
}
public interface ITestTarget { Task<ITestBrain> StartAsync(TestBrainPlan plan, CancellationToken ct); }
public sealed record TestBrainPlan(IReadOnlyList<ModuleDefinition> Modules, IReadOnlyDictionary<string,string?> Configuration,
    Action<IServiceCollection>? Services, TestExecutionOptions Execution, Action<IClientBuilder>? Client);
```

- [ ] **Step 1: Failing facts** in `TestBrainFacts.cs`

```csharp
public sealed class TestBrainFacts
{
    [Fact]
    public async Task AnInProcessBrainAnswersHttpAndGrainsFromOneProcess()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<PulseModule>().StartAsync(ct);
        using var ready = await brain.HttpClient.GetAsync("/ready", ct);
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        var pulse = brain.Get<IPulse>("owner/pulse");
        await using var pulsed = await brain.Observe<Pulsed>(pulse, ct);
        await pulse.Pulse(7);
        Assert.Equal(7, (await pulsed.NextAsync(ct: ct)).Value);
        Assert.Same(brain.Services.GetRequiredService<MemoryStores>(), brain.Services.GetRequiredService<MemoryStores>());
    }

    [Fact]
    public async Task ARestartKeepsNeuronStateAndTheHttpAddress()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<PulseModule>().StartAsync(ct);
        var address = brain.HttpClient.BaseAddress;
        await brain.Get<IPulse>("owner/pulse").Pulse(3);
        await brain.RestartAsync(ct);
        Assert.Equal(address, brain.HttpClient.BaseAddress);
        var retained = await brain.Get<IPulse>("owner/pulse").Retained(nameof(Pulsed), 0);
        Assert.Single(retained);
    }

    [Fact]
    public async Task WithIntegrationLandsInTheSiloConfiguration()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<PulseModule>()
            .WithIntegration(IntegrationSchema.For("probe", "Probe").RequiresSecret("Token"), "Token", "t-1").StartAsync(ct);
        Assert.Equal("t-1", brain.Services.GetRequiredService<IConfiguration>()[IntegrationSchema.Key("probe", "Token")]);
    }
}
```

`PulseNeuron` must persist `_last` through `[PersistentState("pulse", DigitalBrainNames.ClusterGrainStorage)]` for the restart fact to hold; change `Pulse.cs` accordingly (it moves to `DigitalBrain.Testing/Neurons/Pulse.cs`).

- [ ] **Step 2: `InProcessTarget.StartAsync`**

```csharp
public sealed class InProcessTarget : ITestTarget
{
    public async Task<ITestBrain> StartAsync(TestBrainPlan plan, CancellationToken ct)
    {
        var stores = new MemoryStores();
        var masterKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var machine = Path.Combine(Path.GetTempPath(), $"digitalbrain-machine-{Guid.NewGuid():N}");
        var lifetime = new TestSessionLifetime(plan.Execution);
        var host = await BuildAsync(plan, stores, masterKey, machine, port: 0, ct).ConfigureAwait(false);
        return new InProcessBrain(plan, stores, masterKey, machine, host, lifetime, BuildAsync);
    }

    internal static async Task<WebApplication> BuildAsync(TestBrainPlan plan, MemoryStores stores, string masterKey, string machine, int port, CancellationToken ct)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls($"http://127.0.0.1:{port}");
        builder.Configuration.AddInMemoryCollection(TestLogging.QuietDefaults);
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [DigitalBrainNames.MasterKeyConfigurationKey] = masterKey,
            [IntegrationSchema.Key("csharp", "RunTokenKey")] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            [AuthOptions.PostureKey] = nameof(IdentityPosture.Open),
            [$"{PartsOptions.Key}:MachineDirectory"] = machine,
        });
        foreach (var module in plan.Modules) { builder.Configuration.AddInMemoryCollection(module.Settings); }
        builder.Configuration.AddInMemoryCollection(plan.Configuration);
        builder.Services.AddSingleton(stores);     // before the orleans module configures: TryAddSingleton keeps ours
        builder.AddDigitalBrainServer(server =>
        {
            server.AddModule<OrleansModule>();
            foreach (var module in plan.Modules.Where(m => m.Module is not OrleansModule)) { server.AddModule(module.Module); }
            if (plan.Services is { } services) { server.ConfigureServices(services); }
        });
        builder.Services.AddDigitalBrainClient();
        var app = builder.Build();
        app.MapDigitalBrainServer();
        await app.StartAsync(ct).ConfigureAwait(false);
        return app;
    }
}
```

The `csharp` run-token key and the `AuthOptions`/`IdentityPosture`/`PartsOptions` names are Platform public types; if any is `internal`, make it `public` in Platform (that is the reason the old harness needed `InternalsVisibleTo`; the recipe is public now). `InProcessBrain` implements `ITestBrain`: `Get<T>` through `IDigitalBrains` from `app.Services`, `HttpClient` on `app.Urls.Single()`, `Services => app.Services`, `DeactivateAsync` through `app.Services.GetRequiredService<IGrainContextActivator>()`-free path: `IManagementGrain.ForceActivationCollection` is too coarse — use `app.Services.GetRequiredService<Orleans.Runtime.ILocalSiloDetails>()` plus `IActivationDirectory`; read what `InProcessTestCluster.DeactivateAsync` does today (LSP `goToDefinition`) and do the same against `app.Services`. `RestartAsync`: remember the port from `app.Urls`, `await app.StopAsync(); await app.DisposeAsync();` then `BuildAsync(..., port, ct)` and swap the client.

- [ ] **Step 3: Run the three facts and the renamed harness suite**

Run: `dotnet test --project src/Testing/DigitalBrain.Testing.Tests`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/Testing/DigitalBrain.Testing src/Testing/DigitalBrain.Testing.Tests DigitalBrain.slnx
git commit -m "Testing: TestBrain builder, ITestBrain and the in-process target run the product recipe"
```

### Task 7: `DigitalBrain.Testing.Module` becomes a thin alias, then goes away

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs` → `public static class ModuleTest { public static TestBrain Create() => TestBrain.Create(); }`; `ModuleBrain` → `public sealed class ModuleBrain` deleted, and `using ModuleBrain = DigitalBrain.Testing.ITestBrain;` placed in a `GlobalUsings.cs` of the Module project with `<Using Include="DigitalBrain.Testing.ITestBrain" Alias="ModuleBrain" />` in its csproj so existing tests compile unchanged
- Delete: `Host/ModuleHttpEdge.cs`, `Host/SessionGrainStorage.cs`, `ModuleTestBuilder.cs`, `ModuleOptions.cs`, `Composition/*`, `Neurons/Pulse.cs`, `Host/ModuleBrain.cs`
- Keep for now: `Host/BrainIdentityExtensions.cs` (`AuthorizeCallerAsync` over `ITestBrain`), deleted in Task 20 after the sweep
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj:18` delete `InternalsVisibleTo DigitalBrain.Testing.Module`
- Modify: `Directory.Build.props` test item group: `<Using Include="DigitalBrain.Testing" />` already present; add nothing

Compatibility shims on `TestBrain` for the sweep period (delete in Task 20): `WithHttpEdge()` (no-op, HTTP is always on), `WithPartLog()` (maps to `WithConfiguration($"{PartsOptions.Key}:Role", "machine")` plus the mesh seeding the old `ProvisionMachineAsync` did — move that method onto `InProcessBrain` as `ProvisionMachineAsync` called when the role is set), `ConfigureSilo(Action<ISiloBuilder>)` → wraps `ConfigureServices` by invoking the action on a capturing `ISiloBuilder` shim whose `Services` is the host collection (the old `FakeSilo` from Task 2 generalised), `ConfigureClient`, `SiloServices` property on `ITestBrain` as `[Obsolete] IServiceProvider SiloServices => Services`.

- [ ] **Step 1:** Make the changes; build every test project that references `DigitalBrain.Testing.Module` (the list is in `TestTierFacts`'s `ModuleTestProjects()`; run `dotnet build` on each csproj under `src/DigitalBrain.Modules/**/tests/*.Tests/` and the `*.Tests.Unit` projects of Framework, Platform, Client, Mcp, OS).
- [ ] **Step 2:** Run every one of those suites. Each must pass or be listed in the commit body as a known break with the failing fact name; a break caused by a real harness gap is fixed in Task 6's target, never by a shim that re-adds a second host.
- [ ] **Step 3:** Commit.

```bash
git commit -m "Testing.Module: alias over DigitalBrain.Testing; the Orleans test cluster and HTTP edge bridge are gone"
```

### Task 8: `Person` replaces the identity ritual

**Files:**
- Create: `src/Testing/DigitalBrain.Testing/Identity/Person.cs`
- Modify: `src/Testing/DigitalBrain.Testing/Http/People.cs` (keep `Send`; `SignedIn` becomes `Person.RegisterAsync`'s body)
- Modify: `ITestBrain` gets `Task<Person> PersonAsync(string name, CancellationToken ct = default)` and `Person Owner { get; }` (the Open posture's synthetic owner, `owner`/`owner`, no cookie)
- Test: `src/Testing/DigitalBrain.Testing.Tests/PersonFacts.cs`

**Interfaces:**

```csharp
public sealed class Person
{
    public string PrincipalId { get; }
    public string AccountId { get; }
    public string BrainId { get; }
    public HttpClient Http { get; }                  // cookie session; for Owner, the brain's plain client
    public string Key(string suffix) => $"{BrainId}/{suffix}";   // neuron ids inside this person's brain
    public IDisposable AsCaller();                   // stamps CallerContext as the authenticated edge would; restores on dispose
}
```

- [ ] **Step 1: Failing facts (Review Focus 3)**

```csharp
public sealed class PersonFacts
{
    [Fact]
    public async Task TheOpenPostureOwnerIsAvailableWithoutRegistering()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<PulseModule>().StartAsync(ct);
        Assert.Equal("owner", brain.Owner.PrincipalId);
        Assert.Equal("owner", brain.Owner.BrainId);
        using (brain.Owner.AsCaller()) { Assert.Equal("owner", BrainScope.CurrentId()); }
    }

    [Fact]
    public async Task ARegisteredPersonOwnsABrainAndCallsAsItsOwner()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await TestBrain.Create().WithModule<PulseModule>().StartAsync(ct);
        var alice = await brain.PersonAsync("alice", ct);
        using var session = await alice.Http.GetAsync("/identity/session", ct);
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        using (alice.AsCaller())
        {
            Assert.Equal(alice.BrainId, BrainScope.CurrentId());
            var self = await brain.Get<IBrain>(alice.BrainId).Read();
            Assert.Equal(alice.AccountId, self.Owner.AccountId);
        }
        Assert.Null(Orleans.Runtime.RequestContext.Get(CallerContextStamper.RequestContextKey));
    }
}
```

Match `IBrain.Read()`'s real snapshot shape (LSP on `IBrain`).

- [ ] **Step 2: Implement** `Person.RegisterAsync` through `/identity/register` exactly as `People.SignedIn` does today; `AsCaller()` stamps `new CallerContext { PrincipalId, AccountId, BrainId, Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp }` and restores the previous `RequestContext` value on dispose (the body of `UserConnections.UseBrain`).
- [ ] **Step 3:** Run `dotnet test --project src/Testing/DigitalBrain.Testing.Tests`; commit.

```bash
git commit -m "Testing: Person — a registered account with its brain, AsCaller() replaces hand-stamped callers"
```

### Task 9: `DigitalBrain.Testing.Aspire` — the Aspire target behind `ITestBrain`

**Files:**
- Create project: `src/Testing/DigitalBrain.Testing.Aspire/DigitalBrain.Testing.Aspire.csproj` (packable; references `DigitalBrain.Testing`, `Aspire.Hosting.Testing`, `DigitalBrain.Aspire.Hosting`, `Microsoft.Orleans.Client`, `Microsoft.Orleans.Clustering.AzureStorage`)
- Move from `DigitalBrain.Testing.E2E`: `Hosted/AspireTestSession.cs`, `Hosted/PrivateTestConfiguration.cs`, `Host/SharedBrainFixture.cs` (becomes `SharedBrain`, no xunit), `Host/DurableStorageVolume.cs`, `Diagnostics/*` (OTLP collector, trace assertions, telemetry collector)
- Create: `src/Testing/DigitalBrain.Testing.Aspire/AspireTarget.cs`:

```csharp
public sealed class AspireTarget<TAppHost> : ITestTarget where TAppHost : class
{
    public async Task<ITestBrain> StartAsync(TestBrainPlan plan, CancellationToken ct)
    {
        if (plan.Modules.Count > 0) { throw new NotSupportedException("The AppHost owns composition; use WithOptions/WithIntegration on an Aspire target."); }
        if (plan.Services is not null) { throw new NotSupportedException("ConfigureServices is in-process only; put a fake behind WithIntegration."); }
        var session = await AspireTestSession.StartAsync<TAppHost>(args: [...clusterId, persistent=false, option overrides from plan.Configuration keys under DigitalBrain:Modules:], plan.Execution with PrivateConfiguration = plan.Configuration minus the option keys, ct);
        return new AspireBrain(session);
    }
}
```

- `TestBrain.WithOptions<TModule,TOptions>` on an Aspire target produces the `ReplaceOptions=true` + flattened keys exactly as `E2ETestBuilder.ConfigureModule` does today; implement that flattening once in `TestComposition` and have both targets consume it (in-process: `ModuleDefinition.Settings`; Aspire: command-line overrides).
- `AspireBrain : ITestBrain` — `Services` throws `NotSupportedException`, `RestartAsync` throws `NotSupportedException` (an Aspire restart is `IDeployment.Restart`, a product act), `DeactivateAsync` through `IManagementGrain.ForceActivationCollection(TimeSpan.Zero)` scoped to the grain's type is not available — throw `NotSupportedException` with that sentence; `PersonAsync` identical to in-process (HTTP register).
- Delete: `Build/DigitalBrain.Testing.E2E.targets`, `Build/ModuleBuilderFactory.cs`, the `Directory.Build.targets` import of them, `AspireTestSession.StartAsync(TestExecutionOptions, Action<IDistributedApplicationTestingBuilder>…)` and `CreateModuleBuilder`
- Test: `src/Testing/DigitalBrain.Testing.Tests/AspireTargetFacts.cs` — plan validation only (no boot): the two `NotSupportedException` facts above, and the Review Focus 4 fact:

```csharp
[Fact]
public async Task AnIntegrationValueWithSeparatorsTravelsInThePrivateFileVerbatim()
{
    var value = "Host=db;Username=u;Password=p=q";
    await using var file = await PrivateTestConfiguration.CreateAsync(new Dictionary<string, string?> { [IntegrationSchema.Key("postgres", "ConnectionString")] = value }, TestContext.Current.CancellationToken);
    var json = JsonDocument.Parse(await File.ReadAllTextAsync(file.FilePath));
    Assert.Equal(value, json.RootElement.GetProperty(IntegrationSchema.Key("postgres", "ConnectionString")).GetString());
}
```

- [ ] **Step 1:** Write the facts; **Step 2:** move and implement; **Step 3:** `dotnet test --project src/Testing/DigitalBrain.Testing.Tests`; **Step 4:** commit.

```bash
git commit -m "Testing.Aspire: the Aspire target behind ITestBrain; reflected builder factory and build-transitive targets removed"
```

### Task 10: `DigitalBrain.Testing.Playwright` and `DigitalBrain.OS.Testing`

**Files:**
- Create project `src/Testing/DigitalBrain.Testing.Playwright` (packable; `Microsoft.Playwright`; references `DigitalBrain.Testing.Aspire`); move `Browser/*` from `Testing.E2E`; `E2EBrain.OpenBrowserAsync` becomes `public static Task<BrowserSession> OpenBrowserAsync(this ITestBrain brain, CancellationToken ct)` resolving the browser endpoint from `AspireBrain` (internal accessor) and throwing on other targets.
- Create project `src/DigitalBrain.OS/DigitalBrain.OS.Testing` (not packable, namespace `DigitalBrain.OS.Testing`; references `DigitalBrain.Testing.Playwright`, `DigitalBrain.AppHost` with `IsAspireProjectResource=false`, `DigitalBrain.OS`, `Npgsql`, `xunit.v3.extensibility.core`); move `DigitalBrain.Testing.Reference/*` and `Testing.E2E/Demo/TwitterFakes.cs` here; `ReferenceBrain.Create()` returns `TestBrain` on `new AspireTarget<Projects.DigitalBrain_AppHost>()`; `BrainFact` uses `brain.Owner`/`PersonAsync` and keeps `ResetShellStateAsync`.
- Delete projects: `DigitalBrain.Testing.E2E`, `DigitalBrain.Testing.Reference`. Update `DigitalBrain.slnx`, the E2E test csprojs (`Framework.Tests.E2E`, `OS.Tests.E2E`, `Platform.Tests.E2E`, `Aspire.Hosting.Tests.E2E`) to reference `DigitalBrain.OS.Testing`, and `Directory.Build.props` (`<Using Include="DigitalBrain.Testing.E2E" />` → `DigitalBrain.Testing.Aspire` and `DigitalBrain.OS.Testing` for `.Tests.E2E`).
- `E2EBrowser` csproj flag stays (CI reads it).

- [ ] **Step 1:** Move; `dotnet build` the four E2E test projects and `DigitalBrain.OS.Tests.Unit` (it referenced `Testing.E2E` for `SolutionProjects`; move `SolutionProjects.cs` helper into `DigitalBrain.OS.Testing`).
- [ ] **Step 2:** Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E` (the smallest E2E suite; it boots the AppHost) — must pass; kill at 5 minutes and debug the boot stage printed by `[aspire-boot]`.
- [ ] **Step 3:** Commit.

```bash
git commit -m "Testing: Playwright package; product-only helpers move to DigitalBrain.OS.Testing; Testing.E2E and Testing.Reference deleted"
```

### Task 11: Architecture rules for the new shape

**Files:**
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/TestTierFacts.cs` (`productScope` and tier names updated to `DigitalBrain.Testing.Aspire`/`DigitalBrain.OS.Testing`; `TestTierBaseline.json` `LegacyFullStackBootFacts` emptied by fixing `E2EBoundaryFacts`)
- Create: `src/Testing/DigitalBrain.Architecture.Tests/TestingPackageFacts.cs`

```csharp
public sealed class TestingPackageFacts
{
    [Fact] public void NoTestProjectReferencesTheOrleansTestingHost()
    { foreach (var project in Repository.TestProjects()) Assert.DoesNotContain("Microsoft.Orleans.TestingHost", PackageReferences(project)); }

    [Fact] public void PackableTestingProjectsReferenceNoPlatformInternalsOsOrAppHost()
    { foreach (var name in new[] { "DigitalBrain.Testing", "DigitalBrain.Testing.Aspire", "DigitalBrain.Testing.Playwright" })
        Assert.DoesNotContain(References(Repository.ProjectNamed(name).Path), r => r is "DigitalBrain.OS" or "DigitalBrain.AppHost"); }

    [Fact] public void NoTestOutsideTheHarnessStampsACallerByHand()
    { var offenders = Repository.ProjectFiles("*.cs").Where(f => !f.Contains(Path.Combine("src", "Testing")) && File.ReadAllText(f).Contains("CallerContextStamper" + ".Stamp(")).ToArray();
      Assert.True(offenders.Length == 0, "Use Person.AsCaller(): " + string.Join(", ", offenders)); }

    [Fact] public void OnlyTheOrleansModuleReferencesAzureStorageForOrleans()
    { foreach (var project in Repository.Projects.Values.Where(p => p.Name != "DigitalBrain.Modules.Microsoft.Orleans"))
        Assert.DoesNotContain(PackageReferences(project.Path), p => p.StartsWith("Microsoft.Orleans.", StringComparison.Ordinal) && p.EndsWith(".AzureStorage", StringComparison.Ordinal)); }
}
```

Add `Repository.TestProjects()` and `PackageReferences(string csproj)` helpers in `Repository.cs` (same XDocument shape as `References`). The caller-stamp fact is red until the sweep finishes; add the offending projects to a new `TestTierBaseline.json` list `LegacyHandStampedCallers` that each sweep task removes its project from, so the fact is green at every commit.

- [ ] Run `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`; commit.

```bash
git commit -m "Architecture: testing package boundaries, no Orleans TestingHost, callers stamped only through Person"
```

---

## Phase 3: product verification before the sweep

### Task 12: The whole product on the new recipe

- [ ] `dotnet run digitalbrain.cs`; `mcp__aspire__list_resources` all Healthy (Azurite tables/blobs under the `Modules` brain node, OS, MCP instances, fronts, shell).
- [ ] Through `digitalbrain-mcp`: `neurons_context`, `neurons_get owner/orleans/cluster` returns the OS silo with `Status: Active`; `neurons_call` an app operation (`owner/apps/calculator`, `open`) and read the workspace neuron.
- [ ] `list_traces` shows `orleans.cluster` `Read` spans; `list_structured_logs` no errors at Warning or above from `DigitalBrain.*`.
- [ ] Run `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` (shared fixture; kill at 5 minutes per fact, not per boot — the boot prints its stages).
- [ ] Note in `docs/superpowers/specs/2026-10-10-one-host-testing-design.md` under a `## Verified` heading the date and the three observations above. Commit the spec only.

---

## Phase 4: per-module test simplification (Opus subagents)

### Sweep brief (the full prompt every sweep task sends; the task adds only its project paths and known facts)

```
You are simplifying one DigitalBrain test project against the harness in src/Testing/DigitalBrain.Testing.
Read first: docs/superpowers/specs/2026-10-10-one-host-testing-design.md §3 and §4, CLAUDE.md,
src/Testing/DigitalBrain.Testing/TestBrain.cs, ITestBrain.cs, Identity/Person.cs, Model/FakeModelServer.cs,
and src/Testing/DigitalBrain.Testing.Tests/TestBrainFacts.cs as the reference style.

Project: <path>. Module under test: <path>. Known: <facts from the task>.

Rules, in order, applied to every file:
1. Boot through TestBrain.Create()...StartAsync(ct). Delete fixtures that only wrap a boot; keep a
   collection fixture only when the suite shares one brain for speed, and then it holds an ITestBrain.
2. Delete every CallerContextStamper.Stamp, RequestContext.Remove, AuthorizeCallerAsync, ProvisionOwner,
   IBrain.Create(new Owner(...)). Use brain.Owner or await brain.PersonAsync("name", ct), person.Key("…")
   for neuron ids, person.AsCaller() around direct grain calls, person.Http for routes.
3. Replace IntegrationSchema.Key("x","F") string config and AddInMemoryCollection with
   .WithIntegration(XModule.Integration, "F", value). If the module has no public Integration schema
   property, add one on the module (public static IntegrationSchema Integration) — that is a module fix, do it.
4. Replace ConfigureSilo DI swaps that stand in for an external system (chat clients, token endpoints,
   session hosts, database providers) with a wire-level fake in the test project (an HttpMessageHandler
   or a loopback Kestrel server like FakeModelServer) selected by WithIntegration. Keep ConfigureServices
   only for TimeProvider, IScriptSandbox and storage-fault injection, and say why in a one-line comment.
5. Replace TestWait.UntilAsync / Task.Delay / while-loops over Read() with brain.Observe<TSignal>(neuron)
   and probe.NextAsync. If the neuron changes state without publishing, add the signal to the module's
   contracts and publish it — that is the module fix the test was missing.
6. One fact per behavior; sentence-shaped names; TestContext.Current.CancellationToken; no [Fact(Timeout)]
   unless the fact boots a container; no sleeps.
7. Delete facts that test the harness, Orleans mechanics or the DI container rather than the module.
   List each deleted fact name and the reason in your final report.
8. Services/SiloServices reach-through only to read a module singleton a fact asserts on.
9. Remove the project's name from LegacyHandStampedCallers in
   src/Testing/DigitalBrain.Architecture.Tests/TestTierBaseline.json.
10. Shrink the csproj: reference DigitalBrain.Testing (not .Module), drop ProjectReferences the facts no longer use.

Method: LSP only for code navigation (goToDefinition/findReferences/documentSymbol); never grep for code.
After each file: csharp-ls diagnostics clean. Then: dotnet build <test csproj>; dotnet test --project <test dir>.
Kill any test run over 5 minutes and debug; never raise a timeout or add polling. If a fact cannot pass
without a module change, make the module change (it is in scope) and run the module's other suites too.
Commit explicit files with a message starting "<Module> tests: " and ending with
"Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>".
Report: facts before/after, files deleted, module fixes made, rules you could not apply and why.
```

Each sweep task: `Agent(subagent_type: "general-purpose", model: "opus", prompt: <brief + project lines>)`. Run up to four in parallel when their modules do not reference each other (the dependency table is the module csproj `ProjectReference`s; AI, Apps, Flutter and CSharp reference each other and run serially after the independent ones).

### Task 13: Independent modules, batch 1 (parallel)

- [ ] Time — `src/DigitalBrain.Modules/Time/tests/DigitalBrain.Modules.Time.Tests` (7 files, 562 lines). Known: `TimeTestControls` decorates `ITimerRegistry`/`IReminderRegistry` through `ConfigureSilo`; keep as `ConfigureServices` with the rule-4 comment; `WithReminders()` calls are deleted (memory reminders are always on).
- [ ] Qdrant — `src/DigitalBrain.Modules/Qdrant/tests/DigitalBrain.Modules.Qdrant.Tests` (1 file).
- [ ] Supabase — `src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests` (2 files); `Tests.Hosting` untouched.
- [ ] ClickHouse — `src/DigitalBrain.Modules/ClickHouse/tests/DigitalBrain.Modules.ClickHouse.Tests` (5 files). Known: `silo.Configuration[IntegrationSchema.Key("clickhouse","ConnectionString")]` and `FakeClickHouseProvider` singleton — rule 3 and 4.

### Task 14: Independent modules, batch 2 (parallel)

- [ ] Gmail — `src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests` (7 files). Known: `GmailHostFixture` + `TokenEndpointStub` is already the right shape; it becomes `TestBrain...WithIntegration(GmailModule.Integration …)` and the `IGmailPushAuthenticator` swap stays (`ConfigureServices`, rule 4 comment).
- [ ] GitHub — `src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests` (5 files). Known: `FakeGitHubRepositorySource`.
- [ ] Salesforce — `src/DigitalBrain.Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests` (2 files).
- [ ] Windows — `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests` (4 files).

### Task 15: Independent modules, batch 3 (parallel)

- [ ] Playwright — `src/DigitalBrain.Modules/Microsoft/Playwright/tests/DigitalBrain.Modules.Microsoft.Playwright.Tests` (5 files).
- [ ] Mcp — `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/tests/DigitalBrain.Modules.Mcp.Tests` (1 file).
- [ ] ArtCraft — `src/DigitalBrain.Modules/ArtCraft/ArtCraft/tests/DigitalBrain.Modules.ArtCraft.Tests` (1 file).
- [ ] Tools, Circles — `src/DigitalBrain.Modules/DigitalBrain/Tools/tests/DigitalBrain.Modules.Tools.Tests`, `src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests`.
- [ ] Orleans — `src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests` (from Task 2; move to `DigitalBrain.Testing`, add a fact that `ICluster.Read()` on an in-process brain reports one active silo).

### Task 16: Postgres, Aspire module (parallel)

- [ ] Postgres — `src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests` (14 files, 1532 lines). Known: connection-string integration keys; tables slot; `DemoDatabase` fake provider used from AI tests too — make the fake a wire-level one only if a loopback Postgres is not required; otherwise keep `ConfigureServices` with the rule-4 comment.
- [ ] Aspire — `src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests` (13 files, 1840 lines). Known: `FakeClusterHost`, `FakeCandidateHost`, `FakeVerifier` are process-level seams (Docker, Aspire CLI), keep via `ConfigureServices`; the neuron is now `IDeployment`.

### Task 17: CSharp, then Apps (serial: Apps references CSharp)

- [ ] CSharp — `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests` (34 files, 3362 lines). Known: `FakeSessionHost : HttpMessageHandler` and `FakeBrainEdge` are the right shape; select the session host by `WithIntegration(CSharpModule.Integration, "SessionHost", FakeSessionHost.Url)` through a named `HttpClient` the module already resolves (LSP `findReferences` on the handler registration to confirm), `RunTokenKey` stays harness-provided.
- [ ] Apps — `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` (35 files, 3520 lines). Known: `Support/Caller.cs`, `Support/AppOwner.cs` are hand-stamped callers → `Person`; `FlakyGrainStorage` stays (`ConfigureServices`); `IScriptSandbox` fakes stay; `FeatureFixture/` folder is data.

### Task 18: Flutter, then AI (serial: AI references Flutter, Apps, CSharp, Postgres, Time, Windows, Mcp, Playwright, Tools)

- [ ] Flutter — `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests` (54 files, 3257 lines). Known: `FlutterHostFixture.Workspace()` → `PersonAsync` per fact; `WithHttpEdge` deleted; Dart mirrors unchanged unless a record changes.
- [ ] AI — `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests` (46 files, 4362 lines). Known: `StubChatClient` via `ConfigureSilo` → `FakeModelServer` + `WithFakeModel` (rule 4, the pattern already exists here); `Configure<AIOptions>` via silo → `WithOptions<AIModule, AIOptions>`; `IGrainStorage` fault injection stays; `ILoopProbe` `CompiledTypes` singleton stays with a comment.

### Task 19: Non-module suites (parallel)

- [ ] `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit` (29 files). Known: `InstanceRegistrationFacts` asserts kernel registration through `SiloServices` — rule 8 allows reading it.
- [ ] `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit` (59 files, 5724 lines). Known: `TokenEndpointStub`, `TimeProvider.Testing`, gRPC client facts; identity facts register people through HTTP already.
- [ ] `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit`, `DigitalBrain.Client.Tests.Unit`, `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit`.
- [ ] `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` (15 files). Known: `OsBootFacts.Establish` is the identity ritual → `PersonAsync`; `FeatureCompileFacts` keeps `WithModule<CSharpModule>()` and reads the sandbox through `Services`.
- [ ] E2E suites — `DigitalBrain.OS.Tests.E2E`, `DigitalBrain.Framework.Tests.E2E`, `DigitalBrain.Platform.Tests.E2E`, `DigitalBrain.Aspire.Hosting.Tests.E2E`: rules 2, 5, 6, 7 only (composition is the AppHost's); `Caller.cs` in OS E2E → `Person`; `ProductE2E.WaitUntilShippedAsync` polling → `Observe<AppChanged>` (add the signal to `IApp` if missing).

---

## Phase 5: close

### Task 20: Delete the compatibility shims and the Module project

**Files:**
- Delete project `src/Testing/DigitalBrain.Testing.Module` (and `BrainIdentityExtensions.cs`); remove from `DigitalBrain.slnx` and `Directory.Build.props` (`<Using Include="DigitalBrain.Testing.Module" />`).
- Modify: `TestBrain.cs` — delete `WithHttpEdge`, `WithPartLog` (replace the five callers with `WithConfiguration($"{PartsOptions.Key}:Role", "machine")`), `WithReminders`, `ConfigureSilo`, `ConfigureClient`; `ITestBrain` loses `SiloServices`.
- Modify: `TestTierBaseline.json` — `LegacyHandStampedCallers` must be `[]`; delete the list and its reading code in `TestingPackageFacts`.

- [ ] LSP `findReferences` on each deleted member must return only its definition before deleting.
- [ ] Build every test project; run `dotnet test --project` on every suite listed in Phase 4 (serially, each under five minutes).
- [ ] Commit.

```bash
git commit -m "Testing: compatibility shims and DigitalBrain.Testing.Module removed; one harness"
```

### Task 21: Packages and CI

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj`, `DigitalBrain.Testing.Aspire.csproj`, `DigitalBrain.Testing.Playwright.csproj` — `Description`, `PackageTags` (`testing;orleans;aspire;digitalbrain`), `README.md` per package (`PackageReadmeFile`), each README showing the `TestBrain.Create()` example from the spec §3 and the target choice.
- `.github/workflows/ci.yml` stays as it is: its `dotnet pack DigitalBrain.slnx` step already packs every `IsPackable` project, so the three testing packages are validated on every push once their csprojs are packable.

- [ ] Run: `dotnet pack src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj -c Release -o artifacts && dotnet pack src/Testing/DigitalBrain.Testing.Aspire/DigitalBrain.Testing.Aspire.csproj -c Release -o artifacts && dotnet pack src/Testing/DigitalBrain.Testing.Playwright/DigitalBrain.Testing.Playwright.csproj -c Release -o artifacts`
  Expected: three `.nupkg` and three `.snupkg`, no NU5xxx warnings.
- [ ] Unzip `artifacts/DigitalBrain.Testing.<version>.nupkg` and confirm the `.nuspec` dependencies list no `DigitalBrain.OS`, no `DigitalBrain.AppHost`, no `Microsoft.Orleans.TestingHost`.
- [ ] Update `CLAUDE.md` "Module shape" and "Verification loop" lines: tests use `TestBrain.Create().WithModule<XModule>()` from `src/Testing/DigitalBrain.Testing`; hosting facts use `DigitalBrain.Aspire.Testing`; E2E uses `DigitalBrain.Testing.Aspire` and `DigitalBrain.OS.Testing`. Update the memory file `C:\Users\vhorb\.claude\projects\E--intochat-digitalbrain\memory\` with one `project` note "one host recipe, one harness" linking the spec.
- [ ] Commit.

```bash
git commit -m "Testing packages: DigitalBrain.Testing, .Aspire, .Playwright ready to publish; CLAUDE.md updated"
```

### Task 22: Final verification

- [ ] `dotnet run digitalbrain.cs`; all resources Healthy; drive `owner/orleans/cluster` and one app operation through `digitalbrain-mcp`; `list_traces` shows the spans.
- [ ] Every suite in Phase 4 green, each run under five minutes; `DigitalBrain.Architecture.Tests` green with an empty `TestTierBaseline.json`.
- [ ] Counts re-measured (text search, non-code): `CallerContextStamper.Stamp` outside `src/Testing` = 0; `ConfigureSilo` = 0; `SiloServices` = 0; `AddInMemoryCollection` in test projects = 0; `TestWait.UntilAsync` ≤ 5 with a comment each.
- [ ] Open the PR against `master` with the spec and plan linked; description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
