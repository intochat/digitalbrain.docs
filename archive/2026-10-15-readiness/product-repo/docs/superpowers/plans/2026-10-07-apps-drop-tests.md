# Apps: drop the test pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An app is a bundle of C# behavior scripts plus a manifest and a prose spec; nothing in the Apps module runs, parses or records tests any more, and the only publish gate is "every script compiles".

**Architecture:** Delete the verification pipeline end to end: `tests.cs`, the `dbtest:` line protocol, `AppVerifyJob`, `ITestScriptRunner`, the scratch-copy apps, the `Verified`/`Verdicts` ledgers, the `AppVerified` signal, `MarketplaceListing.Scenarios`, the `/verify` route and the shell's Verify button. `IApp.Publish` and `IApp.Export` refuse a bundle whose `.cs` files do not compile, checked through the `IScriptSandbox` the CSharp module already registers; with no sandbox composed, publish proceeds. The Creator's Builder writes behaviors only. The sandbox stays what it is: the external system behind the `ICSharpFile` edge neuron, like Gmail behind `IGmail`.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains, xUnit v3 facts on `ModuleTest.Create().WithModule<AppsModule>()`, Flutter shell (`flutter analyze`, `flutter test`).

**Spec:** This plan is its own spec. The decision was taken in conversation on 2026-10-07 after the module audit (`docs/superpowers/specs/2026-10-07-module-audit.md`, Apps section): per-app tests and the test-as-publish-gate are over-engineering; the memory note `behaviors-ultra-small-no-app-tests` records the same ruling from 2026-10-06. The audit's other Apps findings (orchestrators polling the grain, three invoke-await pollers, the `/apps/` key grammar) are **out of scope** here and stay for the Apps restructure.

## Decisions (read before any task)

1. **Compile is the gate.** `Publish` and `Export` call `IScriptSandbox.Check` over every bundle file ending in `.cs`. Any error refuses with an `InvalidOperationException` listing `file:line message`. If no `IScriptSandbox` is registered, or the registered one has no compiler (`CSharpScriptSandbox.Check` throws `InvalidOperationException` when the host has no `CSharpScriptCheck`), the gate is skipped: a host that cannot run scripts cannot verify them either, and the OS unit tests already compile every shipped bundle at build (`OsShippedAppFacts.EveryOsProgramAndTestsFileCompilesAgainstCurrentContracts`, `VendorAppFacts`).
2. **The spec is prose.** `## Scenario:` headings are no longer parsed anywhere. Existing spec files keep their headings; nothing reads them. The Author prompt stops demanding them.
3. **Behavior/synapse vocabulary is untouched.** `IApp.WriteBehavior`, `AppFiles.SynapsesPrefix` and the `synapses/` folders stay exactly as they are. Which word wins is a separate decision.
4. **`AppWorkQueue` stays** for the Builder loop only. `AppVerifyJob.Enqueue` was its other caller and goes.
5. **First build bumps minor.** Today `CompleteBuild` bumps minor when `tests.cs` first appears. It now bumps minor when the app had no files before this build (`Snapshot.Files.Count == 0`), so a first implement still goes `0.1.0 → 0.2.0`, which the Dart test and `AppCreatorFacts` expect.
6. **No state compatibility.** `AppState`, `AppSnapshot` and `MarketplaceListing` drop fields and renumber `[Id(n)]` freely. No shims.
7. **Shipped bundles ship when they import.** `ShippedAppPublisher` imports or replaces, then publishes. A bundle whose scripts do not compile is refused by `Publish`, logged, and the next bundle still ships. `IShippedAppSource.VerifiedByBuild` goes.

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`.
- Grain state uses concrete arrays, never `IReadOnlyList`; existing `List<T>` fields in `AppState` stay as they are (the JSON serializer round-trips them and they are not touched here).
- No `/// <summary>`; inline comments only for what code cannot say; delete every comment that mentions tests, verdicts, green or scenarios as a gate.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- LSP (`csharp-ls` over the gitignored `DigitalBrain-lsp.sln`) `findReferences` on every symbol before deleting it; text search only for scripts, Dart, docs and csproj lines.
- Never raise a timeout or add polling to make a check pass.
- Every task ends with every touched project building and its tests green, then one commit.
- Fixture scripts: the Apps test suite composes no `IScriptSandbox`, so `"// b"` placeholders are
  fine there. In a host that composes `CSharpModule` (OS unit tests, Assistant tests), if the real
  `CSharpScriptCheck` refuses a comment-only file, use `Console.WriteLine("ok");` as the fixture
  source instead. Never weaken the gate to let a fixture through.

## Review Focus

1. **A behavior with a compile error is published.** `Publish` on a bundle whose `synapses/x.cs` has `int wrong = "text";` must throw and list the file and line. Pinned in Task 1 (`PublishingABundleWhoseScriptDoesNotCompileIsRefusedWithTheDiagnostics`).
2. **A host without a sandbox cannot publish anything.** With no `IScriptSandbox` registered, `Publish` must proceed. Pinned in Task 1 (`PublishingWithoutASandboxComposedSkipsTheCompileGate`).
3. **An app with no scripts at all is refused.** A manifest-and-spec-only bundle has nothing to compile and must publish. Pinned in Task 1 (`PublishingAnAppWithNoScriptsNeedsNoCompiler`).
4. **One bad shipped bundle blocks the rest.** A folder bundle refused by the gate must be logged and the next bundle still imported. Pinned in Task 2 (`ABundleTheGateRefusesStaysOutAndTheOthersStillShip`).
5. **The shell hides Publish forever.** Once `green` leaves the wire, the Publish button must show for a `Live` app whose `publishedVersion` differs from `version`. Pinned in Task 3 (`app_screen_test.dart`, "a live version can be published once").

---

## File structure after the plan

Deleted:

```
src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Verification/AppTestRun.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppVerified.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppVerifyJob.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Verification/TestScriptRunner.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppVerifyFacts.cs
src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ScriptedTestRunner.cs
src/DigitalBrain.OS/Apps/Assistant/tests.cs
src/DigitalBrain.OS/Apps/Settings/tests.cs
src/IntoChat/Apps/CustomerResearcher/tests.cs
src/IntoChat/Apps/CustomerResearcher/app.authoring.json
src/IntoChat/Apps/WordCount/tests.cs
```

Modified (C#): `IApp.cs`, `AppSnapshot.cs`, `AppFiles.cs`, `AppBundle.cs`, `MarketplaceListing.cs`, `AppState.cs`, `AppNeuron.cs`, `AppsModule.cs`, `AppsEndpoints.cs`, `Creator.cs`, `AgentPrompts.cs`, `BuilderTools.cs`, `AppAuthoringPolicy.cs`, `ShippedAppPublisher.cs`, `IShippedAppSource.cs`, `EmbeddedShippedAppSource.cs`, `DirectoryShippedAppSource.cs`, `DigitalBrain.Modules.Apps.csproj`; Apps tests `AppCreatorFacts.cs`, `AppInstallerFacts.cs`, `AppNeuronFacts.cs`, `AppPublishFacts.cs`, `AppRouteFacts.cs`, `AppSharingFacts.cs`, `MarketplaceRouteFacts.cs`, `ShippedAppPublisherFacts.cs`, `ShippedAppSyncFacts.cs`, `DirectoryShippedAppSourceFacts.cs`, `Runtimes/DeployableRuntimeFacts.cs`, `Runtimes/StorageHookFacts.cs`, `Apps/AppOriginFacts.cs`; OS tests `OsBootFacts.cs`, `OsAssistantAppFacts.cs`, `VendorAppFacts.cs`, `OsShippedAppFacts.cs`; OS E2E `ShippedAppVerificationFacts.cs` (renamed `ShippedSynapseFacts.cs`), `ProductE2E.cs`; Assistant tests `AgentToolSelectionFacts.cs`, `InventoryFacts.cs`, `RegistryDiscoveryFacts.cs`.

Modified (Dart, `src/DigitalBrain.Modules/Google/Flutter/app`): `shell/lib/workspace/apps/app_screen.dart`, `shell/lib/workspace/home/app_detail_screen.dart`, `core/lib/src/models/marketplace.dart`, `core/lib/src/ui_client.dart` (one comment), `shell/test/app_screen_test.dart`, `shell/test/app_detail_screen_test.dart`.

Modified (docs): `CLAUDE.md`, memory note `behaviors-ultra-small-no-app-tests.md`.

Task order keeps every project green at every commit: Task 1 (gate becomes compile-only, old API still present) → Task 2 (every consumer stops using the old API; shipping, Creator, routes, bundles) → Task 3 (delete the old API and state; Dart in the same commit because the wire shape changes) → Task 4 (docs, comments, dead references) → Task 5 (seen running).

---

### Task 1: Publish and Export gate on compilation, not verdicts

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs` (`Export` lines 232-240, `Publish` lines 242-272)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppPublishFacts.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppSharingFacts.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppNeuronFacts.cs`

**Interfaces:**
- Consumes: `IScriptSandbox.Check(IReadOnlyDictionary<string,string> files) : ScriptCompilationCheck` (Contracts `Authoring/IScriptSandbox.cs`), `Neuron.ServiceProvider`.
- Produces: private `AppNeuron.RequireCompiles()`; `Publish`/`Export` no longer read `Snapshot.Verified`. `RecordVerdicts`, `BeginVerify` and the state fields still exist (deleted in Task 3).

- [ ] **Step 1: Write the failing publish-gate facts**

Add to `AppPublishFacts.cs` a fake sandbox and three facts. Put the fake at the bottom of the class:

```csharp
    private sealed class RefusingSandbox(params (string File, int Line, string Message)[] errors) : IScriptSandbox
    {
        public bool CanRun => true;
        public string AuthoringDescription => "";
        public Task<ScriptContractCatalog> ReadContracts(IReadOnlyList<string> modules, CancellationToken cancellationToken)
            => Task.FromResult(new ScriptContractCatalog([], [], ""));
        public ScriptCompilationCheck Check(IReadOnlyDictionary<string, string> files)
            => new(errors.Length == 0, [.. errors.Select(error => new ScriptCompilationDiagnostic(error.File, "CS0029", error.Line, error.Message))]);
    }
```

Add the facts (they use the existing `GreenApp`, `Owner`, `Caller` and `Marketplace` helpers as they are today):

```csharp
    [Fact]
    public async Task PublishingABundleWhoseScriptDoesNotCompileIsRefusedWithTheDiagnostics()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IScriptSandbox>(new RefusingSandbox(("synapses/echo.cs", 2, "Cannot implicitly convert type 'string' to 'int'"))))
            .StartAsync(ct);
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        var error = await Assert.ThrowsAsync<InvalidOperationException>(app.Publish);
        Caller.Clear();
        Assert.Contains("synapses/echo.cs:2", error.Message, StringComparison.Ordinal);
        Assert.Contains("Cannot implicitly convert", error.Message, StringComparison.Ordinal);
        Assert.Empty(await Marketplace(brain).List());
        await Assert.ThrowsAsync<InvalidOperationException>(app.Export);
    }

    [Fact]
    public async Task PublishingWithoutASandboxComposedSkipsTheCompileGate()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        var published = await app.Publish();
        Caller.Clear();
        Assert.Equal(published.Version, published.PublishedVersion);
    }

    [Fact]
    public async Task PublishingAnAppWithNoScriptsNeedsNoCompiler()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IScriptSandbox>(new RefusingSandbox(("any.cs", 1, "would refuse"))))
            .StartAsync(ct);
        Caller.Clear();
        var app = brain.Get<IApp>(IApp.Key(Owner.Scope("intochat"), "prose"));
        await app.Create(Manifest(), Spec);
        await app.BeginBuild(null);
        await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["notes.md"] = "no code" }, null);
        await app.RecordVerdicts([new("Echoes", true, "ok"), new("Quiet", true, "ok")], green: true);
        Owner.Stamp("intochat");
        var published = await app.Publish();
        Caller.Clear();
        Assert.Equal(published.Version, published.PublishedVersion);
    }
```

Add `using Microsoft.Extensions.DependencyInjection;` to the file's usings.

- [ ] **Step 2: Run the three facts and watch them fail**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*CompileGate*" --filter-method "*DoesNotCompile*" --filter-method "*NeedsNoCompiler*"
```

Expected: the first fact fails (`Publish` succeeds because verdicts are green and nothing compiles anything); the other two pass already. That is fine: they pin behavior the next step must keep.

- [ ] **Step 3: Replace the verdict check with the compile check**

In `AppNeuron.cs`, add the gate helper next to `RequireCreated()`:

```csharp
    // The publish gate: every script in the bundle compiles against the installed contracts. A host
    // without a script compiler cannot run apps either, so it has nothing to refuse.
    private void RequireCompiles()
    {
        var scripts = Snapshot.Files.Where(file => file.Key.EndsWith(".cs", StringComparison.Ordinal))
            .ToDictionary(file => file.Key, file => file.Value, StringComparer.Ordinal);
        if (scripts.Count == 0) { return; }
        var sandbox = ServiceProvider.GetService<IScriptSandbox>();
        if (sandbox is null) { return; }
        ScriptCompilationCheck check;
        try { check = sandbox.Check(scripts); }
        catch (InvalidOperationException) { return; }
        if (check.Success) { return; }
        throw new InvalidOperationException($"Version {Snapshot.Version} does not compile: "
            + string.Join("; ", check.Errors.Select(error => $"{error.File}:{error.Line} {error.Message}")));
    }
```

Add `using Microsoft.Extensions.DependencyInjection;` to the file.

In `Export`, replace

```csharp
        if (!Snapshot.Verified.TryGetValue(Snapshot.Version, out var green) || !green)
        { throw new InvalidOperationException($"Version {Snapshot.Version} has not passed its tests; only green versions can be shared."); }
```

with

```csharp
        RequireCompiles();
```

In `Publish`, replace the same two lines (the ones ending in `only green versions can be published.`) with `RequireCompiles();`.

- [ ] **Step 4: Rewrite the facts that pinned the verdict gate**

`AppPublishFacts.cs`: delete `PublishingARedVersionIsRefused` (it asserted a red run blocks publish). Leave `GreenApp` as it is for now; Task 2 strips its `RecordVerdicts` call.

`AppSharingFacts.cs`: delete `ExportingARedVersionIsRefused`, `ExportingBeforeAnyVerificationIsRefused` and `AVersionSavedAfterTheGreenRunCannotRideThatVerdict`. Change the class comment to `// The share gate: what leaves a brain compiles and carries no credentials.`

`AppNeuronFacts.cs`: in `ExportRefusesUnverifiedVersionsAndStripsConnections`, rename to `ExportStripsConnectionsAndPrivateSettings` and delete the two lines

```csharp
        await Assert.ThrowsAsync<InvalidOperationException>(app.Export);
        var current = await app.Read();
```

and the `RecordVerdicts` line, keeping the version assertion as

```csharp
        var bundle = await app.Export();
        Assert.Equal((await app.Read()).Version, bundle.Version);
```

Delete `VerdictsRecordedForAnOlderVersionDoNotMarkTheCurrentOneGreen` (it only tested the old gate).

- [ ] **Step 5: Build and run the Apps suite**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```

Expected: build clean, all facts pass, including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps
git commit -m "Apps: the publish gate is compilation, not test verdicts"
```

---

### Task 2: Every consumer stops verifying

**Files:**
- Modify: `DigitalBrain.Modules.Apps/Shipping/ShippedAppPublisher.cs`, `Shipping/IShippedAppSource.cs`, `Shipping/EmbeddedShippedAppSource.cs`, `Shipping/DirectoryShippedAppSource.cs`
- Modify: `DigitalBrain.Modules.Apps/AppsEndpoints.cs` (remove `/verify`, lines 76-81; comment line 10-11)
- Modify: `DigitalBrain.Modules.Apps/Apps/Creator.cs` (lines 83-84), `Authoring/AgentPrompts.cs`, `Authoring/BuilderTools.cs` (the `check_csharp` description), `Authoring/AppAuthoringPolicy.cs`
- Modify: `DigitalBrain.Modules.Apps/Apps/AppNeuron.cs` (`CompleteBuild`, `Publish` listing)
- Modify: Apps tests `ShippedAppPublisherFacts.cs`, `ShippedAppSyncFacts.cs`, `AppCreatorFacts.cs`, `AppRouteFacts.cs`, `AppInstallerFacts.cs`, `AppPublishFacts.cs`, `MarketplaceRouteFacts.cs`, `AppSharingFacts.cs`, `AppNeuronFacts.cs`, `AppOriginFacts.cs`, `DirectoryShippedAppSourceFacts.cs`, `Runtimes/DeployableRuntimeFacts.cs`, `Runtimes/StorageHookFacts.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs`, `OsAssistantAppFacts.cs`, `VendorAppFacts.cs`, `OsShippedAppFacts.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ShippedAppVerificationFacts.cs` → rename to `ShippedSynapseFacts.cs`; `ProductE2E.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/AgentToolSelectionFacts.cs:26`, `InventoryFacts.cs:36`, `RegistryDiscoveryFacts.cs:59`
- Delete: `src/DigitalBrain.OS/Apps/Assistant/tests.cs`, `src/DigitalBrain.OS/Apps/Settings/tests.cs`, `src/IntoChat/Apps/CustomerResearcher/tests.cs`, `src/IntoChat/Apps/CustomerResearcher/app.authoring.json`, `src/IntoChat/Apps/WordCount/tests.cs`

**Interfaces:**
- Consumes: Task 1's `RequireCompiles` through `Publish`.
- Produces: `ShippedAppPublisher(IGrainFactory, IEnumerable<IShippedAppSource>, IConfiguration, ILogger<ShippedAppPublisher>)` (no runner); `IShippedAppSource` without `VerifiedByBuild`; `MarketplaceListing` still has `Scenarios` but it is always `[]` (deleted in Task 3).

- [ ] **Step 1: Write the failing shipping fact**

Rewrite `ShippedAppPublisherFacts.cs`. Keep `Register`, `Ship`, `RecordingContent`, `FixedPublishers`, `PublisherServices`, `StartedLifetime` and the two platform-stamping facts unchanged except where noted. Replace everything else with:

```csharp
    [Fact]
    public async Task ABundleImportsOnceAndABumpedVersionReimports()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var first = await Register(brain, "first", ct);
        var versions = new Dictionary<string, string> { ["first"] = "1.0.0" };
        IShippedAppSource[] sources = [new Source("first", versions)];

        await Ship(brain, sources, "false", ct);
        var app = brain.Get<IApp>(IApp.Key(first.ScopeId, "echo"));
        Assert.Equal(AppStatus.Drafted, (await app.Read()).Status);

        await Ship(brain, sources, "true", ct);
        var imported = await app.Read();
        Assert.Equal(AppStatus.Live, imported.Status);
        Assert.Equal("1.0.0", imported.Version);
        Assert.Equal("1.0.0", imported.PublishedVersion);
        Assert.Equal("1.0.0", (await app.Export()).Version);

        var before = (await app.Read()).Versions.Length;
        await Ship(brain, sources, "true", ct);
        Assert.Equal(before, (await app.Read()).Versions.Length);

        versions["first"] = "1.1.0";
        await Ship(brain, sources, "true", ct);
        Assert.Equal("1.1.0", (await app.Read()).Version);
    }

    [Fact]
    public async Task ABundleTheGateRefusesStaysOutAndTheOthersStillShip()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IScriptSandbox>(new BrokenEchoSandbox()))
            .StartAsync(ct);
        var first = await Register(brain, "first", ct);
        var red = await Register(brain, "red", ct);
        var versions = new Dictionary<string, string> { ["first"] = "1.0.0", ["red"] = "1.0.0" };

        var publisher = await Ship(brain, [new Source("red", versions, behavior: "// broken"), new Source("first", versions)], "true", ct);

        Assert.True(publisher.ExecuteTask!.IsCompletedSuccessfully);
        Assert.Equal(AppStatus.Live, (await brain.Get<IApp>(IApp.Key(first.ScopeId, "echo")).Read()).Status);
        // Import landed the files but Publish refused; the next startup retries the same bundle.
        Assert.Null((await brain.Get<IApp>(IApp.Key(red.ScopeId, "echo")).Read()).PublishedVersion);
    }

    [Fact]
    public async Task AnUnparsableBundleFailsThatPackageWithoutStoppingThePublisher()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var first = await Register(brain, "first", ct);

        var publisher = await Ship(brain, [new Source("first", new() { ["first"] = "not-a-version" })], "true", ct);

        Assert.True(publisher.ExecuteTask!.IsCompletedSuccessfully);
        Assert.Equal(AppStatus.Drafted, (await brain.Get<IApp>(IApp.Key(first.ScopeId, "echo")).Read()).Status);
    }
```

Replace `Source` with:

```csharp
    internal sealed class Source(string account, Dictionary<string, string> versions, string behavior = "// echo", string spec = "Echoes.") : IShippedAppSource
    {
        public string Account => account;
        public bool Writable => false;
        public void Write(AppBundle bundle) => throw new NotSupportedException();
        public IReadOnlyList<AppBundle> Load() =>
        [new("echo", versions[account], new("Echo", "Echo input", [new("ask", "Echo")], [], []),
            spec, new() { ["synapses/echo.cs"] = behavior })];
    }

    // Refuses exactly the broken behavior and accepts everything else.
    private sealed class BrokenEchoSandbox : IScriptSandbox
    {
        public bool CanRun => true;
        public string AuthoringDescription => "";
        public Task<ScriptContractCatalog> ReadContracts(IReadOnlyList<string> modules, CancellationToken cancellationToken)
            => Task.FromResult(new ScriptContractCatalog([], [], ""));
        public ScriptCompilationCheck Check(IReadOnlyDictionary<string, string> files)
            => files.Values.Any(source => source.Contains("broken", StringComparison.Ordinal))
                ? new(false, [new("synapses/echo.cs", "CS1002", 1, "; expected")])
                : new(true, []);
    }
```

Change `Ship` so it no longer resolves a runner:

```csharp
        var content = new ShippedAppPublisher(
            brain.SiloServices.GetRequiredService<IGrainFactory>(),
            sources, new ConfigurationBuilder().AddInMemoryCollection(
                new Dictionary<string, string?> { [ShippedAppPublisher.ShipOnStartupKey] = selection }).Build(),
            NullLogger<ShippedAppPublisher>.Instance);
```

Delete `EdgeLikeRunner`, `CancelledRunner`, `TheTestsScriptMayDriveItsScratchCopyInThePublishersBrain`, `ADownstreamCancellationFailsThePackageWithoutStoppingThePublisher`, `ABundleVerifiedByTheBuildGoesLiveWithoutRunningItsTests`, `ABundleVerifiedByTheBuildGoesLiveWithoutAnyScenario`. Update the class comment to: `// Shipped apps are bundles the host imports at startup into their publisher account's own brain: a bundle that imports and publishes lands as a live app there, and an unchanged version is a no-op.`

- [ ] **Step 2: Run the shipping facts and watch them fail to compile**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*ShippedAppPublisherFacts*"
```

Expected: compile error, `ShippedAppPublisher` still takes an `ITestScriptRunner` and `Source` lacks `VerifiedByBuild`.

- [ ] **Step 3: Strip verification from shipping**

`IShippedAppSource.cs`: delete the `VerifiedByBuild` property and its comment. New file body:

```csharp
namespace DigitalBrain.Apps;

// Shipped apps are ordinary share bundles the host imports at startup into the publisher
// account's own brain.
public interface IShippedAppSource
{
    string Account { get; }
    // Development folders accept the publisher's published versions back.
    bool Writable { get; }
    IReadOnlyList<AppBundle> Load();
    void Write(AppBundle bundle);
}
```

`EmbeddedShippedAppSource.cs`: delete `public bool VerifiedByBuild => true;`. `DirectoryShippedAppSource.cs`: delete `public bool VerifiedByBuild => false;`.

`ShippedAppPublisher.cs`: constructor becomes `(IGrainFactory grains, IEnumerable<IShippedAppSource> sources, IConfiguration configuration, ILogger<ShippedAppPublisher> logger)`. Class comment becomes `// Brings every shipped bundle into its publisher's brain at startup: import it, publish it, skip it when the installed version already matches. A bundle Publish refuses stays out and says why in the log.` Delete the comment above `ShipOnStartupKey` that starts "Verifying a shipped app runs real sandbox scripts" and replace with `// A test host declares what ships: "true" (default) everything, "false" nothing, a comma-separated list of app names only those.` In `Ship`, replace from `var (verdicts, green) = ...` through `await app.RecordVerdicts(verdicts, green: true, bundle.Version);` with:

```csharp
        // Replace keeps the publisher brain's settings, connections and stored data.
        if (installed.Manifest.Title.Length > 0) { await app.Replace(bundle); }
        else { await app.Import(bundle); }
```

Keep `await app.Publish();`. Delete the `ByBuild` method.

`AppsModule.cs`: delete `silo.Services.TryAddSingleton<ITestScriptRunner, CSharpFileTestRunner>();`.

- [ ] **Step 4: Remove the verify route and the Builder's test demand**

`AppsEndpoints.cs`: delete the `apps.MapPost("/{name}/verify", ...)` block (lines 76-81). Change the class comment to `// The whole apps surface, one screenful: create and author are synchronous (one model call); implement answers 202 and finishes in the background; sharing is export/import.`

`Creator.cs`: delete the two lines

```csharp
            if (!files.ContainsKey(AppFiles.TestsPath) && !snapshot.Files.ContainsKey(AppFiles.TestsPath))
            { await app.CompleteBuild(attempt, null, $"the implementation must include {AppFiles.TestsPath}, the scenarios' proof"); return; }
```

`AppNeuron.CompleteBuild`: replace `var firstTests = files.ContainsKey(AppFiles.TestsPath) && !next.Files.ContainsKey(AppFiles.TestsPath);` with `var firstBuild = Snapshot.Files.Count == 0;` and `next.Version = Bump(next.Version, minor: firstTests);` with `next.Version = Bump(next.Version, minor: firstBuild);`. In `Publish`, replace `AppVerifyJob.ScenarioNames(next.Spec)` with `[]` (the listing's scenarios die in Task 3).

`AppAuthoringPolicy.cs`: `SandboxMissing` becomes `"This host has no C# sandbox, and an app's behaviors run as scripts in one. Compose CSharpModule where the brain can run scripts."`.

`BuilderTools.cs`: the `check_csharp` description becomes `"Compile the given C# files (path to full source, for example synapses/notify.cs) without running them. Returns the compile errors; fix them all before answering."`.

`AgentPrompts.cs`, replace `Author` with:

```csharp
    public const string Author = """
        You are the Author. You turn what a person wants an app to do into its specification: plain
        language the person reads as the definition of the app. The Builder writes C# behaviors from it.

        Rules:
        - Write the spec as Markdown. Start with one short paragraph saying what the app does, then one
          short section per behavior: what triggers it (When), what it does (Then), and what must be true
          afterwards. Readable prose, not a parser grammar.
        - Keep each behavior small: one trigger, one outcome.
        - Extract the things a person would want to change without changing logic — model choices, names or
          accounts to watch, keywords, limits — into settings, and refer to them by setting name. Settings
          are not edits: an installed copy changed only through its settings keeps receiving the
          publisher's updates.
        - The app has one operation, "ask", unless the spec clearly needs more.
        - Model settings take this brain's model names, such as "IGpt56Luna" or "IGemma4".

        Reply with JSON only, no prose and no code fences:
        {"name": "lowercase-words-with-hyphens", "title": "Short title", "description": "One sentence for people.",
         "operations": [{"name": "ask", "description": "What it answers."}],
         "settings": [{"name": "Model", "description": "Who answers.", "default": "IGemma4"}],
         "slots": [{"name": "gmail", "connector": "gmail"}],
         "spec": "...full Markdown spec..."}
        Slots are the external accounts the app needs (empty for most apps); the person binds their
        own connection to each slot after install — never put account details in settings.
        """;
```

Replace `Builder` with:

```csharp
    public const string Builder = """
        You are the Builder. You receive an app's specification (plain-language behaviors) and write the
        implementation: one small C# script per behavior under "synapses/". You never change the spec.

        You have tools; use them instead of guessing:
        - search_contracts finds neuron contracts by what they do ("schedule a timer", "post a tweet").
        - read_contracts reads a module's full contracts: interfaces, methods, signals and the #:project
          directive a C# file needs. Pass modules=[] to list the installed module ids.
        - check_csharp compiles your C# files without running them. Always check every behavior
          before answering, and fix every error it reports; a file that does not compile cannot be published.

        Keep each behavior a screen or less: one trigger, one reaction. For C# behavior scripts,
        app.Invocations(brain, brain.Stopping) subscribes before recovering pending invocations. Handle
        only the operations belonging to that behavior, then app.Respond(...). UI button signals should
        invoke the same app operation as assistant tools, not duplicate logic. Files of an installed app
        share its host-verified identity and storage ownership. Never derive authority from a setting.
        The app under construction is named by brain.Setting("App"). Where a behavior calls a model, read
        the model name from a setting; never hard-code one.

        Every setting a behavior reads must be declared. Setting names are letters and digits.
        If an earlier attempt failed, its errors are listed: fix the implementation.

        Your final reply is JSON only, no prose and no code fences. Return operations as
        [{"name":"operation","description":"What it does"}] when the app has operations beyond ask.
        {"settings": [{"name": "Model", "description": "...", "default": "IGemma4"}],
         "files": {"synapses/notify.cs": "..."}}
        """;
```

- [ ] **Step 5: Rewrite the Apps facts that used tests.cs, verdicts or the verify route**

`AppCreatorFacts.cs`:
- `Built(...)` becomes `files = new Dictionary<string, string> { ["synapses/shout.cs"] = testsMarker, ["prompts/system.md"] = systemPrompt }` and the parameter is renamed `behaviorMarker`.
- Every `live.Files["tests.cs"]` / `(await app.Read()).Files["tests.cs"]` becomes `["synapses/shout.cs"]`.
- Delete `ABuilderReplyWithoutTestsFailsTheBuildWithTheReasonInActivity`.
- In the two scripted-JSON facts, `["tests.cs"] = "// t"` becomes `["synapses/shout.cs"] = "// t"`.
- In `ABuilderThatCallsAToolGetsItsResultAndStillImplements`, the `check_csharp` argument `"tests.cs"` becomes `"synapses/shout.cs"`.
- `StartAsync`: delete `silo.Services.AddSingleton<ITestScriptRunner>(_ => new ScriptedTestRunner());`.
- Add:

```csharp
    [Fact]
    public void TheBuilderIsNotAskedForTests()
    {
        Assert.DoesNotContain("tests.cs", AgentPrompts.Builder, StringComparison.Ordinal);
        Assert.DoesNotContain("dbtest", AgentPrompts.Builder, StringComparison.Ordinal);
        Assert.DoesNotContain("## Scenario", AgentPrompts.Author, StringComparison.Ordinal);
    }
```

`AppRouteFacts.cs`, first fact:
- Delete the two `runner` lines and `silo.Services.AddSingleton<ITestScriptRunner>(runner);`.
- Builder script files: `["synapses/shout.cs"] = "// b"` only.
- Delete the "Verify answers 202" block (the `verifying` invoke, its assert, and `await WaitForGreen(app, ct);`). Change the next comment to `// A live version exports; the list shows the app; delete removes it.`
- Delete the `WaitForGreen` method. Rename the fact `TheAppsSurfaceCreatesImplementsExportsAndDeletes` (unchanged name is fine). Class comment: `// The whole apps surface: create is synchronous, implement answers 202 and finishes in the background, sharing rides export/import, and everything lives under the brain route.`
- Second fact `ExportOfARedAppAndImportClashesAnswer409`: rename `ImportOverAnExistingAppAnswers409`; delete the `exported` invoke and its assert; keep the clash.

`AppPublishFacts.cs`: `GreenApp` → rename `LiveApp`, delete its `RecordVerdicts` line, files become `["synapses/echo.cs"] = "// b", ["icon.svg"] = "<svg/>"`; update every caller. `PublishingListsTheGreenVersionWithItsScenariosInSpecOrderAndItsIcon` → rename `PublishingListsTheVersionAndItsIcon`, delete `Assert.Equal(["Echoes", "Quiet"], listing.Scenarios);`. In `RepublishingAGreenEditReplacesTheListing` (rename `RepublishingAnEditReplacesTheListing`) and `ASiblingBrainCannotTakeOverAListingAndTheOwnerCanStillDelete`, delete every `RecordVerdicts` line and change `["tests.cs"] = "// t"` to `["synapses/echo.cs"] = "// b"`. In the three Task 1 facts, `GreenApp` → `LiveApp`, and in `PublishingAnAppWithNoScriptsNeedsNoCompiler` delete the `RecordVerdicts` line. Class comment: `// Publish lists one version in the Marketplace; the listing belongs to the app that published it, and the published bundle stays that version while the publisher keeps editing.`

`AppSharingFacts.cs`: `LiveApp` files become `["synapses/echo.cs"] = "// b"`; delete every `RecordVerdicts` line; every `["tests.cs"] = "// t"` / `"// other"` becomes `["synapses/echo.cs"] = ...`.

`AppInstallerFacts.cs`: in `Published` and `PublishNewVersion` delete the `RecordVerdicts` lines; files become `["synapses/echo.cs"] = "// v1"`.

`MarketplaceRouteFacts.cs`: delete both `RecordVerdicts` lines, delete `Assert.Equal(["Echoes"], entry.GetProperty("listing").GetProperty("scenarios")...)`, files become `["synapses/echo.cs"] = "// v1", ["icon.svg"] = ...`; comment "ships a new green version" → "ships a new version".

`AppNeuronFacts.cs`: delete `RecordingVerdictsPublishesAppVerified`; `["tests.cs"] = "// stale"` → `["synapses/echo.cs"] = "// stale"` and the assertion `Assert.False(ignored.Files.ContainsKey("synapses/echo.cs"));`; `"round 1: compile-checking tests.cs"` → `"round 1: compile-checking synapses/echo.cs"` (both lines); in `CompleteBuildWithFilesGoesLiveAndWithErrorGoesFailed` and `ImportMaterializesABundleAndRefusesANameClash` drop the `tests.cs` entry and its assertion; `["tests.cs"] = "// t", [AppFiles.SpecPath] = "hijacked"` → `["synapses/echo.cs"] = "// b", [AppFiles.SpecPath] = "hijacked"`. Add one fact pinning decision 5:

```csharp
    [Fact]
    public async Task TheFirstBuildBumpsMinorAndLaterBuildsBumpPatch()
    {
        await using var brain = await Start();
        var app = brain.Get<IApp>(IApp.Key(Brain, "bumps"));
        await app.Create(Manifest(), "spec");
        await app.BeginBuild(null);
        var first = await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["synapses/a.cs"] = "// a" }, null);
        Assert.Equal("0.2.0", first.Version);
        await app.BeginBuild(null);
        var second = await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["synapses/b.cs"] = "// b" }, null);
        Assert.Equal("0.2.1", second.Version);
    }
```

`AppOriginFacts.cs:20`, `Runtimes/DeployableRuntimeFacts.cs:52,80`, `Runtimes/StorageHookFacts.cs:40,68,73,102`: drop the `["tests.cs"] = "// t"` entry from each dictionary (every one already has a synapse or icon beside it except `StorageHookFacts.cs:102`, which becomes `new() { ["notes.md"] = "// t" }`).

`ShippedAppSyncFacts.cs`: `StartAsync` becomes `ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct)`; `Bundle` files become `new() { ["synapses/echo.cs"] = behavior }` and the spec `$"Echo: {behavior}\n"`; in `PublishEdit`, `SaveSpec($"Echo: {behavior}\n", ...)` and delete the `RecordVerdicts` line and the `var version` line; comment `// An edit in the brain, published, as the publisher would do in the shell.` Check the file's other `Bundle(...)`/spec string sites (lines 1-140) with the same replacement; the content-comparison facts compare whatever is written, so they hold.

`DirectoryShippedAppSourceFacts.cs`: `Write("Echo/tests.cs", "// tests\n");` → delete; `new() { [AppFiles.TestsPath] = "// t\n" }` → `new() { ["synapses/finds.cs"] = "// t\n" }`.

Delete `tests/DigitalBrain.Modules.Apps.Tests/ScriptedTestRunner.cs` and `tests/DigitalBrain.Modules.Apps.Tests/Apps/AppVerifyFacts.cs`.

- [ ] **Step 6: Build and run the Apps suite**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```

Expected: clean build; every fact green. If `AppCreatorFacts.ImplementReturnsBuildingImmediately...` reports `0.1.1` instead of `0.2.0`, decision 5's `firstBuild` is wrong: `Create` must leave `Files` empty (it does today).

- [ ] **Step 7: OS, Assistant and E2E consumers**

`src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs`: delete line 40 (`await source.RecordVerdicts(...)`) and line 165; line 164's dictionary becomes `new() { ["synapses/hello.cs"] = "// b" }`; comment line 155 becomes `// The os account's copy: created, built and published. Building plays the`.

`OsAssistantAppFacts.cs`: rename the fact `TheShippedAssistantDeclaresItsOperationsIconAndSynapses`; delete the `scenarios` lines (18-21).

`VendorAppFacts.cs`: comment line 5 → `// Shipped bundles are ordinary packages: they compile against platform contracts and ship as-is.`; rename `EveryShippedProgramAndTestsFileCompilesAgainstCurrentContracts` → `EveryShippedProgramCompilesAgainstCurrentContracts`; `EveryShippedAppCarriesSpecAndTests` → `EveryShippedAppCarriesASpec` with only the spec assertion. In `TheResearcherPackageUsesOnlyPlatformContracts`, the comment "so its tests verify on a host" → "so it runs on a host".

`OsShippedAppFacts.cs`: rename `EveryOsProgramAndTestsFileCompilesAgainstCurrentContracts` → `EveryOsProgramCompilesAgainstCurrentContracts`.

`src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/ShippedAppVerificationFacts.cs`: `git mv` to `ShippedSynapseFacts.cs`, class `ShippedSynapseFacts`, delete `EveryOsAppPassesItsTestsInTheSandbox`, keep `EveryShippedSynapseIsAliveAndReadsAsASynapse` and `RepositoryRoot`; class comment `// The OS's own apps run in the real sandbox against real contracts. Needs a Docker daemon with Linux containers.`; in the inner comment replace "the sibling fact polls verdicts the same way" with "poll until it is".

`ProductE2E.cs`: delete lines 30-35 (the verdict check) so the loop only waits for `Live`; comment line 22-23 stays.

Assistant tests: `AgentToolSelectionFacts.cs:26`, `InventoryFacts.cs:36`, `RegistryDiscoveryFacts.cs:59`: `new() { ["tests.cs"] = "// t" }` → `new() { ["synapses/app.cs"] = "// b" }`.

Bundles: delete `src/DigitalBrain.OS/Apps/Assistant/tests.cs`, `src/DigitalBrain.OS/Apps/Settings/tests.cs`, `src/IntoChat/Apps/CustomerResearcher/tests.cs`, `src/IntoChat/Apps/CustomerResearcher/app.authoring.json`, `src/IntoChat/Apps/WordCount/tests.cs`. (`app.authoring.json` has no reader; confirmed by text search of the Apps module for `authoring.json`.)

- [ ] **Step 8: Build and test every touched project**

```bash
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj
```

Expected: all green. The E2E project only needs to compile here; its Docker-gated facts run in Task 5.

- [ ] **Step 9: Commit**

```bash
git add -A src/DigitalBrain.Modules/DigitalBrain/Apps src/DigitalBrain.OS src/IntoChat src/DigitalBrain.Modules/DigitalBrain/Assistant/tests
git commit -m "Apps: nothing runs tests any more; shipping imports and publishes, the Builder writes behaviors only"
```

---

### Task 3: Delete the verification API, state and wire fields, with the shell

**Files:**
- Delete: `DigitalBrain.Modules.Apps.Contracts/Verification/AppTestRun.cs`, `DigitalBrain.Modules.Apps.Contracts/Signals/AppVerified.cs`, `DigitalBrain.Modules.Apps/Apps/AppVerifyJob.cs`, `DigitalBrain.Modules.Apps/Verification/TestScriptRunner.cs`
- Modify: `DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs`, `AppSnapshot.cs`, `AppFiles.cs`, `AppBundle.cs`, `Marketplace/MarketplaceListing.cs`
- Modify: `DigitalBrain.Modules.Apps/Apps/AppState.cs`, `AppNeuron.cs`, `AppsEndpoints.cs` (`View`)
- Modify: Apps tests `AppPublishFacts.cs` (the forged listing), Dart files listed above

**Interfaces:**
- Produces: `IApp` without `BeginVerify`/`RecordVerdicts`; `AppSnapshot(Name, Manifest, Spec, Files, Settings, Connections, Version, Status, Activity, Versions, PublishedVersion, Origin, Edited)`; `AppVersionSummary(Version, SavedAt)`; `MarketplaceListing` without `Scenarios`; `AppFiles` without `TestsPath`/`VerifyMarker`; wire JSON of `GET /brains/{id}/apps/{name}` without `verdicts`, versions without `green`; listing JSON without `scenarios`.

- [ ] **Step 1: Confirm nothing references the symbols being deleted**

Use LSP `findReferences` on each of: `AppScenarioVerdict`, `AppTestRun`, `AppVerified`, `ITestScriptRunner`, `CSharpFileTestRunner`, `AppVerifyJob`, `IApp.BeginVerify`, `IApp.RecordVerdicts`, `AppState.Verdicts`, `AppState.Verified`, `AppSnapshot.Verdicts`, `AppVersionSummary.Green`, `MarketplaceListing.Scenarios`, `AppFiles.TestsPath`, `AppFiles.VerifyMarker`, `IShippedAppSource.VerifiedByBuild`. Expected after Task 2: only declarations, `AppNeuron` internals, `AppsEndpoints.View`, `MarketplaceNeuron`/`Publish` listing construction, the forged listing in `AppPublishFacts.TheMarketplaceRefusesWritesFromAnythingButTheOwningApp`, and `AppVerifyFacts` (already deleted). Anything else is a Task 2 miss: fix it there first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Verification/AppTestRun.cs
git rm src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppVerified.cs
git rm src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppVerifyJob.cs
git rm src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Verification/TestScriptRunner.cs
```

- [ ] **Step 3: Contracts**

`IApp.cs`: delete `BeginVerify` and `RecordVerdicts` with their comments; the `Publish` comment becomes `// Publishes the current version once its scripts compile: it becomes the Marketplace listing and the bundle every Install copies, until the next Publish.`

`AppSnapshot.cs`:

```csharp
namespace DigitalBrain.Apps;

public enum AppStatus { Drafted, Building, Live, Failed }

[GenerateSerializer, Alias("apps.version")]
public sealed record AppVersionSummary(
    [property: Id(0)] string Version,
    [property: Id(1)] DateTimeOffset SavedAt);

[GenerateSerializer, Alias("apps.snapshot2")]
public sealed record AppSnapshot(
    [property: Id(0)] string Name,
    [property: Id(1)] AppManifest Manifest,
    [property: Id(2)] string Spec,
    [property: Id(3)] Dictionary<string, string> Files,
    [property: Id(4)] Dictionary<string, string> Settings,
    [property: Id(5)] Dictionary<string, string> Connections,
    [property: Id(6)] string Version,
    [property: Id(7)] AppStatus Status,
    [property: Id(8)] string[] Activity,
    [property: Id(9)] AppVersionSummary[] Versions,
    [property: Id(10)] string? PublishedVersion = null,
    [property: Id(11)] AppOrigin? Origin = null,
    [property: Id(12)] bool Edited = false);
```

`AppFiles.cs`:

```csharp
namespace DigitalBrain.Apps;

public static class AppFiles
{
    public const string Runtime = "csharp";
    public const string SpecPath = "app.spec.md";
    public const string SynapsesPrefix = "synapses/";

    public static bool IsSynapse(string path)
        => path.StartsWith(SynapsesPrefix, StringComparison.Ordinal) && path.EndsWith(".cs", StringComparison.Ordinal);
}
```

`AppBundle.cs` comment: `// The share format: a published version's content. No connections, settings as defaults only.`

`MarketplaceListing.cs`: delete `[property: Id(8)] string[] Scenarios` and the trailing comma on `Icon`.

- [ ] **Step 4: State and neuron**

`AppState.cs`: delete `Verdicts` and `Verified` and their two lines in `Clone()`; renumber `[Id(n)]` contiguously from 0 (`BuildAttempt` becomes `Id(9)` and so on through `Publisher` at `Id(22)`).

`AppNeuron.cs`:
- Delete `BeginVerify` and `RecordVerdicts` entirely.
- `Publish`: the listing construction ends `next.Version, manifest.Icon));` (drop the `[]`).
- Replace `TrackUnlessScratch` with a direct call: every `await TrackUnlessScratch();` becomes `await GrainFactory.GetGrain<IAppIndex>(BrainId()).Track(Name());` and the method and its comment are deleted.
- `Describe`: the versions line becomes `[.. state.History.Select(record => new AppVersionSummary(record.Version, record.SavedAt))],` and the `[.. state.Verdicts],` line goes.
- Class comment: `// The app: the only durable thing in the module. Manifest, spec, files, connections, semver history, status and activity all live here; the Builder is a cache that writes its results back in.`
- Delete `using DigitalBrain.Apps.Signals;` only if LSP reports it unused (it is still used by `AppChanged`).

`AppsEndpoints.View`: delete `verdicts = snapshot.Verdicts,`.

`AppPublishFacts.cs`, the forged listing: `new MarketplaceListing("intochat", "account-intochat", "intochat", "echo", "Echo", "forged", "9.9.9", null)`.

- [ ] **Step 5: Build and run the C# suites**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet build src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj
```

Expected: all clean. Flutter and Mcp reference Apps.Contracts; a build failure there is a reference the audit missed.

- [ ] **Step 6: Write the failing Dart test for the Publish button**

In `shell/test/app_screen_test.dart`, replace the test `'a green version can be published, a red one cannot'` with:

```dart
  testWidgets('a live version can be published once', (tester) async {
    String? published;
    final calls = <String>[];
    Future<dynamic> request(String method, String path, [Object? body]) async {
      calls.add('$method $path');
      if (method == 'POST' && path.endsWith('/publish')) {
        published = '1.0.0';
        return {'publishedVersion': published};
      }
      return {
        'name': 'shouter',
        'manifest': {'title': 'Shouter', 'description': 'Shouts back.'},
        'spec': 'Shouts back.',
        'version': '1.0.0',
        'status': 'Live',
        'activity': <String>[],
        'versions': [
          {'version': '1.0.0', 'savedAt': '2026-10-05T00:00:00Z'},
        ],
        'publishedVersion': published,
      };
    }

    Future<void> show() async {
      await tester.pumpWidget(
        MaterialApp(
          home: AppScreen(
            key: UniqueKey(),
            workspaceId: 'workspace-alice',
            request: request,
            name: 'shouter',
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await show();
    await tester.tap(find.byKey(const ValueKey('publish-app')));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /brains/workspace-alice/apps/shouter/publish'));
    expect(find.text('Published v1.0.0'), findsOneWidget);
    // Already published at this version: nothing more to publish.
    expect(find.byKey(const ValueKey('publish-app')), findsNothing);
  });
```

In the first test, delete the four lines from `await tester.tap(find.byKey(const ValueKey('run-scenarios')));` through `expect(find.byKey(const ValueKey('verdict-It shouts')), findsOneWidget);`, rename it `'creates a live app: author, background implement'`. In `_FakeCreatorServer`, delete `_verified`, the `'verdicts'` entry and the `/verify` branch.

In `shell/test/app_detail_screen_test.dart`, delete the `'scenarios'` entry from `_listingJson` and the `'verdicts'` entry from `_app`; in the test `'an installed copy offers its update and shows verdicts'` rename to `'an installed copy offers its update'` and delete the `passed` lookup and its `expect`.

- [ ] **Step 7: Run the Dart tests and watch the new one fail**

```bash
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter test test/app_screen_test.dart test/app_detail_screen_test.dart
```

Expected: `'a live version can be published once'` fails (no `publish-app` key, `_green` reads a `green` field that no longer exists).

- [ ] **Step 8: Change the shell**

`shell/lib/workspace/apps/app_screen.dart`:
- Header comment: `// The Creator: describe the app and it exists — Drafted, in this brain — then iterate. Implement answers immediately and runs in the background; the screen follows the app's status and activity feed. A live version can be published to the Marketplace.`
- Delete `_verify` and `_green`.
- Delete the `verdicts` local in `build` and the whole `if (verdicts.isNotEmpty) ...[ ... ]` block.
- Delete the `FilledButton.tonal(key: const ValueKey('run-scenarios'), ...)` widget.
- The Publish condition becomes `if (app['status'] == 'Live' && app['publishedVersion'] != app['version'])`.

`shell/lib/workspace/home/app_detail_screen.dart`:
- Header comment line 10: replace "the scenarios its tests pin," with nothing (keep the rest of the sentence grammatical).
- Delete the `verdicts` local and the block from `const SizedBox(height: 24), Text('Scenarios', ...)` through the closing of the `for (final scenario in listing?.scenarios ...)` loop.

`core/lib/src/models/marketplace.dart`: delete `required this.scenarios,`, `final List<String> scenarios;` and the `scenarios: List.unmodifiable([...])` block.

`core/lib/src/ui_client.dart:899`: comment becomes `// apps surface (implement) answers immediately with 202.`

- [ ] **Step 9: Analyze and test the shell**

```bash
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter analyze && flutter test
cd ../ui && flutter analyze
cd ../core && dart analyze
```

Expected: no issues; every shell test green, including the rewritten two.

- [ ] **Step 10: Commit**

```bash
git add -A src/DigitalBrain.Modules/DigitalBrain/Apps src/DigitalBrain.Modules/Google/Flutter/app
git commit -m "Apps: delete verdicts, verification and tests.cs from contracts, state, wire and shell"
```

---

### Task 4: Docs, comments, dead references

**Files:**
- Modify: `CLAUDE.md` (lines 74-90)
- Modify: `C:\Users\vhorb\.claude\projects\E--intochat-digitalbrain\memory\behaviors-ultra-small-no-app-tests.md`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppsServiceCollectionExtensions.cs` (comment only)

- [ ] **Step 1: CLAUDE.md**

Replace the bundle block and the two bullets with:

```
app.json         manifest: title, icon, operations, settings, account slots
app.spec.md      the program in natural language
synapses/*.cs    implementation, one small script per reaction → one ICSharpFile each
```

- **Spec is the program, the LLM is a compiler.** The Creator (`Apps/Creator.cs`,
  `Apps/Authoring/AgentPrompts.cs`) writes the spec, then the behaviors. There is no model at
  runtime. **The type system is the grammar:** a behavior is expressible exactly when it compiles
  against the installed contracts.
- **Compilation is the publish gate.** `IApp.Publish`/Export refuse a bundle whose `.cs` files do
  not compile (`IScriptSandbox.Check`). There are no per-app tests; verification is seeing the app
  run through `aspire run` and `digitalbrain-mcp`.

Also change "and are verified and published at startup" (last bullet of the section) to "and are published at startup".

- [ ] **Step 2: Memory note**

Rewrite `behaviors-ultra-small-no-app-tests.md`'s "How to apply" paragraph to say the removal landed on 2026-10-07 in this plan, the gate is compile-only, and CLAUDE.md is current. Keep the frontmatter.

- [ ] **Step 3: Dead references**

In `DigitalBrain.Modules.Apps.csproj`, remove `<PackageReference Include="Microsoft.CodeAnalysis.CSharp.Workspaces" />` and the `Postgres.Contracts` `ProjectReference`, then build. If the build fails, the reference was live: put it back and note it in the commit message.

`ShippedAppsServiceCollectionExtensions.cs`: no code change; confirm no comment mentions verification.

- [ ] **Step 4: Sweep for leftover vocabulary**

```bash
grep -rn -i 'verdict\|dbtest\|tests\.cs\|TestsPath\|VerifyMarker\|BeginVerify\|RecordVerdicts\|AppVerified\|VerifiedByBuild\|ScenarioNames' src CLAUDE.md --include='*.cs' --include='*.dart' --include='*.md' --include='*.json' | grep -v '/obj/\|/bin/\|docs/superpowers'
```

Expected: no output. Every hit is a miss in Tasks 2 or 3.

- [ ] **Step 5: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
git add CLAUDE.md src/DigitalBrain.Modules/DigitalBrain/Apps
git commit -m "Apps: CLAUDE.md says compile is the gate; drop dead references"
```

---

### Task 5: Seen running

**Files:** none changed.

- [ ] **Step 1: Start the host**

```bash
cd src/DigitalBrain.AppHost && aspire run
```

Then `mcp__aspire__list_resources`: every resource Running/Healthy. If the OS resource is unhealthy, `list_console_logs` for it first: the `os-defaults` health check waits for `os/settings`, `os/assistant` and `os/datavisualizer` to be published, and a compile refusal in `ShippedAppPublisher` now shows up there as a warning naming the file and line.

- [ ] **Step 2: Drive it through digitalbrain-mcp**

Through `localhost:5081/mcp`:
1. `neurons_context` to confirm the brain.
2. `neurons_search` for `IApp`; `neurons_get` the `os` publisher's `settings` app: `PublishedVersion` is set, `Versions` entries carry no `Green`, the snapshot carries no `Verdicts`.
3. `neurons_call` `IApp.Create` on a scratch app in the current brain with manifest `{Title:"Broken"}` and spec `"Breaks."`; `BeginBuild`; `CompleteBuild` with `{"synapses/broken.cs": "int wrong = \"text\";"}`; then `Publish`. Expected: refusal whose message contains `synapses/broken.cs:1`.
4. `neurons_call` `IApp.WriteBehavior` with a compiling script (`Console.WriteLine("ok");` is enough for the compile check) and `Publish` again. Expected: `PublishedVersion` equals `Version`.
5. `GET /brains/{brainId}/apps/{name}` through the HTTP edge: no `verdicts` key, versions without `green`.

- [ ] **Step 3: Telemetry**

`mcp__aspire__list_traces`: a trace for the `Publish` call on the scratch app; `list_trace_structured_logs` on the refused publish shows the `InvalidOperationException` with the diagnostic text. `list_structured_logs` for `ShippedAppPublisher` shows one `Shipping` line per bundle and no `verification` wording.

- [ ] **Step 4: Regression net**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*ShippedSynapseFacts*"
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter test
```

Expected: all green. The E2E fact needs Docker with Linux containers; if Docker is absent, say so in the final report rather than skipping silently.

- [ ] **Step 5: Delete the scratch app and stop**

`neurons_call` `IApp.Delete` on the scratch app, then stop `aspire run`.
