# Module audit

Date: 2026-10-07. Status: Phase 1 survey, read-only. No code was changed.

Scope: every module under `src/DigitalBrain.Modules` except AI (already specified in
`2026-10-07-ai-module-restructure-design.md`), plus the first-party app bundles under
`src/DigitalBrain.OS/Apps` and `src/IntoChat/Apps` as the consumers' view. Yardstick: CLAUDE.md's
four words, the module shape, and the Time and Gmail modules as the target layout.

Method: codegraph for orientation, csharp-ls `findReferences`/`goToImplementation` for every
"who depends on X" claim, `wc -l` for sizes, text search only for scripts, Dart, docs and csproj
lines. Each module was diagnosed by one worker against a shared rubric; the load-bearing claims in
the ranked table (dead Assistant transcript, fire-and-forget Apps queue, in-process GitHub bindings,
delete-on-read CSharp drain) were re-read by hand.

Not verified anywhere in this survey: runtime behaviour. `digitalbrain-mcp` refused the connection
and Aspire was not running, so every finding is static. Negative claims about `DigitalBrain.Mcp`
and `DigitalBrain.Client` using a module's contracts rest on text search, not LSP.

## Two notes on the yardstick itself

- **The reference modules have the same blemishes in miniature.** Gmail keeps the OAuth `state`
  table in an in-process dictionary (`Gmail/GmailCallbackRequests.cs`, lost on restart) and its
  Module class carries three endpoint bodies (`GmailModule.cs`, 79 lines). Time's
  `TimeInventoryWriter` is a service, but a stateless one. The target shape is the *layout* of
  these modules (folder per neuron, `Signals/` beneath, namespace equals folder, state in grains,
  Contracts referencing only `DigitalBrain`), not every line in them.
- **CLAUDE.md and the code disagree on one word.** CLAUDE.md says a bundle holds `behaviors/*.cs`;
  every bundle on disk, `AppFiles.SynapsesPrefix` and the Builder prompts say `synapses/`, while
  the `IApp` API, state fields and tests say `Behavior`. The synapse-vocabulary spec's rename
  landed half-way. Which word wins is yours to decide; the survey uses "behavior" as CLAUDE.md does.

---

## Assistant (`src/DigitalBrain.Modules/DigitalBrain/Assistant`)

Contracts 75 lines, module 1,146 lines in 22 flat files, tests 1,692 lines. No Hosting or Deployment.

**Four words.** `AssistantNeuron` (79 lines) is a shell: `Run` and `Models` immediately `new` an
`AssistantTurnExecution` (344 lines) that owns the whole turn: validation, replay, the
`Begin/Complete/InterruptConversation` ledger calls, SSE event shaping, metering, receipts, the
compute-history write. That is the `AgentTurnRunner` the AI spec deletes, surviving one ring up.
`CapabilityDiscoveryNeuron` (28) exists only to carry an access check in front of
`RegistryDiscoveryService` (70). `AssistantState.Threads: AssistantThread[]` with
`ChatEntry[] Messages` is a full per-thread transcript that nothing writes or reads (LSP: two
references, both in the declaring file); it is the only reason Contracts references
Flutter.Contracts.

**Duplicate designs.** One user chat has two drivers over the AI conversation grain: HTTP
`POST /agent` → `IAssistant.Run` → `IAgentExecution.Run` with manual ledger calls, and the shipped
Assistant app (`OS/Apps/Assistant/synapses/chat.cs:43`) → `IAgentExecution.Start` plus
`AgentTurnProgressed/Completed/Failed` signals, against a *different* conversation key (sha256 of
workspace+thread vs `{app}/conversations/{id}`). Two event vocabularies (AG-UI strings
`RUN_STARTED…RECEIPT` vs `AgentTurnProgressed.Kind` strings), two receipt pipelines (only the HTTP
path prices and writes `IComputeUsage`), two replay rules, two model-default resolutions, two
definition sources (`instructions.md` vs `prompts/system.md`), the tool list copied verbatim
(`AssistantDefinition.cs:16` vs `chat.cs:25`). The Dart `runAgent` SSE client has no caller.

**State in process.** `Channel<string>` + producer task + linked CTS per turn
(`AssistantTurnExecution.cs:39-57`): the same handshake the AI spec condemns. The receipt and
compute-history write happen after the stream ends and are lost on restart. `IntentContext` is
opened twice per turn (here and in `AgentExecutionNeuron.Run`) and must agree on the id.

**Vocabulary.** Thread id has four spellings; id validation is written twice. Six table-tool names
are hard-coded in a generic turn loop (`:301`, `:275-276`); a refusal is detected by comparing the
exception *message* (`:125`). Receipt JSON is parsed in three places. Options bind to a top-level
`"Assistant"` section, not `DigitalBrain:Modules:assistant:Options`.

**Structure.** Flat `DigitalBrain.Assistant`, no per-neuron folders, no `Signals/` (one signal
inline). Contracts references AI.Contracts (genuine) and Flutter.Contracts (dead). Module
references Apps, CSharp and Compute contracts. `ICapabilityDiscovery` is in the module project.

**Blast radius.** OS: `OsCatalog`, `BrandingFacts` (`AssistantOptions`). E2E: `AgentWorkflowFacts`,
`GoldenJourneyFacts`, `ReceiptJourneyFacts`, `AgentTableJourneyFacts` (SSE strings, conversation
key). Dart: `ChatModelCatalog` mirror (live), `runAgent`/`AgentEvent` (dead), `/compute/usage`
page. Scripts: none use `DigitalBrain.Assistant`; the Assistant app uses AI contracts the AI spec
renames or deletes.

**Tests.** Harness-based (`AgentModelsFacts.cs:118`), but `InjectedModelTurnRunner` replaces AI's
`IAgentTurnRunner`, which the AI plan deletes; six facts test the static `RunModel` delegate, not a
neuron. Not covered: `WorkspaceFormTools`, `Threads` (dead), the `"catalog"` fake-workspace route.

**Main source of complexity.** The Assistant is a second agent driver: it re-implements turn
execution, replay, receipts and a transcript around the AI conversation ledger while the shipped
Assistant app drives the same agent a third way, so one chat has two drivers, two transcripts, two
event vocabularies and one dead state shape.

**Verdict.** (a) Redesign brainstorm, strictly downstream of the AI spec: once `IAgent.Run/Start`
and the context neuron exist, `AssistantTurnExecution`, `PrepareTurn`, `RunModel` and the ledger
calls have no target. The open question is whether the HTTP SSE path survives or the Assistant
becomes the app plus a thin `IAssistant` (definition, voice, model listing, receipts as a
behavior over `TurnCompleted`). **Severity: high.**

---

## CSharp (`src/DigitalBrain.Modules/Microsoft/CSharp`)

Contracts 91, module 1,756 (38 files), Sandbox 258, Aspire.Hosting 63, Deployment 112, tests 2,192.

**Four words.** `CSharpFileNeuron` (399 lines, six interfaces) and `CSharpCatalogNeuron` (42).
Signals: `CSharpFileChanged` under `Signals/`, `CSharpPendingArrived` internal at the bottom of
`Files/ScriptSubscription.cs`. The script edge (`Edge/`, 300 lines) is the connector for the
human-written program but declares no `ConnectorDefinition`. Fifth concepts: `ICSharpRunner` with
two implementations chosen by a config key; an authoring layer that is a second module in the same
project (`CSharpAuthoringModule` + `CSharpToolService` + `ScopedCSharpTools` + `CSharpCatalogStore`
+ `CSharpAgentTools` + `CSharpScriptSandbox`); four views over one `ContractCatalog`.

**Duplicate designs.** `CSharpModule.Configure` and `CSharpAuthoringHosting.AddCSharpAuthoring`
each `TryAddSingleton` the same four services. `CSharpFileState` encodes three run modes
(always-on, armed, subscribed-wake) through `Trigger is null` and `Subscriptions.Length > 0`, and
`Describe`, `Authorize`, `ReceiveReminder` (three branches), `WakeAsync` vs `Fire` and
`ResumeWatches` each re-derive the mode: the nullable-alternatives pattern from AI. Four key
schemes for one grain type (`csharp-`+sha256, `AppProgramKey`, `specs/{app}/{guid}`, `e2e/…`).
Two copies of the sandbox DTOs; run status compared as the string `"Running"`. `RepositoryRoot.Find`
duplicated line for line.

**State in process, and the one that matters.** `DrainPending` (`CSharpFileNeuron.cs:223-234`)
persists `Pending = []` and *then* returns the batch; if the SSE drain in `ScriptEdge` dies after
that, the signals are gone. `MaximumPending = 64` drops the oldest silently. CLAUDE.md promises "a
durable subscription inside the grain, with a watermark … delivery is at-least-once"; the code is a
bounded buffer with delete-on-read. `AspireSandboxRunner.EnsureSandboxAsync` polls up to four
minutes inside the grain's `Start` turn comparing Aspire state strings. Dev run-token key is random
per process. `_watched`/`_watchRenewal` are derived and rebuilt; `ObserverManager` lease renewal is
handled.

**Vocabulary.** A file is named five ways, a run four ways, a principal three; "workspace" survives
in `ICSharpCatalog` and the Dart folder while tools say "scope". Three status vocabularies
(`CSharpFileStatus`, sandbox `RunStatuses` strings, Aspire state strings).

**Structure.** All 49 non-sandbox files in `namespace DigitalBrain.Microsoft.CSharp`; folders are
cosmetic. Catalog neuron sits in `Authoring/`. `CSharpModule` is 66 lines: registrations plus a
runner choice, options post-configure and a filesystem walk. Contracts references only
`DigitalBrain` but ships hosting constants (`CSharpSandbox.SourceProject`, port, mount) into the
script-visible assembly. Sandbox project is outside every ring, which is right for an image.

**Blast radius.** Apps (`CSharpAppRuntime`, `TestScriptRunner`, `RecordingCSharpFile`): every
`ICSharpFile` operation. CSharp → Apps.Contracts (`IScriptSandbox`): a mutual contract-level
dependency. OS E2E `CSharpFileContainerFacts` (142 lines). Dart `csharp_manager.dart` (432 lines)
reads `/brains/{id}/csharp` JSON. Assistant references the Contracts csproj with no type use found.
Scripts and Mcp: none.

**Tests.** Harness plus `FakeSandbox` (an `HttpMessageHandler`, test-project only) and `FakeAspire`
(a real grain). Not covered: the drain-then-lose window, `DotNetScriptLauncher`, `IdleShutdown`,
`/csharp` endpoint bodies, deployment, hosting.

**Compute boundary.** No project dependency either way. The one coupling: `ScriptEdge.Stamp`
re-stamps every script call as `CallerKind.App`, and Compute meters those, but
`AllowanceCallFilterStage` forwards `IntentId: null`, so every run of every script in an account
collapses into one reservation per (neuron, operation) and per-run limits cannot apply to scripts.

**Main source of complexity.** One grain carries three run modes discriminated by a nullable
`Trigger` and a `Subscriptions` array, so every operation re-derives which program it is running;
on top of that the subscription buffer is delete-on-read, which contradicts the OS's stated
delivery guarantee for every behavior.

**Verdict.** (a) Redesign brainstorm on two fronts: subscription delivery (watermark vs drain; what
at-least-once means for `brain.On<T>`) and the run-mode split; plus whether authoring is a module
or an option. Folder/namespace moves, DTO and registration dedup, and moving `CSharpSandbox`
constants out of Contracts are bounded cleanup after. **Severity: high**, because the delivery
guarantee is the foundation every behavior stands on.

---

## GitHub (`src/DigitalBrain.Modules/Microsoft/GitHub`)

2,954 lines including tests. `.Aspire.Hosting` present, `.Tests.Hosting` present, no Deployment.

**Four words.** `RepositoryNeuron` (281) and `GitHubConnectionsNeuron` (46, key literally
`"connections"`, not brain-scoped). Five signals. Fifth concepts: `GitHubRepositoryBindings`, a DI
singleton `ConcurrentDictionary` that is the real connection registry (`RepositoryNeuron.Binding =>
bindings.GetFor(key)`); `GitHubRepositoryBinding` with a mutable in-process `_revoked`;
`GitHubSetupService` (138) doing the connection lifecycle; `GitHubInstallationTokens` (173) token
cache; `GitHubWebhookIngress` (139) routing over `bindings.All`.

**Duplicate designs.** Two connection stores (the `"connections"` grain and the process
dictionary), written together in `ConnectAsync` and never re-joined after a restart. Three
repo-declaration option records bound to one config section. Two Aspire projections seeding the
same integration keys. Two URL parsers. Two revocation truths reconciled by revision/epoch checks.
Two id schemes (`binding id` vs `r-{RepositoryId}`). Dead `McpEndpoint` and an unused
`ModelContextProtocol.Core` package.

**State in process.** User-connected `r-*` bindings die with the silo; afterwards
`AcceptRepositoryEvent`/`Refresh` throw from `bindings.GetFor` and webhooks route only to
`bindings.All`, so webhooks for user-connected repos stop. Token cache and OAuth state likewise.

**Structure.** Everything in `DigitalBrain.Microsoft.GitHub`, both neurons at the module root,
`Signals/` at Contracts root. `GitHubModule` 40 lines, registrations only. Contracts references only
`DigitalBrain`.

**Blast radius.** `OsCatalog`, `AppHost` (hosting), `ReferenceBrain` (options). E2E imports the
namespace only. No scripts, Dart, Mcp, Client.

**Tests.** 355 lines on the harness; hosting 36. Not covered: `GitHubSetupService`, every
`IRepository` read operation, `GitHubUserAccess`, OAuth callbacks, the webhook surface, restart of
a user-connected repo.

**Main source of complexity.** The repository connection lives in a process singleton that the
grain depends on while a second copy lives in a grain, so every operation reconciles two truths.

**Verdict.** (a) Redesign brainstorm, best taken together with Salesforce and Gmail as one
"connector seam" decision (see cross-cutting). **Severity: high** (restart loses user-connected
repos and their webhooks).

---

## Supabase (`src/DigitalBrain.Modules/Supabase`) and Postgres.Windows

Supabase: Contracts 290, runtime 1,426 (`Query/` 540, `Table/` 495, `Windows/` 343), hosting 106,
tests 944. Postgres.Windows: 309 lines, 313 test lines.

**Four words.** Supabase neurons: `SupabaseNeuron` (stateless door), `SupabaseTableNeuron` (state
in grain). One signal. Connector declared. Fifth concepts: `LiveTableWindows` (133, DI service that
opens a table grain plus a workspace window, refines with an 8-attempt retry loop, reads with a
redaction policy), `TableViewTools`/`LiveTableTools`, `TableEndpoints`, `SupabaseTableReadPolicy`
(sensitivity by column-name markers), `SupabaseBackingStore` (`ConcurrentDictionary` of data sources
never evicted), `QueryPlanCompiler`. `Windows/` is a UI layer inside a vendor module, and
`QueryWindowResult` carries the alias `intochat.query-window-result`. Postgres.Windows is entirely
that layer for Postgres: tool factory, `PostgresAppResources` (DI service walking `IAppIndex`,
`IApp`, `ITableIndex` grains), two `ILiveTableSource` adapters that throw
`SupabaseTableSourceException` and call `SupabaseQueryGuard`. Not a neuron, signal, behavior or
connector: it is "windows", and Supabase-shaped.

**Duplicate designs.** Two providers for one neuron (`ISupabaseProvider` per-brain vs
`ISupabaseBackingStore` deployment; health check uses one, the neuron the other). Two live-table id
schemes (`sbtable-` with zero references vs the real `table-`+hash). Two type names
(`supabase-table` vs alias `supabase.table`). Source resolved by string in three places with
`postgres-app:` hard-coded. `SupabaseQueryGuard` and Postgres's guard are identical modulo
visibility; connection-settings parsers byte-identical. `AgentToolContext.DatabaseSource` in
AI.Contracts is read only by `TableViewTools` and set nowhere.

**State in process.** `SupabaseTableNeuron` is addressed by name with `PublicOperation` access; any
trusted caller in any brain can read any table id, and isolation rests on the HTTP route and tools
checking the workspace first: grain correctness via a service handshake. Backing store never evicts
rotated revisions.

**Vocabulary.** "Table" means five things across Supabase (`ISupabaseTable`,
`SupabaseTableInfo`), workspace (`WindowReference.Table`), Flutter UiKit (`ITable`) and Postgres
(`ITable`). `windowId == tableId` by construction.

**Structure.** `Query/` and `Table/` share the root namespace (28 files); `Windows/` has its own.
Contracts `Query/` is root namespace while ClickHouse's is `.Query`. `SupabaseModule` 48 lines
with endpoint mapping; `LiveTableHosting.AddLiveTables` is a second registration site shared with
Postgres.Windows. A dead `tests/Table/LegacyState/*.orleans` fixture for a `LegacySupabaseStateFacts`
that does not exist: a state-compatibility artifact the rules forbid.

**Blast radius.** Postgres.Windows (`ILiveTableSource`, `QueryPlan`, `LiveTableWindows`, guard,
exceptions). E2E: `GoldenJourneyFacts`, `SupabaseTableDisplayFacts`, `WorkspaceRestoreFacts`,
`AgentWorkflowFacts`, `AgentTableJourneyFacts` (`ISupabaseTable`, `SupabaseTableSnapshot`, tool
name). Assistant.Tests `CustomersDatabase`. Dart `table_models.dart` (`TableSnapshot`,
`TableViewUpdate`) and `ui_client.dart` `/brains/{id}/tables/{id}`. `ISupabase` itself has no
consumer outside the module.

**Tests.** Harness-based, `.Tests.Hosting` exists. Not covered: `LiveTableTools` directly,
`QueryPlanCompiler` rules, `SupabaseProvider` against a server, registry resources.

**Main source of complexity.** A generic live-table window engine (source-agnostic
`ILiveTableSource`, `LiveTableWindows`, tools, HTTP, Dart mirror) is hosted inside the Supabase
vendor module, so every other SQL source must adapt to Supabase types and strings, and ClickHouse
cannot have windows at all.

**Verdict.** (a) Redesign brainstorm on where the window engine and the "table window" concept
live; the Postgres plan already named this as its deferred front. **Severity: high** for the
pair (it shapes Postgres.Windows, the E2E golden path and the Dart mirror).

---

## Apps (`src/DigitalBrain.Modules/DigitalBrain/Apps`)

Contracts ~380 (24 files), module ~2,350 (34 files), tests ~2,800 (24 files). No Hosting,
Deployment or Tests.Hosting.

**Four words.** Neurons: `AppNeuron` (572 lines, `IApp`), `AppIndexNeuron` (46),
`MarketplaceNeuron` (52); state in grains. Five signals under a flat `Signals/`. No connector
(correct). Fifth concepts, all DI singletons: `Creator` (199, holds the 12-round Builder
conversation in a local list; ratified as a service by the creator-live-apps spec),
`CreatorModelWorker` (a `[StatelessWorker]` grain whose only job is to launder an unstamped
service call into a stamped one), `AppWorkQueue` (21 lines, `_ = Run(...)`, no queue),
`AppVerifyJob` (74, owns spec parsing the grain calls back into), `AppInstaller` (58, cross-brain
saga with no state), `CSharpFileTestRunner` (polls an `ICSharpFile` every second for up to 50
minutes), the `Shipping/` set (390 lines of startup file↔brain sync registered outside the Module
lifecycle), `MarketplaceWriteGuard` (authorisation by `SourceId.Type == "apps.app2"`). Contracts
carries DI seams (`IScriptSandbox`, `IDeployableRuntime`, `IAppStorageHook`) and client helpers
beside neuron contracts.

**Duplicate designs.** Three Invoke→await pollers with different timeouts (`AppCalls.cs` 5 min,
`AppsEndpoints.cs` 30 s, `AppAgentTools.cs` 30 s); none watches the `AppInvocationCompleted`
signal that exists. Two "is this version green" ledgers (`Verified` dictionary, `Verdicts` array)
plus `Green` recomputed in `Describe`. Three fields for "what is published". Two file write paths
(`WriteBehavior` vs `WriteFile`) plus `CompleteBuild` re-implementing the deploy loop. Two verdict
line protocols (`dbtest:json` with a `ScenarioId` nothing uses, and `dbtest:pass/fail`). Two spec
parsers. Idempotency three ways (`OperationReceipt` with always-empty hash, `InvocationId`,
`BuildAttempt`).

**State in process.** A silo restart mid-build strands the app `Building` for 900 s with nothing
re-triggering; mid-verify leaves "verification started" forever. Scratch `--verify-` apps and
`specs/*` files leak on crash. Install/ship sagas have no state between `Import` and
`RecordOrigin`/`Publish`. `ShippedAppWriteBack` and `OsBootService` subscribe through the
process-local `LocalSignalHub`.

**Vocabulary.** behavior/synapse split (35 vs 15 lines in module source). The `{brain}/apps/{name}`
key grammar is parsed by `LastIndexOf("/apps/")` at ten sites across four modules and scripts.
Nine string grammars (`IsSynapse`, `--verify-`, `apps:`, `app_`, `Account__`, `(live)`,
`## Scenario:`, `dbtest:*`, `scripted/`). Deployed scripts get setting `Brain`, tests get
`BrainScope`. The Builder prompt instructs a `ConfigureApp` type that does not exist.

**Structure.** 53 files in `DigitalBrain.Apps`, folders cosmetic. `AppsModule` 42 lines with one
inline endpoint. Contracts references only `DigitalBrain`. Module references Postgres.Contracts
and `CodeAnalysis.Workspaces` with no usage found.

**Blast radius.** OS `OsApps.cs` (`AppInstaller` concrete, `IMarketplace`, `IAppIndex`, shipping).
OS unit and E2E tests (`InternalsVisibleTo`). Assistant (`IApp.Read`, key grammar). CSharp
(`IScriptSandbox`, authoring text hard-codes the Contracts csproj path). Postgres
(`IAppStorageHook`, `PostgresAppResources`). Seven synapses and four `tests.cs` (`IApp`,
`AppInvocations`, key slicing). Dart `installed_app.dart`, `marketplace.dart`, three screens. Mcp
and Flutter reference the csproj with no use found.

**Tests.** Harness-based throughout. Not covered: `Invoke/Respond/ReadInvocation/Pending`
recovery, five endpoints, `CSharpFileTestRunner`'s real path and `dbtest:json`, `CreatorModelWorker`,
job loss on restart.

**Main source of complexity.** The app's lifecycle (build, verify, install, ship, invoke-await) is
driven by five stateless process-side orchestrators that each re-implement a slice of the grain's
state machine and poll it for completion, so one neuron ends up with 24 state fields and three
overlapping ledgers to let processes that forget everything resynchronise with it.

**Verdict.** (a) Redesign brainstorm. The contracts are sound and in Time/Gmail spirit; the
orchestrator-polls-grain pattern, the fire-and-forget queue and three half-applied specs are the
problem. A bounded cleanup (folders, behavior/synapse decision, dead refs) is worth doing but does
not remove it. **Severity: medium.**

---

## Flutter (`src/DigitalBrain.Modules/Google/Flutter`)

C# 7,633 (33 neuron folders + `UiKit/`, `Shared/`, `Workspace/`; Aspire.Hosting 1,170 of dev
tooling; tests 2,327, 101 facts). Dart 26,453 across `core` (no tests), `ui`, `shell`.
`design-prototype/` is 197 lines of throwaway HTML referenced by nothing: dead.

**Four words.** Holds for widgets: 33 kinds are grains with state and `Signals/`, and scripts use
them as edge neurons. Fifth concepts: `IUiBinding`/`IUiEventHandler`, a second event path six input
neurons dispatch to after already publishing the signal, bound by nothing in production (LSP: only
tests). The shell snapshot store (`ShellStateNeuron`, `ShellPartNeuron` deriving from `Grain`,
`ShellSnapshotParts` 230 lines of Merkle chunking) persists an opaque
`{projects:[{conversations:[{messages}], artifacts, windowModes}]}` blob per *person*, mounted
outside `BrainRoutes.Group`: a second transcript and a second window model. Dart `UiPart`
(`ui_part.dart`) is a client-side renderable vocabulary parsed from chat-message metadata, with
kinds (`timer`, `spreadsheet`) that have no neuron: the open "renderable palette / UiPart" front,
flagged not designed. `ButtonState.Activation` is opaque JSON the shell interprets, bypassing
`ButtonClicked`. IntoChat product concerns (`intochat.*` grain ids, `WorkspaceStarterCatalog` with
`AssistantId = "intocaht"`, `ProblemReportsNeuron`, `ChatEntry`) live in a Google/Flutter module's
Contracts.

**Duplicate designs.** Two shell→brain write paths (`/ui/{collection}/{name}` with key
`{scope}:{name}` vs `/apps/node` + `/apps/event` with key `{scope}/apps/{name}` and a kind
`switch`), plus the `/shell/state` blob. Two read paths (SSE on `WorkspaceChanged` vs polling).
Two input delivery paths. Two window-open paths with three idempotency logs in `WorkspaceNeuron`.
Two window models, two transcripts, two click semantics, two host-option records, two first-run
catalogs (C# and Dart).

**State in process.** Clean, apart from `WebBrowserNeuron` pinning itself with live socket fields.

**Vocabulary.** A widget kind is spelled seven ways; kind allow-lists are hand-written in three
places (`CompositionValidation` lists 16, admits `card`/`text` as children but not
`toggle`/`image`). Four grain-key schemes. Dart reads every `*State` as untyped `Map` with 29 raw
key reads in `neuron_view.dart:270-542`.

**Structure.** Folder equals namespace per kind; 36 files in the root namespace. `Signals/` for 26
kinds, inline for six. `FlutterModule` 28 lines, but `AppUiEndpoints` (120), `UiKitEndpoints`
(283, 66 routes) and `WorkspaceEndpoints` (71, SSE loop, owns `GET /brains/{id}`) carry logic.
Contracts references only `DigitalBrain`; module references Apps.Contracts with no use found.

**Blast radius.** Assistant (`ChatEntry`, `IForm`, `ITextField`, `IWorkspace`), Supabase
(`IWorkspace`, `WindowReference.Table`), every app bundle (`ISurface`, `ILayout`, `ICard`, `IText`,
`ITextField`, `IButton`, `ITable`, `IChart`, `IWorkspace`, `IWebBrowser`, signals), eight E2E
files, `BrainRouteIsolationFacts`, `Testing.Reference`. Dart mirrors: `workspace_models.dart`,
`ui_part.dart:542-565`, `neuron_workspace_persistence.dart`, `neuron_view.dart`. CI runs
`flutter analyze`/`test` for ui and shell.

**Tests.** 101 harness facts, `TypeParityFacts` checks kinds ↔ routes. Not covered:
`ProblemReports`, `ISelect`, `IFileInput`, `IImageCanvas`, ~20 kinds' POST routes, `/apps/event`
browser/voice/secret branches, large-document chunk paths.

**Main source of complexity.** The shell is only half a connector: widgets are neurons, but the
shell's own world (projects, conversations, window modes, agent-emitted `UiPart`s, button
`Activation`) is a client-owned JSON document and client-side vocabulary the module persists as an
opaque blob and serves through a second HTTP vocabulary and a dead second event path.

**Verdict.** (a) Narrow redesign brainstorm: shell snapshot store vs neurons, `UiPart`/renderable
palette (open front), `UiBinding` removal, one shell→brain path. Widget neurons need only bounded
cleanup (inline signals to `Signals/`, `UiKit/`+`Shared/` into namespaces, IntoChat concerns out,
delete `UiParts`, `design-prototype`, unused refs). **Severity: medium.**

---

## Compute (`src/DigitalBrain.Modules/DigitalBrain/Compute`)

Contracts 292, module 1,231 (24 files), tests 835. No Hosting or Deployment.

**Plan match.** `2026-10-05-compute-ledger-collapse.md` is fully implemented although every checkbox
is still unticked. Deviations: `ComputeRecordsState.Root` "retired tree root" with a skipped `Id(1)`
is a compatibility shim; eviction is selected by grain-key prefix `usage/`.

**Four words.** `AllowanceLedgerNeuron` (253), `ComputeUsageNeuron` (30, facade),
`ComputeRecordsNeuron` (58). **No signals at all**: hard stops, `LimitAlert` thresholds and
approvals are readable state only, so no behavior can `On<HardStopped>`. Fifth concepts:
`IMeterStore`/`IUsageStore` "stores" that only route to the records grain (three hops per
append); `StorageSampler` with a `Dictionary<DateOnly,long>` and no production probe (dead);
`InMemoryMeterStore` (unregistered); the whole `Billing/` and `Reconciliation/` pipeline
(`StatementBuilder`, `BillingService`, `FakeInvoicingProvider`, `MeterReconciliation`) referenced
only by tests.

**Duplicate designs.** One paid intent is recorded three times (reservation→settlement, meter
log, the Assistant's `ComputeUsageItem` row that `ComputeUsageEndpoints` then overwrites from the
ledger); the meter log is write-only in production. `AllowanceCallerKind`/`AllowanceDenial`/
`AllowanceRequest` mirror the kernel's `CallerKind`/`CallDenial`/`CallRequest` by integer cast.
`chargedCompute = settledCompute` emitted in two modules. HTTP surface split: `/compute/summary`
and `/compute/limits` here, `/brains/{id}/compute/usage` in Assistant.

**State in process.** Grain state clean. `UsagePaging.Key` sorts by `DateTime.UtcNow.Ticks` at
write time and ignores the passed revision.

**Vocabulary.** Nine id formats (reservation, approval, recurring, storage, invoice, meter record,
usage scope, cursor, grain keys) plus price-book meter ids.

**Structure.** Namespaces follow folders but folders are by concern, not neuron. `ComputeModule`
37 lines, registrations only. Contracts references only `DigitalBrain`. `IUsageStore` public in the
module project.

**Blast radius.** Assistant (`IAllowanceLedger`, `IComputeUsage`, `UsagePage`, `IPriceBook`,
`ComputeUnits`). AI uses only the Framework metering seam. Framework E2E `BrainRouteIsolationFacts`.
Dart `compute_usage_*.dart` reads the three JSON routes. No scripts, Mcp, Client.

**Tests.** Harness-based. Not covered: summary/limits behaviour, policy-source short-circuits,
`DurableMeterSink.RecordBatchAsync`, denial path.

**Main source of complexity.** Compute keeps three records of every paid intent through two
non-neuron store layers and a billing pipeline nothing drives, while its enforcement grammar is an
integer-cast mirror of the kernel's call-filter types.

**Verdict.** (b) Bounded cleanup inside the existing design: delete `StorageSampler`,
`IStorageUsageProbe`, `InMemoryMeterStore`, `Reconciliation/`; delete or give an owner to
`Billing/`; drop `Root`; fold the stores into their neurons; put the HTTP surface in one module. One
design question to brainstorm: whether Compute publishes signals (`HardStopped`,
`ApprovalRequested`). **Severity: medium** (dead and duplicated code, not bugs).

---

## Salesforce (`src/DigitalBrain.Modules/Salesforce`)

1,874 lines including tests. `.Aspire.Hosting` present, no Deployment or Tests.Hosting.

**Four words.** One neuron `SalesforceNeuron` (311), eight signals, a `ConnectorDefinition`. Fifth
concepts: `SalesforceExternalConnection : IExternalConnection`, a second connection-row projection
beside the Platform `ConnectionRegistry`; `SalesforceCredentialStore` (73), `SalesforceWriteAccess`
(23), `SalesforceTokenRefresh` (30), singletons that take `SalesforceState` in and hand a new one
back: neuron logic extracted into services.

**Duplicate designs.** Connection keyed two ways (`workspace?.Registry ?? "salesforce"` vs
`BrainScope.CurrentId()`). Secret owner two ways. Two refresh paths (`Refresh` explicit vs
auto-refresh in `WriteAccess`; `Query` does neither and throws). Two MCP option classes. A generic
`/connections/services/{provider}` route owned by Salesforce with `provider == "salesforce"`
hard-coded.

**State in process.** Platform `TokenHandoff` (dictionary, 2-minute TTL) between OAuth callback
and `Connect`: a restart in between loses the grant. Grain state itself is persisted properly.

**Structure.** `Signals/` at Contracts root, not under the neuron folder; `Accounts/` holds
endpoints, not an account neuron. `SalesforceModule` 58 lines with options derivation logic.
Contracts references only `DigitalBrain`.

**Blast radius.** `OsCatalog`, `AppHost`, `ReferenceBrain`. E2E imports the namespace only. Dart
has a template string. No scripts, Mcp, Client.

**Tests.** 401 lines, harness plus one hand-rolled `WebApplication` for route listing. Not
covered: `OnCreatingTicket`, `SalesforceMcpProvider`, `ConfirmWrite` failure branches,
`IExternalConnection`, hosting.

**Main source of complexity.** The neuron's connection logic is split across four singletons that
pass state through, plus a process-held token handoff, so the grain is not the single place where
"connected" is decided.

**Verdict.** (a) Narrow brainstorm as part of the connector-seam decision with Gmail and GitHub;
the rest (fold the three services into the neuron, move `Signals/`, drop one options class) is
bounded cleanup. **Severity: medium.**

---

## Postgres core (`src/DigitalBrain.Modules/Postgres`, excluding `.Windows`)

Contracts 160 (14 files), runtime ~1,230 (23 files), hosting 127, tests 1,159 + hosting 129.

**Plan match.** `2026-10-06-postgres-module-structure.md` is executed: `TableOwner`, `ITable` with
`Tables/Signals/`, `TableNeuron`/`TableIndexNeuron`/`TableLifecycleGuard`, the `.Windows` split,
hosting options deleted. Post-plan: connection-keyed server and `ConnectionPostgresProvider`.

**Four words.** `PostgresServerNeuron` (stateless door), `TableNeuron`, `TableIndexNeuron`; three
signals; connector. Fifth concepts: `PostgresSourceRegistry` (revision-keyed data sources, never
evicted), `TableLifecycleGuard` (authorisation by `SourceId.Type` strings in a call filter),
`PostgresInventoryProvider`.

**Duplicate designs.** Two provider paths to one server (`IPostgresProvider` platform vs
`IConnectionPostgresProviderFactory`, the latter creating a fresh `NpgsqlDataSource` per call)
selected by key prefix `connection/`. Three connection id schemes (platform, `ConnectionKeys`,
JSON-array `TableOwner`). `ITable` vs `ITableDescriptor.Describe` on one grain. Everything in the
query door is byte-identical to Supabase's (settings, guard, cells, type map, provider read, eight
contract records).

**Vocabulary.** A table is named by grain key, `dbt_`+hash physical name, `AcceptedTable.Table`,
`TableDescription.TableId`, the `postgres-app:`+base64 handle (parsed in three modules), and the
live-table `table-`+hash.

**Structure.** Mostly folder = namespace except `Configuration/`. `PostgresServerNeuron` at root
beside providers. `PostgresModule` 19 lines; registrations in `PostgresHosting.AddPostgres` (61,
with a private health check). Contracts references only `DigitalBrain`. Runtime references
Apps.Contracts for `TableStorageHook`.

**Blast radius.** Apps (`IAppStorageHook`), DataVisualizer and CustomerResearcher scripts
(`IPostgresServer` by connection key, `ITable`, signals), Postgres.Windows, Mcp csproj (no use
found). No Dart (tables reach the shell only through Supabase windows).

**Tests.** Harness-based, hosting facts exist. Not covered: real SQL except one live-gated fact,
`DockerPostgresProvisioner.CreateDatabase`, `ConnectionPostgresProvider` against a server.

**Verdict.** (b) Bounded cleanup for the core (`Configuration/` namespace, `Server/` folder,
source-registry eviction, per-call data source); the `.Windows` half is part of the Supabase
brainstorm. **Severity: medium**, carried by the Windows coupling.

---

## ClickHouse (`src/DigitalBrain.Modules/ClickHouse`)

Contracts 109, runtime 758, hosting 169, deployment 38, tests 226.

One stateless neuron, zero signals, a connector that advertises a `connection-string` auth method
no code can use (`IClickHouseProvider` has only the deployment-integration implementation). Third
hand copy of the Postgres/Supabase query door with three field divergences (`Parameters` missing,
`SampleValues` added, `CancellationToken` on methods). `ClickHouseHostingOptions` mirrors
`ClickHouseResourceOptions` field by field, the duplication the Postgres plan removed.
`ClickHouseNames.DefaultNeuron` referenced only by tests. Folder/namespace inverted: `Query/` holds
only the neuron, its provider, guard, cells and type map sit at the root. Module 33 lines,
registrations only. Contracts references only `DigitalBrain`. No consumer outside the module.
Driver adapter (216 lines) and cells (134) untested.

**Verdict.** (b) Bounded cleanup: unify the `Query/` folder, drop the duplicated hosting options,
drop or use `DefaultNeuron`; the connector/connection gap folds into the tables brainstorm.
**Severity: low.**

---

## Qdrant (`src/DigitalBrain.Modules/Qdrant`)

Runtime 304 (6 files), hosting 34, deployment 33, tests 100. **The Contracts project has zero source
files.**

No neuron, no signal, no connector: the module registers one DI singleton, the Framework's
`IVectorStore`, consumed by `NeuronTypeSearch` and `ContractCatalogHosting`. Two implementations
chosen at startup (`QdrantStore` vs `InMemoryQdrant`, the latter the whole index in process, used
silently when no connection string exists). Connection string read raw from `ConnectionStrings:qdrant`
with a hand-rolled `Endpoint=|Uri=`/`Key=|ApiKey=` parser, bypassing the Integration seam.
`QdrantStore._dimensions` is a stale-able cache. The production store has zero facts; no fact uses
`ModuleTest.Create().WithModule<QdrantModule>()`.

**Verdict.** (a) One small design question: is the vector store a Framework service (then say so,
drop the empty Contracts project, and the module is infrastructure) or a neuron (`IVectors`)?
Mechanical cleanup after. **Severity: low** today, with an untested production path as latent cost.

---

## Aspire (`src/DigitalBrain.Modules/Microsoft/Aspire`)

682 lines including tests. The OS exposing the running AppHost as one neuron: `AspireNeuron` (39,
`Neuron<AspireState>`, proper `Save(..., signal)`), one signal, the AppHost dialling in through
`AspireBridgeClient`. No `ConnectorDefinition` declared. `AspireBridge` (87) is a `Channel` +
`ConcurrentDictionary<Guid, TaskCompletionSource>` that the grain awaits inside its turn
(`[ResponseTimeout 5m]`); a command in flight is lost on restart. Change dedup implemented on both
sides of the bridge; heartbeat is a command with `Guid.Empty`; `BridgeKey` read by string concat
from raw configuration. Bridge wire types sit in the script-visible Contracts. Namespace flat
across `Bridge/`, `Resources/`, `Signals/`. Module 28 lines. Consumers: CSharp's
`AspireSandboxRunner` (`IAspire.ListResources/StartResource`), OS E2E, AppHost.

**Verdict.** (b) Bounded cleanup: `IAspire`/`AspireResource`/`Signals` under `Resources/`, bridge
contracts out of the script ring, declare the connector. The TCS bridge is tolerable for a dev-only
link. **Severity: low.**

---

## Playwright (`src/DigitalBrain.Modules/Microsoft/Playwright`)

1,186 lines including tests. `PlaywrightNeuron` (73, `[Reentrant]`, no persistent state) and
`ScriptedBrowserNeuron` (71, persisted). Two signals at Contracts root. No `ConnectorDefinition`
although `Attach/Detach` is the handoff from the shell's `WebBrowserNeuron`. The page is a native
desktop object, so the neuron is a handle and `BrowserSessionOwner`/`PlaywrightSessionProvider`
hold the transport; that is consistent with "connector". Both the neuron and the owner track a
session generation and decide auto-detach. Scripted vs live selected by `"scripted/"` prefix in the
app script. All 12 files in one namespace, no folders. Module 19 lines. Consumers: Flutter
`WebBrowserNeuron`, CustomerResearcher synapses and tests, Mcp csproj.

**Verdict.** (b) Bounded cleanup: `Browser/` + `Browser/Signals/`, `Scripted/`, one
generation-tracking owner, declare the connector. **Severity: low.**

---

## Time and Gmail (reference)

**Time** (950 lines with tests): two neurons in their own folders with `Signals/` beneath, state
in `TimeInventory`, Contracts referencing only `DigitalBrain`, Module 28 lines. One residue:
`ReminderNeuron.ReceiveReminder` still retires a `"job"` reminder "left by the removed automation
job runner". **Verdict: (c) clean**, delete the residue.

**Gmail** (1,134 lines with tests): one neuron folder with `Signals/`, grain state for tokens as
`SecretRef`, `IGmailInbound` as the `[PlatformOnly]` inbound contract, a mailbox index grain for
push routing. Blemishes: `GmailCallbackRequests` OAuth state in process; endpoints in the Module
class; hand-rolled OAuth without PKCE while GitHub and Salesforce use the Framework `BrowserLogins`
path. **Verdict: (b)** once the connector seam is decided; nothing to do before.

---

## First-party app bundles (the consumers' view)

Loading: OS apps are embedded resources published at startup with `VerifiedByBuild = true`, so
`ShippedAppPublisher.ByBuild` marks every spec scenario green **without running `tests.cs`**.
IntoChat apps load from `../IntoChat/Apps` through `DirectoryShippedAppSource` and are verified by
`AppVerifyJob.RunBundle`.

| Bundle | Lines | Shape | Scenarios / tests.cs | Module contracts used |
|---|---|---|---|---|
| OS/Assistant | 430 | conforms (+`prompts/`) | 6 / 6 | Apps (`IApp`, `AppInvocations`); AI (`IAgentExecution.Start`, `IAgent.ReadConversation`, `AgentTurn*` signals, `IScriptedLLM`); Flutter (`IWorkspace`, `ISurface`, `ILayout`, `ICard`, `IText`, `ITextField`, `IButton`, `ButtonClicked`) |
| OS/DataVisualizer | 815 | **no tests.cs, zero `## Scenario:` headings**; green only by `ByBuild` | 0 / none | Apps; Flutter (`ISurface`, `ILayout`, `ICard`, `IText`, `ITextField`, `ITable`, `IChart`); Time (`IReminder`); Postgres (`IPostgresServer` by connection key, `ITable`, signals) |
| OS/Settings | 192 | conforms, no icon | 3 / 3 | Apps; Flutter (`ISurface`, `ILayout`, `ITextField`) |
| IntoChat/CustomerResearcher | 750 | conforms (+`app.authoring.json`, outside CLAUDE.md shape, reader not found) | 7 (1 live) / 6 | Apps; AI (`ILLM`, `IScriptedLLM`); Flutter (`IWorkspace`, `ISurface`, `ILayout`, `IButton`, `IText`, `ITextField`, `IWebBrowser`); Postgres (`ITable`); Playwright (`IPlaywright`, `IScriptedBrowser`) |
| IntoChat/WordCount | 100 | conforms | 3 / 3 | Apps only |

Fifth-concept smells inside scripts: `Assistant/chat.cs:165-186` rebuilds a transcript by parsing
card *titles* (`"Tool: "`, `"Result: "`) and detects failure by `StartsWith("The turn failed:")`;
DataVisualizer keeps a "view registry" as JSON inside an `IText` neuron (five sites) and copies the
same ~120-line `RunView` body into four synapses; `CustomerResearcher/research.cs` is a 349-line
single script. No bundle references `DigitalBrain.Assistant`. The Assistant bundle depends on
exactly the AI types the AI spec deletes (`IAgentExecution`, `AgentTurn*` signals).

---

## Cross-cutting findings

1. **The connector seam is three designs.** Gmail stores grants through
   `IModuleConnectionCredentials<T>` into the Platform `ConnectionRegistry` with `ConnectionKeys`;
   Salesforce through `IOAuthCredentials` plus its own `IExternalConnection` row; GitHub in a
   private grain plus a process dictionary and discards the user token. OAuth state lives in Gmail's
   own dictionary vs the Framework `BrowserLogins` (used by GitHub and Salesforce, with PKCE).
   Webhook intake: Gmail routes through an index grain to an `IXxxInbound` contract; GitHub routes
   through an in-process table. The Framework ring itself offers two credential seams and two
   connection-list seams. This is one brainstorm, not three.
2. **Tables and windows are three designs across four modules.** The Postgres-wire query door is
   copy-pasted between Postgres and Supabase (~350 runtime lines, ~80 contract lines, three
   near-identical `IntegrationMaterializationFacts`) and hand-copied a third time for ClickHouse.
   The write-table lives only in Postgres; the window engine lives only in Supabase; ClickHouse has
   neither; the Flutter UiKit adds a fourth `ITable`. One brainstorm.
3. **Delivery guarantee.** CLAUDE.md promises at-least-once with a watermark; `CSharpFileNeuron`
   delivers at-most-once with delete-on-read and a 64-item drop. Every behavior in every bundle
   depends on this.
4. **Fire-and-forget work is lost on restart** in Apps (`AppWorkQueue`), Assistant (receipt write
   after the stream), GitHub (bindings), Salesforce (`TokenHandoff`), Gmail (`GmailCallbackRequests`),
   Aspire (`AspireBridge` pending commands). Only Aspire's is defensible as dev plumbing.
5. **Grain-type-name authorisation.** `MarketplaceWriteGuard`, `CSharpAppBindingGuard`,
   `TableLifecycleGuard` and the Supabase table grain all decide access by comparing `SourceId.Type`
   strings or by a service checking the workspace first, rather than in the neuron's `Access`.
6. **Dead or stale project references** found by text search, to confirm with LSP during each
   module's work: Apps → Postgres.Contracts, Apps → CodeAnalysis.Workspaces, Mcp → Apps/Flutter/
   Postgres/Playwright Contracts, Flutter → Apps.Contracts, Assistant → CSharp.Contracts,
   Assistant.Contracts → Flutter.Contracts, GitHub → ModelContextProtocol.Core.
7. **Product concerns in vendor modules.** `intochat.*` grain ids, `WorkspaceStarterCatalog`,
   `ProblemReports` and `ChatEntry` in Flutter; `intochat.query-window-result` alias in Supabase.
8. **Half-applied specs.** Synapse vocabulary (rename landed in bundles and prefix, not API, state,
   tests or CLAUDE.md); creator-live-apps (`ScenarioId`, `dbtest:json`, `app.authoring.json`,
   `IPackage` with no code behind them); compute-ledger-collapse (implemented, checkboxes
   unticked, one `Root` shim left).

---

## Ranked table

Ranked by what the fundamental problem costs today, not by size. "Order" is the suggested sequence
of Phase 2 work; it differs from rank where one module's design depends on another's landing first.

| # | Module | The one main source of complexity | Severity | Blast radius | Verdict | Order |
|---|---|---|---|---|---|---|
| 1 | **Assistant** | A second agent driver re-implements turn, replay, receipts and a dead transcript around the AI ledger while the shipped app drives the same agent a third way. | high | E2E golden path, Dart model catalog, OS branding; downstream of the AI spec | (a) brainstorm | 1, immediately after AI lands |
| 2 | **CSharp** | One grain carries three run modes through a nullable `Trigger` and a `Subscriptions` array, and its subscription buffer is delete-on-read against a stated at-least-once guarantee. | high | Apps runtime and verify, every bundle's behaviors, OS E2E, Dart csharp manager | (a) brainstorm | 2 |
| 3 | **GitHub** (+ Salesforce, Gmail as the connector seam) | The repository connection lives in a process singleton the grain depends on, with a second copy in a grain, reconciled by revision checks. | high | AppHost, ReferenceBrain; Salesforce and Gmail share the seam | (a) one brainstorm for the seam | 3 |
| 4 | **Supabase** (+ Postgres.Windows, ClickHouse as the tables seam) | A generic live-table window engine is hosted inside one vendor module, so every other SQL source adapts to its types and strings. | high | E2E golden path, Dart table mirror, Assistant tools, Postgres.Windows, DataVisualizer | (a) one brainstorm for tables and windows | 4 |
| 5 | **Apps** | Five stateless process orchestrators each re-implement a slice of the app grain's state machine and poll it, leaving the neuron with three overlapping ledgers. | medium | OS boot/ship, all five bundles, Assistant, CSharp, Postgres hooks, Dart app screens | (a) brainstorm | 5 |
| 6 | **Flutter** | The shell is half a connector: widgets are neurons, but projects, conversations, window modes and `UiPart`s are a client-owned blob served through a second vocabulary and a dead event path. | medium | Every bundle, Assistant, Supabase, eight E2E files, all Dart mirrors | (a) narrow brainstorm; widgets are (b) | 6, after the open UiPart front is decided |
| 7 | **Compute** | Three records of every paid intent through two non-neuron stores and an undriven billing pipeline, with enforcement enums mirrored by integer cast. | medium | Assistant, Dart usage page, Framework E2E | (b) cleanup; one signal question | 7 |
| 8 | **Salesforce** | Connection logic split across four singletons that pass grain state through, plus a process-held token handoff. | medium | AppHost, ReferenceBrain | folded into #3 | with 3 |
| 9 | **Postgres core** | Query door duplicated with Supabase; two provider paths by key prefix; source registry never evicts. | medium | Scripts, Apps hooks, Windows | (b) cleanup; windows folded into #4 | with 4 |
| 10 | **Qdrant** | A DI store with no neuron contract, an empty Contracts project and an untested production path. | low | Framework catalog search | (a) one question, then cleanup | 8 |
| 11 | **ClickHouse** | Third hand copy of the query door; connector advertises a connection the neuron cannot use. | low | none outside module | (b) cleanup; folded into #4 | with 4 |
| 12 | **Aspire** | Cross-process request/response modelled as an in-process Channel + TCS table awaited inside a grain turn. | low | CSharp sandbox runner, OS E2E | (b) cleanup | 9 |
| 13 | **Playwright** | Live browser is a native resource, so neuron and session owner both track generation and auto-detach. | low | Flutter web browser, CustomerResearcher | (b) cleanup | 10 |
| 14 | **Time** | One dead reminder-retirement branch. | none | scripts (`IReminder`) | (c) clean | any time |
| 15 | **Gmail** | OAuth state in process; endpoints in the Module class. | low | none outside module | (b) after #3 | with 3 |

Decisions needed from you before Phase 2 starts:

- Confirm the order, or re-rank.
- Behavior or synapse: which word wins, so the Apps and CSharp work use one.
- Whether the three cross-module seams (connectors, tables/windows, UiPart) are brainstormed as
  seams, as proposed, or module by module.
