# Windows Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Machine module with a `Microsoft/Windows` module where a PC is a `windows` connection keyed by its machine id, whose `IWindows`, `IFileSystem` and `IConsole` neurons run only on that machine and only inside allowed roots; add launcher profiles to `digitalbrain.cs`.

**Architecture:** A machine-identity service reads or creates `%LOCALAPPDATA%\DigitalBrain\machine-id`. The connection neuron (`ConnectionNeuron<WindowsConnectionState>`, grain type `windows`) implements `IWindows`, holds roots in its state, and connects only when the sealed value equals the local machine id. Child neurons `{connectionKey}/files` and `{connectionKey}/console` check the same machine guard and read roots from the parent. Then every Machine consumer moves over and Machine is deleted.

**Tech Stack:** .NET 11 RC, Orleans, DigitalBrain Framework connections (`ConnectionNeuron<T>`, `ConnectionKeys`, `ConnectorDefinition`), xUnit v3, `DigitalBrain.Testing.Module`.

**Spec:** `docs/superpowers/specs/2026-10-10-windows-module-and-federation-design.md`

## Global Constraints

- Module at `src/DigitalBrain.Modules/Microsoft/Windows/`, namespace `DigitalBrain.Microsoft.Windows`, module id `"windows"`, connector id `"windows"`, auth method `"device"`, no required Integration.
- Connection key `{brain}/connection/windows/{machineId}` built only with `ConnectionKeys.For(brain, "windows", machineId)`.
- `machineId` = GUID `"N"` format, stored in `%LOCALAPPDATA%\DigitalBrain\machine-id`; `WindowsOptions.MachineIdFile` overrides the path.
- Every operation on a machine other than the local silo's throws `ServiceUnavailableException` (namespace `DigitalBrain`, `src/DigitalBrain/Neurons/ServiceUnavailableException.cs`). Never runs elsewhere.
- No roots ⇒ file and console operations throw `UnauthorizedAccessException`. Paths compare `OrdinalIgnoreCase`.
- These contracts are Windows-only; no OS-neutral interfaces anywhere (ratified rule).
- Grain state: concrete arrays. No `/// <summary>`. Facts with sentence names and `TestContext.Current.CancellationToken`. Windows-only facts call `Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only")` first.
- LSP before every change (map references), diagnostics clean, build per project; commit explicit files only.

## Review Focus

1. **A silo on another machine never acts** — a neuron keyed with a machine id that is not the local one throws 503 for files, console and facts. (Task 3 and Task 4 facts.)
2. **A path that escapes a root through `..` or a different drive** is refused, including a root prefix trick (`E:\projects2` when the root is `E:\projects`). (Task 4 fact.)
3. **Revoking a root takes effect immediately** for the next file call. (Task 4 fact.)
4. **The console's working directory must be inside a root**, and a missing working directory defaults to the first root, not the silo's current directory. (Task 4 fact.)
5. **A connect attempt for another machine's id is refused with 503** and never reaches the probe, so it can't end up connected. (Task 3 fact `AnotherMachinesConnectionIsNotServedHere`.)

---

### Task 1: Scaffold the module and machine identity

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/DigitalBrain.Modules.Microsoft.Windows.Contracts.csproj`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/DigitalBrain.Modules.Microsoft.Windows.csproj`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsOptions.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/MachineIdentity.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/DigitalBrain.Modules.Microsoft.Windows.Tests.csproj`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/MachineIdentityFacts.cs`
- Modify: `DigitalBrain.slnx` (add `/Modules/Microsoft/Windows/` and its `tests/` folder beside the other Microsoft modules); add the three projects to the gitignored `DigitalBrain-lsp.sln` and restart csharp-ls.

**Interfaces:**
- Produces: `WindowsOptions { string MachineIdFile }` (empty = default path); `internal interface IMachineIdentity { string Id { get; } }`; `internal sealed class MachineIdentity(IOptions<WindowsOptions>) : IMachineIdentity`; `WindowsModule : Module<WindowsOptions>` registering `IMachineIdentity` as singleton.

- [ ] **Step 1: Map the template with LSP**

`goToDefinition` on `Module<GitHubModuleOptions>` in `src/DigitalBrain.Modules/Microsoft/GitHub/DigitalBrain.Modules.Microsoft.GitHub/GitHubModule.cs`, on `Configure(ISiloBuilder)`, and on `GetModuleOptions` (used by `GmailModule.Configure`) to confirm how a module registers singletons and options.

- [ ] **Step 2: Write the failing test**

`MachineIdentityFacts.cs`:
```csharp
using DigitalBrain.Microsoft.Windows;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Modules.Microsoft.Windows.Tests;

public sealed class MachineIdentityFacts
{
    [Fact]
    public void TheFirstRunCreatesAnIdAndLaterRunsReadTheSameOne()
    {
        var file = Path.Combine(Directory.CreateTempSubdirectory("machine-id").FullName, "machine-id");
        var options = Options.Create(new WindowsOptions { MachineIdFile = file });

        var first = new MachineIdentity(options).Id;
        var second = new MachineIdentity(options).Id;

        Assert.Equal(first, second);
        Assert.True(Guid.TryParseExact(first, "N", out _));
        Assert.Equal(first, File.ReadAllText(file).Trim());
    }

    [Fact]
    public void AGarbledIdFileIsRefusedRatherThanReplaced()
    {
        var file = Path.Combine(Directory.CreateTempSubdirectory("machine-id").FullName, "machine-id");
        File.WriteAllText(file, "not-a-guid");

        Assert.Throws<InvalidDataException>(() => new MachineIdentity(Options.Create(new WindowsOptions { MachineIdFile = file })).Id);
    }
}
```

- [ ] **Step 3: Create projects and implementation**

Contracts csproj:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Windows machine contracts: the machine, its files and its console.</Description>
    <RootNamespace>DigitalBrain.Microsoft.Windows</RootNamespace>
    <NoWarn>$(NoWarn);CS1591</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../../../../DigitalBrain/DigitalBrain.csproj" />
  </ItemGroup>
  <ItemGroup><PackageReference Include="Microsoft.Orleans.Sdk" PrivateAssets="all" /></ItemGroup>
</Project>
```

Module csproj:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>A Windows PC as a connection: its files and console, run only on that machine and inside allowed roots.</Description>
    <RootNamespace>DigitalBrain.Microsoft.Windows</RootNamespace>
    <NoWarn>$(NoWarn);ORLEANSEXP005</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="DigitalBrain.Modules.Microsoft.Windows.Tests" />
    <ProjectReference Include="../DigitalBrain.Modules.Microsoft.Windows.Contracts/DigitalBrain.Modules.Microsoft.Windows.Contracts.csproj" />
    <ProjectReference Include="../../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
  </ItemGroup>
</Project>
```

Tests csproj:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../../../../../Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.Microsoft.Windows/DigitalBrain.Modules.Microsoft.Windows.csproj" />
  </ItemGroup>
  <ItemGroup><Using Include="DigitalBrain.Testing.Module" /></ItemGroup>
</Project>
```

`WindowsOptions.cs`:
```csharp
using DigitalBrain.Framework.Modules;

namespace DigitalBrain.Microsoft.Windows;

// MachineIdFile empty = %LOCALAPPDATA%\DigitalBrain\machine-id; tests point it at a temp file.
public sealed class WindowsOptions : IModuleOptions
{
    public string MachineIdFile { get; set; } = "";

    public void Validate() { }
}
```

`MachineIdentity.cs`:
```csharp
using Microsoft.Extensions.Options;

namespace DigitalBrain.Microsoft.Windows;

internal interface IMachineIdentity
{
    string Id { get; }
}

// The install's stable id: created once, then read. A garbled file is an error, never silently replaced,
// because replacing it would orphan the machine's connection.
internal sealed class MachineIdentity(IOptions<WindowsOptions> options) : IMachineIdentity
{
    private readonly Lazy<string> _id = new(() => ReadOrCreate(Resolve(options.Value.MachineIdFile)));

    public string Id => _id.Value;

    private static string Resolve(string configured) => string.IsNullOrWhiteSpace(configured)
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DigitalBrain", "machine-id")
        : configured;

    private static string ReadOrCreate(string file)
    {
        if (File.Exists(file))
        {
            var text = File.ReadAllText(file).Trim();
            if (!Guid.TryParseExact(text, "N", out _)) { throw new InvalidDataException($"'{file}' does not hold a machine id."); }
            return text;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        var id = Guid.NewGuid().ToString("N");
        File.WriteAllText(file, id);
        return id;
    }
}
```

`WindowsModule.cs` (connector added in Task 3; `Contracts` switched to `typeof(IWindows).Assembly` in Task 2):
```csharp
using System.Reflection;
using DigitalBrain.Framework.Modules;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Orleans.Hosting;

namespace DigitalBrain.Microsoft.Windows;

// A Windows PC as an edge: the machine, its files and its console, served only by a silo on that PC.
public sealed class WindowsModule() : Module<WindowsOptions>(new ModuleId("windows"))
{
    public override Assembly? Contracts => typeof(WindowsOptions).Assembly;

    public override void Configure(ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        silo.Services.TryAddSingleton<IMachineIdentity, MachineIdentity>();
    }
}
```
If Step 1 shows options are bound differently than `IOptions<WindowsOptions>` (Machine's neurons inject `IOptions<MachineOptions>`, so this should hold), follow what LSP shows.

- [ ] **Step 4: Run**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests`
Expected: 2 facts PASS. Then `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests` — PASS.

- [ ] **Step 5: Commit**

```bash
git add DigitalBrain.slnx src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/DigitalBrain.Modules.Microsoft.Windows.Contracts.csproj src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/DigitalBrain.Modules.Microsoft.Windows.csproj src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsOptions.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/MachineIdentity.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/DigitalBrain.Modules.Microsoft.Windows.Tests.csproj src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/MachineIdentityFacts.cs
git commit -m "Windows: module scaffold and a stable machine id per install"
```

---

### Task 2: Contracts

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IWindows.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IFileSystem.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IConsole.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/WindowsKeys.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs` (`Contracts => typeof(IWindows).Assembly`)

**Interfaces:**
- Produces:
  - `IWindows : INeuron` (alias `"windows"`): `Task<WindowsFacts> Facts()`, `Task<string[]> Roots()`, `Task AllowRoot(string path)`, `Task RevokeRoot(string path)`; `record WindowsFacts(string MachineId, string MachineName, string WindowsVersion, int ProcessorCount, long TotalMemoryBytes)`.
  - `IFileSystem : INeuron` (alias `"windows.files"`): `Task<string> Read(string path, CancellationToken)`, `Task Write(string path, string content, CancellationToken)`, `Task<string[]> List(string path, CancellationToken)`.
  - `IConsole : INeuron` (alias `"windows.console"`): `Task<CommandResult> Run(string command, string? workingDirectory = null, int timeoutSeconds = 60, CancellationToken = default)`; `record CommandResult(int ExitCode, string StandardOutput, string StandardError)`.
  - `static class WindowsKeys { string Files(string connectionKey) => connectionKey + "/files"; string Console(string connectionKey) => connectionKey + "/console"; string Connection(string childKey) => childKey[..childKey.LastIndexOf('/')]; }`

- [ ] **Step 1: Write the contracts**

`IWindows.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;
using ReadOnly = Orleans.Concurrency.ReadOnlyAttribute;

namespace DigitalBrain.Microsoft.Windows;

// One Windows PC, keyed {brain}/connection/windows/{machineId}. Served only by a silo running on that PC.
[Alias("windows"), Orleans.Metadata.DefaultGrainType("windows")]
public interface IWindows : INeuron
{
    [Description("Facts about this Windows machine: id, name, Windows version, processors and memory.")]
    [ReadOnly, AlwaysInterleave]
    Task<WindowsFacts> Facts();

    [Description("The folders on this machine that files and console commands may use.")]
    [ReadOnly, AlwaysInterleave]
    Task<string[]> Roots();

    [Description("Allow files and console commands inside a folder on this machine.")]
    Task AllowRoot(string path);

    [Description("Stop allowing a folder on this machine.")]
    Task RevokeRoot(string path);
}

[GenerateSerializer, Alias("windows.facts")]
public sealed record WindowsFacts(
    [property: Id(0)] string MachineId,
    [property: Id(1)] string MachineName,
    [property: Id(2)] string WindowsVersion,
    [property: Id(3)] int ProcessorCount,
    [property: Id(4)] long TotalMemoryBytes);
```

`IFileSystem.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;
using ReadOnly = Orleans.Concurrency.ReadOnlyAttribute;

namespace DigitalBrain.Microsoft.Windows;

// Files on one Windows PC, keyed {connectionKey}/files, confined to that machine's allowed roots.
[Alias("windows.files"), Orleans.Metadata.DefaultGrainType("windows.files")]
public interface IFileSystem : INeuron
{
    [Description("Read a text file on this Windows machine. path is absolute or relative to the first allowed root.")]
    [ReadOnly, AlwaysInterleave]
    Task<string> Read(string path, CancellationToken cancellationToken = default);

    [Description("Write text to a file on this Windows machine, creating folders as needed.")]
    [AlwaysInterleave]
    Task Write(string path, string content, CancellationToken cancellationToken = default);

    [Description("List the file and folder paths in a folder on this Windows machine.")]
    [ReadOnly, AlwaysInterleave]
    Task<string[]> List(string path, CancellationToken cancellationToken = default);
}
```

`IConsole.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;

namespace DigitalBrain.Microsoft.Windows;

// cmd.exe on one Windows PC, keyed {connectionKey}/console; the working directory must be inside an allowed root.
[Alias("windows.console"), Orleans.Metadata.DefaultGrainType("windows.console")]
public interface IConsole : INeuron
{
    [Description("Run one cmd.exe command line on this Windows machine and return its exit code, standard output and standard error. workingDirectory defaults to the first allowed root.")]
    [AlwaysInterleave, ResponseTimeout("00:05:00")]
    Task<CommandResult> Run(string command, string? workingDirectory = null, int timeoutSeconds = 60, CancellationToken cancellationToken = default);
}

[GenerateSerializer, Alias("windows.command-result")]
public sealed record CommandResult(
    [property: Id(0)] int ExitCode,
    [property: Id(1)] string StandardOutput,
    [property: Id(2)] string StandardError);
```

`WindowsKeys.cs`:
```csharp
namespace DigitalBrain.Microsoft.Windows;

// A machine's files and console live under its connection key.
public static class WindowsKeys
{
    public static string Files(string connectionKey) => connectionKey + "/files";

    public static string Console(string connectionKey) => connectionKey + "/console";

    public static string Connection(string childKey) => childKey[..childKey.LastIndexOf('/')];
}
```

Switch `WindowsModule.Contracts` to `typeof(IWindows).Assembly`.

- [ ] **Step 2: Build**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/DigitalBrain.Modules.Microsoft.Windows.csproj`
Expected: success, no warnings. (Contracts are exercised by Tasks 3–4.)

- [ ] **Step 3: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IWindows.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IFileSystem.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/IConsole.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows.Contracts/WindowsKeys.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs
git commit -m "Windows: machine, files and console contracts"
```

---

### Task 3: The machine as a connection

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs` (add `Connector`)
- Test: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/WindowsHost.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/WindowsConnectionFacts.cs`

**Interfaces:**
- Consumes: `IMachineIdentity` (Task 1), `IWindows`, `WindowsFacts` (Task 2), `ConnectionNeuron<TState>`, `ConnectionState`, `ConnectionProbeResult`, `Credential`, `ConnectionKeys`, `IConnection` (Framework).
- Produces: `WindowsModule.Connector` = `new ConnectorDefinition("windows", "Windows", ["device"], []) { Neurons = [typeof(IWindows), typeof(IFileSystem), typeof(IConsole)] }`; `WindowsNeuron` (grain type `"windows"`) with `internal void RequireThisMachine()` semantics: throws `ServiceUnavailableException` when `Key.Connection != identity.Id`; `WindowsHost.StartAsync(ct)` → `(ModuleBrain Host, string MachineId, string Root)`, `WindowsHost.Machine(string machineId)` → connection key for brain `acct/home`.

- [ ] **Step 1: Map with LSP**

`goToDefinition` on `ConnectionNeuron<TState>` (`src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Connections/ConnectionNeuron.cs`), `ConnectionProbeResult`, `Credential`, `ConnectionState`; read `PostgresServerNeuron` as the closest non-OAuth example; `findReferences` on `ConnectorDefinition.DeclaredBy` to confirm a `public static ConnectorDefinition Connector` on the module class is discovered. Check whether `ConnectionNeuron` exposes the probe result to callers of `Connect` (the fact below reads `IConnection.Read()` status after `Connect`); adjust the assertion to the status enum LSP shows.

- [ ] **Step 2: Write the failing tests**

`WindowsHost.cs`:
```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Microsoft.Windows;

namespace DigitalBrain.Modules.Microsoft.Windows.Tests;

internal static class WindowsHost
{
    private const string Principal = "acct";
    private const string BrainName = "home";
    private static readonly string Scope = BrainScope.Create(Principal, BrainName).Id;

    public static string Machine(string machineId) => ConnectionKeys.For(Scope, "windows", machineId);

    public static async Task<(ModuleBrain Host, string MachineId, string Root)> StartAsync(CancellationToken ct)
    {
        var temp = Directory.CreateTempSubdirectory("windows-facts").FullName;
        var idFile = Path.Combine(temp, "machine-id");
        var machineId = Guid.NewGuid().ToString("N");
        File.WriteAllText(idFile, machineId);
        var root = Directory.CreateDirectory(Path.Combine(temp, "root")).FullName;

        var host = await ModuleTest.Create()
            .WithModule<WindowsModule>()
            .ConfigureModule<WindowsModule, WindowsOptions>(options => options.MachineIdFile = idFile)
            .StartAsync(ct);
        CallerContextStamper.Stamp(new()
        { PrincipalId = Principal, AccountId = Principal, BrainId = BrainName, Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        await host.AuthorizeCallerAsync();
        return (host, machineId, root);
    }
}
```

`WindowsConnectionFacts.cs`:
```csharp
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Microsoft.Windows;

namespace DigitalBrain.Modules.Microsoft.Windows.Tests;

public sealed class WindowsConnectionFacts
{
    [Fact(Timeout = 60_000)]
    public async Task ThisMachineConnectsAndReportsItsFacts()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, machineId, _) = await WindowsHost.StartAsync(ct);
        await using var _ = host;

        var view = await host.Get<IConnection>(WindowsHost.Machine(machineId)).Connect("device", machineId);
        var facts = await host.Get<IWindows>(WindowsHost.Machine(machineId)).Facts();

        Assert.Equal(ConnectionStatus.Connected, view.Status);
        Assert.Equal(machineId, facts.MachineId);
        Assert.Equal(Environment.MachineName, facts.MachineName);
        Assert.True(facts.ProcessorCount > 0);
    }

    [Fact(Timeout = 60_000)]
    public async Task AnotherMachinesConnectionIsNotServedHere()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, _, _) = await WindowsHost.StartAsync(ct);
        await using var _ = host;
        var other = Guid.NewGuid().ToString("N");

        await Assert.ThrowsAsync<ServiceUnavailableException>(() => host.Get<IWindows>(WindowsHost.Machine(other)).Facts());
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => host.Get<IConnection>(WindowsHost.Machine(other)).Connect("device", other));
    }

    [Fact(Timeout = 60_000)]
    public async Task RootsAreAllowedAndRevoked()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, machineId, root) = await WindowsHost.StartAsync(ct);
        await using var _ = host;
        var machine = host.Get<IWindows>(WindowsHost.Machine(machineId));

        await machine.AllowRoot(root);
        await machine.AllowRoot(root.ToUpperInvariant());
        Assert.Equal([Path.GetFullPath(root)], await machine.Roots());

        await machine.RevokeRoot(root);
        Assert.Empty(await machine.Roots());
    }
}
```

- [ ] **Step 3: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests -- --filter-class "*WindowsConnectionFacts"`
Expected: build FAIL (`WindowsNeuron`/connector missing → `IWindows` has no implementation).

- [ ] **Step 4: Implement**

Add to `WindowsModule`:
```csharp
    public static ConnectorDefinition Connector { get; } = new("windows", "Windows", ["device"], [])
    {
        Neurons = [typeof(IWindows), typeof(IFileSystem), typeof(IConsole)],
    };
```
(with `using DigitalBrain.Framework.Platform.Integrations;`).

`WindowsNeuron.cs`:
```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using Microsoft.VisualBasic.Devices;

namespace DigitalBrain.Microsoft.Windows;

[GenerateSerializer, Alias("windows.connection-state")]
internal sealed class WindowsConnectionState : ConnectionState
{
    [Id(0)] public string[] Roots { get; set; } = [];
}

// The connection to one Windows PC. Its key names the machine; only a silo whose machine id matches serves it,
// and connecting proves the device value is this very machine.
[GrainType("windows")]
internal sealed class WindowsNeuron(
    IMachineIdentity identity,
    [PersistentState("windows", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<WindowsConnectionState> store)
    : ConnectionNeuron<WindowsConnectionState>(store), IWindows
{
    public override Task OnActivateAsync(CancellationToken cancellationToken)
    {
        RequireThisMachine();
        return base.OnActivateAsync(cancellationToken);
    }

    public Task<WindowsFacts> Facts() => Task.FromResult(new WindowsFacts(
        identity.Id, Environment.MachineName, Environment.OSVersion.VersionString, Environment.ProcessorCount,
        GC.GetGCMemoryInfo().TotalAvailableMemoryBytes));

    public Task<string[]> Roots() => Task.FromResult(store.State.Roots);

    public async Task AllowRoot(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        if (!Directory.Exists(full)) { throw new DirectoryNotFoundException($"'{full}' is not a folder on this machine."); }
        if (store.State.Roots.Contains(full, StringComparer.OrdinalIgnoreCase)) { return; }
        store.State.Roots = [.. store.State.Roots, full];
        await store.WriteStateAsync();
    }

    public async Task RevokeRoot(string path)
    {
        var full = Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar);
        store.State.Roots = store.State.Roots.Where(root => !string.Equals(root, full, StringComparison.OrdinalIgnoreCase)).ToArray();
        await store.WriteStateAsync();
    }

    protected override Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct) =>
        Task.FromResult(OperatingSystem.IsWindows() && credential.Value == identity.Id
            ? ConnectionProbeResult.Connected()
            : ConnectionProbeResult.Failing("This device value is not the machine this silo runs on."));

    private void RequireThisMachine()
    {
        if (Key.Connection != identity.Id)
        { throw new ServiceUnavailableException($"Windows machine '{Key.Connection}' is not this silo's machine."); }
    }
}
```
Remove the `Microsoft.VisualBasic.Devices` using if unused (it is — `GC.GetGCMemoryInfo` replaces it). Use LSP to confirm `ConnectionNeuron` lets a derived class override `OnActivateAsync` (it derives from `Neuron<TState>`); if activation-time throws are not surfaced as the original exception type to callers, move `RequireThisMachine()` to the top of each public method instead and override `Connect` is not possible — then call it inside `ProbeAsync` too. Either way the facts in Step 2 must pass unchanged. `ConnectionKeys.Parse` unescapes the id: confirm with LSP that `Key.Connection` is the raw machine id.

- [ ] **Step 5: Run to verify they pass**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests -- --filter-class "*WindowsConnectionFacts"`
Expected: 3 facts PASS (skipped on non-Windows).

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsNeuron.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/WindowsHost.cs src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/WindowsConnectionFacts.cs
git commit -m "Windows: a PC is a connection served only by its own silo"
```

---

### Task 4: Files and console inside the roots

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/MachineRoots.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/FileSystemNeuron.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/ConsoleNeuron.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/FilesAndConsoleFacts.cs`

**Interfaces:**
- Consumes: `IWindows.Roots()`, `WindowsKeys` (Task 2), `IMachineIdentity` (Task 1), `ConnectionKeys.Parse` (Framework).
- Produces: `internal static class MachineRoots { string Resolve(string[] roots, string path); }` — relative paths resolve against `roots[0]`; result must equal a root or start with `root + '\'` (`OrdinalIgnoreCase`); otherwise `UnauthorizedAccessException`; empty roots → `UnauthorizedAccessException("No folder on this machine is allowed yet.")`.

- [ ] **Step 1: Write the failing tests**

```csharp
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Microsoft.Windows;

namespace DigitalBrain.Modules.Microsoft.Windows.Tests;

public sealed class FilesAndConsoleFacts
{
    private static async Task<(ModuleBrain Host, string Key, string Root)> ConnectedAsync(CancellationToken ct)
    {
        var (host, machineId, root) = await WindowsHost.StartAsync(ct);
        var key = WindowsHost.Machine(machineId);
        await host.Get<IConnection>(key).Connect("device", machineId);
        await host.Get<IWindows>(key).AllowRoot(root);
        return (host, key, root);
    }

    [Fact(Timeout = 60_000)]
    public async Task FilesAreWrittenAndReadInsideARoot()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, root) = await ConnectedAsync(ct);
        await using var _ = host;
        var files = host.Get<IFileSystem>(WindowsKeys.Files(key));

        await files.Write(@"notes\a.txt", "hi there", ct);

        Assert.Equal("hi there", await files.Read(Path.Combine(root, "notes", "a.txt"), ct));
        Assert.Contains(await files.List("notes", ct), entry => entry.EndsWith("a.txt", StringComparison.OrdinalIgnoreCase));
    }

    [Theory(Timeout = 60_000)]
    [InlineData(@"..\escape.txt")]
    [InlineData(@"C:\Windows\win.ini")]
    public async Task APathOutsideTheRootsIsRefused(string path)
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, _) = await ConnectedAsync(ct);
        await using var _ = host;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => host.Get<IFileSystem>(WindowsKeys.Files(key)).Read(path, ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task ASiblingFolderSharingTheRootsPrefixIsRefused()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, root) = await ConnectedAsync(ct);
        await using var _ = host;
        var sibling = Directory.CreateDirectory(root + "2").FullName;
        File.WriteAllText(Path.Combine(sibling, "x.txt"), "no");

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => host.Get<IFileSystem>(WindowsKeys.Files(key)).Read(Path.Combine(sibling, "x.txt"), ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task RevokingTheRootRefusesTheNextCall()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, root) = await ConnectedAsync(ct);
        await using var _ = host;
        var files = host.Get<IFileSystem>(WindowsKeys.Files(key));
        await files.Write("a.txt", "x", ct);

        await host.Get<IWindows>(key).RevokeRoot(root);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => files.Read("a.txt", ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task ACommandRunsInTheFirstRootByDefault()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, root) = await ConnectedAsync(ct);
        await using var _ = host;

        var result = await host.Get<IConsole>(WindowsKeys.Console(key)).Run("cd", null, 30, ct);

        Assert.Equal(0, result.ExitCode);
        Assert.Equal(Path.GetFullPath(root).TrimEnd('\\'), result.StandardOutput.Trim(), ignoreCase: true);
    }

    [Fact(Timeout = 60_000)]
    public async Task AWorkingDirectoryOutsideTheRootsIsRefused()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, key, _) = await ConnectedAsync(ct);
        await using var _ = host;

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => host.Get<IConsole>(WindowsKeys.Console(key)).Run("dir", @"C:\", 30, ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task AnotherMachinesFilesAreNotServedHere()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, _, _) = await WindowsHost.StartAsync(ct);
        await using var _ = host;
        var other = WindowsHost.Machine(Guid.NewGuid().ToString("N"));

        await Assert.ThrowsAsync<ServiceUnavailableException>(() => host.Get<IFileSystem>(WindowsKeys.Files(other)).List(".", ct));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => host.Get<IConsole>(WindowsKeys.Console(other)).Run("cd", null, 30, ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task WithoutRootsNothingIsAllowed()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows only");
        var ct = TestContext.Current.CancellationToken;
        var (host, machineId, _) = await WindowsHost.StartAsync(ct);
        await using var _ = host;
        var key = WindowsHost.Machine(machineId);
        await host.Get<IConnection>(key).Connect("device", machineId);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => host.Get<IFileSystem>(WindowsKeys.Files(key)).List(".", ct));
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests -- --filter-class "*FilesAndConsoleFacts"`
Expected: FAIL — no implementation for `IFileSystem`/`IConsole`.

- [ ] **Step 3: Implement**

`MachineRoots.cs`:
```csharp
namespace DigitalBrain.Microsoft.Windows;

// Paths resolve against the first root when relative and must land inside some root; "C:\root2" is not inside "C:\root".
internal static class MachineRoots
{
    public static string Resolve(string[] roots, string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (roots.Length == 0) { throw new UnauthorizedAccessException("No folder on this machine is allowed yet."); }
        var full = Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(roots[0], path)).TrimEnd(Path.DirectorySeparatorChar);
        foreach (var root in roots)
        {
            if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase)
                || full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) { return full; }
        }
        throw new UnauthorizedAccessException($"'{path}' is outside the folders allowed on this machine.");
    }
}
```

`FileSystemNeuron.cs`:
```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;

namespace DigitalBrain.Microsoft.Windows;

[GrainType("windows.files")]
internal sealed class FileSystemNeuron(IMachineIdentity identity) : Neuron, IFileSystem
{
    public async Task<string> Read(string path, CancellationToken cancellationToken = default) =>
        await File.ReadAllTextAsync(await Resolve(path), cancellationToken);

    public async Task Write(string path, string content, CancellationToken cancellationToken = default)
    {
        var full = await Resolve(path);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await File.WriteAllTextAsync(full, content, cancellationToken);
    }

    public async Task<string[]> List(string path, CancellationToken cancellationToken = default) =>
        Directory.GetFileSystemEntries(await Resolve(path));

    private async Task<string> Resolve(string path)
    {
        var connection = WindowsKeys.Connection(this.GetPrimaryKeyString());
        if (ConnectionKeys.Parse(connection).ConnectionId != identity.Id)
        { throw new ServiceUnavailableException("This Windows machine is not this silo's machine."); }
        return MachineRoots.Resolve(await GrainFactory.GetGrain<IWindows>(connection).Roots(), path);
    }
}
```

`ConsoleNeuron.cs`:
```csharp
using System.Diagnostics;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;

namespace DigitalBrain.Microsoft.Windows;

[GrainType("windows.console")]
internal sealed class ConsoleNeuron(IMachineIdentity identity) : Neuron, IConsole
{
    private const int MaxOutputChars = 20_000;

    public async Task<CommandResult> Run(string command, string? workingDirectory = null, int timeoutSeconds = 60, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(command);
        var connection = WindowsKeys.Connection(this.GetPrimaryKeyString());
        if (ConnectionKeys.Parse(connection).ConnectionId != identity.Id)
        { throw new ServiceUnavailableException("This Windows machine is not this silo's machine."); }
        var roots = await GrainFactory.GetGrain<IWindows>(connection).Roots();
        var directory = MachineRoots.Resolve(roots, workingDirectory ?? (roots.Length > 0 ? roots[0] : "."));

        var start = new ProcessStartInfo("cmd.exe") { WorkingDirectory = directory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        start.ArgumentList.Add("/c");
        start.ArgumentList.Add(command);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("cmd.exe did not start.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(timeoutSeconds, 1, 300)));
        var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var error = process.StandardError.ReadToEndAsync(timeout.Token);
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw new TimeoutException($"The command ran longer than {timeoutSeconds} seconds."); }
        return new CommandResult(process.ExitCode, Clip(await output), Clip(await error));
    }

    private static string Clip(string text) => text.Length <= MaxOutputChars ? text : text[..MaxOutputChars];
}
```
Before writing, read the existing `src/DigitalBrain.Modules/DigitalBrain/Machine/DigitalBrain.Modules.Machine/Console/ConsoleNeuron.cs` (LSP `documentSymbol`) and keep any behaviour it has that this lacks (encoding, output limit option). Confirm with LSP that `ConnectionKeys.Parse` returns a tuple/record with `ConnectionId` (the Explore report names fields `Brain/Connector/Connection` on `ConnectionNeuron.Key`; use the real member names) and that `Neuron` exposes `GrainFactory`.

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests`
Expected: all Windows facts PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/MachineRoots.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/FileSystemNeuron.cs src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/ConsoleNeuron.cs src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/FilesAndConsoleFacts.cs
git commit -m "Windows: files and console confined to the machine's allowed roots"
```

---

### Task 5: Move every Machine consumer and delete Machine

**Files:**
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs:24` (`MachineModule` → `new DigitalBrain.Microsoft.Windows.WindowsModule()`, placed with the other `Microsoft` modules) and the OS project's reference (Machine → Windows).
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json:9-14` (delete the `machine` section; roots are now per connection).
- Modify: `features/os/Router/dispatch.cs:14,26`, `features/os/Assistant/submissions.cs:6,19`, `features/os/Assistant/Assistant.cs:15,34` (`using DigitalBrain.Machine;` → `using DigitalBrain.Microsoft.Windows;`; add `typeof(IWindows).FullName!` next to `IConsole`/`IFileSystem`).
- Modify: `features/os/Assistant/prompts/system.md:27-28`.
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantScenarioFacts.cs:101`, `.../AssistantGateFacts.cs:94,122` (`WithModule<DigitalBrain.Microsoft.Windows.WindowsModule>()`), `.../RouteResultFacts.cs:13,20` (`"machine.console"` → `"windows.console"`), and the AI tests csproj reference.
- Modify: `DigitalBrain.slnx:63-68` (remove the Machine folders) and `DigitalBrain-lsp.sln`.
- Delete: `src/DigitalBrain.Modules/DigitalBrain/Machine/` (all three projects).

- [ ] **Step 1: Map every reference with LSP**

`findReferences` on `MachineModule`, `DigitalBrain.Machine.IConsole`, `DigitalBrain.Machine.IFileSystem`, `CommandResult`, `MachineOptions`. Cross-check with a text search for `machine.console`, `machine.files`, `DigitalBrain.Machine`, `Modules:machine` (non-code text: features `.cs` scripts are compiled at runtime, prompts, json). The expected list is the Files section above; anything extra joins this task.

- [ ] **Step 2: Update the assistant prompt**

Replace `features/os/Assistant/prompts/system.md` lines 27-28 with:
```markdown
- This PC is a `windows` connection keyed `{brain}/connection/windows/{machineId}`. Find it by listing the brain's
  connections of connector `windows`. `IWindows.Facts()` describes it; `IWindows.Roots()` lists the folders you may use.
- Files: `IFileSystem.Read/Write/List` at key `{connectionKey}/files`. Commands: `IConsole.Run(command, workingDirectory, timeoutSeconds)`
  (cmd.exe) at key `{connectionKey}/console`. Both work only inside the allowed roots; ask the person to allow a folder when none is.
```
Read the surrounding prompt first and keep its voice and formatting.

- [ ] **Step 3: Apply the code edits listed in Files**, then delete the Machine folder and its slnx entries.

- [ ] **Step 4: Build and test every touched project**

Run:
- `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`
- `dotnet test --project src/DigitalBrain.OS.Tests.Unit` (locate the exact path with the workspace)
- `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*AssistantScenarioFacts"` then `"*AssistantGateFacts"` then `"*RouteResultFacts"`
- `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: all PASS. Features compile at boot (`FeatureCatalog`); Task 7 confirms that live.

- [ ] **Step 5: Commit** (explicit paths: every modified file above, plus `git rm -r src/DigitalBrain.Modules/DigitalBrain/Machine`)

```bash
git rm -r src/DigitalBrain.Modules/DigitalBrain/Machine
git add DigitalBrain.slnx src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj src/DigitalBrain.OS/DigitalBrain.OS/appsettings.json features/os/Router/dispatch.cs features/os/Assistant/submissions.cs features/os/Assistant/Assistant.cs features/os/Assistant/prompts/system.md src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantScenarioFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RouteResultFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/DigitalBrain.Modules.AI.Tests.csproj
git commit -m "OS: the Windows module replaces Machine; the assistant acts on this PC through its connection"
```
(Adjust the `RouteResultFacts.cs` and csproj paths to what LSP found.)

---

### Task 6: Launcher profiles

**Files:**
- Modify: `digitalbrain.cs`
- Modify: `src/DigitalBrain.AppHost/AppHost.cs` (Flutter hosting at line ~58; configuration file loading near the builder creation)

**Interfaces:**
- Produces: `dotnet run digitalbrain.cs [default|headless|<path>.json] [-- AppHost arguments]`. `headless` adds `--DigitalBrain:Shell:Enabled=false`; a `.json` path adds `--DigitalBrain:ConfigFile=<absolute path>`. AppHost: `DigitalBrain:Shell:Enabled` (default true) gates the Flutter hosting; `DigitalBrain:ConfigFile` is loaded with `AddJsonFile(path, optional: false)`.

- [ ] **Step 1: Map the AppHost chain with LSP**

`goToDefinition` on `.WithHosting<FlutterModuleHosting, FlutterModuleOptions>` and on the builder variable at the chain start in `AppHost.cs` to learn the builder type, so the Flutter call can be made conditional without breaking the chain.

- [ ] **Step 2: Gate the shell and load the extra config**

In `AppHost.cs`, right after the distributed application builder is created:
```csharp
if (builder.Configuration["DigitalBrain:ConfigFile"] is { Length: > 0 } configFile)
{ builder.Configuration.AddJsonFile(configFile, optional: false); }
var shellEnabled = builder.Configuration.GetValue("DigitalBrain:Shell:Enabled", true);
```
Split the fluent chain at the Flutter call so it becomes:
```csharp
if (shellEnabled) { digitalBrain = digitalBrain.WithHosting<FlutterModuleHosting, FlutterModuleOptions>(flutter => flutter.RunDesktopApp()); }
```
where `digitalBrain` is the chain's variable (introduce one if the chain is a single expression, with the type found in Step 1).

- [ ] **Step 3: Parse the profile in `digitalbrain.cs`**

Replace the argument forwarding with:
```csharp
// `dotnet run digitalbrain.cs [default|headless|<config>.json] [-- <AppHost arguments>]`
var forwarded = args.ToList();
var profileArguments = new List<string>();
if (forwarded.Count > 0 && !forwarded[0].StartsWith('-'))
{
    var profile = forwarded[0];
    forwarded.RemoveAt(0);
    if (profile.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
    {
        var path = Path.GetFullPath(profile);
        if (!File.Exists(path)) { Console.Error.WriteLine($"Config file '{path}' does not exist."); return 2; }
        profileArguments.Add($"--DigitalBrain:ConfigFile={path}");
    }
    else if (profile == "headless") { profileArguments.Add("--DigitalBrain:Shell:Enabled=false"); }
    else if (profile != "default") { Console.Error.WriteLine($"Unknown profile '{profile}'. Use default, headless or a .json config file."); return 2; }
}
if (forwarded.FirstOrDefault() == "--") { forwarded.RemoveAt(0); }
```
and add `profileArguments` then `forwarded` to `start.ArgumentList` (instead of `args`). Update the file's leading comment to name the profiles.

- [ ] **Step 4: Check each profile starts**

Run `dotnet run digitalbrain.cs headless` from the repo root; `mcp__aspire__list_resources`: every resource Running/Healthy and no Flutter resource. Stop it. Run `dotnet run digitalbrain.cs nope` — exits 2 with the message. Run with a temp `.json` containing `{"DigitalBrain":{"Shell":{"Enabled":false}}}` — no Flutter resource.

- [ ] **Step 5: Commit**

```bash
git add digitalbrain.cs src/DigitalBrain.AppHost/AppHost.cs
git commit -m "Launcher: default, headless and config-file profiles"
```

---

### Task 7: Live verification

- [ ] **Step 1:** `dotnet run digitalbrain.cs`; `mcp__aspire__list_resources` all Running/Healthy (read `list_console_logs` for any that is not — a features compile error from Task 5 shows here).
- [ ] **Step 2:** Read this PC's machine id from `%LOCALAPPDATA%\DigitalBrain\machine-id`. Through the brain's connections endpoint (`/brains/{id}/connections`, connector `windows`, auth method `device`, value = machine id) connect this machine.
- [ ] **Step 3:** Through `digitalbrain-mcp`: `neurons_context`; `neurons_call` `IWindows.Facts` on `{brain}/connection/windows/{machineId}`; `IWindows.AllowRoot` a scratch folder; `IFileSystem.Write` then `Read` at `{connectionKey}/files`; `IConsole.Run("dir")` at `{connectionKey}/console`. Then call `IWindows.Facts` with a random machine id — expect 503.
- [ ] **Step 4:** Ask the assistant (through the shell or MCP) to list the files in the allowed folder; it should find the connection and use `IFileSystem`.
- [ ] **Step 5:** Telemetry: `list_traces` shows the `windows`, `windows.files`, `windows.console` calls; `list_structured_logs` has no errors.
- [ ] **Step 6:** Regression: Windows module, AI module (the three Assistant/Route classes), OS unit and Architecture suites all PASS.
