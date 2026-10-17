# Google sign in reuse assessment

Reviewed 15 October 2026. TripRadar baseline: 2f26ba9a6b1e03921550a94eef1229d854f7f1ce. Read-only inspection; no tests, builds or product changes.

## Conclusion

TripRadar contains a real Google sign-in implementation and useful reference patterns. DigitalBrain should reuse its own identity/session model and add a Google identity provider. Existing Gmail connector authorization is not product login.

## TripRadar flow and strengths

The React frontend uses Firebase Auth for a Google popup with redirect fallback. It extracts the Google provider ID token and posts it to /api/v1/tokens/sessions/google. The backend validates it using Google.Apis.Auth with configured audiences, looks up/provisions a user and issues TripRadar sessions. Browser tokens are held in HttpOnly cookies, Secure outside development/test, with SameSite=Lax. Rate-limiting and antiforgery infrastructure exist.

Firebase is an additional client-side authentication dependency here; the backend consumes Google's ID token and maintains TripRadar's own session rather than simply using Firebase as its application identity store.

## Findings to address before reuse

1. **Unsafe automatic account linking.** GoogleAuthenticationService.CreateUserAsync first looks up GoogleId, then matches email and attaches the supplied GoogleId without proof of access to the existing application account. TokenController does not check EmailVerified, while new Google users are marked email-confirmed. This is an account-linking security concern, not a reproduced exploit. Google warns that it may not be authoritative for a third-party email address even when email_verified is true. Require explicit authenticated linking and stable provider-subject identity.
2. **Google sign-in does not finish onboarding by itself.** UserAuthenticationValidator requires a Telegram ID and username. This is TripRadar product policy and must not carry into DigitalBrain.
3. **Login correlation needs review.** CookieAntiforgeryFilter skips AllowAnonymous endpoints, including TokenController. The inspected Google request sends only id_token and the backend adds no browser-bound nonce/state check. Firebase handles its own provider flow, but that does not by itself establish binding at the application's token-exchange endpoint. Treat this as a login-CSRF/correlation gap to resolve, not a confirmed exploit.
4. **Identity uniqueness needs strengthening.** The inspected EF configuration indexes GoogleId without IsUnique. Enforce one owner for each provider identity, including concurrent first login and account linking.
5. **Configuration should fail closed.** Reject empty/misconfigured client-ID allowlists at startup or disable the provider explicitly; do not rely on library edge-case behavior.

Sources in TripRadar: WebUI/src/features/auth/lib/oauth.ts; Server.API/Controllers/TokenController.cs; Server.API/Services/GoogleIdTokenValidator.cs; Server.API/Filters/CookieAntiforgeryFilter.cs; Server.API/Security/AuthCookieHelper.cs; Server.Infrastructure/Services/GoogleAuthenticationService.cs; Server.Infrastructure/Services/UserAuthenticationValidator.cs; Server.Infrastructure/Database/EntityFrameworkConfigurations/UserProfileConfiguration.cs; Server.Domain/Aggregates/User.cs.

## DigitalBrain architecture recommendation

Add Google sign-in as a provider capability under the Google vendor area. Keep generic account provisioning, external-identity mapping, sessions and membership in Platform Identity. Reuse current cookie sessions and personal-brain provisioning. A separate Google identity component alongside Gmail is clearer than making product login depend on the Gmail connector.

The new flow is: anonymous visitor → Google identity proof → unique provider/subject mapping → existing or new DigitalBrain principal/account → existing cookie session → personal workspace.

Existing connector OAuth starts with a CallerContext owner, connection key and brain. Its callback imports an authorization grant into that connection. It cannot establish the initial owner without a separate identity flow. Reuse configuration conventions and appropriate OAuth mechanisms, not the assumption that the visitor is already signed in.

Use standard Google/OIDC handling with browser correlation, issuer/audience/expiry validation and minimal identity scopes. Keep Gmail access optional and separately consented. Account linking requires an authenticated user. No automatic email-based merging.

## Effort estimate

Planning estimate for one experienced engineer familiar with this code, one web deployment and one Google provider:

- Core sign-in, identity mapping, provisioning and web UX: 3–5 working days.
- Public-launch auth scope including linking policy, signup control, abuse limits, error/recovery UX and deployment review: approximately 5–10 working days total.

These are rough effort ranges, not a fixed quote or a claim of verified readiness. Native desktop login, multiple providers, existing-account migration and full password recovery/MFA expand scope. External console setup/approval time is excluded. Validation would require separately agreed work; none was run here.

## Operating cost

Direct Google/OIDC integration can use the existing server and sessions without adding Firebase as an identity platform dependency. Hosting, storage and support still cost money.

If choosing Google Identity Platform instead, its published social-provider tier is free through 50,000 monthly active users; the next 50,000 are $0.0055 each, making 100,000 MAU approximately $275/month for authentication alone. This pricing is specific to Identity Platform, not a fee asserted for direct Google sign-in. Project quotas, plan choice and other services still apply.

Sources checked 15 October 2026:
- [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)

## Proposed first release

Continue with Google; returning users open the same workspace; new users receive one personal workspace; existing password accounts remain separate until explicitly linked; no Gmail consent during login; signup policy and usage limits are applied before granting paid capabilities.

This is a proposed design for discussion, not an implemented change.

