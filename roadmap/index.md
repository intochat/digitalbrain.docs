# Product Roadmap

**Дорожная карта продукта · Proposed sequence, gated by evidence.** Deploy the current version first. Establish a repeatable, controlled operation before expanding the product or opening publication to third parties. A broad rewrite is not an entry requirement; audit findings justify specific repairs and release controls.

The [implementation assessment](../readiness/index.md) identifies substantial existing foundations. It does not demonstrate demand, production operation, safe concurrent spending or independent publisher success. The roadmap turns those unknowns into decisions with acceptance evidence.

## The sequence

```mermaid
flowchart LR
  A[Identify release] --> B[Controlled deployment]
  B --> C[Reliable core journeys]
  C --> D[Repeat useful outcomes]
  D --> E[Shared-context value]
  E --> F[Payments and economics]
  F --> G[SDK acceptance]
  G --> H[External publishers]
  H --> I[Measured expansion]
```

**Proposed roadmap.** Security, cost control and recovery remain continuous constraints across every stage. SDK discovery can begin early; opening external publication cannot skip its safety and support gates.

| Stage | Evidence to earn progression | Detailed plan |
| --- | --- | --- |
| Identify and deploy | Pinned release, correct CI target, safe configuration, restore and rollback evidence | [Deployment first](deployment.md) |
| Reliable workspace | Sign-in, isolation, app installation, execution, cancellation and recovery observed | [Core workspace](core.md) |
| Outcome and repeat use | Users finish valuable work and return without continual founder rescue | [Pilot](pilot.md) |
| Shared context and payments | Useful reuse with consent; actual collection and reconciled variable costs | [Metrics and gates](metrics.md) |
| External developers | Independent developer builds, packages and updates a compatible app | [SDK and developers](developers.md) |
| Marketplace | Reviewed supply adopted by real users; removal, updates and support work | [Marketplace launch](marketplace.md) |

## How to use this roadmap

The [epic contracts](epics.md) define scope, evidence, dependencies, suggested owner roles and stop conditions. Owner roles describe accountability, not existing staff. No delivery dates or engineering-week estimates are asserted because capacity, release environment and external dependencies have not been confirmed.

Record each gate as **not assessed**, **blocked**, **failed** or **passed with evidence**. A partially completed checklist does not average into release approval. If a critical isolation, recovery or spending test fails, narrow the release surface or repair it before exposure.

Related: [Product Vision](../vision/index.md) · [Founder decisions](../reference/decisions.md) · [Current verification](../readiness/verification.md).
