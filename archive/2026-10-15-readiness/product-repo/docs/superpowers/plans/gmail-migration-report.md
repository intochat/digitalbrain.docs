# Gmail connector migration

Implemented in the current `os` checkout without commits.

- Gmail declares connector `gmail` with `google-oauth` authentication and dependency. Google OAuth client fields are deployment Integration secrets; public origin, token endpoint and profile endpoint are ordinary module options.
- Deployment credential reads use `IModuleIntegrations<GmailModule>` asynchronously. Removed module-created Platform callers, direct Integration grain reads/releases and blocking registration reads.
- Added authenticated `POST /brains/{brainId}/connections/{connectionId}/gmail/login`, returning the Google authorization URL. The callback consumes a principal-bound, expiring, single-use random state, rechecks brain membership, and addresses `IGmail` by `ConnectionKeys.For(account/brain scope, gmail, connectionId)`.
- OAuth mailbox identity comes from Google users/me/profile using the exchanged access token; token responses alone no longer infer mailbox identity from neuron keys.
- Access and refresh tokens are written through the Platform-owned module connection credential capability, with the verified target brain supplied to Platform.
- Registered OAuth credentials in the shared connection registry before publishing GmailConnected. Added a persisted, deduplicated mailbox-to-connection index. Push fanout reaches each registered connection across brains. Reauthorization removes a previous mailbox index binding.
- Public IGmail remains the observation neuron contract; inbound accept methods moved to an internal PlatformOnly runtime contract so scripts cannot forge connector events. Preserved Gmail neuron grain type, state aliases/member IDs and vault storage name. Historical global/email Gmail neurons are not migrated: reconnect through the named connection login endpoint. Removed the unused unbound BrowserLoginSurface/GmailLogins/GmailOAuthHandler flow. Connection authorization uses only the new scoped login endpoint.
- Renamed drifted Gmail module/options filenames and removed duplicate Framework project reference. Aspire seeds `google-oauth` Integration fields and module PublicOrigin options.

Verification:
- `dotnet test src/Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests --no-restore --verbosity quiet`: passed 13/13 (latest run after target-brain credential support and option validation).
- `dotnet build src/Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting --no-restore --verbosity quiet`: passed, 0 warnings/errors.
- Production Gmail scan: no CallerContext fabrication, GetResult, direct IIntegration grain calls, old integration/gmail key or hardcoded global IGmail callback key.
- Tests cover verified callback mailbox, missing state, principal mismatch, state replay, two-brain mailbox fanout, separate mailbox index, wrong mailbox/disconnected suppression, unsigned tokens, Secured-host delivery and existing signals. No live Google OAuth verification or Aspire healthy smoke performed by this subtask.

Remaining integration considerations:
- Primary agent owns authenticated enforcement recognition of connection grain keys.
- Connection login state is process-local like existing BrowserLogins; restart invalidates pending authorization and requires starting login again.
- Push is marked explicitly anonymous to account-session authentication and authenticates Google OIDC JWTs itself. Optional google-pubsub Integration settings Audience and ServiceAccountEmail are required for delivery; issuer, signature, lifetime, audience, service-account email and email_verified are validated. The neuron also requires mailbox match and a live registered connection. Secured-host and unsigned-token rejection tests pass.

Final review repair: OAuth client ID/secret now come from one atomic handle ReleaseAsync snapshot. Added a regression handle that throws for separate snapshot/field reads and verifies exactly one release; Gmail suite passed 13/13 after this repair.

Final OAuth surface audit: removed dead legacy login/handler files and registrations. GmailOAuthPrivacySurface sets no-store/no-referrer private headers and redacts query-bearing Activity tags before and after named login/callback handling. Tests assert callback private headers, retired route 404, and code/state query redaction. Aspire descriptions now use /google/gmail/oauth/callback and Integration/connection terminology.

Account binding review: callback state now pins AccountId alongside principal, brain and connection. Callback requires the same principal/account, checks membership in the bound account, and uses bound AccountId to derive the connection key. Regression rejects wrong account without consuming state; suite remains 13/13.
