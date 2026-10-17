# Framework Structure PR 1: Routine Batch Implementation Plan

> **Superseded by `docs/superpowers/specs/2026-10-09-kernel-design.md`.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the routine moves and deletions of the Framework structure cleanup (§5a and D5–D6 of the spec) so that `src/DigitalBrain.Framework/DigitalBrain.Framework` has no dead code, no test-harness code, no Platform-internal records, and one namespace.

**Architecture:** Every task is a move or a deletion inside the existing design; nothing new is introduced except one additive property, `Neuron<TState>.Exists`. Consumers are updated at every site LSP finds. Tasks are ordered so each leaves every affected project building and its suites green.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans, Aspire, xunit v3, `ModuleTest` harness (`src/Testing/DigitalBrain.Testing.Module`), `csharp-ls` over the gitignored root `DigitalBrain-lsp.sln`.

**Spec:** `docs/superpowers/plans/2026-10-07-framework-structure.md` (§5a items 1–6, D5, D6, D8 step 1).

**Deviations from the spec, decided while planning (facts, not design):**
- `DigitalBrainNames.MasterKeyConfigurationKey` / `MasterKeyEnvironmentVariable` stay in Framework. `DigitalBrain.Aspire.Hosting` consumes the environment-variable name and references only Framework (its csproj has one `ProjectReference`), so the Platform ring cannot own it.
- `CSharpCatalogNeuron` stays on raw `IPersistentState`. `ICSharpCatalog` declares no signal, and `Neuron<TState>.Save` requires one; adding a signal is a contract decision, not this PR's. Only `KernelNeuron` moves onto `Neuron<TState>`.
- `ContractCatalog.Read()` (the `NeuronType` metadata) is not stripped here: its non-search consumers (`Apps/Creator.cs`, `Apps/Authoring/BuilderTools.cs`) go with the apps redesign. This PR only moves the file.
- Namespaces `DigitalBrain.Framework.Platform.*` are not flattened here; those files move out in PR 3 and would be renamed twice.

## Global Constraints

- Warnings are errors, nullable on, package versions central (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project>`.
- LSP for every move and delete: `documentSymbol` on the declaration line, `findReferences`, then a text search over `src/` as cross-check before deleting. Diagnostics clean before each build. The C# LSP needs `DigitalBrain-lsp.sln` at the repo root (gitignored); regenerate it if missing: `dotnet new sln -n DigitalBrain-lsp --format sln --force -o .` then `dotnet sln DigitalBrain-lsp.sln add --in-root <every csproj in DigitalBrain.slnx>`, kill `csharp-ls.exe`, wait ~3 minutes.
- Concrete collection types in grain state (`Dictionary<,>`, arrays), never `IReadOnlyList`.
- No `/// <summary>`; inline comments only for what code cannot say, and every comment kept true.
- No state compatibility: aliases, keys and record shapes may change freely; no migrations.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`; real grains via `ModuleTest.Create().WithModule<…>()` over mocks.
- Four words only: Neuron, Signal, Behavior, Connector. This PR introduces no type that is a fifth.
- Done means seen running: Task 8 drives the host through `digitalbrain-mcp` and confirms traces.
- Branch: `framework-structure-1`, created from `master` once intochat/digitalbrain#169 has merged (from `framework-cleanup` if it has not). Commit per task. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **An uncreated brain activating** must publish nothing and `Read` must throw, after `KernelNeuron` moves to `Neuron<TState>` whose `Snapshot` materialises an empty `State`. Pinned in Task 4 by the existing `AnUncreatedBrainStaysSilentOnActivation` and the new `ExistsIsFalseUntilTheFirstSave`.
2. **A failed first write of the kernel** must leave the brain uncreated (no `Created`, no handlers run). Pinned in Task 4 by the existing `FailedWriteRollsStateBack` on `Neuron<TState>` plus the new `ExistsIsFalseUntilTheFirstSave`, which asserts `Exists` stays false after a failed write.
3. **A test host composed with module options** must still flatten those options into configuration after the builder leaves Framework. Pinned in Task 5 by the existing `CompositionFacts` and `ModuleOptionsFacts`, now compiled against `DigitalBrain.Testing.Module`.
4. **A grant or connection record crossing the silo boundary** must still serialise after its `[GenerateSerializer]` record moves assemblies. Pinned in Task 6 by the existing `GrantFacts` and `AccountFacts` over real grains.
5. **A host started with `DigitalBrain:ConfigurationFile` set** must still load that file after the constant moves to Aspire.Server. Pinned in Task 6 by the new `ConfigurationFileIsLoadedWhenTheKeyIsSet` in `DigitalBrain.Aspire.Hosting.Tests.Unit`.

---

### Task 1: Delete `ModuleLoaded` and `RuntimeStartupTask`

**Files:**
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/ModuleLoaded.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Hosting/RuntimeStartupTask.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Hosting/BrainHosting.cs:19`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/RuntimeSignalFacts.cs:31-45`
- Modify: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/TypeSearchFacts.cs:79-92`

**Interfaces:**
- Consumes: nothing.
- Produces: `BrainHosting.AddDigitalBrain` no longer registers a startup task; `LocalSignalHub.Publish(Signal)` keeps its signature (still used by `SiloSignalBus` consumers).

- [ ] **Step 1: Confirm the usage set with LSP**

`findReferences` on `ModuleLoaded` (`Signals/ModuleLoaded.cs` line 4, col 22) and on `RuntimeStartupTask` (`Hosting/RuntimeStartupTask.cs` line 5, col 23). Expected references outside the two files: `BrainHosting.cs:19`, `RuntimeSignalFacts.cs:36`, `TypeSearchFacts.cs:87-88`. Cross-check:

```bash
grep -rnw --include=*.cs --exclude-dir=obj "ModuleLoaded\|RuntimeStartupTask" src
```

Expected: the same five lines and the two declarations, nothing else.

- [ ] **Step 2: Remove the two tests**

In `RuntimeSignalFacts.cs` delete the fact `StartupAnnouncesModulesThroughTheSharedHubAndInventoryRemainsAvailable` and the nested `RuntimeFixtureModule` class, and the now-unused usings `Microsoft.Extensions.Logging.Abstractions`, `Orleans.Hosting`, `DigitalBrain.Framework.Signals`. The file keeps `SiloSubscriptionsReceiveOrdinaryNeuronSignalsAndFilterByType`.

In `TypeSearchFacts.cs` delete the fact `ModuleAnnouncementsDoNotChangeTheSelectedComposition` (lines 79–92). Its first assertion is already covered by the other facts in the file.

- [ ] **Step 3: Delete the two source files and the registration**

```bash
git rm src/DigitalBrain.Framework/DigitalBrain.Framework/Signals/ModuleLoaded.cs src/DigitalBrain.Framework/DigitalBrain.Framework/Hosting/RuntimeStartupTask.cs
```

In `BrainHosting.cs` remove line 19 `silo.AddStartupTask<RuntimeStartupTask>();`.

- [ ] **Step 4: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*RuntimeSignalFacts*"
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests -- --filter-method "*TypeSearchFacts*"
```

Expected: build clean, both filtered runs green.

- [ ] **Step 5: Commit**

```bash
git add -A src/DigitalBrain.Framework src/DigitalBrain.Modules/Microsoft/CSharp/tests
git commit -m "Framework: ModuleLoaded and its startup task had only tests as consumers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Delete the MCP form projection of the type catalog

**Files:**
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework/Types/SchemaExtensions.cs`
- Delete: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Sdk/Types/TypeCatalog.v0.json`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Types/TypeCatalog.cs:17-18,31-56`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Sdk/Types/TypeCatalogFacts.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/DigitalBrain.Framework.Tests.Unit.csproj:13`

**Interfaces:**
- Produces: `TypeCatalog` keeps `All`, `Get`, `AllowedFor`, `Validate`; loses `McpFormKinds` and `ToJson`.

- [ ] **Step 1: Confirm the usage set with LSP**

`findReferences` on `ToMcpFormPrimitive` (`Types/SchemaExtensions.cs` line 15, col 37), `McpFormKinds` (`Types/TypeCatalog.cs` line 17, col 40), `ToJson` (line 31, col 30). Expected: only `TypeCatalog.cs` and `TypeCatalogFacts.cs`. Cross-check:

```bash
grep -rnw --include=*.cs --exclude-dir=obj "ToMcpFormPrimitive\|McpFormPrimitive\|McpFormKinds\|ToJson" src | grep -v "Flutter\|Json\.ToJson\|JsonNode"
```

Expected: hits only in the two files above (`ToJson` is a common name; ignore `System.Text.Json` and Flutter Dart-mirror hits).

- [ ] **Step 2: Remove the tests and the embedded resource**

In `TypeCatalogFacts.cs` delete the facts `FlatSubsetMapsOneToOneToMcpFormElicitation` (line 22), `SecretRefIsNeverCollectedByAForm` (line 42) and `EmbeddedJsonCatalogMatchesTheCodeCatalog` (line 99), plus the `FlatSubset` field and any `JsonNode`/`Assembly` usings they alone needed. Keep `CatalogIsClosedOverExactlyTheV0Kinds` and the date/number facts.

In the test csproj delete the `<EmbeddedResource Include="Sdk/Types/TypeCatalog.v0.json" />` item group (line 13) and `git rm` the json file.

- [ ] **Step 3: Delete the projection**

```bash
git rm src/DigitalBrain.Framework/DigitalBrain.Framework/Types/SchemaExtensions.cs
```

In `TypeCatalog.cs` delete the `McpFormKinds` property (lines 17–18) and the whole `ToJson` method (lines 31–56), and the now-unused `using System.Text.Json.Nodes;`.

- [ ] **Step 4: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*TypeCatalogFacts*"
dotnet build src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/DigitalBrain.Modules.Flutter.csproj
dotnet build src/DigitalBrain.Modules/Supabase/DigitalBrain.Modules.Supabase/DigitalBrain.Modules.Supabase.csproj
```

Expected: all clean (Flutter and Supabase use `TypeCatalog.Validate/AllowedFor/Get`, which stay).

- [ ] **Step 5: Commit**

```bash
git add -A src/DigitalBrain.Framework
git commit -m "Framework: the MCP form projection of the type catalog had no consumer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Delete `CallerContext.IntentId` and the redundant usings

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Enforcement/CallerContext.cs:30`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests/AllowanceFacts.cs:335`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/ModuleOptionsSerialization.cs:1-4`

- [ ] **Step 1: Confirm with LSP**

`findReferences` on `IntentId` in `Enforcement/CallerContext.cs` (line 30, col 37). Expected: no reads; one object-initializer assignment in `AllowanceFacts.cs:335`. Cross-check:

```bash
grep -rn --include=*.cs --exclude-dir=obj -B6 "IntentId = " src | grep -B6 "StampedBy" | grep "IntentId"
```

Expected: exactly the `AllowanceFacts` line.

- [ ] **Step 2: Delete the property and its one assignment**

In `CallerContext.cs` remove `[Id(6)] public string? IntentId { get; init; }` and renumber `ConversationId` from `[Id(7)]` to `[Id(6)]`. In `AllowanceFacts.cs` remove the line `IntentId = "intent-stage",`.

In `ModuleOptionsSerialization.cs` remove the four `using System.Reflection; using System.Text.Json; using System.Text.Json.Nodes; using System.Text.Json.Serialization;` lines (LSP CS8019 on each; `GetProperties()` is a `Type` member and needs no using).

- [ ] **Step 3: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests -- --filter-method "*AllowanceFacts*"
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*EnforcementFacts*"
```

Expected: clean and green.

- [ ] **Step 4: Commit**

```bash
git add -A src/DigitalBrain.Framework src/DigitalBrain.Modules/DigitalBrain/Compute/tests
git commit -m "Framework: CallerContext.IntentId was never read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `Neuron<TState>.Exists`, and `KernelNeuron` on `Neuron<TState>`

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Neuron.cs:57-87`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Brain/KernelNeuron.cs`
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/PersistenceFacts.cs`
- Test (existing, must stay green): `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Brain/BrainFacts.cs`

**Interfaces:**
- Produces: `protected bool Exists { get; }` on `Neuron<TState>`, true when the storage record exists (`IPersistentState<TState>.RecordExists`). `Snapshot` and `Save(TState next, Signal changed, Signal? acted = null)` unchanged.

- [ ] **Step 1: Write the failing fact**

In `PersistenceFacts.cs`, make the fake store's `RecordExists` follow writes and expose `Exists` on the probe:

```csharp
public sealed class ProbeNeuron(IPersistentState<ProbeState> state) : Neuron<ProbeState>(state)
{
    public int Value => Snapshot.Value;
    public bool Saved => Exists;
    public Task Set(int value) => Save(new ProbeState { Value = value }, new Number(value));
}

internal sealed class FailingProbeState(ProbeState initial, bool exists = true) : IPersistentState<ProbeState>
{
    public ProbeState State { get; set; } = initial;
    public string Etag => string.Empty;
    public bool RecordExists { get; private set; } = exists;
    public bool FailNextWrite { get; set; }
    public Task ClearStateAsync() => Task.CompletedTask;
    public Task ReadStateAsync() => Task.CompletedTask;
    public Task WriteStateAsync()
    {
        if (FailNextWrite) { return Task.FromException(new InvalidOperationException("Storage is unavailable.")); }
        RecordExists = true;
        return Task.CompletedTask;
    }
}
```

Add the fact (the existing `FailedWriteRollsStateBack` constructs `new ProbeNeuron(storage)` directly over the fake; this does the same):

```csharp
[Fact]
public async Task ExistsIsFalseUntilTheFirstSave()
{
    var store = new FailingProbeState(new ProbeState(), exists: false) { FailNextWrite = true };
    var probe = new ProbeNeuron(store);
    await Assert.ThrowsAsync<InvalidOperationException>(() => probe.Set(1));
    Assert.False(probe.Saved);
    store.FailNextWrite = false;
    await probe.Set(2);
    Assert.True(probe.Saved);
    Assert.Equal(2, probe.Value);
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*ExistsIsFalseUntilTheFirstSave*"
```

Expected: compile error, `Exists` is not defined.

- [ ] **Step 3: Add `Exists` to `Neuron<TState>`**

In `Neuron.cs`, inside `Neuron<TState>`:

```csharp
// Storage hands back an uninitialized record before the first write, so existence is the record's, not the object's.
protected bool Exists => store.RecordExists;
```

Move that comment here from `KernelNeuron.cs` (it is deleted there in the next step).

- [ ] **Step 4: Run the new fact and the persistence suite**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*PersistenceFacts*"
```

Expected: green.

- [ ] **Step 5: Move `KernelNeuron` onto `Neuron<State>`**

Replace the class in `Brain/KernelNeuron.cs` with:

```csharp
using DigitalBrain.Framework.Enforcement;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.Framework;

// The brain's first neuron: its state, its creation, its lifecycle signals.
[GrainType("kernel")]
internal sealed class KernelNeuron(
    [PersistentState("kernel", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<State> store,
    IEnumerable<ICreationHandler> creation,
    ILogger<KernelNeuron> logger) : Neuron<State>(store), IKernel
{
    internal bool IsCreated => Exists;

    public Task<State> Read()
        => Task.FromResult(IsCreated ? Snapshot : throw new InvalidOperationException("This brain has not been created."));

    public async Task Create(Owner owner)
    {
        ArgumentNullException.ThrowIfNull(owner);
        RequireCreator(owner);
        if (IsCreated) { return; }
        var created = new Created(owner);
        await Save(new State(owner, DateTimeOffset.UtcNow), created);
        foreach (var handler in creation)
        {
            // One handler failing must not fail the brain; Activated handlers catch up later.
            try { await handler.Created(this, created, CancellationToken.None); }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning(error, "Creation handler {Handler} failed for brain {Brain}.", handler.GetType().Name, this.GetPrimaryKeyString()); }
        }
        await PublishAsync(new Activated(owner));
    }

    internal Task Woke() => IsCreated ? PublishAsync(new Activated(Snapshot.Owner)) : Task.CompletedTask;

    // Creating is the platform's act, or the owner's own. Host code with no stamped caller is trusted.
    private static void RequireCreator(Owner owner)
    {
        if (!CallerContextStamper.TryGet(out var caller)) { return; }
        if (caller.Kind == CallerKind.Platform || caller.AccountId == owner.AccountId) { return; }
        throw new UnauthorizedAccessException("Only the platform or the owner may create a brain.");
    }
}

// Publishes Activated on every wake of a created brain.
internal sealed class KernelActivation : IActivationHandler<KernelNeuron>
{
    public Task Activated(KernelNeuron neuron, CancellationToken cancellationToken) => neuron.Woke();
}
```

`Save` writes, rolls back on failure, then publishes `Created`: the same order the old code had by hand.

- [ ] **Step 6: Build and run the kernel facts**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*BrainFacts*"
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*BrainPresenceFacts*"
```

Expected: `CreateIsIdempotent`, `ACreatedBrainPublishesActivatedOnBirthAndOnEveryLaterWake`, `AnUncreatedBrainStaysSilentOnActivation` and the presence facts green.

- [ ] **Step 7: Commit**

```bash
git add -A src/DigitalBrain.Framework
git commit -m "Framework: Neuron<TState> knows whether its record exists; the kernel is a Neuron<State>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Move the composition builder to the test harness

**Files:**
- Move (`git mv`) from `src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/` to `src/Testing/DigitalBrain.Testing.Module/Composition/`: `BrainCompositionBuilder.cs`, `BrainComposition.cs`, `ModuleDraft.cs`, `ModuleOptionsSlot.cs`, `ModuleConfiguration.cs`, `ModuleComposition.cs`
- Modify: `src/Testing/DigitalBrain.Testing.Module/ModuleTestBuilder.cs:1-16`
- Modify: `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs:25`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/CompositionFacts.cs` (usings)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Composition/ModuleOptionsFacts.cs` (usings, if it names any moved type)

**Interfaces:**
- Consumes from Framework (public, unchanged): `Module`, `Module<TOptions>`, `IModuleOptions`, `ModuleDefinition`, `ModuleOptionsSerialization.Compile<TModule,TOptions>`, `ModuleSettingsValidation.ValidatePublicSettings`.
- Produces: the same six types under namespace `DigitalBrain.Testing.Module`, same signatures.

- [ ] **Step 1: Confirm with LSP that Framework has no other consumer**

`findReferences` on `BrainCompositionBuilder` (line 3, col 21), `BrainComposition` (line 5, col 21), `ModuleComposition.Resolve` (`ModuleComposition.cs` line 5, col 51). Expected consumers: `ModuleTestBuilder.cs`, `ModuleTest.cs:25`, `CompositionFacts.cs`, and the six files themselves. Cross-check:

```bash
grep -rlw --include=*.cs --exclude-dir=obj "BrainCompositionBuilder\|BrainComposition\|ModuleDraft\|ModuleOptionsSlot\|ModuleConfiguration\|ModuleComposition" src | grep -v "DigitalBrain.Framework/DigitalBrain.Framework/Composition"
```

Expected: only the three consumer files.

- [ ] **Step 2: Move the files**

```bash
mkdir -p src/Testing/DigitalBrain.Testing.Module/Composition
for f in BrainCompositionBuilder BrainComposition ModuleDraft ModuleOptionsSlot ModuleConfiguration ModuleComposition; do git mv src/DigitalBrain.Framework/DigitalBrain.Framework/Composition/$f.cs src/Testing/DigitalBrain.Testing.Module/Composition/$f.cs; done
```

- [ ] **Step 3: Rename the namespace and resolve the `Module` name clash**

In each moved file change `namespace DigitalBrain.Framework;` to `namespace DigitalBrain.Testing.Module;` and add `using DigitalBrain.Framework;`. Inside that namespace the identifier `Module` resolves to the namespace, so add `using ModuleContract = DigitalBrain.Framework.Module;` (the alias `ModuleTestBuilder.cs` already uses) and replace every bare `Module` type reference in the six files with `ModuleContract`: the `where TModule : Module, new()` constraints, `ModuleDraft.Module` property type, `ModuleDefinition(Module module)` call sites, `RequireModules(IEnumerable<Module> modules)`. `Module<TOptions>` references stay as `Module<TOptions>` only if they compile; otherwise alias them too (`using ModuleWithOptions = DigitalBrain.Framework.Module<>;` is not legal C#, so write `DigitalBrain.Framework.Module<TOptions>` in full).

In `ModuleTestBuilder.cs` and `ModuleTest.cs` nothing changes except that the types are now in their own namespace (no new using needed). In `CompositionFacts.cs` add `using DigitalBrain.Testing.Module;` (the project already references it).

- [ ] **Step 4: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*CompositionFacts*"
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-method "*ModuleOptionsFacts*"
dotnet test --project src/Testing/DigitalBrain.Testing.Module.Tests.Unit
```

Expected: clean and green.

- [ ] **Step 5: Commit**

```bash
git add -A src/DigitalBrain.Framework src/Testing/DigitalBrain.Testing.Module
git commit -m "Testing: the composition builder lives with its only consumer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Move Platform-internal records into the Platform ring and the configuration-file names into Aspire.Server

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Identity/Authority/Invitation.cs` (from `Platform/Identity/Accounts.cs:26-35`)
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Identity/Grants/Grant.cs` (from `Platform/Identity/Grants.cs:10-28`, `GrantMode` + `Grant`)
- Rename: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Identity/Grants.cs` → `MemberRole.cs` (keeps only `MemberRole`)
- Move: `Platform/Integrations/Accounts/ConnectionProbe.cs` → `src/DigitalBrain.Platform/DigitalBrain.Platform/Integrations/Accounts/ConnectionProbe.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Integrations/Accounts/ConnectionSignals.cs` (from `Platform/Integrations/Accounts/IConnectionRegistry.cs:43-46`)
- Move: `Integrations/Accounts/ScopedConnections.cs` → `src/DigitalBrain.Platform/DigitalBrain.Platform/Integrations/Accounts/ScopedConnections.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Hosting/DigitalBrainNames.cs:14-17` (remove `ConfigurationFile*`)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs:19-27`
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Hosted/AspireTestSession.cs:147`
- Test: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/ConfigurationFileFacts.cs` (new)
- Modify (usings only): the 15 Platform files LSP lists for `Grant`, `GrantMode`, `Invitation`, `IConnectionProbe`, `ConnectionProbeResult`, `ConnectionNotConfiguredException`, `ConnectionStatusChanged`, `ConnectionDisconnected`, `ScopedConnections.Visible`

**Interfaces:**
- Produces: identical records and interfaces under `DigitalBrain.Platform.Identity` (`Invitation`, `Grant`, `GrantMode`) and `DigitalBrain.Platform.Integrations.Accounts` (`IConnectionProbe`, `ConnectionProbeResult`, `ConnectionProbeOutcome`, `ConnectionNotConfiguredException`, `ConnectionStatusChanged`, `ConnectionDisconnected`, `ScopedConnections`). `[GenerateSerializer, Alias(...)]` attributes kept verbatim. `ServerHostingExtensions.ConfigurationFileKey` / `ConfigurationFileEnvironmentVariable` public consts.
- `MemberRole` stays in Framework (`IIdentityDirectory.ShareBrainAsync` takes it).

- [ ] **Step 1: Confirm with LSP, per symbol**

`findReferences` on each: `Invitation` (`Accounts.cs` line 26), `Grant` (`Grants.cs` line 19), `GrantMode` (line 10), `IConnectionProbe` (`ConnectionProbe.cs` line 21), `ConnectionStatusChanged` (`IConnectionRegistry.cs` line 43), `ConnectionDisconnected` (line 46), `ScopedConnections.Visible` (line 9), `ConfigurationFileKey` (`DigitalBrainNames.cs` line 16), `ConfigurationFileEnvironmentVariable` (line 17). Expected: every consumer is under `src/DigitalBrain.Platform/`, except the two `ConfigurationFile*` consumers (`ServerHostingExtensions.cs:27`, `AspireTestSession.cs:147`). Cross-check:

```bash
grep -rnw --include=*.cs --exclude-dir=obj "Invitation\|GrantMode\|IConnectionProbe\|ConnectionProbeResult\|ConnectionNotConfiguredException\|ConnectionStatusChanged\|ConnectionDisconnected\|ScopedConnections\|ConfigurationFileKey\|ConfigurationFileEnvironmentVariable" src | grep -v "^src/DigitalBrain.Platform/\|^src/DigitalBrain.Framework/DigitalBrain.Framework/"
```

Expected: only the two Aspire/E2E lines. (`Grant` alone is too common a word to grep; LSP is authoritative for it.)

- [ ] **Step 2: Write the failing Aspire fact**

Create `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/ConfigurationFileFacts.cs`:

```csharp
using DigitalBrain.Aspire.Server;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace DigitalBrain.Aspire.Hosting.Tests.Unit;

public sealed class ConfigurationFileFacts
{
    [Fact]
    public void ConfigurationFileIsLoadedWhenTheKeyIsSet()
    {
        var path = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName() + ".json");
        File.WriteAllText(path, """{ "DigitalBrain": { "Probe": "from-file" } }""");
        try
        {
            var builder = Host.CreateApplicationBuilder();
            builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                [ServerHostingExtensions.ConfigurationFileKey] = path,
            });
            builder.AddDigitalBrainServer(server => { });
            Assert.Equal("from-file", builder.Configuration["DigitalBrain:Probe"]);
            Assert.Equal("DigitalBrain__ConfigurationFile", ServerHostingExtensions.ConfigurationFileEnvironmentVariable);
        }
        finally { File.Delete(path); }
    }
}
```

`DigitalBrain.Aspire.Hosting.Tests.Unit` already references `DigitalBrain.Aspire.Server` (csproj line 7). If `AddDigitalBrainServer` cannot run on a bare `Host.CreateApplicationBuilder()` because `AddServiceDefaults` demands something the test host lacks, narrow the fact to the two constants and keep the file-loading assertion in Testing.E2E's `AspireTestSession`, which exercises the same key.

Note for the architecture test: `BoundaryFacts.IsCredentialContract` matches interfaces by the `DigitalBrain.Framework.Platform.*` namespaces. `IConnectionProbe` leaves that namespace, so it stops being a "credential contract" there; that is correct (it is an implementation seam of the Platform ring, not a credential-bearing neuron contract).

- [ ] **Step 3: Run it to see it fail**

```bash
dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit -- --filter-method "*ConfigurationFileIsLoadedWhenTheKeyIsSet*"
```

Expected: compile error, `ServerHostingExtensions.ConfigurationFileKey` not defined.

- [ ] **Step 4: Move the configuration-file names**

In `ServerHostingExtensions.cs` add beside `StandaloneKey`:

```csharp
// An optional JSON file of additional configuration the server loads last (the secrets-file
// pattern): deployment credentials, test seeds, any setting that must not travel as plain env.
public const string ConfigurationFileKey = "DigitalBrain:ConfigurationFile";
public const string ConfigurationFileEnvironmentVariable = "DigitalBrain__ConfigurationFile";
```

and change line 27 to read `builder.Configuration[ConfigurationFileKey]`. In `AspireTestSession.cs:147` replace `DigitalBrainNames.ConfigurationFileEnvironmentVariable` with `ServerHostingExtensions.ConfigurationFileEnvironmentVariable` (add `using DigitalBrain.Aspire.Server;` if absent; Testing.E2E references Aspire.Server). Delete the two constants and their comment from `DigitalBrainNames.cs`.

- [ ] **Step 5: Run the fact**

```bash
dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit -- --filter-method "*ConfigurationFileIsLoadedWhenTheKeyIsSet*"
```

Expected: green.

- [ ] **Step 6: Move the Platform-internal records**

Create `Identity/Authority/Invitation.cs` in the Platform ring:

```csharp
namespace DigitalBrain.Platform.Identity;

[GenerateSerializer, Alias("identity.invitation")]
public sealed record Invitation
{
    [Id(0)] public required string Code { get; init; }
    [Id(1)] public required string AccountId { get; init; }
    [Id(2)] public required string WorkspaceId { get; init; }
    [Id(3)] public required MemberRole Role { get; init; }
    [Id(4)] public string? Email { get; init; }
    [Id(5)] public DateTimeOffset CreatedAt { get; init; }
    [Id(6)] public bool Accepted { get; init; }
}
```

(`MemberRole` resolves through `using DigitalBrain.Framework.Platform.Identity;`, which the Platform identity files already have.) Delete the record from Framework `Accounts.cs`.

Create `Identity/Grants/Grant.cs`:

```csharp
namespace DigitalBrain.Platform.Identity;

public enum GrantMode
{
    Once = 0,
    ThisChat = 1,
    Always = 2,
}

// Semantic type ids double as permission scopes, e.g. "person.birthDate".
[GenerateSerializer, Alias("identity.grant")]
public sealed record Grant
{
    [Id(0)] public required string AppId { get; init; }
    [Id(1)] public required string SemanticTypeId { get; init; }
    [Id(2)] public required GrantMode Mode { get; init; }
    [Id(3)] public required string WorkspaceId { get; init; }
    [Id(4)] public string? ConversationId { get; init; }
    [Id(5)] public DateTimeOffset GrantedAt { get; init; }
    [Id(6)] public bool Revoked { get; init; }
}
```

`git mv` Framework `Platform/Identity/Grants.cs` to `Platform/Identity/MemberRole.cs` and leave only the `MemberRole` enum in it.

`git mv` Framework `Platform/Integrations/Accounts/ConnectionProbe.cs` to the Platform ring's `Integrations/Accounts/ConnectionProbe.cs`; change its namespace to `DigitalBrain.Platform.Integrations.Accounts`. Same for `Integrations/Accounts/ScopedConnections.cs` (it needs `using DigitalBrain.Framework.Enforcement;` and `using DigitalBrain.Framework.Platform.Integrations.Accounts;` for `BrainScope` and `Connection`, which it already has).

Create the Platform ring's `Integrations/Accounts/ConnectionSignals.cs`:

```csharp
using DigitalBrain.Framework.Platform.Integrations.Accounts;

namespace DigitalBrain.Platform.Integrations.Accounts;

[GenerateSerializer, Alias("connections.status-changed")]
public sealed record ConnectionStatusChanged(string ConnectionId, string IntegrationId, ConnectionStatus Status) : Signal;

[GenerateSerializer, Alias("connections.disconnected")]
public sealed record ConnectionDisconnected(string ConnectionId) : Signal;
```

and delete the two records from Framework `IConnectionRegistry.cs`.

- [ ] **Step 7: Fix usings at every consumer LSP listed**

Files in `DigitalBrain.Platform` whose namespace is `DigitalBrain.Platform.Identity.*` or `DigitalBrain.Platform.Integrations.Accounts` see the moved types without a using; `PlatformHosting.cs` already imports both. In `DigitalBrain.Platform.Tests.Unit` the facts `Identity/BrainMembershipFilterFacts.cs`, `Identity/GrantFacts.cs`, `Identity/ScopedAuthorityFacts.cs`, `PlatformHostingFacts.cs` (`using DigitalBrain.Platform.Identity;`) and `Integrations/AccountFacts.cs` (`using DigitalBrain.Platform.Integrations.Accounts;`). Let the build name any file this list misses; add the using there.

- [ ] **Step 8: Build and test**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet build src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrain.Aspire.Server.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

Expected: builds clean; Platform suite green except the two `ScopedAuthorityFacts` already failing on master (same-named brains in two accounts), which must fail the same way before and after; architecture suite unchanged from its master state.

- [ ] **Step 9: Commit**

```bash
git add -A src/DigitalBrain.Framework src/DigitalBrain.Platform src/DigitalBrain.Aspire src/Testing
git commit -m "Platform-internal records live in the Platform ring; configuration-file names in Aspire.Server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Fold the folders and flatten the namespace

**Files (all under `src/DigitalBrain.Framework/DigitalBrain.Framework/`):**
- Move to `Runtime/`: `Neuron.cs`, `IActivationHandler.cs`, `ObserverOptions.cs`
- Move to `Runtime/Brain/`: `Brain/KernelNeuron.cs`, `Brain/CurrentBrain.cs`, `Brain/ICreationHandler.cs`, `Brain/IDigitalBrains.cs`
- Move to `Runtime/Signalling/`: `LocalSignalHub.cs`, `SiloSignalBus.cs`, `Signals/IBrainSubscriptions.cs`, `Signals/ISignalSubscription.cs`, `Signals/ILocalSignalHub.cs`
- Move to `Runtime/Hosting/`: `Hosting/BrainHosting.cs`, `Hosting/DigitalBrainNames.cs`
- Move to `Callers/`: `Enforcement/CallerContext.cs`, `CallerContextStamper.cs`, `CallFilter.cs`, `ICallFilter.cs`, `ICallFilterStage.cs`, `CallRequest.cs`, `NeuronAccess.cs`, `NeuronCallFilter.cs`, `BrainScope.cs`
- Move to `Modules/`: `Composition/Module.cs`, `ModuleId.cs`, `IModuleOptions.cs`, `ModuleDefinition.cs`, `ModuleInventory.cs`, `ModuleOptionsSerialization.cs`, `DigitalBrainConfiguration.cs`, `ModuleSettingsValidation.cs`, `ContractCatalog.cs`, `ContractCatalogHosting.cs`, `NeuronType.cs`, `NeuronTypeSearch.cs`, `Enforcement/PlatformAssemblyAttribute.cs`, `Enforcement/PlatformOnlyAttribute.cs`
- Move to `Http/`: `Enforcement/BrainRoutes.cs`, `Enforcement/BrainAccessFilter.cs`, `Enforcement/BrainAccess.cs`, `HttpSurfaces/IHttpSurface.cs`, `HttpSurfaces/HttpSurfaceExtensions.cs` (joining `IHttpModule.cs`, `ModuleEndpoints.cs`, `ModuleRouteGuard.cs`)
- Unchanged location: `Types/`, `Platform/`, `Auth/`, `Capacity/`, `Discovery/`, `Metering/`, `Vectors/`, `IntentContext.cs`, `AppGrainType.cs`
- Namespace to `DigitalBrain.Framework`: every file that declared `DigitalBrain.Framework.Enforcement`, `DigitalBrain.Framework.Http`, `DigitalBrain.Framework.Signals`, `DigitalBrain.Framework.Types`
- Consumers: every file with `using DigitalBrain.Framework.Enforcement;` / `.Http;` / `.Signals;` / `.Types;` or a qualified `DigitalBrain.Framework.Enforcement.` reference (about 190 files and 49 qualified sites across modules, Platform, OS, MCP, Aspire, Testing)

**Interfaces:**
- Produces: the same public types, all in `DigitalBrain.Framework`. No signature changes.

- [ ] **Step 1: Move the files**

```bash
cd src/DigitalBrain.Framework/DigitalBrain.Framework
mkdir -p Runtime/Brain Runtime/Signalling Runtime/Hosting Callers Modules
git mv Neuron.cs IActivationHandler.cs ObserverOptions.cs Runtime/
git mv Brain/KernelNeuron.cs Brain/CurrentBrain.cs Brain/ICreationHandler.cs Brain/IDigitalBrains.cs Runtime/Brain/
git mv LocalSignalHub.cs SiloSignalBus.cs Signals/IBrainSubscriptions.cs Signals/ISignalSubscription.cs Signals/ILocalSignalHub.cs Runtime/Signalling/
git mv Hosting/BrainHosting.cs Hosting/DigitalBrainNames.cs Runtime/Hosting/
git mv Enforcement/CallerContext.cs Enforcement/CallerContextStamper.cs Enforcement/CallFilter.cs Enforcement/ICallFilter.cs Enforcement/ICallFilterStage.cs Enforcement/CallRequest.cs Enforcement/NeuronAccess.cs Enforcement/NeuronCallFilter.cs Enforcement/BrainScope.cs Callers/
git mv Composition/Module.cs Composition/ModuleId.cs Composition/IModuleOptions.cs Composition/ModuleDefinition.cs Composition/ModuleInventory.cs Composition/ModuleOptionsSerialization.cs Composition/DigitalBrainConfiguration.cs Composition/ModuleSettingsValidation.cs Composition/ContractCatalog.cs Composition/ContractCatalogHosting.cs Composition/NeuronType.cs Composition/NeuronTypeSearch.cs Enforcement/PlatformAssemblyAttribute.cs Enforcement/PlatformOnlyAttribute.cs Modules/
git mv Enforcement/BrainRoutes.cs Enforcement/BrainAccessFilter.cs Enforcement/BrainAccess.cs HttpSurfaces/IHttpSurface.cs HttpSurfaces/HttpSurfaceExtensions.cs Http/
rmdir Brain Signals Hosting Enforcement Composition HttpSurfaces
cd ../../..
```

Expected: `git status` shows renames only; the empty folders are gone.

- [ ] **Step 2: Flatten the declaring namespaces**

```bash
grep -rl --include=*.cs --exclude-dir=obj "^namespace DigitalBrain.Framework.\(Enforcement\|Http\|Signals\|Types\);" src/DigitalBrain.Framework/DigitalBrain.Framework | xargs sed -i 's/^namespace DigitalBrain\.Framework\.\(Enforcement\|Http\|Signals\|Types\);/namespace DigitalBrain.Framework;/'
```

Then inside Framework itself, remove the now-redundant `using DigitalBrain.Framework.Enforcement;`, `using DigitalBrain.Framework.Signals;`, `using DigitalBrain.Framework.Types;` lines and rewrite the two qualified references: `NeuronAccess.ForBrainKey` uses `DigitalBrain.Framework.Platform.Integrations.ConnectionKeys` (unchanged, that namespace stays) and `ConnectorDefinition.cs` uses `DigitalBrain.Framework.Types.SecretRef` → `SecretRef`.

- [ ] **Step 3: Flatten every consumer**

```bash
grep -rl --include=*.cs --exclude-dir=obj "using DigitalBrain\.Framework\.\(Enforcement\|Http\|Signals\|Types\);" src | xargs sed -i '/^using DigitalBrain\.Framework\.\(Enforcement\|Http\|Signals\|Types\);$/d'
grep -rl --include=*.cs --exclude-dir=obj "DigitalBrain\.Framework\.\(Enforcement\|Http\|Signals\|Types\)\." src | xargs sed -i 's/DigitalBrain\.Framework\.\(Enforcement\|Http\|Signals\|Types\)\./DigitalBrain.Framework./g'
```

A file that had only the sub-namespace using and no `using DigitalBrain.Framework;` now fails to compile; the build names it. Add `using DigitalBrain.Framework;` to each such file. Expected count of files touched: about 190 usings and 49 qualified sites (from the pre-move census).

Also update the architecture test `src/Testing/DigitalBrain.Architecture.Tests/BoundaryFacts.cs:96-97`: its namespace list names `DigitalBrain.Framework.Platform.*`, which does not change; confirm no line there names `.Enforcement`, `.Http`, `.Signals` or `.Types` (LSP `findReferences` on each string is not possible; use `grep -n "Framework\.\(Enforcement\|Http\|Signals\|Types\)" src/Testing/DigitalBrain.Architecture.Tests/*.cs` and expect no hits after the sed).

- [ ] **Step 4: Build everything that consumes Framework, in dependency order**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet build src/DigitalBrain.Client/DigitalBrain.Client.Orleans/DigitalBrain.Client.Orleans.csproj
dotnet build src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/DigitalBrain.Aspire.Server.csproj
dotnet build src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrain.Aspire.Hosting.csproj
dotnet build src/DigitalBrain.Mcp/DigitalBrain.Mcp/DigitalBrain.Mcp.csproj
dotnet build src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
```

`DigitalBrain.OS` references every module, so a clean OS build proves every module compiles. Expected: all clean; fix any missing `using DigitalBrain.Framework;` the builds name, then rebuild.

- [ ] **Step 5: LSP diagnostics**

Open `Runtime/Neuron.cs`, `Callers/NeuronCallFilter.cs`, `Http/BrainRoutes.cs`, `Modules/ContractCatalog.cs` and one consumer per ring (`src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs`, `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/FlutterModule.cs`) and confirm zero diagnostics.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "Framework: one namespace; folders say runtime, callers, modules, http, types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Regression net and the running system

**Files:** none modified unless a suite fails.

- [ ] **Step 1: Run every suite of a project this PR touched**

```bash
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.E2E
dotnet test --project src/Testing/DigitalBrain.Testing.Module.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit
dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Compute/tests/DigitalBrain.Modules.Compute.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
```

Expected: green, except facts documented as already failing on master in the #169 description (Apps tests, four C# `ISynapse` files, two `ScopedAuthorityFacts`, repo-layout and appsettings-path facts in Architecture/OS). Any new failure is this PR's to fix before continuing. Record the before/after failure lists in the PR description.

- [ ] **Step 2: Run the host**

From `src/DigitalBrain.AppHost`: `aspire run`. Then `mcp__aspire__list_resources`: every resource Running/Healthy. If one is not, `list_console_logs` for it first.

- [ ] **Step 3: Drive the changed paths through `digitalbrain-mcp`**

- `neurons_context`: confirm caller and brain.
- `neurons_get` on the brain's kernel (`IKernel`): `Read` returns the owner and creation time (Task 4: `Neuron<State>` kernel).
- `neurons_list`: the contract list still resolves (Task 7: `ContractCatalog` moved, namespace flattened).
- Through the shell or MCP, open a brain-scoped route (`/brains/{id}/connections`) and confirm a 200 (Task 6: connection types moved; Task 7: `BrainRoutes` moved).

- [ ] **Step 4: Confirm in telemetry**

`mcp__aspire__list_traces` shows the kernel `Read` and the connections route spans; `list_structured_logs` shows no warning from `KernelNeuron` or `BrainAccessFilter`. If telemetry does not match, the change is not done.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin framework-structure-1
gh pr create --base master --title "Framework structure 1: dead code out, harness and Platform code home, one namespace" --body-file docs/superpowers/plans/2026-10-07-framework-structure-pr1.md
```

Append to the PR body the before/after failing-fact lists from Step 1 and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `mcp__ccd_pr__get_status` and bind the PR if it is not reported.
