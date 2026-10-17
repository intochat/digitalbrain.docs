# Equifax

The Equifax Peru credit bureau as one connection neuron, `IEquifax` (grain type and connector `equifax`).

- `ReadCreditReport(new("12345678", "loan"))` reads the bureau report for a Peruvian DNI (exactly 8 digits;
  anything else is refused before any call). Publishes `BureauReportRead` with the report, or
  `BureauReportFailed(DocumentNumber, Detail)` with the provider status (`unauthorized (401)`, `503`,
  `timeout`, never a secret) and then throws `EquifaxUnavailableException`.
- `ReadRecent(limit)` returns the last reports kept in state (newest first, at most 50; raw payload cut at 32 KB).

`BureauReport.Flags` carries what the SV loan scope reads: Infocorp negative, SBS rating, max days delay,
SICOM unpaid debts, has mortgage, has car loan. Extraction is best-effort; a missing field is `null`.

## Keys

Only connection keys `{brain}/connection/equifax/{id}`: every grain key starts with a brain id, so there
is no deployment-wide key. The connection's auth method picks the credential:

| Auth method | Credential |
|-------------|-----------|
| `credentials` | the value the user pasted, sealed in the neuron |
| `deployment` | the deployment's `equifax` integration (the connected value, conventionally `default`, is ignored) |

## Connector

`equifax`, auth methods `credentials` and `deployment`. A `deployment` connection whose integration is not
Ready fails every read with `BureauReportFailed(…, "Equifax is not configured")` and probes Failing. The pasted value reads like a connection string:
`ClientId=…;ClientSecret=…` with an optional `;BaseUrl=https://…`. A probe acquires a token only:
Connected, or Failing with the status.

## Integration

`DigitalBrain:Integrations:equifax:{Field}`

| Field | Kind |
|-------|------|
| `ClientId` | secret, required |
| `ClientSecret` | secret, required |
| `BaseUrl` | setting, optional (falls back to the module option) |

`EquifaxModuleHosting` adds the AppHost parameters `equifax-client-id` and `equifax-client-secret`.

## Options

`DigitalBrain:Modules:equifax:Options`: `BaseUrl` (default `https://api.sandbox.equifax.com/`), `Scope`
(default `https://api.equifax.com/business/consumer-credit/v1`), `AllowLoopback` (tests only: admits loopback HTTP).

## API shape: ASSUMED

The Equifax Peru contract and sandbox are pending (SV plan). Everything below is an assumption behind the
`IEquifaxProvider` seam, pinned only by the test fake; confirm each line against the contract before go-live.

- ASSUMED base URL `https://api.sandbox.equifax.com/`.
- ASSUMED token: `POST {BaseUrl}v2/oauth/token`, form `grant_type=client_credentials&scope={Scope}`, HTTP basic
  auth `ClientId:ClientSecret`, answer `{"access_token","expires_in"}` (OAuth2 client credentials is what the
  Equifax developer portal uses). The token is cached per credential until expiry minus 30 s.
- ASSUMED report: `GET {BaseUrl}business/consumer-credit/v1/reports?documentType=DNI&documentNumber={dni}` with the bearer.
- ASSUMED payload fields for the flags: `infocorp.negative`, `sbs.rating`, `sbs.maxDaysDelay`, `sicom.unpaidDebts`,
  `products.mortgage`, `products.carLoan`.

Confirmed: nothing yet.
