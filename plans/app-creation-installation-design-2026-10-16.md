# Creation-to-installation remediation design

Status: proposed design for review, not implemented or accepted. Date: 16 October 2026.

## Baseline and outcome

Runtime inspected at `e25b619dc37743b059d8e6fa184dd9bd64c3de8c`, with a clean working tree at inspection. Documentation HEAD is `8182b1adf680fd54d1b5a067a9ab37e17bd0f590`, with substantial pre-existing tracked and untracked changes. Preserve those changes. The earlier assessment used runtime `d95e58d8578da360742e18a55fcd52c06f23edaa`; its observations remain historical evidence.

Deliver APP-01 through APP-09 and the exact-release installation journey through the existing author/create, implement, workspace, publication and recipient flows. Keep the neuron, signal, behavior, connector, presentation and shared testing architecture. Hosting and commercial orchestration stay in IntoChat Cloud. No extraction, rename, shared-store reset, custody-key replacement, commit or push is part of this design.

## Choices

Recommended: reconcile the existing contracts and add bounded durable reconciliation around build attempts and candidate deployment. This retains the current architecture while addressing the failure boundaries.

An in-memory retry queue alone is insufficient: it cannot reconcile a process interruption. A new general workflow engine would add a competing subsystem and exceed the requested scope. Neither alternative is proposed.

## 1. Presentation and generation

Remove the obsolete Entry response fields and instructions from Author, Builder, synapse authoring, sandbox authoring guidance and Ino navigation. The generated program must compose real UI neurons and call `IApp.Present(expectedProgramRevision, presentation)` from its executing assignment. The named view must point to a renderable root within the owning brain. Reuse current shipped composition examples and typed controls.

The specification identifies whether the app is visual or genuinely headless, its operations, retained results, connection requirements, empty/loading/error states and observable acceptance scenarios. Do not introduce a replacement manifest entry pointer. A headless app does not need a synthetic view. A visual app without a current, error-free named view remains presentation-pending or presentation-failed.

Update prompt contract tests with the executable examples. Compilation establishes only code validity; browser rendering and interaction establish the visible outcome.

## 2. Verification and source acceptance

For code-bearing bundles, require a sandbox, a completed successful compile and valid synapse shape. Missing compiler, unavailable compiler, exceptions and unsuccessful compilation prevent publication, export and source acceptance. Cancellation propagates and does not become success. Return contextual errors without exposing secrets. Intentional non-code bundles retain their existing supported behavior.

Validate `FeatureCatalog.SaveToSource` before `FeatureDirectory.Write`; the inspected implementation currently writes before reload validation. Preserve the previous catalog snapshot on all verification failures. Stage filesystem replacement and restore the previous source if a subsequent write/reload fails; do not claim transactional source acceptance from an in-memory catalog lock alone.

Tests explicitly inject working compiler doubles where compilation is not their subject. Add failure cases for both gates and assert unchanged release records, listings and source files, not only thrown exceptions.

## 3. Full replacement, incremental edits and deployment

Builder returns a complete program: all behavior and shared C# files intended to remain. Omitted program files are removed. Preserve existing non-program assets unless explicitly replaced; omission does not delete assets, stored results, settings or connections. `WriteBehavior` remains an incremental edit. Explain these different semantics in prompts, contracts and tests.

Capture the build's base program revision and relevant authored-input version. Reject completion after a competing program, specification, manifest or configuration edit. Fence progress as well as final results with the attempt identifier; the current read-then-Progress pattern is not an atomic attempt check.

Construct and compile the candidate before modifying the current program or history. Deployment spans app state and `IBrainPrograms.Assign`, so use an explicit durable pending-deployment record with the previous working program and candidate identity. Reconcile this record after interruption. Only expose successful deployment after the intended assignment has been acknowledged. Keep candidate validation, assignment acknowledgement and presentation readiness distinct.

Do not reuse an old program revision when restoring old source: rollback uses a fresh revision so a late candidate cannot publish into it. Retire omitted assignments through whole-program assignment. On failure restore the previous working source and assignments, preserve useful result neurons, and surface recovery failure if compensation itself fails. Never report a rollback as successful merely because its source was persisted.

Persisted additions must use new serializer IDs, safe defaults for older state and concrete arrays. Keep C# wire records and Dart mirrors aligned where public snapshots change. Verify these details through LSP mapping before editing.

## 4. Interrupted-build recovery

Use the existing durable reminder facility to reconcile build deadlines and pending deployment; do not rely on grain activation or a process-local timer alone. Registration and state-write ordering must tolerate a crash between the two operations. A reminder with no matching active attempt is harmless and removable.

Recommended recovery policy: an expired attempt is marked interrupted/failed with an explicit retry action, and its late progress/results are fenced. Do not automatically replay model work whose outcome is unknown. A user retry creates a new attempt and retains the working program and useful results. This provides bounded recovery without implying exactly-once model execution.

Give queued work host-shutdown cancellation and a bounded attempt lifetime. Graceful cancellation and process termination both leave reconciliable state. Ordinary grain reactivation alone must not label a still-running worker as interrupted. Verify the bound against the configured build deadline plus reminder scheduling tolerance.

## 5. Deployment, visibility and acceptance

`Live` describes deployment only. Creator progress says deployed when assignment succeeds and separately reports waiting for presentation, presentation error, or a current view available. Workspace discovery and navigation use current named views and revision checks.

Behavioral acceptance remains evidence tied to an exact program revision and tested scenarios. Neither a capability string, a timer, compilation nor a presentation declaration means the app is behaviorally accepted. Avoid introducing an unearned permanent accepted flag.

## 6. Repeatable browser acceptance

Extend the shared Aspire/Playwright infrastructure with a deterministic model fixture that responds through the actual author and implement endpoints. Use real compilation, runtime, storage, identity boundaries, workspace and browser. Fixture generation proves pipeline behavior, not live-model quality.

Use new disposable stores and two new identities. Create apps for text transformation, two independently retained notes/results, and selection with multiple controls. Assert rendered values, state changes and stable idle behavior. Inspect correlated assignment and signal telemetry to detect repeated effects or feedback loops.

Repair a generated app, remove/rename a behavior, reject invalid compilation, induce a presentation error, retry and retain prior results. Terminate the actual runtime process while a controlled build is in flight, restart against the same run-owned store, observe bounded recovery and retry. Separately restart after successful results and assert retention and no duplicate effects.

Publish immutable A, edit publisher to B, discover and install exact A as the recipient, then interact, reload and restart. Check version/digest, recipient-owned settings, empty publisher connection bindings, local binding requirements, idempotent installation retries after recipient edits, forged references and unauthorized access. A hand-written direct import does not satisfy this journey.

## 7. Resource readiness, cleanup and evidence

Inspect actual PhotoCraft/FilmCraft image builds, startup events, health probes and MCP requests. The earlier cold-start race is a hypothesis supported by historical logs, not a confirmed complete diagnosis. Required hosted MCP resources must be ready before connected assertions. Preserve truthful unavailable-provider behavior when hosting is disabled or a provider fails.

The inspected ArtCraft module uses persistent containers and fixed ports. Test-run ownership and disposal therefore need explicit treatment; do not stop containers based only on matching service names or ports. Capture resource identifiers owned by the fixture, impose bounded cleanup, and retain diagnostic output before cleanup. Investigate the Aspire disposal failure independently of scenario assertions.

Retain full logs and test-result files for the initial Apps run as well as any reruns. The historical unidentified single failure has no established root cause and must not be relabeled as fixed without evidence.

## Verification and completion gates

Run relevant Apps, OS, Circles, runtime/compiler suites, affected frontend checks and individual project builds. Add fault tests at candidate validation, assignment, state persistence, recovery, source publication and retry boundaries. Inspect LSP diagnostics after edits. No full Windows solution build is required solely for coverage accounting.

Record commands, exit codes, individual failures, current HEAD plus dirty-tree qualification, changed files, telemetry correlation identifiers, exact app/release/program revisions and screenshots without secrets. Separate source-verified implementation, locally observed behavior, incomplete engineering and externally gated live-model acceptance.

Live-model testing requires an approved configured model and is separate from deterministic integration. This pass has not inspected model configuration and does not assert that it is missing.

## Evidence for this design pass

Read repository instructions, handbook index/contributing guide, requirements, app-generation assessment and the 16 October verification record. Inspected AppNeuron, Creator, AppWorkQueue, FeatureCatalog, CSharpAppRuntime, IApp, AppState, presentation guards, ArtCraft hosting, ReferenceBrainFixture and existing runtime reminder reconciliation.

Commands included `git status --short`, `git rev-parse HEAD`, `git log -3 --oneline`, file reads, `rg` discovery, `dotnet tool list --global`, and `Get-Command csharp-ls,OmniSharp,dart`. Local `csharp-ls` 0.28.0 is installed. LSP semantic requests have not yet been performed; text inspection is not represented as semantic mapping.

No product code changed, no tests or product processes started, and no browser acceptance performed during this design pass. All implementation and acceptance gates above remain open.
