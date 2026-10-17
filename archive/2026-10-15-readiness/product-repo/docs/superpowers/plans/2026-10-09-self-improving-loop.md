# Self-Improving Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The brain changes its own source, runs the new revision as a sibling cluster (own Orleans service id, cluster id, storage container and ports), verifies the sibling from the current brain over MCP, and hands over through a launcher that owns ports 5080/5081: the verified revision becomes current, the old one stops.

**Architecture:** A `DigitalBrain.Launcher` process outside Aspire owns the canonical ports and reverse-proxies them (YARP in-memory config) to the current revision; it creates git worktrees, commits change sets, copies the current Azurite blob container to `brain-r{sha}`, starts `aspire run` per revision with its identity in environment variables, and flips the proxy on promote. A `revisions` module (`IRevision` keyed `{brain}/revisions/{sha}`, `IRevisions` keyed by brain) is the stage machine; it talks to the launcher through `ILauncherClient` and verifies the child through `IRevisionVerifier`, which drives the child's MCP over HTTP JSON-RPC and reads the child's `IAspire` state through that same MCP. The `os/selfimprove` app is one synapse per reaction. The AppHost is unchanged apart from reading service id, cluster id and the grain-state container from configuration.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans 10.3.1 grains, Aspire 13.6.0 (`aspire run --non-interactive`), YARP `Yarp.ReverseProxy` 2.3.0 (`LoadFromMemory` + `InMemoryConfigProvider.Update`), `Azure.Storage.Blobs` 12.30.0 (`StartCopyFromUriAsync` per blob, Azurite well-known account), ModelContextProtocol 2.2.0 over HTTP (stateless `tools/call`), xunit v3 facts over `ModuleTest.Create().WithModule<…>()`.

**Spec:** docs/superpowers/specs/2026-10-09-self-improving-loop-design.md

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- LSP for all code work: `findReferences` on every symbol you change before editing; LSP diagnostics clean before building. Never grep for code.
- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`). No `/// <summary>` boilerplate; inline comments only for what code cannot say.
- Concrete arrays and `Dictionary` in grain state (`[GenerateSerializer]` records), never `IReadOnlyList`.
- No state compatibility: new grain states are shaped freely, no migrations.
- No self-calls on non-reentrant grains; one-way self work goes through `this.AsReference<T>()`.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; never raise a timeout or add polling to make a check pass. The verification budget comes from the plan, never from a global timeout.
- A synapse is one `await foreach` over one `brain.On<T>(source)`; an app's own operations arrive as `AppRequested`; a result is neuron state.
- Module shape: `DigitalBrain.Modules.Revisions.Contracts` references only `src/DigitalBrain`; the module references `DigitalBrain.Framework`; tests use `DigitalBrain.Testing.Module`.
- Scripts never see the launcher: `ILauncherClient` lives in the module project, not in Contracts.
- Commit explicit files only (`git add <paths>`), never a directory. End commit messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Every shipped OS app compiles: `OsShippedAppFacts.EveryOsProgramCompilesAgainstCurrentContracts` stays green.

## Review Focus

1. The child must not share grain state with the parent: the AppHost must project `DigitalBrain:Orleans:GrainStateContainer` into the OS resource and `ServerHostingExtensions` must bind `AzureBlobStorageOptions.ContainerName` from it, defaulting to `digitalbrain-v2-state`. Pinned in Task 1 (`TheGrainStateContainerComesFromConfigurationWithTheV2Default`).
2. `Promote` without a `Verified` stage in the revision's history must throw `InvalidOperationException` and publish nothing. Pinned in Task 3 (`PromoteIsRefusedBeforeVerification`).
3. One live revision per brain: a second `IRevisions.Propose` while one is `Started` stays `Queued` and starts only after the live one ends in `Promoted`, `Failed` or `Discarded`. Pinned in Task 3 (`ASecondProposalQueuesUntilTheLiveRevisionEnds`).
4. The launcher's promote must flip the proxy before stopping the previous current, and `revisions.json` must name the new current before the stop; a stop failure must not roll back the flip. Pinned in Task 2 (`PromoteFlipsTheProxyThenStopsThePreviousCurrent`).
5. A plan expectation mismatch must produce `RevisionFailed(Stage: Verifying, Reason)` naming the failed check, and a budget overrun must produce the same stage with reason `budget` and never a retry. Pinned in Task 4 (`AMismatchedExpectationNamesTheCheckThatFailed`, `ExceedingTheBudgetFailsTheVerifyStageOnce`).

---

### Task 1: Service id, cluster id and grain-state container come from configuration with the `intochat` default

**Files:**
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Hosting/DigitalBrainNames.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs`
- Modify: `src/DigitalBrain.AppHost/AppHost.cs`
- Test: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/DeploymentIdentityFacts.cs`

**Interfaces:**
- Consumes: `DigitalBrainHostingOptions.ServiceIdKey` (`Orleans:ServiceId`), `DigitalBrainHostingOptions.ClusterIdKey` (`Orleans:ClusterId`), `DigitalBrainNames.GrainStateContainer`, `AzureBlobStorageOptions` (Orleans).
- Produces:
  - `public static DigitalBrainHostingOptions DigitalBrainHostingOptions.Named(IConfiguration configuration, string defaultIdentity, bool useAzureStorage)` — `ServiceId = configuration[ServiceIdKey] ?? defaultIdentity`, `ClusterId = configuration[ClusterIdKey] ?? defaultIdentity`, `GrainStateContainer = configuration[GrainStateContainerKey] ?? DigitalBrainNames.GrainStateContainer`.
  - `public const string DigitalBrainHostingOptions.GrainStateContainerKey = "DigitalBrain:Orleans:GrainStateContainer"`, `public string? GrainStateContainer { get; init; }`, `public string GrainStateContainer` on `DigitalBrainBuilder`.
  - `public const string DigitalBrainNames.GrainStateContainerKey = "DigitalBrain:Orleans:GrainStateContainer"`.
  - `WithReference(brain)` projects `DigitalBrain__Orleans__GrainStateContainer` to the silo resource; `AddDigitalBrainServer` binds `AzureBlobStorageOptions.ContainerName` from that key.

- [ ] **Step 1: Write the failing hosting facts**

Add to `DeploymentIdentityFacts.cs`:

```csharp
[Fact]
public void ServiceIdAndClusterIdComeFromConfigurationWithTheIntoChatDefault()
{
    var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [], DisableDashboard = true });
    var defaults = builder.AddDigitalBrain("Modules", DigitalBrainHostingOptions.Named(builder.Configuration, "intochat", useAzureStorage: false));
    Assert.Equal("intochat", defaults.ServiceId);
    Assert.Equal("intochat", defaults.ClusterId);
    Assert.Equal(DigitalBrainNames.GrainStateContainer, defaults.GrainStateContainer);

    builder.Configuration[DigitalBrainHostingOptions.ServiceIdKey] = "intochat-rabc1234";
    builder.Configuration[DigitalBrainHostingOptions.ClusterIdKey] = "intochat-rabc1234";
    builder.Configuration[DigitalBrainHostingOptions.GrainStateContainerKey] = "brain-rabc1234";
    var revision = builder.AddDigitalBrain("Revision", DigitalBrainHostingOptions.Named(builder.Configuration, "intochat", useAzureStorage: false));
    Assert.Equal("intochat-rabc1234", revision.ServiceId);
    Assert.Equal("intochat-rabc1234", revision.ClusterId);
    Assert.Equal("brain-rabc1234", revision.GrainStateContainer);
}

[Fact]
public async Task TheSiloReceivesTheGrainStateContainerItMustOpen()
{
    var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [], DisableDashboard = true });
    builder.Configuration[DigitalBrainHostingOptions.GrainStateContainerKey] = "brain-rabc1234";
    var brain = builder.AddDigitalBrain("Modules", DigitalBrainHostingOptions.Named(builder.Configuration, "intochat", useAzureStorage: true) with { PersistentStorage = false });
    var silo = builder.AddExecutable("silo", "unused", ".").WithReference(brain);
    var environment = await DigitalBrain.Aspire.Testing.AspireCompositionTest.EnvironmentOf(builder, silo.Resource, TestContext.Current.CancellationToken);
    Assert.Equal("brain-rabc1234", environment[DigitalBrainConfiguration.EnvironmentName(DigitalBrainNames.GrainStateContainerKey)]);
}

[Fact]
public void TheGrainStateContainerComesFromConfigurationWithTheV2Default()
{
    var host = global::Microsoft.Extensions.Hosting.Host.CreateApplicationBuilder();
    host.Configuration[DigitalBrainNames.GrainStateContainerKey] = "brain-rabc1234";
    host.Configuration[AuthOptions.PostureKey] = "Open";
    DigitalBrain.Aspire.Server.ServerHostingExtensions.AddDigitalBrainServer(host, server => server.UseAzureStorage());
    using var provider = host.Services.BuildServiceProvider();
    var options = provider.GetRequiredService<IOptionsMonitor<Orleans.Configuration.AzureBlobStorageOptions>>().Get(DigitalBrainNames.DefaultGrainStorage);
    Assert.Equal("brain-rabc1234", options.ContainerName);
}
```

`DigitalBrainHostingOptions` is a class with `init` setters: make it a `sealed record class` so `with` compiles (the only construction sites are `new DigitalBrainHostingOptions { ... }` object initializers, which records keep; confirm with `findReferences`).

- [ ] **Step 2: Run the facts and watch them fail**

`dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit -- --filter-method "*GrainStateContainer*" --filter-method "*IntoChatDefault*"`
Expected: compile errors `'DigitalBrainHostingOptions' does not contain a definition for 'Named'`, `'GrainStateContainerKey'`.

- [ ] **Step 3: Implement the options, names and projection**

`DigitalBrainHostingOptions.cs`:

```csharp
using Microsoft.Extensions.Configuration;

namespace DigitalBrain.Aspire.Hosting;

public sealed record DigitalBrainHostingOptions
{
    public const string ServiceIdKey = "Orleans:ServiceId";
    public const string ClusterIdKey = "Orleans:ClusterId";
    public const string GrainStateContainerKey = DigitalBrain.Framework.DigitalBrainNames.GrainStateContainerKey;
    public const string PersistentStorageKey = "DigitalBrain:Hosting:PersistentStorage";
    public const string EnvironmentKey = "DigitalBrain:Hosting:Environment";

    public string? ServiceId { get; init; }
    public string? ClusterId { get; init; }
    // The blob container the default grain storage opens; a revision runs in its own copy.
    public string? GrainStateContainer { get; init; }
    public bool UseAzureStorage { get; init; }
    public bool PersistentStorage { get; init; } = true;
    public string? DataVolume { get; init; }
    public string? Environment { get; init; }

    // A deployment's identity: configuration first, then the name the product calls itself.
    public static DigitalBrainHostingOptions Named(IConfiguration configuration, string defaultIdentity, bool useAzureStorage)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentException.ThrowIfNullOrWhiteSpace(defaultIdentity);
        return new()
        {
            ServiceId = configuration[ServiceIdKey] ?? defaultIdentity,
            ClusterId = configuration[ClusterIdKey] ?? defaultIdentity,
            GrainStateContainer = configuration[GrainStateContainerKey] ?? DigitalBrain.Framework.DigitalBrainNames.GrainStateContainer,
            UseAzureStorage = useAzureStorage,
        };
    }
}
```

`DigitalBrainNames.cs`: add `public const string GrainStateContainerKey = "DigitalBrain:Orleans:GrainStateContainer";` beside `GrainStateContainer`.

`DigitalBrainBuilder` (`Composition/DigitalBrainBuilder.cs`): add `public required string GrainStateContainer { get; init; }` next to `ServiceId`/`ClusterId`; in `AddDigitalBrain` set it on both constructions: `GrainStateContainer = options.GrainStateContainer ?? builder.Configuration[DigitalBrainHostingOptions.GrainStateContainerKey] ?? DigitalBrainNames.GrainStateContainer`.

`DigitalBrainHostingExtensions.WithReference(brain)`: after the `GrainState` block add

```csharp
builder.WithEnvironment(DigitalBrainConfiguration.EnvironmentName(DigitalBrainNames.GrainStateContainerKey), brain.GrainStateContainer);
```

`ServerHostingExtensions.AddDigitalBrainServer`: replace the static `Configure` with

```csharp
silo.Services.AddOptions<AzureBlobStorageOptions>(DigitalBrainNames.DefaultGrainStorage)
    .Configure<IConfiguration>(static (options, configuration) =>
        options.ContainerName = configuration[DigitalBrainNames.GrainStateContainerKey] is { Length: > 0 } container ? container : DigitalBrainNames.GrainStateContainer);
```

`AppHost.cs`: replace `new DigitalBrainHostingOptions { ServiceId = "intochat", UseAzureStorage = true }` with `DigitalBrainHostingOptions.Named(builder.Configuration, "intochat", useAzureStorage: true)`.

- [ ] **Step 4: Run the facts and the existing suite**

`dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj`
`dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit`
Expected: all green, including `ClusterChangesDoNotMovePersistentState` (unchanged resolution order: explicit option, then configuration, then default).

- [ ] **Step 5: Commit**

```
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/Composition/DigitalBrainBuilder.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Hosting/DigitalBrainNames.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs src/DigitalBrain.AppHost/AppHost.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/DeploymentIdentityFacts.cs
git commit -m "Hosting: service id, cluster id and grain-state container from configuration, intochat default

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `DigitalBrain.Launcher` — revisions.json, YARP proxy on 5080/5081, HTTP API, process control, storage copy

**Files:**
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Program.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/LauncherOptions.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/Revision.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/RevisionsFile.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/Revisions.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/LauncherEndpoints.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Proxy/RevisionProxy.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/IProcessRunner.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/SystemProcessRunner.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/Git.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/AspireRun.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Storage/IStorageCopier.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Storage/AzuriteStorageCopier.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/DigitalBrain.Launcher.Tests.Unit.csproj`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeProcessRunner.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeStorageCopier.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionsFileFacts.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionsFacts.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionProxyFacts.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/LauncherEndpointFacts.cs`
- Modify: `Directory.Packages.props` (add `<PackageVersion Include="Yarp.ReverseProxy" Version="2.3.0" />`)
- Modify: `DigitalBrain.slnx` (add the two projects under a `/Launcher/` folder)

**Interfaces:**
- Consumes: `Yarp.ReverseProxy` (`AddReverseProxy().LoadFromMemory(routes, clusters)`, `InMemoryConfigProvider.Update(routes, clusters)`, `MapReverseProxy()`), `Azure.Storage.Blobs` (`BlobServiceClient`, `BlobContainerClient.GetBlobsAsync`, `BlobClient.StartCopyFromUriAsync`, `CopyFromUriOperation.WaitForCompletionAsync`), `System.Diagnostics.Process`, `git worktree add`, `aspire run --non-interactive`.
- Produces:
  - `public sealed record Revision(string Sha, string Branch, string Worktree, int UiPort, int McpPort, string State)` with `State` in `created|starting|healthy|current|stopped|failed`.
  - `public sealed record RevisionsDocument(string? Current, Revision[] Revisions)`; `RevisionsFile.Read(string path)` / `Write(string path, RevisionsDocument)`.
  - `public interface IProcessRunner { Task<ProcessResult> RunAsync(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string,string>? environment, CancellationToken ct); IRunningProcess Start(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string,string> environment); }`, `public sealed record ProcessResult(int ExitCode, string Output, string Error)`, `public interface IRunningProcess : IAsyncDisposable { int Id { get; } Task<int> Exited { get; } Task StopAsync(CancellationToken ct); }`.
  - `public interface IStorageCopier { Task CopyContainerAsync(string source, string destination, CancellationToken ct); }`.
  - `public sealed class Revisions` with `Task<Revision> ProposeAsync(string branch, string summary, IReadOnlyDictionary<string,string> files, CancellationToken ct)`, `Task<Revision> StartAsync(string sha, CancellationToken ct)`, `Task<Revision> WaitHealthyAsync(string sha, TimeSpan budget, CancellationToken ct)`, `Task<Revision> PromoteAsync(string sha, CancellationToken ct)`, `Task DiscardAsync(string sha, CancellationToken ct)`, `RevisionsDocument List()`.
  - `public sealed class RevisionProxy` with `void PointAt(int uiPort, int mcpPort)` and `(int UiPort, int McpPort)? Target`.
  - HTTP: `GET /revisions`, `POST /revisions` body `{branch, summary, files}` → 201 `Revision`; `POST /revisions/{sha}/start` → 200 `Revision`; `POST /revisions/{sha}/healthy?budget=00:05:00` → 200 `Revision` or 504 `{reason}`; `POST /revisions/{sha}/promote` → 200; `DELETE /revisions/{sha}` → 204; `GET /health` → 200.
  - `LauncherOptions`: `Repository` (path with `DigitalBrain.slnx`), `RevisionsPath` (default `revisions.json` beside the launcher), `ApiPort` (5079), `UiPort` (5080), `McpPort` (5081), `FirstBlockPort` (5090), `BlockSize` (10), `AzuriteBlobEndpoint` (default `http://127.0.0.1:10000/devstoreaccount1`), `CurrentContainer` (default `digitalbrain-v2-state`).

- [ ] **Step 1: Create the projects and the package version**

`Directory.Packages.props`: add `<PackageVersion Include="Yarp.ReverseProxy" Version="2.3.0" />` in the first `ItemGroup`.

`src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <RootNamespace>DigitalBrain.Launcher</RootNamespace>
    <Description>Owns ports 5080/5081, proxies them to the current revision and starts revisions on demand. Never runs brain code.</Description>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Yarp.ReverseProxy" />
    <PackageReference Include="Azure.Storage.Blobs" />
    <InternalsVisibleTo Include="DigitalBrain.Launcher.Tests.Unit" />
  </ItemGroup>
</Project>
```

`src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/DigitalBrain.Launcher.Tests.Unit.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../DigitalBrain.Launcher/DigitalBrain.Launcher.csproj" />
    <ProjectReference Include="../../Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj" />
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />
  </ItemGroup>
</Project>
```

(`Microsoft.AspNetCore.Mvc.Testing` is not in `Directory.Packages.props`; add `<PackageVersion Include="Microsoft.AspNetCore.Mvc.Testing" Version="11.0.0-rc.1.26425.128" />`, the ASP.NET Core version the repo already pins for `Microsoft.AspNetCore.Authentication.OpenIdConnect`.)

`DigitalBrain.slnx`: add

```xml
<Folder Name="/Launcher/">
  <Project Path="src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj" />
  <Project Path="src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/DigitalBrain.Launcher.Tests.Unit.csproj" />
</Folder>
```

- [ ] **Step 2: Failing fact — revisions.json round-trips and allocates port blocks**

`RevisionsFileFacts.cs`:

```csharp
using DigitalBrain.Launcher.Revisions;

namespace DigitalBrain.Launcher.Tests.Unit;

public sealed class RevisionsFileFacts
{
    [Fact]
    public void TheDocumentRoundTripsAndTheNextBlockFollowsTheHighestAllocated()
    {
        var path = Path.Combine(Path.GetTempPath(), "revisions-" + Guid.NewGuid().ToString("N") + ".json");
        var document = new RevisionsDocument("abc1234", [new("abc1234", "os-runtime", @"E:\wt\abc1234", 5090, 5091, "current")]);
        RevisionsFile.Write(path, document);
        var read = RevisionsFile.Read(path);
        Assert.Equal(document, read with { Revisions = read.Revisions });
        Assert.Equal("abc1234", read.Current);
        Assert.Equal((5100, 5101), read.NextBlock(firstBlockPort: 5090, blockSize: 10));
        Assert.Equal((5090, 5091), new RevisionsDocument(null, []).NextBlock(5090, 10));
        File.Delete(path);
    }

    [Fact]
    public void AMissingFileIsAnEmptyDocument()
    {
        var read = RevisionsFile.Read(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N") + ".json"));
        Assert.Null(read.Current);
        Assert.Empty(read.Revisions);
    }
}
```

- [ ] **Step 3: Run it, expect compile failure**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit -- --filter-method "*RoundTrips*"`
Expected: `The type or namespace name 'RevisionsDocument' could not be found`.

- [ ] **Step 4: Implement `Revision`, `RevisionsDocument`, `RevisionsFile`**

`Revisions/Revision.cs`:

```csharp
namespace DigitalBrain.Launcher.Revisions;

public sealed record Revision(string Sha, string Branch, string Worktree, int UiPort, int McpPort, string State)
{
    public string McpEndpoint => $"http://localhost:{McpPort}";
    public string UiEndpoint => $"http://localhost:{UiPort}";
    public string ServiceId => "intochat-r" + Sha;
    public string Container => "brain-r" + Sha;
}

public sealed record RevisionsDocument(string? Current, Revision[] Revisions)
{
    public (int UiPort, int McpPort) NextBlock(int firstBlockPort, int blockSize)
    {
        var highest = Revisions.Length == 0 ? firstBlockPort - blockSize : Revisions.Max(revision => revision.UiPort);
        return (highest + blockSize, highest + blockSize + 1);
    }

    public Revision Require(string sha) => Revisions.SingleOrDefault(revision => revision.Sha == sha)
        ?? throw new KeyNotFoundException($"Revision {sha} is not known to the launcher.");

    public RevisionsDocument With(Revision revision) => this with
    {
        Revisions = [.. Revisions.Where(known => known.Sha != revision.Sha), revision],
    };
}
```

`Revisions/RevisionsFile.cs`:

```csharp
using System.Text.Json;

namespace DigitalBrain.Launcher.Revisions;

public static class RevisionsFile
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static RevisionsDocument Read(string path)
        => File.Exists(path) ? JsonSerializer.Deserialize<RevisionsDocument>(File.ReadAllText(path), Json) ?? new(null, []) : new(null, []);

    // Written whole, through a temporary file, so a crash mid-write never leaves half a document.
    public static void Write(string path, RevisionsDocument document)
    {
        var temporary = path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(document, Json));
        File.Move(temporary, path, overwrite: true);
    }
}
```

Run Step 3 again: green.

- [ ] **Step 5: Failing fact — the proxy points both canonical ports at one revision and re-points on update**

`RevisionProxyFacts.cs`:

```csharp
using DigitalBrain.Launcher.Proxy;
using Microsoft.Extensions.DependencyInjection;
using Yarp.ReverseProxy.Configuration;

namespace DigitalBrain.Launcher.Tests.Unit;

public sealed class RevisionProxyFacts
{
    [Fact]
    public void PointingAtARevisionRoutesUiAndMcpHostsToItsPorts()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddRevisionProxy(uiPort: 5080, mcpPort: 5081);
        using var provider = services.BuildServiceProvider();
        var proxy = provider.GetRequiredService<RevisionProxy>();
        Assert.Null(proxy.Target);
        proxy.PointAt(5090, 5091);
        var config = provider.GetRequiredService<IProxyConfigProvider>().GetConfig();
        Assert.Equal((5090, 5091), proxy.Target);
        Assert.Equal("http://localhost:5090/", config.Clusters.Single(c => c.ClusterId == "ui").Destinations!["current"].Address);
        Assert.Equal("http://localhost:5091/", config.Clusters.Single(c => c.ClusterId == "mcp").Destinations!["current"].Address);
        Assert.Equal("5080", config.Routes.Single(r => r.RouteId == "ui").Match.Hosts!.Single().Split(':')[1]);
        Assert.Equal("5081", config.Routes.Single(r => r.RouteId == "mcp").Match.Hosts!.Single().Split(':')[1]);
        proxy.PointAt(5100, 5101);
        Assert.Equal("http://localhost:5100/", provider.GetRequiredService<IProxyConfigProvider>().GetConfig().Clusters.Single(c => c.ClusterId == "ui").Destinations!["current"].Address);
    }
}
```

- [ ] **Step 6: Run it, expect compile failure**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit -- --filter-method "*RoutesUiAndMcp*"`
Expected: `'RevisionProxy' could not be found`.

- [ ] **Step 7: Implement `RevisionProxy`**

`Proxy/RevisionProxy.cs`:

```csharp
using Microsoft.Extensions.DependencyInjection;
using Yarp.ReverseProxy.Configuration;

namespace DigitalBrain.Launcher.Proxy;

// One listener for 5080 and one for 5081; the host header decides which cluster a request
// reaches, and both clusters point at the current revision's block.
public sealed class RevisionProxy(InMemoryConfigProvider config, int uiPort, int mcpPort)
{
    public (int UiPort, int McpPort)? Target { get; private set; }

    public void PointAt(int revisionUiPort, int revisionMcpPort)
    {
        Target = (revisionUiPort, revisionMcpPort);
        config.Update(Routes(uiPort, mcpPort), Clusters(revisionUiPort, revisionMcpPort));
    }

    internal static RouteConfig[] Routes(int uiPort, int mcpPort) =>
    [
        new() { RouteId = "ui", ClusterId = "ui", Match = new() { Path = "/{**catch-all}", Hosts = [$"localhost:{uiPort}"] } },
        new() { RouteId = "mcp", ClusterId = "mcp", Match = new() { Path = "/{**catch-all}", Hosts = [$"localhost:{mcpPort}"] } },
    ];

    internal static ClusterConfig[] Clusters(int revisionUiPort, int revisionMcpPort) =>
    [
        new() { ClusterId = "ui", Destinations = new Dictionary<string, DestinationConfig> { ["current"] = new() { Address = $"http://localhost:{revisionUiPort}/" } } },
        new() { ClusterId = "mcp", Destinations = new Dictionary<string, DestinationConfig> { ["current"] = new() { Address = $"http://localhost:{revisionMcpPort}/" } } },
    ];
}

public static class RevisionProxyServices
{
    public static IServiceCollection AddRevisionProxy(this IServiceCollection services, int uiPort, int mcpPort)
    {
        // Empty until the first PointAt: a request before any revision is current gets YARP's 503.
        services.AddReverseProxy().LoadFromMemory(RevisionProxy.Routes(uiPort, mcpPort), []);
        services.AddSingleton(provider => new RevisionProxy(provider.GetRequiredService<InMemoryConfigProvider>(), uiPort, mcpPort));
        return services;
    }
}
```

Run Step 6 again: green. (`InMemoryConfigProvider` is registered as a singleton by `LoadFromMemory`, which is why the test resolves `IProxyConfigProvider`; if the registration is internal-only in 2.3.0, resolve `IProxyConfigProvider` and cast.)

- [ ] **Step 8: Failing facts — propose, start, healthy, promote, discard with fakes**

`FakeProcessRunner.cs`:

```csharp
using DigitalBrain.Launcher.Processes;

namespace DigitalBrain.Launcher.Tests.Unit;

internal sealed class FakeProcessRunner : IProcessRunner
{
    public List<string> Calls { get; } = [];
    public List<FakeRunningProcess> Started { get; } = [];
    public Func<string, string[], ProcessResult> Answer { get; set; } = (_, _) => new(0, "", "");

    public Task<ProcessResult> RunAsync(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string>? environment, CancellationToken ct)
    {
        Calls.Add(file + " " + string.Join(' ', args) + " @" + workingDirectory);
        return Task.FromResult(Answer(file, args));
    }

    public IRunningProcess Start(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string> environment)
    {
        Calls.Add(file + " " + string.Join(' ', args) + " @" + workingDirectory);
        var process = new FakeRunningProcess(Started.Count + 1, environment);
        Started.Add(process);
        return process;
    }
}

internal sealed class FakeRunningProcess(int id, IReadOnlyDictionary<string, string> environment) : IRunningProcess
{
    private readonly TaskCompletionSource<int> _exit = new();
    public int Id => id;
    public IReadOnlyDictionary<string, string> Environment => environment;
    public bool Stopped { get; private set; }
    public Task<int> Exited => _exit.Task;
    public Task StopAsync(CancellationToken ct) { Stopped = true; _exit.TrySetResult(0); return Task.CompletedTask; }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
```

`FakeStorageCopier.cs`:

```csharp
using DigitalBrain.Launcher.Storage;

namespace DigitalBrain.Launcher.Tests.Unit;

internal sealed class FakeStorageCopier : IStorageCopier
{
    public List<(string Source, string Destination)> Copies { get; } = [];
    public Task CopyContainerAsync(string source, string destination, CancellationToken ct) { Copies.Add((source, destination)); return Task.CompletedTask; }
}
```

`RevisionsFacts.cs`:

```csharp
using System.Net;
using DigitalBrain.Launcher.Processes;
using DigitalBrain.Launcher.Proxy;
using DigitalBrain.Launcher.Revisions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Yarp.ReverseProxy.Configuration;

namespace DigitalBrain.Launcher.Tests.Unit;

public sealed class RevisionsFacts : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("launcher-").FullName;
    private readonly FakeProcessRunner _processes = new();
    private readonly FakeStorageCopier _storage = new();
    private readonly RevisionProxy _proxy = new(new InMemoryConfigProvider([], []), 5080, 5081);
    private readonly HealthProbe _health = new(_ => Task.FromResult(HttpStatusCode.OK));

    private Revisions Subject() => new(new LauncherOptions { Repository = _root, RevisionsPath = Path.Combine(_root, "revisions.json"), CurrentContainer = "digitalbrain-v2-state" },
        _processes, _storage, _proxy, _health, NullLogger<Revisions>.Instance);

    [Fact]
    public async Task ProposingWritesTheFilesIntoAFreshWorktreeAndCommitsThem()
    {
        var ct = TestContext.Current.CancellationToken;
        _processes.Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "");
        var revision = await Subject().ProposeAsync("os-runtime", "Calculator: add percent", new Dictionary<string, string> { ["src/DigitalBrain.OS/Apps/Calculator/app.json"] = "{}" }, ct);
        Assert.Equal("abc1234", revision.Sha);
        Assert.Equal((5090, 5091), (revision.UiPort, revision.McpPort));
        Assert.Equal("created", revision.State);
        var worktree = Path.Combine(_root, ".revisions", "abc1234");
        Assert.Contains(_processes.Calls, call => call.StartsWith("git worktree add --detach", StringComparison.Ordinal) && call.Contains("HEAD", StringComparison.Ordinal));
        Assert.Contains(_processes.Calls, call => call.StartsWith("git add -A", StringComparison.Ordinal));
        Assert.Contains(_processes.Calls, call => call.StartsWith("git commit -m Calculator: add percent", StringComparison.Ordinal));
        Assert.Equal("abc1234", RevisionsFile.Read(Path.Combine(_root, "revisions.json")).Revisions.Single().Sha);
        Assert.Equal(worktree, revision.Worktree);
    }

    [Fact]
    public async Task StartingCopiesStorageThenRunsAspireWithTheRevisionIdentity()
    {
        var ct = TestContext.Current.CancellationToken;
        _processes.Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "");
        var subject = Subject();
        await subject.ProposeAsync("os-runtime", "change", new Dictionary<string, string>(), ct);
        var started = await subject.StartAsync("abc1234", ct);
        Assert.Equal(("digitalbrain-v2-state", "brain-rabc1234"), _storage.Copies.Single());
        var process = _processes.Started.Single();
        Assert.Equal("intochat-rabc1234", process.Environment["Orleans__ServiceId"]);
        Assert.Equal("intochat-rabc1234", process.Environment["Orleans__ClusterId"]);
        Assert.Equal("brain-rabc1234", process.Environment["DigitalBrain__Orleans__GrainStateContainer"]);
        Assert.Equal("5090", process.Environment["DigitalBrain__Http__UiPort"]);
        Assert.Equal("5091", process.Environment["DigitalBrain__Http__McpPort"]);
        Assert.Contains(_processes.Calls, call => call.StartsWith("aspire run --non-interactive --project", StringComparison.Ordinal) && call.EndsWith("@" + started.Worktree, StringComparison.Ordinal));
        Assert.Equal("starting", started.State);
        Assert.Equal("healthy", (await subject.WaitHealthyAsync("abc1234", TimeSpan.FromSeconds(5), ct)).State);
    }

    [Fact]
    public async Task PromoteFlipsTheProxyThenStopsThePreviousCurrent()
    {
        var ct = TestContext.Current.CancellationToken;
        var shas = new Queue<string>(["aaaa111", "bbbb222"]);
        _processes.Answer = (_, args) => args[0] == "rev-parse" ? new(0, shas.Dequeue() + "\n", "") : new(0, "", "");
        var subject = Subject();
        await subject.ProposeAsync("os-runtime", "first", new Dictionary<string, string>(), ct);
        await subject.StartAsync("aaaa111", ct);
        await subject.PromoteAsync("aaaa111", ct);
        Assert.Equal((5090, 5091), _proxy.Target);
        await subject.ProposeAsync("os-runtime", "second", new Dictionary<string, string>(), ct);
        await subject.StartAsync("bbbb222", ct);
        var promoted = await subject.PromoteAsync("bbbb222", ct);
        Assert.Equal((5100, 5101), _proxy.Target);
        Assert.Equal("bbbb222", RevisionsFile.Read(Path.Combine(_root, "revisions.json")).Current);
        Assert.True(_processes.Started[0].Stopped);
        Assert.False(_processes.Started[1].Stopped);
        Assert.Equal("current", promoted.State);
        Assert.Equal("stopped", subject.List().Require("aaaa111").State);
        Assert.Contains(_processes.Calls, call => call.StartsWith("git update-ref refs/heads/os-runtime bbbb222", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DiscardStopsTheProcessAndKeepsTheWorktree()
    {
        var ct = TestContext.Current.CancellationToken;
        _processes.Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "");
        var subject = Subject();
        await subject.ProposeAsync("os-runtime", "change", new Dictionary<string, string>(), ct);
        await subject.StartAsync("abc1234", ct);
        await subject.DiscardAsync("abc1234", ct);
        Assert.True(_processes.Started.Single().Stopped);
        Assert.Equal("stopped", subject.List().Require("abc1234").State);
        Assert.DoesNotContain(_processes.Calls, call => call.StartsWith("git worktree remove", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AnUnhealthyChildWithinTheBudgetIsReportedNotRetried()
    {
        var ct = TestContext.Current.CancellationToken;
        _processes.Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "");
        var probes = 0;
        var subject = new Revisions(new LauncherOptions { Repository = _root, RevisionsPath = Path.Combine(_root, "revisions.json") },
            _processes, _storage, _proxy, new HealthProbe(_ => { probes++; return Task.FromResult(HttpStatusCode.ServiceUnavailable); }), NullLogger<Revisions>.Instance);
        await subject.ProposeAsync("os-runtime", "change", new Dictionary<string, string>(), ct);
        await subject.StartAsync("abc1234", ct);
        var error = await Assert.ThrowsAsync<TimeoutException>(() => subject.WaitHealthyAsync("abc1234", TimeSpan.FromMilliseconds(50), ct));
        Assert.Contains("abc1234", error.Message, StringComparison.Ordinal);
        Assert.Equal("failed", subject.List().Require("abc1234").State);
        Assert.True(probes >= 1);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}
```

- [ ] **Step 9: Run them, expect compile failure**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit -- --filter-class "*RevisionsFacts*"`
Expected: `'Revisions' could not be found`, `'HealthProbe'`, `'LauncherOptions'`.

- [ ] **Step 10: Implement options, process runner, git, aspire run, health probe and `Revisions`**

`LauncherOptions.cs`:

```csharp
namespace DigitalBrain.Launcher;

public sealed class LauncherOptions
{
    public const string Section = "Launcher";
    public required string Repository { get; init; }
    public string RevisionsPath { get; init; } = Path.Combine(AppContext.BaseDirectory, "revisions.json");
    public int ApiPort { get; init; } = 5079;
    public int UiPort { get; init; } = 5080;
    public int McpPort { get; init; } = 5081;
    public int FirstBlockPort { get; init; } = 5090;
    public int BlockSize { get; init; } = 10;
    public string AppHostProject { get; init; } = "src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj";
    public string AzuriteBlobEndpoint { get; init; } = "http://127.0.0.1:10000/devstoreaccount1";
    public string CurrentContainer { get; init; } = "digitalbrain-v2-state";
}
```

`Processes/IProcessRunner.cs`:

```csharp
namespace DigitalBrain.Launcher.Processes;

public sealed record ProcessResult(int ExitCode, string Output, string Error);

public interface IRunningProcess : IAsyncDisposable
{
    int Id { get; }
    Task<int> Exited { get; }
    Task StopAsync(CancellationToken ct);
}

public interface IProcessRunner
{
    Task<ProcessResult> RunAsync(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string>? environment, CancellationToken ct);
    IRunningProcess Start(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string> environment);
}
```

`Processes/SystemProcessRunner.cs`:

```csharp
using System.Diagnostics;

namespace DigitalBrain.Launcher.Processes;

internal sealed class SystemProcessRunner : IProcessRunner
{
    public async Task<ProcessResult> RunAsync(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string>? environment, CancellationToken ct)
    {
        using var process = new Process { StartInfo = Info(file, args, workingDirectory, environment) };
        process.Start();
        var output = process.StandardOutput.ReadToEndAsync(ct);
        var error = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);
        return new(process.ExitCode, await output, await error);
    }

    public IRunningProcess Start(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string> environment)
    {
        var process = new Process { StartInfo = Info(file, args, workingDirectory, environment), EnableRaisingEvents = true };
        process.Start();
        return new Running(process);
    }

    private static ProcessStartInfo Info(string file, string[] args, string workingDirectory, IReadOnlyDictionary<string, string>? environment)
    {
        var info = new ProcessStartInfo(file) { WorkingDirectory = workingDirectory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var argument in args) { info.ArgumentList.Add(argument); }
        foreach (var (name, value) in environment ?? new Dictionary<string, string>()) { info.Environment[name] = value; }
        return info;
    }

    private sealed class Running(Process process) : IRunningProcess
    {
        public int Id => process.Id;
        public Task<int> Exited => process.WaitForExitAsync().ContinueWith(_ => process.ExitCode, TaskScheduler.Default);
        // aspire run owns the AppHost and its DCP children; killing the tree is the documented stop.
        public Task StopAsync(CancellationToken ct) { if (!process.HasExited) { process.Kill(entireProcessTree: true); } return process.WaitForExitAsync(ct); }
        public ValueTask DisposeAsync() { process.Dispose(); return ValueTask.CompletedTask; }
    }
}
```

`Processes/Git.cs`:

```csharp
namespace DigitalBrain.Launcher.Processes;

internal sealed class Git(IProcessRunner processes, string repository)
{
    public async Task<string> Run(string workingDirectory, CancellationToken ct, params string[] args)
    {
        var result = await processes.RunAsync("git", args, workingDirectory, null, ct);
        if (result.ExitCode != 0) { throw new InvalidOperationException($"git {string.Join(' ', args)} failed: {result.Error}"); }
        return result.Output.Trim();
    }

    public Task AddWorktree(string path, CancellationToken ct) => Run(repository, ct, "worktree", "add", "--detach", path, "HEAD");
    public Task Stage(string worktree, CancellationToken ct) => Run(worktree, ct, "add", "-A");
    public Task Commit(string worktree, string message, CancellationToken ct) => Run(worktree, ct, "commit", "-m", message, "--allow-empty");
    public Task<string> ShortSha(string worktree, CancellationToken ct) => Run(worktree, ct, "rev-parse", "--short=7", "HEAD");
    public Task FastForward(string branch, string sha, CancellationToken ct) => Run(repository, ct, "update-ref", "refs/heads/" + branch, sha);
}
```

`Processes/AspireRun.cs`:

```csharp
namespace DigitalBrain.Launcher.Processes;

internal static class AspireRun
{
    public static IRunningProcess Start(IProcessRunner processes, string worktree, string appHostProject, Revisions.Revision revision)
        => processes.Start("aspire", ["run", "--non-interactive", "--project", Path.Combine(worktree, appHostProject)], worktree, new Dictionary<string, string>
        {
            ["Orleans__ServiceId"] = revision.ServiceId,
            ["Orleans__ClusterId"] = revision.ServiceId,
            ["DigitalBrain__Orleans__GrainStateContainer"] = revision.Container,
            ["DigitalBrain__Http__UiPort"] = revision.UiPort.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["DigitalBrain__Http__McpPort"] = revision.McpPort.ToString(System.Globalization.CultureInfo.InvariantCulture),
            // The launcher's own dashboard ports would collide with the current revision's.
            ["ASPNETCORE_URLS"] = $"http://localhost:{revision.UiPort + 2}",
            ["ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL"] = $"http://localhost:{revision.UiPort + 3}",
            ["ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL"] = $"http://localhost:{revision.UiPort + 4}",
        });
}
```

`Revisions/Revisions.cs` (with `HealthProbe` in the same file):

```csharp
using System.Net;
using DigitalBrain.Launcher.Processes;
using DigitalBrain.Launcher.Proxy;
using DigitalBrain.Launcher.Storage;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.Launcher.Revisions;

// GET {mcp}/health of a revision; the launcher is the only thing allowed to poll a child for readiness.
public sealed class HealthProbe(Func<Uri, Task<HttpStatusCode>> probe)
{
    public static HealthProbe Http(HttpClient client) => new(async uri => (await client.GetAsync(uri)).StatusCode);
    public Task<HttpStatusCode> Probe(Uri uri) => probe(uri);
}

public sealed class Revisions(LauncherOptions options, IProcessRunner processes, IStorageCopier storage, RevisionProxy proxy, HealthProbe health, ILogger<Revisions> logger)
{
    private readonly Git _git = new(processes, options.Repository);
    private readonly Dictionary<string, IRunningProcess> _running = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _gate = new(1, 1);

    public RevisionsDocument List() => RevisionsFile.Read(options.RevisionsPath);

    public async Task<Revision> ProposeAsync(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var staging = Path.Combine(options.Repository, ".revisions", "staging-" + Guid.NewGuid().ToString("N"));
            await _git.AddWorktree(staging, ct);
            foreach (var (relative, content) in files)
            {
                var target = Path.Combine(staging, relative.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                await File.WriteAllTextAsync(target, content, ct);
            }
            await _git.Stage(staging, ct);
            await _git.Commit(staging, summary, ct);
            var sha = await _git.ShortSha(staging, ct);
            var worktree = Path.Combine(options.Repository, ".revisions", sha);
            Directory.Move(staging, worktree);
            await _git.Run(options.Repository, ct, "worktree", "repair", worktree);
            var document = List();
            var (ui, mcp) = document.NextBlock(options.FirstBlockPort, options.BlockSize);
            var revision = new Revision(sha, branch, worktree, ui, mcp, "created");
            RevisionsFile.Write(options.RevisionsPath, document.With(revision));
            return revision;
        }
        finally { _gate.Release(); }
    }

    public async Task<Revision> StartAsync(string sha, CancellationToken ct)
    {
        var revision = List().Require(sha);
        await storage.CopyContainerAsync(options.CurrentContainer, revision.Container, ct);
        _running[sha] = AspireRun.Start(processes, revision.Worktree, options.AppHostProject, revision);
        return Record(revision with { State = "starting" });
    }

    public async Task<Revision> WaitHealthyAsync(string sha, TimeSpan budget, CancellationToken ct)
    {
        var revision = List().Require(sha);
        var endpoint = new Uri(revision.McpEndpoint + "/health");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(budget);
        var exited = _running.TryGetValue(sha, out var process) ? process.Exited : Task.Delay(Timeout.Infinite, deadline.Token).ContinueWith(_ => -1, TaskScheduler.Default);
        while (!deadline.IsCancellationRequested)
        {
            if (exited.IsCompleted) { Record(revision with { State = "failed" }); throw new InvalidOperationException($"Revision {sha}'s aspire run exited with {exited.Result}."); }
            try { if (await health.Probe(endpoint) == HttpStatusCode.OK) { return Record(revision with { State = "healthy" }); } }
            catch (HttpRequestException) { }
            try { await Task.Delay(TimeSpan.FromSeconds(2), deadline.Token); } catch (OperationCanceledException) { break; }
        }
        ct.ThrowIfCancellationRequested();
        Record(revision with { State = "failed" });
        throw new TimeoutException($"Revision {sha} did not answer {endpoint} within {budget}.");
    }

    public async Task<Revision> PromoteAsync(string sha, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var document = List();
            var revision = document.Require(sha);
            await _git.FastForward(revision.Branch, sha, ct);
            proxy.PointAt(revision.UiPort, revision.McpPort);
            var previous = document.Current;
            document = document.With(revision with { State = "current" }) with { Current = sha };
            RevisionsFile.Write(options.RevisionsPath, document);
            if (previous is not null && previous != sha) { await StopAsync(previous, ct); }
            return document.Require(sha);
        }
        finally { _gate.Release(); }
    }

    public async Task DiscardAsync(string sha, CancellationToken ct)
    {
        List().Require(sha);
        await StopAsync(sha, ct);
    }

    private async Task StopAsync(string sha, CancellationToken ct)
    {
        if (_running.Remove(sha, out var process))
        {
            try { await process.StopAsync(ct); }
            catch (Exception error) when (error is not OperationCanceledException) { logger.LogWarning(error, "Revision {Sha} did not stop cleanly.", sha); }
            await process.DisposeAsync();
        }
        Record(List().Require(sha) with { State = "stopped" });
    }

    private Revision Record(Revision revision)
    {
        RevisionsFile.Write(options.RevisionsPath, List().With(revision));
        return revision;
    }
}
```

`Storage/IStorageCopier.cs` and `Storage/AzuriteStorageCopier.cs`:

```csharp
namespace DigitalBrain.Launcher.Storage;

public interface IStorageCopier
{
    Task CopyContainerAsync(string source, string destination, CancellationToken ct);
}
```

```csharp
using Azure.Storage;
using Azure.Storage.Blobs;

namespace DigitalBrain.Launcher.Storage;

// Blob-by-blob server-side copy inside the one Azurite account every revision shares; the
// destination container is the child's and is created fresh, never merged.
internal sealed class AzuriteStorageCopier(BlobServiceClient blobs) : IStorageCopier
{
    public const string AccountName = "devstoreaccount1";
    public const string AccountKey = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

    public static AzuriteStorageCopier At(string blobEndpoint)
        => new(new BlobServiceClient(new Uri(blobEndpoint), new StorageSharedKeyCredential(AccountName, AccountKey)));

    public async Task CopyContainerAsync(string source, string destination, CancellationToken ct)
    {
        var from = blobs.GetBlobContainerClient(source);
        var to = blobs.GetBlobContainerClient(destination);
        await to.DeleteIfExistsAsync(cancellationToken: ct);
        await to.CreateAsync(cancellationToken: ct);
        await foreach (var item in from.GetBlobsAsync(cancellationToken: ct))
        {
            var operation = await to.GetBlobClient(item.Name).StartCopyFromUriAsync(from.GetBlobClient(item.Name).Uri, cancellationToken: ct);
            await operation.WaitForCompletionAsync(ct);
        }
    }
}
```

Run Step 9 again: `RevisionsFacts` green.

- [ ] **Step 11: Failing fact — the HTTP API**

`LauncherEndpointFacts.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using DigitalBrain.Launcher.Processes;
using DigitalBrain.Launcher.Proxy;
using DigitalBrain.Launcher.Revisions;
using DigitalBrain.Launcher.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Launcher.Tests.Unit;

public sealed class LauncherEndpointFacts
{
    [Fact]
    public async Task TheApiProposesStartsPromotesAndListsRevisions()
    {
        var ct = TestContext.Current.CancellationToken;
        var root = Directory.CreateTempSubdirectory("launcher-api-").FullName;
        var processes = new FakeProcessRunner { Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "") };
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton(new LauncherOptions { Repository = root, RevisionsPath = Path.Combine(root, "revisions.json") });
        builder.Services.AddSingleton<IProcessRunner>(processes);
        builder.Services.AddSingleton<IStorageCopier>(new FakeStorageCopier());
        builder.Services.AddSingleton(new HealthProbe(_ => Task.FromResult(HttpStatusCode.OK)));
        builder.Services.AddRevisionProxy(5080, 5081);
        builder.Services.AddSingleton<Revisions>();
        await using var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:0");
        app.MapLauncher();
        await app.StartAsync(ct);
        using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };

        using var proposed = await client.PostAsJsonAsync("/revisions", new { branch = "os-runtime", summary = "change", files = new Dictionary<string, string>() }, ct);
        Assert.Equal(HttpStatusCode.Created, proposed.StatusCode);
        Assert.Equal("abc1234", (await proposed.Content.ReadFromJsonAsync<Revision>(ct))!.Sha);
        Assert.Equal("starting", (await (await client.PostAsync("/revisions/abc1234/start", null, ct)).Content.ReadFromJsonAsync<Revision>(ct))!.State);
        Assert.Equal("healthy", (await (await client.PostAsync("/revisions/abc1234/healthy?budget=00:00:05", null, ct)).Content.ReadFromJsonAsync<Revision>(ct))!.State);
        Assert.Equal("current", (await (await client.PostAsync("/revisions/abc1234/promote", null, ct)).Content.ReadFromJsonAsync<Revision>(ct))!.State);
        Assert.Equal("abc1234", (await client.GetFromJsonAsync<RevisionsDocument>("/revisions", ct))!.Current);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/revisions/nope/start", null, ct)).StatusCode);
        await app.StopAsync(ct);
        Directory.Delete(root, recursive: true);
    }
}
```

- [ ] **Step 12: Run it, expect compile failure**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit -- --filter-method "*ProposesStartsPromotes*"`
Expected: `'WebApplication' does not contain a definition for 'MapLauncher'`.

- [ ] **Step 13: Implement the endpoints and `Program.cs`**

`Revisions/LauncherEndpoints.cs`:

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace DigitalBrain.Launcher.Revisions;

public sealed record ProposeRevision(string Branch, string Summary, Dictionary<string, string> Files);

public static class LauncherEndpoints
{
    public static IEndpointRouteBuilder MapLauncher(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", () => Results.Ok());
        app.MapGet("/revisions", (Revisions revisions) => Results.Ok(revisions.List()));
        app.MapPost("/revisions", async (ProposeRevision request, Revisions revisions, CancellationToken ct) =>
        {
            var revision = await revisions.ProposeAsync(request.Branch, request.Summary, request.Files, ct);
            return Results.Created($"/revisions/{revision.Sha}", revision);
        });
        app.MapPost("/revisions/{sha}/start", (string sha, Revisions revisions, CancellationToken ct) => Known(() => revisions.StartAsync(sha, ct)));
        app.MapPost("/revisions/{sha}/healthy", async (string sha, TimeSpan budget, Revisions revisions, CancellationToken ct) =>
        {
            try { return Results.Ok(await revisions.WaitHealthyAsync(sha, budget, ct)); }
            catch (KeyNotFoundException) { return Results.NotFound(); }
            catch (TimeoutException error) { return Results.Json(new { reason = error.Message }, statusCode: StatusCodes.Status504GatewayTimeout); }
            catch (InvalidOperationException error) { return Results.Json(new { reason = error.Message }, statusCode: StatusCodes.Status502BadGateway); }
        });
        app.MapPost("/revisions/{sha}/promote", (string sha, Revisions revisions, CancellationToken ct) => Known(() => revisions.PromoteAsync(sha, ct)));
        app.MapDelete("/revisions/{sha}", async (string sha, Revisions revisions, CancellationToken ct) =>
        {
            try { await revisions.DiscardAsync(sha, ct); return Results.NoContent(); }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        });
        return app;
    }

    private static async Task<IResult> Known(Func<Task<Revision>> action)
    {
        try { return Results.Ok(await action()); }
        catch (KeyNotFoundException) { return Results.NotFound(); }
    }
}
```

`Program.cs`:

```csharp
using DigitalBrain.Launcher;
using DigitalBrain.Launcher.Processes;
using DigitalBrain.Launcher.Proxy;
using DigitalBrain.Launcher.Revisions;
using DigitalBrain.Launcher.Storage;

var builder = WebApplication.CreateBuilder(args);
var options = builder.Configuration.GetSection(LauncherOptions.Section).Get<LauncherOptions>()
    ?? throw new InvalidOperationException("Launcher:Repository must name the repository root.");
builder.Services.AddSingleton(options);
builder.Services.AddSingleton<IProcessRunner, SystemProcessRunner>();
builder.Services.AddSingleton<IStorageCopier>(AzuriteStorageCopier.At(options.AzuriteBlobEndpoint));
builder.Services.AddSingleton(HealthProbe.Http(new HttpClient { Timeout = TimeSpan.FromSeconds(5) }));
builder.Services.AddRevisionProxy(options.UiPort, options.McpPort);
builder.Services.AddSingleton<Revisions>();
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenLocalhost(options.ApiPort);
    kestrel.ListenLocalhost(options.UiPort);
    kestrel.ListenLocalhost(options.McpPort);
});

var app = builder.Build();
// The API answers only on its own port; everything on 5080/5081 is proxied.
app.MapWhen(context => context.Connection.LocalPort == options.ApiPort, api => { api.UseRouting(); api.UseEndpoints(endpoints => endpoints.MapLauncher()); });
app.MapReverseProxy();
// A launcher restarted while a revision is current points at it again before serving.
if (app.Services.GetRequiredService<Revisions>().List() is { Current: { } current } document)
{
    var revision = document.Require(current);
    app.Services.GetRequiredService<RevisionProxy>().PointAt(revision.UiPort, revision.McpPort);
}
app.Run();
```

Add `src/DigitalBrain.Launcher/DigitalBrain.Launcher/appsettings.json` with `{ "Launcher": { "Repository": "../../.." } }` resolved relative to the launcher's working directory in `Program.cs` (`Path.GetFullPath(options.Repository)` before registering).

- [ ] **Step 14: Run the whole suite and build**

`dotnet build src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj`
`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit`
Expected: green. `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests` stays green (the launcher references no DigitalBrain ring).

- [ ] **Step 15: Commit**

```
git add Directory.Packages.props DigitalBrain.slnx src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj src/DigitalBrain.Launcher/DigitalBrain.Launcher/Program.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/appsettings.json src/DigitalBrain.Launcher/DigitalBrain.Launcher/LauncherOptions.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/Revision.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/RevisionsFile.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/Revisions.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/LauncherEndpoints.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Proxy/RevisionProxy.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/IProcessRunner.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/SystemProcessRunner.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/Git.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Processes/AspireRun.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Storage/IStorageCopier.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Storage/AzuriteStorageCopier.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/DigitalBrain.Launcher.Tests.Unit.csproj src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeProcessRunner.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeStorageCopier.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionsFileFacts.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionsFacts.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/RevisionProxyFacts.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/LauncherEndpointFacts.cs
git commit -m "Launcher: revisions.json, YARP proxy on 5080/5081, revision API, aspire run per revision, storage copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Revisions module — contracts, stage machine, Promote refusal, single-live queue, verification budget

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/DigitalBrain.Modules.Revisions.Contracts.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/IRevision.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/IRevisions.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/RevisionSnapshot.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/VerificationPlan.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/Signals/RevisionSignals.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/DigitalBrain.Modules.Revisions.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/RevisionsModule.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Configuration/RevisionsOptions.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/ILauncherClient.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/HttpLauncherClient.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/IRevisionVerifier.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/RevisionVerifier.cs` (placeholder until Task 4)
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionNeuron.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionState.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionIndexNeuron.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionIndexState.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/DigitalBrain.Modules.Revisions.Tests.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeLauncher.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeVerifier.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionFacts.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionIndexFacts.cs`
- Modify: `DigitalBrain.slnx` (folder `/Modules/DigitalBrain/Revisions/` with the three projects)

**Interfaces:**
- Consumes: `INeuron`, `Signal`, `Neuron<TState>.Save(TState next, Signal changed, Signal? acted)`, `Module<TOptions>`, `ModuleTest.Create().WithModule<RevisionsModule>().ConfigureSilo(...)`, `brain.Observe<T>(neuron, ct)` (`SignalProbe<T>.NextAsync`, `.Snapshot`).
- Produces (Contracts, namespace `DigitalBrain.Revisions`):
  - `public enum RevisionStage { Proposed, Queued, Starting, Started, Healthy, Verifying, Verified, Promoted, Failed, Discarded }`
  - `public sealed record RevisionProposal(string Branch, string Summary, Dictionary<string,string> Files, VerificationPlan Plan)`
  - `public sealed record VerificationPlan(NeuronExpectation[] Calls, string[] HealthyResources, string[] Spans, TimeSpan Budget, string AspireKey = "DigitalBrain.OS")`
  - `public sealed record NeuronExpectation(string Contract, string Key, string Method, string Arguments, string Expected)` — `Arguments` is the JSON array string `neurons_call` takes; `Expected` is a substring the normalised JSON result must contain, or `"*"` for any success.
  - `public sealed record VerificationCheck(string Name, bool Passed, string Detail)`, `public sealed record VerificationReport(VerificationCheck[] Checks, TimeSpan Elapsed)` with `bool Passed` and `string? FirstFailure`.
  - `public sealed record RevisionSnapshot(string Sha, string Branch, string Worktree, string Summary, RevisionStage Stage, string? McpEndpoint, VerificationPlan? Plan, VerificationReport? Report, string? Failure, RevisionStage[] History)`
  - `IRevision : INeuron` keyed `{brain}/revisions/{sha}`: `Task<RevisionSnapshot> Read()`, `Task<RevisionSnapshot> Propose(string branch, string worktreePath, string summary, VerificationPlan plan)`, `Task<RevisionSnapshot> Queue()`, `[AlwaysInterleave, ResponseTimeout("00:15:00")] Task<RevisionSnapshot> Start()`, `[AlwaysInterleave, ResponseTimeout("00:30:00")] Task<RevisionSnapshot> Verify(VerificationPlan plan)`, `[ResponseTimeout("00:05:00")] Task<RevisionSnapshot> Promote()`, `Task<RevisionSnapshot> Discard()`; `static string Key(string brainId, string sha) => $"{brainId}/revisions/{sha}"`.
  - `IRevisions : INeuron` keyed by brain id: `[ResponseTimeout("00:05:00")] Task<string> Propose(RevisionProposal proposal)` (the launcher commits the change set and answers the sha), `Task<string[]> List()`, `Task<string?> Live()`, `Task Ended(string sha)`.
  - Signals in `DigitalBrain.Revisions.Signals`, aliases `revisions.*`: `RevisionChanged(string Sha, RevisionStage Stage)` (the `changed` signal of every save), `RevisionBuilding(string Sha)`, `RevisionStarted(string Sha, string McpEndpoint)`, `RevisionHealthy(string Sha)`, `RevisionVerified(string Sha, VerificationReport Report)`, `RevisionPromoted(string Sha)`, `RevisionFailed(string Sha, RevisionStage Stage, string Reason)`.
- Produces (module, namespace `DigitalBrain.Revisions`):
  - `public interface ILauncherClient { Task<LauncherRevision> Propose(string branch, string summary, IReadOnlyDictionary<string,string> files, CancellationToken ct); Task<LauncherRevision> Start(string sha, CancellationToken ct); Task<LauncherRevision> WaitHealthy(string sha, TimeSpan budget, CancellationToken ct); Task<LauncherRevision> Promote(string sha, CancellationToken ct); Task Discard(string sha, CancellationToken ct); }`; `public sealed record LauncherRevision(string Sha, string Worktree, string McpEndpoint, string UiEndpoint, string State)`.
  - `public interface IRevisionVerifier { Task<VerificationReport> Verify(string brainId, string mcpEndpoint, VerificationPlan plan, CancellationToken ct); }`.
  - `RevisionsOptions : IModuleOptions` — `string LauncherUrl = "http://localhost:5079"`, `TimeSpan StartBudget = 10 minutes`.
  - `RevisionsModule() : Module<RevisionsOptions>(new ModuleId("revisions"))`, `Contracts => typeof(IRevision).Assembly`; `Configure(ISiloBuilder)` does `AddHttpClient()`, `TryAddSingleton<ILauncherClient, HttpLauncherClient>()`, `TryAddSingleton<IRevisionVerifier, RevisionVerifier>()` so a test's fake registered in `ConfigureSilo` wins.

- [ ] **Step 1: Create the three projects**

Contracts csproj mirrors `src/DigitalBrain.Modules/Time/DigitalBrain.Modules.Time.Contracts/DigitalBrain.Modules.Time.Contracts.csproj` with `RootNamespace` `DigitalBrain.Modules.Revisions.Contracts` and `ProjectReference ../../../../DigitalBrain/DigitalBrain.csproj`. Module csproj mirrors `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/DigitalBrain.Modules.Microsoft.Aspire.csproj`: references Contracts and `../../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj`, `InternalsVisibleTo DigitalBrain.Modules.Revisions.Tests`, `PackageReference Microsoft.Extensions.Http`. Tests csproj mirrors `DigitalBrain.Modules.Time.Tests.csproj` with `../../../../../Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj` and the module. Add the three to `DigitalBrain.slnx` under `<Folder Name="/Modules/DigitalBrain/Revisions/">`.

- [ ] **Step 2: Write the contracts**

`VerificationPlan.cs`:

```csharp
namespace DigitalBrain.Revisions;

[GenerateSerializer, Alias("revisions.expectation")]
public sealed record NeuronExpectation(
    [property: Id(0)] string Contract,
    [property: Id(1)] string Key,
    [property: Id(2)] string Method,
    [property: Id(3)] string Arguments,
    [property: Id(4)] string Expected);

// Written by the change's author: what to ask the child and what it must answer. The budget is
// the plan's, never a global timeout.
[GenerateSerializer, Alias("revisions.plan")]
public sealed record VerificationPlan(
    [property: Id(0)] NeuronExpectation[] Calls,
    [property: Id(1)] string[] HealthyResources,
    [property: Id(2)] string[] Spans,
    [property: Id(3)] TimeSpan Budget,
    [property: Id(4)] string AspireKey = "DigitalBrain.OS");

[GenerateSerializer, Alias("revisions.check")]
public sealed record VerificationCheck([property: Id(0)] string Name, [property: Id(1)] bool Passed, [property: Id(2)] string Detail);

[GenerateSerializer, Alias("revisions.report")]
public sealed record VerificationReport([property: Id(0)] VerificationCheck[] Checks, [property: Id(1)] TimeSpan Elapsed)
{
    public bool Passed => Checks.All(check => check.Passed);
    public string? FirstFailure => Checks.FirstOrDefault(check => !check.Passed)?.Name;
}
```

`RevisionSnapshot.cs`:

```csharp
namespace DigitalBrain.Revisions;

[GenerateSerializer, Alias("revisions.stage")]
public enum RevisionStage { Proposed, Queued, Starting, Started, Healthy, Verifying, Verified, Promoted, Failed, Discarded }

[GenerateSerializer, Alias("revisions.proposal")]
public sealed record RevisionProposal(
    [property: Id(0)] string Branch,
    [property: Id(1)] string Summary,
    [property: Id(2)] Dictionary<string, string> Files,
    [property: Id(3)] VerificationPlan Plan);

[GenerateSerializer, Alias("revisions.snapshot")]
public sealed record RevisionSnapshot(
    [property: Id(0)] string Sha,
    [property: Id(1)] string Branch,
    [property: Id(2)] string Worktree,
    [property: Id(3)] string Summary,
    [property: Id(4)] RevisionStage Stage,
    [property: Id(5)] string? McpEndpoint,
    [property: Id(6)] VerificationPlan? Plan,
    [property: Id(7)] VerificationReport? Report,
    [property: Id(8)] string? Failure,
    [property: Id(9)] RevisionStage[] History);
```

`IRevision.cs`:

```csharp
using Orleans.Concurrency;
using Orleans.Metadata;

namespace DigitalBrain.Revisions;

// One proposed change to the brain's own source, running as a sibling cluster until promoted or discarded.
[Alias("revisions.revision"), DefaultGrainType("revisions.revision")]
public interface IRevision : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<RevisionSnapshot> Read();
    Task<RevisionSnapshot> Propose(string branch, string worktreePath, string summary, VerificationPlan plan);
    Task<RevisionSnapshot> Queue();
    [AlwaysInterleave, ResponseTimeout("00:15:00")] Task<RevisionSnapshot> Start();
    [AlwaysInterleave, ResponseTimeout("00:30:00")] Task<RevisionSnapshot> Verify(VerificationPlan plan);
    [ResponseTimeout("00:05:00")] Task<RevisionSnapshot> Promote();
    Task<RevisionSnapshot> Discard();

    static string Key(string brainId, string sha) => $"{brainId}/revisions/{sha}";
}
```

`IRevisions.cs`:

```csharp
using Orleans.Concurrency;
using Orleans.Metadata;

namespace DigitalBrain.Revisions;

// The brain's revisions: the queue and the one that is live. Keyed by brain id.
[Alias("revisions.index"), DefaultGrainType("revisions.index")]
public interface IRevisions : INeuron
{
    [ResponseTimeout("00:05:00")] Task<string> Propose(RevisionProposal proposal);
    [ReadOnly, AlwaysInterleave] Task<string[]> List();
    [ReadOnly, AlwaysInterleave] Task<string?> Live();
    Task Ended(string sha);
}
```

`Signals/RevisionSignals.cs`:

```csharp
namespace DigitalBrain.Revisions.Signals;

[GenerateSerializer, Alias("revisions.changed")] public sealed record RevisionChanged([property: Id(0)] string Sha, [property: Id(1)] RevisionStage Stage) : Signal;
[GenerateSerializer, Alias("revisions.building")] public sealed record RevisionBuilding([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("revisions.started")] public sealed record RevisionStarted([property: Id(0)] string Sha, [property: Id(1)] string McpEndpoint) : Signal;
[GenerateSerializer, Alias("revisions.healthy")] public sealed record RevisionHealthy([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("revisions.verified")] public sealed record RevisionVerified([property: Id(0)] string Sha, [property: Id(1)] VerificationReport Report) : Signal;
[GenerateSerializer, Alias("revisions.promoted")] public sealed record RevisionPromoted([property: Id(0)] string Sha) : Signal;
[GenerateSerializer, Alias("revisions.failed")] public sealed record RevisionFailed([property: Id(0)] string Sha, [property: Id(1)] RevisionStage Stage, [property: Id(2)] string Reason) : Signal;
```

`dotnet build src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/DigitalBrain.Modules.Revisions.Contracts.csproj` — green.

- [ ] **Step 3: Failing facts — the stage machine with a `FakeLauncher`**

`FakeLauncher.cs`:

```csharp
using DigitalBrain.Revisions;

namespace DigitalBrain.Modules.Revisions.Tests;

internal sealed class FakeLauncher : ILauncherClient
{
    public List<string> Calls { get; } = [];
    public bool Healthy { get; set; } = true;
    private int _shas;

    private static LauncherRevision At(string sha, string state) => new(sha, @"E:\wt\" + sha, "http://localhost:5091", "http://localhost:5090", state);

    public Task<LauncherRevision> Propose(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct)
    {
        var sha = "sha" + (++_shas).ToString("0000", System.Globalization.CultureInfo.InvariantCulture);
        Calls.Add("propose " + sha);
        return Task.FromResult(At(sha, "created"));
    }

    public Task<LauncherRevision> Start(string sha, CancellationToken ct) { Calls.Add("start " + sha); return Task.FromResult(At(sha, "starting")); }

    public Task<LauncherRevision> WaitHealthy(string sha, TimeSpan budget, CancellationToken ct)
    {
        Calls.Add("healthy " + sha);
        return Healthy ? Task.FromResult(At(sha, "healthy")) : Task.FromException<LauncherRevision>(new TimeoutException($"Revision {sha} did not answer within {budget}."));
    }

    public Task<LauncherRevision> Promote(string sha, CancellationToken ct) { Calls.Add("promote " + sha); return Task.FromResult(At(sha, "current")); }
    public Task Discard(string sha, CancellationToken ct) { Calls.Add("discard " + sha); return Task.CompletedTask; }
}
```

`FakeVerifier.cs`:

```csharp
using DigitalBrain.Revisions;

namespace DigitalBrain.Modules.Revisions.Tests;

internal sealed class FakeVerifier : IRevisionVerifier
{
    public Func<VerificationPlan, CancellationToken, Task<VerificationReport>> Answer { get; set; }
        = (_, _) => Task.FromResult(new VerificationReport([new("context", true, "")], TimeSpan.Zero));

    public Task<VerificationReport> Verify(string brainId, string mcpEndpoint, VerificationPlan plan, CancellationToken ct) => Answer(plan, ct);
}
```

`RevisionFacts.cs`:

```csharp
using System.Diagnostics;
using DigitalBrain.Revisions;
using DigitalBrain.Revisions.Signals;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.Revisions.Tests;

public sealed class RevisionFacts
{
    private static readonly VerificationPlan Plan = new([new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "*")], ["OperatingSystem"], [], TimeSpan.FromMinutes(5));

    private static Task<ModuleBrain> StartAsync(FakeLauncher launcher, FakeVerifier verifier, CancellationToken ct)
        => ModuleTest.Create().WithModule<RevisionsModule>()
            .ConfigureSilo(silo => { silo.Services.AddSingleton<ILauncherClient>(launcher); silo.Services.AddSingleton<IRevisionVerifier>(verifier); })
            .StartAsync(ct);

    [Fact]
    public async Task ARevisionWalksProposedStartedHealthyVerifiedPromoted()
    {
        var ct = TestContext.Current.CancellationToken;
        var launcher = new FakeLauncher();
        await using var brain = await StartAsync(launcher, new FakeVerifier(), ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var started = await brain.Observe<RevisionStarted>(revision, ct);
        await using var healthy = await brain.Observe<RevisionHealthy>(revision, ct);
        await using var verified = await brain.Observe<RevisionVerified>(revision, ct);
        await using var promoted = await brain.Observe<RevisionPromoted>(revision, ct);

        Assert.Equal(RevisionStage.Proposed, (await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan)).Stage);
        Assert.Equal(RevisionStage.Healthy, (await revision.Start()).Stage);
        Assert.Equal("http://localhost:5091", (await started.NextAsync(ct: ct)).McpEndpoint);
        Assert.Equal("sha0001", (await healthy.NextAsync(ct: ct)).Sha);
        Assert.Equal(RevisionStage.Verified, (await revision.Verify(Plan)).Stage);
        Assert.True((await verified.NextAsync(ct: ct)).Report.Passed);
        var final = await revision.Promote();
        Assert.Equal(RevisionStage.Promoted, final.Stage);
        Assert.Equal("sha0001", (await promoted.NextAsync(ct: ct)).Sha);
        Assert.Equal([RevisionStage.Proposed, RevisionStage.Starting, RevisionStage.Started, RevisionStage.Healthy, RevisionStage.Verifying, RevisionStage.Verified, RevisionStage.Promoted], final.History);
        Assert.Equal(["start sha0001", "healthy sha0001", "promote sha0001"], launcher.Calls);
    }

    [Fact]
    public async Task PromoteIsRefusedBeforeVerification()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(new FakeLauncher(), new FakeVerifier(), ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var promoted = await brain.Observe<RevisionPromoted>(revision, ct);
        await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan);
        await revision.Start();
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => revision.Promote());
        Assert.Contains("Verified", error.Message, StringComparison.Ordinal);
        Assert.Equal(RevisionStage.Healthy, (await revision.Read()).Stage);
        Assert.Empty(promoted.Snapshot);
    }

    [Fact]
    public async Task AMismatchedExpectationNamesTheCheckThatFailed()
    {
        var ct = TestContext.Current.CancellationToken;
        var verifier = new FakeVerifier
        {
            Answer = (_, _) => Task.FromResult(new VerificationReport(
                [new("context", true, ""), new("call IApp owner/apps/calculator Read", false, "expected percent in operations")], TimeSpan.FromSeconds(1))),
        };
        await using var brain = await StartAsync(new FakeLauncher(), verifier, ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var failed = await brain.Observe<RevisionFailed>(revision, ct);
        await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan);
        await revision.Start();
        var snapshot = await revision.Verify(Plan);
        Assert.Equal(RevisionStage.Failed, snapshot.Stage);
        var signal = await failed.NextAsync(ct: ct);
        Assert.Equal(RevisionStage.Verifying, signal.Stage);
        Assert.Equal("call IApp owner/apps/calculator Read: expected percent in operations", signal.Reason);
        Assert.Equal("call IApp owner/apps/calculator Read", snapshot.Report!.FirstFailure);
        await Assert.ThrowsAsync<InvalidOperationException>(() => revision.Promote());
    }

    [Fact]
    public async Task ExceedingTheBudgetFailsTheVerifyStageOnce()
    {
        var ct = TestContext.Current.CancellationToken;
        var attempts = 0;
        var verifier = new FakeVerifier
        {
            Answer = async (_, token) => { attempts++; await Task.Delay(Timeout.InfiniteTimeSpan, token); throw new UnreachableException(); },
        };
        await using var brain = await StartAsync(new FakeLauncher(), verifier, ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var failed = await brain.Observe<RevisionFailed>(revision, ct);
        await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan);
        await revision.Start();
        var snapshot = await revision.Verify(Plan with { Budget = TimeSpan.FromMilliseconds(100) });
        Assert.Equal(RevisionStage.Failed, snapshot.Stage);
        Assert.Equal("budget 00:00:00.1000000 exceeded", (await failed.NextAsync(ct: ct)).Reason);
        Assert.Equal(1, attempts);
    }

    [Fact]
    public async Task AChildThatNeverTurnsHealthyFailsTheStartStage()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(new FakeLauncher { Healthy = false }, new FakeVerifier(), ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var failed = await brain.Observe<RevisionFailed>(revision, ct);
        await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan);
        Assert.Equal(RevisionStage.Failed, (await revision.Start()).Stage);
        Assert.Equal(RevisionStage.Started, (await failed.NextAsync(ct: ct)).Stage);
    }

    [Fact]
    public async Task DiscardStopsTheChildAndKeepsTheWorktreeOnTheSnapshot()
    {
        var ct = TestContext.Current.CancellationToken;
        var launcher = new FakeLauncher();
        await using var brain = await StartAsync(launcher, new FakeVerifier(), ct);
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await revision.Propose("os-runtime", @"E:\wt\sha0001", "change", Plan);
        await revision.Start();
        var discarded = await revision.Discard();
        Assert.Equal(RevisionStage.Discarded, discarded.Stage);
        Assert.Equal(@"E:\wt\sha0001", discarded.Worktree);
        Assert.Contains("discard sha0001", launcher.Calls);
    }
}
```

- [ ] **Step 4: Run them, expect compile failure**

`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests -- --filter-class "*RevisionFacts*"`
Expected: `'RevisionsModule' could not be found`, `'ILauncherClient' could not be found`.

- [ ] **Step 5: Implement the module, options, launcher seam, both neurons**

`Configuration/RevisionsOptions.cs`:

```csharp
using DigitalBrain.Framework.Modules;

namespace DigitalBrain.Revisions;

public sealed class RevisionsOptions : IModuleOptions
{
    public string LauncherUrl { get; set; } = "http://localhost:5079";
    // How long a child may take to answer /health after aspire run starts; a cold image build takes minutes.
    public TimeSpan StartBudget { get; set; } = TimeSpan.FromMinutes(10);

    public void Validate()
    {
        if (!Uri.TryCreate(LauncherUrl, UriKind.Absolute, out _)) { throw new ArgumentException("LauncherUrl must be an absolute URL."); }
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(StartBudget, TimeSpan.Zero);
    }
}
```

`Launcher/ILauncherClient.cs`:

```csharp
namespace DigitalBrain.Revisions;

public sealed record LauncherRevision(string Sha, string Worktree, string McpEndpoint, string UiEndpoint, string State);

// The launcher is the only process that touches worktrees, ports and aspire run; the brain asks.
public interface ILauncherClient
{
    Task<LauncherRevision> Propose(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct);
    Task<LauncherRevision> Start(string sha, CancellationToken ct);
    Task<LauncherRevision> WaitHealthy(string sha, TimeSpan budget, CancellationToken ct);
    Task<LauncherRevision> Promote(string sha, CancellationToken ct);
    Task Discard(string sha, CancellationToken ct);
}
```

`Launcher/HttpLauncherClient.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Revisions;

internal sealed class HttpLauncherClient(IHttpClientFactory http, IOptions<RevisionsOptions> options) : ILauncherClient
{
    private sealed record Wire(string Sha, string Worktree, string McpEndpoint, string UiEndpoint, string State);

    private HttpClient Client()
    {
        var client = http.CreateClient("revisions.launcher");
        client.BaseAddress = new Uri(options.Value.LauncherUrl);
        client.Timeout = Timeout.InfiniteTimeSpan;
        return client;
    }

    public Task<LauncherRevision> Propose(string branch, string summary, IReadOnlyDictionary<string, string> files, CancellationToken ct)
        => Read(Client().PostAsJsonAsync("/revisions", new { branch, summary, files }, ct), ct);

    public Task<LauncherRevision> Start(string sha, CancellationToken ct) => Read(Client().PostAsync($"/revisions/{sha}/start", null, ct), ct);

    public async Task<LauncherRevision> WaitHealthy(string sha, TimeSpan budget, CancellationToken ct)
    {
        using var response = await Client().PostAsync($"/revisions/{sha}/healthy?budget={budget}", null, ct);
        if (response.StatusCode is HttpStatusCode.GatewayTimeout or HttpStatusCode.BadGateway)
        { throw new TimeoutException(await response.Content.ReadAsStringAsync(ct)); }
        response.EnsureSuccessStatusCode();
        return ToRevision((await response.Content.ReadFromJsonAsync<Wire>(ct))!);
    }

    public Task<LauncherRevision> Promote(string sha, CancellationToken ct) => Read(Client().PostAsync($"/revisions/{sha}/promote", null, ct), ct);

    public async Task Discard(string sha, CancellationToken ct) => (await Client().DeleteAsync($"/revisions/{sha}", ct)).EnsureSuccessStatusCode();

    private static async Task<LauncherRevision> Read(Task<HttpResponseMessage> pending, CancellationToken ct)
    {
        using var response = await pending;
        if (!response.IsSuccessStatusCode)
        { throw new InvalidOperationException($"The launcher answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}"); }
        return ToRevision((await response.Content.ReadFromJsonAsync<Wire>(ct))!);
    }

    private static LauncherRevision ToRevision(Wire wire) => new(wire.Sha, wire.Worktree, wire.McpEndpoint, wire.UiEndpoint, wire.State);
}
```

`Verification/IRevisionVerifier.cs`:

```csharp
namespace DigitalBrain.Revisions;

public interface IRevisionVerifier
{
    Task<VerificationReport> Verify(string brainId, string mcpEndpoint, VerificationPlan plan, CancellationToken ct);
}
```

`Verification/RevisionVerifier.cs` (placeholder, replaced whole in Task 4):

```csharp
namespace DigitalBrain.Revisions;

internal sealed class RevisionVerifier : IRevisionVerifier
{
    public Task<VerificationReport> Verify(string brainId, string mcpEndpoint, VerificationPlan plan, CancellationToken ct)
        => throw new NotSupportedException("The verification driver arrives with the next change.");
}
```

`RevisionsModule.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Modules;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Orleans.Hosting;

namespace DigitalBrain.Revisions;

public sealed class RevisionsModule() : Module<RevisionsOptions>(new ModuleId("revisions"))
{
    public override System.Reflection.Assembly? Contracts => typeof(IRevision).Assembly;

    public override void Configure(ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        silo.Services.AddHttpClient();
        silo.Services.TryAddSingleton<ILauncherClient, HttpLauncherClient>();
        silo.Services.TryAddSingleton<IRevisionVerifier, RevisionVerifier>();
    }
}
```

`Revisions/RevisionState.cs`:

```csharp
namespace DigitalBrain.Revisions;

[GenerateSerializer, Alias("revisions.revision-state")]
internal sealed record RevisionState
{
    [Id(0)] public string Branch { get; init; } = "";
    [Id(1)] public string Worktree { get; init; } = "";
    [Id(2)] public string Summary { get; init; } = "";
    [Id(3)] public RevisionStage Stage { get; init; } = RevisionStage.Proposed;
    [Id(4)] public string? McpEndpoint { get; init; }
    [Id(5)] public VerificationPlan? Plan { get; init; }
    [Id(6)] public VerificationReport? Report { get; init; }
    [Id(7)] public string? Failure { get; init; }
    [Id(8)] public RevisionStage[] History { get; init; } = [];
}
```

`Revisions/RevisionNeuron.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Revisions.Signals;
using Microsoft.Extensions.Options;
using Orleans.Runtime;

namespace DigitalBrain.Revisions;

[GrainType("revisions.revision")]
internal sealed class RevisionNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<RevisionState> store,
    ILauncherClient launcher,
    IRevisionVerifier verifier,
    IOptions<RevisionsOptions> options)
    : Neuron<RevisionState>(store), IRevision
{
    private string Key => this.GetPrimaryKeyString();
    private string Sha => Key[(Key.LastIndexOf('/') + 1)..];
    private string BrainId => Key[..Key.IndexOf('/', StringComparison.Ordinal)];
    private IRevisions Index => GrainFactory.GetGrain<IRevisions>(BrainId);

    public Task<RevisionSnapshot> Read() => Task.FromResult(Describe());

    public async Task<RevisionSnapshot> Propose(string branch, string worktreePath, string summary, VerificationPlan plan)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(branch);
        ArgumentException.ThrowIfNullOrWhiteSpace(worktreePath);
        ArgumentNullException.ThrowIfNull(plan);
        if (Exists && Snapshot.History.Length > 0) { throw new InvalidOperationException($"Revision {Sha} is already {Snapshot.Stage}."); }
        await Move(RevisionStage.Proposed, new RevisionState { Branch = branch, Worktree = worktreePath, Summary = summary, Plan = plan }, new RevisionBuilding(Sha));
        return Describe();
    }

    public async Task<RevisionSnapshot> Queue()
    {
        Require(RevisionStage.Proposed);
        await Move(RevisionStage.Queued, Snapshot, null);
        return Describe();
    }

    public async Task<RevisionSnapshot> Start()
    {
        Require(RevisionStage.Proposed, RevisionStage.Queued);
        await Move(RevisionStage.Starting, Snapshot, null);
        try
        {
            var started = await launcher.Start(Sha, CancellationToken.None);
            await Move(RevisionStage.Started, Snapshot with { McpEndpoint = started.McpEndpoint }, new RevisionStarted(Sha, started.McpEndpoint));
            await launcher.WaitHealthy(Sha, options.Value.StartBudget, CancellationToken.None);
            await Move(RevisionStage.Healthy, Snapshot, new RevisionHealthy(Sha));
        }
        catch (Exception error) when (error is TimeoutException or InvalidOperationException or HttpRequestException)
        {
            await Fail(error.Message);
        }
        return Describe();
    }

    public async Task<RevisionSnapshot> Verify(VerificationPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        Require(RevisionStage.Healthy);
        var endpoint = Snapshot.McpEndpoint ?? throw new InvalidOperationException($"Revision {Sha} has no MCP endpoint.");
        await Move(RevisionStage.Verifying, Snapshot with { Plan = plan }, null);
        using var budget = new CancellationTokenSource(plan.Budget);
        VerificationReport report;
        try { report = await verifier.Verify(BrainId, endpoint, plan, budget.Token); }
        catch (OperationCanceledException) when (budget.IsCancellationRequested)
        {
            await Fail($"budget {plan.Budget} exceeded");
            return Describe();
        }
        catch (Exception error) when (error is InvalidOperationException or HttpRequestException)
        {
            await Fail(error.Message);
            return Describe();
        }
        if (report.Passed) { await Move(RevisionStage.Verified, Snapshot with { Report = report }, new RevisionVerified(Sha, report)); }
        else
        {
            var failed = report.Checks.First(check => !check.Passed);
            await Fail($"{failed.Name}: {failed.Detail}", Snapshot with { Report = report });
        }
        return Describe();
    }

    public async Task<RevisionSnapshot> Promote()
    {
        if (Snapshot.Stage != RevisionStage.Verified || !Snapshot.History.Contains(RevisionStage.Verified))
        { throw new InvalidOperationException($"Revision {Sha} is {Snapshot.Stage}; only a Verified revision can be promoted."); }
        await launcher.Promote(Sha, CancellationToken.None);
        await Move(RevisionStage.Promoted, Snapshot, new RevisionPromoted(Sha));
        await Index.Ended(Sha);
        return Describe();
    }

    public async Task<RevisionSnapshot> Discard()
    {
        if (Snapshot.Stage is RevisionStage.Promoted or RevisionStage.Discarded) { return Describe(); }
        if (Snapshot.McpEndpoint is not null) { await launcher.Discard(Sha, CancellationToken.None); }
        await Move(RevisionStage.Discarded, Snapshot, null);
        await Index.Ended(Sha);
        return Describe();
    }

    private void Require(params RevisionStage[] stages)
    {
        if (!stages.Contains(Snapshot.Stage)) { throw new InvalidOperationException($"Revision {Sha} is {Snapshot.Stage}; expected {string.Join(" or ", stages)}."); }
    }

    // The failed signal names the stage the revision was in, so a report reads "Verify failed", not "Failed failed".
    private async Task Fail(string reason, RevisionState? from = null)
    {
        var failedAt = Snapshot.Stage;
        await Move(RevisionStage.Failed, (from ?? Snapshot) with { Failure = reason }, new RevisionFailed(Sha, failedAt, reason));
        await Index.Ended(Sha);
    }

    private Task Move(RevisionStage stage, RevisionState next, Signal? acted)
        => Save(next with { Stage = stage, History = [.. next.History, stage] }, new RevisionChanged(Sha, stage), acted);

    private RevisionSnapshot Describe()
        => new(Sha, Snapshot.Branch, Snapshot.Worktree, Snapshot.Summary, Snapshot.Stage, Snapshot.McpEndpoint, Snapshot.Plan, Snapshot.Report, Snapshot.Failure, Snapshot.History);
}
```

`Start` and `Verify` interleave so `Read` and `Discard` reach the grain while a child boots; the `Require` at the top of each method guards against an interleaved second `Start`. (`AChildThatNeverTurnsHealthyFailsTheStartStage` expects `Stage: Started` on the signal because `WaitHealthy` fails after the `Started` move; the spec's "Stage" is the stage the revision was in when it failed.)

`Revisions/RevisionIndexState.cs`:

```csharp
namespace DigitalBrain.Revisions;

[GenerateSerializer, Alias("revisions.index-state")]
internal sealed record RevisionIndexState
{
    [Id(0)] public string[] Shas { get; init; } = [];
    [Id(1)] public string? Live { get; init; }
    [Id(2)] public string[] Queue { get; init; } = [];
}
```

`Revisions/RevisionIndexNeuron.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Revisions.Signals;
using Orleans.Concurrency;
using Orleans.Runtime;

namespace DigitalBrain.Revisions;

// At most one revision is live per brain; the rest wait here in proposal order.
[GrainType("revisions.index")]
internal sealed class RevisionIndexNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<RevisionIndexState> store,
    ILauncherClient launcher)
    : Neuron<RevisionIndexState>(store), IRevisions, IRevisionIndexWork
{
    private string BrainId => this.GetPrimaryKeyString();

    public async Task<string> Propose(RevisionProposal proposal)
    {
        ArgumentNullException.ThrowIfNull(proposal);
        var committed = await launcher.Propose(proposal.Branch, proposal.Summary, proposal.Files, CancellationToken.None);
        var revision = GrainFactory.GetGrain<IRevision>(IRevision.Key(BrainId, committed.Sha));
        await revision.Propose(proposal.Branch, committed.Worktree, proposal.Summary, proposal.Plan);
        if (Snapshot.Live is null)
        {
            await Save(Snapshot with { Shas = [.. Snapshot.Shas, committed.Sha], Live = committed.Sha }, new RevisionChanged(committed.Sha, RevisionStage.Starting));
            // One-way through a self reference: Start outlives the call and must not hold the index.
            await this.AsReference<IRevisionIndexWork>().StartLive(committed.Sha);
        }
        else
        {
            await Save(Snapshot with { Shas = [.. Snapshot.Shas, committed.Sha], Queue = [.. Snapshot.Queue, committed.Sha] }, new RevisionChanged(committed.Sha, RevisionStage.Queued));
            await revision.Queue();
        }
        return committed.Sha;
    }

    public Task<string[]> List() => Task.FromResult(Snapshot.Shas);
    public Task<string?> Live() => Task.FromResult(Snapshot.Live);

    public async Task Ended(string sha)
    {
        if (Snapshot.Live != sha) { return; }
        var next = Snapshot.Queue.FirstOrDefault();
        await Save(Snapshot with { Live = next, Queue = next is null ? [] : Snapshot.Queue[1..] }, new RevisionChanged(sha, RevisionStage.Discarded));
        if (next is not null) { await this.AsReference<IRevisionIndexWork>().StartLive(next); }
    }

    public Task StartLive(string sha) => GrainFactory.GetGrain<IRevision>(IRevision.Key(BrainId, sha)).Start();
}

[Alias("revisions.index-work"), Orleans.Metadata.DefaultGrainType("revisions.index")]
internal interface IRevisionIndexWork : IGrainWithStringKey
{
    [OneWay] Task StartLive(string sha);
}
```

- [ ] **Step 6: Run the stage-machine facts**

`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests -- --filter-class "*RevisionFacts*"`
Expected: green.

- [ ] **Step 7: Failing facts — the index queues a second proposal while one is live**

`RevisionIndexFacts.cs`:

```csharp
using DigitalBrain.Revisions;
using DigitalBrain.Revisions.Signals;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.Revisions.Tests;

public sealed class RevisionIndexFacts
{
    private static readonly VerificationPlan Plan = new([], [], [], TimeSpan.FromMinutes(1));

    private static Task<ModuleBrain> StartAsync(FakeLauncher launcher, CancellationToken ct)
        => ModuleTest.Create().WithModule<RevisionsModule>()
            .ConfigureSilo(silo => { silo.Services.AddSingleton<ILauncherClient>(launcher); silo.Services.AddSingleton<IRevisionVerifier>(new FakeVerifier()); })
            .StartAsync(ct);

    [Fact]
    public async Task ProposingCommitsThroughTheLauncherAndStartsTheRevision()
    {
        var ct = TestContext.Current.CancellationToken;
        var launcher = new FakeLauncher();
        await using var brain = await StartAsync(launcher, ct);
        var index = brain.Get<IRevisions>("owner");
        var revision = brain.Get<IRevision>(IRevision.Key("owner", "sha0001"));
        await using var changes = await brain.Observe<RevisionChanged>(revision, ct);
        var sha = await index.Propose(new("os-runtime", "Calculator: add percent", new() { ["src/DigitalBrain.OS/Apps/Calculator/app.json"] = "{}" }, Plan));
        Assert.Equal("sha0001", sha);
        while ((await revision.Read()).Stage != RevisionStage.Healthy) { await changes.NextAsync(ct: ct); }
        Assert.Equal(["propose sha0001", "start sha0001", "healthy sha0001"], launcher.Calls);
        Assert.Equal(@"E:\wt\sha0001", (await revision.Read()).Worktree);
        Assert.Equal([sha], await index.List());
        Assert.Equal(sha, await index.Live());
    }

    [Fact]
    public async Task ASecondProposalQueuesUntilTheLiveRevisionEnds()
    {
        var ct = TestContext.Current.CancellationToken;
        var launcher = new FakeLauncher();
        await using var brain = await StartAsync(launcher, ct);
        var index = brain.Get<IRevisions>("owner");
        var first = await index.Propose(new("os-runtime", "first", new(), Plan));
        var second = await index.Propose(new("os-runtime", "second", new(), Plan));
        var queued = brain.Get<IRevision>(IRevision.Key("owner", second));
        Assert.Equal(RevisionStage.Queued, (await queued.Read()).Stage);
        Assert.Equal(first, await index.Live());
        Assert.DoesNotContain("start sha0002", launcher.Calls);

        await using var changes = await brain.Observe<RevisionChanged>(queued, ct);
        var live = brain.Get<IRevision>(IRevision.Key("owner", first));
        await using var liveChanges = await brain.Observe<RevisionChanged>(live, ct);
        while ((await live.Read()).Stage != RevisionStage.Healthy) { await liveChanges.NextAsync(ct: ct); }
        await live.Discard();
        while ((await queued.Read()).Stage != RevisionStage.Healthy) { await changes.NextAsync(ct: ct); }
        Assert.Equal(second, await index.Live());
        Assert.Contains("start sha0002", launcher.Calls);
    }
}
```

- [ ] **Step 8: Run the index facts**

`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests -- --filter-class "*RevisionIndexFacts*"`
Expected: green with the Step 5 code; a red here means `StartLive` is not one-way (the index would deadlock on its own `Start`) — fix the `[OneWay]` reference, never add a delay.

- [ ] **Step 9: Build and run the whole module suite plus the architecture tests**

`dotnet build src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/DigitalBrain.Modules.Revisions.csproj`
`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests`
`dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: green (Contracts references only `DigitalBrain`; the module reads no credential configuration).

- [ ] **Step 10: Commit**

```
git add DigitalBrain.slnx src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/DigitalBrain.Modules.Revisions.Contracts.csproj src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/IRevision.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/IRevisions.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/RevisionSnapshot.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/VerificationPlan.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/Signals/RevisionSignals.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/DigitalBrain.Modules.Revisions.csproj src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/RevisionsModule.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Configuration/RevisionsOptions.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/ILauncherClient.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/HttpLauncherClient.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/IRevisionVerifier.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/RevisionVerifier.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionState.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionIndexNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Revisions/RevisionIndexState.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/DigitalBrain.Modules.Revisions.Tests.csproj src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeLauncher.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeVerifier.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionFacts.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionIndexFacts.cs
git commit -m "Revisions: IRevision stage machine, IRevisions single-live queue, launcher seam, Promote refused before Verified

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Verification driver — the child's MCP over HTTP, its Aspire state, its spans

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/McpNeuronClient.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/RevisionVerifier.cs` (replace the placeholder)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/ILauncherClient.cs` (add `Spans`)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/HttpLauncherClient.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeLauncher.cs` (add `Spans`)
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/ScriptedMcpServer.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionVerifierFacts.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Telemetry/IAspireTelemetry.cs`
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Telemetry/AspireCliTelemetry.cs`
- Modify: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/LauncherEndpoints.cs` (add `GET /revisions/{sha}/spans`)
- Modify: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/Program.cs`
- Modify: `src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj` (add `ModelContextProtocol.Core`)
- Create: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeAspireTelemetry.cs`
- Modify: `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/LauncherEndpointFacts.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/DigitalBrain.Modules.Revisions.Tests.csproj` (add `Microsoft.AspNetCore.Mvc.Testing` is not needed; the scripted server is a `WebApplication` on `127.0.0.1:0` as in `McpIdentityFacts`)

**Interfaces:**
- Consumes: the MCP server's HTTP JSON-RPC shape proven in `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/McpIdentityFacts.cs` — `POST {mcp}/brains/{brain}/mcp` with `Accept: application/json, text/event-stream`, body `{jsonrpc:"2.0", id, method:"tools/call", params:{name, arguments}}`, answer as SSE `data:` line whose `result.content[0].text` is the tool's JSON; tools `neurons_context`, `neurons_get(contract, key)`, `neurons_call(contract, key, method, arguments)`; the child's `IAspire` state is readable as `neurons_get("DigitalBrain.Microsoft.Aspire.IAspire", plan.AspireKey)` whose JSON holds `Resources` keyed by name with `State` and `Health` (`AspireNeuron.ListResources`). `aspire mcp start` (Aspire CLI 13.6) is a stdio MCP server with tools `list_apphosts`, `select_apphost`, `list_traces`; ModelContextProtocol 2.2.0 `StdioClientTransport` + `McpClient.CreateAsync` + `CallToolAsync`.
- Produces:
  - `internal sealed class McpNeuronClient(HttpClient http, string mcpEndpoint, string brainId)` with `Task<JsonElement> Call(string tool, object arguments, CancellationToken ct)`; throws `InvalidOperationException` carrying the server's error text on `isError` or a non-2xx.
  - `internal sealed class RevisionVerifier(IHttpClientFactory http, ILauncherClient launcher) : IRevisionVerifier` — checks in order: `context` (brainId of `neurons_context` equals the parent's), one `resource {name}` per `HealthyResources`, one `call {Contract} {Key} {Method}` per expectation, one `span {name}` per `Spans`; stops at the first failed check; every check records `Detail`.
  - `ILauncherClient.Spans(string sha, string name, CancellationToken ct) : Task<int>` — count of spans with that name in the child's traces; `GET /revisions/{sha}/spans?name=` on the launcher.
  - Launcher: `public interface IAspireTelemetry { Task<int> CountSpans(string appHostPath, string name, CancellationToken ct); }`, `AspireCliTelemetry` spawning `aspire mcp start` once and keeping the client.

- [ ] **Step 1: Failing facts — verifier against a scripted MCP server**

`ScriptedMcpServer.cs`:

```csharp
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace DigitalBrain.Modules.Revisions.Tests;

// The child's MCP as a script: each tools/call is answered from the table by tool name plus
// contract/key/method, in the SSE shape the real server uses.
internal sealed class ScriptedMcpServer : IAsyncDisposable
{
    private readonly WebApplication _app;
    public Dictionary<string, string> Answers { get; } = new(StringComparer.Ordinal);
    public List<string> Calls { get; } = [];
    public string Endpoint => _app.Urls.Single();

    private ScriptedMcpServer(WebApplication app) => _app = app;

    public static async Task<ScriptedMcpServer> StartAsync(CancellationToken ct)
    {
        var builder = WebApplication.CreateBuilder();
        var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:0");
        var server = new ScriptedMcpServer(app);
        app.MapPost("/brains/{brain}/mcp", async (string brain, HttpContext context) =>
        {
            using var request = await JsonDocument.ParseAsync(context.Request.Body, cancellationToken: context.RequestAborted);
            var parameters = request.RootElement.GetProperty("params");
            var tool = parameters.GetProperty("name").GetString()!;
            var arguments = parameters.GetProperty("arguments");
            var key = tool switch
            {
                "neurons_context" => "neurons_context",
                "neurons_get" => $"neurons_get {arguments.GetProperty("contract").GetString()} {arguments.GetProperty("key").GetString()}",
                _ => $"neurons_call {arguments.GetProperty("contract").GetString()} {arguments.GetProperty("key").GetString()} {arguments.GetProperty("method").GetString()}",
            };
            server.Calls.Add(key);
            var text = server.Answers.TryGetValue(key, out var answer) ? answer : (tool == "neurons_context" ? $"{{\"principalId\":\"owner\",\"brainId\":\"{brain}\"}}" : null);
            var result = text is null
                ? new { content = new[] { new { type = "text", text = $"no script for {key}" } }, isError = true }
                : new { content = new[] { new { type = "text", text } }, isError = false };
            context.Response.ContentType = "text/event-stream";
            await context.Response.WriteAsync("event: message\ndata: " + JsonSerializer.Serialize(new { jsonrpc = "2.0", id = request.RootElement.GetProperty("id").GetInt32(), result }) + "\n\n", context.RequestAborted);
        });
        await app.StartAsync(ct);
        return server;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();
}
```

`RevisionVerifierFacts.cs`:

```csharp
using DigitalBrain.Revisions;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.Revisions.Tests;

public sealed class RevisionVerifierFacts
{
    private const string AspireJson = "{\"Resources\":{\"OperatingSystem\":{\"Name\":\"OperatingSystem\",\"Type\":\"Project\",\"State\":\"Running\",\"Health\":\"Healthy\",\"Urls\":[]},\"digitalbrain-mcp\":{\"Name\":\"digitalbrain-mcp\",\"Type\":\"Project\",\"State\":\"Running\",\"Health\":null,\"Urls\":[]}}}";

    private static RevisionVerifier Subject(FakeLauncher launcher)
    {
        var services = new ServiceCollection();
        services.AddHttpClient();
        return new RevisionVerifier(services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>(), launcher);
    }

    [Fact]
    public async Task EveryExpectationIsCheckedAgainstTheChildAndReported()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var child = await ScriptedMcpServer.StartAsync(ct);
        child.Answers["neurons_get DigitalBrain.Microsoft.Aspire.IAspire DigitalBrain.OS"] = AspireJson;
        child.Answers["neurons_call DigitalBrain.Apps.IApp owner/apps/calculator Read"] = "{\"Name\":\"calculator\",\"Manifest\":{\"Operations\":[{\"Name\":\"open\"},{\"Name\":\"percent\"}]}}";
        var launcher = new FakeLauncher { SpanCounts = { ["Neuron/Read"] = 3 } };
        var plan = new VerificationPlan(
            [new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "\"Name\":\"percent\"")],
            ["OperatingSystem"], ["Neuron/Read"], TimeSpan.FromMinutes(1));
        var report = await Subject(launcher).Verify("owner", child.Endpoint, plan, ct);
        Assert.True(report.Passed, string.Join("; ", report.Checks.Select(check => check.Name + ": " + check.Detail)));
        Assert.Equal(["context", "resource OperatingSystem", "call DigitalBrain.Apps.IApp owner/apps/calculator Read", "span Neuron/Read"], report.Checks.Select(check => check.Name));
        Assert.Equal(["neurons_context", "neurons_get DigitalBrain.Microsoft.Aspire.IAspire DigitalBrain.OS", "neurons_call DigitalBrain.Apps.IApp owner/apps/calculator Read"], child.Calls);
    }

    [Fact]
    public async Task AMismatchedExpectationNamesTheCheckThatFailed()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var child = await ScriptedMcpServer.StartAsync(ct);
        child.Answers["neurons_call DigitalBrain.Apps.IApp owner/apps/calculator Read"] = "{\"Manifest\":{\"Operations\":[{\"Name\":\"open\"}]}}";
        var plan = new VerificationPlan([new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "\"Name\":\"percent\"")], [], [], TimeSpan.FromMinutes(1));
        var report = await Subject(new FakeLauncher()).Verify("owner", child.Endpoint, plan, ct);
        Assert.False(report.Passed);
        Assert.Equal("call DigitalBrain.Apps.IApp owner/apps/calculator Read", report.FirstFailure);
        Assert.Contains("\"Name\":\"percent\"", report.Checks.Last().Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AnUnhealthyResourceFailsBeforeAnyCallIsMade()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var child = await ScriptedMcpServer.StartAsync(ct);
        child.Answers["neurons_get DigitalBrain.Microsoft.Aspire.IAspire DigitalBrain.OS"] = AspireJson;
        var plan = new VerificationPlan([new("DigitalBrain.Apps.IApp", "owner/apps/calculator", "Read", "[]", "*")], ["digitalbrain-mcp"], [], TimeSpan.FromMinutes(1));
        var report = await Subject(new FakeLauncher()).Verify("owner", child.Endpoint, plan, ct);
        Assert.Equal("resource digitalbrain-mcp", report.FirstFailure);
        Assert.DoesNotContain(child.Calls, call => call.StartsWith("neurons_call", StringComparison.Ordinal));
    }

    [Fact]
    public async Task TheChildMustAnswerForTheSameBrain()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var child = await ScriptedMcpServer.StartAsync(ct);
        child.Answers["neurons_context"] = "{\"principalId\":\"owner\",\"brainId\":\"other\"}";
        var report = await Subject(new FakeLauncher()).Verify("owner", child.Endpoint, new([], [], [], TimeSpan.FromMinutes(1)), ct);
        Assert.Equal("context", report.FirstFailure);
    }

    [Fact]
    public async Task AMissingSpanIsAFailedCheck()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var child = await ScriptedMcpServer.StartAsync(ct);
        var report = await Subject(new FakeLauncher()).Verify("owner", child.Endpoint, new([], [], ["Neuron/Promote"], TimeSpan.FromMinutes(1)), ct);
        Assert.Equal("span Neuron/Promote", report.FirstFailure);
    }
}
```

Add to `FakeLauncher`: `public Dictionary<string, int> SpanCounts { get; } = new(StringComparer.Ordinal);` and `public Task<int> Spans(string sha, string name, CancellationToken ct) => Task.FromResult(SpanCounts.GetValueOrDefault(name));`.

- [ ] **Step 2: Run them, expect compile failure**

`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests -- --filter-class "*RevisionVerifierFacts*"`
Expected: `'ILauncherClient' does not contain a definition for 'Spans'`; `RevisionVerifier` has no two-argument constructor.

- [ ] **Step 3: Implement the MCP client and the verifier**

`Verification/McpNeuronClient.cs`:

```csharp
using System.Text.Json;

namespace DigitalBrain.Revisions;

// One stateless tools/call per request, the way McpIdentityFacts drives the real server.
internal sealed class McpNeuronClient(HttpClient http, string mcpEndpoint, string brainId)
{
    private int _id;

    public async Task<JsonElement> Call(string tool, object arguments, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{mcpEndpoint.TrimEnd('/')}/brains/{brainId}/mcp")
        {
            Content = JsonContent.Create(new { jsonrpc = "2.0", id = ++_id, method = "tools/call", @params = new { name = tool, arguments } }),
        };
        request.Headers.Accept.ParseAdd("application/json, text/event-stream");
        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) { throw new InvalidOperationException($"{tool} answered {(int)response.StatusCode}: {body}"); }
        var data = body.Split('\n').FirstOrDefault(line => line.StartsWith("data: ", StringComparison.Ordinal))?[6..] ?? body;
        using var envelope = JsonDocument.Parse(data);
        if (envelope.RootElement.TryGetProperty("error", out var error)) { throw new InvalidOperationException($"{tool}: {error}"); }
        var result = envelope.RootElement.GetProperty("result");
        var text = result.GetProperty("content")[0].GetProperty("text").GetString() ?? "";
        if (result.TryGetProperty("isError", out var isError) && isError.GetBoolean()) { throw new InvalidOperationException($"{tool}: {text}"); }
        return JsonDocument.Parse(text.Length == 0 ? "null" : text).RootElement.Clone();
    }
}
```

`Verification/RevisionVerifier.cs`:

```csharp
using System.Diagnostics;
using System.Text.Json;

namespace DigitalBrain.Revisions;

// The developer's loop as a neuron: the child's MCP answers for the same brain, the named
// resources are Running and Healthy, every expectation answers as written, every span appears.
internal sealed class RevisionVerifier(IHttpClientFactory http, ILauncherClient launcher) : IRevisionVerifier
{
    private const string AspireContract = "DigitalBrain.Microsoft.Aspire.IAspire";

    public async Task<VerificationReport> Verify(string brainId, string mcpEndpoint, VerificationPlan plan, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(plan);
        var clock = Stopwatch.StartNew();
        var client = new McpNeuronClient(http.CreateClient("revisions.child"), mcpEndpoint, brainId);
        List<VerificationCheck> checks = [];
        foreach (var check in Checks(brainId, mcpEndpoint, plan, client))
        {
            VerificationCheck outcome;
            try { outcome = await check(ct); }
            catch (Exception error) when (error is InvalidOperationException or HttpRequestException or JsonException)
            { outcome = new(checks.Count.ToString(System.Globalization.CultureInfo.InvariantCulture), false, error.Message); }
            checks.Add(outcome);
            if (!outcome.Passed) { break; }
        }
        return new([.. checks], clock.Elapsed);
    }

    private IEnumerable<Func<CancellationToken, Task<VerificationCheck>>> Checks(string brainId, string mcpEndpoint, VerificationPlan plan, McpNeuronClient client)
    {
        yield return async ct =>
        {
            var context = await client.Call("neurons_context", new { }, ct);
            var answered = context.GetProperty("brainId").GetString();
            return new("context", answered == brainId, $"child answers for brain '{answered}'");
        };
        foreach (var resource in plan.HealthyResources)
        {
            yield return async ct =>
            {
                var aspire = await client.Call("neurons_get", new { contract = AspireContract, key = plan.AspireKey }, ct);
                if (!aspire.GetProperty("Resources").TryGetProperty(resource, out var known)) { return new($"resource {resource}", false, "not reported by the child's AppHost"); }
                var state = known.GetProperty("State").GetString();
                var health = known.TryGetProperty("Health", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() : null;
                return new($"resource {resource}", state == "Running" && health == "Healthy", $"{state}/{health ?? "unknown"}");
            };
        }
        foreach (var call in plan.Calls)
        {
            yield return async ct =>
            {
                var answer = await client.Call("neurons_call", new { contract = call.Contract, key = call.Key, method = call.Method, arguments = call.Arguments }, ct);
                var text = answer.ValueKind == JsonValueKind.Null ? "null" : answer.GetRawText();
                var passed = call.Expected == "*" || text.Contains(call.Expected, StringComparison.Ordinal);
                return new($"call {call.Contract} {call.Key} {call.Method}", passed, passed ? text : $"expected {call.Expected}; answered {text}");
            };
        }
        var endpoint = mcpEndpoint;
        foreach (var span in plan.Spans)
        {
            yield return async ct =>
            {
                var count = await launcher.Spans(endpoint, span, ct);
                return new($"span {span}", count > 0, $"{count} span(s)");
            };
        }
    }
}
```

`Spans` is keyed by the child's MCP endpoint rather than the sha so the verifier needs no second argument; `HttpLauncherClient.Spans` sends `GET /revisions/spans?endpoint={mcpEndpoint}&name={name}` and the launcher resolves the revision by `McpEndpoint`. Add to `ILauncherClient`: `Task<int> Spans(string mcpEndpoint, string name, CancellationToken ct);` and in `HttpLauncherClient`:

```csharp
public async Task<int> Spans(string mcpEndpoint, string name, CancellationToken ct)
    => await Client().GetFromJsonAsync<int>($"/revisions/spans?endpoint={Uri.EscapeDataString(mcpEndpoint)}&name={Uri.EscapeDataString(name)}", ct);
```

Update `FakeLauncher.Spans` to that signature. Run Step 2 again: green.

- [ ] **Step 4: Failing launcher fact — spans are answered by the Aspire CLI MCP**

`FakeAspireTelemetry.cs`:

```csharp
using DigitalBrain.Launcher.Telemetry;

namespace DigitalBrain.Launcher.Tests.Unit;

internal sealed class FakeAspireTelemetry : IAspireTelemetry
{
    public Dictionary<(string AppHost, string Span), int> Counts { get; } = [];
    public Task<int> CountSpans(string appHostPath, string name, CancellationToken ct) => Task.FromResult(Counts.GetValueOrDefault((appHostPath, name)));
}
```

Add to `LauncherEndpointFacts`:

```csharp
[Fact]
public async Task SpansAreCountedInTheRevisionOwningTheEndpoint()
{
    var ct = TestContext.Current.CancellationToken;
    var root = Directory.CreateTempSubdirectory("launcher-spans-").FullName;
    var processes = new FakeProcessRunner { Answer = (_, args) => args[0] == "rev-parse" ? new(0, "abc1234\n", "") : new(0, "", "") };
    var telemetry = new FakeAspireTelemetry();
    telemetry.Counts[(Path.Combine(root, ".revisions", "abc1234", "src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj"), "Neuron/Read")] = 2;
    var builder = WebApplication.CreateBuilder();
    builder.Services.AddSingleton(new LauncherOptions { Repository = root, RevisionsPath = Path.Combine(root, "revisions.json") });
    builder.Services.AddSingleton<IProcessRunner>(processes);
    builder.Services.AddSingleton<IStorageCopier>(new FakeStorageCopier());
    builder.Services.AddSingleton(new HealthProbe(_ => Task.FromResult(HttpStatusCode.OK)));
    builder.Services.AddSingleton<IAspireTelemetry>(telemetry);
    builder.Services.AddRevisionProxy(5080, 5081);
    builder.Services.AddSingleton<Revisions>();
    await using var app = builder.Build();
    app.Urls.Add("http://127.0.0.1:0");
    app.MapLauncher();
    await app.StartAsync(ct);
    using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
    (await client.PostAsJsonAsync("/revisions", new { branch = "os-runtime", summary = "change", files = new Dictionary<string, string>() }, ct)).EnsureSuccessStatusCode();
    Assert.Equal(2, await client.GetFromJsonAsync<int>("/revisions/spans?endpoint=http%3A%2F%2Flocalhost%3A5091&name=Neuron%2FRead", ct));
    Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/revisions/spans?endpoint=http%3A%2F%2Flocalhost%3A9999&name=x", ct)).StatusCode);
    await app.StopAsync(ct);
    Directory.Delete(root, recursive: true);
}
```

- [ ] **Step 5: Run it, expect compile failure**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit -- --filter-method "*SpansAreCounted*"`
Expected: `'IAspireTelemetry' could not be found`.

- [ ] **Step 6: Implement the telemetry seam and the endpoint**

Add `<PackageReference Include="ModelContextProtocol.Core" />` to `DigitalBrain.Launcher.csproj` (version already pinned at 2.2.0).

`Telemetry/IAspireTelemetry.cs`:

```csharp
namespace DigitalBrain.Launcher.Telemetry;

public interface IAspireTelemetry
{
    Task<int> CountSpans(string appHostPath, string name, CancellationToken ct);
}
```

`Telemetry/AspireCliTelemetry.cs`:

```csharp
using System.Text.Json;
using ModelContextProtocol.Client;

namespace DigitalBrain.Launcher.Telemetry;

// The Aspire CLI's own MCP server sees every running AppHost on this machine; the launcher asks
// it for traces so a revision's spans are read the same way a developer reads them.
internal sealed class AspireCliTelemetry : IAspireTelemetry, IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private McpClient? _client;

    public async Task<int> CountSpans(string appHostPath, string name, CancellationToken ct)
    {
        var client = await ClientAsync(ct);
        await client.CallToolAsync("select_apphost", new Dictionary<string, object?> { ["apphost_path"] = appHostPath }, cancellationToken: ct);
        var traces = await client.CallToolAsync("list_traces", new Dictionary<string, object?>(), cancellationToken: ct);
        var text = string.Concat(traces.Content.OfType<ModelContextProtocol.Protocol.TextContentBlock>().Select(block => block.Text));
        var count = 0;
        var cursor = 0;
        while ((cursor = text.IndexOf(name, cursor, StringComparison.Ordinal)) >= 0) { count++; cursor += name.Length; }
        return count;
    }

    private async Task<McpClient> ClientAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            return _client ??= await McpClient.CreateAsync(new StdioClientTransport(new() { Name = "aspire", Command = "aspire", Arguments = ["mcp", "start"] }), cancellationToken: ct);
        }
        finally { _gate.Release(); }
    }

    public async ValueTask DisposeAsync() { if (_client is not null) { await _client.DisposeAsync(); } }
}
```

Check the exact 2.2.0 names (`McpClient.CreateAsync`, `StdioClientTransport`, `StdioClientTransportOptions`, `CallToolAsync`, `TextContentBlock`) against the package before building; the `aspire mcp` tool names come from `mcp__aspire__*` in this repo's tooling (`select_apphost`, `list_traces`, `list_apphosts`).

`LauncherEndpoints.MapLauncher`, add:

```csharp
app.MapGet("/revisions/spans", async (string endpoint, string name, Revisions revisions, LauncherOptions options, Telemetry.IAspireTelemetry telemetry, CancellationToken ct) =>
{
    var revision = revisions.List().Revisions.SingleOrDefault(known => known.McpEndpoint == endpoint);
    if (revision is null) { return Results.NotFound(); }
    return Results.Ok(await telemetry.CountSpans(Path.Combine(revision.Worktree, options.AppHostProject), name, ct));
});
```

`Program.cs`: `builder.Services.AddSingleton<IAspireTelemetry, AspireCliTelemetry>();`.

- [ ] **Step 7: Run both suites**

`dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit`
`dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests`
Expected: green.

- [ ] **Step 8: Commit**

```
git add src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/McpNeuronClient.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Verification/RevisionVerifier.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/ILauncherClient.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions/Launcher/HttpLauncherClient.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/FakeLauncher.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/ScriptedMcpServer.cs src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests/RevisionVerifierFacts.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Telemetry/IAspireTelemetry.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Telemetry/AspireCliTelemetry.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/LauncherEndpoints.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/Program.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher/DigitalBrain.Launcher.csproj src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/FakeAspireTelemetry.cs src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit/LauncherEndpointFacts.cs
git commit -m "Revisions: verification driver over the child's MCP, Aspire state and spans

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The `os/selfimprove` app — one synapse per reaction, surface, E2E

**Files:**
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/app.json`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/app.spec.md`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/icon.svg`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/lib/SelfImprove.cs`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/synapses/open.cs`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/synapses/request.cs`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/synapses/healthy.cs`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/synapses/verified.cs`
- Create: `src/DigitalBrain.OS/Apps/SelfImprove/synapses/failed.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs` (default app list gains `os/selfimprove`)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs` (shipped names and default count)
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsSelfImproveAppFacts.cs`
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/SelfImproveFacts.cs`
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/FakeLauncherHost.cs`

**Interfaces:**
- Consumes: `IApp`/`AppRequested` (`DigitalBrain.Apps`), `IRevisions`/`IRevision`/signals (`DigitalBrain.Revisions`), `IText` (`DigitalBrain.Flutter.Text`), `ISurface`/`ILayout`/`IWorkspace` as `Calculator` composes them, `DigitalBrainClient.ConnectAsync(args)`, `brain.Setting("App")`, `brain.Setting("Brain")`, `brain.On<T>(source, brain.Stopping)`. The index neuron's `RevisionChanged` is the one subscription the app needs for new shas: `IRevisions` publishes `RevisionChanged(sha, Starting|Queued)` on every `Propose`.
- Produces: the app `selfimprove` with operations `open` and `request`; neuron `{app}/revisions` (`IText`, markdown list of `sha — stage` lines, the surface the shell shows); `{app}/report` (`IText`, the last failure or verification report); `{app}/last` (`IText`, the sha of the last proposal, the request's answer).
- `request` input is a JSON document `{"branch": "...", "summary": "...", "files": {"path": "content"}, "plan": {"calls": [...], "healthyResources": [...], "spans": [...], "budget": "00:05:00"}}` — the change set the Creator (or a person) wrote. Writing the change set with a model is Task 5's open design front (see the report); the app takes the change set as data.

- [ ] **Step 1: Failing unit facts — the bundle declares its operations, files and compiles**

`OsSelfImproveAppFacts.cs`:

```csharp
using DigitalBrain.Apps;

namespace DigitalBrain.OS.Tests.Unit;

public sealed class OsSelfImproveAppFacts
{
    [Fact]
    public void TheShippedSelfImproveAppDeclaresItsOperationsAndOneSynapsePerReaction()
    {
        var bundle = new EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()
            .Single(app => app.Name == "selfimprove");
        Assert.Equal(["open", "request"], bundle.Manifest.Operations.Select(operation => operation.Name));
        Assert.Equal("icon.svg", bundle.Manifest.Icon);
        Assert.Contains("lib/SelfImprove.cs", bundle.Files.Keys);
        Assert.Equal(["synapses/failed.cs", "synapses/healthy.cs", "synapses/open.cs", "synapses/request.cs", "synapses/verified.cs"],
            bundle.Files.Keys.Where(file => file.StartsWith("synapses/", StringComparison.Ordinal)).Order());
        Assert.Contains("## Scenario:", bundle.Spec, StringComparison.Ordinal);
    }
}
```

Update `OsShippedAppFacts.TheOperatingSystemShipsSettings` to `["assistant", "calculator", "datavisualizer", "router", "selfimprove", "settings"]`, `AddOperatingSystemAppsNamesItsOwnManifestAndADeploymentOnlyAdds` to include `"os/selfimprove"` after `"os/datavisualizer"`, and `RegisteringTheOsAppsTwiceDoesNotDuplicateTheManifest` to `6`.

- [ ] **Step 2: Run them, expect failure**

`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-class "*OsSelfImproveAppFacts*" --filter-class "*OsShippedAppFacts*"`
Expected: `Sequence contains no matching element` (no `selfimprove` bundle), and the shipped-names assertion fails.

- [ ] **Step 3: Write the bundle**

`app.json`:

```json
{
  "name": "selfimprove",
  "title": "Self-improve",
  "description": "Propose a change to the brain's own source, run it as a sibling revision, verify it, promote it.",
  "version": "1.0.0",
  "icon": "icon.svg",
  "operations": [
    { "name": "open", "description": "Open the revisions list; input \"docked\" composes it for the side panel." },
    { "name": "request", "description": "Propose a change set: JSON with branch, summary, files and the verification plan. The answer is the revision's sha in the last neuron." }
  ],
  "settings": []
}
```

`app.spec.md`:

```markdown
# Self-improve

The loop a developer runs by hand, as an app: a change set becomes a revision, the revision runs as a
sibling cluster, the current brain verifies it over MCP, and a verified revision is promoted. The
revisions neuron lists every revision and its stage; it is the surface the shell shows.

## Scenario: A request proposes and starts a revision

Invoking "request" with a change set (branch, summary, files, plan) proposes it through the brain's
revisions index; the last neuron holds the new sha and the revisions list shows it as Starting.

## Scenario: A healthy revision is verified with its plan

When a revision publishes RevisionHealthy, the app asks it to Verify with the plan it was proposed with.

## Scenario: A verified revision is promoted

When a revision publishes RevisionVerified, the app asks it to Promote; the list shows Promoted.

## Scenario: A failed revision shows its report and keeps its worktree

When a revision publishes RevisionFailed, the report neuron names the stage, the reason and the
worktree path; nothing is retried.

## Scenario: Opening shows the list

Invoking "open" composes a surface with the revisions list and the report, and opens a "Self-improve" window.
```

`icon.svg`: a 24x24 circular-arrow glyph (copy `src/DigitalBrain.OS/Apps/Calculator/icon.svg` and replace the paths with `<path d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6V4z"/><path d="M12 2l4 3-4 3z"/>`).

`lib/SelfImprove.cs`:

```csharp
using System.Text.Json;
using DigitalBrain.Client;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Layout;
using DigitalBrain.Flutter.Surface;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Workspace;
using DigitalBrain.Revisions;

// Shared by every synapse: the app's key, its brain, the change-set shape and the list rendering.
public static class SelfImprove
{
    public static string Key(DigitalBrainConnection brain) => brain.Setting("App")!;
    public static string Scope(DigitalBrainConnection brain) => brain.Setting("Brain")!;

    public sealed record ChangeSet(string Branch, string Summary, Dictionary<string, string> Files, PlanJson Plan);
    public sealed record PlanJson(CallJson[] Calls, string[] HealthyResources, string[] Spans, string Budget, string? AspireKey);
    public sealed record CallJson(string Contract, string Key, string Method, string Arguments, string Expected);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static RevisionProposal Parse(string input)
    {
        var change = JsonSerializer.Deserialize<ChangeSet>(input, Json) ?? throw new ArgumentException("A change set is a JSON object.");
        var plan = new VerificationPlan(
            [.. change.Plan.Calls.Select(call => new NeuronExpectation(call.Contract, call.Key, call.Method, call.Arguments, call.Expected))],
            change.Plan.HealthyResources, change.Plan.Spans, TimeSpan.Parse(change.Plan.Budget, System.Globalization.CultureInfo.InvariantCulture),
            change.Plan.AspireKey ?? "DigitalBrain.OS");
        return new(change.Branch, change.Summary, change.Files, plan);
    }

    // The list is rebuilt from the index every time, never patched.
    public static async Task RenderListAsync(DigitalBrainConnection brain)
    {
        var scope = Scope(brain);
        var lines = new List<string>();
        foreach (var sha in await brain.Get<IRevisions>(scope).List())
        {
            var revision = await brain.Get<IRevision>(IRevision.Key(scope, sha)).Read();
            lines.Add($"- `{sha}` — {revision.Stage} — {revision.Summary}");
        }
        await brain.Get<IText>(Key(brain) + "/revisions").Set(lines.Count == 0 ? "_No revisions yet._" : string.Join("\n", lines));
    }

    public static async Task ComposeAsync(DigitalBrainConnection brain)
    {
        var appKey = Key(brain);
        string Name(string part) => appKey + "/" + part;
        var main = brain.Get<ILayout>(Name("main"));
        await main.Set(new LayoutDefinition("column", [new UiChildRef(UIVocabulary.TextType, Name("revisions")), new UiChildRef(UIVocabulary.TextType, Name("report"))], Extents: [0, 160]), (await main.Read()).Revision);
        var surface = brain.Get<ISurface>(Name("surface"));
        await surface.Set(new SurfaceDefinition("Self-improve", [new UiChildRef(UIVocabulary.LayoutType, Name("main"))]), (await surface.Read()).Revision);
    }

    public static Task OpenWindowAsync(DigitalBrainConnection brain, CancellationToken ct)
        => brain.Get<IWorkspace>(Scope(brain)).EnsureOpenAsync(Key(brain) + "/window", "Self-improve",
            WindowReference.For(new UiChildRef(UIVocabulary.SurfaceType, Key(brain) + "/surface")), ct);
}
```

`synapses/open.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;

// Opening: compose the surface, render the list, open the window unless docked.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(SelfImprove.Key(brain));
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "open") { continue; }
    await SelfImprove.ComposeAsync(brain);
    await SelfImprove.RenderListAsync(brain);
    if (request.Input != "docked") { await SelfImprove.OpenWindowAsync(brain, brain.Stopping); }
}
```

`synapses/request.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Revisions;

// A request is a change set; the index commits it through the launcher and starts it when nothing
// else is live. The answer is the sha in the last neuron; the list shows the stage.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(SelfImprove.Key(brain));
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "request") { continue; }
    var last = brain.Get<IText>(SelfImprove.Key(brain) + "/last");
    try
    {
        var sha = await brain.Get<IRevisions>(SelfImprove.Scope(brain)).Propose(SelfImprove.Parse(request.Input));
        await last.Set(sha);
    }
    catch (Exception error) when (error is ArgumentException or System.Text.Json.JsonException or InvalidOperationException)
    {
        await brain.Get<IText>(SelfImprove.Key(brain) + "/report").Set("Request refused: " + error.Message);
    }
    await SelfImprove.RenderListAsync(brain);
}
```

`synapses/healthy.cs`:

```csharp
using DigitalBrain.Revisions;
using DigitalBrain.Revisions.Signals;

// A healthy child is verified with the plan it was proposed with. Verify is idempotent on stage:
// a replayed signal after a reap finds the revision past Healthy and is refused harmlessly.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var index = brain.Get<IRevisions>(SelfImprove.Scope(brain));
await foreach (var changed in brain.On<RevisionChanged>(index, brain.Stopping))
{
    var revision = brain.Get<IRevision>(IRevision.Key(SelfImprove.Scope(brain), changed.Sha));
    await foreach (var healthy in brain.On<RevisionHealthy>(revision, brain.Stopping))
    {
        var snapshot = await revision.Read();
        if (snapshot.Stage != RevisionStage.Healthy || snapshot.Plan is null) { break; }
        await revision.Verify(snapshot.Plan);
        await SelfImprove.RenderListAsync(brain);
        break;
    }
}
```

This nests two `On` loops because a revision's key is only known once the index announces it; the outer loop is the one durable subscription (the index), the inner one is per revision and ends after one reaction. If the runtime refuses a second `brain.On` inside a synapse, replace the inner loop with `brain.Get<IRevision>(...)` reads driven by the index's `RevisionChanged(sha, Healthy)` — then `RevisionNeuron.Move` must also publish through the index (`Index.Observe(sha, stage)`), which is the design question flagged in the report.

`synapses/verified.cs`:

```csharp
using DigitalBrain.Revisions;
using DigitalBrain.Revisions.Signals;

// A verified revision is promoted. The launcher then stops this brain; the child finds
// RevisionPromoted in its own copied history.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var index = brain.Get<IRevisions>(SelfImprove.Scope(brain));
await foreach (var changed in brain.On<RevisionChanged>(index, brain.Stopping))
{
    var revision = brain.Get<IRevision>(IRevision.Key(SelfImprove.Scope(brain), changed.Sha));
    await foreach (var verified in brain.On<RevisionVerified>(revision, brain.Stopping))
    {
        if ((await revision.Read()).Stage == RevisionStage.Verified) { await revision.Promote(); }
        await SelfImprove.RenderListAsync(brain);
        break;
    }
}
```

`synapses/failed.cs`:

```csharp
using DigitalBrain.Flutter.Text;
using DigitalBrain.Revisions;
using DigitalBrain.Revisions.Signals;

// A failure is shown, never retried; the worktree stays for inspection.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var index = brain.Get<IRevisions>(SelfImprove.Scope(brain));
await foreach (var changed in brain.On<RevisionChanged>(index, brain.Stopping))
{
    var revision = brain.Get<IRevision>(IRevision.Key(SelfImprove.Scope(brain), changed.Sha));
    await foreach (var failed in brain.On<RevisionFailed>(revision, brain.Stopping))
    {
        var snapshot = await revision.Read();
        var checks = snapshot.Report is null ? "" : "\n\n" + string.Join("\n", snapshot.Report.Checks.Select(check => $"- {(check.Passed ? "ok" : "FAILED")} {check.Name}: {check.Detail}"));
        await brain.Get<IText>(SelfImprove.Key(brain) + "/report").Set($"**{failed.Sha} failed at {failed.Stage}:** {failed.Reason}\n\nWorktree: `{snapshot.Worktree}`{checks}");
        await SelfImprove.RenderListAsync(brain);
        break;
    }
}
```

`OsApps.cs`: add `new OsApp("os", "selfimprove")` after `datavisualizer` in the defaults array.

- [ ] **Step 4: Run the unit facts**

`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-class "*OsSelfImproveAppFacts*" --filter-class "*OsShippedAppFacts*"`
Expected: green, including `EveryOsProgramCompilesAgainstCurrentContracts` (the Revisions contracts must be visible to `CSharpScriptCheck`; it compiles against the deployed contract catalog, which Task 6's catalog wiring feeds — if this fact is red with "namespace DigitalBrain.Revisions not found", do Task 6 Step 3 first and come back).

- [ ] **Step 5: Failing E2E fact — a request walks to Promoted against a fake launcher whose "child" is the brain itself**

`FakeLauncherHost.cs`:

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace DigitalBrain.OS.Tests.E2E;

// A launcher that "starts" a child by answering the parent's own MCP endpoint, so verification
// drives real neurons; promote and discard are recorded.
internal sealed class FakeLauncherHost : IAsyncDisposable
{
    private readonly WebApplication _app;
    public List<string> Calls { get; } = [];
    public string Url => _app.Urls.Single();

    private FakeLauncherHost(WebApplication app) => _app = app;

    public static async Task<FakeLauncherHost> StartAsync(string childMcpEndpoint, CancellationToken ct)
    {
        var builder = WebApplication.CreateBuilder();
        var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:0");
        var host = new FakeLauncherHost(app);
        object Revision(string sha, string state) => new { sha, worktree = @"E:\wt\" + sha, mcpEndpoint = childMcpEndpoint, uiEndpoint = childMcpEndpoint, state };
        app.MapPost("/revisions", (HttpContext _) => { host.Calls.Add("propose"); return Results.Created("/revisions/e2e0001", Revision("e2e0001", "created")); });
        app.MapPost("/revisions/{sha}/start", (string sha) => { host.Calls.Add("start " + sha); return Results.Ok(Revision(sha, "starting")); });
        app.MapPost("/revisions/{sha}/healthy", (string sha) => { host.Calls.Add("healthy " + sha); return Results.Ok(Revision(sha, "healthy")); });
        app.MapPost("/revisions/{sha}/promote", (string sha) => { host.Calls.Add("promote " + sha); return Results.Ok(Revision(sha, "current")); });
        app.MapDelete("/revisions/{sha}", (string sha) => { host.Calls.Add("discard " + sha); return Results.NoContent(); });
        app.MapGet("/revisions/spans", () => Results.Ok(1));
        await app.StartAsync(ct);
        return host;
    }

    public ValueTask DisposeAsync() => _app.DisposeAsync();
}
```

`SelfImproveFacts.cs`:

```csharp
using System.Net.Http.Json;
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Text.Signals;
using DigitalBrain.Revisions;

namespace DigitalBrain.OS.Tests.E2E;

// The loop end to end as the signed-in user: the shell posts a change set, the synapses react in the
// brain's session, verification drives the "child" (this brain) over its MCP, and the list shows Promoted.
public sealed class SelfImproveFacts(SelfImproveHostFixture host) : BrainFact(host)
{
    [Fact(Timeout = 240_000)]
    public async Task AChangeSetIsProposedVerifiedAndPromotedThroughTheLauncher()
    {
        var ct = TestContext.Current.CancellationToken;
        var scope = Brain.WorkspaceId;
        var appKey = scope + "/apps/selfimprove";
        Assert.Equal(AppStatus.Live, (await Brain.Get<IApp>(appKey).Read()).Status);
        var list = Brain.Get<IText>(appKey + "/revisions");
        await using var changes = await Brain.Observe<TextChanged>(list, ct);
        var change = new
        {
            branch = "os-runtime",
            summary = "Calculator: add percent",
            files = new Dictionary<string, string> { ["src/DigitalBrain.OS/Apps/Calculator/app.spec.md"] = "# Calculator\n" },
            plan = new
            {
                calls = new[] { new { contract = "DigitalBrain.Apps.IApp", key = appKey, method = "Read", arguments = "[]", expected = "\"Name\":\"selfimprove\"" } },
                healthyResources = new[] { "OperatingSystem" },
                spans = Array.Empty<string>(),
                budget = "00:03:00",
                aspireKey = "DigitalBrain.OS",
            },
        };
        using var requested = await Brain.HttpClient.PostAsJsonAsync($"/brains/{scope}/apps/selfimprove/request",
            new { operation = "request", input = System.Text.Json.JsonSerializer.Serialize(change) }, ct);
        Assert.Equal(HttpStatusCode.Accepted, requested.StatusCode);
        while (!(await list.Read()).Markdown.Contains("Promoted", StringComparison.Ordinal)) { await changes.NextAsync(ct: ct); }
        var revision = await Brain.Get<IRevision>(IRevision.Key(scope, "e2e0001")).Read();
        Assert.Equal(RevisionStage.Promoted, revision.Stage);
        Assert.True(revision.Report!.Passed);
        Assert.Equal(["propose", "start e2e0001", "healthy e2e0001", "promote e2e0001"], host.Launcher.Calls);
    }
}

public sealed class SelfImproveHostFixture : ReferenceBrainFixture
{
    public FakeLauncherHost Launcher { get; private set; } = null!;

    protected override async Task<E2EBrain> StartBrainAsync(CancellationToken cancellationToken)
    {
        // The product's MCP port is fixed (AppHost.cs: DigitalBrain:Http:McpPort, 5081); the fake launcher names it as the child.
        Launcher = await FakeLauncherHost.StartAsync("http://localhost:5081", cancellationToken);
        return await ProductE2E.Create()
            .ConfigureModule<RevisionsModule, RevisionsOptions>(revisions => revisions.LauncherUrl = Launcher.Url)
            .WithStartupTimeout(TimeSpan.FromMinutes(15))
            .ExportingTelemetryTo(Collector)
            .StartAsync(cancellationToken);
    }
}
```

The `OperatingSystem` resource name is the AppHost's `AddProject<Projects.DigitalBrain_OS>("OperatingSystem")`; `ConfigureModule<RevisionsModule, RevisionsOptions>` follows `ProductHostFixture`'s `ConfigureModule<AIModule, AIOptions>`. If `ProductE2E` pins the MCP port elsewhere, read it from the fixture's brain after start and pass it to the fake launcher through a mutable field instead of the literal.

- [ ] **Step 6: Run the E2E (needs Docker), expect red before Task 6**

`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*AChangeSetIsProposedVerifiedAndPromoted*"`
Expected before Task 6: `RevisionsModule` unknown to the OS composition (compile error in the fixture or "no grain type revisions.index"). Re-run after Task 6: green.

- [ ] **Step 7: Commit**

```
git add src/DigitalBrain.OS/Apps/SelfImprove/app.json src/DigitalBrain.OS/Apps/SelfImprove/app.spec.md src/DigitalBrain.OS/Apps/SelfImprove/icon.svg src/DigitalBrain.OS/Apps/SelfImprove/lib/SelfImprove.cs src/DigitalBrain.OS/Apps/SelfImprove/synapses/open.cs src/DigitalBrain.OS/Apps/SelfImprove/synapses/request.cs src/DigitalBrain.OS/Apps/SelfImprove/synapses/healthy.cs src/DigitalBrain.OS/Apps/SelfImprove/synapses/verified.cs src/DigitalBrain.OS/Apps/SelfImprove/synapses/failed.cs src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsSelfImproveAppFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/SelfImproveFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/FakeLauncherHost.cs
git commit -m "OS: os/selfimprove app, one synapse per reaction, E2E through a fake launcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Wire the module into the OS composition, the MCP contract catalog and the AppHost

**Files:**
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`
- Modify: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj`
- Modify: `src/DigitalBrain.AppHost/AppHost.cs`
- Modify: `src/DigitalBrain.AppHost/appsettings.json`
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs`
- Test: `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronContractFacts.cs`

**Interfaces:**
- Consumes: `OsCatalog.BuiltIn()`, the OS csproj's module glob (`DigitalBrain.Modules/**/DigitalBrain.Modules.*.csproj` minus Contracts/Hosting/Tests — the new module project matches it automatically), `ContractCatalog.Deployed()` (the MCP server knows a contract only if its assembly is referenced), `DigitalBrainConfiguration.ModuleOptionsSection`.
- Produces: `new DigitalBrain.Revisions.RevisionsModule()` in `OsCatalog.BuiltIn()` after `QdrantModule` (alphabetical by vendor group as the file is kept); `DigitalBrain.Mcp.csproj` references `DigitalBrain.Modules.Revisions.Contracts`; the AppHost projects `DigitalBrain:Modules:revisions:Options:LauncherUrl` (default `http://localhost:5079`) to the OS resource through `appsettings.json`.

- [ ] **Step 1: Failing facts**

Add to `OsCatalogFacts.cs`:

```csharp
[Fact]
public void TheOperatingSystemComposesTheRevisionsModule()
    => Assert.Contains(OsCatalog.Modules, module => module.Id.ToString() == "revisions");
```

Add to `NeuronContractFacts.cs` (next to the existing contract-visibility fact; keep its construction of the catalog):

```csharp
[Fact]
public void TheMcpServerKnowsTheRevisionContracts()
{
    var catalog = new ContractCatalog(ContractCatalog.Deployed());
    Assert.Contains("DigitalBrain.Revisions.IRevision", catalog.Neurons);
    Assert.Contains("DigitalBrain.Revisions.IRevisions", catalog.Neurons);
}
```

(`catalog.Neurons` is what `NeuronSurface.List()` returns; match the existing fact's accessor if it differs.)

- [ ] **Step 2: Run them, expect failure**

`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*ComposesTheRevisionsModule*"`
`dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit -- --filter-method "*KnowsTheRevisionContracts*"`
Expected: the catalog has no `revisions`; the MCP catalog lacks `DigitalBrain.Revisions.IRevision`.

- [ ] **Step 3: Wire it**

`OsCatalog.cs` `BuiltIn()`: add `new DigitalBrain.Revisions.RevisionsModule(),` after `new DigitalBrain.Qdrant.QdrantModule(),`.

`DigitalBrain.Mcp.csproj`: add `<ProjectReference Include="../../DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Contracts/DigitalBrain.Modules.Revisions.Contracts.csproj" />` beside the other Contracts references.

`src/DigitalBrain.AppHost/appsettings.json`: under `"Modules"` add

```json
"revisions": { "Options": { "LauncherUrl": "http://localhost:5079" } }
```

`AppHost.cs`: nothing else — module options under `DigitalBrain:Modules:{id}:Options` already flow to the silo through `brain.Settings` in `WithReference(brain)`; confirm with `ModuleOptionOverlayFacts` that `DigitalBrain:Modules:revisions:Options:LauncherUrl` reaches the OS environment (`DigitalBrain__Modules__revisions__Options__LauncherUrl`), and if the overlay requires a `WithHosting<...>` declaration for the module, add a minimal `RevisionsModuleHosting : ModuleHosting<RevisionsModule>` in `src/DigitalBrain.Modules/DigitalBrain/Revisions/DigitalBrain.Modules.Revisions.Aspire.Hosting/` with an empty `Configure` and `.WithHosting<RevisionsModuleHosting>()` in `AppHost.cs` plus the project reference in `DigitalBrain.AppHost.csproj`.

- [ ] **Step 4: Build, run the facts and the host composition suites**

`dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`
`dotnet build src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj`
`dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj`
`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
`dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit`
`dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: green; `EveryCatalogModuleShipsWithTheRuntime` proves the module landed in `DigitalBrain.OS.deps.json`, and `EveryOsProgramCompilesAgainstCurrentContracts` now compiles the SelfImprove synapses against `DigitalBrain.Revisions`.

- [ ] **Step 5: Run the Task 5 E2E**

`dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*AChangeSetIsProposedVerifiedAndPromoted*"`
Expected: green (Docker required).

- [ ] **Step 6: Commit**

```
git add src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj src/DigitalBrain.AppHost/appsettings.json src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsCatalogFacts.cs src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronContractFacts.cs
git commit -m "OS: compose the revisions module; MCP knows its contracts; AppHost names the launcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Add `src/DigitalBrain.AppHost/AppHost.cs`, `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` and the hosting project files to the `git add` only if Step 3's hosting fallback was needed.)

---

### Task 7: Verification loop — the running system shows the loop

**Files:**
- No source changes expected. Any fix found here goes into the task that owns the file, with its own fact and commit.

**Interfaces:**
- Consumes: `aspire run` from `src/DigitalBrain.AppHost`, `dotnet run --project src/DigitalBrain.Launcher/DigitalBrain.Launcher`, `digitalbrain-mcp` (`http://localhost:5081/mcp`, `/brains/{brainId}/mcp`), Aspire MCP (`list_resources`, `list_console_logs`, `list_traces`, `list_structured_logs`, `list_trace_structured_logs`).
- Produces: the spec's "Verification of this feature itself" checks, seen running.

- [ ] **Step 1: Bring the current revision up under the launcher**

Start the launcher first so it owns 5080/5081: `dotnet run --project src/DigitalBrain.Launcher/DigitalBrain.Launcher -- Launcher:Repository=E:\intochat\digitalbrain`. Then bootstrap the current revision through the launcher rather than by hand, so `revisions.json` names it: `POST http://localhost:5079/revisions` with `{"branch":"os-runtime","summary":"bootstrap","files":{}}`, then `/start`, `/healthy?budget=00:15:00`, `/promote` for that sha. `GET http://localhost:5079/revisions` shows `current` set and the block `5090/5091`. Expected: `mcp__aspire__list_apphosts` lists the worktree AppHost; `mcp__aspire__list_resources` on it shows every resource Running/Healthy; `http://localhost:5080/health` and `http://localhost:5081/health` answer 200 through the proxy. If a resource is not healthy, read `mcp__aspire__list_console_logs` for it before anything else.

- [ ] **Step 2: Confirm the identity the child will differ from**

`neurons_context` over `http://localhost:5081/brains/owner/mcp`: caller `owner`, brain `owner`. `neurons_get` `DigitalBrain.Microsoft.Aspire.IAspire` key `DigitalBrain.OS`: `OperatingSystem` and `digitalbrain-mcp` Running/Healthy. In the Aspire dashboard's environment of `OperatingSystem`: `Orleans__ServiceId=intochat-r{sha}`, `DigitalBrain__Orleans__GrainStateContainer=brain-r{sha}` (Task 1 projections).

- [ ] **Step 3: Ask the SelfImprove app for a one-line change on Calculator**

Through the shell (or `POST http://localhost:5080/brains/owner/apps/selfimprove/request`) with operation `request` and the change set as input: `files` = `src/DigitalBrain.OS/Apps/Calculator/app.json` with a new operation `{"name":"percent","description":"Divide the display by one hundred."}` appended to `operations`, `summary` = `Calculator: add percent`, `plan.calls` = `[{"contract":"DigitalBrain.Apps.IApp","key":"owner/apps/calculator","method":"Read","arguments":"[]","expected":"\"Name\":\"percent\""}]`, `plan.healthyResources` = `["OperatingSystem","digitalbrain-mcp","csharp-sandbox"]`, `plan.spans` = `["Neuron/Read"]` (confirm the exact span name of a grain call from `mcp__aspire__list_traces` on the current AppHost first and use that), `plan.budget` = `00:10:00`. Expected: `neurons_get DigitalBrain.Revisions.IRevisions owner` lists the new sha as `Live`; `neurons_get DigitalBrain.Revisions.IRevision owner/revisions/{sha}` walks `Starting → Started → Healthy`; `mcp__aspire__list_apphosts` now lists a second AppHost in `.revisions/{sha}`; its `list_resources` shows `intochat-r{sha}`-identified resources coming up; the launcher's `revisions.json` holds the new block `5100/5101`.

- [ ] **Step 4: Watch verification and promotion in the current brain's telemetry**

`mcp__aspire__list_traces` on the current AppHost: spans for `IRevision.Verify` containing outbound HTTP to `localhost:5101/brains/owner/mcp` (`neurons_context`, `neurons_get`, `neurons_call`), then `IRevision.Promote` with an outbound `POST localhost:5079/revisions/{sha}/promote`. `mcp__aspire__list_structured_logs`: `RevisionVerified` then `RevisionPromoted` published for the sha (the signal names appear in the neuron publish log lines). `mcp__aspire__list_trace_structured_logs` on the Verify trace follows context → resources → call → span checks in that order. If the trace shows a retry of any check, that is a bug in Task 4, not a flake.

- [ ] **Step 5: Hand-over**

Expected: the old AppHost exits (`mcp__aspire__list_apphosts` lists only the new one); `GET http://localhost:5079/revisions` shows the new sha as `current` and the old one `stopped`; the shell reconnects through 5080 and opens Calculator with the `percent` operation in its manifest (`neurons_get DigitalBrain.Apps.IApp owner/apps/calculator` on `localhost:5081` now answers from the child, whose `neurons_context` still says brain `owner`); `neurons_get DigitalBrain.Revisions.IRevision owner/revisions/{sha}` in the child shows `Promoted` in its own copied history; `git log -1 os-runtime` is the revision's commit.

- [ ] **Step 6: The failure path**

Repeat Step 3 with `expected` = `"Name":"nonexistent"`. Expected: `RevisionFailed(Stage: Verifying, Reason: "call DigitalBrain.Apps.IApp owner/apps/calculator Read: expected ...")` in the structured logs; the app's `report` neuron names the check and the worktree; the child AppHost is stopped by `Discard`-less failure handling only when the app asks (`IRevision.Discard` from the shell) — until then `list_apphosts` still shows it for inspection; no second `aspire run` starts.

- [ ] **Step 7: Regression net**

```
dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit
dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Revisions/tests/DigitalBrain.Modules.Revisions.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*AChangeSetIsProposedVerifiedAndPromoted*"
```

Expected: all green. Nothing to commit unless a fix was made in an owning task.
