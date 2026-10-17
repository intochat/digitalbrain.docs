# Core seam review

Read-only review of Framework/Platform integration and connection seams, CSharp RunTokens/deployment, Postgres migration startup relocation, testing seeds, and retired configuration enforcement. AI/Salesforce/GitHub implementations were excluded from this review round.

## Findings

### [P1] Validate selected per-brain Postgres admin credentials during startup

Location: src/Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresSourceRegistry.cs:35-36; selection: PostgresHosting.cs:39-43.

When PostgresModuleOptions.ProvisionPerBrain=true, the capacity provisioner becomes the required source and the platform configured source is disabled. However, the awaited integration startup only calls Get(platform), which reads and parses ConnectionString. AdminConnection is optional in the schema and never validated here. A deployment with a valid ConnectionString but missing or invalid AdminConnection therefore starts successfully and can appear healthy, then fails every first per-brain capacity request in DockerPostgresProvisioner.Ensure. Validate the admin handle field and its connection syntax in awaited startup whenever per-brain provisioning is selected. Add startup tests for selected provisioning with absent/malformed AdminConnection; unselected provisioning should continue allowing the field to be absent.

### [P2] Normalize or reject legacy connections without an authentication method

Location: src/DigitalBrain/Platform/DigitalBrain.Platform/Integrations/Accounts/ConnectionsNeuron.cs:36-41 and 77-88; credential delivery: src/DigitalBrain/Platform/DigitalBrain.Platform/Integrations/ModuleIntegrations.cs:120-124.

Connection.AuthMethodId appends Id(6) with empty-string default, correctly preserving old serialized fields. The only method inference/validation runs in Connect for newly submitted records. Existing records are returned unchanged by List, can be reprobed back to Connected without a method check, and ReadConnectionAsync releases their credential based only on Connected status. Consequently, old records never receive the deterministic single-method default, and ambiguous records for a connector with several methods remain usable instead of requiring reconnect. Normalize against declared connector metadata on read/reactivation; refuse ambiguous/unsupported legacy methods before probing or releasing credentials. Cover old JSON/Orleans records lacking the appended field for both one-method and multiple-method connectors.

## Inspected without additional findings

- Renamed registry/integration/reference/state types retain existing explicit aliases, grain type IDs, PersistentState names, original JSON property names and member IDs. New connection method fields append IDs.
- CSharp RunTokens awaits integration initialization; production missing key fails and development emits its generated-key warning. Deployment uses the canonical csharp IntegrationSchema seed key. ModuleTest seeds a per-cluster fake key; explicit execution configuration is layered afterwards and can override it.
- Platform registration startup seeds before invoking IIntegrationStartup consumers. Postgres migration orchestration is Platform-owned and restores the previous ambient context after its privileged invocation.
- Module integration acquisition rejects uncomposed modules and undeclared dependency IDs. Connector catalog dynamically hides missing required provisioning; optional readiness does not hide the connector.
- Retired root guard and architecture credential boundary tests were inspected. No production edits or new tests were made during this source-review round.

Parent notified of both findings; primary is handling auth-method migration and the database worker is handling selected admin validation.

## Final review of scoped handles and Gmail trust (2026-10-05)

Reviewed the latest module Integration handles, connection credential scope/identity checks, connection registry normalization, Gmail authenticated Pub/Sub route, callback state claim/membership checks, named connection mailbox routing, and current PlatformOnly edge exclusion. No additional actionable core authorization defect found in these paths. Module handles require an installed module's declared connector dependency; connection credential writes/connects validate the canonical owning brain and membership; credential reads select only the ambient brain/connector's connected record. Gmail push routing validates Google issuer/signature/audience/lifetime and configured verified service-account identity before locating a mailbox, then checks the named connection remains connected.

Found a concrete multi-field rotation defect in `GmailRegistration.ReleaseAsync`: separately releasing ClientId and ClientSecret could combine revisions. Reported to root; Gmail worker changed to one coherent release and verified its suite. The same final audit found Salesforce ConsumerKey/ConsumerSecret and GitHub AppId/private signing key pairing; the owning worker corrected those and added deterministic paused-release regressions (Salesforce 16 passed, GitHub runtime 14 passed).

No host launches were performed for this review.
