# Scripted app E2E implementation plan

**Goal:** Run the folder-authored applications one at a time in a headless browser, preserving existing coverage and measuring the complete root test command locally. Target under eight minutes, preferably five, on one runner.

**Architecture:** Keep MTP/xUnit and the existing Aspire target. A class fixture owns one browser session and uses the collection's running reference host. Each independently reported app case imports the actual folder bundle, checks its running presentation, exercises its browser surface, and removes its subject afterward. Workspace and explicitly required support apps remain installed. Lifecycle/configuration tests keep private fixtures where their semantics require them.

**Authorization:** User explicitly requested local implementation and measurement after the framework reviews. Work in the existing local feature branch, preserving the pre-existing OsApps.cs and OsWorkspaceRoot.cs edits. No publishing or commits requested.

## Tasks

- [x] Capture baseline root dotnet test behavior and build/test wall time. Record failures, skipped tests and environment constraints; never report an early failed run as a successful performance result.
- [x] Replace the unreported 80-minute shipped-app loop with per-app xUnit cases and a shared headless browser fixture. Preserve import/version/live/presentation assertions; accept valid view-only presentations. Fail for an app with no explicit browser case.
- [ ] Exercise deterministic actions and rendered results, retain existing deeper API/identity/telemetry tests, and explicitly document remaining external-provider journey gaps. Bound import/render/cleanup independently and log stage times. Remove target scripts in finally.
- [ ] Simplify expensive fixture ownership where evidence supports it, retain immutable configuration isolation, and avoid incidental external application builds in unrelated tests without removing hosted integration coverage.
- [ ] Build and run targeted E2E locally, fix observed causes, then time full root dotnet test with preparation and execution reported separately. Review the final diff for coverage loss and lifecycle leaks.

## Verification and progress

- Baseline `dotnet test` from root failed in 35.66 seconds during Debug build: the existing AppHost process owns the output executable. Do not stop the user's application; benchmark Release separately.
- Baseline command: `dotnet test -c Release -p:CodeGraphRefresh=false --max-parallel-test-modules 2 --timeout 8m`. CodeGraph refresh is unrelated developer indexing. This is a qualified benchmark, not an unmodified root command result.
- Preserved the pre-existing PhotoCraft/FilmCraft production changes. Updated the two explicit default-manifest assertions from 13 to 15 apps to match that existing configuration; retained exact list and idempotency checks.

## Review focus

- A failed import must not leave its scripts running during the next app case.
- A view-only app must render without an invented sphere/icon requirement.
- The workspace must not be mounted recursively as its own child.
- App support dependencies must be explicit and disposed after the case.
- A browser smoke check is not full business-path coverage; preserve deeper assertions and report gaps honestly.

### Measurements and findings

- Baseline Release root run: 511.40 seconds wall time, test timeout at 480.61 seconds; 1,237 passed, 12 failed, 4 skipped (aborted, not a performance success). OS E2E 251.45 seconds, Framework E2E 391.60 seconds.
- First folder fixture initialization failed because direct IWorkspace.Apply is reserved for the workspace app. Fixed cleanup to issue navigation requests and await their results.
- First complete 21-folder browser run: 188.25 seconds, 18 passed / 3 failed. Warm reference boot about 38 seconds; successful app cases mostly 1–6 seconds, cleanup 0.04–0.28 seconds. The failures were CircleRoom membership setup, Circle's accessible label, and Calculator semantics after clearing.
- Follow-up confirmed CircleRoom passes through a real circle and member session (7.06 seconds) and Circle profile navigation passes (4.47 seconds).
- Calculator backend state and screenshot both show Error, but the browser accessibility DOM omits it after the previous text becomes empty. A Markdown widget identity change is under E2E verification. The native Flutter semantics regression test passes before and after, so it alone does not establish this web fix.
- OS and Framework E2E host variants now use serial xUnit collection fixtures. A filtered run no longer starts unrelated assembly fixtures.
- Existing BrainFact reset a removed /shell/state endpoint, causing six failures before assertions. Its lifetime now owns a registered account and authenticated browser; the persistence test exercises the current durable workspace rather than removed projects.
- A Person's Dispose closes HTTP only. The new app cleanup explicitly retires owned runtime programs and waits for no session before releasing the lease.
- The reference ArtCraft services still have persistent fixed-port hosting. Local runs see the existing development services; those integrations are not isolated by this fixture change. Do not claim clean-run reproducibility until this is addressed.
- The framework idle-span baseline reported 26,668 spans/minute against a budget under 20. Account workloads surviving leases contaminate whole-host observations; do not relax the budget to make it pass.

### Coverage limits

All 21 shipped folders have individually reported import/live/version/presentation/browser cases. This is not exhaustive coverage of every scenario documented in app.cs. In particular, provider-backed lending, research, semantic memory, generated code, candidate deployment, and full editor workflows need deterministic service responses and deeper assertions. Existing module, identity, telemetry, runtime, and opt-in candidate tests remain. No time target should be declared met by filtering these out or accepting provider errors as healthy editor integration.

### Historical CI comparison

- Oct 4, run 37208764129: non-E2E 3m33; E2E shards 2m43–6m17 on separate runners.
- Oct 6, run 37439693793: non-E2E 5m09; kernel4m11, OS5m09, IntoChat4m57, hosting2m33 on separate runners.
- Commit eb802f2f66c3f53c041dc62d930cefb67fc45b49 removed the E2E matrix on Oct8. Those older green shard times are not evidence of a complete five-minute single-runner suite.
- Oct8 run37821666460: combined tests8m47.892, 5fail/1208pass/3skip; Framework8m23, OS6m55.
- Oct11 run38102742088: combined11m27.395, 5fail; Framework10m32, OS8m09, hosting4m35. Five overlapping boots54–89seconds and 100second HTTP waits.
- Referenced run38618568867/job116039867412 was cancelled, not green. Its job logs were unavailable through GitHub CLI/API during this investigation. Setup before tests included roughly12m27, distinct from dotnet test duration.

### Latest verification

- Full21-folder suite passed21/21 with no skips in199.731seconds. This included107.6seconds host startup after changing Flutter sources (cold content-tagged shell image); the Calculator browser assertion now passes with the Markdown identity fix. Subsequent tightening of editor and cleanup assertions is being checked by the root run.
- Full Release solution build passed with zero warnings and zero errors in5.08seconds wall time.
- Root measurement after build: dotnet test -c Release --no-build --max-parallel-test-modules 2 --timeout 8m. Two modules run on this one machine; no CI sharding or test exclusions.
- Additional root architecture failures are in unchanged source files and physical project directories absent from the solution. They are not repaired by disabling the architecture checks.

### Final local iteration

- Two-module root run reached the eight-minute global test timeout: 1,606 passed, 17 failed, 4 skipped; 480.813 seconds. OS E2E took 4m46.273 with two stale routing expectations failing. Those expectations and fixture model responses were repaired, retaining their behavioral assertions.
- Four-module root run uses the same single machine, with no filters: `dotnet test -c Release --no-build --max-parallel-test-modules 4 --timeout 8m`. Its preceding Release build passed in 3.868 seconds with zero warnings/errors. This command separates build timing because the user's running Debug AppHost locks Debug build outputs.
- In that run the complete OS E2E assembly passed: 27 passed, zero failed, one existing skip, 4m30.274. This includes all 21 folder apps plus routing, runtime, startup, and fresh-browser persistence checks. The persistence check mutates the workspace through the browser before opening a fresh context.
- The isolated telemetry fixture still exported 6,780 spans in its idle minute (budget remains below 20): 3,046 authorization server spans, 341 runtime identity calls per side, 255 app reads per side, and 120 readiness HTTP spans. Separating fixture ownership reduces contamination but does not eliminate application background work. Do not attribute all remaining cost to the test runner.
- PackedComposition fails because the generated consumer cannot resolve Aspire orchestration CliPath and DashboardPath. The timer idle-collection check also remains failing. Neither assertion has been removed or relaxed.
- Fresh review confirms browser-close failure no longer bypasses app retirement, and circle ownership is recorded before browser navigation. Remaining hardening: independent cleanup deadlines per scope would prevent a failed circle retirement from consuming the personal-scope cleanup budget.
- Final root result: 352.426 seconds wall time (MTP reports 5m50.600), 1,946 passed, 12 failed, 4 skipped, and one additional infrastructure error; exit code 1. Including the separately measured build gives approximately 5m56.3. No global timeout occurred. The 12 failures comprise nine architecture checks, timer collection, idle telemetry budget, and packed composition. Circles reports 14 passing tests but an assembly error. Framework E2E reports ten passed/one failed in 5m05.970; OS E2E remains green. Logs: `%TEMP%/digitalbrain-root-final.log` and `%TEMP%/digitalbrain-root-final-build.log`.
- This establishes a sub-eight-minute failing local execution, not a green full-suite performance guarantee. Failed paths can end early; rerun after repairing these failures, including persistent external-service isolation, before claiming the target achieved. Under-five-minute root execution and exhaustive provider-backed application coverage remain unverified.
- The additional Circles assembly error is accompanied by `Fatal error. Internal CLR error. (0x80131506)` in the root log, despite all 14 reported test cases passing. Its cause has not been established; it is not a failed application assertion.

### Authorized architectural repair pass

The user requests repairs to underlying architecture, retaining test intent and the one-runner root target. Execute locally without commits or publication; preserve pre-existing OsApps/OsWorkspaceRoot edits.

1. Runtime subscription ownership: reconcile only the newly subscribed source; preserve authorization, retries, full lifecycle reconciliation and lease renewals. New regression reproduced eight watches of the first source with eight subscriptions; fix passes ten focused tests and all 199 runtime tests.
2. Clock ownership: keyed TimeModule domain clock, leaving Orleans lifecycle clock untouched. All 16 Time tests pass with existing assertions/timeouts.
3. Contract ownership: move UiChildRef into Flutter.Contracts with namespace/alias/IDs unchanged; retain RouterDecided implicit positional serialization. Genuine old binary payloads disproved adding explicit IDs despite matching numbers (different serialization layers); corrected the architecture rule instead. Both old RouterDecided and UiChildRef payloads decode and round-trip.
4. Module integration: migrate tracked Roslyn projects from removed Core/Contracts APIs into current Module/options/activation handlers and solution. Preserve all existing tests; isolate SDK-loaded MSBuild assemblies correctly.
5. Configuration ownership: typed module-owned desktop setting; use existing typed configuration keys and harness identity/configuration boundaries. Keep security checks and behavioral assertions.
6. Packaged consumer: official AppHost SDK owns native discovery. Diagnose subsequent local storage ownership/custody failure instead of extending startup timeout.
7. Verify focused changes, review, then full root build/test with four modules on one runner. Report remaining failures honestly.

Ruling: implementation is authorized by the user's repeated acceptance and explicit request to apply architectural fixes. No additional approval checkpoint for these reversible local repairs. Actual contract-policy conflicts must be explained, not silently removed.


### Architectural verification in progress

- Watch registration regression demonstrated quadratic work (eight watches of the first source when adding eight distinct sources). Delta registration passes all 199 CSharp runtime tests; idle-window spans decreased from 6,780 to 3,953 without relaxing the budget.
- Domain clock isolation passes all 16 Time tests. Configure a keyed TimeProvider for TimeModule when controlling domain time; the unkeyed Orleans lifecycle clock must continue to advance.
- Packaged composition now passes all scenarios and cleanup in 70.392 seconds. Aspire owns CLI bundle discovery; per-run storage, explicit custody, memory providers and child build-server lifetimes are represented explicitly.
- Configuration/identity/path repairs pass 67 focused behavioral tests. SelectOption's two JSON expectations now include its existing Visual:null property; every historical binary payload is unchanged.
- Architecture suite: 59/60 passed; remaining layout check exposed three existing RootNamespace metadata mismatches, corrected without changing explicit source namespaces. Focused layout check passes afterward.
- Real Roslyn SDK load test passes alongside six retained tests (7 total, 5.9 seconds). It loads a temporary solution, discovers source, resolves framework references and compiles without errors.
- Review found Roslyn's singleton SolutionWorkspace is not isolated by brain. Removed the newly added default OsCatalog activation; migration restores build/test coverage, not approval to expose that module globally. Explicitly enabled Roslyn hosts still need workspace/path authority design.
- Release root build passes with zero warnings/errors (5.31 seconds). Do not rebuild shared Release outputs while an Aspire measurement host is running: one attempted overlapping build hit an executable lock and was discarded, then rerun after its owned host stopped.
- Residual telemetry investigation: SpaceWatcher queues a whole-space rebuild for each app/presentation change; each rebuild reads all apps. Measuring startup backlog separately before selecting a coalescing repair. No idle or intent budget has been raised.
- Telemetry diagnostic resolved the two bursts: 8,472 spans had 8,472 distinct identities (no export replay). One burst belongs to the registered account, the other to the synthetic Open-posture owner. A subsequent minute had 61 spans, including 50 membership polls. The collector now sends the required protobuf response Content-Type, but this was not the burst's cause.
- Space rebuilds now coalesce invalidations during a scan into a trailing scan. A pending invalidation survives a failed scan; one worker owns scene writes. Both controlled scheduling regressions and all 52 Space tests pass (10.838 seconds). The focused burst fixture removes only the automatic watcher to control exact invalidations; existing lifecycle tests still exercise it.
- Deployment membership now follows Orleans' native current snapshot/update stream rather than per-brain five-second RPC polling. Subscription cancellation, stale-activation rejection, failure/recovery and long-roll interleaving are retained. Orleans 9/9 and Aspire 73/73 pass. Two rollback observations explicitly wait for Rolling before terminal Steady, preserving all original assertions.
- Roslyn SolutionMap's array fields decode genuine pre-migration payloads with list-backed and array-backed interface fields; nine Roslyn tests now pass. No legacy policy exception needed for this conversion.
- Remaining startup issue found: pre-HTTP owner assignments wait for the one-minute runtime reminder because no listening address exists yet. Repairing the host-start trigger and explicit outer-stream initialization acknowledgment before the final root benchmark; do not replace these with longer sleeps or a relaxed idle budget.
- Deferred pre-HTTP assignments now retry through runtime grain references when ApplicationStarted fires; the durable reminder remains recovery. All 33 BrainRuntimeNeuron tests pass, including immediate-start and non-HTTP fallback cases.
- Initialization readiness is explicit: a persistent script's single outer On/React acknowledges after its initial reconciliation and buffered signals. Assignment generations reject stale/ABA acknowledgments and old exit reports; transient delivery retries without restarting projection. This is not a guarantee for arbitrary parallel initializers or downstream projections. CSharp 201/201 and Client 33/33 passed focused validation.
- First full architecture-pass run exposed an API boundary regression: the optional initialization transport capability was public in the vocabulary assembly. Made it internal using the existing Client friendship rather than widening architecture allowlists.
- Full-load sandbox cancellation failure was a test ordering race against a real 100ms retry. Session retry time now has an optional TimeProvider (production System default), allowing the test to schedule cancellation before advancing retry time; no assertion or retry behavior relaxed.
- AI transport fixture exposed probe/release/bind port ownership race. Replaced HttpListener handoff with Kestrel's actual port-zero bind; response/capture/cancellation semantics remain covered, including concurrent live endpoints and held-request disposal.
- First root architecture run: 454.408 seconds including build; 1,969 passed, 34 failed, 4 existing skips (2,007 total). This is NOT a valid E2E benchmark: while native test binaries were running, source-only fixes changed the core public surface before Aspire lazily built sandbox Docker images. Native OS logs confirmed real accounts rejected for mismatched contract fingerprints. Freeze source as well as outputs throughout any root/E2E run; no claim of application regression from these mismatched deployments.
- Added the missing Aspire startup dependency: the brain waits for sandbox /health before owner bootstrap. Sandbox health does not depend on the brain, so this does not introduce a cycle. A composition assertion retains the dependency.
- Runtime/content-capture facts now explicitly await the relevant account's initialization before timing request completion, preserving existing five-second response probes. Early requests remain covered separately by retained-request replay tests. Earlier attribution of their timeouts solely to startup was incomplete: the invalid root run also had contract mismatch.
- Clean frozen-source root run: 517.660 seconds wall, 1,998 passed, four failed, four existing skips; session aborted before three remaining cases reported. All 60 architecture checks, 201 CSharp tests, 199 AI tests, and packed composition passed. All 21 folder browser journeys completed; four reported failures were the new readiness deadline.
- Focused runtime diagnostics identified a real delivery defect: all 73 owner behaviors had initialized and subscribed, with no active runtime work, but five signals remained pending. New subscriptions persisted retained seeds without pushing them to an already-connected stream. Existing retention tests only pulled PendingBatches and therefore missed live delivery. Added a live-stream regression (red before fix); both new and returning subscriptions now push pending backlog. Seven retention tests pass; temporary runtime diagnostics removed.
- After this production fix, both real-account readiness barriers pass and the full idle minute measures exactly eight spans (unchanged limit below 20), down from 6,780 in the first full measurement.
- Remaining J1 failure is two issues: obsolete IIntentUsage.RecordBatchAsync completion marker (no production callers; current MeteringChatClient records through ICostMeter/IUsageGrain.Add), and a real whole-assistant fanout far beyond the historical 140-span budget. Diagnostic capture is roughly 1,540-1,678 spans depending on capture boundary, including 240 app-read, 234 authorization, 192 runtime-identity, 90 usage-add and 68 text-set spans. Do not present this as green or silently relax the budget.
- Run observers have bounded cost, not infinite feedback: runtime excludes BrainRuns consumers from generating more BehaviorRan; UsageGrain.Add emits no signals. BrainView preserves each run and writes its history plus rendered panel per fact; Memory separately records run statistics. Batched observer persistence can retain all facts while reducing projection work. Process-wide CPU deltas across overlapping script subscriptions are a separate potential accounting concern, not fixed here.
- SpaceWatcher activity handling stamps presentation metadata (which already emits PresentationChanged when changed), then separately rebuilds Space. Removing that duplicate trigger retains status updates through presentation invalidation; focused regression in progress.
- Asked the user which future span contract should drive deeper work: separate explicit request/projection budgets while retaining coverage and the suite target, or retain 140 for the whole modern assistant journey and undertake a larger redesign. Existing 140 remains until that choice is resolved.
