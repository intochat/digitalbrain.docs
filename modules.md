# Modules

The current product is a set of trusted modules composed into one Kernel. Each entry below names
the source-owned contract, runtime, hosting seam, and honest limitation. Remote MCP catalogs extend
what an integration can do; they do not create new DigitalBrain contract types.

## AI

- **Projects:**
  [`DigitalBrain.Modules.AI.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/AI/Contracts),
  [`DigitalBrain.Modules.AI`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/AI/AI),
  [`DigitalBrain.Modules.AI.Aspire.Hosting`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/AI/Aspire.Hosting).
- **Vocabulary:** `IAssistant`, `IAgent`, `ILLM`, `IGroupChat`, `ITeam`, model interfaces, team
  formation, orchestration refusal, and capability-tool selection.
- **Runtime:** typed model/agent neurons, direct-agent protected session, capability tools, and MAF
  orchestration kept inside the module.
- **Hosting:** Ollama/Open WebUI or OpenAI projections. The current AppHost selects `IGemma4`
  (`gemma4:12b`) and `ILlama32` (`llama3.2`) only.
- **Known limitation:** other model contracts are available in source but are not selected by the
  product AppHost. A crash between a provider effect and its following function-result safe point
  remains explicit debt.

## Execution

- **Projects:**
  [`DigitalBrain.Modules.Execution.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Execution/Contracts) and
  [`DigitalBrain.Modules.Execution`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Execution/Execution).
- **Vocabulary:** `IExecution`, `IWorker`, `IExecutionWorkerLease`, Goal, Attempt, Operation,
  Blocker, Apply/Read commands, terminal facts, user-action custody, and explicit operation
  resolution.
- **Runtime:** revision-fenced execution state, 64 retained command receipts, 64 operation rows,
  allow-listed workers, dispatch relay, reminders, 15-second worker lease, recovery, cancellation,
  and `OutcomeUncertain`.
- **Hosting:** no external AppHost resource; it runs in the Kernel silo.
- **Known limitation:** the current product has one concrete chat-turn worker path. External effects
  still need domain adapters to use the operation protocol consistently.

## UI and Flutter

- **Projects:**
  [`DigitalBrain.Modules.UI.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/DigitalBrain.Modules.UI.Contracts),
  [`DigitalBrain.Modules.UI`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/DigitalBrain.Modules.UI),
  [`DigitalBrain.Modules.UI.Aspire.Hosting`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/DigitalBrain.Modules.UI.Aspire.Hosting),
  plus Flutter
  [`core`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/Flutter/core),
  [`kit`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/Flutter/kit), and
  [`shell`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/UI/Flutter/shell).
- **Vocabulary:** `IChat`, `IButton`, `IChart`, `IDiagram`, `ISurface`, chat turns, buttons, charts,
  timer cards, surface-open and control facts.
- **Runtime:** principal-scoped Chat and Surface neurons, durable FIFO chat queue, the Execution
  chat-turn worker, declarative UI components, and Flutter HTTP/SSE projection clients.
- **Hosting:** window, web, or headless launchers. The current AppHost selects the Windows window
  host, shell `desk`, and local chat `main`.
- **Known limitation:** Chat is still owned by UI. Behavior Studio fixtures/client are preview-only
  because no Behavior host or install rail exists.

## Time

- **Projects:**
  [`DigitalBrain.Modules.Time.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Time/Contracts) and
  [`DigitalBrain.Modules.Time`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Time/Time).
- **Vocabulary:** `ITimer`, `StartTimer`, `CancelTimer`, scheduled/elapsed/cancelled facts, status,
  resolution, and snapshot.
- **Runtime:** an owner-bound `TimerNeuron` backed by Orleans reminder/state mechanics.
- **Hosting:** no external AppHost resource.
- **Known limitation:** current contracts cover the implemented timer lifecycle; richer calendar,
  recurrence, and DST policy are not a shipped module surface.

## Memory

- **Projects:**
  [`DigitalBrain.Modules.Memory.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Memory/Contracts),
  [`DigitalBrain.Modules.Memory`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Memory/Memory), and
  [`DigitalBrain.Modules.Memory.Aspire.Hosting`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Memory/Aspire.Hosting).
- **Vocabulary:** `IVectorMemory`, store/search/remove requests and results, vector namespace, match,
  and store status.
- **Runtime:** owner-isolated `VectorMemoryNeuron` over either an in-memory store or Qdrant provider.
- **Hosting:** the current AppHost creates Qdrant, waits for health, and configures it as the Memory
  provider.
- **Known limitation:** the Qdrant projection does not declare the Azurite data volume or persistent
  container lifetime; vector persistence must be treated separately from Kernel journal
  persistence.

## Introspection

- **Projects:**
  [`DigitalBrain.Modules.Introspection.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Introspection/Contracts) and
  [`DigitalBrain.Modules.Introspection`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Introspection/Introspection).
- **Vocabulary:** `IIntrospection`, topology read, journal page read, journal tally, topology neuron,
  connection, and broadcast-route records.
- **Runtime:** `IntrospectionNeuron` delegates owner-neuron inventory, journal, and topology queries
  to focused readers.
- **Hosting:** no external AppHost resource; Kernel HTTP and northbound MCP expose projections of
  its reads.
- **Known limitation:** active topology is an observation of activated grains and live graph state,
  not a static list of every possible neuron instance.

## SDK MCP and webhook rails

- **Project:**
  [`DigitalBrain.Modules.Sdk`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/SDK/DigitalBrain.Modules.Sdk).
- **Vocabulary:** generic `IMcp` tool list/call, `IMcpAuthorization`, actor-bound authorization
  facts, code custody, protected token presence, and verified webhook delivery/duplicate/conflict
  facts.
- **Runtime:** generic MCP transport/session/catalog, PKCE OAuth state machine, protected per-user
  tokens, authorization neuron, and webhook ingress neuron.
- **Hosting:** Google and Salesforce register provider parameters into this rail. The current
  AppHost does not select a provider-specific webhook endpoint.
- **Known limitation:** this southbound integration rail is secure per actor, but the separate
  northbound `DigitalBrain.Mcp` application does not yet use Kernel authentication or principal
  scoping.

## Google

- **Projects:**
  [`DigitalBrain.Modules.Google.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Google/Contracts),
  [`DigitalBrain.Modules.Google`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Google/Google), and
  [`DigitalBrain.Modules.Google.Aspire.Hosting`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/Google/Aspire.Hosting).
- **Current interface:** server key `google.gmail` points at the official Gmail MCP endpoint. The
  remote `tools/list` catalog is the operation surface; the Contracts assembly intentionally does
  not duplicate it as typed Gmail operations.
- **Runtime:** registers one generic `McpServerDefinition` and external-server capability with Gmail
  read-only and compose OAuth scopes.
- **Hosting:** persisted Google Web application client ID/secret parameters plus the composed local
  callback.
- **Known limitation:** live tools require operator credentials, provider availability, and user
  consent. Smoke reached Google's real login redirect but did not fabricate consent/token success.

## Salesforce

- **Projects:**
  [`DigitalBrain.Modules.Salesforce.Contracts`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/SalesForce/Contracts),
  [`DigitalBrain.Modules.Salesforce`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/SalesForce/Salesforce), and
  [`DigitalBrain.Modules.Salesforce.Aspire.Hosting`](https://github.com/intochat/digitalbrain/tree/master/src/Modules/SalesForce/Aspire.Hosting).
- **Current interface:** the Contracts project is the permanent home of Salesforce neuron and
  synapse interfaces. The current runtime reaches the hosted Salesforce MCP mutation catalog
  through the generic rail instead of hard-coding one DigitalBrain record per remote tool.
- **Runtime:** registers server key `salesforce`, the hosted `sobject-mutations` MCP endpoint, scopes
  `mcp_api` and `refresh_token`, and no client-secret requirement.
- **Hosting:** persisted Salesforce External Client App consumer key plus the composed callback; no
  `salesforce-client-secret` parameter exists.
- **Known limitation:** the last live provider request returned `redirect_uri_mismatch`. The
  External Client App must register `http://localhost:5080/oauth/callback` exactly.

## Product state

**Implemented now.** Every module and shared rail above is present in committed production source;
the checked-in AppHost selects the resources described here. Salesforce Contracts and all existing
wire aliases are retained product boundaries.

**Known limitation.** Provider catalogs and consent depend on external systems, module composition
is duplicated between Kernel and AppHost, Qdrant lacks the Azurite persistence profile, and
northbound MCP remains unscoped.

**Ratified next.** Conversation becomes a module, unused Streams/PubSub provisioning is removed only
after proof of non-use, and final hardening introduces tests owned by each module rather than one
central test project.
