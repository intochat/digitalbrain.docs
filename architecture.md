# Architecture

DigitalBrain is one private workspace composed from a durable Orleans runtime, trusted domain
modules, an authenticated HTTP edge, a Flutter shell, and separate cluster-client applications.
Production source defines the current shape; this page explains how those pieces depend on each
other.

## System map

```text
Flutter window host
        |
        v
Kernel HTTP: cookie auth, commands, SSE, topology, OAuth callback
        |
        v
UI module: principal-scoped Chat + declarative Surfaces
        |
        v
Execution module: FIFO turn job, attempt, worker lease, effect ledger
        |
        v
AI module: Assistant -> Gemma4 / Llama32
        |
        v
SDK MCP/OAuth rail -> Google Gmail MCP / Salesforce MCP

Any neuron -- emitted fact --> Connection graph --> relay --> target neuron
                                         |
                               Time, Memory, Introspection, UI

Scripting host -> generated file-based C# app -> Orleans client -> brain cluster
```

The northbound `DigitalBrain.Mcp` application is a second client of the brain. It exposes chat and
introspection tools at `/mcp`; it is not the same thing as the southbound MCP/OAuth rail used to
reach Google and Salesforce.

`DigitalBrain.Scripting` is another separate client, not a Kernel component or module. It generates
a single-file C# app, delegates compilation and execution to the .NET SDK's Roslyn-backed
file-based-app path, and connects the resulting process to the cluster.

## Responsibilities

| Component | Owns | Does not own | Detail |
| --- | --- | --- | --- |
| Flutter | Windows chrome, local chat/surface/topology projections, user actions | Orleans state, MCP transport, durable job lifetime | [Hosting and security](/architecture/hosting-security) |
| Kernel HTTP edge | Cookie identity, actor derivation, principal scoping, commands, resumable SSE, OAuth callback | Domain conversation policy or AI inference | [Hosting and security](/architecture/hosting-security) |
| UI chat | Current transcript, durable FIFO turn queue, surface vocabulary, bridge to Execution | General-purpose job mechanics | [Chat and execution](/architecture/chat-execution) |
| Execution | Goals, Attempts, Operations, Blockers, receipts, worker dispatch, liveness, reconciliation | Chat rendering or provider-specific APIs | [Chat and execution](/architecture/chat-execution) |
| AI | Assistant/model neurons, protected agent sessions, capability selection, model clients | Kernel delivery or HTTP identity | [Module system](/architecture/module-system) |
| SDK integration rails | Generic MCP catalog/tool calls, actor-bound OAuth, protected tokens, webhook ingress | Gmail- or Salesforce-specific operation records | [Module system](/architecture/module-system) |
| Connection graph | Durable fact routes and optional transforms | Multi-step workflow state | [Kernel runtime](/architecture/kernel-runtime) |
| Time, Memory, Introspection | Timer vocabulary, Qdrant vector memory, topology/journal reads | Product-edge authentication | [Module system](/architecture/module-system) |
| Scripting | Generate and run out-of-process file-based C# cluster clients | Kernel/module composition or a shipped Behavior host | [Scripting](/architecture/scripting) |

## Runtime boundaries

The Kernel is domain-neutral. It knows identity, neurons, synapses, journals, outbox delivery,
capability calls, and graph routing. It does not know what a prompt, mailbox, CRM object, chart, or
timer means.

Modules are trusted installed code. Their contracts are permanent serialized vocabulary; their
runtime assemblies provide neurons and configuration hooks; optional Aspire-hosting assemblies
project external resources and configuration into the AppHost.

Scripting is deliberately outside that model. Generated apps consume existing module contracts
through `DigitalBrainClient`; they do not add runtime types to the Kernel or invent wire contracts.

The current `Chat` neuron belongs to UI and uses Execution for durable work. HTTP and SSE observe
that work but do not own its lifetime. Integration OAuth belongs to the authenticated actor, not to
the chat grain or a provider-wide singleton.

## Product state

**Implemented now.** The source contains the complete path shown above: authenticated Kernel edge,
principal-scoped UI chat, durable Execution, AI models, generic MCP integrations, connection graph,
supporting modules, a locally runnable Flutter/Aspire composition, and a separate Scripting proof
that generates and runs one file-based C# brain client.

**Known limitation.** The separate northbound MCP app is currently unauthenticated and its chat
tools do not use Kernel principal scoping. AppHost module selection and Kernel module composition
are also duplicated explicit catalogs.

**Ratified next.** Conversation moves out of UI into its own domain module between UI and AI.
Approved, versioned Behaviors will extend the current Scripting proof by composing existing module
vocabulary out of process and using Execution for durable effects. The general Behavior boundary
does not exist today.
