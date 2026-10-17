# B — DigitalBrain Engineer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-party app, **DigitalBrain Engineer**, takes a request in plain language and changes the brain at the right level: new behavior → the Creator writes synapses; new capability → its **Module Builder** writes a module in a candidate worktree with Roslyn, verified and promoted through sub-project A; Flutter shell changes → its **Shell Builder** works with Dart analysis and hot reload. Default model `IDeepSeekV41Flash`.

**Architecture:** No new agent loop: each builder is an `IAgent` conversation (the existing `AgentTurnLoop`) whose tools are neuron contracts (`AgentTurn.contracts`). The Module Builder's contracts are `IRoslyn` (revived module, opened on the candidate's worktree) and `ICandidate`/`ICandidates`; the Shell Builder's are `IMcpServer` (the `dart mcp-server`, over a new stdio transport) and `ICandidate`. Best practices are the agents' system prompts (`prompts/*.md` files in the app folder), derived from CLAUDE.md. The Engineer's router synapse classifies a request with one model call and hands off.

**Tech Stack:** Roslyn MSBuildWorkspace (orphaned module revived), ModelContextProtocol C# SDK stdio transport, `IAgent`, Flutter `dart mcp-server`.

**Spec:** this plan's Design section (approved direction in chat 2026-10-10: "DigitalBrain Engineer with sub-apps Module Builder (best practices, default model IDeepSeekV41Flash, Roslyn) and a Dart counterpart; proper self-improving loop"). Depends on sub-project A: `docs/superpowers/specs/2026-10-10-aspire-instance-neuron-design.md` and plans `2026-10-10-aspire-1/2/3-*.md`. **Requires A plan 1 merged** (A plans 2–3 not required).

## Design

### Apps (all in `features/os/`, installed by default)

| App | Name | Operations | Does |
|---|---|---|---|
| DigitalBrain Engineer | `engineer` | `open`, `ask` | Classifies a request (`behavior` / `module` / `shell`), records it in `{app}/requests/{id}`, hands it to the Creator or a builder, shows progress and the result. |
| Module Builder | `module-builder` | `build` | One `IAgent` conversation per request. Drafts a candidate, edits through `IRoslyn`, keeps diagnostics clean, writes the verification plan, submits. |
| Shell Builder | `shell-builder` | `build` | One `IAgent` conversation per request on the candidate's Flutter folder through the dart MCP server: analyze, edit, `flutter test`, submits. |

Settings on every builder: `Model` (default `IDeepSeekV41Flash`), `MaxRounds` (default `40`).

### Candidate drafting (addition to A)

A's `ICandidates.Propose(proposal)` takes all files up front. Builders edit iteratively, so A gains:

- `ICandidates.Draft(string branch, string summary) → string sha` — prepares an empty worktree from the live sha; the candidate is `Drafting` (new stage, first).
- `ICandidate.Worktree() → string` — the worktree path (only for `Drafting`; read by the Roslyn/dart tools' setup, never shown to users).
- `ICandidate.Submit(VerificationPlan plan) → CandidateSnapshot` — commits the worktree, moves `Drafting → Proposed`, joins the queue exactly as `Propose` did.

### Roslyn revived

`src/Modules/Microsoft/Roslyn` moves to `src/DigitalBrain.Modules/Microsoft/Roslyn` (so the OS glob picks it up), joins the slnx and `OsCatalog`. `IRoslyn` is keyed `{brain}/roslyn/{sha}`; `Open(new OpenWorkspace(worktree/DigitalBrain.slnx))`. Its existing surface (FindSymbols, References, Diagnostics, Skeleton, Member, Callers, Implementations, CheckEdits, CommitEdits) is what the Module Builder uses — the same discipline CLAUDE.md asks of humans: map, edit, confirm.

### Dart over MCP

`IMcpServer` gains a stdio transport: `McpServerSpec(Title, Url)` → `McpServerSpec(Title, Url, string? Command = null, string[]? Arguments = null, string? WorkingDirectory = null)`. Stdio is allowed only when the `mcp` module option `AllowStdio` is true (AppHost sets it in development). The Shell Builder connects `{brain}/mcp/dart-{sha}` to `dart mcp-server` with the candidate's `src/DigitalBrain.Modules/Google/Flutter/app` as working directory. Hot reload: when the developer's shell runs under `flutter run`, the Shell Builder may call the dart server's `hot_reload` against it for live preview; the candidate is still verified by A before promotion.

### Best practices

`features/os/module-builder/prompts/system.md` is the module playbook (source: CLAUDE.md sections "The four words", "Module shape", "Connectors, integrations, configuration", "Code style", "Hazards", plus the A policy "compatible changes roll, breaking changes restart"). It is plain data the app reads — editing it is how the playbook improves. Same for `shell-builder/prompts/system.md` (Flutter shell conventions: `flutter analyze` clean, `flutter test`, C# record wire changes mirrored in Dart).

### Flow

```
user → engineer "ask" ──classify──► behavior → IApp Creator (Author + Implement), existing path
                               ├──► module   → module-builder "build" → Draft → Roslyn edits → Submit(plan)
                               └──► shell    → shell-builder  "build" → Draft → dart MCP     → Submit(plan)
A: Queued → Building → Healthy → Verified → Promoted   (engineer listens: CandidatePromoted/Failed)
engineer: on Promoted with a pending "then behavior" part → Creator for the app part
```

A request may need both (the Bitcoin demo): classification returns `module` with a `then` behavior text; the Engineer runs the Creator after promotion.

## Global Constraints

- All Global Constraints of A plan 1 apply (CLAUDE.md, LSP, per-project build/test, explicit-file commits, 5-minute test cap, no retries/timeouts/polling fixes).
- Apps follow the app rules: `app.cs` with spec comment + `App` class; one reaction per synapse file; shared classes in a non-top-level-statement file; state in neurons; at-least-once delivery deduped through neuron state.
- Default model is `IDeepSeekV41Flash`, overridable per app setting `Model`; resolve via `IModelCatalog.Select` as the Assistant does.
- No new agent loop: builders are `IAgent` conversations.
- Stdio MCP only when `Mcp` option `AllowStdio` is true.

## Review Focus

- A builder that exceeds `MaxRounds` or whose run fails must discard its `Drafting` candidate (no leaked worktrees) and report the failure on the Engineer request.
- The Module Builder must not `Submit` while `IRoslyn.Diagnostics` reports errors; the `Submit` call is refused by the builder's synapse, not trusted to the model.
- Duplicate `AppRequested` delivery must not start two builder conversations for one request (dedupe by request id in `{app}/requests/{id}` state).
- Stdio MCP spec with `AllowStdio=false` → `Connect` throws a clear `InvalidOperationException`; never spawns.
- `IRoslyn.Open` on a worktree that is not under the aspire `Workdir` → refused (the agent must not open arbitrary paths).

---

### Task 1: Candidate drafting in A

**Files:**
- Modify: `Contracts/ICandidate.cs`, `Contracts/CandidateSnapshot.cs` (`CandidateStage.Drafting` appended last so existing values stay stable: `..., Failed, Drafting`), `Candidates/CandidateNeuron.cs`, `Candidates/CandidateQueueNeuron.cs`, `Candidates/ICandidateHost.cs` (+ `Task<PreparedCandidate> PrepareEmpty(string baseSha, string branch, CancellationToken ct)`, + `Task<string> CommitWorktree(string worktree, string summary, CancellationToken ct)` returning the final sha), `DockerCandidateHost.cs`, `FakeCandidateHost.cs`.
- Test: `tests/.../CandidateDraftFacts.cs`

Note: the candidate's key is its sha, but a draft has no commit yet. `Draft` keys the candidate by a draft id `d{guid:N[..12]}`; `Submit` commits and the draft candidate **stays keyed by the draft id**, recording the commit sha in state (`CandidateState.CommitSha`, new `[Id]`), and all host calls use `CommitSha ?? Sha`. Update `CandidateSnapshot` with `[property: Id(10)] string? CommitSha`.

- [ ] **Step 1: Failing facts:** `ADraftHasAWorktreeAndNoContainer`, `SubmittingADraftCommitsItAndQueuesIt` (host.Calls contains `"commit-worktree"` then `"gate {commitSha}"`), `WorktreeIsRefusedOutsideDrafting`, `DiscardingADraftRemovesItsWorktree`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `"Aspire: candidates can be drafted and submitted"`.

### Task 2: Revive the Roslyn module

**Files:**
- Move: `src/Modules/Microsoft/Roslyn/**` → `src/DigitalBrain.Modules/Microsoft/Roslyn/**` (`git mv` per project folder); fix relative `ProjectReference` paths in the three csproj files; rename the test project to `tests/DigitalBrain.Modules.Microsoft.Roslyn.Tests` to match the module shape.
- Modify: `DigitalBrain.slnx` (new folder `/Modules/Microsoft/Roslyn/`), `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs` (add `RoslynModule`).
- Modify: `IRoslyn` key convention: comment + `static string Key(string brainId, string candidate) => $"{brainId}/roslyn/{candidate}"`; `RoslynNeuron.Open` refuses a solution path outside the aspire `Workdir` (read via `IModuleIntegrations<RoslynModule>`? — the Workdir belongs to the aspire integration; give Roslyn its own option `AllowedRoot` set by the AppHost to the same folder — options are config, not secrets).
- Test: existing `WorkspaceFacts.cs` + `OpenIsRefusedOutsideTheAllowedRoot`.

- [ ] **Step 1:** Read every file of the module (it is restored from history and may reference renamed framework types). Build the three projects; fix compile errors against the current framework using LSP (`goToDefinition` on each missing symbol; the old Kernel/Contracts/Sdk rings are now DigitalBrain/Framework/Platform — memory "Framework ring structure").
- [ ] **Step 2:** Run its tests (5-minute cap; MSBuild workspace loading is slow — the facts should open a tiny fixture solution, not the repo).
- [ ] **Step 3:** Add the allowed-root fact; implement; pass.
- [ ] **Step 4:** Architecture tests (`src/Testing/DigitalBrain.Architecture.Tests`) pass with the module added.
- [ ] **Step 5:** Commit `"Roslyn: revived as a module under DigitalBrain.Modules"`.

### Task 3: Stdio transport for IMcpServer

**Files:**
- Modify: `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/DigitalBrain.Modules.Mcp.Contracts/Mcp/IMcpServer.cs` (`McpServerSpec` gains `[property: Id(2)] string? Command = null, [property: Id(3)] string[]? Arguments = null, [property: Id(4)] string? WorkingDirectory = null`; state record mirrors them), `McpServerNeuron.cs` (`Client(...)` picks `StdioClientTransport` when `Command` is set), `McpModule.cs` → `Module<McpOptions>` with `McpOptions.AllowStdio` (default false), AppHost sets `DigitalBrain:Modules:mcp:Options:AllowStdio=true` in development (find how the AppHost writes module options via LSP on `ModuleOptionsSection`).
- Test: `tests/DigitalBrain.Modules.Mcp.Tests/McpStdioFacts.cs`

- [ ] **Step 1:** Verify `StdioClientTransport`/`StdioClientTransportOptions` names in the ModelContextProtocol package version pinned in `Directory.Packages.props` (context7).
- [ ] **Step 2: Failing facts:** `StdioIsRefusedUnlessAllowed`; `AStdioServerListsItsTools` — runs a tiny stdio MCP server: a test helper console project is overkill; instead run `dotnet` on a C# file-based app in the test's output folder (`stdio-echo.cs` using `ModelContextProtocol` `WithStdioServerTransport` and one `echo` tool), skipped via `Assert.Skip` when `dotnet` cannot run file-based apps.
- [ ] **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `"Mcp: stdio servers behind AllowStdio"`.

### Task 4: Module Builder app

**Files (create, `features/os/module-builder/`):** `app.cs`, `ModuleBuilder.cs` (shared), `build.cs` (synapse), `progress.cs` (synapse), `prompts/system.md`, `icon.svg` (copy a simple existing icon and change its glyph).

`app.cs`:

```csharp
/*
# Module Builder

Builds or changes a DigitalBrain module in a candidate copy of the brain's own source, using Roslyn
the way an engineer uses an IDE: find definitions, references and callers before changing anything;
edit; keep diagnostics clean; then submit the candidate with a verification plan. The candidate is
proven in its own container and promoted by the live cluster.

## Scenario: A build request drafts a candidate and runs the builder
When "build" is requested with JSON {request, id}, a candidate is drafted, the Roslyn workspace is
opened on its worktree and a builder conversation starts with the module playbook.

## Scenario: The builder submits only clean code
When the builder asks to submit, the diagnostics are read first; errors are returned to the builder
instead of submitting.

## Scenario: A builder that gives up discards its draft
When the conversation fails or runs out of rounds, the draft candidate is discarded and the request
records the failure.
*/
using DigitalBrain.Apps;

static class App
{
    public const string Name = "module-builder";
    public const string Version = "1.0.0";

    public static readonly AppManifest Manifest = new(
        Title: "Module Builder",
        Description: "Builds DigitalBrain modules in a verified candidate of the brain's own source.",
        Operations: [new("build", "JSON {id, request}: build or change a module; {app}/requests/{id} holds progress and the candidate.")],
        Settings: [new("Model", "Model catalog id for the builder.", "IDeepSeekV41Flash"), new("MaxRounds", "Tool rounds before giving up.", "40")],
        Slots: [],
        Icon: "icon.svg");
}
```

`ModuleBuilder.cs` (shared): `Key`, `Scope`, `Request` record `(string Id, string Request)`, `RequestState` stored as JSON in `IText {app}/requests/{id}` (`{status, candidate, detail}`), `Contracts = [typeof(IRoslyn).FullName!, typeof(ICandidate).FullName!, typeof(ICandidates).FullName!]`, `StartAsync(brain, request)`:

1. If `{app}/requests/{id}` exists → return (dedupe).
2. `var draft = await brain.Get<ICandidates>(ICandidates.Key(Scope)).Draft("engineer/" + id, request)`.
3. `var worktree = await brain.Get<ICandidate>(ICandidate.Key(Scope, draft)).Worktree()`; `await brain.Get<IRoslyn>(IRoslyn.Key(Scope, draft)).Open(new OpenWorkspace(Path.Combine(worktree, "DigitalBrain.slnx")))` (check `OpenWorkspace`'s fields via LSP).
4. Save request state `{status: "building", candidate: draft}`.
5. `brain.Get<IAgent>(Key + "/runs/" + id).Start(AgentTurn.Text(Task(request, draft), instructions: snapshot.Files["prompts/system.md"], contracts: Contracts) with { Model = model, RunId = id })`.

`Task(request, draft)` tells the agent its Roslyn key and candidate key, and the contract: finish by calling `ICandidate.Submit` with a plan; if blocked, reply with `GIVE UP: reason`.

`build.cs`: `await foreach (var request in brain.On<AppRequested>(app, ...)) if (request.Operation == "build") await ModuleBuilder.StartAsync(brain, Parse(request.Input));`

`progress.cs`: one reaction on the agent runs: subscribe to `TurnCompleted`/`TurnFailed` of `IAgent {app}/runs/*` — find via LSP how `projection.cs` in the Assistant subscribes per conversation and mirror it, with the request list from `{app}/requests` as the registry (like DataVisualizer's `run-on-tick.cs` registry loop). On completion: if the candidate is still `Drafting` → `Discard()` and set status `failed: <last text>`; else status `submitted`. On failure: discard, `failed`.

Submit guard (Review Focus #2): the agent calls `ICandidate.Submit` directly as a tool, so the guard lives in A: `CandidateNeuron.Submit` refuses when `IRoslyn` diagnostics for that candidate have errors? That couples aspire→roslyn. **Decision:** the guard is A's build gate (compile + tests run in `Start` anyway) **plus** the playbook rule; Review Focus #2 is satisfied by asserting in the verification loop that a submit with errors ends `Failed(Building)` with the compiler output — no Roslyn coupling.

`prompts/system.md`: write the playbook (≈150 lines) from CLAUDE.md sections listed in Design, plus:
- The tools you have are neuron methods: `IRoslyn.*` on key `{roslyn}`, `ICandidate.Submit` on `{candidate}`.
- Always: `FindSymbols`/`References`/`Callers` before editing; `CheckEdits` before `CommitEdits`; `Diagnostics` clean before `Submit`.
- A new module: Contracts project (interfaces + signals, references only `DigitalBrain`), module project (`XModule : Module`), tests project with `ModuleTest.Create().WithModule<XModule>()` facts, slnx entry, `OsCatalog.BuiltIn()` entry.
- Connectors: `ConnectorDefinition` static `Connector`; external credentials only through `IModuleIntegrations<XModule>` and an `IntegrationSchema`; webhooks via `IHttpSurface` with signature validation (cite the GitHub module files as the example to read with `Skeleton`/`Member`).
- Changing a grain interface: bump `[Version]`; add state fields with new `[Id]`s; renames/removals are breaking (restart).
- The verification plan: `NeuronExpectation` calls that prove the change on the candidate, spans to expect, budget.

- [ ] **Step 1:** Write the files. **Step 2:** Add `OsApp("os", "module-builder")` to `OsApps.cs:38`. **Step 3:** Run the features compile check (LSP on `FeatureCatalog` → its test) → PASS. **Step 4:** Commit `"Module Builder app"`.

### Task 5: Shell Builder app

**Files (create, `features/os/shell-builder/`):** `app.cs`, `ShellBuilder.cs`, `build.cs`, `progress.cs`, `prompts/system.md`, `icon.svg` — same shape as Task 4 with:
- Contracts: `IMcpServer`, `ICandidate`.
- Start: draft → worktree → `IMcpServer {scope}/mcp/dart-{draft}`.`Connect(new McpServerSpec("dart", "", Command: "dart", Arguments: ["mcp-server"], WorkingDirectory: Path.Combine(worktree, "src/DigitalBrain.Modules/Google/Flutter/app")))`.
- Playbook from CLAUDE.md "Flutter shell" + the dart server's tools (`analyze_files`, `lsp`, `pub`, `hot_reload`, `run_tests` — list them by connecting once in Step 1 and copying the real tool names).
- `progress.cs` also `Disconnect`s the dart server when the run ends.

- [ ] Steps: write, add to `OsApps.cs`, compile check, commit `"Shell Builder app"`.

### Task 6: Engineer app

**Files (create, `features/os/engineer/`):** `app.cs`, `Engineer.cs`, `open.cs`, `ask.cs`, `promoted.cs`, `failed.cs`, `prompts/classify.md`, `icon.svg`.

- `ask.cs`: on `AppRequested "ask"`: dedupe by `request.RequestId`; classify with one `ILLM.Generate` call (model from setting `Model`, default `IDeepSeekV41Flash`; `InferenceOptions(ResponseSchemaJson: …)` for `{kind: "behavior"|"module"|"shell", build: string, then: string?}`), store `{app}/requests/{id}` = `{kind, build, then, status}`; dispatch:
  - `behavior` → find via LSP the API the Assistant/Creator uses to author+implement an app from a request (`IApp.Author`/`Implement` or an `IApps` method) and call it with `build`.
  - `module` → `brain.Get<IApp>(IApp.Key(scope, "module-builder")).Request("build", json {id, request: build})`.
  - `shell` → same for `shell-builder`.
- `promoted.cs`: on `CandidatePromoted` from `ICandidates.Key(scope)` index — subscribe to the index's `CandidateChanged` (as SelfImprove's `healthy.cs` does) — find the request whose candidate matches; if it has `then`, dispatch `then` as `behavior`; set status `done`.
- `failed.cs`: on `CandidateFailed` → status `failed at {stage}: {reason}`.
- `open.cs`: compose a surface listing requests (pattern: SelfImprove `ComposeAsync`/`RenderListAsync`), with a composer or the toolbar `ask` text entry (pattern: Assistant `Toolbar`).
- `prompts/classify.md`: the classification rules: behavior = expressible with installed contracts (the classifier gets the result of `NeuronTypeSearch` for the request — find the client-side equivalent available to scripts, e.g. `brain.Kernel` type search; if none, give it `neurons_search` results through the router) ; module = needs a contract/connector that does not exist; shell = changes the Flutter shell itself.

- [ ] Steps: write, add `OsApp("os", "engineer")`, compile check, commit `"DigitalBrain Engineer app"`.

### Task 7: Verification loop

- [ ] **Step 1:** Run the system (A plan 1 in place). `neurons_list` shows `engineer`, `module-builder`, `shell-builder` installed.
- [ ] **Step 2:** `engineer ask` "add an operation 'square' to the calculator" → classified `behavior` → Creator builds it → `calculator` answers `square 4` → `16`.
- [ ] **Step 3:** `engineer ask` "add a module Echo with a neuron IEcho that returns its input reversed" → `module` → Module Builder drafts, edits through Roslyn (traces show `microsoft.roslyn` spans), submits → candidate verified → promoted (A) → `neurons_call IEcho` on the live cluster answers.
- [ ] **Step 4:** A deliberately broken request (ask the Module Builder to reference a type that doesn't exist and forbid it from fixing) → `Failed(Building)` with compiler output; draft discarded; Engineer shows the failure.
- [ ] **Step 5:** Shell: `engineer ask` "show the brain id in the shell's title bar" → Shell Builder runs analyze + tests through the dart server → candidate promoted.
- [ ] **Step 6:** Record the DeepSeek V4.1 Flash success rate for Steps 2/3/5 (attempts until success) in this plan's notes; if Step 3 fails 3 times, try `Model=IGpt56Luna` once to separate model weakness from tool/playbook gaps, and fix the gaps found (playbook wording, missing tool, unclear errors) — never by raising limits.
- [ ] **Step 7:** Regression suites for every touched project; commit fixes.
