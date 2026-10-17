# GitHub

## Connections and deployment credentials

The module's ConnectorDefinition declares supported authentication methods and Integration
dependencies. Platform delivers credentials through scoped async Integration handles; credential
values never belong in module options. User authorizations are per-brain connection neurons holding
sealed credentials. The offered connector catalog is `GET /connectors`, and user connections are managed
at `/brains/{id}/connections`. Provision deployment credentials with
`DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under `DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Integration `github` requires `PrivateKeyPem` and non-secret `AppId`; `ClientId` is an optional
setting and `ClientSecret` and `WebhookSecret` are optional secrets. AppId and signing key are
materialized together. `PublicWebhookUrl` is the only GitHub module option.

A repository connection is the neuron `{brain}/connection/github/{id}`. The Platform's OAuth login
(`POST /brains/{id}/connections/{connectionId}/login` with connector `github` and the repository URL
as `target`; callback `/connections/oauth/github/callback`) hands the user token to the neuron once: it proves that the user
and the App installation both reach the repository, and is then replaced by installation tokens minted
from the App key. Webhooks at `/integrations/github/webhook` are signature-checked, then routed through
the persisted index `installation/{installationId}` to every brain's connection on that installation.

Aspire accepts an installation-only AppId/private-key configuration. OAuth requires the
ClientId/PublicOrigin pair (projected as the Integration's ClientId and the shared
`DigitalBrain:Connections:PublicOrigin`) and projects its client-secret parameter; configuring
PublicWebhookUrl independently projects the webhook-secret parameter. Missing OAuth/webhook
credentials do not disable app installation.
