# Connector, Connection, and Integration credential delivery

Status: implemented on branch `os`. The user superseded the design approval workflow with autonomous implementation. See the implementation plan and per-area verification reports under `docs/superpowers/plans/`.

## Intent and scope

Execute the ratified taxonomy and credential-delivery boundary on the current `os` branch.
The source issues are [#165](https://github.com/intochat/digitalbrain/issues/165),
[#157](https://github.com/intochat/digitalbrain/issues/157),
[#159](https://github.com/intochat/digitalbrain/issues/159), the key-home portion of
[#160](https://github.com/intochat/digitalbrain/issues/160), and the trust/async portions of
[#162](https://github.com/intochat/digitalbrain/issues/162). All five were read for this design.
Rotation-policy redesign, TTL, token-scope changes, AI package splitting, Qdrant provisioning,
and assistant install binding remain outside this change. Existing AI revision-based refresh is
preserved and tested; this migration does not add a new rotation policy.

Integrations are what the deployment provisions; Connections are what users authorize.

The required result is a declaration-driven credential boundary across all modules, preserved
persisted identities, connection-keyed Gmail, consistent C#/Dart routes, and project-level
verification. A rename without replacing credential acquisition does not meet the goal.

## Approach

Use Platform-owned dependency binding and a Framework-facing async handle. Connector metadata
declares dependencies; Platform creates handles restricted to those dependencies or the module's own IntegrationSchemas and delivers
them through module-specific bindings. Modules never receive a general integration resolver.

Two alternatives were considered. A renamed registration API would retain imperative access
and caller fabrication. Eagerly injecting secret strings would make DI easier but would expose
credentials broadly and make rotation invisible. Neither satisfies the ratified seam.

Keep synchronous service registration. Register async client adapters/factories there; perform
credential reads in awaited startup or operation methods. Do not block on asynchronous work in
DI factories, properties, provider selection, or login-origin accessors.

## Definitions and ownership

Replace the catalog role of `IntegrationDefinition` with `ConnectorDefinition`. Move its
deployment-field schema and `DigitalBrain:Integrations` key helpers to `IntegrationSchema`.
This separates the two existing responsibilities instead of moving credential fields into
the public connector catalog.

Implemented Framework declarations:

```csharp
public sealed record ConnectorDefinition(
    string Id, string DisplayName, string[] AuthMethods, string[] RequiredIntegrations)
{
    public string ExternalSystem { get; init; } = DisplayName;
    public string[] OptionalIntegrations { get; init; } = [];
    public Type[] Neurons { get; init; } = [];
    public Type[] Signals { get; init; } = [];
}

public interface IIntegrationHandle
{
    string IntegrationId { get; }
    Task<IntegrationSnapshot> ReadAsync(CancellationToken cancellationToken = default);
    Task<string> ReadSecretAsync(string field, CancellationToken cancellationToken = default);
    Task<ReleasedIntegration> ReleaseAsync(CancellationToken cancellationToken = default);
}

public interface IModuleIntegrations<TModule> where TModule : Module
{
    IIntegrationHandle Get(string integrationId);
}
```

`IntegrationSnapshot` contains readiness, missing field names, revision, and non-secret settings.
It contains neither values of secrets nor caller stamps. `IntegrationSchema` declares required and optional
secret fields and required and optional setting fields. Non-secret module behavior such as PublicOrigin and token
endpoints belongs in ordinary options; settings remain only where they describe provisioning.
IDs and field names retain the existing validated grammar. All declaration collections are arrays.

Module declarations are static properties on the module type, discovered from `ModuleInventory`. Module-specific bindings expose only that module's own schemas and declared connector dependencies. The
Platform implementation owns construction, rejects undeclared dependencies and unknown fields,
and creates trusted callers internally. There is no public constructor/factory that accepts a
module-provided CallerContext as proof of authority. This enforces architectural access within
the trusted host; it does not claim to sandbox arbitrary malicious code in the same process.

## Composition and startup

1. Validate unique connector/schema IDs, auth-method IDs, and dependency references while composing.
2. Seed deployment Integrations asynchronously using Platform-owned configuration access. Preserve
   the existing rule that partial, edited, or deliberately cleared registrations are not reseeded.
3. Resolve dependency readiness before exposing the connector catalog or accepting connector work.
   Persisted provisioning counts even when no seed configuration is present.
4. Omit connectors with missing required Integrations and emit a structured diagnostic naming
   connector, dependency, and missing fields, never values. Optional dependencies do not hide the
   connector; operations requiring them report unavailability explicitly.
5. Required host infrastructure is stricter: a selected backing store or production CSharp service
   without its credential fails binding/startup. Unselected optional connectors do not kill the host.

Startup readiness must be ordered explicitly; registration order of unrelated hosted services is
not a synchronization mechanism. Handle reads/releases obtain current provisioning. AI caches readiness/revision reads for five
seconds; once that cache expires, a changed revision rebuilds reusable clients asynchronously,
and clearing a required credential makes subsequent operations unavailable. Every new provider
client uses one atomic release for endpoint/settings and key.

The current host stores its credential vault independently of the Postgres/Supabase query
providers, so their startup initialization follows durable Integration seeding. A future provider
that stores the vault itself must address the bootstrap cycle in Platform rather than adding a
module configuration bypass.

Atomic `ReleaseAsync` returns settings, revision, and secret values from one grain operation.
AI factories use this coherent snapshot. Keyed clients and resolved default/provider/profile
pipelines rebuild after a credential revision change while retaining their selected model and
explicit endpoint override. Gmail and Salesforce acquire their OAuth credential pairs in one
release; GitHub acquires its app identity and signing key together.

## Connections and persisted identities

Rename account-tier types to Connection terminology, including DTOs, script-visible references,
signals, providers, and registry state. Preserve unrelated identity Accounts and account IDs.
`Connection` records identify connector, auth method, brain, and connection ID; user credentials
remain SecretRefs. Append AuthMethodId after existing serialized members; never reuse an Id.
Old records lacking it receive a deterministic default only if the connector has one auth method;
ambiguous records require reconnect.

New connector-neuron keys use `connection/{brainId}/{connectorId}/{connectionId}`, with each
segment independently URI-escaped. One shared key builder validates and formats these keys.
Brain identity comes from the authenticated scope, never an unverified callback query parameter.
Existing registry grain keys and storage names remain unchanged.

The supplied historical commit `ca1c121c0` cannot currently be resolved by local git or GitHub.
The branch contains explicit Alias/GrainType/DefaultGrainType attributes, persisted-state
baselines, and `SerializedIdentityFacts`. These provide inspectable identity-preservation
mechanisms; the migration inventory records the unavailable historical reference and verifies the current branch baseline instead.

Create one migration note per renamed persisted type, recording old/new CLR name, Alias,
grain type, grain-key convention, storage provider/name, and every existing Id. Pin old aliases,
explicit grain types, storage names, and key prefixes. Add legacy-payload deserialization and
deactivate/reactivate tests, including JSON storage property compatibility. New wire DTOs may
use new names independently of storage DTOs; changing an Id alone does not preserve JSON names.

Known identity anchors to preserve include `connections.connection`, `connections.state`,
`connections.connect`, `connections.status-changed`, `connections.disconnected`,
`integrations.account-ref`, `integrations.script-accounts`, `integration.registration`, and
`integration.registration.state`. The implementation inventory includes every renamed signal
and snapshot as well, rather than treating this list as exhaustive.

## Gmail reference connector

Connector `gmail` supports `google-oauth`, requires Integration `google-oauth`, and optionally
uses `google-pubsub`. PublicOrigin and OAuth/profile endpoints are ordinary Gmail options.
Integration `google-pubsub` declares non-secret Audience and ServiceAccountEmail settings; it
is optional for OAuth connection setup and required for authenticated push processing. Module
files match their Gmail type names, and the duplicate Framework reference was removed.

OAuth initiation creates an expiring, single-use state binding to its
brain, connection, and authenticated principal. The callback consumes that state and addresses
the internal Gmail inbound contract using the shared connection key. A missing/invalid binding
cannot select a global fallback. Named connection initiation uses
`POST /brains/{brainId}/connections/{connectionId}/gmail/login`; its callback requires the same
authenticated principal and rechecks membership before storing credentials.

Platform-owned connection credential storage authorizes writes and returns SecretRefs to Gmail
state. Secret paths include the connection key, fixing the current shared `gmail.access` and
`gmail.refresh` paths. Gmail never constructs a platform caller to write a user's vault.

Maintain a durable reverse index from normalized verified mailbox to active connection keys.
Authenticated Pub/Sub delivery resolves that index and routes to those exact IGmail grains.
The same mailbox deliberately connected to two brains fans out to both authorized connections;
email alone never grants authority. Unknown/disconnected mailboxes produce no MailReceived.
Reconnect updates mailbox index membership; push delivery checks registry liveness and skips
disconnected entries. Stale index entries are not removed by push delivery. GmailConnected and MailReceived
retain the corresponding connection grain as their publisher.

The old global `gmail` and email-keyed Gmail states are not migrated. Existing users reconnect.
Audit shipped apps, scripts, fixtures, and subscriptions for hardcoded `gmail` source keys.

## Module migration decisions

| Module | Credential delivery and required changes |
| --- | --- |
| AI | Each keyed provider declares its own Integration; migrate factories, streaming, embeddings, images, speech, web search, capability listing, and selection to awaited handles. Remove fabricated PlatformCaller and both Task.Run/GetResult sites. Preserve AIOptionsPurityFacts. Ollama without credentials remains available through ordinary endpoint options. |
| CSharp | Integration `csharp` supplies RunTokenKey. Remove it from CSharpDeploymentSettings; update deployment seeding. Await initialization before signing/verification. Production missing key fails; development generation logs that tokens will not survive restart. No rotation/TTL/scope redesign. |
| Salesforce | Declare org-OAuth connector requiring `salesforce`, holding ConsumerKey/ConsumerSecret. Delete SalesforceOAuthOptions from Contracts and replace the stale kernel/Aspire diagnostic. |
| GitHub | One `github` Integration holds app credentials, including ClientSecret/WebhookSecret. Delete GitHubAppOptions as a parallel channel. Repositories configuration lives under Options. Preserve installation/user connection distinctions. |
| Supabase | User project credentials belong to per-brain Connections; OS backing-store credential belongs to Integration `supabase`. Remove ResolveConnection and secret-bearing options. Provider factories resolve the correct tier without a deployment-credential fallback for a user project. |
| ClickHouse | Own-infrastructure credential belongs to Integration `clickhouse`; delete ResolveConnection and stored ConnectionString from options. Keep only non-secret endpoint/behavior values in options. |
| Postgres | Capacity admin credential belongs to Integration `postgres`; retire DigitalBrain:Capacity:Postgres:AdminConnection. Audit normal database credentials too so no runtime credential configuration bypass remains. Provisioner/source creation awaits scoped credentials. |

Aspire/Deployment adapters emit canonical Integration seed keys; they do not introduce a second
runtime credential channel. Test fixtures inject fake handles or seed the real Platform path.

The enforcement audit removed module-created platform stamps from credential acquisition.
Platform-owned module handles and the connection credential store construct the required trusted
context internally. Shipped publishing remains implemented by the Apps module, invoked through
the narrow `IShippedContentPublisher` startup service under Platform orchestration. Platform
`PostgresMigrationStartup` invokes the existing Postgres migration grain after Integration seeding.
There is no generic module-accessible RunAsPlatform delegate or general Platform bootstrap API.

## Routes and shell

Use `/brains/{id}/connections` for user connections and `GET /connectors` for the offered catalog.
Deployment management may retain `GET /integrations` behind its existing operator authorization.
Separate its credential-field/status DTOs from the public connector DTOs.

Update C# endpoints and Dart models/screens together, including the integration menu, connect
window, settings, client calls, and route tests. Connection wire rows use ConnectorId/AuthMethodId;
do not leak deployment credential values or SecretRef internals into catalog responses. Retired
routes and configuration shapes are rejected rather than silently selecting an old channel.

## Review boundaries and verification

Implementation remains on `os` as requested. The user authorized autonomous implementation
without design or per-step approval gates; this document records the resulting design. No branch
or PR publication is implied by the migration.

The implementation plan was written before code edits; per-area reports record verification commands and results.
Core tests cover undeclared dependency rejection, partial/missing/revoked provisioning, startup
ordering, cancellation, no secret logging, and legacy-state round trips. Gmail tests cover two
brains, two mailboxes, repeated mailbox authorization, invalid/replayed OAuth state, reconnect,
disconnect, push routing, and publisher identity. AI tests exercise revision changes and streaming.
DB tests distinguish user credentials from deployment credentials and verify selected-store
startup/readiness behavior. No general credential-vault bootstrap-cycle test is claimed.

Extend architecture checks for module caller construction/stamping (including target-typed new),
direct registration access, credential config reads, secret-shaped options, credential-bearing
Contracts classes, and retired key roots. Use reviewed symbol/semantic evidence where possible;
a text-only known-offender list is not sufficient proof. The final offender list must be empty.

Run each touched module's unit and E2E cases, Framework/Platform/OS and architecture suites,
hosting/deployment tests, and impacted Apps/Assistant tests by project, never by .slnx. Compile
live-gated cases when credentials are unavailable and report them as skipped, not passed.
Run flutter analyze and flutter test in src/Modules/Google/Flutter/app/shell. Smoke with aspire run
in src/DigitalBrain/AppHost/DigitalBrain.AppHost and inspect all resource health states.

Update CLAUDE.md, ratified framework/vision specs present in this branch, and module READMEs with
the taxonomy, dependency seam, and exact disambiguation sentence above. Preserve verification
output before making implementation or migration success claims.
