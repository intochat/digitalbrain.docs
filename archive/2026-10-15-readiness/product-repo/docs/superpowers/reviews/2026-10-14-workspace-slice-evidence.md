# Contracts and C# Workspace — first implementation slice

Implemented in `codex/app-workspace`, from `da065933d`, on 2026-10-14.

## Implemented boundary

- Apps publish optional named views without requiring a sphere. Existing presentation serializer IDs and legacy slots remain compatible. Publishing still requires the app caller and current program revision; unique names and local roots are validated.
- `IWorkspace.Apply` persists typed open views, focus, and pins. It checks workspace-app authority, expected revision, bounded collections, local app references, and payload-bound operation receipts. Navigation is separate from execution.
- `IViewport` stores a local app/view target. The HTTP projection resolves a published root without requesting any app operation. The generic Flutter renderer mounts it with existing cycle/depth bounds.
- `IButton.ClickCurrent` rejects a click whose action no longer matches the displayed definition. Workspace commands additionally carry the workspace revision, so delayed navigation cannot reopen a closed view or select a different recycled tab.
- `features/os/Workspace` is an ordinary C# app. Four typed synapses handle app requests, composition, buttons, and launcher selections. The app owns launcher choices, pins, open tabs, close/focus rules, Ino access, and the bottom-bar arrangement. Its state is stored in neurons.
- A generic connector build option mounts an app-authored root. Flutter does not know the Workspace app name or implement its navigation policy. Horizontal compositions scroll when their declared controls exceed available space.
- Unsupported restored contexts render an explicit message while keeping navigation available. No usage value is invented: the current placeholder says “Usage unavailable.”

## Verification

| Check | Result |
|---|---|
| Flutter module C# project | 145 tests passed |
| Apps presentation tests | 9 tests passed, including invalid/duplicate roots, caller/revision checks and null sphere keys |
| Flutter UI package | 183 tests passed; includes mounted viewport, recursion bound and 360-pixel row reachability |
| Flutter shell package | 145 tests passed; includes typed workspace DTO compatibility |
| UI and shell analysis | No issues found |
| AppHost project build | Passed |
| Flutter live hot reload | Succeeded in 421 ms after the final Dart edit |
| Independent review | Two important findings fixed and re-reviewed; no remaining blocking findings in those fixes |

New regression cases were observed failing before their implementations. A pre-existing Flutter test referenced the removed circle-pause contract; its obsolete fixture was replaced with current revocation/read-denial coverage before the module suite could run.

The full Apps suite did not finish: FastPathFacts logged `Invalid brain scope` from `InstanceRegistration.features` storage and stalled. Its process was stopped; this report does not claim the full Apps suite passes. The focused presentation suite passes. C# LSP diagnostics for changed production files are clean after opening the new files; the Apps test project has design-time missing-reference diagnostics despite its focused CLI build/test passing. Dart LSP published no diagnostics for edited files. These tooling/test limitations remain recorded rather than hidden.

## Running-system proof

Used a separate Aspire runtime and `.digitalbrain/workspace-proof` journal in this worktree. No existing brain store or key was reset. The rebuilt OS, C# sandbox, and MCP host reported Healthy. Workspace was installed through the normal shipped-app loader and updated through the normal versioned update endpoint, reaching version 0.1.4 / Live.

`digitalbrain-mcp` and visible Flutter controls verified:

1. Runtime restart restored the previously open Calculator and focus from the same journal.
2. The C# Workspace published its root and the viewport mounted Calculator's published legacy Main view.
3. Pinning persisted a pin; closing the last view left no open views and null focus.
4. Replaying an older revision did not reopen the closed view.
5. Reopening a pin restored its view; opening it again did not create a duplicate.
6. The rebuilt button neuron rejected an old action after composition changed.
7. Clicking the visible dock close button cleared the center workspace; clicking its retained Calculator pin reopened it.

Aspire logs confirmed typed subscriptions and successful `events.cs`, `buttons.cs`, `launcher.cs`, and `compose.cs` reactions. Example successful composition trace: `3229948164925f847dde39e57d34a3d2`.

Local scratch evidence is retained in `.superpowers/sdd/2026-10-14-app-composed-workspace/`: test/build logs, `live-proof.log`, `lsp-final.jsonl`, and `workspace-live.png`. These are developer-local artifacts, not shipped app assets.

## Opt-in and remaining work (historical first-slice status)

The default-shell and named-view migration below is now superseded by [the next slice](2026-10-14-workspace-default-evidence.md).

Install the shipped `os/workspace` app in the selected brain using the existing marketplace install operation. Start the Flutter connector with `--dart-define=DIGITALBRAIN_ROOT=apps/workspace/root` (default root kind is `layout`) and its usual authenticated OS base URL. The running web proof used a temporary loopback same-origin proxy; production CORS/authentication was not changed.

This is a functional architecture slice, not the finished visual redesign or production cutover:

- The old shell remains the default. Workspace is not automatically installed into existing brains.
- State is currently per brain, not per device/session. Foreign grants and external person/document contexts are not enabled.
- Numeric program-revision checking is preserved; assignment-generation binding is not newly solved here.
- Full capability negotiation/registry parity and shared descendant authorization remain T01/T02 work. Viewport is not yet advertised through that future capability system.
- Named roots are preferred; the temporary legacy adapter exposes only `Main` for `full`. Legacy Side/Main apps need app-owned full-view migrations before claiming complete app parity.
- Mounting/recomposition uses the existing polling fallback. Live subscription reconciliation, large-feed virtualization, assets/voice parity and motion remain later tasks.
- Usage is unavailable until the authorized usage facade exists. No account/billing authority was moved into scripts.
- Profile, Discover, fork, app-authoring, final dock styling/accessibility, recovery and old-shell removal remain pending. No full M0/M1 completion is claimed.
