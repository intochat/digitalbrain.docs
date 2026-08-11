# DigitalBrain documentation refit design

**Approved:** 2026-08-11

## Purpose

Replace the public documentation with a compact handbook that describes the product implemented in
`intochat/digitalbrain` today. The site serves two readers without mixing their paths:

- operators who need to start, bootstrap, and understand the local product;
- maintainers who need the runtime architecture, module seams, permanent wire contracts, current
  limitations, and contribution rules.

The refit is a replacement, not an incremental correction of the pre-refit documentation.

## Authority

Documentation claims follow this order:

1. production source on the current `master` branch;
2. `plans/RATIFIED-PRODUCT-DEFINITION.md` for product intent, explicitly labelled when it describes
   future work rather than implemented behavior;
3. `plans/stage1/reports/Stage1-exit-audit.md` for verified limitations and live-smoke evidence;
4. public documentation, which explains but never overrides the sources above.

The documentation refit changes only `E:\intochat\digitalbrain.docs`. The product repository remains
read-only during this work.

## Accuracy rules

- Every page distinguishes **Implemented now**, **Known limitation**, and **Ratified next**.
- No deleted project, route, type, command, package, test suite, or sample is presented as current.
- No automated-test claim is made. The central suite is intentionally deleted, Flutter test files
  are not current authority, and module-owned testing is deferred to final hardening.
- `DigitalBrain.Modules.Salesforce.Contracts` is a permanent module interface and is never described
  as cleanup residue.
- Existing Orleans aliases are permanent wire contracts. Documentation may group or explain them
  but never rename them.
- Handwritten partial classes are not part of the current architecture. Source-generated partial
  wire interfaces remain valid contract surfaces.
- The current chat implementation remains in the UI module. The planned Conversation module is
  described only as future architecture.
- Behavior Studio is labelled preview/demo-only because the behavior host and install rail do not
  exist.
- The northbound MCP authentication/scoping gap and Salesforce callback registration mismatch are
  stated plainly.
- AppHost examples use Aspire lifecycle commands and require AppHost to be stopped before builds.
- No new package is introduced for documentation rendering, diagrams, or validation.

## Information architecture

```text
index.md
getting-started.md
concepts.md
architecture.md
architecture/
  kernel-runtime.md
  module-system.md
  chat-execution.md
  hosting-security.md
modules.md
reference/
  http-surface.md
  wire-contracts.md
status.md
contributing.md
README.md
```

### `index.md`

Present DigitalBrain as a private, durable operating system for one person or a small team. Lead
with neurons, synapses, the connection graph, durable execution, and the currently runnable Flutter
shell. Link directly to local startup, concepts, architecture, modules, and status.

### `getting-started.md`

Replace the fictional package-authoring quickstart with the real local product path:

1. prerequisites from the checked-in SDK, Aspire, Docker, and Flutter configuration;
2. start the checked-in AppHost with `aspire start`;
3. understand the Kernel, MCP, Flutter, Azurite, Qdrant, and Ollama resources;
4. bootstrap the first Owner through the anonymous bootstrap endpoint;
5. explain Development loopback impersonation and why it requires a stored bootstrap Owner;
6. explain the persistent Azurite volume and persistent container lifetime;
7. stop Aspire before building.

The page must state that the first run starts with empty identity storage and that failed Flutter
streams may require a Flutter restart after bootstrap.

### `concepts.md`

Define only vocabulary present in source: workspace, Owner/Admin/Builder/Viewer, actor context,
neuron, synapse, request synapse, journal, outbox, connection, connection graph, module, integration,
execution, attempt, operation, blocker, surface, and wire alias. Keep directed requests distinct from
facts. Put Behavior in a visibly separate future section.

### `architecture.md`

Provide the one-page system map and route readers to focused pages. Use a small text diagram and
tables so the architecture remains readable without a custom Vue component or diagram dependency.
The map follows the current flow:

```text
Flutter -> Kernel HTTP/auth/SSE -> UI chat -> Execution -> AI assistant -> MCP integrations
                   |                 |             |
                   +---------- connection graph --+
                                      |
                         UI, Time, Memory, Introspection
```

### `architecture/kernel-runtime.md`

Explain the decomposed runtime behind the `Neuron` interface: single-threaded turns, incoming and
outgoing journals, journal-is-outbox, at-least-once delivery, receiver deduplication, direct Send
versus graph-routed Emit/Fire, capability-call reification, settled refusal, graph connections,
relays, transforms, and the permanent alias families.

### `architecture/module-system.md`

Describe contracts/runtime/optional Aspire-hosting project families, reflected manifests,
composition, and the current duplicated AppHost/Kernel catalogs. Explain that package availability
and AppHost selection are distinct. List shared SDK rails separately from provider modules.

### `architecture/chat-execution.md`

Trace one chat turn from authenticated HTTP command through principal scoping, FIFO chat admission,
`IExecution`, worker lease, AI streaming, journal observation, cancellation, reconnect, bounded
receipts/operations, and `OutcomeUncertain`. State that HTTP/SSE observes work and does not own its
lifetime.

### `architecture/hosting-security.md`

Document the actual Aspire graph, Azurite persistence, Qdrant, Ollama models, Flutter host, Kernel,
and northbound MCP app. Explain cookie identity, Development loopback authentication, workspace
roles, principal-scoped chat/surfaces, per-user integration OAuth, protected tokens, anonymous
endpoint exceptions, HTTPS stance, and the unresolved northbound MCP boundary.

### `modules.md`

Replace the old AI/Tasks/Countdown matrix with the current source inventory:

- AI;
- Execution;
- UI and Flutter;
- Time;
- Memory;
- Introspection;
- SDK MCP and webhook rails;
- Google;
- Salesforce.

For each module, name its contract/runtime/hosting projects, current neuron and synapse vocabulary,
composition hook, backing resource, and implemented limitations. Google and Salesforce are thin
definitions over the generic MCP/OAuth rail; Salesforce Contracts remains documented as permanent.

### `reference/http-surface.md`

Inventory routes mapped by the Kernel and MCP hosts. For each route family, record method, auth
stance, principal scoping, response/stream role, and whether it is a product, diagnostic, or required
anonymous endpoint. Do not infer endpoints from old documentation.

### `reference/wire-contracts.md`

Explain alias permanence, alias namespaces (`db.*`, `chat.*`, `ui.*`, `time.*`, `memory.*`, and
`introspection.*`), Orleans identity encoding, and compatibility obligations. Link to owning source
files rather than duplicating every record definition.

### `status.md`

Replace the obsolete test specification with three explicit inventories:

- implemented and locally smoke-observed;
- implemented but carrying known limitations;
- ratified future work that must not be read as shipped.

Include the unauthenticated/unscoped northbound MCP boundary, Salesforce callback registration,
manual first-owner bootstrap, Conversation extraction, unused Streams/PubSub provisioning,
duplicated module catalogs, Behavior host absence, and deferred module-owned testing.

### `contributing.md`

Record the current source-first workflow: characterize, minimal coherent change, adversarial
self-review, build/static analysis, and focused commit. Include the no-test amendment, per-module
future testing direction, no-new-package rule, no handwritten partial classes, permanent wire
aliases, retained Salesforce Contracts, and AppHost/build lifecycle. Use commands that exist on
`master`; do not reference the deleted gate script.

### `README.md`

Explain the VitePress repository, local preview/build commands, page ownership, source-authority
rules, and GitHub Pages deployment. It must not instruct contributors to run deleted docs tests.

## Deletion and replacement matrix

| Existing content | Action | Reason |
| --- | --- | --- |
| `quickstart.md` | Delete after `getting-started.md` exists | References deleted Quickstart projects, tests, partial classes, and `IEmit<T>` |
| `specification.md` | Delete after `status.md` exists | Entirely describes deleted centralized test tiers |
| `architecture.md` | Rewrite | Useful canonical URL, obsolete implementation claims |
| `concepts.md` | Rewrite | Includes TestBrain, Tasks, Countdown, and removed interfaces |
| `contributing.md` | Rewrite | Requires deleted tests and gate commands |
| `architecture/*.md` | Delete and recreate only the four approved pages | Imported pre-refit design duplicates obsolete architecture |
| `.vitepress/theme/ArchitectureMap.vue` | Delete | Encodes Tasks, Countdown, typed Gmail/Salesforce, and old status claims |
| `.vitepress/theme/architecture-data.js` | Delete | Same stale architecture encoded as data |
| `.vitepress/theme/index.js` | Delete | Exists only to register the obsolete map |
| `tests/*` | Delete | Owner deferred all automated testing; these tests enforce the obsolete map |

## Site configuration

- Rewrite `.vitepress/config.mts` navigation and sidebar around Start, Architecture, Product, and
  Reference sections.
- Keep VitePress local search, the custom domain, logo, sitemap, GitHub link, and default theme.
- Remove the package `test` script and all test execution from the Pages workflow.
- Keep `npm run build` as the documentation verification and deployment command.
- Keep `package-lock.json`, `LICENSE`, `.gitignore`, and `public/CNAME`.

## Verification

No automated test command will run. Verification consists of:

1. `npm run build` completing successfully with VitePress dead-link checking enabled;
2. a stale-term scan proving removed projects and claims do not remain in published pages;
3. an inventory comparison against current project files, AppHost composition, route maps, module
   declarations, aliases, and package versions;
4. a final git diff review confirming only the documentation repository changed;
5. an adversarial claim review distinguishing source-observed behavior from ratified future work.

## Acceptance criteria

- Every navigation target exists and the VitePress production build completes.
- A new reader can start the actual local product and understand first-owner bootstrap.
- Architecture pages match the current master source and do not mention removed product shapes as
  implemented.
- Every current module appears once in the module inventory with an honest status.
- Current security and durability gaps are visible rather than softened.
- No published page depends on the deleted test architecture or obsolete interactive map.
- The docs repository contains no new dependency and the product repository is untouched.
