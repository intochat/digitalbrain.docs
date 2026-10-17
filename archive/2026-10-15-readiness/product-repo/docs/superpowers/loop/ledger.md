# Forking-loop ledger

The dev loop's record: wishes, defects, gate wishes and hourly progress. Orchestrator-owned.
Plan: `docs/superpowers/plans/2026-10-11-forking-loop-mvp.md`. Spec: `docs/superpowers/specs/2026-10-11-forking-loop-design.md`.

## Gates

The user pre-decided G1–G11 at kickoff (2026-10-11 06:30, "don't ask me for any approval"): each gate takes
its **recommended default** from the plan's gate table. G7 (cross-brain memory) and G9 (live cross-app
indexing) are open design fronts, so their recommended default is "not built". G8: the fast path's retrieval
lives in the Apps module and ranks by embedding similarity plus run history (user hint: "picks the best
synapse based on history"). G11: focus comes from the caller.

New gates found during the run are listed under **Open gates** and are not built.

## Decisions taken under "recommended" (details of approved gates)

| Gate | Decision |
|------|----------|
| G1 | `{brain}/runs` (`IBrainRuns`, no read methods for the MVP); one one-way call per ack/push; journaled through one new protected multi-signal Framework API (G1a: each fact keeps its own batch trace). |
| G2 | `WriteSynapse` dedupes through `AppState.Synapses[]` and writes no receipt; `CompleteSynapse` is `[Internal]` and records success and rejection; `IAppRuntime.Deploy` returns the program so `SynapseWritten.Hash` joins run facts. |
| G3 | Reuse the existing `IEmbeddingModel : INeuron` (AI.Contracts/Media): no new embedding contract. |
| G4 | `IVectorIndex` in AI.Contracts/Embeddings, `VectorIndexNeuron` in the AI module, keyed `{brain}/memory/{name}`. |
| G8 | Fast-path retrieval in the Apps module: embeddings (default generator) + word fallback, boosted by run history; corpus = this brain's apps + `./features`. Fork-first above a match threshold. |
| G10 | `FileWritten(Path, Length)` from `IFileSystem.Write` only. |
| L0 | `SynapseShape` is a static syntax check in the Apps module (no contract change). `CustomerResearcher/research.cs` (two loops under `Task.WhenAny`) is rewritten into one-reaction synapses, because CLAUDE.md already ratifies "a synapse is one reaction". SelfImprove `failed/healthy/verified.cs` nest an inner `await foreach` (allowed as an inner loop). |
| 0.16 | Memory's unbound `tables` slot falls back to the per-brain database policy (no connection needed). |
| G12 | Features hot reload: `POST /apps/{name}/update` and install re-read the feature from disk (committed 384c8cffa; it is what the plan's redeploy rule assumed). |

## Open gates (new; not built — for the user)

| Id | Gate | Blocks |
|----|------|--------|
| P1 | **Privacy scope contract** (decision 13): no privacy flag exists in code (federation spec Q7 says per app). Where does it live, which option names the private-scope local model, and does retrieval embedding follow it (dev default embedder is cloud OpenAI)? | Fast path's model-by-scope step and `APrivateScopeWithoutALocalModelIsRejected`; private-scope retrieval (G16). |
| G13 | May the loop create a second local test account/brain on the Open-posture localhost? | Circle "invitation" and "spoken anywhere" scenarios, CircleRoom membership. |
| G14 | May the loop create a `windows` connection to this PC? | All four Files scenarios; M3 volumes on this machine. |
| G15 | SelfImprove request/verify/promote start candidate clusters and restart live resources (`aspire resource restart`), which conflicts with "restarts only between verification windows". | SelfImprove scenarios except open. |
| G16 | Embedding model under privacy scope for G8 retrieval (default is cloud `ITextEmbedding3Small`). | Private-scope retrieval. |
| NG-1 | Draft candidate identity after Submit: plan B keys drafts by draft id, current code keys candidates by commit sha (`DeploymentNeuron.Reconcile`, `Orphans`, `LiveBuildFile`). | Task 6 (candidate drafting), Demo 2. |
| NG-2 | No contract can create or edit new/non-C# files in a draft worktree (`IRoslyn` edits only existing documents). A new module needs csproj/slnx/Mcp.csproj edits. | Task 8 (Module Builder), Demo 2. |
| NG-3 | `IRoslyn` has no lifecycle call (Close); a whole-repo MSBuildWorkspace is held in a live silo. | Task 7. |
| NG-4 | Live-build mode: the AppHost is source-booted, so a promotion restarts silos on the old source while the candidate is marked Promoted. | Demo 2. |
| NG-5 | `refs/digitalbrain/live` (5b6d6ac) was advanced by another session's `.digitalbrain/worktrees/a3` and is not an ancestor of os-runtime; every promotion from this checkout fails at Commit. Resetting it affects that session. | Demo 2. |
| K1b | Feature map K1 remainder "Features gain program hash + behaviors" (kernel `Feature` record) is not in any task. Drop or schedule? | — |
| SUB | Subscriptions skip access policy (RuntimeEdge stamps no caller on subscribe), so a script in brain B could subscribe to `{brainA}/runs`. Part of the open front "cross-app subscription scopes". | Run-fact privacy across brains. |
| G6b | A personal brain's own machines: `IIdentityClient.MachinesOf` lists only circle-contributed machines; no API lists an account's bound devices. | "Storage across my devices" (persona 4). |
| G5b | Per-machine volumes need a neuron pinned to each machine (WindowsFacts is answerable only by that machine's silo with a windows connection). | M3. |
| UI1 | Only `chart` has a Flutter renderer; Tree/Graph/Map/Progress show "Not supported yet". | M3 device → volume tree. |
| G10b | External file changes (outside `IFileSystem.Write`) produce no signal without a watcher on the machine's silo. | "notes folder" wish. |
| T20-9b → **R144** | **Ruled 10:45 by the brain-as-data owner session ("Brain as data implementation (Task 14)"): option (b).** A machine that receives a reminder tick for a neuron whose part it does not hold drops it (no journal entry, no signal, a debug log with part + holder). One reminder table per brain stays (R61, R107). Also: `PartActivations.Release` deactivates the stateless activations tied to the part (e.g. TimerNeuron), not only `log.GrainIds`. Facts: "A tick for a part held by another machine is dropped", "After a release the new holder fires the next tick". The wt/reminder candidate (option c) is not merged. | wave 2b builder |

## Entries

| # | When | Kind | Source | What | Status |
|---|------|------|--------|------|--------|
| 1 | 08:33 | defect | orchestrator | Three empty files committed at the repo root (`DigitalBrain.Modules.Microsoft.Playwright.Tests.csproj`, `PageToolsFacts.cs`, `PlaywrightNeuronFacts.cs`) made `dotnet run digitalbrain.cs` load a broken csproj (MSB4025). | fixed b7bc1824b |
| 2 | 08:36 | defect | live boot | Every MCP call failed: `identity.principal.v2/owner` could not deserialize (`UnsupportedWireTypeException`) because 5d649969a changed `PrincipalState.Brains` from `string[]` to `BrainEntry[]` under the same `[Id(3)]`. A breaking authored-state reshape with no migrations (policy: breaking changes restart), so this AppHost's dev storage volume was wiped once. Not a derived-state wipe. | resolved (one-off wipe) |
| 3 | 08:40 | defect | live boot | On a fresh store `BrainRuntimeNeuron.ListeningUrl()` threw out of `Assign` because the brain was created before the silo listened; OS default `settings` logged "did not install" and no session started until the reconcile reminder. Fix: the session waits for the reminder instead of failing Assign. | in K1 builder (wt/k1) |
| 4 | 08:50 | defect | orchestrator | `FeatureCatalog` cached ./features at boot; `POST /apps/{name}/update` never saw edits on disk (the plan's redeploy rule assumed it did). | fixed 384c8cffa (seen live) |
| 5 | 08:45 | defect | live | `GET /shell/state` 500: the shell state key `shell-{digest}` lay outside every brain, so the part log had no owning account (since the OS silo became a Role=Own machine, 2026-10-10). Fix: key `{brain}/shell/{digest}`. | built (wt/shell), merged in main, awaiting restart + live check |
| 6 | 08:47 | defect | live restart | `OperatingSystem-a` exited at boot: first QUIC dial to `trust` failed "unreachable host" in `TrustDeployment.Load` at BecomeActive; MCP waited on it. Manual start succeeded. | in boot debugger (wt/boot) |
| 7 | 09:40 | defect | sweep: calculator, datavisualizer, selfimprove | **`BrainRuntimeNeuron` (`{brain}/runtime`) is a serialization hotspot**: `IBrainRuntimeEdge.Identity` timed out at 30 s (NonReentrancyQueueSize=14), an `IButton.Click` span took 13 s waiting on `INeuronObserver`, app requests took 7–30 s, and a signal whose live nudge times out is not delivered until the source publishes again; `SubscriptionGap` warnings on calculator keys. | wave 2 (after K1 merges, same file) |
| 8 | 09:40 | defect | sweep: datavisualizer | `Signal.Publisher.Name` is null in scripts: `NeuronId` (readonly record struct, get-only `Name`, no `[JsonConstructor]`) does not round-trip through the client's `JsonSerializerOptions.Web`. Synapses matching on publisher crashed (NRE). | wave 2 |
| 9 | 09:40 | defect | sweep: selfimprove | Two subscriptions from one behavior to the same (neuron, signal type) share one subscription id and one SingleReader channel; the second reader cancels the first (`OperationCanceledException`). Hits `Sources.Named`. | wave 2 |
| 10 | 09:40 | defect | sweep: datavisualizer | A behavior's subscribe to its own app table is refused (401 "A trusted brain and app caller is required"): the runtime's subscribe/Watch is not stamped with the behavior's caller (same root as gate SUB). `run-on-row*.cs` crash-loop. | wave 2 |
| 11 | 09:40 | defect | sweep: datavisualizer | Reminder ticks fail to journal when the reminder fires on a silo that does not hold the app's part (`ServiceUnavailableException: Part … is held by machine …`). | wave 2 |
| 12 | 09:40 | defect | sweep: datavisualizer | After an update the sandbox keeps reloading the replaced behavior's old hash (crash-loop interleaved with the new hash): a failed behavior is not retired on replace. | wave 2 |
| 13 | 09:40 | defect | sweep: settings | Installed `settings` has `origin = null` (it half-installed in the boot race, entry 3), so `/update` answers 409; the driver's fix went in through `WriteBehavior` (Edited). | after restart: delete + reinstall settings from the folder |
| 14 | 09:40 | defect | sweep: photocraft | `RouterNeuron.Best` trusts `SystemOneAnswer.Choice.Value` even when its probabilities contradict it, and throws "The System One model did not choose a capability" when the app tier answers "something else" although the second tier holds a match. | wave 2 |
| 15 | 09:40 | defect | sweep: photocraft | Every agent run warns "Agent usage flush failed": `IIntentUsageSink` is not registered in the OS. | wave 2 |
| 16 | 09:40 | defect | sweep: circleroom | `FeatureReconciler` returns early for circle brains, so a circle's shipped room never reaches the folder's version. | wave 2 |
| 17 | 09:40 | defect (minor) | sweep | `GET /apps/{name}` answers 200 with a blank draft for an app that is not installed; `CircleNeuron.InviteCopy` only checks brain-id syntax; an update retried at the same version appended a duplicate versions entry. | backlog |
| 18 | 09:40 | wish → gate | sweep: circleroom, circle | Birth a circle brain from the OS (HTTP/neuron over `IIdentityClient.CreateBrain(…, Circle)`); the requester's identity on `AppRequested`; a manifest brain-kind scope (circle-only apps). | gate (new contracts) |
| 19 | 09:40 | wish → gate | sweep: calculator | An app-private key/value state neuron needing no connection (calculator's dedup ledger lives in an `IText`). | gate (new contract) |
| 20 | 09:40 | wish → gate | sweep: files, settings, datavisualizer | A loopback/fake `windows` connection over a fixture folder; a credential-free way to emit `ConnectionsChanged`; a postgres connection for DataVisualizer `db`. | gate G14 |
| 21 | 09:40 | wish → gate | sweep: filmcraft, photocraft | A headless page driver when no shell is attached; Flutter renderer for `image`; the page tool ranked over the headless MCP tool. | gate (UI / open front) |
| 22 | 09:40 | wish → gate | sweep: selfimprove | `CandidateSnapshot` carries the worktree path; `ICandidates.Propose` takes an idempotency key. | gate (with G15) |
| 23 | 09:45 | defect (toolchain) | orchestrator | `csharp-ls` 0.28 runs on .NET 10: MSBuildLocator registers only SDK 10.0.401 while `global.json` pins 11.0.100-rc.1, so every workspace/document query is empty (also with `DOTNET_ROLL_FORWARD=Major`). Builders map with codegraph + text cross-check, and use warnings-as-errors builds as diagnostics. Needs a language server built for .NET 11 (newer csharp-ls or roslyn-ls). | open (user's toolchain) |
| 24 | 10:45 | defect (peer) | restart | The SV session's 9 new Aspire parameters were in user secrets as `Parameters:intochat-*`, but the AppHost resolves `Parameters:Modules-*`: every OS resource waited on ValueMissing. Placeholders set under the `Modules-*` names. | resolved |
| 25 | 11:05 | defect (peer) | restart | SV modules (Monnet, Twilio) activated index grains keyed by raw provider ids (`monnet.merchant-index/{merchantId}`, `twilio.account-index/{sid}`) from silo startup tasks: keys outside every brain → "has no owning account" → both OS silos exited at boot. Fixed by the SV session (deployment auth method, brain-scoped webhooks, no index grains). Latent same shape: `IGmailMailboxIndex` (raw email). | fixed by peer (11:15) |
| 26 | 11:17 | defect | orchestrator using the fast path | First live fast-path request ("when the calculator sum text changes, write the sum doubled…") was recorded Rejected in 2.5 s: "The model IDeepSeekV41Flash did not answer: Brain default has no owning account yet". `ModelAddress.Resolve` keys every model neuron `default`; `LlmNeuronBase` journals InferenceStarted/Completed into that key's part, which no brain owns on an owner machine. Affects the fast path, the Creator, GroupChat and scripts using `ILLM` "default". The fast path itself worked end to end: request recorded, job ran off-turn, rejection recorded in app state. | builder (wt/modelkey) |
| 27 | 11:16 | defect | orchestrator | `DELETE /brains/owner/apps/settings` answered 200, but a following `POST …/marketplace/os/settings/install` is refused "You already have an app named settings": delete does not clear the manifest, so an app cannot be reinstalled (the repair path for entry 13). | backlog |
| 28 | 11:30 | defect | verify:k1 skeptics (2/3 refuted) | `BehaviorRan`/`BehaviorSubscribed` Information logs never reach telemetry: ServiceDefaults sets the minimum level to Warning and the OS had no rule raising `DigitalBrain.Microsoft.CSharp.Runtime`. The fast-path metric reads "Running" from that log. Fix: OS `appsettings.json` `Logging:LogLevel:DigitalBrain.Microsoft.CSharp.Runtime = Information`. | fixed in main, live at next restart |
| 29 | 11:30 | defect (design) | verify:k1 skeptic | A synapse on the operation overload `brain.On(app, "op")` receives every `AppRequested` of its app and skips other operations client-side, but each skip is acked and counted as a Succeeded run, so run counts (and the fast path's history ranking) are inflated for multi-operation apps. Needs server-side operation filtering on the subscription or a "skipped" ack. | gate (subscription contract) |
| 30 | 11:30 | defect | verify:fastpath skeptic + rtA | `UsageGrain` (`usage/{brain}`) rewrites a 5,000-entry Recent ring on every `Add`; every metered cost queues there (0.1–5 s per Add). A fast-path request spent 20 s in node.place / ILedger.Charge / IUsageGrain.Add before reaching the model. | builder (wt/usagegrain) |
| 31 | 12:05 | wish (fast path) | customer round 1: trader | "when BTC drops 5 %, notify me" was **faked** instead of refused: notify.cs polls an IText nothing writes and starts an `IReminder` on key `reminder/owner/apps/assistant` (outside the brain, 401), crash-looping; it also detached the Assistant from its origin (rolled back to 1.7.10 content; still Edited). Fix: the writer must refuse when no installed contract supplies the trigger/data, and the prompt must state the brain-scoped key rule. | builder (wt/fpspeed) |
| 32 | 12:05 | wish (fast path) | customer round 1: notes, calculator, word nerd, forker | Sentences are written correctly but slowly under load: 33 s idle (30.8 s of it model reasoning: 4,875 reasoning vs 326 visible tokens), 86–635 s under concurrent load (metering queue, `Assign` timeouts, serialized model neuron per brain). Fork-first fired for the notes variant (base count-words.cs) but not for "copy my friend's word-count synapse" (base null). | builder (wt/fpspeed): reasoning cap, one metering record, parallel prep |
| 33 | 12:05 | defect | profiler | `LlmNeuronBase` is a non-reentrant neuron: every model call of a brain queues on `ai.llm.<model>/{brain}/models` through generation and metering (40–100 s queues under load). Interleaving `ILLM.Generate` is a contract attribute change. | gate-ish (contract attribute) |
| 34 | 12:05 | defect | profiler | `IBrainPrograms.Assign` recompiles every synapse of the app per write and uploads each assembly with 3 blob calls even when the content-addressed blob exists. | backlog (compile cache) |
| 35 | 14:50 | **defect (critical)** | verify-last skeptics | The owner brain's local part journal on OperatingSystem-a grew to 3,044,057,730 bytes during the run and was never trimmed (`PartJournal.TrimThrough` should drop entries once an accepted head covers them), and `PartJournal.ReadAll` uses `File.ReadAllBytes`, which fails above 2 GB: after the 14:46 restart every owner-brain activation failed ('The file is too long'), `/apps` 500, every fast-path request rejected. Recovered at 15:02 by moving the file aside (kept as `….log.oversized-20261011150237`, reversible); the part recovered from its last accepted head. Needs the brain-as-data owner: streaming read + why heads stopped covering the journal (placement flushes slow under load?). | open (brain-as-data owner) |
| 36 | 16:00 | defect | run 2 live | Marketplace/reconcile install persisted Origin only after the deploy answered: a 30 s Assign timeout left apps installed, Live, origin=null ("not installed from the Marketplace" on update). | fixed (Task I: origin+files written before the deploy; Deploying/Failed status; retry at same version) |
| 37 | 16:40 | defect | run 2 live | After delete+reinstall every Memory reindex failed: "ITable.Define 422: This app's storage has been retired" — Delete retired the table index and reinstall never reopened it. | fixed + seen live (Task T: IAppStorageHook.OnCreated → ITableIndex.Reopen; reindex 107 synapses on the final build) |
| 38 | 16:50 | **design** | run 2 live | Root cause of 35 live: owner/core's snapshot (~97 MB) never fits the mesh's 16 MiB per-shard cap; every flush retried it under the lock and only one small batch committed per failed snapshot. Backoff landed (Task A r2–3) so batches trim, but a core too large to snapshot means the segment chain and reopen replay grow without bound. Needs a split/chunked snapshot (HeadPayload change) or a smaller core. | open (user / brain-as-data owner) |
| 39 | 15:30 | defect | run 2 live | `app.cs`'s `App` class is not deployed with synapses, but the boot gate compiled bundles with it: make.cs passed boot and failed at install. | fixed (Task H r1 + Task Z: boot gate and FeatureCompileFacts compile only program files) |

## Progress

### 09:50 (1 h 20 m in)

**Done and verified live:** OS boots clean on fresh storage (all resources Healthy); `dotnet run digitalbrain.cs` fixed (b7bc1824b); features hot reload through `/update` (384c8cffa, seen live refusing a broken bundle and later deploying the sweep's fixes). Task 0 preflight answered (plan updated). App sweep, first pass (drivers + 3 skeptics each, ≥2 refutes sends back): word-count 3/3 passed; calculator 8/8; photocraft 7/7; settings 6/6 (+1 blocked G14); datavisualizer 8/10 (2 blocked); circle 4 passed / 2 blocked G13; files 1 passed / 4 blocked G14; selfimprove 2 passed / 5 blocked G15; filmcraft 2 passed / 1 blocked (needs a rendering shell); circleroom 1 blocked G13. No scenario has been refuted by 2+ skeptics so far.

**Built, awaiting the next restart + live verification:** shell state key inside the brain (entry 5), trust QUIC listener health check (entry 6), `IVectorIndex` + `FileWritten` (G4, G10), Memory M1. K1 run facts and the fast path are in review/build.

**Open:** the runtime throughput defect (entry 7) is the top OS-health item for wave 2, together with entries 8–16. Demo 2 (Tasks 6–9) is blocked by NG-1…NG-5. Gates waiting on the user: P1, G13–G16, NG-1…NG-5, K1b, SUB, G5b, G6b, UI1, G10b and the wish-gates 18–22.

### 11:40 (3 h 10 m in)

**Committed (verified live unless marked):** b7bc1824b root csproj; 384c8cffa features hot reload; fa89634fa shell state inside the brain; 94f15f30c trust QUIC health check (boot crash); 3b9f45a10 IVectorIndex (G4); f916aed49 sandbox stale reload; 3bab7d710 FileWritten (G10, *not seen live: G14*); 586a257a0 circle reconcile (*not seen live: G13*).

**Merged in the main tree, verified live, commit pending a buildable order:** agent streaming coalescing (3 ok), agent usage-sink removal (3 ok), NeuronId JSON (ok so far), router Best/"something else" (pending).

**Back to the build queue (2+ refutations):** K1 run facts (the Information run-fact logs were filtered by ServiceDefaults; fixed by an OS logging rule, re-verify after restart; counts, spans, cost subjects and the runs recorder all verified live); fast path (model calls keyed `default` outside every brain → model-key fix built; 20 s metering latency → UsageGrain fix building); Memory M1 (IsSynapse self-match; M2 in progress); R144 (part-logged grains' ticks are forwarded on the outgoing path; builder resumed).

**Built, in the next restart batch:** runtime throughput rework (rtA), shared subscription readers (rtB), router follow-ups (rtD), fast-path run history (rtE), model keys inside the brain. rtC (stamped subscribe) is being rebased onto rtA.

**Sweep repairs:** Assistant, Router and CustomerResearcher repairs still running (skeptic refutations). Wave 3 (Engineer app, Memory M2) building/driving live.

**Peers:** the SV-integrations session's wiring rides the OS (fixed its out-of-brain keys after it crashed boot twice); the brain-as-data owner ruled R144.

### Customer round 1 (12:05, Task 12 Step 2)

| Persona | Sentence | Outcome |
|---|---|---|
| 1 notes writer | count lines of a dropped file into my notes lines text | written (fork of count-words.cs), runs correctly ("3 lines"), **unmet on time**: 246 s |
| 2 trader | when BTC drops 5 %, notify me | **unmet: faked** instead of refused (ledger 31) |
| 3 student | Memory reindex/recall | not run (agent hit the API session limit) |
| 4 circle admin | storage across my devices | not run (session limit); gate G5/G6 anyway |
| 5 forker | copy my friend's word-count synapse | blocked: no fork lineage (S1) and no friend brain; a fresh write ran correctly ("4 words") |
| 6 calculator power user | sum above 100 → big, else small | **met** (alert.cs; "big" then "small"), but 220 s to Written |
| 7 word nerd | input reversed word by word into my mirror text | unmet on time (231 s) |

Triage did not run (session limit); the wishes above were triaged by the orchestrator.

### 14:35 (6 h 05 m in)

A usage limit stopped every agent at ~12:10; the run resumed at 14:32. The user committed the whole tree at 14:21 ("refactoring", 0ec2a323d), which carries every merged item not committed separately (fast path, runtime rework rtA, shared readers rtB, router rtD, run history rtE, model keys, usage grain, R144 rework, Memory M1/M2 partial, Engineer, the sweep's features edits). The OS was restarted on that HEAD for a final verification. Still building: the watch-renewal stall + rtC stamped subscribe (wt/rtC2) and the fast-path speed/refusal (wt/fpspeed).

### Final verification of HEAD (14:35–14:50, 3 skeptics per item)

| Item | Verdict | Evidence |
|---|---|---|
| R144 reminder drop (outgoing + incoming) | **3/3 confirmed** | OS-b drops every tick for a part OS-a holds before forwarding; OS-a runs its own reconcile once per minute |
| Usage/ledger coalescing | **2/3 confirmed** | client Add 0 ms, one write per burst, ring 500, no pricing timeouts; the storage write itself is still 1–6 s (ledger history unbounded) |
| Shared readers (rtB) + router follow-ups (rtD) | 1/1 confirmed (2 cut by the restart) | two readers of one (neuron, signal) both get batches; the asking app is not offered its own operations; Dispatch carries out the decided route |
| Engineer app | works live | ask classified in 2.2 s → fast path wrote length.cs (fork of digits.cs) in 7.2 s, ask-to-live 9.5 s; a missing app is Refused, a module request Blocked (NG-1..5) |
| Fast path | refuted (3/3) | single writes 6.8–8.7 s (fork-first, 1 attempt, 466 reasoning tokens), but concurrent writes hit Assign timeouts during the runtime stall and the rejection left no outcome tag; SynapseWritten log filtered |
| Runtime rework (rtA) | refuted (3/3) | warm round trips p50 45–61 ms, but the watch-renewal timer still held the runtime for 15–64 s under sustained load |
| Memory | refuted (2/2) | reindex/open/runs work on HEAD; recall runs a copy detached by persona fast-path writes (Edited), so HEAD's recall.cs never ran |

**Self-improvement round (built after customer round 1, merged 14:47, OS restarted):** honest REFUSE rejections + brain-scoped key rule in the fast-path prompt; reasoning capped (none, 2000 tokens); metering records sent together; embed once + parallel prep; Apps logs at Information; runtime watch renewal in per-source lanes off the turn (fact: a hanging source holds nothing); runtime.batch span parented to its batch; behaviors' watches stamped with the program's caller (rtC). Unit: Apps 210/210, AI 194/194, CSharp 179/180 (load-sensitive RuleJudging fact), OS 34/34.

### 15:05 — end of run (6 h 35 m)

After the journal was moved aside: the honest refusal was seen live ('Refused, no contract: no contract publishes BTC prices or price-change signals'), a sentence was Written in 27.9 s just after the restart, and earlier in the run single writes reached 6.8–8.7 s. Committed: c0cf9b019 (fast-path refusal + speed), 4958cadea (runtime renewal lanes, span parent, stamped watches; not yet seen live under load), 593dc4caa (OS facts). The scenario table is `docs/superpowers/loop/scenarios.md` (63 passed live, 25 blocked on gates, 4 refuted and awaiting repair; Engineer works live; Memory's installed copy is detached). Open gates and defects are above; the next run should start with ledger 35 (journal trim), ledger 29 (skipped requests counted as runs) and the fast path's concurrent-write telemetry gap.

### Run 2 (2026-10-11 15:00–17:00, orchestrated with parallel builders in worktrees; SDD ledger `.superpowers/sdd/2026-10-11-forking-loop-mvp/progress.md`)

**Fixed and seen live:** 27 (delete then reinstall; root cause `PartGrainStorage.ClearStateAsync` kept in-memory state), 17a/b/c, 29 (skipped requests are not runs; counts sane live), 30 (LedgerGrain bounded window), 33 (a brain's model calls interleave), 34 (compile cache + blob Exists), 36, 37 (needs the final build), fast-path concurrency (deploy staged by the writer outside the app turn, idempotent ticketed Assign, Unsettled outcome): 3 overlapping calculator sentences → all Written in 4.9–5.3 s, settled in 10 s, synapses ran (sum 25 → roots 5.00). Task 5 (Assistant `make`) built and seen live (scratch synapse Written in 18 s). Journal (35): streaming read past 2 GB, physical trim, oversized-change refusal, snapshot backoff; live growth 43→207 MB in 35 min on the previous build — re-measure on the final build.
**Scenario table:** router ×2 and assistant ×2 refuted → passed live; Memory recall ran from shipped code (word-ranked; reindex blocked by 37 until the final build). Totals: 67 passed, 25 blocked (gates), 0 refuted.
**Open for the user:** 38 (core snapshot size), the gates P1/G13–G16/NG-1…5, SignalDeliveries + InternalsVisibleTo from the vocabulary ring (pinned by an Architecture fact; belongs to the "cross-app subscription scopes" front), toolchain 23.

### Run 3 (2026-10-12, report-only)

**Premise check.** A briefing re-issued the run-2 work list assuming HEAD was `4958cadea`; the branch is
**102 commits past it** (HEAD `60556d927`), all Flame/brain-view/Ino work. The forking loop's own work
(entries 27–39, the run-2 SDD ledger) was already committed and its final review was clean at 18:00:14.
By the user's ruling this run is **report + ledger only**: no code edits, no AppHost start/stop, no bench.
A **peer session is live on the OS** (5080/5081; listener PID changed 172076→70784; `/health` and
`/brains/owner/apps` time out), so nothing was driven or restarted. The Aspire MCP sees the AppHost
(`DigitalBrain.AppHost.csproj`, pid 101380) but reports no healthy resources.

**Verified from the tree (not re-driven live):** the owner journal is 89,465 bytes (the 3.0 GB file is the
kept `.log.oversized-20261011150237` evidence) — ledger 35 closed. Final regression on `fc81d8eba`:
Platform 464/464, Apps 229/229, Client 31/31, CSharp 188/189 (`SubscriptionCallerFacts` flake, on base too),
Architecture 50/56 (6 pre-existing). Scenario table: **68/93 passed live, 25 blocked on gates, 0 refuted**
(file states 67/25/0). Re-attach-to-origin exists as `IApp.SaveToSource` (`AppNeuron.cs:411`).

**Not recorded anywhere:** the fast-path p50/p95 and first-try compile rate (plan Task 4 Step 5). Observed
live in run 2: 3 overlapping writes 4853 / 4931 / 5289 ms, each 1 attempt (settled ≤10 s); single quiet
writes 18.3 s (Assistant `make`) and 27.9 s; one pre-B3 rejection at 35 s. Measuring this needs an idle OS
and it mutates shipped apps (marks them Edited) — deferred.

**Still open for the user (unchanged):** ledger 38 (core snapshot too large for the 16 MiB shard cap — needs
a split/chunked `HeadPayload` or a smaller core), the gates P1 / G13–G16 / NG-1…NG-5 / K1b / SUB / G5b /
G6b / UI1 / G10b, toolchain 23, and the cross-app-subscription-scopes front (SignalDeliveries + IVT).

### Run 3 continued (2026-10-12) — ledger 38 build

Plan `docs/superpowers/plans/2026-10-12-ledger-38-core-snapshot.md`. Ruled: D3 accept a wipe, D4 8 MiB +
signals, D5 no sweep exists, D2 recommended. Root cause confirmed by Task 0 (the live owner core was reset,
so the 97 MB is not reproducible; the only unbounded core structure is `kernel.instances`).

**Fix B built (unit-verified, not seen live, not committed):** snapshots are inline while small and chunked
above `PartsOptions.SnapshotChunkBytes` (default 8 MiB); the head still names one `MeshRef` to a
`PartSnapshotIndex` whose `RecordChunks`/`SignalChunks` carry the rest; `Replay`/`Discard`/`Reached`/
`WhileReached` and the auditor are chunk-aware. Files: `PartLogModel.cs`, `PartLog.cs`, `PartsOptions.cs`,
`PartSnapshotFacts.cs`, `MeshAuditorFacts.cs` (+ the Task 0 `MachinePartEndpoints.cs`/`MachinePartEndpointFacts.cs`).
Platform targeted 117/117; full Platform 469/472 (2 pre-existing load flakes).

**Fix A — A1 refuted, A4 built:** A1 (register on activation, retire on deactivation) broke the directory's
durable-catalog contract — `CSharpFileListingFacts.AFileKeepsItsName…TheKernelListsItUntilDeleted` requires a
deactivated `ICSharpFile` to stay listed until deleted (apps likewise for `/apps`/Memory), so A1 was reverted.
**A4 (ruled):** `InstanceDirectoryOptions.Limit` (default 4096); when a `{brain}/{type}` directory exceeds it,
`Register` drops the oldest entries that are not currently active — ephemeral neurons cannot accumulate while
active instances and small catalogued types are untouched. Framework 144/144, CSharp 189/189; Platform's
full-suite failures remain the known Identity/Connections/PartLease load flakes (each passes alone).

**Commits:** `3cd098fa1` (summary route), Fix B (in peer commit `8a182754f` — a shared-index race swept the
staged files into that session's commit before mine ran), `1a5f1a700` (A4), and `4a1d9fe77` (plan/ledger).
Fix B and A4 are **unit-verified, not seen live**.
