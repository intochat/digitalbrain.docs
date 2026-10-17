# Product readiness delivery plan

Deliver the full three-pillar vision through shared foundations and independently visible acceptance gates. This plan specifies outcomes and dependencies rather than implementation tasks or unsupported time estimates.

## Gate 1 Establish the product contract

**Outcome:** creators, recipients and developers agree on what a valid app and social action mean.

- Adopt APP-01 through APP-09 as the app contract.
- Reconcile entry-based generator instructions with revision-bound Presentation.
- Choose initial app categories and name each external provider/action in launch scope.
- Decide circle roles, audiences, post retention, deletion and public-discovery policy.
- Separate “deployed,” “accepted,” “published” and “installed” in product language.

**Exit:** reviewable example specifications and acceptance scenarios for all four journeys in the requirements. Product owner accountable; app/runtime and social owners support.

## Gate 2 Make create and use dependable

**Outcome:** an ordinary user can create a supported app and understand success or failure.

- Close presentation mismatch and permissive publication verification.
- Define interrupted-build retry and removal of obsolete behaviors.
- Preserve prior useful results during repair and restart.
- Establish observable acceptance for selection, multi-control state, external dependencies and feedback-loop prevention.

**Exit:** the declared supported app set meets agreed generation/repair thresholds with evidence tied to a release. App/Creator owner accountable.

## Gate 3 Complete social lifecycle

**Outcome:** people can share and collaborate without guessing about audience or authority.

- Finish invite, acceptance, member removal and creator departure journeys.
- Separate personal posts, group messages and app releases in UX.
- Decide and implement post discovery independent of incidental chat truncation where required.
- Define connection-sharing consent, revocation feedback and partial-operation recovery.
- Add public discovery only with the agreed abuse and moderation model.

**Exit:** a recipient can install/use an exact release and a circle can complete its lifecycle, including removal and failure cases. Social product owner accountable.

## Gate 4 Deliver external social automation

**Outcome:** at least one named provider journey works through the same app and connection model; all advertised launch providers meet their own gate.

- Confirm provider access and supported capabilities.
- Implement authentication, ingestion, action receipts and rate-limit handling.
- Surface confirmation/delegation policy and uncertain outcomes.
- Verify installation with recipient credentials and group revocation.

**Exit:** real provider events and writes complete the advertised workflow. Fixtures do not qualify. Connector owner accountable.

Provider investigation can start alongside Gates 1–3. Its production acceptance depends on the shared app, permission and recovery contracts.

## Gate 5 Establish deployment readiness

**Outcome:** a user outside the developer's local session can complete the promised workflows.

- Prove secured origin, identity separation and correct shared-link behavior.
- Resolve server-versus-desktop browser/device execution for affected features.
- Document recovery with all required stores and keys.
- Establish usage, retention, support and incident ownership.

**Exit:** release-specific acceptance record for the target environment and supported journeys. Deployment owner accountable.

## Priority order

Public-launch update, 15 October: start with [authentication and account onboarding](../assessment/authentication.md). Existing password accounts provide a base; decide Google sign-in and signup policy, then configure a secured deployment with persistent identity. Public exposure depends on this gate.

First resolve the misleading success boundaries: presentation mismatch, compile-verification exceptions, and deployment-versus-acceptance language. Then complete social lifecycle and real provider journeys. Broad UI polish and more generated app types should follow dependable core outcomes.

No implementation has been performed by this product assessment. No time estimate is justified until provider scope, acceptance thresholds and ownership are chosen.
