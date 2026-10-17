# Single Runtime and Device Connectors Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementation is recorded below and in `../reviews/2026-10-14-single-runtime-verification.md`. Original task checkboxes remain the detailed acceptance checklist; the execution record distinguishes automated, live, and unexecuted checks.

**Goal:** Run one authoritative brain runtime on the user's Windows PC, preserve its Windows connector, and remove the distributed execution infrastructure from the normal application.

**Architecture:** Co-locate required platform services, replace leased mesh persistence with encrypted local brain logs, then delete distributed ownership and machine transport. Devices remain connectors. Personal and circle brain scopes remain distinct inside one runtime.

**Tech Stack:** Existing .NET/Orleans/Aspire stack, C# modules, Flutter shell, xUnit/shared TestBrain harness. Reuse existing cryptographic and journal primitives; no new storage engine or transport dependency is required by this plan.

**Spec:** `docs/superpowers/specs/2026-10-14-single-runtime-devices-design.md`.

## Global constraints

- First release runs on the user's Windows PC. Remote device agents are out of scope.
- Preserve Windows public contracts, connection keys, device GUID and existing per-brain access checks.
- Preserve atomic state/signals, encryption, subscription watermarks, account permissions and marketplace/install behavior.
- One runtime does not mean one account or one logical brain scope.
- Never claim console working-directory checks are a command sandbox.
- No production fallback to `NoSignalJournal`; no distributed ownership compatibility layer in the final composition.
- Preserve unrelated working changes. Do not stop the current AppHost during investigation or delete its state.
- Use LSP definitions/references/diagnostics before changing C#/Dart symbols, as required by `CLAUDE.md`; map runtime-bound feature and Dart consumers too.
- Build/test individual projects, never the solution. Verify changed runtime behavior through Aspire and MCP with traces.
- Each task ends with focused validation and an explicit-file commit. No broad staging or data deletion.

## Review focus

1. Windows device GUID is accidentally removed with platform machine identity: Task 1 restart/device checks.
2. Removing part storage loses state-linked signals: Tasks 3/4 fault and replay tests.
3. Removing machine admission also removes user authorization: Tasks 5/6 cross-account and circle refusal tests.
4. A second runtime or candidate writes the same local state: Task 3 process-lock test and Task 7 isolated candidate test.
5. One-instance upgrade waits forever for a healthy sibling: Tasks 2/7 bounded restart/reconnect checks.

## Task 1: Establish the Windows preservation baseline

**Files:** keep production implementations under `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/` and contracts under the adjacent `.Contracts/`; extend the existing `tests/DigitalBrain.Modules.Microsoft.Windows.Tests/{WindowsConnectionFacts,WindowsEndpointFacts,FilesAndConsoleFacts,MachineIdentityFacts}.cs` only where coverage is missing. Add `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/SingleRuntimeWindowsFacts.cs` for the production path; do not edit another task's untracked `ShippedAppFacts.cs`.

**Interfaces:** preserve `IWindows.Facts/Roots/AllowRoot/RevokeRoot`, `IFileSystem.Read/Write/List`, `IConsole.Run` and `FileWritten` exactly. Preserve `WindowsKeys` and `IMachineIdentity.Id` in the Windows module.

- [ ] Record baseline test results and the current resource graph, without changing the running deployment. Use a dedicated allowed temporary folder for writes.
- [ ] Add missing assertions: connect by device ID; write/read/list and observe `FileWritten`; run `cd` and check output; revoke a root and reject the next file call; reject foreign IDs and unconnected/unauthorized calls; restart and retain the same device ID and authorized connection.
- [ ] Run `dotnet test --project src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests` and the focused new E2E test on an isolated Aspire target. Existing behavior tests should pass; future one-runtime topology assertions belong in Task 2.
- [ ] Commit the regression baseline. Existing unrelated test failures are recorded by name, never relabeled as caused by this plan.

## Task 2: Collapse topology, explicitly as a transition

**Files:** `src/DigitalBrain.AppHost/AppHost.cs`; `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/TrustClusterHosting.cs`; `src/DigitalBrain.Mcp/DigitalBrain.Mcp/McpHosting.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/TrustClientHosting.cs`; `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsMachineFacts.cs`; create `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/SingleRuntimeCompositionFacts.cs`; deployment handling in `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Deployment/{DeploymentNeuron,AspireCliClusterHost}.cs` and its deployment tests.

**Interfaces:** retain public UI/MCP addresses and the existing OS resource name `OperatingSystem-a` during cutover. One `digitalbrain-mcp-a` client host remains; the fronts may remain. Introduce no new public module contracts.

- [ ] Add a failing composition test: exactly one OS project, one MCP project, no B, no trust project, no network machine identity on MCP; shell/MCP readiness depends on the sole OS. A fresh boot must still provision its owner and features.
- [ ] Remove B and the standalone trust host from this composition. Use the existing no-trust-endpoint co-hosted service path. Retain the current part log temporarily, its local custody configuration and required persistent directories: do not merely unset Role and lose durable signals.
- [ ] Wire MCP to local platform clients through the sole OS's Orleans gateway. Preserve caller stamps and HTTP identity. Remove trust endpoint/pin/pairing configuration from this client path.
- [ ] Make the one-instance deployment branch stop/start without waiting for a healthy sibling; preserve build selection and post-restart verification. A brief shell reconnect is expected. Keep the front for stable URLs/TLS.
- [ ] Build AppHost and MCP; run OS composition and Aspire deployment tests; fresh-boot the isolated app and run Task 1's Windows checks.
- [ ] Commit. This removes the registration race from the network path, but is not completion: local legacy machine/sequencer/mesh services still exist until Tasks 5/6.

## Task 3: Extract a local encrypted brain log

**Create:** `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/{BrainStoreOptions,BrainLogModel,BrainJournal,BrainLog,BrainLogs,RuntimeStoreLock,BrainStorageKeys}.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Storage/{BrainLogFacts,BrainRecoveryFacts,BrainStorageKeyFacts}.cs`.

**Reuse/move narrow mechanics from:** `Parts/PartJournal.cs`, `Parts/PartLogModel.cs`, `Mesh/SegmentSeal.cs`, `Secrets/MasterKeyWrapper.cs`; retain existing files until their last consumers move. Register the new options owner in `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`.

**Proposed internal interfaces (new, not existing):**

```csharp
// BrainLogs owns lifecycle; one BrainLog per validated brain scope.
Task<BrainLog> BrainLogs.For(string brainId);
BrainRecord? BrainLog.Read(string grainId, string stateName);
Task<long> BrainLog.Append(string grainId, string stateName, long? expectedETag,
    BrainRecordChange change, byte[] record, Signal[] signals, CancellationToken ct);
Task<JournaledSignal[]> BrainLog.ReadSignals(long since, int limit, string? publisher, CancellationToken ct);
Task BrainLog.Checkpoint(CancellationToken ct);
Task<byte[]> BrainStorageKeys.GetOrCreate(string brainId, CancellationToken ct);
```

`BrainRecordChange` is None/Write/Clear. `BrainRecord` contains serialized bytes and the last write's entry ID. An entry persists state plus all signals, and both the entry and signal sequence counters. Expected ETag applies to Write/Clear; standalone signals do not change state. Empty state ETag is null. No lease or machine identifier appears in these contracts.

- [ ] Write failing tests for acknowledged save surviving reopen, atomic state/signals, stale ETag refusal, standalone signals, multiple signals in one save paginated without loss, stable cursors after reopening, and independent brain scopes.
- [ ] Implement one append gate per brain and an exclusive runtime-directory lock. Validate ETag, serialize and seal, append and flush to disk, then update the in-memory projection and acknowledge. Publish only after successful completion. If an append outcome cannot be determined, fail that store closed rather than acknowledging or replaying the command automatically.
- [ ] Reuse the existing custody wrapping capability for random per-brain keys. Persist wrapped keys atomically before accepting encrypted writes. Bind ciphertext to stable brain/generation IDs, not file paths. Wrong or missing keys refuse existing data; never silently generate a replacement for a populated brain.
- [ ] Implement checkpoint generations: latest records/ETags, counters and retained signals are complete before an atomic manifest switch. Keep the old generation until the switch succeeds; only then reclaim unreachable files. Keep all signal history initially unless a persisted subscription retention floor proves trimming safe; do not invent a fixed history cutoff.
- [ ] Add fault tests at append/flush/checkpoint/manifest boundaries: torn final write recovers preceding entries; authenticated-record corruption fails; interrupted compaction chooses a complete generation; second process cannot open the same directory; failed append does not emit signals; a copied directory with the same keys opens at a new path.
- [ ] Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*Storage*"` with the new tests' namespaces under `.Storage`; commit only when these checks pass. This is a storage extraction, not a new distributed log implementation.

## Task 4: Put neuron state and durable signals on the local store

**Create:** `src/DigitalBrain.Platform/DigitalBrain.Platform/Storage/{BrainGrainStorage,BrainSignalJournal,BrainStorageHosting}.cs`.

**Modify:** `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs`; `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SignalJournal.cs`; pending-signal handling in `Runtime/Neuron.cs` only if necessary. Port relevant coverage from `DigitalBrain.Platform.Tests.Unit/Parts/{PartGrainStorageFacts,PartSignalFacts,PublisherSignalsFacts,SignalsReadFacts}.cs` to new Storage tests. Update shared TestBrain and candidate composition to use the same production storage recipe with isolated directories.

**Interfaces:** `BrainGrainStorage : IGrainStorage`, `BrainSignalJournal : ISignalJournal`; preserve the current `ISignalJournal.Append/ReadSince/SignalsOf` signatures initially. `BrainStorageHosting.AddBrainStorage` registers the `cluster` provider and journal and retains kernel-registration decoration. The persisted signal IDs from Task 3 supply both publisher and brain cursors.

- [ ] Add failing integration tests: state+signals survive abrupt process termination; an acknowledged subscription resumes after its watermark; signal reads include persisted publishers not previously activated this run; no signal escapes a rejected state write.
- [ ] Switch the single OS's production composition to the new adapters. Remove role-triggered `AddMachinePartLogWhenConfigured` from this path. Preserve encryption and current key-validation behavior; no memory-storage fallback outside tests.
- [ ] Retain permission/provenance checks and kernel registration. Handle all grain key shapes through existing brain-scope resolution, including connection and kernel keys; do not guess scope by splitting an arbitrary string.
- [ ] Run Platform storage tests, Framework signal tests and Microsoft CSharp runtime subscription tests; run Task 1's Windows integration check and a persisted app mutation/restart through MCP.
- [ ] Commit. This is the point where leases and the mesh are no longer required for neuron persistence; removal follows only after other consumers move.

## Task 5: Keep identity, credentials and circles without machines

**Files:** `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/{MachineRegistration,GrainTrustClients,TrustClientHosting}.cs`; `Identity/Directory/IdentityStartup.cs`; `Secrets/{PartKeySecretSealer,SecretSealer}.cs`; `Connections/ConnectionBindings.cs`; identity/marketplace implementations currently under `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/{Identity,Marketplace}/`; Framework `Platform/Identity/IIdentityClient.cs` and `Platform/Connections/IPartSecretSealer.cs`; Circles `CircleBirth.cs`, `CircleNeuron.cs`, `CircleFactoryNeuron.cs`, contracts `ICircle.cs`, tests and first-party circle programs/UI consumers.

**Target contracts:** preserve account/member/grant and marketplace operations. Replace machine registration's provisioning responsibility with a local owner bootstrap service. Remove machine contributions from circle creation/acceptance; `ICircle.Found(string name)` replaces `Found(string name, string machineId)`. Remove Contribute, machine lists and machine-specific schedules from their contracts and every compiled/Dart consumer. Preserve sharing, invitations, membership removal, budgets and selected connection binding.

- [ ] Add failing tests for fresh Open/Secured bootstrap, second personal brain, circle creation without a machine registry, invitation/accept/remove, revoked member refusal, and isolation between unrelated brain scopes.
- [ ] Move required authority/catalog grains into Platform, keeping the `platform` storage name and existing authorization. Supply local identity/catalog clients; remove transport-oriented signing/counters from local calls. Do not replace authenticated checks with an unrestricted generic grain endpoint.
- [ ] Separate owner provisioning from machine binding and core acquisition. Preserve default feature installation and readiness ordering. Remove lease gates from birth and circle access.
- [ ] Replace shared-credential part-key sealing with local destination-brain sealing backed by Task 3 keys. Keep explicit user selection and connection-binding authorization. Prove unrelated scopes cannot open another scope's sealed credential; missing/wrong keys fail without exposing plaintext.
- [ ] Remove contributed-machine key wrapping, rotation-on-machine-removal, contribution UI and machine schedules. Membership revocation still immediately blocks further calls. Ordinary circles and publications remain; device connections do not grant brain membership.
- [ ] Run Platform identity/connection tests and the Circles test project, including shared connections/publications. Build affected features through the existing compile gate. If Dart contracts change, run shell analysis/tests and hot reload the connected test shell.
- [ ] Commit. Keep useful local custody primitives; do not delete the Windows connector's device identity along with the platform identity.

## Task 6: Delete the distributed execution stack and retire mesh-only services

**Candidate deletions, after reference verification:**

- Platform `Parts/{PartRouter,PartRoutes,PartCallFilter,ForwardedCallEndpoint,PartReminderFilter,PartActivations,MachineTrustHosting,MachinePartEndpoints,LeasePreference,NotHolderException,PartLease}.cs`, then old PartLog/PartLogs/storage/journal/model/options once extracted consumers are switched.
- Platform `Links/`; machine-bound `Trust/{TrustDeployment,TrustSigner,MachineRegistrar,MachinePairing,MachineCounter,MachineRegistration}.cs`; platform `Sequencer/` and trust-side sequencer ownership classes.
- Framework distributed `Links/`, machine signing/agreement, stand-in activation contracts, and part-key contracts only after local custody/shared-secret consumers are moved.
- Trust-side `Links/`, mesh directory/registry/seed/proof/storage-credit services; Platform `Mesh/` erasure/placement/audit/node code and `Compute/StorageCreditPuller.cs`. Retain/move `SegmentSeal` for local storage. Check all `IMeshStore` consumers before deleting its contract; if a non-runtime feature uses it, isolate that feature rather than silently removing its behavior.
- `src/DigitalBrain.Trust/` executable and the `DigitalBrain.Platform.Trust` project after surviving identity/catalog/key functionality has moved. Update project/solution references.

**Interfaces:** no production dependency on MachineRole, CoreHolder, part leases, machine registration or machine transport. Keep normal user authentication, usage metering, budgets and local custody. Replace legacy topology tests with single-runtime boundary tests; retain transferred durability/security assertions.

- [ ] Map definitions/references/callers with LSP for each deletion group, including tests, hosting, compiled app sources and UI contracts. Record any non-runtime consumer before its deletion.
- [ ] Remove network trust/mesh startup registration from PlatformHosting and MCP. Remove dead rate-limit settings specific to machine account registration, pins, pairing secrets, volunteer offers and machine port allocation.
- [ ] Delete the now-unreferenced implementation groups and their obsolete protocol-only tests. Keep permission tests under their local replacements. Update configuration ownership and architecture assertions to describe the new boundary.
- [ ] Add composition checks that the OS registers local storage and no distributed lease/router/mesh transport services; the Windows module still exposes its three neuron contracts.
- [ ] Build Platform, Framework, OS, MCP and AppHost projects individually; run affected architecture and module suites. Inspect references and production service registrations, not merely the running resource count.
- [ ] Commit. If a feature still needs mesh for an independent purpose, document it as optional and excluded from runtime boot; do not label its implementation deleted.

## Task 7: Finish host, upgrade and end-to-end verification

**Files:** AppHost; Microsoft Aspire hosting and deployment/candidate implementations and tests; `src/DigitalBrain.OS/DigitalBrain.OS.Testing/` target setup only where required (preserve unrelated edits); shared testing host composition; `CLAUDE.md` and active architecture documentation.

**Interfaces:** stable UI and MCP URLs; one active runtime per state directory; candidate hosts get isolated brain storage, platform persistence and device-test roots. A promoted build restarts the sole runtime; its caller may disconnect, then reconnect and verify the selected build.

- [ ] Complete candidate storage isolation and state-directory handling. Never let a test/candidate acquire production's lock or connect to production's platform store. Update any snapshot/copy helper that only copied Azurite to account for the local brain store, using a coherent checkpoint rather than copying live files arbitrarily.
- [ ] Test one-instance promotion and rollback to a compatible build against isolated data; observe bounded shutdown, reconnect and state recovery. Do not promise arbitrary cross-format rollback. Retain fronts initially; removing them is a separate small task if desired.
- [ ] Run Windows, Platform, Framework, Circles, CSharp runtime, Aspire module, OS composition and relevant E2E suites. Record actual commands/results, with no blanket passing claim for suites not run.
- [ ] Cold-start and restart the isolated AppHost several times without a one-minute delay. Verify one healthy OS, one healthy MCP client host and the shell. Run file read/write/list, `FileWritten`, `cd`, root revocation, wrong-device refusal, a durable app mutation and subscription replay through MCP. Inspect traces for local OS execution and absence of cross-machine forwarding.
- [ ] Mark the old federation/brain-as-data plans superseded for this deployment, link the new spec, and correct rolling-failover and "every machine runs the OS" documentation. Do not delete historical decision records.
- [ ] Commit and present the verified cutover artifact. Preserve the user's current state and machine-id file. This plan authorizes neither a silent reset nor an automatic schema conversion.

## Completion checklist

- [x] Runtime on the Windows PC; no new device agent.
- [x] One OS and one MCP client host; no separate trust host or OS B.
- [x] Windows connection, device ID and public operations preserved.
- [x] Durable encrypted state/signals and restart/replay checks pass.
- [x] Membership/credential isolation and ordinary circle workflows preserved.
- [x] Distributed ownership, forwarding and machine admission removed from production composition.
- [x] Volunteer mesh services removed or independently isolated with explicit surviving consumers.
- [x] Single-runtime update behavior honest about interruption and tested.

## Execution status

The single-runtime implementation is committed on `codex/single-runtime-devices`. Tasks 2–6 are implemented. Windows production-path verification uses the reusable `scripts/verify-single-runtime.py` against the actual Aspire/MCP fronts instead of introducing another heavyweight E2E fixture. The Windows unit suite retains connection, authorization, device-identity and TPM tests. Task 7 has repeated cold boots, MCP device operations and durable recovery checks; candidate promotion/rollback is covered by deployment tests, not a live release. Existing distributed data is preserved for a separately scoped cutover.

Candidates now use fresh isolated data and keys rather than copying an incomplete live snapshot. Runtime durability and replay are tested independently. See the verification record for exact results and remaining repository-wide failures.

## Original planning status

The scope and local-PC choice came directly from the user. New local-storage signatures and the seven tasks are proposed implementation decisions, not claims of existing APIs. No code was changed, no test suite was run and no live resource was restarted while preparing this plan. Execute sequentially because the deletion tasks depend on the storage and identity replacements; a topology-only change is an intermediate milestone, not the completed simplification.
