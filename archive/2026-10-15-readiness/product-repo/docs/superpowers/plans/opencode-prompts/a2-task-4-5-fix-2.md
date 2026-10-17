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

# Task: A2 Task 4-5 fix round 2 (plan docs/superpowers/plans/2026-10-10-aspire-2-rolling-cluster.md)

Context: ICluster.Roll is a one-way persisted step machine in
src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Cluster/ClusterNeuron.cs
(Roll -> Save Rolling -> SetLive -> Drive -> [OneWay] IClusterDriver.Step; NeverReady persists a RollingBack reverse roll
to PreviousSha ending Steady with ClusterChanged.Failure). Host side: Cluster/AspireCliClusterHost.cs (IClusterHost), fake: tests/.../FakeClusterHost.cs.
Read the review: .superpowers/sdd/2026-10-10-aspire-2-rolling-cluster/re-review-1.md. Read the task briefs task-4-brief.md, task-5-brief.md in the same folder.

Fix exactly these two findings:

## Finding A (Important)
ClusterNeuron.Step/Moved: any non-InstanceNeverReadyException failure (aspire CLI non-zero exit on `resource restart`
-> InvalidOperationException at AspireCliClusterHost.cs ~217, SetLive IO error, WaitInstance describe failure) escapes the
one-way Step; the reminder re-Drives every minute forever; the roll never ends and never rolls back.
Required: a failure of the step's restart or readiness wait for an instance counts as that instance never getting ready ->
NeverReady(instance, reason including the exception message) -> the existing full reverse rollback. During RollingBack, a
second failure keeps the existing behavior (stop Steady naming both failures). Do NOT add retries or counters; one failure
is a never-ready outcome. SetLive failure at a step: treat the same way (roll back naming it).
Facts to add in tests/DigitalBrain.Modules.Microsoft.Aspire.Tests/ClusterRollFacts.cs (extend FakeClusterHost so a restart can throw InvalidOperationException):
- ARestartTheCliRefusesRollsTheClusterBackToThePreviousSha
- (assert final state Steady on previous sha, ClusterChanged.Failure mentions the instance, all rolled instances restarted back)

## Finding B (ruling not landed: graceful stop)
Ruling: "dev stale membership: per-AppHost-run ClusterId, stable ServiceId; tightened ClusterMembershipOptions for
development; defunct cleanup; graceful stop - verify against Orleans docs". The first parts landed in
src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs. Graceful stop did not.
Discover first (write findings into the report Notes): use context7 / microsoft-learn to confirm how an Orleans 9/10 silo
leaves the cluster gracefully on host StopAsync (silo announces ShuttingDown/Dead in membership), what HostOptions.ShutdownTimeout
must be for that to finish, and how Aspire stops an executable resource on `aspire resource <name> restart` on Windows
(signal vs kill). Then make the silo host's shutdown timeout long enough for graceful leave (set
HostOptions.ShutdownTimeout in ServerHostingExtensions where the silo host is composed; justify the value from the docs),
and if Aspire hard-kills on Windows, write that in the Notes as a known limit (do not invent workarounds).
Add a fact in src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit or the Server tests project that exists
(discover via the csproj files) asserting the configured ShutdownTimeout: ASiloHostWaitsForAGracefulLeaveOnStop.

Tests (5-minute cap each, run with timeout):
  dotnet test --project src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests
  dotnet test --project <the hosting/server test project you touched>
Append a "Fix round 2" section to .superpowers/sdd/2026-10-10-aspire-2-rolling-cluster/task-4-5-report.md with Notes,
changes, exact test commands and their pass/fail output summary (that file is gitignored; do not commit it).

Commit:
git commit --only -m "Aspire: a roll step that fails for any reason rolls the cluster back; silos get time to leave the cluster on stop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <every source/test path you changed>
