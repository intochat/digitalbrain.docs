> Historical design: distributed runtime portions are superseded for the local-PC deployment by [single-runtime devices](../specs/2026-10-14-single-runtime-devices-design.md). Windows connector functionality remains.

# Brain as Data — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brain becomes data — a key plus encrypted state in the mesh — so any machine trusted with a part's key can lease and run that part, writes are never lost, and no store, silo or node has to be trusted with plaintext.

**Architecture:** Two kinds of cluster (Q24). The platform **trust cluster** holds the sequencer, the storage-node directory, keyrings, the ledger and identity; it persists in `platform` storage and hosts no neuron. Every **machine** (a user's own, a circle member's, or our cloud) is a single-silo cluster (Q12) that hosts the parts it leases; on a machine, the `cluster` grain storage that every neuron already names *is the part log* (Q27). One log entry is one neuron change — its new state record and the signals it publishes, committed together — batched into sealed `IMeshStore` segments (Q23) and anchored by a signed compare-and-set head at the sequencer (Q10, Q18). Own machines hold long leases and journal locally first, so a private brain keeps working through a sequencer outage (Q26). Neurons do not change.

**Tech Stack:** .NET 11 RC, Orleans, `System.Security.Cryptography` (AesGcm, ECDsa P-256, ECDiffieHellman P-256, HKDF, SHA-256), xUnit v3 on Microsoft Testing Platform, `DigitalBrain.Testing.Module`, Aspire + `digitalbrain-mcp` for live verification. Later stages add `System.Net.Quic`, DPAPI/TPM through the Windows module, and Wasmtime.

**Spec:** `docs/superpowers/specs/2026-10-10-federation-circles-mesh-design.md` (Q1–Q27). Mesh store already shipped: `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/` behind `src/DigitalBrain.Framework/DigitalBrain.Framework/Mesh/IMeshStore.cs`.

## Stages

| Stage | Tasks | Ends with |
|---|---|---|
| **A. Core in one process** (dev) | 1–16 | trust grains and a machine's part log in one silo; every guarantee testable; live run through `digitalbrain-mcp` |
| **B. Split and connect** | 17–22 | trust cluster and machine hosts as separate processes, linked by the transport — **first release** (Q25 mesh from day 0 on seed nodes) |
| **C. Network** | 23–30 | volunteer storage + credits, circles, public compute |

Stage A is specified to the step. Stages B and C are specified to interfaces, tests and acceptance; each plan in them opens with a **gate task** that measures an unknown (NAT traversal, TPM availability, Wasmtime determinism) and then writes that plan's step-level tasks into this file. That is deliberate: QUIC hole-punching code written before the measurement would be invented, and CLAUDE.md forbids improvising open design fronts.

## Global Constraints

- Rings: vocabulary in `src/DigitalBrain`, contracts module authors use in `src/DigitalBrain.Framework`, implementations in `src/DigitalBrain.Platform` (plain grains, never neurons). Framework never references Platform.
- "Storage is encrypted everywhere with user-held keys." Plaintext and keys never cross a grain call (Q4, Q23); they stay in the silo that holds the part's lease.
- "never start a part without its lease" (Q15). No holder → `ServiceUnavailableException` (503).
- "A write counts once it is in the part's log and the sequencer accepted the version" (Q18), except that an own machine acknowledges once the write is in its local journal (Q26).
- "The core is held only by own machines" (Q11). Cloud machines lease only parts marked not private (Q24).
- Storage names: `DigitalBrainNames.PlatformGrainStorage = "platform"` for trust grains; `DigitalBrainNames.ClusterGrainStorage = "cluster"` for neurons (the part log on a machine; memory storage in plain module tests).
- Seed nodes are registered with owner `platform` (Q25); never invent owner names.
- Grain state uses concrete arrays/dictionaries, never `IReadOnlyList`. No self-calls on non-reentrant grains. No state compatibility, no migrations, no shims.
- Options keys under `DigitalBrain:Platform:*`; every new options file is added to `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`.
- Tests: facts with sentence names, `TestContext.Current.CancellationToken`, real grains through `ModuleTest.Create()`. Build and test per project, never the `.slnx`. Kill any test run over 5 minutes and debug it; never raise a timeout to make a test pass.
- LSP (`findReferences`, `goToDefinition`, `incomingCalls`) before changing an existing symbol; diagnostics clean before each build.
- Commit explicit files only; commit messages end with the repo's attribution line.

## Review Focus

1. **Two machines both believe they hold a part** (lease expired mid-flush, clock skew) → exactly one batch wins the CAS; the loser's writes fail with `LeaseLostException` and are never reported durable. Pinned in Task 11.
2. **An own machine comes back online after another machine took its expired lease** → its journaled writes are not silently merged or dropped: the part refuses to start with `JournalConflictException` and the journal is kept aside. Pinned in Task 12.
3. **A silo dies between sealing a segment and the CAS** → after restart the part reads only what the accepted head reaches (plus, on an own machine, its journal); nothing half-written appears. Pinned in Task 12.
4. **A state write succeeds but its signal is lost** (today's gap in `Neuron<TState>.Save`) → impossible: record and signals are one entry. Pinned in Task 14.
5. **The sequencer serves an older head than this machine already saw** → `RollbackDetectedException`, never a silent run on old state. Pinned in Task 8.

## File structure

| File | Responsibility |
|---|---|
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Hosting/DigitalBrainNames.cs` | add `PlatformGrainStorage` |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/PartId.cs` | the part a brain key belongs to (Q27) |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IPartKeys.cs` | the key a lease holder uses |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SignalJournal.cs` | signals that ride with a state write, or journal alone |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs` | `PublishAsync`/`Save` journal before notifying |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Mesh/IMeshStore.cs` | add `Discard` |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/MeshStore.cs` | random padding, `Discard` |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/*` | custody, keyring, part keys, Shamir |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Sequencer/*` | head record, sequencer grain, machine identity, rollback memory |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartsOptions.cs` | machine role, leases, batching, snapshots |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLogModel.cs` | entries, segments, snapshots, head payload |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLease.cs` | acquire/commit/renew/release |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartJournal.cs` | own-machine local encrypted journal (Q26) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLog.cs` | open/replay, group commit, snapshots, signals since a seq |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLogs.cs` | one `PartLog` per leased part in this silo |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartGrainStorage.cs` | `IGrainStorage` over `PartLogs` |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartSignalJournal.cs` | `ISignalJournal` over `PartLogs` |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/MachineHosting.cs` | `AddMachinePartLog(silo)`: puts `cluster` storage on the part log |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs` | registrations |
| `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/*` | trust grains (sequencer, keyring, node directory, seed shards, ledger/usage, identity authority (Account/Principal/BrainAuthority grains), marketplace, first-party listing registration) and `AddTrustCluster` (Task 18, R33) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/*` | `ISequencerClient`, `INodeDirectoryClient`, `IKeyringClient`, `IMarketplaceClient`, grain and gateway implementations, `TrustOptions` (Task 18) |
| `src/DigitalBrain.Trust/*` | trust cluster host (Task 18) |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IMasterKeyCustody.cs`, `IMachineSigningKey.cs` | custody and machine signing contracts (Task 19) |
| `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/Tpm*.cs` | TPM custody and machine signing key (Task 19) |
| `src/DigitalBrain.Framework/DigitalBrain.Framework/Links/*` | `IMachineTransport`, `IMachineLink`, link frames and options (Task 21) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Links/*` | link certificates endorsed by machine keys, QUIC link and listener, trust link endpoint, relay, rendezvous (Task 21) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Links/*` | machine transport, hole punch, trust clients over the link, trust pin (Task 21; replaces `Trust/TrustGatewayClient.cs`) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartRoutes.cs`, `PartRouter.cs`, `PartCallFilter.cs`, `ForwardedCallEndpoint.cs` | cross-part calls routed to the holder (Task 22) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/IShardClient.cs`, `NodeWire.cs`, `ShardStore.cs`, `StorageNodeEndpoint.cs`, `StorageNodeService.cs`, `StorageNodeOptions.cs`, `MeshAuditor.cs` | volunteer storage node over the link, shards addressed per node, the holder's audits and repairs (Task 24, T23-1…T23-9) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Mesh/StorageNodeDirectoryGrain.cs`, `MeshOptions.cs` | signed node registration, heartbeats, room- and owner-aware placement, audit reports from the auditor (Task 24, T23-4…T23-6, T23-10) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Mesh/StorageCreditGrain.cs`, `StorageCreditOptions.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/StorageCreditPuller.cs`, `Compute/LedgerGrain.cs` | storage credits recorded trust-side, pulled into the owner's ledger once (Task 25, T23-11) |
| `src/DigitalBrain.Modules/DigitalBrain/Circles/*`, `features/os/Circle/*` | a circle is a brain: `ICircle` its core neuron, copies deleted, sharing installs into it (Task 27, T26-1…T26-6); shared connections (Task 28, T26-7) |
| `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/CirclePartKeys.cs`, `Parts/LeasePreference.cs` | circle part keys wrapped per contributed machine and rotated on removal (Task 27); Q17 lease preference among contributed machines (Task 28) |

---

# Stage A — core in one process

### Task 1: Trust grains get their own storage (Q24)

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Hosting/DigitalBrainNames.cs`
- Modify: every Platform **grain** (not neuron) that names `ClusterGrainStorage`, and the three Mesh grains: `Compute/LedgerGrain.cs`, `Compute/UsageGrain.cs`, `Compute/TraceBudgetGrain.cs`, `Identity/Authority/PrincipalGrain.cs`, `Identity/Authority/AccountGrain.cs`, `Identity/Authority/BrainAuthorityGrain.cs`, `Mesh/StorageNodeDirectoryGrain.cs`, `Mesh/SeedShardGrain.cs` (confirm the list with LSP, Step 1)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs`, `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs`, `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Candidates/DockerCandidateHost.cs`, `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs`
- Create: `src/Testing/DigitalBrain.Architecture.Tests/StorageRingFacts.cs`

**Interfaces:**
- Produces: `public const string PlatformGrainStorage = "platform";` in `DigitalBrainNames`. Rule: a type deriving from `DigitalBrain.Framework.Neuron` persists in `ClusterGrainStorage`; a plain grain in `DigitalBrain.Platform` persists in `PlatformGrainStorage`. Kernel grains in `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Kernel/KernelGrains.cs` are the brain's own registry, so they stay on `cluster` (they belong to the core part).

- [ ] **Step 1: Map.** LSP `findReferences` on `DigitalBrainNames.ClusterGrainStorage`. For each hit, `goToDefinition` on the class's base type: keep `Neuron`-derived and `KernelGrains.cs` sites on `cluster`; list every `Grain`-derived site in `DigitalBrain.Platform`.

- [ ] **Step 2: Failing architecture fact**

```csharp
using System.Reflection;
using DigitalBrain.Framework;

namespace DigitalBrain.Architecture.Tests;

public sealed class StorageRingFacts
{
    [Fact]
    public void NeuronsPersistInClusterStorageAndPlatformGrainsInPlatformStorage()
    {
        var platform = typeof(DigitalBrain.Platform.PlatformHosting).Assembly;
        var offenders = new[] { typeof(Neuron).Assembly, platform }
            .SelectMany(assembly => assembly.GetTypes())
            .Where(type => type is { IsClass: true, IsAbstract: false })
            .SelectMany(type => type.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .SelectMany(constructor => constructor.GetParameters())
                .Select(parameter => (type, storage: parameter.GetCustomAttribute<PersistentStateAttribute>()?.StorageName)))
            .Where(site => site.storage is not null)
            .Where(site => typeof(Neuron).IsAssignableFrom(site.type) || site.type.Assembly != platform
                ? site.storage != DigitalBrainNames.ClusterGrainStorage
                : site.storage != DigitalBrainNames.PlatformGrainStorage)
            .Select(site => $"{site.type.FullName} -> {site.storage}")
            .ToArray();
        Assert.True(offenders.Length == 0, string.Join(Environment.NewLine, offenders));
    }
}
```

  (If the Architecture test project does not reference `DigitalBrain.Platform`, add the `ProjectReference`; LSP-check how `PersistedStateFacts` loads assemblies and follow it if it differs.)

- [ ] **Step 3: Run** `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-method "*NeuronsPersistInClusterStorage*"` → FAIL listing the Platform grains.

- [ ] **Step 4: Implement.** Add the constant. Switch each listed Platform grain to `DigitalBrainNames.PlatformGrainStorage`. Register the provider wherever `cluster` is registered today, pointing at the same backing store for now:
  - `ModuleTest.cs`: `silo.AddMemoryGrainStorage(DigitalBrainNames.PlatformGrainStorage);` next to the `ClusterGrainStorage` line.
  - `DigitalBrainHostingExtensions.cs`: `.WithMemoryGrainStorage(DigitalBrainNames.PlatformGrainStorage)` on the memory path; `.WithGrainStorage(DigitalBrainNames.PlatformGrainStorage, grainState)` on the Azure path; and the `Orleans__GrainStorage__{PlatformGrainStorage}__ServiceKey` environment line beside the cluster one.
  - `ServerHostingExtensions.cs`: the keyed serializer and `AzureBlobStorageOptions` registration for `PlatformGrainStorage`, copied from the `ClusterGrainStorage` block.
  - `DockerCandidateHost.cs`: the two `Orleans__GrainStorage__{PlatformGrainStorage}__*` entries beside the cluster ones.
  The kernel registration decorator stays on `cluster` only: platform grains are not neurons and are not registered in a brain.

- [ ] **Step 5: Run** the Architecture fact, then the Platform, Framework, Aspire hosting and OS unit suites → PASS (the Architecture suite's six pre-existing failures are unrelated; confirm none mention storage).

- [ ] **Step 6: Commit** the touched files: `git commit -m "Storage: platform grains persist in platform storage, neurons in cluster storage"`.

### Task 2: A part is a key prefix inside a brain (Q27)

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/PartId.cs`
- Test: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit/Parts/PartIdFacts.cs`

**Interfaces:**
- Produces: `public sealed record PartId(string BrainId, string? App)` with `Value`, `IsCore`, `Core(brainId)`, `ForApp(brainId, app)`, `static PartId Of(string grainKey)` — throws `ArgumentException` for a key outside every brain (a machine cluster refuses such keys, Q27).

- [ ] **Step 1: Confirm key shapes.** LSP `findReferences` on `BrainScope.Create` and on `IApp`; `goToDefinition` on `BrainScope.IsValidId`. App neurons are `{brain}/apps/{name}`.

- [ ] **Step 2: Failing tests**

```csharp
using DigitalBrain.Framework.Parts;

namespace DigitalBrain.Framework.Tests.Unit.Parts;

public sealed class PartIdFacts
{
    [Theory]
    [InlineData("home", "home/core")]
    [InlineData("home/kernel", "home/core")]
    [InlineData("home/connections/gmail/1", "home/core")]
    [InlineData("home/apps", "home/core")]
    [InlineData("home/apps/filmcraft", "home/apps/filmcraft")]
    [InlineData("home/apps/filmcraft/tables/clips", "home/apps/filmcraft")]
    public void AKeyBelongsToItsAppOrToItsBrainsCore(string key, string part) => Assert.Equal(part, PartId.Of(key).Value);

    [Theory]
    [InlineData("")]
    [InlineData("@platform/ledger")]
    [InlineData("bad:brain/x")]
    public void AKeyOutsideEveryBrainIsRefused(string key) => Assert.Throws<ArgumentException>(() => PartId.Of(key));
}
```

- [ ] **Step 3: Run** `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit -- --filter-class "*PartIdFacts*"` → FAIL.

- [ ] **Step 4: Implement**

```csharp
namespace DigitalBrain.Framework.Parts;

// The unit a machine leases and a key encrypts (Q9, Q27): the brain's core, or one app. A neuron belongs to the
// part whose key prefix it carries, exactly as it belongs to its brain; anything outside apps/{app}/ is core,
// which only the owner's machines hold.
[GenerateSerializer, Alias("framework.part-id")]
public sealed record PartId([property: Id(0)] string BrainId, [property: Id(1)] string? App)
{
    public string Value => App is null ? $"{BrainId}/core" : $"{BrainId}/apps/{App}";

    public bool IsCore => App is null;

    public static PartId Core(string brainId) => new(brainId, null);

    public static PartId ForApp(string brainId, string app)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(app);
        return new(brainId, app);
    }

    public static PartId Of(string grainKey)
    {
        var segments = (grainKey ?? "").Split('/');
        if (!BrainScope.IsValidId(segments[0])) { throw new ArgumentException($"Key '{grainKey}' is outside every brain; a machine hosts only brain parts.", nameof(grainKey)); }
        return segments.Length >= 3 && segments[1] == "apps" && segments[2].Length > 0 ? ForApp(segments[0], segments[2]) : Core(segments[0]);
    }

    public override string ToString() => Value;
}
```

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** both files: `git commit -m "Parts: a part is the core or an app, by the key prefix a neuron already carries"`.

### Task 3: Mesh segments never share a shard, and can be discarded

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Mesh/IMeshStore.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/MeshStore.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Mesh/MeshStoreFacts.cs`, `AuditRepairFacts.cs`

**Interfaces:**
- Produces: `Task Discard(byte[] key, MeshRef reference, CancellationToken cancellationToken = default)` on `IMeshStore`: drops every shard and manifest replica of the segment; idempotent.

- [ ] **Step 1: Failing tests** (add to `MeshStoreFacts`)

```csharp
    [Fact(Timeout = 60_000)]
    public async Task TwoSegmentsOfTheSameShortDataShareNoShard()
    {
        var ct = TestContext.Current.CancellationToken;
        var (brain, store, _) = await StartAsync(41, ct, options => { options.DataShards = 40; options.ParityShards = 1; });
        await using var _ = brain;

        var a = await Manifest(brain, Key, await store.Write(Key, "part/log/1", [7], ct));
        var b = await Manifest(brain, Key, await store.Write(Key, "part/log/2", [7], ct));

        Assert.Empty(a.Shards.Select(s => s.Cid).Intersect(b.Shards.Select(s => s.Cid)));
    }

    [Fact(Timeout = 60_000)]
    public async Task DiscardingASegmentRemovesItsShardsAndLeavesOthersReadable()
    {
        var ct = TestContext.Current.CancellationToken;
        var (brain, store, _) = await StartAsync(8, ct);
        await using var _ = brain;
        var gone = await store.Write(Key, "part/log/1", [1, 2, 3], ct);
        var kept = await store.Write(Key, "part/log/2", [4, 5, 6], ct);
        var shards = (await Manifest(brain, Key, gone)).Shards;

        await store.Discard(Key, gone, ct);
        await store.Discard(Key, gone, ct);

        foreach (var shard in shards) { Assert.Null(await Shard(brain, shard.NodeId, shard.Cid).Get()); }
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => store.Read(Key, gone, ct));
        Assert.Equal(new byte[] { 4, 5, 6 }, await store.Read(Key, kept, ct));
    }
```

  Delete `AuditRepairFacts.IdenticalShardsOfTwoSegmentsSurviveEitherOneBeingAudited`: its premise (shared zero shards) no longer exists.

- [ ] **Step 2: Run** `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*MeshStoreFacts*"` → FAIL.

- [ ] **Step 3: Implement.** In `IMeshStore`, after `Repair`:

```csharp
    // Drops a segment's shards and manifest replicas. Safe because segments never share a shard (random padding).
    Task Discard(byte[] key, MeshRef reference, CancellationToken cancellationToken = default);
```

  In `MeshStore.Write`, replace `var shards = rs.Encode(sealedData, out var shardSize);` with `var shards = rs.Encode(Padded(sealedData, rs.DataShards), out var shardSize);` (keep `SealedLength = sealedData.Length`), and add:

```csharp
    // Padding is never read (Join stops at SealedLength); random bytes keep every segment's shards unique.
    private static byte[] Padded(byte[] sealedData, int dataShards)
    {
        var shardSize = Math.Max(1, (sealedData.Length + dataShards - 1) / dataShards);
        var padded = new byte[shardSize * dataShards];
        sealedData.CopyTo(padded, 0);
        RandomNumberGenerator.Fill(padded.AsSpan(sealedData.Length));
        return padded;
    }

    public async Task Discard(byte[] key, MeshRef reference, CancellationToken cancellationToken = default)
    {
        SegmentManifest manifest;
        try { manifest = await ReadManifest(key, reference, cancellationToken); }
        catch (ServiceUnavailableException) { return; }
        await Task.WhenAll(manifest.Shards.Select(shard => Shard(shard.NodeId, shard.Cid).Drop()));
        await Task.WhenAll(reference.ManifestNodes.Select(nodeId => Shard(nodeId, reference.ManifestCid).Drop()));
    }
```

- [ ] **Step 4: Run** `... -- --filter-namespace "*Mesh*"` → PASS. **Step 5: Commit** the four files: `git commit -m "Mesh: random padding keeps every segment's shards unique, so a segment can be discarded"`.

---

## Part keys (Tasks 4–6)

### Task 4: Master key custody

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/IMasterKeyCustody.cs`, `ConfiguredMasterKeyCustody.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Keys/MasterKeyCustodyFacts.cs`

**Interfaces:**
- Produces: `internal interface IMasterKeyCustody { byte[] Wrap(string accountId, string context, byte[] secret); byte[] Unwrap(string accountId, string context, byte[] wrapped); }`.

- [ ] **Step 1: LSP.** `goToDefinition` on `AddMasterKeyWrapper` (`Secrets/MasterKeyServiceCollectionExtensions.cs`) and `findReferences` on `DigitalBrainNames.MasterKeyConfigurationKey`. If the existing wrapper already wraps bytes under the configured master key, `ConfiguredMasterKeyCustody` derives from the same root it uses; keep the interface below either way.

- [ ] **Step 2: Failing tests**

```csharp
using System.Security.Cryptography;
using DigitalBrain.Platform.Keys;

namespace DigitalBrain.Platform.Tests.Unit.Keys;

public sealed class MasterKeyCustodyFacts
{
    private static ConfiguredMasterKeyCustody Custody() => new(RandomNumberGenerator.GetBytes(32));

    [Fact]
    public void AWrappedSecretUnwrapsForTheSameAccountAndContext()
    {
        var custody = Custody();
        var secret = RandomNumberGenerator.GetBytes(32);
        Assert.Equal(secret, custody.Unwrap("alice", "part-key|home/core", custody.Wrap("alice", "part-key|home/core", secret)));
    }

    [Fact]
    public void AnotherAccountOrContextCannotUnwrapIt()
    {
        var custody = Custody();
        var wrapped = custody.Wrap("alice", "part-key|home/core", [1, 2, 3]);
        Assert.ThrowsAny<CryptographicException>(() => custody.Unwrap("bob", "part-key|home/core", wrapped));
        Assert.ThrowsAny<CryptographicException>(() => custody.Unwrap("alice", "part-key|home/apps/x", wrapped));
    }
}
```

- [ ] **Step 3: Run** `... -- --filter-class "*MasterKeyCustodyFacts*"` → FAIL.

- [ ] **Step 4: Implement**

```csharp
// IMasterKeyCustody.cs
namespace DigitalBrain.Platform.Keys;

// Holds each user's master key (Q3, Q6). Callers hand it secrets to wrap; the master key never leaves it.
// Stage A derives it from a configured root; Task 19 moves custody into the machine's TPM.
internal interface IMasterKeyCustody
{
    byte[] Wrap(string accountId, string context, byte[] secret);

    byte[] Unwrap(string accountId, string context, byte[] wrapped);
}
```

```csharp
// ConfiguredMasterKeyCustody.cs
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Platform.Mesh;

namespace DigitalBrain.Platform.Keys;

// Development custody: one configured root, an HKDF-derived master key per account. Not user-held; Task 19 is.
internal sealed class ConfiguredMasterKeyCustody(byte[] root) : IMasterKeyCustody
{
    public byte[] Wrap(string accountId, string context, byte[] secret) => SegmentSeal.Close(Master(accountId), context, secret);

    public byte[] Unwrap(string accountId, string context, byte[] wrapped) => SegmentSeal.Open(Master(accountId), context, wrapped);

    private byte[] Master(string accountId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(accountId);
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, root, 32, info: Encoding.UTF8.GetBytes($"master|{accountId}"));
    }
}
```

- [ ] **Step 5: Run** → PASS. **Step 6: Commit** the three files: `git commit -m "Keys: master key custody wraps secrets per account and context"`.

### Task 5: Keyring and part keys

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IPartKeys.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/KeyringGrain.cs`, `PartKeys.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs`, `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Keys/PartKeyFacts.cs`

**Interfaces:**
- Consumes: `PartId` (Task 2), `IMasterKeyCustody` (Task 4).
- Produces: `public interface IPartKeys { Task<byte[]> Key(PartId part, string ownerAccount, CancellationToken cancellationToken = default); Task<byte[]> Rotate(PartId part, string ownerAccount, CancellationToken cancellationToken = default); }`; `internal interface IKeyringGrain : IGrainWithStringKey { Task<byte[]?> Get(string partId); Task<bool> TryAdd(string partId, byte[] wrapped); Task Replace(string partId, byte[] wrapped); }` keyed by brain id, persisted in `platform` storage (a trust-cluster grain holding ciphertext only).

- [ ] **Step 1: Failing tests**

```csharp
using DigitalBrain.Framework.Parts;
using DigitalBrain.Platform.Keys;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Platform.Tests.Unit.Keys;

public sealed class PartKeyFacts
{
    [Fact(Timeout = 60_000)]
    public async Task APartKeyIsCreatedOnceAndStoredOnlyWrapped()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var keys = brain.SiloServices.GetRequiredService<IPartKeys>();
        var part = PartId.Core("home");

        var first = await keys.Key(part, "alice", ct);

        Assert.Equal(32, first.Length);
        Assert.Equal(first, await keys.Key(part, "alice", ct));
        var stored = await brain.Grains.GetGrain<IKeyringGrain>("home").Get(part.Value);
        Assert.NotNull(stored);
        Assert.True(stored.AsSpan().IndexOf(first) < 0);
    }

    [Fact(Timeout = 60_000)]
    public async Task EachPartHasItsOwnKey()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var keys = brain.SiloServices.GetRequiredService<IPartKeys>();

        Assert.NotEqual(await keys.Key(PartId.Core("home"), "alice", ct), await keys.Key(PartId.ForApp("home", "filmcraft"), "alice", ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task RotatingAPartKeyReplacesIt()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var keys = brain.SiloServices.GetRequiredService<IPartKeys>();
        var part = PartId.ForApp("home", "filmcraft");
        var old = await keys.Key(part, "alice", ct);

        var rotated = await keys.Rotate(part, "alice", ct);

        Assert.NotEqual(old, rotated);
        Assert.Equal(rotated, await keys.Key(part, "alice", ct));
    }
}
```

- [ ] **Step 2: Run** `... -- --filter-class "*PartKeyFacts*"` → FAIL.

- [ ] **Step 3: Implement**

```csharp
// Framework/Parts/IPartKeys.cs
namespace DigitalBrain.Framework.Parts;

// The key that encrypts one part (Q6). Only a silo holding the part's lease asks for it; no grain call carries it.
public interface IPartKeys
{
    Task<byte[]> Key(PartId part, string ownerAccount, CancellationToken cancellationToken = default);

    // Revoking a circle rotates one part key; the part log re-seals from its next snapshot.
    Task<byte[]> Rotate(PartId part, string ownerAccount, CancellationToken cancellationToken = default);
}
```

```csharp
// Platform/Keys/KeyringGrain.cs
using DigitalBrain.Framework;

namespace DigitalBrain.Platform.Keys;

// Wrapped part keys of one brain, in the trust cluster: ciphertext only, so holding it teaches us nothing.
internal interface IKeyringGrain : IGrainWithStringKey
{
    Task<byte[]?> Get(string partId);

    Task<bool> TryAdd(string partId, byte[] wrapped);

    Task Replace(string partId, byte[] wrapped);
}

[GrainType("platform.keyring")]
internal sealed class KeyringGrain(
    [PersistentState("keyring", DigitalBrainNames.PlatformGrainStorage)] IPersistentState<KeyringState> store) : Grain, IKeyringGrain
{
    public Task<byte[]?> Get(string partId) => Task.FromResult(store.State.Keys.GetValueOrDefault(partId));

    public async Task<bool> TryAdd(string partId, byte[] wrapped)
    {
        if (store.State.Keys.ContainsKey(partId)) { return false; }
        store.State.Keys[partId] = wrapped;
        await store.WriteStateAsync();
        return true;
    }

    public async Task Replace(string partId, byte[] wrapped)
    {
        store.State.Keys[partId] = wrapped;
        await store.WriteStateAsync();
    }
}

[GenerateSerializer, Alias("platform.keyring-state")]
internal sealed class KeyringState
{
    [Id(0)] public Dictionary<string, byte[]> Keys { get; set; } = new(StringComparer.Ordinal);
}
```

```csharp
// Platform/Keys/PartKeys.cs
using System.Security.Cryptography;
using DigitalBrain.Framework.Parts;

namespace DigitalBrain.Platform.Keys;

internal sealed class PartKeys(IGrainFactory grains, IMasterKeyCustody custody) : IPartKeys
{
    public async Task<byte[]> Key(PartId part, string ownerAccount, CancellationToken cancellationToken = default)
    {
        var keyring = grains.GetGrain<IKeyringGrain>(part.BrainId);
        if (await keyring.Get(part.Value) is { } wrapped) { return custody.Unwrap(ownerAccount, Context(part), wrapped); }
        var key = RandomNumberGenerator.GetBytes(32);
        // Two silos racing to create: the first add wins and both use its key.
        return await keyring.TryAdd(part.Value, custody.Wrap(ownerAccount, Context(part), key))
            ? key
            : custody.Unwrap(ownerAccount, Context(part), (await keyring.Get(part.Value))!);
    }

    public async Task<byte[]> Rotate(PartId part, string ownerAccount, CancellationToken cancellationToken = default)
    {
        var key = RandomNumberGenerator.GetBytes(32);
        await grains.GetGrain<IKeyringGrain>(part.BrainId).Replace(part.Value, custody.Wrap(ownerAccount, Context(part), key));
        return key;
    }

    private static string Context(PartId part) => $"part-key|{part.Value}";
}
```

  In `AddDigitalBrainPlatform`, after the mesh registrations:

```csharp
        services.TryAddSingleton<Keys.IMasterKeyCustody>(provider => new Keys.ConfiguredMasterKeyCustody(Convert.FromHexString(
            provider.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>()[DigitalBrainNames.MasterKeyConfigurationKey]
                ?? throw new InvalidOperationException($"Set {DigitalBrainNames.MasterKeyConfigurationKey} to 64 hex characters."))));
        services.TryAddSingleton<DigitalBrain.Framework.Parts.IPartKeys, Keys.PartKeys>();
```

  In `ModuleTest`, if Step 1 of Task 4 showed it sets no master key, add `[DigitalBrainNames.MasterKeyConfigurationKey] = Convert.ToHexString(RandomNumberGenerator.GetBytes(32))` to the silo's configuration.

- [ ] **Step 4: Run** `... -- --filter-namespace "*Keys*"` → PASS. **Step 5: Commit** the six files: `git commit -m "Keys: part keys are random, wrapped by the owner's master key, kept only as ciphertext"`.

### Task 6: Shamir recovery shares

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/Shamir.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Keys/ShamirFacts.cs`

**Interfaces:**
- Produces: `internal static class Shamir { byte[][] Split(byte[] secret, int threshold, int shares); byte[] Combine(byte[][] shares); }`; a share is `[x, y0..yn]`, x in 1..255.

- [ ] **Step 1: Failing tests**

```csharp
using System.Security.Cryptography;
using DigitalBrain.Platform.Keys;

namespace DigitalBrain.Platform.Tests.Unit.Keys;

public sealed class ShamirFacts
{
    [Fact]
    public void AnyTwoOfThreeSharesRecoverTheKey()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var shares = Shamir.Split(key, 2, 3);
        Assert.Equal(key, Shamir.Combine([shares[0], shares[1]]));
        Assert.Equal(key, Shamir.Combine([shares[0], shares[2]]));
        Assert.Equal(key, Shamir.Combine([shares[1], shares[2]]));
    }

    [Fact]
    public void OneShareAloneDoesNotRecoverTheKey()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        Assert.NotEqual(key, Shamir.Combine([Shamir.Split(key, 2, 3)[0]]));
    }

    [Fact]
    public void AThresholdAboveTheShareCountIsRefused() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => Shamir.Split(new byte[32], 4, 3));
}
```

- [ ] **Step 2: Run** `... -- --filter-class "*ShamirFacts*"` → FAIL.

- [ ] **Step 3: Implement**

```csharp
using System.Security.Cryptography;

namespace DigitalBrain.Platform.Keys;

// Master key recovery (spec Shape): a random polynomial per byte over GF(2^8) (polynomial 0x11D, the field
// ReedSolomon uses); share i is its value at x = i, and any `threshold` shares interpolate back to x = 0.
internal static class Shamir
{
    private static readonly byte[] Exp = new byte[512];
    private static readonly byte[] Log = new byte[256];

    static Shamir()
    {
        int x = 1;
        for (int i = 0; i < 255; i++)
        {
            Exp[i] = (byte)x;
            Log[x] = (byte)i;
            x <<= 1;
            if ((x & 0x100) != 0) { x ^= 0x11D; }
        }
        for (int i = 255; i < 512; i++) { Exp[i] = Exp[i - 255]; }
    }

    private static byte Mul(byte a, byte b) => a == 0 || b == 0 ? (byte)0 : Exp[Log[a] + Log[b]];

    private static byte Div(byte a, byte b) => a == 0 ? (byte)0 : Exp[Log[a] + 255 - Log[b]];

    public static byte[][] Split(byte[] secret, int threshold, int shares)
    {
        ArgumentNullException.ThrowIfNull(secret);
        ArgumentOutOfRangeException.ThrowIfLessThan(threshold, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(threshold, shares);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(shares, 255);
        var result = Enumerable.Range(1, shares).Select(x => { var share = new byte[secret.Length + 1]; share[0] = (byte)x; return share; }).ToArray();
        var coefficients = new byte[threshold];
        for (int b = 0; b < secret.Length; b++)
        {
            coefficients[0] = secret[b];
            RandomNumberGenerator.Fill(coefficients.AsSpan(1));
            foreach (var share in result)
            {
                byte y = 0;
                for (int c = threshold - 1; c >= 0; c--) { y = (byte)(Mul(y, share[0]) ^ coefficients[c]); }
                share[b + 1] = y;
            }
        }
        CryptographicOperations.ZeroMemory(coefficients);
        return result;
    }

    public static byte[] Combine(byte[][] shares)
    {
        ArgumentNullException.ThrowIfNull(shares);
        var secret = new byte[shares[0].Length - 1];
        for (int b = 0; b < secret.Length; b++)
        {
            byte value = 0;
            for (int i = 0; i < shares.Length; i++)
            {
                byte basis = 1;
                for (int j = 0; j < shares.Length; j++)
                {
                    if (i != j) { basis = Mul(basis, Div(shares[j][0], (byte)(shares[j][0] ^ shares[i][0]))); }
                }
                value ^= Mul(shares[i][b + 1], basis);
            }
            secret[b] = value;
        }
        return secret;
    }
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** both files: `git commit -m "Keys: Shamir 2-of-3 shares recover a master key"`.

---

## Sequencer (Tasks 7–9)

### Task 7: Machine identity

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Sequencer/MachineIdentity.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Sequencer/MachineIdentityFacts.cs`

**Interfaces:**
- Produces: `internal sealed class MachineIdentity : IDisposable { string MachineId; byte[] PublicKey; byte[] Sign(byte[] data); static bool Verify(byte[] publicKey, byte[] data, byte[] signature); static MachineIdentity LoadOrCreate(string path); }` — ECDsa P-256; `MachineId` = first 16 hex chars of SHA-256 of the SubjectPublicKeyInfo.

- [ ] **Step 1: Failing test**

```csharp
using DigitalBrain.Platform.Sequencer;

namespace DigitalBrain.Platform.Tests.Unit.Sequencer;

public sealed class MachineIdentityFacts
{
    [Fact]
    public void AnIdentityIsStableAcrossLoadsAndItsSignaturesVerify()
    {
        var path = Path.Combine(Path.GetTempPath(), $"machine-{Guid.NewGuid():N}.key");
        try
        {
            using var first = MachineIdentity.LoadOrCreate(path);
            using var again = MachineIdentity.LoadOrCreate(path);
            Assert.Equal(first.MachineId, again.MachineId);
            var signature = first.Sign([1, 2, 3]);
            Assert.True(MachineIdentity.Verify(again.PublicKey, [1, 2, 3], signature));
            Assert.False(MachineIdentity.Verify(again.PublicKey, [1, 2, 4], signature));
        }
        finally { File.Delete(path); }
    }
}
```

- [ ] **Step 2: Run** `... -- --filter-class "*MachineIdentityFacts*"` → FAIL.

- [ ] **Step 3: Implement**

```csharp
using System.Security.Cryptography;

namespace DigitalBrain.Platform.Sequencer;

// This machine's signing key: it signs the head records it writes (Q10), so the sequencer cannot forge them.
// Stage A keeps the PKCS#8 key in a file; Task 19 moves it into the machine's TPM.
internal sealed class MachineIdentity : IDisposable
{
    private readonly ECDsa _key;

    private MachineIdentity(ECDsa key)
    {
        _key = key;
        PublicKey = key.ExportSubjectPublicKeyInfo();
        MachineId = Convert.ToHexStringLower(SHA256.HashData(PublicKey))[..16];
    }

    public string MachineId { get; }

    public byte[] PublicKey { get; }

    public static MachineIdentity LoadOrCreate(string path)
    {
        var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        if (File.Exists(path)) { key.ImportPkcs8PrivateKey(File.ReadAllBytes(path), out _); }
        else
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllBytes(path, key.ExportPkcs8PrivateKey());
        }
        return new MachineIdentity(key);
    }

    public byte[] Sign(byte[] data) => _key.SignData(data, HashAlgorithmName.SHA256);

    public static bool Verify(byte[] publicKey, byte[] data, byte[] signature)
    {
        using var key = ECDsa.Create();
        key.ImportSubjectPublicKeyInfo(publicKey, out _);
        return key.VerifyData(data, signature, HashAlgorithmName.SHA256);
    }

    public void Dispose() => _key.Dispose();
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** both files: `git commit -m "Sequencer: a machine identity signs and verifies head records"`.

### Task 8: Head record, sequencer grain, rollback memory

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Sequencer/HeadRecord.cs`, `SequencerGrain.cs`, `SeenVersions.cs`
- Create: `src/DigitalBrain/Neurons/RollbackDetectedException.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Sequencer/SequencerFacts.cs`, `SeenVersionsFacts.cs`

**Interfaces:**
- Consumes: `MachineIdentity` (Task 7).
- Produces:
  - `HeadRecord` (`[GenerateSerializer]`): `PartHash, Version, Holder, HolderKey, LeaseExpiry, Payload, Signature`; `byte[] SignedBytes()`; `static string HashOf(string partId)`.
  - `ISequencerGrain : IGrainWithStringKey` (key = `PartHash`, `platform` storage): `Task<HeadRecord?> Get()`; `Task<bool> CompareAndSet(long expectedVersion, HeadRecord next)` — accepts only `next.Version == expectedVersion + 1`, current version == `expectedVersion`, `next.PartHash` == grain key, a valid signature by `next.HolderKey`, and no live lease held by another machine.
  - `SeenVersions(string path)`: `Check(partHash, version)` throws `RollbackDetectedException` below the highest seen; `Saw(partHash, version)` persists it atomically.
  - `public sealed class RollbackDetectedException(string message) : Exception` in namespace `DigitalBrain`, `[GenerateSerializer, Alias("framework.rollback-detected")]`.

- [ ] **Step 1: Failing tests**

```csharp
using DigitalBrain.Platform.Sequencer;

namespace DigitalBrain.Platform.Tests.Unit.Sequencer;

public sealed class SequencerFacts
{
    internal static MachineIdentity Machine() => MachineIdentity.LoadOrCreate(Path.Combine(Path.GetTempPath(), $"m-{Guid.NewGuid():N}.key"));

    internal static HeadRecord Record(MachineIdentity machine, string partHash, long version, TimeSpan lease, byte[]? payload = null)
    {
        var record = new HeadRecord
        {
            PartHash = partHash, Version = version, Holder = machine.MachineId, HolderKey = machine.PublicKey,
            LeaseExpiry = DateTimeOffset.UtcNow + lease, Payload = payload ?? [],
        };
        record.Signature = machine.Sign(record.SignedBytes());
        return record;
    }

    [Fact(Timeout = 60_000)]
    public async Task VersionsAdvanceOnlyByCompareAndSet()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        using var machine = Machine();
        var sequencer = brain.Grains.GetGrain<ISequencerGrain>("p1");

        Assert.True(await sequencer.CompareAndSet(0, Record(machine, "p1", 1, TimeSpan.FromMinutes(1))));
        Assert.False(await sequencer.CompareAndSet(0, Record(machine, "p1", 1, TimeSpan.FromMinutes(1))));
        Assert.True(await sequencer.CompareAndSet(1, Record(machine, "p1", 2, TimeSpan.FromMinutes(1))));
        Assert.Equal(2, (await sequencer.Get())!.Version);
    }

    [Fact(Timeout = 60_000)]
    public async Task AForgedOrTamperedRecordIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        using var machine = Machine();
        var sequencer = brain.Grains.GetGrain<ISequencerGrain>("p1");
        var record = Record(machine, "p1", 1, TimeSpan.FromMinutes(1), [1]);
        record.Payload = [2];

        Assert.False(await sequencer.CompareAndSet(0, record));
        Assert.Null(await sequencer.Get());
    }

    [Fact(Timeout = 60_000)]
    public async Task AnotherMachineCannotTakeALiveLeaseButCanTakeAnExpiredOne()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        using var alice = Machine();
        using var bob = Machine();
        var live = brain.Grains.GetGrain<ISequencerGrain>("live");
        var expired = brain.Grains.GetGrain<ISequencerGrain>("expired");
        await live.CompareAndSet(0, Record(alice, "live", 1, TimeSpan.FromMinutes(1)));
        await expired.CompareAndSet(0, Record(alice, "expired", 1, TimeSpan.FromSeconds(-1)));

        Assert.False(await live.CompareAndSet(1, Record(bob, "live", 2, TimeSpan.FromMinutes(1))));
        Assert.True(await expired.CompareAndSet(1, Record(bob, "expired", 2, TimeSpan.FromMinutes(1))));
    }
}
```

```csharp
using DigitalBrain.Platform.Sequencer;

namespace DigitalBrain.Platform.Tests.Unit.Sequencer;

public sealed class SeenVersionsFacts
{
    [Fact]
    public void AnOlderHeadThanOnceSeenIsARollbackEvenAfterRestart()
    {
        var path = Path.Combine(Path.GetTempPath(), $"seen-{Guid.NewGuid():N}.json");
        try
        {
            new SeenVersions(path).Saw("p", 7);
            var restarted = new SeenVersions(path);

            restarted.Check("p", 7);
            restarted.Check("p", 9);
            Assert.Throws<RollbackDetectedException>(() => restarted.Check("p", 6));
        }
        finally { File.Delete(path); }
    }
}
```

- [ ] **Step 2: Run** `... -- --filter-namespace "*Sequencer*"` → FAIL.

- [ ] **Step 3: Implement**

```csharp
// HeadRecord.cs
using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace DigitalBrain.Platform.Sequencer;

// One part's head (Q10): who holds the lease until when, and a payload sealed with the part key that names the
// log head. Signed by the holder; the sequencer can verify and withhold it, never read or forge it.
[GenerateSerializer, Alias("platform.sequencer.head")]
internal sealed class HeadRecord
{
    [Id(0)] public string PartHash { get; set; } = "";
    [Id(1)] public long Version { get; set; }
    [Id(2)] public string Holder { get; set; } = "";
    [Id(3)] public byte[] HolderKey { get; set; } = [];
    [Id(4)] public DateTimeOffset LeaseExpiry { get; set; }
    [Id(5)] public byte[] Payload { get; set; } = [];
    [Id(6)] public byte[] Signature { get; set; } = [];

    public static string HashOf(string partId) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(partId)));

    public byte[] SignedBytes()
    {
        using var buffer = new MemoryStream();
        void Field(ReadOnlySpan<byte> bytes)
        {
            Span<byte> length = stackalloc byte[4];
            BinaryPrimitives.WriteInt32BigEndian(length, bytes.Length);
            buffer.Write(length);
            buffer.Write(bytes);
        }
        Span<byte> number = stackalloc byte[8];
        Field(Encoding.UTF8.GetBytes(PartHash));
        BinaryPrimitives.WriteInt64BigEndian(number, Version); Field(number);
        Field(Encoding.UTF8.GetBytes(Holder));
        Field(HolderKey);
        BinaryPrimitives.WriteInt64BigEndian(number, LeaseExpiry.ToUnixTimeMilliseconds()); Field(number);
        Field(Payload);
        return buffer.ToArray();
    }
}
```

```csharp
// SequencerGrain.cs
using DigitalBrain.Framework;

namespace DigitalBrain.Platform.Sequencer;

// Per part: the signed head with compare-and-set (Q10). A trust-cluster grain: it holds nothing it could misuse.
internal interface ISequencerGrain : IGrainWithStringKey
{
    Task<HeadRecord?> Get();

    Task<bool> CompareAndSet(long expectedVersion, HeadRecord next);
}

[GrainType("platform.sequencer")]
internal sealed class SequencerGrain(
    [PersistentState("sequencer", DigitalBrainNames.PlatformGrainStorage)] IPersistentState<SequencerState> store,
    TimeProvider time) : Grain, ISequencerGrain
{
    public Task<HeadRecord?> Get() => Task.FromResult(store.State.Head);

    public async Task<bool> CompareAndSet(long expectedVersion, HeadRecord next)
    {
        ArgumentNullException.ThrowIfNull(next);
        var current = store.State.Head;
        if ((current?.Version ?? 0) != expectedVersion || next.Version != expectedVersion + 1) { return false; }
        if (next.PartHash != this.GetPrimaryKeyString()) { return false; }
        if (!MachineIdentity.Verify(next.HolderKey, next.SignedBytes(), next.Signature)) { return false; }
        if (current is not null && current.Holder != next.Holder && current.LeaseExpiry > time.GetUtcNow()) { return false; }
        store.State.Head = next;
        await store.WriteStateAsync();
        return true;
    }
}

[GenerateSerializer, Alias("platform.sequencer-state")]
internal sealed class SequencerState
{
    [Id(0)] public HeadRecord? Head { get; set; }
}
```

```csharp
// SeenVersions.cs
using System.Text.Json;

namespace DigitalBrain.Platform.Sequencer;

// The highest head version this machine has seen per part, kept on the machine (Q10): the sequencer can
// withhold new heads but cannot serve an old one unnoticed.
internal sealed class SeenVersions(string path)
{
    private readonly Lock _gate = new();
    private Dictionary<string, long>? _seen;

    public void Check(string partHash, long version)
    {
        lock (_gate)
        {
            if (Seen().GetValueOrDefault(partHash) > version)
            { throw new RollbackDetectedException($"Part {partHash} was served version {version} after version {Seen()[partHash]}."); }
        }
    }

    public void Saw(string partHash, long version)
    {
        lock (_gate)
        {
            var seen = Seen();
            if (seen.GetValueOrDefault(partHash) >= version) { return; }
            seen[partHash] = version;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = path + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(seen));
            File.Move(temp, path, overwrite: true);
        }
    }

    private Dictionary<string, long> Seen() =>
        _seen ??= File.Exists(path) ? JsonSerializer.Deserialize<Dictionary<string, long>>(File.ReadAllText(path)) ?? [] : [];
}
```

```csharp
// src/DigitalBrain/Neurons/RollbackDetectedException.cs
namespace DigitalBrain;

// A refusal word: the store served an older version of a part than this machine already saw (Q10).
[GenerateSerializer, Alias("framework.rollback-detected")]
public sealed class RollbackDetectedException(string message) : Exception(message);
```

  `TimeProvider` must resolve in the silo: if LSP shows no registration, add `services.TryAddSingleton(TimeProvider.System);` to `AddDigitalBrainPlatform`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** the six files: `git commit -m "Sequencer: signed per-part heads with compare-and-set, and machines refuse rollbacks"`.

### Task 9: Part options and machine services

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartsOptions.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/PlatformHosting.cs`, `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs`, `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartsOptionsFacts.cs`

**Interfaces:**
- Produces:
  - `public enum MachineRole { Own = 0, Circle = 1, Cloud = 2 }` (Q24, Q26).
  - `PartsOptions` (key `DigitalBrain:Platform:Parts`): `MachineRole Role = Own`; `string MachineDirectory` (default `%LOCALAPPDATA%/DigitalBrain/machine`); `TimeSpan OwnLease = 7 days`; `TimeSpan ShortLease = 30 s`; `TimeSpan RenewBefore = 10 s` (short) — own leases renew when less than half remains; `int BatchBytes = 262_144`; `TimeSpan BatchDelay = 25 ms`; `int SnapshotEvery = 64`; `TimeSpan Lease => Role == Own ? OwnLease : ShortLease`; `bool AcknowledgeOnJournal => Role == Own`; `Validate()`.
  - Silo singletons `MachineIdentity` (`{MachineDirectory}/identity.key`) and `SeenVersions` (`{MachineDirectory}/seen.json`).

- [ ] **Step 1: Failing tests**

```csharp
using DigitalBrain.Platform.Parts;
using DigitalBrain.Platform.Sequencer;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Platform.Tests.Unit.Parts;

public sealed class PartsOptionsFacts
{
    [Fact]
    public void OwnMachinesHoldLongLeasesAndAcknowledgeOnTheJournal()
    {
        var own = new PartsOptions { Role = MachineRole.Own };
        var cloud = new PartsOptions { Role = MachineRole.Cloud };
        Assert.True(own.Lease > TimeSpan.FromDays(1) && own.AcknowledgeOnJournal);
        Assert.True(cloud.Lease < TimeSpan.FromMinutes(5) && !cloud.AcknowledgeOnJournal);
    }

    [Fact(Timeout = 60_000)]
    public async Task EverySiloHasAMachineIdentityAndRollbackMemory()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        Assert.NotEmpty(brain.SiloServices.GetRequiredService<MachineIdentity>().MachineId);
        Assert.NotNull(brain.SiloServices.GetRequiredService<SeenVersions>());
    }
}
```

- [ ] **Step 2: Run** `... -- --filter-class "*PartsOptionsFacts*"` → FAIL.

- [ ] **Step 3: Implement** `PartsOptions` as listed (shape of `MeshOptions`: `const string Key`, properties, `Validate()` throwing `InvalidOperationException` for non-positive durations or sizes and `RenewBefore >= ShortLease`). Register in `AddDigitalBrainPlatform`:

```csharp
        services.AddOptions<Parts.PartsOptions>().BindConfiguration(Parts.PartsOptions.Key)
            .Validate(parts => { parts.Validate(); return true; }).ValidateOnStart();
        services.TryAddSingleton(provider => Sequencer.MachineIdentity.LoadOrCreate(Path.Combine(
            provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<Parts.PartsOptions>>().Value.MachineDirectory, "identity.key")));
        services.TryAddSingleton(provider => new Sequencer.SeenVersions(Path.Combine(
            provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<Parts.PartsOptions>>().Value.MachineDirectory, "seen.json")));
```

  In `ModuleTest`, set `DigitalBrain:Platform:Parts:MachineDirectory` to a fresh temp directory per test host. Add `"DigitalBrain.Platform/Parts/PartsOptions.cs"` to `ConfigurationKeyOwners.json`.

- [ ] **Step 4: Run** the Platform suite → PASS. **Step 5: Commit** the five files: `git commit -m "Parts: machine role, leases and batching options; every silo has an identity and rollback memory"`.

---

## Part log (Tasks 10–16)

### Task 10: Log model — one entry is one neuron change (Q27)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLogModel.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartLogModelFacts.cs`

**Interfaces:**
- Produces (all `[GenerateSerializer]`, concrete arrays):
  - `enum RecordChange { None = 0, Write = 1, Clear = 2 }` — `None` = an entry that only publishes signals.
  - `LogEntry { long Seq; string GrainId; string StateName; RecordChange Change; byte[] Record; Signal[] Signals; }`
  - `LogSegment { long FirstSeq; LogEntry[] Entries; MeshRef? Prev; }`
  - `PartSnapshot { long Seq; SnapshotRecord[] Records; }`, `SnapshotRecord { string GrainId; string StateName; byte[] Record; long ETagSeq; }`
  - `HeadPayload { MeshRef? Head; MeshRef? Snapshot; long SnapshotSeq; long LastSeq; int SegmentsSinceSnapshot; }`
  - `static class PartSegments { SegmentId(PartId part, long firstSeq) => $"{part.Value}/log/{firstSeq}"; SnapshotId(PartId part, long seq) => $"{part.Value}/snapshot/{seq}"; }`

- [ ] **Step 1: LSP.** `goToDefinition` on `Signal` (`src/DigitalBrain`): confirm it is `[GenerateSerializer]` and polymorphic through Orleans serialization (signals already cross grain calls to observers, so it is). If signal subtypes defined in scripts are not known to the silo's serializer, store `Signals` as `byte[][]` serialized by the publisher's silo and note it here.

- [ ] **Step 2: Failing tests** — round-trip each type through `Orleans.Serialization.Serializer` from `brain.SiloServices`:

```csharp
using DigitalBrain.Framework.Mesh;
using DigitalBrain.Platform.Parts;
using Microsoft.Extensions.DependencyInjection;
using Orleans.Serialization;

namespace DigitalBrain.Platform.Tests.Unit.Parts;

public sealed class PartLogModelFacts
{
    [Fact(Timeout = 60_000)]
    public async Task AnEntryCarriesItsRecordAndItsSignalsTogether()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var segment = new LogSegment
        {
            FirstSeq = 5, Prev = new MeshRef("p/log/1", "sha256:aa", ["n0"]),
            Entries = [new LogEntry { Seq = 5, GrainId = "g", StateName = "s", Change = RecordChange.Write, Record = [1], Signals = [new Probed("x")] }],
        };

        var back = serializer.Deserialize<LogSegment>(serializer.SerializeToArray(segment))!;

        Assert.Equal((5L, "p/log/1", RecordChange.Write, new byte[] { 1 }), (back.FirstSeq, back.Prev!.SegmentId, back.Entries[0].Change, back.Entries[0].Record));
        Assert.Equal("x", Assert.IsType<Probed>(Assert.Single(back.Entries[0].Signals)).Value);
    }

    [Fact(Timeout = 60_000)]
    public async Task AHeadPayloadAndASnapshotRoundTrip()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var head = new HeadPayload { Snapshot = new MeshRef("p/snapshot/9", "sha256:bb", ["n1"]), SnapshotSeq = 9, LastSeq = 12, SegmentsSinceSnapshot = 2 };
        var snapshot = new PartSnapshot { Seq = 9, Records = [new SnapshotRecord { GrainId = "g", StateName = "s", Record = [2], ETagSeq = 7 }] };

        var headBack = serializer.Deserialize<HeadPayload>(serializer.SerializeToArray(head))!;
        var snapshotBack = serializer.Deserialize<PartSnapshot>(serializer.SerializeToArray(snapshot))!;

        Assert.Equal((9L, 12L, 2), (headBack.SnapshotSeq, headBack.LastSeq, headBack.SegmentsSinceSnapshot));
        Assert.Equal(7L, Assert.Single(snapshotBack.Records).ETagSeq);
    }
}

[GenerateSerializer, Alias("test.probed")]
public sealed record Probed([property: Id(0)] string Value) : Signal;
```

  (If `Signal` requires constructor arguments, match its shape from Step 1.)

- [ ] **Step 3: Run** `... -- --filter-class "*PartLogModelFacts*"` → FAIL. **Step 4: Implement** the types as listed (aliases `platform.parts.entry`, `.segment`, `.snapshot`, `.snapshot-record`, `.head`, `.record-change`). **Step 5: Run** → PASS. **Step 6: Commit** both files: `git commit -m "Parts: a log entry is one neuron change, its record and its signals"`.

### Task 11: Part lease (Q11, Q15, Q26, Review Focus 1)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLease.cs`
- Create: `src/DigitalBrain/Neurons/LeaseLostException.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartLeaseFacts.cs`

**Interfaces:**
- Consumes: `ISequencerGrain`, `HeadRecord`, `MachineIdentity`, `SeenVersions`, `PartsOptions`, `SegmentSeal`, `Serializer`.
- Produces: `internal sealed class PartLease`:
  - `static Task<PartLease> Acquire(PartId part, byte[] key, IGrainFactory grains, MachineIdentity machine, SeenVersions seen, PartsOptions options, TimeProvider time, Serializer serializer)` — refuses the core on a non-own machine (`UnauthorizedAccessException`, Q11); reads the head; `seen.Check`; another machine's live lease → `ServiceUnavailableException`; opens the payload (empty `HeadPayload` when none); CASes itself in as holder with `options.Lease`.
  - `HeadPayload Payload`, `long Version`, `bool NeedsRenewal` (short: less than `RenewBefore` left; own: less than half of `OwnLease` left), `Task Commit(HeadPayload next)` (refused CAS → `LeaseLostException`, and the lease stays lost), `Task Renew()`, `Task Release()`.
  - Payload sealing context: `$"part-head|{part.Value}"`. After each accepted CAS: `seen.Saw`.
  - `public sealed class LeaseLostException(string message) : Exception` in namespace `DigitalBrain`, `[GenerateSerializer, Alias("framework.lease-lost")]`.

- [ ] **Step 1: Failing tests.** Add `Microsoft.Extensions.TimeProvider.Testing` to the test project (`Directory.Packages.props` holds versions; add one there if missing).

```csharp
using System.Security.Cryptography;
using DigitalBrain.Framework.Parts;
using DigitalBrain.Platform.Parts;
using DigitalBrain.Platform.Sequencer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Orleans.Serialization;

namespace DigitalBrain.Platform.Tests.Unit.Parts;

public sealed class PartLeaseFacts
{
    internal static SeenVersions Seen() => new(Path.Combine(Path.GetTempPath(), $"seen-{Guid.NewGuid():N}.json"));

    private static PartsOptions Short => new() { Role = MachineRole.Cloud, ShortLease = TimeSpan.FromSeconds(1), RenewBefore = TimeSpan.FromMilliseconds(500) };

    [Fact(Timeout = 60_000)]
    public async Task ALeaseIsExclusiveUntilItIsReleased()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var part = PartId.ForApp("home", "notes");
        var key = RandomNumberGenerator.GetBytes(32);
        using var alice = SequencerFacts.Machine();
        using var bob = SequencerFacts.Machine();
        var options = new PartsOptions { Role = MachineRole.Own };

        var a = await PartLease.Acquire(part, key, brain.Grains, alice, Seen(), options, TimeProvider.System, serializer);
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => PartLease.Acquire(part, key, brain.Grains, bob, Seen(), options, TimeProvider.System, serializer));
        await a.Release();
        Assert.NotNull(await PartLease.Acquire(part, key, brain.Grains, bob, Seen(), options, TimeProvider.System, serializer));
    }

    [Fact(Timeout = 60_000)]
    public async Task ACommitAfterAnotherMachineTookTheLeaseFails()
    {
        var ct = TestContext.Current.CancellationToken;
        var time = new FakeTimeProvider(DateTimeOffset.UtcNow);
        await using var brain = await ModuleTest.Create().ConfigureSilo(silo => silo.Services.AddSingleton<TimeProvider>(time)).StartAsync(ct);
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var part = PartId.ForApp("home", "notes");
        var key = RandomNumberGenerator.GetBytes(32);
        using var alice = SequencerFacts.Machine();
        using var bob = SequencerFacts.Machine();
        var a = await PartLease.Acquire(part, key, brain.Grains, alice, Seen(), Short, time, serializer);

        time.Advance(TimeSpan.FromSeconds(2));
        var b = await PartLease.Acquire(part, key, brain.Grains, bob, Seen(), Short, time, serializer);

        await Assert.ThrowsAsync<LeaseLostException>(() => a.Commit(new HeadPayload { LastSeq = 99 }));
        await Assert.ThrowsAsync<LeaseLostException>(() => a.Renew());
        Assert.Equal(b.Version, (await brain.Grains.GetGrain<ISequencerGrain>(HeadRecord.HashOf(part.Value)).Get())!.Version);
    }

    [Fact(Timeout = 60_000)]
    public async Task TheCoreIsNeverLeasedToAMachineThatIsNotTheOwners()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        using var cloud = SequencerFacts.Machine();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => PartLease.Acquire(PartId.Core("home"), RandomNumberGenerator.GetBytes(32),
            brain.Grains, cloud, Seen(), new PartsOptions { Role = MachineRole.Cloud }, TimeProvider.System, brain.SiloServices.GetRequiredService<Serializer>()));
    }

    [Fact(Timeout = 60_000)]
    public async Task AnOlderHeadThanOnceSeenIsRefusedAtAcquire()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var part = PartId.ForApp("home", "notes");
        using var alice = SequencerFacts.Machine();
        var seen = Seen();
        seen.Saw(HeadRecord.HashOf(part.Value), 5);
        await brain.Grains.GetGrain<ISequencerGrain>(HeadRecord.HashOf(part.Value))
            .CompareAndSet(0, SequencerFacts.Record(alice, HeadRecord.HashOf(part.Value), 1, TimeSpan.FromSeconds(-1)));

        await Assert.ThrowsAsync<RollbackDetectedException>(() => PartLease.Acquire(part, RandomNumberGenerator.GetBytes(32), brain.Grains, alice, seen,
            new PartsOptions(), TimeProvider.System, brain.SiloServices.GetRequiredService<Serializer>()));
    }
}
```

- [ ] **Step 2: Run** `... -- --filter-class "*PartLeaseFacts*"` → FAIL.

- [ ] **Step 3: Implement**

```csharp
using DigitalBrain.Framework.Parts;
using DigitalBrain.Platform.Mesh;
using DigitalBrain.Platform.Sequencer;
using Orleans.Serialization;

namespace DigitalBrain.Platform.Parts;

// This machine's hold on one part (Q11, Q15, Q26). Every head change is a signed CAS at the sequencer; once a CAS
// is refused the lease is lost for good, so nothing written after it can be reported durable.
internal sealed class PartLease
{
    private readonly PartId _part;
    private readonly byte[] _key;
    private readonly ISequencerGrain _sequencer;
    private readonly MachineIdentity _machine;
    private readonly SeenVersions _seen;
    private readonly PartsOptions _options;
    private readonly TimeProvider _time;
    private readonly Serializer _serializer;
    private DateTimeOffset _expiry;
    private bool _lost;

    private PartLease(PartId part, byte[] key, ISequencerGrain sequencer, MachineIdentity machine, SeenVersions seen,
        PartsOptions options, TimeProvider time, Serializer serializer) =>
        (_part, _key, _sequencer, _machine, _seen, _options, _time, _serializer) = (part, key, sequencer, machine, seen, options, time, serializer);

    public HeadPayload Payload { get; private set; } = new();

    public long Version { get; private set; }

    public bool NeedsRenewal => _expiry - _time.GetUtcNow() < (_options.Role == MachineRole.Own ? _options.OwnLease / 2 : _options.RenewBefore);

    private string Hash => HeadRecord.HashOf(_part.Value);

    private string Context => $"part-head|{_part.Value}";

    public static async Task<PartLease> Acquire(PartId part, byte[] key, IGrainFactory grains, MachineIdentity machine, SeenVersions seen,
        PartsOptions options, TimeProvider time, Serializer serializer)
    {
        if (part.IsCore && options.Role != MachineRole.Own) { throw new UnauthorizedAccessException($"The core of {part.BrainId} is held only by its owner's machines."); }
        var lease = new PartLease(part, key, grains.GetGrain<ISequencerGrain>(HeadRecord.HashOf(part.Value)), machine, seen, options, time, serializer);
        if (await lease._sequencer.Get() is { } current)
        {
            seen.Check(lease.Hash, current.Version);
            if (current.Holder != machine.MachineId && current.LeaseExpiry > time.GetUtcNow())
            { throw new ServiceUnavailableException($"Part {part} is held by machine {current.Holder} until {current.LeaseExpiry:O}."); }
            lease.Version = current.Version;
            lease.Payload = serializer.Deserialize<HeadPayload>(SegmentSeal.Open(key, lease.Context, current.Payload))!;
        }
        await lease.Commit(lease.Payload);
        return lease;
    }

    public async Task Commit(HeadPayload next) => await Cas(next, _time.GetUtcNow() + _options.Lease);

    public Task Renew() => Commit(Payload);

    public async Task Release()
    {
        if (_lost) { return; }
        try { await Cas(Payload, _time.GetUtcNow()); }
        finally { _lost = true; }
    }

    private async Task Cas(HeadPayload next, DateTimeOffset expiry)
    {
        if (_lost) { throw new LeaseLostException($"The lease on part {_part} is lost."); }
        var record = new HeadRecord
        {
            PartHash = Hash, Version = Version + 1, Holder = _machine.MachineId, HolderKey = _machine.PublicKey, LeaseExpiry = expiry,
            Payload = SegmentSeal.Close(_key, Context, _serializer.SerializeToArray(next)),
        };
        record.Signature = _machine.Sign(record.SignedBytes());
        if (!await _sequencer.CompareAndSet(Version, record))
        {
            _lost = true;
            throw new LeaseLostException($"The sequencer refused version {Version + 1} of part {_part}.");
        }
        (Version, Payload, _expiry) = (record.Version, next, expiry);
        _seen.Saw(Hash, Version);
    }
}
```

```csharp
// src/DigitalBrain/Neurons/LeaseLostException.cs
namespace DigitalBrain;

// A refusal word: this machine no longer holds the part it was writing; nothing after this is durable.
[GenerateSerializer, Alias("framework.lease-lost")]
public sealed class LeaseLostException(string message) : Exception(message);
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** the three files: `git commit -m "Parts: a part lease is a chain of signed CASes, long on own machines, never the core elsewhere"`.

### Task 12: Local journal and the part log (Q18, Q26, Review Focus 2–3)

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartJournal.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLog.cs`
- Create: `src/DigitalBrain/Neurons/JournalConflictException.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartJournalFacts.cs`, `PartLogFacts.cs`

**Interfaces:**
- Produces:
  - `internal sealed class PartJournal(string path, byte[] key, Serializer serializer)`: `void Append(LogEntry entry)` — seals the entry (`SegmentSeal`, context `part-journal|{path}`), writes `[int32 length][sealed]`, flushes to disk (`FileStream.Flush(flushToDisk: true)`); `LogEntry[] Read()` — every entry, in order (a torn last record is ignored); `void TrimThrough(long seq)` — rewrites the file without entries `<= seq` (temp file + atomic move); `void SetAside()` — renames the file to `{path}.conflict-{utc:yyyyMMddHHmmss}`.
  - `internal sealed class PartLog : IAsyncDisposable`:
    - `static Task<PartLog> Open(PartId part, byte[] key, PartLease lease, IMeshStore mesh, Serializer serializer, PartsOptions options, TimeProvider time, CancellationToken ct)` — loads the snapshot, replays the chain (walk `Prev` from `Head` to `SnapshotSeq`, apply oldest first) into `Dictionary<(string GrainId, string StateName), StoredRecord>` (`StoredRecord(byte[] Record, long ETagSeq)`); keeps every replayed entry with signals in `List<LogEntry> Since` (entries after the snapshot). On an own machine, then reads `{MachineDirectory}/journal/{HeadRecord.HashOf(part)}.log`: entries with `Seq <= LastSeq` are trimmed; entries continuing at `LastSeq + 1` are applied and queued for commit; entries whose first seq is not `LastSeq + 1` mean another machine wrote meanwhile → `SetAside()` and throw `JournalConflictException`.
    - `StoredRecord? Read(string grainId, string stateName)`; `long LastSeq`.
    - `Task<long> Append(string grainId, string stateName, RecordChange change, byte[] record, Signal[] signals)` — assigns the next seq; on an own machine journals first and returns once journaled (`AcknowledgeOnJournal`), with the commit following in the background; elsewhere returns once committed.
    - `IReadOnlyList<LogEntry> SignalsSince(long seq)` — entries after `seq` that carry signals, from `Since` (Task 16 extends this past snapshots).
  - Group commit: the first append to an empty queue schedules a flush after `BatchDelay`; reaching `BatchBytes` flushes at once. A flush: `mesh.Write` one `LogSegment { Prev = Payload.Head }`, `lease.Commit(new HeadPayload { Head = ref, …, LastSeq, SegmentsSinceSnapshot + 1 })`, then `journal.TrimThrough(LastSeq)` and complete each waiter. Flushes are serialized by a `SemaphoreSlim(1)`. A failure other than `LeaseLostException` leaves the batch queued (own machine: still journaled, retried on the next flush with backoff 1 s → 60 s; elsewhere: waiters fail and the queue is cleared, `_nextSeq` reset to `LastSeq + 1`). `LeaseLostException` closes the log: every waiter and later `Append` fails with it. A renew loop calls `lease.Renew()` when `NeedsRenewal` and no flush is pending.
  - `public sealed class JournalConflictException(string message) : Exception` in namespace `DigitalBrain`, `[GenerateSerializer, Alias("framework.journal-conflict")]`.

- [ ] **Step 1: Failing journal tests**

```csharp
using System.Security.Cryptography;
using DigitalBrain.Platform.Parts;
using Microsoft.Extensions.DependencyInjection;
using Orleans.Serialization;

namespace DigitalBrain.Platform.Tests.Unit.Parts;

public sealed class PartJournalFacts
{
    [Fact(Timeout = 60_000)]
    public async Task EntriesSurviveReopeningAndATornTailIsIgnored()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var key = RandomNumberGenerator.GetBytes(32);
        var path = Path.Combine(Path.GetTempPath(), $"journal-{Guid.NewGuid():N}.log");
        var journal = new PartJournal(path, key, serializer);
        journal.Append(new LogEntry { Seq = 1, GrainId = "g", StateName = "s", Change = RecordChange.Write, Record = [1], Signals = [] });
        journal.Append(new LogEntry { Seq = 2, GrainId = "g", StateName = "s", Change = RecordChange.Write, Record = [2], Signals = [] });
        await File.AppendAllBytesAsync(path, [0, 0, 1, 0, 42], ct);

        var entries = new PartJournal(path, key, serializer).Read();

        Assert.Equal([1L, 2L], entries.Select(e => e.Seq));
        Assert.DoesNotContain("g", await File.ReadAllTextAsync(path, ct), StringComparison.Ordinal);
    }

    [Fact(Timeout = 60_000)]
    public async Task TrimmingDropsCommittedEntries()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var journal = new PartJournal(Path.Combine(Path.GetTempPath(), $"journal-{Guid.NewGuid():N}.log"), RandomNumberGenerator.GetBytes(32), brain.SiloServices.GetRequiredService<Serializer>());
        foreach (var seq in new long[] { 1, 2, 3 }) { journal.Append(new LogEntry { Seq = seq, GrainId = "g", StateName = "s", Record = [], Signals = [] }); }

        journal.TrimThrough(2);

        Assert.Equal([3L], journal.Read().Select(e => e.Seq));
    }
}
```

- [ ] **Step 2: Failing log tests** in `PartLogFacts`, with this helper (the test host registers 8 storage nodes, owner `platform`, and `MeshOptions` 4+2 — Task 13 moves that into `ModuleTest`; until then the helper does it as `MeshStoreFacts.StartAsync` does):

```csharp
    internal static async Task<PartLog> OpenAsync(ModuleBrain brain, PartId part, byte[] key, MachineIdentity machine, PartsOptions options, TimeProvider time, CancellationToken ct)
    {
        var serializer = brain.SiloServices.GetRequiredService<Serializer>();
        var lease = await PartLease.Acquire(part, key, brain.Grains, machine, PartLeaseFacts.Seen(), options, time, serializer);
        return await PartLog.Open(part, key, lease, brain.SiloServices.GetRequiredService<IMeshStore>(), serializer, options, time, ct);
    }
```

  Facts (each a full test body in the file):
  - `AppendedChangesAreReadBackAfterReopening` — Cloud role; two writes to `("g1","s")`; dispose (releases); reopen; `Read` returns the second record with `ETagSeq == 2`.
  - `ConcurrentAppendsShareOneSegment` — Cloud role, `BatchDelay = 50 ms`; 20 appends started together; seqs are 1..20; head payload `SegmentsSinceSnapshot == 1`.
  - `ASegmentWithoutAnAcceptedHeadIsInvisible` (Review Focus 3) — one committed write; then `IMeshStore.Write` a segment with `Prev = lease.Payload.Head` and no CAS; reopen; `LastSeq == 1` and the extra change is absent.
  - `AnOwnMachineKeepsWritingWhileTheSequencerIsUnreachableAndCommitsOnReconnect` — Own role; simulate the outage with a test `IMeshStore` decorator that throws `ServiceUnavailableException` while `Offline = true` (a flush fails at the mesh write, before the CAS, exactly as an unreachable platform would); two appends return (journaled); `Read` sees them; `Offline = false`; wait for the flush (`await log.Flushed()` — expose `internal Task Flushed()` that completes when the queue is empty); reopen on the same machine: both changes present, journal file empty.
  - `AnOwnMachinesJournalThatConflictsIsSetAsideAndRefused` (Review Focus 2) — Own machine A journals one change while offline, then its lease is expired with `FakeTimeProvider` and machine B (Own role, same account) acquires and commits one change; reopening A's log throws `JournalConflictException` and a `*.conflict-*` file exists next to the journal.
  - `AWriteAfterTheLeaseIsLostFails` — Cloud role; B takes the lease after expiry; A's next `Append` throws `LeaseLostException`; B's reopened log shows only A's committed changes.

- [ ] **Step 3: Run** `... -- --filter-class "*PartJournalFacts*|*PartLogFacts*"` (run them as two commands if the filter syntax refuses `|`) → FAIL.

- [ ] **Step 4: Implement** `JournalConflictException`, `PartJournal` and `PartLog` per the interfaces. The heart of the flush:

```csharp
    private async Task Flush()
    {
        await _flushing.WaitAsync();
        try
        {
            Pending[] batch;
            lock (_queue) { batch = [.. _queue]; }
            if (batch.Length == 0) { return; }
            var payload = _lease.Payload;
            var segment = new LogSegment { FirstSeq = batch[0].Entry.Seq, Entries = [.. batch.Select(p => p.Entry)], Prev = payload.Head };
            try
            {
                var reference = await _mesh.Write(_key, PartSegments.SegmentId(_part, segment.FirstSeq), _serializer.SerializeToArray(segment));
                await _lease.Commit(new HeadPayload
                {
                    Head = reference, Snapshot = payload.Snapshot, SnapshotSeq = payload.SnapshotSeq,
                    LastSeq = batch[^1].Entry.Seq, SegmentsSinceSnapshot = payload.SegmentsSinceSnapshot + 1,
                });
                _chain.Add(reference);
                lock (_queue) { _queue.RemoveRange(0, batch.Length); }
                _journal?.TrimThrough(batch[^1].Entry.Seq);
                foreach (var pending in batch) { pending.Committed.TrySetResult(pending.Entry.Seq); }
                _backoff = TimeSpan.FromSeconds(1);
            }
            catch (LeaseLostException lost)
            {
                _closed = lost;
                FailAll(lost);
            }
            catch (Exception error) when (_journal is not null)
            {
                _logger.LogWarning(error, "Part {Part} could not commit; {Count} journaled changes wait for the next attempt.", _part, batch.Length);
                ScheduleFlush(_backoff);
                _backoff = TimeSpan.FromTicks(Math.Min(_backoff.Ticks * 2, TimeSpan.FromSeconds(60).Ticks));
            }
            catch (Exception error)
            {
                FailAll(error);
                _nextSeq = _lease.Payload.LastSeq + 1;
            }
        }
        finally { _flushing.Release(); }
    }
```

  (`Pending` = `(LogEntry Entry, TaskCompletionSource<long> Committed)`; `Append` applies the change to the in-memory map immediately on an own machine after journaling, and after commit elsewhere; `_chain` holds the refs of the current chain for Task 15's discards; `ILogger<PartLog>` is passed to `Open`.)

- [ ] **Step 5: Run** → PASS (all eight facts). **Step 6: Commit** the five files: `git commit -m "Parts: the part log replays from its head, group-commits changes, and own machines journal through outages"`.

### Task 13: On a machine, `cluster` storage is the part log

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLogs.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartGrainStorage.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/MachineHosting.cs`
- Modify: `src/Testing/DigitalBrain.Testing.Module/ModuleTestBuilder.cs` (`WithPartLog()`), `ModuleTest.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartGrainStorageFacts.cs`

**Interfaces:**
- Consumes: `PartId.Of` (Task 2), `IPartKeys`, `PartLease`, `PartLog`.
- Produces:
  - `internal sealed class PartLogs(IGrainFactory grains, IMeshStore mesh, IPartKeys keys, MachineIdentity machine, SeenVersions seen, Serializer serializer, IOptions<PartsOptions> options, TimeProvider time, ILoggerFactory logging) : IAsyncDisposable` with `Task<PartLog> For(PartId part)` — one `PartLog` per part (`ConcurrentDictionary<string, Lazy<Task<PartLog>>>`), reopened after `LeaseLostException`; the owner account comes from the brain: `grains.GetGrain<IBrain>(part.BrainId).Read()` → `Owner.AccountId` (LSP-check `IBrain.Read` and `Owner`), cached per brain; `DisposeAsync` releases every lease.
  - `internal sealed class PartGrainStorage(PartLogs logs, Serializer serializer) : IGrainStorage` — ETag = entry seq; a write whose `ETag` differs from the stored record's → `InconsistentStateException`; signals pending for this write (Task 14) ride in the same entry.
  - `public static ISiloBuilder AddMachinePartLog(this ISiloBuilder silo)` in `MachineHosting` — registers `PartLogs` and replaces the keyed `IGrainStorage` for `ClusterGrainStorage` with `PartGrainStorage`, *before* the kernel registration decorator wraps it (LSP `goToDefinition` on `InstanceRegistration.TryDecorate` and call it after replacing).
  - `ModuleTestBuilder.WithPartLog()` — calls `AddMachinePartLog`, registers 8 seed nodes with owner `platform` in `IStorageNodeDirectory`, and sets `MeshOptions` to 4+2 with 2 manifest replicas. Plain module tests keep memory `cluster` storage.

- [ ] **Step 1: Failing tests** — a test neuron in the test project:

```csharp
public interface IPartCounter : INeuron { Task<int> Increment(); Task<int> Read(); }

[GrainType("test.part-counter")]
public sealed class PartCounterNeuron([PersistentState("counter", DigitalBrainNames.ClusterGrainStorage)] IPersistentState<PartCounterState> state) : Neuron, IPartCounter
{
    public async Task<int> Increment() { state.State.Value++; await state.WriteStateAsync(); return state.State.Value; }
    public Task<int> Read() => Task.FromResult(state.State.Value);
}

[GenerateSerializer, Alias("test.part-counter-state")]
public sealed class PartCounterState { [Id(0)] public int Value { get; set; } }
```

  Facts (keys `{scope}/apps/counter/c1`, where `scope = BrainScope.Create(account, "home").Id` and the brain is created first through `brain.Self`):
  - `ANeuronKeepsItsStateInItsPartAcrossASiloRestart` — increment 3×; `brain.RestartSiloAsync`; `Read()` == 3; the sequencer has a head for `HeadRecord.HashOf("{scope}/apps/counter")`.
  - `NoNeuronStateReachesPlatformStorage` — after an increment, the keyed `IGrainStorage` for `PlatformGrainStorage` has no record for the counter grain (`ReadStateAsync` → `RecordExists == false`).
  - `AStaleETagIsRefused` — call `PartGrainStorage.WriteStateAsync` directly with a `GrainState<PartCounterState>` whose `ETag` is `"0"` after a write moved it on → `InconsistentStateException`.
  - `AKeyOutsideEveryBrainIsRefusedOnAMachine` — a test grain keyed `@platform/x` on `ClusterGrainStorage` fails its first write with `ArgumentException` (Q27: a machine hosts only brain parts).

- [ ] **Step 2: Run** `... -- --filter-class "*PartGrainStorageFacts*"` → FAIL.

- [ ] **Step 3: Implement.** `PartGrainStorage.ReadStateAsync`:

```csharp
    public async Task ReadStateAsync<T>(string stateName, GrainId grainId, IGrainState<T> grainState)
    {
        var log = await logs.For(PartId.Of(grainId.Key.ToString()!));
        if (log.Read(grainId.ToString(), stateName) is { } stored)
        {
            grainState.State = serializer.Deserialize<T>(stored.Record)!;
            (grainState.ETag, grainState.RecordExists) = (stored.ETagSeq.ToString(CultureInfo.InvariantCulture), true);
        }
        else
        {
            grainState.State = Activator.CreateInstance<T>();
            (grainState.ETag, grainState.RecordExists) = (null, false);
        }
    }
```

  `WriteStateAsync` checks the ETag against `log.Read(...)?.ETagSeq`, then `await log.Append(grainId.ToString(), stateName, RecordChange.Write, serializer.SerializeToArray(grainState.State), SignalJournal.TakePending())` and sets `ETag` to the returned seq and `RecordExists = true`. `ClearStateAsync` appends `RecordChange.Clear` the same way. (`SignalJournal.TakePending()` arrives in Task 14; until then pass `[]` and replace it there.)

- [ ] **Step 4: Run** the Platform suite, then **every module's unit suite once with `WithPartLog()` forced on** (temporarily flip the `ModuleTest` default in a scratch run, do not commit the flip) to prove neurons run unchanged on the part log; fix readiness problems it exposes, never timeouts.

- [ ] **Step 5: Commit** the six files: `git commit -m "Parts: on a machine, cluster grain storage is the part log; neurons are unchanged"`.

### Task 14: A state write and its signals are one entry (Q27, Review Focus 4)

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SignalJournal.cs`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Neuron.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartSignalJournal.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartGrainStorage.cs`, `MachineHosting.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartSignalFacts.cs`

**Interfaces:**
- Produces (Framework):

```csharp
namespace DigitalBrain.Framework;

// Where a neuron's signals become durable before anyone sees them (Q27). Hosts without a part log journal
// nothing; on a machine, signals ride in the same log entry as the state write that caused them, or alone.
public interface ISignalJournal
{
    // A signal published without a state write: durable once this completes.
    Task Append(GrainId publisher, Signal[] signals);
}

public static class SignalJournal
{
    private static readonly AsyncLocal<List<Signal>?> Pending = new();

    // Signals a Save is about to publish; the storage write running inside this scope takes them.
    public static IDisposable Attach(Signal[] signals)
    {
        var previous = Pending.Value;
        Pending.Value = [.. signals];
        return new Scope(previous);
    }

    public static Signal[] TakePending()
    {
        if (Pending.Value is not { } pending) { return []; }
        Signal[] taken = [.. pending];
        pending.Clear();
        return taken;
    }

    internal static bool Taken => Pending.Value is { Count: 0 };

    private sealed class Scope(List<Signal>? previous) : IDisposable
    {
        public void Dispose() => Pending.Value = previous;
    }
}

internal sealed class NoSignalJournal : ISignalJournal
{
    public Task Append(GrainId publisher, Signal[] signals) => Task.CompletedTask;
}
```

- `Neuron` changes (LSP `findReferences` on `PublishAsync` first — 58 callers stay source-compatible):
  - split stamping from notifying: `private Signal Stamp(Signal signal) => signal with { Publisher = Id, Trace = TraceContext.Current };` and `private Task Notify(Signal stamped)` (the current hub publish + observers notify).
  - `protected async Task PublishAsync(Signal signal) { var stamped = Stamp(signal); await Journal.Append(this.GetGrainId(), [stamped]); await Notify(stamped); }` where `Journal` resolves `ISignalJournal` from `ServiceProvider` (registered `NoSignalJournal` by default in the Framework's silo registration — LSP-find where `LocalSignalHub` is registered and add it beside).
  - `Neuron<TState>.Save(next, changed, acted)`: stamp both signals; `using (SignalJournal.Attach(acted is null ? [c] : [c, a])) { await SaveQuietly(next); }`; if the storage took them (`SignalJournal.Taken` read inside the scope before disposing), notify without journaling again; otherwise (memory storage in plain tests) journal them through `Journal.Append` as today's `PublishAsync` would. Then `Notify` each.
  - `Clear(changed)`: same pattern around `store.ClearStateAsync()`.
- Platform: `PartSignalJournal(PartLogs logs) : ISignalJournal` — `Append` = `log.Append(publisher.ToString(), "", RecordChange.None, [], signals)`; `AddMachinePartLog` registers it in place of `NoSignalJournal`. `PartGrainStorage` passes `SignalJournal.TakePending()` (replacing Task 13's `[]`).

- [ ] **Step 1: Failing tests** (`WithPartLog()` host; a test neuron deriving `Neuron<TState>` whose `Change(int)` calls `Save(next, new Changed(value))`, and whose `Ping()` calls `PublishAsync(new Pinged())`):
  - `AStateChangeAndItsSignalAreOneEntry` — after `Change(5)`, the part log's last entry has `Change == Write` and one `Changed` signal.
  - `ASignalWithoutAStateChangeIsItsOwnEntry` — after `Ping()`, the last entry has `Change == None` and one `Pinged`.
  - `AFailedStateWriteNeverPublishesItsSignal` — make the part log refuse the write (lose the lease through `FakeTimeProvider` and a second machine); a subscriber (`brain.SubscribeAsync<Changed>`) receives nothing and `Change` throws `LeaseLostException`.
  - `PlainHostsStillPublishAsBefore` — without `WithPartLog()`, `Change(1)` delivers `Changed` to a subscriber (regression for every module test).

- [ ] **Step 2: Run** `... -- --filter-class "*PartSignalFacts*"` → FAIL. **Step 3: Implement.** **Step 4: Run** the Platform, Framework and Client suites, and one module suite per ring touched (Apps, Flutter, AI) → PASS. **Step 5: Commit** the six files: `git commit -m "Signals: a neuron's signals are durable in its part log, in the same entry as the change that caused them"`.

### Task 15: Snapshots and garbage

**Files:**
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLog.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PartSnapshotFacts.cs`

**Interfaces:**
- Produces: `Task Snapshot()` on `PartLog`, run by a flush when `SegmentsSinceSnapshot >= SnapshotEvery` (inside the flush lock, after completing the batch): `mesh.Write(PartSnapshot { Seq = LastSeq, Records = map })` as `SnapshotId(part, LastSeq)`; `lease.Commit(new HeadPayload { Head = null, Snapshot = ref, SnapshotSeq = LastSeq, LastSeq, SegmentsSinceSnapshot = 0 })`; then `mesh.Discard` the previous snapshot and every ref in `_chain` (collected during `Open` and each flush, so no reads are needed). Discard failures are logged, never thrown. Signals in the discarded chain stay readable for subscribers through `Since` (in memory) until Task 16 decides retention; a snapshot keeps the signals of the last `SnapshotEvery` segments in `PartSnapshot.RecentSignals` (`LogEntry[]`, add the field) so a reopened log can still serve them.

- [ ] **Step 1: Failing tests:**
  - `ASnapshotReplacesTheChainAndReopeningReadsIt` (`SnapshotEvery = 2`, three single-change flushes, reopen: state intact; head payload `Snapshot != null`, `SegmentsSinceSnapshot == 1`).
  - `ReplacedSegmentsAreDiscarded` (refs of the first two segments read from the head chain before the snapshot; after it, `IMeshStore.Read` of each throws `ServiceUnavailableException`).
  - `SignalsBeforeASnapshotAreStillServedAfterReopening` (`SignalsSince(0)` after reopen contains the pre-snapshot signals).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit**: `git commit -m "Parts: periodic snapshots replace the chain, and the writer discards what they replaced"`.

### Task 16: Subscriptions read the part log from their watermark (Q13)

The signal path is now durable (Task 14); this task makes `brain.On<T>(source)` replay from it after reactivation instead of only receiving live notifications.

- [x] **Step 1: Map with LSP.** Result:
  - `brain.On<T>(source)` in a behavior runs over `SessionSignalSubscription<T>` (Client) → `SessionConnection.SubscribeAsync` → `IBrainRuntimeEdge.Subscribed` on `BrainRuntimeNeuron` (`src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/BrainRuntimeNeuron.cs`). The durable subscription is the `Subscription` record (`Runtime/Subscription.cs`) in `BrainRuntimeState.Subscriptions`, persisted in the runtime neuron's own state. Its `Watermark` (`Delivered + Pending.Length`) is the sandbox's ack counter, not a source position; live signals reach it through `INeuronObserver.OnSignalAsync` → one-way `IBrainRuntimeArrivals.Arrived`; `ResumeAsync` (from `BrainRuntimeActivation`) re-watches sources on activation.
  - `IBrainSubscriptions.SubscribeAsync` / `ISignalSubscription.ReadAllAsync` / `SignalSubscription` (Client.Orleans `BrainClient`, `ModuleBrain`, `E2EBrain`, `ObservedBrain`) are silo/test live handles with no durable watermark; they stay live-only.
  - Signal durability: `ISignalJournal` (Framework `Runtime/Signalling/SignalJournal.cs`, `NoSignalJournal` registered by `BrainHosting`), `PartSignalJournal` (Platform, swapped in by `MachineHosting.AddMachinePartLog`), `PartLog.SignalsSince`, `PartSnapshot.RecentSignals`; test double `CloudPartJournal` in `PartSignalFacts.cs`.
  - **Watermark type:** `long SourceSeq` on `Subscription`, the part-log seq of the last entry of the source's part it has buffered. It lives in the runtime neuron's state (state lives in neurons; `brain.On<T>` unchanged). Signals of one entry share its seq, so dedup is by entry seq.
- [x] **Step 2: Step-level tasks** (requirements: watermark is a part-log seq; (re)activation reads the source's part from it before live delivery, dedup by seq; a part not leasable here fails with `ServiceUnavailableException`; `brain.On<T>` unchanged; plain hosts unchanged).

#### Task 16.1: The journal reads one publisher's signals from a part-log seq

**Files:**
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework/Runtime/Signalling/SignalJournal.cs`, `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartSignalJournal.cs`, `.../Parts/PartLog.cs`, `.../Parts/PartLogModel.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/PublisherSignalsFacts.cs` (new); `PartSignalFacts.cs` (`CloudPartJournal` gains the member)

**Interfaces:**
- `Task<PartSignals?> ISignalJournal.SignalsOf(GrainId publisher, long since)`; `record PartSignals(long Floor, long Last, JournaledSignal[] Signals)`: `JournaledSignal.Sequence` is the entry's part-log seq; `Last` is the log's `LastSeq` (a new subscription's starting watermark); entries at or below `Floor` may no longer be served. `NoSignalJournal` returns `null` (nothing to replay).
- `PartSignalJournal.SignalsOf` opens the publisher's part through `PartLogs.For` (a part leased by another machine throws `ServiceUnavailableException` from `PartLease.Acquire`).
- Retention: `PartSnapshot.SignalsFrom` (the previous snapshot seq, below which `RecentSignals` is incomplete), `PartLog.SignalsFloor` set from it on replay (0 for a log never snapshotted).

- [ ] **Step 1: Failing facts:** `APublishersSignalsAreReadAfterASeqWithTheirEntrySeq`, `APartHeldByAnotherMachineIsUnavailable`, `ASnapshotRaisesTheFloorAReopenedLogServesFrom`, `PlainHostsHaveNothingToReplay`.
- [ ] **Step 2: Run** `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*PublisherSignalsFacts*"` → FAIL (compile). **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit:** `Signals: the journal reads one publisher's signals from a part-log seq, with the floor its log still serves`.

#### Task 16.2: A runtime subscription's watermark is its source's part-log seq

**Files:**
- Modify: `.../CSharp/DigitalBrain.Modules.Microsoft.CSharp/Runtime/Subscription.cs`, `Runtime/BrainRuntimeNeuron.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/PartLogReplayFacts.cs` (new)

**Interfaces:** `Subscription.SourceSeq`; a new subscription starts at `PartSignals.Last`; on a journaled host a live arrival is a nudge: the runtime reads `SignalsOf(source, min SourceSeq)` and buffers each signal with seq above a subscription's `SourceSeq`, then advances it. `null` from the journal keeps today's path (buffer the live signal).

- [ ] **Step 1: Failing facts:** `ANewSubscriptionStartsAtItsSourcesCurrentSeq` (a signal journalled before subscribing is not replayed), `ASignalJournalledWithoutANotificationArrivesWithTheNextLiveOneOnce` (entry appended straight to the part log, then a live ping: pending holds each once, in seq order).
- [ ] **Step 2: Run** `... -- --filter-class "*PartLogReplayFacts*"` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit:** `CSharp: a runtime subscription's watermark is its source's part-log seq, and live arrivals deliver from the log once`.

#### Task 16.3: Reactivation catches up from the watermark; an unleasable source is unavailable

**Files:** `Runtime/BrainRuntimeNeuron.cs`, `Runtime/IBrainRuntimeArrivals.cs`; test `PartLogReplayFacts.cs`.

**Interfaces:** `[OneWay] Task IBrainRuntimeArrivals.CatchUp()` sent by `ResumeAsync` (never reads a log inside activation); a re-subscribing behavior (`Subscribed` on an existing subscription) catches up before its batch is pushed, so `ServiceUnavailableException` from the journal reaches the sandbox; a read whose `Floor` is above a watermark logs `SubscriptionGap` and continues from what is served.

- [ ] **Step 1: Failing facts:** `SignalsJournalledWhileTheRuntimeSleptAreDeliveredWhenItReactivates`, `AReactivatedRuntimeDoesNotRedeliverWhatItBuffered`, `ASourceWhosePartIsNotLeasedHereFailsTheSubscribeAsUnavailable` (journal double throwing `ServiceUnavailableException`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** the Platform, Framework, CSharp and Apps suites → PASS.
- [ ] **Step 5: Commit:** `CSharp: a reactivated runtime reads its sources' part logs from each watermark before live signals`.

`GET /brains/{id}/signals` (`ISignalJournal.ReadSince`, commit 6bc6cd2ff) keeps its per-read rank: its durable cursor is a `(part, seq)` vector, which Task 16 defines per source part; re-basing the endpoint on it is left to the shell's signals view.

### Stage A acceptance (live)

- [ ] A Platform startup task registers `DigitalBrain:Platform:Mesh:SeedNodes` (count, default 0) seed nodes with owner `platform` (Q25); the AppHost sets it to 24 and calls `AddMachinePartLog` on the OS silo with `Role = Own`.
- [ ] `dotnet run digitalbrain.cs`; `mcp__aspire__list_resources` all Running/Healthy (read `list_console_logs` for any that is not, before anything else).
- [ ] Through `digitalbrain-mcp`: `neurons_context`; create an app; `neurons_call` a mutation on one of its neurons; restart the runtime resource (`mcp__aspire__execute_resource_command`); `neurons_get` shows the state.
- [ ] Stop Azurite's sequencer path is not possible in one process, so check Q26 with the unit fact; live, check that `list_traces` shows mesh writes and one sequencer CAS per flush, and `list_structured_logs` shows no `LeaseLost`, `RollbackDetected` or `JournalConflict`.
- [ ] Azurite holds no brain-scoped neuron state, only `platform` grains.

---

# Stage B — split and connect (first release)

Each plan opens with a gate task that writes its step-level tasks into this file (Stage A's format) after the measurement; interfaces and acceptance below are fixed.

## Plan 5 — Trust cluster and machine hosts (Tasks 17–19)

### Task 17 (gate): host shapes

**Measured** (2026-10-10, HEAD 8c5677e48, in-process `InProcessTestCluster`, Debug, one test process; a scratch timing fact under `DigitalBrain.Platform.Tests.Unit` run in three invocations, each starting every shape twice; deleted after measuring because it asserts nothing). "Cold" = first silo in the process (JIT, Orleans type manifest and grain-type discovery); "warm" = second silo in the same process.

| Shape | Cold (median; 3 runs) | Warm (median) | Dominated by |
|---|---|---|---|
| Trust only: bare silo, memory `platform` storage, no `AddDigitalBrain`, no modules, no neurons — deploy | 0.70 s (0.69 / 0.70 / 0.73) | 0.11 s | Orleans silo start + first-time type discovery |
| …then first sequencer `Get`, keyring `Get`, 24 seed-node `Register`s | 0.12 s | 0.01 s | first activations (memory writes) |
| Module host (`ModuleTest.Create()`: kernel + platform + client, memory `cluster` and `platform`) | 0.18 s* | 0.12 s | silo start; the trust registrations are not separable inside `AddDigitalBrainPlatform` |
| Machine host (`WithPartLog()`: part log, 8 seed nodes, owner provisioned, core part opened = lease + first CAS + first mesh write) | 0.21 s* | 0.15 s | the part log adds ~0.04 s over the module host |

\* started after the trust-only silo in the same process, so JIT was already paid; a true cold figure is ~0.6 s more. Azure storage was **not** measured in-process (no Azurite fixture in the Platform unit suite; the AppHost was off-limits); the memory rows are a stated **lower bound** for the trust cluster. Live context from Stage A: the OS silo restarted in ~20 s — the OS modules and the features catalog, not the trust grains or the part log.

**What the numbers show, and what they do not.** They show only that the split costs nothing at start: trust grains activate lazily (24 seed registrations ≈ 10 ms warm) and a part opens in ~40 ms. H1 and H2 do **not** rest on these numbers; they rest on lease semantics (one holder per part, days-long own leases) and on Orleans' single-activation semantics.

**Rulings (bind Tasks 18–19):**
- **H1 — a machine is one silo (Q12), in Stage B too.** No shared identity, no part-pinned placement. Two silos of one machine would need an exclusive cross-process journal writer and a placement director that duplicates the lease; a roll is a restart the journal covers (Q26). Scale-out is more machines leasing different parts. R23 is permanent.
- **H2 — machines and the trust host are separate Orleans clusters**, never one cluster with a placement strategy: inside one cluster the single-activation directory makes "B acquires A's part" meaningless and lets a machine address trust grains around the client seam. How a machine reaches the trust cluster is R34 (Task 18 Step 6).
- **H3 — Task 18's handover part is an app part** (`{scope}/apps/counter`), never the core: kernel instance records (`InstanceDirectoryGrain` and the rest of `KernelGrains.cs`) live in the core part, which only an own machine holds (Q11).
- **H4 → R31/R37/R44 — the Marketplace catalog stays trust-side (R14).** `IMarketplace : INeuron` stays in `DigitalBrain.Modules.Apps.Contracts` (scripts and clients use it; `AppNeuron` and `MarketplaceView` keep calling it). The Apps module's `MarketplaceNeuron` becomes a **stateless** neuron (no grain storage; `MarketplaceNeuron.OwnerKey` is deleted) that delegates each of `List`, `Read`, `Upsert`, `Remove` to `IMarketplaceClient`, a Framework platform-facing interface; Platform implements the client over the gateway; `MarketplaceGrain` in `DigitalBrain.Platform.Trust` (`platform` storage) holds the catalog. `MarketplaceWriteGuard` changes (R44): its Remove path reads ownership through `await IMarketplaceClient.Read(publisher, name)` instead of the neuron's state. `Apps.Contracts` references only `src/DigitalBrain` (not Framework), so `MarketplaceListing` stays in Apps.Contracts and the neuron maps it to Framework's `MarketplaceRecord`. The `StorageRingFacts.TrustClusterNeurons` entry is removed. No platform brain, no platform machine.
- **R37/R41 — caller stamping across the gateway.** Every trust call that acts for an account carries the kernel-stamped caller account as an explicit argument inside a `MachineSigned<T>` payload (payload, account, machine id, timestamp, signature by the machine identity key). The trust side verifies the signature against the key the node directory recorded for that machine id, and honours the payload's account only if it equals the machine's **registered account** (R41); otherwise `UnauthorizedAccessException`.
- **R41/R50 — machine registration.** `INodeDirectoryClient.RegisterMachine(machineId, publicKey, account, selfSignature)`: there is no cross-host identity token in Stage B (R50). The trust side verifies `selfSignature`, records `machineId → (publicKey, account)` in the node directory — trust on first use for both the key and the account: the account binds to the first machine that registers it; a different key for the same machine id is refused, and a second machine claiming an already-bound account is refused until a pairing flow exists (Task 21's handshake or owner approval, outside this release). Known cost: whoever registers an unbound account first owns it — mitigated by seed deployments registering `platform` and the owner's machines first, and by Task 19 attestation. LSP confirms the other `*Neuron`-named platform types (`SecretsNeuron`, `IntegrationNeuron`, `ConnectionIndexNeuron`, `WorkshopNeuron`, `ConnectionRequestsNeuron`) derive from `Grain`; all stay machine-side (R38).
- **H5 → R36 — owner lookup.** `IKeyringClient.OwnerOf(brainId)` calls `IBrainAuthority.Account()` on the trust side (R13 primary); the keyring holds no owner record.
- **H6 — custody is a Framework contract.** `IMasterKeyCustody` moves to Framework (Task 19), with `IMachineSigningKey` beside it (R35).
- **R30/R42/R43 — no credential reaches the trust host.** Custody stays **machine-side**: `AddMasterKeyWrapper` and `IMasterKeyCustody` are machine registrations, never trust ones. User connection secrets live in the machine-side Secrets grain (R38), sealed under the owner's custody as today; `ISecrets` keeps its current signature (R43). Deployment credentials are machine-host configuration (`DigitalBrain:Integrations:*`), seeded by the machine-side `IntegrationSeeder` into the machine-side Integration grain (R42). The trust host receives no credential of any kind — no secret, no integration credential, no key other than wrapped part keys and machine public keys.
- **Visibility.** The four clients are `internal` to `DigitalBrain.Platform`, which already grants `InternalsVisibleTo` to `DigitalBrain.Testing.Module`; `DigitalBrain.Platform.Trust` grants the same to `DigitalBrain.Platform`, `DigitalBrain.Testing.Module`, `DigitalBrain.Platform.Tests.Unit` and `DigitalBrain.Trust.Tests.Unit`.

**Carried from Stage A (Task 18 absorbs):** R16 — ~430 module facts write into never-created brains and fail when the part log is forced on; Task 18 Step 8 provisions the default brain on every `ModuleTest` host. R25 — `InstanceDirectoryGrain` rides the core part on `cluster` storage and sends instance signals one-way after its write; Step 8 records R25 as still parked in the ledger by default (moving it onto `ISignalJournal` is done only if it is one step).

### Task 18: Two hosts

**Breaker rulings (2026-10-10, override R50/R51 and the registration site where they conflict):**
- **R52 — pairing secret (replaces R50's single-machine binding).** An account may bind several machines when they share a pairing secret: `DigitalBrain:Platform:Parts:PairingSecret` (machine-side configuration; the AppHost sets one value for every OS silo of a deployment; `ModuleTestBuilder.WithTrust` sets one per test host). `RegisterMachine(machineId, publicKey, account, pairingSecretHash, selfSignature)`: the first registrant binds the account and stores the hash; later machines are accepted only with the same hash; a different key for the same machine id is still refused. Facts `ASecondMachineWithTheSamePairingSecretJoinsTheAccount` and `ASecondMachineWithoutThePairingSecretIsRefused` replace `ASecondMachineClaimingABoundAccountIsRefused`.
- **R53 — registration site (replaces the `IdentityStartup`/sign-in site of R47/R50).** Registration is a machine-side Platform startup task `MachineRegistration`, registered by `AddMachinePartLog`, running at silo start; the account is the Open-posture default owner (`DefaultLogin`) or the Secured bootstrap `Username`. It does not depend on sign-in; a machine serves one account in Stage B.
- **R54 — marketplace ownership (replaces R51's checks).** `MarketplaceRecord` carries `SourceAccount` and `SourceBrain` from `AppSource.Brain(AccountId, BrainId)` (both null for `Shipped`). The trust side accepts a signed Upsert when the payload account == `SourceAccount` and `IBrainAuthority(BrainScope.Create(SourceAccount, SourceBrain).Id).Account()` == the payload account; `Publisher` (a principal id) is recorded, not compared to the account. Remove checks the stored listing the same way.
- **Replay.** `MachineSigned<T>` carries a timestamp and a per-machine monotonic counter; the trust side rejects a timestamp outside ±5 minutes or a counter not greater than the last one seen for that machine.
- **R55 — one binding per account (refines R41/R52/R53).** A machine holds one binding per account it serves. `RegisterMachine` runs for the default owner at silo start and again, machine-side, whenever an account's brain is created on that machine (the R57 path); the pairing-secret rule (R52) applies per account; a signed payload is honoured when its account is among the machine's bindings.
- **R56 — shipped listings stay machine-side (replaces R45's first-party listings).** The trust catalog holds only published `AppSource.Brain` listings; `os/*` shipped listings keep today's merge in `MarketplaceView` from `FeatureCatalog`. `FeatureListingRegistration`, the trust host's features copy, Step 9's features key and the fact `FirstPartyListingsComeFromTheTrustHostsFeaturesCopy` are struck. No Roslyn/`AppDeclaration` in Platform.Trust.
- **R57 — the identity split.** The trust-side authority records membership and scope only and reports whether the brain is new; machine-side identity code calls `IBrain.Create` locally for a new brain. No trust grain calls a neuron.
- **R58 — a fifth client, `IIdentityClient` (Framework).** It carries the Account/Principal/BrainAuthority operations the machine-side identity code (IdentityStartup, IdentityEndpoints, grant filters) and `OwnerOf` need; Platform implements it over the gateway; Step 5's type-level fact covers it; Step 1's reflection fact includes the identity code.
- **R59 — boot provisioning.** At silo start, ahead of the Active-stage startup tasks, `MachineRegistration` puts the Open owner (or the Secured bootstrap user with its account and default brain) on record through `IIdentityClient`, then binds the machine; a fresh store boots without a lazy provision.
- **R60 — compute stays machine-side (amends R38).** `LedgerGrain`, `UsageGrain`, `TraceBudgetGrain` with their interfaces and state stay in Platform on the machine's `platform` storage for Stage B; there is no sixth client. `AMachineReachesTrustGrainsOnlyThroughTheClients` lists every trust grain that remains and fails on any other machine-side caller.
- **R61 — machine storage (amends Steps 6/9).** Machines keep a local `platform` storage (Secrets, Integration, ConnectionIndex, compute, principal credentials), but every machine has its own grain-state container (`grainstate-{name}`), never shared with another machine.
- **R62 — credentials stay machine-side.** Principal credentials (the password hash) live in a machine-side Platform grain; the trust cluster holds accounts, memberships and brain authority only. The boundary fact allows `Account`, `Member`, `Grant` by ruling and nothing credential-shaped.
- **R63 — signed identity writes.** Every `IIdentityClient` write that acts for an account (ProvisionOwner, EnsureMember, CreateBrain, EnsureBrain, GrantAsOwner, RevokeAsOwner, RegisterPrincipal) travels as `MachineSigned<T>` and is honoured only from a machine bound to that account; ProvisionOwner establishes the registering machine's binding in the same signed call (first registrant wins, R52). Membership reads stay unsigned and carry no credential.
- **R64 — release-part credential.** The AppHost's `release-part` command sends the Secured bootstrap Basic credential from the AppHost configuration; Open posture sends none.
- **R65 — persisted counter.** The per-machine signed-call counter is persisted in a `counter` file next to the identity key.
- **R66 — loopback trust silo in the AppHost.** In the dev AppHost the trust silo advertises and listens on 127.0.0.1 (silo and gateway ports), and machines use `localhost:30100`; a non-dev deployment sets the advertised address explicitly (Task 21).
- **R67 — a username belongs to its registering machine.** RegisterPrincipal and CompleteRegistration are honoured only from a paired machine; the trust principal records the registering machine, which alone completes it or signs the principal in; a refused registration removes the local credential.
- **R68 — Authorize is a read.** The unsigned decision never writes; a Once grant is spent by a signed Consume bound to the account; the Open owner's brains are provisioned through the signed ProvisionOwner (boot, or the machine's grant policy).
- **R69 — out of scope:** unsigned keyring TryAdd, node-directory writes and shard Put/Drop wait for Task 21.
- **R70 — client hosts compose the trust clients.** `AddTrustClients` serves a machine silo (signing) and an Orleans-client host such as the MCP (reading), through the private gateway client when `Trust:Gateway` is set.
- **R71 — allocated trust ports.** The AppHost's trust silo and gateway ports are Aspire endpoints (fixed only by `DigitalBrain:Platform:Trust:GatewayPort`/`SiloPort`), and machines dial the allocated gateway.

**Contract (fixed, plus R31's additive fourth client):** `src/DigitalBrain.Trust` (trust cluster host: sequencer, node directory, keyrings, ledger, identity, relay endpoint; `platform` storage only; the architecture test forbids any `Neuron` type in its composition) and the OS host becoming a machine host (`AddMachinePartLog`, `Role` from configuration). Machines reach trust grains only through `ISequencerClient`, `INodeDirectoryClient`, `IKeyringClient` — and `IMarketplaceClient` (R31) — (Stage A: direct grain calls; Task 21: the transport). Test `AMachineRunsAPartFromAnotherMachinesLog` (two machine hosts in one test process with separate directories against one trust host; A writes and releases, B acquires and reads). Acceptance: two machine processes on one PC hand a part back and forth, driven through `digitalbrain-mcp`.

**Files:**
- Create project `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/DigitalBrain.Platform.Trust.csproj` (references `DigitalBrain.Framework` only) and **move** into it exactly (R38): `Sequencer/SequencerGrain.cs` (`SequencerGrain`, `ISequencerGrain`), `Sequencer/HeadRecord.cs`; `Keys/KeyringGrain.cs` (`KeyringGrain`, `IKeyringGrain`); `Mesh/StorageNodeDirectoryGrain.cs`, `Mesh/SeedShardGrain.cs`, `Mesh/SeedNodeRegistration.cs` with their interfaces; `Identity/Authority/BrainAuthorityGrain.cs`, `AccountGrain.cs`, `PrincipalGrain.cs` with their interfaces and state; `Compute/LedgerGrain.cs`, `UsageGrain.cs`, `TraceBudgetGrain.cs` with their interfaces and state; and create `Marketplace/MarketplaceGrain.cs`, `Marketplace/FeatureListingRegistration.cs` (R45), `TrustHosting.cs`. **Everything else stays in Platform, machine-side:** `SeenVersions`, `MachineIdentity`, `Parts/*`, `MeshStore`, Secrets/Integration/ConnectionIndex grains and endpoints, `IdentityStartup`, `IntegrationSeeder`, `SecretsEndpoints`, `IdentityEndpoints`. A helper referenced from both sides moves to Platform.Trust when trust-only, to Framework when it is a contract type; the implementer confirms each moved file's references with LSP (`findReferences`) before the move and lists them in the task report.
- Create in `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/`: `ISequencerClient.cs`, `INodeDirectoryClient.cs`, `IKeyringClient.cs`, `GrainTrustClients.cs` (also implements `IMarketplaceClient`), `TrustOptions.cs`, `TrustGatewayClient.cs`, `MachineSigned.cs` (R37)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Marketplace/IMarketplaceClient.cs`, `MarketplaceRecord.cs` (R37)
- Create: `src/DigitalBrain.Trust/DigitalBrain.Trust/DigitalBrain.Trust.csproj` (references `DigitalBrain.Platform.Trust` and `DigitalBrain.Framework` only), `Program.cs`; `src/DigitalBrain.Trust/DigitalBrain.Trust.Tests.Unit/TrustHostFacts.cs`
- Create: `src/Testing/DigitalBrain.Testing.Module/TrustHost.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj` (reference Platform.Trust), `PlatformHosting.cs`, `Parts/MachineHosting.cs`, `Parts/PartLease.cs`, `Parts/PartLogs.cs`, `Keys/PartKeys.cs`, `Mesh/MeshStore.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/MarketplaceNeuron.cs` (stateless, delegates to `IMarketplaceClient`, `OwnerKey` removed), `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/MarketplaceWriteGuard.cs` (R44), `src/DigitalBrain.OS/DigitalBrain.OS/OsMachine.cs`, `src/DigitalBrain.AppHost/AppHost.cs`, `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs`, `ModuleTestBuilder.cs` (`WithTrust(TrustHost)`), `src/Testing/DigitalBrain.Architecture.Tests/StorageRingFacts.cs`, `ConfigurationKeyOwners.json`, `DigitalBrain.slnx` (and the local git-ignored `DigitalBrain-lsp.sln`)
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Trust/TrustClientFacts.cs`, `Trust/TrustBoundaryFacts.cs`, `Trust/MarketplaceTrustFacts.cs`, `Parts/MachineHandoverFacts.cs`, `Parts/MachinePartEndpointFacts.cs`; `src/Testing/DigitalBrain.Architecture.Tests/TrustCompositionFacts.cs`

**Interfaces:**

```csharp
namespace DigitalBrain.Platform.Trust;   // internal; only wrapped keys, signed heads, sealed shards, machine public keys, and signed payloads cross them

internal interface ISequencerClient
{
    Task<HeadRecord?> Get(string partHash);
    Task<bool> CompareAndSet(string partHash, long expectedVersion, HeadRecord next);
}

internal interface INodeDirectoryClient
{
    Task RegisterMachine(string machineId, byte[] publicKey, string account, byte[] pairingSecretHash, byte[] selfSignature);   // R41/R52
    Task Register(string nodeId, string ownerAccount);
    Task SetOnline(string nodeId, bool online);
    Task ReportAudit(string nodeId, bool passed);
    Task<string[]> Place(int count, string[] exclude);
    Task<StorageNodeView[]> List();
    Task Put(string nodeId, string cid, byte[] sealedShard);
    Task<byte[]?> Get(string nodeId, string cid);
    Task<byte[]?> Prove(string nodeId, string cid, byte[] nonce);
    Task Discard(string nodeId, string cid);
}

internal interface IKeyringClient
{
    Task<byte[]?> Get(string brainId, string partId);            // wrapped part key
    Task<bool> TryAdd(string brainId, string partId, byte[] wrapped);
    Task<string?> OwnerOf(string brainId);                       // IBrainAuthority.Account() on the trust side (R36)
}

```

```csharp
namespace DigitalBrain.Framework.Platform.Marketplace;   // public, platform-facing (R37); mirrors IMarketplace's four members

// MarketplaceRecord: MarketplaceListing's fields (Publisher, Source, Name, Title, Description, Version, Icon) plus `string? SourceAccount` and `string? SourceBrain` (R54: from AppSource.Brain(AccountId, BrainId), both null for Shipped)

public interface IMarketplaceClient
{
    Task<MarketplaceRecord[]> List();
    Task<MarketplaceRecord?> Read(string publisher, string name);
    Task Upsert(CallerContext caller, MarketplaceRecord listing);   // sent as MachineSigned<…> with caller.AccountId
    Task Remove(CallerContext caller, string publisher, string name);
}
```

  `MarketplaceRecord` mirrors `MarketplaceListing`'s fields (LSP `documentSymbol` on `MarketplaceListing.cs`); `MarketplaceNeuron` maps between them and sets `MarketplaceRecord.SourceAccount`/`SourceBrain` (R54) from `AppSource.Brain`, null for `Shipped`. **Upsert/Remove ownership (R45):** `MarketplaceGrain` accepts a signed write only when the `MachineSigned` signature verifies, the payload account equals the machine's registered account (R41), and the listing's `Source` is `AppSource.Brain`, and the payload account equals `SourceAccount` **and** `IBrainAuthority.Account()` evaluated on `BrainScope.Create(SourceAccount, SourceBrain).Id` (R54; `Publisher` is recorded, not compared; Remove checks the stored listing the same way), and the `MachineSigned` timestamp is within ±5 minutes and its counter exceeds the machine's last one (replay); otherwise `UnauthorizedAccessException`. `Shipped` listings come only from `FeatureListingRegistration` under `platform`. **First-party listings (R45):** a Platform.Trust startup task `FeatureListingRegistration` upserts the features-owner listings from the features copy the trust host carries (`DigitalBrain:Modules:apps:Options:Features` on the trust host), reading each `app.cs` by syntax only (`AppDeclaration`, Roslyn; no compile) under account `platform`; signed machine writes for those publishers are refused. That startup task reads the key by raw `IConfiguration` (the trust host composes no modules); the key stays owned by the Apps module's options in `ConfigurationKeyOwners.json` (no new entry).

- The shard members mirror `IStorageShard` (LSP `documentSymbol` on `SeedShardGrain.cs` first).
- `GrainTrustClients(IGrainFactory grains)` implements all four over the trust grains. Without `DigitalBrain:Platform:Trust:Gateway` (every Stage A host, `ModuleTest`, OS unit/E2E) it is built on the silo's own `IGrainFactory` and `AddDigitalBrainPlatform` also calls `AddTrustCluster`, so those hosts compose as today. With a gateway it is built on `TrustGatewayClient.Grains` (R34).
- `TrustOptions` (key `DigitalBrain:Platform:Trust`): `string? Gateway` (`host:port`), `string ClusterId = "digitalbrain-trust"`, `string ServiceId = "digitalbrain-trust"`; `Validate()`; added to `ConfigurationKeyOwners.json`.
- `TrustHosting.AddTrustCluster(ISiloBuilder)` (in Platform.Trust, R38): the moved grains, `SeedNodeRegistration` with the seed count option, the `MachineSigned` verifier, and a relay endpoint placeholder that Task 21 fills. It does **not** register `IdentityStartup`, `IntegrationSeeder`, the Secrets/Identity/Integration endpoints, `AddMasterKeyWrapper` or `IMasterKeyCustody` (R30), `AddDigitalBrain`, modules, `cluster` storage, `IPartKeys` or `PartsOptions`. Secrets/Integration/ConnectionIndex grains stay machine-side in Platform (R38); their state never reaches trust storage.
- `MachineHosting.AddMachinePartLog`: `PartsOptions`, `MachineIdentity` (R53: registration is the machine-side startup task `MachineRegistration` at silo start, account = Open-posture `DefaultLogin` or Secured bootstrap `Username`, independent of sign-in; `selfSignature` covers machineId‖publicKey‖account‖pairingSecretHash; no token is sent; R52 pairing secret from `DigitalBrain:Platform:Parts:PairingSecret`), `SeenVersions`, `AddMasterKeyWrapper`, `IMasterKeyCustody`, `IPartKeys`, `IMeshStore`, `PartLogs`, part-log storage and journal, the four clients, and the machine-host endpoints `POST /machine/parts/{part}/release` and `GET /machine/parts/{part}/records/{key}` (R40: both require the authenticated principal's account == `IKeyringClient.OwnerOf(brain of part)`, else 403; the records endpoint returns the stored record as the grain serializer's JSON, and **409** when this machine does not hold the part — it never acquires implicitly).
- `PartLogs.Release(PartId)`: deactivate that part's activations, flush, `PartLease.Release`; `PartLogs.Opened` lists the parts this silo holds.

- [ ] **Step 1: Failing facts — clients.** `TrustClientFacts`: `AMachineReachesTrustGrainsOnlyThroughTheClients` (reflection over the types that call trust grains: `PartLease`, `PartKeys`, `MeshStore`, `PartLogs` have no `IGrainFactory`/`IClusterClient` constructor parameter — `SecretsStore` and `ModuleIntegrations` are not listed because they call machine-local grains; `DigitalBrain.Apps.MarketplaceNeuron` takes `IMarketplaceClient` and has no `[PersistentState]` parameter; `MarketplaceWriteGuard` takes `IMarketplaceClient`), `TheGrainClientsRoundTripAHeadAWrappedKeyAShardAndAListing` (a `ModuleTest` host), `AMachineRegistersItsKeyOnceAndADifferentKeyIsRefused` (R41: same key twice succeeds; a second key for the same id throws), `ASecondMachineWithTheSamePairingSecretJoinsTheAccount` and `ASecondMachineWithoutThePairingSecretIsRefused` (R52), `ASignedPayloadForAnotherAccountIsRefused` (R41), `AReplayedSignedPayloadIsRefused` (replay: stale timestamp or non-increasing counter). `MarketplaceTrustFacts`: `AMarketplaceWriteWhoseAccountIsNotThePublishersBrainOwnerIsRefused` and `FirstPartyListingsComeFromTheTrustHostsFeaturesCopy` (R45: a trust host started on a temp features folder with one `features/os/x/app.cs` lists `os/x` under account `platform` with no compile). Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*TrustClientFacts*"` and `... "*MarketplaceTrustFacts*"` → FAIL.
- [ ] **Step 2: Implement** the four interfaces, `GrainTrustClients`, the constructor swaps, `MachineSigned`, `RegisterMachine`, `MarketplaceGrain`, `FeatureListingRegistration`, the stateless `MarketplaceNeuron` and `MarketplaceWriteGuard` over `IMarketplaceClient`, remove the `TrustClusterNeurons` entry. LSP diagnostics clean; Platform, Apps and Architecture (6 known) suites → PASS. Commit: `Trust: machines reach the sequencer, node directory, keyrings and marketplace only through four clients`.
- [ ] **Step 3: Failing fact — trust composition (R33).** `TrustCompositionFacts.TheTrustHostComposesNoNeuron`: (a) for every assembly in `typeof(DigitalBrain.Trust.Program).Assembly`'s transitive references except `DigitalBrain.Framework` (and BCL/Orleans/Microsoft), no type derives from `Neuron`; (b) building `AddTrustCluster()` on a bare silo builder registers no keyed `IGrainStorage` named `cluster`. Run `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-class "*TrustCompositionFacts*"` → FAIL (the project does not exist).
- [ ] **Step 4: Implement** `DigitalBrain.Platform.Trust` (the moves listed), `TrustHosting`, `DigitalBrain.Trust` project and `Program.cs` (generic host; Orleans with Azure blob `platform` storage through the Orleans module's offered integration from 8c5677e48 — LSP `goToDefinition` on it — and `AddTrustCluster()`). Build each project; Platform, Architecture, Apps suites → PASS. Commit: `Trust: trust grains live in their own project and the trust host composes no neuron`.
- [ ] **Step 5: Failing facts — the trust boundary (R46).** `TrustBoundaryFacts.TheTrustHostRegistersNoSecretOrCustodyService` (reflection over a silo built with only `AddTrustCluster()`: no registration of `ISecrets`, `IKeyWrapper`, `IMasterKeyCustody` or `IModuleIntegrations<>`) and `NoTrustClientCarriesPlaintextOrKeys` (type-level over the four client interfaces: every parameter and return type, recursively through record members, is a primitive/string identifier, `HeadRecord`, `StorageNodeView`, `MarketplaceRecord`, `MachineSigned<T>`, or `byte[]` named `wrapped`/`sealedShard`/`publicKey`/`selfSignature`/`nonce` — never a key type, `SecretRef`, `IntegrationState` or a plaintext string field; extend the allowlist only with a controller ruling). Run → RED before Step 4's composition exists, then PASS. Commit: `Trust: the trust host holds no secret, credential or custody, and no client carries plaintext or keys`.
- [ ] **Step 6: Gateway wiring (R34).** `TrustGatewayClient` is a hosted service in the machine process that builds a **private** `Host` with `UseOrleansClient(client => client.UseStaticClustering(gateway).Configure<ClusterOptions>(trust ids))`, starts it before the silo's startup tasks (registered with `ServiceLifecycleStage.RuntimeInitialize` — LSP-check `SeedNodeRegistration`'s stage), and exposes only `GrainTrustClients` over that client's `IClusterClient`; that client is never registered as the silo's `IGrainFactory`/`IClusterClient`. `TrustHost` (Testing.Module): a one-silo `InProcessTestCluster` with `AddTrustCluster()`, memory `platform` storage, 8 seed nodes, default owner provisioned; its `GatewayPort` is read off the started cluster's silo (R40: the `InProcessTestCluster` assigns it; the test never sets it in `ConfigureSilo`); `ModuleTestBuilder.WithTrust(TrustHost trust)` sets `DigitalBrain:Platform:Trust:Gateway = 127.0.0.1:{trust.GatewayPort}` plus distinct `ClusterId`/`ServiceId` per machine and drops the machine's `platform` storage. Two machine silos are two `ModuleTest` clusters in the same process, each with its own private trust client. Fix readiness, never a longer timeout; kill runs over 5 minutes. Commit: `Trust: a machine reaches a separate trust cluster through a private gateway client`.
- [ ] **Step 7: Failing fact — the handover (R32).** `MachineHandoverFacts.AMachineRunsAPartFromAnotherMachinesLog` is a **part-log-level** fact: trust host + machines A and B as in Step 6 (separate `MachineDirectory`s, `Role = Own`). A creates the brain; `part = PartId.Of("{scope}/apps/counter/c1")`; `var log = await aLogs.For(part)`; append a record for key `{scope}/apps/counter/c1` (state name `counter`, value 3); `await aLogs.Release(part)`; `var read = (await bLogs.For(part)).Read(...)` → the record with value 3, served from A's segments in the mesh and the wrapped key from the keyring; B appends 4 and releases; A's `For(part)` reads 4. Assert B's `PartLogs.Opened` never contains the core part. A neuron *activation* on B is out of scope: it would need the core part's kernel records (instance directory, type table), held only by the owner's machine — that is Task 22 (cross-part calls). Run → FAIL, implement `PartLogs.Release`/`Opened`, → PASS. `MachinePartEndpointFacts`: the release endpoint releases and the records endpoint returns the stored record (owner caller), 403 for non-owners. Commit: `Parts: a machine runs a part from another machine's log`.
- [ ] **Step 8: Carried from Stage A.** `ModuleTest` provisions the default brain on every host (R16); run every module unit suite once with `WithPartLog()` forced on in a scratch run (not committed) and record the remaining failures in the ledger. R25: record in the ledger that it stays parked (default). Commit: `Testing: every module host starts with its default brain provisioned`.
- [ ] **Step 9: AppHost.** A `trust` resource (the `DigitalBrain.Trust` project, Azurite `platform` storage, allocated gateway and silo ports (R71) and the mesh seed nodes (round 3), and `DigitalBrain:Modules:apps:Options:Features` set to the same repo `features/` folder the OS machine gets, so `FeatureListingRegistration` (R45) reads `app.cs` by syntax; the Platform.Trust startup task reads it by raw configuration, and the published trust image carries a `{app}/features` copy like the OS image; `ConfigurationKeyOwners.json` needs no entry — the owner stays Apps). The OS role gets `Trust:Gateway` and no `platform` storage. A second machine resource `OperatingSystem-b`: own `MachineDirectory`, `Role = Own`, own cluster id, and Orleans silo/gateway and HTTP ports allocated per run (R71, round 3; its MCP is `{B's http endpoint}/mcp`, read from `list_resources`). Each machine resource gets an Aspire command `release-part` (argument: part id) that calls `POST /machine/parts/{part}/release` on that machine. Build each project; a copy-lock on the AppHost/OS bin is not a compile error. `TrustHostFacts.TheTrustHostStartsWithNoModules` (`DigitalBrain.Aspire.Testing`, Azurite; skips without a container runtime). Commit: `Trust: the AppHost runs the trust cluster beside two machine hosts`.
- [ ] **Step 10: Acceptance (live).** `dotnet run digitalbrain.cs` on free ports; `mcp__aspire__list_resources` all Healthy (`trust`, `OperatingSystem-a`, `OperatingSystem-b`). Through A's `digitalbrain-mcp`: `neurons_context`; `neurons_call` a mutation on an app-part neuron; `release-part` on A (`mcp__aspire__execute_resource_command`); `GET {B's allocated http endpoint}/machine/parts/{part}/records/{key}` on B → A's state; `release-part` on B; mutate again on A through MCP (A reacquires). `list_traces`: `ISequencerGrain/CompareAndSet` on the same part hash from both machines, served by `trust`; `list_structured_logs`: no `LeaseLost`, `RollbackDetected`, `JournalConflict`. Record in the ledger.
- [ ] **Step 11: Regression net.** Platform, Architecture (6 known), Apps, OS unit, Trust suites. Commit only the files above, by explicit path.

### Task 19: Custody in hardware (Windows module)

**Contract (fixed):** `TpmMasterKeyCustody : IMasterKeyCustody` and a TPM-backed machine key behind the Windows module's per-OS contract; `DigitalBrain:Platform:Parts:Custody = Tpm|Configured`, with `Configured` refused in production. TPM facts skip when no TPM is present (the repo's live-gated pattern); a fact that production refuses configured custody.

**Files:**
- Move: `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/IMasterKeyCustody.cs` → `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IMasterKeyCustody.cs` (public; H6)
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IMachineSigningKey.cs` (R35); `src/DigitalBrain.Platform/DigitalBrain.Platform/Sequencer/FileMachineSigningKey.cs` (today's `identity.key` behaviour)
- Create: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/TpmMasterKeyCustody.cs`, `TpmMachineSigningKey.cs`
- Modify: `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/WindowsModule.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartsOptions.cs` (`Custody`), `Parts/MachineHosting.cs`, `PlatformHosting.cs`, `Sequencer/MachineIdentity.cs`, `Keys/ConfiguredMasterKeyCustody.cs`, `Keys/PartKeys.cs`
- Test: `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests/TpmCustodyFacts.cs`, `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/CustodyOptionsFacts.cs`

**Interfaces:**
- `public enum MasterKeyCustodyKind { Configured = 0, Tpm = 1 }`; `PartsOptions.Custody` (key `DigitalBrain:Platform:Parts:Custody`, default `Configured`; `PartsOptions.cs` is already in `ConfigurationKeyOwners.json`).
- `public interface IMasterKeyCustody { byte[] Wrap(string accountId, string context, byte[] secret); byte[] Unwrap(string accountId, string context, byte[] wrapped); }` — Framework, signature unchanged.
- `public interface IMachineSigningKey { byte[] Sign(byte[] data); byte[] PublicKey { get; } }` — Framework (R35); `MachineIdentity` consumes it instead of loading `identity.key` itself; `FileMachineSigningKey` is the default registration.
- `TpmMasterKeyCustody` (R35): per account, a persisted RSA-2048 key in the Microsoft Platform Crypto Provider (`CngKey.Create(CngAlgorithm.Rsa, "digitalbrain-{account}", new CngKeyCreationParameters { Provider = new CngProvider("Microsoft Platform Crypto Provider"), ExportPolicy = CngExportPolicies.None })`). `Wrap`: random 32-byte DEK → AES-GCM over the secret (associated data = `context`) → DEK wrapped with RSA-OAEP-SHA256 under the TPM key; output = wrapped DEK ‖ nonce ‖ tag ‖ ciphertext. `Unwrap` reverses it. `static bool IsAvailable()` opens the provider. Verify CNG API details with microsoft-learn before coding.
- `TpmMachineSigningKey : IMachineSigningKey`: a persisted ECDsa P-256 key (`CngAlgorithm.ECDsaP256`) in the same provider, non-exportable; `PublicKey` = SubjectPublicKeyInfo.
- `WindowsModule` registers both when `Custody = Tpm`. `MachineHosting` validates at start: `Custody = Configured` while `ASPNETCORE_ENVIRONMENT` (the host's `IHostEnvironment.EnvironmentName`) is `Production` → start refused with `InvalidOperationException` naming `DigitalBrain:Platform:Parts:Custody`; `Custody = Tpm` with no TPM custody registered or `!IsAvailable()` → refused the same way.

- [ ] **Step 1: Move `IMasterKeyCustody` and add `IMachineSigningKey`** (LSP `findReferences` on `IMasterKeyCustody` and on `MachineIdentity`'s key use); `FileMachineSigningKey` keeps today's file behaviour. Build Framework and Platform; Platform suite → PASS. Commit: `Keys: master key custody and the machine signing key are framework contracts a per-OS module can implement`.
- [ ] **Step 2: Failing facts.** `CustodyOptionsFacts.ProductionRefusesConfiguredCustody` (a `WithPartLog()` host with environment `Production`, `Custody = Configured` → start throws naming the key) and `TpmCustodyWithoutAProviderIsRefused`. `TpmCustodyFacts`, each `Assert.Skip` when `!TpmMasterKeyCustody.IsAvailable()`: `AWrappedSecretUnwrapsThroughTheSameTpmKey`, `TheTpmKeyIsNotExportable`, `TheMachineSignsHeadsWithItsTpmKey` (a `HeadRecord` signed through `TpmMachineSigningKey` verifies with its `PublicKey`). Run both suites → FAIL (SKIP on a TPM-less runner, reported as such).
- [ ] **Step 3: Implement** `Custody`, the start validation, `TpmMasterKeyCustody`, `TpmMachineSigningKey`, the Windows module registration. Platform and Windows suites → PASS/SKIP. Commit: `Windows: master key custody and the machine signing key live in the TPM; production refuses configured custody`.
- [ ] **Step 4: Live.** `Get-Tpm` on this PC, recorded; the AppHost sets `Custody = Tpm` on the machine resources; restart one; `digitalbrain-mcp` `neurons_get` reads a neuron's state back (its part key unwrapped through the TPM); `list_structured_logs` shows no custody errors. Record in the ledger.


## Plan 6 — Transport (Tasks 20–22)

### Task 20 (gate): NAT traversal spike

- Measure direct QUIC (`System.Net.Quic`) hole punching between two home networks and the relay fallback; record success rates and latency. Write tasks for 21–22.

**Measured** (2026-10-11, HEAD f1fc8e847, this one Windows 11 Pro 10.0.26300 PC, 32 cores, .NET 11.0.0-rc.1.26425.128, Release; a throwaway console under the session scratchpad, not committed; two full runs, numbers are run 1 / run 2). **Two home networks were not available — one machine, one network — so no hole-punch success rate was measured.** What was measured is loopback: QUIC itself, a relay hop, and the punch mechanics in-process.

| Measurement (loopback, mutual-cert QUIC, ALPN `digitalbrain-link/1`, self-signed ECDSA P-256 certs pinned by public key) | Run 1 | Run 2 |
|---|---|---|
| `QuicListener.IsSupported` / `QuicConnection.IsSupported` (msquic ships with the runtime; no system msquic.dll) | True / True | True / True |
| First handshake in the process (cold: msquic load, JIT) | 44.2 ms | 54.0 ms |
| Handshake, median of 20 | 3.30 ms | 3.27 ms |
| 1 KB request/response, new stream per call, median of 20 | 0.135 ms | 0.106 ms |
| 64 KB request/response, median of 20 | 0.595 ms | 0.531 ms |
| 10 MiB upload, median of 5 | 2832 Mbit/s | 3316 Mbit/s |
| Same through a one-hop UDP datagram relay: handshake / 1 KB / 64 KB | 3.33 / 0.151 / 1.169 ms | 3.67 / 0.126 / 0.965 ms |
| …added per relay hop (1 KB, median) | +0.016 ms | +0.020 ms |
| …10 MiB through the relay (naive single-loop `UdpClient` relay: it drops datagrams under load and QUIC retransmits — a relay-implementation limit, not QUIC's) | 19 Mbit/s | 13 Mbit/s |
| TCP 1 KB echo, direct vs byte-forwarding TCP relay (baseline) | 0.022 vs 0.048 ms | 0.022 vs 0.051 ms |
| Relay flips one bit in server→client datagrams | no tampered byte delivered; the stream stalls (AEAD drops each packet) until the caller's 3 s cancellation | same |
| A peer whose cert key is not the pinned one | `AuthenticationException` (TLS alert BadCertificate), pin refused 1 | same |
| Punch mechanics: query a local reflector ("mapper"), learn both mapped endpoints, simultaneous open, median of 20 | 0.337 ms | 0.354 ms |
| Next ephemeral UDP port after a punch socket (port-prediction delta, 21 samples) | +1 every time | +1 every time |
| QUIC on the punched ports: close the raw sockets, `QuicListener` bound to A's port, `QuicConnection` with `LocalEndPoint` = B's port, handshake + first 16 B round trip, median of 20 | 60.5 ms | 60.9 ms |

**What the numbers show.** QUIC with mutual self-signed certs costs ~3.3 ms to handshake and ~0.1 ms per small call on loopback — the link is not the bottleneck; WAN RTT will be. A datagram relay adds tens of microseconds per hop on loopback; its throughput depends entirely on the relay's own I/O (a production relay must batch receives, e.g. multiple outstanding `ReceiveFromAsync` and large socket buffers). A relay cannot alter a QUIC stream: tampering shows up as **silence**, so "detected" must mean the link fails within its idle timeout and never delivers bytes. **`System.Net.Quic` owns its UDP socket**: there is no API to send raw punch packets on it or hand it a socket. Punching therefore runs on a raw socket that is closed and its port re-bound by msquic (~61 ms, dominated by listener start); a NAT keeps the mapping for its UDP timeout (tens of seconds), so the rebind fits inside it — on loopback this was proven mechanically, through a real NAT it is an assumption.

**Literature assumptions (not measured here; validated by `AHolePunchAcrossTwoNatsIsMeasured` in Task 21):**
- UDP hole punching succeeds for ~82% of NATs tested, TCP for ~64% (Ford, Srisuresh, Kegel, *Peer-to-Peer Communication Across Network Address Translators*, USENIX ATC 2005, NAT Check data).
- In the wild, UDP puncturing between peers succeeded in ~64% of attempts (Halkes, Pouwelse, *UDP NAT and Firewall Puncturing in the Wild*, IFIP Networking 2011).
- A large decentralised measurement of libp2p's DCUtR reports ~70% (±7%) success, with QUIC and TCP similar (Trautwein et al., *Challenging Tribal Knowledge — Large Scale Measurement Campaign on Decentralized NAT Traversal*, 2025).
- Symmetric NAT (and carrier-grade NAT on mobile) is the main cause of failure; its share is a minority of home routers but significant on mobile carriers. The figures above are quoted from those papers as recalled and must be re-checked against the sources before they appear in user-facing material.
- Working planning figure: **~30% of machine pairs need the relay**; the relay is therefore a first-class path, not an exception.

**Rulings (bind Tasks 21–22):**
- **T20-1 — QUIC, one link per machine pair, one stream per call.** `System.Net.Quic` (supported here), ALPN `digitalbrain-link/1`, 0-RTT disabled (no replayable early data), idle timeout `LinkOptions.IdleTimeout` = 15 s with keep-alive 5 s. A call is one bidirectional stream carrying one `LinkRequest` frame and one `LinkReply` frame, payloads serialized with the Orleans `Serializer` (every type that crosses is already `[GenerateSerializer]`).
- **T20-2 — the link certificate is ephemeral and the machine key signs it.** The machine signing key can be non-exportable TPM (Task 19), so TLS never uses it directly. At start each machine (and the trust host) creates an ephemeral ECDSA P-256 key and a self-signed cert (1 day, re-made on restart) with one extension, OID under the UUID arc `2.25.{uuid}` (ITU-T X.667, no registration; R85), fixed once as `DigitalBrainNames.LinkEndorsementOid`, holding `LinkEndorsement { MachinePublicKey, DeploymentId, NotAfter, Signature }` where `Signature = IMachineSigningKey.Sign("digitalbrain-link|" ‖ SHA-256(cert SPKI) ‖ DeploymentId ‖ NotAfter)`. **Validation without a CA** (both directions, in `RemoteCertificateValidationCallback`, ignoring chain errors only): (1) the endorsement parses; (2) its signature verifies with `MachinePublicKey` (`MachineKeys.Verify`); (3) the signed SPKI hash equals the presented cert's SPKI (TLS already proved possession of that key); (4) `NotAfter` is in the future and `DeploymentId` is this deployment's (R75); (5) the peer id is derived from the key, `MachineKeys.IdOf(MachinePublicKey)` — when dialing it must equal the dialed id; when accepting it is the id the link is attributed to — and then the registration the trust side holds for that id (R41/R52, `MachineRegistryGrain`) has the same public key. A peer's registration is read over the caller's own trust link (`INodeDirectoryClient.Machine(machineId)`), so it is as trustworthy as that link.
- **T20-3 — the trust host is pinned, not registered.** The trust host has its own identity key (`FileMachineSigningKey` at `DigitalBrain:Platform:Trust:IdentityPath`, under the trust host's data directory) and endorses its link cert the same way. A machine pins it by `DigitalBrain:Platform:Trust:Pin` (the trust public key's id, `MachineKeys.IdOf`); without a pin it trusts on first use and records the id in `{MachineDirectory}/trust.pin`, refusing a different one later (`TrustPinMismatchException`, never a silent switch). Production refuses an Own or Cloud machine with no configured pin (same start validation as Task 19's custody). The AppHost runs on TOFU in dev.
- **T20-4 — an unregistered machine gets a registration-only link to the trust host.** The trust endpoint accepts a valid endorsement from an unregistered machine id but serves it only `RegisterMachine`, `ProvisionOwner` (R63) and `DeploymentId`; every other operation → `UnauthorizedAccessException`. Machine↔machine links require both ends registered (check (5)); an unregistered peer is refused at the handshake. Check (5)'s registration lookup is skipped only by the trust endpoint, whose unregistered peers get this registration-only link (R90).
- **T20-5 — the relay lives in the trust host and carries QUIC datagrams.** Per Q24 the relay is a trust-cluster service (the "relay endpoint placeholder" in `AddTrustCluster`); seed nodes do not relay. It is a UDP datagram forwarder, not a TLS terminator: the QUIC session is end-to-end between the two machines, so the relay sees **only QUIC packets (ciphertext + connection ids), the two machine ids of the allocation, the UDP endpoints, sizes and timing**. A machine allocates a relay slot over its trust link (`IRelayClient.Allocate(peerMachineId)` → `RelaySlot { Endpoint, Token }`); the relay forwards only between the two endpoints that presented the slot token in their first datagram, and expires a slot after 60 s idle. The relay cannot read, forge or replay into the session (T20-1, AEAD).
- **T20-6 — connection order.** `Connect(machineId)`: reuse a live link; else read the peer's registration and announced candidates (`INodeDirectoryClient.Machine`), ask the trust host for a rendezvous (`IRelayClient.Rendezvous(peer)`); the trust side **pushes** a `rendezvous` operation to each of the two machines over that machine's existing trust link (a trust-initiated bidirectional stream carrying `LinkRequest("rendezvous", RendezvousOffer { PeerMachineId, PeerReflected, PeerCandidates, Nonce })`, handled machine-side by `RendezvousHandler` in `QuicMachineTransport`; R84). There is no chosen port (R88): each machine opens its punching UDP socket first and reflects it through the trust host's relay port (`IRelayClient.Reflect(Socket)`, per rendezvous, so the NAT mapping belongs to that socket); its NAT-reflected endpoint *is* its offer. The dialer sends its reflected endpoint and candidates with `Rendezvous`; the trust host pushes them to the peer with a fresh trust-signed nonce, the peer reflects its own punching socket and answers with its offer, and `Rendezvous` returns the peer's offer (`PeerReflected`, `PeerCandidates`, the same `Nonce`) to the dialer — null when the peer holds no trust link. Both echo the nonce in their first punch packet and ignore punch packets without it. Roles are deterministic: the machine with the lower machine id (ordinal) listens on its punched socket's port, the other dials with `LocalEndPoint` set to its punched socket's port. Both punch from that raw socket for up to 1 s, close it and re-bind QUIC on the same port (measured ~61 ms on loopback); if no QUIC handshake completes within 2 s of the rendezvous, use a relay slot. Candidates are announced at start and on network change through the signed `INodeDirectoryClient.Announce(MachineSigned<MachineCandidates>)`; the reflected endpoint comes from the trust host's relay port (STUN-like, no third-party STUN server).
- **T20-7 — the trust clients ride a link; R34 is replaced.** `TrustGatewayClient` and the private Orleans client host are **deleted**; `Trust:Gateway` is replaced by `DigitalBrain:Platform:Trust:Endpoint` (`host:port` of the trust link endpoint, UDP). `LinkTrustClients` implements `ISequencerClient`, `INodeDirectoryClient`, `IKeyringClient`, `IMarketplaceClient`, `IIdentityClient` and the shard calls by sending one `LinkRequest` per call over the trust link; `TrustLinkEndpoint` (Platform.Trust, a hosted QUIC listener in the trust host) dispatches each to the trust grains through the trust silo's own `IGrainFactory`, passing the **authenticated machine id** of the link. The trust host no longer opens an Orleans gateway port (its silo port stays for its own cluster). Hosts without `Trust:Endpoint` (every Stage A host, `ModuleTest`, OS unit/E2E) keep `GrainTrustClients` on the silo's own `IGrainFactory`, unchanged. An Orleans-client host (the MCP, R70) resolves `IMachineTransport` from its silo's services (the silo it is co-hosted with) and reads through `LinkTrustClients` on it; no new grain (R86).
- **T20-8 — R69 closes: every trust write is authenticated by the link.** `TrustLinkEndpoint` checks before dispatch: keyring `TryAdd(brainId, …)` only when `OwnerOf(brainId)` is among the link machine's bindings (R55); node-directory `Register`/`SetOnline`/`ReportAudit` only for nodes whose owner account is among the machine's bindings (seed nodes are registered by the trust host itself, never over a link); shard `Put` from any registered machine, recording the putting machine id beside the cid in `SeedShardGrain` state; shard `Discard` only by a machine bound to the same account as the putter. Sequencer CAS stays holder-signed (R9). `MachineSigned<T>` stays on identity and marketplace writes (R37/R63), and `TrustLinkEndpoint` honours one only when its signer machine id equals the link's authenticated machine id — the link proves the machine, the signature keeps the account claim bound to the payload; R72's pairing gate is replaced by the link (registration-only links cannot claim usernames).
- **T20-9 — the part of a grain is `PartId.Of(key)`, for part-logged grains only.** `PartRoutes` lists the grain classes whose state is in `cluster` storage (every `Neuron<TState>` and every grain with `[PersistentState(_, "cluster")]`, read once from the grain class metadata at silo start). Only those are routed; machine-local Platform grains (Secrets, Integration, ConnectionIndex, compute) never are. For a routed call the part is `PartId.Of(grain key)`.
- **T20-10 — the holder comes from the head.** `PartRouter.Resolve(part)`: the part is open here (`PartLogs.Opened`) → local; else `ISequencerClient.Get(HeadRecord.HashOf(part.Value))`; a live lease (`LeaseExpiry > now`) held by another machine → forward to `HeadRecord.Holder`; held by this machine → local; no live holder → local **only if this machine may lease it** (in this release only the core is private, R82: Own for the core, Own or Cloud for an app part, exactly as `PartLease.Acquire` enforces; a per-app Private mark belongs with circle sharing, Stage C), else `ServiceUnavailableException` (503, Q15). Resolutions are cached per part until the head's `LeaseExpiry` or a `NotHolder` reply.
- **T20-11 — R73/R76's limitation closes by routing, not a flag.** Kernel grains of the core (instance directory, type table, the rest of `KernelGrains.cs`) are part-logged under the brain's core key, so on a non-holder `PartRouter` resolves them to the core's holder and forwards. `CoreHolder` (R76) stays only to say which machine acquires the core at boot; machine B's kernel reads go to A.
- **T20-12 — one trace, at most one forward retry.** The forwarded `LinkRequest` carries `traceparent`/`tracestate` from `Activity.Current` and the `RequestContext` (caller context included); the holder starts its server activity with that parent, so one trace id spans both machines. The holder honours the forwarded caller only when the link's machine is bound to the caller's account (R55), else `UnauthorizedAccessException`. Before invoking, the holder checks it still holds the part against the head (R87): `ISequencerClient.Get` shows a live lease held by this machine (opening the part through `PartLogs` when the lease is ours but the part is not open yet) — never `PartLogs.Opened` alone; when the sequencer is unreachable an Own holder validates against its own local lease (it journals, Q26), while a Cloud machine has no journal, so with trust down its forwards fail and the caller answers 503; a caller's cached resolution forwards until `LeaseExpiry` (R89); if not it replies `NotHolder` **without executing** — the caller re-resolves once and forwards (or runs locally), and a second `NotHolder`/`LeaseLostException` → 503. A link failure after the request was sent is not retried (no transport-level duplicates; at-least-once stays the job of signals and neuron-state dedup, as today). 0-RTT is off (T20-1), so a forwarded call cannot be replayed by the network. Invocation (R83, Orleans 10.3.1, member confirmed by reflection over the pinned `Orleans.Core.Abstractions`): the holder deserializes the `IInvokable`, takes `GrainReference reference = (GrainReference)grainFactory.GetGrain(grainId)` and calls the public `IGrainReferenceRuntime.InvokeMethodAsync<object>(reference, invokable, InvokeMethodOptions.None)` (the runtime resolved from the silo's services); `GrainReference.InvokeAsync(IRequest)` is protected and not used. The re-invoked call passes the holder's own `PartCallFilter`, which resolves Local.

**Carried from Stage B:** R69 (unsigned keyring TryAdd, node-directory writes, shard Put/Drop) — closed by T20-8 in Task 21. R73/R76's B limitation (a non-holder cannot serve the core's kernel grains) — closed by T20-11 in Task 22. R78/R79 custody — the link endorsement is signed by whatever `IMachineSigningKey` the machine runs (TPM or file), so a custody switch is a new machine id and re-registration (R79); multi-machine TPM key sharing stays out (Task 27). AppHost machine B becomes the Cloud machine in Task 22 (accepted). Machine A still uses Orleans' default silo/gateway ports in the AppHost (R71 allocated B's and the trust's only) — Task 22's release gate allocates A's too, so two AppHosts can run side by side.

### Task 21: Machine links and the relay

**Contract (fixed):**
- **Produces:** `IMachineTransport { Task<IMachineLink> Connect(string machineId, CancellationToken); }`, mutually authenticated with machine identities, relay carrying ciphertext only; the trust clients (`ISequencerClient`, `INodeDirectoryClient`, `IKeyringClient`) and the mesh's shard calls over it.
- **Tests:** loopback round-trip; a relay that flips a byte is detected; an unregistered machine is refused.

**Files:**
- Create in `src/DigitalBrain.Framework/DigitalBrain.Framework/Links/`: `IMachineTransport.cs`, `IMachineLink.cs`, `LinkFrames.cs` (`LinkRequest`, `LinkReply`), `LinkOptions.cs`
- Create in `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Links/`: `LinkEndorsement.cs`, `LinkCertificates.cs` (make + validate, T20-2), `QuicLinkListener.cs`, `QuicMachineLink.cs` (shared by both sides), `TrustLinkEndpoint.cs` (dispatch + T20-4/T20-8 policy), `Relay.cs` (datagram forwarder + slots, T20-5), `Rendezvous.cs`
- Create in `src/DigitalBrain.Platform/DigitalBrain.Platform/Links/`: `QuicMachineTransport.cs` (T20-6), `HolePunch.cs`, `LinkTrustClients.cs` (all five clients + shards, T20-7), `TrustPin.cs` (T20-3), `RendezvousHandler.cs` (R84), `LinkHosting.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/INodeDirectoryClient.cs` (`Machine`, `Announce`), `Trust/TrustClientHosting.cs`, `Trust/GrainTrustClients.cs`, `Parts/MachineTrustHosting.cs`, `Parts/MachineHosting.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/TrustHosting.cs`, `Trust/TrustOptions.cs` (`Endpoint`, `Pin`, `IdentityPath`, `RelayPort`; `Gateway` removed), `Mesh/SeedShardGrain.cs` (putter id), `Mesh/MachineRegistryGrain.cs` (candidates); `src/DigitalBrain.Trust/DigitalBrain.Trust/Program.cs` (no Orleans gateway; link listener + relay); `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/TrustClusterHosting.cs` (UDP endpoints `link` and `relay` instead of the gateway); `src/Testing/DigitalBrain.Testing.Module/TrustHost.cs`, `ModuleTest.cs`/builder (`WithTrust` sets `Trust:Endpoint`); `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`
- Delete: `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/TrustGatewayClient.cs` (R34 replaced, T20-7)
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Links/LinkFacts.cs`, `Links/RelayFacts.cs`, `Links/TrustLinkFacts.cs`, `Links/HolePunchFacts.cs`; `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/TrustClusterHostingFacts.cs` (endpoints)

**Interfaces:**

```csharp
namespace DigitalBrain.Framework.Links;   // public, platform-facing

public interface IMachineTransport
{
    Task<IMachineLink> Connect(string machineId, CancellationToken cancellationToken);
    string LocalMachineId { get; }                          // additive to the fixed contract (as R31 was)
}

public interface IMachineLink : IAsyncDisposable
{
    string RemoteMachineId { get; }
    LinkPath Path { get; }                                  // Direct | Relayed
    Task<LinkReply> Send(LinkRequest request, CancellationToken cancellationToken);
}

public enum LinkPath { Direct, Relayed }

[GenerateSerializer, Alias("framework.link.request")]
public sealed record LinkRequest([property: Id(0)] string Operation, [property: Id(1)] byte[] Payload,
    [property: Id(2)] string? TraceParent, [property: Id(3)] string? TraceState, [property: Id(4)] Guid CallId);

[GenerateSerializer, Alias("framework.link.reply")]
public sealed record LinkReply([property: Id(0)] byte[]? Payload, [property: Id(1)] string? ErrorType, [property: Id(2)] string? ErrorMessage);

public sealed class LinkOptions   // DigitalBrain:Platform:Links
{
    public TimeSpan IdleTimeout { get; set; } = TimeSpan.FromSeconds(15);
    public TimeSpan KeepAlive { get; set; } = TimeSpan.FromSeconds(5);
    public TimeSpan PunchFor { get; set; } = TimeSpan.FromSeconds(1);
    public TimeSpan DirectWithin { get; set; } = TimeSpan.FromSeconds(2);
    public int Port { get; set; }                           // 0 = allocated
}
```

```csharp
namespace DigitalBrain.Platform.Trust;    // internal

internal sealed record LinkEndorsement(byte[] MachinePublicKey, string DeploymentId, DateTimeOffset NotAfter, byte[] Signature);
internal static class LinkCertificates
{
    public static X509Certificate2 Create(IMachineSigningKey key, string deploymentId, TimeProvider time);
    public static string? Validate(X509Certificate2 presented, string deploymentId, TimeProvider time);   // machine id, or null when refused
}
internal interface IRelayClient
{
    Task<RelaySlot> Allocate(string peerMachineId);
    Task<IPEndPoint> Reflect(Socket punching);                              // the punching socket's endpoint as the relay sees it (R88), per rendezvous
    Task<RendezvousOffer?> Rendezvous(string peerMachineId, IPEndPoint reflected, IPEndPoint[] candidates);   // trust pushes LinkRequest("rendezvous", offer) to the peer (R84) and returns the peer's offer; null when the peer holds no trust link
}
internal sealed record RendezvousOffer(string PeerMachineId, IPEndPoint PeerReflected, IPEndPoint[] PeerCandidates, byte[] Nonce);   // R88: PeerReflected is the peer's punching socket as the relay saw it; Nonce is trust-signed and echoed in the first punch packet
internal interface IRendezvousHandler   // machine side, on QuicMachineTransport
{
    Task<RendezvousOffer> Handle(RendezvousOffer offer, CancellationToken cancellationToken);   // reflects its own punching socket, answers with its offer (R88), then punches; lower machine id listens, the other dials
}
// INodeDirectoryClient gains:
//   Task<MachineRegistration?> Machine(string machineId);                  // public key, accounts, candidates
//   Task Announce(MachineSigned<MachineCandidates> candidates);
```

- [ ] **Step 1: Failing facts — the link.** `LinkFacts` (two `QuicMachineLink` ends in process, endorsed by two `FileMachineSigningKey`s registered in a `TrustHost`): `ALinkRoundTripsARequestOnLoopback` (1 KB echo operation, `Path == Direct`), `AStrangersCertificateIsRefusedAtTheHandshake` (endorsement by an unregistered key → `AuthenticationException`), `AnEndorsementForAnotherCertificateIsRefused` (valid endorsement copied onto a different cert key), `AnEndorsementFromAnotherDeploymentIsRefused` (R75). Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*LinkFacts*"` → FAIL (types missing). Skip with `Assert.Skip` when `!QuicConnection.IsSupported`.
- [ ] **Step 2: Implement** `LinkFrames`, `LinkOptions`, `LinkEndorsement`, `LinkCertificates`, `QuicMachineLink`, `QuicLinkListener` (verify `QuicListenerOptions`/`QuicServerConnectionOptions`/`RemoteCertificateValidationCallback` against microsoft-learn first; the spike's working shape is in Task 20). LSP diagnostics clean; build Framework, Platform.Trust, Platform; `LinkFacts` → PASS. Commit: `Links: two machines hold a mutually authenticated QUIC link endorsed by their machine keys`.
- [ ] **Step 3: Failing facts — the relay.** `RelayFacts`: `ALinkFallsBackToTheRelayWhenThePeerCannotBeReachedDirectly` (peer's announced candidates unroutable → `Path == Relayed`, round trip succeeds), `ARelayThatFlipsAByteIsDetected` (a test hook in `Relay` flips one bit per forwarded datagram → `Send` throws `QuicException`/`LinkFailedException` within `IdleTimeout` set to 2 s for the fact, and no reply payload is ever returned), `TheRelaySeesOnlyCiphertext` (the relay's forwarded datagrams never contain the 1 KB plaintext marker), `ARelaySlotForwardsOnlyBetweenItsTwoMachines` (a third endpoint with a wrong token gets nothing). Run → FAIL.
- [ ] **Step 4: Implement** `Relay` (several outstanding receives, 4 MiB socket buffers — the spike's single-loop relay held 13–19 Mbit/s), `IRelayClient`, `Rendezvous`, `HolePunch` (raw socket punch then QUIC re-bind on the same port, T20-6), `QuicMachineTransport`. Facts → PASS. Commit: `Links: a link falls back to a trust-side relay that forwards only ciphertext`.
- [ ] **Step 5: Failing facts — trust over the link (R69, T20-7/T20-8).** `TrustLinkFacts` (a `TrustHost` with its link endpoint, machines via `WithTrust`): `TheFiveTrustClientsAndTheShardsRoundTripOverTheLink` (head, wrapped key, shard put/get, listing, membership), `AnUnregisteredMachineIsRefused` (fixed test: a registration-only link may `RegisterMachine` but `ISequencerClient.CompareAndSet`, `IKeyringClient.TryAdd` and `Put` throw `UnauthorizedAccessException`), `AKeyringWriteForAnotherAccountsBrainIsRefused`, `ANodeDirectoryWriteForAnotherAccountsNodeIsRefused`, `AShardIsDiscardedOnlyByItsPuttersAccount`, `AMachineRefusesATrustHostWhosePinChanged` (T20-3), `APayloadSignedByAnotherMachineIsRefusedOnThisLink` (a `MachineSigned` payload from machine B sent over machine A's link → `UnauthorizedAccessException`), `ProductionRefusesACloudMachineWithoutATrustPin`, `NoMachineHostOpensAnOrleansClientToTheTrustCluster` (reflection: no `UseOrleansClient` registration in a machine host built with `Trust:Endpoint`). Run → FAIL.
- [ ] **Step 6: Implement** `LinkTrustClients`, `TrustLinkEndpoint` with the T20-8 checks, `TrustPin`, the signer == link machine check, `RendezvousHandler`, `INodeDirectoryClient.Machine`/`Announce`, the putter id in `SeedShardGrain`; delete `TrustGatewayClient` (LSP `findReferences` on it and on `TrustOptions.Gateway` first; every site moves to `Endpoint`); `TrustHosting` opens the link listener and relay; `TrustHost`/`WithTrust` set `Trust:Endpoint`; `ConfigurationKeyOwners.json` gains `LinkOptions` and the new `TrustOptions` keys. Platform, Trust, Architecture (6 known), Apps, Mcp suites → PASS. Commit: `Trust: machines reach the trust cluster over their link, and every trust write is authenticated by it`.
- [ ] **Step 7: AppHost.** `TrustClusterHosting`: the trust resource gets allocated UDP endpoints `link` and `relay` (R71) and no Orleans gateway; machines get `Trust:Endpoint`; each MCP resource is a client machine (R93, replacing R86's co-hosting premise: the MCP is a separate Orleans-client process): its own `MachineDirectory` (`machines/digitalbrain-mcp-{a|b}` under the workdir), the deployment's `PairingSecret` and `Trust:Endpoint`, no link port (it only dials) and no part role; it registers for the owner's account at start and composes the five trust clients over its own `IMachineTransport` (fact `McpMachineFacts.TheMcpRegistersAsAMachineAndReadsTrustOverItsLink`). `TrustClusterHostingFacts` assert the endpoints and the absent gateway. Build the AppHost (a copy-lock is not a compile error). Commit: `Trust: the AppHost wires machines to the trust link endpoint and relay`.
- [ ] **Step 8: Live.** `aspire run --isolated` from `src/DigitalBrain.AppHost`; `mcp__aspire__list_resources` all Healthy; through A's `digitalbrain-mcp` `neurons_context` and `neurons_call` a mutation; `list_traces` shows `TrustLinkEndpoint` server spans on `trust` for `CompareAndSet` from both machines; `list_structured_logs` on `trust` shows the link handshakes with machine ids and no refusals for A and B. Record in the ledger.
- [ ] **Step 9: Field test, live-gated.** `HolePunchFacts.AHolePunchAcrossTwoNatsIsMeasured`: runs only when `DIGITALBRAIN_FIELD_PEER` (a `host:port` of a trust endpoint reachable from two networks) and `DIGITALBRAIN_FIELD_ROLE` (`a`/`b`) are set, otherwise `Assert.Skip("needs two networks")`; each side runs 50 `Connect` attempts against the other, records direct/relayed counts, handshake and 1 KB medians to `{MachineDirectory}/field-test.json`; asserts only that every attempt connected (direct or relayed). The controller records the measured direct share against Task 20's literature assumptions. Commit: `Links: a live-gated field test measures hole punching across two NATs`.
- [ ] **Step 10: Regression net.** Platform, Trust, Architecture (6 known), Apps, Mcp, Aspire.Hosting, OS unit suites. Commit only the files above, by explicit path.

### Task 22: Cross-part calls

**Contract (fixed):**
- **Produces:** a grain call filter that sends a call for a part not leased here to the head record's holder over its link, with the `Trace`; no holder → 503 (Q15).
- **Tests:** part A on host 1 calls a neuron of part B on host 2; B unleased → 503; one trace id spans both.
- **Release gate:** Stage A acceptance repeated with the trust cluster, one own machine and one cloud machine (`Role = Cloud`) as separate processes; the cloud machine is refused the core (the only private part in this release, R82); with the trust cluster stopped, the own machine keeps accepting writes (journal) and commits them when it returns (Q26).

**Files:**
- Create in `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/`: `PartRoutes.cs` (T20-9), `PartRouter.cs` (T20-10), `PartCallFilter.cs` (`IOutgoingGrainCallFilter`), `ForwardedCallEndpoint.cs` (the holder side: `LinkRequest` operation `grain-call`), `NotHolderException.cs`
- Modify: `Parts/MachineHosting.cs` (register filter, router, endpoint), `Parts/MachineTrustHosting.cs`, `Parts/PartsOptions.cs` (`CoreHolder` comment: boot acquisition only, T20-11); `src/DigitalBrain.AppHost/AppHost.cs` (`OperatingSystem-b` gets `Role = Cloud`; machine A's Orleans ports allocated); `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/TrustClusterHosting.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/CrossPartCallFacts.cs`, `Parts/PartRoutesFacts.cs`

**Interfaces:**

```csharp
namespace DigitalBrain.Platform.Parts;   // internal

internal sealed class PartRoutes          // built once at silo start from the grain class metadata
{
    public bool IsPartLogged(GrainType type);
}

internal abstract record PartRoute
{
    public sealed record Local : PartRoute;
    public sealed record Remote(string MachineId) : PartRoute;
}

internal sealed class PartRouter(PartLogs logs, ISequencerClient sequencer, MachineIdentity machine, PartsOptions options, TimeProvider time)
{
    public Task<PartRoute> Resolve(PartId part);           // T20-10; throws ServiceUnavailableException when no one may serve it here
    public void Forget(PartId part);                       // after NotHolder
}

internal sealed class PartCallFilter(PartRoutes routes, PartRouter router, IMachineTransport transport, Serializer serializer) : IOutgoingGrainCallFilter;
```

- The filter acts only when `routes.IsPartLogged(target grain type)`. Local → `context.Invoke()`. Remote → serialize `context.Request` (the generated `IInvokable`) plus the target `GrainId` and `RequestContext` into `LinkRequest("grain-call", …)` with `Activity.Current`'s `traceparent`, send over `transport.Connect(holder)`, set `context.Result` from the reply or rethrow the reply's exception. On `NotHolderException`: `router.Forget`, resolve once more, forward or run locally; a second `NotHolder` → `ServiceUnavailableException`. `ForwardedCallEndpoint` (holder side) checks the head shows this machine's live lease (R87; else replies `NotHolder` without invoking), checks the caller account is among the link machine's bindings, restores `RequestContext`, starts an `Activity` parented on the forwarded `traceparent`, and invokes the request on the local grain reference. Invocation (R83): `IGrainReferenceRuntime.InvokeMethodAsync<object>((GrainReference)IGrainFactory.GetGrain(grainId), invokable, InvokeMethodOptions.None)`; no reflection fallback. Holder check (R87): a live lease on the head held by this machine, the part opened through `PartLogs` if needed — never `PartLogs.Opened`.

- [ ] **Step 1: Failing facts — routes.** `PartRoutesFacts`: `NeuronsAreRoutedAndMachineLocalGrainsAreNot` (a `Neuron<TState>` type and a `[PersistentState(_, "cluster")]` kernel grain → routed; `SecretsGrain` → not), `TheCoresKernelGrainsBelongToTheCorePart` (an instance-directory key → `PartId.Core`). Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*PartRoutesFacts*"` → FAIL; implement `PartRoutes` → PASS. Commit: `Parts: a machine knows which grains belong to a part`.
- [ ] **Step 2: Failing facts — cross-part calls.** `CrossPartCallFacts` (a `TrustHost` + machines 1 and 2 as in `MachineHandoverFacts`, both `Own`, linked through Task 21's transport): `ANeuronOnOneMachineCallsANeuronOfAPartHeldByAnother` (fixed test: machine 2 opens `{scope}/apps/counter`; a neuron in `{scope}/apps/notes` on machine 1 calls the counter neuron; the counter's state changes on machine 2 and machine 1's `PartLogs.Opened` never contains `counter`), `ACallToAPartNobodyMayServeHereIs503` (fixed test "B unleased → 503": machine 1 is `Role = Cloud`, the target is the core with no live holder — the core is the only private part in this release (R82) and `PartLease.Acquire` refuses it to Cloud → `ServiceUnavailableException`)
, `OneTraceIdSpansBothMachines` (an `ActivityListener` on both hosts: the caller's and the holder's activities share one `TraceId`), `AForwardedCallFollowsTheHolderOnceWhenItMoved` (machine 2 releases between resolve and send → first reply `NotHolder`, the call lands on the new holder or locally, exactly one invocation recorded), `AForwardedCallFromAMachineNotBoundToTheCallersAccountIsRefused`, `ANonHolderReadsTheCoresKernelGrainsFromTheHolder` (R73/R76: machine 2 is not `CoreHolder`; a neuron activation on machine 2 succeeds, its instance-directory read served by machine 1). Run → FAIL.
- [ ] **Step 3: Implement** `PartRouter`, `PartCallFilter`, `ForwardedCallEndpoint`, `NotHolderException` (`[GenerateSerializer, Alias("platform.parts.not-holder")]`), the registrations in `MachineHosting` (filter only when `Trust:Endpoint` is set; single-host composition unchanged). LSP diagnostics clean; Platform, Architecture (6 known), Apps suites → PASS; kill runs over 5 minutes. Commit: `Parts: a call for a part held elsewhere runs at its holder under the same trace`.
- [ ] **Step 4: AppHost for the release gate.** `OperatingSystem-b` gets `DigitalBrain:Platform:Parts:Role=Cloud` (it is the release's cloud machine; Task 18's own↔own handover stays covered by `MachineHandoverFacts`); machine A's Orleans silo/gateway ports allocated like B's (R71), so `--isolated` runs never collide. Aspire.Hosting facts updated. Build the AppHost. Commit: `AppHost: the second machine is a cloud machine and every machine's ports are allocated`.
- [ ] **Step 5: Release gate (live, the controller runs it).**
  1. From `src/DigitalBrain.AppHost`: `aspire run --isolated`. `mcp__aspire__list_resources`: `trust`, `OperatingSystem-a` (Own, core holder), `OperatingSystem-b` (Cloud), both MCPs Running/Healthy; any other state → `list_console_logs` for it first.
  2. **Stage A acceptance through A's `digitalbrain-mcp`** (`{A's http endpoint}/mcp`): `neurons_context` (caller and brain); `neurons_search` / `neurons_list`; `neurons_call` a mutation on an app neuron and `neurons_get` reads it back; same on a core neuron. `list_traces`: `CompareAndSet` spans on `trust` over the link (`TrustLinkEndpoint`).
  3. **Cloud refusals through B's `digitalbrain-mcp`** (`{B's http endpoint}/mcp`): `neurons_get` on a core neuron → served from A by forwarding (one trace id spanning `OperatingSystem-b` and `OperatingSystem-a` in `list_traces`), and B's `list_structured_logs` show B never acquired `{brain}/core`; after `release-part {brain}/core` on A (`mcp__aspire__execute_resource_command`, resource `OperatingSystem-a`, command `release-part`), the same call on B → 503 (`ServiceUnavailableException`), never a lease by B; an app part released on A → B acquires it (short lease; R82: only the core is private in this release). Re-acquire the core on A with a `neurons_get` through A's MCP.
  4. **Trust down (Q26):** `mcp__aspire__execute_resource_command` resource `trust`, command `resource-stop`. Through A's MCP: two `neurons_call` mutations succeed (journaled); `neurons_get` reads them back. Through B's MCP: a mutation on `{brain}/core` (held by A) → 503, because the forward needs A's head from the stopped sequencer and a Cloud machine has no journal to write through an outage (Q26: only own machines journal). Then `resource-start` on `trust`; wait for Healthy in `list_resources`; within one renewal interval A's `list_structured_logs` show the journal committed (the commit log line, no `JournalConflict`, `RollbackDetected`, `LeaseLost`) and `list_traces` show `CompareAndSet` on `trust` for that part with the journaled version. `neurons_get` through A returns both writes.
  5. Record the results, trace ids and anything refused unexpectedly in the ledger.
- [ ] **Step 6: Regression net.** Platform, Trust, Architecture (6 known), Apps, Mcp, Aspire.Hosting, OS unit suites. Commit only the files above, by explicit path.

# Stage C — network

## Plan 7 — Volunteer storage + credits (Tasks 23–25)

### Task 23 (gate): node protocol
- Write step-level tasks for 24–25: put/get/prove/drop message shapes, quotas, signed registration.

**Measured** (2026-10-11, HEAD 29e07242d, the same Windows 11 Pro PC as Task 20, Release; a throwaway fact `Links/Task23ShardWireMeasure.cs` in `DigitalBrain.Platform.Tests.Unit` on Task 21's `LinkTestbed` — two registered `FileMachineSigningKey`s, `QuicLinkListener` + `QuicMachineLink.Dial`, the `echo` operation — run with `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -c Release -- --filter-class "*Task23ShardWireMeasure*"`, then deleted). One `LinkRequest` frame carrying the shard and a `LinkReply` echoing it (each row is an upper bound for a put plus a get of that size), 3 warm-ups then 20 calls on one link:

| Shard bytes on the wire | Round trip, median | p90 |
|---|---|---|
| 16 B (R5 minimum) | 0.185 ms | 0.286 ms |
| 4 KiB | 0.204 ms | 0.313 ms |
| 64 KiB | 0.706 ms | 0.789 ms |
| 256 KiB | 2.19 ms | 2.56 ms |
| 1 MiB | 8.68 ms | 9.66 ms |
| 4 MiB | 32.1 ms | 52.6 ms |
| 16 MiB | 124.8 ms | 141.8 ms |

**What the numbers show.** On loopback the cost is linear, ~120 MiB/s per stream through the Orleans serializer and one buffered frame (`QuicMachineLink.ReadAll` buffers a whole frame before answering), so a 1 MiB shard costs ~4 ms each way; the link never limits a shard, WAN bandwidth will. The registered-link frame cap (`LinkAdmission.Full`, 64 MiB = `QuicMachineLink.MaxFrame`) is far above what the default code produces: with `DataShards = 8` a 1 MiB segment makes 128 KiB shards. A frame is buffered whole on both ends, so the shard cap is a memory bound, not a speed bound.

**Rulings (bind Tasks 24–25):**
- **T23-1 — a volunteer node is a machine service, one per machine, node id `node/{machineId}`.** Any machine (Own or Cloud) with `DigitalBrain:Platform:StorageNode:OfferedBytes > 0` runs `StorageNodeService`: shards are files under `StorageNodeOptions.Directory` (default `{PartsOptions.MachineDirectory}/node`), named by the cid's hex, with a sidecar of putter claims — never Orleans grain storage and never the part log (a node holds other accounts' ciphertext, not this machine's state; R23: one silo per machine, so one writer). The node holds no credentials (R42) and no key: it sees ciphertext and content ids only (Q23). Reason: deriving the node id from the machine id (itself derived from the registered key, T20-2) makes "which link serves this node" a pure function the node cannot lie about.
- **T23-2 — the wire.** Four operations on the machine↔machine link (T20-1: one stream per call), payloads `[GenerateSerializer]` records: `node.shard.put` `ShardPut(Cid, Bytes)` → `true`; `node.shard.get` `ShardGet(Cid)` → `byte[]?`; `node.shard.prove` `ShardProve(Cid, Nonce)` → `byte[]?`; `node.shard.drop` `ShardDrop(Cid)` → `true`. The content id is `StorageProof.ContentId` (`sha256:` + hex of the ciphertext). **No shard index, segment id or manifest ref crosses**: index and manifest live inside the sealed manifest (Q23), the node needs only the cid to store, serve and prove, and sending them would hand a node the shape of a brain's log. The putter is the link's authenticated machine id (T20-2 check 5), never a field. Refusals cross as `LinkReply.ErrorType`: `InvalidDataException` (bytes do not hash to the cid), `NodeFullException` (T23-4); a drop by an account without a claim is a no-op, never a refusal (R114). Seeds keep their trust-link operations (`shard.*`, T20-8) unchanged.
- **T23-3 — shard cap 16 MiB.** `MeshOptions.MaxShardBytes = 16 MiB` (measured 125 ms round trip on loopback; a quarter of the 64 MiB frame cap, so a frame plus its serializer copy stays well under it). `MeshStore.Write` refuses a segment whose shard would exceed it (`InvalidOperationException`; a segment is at most `DataShards × 16 MiB` = 128 MiB by default) and a node refuses a larger put. Cost: a part whose snapshot seals to more than 128 MiB cannot snapshot (the write throws, the part keeps appending to its chain and every open replays it); snapshot chunking is not in this plan (carried below).
- **T23-4 — quotas live on the node; the directory places by room.** The owner offers `OfferedBytes` (signed, T23-5). The node counts its stored bytes and its bytes per putter **account** (the accounts of the putting machine's registration, `INodeDirectoryClient.Machine`, R55) and refuses a put beyond `OfferedBytes` or beyond `MaxBytesPerAccount` (default a quarter of the offer, so one account cannot fill a node) with `NodeFullException`; a repeated put of a held shard is never refused (idempotent, as `SeedShardGrain`). The directory cannot see machine↔machine puts, so it records what the node reports: `OfferedBytes` (signed registration) and `UsedBytes` (heartbeats); `Place(count, exclude, shardBytes)` skips nodes with `OfferedBytes − UsedBytes < shardBytes`. A `NodeFullException` at write time is a placement miss: `MeshStore` asks `Place` once more for that shard excluding the node, then fails the write (`ServiceUnavailableException`). Claims per cid stay capped at 16 (R99). Only the node's own machine changes its registration (T23-5).
- **T23-5 — signed registration and heartbeats.** `INodeDirectoryClient.RegisterNode(MachineSigned<NodeRegistration>)`, `NodeRegistration(NodeId, MachineId, OwnerAccount, OfferedBytes)`; `TrustLinkEndpoint` honours it only when the signer is the link machine (T20-8), `MachineId` is the link machine and `NodeId == node/{MachineId}`, `OwnerAccount` is among the machine's bindings (R52/R55) and is not `platform` (R97). Re-registration changes the offer (and the owner, still within the machine's bindings). Heartbeat: `node.heartbeat (nodeId, usedBytes)` from the node's own machine every `StorageNodeOptions.HeartbeatEvery` (60 s); the directory stores `LastSeen` and computes `Online = LastSeen > now − MeshOptions.OfflineAfter` (3 min) when it answers `List`/`Place` — no grain timer. Seeds have no machine id and stay online while the trust host runs. The unsigned `node.register`/`node.online` link operations are removed (`Register`/`SetOnline` stay trust-internal for seeds and facts; LSP `findReferences` first).
- **T23-6 — placement: volunteers first, one per owner, seeds fill, never the putter's own nodes.** `Place` excludes every node owned by an account of the asking machine (the trust endpoint knows the link machine's accounts; durability then always spans owners, and self-dealt credits are impossible), takes usable volunteers one per owner (shuffled), then seeds (owner `platform` counts as one owner in the first pass, Q25), then fills the rest from both. With no volunteer online every shard lands on seeds (today's behaviour, Q19). Reason: Q25 — spreading starts with the first volunteer; seeds stay the floor so a small network never fails a write.
- **T23-7 — node-side checks carry R69/T20-8 to volunteers.** `StorageNodeEndpoint` serves only registered machines (the link already refuses others, T20-4). Put from any registered machine, recording the putting machine id as a claim (R99: 16 claims, oldest unbound evicted); drop only by a machine bound to the same account as a claimant, dropping that account's claims only — the bytes go with the last claim. Get and prove from any registered machine (ciphertext only). A node that ignores these rules only loses availability of its own shards, which audit detects.
- **T23-8 — proofs reuse `StorageProof` unchanged.** `Compute(nonce, shard) = SHA-256(len(nonce) ‖ nonce ‖ shard)` over the whole shard, 16 fresh random nonces per shard whose expected answers sit only in the sealed manifest. A node cannot precompute because it never sees a nonce before its round and each round's nonce is used once; hashing the whole shard costs milliseconds at ≤ 16 MiB, so challenged byte ranges add nothing but range bookkeeping in the manifest. A node keeping only a digest of the shard cannot answer.
- **T23-9 — the part holder audits and repairs; the trust side never does.** Only the machine holding a part's lease has the key that opens a manifest and its expected answers (Q23: audits run in the caller's silo; R60: machine-side). `MeshAuditor` runs on the holder: every `MeshOptions.AuditEvery` (6 h) per open part (`PartLogs`) it audits the refs the head reaches (snapshot + chain), the next unused round each time, and repairs when a shard fails or sits on an unusable node (offline by heartbeat, or reputation below `Healthy`). The lease is the segment's ownership (R7): **a failed chain segment is healed by an early `Snapshot()`** — chain segments link by `Prev` inside immutable sealed segments, so a repaired ref cannot be spliced in; the snapshot replaces the chain and discards it, as Task 15 does — and **a failed snapshot ref is repaired** (`IMeshStore.Repair`), the new ref committed in a head CAS under the lease, and its predecessor **not** discarded (R7: the repaired manifest shares unmoved shards); only the old manifest replicas and the moved shards' old copies are dropped, after the CAS. A read that meets a lying node already survives (a shard that does not hash to its cid is an erasure, `MeshStore.Fetch`); the auditor reports it failed. Parts nobody leases are audited when next leased (concern: dormant parts decay unaudited).
- **T23-10 — audit reports come from the auditor, never the node owner.** Today `node.audit` requires the link to be the node owner's (`TrustLinkEndpoint`, `NodeAudit`), so a putter cannot report on nodes it audits (and `MeshStore.Audit` over the link fails for seeds). Task 24 replaces it with `node.audit AuditReport(NodeId, SegmentCid, Round, Passed, ShardBytes)` from any registered machine **except** one bound to the node's owner account. `SegmentCid` is the manifest cid — a content id, no names cross (Q23). Reports are bound to placements (R112, R117).
- **T23-11 — credits are recorded trust-side and pulled into the owner's machine-side ledger (R60, Q21).** The trust side records each passed report once per entry id `audit/{node}/{segment}/{round}` in `StorageCreditGrain` (keyed by the node owner's account, `platform` storage): `max(1, MicrosPerGiBPass × ShardBytes / GiB)`; a failed report, and any report on a seed node (owner `platform`, which earns nothing), records nothing; passes are capped per (putter account, node) per UTC day (`MaxPassesPerPutterPerNodePerDay`, 64) so a colluding putter cannot mint without bound. The ledger stays machine-side (R60): the owner account's **core holder** (the machine that has `{brain}/core` of the account's brain open; R76) runs `StorageCreditPuller` on its renewal cadence: `PendingCredits(account)` (bound machines only, R55) → `ILedgerGrain(account).Credit(entryId, micros, reason)` each → `AcknowledgeCredits(account, entryIds)`. `LedgerGrain.Credit` becomes idempotent by entry id (today it appends on every call), so a crash between credit and acknowledge credits once. Reason: the trust side is the only party that sees every report; the balance already lives in the machine-side ledger; pull-and-acknowledge keeps one writer and needs no trust→machine push. Credits only (Q21); the trust side never charges. Any core holder of the account pulls (R113).
- **R110 (T23-8) — exhausted challenges are re-issued, never reported.** When a ref's next round reaches `ChallengesPerShard`, the holder runs `IMeshStore.Repair(key, ref, reissue: true)` and commits the new ref under its lease (snapshot ref: head CAS as in T23-9; chain segment: an early `Snapshot()`), and resets the round to 0; `MeshStore.Audit`'s "challenges exhausted" result never becomes an `AuditReport`. Fact `ExhaustedChallengesAreReissuedNotReportedFailed`.
- **R111 (T23-9) — the round counter lives in the head.** `HeadPayload` gains `[Id(6)] public int AuditRound { get; set; }`: the next round for every ref the head reaches, committed with the lease (a new holder continues it, never reuses a round), advanced by one CAS per audit pass of the part and reset to 0 by a re-issue or a snapshot (new manifests, new challenges).
- **R112 (T23-10/11) — reports are bound to placements.** The directory records, per node, the accounts `Place` returned it to (`StorageNodeDirectoryState.PlacedFor: Dictionary<string, string[]>`, nodeId → accounts, capped per node with the oldest evicted) and accepts an `AuditReport` only from a machine bound to an account in that node's `PlacedFor`; otherwise `UnauthorizedAccessException`. `ShardBytes` is clamped trust-side to `MeshOptions.MaxShardBytes` before credits are computed. Fact `AnAccountCannotReportOnANodeItWasNotPlacedOn`.
- **R113 (T23-11) — any core holder of the account pulls.** Credits are pulled by the machine holding `{brain}/core` of **any** of the owner account's brains; `Credit` is idempotent by entry id and `AcknowledgeCredits` removes them, so the first puller wins and a concurrent puller credits nothing twice on the same ledger (per-machine ledgers remain R60's cost).
- **R114 (T23-2/T23-7) — a drop without a claim is a no-op.** A `node.shard.drop` from an account that holds no claim on the cid (or for a cid the node does not hold) returns `true` and changes nothing; `UnauthorizedAccessException` is never the answer to a drop (T23-2's refusal list loses it). Fact `ADropByAnAccountWithoutAClaimChangesNothing` (replaces `AShardIsDroppedOnlyByItsPuttersAccount`).
- **R115 — options and put misses.** Platform references Platform.Trust (`DigitalBrain.Platform.csproj` ProjectReference; `MeshStore` already reads `IOptions<MeshOptions>`), so machine-side `MeshAuditor`/`MeshStore` read `MeshOptions.AuditEvery`/`MaxShardBytes` from it; if the Architecture ring facts object to machine-side reads of a trust-side options file, split those two into `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/MeshAuditOptions.cs` (`DigitalBrain:Platform:MeshAudit`) listed in `ConfigurationKeyOwners.json`. An unreachable volunteer on put (link failure, `ServiceUnavailableException`) is a placement miss exactly like `NodeFullException`: one `Place` retry excluding it, then the write fails.

- **R116 (R110/R111) — exhaustion renews every ref the head reaches.** On challenge exhaustion the holder re-issues the exhausted ref **and** takes an early `Snapshot()`, so every ref the head reaches is new (new manifests, new challenges) before `AuditRound` resets to 0; a repair that keeps unmoved shards (T23-9 snapshot repair) never resets the round; every `HeadPayload` rewrite (append, snapshot, repair commit, lease renewal) carries `AuditRound` forward — `PartLog`'s commit path copies it unless the write is the R116 reset.
- **R117 (R112) — `PlacedFor` is bounded.** At most 64 accounts per node, the oldest evicted. An audit refused because the auditor's placement was evicted (`UnauthorizedAccessException` on `node.audit`) is skipped, counted as a miss for that shard, and the auditor re-places (`Repair`) on its next round.
- **R118 (R115) — one options owner.** `MaxShardBytes` and `AuditEvery` stay on `MeshOptions` (Platform.Trust), read by both sides; no `MeshAuditOptions` split unless the Architecture ring facts object (then split and add it to `ConfigurationKeyOwners.json`). Task 25 Step 6 keeps the `DigitalBrain:Platform:Mesh` key.
- **R119 (R115) — link failures on put.** `ShardClient` wraps link failures in `ServiceUnavailableException`; a failed put counts as a placement miss (one `Place` retry excluding the node, like `NodeFullException`), then the write fails.

**Carried from Stage B:** R60 — the ledger stays machine-side; T23-11 puts storage credits on the owner's core holder by pull. R69/R99 — T20-8's seed-shard rules carry to volunteers node-side (T23-7), the 16-claim cap included; `node.audit`'s owner-only check is replaced (T23-10). R23 — one silo per machine, so a node's shard files have one writer and the node id is per machine (T23-1). The a03573386 restart window (R106: a crash-restart inside ~10 s is blocked once) — a node inside it is unreachable; its shards are erasures, reads survive, heartbeats resume, and no repair runs unless `OfflineAfter` passes. R97 — no node is registered for `platform` over a link. The 128 MiB segment limit (T23-3): a snapshot larger than `DataShards × MaxShardBytes` fails until snapshot chunking exists. Dormant-part decay (T23-9): a part nobody leases is neither audited nor repaired until it is leased again.

### Task 24: Volunteer storage node

**Contract (fixed):**
- **Produces:** a storage service on any machine answering put/get/prove/drop over its link; `MeshStore` addresses shards through `IShardClient` (seed grain or remote link); registration in the directory signed by the machine identity, owner = the machine's account.
- **Tests:** `ALyingNodeServesOtherBytesAndTheReadSurvives` (the tamper fact plan 1 deferred); a node that answers proofs without data fails audit; an offline node's shards are repaired onto other owners; placement now spreads across distinct owners when they exist (Q25).

**Files:**
- Create in `src/DigitalBrain.Platform/DigitalBrain.Platform/Mesh/`: `IShardClient.cs` (+ `ShardClient`), `NodeWire.cs` (`ShardPut`, `ShardGet`, `ShardProve`, `ShardDrop`, `NodeOperations`, `NodeFullException`), `ShardStore.cs` (files, claims, quotas; T23-4/T23-7), `StorageNodeEndpoint.cs` (link handler), `StorageNodeService.cs` (signed registration at start, heartbeats), `StorageNodeOptions.cs`, `MeshAuditor.cs` (T23-9)
- Modify: `Mesh/MeshStore.cs` (`IShardClient`, `MaxShardBytes`, placement retry, `AuditReport`); `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Mesh/StorageNodeDirectoryGrain.cs` (`NodeRegistration`, `AuditReport`, view fields, `Place` with room and owner exclusion, `Heartbeat`), `Mesh/MeshOptions.cs` (`MaxShardBytes`, `OfflineAfter`, `AuditEvery`), `Links/TrustLinkEndpoint.cs` (`node.register-signed`, `node.heartbeat`, `node.audit` per T23-10, `node.place` excludes the caller's accounts; `node.register`/`node.online` removed); `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/INodeDirectoryClient.cs`, `Trust/GrainTrustClients.cs`, `Links/LinkTrustClients.cs`, `Links/QuicMachineTransport.cs` (dispatch `node.shard.*` to `StorageNodeEndpoint`), `Links/LinkHosting.cs`, `Parts/PartLog.cs` (`HealBySnapshot`, `CommitRepairedSnapshot`, `AdvanceAuditRound`), `Parts/PartLogModel.cs` (`HeadPayload.AuditRound`, R111), `Parts/MachineHosting.cs`, `PlatformHosting.cs`; `src/DigitalBrain.AppHost/AppHost.cs`; `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Mesh/NodeDirectoryFacts.cs`, `Mesh/StorageNodeFacts.cs`, `Mesh/VolunteerMeshFacts.cs`, `Mesh/MeshAuditorFacts.cs`; modify `Mesh/PlacementFacts.cs`, `Mesh/AuditRepairFacts.cs`, `Links/TrustLinkFacts.cs` (`ANodeDirectoryWriteForAnotherAccountsNodeIsRefused` moves to the signed registration)

**Interfaces:**

```csharp
namespace DigitalBrain.Platform.Mesh;   // internal

internal interface IShardClient            // seed → its trust-link shard calls; volunteer → IMachineTransport.Connect(view.MachineId)
{
    Task Put(string nodeId, string cid, byte[] bytes, CancellationToken cancellationToken);      // NodeFullException, InvalidDataException
    Task<byte[]?> Get(string nodeId, string cid, CancellationToken cancellationToken);           // null when absent or unreachable
    Task<byte[]?> Prove(string nodeId, string cid, byte[] nonce, CancellationToken cancellationToken);
    Task Drop(string nodeId, string cid, CancellationToken cancellationToken);
}

internal static class NodeOperations
{
    public const string Put = "node.shard.put", Get = "node.shard.get", Prove = "node.shard.prove", Drop = "node.shard.drop";
    public static string NodeIdOf(string machineId) => $"node/{machineId}";
}

[GenerateSerializer, Alias("platform.mesh.node.put")]   internal sealed record ShardPut([property: Id(0)] string Cid, [property: Id(1)] byte[] Bytes);
[GenerateSerializer, Alias("platform.mesh.node.get")]   internal sealed record ShardGet([property: Id(0)] string Cid);
[GenerateSerializer, Alias("platform.mesh.node.prove")] internal sealed record ShardProve([property: Id(0)] string Cid, [property: Id(1)] byte[] Nonce);
[GenerateSerializer, Alias("platform.mesh.node.drop")]  internal sealed record ShardDrop([property: Id(0)] string Cid);
[GenerateSerializer, Alias("platform.mesh.node-full")]  internal sealed class NodeFullException(string message) : Exception(message);

[GenerateSerializer, Alias("platform.mesh.node-registration")]
internal sealed record NodeRegistration([property: Id(0)] string NodeId, [property: Id(1)] string MachineId,
    [property: Id(2)] string OwnerAccount, [property: Id(3)] long OfferedBytes);

[GenerateSerializer, Alias("platform.mesh.audit-report")]
internal sealed record AuditReport([property: Id(0)] string NodeId, [property: Id(1)] string SegmentCid,
    [property: Id(2)] int Round, [property: Id(3)] bool Passed, [property: Id(4)] int ShardBytes);

// StorageNodeView gains (Ids 4–7): string? MachineId (null for seeds), long OfferedBytes, long UsedBytes, DateTimeOffset LastSeen;
// Online is computed at read (T23-5).

internal sealed class ShardStore(StorageNodeOptions options)   // one per machine (R23)
{
    public Task Put(string cid, byte[] bytes, string putterMachine, string[] putterAccounts);   // T23-4/T23-7
    public Task<byte[]?> Get(string cid);
    public Task<byte[]?> Prove(string cid, byte[] nonce);
    public Task Drop(string cid, string callerMachine, string[] callerAccounts);                 // that account's claims; bytes go with the last
    public long UsedBytes { get; }
}

public sealed class StorageNodeOptions     // DigitalBrain:Platform:StorageNode
{
    public long OfferedBytes { get; set; }                      // 0 = this machine is not a node
    public long MaxBytesPerAccount { get; set; }                // 0 = OfferedBytes / 4
    public string? Directory { get; set; }                      // null = {Parts:MachineDirectory}/node
    public TimeSpan HeartbeatEvery { get; set; } = TimeSpan.FromSeconds(60);
}
// MeshOptions gains: int MaxShardBytes = 16 MiB; TimeSpan OfflineAfter = 3 min; TimeSpan AuditEvery = 6 h.
// INodeDirectoryClient: RegisterNode(MachineSigned<NodeRegistration>), Heartbeat(string nodeId, long usedBytes),
//   ReportAudit(AuditReport), Place(int count, string[] exclude, int shardBytes); Register/SetOnline leave the client (trust-internal).
// Place records the asking machine's accounts in StorageNodeDirectoryState.PlacedFor for every node it returns (≤ 64 per node, oldest evicted, R117);
//   ReportAudit accepts only an account in that node's PlacedFor (R112) and clamps ShardBytes to MeshOptions.MaxShardBytes.
```

- [ ] **Step 1: Failing facts — the directory.** `NodeDirectoryFacts` (a `TrustHost`, machines registered through `LinkTestbed`/`WithTrust`): `ANodeRegistersSignedByItsMachineWithItsAccountAsOwner`, `ANodeRegistrationSignedByAnotherMachineIsRefused`, `ANodeRegistrationForAnAccountTheMachineDoesNotServeIsRefused`, `ANodeCannotBeRegisteredForTheAccountPlatform` (R97), `ANodeThatMissesHeartbeatsIsOffline` (`FakeTimeProvider` past `OfflineAfter`), `PlacementSkipsANodeWithoutRoomForTheShard`, `PlacementNeverPicksANodeOfThePuttersAccount`, `PlacementFallsBackToSeedsWhenNoVolunteerIsOnline`, `AnAuditIsReportedByTheAuditorNotTheOwner` (the auditor calls `Place` first), `AnOwnerCannotReportOnItsOwnNode` (T23-10), `AnAccountCannotReportOnANodeItWasNotPlacedOn` (R112: `PlacedFor`; `ShardBytes` clamped to `MaxShardBytes`); in `PlacementFacts`: `PlacementSpreadsAcrossDistinctOwnersWhenTheyExist` (fixed test, Q25: three volunteer owners and 24 seeds, `Place(24, …)` → each volunteer owner exactly once, the rest seeds). Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*NodeDirectoryFacts*"` → FAIL.
- [ ] **Step 2: Implement** `NodeRegistration`, `AuditReport`, the view fields, `Heartbeat`, `Place` with room/owner exclusion and volunteer-first order (T23-6) recording `PlacedFor` (≤ 64 accounts per node, R117), `ReportAudit(AuditReport)` bound to `PlacedFor` with `ShardBytes` clamped to `MaxShardBytes` (R112); the link operations in `TrustLinkEndpoint` (signer == link machine, `NodeId == node/{link machine}`, owner ∈ bindings, not `platform`; `node.place` passes the link machine's accounts as excluded owners); LSP `findReferences` on `Register`/`SetOnline`/`ReportAudit`/`Place` first and move every caller; `INodeDirectoryClient`, `GrainTrustClients`, `LinkTrustClients`. `NodeDirectoryFacts`, `PlacementFacts`, `TrustLinkFacts` → PASS. Commit: `Mesh: a volunteer node registers signed by its machine, and placement spreads across owners before seeds`.
- [ ] **Step 3: Failing facts — the node.** `StorageNodeFacts` (two machines on a loopback link through `LinkTestbed`, the node end dispatching to `StorageNodeEndpoint` over a temp `ShardStore`): `ANodeStoresAShardOnlyUnderItsContentId`, `ARepeatedPutOfAHeldShardIsNeverRefused`, `ANodeRefusesAShardBeyondItsOffer` (`NodeFullException` crosses as `LinkReply.ErrorType`), `ANodeRefusesAnAccountBeyondItsShare`, `ANodeRefusesAShardLargerThanTheCap`, `ADropByAnAccountWithoutAClaimChangesNothing` (R114: bob's drop of alice's shard returns `true`, the shard and alice's claim stay; alice's drop removes it), `ANodeKeepsItsShardsAcrossARestart` (a new `ShardStore` over the same directory), `ANodeSeesOnlyCiphertextAndContentIds` (reflection: the four request records carry no index, segment id or ref). Run `... -- --filter-class "*StorageNodeFacts*"` → FAIL.
- [ ] **Step 4: Implement** `NodeWire`, `ShardStore` (write `{cid-hex}.tmp` then move; claims sidecar; quotas), `StorageNodeEndpoint`, the `node.shard.*` dispatch in `QuicMachineTransport`'s incoming handler, `StorageNodeService` (`RegisterNode` signed with `IMachineSigningKey` at start, `Heartbeat` every `HeartbeatEvery`), `StorageNodeOptions` + `Validate` + `ConfigurationKeyOwners.json`. Facts → PASS. Commit: `Mesh: any machine can serve put, get, prove and drop for ciphertext shards over its link`.
- [ ] **Step 5: Failing facts — the mesh over volunteers.** `VolunteerMeshFacts` (a `TrustHost` with 24 seeds; machines P (putter, account alice), X (bob), Y (carol), Z (dave) each offering storage, linked through Task 21's transport as in `CrossPartCallFacts`): `ASegmentIsWrittenAcrossVolunteersAndSeedsAndReadBack` (the manifest holds shards on X, Y and Z, never on a node of alice), `ALyingNodeServesOtherBytesAndTheReadSurvives` (fixed test: X's `ShardStore` returns random bytes of the same length on every get → `Read` returns the plaintext and `Audit` reports X failed), `ANodeThatAnswersProofsWithoutDataFailsAudit` (fixed test: Y keeps only `SHA-256(shard)` and answers `StorageProof.Compute(nonce, digest)` → `ShardAudit.Passed == false` and Y's reputation falls), `AnOfflineNodesShardsAreRepairedOntoOtherOwners` (fixed test: Z stops heartbeating, time passes `OfflineAfter`, `Repair` moves Z's shards onto nodes whose owners hold no other shard of the segment while enough owners exist; `Read` succeeds), `AFullNodeIsReplacedAtPlacement` (X offers less than one shard → the write lands elsewhere), `ASegmentLargerThanTheShardCapIsRefused`. Run `... -- --filter-class "*VolunteerMeshFacts*"` → FAIL.
- [ ] **Step 6: Implement** `IShardClient`/`ShardClient` (node views from `List`, cached for one operation; seeds through the trust client's shard calls, volunteers through `IMachineTransport.Connect(view.MachineId)`; an unreachable volunteer → `null` on get/prove, a link failure on put wrapped in `ServiceUnavailableException`, R119), `MeshStore` on `IShardClient` (LSP `findReferences` on every `directory.Put/Get/Prove/Discard` site; `MaxShardBytes`; one placement retry on `NodeFullException` or an unreachable volunteer (R115); `Audit` sends `AuditReport` with the manifest cid). Hosts without a transport (Stage A hosts, `ModuleTest`) route only to seeds. Mesh, Links, Parts facts → PASS. Commit: `Mesh: segments are stored across volunteer nodes of distinct owners, and a lying node costs only an erasure`.
- [ ] **Step 7: Failing facts — the auditor.** `MeshAuditorFacts` (machines as in Step 5, P holding an app part): `TheHolderAuditsItsPartsSegmentsOnSchedule` (`FakeTimeProvider` past `AuditEvery` → one `AuditReport` per shard of the head's refs, the round advancing), `AFailedChainSegmentIsHealedBySnapshot` (a chain shard on a lying node → a new snapshot committed, the old chain discarded), `ARepairedSnapshotIsCommittedAndItsSharedShardsAreKept` (R7: the snapshot's shard on offline Z moves; the head names the new ref; unmoved shards are still on their nodes), `ANonHolderNeverAudits`, `ExhaustedChallengesAreReissuedNotReportedFailed` (R110: `ChallengesPerShard = 1`, two ticks → the second re-issues, commits a new ref, `AuditRound` back to 0, no failed `AuditReport`), `TheAuditRoundSurvivesAHolderChange` (R111: the next holder continues from `HeadPayload.AuditRound`). Run → FAIL.
- [ ] **Step 8: Implement** `MeshAuditor` (hosted; per `PartLogs` opened part; one round per part in flight; exhaustion re-issues the exhausted ref and takes an early `Snapshot()` before the round resets to 0, R116; a report refused for an evicted placement is a miss re-placed next round, R117), `PartLogModel.HeadPayload.AuditRound` carried forward by every head rewrite in `PartLog`'s commit path (R116), `PartLog.AdvanceAuditRound()`, `PartLog.HealBySnapshot()` and `PartLog.CommitRepairedSnapshot(MeshRef)` (never resets the round) under the lease (CAS; on `LeaseLostException` commit nothing and drop only the new manifest replicas), registration in `MachineHosting` (auditor on every part-log machine; node service when `OfferedBytes > 0`). LSP diagnostics clean; Platform, Architecture (6 known) → PASS; kill runs over 5 minutes. Commit: `Mesh: the part holder audits its segments and heals them without discarding a repaired ref`.
- [ ] **Step 9: AppHost and live.** `OperatingSystem-b` gets `DigitalBrain:Platform:StorageNode:OfferedBytes=1073741824`. A and B serve the same owner account, so T23-6 excludes B's node from A's writes — the live check is registration, heartbeats and that exclusion. Build the AppHost (a copy-lock is not a compile error). Controller live run: `aspire run --isolated`; `list_resources` all Healthy; `list_structured_logs` on `trust` show B's signed node registration and heartbeats; a `neurons_call` mutation through A's MCP, then `list_traces` show `node.place` and seed `shard.put` spans on `trust` and no `node.shard.put` from A to B. Record in the ledger. Commit: `AppHost: the cloud machine offers volunteer storage`.
- [ ] **Step 10: Regression net.** Platform, Trust, Architecture (6 known), Apps, Mcp, Aspire.Hosting, OS unit suites. Commit only the files above, by explicit path.

### Task 25: Credits for storage

**Contract (fixed):**
- **Produces:** audit passes credited to the node owner through the ledger (`ILedgerGrain.Credit`, entry id `audit/{node}/{segment}/{round}`, so a replayed audit credits once), credits only (Q21).
- **Tests:** an audit pass credits once; a failed audit credits nothing.

**Files:**
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/Mesh/StorageCreditGrain.cs` (`IStorageCredits`, state), `Mesh/StorageCreditOptions.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/StorageCreditPuller.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Compute/ILedgerGrain.cs`, `Compute/LedgerGrain.cs` (`Credit` idempotent by entry id, returns `bool`); `Platform.Trust/Links/TrustLinkEndpoint.cs` (`node.audit` records credits; `credits.pending`, `credits.acknowledge`); `Platform/Trust/INodeDirectoryClient.cs`, `Trust/GrainTrustClients.cs`, `Links/LinkTrustClients.cs`; `Parts/MachineHosting.cs`; `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/LedgerFacts.cs`, `Mesh/StorageCreditFacts.cs`

**Interfaces:**

```csharp
namespace DigitalBrain.Platform.Mesh;   // internal, Platform.Trust

internal interface IStorageCredits : IGrainWithStringKey   // key: the node owner's account
{
    Task<bool> Record(AuditReport report, string putterAccount);   // false when failed, replayed or over the daily cap
    [AlwaysInterleave] Task<StorageCredit[]> Pending();
    Task Acknowledge(string[] entryIds);
}

[GenerateSerializer, Alias("platform.mesh.storage-credit")]
internal sealed record StorageCredit([property: Id(0)] string EntryId, [property: Id(1)] long Micros, [property: Id(2)] string Reason);
// EntryId = $"audit/{report.NodeId}/{report.SegmentCid}/{report.Round}"; Micros = max(1, MicrosPerGiBPass * ShardBytes / 2^30)

public sealed class StorageCreditOptions   // DigitalBrain:Platform:StorageCredits (trust host)
{
    public long MicrosPerGiBPass { get; set; } = 1_000;
    public int MaxPassesPerPutterPerNodePerDay { get; set; } = 64;
}
// ILedgerGrain.Credit(string entryId, long micros, string reason) → Task<bool> (false when entryId was already credited).
// INodeDirectoryClient gains: Task<StorageCredit[]> PendingCredits(string account); Task AcknowledgeCredits(string account, string[] entryIds);
```

- [ ] **Step 1: Failing fact — the ledger.** `LedgerFacts.ACreditWithTheSameEntryIdIsAppliedOnce` (two `Credit("audit/n/s/0", 5, …)` → balance 5, one entry, `Verify()` true, the second returns false). Run `dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*LedgerFacts*"` → FAIL. Implement: `Credit` checks and pushes `RecentKeys` as `Charge` does (LSP `findReferences` on `ILedgerGrain.Credit`; every caller takes the `bool`). → PASS. Commit: `Compute: a ledger credit is applied once per entry id`.
- [ ] **Step 2: Failing facts — trust-side credits.** `StorageCreditFacts` (a `TrustHost`; machine P of alice is placed onto node X of bob through `Place`, then audits it over the link): `AnAuditPassRecordsOneCreditForTheNodesOwner` (one pending credit under bob, entry id `audit/node/{X}/{segmentCid}/0`), `AReplayedAuditPassRecordsNothing`, `AFailedAuditRecordsNothing`, `PassesBeyondTheDailyCapPerPutterAreNotCredited` (`FakeTimeProvider`; the cap resets the next UTC day), `PendingCreditsAreReadOnlyByAMachineBoundToTheOwner` (R55: alice's machine → `UnauthorizedAccessException`), `AcknowledgedCreditsAreNotPendingAgain`. Run `... -- --filter-class "*StorageCreditFacts*"` → FAIL.
- [ ] **Step 3: Implement** `StorageCreditGrain` (concrete arrays: pending credits, a rolling window of recorded entry ids, per-(putter, node, day) counters pruned on day change), `StorageCreditOptions` + `Validate`, `node.audit` → `ReportAudit` then, when passed, `IStorageCredits(nodeOwner).Record(report, putter account)`; `credits.pending`/`credits.acknowledge` gated on the owner binding; the client methods. → PASS. Commit: `Mesh: a passed audit records one storage credit for the node's owner`.
- [ ] **Step 4: Failing facts — the pull.** In `StorageCreditFacts`, with a machine of bob holding bob's core: `AnAuditPassCreditsOnce` (fixed test: the same passed `AuditReport` reported twice and the puller run twice, once with the acknowledge failing → bob's ledger holds exactly one entry `audit/{node}/{segment}/{round}` with its micros), `AFailedAuditCreditsNothing` (fixed test: bob's ledger stays empty, `Verify()` true), `OnlyACoreHolderOfTheOwnersAccountPullsCredits` (a second Own machine of bob that holds no core of bob's brains pulls nothing), `TheCoreHolderOfAnyOfTheAccountsBrainsPulls` (R113: bob's second brain's core holder pulls; two pullers in turn → one ledger entry per ledger, the second finds nothing pending). Run → FAIL.
- [ ] **Step 5: Implement** `StorageCreditPuller` (hosted on part-log machines; on each lease-renewal tick, for each account with any brain whose `{brain}/core` this machine has open in `PartLogs` (R113): `PendingCredits` → `ILedgerGrain(account).Credit` each → `AcknowledgeCredits`), registration in `MachineHosting`, `ConfigurationKeyOwners.json`. LSP diagnostics clean; Platform, Trust, Architecture (6 known) → PASS. Commit: `Compute: the owner's core holder pulls storage credits into its ledger once`.
- [ ] **Step 6: Live (controller).** With Task 24's AppHost and `DigitalBrain:Platform:Mesh:AuditEvery` (R118: the `MeshOptions` key) lowered for the run through AppHost configuration (not code): `list_structured_logs` on `trust` show passed `node.audit` reports from A for seed nodes and no credit recorded for them (T23-11: seeds earn nothing); a credit pulled into a ledger needs a node of a second account, which the single-account AppHost does not have, so the pull is proven by `StorageCreditFacts` and recorded as such. Record in the ledger.
- [ ] **Step 7: Regression net.** Platform, Trust, Architecture (6 known), Apps, Mcp, Aspire.Hosting, OS unit suites. Commit only the files above, by explicit path.

## Plan 8 — Circles (Tasks 26–28)

### Task 26 (gate): circle authorization

**Decided 2026-10-11 (user, ledger R120): a circle is its own brain**, which is shape A of
`docs/superpowers/specs/2026-10-11-circle-authorization-proposal.md` (its "Decision" section is the record). Spec
open item 5 is settled. Q11, Q14 and Q17 are read for circle brains as below. Rulings:

- **T26-1** A circle is a brain. It is created through `IIdentityClient.CreateBrain` for the creator's account (`IBrain.Owner` = the creator, who pays its compute) and born on the creator's machine by `BrainBirths`. `ICircle` is its core neuron `{circle}/circle` (members, contributed machines, schedules). It has its own core part and its own part keys.
- **T26-2** Members are accounts, recorded as trust-side memberships of the circle brain (`EnsureMember`, plus an additive `RemoveMember`). There is no circle account and no pairing secret: R98 already admits machines bound to a member account, and member machines stay bound only to their own accounts.
- **T26-3** Q11: a circle brain's own machines are the members' contributed own machines, and only they hold its core. Cloud machines hold no circle part. R76: the creator's machine is the circle core's designated holder at creation; handover is explicit release/acquire.
- **T26-4** Q17: lease preference for a circle part is the current operator's contributed machine first, then any contributed machine. The lease returns to a contributed machine of an online member at the next quiet moment.
- **T26-5** Q6: the circle's part keys are wrapped to each contributed machine (ECDH P-256 + HKDF, context `circle|{circle}|{part}`), not under one custody root (R74 is per owner). Removing a member rotates every circle part key and re-snapshots. Data written before the rotation stays readable to a removed machine that holds the old key (R131, T26-19).
- **T26-6** Sharing an app = installing it into the circle brain (the `FeatureLoader` path). The owner/member copies of `ICircle`/`ICircleChat`, `CircleCallGuard`, `CircleAddress` and the per-brain `ICircles` index are deleted. Where each Circle app synapse runs is settled by T26-14 (R126).
- **T26-7** Q14: the chosen connections are bound into the circle brain as `connection/{circle}/{connector}/{id}`, sealed under the circle core's part key. The others stay the owner's, and calls to them route to the owner's core (Task 22; 503 while the owner is offline).
- **T26-8** Authorization adds nothing. The path is: stamp `BrainId = circle` → trust membership → machine gate (R98/R107) → `NeuronCallFilter` target scope. Removal = `RemoveMember` + rotation. Every circle part is private to its members (R82's per-app Private mark lands as "circle parts are private").
- **T26-9** Open fronts are untouched. A member's other apps may not call the circle brain in this release; only the member's human (shell/MCP) and the circle brain's own apps act there. One cross-brain path exists by design (R134): a shared app's call to a connection left with the sharer is allowed only through the binding the sharer recorded at Share on the circle brain's app slot. Every other cross-brain connection call stays refused. Renderable palette and run-token are untouched.
- **T26-10** Mesh placement (R123, Task 24) for circle parts: the members' volunteer nodes count as distinct owners, and the placement exclusion is the holder machine's account only.
- **T26-11** Compute share stays: `CircleShareGrain` is keyed by `{circle}/circle` and charges the circle brain's `IBrain.Owner`.
- **T26-12 (R124) Share path.** Sharing loads the sharer's app bundle (`IApp` Export, compile-gated) into the circle brain through `FeatureLoader`, with `Origin` = the sharer's app. It creates no Marketplace listing. `AppSource.Brain` gains a direct, kernel-stamped brain-to-brain source used only by Share. Any member may share; the circle core records `SharedApps`. The Circles module takes a named dependency on the Apps module's `FeatureLoader`.
- **T26-13 (R125) Circle brains are a kind.** Circle brains are recorded trust-side with `Kind = Circle`. `FeatureReconciler`/OS defaults install no OS default into a circle brain. At creation a circle brain gets exactly the circle's own app, `features/os/CircleRoom` (R126), which acts on the circle's `ICircle` core neuron and `ICircleChat`.
- **T26-14 (R126) Where the Circle app runs.**
  - (a) In each member's brain, `os/Circle` keeps the circles index, read from `BrainsOf(principal)` filtered by `Kind = Circle` (no `ICircles` neuron). `create` goes through a Circles-module neuron `ICircleFactory` in the member's brain, which calls `IIdentityClient.CreateBrain` and `BrainBirths`. `invite` and `accept` go only through the member's human route (shell/MCP at `/brains/{circle}`), never from scripts.
  - (b) In the circle brain, the circle's own app holds the `say`, `watch` and `share` synapses on the circle's own neurons, so there is no cross-brain subscription.
  - The shell watches `/brains/{circle}/live` per circle; `BrainsOf` plus per-brain live replace `CircleTouched`/`watchCircles`.
- **T26-15 (R127) Agreement keys.** Each machine registers a P-256 agreement key beside its signing key (`RegisterMachine` gains `agreementKey`). The Windows module provides a TPM-held ECDH key where the provider supports it, and a software key otherwise. A wrap is ephemeral-static ECDH by the current holder to each target's agreement key, HKDF context `circle|{circle}|{part}`. `Contribute` wraps every existing circle part key to the new machine.
- **T26-16 (R128) Contributed machines are the circle's owner machines.** Contributed machines are recorded trust-side through `IIdentityClient.ContributeMachine`/`WithdrawMachine` on the circle brain. R98/R106/R107 and `LeasePreference.MayHold` treat a contributed machine as an owner machine for that circle brain only. Platform reads `Machines` from the trust side, so `LeasePreference` needs no module contract.
- **T26-17 (R129) Membership authority.** The circle core neuron calls `EnsureMember` on `Accept` (an `Invited` record must be present) and `RemoveMember` on `Remove`. Both calls are kernel-stamped by the holder, which is a contributed machine (R128). The creator cannot be removed; the creator leaving means deleting the circle.
- **T26-18 (R130) Credential re-sealing.** The owner's own machine holds both keys as a contributed machine. It unseals the credential locally, re-seals it under the circle part key, and writes `connection/{circle}/…` through a forwarded call to the circle holder. No plaintext crosses any call.
- **T26-19 (R131) No retroactive revocation.** Data written before a rotation stays readable to a removed machine that holds the old key (Q6). Rotation protects only what is written after it.
- **T26-8 addendum.** `BrainId = circle` comes from the `/brains/{circle}` route (HTTP and `/brains/{circle}/mcp`), whose membership filter stamps the caller.

**Carried from Stage B/C:** R82 private parts → every part of a circle brain is private to its members (Cloud refused by `PartLease.Acquire`). R74 one custody root per owner → a circle's part keys are wrapped per contributed machine instead (R78: this is the multi-machine key-sharing path TPM custody waited for). R76 designated core holder → the creator's machine for a new circle. R98/R107 → admit member machines unchanged. R123/Task 24 placement → T26-10. Task 22 forwarding → owner-bound connections (T26-7).

### Task 27: Circle neuron and key sharing

**Contract (fixed):**
- **Produces:** `ICircle` neuron (members, contributed machines, schedules); sharing a part wraps its key to each member machine with ECDH P-256 + HKDF (context `circle|{circle}|{part}`) in the keyring; revoking rotates the part key and re-snapshots under it.
- **Tests:** a member machine unwraps the key; a removed member cannot read anything written after the rotation.

**Additive extensions (with reasons):**
- (a) A circle is created as a brain with its own core and account memberships. Reason: this is the precondition for "the circle's parts" under T26-1/T26-2.
- (b) `IIdentityClient.RemoveMember`. Reason: removal needs a trust-side write, and none exists.
- (c) "Sharing a part" = installing an app into the circle brain (T26-6). Reason: Install is the only way an app crosses brains, so "the part" is any circle-brain part.
- (d) The owner/member copy neurons and their guard are deleted (T26-6). Reason: the circle brain is the shared state.
- (e) A removed member's machine is refused at the gate on its next call (T26-8). Reason: the fixed key test cannot show the authorization half alone.
- (f) R124–R131: the share path, `Kind = Circle` with no OS defaults, the Circle app split with `ICircleFactory` and the shell's per-circle live view, agreement keys, contributed machines as trust-side owner machines, membership calls from the core, and no retroactive revocation. Reason: the controller's round-1 rulings close the review's design residuals.

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Circles/DigitalBrain.Modules.Circles.Contracts/ICircle.cs` (`CircleState` reshaped: `Members` = account ids, `Machines`, `Invited` accounts, `Schedules`; `Key(circleBrainId)`; `[Internal]` copy methods removed), `ICircleChat.cs` (`Key(circleBrainId)`; `Relay`/`Pull`/`Notify` removed), `Signals/CircleSignals.cs` (`CircleChanged` gains `Machines`; `CircleTouched` removed), `DigitalBrain.Modules.Circles/CircleNeuron.cs`, `CircleChatNeuron.cs`, `CirclesModule.cs` (no guard); `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Identity/IIdentityClient.cs` (+`RemoveMember`), its trust grain and link/grain clients in `src/DigitalBrain.Platform/DigitalBrain.Platform.Trust/` and `src/DigitalBrain.Platform/DigitalBrain.Platform/Trust/`, `Links/LinkTrustClients.cs`; `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/` (keyring: per-machine wraps, rotation), `Parts/PartLog.cs` (re-snapshot under a rotated key), `Compute/CircleShareGrain.cs` (key `{circle}/circle`); `features/os/Circle/*` (synapses per T26-6)
- Modify (R124–R128): `IIdentityClient` (+`ContributeMachine`, `WithdrawMachine`; `CreateBrain` takes `BrainKind`; `BrainsOf` returns the kind) and the trust brain-authority grain (circle machines count as owner machines for that brain in the R98/R106/R107 checks); `Links/TrustLinkEndpoint.cs`; the machine registration (`RegisterMachine(…, agreementKey)`) in `Sequencer/MachineIdentity.cs` and `Trust/MachineRegistrar.cs`; `src/DigitalBrain.Framework/DigitalBrain.Framework/Parts/IMachineSigningKey.cs` (+`IMachineAgreementKey`); `src/DigitalBrain.Modules/Microsoft/Windows/DigitalBrain.Modules.Microsoft.Windows/TpmAgreementKey.cs` (new); the Apps module's `AppSource.Brain` and `FeatureLoader` (direct brain source), the Apps module's connection-call gate (R134: a cross-brain connection call is admitted only through a binding recorded at Share), `FeatureReconciler` (skip `Kind = Circle`); `DigitalBrain.Modules.Circles.csproj` (references the Apps module); `features/os/Circle/*` (the index from `BrainsOf`, `create` via `ICircleFactory`), `features/os/CircleRoom/*` (new: the circle brain's own app with `say`/`watch`/`share`); Dart in `src/DigitalBrain.Modules/Google/Flutter/app/shell`: `ui_client.dart`, `circle_activity_badge.dart`, `infrastructure_strip.dart` and the workspace islands that call `watchCircles` (BrainsOf plus `/brains/{circle}/live`), updated in the same change
- Create: `DigitalBrain.Modules.Circles/CircleFactoryNeuron.cs` (`ICircleFactory` in Contracts)
- Delete: `CircleAddress.cs`, `CircleCallGuard.cs`, `CirclesIndexNeuron.cs`, `ICircles.cs` (after `findReferences` shows no other caller)
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Keys/CirclePartKeys.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests/CircleFacts.cs` (rewritten), `SharedConnectionFacts.cs` (same folder), `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Keys/CircleKeyFacts.cs`, `Parts/CircleBrainFacts.cs`, `Sequencer/MachineAgreementKeyFacts.cs`; the Windows module's agreement-key facts; `src/Testing/DigitalBrain.Architecture.Tests` (the Circles→Apps reference fact)

**Interfaces:**

```csharp
namespace DigitalBrain.Circles;

[GenerateSerializer, Alias("circles.state")]
public sealed record CircleState(
    [property: Id(0)] string Name,
    [property: Id(1)] string Creator,                 // account id; pays the circle's compute
    [property: Id(2)] string[] Members,               // account ids
    [property: Id(3)] string[] Machines,              // contributed machine ids
    [property: Id(4)] string[] Invited,               // account ids
    [property: Id(5)] string[] SharedApps,
    [property: Id(6)] int ComputeSharePercent,
    [property: Id(7)] CircleSchedule[] Schedules,
    [property: Id(8)] long Version);

public interface ICircle : INeuron
{
    Task Invite(string accountId);
    Task<CircleState> Accept();                       // the caller's account must be invited; contributes the caller's machine
    Task Contribute(string machineId);                // the caller's account must be bound to the machine
    Task Remove(string accountId);                    // RemoveMember, drop its machines, rotate every circle part key
    Task Share(string appName, string[] connectionIds); // added in Step 5, where it is implemented (R132, R137); installs the caller's app into the circle brain (R124); binds the chosen connections there and records the rest as owner bindings (R134)
    Task SetComputeShare(int percent);
    Task<CircleState> State();

    static string Key(string circleBrainId) => $"{circleBrainId}/circle";
}

// R126: in the member's own brain; the only script-reachable way to create a circle.
public interface ICircleFactory : INeuron
{
    Task<string> Create(string name);                 // CreateBrain(Kind = Circle) + BrainBirths; returns the circle brain id
    static string Key(string brainId) => $"{brainId}/circles";
}
```

```csharp
namespace DigitalBrain.Framework.Platform.Identity;   // additions (R125, R128, R129)

public enum BrainKind { Personal, Circle }
public interface IIdentityClient
{
    Task<BrainProvision> CreateBrain(string accountId, string principalId, string operationId, string displayName, BrainKind kind);
    Task<BrainEntry[]> BrainsOf(string principalId);                  // id + kind
    Task RemoveMember(string brainScopeId, string accountId);           // R133: the same gate as EnsureMember, plus the brain's owner
    Task ContributeMachine(string circleBrainId, string machineId);    // honoured when the machine is bound to a member account
    Task WithdrawMachine(string circleBrainId, string machineId);
    Task<string[]> MachinesOf(string circleBrainId);                   // read by Platform for LeasePreference and the gate
}

namespace DigitalBrain.Framework.Parts;
public interface IMachineAgreementKey { byte[] PublicKey { get; } byte[] DeriveShared(byte[] ephemeralPublicKey); }   // R127
```

```csharp
namespace DigitalBrain.Platform.Keys;   // internal

internal sealed class CirclePartKeys(IKeyringClient keyring, IMachineAgreementKey agreement)   // R127
{
    public Task WrapTo(PartId part, string circleBrainId, string machineId, CancellationToken cancellationToken);    // HKDF info "circle|{circle}|{part}"
    public Task<PartKey> Unwrap(PartId part, string circleBrainId, CancellationToken cancellationToken);             // this machine's wrap only
    public Task Rotate(PartId part, string circleBrainId, string[] machineIds, CancellationToken cancellationToken);  // new key, wrapped to the remaining machines
}
```

Order (R136): every step depends only on earlier ones. Commit per step (R135).

- [ ] **Step 1: Map.** No edits; record every site in the report.
  - C#: LSP `findReferences` on `ICircle`, `ICircleChat`, `ICircles`, `CircleAddress`, `CircleCallGuard`, `CircleTouched`, `ICircleShares.Configure`, `CircleShareGuard`, `IIdentityClient.EnsureMember`, `IIdentityClient.BrainsOf`, `IIdentityClient.CreateBrain`, `RegisterMachine` (every caller and every test fixture that registers a machine), `AppSource`, `FeatureReconciler`, and the Apps module's connection-call path (where a slot's connection is resolved for a call). `incomingCalls` on `BrainsOf`/`CreateBrain` to list their callers (identity endpoints, `BrainBirths`, the MCP context).
  - Dart (`dart language-server`, `src/DigitalBrain.Modules/Google/Flutter/app/shell`): `findReferences` on `watchCircles`, the `CircleTouched` mirror, and every caller of the circles index in `ui_client.dart`, `circle_activity_badge.dart`, `infrastructure_strip.dart` and the workspace islands.
  - Name the existing `CircleFacts` facts that exercise the copy protocol; Step 6 deletes them.
- [ ] **Step 2: Failing facts — agreement keys (R127).** Platform `Sequencer/MachineAgreementKeyFacts.cs`:
  - `AMachineRegistersAnAgreementKeyBesideItsSigningKey`: the trust returns both public keys, and they differ.
  - `ARegistrationWithoutAnAgreementKeyIsRefused`.

  Windows module facts:
  - `TheTpmAgreementKeyDerivesTheSameSecretAsItsPeer`: live-gated on TPM, compiled always.
  - `TheSoftwareAgreementKeyIsUsedWhenTheProviderHasNoEcdh`.

  Run → FAIL. Then implement:
  - `IMachineAgreementKey` (Framework), the software key, and `TpmAgreementKey` (Windows module).
  - `RegisterMachine(…, agreementKey)` in `MachineIdentity`/`MachineRegistrar`, the trust grain and the link op.
  - Every `RegisterMachine` caller and test fixture from Step 1 (`TrustHost`, the machine fixtures in `MachineHandoverFacts`/`CrossPartCallFacts`/the Mesh facts, `DigitalBrain.Testing`), updated in this step.

  Platform, Trust, Windows, Testing and Architecture (6 known) suites → PASS. Commit: `Sequencer: every machine registers an agreement key beside its signing key`.
- [ ] **Step 3: Failing facts — a circle is a brain of kind Circle, with its own app.** `Parts/CircleBrainFacts.cs` (accounts alice and bob; the circle is created in the facts through `IIdentityClient.CreateBrain(Kind = Circle)` + `BrainBirths`, because the factory comes in Step 6):
  - `CreatingACircleBirthsABrainOwnedByItsCreator`.
  - `ACircleBrainGetsNoOsDefaults` (R125): only `features/os/CircleRoom` is installed (T26-13), with `ICircle`/`ICircleChat`; `BrainsOf(alice)` lists the circle with `Kind = Circle`.
  - `AnAcceptedInvitationMakesTheAccountAMemberOfTheCircleBrain`.
  - `AMemberCallsANeuronInTheCircleBrain`: through the real `/brains/{circle}` stamper.
  - `AStrangerIsRefusedByTheCircleBrain`.
  - `ARemovedMemberIsRefusedOnItsNextCall`.
  - `AnAcceptWithoutAnInvitationAddsNoMember`, `TheCreatorCannotBeRemoved` and `TheCreatorLeavingDeletesTheCircle` (R129).
  - `AContributedMachineIsAnOwnerMachineOnlyForItsCircle` (R128, the gate fact; refused after `WithdrawMachine`).
  - `OnlyAMemberMachineOrTheOwnerMayRemoveAMember` (the R133 gate fact): `RemoveMember` from a machine passing `EnsureMember`'s gate or the brain's owner succeeds; from any other machine it is refused.

  Run → FAIL. Then implement:
  - `BrainKind` on `CreateBrain`/`BrainsOf`, and the `FeatureReconciler`/OS-defaults skip for `Kind = Circle`.
  - `features/os/CircleRoom` (`app.cs` plus the `say`/`watch` synapses on the circle brain's own neurons; `share` comes in Step 5), installed at birth.
  - `RemoveMember` (R133 gate) and `ContributeMachine`/`WithdrawMachine`/`MachinesOf`: trust grain, link ops, clients.
  - The R98/R106/R107 gate counting `MachinesOf(brain)` for that brain only.
  - The reshaped `CircleState`/`CircleNeuron`/`CircleChatNeuron` (`Accept`, `Contribute`, `Remove` per R129). `ICircle` gains no `Share` here (Step 5 adds it). `CircleShareGrain` is keyed `{circle}/circle`.
  - The copy protocol stays until Step 6: the `[Internal]` copy methods, `ICircleChat.Relay`/`Pull`/`Notify`, `CircleAddress`, `CircleCallGuard`, `CircleTouched`, `ICircles`/`CirclesIndexNeuron` and their facts are left in place, adjusted only where the reshaped `CircleState` changes a member they read.

  The `FeatureCatalog` compile-check passes, because `features/os/Circle` and the Dart shell still find every type they use (any `CircleState` member they read that this step renames is updated in `features/os/Circle` here); Platform, Trust, Circles and Apps suites → PASS. Commit: `Circles: a circle is a brain of kind Circle whose members are accounts and whose machines are contributed`.
- [ ] **Step 4: Failing facts — key sharing.** `Keys/CircleKeyFacts.cs` (`TrustHost` plus Own machines for alice, bob and carol, registered with agreement keys from Step 2; circle from Step 3):
  - `AMemberMachineUnwrapsTheKey` (fixed test).
  - `ARemovedMemberCannotReadAnythingWrittenAfterTheRotation` (fixed test).
  - `AWrapIsBoundToItsCircleAndPart`.
  - `ACloudMachineIsRefusedEveryCirclePart`.
  - `AContributedMachineReceivesEveryExistingPartKey` (R127).
  - `AWrapIsEphemeralStaticToTheAgreementKey` (R127).
  - `DataWrittenBeforeTheRotationStaysReadableToTheRemovedMachine` (R131).

  The facts use the circle brain's core and the `CircleRoom` app part, so no Share is needed. Run → FAIL. Then implement:
  - `CirclePartKeys` over `IMachineAgreementKey`.
  - Keyring storage of per-machine wraps (concrete arrays).
  - The `PartLog` re-snapshot under the rotated key.
  - `Contribute` wraps every existing part key; `Remove` runs `RemoveMember` → `WithdrawMachine` → revoke leases → rotate → re-snapshot.

  → PASS. Commit: `Keys: a circle's part keys are wrapped to each member machine's agreement key and rotate on removal`.
- [ ] **Step 5: Failing facts — Share, the slot binding and the R134 gate.** Add these to `CircleFacts`; Step 6 carries them into its one rewrite:
  - `SharingAnAppInstallsItIntoTheCircleBrain` (R124): `Origin` is the sharer's app; no Marketplace listing.
  - `AnyMemberMayShare`.
  - `ABundleThatDoesNotCompileIsNotShared`.

  In `SharedConnectionFacts`:
  - `AChosenConnectionIsRecordedOnTheCircleAppSlot`: `connection/{circle}/{connector}/{id}` exists and the slot names it. Sealing under the circle key and a member machine opening it are Task 28 Step 1 (R130).
  - `AConnectionLeftBehindRoutesToTheOwnersCore`: through the recorded binding, forwarded to alice's core holder.
  - `AConnectionLeftBehindIs503WhileTheOwnerIsOffline`.
  - `AnUnrecordedCrossBrainConnectionCallIsRefused` (R134).

  In the Architecture tests: `TheCirclesModuleLoadsThroughTheAppsFeatureLoader` (the Circles→Apps reference fact).

  Run → FAIL. Then implement:
  - `ICircle.Share(appName, connectionIds)` (R132), added to the interface here and implemented in `CircleNeuron` (R137).
  - `AppSource.Brain` and the `FeatureLoader` path for it.
  - The binding recorded on the circle brain's app slot.
  - The R134 check in the Apps module's connection-call gate.
  - The Circles→Apps project reference.
  - The `share` synapse in `features/os/CircleRoom`.

  Circles, Apps, Platform and Architecture (6 known) suites → PASS. Commit: `Circles: sharing installs the sharer's app into the circle brain and a connection left behind is reached only through its recorded binding`.
- [ ] **Step 6: Failing facts — the Circle app split (R126).** Rewrite `CircleFacts` once, keeping Step 5's Share facts, with:
  - `SayingInACircleIsOneLineEveryMemberReads`.
  - `TheComputeShareChargesTheCircleCreator`.
  - `TheMembersIndexListsItsCircleBrains`: `os/Circle` from `BrainsOf`.
  - `CreatingThroughTheFactoryBirthsTheCircleBrain`.
  - `AScriptCannotAcceptOrInvite`.

  The rewrite drops the copy-protocol facts named in Step 1.

  Run → FAIL. Then implement:
  - `ICircleFactory` + `CircleFactoryNeuron`.
  - Delete the copy protocol (R137): the `[Internal]` copy methods, `ICircleChat.Relay`/`Pull`/`Notify`, `CircleAddress`, `CircleCallGuard`, `ICircles`/`CirclesIndexNeuron` and `CircleTouched`, after `findReferences` shows no caller left.
  - Rewrite `features/os/Circle` (index, `create` via the factory, invite/accept only through the human route).
  - Dart: `BrainsOf` plus `/brains/{circle}/live` replace `watchCircles`/`CircleTouched` at every site Step 1 found.

  LSP diagnostics clean (C# and Dart); `flutter analyze` and `flutter test`; Circles and Apps suites → PASS. Commit: `Circles: members index their circle brains and the shell watches each circle's live feed`.
- [ ] **Step 7: Live (controller).** Run the AppHost with machine A (alice) and the trust. Through A's `digitalbrain-mcp`, run the Circle app's `create friends`.
  - `neurons_context`, then `neurons_get {circle}/circle`, shows alice as member and machine A; only `CircleRoom` is installed in the circle brain.
  - `list_traces` shows `CreateBrain` on `trust` and A's lease of the circle core.
  - Multi-member behaviour needs a second account's Own machine. If the AppHost has none, `CircleKeyFacts`/`CircleBrainFacts` prove it, and the ledger records that.
- [ ] **Step 8: Regression net.** Circles, Apps, Platform, Trust, Windows module, Testing, Architecture (6 known), Mcp and OS unit suites; `flutter analyze` and `flutter test`. Commit only the files above, by explicit path.

### Task 28: Shared connections and lease preference

**Contract (fixed):**
- **Produces:** sharing asks which bound connections go along (Q14); lease preference own → circle, returning to an own machine at the next quiet moment (Q17); the core never leaves own machines (Q11).
- **Tests:** a circle machine is refused the core; with the owner back online the lease returns after the part goes quiet.

**Read under T26-3/T26-4/T26-7:** for an owner's brain the contract stands as written. A circle member's machine is refused the owner's core, and an owner's part never moves to circle machines, because shared apps live in the circle brain. For a circle brain, "own" means contributed machines.

**Additive extensions (with reasons):**
- (a) Chosen connections are bound into the circle brain, and the rest route to the owner's core (T26-7). Reason: that is what "go along" now means. `ICircle.Share` and the binding facts are implemented in Task 27 Step 5 (R132); this task keeps the credential re-seal (R130) and the live step.
- (b) `ACircleCoreIsHeldOnlyByContributedMachines`. Reason: this is the circle-brain reading of Q11.
- (c) The lease prefers the operator's contributed machine. Reason: this is Q17's circle reading.

**Files:**
- Modify: `CircleNeuron.cs` (Share re-seals the chosen credentials through the owner's machine, R130); the connection neuron's sealed-state import; `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/PartLease.cs` (who may acquire a circle part), `Parts/MachineHosting.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Parts/LeasePreference.cs`
- Test: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Parts/LeasePreferenceFacts.cs`, `src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests/SharedConnectionFacts.cs`

**Interfaces:**

```csharp
namespace DigitalBrain.Platform.Parts;   // internal

internal sealed class LeasePreference(ISequencerClient sequencer, MachineIdentity machine, PartsOptions options, TimeProvider time)
{
    public Task<bool> MayHold(PartId part, string brainId);                       // own brain: bound to its owner; circle brain: in IIdentityClient.MachinesOf (trust-side, R128); Cloud: never a private part
    public Task<string?> Preferred(PartId part, string brainId, string? operatorAccount);
    public Task ReturnWhenQuiet(PartId part, CancellationToken cancellationToken); // releases after QuietFor with no writes when Preferred is online and is not this machine
}
```

- [ ] **Step 1: Failing facts — credential re-seal (R130).** In `SharedConnectionFacts`:
  - `AChosenConnectionIsSealedUnderTheCircleKeyAndOpensOnAMemberMachine` (moved from Task 27 Step 5, which only records the binding).
  - `ReSealingSendsNoPlaintextOverAnyCall`: a recording grain-call filter on both machines sees only the sealed credential.
  - `ARemovedMemberCannotOpenACredentialSealedAfterTheRotation`.

  Run → FAIL. Implement the local unseal/re-seal on the owner's machine and the forwarded write to the circle holder → PASS. Commit: `Circles: a shared connection is re-sealed under the circle's key without plaintext crossing a call`.
- [ ] **Step 2: Failing facts — lease preference.** `LeasePreferenceFacts` (Own machines for alice and bob, plus a Cloud machine):
  - `ACircleMachineIsRefusedTheCore` (fixed test): bob's machine is refused alice's `{alice}/core`.
  - `ACircleCoreIsHeldOnlyByContributedMachines`: the Cloud machine and a non-contributed machine are refused `{circle}/core`.
  - `TheLeaseReturnsAfterThePartGoesQuiet` (fixed test): with alice offline, bob's machine leases `{circle}/apps/notes`. When alice is back online and operating, bob releases after `QuietFor` with no writes, alice's machine acquires, and no write is lost.
  - `ABusyPartDoesNotMove`.

  Run → FAIL. Implement `LeasePreference`, the `PartLease` checks and the quiet-return on the renewal tick. LSP diagnostics clean; Platform, Circles and Architecture (6 known) → PASS. Commit: `Parts: circle parts lease on contributed machines and return to the operator's when quiet`.
- [ ] **Step 3: Live (controller).** In the AppHost, `share` an app with a connection through A's MCP, then check:
  - `neurons_get connection/{circle}/…` shows it exists.
  - B is not a member: it is the Cloud machine, and its stamp is the owner's (alice's account, Open posture). B (Cloud) `neurons_get` on `{circle}/circle` is forwarded to A, and B's `list_structured_logs` show B never leased it.
  - After `release-part {circle}/core` on A, B's call returns 503.

  Record the results in the ledger.
- [ ] **Step 4: Regression net.** Platform, Trust, Circles, Apps, Architecture (6 known), Mcp, Aspire.Hosting and OS unit suites. Commit only the files above, by explicit path.

## Plan 9 — Cloud and public compute (Tasks 29–30)

### Task 29 (gate): Wasmtime determinism
- Run one `wasm32-wasip2` job on two machines with fuel metering; confirm identical output and fuel; write tasks for 30.

### Task 30: Workers, verification, fuel
- **Produces:** workers on cloud and volunteer machines running deterministic jobs only for parts marked not private (Q2, Q7, Q24); ComputeMesh-style redundant verification; payment by fuel through the ledger (credits only).
- **Tests:** two agreeing workers are credited; disagreement re-runs on a third and the dissenter's reputation drops; a private part's job is refused.

---

## Spec coverage

| Spec | Task |
|---|---|
| Q1, Q8 | 12–13 (state is the log; the in-memory map and the journal are the machine's cache) |
| Q2, Q4, Q7 | 11 (core only on own machines), 22 release gate, 30 |
| Q3, Q6 | 4–6, 19, 27 |
| Q5, Q11, Q17 | 11, 28 |
| Q9, Q27 | 2, 10, 13, 14 |
| Q10 | 7–8, 11 |
| Q12, Q24 | 1, 17–18 |
| Q13 | 14, 16 |
| Q14 | 28 |
| Q15 | 11, 21–22 |
| Q16, Q19, Q20, Q25 | 3, Stage A acceptance, 24 |
| Q18, Q26 | 12 |
| Q21 | 25 |
| Q22, Q23 | Platform/Mesh (shipped), 3, 15 |
