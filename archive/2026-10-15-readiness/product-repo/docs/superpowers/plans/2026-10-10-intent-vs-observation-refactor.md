# Intent vs observation: one owner per fact (refactor after the FilmCraft shell bugs)

> **Status: proposal, awaiting ratification.** Nothing here is implemented.
> **For agentic workers (OpenCode):** implement ONE task. Read `CLAUDE.md`, this plan's "Root causes" and
> "Global constraints", then your task. Touch only the files your task names. Never git
> commit/stash/checkout/reset, never edit `DigitalBrain.slnx`. Plain ASCII only.
> End with: files changed, commands run, test output.

## What happened (2026-10-09, commits b076b571a, 25cc166a3)

Making FilmCraft render in the shell took five separate discoveries. None of them was the plan's suspect:

1. The shell runs as brain `7f2344fa-...` (the session's `defaultBrainId`), but digitalbrain-mcp, the plan
   and every live check used brain `owner`. FilmCraft was opened in a brain nobody was looking at.
2. `IWebBrowser.Navigate` stored a Uri and nothing ever drove the page there. `IPlaywright.Navigate`
   is a different verb on a different neuron with the same name.
3. The shell's WebView2 sends loopback to a dead proxy (`--proxy-server=127.0.0.1:9 <-loopback>`), while
   the C# route handler `ContinueAsync()`ed app-origin requests into that proxy. Two network policies
   disagreed.
4. Status text `Ready` survived a restart (persisted `IText`) while no browser was attached. The
   System One endpoint survived a restart the same way (fixed by J1's reconcile).
5. Failures were invisible: `neurons_call` returns "An error occurred invoking 'neurons_call'" for an
   `ArgumentException`; the shared `EmbeddedBrowser` covers every empty page with Customer Researcher's
   "Enter a company and choose Research"; a failed WebView2 environment is cached for the process.

## Root causes

**R1. Two "current brains".** The shell gets its brain from the session (`ui_client.dart:90`
`session['brainId']`), and the MCP/Open-posture path defaults to `owner`. There is no single answer
to "which brain is this person using", so tooling, plans and the UI drift apart.

**R2. No single owner per fact.** "What the FilmCraft window shows" lives in four places:
`WebBrowserState.Uri` (intent, never enforced), `IPlaywright` (actual page), the Dart widget's own
`_url` (a third copy, used to decide the overlay), and the status `IText`, which both the app synapse
("FilmCraft tools connected.") and `WebBrowserNeuron` ("Ready") write. Network policy also lives in
two places (WebView flags in Dart, route handler in C#).

**R3. Observations persisted as if they were intent.** Durable neuron state should hold what a person
or the deployment *declared*: an app's Uri, a person's API key. Connection status, attached sessions,
live endpoints and "Ready" are *observations*: recomputed at activation and never trusted from storage.
Mixing the two is why restarts lie (R3 is the general form of the "Wipe is a symptom" memory).

**R4. Failure is swallowed at every boundary.** MCP hides the exception message, Dart caches a failed
future and shows product-specific placeholder text, and status shows "Ready" for an attached but blank page.
A bug then looks like "nothing happens" and needs a person with screenshots to find.

## Design (one rule per root cause)

- **D1 One brain resolution.** `BrainScope` gets a single `DefaultBrain(account)` used by the session
  endpoint, the MCP default route (`/mcp` without `/brains/{id}`), Open posture and `neurons_context`.
  `owner` is no longer a special brain key. It is just the owner account, whose default brain is whatever
  that resolution returns. First-party apps install into that default brain.
- **D2 The browser neuron owns the page.** `IWebBrowser` is the single source of what a browser shows:
  `Navigate(uri)` = intent and is reconciled (drive the attached page on every attach and every Navigate,
  already done in b076b571a). `WebBrowserState` gains an *observed* part that is not persisted:
  `Connection` (`Waiting | Attached | Unavailable | Failed`), `Error`, `ActualUrl`. `IWebBrowser.Read()` returns intent + observation.
  The Dart widget renders `ActualUrl`/`Error` from the neuron, so its own `_url` state is removed. Apps stop
  writing browser status. The status line is an app's own text, and the browser shows its own state.
- **D3 One network policy.** All page traffic goes through the C# route handler (public pages via
  `PublicBrowserNetwork`, deployment app origins fetched by the driver). The WebView's dead proxy is
  the documented backstop: "the WebView itself reaches nothing". The comment says so in both files.
- **D4 Observation is never persisted.** Rule for neuron state: if a value is recomputed from the
  world (connection, endpoint, readiness), it lives in a non-persisted field or is reconciled at
  activation/startup. Audit the neurons that write observed state into persisted storage.
  Known: `WebBrowserNeuron` status through `IText`, `IntegrationNeuron` (fixed), and any module
  writing ports/URLs into state.
- **D5 Failures carry their message to the caller.** MCP `neurons_call`/`neurons_get` return the
  exception type and message for `ArgumentException`, `InvalidOperationException`,
  `KeyNotFoundException` and Orleans call failures (never stack traces or secrets). Dart: a failed
  WebView2 environment is reset and retried by the next browser, and is reported through `onAction`
  `{'kind':'webbrowser','action':'unavailable','value':reason}` -> `Connection = Unavailable`. Shared
  components carry no product text.

## Tasks

Order: B1 (orchestrator) first. R2 then lands as B2 -> B3 -> B4, and B5/B6 run in parallel with it
(disjoint projects). B7 last.

### B1: Map the brain resolution (orchestrator, no edits)
With LSP: every place that decides a brain for a caller (session endpoint feeding `defaultBrainId`,
`BrainScope`, MCP route default, Open posture, first-party app publish/install target). Write the
list into this plan under "B1 findings" with file:line and propose the single `DefaultBrain` seam.
**Ratify with the user before B2-B7.** This is a contract change.

### B1 findings (2026-10-09, orchestrator)

Every site that decides a brain for a caller:

1. `src/DigitalBrain.Platform/DigitalBrain.Platform/Identity/AccountSession.cs:102-116` `Build`: route
   `{brainId}` wins, else the cookie claim `intochat.brain`, else the literal `DefaultLogin` ("owner").
   This is the de-facto default-brain rule, used by cookie, Basic and Open callers alike (`:89`, `:96`, `:99`).
2. `.../Identity/IdentityEndpoints.cs:134-141` `Session`: answers only for a **cookie** session; Basic and
   Open callers get `204 No Content`, so the shell learns no brain at all.
3. `app/core/lib/src/ui_client.dart:85-90` `defaultBrainId = session['brainId']` -> stays `null` after a 204.
4. `app/shell/lib/workspace/workspace_app.dart:178-180` with `defaultBrainId == null` calls
   `store.createProject('Personal')`, and `workspace_store.dart:599-615` gives it `id ?? _id()`: a
   **client-invented UUID** (that is `7f2344fa-...`). `workspace_app.dart:985` does the same for a new
   workspace whenever `accountId` is null. Every `/brains/{id}` call then targets that UUID, and the
   Open posture provisions it lazily for the synthetic owner (`BrainAuthorityGrain.cs:67-82`), so it
   "works" while being a brain no server-side default knows about.
5. `src/DigitalBrain.Mcp/DigitalBrain.Mcp/McpHosting.cs:29-31` `/mcp` uses the stamped caller's `BrainId`,
   i.e. rule 1 -> `owner`; `/brains/{id}/mcp` (`:32`) uses the route.
6. Basic bootstrap: `Identity/Directory/IdentityStartup.cs:20-28` creates the operator's membership in
   brain `owner` (`DefaultLogin`). Open posture: `OpenOwnerBrainAccess` (`DirectoryBrainAccess.cs:20-26`),
   `GrainGrantPolicySource` (`Grants/GrantPolicySource.cs:21-23`) and `BrainAuthorityGrain.cs:72-82,109`
   treat principal/account `owner` specially; they key on the *account*, not the brain, so they need no change.
7. Registered users: `PrincipalGrain.cs:39-44` default brain `account-{guid}`; `AccountGrain.cs:39`
   new brains `workspace-{guid}`. These reach the shell through the cookie claim and are consistent.
8. First-party apps: `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs:57-77` `OsDefaults` installs into
   **every** brain on kernel `Created`, so it has no target of its own; it follows whichever brain is born.

Root cause of R1: the server has a default-brain rule (1) but does not tell the shell about it for
non-cookie callers (2), so the shell invents one (4).

**Proposed seam (needs ratification).** One function in `AccountSession`:
`internal static string DefaultBrain(string accountId, string? claimBrain)` = the claim brain, else
for the bootstrap/synthetic owner account `"owner"`. `Build` uses it as its fallback. `/identity/session`
answers `200 SessionView` for **every** resolved caller (`ResolveCaller`, any posture), not only cookies.
`neurons_context` already reports the stamped `BrainId`, so it shows the same value. Dart: a project id
comes from the server (`defaultBrainId`, or `createWorkspace()`), never `_id()`; with no session the
shell shows the login screen instead of inventing a brain. `owner` stays the *value* of the owner
account's default brain but no code compares a brain id to it.
Facts: `TheShellAndMcpResolveTheSameDefaultBrain` (session view brainId == `/mcp` neurons_context brainId,
Open and Basic), `OpenPostureActsInTheOwnersDefaultBrain`, Dart `aShellWithoutAServerBrainDoesNotInventOne`.
B2 therefore also touches `ui_client.dart`, `workspace_app.dart`, `workspace_store.dart` (shell, owned by
"Claude design access": coordinate).

### B2: Brain resolution has one seam (C#, after B1 ratified)
Files: from B1 findings only. Implement `DefaultBrain`. The session, MCP default and Open posture use it,
and `neurons_context` reports it. Facts: `TheShellAndMcpResolveTheSameDefaultBrain`,
`OpenPostureActsInTheOwnersDefaultBrain`. Update `digitalbrain-mcp` docs/prompts that say `owner`.

### B3: WebBrowser observation (C#)
Files: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/WebBrowser/IWebBrowser.cs`,
`.../DigitalBrain.Modules.Flutter/WebBrowser/WebBrowserNeuron.cs`, `IWebBrowserConnector.cs`,
`AppUiEndpoints.cs` (the webbrowser event branch), tests `tests/DigitalBrain.Modules.Flutter.Tests/WebBrowser/*`.
- `WebBrowserState` keeps persisted intent (`Uri`, `Title`). The neuron returns a `WebBrowserView`
  (intent + `Connection`, `Error`, `ActualUrl`) from `Read()`; observation is held in grain fields only.
- `IWebBrowserConnector.Unavailable(string reason)` (clip 200), wired from event `action == "unavailable"`.
- Remove `StatusTextName` from `Configure`; the neuron no longer writes any `IText`.
- Every change of observation dispatches through `IUiBinding` so the shell re-renders.
Facts: `AnAttachedPageShowsTheBrowserUri` (exists, adapt), `AnUnavailableShellBrowserReportsItsReason`,
`ARestartedBrowserIsWaitingNotReady` (deactivate and reactivate the grain, `Connection == Waiting`),
`ANavigationFailureIsTheBrowsersError`.
Wire shape change: B4 updates Dart in the same change window. Do not merge B3 without B4.

### B4: The shell renders the browser neuron (Dart, after B3's shape)
Files: `app/ui/lib/src/components/browser/embedded_browser_windows.dart`, `embedded_browser_stub.dart`,
`ui_web_browser.dart`, `app/ui/lib/src/composition/neuron_view.dart` (webbrowser case), tests in `app/ui/test`.
- Render `ActualUrl`, `Connection`, `Error` from the neuron data, and drop the widget's own `_url` overlay logic
  and the Customer Researcher text (neutral: "Waiting for the page..." / the error).
- Disabled `NeuronView` (no `onAction`, e.g. the Home tile preview) renders a placeholder, never `EmbeddedBrowser`.
- `_environment` reset to null on failure, and the failure is sent as `unavailable` through `onAction`.
- Environment factory injectable for tests.
Tests: `aPreviewNeuronViewDoesNotMountTheEmbeddedBrowser`, `aFailedEnvironmentIsRetriedByTheNextBrowser`,
`aFailedEnvironmentIsReportedAsUnavailable`, `theBrowserShowsTheNeuronsUrlNotItsOwn`. `flutter analyze` clean in ui and shell.

### B5: Apps stop writing browser status (OS apps, after B3)
Files: `src/DigitalBrain.OS/Apps/FilmCraft/synapses/open.cs`, `app.json` (bump), same for `PhotoCraft`,
`src/IntoChat/Apps/CustomerResearcher/synapses/open.cs` + `app.json` (bump) where it passes a status name.
`Configure(browserKey)` without status. App status text says only what the app did ("FilmCraft tools connected.").
Then `OsShippedAppFacts` and the IntoChat shipped-app facts compile the bundles.

### B6: MCP returns the failure (C#, independent)
Files: `src/DigitalBrain.Mcp/DigitalBrain.Mcp/` neuron tools (find the `neurons_call`/`neurons_get` handlers via LSP),
`DigitalBrain.Mcp.Tests.Unit/NeuronSurfaceFacts.cs`.
Map `ArgumentException`, `InvalidOperationException`, `KeyNotFoundException`, `JsonException` (bad arguments)
and Orleans `GrainCallException`/inner to `isError: true` with `"{Type}: {Message}"` (message clipped 500, no stack).
Facts: `ABadArgumentCountSaysSo`, `AGrainExceptionMessageReachesTheCaller`.

### B7: Observation audit (orchestrator + one OpenCode task per finding)
LSP over every `Neuron<TState>` state class: list persisted fields holding ports, URLs from hosting,
connection/readiness flags or session ids. For each one, decide whether to make it non-persisted or
reconcile it at activation/startup. One task per neuron, each with a fact
`A{Thing}IsRecomputedAfterReactivation`.

## Live verification (orchestrator, after B2-B5)
Aspire up. Shell and MCP agree on the brain (`neurons_context` = shell `defaultBrainId`).
`os/filmcraft` open -> window shows the page. `IWebBrowser.Read` = Attached, ActualUrl `http://localhost:18111/`.
Restart Aspire before opening the window -> `Read` = Waiting (not Ready). Kill the WebView environment
(rename the WebView2 user data dir parent to read-only, or inject a bad argument) -> `Unavailable: <reason>` in the
window and in `Read`. `neurons_call` with a wrong argument count -> the message, not "An error occurred".
Then continue the old plan: S4 page tools (`IPageTools.Run commands`, `markers.markIn` visible), J2 Jev.

## Global constraints
Same as `2026-10-10-filmcraft-shell-and-jev-tools.md`: .NET 11 RC, Orleans 10, xunit v3, per-project
build/test with a 5-minute cap, `--artifacts-path E:/intochat/craft/artifacts` while Aspire holds bin/
(repo-root tests, such as TypeParity, Architecture and ShippedAssistant, need normal output). Warnings are errors, no
`/// <summary>`, concrete arrays in grain state, no `ConfigureAwait(false)` in grain code, no state
migrations, never prescribe a storage wipe, never raise timeouts.
