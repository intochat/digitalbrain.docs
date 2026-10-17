# IRegistry implementation plan (federation revision)

Spec: `docs/superpowers/specs/2026-10-06-registry-inventory-design.md` (the 2026-10-06
federation revision — the storage-catalog design it replaces was disproved by the Task 0
gate, evidence in `2026-10-06-registry-inventory-gate.md`; that gate's outcome is final,
do not re-probe storage). Branch `os`. Each task is TDD (facts first), per-project
builds/tests, never the .slnx.

## Execution status

- [x] Gate — storage-catalog grounding disproved; design revised to federation. Closed.
- [x] Task 1 — Framework contracts (RED: 2 missing-shape facts; GREEN: Framework 116/116, Architecture 35/35)
- [x] Task 2 — Platform federation + census service (RED: missing DI registrations; GREEN: Platform 136/136, real census across two brains and deactivation)
- [x] Task 3 — Providers over existing aggregates (RED: absent providers; GREEN: Apps 117/117, Platform 137/137, CSharp 89 passed/1 live skip, Postgres 74 passed/3 live skips)
- [x] Task 4 — Time: reminder/timer listing + provider (RED: missing provider; GREEN: Time 19/19, Architecture 35/35; existing Start/Stop contracts implement Set/Arm lifecycle intent)
- [x] Task 5 — Assistant tools (RED: tools absent from scripted conversations; GREEN: Assistant 80/80)
- [x] Task 6 — Coverage rule + spec rulings + independent review; final verification: 714 unit passes / 4 live skips, Framework E2E 15/15, OS E2E 18 passes / 2 live skips, Platform E2E 2/2, Aspire E2E 1/1; Aspire smoke 38/38 Healthy. See [verification record](2026-10-06-registry-inventory-verification.md).

Final implementation revision verified in isolation: `ab8cc0e793266757cd681067200ba5ee702321d0`.
Concurrent Apps refactors in the shared `os` checkout are outside that verification claim.
Review found and fixed a cross-provider liveness race (deterministic RED then GREEN): one
transient census per Active request now precedes every provider's membership reads. Added
failure/retry and Time index-write-failure regressions; final Platform 139/139 and Time 20/20.

## Task 1 — Framework contracts

In `src/DigitalBrain/Framework/DigitalBrain.Framework/Discovery/`:
- `IRegistry` with `Persisted(typeId?)` / `Active(typeId?)` returning `RegistryInventory`.
- `RegistryInventory` (`registry.inventory`, ids 0..2: Records, Domains, Errors — reuse
  the existing `RegistryDiscoveryError` shape) and `NeuronRecord`
  (`registry.neuron-record`, ids 0..3: Domain, TypeId, Key, Display).
- `IRegistryInventoryProvider { string Domain; Persisted(typeId?, ct); Active(typeId?, ct) }`
  beside the existing `IRegistryResourceProvider` (sibling interface — do not overload
  capability discovery with inventory).
- Facts: serialization identity rows in the architecture baseline; concrete arrays.

## Task 2 — Platform federation + census service

- `PlatformRegistry : IRegistry` in `src/DigitalBrain/Platform/.../Discovery/`:
  requires the ambient kernel-stamped caller (brain is never a parameter); fans out to
  all registered `IRegistryInventoryProvider`s; concatenates Records; fills `Domains`
  with every provider asked; a provider exception becomes a named entry in `Errors`,
  never a failed union; `typeId` filter passed through to providers.
  Register `TryAddSingleton<IRegistry, PlatformRegistry>()` in PlatformHosting.
- `IActivationCensus` (Framework-declared, Platform-implemented over
  `IManagementGrain.GetDetailedGrainStatistics()`): `Task<ActivationRecord[]>
  Activations(string grainTypeId, CancellationToken)` — raw type+key pairs, no brain
  filtering (providers map keys to brains; only they can). Platform-facing service,
  never script-visible, never exposed as a user surface.
- Facts (ModuleTest, real grains): union across two fake providers; one throwing
  provider lands in Errors while the other's records survive; Domains lists both;
  unauthenticated caller refused; typeId filter reaches providers.

## Task 3 — Providers over existing aggregates (zero new state)

One provider per domain, each a read view over state that already exists:
- **Apps** (`Domain="apps"`): installed apps from the per-brain `IApps` index; each
  installed app's script files from `AppState.StorageFiles` (Display: package id /
  file path). Active: intersect `StorageFiles` + app keys with the census.
- **Connections** (`Domain="connections"`): the per-brain connection registry
  (Display: connector/connection id; no credentials, no SecretRefs in records).
- **CSharp** (`Domain="csharp"`): standalone files from its existing per-brain file
  index (verify one exists; if CSharp has no standalone-file index, limit the provider
  to what it authoritatively knows and say so in the provider's doc comment — do NOT
  build a new index in this task).
- **Postgres** (`Domain="postgres"`): tables from the ownership state it already keeps.
- Facts per provider: two brains see only their own; records match the aggregate's
  truth after install/uninstall (Apps), connect/disconnect (Connections).

## Task 4 — Time: reminder/timer listing + provider

Time is the one domain without a listing. Add the minimal per-brain index it needs for
its own UX anyway: reminders/timers self-register on Set/Arm and unregister on
cancel/final-fire, grain-side (the `IApp.Track` pattern — track before persist,
idempotent by key, read-model discipline: a missed index write stales the list, never
strands the reminder). State: concrete arrays, `[Alias]`, stable `[Id(n)]`.
Provider (`Domain="time"`): Persisted from the index with schedule Display ("standup —
fires 09:00"); Active via census intersection with its own keys.
Facts: set two reminders in brain A, one in brain B — each lists its own with schedule;
cancel removes; a reaped-and-reactivated reminder still lists (durable intent, not
activation).

## Task 5 — Assistant tools

- `list_neurons` (Persisted, optional type filter) and `list_active_neurons` over
  injected `IRegistry`; answers attribute records to domains and surface `Errors` and
  `Domains` so the model can say "Time did not answer" instead of "no reminders."
- Compose with existing capability discovery for rich follow-ups; no new neuron state.
- Facts: scripted-LLM conversation over seeded reminders + an installed app returns
  grounded, brain-isolated inventory; a throwing provider is reported, not hidden.

## Task 6 — Coverage rule + closure

- CLAUDE.md module contract, one sentence: a module that owns enumerable per-brain
  state ships its `IRegistryInventoryProvider`; the Framework's `IRegistry` federates
  them — nothing mirrors domain state.
- Spec self-review; update spec with any implementation rulings (e.g. CSharp index
  reality from Task 3).
- Run: Framework, Platform, Architecture, Apps, Time, Assistant, CSharp, Postgres, OS
  unit suites; both E2E suites; `aspire run` smoke (all resources Healthy).

## Out of scope (do not build)

Storage scans or key-grammar parsing (gate-rejected); any Registry-owned persisted
state; script-facing IRegistry; `/brains/{id}/registry` HTTP + shell screen; kernel
existence signals; Flutter windows / GroupChat providers (follow-ups); census as a
user-facing surface.
