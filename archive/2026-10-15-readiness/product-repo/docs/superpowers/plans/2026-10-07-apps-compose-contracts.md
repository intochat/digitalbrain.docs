# Apps Compose Contracts (No Tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "tool" as a concept: modules expose only neurons and signals, an app's agent turn names the contracts it composes, and the agent runtime lets the model act on exactly those contracts. The assistant is only the `os/assistant` app.

**Architecture:** `AgentTurn`/`AgentDefinition` carry `Contracts` (full type names) instead of `Tools`. `AgentTurnLoop` (AI module) builds the model's five `neurons_*` actions itself from `NeuronSurface` (Framework), restricted to the turn's contracts, and marks the calls it makes for the model as model-originated so neurons such as `IForm` can withhold values. Every tool factory/source, native tool and the module-hosted assistant are deleted; the two shell routes that lived in the Assistant module move to their owners.

**Tech Stack:** .NET 11 RC, Orleans, Microsoft.Extensions.AI, xUnit v3, `DigitalBrain.Testing.Module`, Flutter (Dart), Aspire, `digitalbrain-mcp`.

**Spec:** `docs/superpowers/specs/2026-10-07-assistant-neuron-tools-design.md` as amended by
`docs/superpowers/specs/2026-10-07-assistant-neuron-tools-amendment-1.md` (the amendment wins on conflict).
Supersedes the earlier plan `docs/superpowers/plans/2026-10-07-assistant-neuron-tools.md` from its Task 8 on;
its Tasks 1–7 are committed on this branch (`framework-cleanup`, head `e9fca96` or later).

## State you start from (committed on `framework-cleanup`)

- `NeuronSurface`, `NeuronContracts`, `NeuronSurfaceTools` live in `src/DigitalBrain.Framework/DigitalBrain.Framework/Modules/` (namespace `DigitalBrain.Framework`). `digitalbrain-mcp` adapts them (`src/DigitalBrain.Mcp/DigitalBrain.Mcp/Tools/NeuronTools.cs`).
- `IApp.Await(Guid)` exists and pushes an invocation's answer.
- Capability registry, tool offers, `IRegistry`, `Postgres.Windows`, the Supabase user surface are gone.
- The Assistant module (`src/DigitalBrain.Modules/DigitalBrain/Assistant/`) still exists with `NeuronAgentTools`, `WorkspaceFormTools`, the `/agent` assistant, and `AssistantScenarioFacts`.
- `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E` and `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E` do **not compile** (they reference removed Supabase types). Task 7 fixes that.

## Plan-time rulings (binding; flagged for the person to review)

1. **Spec open front 1 (external MCP servers) is resolved as "drop now".** With no tool names on a turn, `McpAgentTools`, `IAgentToolSource`, `NativeTools`/`INativeToolContributor` (`browse_web`, `lookup_company`, `websearch`, `repositorydiff`) become unreachable. No app or IntoChat program names any of them (checked: only `chat.cs` and the deleted `AssistantDefinition` name tools). They are deleted in Task 3, together with any type LSP shows is used only by them.
2. **Spec open front 2 (receipts/compute usage):** the shell reads `GET /brains/{id}/compute/usage` (`compute_usage_panel.dart`) and `GET /ai/models` (`workspace_app.dart`). Both routes move to their owners (Compute module, AI module) in Task 5. Writing new usage rows for app turns is **not** in scope; the panel keeps showing what the ledger holds. The receipt/`touched` machinery of the deleted assistant is not ported.
3. `/voice`, `/conversations/{threadId}` and `/agent` have no shell caller (checked: `transcribeWorkspaceAudio`, `readWorkspaceConversation`, `runAgent` are referenced only inside `ui_client.dart`); they are deleted with their Dart client methods.
4. Model-originated marking reuses `CallerContext.ConversationId` (exists, `[Id(6)]`): `AgentTurnLoop` sets it to the run's conversation (the agent's grain key) for each model action and restores the previous context afterwards. `CallerContextStamper.IsModelOriginated(CallerContext)` is `ConversationId is not null`.
5. Verification is `aspire run` + `digitalbrain-mcp` (CLAUDE.md). E2E facts that exist only for `/agent` or the removed table system are deleted, not ported; no Playwright journey and no fake-model tool script is rewritten.

## Global Constraints

- LSP (`csharp-ls`, root `DigitalBrain-lsp.sln`, gitignored — regenerate from `DigitalBrain.slnx` if missing, see memory `csharp-lsp-needs-root-sln`) for every symbol change: `findReferences` before moving or deleting; when LSP returns nothing for a symbol that obviously has uses, cross-check with a text search before any delete. Diagnostics clean before building. Never grep to *change* code.
- Build and test per project, never the `.slnx`: `dotnet build <csproj>`, `dotnet test --project <test project>`.
- Warnings are errors; nullable on; no boilerplate `/// <summary>`; facts with sentence names and `TestContext.Current.CancellationToken`; real grains over mocks.
- No state compatibility: reshape grain state freely; wipe Azurite on a `wireType` error.
- No timeouts raised, no polling added; fix readiness instead.
- A C# record wire-shape change updates Dart in the same task (`flutter analyze` + `flutter test` from `src/DigitalBrain.Modules/Google/Flutter/app/shell`).
- If LSP shows a reference this plan does not list, or a step's assumption is wrong: stop and ask the person before improvising. Do not widen scope.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One commit per task.
- Known pre-existing failures (baseline, not regressions): `DigitalBrain.Architecture.Tests` — 6 facts (ConfigurationKeyLiterals, ModuleKeyGrammar, PersistedState, EveryProjectHasOneSolutionEntry, FullProductStacksBootInFixtures, TheBrainSeenByAProgram); `DigitalBrain.Platform.Tests.Unit` — `ScopedAuthorityFacts` ×2. The gate is "no new failures".

## Review Focus

1. **A contract the app did not name** (e.g. `IConnection` when the turn names only `IPostgresServer`) must be refused by `neurons_call`/`neurons_get` and absent from `neurons_search`/`neurons_list` — test in Task 1.
2. **A model-originated `IForm.Read`** must carry no draft/submitted/secret values while the app's own (non-model) read still does — test in Task 4.
3. **The ConversationId mark must not leak** past a model action: the app script's next call after a turn is not model-originated — test in Task 2.
4. **A turn naming no contracts** must still run (plain chat, zero actions offered), and a turn naming an unknown contract fails the turn with a clear message before any model call — tests in Task 2.
5. **`AppsEndpoints.Ask` on an app that never answers** must not hold the request forever: it returns when the request is aborted (client cancellation), with no fixed 30 s cap or polling — test in Task 6.

---

### Task 1: `NeuronSurface` restricted to a contract set

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Modules/NeuronSurface.cs`
- Test: `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronSurfaceFacts.cs` (existing file; it already has an `UnreachableBrain` double)

**Interfaces:**
- Produces: `public NeuronSurface Restrict(IReadOnlyCollection<string> contracts)` — a surface over the subset; throws `ArgumentException` naming the first unknown/unaddressable contract. `List()`, `Search()`, `Get()`, `Call()` on the restricted surface only see that subset (`Search` filters hits whose `NeuronTypeHit` contract type name is outside the set).

- [ ] **Step 1: Map.** LSP `documentSymbol` on `NeuronSurface.cs`; `goToDefinition` on `NeuronTypeHit` to learn the property holding the contract's full type name (use it below as `hit.<TypeNameProperty>`; if there is none, stop and ask).

- [ ] **Step 2: Failing tests** (append to `NeuronSurfaceFacts`):

```csharp
[Fact]
public async Task ARestrictedSurfaceRefusesAContractTheAppDidNotName()
{
    var surface = new NeuronSurface(new UnreachableBrain(), new NeuronContracts(NeuronContracts.Deployed()), null!)
        .Restrict([typeof(DigitalBrain.Apps.IApp).FullName!]);
    Assert.Equal([typeof(DigitalBrain.Apps.IApp).FullName!], surface.List());
    await Assert.ThrowsAsync<ArgumentException>(() => surface.Call(typeof(DigitalBrain.Postgres.IPostgresServer).FullName!,
        "connection/b/postgres/x", "ReadConnection", "[]", TestContext.Current.CancellationToken));
    Assert.Throws<ArgumentException>(() => surface.Get(typeof(DigitalBrain.Postgres.IPostgresServer).FullName!, "connection/b/postgres/x"));
}

[Fact]
public void RestrictingToAnUnknownContractIsRefused()
{
    var surface = new NeuronSurface(new UnreachableBrain(), new NeuronContracts(NeuronContracts.Deployed()), null!);
    Assert.Throws<ArgumentException>(() => surface.Restrict(["DigitalBrain.Nope.INope"]));
    Assert.Throws<ArgumentException>(() => surface.Restrict([typeof(DigitalBrain.Framework.Platform.Connections.IConnectionIndex).FullName!]));
}
```

(If the Mcp test project does not reference Postgres contracts, add `<ProjectReference Include="../../DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres.Contracts/DigitalBrain.Modules.Postgres.Contracts.csproj" />` so `NeuronContracts.Deployed()` and `typeof` see it.)

- [ ] **Step 3: Run, expect FAIL** (`Restrict` missing): `dotnet test --project src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit -- --filter-class "*NeuronSurfaceFacts*"`

- [ ] **Step 4: Implement.** In `NeuronSurface`, keep the primary constructor and add an optional allow-set:

```csharp
public sealed class NeuronSurface(IDigitalBrain brain, NeuronContracts contracts, NeuronTypeSearch search, IReadOnlySet<string>? allowed = null)
{
    // ...existing fields...

    // The contracts one app composes: nothing outside them is listed, found or callable.
    public NeuronSurface Restrict(IReadOnlyCollection<string> names)
    {
        foreach (var name in names) { _ = contracts.Find(name); }
        return new(brain, contracts, search, names.ToHashSet(StringComparer.Ordinal));
    }

    public IReadOnlyList<string> List() => [.. contracts.Names.Where(Allowed).Order(StringComparer.Ordinal)];

    public async Task<IReadOnlyList<NeuronTypeHit>> Search(string query, CancellationToken ct)
        => allowed is null ? await search.Search(query, ct: ct)
            : [.. (await search.Search(query, take: 50, ct: ct)).Where(hit => Allowed(hit.<TypeNameProperty>)).Take(10)];

    private bool Allowed(string name) => allowed is null || allowed.Contains(name);

    private Type Contract(string name) => Allowed(name) ? contracts.Find(name)
        : throw new ArgumentException($"{name} is not a contract this app composes. Pass a full type name from neurons_list.");
}
```

and replace `contracts.Find(contract)` with `Contract(contract)` in `Get` and `Call`.

- [ ] **Step 5: Run** the Mcp unit tests: PASS (all, including the existing ones).

- [ ] **Step 6: Commit** — `Framework: a NeuronSurface can be restricted to the contracts an app composes`.

---

### Task 2: Agent turns name contracts; the runtime offers `neurons_*`

**Files:**
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Agents/AgentTurn.cs` (`Tools` → `Contracts`, `Text(..., string[]? contracts = null)`)
- Modify: the `AgentDefinition` record (LSP `goToDefinition` from `AgentNeuron.cs:69`) — `Tools` → `Contracts`
- Modify: the agent-context entry record used by `AgentContextNeuron.cs:26` — `Tools` → `Contracts`, and its validation message
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Agents/AgentNeuron.cs` (lines ~69–81, ~196), `.../Agents/AgentTurnLoop.cs` (the `TurnPlan` record and `Steps`), `.../Agents/Context/AgentContextNeuron.cs`
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Agents/ContractActions.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/AIModule.cs` (register `NeuronContracts` + `NeuronSurface`)
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/CallerContextStamper.cs` (add `IsModelOriginated`)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/ContractActionFacts.cs`

**Interfaces:**
- Consumes: `NeuronSurface.Restrict` (Task 1), `NeuronSurfaceTools` names/descriptions.
- Produces:
  - `AgentTurn(..., string[]? Contracts = null, ...)` at the same `[Id(4)]`; `AgentTurn.Text(string message, string? runId = null, string? model = null, string? instructions = null, string[]? contracts = null)`.
  - `AgentDefinition.Contracts : string[]`; `TurnPlan.Contracts : string[]` (replaces `ToolNames`).
  - `internal static class ContractActions { public static IReadOnlyList<AIFunction> Create(NeuronSurface surface, string conversation) }` — five functions named by `NeuronSurfaceTools.*Name`, each runs inside `ModelOriginated(conversation)`; `ArgumentException`, `KeyNotFoundException`, `UnauthorizedAccessException`, `InvalidOperationException` become `{ isError = true, message }`.
  - `public static bool CallerContextStamper.IsModelOriginated(CallerContext caller) => caller.ConversationId is not null;`

- [ ] **Step 1: Map.** LSP `findReferences` on `AgentTurn.Tools`, `AgentDefinition.Tools`, the context entry's `Tools`, `TurnPlan` (its `ToolNames` parameter), `AgentTurn.Text`. Every reference is in AI, Assistant (deleted in Task 5 — leave it compiling by updating its call sites mechanically, or stop and ask if a site needs a design choice), `chat.cs` (Task 6), tests. Note them in the ledger.

- [ ] **Step 2: Failing tests** in `ContractActionFacts.cs`. Build the host the way `AgentToolFacts` does (`AgentFacts.Brain(chatClient, ct, services => ...)`, see `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentToolFacts.cs`), with a scripted `StubChatClient` that issues one `FunctionCallContent` then echoes the result (copy `ScriptedClient` from that file, parameterised by tool name and arguments). Also add `<ProjectReference>` to `DigitalBrain.Modules.Apps` (for a real `IApp`) if the AI test project lacks it.

```csharp
[Fact]
public async Task ATurnOffersTheNeuronActionsOverOnlyItsContracts()
{
    var ct = TestContext.Current.CancellationToken;
    var client = Scripted(NeuronSurfaceTools.ListName, new());
    await using var brain = await AgentFacts.Brain(client, ct);
    var agent = brain.Get<IAgent>(AgentFacts.Key("main"));
    var events = await AgentFacts.Collect(agent, AgentTurn.Text("what can you reach?", contracts: [typeof(IApp).FullName!]), ct);
    Assert.Equal([NeuronSurfaceTools.ListName, NeuronSurfaceTools.SearchName, NeuronSurfaceTools.GetName,
        NeuronSurfaceTools.CallName, NeuronSurfaceTools.ContextName], client.OfferedTools);
    Assert.Equal($"[\"{typeof(IApp).FullName}\"]", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Result);
}

[Fact]
public async Task AContractTheTurnDidNotNameIsARepairableError()
{
    var ct = TestContext.Current.CancellationToken;
    var client = Scripted(NeuronSurfaceTools.CallName, new() { ["contract"] = "DigitalBrain.Postgres.IPostgresServer",
        ["key"] = "connection/b/postgres/x", ["method"] = "ReadConnection", ["arguments"] = "[]" });
    await using var brain = await AgentFacts.Brain(client, ct);
    var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("main")), AgentTurn.Text("read it", contracts: [typeof(IApp).FullName!]), ct);
    Assert.Contains("not a contract this app composes", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Result);
}

[Fact]
public async Task ATurnWithoutContractsIsPlainChat()
{
    var ct = TestContext.Current.CancellationToken;
    var client = Scripted(null, new());
    await using var brain = await AgentFacts.Brain(client, ct);
    var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("main")), AgentTurn.Text("hi"), ct);
    Assert.Empty(client.OfferedTools);
    Assert.Single(events.OfType<AgentTurnEvent.Finished>());
}

[Fact]
public async Task AnUnknownContractFailsTheTurnBeforeTheModelIsAsked()
{
    var ct = TestContext.Current.CancellationToken;
    var client = Scripted(null, new());
    await using var brain = await AgentFacts.Brain(client, ct);
    var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("main")), AgentTurn.Text("hi", contracts: ["DigitalBrain.Nope.INope"]), ct);
    Assert.Contains("DigitalBrain.Nope.INope", Assert.Single(events.OfType<AgentTurnEvent.Failed>()).Message);
    Assert.Equal(0, client.Calls);
}

[Fact]
public async Task TheModelOriginatedMarkEndsWithTheAction()
{
    var ct = TestContext.Current.CancellationToken;
    var client = Scripted(NeuronSurfaceTools.ContextName, new());
    await using var brain = await AgentFacts.Brain(client, ct);
    var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("main")), AgentTurn.Text("who am I", contracts: [typeof(IApp).FullName!]), ct);
    Assert.Contains("conversationId", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Result, StringComparison.OrdinalIgnoreCase);
    Assert.False(CallerContextStamper.TryGet(out var after) && CallerContextStamper.IsModelOriginated(after));
}
```

`Scripted(string? tool, Dictionary<string, object?> arguments)` returns a `RecordingClient : IChatClient` you write in the file: it records `options.Tools` names on the first call into `OfferedTools` (empty when null), counts `Calls`, answers the first call with `FunctionCallContent("call-1", tool, arguments)` when `tool` is not null, and otherwise (or after a function result) with the last `FunctionResultContent.Result` serialized as text.

- [ ] **Step 3: Run, expect FAIL** (no `contracts` parameter): `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*ContractActionFacts*"`

- [ ] **Step 4: Implement.**
  - Records: rename `Tools` → `Contracts` (same `[Id]`), keep validation (≤128, non-empty, distinct) with "contracts" in messages.
  - `CallerContextStamper.IsModelOriginated` as in Interfaces.
  - `ContractActions.cs`:

```csharp
using System.ComponentModel;
using DigitalBrain.Framework;
using Microsoft.Extensions.AI;

namespace DigitalBrain.AI.Agents;

// The model's only actions: the neuron surface over the contracts the app composed. Each call runs
// as the app, marked model-originated so neurons can withhold what the model must not see.
internal static class ContractActions
{
    public static IReadOnlyList<AIFunction> Create(NeuronSurface surface, string conversation) =>
    [
        AIFunctionFactory.Create(() => Marked(conversation, () => Task.FromResult<object>(surface.List())), NeuronSurfaceTools.ListName, NeuronSurfaceTools.ListDescription),
        AIFunctionFactory.Create(([Description("What you want to do.")] string query, CancellationToken ct) =>
            Marked(conversation, async () => await surface.Search(query, ct)), NeuronSurfaceTools.SearchName, NeuronSurfaceTools.SearchDescription),
        AIFunctionFactory.Create((string contract, string key) =>
            Marked(conversation, () => Task.FromResult<object>(surface.Get(contract, key))), NeuronSurfaceTools.GetName, NeuronSurfaceTools.GetDescription),
        AIFunctionFactory.Create((string contract, string key, string method, string arguments, CancellationToken ct) =>
            Marked(conversation, async () => (object?)await surface.Call(contract, key, method, arguments, ct) ?? new { ok = true }),
            NeuronSurfaceTools.CallName, NeuronSurfaceTools.CallDescription),
        AIFunctionFactory.Create(() => Marked(conversation, () => Task.FromResult<object>(CallerContextStamper.Require())),
            NeuronSurfaceTools.ContextName, NeuronSurfaceTools.ContextDescription),
    ];

    private static async Task<object> Marked(string conversation, Func<Task<object>> action)
    {
        var caller = CallerContextStamper.Require();
        CallerContextStamper.Stamp(caller with { ConversationId = conversation });
        try { return await action(); }
        catch (Exception error) when (error is ArgumentException or KeyNotFoundException or UnauthorizedAccessException or InvalidOperationException)
        { return new { isError = true, message = error.Message }; }
        finally { CallerContextStamper.Stamp(caller); }
    }
}
```

  (If `CallerContextStamper.Stamp` refuses a re-stamp of an already-stamped context, LSP-read its rules and use the API it offers for a scoped stamp; if none exists, stop and ask.)
  - `AgentTurnLoop.Steps`: replace the factory/native/source block with

```csharp
            var surface = services.GetRequiredService<NeuronSurface>().Restrict(plan.Contracts);
            var tools = plan.Contracts.Length == 0 ? new List<AIFunction>() : [.. ContractActions.Create(surface, plan.ScopeId)];
```

    keep `sessions` only if something else still adds to it (Task 3 deletes sources; until then leave the session loop over `IAgentToolSource` untouched). The unknown-contract `ArgumentException` from `Restrict` propagates as the turn's failure (Steps already turns exceptions into `Failed`). Use `plan.ScopeId` as the conversation mark only if it is the agent's grain key; LSP-check what `TurnPlan.ScopeId` carries in `AgentNeuron` (line ~196) and pass the agent's own key (`this.GetPrimaryKeyString()` there) into `TurnPlan` if they differ.
  - `AIModule.Configure`: `silo.Services.TryAddSingleton(new NeuronContracts(NeuronContracts.Deployed())); silo.Services.TryAddSingleton<NeuronSurface>();`

- [ ] **Step 5: LSP diagnostics clean; run** AI tests (whole project) — PASS. Update existing AI facts that passed `tools:` mechanically to `contracts:` or delete facts whose subject is tool selection by name (`AgentToolFacts` facts about factories/context-selected tools) — list each deleted fact in the commit message.

- [ ] **Step 6: Commit** — `AI: an agent turn names contracts; the runtime offers the neuron actions over them`.

---

### Task 3: Delete tool plumbing

**Files:**
- Delete (AI.Contracts `Tools/`): `AgentTools.cs` (`AgentToolContext`, `IAgentToolFactory`, `IAgentToolSource`, `IAgentToolSession`), `NativeTools.cs`, `NativeToolServiceCollectionExtensions.cs`, `INativeToolContributor` (wherever LSP finds it)
- Delete (AI): `Tools/McpAgentTools.cs`, `Tools/NativeToolRegistrations.cs`, and each native function type (`WebSearchFunction`, `RepositoryDiffFunction`, browse/lookup functions) **only if** LSP shows no use outside the native-tool registration
- Delete (CSharp): `Authoring/CSharpAgentTools.cs` and its registration in `CSharpModule.cs`; keep `CSharpToolService`/`ScopedCSharpTools` if LSP shows other users (MCP/HTTP), else stop and ask
- Modify: `AgentTurnLoop.cs` (remove the `IAgentToolSource` session loop and `sessions`), `AIModule.cs` (remove `McpAgentTools.Register`, native registrations and their options if LSP shows options used only there)
- Delete tests: facts whose subject is a deleted type (LSP `findReferences` from each deleted type into test projects); list them in the commit message

- [ ] **Step 1: Map.** LSP `findReferences` on each type above. Every reference must be in the files above, the Assistant module (deleted in Task 5 — if a reference there blocks compilation, delete that registration line in `AssistantModule.cs` now), or tests. Anything else: stop and ask.
- [ ] **Step 2: Failing test** — append to `ContractActionFacts`:

```csharp
[Fact]
public void ThereIsNoToolVocabulary()
{
    var contracts = typeof(AgentTurn).Assembly;
    Assert.Null(contracts.GetType("DigitalBrain.AI.Tools.IAgentToolFactory"));
    Assert.Null(contracts.GetType("DigitalBrain.AI.Tools.IAgentToolSource"));
    Assert.Null(contracts.GetType("DigitalBrain.AI.Tools.NativeTools"));
    Assert.Null(typeof(AgentTurn).GetProperty("Tools"));
}
```

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Delete per Files.**
- [ ] **Step 5: LSP diagnostics clean; build and test** AI, CSharp, Apps test projects and `DigitalBrain.OS.Tests.Unit` — PASS (Assistant tests may fail to compile now; they are deleted in Task 5 — do not fix them).
- [ ] **Step 6: Commit** — `AI: no tools — factories, sources, native tools and MCP tool servers removed`.

---

### Task 4: `IForm` withholds values from the model

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Form/FormNeuron.cs` (`Read`, line ~130)
- Test: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests/Form/FormModelReadFacts.cs`

**Interfaces:**
- Consumes: `CallerContextStamper.IsModelOriginated` (Task 2).
- Produces: `IForm.Read()` for a model-originated caller returns the `FormState` with every field's draft value, submitted value and secret reference cleared (types, labels, required flags, status, revision kept). Signature unchanged.

- [ ] **Step 1: Map.** LSP `goToDefinition` on `FormState` and its field record(s) to learn the value-bearing members; `findReferences` on `IForm.Define` in Flutter tests to copy how a form neuron is created and stamped.
- [ ] **Step 2: Failing test:**

```csharp
[Fact]
public async Task TheModelReadsAFormsShapeButNeverItsValues()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await ModuleTest.Create().WithModule<FlutterModule>().StartAsync(ct);
    StampApp(conversation: null);
    var form = brain.Get<IForm>(FormKey);
    await DefineWithOneTextField(form);           // copy the definition from neighbouring form facts
    await form.SetDraft("name", "Alice");
    StampApp(conversation: "agent/brain/assistant");
    var seen = await form.Read();
    Assert.DoesNotContain("Alice", System.Text.Json.JsonSerializer.Serialize(seen));
    StampApp(conversation: null);
    Assert.Contains("Alice", System.Text.Json.JsonSerializer.Serialize(await form.Read()));
}
```

`StampApp` stamps `CallerKind.App`, `TrustedEdge.AppProxy`, an `AppId` in the form's brain, and `ConversationId = conversation`. `FormKey` is a key under that brain, shaped like the neighbouring facts' keys.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** in `Read`: when `CallerContextStamper.TryGet(out var caller) && CallerContextStamper.IsModelOriginated(caller)`, return a copy with the value members cleared (concrete arrays, per the Hazards rule); otherwise unchanged.
- [ ] **Step 5: Run Flutter module tests** — PASS.
- [ ] **Step 6: Commit** — `Flutter: a form's values never reach the model; its shape does`.

---

### Task 5: Delete the module-hosted assistant; its two shell routes move to their owners

**Files:**
- Delete: `src/DigitalBrain.Modules/DigitalBrain/Assistant/` (all three projects) and their entries in `DigitalBrain.slnx` and the gitignored `DigitalBrain-lsp.sln`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs` (remove `AssistantModule`), `Program.cs` (remove `using DigitalBrain.Assistant;` and any use), `appsettings.json` (remove the `"Assistant"` section), `DigitalBrain.OS.Tests.Unit/BrandingFacts.cs` (remove the `AssistantOptions` fact; keep the Flutter `AssistantTitle` fact)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj` and `src/DigitalBrain.Modules/Postgres/DigitalBrain.Modules.Postgres/DigitalBrain.Modules.Postgres.csproj` (remove `InternalsVisibleTo DigitalBrain.Modules.Assistant.Tests`)
- Move: `GET /ai/models` → AI module; `GET /brains/{id}/compute/usage` → Compute module (`ComputeModule.Configure(IEndpointRouteBuilder)` exists)
- Move: `AssistantScenarioFacts.cs` + `ShippedAssistant.cs` → `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/` (rewritten in Task 6)
- Modify (Dart): `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart` — delete `runAgent`, `transcribeWorkspaceAudio`, `readWorkspaceConversation` and types only they use; keep `readModelCatalog`, `readComputeUsage` (routes unchanged)

**Interfaces:**
- Produces: `GET /ai/models` answers `IModelCatalog("default").List(defaultModel: null)`'s `ModelChoices` (same JSON as today: LSP-check that `IAssistant.Models()` returned exactly that record). `GET /brains/{id}/compute/usage` unchanged in shape.

- [ ] **Step 1: Map.** LSP `findReferences` on `AssistantModule`, `IAssistant`, `AssistantConversations`, `AssistantOptions`, `ComputeUsageEndpoints`, `AgentEndpoints`, `AssistantUsage`, `AgentReceipts`, `IntentActivity`. Expected outside the Assistant folder: `OsCatalog`, `Program.cs`, `BrandingFacts`, OS/Framework E2E facts (Task 7). Anything else: stop and ask.
- [ ] **Step 2: Failing tests.**
  - AI: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/ModelRouteFacts.cs` — with `ModuleTest.Create().WithModule<AIModule>().WithHttpEdge()` (copy the HTTP-edge setup from an existing AI or Compute route fact; LSP `findReferences` on `WithHttpEdge`), `GET /ai/models` returns 200 and a body with `automatic` and `models`.
  - Compute: `.../Compute/tests/.../ComputeUsageRouteFacts.cs` — move the existing `ComputeUsageRouteFacts` from Assistant tests (it covers this route) and point it at `ComputeModule` only.
- [ ] **Step 3: Run, expect FAIL** (routes not mapped by those modules).
- [ ] **Step 4: Move the two endpoints** (copy the handler bodies; `AgentEndpoints` `/ai/models` becomes `brain.Get<IModelCatalog>("default").List()`), then delete the Assistant folder and edit the files above. Dart: delete the three client methods; `flutter analyze` + `flutter test` in `shell` — clean/PASS.
- [ ] **Step 5: Build and test** AI, Compute, OS host, `DigitalBrain.OS.Tests.Unit`, Architecture (baseline only) — PASS.
- [ ] **Step 6: Commit** — `Assistant: the module-hosted assistant is gone; the assistant is the os/assistant app`.

---

### Task 6: The assistant app composes contracts; the shell's ask stops polling

**Files:**
- Modify: `src/DigitalBrain.OS/Apps/Assistant/synapses/chat.cs` (contracts list, `#:project` lines), `prompts/system.md`, `app.json` (`1.1.0` → `1.2.0`)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs` (`Ask`, ~line 167)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantScenarioFacts.cs` (moved in Task 5), Apps route fact for `Ask`

**Interfaces:**
- Consumes: `AgentTurn.Text(..., contracts:)` (Task 2), `IForm` (Task 4), `IApp.Await`.
- Produces: `chat.cs` declares `string[] Contracts = [typeof(IPostgresServer).FullName!, typeof(IApp).FullName!, typeof(IAppIndex).FullName!, typeof(IWorkspace).FullName!, typeof(IForm).FullName!, typeof(ICSharpFile).FullName!, typeof(IContractVocabulary).FullName!];` and passes `contracts: Contracts`.

- [ ] **Step 1: Failing scenario.** Rewrite `ShippedAssistant.Tools()` → `ShippedAssistant.Contracts()`: it reads `chat.cs` and returns the `typeof(X).FullName` names as full names by resolving each `X` against `NeuronContracts.Deployed()` short names (`Type.Name`). Rewrite `AssistantScenarioFacts` to run `AgentTurn.Text(message, contracts: ShippedAssistant.Contracts())` through the agent (`IAgent.Run` via the `AgentFacts`-style helper, not `TurnLoops`), keeping its two facts ("which tables are in Supabase?" → `ReadSchema` names `Demo`; "show data from Demo" → `Invoke`/`Await` completed) and adding a third step to the second fact: `neurons_call(IWorkspace, scope, "OpenSurface", …)` with the window from the awaited output; assert the workspace has one window whose reference is the view's surface. Add the AI test project references it needs (Apps, Postgres, Flutter modules); the Postgres `InternalsVisibleTo` moves to `DigitalBrain.Modules.AI.Tests`.
- [ ] **Step 2: Run, expect FAIL** (chat.cs has no contracts list).
- [ ] **Step 3: Implement `chat.cs`.** Replace the `Tools` array with `Contracts` (Produces); add `#:project` lines for Postgres, Flutter, CSharp contracts projects (copy the path style of the existing three); `AgentTurn.Text(message, instructions: …, contracts: Contracts)`.
- [ ] **Step 4: Rewrite `prompts/system.md`:**

```markdown
You are the user's assistant. You act in the person's brain through the neuron contracts this app composes.

1. `neurons_context` tells you the brain id; it is also the scope in keys. An app is `{brain}/apps/{name}`;
   a database the person added is `connection/{brain}/postgres/{id}`.
2. Find what can do the job with `neurons_search`, then `neurons_call` it. If a call answers `isError`,
   repair it and retry; do not stop at a listing.
3. Databases: `IPostgresServer.ReadSchema` lists tables; `Query` runs one read-only SELECT.
4. To show data, use the Data Visualizer: `IApp.Invoke` on `{brain}/apps/datavisualizer` with operation `show`
   (`{title, kind: table|chart, source: "sql", sql}`), then `IApp.Await` with the invocationId. Its output names a
   `window` {id, title, surface}: open it with `IWorkspace.Read` on `{brain}` for the revision, then
   `IWorkspace.OpenSurface` with `{operationId, windowId: id, title, reference: {kind: "surface", neuronId: surface}, expectedRevision}`.
5. To ask the person for values, define a form with `IForm.Define` and open it with `IWorkspace.OpenSurface`.
   You see its fields and status, never the values the person types.
6. When nothing fits, write a behavior: `IContractVocabulary` shows what a script can use; `ICSharpFile` writes,
   starts and stops it.

- Respect the person's requested source; if several fit, ask which one. Never fabricate data, ids or results.
- Answer briefly and say what you did.
```

  (LSP-check the exact `IForm.Define` key shape and `IContractVocabulary` method names; put the real names in the prompt.)
- [ ] **Step 5: `AppsEndpoints.Ask`.** Failing Apps route fact first: an app that answers after a delay returns 200 with its output, and the handler holds no fixed cap (assert by answering after a `TaskCompletionSource` the test releases, not by timing). Then replace the polling loop with `var invocation = await app.Await(started.Id).WaitAsync(ct);` and delete the 408 branch.
- [ ] **Step 6: Run** AI, Apps tests and `DigitalBrain.OS.Tests.Unit` (compiles shipped apps) — PASS.
- [ ] **Step 7: Commit** — `Assistant app: composes contracts; the shell's ask awaits the app instead of polling`.

---

### Task 7: E2E suites compile again without tools or tables

**Files:**
- Delete: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/{AgentTableJourneyFacts,AgentWorkflowFacts,ReceiptJourneyFacts,SupabaseTableDisplayFacts,WorkspaceRestoreFacts}.cs`; in `GoldenJourneyFacts.cs` delete `J1CustomersJourneyPassesGoldenThreshold` and helpers only it uses
- Modify: `src/Testing/DigitalBrain.Testing.E2E/Agent/ScriptedModelServer.cs` — keep the background replies (capital of France, brainstorm, judge) and add one plain reply for any other request (`"You said: " + lastUser`), deleting the tool-name script and every knob only it used
- Modify: `src/Testing/DigitalBrain.Testing.Reference/Workspace/UserConnections.cs` (`AuthorizeSupabaseAsync` → `AuthorizeDatabaseAsync`, connector `postgres`, connection id `supabase`), `BrainFact.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/{ContentCaptureFacts,TraceBudgetFacts}.cs` — drive the assistant app instead of `/agent`: `POST /brains/{id}/apps/assistant/ask` with operation `send` (LSP-check the route's request shape in `AppsEndpoints`); `TraceBudgetFacts.IdleShellAndJ1...` keeps the idle budget and the GenAI/usage span assertions, drops the `Npgsql` span assertion and the table seeding, and re-measures `J1SpanBudget` (record the measured number in the comment); `CanarySecretFacts` theory data `"supabase"` → `"postgres"`

- [ ] **Step 1: Map.** LSP `findReferences` on every removed `ScriptedModelServer` member and on `AuthorizeSupabaseAsync`.
- [ ] **Step 2: Build** both E2E projects — compile errors only in the files above; fix them per Files.
- [ ] **Step 3: Run** `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E -- --filter-class "*ContentCaptureFacts*"` with Docker healthy. Expected: PASS. Do not raise any timeout; if a fact is slow, report the measured duration.
- [ ] **Step 4: Commit** — `E2E: suites drive the assistant app; tool-script and table journeys removed`.

---

### Task 8: Verify end to end, as a person and as Claude

No code unless a step fails; a fix goes into the owning task's files with its own failing test and commit.

- [ ] **Step 1: Run.** Stop any AppHost and orphaned `DigitalBrain.*` processes (`aspire stop` leaves them; they lock `bin/` and ports 5080/5081). From `src/DigitalBrain.AppHost`: `aspire start`. `mcp__aspire__list_resources`: all Running/Healthy (resource `OperatingSystem`). On an Orleans `wireType` error, wipe Azurite.
- [ ] **Step 2: Parity.** `digitalbrain-mcp` `tools/list` has the five `neurons_*` with descriptions equal to `NeuronSurfaceTools`.
- [ ] **Step 3: Connection.** Ask the person for the Supabase connection string — never take it from anywhere else. As the user: `IConnection.Connect("connection-string", value)` on `connection/{brain}/postgres/supabase`; `Probe` → `Connected`. Bind the Data Visualizer: `IApp.Configure({}, {"db": "supabase"})` on `{brain}/apps/datavisualizer` (the slot holds the connection **id**).
- [ ] **Step 4: Claude directly.** `neurons_call(IPostgresServer, connection/{brain}/postgres/supabase, ReadSchema, [{}])` lists `Demo`; Data Visualizer `Invoke` show `select * from demo` + `Await` → Completed; `read` on the view has rows.
- [ ] **Step 5: As a person.** `IApp.Invoke` on `{brain}/apps/assistant` `send` "which tables are in Supabase?", `Await`, then `transcript`: shows `neurons_call … ReadSchema` and an answer naming `Demo`. Then "show data from Demo": transcript shows `Invoke … show`, `Await`, `OpenSurface`; `IWorkspace.Read` on `{brain}` has the view's window; the view's table has rows.
- [ ] **Step 6: Telemetry.** `list_traces`: the turn's neuron calls under the `os/assistant` caller; MCP spans under the user. `list_structured_logs`: no `discover_capabilities`, `select_capability`, `/agent`.
- [ ] **Step 7: Regression net.** Unit suites of Mcp, Framework, AI, Apps, CSharp, Flutter, Compute, Postgres, Supabase, OS, Architecture (baseline), Platform (baseline); Flutter `analyze`/`test`.
- [ ] **Step 8: Report** with transcript excerpts.
