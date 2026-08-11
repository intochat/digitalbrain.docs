# Current status

This page separates production source, local smoke evidence, and ratified future architecture. It
was reconciled against the product repository on 2026-08-11. No automated-test result is used as
current evidence.

## Implemented now

### Runtime and durability

- Owner-bound neurons use Orleans journaled grains with incoming/outgoing feeds, journal-is-outbox
  delivery, at-least-once dispatch, receiver deduplication, and bounded in-memory journal views.
- The connection graph stores durable source/alias/target routes and supports typed relay
  transforms.
- Execution owns durable work through Goals, Attempts, Operations, Blockers, bounded receipts and
  operation rows, allow-listed workers, worker leases, cancellation, and explicit
  `OutcomeUncertain` resolution.
- The core Neuron, Execution, and Introspection adapters delegate to focused collaborators. There
  are no handwritten partial classes; generated partial wire interfaces remain.

### Product edge and identity

- Kernel HTTP uses cookie identity, an authenticated fallback policy, Development-only loopback
  impersonation, and an HTTPS requirement beyond loopback.
- The first anonymous bootstrap creates the Owner. An Owner or Admin can create Owner, Admin,
  Builder, and Viewer accounts.
- Chat and surface names are scoped with the authenticated `PrincipalId`. Authorization events are
  filtered to the actor who owns the OAuth state.
- Chat work is Execution-backed. Aborting an HTTP/SSE observer detaches the observer without
  cancelling the durable turn. Chat, surface, authorization, and graph streams resume from
  `afterSequence`.
- Google and Salesforce use one generic MCP catalog/OAuth rail. OAuth state is actor-bound, uses
  PKCE S256, expires, is capped, and is consumed once. Protected token state has no cross-user
  fallback.

### Checked-in local composition

- The AppHost runs Azurite with a data volume and persistent container lifetime, Qdrant, persistent
  Ollama/Open WebUI, Gemma4, Llama32, Kernel, Flutter, a separate northbound MCP app, and a separate
  Scripting client.
- Scripting generates one temporary file-based C# app, runs it through the .NET SDK/Roslyn path,
  connects it to the Orleans cluster with `DigitalBrainClient.ConnectAsync`, fires a typed
  `ChartPoint`, attempts to clean up the artifact, and exits. It is not part of Kernel or a module.
- The local Flutter shell renders chat, surfaces, brain topology, graph events, and authorization
  events. Behavior Studio is visibly a preview/demo, not a working behavior runtime.
- Salesforce Contracts remains a permanent module interface alongside the other contract
  assemblies. Existing wire aliases remain permanent.

### Smoke observed on 2026-08-11

This smoke predates restoration of the Scripting AppHost resource. Scripting statements above are
source-characterized implementation claims, not additions to the smoke evidence below.

- AppHost resources reached healthy, including Kernel, MCP, Flutter, Azurite, Qdrant, Ollama,
  `llama3.2`, and `gemma4:12b`.
- Bootstrap, Owner-created Viewer, Viewer login, and two distinct cookie principals succeeded.
- Two principals using local chat name `main` received private transcripts with no marker leakage.
- A slow AI turn renewed its worker lease and reached `Responded` plus `Completed` after 28.8
  seconds.
- Google produced an actor-bound stateful PKCE URL and reached the provider login page.
- Authorization SSE filtering prevented a Viewer from receiving the Owner's sign-in event.
- The post-refit topology observation reported 8 modules, 14 active neurons, and 0 live graph
  connections. Those counts describe that smoke moment, not a fixed product limit.

## Known limitations

| Area | Current limitation | Consequence |
| --- | --- | --- |
| Northbound MCP | The separate `DigitalBrain.Mcp` app maps `/mcp` without authentication. Chat tools accept a bare chat name and stamp a fixed operator actor. | The endpoint is a security/scoping blocker and must not be exposed as a trusted multi-user boundary. |
| Salesforce OAuth | The provider's External Client App registration did not match `http://localhost:5080/oauth/callback` during smoke. | State and PKCE were generated, but provider consent/token exchange could not complete. |
| First run | Development loopback auth can impersonate only an already stored bootstrap Owner. | A fresh volume requires one manual `POST /auth/bootstrap`; Flutter streams started earlier can need a restart. |
| Scripting | The restored project generates only a fixed ChartPoint proof and runs with ordinary local process, filesystem, and environment access. | It demonstrates generation and cluster connection, but is not an approved, versioned, sandboxed Behavior host. |
| Behavior Studio | Flutter carries preview fixtures and a demo client, but no Behavior host, approval/install rail, or execution path exists. | The preview must not be read as a shipped self-programming feature. |
| Module catalogs | AppHost resource selection and Kernel `ComposedModules` are two explicit catalogs. | Adding/removing a module can drift unless both composition sites are reviewed. |
| Streams/PubSub | Azure Queue Streams and PubSub storage are provisioned, but production source has no Streams consumer. | They are retained only until Stage 2 proves removal is safe. Synapse outbox delivery does not use them. |
| AI safe point | Direct agent session state persists at tool-result safe points and stream completion. | A crash between an external effect and its following result safe point remains explicit debt. |
| Verification | The former central test suite was intentionally deleted; existing source is current authority. | Final hardening must design tests owned by each module rather than recreate one central test project. |

## Ratified next

- Extract **Conversation** into its own domain module between UI and AI. Conversation messages
  become canonical history, each conversation has FIFO durable turns, and exactly one responder
  connection is selected.
- Build **Behavior** on the restored Scripting capability as an approved, immutable, versioned
  single-file C# capability. Generated code runs out of process with no ambient network,
  filesystem, process, or environment authority; all effects cross durable Execution.
- Remove unused Streams/PubSub only after a source proof confirms no consumer, and remove the
  duplicated module catalogs by giving composition one authoritative seam.
- Complete the northbound MCP identity boundary and Salesforce callback registration before the
  Stage-1 exit is declared.
- Design a proper module-owned testing framework during final hardening. Tests belong beside their
  owning module, not in one central project.

Ratified product intent is not an implementation claim. For current operation, use
[Run DigitalBrain locally](/getting-started); for the current system shape, use
[Architecture](/architecture).
