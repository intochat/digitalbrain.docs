# Framework restructuring — ratified 2026-10-05

## The finding

The repo carried two layering systems for one boundary. The boundary that matters — *scripts
never see the credential ring* — is enforced at runtime: contract discovery
(`ModuleInventory.ContractAssemblies` + `ContractVocabulary`), `[PlatformAssembly]` on the
credential implementation, `[PlatformOnly]` per contract. The eight-project compile-time lattice
(`DigitalBrain` → `Contracts` → `Kernel` → `Kernel.AspNetCore` → `Sdk` → `Platform.Contracts` →
`Platform` → `OS`) pretended to be that boundary but enforced nothing, so every concept smeared
across rings (Integrations over four projects, Data over three, IntentContext halved).

## The principle

One package per consumer. The runtime enforces the boundary; the project graph mirrors the
audiences:

| Package | Consumer | Contents |
|---|---|---|
| `DigitalBrain` | scripts (via ScriptContracts), module `*.Contracts`, Clients | the four words + Data, Types, Signals, Edge.V1, Integrations refs, Enforcement shapes, names, configuration grammar, `ModuleId`, `IModuleOptions`, platform attributes |
| `DigitalBrain.Framework` | module authors | neuron runtime, `Module` declaration (`Configure(ISiloBuilder)`), composition, enforcement machinery, http surface, sdk helpers, platform-facing interfaces (`ISecrets`, `ConnectorDefinition`, `IntegrationSchema`, `IModuleIntegrations<TModule>`, identity options) under `DigitalBrain.Framework.Platform.*` |
| `DigitalBrain.Platform` | host composers only | credential-ring implementation; `[PlatformAssembly]`-marked |
| `DigitalBrain.Client` / `.Client.Orleans` | external apps | unchanged; vocabulary-only dependencies |

The product/framework line runs **above** Platform: `DigitalBrain.OS`, `DigitalBrain.AppHost`,
`src/IntoChat` and the Flutter shell are the product; everything above is the framework a third
party could compose their own brain from.

Rules the migration locked in (guarded by `BoundaryFacts` + `ExtractionFacts`):

- The vocabulary never references Orleans hosting; `Module.Configure` lives in the Framework.
- Module declarations live in module **runtime** assemblies; `*.Contracts` assemblies reference
  only the vocabulary (and each other).
- Nothing below the OS references the Platform implementation; module code reaches credentials
  only through the Framework's platform-facing interfaces.

## Deferred product-string leaks (named violations, each needs its own change)

1. `"intochat.account"` / `"intochat.brain"` identity claims (Platform) — baked into issued
   cookies; needs a dual-read window.
2. `"intochat-identity-directory"`, `"intochat-grants-"` neuron ids (Framework platform surface)
   — persisted state; needs a data migration.
3. `"x-intochat-*"` schema extension keys (Framework `SchemaExtensions`) — wire format shared
   with the Flutter shell; rename both sides together.

`"intochat.caller-context"` (transient Orleans RequestContext key) was renamed to
`"digitalbrain.caller-context"` in this migration.

## Amendment (2026-10-05, later the same day): the shadow OS is deleted

`DigitalBrain.Testing.E2E` used to maintain a parallel OS — a hand-copied module list
(`ReferenceBrain`), a second host program (`ModuleHostProgram`) and a type-name config side
channel (`ModuleHostChannel`) — glued to the real one by a drift test. All of it is gone. Every
E2E suite now boots the real AppHost through `E2ETest.For<Projects.DigitalBrain_AppHost>()`
with test needs expressed as ordinary configuration overrides; the reference brain is the
product boot minus shipped content plus its own cookie, and lives in the non-packable
`DigitalBrain.Testing.Reference` project. `DigitalBrain.Testing.E2E` is a pure harness with no
module, OS or AppHost reference — `PackedCompositionFacts` green is the proof it is
publishable.

## Pre-existing reds discovered and not caused by this work

- `AppDraftFacts` (12 tests): "Private settings cannot override host-owned configuration" —
  reproduced at a768af559, before any restructuring commit. Follow-up task spawned.

## Connector credential boundary (2026-10-05 amendment, #165)

Connectors declare supported auth methods and required/optional Integrations. Platform binds
scoped async handles per module before offering a connector. Modules receive trust and cannot
construct platform callers or read deployment credentials from configuration. User Connections
hold SecretRefs per brain at `/brains/{id}/connections`; the offered catalog is `GET /connectors`.
Deployment provisioning remains under `DigitalBrain:Integrations:{id}:*` and is Platform-only.
Integrations are what the deployment provisions; Connections are what users authorize.
