# Architecture: ratified rules and open deviations

This authority owns the checklist, settled deviations, rejected shapes, and build order.

## 8. Known limitations

These are limits of what stands today, and each one is a boundary someone chose rather than a defect
waiting to be found. They are stated here because a system that hides them is harder to build on than
one that does not.

**An Orleans client is a trusted cluster peer.** `DigitalBrainClient.Connect` takes the owner as a
string and binds every call to it, which stops one owner's neurons being addressed through another
owner's session. That is a correctness boundary, not an authentication claim — a process that can
reach the cluster can name any owner. Authenticate at the edge, and do not publish Orleans clustering
endpoints.

**Journal history is bounded.** A neuron feed retains a recent window — 512 entries, or 512 KB,
whichever binds first — and compacts behind it. A read from a cursor older than that window is
answered with a snapshot and a reset instead of the deliveries that no longer exist. The snapshot
carries per-type tallies and sequence bounds, so totals stay honest even once the entries are gone,
but this is a retained window and a summary rather than an eternal audit log.
Effectively-once processing is also windowed: a neuron remembers the last 4096 handled delivery
identities, and a duplicate older than that window is no longer recognised as one.

**Delivery ordering is local.** Directed delivery is FIFO per target and at least once. A receiver
that refuses a delivery blocks only the later deliveries aimed at that same receiver — the drain
marks that one target blocked and carries on with every other. There is no cross-target ordering, and
none is promised.

**Broadcast addressing.** Broadcast resolves the handler **types** registered for a synapse and
addresses one correlation-derived instance of each, so a fan-out reaches a fresh instance per
correlation rather than a standing subscriber. Those instances are where the traffic actually landed,
which is what a future identity-wide feed will have to account for.

**Client observation is not the final timeline stream.** Journal reads take an `afterSequence` cursor
and can be resumed or watched, which is enough for a test to assert on what happened. The client
facade itself has no observation surface — it sends and it emits. A durable per-owner timeline and a
reconnect lifecycle are not built.

**`AsClient()` remains a security boundary.** A client projection must never inherit silo-only storage
or module secrets. Hosting implements that split (`WithReference(brain)` for silos vs
`brain.AsClient()` for clients). L0 `HostingProjectionContracts` pins journal connection, shared state
key, module ids, AI resource configuration, and Google/Salesforce OAuth as silo-only (never on
`AsClient()`). Every new module projection must extend that proof rather than relying on convention.

**Tasks L1 is closed via a test-only worker, not product supervised orchestration.**
`DigitalBrain.Tasks.Tests` proves Start → Accept → `AttemptAccepted` → Running, idempotent Start
receipts, Cancel → Cancelling → `AttemptCancelled` → Cancelled, and stale-revision fact ignore.
Assembly-boundary tests still keep Tasks free of AI/MAF/Time. Supervised MAF-per-attempt workers
remain designed; no product `IWorker` under `modules/` emits attempt facts yet.

**Google and Salesforce L1 proofs use a scripted southbound MCP edge, not live cloud.**
`DigitalBrain.Integrations.Tests` proves Gmail `ReadMessage` against an admitted `get_message` tool,
refusal when that tool's safety annotations fail the positive admission check, Salesforce propose
without MCP, approval rejection before MCP when human evidence mismatches, and approve → `Completed`
through admitted update/query tools on the same in-process edge. Live OAuth and hosted MCP endpoints
remain out of the default L1 path.

**AI direct Concurrent/GroupChat L1 is closed; supervised remains Designed.** Typed LLM smoke
(`ILlama32`) plus ModuleTests multi-participant Concurrent/GroupChat `Respond` and durable second-turn
session reuse exercise the direct surface. Supervised `IWorker` Accept/Continue/Cancel paths still
throw until a thin Orleans-primary path is rewritten.

**Supervised workflow checkpoints are not built.** `DigitalBrain.Security` is purpose-ready for them;
the supervised Orleans-primary runner and checkpoint adoption path do not ship. Present-tense claims
about encrypting live supervised checkpoints describe design, not running product.

**The OpenTelemetry MAF chain is not built.** Journals remain the durable truth. The correlated
kernel → MAF → model-client span chain is ratified target shape, not an implemented diagnostic
projection in this repository.

**DevUI is not part of the current architecture.** No interactive agent UI is wired, and
`Microsoft.Agents.AI.DevUI` is referenced nowhere in the repository.

## 9. Ratified rules

This is the compact form of every decision above, kept as a checklist so that a change can be tested
against it quickly. It states the ratified target, not a report of what is built — several rules
describe things §4 already marks as settled and not yet standing up. Within that framing the rule is
what wins: **if code contradicts a rule, the code is wrong unless the decision is reversed in
writing.** Where code and rule are known to disagree today, §10 names the deviation rather than
letting the rule quietly soften.

### Kernel and modules

1. Kernel = neuron mechanics only; no AI/provider/memory/UI domain knowledge. Its one opaque
   `CapabilityDelegation` transport seam is infrastructure, never semantic vocabulary.
2. Modules own vocabulary; behaviors own logic over existing vocabulary.
3. AppHost creates the durable brain and selects modules once; silo is `AddDigitalBrain()` only.
4. Namespaces and type names are the programming vocabulary.
5. Generated typed module capsules and executable catalogs; no runtime assembly scanning as truth.

### AI and MAF

6. MAF owns agent/orchestration execution; DigitalBrain owns durable typed boundaries.
7. One outer MAF artifact per entry path: direct session or supervised checkpoint lineage.
8. Public contracts use MEAI `ChatMessage`/`ChatResponse`; MAF types stay internal.
9. Orchestration-by-base-type (`GroupChat`/`Sequential`/`Concurrent`/`Handoff`/`Magentic`).
10. Orchestrations accept both `ILLM` and `IAgent` participants.
11. Participants resolve by typed `NeuronId`, not fake DI.
12. No generic pseudo-agent layer; concrete typed agents/orchestrations use the one internal MEAI-to-MAF adapter.
13. Adopt MAF selectively; reject Harness-as-core and Durable Extension.
14. Orleans persists direct sessions and MAF JSON checkpoints in separate purpose-encrypted envelopes.
15. Compaction internal, token-budget, same typed model.
16. Journals = durable truth; OTel = diagnostics.
17. Fingerprinted session restore; explicit migration/reset.
18. Supervised `WorkflowRun`: **one Lockstep superstep**, then durable checkpoint adoption.

### Behaviors

19. Single-file programs compose existing vocabulary; never create neuron or synapse CLR types at
    runtime.
20. Behavior identity = `(OwnerId, BehaviorId)`; one `BehaviorNeuron` implementation hosts immutable
    approved revisions.
21. The program is not a Neuron; `BehaviorNeuron` owns journal, state, authority, and lifecycle.
22. Contract-only isolated compilation produces one content-addressed artifact; BDD and human
    approval bind to its hash.
23. Typed event subscriptions and schema-validated intent entry points are both supported.
24. Unknown code executes outside the silo through a constrained context and capability broker.
25. Vector search discovers; exact catalog records and grants authorize.
26. Dynamic prompts/personas and private schemas are allowed; dynamic public CLR vocabulary and
    capabilities are forbidden.

### Integrations and MCP

27. Public interfaces = semantic capabilities (`IGmail`, `ISalesforce`), not toolsets.
28. Shared MCP infrastructure owns official SDK/OAuth/token/session/fingerprint mechanics; providers own endpoint, scopes, exact policy, arguments, authority, and semantic mapping.
29. MCP stays internal behind positive admission; a durable fence is fingerprint-rechecked before its later invocation.
30. Production interactive authorization is an authenticated-edge responsibility; silo loopback callbacks require explicit development mode.
31. Human authority is explicit: proposal performs zero provider operations; exact approval evidence precedes catalog inspection and the durable mutation fence.
32. Progressive tool disclosure remains token-budgeted with no raw string invoke escape hatch; capability roots expose no MCP-shaped methods.
33. No exactly-once claim; durable dedupe, pre-invocation fencing, reconciliation, and uncertainty handling for mutations.

### Tasks

34. Independent `DigitalBrain.Tasks` module now.
35. Task = durable desired outcome; MAF Workflow = one Attempt's execution.
36. Tasks knows nothing about AI/MAF.
37. `IWorker` short requests + attempt facts; only session-owning orchestrations implement it.
38. One active Attempt per Task.
39. Attempt failure ≠ Task failure; terminal Tasks immutable; retries are successors.
40. Small lifecycle + typed blockers.
41. Cooperative truthful cancellation.
42. Fenced async runner; no long MAF work on grain turn.
43. Typed Goal/Result/Failure + fact references; no untyped payload bag.

### Time and hosting

44. Semantic Time ≠ Kernel private timing.
45. Public schedule names: built `ICountdown`; designed `IReminder` (not `ITimer`).
46. One schedule per neuron; explicit destination; revision + CommandId.
47. Designed and unbuilt: Interval vs Calendar schedules; deterministic DST; coalesce overdue recurrence.
48. Persisted Time state authoritative; shared Kernel reminder store.
49. `AddDigitalBrain(name)` owns one complete durable Azure Storage profile per brain; run mode uses Azurite.
50. One silo-only brain key protects durable AI and MCP payloads with distinct purposes.
51. Deterministic test time via `TimeProvider` + the `TestBrain` driver.

### Flutter and OS surface

52. Modules own UI vocabulary; behaviors (or pre-rail compositions) own shell/login/window *logic*.
53. Semantic neurons (`IShell`, `IScene`, …); never a public `IFlutter` god type or central UI root.
54. Package family `DigitalBrain.Modules.Flutter*`; public namespace `DigitalBrain.Flutter`.
55. Flutter rebuild projects committed journal facts (first vertical: `SceneOpened` key/title); richer descriptors stay open; journals remain durable truth.
56. C# contracts carry no Dart/Flutter SDK types; Kernel carries no UI vocabulary.
57. Dart host is a northbound client of a C# `IDigitalBrain` edge — never an embedded silo.
58. Auth at the edge; post-auth composition only; never tokens/passwords in journals.
59. Drift guard: golden wire manifest from Contracts; dual-sided when Dart models exist.
60. L1 proves UI facts on journals without a device; L2 is for real AppHost host resources when
    proven. OS-surface Healthy (`digitalbrain-ui` / Flutter host) remains residual until quoted —
    do not equate L0 projection pins or TestingAppHost silo L2 with product topology green.

## 10. Still open, known deviations, and rejected

### Still open

Nothing below is settled architecture. Do not implement one of these as though a decision has been
taken, and do not infer a shape for it from a neighbouring module.

- **The internal calendar recurrence library.** Ical.Net paired with Noda Time is the candidate that
  was raised and never argued to a conclusion. §4.5 settles the behavior a recurrence engine has to
  produce — deterministic DST resolution, coalesced overdue occurrences — and deliberately leaves open
  what produces it.
- **Reminder, recurring, calendar, and DST record shapes.** Countdown is built and its one-shot
  records are executable contracts. Reminder vocabulary and record shapes are not implemented or
  frozen.
- **Memory architecture.** Out of scope entirely, for the reasons in §4.7.
- **The exact CLR records for the capability-tool seam.** §4.3 ratifies that seam's architecture and
  its exclusions; the records and interfaces that would express it are unwritten.
- **Flutter descriptor algebra and richer chrome vocabulary.** §4.6 freezes the first five semantic
  types; host-facing SSE on `hosts/DigitalBrain.Ui` and first-vertical **Desktop** Windows chrome
  under nested `clients/digitalbrain_flutter/shell/` (`shell/lib/main.dart` + `shell/windows/`) are
  Built at code/L0/L1 — not Built-live AppHost topology. Scene descriptor node algebra and full
  product chrome remain open.
- **Product journal observation on `IDigitalBrain`.** Still designed for scripts and multi-edge
  reconnect as a shared programming-model API; the first live host feed uses edge-only journal watch
  (§4.6). Not required for L1 command→journal proofs.

### Known deviations

The inherited reminder deviation is closed. Base `Neuron` has no `IRemindable` surface; the outbox
wakeup is composed, and Tasks, AI, and Time own only their private reminder names and reject unknown
names.

### Rejected

Each of these was argued and turned down. Reintroducing one is a design change with a case to make,
not a configuration choice.

- **AI logic in the kernel.** Model inference, provider names, prompts, OAuth, UI contracts, and
  semantic memory all belong to modules.
- **Provider routing tiers and balancing.** Any model tier, routing layer, balancing policy,
  capability score, or fallback catalog. This is the exclusion §4.1 exists to protect, and hosting is
  the easiest way to smuggle it back.
- **Public model metadata definitions.** No descriptor, enum, or lookup table that resolves to a
  model; the namespace and type name are the identity.
- **Runtime module scanning.** A catalog discoverable at runtime is a catalog that drifts from the
  code that was compiled.
- **Raw MCP clients crossing module boundaries.** Tool names, protocol DTOs, and tool dictionaries
  stay behind the neuron.
- **A second client facade.** `DigitalBrainClient` is the only public one.
- **Compatibility shims.** No adapter kept alive to preserve a shape that was already deleted.
- **The MAF Durable Extension, and MAF Harness-as-core.** The first duplicates Orleans durability; the
  second would make DigitalBrain a second agent loop.
- **Any raw invoke escape hatch.** A model receives selected exact function schemas or nothing —
  never a string-addressed call beside them.
- **A recurrence library adopted because it is the obvious one.** Ical.Net with Noda Time sits on the
  open list above; treating it as decided, rather than arguing it, is what is rejected here.
- **A public `IFlutter` god neuron, `DigitalBrain.UI` namespace without reversal, Flutter-embedded
  silo, OTel-driven product UI, login grain as IdP, or Behavior product APIs before the install rail.**
  See §4.6 and §5.

## 11. Build order

The remaining designed work has a dependency order. Two tracks are explicit so module vocabulary is
not silently blocked on the self-programming rail, and so the OS product is not claimed before either
track has proofs.

**Self-programming track (product priority for installable logic):**

1. Complete owner-safe client scripting and the proposal, approval, install, and rollback rail.
2. Generate the canonical neuron catalog from public contracts and method and synapse vocabulary.
3. Add semantic and vector discovery as a disposable index over that catalog.

**Module vocabulary track (may interleave whenever a consumer and contracts are settled):**

4. Extend `DigitalBrain.Google` from the `IGmail` root to `ICalendar` once a concrete calendar story
   exists.
5. Add recurring and calendar Time vocabulary once its library and public record shapes are approved.
6. Flutter OS surface remaining work (do not re-open Built **code/L0/L1** steps): first vertical
   vocabulary + L0/L1 journals, Ui HTTP/SSE edge, module-owned hosting **projection**
   (`WithUiEdge` / `WithFlutterHost` — not bare `AddModule` alone), pure-Dart **Headless** host + dual
   golden, **Desktop** Windows chrome under nested `shell/` (`shell/lib/main.dart` +
   `shell/windows/`), and sample compositions under `DigitalBrain.Compositions` are **Built at code
   and L0/L1** — not Built-live product AppHost topology. Still open / residual: live product AppHost
   OS-surface Healthy (`aspire start` topology), descriptor algebra, full product chrome beyond
   key/title shell, multi-principal IdP edge, product journal observation on `IDigitalBrain`, and
   treating compositions as installed Behaviors (self-programming track). Do not wholesale restore
   historical `app/` or `workspace/`. Do not ship Aspire-only Flutter with zero module host options.
   Do not claim product Aspire topology green without quoted Healthy evidence.
7. Design `DigitalBrain.Memory` independently around its own vocabulary, never inferred from AI,
   Tasks, or Time.

No deferred item justifies retaining a rejected abstraction today. Do not invent Behavior execution
APIs to fake the self-programming track. Do not ship a Flutter shell app that bypasses typed
vocabulary and journals.

