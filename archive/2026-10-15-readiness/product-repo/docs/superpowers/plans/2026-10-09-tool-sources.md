# Tool Sources Implementation Plan

> **For agentic workers (OpenCode):** you implement exactly ONE task below. Read the spec first:
> `docs/superpowers/specs/2026-10-09-tool-sources-design.md`. Read `CLAUDE.md`. Stay inside the
> files your task lists. Do not commit — the orchestrator reviews and commits.

**Goal:** Any MCP server or page agent API becomes a neuron (`IToolSource`) whose tools the assistant
finds through `neurons_search`, Jev routes to, and `neurons_call(... "Run" ...)` runs — then
PhotoCraft/FilmCraft run in Docker under Aspire as the first sources, visible in the shell browser.

**Already done (Task 0, orchestrator):**
- `src/DigitalBrain.Modules/DigitalBrain/Tools/DigitalBrain.Modules.Tools.Contracts/Tools/*`:
  `IToolSource` (`Tools`, `Run(tool, argumentsJson)`), `IToolSources` (`Register`, `Unregister`, `Read`),
  `ToolDescriptor`, `ToolSourceEntry`, `ToolResult`, `ToolBlob`, `ToolsChanged` — namespace `DigitalBrain.Tools`.
- `NeuronType` gained `Key` (`Id(6)`) and `Tool` (`Id(7)`).
- `DigitalBrain.Framework.Contracts.IRuntimeCapabilitySource { Task<IReadOnlyList<NeuronType>> Read(string brainId, CancellationToken ct); }`.
- Dockerfiles: `src/DigitalBrain.Modules/ArtCraft/docker/craft-mcp.Dockerfile` (MCP at `:8000/mcp`),
  `craft-web.Dockerfile` (nginx `:80`). Images `artcraft/{photocraft,filmcraft}-{mcp,web}:dev`.

## Global Constraints (every task)

- .NET 11 RC, Orleans 10, ModelContextProtocol 2.2.0 (`ModelContextProtocol.Core`, `.AspNetCore`), xunit v3.
- Build and test **per project**, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj` · `dotnet test --project src/<test-project-dir>`.
  Cap every test run at 5 minutes (`timeout 300 dotnet test ...`). A hang is a bug, not a timeout to raise.
- Warnings are errors, nullable on, package versions only in `Directory.Packages.props` (add a
  `PackageVersion` there if a new package is needed; never `Version=` in a csproj).
- No `/// <summary>` boilerplate. Inline comments only for what code cannot say. Match surrounding style
  (file-scoped namespaces, primary constructors, expression bodies, `ConfigureAwait(false)` in Framework).
- Grain state: `[GenerateSerializer]` records with **concrete arrays / Dictionary**, never `IReadOnlyList`.
  Every `[Alias]` unique. No self-calls on non-reentrant grains.
- Tests: facts with sentence-shaped names, `TestContext.Current.CancellationToken`, real grains via
  `await using var brain = await ModuleTest.Create().WithModule<XModule>().StartAsync(ct);`
  (`src/Testing/DigitalBrain.Testing.Module`), no mocks of grains.
- Neuron keys start with the brain id: `{brainId}/...`. Brain of a key: text before the first `/`.
- **Do not edit** `DigitalBrain.slnx`, `DigitalBrain-lsp.sln`, `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`,
  `src/DigitalBrain.AppHost/*` unless your task lists them. The orchestrator wires those.
- Done = your project(s) build with 0 warnings and your tests pass. Report the exact commands and output.

---

## Wave A (parallel)

### Task A1: CapabilityCatalog — search over contracts ∪ runtime tools

**Files:**
- Create `src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/CapabilityCatalog.cs`
- Modify `src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/NeuronTypeSearch.cs`
- Modify `src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/ContractCatalogHosting.cs`
- Modify `src/DigitalBrain.Framework/DigitalBrain.Framework/Surface/NeuronSurface.cs` and every construction site of `NeuronSurface` / `NeuronTypeSearch` (find them all; known: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/McpHosting.cs`, `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/NeuronSurfaceFacts.cs`, `NeuronContractFacts.cs`, `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/ContractActionFacts.cs`, `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Integrations/ScriptAccountFacts.cs`)
- Test: `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit/CapabilityCatalogFacts.cs`

**Produces:**
```csharp
public sealed class CapabilityCatalog(ContractCatalog contracts, IEnumerable<IRuntimeCapabilitySource> sources)
{
    public ContractCatalog Contracts { get; }
    // contracts.Read() followed by every source's entries for brainId; brainId null → contracts only.
    // A source that throws is skipped (log nothing; the contracts must still be searchable).
    public Task<IReadOnlyList<NeuronType>> Read(string? brainId, CancellationToken ct);
}
// NeuronTypeSearch keeps its constructor; add:
public Task<IReadOnlyList<NeuronTypeHit>> Search(string query, IReadOnlyList<NeuronType> entries, int take = 10, CancellationToken ct = default);
```
- The existing `Search(query, take, ct)` becomes `Search(query, types.Read(), take, ct)`.
- Vectors are cached **per entry** in a `Dictionary<string, float[]>` keyed by `entry.Id + "\n" + text`
  (text = the string embedded today). Embed only the entries missing from the cache, in one batch.
  Keep the words fallback (`ByWords`) for the no-embeddings case, now over `entries`.
- `NeuronSurface` constructor becomes `NeuronSurface(IDigitalBrain brain, CapabilityCatalog capabilities, NeuronTypeSearch search, IReadOnlySet<string>? allowed = null)`;
  contract lookups use `capabilities.Contracts`. `Search(query, ct)`: brain id = the stamped caller's
  `BrainId` when a caller is stamped (`CallerContextStamper` — find its read API; unstamped → null),
  entries = `await capabilities.Read(brainId, ct)`, then the same allowed-filter logic as today
  (tool entries are filtered by their `Contract`).
- `ContractCatalogHosting.AddContractCatalog` also registers `CapabilityCatalog` as a singleton
  (sources come from DI `IEnumerable<IRuntimeCapabilitySource>`; none registered is fine).

**Facts (CapabilityCatalogFacts):**
- `WithoutSourcesTheCatalogIsTheContracts`
- `ASourcesEntriesFollowTheContractsForItsBrain` (fake `IRuntimeCapabilitySource` returning one entry with `Key`/`Tool` only for brain "one"; brain "two" gets none)
- `AFailingSourceLeavesTheContractsSearchable`
- `WordSearchFindsARuntimeToolByItsDescription` (NeuronTypeSearch with null embeddings, entries incl. a tool "sharpen the image")
- `EmbeddingsAreGeneratedOncePerEntry` (counting fake `IEmbeddingGenerator`: search twice with same entries + one new entry → second call embeds only the new entry + query)
- Existing NeuronSurfaceFacts / NeuronContractFacts / ContractActionFacts / ScriptAccountFacts still pass.

**Verify:** build `DigitalBrain.Framework`, `DigitalBrain.Mcp`, `DigitalBrain.Modules.AI`, `DigitalBrain.Platform`; test `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit`, `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit`, AI tests `--filter-class "*ContractActionFacts*"`.

### Task A2: Tools module — the per-brain registry and its capability source

**Files (create):**
- `src/DigitalBrain.Modules/DigitalBrain/Tools/DigitalBrain.Modules.Tools/DigitalBrain.Modules.Tools.csproj` (copy the shape of `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/*.csproj`: references Framework + `../DigitalBrain.Modules.Tools.Contracts`)
- `.../DigitalBrain.Modules.Tools/ToolsModule.cs` — `public sealed class ToolsModule() : Module(new ModuleId("tools"))` with `Contracts => typeof(IToolSource).Assembly`; registers `ToolCapabilitySource` as `IRuntimeCapabilitySource` singleton in the silo services (look at how another module overrides service registration — e.g. `QdrantModule.Configure(ISiloBuilder)` or the Apps module).
- `.../DigitalBrain.Modules.Tools/ToolSourcesNeuron.cs` — `[GrainType("tools.sources")]`, implements `IToolSources`. Copy the neuron base/state pattern from a simple neuron in the Apps module (find one deriving the Framework neuron base with persisted state).
  - State `ToolSourcesState { Dictionary<string, ToolSourceEntry> Sources }` (`[GenerateSerializer, Alias("tools.sources-state")]`).
  - Brain = this key's text before `/` (key is `{brainId}/tools`; reject other shapes in activation with `ArgumentException`).
  - `Register(entry)`: `entry.Key` must start with `{brainId}/` else `UnauthorizedAccessException`; cap `Tools` to 200 and each `Description` to 1000 chars; upsert; persist; publish `ToolsChanged(entry.Key, count)`.
  - `Unregister(key)`: remove, persist, publish `ToolsChanged(key, 0)`.
  - `Read()`: values ordered by key, as an array.
- `.../DigitalBrain.Modules.Tools/ToolCapabilitySource.cs` — `internal sealed class ToolCapabilitySource(IGrainFactory grains) : IRuntimeCapabilitySource`:
  reads `IToolSources` at `{brainId}/tools`, maps each tool to
  `new NeuronType($"tool:{entry.Key}/{tool.Name}", "tools", $"{entry.Title}: {tool.Title}", tool.Description, [$"Task<ToolResult> Run(\"{tool.Name}\", arguments) — {schema}"], entry.Contract, entry.Key, tool.Name)`
  where `schema` is `tool.InputSchema` clipped to 600 chars.
- Test project `src/DigitalBrain.Modules/DigitalBrain/Tools/tests/DigitalBrain.Modules.Tools.Tests/` (copy the Apps tests csproj shape) with `ToolSourcesFacts.cs`:
  - `ARegisteredSourceIsReadBackWithItsTools`
  - `ASourceOutsideTheBrainIsRefused` (`{brain}/tools` registry, entry key `other/mcp/x` → `UnauthorizedAccessException`)
  - `RegisteringPublishesToolsChanged` (use the harness's signal reading helpers — find how other module tests observe a signal)
  - `TheCapabilitySourceTurnsToolsIntoKeyedEntries` (resolve `IRuntimeCapabilitySource` from the test silo's services or construct `ToolCapabilitySource` over the test cluster's grain factory; check `Id`, `Key`, `Tool`, `Contract`)
  - `ToolListsAreCapped` (250 tools → 200)

**Verify:** build + test the two new projects. Run `src/Testing/DigitalBrain.Architecture.Tests` `--filter-class "*VocabularyRingFacts*"` and `"*PersistedStateFacts*"` (they must stay green; if `RepositoryLayoutFacts` fails only because the orchestrator hasn't added slnx entries yet, say so — do not edit the slnx).

### Task A3: Playwright `Evaluate`

**Files:**
- Modify `src/DigitalBrain.Modules/Microsoft/Playwright/DigitalBrain.Modules.Microsoft.Playwright.Contracts/IPlaywright.cs`: add
  `Task<string> Evaluate(string expression, CancellationToken ct = default);` — runs `expression` in the attached page and returns the result as JSON text (`"null"` for undefined). Promises are awaited.
- Implement through the session provider (`PlaywrightSessionProvider.cs`, the neuron class, any fake/test provider implementing the provider interface — find all implementations).
  Use `page.EvaluateAsync<JsonElement?>(expression)`; serialize to raw JSON; cap result at 256 KB (`InvalidOperationException` beyond).
- Test in the existing Playwright tests project (`PlaywrightNeuronFacts.cs` style): `EvaluateReturnsTheExpressionResultAsJson` using the same harness/fake those facts use.

**Verify:** build Playwright projects; test the Playwright tests project; build `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter` (it consumes IPlaywright).

---

## Wave B (after A merges)

### Task B1: MCP connector module — `IMcpServer`

**Files (create)** under `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/`:
- `DigitalBrain.Modules.Mcp.Contracts/` (references `src/DigitalBrain` and Tools.Contracts), namespace `DigitalBrain.Mcp`:
```csharp
[Alias("mcp.server"), DefaultGrainType("mcp.server")]
public interface IMcpServer : IToolSource
{
    Task<McpServerState> Connect(McpServerSpec spec, CancellationToken ct = default);   // lists tools, registers in {brain}/tools
    Task Disconnect(CancellationToken ct = default);                                    // unregisters
    [ReadOnly, AlwaysInterleave] Task<McpServerState> Read();
}
[GenerateSerializer, Alias("mcp.server-spec")] record McpServerSpec(string Title, string Url);
[GenerateSerializer, Alias("mcp.server-state")] record McpServerState(string Title, string Url, bool Connected, ToolDescriptor[] Tools, string? Error, DateTimeOffset? RefreshedAt);
[GenerateSerializer, Alias("mcp.tool-ran")] record McpToolRan(string Tool, bool IsError, int Elapsed) : Signal;
```
- `DigitalBrain.Modules.Mcp/McpModule.cs` (`ModuleId("mcp")`), `McpServerNeuron.cs` (`[GrainType("mcp.server")]`, key `{brain}/mcp/{name}`):
  - HTTP client: `HttpClientTransport` with `Endpoint = new Uri(spec.Url)` (see `src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce/Salesforce/McpHttpSession.cs` for the exact 2.2.0 API). One client per call is acceptable for v1 (open → op → dispose).
  - `Connect`: validate `http`/`https` URL; `ListToolsAsync` → descriptors (`Name`, `Title ?? Name`, `Description ?? ""`, `JsonSchema.GetRawText()`, `ReadOnly = annotations?.ReadOnlyHint == true`); persist; `IToolSources.Register(new(key, typeof(IMcpServer).FullName!, spec.Title, tools))`. On failure: persist `Error`, `Connected=false`, rethrow `InvalidOperationException` with the message.
  - `Tools()`: return persisted tools (no network).
  - `Run(tool, arguments)`: not connected → `InvalidOperationException`; parse arguments as a JSON object (`ArgumentException` otherwise) to `Dictionary<string, object?>`; `CallToolAsync`; text content blocks joined by `\n` → `Text` (cap 128 KB), image/audio blocks → `ToolBlob(mimeType, base64)`; `IsError` from the result; publish `McpToolRan`.
  - Caller from another brain than the key's brain → `UnauthorizedAccessException` (find the caller-context reader used by other neurons, e.g. `NeuronAccess`).
- Tests `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/tests/DigitalBrain.Modules.Mcp.Tests/`:
  an in-process MCP server (ASP.NET Core `WebApplication` on `http://127.0.0.1:0`, `AddMcpServer().WithHttpTransport().WithTools<FakeTools>()`, `app.MapMcp("/mcp")`) with tools `echo(text)` and `pixel()` returning an image block.
  Compose `.WithModule<McpModule>().WithModule<ToolsModule>()`.
  - `ConnectingListsTheServersToolsAndRegistersThem`
  - `RunCallsTheToolAndReturnsItsText`
  - `RunReturnsImageContentAsABlob`
  - `RunBeforeConnectIsRefused`
  - `AnUnreachableServerIsAStateErrorNotARegistration`
  - `DisconnectingUnregistersTheSource`

### Task B2: Page tools — a page's agent API as a tool source

**Files:** in the Playwright module (`src/DigitalBrain.Modules/Microsoft/Playwright/...`):
- Contracts: 
```csharp
[Alias("playwright.page-tools"), DefaultGrainType("playwright.page-tools")]
public interface IPageTools : IToolSource
{
    Task<PageToolsState> Configure(PageToolsSpec spec, CancellationToken ct = default);
    [ReadOnly, AlwaysInterleave] Task<PageToolsState> Read();
}
// Driver = the IPlaywright key bound to the page; Api = the window global ("filmcraft").
[GenerateSerializer, Alias("playwright.page-tools-spec")] record PageToolsSpec(string Title, string Driver, string Api);
[GenerateSerializer, Alias("playwright.page-tools-state")] record PageToolsState(string Title, string Driver, string Api, bool Configured);
```
- Neuron `PageToolsNeuron` (key `{brain}/pages/{name}`), project reference to Tools.Contracts. Fixed tool list (mirrors the ArtCraft MCP surface):
  - `commands` `{filter?: string}` → `window.{api}.request('engine.commands', {})`, filtered client-side by id substring;
  - `execute` `{command: string, params?: object}` → `window.{api}.execute(command, params ?? {})`;
  - `request` `{method: string, params?: object}` → `window.{api}.request(method, params ?? {})`.
  Build the JS with `JsonSerializer.Serialize` for every interpolated value (no string concatenation of raw input). `Api` must match `^[A-Za-z_][A-Za-z0-9_]*$`.
  `Configure` persists and registers in `{brain}/tools` with `Contract = typeof(IPageTools).FullName`.
  The page answers from its frame loop, so a hidden page never settles: wrap each evaluated call in
  `Promise.race([call, new Promise((_, reject) => setTimeout(() => reject(new Error('page not rendering')), 15000))])`
  and surface it as `ToolResult(IsError: true, "page not rendering: open the window", [])`.
- Facts (Playwright tests project, fake provider recording the evaluated expression):
  `ConfiguringRegistersTheThreePageTools`, `ExecuteEvaluatesTheApisExecuteWithEncodedArguments`, `AnApiNameThatIsNotAnIdentifierIsRefused`.

### Task B3: Jev routes over capabilities

**Files:** `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs`,
`src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteResult.cs`, AI tests.
- `RouteResult` gains `[property: Id(4)] string? Key = null, [property: Id(5)] string? Tool = null`.
- `Route` and `Achieve` read `CapabilityCatalog.Read(Scope, ct)` instead of `ContractCatalog.Read()` (same `allowed` filter by `Contract`).
  A chosen entry with `Key` skips the method question: method `Run`, result carries `Key`/`Tool`.
- `Fill` for a keyed route: instruction asks only for `{"arguments": {...}}` matching the tool schema (the entry's Methods text);
  the call is `surface.Call(contract, entry.Key, "Run", JSON array [tool, argumentsObjectAsString])`.
- Facts (find the existing router facts with a scripted System One): `JevRoutesToARuntimeToolAndRunsItOnItsKey` with a fake `IRuntimeCapabilitySource` registered in the test silo + a fake `IToolSource` grain or the Tools module.

### Task B4: Assistant composes tool sources

`src/DigitalBrain.OS/Apps/Assistant/synapses/send.cs`: add `typeof(IToolSource).FullName!` to `contracts`
(`using DigitalBrain.Tools;`). `prompts/system.md`: one sentence — runtime tools appear in `neurons_search`
with a key; call them with `neurons_call(contract, key, "Run", ["<tool>", "<json object>"])`.
Verify: `OsShippedAppFacts` in `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` (`--filter-class "*OsShippedAppFacts*"`).

---

## Wave C (after B)

### Task C1: ArtCraft module + Aspire hosting

Under `src/DigitalBrain.Modules/ArtCraft/ArtCraft/`:
- `DigitalBrain.Modules.ArtCraft.Contracts` — `IArtCraftStudio` (`[Alias("artcraft.studio")]`, key `{brain}/artcraft`):
  `Task<ArtCraftSession> Open(string app, CancellationToken ct = default)` where app ∈ `photocraft|filmcraft`;
  `ArtCraftSession(string App, string McpKey, string? WebUrl, string? PageToolsKey)`.
- `DigitalBrain.Modules.ArtCraft` — `ArtCraftModule : Module<ArtCraftModuleOptions>(new ModuleId("artcraft"))`;
  options `PhotoCraftMcp`, `FilmCraftMcp`, `PhotoCraftWeb`, `FilmCraftWeb` (URLs, strings, no secrets).
  `Open`: `IMcpServer` at `{brain}/mcp/{app}` → `Connect(new(title, options mcp url))` (idempotent: skip when Read() is connected to the same URL); returns the web URL from options.
- `DigitalBrain.Modules.ArtCraft.Aspire.Hosting` — `ArtCraftModuleHosting : ModuleHosting<ArtCraftModule>` modelled on
  `src/DigitalBrain.Modules/Qdrant/DigitalBrain.Modules.Qdrant.Aspire.Hosting/QdrantModuleHosting.cs`:
  four `AddContainer(name, "artcraft/<app>-<kind>", "dev")` resources (images are prebuilt locally; `WithImageRegistry` none),
  MCP containers `WithHttpEndpoint(targetPort: 8000, name: "mcp")` + `WithHttpHealthCheck("/healthz")` + a bind/volume for `/work`;
  web containers `WithHttpEndpoint(targetPort: 80, name: "http")`. Project each endpoint into the module options
  (`DigitalBrain:Modules:artcraft:Options:PhotoCraftMcp` = `{endpoint}/mcp`, etc.) the way Qdrant projects its connection — find the options projection helper.
- Tests `tests/DigitalBrain.Modules.ArtCraft.Tests`: `OpeningConnectsTheAppsMcpServer` (options pointing at an in-process MCP server as in B1),
  `AnUnknownAppIsRefused`; a hosting fact `TheHostingAddsTheFourContainersWithTheirEndpoints` (see Qdrant hosting tests or `DigitalBrain.Aspire.Testing`).

### Task C2: OS apps `photocraft` and `filmcraft`

`src/DigitalBrain.OS/Apps/PhotoCraft/` and `FilmCraft/` bundles modelled on `src/IntoChat/Apps/CustomerResearcher`
(`app.json`, `app.spec.md`, `icon.svg`, `synapses/open.cs`): `open` → `IArtCraftStudio.Open(app)`, opens a
window composing the web browser part, `IWebBrowser.Configure(...)` and navigates to `WebUrl`. FilmCraft's
open also `IPageTools.Configure(new("FilmCraft", <the window's playwright key>, "filmcraft"))`.
Verify: `OsShippedAppFacts`.

---

## Orchestrator (integration, after each wave)

slnx + `DigitalBrain-lsp.sln` entries, `OsCatalog.BuiltIn()` adds `ToolsModule`, `McpModule`, `ArtCraftModule`;
`AppHost.cs` + csproj add ArtCraft hosting; MCP host registers `ToolCapabilitySource`; architecture tests;
`aspire run`; drive through `digitalbrain-mcp`; traces; shell browser.
