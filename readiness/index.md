# Implementation readiness

**IntoChat already implements cloud accounts and provisioning, Stripe billing, six AI chat providers, a persistent agent runtime, a Flutter workspace, applications and connectors. Production operation was not tested in this audit.** Those are separate facts: lack of production verification does not make an implemented feature missing.

This assessment covers **both `intochat-cloud` and `digitalbrain`**, including active features, optional integrations, retained legacy services and incomplete capabilities. Each detailed inventory identifies implementation evidence, wiring, tests and remaining verification separately.

## At a glance

| Capability | Implementation | Local / external verification | Production verification |
|---|---|---|---|
| **Stripe subscriptions and checkout** | **Implemented** — account checkout, customer/subscription creation, card confirmation and recovery | Source inspected; cloud suite has passing tests and database-dependent skips; live Stripe transaction not run | **Not verified** |
| Stripe signed webhooks and reconciliation | **Implemented** — signature/mode checks, durable deduplicated inbox, worker and entitlement reconciliation | Source inspected; see billing test scope in the cloud inventory | **Not verified** |
| Stripe invoices, payment methods and cancellation | **Implemented** — account billing APIs and UI; cancellation outbox | Source inspected; no live card or cancellation operation in this audit | **Not verified** |
| Stripe refunds | **Implemented review request** in active account billing; refund execution service retained behind retired legacy routes | Automatic end-to-end account refund is not established by the review endpoint | **Not verified** |
| **OpenAI** chat | **Implemented** provider factory and adapter | No live provider call in this audit | **Not verified** |
| **Anthropic** chat | **Implemented** provider factory and adapter | No live provider call in this audit | **Not verified** |
| **Google / Gemini** chat | **Implemented** provider factory and adapter | No live provider call in this audit | **Not verified** |
| **xAI / Grok** chat | **Implemented** provider factory and adapter | No live provider call in this audit | **Not verified** |
| **OpenRouter** chat | **Implemented** provider factory and adapter | No live provider call in this audit | **Not verified** |
| **Ollama** chat | **Implemented** provider factory and adapter | No running Ollama service exercised in this audit | **Not verified** |
| Cloud accounts, authentication and runtime access | **Implemented** — identity, membership, account-scoped control plane and runtime protocol | Cloud/backend and frontend checks executed; precise coverage and skips in inventories | **Not verified** |
| Azure runtime provisioning and lifecycle | **Implemented** — deployment, readiness, lifecycle and management clients | Local fixtures/source inspection; no Azure deployment run | **Not verified** |
| Agent runtime, storage, permissions and secrets | **Implemented** — Framework, Client and Platform mechanisms | Platform suite: 248 passing tests; production infrastructure not exercised | **Not verified** |
| App install, generation, publication and marketplace APIs | **Implemented**, with specific generation/recovery limitations | Apps suite: 264 passing tests; live generation and marketplace operation not exercised | **Not verified** |
| Flutter workspace and shipped applications | **Implemented at differing feature depth** — 15 default apps, plus additional feature folders | 11 selected Flutter tests passed; app-specific journey test source is not a current browser pass | **Not verified** |
| Usage metering, prices and ledger | **Implemented** — runtime accounting and cloud budget/gateway mechanisms | Local component tests; cross-system settlement and universal hard-cap coverage unverified | **Not verified** |

“Not verified” means **no production evidence was obtained in this audit**, not that the feature has never been deployed or tested by its owners. Provider chat support does not imply every provider supports embeddings, images, audio or realtime; the [provider inventory](./providers) separates those operations.

## Whole-project inventories

| Inventory | What is assessed |
|---|---|
| [Cloud, accounts and Stripe](./cloud-inventory) | Cloud services and UI, authentication, memberships, billing behaviors, resource admission, Azure provisioning, runtime bridge, operations and retained legacy projects |
| [AI providers and model operations](./providers) | Each chat provider, embeddings, image generation, speech, local decisions, routing and provider registration |
| [Connectors and built-in modules](./integrations) | Individual external services, storage modules, tools, MCP, optional/excluded providers and configuration requirements |
| [Runtime, platform and clients](./runtime-inventory) | Framework, Client, Platform, OS composition, storage, security, application engine, Flutter and supporting projects |
| [Every application](./applications) | All 15 default apps and additional feature directories; actual behavior, implementation limits and journey evidence |
| [Project coverage and status method](./matrix) | Coverage map and independent implementation / wiring / testing / production labels |

## How to read a status

- **Implemented**: a concrete behavior exists in source. It can still require credentials, configuration or verification.
- **Partial**: some of the named behavior is absent or explicitly limited. The row says what is missing. Missing production evidence alone never earns this label.
- **Stub / schema only**: declarations or a placeholder exist without the named executable behavior.
- **Not found**: no implementation was found in the inspected scope; this is not a claim about private or external repositories.

**Wiring is a separate field**: enabled, configurable, excluded from default composition, or retained/retired. **Tests are another field**: source present, local execution passed/failed/skipped, provider sandbox checked, or unexecuted. Production verification is recorded independently throughout.

## Evidence snapshot

Reviewed 17 October 2026: DigitalBrain `faddacfc3b5e7cf3a74adfd0efcf8a17e277540b`; IntoChat Cloud `d9dc9798ca5bfc2b93e2b2b12cd3f3033047d2c6`, with working-tree qualifications in the [evidence record](../reference/evidence). The OS build passed. Platform: 248 passed; Apps: 264 passed; selected Flutter: 11 passed; cloud .NET: 120 passed and 66 skipped; cloud frontend: 447 passed. The OS unit suite was blocked at dependency restore. These are suite results, **not a claim that every row passed an individual end-to-end test**. Exact commands, exclusions and earlier results are in the [verification log](./verification).

## Release acceptance, after implementation inventory

The inventory answers what has been built. The following documents assess what still needs acceptance before particular release promises:

- [Billing and cost enforcement](./billing): implemented payment and accounting paths, live verification and hard spending-limit gaps.
- [Security and sandboxing](./security): permission mechanisms and deployment isolation checks.
- [Deployment and operations](./operations): configuration, CI, migrations, recovery and rollback.
- [End-to-end flows](./flows): cross-component behavior and failure recovery.
- [Prioritized acceptance backlog](./backlog): concrete follow-up checks and fixes, separate from feature existence.

The [architecture map](./architecture) explains repository composition; the [roadmap](../roadmap/) sequences release gates. Neither replaces the implementation inventories above.
