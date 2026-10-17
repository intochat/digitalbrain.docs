# E2E Harness: One Configuration Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fact configures the hosted product through the AppHost's configuration only; telemetry, environment name and keepalive noise stop being hand-wired per test, and the three Framework E2E facts that still fail (ContentCapture ×2, TraceBudget idle) pass for the right reasons.

**Architecture:** Today a fact reaches the running OS through five channels (typed module options → AppHost args; raw AppHost keys → args; a private JSON secrets file; raw environment variables written onto the silo resource after Aspire's own callbacks; harness-implicit env). The raw-env channel is deleted. Environment name becomes a hosting option the hosting ring projects; telemetry uses Aspire's own OTLP injection pointed at the test collector through an AppHost key; keepalive traffic (session heartbeats, watch renewals, Activated catch-up) stops producing spans; fixtures replace per-fact boots; an architecture ratchet forbids raw env/config names in test code so none of this comes back.

**Tech Stack:** .NET 11 RC, Aspire (`DistributedApplicationTestingBuilder`), Orleans, OpenTelemetry SDK, xunit v3 (`[assembly: AssemblyFixture]`), the repo's `DigitalBrain.Testing.E2E` / `DigitalBrain.Testing.Reference` harness.

**Spec:** This plan is its own spec; the investigation that produced it is summarized in `C:\Users\vhorb\.claude\projects\E--intochat-digitalbrain\memory\failing-suites-2026-10-07.md` and in the two commits `eb802f2f6` (test layout) and `aa14fbac5` (owner provisioning) on `framework-cleanup`.

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- Warnings are errors, nullable on, no `/// <summary>` boilerplate, sentence-shaped fact names, `TestContext.Current.CancellationToken`.
- Kill any test run over 5 minutes (except fixture-booting E2E suites, allow 15) and debug the hang; never raise a timeout or add polling to make a check pass.
- Commit explicit files only (`git add <file> ...`), never by directory: the tree may hold another session's uncommitted work. End commit messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- LSP (`csharp-ls`) for definitions/references before changing a symbol; diagnostics clean before building.
- Do not touch `src/DigitalBrain.Modules/DigitalBrain/Apps/**`, `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs` outside Task 7, or any Dart file: another session owns in-flight edits there. If `DigitalBrain.Modules.Apps` does not compile at HEAD, work in a worktree branched from `aa14fbac5` (`superpowers:using-git-worktrees`).
- Architecture facts must stay green after every task: `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`. The known pre-existing failure `PersistedStateFacts` (`AiMessage.Content` is an `IReadOnlyList`) is out of scope; every other fact must pass.

## Review Focus

1. A Production-flagged host exporting nothing: Task 2's fact asserts spans arrive from a `Production` boot; if it does not, Task 2 step 6 bisects before anything else proceeds.
2. Aspire's default gRPC endpoint overriding the HTTP collector: Task 1 pins the protocol the silo actually receives.
3. A keepalive filter that also hides a real failure: Task 6 drops only the four named keepalive spans and the report route; `collector.Errors()` stays asserted empty in every budget fact.
4. Catch-up installs skipped forever after a failed first attempt: Task 7 keeps the per-publish re-install path and marks a brain handled only after `InstallAsync` returns.
5. A raw env name sneaking back through `Path.Combine`-style concatenation or a `DigitalBrainConfiguration.EnvironmentName(...)` call in a fact: Task 4's regex covers both literal forms, and `EnvironmentName(` is forbidden in test code outside `src/Testing`.

---

### Task 1: Telemetry rides Aspire's OTLP injection, pointed at the collector by one AppHost key

**Files:**
- Create: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/TelemetryProjectionFacts.cs`
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Host/ApplicationE2ETestBuilder.cs` (add `ExportingTelemetryTo`)
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Diagnostics/TestTelemetryCollector.cs` (ignore the `dotnet-cli` scope)

**Interfaces:**
- Produces: `E2ETestBuilder<TAppHost>.ExportingTelemetryTo(TestTelemetryCollector collector)` → sets AppHost configuration `ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL=<collector.Endpoint>` and `ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL=` (empty) through `WithHostConfiguration`. Nothing is written to resource environment.
- Produces: `TestTelemetryCollector` drops spans whose scope is `dotnet-cli` (the `dotnet` launcher's own CLI telemetry, which inherits the resource environment).

Background, verified on 2026-10-08: with `DistributedApplicationTestingBuilder`, Aspire injects `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_OTLP_HEADERS=x-otlp-api-key=…`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, batch delays and `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` into the `OperatingSystem` project whether or not the dashboard is disabled. `ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL` passed as an AppHost argument steers the endpoint (gRPC). With both keys set, gRPC wins. The collector (`TestTelemetryCollector`, an `HttpListener`) speaks OTLP/HTTP protobuf only. Unverified: whether an explicitly empty gRPC key makes Aspire fall back to the HTTP key.

- [ ] **Step 1: Write the failing hosting fact (this is the probe, kept as a permanent fact)**

```csharp
extern alias AppHost;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;

namespace DigitalBrain.OS.Tests.Unit;

// Telemetry is Aspire's: the AppHost's dashboard OTLP setting is what every project resource
// exports to. A test collector plugs in there, never by writing OTEL_* onto a resource.
public sealed class TelemetryProjectionFacts
{
    [Fact]
    public async Task TheOsExportsOverHttpProtobufToTheAppHostsHttpOtlpEndpoint()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var appHost = await DistributedApplicationTestingBuilder.CreateAsync<AppHost::Projects.DigitalBrain_AppHost>(
            ["Parameters:Modules-digitalbrain-master-key=synthetic-composition-test-key-32chars",
             "ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL=http://127.0.0.1:4999",
             "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL="], ct);
        var runtime = appHost.Resources.Single(resource => resource.Name == "OperatingSystem");
        var environment = new Dictionary<string, object>();
        var context = new EnvironmentCallbackContext(appHost.ExecutionContext, runtime, environment, ct);
        foreach (var callback in runtime.Annotations.OfType<EnvironmentCallbackAnnotation>()) { await callback.Callback(context); }
        Assert.Equal("http/protobuf", environment["OTEL_EXPORTER_OTLP_PROTOCOL"]?.ToString());
        Assert.Contains("127.0.0.1:4999", environment["OTEL_EXPORTER_OTLP_ENDPOINT"]?.ToString());
        Assert.True(environment.ContainsKey("OTEL_EXPORTER_OTLP_HEADERS"));
    }
}
```

- [ ] **Step 2: Run it**

Run: `dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj && dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-class "*TelemetryProjectionFacts"`

Expected: either PASS (Aspire honors the empty gRPC key) or FAIL with protocol `grpc` and endpoint `localhost:4317`.

- [ ] **Step 3a (PASS):** keep the fact as written; continue to step 4.

- [ ] **Step 3b (FAIL):** Aspire does not yield to the HTTP key. Make the hosting ring decide the protocol instead, still from AppHost configuration: in `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs` inside `WithReference<TResource>(…, DigitalBrainBuilder brain)` (the method that ends with `foreach (var pair in brain.Settings) { builder.WithEnvironment(…) }`), add after that loop:

```csharp
        // Aspire's OTLP injection prefers gRPC; a host that names only an HTTP collector gets http/protobuf.
        var configuration = builder.ApplicationBuilder.Configuration;
        if (string.IsNullOrEmpty(configuration["ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL"])
            && configuration["ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL"] is { Length: > 0 } http)
        {
            builder.WithEnvironment("OTEL_EXPORTER_OTLP_ENDPOINT", http);
            builder.WithEnvironment("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf");
        }
```

Re-run step 2; expected PASS. (This is composition code, applied once for every silo host, ordered after Aspire's callback because it is added later; it is not the harness writing env.)

- [ ] **Step 4: Add `ExportingTelemetryTo` to the builder**

In `ApplicationE2ETestBuilder.cs`, next to `WithHostConfiguration`:

```csharp
    // The collector plugs into the AppHost's own OTLP setting; Aspire projects it to every resource.
    public E2ETestBuilder<TAppHost> ExportingTelemetryTo(TestTelemetryCollector collector)
    {
        ArgumentNullException.ThrowIfNull(collector);
        return WithHostConfiguration("ASPIRE_DASHBOARD_OTLP_HTTP_ENDPOINT_URL", collector.Endpoint.AbsoluteUri)
            .WithHostConfiguration("ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL", "");
    }
```

- [ ] **Step 5: Collector ignores the launcher's spans**

In `TestTelemetryCollector.cs`, where parsed spans are appended to the snapshot list, skip any `CapturedSpan` whose `Scope == "dotnet-cli"`. Add a comment: `// The dotnet launcher inherits the resource environment and reports its own CLI telemetry; it is not the host.`

- [ ] **Step 6: Build harness and OS unit tests, run the OS unit suite**

Run: `dotnet build src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj && dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/TelemetryProjectionFacts.cs src/Testing/DigitalBrain.Testing.E2E/Host/ApplicationE2ETestBuilder.cs src/Testing/DigitalBrain.Testing.E2E/Diagnostics/TestTelemetryCollector.cs
# plus DigitalBrainHostingExtensions.cs if step 3b ran
git commit -m "E2E: telemetry rides Aspire's OTLP injection, pointed at the collector by one AppHost key"
```

---

### Task 2: Environment name is a hosting option; a Production boot exports

**Files:**
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs`
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs` (`WithReference<TResource>(…, DigitalBrainBuilder)`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/ModuleOptionOverlayFacts.cs` (sibling fact; or a new `HostEnvironmentFacts.cs`)
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Host/ApplicationE2ETestBuilder.cs` (add `InEnvironment`)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/ProductionExportFacts.cs`

**Interfaces:**
- Produces: `DigitalBrainHostingOptions.Environment` (`string?`, default null = leave the resource's default), key `DigitalBrain:Hosting:Environment` (`EnvironmentKey` const beside `PersistentStorageKey`).
- Produces: `E2ETestBuilder<TAppHost>.InEnvironment(string environmentName)` → `WithHostConfiguration(DigitalBrainHostingOptions.EnvironmentKey, environmentName)`.
- Projection: when the option is set, every silo host gets `ASPNETCORE_ENVIRONMENT` and `DOTNET_ENVIRONMENT` equal to it.

- [ ] **Step 1: Failing hosting fact**

```csharp
    [Fact]
    public async Task TheHostingEnvironmentNamesTheSiloProcessEnvironment()
    {
        var builder = DistributedApplication.CreateBuilder(new DistributedApplicationOptions { Args = [], DisableDashboard = true });
        builder.Configuration[DigitalBrainHostingOptions.EnvironmentKey] = "Production";
        var brain = builder.AddDigitalBrain("modules", new DigitalBrainHostingOptions { PersistentStorage = false });
        var silo = builder.AddProject<Projects.DigitalBrain_OS>("silo").WithReference(brain);
        var environment = new Dictionary<string, object>();
        var context = new EnvironmentCallbackContext(builder.ExecutionContext, silo.Resource, environment, TestContext.Current.CancellationToken);
        foreach (var callback in silo.Resource.Annotations.OfType<EnvironmentCallbackAnnotation>()) { await callback.Callback(context); }
        Assert.Equal("Production", environment["ASPNETCORE_ENVIRONMENT"]);
        Assert.Equal("Production", environment["DOTNET_ENVIRONMENT"]);
    }
```

If `Projects.DigitalBrain_OS` is not referenced by this test project, use whatever project resource the neighbouring facts in `DeploymentIdentityFacts.cs` build (read that file; copy its resource setup).

- [ ] **Step 2: Run, expect FAIL** (`EnvironmentKey` undefined).

- [ ] **Step 3: Implement**

`DigitalBrainHostingOptions.cs`:
```csharp
    public const string EnvironmentKey = "DigitalBrain:Hosting:Environment";
    // Development or Production for every silo host; null leaves each resource's own default.
    public string? Environment { get; init; }
```

In `AddDigitalBrain` (where `PersistentStorageKey` is read from configuration into the options), read `EnvironmentKey` the same way so configuration overrides the code value. Expose it on `DigitalBrainBuilder` as `public string? Environment { get; }`.

In `WithReference<TResource>(…, DigitalBrainBuilder brain)`, after `brain.Identity?.Apply(builder);`:
```csharp
        if (brain.Environment is { Length: > 0 } environment)
        {
            builder.WithEnvironment("ASPNETCORE_ENVIRONMENT", environment);
            builder.WithEnvironment("DOTNET_ENVIRONMENT", environment);
        }
```

Builder:
```csharp
    public E2ETestBuilder<TAppHost> InEnvironment(string environmentName)
        => WithHostConfiguration(DigitalBrainHostingOptions.EnvironmentKey, environmentName);
```

- [ ] **Step 4: Run the hosting fact, expect PASS.** `dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit`

- [ ] **Step 5: Failing E2E fact: a Production boot exports Orleans spans**

```csharp
using DigitalBrain.Testing.E2E;
using DigitalBrain.Testing.E2E.Diagnostics;
using static DigitalBrain.Testing.E2E.Diagnostics.TraceAssertions;

namespace DigitalBrain.Framework.Tests.E2E;

// A Production host must export like a Development one: the capture facts run Production to
// catch environment gates, and the gate they found on 2026-10-07 was in the exporter itself.
public sealed class ProductionExportFacts(ProductionBrainFixture host)
{
    [Fact(Timeout = 300_000)]
    public async Task AProductionHostExportsGrainCallSpans()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await host.LeaseAsync(ct);
        using var response = await brain.HttpClient.GetAsync("/ai/models", ct);
        Assert.True(response.IsSuccessStatusCode);
        await WaitForAsync(() => host.Collector.Snapshot().Any(span => span.Scope == "Microsoft.Orleans.Application"), ct);
    }
}
```

`ProductionBrainFixture` is created in Task 8; until then, declare it in this task as the minimal subclass so the fact compiles:

`src/Testing/DigitalBrain.Testing.Reference/ProductionBrainFixture.cs`:
```csharp
namespace DigitalBrain.Testing.E2E;

// The reference brain flagged Production. Environment gates hide here, not in Development.
public class ProductionBrainFixture : ReferenceBrainFixture
{
    protected override Task<E2EBrain> StartBrainAsync(CancellationToken cancellationToken)
        => ReferenceBrain.Create()
            .ConfigureModule<AI.AIModule, AI.AIOptions>(ai => ai.WithModelEndpoint(AI.Models.AiProvider.OpenAI, Model.Endpoint))
            .ConfigureModule<Flutter.FlutterModule, Flutter.FlutterModuleOptions>(flutter => flutter.BackendOnly())
            .InEnvironment("Production")
            .ExportingTelemetryTo(Collector)
            .StartAsync(cancellationToken);
}
```
Register it: in `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/AssemblyInfo.cs` add `[assembly: Xunit.AssemblyFixture(typeof(DigitalBrain.Testing.E2E.ProductionBrainFixture))]`.

Also switch `ReferenceBrainFixture.StartBrainAsync` from `.WithResourceEnvironment(new Dictionary … OTEL_*)` to `.ExportingTelemetryTo(Collector)` (Task 1's method), keeping everything else.

- [ ] **Step 6: Run the E2E fact**

Run: `dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/DigitalBrain.Framework.Tests.E2E.csproj && dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E --no-build -- --filter-class "*ProductionExportFacts"`

Expected PASS. If it FAILS with no Orleans spans: the Production gate is real and is now reproducible in one fact. Bisect in this order, re-running the fact each time, editing only `ProductionBrainFixture`: (a) replace `InEnvironment("Production")` with `InEnvironment("Development")` — if it passes, the gate is environment-keyed inside the OS or ServiceDefaults; search `src/DigitalBrain.Aspire/DigitalBrain.ServiceDefaults/ServiceDefaultsExtensions.cs` and `src/DigitalBrain.OS/DigitalBrain.OS/Program.cs` for `IsDevelopment`, `IsProduction`, `EnvironmentName` and for `appsettings.Production.json` under `src/DigitalBrain.OS/DigitalBrain.OS`; fix the gate so export depends only on the OTLP endpoint being configured, and add a `Review Focus`-style assertion to this fact's comment naming the gate. (b) If Development also fails, Task 1's endpoint projection is wrong for a real boot: dump `environment` from the Task 1 fact and compare with what `TestTelemetryCollector` listens on (scheme, host, port, path `/v1/traces`).

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingOptions.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/<fact file> src/Testing/DigitalBrain.Testing.E2E/Host/ApplicationE2ETestBuilder.cs src/Testing/DigitalBrain.Testing.Reference/ProductionBrainFixture.cs src/Testing/DigitalBrain.Testing.Reference/ReferenceBrainFixture.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/ProductionExportFacts.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/AssemblyInfo.cs
git commit -m "Hosting: the environment name is a hosting option; a Production reference brain exports"
```

---

### Task 3: Delete the raw-environment channel

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing/TestExecutionOptions.cs` (remove `ResourceEnvironment`)
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Host/ApplicationE2ETestBuilder.cs` (remove `WithResourceEnvironment`)
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Hosted/AspireTestSession.cs` (remove the `ResourceEnvironment` callback block; keep the private-settings and quiet-logging blocks)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ProductHostFixture.cs` (replace the `WithResourceEnvironment` block: OTLP pair → `.ExportingTelemetryTo(Collector)`; the shipped-apps key it also sets → `.WithHostConfiguration(<the same key>, <value>)`, since `DigitalBrainBuilder.Settings` projects AppHost keys under `DigitalBrain:` to the silo)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/TraceBudgetFacts.cs` and `ContentCaptureFacts.cs` only as far as they must compile (they are rewritten in Task 8; here replace `WithResourceEnvironment(OtlpEnvironment(collector))` with `ExportingTelemetryTo(collector)` and delete `OtlpEnvironment`/`OtlpEndpointKey`; in ContentCapture, `CaptureTest.CreateAsync` becomes: `ReferenceBrain.Create().ConfigureModule<AIModule, AIOptions>(ai => { ai.WithModelEndpoint(…); ai.Telemetry.EnableSensitiveData = enabled; }).InEnvironment("Production").ExportingTelemetryTo(collector)` and the `environment` dictionary parameter is removed).

Notes: `IntoChat__Profile` has no reader anywhere in `src` (checked 2026-10-08) — drop it. `DigitalBrain:Testing:Enabled` is only consulted by `ModuleSettingsValidation` to allow `DigitalBrain:Testing:*` keys; nothing in these facts sets such keys — drop it. `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` is already injected by Aspire (Task 1 background), so the "ambient SDK setting cannot override the module setting" case is exercised by every boot — drop the explicit line and say so in the capture fact's comment.

- [ ] **Step 1: Remove the API and the callback; fix every compile error by converting callers as listed above.**
- [ ] **Step 2: Build** `src/Testing/DigitalBrain.Testing/DigitalBrain.Testing.csproj`, `src/Testing/DigitalBrain.Testing.E2E/…csproj`, `src/Testing/DigitalBrain.Testing.Reference/…csproj`, `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/…csproj`, `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/…csproj`. Expected: 0 errors.
- [ ] **Step 3: Run** `dotnet test --project src/Testing/DigitalBrain.Testing.Module.Tests.Unit` and `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` (3 facts; needs Docker). Expected: all pass.
- [ ] **Step 4: Commit** the listed files: `git commit -m "E2E harness: no resource-environment channel; facts speak AppHost configuration"`.

---

### Task 4: Ratchet: no environment-variable or config-key literals in test code

**Files:**
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/RepositoryPathLiteralFacts.cs` (add a sibling fact in the same class; reuse `Repository`)

**Interfaces:**
- Consumes: `Repository.ProjectFiles(string pattern, Func<string,bool> predicate, Func<ProjectEntry,bool> projectFilter)` and `Repository.Relative(string path)` from commit `eb802f2f6` (read `Repository.cs` for exact signatures and adjust the call below).

- [ ] **Step 1: Write the fact**

```csharp
    // A fact names what it wants through the typed harness; the hosting ring decides the
    // variable. Raw OTEL_/ASPNETCORE_/DOTNET_ names and "A__B" env spellings are forbidden in test
    // code outside the harness itself, as is spelling an env name through EnvironmentName(...).
    [GeneratedRegex("\"(OTEL_|ASPNETCORE_|DOTNET_|ASPIRE_)[A-Z0-9_]+\"|\"[A-Za-z0-9]+__[A-Za-z0-9_]+\"|EnvironmentName\\(", RegexOptions.CultureInvariant)]
    private static partial Regex EnvironmentLiteral();

    [Fact]
    public void TestsNameNoEnvironmentVariables()
    {
        var offenders = Repository.ProjectFiles("*.cs",
                path => EnvironmentLiteral().IsMatch(File.ReadAllText(path)),
                project => project.Name.Contains(".Tests", StringComparison.Ordinal))
            .Select(Repository.Relative)
            .Where(relative => !relative.StartsWith("src/Testing/", StringComparison.Ordinal))
            .Order().ToArray();
        Assert.True(offenders.Length == 0,
            "Test code names environment variables; speak through the E2E builder (ExportingTelemetryTo, InEnvironment, ConfigureModule, WithHostConfiguration with a typed key):\n"
            + string.Join('\n', offenders));
    }
```

(Mark the class `partial` if it is not already. Hosting unit facts that legitimately assert on projected variable names, such as Task 1's `TelemetryProjectionFacts` and Task 2's hosting fact, assert on the *projection*; they live in `*.Tests.Unit` projects of the hosting ring and OS. Exempt exactly those two files by name in a closed `Allowed` array with a comment, the way `ModuleKeyGrammarFacts` does.)

- [ ] **Step 2: Run** `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-method "*TestsNameNoEnvironmentVariables*"`. Expected: FAIL listing any leftovers from Task 3 (e.g. `ProductHostFixture.cs` if `EnvironmentName(` survived). Fix each by the conversion rule in Task 3. Re-run: PASS.
- [ ] **Step 3: Commit** `git add src/Testing/DigitalBrain.Architecture.Tests/RepositoryPathLiteralFacts.cs <fixed files>` ; `git commit -m "Architecture: test code names no environment variables"`.

---

### Task 5: Waiting is loud

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Diagnostics/TraceAssertions.cs`

- [ ] **Step 1: Change `WaitForAsync` to throw on timeout with the caller's expression**

```csharp
    public static Task WaitForAsync(Func<bool> condition, CancellationToken ct,
        [System.Runtime.CompilerServices.CallerArgumentExpression(nameof(condition))] string? what = null)
        => WaitForAsync(condition, TimeSpan.FromSeconds(20), ct, what);

    public static async Task WaitForAsync(Func<bool> condition, TimeSpan timeout, CancellationToken ct,
        [System.Runtime.CompilerServices.CallerArgumentExpression(nameof(condition))] string? what = null)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        while (!condition())
        {
            if (DateTimeOffset.UtcNow >= deadline)
            { throw new TimeoutException($"Waited {timeout.TotalSeconds:F0}s for: {what}"); }
            await Task.Delay(TimeSpan.FromMilliseconds(250), ct);
        }
    }
```

- [ ] **Step 2: Build every project referencing it** (Framework E2E, OS E2E, Testing.Reference). Fix any call site that relied on the silent return (there should be none; if a fact used `WaitForAsync` then asserted the negative, it keeps the `Task.Delay` it already has).
- [ ] **Step 3: Commit** `git commit -m "E2E: a wait that times out says what it waited for"`.

---

### Task 6: Keepalives do not trace

**Files:**
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.ServiceDefaults/ServiceDefaultsExtensions.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Program.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/TraceBudgetFacts.cs` (assertion added in Task 8; here only the sampler)

Measured idle spans per minute on 2026-10-07: 99, budget < 20. Sources: `IBrainRuntimeEdge/Authorize` and `IBrainRuntimeEdge/Heartbeat` client+server pairs plus `POST /brains/{brainId}/runtime/v1/report` every 20 s per brain session; `INeuron/Watch` pairs from the brain runtime's watch renewal (`ObserverRenewal` = lease/5 = 1 min) per subscribed source; `IMarketplace/Read` ×3 and `IIntegration/Read` ×3 on every `Activated` signal (Task 7).

- [ ] **Step 1: Generalize the noise sampler.** In `ServiceDefaultsExtensions.cs`, next to `IsAzureStorageNoiseName`, add:

```csharp
    // Keepalive traffic is not a trace anyone reads: the sandbox session heartbeat, the authorize
    // call it rides on, and neuron watch renewals. Dropping them keeps an idle brain quiet.
    private static readonly HashSet<string> KeepaliveSpanNames = new(StringComparer.Ordinal)
    {
        "IBrainRuntimeEdge/Heartbeat",
        "IBrainRuntimeEdge/Authorize",
        "INeuron/Watch",
        "INeuron/Unwatch",
    };

    private static bool IsKeepaliveName(string name) => KeepaliveSpanNames.Contains(name);
```

In `SuppressAzureStorageSampler.ShouldSample`, drop when `IsAzureStorageNoiseName(name) || IsKeepaliveName(name)`. Rename the sampler and processor to `SuppressNoiseSampler` / `SuppressNoiseActivityProcessor` (LSP rename; both are private nested types).

- [ ] **Step 2: Filter the report route.** In the `AddAspNetCoreInstrumentation(options => options.Filter = …)` lambda, add `&& !context.Request.Path.Value!.EndsWith("/runtime/v1/report", StringComparison.Ordinal)`. The route is mapped in `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/RuntimeEdgeEndpoints.cs` as `edge.MapPost(RuntimeProtocol.Report, …)`; confirm the suffix by reading `RuntimeProtocol.Report` and use that constant's value verbatim in the filter (ServiceDefaults cannot reference the module, so the literal is restated with a comment naming `RuntimeProtocol.Report`).

- [ ] **Step 3: The sandbox does not trace its own heartbeat POST.** In `Sandbox/Program.cs`, change `.AddHttpClientInstrumentation()` to `.AddHttpClientInstrumentation(options => options.FilterHttpRequestMessage = request => request.RequestUri?.AbsolutePath.EndsWith("/runtime/v1/report", StringComparison.Ordinal) != true)` with the same comment.

- [ ] **Step 4: Build** `src/DigitalBrain.Aspire/DigitalBrain.ServiceDefaults/DigitalBrain.ServiceDefaults.csproj`, `src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`, the Sandbox project. Run `dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Hosting.Tests.Unit`? (no: ServiceDefaults has no unit project; the proof is Task 8's budget fact).
- [ ] **Step 5: Commit** `git commit -m "Telemetry: keepalive heartbeats, authorizations and watch renewals do not trace"`.

---

### Task 7: Catch-up installs once per brain per host

**Files:**
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs` (`OsBootService.ExecuteAsync`, the `OnActivations` local function) — coordinate: another session may hold edits in this file; rebase onto theirs, change only these lines.
- Modify: the OS unit fact that covers `OsBootService` if one exists (search `OsBootService` in `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`); otherwise add `OsBootServiceFacts.cs` there.

- [ ] **Step 1: Failing fact** (adapt to the existing fixture pattern in that test project; the shape):

```csharp
    [Fact]
    public async Task ASecondActivationOfTheSameBrainDoesNotReinstallDefaults()
    {
        // publish two Activated signals for one brain through LocalSignalHub; count InstallAsync calls
        // on a recording OsDefaults; expect exactly one.
    }
```
Write it concretely against the real `LocalSignalHub` and an `OsDefaults` test double (read `OsApps.cs` lines 60–110 for the `BrainBirth`/`InstallAsync` shapes).

- [ ] **Step 2: Implement**: in `OnActivations`, `if (!brains.TryAdd(brain.BrainId, brain)) { continue; }` before `await defaults.InstallAsync(…)`; on failure (`InstallAsync` throws), remove the key so the next activation retries. Keep `OnPublished` iterating `brains.Values`.
- [ ] **Step 3: Run the OS unit suite; expect PASS. Commit** `git commit -m "OS: default-app catch-up runs once per brain per host"`.

---

### Task 8: Fixtures, not boots: capture and budget facts lease shared hosts

**Files:**
- Create: `src/Testing/DigitalBrain.Testing.Reference/ProductionBrainFixture.cs` (from Task 2; now gains a `SensitiveCapture` switch)
- Create: `src/Testing/DigitalBrain.Testing.Reference/ProductionCaptureOffFixture.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/AssemblyInfo.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/ContentCaptureFacts.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/TraceBudgetFacts.cs`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/TestTierBaseline.json` (remove the three `DigitalBrain.Framework.Tests.E2E/*` entries from `LegacyFullStackBootFacts`)

- [ ] **Step 1: Two Production fixtures.** `ProductionBrainFixture` gets `protected virtual bool SensitiveCapture => true;` and passes `ai.Telemetry.EnableSensitiveData = SensitiveCapture` in `ConfigureModule`. `ProductionCaptureOffFixture : ProductionBrainFixture` overrides it to `false`. Register both in `AssemblyInfo.cs`.

- [ ] **Step 2: Rewrite ContentCaptureFacts as two facts, one per fixture**

```csharp
public sealed class ContentCaptureOnFacts(ProductionBrainFixture host)
{
    [Fact(Timeout = 300_000)]
    public async Task TheModuleSettingExportsMessageContent()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await host.LeaseAsync(ct);
        var before = host.Collector.Snapshot().Count;
        await UserConnections.AuthorizeDatabaseAsync(brain, brain.WorkspaceId, ct);
        await LeadData.SeedAsync(brain, "Capture", ct);
        using var response = await brain.HttpClient.PostAsJsonAsync($"/brains/{brain.WorkspaceId}/apps/assistant/ask",
            new { operation = "send", input = "Show active leads" }, ct);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync(ct));
        await WaitForAsync(() => host.Collector.Snapshot().Skip(before).Any(span => TextOf(span).Contains("Show active leads", StringComparison.Ordinal)), TimeSpan.FromSeconds(60), ct);
        Assert.Contains(host.Collector.Snapshot().Skip(before), span => span.Attributes.Keys.Any(key => key.StartsWith("gen_ai.usage", StringComparison.Ordinal)));
        Assert.Empty(host.Collector.Errors());
    }
}

public sealed class ContentCaptureOffFacts(ProductionCaptureOffFixture host)
{
    [Fact(Timeout = 300_000)]
    public async Task TheModuleSettingKeepsMessageContentOutOfExports()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await host.LeaseAsync(ct);
        var before = host.Collector.Snapshot().Count;
        await UserConnections.AuthorizeDatabaseAsync(brain, brain.WorkspaceId, ct);
        await LeadData.SeedAsync(brain, "Capture", ct);
        using var response = await brain.HttpClient.PostAsJsonAsync($"/brains/{brain.WorkspaceId}/apps/assistant/ask",
            new { operation = "send", input = "Show active leads" }, ct);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync(ct));
        await WaitForAsync(() => host.Collector.Snapshot().Skip(before).Any(IsGenAiSpan), TimeSpan.FromSeconds(60), ct);
        await Task.Delay(TimeSpan.FromSeconds(3), ct);
        Assert.DoesNotContain(host.Collector.Snapshot().Skip(before), span => TextOf(span).Contains("Show active leads", StringComparison.Ordinal));
        Assert.DoesNotContain(host.Collector.LogSnapshot(), log => TextOf(log).Contains("Show active leads", StringComparison.Ordinal));
        Assert.Empty(host.Collector.Errors());
    }
}
```
Delete the old class and `CaptureTest`. (If `brain.WorkspaceId` is not the brain id the OS routes accept for the lease's dev brain, use whatever `BrainFact`/`SharedBrainFixture` exposes as the leased brain id; read `E2EBrain.cs`.)

- [ ] **Step 3: Rewrite TraceBudgetFacts to lease `ReferenceBrainFixture`.** Constructor `TraceBudgetFacts(ReferenceBrainFixture host)`; both facts use `await using var brain = await host.LeaseAsync(ct);` and `host.Collector`, with a `before = host.Collector.Snapshot().Count` baseline instead of per-boot collectors; delete `OtlpEnvironment`. The idle measurement stays 60 s with budget `< 20`; J1 budget stays 140; the grain-call fact keeps its exactly-two assertion. Remove `ScriptedModelServer.StartAsync` from the facts (the fixture owns `Model`).

- [ ] **Step 4: Drain the baseline.** Remove the three Framework entries from `TestTierBaseline.json`. Run `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`; `FullProductStacksBootInFixturesNotInFacts` must pass with the baseline's `LegacyFullStackBootFacts` now holding only what still boots per fact elsewhere (expected: empty).

- [ ] **Step 5: Run the Framework E2E suite** `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E` (allow 15 min). Expected: 0 failures. If the idle budget still fails, the failure message lists the spans; every remaining name must be something other than the four keepalive names and the report route, and the fix belongs in Task 6 or Task 7, never in the threshold.

- [ ] **Step 6: Commit** the listed files: `git commit -m "Framework E2E: capture and budget facts lease shared fixtures; a Production reference brain is one of them"`.

---

### Task 9: Regression net and CI

- [ ] Run: Architecture, Platform.Tests.Unit, OS.Tests.Unit, Aspire.Hosting.Tests.Unit, Testing.Module.Tests.Unit, OS.Tests.E2E, Framework.Tests.E2E, Compute.Tests. Record each summary line.
- [ ] `python -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml'))"` still parses (unchanged in this plan, but the E2E discovery job must still find all four E2E projects).
- [ ] Push the branch and read CI through the ccd_pr tools once a PR exists; do not poll by hand.
