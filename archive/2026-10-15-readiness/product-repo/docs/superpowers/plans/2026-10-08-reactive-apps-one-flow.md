# Reactive Apps, One Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app invocation pipeline and the per-file deploy ledgers with one signal (`AppRequested`) and one program assignment per app, so every app behavior is a single `await foreach` over `brain.On<T>` and nothing on the server ever waits for a script.

**Architecture:** The brain runtime grain (`BrainRuntimeNeuron`, one per brain) gains a public contract `IBrainPrograms` that compiles, stores and assigns a whole program (all synapses of one owner) in one call. The Apps module deploys through a one-method seam `IAppRuntime` and publishes `AppRequested` from `IApp.Request`; the shell, agents and other apps publish requests and read neurons. The sandbox wire protocol, the Orleans observer path, the per-subscription buffers and `IDigitalBrain` do not change.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains, Roslyn (`CSharpScriptCheck`), ASP.NET minimal APIs, xunit v3 facts over `ModuleTest.Create().WithModule<…>()`, Flutter shell (Dart).

**Spec:** `docs/superpowers/specs/2026-10-08-reactive-apps-one-flow-design.md`

## Global Constraints

- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- LSP for all code work: `findReferences` on every symbol you change or delete before editing; LSP diagnostics clean before building. Never grep for code.
- Warnings are errors, nullable on, central package versions. No `/// <summary>` boilerplate; comments only for what code cannot say.
- Concrete arrays and `Dictionary` in grain state (no `IReadOnlyList` in `[GenerateSerializer]` records).
- No state compatibility: reshape grain state freely; no migrations. A local run after reshaping needs the Azurite volume wiped.
- No self-calls on non-reentrant grains; use `this.AsReference<T>()` for one-way self work.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; never raise a timeout or add polling to make a check pass.
- Script contract unchanged: `IDigitalBrain.Get/On/Self`, `DigitalBrainClient.ConnectAsync(args)`.
- Commit explicit files only (`git add <paths>`), never a directory. End commit messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Every shipped app must compile against current contracts: `OsShippedAppFacts.EveryOsProgramCompilesAgainstCurrentContracts` and `VendorAppFacts.EveryShippedProgramCompilesAgainstCurrentContracts` stay green.

## Review Focus

1. `IApp.Request` with an operation the manifest does not declare must throw `ArgumentException` (422 over HTTP), never publish. Pinned in Task 5.
2. `IBrainPrograms.Assign` with a non-compiling synapse must throw and leave the previous program running untouched (state unchanged, no `RetireEvent`, no `AssignmentEvent`). Pinned in Task 2.
3. A re-`Assign` that removes a synapse must retire exactly that behavior and drop only its subscriptions; the surviving synapse keeps its buffered signals. Pinned in Task 2.
4. A behavior that throws must be restarted by the sandbox and keep restarting; it must never be reported `Disarmed` and a `RetireEvent` for it must stop the restarts. Pinned in Task 4.
5. The shell's "open" must render the app's surface neuron `{brain}/apps/{name}/surface` without waiting for an HTTP answer body; a `Request` that returns 202 before the script runs must not show an error. Pinned in Task 11.

---

### Task 1: The compiler shares `lib/*.cs` across synapses

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpScriptCheck.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpScriptCheckFacts.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ScriptCompilation CSharpScriptCheck.Compile(IReadOnlyDictionary<string, string> files)` where every file under `lib/` is compiled into every other file's assembly and yields no assembly of its own; `ScriptCompilation.Assemblies` is keyed by the non-lib paths only. `CSharpScriptCheck.IsLibrary(string path)` is `true` for `lib/*.cs`.

- [ ] **Step 1: Write the failing facts**

Add to `CSharpScriptCheckFacts.cs`:

```csharp
[Fact]
public void ALibraryFileIsCompiledIntoEverySynapseAndYieldsNoAssembly()
{
    var result = _check.Compile(new Dictionary<string, string>
    {
        ["lib/Greeting.cs"] = "public static class Greeting { public static string Of(string name) => \"hi \" + name; }\n",
        ["synapses/a.cs"] = "Console.WriteLine(Greeting.Of(\"a\"));\n",
        ["synapses/b.cs"] = "Console.WriteLine(Greeting.Of(\"b\"));\n",
    });
    Assert.True(result.Success, string.Join("; ", result.Errors.Select(error => error.Message)));
    Assert.Equal(["synapses/a.cs", "synapses/b.cs"], result.Assemblies.Keys.Order(StringComparer.Ordinal));
}

[Fact]
public void AnErrorInALibraryFileIsReportedAgainstTheLibraryFile()
{
    var result = _check.Compile(new Dictionary<string, string>
    {
        ["lib/Broken.cs"] = "public static class Broken { int x = \"no\"; }\n",
        ["synapses/a.cs"] = "await Task.CompletedTask;\n",
    });
    Assert.False(result.Success);
    Assert.Contains(result.Errors, error => error.File == "lib/Broken.cs" && error.Id == "CS0029");
}

[Fact]
public void ALibraryAloneCompilesNothing()
    => Assert.Throws<ArgumentException>(() => _check.Compile(new Dictionary<string, string> { ["lib/Only.cs"] = "public static class Only {}\n" }));
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*LibraryFile*"`
Expected: FAIL. The first fact fails because `lib/Greeting.cs` is compiled as its own program (CS8805 or a stray assembly key); the third fails because no exception is thrown.

- [ ] **Step 3: Implement library sharing**

Replace the body of `Compile` in `CSharpScriptCheck.cs`:

```csharp
public const string LibraryPrefix = "lib/";

public static bool IsLibrary(string path)
    => path.StartsWith(LibraryPrefix, StringComparison.Ordinal) && path.EndsWith(".cs", StringComparison.Ordinal);

public ScriptCompilation Compile(IReadOnlyDictionary<string, string> files)
{
    ArgumentNullException.ThrowIfNull(files);
    var libraries = files.Where(file => IsLibrary(file.Key)).OrderBy(file => file.Key, StringComparer.Ordinal).ToArray();
    var programs = files.Where(file => !IsLibrary(file.Key)).OrderBy(file => file.Key, StringComparer.Ordinal).ToArray();
    if (programs.Length == 0) { throw new ArgumentException("Pass at least one program file to compile; lib/ files are shared, not programs.", nameof(files)); }
    var errors = new List<ScriptDiagnostic>();
    var assemblies = new Dictionary<string, CompiledBehavior>(StringComparer.Ordinal);
    var shared = libraries.Select(library =>
    {
        ArgumentNullException.ThrowIfNull(library.Value, library.Key);
        return CSharpSyntaxTree.ParseText(SourceText.From(library.Value, Encoding.UTF8), Parse, library.Key);
    }).Append(CSharpSyntaxTree.ParseText(SourceText.From(GlobalUsings, Encoding.UTF8), Parse, "GlobalUsings.cs")).ToArray();
    var reportedLibraryErrors = false;
    foreach (var (path, source) in programs)
    {
        ArgumentNullException.ThrowIfNull(source, path);
        var trees = shared.Prepend(CSharpSyntaxTree.ParseText(SourceText.From(source, Encoding.UTF8), Parse, path)).ToArray();
        var compilation = CSharpCompilation.Create("behavior", trees, References.Value, Options);
        using var assembly = new MemoryStream();
        using var symbols = new MemoryStream();
        var emitted = compilation.Emit(assembly, symbols, options: Emit);
        foreach (var diagnostic in emitted.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error))
        {
            var file = diagnostic.Location.SourceTree?.FilePath ?? path;
            // A library error shows once, not once per program that includes it.
            if (file != path) { if (reportedLibraryErrors) { continue; } }
            errors.Add(new ScriptDiagnostic(file, diagnostic.Id, diagnostic.Location.GetLineSpan().StartLinePosition.Line + 1, diagnostic.GetMessage()));
        }
        reportedLibraryErrors = true;
        if (emitted.Success)
        {
            var bytes = assembly.ToArray();
            assemblies[path] = new(bytes, symbols.ToArray(), Convert.ToHexStringLower(SHA256.HashData(bytes)));
        }
    }
    return new(errors.Count == 0, errors, errors.Count == 0 ? assemblies : new Dictionary<string, CompiledBehavior>());
}
```

Delete the old `if (files.Count == 0) throw` line (the new guard covers it) and keep the fact `AnEmptySetIsRefused` passing: an empty dictionary has zero programs.

- [ ] **Step 4: Run the whole compiler suite**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*CSharpScriptCheckFacts*"`
Expected: PASS, including `TheSameSourceCompilesToTheSameHash`.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Catalog/CSharpScriptCheck.cs src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpScriptCheckFacts.cs
git commit -m "CSharp: lib/*.cs is compiled into every synapse of a program

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The runtime grain assigns programs through `IBrainPrograms`

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/IBrainPrograms.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/BrainRuntimeSnapshot.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeState.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/IBrainRuntimeEdge.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/RuntimeEdge.cs` (the `Stamp` helper and `Identity` use)
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/BrainRuntimeNeuronFacts.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/RuntimeBrain.cs` (register `CSharpScriptCheck` so `Assign` can compile in unit brains; it already is through `CSharpModule`)

**Interfaces:**
- Consumes: `CSharpScriptCheck.Compile` from Task 1; `IBehaviorAssemblies.Put/ReadUrl`.
- Produces:

```csharp
// CSharp.Contracts/Runtime/IBrainPrograms.cs
[Alias("microsoft.csharp.programs"), DefaultGrainType("microsoft.csharp.runtime")]
public interface IBrainPrograms : IGrainWithStringKey
{
    Task<ProgramView> Assign(string owner, Dictionary<string, string> sources, Dictionary<string, string> settings);
    Task Retire(string owner);
    [Orleans.Concurrency.ReadOnly] Task<ProgramView?> Describe(string owner);
}

[GenerateSerializer, Alias("microsoft.csharp.program-view")]
public sealed record ProgramView([property: Id(0)] string Owner, [property: Id(1)] string Hash, [property: Id(2)] BehaviorView[] Behaviors);

public static class BehaviorIds
{
    // A behavior is one synapse of one owner's program: "{owner}/{path}". A standalone file's one
    // program has the empty path, so its behavior id is its own key.
    public static string For(string owner, string path) => path.Length == 0 ? owner : owner + "/" + path;
}
```

`BehaviorView` becomes `(string Id, string Hash, string Status, string? Error, CSharpSubscriptionView[] Subscriptions)` where `Status` is the last string the sandbox reported (`"Starting"` before any report, then `"Running"`, `"Exited"`, `"Stopped"`), and `Error` the last reported error. The `CSharpFileStatus` enum loses `Disarmed`; `Failures` is gone from every view.

`IBrainRuntimeEdge` loses `Assign(behavior, hash, settings, owner, appId)` and `Retire(behavior)`; keeps everything else. `BehaviorIdentity` becomes `(CallerContext? Principal, string Owner)`.

- [ ] **Step 1: Write the failing facts**

Replace the file-keyed facts in `BrainRuntimeNeuronFacts.cs` that use `Edge(brain).Assign("acc-brain/csharp/a", "hash-a", [], null, null)` with program facts. Add a helper and these facts:

```csharp
private static IBrainPrograms Programs(ModuleBrain brain) => brain.Get<IBrainPrograms>(BrainRuntimeKeys.For(Brain));

private const string Idle = "await using var brain = await DigitalBrainClient.ConnectAsync(args);\nawait Task.Delay(Timeout.Infinite, brain.Stopping);\n";

[Fact]
public async Task AssigningAProgramCompilesEverySynapseAndStartsOneSession()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeSessionHost();
    await using var brain = await RuntimeBrain.StartAsync(host, ct);

    var view = await Programs(brain).Assign("acc-brain/apps/demo",
        new() { ["synapses/a.cs"] = Idle, ["synapses/b.cs"] = Idle, ["lib/Shared.cs"] = "public static class Shared {}\n" },
        new() { ["App"] = "acc-brain/apps/demo" });

    Assert.Equal(["acc-brain/apps/demo/synapses/a.cs", "acc-brain/apps/demo/synapses/b.cs"], view.Behaviors.Select(b => b.Id));
    Assert.All(view.Behaviors, behavior => Assert.Equal("Starting", behavior.Status));
    await host.NextAsync(FakeSessionHost.IsStart, ct);
    var session = (await Runtime(brain).Inspect(ct)).SessionId!;
    var assignments = await Edge(brain).Assignments(session);
    Assert.Equal(2, assignments.Count);
    Assert.All(assignments, assignment => Assert.Equal("acc-brain/apps/demo", assignment.Settings["App"]));
}

[Fact]
public async Task AProgramThatDoesNotCompileIsRefusedAndTheRunningOneIsUntouched()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeSessionHost();
    await using var brain = await RuntimeBrain.StartAsync(host, ct);
    var before = await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle }, []);
    await host.NextAsync(FakeSessionHost.IsStart, ct);

    var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Programs(brain).Assign("acc-brain/apps/demo",
        new() { ["synapses/a.cs"] = Idle, ["synapses/b.cs"] = "int x = \"no\";\n" }, []));

    Assert.Contains("synapses/b.cs", error.Message, StringComparison.Ordinal);
    Assert.Contains("CS0029", error.Message, StringComparison.Ordinal);
    Assert.Equal(before.Hash, (await Programs(brain).Describe("acc-brain/apps/demo"))!.Hash);
    Assert.Single((await Programs(brain).Describe("acc-brain/apps/demo"))!.Behaviors);
}

[Fact]
public async Task ReassigningWithoutASynapseRetiresOnlyThatBehaviorAndKeepsTheOthersSubscriptions()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeSessionHost();
    await using var brain = await RuntimeBrain.StartAsync(host, ct);
    await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle, ["synapses/b.cs"] = Idle }, []);
    var session = (await Runtime(brain).Inspect(ct)).SessionId!;
    var source = brain.Get<IPinger>("one");
    var kept = await Edge(brain).Subscribed(session, "acc-brain/apps/demo/synapses/a.cs", source.GetGrainId().ToString(), nameof(Pinged));
    await Edge(brain).Subscribed(session, "acc-brain/apps/demo/synapses/b.cs", source.GetGrainId().ToString(), nameof(Pinged));
    await using var changes = await brain.Observe<BrainRuntimeChanged>(Runtime(brain), ct);
    await source.Ping(1); await changes.NextAsync(ct: ct);

    var view = await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle + "// v2\n" }, []);

    Assert.Equal(["acc-brain/apps/demo/synapses/a.cs"], view.Behaviors.Select(b => b.Id));
    var pending = Assert.Single(await Edge(brain).PendingBatches(session));
    Assert.Equal(kept, pending.Subscription);
    Assert.Single(pending.Signals);
}

[Fact]
public async Task RetiringTheLastProgramStopsTheSession()
{
    var ct = TestContext.Current.CancellationToken;
    var host = new FakeSessionHost();
    await using var brain = await RuntimeBrain.StartAsync(host, ct);
    await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle }, []);
    await host.NextAsync(FakeSessionHost.IsStart, ct);

    await Programs(brain).Retire("acc-brain/apps/demo");

    await host.NextAsync(FakeSessionHost.IsStop, ct);
    Assert.Null(await Programs(brain).Describe("acc-brain/apps/demo"));
    Assert.Equal(SessionStatus.None, (await Runtime(brain).Inspect(ct)).Session);
}

[Fact]
public async Task IdentityAnswersThePrincipalAndOwnerOfABehavior()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await RuntimeBrain.StartAsync(new FakeSessionHost(), ct);
    await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle }, []);
    var session = (await Runtime(brain).Inspect(ct)).SessionId!;

    var identity = await Edge(brain).Identity(session, "acc-brain/apps/demo/synapses/a.cs");

    Assert.NotNull(identity);
    Assert.Equal("acc-brain/apps/demo", identity!.Owner);
    Assert.Null(await Edge(brain).Identity(session, "acc-brain/apps/other/synapses/a.cs"));
}

[Fact]
public async Task AReportedExitIsRememberedForDescribeAndNeverDisarms()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await RuntimeBrain.StartAsync(new FakeSessionHost(), ct);
    var view = await Programs(brain).Assign("acc-brain/apps/demo", new() { ["synapses/a.cs"] = Idle }, []);
    var session = (await Runtime(brain).Inspect(ct)).SessionId!;
    var hash = view.Behaviors[0].Hash;

    for (var attempt = 0; attempt < 10; attempt++)
    { await Edge(brain).Reported(session, new("acc-brain/apps/demo/synapses/a.cs", hash, "Exited", 1, "boom")); }

    var described = Assert.Single((await Programs(brain).Describe("acc-brain/apps/demo"))!.Behaviors);
    Assert.Equal("Exited", described.Status);
    Assert.Equal("boom", described.Error);
    Assert.Single(await Edge(brain).Assignments(session));   // still assigned, never disarmed
}
```

Update the existing facts that call `Assign("acc-brain/csharp/a", "hash-a", [], null, null)` to `Programs(brain).Assign("acc-brain/apps/x", new() { ["synapses/a.cs"] = Idle }, [])`, and use the behavior id `"acc-brain/apps/x/synapses/a.cs"` wherever those facts used `"acc-brain/csharp/a"`. (The empty path `""` is reserved for `CSharpFileNeuron`'s own one-file program, Task 3.) Delete `AMatchingFingerprintConnectsAndAMismatchRefuses` only if it depends on `Failures`; otherwise keep it. Delete any fact whose name mentions `Disarm`, `Failures` or `ReloadLater`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/DigitalBrain.Modules.Microsoft.CSharp.Tests.csproj`
Expected: build errors: `IBrainPrograms` does not exist.

- [ ] **Step 3: Add the contract and reshape state**

Create `IBrainPrograms.cs` with the content from **Interfaces**. In `BrainRuntimeSnapshot.cs` replace `BehaviorView`:

```csharp
[GenerateSerializer, Alias("microsoft.csharp.behavior-view")]
public sealed record BehaviorView(
    [property: Id(0)] string Id,
    [property: Id(1)] string Hash,
    [property: Id(2)] string Status,
    [property: Id(3)] string? Error,
    [property: Id(4)] CSharpSubscriptionView[] Subscriptions);
```

In `BrainRuntimeState.cs` replace `BehaviorAssignment` with:

```csharp
[GenerateSerializer, Alias("microsoft.csharp.program-assignment")]
internal sealed record ProgramAssignment(
    [property: Id(0)] string Owner,
    [property: Id(1)] string Hash,
    [property: Id(2)] Dictionary<string, string> Settings,
    [property: Id(3)] CallerContext? Principal,
    [property: Id(4)] BehaviorAssembly[] Behaviors);

[GenerateSerializer, Alias("microsoft.csharp.behavior-assembly")]
internal sealed record BehaviorAssembly([property: Id(0)] string Path, [property: Id(1)] string Hash)
{
    public string Id(string owner) => BehaviorIds.For(owner, Path);
}
```

and `BrainRuntimeState.Behaviors` becomes `[Id(0)] public ProgramAssignment[] Programs { get; init; } = [];`. In `CSharpFileSnapshot.cs` remove `Disarmed` from `CSharpFileStatus`.

- [ ] **Step 4: Rewrite the runtime grain's assignment half**

In `BrainRuntimeNeuron.cs`: add `CSharpScriptCheck compiler` to the primary constructor; implement `IBrainPrograms`; delete `Assign(behavior, …)`, `Retire(behavior)`, `Reported`'s failure counting, `ReloadLater`, `MaximumFailures`, `FailureWindow`. The new members:

```csharp
// Last status the sandbox reported per behavior id. Memory only: a fresh activation shows Starting until the host speaks.
private readonly Dictionary<string, (string Status, string? Error)> _reported = new(StringComparer.Ordinal);

public async Task<ProgramView> Assign(string owner, Dictionary<string, string> sources, Dictionary<string, string> settings)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(owner);
    ArgumentNullException.ThrowIfNull(sources);
    ArgumentNullException.ThrowIfNull(settings);
    var compiled = compiler.Compile(sources);
    if (!compiled.Success)
    {
        throw new InvalidOperationException("The program does not compile: "
            + string.Join("; ", compiled.Errors.Select(error => $"{error.File} line {error.Line} {error.Id}: {error.Message}")));
    }
    foreach (var behavior in compiled.Assemblies.Values) { await assemblies.Put(behavior, CancellationToken.None); }
    var behaviors = compiled.Assemblies.OrderBy(file => file.Key, StringComparer.Ordinal)
        .Select(file => new BehaviorAssembly(file.Key, file.Value.Hash)).ToArray();
    var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", behaviors.Select(b => b.Path + ":" + b.Hash)))));
    var principal = CallerContextStamper.TryGet(out var caller) ? caller
        : Snapshot.Programs.FirstOrDefault(p => p.Owner == owner)?.Principal;
    var program = new ProgramAssignment(owner, hash, new(settings, StringComparer.Ordinal), principal, behaviors);
    var previous = Snapshot.Programs.FirstOrDefault(p => p.Owner == owner);
    var removed = previous?.Behaviors.Select(b => b.Id(owner)).Except(behaviors.Select(b => b.Id(owner)), StringComparer.Ordinal).ToArray() ?? [];
    await Save(Snapshot with
    {
        Programs = [.. Snapshot.Programs.Where(p => p.Owner != owner), program],
        Subscriptions = [.. Snapshot.Subscriptions.Where(s => !removed.Contains(s.Behavior, StringComparer.Ordinal))],
    }, Changed());
    foreach (var gone in removed) { _reported.Remove(gone); }
    if (removed.Length > 0) { await WatchSourcesAsync(); }
    if (Snapshot.Session is null) { await EnsureSessionAsync(); }
    else
    {
        foreach (var gone in removed) { streams.TryPush(Snapshot.Session.Id, RetireEvent.Kind, new RetireEvent(gone)); }
        foreach (var behavior in behaviors) { streams.TryPush(Snapshot.Session.Id, AssignmentEvent.Kind, await AssignmentFor(program, behavior)); }
    }
    return View(program);
}

public async Task Retire(string owner)
{
    if (Snapshot.Programs.FirstOrDefault(p => p.Owner == owner) is not { } program) { return; }
    var ids = program.Behaviors.Select(b => b.Id(owner)).ToArray();
    await Save(Snapshot with
    {
        Programs = [.. Snapshot.Programs.Where(p => p.Owner != owner)],
        Subscriptions = [.. Snapshot.Subscriptions.Where(s => !ids.Contains(s.Behavior, StringComparer.Ordinal))],
    }, Changed());
    foreach (var id in ids) { _reported.Remove(id); }
    await WatchSourcesAsync();
    if (Snapshot.Session is { } session) { foreach (var id in ids) { streams.TryPush(session.Id, RetireEvent.Kind, new RetireEvent(id)); } }
    if (Snapshot.Programs.Length == 0) { await EndSessionAsync(); }
}

public Task<ProgramView?> Describe(string owner)
    => Task.FromResult(Snapshot.Programs.FirstOrDefault(p => p.Owner == owner) is { } program ? View(program) : null);

public Task<BehaviorIdentity?> Identity(string session, string behavior)
{
    RequireSpeaking(session);
    return Task.FromResult(Find(behavior) is { } program ? new BehaviorIdentity(program.Principal, program.Owner) : null);
}

// The owner is a prefix of the behavior id; the longest matching owner wins.
private ProgramAssignment? Find(string behavior)
    => Snapshot.Programs.Where(p => p.Behaviors.Any(b => b.Id(p.Owner) == behavior)).OrderByDescending(p => p.Owner.Length).FirstOrDefault();

public Task Reported(string session, BehaviorStatusReport status)
{
    RequireSpeaking(session);
    ArgumentNullException.ThrowIfNull(status);
    if (Find(status.Behavior) is { } program && program.Behaviors.Any(b => b.Id(program.Owner) == status.Behavior && b.Hash == status.Hash))
    { _reported[status.Behavior] = (status.Status, status.Error); }
    return Task.CompletedTask;
}

public Task<string> Logs(string behavior, int tail)   // unchanged body, signature unchanged

public async Task<IReadOnlyList<AssignmentEvent>> Assignments(string session)
{
    RequireSpeaking(session);
    var assigned = new List<AssignmentEvent>();
    foreach (var program in Snapshot.Programs)
    { foreach (var behavior in program.Behaviors) { assigned.Add(await AssignmentFor(program, behavior)); } }
    return assigned;
}

private async Task<AssignmentEvent> AssignmentFor(ProgramAssignment program, BehaviorAssembly behavior)
    => new(behavior.Id(program.Owner), behavior.Hash,
        Reachable(await assemblies.ReadUrl(behavior.Hash, AssemblyUrlLifetime, CancellationToken.None)),
        Reachable(await assemblies.ReadUrl(behavior.Hash + ".pdb", AssemblyUrlLifetime, CancellationToken.None)),
        program.Settings);

private ProgramView View(ProgramAssignment program)
    => new(program.Owner, program.Hash, [.. program.Behaviors.Select(behavior =>
    {
        var id = behavior.Id(program.Owner);
        var reported = _reported.TryGetValue(id, out var last) ? last : ("Starting", null);
        return new BehaviorView(id, behavior.Hash, reported.Status, reported.Error,
            [.. Snapshot.Subscriptions.Where(s => s.Behavior == id).Select(s => new CSharpSubscriptionView(s.Neuron, s.Signal, s.Pending.Length, s.Delivered, s.Dropped))]);
    })]);
```

Also: `Inspect` returns `[.. Snapshot.Programs.SelectMany(View => …)]` using the same `View` per program (flatten `Behaviors`); `Touch`, `ReceiveReminder`, `ResumeAsync`, `EndSessionAsync` test `Snapshot.Programs.Length` instead of `Snapshot.Behaviors.Length`; `Subscribed` checks `Find(behavior) is not null` instead of `Snapshot.Behaviors.All(...)`; add `Access` entries unchanged (`Assign/Retire/Describe` on `IBrainPrograms` go through base access like the old file-keyed ones did). `BehaviorIdentity` in `IBrainRuntimeEdge.cs` becomes `(CallerContext? Principal, string Owner)`; in `RuntimeEdge.Stamp` use `identity.Principal` and `AppId = identity.Owner`. Add `using System.Security.Cryptography; using System.Text;` to the grain.

- [ ] **Step 5: Fix every other reference LSP finds**

`findReferences` on `BehaviorAssignment`, `IBrainRuntimeEdge.Assign`, `IBrainRuntimeEdge.Retire`, `BehaviorView.Failures`, `CSharpFileStatus.Disarmed`. Expected callers outside this task: `CSharpFileNeuron` (Task 3), `RecordingCSharpFile`/`AppBindingTestHost` (Task 3), `CSharpFileSnapshotFacts` (Task 3). Leave those to Task 3 but make the CSharp module project itself build by stubbing nothing: `CSharpFileNeuron` must compile, so in this task change its `Runtime` property to `IBrainPrograms` and its `AssignAsync` to call `Runtime.Assign(FileId, new() { [""] = source }, Snapshot.Settings)` and `Stop/Delete` to `Runtime.Retire(FileId)`; the full cleanup is Task 3.

- [ ] **Step 6: Build and run the runtime facts**

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj` then `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*BrainRuntimeNeuronFacts*"`
Expected: PASS for the new facts and the kept acknowledgement/session facts.

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/IBrainPrograms.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Runtime/BrainRuntimeSnapshot.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/CSharpFileSnapshot.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeState.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/IBrainRuntimeEdge.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Edge/RuntimeEdge.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileNeuron.cs src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/BrainRuntimeNeuronFacts.cs
git commit -m "CSharp runtime: programs are assigned whole through IBrainPrograms; no failure counting or disarming

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `CSharpFileNeuron` is a standalone program; app binding is gone

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileNeuron.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileState.cs`
- Delete: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpAppBindingGuard.cs`
- Delete: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/ICSharpAppBinding.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/CSharpModule.cs` (remove `AddIncomingGrainCallFilter<CSharpAppBindingGuard>()`)
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Contracts/Files/CSharpFileSnapshot.cs` (`Failures` removed, `Status` is `string`)
- Delete: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/AppBindingTestHost.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/CSharpFileNeuronFacts.cs`, `CSharpFileSnapshotFacts.cs`

**Interfaces:**
- Consumes: `IBrainPrograms` (Task 2), `BehaviorIds.For(owner, "") == owner`.
- Produces: `CSharpFileSnapshot(string Id, string Source, IReadOnlyDictionary<string,string> Settings, string? Hash, string Status, string? Error, bool ShouldRun)`. `ICSharpFile` methods unchanged.

- [ ] **Step 1: Write the failing facts**

In `CSharpFileNeuronFacts.cs` delete `CallersCannotBindAFileToAnInstalledApp`. Change `StartCompilesStoresAndAssignsTheBehaviorToTheBrainRuntime` to assert through `IBrainPrograms`:

```csharp
var started = await file.Start(ct);
Assert.Equal("Starting", started.Status);
Assert.NotNull(started.Hash);
Assert.True(started.ShouldRun);
var program = await brain.Get<IBrainPrograms>(BrainRuntimeKeys.For("acc-brain")).Describe("acc-brain/csharp/report");
Assert.Equal(started.Hash, Assert.Single(program!.Behaviors).Hash);
Assert.Equal("acc-brain/csharp/report", program.Behaviors[0].Id);
await host.NextAsync(FakeSessionHost.IsStart, ct);
var assignment = Assert.Single(await Edge(brain).Assignments((await brain.Get<IBrainRuntime>(BrainRuntimeKeys.For("acc-brain")).Inspect(ct)).SessionId!));
Assert.Equal("tea", assignment.Settings["TimerId"]);
```

Update `SwapReassignsWithANewHashAndDeleteRetires` and `StopRetiresTheBehaviorButKeepsItsSource` to read `Describe("acc-brain/csharp/<name>")` from `IBrainPrograms` (null after Stop/Delete) instead of `Edge(brain).Describe(...)`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*CSharpFileNeuronFacts*"`
Expected: FAIL (`Status` is still an enum; `Describe` answers a file, not a program).

- [ ] **Step 3: Rewrite the file neuron**

`CSharpFileState` becomes `Program`, `Settings`, `Hash`, `Wanted`, `Owner` (drop `AppId`, `AppBrain`). `CSharpFileNeuron`:

```csharp
[GrainType("microsoft.csharp.file")]
internal sealed partial class CSharpFileNeuron(
    [PersistentState("state", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<CSharpFileState> store)
    : Neuron<CSharpFileState>(store), ICSharpFile
{
    internal const int MaximumSourceBytes = 128 * 1024;
    private const int MaximumSettings = 64;
    private string FileId => this.GetPrimaryKeyString();

    private IBrainPrograms Programs
    {
        get
        {
            var separator = FileId.IndexOf('/', StringComparison.Ordinal);
            if (separator <= 0) { throw new InvalidOperationException($"'{FileId}' is not a behavior key; use CSharpFileKeys.For(brain, name)."); }
            return GrainFactory.GetGrain<IBrainPrograms>(BrainRuntimeKeys.For(FileId[..separator]));
        }
    }

    public async Task<CSharpFileSnapshot> Inspect(CancellationToken cancellationToken = default)
        => Describe(Snapshot.Wanted ? await Programs.Describe(FileId) : null);

    public Task Write(string program, CancellationToken cancellationToken = default) { RequireSize(program); return Save(Snapshot with { Program = program }, new CSharpFileChanged(FileId)); }

    public Task Configure(IReadOnlyDictionary<string, string> settings, CancellationToken cancellationToken = default)   // unchanged

    public Task<CSharpFileSnapshot> Start(CancellationToken cancellationToken = default) => AssignAsync(Snapshot.Program);
    public Task<CSharpFileSnapshot> Swap(string source, CancellationToken cancellationToken = default) { RequireSize(source); return AssignAsync(source); }

    public async Task<CSharpFileSnapshot> Stop(CancellationToken cancellationToken = default)
    {
        await Programs.Retire(FileId);
        await Save(Snapshot with { Wanted = false }, new CSharpFileChanged(FileId));
        return Describe(null);
    }

    public async Task Delete(CancellationToken cancellationToken = default)
    {
        if (FileId.Contains('/', StringComparison.Ordinal)) { await Programs.Retire(FileId); }
        await Save(new CSharpFileState(), new CSharpFileChanged(FileId));
        DeactivateOnIdle();
    }

    public Task<string> ReadLogs(int tail = 200, CancellationToken cancellationToken = default)
        => Snapshot.Wanted ? GrainFactory.GetGrain<IBrainRuntimeEdge>(Programs.GetPrimaryKeyString()).Logs(FileId, tail) : Task.FromResult("");

    // The runtime compiles; a source that does not compile throws out of Assign and nothing is recorded.
    private async Task<CSharpFileSnapshot> AssignAsync(string source)
    {
        if (string.IsNullOrWhiteSpace(source)) { throw new InvalidOperationException("Write the C# source before starting it."); }
        var program = await Programs.Assign(FileId, new(StringComparer.Ordinal) { [""] = source }, new(Snapshot.Settings, StringComparer.Ordinal));
        var owner = CallerContextStamper.TryGet(out var caller) ? caller : Snapshot.Owner;
        await Save(Snapshot with { Program = source, Hash = program.Behaviors[0].Hash, Wanted = true, Owner = owner }, new CSharpFileChanged(FileId));
        return Describe(program);
    }

    private CSharpFileSnapshot Describe(ProgramView? program)
    {
        var behavior = program?.Behaviors.FirstOrDefault();
        return new(FileId, Snapshot.Program, Snapshot.Settings, Snapshot.Hash, behavior?.Status ?? "Stopped", behavior?.Error, Snapshot.Wanted);
    }
    // RequireSize, SettingName regex unchanged
}
```

`CSharpScriptCheck.Compile` must accept the empty path `""` as a program path (it does: only `lib/` is special). `CSharpFileSnapshot` becomes `(Id, Source, Settings, Hash, string Status, string? Error, bool ShouldRun)`; update `CSharpFileSnapshotFacts` and `CSharpFileView` (Authoring) to the new shape via LSP.

- [ ] **Step 4: Delete the binding guard and its registration; run the module suites**

Delete `CSharpAppBindingGuard.cs`, `ICSharpAppBinding.cs`, `AppBindingTestHost.cs`; remove the `AddIncomingGrainCallFilter<CSharpAppBindingGuard>()` line in `CSharpModule.cs`. `findReferences` on `ICSharpAppBinding` must show only `RecordingCSharpFile` in the Apps tests (Task 6 removes it).

Run: `dotnet build src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/DigitalBrain.Modules.Microsoft.CSharp.csproj` and `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`
Expected: build clean; the suite passes except facts that belong to Task 4 (sandbox restart) if any were already added.

- [ ] **Step 5: Commit**

```bash
git add -u src/DigitalBrain.Modules/Microsoft/CSharp
git commit -m "CSharp: a file is a standalone program of the brain runtime; app binding removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(`git add -u` stages only tracked, already-listed files you modified or deleted in this task; verify with `git status --short` that nothing outside `src/DigitalBrain.Modules/Microsoft/CSharp` is staged.)

---

### Task 4: The sandbox restarts an exited behavior itself

**Files:**
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Session.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SandboxSessionFacts.cs`

**Interfaces:**
- Consumes: `BehaviorLoader.LoadAsync`, `BehaviorRun`, `FakeBrainEdge` (existing test double with `Push`, `StatusAsync`, `Assignment(...)`, `Serve(...)`).
- Produces: a `Session` whose exited behavior is reloaded after `1s << min(attempt, 6)` while still assigned; a `RetireEvent` or a replacing `AssignmentEvent` cancels the pending reload.

- [ ] **Step 1: Write the failing fact**

```csharp
[Fact(Timeout = 60_000)]
public async Task AnExitedBehaviorIsReloadedUntilItIsRetired()
{
    var ct = TestContext.Current.CancellationToken;
    var edge = new FakeBrainEdge();
    var crashing = BehaviorLoaderFacts.Compile("var brain = await DigitalBrainClient.ConnectAsync(args);\nthrow new InvalidOperationException(\"boom\");\n");
    edge.Serve(crashing);
    await using var connection = await BehaviorLoaderFacts.Open(edge, ct);
    await using var session = new Session(connection, BehaviorLoaderFacts.Loader(edge), NullLogger.Instance, TimeSpan.FromMilliseconds(50));
    var control = session.RunAsync(ct);

    edge.Push(AssignmentEvent.Kind, edge.Assignment("acc-brain/apps/demo/synapses/a.cs", crashing));
    var first = await edge.StatusAsync("acc-brain/apps/demo/synapses/a.cs", ct, status: "Exited");
    Assert.Equal(1, first["exitCode"]!.GetValue<int>());
    var second = await edge.StatusAsync("acc-brain/apps/demo/synapses/a.cs", ct, status: "Running");   // reloaded
    Assert.NotNull(second);
    await edge.StatusAsync("acc-brain/apps/demo/synapses/a.cs", ct, status: "Exited");

    edge.Push(RetireEvent.Kind, new RetireEvent("acc-brain/apps/demo/synapses/a.cs"));
    await edge.StatusAsync("acc-brain/apps/demo/synapses/a.cs", ct, status: "Stopped");
    var reportsAfterRetire = edge.RecordedReports.Count;
    await Task.Delay(300, ct);
    Assert.Equal(reportsAfterRetire, edge.RecordedReports.Count);   // no reload after retire
    Assert.False(control.IsCompleted);
}
```

If `FakeBrainEdge.StatusAsync` has no `status:` filter, add an optional `string? status = null` parameter that skips reports whose `status` differs.

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*AnExitedBehaviorIsReloaded*"`
Expected: FAIL. `Session` has no 4-argument constructor and never reloads.

- [ ] **Step 3: Implement the restart**

In `Session.cs`:

```csharp
internal sealed class Session(SessionConnection connection, BehaviorLoader loader, ILogger logger, TimeSpan? reloadBase = null) : IAsyncDisposable
{
    private static readonly TimeSpan ReloadCap = TimeSpan.FromSeconds(60);
    private readonly TimeSpan _reloadBase = reloadBase ?? TimeSpan.FromSeconds(1);
    private readonly ConcurrentDictionary<string, int> _failures = new(StringComparer.Ordinal);
    // ... existing fields

    // An exit the brain did not ask for: reported, then reloaded after a backoff while the assignment stands.
    private async Task ReportExitAsync(BehaviorRun run)
    {
        var exit = await run.Completion.ConfigureAwait(false);
        if (!_behaviors.TryGetValue(run.Id, out var current) || current != run) { return; }
        _behaviors.TryRemove(new(run.Id, run));
        await ReportAsync(new(run.Id, run.Hash, "Exited", exit, run.Error), connection.Stopping).ConfigureAwait(false);
        await run.DisposeAsync().ConfigureAwait(false);
        if (exit == 0) { _failures.TryRemove(run.Id, out _); return; }
        var attempt = _failures.AddOrUpdate(run.Id, 1, (_, count) => count + 1);
        var delay = TimeSpan.FromTicks(Math.Min(_reloadBase.Ticks << Math.Min(attempt - 1, 6), ReloadCap.Ticks));
        _ = ReloadLaterAsync(run.Assignment, delay);
    }

    private async Task ReloadLaterAsync(AssignmentEvent assignment, TimeSpan delay)
    {
        try { await Task.Delay(delay, connection.Stopping).ConfigureAwait(false); }
        catch (OperationCanceledException) { return; }
        // Still wanted at this hash, and nothing else loaded it meanwhile.
        if (_retired.ContainsKey(assignment.Behavior) || _behaviors.ContainsKey(assignment.Behavior)) { return; }
        await AssignAsync(assignment, connection.Stopping).ConfigureAwait(false);
    }

    // Behaviors the brain retired; a reload that fires after a retirement does nothing.
    private readonly ConcurrentDictionary<string, byte> _retired = new(StringComparer.Ordinal);
```

In `AssignAsync` call `_retired.TryRemove(assignment.Behavior, out _)` first and, when the incoming hash differs from the hash of a failing run, `_failures.TryRemove(assignment.Behavior, out _)`. In `UnloadAsync` (called by retire and keep-only) add `_retired[behavior] = 0; _failures.TryRemove(behavior, out _);`. A successful `Running` report after a reload does not reset `_failures`; only a clean exit (code 0) or a new hash does, so a behavior that crashes every time backs off to the cap instead of hammering.

- [ ] **Step 4: Run the sandbox suite**

Run: `dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-class "*SandboxSessionFacts*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Session.cs src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/SandboxSessionFacts.cs src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/FakeBrainEdge.cs
git commit -m "Sandbox: an exited behavior is reloaded with backoff until it is retired

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `IApp.Request` publishes `AppRequested`; the invocation surface is gone

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppRequested.cs`
- Delete: `.../Apps.Contracts/Signals/AppInvoked.cs`, `.../Signals/AppInvocationCompleted.cs`, `.../Apps/AppInvocation.cs`, `.../Apps/AppResponse.cs`, `.../Apps/InvokeApp.cs`, `.../Apps/InvocationStatus.cs`, `.../Apps/AppCalls.cs`, `.../Apps/AppInvocations.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs`, `AppState.cs`
- Delete tests: `tests/DigitalBrain.Modules.Apps.Tests/Apps/AppAskFacts.cs`, `AppAwaitFacts.cs`, `AppInvocationEnumerationFacts.cs`, `AppInvocationReadinessFacts.cs`, `AppTimeoutFacts.cs` (if it only covers `Await`)
- Create test: `tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRequestFacts.cs`

**Interfaces:**
- Produces:

```csharp
// Signals/AppRequested.cs
[GenerateSerializer, Alias("apps.app-requested")]
public sealed record AppRequested([property: Id(0)] string Operation, [property: Id(1)] string Input, [property: Id(2)] Guid RequestId) : Signal;

// IApp
// Publishes AppRequested for a synapse to react to. Nothing waits for it: the answer is neuron state.
Task<Guid> Request(string operation, string input);
```

- [ ] **Step 1: Write the failing facts**

`AppRequestFacts.cs`:

```csharp
namespace DigitalBrain.Apps.Tests.Apps;

public sealed class AppRequestFacts
{
    private const string Brain = "app-request-facts";

    [Fact]
    public async Task ARequestPublishesAppRequestedWithAFreshId()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "echo"));
        await app.Create(new AppManifest("Echo", "echoes", [new("open", "")], [], []), "spec");
        await using var requested = await brain.SubscribeAsync<Signals.AppRequested>(app, ct);

        var id = await app.Request("open", "docked");

        var signal = await requested.ReadAllAsync(ct).FirstAsync(ct);
        Assert.Equal(id, signal.RequestId);
        Assert.Equal(("open", "docked"), (signal.Operation, signal.Input));
        Assert.NotEqual(Guid.Empty, id);
    }

    [Fact]
    public async Task ARequestForAnUndeclaredOperationIsRefusedAndPublishesNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "strict"));
        await app.Create(new AppManifest("Strict", "", [new("open", "")], [], []), "spec");
        await using var requested = await brain.SubscribeAsync<Signals.AppRequested>(app, ct);

        var error = await Assert.ThrowsAsync<ArgumentException>(() => app.Request("missing", ""));

        Assert.Contains("open", error.Message, StringComparison.Ordinal);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            using var none = CancellationTokenSource.CreateLinkedTokenSource(ct);
            none.CancelAfter(TimeSpan.FromMilliseconds(200));
            await requested.ReadAllAsync(none.Token).FirstAsync(none.Token);
        });
    }

    [Fact]
    public async Task AnOversizedInputIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var app = brain.Get<IApp>(IApp.Key(Brain, "big"));
        await app.Create(new AppManifest("Big", "", [new("open", "")], [], []), "spec");
        await Assert.ThrowsAsync<ArgumentException>(() => app.Request("open", new string('x', 64 * 1024 + 1)));
    }
}
```

(The `brain.SubscribeAsync<T>(source, ct)` helper and `FirstAsync` are what `AppAskFacts` used; keep the same usings.)

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj`
Expected: build error: `IApp` has no `Request`.

- [ ] **Step 3: Implement**

In `IApp.cs` delete `Invoke`, `Respond`, `ReadInvocation`, `Await`, `Pending`, `ReadInvocations`; add `Task<Guid> Request(string operation, string input);`. In `AppState.cs` delete `Invocations` (and its `Clone` line). In `AppNeuron.cs` delete `Invoke`, `Respond`, `waiters`, `Await`, `ReadInvocation`, `ReadInvocations`, `Pending`, `MaxInvocations`; add:

```csharp
public async Task<Guid> Request(string operation, string input)
{
    RequireCreated();
    ArgumentException.ThrowIfNullOrWhiteSpace(operation);
    ArgumentNullException.ThrowIfNull(input);
    if (!Snapshot.Manifest!.Operations.Any(candidate => candidate.Name == operation))
    {
        throw new ArgumentException(
            $"{operation} is not an operation of {Name()}. It offers: {string.Join(", ", Snapshot.Manifest.Operations.Select(candidate => candidate.Name))}.");
    }
    if (input.Length > MaxPayloadLength) { throw new ArgumentException("A request input is at most 64 KiB."); }
    var id = Guid.NewGuid();
    // Published, never stored: a request is a fact for the app's synapses, and the brain runtime buffers it for them.
    await Save(Snapshot, new AppRequested(operation, input, id));
    return id;
}
```

Create `AppRequested.cs`; delete the eight listed contract files and the five test files. `findReferences` on each deleted type: remaining references are in `AppsEndpoints` (Task 7), `AgentPrompts`/`CSharpScriptSandbox` (Task 8), shipped synapses (Task 9), `AssistantScenarioFacts`/`NeuronSurface.CallDescription` (Task 10). Those projects will not build until their tasks; this task only needs the Apps Contracts, Apps module and Apps tests projects to build.

- [ ] **Step 4: Build and run**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj` — expected: errors only in `AppsEndpoints.Ask` and `CSharpAppRuntime`/deploy ledgers. Stub `AppsEndpoints.Ask` out by deleting the `/ask` route and the `Ask` method now (Task 7 adds `/request`). Then `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppRequestFacts*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -u src/DigitalBrain.Modules/DigitalBrain/Apps
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppRequested.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRequestFacts.cs
git commit -m "Apps: IApp.Request publishes AppRequested; the invocation pipeline is removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The app deploys its program through `IAppRuntime`

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IAppRuntime.cs`
- Delete: `.../Apps.Contracts/Apps/IDeployableRuntime.cs`, `.../DigitalBrain.Modules.Apps/Runtimes/AppProgramKey.cs`
- Modify: `.../DigitalBrain.Modules.Apps/Runtimes/CSharpAppRuntime.cs`, `.../Apps/AppNeuron.cs`, `.../Apps/AppState.cs`, `.../AppsModule.cs`
- Modify: `.../Apps.Contracts/Apps/IAppStorageHook.cs`, `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Tables/TableStorageHook.cs`
- Modify: `.../Apps.Contracts/Apps/AppFiles.cs` (add `IsProgram`)
- Delete tests: `tests/.../Runtimes/DeployableRuntimeFacts.cs`, `tests/.../Support/RecordingCSharpFile.cs` (then `findReferences` for its users: `AppInstallerFacts`, `AppOriginFacts`, `AppPublishFacts`, `SaveToSourceFacts` use it for deploy assertions; switch them to `FakeAppRuntime` below)
- Create test: `tests/.../Runtimes/AppRuntimeFacts.cs`
- Modify test: `tests/.../Runtimes/StorageHookFacts.cs`

**Interfaces:**
- Consumes: `IBrainPrograms` (Task 2).
- Produces:

```csharp
// Apps.Contracts/Apps/IAppRuntime.cs
// How an app's program runs. The Apps module hands over sources and configuration; a host without a
// runtime (no csharp module) registers none and apps are data only.
public interface IAppRuntime
{
    // Compiles and runs the whole program; throws when it does not compile, leaving the previous program running.
    Task Deploy(string appKey, Dictionary<string, string> sources, Dictionary<string, string> configuration, CancellationToken cancellationToken);
    Task Retire(string appKey, CancellationToken cancellationToken);
}
```

`IAppStorageHook.OnRetired(string brainId, string appKey, CancellationToken cancellationToken)`. `AppFiles.IsProgram(path)` is `IsSynapse(path) || path.StartsWith("lib/") && path.EndsWith(".cs")`. `AppState.Principal` (`CallerContext?`). `AppSnapshot` gains nothing.

- [ ] **Step 1: Write the failing facts**

`AppRuntimeFacts.cs` (replaces `DeployableRuntimeFacts`):

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DigitalBrain.Modules.Apps.Tests.Runtimes;

internal sealed class FakeAppRuntime : IAppRuntime
{
    public List<(string AppKey, Dictionary<string, string> Sources, Dictionary<string, string> Configuration)> Deployed { get; } = [];
    public List<string> Retired { get; } = [];
    public Func<Dictionary<string, string>, Exception?>? Refuse { get; set; }

    public Task Deploy(string appKey, Dictionary<string, string> sources, Dictionary<string, string> configuration, CancellationToken cancellationToken)
    {
        if (Refuse?.Invoke(sources) is { } error) { throw error; }
        Deployed.Add((appKey, new(sources), new(configuration)));
        return Task.CompletedTask;
    }

    public Task Retire(string appKey, CancellationToken cancellationToken) { Retired.Add(appKey); return Task.CompletedTask; }

    public static Task<ModuleBrain> Start(FakeAppRuntime runtime, CancellationToken ct)
        => ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => { silo.Services.RemoveAll<IAppRuntime>(); silo.Services.AddSingleton<IAppRuntime>(runtime); })
            .StartAsync(ct);
}

public sealed class AppRuntimeFacts
{
    [Fact]
    public async Task ABuildDeploysTheWholeProgramWithItsConfigurationAndDeleteRetiresIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var runtime = new FakeAppRuntime();
        await using var brain = await FakeAppRuntime.Start(runtime, ct);
        var app = brain.Get<IApp>(IApp.Key("runtime-facts", "tracker"));
        await app.Create(new("Tracker", "tracks", [new("ask", "ask")], [new("Feed", "what to watch", "news")], []), "spec");
        await app.BeginBuild(null);

        await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["synapses/track.cs"] = "// b", ["lib/Shared.cs"] = "// lib", ["prompts/x.md"] = "not code" }, null);

        var deployment = Assert.Single(runtime.Deployed);
        Assert.Equal(["lib/Shared.cs", "synapses/track.cs"], deployment.Sources.Keys.Order(StringComparer.Ordinal));
        Assert.Equal(IApp.Key("runtime-facts", "tracker"), deployment.Configuration["App"]);
        Assert.Equal("news", deployment.Configuration["Feed"]);
        await app.Delete();
        Assert.Equal([IApp.Key("runtime-facts", "tracker")], runtime.Retired);
    }

    [Fact]
    public async Task EveryProgramOrSettingChangeRedeploysTheWholeProgram()
    {
        var ct = TestContext.Current.CancellationToken;
        var runtime = new FakeAppRuntime();
        await using var brain = await FakeAppRuntime.Start(runtime, ct);
        var app = brain.Get<IApp>(IApp.Key("runtime-facts", "fresh"));
        await app.Create(new("Fresh", "fresh", [], [new("Feed", "", "a")], []), "spec");
        await app.WriteBehavior("synapses/old.cs", "// old", Guid.NewGuid());
        await app.WriteBehavior("synapses/new.cs", "// new", Guid.NewGuid());
        await app.Configure(new() { ["Feed"] = "b" }, []);

        Assert.Equal(3, runtime.Deployed.Count);
        Assert.Equal(["synapses/new.cs", "synapses/old.cs"], runtime.Deployed[1].Sources.Keys.Order(StringComparer.Ordinal));
        Assert.Equal("b", runtime.Deployed[2].Configuration["Feed"]);
    }

    [Fact]
    public async Task AWriteWhoseProgramDoesNotCompileFailsAndKeepsThePreviousFiles()
    {
        var ct = TestContext.Current.CancellationToken;
        var runtime = new FakeAppRuntime { Refuse = sources => sources.ContainsKey("synapses/bad.cs") ? new InvalidOperationException("The program does not compile: synapses/bad.cs line 1 CS0029") : null };
        await using var brain = await FakeAppRuntime.Start(runtime, ct);
        var app = brain.Get<IApp>(IApp.Key("runtime-facts", "strict"));
        await app.Create(new("Strict", "", [], [], []), "spec");
        await app.WriteBehavior("synapses/good.cs", "// ok", Guid.NewGuid());

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => app.WriteBehavior("synapses/bad.cs", "int x = \"no\";", Guid.NewGuid()));

        Assert.Contains("CS0029", error.Message, StringComparison.Ordinal);
        Assert.Equal(["synapses/good.cs"], (await app.Read()).Files.Keys);
    }

    [Fact]
    public async Task AnAppWithNoProgramFilesRetiresInsteadOfDeploying()
    {
        var ct = TestContext.Current.CancellationToken;
        var runtime = new FakeAppRuntime();
        await using var brain = await FakeAppRuntime.Start(runtime, ct);
        var app = brain.Get<IApp>(IApp.Key("runtime-facts", "empty"));
        await app.Create(new("Empty", "", [], [new("Feed", "", "a")], []), "spec");

        await app.Configure(new() { ["Feed"] = "b" }, []);

        Assert.Empty(runtime.Deployed);
        Assert.Equal([IApp.Key("runtime-facts", "empty")], runtime.Retired);
    }
}
```

In `StorageHookFacts.cs` change `RecordingHook.OnRetired` to the 3-argument signature and the `Retired` tuple to `(Brain, AppKey)`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj`
Expected: build error: `IAppRuntime` does not exist.

- [ ] **Step 3: Implement the seam and the app side**

`IAppRuntime.cs` as in **Interfaces**. `CSharpAppRuntime.cs`:

```csharp
using DigitalBrain.Microsoft.CSharp.Runtime;

namespace DigitalBrain.Apps;

// Runs a csharp app as one program of its brain's runtime. The app key's brain scope names the runtime.
internal sealed class CSharpAppRuntime(IGrainFactory grains) : IAppRuntime
{
    public async Task Deploy(string appKey, Dictionary<string, string> sources, Dictionary<string, string> configuration, CancellationToken cancellationToken)
        => await Programs(appKey).Assign(appKey, sources, configuration).WaitAsync(cancellationToken);

    public async Task Retire(string appKey, CancellationToken cancellationToken)
        => await Programs(appKey).Retire(appKey).WaitAsync(cancellationToken);

    private IBrainPrograms Programs(string appKey)
    {
        var marker = appKey.IndexOf("/apps/", StringComparison.Ordinal);
        if (marker <= 0) { throw new ArgumentException("An app key is {brain}/apps/{name}.", nameof(appKey)); }
        return grains.GetGrain<IBrainPrograms>(BrainRuntimeKeys.For(appKey[..marker]));
    }
}
```

`AppsModule.cs`: replace the `IDeployableRuntime, CSharpAppRuntime` registration with `silo.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IAppRuntime, CSharpAppRuntime>());` — keep `TryAddEnumerable` so test hosts can `RemoveAll<IAppRuntime>()`.

`AppFiles.cs`:

```csharp
public const string LibraryPrefix = "lib/";
public static bool IsProgram(string path)
    => IsSynapse(path) || path.StartsWith(LibraryPrefix, StringComparison.Ordinal) && path.EndsWith(".cs", StringComparison.Ordinal);
```

`AppState.cs`: delete `ProgramGeneration`, `StorageFiles`, `DeployedFiles`, `BehaviorErrors` (and their `Clone` lines); add `[Id(12)] public CallerContext? Principal { get; set; }` (reuse id 12, state is not kept). `AppNeuron`:

- constructor: `IEnumerable<IAppRuntime> runtimes` replaces `IEnumerable<IDeployableRuntime> deployables`; `private IAppRuntime? Runtime => runtimes.FirstOrDefault();`
- `Create` and `Import`: `next.Principal = CallerContextStamper.TryGet(out var caller) ? caller : null;`
- delete `Deployable()`, `DeployBehavior`, `RedeployBehaviors`, every `Keys(...)`/`StorageFiles`/`DeployedFiles`/`BehaviorErrors` line in `WriteBehavior`, `Rollback`, `CompleteBuild`, `Import`, `Replace`, `Delete`.
- add:

```csharp
private Dictionary<string, string> Sources()
    => Snapshot.Files.Where(file => AppFiles.IsProgram(file.Key)).ToDictionary(file => file.Key, file => file.Value, StringComparer.Ordinal);

// The whole program, every time: the runtime decides what changed. No program means nothing runs.
private async Task Deploy()
{
    if (Runtime is not { } runtime) { return; }
    var sources = Sources();
    if (sources.Count == 0) { await runtime.Retire(this.GetPrimaryKeyString(), CancellationToken.None); return; }
    await runtime.Deploy(this.GetPrimaryKeyString(), sources, Configuration(), CancellationToken.None);
}
```

- `WriteBehavior`: accept `AppFiles.IsProgram(path)` (so `lib/*.cs` is written here too; adjust the error text to "A program file is synapses/*.cs or lib/*.cs"). Deploy **before** persisting so a refused program leaves `Files` unchanged:

```csharp
var next = Snapshot.Clone();
next.Edited = true;
next.Files[path] = source;
next.Version = Bump(next.Version, minor: false);
Record(next); Receipt(next, operationId);
if (Runtime is { } runtime)
{
    var sources = next.Files.Where(file => AppFiles.IsProgram(file.Key)).ToDictionary(file => file.Key, file => file.Value, StringComparer.Ordinal);
    await runtime.Deploy(this.GetPrimaryKeyString(), sources, Configuration(next), CancellationToken.None);
}
await Persist(next);
```

Make `Configuration(AppState state)` take the state it reads (`Settings`, `Connections`, `BrainScopeId`) and keep a parameterless overload for `Snapshot`. `WriteFile` refuses `AppFiles.IsProgram(path)` with "Programs are written through WriteBehavior". `CompleteBuild`, `Rollback`, `Import`, `Replace`, `Configure` end with `await Deploy();` after `Persist` (a Builder result that does not compile fails `CompleteBuild` with the compiler's message and leaves `Status = Failed`; wrap: catch `InvalidOperationException` from `Deploy()` in `CompleteBuild` only, set `next.Status = AppStatus.Failed`, append `"build failed: " + error.Message` to `Activity`, persist, return). `Delete`: `if (Runtime is { } runtime) { await runtime.Retire(key, CancellationToken.None); } foreach (var hook in storageHooks) { await hook.OnRetired(Snapshot.BrainScopeId ?? "", key, CancellationToken.None); }`.

`IAppStorageHook.OnRetired(string brainId, string appKey, CancellationToken cancellationToken)`; `TableStorageHook.OnRetired` keeps only the `new TableOwner(brainId, appKey)` retire. Delete `AppProgramKey.cs`, `IDeployableRuntime.cs`, `DeployableRuntimeFacts.cs`, `RecordingCSharpFile.cs`; rewrite the facts that used `RecordingCSharpFile.Files/ConfiguredSettings/Swaps/AppBindings` to assert on a `FakeAppRuntime` instance registered the same way (`Deployed.Last().Configuration[...]`, `Deployed.Count`, `Retired`).

- [ ] **Step 4: Build and run the Apps and Postgres suites**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj`, then `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`, then `dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: PASS (facts about `/ask`, prompts and the AI scenario belong to Tasks 7, 8, 10 and are in other projects).

- [ ] **Step 5: Commit**

```bash
git add -u src/DigitalBrain.Modules/DigitalBrain/Apps src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/Tables/TableStorageHook.cs
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IAppRuntime.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Runtimes/AppRuntimeFacts.cs
git commit -m "Apps: an app deploys its whole program through IAppRuntime; deploy ledgers removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: HTTP: `POST /apps/{name}/request` replaces `/ask`

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRouteFacts.cs`

**Interfaces:**
- Produces: `POST /brains/{brainId}/apps/{name}/request` with body `{ "operation": "...", "input": "..." }` → `202 Accepted { "requestId": "<guid>" }`; `422` for an undeclared operation or oversized input (through the existing `Respond` mapping of `ArgumentException`).

- [ ] **Step 1: Write the failing fact**

Add to `AppRouteFacts.cs` (same `Invoke` helper style as `TheAppsSurfaceCreatesImplementsExportsAndDeletes`):

```csharp
[Fact]
public async Task ARequestIsAcceptedAtOnceAndAnUnknownOperationIs422()
{
    // Arrange exactly as TheAppsSurfaceCreatesImplementsExportsAndDeletes arranges a created app named "shouter" with operation "ask".
    var accepted = await Invoke("POST", "/brains/{brainId}/apps/{name}/request", new { operation = "ask", input = "hi" }, ("brainId", "alice"), ("name", "shouter"));
    Assert.Equal(StatusCodes.Status202Accepted, accepted.Response.StatusCode);
    Assert.True(Guid.TryParse(JsonDocument.Parse(accepted.Body).RootElement.GetProperty("requestId").GetString(), out _));

    var unknown = await Invoke("POST", "/brains/{brainId}/apps/{name}/request", new { operation = "nope", input = "" }, ("brainId", "alice"), ("name", "shouter"));
    Assert.Equal(StatusCodes.Status422UnprocessableEntity, unknown.Response.StatusCode);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*ARequestIsAccepted*"`
Expected: FAIL with 404 (no route).

- [ ] **Step 3: Implement**

In `AppsEndpoints.Map` replace the `/ask` mapping (deleted in Task 5) with:

```csharp
apps.MapPost("/{name}/request", (string name, RequestBody? request, IDigitalBrain brain, CancellationToken ct) => Respond(async () =>
{
    var id = await App(brain, name).Request(request?.Operation ?? "ask", request?.Input ?? "{}").WaitAsync(ct);
    return Results.Accepted($"/brains/{BrainScope.CurrentId()}/apps/{name}", new { requestId = id });
}));
```

with `internal sealed record RequestBody(string? Operation, string? Input);` beside `AskRequest` (delete `AskRequest`, the `Ask` method and its JSON-output branch).

- [ ] **Step 4: Run the route facts**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppRouteFacts*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRouteFacts.cs
git commit -m "Apps HTTP: POST /apps/{name}/request answers 202; /ask removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The Creator teaches the reactive shape

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpScriptSandbox.cs` (`AuthoringDescription`)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Surface/NeuronSurface.cs` (`CallDescription`)
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppCreatorFacts.cs` (prompt-content assertions, if any name `Invocations`/`Respond`)

**Interfaces:** text only.

- [ ] **Step 1: Write the failing fact**

In `AppCreatorFacts.cs` add:

```csharp
[Fact]
public void TheBuilderPromptTeachesOneReactionPerSynapseAndNeverTheInvocationPipeline()
{
    Assert.Contains("brain.On<AppRequested>(app", AgentPrompts.Builder, StringComparison.Ordinal);
    Assert.DoesNotContain("Invocations(", AgentPrompts.Builder, StringComparison.Ordinal);
    Assert.DoesNotContain("Respond(", AgentPrompts.Builder, StringComparison.Ordinal);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*TheBuilderPromptTeaches*"`
Expected: FAIL.

- [ ] **Step 3: Rewrite the three texts**

`AgentPrompts.Builder`, the paragraph starting "Keep each behavior a screen or less":

```
Keep each synapse a screen or less and exactly one reaction: one `await foreach` over one
`brain.On<T>(source, brain.Stopping)`, acting through neurons. Shared code goes in "lib/*.cs" as
ordinary classes every synapse can use. The app's own operations arrive as `AppRequested` signals:
    await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
    { if (request.Operation == "open") { /* compose the UI through neurons */ } }
Never answer a request: a result is neuron state (a text, a card, a table) the caller reads. UI
signals (ButtonClicked, ComposerSubmitted) get their own synapse each. Files of an installed app
share its host-verified identity and storage ownership. Never derive authority from a setting.
```

`CSharpScriptSandbox.AuthoringDescription`, the example:

```
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Flutter.Text;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(brain.Setting("App")!);
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{ await brain.Get<IText>(app.GetPrimaryKeyString() + "/answer").Set(Answer(request.Input)); }

static string Answer(string input) => /* the answer */ input;
```

`NeuronSurface.CallDescription`: replace "To use an app: IApp.Invoke with {invocationId, operation, input}, then IApp.Await with that invocationId." with "To use an app: IApp.Request with [operation, input]; then read the neuron the app's spec names for the result."

- [ ] **Step 4: Run and commit**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppCreatorFacts*"` and `dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj`
Expected: PASS, build clean.

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Authoring/CSharpScriptSandbox.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Surface/NeuronSurface.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppCreatorFacts.cs
git commit -m "Creator: synapses are one reaction each; requests arrive as AppRequested

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Shipped apps are rewritten, one reaction per file

**Files (all rewritten in place; bump each `app.json` patch version):**
- `src/DigitalBrain.OS/Apps/Assistant/synapses/{surface.cs → open.cs, chat.cs → send.cs + transcript.cs + new.cs, projection.cs, stop.cs, submissions.cs, voice.cs}`, `lib/Assistant.cs`
- `src/DigitalBrain.OS/Apps/DataVisualizer/synapses/{operations.cs → requests.cs, query.cs → refresh.cs, run-on-change.cs, run-on-filter.cs, run-on-row.cs, run-on-tick.cs}`, `lib/Views.cs`
- `src/DigitalBrain.OS/Apps/Settings/synapses/{app.cs → open.cs, connections.cs, preferences.cs}`
- `src/IntoChat/Apps/CustomerResearcher/synapses/{surface.cs → open.cs, controls.cs, research.cs, activity.cs}`
- `src/IntoChat/Apps/WordCount/synapses/app.cs`
- Tests: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs`, `VendorAppFacts.cs` (already compile every shipped program; they must include `lib/` files in the compile set).

**Interfaces:**
- Consumes: `AppRequested(Operation, Input, RequestId)`, `IApp.Request`, `IDigitalBrain.On<T>` (loop form), window id convention `{appKey}/window`, surface `{appKey}/surface`.

- [ ] **Step 1: Make the shipped-compile facts the failing tests**

In `OsShippedAppFacts.EveryOsProgramCompilesAgainstCurrentContracts` and `VendorAppFacts.EveryShippedProgramCompilesAgainstCurrentContracts`, the compile set is `bundle.Files.Where(f => AppFiles.IsProgram(f.Key))` (it was synapses only). Run both:

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*CompilesAgainstCurrentContracts*"`
Expected: FAIL: every app still references `AppInvoked`, `Invocations`, `Respond`.

- [ ] **Step 2: Rewrite the Assistant**

`lib/Assistant.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Chat;
using DigitalBrain.Flutter.Layout;
using DigitalBrain.Flutter.Surface;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Workspace;

public static class Assistant
{
    public static string Key(IDigitalBrain brain) => brain.Setting("App")!;
    public static string Scope(IDigitalBrain brain) => brain.Setting("Brain")!;

    public static async Task<string> ConversationId(IDigitalBrain brain)
    {
        var pointer = brain.Get<IText>(Key(brain) + "/conversation");
        var current = (await pointer.Read()).Markdown;
        if (current.Length > 0) { return current; }
        await pointer.Set("main");
        return "main";
    }

    public static async Task ComposeAsync(IDigitalBrain brain)
    {
        var appKey = Key(brain);
        string Name(string part) => appKey + "/" + part;
        UiChildRef Ref(string kind, string part) => new(kind, Name(part));
        var selected = await brain.Get<IText>(Name("conversation")).Read();
        var context = Name("conversations/" + (selected.Markdown.Length == 0 ? "main" : selected.Markdown));
        await brain.Get<IComposer>(Name("composer")).Configure(context, selected.Version);
        await brain.Get<IButton>(Name("new")).Set("New conversation", "new");
        var header = brain.Get<ILayout>(Name("header"));
        await header.Set(new LayoutDefinition("row", [Ref(UIVocabulary.TextType, "status"), Ref(UIVocabulary.ButtonType, "new")], Extents: [0, 160]), (await header.Read()).Revision);
        var main = brain.Get<ILayout>(Name("main"));
        await main.Set(new LayoutDefinition("column",
            [Ref(UIVocabulary.LayoutType, "header"), Ref(UIVocabulary.ChatType, "transcript"), Ref(UIVocabulary.ComposerType, "composer")],
            Extents: [40, 0, 152]), (await main.Read()).Revision);
        var surface = brain.Get<ISurface>(Name("surface"));
        await surface.Set(new SurfaceDefinition("Assistant", [Ref(UIVocabulary.LayoutType, "main")]), (await surface.Read()).Revision);
    }

    public static Task OpenWindowAsync(IDigitalBrain brain, CancellationToken ct)
        => brain.Get<IWorkspace>(Scope(brain)).EnsureOpenAsync(Key(brain) + "/window", "Assistant",
            WindowReference.For(new UiChildRef(UIVocabulary.SurfaceType, Key(brain) + "/surface")), ct);
}
```

`synapses/open.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Assistant.Key(brain));
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "open") { continue; }
    await Assistant.ComposeAsync(brain);
    if (request.Input != "docked") { await Assistant.OpenWindowAsync(brain, brain.Stopping); }
}
```

`synapses/send.cs`:

```csharp
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models;
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Integrations;
using DigitalBrain.Flutter.Form;
using DigitalBrain.Flutter.Workspace;
using DigitalBrain.Microsoft.CSharp.Files;
using DigitalBrain.Postgres;

// The assistant tool path: "send" by request. The composer path lives in submissions.cs.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Assistant.Key(brain));
string[] contracts = [typeof(IConnectionRequests).FullName!, typeof(IPostgresServer).FullName!, typeof(IApp).FullName!, typeof(IAppIndex).FullName!,
    typeof(IWorkspace).FullName!, typeof(IForm).FullName!, typeof(ICSharpFile).FullName!];
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "send" || request.Input.Length is < 1 or > 32000) { continue; }
    var snapshot = await app.Read();
    var choice = snapshot.Settings.GetValueOrDefault("Model", "");
    var model = choice.Length > 0 ? await brain.Get<IModelCatalog>("default").Select(choice) : null;
    var conversation = brain.Get<IAgent>(Assistant.Key(brain) + "/conversations/" + await Assistant.ConversationId(brain));
    await conversation.Start(AgentTurn.Text(request.Input, instructions: snapshot.Files.GetValueOrDefault("prompts/system.md", ""), contracts: contracts)
        with { Model = model, RunId = request.RequestId.ToString("N") });
}
```

`synapses/new.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Button.Signals;
using DigitalBrain.Flutter.Text;

// Two triggers, one reaction: the button and the "new" request both start a conversation.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = Assistant.Key(brain);
var app = brain.Get<IApp>(key);
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation == "new") { await Start("c-" + request.RequestId.ToString("N")); }
}

async Task Start(string id)
{
    var current = brain.Get<IText>(key + "/conversation");
    if ((await current.Read()).Markdown != id) { await current.Set(id); }
    await brain.Get<IText>(key + "/status").Set("");
}
```

and `synapses/new-button.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Button.Signals;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Assistant.Key(brain));
await foreach (var clicked in brain.On<ButtonClicked>(brain.Get<IButton>(Assistant.Key(brain) + "/new"), brain.Stopping))
{ if (clicked.RequestId != Guid.Empty) { await app.Request("new", ""); } }
```

`transcript` operation: delete it from `app.json` (the transcript is `{appKey}/transcript`, an `IChat` the caller reads). Delete `chat.cs` and `surface.cs`. `projection.cs`, `stop.cs`, `submissions.cs`, `voice.cs` are unchanged except any `app.Invoke`/`Respond` use (none today).

- [ ] **Step 3: Rewrite DataVisualizer**

Move `Views()`, `Save()`, `Compose()`, `ComposeHome()`, `Same()` and the `View` record from `operations.cs` into `lib/Views.cs` as `public static class Views` taking `IDigitalBrain brain` and the app key; `Refresh(view)` becomes `app.Request("refresh", view)` with no await on an answer. `synapses/requests.cs` is `operations.cs` with the loop replaced by:

```csharp
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation == "refresh") { continue; }
    try { await Answer(request.RequestId, request.Operation, request.Input); }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await brain.Get<ICard>(appKey + "/status").Set("Request failed", request.Operation + ": " + error.Message); }
}
```

`Answer` returns `Task` (no JSON result): "open" composes and calls `brain.Get<IWorkspace>(brain.Setting("Brain")!).EnsureOpenAsync(appKey + "/window", "Data Visualizer", WindowReference.For(new UiChildRef("surface", appKey + "/surface")), brain.Stopping)` unless `input == "docked"`; "show" writes the view id into `brain.Get<IText>(appKey + "/last-view")` so an agent can read which view it created; "read" writes nothing extra (the table/chart neurons are the result). `synapses/refresh.cs` is `query.cs` with:

```csharp
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "refresh") { continue; }
    foreach (var view in (await Views.All(brain, appKey)).Where(view => request.Input.Length == 0 || view.Id == request.Input))
    { while (!await Run(await Views.Current(brain, appKey, view.Id))) { brain.Stopping.ThrowIfCancellationRequested(); } }
}
```

The four `run-on-*.cs` files keep their shape; their `Refresh()` helper becomes `app.Request("refresh", view)`.

- [ ] **Step 4: Rewrite Settings, CustomerResearcher, WordCount**

Settings `open.cs` (from `app.cs`): `On<AppRequested>` with `Operation is "open" or "read"`; "open" composes, then `await app.Request("refresh-connections", "")` with no await on an answer; the preferences object is written to `brain.Get<IText>(appKey + "/preferences")` as JSON instead of returned. `connections.cs`: `Operations()` loop reads `On<AppRequested>` filtered to `"refresh-connections"` and calls `Refresh()`; `RefreshClicks`, `ConnectionChanges`, `ConnectionRequests` call `app.Request("refresh-connections", "")`. `preferences.cs`: `Operations()` reads `On<AppRequested>` filtered to the three preference operations and the `Clicks` loops call `app.Request(operation, input)`.

CustomerResearcher: `controls.cs` uses `app.Request("research", query)` / `app.Request("stop", "")`. `research.cs`: `Commands()` reads `On<AppRequested>`; queued research lives in `brain.Get<IText>(appKey + "/queue")` (JSON array of `{id, query, status, outcome}`), which `activity.cs` projects instead of `ReadInvocations()`. `open.cs` from `surface.cs` as for the assistant. `result` operation writes its row to `brain.Get<IText>(appKey + "/result/" + requestId)`.

WordCount `app.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Flutter.Text;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = brain.Setting("App")!;
var app = brain.Get<IApp>(key);
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    var words = request.Input.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Length;
    await brain.Get<IText>(key + "/answer").Set(words == 1 ? "1 word" : $"{words} words");
}
```

- [ ] **Step 5: Run the shipped-compile facts and the OS unit suite**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/DigitalBrain.OS/Apps src/IntoChat/Apps/CustomerResearcher src/IntoChat/Apps/WordCount src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/VendorAppFacts.cs
git commit -m "Shipped apps: one reaction per synapse; requests arrive as AppRequested, results are neurons

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(`git add -A <dir>` is allowed here because every file under these app folders is this task's; check `git status --short` first.)

---

### Task 10: The assistant's agent asks apps through `Request`

**Files:**
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantScenarioFacts.cs`
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentFacts.cs` if it references `InvokeApp`/`AppResponse`
- Modify: `src/DigitalBrain.OS/Apps/Assistant/prompts/system.md` (if it names `Invoke`/`Await`)

**Interfaces:**
- Consumes: `IApp.Request(operation, input)` via `NeuronSurfaceTools.CallName` with `method = "Request"`, `arguments = ["show", "{...}"]`.

- [ ] **Step 1: Rewrite the failing scenario**

`ShowDataFromDemoInvokesTheDataVisualizerAndOpensItsWindow` becomes `ShowDataFromDemoRequestsTheDataVisualizerAndOpensItsWindow`:

```csharp
var show = JsonSerializer.Serialize(new object[] { "show", """{"title":"Demo","kind":"table","source":"sql","sql":"select * from demo"}""" }, JsonSerializerOptions.Web);
var model = new ScriptedModel(
    Call(NeuronSurfaceTools.CallName, new() { ["contract"] = typeof(IApp).FullName, ["key"] = Visualizer, ["method"] = "Request", ["arguments"] = show }),
    Call(NeuronSurfaceTools.CallName, new() { ["contract"] = typeof(IWorkspace).FullName, ["key"] = Scope, ["method"] = "OpenSurface", ["arguments"] = open }));
// ... create the app as before ...
await using var requested = await host.SubscribeAsync<AppRequested>(app, ct);
StampAssistant();
var events = await Turn(host, "show data from Demo", ct);
Assert.Empty(events.OfType<AgentTurnEvent.Failed>());
var signal = await requested.ReadAllAsync(ct).FirstAsync(ct);
Assert.Equal("show", signal.Operation);
StampUser();
var window = Assert.Single((await host.Get<IWorkspace>(Scope).Read()).Windows);
Assert.Equal(Surface, window.Reference.NeuronId);
```

Delete the `answering` task and the `Await` tool call.

- [ ] **Step 2: Run, fix references, run again**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*AssistantScenarioFacts*"`
Expected: PASS after the rewrite. Then run the whole AI test project.

- [ ] **Step 3: Commit**

```bash
git add src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantScenarioFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentFacts.cs src/DigitalBrain.OS/Apps/Assistant/prompts/system.md
git commit -m "AI: the assistant asks an app with IApp.Request and reads neurons for the result

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The shell opens apps by request and renders the surface neuron

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart` (`appOpenPath`, `openApp`, `openDockedApp`)
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart` (`_openApplication`)
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/assistant_app_test.dart`, `application_fixture.dart`

**Interfaces:**
- Consumes: `POST /brains/{b}/apps/{a}/request` → 202 `{requestId}`.
- Produces: `UiClient.requestApp(brainId, appId, operation, input) → Future<String>` (the request id); `UiClient.openApp(brainId, appId, [arguments])` posts `operation: "open"` and answers `{ 'id': '$appKey/window', 'title': appId, 'surface': {'kind':'surface','name':'$appKey/surface'} }` where `appKey = '$brainId/apps/$appId'`; `openDockedApp` posts `input: "docked"` and answers `{'kind':'surface','name':'$appKey/surface'}`.

- [ ] **Step 1: Write the failing Dart test**

In `assistant_app_test.dart` (using the existing `application_fixture.dart` fake server):

```dart
test('opening an app posts a request and renders its surface neuron', () async {
  final fixture = await ApplicationFixture.start();
  await fixture.openApp('assistant');
  final request = fixture.server.requests.singleWhere((r) => r.path.endsWith('/apps/assistant/request'));
  expect(request.body['operation'], 'open');
  expect(fixture.renderedSurface, '${fixture.brainId}/apps/assistant/surface');
});
```

Adapt names to the fixture's actual API (`requests`, `renderedSurface` or their equivalents); the fixture must answer `202 {"requestId": "..."}` for `/request`.

- [ ] **Step 2: Run to verify it fails**

Run from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter test test/assistant_app_test.dart`
Expected: FAIL (the client still posts `/ask`).

- [ ] **Step 3: Implement**

`ui_client.dart`:

```dart
static String appRequestPath(String brainId, String appId) =>
    '/brains/${Uri.encodeComponent(brainId)}/apps/${Uri.encodeComponent(appId)}/request';

static String appKey(String brainId, String appId) => '$brainId/apps/$appId';

/// Publishes a request to an app; the app answers through neurons, never through this call.
Future<String> requestApp(String brainId, String appId, String operation, String input) async {
  final body = await jsonRequest('POST', appRequestPath(brainId, appId), {'operation': operation, 'input': input});
  return (body as Map)['requestId'] as String;
}

Future<Map<String, dynamic>> openApp(String brainId, String appId, [Map<String, dynamic> arguments = const {}]) async {
  await requestApp(brainId, appId, 'open', jsonEncode(arguments));
  final key = appKey(brainId, appId);
  return {'id': '$key/window', 'title': appId, 'surface': {'kind': 'surface', 'name': '$key/surface'}, 'kind': 'surface'};
}

Future<Map<String, dynamic>> openDockedApp(String brainId, String appId) async {
  await requestApp(brainId, appId, 'open', 'docked');
  return {'kind': 'surface', 'name': '${appKey(brainId, appId)}/surface'};
}
```

`_openApplication` in `workspace_app.dart` keeps its flow (it already reconciles the workspace after the call and reveals `result['id']`); the window id it reveals is `$key/window`, which the scripts now open with the same id. Delete the `result['surface'] is String` branch (always a map now).

- [ ] **Step 4: Analyze, test, commit**

Run from `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `flutter analyze` then `flutter test`
Expected: clean, PASS.

```bash
git add src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/assistant_app_test.dart src/DigitalBrain.Modules/Google/Flutter/app/shell/test/application_fixture.dart
git commit -m "Shell: opening an app posts a request and renders {app}/surface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: End to end: a request reaches a synapse and the result is a neuron

**Files:**
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/ContentCaptureFacts.cs`, `TraceBudgetFacts.cs` (they post `/ask`; switch to `/request` and read the neuron)

**Interfaces:**
- Consumes: everything above, running in the reference host with the `csharp-sandbox` container.

- [ ] **Step 1: Rewrite `AClickReachesABehaviorAndBack`**

```csharp
[Fact(Timeout = 240_000)]
public async Task ARequestReachesASynapseAndItsAnswerIsANeuron()
{
    var ct = TestContext.Current.CancellationToken;
    var scope = Brain.WorkspaceId;
    var bundle = new DirectoryShippedAppSource(IntoChatApps(), "intochat").Load().Single(candidate => candidate.Name == "word-count");
    (await Brain.HttpClient.PostAsJsonAsync($"/brains/{scope}/apps/import", bundle, ct)).EnsureSuccessStatusCode();
    var answer = Brain.Get<IText>($"{scope}/apps/{bundle.Name}/answer");
    await using var changes = await Brain.Observe<TextChanged>(answer, ct);

    using var requested = await Brain.HttpClient.PostAsJsonAsync($"/brains/{scope}/apps/{bundle.Name}/request",
        new { operation = "ask", input = "a click reaches a behavior" }, ct);

    Assert.Equal(HttpStatusCode.Accepted, requested.StatusCode);
    while ((await answer.Read()).Markdown != "5 words") { await changes.NextAsync(ct: ct); }
    Assert.Equal(SessionStatus.Connected, (await Brain.Get<IBrainRuntime>(BrainRuntimeKeys.For(scope)).Inspect(ct)).Session);
}
```

`ClearingAConversationUpdatesItsRunningShippedProjection` posts `/request` with `operation = "send"` and keeps its chat-projection assertions. In the two Framework E2E facts replace the `/ask` post with the same `/request` post plus a wait on the answer neuron.

- [ ] **Step 2: Run the E2E suites (Docker required)**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` and `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E`
Expected: PASS. Kill any run over five minutes and debug the hang; never extend a timeout.

- [ ] **Step 3: Verification loop in the running system**

1. From `src/DigitalBrain.AppHost`: `aspire run`. Wipe the Azurite volume first (grain state was reshaped).
2. `mcp__aspire__list_resources`: every resource Running/Healthy.
3. Through `digitalbrain-mcp` (`/brains/{brainId}/mcp`): `neurons_context`; `neurons_call` `IApp.Request("open", "")` on `{brain}/apps/assistant`; `neurons_get` `{brain}/apps/assistant/surface` shows the composed surface. `neurons_call` `IButton.Click` on `{brain}/apps/assistant/new` twice; `neurons_get` `{brain}/apps/assistant/conversation` changes twice (two ids, in order). `neurons_get` `IBrainPrograms.Describe("{brain}/apps/assistant")` shows every synapse `Running`.
4. `mcp__aspire__list_traces`: one trace per `ButtonClicked` with the synapse's `IText.Set` span inside it; `list_structured_logs` shows no `Disarmed`, no `AppInvoked`.
5. Write a non-compiling synapse through `POST /apps/assistant/implement` or `IApp.WriteBehavior`: the call fails with the compiler message; `Describe` still shows the previous program.

- [ ] **Step 4: Regression net and commit**

Run the unit and E2E suites of every project touched in Tasks 1–12 (CSharp, Apps, Postgres, AI, OS unit, OS E2E, Framework E2E, Flutter shell).

```bash
git add src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/ContentCaptureFacts.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/TraceBudgetFacts.cs
git commit -m "E2E: a request reaches a synapse and its answer is a neuron

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: CLAUDE.md reflects the new shape

**Files:**
- Modify: `CLAUDE.md` (the "Self-programming apps" section)

- [ ] **Step 1: Edit**

In the bundle listing add `lib/*.cs      shared classes every synapse compiles with`. Replace the "Subscriptions are code" bullet's first sentence with: "A synapse is one reaction: one `await foreach` over one `brain.On<T>(source)`. An app's own operations arrive as `AppRequested`; nothing waits for a script, a result is neuron state." Add to Hazards: "An app's program is compiled and assigned whole by `IBrainPrograms.Assign`; a write that does not compile fails the write."

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: synapses are one reaction each; AppRequested replaces invocations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
