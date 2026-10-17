You are implementing ONE task of a plan in the C# / Orleans repo at E:\intochat\digitalbrain (branch os-runtime). Other agents are editing other projects in the same tree at the same time.

HARD RULES
- Touch only the files listed in the task's **Files** block (plus a new test file it names). If you truly need another file, stop and explain instead.
- Do NOT run git (no commit, no checkout, no stash). Do not read NuGet package XML docs.
- ASCII only in source. No ConfigureAwait(false) in grain code. No /// <summary> boilerplate.
- The shared contracts already exist; read them first, use their exact names:
  src/DigitalBrain/Signals/Trace.cs, src/DigitalBrain/Signals/Signal.cs, (Cost, CostKind, CostRow, CostSummary, UsageGrouping live in namespace DigitalBrain.Framework.Compute)
  src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/{TraceContext.cs,ICostMeter.cs,IPriceList.cs,Cost.cs,CostSummary.cs}
- Read CLAUDE.md for repo conventions. Build per project (dotnet build <csproj>), never the .slnx. Tests: dotnet test --project <test project dir> -- --filter-class "*Name*".
- Test project names: Framework unit tests = src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit ; Platform unit tests = src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit ; AI = src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests ; CSharp = src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests . Follow patterns of existing facts in those projects (harness, naming).
- Kill any test run that exceeds 5 minutes and fix the hang rather than waiting.
- Stop when the task's tests pass and the touched projects build with 0 warnings. Finish by printing the list of files you changed.

GLOBAL CONSTRAINTS

- Build and test per project, never the `.slnx`: `dotnet build src/<path>.csproj`, `dotnet test --project <test project>`.
- Warnings are errors, nullable on, central package versions; no new packages.
- Grain state uses concrete arrays, never `IReadOnlyList`.
- No `ConfigureAwait(false)` in grain code. ASCII only in source (no fullwidth punctuation).
- No `/// <summary>` boilerplate; tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- No state compatibility, no migrations, no legacy shims: delete replaced code in the same task.
- Money is `long` micros everywhere. Never `decimal`/`double` in ledger state.
- Commit explicit files only (`git add <file> <file>`), never a directory.

YOUR TASK
### Task 1: Compute button opens even without an edge client (orchestrator or OpenCode)

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart:1005`
- Modify: `src/DigitalBrain.Modules/Google/Flutter/app/shell/lib/workspace/compute_usage_panel.dart`
- Test: `src/DigitalBrain.Modules/Google/Flutter/app/shell/test/compute_entry_point_test.dart`

**Interfaces:** Produces `ComputeUsagePanel(client: DigitalBrainUiClient?)` — null client renders a "Not connected to a brain" state.

- [ ] **Step 1: Find why `edge` is null at runtime.** Read `shell/lib/main.dart` around line 60-80 where `edge` is built; note the condition. Record the cause in the commit message. If `edge` is null because a config value is missing in the AppHost launch, fix that wiring instead and keep the remaining steps.
- [ ] **Step 2: Failing test** — add to `compute_entry_point_test.dart`:

```dart
testWidgets('compute button opens a not-connected panel without a client', (tester) async {
  await tester.pumpWidget(buildWorkspace(programmingClient: null));
  await tester.tap(find.byKey(const Key('compute-usage-button')));
  await tester.pumpAndSettle();
  expect(find.text('Not connected to a brain'), findsOneWidget);
});
```

(Use the file's existing workspace builder helper; if it is named differently, use that name.)
- [ ] **Step 3: Run** `flutter test test/compute_entry_point_test.dart` from `shell/` → FAIL.
- [ ] **Step 4: Implement** — line 1005 becomes `onCompute: () => _openCompute(context),`; `_openCompute` passes `widget.programmingClient` (nullable) to `ComputeUsagePanel`; the panel's `build` returns `const Center(child: Text('Not connected to a brain'))` when `client == null`.
- [ ] **Step 5: Run** `flutter analyze` and `flutter test` from `shell/` → PASS.
- [ ] **Step 6: Commit** `git add` the three files; `git commit -m "Shell: Compute opens without an edge client"`.
- If a build fails with a file-lock / 'being used by another process' error, another agent is building: wait 20s and retry (max 5 times).
