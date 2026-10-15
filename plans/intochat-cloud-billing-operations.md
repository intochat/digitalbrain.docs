# IntoChat Cloud billing recovery and launch gates

Status: implementation guidance, not operational evidence. No command in this document has been executed. This branch is not ready for charging or hosted-runtime access.

## Configuration boundary

- Keep `Billing:Checkout:Enabled=false` and `Hosting:Provisioning:Enabled=false` until all P0 acceptance evidence is approved.
- `Billing:WorkerEnabled` controls the billing recovery worker in Jobs.API. Configure the same isolated database, encryption key, catalog and provider mode in API and worker. The default Aspire profile does not constitute a configured billing deployment.
- `Billing:LiveMode` must be explicit. Provider secret-key mode must match it. Live mode also requires `Cloud:Profile=live`. Never put credentials in this document, logs, screenshots or source control.
- A complete `CloudCatalog` includes a version, unique plan/price IDs, grace and retention durations and every resource limit. Currently supported catalog currencies are USD, EUR, GBP and CZK, with exact two-decimal pricing. Provider price currency, amount, recurring interval/count and licensed per-unit billing are checked before subscription creation.
- Enabling a flag is not evidence of worker health or implementation readiness. Refunded-payment adjudication, runtime outbox consumers, storage, usage admission and provisioning remain incomplete.

## Safe inspection

The authenticated operator API is disabled by default. Configure `Operations:Enabled` and explicit stable numeric `Operations:UserIds` only for approved operators; ordinary account owners are not operators automatically. Account/session authentication still applies.

`GET /api/v1/operations/billing/status` returns bounded oldest-first inbox, checkout and outbox status lists. It deliberately omits protected payloads, payment client secrets and contact information. Lists are capped at 100 per category; inspect database counts through approved read-only tooling when investigating larger backlogs.

Correlate account, operation and provider IDs without copying protected payloads. Check oldest pending age, attempts, lease expiry, safe error codes, worker health, mode configuration and database availability. An empty bounded result is not proof of provider reconciliation.

## Recovery paths

| State | Interpretation | Authorized source behavior / operator action |
| --- | --- | --- |
| Checkout outcome_unknown | A provider call or local persistence outcome is uncertain | Worker retries the same durable operation and deterministic key; do not create a replacement operation. |
| Checkout needs_review | Ownership, catalog or old idempotency outcome needs investigation | Do not clear timestamps, change keys or create another customer. Inspect original provider operation under separately authorized sandbox/live procedures. No automatic override endpoint exists. |
| Inbox quarantined / BILLING_CUSTOMER_UNASSOCIATED | Event cannot yet be associated through the durable customer mapping | Association retries continue. Resolve mapping conflicts before replay; metadata alone is not proof of ownership. |
| Inbox needs_review / REFUND_POLICY_REVIEW_REQUIRED | Refund event requires the unfinished explicit service/refund policy | Held outside automatic retries. Do not mark processed merely because subscription still reports active. No automatic deletion or refund is performed. |
| Inbox retry | Reconciliation failed transiently | Check database/provider availability and allow leased retry. |
| Cancellation pending/retry | Cancel-at-period-end request is durable; provider result may be unknown | Same outbox operation/key retries and current provider state is reconciled. A request acknowledgement is not completion. |
| Refund-review outbox needs_review | Customer requested support review | Review under the future approved cloud refund policy; no provider refund is issued by this API. |
| Entitlement outbox pending | Commercial change is durable | Runtime/notification consumers are not implemented. Do not mark done or claim provisioning occurred. |

`POST /api/v1/operations/billing/inbox/{eventId}/replay` accepts a JSON body containing a nonempty `reason` (maximum 2000 characters). It schedules provider-current-state reconciliation, refuses active leases and writes a `BillingOperatorAudit` entry atomically. It cannot create a new checkout, bypass ownership, or adjudicate a refund. Do not put credentials or customer contact data in the reason. User instructions still govern permission to invoke operational endpoints; none were invoked during implementation.

The new-checkout kill switch does not stop recovery of previously accepted purchases. If an operational incident requires pausing all provider activity, stop the explicitly configured billing worker through an authorized operational procedure and preserve its durable records. Do not clear inbox/outbox/lease rows or restore a database snapshot that discards accepted purchases.

## Schema and rollback

Migration `20261015140000_AddBillingReliability` is additive and unapplied. It adds durable checkout/inbox/outbox/entitlement/audit records and account subscription metadata. Its target model was drafted manually. Rehearse schema/model parity and backup/restore before application. Down migration intentionally refuses to delete durable billing history. Application rollback must retain Google-only identities, accounts, hashed sessions and all accepted billing work.

No destructive contraction is authorized. Existing travel tables and historical billing references remain. Processed webhook ciphertext may be cleared by the worker only after configured retention; event IDs/status/audit history remain.

## Required acceptance evidence before charging

- [ ] Authorized compilation and EF model/migration comparison.
- [ ] Isolated database inventory, conflict reports, backups and migration rehearsal.
- [ ] Google-only and independent Telegram customer flows, session replay/rotation/linking evidence.
- [ ] BILL-01–BILL-05 in an authorized sandbox, including timeout after provider success, webhook-before-response, repeated state transitions, double click and process crash.
- [ ] Catalog-to-provider reconciliation, verified billing contact and explicit currency/price review.
- [ ] Worker liveness, backlog alerting, lease recovery and audited replay drills.
- [ ] Completed refund policy and refund-to-service reconciliation.
- [ ] C1–C5 runtime boundary, storage/restore, isolation and data-retention evidence.
- [ ] U1–U2 usage attribution and concurrent hard-cap admission evidence.
- [ ] Customer checkout, pending-payment/provisioning, cancellation and support-remediation UX.
- [ ] Approved grace/retention/recovery objectives and incident ownership.

All acceptance evidence remains outstanding under the user's no-execution restriction. This document does not authorize tests, builds, payments, deployment, migration application or production data changes.

## Resource accounting operations (source implemented, not exercised)

GET /api/v1/operations/resource-usage uses the same explicit operator allowlist and returns bounded unresolved discrepancies and open reservations. Expired reservations remain held until a trustworthy terminal receipt proves settlement or non-execution; elapsed time is never permission to free budget. No HTTP endpoint accepts producer-supplied usage or grants execution yet.

Audited adjustments append compensating records and never edit original measurements. A discrepancy resolution requires an operator reason and does not itself settle or release a reservation. Never resolve a conflict merely to restore admission: establish the authoritative execution receipt first. Accounts with unresolved discrepancies cannot obtain fresh or replayed model admission.

ObservedBillingPeriods preserves periods actually seen during reconciliation. Periods missed during a long outage must be recovered through a future provider-history reconciliation path; do not invent dates or reassign old usage to the current period. Unpriced compute/storage is displayed separately and is not automatically charged. Local/BYOK measurements have zero platform-supplied model cost.

## Incident ownership and stop conditions

| Incident | Immediate containment and evidence | Recovery prerequisite |
|---|---|---|
| Payment outage | Disable new checkout; preserve inbox/outbox and existing operation IDs. Inspect oldest pending age, retry count and safe error codes. | Authorized provider-current-state reconciliation; do not create a replacement purchase to resolve uncertainty. |
| Provisioning outage | Keep provisioning disabled. Retain paid purchase/account records and show unavailable provisioning; support can record cancellation/refund-review requests. | Implemented runtime boundary, deterministic allocation lookup and approved remediation policy. |
| Storage degradation | Do not delete, detach or replace customer storage automatically. Suspend new work through a future durable lifecycle operation. | Selected storage provider, consistent backup coordination and demonstrated restore procedure. |
| Leaked runtime credential | Keep workspace issuance/provisioning disabled until a scoped credential/revocation protocol exists. Preserve minimal audit identifiers without copying secrets. | Runtime-specific rotation and bounded-session revocation evidence; never distribute the cloud JWT key. |
| Restore failure | Retain original allocation and backup references. Do not report a failed restore as ready or overwrite the original storage. | Compatible runtime/data version and a restore to a separate controlled allocation. |
| Usage discrepancy | Keep reservations and immutable measurements; inspect source/event/operation IDs and receipt mismatch. | Authoritative final receipt or reasoned audited adjustment, then explicit discrepancy resolution. |

Assign billing, runtime/storage and security responders before release; no named production ownership or alert destination was supplied. Configure alerts for backlog age, stalled operations, usage freshness and backup age only after their producers and recovery objectives exist. Current operator views are not an alerting system. Logs/audits must exclude secrets and protected webhook payloads; log and backup retention durations remain product/operator decisions.

The current source refuses live checkout and any provisioning enablement, and the legacy deployment executable refuses to invoke Pulumi. These are temporary explicit release guards. Remove them only alongside completed runtime/storage/refund capabilities and a reviewed release decision, not merely by supplying credentials.

## Additional operator visibility and reconciliation scheduling

GET /api/v1/operations/billing/backlog returns aggregate counts by durable status/kind, oldest timestamps and highest attempts without the 100-item truncation of the detail view. It also shows due account reconciliation count and oldest due timestamp. These are observations for external monitoring; no alert thresholds or destinations are invented.

POST /api/v1/operations/billing/accounts/{accountId}/reconcile accepts the same required reason (maximum 2000 characters) as inbox replay. The allowlisted operator schedules the existing mapped account for the worker and writes an audit record in one database transaction. It does not perform an inline provider call. If the billing worker is disabled or unavailable, the action remains due; Accepted is not proof that reconciliation succeeded. Repeated scheduling does not purchase or refund anything.

GET /api/v1/operations/resource-usage/backlog exposes unresolved discrepancy totals by reason, held reservation count/oldest time, active producers, producers without any measurements and latest received measurement timestamp. A producer without measurements may be idle; the count does not itself prove data loss. GET /api/v1/operations/resource-usage/accounts/{accountId}/records returns at most 100 recent records; optional recordId returns that original and its adjustments within the same account. Both use the existing default-off operator allowlist. They return no producer credentials, contact data or protected provider payloads.

Database readiness now requires the recorded resource-accounting migration in the renamed schema. A reachable empty PostgreSQL server must remain unready. This is an application-schema gate, not evidence that runtime/storage/backup/paid launch is ready. Keep the required migration marker updated when subsequent mandatory migrations are introduced.

Aspire no-build startup was attempted after the rename commit and failed because its executable does not exist. No app started and no tests/builds ran. A green startup requires authorized compiled artifacts plus approved local database/configuration preparation; it cannot be claimed from source review.

## Isolated local validation after build authorization

The earlier no-build failure above is historical. Builds/tests and disposable local migrations were subsequently authorized. Local prerequisites are Docker, the repository .NET SDK, Node dependencies, and local-only values for Aspire parameters intochat-jwt-key, intochat-data-key and intochat-api-key. Keep those in a secret store or process environment, never tracked settings or console output.

Set Cloud__ApplyLocalMigrations=true and run `aspire start --isolated --apphost src/Aspire/Aspire.csproj`. The default Cloud:Profile=isolated uses a fresh disposable PostgreSQL container without the saved intochat-cloud-postgres volume. The migration opt-in is rejected outside isolated run mode. It runs only migrations, skips legacy seeders and Hangfire schema preparation, and waits for successful completion before starting the API. Do not enable migration-on-startup or the legacy full seeder to reproduce this check.

The isolated profile uses HTTP on dynamically allocated local endpoints, with HTTPS redirection disabled only for that profile and CORS tied to its frontend endpoint. Sandbox/live retain explicit origins and existing HTTPS policy. API health is probed at /health/ready. Required schema marker is now 20261015160000_EnsureCloudSignupReferences; the additive reference migration supplies only missing Basic-tier/UTC defaults required by retained signup foreign keys, with no payment setup or overwriting existing reference values. Its rollback deliberately retains potentially referenced rows.

A healthy isolated stack does not enable Google/Telegram (both require explicit provider configuration), paid checkout, hosted provisioning or billing workers, and does not validate production cutover, external OAuth, payments, jobs or runtime/storage integration. Existing databases still require independent cutover approval and backup evidence.
