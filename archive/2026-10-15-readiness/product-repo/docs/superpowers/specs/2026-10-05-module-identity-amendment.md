# Module identity: one mechanism, one ring, one grammar

> Superseded in part by [2026-10-05-framework-restructuring](2026-10-05-framework-restructuring.md):
> `DigitalBrain.Contracts` dissolved into the `DigitalBrain` vocabulary and `DigitalBrain.Framework`
> (ex-Kernel); `Module`/`Configure(ISiloBuilder)` now lives in the Framework, `ModuleId` and
> `IModuleOptions` in the vocabulary. The module-identity decisions below stand.

Ratified 2026-10-05 (implemented on branch `os`; §7 as amended by the execution rulings noted
inline). Amends the 2026-10-04 module self-description design. That design's goals
stand — one source per fact, the catalog is the composition, the AppHost speaks only
deployment. This amendment replaces its *mechanism* and extends it to the two places the same
disease was found afterwards: the Contracts/Kernel split of the module concept, and the AI
module's private configuration channel.

## The one rule

Every problem this amendment fixes is the same rule violated in a different place:

> **A fact is declared in the ring that owns it, as a typed reference. Strings exist only at
> the configuration boundary, under the one grammar.**

Three sightings:

1. **Attributes** (`[ModuleId]`, `[ModuleHosting]`, `[ModuleDeployment]`): hosting and
   deployment facts declared on the module, which cannot reference those rings — so typed links
   were flattened to assembly-qualified name strings, paid for with `Assembly.Load`,
   `Type.GetType`, a four-way error taxonomy, exception-as-control-flow for absent packages,
   and an id cross-check because the hosting adapter already states its module a second time.
2. **Contracts vs Kernel**: `IModule` stranded in Kernel by one signature
   (`Configure(ISiloBuilder)`) while Kernel's Orleans.Server dependency is radioactive to module
   Contracts projects and `Aspire.Hosting` — so every other module fact (`IModuleOptions`,
   `DigitalBrainConfiguration`, `ModuleIdentity`, the attributes) leaked down into
   `DigitalBrain.Contracts` one by one, turning it into an overflow bucket and splitting one
   concept across two assemblies on a dependency accident, not on meaning.
3. **AIOptions**: a hosting declaration (`Hosting.Llms/Embeddings` — which models to provision)
   living inside runtime options, model references flattened to marker-name strings resolved by
   `FindByMarkerName`, a `Validate()` that reaches across rings into the model catalog, a private
   configuration root (`DigitalBrain:AI` + eleven hand-built key constants) beside the one
   grammar, and `CopyFrom` plumbing to service the side channel.

## Design

### 1. `ModuleId` — one grammar owner

A `readonly record struct ModuleId` in `DigitalBrain.Contracts`, next to
`DigitalBrainConfiguration`: valid by construction (ASCII letters, digits, hyphens),
`ToString()` is the value. `DigitalBrainConfiguration.ModuleSection` / `ModuleOptionsSection` /
`CompositionModuleOptionsSection` take `ModuleId`. The ad-hoc id validation inline in
`DigitalBrainBuilder.Register` is deleted — the grammar lives in one place, like the
configuration key grammar.

### 2. `Module` is an abstract class, whole, in `DigitalBrain.Contracts`

```csharp
public abstract class Module
{
    protected Module(ModuleId id) => Id = id;
    public ModuleId Id { get; }
    public abstract void Configure(ISiloBuilder silo);
}

public abstract class Module<TOptions> : Module where TOptions : class, IModuleOptions, new() { … }

public sealed class ClickHouseModule() : Module<ClickHouseModuleOptions>(new ModuleId("clickhouse")) { … }
```

A module cannot exist without an id and the id cannot change after construction. No attribute,
no static, no reflection, no fallback. `IModule`/`IModule<TOptions>` are replaced wholesale.

**It lives in Contracts, not Kernel.** `ISiloBuilder` is defined in Orleans.Core.Abstractions,
which Contracts already references; the Orleans.Server dependency belongs to Kernel's runtime
machinery, not to the module declaration. With `Module` beside `ModuleId`, `IModuleOptions` and
`DigitalBrainConfiguration`, the module's whole self-description lives in one ring: Contracts is
genuinely the shared language ring its description claims ("Kernel module contracts"), and
Kernel is purely the runtime that executes it (grains, signal bus, composition machinery).
Nothing about the Contracts-below-Kernel boundary changes; the stranded half moves to the right
side of it.

### 3. The catalog holds instances; the instance is the descriptor

Modules are stateless configurators, cheap to construct. `OsCatalog.Modules` becomes
`IReadOnlyList<Module>`:

```csharp
public static readonly IReadOnlyList<Module> Modules = [new PostgresModule(), new ClickHouseModule(), …];
```

`module.Id` replaces `ModuleIdentity.Get`, `module.GetType()` replaces the `Type` list, the
instance replaces every `Activator.CreateInstance` factory. Registration, the server builder,
composition tests, options serialization and the test builders all consume `Module` instances.
Ad-hoc test modules go through the same door: construct one.

### 4. Hosting and deployment claim their module through a generic parameter

The adapter's generic argument is the module↔ring link — a compiler-checked project reference
the ring already has:

```csharp
public abstract class ModuleHosting<TModule> : IDigitalBrainModuleHosting where TModule : Module, new()
{
    public ModuleId Module { get; } = new TModule().Id;
    public abstract void Configure(DigitalBrainBuilder brain);
}

public sealed class ClickHouseModuleHosting : ModuleHosting<ClickHouseModule> { … }
```

Same shape for `ModuleDeployment<TModule>` implementing `IDigitalBrainModuleDeployment`.
Disagreement between adapter and module is unrepresentable, so the `hosting.Id != id`
cross-check in `Register` is deleted.

### 5. Discovery is a scan of referenced assemblies, not `Assembly.Load` by name

- **AppHost**: unchanged — it instantiates hosting adapters explicitly (`WithHosting<THosting>()`),
  per the ratified design. `WithModule(Type)` on `DigitalBrainBuilder` is deleted with the
  attribute it read.
- **Testing ring**: one small scanner enumerates the test host's referenced assemblies for
  `IDigitalBrainModuleHosting` implementations and indexes them by `Module`. A composed module
  with no adapter in scope gets none — the same absent-package-is-not-an-error semantics as
  today's `FileNotFoundException` catch, without exceptions as control flow.
- **Deployment ring**: `Discover` scans the deployment program's referenced assemblies for
  `IDigitalBrainModuleDeployment` and filters to the composed module ids, replacing both
  `Type.GetType` string round-trips. A composed module whose deployment contributor is not
  referenced fails loudly, as today.

Both scans walk the referenced assemblies of a known root (the test host, the deployment
program), never `AppDomain.CurrentDomain` — deterministic and fast.

### 6. Options purity: `Validate()` validates its own values, nothing else

`IModuleOptions.Validate()` checks ranges, required fields and internal consistency — never
another ring's catalog, never a hosting declaration. A validation that needs another ring's
knowledge belongs in that ring, at its typed declaration site, where the error is a compile
error or a bind-time failure in the ring that owns the fact.

### 7. No module is exempt from the grammar

`DigitalBrainConfiguration` is the only configuration grammar; `DigitalBrain:Modules:{id}:Options`
is every module's home, with no private roots beside it. Concretely, for AI:

- `AIOptions.SectionName = "DigitalBrain:AI"` and its eleven derived key constants are deleted;
  AI options bind under `DigitalBrain:Modules:ai:Options:*` like every other module. Key
  constants that other code genuinely needs are expressed through
  `DigitalBrainConfiguration.ModuleOptionsSection(AIModule id)`, not by string concatenation.
- `AIOptionsRuntime`'s dual bind (module options, then the private section overlaid) collapses
  to the single standard bind; `CopyFrom` dies with the side channel.
- **Execution ruling (supersedes the draft's "move `Hosting` out of options"):** the ratified
  2026-10-04 design keeps model picks as typed AppHost/E2E code, and the E2E override channel
  (`ConfigureModule<AIModule, AIOptions>`) flows through compiled settings — configuration is
  the system's one value channel. So hosting declarations stay **typed at the declaration
  site** (the `AIOptions.WithLlm<TModel>` extension family, resolving markers at write time),
  travel as configuration under the module's section, and are resolved **loudly once at bind**
  in `AIModuleHosting` (errors name the marker and the catalog). `AIOptions.Validate()`'s
  cross-ring checks are deleted; the caller-less parallel typed API on
  `DigitalBrainModuleBuilder<AIModuleHosting>` is deleted. The same shape is confirmed
  conformant for ClickHouse, Flutter and Postgres.
- `AIProviderOptions` is re-checked against the "no secrets in options" rule; provider
  credentials belong to the integrations registration.

## Deleted

`ModuleIdAttribute`, `ModuleHostingAttribute`, `ModuleDeploymentAttribute`, `ModuleIdentity`,
`ModuleHostingResolution`, `IModule`/`IModule<TOptions>` (replaced by `Module`), the id grammar
check and adapter/module cross-check in `Register`, `WithModule(Type)`, the `Type.GetType`
lookups in deployment discovery, every `Activator.CreateInstance(moduleType)`,
`AIOptions.SectionName` and its key constants, `AIOptions.CopyFrom`, `AIOptions.Validate()`'s
catalog checks, the caller-less `DigitalBrainModuleBuilder<AIModuleHosting>` model API, every
module's private configuration root (`DigitalBrain:AI`, `:Workspace`, `:Apps`, `:ShippedApps`,
`:CSharp`, `:Microsoft:GitHub`, `:Microsoft:Aspire`, `:Salesforce:OAuth`, `:Flutter:Hosting`,
`:Time`). Enforced permanently by `ModuleKeyGrammarFacts` (module keys live under
`DigitalBrain:Modules:`) and refused at startup by `LegacyConfigurationGuard` in the OS.
Platform-owned exceptions, by review: Postgres `DigitalBrain:Capacity:Postgres:AdminConnection`
and Flutter `DigitalBrain:Owner`.

## Trade-off accepted

The instance-based id surfaces a duplicate or malformed id at construction/registration time,
not compile time. That is the first line of every test run and host startup — the same moment
configuration-grammar violations surface — and is accepted for the concept count it buys.

## End state

One mechanism: a module is an object that knows its name; every ring either holds the object or
names it through a generic parameter; every value travels the one configuration grammar under
the module's section; options validate themselves and nothing else. The only strings in the
system are the ids and the configuration values themselves.

## Connector credential boundary (2026-10-05 amendment, #165)

Connectors declare supported auth methods and required/optional Integrations. Platform binds
scoped async handles per module before offering a connector. Modules receive trust and cannot
construct platform callers or read deployment credentials from configuration. User Connections
hold SecretRefs per brain at `/brains/{id}/connections`; the offered catalog is `GET /connectors`.
Deployment provisioning remains under `DigitalBrain:Integrations:{id}:*` and is Platform-only.
Integrations are what the deployment provisions; Connections are what users authorize.
