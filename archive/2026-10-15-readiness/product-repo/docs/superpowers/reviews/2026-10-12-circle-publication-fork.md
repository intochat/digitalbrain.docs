# Circle publication and fork verification

Date: 2026-10-12. Evidence directory: `artifacts/circle-publication-fork/run-20261012/`.

## Implementation

Published posts identify an immutable retained bundle by publisher, source brain, app name, version and SHA-256 content digest. Retention is separate from the bounded draft history. Exact exports expose published content only. Creating a copy uses `FeatureLoader.Create` and atomic `IApp.Import`; occupied names cannot turn into replacement. Receipts bind retries to the original account, destination, publication and name. Recipient settings use published defaults and connections start empty.

Circle provides feed/profile/release previews and personal or circle destinations using existing typed UI controls. Preview content is plain text. Navigation uses the shell's generic membership-checked workspace activation. Installation completion offers configuration and explicit opening; it does not focus or open the installed app automatically.

The live test exposed an important distinction: a background app reaction runs as the app, not the person who clicked. Publication buttons now use the existing `IUiBinding`/`IUiEventHandler` path on CircleFactory/Circle, preserving the authenticated caller. Deterministic `BindPublicationButton` methods attach the compiled grain reference; passing a grain reference from a sandbox script was rejected by the JSON boundary. The feature scripts continue to own preview/navigation composition. Removed the asynchronous fork/bring install scripts and operations.

Pending button commands retain their original operation across failed deployment and reactivation. A subsequent click can resume the same account's unchanged selection. It cannot replace an unrelated occupied name.

Two other existing wiring gaps surfaced during acceptance: gRPC selected-brain stamps were lost across an async helper; invitation acceptance was inaccessible behind the membership gate it needed to satisfy. The gRPC caller is now stamped at its call/watch boundary. A narrow authenticated invitation endpoint invokes the existing invitation check. General brain membership and contract authorization remain enforced. Layout validation now admits the form primitive already supported by the renderer.

## Automated evidence

| Check | Result |
|---|---|
| Apps module | 252 passed (`apps-green2.log`) |
| Circles module, including member button and deployment retry | 30 passed (`circle-green7.log`) |
| Flutter module | 147 passed (`flutter-final.log`) |
| Flutter UI | 174 passed (`ui-final-tests.log`) |
| Flutter shell | 217 passed (`shell-final-tests.log`) |
| Flutter UI and shell analysis | Clean (`ui-final-analyze2.log`, `shell-final-analyze.log`) |
| Changed C#/Dart LSP diagnostics | 45 files, clean (`diagnostics-final.log`) |
| OS build | Zero warnings/errors (`os-build8.log`) |
| Real gRPC selected-brain call/watch regression | Passed after reproducing PermissionDenied |

The button retry regression first exposed a test fixture without executable sources; that attempt is retained. With a real synapse shape, the old implementation failed with an occupied-name conflict on the second click (`retry-button-red2.log`), then both button facts passed (`retry-button-green.log`). The membership test asserts the non-owner account, original publisher, exact digest, empty recipient connections and refusal after removal.

The full Platform suite was **not green**: 470 passed, two failed and one skipped. The journal conflict case passed in isolation. The registration-resume case still fails in fixture provisioning before its intended injected-failure scenario. These existing failures and reruns are retained in the Platform logs; no claim is made that the entire repository passes. An initial Apps suite collection-enumeration failure passed in isolation and on the full rerun.

## Live evidence

Circle 2.0.5 and CircleRoom 1.1.5 were deployed through the normal feature update endpoint. Authenticated native button calls installed `my-bound-echo` into Vlad's brain and `member-bound-echo` into the test circle. Both copies retained A's exact files, version and digest and executed `A: bound copy`. The circle receipt correctly identifies the non-owner member who clicked, while origin retains Vlad as publisher (`binding-final-install.log`, `binding-final-execute.log`, `binding-copy-*.json`).

Collision and invalid-digest requests were refused without altering the existing copy. A second account could not fork into Vlad's private brain (`binding-final-negative.log`). A connection-dependent publication forked as `my-setup-copy` with empty recipient connections and an explicit `Needs setup: mail` result (`setup-live.log`, `setup-copy.json`). Refresh preserved the target-name draft, selection, focused window and open-window set without another install (`refresh-live2.log`, `refresh-before.json`, `refresh-after.json`).

Native Flutter inspection exposed numeric FormFieldKind values where the Dart decoder expected names. The regression reproduced a TypeError; the decoder now accepts the defined numeric enum values and rejects unknown numbers, including verification that Secret remains masked. After hot reload the actual App name field and preview rendered, with no runtime errors (`form-wire-red.log`, `flutter-form-fixed.json`). This late wire-format fix and deterministic binding methods were verified after the final review.

Restart verification retained a real failure: OS B could not start while the trust storage directory was stuck issuing a lease; the persistence call timed out (`persist-live.log`). Restarting the trust process recovered both OS processes. The personal copy then survived reactivation and the original operation receipt retried successfully (`persist-recovered.log`, `binding-retry-my-bound-echo.json`). A test-member removal timed out before eventually completing; the circle snapshot and trust membership were temporarily inconsistent. The interrupted circle persistence check is not a pass. Removal timing failures remain in `member-refusal*.log`.

After removal completed, the owner invited the test member again and the member accepted through the authenticated endpoint. Membership and actual app access were restored (`member-restoration.log`, `member-restored.json`, `member-access-restored.json`). The final persistence run passed for both destinations: exact files, origin and receipt survived restart; retrying the original operation preserved the copy and the circle index contained one entry (`persist-restored-member.log`, `binding-retry-*.json`). The live removed-member scenario remains limited by the timeout; deterministic module tests cover its rejection.

Original Vlad shell state, original open-window sets and focus, and the original owner conversation/composer draft were restored and compared with their starting snapshots (`restoration-check.json`, `restore-final.log`). Native runtime error inspection after restoration was clean. All active services reported Healthy in `final-health.json`; cloud provisioning and on-demand rebuild resources were not started. Restoration concerns workspace state; test publications and copies remain deliberately retained.

Aspire telemetry is retained in `telemetry-final-*.json`. It includes successful exact Import retry trace `2634147dc6840ab579bc78159ba6e487` (109 ms), and failed import trace `7eb6069baa83ae118dfc1a8c94c1fc5f` (158349 ms). These are diagnostic spans, not a performance benchmark. Some earlier traces were omitted by dashboard size limits; state/execution evidence above is retained independently.

Vlad published `circle-release-check` release A at `0.2.0`, digest `be3ea11c5080adb7c8a32900566b32aa525fe42f3292239c7fb62c352156ce1d`. After 25 draft writes and publication of B (`0.2.26`), exact A export still returned A's files and preview. Both original releases executed their distinct echo behavior. Evidence includes `releases-A.json`, `after-25-drafts.json`, `releases-B.json`, `retained-A.json`, `echo-retry.json` and `execute-B-retry.json`.

Earlier typed-control attempts installed `my-living-echo` and `our-living-echo` from A. The personal copy executed A. The circle copy was wrongly attributed to Vlad despite a member click; this was a failed acceptance case, not a pass. Initial blank reads were premature and are superseded by `pre-fix-*-living-echo.json`. The UI binding fix addresses that defect. Earlier binding attempts and their failures are retained in `pre-final/` and the uniquely named logs.

Cold starts also produced activation cancellations and first-request timeouts. Health checks becoming green did not prove the runtime was ready for every account. No timeout was increased, no storage was reset, and failed attempts remain evidence. Build attempts against running locked assemblies are likewise retained; the successful OS build ran with both OS resources stopped.

## Review and rulings

One fresh read-only review found no Critical issue, one Important UI retry issue and one Minor navigation issue. The Important issue received the reproducing regression and fix described above. The Minor issue is deferred: a selected publication has author/global navigation but no explicit Back breadcrumb to its originating profile. The reviewer did not independently run the app, suites or restoration; those require the live evidence here. Unrelated Assistant and local identity changes were excluded from review.

Rulings made during implementation:

1. Keep the approved mixed checkout and leave work uncommitted. Cost: review must distinguish this change from existing identity/Assistant edits; `before.patch` preserves the starting tracked changes.
2. Feature scripts are outside the LSP project. Map their compiled contracts, then use the actual feature compilation/deployment gate. Cost: script-only mistakes are caught later in the live loop.
3. Repair selected-brain gRPC stamping and invitation acceptance without weakening membership rules. Cost: additional Platform and Circles edge coverage, rather than treating inaccessible destinations as a successful UI flow.
4. Admit existing form controls to layouts. Cost: a broader composition case, covered by the form reactivation regression.
5. Bind publication buttons to their existing owning neurons under the authenticated human caller. Cost: Circles contracts reference Flutter contracts and expose two deterministic binding methods; no new execution runtime or client-supplied identity is introduced.

## Limits and retained local data

Try live, friendship management, permanent archival after source deletion, public hosting at `digitalbrain.tech/vlad`, and the 3D visualization are outside this approved slice. Previously discarded publications cannot be reconstructed; the previously retained latest publication is preserved when moving forward.

Authenticated separate-MCP access encountered the existing machine/account boundary (`mcp-context-error.txt`). Acceptance uses authenticated OS HTTP/native gRPC and live Flutter inspection as permitted by the design; this does not claim the separate MCP boundary is fixed.

Test identities `circle-check-member-20261012` and the earlier incomplete `circle-check-20261012` registration are retained. The test circle is `circle-be286aca2af7455aad9021f037ad8211`. Test applications and copies are retained as inspectable evidence, including the earlier wrongly attributed copy. Generated credentials remain in the private local account directory, not in the report.

Retained apps include `circle-release-check`, `my-living-echo`, `our-living-echo`, `my-bound-echo`, `member-bound-echo`, `circle-setup-check` and `my-setup-copy`. Controls were driven through their authenticated neuron methods and checked with native Flutter inspection and widget tests; this is not a human pointer-driven usability test.
