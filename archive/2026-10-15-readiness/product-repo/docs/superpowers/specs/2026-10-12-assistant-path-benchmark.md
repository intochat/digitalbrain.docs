# Assistant prompt correction and path benchmark

## Follow-up: bounded app opening, Assistant 1.9.6

**Already-open Files composer turns now complete in a median 5.018 s, versus 49.942 s in the 1.9.4 baseline; completion improved from 1/3 to 3/3.** The final prompt removes unrelated discovery and inaccessible UI-contract calls from these samples. This is evidence for the narrow guidance change, not a general UI performance improvement. Routing, confidence gates, model selection, allowed contracts, and Flutter code remain unchanged.

The final update discovers the installed app, reads its manifest entry, ensures its workspace window, verifies state, and stops. It separates window hosting from content readiness and bounds recovery. It also requires a fresh UUID per opening intent: a fixed operation id can replay a durable receipt without reopening a window closed since the original operation. Reuse the id for a revision retry, not a new intent.

### Measurement and preserved failures

The original 18-turn baseline is preserved below and in `artifacts/assistant-benchmark-baseline-1.9.4-20261012-194412/`, copied before any rerun. The follow-up consists of an intermediate **24-turn 1.9.5 matrix**, a **24-turn final 1.9.6 matrix**, and **one additional closed-window composer/send pair**. Every run, including the failed intermediate turn, remains on disk. Three rounds retain the original prompt text and alternating composer/send order; the additional pair uses send/composer. Each turn uses a new empty conversation. Setup and restoration are outside ingress timing.

For already-open cases, setup explicitly opens and focuses Files before each turn. For closed cases, setup closes Files and verifies that state before ingress. This is reopening an existing durable window record with already-running services, not a cold app startup. The initial baseline only established that Files was already open; its starting focus was not independently controlled for each trial.

The 1.9.5 candidate improved already-open composer completion to 3/3, median 4.034 s, with four tools per turn. Its closed composer turns took **32.327 / 26.862 / 48.760 s**, using **14 / 16 / 15 model spans** and **16 / 18 / 19 tools**. Round 2 failed with `The agent reached its model-call budget`; Files remained closed. Rounds 1 and 3 eventually completed. The first repeatedly used `open-files-1`, replaying applied revision 91 against current revision 129. Source inspection confirms `WorkspaceNeuron.Open` returns a receipt replay before checking expected revision. This led to the explicit fresh-UUID guidance in 1.9.6; no workspace semantics changed.

Concurrent workspace activity occurred during the intermediate matrix and the first final closed composer case. In that final case, eight unrelated workspace traces changed focus/windows before the agent opened Files. The user then confirmed the app would remain idle. Final closed rounds 2–4 have only the expected opening workspace change during the measured composer turn. The concurrent round remains reported, but idle closed medians below use rounds **2, 3, and 4**. This distinction is based on recorded workspace traces, not on selecting the fastest results. The extra pair supplies a third idle closed sample. Do not call the entire final matrix an idle run.

### Before/after terminal results

Seconds; three samples per row except where explicitly noted. Terminal time is not the time a window first opens.

| Case/path | 1.9.4 terminal median | 1.9.6 terminal median (range) | Completion / window result |
|---|---:|---:|---|
| Plain composer | 1.917 | 0.493 (0.490–1.107) | 3/3 completed, no tools |
| Plain send | 4.053 | 1.424 (1.292–1.498) | 3/3 completed, no agent tools |
| Lookup composer | 1.673 | 1.946 (1.698–5.157) | 3/3 completed; all returned names checked |
| Lookup send | 3.053 | 6.602 (6.565–6.615) | 3/3 completed; all returned names checked |
| Already-open composer | 49.942; 2/3 failed | 5.018 (4.847–5.595) | 3/3 completed; open/reference/focus verified |
| Already-open send | 1.076 | 1.035 (0.873–1.149) | 3/3 direct; workspace verified |
| Closed composer, idle rounds 2–4 | Not measured | 5.606 (4.973–7.066) | 3/3 completed; window opens at median **4.344 s** |
| Closed send, idle rounds 2–4 | Not measured | 1.100 (1.068–1.224) | 3/3 direct; window opens at median **1.095 s** |

All 26 final turns completed; all 14 opening cases passed independent workspace readback. There were zero recorded agent tool errors in the final opening cases, and their tool records contain only context, app inventory, app Read, workspace Read, and (for closed cases) one workspace Open. Already-open composer cases use four tools; closed composer cases use five. No app Request, source-file fetch, content-result read, broad capability search, or unavailable child-contract call occurred.

The closed agents used the current workspace state returned by Open and ended without the separate post-Open Read requested by the prompt. The harness independently reread workspace state and verified the exact reference, open flag and focus. Thus the task succeeded, but strict compliance with every prompt step was not achieved. Several replies also described Files' capabilities without observing rendered content. Those statements are not evidence that contents loaded.

Plain replies contained `benchmark ready` with no tools (they omitted the period in the prompt). Lookup replies were checked against their actual `neurons_list` result and included every returned app name, but several added narration. These are completion and content checks, not perfect exact-format compliance. The app inventory was not frozen between the original baseline and the follow-up.

### First meaningful output and individual final runs

**First text** retains the original definition: any non-whitespace assistant text observed in a transcript Read. **First meaningful** is reconstructed from the saved event/read stream: the requested `benchmark ready` phrase; the first complete returned app name (`assistant`) in a lookup answer; an explicit already-open confirmation for composer; or the verified workspace change for direct send. For a closed window it is the first observed workspace Read showing Files open with the matching reference. Initial narration such as “I'll open Files” and fragments such as “Files” do not count. This is connector-visible state, not painted pixels. An already-open window has no new opening timestamp; a confirmation is still meaningful output.

The original baseline did not apply this semantic-output rule, so its first-text figures below are not silently relabeled as first meaningful. All times below are seconds. Closed round 1 is the retained concurrent-use sample; round 4 is supplemental.

| Sample | First meaningful | First text | Window open | Terminal | Outcome | Observed model spans | Tools |
|---|---:|---:|---:|---:|---|---:|---:|
| plain-1-composer | 0.493 | 0.493 | — | 0.493 | completed | 1 | 0 |
| plain-1-send | 1.269 | 1.269 | — | 1.292 | completed | 1 | 0 |
| plain-2-composer | 0.490 | 0.490 | — | 0.490 | completed | unavailable | 0 |
| plain-2-send | 1.498 | 1.498 | — | 1.498 | completed | 1 | 0 |
| plain-3-composer | 1.107 | 1.107 | — | 1.107 | completed | 1 | 0 |
| plain-3-send | 1.424 | 1.424 | — | 1.424 | completed | 1 | 0 |
| lookup-1-composer | 4.800 | 4.800 | — | 5.157 | completed | 2 | 1 |
| lookup-1-send | 6.041 | 5.781 | — | 6.615 | completed | 2 | 2 |
| lookup-2-composer | 1.410 | 0.706 | — | 1.698 | completed | 2 | 1 |
| lookup-2-send | 6.350 | 6.094 | — | 6.565 | completed | 2 | 2 |
| lookup-3-composer | 1.946 | 0.979 | — | 1.946 | completed | 2 | 1 |
| lookup-3-send | 6.602 | 6.415 | — | 6.602 | completed | 2 | 2 |
| open-1-composer | 5.067 | 4.799 | — | 5.595 | completed | 3 | 4 |
| open-1-send | 1.029 | — | — | 1.035 | direct | 0 | 0 |
| open-2-composer | 5.018 | 4.855 | — | 5.018 | completed | 4 | 4 |
| open-2-send | 0.869 | — | — | 0.873 | direct | 0 | 0 |
| open-3-composer | 4.847 | 1.172 | — | 4.847 | completed | ≥2 | 4 |
| open-3-send | 1.144 | — | — | 1.149 | direct | 0 | 0 |
| closed-1-composer | 14.811 | 16.177 | 14.811 | 16.325 | completed | 4 | 5 |
| closed-1-send | 1.089 | — | 1.089 | 1.094 | direct | 0 | 0 |
| closed-2-composer | 4.344 | 5.401 | 4.344 | 5.606 | completed | 4 | 5 |
| closed-2-send | 1.063 | — | 1.063 | 1.068 | direct | 0 | 0 |
| closed-3-composer | 3.809 | 1.019 | 3.809 | 4.973 | completed | 4 | 5 |
| closed-3-send | 1.211 | — | 1.211 | 1.224 | direct | 0 | 0 |
| closed-4-composer | 5.684 | 6.471 | 5.684 | 7.066 | completed | 4 | 5 |
| closed-4-send | 1.095 | — | 1.095 | 1.100 | direct | 0 | 0 |

“Observed model spans” counts Assistant model spans only. All direct sends still invoke System One once. **Telemetry is incomplete in two final traces:** plain-2-composer has 2,605 durable input tokens but no exported chat span, including after a repeat export; open-3-composer exports two model spans totaling 15,850 input tokens against 18,451 durable input tokens. Their exact model-call counts and full model execution time are unavailable, not zero. The other final model-span input-token sums match durable usage. These are observed spans, not a guarantee against exporter loss. Failed intermediate usage totals remain unavailable rather than zero.

### Available timing breakdowns

- Final composer admission-to-agent-start was approximately 55–96 ms. Plain send added approximately 721–818 ms before the agent; lookup send added 3.648–4.009 s.
- System One HTTP spans were 604–688 ms for plain send, 742–903 ms for already-open send, and 950–974 ms for idle closed sends. Lookup send was slower: 3.522–3.544 s, followed by 2.515–2.884 s of observed Assistant model execution. The final lookup median regressed; this is not an across-the-board speedup.
- Idle closed composer model spans total 5.322 / 4.586 / 5.962 s across four observed calls per turn. Window opening preceded terminal output by 1.262 / 1.163 / 1.382 s. All three used a fresh UUID and one Open call.
- Already-open composer model spans total 5.429 / 4.858 / at least 3.071 s. The last trace is incomplete. The reduction in tools and unrelated work is clearer evidence than assigning all wall-time changes to the prompt.
- Final acknowledgements were approximately 9–35 ms. Most terminal transcript observations followed durable completion by 29–73 ms; the supplemental closed composer observation took 526 ms. Median signal envelope-to-observer delivery was about 1.6–1.8 ms per group.
- No complete agent-tool duration boundary or isolated storage/projection critical path is available. Tool counts and recorded errors are reliable durable run data; subtracting model spans from wall time is not a valid measurement of tool time. Nested HTTP, Orleans, storage and UI projection spans overlap and must not be summed as separate costs.

Services were not restarted, caches were not cleared, and this remains a tiny sequential local-development study. The intermediate feature compilation test overlapped part of the 1.9.5 matrix; final compilation tests ran after the 1.9.6 matrix and before the supplemental pair. Concurrent user actions, model/backend variance, cache state, changed inventory, and incomplete telemetry prevent a controlled causal latency claim. Flutter paint, actual Files content readiness, cold launch, concurrency throughput, 3D visualization, and a real file lookup were not measured.

The remaining app-opening cost is mostly model rounds over large snapshots: IApp.Read returns source files and other app data along with the manifest, and Workspace.Read returns all windows. The prompt now avoids following those contents into unrelated work, but it does not reduce response payloads or make the model deterministic. The broader composition-ownership diagnosis is unchanged and was not implemented in this slice.

### Deployment, checks and restoration

Both candidates used `POST /brains/owner/apps/assistant/update`, the normal feature loading and compilation path. Final MCP readback confirms **1.9.6, Live, edited false, os/shipped origin 1.9.6**, and the installed prompt exactly equals source. Original settings/connections were retained: Model empty (same deployment-default deepseek/deepseek-v4.1-flash), RouteGate 0.8. Only the prompt and feature version changed in the app. No route, gate, contract allowlist, model setting, vector routing, or shortcut changed.

LSP mapped IWorkspace.Open's definition, implementation, references and incoming calls. Runtime-loaded feature script symbols returned no LSP navigation results; the declaration's diagnostic request returned no errors, so actual compilation through the update gate and feature tests is the substantive check. Final `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit --no-build -- --filter-method '*Feature*'` passed **3/3**, compiling current feature files with the real sandbox. The reused runner emitted Orleans/EventLog shutdown warnings after test work; the test exit code was zero. No host binaries or Flutter sources changed. Python compilation and `git diff --check` passed. A separate read-only review checked the prompt/harness changes and its two evidence-handling findings were fixed.

All 20 active Aspire services were Running/Healthy at final check; rebuild helpers remained idle. MCP workspace state and Aspire trace/log evidence confirm the actual running paths. Full traces are exported with the same Aspire CLI used for the baseline because MCP omits oversized traces.

Original conversation, draft/context, status, focus and open-window set were compared with the state saved **before the first update**, and all matched after final restoration. Each matrix and the supplemental pair also saved their own restoration checks. This restores those requested fields, not workspace revision numbers, operation receipts, benchmark conversations, or legitimate request history. Existing uncommitted work remains intact; no commit was made.

### Follow-up evidence and reproduction

- `artifacts/assistant-benchmark/after-1.9.5/`: all 24 intermediate runs and traces, including closed-2-composer's budget failure.
- `artifacts/assistant-benchmark/after-1.9.6/`: 24 matrix runs, closed-4 composer/send, raw event/read streams and exported traces, `matrix.json`, restoration files, and `verified-summary.json` (explicit missing-telemetry fields and semantic-output calculations).
- `artifacts/assistant-benchmark/after-update-1.9.6-app.json`, `final-app-mcp.json`, `final-workspace-mcp.json`, `original-restoration-check.json`, and `final-feature-tests.log`: deployment and final checks.
- `artifacts/assistant-benchmark/verify-summary.py`, `collect-final.py`, and `supplemental.py`: local analysis/collection and the added pair; raw traces contain app contents and stay local.

The checked-in harness now creates a fresh timestamp/UUID output directory by default, uses shared generated gRPC bindings/dependencies from `artifacts/assistant-benchmark/`, and refuses to overwrite saved state or a case label. Set `ASSISTANT_BENCHMARK_OUTPUT` to a new directory to choose a stable output location. `matrix` runs 24 turns with explicit open/closed setup, records current workspace readback, preserves per-run failures, writes `matrix.json`, and returns a failure after restoration if cases fail or the expected count is incomplete. Run only while the owner workspace is idle. Dependency setup remains as documented below; output is no longer written directly over baseline labels by default.

Representative final opening traces: already-open composer `65cd856d1d6042c4575d75594d6f7419`, `10aedfe758200bb0f18e3255b91f7fa2`, `034f9614d09a3ad31dc0fb5c2db1f901`; idle closed composer `b352474e841456367fbcb7be9dc01369`, `c9a4228ebed61e417ecaa710a0715a28`, `8a41ce482e2e986e770edc128ee44559`; idle closed send `8d954062e1329cc5e6b1d2557a45b278`, `2794155bca8e7511033f3300da2479f8`, `68e66ddb4651044f1ac7855b6e0e0257`. Intermediate failure trace: `4bc45b0d83eae8c870c425ef35d20b63`.

## Original 1.9.4 baseline (preserved)

Assistant 1.9.4 replaces the obsolete `IWorkspace.OpenSurface` guidance with `IWorkspace.Open` and its one-object argument array. Data Visualizer examples now address the generated view's surface and window, preserve separate view windows, and explain revision-conflict retries. Routing is unchanged.

The baseline shows two different costs: `send` adds classification before ordinary assistant turns, while composer requests to open Files can spend many model rounds inspecting capabilities after the window is already available. These results favor fixing unnecessary agent work before introducing another routing mechanism.

## Measurement boundary

Measured on 2026-10-12, using the existing local Aspire deployment and `owner` brain, with Assistant Model empty (deployment default `deepseek/deepseek-v4.1-flash`) and RouteGate 0.8. Three repetitions of three prompts through each path: **18 measured turns**. Each turn used a new empty conversation. Path order was composer/send in rounds 1 and 3, send/composer in round 2. Services stayed running; caches were not cleared. This is a small sequential development baseline, not a cold-start, concurrency, or percentile benchmark.

Ingress used the real HTTP endpoints: `/brains/owner/apps/event` for composer Submit, after setting its draft, and `/brains/owner/apps/assistant/request` for `send`. Timing starts immediately before the request. Output was observed through the same gRPC neuron Watch/Read boundary used by the Flutter connector. No state polling was used. The watch timestamps and state reads, durable agent timestamps, and Aspire spans were saved.

**First text** means first non-whitespace assistant text available after a transcript-change signal and Read; it can be narration before tool use, not the final answer. **Terminal** means the transcript reports completion/failure, or a direct route reports its window opened. **Acknowledgement** is only HTTP request acceptance. Failed turns remain in the results. Flutter scheduling and painted pixels are not measured. Reads by this extra observer add some load; delivery estimates use clocks on this one machine.

Files was already open before these trials. “Open Files” therefore measures ensuring/focusing an existing window, not loading a previously closed app. Direct routes made verified WorkspaceChanged updates. The first composer trial also changed the workspace at 7.64 s, then continued until failure at 49.94 s. The other composer trials produced no workspace change; one eventually confirmed the already-open window and one failed. Do not present their terminal times as times until a new window became visible.

## Results

Times are seconds; medians have three samples each.

| Prompt | Composer terminal median (range) | Send terminal median (range) | Terminal outcome |
|---|---:|---:|---|
| `Reply with exactly: benchmark ready. Do not use tools.` | 1.917 (1.905–3.603) | 4.053 (2.992–11.708) | 3/3 completed each |
| `Open Files` | 49.942 (28.600–57.520) | 1.076 (0.983–1.207) | Composer 1/3 completed, 2/3 failed; send 3/3 direct |
| `Use your tools to list the installed apps. Answer with the app names only.` | 1.673 (1.624–2.101) | 3.053 (2.484–4.091) | 3/3 completed each |

Plain replies used no tools. App lookups used `neurons_list` and usually `neurons_context`, and returned installed app names; some added narration despite the names-only instruction. Completed does not imply perfect formatting compliance.

| Case and path | First non-whitespace text, three runs | Assistant model calls | Agent tool calls |
|---|---|---|---|
| Plain composer | 3.603, 1.917, 1.905 | 1, 1, 1 | 0, 0, 0 |
| Plain send | 11.708, 4.053, 2.992 | 1, 1, 1 | 0, 0, 0 |
| Open composer | 1.715, none, 0.855 | 16, 16, 11 | 26, 28, 16 |
| Open send | none; direct workspace action | 0, 0, 0 | 0, 0, 0 |
| Lookup composer | 1.742, 0.772, 0.579 | 2, 2, 2 | 2, 2, 2 |
| Lookup send | 1.553, 2.764, 3.053 | 2, 2, 2 | 2, 2, 1 |

All nine send requests made one System One HTTP request. “Zero assistant model calls” does **not** mean no inference: direct send still used Jev's classifier. Routing hints differed between repetitions, including confident `router.ask` guesses rejected by the existing named-app guard.

## Where time goes

- **Acceptance:** most HTTP acknowledgements were 8–35 ms. The first plain send acknowledgement was 573 ms. Acceptance is not user-visible completion.
- **Classification:** System One HTTP spans were 680–1,092 ms after the first observed send. That first request took 8,224 ms. It is an observed first-request outlier, not a proven cold-start cost. The whole router decision took 8,980 ms there; agent start occurred 9,688 ms after ingress.
- **Before agent start:** median 63 ms through composer, versus 934 ms across send fallbacks. This includes routing, behavior scheduling, and supporting calls; it is not pure routing CPU time.
- **Model execution:** plain composer model spans were 3,395 / 1,819 / 1,804 ms. Lookup composer model spans summed to 1,943 / 1,483 / 1,526 ms across two calls. These account for most of those turns.
- **Open Files agent loop:** 16 / 16 / 11 sequential model calls consumed 40.375 / 51.785 / 25.385 seconds. The first two exhausted the model-call budget. They made 6 / 8 tool calls with recorded errors; the completed third trial had 3. Calls attempted contracts outside Assistant's allowed surface, notably collection, text-field and surface contracts. Broad inventory and full app reads increased context; the completed trial reported 152,119 cumulative input tokens. Failed runs did not retain aggregate usage, so their totals are not reported as zero.
- **After durable completion:** terminal transcript availability followed AgentRun.EndedAt by 30–129 ms. Median signal envelope-to-client delivery per sample was approximately 1.6–1.7 ms. These small connector costs do not explain multi-second classification or repeated model calls.

Model spans are summed only across sequential calls, not together with their nested HTTP spans. Remaining time is not labeled “tool time”: telemetry does not expose a complete agent-tool boundary for every call. It includes tool execution, persistence, orchestration, serialization, and observation reads. Broad traces contain substantial overlapping TrustLink/storage and Ino activity; summing their durations would overstate the critical path. Exact storage/projection attribution needs additional targeted instrumentation before optimizing it.

## Live prompt verification

The normal app update endpoint reloaded and compile-checked the feature. The installed snapshot is version 1.9.4, `Live`, `edited: false`, origin `os` / shipped / 1.9.4; its prompt exactly equals the source file and contains no `OpenSurface`. Existing settings and connections were retained.

A separate composer request asked for a temporary one-field form. The agent called `IWorkspace.Open` successfully and the workspace changed at 27.124 seconds; terminal transcript arrived at 28.503 seconds. MCP readback confirmed title “Assistant prompt verification,” one optional plain-text `note` field, empty value, and unsubmitted state. The window was then closed as part of restoration. This verifies the corrected workspace method, not a fast form-authoring flow: the agent first failed on a string enum value for FormFieldKind, made unrelated discovery calls, then recovered. Schema discoverability remains a separate performance issue.

The Files trial likewise used `IWorkspace.Open` successfully. Data Visualizer paths were checked against its shipped `requests.cs` and `Views.cs`: `show` opens `/views/{id}/window`, sets `last-view`, and composes `/views/{id}/surface`. A new database visualization was not part of this benchmark.

Validation: LSP diagnostics for the changed declaration were empty; `git diff --check` passed. `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit --no-build -- --filter-method '*Feature*'` passed 3/3, including real-sandbox compilation of current files from the features folder. The initial build-enabled invocation failed on DLL copy locks held by running services; the existing runner was reused to compile the current feature scripts without replacing those binaries. All 20 active Aspire services were Running/Healthy afterward; idle rebuild helpers were NotStarted.

Original conversation, draft, status, focus and open-window set were read back and matched the saved state. Benchmark conversations and the empty verification form remain as evidence. Workspace revisions, closed-window records, request history and other legitimate benchmark state changes are not rolled back or erased.

## Next changes to evaluate

1. Give app-opening requests concise, current guidance to inspect the manifest entry, ensure its workspace window, verify that state, and stop. Measure completed-task rate alongside latency. The current repeated attempts to read inaccessible UI contracts are a demonstrated problem.
2. Improve discovery of nested argument schemas and enum wire values. The form verification shows repair rounds even after the workspace method is correct.
3. Repeat this same baseline after those corrections. Add a closed-window case and a real Files lookup task before making broad claims about app performance.
4. Only then compare routing policies. The measured send classifier adds roughly 0.7–1.1 s to ordinary fallbacks, while its guarded direct app-open path avoids a much longer agent loop. This supports testing a narrow open policy; it does not establish that vector routing or routing every composer message would help.

No classifier, threshold, search algorithm, contract allowlist, model selection, streaming cadence or routing policy changed in this work. No before/after latency improvement is claimed for the prompt correction because the measured matrix was run only after it.

## Reproduction and evidence

The checked-in harness is `docs/superpowers/loop/assistant-benchmark.py`. Run from the repository root against a healthy local deployment. It requires Python, `grpcio`, `grpcio-tools`, generated bindings from `src/DigitalBrain.Platform/DigitalBrain.Platform/Neurons/neurons.proto`, HTTP ingress on 5080 and TLS gRPC on 59121. It uses the development localhost certificate and the local owner posture. The Python streaming API follows the [official gRPC tutorial](https://grpc.io/docs/languages/python/basics/).

```powershell
New-Item -ItemType Directory -Force artifacts/assistant-benchmark | Out-Null
python -m pip install --target artifacts/assistant-benchmark/deps grpcio grpcio-tools
python -c "import sys; sys.path.insert(0,'artifacts/assistant-benchmark/deps'); from grpc_tools import protoc; protoc.main(['protoc','-Isrc/DigitalBrain.Platform/DigitalBrain.Platform/Neurons','--python_out=artifacts/assistant-benchmark','--grpc_python_out=artifacts/assistant-benchmark','src/DigitalBrain.Platform/DigitalBrain.Platform/Neurons/neurons.proto'])"
python -u docs/superpowers/loop/assistant-benchmark.py matrix
```

Run labels overwrite local output filenames, so archive the evidence directory before a new matrix. A fresh conversation, draft preparation, and status reset occur outside the timed interval. The harness restores the selected conversation and workspace after the matrix, including on failure. Do not run it concurrently with user interaction in that brain.

Local raw results, signal observations, full spans, summaries and restoration checks are in `artifacts/assistant-benchmark/` (gitignored). Full traces may contain app contents and are kept local. The final harness additionally excludes whitespace from first-text timing, clears prior status before ingress, and cancels its own run if measurement fails. The report's first-text values were recalculated from the recorded events with the whitespace rule; original raw observations remain unchanged. Pilot failures from initial harness setup are excluded from the 18-run matrix.

Aspire MCP omitted oversized full traces, so spans were exported with the [documented Aspire telemetry CLI](https://aspire.dev/dashboard/apis/):

```powershell
aspire otel spans --apphost src/DigitalBrain.AppHost --trace-id <id> --format Json --limit 20000 --non-interactive
```

| Case | Composer trace | Send trace |
|---|---|---|
| Plain 1 | `9dc19efd9713741c7814a18d3e8f41e3` | `47caf12d70d7c3138ad9431630cb6400` |
| Plain 2 | `dd8b1e8f1f2dd945895d82e4cda4ccfa` | `138bb5433628ebc8c0db2fb0682e1008` |
| Plain 3 | `f4cf87f04cbeac56751b56db4248072b` | `2ca4c720a4cfe9470832cb5b878d5fae` |
| Open 1 | `3bf8fe255ff5d1be432de7077af4b12a` | `d044d3f1fe41d0247b9bea8c8ae40543` |
| Open 2 | `358a4731153e9ae2a1def72414d6511d` | `34aa3a0ed56e9577008eab9bb1fe40f8` |
| Open 3 | `c2d67edee58482629020ee5090ed0925` | `c9bf6427eb798ebcda1b0137b3ed0867` |
| Lookup 1 | `be9e0f0a91283c5eecbd198d229b5cfa` | `0687bc85edf3d563e3fb3e974bba08d2` |
| Lookup 2 | `3c31b587a20a9f03e3f25770503d5d03` | `1937d6495fa1821d049eba32dc46700a` |
| Lookup 3 | `89024662ac791944bb55331c3de2e8e4` | `d2c93191d00a96907c32e64db87f6816` |

Form verification trace: `c4abe879439e436ccf6912e892403cf2`.
