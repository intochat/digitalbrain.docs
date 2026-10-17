# Aspire: candidate containers and a self-upgrading cluster

**Status:** approved in chat 2026-10-10. Sub-project A of 3 (A: this, B: DigitalBrain Engineer app,
C: Twitter/price modules + "How Musk Moves Bitcoin" demo). Supersedes the Launcher, Revisions module
and Aspire bridge parts of `2026-10-09-self-improving-loop-design.md`; that spec's verification plan
and the SelfImprove app stay.

## Intent

The brain improves itself the way production software ships: a change is proven in a disposable
container, then the live cluster upgrades itself with Orleans versioning. Compatible changes roll
with zero downtime; breaking changes restart. Today "a running DigitalBrain" is built three times
(Aspire bridge, Launcher process, Revisions module) and none of them is a neuron; all three go.

## Policy change

"No state compatibility" (CLAUDE.md Hazards, memory) becomes:

> **Compatible changes roll, breaking changes restart.** Additive changes (new state fields, new
> methods, new grains, new signals) roll silo by silo. Renamed/removed fields and changed
> signatures are allowed, but promote by a cold restart. A gate classifies every change; a model
> never decides. Still no migrations and no legacy shims.

CLAUDE.md Hazards is updated in the same change that lands rolling upgrades.

## Two tiers

### Tier 1 — Candidate (`ICandidate`, keyed `aspire/candidate/{sha}`)

A disposable container built from a worktree, proving a change builds, boots and behaves.

State: sha, branch, worktree, image tag, ports, plan (`VerificationPlan`), compatibility
(`Compatible | Breaking(reasons)`), stage
`Proposed → Building → Starting → Healthy → Verified → Promoted | Discarded | Failed(stage, reason)`.

- `Propose(branch, plan)`: worktree from the live cluster's sha.
- `Start()`: build gate (compile + touched modules' unit tests), container image from the worktree,
  run it with its own Azurite holding a copy of live storage, no deployment Integrations except the
  LLM, no network route to the live cluster. Publishes `CandidateStarted(endpoints)`.
- `Verify()`: the live cluster drives the candidate over MCP through `IMcpServer`
  (`neurons_context`, the plan's `neurons_call`s, its resources and spans). Activating grains on
  the copied state is the first check. Publishes `CandidateVerified(report)` or `CandidateFailed`.
- `Classify()`: the compatibility gate (below); runs during `Verify`, stored in state.
- `Promote()`: refused without `Verified`; commits the worktree; calls `ICluster.Roll(sha)` when
  `Compatible`, `ICluster.Restart(sha)` when `Breaking`; then discards the container.
- `Discard()`: stops and removes the container and its storage; keeps the worktree.

At most one candidate per brain; a second `Propose` queues. Asking a newer version anything
(e.g. its Assistant) is `neurons_call` through the candidate's `IMcpServer` before promotion.

### Tier 2 — Live cluster (`ICluster`, keyed `aspire/cluster`)

The one real cluster on fixed ports 5080/5081, at least two silos.

State: silos (id, sha, status), current sha, stage `Steady | Rolling(sha) | Restarting(sha)`.

- `Roll(sha)`: start a silo on `sha` joining the cluster; once it is Active, drain and stop the old
  silos one at a time until all run `sha`. Grain interfaces carry `[Version(n)]`; the cluster uses
  a backward-compatible strategy and places new activations on the newest version. 5080/5081 never
  go down.
- `Restart(sha)`: stop every silo, start `sha` silos on live storage. About one cold start of
  downtime; the shell reconnects.
- `Silos()`: the silos and their versions, which is what the shell and SelfImprove display.

`ICluster` replaces today's `IAspire` resource mirror; resource state is read from the AppHost's
dashboard MCP through `IMcpServer`, not a custom bridge.

## Compatibility gate

`Classify` diffs the live build against the candidate build with Roslyn over the `*.Contracts`
assemblies and every grain state type (`[GenerateSerializer]` records and `Neuron<TState>` states):

- Added type, member, field with a new `[Id]`, signal, method → compatible.
- Removed/renamed member, changed `[Id]`, changed parameter or return type, changed grain type
  alias → breaking, with each reason named.
- A changed grain interface without a bumped `[Version]` → refused at `Verify`
  (`Failed(Verify, "version not bumped: …")`).

## Connectors

- `DockerCandidateConnector`: git worktree, `docker build`, `docker run`, storage copy (the
  Launcher's `Git`, `AzuriteStorageCopier` move here). Requires the Integration
  `DigitalBrain:Integrations:aspire:Workdir`.
- `AspireClusterConnector`: adds/removes silo replicas through the AppHost's resource commands
  (silos are an Aspire project with replicas); reads resources via the dashboard MCP.

Both are the only code touching git, Docker, processes and ports.

## Failures

| Where | Outcome |
|---|---|
| Build gate, image build, container start | `Failed(Building/Starting)`, worktree kept |
| Not healthy within the plan budget | `Failed(Healthy)`, container removed |
| Plan expectation missed / state does not activate | `Failed(Verify, expectation)` |
| Interface changed without version bump | `Failed(Verify, "version not bumped")` |
| New silo never Active during `Roll` | Stop the new silo, cluster stays on the old sha, `Steady`, `CandidateFailed(Promote)` |
| `Restart` sha does not come up | Restart on the previous sha; `CandidateFailed(Promote)` |
| Host crash with containers left over | On activation the candidate connector removes containers no `ICandidate` owns |

No retries, no raised timeouts: every failure is a terminal stage with a reason.

## Deleted

- `src/DigitalBrain.Launcher` (and its tests)
- `src/DigitalBrain.Modules/DigitalBrain/Revisions` (logic moves into `ICandidate`)
- Aspire bridge: `AspireBridge`, `AspireBridgeClient`, routes, `BridgeKey`
- `features/os/SelfImprove` synapses move to `Candidate*` signals and `ICluster.Silos()`

## Build order

1. **Candidate container**: `ICandidate`, Docker connector, verification over `IMcpServer`
   (Revisions verifier folded in); promote by `Restart` only. Useful on its own.
2. **Rolling cluster**: two silos, `[Version]` on grain interfaces, `ICluster.Roll`.
3. **Compatibility gate**: `Classify`, routing promote to `Roll` or `Restart`; CLAUDE.md policy update.

## Testing

- Module facts (`ModuleTest.Create().WithModule<AspireModule>()`, fake connectors): candidate stage
  machine; promote refused without `Verified`; compatible routes to `Roll`, breaking to `Restart`;
  orphan containers removed; failed `Roll` leaves the cluster `Steady` on the old sha.
- Gate facts: pairs of contract/state sources classified compatible or breaking with named reasons;
  unbumped interface version refused.
- Hosting facts: silo replicas ≥ 2; service/cluster id and storage container from configuration.
- Running: ask SelfImprove for an additive change (new Calculator operation) → candidate container
  verified → rolling upgrade, shell never disconnects, `Silos()` shows the new sha; then a breaking
  change → restart path.

## Out of scope

Cloud deployment, multi-brain promotion policy, rollback after promotion (git revert + promote),
sub-projects B and C.
