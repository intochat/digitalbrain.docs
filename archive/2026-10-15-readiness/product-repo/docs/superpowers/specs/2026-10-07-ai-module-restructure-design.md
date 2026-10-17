# AI module restructure

Date: 2026-10-07. Status: implemented; corrected against the code in Task 5 (see the corrections list below).

## Problem

The AI module carries two agent designs in one grain. `IAgent` is both a self-contained chat
agent (`Ask`, `GetResponse`, `GetRichResponse`, `GetResponseStream`, `History`, `Events`,
`LastRun`) and an externally driven conversation ledger (`Begin/Complete/InterruptConversation`,
`Turns`, `RunInputs`, `ConversationSummary`) driven by `AgentExecutionNeuron` and the Assistant
module. The two designs share `AgentStorage`, two transcripts, two summaries, two run-tracking
mechanisms and two signal families. `AgentTurnRequest` carries both input shapes as nullable
alternatives and `AgentTurnRunner` branches on them.

The turn itself is not a neuron: `AgentTurnRunner` is a DI singleton that holds tool sessions, the
model client and the event stream in process memory, with a `Channel` + `ConditionalWeakTable`
handshake so the grain can persist before the runner continues.

A model is named five ways (marker type, marker name, wire id, profile name, `AgentModelSelection`)
and resolved by four classes (`ModelProfiles`, `InferenceService.Resolve`, `AgentModelCatalog`,
`ModelAddress`). The `"scripted/"` prefix is string-checked in three places.

Nearly every type sits in `namespace DigitalBrain.AI`, so folders are cosmetic.

## Decision

One agent neuron that owns its transcript and runs its own turn, exposed both as a stream and as a
fire-and-forget start with signals. Context becomes a neuron. One model key and one resolver.
Folders become namespaces, following the Time and Gmail modules.

Approaches rejected: keeping the ledger/runner split with the runner as a grain (keeps the double
bookkeeping); splitting the transcript into a separate conversation grain (nothing needs a
conversation without an agent).

## Section 1: the agent neuron

Contract, `Contracts/Agents/IAgent.cs`, `[Alias("agent")]`:

```csharp
public interface IAgent : INeuron
{
    [AlwaysInterleave] Task Configure(AgentDefinition definition, long expectedRevision);
    [AlwaysInterleave, ResponseTimeout("00:10:00")]
    IAsyncEnumerable<AgentTurnEvent> Run(AgentTurn turn, CancellationToken ct = default);
    [AlwaysInterleave] Task<string> Start(AgentTurn turn);
    [AlwaysInterleave] Task Cancel();
    [ReadOnly, AlwaysInterleave] Task<AgentState> Read();
    [AlwaysInterleave] Task Clear();
    [ReadOnly, AlwaysInterleave] Task<AiMessage[]> Transcript();
}
```

`AgentTurn`: `RunId` (caller-supplied for replay, `null` for a fresh id), `Message: AiMessage`,
optional `Model` (marker name, profile name or `scripted/<key>`), `Instructions`, `Tools`, `Intent`.
Model precedence: `AgentTurn.Model`, then `AgentDefinition.Model`, then the deployment default.

`Ask`, `GetResponse`, `GetRichResponse`, `GetResponseStream` become extension methods over `Run`
in the Contracts ring.

State, one record with concrete arrays. It does not carry the transcript; `IAgent.Transcript()` returns
it, so the conversation read the shell makes stays small:

```
Revision, Definition, Summary: string?, ActiveRun: AgentRun?, Runs: AgentRun[]
```

`AgentRun`: id, status (Running, Completed, Failed, Cancelled, Interrupted), started/ended, resolved
model, usage, error, user text, tool calls (call id, name, arguments, result or failure). `Runs` is a
bounded log. Overflowing transcript folds into `Summary` as today. History is bounded by size as well as
count: a committed tool result over 4,000 characters is stored as a JSON preview (`truncated`,
`characters`, `preview`), and replayed history keeps at most 120,000 characters, trimmed on the same
turn boundaries with the dropped text folded into `Summary`.

Turn loop: a private helper the grain owns. It builds messages from transcript, context and input,
resolves the model through `ModelCatalog`, calls the client, invokes tools (factory tools, native
tools, tool sources with sessions, tool offers), persists after each tool result, commits the
transcript on completion, and disposes sessions. `Run` yields from it directly. `Start` persists
`ActiveRun`, returns the id, and hands the loop to a one-way self-reference that forwards each event
as a signal. No channel, no observation table.

Signals, `Contracts/Agents/Signals/`: `AgentConfigured`, `TurnStarted`, `TurnProgressed`
(kind text / tool-call / tool-result / card / receipt, sequenced from 1 per run), `TurnCompleted`,
`TurnFailed`, `TranscriptCleared`. The old `AgentRunChanged`, `AgentOutputDelta`,
`AgentToolCallChanged`, `AgentReplied`, `AgentHistoryCleared`, `AgentTurnProgressed`,
`AgentTurnCompleted`, `AgentTurnFailed` are removed.

Replay and concurrency: `Run` with a run id already in `Runs` and the same user text replays the
stored reply as one `Text` plus `Completed`; `Start` on a replayed run publishes `TurnStarted` and
`TurnCompleted`. Same id with different text throws. A second concurrent `Run` or `Start` on one
agent throws `InvalidOperationException`. A retained run that did not complete is retried under its
run id. On activation a run left `Running` is marked `Interrupted` and a `TurnFailed` announces it.
`Configure` and `Clear` are `[AlwaysInterleave]`, because a turn driven by `Start` holds the grain.
History trims on turn boundaries (it cuts at the next user message), so a tool call is never kept
without its result. The `Start` driver is the module-internal `IAgentDriver`, replacing `IAgentTurnDriver`.
The Assistant has no context to write yet, so its agent's `Contexts` is empty; its conversation key
is `{workspace}/agents/conversation-<hash>`.

Access: an agent's key starts with its brain scope; the agent keeps the framework's default `Access`
(`NeuronAccess.ForBrainKey(key)`), and its tools and meter use the same scope.

## Section 2: the context neuron

Contract, `Contracts/Agents/Context/IAgentContext.cs`, `[Alias("agent-context")]`:

```csharp
public interface IAgentContext : INeuron
{
    Task Set(ContextEntry entry);
    Task Remove(string name);
    [ReadOnly, AlwaysInterleave] Task<ContextSnapshot> Read();
}

public sealed record ContextEntry(string Name, string Text, string[] Tools);
public sealed record ContextSnapshot(long Revision, ContextEntry[] Entries);
```

Entries carry their own name so each producer owns and replaces its own slice, and a snapshot is a
plain array. State: revision plus the entries, stored as arrays.

Signals, `Contracts/Agents/Context/Signals/`: `ContextUpdated(ContextId, Revision, Name)`,
`ContextRemoved(ContextId, Revision, Name)`.

`AgentDefinition.ContextProviders` becomes `Contexts: string[]`, a list of context neuron keys.
At the start of a turn the agent reads each one, appends each entry's text as a system message and
offers the entry's tools, restricted to registered tools. A missing or failing context is logged and
skipped. The agent reads at turn time and does not subscribe; subscribing is for behaviors.

Removed: `IAgentContextProvider`, `AgentContextRequest`, `AgentContext`. The Assistant writes its
context into the agent's context neuron instead of implementing a provider.

Out of scope: cross-brain context sharing and context in marketplace bundles.

## Section 3: one model vocabulary

One key on the wire: the marker name (`"IFable5"`, `"IGemma4"`), a profile name from
`ModelProfiles` configuration, or `"scripted/<key>"`. A model knows its provider; a profile names a
model and may pin a provider-side id and endpoint. Callers never choose a provider. The freeform
`Provider + Model` pair is dropped; a model not in the compiled catalog is reachable only through a
configured profile.

```csharp
public sealed record ModelSelection(string? Model = null, string? Reasoning = null, int? MaxOutputTokens = null);
```

One resolver, `Module/Models/ModelCatalog.cs`, a singleton:

```csharp
Task<ResolvedModel> Resolve(ModelSelection? selection, bool requiresTools, CancellationToken ct);
Task<IChatClient> CreateClient(ResolvedModel model, CancellationToken ct, bool invokesTools = false);
ModelDescriptor Describe(ResolvedModel model);
Task<ModelChoices> List(string? defaultModel, CancellationToken ct);
Task<ModelSelection?> Select(string? id, string? defaultModel, CancellationToken ct);
```

`ResolvedModel` keeps provider, model id, endpoint, revision hash, capabilities, reasoning and max
output tokens. `Resolve` with null selection returns the deployment default: the configured default
model, else the first catalogued model whose provider has credentials. The `"scripted/"` branch
has no `ScriptedProviderFactory`: `ILlmProviderFactory` is shaped around `LLMModel` and `AIOptions` and
the scripted model is a grain, so `CreateClient` has a two-line arm. `AiProvider` gains `Scripted` and
`Host` (the deployment's registered `IChatClient`, used when no provider or default is configured;
tests inject it). `CreateClient` prefers a keyed `IChatClient` registered under `scripted/<key>`
(a host-composition test seam, global and not per brain) and otherwise returns the `ScriptedChatClient`
adapter over the `IScriptedLLM` grain. The scripted model stays a neuron
because scripts and tests program it and read its prompts back across the sandbox boundary, and
its reply queue and recorded prompts are grain state. `List` reports availability from credential readiness and skips Ollama
models not installed on the configured server. `ModelChoice` keeps its shape (id, label, provider,
model, available, capabilities) so the Flutter picker does not change.

`ModelCatalog` is also a neuron, `IModelCatalog` (`Contracts/Models`), because the Assistant module
references only AI contracts and lists models through a grain; the `{automatic, models}` record the
shell reads is `ModelChoices`.

`ModelAddress` is kept under `Models/`: it is the one place a model key becomes an `ILLM` grain for callers
outside the AI module (`CreatorModelWorker`, group chat, scripts).

Removed: `ModelProfiles`, `AgentModelCatalog`, `AgentModelSelection`,
`ResolvedAgentModel`, `InferenceService.Resolve`. `InferenceService` keeps `Generate` and
`GenerateStreaming` over a client the catalog gives it. `ILLM`, the per-model markers,
`LlmNeuronBase` and the per-vendor neuron files keep their roles and move under `Models/`.

## Section 4: layout, wiring, tests

Contracts, namespaces equal folders under `DigitalBrain.AI`:

```
Agents/                  IAgent, AgentDefinition, AgentTurn, AgentTurnEvent, AgentState, AgentRun, AgentExtensions
Agents/Signals/          AgentConfigured, TurnStarted, TurnProgressed, TurnCompleted, TurnFailed, TranscriptCleared
Agents/Context/          IAgentContext, ContextEntry, ContextSnapshot
Agents/Context/Signals/  ContextUpdated, ContextRemoved
Models/                  ILLM, AiModel, LLMModel, AiProvider, ModelAddress, ModelSelection, ResolvedModel, IModelCatalog, ModelChoice, ModelChoices
Models/Signals/          InferenceStarted, InferenceCompleted, InferenceFailed
Models/<Vendor>/         one file per model (marker + LLMModel)
Models/Scripted/         IScriptedLLM
Inference/               AiMessage, AiContent and derived, InferenceRequest/Result/Update/Options, ModelDescriptor, CapabilitySupport
Tools/                   IAgentToolFactory, IAgentToolSource, IAgentToolSession, AgentToolOffer, AgentToolBinding, INativeToolContributor, NativeTools, ScreenedFunction
Media/, Voice/, Embeddings/, GroupChat/   content unchanged, namespaces fixed (IEmbedding in Embeddings/, IImageGeneration and IImageModel in Media/, ITranscription in Voice/)
```

Module:

```
AIModule.cs              registrations only; connector definitions in Models/ModelConnectors.cs
Agents/                  AgentNeuron, AgentTurnLoop, IAgentDriver
Agents/Context/          AgentContextNeuron
Models/                  ModelCatalog, ModelCatalogNeuron, InferenceService, LlmNeuronBase, provider factory bases
Models/<Vendor>/         <Vendor>ProviderFactory, ModelNeurons
Models/Scripted/         ScriptedLlmNeuron, ScriptedChatClient
Tools/                   McpAgentTools, NativeToolRegistrations, Web/, WebSearch/, Workspace/
Configuration/, Integrations/, Metering/, Media/, Voice/, GroupChat/   stay
```

Deleted: `AgentExecutionNeuron`, `IAgentExecution`, `IAgentTurnDriver`, `IAgentTurnRunner`,
`AgentTurnRunner`, `AgentActivation` (resume moves into the `AgentResume` activation handler, since `Neuron.OnActivateAsync` is sealed), `AgentConversation.cs`,
`AgentRequest`, `AgentReply`, `AgentTurnStart`, `AgentTurnRequest`, `AgentModelSelection`,
`ModelProfiles`, `AgentModelCatalog`, `Providers.cs`.

Outside the module: `AssistantTurnExecution` calls `agent.Run(turn, ct)` and forwards events; its
context provider becomes writes to the agent's context neuron; its model listing reads
`ModelCatalog.List`. `GroupChat` and `OsCatalog` pick up renamed types. Dart screens change only if
a mirrored record changes shape.

Tests, `tests/DigitalBrain.Modules.AI.Tests`: every existing agent fact (cancellation, history,
recovery, streaming, tools, tool offers, scripted turns, hosted agents) is kept and rewritten against
`Run` and `Start`. New: `Agents/Context/` facts for set, remove, signals and "a turn reads the
latest context"; `Models/ModelCatalogFacts` for marker, profile, scripted, default and
unavailable-provider resolution. The Assistant test suite is the regression net.

Verification: Aspire resources healthy; through `digitalbrain-mcp` call `IAgentContext.Set` and
`IAgent.Start` on a real brain and read `TurnProgressed`, `TurnCompleted` and `ContextUpdated`
signals back; GenAI spans and agent log lines visible in traces.

Implementation order so every step builds green: model catalog, context neuron, agent neuron and
signals, Assistant switch-over and deletions, folder and namespace moves.

## Corrections found while implementing

- Namespaces equal folders for everything that moved; `Clients/`, `Configuration/`, `Integrations/` and the module's
  `Voice/` keep `DigitalBrain.AI`. `Web/` and `WebSearch/` became `DigitalBrain.AI.Tools.Web` and `.Tools.WebSearch`.
- `AiMessage` and the inference records moved from `DigitalBrain.AI` to `DigitalBrain.AI.Inference`.
- `ModelCatalog.CreateClient` takes `invokesTools` (the default client keeps function invocation) and `Select` refuses the Host client.
- `AgentTurnLoop` takes `IServiceProvider` and resolves `IGrainFactory` when it reads a context; scripted turns skip
  descriptor validation; a failing tool rethrows its original exception after `ToolFailed`, so a cancelled tool ends the run Cancelled.
- `AgentReply` is `(RunId, Text, Messages, Usage)`; `Ask`, `GetResponse`, `GetRichResponse` and `GetResponseStream` stay as extensions over `Run`.
- Interrupted runs publish `TurnFailed` through `IAgentDriver.Interrupted`, so every run ends with exactly one closing signal.

## Hazards

- No state compatibility is needed; `AgentStorage` is reshaped freely.
- Grain state uses concrete arrays.
- `Start` must hand the loop to `this.AsReference<...>()` one-way; no direct self-call.
- Never raise timeouts or add polling to make a check pass.
