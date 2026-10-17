# Workspace hosting and shared design system

Approved in chat on 2026-10-12; implementation explicitly requested. This supersedes the app-readiness coordinator in the earlier presentation-hosting proposal.

The workspace neuron owns visibility, focused entry, Home and Companion. Entries reference typed neurons, allowing multiple documents from one app. App manifests declare an optional installation-relative default entry. Discovery does not certify which execution produced the contents. Kernel-stamped provenance is unchanged; execution-bound assignment security remains a separate runtime concern.

Behaviors maintain complete derived UI in neurons, using stable identities and cheap idempotent startup composition. Rendering never implicitly runs domain operations. Completion does not focus or reopen work. Mounting and reconnecting read current state. Initialization and unavailable states must be observable; no preparation coordinator or script-supplied execution authority is introduced.

Extend the existing connector theme with shared spacing, shape and motion defaults. Semantic components inherit colors and typography. C# supplies composition, locations, selection and actions; Flutter implements native components, animation and accessibility. Whole-state rebuilds preserve child identity. Reduced motion disables nonessential transitions; reconnect does not replay historical transitions.

Home retains apps, running work, brain inspection and infrastructure with clearer hierarchy. Files presents available supported storages, location breadcrumbs, folder contents and contextual actions. Assistant stays reachable beside focused work and uses the same theme. Unsupported storage capabilities remain explicit, never fabricated. Contextual controls do not replace stable workspace controls.

Persist concrete arrays, keep state in neurons, preserve compile-as-publish-gate and whole derived-state rebuilds. No non-reentrant grain self-calls. Preserve existing multi-view DataVisualizer entry points. No broad runtime identity redesign, new service coordinator, or production deployment is included.

Verification: LSP mapping and diagnostics; focused red/green contract and widget tests; per-project builds and module unit/E2E suites; Flutter analyze/tests; Aspire health, real neuron calls and matching telemetry; connected Flutter reload/restart. Missing runtime evidence is reported as incomplete, never as success.

## Reference flow for every app

Home, Files and Assistant are the reference composition, not separate design systems:

1. The catalog opens the manifest's typed Entry; operation names are domain actions and never imply a UI capability. An app without Entry opens its details instead. Multiple documents remain independently addressable workspace entries.
2. Workspace owns the selected entry and open membership. App behaviors own content, location, selection and contextual actions. Completion updates content without changing focus. Reconnect renders the current snapshot.
3. Navigation stays in the content: Files uses Storages, allowed root and folders, with breadcrumbs describing the current location. Filtering retains visible selection and clears hidden selection. Bottom workspace controls stay stable; an app's actions occupy its contextual toolbar.
4. Use ThemeData.colorScheme and textTheme plus UiTokens rather than copying colors, fonts, spacing or duration values into individual renderers. Shared chrome uses the same shape and spacing tokens as content. Chat preserves the selected font and gives copy controls their own space.
5. UiSurface, UiBreadcrumbs and UiMotion are Flutter connector components, not extra kernel concepts. C# behaviors continue to compose existing neurons and consume their signals. No visual readiness service, presentation registry or app-specific navigation authority is needed.
6. Animate intentional identity changes; do not replay arrival animations for an initial snapshot, identical rebuild or reconnect. Honor reduced motion. Preserve explicitly authored scene animation.

Apply the reference by improving shared components first. New app features should supply semantic neuron state and declared actions, not another palette, navigation stack or animation implementation.
