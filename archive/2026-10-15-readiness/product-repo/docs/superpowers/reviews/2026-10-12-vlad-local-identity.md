# Vlad local identity: implementation and live verification

Date: 2026-10-12. Native execution of the approved [plan](../plans/2026-10-12-vlad-local-identity.md).

## Delivered

The local Windows Aspire desktop launches into the real `vlad` principal without a password prompt. Registration allocates its own account and personal brain; neither the synthetic `owner` identity nor its data was renamed or moved. The running desktop was restarted and inspected as Vlad.

Local entry uses existing registration/login endpoints and cookies. The development AppHost opts in through `DigitalBrain:Shell:LocalAccount`; only Windows desktop run mode in Development receives a credential-file path. The generated credential is stored outside the repository under the Windows user's local application-data directory, with protected ACLs allowing that user and administrators. Neither the password nor a new authentication bypass is projected into server configuration, web assets or command arguments.

Native gRPC now obtains the current cookie from the same client that signs in over HTTP. This fixes a source-confirmed and test-reproduced identity split: HTTP was signed in while native calls and subscriptions carried no cookie. Existing anonymous and Basic behavior remains covered.

## Live evidence

| Check | Observed result |
|---|---|
| Principal | `vlad` |
| Account | `8541b12bd32d49f48271a775168cae23` |
| Personal brain | `account-8541b12bd32d49f48271a775168cae23` |
| Session after full desktop restart | Same principal, account and brain |
| Actual Flutter widget tree after restart | `WorkspaceApp` scoped to server + `vlad` + the account above |
| Native workspace read | Successful in Vlad's brain |
| Native live subscription | `TextChanged` received; value read back as `Vlad local identity verified` |
| Unrelated private brain | Vlad's native read of `owner` workspace refused |
| Verification app | `vlad-identity-check` |
| Completed build | Version `0.1.2`, `Live` |
| Executed behavior | Echo produced `Vlad: hello from my brain`; runtime logged `BehaviorRan ... Succeeded` |
| Publication | Marketplace listing publisher `vlad`, version `0.1.2`, source is Vlad's account and brain |
| Original owner workspace | Conversation, draft, focused window and open-window IDs identical to saved snapshot |

The compile/run/publish checks were separate operations. The verification app used the existing `IApp.Create`, `BeginBuild`, `CurrentBuildAttempt`, `CompleteBuild`, `Request` and `Publish` lifecycle; no model-generated code or external connection was needed. Its read-only text entry remains available in Vlad's brain. Publishing here means the local marketplace; `digitalbrain.tech/vlad` was not deployed.

Aspire's active projects, executables and containers reached Running/Healthy after restart. Rebuilder jobs and deployment-only resources were correctly not started. Flutter hot restart succeeded; runtime error inspection reported no errors after successful entry. System One's initial unhealthy state was its model warm-up; the sandbox rebuilt successfully without changing readiness timeouts.

Telemetry: native text verification includes trace `0c3fce9c08993e05554c426420b5944c` with `IText/Set` on Vlad's scoped neuron and successful HTTP/2 gRPC transport. Publication trace `901aa34d3f130690631d9d7e16f18daa` contains `IApp/Publish`, completed in 473 ms. Structured logs for that trace confirm the real OS front-to-silo request. The identities above come from the authenticated session and scoped access checks, not an assumption based solely on a display label.

Raw local evidence: `artifacts/vlad-local-identity/` contains the original/restored workspace snapshots, session reads, native Dart probes, publication attempts, trace data and test logs. No credential or cookie is included in the retained verification results. Existing Assistant benchmark artifacts were preserved.

## Verification results

- Core: `dart test` — 15 passed, including real local gRPC server tests for calls, subscriptions and refreshed cookies, plus local-login HTTP status/identity/refusal cases.
- Shell: `flutter analyze` — no issues; `flutter test` — 213 passed. The focused three new tests exercise automatic entry, account switching, failed startup, file opt-in and remote/web refusal.
- Flutter hosting: `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests.Hosting` — 20 passed. Includes credential reuse, ACLs, malformed-file preservation and real desktop/web/publish/production composition checks.
- AppHost: project build succeeded with zero warnings and errors after gracefully stopping the running AppHost that held its dependency DLL open.
- Dart analyzer tool: no errors. C# LSP diagnostics for the new credential helper: empty. Symbol mapping evidence retained for the modified entry points.
- One independent final code review found no actionable correctness, security or regression issues in the scoped changes.

## Failed attempts and limits

1. **Cold first account setup reached the recoverable error screen.** The account was created and OS apps installed, but the initial shell attempt did not finish successfully. A hot restart resumed the existing account; a subsequent full desktop restart also entered Vlad successfully. The exact first-attempt exception was not captured because the UI intentionally reports a generic credential-safe failure. This is a remaining first-run UX limitation; no timeout was increased and no automatic registration retry loop was added.
2. **Authenticated MCP for Vlad remains blocked at the separate MCP machine.** Both scoped and default routes refused membership lookup because that machine serves no account of Vlad's new brain. Anonymous `neurons_context` still resolves correctly as owner. Acceptance for Vlad therefore used explicitly authenticated HTTP and the actual Dart native gRPC client against the OS front, as allowed by the plan. No machine membership or contract permission was widened. MCP coverage for newly registered accounts needs a separate wiring fix.
3. **The first publication probe used `WriteBehavior` alone.** The source deployed, but app status stayed Drafted and no echo was observed within the probe's 30-second deadline. The corrected probe used the full existing build lifecycle and observed Live, execution and publication. Both attempts are retained; a source write is not reported as a completed build.
4. **The first Python session probe used HTTP.** Its cookie jar correctly withheld a Secure cookie and read anonymous owner state. The probe was corrected to HTTPS, trusting the local development certificate; the subsequent session and access checks resolved Vlad. The real desktop already targets HTTPS.
5. Account switching was verified in the shell widget test; the live app does not enable Flutter Driver, so no live button-click result is claimed. Browser auto-entry is intentionally absent and covered by tests; no browser/public deployment was performed.

The working tree remains uncommitted. Existing Assistant edits and documents were not included in this implementation's review scope or changed by it.

## Return to Circle

Vlad can now actually author, run and publish an app with correct identity. Circle's next slice is presentation and destination choice over those same app records: feed -> Vlad profile -> publication preview -> personal fork or circle destination. It should not introduce another executable post format or duplicate app storage.

Before exposing the approved flow, its implementation must preserve these current-source boundaries:

- The current marketplace installer exports the current published bundle; a feed card claiming an older exact version needs durable version-specific publication retrieval, not a silently updated `ExportPublished()` result. Existing app history is bounded at 20 entries.
- `ICircle.Share` shares the member's installed app. A direct publication-to-circle action must preserve the original publisher/version and the bringing member without importing their private settings or connections.
- A preview must use explicitly public-safe output. Rendering arbitrary owner workspace roots or its full runtime stream would not implement a read-only public preview.
- Show Draft, Compiled, Needs setup, Running and latest execution outcome only when backed by their corresponding state. The failed probe above demonstrates why these must not collapse into one success indicator.
- Keep Try live off until its allowed interactions, resource owner and execution boundary are implemented. The read-only publication and fork journey can ship first.

These are the next technical design decisions for Circle, not additional features claimed by the local identity milestone.
