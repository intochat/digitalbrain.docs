# Metrics, stage gates and stop criteria

**All numerical thresholds below are proposed. No user, revenue, retention or marketplace metrics were supplied or measured in this audit.** Fix definitions before collecting data and retain the denominator, window and exclusions with every result.

**Proposal revision · 17 October 2026.** The presentation suggested 10 users, 7 useful results, 5 returning in 3 of 4 weeks and 4 linked-app users. This handbook proposes an 8–12-person learning cohort, 6 independent useful outcomes, 4 returns over two natural task cycles and 5 paired context comparisons. Task-cycle observation avoids assuming every job is weekly; paired comparisons distinguish context benefit from mere multi-app use. These alternatives supersede the deck only as this handbook's working proposal, not as an approved founder decision. The original thresholds remain in the [presentation evidence](../reference/evidence.md); select one protocol before recruitment.

## User-side definitions

| Metric | Definition and denominator | Collection and interpretation |
| --- | --- | --- |
| Activation | Invited users who complete one accepted useful outcome within 7 days / invited users with working access for the whole window | Record access failures separately; signup alone is not activation |
| Useful outcomes | Runs meeting the task rubric and accepted by the user / eligible attempted runs | Include failures and cancellations; distinguish assisted runs |
| Repeat use | Activated users completing another useful outcome in the next two natural task cycles / activated users observed for both cycles | Specify daily/weekly/monthly job cadence; exclude incomplete observation, disclose count |
| Cross-app use | Active users completing useful outcomes in at least two apps with consented context reuse / observed active users | Usage across apps alone does not establish a benefit |
| Shared-context benefit | Difference in outcome quality, repeated input or completion effort between comparable with-context and without-context tasks | Counterbalance order; record permission errors and confounding |
| Paying conversion | Eligible users with collected, non-refunded payment / eligible users shown the same offer | Exclude sandbox, free credits, founder transfers and failed checkout |
| Contribution | Collected net revenue minus attributable variable costs for the same period/cohort | Model, compute, storage, APIs, payment fees, refunds and variable support; expose unpriced gaps |

## Developer and marketplace definitions

| Metric | Definition | Decision use |
| --- | --- | --- |
| Developer activation | Invited developers who independently run and package a sample / invited developers who begin onboarding | Record elapsed time and assistance; downloads are not adoption |
| Independent publication | External publishers completing review and installation in another account without private patches | Detect SDK/documentation gaps |
| Third-party adoption | Non-publisher users with a useful outcome from an external app / users who installed that app | Track per release; installs without outcomes are insufficient |
| Supply quality | Reviewed external apps with recent successful outcomes and an active support owner | Raw listing count hides broken or abandoned supply |
| Marketplace demand | Users returning to external apps across two natural task cycles | Measure per category and cohort, not a single aggregate |
| Review operations | Time to review, unresolved critical reports and support time per active app | Constrains safe expansion |

## Proposed gates

| Gate | Proposed acceptance threshold | Stop, narrow or change |
| --- | --- | --- |
| G0: release candidate | Exact commit/image pair; required builds and release checks pass; critical vulnerability decisions documented | Resolve missing CI project and blocked restore before treating CI as release evidence |
| G1: restricted operation | Every supported critical journey passes; restore/rollback meets founder-approved RPO/RTO; zero known isolation failures | Restrict access; no open pilot while a critical control fails |
| G2: useful repeat outcomes | Pilot 8–12 users; at least 6 independently complete an accepted outcome and at least 4 return over two task cycles | Rework target job if outcomes need founder rescue |
| G3: shared workspace | At least 5 paired task comparisons show a meaningful user-confirmed benefit without permission leakage | Remove claim or narrow context types if benefit is absent |
| G4: willingness to pay | At least 3 independent real paying users; every payment reconciled; complete variable costs show non-negative contribution for the supported offer | Change price/cost envelope or stop paid admission; no conclusions from subsidy alone |
| G5: developer contract | Two independent developers complete package/install/update/rollback workflow with no private patches | Keep SDK private or experimental |
| G6: invited marketplace | Two independent publishers, one reviewed app each; at least 3 non-team users per app with useful repeat outcomes | Remain curated; do not infer scale from this small sample |

The founder should adjust thresholds based on task frequency, risk and operating capacity **before** an experiment. Report changed thresholds as a new decision, not a retroactive pass. Any security incident or uncontrolled spend overrides positive activation numbers.

## Minimal event and evidence design

Proposed events: `access_granted`, `app_install_completed`, `run_started`, `run_finished`, `outcome_accepted`, `context_grant_changed`, `payment_reconciled`, `app_release_reviewed`. Associate pseudonymous workspace/user identifiers, app/runtime version, timestamp, outcome, assistance flag and source evidence. Do not log raw prompts, connector tokens or private artifacts by default.

Use idempotent event IDs and define missing/late event handling. Reconcile usage against provider evidence and payments against provider settlement records. The analytics pipeline itself has not been verified; add instrumentation acceptance to the [epic contracts](epics.md) before making metric claims.
