# Verification log · 17 October 2026

The audit executed selected local builds and tests without production migrations, cloud deployment, live provider calls or paid workloads. **Success below belongs to the tested project and fixtures, not the entire product.** Application source was not changed; DigitalBrain Git status remained clean after verification.

## Environment and provenance

- Repository: `digitalbrain`, branch `master`, SHA `faddacfc3b5e7cf3a74adfd0efcf8a17e277540b`; initially and finally clean.
- Host: Windows, PowerShell; .NET SDK `11.0.100-rc.2.26504.105`. Repository `global.json` requests RC1 with compatible roll-forward enabled.
- Flutter `3.47.6`, Dart `3.13.5`; CI pins Flutter `3.47.2`, so this is not an exact CI-environment reproduction.
- Build flag `CodeGraphRefresh=false` disables the repository's build-time source-index refresh; it does not suppress compilation or package auditing.
- Generated `bin`, `obj`, Flutter dependency/build caches are local test artifacts, not application edits or documentation deliverables.

## Executed checks

Commands below run from the DigitalBrain repository root unless a working directory is specified.

| Command | Result | Establishes | Does not establish |
|---|---|---|---|
| `dotnet --version` | SDK RC2 listed above | Available toolchain | Exact release/CI parity |
| `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -p:CodeGraphRefresh=false --verbosity quiet` | Exit 0; 0 warnings, 0 errors; 14.26 seconds | OS project and its compiled references build | Full solution, deployment or live services |
| `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/DigitalBrain.Platform.Tests.Unit.csproj -p:CodeGraphRefresh=false --verbosity minimal` | Exit 0; **248 passed, 0 failed, 0 skipped**; 27.688 seconds runner duration | Platform suite including identity, ledger, connection and storage fixtures | Real provider OAuth, production isolation or backup drill |
| `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DigitalBrain.Modules.Apps.Tests.csproj -p:CodeGraphRefresh=false --verbosity quiet` | Exit 0; **264 passed, 0 failed, 0 skipped**; 35.936 seconds runner duration | Application lifecycle and generation/publication contracts in test fixtures | Live model quality or browser-to-recipient full journey |
| `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj -p:CodeGraphRefresh=false --verbosity quiet` | Exit 1 before tests; `NU1902` MessagePack `2.5.302`, advisory `GHSA-qhrr-8q5h-9q3h` across hosting dependencies | Reproducible restore/security gate | No OS unit test verdict can be inferred |
| `flutter pub get --enforce-lockfile` in `src/DigitalBrain.Modules/Google/Flutter/app` | Exit 0; lockfile preserved | Locked dependencies resolve in local Flutter workspace | No dependency/security audit or compatibility guarantee for newer releases |
| `flutter test --no-pub test/workspace_publication_navigation_test.dart test/workspace_root_test.dart test/workspace_link_test.dart` in `app/shell` | Exit 0; **11 passed** | Selected navigation, root and link tests | Full Flutter suite or a running browser/production backend |

The first selected Flutter attempt with `--no-pub` failed because the local workspace lacked resolved test dependencies. Resolving the existing lockfile corrected this environment prerequisite; the same selected tests then passed. No source or dependency-version change was needed.

The .NET suites emitted Orleans ServerGC/watchdog warnings and expected negative-path failure telemetry. The Apps suite deliberately tests missing integrations and runtime timeouts. Aggregate success does not prove that every warning is harmless in production. Those logs should not be repackaged as live application failures either. No full raw log containing possible deployment-specific details is published here.

## Blocking package result

The OS suite reaches Aspire hosting/test dependencies not required by the OS-only build. Therefore a successful OS build and a blocked OS test restore are consistent results. The NuGet result reports MessagePack `2.5.302` with a moderate-severity advisory and warnings treated as errors. This audit records the tool's finding; it did not independently reassess exploitability or silence the warning. Resolve it in a separate application change, then rerun the affected command.

## Companion cloud checks

The coordinated cloud audit at `intochat-cloud` SHA `d9dc9798ca5bfc2b93e2b2b12cd3f3033047d2c6` plus preserved pre-existing changes reported **120 passed, 66 skipped, 0 failed of 186 .NET tests**, with provisioning database configuration cleared for safety. Frontend tests reported **447 passed across 62 files**. These totals must not be combined into a percentage or described as all provisioning behavior passing. Exact environment and commands are in [the evidence inventory](../reference/evidence).

## Historical evidence remains separate

The [16 October application journey record](../assessment/app-journey-verification-2026-10-16) uses `d95e58d8578da360742e18a55fcd52c06f23edaa` plus then-uncommitted changes. It reports an initial Apps failure followed by a passing repeat, selected Flutter success, and a browser run with PhotoCraft/FilmCraft connection failures plus teardown reports. Its aggregate browser failure count includes cleanup failures; it is not a count of distinct product defects.

The present 264-test pass does not prove those browser failures fixed. No current paid/live-provider journey, deployed cold start, sandbox escape test, sustained concurrency test or restore drill was run. Treat these as outstanding release acceptance items, not unavailable documentation work.

## Next reproducible checks

After the dependency gate is fixed, run the intended release configuration and complete OS tests, then an isolated Aspire/browser environment with stub models and explicit external-service readiness. Separately approve a bounded live-provider acceptance run with a cost cap enforced outside the current runtime meter. Record cloud/runtime image digests, two-account workspace admission, cancellation/restart results, and backup/restore outputs before elevating readiness labels.

Related: [matrix](./matrix), [operations](./operations), [backlog](./backlog).
