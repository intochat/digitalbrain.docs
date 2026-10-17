# Derived Runtime Section 5 - One Identity Scheme for Every Run

> **For agentic workers (OpenCode):** you implement exactly ONE task below. Read the spec first:
> `docs/superpowers/specs/2026-10-09-derived-runtime-design.md` (section 5). Read `CLAUDE.md`. Read
> `docs/superpowers/specs/2026-10-09-brain-profiles-and-test-targets-design.md` (the design this
> section consumes). Stay inside the files your task lists. Do not commit code files the task does
> not list. The orchestrator reviews and commits; the git add list in each task is exact.

**Depends on.** This is section 5 of the derived-runtime spec (order 2, 3, 1, 4, 5). Other sessions
plan sections 2, 3, 1 and 4 in parallel; nothing here plans or edits their files. This section
CONSUMES the brain-profiles work from the Photocraft session, which owns `DigitalBrainProfiles`:
- `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainProfiles.cs` (uncommitted)
- `src/DigitalBrain.AppHost/profiles/{dev,local}.json` (uncommitted)
- `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/ProfileFacts.cs` (uncommitted)
- the `AddDigitalBrainProfiles` hunk in `src/DigitalBrain.AppHost/AppHost.cs` (uncommitted)

Do NOT write a second profile scheme and do NOT edit `DigitalBrainProfiles.cs`. If it is not on the
branch when section 5 starts, message the Photocraft session and wait. `RunIdentity` below only
reads `DigitalBrainProfiles.Parse` / `ProfileKey` / `DefaultProfile`; everything else is additive.

**Goal:** The Launcher's identity scheme - port block, service id, cluster id, storage container
from a name - is the single source for every host. The AppHost reads a profile name
(`DigitalBrain:Profile`, default `dev`), derives ports and identity from it (`RunIdentity`), and a
second host runs beside the first (`aspire run -lp local`). E2E hosts derive identity and ports
from a random profile name through the same code, so a test host never binds 5080/5081.

**Already here (this section starts from):**
- `DigitalBrainHostingOptions.Named(IConfiguration, string defaultIdentity, bool useAzureStorage)`
  already reads `Orleans:ServiceId`, `Orleans:ClusterId` and
  `DigitalBrain:Orleans:GrainStateContainer` from configuration
  (`src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs`).
- The Launcher's scheme (`src/DigitalBrain.Launcher/DigitalBrain.Launcher/Revisions/Revision.cs`,
  `Processes/AspireRun.cs`, `LauncherOptions.cs`): for name `x`, `ServiceId = ClusterId =
  "intochat-" + x`, `GrainStateContainer = "brain-" + x`, and a revision's ports are blocks of ten
  starting at 5090 (`UiPort = 5090 + 10*k`, `McpPort = UiPort + 1`). The launcher passes these in as
  environment, so the AppHost already honours them.
- `aspire run` supports `-lp, --launch-profile <name>` (Aspire CLI 13.6), which selects the AppHost's
  `Properties/launchSettings.json` profile and sets its `environmentVariables`.
- E2E hosts run the real AppHost via
  `E2ETest.For<TAppHost>()` -> `src/Testing/DigitalBrain.Testing.E2E/E2ETest.cs`, which already
  clears ProjectResource http endpoints (`AspireTestSession.AllocateProjectHttpPorts`) so two
  in-process sessions never collide on the AppHost's published ports.

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, Aspire 13.6 (`aspire run -lp, --launch-profile`).
- Build and test **per project**, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj` . `dotnet test --project src/<test-project-dir>`.
  Cap every test run at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, not a timeout to raise.
- Warnings are errors, nullable on. No new packages (the config `Memory`/`Json` sources are already
  on the Aspire.Hosting dependency tree; if the build reports a missing
  `Microsoft.Extensions.Configuration.Memory` reference, add a `PackageVersion` in
  `Directory.Packages.props` and a `PackageReference` in the hosting csproj, and report it).
- No `/// <summary>` boilerplate. Inline comments only for what code cannot say. Match surrounding
  style (file-scoped namespaces, expression bodies, `ConfigureAwait(false)` in Framework).
- Tests: facts with sentence-shaped names and `TestContext.Current.CancellationToken`. Copy the
  shape of `ProfileFacts.cs` / `DeploymentIdentityFacts.cs` for the hosting facts.
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`,
  `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`, or `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainProfiles.cs`.
  `src/DigitalBrain.AppHost/AppHost.cs` is shared with the Photocraft session AND has one of its
  uncommitted hunks in it: stage ONLY your own hunks (`git add -p`) and never the whole file blindly.
- Commit by **explicit file paths only**, never directories, never `git add -A`. Every task names
  its git add list and commit message verbatim.
- Done = the projects your task names build with 0 warnings, the facts your task names pass, and
  the exact commands below are green. Report the exact commands and output.
- Plain ASCII punctuation only in source and this plan.

---

## Task S5-1: RunIdentity - the derivation, consumed by AppHost and E2E

**Executor:** Claude (owns the identity seam: a public API on a packable hosting package).

**Files:**
- Create `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/RunIdentity.cs`
- Create `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/RunIdentityHostingExtensions.cs`
- Create `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/RunIdentityFacts.cs`

**Produces.** `RunIdentity.cs` - mirrors the Launcher's formulas exactly (for a name `x`: cluster
ids `"intochat-" + x`, storage container `"brain-" + x`, block of ten ports from 5090), so the
Launcher scheme stays the single source; `dev` (the default profile) IS the published product so
today's behavior is unchanged:

```csharp
using Microsoft.Extensions.Configuration;

namespace DigitalBrain.Aspire.Hosting;

// A run's identity and published ports, derived from a name the way the Launcher derives a
// revision's (Revision.ServiceId "intochat-r<sha>", container "brain-r<sha>", blocks of ten ports
// from FirstBlockPort). The default profile "dev" IS the published product: 5080/5081, identity
// "intochat", grain state container "digitalbrain-v2-state". Every other name lands in its own
// block, cluster and container, so a second AppHost runs beside the first on one machine
// (aspire run -lp local) and an E2E host never binds the published ports.
public sealed record RunIdentity(string Name, int UiPort, int McpPort, string ServiceId, string ClusterId, string GrainStateContainer)
{
    public const string DefaultProduct = "intochat";
    public const string UiPortKey = "DigitalBrain:Http:UiPort";
    public const string McpPortKey = "DigitalBrain:Http:McpPort";
    public const int FirstBlockPort = 5090;
    public const int BlockSize = 10;

    public static RunIdentity Named(string name, string product = DefaultProduct)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(product);
        name = name.Trim();
        if (name == DigitalBrainProfiles.DefaultProfile)
        {
            return new(name, 5080, 5081, product, product, DigitalBrain.Framework.DigitalBrainNames.GrainStateContainer);
        }
        var uiPort = FirstBlockPort + StableBlock(name) * BlockSize;
        return new(name, uiPort, uiPort + 1, $"{product}-{name}", $"{product}-{name}", $"brain-{name}");
    }

    public static RunIdentity From(IConfiguration configuration, string product = DefaultProduct)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var names = DigitalBrainProfiles.Parse(configuration[DigitalBrainProfiles.ProfileKey] ?? DigitalBrainProfiles.DefaultProfile);
        return Named(names[0], product);
    }

    // FNV-1a over the UTF-16 units: stable across processes, unlike string.GetHashCode, so a name
    // always lands in the same block. Two different names may share a block (1 in 1000); that is a
    // port conflict like any other, no worse than today.
    private static int StableBlock(string value)
    {
        unchecked
        {
            var hash = 2166136261u;
            foreach (var unit in value) { hash = (hash ^ unit) * 16777619u; }
            return (int)((hash & 0x7FFFFFFFu) % 1000);
        }
    }
}
```

`RunIdentityHostingExtensions.cs` - the AppHost calls this after `AddDigitalBrainProfiles`. It reads
the effective profile, derives the identity, and inserts the five keys in the same seat the profile
layers claim (above the shipped appsettings json, below environment and command line), so an
explicit setting still wins over the identity its name derived. This CONSUMES `DigitalBrainProfiles`,
it is not a second profile scheme:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;
using Microsoft.Extensions.Configuration.Memory;

namespace DigitalBrain.Aspire.Hosting;

public static class RunIdentityHostingExtensions
{
    public static IReadOnlyList<string> AddDigitalBrainRunIdentity(this IConfigurationBuilder configuration, string product = RunIdentity.DefaultProduct)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var built = configuration.Build();
        var names = DigitalBrainProfiles.Parse(built[DigitalBrainProfiles.ProfileKey] ?? DigitalBrainProfiles.DefaultProfile);
        var run = RunIdentity.From(built, product);
        // Same seat as the profile layers: above the shipped appsettings, below environment and
        // command line, so the launcher's environment overrides and `aspire run -- --Orleans:...`
        // still win while today's defaults hold for dev.
        var at = configuration.Sources.ToList().FindLastIndex(source => source is JsonConfigurationSource) + 1;
        configuration.Sources.Insert(at, new MemoryConfigurationSource
        {
            InitialData = new Dictionary<string, string?>
            {
                [RunIdentity.UiPortKey] = run.UiPort.ToString(System.Globalization.CultureInfo.InvariantCulture),
                [RunIdentity.McpPortKey] = run.McpPort.ToString(System.Globalization.CultureInfo.InvariantCulture),
                [DigitalBrainHostingOptions.ServiceIdKey] = run.ServiceId,
                [DigitalBrainHostingOptions.ClusterIdKey] = run.ClusterId,
                [DigitalBrainHostingOptions.GrainStateContainerKey] = run.GrainStateContainer,
            },
        });
        return names;
    }
}
```

**Facts (RunIdentityFacts).** Fixture creates a temp app-host dir with `profiles/dev.json` (`{}`)
and `profiles/local.json` (`{}`), mirroring `ProfileFacts`:

```csharp
using DigitalBrain.Aspire.Hosting;
using Microsoft.Extensions.Configuration;

namespace DigitalBrain.Aspire.Hosting.Tests.Unit;

public sealed class RunIdentityFacts : IDisposable
{
    private readonly string _appHost = Directory.CreateTempSubdirectory("runidentity-").FullName;

    public RunIdentityFacts()
    {
        Directory.CreateDirectory(Path.Combine(_appHost, DigitalBrainProfiles.Directory));
        File.WriteAllText(Path.Combine(_appHost, DigitalBrainProfiles.Directory, "dev.json"), "{}");
        File.WriteAllText(Path.Combine(_appHost, DigitalBrainProfiles.Directory, "local.json"), "{}");
    }

    [Fact]
    public void TheDefaultProfileIsThePublishedProduct()
    {
        var run = RunIdentity.Named("dev");
        Assert.Equal("dev", run.Name);
        Assert.Equal(5080, run.UiPort);
        Assert.Equal(5081, run.McpPort);
        Assert.Equal("intochat", run.ServiceId);
        Assert.Equal("intochat", run.ClusterId);
        Assert.Equal("digitalbrain-v2-state", run.GrainStateContainer);
    }

    [Fact]
    public void ANamedProfileDerivesItsOwnPortBlockClusterAndStorage()
    {
        var local = RunIdentity.Named("local");
        Assert.Equal(8450, local.UiPort);
        Assert.Equal(8451, local.McpPort);
        Assert.Equal("intochat-local", local.ServiceId);
        Assert.Equal(local.ServiceId, local.ClusterId);
        Assert.Equal("brain-local", local.GrainStateContainer);
        Assert.Equal(0, local.UiPort % RunIdentity.BlockSize);
        Assert.True(local.UiPort >= RunIdentity.FirstBlockPort);

        var second = RunIdentity.Named("second", product: "digitalbrain");
        Assert.Equal(12180, second.UiPort);
        Assert.Equal(12181, second.McpPort);
        Assert.Equal("digitalbrain-second", second.ServiceId);
        Assert.Equal("brain-second", second.GrainStateContainer);
        Assert.NotEqual(local.ServiceId, second.ServiceId);
    }

    [Fact]
    public void AProfileNameNeverDerivesThePublishedPortsOrIdentity()
    {
        for (var i = 0; i < 100; i++)
        {
            var run = RunIdentity.Named("e2e-" + Guid.NewGuid().ToString("N"));
            Assert.NotEqual(5080, run.UiPort);
            Assert.NotEqual(5081, run.McpPort);
            Assert.NotEqual(RunIdentity.DefaultProduct, run.ServiceId);
        }
    }

    [Fact]
    public void WithoutAnExplicitProfileTheDevIdentityIsConfigured()
    {
        var configuration = new ConfigurationBuilder().AddJsonFile(Path.Combine(_appHost, DigitalBrainProfiles.Directory, "dev.json"));
        configuration.AddDigitalBrainRunIdentity();
        var built = configuration.Build();
        Assert.Equal("5080", built[RunIdentity.UiPortKey]);
        Assert.Equal("5081", built[RunIdentity.McpPortKey]);
        Assert.Equal("intochat", built[DigitalBrainHostingOptions.ServiceIdKey]);
        Assert.Equal("digitalbrain-v2-state", built[DigitalBrainHostingOptions.GrainStateContainerKey]);
    }

    [Fact]
    public void TheProfileNameDerivesThePortsAndIdentityIntoConfiguration()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { [DigitalBrainProfiles.ProfileKey] = "local" });
        configuration.AddDigitalBrainProfiles(_appHost);
        configuration.AddDigitalBrainRunIdentity();
        var built = configuration.Build();
        Assert.Equal("8450", built[RunIdentity.UiPortKey]);
        Assert.Equal("8451", built[RunIdentity.McpPortKey]);
        Assert.Equal("intochat-local", built[DigitalBrainHostingOptions.ServiceIdKey]);
        Assert.Equal("intochat-local", built[DigitalBrainHostingOptions.ClusterIdKey]);
        Assert.Equal("brain-local", built[DigitalBrainHostingOptions.GrainStateContainerKey]);
    }

    [Fact]
    public void AnExplicitSettingOutranksTheDerivedIdentity()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [DigitalBrainProfiles.ProfileKey] = "local",
            [RunIdentity.UiPortKey] = "9999",
        });
        configuration.AddDigitalBrainProfiles(_appHost);
        configuration.AddDigitalBrainRunIdentity();
        var built = configuration.Build();
        Assert.Equal("9999", built[RunIdentity.UiPortKey]);
        Assert.Equal("8451", built[RunIdentity.McpPortKey]);
        Assert.Equal("intochat-local", built[DigitalBrainHostingOptions.ServiceIdKey]);
    }

    public void Dispose() => Directory.Delete(_appHost, recursive: true);
}
```

**Verify:**
- `dotnet build src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrain.Aspire.Hosting.csproj`
- `timeout 300 dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit`
  (all green: existing `ProfileFacts`, `DeploymentIdentityFacts`, plus the six new facts)
- `timeout 300 dotnet test --project src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit`
  (`RevisionsFacts` stays green: the Launcher scheme and `RunIdentity` agree)

**git add (explicit files only):**
```
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/RunIdentity.cs
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/RunIdentityHostingExtensions.cs
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/RunIdentityFacts.cs
```
**commit:** `Run identity: a profile name derives ports, cluster and storage; dev keeps the published product`

---

## Task S5-2: AppHost derives and wires the profile's identity; second-host launch profiles

**Executor:** DeepSeek (narrow wiring; fully specified below).

**Files:**
- Modify `src/DigitalBrain.AppHost/AppHost.cs`
- Modify `src/DigitalBrain.AppHost/Properties/launchSettings.json`

**Produces.** `AppHost.cs`: call the derivation right after the profile composition; read the
runtime and MCP ports from `RunIdentity` instead of local consts (delete the consts):

```csharp
var builder = DistributedApplication.CreateBuilder(args);
// `aspire run -- --DigitalBrain:Profile local` composes profiles/*.json; dev is today's composition.
// The profile also names the run's ports and identity (RunIdentity): `aspire run -lp local` runs a
// second host beside the first, in its own port block, cluster and storage.
builder.Configuration.AddDigitalBrainProfiles(builder.AppHostDirectory);
builder.Configuration.AddDigitalBrainRunIdentity();
```

and, in the two endpoint declarations:

```csharp
        port: builder.Configuration.GetValue(RunIdentity.UiPortKey, 5080),
```
```csharp
    .WithHttpEndpoint(port: builder.Configuration.GetValue(RunIdentity.McpPortKey, 5081), name: "http", isProxied: false)
```

Remove the now-unused locals at the top of the file:
```csharp
const string UiPortKey = "DigitalBrain:Http:UiPort";
const string McpPortKey = "DigitalBrain:Http:McpPort";
```
`DigitalBrain.Aspire.Hosting` is already imported. Do not touch any other line, and do not touch any
hunk that came from the Photocraft session (the `AddDigitalBrainProfiles` line is theirs; stage the
run-identity lines with `git add -p`). The `Named(..., "intochat", ...)` call and every other line
stay as they are; with `AddDigitalBrainRunIdentity` the injection feeds the same configuration keys
`Named` reads.

`Properties/launchSettings.json` (keep the existing `https` and `http` profiles verbatim as the
default selection, and append two identity-named profiles so `aspire run -lp local` starts a second
host; the launch profile's environment variables land above the profile layers, so
`DigitalBrain__Profile` wins):

```json
{
  "$schema": "https://json.schemastore.org/launchsettings.json",
  "profiles": {
    "https": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,
      "applicationUrl": "https://localhost:17197;http://localhost:15100",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL": "https://localhost:21123",
        "ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL": "https://localhost:22146"
      }
    },
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": true,
      "applicationUrl": "http://localhost:15100",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL": "http://localhost:21123",
        "ASPIRE_RESOURCE_SERVICE_ENDPOINT_URL": "http://localhost:22146"
      }
    },
    "dev": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "DigitalBrain__Profile": "dev"
      }
    },
    "local": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_ENVIRONMENT": "Development",
        "DigitalBrain__Profile": "local"
      }
    }
  }
}
```

**Verify:**
- `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` (0 warnings)
- `git diff -- src/DigitalBrain.AppHost/AppHost.cs` must show ONLY the two deleted consts, the two
  `GetValue(RunIdentity.*)` changes, and the added run-identity line plus comment - nothing else.

**git add (explicit files only; stage ONLY your hunks in AppHost.cs):**
```
git add -p src/DigitalBrain.AppHost/AppHost.cs
git add src/DigitalBrain.AppHost/Properties/launchSettings.json
```
**commit:** `AppHost: derive run identity and ports from the profile; launch profiles for a second host`

---

## Task S5-3: E2E hosts derive a random identity through the same code

**Executor:** DeepSeek (narrow harness edit; fully specified below).

**Files:**
- Modify `src/Testing/DigitalBrain.Testing.E2E/E2ETest.cs`
- Create `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E/TestRunIdentityFacts.cs`

**Produces.** `E2ETest.cs`: a test run is a random profile name through `RunIdentity.Named`, and the
composed host arguments carry the derived identity and ports (the same derivation the AppHost
applies, injected by the same keys the AppHost reads). The method becomes internal so the seam is
testable; `DigitalBrain.Testing.E2E` already declares `InternalsVisibleTo
DigitalBrain.Platform.Tests.E2E`, and `DigitalBrain.Aspire.Hosting` is already referenced and
imported in this file:

```csharp
        var run = NewRunIdentity();
        var args = ComposeHostArguments(optionOverrides, run, options.HostConfiguration);
```

```csharp
    internal static IReadOnlyList<string> ComposeHostArguments(IReadOnlyDictionary<string, string?> optionOverrides, RunIdentity run,
        IReadOnlyDictionary<string, string?> hostConfiguration)
        =>
        [
            // A random profile name through the same derivation the AppHost applies: its own
            // cluster, storage container and port block, so a test host never binds 5080/5081 even
            // without the endpoint clearing below.
            $"{DigitalBrainHostingOptions.PersistentStorageKey}=false",
            $"{RunIdentity.UiPortKey}={run.UiPort}",
            $"{RunIdentity.McpPortKey}={run.McpPort}",
            $"{DigitalBrainHostingOptions.ServiceIdKey}={run.ServiceId}",
            $"{DigitalBrainHostingOptions.ClusterIdKey}={run.ClusterId}",
            $"{DigitalBrainHostingOptions.GrainStateContainerKey}={run.GrainStateContainer}",
            .. optionOverrides.Select(pair => $"{pair.Key}={pair.Value}"),
            // Arguments reach the AppHost builder before its program composes modules; adding to
            // builder.Configuration afterwards would miss hosting-layer binds like the Flutter host.
            .. hostConfiguration.Select(pair => $"{pair.Key}={pair.Value}"),
        ];

    private static RunIdentity NewRunIdentity() => RunIdentity.Named("e2e-" + Guid.NewGuid().ToString("N"));
```

Delete the old `NewIdentity()` (`"test-" + Guid.NewGuid()...`). The module-builder path
(`CreateModuleBuilder`, used by `E2EBoundaryFacts`) does not call `ComposeHostArguments` and is
untouched. `AspireTestSession.AllocateProjectHttpPorts` stays as the second guarantee that project
endpoints are dynamic.

**Facts (TestRunIdentityFacts):**

```csharp
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Testing.E2E;

namespace DigitalBrain.Platform.Tests.E2E;

public sealed class TestRunIdentityFacts
{
    [Fact]
    public void ATestRunDerivesARandomIdentityAndNeverBindsThePublishedPorts()
    {
        var run = RunIdentity.Named("e2e-" + Guid.NewGuid().ToString("N"));
        Assert.NotEqual(5080, run.UiPort);
        Assert.NotEqual(5081, run.McpPort);
        Assert.StartsWith("intochat-e2e-", run.ServiceId, StringComparison.Ordinal);
        Assert.Equal(run.ServiceId, run.ClusterId);
        var args = E2ETest.ComposeHostArguments(new Dictionary<string, string?>(), run, new Dictionary<string, string?>());
        Assert.Contains($"{RunIdentity.UiPortKey}={run.UiPort}", args);
        Assert.Contains($"{RunIdentity.McpPortKey}={run.McpPort}", args);
        Assert.Contains($"{DigitalBrainHostingOptions.ServiceIdKey}={run.ServiceId}", args);
        Assert.Contains($"{DigitalBrainHostingOptions.GrainStateContainerKey}={run.GrainStateContainer}", args);
        Assert.DoesNotContain(args, argument => argument.Contains("=5080", StringComparison.Ordinal) || argument.Contains("=5081", StringComparison.Ordinal));
    }
}
```

**Verify:**
- `dotnet build src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj` (0 warnings)
- `timeout 300 dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E`
  (existing `ProjectEndpointFacts` + the new fact; no docker, no host start)
- `timeout 300 dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E --filter-class "*E2EBoundaryFacts*"`
  (the harness boundary facts still pass; none of them boots a host)

**git add (explicit files only):**
```
git add src/Testing/DigitalBrain.Testing.E2E/E2ETest.cs
git add src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E/TestRunIdentityFacts.cs
```
**commit:** `E2E: a test run derives a random identity and never binds the published ports`

---

## Task S5-4: Verification loop - two hosts on one machine, E2E never binds 5080

**Executor:** Claude (runs against the live system; coordinate the Aspire turn with the other
sessions per the orchestration plan before taking it).

Files already exist: the tasks above land before this one runs. Per CLAUDE.md, a change is done
only when the running system shows it.

1. **Build clean.** The three sections' proofs: `dotnet build` of Aspire.Hosting, AppHost,
   Testing.E2E and Platform.Tests.E2E, all 0 warnings. Then the regression net: unit suites
   `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit` and
   `src/DigitalBrain.Launcher/DigitalBrain.Launcher.Tests.Unit`; E2E suites
   `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E` and
   `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E --filter-class "*E2EBoundaryFacts*"`.
2. **First host (dev).** `aspire run` from `src/DigitalBrain.AppHost` (or use the dev host another
   session already runs; it binds 5080/5081). `mcp__aspire__list_resources`: `OperatingSystem`
   healthy on `http://localhost:5080`, `digitalbrain-mcp` healthy on `http://localhost:5081`.
3. **Second host beside it.** `aspire run --project src/DigitalBrain.AppHost -lp local`
   (`--launch-profile local`; the launch profile composes `profiles/local.json` and sets the
   derived identity). Wait for its dashboard; do not raise a timeout. `mcp__aspire__list_resources`:
   the second host's `OperatingSystem` is healthy on `http://localhost:8450` and its
   `digitalbrain-mcp` on `http://localhost:8451`; the dev host on 5080/5081 is untouched. If the MCP
   sees two AppHosts, `aspire_select_apphost` targets each one in turn.
4. **Drive each through `digitalbrain-mcp`** at `localhost:5081/mcp` and `localhost:8451/mcp`
   (each `/brains/{brainId}/mcp` selects that host's brain):
   - `neurons_context` on both: the same caller and brain id are reported by two separate clusters.
   - `neurons_list` / `neurons_search` on the second host: the composed catalog is present.
   - `neurons_get` on a first-party app neuron (e.g. `/brains/owner/apps/calculator`) on the second
     host returns the installed bundle, proving a full OS booted on the derived identity.
5. **Telemetry.** For the second host: `list_traces` shows the request spans from the `neurons_*`
   calls; `list_structured_logs` for its `OperatingSystem` contains `intochat-local`
   (`Orleans:ServiceId`/`Orleans:ClusterId`) and the runtime's grain storage opened `brain-local`;
   `list_structured_logs` for its `digitalbrain-mcp` shows the same identity. The dev host's logs on
   5080 still name `intochat` and `digitalbrain-v2-state`.
6. **Stop the second host** (`Ctrl+C` / `aspire_execute_resource_command * stop` on each of its
   resources, or stop the cli). The dev host stays running for the other sessions.
7. **The joining facts.** "Two AppHosts with different profiles start on one machine" is steps 2-3;
   "an E2E host never binds 5080" is the `TestRunIdentityFacts` fact (S5-3) plus
   `AspireTestSession.AllocateProjectHttpPorts` keeping project endpoints dynamic.

---

## Open questions (for the orchestrator)

- The `local` preset currently means `local.json` model composition AND the derivatively-named
  identity/ports. If the brain-profiles session later assigns fixed ports to presets, section 5
  follows it and `RunIdentity.From` yields; today derivation wins for non-dev names.
- Two different non-`dev` profiles can hash to the same block (1 in 1000). Accepted: same-name
  runs conflict today; this only makes different-name collision rare and explicit.
- `RunIdentity` reproduces (does not reference) the Launcher's constants (`5090`, `10`,
  `intochat-`, `brain-`). Keeping the Launcher as the definitions owner is a later refactor, out of
  scope here.