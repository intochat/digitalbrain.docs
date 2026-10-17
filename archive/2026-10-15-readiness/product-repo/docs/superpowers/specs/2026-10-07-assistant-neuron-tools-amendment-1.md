# Amendment 1: no tools, apps compose contracts

Date: 2026-10-07 · Status: proposed · Amends: `2026-10-07-assistant-neuron-tools-design.md`
(and the plan `docs/superpowers/plans/2026-10-07-assistant-neuron-tools.md` from Task 7 onward)

## Why

The spec removed the capability registry but kept its root: **"tool" is a fifth concept.** Modules
describe themselves twice, once as neuron contracts and once as hand-written `AIFunction`s registered in
the silo (`IAgentToolFactory`, `IAgentToolSource`). An app cannot compose capability: `chat.cs` passes
tool *names* that the host must happen to have registered, outside anything the app compiles against.

Everything that went wrong on this branch grows from that gap: the registry and offers that steered the
model to module tools, two assistants with two tool lists and two prompts kept in sync by a regex test,
a fake model (`ScriptedModelServer`) that hard-codes which tool name comes next, and the question of
which module should "host" a factory. The plan itself added one more factory (`NeuronAgentTools`).

## Rule

**Modules expose neurons and signals only. An app is a composition of contracts; the model acts on the
contracts the app composes.** No module ships anything model-facing.

## Design

### 1. An app's turn names contracts, not tools

`AgentTurn.Tools: string[]` is replaced by `AgentTurn.Contracts: string[]`: full type names of neuron
contracts. The app's program forms them with `typeof`, so the set is type-checked against the
contracts it references (`#:project …Contracts.csproj`), the same grammar its behaviors compile against:

```csharp
string[] Contracts = [typeof(IPostgresServer).FullName!, typeof(IApp).FullName!,
    typeof(IWorkspace).FullName!, typeof(IForm).FullName!];
var turn = AgentTurn.Text(message, instructions: prompt) with { Contracts = Contracts };
```

A contract the app does not name is not reachable in its turns. Platform-ring contracts are never
reachable (`NeuronContracts` already refuses them).

### 2. The agent runtime turns contracts into model actions

`AgentTurnLoop` (AI module) builds the model's actions from the turn's contracts through `NeuronSurface`,
restricted to that set. This is the runtime's own behaviour, not a registered factory:

| Action | Behaviour |
|--------|-----------|
| `neurons_context` | Caller, brain id (= scope id) for forming keys. |
| `neurons_search(query)` | Search within the turn's contracts: type, methods with parameter shapes, signals, comments. |
| `neurons_list` | The turn's contracts. |
| `neurons_get(contract, key)` | Resolve a neuron. |
| `neurons_call(contract, key, method, arguments)` | Call a method; Watch/Unwatch excluded; JSON/arity errors are repairable `isError` results. |

Names and descriptions stay in `NeuronSurfaceTools`, shared with `digitalbrain-mcp` (which offers all
deployed script-visible contracts, since its caller is a person or a scripted key, not an app turn).

Calls run as the app (the caller `AgentTurnLoop` already carries), so each neuron's own `Access` decides.

*Rejected:* one generated `AIFunction` per contract method. It gives typed schemas but makes the
action count grow with the composition and re-creates a per-method "tool" vocabulary.

### 3. Model-originated calls are marked, so neurons can withhold values from the model

Today `show_form` guarantees that submitted values never reach the model. With direct contracts the
model would call `IForm.Read` itself. The guarantee moves into the neuron:

- `AgentTurnLoop` stamps calls it makes on the model's behalf as model-originated (the app caller plus
  the conversation id, `CallerContext.ConversationId`, which exists today).
- `IForm.Read` returns field types, status and revision to a model-originated caller, never draft,
  submitted or secret values. The app's own script, which is not model-originated, still reads values.

This is the general mechanism: any neuron with values the model must not see decides with this one
fact, rather than tool code filtering results.

### 4. What replaces each module tool

| Today | Becomes |
|-------|---------|
| `neurons_*` (`NeuronAgentTools`, Assistant module) | AgentTurnLoop actions (Section 2) |
| `show_form`, `show_view` (`WorkspaceFormTools`) | `IForm.Define` + `IWorkspace.OpenSurface` (+ Section 3) |
| `csharp_contracts`, `csharp_write`, `csharp_run` (`CSharpAgentTools`) | contract calls: `IApp.WriteBehavior` and the CSharp module's script contracts; any authoring step without a contract gets one in the CSharp module |
| Data Visualizer "show" | `IApp.Invoke` + `IApp.Await` + `IWorkspace.OpenSurface` (already the recipe) |

### 5. One assistant

The module-hosted assistant is deleted: `DigitalBrain.Modules.Assistant`, its `.Contracts` and its
tests (`AssistantNeuron`, `AssistantTurnExecution`, `AssistantDefinition`, `instructions.md`, `/agent`,
receipts/usage endpoints built on it, `AssistantOptions` and the `Assistant` config section), and
`runAgent` in the Dart client. The assistant is `os/assistant`, an app. The shell talks to it through
`IApp` (`Invoke`/`Await`); `AppsEndpoints.Ask` stops polling and uses `IApp.Await`.

## Removed

`IAgentToolFactory`; `AgentTurn.Tools`; `NeuronAgentTools`; `WorkspaceFormTools`; `CSharpAgentTools`;
`NativeTools` resolution by name if nothing else needs it; the Assistant module (Section 5); E2E facts
that exist for `/agent` or the removed table system, and `ScriptedModelServer`'s tool-name script.

## Open fronts (decide before planning)

1. **External MCP servers** (`McpAgentTools`, the last `IAgentToolSource`). Proposed: keep it in the AI
   module, unchanged, until an MCP connector exists; an app names a server as it names a contract.
   Alternative: drop it now.
2. **Receipts and compute usage.** Today only the deleted assistant produces them. Proposed: the agent
   neuron (`IAgent`) already meters usage per run; receipts become a read over that, if the shell still
   shows them. Needs a check of what the shell renders.
3. **Prompt size.** `neurons_search` restricted to the app's contracts keeps search results small; the
   prompt carries the recipe, not contract lists.

## Verification

- Unit: an app turn reaches only its named contracts (another contract is refused as unknown); a
  platform contract is never reachable; a model-originated `IForm.Read` carries no values while the
  app's own read does; malformed arguments are repairable.
- Scenario over real grains with a scripted model, moved to the AI or Apps tests: "which tables are in
  Supabase?" → `IPostgresServer.ReadSchema`; "show data from Demo" → Data Visualizer `Invoke`/`Await` +
  `IWorkspace.OpenSurface`.
- End to end through `aspire run` and `digitalbrain-mcp` (spec "Done" 1–5 unchanged), with telemetry
  showing the turn's calls under the `os/assistant` caller. No Playwright journeys and no fake-model
  protocol are rewritten for this change.
