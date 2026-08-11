---
layout: home

hero:
  name: DigitalBrain
  text: A private, durable operating system
  tagline: Neurons, synapses, durable execution, and a live Flutter workspace on Orleans and Aspire
  image:
    src: /logo.svg
    alt: DigitalBrain
  actions:
    - theme: brand
      text: Start locally
      link: /getting-started
    - theme: alt
      text: Learn the concepts
      link: /concepts
    - theme: alt
      text: See the architecture
      link: /architecture
    - theme: alt
      text: Browse modules
      link: /modules
    - theme: alt
      text: Check status
      link: /status

features:
  - title: Durable neurons
    details: Owner-bound Orleans grains process single-threaded turns and recover their journaled state after activation or restart.
  - title: Immutable synapses
    details: Typed facts carry stable identity, correlation, causation, caller, sequence, and timestamp metadata across durable delivery.
  - title: Runtime connection graph
    details: Durable connections route emitted facts by permanent wire alias, with optional typed transforms, without embedding workflow steps in the graph.
  - title: Durable executions
    details: Executions, attempts, operations, blockers, worker leases, and explicit uncertain-outcome resolution keep useful work independent of an HTTP request.
  - title: Private workspace identity
    details: Cookie identity, workspace roles, principal-scoped chats and surfaces, and per-user OAuth state keep one installation's users separated.
  - title: Flutter shell
    details: The checked-in Windows Flutter host renders chat, surfaces, topology, and authorization projections from the Kernel HTTP edge.
---

## Product state

**Implemented now.** The checked-in AppHost runs the Kernel, Flutter shell, a separate northbound
MCP server, Azurite-backed Orleans durability, Qdrant vector memory, Ollama with Gemma4 and Llama32,
and Google and Salesforce definitions over the shared MCP/OAuth rail.

**Known limitation.** The separate northbound `/mcp` endpoint is not yet authenticated or scoped to
the caller. Salesforce consent also requires the provider application's callback registration to
match `http://localhost:5080/oauth/callback`. See [Current status](/status) before exposing either
boundary.

**Ratified next.** Conversation becomes its own domain module and approved Behaviors become the
runtime-programmable product layer. Neither is presented here as shipped architecture.
