# Framework and Platform E2E migration verification

Platform:
- `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.E2E --no-restore --verbosity quiet`: passed 1/1, 0 skipped, 27.356 seconds total. The lifecycle test ran real isolated Azurite storage through interruption, resume, revocation, retry, wrong service/key and rollback phases.

Framework:
- `dotnet build src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E --no-restore --verbosity quiet -p:BuildProjectReferences=false`: passed, 0 warnings/errors.
- Initial full `dotnet test` built while primary's AppHost smoke still held output DLLs, producing copy retries. It subsequently entered the reference fixture's AppHost boot. Canceled that run via Ctrl+C at primary's request to release the runtime while architecture/OS builds ran; no verdict claimed for the interrupted run.
- Final reference runtime rerun passed 15/15, 0 skipped, after the documented adapter/runtime repairs.

Initial checks required no edits; subsequent runtime verification required the reference seed and endpoint adapter repairs documented below. Framework and Platform suites contain no live provider gated facts; project compilation verifies their scenarios. Docker/Azurite were available for Platform. Reference AppHost startup initially logged transient Postgres/Supabase/ClickHouse readiness failures before cancellation, the final reference runtime suite passed after the repairs below.

Platform final command output:
```
E:\intochat\digitalbrain\src\DigitalBrain\Platform\tests\DigitalBrain.Platform.Tests.E2E\bin\Debug\net11.0\DigitalBrain.Platform.Tests.E2E.dll (net11.0|x64) passed [+1/x0/?0] (26s 586ms)

Test run summary: Passed!
  total: 1
  failed: 0
  succeeded: 1
  skipped: 0
  duration: 27s 356ms

```

Additional delegated checks after primary's latest shared changes:
- Framework.Tests.E2E rebuilt with BuildProjectReferences=false: passed, 0 warnings/errors.
- OS.Tests.E2E built with BuildProjectReferences=false: passed, 0 warnings/errors.
- Client.Tests.Unit: passed 3/3, 0 skipped.
- Client.Orleans.Tests.Unit: passed 15/15, 0 skipped.
No API migration fixes were required in these projects.

Post-unlock reference runtime attempt:
- Reference AppHost reached client-ready in 23.5 seconds.
- Partial failure: idle trace budget saw 25 spans/min against required <20, dominated by Integration release/secret resolution calls (root/DB agent handling materialized-client caching).
- Partial startup failure: additional MCP hosts collided on fixed port 5081.
- Partial startup failure: production content-capture host lacked canonical csharp Integration RunTokenKey.
- Canceled cleanly via Ctrl+C at primary's instruction after impossible production startup; no full suite verdict claimed. Raw log: framework-e2e-verification.log.

Verification adapter repairs:
- ReferenceBrain now supplies a fresh Base64 32-byte canonical csharp RunTokenKey secret; production scenarios do not depend on development fallback.
- AspireTestSession clears fixed HTTP/HTTPS port bindings across ProjectResources, including client-only MCP hosts, preserving container endpoints and non-HTTP/TCP bindings. Focused ProjectEndpointFacts regression added to Platform E2E.
- Separate explicit per-brain connection fixture migration and runtime credential caching are owned by peer agents; reference host rerun waits for their completion.
- Gmail OAuth state account-switch fix separately verified by Gmail suite 13/13; wrong AccountId does not consume state.

Final Framework verification:
- `dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E --no-restore --verbosity quiet`: passed 15/15, 0 failed, 0 skipped, 3m33.437s.
- Log: framework-e2e-final.log. The trace budget remained unchanged and passed; canonical CSharp production startup, independent HTTP ports, and explicit per-brain connections were exercised.
- Platform rerun after endpoint regression: passed 2/2, 0 skipped, 21.814s; log platform-e2e-verification.log.
- Final OS.Tests.E2E runtime passed: 21 total, 19 passed, 0 failed, 2 live-provider skips; details below.

First OS runtime verdict:
- 21 total: 17 passed, 2 failed, 2 skipped, 6m49.938s. Log: os-e2e-before-fixture-repair.log.
- AgentWorkflow.EmptyQuery failed because the new Supabase test caller scope remained active for an unrelated internal metering grain read. Peer repaired fixture scope duration; production authorization unchanged.
- ShareCSharp failed because its synthetic connection connector is not offered by the reference deployment. Peer owns fixture connector correction.
- Compiled live golden journeys J1Customers/J2aCardForm were skipped: require DIGITALBRAIN_E2E_LIVE_MODEL=1 and DIGITALBRAIN_E2E_MODEL_API_KEY. No live provider credentials were supplied.
- First-run test-owned CLI/testhost processes exited cleanly before shared builds and fixture repairs.

Final OS verification:
- `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E --no-restore --verbosity quiet`: passed 19/19 runnable tests, 0 failed, 2 skipped (21 total), 6m45.406s.
- Log: os-e2e-final.log. The caller-scope duration repair and composed Supabase named-slot share/install fixture both passed.
- The two compiled live golden journeys remain skipped because DIGITALBRAIN_E2E_LIVE_MODEL=1 and DIGITALBRAIN_E2E_MODEL_API_KEY were not supplied.
- Expected bad-query/table recovery and teardown cancellation diagnostics appear in the raw log; they did not cause test failures.
- Runner exited with code 0. Process inventory confirmed no OS E2E/testhost processes remained; the shared build window was released to primary.
