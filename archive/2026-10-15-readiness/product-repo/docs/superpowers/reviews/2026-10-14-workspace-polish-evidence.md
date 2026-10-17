# Workspace UI polish — verified 2026-10-14

This extends the default Workspace/named-view migration. Product composition remains in C# apps. Flutter renders generic visual contracts and shared theme tokens.

## Delivered

- Workspace 0.3.2 composes a compact dock with app-manifest SVG artwork, separate selected/open indicators, nonduplicated pins, Ino, usage, profile, and overflow actions. The app strip scrolls independently at narrow widths.
- Generic button/select visuals support SVG icons, avatar image URLs with monogram fallback, semantic labels, tooltips, selected states and interruptible press springs. Generic layout surfaces use existing colors and corner tokens; viewport transitions use the existing motion component. Reduced-motion preferences disable animated transitions.
- Usage 0.1.2 is installed with Workspace and renders actual last-30-day brain spending and per-app activity, with a working refresh action. The facade returns no private account ledger balance, including for shared personal brains.
- Profile opens Circle's full view with the current principal resolved. Successful navigation clears stale error status. The local account has no saved avatar URL; its monogram is intentional.
- PhotoCraft 1.0.13 connects on startup and renders the Docker-served editor through the generic web browser renderer. Its surrounding chrome uses shared theme tokens. The embedded editor retains its own internal controls/theme; this is not a rewrite of PhotoCraft's UI.
- Workspace refresh/error recovery no longer records a no-op navigation update. This fixes a durable event replay loop caused by reusing operation receipts against newer workspace snapshots.

## Verification

- AppHost build: 0 warnings, 0 errors.
- Flutter neuron tests: 148 passed.
- OS tests: 43 passed.
- UI widget tests: 184 passed; UI analysis clean. Shell tests: 148 passed; shell analysis clean.
- Shared-brain usage regression: passed with two members and differing seeded account balances. Compute contract tests: 2 passed.
- Final Flutter hot reload completed in 407 ms, followed by visible inspection.
- Aspire: OS, MCP, C# sandbox, PhotoCraft web (18110) and PhotoCraft MCP (18100) healthy. PhotoCraft editor visibly embedded in the running Workspace.
- Live dock Usage click opened its named full view. Refresh updated the timestamp from 15:24:24 to 15:25:39 UTC and activity counts from the real usage store. The local proof brain has zero recorded spend; no demonstration charges were fabricated.
- Profile click opened @owner. At 360px, usage/profile/options stayed reachable; viewport override was reset afterward.
- The previously poisoned Workspace subscription recovered; sandbox logs contained no Workspace exceptions after restart and live navigation/refresh checks. Independent re-review found no remaining Important/Critical findings in the corrected paths.

Scratch logs and screenshots are in `.superpowers/sdd/2026-10-14-app-composed-workspace/`, including `workspace-polished-live.png` and `workspace-usage-live.png`. The browser-only Chrome test runner did not complete; the real in-app-browser editor provides the web embedding verification. LSP still reports missing design-time dependencies in OS/test projects; actual builds/tests above pass. Production module diagnostics contain no errors.

## Limits

This does not complete the entire social OS plan. Device-local workspace sessions, the broader capability/authorization work, real-time subscription reconciliation, feed virtualization, and a full redesign of every app's interior remain separate work. Browser automation attachment is supported in the desktop renderer; the web renderer displays/interacts with the embedded page without claiming desktop automation attachment. Usage shows brain spending, not account billing controls.
