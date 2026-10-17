# Authentication and public launch

Source review on 15 October 2026. Product authentication exists today; third-party sign-in is not wired into the inspected identity composition.

## Current behavior

| Capability | Status |
| --- | --- |
| Multiple users | Username/password registration provisions separate accounts and default workspaces |
| Sign-in UI | Flutter login and registration forms |
| Sessions | Cookie sign-in, session lookup, logout and authorized brain switching |
| Password storage | ASP.NET PasswordHasher hashes persisted in credential grains; 12–256 character registration requirement |
| Production gate | DigitalBrain:Auth:Posture=Secured rejects unauthenticated protected requests |
| Development posture | Open resolves anonymous callers to the synthetic owner |
| Operator bootstrap | Optional configured Basic credential; separate from ordinary registered accounts |
| Google, Microsoft or GitHub sign-in | No external login handler registered in the inspected identity setup |
| Gmail OAuth | Connects a Gmail account to an existing brain; does not sign a user into DigitalBrain |
| Signup control | Registration endpoint is anonymously accessible even in Secured posture; no invitation gate in the inspected registration handler |

## First launch priority

See [TripRadar comparison and implementation estimate](google-sign-in-reuse.md) for the reviewed Google sign-in reference and proposed reuse boundary.

Before exposing the product publicly, establish a complete account journey: sign in, obtain the correct personal workspace, return after session expiry, sign out, and regain access after loss of credentials.

Recommended direction: add Google sign-in to the existing internal account/session model. Keep provider identity separate from internal account ownership and application connections. Use Google's stable subject identifier for mapping; do not merge accounts merely because email addresses match. See [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

Google login must not automatically request Gmail access. Mailbox access is a separate optional connection.

## Public launch decisions and requirements

- Choose the public hostname and hosting environment.
- Set Secured posture for the deployed hosts; RunProfile.Cloud alone does not enable it.
- Decide whether signup is open or invitation-controlled. Current password registration is open at the handler.
- Configure HTTPS and proxy handling consistently. Cookie SecurePolicy is currently SameAsRequest, so correct request scheme matters.
- Retain cookie-protection keys and account/brain state across redeployments.
- Define account recovery, session revocation, signup/login abuse limits and external-account linking.
- Review state-changing session requests for CSRF protection at the deployed origin.

Password reset, email verification, MFA, login lockout/rate limiting and user-visible session revocation were not found in the inspected identity/login paths. They are readiness gaps to resolve or explicitly cover through an identity provider; this is not an exhaustive security audit.

## Source locations

- IdentityHosting.cs: cookie-only authentication registration and cookie options.
- IdentityEndpoints.cs: registration, login, logout, session and brain endpoints.
- PrincipalPasswords.cs: username/password checks, hashing and account creation.
- AccountSession.cs: Open versus Secured behavior and anonymous registration.
- CookieProtectionStorage.cs: persistent session-protection keys.
- Flutter shell auth/login_screen.dart: username/password UI.
- GmailModule.cs: mailbox OAuth connector.

No tests, builds, deployment or authentication implementation changes were performed for this review.

