# Integrations and external dependencies

The catalog registers integration modules, but no live customer account or paid provider was exercised. A connector should be described at its actual evidence level: contract, registration, configured authentication, reachable provider and completed user outcome.

**Snapshot:** DigitalBrain `faddacfc3b5e7cf3a74adfd0efcf8a17e277540b`, 17 October 2026. All paths are relative to DigitalBrain.

| Capability | Code evidence | Required live dependency | Current evidence |
|---|---|---|---|
| Gmail | `src/DigitalBrain.Modules/Google/Gmail`, `GmailModule` | Google OAuth client, consent/scopes, refresh token, mailbox | Registered and implemented; live access unverified |
| GitHub | `src/DigitalBrain.Modules/Microsoft/GitHub`, `GitHubModule` | Authorized GitHub connection and repository permissions | Registered; real read/write outcome unverified |
| Salesforce | `src/DigitalBrain.Modules/Salesforce`, `SalesforceModule` | Tenant credentials, API permissions, target objects | Registered; live tenant unverified |
| Models | `src/DigitalBrain.Modules/AI`, provider factories and model neurons | Provider endpoint, key, quota and model availability | Implemented; no paid inference run |
| ArtCraft applications | `src/DigitalBrain.Modules/ArtCraft/ArtCraft`; `features/os/{PhotoCraft,FilmCraft}` | Application services/MCP endpoints and their readiness | Historical cold-start failures; current live outcome unverified |
| Generic MCP client | `src/DigitalBrain.Modules/ModelContextProtocol/Mcp/DigitalBrain.Modules.Mcp/McpServerNeuron.cs` | HTTP(S) MCP endpoint, provider-specific auth and network policy | Tools discovery/run, session reuse and one reconnect retry implemented |
| Northbound MCP host | `src/DigitalBrain.Mcp`; `src/DigitalBrain.AppHost/AppHost.cs` | Deployed MCP host, shared identity and Orleans connectivity | AppHost includes it; deployment workflow comment/publication must be reconciled |
| Windows capabilities | `src/DigitalBrain.Modules/Microsoft/Windows` | User device, connector and relevant OS capability/TPM | Registered; not equivalent to a cloud container capability |
| Postgres/Qdrant/ClickHouse/Supabase | Corresponding module folders and hosting/deployment projects | Configured storage/services, schemas and credentials | Registration and code; deployment-specific operation unverified |

## Connection lifecycle

`src/DigitalBrain.Platform/DigitalBrain.Platform/Connections/ConnectionEndpoints.cs` exposes connection operations; `ConnectionBindings` resolves configured bindings. `OAuthLoginFlow` builds authorization requests, `OAuthLoginRequests` carries state, and `OAuthTokenExchange` handles token exchange. `Secrets/SecretSealer` encrypts stored secret material via wrapped keys. The Platform suite includes OAuth, connection ownership and token-endpoint stub tests.

Before enabling a connector, use a test account to verify least-privilege consent, callback origin, refresh, expired-token recovery, revocation and deletion. Verify that an app cannot silently choose another user's connection, and that permission denial becomes a useful UI state rather than an empty result. An installed module should not show “connected” solely because its class was registered.

## Dependency-led application selection

A deployment-first pilot should start with the smallest bundle whose dependencies can be monitored and funded. Calculator and workspace flows can establish local usability without proving model quality. An AI research or memory application then adds model access and retrieval evaluation. Creative applications should join the acceptance bundle only after their MCP services pass cold-start and restart checks.

This is a proposed rollout decision, not a replacement for the universal workspace strategy. The [architecture inventory](./architecture) keeps all defaults visible without implying that every integration must be activated on day one.

## MCP permission questions

`McpServerNeuron` validates URL scheme and embedded credentials, lists tool descriptors and exposes tool invocation. It preserves sessions and retries a failed reused session once, excluding protocol errors and cancellation from that retry. An MCP server's read-only hint is descriptive; it does not create a permission boundary.

Unresolved acceptance items are endpoint allowlisting/egress, authenticated MCP servers, per-tool consent, scoped credential forwarding and duplicate side effects after lost responses. See [security](./security). Do not expose a generic “connect anything safely” promise before these are demonstrated.
