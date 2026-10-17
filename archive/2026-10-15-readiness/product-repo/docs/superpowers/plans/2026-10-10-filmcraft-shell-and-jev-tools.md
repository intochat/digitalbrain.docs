# FilmCraft in the Flutter shell + Jev routes to runtime tools

> **For agentic workers (OpenCode):** implement ONE task. Read `CLAUDE.md`, the spec
> `docs/superpowers/specs/2026-10-09-tool-sources-design.md`, the Global Constraints below and your task.
> Touch only the files your task names. Never run git commit/stash/checkout/reset. Plain ASCII only.
> End with: files changed, commands run, test output.

**Context (2026-10-09, branch `os-runtime`, HEAD 4650ed586):** tool sources, the MCP connector, ArtCraft
containers (ports 18100/18101 MCP, 18110/18111 web), Playwright `Evaluate` on deployment app origins and
`IPageTools` are committed and verified live through `digitalbrain-mcp`, with a headless Chromium standing
in for the shell. Two gaps remain:

1. **FilmCraft window in the shell never creates a WebView2.** `os/filmcraft` open composed the window
   (`owner/apps/filmcraft/window`, surface -> layout column [status text, webbrowser] extents [40, 0]),
   `IWebBrowser` has `Uri = http://localhost:18111/`, `IPageTools` is configured, status stays
   "Waiting for browser...", `IPlaywright.Read()` is not connected, and no `msedgewebview2.exe` with
   `--remote-debugging-port` exists.
2. **Jev never ran.** `IRouter.Route` failed: `No connection could be made ... (localhost:58876)`.

## What the code says (mapped 2026-10-09)

**Shell browser chain:** `workspace_app.dart:510-531` `_editor()` renders a window only when
`a.kind == 'surface' || a.data['surface'] is Map` and `programmingClient != null`, as
`NeuronView(..., onAction: client.appRequest(workspace, 'event'))` -> `neuron_view.dart:482-506`
`case 'webbrowser'` -> `UiWebBrowser` (`ui_web_browser.dart`, conditional import stub vs
`embedded_browser_windows.dart`, package `webview_windows ^0.4.0`) -> `EmbeddedBrowser.initState`
-> `_environment ??= _initializeEnvironment()` (`embedded_browser_windows.dart:11-27,62-67`: one
**process-wide cached future**, free loopback port, temp user-data dir,
`--remote-debugging-port=$port`) -> `controller.initialize()` -> `loadUrl('about:blank#digitalbrain-$session')`
-> `:108 onConnect(port, session)` -> event POST -> `AppUiEndpoints.cs:81-89` -> `IWebBrowserConnector.Connect`
-> `WebBrowserNeuron.Attach` -> `IPlaywright.Attach` (CDP).

Suspects, in order:
- **Home tile preview** (`workspace_app.dart:735-745`) builds `NeuronView(..., enabled: false)` with no
  `onAction`, so it mounts an `EmbeddedBrowser` that starts the environment but never connects.
- **Cached failure:** if the first `_initializeEnvironment` throws, the failed future is cached for the
  process; every later browser shows "Browser could not start..." (`:110-116`) and nothing reaches C#.
- **The window never reaches `_editor`** (not focused / artifact shape) or the widget unmounts before `:105`.
- Not a cause: extents (0 = flex, same as Customer Researcher `[60,40,64,0,0]`).

**Jev:** `SystemOneHostingState.cs:73-74` gives the `systemone` container a random proxied host port per
run; `:58` projects the live URL as `DigitalBrain:Integrations:typesafe:Endpoint`; but
`IntegrationSeeder.cs:38-50` -> `IntegrationNeuron.cs:52-58` seeds only when `Unconfigured && Revision == 0`,
and `HttpSystemOne.cs:30-32` prefers the persisted setting. So the first run's port is kept forever.
(Memory: "Wipe is a symptom" - grains keep code-derived state without reconcile. Fix the reconcile,
never prescribe a storage wipe.)

## Global Constraints

- .NET 11 RC, Orleans 10, xunit v3; Flutter shell at `src/DigitalBrain.Modules/Google/Flutter/app`
  (`flutter analyze` + `flutter test` from `app/shell` and `app/ui`).
- LSP/codegraph for code navigation; build/test **per project**, never the `.slnx`, 5-minute cap per run.
- If another session's Aspire holds bin/ locks, build/test with `--artifacts-path E:/intochat/craft/artifacts`
  (repo-root-discovering tests - architecture, ShippedAssistant - need the normal output instead).
- Warnings are errors; no `/// <summary>`; concrete arrays in grain state; no `ConfigureAwait(false)` in grain code.
- Changing a shipped OS app's files requires bumping its `app.json` version, then
  `POST /brains/{id}/apps/{name}/update` on a running brain.
- Only one `aspire run` at a time on this PC (ports 5080/5081): coordinate with other sessions first.

---

## Task S1: See why the FilmCraft window has no WebView2 (diagnose, no fix)

Run Aspire, install/update `os/filmcraft`, `IApp.Request(owner/apps/filmcraft, "open")`, bring the
shell's FilmCraft window to front (ask the user to click it if needed). Then, with the Dart MCP server
(`dtd` to connect to the running shell, `widget_inspector`, `get_runtime_errors`, `flutter_driver_command`):
1. Is a `UiWebBrowser` / `EmbeddedBrowser` in the widget tree for the FilmCraft window? Is it the Home tile
   preview's instance or the editor's?
2. Runtime errors / the pane's text ("Browser could not start...", "Live research requires...").
3. `msedgewebview2.exe` processes and their `--remote-debugging-port`.
4. Compare with Customer Researcher's window (`intochat/customer-researcher`), which is known to attach.
Report which suspect is real, with evidence. **No edits.**

## Task S2: Fix the shell browser lifecycle (Dart, depends on S1)

Files: `app/ui/lib/src/components/browser/embedded_browser_windows.dart`,
`ui_web_browser.dart`, `app/ui/lib/src/.../neuron_view.dart` (find exact paths), tests under `app/ui/test`.
Expected fixes (apply the ones S1 confirms):
- A disabled `NeuronView` (no `onAction`, e.g. the Home tile preview) renders a **placeholder** for
  `webbrowser`, never an `EmbeddedBrowser` (a preview must not start WebView2).
- `_environment` is reset to `null` when initialization fails, so the next browser retries.
- When initialization fails, report it: send `{'kind':'webbrowser','action':'unavailable','value': reason}`
  through `onAction` so the C# status leaves "Waiting for browser..." (C# side in S3).
Tests (`flutter test`): `aPreviewNeuronViewDoesNotMountTheEmbeddedBrowser`,
`aFailedEnvironmentIsRetriedByTheNextBrowser` (inject an environment factory), plus `flutter analyze` clean.

## Task S3: The connector hears "unavailable" (C#, depends on S2's event shape)

Files: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/` `AppUiEndpoints.cs`,
`WebBrowser/WebBrowserNeuron.cs` (+ `IWebBrowserConnector`), tests in
`tests/DigitalBrain.Modules.Flutter.Tests/WebBrowser/WebBrowserFacts.cs`.
`action == "unavailable"` -> `IWebBrowserConnector.Unavailable(string reason)` -> status
`"Browser unavailable: {reason}"` (clip 200), no Playwright call.
Fact: `AnUnavailableShellBrowserShowsItsReasonInTheStatus`.

## Task S4: Live verification in the shell (orchestrator)

Aspire up -> update/open `os/filmcraft` -> FilmCraft window visible in the shell. Expect:
`owner/apps/filmcraft/status` = "Ready"; `IPlaywright.Read(owner/apps/filmcraft/browser)` connected+ready with
`url = http://localhost:18111/`; via `digitalbrain-mcp`:
`neurons_call(IPageTools, owner/pages/filmcraft, Run, ["commands","{\"filter\":\"timeline\"}"])` returns
commands; `execute` a visible command (e.g. `markers.markIn`) and the user sees it in the window.
Traces: `IWebBrowserConnector/Connect` -> `IPlaywright/Attach` -> `IPageTools/Run` -> `IPlaywright/Evaluate`.

---

## Task J1: Deployment-provisioned integration values reconcile on every boot

Files: `src/DigitalBrain.Platform/.../IntegrationSeeder.cs`, `IntegrationNeuron.cs` (find via LSP),
platform unit tests (`DigitalBrain.Platform.Tests.Unit`, find the seeder facts).
Rule: a field the deployment provides (host configuration) is reconciled each boot when it differs from
the stored value **and the stored value also came from the deployment** (track provenance per field, e.g.
`SeededFields` / a `Source` marker in the integration state); a value a person set through the API is
never overwritten. No migration code (no stored data to keep).
Facts: `ADeploymentEndpointThatMovedIsReconciledOnBoot`, `APersonSetValueIsNotOverwrittenBySeeding`.
Coordinate first: this is Platform code another session may be editing.

## Task J2: Jev routes to a runtime tool, live (orchestrator)

Aspire up (System One healthy) -> via `digitalbrain-mcp`:
`neurons_call(IRouter, owner, Route, ["render a preview of the open PhotoCraft document", null])` ->
`RouteResult` with `contract = DigitalBrain.Mcp.IMcpServer`, `method = Run`, `key = owner/mcp/photocraft`,
`tool = render_preview` (or `doc_render_preview`). Then `Dispatch` the same request after `doc_new` -> a PNG
blob in the outcome. Then the assistant path: `IApp.Request(owner/apps/assistant, "send", ...)` - status
shows `Jev: DigitalBrain.Mcp.IMcpServer.Run (0.xx)` when above the gate, or the hint lists the tool.
Traces: `IRouter/Route` -> `ISystemOne/Ask` (one capability question, **no** method question for a keyed
tool) -> `IMcpServer/Run`. If Route picks badly, record the System One probabilities; do not tune
thresholds to pass.

## Regression net (orchestrator, after each task)

Tools, Mcp module, Mcp.Tests.Unit, Playwright, Flutter (C#), AI (`SystemOneRouterFacts`,
`ContractActionFacts`, `AssistantGateFacts`), OS unit (`OsShippedAppFacts`), Platform unit (J1),
`flutter test` (ui, shell), Architecture tests.
