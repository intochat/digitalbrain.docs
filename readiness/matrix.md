# Project coverage and readiness method

The readiness assessment is an implementation inventory of **the complete inspected product across both repositories**, not just a list of release risks. Detailed tables separate feature implementation, active wiring, local tests and production verification. This page maps source areas to those tables so that an entire project cannot disappear behind a generic “billing” or “models” row.

## Source coverage map

| Repository / source area | Behaviors assessed | Detailed inventory |
|---|---|---|
| Cloud API and application contracts | HTTP routes, authentication, account access, checkout, billing, admin and runtime access | [Cloud inventory](./cloud-inventory) |
| Cloud `IntoChat.Server.Infrastructure` | Identity providers, Stripe, reconciliation, budgets, managed models, provisioning, lifecycle, database, jobs and gateways | [Cloud inventory](./cloud-inventory) and [billing analysis](./billing) |
| Cloud domain, DTO, Comms and shared projects | Account/resource/payment records, transport contracts and supporting implementation | [Cloud inventory](./cloud-inventory) |
| Cloud `IntoChat.WebUI` | Sign-in, account/resource management, checkout, invoices/cards, cloud settings and admin UI | [Cloud inventory](./cloud-inventory) |
| Cloud `IntoChat.DeploymentKit`, `IntoChat.Infrastructure`, `Aspire`, service defaults and workflows | Azure resource construction, local orchestration, telemetry, packaging and deployment | [Cloud inventory](./cloud-inventory), [operations](./operations) |
| Cloud bot and legacy travel/payment surfaces | Retained service implementation versus active product wiring | [Cloud inventory](./cloud-inventory) |
| Cloud server/bot/frontend test projects | Actual run totals, skipped DB checks, fixtures and legacy coverage | [Cloud inventory](./cloud-inventory), [verification](./verification) |
| DigitalBrain Framework | Neurons, synapses, signals, bindings and execution contracts | [Runtime inventory](./runtime-inventory) |
| DigitalBrain Client | Runtime access, transport, subscriptions and client contracts | [Runtime inventory](./runtime-inventory) |
| DigitalBrain Platform | Identity, permission enforcement, state/journal, keys, OAuth, ledger, usage and hosting | [Runtime inventory](./runtime-inventory) |
| DigitalBrain OS | Account workspace, module catalog, app defaults and runtime composition | [Runtime inventory](./runtime-inventory), [architecture](./architecture) |
| DigitalBrain AI module and model catalogs | Six individual chat adapters, embeddings, images, speech, local decisions, tool use and metering | [AI providers](./providers) |
| DigitalBrain Apps and CSharp modules | App creation/install/publish, marketplace, generated-code compilation and runtime sessions | [Runtime inventory](./runtime-inventory) |
| DigitalBrain Flutter module/client | UI contracts, workspace shell, composer, rendering and client tests | [Runtime inventory](./runtime-inventory) |
| DigitalBrain remaining module directories | Every active module and optional/excluded connector; external service dependencies | [Connectors and modules](./integrations) |
| DigitalBrain `features/os` and `features/intochat` | Each default app and additional feature directory | [Application inventory](./applications) |
| DigitalBrain hosts, Aspire, tools, test and supporting projects | Orchestration, sandbox/MCP hosting, developer tools and verification coverage | [Runtime inventory](./runtime-inventory), [operations](./operations) |

The inventory is grouped by behavior rather than counting generated files, package caches or data-transfer types as independent product features. Supporting projects are included in the coverage tables. “All project” means the inspected source areas and their product capabilities; it does not imply inspection of inaccessible deployment accounts or private implementations outside these repositories.

## Four independent questions

| Axis | Allowed descriptions | Example |
|---|---|---|
| **Implementation** | Implemented; partial with a named missing behavior; stub/schema only; not found in inspected scope | Stripe subscriptions: **implemented** |
| **Wiring / availability** | Active registration/route; configurable; excluded from default; retained legacy/retired; host-supplied | Older user refund service: implementation retained, route retired |
| **Verification** | Source inspected; tests present but not run; named suite passed; named check failed/skipped; live sandbox/provider exercised | Cloud suite: 120 passed, 66 skipped; no live Stripe payment run |
| **Production** | Verified with dated deployment evidence; not verified in this audit | Stripe and AI providers: **not verified** |

Do not use “partial” to mean “implemented but not production-tested.” Do not use a passing package suite to claim every adapter, route or app was individually tested. A configured factory can be implemented without credentials being present. A schema with no transport is a real implementation gap.

## Concrete examples

| Feature | Correct assessment | Why |
|---|---|---|
| Stripe subscription creation | Implemented; configuration-dependent; live payment unexecuted; production unverified | `CloudBillingProvider.CreateSubscriptionAsync` calls Stripe with catalog/mode checks and idempotency |
| Stripe webhook receipt | Implemented; source inspected; production unverified | `CloudBillingWebhookReceiver` verifies signature/mode and inserts a deduplicated durable inbox record |
| Account refund request | Implemented **review request**; automatic refund execution is a separate question | `AccountBillingService.RequestActionAsync` stores `refund.review` with `needs_review` |
| OpenAI / Anthropic / Google / xAI / OpenRouter / Ollama chat | Each implemented; live provider operation unexecuted; production unverified | Each has a factory/adapter, documented separately in the provider inventory |
| Tavily | Schema/options only for the inspected capability | Declared configuration does not establish an executable search transport |
| Excluded payment/communications modules | Implementation assessed individually; excluded from default composition | `OsCatalog` comments out Monnet, Equifax, RiskSeal and Twilio |
| App journey test file | Tests present; not automatically a current journey pass | `ShippedAppJourneys` assertions have different depth per application |

## Verification coverage

At the audited revisions, OS build passed; Platform 248 tests passed; Apps 264 passed; 11 selected Flutter tests passed; cloud .NET 120 passed / 66 skipped; cloud frontend 447 passed. OS unit test restore was blocked by `NU1902`. No live provider calls, Stripe settlement or production deployment were performed. See [exact execution evidence](./verification) before interpreting these totals.

These results remain valid for the earlier recorded source snapshot; this documentation correction does not rerun or silently broaden those application checks. Source-specific limitations and test names are recorded beside the relevant features in the inventories.

## Keep release risks separate

An implemented mechanism may still fail a release acceptance requirement. For example, runtime usage metering exists, while universal account-wide prepaid admission is not established; a sandbox runner exists, while deployed adversarial isolation is unverified. Record both facts. Use [security](./security), [billing](./billing), [operations](./operations) and [backlog](./backlog) for acceptance conditions, without erasing implementation from the feature inventory.
