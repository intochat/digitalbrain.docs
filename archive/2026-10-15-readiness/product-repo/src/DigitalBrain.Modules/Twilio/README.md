# Twilio

SMS for OTP and notifications through Twilio's documented REST API, plus the signed delivery-status webhook.

## Neuron

`ITwilioSms` (grain type and connector id `twilio`):

- `Send(SendSms(To, Body, ClientReference?))`: `To` must be E.164 and `Body` 1 to 1600 characters; both are
  checked before any call. A repeated `ClientReference` (among the last 100 messages) returns the earlier
  message without sending again. Publishes `SmsSent` on success. A refusal (401, 400 with a Twilio code such
  as 21211) publishes `SmsFailed` and returns a `failed` message with the code. 5xx, timeouts and unreachable
  publish `SmsFailed`, then throw `TwilioUnavailableException`.
- `ReadRecent(limit)`: the newest messages first, with the status the webhook last reported.

Two kinds of key:

- `default` (the integration key): the deployment's account from Integration `twilio`. It has the settings
  `AccountSid` and `FromNumber` and the secret `AuthToken`, provisioned as `DigitalBrain:Integrations:twilio:{Field}`.
- `{brain}/connection/twilio/{id}`: a member pastes `credentials` = `AccountSid=…;AuthToken=…;From=…`
  (read like a connection string). It is sealed in the neuron, its `Account` is the AccountSid, and the probe
  reads `GET 2010-04-01/Accounts/{sid}.json`, where a 401 means Failing.

## API calls

`POST {BaseUrl}2010-04-01/Accounts/{AccountSid}/Messages.json` uses basic auth `AccountSid:AuthToken` and the form fields
`To`, `From`, `Body` and `StatusCallback`. `BaseUrl` defaults to `https://api.twilio.com/`, and a loopback URL needs
`AllowLoopback` (tests only).

## Status webhook

`POST /twilio/status` (anonymous, form-encoded). `StatusCallback` is `{DigitalBrain:Connections:PublicOrigin}/twilio/status`;
without a public origin the field is omitted, so set the webhook in the Twilio console instead. The endpoint finds the
receivers through `ITwilioAccountIndex`, keyed by the `AccountSid` form field. The `default` neuron registers at startup
when the integration is Ready, and connections register on connect. The endpoint passes the URL, the form and
`X-Twilio-Signature` to each receiver. The receiver checks the signature inside the grain: HMAC-SHA1 with the
AuthToken over the URL followed by the form fields sorted by name, each name directly followed by its value, then base64.
The receiver publishes once per (MessageSid, MessageStatus): `failed`/`undelivered` → `SmsFailed(To, "status (Twilio error N)")`,
anything else → `SmsDelivered(Sid, Status)`. If no receiver verifies the request, it gets 403.

## Aspire

`TwilioModuleHosting` always adds the parameters `twilio-account-sid`, `twilio-auth-token` (secret) and
`twilio-from-number`, and projects them as the integration's environment variables.
