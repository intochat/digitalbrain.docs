# AI

## Connections and deployment credentials

The module's ConnectorDefinition declares supported authentication methods and Integration
dependencies. Platform delivers credentials through scoped async Integration handles; credential
values never belong in module options. User authorizations are per-brain connection neurons holding
sealed credentials. The offered connector catalog is `GET /connectors`, and user connections are managed
at `/brains/{id}/connections`. Provision deployment credentials with
`DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under `DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Keyed provider Integrations are `openai`, `anthropic`, `google`, `xai`, and `openrouter`;
`tavily` supplies web-search credentials. Each requires `ApiKey`; provider `Endpoint` is an
optional non-secret Integration setting. Ollama uses ordinary endpoint options. AI has no
user credential Connection tier in this migration.

Provider factories await one atomic release for settings and key. Reusable keyed clients and
default/provider/profile pipelines check the Integration revision with a five-second readiness
cache and rebuild asynchronously when it changes. Resolved profiles retain their model and
explicit endpoint overrides; inferred Integration endpoints are resolved with the current key.
Streaming, embeddings, image generation, transcription, speech and selection remain async.
