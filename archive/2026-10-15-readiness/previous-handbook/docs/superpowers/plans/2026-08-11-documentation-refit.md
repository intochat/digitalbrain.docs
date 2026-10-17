# DigitalBrain Documentation Refit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete public site with a source-aligned handbook for running, understanding, and maintaining the current DigitalBrain product.

**Architecture:** Keep VitePress and the public deployment shell, replace the content model with focused operator, architecture, module, reference, and status pages, and remove the custom diagram/test machinery that encodes the former architecture. Every implementation claim is traced to current `master` source; ratified future work is isolated and labelled.

**Tech Stack:** Markdown, VitePress 1.6.4, Node.js 24 in GitHub Actions, npm, GitHub Pages.

## Global Constraints

- Change only `E:\intochat\digitalbrain.docs`; treat `E:\intochat\digitalbrain` as read-only source evidence.
- Work in the explicitly approved current `main` checkout; preserve commits `899090c4` and `42dee1bd`.
- Production source on current product `master` is behavioral truth.
- No automated tests are created or run; module-owned product testing remains final-hardening work.
- No new npm or product package is added.
- Keep `DigitalBrain.Modules.Salesforce.Contracts` as a permanent module interface.
- Preserve all existing wire aliases exactly.
- Describe zero handwritten partial classes; source-generated partial wire interfaces remain valid.
- Use Aspire lifecycle commands for AppHost operation; never instruct users to run the AppHost with `dotnet run`.
- Distinguish **Implemented now**, **Known limitation**, and **Ratified next** on every status-bearing page.
- Validate with `npm run build`, source/stale scans, and adversarial diff review only.

---

### Task 1: Freeze Current Source Facts

**Files:**
- Read: `E:\intochat\digitalbrain\global.json`
- Read: `E:\intochat\digitalbrain\Directory.Packages.props`
- Read: `E:\intochat\digitalbrain\src\Kernel\DigitalBrain.AppHost\AppHost.cs`
- Read: `E:\intochat\digitalbrain\src\Kernel\DigitalBrain.Kernel\Program.cs`
- Read: `E:\intochat\digitalbrain\src\Kernel\DigitalBrain.Kernel\HttpSurfacePaths.cs`
- Read: `E:\intochat\digitalbrain\src\Kernel\DigitalBrain.Kernel\DigitalBrainComposition.cs`
- Read: `E:\intochat\digitalbrain\plans\RATIFIED-PRODUCT-DEFINITION.md`
- Read: `E:\intochat\digitalbrain\plans\stage1\reports\Stage1-exit-audit.md`

**Interfaces:**
- Consumes: approved design `docs/superpowers/specs/2026-08-11-documentation-refit-design.md`.
- Produces: exact SDK versions, AppHost resources, module inventory, HTTP route inventory, auth stance, current gaps, and permanent vocabulary used by Tasks 2–5.

- [ ] **Step 1: Record clean repository heads**

Run:

```powershell
git status --short --branch
git -C E:\intochat\digitalbrain status --short --branch
git -C E:\intochat\digitalbrain log -1 --oneline
```

Expected: docs `main` has no uncommitted files; product `master` is read-only and clean.

- [ ] **Step 2: Extract source-owned inventories**

Run focused `rg` scans for `MapAuth`, `MapOwnerCommands`, `MapChatStreams`, `MapSurfaceStreams`,
`MapAuthorizationStreams`, `MapBrainTopology`, `MapGraphStreams`, module declarations, AppHost
`AddModule` calls, contract aliases, and Aspire resources. Capture only facts that appear in source.

- [ ] **Step 3: Resolve contradictions explicitly**

Use these decisions throughout the rewrite:

```text
Tasks -> Execution
Countdown -> Timer
typed Gmail/Salesforce operations -> generic MCP catalog and OAuth rail
TestBrain/central tests -> deferred module-owned testing
Quickstart sample topology -> actual DigitalBrain AppHost topology
Memory out of scope -> Qdrant-backed Memory module implemented
Behavior runtime -> preview UI only; host/install rail absent
```

### Task 2: Replace the Operator and Concept Entry Pages

**Files:**
- Modify: `index.md`
- Create: `getting-started.md`
- Modify: `concepts.md`
- Create: `status.md`

**Interfaces:**
- Consumes: Task 1 SDK, resource, auth, vocabulary, and limitation inventories.
- Produces: canonical entry routes `/`, `/getting-started`, `/concepts`, and `/status` used by the final navigation.

- [ ] **Step 1: Rewrite the landing page**

Keep VitePress home frontmatter. Use these feature groups: durable neurons, immutable synapses,
runtime connection graph, durable executions, private workspace identity, and current Flutter shell.
Remove TestBrain and Behavior-SDK-as-shipped claims. Point actions to `/getting-started`,
`/concepts`, `/architecture`, `/modules`, and `/status`.

- [ ] **Step 2: Write the real local startup path**

`getting-started.md` must include exact prerequisites, the checked-in AppHost path, `aspire start`,
resource expectations, first-owner `POST /auth/bootstrap`, Development loopback impersonation,
persistent Azurite behavior, Flutter reconnect guidance, `aspire stop`, and build/static commands.
Never include real credentials; use clearly synthetic local examples.

- [ ] **Step 3: Rewrite concepts from source vocabulary**

Use sections for Workspace and Actor, Neuron, Synapse and RequestSynapse, Journal and Outbox,
Connection Graph, Module, Integration, Execution/Attempt/Operation/Blocker, Surface, and Wire Alias.
Put Behavior under `Ratified next` and state that no behavior host or install rail exists.

- [ ] **Step 4: Replace the test specification with status**

`status.md` must separate smoke-observed current behavior, source-implemented limitations, and
ratified next architecture. It must name the northbound MCP auth/scoping blocker, Salesforce callback
registration mismatch, manual first bootstrap, missing Behavior host, Conversation extraction,
unused Streams provisioning, duplicated module catalogs, and deferred module-owned testing.

- [ ] **Step 5: Verify entry pages**

Run:

```powershell
npm run build
```

Expected: VitePress production build succeeds; no automated test command runs.

- [ ] **Step 6: Commit entry pages**

```powershell
git add index.md getting-started.md concepts.md status.md
git commit -m "docs: replace product entry guide"
```

### Task 3: Replace the Architecture Set

**Files:**
- Modify: `architecture.md`
- Create: `architecture/kernel-runtime.md`
- Create: `architecture/module-system.md`
- Create: `architecture/chat-execution.md`
- Create: `architecture/hosting-security.md`

**Interfaces:**
- Consumes: Task 1 inventories and Task 2 terminology.
- Produces: canonical architecture routes used by modules, reference pages, status, and navigation.

- [ ] **Step 1: Write the system overview**

Use a dependency/flow diagram in a plain text block and a responsibility table for Flutter,
Kernel HTTP edge, UI chat, Execution, AI, MCP integrations, connection graph, and supporting modules.
Link each responsibility to one focused architecture page. State that current chat still belongs to
UI and Conversation extraction is future work.

- [ ] **Step 2: Document the kernel runtime**

Cover single-threaded turns, decomposed collaborators, dual journals, journal-is-outbox,
at-least-once delivery, receiver dedupe, Emit/Fire versus Send, capability reification, settled
refusal, connection graph, relay transforms, and bounded journal/delivery memory. Do not resurrect
`IEmit<T>` or handwritten partial classes.

- [ ] **Step 3: Document module composition**

Cover contracts/runtime/optional Aspire-hosting families, `ModuleAssemblies`, reflected manifests,
AppHost selection, Kernel composition, module availability versus activation, SDK rails, and the
explicit duplicated-catalog limitation.

- [ ] **Step 4: Document chat and durable execution**

Trace authenticated actor -> principal-scoped chat -> FIFO turn -> `IExecution` -> worker lease ->
AI/MCP -> journal projection. Include observer-only HTTP cancellation, reconnect sequence, bounded
receipts/operations, explicit cancellation, and `OutcomeUncertain` reconciliation.

- [ ] **Step 5: Document hosting and security**

Cover Azurite with data volume and persistent lifetime, Orleans tables/journal/queues, Qdrant,
Ollama Gemma4/Llama32, Flutter window host, Kernel, MCP app, cookie identity, bootstrap/login,
Development loopback behavior, roles, actor stamping, per-user OAuth, token protection, required
anonymous routes, HTTPS beyond loopback, and the MCP blocker.

- [ ] **Step 6: Verify and commit architecture pages**

```powershell
npm run build
git add architecture.md architecture/kernel-runtime.md architecture/module-system.md architecture/chat-execution.md architecture/hosting-security.md
git commit -m "docs: replace architecture reference"
```

Expected: production build succeeds before the commit.

### Task 4: Add Module and Runtime Reference Pages

**Files:**
- Create: `modules.md`
- Create: `reference/http-surface.md`
- Create: `reference/wire-contracts.md`

**Interfaces:**
- Consumes: Task 1 source inventory and Task 3 architecture terminology.
- Produces: `/modules`, `/reference/http-surface`, and `/reference/wire-contracts`.

- [ ] **Step 1: Write the module inventory**

For AI, Execution, UI/Flutter, Time, Memory, Introspection, SDK MCP/Webhook, Google, and Salesforce,
record project family, current interface/vocabulary, implementation role, Aspire resource when any,
and known limitation. State that Google and Salesforce configure the generic MCP rail and that
Salesforce Contracts remains permanent even when provider work is catalog-driven.

- [ ] **Step 2: Write the HTTP surface inventory**

Derive every row from route maps. Group auth, owner commands, chat events, surface events,
authorization events, graph/topology, OAuth callback, health/liveness, Orleans dashboard, and the
separate `/mcp` host. Record method, auth exception/fallback behavior, principal scoping, and purpose.

- [ ] **Step 3: Write the wire-contract guide**

Explain permanent aliases, alias families, `NeuronId`/owner/principal identity roles, deterministic
string-key encoding, command/correlation/synapse identifiers, and compatibility rules. Link readers
to source-owning assemblies instead of duplicating every schema.

- [ ] **Step 4: Verify and commit reference pages**

```powershell
npm run build
git add modules.md reference/http-surface.md reference/wire-contracts.md
git commit -m "docs: add current module and wire reference"
```

Expected: production build succeeds before the commit.

### Task 5: Replace Site Navigation and Delete Obsolete Content

**Files:**
- Modify: `.vitepress/config.mts`
- Modify: `.github/workflows/pages.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `contributing.md`
- Delete: `quickstart.md`
- Delete: `specification.md`
- Delete: `architecture/behaviors-registry-and-discovery.md`
- Delete: `architecture/hosting-durability-testing.md`
- Delete: `architecture/kernel-and-module-model.md`
- Delete: `architecture/modules-ai-tasks.md`
- Delete: `architecture/modules-flutter-memory.md`
- Delete: `architecture/modules-integrations.md`
- Delete: `architecture/modules-time.md`
- Delete: `architecture/ratified-rules-and-open-deviations.md`
- Delete: `.vitepress/theme/ArchitectureMap.vue`
- Delete: `.vitepress/theme/architecture-data.js`
- Delete: `.vitepress/theme/index.js`
- Delete: `tests/architecture-diagram.test.mjs`
- Delete: `tests/links.test.mjs`
- Delete: `tests/support.mjs`

**Interfaces:**
- Consumes: all replacement routes from Tasks 2–4.
- Produces: final VitePress navigation, deployment workflow, contributor workflow, and a repository with no obsolete published architecture.

- [ ] **Step 1: Rewrite navigation**

Use top navigation for Start, Architecture, Modules, Status, and GitHub. Use sidebar groups Start,
Architecture, Product, Reference, and Project, linking only to replacement pages. Keep search,
sitemap, CNAME behavior, logo, footer, and default theme.

- [ ] **Step 2: Rewrite repository and contribution guides**

`README.md` documents `npm ci`, `npm run dev`, and `npm run build`, source-authority order, page
ownership, and Pages publishing. `contributing.md` documents characterize -> minimal coherent change
-> adversarial review -> build/static verification -> commit; it also records no tests, no new
packages, no handwritten partial classes, permanent aliases, Salesforce Contracts, and AppHost
lifecycle.

- [ ] **Step 3: Remove test execution and obsolete files**

Delete the `test` package script, remove `npm test` from Pages, and delete every file listed above.
Use patch-based file deletion so the exact tracked targets are auditable. Do not remove `LICENSE`,
`.gitignore`, `package-lock.json`, `public/logo.svg`, or `public/CNAME`.

- [ ] **Step 4: Run final content scans**

Run:

```powershell
rg -n -i 'DigitalBrain\.Tests|DigitalBrain\.Testing|TestBrain|Quickstart\.Contracts|QuickstartModule|DigitalBrain\.Tasks|ITask|ICountdown|WithUiEdge|IEmit<|sealed partial class|dotnet test|npm test' --glob '*.md' --glob '*.mts' --glob '*.json' --glob '*.yml' --glob '!docs/superpowers/**'
rg -n 'IGmail|ISalesforce|Gpt56|Memory.*out of scope' --glob '*.md' --glob '!docs/superpowers/**'
npm run build
```

Expected: first scan has no published stale claim; second scan contains only explicit compatibility
or limitation explanations if retained; production build succeeds.

- [ ] **Step 5: Review and commit site replacement**

```powershell
git diff --check
git status --short
git add .github .vitepress README.md contributing.md package.json quickstart.md specification.md architecture tests
git commit -m "docs: remove obsolete site architecture"
```

Expected: only docs-repository files are staged, and the product repository remains untouched.

### Task 6: Adversarial Exit Audit

**Files:**
- Review: all changes after commit `42dee1bd`
- Review: current product source files named in Task 1

**Interfaces:**
- Consumes: the complete replacement site.
- Produces: verified completion evidence and any minimal corrective documentation commit.

- [ ] **Step 1: Compare the final site to the approved design**

Check every acceptance criterion in
`docs/superpowers/specs/2026-08-11-documentation-refit-design.md`. Confirm each planned route exists,
each current module appears once, current and future states are separated, and every approved delete
is absent.

- [ ] **Step 2: Re-read high-risk claims against source**

Re-check AppHost models/resources, Azurite persistence, auth middleware order, bootstrap behavior,
anonymous routes, principal scoping, Execution bounds/liveness, AI models, MCP authorization, Google
and Salesforce definitions, Flutter environment variables, and permanent alias wording.

- [ ] **Step 3: Run completion verification**

```powershell
npm run build
git diff --check 42dee1bd..HEAD
git status --short --branch
git -C E:\intochat\digitalbrain status --short --branch
```

Expected: build succeeds, docs working tree is clean after commits, and product working tree remains
clean and unchanged by this work.

- [ ] **Step 4: Correct only evidenced discrepancies**

If the audit finds a false or ambiguous claim, patch the owning page, rerun `npm run build`, review
the exact diff, and commit with:

```powershell
git commit -m "docs: correct refit audit findings"
```

If no discrepancy exists, make no empty commit.
