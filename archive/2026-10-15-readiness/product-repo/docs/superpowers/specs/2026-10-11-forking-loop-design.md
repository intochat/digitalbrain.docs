# Forking loop: the fastest self-improving loop

Status: ratified 2026-10-11 (grilling session, Q1–Q17). Resolves D2 and D10 (public vs private) in
`2026-10-11-alive-os-feature-map.md`.

## The loop

A user writes a sentence or forks a synapse, and it is running within 10 seconds. It appears in the circle
feed, friends fork it, and their forks and edits teach the fast path through retrieval. There is no model at
runtime, and compilation is the gate.

Metrics: **sentence → running synapse < 10 s** (primary) and **fork rate inside a circle** (secondary).

## Decisions

1. **Forking is the loop.** GitHub can be connected as a mounted source (see 9).
2. **The unit is one synapse**, carried as spec + code and recompiled against the receiving brain's contracts.
   Apps remain the packaging for larger programs.
3. **The social network is signals.** Posts, follows and likes are signals from edge neurons. The feed,
   ranking and notifications are forkable synapses in `features/os`. There is no social special case and no
   fifth concept.
4. **Circles first.** A synapse spreads inside trusted circles. Promoting it to the public Marketplace is an
   explicit step.
5. **The metrics are the ones above.**
6. **Fast path plus fork-first.** A small writer turns one sentence into one synapse, with few-shot retrieval
   over the synapses the circle can see. A fork means the LLM edits a diff and the edit is then compiled. The
   Creator (spec → Builder loop) stays for whole apps.
7. **K1 "Runs are facts" comes first** (`BehaviorStarted`/`BehaviorRan`: outcome, duration, cost). Every
   ranking and learning signal derives from it.
8. **A fork copies the program and its lineage only** (S1 parent hash). It never copies data, connections or
   history. Settings and slots bind to the forker's connections (`FeatureLoader`). Data crosses brains only
   as an explicit, signed share into a circle.
9. **One file system.** There is a single `IFolder`/`IFile` contract, and each source is a connector behind
   it: local disk through the shell connector (stays on the user's device), Google Drive, OneDrive, GitHub
   and app folders. The UI is one explorer with a breadcrumb bar and a file list. Forking a synapse and
   forking a repo are the same gesture.
10. **Ino is a tether.** Like Io in Dota, Ino attaches to the focused window, folder or synapse. Its context is
    that neuron graph and its tools are those neurons' contracts. It lives as a live panel beside the focused
    thing, and there is no separate chat page. "Make this do X" means a fast-path synapse scoped to what is
    on screen.
11. **Stateless workers are one implementation of a synapse.** The watermark and subscription stay in one
    grain per synapse, which dispatches to a stateless-worker pool. Work that needs ordering is partitioned
    by key. The compiler marks eligibility, and the author never chooses.
12. **gRPC duplex.** There is one bidirectional stream per shell session, extending `core`'s existing
    `grpc`/`protobuf` client, with protobuf generated from the contract records. Budget: click → signal →
    render < 50 ms on a LAN.
13. **The model is chosen by privacy scope.** Public or circle context can use a public or circle model.
    Private context uses a local model. The project's privacy setting decides this, never the user per call.
14. **Capabilities are shown at fork.** The list comes from the compiled contract references and is approved
    once. Re-approval is needed only when an update widens it.
15. **One feed.** A post can carry a running synapse, with "fork" beside "like". Ranking uses run facts plus
    forks.
16. **Learning is retrieval only for now.** Forks, edit diffs, compile failures and removals are signals,
    used as few-shot examples within what the caller can see. Fine-tuning is deferred until the data exists.

## Posts, scenes, MVP (Q18–Q25)

18. **A post is an app.** It renders as UiPart: a tree of palette components bound to the app neuron's state,
    with its buttons as edge neurons. This closes the "renderable palette / UiPart" front.
19. **A scene is a neuron.** Entities, bodies and state machines are scene state. Flame is the shell-side
    renderer and physics engine (60 fps locally). Meaningful events (`Collided`, `StateEntered`) come back as
    signals. The 3D brain view is a scene whose state is the brain graph.
20. **State machines are declared in the scene neuron.** Flame animates the transitions, and synapses react
    to `StateEntered`.
21. **Flame comes after the feed** (step 6), and the brain view comes before games.
22. **The MVP demo:** "when X, do Y" becomes a running synapse in under 10 s. Second: the Engineer writes a
    module, which goes through SelfImprove (candidate → verified → promoted).
23. **The name stays Synapse** with `brain.On<T>`. "Policy" already means authorization in this codebase.
24. **The MVP Engineer covers synapses and modules.** The Shell Builder is deferred.
25. **`IDeepSeekV41Flash`** for the fast path and router. A stronger model is used only for module builds.
    Time per synapse is recorded in K1 run facts.

## Build order (17)

1. K1 run facts
2. S1 fork lineage
3. Fast-path synapse writer with retrieval, plus Ino's tether
4. Capability display on fork
5. Universal file system (local disk and GitHub first)
6. Circle feed as a synapse
7. Stateless-worker dispatch, once run facts show where it is hot
8. gRPC duplex for edge events

Each step is done only when it is seen running (Aspire healthy → `digitalbrain-mcp` → traces).
