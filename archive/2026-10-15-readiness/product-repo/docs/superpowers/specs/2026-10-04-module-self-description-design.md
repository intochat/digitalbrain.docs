# Module self-description: the catalog is types, the image is the composition

Ratified 2026-10-04. Follows the AppHost/OS rename (IntoChat.AppHost → DigitalBrain.AppHost,
DigitalBrain.OS library + DigitalBrain.OS.Host → one DigitalBrain.OS executable).

## Problem

The OS module composition is transcribed in six places that must agree by hand: `OsCatalog`'s
`(string, Type)` tuples, the AppHost's 20-call `WithModule` chain, the Dockerfile `Enabled` ENV
block, `Container.pubxml`'s variable list, the Testing ring's `ModuleHostingAdapters` type→adapter
map, and the `[ModuleId]` attributes the modules already carry. `PathTruthFacts` glue-tests some of
these agreements; nothing checks the rest. The AppHost's `WithModule` conflates three questions —
composition (which modules exist), infrastructure (what backs them in this deployment), and options
(plain configuration values) — and whether a module is named by string or by type is decided by a
packaging accident (does an `*.Aspire.Hosting` package exist), not by design.

## Design

### 1. A module describes itself, fully, on its type

The module class is the single home of every cross-ring fact about the module:

- `[ModuleId("postgres")]` — exists today on all 20 catalog modules.
- `[ModuleDeployment("PostgresDeployment, …")]` — exists today; resolved by name in the
  deployment ring.
- `[ModuleHosting("PostgresModuleHosting, DigitalBrain.Modules.Postgres.Aspire.Hosting")]` — new,
  same soft-reference pattern as `[ModuleDeployment]`: a string type name, so runtime assemblies
  never reference AppHost-side packages. Resolution instantiates the named
  `IDigitalBrainModuleHosting` when the assembly is present and returns null when it is not
  (a host that composes the module without its infrastructure package gets no adapter).
  A module with no external infrastructure carries no attribute.

A shared resolver (kernel, next to `ModuleIdentity`) answers id-from-type and hosting-from-type.
`ModuleIdentity.Get` throws on a missing `[ModuleId]`; that is the registration-time check.

### 2. OsCatalog is a list of types

`OsCatalog.Modules` becomes `IReadOnlyList<Type>`. Ids are derived through `ModuleIdentity`
everywhere; the tuple strings are deleted. `ModuleHostingAdapters` in the Testing ring is deleted;
test hosts resolve adapters from `[ModuleHosting]`.

### 3. The OS enables its catalog by default

`DigitalBrainServerBuilder` registers modules by type. `AddOperatingSystem()` enables every
catalog module unless configuration says `DigitalBrain:Modules:{id}:Enabled=false` — the override
survives, inverted. `SelectModules` stops requiring an affirmative flag for registered modules
(explicitly registered non-catalog modules keep the opt-in flag semantics they have today only if
a host adds modules outside `AddOperatingSystem`; the OS image itself has none).

Deleted as a consequence: the Dockerfile `DigitalBrain__Modules__*__Enabled` ENV block, the
`Container.pubxml` `ContainerEnvironmentVariable` module list, the per-module `Enabled=true`
env-var projection in `DigitalBrainHostingExtensions.WithReference`, and the
`PathTruthFacts.ContainerModuleListsAgreeAndResolve` list-agreement test. The image is the
composition.

### 4. The AppHost speaks only deployment

The AppHost no longer makes composition claims; it cannot even read the catalog (which lives in
the OS executable) and does not need to. `DigitalBrainBuilder`:

- `WithModule(string)` and `WithModule<THosting>()`-as-composition are deleted.
- What remains is infrastructure configuration: the AppHost instantiates hosting adapters for the
  infrastructure it provisions (`Postgres`, `Qdrant`, `AI` model picks, `RunDesktopApp()`…),
  keyed by adapter type. An adapter the AppHost does not mention provisions nothing; the module
  still runs in the silo and reads whatever configuration reaches it.
- Scalar option values move out of AppHost code into `appsettings.json` under the existing
  `DigitalBrain:Modules:{id}:Options:*` keys (e.g. Postgres `DatabaseName`, AI
  `EnableSensitiveData`, Flutter `AssistantTitle` — closing the "no configuration binding in the
  silo" gap for `FlutterModuleOptions` is part of this). Typed option lambdas in the AppHost
  remain only where the value is a deployment *decision with code shape* (model interface picks).

The silo-side env projection of compiled module settings (`brain.Settings`) survives: it carries
infrastructure outputs (connection strings, endpoints), not composition.

## Consequences

- One source per fact: id on the type, composition in `OsCatalog`, infrastructure in the AppHost,
  values in configuration.
- The typed/untyped `WithModule` asymmetry disappears with `WithModule` itself.
- Tests and product compose through the same path (`AddOperatingSystem`, attribute-resolved
  adapters); module test hosts keep selecting subsets by type.
- The deployment ring is untouched: `[ModuleDeployment]` discovery already works this way.

## Out of scope

Docker/NuGet release pipelines, the IntoChat de-branding of the OS image (separate step), and any
change to module runtime contracts.

## Connector credential boundary (2026-10-05 amendment, #165)

Connectors declare supported auth methods and required/optional Integrations. Platform binds
scoped async handles per module before offering a connector. Modules receive trust and cannot
construct platform callers or read deployment credentials from configuration. User Connections
hold SecretRefs per brain at `/brains/{id}/connections`; the offered catalog is `GET /connectors`.
Deployment provisioning remains under `DigitalBrain:Integrations:{id}:*` and is Platform-only.
Integrations are what the deployment provisions; Connections are what users authorize.
