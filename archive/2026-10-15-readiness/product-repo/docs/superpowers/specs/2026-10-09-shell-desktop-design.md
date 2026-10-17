# Shell as a desktop

**Status:** approved in chat 2026-10-09. Sub-project 1 of 3 (desktop, System One in front, self-improving loop).

## Intent

The shell should feel like an operating system with many apps alive at once, not a chat with a
grid of launch cards. One focused app owns the working area; the bottom of the screen is the
app's own controls; Home shows everything running; the infrastructure the brain stands on is
visible as live icons. Nothing here is a fifth concept: a toolbar button is an edge neuron, a
running app is an app neuron with a surface, an infrastructure icon is a registry entry with a
health signal.

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    working area: the focused app's                   │
│                    {brain}/apps/{name}/surface                       │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ [Home]      ┌──── dock: focused app's toolbar ────┐   [user] [compute]│
└──────────────────────────────────────────────────────────────────────┘
```

- **Left island, Home.** One button. Opens the overview (below). Pressing it while the overview
  is open returns to the focused app.
- **Center island, the dock.** Renders the focused app's `toolbar`. When no app is focused, or the
  focused app declares no toolbar, the dock is the **assistant island**: the cat in the middle, a
  text field, a voice button. The assistant island is the existing assistant app docked (`open`
  with input `docked`), so it is not a special case in the shell: it is the toolbar of the
  `assistant` app, and the assistant is the default focused app.
- **Right island, user and compute.** Unchanged from today (`compute_usage_panel.dart`, user menu).

The existing "move controls to bottom" toggle in `workspace_islands.dart` goes away: the bar is
always at the bottom. Side panels (docked assistant beside a window) go away too: a docked assistant
is the dock.

## Toolbar in the manifest

`app.json` gains an optional `toolbar` array. Each entry names an operation the app already
declares, with how to show it:

```json
"toolbar": [
  { "operation": "play",  "icon": "play",  "label": "Play" },
  { "operation": "stop",  "icon": "stop" },
  { "operation": "volume", "icon": "volume", "kind": "slider", "min": 0, "max": 100 }
]
```

- `operation` must match an entry in `operations`; the manifest fails validation otherwise
  (`AppManifest` gains the array and the check, in `DigitalBrain.Modules.Apps.Contracts`).
- `kind` is `button` (default), `toggle`, `slider` or `text`. A button posts
  `AppRequested(operation, "")`. A toggle posts the operation with `"on"`/`"off"`. A slider posts
  the operation with the value as text on release. A text field posts the operation with the typed
  text on submit. Nothing waits for a result: the app's answer is neuron state its surface shows.
- `icon` is a name from the shell's icon set (the same set `app_icon.dart` resolves) or a path in
  the bundle.
- The assistant's manifest declares
  `toolbar: [{operation:"send", kind:"text"}, {operation:"voice", icon:"mic"}]`.
  That is the whole assistant island: a toolbar, rendered by the dock like any other.

The shell reads the manifest through `IApp.Read()` as it does now. No new neuron contract.

## Home overview

Home shows two things, read from existing neurons:

1. **Running apps.** Every app neuron in the brain whose runtime is running (`IAppRuntime` state),
   as a tile: icon, title, and a small live render of `{app}/surface` (the same surface widget,
   scaled, non-interactive). Tap focuses the app in the working area and closes the overview.
   A close affordance on the tile stops the app's runtime.
2. **Infrastructure strip.** One icon per module that owns an infrastructure resource, read from
   the registry inventory (`ModuleInventory`) joined with Aspire resource state
   (`IAspire.ListResources`, `ResourceStateChanged`): Postgres, ClickHouse, Qdrant, Aspire itself,
   the local System One adapter, each user connection. Green, amber or red by health. Tap opens
   that module's settings or connection window (the existing `connect_window.dart`).

The Marketplace grid moves inside Home under the running apps, unchanged.

## Focus and windows

Today's multi-window workspace (`IWorkspace`, `EnsureOpenAsync`) stays as the model: a window is
still a neuron. The shell changes which one it shows: exactly one window fills the working area;
the others are "running" and visible from Home. `WorkspaceStore` gains `focusedWindow`; the
desktop renders only that one. Window chrome (title bar, close) stays on the window.

## Dart shape

- `workspace/dock/dock.dart`: reads the focused app's manifest, renders toolbar entries, posts
  requests through `apps_request.dart`.
- `workspace/dock/assistant_island.dart`: the `text` kind renderer plus the cat; replaces the
  assistant island code in `workspace_islands.dart`.
- `workspace/home/home_screen.dart`: becomes the overview (running tiles, infrastructure strip,
  marketplace).
- `workspace/home/infrastructure_strip.dart`: new.
- `workspace_islands.dart`: shrinks to the three-island frame.
- `workspace_desktop.dart`: single focused window.

The C# change is `AppManifest.Toolbar` with validation, and the assistant's `app.json`.

## Verification

- Unit: manifest validation facts (toolbar operation must exist; kinds are the four named).
- `flutter analyze`, `flutter test` for dock rendering from a manifest fixture and Home tiles from a
  fake store.
- Running: open Calculator, the dock shows its toolbar; press a toolbar button, `AppRequested` is
  seen in traces; Home shows Calculator and Assistant tiles with live surfaces; stopping Postgres
  through Aspire turns its strip icon red.

## Out of scope

Window tiling, drag-and-drop, per-app notifications, keyboard shortcuts.
