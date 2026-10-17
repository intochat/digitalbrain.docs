# Connections restructure

Date: 2026-10-07. Status: approved design, awaiting implementation plan. Scope: the credential
seam in the Framework and Platform rings and the three OAuth connector modules (Gmail, GitHub,
Salesforce), with the pasted-value connectors (Postgres, Supabase, ClickHouse, AI providers)
switching onto the same base.

## Problem

The taxonomy CLAUDE.md ratified is right: an **Integration** is what the deployment provisions
(an OAuth client registration, a Pub/Sub audience, a GitHub App key, a shared Postgres from Key
Vault), a **Connection** is what a user authorizes, many per brain (a second Gmail account, a pasted
connection string, an API key, an App installation), and a webhook is an Integration-level door that
routes to Connections. The code does not implement it one way.

A credential, the record that says it is connected, and the neuron that uses it are three grains
with three different keys: a vault per *principal* (`ISecrets`), a registry per *brain*
(`IConnectionRegistry`), and a connection neuron per *connection key* (`connection/{brain}/{connector}/{id}`).
The only way across those seams is a service that manufactures a platform identity. Eleven sites
outside tests write `StampedBy = TrustedEdge.Platform` by hand; nine are inside the Platform ring's
own credential shuttles (`OAuthCredentials`, `ConnectionCredentialProbe`, `IntegrationCredentials`,
`ModuleIntegrations` four times). The vault grain is addressed four ways (`":integrations"`,
`caller.PrincipalId`, `owner`, `credential.OwnerOf()`).

Because an anonymous OAuth callback has no caller to forge, it cannot cross the seams at all, so a
side door grew beside the registry: `IOAuthCredentials`, `IExternalConnection`, `ITokenHandoff`.
Each OAuth module then improvised the piece the side door lacks. Gmail wrote its own callback state
table and endpoints without PKCE but landed on the registry. Salesforce used the Framework login
flow but bypassed the registry, parked tokens in a two-minute process dictionary, and surfaced
itself through an external row. GitHub kept the connection in a process dictionary plus a global
`"connections"` grain that is not brain-scoped, discarded the user token, and has no code path that
starts a login. The shell has three start paths to match.

## Decision

A connection neuron owns its credential as grain state, sealed at rest with the master key. The
connector's edge neuron *is* the connection: `GmailNeuron` at `connection/{brain}/gmail/{id}` owns
the grant, `PostgresServerNeuron` at `connection/{brain}/postgres/{id}` owns the connection string.
The Framework ships one base that gives every connector the same credential state, status, access
rule and operations. The per-brain registry becomes an index of keys. Integrations are already
neurons and keep their secrets the same sealed way. One Platform OAuth flow ends by calling the
connection neuron; one inbound-webhook shape routes through an index neuron. The vault hop, the
forged stamps and the side door are deleted.

Approaches rejected: a generic `IConnection` grain in Platform that connector neurons read at call
time (two grains per provider call and the "who may read" question returns); keeping the registry
record as the truth and only moving OAuth into it (the vault hop and forged stamps stay).

## Section 1: the neurons and their contracts

Framework ring, `Platform/Connections/`:

```csharp
[Alias("connection")]
public interface IConnection : INeuron
{
    Task<ConnectionView> Read();
    Task Connect(string authMethodId, string value);        // pasted value: api key, connection string
    Task AcceptGrant(OAuthGrant grant);                       // called only by the Platform OAuth callback
    Task<ConnectionView> Probe();
    Task Disconnect();
}

public sealed record ConnectionView(string ConnectorId, string ConnectionId, string AuthMethodId,
    ConnectionStatus Status, string? Account, DateTimeOffset? ExpiresAt, DateTimeOffset? LastProbedAt);
public sealed record OAuthGrant(string AccessToken, string? RefreshToken, DateTimeOffset? ExpiresAt, string? Account, string Scopes);
public sealed record Credential(string Value, string? Refresh);
```

`ConnectionNeuron<TState> : Neuron<TState>, IConnection` where `TState : ConnectionState`. It
implements `Read`, `Connect`, `AcceptGrant`, `Probe`, `Disconnect` once, and calls two abstract
hooks the module fills in:

```csharp
protected abstract Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct);
protected abstract Task<OAuthGrant> RefreshAsync(Credential credential, CancellationToken ct);
```

plus one virtual `AcceptGrantAsync(OAuthGrant grant, JsonElement tokenResponse)` the module may
override to parse provider-specific fields and refuse. `Access` is "members of the brain named in
my key; `AcceptGrant` additionally only from the Platform OAuth callback edge". The base tracks the
key in the brain's index on the first successful `Connect`/`AcceptGrant` and untracks on
`Disconnect`. Status transitions and their signals are one private function, so a module cannot
publish a status it did not persist. The base exposes `MarkExpired(detail)` and
`MarkFailing(detail)` for a provider call inside the grain that observes the change, and
`UseCredentialAsync(Func<Credential, Task<T>>)` which opens the sealed secret for the duration of
one provider call inside the grain turn and refreshes first when `ExpiresAt` has passed.

Per brain, `IConnectionIndex` at `{brain}/connections`: `List()`, `Track(key)`, `Untrack(key)`. A
thin Platform grain, like `AppIndex`. Replaces `IConnectionRegistry`.

Integrations stay neurons (`IIntegration` at `integration/{id}`), seeded as today. They own their
secret bytes as sealed state, so `IntegrationVault`'s fake owner and `IntegrationCredentials` go.
`IModuleIntegrations<TModule>` stays as the module's door; it becomes a plain grain call checked by
the integration neuron's `Access` against the declaring module, not a forged caller.

Each module keeps exactly one connection neuron type and declares it in
`ConnectorDefinition.Neurons`: `GmailNeuron`, `PostgresServerNeuron` (for `connection/` keys),
`SupabaseNeuron`, `ClickHouseNeuron`, `SalesforceNeuron`, the AI provider neurons, and for GitHub a
new `GitHubRepositoryNeuron` keyed `connection/{brain}/github/{owner--repo}` whose credential is
the App installation id. `IGitHubConnections` and the `"connections"` grain go.

## Section 2: signals

Framework, `Platform/Connections/Signals/`, published by the base so every connector gets them
and a behavior can `On<ConnectionConnected>(anyConnection)`:

```csharp
[Alias("connection.connected")]    public sealed record ConnectionConnected(string ConnectorId, string ConnectionId, string AuthMethodId, string? Account) : Signal;
[Alias("connection.expired")]      public sealed record ConnectionExpired(string ConnectorId, string ConnectionId) : Signal;
[Alias("connection.failing")]      public sealed record ConnectionFailing(string ConnectorId, string ConnectionId, string Detail) : Signal;
[Alias("connection.disconnected")] public sealed record ConnectionDisconnected(string ConnectorId, string ConnectionId) : Signal;
```

`Connected` from `Connect`, `AcceptGrant`, and a `Probe` or refresh that brings a connection back.
`Expired` and `Failing` from `Probe` and from `MarkExpired`/`MarkFailing`. `Disconnected` from
`Disconnect`.

Module signals keep carrying domain facts only: `MailReceived`, `PullRequestChanged`,
`RecordWritten`, `SalesforceWritePrepared`, `SalesforceWriteFailed`, `SalesforceWriteUncertain`
stay. Deleted because the Framework signals replace them: Gmail `GmailConnected`; Salesforce
`SalesforceConnected`, `SalesforceDisconnected`, `SalesforceRefreshed`,
`SalesforceConnectionRejected`; GitHub `RepositoryConnected`, `RepositoryRefused`,
`RepositoryAccessRevoked`, `GitHubConnectionRegistered`; Platform `ConnectionStatusChanged` and the
registry's `ConnectionDisconnected`. Integrations publish nothing new.

## Section 3: the state shape

Framework, `Platform/Connections/ConnectionState.cs`, concrete arrays, plaintext never:

```csharp
[GenerateSerializer, Alias("connection.state")]
public record ConnectionState
{
    [Id(0)] public string AuthMethodId { get; init; } = "";
    [Id(1)] public ConnectionStatus Status { get; init; } = ConnectionStatus.Disconnected;
    [Id(2)] public SealedSecret[] Secrets { get; init; } = [];      // named: "value", "access", "refresh"
    [Id(3)] public string? Account { get; init; }                     // email, instance url, owner/repo
    [Id(4)] public string Scopes { get; init; } = "";
    [Id(5)] public DateTimeOffset? ExpiresAt { get; init; }
    [Id(6)] public DateTimeOffset? LastProbedAt { get; init; }
    [Id(7)] public string? Detail { get; init; }                      // last failure, for the shell
}

[GenerateSerializer, Alias("sealed-secret")]
public sealed record SealedSecret([property: Id(0)] string Name, [property: Id(1)] string KeyId, [property: Id(2)] byte[] Ciphertext);
```

`ConnectionStatus` keeps its four values (`Connected`, `Expired`, `Failing`, `Disconnected`) and
moves to this folder.

A module's state derives from it and adds only what its provider needs: `GmailState` keeps
`CanCompose`, `PendingDraft`, `SubmittingDraft`; `SalesforceState` keeps the instance URL in
`Account` and its two pending writes; `GitHubRepositoryState` keeps `AppId`, `InstallationId`,
`RepositoryId`, `LastWebhookAt`, and `Revoked` folds into `Status`. `SecretRef` disappears from
every connection state.

Sealing: the master key and `SecretCipher` move from `SecretsNeuron` into a Framework service,
`ISecretSealer` (`Seal(name, plaintext) → SealedSecret`, `Open(SealedSecret) → string`), registered
by the Platform ring over the existing `MasterKeyWrapper`. The base `ConnectionNeuron` and
`IntegrationNeuron` are its only callers. `Connect` and `AcceptGrant` seal on the way in; hooks
receive an opened `Credential` only inside one provider call in the grain turn, never as a return
value, never in a signal, never in `Read`. Storage holds ciphertext and key id, so key rotation is
"re-seal on next successful call", not a migration.

`IntegrationState` takes the same shape: `SealedSecret[] Secrets` replaces
`Dictionary<string, SecretRef> References`; `Settings` and `Revision` stay. `ReleasedIntegration`
keeps returning opened values to the declaring module.

The index per brain: `ConnectionIndexState { string[] Keys }`.

Retired: the per-principal vault `ISecrets`/`SecretsNeuron` as the holder of connection and
integration bytes. The plan confirms with LSP whether anything else still references `ISecrets`
(`/secrets` endpoints, `SecretOwnershipFacts`); if nothing does, it is deleted.

## Section 4: the OAuth flow and inbound webhooks

One login flow in the Platform ring. `BrowserLogins` and `BrowserLoginSurface` keep the one-use
request capability, correlation cookie and PKCE, and become generic:

- A connector that supports OAuth declares it in `ConnectorDefinition.OAuthMethods` as
  `OAuthMethod(Id, AuthorizationEndpoint, TokenEndpoint, Scopes, Pkce, IntegrationId)`, where the
  integration holds the client id and secret. No module registers an ASP.NET OAuth handler; the
  Platform registers one per declared method from the catalog.
- Start: `POST /brains/{brainId}/connections/{connectionId}/login?connector={id}&method={id}`.
  The Platform mints the request, puts the connection key and the owner into the protected OAuth
  state, and returns the URL. One route for every connector. Gmail's `/gmail/login` and
  Salesforce's `/connections/services/{provider}/start` go.
- Callback: `/connections/oauth/{connector}/callback`. After correlation and the one-use claim
  succeed, the Platform exchanges the code with the client secret from the integration neuron,
  builds an `OAuthGrant`, stamps the owner recorded in the state, and calls `IConnection.AcceptGrant`
  on the key from the state. The callback is a trusted edge, like the authenticated HTTP edge with a
  cookie. No `TokenHandoff`, no forged platform caller.
- Provider-specific parsing (Salesforce `instance_url` and `iss`, Gmail `id_token` email, GitHub
  installation resolution) happens in the module's `AcceptGrantAsync` override, which receives the
  raw token response too. The module decides what `Account` is and may refuse.
- The pending-request table in `BrowserLogins` stays in process: a ten-minute capability for an
  in-flight browser redirect, not durable state. Losing it on restart means one more click.

Refresh: `UseCredentialAsync` calls the module's `RefreshAsync` hook when `ExpiresAt` has passed or
a provider call reports expiry, re-seals the result and publishes `ConnectionConnected`.
Salesforce's `SalesforceTokenRefresh`, `SalesforceWriteAccess` and `SalesforceCredentialStore`
collapse into that hook. Gmail gains refresh; today it stores the refresh token and never uses it.

Inbound webhooks, Gmail's shape generalized: a connector that receives pushes maps an
Integration-level endpoint (`/google/gmail/watch`, `/integrations/github/webhook`), authenticates
it with the integration's secret (Pub/Sub JWT, GitHub HMAC), resolves target connection keys through
an index neuron the module owns keyed by what the push carries (`gmail.mailbox-index` by email, a new
`github.repository-index` by repository id), and calls the connection neuron's `[PlatformOnly]`
inbound contract (`IGmailInbound.AcceptWatchPush`, `IGitHubInbound.AcceptRepositoryEvent`).
`GitHubWebhookIngress` routing over the process dictionary is replaced by that index; its HMAC check
and payload parsing stay in the surface.

The assistant: "connect my database" is a tool that opens the Flutter secret widget
(`InputWidgetKind.OutOfBand`) and calls `IConnection.Connect` on `connection/{brain}/postgres/{name}`.
For OAuth connectors the tool returns the login URL from the start route. Same two paths the
settings screen uses.

## Section 5: what is deleted

Framework ring: `Platform/Auth/IOAuthCredentials.cs`, `ITokenHandoff.cs`, `OAuthTokens.cs`,
`TokenHandoffExpiredException.cs`; `Platform/Integrations/Accounts/ExternalAccount.cs`,
`IConnectionRegistry.cs`, `Connection.cs` (enum moves); `IModuleConnectionCredentials<TModule>`
from `ConnectorDefinition.cs` (`ConnectionKeys` moves); `Auth/BrowserLoginWorkspace.cs`;
`Platform/Secrets/ISecrets.cs`, `Types/SecretRef.cs`, `Types/SecretReferences.cs` if LSP shows no
remaining caller (`FieldKind.Secret` and the out-of-band widget stay).

Platform ring: `Auth/TokenHandoff.cs`, `Auth/OAuthCredentials.cs`;
`Integrations/Accounts/ConnectionsNeuron.cs`, `ConnectionsState.cs`, `ConnectionEndpoints.cs`,
`ConnectionAuthentication.cs`, `ConnectionCredentialProbe.cs`, `CredentialPresenceProbe.cs`,
`ConnectionProbe.cs` (`IConnectionProbe`; the probe is the neuron's hook; `ConnectionProbeResult`
moves to Framework `Platform/Connections/`), `ConnectionSignals.cs`, `ScopedConnections.cs`,
`ConnectConnectionInput.cs`, `ConnectionAction.cs`, `ConnectionRequestsNeuron.cs` and
`Platform.Contracts/IConnectionRequests.cs` (confirm with LSP); `Integrations/IntegrationCredentials.cs`,
`IntegrationVault`, the forged callers in `ModuleIntegrations.cs` and the whole
`ModuleConnectionCredentials<TModule>`; `Secrets/SecretsNeuron.cs`, `SecretState.cs`,
`SecretsStore.cs`, `SecretsEndpoints.cs`, `SecretInput.cs` if `ISecrets` goes; `SecretCipher`,
`MasterKeyWrapper`, `IKeyWrapper`, `MasterKeyOptions` stay. `Discovery/ConnectionsInventoryProvider.cs`
is rewritten over the index.

Gmail: `GmailCallbackRequests.cs`, `GmailOAuthPrivacySurface.cs`, the `/login` and
`/oauth/callback` endpoints in `GmailModule`, `GmailTokenExchange`'s authorization-code path (refresh
becomes the hook body), `GmailConnected`, `GmailConnection` (replaced by `ConnectionView`).

Salesforce: `SalesforceAuthentication.cs`, `SalesforceOAuthHandler.cs`, `SalesforceLogins.cs`,
`SalesforceCredentialStore.cs`, `SalesforceWriteAccess.cs`, `SalesforceTokenRefresh.cs` (its HTTP
refresh call becomes the hook body), `Accounts/SalesforceConnectionEndpoints.cs` with
`SalesforceExternalConnection`, `SalesforceTokenGrant.cs`, four connection signals,
`SalesforceMcpOptions` folded into `SalesforceModuleOptions`.

GitHub: `Connections/GitHubRepositoryBindings.cs`, `GitHubRepositoryBinding.cs`,
`GitHubSetupService.cs`, `GitHubConnectionsNeuron.cs`, `GitHubConnectionsState.cs`, Contracts
`IGitHubConnections` and `GitHubConnectionRecord`, `OAuth/GitHubAuthentication.cs`,
`GitHubOAuthHandler.cs`, `GitHubLogins.cs`, `GitHubRepositoriesOptions` and
`GitHubRepositoryDeclaration` (operator-declared repositories are dropped; `ReferenceBrain` is their
only user), the `McpEndpoint` field and the `ModelContextProtocol.Core` package, four connection
signals. `GitHubInstallationTokens` stays, keyed by connection.

Shell: `connect_window.dart`'s three start paths become one; `connections_settings.dart`'s `gmail`
special case goes; `ui_client.dart`'s `connectorRequest` loses the `gmail/start` branch and the
`services/` prefix.

## Section 6: the target layout

Framework ring, `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/`:

```
Connections/
  IConnection.cs            IConnection, ConnectionView, ConnectionStatus, OAuthGrant, Credential, ConnectionProbeResult
  ConnectionNeuron.cs       ConnectionNeuron<TState>
  ConnectionState.cs        ConnectionState, SealedSecret
  ConnectionKeys.cs         For / Parse (moved)
  IConnectionIndex.cs
  ISecretSealer.cs
  OAuthMethod.cs
  Signals/                  ConnectionConnected, ConnectionExpired, ConnectionFailing, ConnectionDisconnected
Integrations/
  ConnectorDefinition.cs    gains OAuthMethods; loses IModuleConnectionCredentials
  IIntegration.cs, IntegrationSchema.cs, IModuleIntegrations (unchanged shape)
Auth/
  BrowserLogins.cs, BrowserLoginSurface.cs, BrowserLoginCorrelation.cs, BrowserLoginDefinition.cs, LoginPage.cs
```

Platform ring, `src/DigitalBrain.Platform/DigitalBrain.Platform/`:

```
Connections/
  ConnectionIndexNeuron.cs
  ConnectionEndpoints.cs    GET /brains/{id}/connections; POST .../connections/{cid}/connect | probe | disconnect | login
  ConnectionsInventoryProvider.cs
  OAuth/
    OAuthLoginFlow.cs       one BrowserLogins per declared OAuthMethod; state carries connection key and owner
    OAuthCallback.cs        code exchange with the integration's client secret; builds OAuthGrant; calls AcceptGrant
Integrations/
  IntegrationNeuron.cs      state uses SealedSecret[]
  IntegrationSeeder.cs, ModuleIntegrations.cs (no forged caller), ConnectorCatalog.cs, ConnectorDiscovery.cs, IntegrationDiscovery.cs, IntegrationCatalog*.cs
Secrets/
  SecretSealer.cs           ISecretSealer over SecretCipher + MasterKeyWrapper
  SecretCipher.cs, MasterKeyWrapper.cs, IKeyWrapper.cs, MasterKeyOptions.cs
```

Modules, folder equals namespace, one folder per neuron with `Signals/` beneath:

```
Google/Gmail/…Gmail/           GmailModule (registrations + /google/gmail/watch); Gmail/{GmailNeuron, GmailState, IGmailInbound, GmailMailboxIndex, GmailPushAuthenticator, GmailPubSub}
Google/Gmail/…Gmail.Contracts/ Gmail/{IGmail, Signals/MailReceived}
Salesforce/…Salesforce/        SalesforceModule; Salesforce/{SalesforceNeuron, SalesforceState, SalesforceMcpProvider, SalesforceQueryGuard, McpHttpSession}
Salesforce/…Contracts/         Salesforce/{ISalesforce, records, Signals/ (write and record signals only)}
Microsoft/GitHub/…GitHub/      GitHubModule; Repository/{GitHubRepositoryNeuron, GitHubRepositoryState, IGitHubInbound, GitHubRepositoryIndex, GitHubInstallationTokens, GitHubRepositorySource}; Webhook/{GitHubWebhookSurface, GitHubWebhookAcceptance, GitHubWebhookHandler}
Microsoft/GitHub/…Contracts/   Repository/{IRepository, records, Signals/PullRequestChanged}
```

Postgres, Supabase, ClickHouse and the AI providers derive their connection neuron from
`ConnectionNeuron<…>` for `connection/` keys and read the integration neuron for `integration/`
keys; no folder moves beyond what their own audits list.

## Section 7: blast radius outside the Platform ring and the three connector modules

| Consumer | What changes |
|---|---|
| Postgres `PostgresServerNeuron` | Reads its connection string from its own sealed state instead of `IModuleConnectionCredentials.ReadConnectionAsync`. `ConnectionPostgresProvider` and `TableLifecycleGuard` untouched. |
| Supabase `ConnectionSupabaseProvider` | Same swap; the hard-coded `("supabase","supabase")` becomes the neuron's own key. |
| ClickHouse | Gains a real `connection/` path through the base for the first time. |
| AI `AiCredentials`, `ApiKeyProviderFactory` | The forged `CallerContext` goes: provider keys from the integration neuron, user keys from the provider connection neuron's state. Lands inside the AI restructure's `ModelCatalog`; this spec names the seam. |
| Apps | `AppSlot.Connector` binding at install writes `connection/{brain}/{connector}/{id}` into `Connections`; unchanged. |
| Assistant / Assistant app | `discover_capabilities` lists connections from the index; `RegistryDiscoveryFacts` moves. |
| Platform `IntegrationCatalogEndpoints`, `Capabilities` | Read `ConnectorDefinition.OAuthMethods` to tell the shell which methods open a browser. |
| Flutter shell (`core/lib/src/ui_client.dart`, `shell/lib/connections/*`) | One row shape (`ConnectionView` mirrored as `connection.dart`), one connect, one login start, one probe, one disconnect. Three Dart tests change. |
| E2E `ReferenceBrain`, `TwitterFakes`, `BrainRouteIsolationFacts`, `GoldenJourneyFacts` | `ReferenceBrain` drops `WithGitHubRepositories`; `TwitterFakes` builds a `ConnectorDefinition` with the new field; isolation facts call the index. |
| Testing.Module `ModuleTest`, `ModuleHttpEdge` | Master key seeded as today; the edge maps the Platform connection routes instead of `MapConnections`. |
| Architecture tests `CredentialBoundaryFacts` | New rule: no module assembly constructs a `CallerContext` with `TrustedEdge.Platform`; the Platform ring does so only in the OAuth callback and the shipped-content publisher. |
| AppHost / Aspire hosting | `GitHubModuleHosting` loses the per-repository projection; `WithGitHubApp` stays as the integration seed. Gmail and Salesforce hosting unchanged. |
| Scripts | No first-party bundle references a connection contract directly; slots bind keys. Unaffected. |

Not in this spec: the AI model catalog, the tables/windows seam, and whether operator-declared
GitHub repositories return as seeded connections.

## Section 8: tests

Platform, `DigitalBrain.Platform.Tests.Unit/Connections/`, on
`ModuleTest.Create().WithModule<ExampleModule>()` with a test connector deriving from
`ConnectionNeuron<ConnectionState>` and a scripted probe hook:

- `ConnectSealsTheValueAndTheSnapshotNeverShowsIt`
- `ConnectRequiresAMemberOfTheBrainInTheKey`
- `AcceptGrantIsOnlyReachableFromThePlatformCallback`
- `ProbeMovesStatusAndPublishesExactlyOneSignal`
- `DisconnectClearsSecretsAndUntracksTheKey`
- `AnOAuthLoginRoundTripsIntoAcceptGrant` (through `ModuleHttpEdge` with a token-endpoint stub)
- `ACallbackWithoutAClaimedRequestIsRefused`, `AStaleLoginRequestCannotBeReplayed`
- `TheIndexListsOnlyThisBrainsConnections`
- `AnIntegrationSealsItsSecretsAndReleasesThemOnlyToTheDeclaringModule` (rewrite of `RegistrationFacts`)
- `CredentialBoundaryFacts`: no module assembly constructs a Platform stamp

Modules, each on its own `ModuleTest.Create().WithModule<X>()`:

- Gmail: `AGrantConnectsTheMailboxAndIndexesItsEmail`; `GmailWatchWebhookFacts` stays;
  `GmailOAuthCallbackFacts` and `GmailOAuthPrivacyFacts` deleted; new
  `AnExpiredAccessTokenIsRefreshedThroughTheHook`.
- Salesforce: query, write preview, confirm and guard facts kept against the neuron;
  `SalesforceAccountFacts` deleted; new `AcceptGrantRejectsAnIssuerOtherThanLoginSalesforce`,
  `AWriteWithAnExpiredTokenRefreshesFirst`.
- GitHub: `Repository/GitHubRepositoryFacts`: `AcceptGrantResolvesTheInstallationAndConnects`,
  `AWebhookRoutesThroughTheRepositoryIndexToTheConnection`,
  `ARevokedInstallationMarksTheConnectionFailing`, `AReactivatedRepositoryStillReceivesWebhooks`.
- Postgres, Supabase, ClickHouse: `AUserConnectionResolvesFromTheNeuronsOwnState`.
- Flutter shell: `connections_settings_test.dart` and `connect_window_test.dart` rewritten.
- E2E: `GoldenJourneyFacts` connect step uses the new route; no new E2E.

Seen running: `aspire run`; through `digitalbrain-mcp` call `IConnection.Connect` on
`connection/{brain}/postgres/demo` with a scripted value, read it back as `Connected` with no
secret in the view, confirm `ConnectionConnected` in signals and the connect span in traces; start a
Gmail login and complete it against Google if credentials are configured, otherwise confirm the
login-start span alone.

## Section 9: implementation order

Every project green at every commit.

1. Sealer: `ISecretSealer` in Framework, `SecretSealer` in Platform over the existing cipher and master key, with facts.
2. The connection base beside the old registry: `IConnection`, `ConnectionState`, `ConnectionNeuron<TState>`, `IConnectionIndex`, signals, `ConnectionKeys` moved; Platform facts. Nothing switched yet.
3. Platform OAuth flow: `OAuthMethod`, `OAuthLoginFlow`, `OAuthCallback`, the `/connections/{cid}/login` route, round-trip facts.
4. Gmail switches: `GmailNeuron : ConnectionNeuron<GmailState>`, own endpoints and callback table deleted, refresh hook, tests rewritten.
5. Postgres, Supabase, ClickHouse switch; `IModuleConnectionCredentials` loses its last callers.
6. Salesforce switches: neuron over the base, three singletons folded in, external connection and generic routes deleted, tests rewritten.
7. GitHub switches: `GitHubRepositoryNeuron`, repository index, inbound contract, bindings and setup service deleted, tests rewritten.
8. Platform deletions: registry, endpoints, side door, `IntegrationVault`, forged callers, `ISecrets` if LSP confirms, `AiCredentials` forged caller; `CredentialBoundaryFacts` gains the rule.
9. Shell: one row shape, one start path, Dart tests; old routes die here.
10. Folder and namespace moves in the three connector modules.
11. Seen running per Section 8.

## Hazards

- No state compatibility: every connection and integration state is reshaped; no migrations.
- Concrete arrays in grain state.
- Credential bytes never leave a grain turn: not in `Read`, not in a signal, not in a return value.
- The OAuth callback stamps the owner from protected state only; never from the request.
- Never raise a timeout or add polling to make a check pass.

## Planning corrections

The plan (`docs/superpowers/plans/2026-10-07-connections-restructure.md`) wins over the sections
above where they disagree. This section records where, so the spec stays true.

### Decided while planning

- `ConnectionState` is a mutable class, not a record: the base mutates `Snapshot` on a generic
  `TState`, where `with` is not available. Module states derive from it as classes.
- `SealedSecret.Ciphertext` is a base64 `string` and `KeyId` is the master-wrapped per-grain data key
  (`mk3:…`): every sealed secret is self-describing and `SecretCipher`/`MasterKeyWrapper` are reused unchanged.
- `AcceptGrant` lives on `IConnectionInbound`, a `[PlatformOnly]` sibling of `IConnection` (as
  `IGmailInbound` sits beside `IGmail`). Platform-only contracts bypass `NeuronCallFilter`, so the base
  enforces "only the OAuth callback" itself by checking the stamped owner against the key.
- The ASP.NET `OAuthHandler` subclasses, correlation cookies, `BrowserLogins`, `BrowserLoginSurface`,
  `BrowserLoginCorrelation` and `BrowserLoginDefinition` are deleted. The Platform implements the
  redirect and the callback directly: a one-use request id is the OAuth `state`, the PKCE verifier and
  target are kept with the pending request, and `OAuthTokenExchange` exchanges the code. `LoginPage`
  stays for the HTML answers.
- Token exchange and refresh are Platform code (`IOAuthTokenExchange`), not module hooks: Gmail and
  Salesforce both use the standard `refresh_token` grant. The base's default `RefreshAsync` calls it;
  GitHub overrides it because installation tokens are not OAuth refresh.
- The public origin and test-time token-endpoint overrides are one Platform option, `ConnectionsOptions`
  at `DigitalBrain:Connections:*`, not three per-module `PublicOrigin` options.
- `ISecrets`, `SecretRef`, `SecretReferences`, `SecretsNeuron` and `/secrets` stay: form secrets use the
  vault. Only its role in connections and integrations is removed.
- `IConnectionRequests` (script-facing "request a connection of a kind") stays; its `/requests` route
  moves with the other connection routes.
- Salesforce's `iss` check at the callback is dropped: PKCE, the one-use state and a fixed
  authorization endpoint cover it, and the Platform callback does not expose the raw query to modules.
- The OAuth login body carries an optional `target` (GitHub's repository URL); it reaches the module as
  `OAuthGrant.Target`.

### Decided while implementing

- **Connection grains resolve by connector.** Several connection neurons in one silo cannot be
  addressed by `IConnection` alone, so `ConnectionGrains` resolves a connection key with
  `GrainId.Create(connectorId, key)`: the grain type equals the connector id, validated against the
  silo's manifest before any grain is addressed. *(Postgres, Supabase, ClickHouse: a user connection is
  the neuron's own sealed state)*
- **Supabase live tables use the brain's own connection.** The live-table source resolves the ambient
  brain's `supabase/supabase` connection on every call and never falls back to the deployment backing
  store. *(same commit)*
- **`Connect` refuses OAuth method ids.** An OAuth method's token arrives only through `AcceptGrant`,
  after the Platform's code exchange. *(Platform: one OAuth login and callback for every connector;
  connection routes over the index)*
- **Probe failure detail is the exception type only**, never its message. *(Framework: ConnectionNeuron
  owns a sealed credential; a per-brain index lists connection keys)*
- **`Access` is sealed on `ConnectionNeuron`**: no connector can widen who reaches its connection. *(same commit)*
- **A refreshed grant keeps the stored refresh token** unless the provider rotates it. *(Gmail: the
  connection neuron owns the grant; login and callback are the Platform's)*
- **Salesforce expiry defaults to 60 minutes.** Salesforce grants and refreshes usually carry no
  `expires_in`; without a default the token would never refresh. Refresh-on-401 in the base is open.
  *(Salesforce: one connection neuron; grant, refresh and routes are the Platform's)*
- **GitHub.** The grain type is `github` (connector id), not `github.repository`; a repository
  connection keeps its installation-index entry on revoke, so a later healthy probe still routes; the
  installation-token cache evicts. *(GitHub: a repository connection is a neuron keyed by the brain;
  webhooks route through the installation index)*
- **OAuth clients must be complete before the redirect.** `OAuthTokenExchange.ClientAsync` refuses an
  incomplete OAuth client (missing id or secret) with 409 at login start, not 500 after consent.
  *(same commit)*
- **`/connect` and `/login` refuse** a connector the deployment does not offer, and a connection id
  already used by another connector in the brain. *(Platform: delete the registry, the vault hop and the
  OAuth side door; integrations seal their own secrets)*
- **Caller-context constructors.** The architecture fact pins Platform-kind stamps strictly to
  `IntegrationNeuron.PlatformCaller` and `ShippedContentHosting.PublisherCaller`, and allows
  `Identity.AccountSession` as the only other `CallerContext` constructor: it builds `Kind=User`
  stamps at the authenticated HTTP edge and cannot move without a forging primitive in the Framework.
  *(same commit)*
- **Folders equal namespaces** in Gmail, Salesforce, GitHub and the Platform for the files this
  restructure touched; `DigitalBrain.Salesforce.Signals` and `DigitalBrain.Microsoft.GitHub.Signals`
  keep their names, GitHub's webhook types move to `DigitalBrain.Microsoft.GitHub.Webhook`.
  *(Connections: folders equal namespaces in Gmail, Salesforce, GitHub and the Platform; spec records
  the planning corrections)*

### Open items

- The OAuth callback is not bound to the browser session that started the login (no correlation
  cookie): a provider URL forwarded to a victim connects the victim's account into the attacker's
  brain. Same exposure as the deleted `BrowserLoginSurface`. Cheap partial mitigation: provider prompt
  parameters (force account choice/consent). Real fix: compare the identity cookie at the callback with
  `login.Owner`.
- Refresh-on-401 in the base: a token rejected before its recorded expiry is not refreshed.
- Status is advisory: a successful call never moves `Failing` back to `Connected`.
- `ConnectionsOptions.TokenEndpoints` is not `[PlatformOnly]` and not checked for https.
- The pending-login cap is global, not per owner.
- The request-log filter (`Microsoft.AspNetCore.Hosting.Diagnostics` at Warning, keeping `code` and
  `state` out of request lines) is asserted through options only.
- The GitHub installation-token cache is per silo.
- `IConnection` is a Framework-ring contract, so `digitalbrain-mcp` cannot address it: reading,
  probing and disconnecting a connection through MCP, and an assistant "connect" tool, are not
  available.
- The connector catalog does not expose `OAuthMethods` (the shell guesses which methods are browser
  logins), and the shell sends no `target`, so GitHub cannot be connected from the UI; GitHub is not
  in `OsCatalog`.
- Connect marks a pasted value `Connected` without probing it.
- Each module hosting writes `DigitalBrain:Connections:PublicOrigin`; the last writer wins.
- Platform-stamp sites outside the architecture scan: `OsApps.cs` in the OS host constructs a fourth
  one; `ScriptEdge.cs` copies the ambient stamp `with` a downgrade to App (not a Platform stamp).
- `GmailState` retains unused `CanCompose`, `PendingDraft` and `SubmittingDraft` fields.
