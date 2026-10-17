# Shared dashboard telemetry

Approved scope: replace the custom OTLP collector and handwritten protobuf parser with the Aspire dashboard shared by each host fixture. Expose strongly typed telemetry on E2ETest, preserve all existing coverage and budgets, correlate operations explicitly, and replace exporter sleeps with acknowledged completion. Measure the full suite locally from the repository root. Preserve existing working-tree changes and the user's live Debug host.

Implementation sequence:
1. Verify Aspire 13.6.1 endpoint discovery, authentication, OTLP JSON schema and query limits against framework sources.
2. Add a typed dashboard client and operation capture API, with tests for correlation, full payload preservation, query completeness, and cancellation/errors.
3. Enable one dashboard per opted-in Aspire session; connect its client to fixture/lease lifetime. Introduce E2ETest.Telemetry while preserving BrainFact compatibility.
4. Establish application completion independently of telemetry export; explicitly acknowledge exporter delivery without timed drains. Check propagation across HTTP, Orleans, and sandbox requests.
5. Migrate all trace/content/privacy/export tests; remove old collector/parser and snapshot-offset assertions. Preserve the one-minute idle observation and all numerical budgets.
6. Build and run focused regression tests. Freeze source and binaries during Aspire runs. Run dotnet test from root, record complete wall time and failures without weakening assertions.

Verification must distinguish a complete capture from expected evidence merely arriving. No quiet-period heuristic or arbitrary delay may claim completeness. Domain completion is scoped to the work the test starts; finite idle observation is intentionally time-based.

## Implementation and local results

Implemented a session-owned Aspire dashboard with authenticated, typed OTLP JSON queries, exposed through `E2ETest.Telemetry`. Removed `TestTelemetryCollector`, `OtlpTraceParser`, and their old assertion adapter. Each HTTP request has a distinct W3C parent; completion requires every request's server span plus trace and log export receipts from each participating application process. The opt-in capability-protected endpoint flushes the actual OpenTelemetry providers. Runtime completion also awaits subscription work and pricing. Privacy captures retain resource/scope metadata, events, links, unknown fields, decoded text, and earlier spans overlapping the observation window. Query truncation and reported dropped fields fail capture. SDK loss before a successful export cannot be retrospectively recovered by receipts.

Existing content, privacy, production-export, idle, J1, and exact Orleans span assertions remain. Idle and J1 are separate facts so either failure cannot prevent the other measurement. No span budget was increased. The deliberate 60-second idle observation remains; exporter settling sleeps do not.

Final measurement from the repository root on one local machine, including build/restore and fixture teardown:

```powershell
dotnet test -c Release -p:CodeGraphRefresh=false --max-parallel-test-modules 4 --timeout 15m
```

- Wall time: **398.619 seconds (6m 38.619s)**; MTP duration: 6m 30.457s.
- Total: **2,034; passed: 2,029; failed: 1; skipped: 4**. Exit code 2.
- OS headless E2E: 27 passed, one existing skip. CSharp: all 203 passed.
- Focused dashboard/correlation/configuration regressions: 19 passed. Export-barrier tests passed; Release build and `git diff --check` passed.
- Logs: `artifacts-telemetry-final-root-test.log`; external stopwatch: `artifacts-telemetry-final-root-time.log`.

The sole final failure is `TraceBudgetFacts.J1StaysWithinTheSpanBudget`: **1,782 application spans against the unchanged 140-span limit**. Breakdown: Orleans 1,437; ASP.NET Core 139; HTTP client 138; Npgsql 48; CSharp runtime 19; AI 1. A separate focused run reproduced the failure with 1,739 spans while idle and exact two-span Orleans correlation passed. Its largest repeated calls included authorization, runtime identity, app reads, and usage recording. These counts include client/server pairs and completion-observation traffic; they are evidence for investigating application call amplification, not a direct count of useful operations. The historical budget described a direct agent journey, while the current test exercises the scripted assistant journey; scope and architecture need investigation without silently raising the limit.

The measured command is below eight minutes but is **not green**, and below five minutes has not been achieved. Four parallel test modules run on the same machine. Release and disabled CodeGraph refresh are explicit measurement conditions, so this is not a claim about unqualified Debug `dotnet test`. Browser journeys still run headlessly; this HTTP telemetry API does not implicitly propagate W3C context into Playwright browser requests.

## J1 architecture follow-up

The next root measurement, after incremental Space refresh, registering SpaceActivation, removing the report authorization preflight, and avoiding repeated composer configuration, took **407.479 seconds (6m 47.479s)**. Results: **2,040 total; 2,035 passed; one failed; four existing skips**. J1 remained the only failure, at **1,551 spans** against the unchanged 140 limit. Space's app-read spans fell from 180 to 12. Logs: `artifacts-j1-root-test.log`, `artifacts-j1-root-time.log`.

User approved runtime-owned run history and statistics, with apps consuming snapshots. Implementation in progress: persist the run read model with the original run facts, retain 200 entries per owner so owner exclusion still yields 200, and retain 31 positive successful duration samples per behavior/hash using the existing lower median. Memory no longer writes one table row per run. BrainView reads snapshots and coalesces live display updates. Existing legacy app storage remains readable; no public import or arbitrary history mutation endpoint is introduced. Preserve causal traces, run signals, authorization, and all existing budgets.

The first native-history root run took **342.403 seconds (5m 42.403s)**, MTP 5m 32.828s: **2,049 total; 2,044 passed; one failed; four existing skips**. J1 was the only failure at **1,080 spans**, reproduced identically in a focused run. Npgsql spans fell from 48 to zero. The remaining server calls included 59 runtime invocations/identity checks, 26 acknowledgements, 13 history reads, 8 BrainView text writes, and 5 chat projections. These are real application operations rather than duplicate telemetry registration. Logs: `artifacts-native-runs-root.log`, `artifacts-native-runs-root-time.log`, `artifacts-native-runs-j1.log`.

Read-only review identified two consumer correctness fixes before final verification: retry failed legacy reads rather than permanently caching an empty result, and make the BrainView run subscriber the sole text writer so delayed composition cannot overwrite a newer projection. Memory legacy reads occur on open; no run-time table writer remains.

Those fixes are implemented, including a failure/recovery regression demonstrated red then green. The final root Release command above took **396.129 seconds (6m 36.129s)**, MTP 6m 27.026s: **2,051 total; 2,046 passed; one failed; four existing skips**. OS headless E2E: 27 passed, one existing skip. OS unit: 49 passed. J1 remains the sole failure, now **1,068 spans** (Orleans 877, ASP.NET 86, HTTP client 85, runtime 19, AI 1; zero Npgsql). No budget or coverage was removed. Logs: `artifacts-native-runs-final-root.log`, `artifacts-native-runs-final-root-time.log`. Under-eight-minute execution is measured; a green root suite and under-five-minute execution remain unachieved.

The next architecture discussion compares native UI bindings with script-owned rendering over typed snapshot delivery and versioned projection commits. The user prefers preserving script-generated UI and requested code comparisons. Neither proposed UI/projection API has been implemented. Ordinary event-delivery semantics must remain lossless; coalescing belongs only to explicit reconstructible UI projections, not all subscriptions.

Historical comparison: [green CI run 37439693793](https://github.com/intochat/digitalbrain/actions/runs/37439693793) (October 6) used separate kernel, aspire-hosting, intochat, OS, and unit-test jobs. Their Test steps took 4m11s, 2m33s, 4m57s, 5m09s, and 5m09s respectively, excluding setup/build/image warming. This is not a one-runner root baseline. The originally linked October 14 run was cancelled while its Test step was still running.
