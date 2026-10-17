# Vlad local identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Start the local Windows Aspire shell as the real principal `vlad`, without asking Vlad to enter a password, and prove that HTTP and live neuron calls use his own account and brain.

**Architecture:** Reuse the existing registration, cookie sign-in, membership and brain-creation paths. A local desktop launch supplies a private machine-held credential to the shell; it is not a new anonymous server identity or a change to `owner`. Keep the social UI, publication model and 3D renderer in subsequent plans with separate acceptance checks.

**Tech Stack:** Existing .NET/Aspire host, Flutter desktop shell, HTTP cookie sessions and native gRPC neuron channel.

**Spec:** `docs/superpowers/specs/2026-10-12-vlad-live-brain-circle-design.md` — approved first flow, step 1. The technical mechanism was approved for Native execution and implemented. See the [verification report](../reviews/2026-10-12-vlad-local-identity.md) for evidence and remaining first-run/MCP limitations.

## Global Constraints

- Password-free entry applies to the local Aspire desktop experience; public authentication is unchanged.
- Preserve the existing `owner` brain, apps, drafts, connections and publication provenance.
- `vlad` is a principal/username. Account and brain IDs come from registration; never fabricate either as `vlad`.
- Preserve Neuron, Signal, Behavior and Connector, existing membership enforcement and compile-gated publication/install.
- No Assistant routing, confidence gate, model selection or contract permission changes.
- Preserve all pre-existing uncommitted work and benchmark evidence; stage only this milestone's files if committing.
- LSP definition/reference/implementation/caller mapping precedes every C#/Dart edit; diagnostics, affected project tests and live Aspire evidence precede completion.

## Review Focus

1. Existing `vlad` registered elsewhere or with another credential: refuse auto-entry; never reset or take over the account (Task 2).
2. Restart or interrupted registration: reuse the credential and the same account/brain, without duplicate registration (Tasks 2–3).
3. HTTP signed in but live gRPC anonymous: both transports must resolve the same member (Task 1).
4. Switching to another user: stop old subscriptions and do not immediately auto-sign-in Vlad again (Task 3).
5. Web, published deployments or a remote server: no local credential provisioning or forwarding (Tasks 2–3).

## Source findings and scope

`PrincipalPasswords.Register` already provisions real accounts through `IIdentityClient` and `BrainBirths.Born`. It requires a password of 12–256 characters; a generated local secret can satisfy that without asking the user for one. `PrincipalGrain.Register` allocates the account and personal brain IDs. Retain those mechanisms.

`DigitalBrainUiClient.signIn` already captures a session cookie and updates principal/account/default brain. `BrainSessionGate` currently enters anonymous Open sessions as `owner`. Its account-switch path already removes the shell before sign-out.

There is a prerequisite transport gap in the inspected source: `CookieHttpClient` retains HTTP cookies, while `DigitalBrainUiClient.channel` constructs `NeuronChannel` with only Basic authorization. Before claiming a registered desktop account works, test and correct native gRPC session propagation. Do not mask it by forcing HTTP polling.

This milestone does not deliver the social feed. It makes its authorship and ownership trustworthy. No new server authentication endpoint, changed default owner, public hosting or automatic movement of existing work is needed.

### Task 1: Carry the signed-in session into the native neuron channel

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/neuron_channel.dart`
- Inspect/map before editing: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/neuron_channel_io.dart` and `neuron_channel_web.dart`
- Test/create: `src/DigitalBrain.Modules/Google/Flutter/app/core/test/neuron_session_test.dart`

**Interfaces:** Preserve `NeuronLink.call`, `watch` and `shutdown`. Extend `NeuronChannel(Uri baseUri, {String? authorization, Map<String, String> Function()? sessionHeaders})`; the optional provider supplies current cookie metadata at call/subscription creation. `DigitalBrainUiClient` supplies the native cookie header from its existing `CookieHttpClient.cookies`; web continues using browser-managed credentials.

- [x] Map the channel constructor and every caller with Dart LSP; inspect the installed gRPC metadata API and current official documentation before implementation.
- [x] Add failing tests: `signedInNativeCallsAndWatchesCarryTheSessionCookie` asserts the captured login cookie is present for both operations; `newCallsUseTheCurrentCookie` changes the cookie and checks the next call; `anonymousAndBasicClientsKeepTheirExistingBehavior` verifies no invented cookie and unchanged Basic authorization.
- [x] Implement the optional metadata provider using the installed gRPC per-call metadata mechanism; do not retain a cookie snapshot indefinitely. Never put cookie values in logs.
- [x] Run `dart test` from the pure-Dart core package and `flutter analyze` plus `flutter test` from the shell package. Existing web and anonymous session tests must stay green.
- [x] Record this as a separately reviewable change. The later live check must exercise real authenticated gRPC, not only mocked headers.

### Task 2: Provision a private credential only for local desktop launch

**Files:**
- Create: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Aspire.Hosting/LocalDesktopAccount.cs`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Aspire.Hosting/ShellHostingExtensions.cs`
- Modify: `src/DigitalBrain.AppHost/appsettings.Development.json`
- Create: `src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests.Hosting/LocalDesktopAccountFacts.cs`

**Interfaces:** Add `LocalDesktopAccount.Ensure(string directory, string principalId) -> string`, returning the absolute credential-file path. File JSON is `{ "principalId": "vlad", "password": "<generated secret>" }`. Host opt-in key is `DigitalBrain:Shell:LocalAccount`; default is absent, repository development value is `vlad`. Only a Windows desktop host in Aspire run mode with Development environment may project `DIGITALBRAIN_LOCAL_ACCOUNT_FILE` to its executable. Never project the secret itself.

- [x] Map `ShellHostingExtensions` executable creation, environment projection and publish/web branches through C# LSP.
- [x] Add failing facts: `ALocalDesktopRunGetsOnlyACredentialFilePath`, `WebAndPublishNeverProvisionALocalAccount`, `RestartReusesTheSameCredential`, `AnExistingMalformedCredentialIsNotReplaced`. Assert no password appears in resource environment, launch arguments or served web config.
- [x] Implement an atomic create-once credential file in the current Windows user's local application-data directory, scoped to this deployment. Generate 32 random bytes encoded as hex. Restrict access to the current user and system administrators before publishing the path; fail if this cannot be established. Preserve an existing valid file; never regenerate on network/auth failure. Use the current .NET Windows file-security APIs after checking their documentation.
- [x] Enable the repository development opt-in. Do not change production config, `AuthOptions`, `DefaultOwner`, server membership checks or Basic bootstrap credentials.
- [x] Run `dotnet test --project src/DigitalBrain.Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests.Hosting`; build the affected hosting and AppHost projects separately. Confirm publish/web composition exposes no local-account material.

### Task 3: Enter Vlad's real session at desktop startup

**Files:**
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/auth/local_account_io.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/auth/local_account_web.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/auth/brain_session_gate.dart`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/core/lib/src/ui_client.dart`
- Create: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/local_account_test.dart`
- Extend: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/session_brain_test.dart`

**Interfaces:** `LocalAccount` has `principalId` and `password`. Both conditional-import files expose `Future<LocalAccount?> readLocalAccount(Uri server)`; the web implementation always returns null. Add `DigitalBrainUiClient.signInLocalAccount(String username, String password) -> Future<void>` using existing identity HTTP endpoints and the existing `_useSession` parser. No Basic fallback.

- [x] Map session-gate startup, sign-in, account switching, client close and session parsing using Dart LSP.
- [x] Add failing tests: `localStartupEntersVladWithoutShowingLogin`, `restartUsesTheSameServerBrain`, `aConflictDoesNotResetOrReplaceVlad`, `anUnavailableServerDoesNotEnterOwner`, `switchAccountDoesNotAutoReturnToVlad`, and `remoteAndWebClientsNeverSendLocalCredentials`.
- [x] Implement local entry only when the file opt-in exists and the resolved server host is loopback (`localhost`, `127.0.0.1` or `::1`). Reject remote destinations before reading/sending the credential. Preserve the ordinary session flow when no local opt-in exists.
- [x] Attempt ordinary `/identity/login` first. Only an explicit 401 permits one `/identity/register` attempt with the same generated credential. Registration conflicts, network errors and server failures surface a recoverable startup error; no password reset, secret regeneration, repeated registration loop or anonymous `owner` fallback. Existing server registration recovery handles an interrupted attempt with the same credential.
- [x] On success, verify the returned principal matches the configured principal and account/brain are nonempty, then enter the shell using that client. Explicit account switching stays on the normal login screen until the user signs in; local entry runs only at process startup.
- [x] Run `flutter analyze` and `flutter test` from the shell, plus affected core tests. Hot restart the actual desktop shell after the changes.

### Task 4: Prove identity and authorship in the running app

**Files:**
- Create: `docs/superpowers/reviews/2026-10-12-vlad-local-identity.md`
- Store raw evidence in the dedicated `artifacts/vlad-local-identity/` directory; never overwrite the Assistant benchmark.

**Interfaces:** Existing identity session and membership endpoints, real neuron channel, `digitalbrain-mcp`, `IApp` authoring/publish and marketplace read. Use LSP and live contract discovery for exact call shapes; do not invent a new social API for this test.

- [x] Snapshot the original account, conversation, draft, focus and open-window set before restarting. Keep owner data intact; do not copy it into Vlad's brain implicitly.
- [x] Verify Aspire health, start the local shell and read `/identity/session`. Record `principalId=vlad`, generated account ID and personal brain ID; repeat after restart and require the same IDs.
- [x] Using the authenticated session, drive a real workspace read and live subscription. Verify traces attribute both HTTP and gRPC to Vlad, and private access to an unrelated brain is refused. An anonymous MCP connection is not evidence of Vlad's identity; use its authenticated session path or explicitly scoped authenticated calls.
- [x] Build a small private app, compile/run it, publish through the existing gate and read the marketplace listing. Require publisher `vlad`; record compile success separately from successful execution and publication. Keep the verification app clearly named and obtain no external credentials for it.
- [x] Verify explicit account switching and startup failure behavior in widget tests, and absence of local credential configuration in web/publish composition tests. Retain failures in evidence. Live button switching was not exercised because Flutter Driver is disabled.
- [x] Restore the original conversation, draft, focus and window set in their original account. Document Vlad's new account and verification app separately, and how the next local desktop launch enters Vlad. Do not delete either account or reset storage.
- [x] Record test commands/results, trace references and limitations. Claim this identity milestone complete only after the authenticated live checks pass.

## Subsequent independently planned deliveries

1. **Publish/profile/feed:** one publication references an exact compile-checked app version; Vlad's profile and Circle feed render a selected safe preview. Use existing theme and Files-style breadcrumbs. Drafts stay private. Version-specific export and retention need an explicit design because the current installer reads `ExportPublished()` and a marketplace listing, rather than accepting a selected historical version.
2. **Personal fork and circle destination:** public forks need sign-in, not friendship. Reuse `FeatureLoader` and origin tracking; resolve name collisions and bind recipient connections explicitly. Existing `ICircle.Share` shares the caller's app, so direct publication-to-circle installation needs a defined member-authorized path preserving original attribution and the bringing member. Do not silently substitute a latest version or import private credentials.
3. **Try live and friends:** retain read-only defaults; specify permitted interactions, resource owner, execution isolation and public-safe output before enabling Try live. Friendship and friends-only publication authorization are separate from public forks and circle membership.
4. **Live brain:** repair the observed event/filter mismatch with real runtime evidence; separately prove real 3D rendering and picking on this Windows Flutter target. Then connect selection to the same workspace app views. No fake activity or claim that the current projected sphere is the requested 3D implementation.

These are the remaining scope of the approved product flows, not completed features or permission to deploy `digitalbrain.tech/vlad`.

## Self-review

Coverage is deliberately limited to local identity and its transport prerequisite. Each of the five failure classes has an owning test task. Server account creation, generated IDs, password validation and membership enforcement remain existing mechanisms. The social journey and rendering requirements are explicitly retained above and require their own concrete plans; this document does not claim to implement them. Execution is recorded in the verification report. The authenticated OS fallback passed; separate MCP machine membership remains blocked, and the first cold provisioning attempt required a restart. Those limitations remain unresolved rather than being hidden by the completed implementation checklist.
