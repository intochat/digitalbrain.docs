# Assistant and digitalbrain-mcp act through neuron contracts

Date: 2026-10-07 · Status: proposed

## Goal

A person asks the assistant "which tables are in Supabase?", then "show data from Demo", and sees the
rows in a Data Visualizer window. Claude, through `digitalbrain-mcp`, can do the same: drive the brain with
the same tools the assistant has, and talk to the assistant exactly as a person would.

## Problem

The assistant cannot reach a tool unless a two-call handshake succeeds (`discover_capabilities` →
`select_capability`). Discovery returns `Tools: []` by design; a model that stops after discovery ends
the turn with nothing. That handshake is the visible symptom of a larger duplication:

- **Three ways to show data.** Module-owned table windows with hand-written agent tools
  (`Postgres.Windows`, Supabase `ISupabaseTable` + `LiveTable*`), the Data Visualizer app built on
  behaviors, and a capability registry whose job is to steer the model towards the first.
- **Supabase copies Postgres.** `ISupabase` mirrors `IPostgresServer` (Query, ReadSchema, ReadConnection)
  with its own query/schema/column records, although a Supabase database is a Postgres database.
- **Tools are a world of their own.** `IAgentToolFactory`, `IAgentToolSource`, `AgentToolOffer`,
  `AgentToolBinding`, `RegistryCapability` and `IRegistryResourceProvider` describe what neurons and
  connectors already describe. The assistant, itself an app on behaviors, cannot use the contract surface
  that behaviors and `digitalbrain-mcp` use.

The four words already cover this: data lives in neurons, a database is reached through a connection,
showing data is an app. The design removes the parallel world.

## Design

### 1. One tool surface, shared by the assistant and digitalbrain-mcp

A single tool set is visible from the first step of every turn, with no discovery handshake:

| Tool | Behaviour |
|------|-----------|
| `neurons_search(query)` | Contracts matching an intent: type name, methods with parameter shapes, signals. |
| `neurons_list(prefix?)` | Neuron keys that exist in the current brain (connections, apps, windows). |
| `neurons_get(contract, key)` | Resolve a neuron's id. |
| `neurons_call(contract, key, method, args)` | Call a method on a neuron in the current brain. |
| `csharp_contracts`, `csharp_write`, `csharp_run` | Author and run a behavior when no contract or app covers the request. |
| `show_form`, `show_view` | Typed form window whose submitted values never reach the model. |

The tools are defined once, as `AIFunction`s:

- `NeuronContracts` (name → contract type, reflective invocation, Watch/Unwatch excluded) moves from
  `DigitalBrain.Mcp` to `DigitalBrain.Framework`, beside `NeuronTypeSearch`.
- `NeuronAgentTools : IAgentToolFactory` (Assistant module) supplies the four `neurons_*` functions over it.
- `CSharpAgentTools` and `WorkspaceFormTools` remain the factories for their tools.
- `digitalbrain-mcp` serves the composed `IAgentToolFactory` set as MCP tools
  (`McpServerTool.Create(AIFunction)`), replacing its hand-written `NeuronTools`. The assistant's turn
  receives the same set. One definition, two transports; the two cannot drift.

Apps are neurons, so app operations need no tools of their own:
`neurons_call(IApp, "{brain}/apps/datavisualizer", "Invoke", ["show", {...}])`.
The model learns the vocabulary from contract names, signatures and short contract comments, and from
`app.json` operation descriptions read through `IApp.Read`. The assistant's `prompts/system.md` carries
one recipe: search → call; to show data, invoke an app; when nothing fits, write a behavior.

### 2. Talking to the assistant through digitalbrain-mcp

Claude tests the brain the way a person uses it, through the same surface and no extra tool:

```
neurons_call(IApp, "{brain}/apps/assistant", "Invoke", ["send", "which tables are in Supabase?"])
neurons_call(IApp, "{brain}/apps/assistant", "Invoke", ["transcript", ""])
```

`transcript` returns the steps (tool calls, results, cards), so a test reads what the assistant did
as well as what it said. Windows the assistant opened are edge neurons, inspected with `neurons_list` /
`neurons_call`. Claude can also run the same steps directly (`neurons_call` on `IPostgresServer`, then on
the Data Visualizer) to tell apart "the system cannot" from "the model did not".

### 3. Scoping and security

1. **Caller.** Every call is stamped by the kernel with the real caller. In an assistant turn that is
   the assistant app (`CallerKind.App`, its brain and app key). In `digitalbrain-mcp` it is the
   authenticated session's user, or the brain-scoped scripted key. A neuron's own `Access(operation)`
   decides; tool code adds no authorization. If `AgentTurnLoop` currently runs tools as the trusted host,
   the assistant loses that privilege deliberately.
2. **Brain boundary.** `neurons_list`, `neurons_get` and `neurons_call` refuse a key outside
   `BrainScope.CurrentId()`; `digitalbrain-mcp` selects the brain with `/brains/{brainId}/mcp` as today.
3. **Reachable contracts.** Search and call cover the script-visible contracts (the `DigitalBrain` ring
   and module `*.Contracts`, as shipped by `ScriptContracts`), the same grammar behaviors compile against.
   Platform-ring contracts are never offered.
4. **Observers.** `Watch`/`Unwatch` are not callable.
5. **Sensitive values.** Form values never reach the model (`show_form` stays its own tool). Connection
   neurons return metadata only, never sealed credentials.

### 4. Databases: Supabase is a Postgres connection

A user adds their Supabase database as a connection of the **postgres** connector, named by them (for
example `supabase`), holding the Supabase connection string:

```
connection/{brain}/postgres/supabase
```

`IPostgresServer.ReadSchema` / `Query` serve it, and the Data Visualizer's `db` slot
(`connector: postgres`) binds to it unchanged. The Supabase and Postgres modules stay independent: no
reference between them and no shared library. The Supabase module keeps only what is Supabase-specific,
today the deployment backing-store tier.

### 5. Removed

| Area | Removed |
|------|---------|
| Postgres | `DigitalBrain.Modules.Postgres.Windows`, `tests/DigitalBrain.Modules.Postgres.Windows.Tests`, their entries in `OsCatalog.cs` and `DigitalBrain.slnx` |
| Supabase user surface | `ISupabase`, `ISupabaseTable` and their records/signals in `Supabase.Contracts`; `Query/SupabaseNeuron`, `Table/*`, `Windows/*` (`LiveTable*`, `TableViewTools`, `TableEndpoints`), `SupabaseRegistryResources`; tests `Query/*`, `Table/*`, `TableHttpFacts`, `TableRouteFacts`, `TableWindowToolFacts` |
| Registry | `RegistryDiscovery.cs` (Framework), `RegistryDiscoveryService`, `RegistryDiscoveryTools`, `CapabilityDiscoveryNeuron`, `ICapabilityDiscovery`, `AppsRegistryResources`, `CSharpRegistryResources`, and their tests |
| Tool plumbing | `AppAgentTools`, `RegistryInventoryTools` (folded into `neurons_list`), `AgentToolOffer`, `AgentToolBinding`, `IAgentToolSource.OpenBoundAsync`, `AgentToolContext.DatabaseSource`, `AgentToolOfferFacts`, `AgentToolSelectionFacts` |
| digitalbrain-mcp | Hand-written `NeuronTools` (replaced by the shared set) |

`IAgentToolSource` remains only for allowlisted external MCP servers (`McpAgentTools`).

### 6. Changed

- **Supabase module:** keeps `SupabaseBackingStore`, `SupabaseConnectionSettings`, `SupabaseHealthCheck`,
  options, hosting and Integration `supabase`. Its connector declares no neurons. If nothing
  user-facing remains, the connector is removed and `/connections` offers only `postgres` for databases.
- **Assistant app:** `synapses/chat.cs` tool list becomes the shared set; `prompts/system.md` is
  rewritten to the recipe; version bump.
- **Data Visualizer:** no program change.
- **Flutter shell:** Dart screens or routes that consume the removed Supabase table endpoints are
  removed in the same change.

## Plan-time checks

- How `AgentTurnLoop` stamps the caller for tool calls today (Section 3.1).
- Whether `IPostgresServer` is keyed per connection so `connection/{brain}/postgres/{id}` resolves the
  user's database; if it serves only the platform database, connection-keyed resolution is part of this work.
- Whether `IApp.Invoke` is callable by a user caller through `digitalbrain-mcp` and how the answer is
  awaited (today `AppAgentTools` polls `ReadInvocation`); the call should return the completed
  invocation, not require client-side polling.
- Whether any user-facing Supabase surface remains after removal (connector kept or dropped).

## Done

1. In a brain, add a `postgres` connection `supabase` with the Supabase connection string, and bind the
   Data Visualizer's `db` slot to it.
2. Through `digitalbrain-mcp`, send "which tables are in Supabase?" to the assistant app. The transcript
   shows `neurons_search` and `neurons_call(IPostgresServer, …, ReadSchema)`, and the answer names `Demo`.
3. Send "show data from Demo". The transcript shows `neurons_call(IApp, …/apps/datavisualizer, Invoke,
   show …)`; the view's table window, inspected with `neurons_call`, has rows.
4. Claude repeats steps 2–3 directly through the shared tools with the same result.
5. Traces show the spans with the expected caller (`os/assistant` for the turn, the user for MCP); no
   `discover_capabilities` or `select_capability` remain.

## Tests

- `NeuronAgentTools`: brain boundary, caller stamping, script-visible contracts only, Watch excluded.
- `digitalbrain-mcp` serves exactly the composed tool set (names and schemas match the assistant's).
- A scripted-LLM assistant turn running the two-step scenario end to end over real grains.
- Existing Assistant, AI, Apps, Postgres, Supabase and Mcp suites green after the removals.
