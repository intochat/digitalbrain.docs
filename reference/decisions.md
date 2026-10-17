# Decisions and unresolved questions

The selected direction is IntoChat as a universal AI workspace and application ecosystem. The immediate engineering priority is deploying the current version under controlled conditions. Neither an extensive rewrite nor a vertical customer-feedback pivot follows from the available evidence.

## Established direction

| Decision | Basis | Consequence |
| --- | --- | --- |
| Use IntoChat publicly and retain DigitalBrain technical identifiers | Founder instruction | Explain the relationship; avoid unrelated application-code renames |
| Preserve the ecosystem strategy, including marketplace | Founder instruction and presentation slides 1–2 | Begin with a curated catalog; gate external publishers on reliable execution and demand |
| Deploy current version first | Founder instruction and slide 3 | Identify exact release, configuration and operational acceptance before expanding scope |
| Separate cloud portal and runtime workspace | Inspected protocol and source structure | Assess React and Flutter flows individually and their integration explicitly |
| Treat numerical pilot thresholds as proposals | Slide 4 notes | Never display the thresholds as actual users, retention or revenue |
| Keep a payment boundary independent of an acquaintance's implementation | No accessible integration evidence | Evaluate the existing cloud checkout path first; do not require unavailable software |

## Reversible working assumptions

The first pilot can recruit one narrow group of people already performing several AI-assisted tasks. This is an entry point into the universal workspace, not a permanent vertical product decision. Two or three linked applications provide a tractable way to test context reuse. First-party curation precedes public publisher admission. These are proposed choices and can change when interviews and observed outcomes disagree.

## Decision register

| ID | Decision needed | Evidence to obtain | Suggested accountable role | Gate |
| --- | --- | --- | --- | --- |
| D01 | Exact deployable release and artifact digest | Reproducible build, runtime/protocol/storage compatibility and release manifest | Release engineer or founder acting in that role | Controlled deployment |
| D02 | Pilot environment, region and spending ceiling | Provider quotas, privacy needs, operating-cost envelope and recovery drill | Founder/operator | Controlled deployment |
| D03 | First audience and reachable cohort | Direct interviews, existing workflow and recruitment access | Founder/product | Pilot invitation |
| D04 | Initial application bundle | End-to-end quality tests on real tasks; repeated demand | Product/engineering | Pilot invitation |
| D05 | Shared-context consent and retention | Data map, permissions tests, export/deletion behavior | Product/security | Cross-application pilot |
| D06 | Paid plan, resource allowances and refunds | Actual variable costs, sandbox checkout reconciliation, support policy | Founder/finance | Accepting money |
| D07 | Open-source scope and license | Existing license inventory, dependency terms and commercial objectives | Founder with legal review where needed | External SDK release |
| D08 | Stable package format and compatibility policy | Independent developer trial, versioned manifest, upgrade/rollback test | SDK maintainer | External publisher trial |
| D09 | Publisher review, removals and support ownership | Abuse scenarios, permission review, incident workflow and publisher agreement | Marketplace operator | Public marketplace |
| D10 | Publisher compensation | Provider support, reconciliation, tax/compliance requirements and support economics | Founder/finance | Paid third-party distribution |

Roles indicate responsibilities, not confirmed staffing. No dates or effort estimates are assigned because capacity and operating constraints are unknown.

## When to change direction

Narrow the first scenario when users cannot get reliable outcomes. Rework context transfer when two applications add no measurable benefit over separate tools. Pause paid expansion when support and variable costs erase contribution. Delay external publishers when independent authors cannot publish safely without founder intervention. A growing module count alone never overrides these signals.

Record a changed decision with its date, evidence, owner role and impact on prior claims. Keep superseded decisions visible in history rather than presenting a moving target as an original commitment.

Related: [evidence](./evidence), [maintenance](./maintenance), [glossary](./glossary).
