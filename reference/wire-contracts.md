# Wire contracts

DigitalBrain persists Orleans state, journal entries, outbox rows, identities, and module records.
The string passed to `[Alias(...)]` and every serialized `[Id(n)]` therefore outlive a C# refactor.
They are compatibility contracts, not formatting preferences.

## Alias families in current source

| Family | Current ownership and examples |
| --- | --- |
| `db.*` | Kernel identity/runtime/workspace/graph vocabulary: `db.owner-id`, `db.neuron-id`, `db.synapse-delivery`, `db.connect`, `db.workspace.*` |
| `db.execution*` | Execution contract and persisted runtime rows: `db.execution`, `db.execution.start`, `db.execution.operation-snapshot`, `db.execution.outcome-uncertain` |
| `chat` / `chat.*` | Current UI-owned chat identity, commands, transcript, turns, results, and lifecycle |
| `ui.*` | Buttons, charts, diagrams, notes, surfaces, and control facts |
| `timer` / `time.*` | Timer neuron plus start/cancel/scheduled/elapsed/cancelled/snapshot vocabulary |
| `DigitalBrain.Memory.*` / `memory.*` | Vector-memory neuron contract plus store/search/remove results and namespace/status records |
| `introspection` / `introspection.*` | Introspection neuron plus journal/topology request and result records |
| `DigitalBrain.AI.*` / `ai.*` | Agent/model neuron interfaces and orchestration facts |
| `mcp*` / `db.mcp.*` | Generic MCP and authorization neurons, tool calls/results, OAuth claims and durable state |
| `db.webhook.*` | Verified ingress, accepted/duplicate/conflict facts, and ingress state |

Aliases are not normalized into one new namespace. Existing historical shapes—including CLR-like
AI and Memory interface aliases—remain permanent exactly as written.

Provider MCP tool names are a different namespace owned by the remote server's live catalog. A
Gmail or Salesforce tool appearing in `tools/list` is not automatically a persisted DigitalBrain
alias. Provider-owned neuron/synapse interfaces belong in their permanent Contracts assembly;
Salesforce Contracts is retained even while the current provider path uses the generic MCP rail.

## Deterministic identity

| Type | Representation and role |
| --- | --- |
| `OwnerId` | Validated non-empty string selecting one installed brain/workspace; local AppHost uses `dev`. |
| `PrincipalId` | Non-empty GUID identifying one authenticated user; string form is 32 lowercase hex digits. |
| `ActorContext` | Durable `PrincipalId` plus username stamp attached to user-originated work. |
| `NeuronId` | `(type, owner, name)`; type is lowercased, grain key is `{owner}/{name}`, display form is `{type}:{owner}/{name}`. |
| `CommandId` | Non-empty GUID supplied/generated for domain command dedupe; string form is 32 lowercase hex digits. |
| `CorrelationId` | Non-empty GUID grouping one causal flow across deliveries. |
| `SynapseId` | New non-empty GUID for one immutable delivery fact; a child delivery records its cause's SynapseId. |

Owner and neuron-name parts cannot contain `/` or whitespace because `/` is the deterministic grain
key separator. Where the HTTP edge exposes a local chat/surface name, it first rewrites it as
`{principal:N}.{local}` and then forms the owner/name grain key. The logical AppHost owner key is
not a principal and cannot substitute for authentication.

`NeuronId.For<TNeuron>` resolves grain type from an explicit `[GrainType]` when present; otherwise
it derives the interface/class name by removing the leading interface `I` or trailing `Grain`.
Changing that resolution for an existing contract changes identity and requires migration analysis.

## Delivery identity

A `SynapseDelivery` serializes these numbered fields:

| Field ID | Value |
| --- | --- |
| `0` | Immutable synapse payload |
| `1` | `SynapseId` |
| `2` | `CorrelationId` |
| `3` | Optional causation `SynapseId` |
| `4` | Caller `NeuronId` |
| `5` | Caller-local outgoing sequence |
| `6` | Timestamp |

The receiver's journal wraps that delivery with its own journal sequence. Do not confuse a journal
cursor, caller-local delivery sequence, command identity, correlation identity, or synapse identity;
each answers a different replay/idempotency question.

## Compatibility rules

For an existing persisted contract:

1. Never rename, remove, or reuse an alias.
2. Never reorder or reuse a serialized field ID.
3. Add optional fields only with new IDs and backward-compatible defaults; otherwise introduce an
   explicit new contract/version and a migration.
4. Preserve grain type and owner/name encoding for existing neuron identities.
5. Treat interface and method aliases as wire surface, including aliases expressed with
   `nameof(...)`.
6. Keep generated partial neuron interfaces when required by source generation. The prohibition is
   on handwritten partial implementation classes, not generated contract wiring.
7. Review changes against journals, outbox payloads, protected state, Flutter JSON projection, MCP
   records, and any external persisted store—not only against current C# callers.

Moving a type between projects or renaming its C# symbol can be compatible when its alias, field IDs,
grain type, and semantics stay unchanged. Reusing an old alias for a different meaning is never a
cleanup.

## Source owners

- [Kernel identities and synapses](https://github.com/intochat/digitalbrain/tree/master/src/Kernel/DigitalBrain.Abstractions)
- [Kernel journal and outbox runtime](https://github.com/intochat/digitalbrain/tree/master/src/Kernel/DigitalBrain.Core)
- [Module contract assemblies](https://github.com/intochat/digitalbrain/tree/master/src/Modules)
- [UI Flutter wire snapshot](https://github.com/intochat/digitalbrain/blob/master/src/Modules/UI/DigitalBrain.Modules.UI.Contracts/flutter-wire-contracts.golden.json)

## Product state

**Implemented now.** The alias families, field IDs, deterministic neuron keys, principal scoping,
and delivery identity described here are present in committed source and persisted by Orleans.

**Known limitation.** There is no automated compatibility gate in the current no-test phase. Every
wire-affecting change requires source inventory and adversarial migration review.

**Ratified next.** Final hardening adds module-owned compatibility tests beside each contract owner.
Future Conversation and Behavior contracts receive new aliases; they do not repurpose current chat,
Execution, UI, or provider aliases.
