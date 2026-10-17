# G5 report
- C#: CircleTouched live feed (source ICircles.Key(brain)); Flutter module references Circles.Contracts; LiveSignalFacts: envelope fact + feed list. 8/8 pass.
- Dart: CircleTouched model, ui_client.watchCircles, shell/lib/workspace/home/circle_activity_badge.dart (+ test, 4 pass). analyze clean in core and shell.
- Full shell flutter test: 3 failures in other agents' areas (brain_replay_test, session_brain_test, workspace_app_shell_test).
- Wiring: wrap the circle app's icon with CircleActivityBadge(watch: () => client.watchCircles(brainId), homeShown: <Home visible>, child: icon).
- Note: commit included other agents' pending hunks in cluster.dart/ui_client.dart (whole-file explicit paths).

## Fix round 1
- HomeScreen.decorateIcon added; workspace_app passes it for app.id == 'circle' (InstalledAppSummary has id, not name) with a per-brain CircleActivityFeed kept in a workspace_app field and disposed there.
- CircleActivityFeed (ChangeNotifier) owns the subscription: reconnect only on error/close with doubling pause (1s..30s), count survives Home unmount, cleared when Home hides/unmounts. Replay rule: first touch of a new connection equal to the last counted one is not counted (envelope has no sequence).
- LiveSignalFacts now uses the real ICircles index (retention landed in 85c331c34): live envelope + late-subscriber seeding facts; Beater-based CircleTouched fact removed.
- Results: shell 157 pass, core analyze clean, Flutter C# 130/131 (BrainEventsFacts.ANewNeuronAppearsInTheBrainStream fails, unrelated).

## Fix round 2
- /live Envelope gains `sequence` (long?, retention sequence; live publishes matched against the source's Retained list by signal equality, omitted when the source retains nothing) and `replay` (true on the connect-time retained signal). Facts: sequence on replay (+replay true), on a live index publish, and null for a non-retaining source.
- Dart: LiveEnvelope/CircleTouched parse both (optional, A2 cluster model untouched). CircleActivityFeed keeps a high-water mark: a cold-start replay only seeds it; later only sequence > mark counts (a replay above the mark = missed touch, counted once); null sequence counts every touch. A synchronous throw from watch backs off like a stream failure; backoff resets on first event.
- Results: Flutter C# 132/132; core+shell analyze clean; circle badge tests 12/12. Full shell flutter test has 16 pumpAndSettle failures from other agents' in-progress workspace_app/neuron_view edits (watchBrain, brainId) and earlier a full C: disk; none touch circles.

## Fix round 3
- CircleActivityFeed `_seeded`: set by any envelope, or when a connection ends after being established (done, or any error but TableRequestException, which means the server refused). Seeded feeds compare every sequence (replay included) with the mark, so a touch missed after an empty first connection is counted once; a refused connect does not seed. Backoff already reset at the top of `_touched`, which every event of the typed stream passes through.
- watchBrain: assert replaced by ArgumentError.
- Badge tests 14/14; core and shell analyze clean.

## Round 4 (new implementer) — positive "ready" signal

Finding (rereview3): socket/TLS/timeout errors on a refused connect seeded the feed.
- C# `LiveSignalEndpoints`: `LiveFeed.Sources` gains a `listed` callback (Apps calls it after the kernel listing; a finite source sequence counts as listed when it ends). `Discover` returns a task completing once the replays of the sources listed at connect time are written (each Pump signals after Replay, or when it drops); `Stream` writes one `{"type":"ready"}` (`LiveSignalEndpoints.Ready`) after every selected feed has replayed. Failed feeds/sources do not block ready.
- Dart core: `LiveEnvelope.isReady`; `watchCluster`/`watchActivity` filter it out; `watchCircles` passes it as `const CircleTouched.ready()` (`ready` flag).
- Shell `CircleActivityFeed`: `_seeded` only on ready or a touch; errors and done never seed; TableRequestException special case removed; ready resets the backoff.
- Tests: C# `ReadyFollowsTheReplayOfEverySelectedFeed`, `ALateSubscriberGetsTheReplayThenReadyThenLiveSignals`, `AFeedWithNoSourcesYetIsReadyAtOnce` (+ live-signal facts consume ready first). Dart: socket-error refused connect does not seed, ready seeds without counting, replay after empty-ready + outage counted once, ready resets backoff, LiveEnvelope.isReady.
- Results: Flutter module tests 134/135 — the one failure `APublishedSignalIsForwardedAsATypedEnvelope` asserts publisher `beater-live` but gets `test.beater/beater-live` (publisher formatting, unrelated to this change; pre-existing/foreign). flutter analyze clean (shell, core); badge/models/strip/dock/home tests 36/36; core suite 3/3.
