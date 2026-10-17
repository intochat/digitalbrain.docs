# Framework Structure: Analysis and Cleanup Proposal

**Status:** analysis and decisions agreed 2026-10-07 (see "Decisions taken"). The task-level
implementation plan is the next step; no code edits have been made yet.

**Goal:** `src/DigitalBrain.Framework/DigitalBrain.Framework` becomes the neuron runtime and nothing
else. Everything that is a seam for another project moves to that project's contract home; everything
that is test-harness or client code moves to its consumer; what is dead is deleted.

**Builds on:** intochat/digitalbrain#169 (`framework-cleanup`), which removed the Persistence folder,
dead symbols, the legacy `workspace-<hex>` id check, one of two HTTP exception mappers, XML summaries and
alias-compatibility comments. Nothing here re-proposes those.

**Out of scope (goes with the apps redesign, not re-analysed):** `Capacity/`, `Discovery/`, `Metering/`,
`Vectors/`, `IntentContext`, `AppGrainType`, `NeuronTypeSearch`, `NeuronType`/`NeuronTypeHit`,
`ContractCatalogHosting` (the embedding/vector wiring). 13 files.

**Method:** every usage claim below is from LSP (`documentSymbol` on the declaration, then
`findReferences` / `goToImplementation`), cross-checked with a text search over `src/` and `tests/`.
The C# LSP needs the gitignored root `DigitalBrain-lsp.sln`; it was missing this session and was
regenerated before the queries.

## 1. Folder map

Framework has 101 source files.

| Folder | What it is | Consumers (LSP) | Verdict |
|---|---|---|---|
| root: `Neuron`, `IActivationHandler`, `ObserverOptions` | Runtime: grain base, activation handlers, observer lease | every module; `ObserverRenewal` only `CSharpFileNeuron` | Runtime |
| root: `LocalSignalHub`, `SiloSignalBus` | Runtime: two in-silo delivery paths (§3) | silo bus: `OsBootService`, `ShippedAppWriteBack`, tests; per-observer path: Client.Orleans only | Runtime, duplicated |
| `Brain/` | Runtime: `KernelNeuron`, `CurrentBrain` (silo `IDigitalBrain`), `ICreationHandler`, `IDigitalBrains` | `ICreationHandler`: one impl (`OsApps`). `IDigitalBrains`: one impl, `BrainClient` in Client.Orleans; `ServerHostingExtensions` registers the client into the silo | Runtime, but brain-opening lives in Client |
| `Enforcement/` | Runtime (caller stamp, call filter, neuron access, brain scope) + HTTP edge (`BrainRoutes`, `BrainAccessFilter`, `IBrainAccess`) + ring markers (`PlatformAssemblyAttribute`, `PlatformOnlyAttribute`) | stamp/scope: 70+ sites. Stages: Compute `AllowanceCallFilterStage`, Platform `GrantCallFilterStage`. `IBrainAccess`: Platform `DirectoryBrainAccess`, consumed by module routes | Three concerns in one folder |
| `Composition/` declaration half | `Module`, `ModuleId`, `IModuleOptions`, `ModuleDefinition`, `ModuleInventory`, `ModuleOptionsSerialization`, `DigitalBrainConfiguration`, `ModuleSettingsValidation` | Aspire.Server/Hosting, Deployment, modules, Platform, Testing | Module seam, keep |
| `Composition/` builder half | `BrainCompositionBuilder`, `BrainComposition`, `ModuleDraft`, `ModuleOptionsSlot`, `ModuleConfiguration`, `ModuleComposition` | only Testing.Module `ModuleTestBuilder` and Framework unit tests. Production composes via Aspire.Server `DigitalBrainServerBuilder` | Test-harness code parked in Framework |
| `Composition/ContractCatalog` | "Which contract assemblies exist" + per-type metadata | assembly/type list: CSharp `ScriptContracts`, `ContractVocabulary`, MCP, Apps `Creator`/`BuilderTools`. Metadata: `NeuronTypeSearch` only | Half runtime, half redesign |
| `Hosting/` | `BrainHosting` (runtime DI), `RuntimeStartupTask` (publishes `ModuleLoaded`), `DigitalBrainNames` | `ModuleLoaded`: two tests only. Names: Framework uses only `DefaultGrainStorage`; `MasterKey*` Platform + Testing.Module; `ConfigurationFile*` Aspire.Server; `Storage/Clustering/Reminders/GrainState/GrainStateContainer` Aspire + Platform + MCP | Runtime + other projects' constants |
| `Http/` | `IHttpModule`, `ModuleEndpoints` (health + module routes), `ModuleRouteGuard` | 10 modules + `TestTwitterModule`; mapped by OS `Program` and Testing `ModuleHttpEdge` | HTTP seam, survives |
| `HttpSurfaces/` | `IHttpSurface` middleware mapped before the auth gate | 3 impls: `BrowserLoginSurface` (Framework), `GitHubWebhookSurface`, `GmailOAuthPrivacySurface`; mapped by Platform `IdentityHosting.UseModuleHttpSurfaces` | Second HTTP seam |
| `Auth/` | Browser OAuth login helper: `BrowserLogins`, definition, surface, correlation, workspace scope, `LoginPage` | subclassed by `GitHubLogins`, `SalesforceLogins` only | Connector auth SDK, not runtime |
| `Integrations/Accounts/ScopedConnections` | one filter function | Platform `ConnectionEndpoints` + one Platform test | Platform code in Framework |
| `Platform/Auth` | `ITokenHandoff`, `IOAuthCredentials`, `OAuthTokens`, expiry exception | Platform impls; Salesforce the only module consumer | Platform seam |
| `Platform/Identity` | `Account`, `Member`, `Invitation`, `Grant`, `GrantMode`, `MemberRole`, `IIdentityDirectory`, `IIdentity`, `IPublisherDirectory`/`PublisherBrain`, `IdentityGrains`; 4 option classes in namespace `DigitalBrain.Platform.Identity.Configuration` | `Invitation`, `Grant`, `GrantMode`: Platform only. `IIdentity`: Platform + Gmail. Publisher: Platform impl, Apps consumer. Options: Platform, Aspire, OS, MCP, Flutter hosting | Platform seam; a third Platform-internal |
| `Platform/Integrations` | `ConnectorDefinition`, `IModuleIntegrations`, `IIntegrationHandle`, `IIntegrationStartup`, `IModuleConnectionCredentials`, `IntegrationSchema`, `ConnectionKeys`, `IIntegration` + records, `IConnectionRegistry` + records, `Connection`, `ConnectionProbe`, `IExternalConnection`/`ConnectionRow`, `Capability`/`ICapabilities`/`ICapabilitySource` | 7 modules declare connectors; `IIntegrationStartup` 4 impls; `Capability` AI + Platform; `IExternalConnection` Salesforce + Platform; `IConnectionProbe`, `ConnectConnection`, `ConnectionStatusChanged`, `ConnectionDisconnected` Platform only | The real module↔Platform seam |
| `Platform/Secrets`, `Platform/Shipping` | `ISecrets`, `IShippedContentPublisher` | Platform + 1 module; Apps impl, Platform caller | Platform seam |
| `Signals/` | `IBrainSubscriptions`, `ISignalSubscription` (watch with a handle), `ILocalSignalHub`/`ILocalSignalFaultSink`, `ModuleLoaded` | subscriptions: Client.Orleans impl; Testing, CSharp `ScriptEdge` consumers. `ILocalSignalHub`: Client.Orleans `SignalSubscription` only | Client seam + one dead signal |
| `Types/` | `FieldKind`, `SecretRef`, `SecretReferences`, `TypeCatalog`, `SemanticType` + 6 enums, `SchemaExtensions`, `TypeValidationException`, `Reference` | `SecretRef`: Platform, modules, Deployment. `TypeCatalog.Validate/AllowedFor`: Flutter `FormNeuron`; `.Get`: Supabase read policy, Assistant form tools. `SemanticType`: Framework only. `McpFormPrimitive`, `ToMcpFormPrimitive`, `McpFormKinds`, `ToJson`: tests only | Type system; a quarter dead |

## 2. Main source of complexity

Confirmed, and deeper. Framework is the only assembly every ring can reference, so it holds the
meeting point for each pair that cannot see each other: 21 files under `Platform/` are the
module↔Platform contract surface, and 4 option classes even carry a `DigitalBrain.Platform.*`
namespace while living here. The same gravity pulls in two more tenants:

- **The test harness.** The six-file composition builder has no production caller (Aspire.Server
  composes with its own `DigitalBrainServerBuilder`). `ModuleLoaded` and `RuntimeStartupTask` exist for
  two tests.
- **The client.** `IBrainSubscriptions`, `ISignalSubscription` and the whole `ILocalSignalHub` path
  exist for Client.Orleans. The silo's `IDigitalBrains` is Client.Orleans' `BrainClient`, registered
  into the silo by Aspire.Server, so the runtime opens brains through the client.

Roughly a third of Framework is Platform surface, a tenth is test or client code, and about a quarter
of `Platform/` is not a seam at all: 9 records and interfaces there have no consumer outside the
Platform ring.

## 3. Duplications

| Concern | Implementations | Survivor |
|---|---|---|
| Signal delivery | (a) `Neuron.Watch` over `ObserverManager`: Client, MCP `NeuronTools`, CSharp `ScriptEdge`, `CSharpFileNeuron`. (b) `LocalSignalHub` per-grain pumps via `ILocalSignalHub`: Client.Orleans in-silo shortcut only. (c) `SiloSignalBus` typed channels: `OsBootService`, `ShippedAppWriteBack`, tests | (a) is the contract. (c) stays as the one process-wide bus for host services until they become behaviors. (b) goes (D2) |
| Persistence | `Neuron<TState>.Save` (24 subclasses). Raw `IPersistentState` in `KernelNeuron`, the C# catalog neuron, and 7 module neurons (`AgentNeuron`, `ScriptedLlmNeuron`, `IntentUsageNeuron`, `AppIndexNeuron`, `MarketplaceNeuron`, `ComputeRecordsNeuron`, `CollectionNeuron`; 4 are redesign neurons) | `Neuron<TState>`, once it exposes `Exists` (`RecordExists`) so the kernel can use it |
| HTTP seams | `IHttpModule` (10 modules, after auth) vs `IHttpSurface` (3, before auth, mapped by Platform) | `IHttpModule`; the 3 surfaces become anonymous endpoint groups (D3) |
| Brain access | `IBrainAccess.CanAccessAsync`, `IIdentity.CanAccessAsync`, `IIdentityDirectory.CanAccessAsync`: identical signatures | `IBrainAccess` (runtime). The other two are Platform-internal |
| Auth entry points | Platform cookie/basic identity; `BrowserLogins` OAuth helper (GitHub, Salesforce); `ITokenHandoff`/`IOAuthCredentials` (Salesforce only); `CallerContextStamper` | `CallerContextStamper` is the only runtime entry. The rest is connector auth and leaves Framework (D1) |
| `Capability` | `Platform/Integrations/Capability` (AI `AiModelCapabilities` + Platform `/integrations`) vs `RegistryCapability` (redesign) | Neither in Framework: the first moves with the Platform seam, the second goes with the redesign |
| Discovery vocabularies | `ContractCatalog`/`NeuronType` (types), `IRegistry`/`NeuronRecord` (instances), `RegistryDiscovery`/`RegistryCapability` (tools) | Only `ModuleInventory.ContractAssemblies` + the `ContractCatalog` assembly/type list (ScriptContracts, MCP). The rest goes with the redesign |

## 4. Target layout

```
DigitalBrain.Framework/                       namespace DigitalBrain.Framework unless noted
  Runtime/
    Neuron.cs, IActivationHandler.cs, ObserverOptions.cs
    Brain/        KernelNeuron.cs, CurrentBrain.cs, ICreationHandler.cs, IDigitalBrains.cs
    Signalling/   SiloSignalBus.cs (absorbs LocalSignalHub.Publish), IBrainSubscriptions.cs, ISignalSubscription.cs
    Hosting/      BrainHosting.cs, DigitalBrainNames.cs (storage/clustering names only)
  Callers/                                    namespace DigitalBrain.Framework.Callers  (was Enforcement)
    CallerContext.cs, CallerContextStamper.cs, CallFilter.cs, ICallFilter.cs, ICallFilterStage.cs,
    CallRequest.cs, NeuronAccess.cs, NeuronCallFilter.cs, BrainScope.cs
  Modules/                                    (was Composition, declaration half)
    Module.cs, ModuleId.cs, IModuleOptions.cs, ModuleDefinition.cs, ModuleInventory.cs,
    ModuleOptionsSerialization.cs, DigitalBrainConfiguration.cs, ModuleSettingsValidation.cs,
    ContractCatalog.cs (assembly + type list only), PlatformAssemblyAttribute.cs, PlatformOnlyAttribute.cs
  Http/
    IHttpModule.cs, ModuleEndpoints.cs, ModuleRouteGuard.cs, BrainRoutes.cs, BrainAccessFilter.cs, IBrainAccess.cs
  Types/
    FieldKind.cs, SecretRef.cs, SecretReferences.cs, TypeCatalog.cs, TypeValidationException.cs, ValueTypes.cs, SemanticType.cs
```

Leaves Framework:

- **To `DigitalBrain.Platform.Contracts`** (namespaces `DigitalBrain.Platform.Auth/Identity/Integrations/Secrets/Shipping`,
  `[PlatformOnly]` kept): all of `Platform/` except the items below, plus `Auth/` (`BrowserLogins`,
  `BrowserLoginDefinition`, `BrowserLoginSurface` or its endpoint replacement, `BrowserLoginCorrelation`,
  `BrowserLoginWorkspace`, `LoginPage`), and `IHttpSurface` if it survives D3. That project then needs the
  `Microsoft.AspNetCore.App` framework reference. (D1)
- **To `DigitalBrain.Platform`** (ring): `ScopedConnections`, `Invitation`, `Grant`, `GrantMode`,
  `ConnectionProbe.cs` (`IConnectionProbe`, `ConnectionProbeResult`, `ConnectionNotConfiguredException`),
  `ConnectionStatusChanged`, `ConnectionDisconnected`, `DigitalBrainNames.MasterKey*`, `IIdentity.CanAccessAsync`.
- **To `DigitalBrain.Aspire.Server`**: `DigitalBrainNames.ConfigurationFile*`.
- **To `DigitalBrain.Testing.Module`**: `BrainCompositionBuilder`, `BrainComposition`, `ModuleDraft`,
  `ModuleOptionsSlot`, `ModuleConfiguration`, `ModuleComposition`.
- **Deleted**: `Signals/ILocalSignalHub.cs` (both interfaces), `LocalSignalHub` per-observer path,
  `Signals/ModuleLoaded.cs`, `Hosting/RuntimeStartupTask.cs`, `Types/SchemaExtensions.cs`,
  `TypeCatalog.ToJson` and `McpFormKinds`, `CallerContext.IntentId` (set in one test, never read),
  `HttpSurfaces/HttpSurfaceExtensions.cs` (if D3 is yes), the four redundant usings in `ModuleOptionsSerialization`.
- **Goes with the redesign**: the 13 files listed at the top.

## 5. Cleanup list

### (a) Routine, inside the existing design, approvable as a batch

1. Delete the dead set: `ModuleLoaded` + `RuntimeStartupTask` and their two tests (`RuntimeSignalFacts`,
   `TypeSearchFacts` lines 87–89), `SchemaExtensions`, `ToJson`/`McpFormKinds` and their tests,
   `CallerContext.IntentId`, the redundant usings in `ModuleOptionsSerialization`.
2. Move the six-file composition builder to Testing.Module.
3. Move the nine Platform-internal items and `MasterKey*` into the Platform ring; `ConfigurationFile*`
   into Aspire.Server.
4. Give `Neuron<TState>` an `Exists` property and move `KernelNeuron` and the C# catalog neuron onto it.
   The 7 module neurons wait for the redesign.
5. Fold folders as in §4: `Runtime/`, `Callers/`, `Modules/`, `Http/`, `Types/`; strip `ContractCatalog`
   to the assembly and type list.
6. Rename the `DigitalBrain.Platform.Identity.Configuration` options into the namespace of wherever
   they land.

### (b) Decisions needed

- **D1. Platform surface home.** Should the whole `Platform/` surface plus `Auth/` move into
  `DigitalBrain.Platform.Contracts`, even though that assembly is script-visible today
  (`ModuleInventory.ContractAssemblies` prepends it) and the hiding would rest on `[PlatformOnly]`
  alone? *Recommendation:* yes, with the architecture test asserting that every public neuron contract
  there is `[PlatformOnly]` except `IConnectionRequests`.
- **D2. Signal delivery.** Should delivery collapse to two paths, `Watch` and the silo bus, with
  Client.Orleans dropping its in-silo `ILocalSignalHub` shortcut and going through `Watch` like every
  other caller? *Recommendation:* yes; the shortcut duplicates `Watch` for one consumer.
- **D3. HTTP seams.** Should `IHttpSurface` fold into `IHttpModule`, with the three pre-auth surfaces
  becoming anonymous endpoint groups that Platform maps before its gate? *Recommendation:* yes; three
  implementations do not justify a second seam.

## Decisions taken (grilling, 2026-10-07)

### `[PlatformOnly]` and `[PlatformAssembly]` go

The attribute did two jobs. The visibility job was dead: the vocabulary is built only from
`DigitalBrain`, `Platform.Contracts` and module `.Contracts` assemblies, and no marked type lives in any
of them. The live job was an enforcement bypass in `NeuronCallFilter` for two kinds of neuron that the
runtime had no word for.

- **P1. Visibility by assembly, not by marker.** A public `INeuron` interface in a `.Contracts`
  assembly is vocabulary, full stop. `ContractCatalog`, MCP `NeuronContracts` and
  `IdentityContractFacts` drop the attribute filters with no replacement. Both attributes are deleted.
- **P2. Deployment-scoped neurons live in the platform's own brain.** `IIntegration`
  (`integration/{id}`), `IIdentityDirectory` (one global key) and `IAspireResourceReporter` (keyed by
  app name) get keys under the `os` account's brain, which `OsApps` already seeds. The brain-scope
  rule is then universal; `CallerKind.Platform` already bypasses target enforcement in `CallFilter`,
  so platform code reaches that brain with no new rule. Verify: the directory must never be mapped
  under `BrainRoutes` (it is not today), and its grain must be callable before the `os` brain's
  kernel has been created (a key prefix needs no created brain).
- **P3. Privileged contracts are either internal or just brain-scoped.** Postgres `ITableIndex`,
  `ITableDescriptor`, `ITableLifetime` and the Aspire reporter become C# `internal` interfaces.
  `ISecrets` and `IConnectionRegistry` stay public in the Platform SDK assembly; the brain scope in
  their key plus the fact that scripts never see that assembly is the whole protection. "Who may
  call" belongs to grants and call-filter stages, never to a type marker.

### D1. Platform surface home: `DigitalBrain.Platform.Contracts`, out of the vocabulary

Hiding now rests on assembly membership alone. The 21 `Platform/` files and `Auth/` move into the
existing `DigitalBrain.Platform.Contracts` (which gains the `Microsoft.AspNetCore.App` framework
reference for `Auth/`). That assembly is removed from `ModuleInventory.ContractAssemblies`;
`IConnectionRequests`, `ConnectorKind`, `ConnectionRequested` and `ConnectionRef` move into
`DigitalBrain` itself, because a script asking for an account is vocabulary. `Platform.Contracts` then
means "what modules and the Platform ring agree on", and the architecture test asserts it is never in
the vocabulary list. No fourth ring.

### D2. Signal delivery: `Watch` and the silo bus, nothing else

`ILocalSignalHub`, `ILocalSignalFaultSink` and the per-observer pumps in `LocalSignalHub` are deleted.
Client.Orleans goes through `Watch` in-silo like every other caller. `SiloSignalBus` is the one
process-wide bus (for `OsBootService` and `ShippedAppWriteBack` until they become behaviors).

### D3. One HTTP seam: `IHttpModule`

`IHttpSurface` folds into `IHttpModule`. The three pre-auth surfaces (`BrowserLoginSurface`,
`GitHubWebhookSurface`, `GmailOAuthPrivacySurface`) become anonymous endpoint groups that Platform
maps before its gate. `UseModuleHttpSurfaces` and `HttpSurfaceExtensions` go.

### D4. The runtime owns brain-opening

Framework implements a silo-side `IDigitalBrains` over `IGrainFactory`; Client.Orleans wraps the
cluster client the same way. Aspire.Server stops registering the client into the silo. Its own task,
after D2.

### D5. One namespace

Everything in Framework is `DigitalBrain.Framework`. Folders (`Runtime/`, `Callers/`, `Modules/`,
`Http/`, `Types/`) are documentation; the `Enforcement` sub-namespace and its ~40 usings go.

### D6. Routine batch approved

§5a items 1–6 as written, including `Neuron<TState>.Exists` and moving `KernelNeuron` and the C#
catalog neuron onto `Neuron<TState>`.

### D7. `SemanticType` stays

`TypeCatalog` and `SemanticType` with its six enums keep their shape; shrinking them is a module
change (Supabase read policy, Flutter form), not Framework structure.

### D8. Delivery order, one PR each on `framework-cleanup` after #169 merges

1. Routine batch (§5a).
2. P1–P3: attribute removal, `os`-brain keys for deployment neurons, internal interfaces.
3. D1: Platform surface move (carries no attributes because 2 came first).
4. D2 + D4: signalling collapse, then runtime-owned brain-opening.
5. D3: HTTP seam fold.
6. D5 namespace flattening rides with whichever PR last touches a folder; no standalone rename PR.

## Left open on purpose

- `OsBootService` and `ShippedAppWriteBack` react to signals from a host service, not a behavior. The
  silo bus survives only because of them; cross-brain subscription is an open design front, not this
  cleanup's.
- `IIdentity` is consumed by Gmail (`HasGrantAsync`/`CurrentPrincipal`); D1 moves it as a contract
  rather than deleting it.
- Architecture test `PersistedStateFacts` still names `DigitalBrain.Framework.BrainState`, which no
  longer exists (stale on master, not part of this cleanup).
