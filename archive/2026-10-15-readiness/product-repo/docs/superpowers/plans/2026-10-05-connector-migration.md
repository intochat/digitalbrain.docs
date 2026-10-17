# Connector migration implementation plan

User instruction: implement autonomously on current branch `os`; no brainstorming or approval stops.
Ratified scope: #165, #157, #159, key delivery only from #160, trust/async only from #162.

## Interfaces shared across tasks

Framework namespace DigitalBrain.Framework.Platform.Integrations:
- `IntegrationSchema` replaces the old deployment schema role of IntegrationDefinition (same fluent methods/Key helpers).
- `ConnectorDefinition(string Id, string DisplayName, string[] AuthMethods, string[] RequiredIntegrations)` has OptionalIntegrations, Neurons, Signals arrays.
- `IIntegrationHandle`: string IntegrationId; Task<IntegrationSnapshot> ReadAsync(CancellationToken = default); Task<string> ReadSecretAsync(string field, CancellationToken = default); Task<ReleasedIntegration> ReleaseAsync(CancellationToken = default) atomically supplies revision/settings and secrets.
- `IModuleIntegrations<TModule>`: IIntegrationHandle Get(string integrationId). Platform checks the module's own declared schemas or connector dependencies before returning handles. No general resolver is delivered to modules.
- RegistrationSnapshot/Status become IntegrationSnapshot/Status; IIntegrationRegistration becomes IIntegration. Existing serializer aliases, member Ids, storage names and grain types stay pinned.
- Module declarations use static `IntegrationSchema[] Integrations` and `ConnectorDefinition[] Connectors` (single `Integration`/`Connector` accepted). Schemas are provisioning descriptions, connectors hold dependency edges.

## Tasks and checks

- [x] Core: rename deployment schema and persisted integration/account CLR names while retaining aliases/storage; add handle/binding, validate dependency graph, startup diagnostics, catalog filtering. Tests: Platform RegistrationFacts plus new scope/availability facts, Framework serialized identity and architecture persisted-state suites.
- [x] AI: convert credentials and dependent client creation/selection to async handle reads; eliminate PlatformCaller/direct registration calls and sync-over-async. Keep revision-driven rebuilding. Tests: AI unit/E2E cases and AIOptionsPurityFacts.
- [x] Gmail: google-oauth declaration, connection-bound callback and push index, Platform-owned vault writes, reconnect policy, file/project-reference cleanup. Tests: two brains/mailboxes, push publisher identity, callback failures.
- [x] CSharp: move key from options to csharp schema and async handle startup, deployment seed key, production failure/dev warning. Tests: RunTokensFacts and module suite.
- [x] Salesforce then GitHub: add/update declarations, remove credential configuration channels, update adapters and tests.
- [x] Supabase then ClickHouse then Postgres: remove credential options/ResolveConnection/private admin root; integrate async credential clients and update hosting/deployment seeds. Tests: each module plus hosting suites and E2E cases.
- [x] Routes and shell: /connectors and /brains/{id}/connections, rename wire terminology in C# and Dart together. Tests: endpoint suites, flutter analyze/test.
- [x] Enforcement/docs: eliminate all module caller fabrication, guard retired config, preserve migration notes, update CLAUDE/specs/READMEs. Tests: architecture, OS, impacted Apps/Assistant, project builds, Aspire healthy smoke.
- [x] Record the final Framework/OS E2E results: Framework 15 passed; OS 19 passed, 0 failed, 2 optional live-model skips. Final diff review and fixes are complete; verification evidence is recorded.

## Constraints and rulings

- No solution-wide build. No secrets in options or Contracts configuration; Validate checks own values only.
- Missing optional connector provisioning hides it with a startup diagnostic; missing required host infrastructure fails startup.
- Existing serializer names and IDs are stable; added members append IDs. All wire/state collections use concrete arrays.
- Historical ca1c121c0 is unavailable locally/remotely; use current explicit alias/grain/storage identity machinery with before/after regression coverage and a migration inventory.
- Work remains on os. Independent module areas may be delegated with fixed interfaces and non-overlapping file ownership. Shared Framework/Platform changes are owned by the primary agent.
- No token rotation/TTL/scope, AI package splitting, or Qdrant feature work.

## Progress

Plan written before product edits. Base: 6ebec1972. The implementation design now records the final behavior. Implementation, reviews, and final Framework/OS E2E checks are complete. All module/unit checks and the 38-resource Aspire smoke passed; see `2026-10-05-connector-verification.md` for exact results and live skips.
