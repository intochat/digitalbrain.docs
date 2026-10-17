# Composition ownership and convergent UI rebuilding

The main source of complexity is the missing ownership boundary between authoritative input state and derived UI state: rebuilding a presentation can change the user's state and trigger the behavior that rebuilt it.

Date: 2026-10-12.
Status: Draft for review and revision. Writing this document is authorized; implementation and commits are not included.
Investigated baseline: `2d8bb69ca383173ae73a9e23dc5c7b62c4ce6a3d`.

Recommendation: refactor existing mutation and composition mechanisms before continuing the remaining checklist. Preserve the current workspace and typed-neuron hosting model. Do not introduce an app-readiness coordinator or restrict presentation to one instance per app.

## Purpose and product requirements

The intended product remains one coherent workspace for Ino, Assistant, Files, ordinary apps, and Creator-generated apps:

- Shared theme colors, spacing, controls, typography, and motion defaults.
- C# behaviors owning domain logic through neurons and signals.
- Multiple parallel activities and independently hosted documents without completion stealing focus.
- Contextual controls and visible relevant connections.
- Clear storage → folder → document navigation.
- Explicit, durable Mark read; viewing and reconnecting never acknowledge implicitly.
- Generated apps that actually work after compilation and publication.

Preserve Neuron, Signal, Behavior, and Connector; kernel-stamped provenance; compile-as-publish-gate; neuron-owned durable state; whole derived-state rebuilds; concrete arrays in grain state; and no self-calls on non-reentrant grains.

This is a diagnosis and proposed architecture, not an executable implementation plan. Open decisions below are intentional review questions, not permission to improvise during implementation.

## Evidence and document precedence

Three independent investigations covered ownership/lifecycle, Creator/composition, and connector/runtime guarantees. Their conclusions were challenged against actual source. C# and Dart LSP navigation was used; runtime-bound feature scripts and saved generated bundles were inspected directly.

No new runtime verification was performed during this investigation. Source findings, historical runtime observations, and inferences are distinguished below. Passing tests are not evidence that an abstraction is sound.

Relevant documents:

- [Earlier presentation hosting design](2026-10-12-presentation-hosting-design.md).
- [Earlier presentation hosting plan](../plans/2026-10-12-presentation-hosting.md).
- [Superseding workspace design](2026-10-12-workspace-design-system.md).
- [Workspace implementation and acceptance ledger](../plans/2026-10-12-workspace-design-system.md).
- [Creator live acceptance](../reviews/2026-10-12-creator-live-acceptance.md).
- [Saved Creator programs and failure evidence](../reviews/2026-10-12-creator-evidence).

The later workspace design explicitly supersedes the earlier app-readiness coordinator. The baseline already uses manifest entries and workspace-owned typed roots. The earlier proposal's competing top-level hosting paths and preparation protocol must not be treated as the current implementation or as an unquestioned remaining checklist.

Source line references below describe the investigated baseline and may move after edits. Paths are repository-relative.

## 1. Strongest evidence and failing flow

### Generated colour picker

Source-verified: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Select/SelectNeuron.cs:11–20` implements `Set(label, options, selected)` by replacing configuration and selection, advancing revision unconditionally, and emitting `SelectChanged`. `Choose` at lines 22–31 emits the same signal.

The saved generated app follows this cycle:

1. Creator generates the app; it compiles and reaches Live.
2. Startup calls `select.Set`.
3. The generated `SelectChanged` reaction calls `select.Set` on its own source.
4. That write emits another signal, indefinitely.
5. Choosing green changes the value but does not stop the cycle.

Historical runtime evidence: the acceptance report, line 19, records select revision 788 before user input, then 1097, with note version 1104 and hundreds of behavior executions. The exact program is preserved in `docs/superpowers/reviews/2026-10-12-creator-evidence/creator-matrix-colour-choice-result.json`. The disposable app was deleted to stop the loop; it was not converted into a passing case.

The corrective generation also compiled, but generated only an `AppRequested` handler. The declared surface stayed uninitialized until ask. Choosing blue then left the note Red. This is recorded at acceptance line 27 and in `creator-matrix-colour-repaired-result.json`. Better mutation semantics cannot invent an omitted reaction, and a readiness coordinator would not supply it either.

### Files filter and preview

Source-verified:

- `features/os/Files/filter.cs:9–12` translates every `TextFieldChanged`, including programmatic clearing, into another browse or read request.
- `features/os/Files/machine.cs:82–87` writes navigation before clearing the filter specifically because the clear emits another signal.
- The same file, lines 138–144, separately writes listing, navigation, and preview.

Historical runtime evidence: workspace ledger line 151 records a cross-folder read whose programmatic filter clear caused a refresh to erase the selected document. The current baseline contains the mitigation: navigation retains the actual document so refresh can reconstruct it. The investigation did not reproduce a remaining race; residual interleaving concerns are inferences.

This is the same architectural pressure in hand-written code: a projection-related change becomes a new domain operation, and correctness depends on ordering the writes around that feedback.

## 2. Causal chain and limits of the diagnosis

One setter changes configuration and semantic state → broad change signals are interpreted as input → behaviors issue more mutations → mutations generate further reactions → startup and recovery repeat the sequence.

| Recurring failure | Immediate cause | Architectural implication |
|---|---|---|
| Stale expected revisions | Generated two-note composition repeatedly used revision zero | Every projection author must manually coordinate ordinary read/write concurrency |
| Self-triggering loops | A handler rewrites its observed source; identical writes still publish | Recomposition is not convergent |
| Startup resets | Configuration overwrites existing selection | Initialization and intentional state changes share an API |
| Empty initial presentation | Composition exists only inside a request handler | Initial and subsequent composition are separate obligations |
| Missing reactions | A required dependency was never generated | Compilation checks compatibility and shape, not completeness against the spec |
| Preview loss | A field update is interpreted as navigation | Presentation changes acquire domain authority |

The two-note revision failure is documented at Creator acceptance line 17. Its subsequent explicit repair passed; that is a repaired result, not a fresh-generation pass.

`src/DigitalBrain/Kernel/Reaction.cs:13–15` already implements initial rebuilding after registration and subsequent coalesced rebuilding. A new projection lifecycle is unnecessary. Simply adopting React is insufficient if its rebuild rewrites authoritative inputs or publishes unchanged state.

This diagnosis does not explain every defect. The earlier HTTP/2 transport failure is separate. Equal-write suppression does not prevent alternating-value cycles. Simpler contracts do not prove model fidelity, supply missing reactions, or make arbitrary C# correct.

## 3. What the current architecture gets right and wrong

### Preserve the existing boundaries

- Workspace owns remote membership, focus, Home, and Companion through `WorkspaceNeuron.Open/Focus/Close/Configure`.
- `app/core/lib/src/ui_client.dart:286–313` opens the manifest's typed Entry directly; ordinary shell opening no longer invokes `Request("open")`.
- Typed roots support separate documents from one app. The ledger records Alpha/Beta hosting and reconnect preservation; app-only hosting would remove this capability.
- Closing changes workspace membership; it does not inherently stop domain work. Completion can update content without reopening or focusing it.
- Neuron-owned data survives disposable script processes and connector remounts.
- Shared Flutter theme, rendering, and motion are connector responsibilities.
- Compilation remains the publication gate, without being a semantic success certificate.

Explicit unread is a positive ownership example. `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Chat/ChatNeuron.cs:73–108` validates the stamped person and exact observed content before recording receipts, and derives unread on Read without acknowledging it. Keep receipts independent of focus, projection, viewport visibility, and reconnect. Historical acceptance includes live HTTP/watch evidence and real-grain persistence tests, not a separate live restart after acknowledgment. Unpruned receipt growth remains a tradeoff.

### Refactor the composition burden

Ordinary composition currently must preserve inputs, distinguish initialization from reset, avoid writing observed sources, compare definitions, manage revisions, and recover after interruption. These rules are repeatedly reconstructed in first-party and generated behavior code.

The app is the program, installation, and distribution boundary. It should not be the exclusive presentation unit. A typed neuron root is the presentation target; an app manifest supplies a convenient default.

## 4. Alternatives

| Option | Benefit | Cost and limitation | Recommendation |
|---|---|---|---|
| A. Continue patching | Small immediate changes; individual failures can be repaired | Every app relearns initialization, revision, and feedback rules; prompt repairs remain unreliable | Use for isolated defects after foundational changes |
| B. Refactor existing mechanisms | Removes accidental feedback and resets at their source; reuses existing vocabulary and recovery | Contract/caller changes and explicit ownership decisions | Recommended |
| C. Change the central abstraction | Could constrain presentation construction more strongly | App-only hosting loses documents; a new DSL/runtime adds another authoring system | Not justified by current evidence |

Do not combine all proposed improvements into a larger architecture. First test whether a small change to ownership and mutation semantics removes the recurring coordination burden.

## 5. Proposed ownership and contract semantics

### One owner for each semantic value

| Responsibility | Owner |
|---|---|
| Open entries, focus, Home, Companion | Workspace neuron |
| Default entry discovery | App manifest |
| Conversation and domain results | Existing domain neurons |
| Simple standalone picker selection | Select neuron |
| Domain-backed selection | Domain neuron; the control is a projection |
| Files location/document | Existing navigation state |
| Files filter value | Existing filter neuron |
| Files listing, breadcrumbs, preview | Derived UI state |
| Explicit read receipts | Chat neuron |
| Initial and subsequent projection | Same behavior rebuild |
| Theme, motion interpolation, frame scheduling, GPU resources | Flutter connector |

Do not copy a legitimate control-owned value into a new aggregate merely to claim one owner. Conversely, a domain-backed control must not become a second writable authority for the same value.

### Configuration must preserve input

Proposed replacement for selection-bearing `ISelect.Set`: configuration supplies label, options, and an initialization default while preserving valid current selection. `Choose` remains the explicit selection transition, including deliberate programmatic reset.

The exact signature is a review decision, not implemented API. Before implementation, settle initialization versus an intentionally empty selection and the fallback when options remove the selected value. A repeated configuration with unchanged inputs must not reset the user's selection.

### Derived writes must converge

An accepted write whose normalized derived content equals current content does not advance revision or publish another signal. Define structural equality for each affected contract, including arrays.

Preserve concurrency protection for actual competing edits. Do not globally remove expected revisions or substitute last-writer-wins. Decide explicitly whether stale revisions remain errors even when the payload happens to equal current content; do not silently change that contract under an equality optimization.

Stable surface membership does not need rewriting when a referenced text child changes. Update the child. Use existing React for derived rebuilding and existing On-with-registration-callback recovery for command consumers. A command handler and a coalesced projection are not interchangeable.

### Files composition

Retain `/navigation` as the authoritative location/document pointer and `/filter` as the authoritative filter value. Listing selection, breadcrumbs, and preview are projections.

Split `Machine.Browse` responsibilities:

- Navigation mutation changes the location and applies the deliberate clear-filter policy.
- Projection reads current navigation/filter, rebuilds outputs, and never writes its observed inputs.

Remove the filter reaction's inference of a new browse/read action. A refresh is invalidation, not navigation.

One composition writer is the target. A shared helper called by two independent reactions does not establish serialization. The implementation design must prove either consolidation through the existing app operation stream, or safe typed invalidation/concurrency handling. If a refresh request is used, it must not reissue navigation or repeat external effects.

Do not assume `React<Signal>(Sources.Of(navigation, filter), ...)` works. `SessionSignalSubscription.cs:26` registers a concrete type name; `BrainRuntimeNeuron.cs:594` matches the exact signal type name. Mixed `TextChanged`/`TextFieldChanged` subscriptions require an explicit supported design. No new heterogeneous API is approved here.

### Readiness and replacement

Manifest Entry is a locator, not proof that the current assignment composed meaningful content. First use existing root state to expose uninitialized/error conditions and preserve legitimate empty content. Do not add preparation receipts or a root-publication lifecycle by default.

Preserve explicit document references across app updates. For the catalog shortcut, `openApp` uses a stable app/window ID while `WorkspaceNeuron.Open` refuses rebinding an existing ID to a different root. A changed manifest entry therefore suggests a reopen conflict; this is an untested source inference. Stable root identity is the preferred policy; relocation needs an explicit decision.

Stale content, a relocated default entry, and proof that a current execution produced a result are distinct requirements.

### Classification under the four concepts

Projection is derived neuron state maintained by a Behavior. Entry is a typed neuron reference. Receipt is durable neuron state. Theme and interpolation are Connector implementation. None is a fifth runtime object. No new manager, registry, coordinator, or DSL is proposed.

## 6. Before and after flows

| Flow | Current baseline | Proposed direction |
|---|---|---|
| Ino | Startup and reactions compose a scene; workspace hosts Home | Preserve hosting; share initial/subsequent convergent projection |
| Assistant | Durable conversation and receipts; some manual definition comparisons | Preserve ownership; move reusable equality/preservation rules into component contracts |
| Files | Browse/read writes several neurons; filter changes can schedule another browse/read | Navigation changes location; filtering invalidates projection; one writer rebuilds current location |
| Generated picker | Startup can reset red; reaction may rewrite its source or be missing | Configure preserves selection; Choose changes it; React reads selection and writes only dependent note |
| Independent documents | Typed roots can be hosted separately | Preserve independent roots and membership |
| Close during work | Workspace closes entry; work may continue | Completion updates content only |
| Reconnect | Connector rereads snapshots and watches | No implicit open, initialization, or acknowledgment |
| Program replacement | Program changes while neuron data remains | Rebuild retained data with stable roots; test stale execution separately |

## 7. Refactorings and deletions

| Files or symbols | Proposed change |
|---|---|
| Flutter Contracts `ISelect`; Flutter `Select/SelectNeuron.cs` | Replace conflated configuration/selection Set semantics; retain explicit Choose |
| Flutter `Surface/SurfaceNeuron.cs`, `Text/TextNeuron.cs` and affected contracts | Centralize unchanged-write suppression with explicit concurrency semantics |
| `features/os/Files/machine.cs`, `filter.cs` and operation reactions | Separate navigation from projection; remove filter-driven browse/read inference and associated ordering workaround |
| First-party composition behaviors | Consolidate startup/event rebuilding; remove unchanged container writes and obsolete open-as-preparation paths after mapping callers |
| Apps `Authoring/AgentPrompts.cs`; CSharp `Authoring/CSharpScriptSandbox.cs` | Align examples with the simplified contracts; remove conflicting open-as-composition guidance |
| Apps `Creator`, `AppNeuron.CompleteBuild` | Preserve exact-final-bundle checking; distinguish deployment status from runtime acceptance |
| Flutter `application_surface.dart` and `stage_view.dart` callers | Audit residual mount-triggered work; remove only after establishing actual use and replacement |

Abandon as default responses to these failures:

- Runtime root publication, preparation/retry receipts, and an app-readiness coordinator.
- One-instance-per-app conversion of independent document hosting.
- Prompt clauses as the primary remedy.
- Surface rewrites for unchanged membership whenever children change.
- A second event-handler lifecycle for generated apps.
- An animation architecture rewrite based on the present short profiling samples.

## 8. Runtime guarantees and remaining limits

### Execution identity

Source-verified: CSharp `Edge/RuntimeEdge.cs:35–39` authenticates session plus behavior name; `Runtime/BrainRuntimeNeuron.cs:287–290` resolves the current assignment by name. This does not establish the generation of the calling execution. No exploit was reproduced.

Run-token tightening is required before claiming superseded executions cannot mutate state. It is not a prerequisite for static Entry discovery and read-only hosting. The older runtime-published readiness proposal created that dependency by promising assignment-certified output. Keep the runtime identity design separate rather than smuggling it into presentation work.

### Delivery and persistence

Durable subscriptions and recovery do not make effects exactly once. Effects that must deduplicate need neuron-owned idempotence/receipts.

`SourceSet.cs:77–82` pumps source streams into a process-local channel; `SessionSignalSubscription.cs:45–51` acknowledges after its consumer advances. The pump can therefore advance ahead of a final merged-stream handler. This source-level observation supports using coalesced streams for state rebuilding, not assuming they are durable command queues. React's initial rebuild helps because its inputs are durable state.

`src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs:95–108` attaches signals to storage writes where the provider consumes them; its fallback appends afterward. Universal atomic-notification claims require verification of the actual configured storage path.

Connector watches are invalidation streams. `NeuronsService.cs:46` uses bounded DropOldest buffering. Rereading authoritative state is appropriate; reconstructing every business event from that stream is not. Current workspace SSE already registers before reading its snapshot, unlike the stale description in the older plan.

### Rendering and profiling

Semantic scene state belongs in neurons. Interpolation position, opacity progress, frame scheduling, GPU resources, and connector loading flags are disposable rendering state. Existing stable child identities and motion components should be retained.

[Profile evidence](../../../artifacts/workspace-live-2026-10-12/motion-profile-summary.json) contains short Windows profile-mode samples on a Ryzen 9950X3D:

| Scenario | UI frames | UI p95 | UI max |
|---|---:|---:|---:|
| Home to Files | 24 | 8.911 ms | 13.301 ms |
| Files to Home | 108 | 6.986 ms | 8.425 ms |
| Rapid focus | 91 | 13.997 ms | 19.292 ms |

One retained rapid-focus frame exceeded 16.67 ms. Reduced-motion capture mostly retained the navigation tail; it does not establish a complete-transition speedup. Foreground status was not independently observed. These are not sustained benchmarks or dropped-frame measurements. Earlier debug warm-up captures were not transition benchmarks; later profile data supersedes that limitation only for its captured samples.

## 9. Grilling questions for review

1. **Is this only incorrect generated code?** Recommended answer: incorrect code exposes contracts that make routine recomposition hazardous; fix the primitive and examples. Strongest counterargument: arbitrary C# can always cycle or omit behavior.
2. **Should every control own its semantic value?** Recommended answer: no; choose standalone control ownership or domain ownership explicitly. Counterargument: those cases may need different APIs.
3. **Does equality suppression solve feedback?** Recommended answer: only identical updates; projection must also avoid mutating its inputs. Counterargument: structural equality has cost and normalization semantics.
4. **Should expected revisions disappear?** Recommended answer: not globally; first remove redundant writes and prove one composition writer. Counterargument: a narrower owner-authorized replacement API might reduce remaining authoring burden.
5. **Is app readiness needed?** Recommended answer: observable uninitialized/error states are needed; a new lifecycle has not earned its cost. Counterargument: a genuinely atomic multi-neuron presentation switch may require stronger semantics.
6. **Does Files need a new state record?** Recommended answer: retain existing navigation and filter owners initially. Counterargument: atomic location/filter invariants across crashes could justify consolidation later.
7. **Does at-least-once delivery make recovery safe?** Recommended answer: only with appropriate idempotence and durable-state recovery. Counterargument: the remaining authoring burden may still be too large.
8. **Must run-token work come first?** Recommended answer: before stale-writer exclusion claims, yes; before this composition refactor, no. Counterargument: strict replacement correctness remains incomplete until it is resolved.
9. **What disproves the recommendation?** Recommended answer: the minimal acyclic app still needs equivalent lifecycle coordination, or failures remain dominated by omitted reactions. Counterargument: one successful slice proves feasibility, not Creator reliability.

Additional decisions to settle before implementation: removed-option/default policy; intentionally empty selection; stale revision with equal payload; Files projection serialization and refresh delivery; default-entry relocation; and the exact visible representation of uninitialized/error roots. No implementation API or guarantee for these is finalized by this draft.

## 10. Falsifying vertical slice

Generate a fresh colour picker with a derived note through Creator. Host it alongside Files and an active Assistant conversation.

Acceptance:

1. Initial content appears without an unrelated ask.
2. Blue remains selected after repeated configuration and script-cache restart.
3. The note converges to Blue.
4. Identical rebuilding stops advancing revisions and generating executions.
5. Duplicate invalidations do not repeat semantic actions.
6. Closing, reopening, and reconnecting preserve state without stealing focus.
7. Assistant completion remains reachable and unread until explicit Mark read.
8. Ordinary program replacement preserves data and stable root identity.
9. A delayed superseded execution is tested separately; its result is not inferred from successful presentation recovery.
10. A missing-reaction negative control fails acceptance despite successful compilation.

Inspect real neuron state, connector output, and matching traces/logs. Follow CLAUDE.md's Healthy-resource and runtime verification requirements. Use module contract tests, not per-app tests, for reusable semantics.

Report first-attempt generation and repairs separately. Do not hand-repair a generated app and count it as a fresh pass. Preserve failures, including the historical selection failures and the explicit repair required by two-notes.

Falsification: if this requires a preparation coordinator, duplicate semantic state, or substantial manual revision/recovery choreography throughout generated code, the proposed simplification is insufficient.

## 11. Ordered work after review

1. **Foundational decisions:** settle the review questions and explicitly retire the superseded readiness/app-only direction.
2. **Shared contract refactoring:** start with Select, Text, and Surface; preserve provenance, appropriate concurrency, arrays, and non-reentrant safety.
3. **Falsifying slice:** prove the generated picker through real neurons and rendering before expanding the refactor.
4. **Files:** remove navigation inferred from filter changes; establish composition ownership; preserve storage/folder/document semantics and contextual connections.
5. **First-party integration:** apply the same discipline to Ino, Assistant, and ordinary apps; preserve parallel documents and unread receipts.
6. **Creator correctness:** align examples and discovery; retain exact-final-program compilation; repeat uppercase/two-note/selection acceptance with separate fresh and repaired outcomes.
7. **Recovery and concurrency:** module unit/E2E suites, C#/Dart LSP, per-project builds, Flutter checks, and live duplicate-delivery, registration, reactivation, cache-restart, reconnect, close-during-work, and concurrent-client scenarios. Decide and test root relocation.
8. **Separate runtime guarantees:** design execution-bound identity before claiming stale-run exclusion; verify notification durability on configured storage and command acknowledgment assumptions.
9. **Visual polish:** real-shell wide/narrow flows, shared theme/spacing/controls, contextual actions, unread access, reduced motion, and interrupted transitions.
10. **Performance verification:** complete sustained transition/reconnect captures, frame pacing, and representative hardware before optimization.

Implementation starts only after this draft is revised and the concrete architecture is reviewed. The immediate next action is editing this spec together.

## 12. Ino and Assistant routing and performance

This follow-up records source inspection and limited live measurements on 2026-10-12. The first implementation slice is now recorded in `2026-10-12-assistant-path-benchmark.md`: Assistant 1.9.4 corrects workspace prompt guidance and an 18-turn baseline compares composer and send. The other proposals below remain unimplemented; no routing change or measured before/after improvement is claimed.

### Ino is presence and observation

Ino does not select tools, route messages, or run a language model. `features/os/Ino/Ino.cs` composes the home scene, presence state machine, and activity ring. Its behaviors observe:

- Router `Routed` facts, which fire the thinking transition (`presence-routed.cs`).
- The selected Assistant conversation's turn start, completion, and failure (`presence-turn-started.cs`, `presence-turn.cs`, `presence-turn-failed.cs`).
- `BehaviorRan` facts, which rebuild a bounded six-app activity ring, excluding Ino's own runs and skipped outcomes (`presence-ran.cs`).

Conversation subscriptions follow Assistant's durable conversation pointer through `Sources.Named` (`Ino.cs:20–25`). Scene state is durable; Flutter performs the animation. Ino never owns workspace focus.

This also limits the meaning of the animation: the current thinking transition reacts to a completed routing decision, not router-start. It is a display derived from several signals, not an authoritative task lifecycle. Do not infer backend progress or routing latency from the sphere's mood.

### Assistant has two different entry paths

**Composer submission:** `features/os/Assistant/submissions.cs:14–43` reconciles durable pending submissions and starts `IAgent` directly, under the submission ID. It does not call the Jev router. The agent receives conversation history, the system prompt, and the allowed contract surface.

**App send operation:** `features/os/Assistant/send.cs` routes messages of at most 2,000 characters through `IRouter.Ask`; longer messages go directly to the agent. `routed.cs` carries the result, using a configurable confidence gate (default 0.8) and `IsDirect`. It opens a named app through its manifest entry only when the other guards pass. Non-open app operations are handed to the agent to fill their input. Failed, uncertain, self-targeting, or unaccepted routes fall back to the agent with a hint.

Therefore optimizing Jev does not automatically accelerate normal composer conversations. Unifying the two admission policies is a product decision; do not put the router in front of every composer message merely for consistency.

### How capability choice works

`src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs:122–157` enumerates installed apps, reads their manifests, and offers operation descriptions as a multiple-choice question to System One. If that tier does not select an app, `Decide` can ask separate capability and method questions. It is model-based classification, not vector nearest-neighbor routing. App snapshots are currently read sequentially while preparing that menu.

The local System One service is an adapter over a chat model, not the hosted Jev implementation. `src/DigitalBrain.Modules/AI/systemone-adapter/server.py` sends the state and choice menu to an OpenAI-compatible backend and parses generated JSON probabilities. The live probe returned model `llama3.1`. Those probabilities are model-produced estimates, not demonstrated calibration or authorization.

The agent takes a different route. `Agents/AgentTurnLoop.cs:55–56` creates a restricted neuron surface; `Agents/ContractActions.cs` exposes context, list, search, get, and call tools. The language model decides which tool calls to request, receives their results, and continues until it answers or reaches its budget. Calls within a returned tool batch are executed sequentially with persisted start/result events.

`src/DigitalBrain.Framework/DigitalBrain.Framework/Contracts/NeuronTypeSearch.cs:40–58` implements capability discovery. When an embedding generator is available it ranks cached entry vectors by cosine similarity against an embedded query. Otherwise it uses word matches. This inspected implementation does not query Qdrant for capability ranking. The live owner MCP probes returned integer word-match scores (3, 2, 1), establishing the lexical path for those requests, not for every process or possible deployment.

Vector search retrieves candidates; it does not itself decide whether to execute them. Caller restrictions and neuron authorization remain mandatory regardless of ranking.

### Limited live performance baseline

Aspire reported the running resources Healthy. MCP context confirmed owner/owner. No conversation submission, workspace change, or app operation was issued by these probes. The System One probe directly exercised the local classification endpoint and did not dispatch its result.

| Probe | Observed client wall time | Scope |
|---|---|---|
| `neurons_search("list files folders")`, three sequential samples | 17.8, 30.7, 30.9 ms | MCP discovery, not a full Assistant turn |
| Local System One, first observed three-option `Open Files` classification | 6,418.1 ms | Small adapter request, not the full app menu or router pipeline |
| Identical classification repeated | 598.3, 381.1 ms | Same request; warm/cache effects may apply |

All three classification samples returned `files.open`, confidence 0.8, with 242 input and 47 output tokens. The menu contained files.open, assistant.send, and something else. The first sample was not a controlled cold start. The improvement on repetition does not distinguish model residency, prompt caching, backend load, or another cause. These are three samples, not percentiles or a sustained benchmark.

Search traces `6a4f3b3361cf94f5329591a8ed3c85a1`, `4c9c0b084c07298f5c770af4cdfe6f46`, and `1a8b89d144ce7e9429c1b88e35b7709e` showed successful search tool spans around 12, 3, and 3 ms respectively. Client wall time includes transport overhead.

Read-only inspection of the selected conversation found two retained completed turns using `deepseek/deepseek-v4.1-flash`, lasting approximately 1.37 and 8.72 seconds, both without tool calls. These were existing, different turns, not controlled new benchmarks. They cannot establish typical latency or attribute time to routing.

### Proposed performance order

1. **Correct stale tool guidance — completed.** Assistant 1.9.4 uses `IWorkspace.Open`, its current argument shape, and the actual Data Visualizer view surface/window. Live form verification used `Open` successfully. No before/after latency saving is claimed.
2. **Measure whole turns by entry path.** Separate composer from send; record admission-to-first-visible-output and completion, model time, number of model rounds, tool time, storage/projection time, and cold/warm conditions. Include a greeting, explicit app opening, Files lookup, and multi-tool task. Preserve successful-result and routing-quality checks alongside latency.
3. **Keep explicit UI actions deterministic.** Clicking a known entry already has a typed target and should never require classification. Consider an exact, unambiguous natural-language `open <installed app>` shortcut only as an explicit routing-policy decision; ambiguous requests still need interpretation. Do not broaden substring matching or remove authorization/confidence safeguards for speed.
4. **Avoid serial inference that usually falls back anyway.** Measure how often send's app classification is rejected by the named-app/directness guards or handed to the agent for input. Compare selective routing against direct agent admission on the same task set before changing policy.
5. **Reduce agent round trips.** Correct prompts and provide trusted scope/context through existing mechanisms where that eliminates repeated discovery. Keep result verification; never claim that posting `IApp.Request` proves success. Do not parallelize side-effecting tools indiscriminately.
6. **Then optimize measured supporting costs.** App-menu reads can be examined for bounded concurrency; capability search can be improved for relevance if word matching causes extra model rounds. Embeddings are an optional retrieval-quality experiment, not a demonstrated latency fix.
7. **Reduce projection amplification.** Assistant projects the selected conversation on progress; agent text persistence is already throttled to 250 ms, with immediate first words. Ino reads app metadata and rebuilds its ring on qualifying behavior completions. Measure their write/rebuild counts, apply the composition ownership work, and preserve durable conversation and receipt semantics.

The adapter also calls a synchronous SDK inside its async HTTP handler. This is a source-level concurrency concern to measure under simultaneous requests, not evidence that changing it will reduce single-request inference time.

The first slice is complete: workspace guidance is corrected and composer/send were measured from HTTP admission to connector-visible state. See the benchmark report for failures and measurement boundaries, including unmeasured Flutter paint time. Next address unnecessary agent discovery and inaccessible-contract repair loops, then decide whether a narrow deterministic open shortcut earns its complexity. Do not introduce vector routing, a second assistant behind Ino, or a new routing service as the default performance answer.
