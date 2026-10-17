# MVP implementation plan: live shell, Ino, replay, files, themes, rules, circles

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-ino-circles-logic-design.md` (binding authority).

## Global constraints (every task)

- Read `CLAUDE.md` first. LSP (`csharp-ls`, `dart language-server`) for every definition/reference before editing;
  diagnostics clean after. Grep only for non-code text.
- Build per project, never the `.slnx`. Tests: `dotnet test --project <test project>`; kill any run over 5 minutes.
- Flutter: `flutter analyze` and `flutter test` from `src/DigitalBrain.Modules/Google/Flutter/app/shell` (and the
  package you changed).
- Concrete arrays in grain state and signals, never `IReadOnlyList`. No `/// <summary>`. Warnings are errors.
- Other agents edit this tree at the same time. **Touch only the files your task names** (plus new files). Commit
  with explicit file paths, never `git add -A` or a directory. Do not run `git stash`, `reset`, `checkout --`.
  If a build breaks in a file you did not touch, report it, do not fix it.
- Signals a shell screen needs must be reachable through the existing SSE feeds (`/brains/{id}/events`,
  `/chats/{chat}/brain/events`); if a signal type is not forwarded there, add it to the forwarder, do not poll.
- Commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Wave 1 (parallel, disjoint files)

### Task A1 — ClusterChanged carries silos; delete the infrastructure endpoint (C#)
Files: `src/DigitalBrain.Modules/Microsoft/Aspire/**` (Contracts `Signals/ClusterSignals.cs`, `Cluster/ClusterNeuron.cs`,
`AspireModule.cs`, delete `Resources/InfrastructureEndpoints.cs` + `Resources/InfrastructureView.cs`,
`tests ... InfrastructureFacts.cs` → replace with `ClusterChangedFacts.cs`).
Shape: spec §1 verbatim. Timer in `ClusterNeuron` (Orleans `RegisterGrainTimer`), publish on change only, retain last
value for late subscribers the way `AppNeuron` retains (`Retained(...)`). Tests: a fake cluster host yielding two
different silo lists publishes two `ClusterChanged`; an unchanged list publishes none; the endpoint route no longer
exists.

### Task A2 — Strip renders ClusterChanged with animation (Dart)
Files: `app/core/lib/src/models/infrastructure.dart` (delete), `app/core/lib/src/ui_client.dart` (remove
`readInfrastructure`, add a typed `ClusterChanged`/`SiloState` model in `app/core/lib/src/models/cluster.dart` and
a `watchCluster(brainId)` over the workspace SSE feed if `ClusterChanged` is forwarded there — check
`WorkspaceEndpoints.cs:33`; if not forwarded, report NEEDS_CONTEXT naming the forwarder),
`app/shell/lib/workspace/home/infrastructure_strip.dart`, `shell/test/infrastructure_strip_test.dart`,
`shell/test/core/app_manifest_models_test.dart`, `shell/test/application_fixture.dart`.
Do **not** edit `workspace_app.dart`; keep the widget's constructor compatible (ignore/deprecate `loadConnections`)
and report the one-line change needed there. No timer. Chips keyed by silo id, `AnimatedSwitcher` on state,
reduced-motion honored.

### Task B1 — AppActivity signal; Progress(state, detail); Creator and assistant report (C#, features)
Files: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppActivity.cs` (new),
`.../Apps.Contracts/Apps/IApp.cs` (Progress signature), `.../Apps/AppNeuron.cs` (Progress publishes the signal, keeps
the line), `.../Apps/Creator.cs` (rounds report `working`/`reading`/`searching`/`completed`/`attention`),
`features/os/Assistant/send.cs` and the assistant synapses that call Progress, Apps tests for Progress.
Shape: spec §2 verbatim, state names exactly the ten listed. Every other `Progress(` caller found by LSP updated.

### Task C1 — Journal read-back and /signals endpoint (C#)
Files: `src/DigitalBrain.Framework/.../Runtime/Signalling/SignalJournal.cs` (`ReadSince`), `src/DigitalBrain.Platform/
.../Parts/PartSignalJournal.cs`, `.../Parts/PartLog.cs` only if `SignalsSince` needs a brain-wide variant, a new
`src/DigitalBrain.Platform/.../Signals/SignalsEndpoints.cs` mounted under `BrainRoutes.Group`, Platform unit tests
(`Parts/PartSignalFacts.cs` additions or `Signals/SignalsReadFacts.cs`). Shape: spec §3. Payload: type name, publisher,
sequence, JSON payload. A plain host returns an empty page with `next = since`.

### Task D — Files app (features)
Files: `features/os/Files/**` (new). Pattern: copy the shape of `features/os/Settings` (app.cs, open synapse, surface).
Operations `open`, `browse`, `read`; uses `IFileSystem` from the Windows module contracts (find roots via the
connection). Must compile through `FeatureCatalog` at boot: run the OS host's feature compile check
(`DigitalBrain.OS.Tests.Unit` or the Apps publish gate test) and report the command.

### Task E — Themes (Dart)
Files: `app/ui/lib/src/theme/ui_theme.dart`, `app/shell/lib/workspace/workspace_settings.dart`,
`app/shell/lib/workspace/workspace_store.dart` (theme setting value is a palette name; `'dark'`→`midnight`,
`'light'`→`paper` mapping kept for old values), `workspace_app.dart` lines 885–892 only (ThemeMode mapping), tests.
Palettes: `midnight`, `paper`, `lumen` (spec §5). Picker in Settings; animated switch.

### Task F — Rules: ILogic, Judge, AppRejected, prompt (C#, most capable model)
Files: `src/DigitalBrain/.../Synapses/ILogic.cs` (new), `IScriptSandbox` + `CSharpScriptSandbox`/`FakeSandbox`
(`Judge`), `.../Apps/AppNeuron.cs` **`Request` only** (B1 owns `Progress`; coordinate by touching distinct methods;
if a merge conflict appears, rebase on the other's commit), `.../Apps.Contracts/Signals/AppRejected.cs` (new),
`Apps/Authoring/AgentPrompts.cs` (rules first), Apps tests: a bundle with a rejecting rule publishes `AppRejected`
and no `AppRequested`; an allowing rule passes; a bundle with no rules is unchanged. Spec §6 verbatim.

### Task G1 — Circles module (C#)
Files: `src/DigitalBrain.Modules/DigitalBrain/Circles/**` (new: Contracts, module, tests under
`tests/DigitalBrain.Modules.Circles.Tests/`), `src/DigitalBrain.OS/OsCatalog.cs` (one line) and the OS csproj
reference. Shape: spec §7 contracts and signals verbatim; `Funding.Circle` on `ICostMeter` in
`src/DigitalBrain.Framework/.../Compute/ICostMeter.cs` with the budget draw in the ledger implementation found by LSP.
Tests via `ModuleTest.Create().WithModule<CirclesModule>()`: invite→accept makes a member on both brains;
`Say` publishes `CircleSpoke` readable from both; `SetComputeShare(30)` is refused; a circle-funded call over the share
throws `BudgetExhaustedException`.

## Wave 2 (after wave 1 commits; parallel where disjoint)

### Task B3 — Dock renders Ino from AppActivity (Dart)
Files: `app/shell/lib/workspace/dock/assistant_island.dart`, `dock/dock.dart`, `app/core` model + `watch` for
`AppActivity`, tests. Replace `AssistantCat` with `InoPresence`; centered/floating when no app focused.

### Task C2 — Home brain graph, live + scrub (Dart)
Files: `app/shell/lib/workspace/home/home_screen.dart`, new `home/brain_replay.dart`, `app/core` client for
`/signals`, tests. Feed `LumenBrainGraph` from `watchBrain`; scrub bar replays from `/signals`.

### Task G3 — Circle app (features) and Task G5 — Circles screen (Dart)
`features/os/Circle/**`; `app/shell/lib/workspace/circles/**` + one Home entry in `workspace_app.dart`.

### Task A3 — workspace_app integration
Apply A2's reported one-line change; remove `loadConnections` plumbing.

## Wave 3 — Live verification
`dotnet run digitalbrain.cs`; Aspire resources Healthy; drive each item through `digitalbrain-mcp` per spec
§Verification; traces confirm `ClusterChanged`, `AppActivity`, `AppRejected`, `CircleSpoke`. Then final whole-branch
review.
