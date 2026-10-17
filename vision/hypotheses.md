# Hypotheses and founder decisions

**Validation plan · proposed decisions and thresholds · 17 October 2026.** The universal workspace and eventual marketplace are selected strategy. Their benefits, target audience, economics, and independent developer adoption remain unverified. Deploying the current version provides the environment in which these questions can be tested; an extensive rewrite is not the default first experiment.

## An evidence ladder

An interview establishes a reported problem. An observed task establishes behavior under specified assistance. An independently accepted result establishes usefulness for that task. Reuse establishes recurring value. A settled payment establishes a commercial action, and renewal after known costs is stronger evidence. Independent publication and maintained third-party adoption establish distinct supply and demand evidence.

Do not collapse those steps into a single “validated” label. Preserve cohort, eligibility, task, environment, assistance, failures, and observation window. A small pilot is a learning instrument; it is not a statistically representative market estimate.

## Experiments and disconfirming evidence

| Hypothesis | Experiment | Evidence and proposed decision rule | Stop or narrow when |
| --- | --- | --- | --- |
| A focused application beats repeated prompting | Observe a real task using existing tools and IntoChat; score both with the user's rubric | Accepted output, active effort, corrections, cost; continue only with a clear practical improvement on recurring jobs | Benefits depend on repeated founder intervention or curated demo inputs |
| Shared context improves the second application | Paired handoff with and without approved workspace context | Compare omitted facts, re-entry effort, source accuracy, and permission comprehension | Context adds leakage/confusion or no useful improvement |
| Users choose to return | Give access after first accepted result; observe the next natural task opportunity | Separate unprompted repeat outcomes from reminders and support sessions | Repeated use disappears when prompting and subsidies stop |
| The offer is worth paying for | Present a concrete consistent offer after useful outcomes | Actual payment, refunds, subsequent use, and renewal | Payment requires bespoke work that the price cannot support |
| Operation can sustain the offer | Reconcile all cost categories against accepted outcomes | Contribution under ordinary and expensive-run scenarios, plus support time | Good-looking token margin hides negative total contribution |
| External developers benefit from shared services | Ask an independent maker to build from public-facing docs and a clean environment | Valid publish/install/update without runtime edits; record interventions | Every app requires platform-owner code changes |
| Third-party supply meets user needs | Offer reviewed independent apps to eligible users with matching jobs | Install-to-outcome, repeat use, support/refund burden, publisher maintenance | Inventory grows while useful demand and maintenance do not |

No numerical conversion or retention threshold is presented as observed performance. Before a cohort starts, record a proposed minimum evidence rule, a bounded support/compute budget, and the decision owner. Safety and data-isolation failures are release blockers regardless of a favorable average task-success score.

## Quality evaluation protocol

Maintain representative fixtures with permitted data, explicit desired outcomes, and known failure cases. Score factual support, completeness, instruction adherence, permission behavior, recoverability, latency, and total cost. Separate deterministic contract checks from model-output review. Include refusal or clarification when evidence is missing, rather than rewarding a fluent unsupported answer.

Repeat model-sensitive cases across runs and record provider/model configuration, prompt/application version, and dependency version. A single successful generation does not establish reliability. Review disagreement in human ratings; retain examples behind aggregate scores. Re-run the relevant set when a model route, prompt, dependency, or context policy changes.

## Founder decision register

| Decision | Reversible working assumption | Evidence needed to settle it |
| --- | --- | --- |
| First release audience and bundle | Invited creators/small project teams; research, project memory, creative draft hypotheses | Observed recurring jobs and current release capabilities |
| Supported deployment | Deploy the current supported path with controlled access | Audit-backed topology, credentials ownership, backup/restore and rollback checks |
| Shared data ownership | User-selected project context with explicit audiences and export | Authorization tests, retention policy, participant comprehension |
| External writes | Preview and specific authorization before publication or other consequential actions | Action-by-action delegation contract and recovery behavior |
| License scope | Evaluate permissive SDK/contracts; defer runtime license decision pending inventory | Ownership, third-party terms, intended hosting distribution |
| Pilot charging | Bounded transparent offer only after reconciliation works | Cost data, payment tests, commercial terms, actual acceptance |
| Billing implementation | Treat acquaintance-owned system as optional and unverified | Accessible code/contracts, credentials ownership, security and ledger tests |
| External publishers | Invite only after SDK and catalog acceptance gates | Independent release/upgrade success and operating review capacity |
| Social and network scope | Preserve longer-term intent; promise only explicitly verified actions | Provider-specific auth, terms, audience controls, abuse ownership |

## Risks that change the sequence

Distribution concentration can leave IntoChat dependent on another assistant's review and policy changes. A cost spike can make a successful app economically unsustainable. Shared context can amplify stale or unauthorized information. Generated apps can increase review burden faster than useful supply. A sophisticated SDK can consume resources before the user job is validated.

Respond with measured experiments, narrow grants, versioned releases, budget controls, and a curated catalog. Narrow an application or audience when evidence fails; do not silently substitute a different overall strategy. Record the decision and the evidence that would justify revisiting it.

The [roadmap](/roadmap/) turns these questions into stage gates; [market research](./market) supplies alternatives, and [readiness](/readiness/) supplies technical constraints. The decision to expand follows demonstrated user outcomes, payment, and independent supply—not an invented calendar.
