# SV integrations on DigitalBrain — design

Date: 2026-10-11. Source plan: `E:\intochat\sv.docs` (SV / Santa Vera asset finance in Peru; see its
`docs/loans/status.md`, `discovery/plan.md`, `discovery/decisions.md`). Track A of that plan (Vlad) is
"one disposable spike per external system, each answering five questions: auth works, sandbox call
works, callback works, limits and cost known, failure modes seen". This design makes those spikes
DigitalBrain modules and one IntoChat app, so the spikes are not thrown away: they become the
connectors the real product runs on, and the app is the "thin buffer service" of decision D4.

## How it comes together

```
                 SV brain (IntoChat)                               external systems
 ┌─────────────────────────────────────────────┐
 │ app  intochat/SvLoans  (features/intochat)  │
 │  synapses: one reaction each                │
 │   AppRequested check-bureau  ──► IEquifax ──┼──► Equifax Peru (client credentials)
 │   AppRequested score-risk    ──► IRiskSeal ─┼──► RiskSeal (api key)
 │   AppRequested send-otp      ──► ITwilioSms ┼──► Twilio (account sid + token)  ◄── delivery webhook
 │   AppRequested create-payment► IMonnet ─────┼──► Monnet (merchant + api key)   ◄── payment webhook
 │   PaymentReceived (monnet)   ──► ISalesforce┼──► Salesforce Dev Org (OAuth, existing module)
 │  results are neuron state: {app}/results/…  │
 └─────────────────────────────────────────────┘
   slots: salesforce, monnet, equifax, riskseal, sms  → bound to the brain's connections
   each slot bound to a connection: pasted credentials, or `deployment` (the Aspire parameters)
```

Every slot in the SV integration register (plan §A1) maps to one of the four words:

| SV slot | Status in plan | Module (vendor/module) | Connector id | Integration id and fields (Aspire parameters) | Connection auth method |
|---|---|---|---|---|---|
| Salesforce org | decided | `Salesforce` (exists) | `salesforce` | `salesforce`: ConsumerKey, ConsumerSecret | `org-oauth` (browser) |
| Payment collection | Monnet confirmed, docs pending | `Monnet/Monnet` (new) | `monnet` | `monnet`: ApiKey (secret), MerchantId (setting), WebhookSecret (optional secret), BaseUrl (optional setting, sandbox default) | `credentials` = `MerchantId=…;ApiKey=…` |
| Credit bureau | Equifax mandatory, sandbox pending | `Equifax/Equifax` (new) | `equifax` | `equifax`: ClientId, ClientSecret (secrets), BaseUrl (optional setting) | `credentials` = `ClientId=…;ClientSecret=…` |
| Fraud / social signals | RiskSeal mandatory | `RiskSeal/RiskSeal` (new) | `riskseal` | `riskseal`: ApiKey (secret), BaseUrl (optional setting) | `api-key` = the key |
| SMS and OTP | open (Yautalk in old docs) | `Twilio/Twilio` (new; first candidate, swappable) | `twilio` | `twilio`: AccountSid (setting), AuthToken (secret), FromNumber (setting) | `credentials` = `AccountSid=…;AuthToken=…;From=…` |
| eKYC | open, Truora dropped | not built: no provider named | | | |
| Device locking | unnamed, Ravis testing | not built: no provider named | | | |
| Nubefact, payday export | later / to confirm | not built | | | |

Four new modules, one existing, one app. Everything is the existing module shape: nothing new is
added to the Framework.

## Module shape (copy Postgres for keys, Gmail for webhooks, Salesforce for tests)

Each new module is `src/DigitalBrain.Modules/<Vendor>/`:

```
DigitalBrain.Modules.<X>.Contracts/     I<X> : INeuron (+ command/result records, Signals/*)   refs only DigitalBrain
DigitalBrain.Modules.<X>/               <X>Module : Module<<X>ModuleOptions>, <X>Neuron : ConnectionNeuron<<X>State>,
                                        I<X>Provider + Http<X>Provider, (IHttpModule for webhooks)
DigitalBrain.Modules.<X>.Aspire.Hosting/ <X>ModuleHosting : ModuleHosting<<X>Module> + With<X>() adding Aspire parameters
tests/DigitalBrain.Modules.<X>.Tests/   facts over TestBrain with a loopback fake of the provider (like FakeSalesforce)
```

Rules that are enforced by `src/Testing/DigitalBrain.Architecture.Tests` and must hold:

- Runtime module code never calls `IntegrationSchema.Key` or `IIntegration`; it reads credentials only
  through `IModuleIntegrations<XModule>` (`Get(id).ReadAsync` / `ReadSecretAsync`). Only `.Aspire.Hosting` uses `IntegrationSchema.Key`.
- Options records carry no credential-named properties (ApiKey, Secret, Password, ConnectionString …).
- The connection neuron's `[GrainType]` equals the connector id. `[Id]`s in the state start at 8.
- Every csproj is in `DigitalBrain.slnx` under `/Modules/<Vendor>/`; RootNamespace equals the project name.
- Concrete arrays in state, never `IReadOnlyList`.

### One neuron, two auth methods (corrected 2026-10-11 after the first live boot)

Every grain key starts with a brain id (`PartId.Of` refuses anything else, and a machine cluster
cannot open parts for a non-brain). So nothing lives at an integration key like `"default"` and no
index grain is keyed by a provider id. The deployment's credentials are reached the same way a pasted
credential is: through a connection in the brain, created with the auth method `deployment`
(`POST /brains/{brain}/connections/{id}/connect {connectorId, authMethodId: "deployment", value: "default"}`).
For that method the neuron reads the Integration through `IModuleIntegrations<XModule>` on every call
instead of its sealed value; for `credentials` / `api-key` it uses the sealed value. The connection's
`Account` is the provider account (merchant id, account sid). An app binds its slots to such
connections; an unbound slot is a failed result, never a fallback to a global key.

### Signals (provenance is the kernel's; a module publishes only its own facts)

- Monnet: `PaymentOrderCreated`, `PaymentReceived` (from the webhook), `PaymentFailed`.
- Equifax: `BureauReportRead` (raw payload reference + extracted flags: Infocorp flag, SBS rating, max days delay, SICOM unpaid), `BureauReportFailed`.
- RiskSeal: `RiskScored`, `RiskScoreFailed`.
- Twilio: `SmsSent`, `SmsDelivered` / `SmsFailed` (from the status webhook).

Failures are signals, not exceptions swallowed in a script: a fake credential produces a `…Failed`
signal with the provider's status, which is exactly what the discovery spike has to record.

### Webhooks (routed by brain)

`XModule : IHttpModule` maps `POST /monnet/webhook/{brainId}` and `POST /twilio/status/{brainId}` with
`AllowAnonymous()`. The route validates the brain id, authenticates the request (Monnet HMAC with
`WebhookSecret`; Twilio signature with the receiving connection's `AuthToken`), lists the brain's
connections through the Platform's brain-scoped `IConnectionIndex`, keeps the ones of this connector,
and hands the payload to each; a neuron accepts it only when the payload's account equals its own
`Account`, dedups by provider reference (at-least-once delivery) and publishes the signal once. The URL
registered at the provider therefore carries the brain id. No index grain, no startup task: a module
must never activate a grain from silo startup in a way that can fail the silo. (Gmail's
`IGmailMailboxIndex`, keyed by a raw email, has the same latent defect and is tracked separately.)

### Provider adapters

`IXProvider` is the HTTP seam, `HttpXProvider` the implementation on a named `HttpClient`. The real
API shapes:

- Twilio: documented, implement for real (`POST /2010-04-01/Accounts/{sid}/Messages.json`, basic auth).
- Equifax Peru, RiskSeal, Monnet: the SV plan says docs and sandboxes are pending. The adapters
  implement the shape that is documented publicly today where it is, and otherwise a clearly named
  assumed shape (`BaseUrl` setting + one endpoint per operation) that the fake in tests pins down.
  The module README states which calls are confirmed and which are assumed, so the S1 register and the
  spike report are honest.

## The app: `features/intochat/SvLoans` (`sv-loans`)

The integration spikes as one app, so each spike is a synapse and its result is neuron state:

- Operations: `check-bureau <dni>`, `score-risk <json: phone,email,ip>`, `send-otp <phone>`,
  `create-payment <json: amount,reference,phone>`, `record-payment <paymentId>` (writes a Loan
  Transaction to Salesforce through `ISalesforce.PrepareWrite`/`ConfirmWrite`), `status`.
- One `.cs` per reaction; shared `Results.cs` writes `{app}/results/{operation}/{requestId}` as `IText`
  JSON with the request, the outcome and the provider status.
- Reaction `payment-received.cs`: `On<PaymentReceived>(monnet)` → writes the payment to Salesforce and
  records it. This is decision D4's buffer service: webhooks land here, Salesforce is written from here.
- Slots: `salesforce`, `monnet`, `equifax`, `riskseal`, `sms` (connector `twilio`). A slot binding is read as
  `brain.Setting("Account__<slot>")` (DataVisualizer's pattern) and addressed at
  `{brain}/connection/{connector}/{id}`; unbound → the integration key.

## Verification with fake credentials (the acceptance for this change)

1. `dotnet run digitalbrain.cs`; Aspire asks for the new parameters (`intochat-monnet-api-key`, …);
   fake values are entered. Every resource Healthy.
2. `GET /connectors` lists `monnet`, `equifax`, `riskseal`, `twilio` as available (integration Ready).
3. Through `digitalbrain-mcp`: install `sv-loans`, call `check-bureau 12345678`; the result neuron shows a
   `BureauReportFailed` with the provider's 401 (fake credential); same for the other three. Before
   that, one `deployment` connection per connector is created in the brain and bound to the app's slots.
4. Webhook: `POST /monnet/webhook` with a signed fake payload → `PaymentReceived` → the Salesforce
   write attempt is recorded in `{app}/results/record-payment/…`.
5. Traces show the provider span and the signal per call.

Then real sandbox credentials replace the fake ones (user secrets or the Aspire dashboard), and the
same operations answer the five spike questions per system.

## Out of scope here

eKYC and device locking (no provider named), Nubefact, payday data. Rules engine, schedules and loan
servicing live in Salesforce per D24 and are not DigitalBrain neurons. Open design fronts in CLAUDE.md
are untouched.
