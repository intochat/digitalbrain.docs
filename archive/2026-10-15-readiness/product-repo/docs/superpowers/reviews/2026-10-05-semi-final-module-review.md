# Semi-final module review — 2026-10-05

Assessment only; no refactoring performed. Verdicts per the review brief: is there something
fundamentally wrong, main source of complexity, the cut list, contract violations.

## Scoreboard

| Module | Verdict |
|---|---|
| Apps | SOUND core / NEEDS SURGERY at the edges |
| Compute | SOUND (keep as module — premise of the suspicion was false) |
| Registry | NEEDS SURGERY (arguably dissolves into Assistant + Framework) |
| Assistant | NEEDS SURGERY |
| Specs | SHOULD NOT EXIST (as an OS module) |
| Gmail, GitHub, ClickHouse, Time, Playwright, Aspire, AI | SOUND (minor fixes) |
| CSharp | SOUND core / edge surgery |
| Salesforce, Supabase, Postgres, Flutter, Files | NEEDS SURGERY |
| Qdrant | NEEDS SURGERY (near-empty Contracts; arguably a Framework provider, not a module) |

## Cross-cutting diseases (fix once, not per module)

1. **The "fakes in a Testing package" rule is honored almost nowhere.** Apps ships an *empty*
   Testing csproj; Flutter's Testing package holds only E2E config; Qdrant's `InMemoryQdrant`
   and Compute's `FakeInvoicingProvider` ship in production assemblies (Compute even registers
   its fake as the default `IInvoicingProvider`, `ComputeModule.cs:30`). Decide: enforce the
   rule or retire it from the module contract.
2. **Two competing credential patterns.** Gmail and AI do it right (IntegrationDefinition /
   provider registrations; AI even has `AIOptionsPurityFacts`). Salesforce
   (`SalesforceOAuthOptions` with ConsumerSecret in **Contracts**, no IntegrationDefinition at
   all), GitHub's App secrets (`GitHubAppOptions` beside a real IntegrationDefinition — two
   parallel channels), and the DB modules' connection strings
   (`SupabaseModuleOptions.ResolveConnection`, `ClickHouseModuleOptions.ResolveConnection`,
   Postgres `AdminConnectionKey` under a private root `DigitalBrain:Capacity:...`) all flow
   secrets through options/config. CSharp's `RunTokenKey` (HMAC key in config) is the
   acknowledged "run-token tightening" front.
3. **Modules that never adopted the options grammar.** Apps (plain `Module`, keys built by
   string concat), Assistant (`BindConfiguration("Assistant")` — a private root exempted in
   `BrandingFacts.cs:9`), Compute (price book not overridable). This is the disease behind the
   12 red AppDraftFacts (below).
4. **IntoChat leakage into generic modules** — NuGet-blocking. Apps (`intochat.app-draft` grain
   types + seven `intochat.*` aliases), Flutter (`intochat.shell-state`, `intochat.problem-reports`),
   Files (wholesale: every alias, plus blob container `intochat-assets-v1`). The rename-identity
   machinery (commit ca1c121c0) exists precisely for this.
5. **Duplicate Framework ProjectReference** copy-pasted into at least four runtime csprojs
   (Compute, Gmail, Salesforce, Supabase). Stale "Kernel wire vocabulary" comments across
   Contracts csprojs.

---

## 1. Apps — SOUND core, NEEDS SURGERY at the edges

The four load-bearing pieces are small and honest: `PackageNeuron` (git semantics),
`AppVerificationNeuron` + the test runner (green really requires exit 0 AND ≥1 scenario AND all
passed), `AppDraftNeuron`'s author→build→verify loop, `ShippedAppPublisher`. Keep all of it.

**Main complexity: `Workspace/App.cs` (479 lines) is a museum of migration eras.** Two parallel
idempotency receipt lists, a pending-deployment saga, a pending-uninstall saga plus a separate
abandon-storage saga, Postgres table-ownership adoption (`Adopt`, "table-owners-v1" ensured in
three places), grant migration, and `BackfillStorageFiles` which walks the entire revision DAG to
repair pre-`StorageHistoryKnown` installs. Roughly a third of the file repairs installs made by
abandoned iterations. Second accretion: the **spec/document duality** (`AppDraftState.Spec` +
`Document`, byte-near-equality check in `AppDocumentCodec.Read`, `ProposeConversion`,
`Document is null` forks at AppDraftNeuron.cs:56/66/76). Third: legacy `PackageContent.Source`
beside `Files`, re-merged in four places.

**Delete today:** the empty `DigitalBrain.Modules.Apps.Testing`; `PackageContent.Source` as a
field (make app.cs an ordinary `Files` entry); `BuiltInSettingsEndpoints` + the Apps→Flutter.Contracts
edge (move to OS composition). **Delete after a one-time data sweep:** `BackfillStorageFiles`,
`Adopt`, `IAppStorageHandover`, abandon-storage saga, `IAppGrantMigration`, "table-owners-v1"
ensures (~150 lines + two cross-ring interfaces); legacy `dbtest:pass/fail` parsing; the
spec-only draft path (document becomes canonical, spec derived). **Keep** `app.authoring.json` —
stable scenario IDs are what verdict binding keys on.

**The 12 red AppDraftFacts — the disease:** every failure is `TestExecutionOptions.Validate()`
refusing `PrivateConfiguration` keys under `DigitalBrain:Modules:*`, which AppDraftFacts.cs:336-343
smuggles because **Apps has no front door**: no `AppsOptions`, not `Module<TOptions>`, keys exist
only as hand-built strings (AppDraftNeuron.cs:27-30). Fix the module, not the guard: declare
`AppsOptions { AuthorModel, BuilderModel, ShipOnStartup }`, make `AppsModule : Module<AppsOptions>`,
switch tests to `WithModule<AppsModule, AppsOptions>(...)`. One change, all 12 green.

Blast radius: ~5 projects (Apps runtime/Contracts, OS, IntoChat composition, tests);
`AppState`/`AppDraftState` lose fields (reserve `[Id]`s), package revisions untouched.

## 2. Compute — SOUND as a module

The suspicion's premise is false: the enforcement surgery already happened. `CallRequest`/
`CallDecision`/`ICallFilter` live in the vocabulary ring (`DigitalBrain/Enforcement/ICallFilter.cs`);
the filter pipeline lives in Framework; Compute merely plugs in `AllowanceCallFilterStage`
(ComputeModule.cs:34) exactly like Platform's `GrantCallFilterStage`. Zero `DigitalBrain.Compute`
usings in any ring. Run tokens aren't here — they're in CSharp. Consumers (AI, Assistant) take
Contracts only and degrade gracefully (`IMeterSink?` null-safe). **Keep as module.**

Real weight: four loosely-related domains (metering, pricing, ledger/billing, a bespoke paged
record store duplicated again in `Usage/UsageStore.cs`). The allowance part everyone feared is
the cleanest 22 lines in it.

Violations: storage state types missing `[Alias]` (`ComputePartState.cs:3`,
`ComputeRecordsState.cs:3`, `ComputeRecordPage.cs:3`, `ComputeRecordTree.cs:6` — rename
landmines); endpoints bypass `BrainRoutes.Group` (`ComputeEndpoints.cs:15,30`);
`FakeInvoicingProvider` as production default; hardcoded `pricebook.v0.json` not overridable
(not `Module<TOptions>`). Watch the one ring seam: `CallDenial.MissingAllowance/LimitReached`
encode Compute concepts in the vocabulary ring.

## 3. Registry — NEEDS SURGERY (likely dissolves)

One legitimate job: **runtime capability discovery** — ranking/serving the per-brain catalog of
`IRegistryResourceProvider` offerings (apps, Postgres tables, C# files) to the Assistant's
`discover_capabilities`/`select_capability`. Nothing else covers that. But it currently does
three jobs, and the other two are the complexity:

- **Static neuron-type catalog** (`NeuronTypes.cs`/`NeuronTypeSearch.cs`) duplicates the CSharp
  module's `ContractVocabulary` walk — two reflection passes, two incompatible shapes
  (`CSharpContractDiscovery.cs:42` even comments "the registry's catalog is the truth" next to
  its own duplicate). Merge into `ContractVocabulary`.
- **Observed instance ledger** (`RegistryNeuron.ObserveBatch` + `RegistryObserver`): an
  unbounded, *global* (not per-brain — `IRegistry.Key = "registry"` constant, contradicting the
  README and CLAUDE.md's per-brain rule) activity dictionary kept alive by exactly one consumer:
  the one-time legacy backfill in `Apps/Workspace/Apps.cs:41-69`. It forces `[AlwaysInterleave]`
  deadlock duct tape (`IRegistry.cs:16-18`) and self-observation hacks. Delete after the
  backfill completes.

Endgame: `RegistryDiscoveryService` + provider contract move to Assistant (its only consumer)
with `IRegistryResourceProvider`/`RegistryCapability` in Framework — **the Registry module
disappears**. Blast radius: 4 provider registrations change namespace; Assistant/Apps/CSharp/Mcp
drop the Contracts reference; `registry.state` retires. Also: Apps sniffs the module by magic
string (`Apps.cs:48`).

## 4. Assistant — NEEDS SURGERY (deserves to exist)

Right module (human's connector via the Flutter shell), wrong seams. **Main complexity:
`AssistantTurnExecution.cs` (344 lines) is three concerns in one method**: (a) turn lifecycle/
replay/ownership threaded through four catch blocks; (b) metering/pricing/receipts (~90-line
finally); (c) an untyped AG-UI wire protocol emitted as anonymous-object JSON, mirrored by hand
in Dart. Worst: `IsLiveTableTool` (line 301) hardcodes Supabase/Postgres private tool names and
parses their result JSON by property name — inverted dependency; the `_ui` card convention
(line 303) is the right pattern, generalize it and delete the name-sniffing.

Violations: options bound to a top-level `"Assistant"` root (`AssistantModule.cs:18`), exempted
in `BrandingFacts.cs:9` instead of fixed; bare `Module`, so no `Validate()`; no Testing package
(fakes locked behind `InternalsVisibleTo`); mixed alias namespaces (`apps.assistant` vs
`assistant.thread`) pinned by persistence; duplicate `/built-in/*` route pair.

## 5. Specs — SHOULD NOT EXIST (as an OS module)

A step-vocabulary engine (`GherkinParser`, `StepLibrary`, `StepBinder`) — precisely what the
ratified standard retired ("there is no step vocabulary… modules never ship step definitions").
No connector, no external system; `SpecsModule` registers only `TimeProvider`. Consumers: the
catalog line, one E2E reference brain (which never registers a StepLibrary, so every feature
would be Unbound), and Assistant's own test project running one `.feature` file.
`FeatureNeuron.Run` executes host delegates inside a non-reentrant grain turn with a one-hour
`ResponseTimeout`. Also: `StepContext` hands step code raw `IGrainFactory`+`IServiceProvider`.

Cut: remove from `OsCatalog` and Testing.E2E; fold the runner into the Assistant test project or
replace `AssistantFeatureFacts` with plain facts. Blast radius: two test projects and one
catalog line; zero production behavior.

## 6. Edge modules

**Gmail — SOUND.** Credentials via IntegrationDefinition done right. Fix: OAuth callback routes
to a single global `GetGrain<IGmail>("gmail")` (GoogleModule.cs:64) while the push grain is
keyed by email — reconcile the keying; naming drift (GmailModule in GoogleModule.cs).

**GitHub — SOUND.** Exemplary state/dedup hygiene. Fix: `GitHubAppOptions` carries
ClientSecret/WebhookSecret under module config beside a real IntegrationDefinition — collapse to
one channel; raw section strings off the options grammar.

**Salesforce — NEEDS SURGERY.** No IntegrationDefinition at all; `SalesforceOAuthOptions` with
consumer secrets lives in **Contracts** ("Do not serialize or log" comment as the fig leaf);
stale "kernel" error text. Ship the integration definition, delete the options class.

**Supabase — NEEDS SURGERY.** `ResolveConnection(IConfiguration)` puts executable resolution
and the connection string into a Contracts options type. Bigger: it's the accidental landlord of
the generic live-table/window machinery (`Windows/LiveTable*`, `QueryPlanCompiler`) that
Postgres imports — a vendor module hosting a framework concept. Hoist the vendor-neutral layer
into Framework (or a Tables module).

**Postgres — NEEDS SURGERY (worst edge offender).** Runtime→runtime ProjectReference to the
Supabase module (throws `SupabaseTableValidationException` from Postgres code); pulls
`Azure.Storage.Blobs` + Orleans AzureStorage persistence for a one-time blob→Postgres grain-state
migration (host-composition work inside an edge module); `AdminConnectionKey` under a private
config root declared in Contracts; `[PlatformOnly]` interfaces shipped in the public Contracts
package.

**Qdrant — NEEDS SURGERY / demote.** Ships zero neuron contracts and zero signals; Contracts
holds one options file; the advertised `IQdrant` doesn't exist in the repo. `InMemoryQdrant`
silently serves in production when unconfigured — a quiet durability downgrade. Either grow a
real neuron surface or demote to a Framework vector-store provider package and delete the
Contracts project.

**ClickHouse — SOUND.** Fix: same `ResolveConnection` pattern as Supabase; Aspire resource names
and the `digitalbrain` DB name baked into Contracts (`ClickHouseNames.cs:10-13`).

**Time — SOUND.** Clean throughout; the single config key could become a tiny options record
(cosmetic).

**Playwright — SOUND.** `IScriptedBrowser` follows the sanctioned scripted-connector pattern;
live browser correctly a process cache.

**Aspire — SOUND** (dev-tool module). Bridge mounts outside `BrainRoutes.Group` intentionally;
default `ApplicationName = "DigitalBrain"` is a mild NuGet smell.

**Flutter (C# side) — NEEDS SURGERY (light).** `intochat.*` grain types/aliases in Workspace
(shell-state, shell-part, problem-reports); `FlutterHostingOptions` carries dev-run concerns
(FlutterCommand, WorkingDirectory) in the contracts ring — move to the Aspire.Hosting adapter.
Note: the widget palette is becoming "renderable palette v1" by accretion — don't let it ratify
itself.

**Files — NEEDS SURGERY (should not ship as-is).** Wholesale IntoChat branding (every alias,
grain type, and the blob container name); Contracts csproj doesn't even reference `DigitalBrain`
directly (transitively via Flutter.Contracts); contracts are UI-coupled (`FileExplorerState.Surface`
is a `UiChildRef`, `DirectoryPage` built of Flutter `CollectionItem`s) — the nearest thing to a
smuggled fifth concept ("document surface"). Either rename everything via the identity-migration
machinery or move it under `src/IntoChat` and stop presenting it as a shareable module. The
at-least-once save-operation design itself is good.

**CSharp — SOUND core, edge surgery.** This *is* the Behavior mechanism, depth earned;
`CSharpFileState` exemplary. Fix: `RunTokenKey` secret in config (the open front); repo-shape
hardcodes (`FindRepositoryRoot` probing `DigitalBrain.slnx`, `/brain/src/.../DigitalBrain.Client.csproj`
in SandboxOptions) should fail loudly outside this repo; Azure deployment branch in
`CSharpModule.Configure` belongs in CSharp.Deployment; consider splitting authoring-agent deps
from the runtime module.

**AI — SOUND.** Textbook secrets discipline (`AIOptionsPurityFacts`), clean provenance. Watch:
`AiCredentials.cs` fabricates a Platform-trust `CallerContext` in module code — Framework should
hand that capability out; sync-over-async in `ReleaseSecret`; one named interface per model in
Contracts is a version-bump churn surface; runtime bundles voice/web/MCP — split before NuGet.

---

## Suggested ratification order

1. **Grammar adoption** (fixes the 12 reds + Assistant/Compute options): AppsOptions,
   AssistantOptions, Compute pricing options.
2. **Credential unification**: Salesforce/GitHub-App/DB connection strings onto
   IntegrationDefinition; run-token front as its own design pass.
3. **Deletions**: Specs from the catalog; Registry's ledger + type catalog (then dissolve
   Registry); Apps migration-era code after the data sweep; empty Testing csproj.
4. **De-branding** (NuGet gate): rename `intochat.*` identities in Apps/Flutter/Files via the
   rename-migration machinery, or relocate Files into IntoChat.
5. **Structural**: hoist live-table layer out of Supabase, cut Postgres→Supabase; decide the
   Testing-package rule once; Qdrant demotion.
