# Tool Sources: MCP servers and live apps as searchable neurons

**Status:** design, 2026-10-09. Approved direction from chat: one generic connector to any MCP
server, FilmCraft/PhotoCraft as the first consumers, the shell's built-in browser as the live view.

## Problem

The assistant reaches the world through four fixed tools over neuron contracts
(`neurons_list/search/get/call`, `NeuronSurface`). Search ranks *CLR contract types*
(`ContractCatalog` → `NeuronTypeSearch`). External systems that already describe themselves at
runtime — any MCP server, a web app with an agent API (`window.filmcraft`) — have no `Type`, so
today each one needs a hand-written module (Salesforce wraps MCP privately in `McpHttpSession`).

## Decisions

### 1. `IToolSource` — a neuron contract, not a fifth word

A tool source is a **neuron** that can describe tools and run them. It lives in the vocabulary ring
(`src/DigitalBrain`, namespace `DigitalBrain.Tools`) so scripts can call it too.

```csharp
public interface IToolSource : INeuron
{
    Task<ToolDescriptor[]> Tools(CancellationToken ct = default);
    Task<ToolResult> Run(string tool, string arguments, CancellationToken ct = default); // arguments = JSON object
}
record ToolDescriptor(string Name, string Title, string Description, string InputSchema /*JSON schema*/, bool ReadOnly);
record ToolResult(bool IsError, string Text, ToolBlob[] Blobs);
record ToolBlob(string MediaType, string Data /*base64*/, string? Uri);
```

Implementations: `IMcpServer : IToolSource` (generic MCP connector module), `IPageTools : IToolSource`
(a page's JS agent API through the Playwright neuron). Behaviors use `Run(tool, json)` — the
deliberate untyped escape hatch; typed facades can be added later per app without changing this.

### 2. Index everything a source lists; commands stay behind the source's own discovery

MCP servers list *tools*, not commands: PhotoCraft lists ~15 (`command_list`, `command_run`,
`doc_inspect`, `render_preview`, `ui_screenshot`…); its 500+ engine commands are reached through
`command_list(filter)` → `command_run(id, params)`. So every listed tool is indexed. A per-source cap
(200 tools) and description truncation (1 000 chars) bound a misbehaving server.

### 3. Visibility is per brain, through a registry neuron

`IToolSources` keyed `{brainId}/tools` holds the brain's source keys + contract name + a descriptor
snapshot (refreshed when a source connects or reports a changed tool list). Only a source whose key
starts with `{brainId}/` can register there, and the source neuron itself refuses callers from
another brain.

### One capability list for search *and* Jev

Two consumers pick capabilities today, both from `ContractCatalog.Read()`:
`NeuronTypeSearch` (the model's `neurons_search`) and Jev (`RouterNeuron.Route`, which offers the
catalog to System One as choices, then `Fill`s key + arguments with a language model and dispatches
through `NeuronSurface.Call`). Both switch to **`CapabilityCatalog.Read(brainId)`** (Framework):
`ContractCatalog.Read()` ∪ the brain's tool entries from `IToolSources`.

- `NeuronType` gains `string? Key` (`Id(6)`) and `string? Tool` (`Id(7)`). A tool entry is
  `NeuronType(Id: "tool:{key}/{name}", ModuleId: "tools", Name: title, Description, Methods:
  ["Task<ToolResult> Run(\"{name}\", arguments) — {schema}"], Contract: typeof(IToolSource).FullName, Key: key, Tool: name)`.
- `NeuronTypeSearch.Search(query, entries, take, ct)` ranks a supplied list; vectors are cached per
  entry (`Id` + text hash), so contract vectors are embedded once and a brain's tools once per change.
- `NeuronSurface.Search` resolves the stamped brain (`BrainScope.CurrentId()`; unstamped → contracts
  only) and searches `CapabilityCatalog.Read(brain)`.
- Jev: `Route` builds its choices from `CapabilityCatalog.Read(scope)`; a chosen entry with `Key`
  skips the method question (`Run`) and returns `RouteResult` with new `Key`/`Tool` (`Id(4)`/`Id(5)`).
  `Fill` for a tool route asks the language model only for the JSON arguments object against the
  tool's schema, and dispatch calls `Run(tool, json)` on the fixed key.
- The model then calls `neurons_call(contract: "DigitalBrain.Tools.IToolSource", key, "Run",
  ["command_run", "{…}"])` — `Call` already dispatches by reflection; **no new tool**.
- `Restrict`: a plan composes `DigitalBrain.Tools.IToolSource` like any contract; tool hits pass the
  filter by their `Contract`. Assistant default contracts include it.

## Modules

| Project | Holds |
|---|---|
| `src/DigitalBrain` (`Tools/`) | `IToolSource`, `IToolSources`, records, `ToolsChanged` signal |
| `src/DigitalBrain.Framework` | `ToolSourcesNeuron` (registry grain), search merge in `NeuronSurface`/`NeuronTypeSearch` |
| `Modules/ModelContextProtocol/Mcp` | `IMcpServer` (key `{brain}/mcp/{name}`), `McpServerNeuron` (ModelContextProtocol 2.2.0 HTTP client), connector `mcp` (none / bearer) |
| `Modules/Microsoft/Playwright` | `IPlaywright.Evaluate(string expression)` → JSON string |
| `Modules/Google/Flutter` (or Playwright) | `IPageTools` keyed `{brain}/pages/{name}`: tools from `window.<api>.request('engine.commands')`, run through `Evaluate` |
| `Modules/ArtCraft/ArtCraft` | options (endpoints), `ArtCraftModuleHosting` adds the containers, OS apps `photocraft`/`filmcraft` |

## ArtCraft runtime

Containers (`src/DigitalBrain.Modules/ArtCraft/docker`):
- `craft-mcp.Dockerfile` (APP=photocraft|filmcraft): `<app>-cli mcp` (stdio) bridged by
  `mcp-proxy` (one SDK client session to the CLI; supergateway mixed sessions' JSON-RPC ids) to Streamable HTTP `:8000/mcp`, health `/status`, `/work` volume shared as the workspace.
- `craft-web.Dockerfile`: the wasm build on nginx `:80`.

Live view: the OS app's `open` synapse opens a window holding the shell's `UiWebBrowser` part
pointed at the web container (Windows shell has the real browser). FilmCraft: the page *is* the
engine — `IPageTools` over the same page lets the assistant and the human edit one timeline.
PhotoCraft: the web build has no JS agent API yet, so the agent edits through the headless MCP
container and the window shows `render_preview` output; switching to `IPageTools` is a config change
once PhotoCraft ships `window.photocraft`.

**Measured 2026-10-09:** `window.filmcraft` exposes `request, execute, commands, inspect, screenshot,
info, files, readFile, importFiles, importUrl, openProject`. Requests are served from the app's frame
loop, so they settle only while the page renders (`document.hidden == false`): page tools need the
window open; `PageToolsNeuron.Run` bounds each evaluation and reports "page not rendering" instead of
hanging. The FilmCraft web image must be built without bookworm's binaryen (old `wasm-opt` breaks the
externref table: `WebAssembly.Table.grow(): failed to grow table`).

## Non-goals

Typed per-command contracts; streaming video of a desktop; RustDesk/VNC; replacing Salesforce's
private client (follow-up once `IMcpServer` is proven).

## Verification

Unit: registry scoping, search merge (word fallback + scripted embeddings), call dispatch to a fake
source, MCP neuron against an in-process MCP server. E2E: Aspire up with ArtCraft containers healthy;
over `digitalbrain-mcp`: `neurons_search("sharpen an image")` returns a PhotoCraft tool hit;
`neurons_call(IToolSource, owner/mcp/photocraft, Run, ["command_list", "{\"filter\":\"sharpen\"}"])`
returns commands; traces show the MCP client span. Browser: FilmCraft page loads in the shell
browser and `IPageTools.Run("engine.commands")` returns the command list.
