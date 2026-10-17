# Brain Runtime Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the process-per-script sandbox with one sandbox session per brain that loads precompiled behaviors, so a brain with thousands of behaviors runs in one process over one connection, starts in seconds, and never blocks OS readiness.

**Architecture:** The silo compiles behaviors with Roslyn at publish and stores assemblies by content hash in blob storage. A new `IBrainRuntime` neuron per brain owns the desired set of behaviors, their durable subscriptions and one session; a single `SessionRunner` starts that session in a Docker container locally or an Azure Container Apps session pool in production. The sandbox host is a runtime-only image that downloads assemblies, loads each in a collectible `AssemblyLoadContext`, and talks to the brain over three HTTP routes with a session token.

**Tech Stack:** .NET 11 RC, Orleans (grains, reminders, observers), ASP.NET minimal APIs with server-sent events, Roslyn (`Microsoft.CodeAnalysis.CSharp`), Azure Blob Storage (Azurite locally), Aspire hosting, Pulumi (Azure Native), xunit v3 facts over `DigitalBrain.Testing.Module`.

**Spec:** `docs/superpowers/specs/2026-10-07-brain-runtime-sandbox-design.md`

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`). No `/// <summary>` boilerplate.
- Build and test per project, never the `.slnx`: `dotnet build <csproj>`, `dotnet test --project <test csproj>`.
- Grain state uses concrete arrays and `Dictionary`, never `IReadOnlyList`.
- No self-calls on non-reentrant grains; use `this.AsReference<T>()` one-way references.
- Tests are facts with sentence-shaped names, use `TestContext.Current.CancellationToken`, real grains via `ModuleTest.Create().WithModule<CSharpModule>()`.
- No state compatibility: delete old state shapes, no migrations. Wipe the Azurite volume before `aspire run` after this change.
- No timeouts raised and no polling added to make a check pass. No health polling inside grain calls.
- `BrainScope.CurrentId()` is the brain of every scoped operation; runtime routes mount under `BrainRoutes.Group(endpoints, "/runtime")`.
- Module config keys come from `DigitalBrainConfiguration.ModuleSection("csharp")` / `ModuleOptionsSection("csharp")`; the only secret is `DigitalBrain:Integrations:csharp:RunTokenKey`.
- Behavior source limit stays `128 * 1024` bytes; `MaximumPending` default `64`; `MaximumFailures` `5`.
- Every C# edit goes through LSP: `findReferences` on each symbol you change or delete before editing, diagnostics clean after.

## Review Focus

1. A behavior that throws on its first line must disarm after five crashes without stopping the brain's other behaviors or its session (pinned in Task 6 by `AFailingBehaviorDisarmsAloneAfterFiveCrashes`).
2. A stream that drops mid-batch must redeliver the unacknowledged batch on reconnect, never lose it, never duplicate an acknowledged one (pinned in Task 6 by `AnUnacknowledgedBatchIsResentOnTheNextStream` and Task 9 by `ReconnectResumesFromTheLastAcknowledgedWatermark`).
3. A sandbox host built from a different OS build must be refused loudly, not load against stale contracts (pinned in Task 8 by `AMismatchedContractsFingerprintIsRefused`).
4. An expired or foreign session token must fail every route with 401 and never reach a grain (pinned in Task 8 by `AnExpiredTokenIsRefusedOnEveryRoute`).
5. Publishing shipped apps must not wait on any sandbox; the OS must report ready with the sandbox container absent (pinned in Task 13 by `ReadinessDoesNotDependOnTheSandbox`).

---

## File map

**Modified**
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Authoring/IScriptSandbox.cs` — `Check` becomes `Compile` returning hashes.
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs:513-527` — publish gate calls `Compile`.
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/Creator.cs:163` — check tool calls `Compile`.
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs`, `BuilderTools.cs` — no `#:project` wording.
- `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Runtimes/CSharpAppRuntime.cs` — unchanged API, calls the slim file neuron.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpScriptCheck.cs` — emits assemblies.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpContractDiscovery.cs` — no directives.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpScriptSandbox.cs` — `Compile`, new description.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileNeuron.cs`, `CSharpFileState.cs` — slim record.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/CSharpModule.cs` — registrations.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Configuration/CSharpOptions.cs` — drop `SourceRoot`, `AspireApplication`, `SandboxProbeUrl`; add `SandboxUrl`.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/ICSharpFile.cs`, `CSharpFileSnapshot.cs` — no `ResponseTimeout`, slim snapshot.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Aspire.Hosting/CSharpModuleHosting.cs` — always-on container.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/CSharpDeployment.cs` — per-brain sessions, no idle shutdown.
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/*` — rewritten host.
- `src/DigitalBrain.Client/DigitalBrain.Client/*` — session connection, ambient connect.
- `src/DigitalBrain.Platform/DigitalBrain.Platform/Identity/IdentityEndpoints.cs:106` — sign-in touches the runtime.
- `src/IntoChat/Apps/**/synapses/*.cs`, `src/DigitalBrain.OS/Apps/**/synapses/*.cs`, `src/DigitalBrain.Modules/Microsoft/CSharp/Samples/*.cs` — drop `#:project` lines.
- `.github/workflows/deploy.yml` — build both images.

**Created**
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/IBrainRuntime.cs`, `BrainRuntimeSnapshot.cs`, `BrainRuntimeKeys.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs`, `BrainRuntimeState.cs`, `IBrainRuntimeArrivals.cs`, `IBrainRuntimeEdge.cs`, `BrainRuntimeActivation.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Assemblies/IBehaviorAssemblies.cs`, `BlobBehaviorAssemblies.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Sessions/SessionRunner.cs`, `SessionTokens.cs`, `SessionStreams.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/RuntimeEdge.cs`, `RuntimeEdgeEndpoints.cs`
- `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/V1/RuntimeProtocol.cs`
- `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/SessionConnection.cs`, `AmbientSession.cs`, `SessionSignalSubscription.cs`
- `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile` (single), `Sessions.cs`, `Session.cs`, `BehaviorLoader.cs`, `BehaviorRun.cs`, `SandboxEndpoints.cs`
- Tests: `MemoryBehaviorAssemblies.cs`, `FakeSessionHost.cs`, `BrainRuntimeNeuronFacts.cs`, `SessionTokensFacts.cs`, `SessionRunnerFacts.cs`, `RuntimeEdgeFacts.cs`, `BehaviorLoaderFacts.cs`, `SessionConnectionFacts.cs`

**Deleted** (Task 11): `Sandbox/AspireSandboxRunner.cs`, `Sandbox/SessionPoolRunner.cs`, `Sandbox/ICSharpRunner.cs`, `Sandbox/SandboxRunsApi.cs`, `Sandbox/SandboxWire.cs`, `Sandbox/CSharpRunState.cs`, `Sandbox/CSharpSandbox.cs`, `Catalog/CSharpDirectives.cs`, `Edge/RunTokens.cs`, `Edge/ScriptRunEnvironment.cs`, `Edge/ScriptEdge.cs`, `Edge/ScriptEdgeEndpoints.cs`, `Edge/ICSharpFileEdge.cs`, `Files/ICSharpFileArrivals.cs`, `Files/CSharpFileActivation.cs`, `Files/Subscription.cs` (moves to `Runtime/`), sandbox `SandboxRuns.cs`, `DotNetScriptLauncher.cs`, `IScriptLauncher.cs`, `IdleShutdown.cs`, `RunLog.cs`, `SandboxContracts.cs`, `Dockerfile.production`, `Dockerfile.production.dockerignore`, client `Edge/ScriptEdgeClient.cs`, `Edge/EdgeSignalSubscription.cs`, `Edge/ScriptSignalQuery.cs`, tests `FakeSandbox.cs`, `FakeAspire.cs`, `SandboxBrain.cs`, `SandboxRunsFacts.cs`, `SandboxWireFacts.cs`, `SessionPoolRunnerFacts.cs`, `RunTokensFacts.cs`, `ScriptEdgeFacts.cs`, `CSharpSubscriptionFacts.cs` (rewritten under runtime), the Aspire.Contracts reference in the CSharp csproj.

---

### Task 1: The compiler emits assemblies

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpScriptCheck.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Authoring/IScriptSandbox.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpScriptSandbox.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs:513-527`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/Creator.cs:163`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpScriptCheckFacts.cs`

**Interfaces:**
- Produces: `CSharpScriptCheck.Compile(IReadOnlyDictionary<string,string> files) -> ScriptCompilation`; `ScriptCompilation(bool Success, IReadOnlyList<ScriptDiagnostic> Errors, IReadOnlyDictionary<string, CompiledBehavior> Assemblies)`; `CompiledBehavior(byte[] Assembly, byte[] Symbols, string Hash)` where `Hash` is lowercase hex SHA-256 of `Assembly`. `IScriptSandbox.Compile(files) -> ScriptCompilationCheck` with a new `IReadOnlyDictionary<string,string> Hashes` property.

- [ ] **Step 1: Write the failing facts**

Add to `CSharpScriptCheckFacts.cs`:

```csharp
[Fact]
public void ACompilingScriptEmitsAnAssemblyNamedByItsContentHash()
{
    var result = _check.Compile(new Dictionary<string, string>
    {
        ["synapses/hello.cs"] = "Console.WriteLine(args.Length);\nawait Task.CompletedTask;\n",
    });

    Assert.True(result.Success, string.Join("; ", result.Errors.Select(error => $"{error.Id} {error.Message}")));
    var compiled = result.Assemblies["synapses/hello.cs"];
    Assert.NotEmpty(compiled.Assembly);
    Assert.NotEmpty(compiled.Symbols);
    Assert.Equal(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(compiled.Assembly)), compiled.Hash);
    Assert.Equal("Program", System.Reflection.Assembly.Load(compiled.Assembly).EntryPoint!.DeclaringType!.Name);
}

[Fact]
public void TheSameSourceCompilesToTheSameHash()
{
    var files = new Dictionary<string, string> { ["a.cs"] = "Console.WriteLine(1);\n" };
    Assert.Equal(_check.Compile(files).Assemblies["a.cs"].Hash, _check.Compile(files).Assemblies["a.cs"].Hash);
}

[Fact]
public void AFailingScriptEmitsNothing()
{
    var result = _check.Compile(new Dictionary<string, string> { ["bad.cs"] = "int wrong = \"text\";\n" });
    Assert.False(result.Success);
    Assert.Empty(result.Assemblies);
}
```

Also change the existing `ACompilingScriptWithFileDirectivesAndContractsPasses` to drop the `#:project` line and call `Compile` (directives are gone).

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*CSharpScriptCheckFacts*"`
Expected: build error, `Compile` not defined.

- [ ] **Step 3: Implement `Compile`**

Replace the body of `CSharpScriptCheck.cs` keeping `GlobalUsings`, `Parse`, `References`, `LoadReferences`:

```csharp
public sealed record CompiledBehavior(byte[] Assembly, byte[] Symbols, string Hash);

public sealed record ScriptCompilation(bool Success, IReadOnlyList<ScriptDiagnostic> Errors, IReadOnlyDictionary<string, CompiledBehavior> Assemblies);

public sealed class CSharpScriptCheck
{
    // ... GlobalUsings, Parse, References as today ...

    // Deterministic so one source always yields one hash: no PDB path, no timestamps.
    private static readonly CSharpCompilationOptions Options = new(OutputKind.ConsoleApplication, deterministic: true, nullableContextOptions: NullableContextOptions.Enable);
    private static readonly EmitOptions Emit = new(debugInformationFormat: DebugInformationFormat.PortablePdb);

    public ScriptCompilation Compile(IReadOnlyDictionary<string, string> files)
    {
        ArgumentNullException.ThrowIfNull(files);
        if (files.Count == 0) { throw new ArgumentException("Pass at least one file to compile.", nameof(files)); }
        var errors = new List<ScriptDiagnostic>();
        var assemblies = new Dictionary<string, CompiledBehavior>(StringComparer.Ordinal);
        foreach (var (path, source) in files.OrderBy(file => file.Key, StringComparer.Ordinal))
        {
            ArgumentNullException.ThrowIfNull(source, path);
            var trees = new[]
            {
                CSharpSyntaxTree.ParseText(SourceText.From(source, Encoding.UTF8), Parse, path),
                CSharpSyntaxTree.ParseText(SourceText.From(GlobalUsings, Encoding.UTF8), Parse, "GlobalUsings.cs"),
            };
            var compilation = CSharpCompilation.Create("behavior", trees, References.Value, Options);
            using var assembly = new MemoryStream();
            using var symbols = new MemoryStream();
            var emitted = compilation.Emit(assembly, symbols, options: Emit);
            var failures = emitted.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .Select(diagnostic => new ScriptDiagnostic(path, diagnostic.Id,
                    diagnostic.Location.GetLineSpan().StartLinePosition.Line + 1, diagnostic.GetMessage())).ToArray();
            errors.AddRange(failures);
            if (emitted.Success)
            {
                var bytes = assembly.ToArray();
                assemblies[path] = new(bytes, symbols.ToArray(), Convert.ToHexStringLower(SHA256.HashData(bytes)));
            }
        }
        return new(errors.Count == 0, errors, errors.Count == 0 ? assemblies : new Dictionary<string, CompiledBehavior>());
    }
}
```

Delete `WithoutFileDirectives` and `Check`. Add `using System.Security.Cryptography; using System.Text; using Microsoft.CodeAnalysis.Emit;`. Use LSP `findReferences` on `Check` and `ScriptCheckResult`: the callers are `CSharpScriptSandbox`, `ScopedCSharpTools` and tests; update each to `Compile`.

- [ ] **Step 4: Change the Apps seam**

`IScriptSandbox.cs`:

```csharp
public interface IScriptSandbox
{
    bool CanRun { get; }
    string AuthoringDescription { get; }
    Task<ScriptContractCatalog> ReadContracts(IReadOnlyList<string> modules, CancellationToken cancellationToken);
    // Compiles and stores every file; Hashes maps each path to its stored assembly when Success.
    Task<ScriptCompilationCheck> Compile(IReadOnlyDictionary<string, string> files, CancellationToken cancellationToken);
}

public sealed record ScriptCompilationCheck(bool Success, IReadOnlyList<ScriptCompilationDiagnostic> Errors)
{
    public IReadOnlyDictionary<string, string> Hashes { get; init; } = new Dictionary<string, string>(StringComparer.Ordinal);
}
```

Remove `Directive` from `ScriptContractModule` (`ScriptContractModule(string Id)`).

`CSharpScriptSandbox.Compile` (store comes in Task 2; for now it returns hashes from the compilation):

```csharp
public Task<ScriptCompilationCheck> Compile(IReadOnlyDictionary<string, string> files, CancellationToken cancellationToken)
{
    var checker = tools.Check ?? throw new InvalidOperationException("This host has no script compiler.");
    var result = checker.Compile(files);
    return Task.FromResult(new ScriptCompilationCheck(result.Success,
        [.. result.Errors.Select(error => new ScriptCompilationDiagnostic(error.File, error.Id, error.Line, error.Message))])
    { Hashes = result.Assemblies.ToDictionary(file => file.Key, file => file.Value.Hash, StringComparer.Ordinal) });
}
```

`AppNeuron.RequireCompiles` becomes `async Task RequireCompiles()` calling `await sandbox.Compile(scripts, CancellationToken.None)`; update its callers (LSP `findReferences`) to await it. `Creator.cs:163`: `await Require(csharp).Compile(..., cancellationToken)`.

- [ ] **Step 5: Build and run the facts**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj` then `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*CSharpScriptCheckFacts*"` and `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`.
Expected: PASS. Apps facts that assert on `Check` are updated to `Compile` in the same step.

- [ ] **Step 6: Commit**

```bash
git add -A src/DigitalBrain.Modules/Microsoft/CSharp src/DigitalBrain.Modules/DigitalBrain/Apps
git commit -m "CSharp: the compiler emits assemblies; Apps publish gate calls Compile"
```

---

### Task 2: Assembly store by content hash

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Assemblies/IBehaviorAssemblies.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Assemblies/BlobBehaviorAssemblies.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/MemoryBehaviorAssemblies.cs`
- Modify: `CSharpScriptSandbox.cs`, `CSharpModule.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/BehaviorAssembliesFacts.cs`

**Interfaces:**
- Produces:
```csharp
public interface IBehaviorAssemblies
{
    Task Put(CompiledBehavior behavior, CancellationToken cancellationToken);
    Task<bool> Exists(string hash, CancellationToken cancellationToken);
    // A URL the sandbox host can GET without credentials for `lifetime`; the body is the assembly, the "x-symbols" blob beside it.
    Task<Uri> ReadUrl(string hash, TimeSpan lifetime, CancellationToken cancellationToken);
}
```

- [ ] **Step 1: Write the failing facts**

```csharp
public sealed class BehaviorAssembliesFacts
{
    [Fact]
    public async Task PutThenExistsThenReadUrlRoundTrips()
    {
        var ct = TestContext.Current.CancellationToken;
        var store = new MemoryBehaviorAssemblies();
        var compiled = new CSharpScriptCheck().Compile(new Dictionary<string, string> { ["a.cs"] = "Console.WriteLine(1);\n" }).Assemblies["a.cs"];

        Assert.False(await store.Exists(compiled.Hash, ct));
        await store.Put(compiled, ct);
        Assert.True(await store.Exists(compiled.Hash, ct));
        var url = await store.ReadUrl(compiled.Hash, TimeSpan.FromMinutes(5), ct);
        Assert.EndsWith("/" + compiled.Hash, url.AbsolutePath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CompileStoresEveryAssemblyAndReturnsItsHash()
    {
        var ct = TestContext.Current.CancellationToken;
        var store = new MemoryBehaviorAssemblies();
        await using var brain = await ModuleTest.Create().WithModule<CSharpModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IBehaviorAssemblies>(store)).StartAsync(ct);
        var sandbox = brain.SiloServices.GetRequiredService<DigitalBrain.Apps.IScriptSandbox>();

        var check = await sandbox.Compile(new Dictionary<string, string> { ["synapses/x.cs"] = "Console.WriteLine(2);\n" }, ct);

        Assert.True(check.Success);
        Assert.True(await store.Exists(check.Hashes["synapses/x.cs"], ct));
    }
}
```

`MemoryBehaviorAssemblies`:

```csharp
internal sealed class MemoryBehaviorAssemblies : IBehaviorAssemblies
{
    public ConcurrentDictionary<string, CompiledBehavior> Stored { get; } = new(StringComparer.Ordinal);
    public Task Put(CompiledBehavior behavior, CancellationToken ct) { Stored[behavior.Hash] = behavior; return Task.CompletedTask; }
    public Task<bool> Exists(string hash, CancellationToken ct) => Task.FromResult(Stored.ContainsKey(hash));
    public Task<Uri> ReadUrl(string hash, TimeSpan lifetime, CancellationToken ct) => Task.FromResult(new Uri("http://assemblies.test/behaviors/" + hash));
}
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*BehaviorAssembliesFacts*"`
Expected: build error, `IBehaviorAssemblies` missing.

- [ ] **Step 3: Implement the blob store**

```csharp
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Microsoft.CSharp.Assemblies;

// Content addressed: the blob name is the assembly's SHA-256, so a thousand installs of one app share one blob.
internal sealed class BlobBehaviorAssemblies([FromKeyedServices(DigitalBrainNames.GrainState)] BlobServiceClient storage) : IBehaviorAssemblies
{
    public const string ContainerName = "behaviors";
    private readonly BlobContainerClient _container = storage.GetBlobContainerClient(ContainerName);

    public async Task Put(CompiledBehavior behavior, CancellationToken ct)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: ct);
        await _container.GetBlobClient(behavior.Hash).UploadAsync(new BinaryData(behavior.Assembly), overwrite: true, ct);
        await _container.GetBlobClient(behavior.Hash + ".pdb").UploadAsync(new BinaryData(behavior.Symbols), overwrite: true, ct);
    }

    public async Task<bool> Exists(string hash, CancellationToken ct) => await _container.GetBlobClient(hash).ExistsAsync(ct);

    public Task<Uri> ReadUrl(string hash, TimeSpan lifetime, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(hash);
        // Azurite and a connection-string client can sign; a managed-identity client needs a user delegation key.
        if (blob.CanGenerateSasUri) { return Task.FromResult(blob.GenerateSasUri(BlobSasPermissions.Read, DateTimeOffset.UtcNow + lifetime)); }
        return DelegatedAsync(blob, lifetime, ct);
    }

    private async Task<Uri> DelegatedAsync(BlobClient blob, TimeSpan lifetime, CancellationToken ct)
    {
        var expires = DateTimeOffset.UtcNow + lifetime;
        var key = await storage.GetUserDelegationKeyAsync(DateTimeOffset.UtcNow.AddMinutes(-5), expires, ct);
        var sas = new BlobSasBuilder(BlobSasPermissions.Read, expires) { BlobContainerName = blob.BlobContainerName, BlobName = blob.Name };
        return new BlobUriBuilder(blob.Uri) { Sas = sas.ToSasQueryParameters(key.Value, storage.AccountName) }.ToUri();
    }
}
```

Add `<PackageReference Include="Azure.Storage.Blobs" />` to the CSharp module csproj (the version is already in `Directory.Packages.props` because Platform uses it; verify with `grep Azure.Storage.Blobs Directory.Packages.props`). Register in `CSharpModule.Configure`: `builder.Services.TryAddSingleton<IBehaviorAssemblies, BlobBehaviorAssemblies>();`.

`CSharpScriptSandbox` takes `IBehaviorAssemblies assemblies` and after a successful compile does `foreach (var compiled in result.Assemblies.Values) { await assemblies.Put(compiled, cancellationToken); }`.

- [ ] **Step 4: Run the facts**

Run the two facts. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/DigitalBrain.Modules/Microsoft/CSharp
git commit -m "CSharp: behaviors are stored by content hash in blob storage"
```

---

### Task 3: Contracts and wire protocol

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/IBrainRuntime.cs`, `BrainRuntimeSnapshot.cs`, `BrainRuntimeKeys.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/ICSharpFile.cs`, `CSharpFileSnapshot.cs`
- Create: `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/V1/RuntimeProtocol.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/BrainRuntimeKeysFacts.cs`

**Interfaces (produced, used verbatim by every later task):**

```csharp
// Contracts/Runtime/IBrainRuntime.cs
[Alias("microsoft.csharp.runtime"), DefaultGrainType("microsoft.csharp.runtime")]
public interface IBrainRuntime : INeuron
{
    Task<BrainRuntimeSnapshot> Inspect(CancellationToken cancellationToken = default);
    // Sign-in and the shell call this: ensures a session when anything is assigned, otherwise nothing.
    Task Touch(CancellationToken cancellationToken = default);
}

// Contracts/Runtime/BrainRuntimeSnapshot.cs
[GenerateSerializer, Alias("microsoft.csharp.session-status")]
public enum SessionStatus { None, Starting, Connected, Refused }

[GenerateSerializer, Alias("microsoft.csharp.runtime-snapshot")]
public sealed record BrainRuntimeSnapshot(
    [property: Id(0)] SessionStatus Session,
    [property: Id(1)] string? SessionId,
    [property: Id(2)] string? Fingerprint,
    [property: Id(3)] DateTimeOffset? LastHeartbeat,
    [property: Id(4)] IReadOnlyList<BehaviorView> Behaviors);

[GenerateSerializer, Alias("microsoft.csharp.behavior-view")]
public sealed record BehaviorView(
    [property: Id(0)] string Id,
    [property: Id(1)] string Hash,
    [property: Id(2)] CSharpFileStatus Status,
    [property: Id(3)] int Failures,
    [property: Id(4)] IReadOnlyList<CSharpSubscriptionView> Subscriptions);

// Contracts/Runtime/BrainRuntimeKeys.cs
public static class BrainRuntimeKeys
{
    public static string For(string scope)
    {
        if (string.IsNullOrWhiteSpace(scope) || scope.AsSpan().IndexOfAny('/', '\\', ':') >= 0)
        { throw new ArgumentException("A brain scope is a non-empty id without separators.", nameof(scope)); }
        return scope + "/runtime";
    }
}

// Contracts/Files/ICSharpFile.cs (no ResponseTimeout attributes any more)
[Alias("microsoft.csharp.file"), DefaultGrainType("microsoft.csharp.file")]
public interface ICSharpFile : INeuron
{
    Task<CSharpFileSnapshot> Inspect(CancellationToken cancellationToken = default);
    Task Write(string source, CancellationToken cancellationToken = default);
    Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default);
    Task<CSharpFileSnapshot> Start(CancellationToken cancellationToken = default);
    Task<CSharpFileSnapshot> Swap(string source, CancellationToken cancellationToken = default);
    Task<CSharpFileSnapshot> Stop(CancellationToken cancellationToken = default);
    Task Delete(CancellationToken cancellationToken = default);
    Task<string> ReadLogs(int tail = 200, CancellationToken cancellationToken = default);
}

// Contracts/Files/CSharpFileSnapshot.cs
[GenerateSerializer, Alias("microsoft.csharp.file-status")]
public enum CSharpFileStatus { Stopped, Starting, Running, Exited, Disarmed }

[GenerateSerializer, Alias("microsoft.csharp.file-snapshot")]
public sealed record CSharpFileSnapshot(
    [property: Id(0)] string Id,
    [property: Id(1)] string Source,
    [property: Id(2)] IReadOnlyDictionary<string, string> Settings,
    [property: Id(3)] string? Hash,
    [property: Id(4)] CSharpFileStatus Status,
    [property: Id(5)] int? ExitCode,
    [property: Id(6)] bool ShouldRun,
    [property: Id(7)] int Failures);
// CSharpSubscriptionView stays as today.

// Client/Runtime/V1/RuntimeProtocol.cs — shared by silo edge, client library and sandbox host.
namespace DigitalBrain.Client.Runtime.V1;

public static class RuntimeProtocol
{
    public const string EdgeSetting = "DigitalBrain:Edge";
    public const string TokenSetting = "DigitalBrain:Token";
    public const string Invoke = "runtime/v1/invoke";
    public const string Report = "runtime/v1/report";
    public const string Stream = "runtime/v1/stream";
    public const string RefusalHeader = "X-DigitalBrain-Refusal";
    public static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
}

public sealed record RuntimeInvocation(string Behavior, string Contract, string Key, string Method, JsonElement[] Arguments);

// Exactly one of the optional members is set per report.
public sealed record RuntimeReport(
    string? Fingerprint = null,
    SubscribeReport? Subscribe = null,
    AcknowledgeReport? Acknowledge = null,
    BehaviorStatusReport? Status = null,
    bool Heartbeat = false);
public sealed record SubscribeReport(string Behavior, string Contract, string Key, string Signal);
public sealed record AcknowledgeReport(string Subscription, long Watermark);
public sealed record BehaviorStatusReport(string Behavior, string Hash, string Status, int? ExitCode, string? Error);

// Stream events: event name is the record's Kind.
public sealed record AssignmentEvent(string Behavior, string Hash, Uri Assembly, Uri Symbols, Dictionary<string, string> Settings) { public const string Kind = "assign"; }
public sealed record RetireEvent(string Behavior) { public const string Kind = "retire"; }
public sealed record SubscribedEvent(string Behavior, string Contract, string Key, string Signal, string Subscription) { public const string Kind = "subscribed"; }
public sealed record SignalBatchEvent(string Subscription, string[] Signals, long Watermark) { public const string Kind = "signals"; }
public sealed record TokenEvent(string Token) { public const string Kind = "token"; }
public sealed record ReadyEvent(string Session) { public const string Kind = "ready"; }
```

- [ ] **Step 1: Write the failing fact**

```csharp
public sealed class BrainRuntimeKeysFacts
{
    [Fact] public void TheRuntimeKeyIsTheScopeThenRuntime() => Assert.Equal("acc-brain/runtime", BrainRuntimeKeys.For("acc-brain"));
    [Fact] public void AScopeWithASeparatorIsRefused() => Assert.Throws<ArgumentException>(() => BrainRuntimeKeys.For("a/b"));
}
```

- [ ] **Step 2: Run to verify failure** (`--filter-method "*BrainRuntimeKeysFacts*"`). Expected: build error.

- [ ] **Step 3: Add the files above exactly.** Delete `Client/Edge/V1/ScriptEdgeProtocol.cs` only in Task 9; for now both exist. The Contracts csproj references only `DigitalBrain`, so `IBrainRuntime` needs no new reference. Add `<ProjectReference Include="../../DigitalBrain.Client/DigitalBrain.Client.csproj" />` is NOT needed in Contracts; the protocol lives in Client, which the module and the host reference.

- [ ] **Step 4: Build the contracts and client projects**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/DigitalBrain.Modules.Microsoft.CSharp.Contracts.csproj` and `dotnet build src/DigitalBrain.Client/DigitalBrain.Client/DigitalBrain.Client.csproj`. The module project will not build yet (old neuron uses removed snapshot members); that is fixed in Task 7. Run the keys facts after Task 7 lands if the test project does not build before then; note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add -A src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts src/DigitalBrain.Client/DigitalBrain.Client/Runtime
git commit -m "CSharp: IBrainRuntime contract and the runtime wire protocol"
```

---

### Task 4: Session tokens

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Sessions/SessionTokens.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SessionTokensFacts.cs`

**Interfaces:**
- Produces: `SessionTokens : IIntegrationStartup` with `string Issue(string brain, string session)` and `SessionClaims? Validate(string? token)`; `SessionClaims(string Brain, string Session, DateTimeOffset Expires)`; `SessionTokens.Lifetime = TimeSpan.FromHours(1)`.

- [ ] **Step 1: Write the failing facts** (copy `RunTokensFacts.cs` structure; it constructs the token service with a fake `IModuleIntegrations<CSharpModule>` and a `FakeTimeProvider`):

```csharp
public sealed class SessionTokensFacts
{
    [Fact]
    public async Task AnIssuedTokenValidatesToItsBrainAndSession()
    {
        var ct = TestContext.Current.CancellationToken;
        var tokens = await Tokens(ct);
        var claims = tokens.Validate(tokens.Issue("acc-brain", "s1"));
        Assert.Equal(("acc-brain", "s1"), (claims!.Brain, claims.Session));
    }

    [Fact]
    public async Task AnExpiredTokenIsNull()
    {
        var ct = TestContext.Current.CancellationToken;
        var time = new FakeTimeProvider();
        var tokens = await Tokens(ct, time);
        var token = tokens.Issue("acc-brain", "s1");
        time.Advance(SessionTokens.Lifetime + TimeSpan.FromSeconds(1));
        Assert.Null(tokens.Validate(token));
    }

    [Fact]
    public async Task ATamperedTokenIsNull()
    {
        var ct = TestContext.Current.CancellationToken;
        var tokens = await Tokens(ct);
        var token = tokens.Issue("acc-brain", "s1");
        Assert.Null(tokens.Validate(token[..^2] + "zz"));
    }

    // Reuse the helper from RunTokensFacts: a development IHostEnvironment and unprovisioned integrations
    // make the service generate a key.
    private static async Task<SessionTokens> Tokens(CancellationToken ct, TimeProvider? time = null) { /* same construction as RunTokensFacts.Tokens, type renamed */ }
}
```

- [ ] **Step 2: Run to verify failure.** Expected: build error.

- [ ] **Step 3: Implement** by copying `RunTokens.cs` to `Sessions/SessionTokens.cs`: rename class, claims record to `SessionClaims(string Brain, string Session, DateTimeOffset Expires)`, `Lifetime = TimeSpan.FromHours(1)`, `Issue(string brain, string session)`. Everything else (HMAC, base64url, integration startup) is unchanged. Register in `CSharpModule`: `TryAddSingleton<SessionTokens>()` and `AddSingleton<IIntegrationStartup>(s => s.GetRequiredService<SessionTokens>())`, replacing the `RunTokens` lines.

- [ ] **Step 4: Run the facts.** Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "CSharp: session tokens speak for a brain's sandbox session"`.

---

### Task 5: One session runner and a fake host

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Sessions/SessionRunner.cs`
- Modify: `Configuration/CSharpOptions.cs` (`CSharpDeploymentSettings`: keep `EdgeUrl`, `SessionPoolEndpoint`; replace `SandboxProbeUrl` with `SandboxUrl`)
- Create: `tests/.../FakeSessionHost.cs`
- Test: `tests/.../SessionRunnerFacts.cs`

**Interfaces:**
- Produces:
```csharp
internal sealed record SessionStart(string Brain, string Session, string Token, string EdgeUrl);
internal sealed class SessionRunner
{
    Task Ensure(SessionStart start, CancellationToken ct);   // POST {base}/sessions/{identifier}  body: SessionStart
    Task<bool> Exists(string brain, CancellationToken ct);    // local: GET /sessions/{id}; pool: POST .management/getSession
    Task Stop(string brain, CancellationToken ct);            // POST /sessions/{id}/stop
    internal static string Identifier(string brain) => "b-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(brain)))[..32];
}
```

- [ ] **Step 1: Write `FakeSessionHost`** (an `HttpMessageHandler`, replacing `FakeSandbox`):

```csharp
internal sealed class FakeSessionHost : HttpMessageHandler
{
    public const string Url = "http://sandbox.test/";
    public ConcurrentDictionary<string, JsonNode> Sessions { get; } = new(StringComparer.Ordinal);
    public ConcurrentQueue<(string Method, string Path, JsonNode? Body)> Requests { get; } = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var path = request.RequestUri!.AbsolutePath.Trim('/');
        var body = request.Content is null ? null : JsonNode.Parse(await request.Content.ReadAsStringAsync(ct));
        Requests.Enqueue((request.Method.Method, path, body));
        switch (path.Split('/'))
        {
            case ["sessions", var id] when request.Method == HttpMethod.Post: Sessions[id] = body!; return new(HttpStatusCode.Accepted);
            case ["sessions", var id] when Sessions.ContainsKey(id): return new(HttpStatusCode.OK);
            case ["sessions", var id, "stop"] when Sessions.TryRemove(id, out _): return new(HttpStatusCode.OK);
            default: return new(HttpStatusCode.NotFound);
        }
    }

    public static bool IsStart((string Method, string Path, JsonNode? Body) r) => r.Method == "POST" && r.Path.Split('/') is ["sessions", _];
}
```

- [ ] **Step 2: Write the failing facts**

```csharp
public sealed class SessionRunnerFacts
{
    [Fact]
    public async Task EnsurePostsTheSessionWithItsTokenAndEdge()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        var runner = Runner(host);
        await runner.Ensure(new("acc-brain", "s1", "tok", "http://edge.test/"), ct);
        var start = Assert.Single(host.Requests, FakeSessionHost.IsStart);
        Assert.Equal("sessions/" + SessionRunner.Identifier("acc-brain"), start.Path);
        Assert.Equal("tok", start.Body!["token"]!.GetValue<string>());
        Assert.True(await runner.Exists("acc-brain", ct));
        await runner.Stop("acc-brain", ct);
        Assert.False(await runner.Exists("acc-brain", ct));
    }

    [Fact]
    public void ThePoolIdentifierNeverLeaksTheBrainId()
        => Assert.DoesNotContain("acc-brain", SessionRunner.Identifier("acc-brain"), StringComparison.Ordinal);

    private static SessionRunner Runner(FakeSessionHost host)
        => new(new HttpClient(host) { BaseAddress = new Uri(FakeSessionHost.Url) },
               Options.Create(new CSharpDeploymentSettings { SandboxUrl = FakeSessionHost.Url }), credential: null);
}
```

- [ ] **Step 3: Run to verify failure.** Expected: build error.

- [ ] **Step 4: Implement `SessionRunner`**

```csharp
// Where sessions live: the always-on sandbox container locally, or the Azure Container Apps session pool.
// Same host API behind both; the pool adds a bearer token and routes by the identifier query.
internal sealed class SessionRunner(HttpClient http, IOptions<CSharpDeploymentSettings> options, TokenCredential? credential)
{
    private const string ManagementApiVersion = "2025-02-02-preview";
    private static readonly TokenRequestContext PoolScope = new(["https://dynamicsessions.io/.default"]);

    private bool Pooled => options.Value.SessionPoolEndpoint is { Length: > 0 };
    private Uri Base => new((Pooled ? options.Value.SessionPoolEndpoint! : options.Value.SandboxUrl
        ?? throw new InvalidOperationException("Configure csharp Deployment:SandboxUrl or Deployment:SessionPoolEndpoint.")).TrimEnd('/') + "/");

    public async Task Ensure(SessionStart start, CancellationToken ct)
    {
        using var response = await SendAsync(HttpMethod.Post, Url("sessions/" + Identifier(start.Brain), start.Brain), JsonContent.Create(start, options: RuntimeProtocol.Json), ct);
        response.EnsureSuccessStatusCode();
    }

    public async Task<bool> Exists(string brain, CancellationToken ct)
    {
        var url = Pooled
            ? Url(".management/getSession", brain, "api-version=" + ManagementApiVersion)
            : Url("sessions/" + Identifier(brain), brain);
        using var response = await SendAsync(Pooled ? HttpMethod.Post : HttpMethod.Get, url, null, ct);
        return response.IsSuccessStatusCode;
    }

    public async Task Stop(string brain, CancellationToken ct)
    {
        using var response = await SendAsync(HttpMethod.Post, Url("sessions/" + Identifier(brain) + "/stop", brain), null, ct);
        if (response.StatusCode != HttpStatusCode.NotFound) { response.EnsureSuccessStatusCode(); }
    }

    internal static string Identifier(string brain) => "b-" + Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(brain)))[..32];

    private Uri Url(string path, string brain, string? extra = null)
        => new(Base, path + (Pooled ? "?identifier=" + Identifier(brain) + (extra is null ? "" : "&" + extra) : ""));

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, Uri url, HttpContent? content, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, url) { Content = content };
        if (Pooled && credential is not null)
        { request.Headers.Authorization = new("Bearer", (await credential.GetTokenAsync(PoolScope, ct)).Token); }
        return await http.SendAsync(request, ct);
    }
}
```

Register in `CSharpModule.Configure` (replacing the two-runner `if`):

```csharp
if (!string.IsNullOrWhiteSpace(builder.Configuration[CSharpDeploymentSettings.SectionName + ":SessionPoolEndpoint"]))
{ builder.Services.TryAddSingleton<TokenCredential>(_ => new DefaultAzureCredential()); }
builder.Services.AddHttpClient<SessionRunner>();
```

`SessionRunner`'s `TokenCredential?` parameter resolves to null when unregistered because `AddHttpClient<T>` uses `ActivatorUtilities`; mark the parameter `TokenCredential? credential = null`.

- [ ] **Step 5: Run the facts.** Expected: PASS.

- [ ] **Step 6: Commit** `git commit -m "CSharp: one SessionRunner for the local container and the Azure session pool"`.

---

### Task 6: The brain runtime neuron

**Files:**
- Create: `Runtime/BrainRuntimeState.cs`, `Runtime/Subscription.cs` (moved from `Files/`), `Runtime/BrainRuntimeNeuron.cs`, `Runtime/IBrainRuntimeArrivals.cs`, `Runtime/IBrainRuntimeEdge.cs`, `Runtime/BrainRuntimeActivation.cs`, `Sessions/SessionStreams.cs`
- Test: `tests/.../BrainRuntimeNeuronFacts.cs`

**Interfaces:**
- Consumes: `SessionRunner`, `SessionTokens`, `IBehaviorAssemblies`, `CSharpOptions.MaximumPending`.
- Produces (internal, used by Tasks 7 and 8):

```csharp
// Runtime/BrainRuntimeState.cs
[GenerateSerializer, Alias("microsoft.csharp.behavior-assignment")]
internal sealed record BehaviorAssignment([property: Id(0)] string Id, [property: Id(1)] string Hash,
    [property: Id(2)] Dictionary<string, string> Settings, [property: Id(3)] CallerContext? Owner, [property: Id(4)] string? AppId,
    [property: Id(5)] CSharpFileStatus Status, [property: Id(6)] int? ExitCode, [property: Id(7)] int Failures);

[GenerateSerializer, Alias("microsoft.csharp.session-record")]
internal sealed record SessionRecord([property: Id(0)] string Id, [property: Id(1)] SessionStatus Status,
    [property: Id(2)] string? Fingerprint, [property: Id(3)] DateTimeOffset? LastHeartbeat);

[GenerateSerializer, Alias("microsoft.csharp.runtime-state")]
internal sealed record BrainRuntimeState
{
    [Id(0)] public BehaviorAssignment[] Behaviors { get; init; } = [];
    [Id(1)] public Subscription[] Subscriptions { get; init; } = [];
    [Id(2)] public SessionRecord? Session { get; init; }
}

// Runtime/Subscription.cs: today's record plus Id and Behavior
[GenerateSerializer, Alias("microsoft.csharp.subscription")]
internal sealed record Subscription([property: Id(0)] string Id, [property: Id(1)] string Behavior,
    [property: Id(2)] string Neuron, [property: Id(3)] string Signal, [property: Id(4)] string[] Pending,
    [property: Id(5)] long Delivered, [property: Id(6)] long Dropped)
{ /* Watermark, Arrive, Acknowledge as today */ }

// Runtime/IBrainRuntimeEdge.cs — what the HTTP edge and the behavior neuron call
[Alias("microsoft.csharp.runtime-edge")]
internal interface IBrainRuntimeEdge : IGrainWithStringKey
{
    Task Assign(string behavior, string hash, Dictionary<string, string> settings, CallerContext? owner, string? appId);
    Task Retire(string behavior);
    Task<BehaviorView?> Describe(string behavior);
    // Session-side reports; each validates the session id against the record.
    Task<SessionAuthorization> Authorize(string session);
    Task Connected(string session, string fingerprint);
    Task Heartbeat(string session);
    Task<string> Subscribed(string session, string behavior, string neuron, string signal); // returns subscription id
    Task Acknowledge(string session, string subscription, long watermark);
    Task Reported(string session, BehaviorStatusReport status);
    Task<IReadOnlyList<SignalBatchEvent>> PendingBatches(string session);
    Task<IReadOnlyList<AssignmentEvent>> Assignments(string session);
}
[GenerateSerializer, Alias("microsoft.csharp.session-authorization")]
internal sealed record SessionAuthorization([property: Id(0)] bool Active, [property: Id(1)] string Brain);

// Runtime/IBrainRuntimeArrivals.cs — one-way self reference for observer callbacks
[Alias("microsoft.csharp.runtime-arrivals")]
internal interface IBrainRuntimeArrivals : IGrainWithStringKey { [OneWay] Task Arrived(Signal signal); }

// Sessions/SessionStreams.cs — in-silo registry of open stream writers, keyed by session id, so the
// neuron can push events; the edge registers a writer when a host connects. Not grain state.
internal sealed class SessionStreams
{
    public Channel<(string Kind, object Payload)> Open(string session);
    public bool TryPush(string session, string kind, object payload);
    public void Close(string session);
}
```

Behavior of `BrainRuntimeNeuron` (grain type `microsoft.csharp.runtime`, key `{scope}/runtime`, `Neuron<BrainRuntimeState>`, `IBrainRuntime, IBrainRuntimeEdge, IBrainRuntimeArrivals, IRemindable, INeuronObserver`):

- `Access`: `Authorize/Connected/Heartbeat/Subscribed/Acknowledge/Reported/PendingBatches/Assignments` are `NeuronAccess.PublicOperation` (the edge validated the token); everything else `base.Access`.
- `Assign`: upsert the assignment with `Status = Starting`, `Failures = 0`; save with `BrainRuntimeChanged(Key)`; if session is `None` → `EnsureSessionAsync`; else push `AssignmentEvent` via `SessionStreams.TryPush(session, AssignmentEvent.Kind, await AssignmentFor(assignment))`.
- `Retire`: remove the assignment and its subscriptions; unwatch sources no other subscription uses; push `RetireEvent`; if `Behaviors.Length == 0` → `await runner.Stop(Brain)`, `Session = null`, unregister reminder.
- `Touch`: `if (Behaviors.Length > 0) await EnsureSessionAsync();`
- `EnsureSessionAsync`: `var id = Guid.NewGuid().ToString("N"); Save(Session = new(id, Starting, null, null)); await runner.Ensure(new(Brain, id, tokens.Issue(Brain, id), EdgeUrl()), ct); await reminders.RegisterOrUpdateReminder(GrainId, "reconcile", 1 min, 1 min);` where `EdgeUrl()` is `options.Value.EdgeUrl` or the listening address rewritten to `host.docker.internal` (move today's `ScriptRunEnvironment.EdgeUrl` here).
- `Authorize(session)`: `Active = Session is { Id: == session }` and status not `Refused`.
- `Connected(session, fingerprint)`: if `fingerprint != contracts.Fingerprint` → `Session = Session with { Status = Refused, Fingerprint = fingerprint }`, save, `runner.Stop`, log error; else `Status = Connected, LastHeartbeat = now`, save.
- `Heartbeat`: update `LastHeartbeat`, no signal.
- `Subscribed`: validate neuron id parses and is not this grain; find or add `Subscription(Guid id, behavior, neuron, signal, [], 0, 0)`; watch the source (one `_watched` entry per distinct neuron with renewal timer as in today's `RenewSourceWatches`); return id; push `SubscribedEvent`.
- `Acknowledge`: trim as today; save without signal if unchanged.
- `Reported`: update that behavior's `Status/ExitCode`; on `Status == "Exited"` with non-zero code or `Error != null`, `Failures + 1`; when `Failures >= MaximumFailures` set `Status = Disarmed` and push `RetireEvent` (the behavior stays assigned but not loaded); otherwise re-push its `AssignmentEvent` so the host reloads it. Save with `BrainRuntimeChanged`.
- `OnSignalAsync(signal)` → `this.AsReference<IBrainRuntimeArrivals>().Arrived(signal)`; `Arrived` appends to each matching subscription (`s.Neuron == signal.Publisher.Name && s.Signal == signal.GetType().Name`), saves, and pushes a `SignalBatchEvent(s.Id, s.Pending, s.Watermark)` per changed subscription.
- `PendingBatches(session)`: every subscription with `Pending.Length > 0` as `SignalBatchEvent` (the host asks on connect, so an unacknowledged batch is resent).
- `Assignments(session)`: every non-disarmed assignment as `AssignmentEvent` with fresh read URLs (`assemblies.ReadUrl(hash, TimeSpan.FromMinutes(10))`).
- `ReceiveReminder("reconcile")`: if `Behaviors.Length == 0` → unregister, return. If `Session is null` or `!await runner.Exists(Brain)` or `LastHeartbeat < now - 2 min` → `EnsureSessionAsync()` (new session id; the old token no longer authorizes).
- `BrainRuntimeActivation : IActivationHandler<BrainRuntimeNeuron>` → `ResumeWatches()` exactly like today's `CSharpFileActivation`.
- Signals: add `BrainRuntimeChanged(string RuntimeId)` under `Runtime/Signals/` beside `CSharpFileChanged`.
- `contracts.Fingerprint`: add to `ScriptContracts` a property computed once: `Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", _contracts.Values.Select(t => t.Assembly.GetName().Name + "=" + t.Assembly.ManifestModule.ModuleVersionId).Distinct().Order()))))`. The sandbox host computes the same over its baked assemblies (Task 10).

- [ ] **Step 1: Write the failing facts**

```csharp
public sealed class BrainRuntimeNeuronFacts
{
    [Fact]
    public async Task AssigningTheFirstBehaviorStartsASessionAndAnEmptySetStopsIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var runtime = brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain"));
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));

        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);

        var started = Assert.Single(host.Requests, FakeSessionHost.IsStart);
        Assert.Equal(SessionStatus.Starting, (await runtime.Inspect(ct)).Session);
        await edge.Retire("acc-brain/csharp/a");
        Assert.Contains(host.Requests, r => r.Path.EndsWith("/stop", StringComparison.Ordinal));
        Assert.Equal(SessionStatus.None, (await runtime.Inspect(ct)).Session);
    }

    [Fact]
    public async Task TouchWithNothingAssignedStartsNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Touch(ct);
        Assert.DoesNotContain(host.Requests, FakeSessionHost.IsStart);
    }

    [Fact]
    public async Task AMatchingFingerprintConnectsAndAMismatchRefuses()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));
        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);
        var session = (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).SessionId!;
        var fingerprint = brain.SiloServices.GetRequiredService<ScriptContracts>().Fingerprint;

        await edge.Connected(session, fingerprint);
        Assert.Equal(SessionStatus.Connected, (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).Session);

        await edge.Connected(session, "other");
        Assert.Equal(SessionStatus.Refused, (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).Session);
        Assert.False((await edge.Authorize(session)).Active);
    }

    [Fact]
    public async Task ASignalIsBufferedUntilAcknowledgedAndResentOnTheNextStream()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));
        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);
        var session = (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).SessionId!;
        var timer = brain.Get<DigitalBrain.Time.Timers.ITimer>("acc-brain/timers/tea");
        var subscription = await edge.Subscribed(session, "acc-brain/csharp/a", timer.GetGrainId().ToString(), nameof(DigitalBrain.Time.Timers.Signals.TimerTick));

        await timer.Tick(ct); // the Time module's test-visible way to publish one TimerTick; see CSharpSubscriptionFacts for the helper it uses today

        var pending = await Poll.UntilAsync(async () => (await edge.PendingBatches(session)).SingleOrDefault(b => b.Signals.Length == 1), ct);
        Assert.Equal(1, pending!.Watermark);
        Assert.Single(await edge.PendingBatches(session));   // not cleared by reading
        await edge.Acknowledge(session, subscription, 1);
        Assert.Empty(await edge.PendingBatches(session));
    }

    [Fact]
    public async Task AFailingBehaviorDisarmsAloneAfterFiveCrashes()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));
        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);
        await edge.Assign("acc-brain/csharp/b", "hash-b", new(), null, null);
        var session = (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).SessionId!;

        for (var i = 0; i < 5; i++) { await edge.Reported(session, new("acc-brain/csharp/a", "hash-a", "Exited", 1, "boom")); }

        Assert.Equal(CSharpFileStatus.Disarmed, (await edge.Describe("acc-brain/csharp/a"))!.Status);
        Assert.Equal(CSharpFileStatus.Starting, (await edge.Describe("acc-brain/csharp/b"))!.Status);
        Assert.Equal(SessionStatus.Starting, (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).Session);
        Assert.DoesNotContain(host.Requests, r => r.Path.EndsWith("/stop", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AReminderRelaunchesASessionTheHostLost()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));
        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);
        host.Sessions.Clear();

        await brain.Grains().GetGrain<IRemindable>(GrainId.Create("microsoft.csharp.runtime", BrainRuntimeKeys.For("acc-brain")))
            .ReceiveReminder("reconcile", new TickStatus(DateTime.UtcNow, TimeSpan.FromMinutes(1), DateTime.UtcNow));

        Assert.Equal(2, host.Requests.Count(FakeSessionHost.IsStart));
    }
}

internal static class RuntimeBrain
{
    public static Task<ModuleBrain> StartAsync(FakeSessionHost host, CancellationToken ct)
        => ModuleTest.Create().WithModule<CSharpModule>().WithModule<DigitalBrain.Time.TimeModule>().WithReminders()
            .ConfigureSilo(silo =>
            {
                silo.Services.AddHttpClient<SessionRunner>().ConfigurePrimaryHttpMessageHandler(() => host);
                silo.Services.AddSingleton<IBehaviorAssemblies>(new MemoryBehaviorAssemblies());
                silo.Services.PostConfigure<CSharpDeploymentSettings>(o => { o.EdgeUrl = "http://edge.test/"; o.SandboxUrl = FakeSessionHost.Url; });
            })
            .StartAsync(ct);
}
```

Use the same `IRemindable` invocation helper today's `CSharpFileNeuronFacts` uses for its reminder facts (LSP: look at `ReceiveReminder` callers in that file) and the same timer helper `CSharpSubscriptionFacts` uses to publish a `TimerTick`; `Poll.UntilAsync` is whatever that file already uses to wait for an observer callback. Copy, don't invent.

- [ ] **Step 2: Run to verify failure.** Expected: build error.

- [ ] **Step 3: Implement** the files listed in Interfaces, following the behavior list. Keep each method one screen; reuse today's `RenewSourceWatches`, `WatchSourcesAsync`, `UnwatchSourcesAsync` bodies from `CSharpFileNeuron` with `_watched` keyed by neuron id across all subscriptions. Register `SessionStreams` as a singleton and `BrainRuntimeActivation` as `IActivationHandler<BrainRuntimeNeuron>` in `CSharpModule`.

- [ ] **Step 4: Run the facts** (`--filter-method "*BrainRuntimeNeuronFacts*"`). Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "CSharp: IBrainRuntime owns a brain's behaviors, subscriptions and one session"`.

---

### Task 7: The behavior neuron becomes a record

**Files:**
- Modify: `Files/CSharpFileNeuron.cs`, `Files/CSharpFileState.cs`, `Files/CSharpAppBindingGuard.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Runtimes/CSharpAppRuntime.cs` (unchanged calls; verify it compiles)
- Test: rewrite `tests/.../CSharpFileNeuronFacts.cs`

**Interfaces:**
- Consumes: `IBrainRuntimeEdge.Assign/Retire/Describe`, `CSharpScriptCheck.Compile`, `IBehaviorAssemblies.Put`.

State:

```csharp
[GenerateSerializer, Alias("microsoft.csharp.file-state")]
internal sealed record CSharpFileState
{
    [Id(0)] public string Program { get; init; } = "";
    [Id(1)] public Dictionary<string, string> Settings { get; init; } = new(StringComparer.Ordinal);
    [Id(2)] public string? Hash { get; init; }
    [Id(3)] public bool Wanted { get; init; }
    [Id(4)] public CallerContext? Owner { get; init; }
    [Id(5)] public string? AppId { get; init; }
    [Id(6)] public string? AppBrain { get; init; }
}
```

- [ ] **Step 1: Write the failing facts** (replace the file):

```csharp
public sealed class CSharpFileNeuronFacts
{
    [Fact]
    public async Task StartCompilesStoresAndAssignsTheBehaviorToTheBrainRuntime()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var file = brain.Get<ICSharpFile>("acc-brain/csharp/report");
        await file.Write("Console.WriteLine(\"hi\");", ct);
        await file.Configure(new Dictionary<string, string> { ["TimerId"] = "tea" }, ct);

        var started = await file.Start(ct);

        Assert.Equal(CSharpFileStatus.Starting, started.Status);
        Assert.NotNull(started.Hash);
        var view = await brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain")).Describe("acc-brain/csharp/report");
        Assert.Equal(started.Hash, view!.Hash);
        Assert.Single(host.Requests, FakeSessionHost.IsStart);
    }

    [Fact]
    public async Task ASourceThatDoesNotCompileIsRefusedBeforeAnythingIsAssigned()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var file = brain.Get<ICSharpFile>("acc-brain/csharp/bad");
        await file.Write("int x = \"no\";", ct);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => file.Start(ct));
        Assert.Contains("CS0029", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(host.Requests, FakeSessionHost.IsStart);
    }

    [Fact]
    public async Task SwapReassignsWithANewHashAndDeleteRetires()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct);
        var file = brain.Get<ICSharpFile>("acc-brain/csharp/swap");
        await file.Write("Console.WriteLine(1);", ct);
        var first = await file.Start(ct);
        var second = await file.Swap("Console.WriteLine(2);", ct);
        Assert.NotEqual(first.Hash, second.Hash);
        await file.Delete(ct);
        Assert.Null(await brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain")).Describe("acc-brain/csharp/swap"));
        Assert.Equal("", (await file.Inspect(ct)).Source);
    }

    [Fact]
    public async Task CallersCannotBindAFileToAnInstalledApp()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartAsync(new FakeSessionHost(), ct);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => brain.Get<ICSharpAppBinding>("acc-brain/csharp/file").BindApp("arbitrary-app"));
    }
}
```

- [ ] **Step 2: Run to verify failure.** Expected: build errors from the old neuron against the new snapshot.

- [ ] **Step 3: Rewrite `CSharpFileNeuron`**

```csharp
[GrainType("microsoft.csharp.file")]
internal sealed partial class CSharpFileNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CSharpFileState> store,
    CSharpScriptCheck compiler, IBehaviorAssemblies assemblies, IGrainFactory grains)
    : Neuron<CSharpFileState>(store), ICSharpFile, ICSharpAppBinding
{
    internal const int MaximumSourceBytes = 128 * 1024;
    private const int MaximumSettings = 64;
    private string FileId => this.GetPrimaryKeyString();
    private IBrainRuntimeEdge Runtime => grains.GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For(BrainScope.CurrentId()));

    // RequireBoundAccess and BindApp as today, minus the run/subscription resets.

    public async Task<CSharpFileSnapshot> Inspect(CancellationToken ct = default) => Describe(await Runtime.Describe(FileId));
    public Task Write(string program, CancellationToken ct = default) { /* as today */ }
    public Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken ct = default) { /* as today */ }

    public Task<CSharpFileSnapshot> Start(CancellationToken ct = default) => AssignAsync(Snapshot.Program, ct);
    public Task<CSharpFileSnapshot> Swap(string source, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(source);
        if (Encoding.UTF8.GetByteCount(source) > MaximumSourceBytes) { throw new ArgumentException($"Source exceeds {MaximumSourceBytes} bytes.", nameof(source)); }
        return AssignAsync(source, ct);
    }

    private async Task<CSharpFileSnapshot> AssignAsync(string source, CancellationToken ct)
    {
        RequireSource(source);
        var compiled = compiler.Compile(new Dictionary<string, string> { [FileId] = source });
        if (!compiled.Success)
        { throw new InvalidOperationException("The behavior does not compile: " + string.Join("; ", compiled.Errors.Select(e => $"{e.Id} line {e.Line}: {e.Message}"))); }
        var behavior = compiled.Assemblies[FileId];
        await assemblies.Put(behavior, ct);
        var owner = CallerContextStamper.TryGet(out var caller) ? caller : null;
        await Save(Snapshot with { Program = source, Hash = behavior.Hash, Wanted = true, Owner = owner ?? Snapshot.Owner }, new CSharpFileChanged(FileId));
        await Runtime.Assign(FileId, behavior.Hash, Snapshot.Settings, Snapshot.Owner, Snapshot.AppId);
        return Describe(await Runtime.Describe(FileId));
    }

    public async Task<CSharpFileSnapshot> Stop(CancellationToken ct = default)
    {
        await Runtime.Retire(FileId);
        await Save(Snapshot with { Wanted = false }, new CSharpFileChanged(FileId));
        return Describe(null);
    }

    public async Task Delete(CancellationToken ct = default)
    {
        await Runtime.Retire(FileId);
        await Save(new CSharpFileState(), new CSharpFileChanged(FileId));
        DeactivateOnIdle();
    }

    public Task<string> ReadLogs(int tail = 200, CancellationToken ct = default) => Runtime.Logs(FileId, tail); // add `Task<string> Logs(string behavior, int tail)` to IBrainRuntimeEdge; it asks the host over the stream in Task 8 and returns "" until then.

    private CSharpFileSnapshot Describe(BehaviorView? view)
        => new(FileId, Snapshot.Program, Snapshot.Settings, Snapshot.Hash,
            view?.Status ?? CSharpFileStatus.Stopped, null, Snapshot.Wanted, view?.Failures ?? 0);
}
```

Delete `ICSharpFileEdge`, `ICSharpFileArrivals`, `CSharpFileActivation` and every reference LSP finds (`ScriptEdge`, module registration, tests). `CSharpAppBindingGuard` keeps guarding `Write/Configure/Start/Swap/Stop/Delete` by the app grain source.

- [ ] **Step 4: Build and run** the module tests `--filter-method "*CSharpFileNeuronFacts*"` and the Apps tests. Expected: PASS. Apps facts that used `FakeSandbox` or `RecordingCSharpFile` expectations about `Running` now expect `Starting`; update them.

- [ ] **Step 5: Commit** `git commit -m "CSharp: a behavior is a record; its run belongs to the brain runtime"`.

---

### Task 8: The runtime edge

**Files:**
- Create: `Edge/RuntimeEdge.cs`, `Edge/RuntimeEdgeEndpoints.cs`
- Modify: `CSharpModule.Configure(IEndpointRouteBuilder)` → `endpoints.MapRuntimeEdge()`
- Test: `tests/.../RuntimeEdgeFacts.cs` (uses `ModuleTest...WithHttpEdge()` and `brain.HttpClient`, as `ScriptEdgeFacts` does today)

**Interfaces:**
- Consumes: `SessionTokens.Validate`, `IBrainRuntimeEdge`, `ScriptContracts.Find`, `SessionStreams`.
- Produces: routes `POST /brains/{brainId}/runtime/v1/invoke`, `POST .../report`, `GET .../stream`. The brain group's membership filter must be bypassed for these routes because the caller is the session, not a member: map them on `endpoints.MapGroup("/brains/{brainId}/runtime/v1")` with the id validation filter only (`BrainRoutes.ValidateId` is internal to Framework; make it `public static` in `BrainRoutes` and add a `BrainRoutes.SessionGroup(endpoints, suffix)` that applies validation without the access filter, documented as "for edges that authenticate their own caller").

- [ ] **Step 1: Write the failing facts**

```csharp
public sealed class RuntimeEdgeFacts
{
    [Fact]
    public async Task AnExpiredTokenIsRefusedOnEveryRoute()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartAsync(new FakeSessionHost(), ct, http: true);
        foreach (var (method, path) in new[] { (HttpMethod.Post, RuntimeProtocol.Invoke), (HttpMethod.Post, RuntimeProtocol.Report), (HttpMethod.Get, RuntimeProtocol.Stream) })
        {
            using var request = new HttpRequestMessage(method, "/brains/acc-brain/" + path) { Content = JsonContent.Create(new { }) };
            request.Headers.Authorization = new("Bearer", "not.atoken");
            using var response = await brain.HttpClient.SendAsync(request, ct);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task ATokenForAnotherBrainIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await RuntimeBrain.StartAsync(new FakeSessionHost(), ct, http: true);
        var token = brain.SiloServices.GetRequiredService<SessionTokens>().Issue("other-brain", "s1");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/brains/acc-brain/" + RuntimeProtocol.Report) { Content = JsonContent.Create(new RuntimeReport(Heartbeat: true), options: RuntimeProtocol.Json) };
        request.Headers.Authorization = new("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await brain.HttpClient.SendAsync(request, ct)).StatusCode);
    }

    [Fact]
    public async Task AMismatchedContractsFingerprintIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct, http: true);
        var session = await Assigned(brain, ct);
        using var response = await Report(brain, session, new RuntimeReport(Fingerprint: "stale"), ct);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(SessionStatus.Refused, (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).Session);
    }

    [Fact]
    public async Task TheStreamSendsReadyThenAssignmentsAndInvokeReachesANeuron()
    {
        var ct = TestContext.Current.CancellationToken;
        var host = new FakeSessionHost();
        await using var brain = await RuntimeBrain.StartAsync(host, ct, http: true);
        var session = await Assigned(brain, ct);
        var fingerprint = brain.SiloServices.GetRequiredService<ScriptContracts>().Fingerprint;
        (await Report(brain, session, new RuntimeReport(Fingerprint: fingerprint), ct)).EnsureSuccessStatusCode();

        using var stream = await brain.HttpClient.SendAsync(Authorized(HttpMethod.Get, "/brains/acc-brain/" + RuntimeProtocol.Stream, session.Token), HttpCompletionOption.ResponseHeadersRead, ct);
        var events = SseParser.Create(await stream.Content.ReadAsStreamAsync(ct)).EnumerateAsync(ct).GetAsyncEnumerator(ct);
        Assert.True(await events.MoveNextAsync()); Assert.Equal(ReadyEvent.Kind, events.Current.EventType);
        Assert.True(await events.MoveNextAsync()); Assert.Equal(AssignmentEvent.Kind, events.Current.EventType);
        Assert.Contains("acc-brain/csharp/a", events.Current.Data, StringComparison.Ordinal);

        var invoke = new RuntimeInvocation("acc-brain/csharp/a", typeof(DigitalBrain.Time.Timers.ITimer).FullName!, "acc-brain/timers/tea", "Inspect", []);
        using var invoked = await brain.HttpClient.SendAsync(Authorized(HttpMethod.Post, "/brains/acc-brain/" + RuntimeProtocol.Invoke, session.Token, invoke), ct);
        Assert.Equal(HttpStatusCode.OK, invoked.StatusCode);
    }

    private static async Task<(string Id, string Token)> Assigned(ModuleBrain brain, CancellationToken ct)
    {
        var edge = brain.Grains().GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For("acc-brain"));
        await edge.Assign("acc-brain/csharp/a", "hash-a", new(), null, null);
        var id = (await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).SessionId!;
        return (id, brain.SiloServices.GetRequiredService<SessionTokens>().Issue("acc-brain", id));
    }
    private static HttpRequestMessage Authorized(HttpMethod method, string path, string token, object? body = null)
    { var r = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body, body.GetType(), options: RuntimeProtocol.Json) }; r.Headers.Authorization = new("Bearer", token); return r; }
    private static Task<HttpResponseMessage> Report(ModuleBrain brain, (string Id, string Token) session, RuntimeReport report, CancellationToken ct)
        => brain.HttpClient.SendAsync(Authorized(HttpMethod.Post, "/brains/acc-brain/" + RuntimeProtocol.Report, session.Token, report), ct);
}
```

Extend `RuntimeBrain.StartAsync` with `bool http = false` that adds `.WithHttpEdge()`.

- [ ] **Step 2: Run to verify failure.** Expected: build error.

- [ ] **Step 3: Implement**

`RuntimeEdge` (transient, DI):

```csharp
internal sealed class RuntimeEdge(SessionTokens tokens, ScriptContracts contracts, IGrainFactory grains, SessionStreams streams)
{
    public async Task<(SessionClaims Claims, IBrainRuntimeEdge Runtime)> AuthorizeAsync(string brainId, string? token)
    {
        var claims = tokens.Validate(token) ?? throw new UnauthorizedAccessException("The session token is missing, invalid or expired.");
        if (claims.Brain != brainId) { throw new UnauthorizedAccessException("The session token speaks for another brain."); }
        var runtime = grains.GetGrain<IBrainRuntimeEdge>(BrainRuntimeKeys.For(brainId));
        var authorization = await runtime.Authorize(claims.Session);
        return authorization.Active ? (claims, runtime) : throw new UnauthorizedAccessException("This session no longer speaks for its brain.");
    }

    // Reflection dispatch exactly as today's ScriptEdge.InvokeAsync, with the behavior's owner stamped as App.
    public async Task<JsonElement?> InvokeAsync(string brainId, string? token, RuntimeInvocation invocation, CancellationToken ct) { /* today's body; owner from runtime.Describe(invocation.Behavior) → assignment Owner/AppId; Stamp(owner with { Kind = CallerKind.App, StampedBy = TrustedEdge.AppProxy, AppId = appId ?? behavior }) */ }

    public async Task<IResult> ReportAsync(string brainId, string? token, RuntimeReport report, CancellationToken ct)
    {
        var (claims, runtime) = await AuthorizeAsync(brainId, token);
        if (report.Fingerprint is { } fingerprint)
        {
            await runtime.Connected(claims.Session, fingerprint);
            return fingerprint == contracts.Fingerprint ? Results.Ok() : Results.Conflict("The sandbox image's contracts differ from this brain's; rebuild the image from the same build.");
        }
        if (report.Subscribe is { } s) { return Results.Ok(new { subscription = await runtime.Subscribed(claims.Session, s.Behavior, grains.GetGrain(contracts.Find(s.Contract), s.Key).GetGrainId().ToString(), s.Signal) }); }
        if (report.Acknowledge is { } a) { await runtime.Acknowledge(claims.Session, a.Subscription, a.Watermark); return Results.Ok(); }
        if (report.Status is { } status) { await runtime.Reported(claims.Session, status); return Results.Ok(); }
        if (report.Heartbeat) { await runtime.Heartbeat(claims.Session); return Results.Ok(); }
        return Results.BadRequest("A report carries exactly one member.");
    }

    public async IAsyncEnumerable<SseItem<string>> StreamAsync(string brainId, string? token, [EnumeratorCancellation] CancellationToken ct)
    {
        var (claims, runtime) = await AuthorizeAsync(brainId, token);
        var channel = streams.Open(claims.Session);
        try
        {
            yield return new(JsonSerializer.Serialize(new ReadyEvent(claims.Session), RuntimeProtocol.Json), ReadyEvent.Kind);
            foreach (var assignment in await runtime.Assignments(claims.Session)) { yield return Item(AssignmentEvent.Kind, assignment); }
            foreach (var batch in await runtime.PendingBatches(claims.Session)) { yield return Item(SignalBatchEvent.Kind, batch); }
            await foreach (var (kind, payload) in channel.Reader.ReadAllAsync(ct)) { yield return Item(kind, payload); }
        }
        finally { streams.Close(claims.Session); }
    }

    private static SseItem<string> Item(string kind, object payload) => new(JsonSerializer.Serialize(payload, payload.GetType(), RuntimeProtocol.Json), kind);
}
```

`RuntimeEdgeEndpoints.MapRuntimeEdge` maps the three routes on `BrainRoutes.SessionGroup(endpoints, "/runtime/v1")` with today's `Refusal` mapping (`UnauthorizedAccessException` → 401, `ArgumentException`/`JsonException` → 400, capacity → 503 with header, else 422) and `.ExcludeFromDescription()`. The stream route returns `TypedResults.ServerSentEvents(edge.StreamAsync(brainId, Bearer(http), ct))`.

`SessionStreams`: `ConcurrentDictionary<string, Channel<(string, object)>>`; `Open` creates an unbounded channel (replacing any previous writer for that session, which it completes); `TryPush` writes if present; `Close` removes and completes.

Add `Task<string> Logs(string behavior, int tail)` to `IBrainRuntimeEdge`: push a `LogsRequestEvent(behavior, tail, requestId)` (add to the protocol with `Kind = "logs"`) and await a `TaskCompletionSource` the neuron keeps in a non-state dictionary, completed by a new `RuntimeReport.Logs = LogsReport(requestId, text)`; 10-second cap returning `""` when the host is not connected. Keep this in the neuron, not in state.

- [ ] **Step 4: Run the facts.** Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "CSharp: the runtime edge — invoke, report and one stream per session"`.

---

### Task 9: The client library speaks the session protocol

**Files:**
- Create: `src/DigitalBrain.Client/DigitalBrain.Client/Runtime/SessionConnection.cs`, `AmbientSession.cs`, `SessionSignalSubscription.cs`
- Modify: `DigitalBrainClient.cs`, `DigitalBrainConnection.cs`, `Edge/NeuronProxy.cs`
- Delete: `Edge/ScriptEdgeClient.cs`, `Edge/EdgeSignalSubscription.cs`, `Edge/ScriptSignalQuery.cs`, `Edge/V1/ScriptEdgeProtocol.cs`
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit/SessionConnectionFacts.cs`

**Interfaces:**
- Produces:
```csharp
// One per sandbox session; shared by every behavior in it.
public sealed class SessionConnection : IAsyncDisposable
{
    public static Task<SessionConnection> OpenAsync(Uri edge, string token, string fingerprint, CancellationToken ct);
    public Task<JsonElement?> InvokeAsync(string behavior, RuntimeInvocation invocation, CancellationToken ct);
    public Task<string> SubscribeAsync(SubscribeReport subscribe, CancellationToken ct);         // returns subscription id
    public Task AcknowledgeAsync(string subscription, long watermark, CancellationToken ct);
    public Task ReportStatusAsync(BehaviorStatusReport status, CancellationToken ct);
    public ChannelReader<SignalBatchEvent> Batches(string subscription);                         // per-subscription reader fed by the stream
    public IAsyncEnumerable<(string Kind, string Data)> Control { get; }                         // assign/retire/token/logs for the host
    public bool TryUpdateToken(string token);
}

// Set by the host around a behavior's entry point; read by DigitalBrainClient.ConnectAsync.
public static class AmbientSession
{
    public static IDisposable Enter(SessionConnection session, string behavior, IReadOnlyDictionary<string, string> settings);
}
```

`DigitalBrainClient.ConnectAsync(args)`: if `AmbientSession` is set, return a `DigitalBrainConnection` over it (settings from the ambient, no HTTP of its own); else today's env-var path is removed and it throws `InvalidOperationException("Behaviors run inside a brain's sandbox session.")`. `DigitalBrainConnection.On<T>` uses `SessionSignalSubscription<T>`: `SubscribeAsync`, then reads `Batches(id)`, yields each signal deserialized as `T`, and after the consumer has pulled every signal of a batch calls `AcknowledgeAsync(id, batch.Watermark)`. Reconnect is the stream's job: `SessionConnection` reopens the stream with backoff (1s, 2s, 4s, cap 30s) on drop and the brain resends pending batches on `ready`, so an unacknowledged batch is redelivered; a batch with `Watermark <= lastAcknowledged` for that subscription is skipped (dedup).

- [ ] **Step 1: Write the failing facts** against a fake brain `HttpMessageHandler` in the client unit tests (there is one for the old edge; look at `DigitalBrain.Client.Tests.Unit/Client` for the pattern and replace it): `InvokeGoesToTheInvokeRouteWithTheBehaviorId`, `OnSubscribesThenYieldsBatchSignalsThenAcknowledges`, `ReconnectResumesFromTheLastAcknowledgedWatermark` (the fake sends batch wm=2 twice across two stream connections; the consumer sees two signals once), `ConnectAsyncOutsideASessionThrows`.

- [ ] **Step 2: Run to verify failure.** Expected: build error.

- [ ] **Step 3: Implement.** `SessionConnection` keeps one `HttpClient` with the bearer token (updated on `TokenEvent`), a stream pump using `SseParser` dispatching by `EventType` (`signals` → per-subscription channel; everything else → `Control`), and a heartbeat loop posting `RuntimeReport(Heartbeat: true)` every 20 seconds. `NeuronProxy` takes the connection and behavior id and builds `RuntimeInvocation` instead of `ScriptInvocation`.

- [ ] **Step 4: Build and test** `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Client: behaviors share one session connection; On<T> is a multiplexed stream"`.

---

### Task 10: The sandbox host

**Files:**
- Rewrite `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/`: `Program.cs`, `SandboxOptions.cs`, `Sessions.cs`, `Session.cs`, `BehaviorLoader.cs`, `BehaviorRun.cs`, `SandboxEndpoints.cs`, csproj, single `Dockerfile`.
- Delete: `SandboxRuns.cs`, `DotNetScriptLauncher.cs`, `IScriptLauncher.cs`, `IdleShutdown.cs`, `RunLog.cs`, `SandboxContracts.cs`, `Dockerfile.production`, `Dockerfile.production.dockerignore`.
- Test: `tests/.../BehaviorLoaderFacts.cs`, `tests/.../SandboxSessionFacts.cs`

**Interfaces:**
- Consumes: `SessionConnection`, `AmbientSession`, `RuntimeProtocol` records.
- csproj now references `../../../../DigitalBrain.Client/DigitalBrain.Client/DigitalBrain.Client.csproj` (the host needs the protocol and connection) and keeps `InternalsVisibleTo` for the tests. Because the project is now inside the repo's `Directory.Build.props` build, delete the "takes no project references" comment.

```csharp
// Sessions.cs
internal sealed class Sessions(BehaviorLoader loader, IOptions<SandboxOptions> options, ILogger<Sessions> logger)
{
    public Task<Session> StartAsync(string identifier, SessionStart start, CancellationToken ct); // opens SessionConnection with options.Fingerprint, starts control loop
    public Session? Find(string identifier);
    public Task StopAsync(string identifier);
}

// Session.cs — one brain's connection and its loaded behaviors
internal sealed class Session(SessionConnection connection, BehaviorLoader loader, ILogger logger) : IAsyncDisposable
{
    public async Task RunAsync(CancellationToken ct)   // control loop: assign → Load; retire → Unload; token → TryUpdateToken; logs → report tail
    public IReadOnlyDictionary<string, BehaviorRun> Behaviors { get; }
}

// BehaviorLoader.cs — content-addressed cache under options.CacheRoot, collectible load contexts
internal sealed class BehaviorLoader(HttpClient downloads, IOptions<SandboxOptions> options)
{
    public async Task<BehaviorRun> LoadAsync(SessionConnection session, AssignmentEvent assignment, CancellationToken ct);
}

// BehaviorRun.cs — a loaded assembly running on its own task
internal sealed class BehaviorRun : IAsyncDisposable
{
    public string Id { get; } public string Hash { get; }
    public Task<int> Completion { get; }               // exit code: 0 on clean return, 1 on unhandled exception (reported with the message)
    public string Tail(int lines);                     // console output captured per behavior
    public ValueTask DisposeAsync();                   // cancels brain.Stopping, waits 10 s, unloads the context
}

// SandboxOptions.cs
internal sealed class SandboxOptions { public const string SectionName = "Sandbox"; public string CacheRoot { get; set; } = "/cache"; public int LogLines { get; set; } = 5000; }
```

Entry point execution: `assembly.EntryPoint!.Invoke(null, [Array.Empty<string>()])` inside `AmbientSession.Enter(session, id, settings)`; the returned `Task` (top-level `await` compiles to `Task Main`) is awaited on the run's task. Console capture: per-behavior `StringWriter` set via `AsyncLocal` in a `TextWriter` wrapper installed once with `Console.SetOut`, so `Console.WriteLine` inside a behavior lands in that behavior's ring buffer; lines also go to the host's `ILogger` with the behavior id as scope. Fingerprint: computed at startup over the assemblies in the host's base directory whose names are `DigitalBrain`, `DigitalBrain.Client` or end with `.Contracts`, using the same formula as `ScriptContracts.Fingerprint` (name + MVID, ordered, SHA-256). Put that formula in one place both can reference: `DigitalBrain.Client.Runtime.ContractsFingerprint.Of(IEnumerable<Assembly>)`.

Dockerfile (single, build context = repository root):

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:11.0.100-rc.1 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/DigitalBrain.Modules.Microsoft.CSharp.Sandbox.csproj -c Release -o /app \
    && for contracts in $(find src/DigitalBrain.Modules -name '*.Contracts.csproj'); do dotnet build "$contracts" -c Release -o /app || exit 1; done

FROM mcr.microsoft.com/dotnet/aspnet:11.0.0-rc.1
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080 DOTNET_NOLOGO=1
EXPOSE 8080
ENTRYPOINT ["dotnet", "DigitalBrain.Modules.Microsoft.CSharp.Sandbox.dll"]
```

Add a `.dockerignore` at the repository root excluding `**/bin`, `**/obj`, `.git`, `src/DigitalBrain.Modules/Google/Flutter/app` so the context is small.

- [ ] **Step 1: Write the failing facts.** `BehaviorLoaderFacts.ALoadedBehaviorRunsItsEntryPointAndUnloads` compiles `Console.WriteLine("ran");` with `CSharpScriptCheck`, serves it from an in-memory `HttpMessageHandler`, loads it through a `SessionConnection` opened against a fake brain handler, asserts `Tail` contains `ran` and `Completion` is `0`, disposes, and asserts the `AssemblyLoadContext` is collected (`WeakReference` loop with `GC.Collect` up to 10 times). `SandboxSessionFacts.AnAssignEventLoadsAndARetireEventUnloads` drives the control loop with a fake stream.

- [ ] **Step 2: Run to verify failure.** Expected: build error.

- [ ] **Step 3: Implement** per the interfaces. `SandboxEndpoints`: `GET /health`, `POST /sessions/{identifier}` (body `SessionStart`) → 202, `GET /sessions/{identifier}` → 200/404, `POST /sessions/{identifier}/stop` → 200/404.

- [ ] **Step 4: Build the image once** to prove the Dockerfile: `docker build -f src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile -t csharp-sandbox:dev .` Expected: success, image under 400 MB (`docker images csharp-sandbox:dev`).

- [ ] **Step 5: Run the facts.** Expected: PASS.

- [ ] **Step 6: Commit** `git commit -m "Sandbox: a runtime-only host that loads a brain's behaviors into one process"`.

---

### Task 11: Hosting, module wiring and deletions

**Files:**
- Modify: `CSharpModuleHosting.cs`, `CSharpModule.cs`, `CSharpOptions.cs`, the module csproj (drop the Aspire.Contracts reference), `AppHost.cs` (no change expected; verify).
- Delete every file in the plan's Deleted list that still exists.

- [ ] **Step 1: `CSharpModuleHosting`**

```csharp
public sealed class CSharpModuleHosting : ModuleHosting<CSharpModule>
{
    public override void Configure(DigitalBrainBuilder brain)
    {
        ArgumentNullException.ThrowIfNull(brain);
        var repository = RepositoryRoot.Find() ?? throw new InvalidOperationException("The sandbox image builds from the repository root.");
        var sandbox = brain.ApplicationBuilder.AddDockerfile("csharp-sandbox", repository,
                dockerfilePath: "src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile")
            .WithHttpEndpoint(targetPort: 8080, name: "http")
            .WithHttpHealthCheck("/health")
            .WithVolume("digitalbrain-csharp-cache", "/cache")
            .WithContainerRuntimeArgs("--add-host", "host.docker.internal:host-gateway")
            .WithParentRelationship(brain.Resource);
        brain.AddProjection(new SandboxUrlProjection(sandbox.GetEndpoint("http")));
    }

    private sealed class SandboxUrlProjection(EndpointReference endpoint) : DigitalBrainModuleProjection
    {
        public override void Apply<TResource>(IResourceBuilder<TResource> builder)
            => builder.WithEnvironment(DigitalBrainConfiguration.EnvironmentName(CSharpDeploymentSettings.SectionName, nameof(CSharpDeploymentSettings.SandboxUrl)), endpoint);
    }
}
```

Check the exact `AddDockerfile` overload with the Aspire docs (context7 / microsoft-learn: `AddDockerfile(name, contextPath, dockerfilePath)`), since the signature is what the AppHost compiles against. No `WithExplicitStart`, no bind mount, no `IAspire`.

- [ ] **Step 2: `CSharpModule`** registrations after this task:

```csharp
builder.AddIncomingGrainCallFilter<CSharpAppBindingGuard>();
builder.Services.AddOptions<CSharpOptions>().Configure<IConfiguration>((t, c) => c.PopulateModuleOptions("csharp", t));
builder.Services.AddOptions<CSharpDeploymentSettings>().BindConfiguration(CSharpDeploymentSettings.SectionName);
builder.Services.TryAddSingleton<CSharpCatalogStore>();
builder.Services.TryAddSingleton<CSharpToolService>();
builder.Services.TryAddSingleton<IScriptSandbox, CSharpScriptSandbox>();
builder.Services.TryAddSingleton(TimeProvider.System);
builder.Services.TryAddSingleton<SessionTokens>();
builder.Services.AddSingleton<IIntegrationStartup>(s => s.GetRequiredService<SessionTokens>());
builder.Services.TryAddSingleton<IBehaviorAssemblies, BlobBehaviorAssemblies>();
builder.Services.TryAddSingleton<SessionStreams>();
builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IActivationHandler<BrainRuntimeNeuron>, BrainRuntimeActivation>());
builder.Services.TryAddSingleton(p => new ScriptContracts(p.GetRequiredService<ContractCatalog>()));
builder.Services.TryAddSingleton<IContractVocabulary>(p => new ContractVocabulary(p.GetRequiredService<ContractCatalog>()));
builder.Services.TryAddTransient<RuntimeEdge>();
builder.Services.TryAddSingleton<CSharpContractDiscovery>();
builder.Services.TryAddSingleton<CSharpScriptCheck>();
if (!string.IsNullOrWhiteSpace(builder.Configuration[CSharpDeploymentSettings.SectionName + ":SessionPoolEndpoint"]))
{ builder.Services.TryAddSingleton<TokenCredential>(_ => new DefaultAzureCredential()); }
builder.Services.AddHttpClient<SessionRunner>();
if (authoring) { builder.Services.TryAddScoped(p => p.GetRequiredService<CSharpToolService>().ForScope(BrainScope.CurrentId())); }
```

`CSharpOptions`: `Authoring`, `MaximumPending`, `Validate` only. `CSharpDeploymentSettings`: `EdgeUrl`, `SessionPoolEndpoint`, `SandboxUrl`. `CSharpContractDiscovery`: drop `CSharpDirectives`, `Directive`, and the `#:project` lines in `Example` (keep the rest of the example). Update `CSharpScriptSandbox.AuthoringDescription` to the same example without directives.

- [ ] **Step 3: Delete** every file in the Deleted list. For each, run LSP `findReferences` on its public types first; fix the referencing site (tests, `AppsModule`, `AspireModule` if it referenced `CSharpSandbox`), then delete. Remove `<ProjectReference ... Aspire.Contracts.csproj />` from the module csproj and the Sandbox project reference from the tests csproj (replace with the Client project reference). Delete `CSharpFileContainerFacts.cs` in `DigitalBrain.OS.Tests.E2E` and replace it in Task 15.

- [ ] **Step 4: Build every touched project** and run `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`, the Apps tests, `src/Testing/DigitalBrain.Architecture.Tests` and `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`. Expected: all PASS, zero warnings.

- [ ] **Step 5: Commit** `git commit -m "CSharp: always-on sandbox container, one runner, old per-run sandbox deleted"`.

---

### Task 12: Sign-in touches the brain runtime

**Files:**
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Identity/IdentityEndpoints.cs:106-116` (`SignInAsync`)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/ISignInHandler.cs`
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/RuntimeSignIn.cs`
- Test: `tests/.../RuntimeSignInFacts.cs`

Platform must not reference the CSharp module, so sign-in publishes through a Framework seam:

```csharp
// Framework/Runtime/ISignInHandler.cs
public interface ISignInHandler { Task SignedIn(string accountId, IReadOnlyList<string> brainIds, CancellationToken cancellationToken); }
```

`IdentityEndpoints.SignInAsync`, after `http.SignInAsync(...)`, resolves `IEnumerable<ISignInHandler>` and awaits each with the member's account id and brain ids (the member record already lists them; LSP `goToDefinition` on `Member`). A handler failure is logged, never fails sign-in.

```csharp
// CSharp/Runtime/RuntimeSignIn.cs
internal sealed class RuntimeSignIn(IGrainFactory grains) : ISignInHandler
{
    public async Task SignedIn(string accountId, IReadOnlyList<string> brainIds, CancellationToken ct)
    {
        foreach (var brain in brainIds) { await grains.GetGrain<IBrainRuntime>(BrainRuntimeKeys.For(BrainScope.Create(accountId, brain).Id)).Touch(ct); }
    }
}
```

Register `TryAddEnumerable(ServiceDescriptor.Singleton<ISignInHandler, RuntimeSignIn>())` in `CSharpModule`.

- [ ] **Step 1: Write the failing fact** `SignInTouchesEveryBrainRuntimeOfTheAccount`: assign one behavior in `acc-brain`, clear `host.Sessions` and `host.Requests`, call `brain.SiloServices.GetRequiredService<ISignInHandler>().SignedIn("acc", ["brain"], ct)` and assert one new start request. A second fact asserts an account whose brains have no behaviors produces no request.

- [ ] **Step 2–4:** fail, implement, pass. Also run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit` (or the identity tests project LSP finds for `IdentityEndpoints`).

- [ ] **Step 5: Commit** `git commit -m "Sign-in touches each brain's runtime so armed behaviors are alive before the first window"`.

---

### Task 13: Shipped apps, prompts and readiness

**Files:**
- Modify: every `synapses/*.cs` under `src/IntoChat/Apps`, `src/DigitalBrain.OS/Apps`, and `src/DigitalBrain.Modules/Microsoft/CSharp/Samples/*.cs` — delete lines starting with `#:project`.
- Modify: `AgentPrompts.cs:40`, `BuilderTools.cs:19` — read_contracts description no longer mentions a directive; `CheckCSharp` description says "compiles and stores".
- Modify: `ShippedAppPublisher.cs` — no change in code; verify by fact that it no longer waits.
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ReadinessFacts.cs` (new) and the Apps `ShippedAppPublisherFacts`.

- [ ] **Step 1: Write the failing fact** `ReadinessDoesNotDependOnTheSandbox` in OS unit tests: compose the OS host the way `BrandingFacts` does, with `CSharpDeploymentSettings.SandboxUrl` pointing at a port nothing listens on, start it, and assert `GET /health` returns 200 within the harness's normal budget with every shipped app published (`os/settings`, `os/assistant`, `os/datavisualizer` readable through `IApp.Read` with a non-empty manifest). Then assert the brain runtime for the `os` publisher brain reports `SessionStatus.Starting` (it tried, the host is absent, readiness did not care).

- [ ] **Step 2: Run to verify failure.** Expected: today it fails because `Start` on a file waits for the sandbox. After Tasks 7 and 11 the assignment is recorded and `runner.Ensure` throws `HttpRequestException`; make `EnsureSessionAsync` catch `HttpRequestException`, keep `Session.Status = Starting`, log a warning, and leave the reminder to retry. Add that catch now.

- [ ] **Step 3: Strip the directives** with one command and then verify by text search that nothing matches `^#:project` under `src` outside `bin/obj`:

```bash
grep -rl "^#:project" src --include=*.cs | grep -v "/bin/\|/obj/" | xargs sed -i '/^#:project/d'
```

Edit the two prompt strings by hand.

- [ ] **Step 4: Run** OS unit tests, Apps tests, `ShippedAppPublisherFacts`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "Apps: behaviors are plain C#; OS readiness no longer waits on the sandbox"`.

---

### Task 14: Azure deployment and CI

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/CSharpDeployment.cs`
- Modify: `.github/workflows/deploy.yml`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/...Deployment` facts if a deployment test project exists (LSP: find references to `CSharpDeployment`); otherwise the hosting facts in `DigitalBrain.Aspire.Testing`.

- [ ] **Step 1: `CSharpDeployment` changes**
  - Remove the `Sandbox__IdleShutdown` env var.
  - `ScaleConfiguration`: `MaxConcurrentSessions = context.Settings.GetInt("sandboxSessions") ?? 100`, `ReadySessionInstances = 2`.
  - `LifecycleConfiguration`: keep `OnContainerExit`, `MaxAlivePeriodInSeconds = 86400` (the reminder relaunches after the daily recycle; the host exits cleanly at the cap by itself when it receives SIGTERM from the pool).
  - Keep `EdgeUrl`, `SessionPoolEndpoint` and the `RunTokenKey` secret.
  - Comment at the top: "one Hyper-V session per brain".

- [ ] **Step 2: `deploy.yml`**
  - Fix the OS publish path to `src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`.
  - Add a step after it:

```yaml
      - name: Publish sandbox image
        run: |
          docker build -f src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile \
            -t ${{ vars.DOCKERHUB_USERNAME }}/digitalbrain-csharp-sandbox:${{ github.event.release.tag_name }} \
            -t ${{ vars.DOCKERHUB_USERNAME }}/digitalbrain-csharp-sandbox:latest .
          docker push --all-tags ${{ vars.DOCKERHUB_USERNAME }}/digitalbrain-csharp-sandbox
```

  - Pass `sandboxImage` into the Pulumi step as `${{ vars.DOCKERHUB_USERNAME }}/digitalbrain-csharp-sandbox:${{ github.event.release.tag_name }}` wherever the workflow sets Pulumi config (read the existing step that sets `sessionExecutorRoleId`).

- [ ] **Step 3: Build** the Deployment project: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Deployment/DigitalBrain.Modules.Microsoft.CSharp.Deployment.csproj`. Expected: clean. Run the CSharp hosting facts (`DigitalBrain.Modules.Microsoft.CSharp.Tests` composition facts) and `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit`.

- [ ] **Step 4: Commit** `git commit -m "CSharp deployment: one session per brain, no idle shutdown; CI builds the sandbox image"`.

---

### Task 15: Verification loop and E2E

**Files:**
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs` (replaces `CSharpFileContainerFacts.cs`)

- [ ] **Step 1: Wipe local storage and run**

```bash
docker volume rm digitalbrain-azurite 2>/dev/null; cd src/DigitalBrain.AppHost && aspire run
```

(Use the Azurite volume name the AppHost declares; `docker volume ls | grep azurite` shows it.) Then `mcp__aspire__list_resources`: `csharp-sandbox` Running and Healthy, `OperatingSystem` Healthy, and the OS reports healthy well under the old 4.5 minutes; record the time from the OS console logs.

- [ ] **Step 2: Drive it through `digitalbrain-mcp`**
  - `neurons_context` as the intochat brain.
  - `neurons_get` on `{scope}/runtime`: `Session = Connected`, `Fingerprint` non-null, `Behaviors` lists the shipped apps' synapses with `Status = Running`.
  - In the shell (or via `neurons_call` on the button neuron), click the CustomerResearcher research button; `neurons_get` on the runtime shows the matching subscription's `Delivered` incremented and `Pending = 0`.
  - `neurons_call` `ICSharpFile.ReadLogs` on one synapse returns console output.
  - Kill the container (`docker kill` the csharp-sandbox container): within two minutes `neurons_get` shows a new `SessionId` and `Connected` again, without any manual action.

- [ ] **Step 3: Telemetry**
  `list_traces`: one trace per click spanning `ButtonClicked` → `BrainRuntimeNeuron.Arrived` → stream push → `runtime/v1/invoke` → the app's `Invoke`. `list_structured_logs` for the sandbox resource shows one "Loaded behavior {Id} {Hash}" per synapse and no compile lines.

- [ ] **Step 4: Write the E2E fact** `BrainRuntimeFacts.AClickReachesABehaviorAndBack` using `DigitalBrain.Testing.E2E`'s `BrainFact` base: install the WordCount app, call its operation through `IApp.Invoke`, assert the response arrives, and assert the brain runtime's snapshot shows `Connected`. Keep the harness's existing stack budget.

- [ ] **Step 5: Regression net**

```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
```

Expected: all PASS.

- [ ] **Step 6: Commit** `git commit -m "OS E2E: a click reaches a behavior through the brain runtime"` and update `CLAUDE.md`'s Behavior row ("C# compiled by the brain, loaded into the brain's sandbox session") and the CSharp `README.md` in the same commit.
