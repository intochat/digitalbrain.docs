# Named views and default Workspace

Implemented on `codex/app-workspace` after `c73ec40ae`, 2026-10-14.

## Changes

All 19 existing shipped app presentations now declare a named `full` view; Workspace is the twentieth app. Files and Friends compose their formerly separate content into app-owned full roots. Legacy presentation fields remain for other consumers, but viewport resolution no longer falls back to Main.

The OS installs Workspace by default. On connector connection it installs missing Workspace and uses the existing versioned updater for shipped OS/IntoChat apps, preserving settings, connections and edited programs. The generic connect response selects the root and activation receiver. Flutter contains no Workspace name or tab/pin/composition policy. Existing non-OS distributions can still use the old shell when they supply no root.

Workspace 0.2.3 owns the bottom panel: Apps and pins precede the open-app strip; Ino, More and usage remain fixed at narrow widths. Pin/unpin and Settings are in More. Startup preserves typed open views and focus without opening Discover or Ino. Usage remains honestly unavailable.

Activation buttons forward through the server-selected app. Workspace opens the destination and dispatches only an explicitly requested operation. Brain switching retains the existing membership check. Rejected actions report an app-owned error without poisoning the durable request subscription.

## Verification

- Flutter shell: 148 tests passed, including regression tests observed failing before the activation fix, for same-brain and cross-brain forwarding.
- Flutter module C#: 145 tests passed. Updated the route inventory and repaired a pre-existing scene-observation race by awaiting the matching running scene.
- OS boot/default/catalog: 7 tests passed. Includes fresh default installation and preservation of edited apps. The targeted rerun used the already-built test assembly after a redundant build encountered running Windows executable locks.
- Flutter analysis: no issues. Live hot reload succeeded in 479 ms.
- AppHost build passed (one transient copy-lock retry warning during shutdown).
- Independent review caught the root activation regression; fix and error recovery re-reviewed with no remaining blocking findings.
- Changed Flutter-module C# files have no LSP errors. OS host/test projects retain design-time missing-reference errors in the LSP session; CLI compilation and targeted tests pass. Package-audit NU1902/NU1903 warnings in inherited test dependencies required a command-local WarningsNotAsErrors override for their earlier build; repository dependency/audit policy was not changed.

## Live evidence

Used the isolated worktree journal `.digitalbrain/workspace-proof`, retaining its keys and state. OS, sandbox and MCP host reported Healthy. The web connector ran without DIGITALBRAIN_ROOT, through the existing temporary loopback same-origin proxy on port 5191.

MCP verified all 19 personal-brain apps (including Workspace) Live with named full views. CircleRoom was verified separately in an actual circle brain. All 20 shipped apps therefore have a checked named root in their intended brain type.

Visible controls and MCP state confirmed:

1. Reconnect mounts the server-selected Workspace and restores its open apps/focus.
2. My profile / Circles activations update Circle inside the center workspace.
3. Opening the test circle switches to its brain, installs its C# Workspace, and focuses its named CircleRoom full view in the bottom panel. Circle-scoped MCP confirmed membership, `focusedViewId=circleroom`, and its published full root.
4. Invalid activation reports an error; a subsequent valid activation succeeds and clears the error.
5. At 360 pixels, the app strip scrolls while Ino, More and usage stay reachable. The viewport override was reset afterward.

Successful Workspace request reaction trace: `eaaff6bef9a5fb8dc4865b8979ae4d72`. Detailed local logs, migration inventory and screenshots remain under `.superpowers/sdd/2026-10-14-app-composed-workspace/`.

## Remaining scope

This completes the named-root/default-Workspace migration, not the entire social-product redesign. The existing domain UIs are retained; richer profile identity tabs, feed design, app-specific editing/composer parity, icon-based dock polish, accessible close labels, live subscription reconciliation, usage/billing facade and full connector-owned settings removal remain future work. External person/document contexts and foreign embedded grants are still unsupported; cross-brain activation switches the whole connected brain. Locally edited apps without a named full view are preserved and show an unavailable view rather than being overwritten. The old spatial workspace is not imported into the new typed workspace state.


The icon dock, real brain-usage facade, profile routing fix, and embedded PhotoCraft follow-up are recorded in [Workspace polish evidence](2026-10-14-workspace-polish-evidence.md).
