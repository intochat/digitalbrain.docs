# Architecture: AI and Tasks

This authority owns the AI and Tasks module status, contracts, and rationale.

## 4. The modules

Each subsection below states what the module owns, what it must never do, and what is settled but not
yet standing up. `Status: Built` means the contracts and runtime described here exist in the
repository and are exercised by its test tiers. `Status: Designed` means the decisions are ratified
and reversing one requires writing down the reversal — but no code exists yet.

### 4.1 AI

Status: Built

AI owns inference and orchestration vocabulary. Two contracts are deliberately separate even though
their wire shape is identical: `ILLM` means model inference and `IAgent` means a role-bearing agent or
orchestration. `ILLM` never inherits `IAgent`, and no adapter may pretend a raw model is a durable
agent. There is no generic `Agent` base that collects instructions or capabilities without giving
them MAF semantics; an agent is a concrete typed neuron contract, and MAF owns its execution path.

```csharp
namespace DigitalBrain.AI;

public partial interface ILLM : INeuron
{
    [Alias(nameof(Respond))]
    Task<ChatResponse> Respond(IReadOnlyList<ChatMessage> messages);
}
```

The public conversation boundary is Microsoft.Extensions.AI `ChatMessage` and `ChatResponse` — not
framework-owned string DTOs, and not Microsoft Agent Framework types, which stay internal to the
runtime package. Callers do not supply `ChatOptions`; the concrete typed model or agent owns its
model, instructions, tools, and inference configuration.

The concrete type is the identity:

```csharp
public sealed class Llama32(
    [Llm<Llama32>] IChatClient chatClient)
    : LLM(chatClient), ILlama32;
```

`IChatClient` is private to concrete `LLM` neurons and keyed by the concrete neuron type. Only those
neurons may receive it; agents consume `ILlama32`, `IGpt56`, or another concrete model contract.
There is no routing tier, balancing layer, provider enum, capability score, or fallback catalog, and
none may be reintroduced — an architecture test asserts that every concrete `LLM` follows the
namespace, contract, and typed-key grammar, and that `IChatClient` injection stays confined to those
neurons.

The exclusion list is longer than routing, and the rest of it is easy to reintroduce by accident
through hosting rather than through code. Named accounts, provider failover, cost balancing, and
per-model credentials are all deliberately out. Hosting supports exactly one connection per provider,
and the API-key parameter belongs to the module rather than to any individual model — so two OpenAI
models share one secret and one provider resource. A second account, a cheaper fallback, or a
model-specific credential is not a configuration knob anyone can turn; it is a design change that has
to be argued, because each of them smuggles back the selection tier this module exists to avoid.

**Microsoft Agent Framework owns execution.** DigitalBrain must not build a second agent loop,
group-chat engine, handoff engine, workflow engine, session format, or tool middleware stack.
Orchestration is selected by typed base class — the application class name says *what* the team is,
the base class says *how* it operates. Orchestrations accept both raw `ILLM` neurons and role-bearing
`IAgent` neurons; internal adapters convert either into an MAF participant. Participants are declared
by typed neuron identity, never by injecting fake constructor dependencies.

**Orleans is the durability authority for direct turns.** Built today: direct Concurrent/GroupChat `Respond` owns a protected serialized MAF AgentSession (encrypted by `DigitalBrain.Security` via the internal direct session helper). There is no second transcript, and the MAF Durable Extension is rejected because it would duplicate Orleans. Restore reconstructs the composed definition first and only then restores state; a fingerprint mismatch demands explicit migration or reset.

**Supervised Task/`IWorker` orchestration is Designed, not built.** `IGroupChat` still extends
`IWorker`, but `Accept` / `Continue` / `Cancel` throw until a thin Orleans-primary supervised path is
rewritten. The retired private `WorkflowRunner` / `OrleansCheckpointStore` / `AIWorkerState` stack was
deleted as overbuilt reinvention — not as a product vocabulary change. When supervised work returns,
it must re-enter as one Lockstep superstep per runner hop with definition-bound checkpoints, not as a
second agent runtime.

Settled but not yet standing up: `Sequential`, `Handoff`, and `Magentic` base types, plus the supervised
worker path above. `GroupChat` and `Concurrent` exist for direct `Respond`. A single-agent hard task is
expected to use a one-participant `Sequential` worker once that type and supervised wiring exist.
Compaction is ratified with the shape it will have to keep — internal, token-budget driven,
collapsing old tool results first, summarizing with the same typed model, truncating only as an
emergency, and never leaking experimental MAF types into public contracts — and none of it is
written. Nothing in the repository compacts a conversation, summarizes one, or reasons about a token
budget. The kernel's `NeuronFeed` trims a journal feed by entry count and byte size, which is a
different mechanism answering a different question and must not be read as this one.

### 4.2 Tasks

Status: Built

A Task is durable domain identity for a desired outcome. The Built surface today is the Task lifecycle
plus attempt facts over any `IWorker` grain id — L1 closes with a test-only worker, not a product MAF
orchestration. Under supervised AI (Designed, unbuilt), an MAF Workflow is how one Attempt is meant to
execute. The Task survives worker, model, orchestration, and deployment changes; the Attempt does not.

The dependency direction is one-way and load-bearing: `DigitalBrain.Modules.AI.Contracts` references
`Tasks.Contracts`, never the reverse. Tasks knows nothing about AI, MAF, models, prompts, executors,
sessions, or checkpoints, and a test asserts that its contracts assembly cannot even reach them.

Tasks owns only extension vocabulary — abstract `Goal`, `Result`, and `Failure`, a `FactReference`
pairing a source neuron with a fact, and a `TaskPolicy` of maximum attempts, retry delay, and optional
deadline. Applications and modules define the concrete types. There is no `object`, no arbitrary
JSON, no metadata dictionary, no generic event string, and no prompt anywhere in this module.

That leaves an obvious question: if Tasks may not know what a prompt is, how does a `Goal` ever reach
a model? Through the ratified supervised bridge on AI orchestration — **designed, not standing today**.
When supervised `GroupChat` returns, two protected abstract methods on that base class own the seam:
one turns the immutable `Goal` into the chat messages a workflow starts from; the other turns the
workflow's terminal messages back into a typed `Result`. Both are deterministic and synchronous, and
the base class copies messages in each direction so that neither MAF nor the application ends up
holding a reference into the other's state. That is the entire bridge. Tasks never learns what a
`ChatMessage` is, AI never learns what any particular `Goal` means, and the application class that
already defines both vocabularies is the one place the translation lives. Today's `GroupChat` is
direct `Respond` only; those mapping methods and the supervised worker path are not in the repository.

Four other shapes for that seam were considered and rejected: a generic `GroupChat<TGoal, TResult>`,
a public mapper interface, a reflection convention over method names, and a service-locator lookup.
Each one moves the mapping out of the single class that provably knows both sides and into somewhere
it can be mis-wired at runtime instead of failing to compile.

Retry timing is where the module's independence was nearly lost. A retryable failure waits a fixed
`RetryDelay` before another Attempt, and it waits on private durable reminders owned by the Task
neuron rather than on a Time schedule. The reason is deployment, not taste: a Task that booked its
retries through the Time module would force every application that wants Tasks to also deploy Time.
The contracts test that pins the Tasks dependency list names `DigitalBrain.Time` alongside AI, MAF,
and the integrations as assemblies it must not be able to reach.

The lifecycle is deliberately small — `Pending`, `Running` and `Waiting` moving in both directions,
`Cancelling`, and the immutable terminals `Succeeded`, `Failed`, and `Cancelled`. `Waiting` carries a
typed blocker (`InputRequired`, `ApprovalRequired`, `DependencyPending`, `RetryScheduled`,
`OutcomeUncertain`) so the Task knows blocker identity, category, revision, and resolution while the
worker keeps the detail.

Four rules make concurrency tractable:

- **Exactly one Attempt is active per Task.** Parallel thinking belongs inside that Attempt. Two
  deliberately competing solutions are child Tasks under a parent, not attempts racing on one Task.
- **Revision fencing is strict, and the fact path and the cursor path enforce it differently.** A
  worker's attempt fact is accepted only when task, worker, attempt, and revision all match, and
  every other fact — older or newer — is durably ignored: `Matches` compares
  `fact.Revision == data.Revision`, and a caller that gets `false` returns without touching state, so
  a future-revision fact produces neither a retry storm nor a corruption signal. The worker's own
  cursor path (designed for supervised orchestrations) rejects: an incoming cursor must be exactly
  the next revision and throws on anything else. Either way a terminal Attempt refuses continuation
  and a retry always gets a new attempt identity.
- **An Attempt failure is not a Task failure.** Policy may start another sequential Attempt, enter
  `Waiting`, or declare terminal failure. A later retry is a successor Task linked by `RetryOf`.
- **Cancellation is truthful.** It is best-effort intent, never pretend rollback. A cancelling worker
  may honestly report cancellation, a success that won the race, a failure, or an uncertain outcome.
  A completed external effect is never described as cancelled — compensation is an explicit
  capability or a successor Task.

`IWorker` requests are short and idempotent: validate, persist, schedule an internal turn, return.
Only session-owning orchestration neurons implement `IWorker`; ordinary stateless agents and raw LLMs
do not. Workers report typed attempt facts, and the Task accepts a fact only when task, worker,
attempt, revision, and caller all match.

One mapping is tempting enough to get wrong that it is settled explicitly: MAF's run status is not a
Task state, and no adapter may treat it as one. A running workflow means the Attempt is executing. An
idle checkpoint means a superstep ended, not that the Attempt finished — adopting it as completion
would declare success for work that has not happened. Workflow output may complete an Attempt.

Settled but not yet standing up: a pending MAF request mapping to Task `Waiting` with a typed blocker,
and a workflow error feeding Task retry policy rather than terminating the Task on its own. Neither
exists in the repository. The retired private `WorkflowRunner` / checkpoint stack that once watched
MAF workflow events was deleted with overbuilt supervised reinvention (§4.1). `TaskNeuron` still
handles attempt facts. `DigitalBrain.Tasks.Tests` closes the L1 loop with a test-only `IWorker`
that emits `AttemptAccepted` / `AttemptCancelled` (and a stale `AttemptSucceeded` for revision
fencing). Supervised product workers remain unbuilt: `GroupChat.Accept` / `Continue` / `Cancel`
throw until that thin Orleans-primary path is rewritten; direct `Respond` does not consult Task
policy.


