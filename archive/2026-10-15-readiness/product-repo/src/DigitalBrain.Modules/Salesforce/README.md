# Salesforce

## Connections and deployment credentials

The module's ConnectorDefinition declares supported authentication methods and Integration
dependencies. An org connection is the Salesforce neuron itself, keyed
`{brain}/connection/salesforce/{id}`: it holds the access and refresh tokens as sealed state and
records the org's instance URL as its account. The offered connector catalog is `GET /connectors`,
and user connections are managed at `/brains/{id}/connections`. Provision deployment credentials with
`DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under `DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Connector `salesforce` declares the OAuth method `org-oauth` on Integration `salesforce`, whose
`ConsumerKey`/`ConsumerSecret` are the client id and secret. The Platform runs the browser login
(`POST /brains/{brainId}/connections/{id}/login` with connector `salesforce` and method `org-oauth`), the callback
(`/connections/oauth/salesforce/callback`, the URL to register in the External Client App), the
code exchange and the refresh; the module maps no routes. The public origin is the Platform's
`DigitalBrain:Connections:PublicOrigin`.
