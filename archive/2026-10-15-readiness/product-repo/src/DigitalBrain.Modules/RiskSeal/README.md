# RiskSeal

Fraud and digital-footprint scoring on an email, phone (E.164), IP address and document number.

## Neuron

`IRiskSeal` (grain type and connector id `riskseal`):

- `Score(ScoreRequest)`: needs an email or a phone (E.164) and refuses the request before any call
  otherwise. On success it keeps the score (the last 50) and publishes `RiskScored`. On failure it
  publishes `RiskScoreFailed` with the provider's status (`unauthorized (401)`, `503`, `timeout`,
  `unreachable`), never a credential, and throws `RiskSealUnavailableException`.
- `ReadRecent(limit)`: newest first.

The raw provider payload is kept in `RiskScore.RawJson`, truncated to 32 KB.

## Keys and credentials (the Postgres pattern)

The neuron serves only connection keys `{brain}/connection/riskseal/{id}` (every grain key starts with a
brain id). The connector offers two auth methods:

- `api-key`: scores with the key a user pasted; the value is the key itself.
- `deployment`: scores with the deployment's Integration `riskseal`: `ApiKey` (secret, required),
  `BaseUrl` (setting, optional), read through `IModuleIntegrations<RiskSealModule>`. The connected value is
  a marker (conventionally `default`) and is ignored. When the integration is not Ready, a score publishes
  `RiskScoreFailed` with `RiskSeal is not configured` and throws, and a probe is Failing with the same detail.
  The AppHost parameter is `riskseal-api-key`.
- Probing a connection calls the account endpoint: Connected, or Failing with the status.

The base URL is the Integration's `BaseUrl` setting, else the module option `BaseUrl`, else
`https://api.riskseal.io/`. It must be HTTPS; a loopback HTTP URL needs `AllowLoopback` (tests only).

## ASSUMED wire contract

RiskSeal's API contract and sandbox are still pending (SV plan), so everything below is an
assumption behind the `IRiskSealProvider` seam (`HttpRiskSealProvider`). Replace it once the real docs arrive.

| What | Assumed shape |
|------|---------------|
| Base URL | `https://api.riskseal.io/` |
| Auth | `Authorization: Bearer {ApiKey}` |
| Score | `POST {base}v1/score` with JSON `{"email","phone","ip","document"}` |
| Score reply | `{"request_id": "...", "score": 0-100, "risk_level": "low/medium/high", "signals": [{"name","value"}]}`; `signals` may also be an object `{name: value}`; `requestId`/`riskLevel` are also read |
| Probe | `GET {base}v1/account`, 2xx means the key works |
| Errors | 401 → `unauthorized (401)`; any other non-2xx → its status code; 30 s client timeout → `timeout` |
