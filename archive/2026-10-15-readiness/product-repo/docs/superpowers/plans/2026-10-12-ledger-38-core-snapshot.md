# Ledger 38: a part larger than one mesh segment (owner/core snapshot)

> **Status: Fix B and Fix A (A4) built, unit-verified; live verification pending.**
>
> **Ruled 2026-10-12:** Task 0 run (result below); **D3 = accept a wipe**; **D4 = 8 MiB + signals**
> (built); **D5 = no sweep exists** (documented, not built); **D2 = recommended yes**.
>
> **Fix B — BUILT.** Chunked snapshots implemented in `PartLogModel.cs`/`PartLog.cs`/`PartsOptions.cs`
> (inline when small, chunked when larger than `SnapshotChunkBytes`), tests in `PartSnapshotFacts` and
> `MeshAuditorFacts`. Platform targeted 117/117; full suite 469/472 (2 pre-existing load flakes,
> `ScopedAuthorityFacts`/`PartLeaseFacts`). **Live verification pending.** Not committed.
>
> **Fix A — A1 refuted, replaced by A4 (built).** A1 (register on activation, retire on deactivation)
> broke the directory's durable-catalog contract: `CSharpFileListingFacts.AFileKeepsItsName…TheKernelListsItUntilDeleted`
> requires a deactivated `ICSharpFile` to stay listed until deleted (and `apps` the same for
> `/apps`/Memory). The kernel instance directory is a **durable catalog**, not a live set. A1 was
> reverted. **A4 (ruled):** `InstanceDirectoryOptions.Limit` (default 4096); when a `{brain}/{type}`
> directory exceeds it, `Register` drops the oldest entries that are not currently active, so ephemeral
> neurons cannot accumulate while active instances and small catalogued types are untouched. Files:
> `InstanceDirectoryOptions.cs`, `KernelGrains.cs`, `BrainHosting.cs`, `KernelFacts.cs`. Framework
> 144/144, CSharp 189/189. **Live verification pending.** Not committed.

Ledger 38, verbatim (`docs/superpowers/loop/ledger.md`):

> Root cause of 35 live: owner/core's snapshot (~97 MB) never fits the mesh's 16 MiB per-shard cap; every
> flush retried it under the lock and only one small batch committed per failed snapshot. Backoff landed
> (Task A r2–3) so batches trim, but a core too large to snapshot means the segment chain and reopen
> replay grow without bound. Needs a split/chunked snapshot (HeadPayload change) or a smaller core.
> — open (user / brain-as-data owner)

The prior ruling that deferred this: `docs/superpowers/ledgers/2026-10-10-brain-as-data.md` line 455
("segments over 128 MiB refused (**no chunking**)") and line 2126 ("The 128 MiB segment limit (T23-3): a
snapshot larger than `DataShards × MaxShardBytes` fails until snapshot chunking exists").

## Context

- **The mesh is sealed, immutable segments.** `MeshStore.Write` seals the plaintext, Reed–Solomon codes
  it, and refuses any segment whose computed shard exceeds `MaxShardBytes`
  (`src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/MeshStore.cs:27-29`). By default
  `DataShards = 8`, `ParityShards = 16`, `MaxShardBytes = 16 MiB`
  (`.../DigitalBrain.Platform.Trust/Mesh/MeshOptions.cs:8-21`), so **one segment is capped at
  `8 × 16 MiB = 128 MiB`** of sealed plaintext.
- **A part snapshot is exactly one segment.** `PartLog.Snapshot` serializes one `PartSnapshot` and writes
  it with one `_mesh.Write` (`.../Platform.Parts/PartLog.cs:535-546`); the head carries one `MeshRef`
  (`PartLogModel.cs:69-87`), CAS'd by `PartLease` (signed, AEAD-sealed; `PartLease.cs:77-100`).
- **A part is the brain core or one app** (`Framework/Parts/PartId.cs:9-13`). Core holds every neuron key
  `{brain}/…` that is not under `apps/{app}/` — the kernel registry, runtime (`{brain}/runtime`), runs
  (`{brain}/runs`), shell state (`{brain}/shell/{digest}`), connections, integrations, identity.
- **The failure mode:** a snapshot above 128 MiB can never be written. The part then appends batches to a
  chain that is never replaced, so every reopen replays the whole chain and the journal is trimmed later
  and later. Run-2's live logs showed owner/core at ~97 MB failing repeatedly; Task A's snapshot backoff
  (1→30 min, `PartLog.cs:475-481`) keeps batches committing but does not remove the ceiling
  (`.superpowers/sdd/2026-10-11-forking-loop-mvp/progress.md:72`).

## Root cause: two independent defects

**B — hard per-segment cap (structural).** No amount of backoff fixes a snapshot larger than one segment.
Any part whose state legitimately exceeds 128 MiB (a big app, an accumulated core) can never snapshot.

**A — the core grows without bound (behavioural, and likely the dominant contributor).**
`InstanceRegistration.WriteStateAsync` registers a neuron in `{brain}/{type}` (the core's instance
directory) on its **first durable write**, and removes it only from `ClearStateAsync`
(`Framework/Runtime/Kernel/InstanceRegistration.cs:15-36`). Neurons are **not** retired on deactivation,
so every neuron that ever persisted state and was never explicitly cleared stays in the directory
forever — per-request answer texts, `{app}/recalls/{id}`, synapse child neurons, `{brain}/shell/{digest}`
digests, timers, runs aggregates. Worse, `InstanceDirectoryGrain.Register` rewrites the **whole** array on
every registration (`KernelGrains.cs:44-53`), so each new instance pushes the entire (growing) directory
through the part log again — O(n²) writes, and the snapshot grows by the whole directory every time.

A 97 MB snapshot should still fit 128 MiB, so the exact ceiling the live part hit is not yet explained;
most likely the serialized `PartSnapshot` (Orleans overhead + `RecentSignals`) is larger than the record
bytes, or another core record dominates. **Task 0 measures this before any change.**

Fix A removes the growth; Fix B removes the ceiling. Both are needed to be robust: A stops the core
ballooning, B lets any part snapshot once it is large.

## Goals / non-goals

- **Goal:** any part snapshot succeeds regardless of its size, and owner/core stops growing on a used
  brain.
- **Non-goal:** multi-blob objects in the mesh generally, compression, per-record snapshot keys,
  cross-machine chunk placement, back-compat migrations (policy: no state compatibility — a reshape
  restarts; a local volume wipe is acceptable).

## Design

### Fix B — chunked snapshots (structural)

Keep `HeadPayload.Snapshot` a **single** `MeshRef`; point it at a new **index** object whose chunks hold
the records and recent signals:

```
PartSnapshotIndex { long Seq; long SignalsFrom; MeshRef[] RecordChunks; MeshRef[] SignalChunks; }
PartRecordChunk   { SnapshotRecord[] Records; }
PartSignalChunk   { LogEntry[] Entries; }
```

`Snapshot()` (`PartLog.cs:515-568`):
1. Split `records` into `RecordChunks` of at most `SnapshotChunkBytes` serialized bytes, and `recent`
   signals into `SignalChunks` the same way.
2. Write each chunk as its own segment (`{part}/snapshot/{seq}/{i}-rec` / `-sig`).
3. Write the index as one small segment (`{part}/snapshot/{seq}`).
4. CAS the head with `Snapshot = indexRef`, `SnapshotSeq = LastSeq`, `Head = null`,
   `SegmentsSinceSnapshot = 0`.
5. Discard the previous index **and its chunks** and the chain.

Replay (`PartLog.cs:238-268`): read the index, then each chunk in order, `Apply`. **Ruled: no
legacy fallback** (D3) — the reshape restarts and the local mesh volume is wiped once (no migration
shims; the store is the disposable dev store).

Audit / repair / reseal reach the index plus every chunk:
- `Reached()` (`PartLog.cs:592-597`) returns the index and all chunk refs (they are "reached" exactly as
  chain segments are today); `_chain` grows a parallel `_chunks` list (cleared on snapshot).
- `WhileReached` (`:601-611`) matches index or any chunk.
- `MeshAuditor.Audit` (`Mesh/MeshAuditor.cs:79-125`) proves each ref; a failed chunk is repaired and the
  **index is rewritten** with the new ref and CAS'd — `CommitRepairedSnapshot` (`PartLog.cs:632-638`)
  becomes chunk-aware, or the auditor repairs the whole index (simpler: rewrite index → CAS
  `head.Snapshot = newIndex`).
- `Reseal`/`HealBySnapshot`/`HealBySnapshot(resetAuditRound)` are unchanged in intent; they now write a
  chunked index.

Atomicity: chunks then index then CAS. A crash after chunks but before the index CAS leaves the old
head intact and the new chunks unreferenced; the reachability sweep reclaims them (verify the sweep
still runs for snapshot refs — `MESH` reachability-from-heads).

New option `PartsOptions.SnapshotChunkBytes` (default e.g. 8 MiB → ~1 MiB shards, comfortably under the
16 MiB cap), validated positive and `< DataShards × MaxShardBytes` at wiring.

### Fix A — a self-compacting instance directory (design gate)

Options to choose from:

- **A1 — register on activation, retire on deactivation.** *(Built and reverted: it breaks the durable
  catalog — a deactivated `ICSharpFile`/`IApp` must stay listed until deleted per
  `CSharpFileListingFacts`.)* The directory would list live instances only; reactivation re-registers.
  Only viable if a Framework marker distinguishes **catalogued** neurons (app/file roots) from
  **ephemeral** ones (answer texts, recalls) and only the ephemeral retire — an explicit contract.
- **A2 — per-key directory records.** `{brain}/{type}/{instance}` records instead of one array; writes
  are O(1); still needs a liveness/compaction rule to remove dead keys.
- **A3 — don't register ephemeral types.** A contract-level "ephemeral" marker keeps `neurons_list`
  honest for durable types and stops the bloat at the source. Needs a curated type list (answer texts,
  recalls, child neurons) — brittle.
- **A4 — compaction pass.** Keep today's semantics; a periodic owner sweep removes entries whose state
  record no longer exists. No API change; work is bounded; the directory can still grow until swept.

Recommended: **A4** (keep the durable-catalog semantics the tests pin; a periodic owner sweep removes
entries whose grain state no longer exists — the safe, no-API-change option), or **A1′** (A1 plus a
Framework `ICataloguedNeuron` marker on app/file neurons so only ephemeral types retire). A1 as
originally written is refuted.

## Tasks

### Task 0 — Diagnose (gate-free, read-only) — DONE 2026-10-12

**Result.** Added `GET /machine/parts/{part}/summary` (owner-only, read-only) beside the records route and
a fact (`MachinePartEndpointFacts.TheOwnerReadsAPartsSummaryGroupedByGrainTypeAndState`, passing). Started
the tracked AppHost (no peer AppHost was live) and called it on the fresh owner core:

```
owner/core: 32 records, 30,639 bytes
  microsoft.csharp.runtime  state       1 rec   20,520 B
  kernel.instances          instances  13 rec    5,914 B
  intochat.shell-part       part       10 rec    3,003 B
  ai.router / kernel.typetable / ui.workspace / shell-state / kernel.types / stage / brain / postgres.tables   ~1.2 KB
```

**Interpretation.** The 97 MB is **not** reproducible from the current store: the run-2 owner core was
reset (the fresh core opens to 30 KB, so its head no longer names a 97 MB snapshot). Static analysis then
shows the only **unbounded** core structure is the instance directory: `kernel.instances` gains one entry
per neuron's first durable write and loses one only on `ClearState` (no deactivation retirement), so over a
long run it grows with every ephemeral neuron (answer texts, `{app}/recalls/{id}`, synapse children,
`{brain}/shell/{digest}`), and each `Register` rewrites the whole array. `BrainRuntimeState.Programs`
(`Apply`, `BrainRuntimeNeuron.cs:211-219`) and `Subscriptions` are bounded by live programs/behaviors, and
`shell-part` is small. So **Fix A is the right target**; the exact 97 MB composition can only be confirmed
on the next accumulation.

**Follow-up folded into the build.** Add a growth log: when a snapshot exceeds a fraction of the segment
cap, log the same per-group composition (reuse the summary grouping in `PartLog.Snapshot`), so the next
occurrence names the culprit. Keep the summary route as the on-demand tool.

### Task A — the chosen directory fix (needs Open decision D1/D2)

- **Files (A1):** `Framework/Runtime/Kernel/InstanceRegistration.cs` (register on read/activation,
  retire on deactivation), `Framework/Runtime/Kernel/KernelGrains.cs` (`InstanceDirectoryGrain` state
  shape and delta writes), possibly a deactivation participant in
  `Framework/Runtime/Neuron.cs`/hosting; callers of `Retire` (`Kernel.cs:54-61`, `MachinePartEndpoints`).
- **Files (A4):** a sweep service in `Framework/Runtime/Kernel` + a Platform host hook.
- Facts in `Framework.Tests.Unit/Kernel/KernelFacts.cs`: a deactivated instance leaves the directory; a
  reactivated one returns; registration is one small write (assert the part-log entry size, not the whole
  array).

### Task B — chunked snapshots (needs Open decision D3/D4/D5)

- **Files:** `Platform/Parts/PartLogModel.cs` (index + chunk records), `Platform/Parts/PartLog.cs`
  (`Snapshot`, `Replay`, `Discard`, `Reached`, `WhileReached`, `CommitRepairedSnapshot`, `Reseal`,
  `HealBySnapshot`), `Platform/Parts/PartsOptions.cs` (`SnapshotChunkBytes`), `Platform/Mesh/MeshAuditor.cs`
  (audit/repair the index+chunks), and its callers.
- Facts in `Platform.Tests.Unit/Parts/PartSnapshotFacts.cs`:
  - `ASnapshotLargerThanOneSegmentIsChunkedAndReopens`
  - `EveryChunkOfASnapshotIsReachedAndAudited`
  - `ARepairedChunkIsPointedAtByTheRewrittenIndex`
  - `ChunksOfAReplacedSnapshotAreDiscarded`
  - `ASnapshotChunkWriteFailureStillLeavesTheOldHead`
  - Re-run `AnOwnLogWhoseSnapshotTheMeshRefusesKeepsCommittingAndTrimmingItsJournal`
    (`PartLogFacts.cs:447`) and `ARefusedSnapshotWaitsOutItsDelay…` (`:473`).

### Task C — live verification

- Build a part larger than 128 MiB in a fact and confirm snapshot + reopen; then, on a live OS with an
  owner core, confirm the core snapshots (no repeated `SnapshotNotWritten` warnings) and the journal
  shrinks instead of growing (re-measure the run-2 trend: 43→207 MB on the old build).
- Regression: Platform suite (5-minute cap), Architecture (no new failures), CSharp `PartLogReplayFacts`,
  Client.

## Risks / rollback

- **A reshaped `HeadPayload`/snapshot fails old heads at activation** (CLAUDE.md hazard: a reshaped state
  fails at activation or silo start as a `wireType`/deserialisation error). Mitigation: the interim
  legacy-read fallback (D3), else wipe the local mesh volume once (no migration shims).
- **Audit/repair is the highest-risk surface.** Descope option: audit the index only (chunks reached
  through it) — loses per-chunk detection; decide in D5.
- **Chunk-count growth** for very large parts inflates the index; cap chunks or accept it (the index is
  still small relative to the data).
- Rollback: both fixes are additive; revert the commits and wipe the local mesh volume to the previous
  head. No production data exists (dev store).

## Open decisions (the user must rule before Tasks A/B build)

| Id | Decision | Recommendation |
|----|----------|----------------|
| D1 | Instance-directory fix: A1 activation lifecycle, A2 per-key records, A3 ephemeral types, A4 compaction sweep | **Ruled: A4 built; A1 refuted** |
| D2 | May `neurons_list` stop listing dormant/never-active ephemeral neurons? | Yes (they are addressable, not enumerated) |
| D3 | May the `HeadPayload` shape change force a wipe, or must legacy single-blob snapshots still replay? | **Ruled: accept a wipe** |
| D4 | `SnapshotChunkBytes` default and whether signals chunk too | 8 MiB; signals chunk yes |
| D5 | Does a reachability sweep already reclaim orphaned snapshot chunks, or must one be added? | Verify; add if absent |

## Roadmap for the other open items (each blocked on its gate)

Nothing here is built until the user rules. Listed so the plan closes the whole open set.

| Item | Gate / decision needed | Shape |
|------|------------------------|-------|
| P1 privacy scope | Where the flag lives, which option names the private-scope local model, whether retrieval embeddings follow it | Contract + options; blocks the fast path's model-by-scope step |
| G13 second local brain | May the loop create a second account/brain on the Open-posture localhost | Test-only harness |
| G14 windows connection | May the loop create a `windows` connection to this PC | Test-only harness; unblocks Files + M3 |
| G15 SelfImprove restarts | Restarts conflict with "restarts only between verification windows" | Host/verification policy |
| G16 embedding model under privacy scope | Default embedder is cloud `ITextEmbedding3Small` | Options + retrieval |
| NG-1…NG-5 (Demo 2) | Candidate identity, file creation in a draft worktree, `IRoslyn` lifecycle, source-booted AppHost, `refs/digitalbrain/live` advanced by another session | Plan B Tasks 6–9 |
| K1b | Kernel `Feature` record: drop or schedule "Features gain program hash + behaviors" | Kernel contract |
| SUB | Subscribe skips access policy; cross-app subscription scopes | Contract change |
| G5b/G6b | Per-device volumes / an account's bound devices | Identity + M3 |
| UI1 | Tree/Graph/Map Flutter renderers | Flutter shell |
| G10b | External file watcher on the machine's silo | Connector |
| Toolchain 23 | `csharp-ls` cannot run under .NET 11 | New language server (roslyn-ls / newer csharp-ls) |
| Vocabulary ring | `SignalDeliveries` + `InternalsVisibleTo` from the vocabulary ring | Same front as SUB |