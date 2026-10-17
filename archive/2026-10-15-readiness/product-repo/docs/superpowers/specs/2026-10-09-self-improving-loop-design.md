# Self-improving loop

**Status:** approved in chat 2026-10-09. Sub-project 3 of 3; built after 1 and 2.

## Intent

The brain changes its own source, runs the new revision as a sibling, verifies the sibling from the
current brain, commits when it passes, and hands over: the new revision becomes the brain, the old
one stops. Every iteration starts from the newest verified revision. Verification is the same loop
a developer runs by hand today (Aspire healthy, drive over MCP, check traces), done by a neuron.

Decided: **sibling clusters, not one cluster.** A revision has its own Orleans service id and
cluster id, its own storage copy, its own ports. State is never shared between revisions, so a
reshaped grain cannot crash the parent, and a reshape that cannot activate is a verification
failure, not a silent loss.

## Pieces

### Launcher

`src/DigitalBrain.Launcher`: a small long-lived process outside Aspire. It is the only thing that
owns the canonical ports (5080 UI, 5081 MCP). It reverse-proxies them (YARP) to the *current*
revision and starts revisions on demand. It never runs brain code.

- `revisions.json` next to the launcher: current revision id, port block per revision.
- `aspire run` per revision from that revision's worktree, with environment:
  `DigitalBrain:Http:UiPort` and `DigitalBrain:Http:McpPort` (the block),
  `DigitalBrain:Orleans:ServiceId` and `ClusterId` set to `intochat-r{short-sha}`,
  storage container name `brain-r{short-sha}`.
- HTTP API on a local port: `POST /revisions {sha}` start, `POST /revisions/{sha}/promote`,
  `DELETE /revisions/{sha}`, `GET /revisions`. Promote flips the proxy target and stops the
  previous current.

A revision's AppHost is unchanged apart from reading those keys, which it already does for ports;
service id and cluster id move from the literal `"intochat"` to configuration with that default.

### Revision neuron

`src/DigitalBrain.Modules/DigitalBrain/Revisions/`: a module with `IRevision` keyed
`{brain}/revisions/{sha}` and `IRevisions` keyed by brain (the index). Signals:
`RevisionBuilding`, `RevisionStarted(McpEndpoint)`, `RevisionHealthy`, `RevisionVerified(Report)`,
`RevisionPromoted`, `RevisionFailed(Stage, Reason)`.

`IRevision`:

- `Propose(string branch, string worktreePath)`: records the change set; the code was written by
  the brain through the existing C# file neurons (`ICSharpFile` over the repo worktree, and the
  GitHub module's worktree support) before this call.
- `Start()`: asks the launcher to build and run; publishes `RevisionStarted` with the MCP endpoint.
- `Verify(VerificationPlan plan)`: the parent drives the child's MCP (`neurons_context`,
  `neurons_call` on the paths the change names) and reads the child's Aspire resources and traces
  through its own `IAspire` bridge; publishes `RevisionVerified` or `RevisionFailed`.
- `Promote()`: only after `Verified`. Commits the worktree to `branch`, calls the launcher's
  promote, publishes `RevisionPromoted`. The parent brain is then stopped by the launcher; the
  child, now current, finds `RevisionPromoted` as its own history.
- `Discard()`: stops the child, keeps the worktree for inspection.

### Verification plan

A `VerificationPlan` is data, written by the same author that wrote the change (the Creator or a
user): the neuron calls to make against the child and the expected state, plus which Aspire
resources must be healthy and which span names must appear. It is stored in the revision, so a
failed revision shows exactly which expectation failed.

### The loop as an app

`src/DigitalBrain.OS/Apps/SelfImprove`, one synapse per reaction, as every app:
`request.cs` (a user asks for a change: the Creator writes files into a fresh worktree and a plan,
then `Propose` and `Start`), `healthy.cs` (on `RevisionHealthy`, `Verify`), `verified.cs` (on
`RevisionVerified`, `Promote`), `failed.cs` (on `RevisionFailed`, show the report, keep the
worktree). Its surface is the list of revisions and their stage, which is also how the shell shows
the loop.

## Storage copy

On `Start`, the launcher copies the current revision's Azurite container to `brain-r{sha}` before
the child boots. Real user data therefore rides into the new revision; the first thing the child
does is activate the same grains, which is the cheapest possible reshape test.

## Safety rails

- The child's MCP is only reachable from the launcher's host; the parent calls it through the
  launcher.
- `Promote` refuses without a `Verified` signal in the revision's history.
- At most one revision is `Started` at a time per brain; a second `Propose` while one is live
  queues.
- Verification has a wall-clock budget per plan (from the plan, not a global timeout); exceeding it
  is `RevisionFailed(Stage: Verify)`, never a retry.

## Verification of this feature itself

- Module tests: `IRevision` stage machine with a `FakeLauncher`; `Promote` refused without
  `Verified`; a plan expectation mismatch yields `RevisionFailed` with the expectation named.
- Hosting fact: service id and cluster id come from configuration with the `intochat` default.
- Running: ask the SelfImprove app for a one-line change (a new operation on Calculator); watch the
  `intochat-r…` resources come up; `RevisionVerified` then `RevisionPromoted` in traces; the shell
  reconnects through 5080 to the new revision; the old Aspire exits.

## Out of scope

Rollback after promotion (git revert is the rollback), multi-brain promotion policy, cloud
deployment of revisions.
