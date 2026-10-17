# Binding rules for every implementer (from CLAUDE.md + user)
- Read E:\intochat\digitalbrain\CLAUDE.md first; it is binding.
- Use LSP (load the `LSP` tool via ToolSearch "select:LSP"; csharp-ls) for goToDefinition/findReferences/goToImplementation before changing any symbol. Never grep for code (grep only for non-code text: json, csproj, slnx, md). If LSP fails to start, csharp-ls needs root DigitalBrain-lsp.sln (gitignored) — check it exists.
- Where the brief says "discover", "confirm", "verify with docs": do it (LSP, context7 / microsoft-learn via ToolSearch) and write findings into your report's "Notes" section before coding.
- Build and test per project: `dotnet build <csproj>`, `dotnet test --project <dir>` (filter: `-- --filter-class "*X"` / `--filter-method`). NEVER build the .slnx.
- Warnings are errors, nullable on, central package versions in Directory.Packages.props.
- No boilerplate `/// <summary>`; sentence-shaped fact names; `TestContext.Current.CancellationToken`.
- Concrete arrays in grain state.
- Never fix a check by retrying, raising timeouts or adding polling.
- Kill any test run exceeding 5 minutes (run tests with a timeout) and debug the hang.
- Commit EXPLICIT files only: `git add <path> <path>`; for deletions `git rm <path>` / `git add -u <path>` per path. Other sessions share this tree: NEVER stage src/DigitalBrain.Modules/AI/** or src/DigitalBrain.Framework/DigitalBrain.Framework/Compute/MeteredHttpHandler.cs or anything you did not change. Never `git add -A`/`.`/directories. End commit messages with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Do not dispatch subagents. Tick the plan checkboxes for your task in the plan file (docs/superpowers/plans/...) and include that file in your commit.
- COMMIT COMMAND IS MANDATORY: `git commit --only -m "<msg>" -- <path> <path> ...` (lists every path, including deleted ones). Never plain `git commit` — another session keeps its own staged changes in the shared index and a plain commit sweeps them in. Verify with `git show --stat HEAD` that only your files are in it.
- NEVER use `git stash`, `git checkout -- <path>`, `git reset`, or `git restore` on the shared tree. For a baseline comparison use a temporary `git worktree add <scratch dir> <sha>` and remove it afterwards.
- ASCII only in source. No ConfigureAwait(false) in grain code.

# Task: A2 Task 4-5 fix round 3. You are fixing review findings on commit 112889bf4.
Read: .superpowers/sdd/2026-10-10-aspire-2-rolling-cluster/re-review-2.md (the findings, verbatim authority),
the "Fix round 2" section of task-4-5-report.md in the same folder, and docs/superpowers/plans/opencode-prompts/a2-task-4-5-fix-2.md.
Files: src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Cluster/ClusterNeuron.cs,
tests/.../ClusterRollFacts.cs, tests/.../FakeClusterHost.cs (under src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/),
src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs,
src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/DeploymentIdentityFacts.cs.

Fix:
1. SetLive failure in Step must go through NeverReady (the current instance, reason "live.json could not be written: <message>") so already-moved instances are rolled back to PreviousSha. No bare Steady save. Fact: ALiveSwitchThatFailsRollsTheClusterBack (extend FakeClusterHost so SetLive can throw).
2. Restore the deleted fact RollingResumesOnTheNextActivationWithoutAnotherRoll using a non-throwing cut-off: FakeClusterHost gets a restart gate (a TaskCompletionSource per instance name that the restart awaits); the fact starts a roll, waits until the gate for the 2nd instance is reached, deactivates the cluster grain (find how other facts in this project deactivate/reactivate a grain; use the ModuleTest harness, no hand-rolled host), releases the gate, and asserts the roll finishes Steady on the target sha with every instance restarted once onto it.
3. RollIsRefusedWhileRollingOntoAnotherSha: hold the roll mid-way with the same gate so the second Roll is refused because the first is still Rolling; release the gate at the end.
4. ShutdownTimeout: 10s is BELOW the .NET 30s default and Orleans StopAsync deactivates grains and drains before writing Dead. Verify with context7/microsoft-learn: Orleans silo shutdown sequence and GrainCollectionOptions.DeactivationTimeout default. Set ShutdownTimeout to a value >= DeactivationTimeout + a margin, justified in a one-line code comment that also states that Aspire may still force-kill the process on Windows. Update ASiloHostWaitsForAGracefulLeaveOnStop accordingly. Fix the stray de-indented line in DeploymentIdentityFacts.cs.

Tests (timeout 5 min each):
  dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests
  dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit
Append "Fix round 3" to task-4-5-report.md (Notes from docs, changes, commands, results). Do not commit the report.
Commit: git commit --only -m "Aspire: a failed live switch rolls back too, a roll resumes after deactivation, and silos keep the full deactivation window on stop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <every path you changed>
