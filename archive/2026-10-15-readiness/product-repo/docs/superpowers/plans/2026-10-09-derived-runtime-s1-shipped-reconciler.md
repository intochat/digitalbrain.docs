# Derived Runtime, Section 1: Installed First-Party Apps Are Reconciled, Never Manually Updated

> **For agentic workers (OpenCode):** you implement exactly ONE task below. Read the spec first:
> `docs/superpowers/specs/2026-10-09-derived-runtime-design.md` (Section 1 only). Read `CLAUDE.md`. Stay inside
> the files your task lists. Do not commit - the orchestrator reviews and commits.

**Goal:** For every app in a brain whose `Origin.Source` is `Shipped` and whose snapshot is not `Edited`,
the catalog's version wins: on every brain activation the installed copy is brought to the catalog's
version through the same path `AppInstaller.Update` uses (`IApp.Replace` then `IApp.RecordOrigin`), and
`AppReconciled(name, from, to)` is published so the shell and traces show it. Edited copies are untouched,
third-party origins are untouched, and the manual update endpoint stays for third-party origins.

**Depends on:** Sections 2 and 3 land first (spec order: 2, 3, 1, 4, 5). Section 1 touches none of their
code. It adds `AppReconciled` + `IShippedAppReconciler` to `DigitalBrain.Modules.Apps.Contracts`, the
`ShippedAppReconciler` grain and an `Activated`-watcher startup task to `DigitalBrain.Modules.Apps`, and
facts to `DigitalBrain.Modules.Apps.Tests`. No dependency on sections 2/3/4/5 logic; section 4's
`IRetainsSignals` retry does not apply here because `Replace`+`RecordOrigin` re-runs are idempotent
(version-compared) and delivery is not needed by the reconciler.

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, xunit v3. Build and test **per project**, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj` · `dotnet test --project src/<test-project-dir>`.
  Cap every test run at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, not a timeout to raise.
- Warnings are errors, nullable on, package versions only in `Directory.Packages.props`. No `/// <summary>`
  boilerplate. Inline comments only for what code cannot say. Match surrounding style (file-scoped
  namespaces, primary constructors, expression bodies; `ConfigureAwait(false)` is not needed here because
  the Apps module does not use it today).
- No new grain state in this section: `ShippedAppReconciler` derives the stateless `Neuron` base, so
  `PersistedStateFacts` is untouched. Every `[Alias]` unique. No self-calls on non-reentrant grains (the
  reconciler calls other grains, never itself).
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains via
  `await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);`
  (`src/Testing/DigitalBrain.Testing.Module`), the Apps test support (`AppOwner`, `Caller`) and the
  recording `FakeAppRuntime` in `DigitalBrain.Modules.Apps.Tests/Runtimes/AppRuntimeFacts.cs`. No mocks of grains.
- Neuron keys start with the brain id: `{brainId}/...`. Brain of a key: text before the first `/`.
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`, `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`,
  `src/DigitalBrain.AppHost/*` unless your task lists them. The orchestrator wires those.
  `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs` IS listed (Task S1-3).
- Done = your project(s) build with 0 warnings and your tests pass. Report the exact commands and output.

---

## Task S1-1: The contracts ring: `AppReconciled` signal and `IShippedAppReconciler`

**Executor:** Claude. A new signal and a new neuron contract in the vocabulary ring; the grain that
implements them lands in Task S1-2.

**Files:**
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppReconciled.cs`
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IShippedAppReconciler.cs`

**Implementation.**

`AppReconciled.cs` (whole file):
```csharp
namespace DigitalBrain.Apps.Signals;

// One shipped copy brought to the catalog's version: the app's name and the versions before and
// after. Published by the reconciler so the shell and traces show every catch-up.
[GenerateSerializer, Alias("apps.app-reconciled")]
public sealed record AppReconciled(
    [property: Id(0)] string Name,
    [property: Id(1)] string From,
    [property: Id(2)] string To) : Signal;
```

`IShippedAppReconciler.cs` (whole file):
```csharp
using Orleans.Metadata;

namespace DigitalBrain.Apps;

// Brings this brain's installed shipped apps to the catalog's version. Runs on every brain
// activation, so a code change is reflected in the running apps without a hand-posted update.
[Alias("apps.reconciler"), DefaultGrainType("apps.reconciler")]
public interface IShippedAppReconciler : INeuron
{
    Task Reconcile(CancellationToken ct = default);

    static string Key(string brainId) => $"{brainId}/apps-reconciler";
}
```

**Verify:**
```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppReconciled.cs src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IShippedAppReconciler.cs
timeout 300 dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"
```
Commit message: `apps contracts: AppReconciled signal and IShippedAppReconciler contract`

## Task S1-2: The `ShippedAppReconciler` grain

**Executor:** Claude. A new grain type in the Apps module; it publishes the `AppReconciled` signal.

**Files:**
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppReconciler.cs`

**Implementation.** (whole file)
```csharp
using DigitalBrain.Apps.Signals;
using DigitalBrain.Framework;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.Apps;

// Brings this brain's unedited shipped apps to the catalog's version. Replace then RecordOrigin is
// the same path AppInstaller.Update takes; a copy the person edited, or that came from a person's
// brain, is untouched. One app failing must not keep the others from catching up.
[GrainType("apps.reconciler")]
internal sealed class ShippedAppReconciler(
    IGrainFactory grains, ILogger<ShippedAppReconciler> logger, ShippedCatalog? catalog = null)
    : Neuron, IShippedAppReconciler
{
    public async Task Reconcile(CancellationToken ct = default)
    {
        var key = this.GetPrimaryKeyString();
        var brainId = key[..key.LastIndexOf('/')];
        foreach (var name in await grains.GetGrain<IAppIndex>(brainId).List().WaitAsync(ct))
        {
            var app = grains.GetGrain<IApp>(IApp.Key(brainId, name));
            AppSnapshot snapshot;
            try { snapshot = await app.Read().WaitAsync(ct); }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning(error, "Could not read {Brain}/{App} to reconcile it.", brainId, name); continue; }
            if (snapshot.Origin is not { Source: AppSource.Shipped } origin || snapshot.Edited) { continue; }
            if (catalog is null) { continue; }
            AppBundle? bundle;
            try { bundle = await catalog.Find(origin.Publisher, origin.Name); }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning(error, "The catalog could not serve {Publisher}/{Name}.", origin.Publisher, origin.Name); continue; }
            if (bundle is null || AppVersions.Compare(bundle.Version, origin.Version) <= 0) { continue; }
            try
            {
                await app.Replace(bundle with { Name = name }).WaitAsync(ct);
                await app.RecordOrigin(origin with { Version = bundle.Version }).WaitAsync(ct);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning(error, "Reconciling {Brain}/{App} to {Version} failed.", brainId, name, bundle.Version); continue; }
            await PublishAsync(new AppReconciled(name, origin.Version, bundle.Version));
        }
    }
}
```
(The grain is stateless - it derives `Neuron`, reads the brain id from its own key, and reaches
`IAppIndex`/`IApp` by grain reference. `ShippedCatalog?` is an optional constructor service exactly as in
`AppInstaller`; a host that ships no apps gets `null` and the reconciler no-ops.)

**Verify:**
```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppReconciler.cs
timeout 300 dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
```
Commit message: `apps: ShippedAppReconciler grain brings unedited shipped copies to the catalog version`

## Task S1-3: The activation watcher and its module wiring

**Executor:** Claude. A new silo startup task that watches every brain activation (`Activated`, the
signal `KernelActivation` publishes on every wake and `IKernel.Create` publishes on birth) and calls the
reconciler; one line added to `AppsModule.Configure`.

**Files:**
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppReconcileHost.cs`
- Modify `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs` (add one line)

**Implementation.**

`ShippedAppReconcileHost.cs` (whole file):
```csharp
using DigitalBrain;
using DigitalBrain.Framework;
using Microsoft.Extensions.Logging;
using Orleans.Runtime;

namespace DigitalBrain.Apps;

// Watches the brain's lifecycle the way OsDefaults installs on it: every activation (the kernel's
// Activated signal) brings the brain's unedited shipped apps to the catalog's version. The pump is
// fire-and-forget from the startup task; a reconcile failure never fails the brain's activation.
internal sealed class ShippedAppReconcileHost(
    IGrainFactory grains, LocalSignalHub hub, ILogger<ShippedAppReconcileHost> logger) : IStartupTask
{
    public Task Execute(CancellationToken cancellationToken)
    {
        var activations = hub.Subscribe<Activated>();
        _ = Task.Run(() => PumpAsync(activations, cancellationToken), CancellationToken.None);
        return Task.CompletedTask;
    }

    private async Task PumpAsync(LocalSignalHub.Subscription<Activated> activations, CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var activated in activations.Reader.ReadAllAsync(cancellationToken))
            {
                // The kernel publishes Activated; its publisher name is "kernel/{brainId}".
                var name = activated.Publisher.Name;
                var brainId = name[(name.IndexOf('/') + 1)..];
                try { await grains.GetGrain<IShippedAppReconciler>(IShippedAppReconciler.Key(brainId)).Reconcile(cancellationToken); }
                catch (Exception error) when (error is not OperationCanceledException)
                { logger.LogWarning(error, "Reconciling shipped apps for brain {Brain} failed.", brainId); }
            }
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { logger.LogError(error, "The shipped-app reconciler stopped watching activations."); }
    }
}
```
(Reconciling is idempotent - `AppVersions.Compare` skips everything already current - so re-wakes and
re-runs are safe. `LocalSignalHub` is the silo singleton `BrainHosting` registers; `BrainFacts` listens
the same way.)

`AppsModule.cs` - in `Configure(ISiloBuilder silo)`, after the existing `silo.Services.TryAddSingleton<Creator>();`
line and before `silo.Services.TryAddEnumerable(...)` add:
```csharp
        silo.AddStartupTask<ShippedAppReconcileHost>();
```
(`using Orleans.Hosting;` is already present in the file.)

**Verify:**
```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppReconcileHost.cs src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs
timeout 300 dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
```
Commit message: `apps: reconcile shipped apps on every brain activation via the Activated signal`

## Task S1-4: `ShippedAppReconcilerFacts`

**Executor:** DeepSeek. Test-only task; all production shapes landed in S1-1/S1-2/S1-3.

**Files:**
- Create `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Shipping/ShippedAppReconcilerFacts.cs`

**Failing test code** (whole file; this is the red the task drives to green):
```csharp
using DigitalBrain;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Modules.Apps.Tests;
using DigitalBrain.Modules.Apps.Tests.Runtimes;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Apps.Tests.Shipping;

// Every brain activation brings the brain's unedited shipped apps to the catalog's version; a copy the
// person edited, or that came from a person's brain, stays exactly as it is.
public sealed class ShippedAppReconcilerFacts : IDisposable
{
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;
    private readonly string _root = Directory.CreateTempSubdirectory("reconciler-").FullName;

    public ShippedAppReconcilerFacts()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Greeter", "synapses"));
        File.WriteAllText(Path.Combine(_root, "Greeter", "app.json"),
            """{"name":"greeter","title":"Greeter","description":"Greets.","version":"1.2.0","operations":[{"name":"ask","description":"Greet"}],"settings":[]}""");
        File.WriteAllText(Path.Combine(_root, "Greeter", "synapses", "greet.cs"), "// greet\n");
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    // A host that ships os/greeter from a writable development folder, so a test can bump the catalog.
    private Task<ModuleBrain> Start() => ModuleTest.Create().WithModule<AppsModule>()
        .WithFakeAppRuntime(new())
        .ConfigureSilo(silo =>
        {
            silo.Services.AddSingleton<IShippedAppSource>(new DirectoryShippedAppSource(_root, "os", development: true));
            silo.Services.AddSingleton<ShippedCatalog>();
        })
        .StartAsync(Ct);

    private static async Task<IApp> Installed(ModuleBrain brain)
    {
        AppOwner.Stamp("alice");
        await brain.SiloServices.GetRequiredService<AppInstaller>().Install("os", "greeter", Ct);
        Caller.Clear();
        return brain.Get<IApp>(IApp.Key(AppOwner.Scope("alice"), "greeter"));
    }

    // Writes a newer bundle back to the folder and reloads the catalog, so the catalog outruns the copy.
    private static async Task ShipNewerVersion(ModuleBrain brain, string version = "2.0.0")
    {
        var catalog = brain.SiloServices.GetRequiredService<ShippedCatalog>();
        var current = (await catalog.Find("os", "greeter"))!;
        await catalog.SaveToSource("os", current with
        {
            Version = version,
            Files = new(current.Files, StringComparer.Ordinal) { ["synapses/greet.cs"] = "// greet v2\n" },
        });
    }

    private static IShippedAppReconciler Reconciler(ModuleBrain brain)
        => brain.Get<IShippedAppReconciler>(IShippedAppReconciler.Key(AppOwner.Scope("alice")));

    [Fact(Timeout = 60_000)]
    public async Task ReconcilingPutsAnOlderUneditedShippedAppOnTheCatalogVersion()
    {
        await using var brain = await Start();
        var copy = await Installed(brain);
        await ShipNewerVersion(brain);

        await Reconciler(brain).Reconcile(Ct);

        var after = await copy.Read();
        Assert.Equal("2.0.0", after.Version);
        Assert.Equal("// greet v2\n", after.Files["synapses/greet.cs"]);
        Assert.Equal("2.0.0", after.Origin!.Version);
        Assert.IsType<AppSource.Shipped>(after.Origin.Source);
        Assert.False(after.Edited);
    }

    [Fact(Timeout = 60_000)]
    public async Task ReconcilingLeavesAnEditedCopyAlone()
    {
        await using var brain = await Start();
        var copy = await Installed(brain);
        await copy.WriteFile("notes.md", "mine now", Guid.NewGuid());
        await ShipNewerVersion(brain);

        await Reconciler(brain).Reconcile(Ct);

        var after = await copy.Read();
        Assert.True(after.Edited);
        Assert.Equal("1.2.1", after.Version);
        Assert.Equal("// greet\n", after.Files["synapses/greet.cs"]);
        Assert.Equal("1.2.0", after.Origin!.Version);
    }

    [Fact(Timeout = 60_000)]
    public async Task ReconcilingLeavesAThirdPartyOriginAlone()
    {
        await using var brain = await Start();
        var app = brain.Get<IApp>(IApp.Key(AppOwner.Scope("alice"), "from-bob"));
        await app.Create(new AppManifest("FromBob", "bob's", [new("ask", "ask")], [], []), "## Scenario: Answers\nIt answers.");
        await app.RecordOrigin(new AppOrigin("bob", new AppSource.Brain("account-bob", "bob"), "from-bob", "1.0.0"));
        await ShipNewerVersion(brain);

        await Reconciler(brain).Reconcile(Ct);

        var after = await app.Read();
        Assert.Equal("1.0.0", after.Version);
        Assert.IsType<AppSource.Brain>(after.Origin!.Source);
    }

    [Fact(Timeout = 60_000)]
    public async Task ReconcilingPublishesAppReconciledNamingTheVersions()
    {
        await using var brain = await Start();
        var copy = await Installed(brain);
        await ShipNewerVersion(brain);
        var reconciler = Reconciler(brain);
        await using var reconciled = await brain.SubscribeAsync<AppReconciled>(reconciler, Ct);
        await using var signals = reconciled.ReadAllAsync(Ct).GetAsyncEnumerator(Ct);

        await reconciler.Reconcile(Ct);

        Assert.True(await signals.MoveNextAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10), Ct));
        Assert.Equal(("greeter", "1.2.0", "2.0.0"), (signals.Current.Name, signals.Current.From, signals.Current.To));
    }

    [Fact(Timeout = 60_000)]
    public async Task EveryBrainActivationReconcilesTheBrain()
    {
        await using var brain = await Start();
        var kernel = brain.Get<IKernel>(AppOwner.Scope("alice"));
        await kernel.Create(new Owner("account-alice"));
        var copy = await Installed(brain);
        await ShipNewerVersion(brain);

        await brain.DeactivateAsync(kernel, Ct);
        await kernel.Read();

        while ((await copy.Read()).Version != "2.0.0") { await Task.Delay(50, Ct); }
        Assert.Equal("2.0.0", (await copy.Read()).Version);
    }
}
```
(Run `timeout 300 dotnet build` on the Apps project first so `IShippedAppReconciler`, `AppReconciled` and
`ShippedAppReconcileHost` compile, then run the facts. The activation fact proves the S1-3 watcher: the
deactivated kernel's wake publishes `Activated`, the pump reconciles, and the copy lands on `2.0.0`.)

**Verify:**
```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Shipping/ShippedAppReconcilerFacts.cs
timeout 300 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*ShippedAppReconcilerFacts*"
timeout 300 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*VocabularyRingFacts*"
timeout 300 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*PersistedStateFacts*"
timeout 300 dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
```
(The full Apps suite keeps `AppInstallerFacts`, `SaveToSourceFacts`, `OsBootFacts` and every other fact
green: the new startup task no-ops on brains whose apps are already at the catalog version. Commit
message: `apps tests: shipped copies reconcile on every brain activation; edited and third-party copies stay`)

## Task S1-5: Verification loop over a running host

**Executor:** Claude (or the orchestrator). No code changes; drive the running system per `CLAUDE.md`
Verification loop.

**Files:** none.

**Procedure (exact commands; each step names the spec's facts):**

```bash
git add --dry-run .   # nothing staged; this task writes nothing
timeout 900 dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
timeout 900 dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
timeout 900 dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
timeout 900 dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
cd src/DigitalBrain.AppHost && aspire run
```

1. `mcp__aspire__list_resources`: every resource Running/Healthy. If one is not, read `list_console_logs`
   for it before anything else.
2. **A brain with an older unedited shipped app is on the catalog version after startup** - through
   `digitalbrain-mcp` (`localhost:5081/mcp`; `/brains/{brainId}/mcp` selects a brain):
   - `neurons_context`: confirm which caller and brain you are acting as.
   - `neurons_search` "reconciler": find the `DigitalBrain.Apps.IShippedAppReconciler` contract, key
     `{brainId}/apps-reconciler`.
   - `neurons_get` on `DigitalBrain.Apps.IApp` key `{brainId}/apps/assistant` (and `{brainId}/apps/calculator`):
     read `Version`, `Origin.Source == "Shipped"`, `Origin.Version`, `Edited == false`. Compare `Origin.Version`
     to the catalog version in `src/DigitalBrain.OS/Apps/Assistant/app.json`; if the code change bumped it,
     the installed copy is already there (the reconciler ran when the brain activated under this build).
   - To watch a reconcile happen: `neurons_call` `IShippedAppReconciler` `Reconcile` with no arguments
     (idempotent; it no-ops if already current), then re-read the app - state unchanged proves "on the
     catalog version".
   - `neurons_get` on the same app after editing it through the normal edit path and re-running
     `Reconcile`: the program and `Edited == true` are untouched (edited copies are never reconciled).
3. **The signal names the versions** - in telemetry after a reconcile that crossed a version boundary:
   `mcp__aspire__list_structured_logs` search "reconciled" or "apps.app-reconciled" shows the
   `AppReconciled` fact; `mcp__aspire__list_traces` search "Reconcile" shows the span chain
   `IShippedAppReconciler/Reconcile` -> `IApp/Replace` -> `IApp/RecordOrigin`, and
   `mcp__aspire__list_trace_structured_logs` on one trace follows it end to end.
4. **The update endpoint stays for third-party origins** - `POST /brains/{id}/apps/{name}/update`
   (`src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs` line 98) still
   answers for a person-published app; it is untouched by this section.
5. **Regression net** - the four suites from the Procedure preamble all stay green (they were run before
   `aspire run`; nothing here changes code).

---

## Orchestrator (integration, after these tasks)

- No new projects: `DigitalBrain.slnx` / `DigitalBrain-lsp.sln` need no entries; the reconciler is an
  existing-project grain discovered like `AppNeuron`, and `AppsModule.Configure` now registers the
  `ShippedAppReconcileHost` startup task. `OsCatalog.cs` is untouched.
- The shipped catalog's own versions are bumped by whoever changes `src/DigitalBrain.OS/Apps/*/app.json`;
  the reconciler makes those bumps land in every brain without a hand-posted update.
- Cross-section handoff: sections 2/3 land before this one (spec order) and consume nothing from it.
  Section 4's `IRetainsSignals` and section 5's profiles do not interact with the reconciler.

## Open questions

1. **Trigger mechanism.** The spec says "on every brain activation through the existing creation handler".
   The existing creation handler (`OsDefaults`, an `ICreationHandler`) runs only at brain birth, so it
   cannot catch a brain that was born under an older build. This plan therefore watches the `Activated`
   signal - the exact lifecycle `KernelActivation` publishes on every wake and `IKernel.Create` publishes
   on birth - via a silo `IStartupTask` subscription. This covers creation and every later wake. If the
   orchestrator wants the reconciler registered as an `ICreationHandler` as well, it is a harmless no-op
   (defaults install at the current catalog version) and can be added in Task S1-3.
2. **`AppReconciled` publisher.** The reconciler grain publishes the signal, so its `Publisher` is the
   reconciler neuron, not the app being reconciled. The shell already sees the version change through the
   app neuron's `AppChanged` (published by `IApp.Replace`) and its app-list reads. A dedicated shell
   surface for `AppReconciled` would watch the reconciler neuron - out of scope unless wanted.
3. **Best-effort reconcile.** A failed read/replace logs and continues; an unreachable catalog skips. The
   reconciler is idempotent (version-compared), so the next brain activation retries anything skipped.
