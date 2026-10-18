# Open-source and commercial model

**Proposed product decisions · 17 October 2026.** Charge for an operated service and useful application outcomes only after users can obtain them reliably. Do not require marketplace commissions to finance a pilot before there are external publishers, actual payments, or measured costs.

## Separate the things being sold

| Boundary | Proposed treatment | Evidence required before a promise |
| --- | --- | --- |
| Framework contracts and SDK examples | Candidate for a permissive license to reduce developer adoption friction | Ownership, dependency-license review, documented supported API, reproducible package |
| Runtime source and self-hosting | Decide explicitly; source availability and supported self-hosting are different offers | License inventory, install/upgrade/backup instructions, operating responsibility |
| IntoChat Cloud | Paid operation, access management, reliability, storage, support, and bounded usage | Deployment evidence, terms, recoverability, cost accounting, payment reconciliation |
| First-party applications | Included bundle or clearly priced optional capability | Accepted outcomes and variable costs per category |
| External applications | Later publisher contracts, entitlements, and settlement rules | Review operations, buyer support, refund allocation, independently maintained supply |
| Services | Optional onboarding or integration assistance with a stated scope | Delivery capacity and accounting that separates services from repeatable product revenue |

No license change is made by this documentation. Do not describe all current repositories as open source without an applicable grant. A permissive SDK can coexist with a commercial Cloud; trademark rights and hosted-service terms still need separate treatment.

## Licensing options and the decision they create

A permissive framework/SDK lowers integration friction and permits commercial derivative use, but does not prevent competing hosting. A reciprocal open-source runtime can require sharing certain modifications under its specific license, while adding procurement and compatibility considerations. A source-available runtime can reserve commercial rights, but should be described accurately rather than advertised as unrestricted open source.

**Recommended decision to evaluate:** keep developer-facing contracts, samples, and packaging guidance easy to adopt; monetize hosted operations and supported workflows. Choose runtime licensing after establishing ownership and the actual distribution model. Do not add a licensing rewrite to the initial deployment critical path.

Third-party boundaries matter before reuse: Dify's added multi-tenant and branding conditions differ from standard Apache; n8n's SUL is not blanket permission to sell a hosted automation platform; MIT framework rights do not include every associated managed service. The [market review](./market) links the actual licenses and current service boundaries.

## Founder-led distribution before marketplace economics

Recruit people with a real recurring job through existing professional contacts and relevant creator/developer communities, without claiming an established audience. Offer an observed trial around their own task. Publish honest demonstrations that show inputs, corrections, cost, and limitations. Ask participants who repeats the same job rather than optimizing for broad sign-ups.

After a reliable first-party bundle, publish a developer walkthrough that another person can reproduce. External assistant ecosystems may later distribute a useful connector or plugin, but access, review, monetization, and account rules remain external dependencies. An integration should do a useful bounded job in that host; a listing that merely redirects users is weak product evidence.

Maintain the direct workspace as the place where the product's own user relationship, export, support, and commercial terms can be explained. Measure actual referred activation and repeated outcomes before treating any channel as scalable acquisition.

## Marketplace money is a later operating system

Before charging for third-party apps, decide seller of record, tax collection responsibilities, settlement currency, refund and dispute allocation, payout schedules, reserves, and support escalation. These are unresolved commercial design decisions requiring the chosen provider and jurisdiction; no legal arrangement is asserted here.

Do not quote an arbitrary marketplace take rate. Model what the platform actually provides and what each party pays. A commission on app revenue, a compute fee, and a Cloud subscription can overlap confusingly unless the customer sees an understandable total. Measure contribution for the platform and the publisher separately.

The founder-mentioned separate billing implementation is an unconfirmed option, not a delivery dependency. Evaluate it only when code, contracts, operating access, security behavior, and reconciliation tests are available. See [pricing](./pricing), [marketplace](./marketplace), and [founder decisions](./hypotheses).

## 2026-10-18: MIT stamp limited to SDK packages

The os repository now stamps `MIT` only on SDK-tier packages: the `DigitalBrain` vocabulary, `DigitalBrain.Client`, `DigitalBrain.Client.Orleans`, `DigitalBrain.Aspire.Client`, the testing harness (`DigitalBrain.Testing`, `DigitalBrain.Testing.Aspire`, `DigitalBrain.Aspire.Testing`, `DigitalBrain.Testing.Playwright`) and every `*.Contracts` package, including `DigitalBrain.Authority.Contracts`. Runtime packages (framework, authority, `DigitalBrain.Authority.Hosted`, module runtimes, hosting adapters, the OS host) carry no licence expression. `dotnet pack` accepts that without a warning. The runtime licence is still undecided and follows the recommendation above.

Branded claim names in the session cookie (`intochat.account`, `intochat.brain`, the hosted `intochat.*` grant claims) are now configurable, but their defaults keep the historical values because live cookies carry them. The identity directory key `intochat-identity-directory` is persisted state. Renaming any of them needs a planned migration, for example in v0.2, that signs every session out.
