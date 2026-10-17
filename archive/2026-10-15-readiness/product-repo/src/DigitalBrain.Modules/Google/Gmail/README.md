# Gmail

## Connections and deployment credentials

The module's ConnectorDefinition declares supported authentication methods and Integration
dependencies. Platform delivers credentials through scoped async Integration handles; credential
values never belong in module options. User authorizations are per-brain connection neurons holding
sealed credentials. The offered connector catalog is `GET /connectors`, and user connections are managed
at `/brains/{id}/connections`. Provision deployment credentials with
`DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under `DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Pub/Sub delivery is addressed to a brain; its Gmail connections decide by mailbox.

Integration `google-oauth` requires `ClientId` and `ClientSecret`. The connector declares the
`google-oauth` OAuth method; the Platform owns the browser login, the callback and the token
exchange and refresh. Configure `DigitalBrain:Connections:PublicOrigin` as the public HTTPS origin
(loopback HTTP is allowed for development). ProfileEndpoint is an ordinary option.

Start authorization with `POST /brains/{brainId}/connections/{connectionId}/login` and
`{"connectorId":"gmail","authMethodId":"google-oauth"}`. The callback URI is
`{PublicOrigin}/connections/oauth/gmail/callback`. The Gmail connection neuron keeps the tokens as
sealed state; mailbox identity comes from Google's profile response, and a probe asks the same
endpoint whether the stored token still works.

Optional Integration `google-pubsub` contains non-secret `Audience` and `ServiceAccountEmail`.
Without it, OAuth connections remain offered and push authentication refuses delivery.
`POST /google/gmail/watch/{brainId}` requires a Google-signed, unexpired bearer token with the
configured audience and verified service-account email. The Pub/Sub push subscription's endpoint
URL carries the brain id, so one subscription serves one brain; create a subscription per brain
that watches mailboxes. The endpoint offers the push to every Gmail connection of that brain (the
brain's connection index), and each connection accepts it only when the payload's `emailAddress`
is its own verified mailbox; disconnected connections publish nothing. There is no cross-brain
mailbox index: a mailbox connected in two brains needs a push subscription for each.
