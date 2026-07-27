# Concepts

DigitalBrain is built from four things: neurons, synapses, modules, and executable tests. Everything
else composes them.

## Neuron

A neuron is a durable Orleans journaled grain. It receives and emits synapses, keeps bounded incoming
and outgoing journals, enforces owner and delivery invariants, and recovers after a silo restart.

Domain capability belongs in a module neuron — `Llama32` is an AI neuron. The kernel's `Neuron` stays
domain-neutral.

## Synapse

A synapse is an immutable typed fact. The kernel carries it in a read-only delivery envelope with
correlation and causation lineage. A neuron declares `IHandle<TSynapse>` for facts it consumes and
`IEmit<TSynapse>` for facts it produces, provable at build time.

The distinction that runs through the whole system:

> A typed neuron method is a **directed request** that can reply.
> A synapse is an **undirected fact** that does not.

Both cross the same owner-aware Orleans boundary, and both are journaled.

## Module

A module is a compile-time package family owning one domain's vocabulary, runtime, and optional
Aspire hosting:

```text
DigitalBrain.Modules.AI.Contracts
DigitalBrain.Modules.AI
DigitalBrain.Modules.AI.Aspire.Hosting
```

AppHost selects modules; source generation composes them into `silo.AddDigitalBrain()`. A module is
available when referenced and active only when selected.

## TestBrain

`TestBrain` is the method-scoped testing primitive. A `DigitalBrainFixture` owns one real three-silo
in-process cluster and permits one active `TestBrain` at a time, so tests serialize within a fixture
while separate assemblies run in parallel.

A test advances deterministic time, controls only closed durability faults and external edges, and
asserts on typed committed-journal evidence. `TestOwner` supplies the isolated owner identity;
`TestNeuron<T>` addresses one typed neuron.

## Vocabulary

These terms are load-bearing — they are the language the kernel, modules, and behaviors share, and
the vocabulary a future natural-language layer will resolve against.

| Term | Meaning | Not to be called |
| --- | --- | --- |
| **Neuron** | A durable addressable identity that receives requests and facts and owns its state | service, actor, grain |
| **Synapse** | A typed fact delivered between neurons with no reply contract | command, request, message |
| **Capability request** | A directed typed interface method that may return a result | synapse, event |
| **Module** | An independently shipped domain vocabulary and its runtime | plugin, feature flag |
| **Behavior** | A human-approved composition of existing typed vocabulary | dynamic neuron type, script-generated contract |
| **Registry** | The generated catalog of exact public neuron contracts | vector database, runtime assembly scan |

### AI

| Term | Meaning | Not to be called |
| --- | --- | --- |
| **LLM** | A typed neuron representing inference by one concrete model | agent, model tier, provider route |
| **Agent** | A typed neuron whose model, instructions, and capabilities form one conversational role | LLM, universal neuron base |
| **Orchestration** | A typed neuron coordinating agents or LLMs through a declared pattern | hand-written agent loop |
| **Participant** | A typed LLM or agent neuron identified inside an orchestration | constructor dependency, MAF executor |
| **Capability** | A semantic typed operation an agent or behavior may use | MCP tool, provider function |

### Work

| Term | Meaning | Not to be called |
| --- | --- | --- |
| **Task** | A durable identity for a desired outcome and its lifecycle | MAF workflow, prompt, ledger entry |
| **Goal** | The immutable typed outcome a task is meant to achieve | prompt, work dictionary |
| **Attempt** | One revision-fenced execution of a task by one worker | task, retry counter |
| **Worker** | A session-owning neuron that advances an attempt and reports typed facts | stateless agent, LLM |
| **Blocker** | A typed reason a task cannot currently advance | run status, free-form error string |
| **Successor task** | A new task linked to an immutable terminal task | reopened task |

An attempt failure is not a task failure. Terminal tasks are immutable, and retries are successors.

### Time

| Term | Meaning | Status |
| --- | --- | --- |
| **Countdown** | A durable one-shot schedule expressed as a duration | Built |
| **Reminder** | A durable absolute or recurring schedule | Designed, unbuilt |
| **Interval schedule** | Recurrence based on elapsed duration from an instant | Designed, unbuilt |
| **Calendar schedule** | Wall-clock recurrence in an IANA time zone; DST records and library remain open | Designed, unbuilt |

Only Countdown is implemented. Do not call a Countdown a timer or a reminder.

## Behaviors

A behavior is a human-approved runtime composition of existing typed vocabulary. The shipped
`DigitalBrain.Behaviors` SDK defines program, constrained-context, manifest, and identity contracts —
it does not compile, approve, install, or execute anything. That rail is designed and unbuilt; see
[Architecture](/architecture#behaviors).
