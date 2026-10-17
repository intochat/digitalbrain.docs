# Creation-to-installation verification, 16 October 2026

Runtime source: `d95e58d8578da360742e18a55fcd52c06f23edaa` plus pre-existing uncommitted work, including OS boot/workspace changes. This pass preserves that work and changes no runtime implementation. It supplies a source-grounded [implementation prompt](../plans/app-creation-installation-fix-prompt.md).

## Verdict

The complete generated-app-to-recipient-installation journey is **not accepted**. Existing component and shipped-app checks do not establish this outcome. No live model generation or fresh two-user browser publication/install/restart journey was executed in this pass. These are incomplete acceptance coverage, not missing production deployment authorization.

## Current source findings

| Requirement | Evidence | Remaining work |
| --- | --- | --- |
| APP-01/02 specification and supported capabilities | Creator.Author produces a spec and searches available contracts; no fresh live-model quality assessment | Verify supported scenarios and truthful unsupported-capability feedback |
| APP-03 presentation | AgentPrompts.cs lines 24–39, 90–112 and 138 still prescribe entry; Creator parses Entry but does not use it; Ino system.md lines 7–12 reads manifest.entry. Current IApp.Present and Workspace.cs use revision-bound named views | Reconcile generator, navigation and tests with actual presentation contract |
| APP-04 persistence | AppReactivationFacts covers reassignment using a test runtime | Observe generated result retention and no repeated effects across actual process restart |
| APP-05 success reporting | Creator.cs line 125 reports completed on Live without presentation or behavior acceptance | Separate deployed, visible and accepted outcomes |
| APP-06 repair | AppNeuron.CompleteBuild merges returned files into next.Files (line 296), retaining omitted old programs | Define complete-build/incremental semantics; test obsolete behavior retirement and failed repair preservation |
| APP-07 interruption | AppWorkQueue launches untracked process-local work; BeginBuild persists attempt and permits a new attempt after freshness expiry (default 900 seconds) | Bound interruption/retry recovery and prove process-crash behavior; preserve existing stale-attempt fencing |
| APP-08 verification | AppNeuron.cs lines 821–825 and FeatureCatalog.cs lines 150–153 accept missing sandbox or InvalidOperationException | Fail closed before publication/export/listing changes |
| APP-09 visual quality | Shipped-app browser assertions and selected Flutter widget tests exist | Observe generated text, multiple results and selection/control scenarios |
| SOC-07 exact installation | AppInstaller.InstallPublication checks source, version and digest; ExactAppInstallFacts tests per-recipient settings, empty connections, retry and collision semantics using a fake runtime | Execute exact published release in another user's real browser/runtime, including restart and negative authorization cases |

The implementation prompt includes dependency order, expected regression coverage and a deterministic full integration journey. Deterministic model fixtures must be distinguished from live-model quality evidence. Existing tests that assert obsolete prompt phrases must be corrected along with the prompts rather than treated as the intended product contract.

## Verification commands and results

Commands run from `E:\intochat\digitalbrain` unless specified:

```powershell
dotnet test src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj --nologo --verbosity quiet
dotnet test src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj --no-build --nologo --verbosity quiet
dotnet test src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests/DigitalBrain.Modules.Circles.Tests.csproj --nologo --verbosity quiet
dotnet test src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj --nologo --verbosity quiet --filter FullyQualifiedName~ShippedAppFacts
```

From `src/DigitalBrain.Modules/Google/Flutter/app/shell`:

```powershell
flutter test test/workspace_publication_navigation_test.dart test/workspace_root_test.dart test/workspace_link_test.dart
```

- Apps initial run: 263 passed, 1 failed, 0 skipped, 264 total. Output was truncated and the failing test identity was not retained; do not attribute the failure to a guessed cause.
- Apps repeat without rebuilding: 264 passed, 0 failed, 0 skipped (50.4 seconds). Initial non-reproducible failure remains a stability risk. The retained repeat log includes expected negative-path error telemetry; aggregate test success does not imply error-free production behavior.
- Circles: 33 passed, 0 failed, 0 skipped (17.3 seconds).
- Selected Flutter tests: 11 passed; exit 0. No Flutter source/lockfile changes appeared in Git status.
- Shipped-app browser result: **failed**. Eighteen of twenty app scenarios completed; FilmCraft and PhotoCraft failed their connected-state assertions with 422 / MCP connection refused at localhost:18101 and localhost:18100. Collection teardown then failed at application disposal and was reported against all twenty cases: runner aggregate 40 results, 18 succeeded, 22 failed, 0 skipped, duration 5m27.7s. The 22 failures are two scenario failures plus twenty cleanup reports, not twenty-two distinct product defects.
- The dotnet test commands built their selected projects successfully. A full solution build was neither required nor run; repository instructions prefer individual projects on Windows.

The browser fixture starts disposable Aspire storage, compiler sandbox, backend and compiled Flutter shell with a fake model endpoint. Startup reached client readiness in 188.2 seconds. Reverse-proxy health probes returned 200. Container stderr is forwarded under `fail:` even for ordinary startup notices, so those prefixes alone are not proof of application errors. Browser console emitted WebGL ReadPixels performance warnings.

Local retained logs are under `C:\Users\vhorb\Documents\Codex\2026-10-16\finish-the-intochat-cloud-migration-implementation\outputs`: `app-journey-tests.log`, `app-journey-circles-tests.log`, `app-journey-flutter-tests.log`. Browser output is retained separately from the first browser-console event onward, not as a complete startup log.

## Scope and unresolved risks

No live model/provider call, infrastructure deployment, shared database migration or production data deletion was performed. No code fixes or commits were made in this verification pass. The current code defects above are actionable engineering; an approved model endpoint is only needed for separate live-model quality acceptance. This test stack is not a persistent product deployment.

ArtCraft startup/readiness investigation: ArtCraftModuleOptions.WithHostedApps assigns the fixed local MCP ports, and ArtCraftModuleHosting declares Docker resources and health checks without an explicit runtime wait dependency. The shared harness waits for host/shell readiness. During failing assertions no new MCP containers were running. FilmCraft MCP finally started during teardown (container log 00:26:55 UTC), after its browser failure. This supports a cold-start readiness race; PhotoCraft's exact build/startup failure and application-disposal root cause still require investigation. Two surviving run-owned FilmCraft containers were identified for explicit stop after failed teardown; existing older containers and data were not removed. Fix required dependency readiness and bounded cleanup, not merely assertion timeouts. Screenshots: app-journey-filmcraft.png and app-journey-photocraft.png in the local outputs directory.
