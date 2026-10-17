# Web research deployment notes

Customer Researcher 1.3.1 runs through C# app behaviors and the generic Playwright neuron. Flutter renders its named view, source observations and verified evidence; it does not orchestrate research. No desktop connector or exposed CDP port is needed.

## Local and hosted configuration

Set `DigitalBrain:Shell:Enabled` to `false` and `DigitalBrain:Auth:Posture` to `Secured`. Registered accounts use password-hashed credentials and HTTP-only session cookies. An optional bootstrap username/password preserves administration of the existing owner brain. Aspire projects its password through a secret parameter, never a published default. Supply it through the deployment secret store; do not commit it.

Keep the platform identity store, encrypted brain journal, custody key, cookie data-protection store and Postgres database persistent. Back these up together while stopped. Do not change persistence identities or replace keys when moving the existing installation. Serve the web build and identity/brain endpoints under one HTTPS origin; correctly configure trusted proxy forwarding so cookies remain secure. The local preview proxy and Flutter debug server are verification tools, not production hosting.

## Browser prerequisites and limits

Install the Chromium revision matching the application's Microsoft.Playwright package using the generated `playwright.ps1 install chromium` script. On Linux, provision the matching browser and its OS dependencies during image construction. Run as a non-root user with Chromium sandbox support. A deployed image must include this explicitly: the existing OS image recipe does not yet provision Chromium. Do not disable the sandbox to make a container launch succeed.

Optional settings under `DigitalBrain:Modules:playwright:Options`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `ChromiumExecutablePath` | Playwright browser cache | Explicit compatible Chromium executable |
| `MaxManagedAccounts` | 8 | Concurrent account browser processes |
| `MaxManagedSessionsPerAccount` | 4 | Independent ephemeral contexts per account |
| `ManagedSessionIdleTimeout` | `00:05:00` | Reclaim idle sessions |

Account ownership comes from the kernel-stamped caller, never app input. Each account has a separate browser process; each app session has a fresh context without persistent cookies or storage. Stopping the last session releases its process. The host also reclaims idle sessions and disposes workers during shutdown. These are process/context boundaries and count limits, not separate per-account containers or CPU/RAM quotas.

Managed sessions allow public HTTP(S) pages only. Requests and redirects use the address-validated HTTP transport; loopback/private destinations, WebSockets, service workers and downloads are blocked. Deployment-local app origins and `Evaluate` remain unavailable to managed research sessions. Browser egress restrictions and host/container resource limits should also be enforced by the deployment.

## Before public deployment

Validate the actual Linux/container image, Chromium sandbox and public-network egress. Configure persistent volumes/keys, model credentials, HTTPS origin, proxy forwarding and resource limits. Add authentication abuse controls (rate limiting/lockout), account recovery and a server-side session revocation policy before exposing public signup. Current logout clears the browser cookie; it does not revoke a previously copied ticket. MFA and external identity providers are not implemented. These are explicit deployment follow-ups, not features represented by placeholder controls.

Local .NET verification used command-scoped `-p:NuGetAudit=false` because existing centrally pinned `System.Security.Cryptography.Pkcs` and `System.Security.Cryptography.Xml` 10.0.10 advisories are treated as errors. No repository audit policy was disabled and no dependencies were changed in this work. Resolve those advisories before release. C# LSP reference loading also reported unresolved assemblies in some projects; successful project builds, regression suites and live runtime checks provide the verification evidence, not a claim of clean LSP diagnostics.

Existing retained signals without traces can also produce runtime cost-attribution warnings after successful behavior execution. Repair this accounting gap before relying on displayed totals for billing.
