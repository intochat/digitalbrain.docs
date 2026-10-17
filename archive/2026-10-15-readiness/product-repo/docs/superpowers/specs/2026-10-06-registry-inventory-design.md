# IRegistry: the brain inventory as a federation of domain truths

Ratified 2026-10-06, revised the same day after the Task 0 feasibility gate
(`docs/superpowers/plans/2026-10-06-registry-inventory-gate.md`) disproved the
storage-catalog grounding. This revision supersedes the catalog design in full.

## Why there is no central catalog (the gate's lesson)

Three designs tried to recover "what does this brain contain" from a side channel, and
each failed for the same structural reason:

1. **Observed activations** (the deleted Registry ledger): mirrors the runtime cache —
   answers "what was touched," not "what exists."
2. **Birth signals → inventory neuron**: mirrors durable state — a second copy with
   read-model repair as permanent upkeep.
3. **The storage catalog** (the previous revision of this spec): assumes storage is an
   index. The gate proved it is not, on every axis: the production Azure Blob provider
   and the test memory provider expose point operations only, blob names put the state
   name before the grain identity so no brain-prefix query exists, and — decisively —
   C# file keys hash the brain scope away by design (`app-csharp-sha256(...)`). Brain
   scope is an *input to identity*, not a queryable attribute of it.

The storage layer is a deliberately opaque KV substrate; Orleans grains are virtual.
There is no catalog underneath, and building one means building a mirror — the disease
the Registry module was deleted for.

## The principle: ownership lives in the aggregates

Every domain already keeps its own membership index, because it needs one to function:
`AppState.StorageFiles` (the App grain tracks its hashed file keys precisely because
nothing else can recover them), the per-brain `IApps` package index, the per-brain
`ConnectionsNeuron`, Time's reminder registrations. Ownership was modeled all along —
**federated across the aggregates that own it, never centralized**. "What is in my
brain" is the union of per-domain answers. Any design that relocates membership
knowledge away from the owning neurons violates "state lives in neurons."

## The contract (Framework ring)

```csharp
namespace DigitalBrain.Framework;

// Injectable by any module that references the Framework. Scope always comes from the
// kernel-stamped ambient caller; cross-brain enumeration is impossible by construction.
public interface IRegistry
{
    // The union of every registered domain's answer for the ambient brain.
    Task<RegistryInventory> Persisted(string? typeId = null, CancellationToken ct = default);
    Task<RegistryInventory> Active(string? typeId = null, CancellationToken ct = default);
}

[GenerateSerializer, Alias("registry.inventory")]
public sealed record RegistryInventory(
    [property: Id(0)] NeuronRecord[] Records,
    [property: Id(1)] string[] Domains,              // every domain that answered
    [property: Id(2)] RegistryDiscoveryError[] Errors); // domains that failed, named

[GenerateSerializer, Alias("registry.neuron-record")]
public sealed record NeuronRecord(
    [property: Id(0)] string Domain,     // owning provider id, e.g. "time"
    [property: Id(1)] string TypeId,     // grain type id, e.g. "reminder"
    [property: Id(2)] string Key,        // grain key (may be opaque; Domain gives it meaning)
    [property: Id(3)] string Display);   // human name the domain chooses, e.g. "standup 9:00"
```

- `Domains` + `Errors` make silence legible: an empty result names who was asked, so
  "no reminders" is distinguishable from "Time did not answer."
- `IRegistry` is a DI service, not a neuron contract: scripts cannot see it. A
  script-facing door is a separate, future ratification.
- The CLR name is free (the old module's `IRegistry` was deleted with #148); the records
  are wire shapes only, nothing is persisted by the Registry itself — ever.

## The provider seam (Framework ring)

The existing `IRegistryResourceProvider` seam grows the inventory surface (or a sibling
`IRegistryInventoryProvider` if capability discovery and inventory prove awkward in one
interface — implementer's choice, one interface per concern, no third concept):

```csharp
public interface IRegistryInventoryProvider
{
    string Domain { get; }
    // Both answer for the ambient brain, from the domain's own authoritative state.
    Task<NeuronRecord[]> Persisted(string? typeId, CancellationToken ct);
    Task<NeuronRecord[]> Active(string? typeId, CancellationToken ct);
}
```

- **Persisted** reads the domain's existing aggregate state (Apps: the `IApps` index +
  each app's `StorageFiles`; connections: the registry neuron; Postgres: table
  ownership; CSharp: standalone files it indexes). For most domains this is a read view
  over state that already exists — zero new state.
- **Active** is the domain's own keys intersected with the runtime census: a
  Platform-internal census service (`IManagementGrain` detailed grain statistics) is
  available **to providers**, which map activations to their brain because only they can
  (they own the key material). The census is never exposed as a user-facing catalog.
- The Platform implements `IRegistry` by fanning out to registered providers,
  concatenating records, and reporting per-domain errors without failing the union.

## The coverage rule (module contract)

**A module that owns enumerable per-brain state ships its inventory provider** — the
same category of obligation as shipping fakes and renderables. This is architecture,
not bookkeeping: the provider exposes an index the domain already maintains for its own
lifecycle. Where a domain genuinely lacks a listing (Time's reminders), the small index
it adds is one it needed for its own UX anyway. CLAUDE.md gains one sentence to this
effect.

Initial coverage: Apps (installed apps + their files), Connections, CSharp (standalone
files), Postgres (tables), Time (timers + reminders). Flutter windows and GroupChat
threads may follow; absence shows up honestly in `Domains`.

## Consumers

- **Assistant**: inventory tools (`list_neurons`, `list_active_neurons`, per-type asks)
  over injected `IRegistry`, composing with existing capability discovery for rich
  status (armed, next fire) — which is just the domain reading its own neurons.
- **Any module referencing Framework**: inject `IRegistry` — the requirement this
  design serves.
- **Shell**: a later `/brains/{id}/registry` HTTP surface; out of scope here.

## Explicitly rejected

- Central catalogs in any form: activation ledgers, birth-signal mirrors, storage
  scans, key-parsing conventions. The Task 0 gate evidence is the standing rationale.
- A mandatory uniform key grammar for brain scoping (hashed keys are a feature).
- Any state persisted by the Registry or its providers beyond what domains already own.

## Implementation rulings

- The sibling `IRegistryInventoryProvider` keeps membership separate from capability discovery.
  `Domains` includes every provider asked, including failures. Provider failures use a generic
  message so exception diagnostics cannot leak credentials. Caller cancellation still cancels
  the operation; it is not presented as a domain outage.
- Each Registry Active request owns one transient census snapshot captured before any domain
  queries. Providers read that request's snapshot, so one provider's membership reads cannot
  activate a grain before another provider samples it. The snapshot (or its error) is scoped to
  that async request and discarded at completion; nothing is cached across requests. Direct
  provider calls still obtain a fresh census. `ActivationRecord` is an in-process type/key pair,
  not a serialized user-facing contract. This is not a transaction across independent user
  mutations of domain membership during discovery.
- Apps reads the existing `StorageFiles` through a host-only, read-only App view. Current file
  paths are displayed where the aggregate retains their mapping; historical files retain their
  raw keys. It does not call the migration/backfill handover. Legacy unindexed installations
  remain outside the existing `IApps` membership view.
- Connections are records inside a single per-brain `connections` grain, not individual grains.
  Each connection record therefore reports the owning aggregate's type/key, with connector/id
  as Display; Active means that aggregate is active. No credential or SecretRef is projected.
- CSharp has an existing durable `CSharpCatalogStore` authoring catalog. Its provider reads that
  catalog and derives keys using CSharp's existing identity function. Direct grain callers that
  bypass authoring are outside coverage; app-owned files are covered by Apps. No index was added.
- Postgres uses its existing installed-app resource/ownership service. Direct and legacy owners
  without an installed-app membership path remain outside this view. Resource-description
  failures become a domain error rather than a silently incomplete successful answer.
- Time uses the existing `Start`/`Stop` contracts for the plan's Set/Arm/cancel lifecycle. Its
  small index records schedule intent before registration, idempotently by type/key. Index
  failures are logged and cannot block scheduling or cancellation; failed registration or
  cleanup can leave stale intent. Timers retain activation-local scheduling semantics; this
  index does not turn timers into durable schedulers. Unstamped runtime/deployment starts have
  no ambient brain and are outside the per-brain index. No additional per-neuron persisted
  ownership state, signals, or central inventory are introduced. Existing unscoped Time key
  semantics are unchanged; the index does not add ownership enforcement to the scheduling API.

Verification notes and task status are recorded in the implementation plan.
