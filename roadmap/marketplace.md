# Marketplace launch plan

**Selected strategy, proposed rollout.** Marketplace belongs in the IntoChat ecosystem. Its operational burden and two-sided demand must be earned incrementally. A catalog UI alone is not a marketplace.

## Three distribution stages

| Stage | Supply and audience | Required operations | Exit evidence |
| --- | --- | --- | --- |
| Curated first-party catalog | A few supported apps, invited users | Version review, permission disclosure, support, disable/remove | Users repeatedly complete useful tasks |
| Invited external publishers | Named developers, reviewed releases | Publisher identity, compatibility tests, code/execution review, incident handling, ownership and licensing checks | Independent publication and real adoption without founder rebuilding apps |
| Broader marketplace | Additional qualified publishers and users | Abuse response, appeals, malware review, update revocation, financial reconciliation if monetized | Repeat demand and sustainable support burden on both sides |

## Review and responsibilities

Publisher supplies truthful app descriptions, supported task examples, dependency/license disclosures, requested permissions, data practices, version changes and an operational support contact. The operator validates compatibility and security controls, sets review criteria, handles reports, and can quarantine or withdraw a release. User consent and provider policy compliance remain necessary even for reviewed apps.

Review a release’s behavior, not just its manifest. Test privilege escalation, prompt injection through imported content, connector scope, hidden external writes, retention and resource exhaustion. Inspect permission expansion on update. Maintain an emergency disable path for new executions and a policy for already-running work and installed copies.

## Marketplace economics

Do not choose a commission percentage before confirming transaction structure, payment obligations, refunds, publisher tax/reporting responsibilities and contribution economics. A paid cloud subscription and third-party application revenue share are different contracts. Start with free or bundled curated apps if that reduces operational complexity; this does not remove future marketplace intent.

The [commercial model](../vision/commercial.md) and [market research](../vision/market.md) identify external ecosystems as possible channels. Check current terms before introducing payment links or credit sales into a host ecosystem. Provider listing approval and distribution are unconfirmed.

## Gate and stop conditions

Proposed early gate: at least two independent publishers each ship one reviewed application, and at least three non-team users per app complete a useful outcome with evidence of repeat use across two task cycles. These are learning thresholds, not measured results or sufficient evidence for open publication.

Do not open further when review capacity is lower than incoming changes, critical permissions cannot be enforced, support responsibilities are unclear, or users find no incremental value in external supply. Narrow categories and keep invitation-only publication while resolving the constraint. Expand only by [measured supply and demand](metrics.md).
