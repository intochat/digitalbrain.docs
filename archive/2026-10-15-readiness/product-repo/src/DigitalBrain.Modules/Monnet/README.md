# Monnet

Payment collection for Peru through [Monnet](https://monnet.io). One neuron, `IMonnet`, serves one merchant
on a connection key `{brain}/connection/monnet/{id}` (no other key is served):

- auth method **`credentials`**: the merchant a member of the brain pasted;
- auth method **`deployment`**: the deployment's merchant from the `monnet` integration. Connect with
  `Connect("deployment", "default")`; the value is sealed but ignored, every call reads the integration.

| Operation | Signal |
|-----------|--------|
| `CreatePaymentOrder(amount, reference, description, currency = "PEN", payerPhone?, payerDni?)` | `PaymentOrderCreated` or `PaymentFailed` |
| `ReadPayment(paymentId)` | none on success, `PaymentFailed` on failure |
| `ReadReceived(limit)` (read-only, newest first) | none |
| webhook delivery (final status) | `PaymentReceived` (paid) or `PaymentFailed` (failed/rejected/expired/cancelled) |

`PaymentFailed.Detail` is the provider status only: `unauthorized (401)`, `unavailable (503)`, `timeout`,
`unreachable`, `payment rejected`. It never carries a key, a provider body or a URL. The same text is the
message of the `MonnetUnavailableException` the caller receives.

## Connector

`monnet`, auth methods `credentials` and `deployment`, requires the `monnet` integration. The `credentials`
value reads like a connection string:

```
MerchantId=<merchant id>;ApiKey=<api key>[;BaseUrl=https://…/]
```

A paste that does not parse is refused at Connect (the connection is left `Failing`); so is a `deployment`
connect while the integration is not Ready. Either way the connection's `Account` is the merchant id. The
probe calls `GET v1/merchants/me` with the method's key: 2xx is `Connected`, anything else `Failing` with the status.

## Integration (`DigitalBrain:Integrations:monnet:*`)

| Field | Kind | Required | Use |
|-------|------|----------|-----|
| `ApiKey` | secret | yes | `X-Api-Key` header |
| `MerchantId` | setting | yes | `X-Merchant-Id` header and the `deployment` connection's `Account` |
| `WebhookSecret` | secret | no | HMAC key for webhook deliveries. Without it **every delivery is refused** (401) |
| `BaseUrl` | setting | no | overrides the module option |

`BaseUrl` precedence: pasted credentials, then integration setting, then module option
`DigitalBrain:Modules:monnet:Options:BaseUrl`, then the sandbox default `https://sandbox.api.monnet.io/`.
HTTPS only; `AllowLoopback` admits a loopback HTTP(S) fixture (tests).

The Aspire hosting (`WithMonnet()`) asks for `<brain>-monnet-api-key`, `<brain>-monnet-merchant-id` and
`<brain>-monnet-webhook-secret`.

## Webhook

`POST <deployment origin>/monnet/webhook/{brainId}`, anonymous, body at most 64 KiB. Register that URL at
Monnet, one per brain. A `brainId` that is not a valid brain id is 404. The request is authenticated by
`X-Monnet-Signature: <hex HMAC-SHA256 of the raw body with WebhookSecret>` (an optional `sha256=` prefix is
accepted; 401 otherwise). The delivery is offered to every Monnet connection in the brain's connection index;
a connection takes it only while Connected and when its `Account` equals the body's `merchantId` (another
merchant id is 202 and publishes nothing). Delivery is at-least-once; a payment id whose final
status was already accepted is ignored, and non-final statuses (`created`, `pending`) publish nothing.

## Assumed API

Monnet's API documentation and sandbox are pending (SV plan). **Every call below is ASSUMED**; the fake in
`tests/` pins the shape so that swapping in the documented one is a change to `HttpMonnetProvider` and
`MonnetWebhookPayload` only.

| Call | Shape (assumed) |
|------|-----------------|
| create | `POST {BaseUrl}v1/payments`, headers `X-Api-Key`, `X-Merchant-Id`, body `{merchantId, amount, currency, reference, description, payer?: {phone, dni}}` → `{id, reference, amount, currency, status, checkoutUrl}` |
| read | `GET {BaseUrl}v1/payments/{id}` → `{id, reference, amount, currency, status}` |
| probe | `GET {BaseUrl}v1/merchants/me` → 2xx |
| webhook | body `{merchantId, paymentId, reference, amount, currency, status}`, header `X-Monnet-Signature` (hex HMAC-SHA256) |
| sandbox origin | `https://sandbox.api.monnet.io/` |

Confirmed: nothing yet.
