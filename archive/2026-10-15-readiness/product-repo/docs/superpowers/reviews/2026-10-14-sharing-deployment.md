# Sharing: local operation and deployment requirements

The current implementation serves accounts, profiles and published releases from one DigitalBrain runtime. Flutter renders app-authored neurons; Circle owns profile posts and installation forms, and Workspace owns the launcher and dock.

## Local preview

Use the existing ignored `.digitalbrain/start-sharing-preview.ps1` and its `.digitalbrain/sharing-preview.json`. They retain the named platform volume `digitalbrain-app-workspace-sharing-platform`, the existing encrypted journal, and persistent Postgres. The browser preview is `http://127.0.0.1:5191/`. It is local only.

The marketplace index and account credentials use platform storage. Published app releases and recipient research use their respective durable stores. Preserving just the app files or just Postgres is insufficient. An anonymous development Azurite volume was removed during an earlier teardown; naming and retaining the platform volume explicitly fixed that lifecycle problem. Backups were taken while stopped and remain outside version control.

The platform volume, account login, existing session cookie and exact published release were verified after stopping the complete AppHost and Azurite, then restarting without registering an account or republishing. The recipient account is `sharing-guest`; its credential is held by the normal local-account mechanism, not this repository.

## Links and account boundaries

Profiles use `#/open?application=circle&input=<encoded navigation JSON>` on the current origin. There is no baked-in localhost hostname in the app. The shell accepts an installed application name and opaque input, dispatches only its `open` operation, and uses the signed-in brain. A link cannot choose a foreign brain or an arbitrary operation. The newest pending link survives connection; the target remains copyable in the address bar.

Installation records the publisher, source brain, version and immutable digest. The recipient receives its own app state. Publisher connections are not copied. A public release can be exported without granting access to its author's private app state. Invalid release links leave the previous navigation intact; stale stored navigation recovers to the feed.

## Before deploying to a hostname

1. Serve the shell and authenticated API behind a stable HTTPS origin. Keep the generic relative links; changing the origin must not require editing Circle or published apps. Validate the reverse proxy's API routing, streaming and forwarded-header configuration with the real deployment.
2. Set `DigitalBrain:Auth:Posture` to `Secured`. The local AppHost defaults to the Open development posture; never expose that local preview or its anonymous owner identity publicly. Verify authenticated accounts and cross-account isolation at the actual deployment origin.
3. Provision durable platform storage, the encrypted brain journal and custody keys, and the app database. Retain stable identity protection settings/keys. Back up and restore these together; do not generate replacement keys to bypass a failed restore. Use one authoritative runtime per journal directory.
4. Configure the model integration and usage policy. Published apps carry behavior and artwork, not deployment secrets or publisher credentials. Test metering and budget enforcement against the chosen production model.
5. Customer Researcher currently requires an authenticated desktop workspace on the same machine as the runtime. `PlaywrightSessionProvider` attaches to `127.0.0.1:{port}`; a desktop on another person's computer cannot satisfy a cloud runtime's loopback attachment. A browser-only visitor can install and inspect the app but cannot run browser automation alone. Cloud deployment needs either a per-account isolated server browser worker or an authenticated outbound device connector that forwards browser operations. Preserve session ownership, cancellation and per-brain authorization; do not expose raw CDP publicly. This change does not implement that remote execution path.
6. Verify account creation/sign-in, a shared profile link across sign-in, exact-release installation, real research and persistence through a deployment restart. Keep Aspire, sandbox management and other development endpoints private.

No public deployment was performed. The local preview proxy is a development helper, not a production gateway.

## Running-system evidence

- `sharing-guest` opened the owner's profile in the browser, previewed the release, saved a custom installation name and forked it. The result showed `customer-researcher`, version `1.2.3`, Live. Origin digest: `8253398c1610c63f4f80f385c9b6ff8c023b78813a3f686eb097e90a3022868e`. Connections were empty; the installing account and app state belong to the recipient.
- The same recipient's desktop workspace mounted the app and attached its browser. A real run against `https://www.hwaci.com/` completed and saved a database record with company identity, website, contact details and verbatim source evidence. The result was read back through the recipient's app neuron. No model or browser response was mocked.
- Earlier runs exposed the model's default high reasoning exhausting the bounded token cap. Version 1.2.3 disables reasoning for these bounded JSON tasks while retaining output limits and source verification. Ambiguous identity and missing source text still produce explicit unsuccessful outcomes; this verification does not establish successful extraction from every website.
- A recipient read of `owner/apps/customer-researcher` was denied and logged by the neuron authorization filter. Public exact-release export and installation succeeded independently of that denial.
- Circle 2.0.19 compiled and ran through the normal update path. Invalid release navigation preserved the previous view; a manually stale navigation record recovered, and a subsequent profile request still worked. Feed/profile display groups releases by app identity while exact old release links remain available.
- Workspace 0.3.4 filters background services, sorts apps and disambiguates equal titles. The live menu aligned artwork and labels; searching `visualizer` left only Data Visualizer. Its 1.1.15 artwork follows the current theme.

Local screenshots, request/result evidence and test logs are retained under `.superpowers/sdd/2026-10-14-app-composed-workspace/`. Credentials, cookies, storage backups and generated runtime data are not committed.

## Validation

- Platform Release: 227 tests passed, including marketplace restart/ownership regression.
- OS Release: 44 tests passed, including shipped-script compilation and missing-Circle provisioning.
- Flutter UI: 188 tests passed; analysis clean. Includes aligned/searchable menus, delayed form drafts, immediate Save and rejection of unseen concurrent edits.
- Final long-label refinement: four focused menu tests passed and analysis remained clean; a live screenshot confirmed both installed copy names wrap visibly while icons remain aligned.
- Flutter shell: 153 tests passed; analysis clean. Includes shared-link readiness, latest-link selection, account switching and retained browser URLs.
- Final browser check: edited form value `research-demo`, submitted state true, revision 6 after immediate typing and Save without Enter. Sign-in restored the shared owner profile and copyable URL. The profile rendered a single Customer Researcher post.
- Aspire OS, MCP, sandbox and desktop shell were Healthy. Runtime telemetry showed recipient behaviors running, bounded inference completing and the expected private-state authorization denial.
- Changed Dart files had no reported LSP diagnostics. The C# bridge's MSBuild workspace load failed to resolve some project/test assemblies, producing cascading missing-reference diagnostics; those are not represented as a clean LSP result. Per-project compilation/tests and live script compile gates passed. Independent reviews found no remaining blocking issue.
