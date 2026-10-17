> Historical design: distributed runtime portions are superseded for the local-PC deployment by [single-runtime devices](../specs/2026-10-14-single-runtime-devices-design.md). Windows connector functionality remains.

# Mesh Storage Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `DigitalBrain/Mesh` module that stores caller-encrypted objects as wide Reed–Solomon shards on storage-node neurons owned by distinct accounts, reads them back from any k shards, audits nodes with storage proofs and repairs lost shards.

**Architecture:** Ported from `E:\intochat\ComputeMesh\src\ComputeMesh.Storage` (Q22) with two changes: the caller supplies the per-object key (no master key in options, Q6), and nodes, registry and object manifests are neurons instead of in-memory classes. Storage nodes are neurons keyed by node id; in this plan every node is a seed node (Q19) persisting shards in grain storage. Later plans move node neurons onto volunteer machines' silos (Q12) without changing the contracts.

**Tech Stack:** .NET 11 RC, Orleans, `System.Security.Cryptography` (AesGcm, SHA-256), xUnit v3 via Microsoft Testing Platform, `DigitalBrain.Testing.Module`.

**Spec:** `docs/superpowers/specs/2026-10-10-federation-circles-mesh-design.md`

> **Superseded in shape by spec Q23 (2026-10-10).** The review found this plan kept ComputeMesh's trusted core:
> plaintext and key as grain arguments, a mutable manifest in grain storage, per-brain node neurons. The code
> now lives in Platform (`DigitalBrain.Platform/Mesh`: `MeshStore` behind Framework's `IMeshStore`, the
> `platform.mesh.directory` grain, seed shard grains); the `DigitalBrain/Mesh` module is deleted. The tasks
> below are kept as the record of what was first built.

## Roadmap (one plan each, in order; this document is plan 1)

1. **Mesh storage core** — this plan; reshaped by Q23 (immutable segments, codec in the caller, Platform directory).
2. **Part keys** — master key custody (TPM/passkey), part-key wrap/unwrap, Shamir recovery (Q3, Q6).
3. **Sequencer** — Platform-ring signed CAS records, leases with expiry and preference (Q10, Q11, Q17).
4. **Part log storage** — log entries batched into sealed `IMeshStore` segments + snapshots, `IGrainStorage` writing under the lease, signal log with watermarks, reachability sweep of unreferenced segments (Q13, Q18, Q23).
5. **Per-machine silo + Windows module** — phase 1 spec, revised by Q12 (single-silo cluster per machine).
6. **Transport** — QUIC machine links, relay fallback, cross-part calls with `Trace` (Q15).
7. **Remote storage nodes + credits** — volunteer machines answer put/get/prove over the transport and register in the Platform directory, audits credited through the kernel ledger (Q16, Q21).
8. **Circles** — circle neuron, sharing parts and chosen connections, lease preference (Q11, Q14, Q17).
9. **Public mesh compute** — Wasmtime worker, deterministic jobs, verification, fuel pricing.

## Global Constraints

- Module lives at `src/DigitalBrain.Modules/DigitalBrain/Mesh/` with `.Contracts`, module and `tests/` projects (repo module shape).
- Contracts reference only `DigitalBrain`; the module references `DigitalBrain.Framework`. No Platform reference.
- No master key anywhere in options or state: every Put/Get takes the 32-byte object key from the caller.
- Defaults: `DataShards = 8`, `ParityShards = 16`, `ChallengesPerShard = 16` (Q20).
- Placement prefers distinct owners; it refuses (throws `ServiceUnavailableException`) when fewer healthy nodes than shards exist — never silently lowers redundancy.
- Grain state uses concrete arrays/dictionaries, never `IReadOnlyList` (CLAUDE.md hazard).
- No `/// <summary>` boilerplate; tests are facts with sentence names and `TestContext.Current.CancellationToken`.
- Build/test per project, never the `.slnx`. LSP diagnostics clean before each build.

## Review Focus

1. **A tampered shard is treated as missing, not as data** — a node returning altered bytes must not corrupt the read while k honest shards remain. `Fetch` checks every shard against its content id (Task 6); seed nodes verify on `Put` so they cannot return altered bytes, and the fact that pins this belongs to plan 7, where remote nodes can lie. Task 6 pins the neighbouring case: losing as many shards as there is parity still reads.
2. **Wrong key on read fails loudly** — `AuthenticationTagMismatchException`, never garbage plaintext. (Task 3 test.)
3. **Rewriting an object removes the old version's shards** — nodes don't accumulate orphaned ciphertext. (Task 6 test.)
4. **Too few distinct healthy nodes refuses the write** — 503-style `ServiceUnavailableException`, no partial manifest saved. (Task 5 and Task 6 tests.)
5. **A node that wiped its shards fails audit and repair moves the shard** — read still works afterwards with that node gone. (Task 7 test.)

---

### Task 1: Module scaffold

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/DigitalBrain.Modules.Mesh.Contracts.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/DigitalBrain.Modules.Mesh.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshModule.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshOptions.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/DigitalBrain.Modules.Mesh.Tests.csproj`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshModuleFacts.cs`
- Modify: `DigitalBrain.slnx` (add a `/Modules/DigitalBrain/Mesh/` folder next to `/Modules/DigitalBrain/Machine/`, lines ~63-68)

**Interfaces:**
- Produces: `MeshModule : Module<MeshOptions>` with id `"mesh"`; `MeshOptions { int DataShards = 8; int ParityShards = 16; int ChallengesPerShard = 16; }`, namespace `DigitalBrain.Mesh`.

- [ ] **Step 1: Before writing, confirm the patterns with LSP**

Use LSP `goToDefinition` on `Module<MachineOptions>` in `src/DigitalBrain.Modules/DigitalBrain/Machine/DigitalBrain.Modules.Machine/MachineModule.cs` and on `IModuleOptions.Validate`, and `findReferences` on `ModuleTest.Create` to confirm the builder calls used below (`WithModule<T>()`, `ConfigureModule<TModule,TOptions>`, `StartAsync`, `AuthorizeCallerAsync`, `Get<T>(key)`). Also `goToDefinition` on `Neuron` to read how a neuron validates its key (brain-scoped or not); if keys must be brain-scoped, prefix every key in this plan with `BrainScope.Create(Principal, BrainName).Id + "/"` exactly as `MachineFacts` does.

- [ ] **Step 2: Create the projects**

`DigitalBrain.Modules.Mesh.Contracts.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Mesh storage contracts: storage nodes, node registry and encrypted object store.</Description>
    <RootNamespace>DigitalBrain.Mesh</RootNamespace>
    <NoWarn>$(NoWarn);CS1591</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="../../../../DigitalBrain/DigitalBrain.csproj" />
  </ItemGroup>
  <ItemGroup><PackageReference Include="Microsoft.Orleans.Sdk" PrivateAssets="all" /></ItemGroup>
</Project>
```

`DigitalBrain.Modules.Mesh.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>Mesh storage: caller-encrypted objects as wide erasure-coded shards on storage nodes of distinct owners.</Description>
    <RootNamespace>DigitalBrain.Mesh</RootNamespace>
    <NoWarn>$(NoWarn);ORLEANSEXP005</NoWarn>
  </PropertyGroup>
  <ItemGroup>
    <InternalsVisibleTo Include="DigitalBrain.Modules.Mesh.Tests" />
    <ProjectReference Include="../DigitalBrain.Modules.Mesh.Contracts/DigitalBrain.Modules.Mesh.Contracts.csproj" />
    <ProjectReference Include="../../../../DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj" />
  </ItemGroup>
</Project>
```

`DigitalBrain.Modules.Mesh.Tests.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <ProjectReference Include="../../../../../Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.Mesh/DigitalBrain.Modules.Mesh.csproj" />
  </ItemGroup>
  <ItemGroup><Using Include="DigitalBrain.Testing.Module" /></ItemGroup>
</Project>
```

`MeshOptions.cs`:
```csharp
using DigitalBrain.Framework.Modules;

namespace DigitalBrain.Mesh;

// Wide coding because home nodes sleep: any DataShards of DataShards+ParityShards rebuild an object.
public sealed class MeshOptions : IModuleOptions
{
    public int DataShards { get; set; } = 8;

    public int ParityShards { get; set; } = 16;

    public int ChallengesPerShard { get; set; } = 16;

    public void Validate()
    {
        if (DataShards < 1 || ParityShards < 1 || DataShards + ParityShards > 255)
        { throw new InvalidOperationException("Mesh needs DataShards >= 1, ParityShards >= 1 and at most 255 shards in total."); }
        if (ChallengesPerShard < 1) { throw new InvalidOperationException("Mesh needs at least one storage challenge per shard."); }
    }
}
```

`MeshModule.cs` (contracts assembly set from a type created in Task 4; until then use `typeof(MeshOptions).Assembly` and switch in Task 4):
```csharp
using System.Reflection;
using DigitalBrain.Framework.Modules;
using Orleans.Hosting;

namespace DigitalBrain.Mesh;

// Storage for brain data on machines nobody has to trust: callers encrypt, nodes hold shards of ciphertext.
public sealed class MeshModule() : Module<MeshOptions>(new ModuleId("mesh"))
{
    public override Assembly? Contracts => typeof(MeshOptions).Assembly;

    public override void Configure(ISiloBuilder silo) => ArgumentNullException.ThrowIfNull(silo);
}
```

Add to `DigitalBrain.slnx`:
```xml
  <Folder Name="/Modules/DigitalBrain/Mesh/">
    <Project Path="src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/DigitalBrain.Modules.Mesh.Contracts.csproj" />
    <Project Path="src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/DigitalBrain.Modules.Mesh.csproj" />
  </Folder>
  <Folder Name="/Modules/DigitalBrain/Mesh/tests/">
    <Project Path="src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/DigitalBrain.Modules.Mesh.Tests.csproj" />
  </Folder>
```
Also add the three projects to the gitignored `DigitalBrain-lsp.sln` so csharp-ls sees them, then restart the LSP server.

- [ ] **Step 3: Write the failing test**

`MeshModuleFacts.cs`:
```csharp
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class MeshModuleFacts
{
    [Fact]
    public void DefaultsCodeWideForHomeNodes()
    {
        var options = new MeshOptions();
        options.Validate();
        Assert.Equal((8, 16), (options.DataShards, options.ParityShards));
    }

    [Fact]
    public void MoreThan255ShardsIsRefused() =>
        Assert.Throws<InvalidOperationException>(() => new MeshOptions { DataShards = 200, ParityShards = 100 }.Validate());
}
```

- [ ] **Step 4: Build and run**

Run: `dotnet build src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/DigitalBrain.Modules.Mesh.Tests.csproj` then `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests`
Expected: both facts PASS. Also run `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests` — Expected: PASS (ring rules hold for the new projects).

- [ ] **Step 5: Commit (explicit files only)**

```bash
git add DigitalBrain.slnx src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/DigitalBrain.Modules.Mesh.Contracts.csproj src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/DigitalBrain.Modules.Mesh.csproj src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshModule.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshOptions.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/DigitalBrain.Modules.Mesh.Tests.csproj src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshModuleFacts.cs
git commit -m "Mesh: module scaffold with wide-coding defaults"
```

---

### Task 2: Reed–Solomon erasure code

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Coding/ReedSolomon.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/ReedSolomonFacts.cs`

**Interfaces:**
- Produces: `internal sealed class ReedSolomon(int dataShards, int parityShards)` with `int DataShards`, `int ParityShards`, `int TotalShards`, `byte[][] Encode(ReadOnlySpan<byte> data, out int shardSize)`, `byte[][] Reconstruct(byte[]?[] shards, int shardSize)` (throws `InvalidOperationException` when fewer than k shards), `byte[] Join(byte[][] shards, int length)`.

- [ ] **Step 1: Write the failing test**

```csharp
using System.Security.Cryptography;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class ReedSolomonFacts
{
    [Theory]
    [InlineData(4, 2, 1000)]
    [InlineData(8, 16, 4097)]
    [InlineData(10, 4, 1)]
    public void AnyKOfNShardsRebuildTheData(int k, int m, int size)
    {
        var rs = new ReedSolomon(k, m);
        var data = RandomNumberGenerator.GetBytes(size);
        var shards = rs.Encode(data, out var shardSize);

        foreach (var lost in Combinations(k + m, m).Take(200))
        {
            var partial = shards.Select((s, i) => lost.Contains(i) ? null : (byte[]?)s.ToArray()).ToArray();
            var rebuilt = rs.Reconstruct(partial, shardSize);
            Assert.Equal(data, rs.Join(rebuilt, size));
            for (var i = 0; i < k + m; i++) { Assert.Equal(shards[i], rebuilt[i]); }
        }
    }

    [Fact]
    public void LosingMoreThanMShardsIsUnrecoverable()
    {
        var rs = new ReedSolomon(4, 2);
        var shards = rs.Encode(new byte[100], out var size);
        var partial = shards.Select((s, i) => i < 3 ? null : (byte[]?)s).ToArray();
        Assert.Throws<InvalidOperationException>(() => rs.Reconstruct(partial, size));
    }

    private static IEnumerable<int[]> Combinations(int n, int r)
    {
        var idx = Enumerable.Range(0, r).ToArray();
        while (true)
        {
            yield return idx.ToArray();
            var i = r - 1;
            while (i >= 0 && idx[i] == n - r + i) { i--; }
            if (i < 0) { yield break; }
            idx[i]++;
            for (var j = i + 1; j < r; j++) { idx[j] = idx[j - 1] + 1; }
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*ReedSolomonFacts"`
Expected: build FAIL, `ReedSolomon` not found.

- [ ] **Step 3: Port the implementation**

Copy `E:\intochat\ComputeMesh\src\ComputeMesh.Storage\ReedSolomon.cs` to `Coding/ReedSolomon.cs`, then: namespace `DigitalBrain.Mesh`; `public sealed class` → `internal sealed class`; delete every `/// <summary>` block (keep the one-line comment on the primitive polynomial and replace the class summary with `// Systematic Reed–Solomon over GF(2^8) with a Cauchy parity matrix: any k of the k+m shards rebuild the data.`); fix any analyzer warnings LSP reports (warnings are errors) without changing the arithmetic.

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*ReedSolomonFacts"`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Coding/ReedSolomon.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/ReedSolomonFacts.cs
git commit -m "Mesh: Reed-Solomon erasure code ported from ComputeMesh"
```

---

### Task 3: Sealing objects with a caller key, content ids, storage proofs

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Coding/ObjectSeal.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/StorageProof.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/ObjectSealFacts.cs`

**Interfaces:**
- Produces: `public static class StorageProof { byte[] Compute(byte[] nonce, byte[] shard); string ContentId(ReadOnlySpan<byte> bytes); }` (contracts, so node implementations elsewhere compute the same proof);
  `internal static class ObjectSeal { byte[] Seal(byte[] key, string objectId, long version, byte[] plaintext, out byte[] nonce); byte[] Open(byte[] key, string objectId, long version, byte[] nonce, byte[] cipher); }` — cipher = ciphertext followed by the 16-byte GCM tag; AAD = UTF-8 `"{objectId}|{version}"`; `key` must be 32 bytes (`ArgumentException` otherwise).

- [ ] **Step 1: Write the failing test**

```csharp
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class ObjectSealFacts
{
    private static readonly byte[] Key = RandomNumberGenerator.GetBytes(32);

    [Fact]
    public void SealedBytesOpenWithTheSameKeyAndContainNoPlaintext()
    {
        var plain = Encoding.UTF8.GetBytes("timeline: ten clips, private");
        var cipher = ObjectSeal.Seal(Key, "vlad/apps/filmcraft/doc", 1, plain, out var nonce);

        Assert.DoesNotContain("timeline", Encoding.UTF8.GetString(cipher), StringComparison.Ordinal);
        Assert.Equal(plain, ObjectSeal.Open(Key, "vlad/apps/filmcraft/doc", 1, nonce, cipher));
    }

    [Fact]
    public void AWrongKeyFailsInsteadOfReturningGarbage()
    {
        var cipher = ObjectSeal.Seal(Key, "o", 1, [1, 2, 3], out var nonce);
        Assert.ThrowsAny<CryptographicException>(() => ObjectSeal.Open(RandomNumberGenerator.GetBytes(32), "o", 1, nonce, cipher));
    }

    [Fact]
    public void ReplayingAnOlderVersionUnderANewerVersionNumberFails()
    {
        var cipher = ObjectSeal.Seal(Key, "o", 1, [1, 2, 3], out var nonce);
        Assert.ThrowsAny<CryptographicException>(() => ObjectSeal.Open(Key, "o", 2, nonce, cipher));
    }

    [Fact]
    public void AShortKeyIsRefused() =>
        Assert.Throws<ArgumentException>(() => ObjectSeal.Seal(new byte[16], "o", 1, [1], out _));

    [Fact]
    public void AProofCannotBeAnsweredWithoutTheShard()
    {
        var nonce = RandomNumberGenerator.GetBytes(16);
        Assert.NotEqual(StorageProof.Compute(nonce, [1, 2, 3]), StorageProof.Compute(nonce, [1, 2, 4]));
        Assert.StartsWith("sha256:", StorageProof.ContentId([1, 2, 3]), StringComparison.Ordinal);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*ObjectSealFacts"`
Expected: build FAIL, `ObjectSeal` / `StorageProof` not found.

- [ ] **Step 3: Implement**

`StorageProof.cs` (contracts):
```csharp
using System.Security.Cryptography;

namespace DigitalBrain.Mesh;

// A node proves it still holds a shard by hashing a fresh nonce with it; the expected answer was computed at write time.
public static class StorageProof
{
    public static byte[] Compute(byte[] nonce, byte[] shard)
    {
        ArgumentNullException.ThrowIfNull(nonce);
        ArgumentNullException.ThrowIfNull(shard);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(nonce);
        hash.AppendData(shard);
        return hash.GetHashAndReset();
    }

    public static string ContentId(ReadOnlySpan<byte> bytes) => "sha256:" + Convert.ToHexStringLower(SHA256.HashData(bytes));
}
```

`ObjectSeal.cs`:
```csharp
using System.Security.Cryptography;
using System.Text;

namespace DigitalBrain.Mesh;

// AES-256-GCM with the caller's key. The object id and version are authenticated, so a shard set cannot be
// replayed as another object or as a different version of the same one.
internal static class ObjectSeal
{
    private const int TagSize = 16;

    public static byte[] Seal(byte[] key, string objectId, long version, byte[] plaintext, out byte[] nonce)
    {
        RequireKey(key);
        ArgumentNullException.ThrowIfNull(plaintext);
        nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plaintext.Length + TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plaintext, cipher.AsSpan(0, plaintext.Length), cipher.AsSpan(plaintext.Length), Aad(objectId, version));
        return cipher;
    }

    public static byte[] Open(byte[] key, string objectId, long version, byte[] nonce, byte[] cipher)
    {
        RequireKey(key);
        ArgumentNullException.ThrowIfNull(cipher);
        var plain = new byte[cipher.Length - TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Decrypt(nonce, cipher.AsSpan(0, plain.Length), cipher.AsSpan(plain.Length), plain, Aad(objectId, version));
        return plain;
    }

    private static void RequireKey(byte[] key)
    {
        if (key is not { Length: 32 }) { throw new ArgumentException("A mesh object key is 32 bytes.", nameof(key)); }
    }

    private static byte[] Aad(string objectId, long version) => Encoding.UTF8.GetBytes($"{objectId}|{version}");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*ObjectSealFacts"`
Expected: PASS (5 facts).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Coding/ObjectSeal.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/StorageProof.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/ObjectSealFacts.cs
git commit -m "Mesh: objects sealed with the caller's key; content ids and storage proofs"
```

---

### Task 4: Storage node neuron (seed node)

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IStorageNode.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Nodes/StorageNodeNeuron.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshModule.cs` (`Contracts => typeof(IStorageNode).Assembly`)
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/StorageNodeFacts.cs`
- Test helper: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshHost.cs`

**Interfaces:**
- Consumes: `StorageProof` (Task 3).
- Produces: `IStorageNode : INeuron` alias/grain type `"mesh.node"`, key = node id: `Task Put(string cid, byte[] shard, CancellationToken)` (throws `InvalidDataException` when `StorageProof.ContentId(shard) != cid`), `Task<byte[]?> Get(string cid, CancellationToken)`, `Task Delete(string cid, CancellationToken)`, `Task<byte[]?> Prove(string cid, byte[] nonce, CancellationToken)`, `Task<long> BytesStored(CancellationToken)`.
  `MeshHost.StartAsync(CancellationToken, Action<MeshOptions>? configure = null)` returning `ModuleBrain`, and `MeshHost.Key(string name)` building a key in the form Task 1 Step 1 established.

- [ ] **Step 1: Write the failing test**

`MeshHost.cs`:
```csharp
using DigitalBrain.Framework;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

internal static class MeshHost
{
    private const string Principal = "acct";
    private const string BrainName = "home";
    private static readonly string Scope = BrainScope.Create(Principal, BrainName).Id;

    // Keys follow the rule read from Neuron in Task 1 Step 1; if neuron keys need no brain scope, return name.
    public static string Key(string name) => $"{Scope}/mesh/{name}";

    public static async Task<ModuleBrain> StartAsync(CancellationToken ct, Action<MeshOptions>? configure = null)
    {
        var host = await ModuleTest.Create()
            .WithModule<MeshModule>()
            .ConfigureModule<MeshModule, MeshOptions>(options => configure?.Invoke(options))
            .StartAsync(ct);
        CallerContextStamper.Stamp(new()
        { PrincipalId = Principal, AccountId = Principal, BrainId = BrainName, Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        await host.AuthorizeCallerAsync();
        return host;
    }
}
```

`StorageNodeFacts.cs`:
```csharp
using System.Security.Cryptography;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class StorageNodeFacts
{
    [Fact(Timeout = 60_000)]
    public async Task AShardIsStoredUnderItsContentIdAndProvable()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var node = host.Get<IStorageNode>(MeshHost.Key("nodes/seed-1"));
        var shard = RandomNumberGenerator.GetBytes(64);
        var cid = StorageProof.ContentId(shard);

        await node.Put(cid, shard, ct);

        Assert.Equal(shard, await node.Get(cid, ct));
        var nonce = RandomNumberGenerator.GetBytes(16);
        Assert.Equal(StorageProof.Compute(nonce, shard), await node.Prove(cid, nonce, ct));
        Assert.Equal(64, await node.BytesStored(ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task AShardWhoseBytesDoNotMatchItsIdIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var node = host.Get<IStorageNode>(MeshHost.Key("nodes/seed-1"));

        await Assert.ThrowsAsync<InvalidDataException>(() => node.Put(StorageProof.ContentId([1]), [2], ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task ADeletedShardCanNoLongerBeProven()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var node = host.Get<IStorageNode>(MeshHost.Key("nodes/seed-1"));
        byte[] shard = [9, 9, 9];
        var cid = StorageProof.ContentId(shard);
        await node.Put(cid, shard, ct);

        await node.Delete(cid, ct);

        Assert.Null(await node.Prove(cid, [1], ct));
        Assert.Null(await node.Get(cid, ct));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*StorageNodeFacts"`
Expected: build FAIL, `IStorageNode` not found.

- [ ] **Step 3: Implement**

`IStorageNode.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;
using ReadOnly = Orleans.Concurrency.ReadOnlyAttribute;

namespace DigitalBrain.Mesh;

// A storage machine nobody has to trust: it holds content-addressed shards of ciphertext and answers proofs.
[Alias("mesh.node"), Orleans.Metadata.DefaultGrainType("mesh.node")]
public interface IStorageNode : INeuron
{
    [Description("Store a shard under its content id.")]
    Task Put(string cid, byte[] shard, CancellationToken cancellationToken = default);

    [Description("Return a stored shard, or null when this node does not hold it.")]
    [ReadOnly, AlwaysInterleave]
    Task<byte[]?> Get(string cid, CancellationToken cancellationToken = default);

    [Description("Drop a shard.")]
    Task Delete(string cid, CancellationToken cancellationToken = default);

    [Description("Prove a shard is held: SHA-256 of the nonce followed by the shard, or null when it is not.")]
    [ReadOnly, AlwaysInterleave]
    Task<byte[]?> Prove(string cid, byte[] nonce, CancellationToken cancellationToken = default);

    [Description("Total bytes of shards held.")]
    [ReadOnly, AlwaysInterleave]
    Task<long> BytesStored(CancellationToken cancellationToken = default);
}
```

`StorageNodeNeuron.cs`:
```csharp
using DigitalBrain.Framework;

namespace DigitalBrain.Mesh;

// A seed node: shards persist in this neuron's grain storage. Volunteer nodes implement the same contract on
// their own machine's silo in a later plan.
[GrainType("mesh.node")]
internal sealed class StorageNodeNeuron(
    [PersistentState("mesh.node", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<StorageNodeState> store) : Neuron, IStorageNode
{
    public async Task Put(string cid, byte[] shard, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(shard);
        if (StorageProof.ContentId(shard) != cid) { throw new InvalidDataException($"Shard bytes do not match content id '{cid}'."); }
        store.State.Shards[cid] = shard;
        await store.WriteStateAsync(cancellationToken);
    }

    public Task<byte[]?> Get(string cid, CancellationToken cancellationToken = default) =>
        Task.FromResult(store.State.Shards.GetValueOrDefault(cid));

    public async Task Delete(string cid, CancellationToken cancellationToken = default)
    {
        if (store.State.Shards.Remove(cid)) { await store.WriteStateAsync(cancellationToken); }
    }

    public Task<byte[]?> Prove(string cid, byte[] nonce, CancellationToken cancellationToken = default) =>
        Task.FromResult(store.State.Shards.TryGetValue(cid, out var shard) ? StorageProof.Compute(nonce, shard) : null);

    public Task<long> BytesStored(CancellationToken cancellationToken = default) =>
        Task.FromResult(store.State.Shards.Values.Sum(shard => (long)shard.Length));
}

[GenerateSerializer, Alias("mesh.node-state")]
internal sealed class StorageNodeState
{
    [Id(0)] public Dictionary<string, byte[]> Shards { get; set; } = new(StringComparer.Ordinal);
}
```
Check with LSP `goToDefinition` that `DigitalBrainNames.DefaultGrainStorage` resolves from this project (it is used in `AgentNeuron`); if it lives in an assembly the module does not reference, use the same constant's home the AI module uses.

Change `MeshModule.Contracts` to `typeof(IStorageNode).Assembly`.

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*StorageNodeFacts"`
Expected: PASS (3 facts).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IStorageNode.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Nodes/StorageNodeNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/MeshModule.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshHost.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/StorageNodeFacts.cs
git commit -m "Mesh: storage node neuron holding content-addressed shards"
```

---

### Task 5: Node registry and placement across distinct owners

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IStorageNodes.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Nodes/StorageNodesNeuron.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/PlacementFacts.cs`

**Interfaces:**
- Produces: `IStorageNodes : INeuron` alias `"mesh.nodes"`, key `MeshHost.Key("nodes")`:
  `Task Register(string nodeId, string ownerAccount, CancellationToken)`;
  `Task SetOnline(string nodeId, bool online, CancellationToken)`;
  `Task ReportAudit(string nodeId, bool passed, CancellationToken)` (pass: `min(1, r + 0.02)`; fail: `r * 0.5`);
  `Task<string[]> Place(int count, string[] exclude, CancellationToken)` — node ids, online, reputation ≥ 0.25, distinct owners first then any; throws `ServiceUnavailableException` when fewer than `count`;
  `Task<StorageNodeView[]> List(CancellationToken)`;
  `record StorageNodeView(string NodeId, string OwnerAccount, bool Online, double Reputation)` (`[GenerateSerializer]`).
  The node id is the key suffix: node neuron key = `{nodesKey}/{nodeId}` — Task 6 uses `MeshKeys.Node(nodesKey, nodeId)`, defined here as `public static class MeshKeys { public static string Node(string nodesKey, string nodeId) => $"{nodesKey}/{nodeId}"; }` in Contracts.

- [ ] **Step 1: Before implementing, find `ServiceUnavailableException`**

`ServiceUnavailableException(string message)` lives in `src/DigitalBrain/Neurons/ServiceUnavailableException.cs`; confirm its namespace with LSP `goToDefinition` and add the matching `using` where needed.

- [ ] **Step 2: Write the failing test**

```csharp
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class PlacementFacts
{
    [Fact(Timeout = 60_000)]
    public async Task PlacementPrefersDistinctOwners()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var nodes = host.Get<IStorageNodes>(MeshHost.Key("nodes"));
        await nodes.Register("a1", "alice", ct);
        await nodes.Register("a2", "alice", ct);
        await nodes.Register("b1", "bob", ct);
        await nodes.Register("c1", "carol", ct);

        var placed = await nodes.Place(3, [], ct);

        Assert.Equal(["alice", "bob", "carol"], (await nodes.List(ct)).Where(n => placed.Contains(n.NodeId)).Select(n => n.OwnerAccount).Order());
    }

    [Fact(Timeout = 60_000)]
    public async Task TooFewHealthyNodesRefusesInsteadOfLoweringRedundancy()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var nodes = host.Get<IStorageNodes>(MeshHost.Key("nodes"));
        await nodes.Register("a1", "alice", ct);
        await nodes.Register("b1", "bob", ct);
        await nodes.SetOnline("b1", false, ct);

        await Assert.ThrowsAsync<ServiceUnavailableException>(() => nodes.Place(2, [], ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task ANodeFailingAuditsDropsOutOfPlacement()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var host = await MeshHost.StartAsync(ct);
        var nodes = host.Get<IStorageNodes>(MeshHost.Key("nodes"));
        await nodes.Register("a1", "alice", ct);
        await nodes.Register("b1", "bob", ct);
        for (var i = 0; i < 3; i++) { await nodes.ReportAudit("b1", false, ct); }

        Assert.Equal(["a1"], await nodes.Place(1, [], ct));
        await Assert.ThrowsAsync<ServiceUnavailableException>(() => nodes.Place(2, [], ct));
    }
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*PlacementFacts"`
Expected: build FAIL, `IStorageNodes` not found.

- [ ] **Step 4: Implement**

`IStorageNodes.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;
using ReadOnly = Orleans.Concurrency.ReadOnlyAttribute;

namespace DigitalBrain.Mesh;

// The storage nodes this mesh can place shards on, with their owners and audit reputation.
[Alias("mesh.nodes"), Orleans.Metadata.DefaultGrainType("mesh.nodes")]
public interface IStorageNodes : INeuron
{
    [Description("Register a storage node and the account that owns it.")]
    Task Register(string nodeId, string ownerAccount, CancellationToken cancellationToken = default);

    [Description("Mark a storage node online or offline.")]
    Task SetOnline(string nodeId, bool online, CancellationToken cancellationToken = default);

    [Description("Record whether a node passed a storage proof.")]
    Task ReportAudit(string nodeId, bool passed, CancellationToken cancellationToken = default);

    [Description("Choose count healthy online nodes, distinct owners first; refuses when not enough exist.")]
    Task<string[]> Place(int count, string[] exclude, CancellationToken cancellationToken = default);

    [Description("List registered storage nodes.")]
    [ReadOnly, AlwaysInterleave]
    Task<StorageNodeView[]> List(CancellationToken cancellationToken = default);
}

[GenerateSerializer, Alias("mesh.node-view")]
public sealed record StorageNodeView(
    [property: Id(0)] string NodeId,
    [property: Id(1)] string OwnerAccount,
    [property: Id(2)] bool Online,
    [property: Id(3)] double Reputation);

public static class MeshKeys
{
    public static string Node(string nodesKey, string nodeId) => $"{nodesKey}/{nodeId}";
}
```

`StorageNodesNeuron.cs` (replace the `using` for `ServiceUnavailableException` with the namespace found in Step 1):
```csharp
using DigitalBrain.Framework;

namespace DigitalBrain.Mesh;

[GrainType("mesh.nodes")]
internal sealed class StorageNodesNeuron(
    [PersistentState("mesh.nodes", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<StorageNodesState> store) : Neuron, IStorageNodes
{
    private const double Healthy = 0.25;

    public async Task Register(string nodeId, string ownerAccount, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(nodeId);
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerAccount);
        var existing = store.State.Nodes.GetValueOrDefault(nodeId);
        store.State.Nodes[nodeId] = new StorageNodeView(nodeId, ownerAccount, true, existing?.Reputation ?? 1.0);
        await store.WriteStateAsync(cancellationToken);
    }

    public Task SetOnline(string nodeId, bool online, CancellationToken cancellationToken = default) =>
        Update(nodeId, node => node with { Online = online }, cancellationToken);

    public Task ReportAudit(string nodeId, bool passed, CancellationToken cancellationToken = default) =>
        Update(nodeId, node => node with { Reputation = passed ? Math.Min(1, node.Reputation + 0.02) : node.Reputation * 0.5 }, cancellationToken);

    public Task<string[]> Place(int count, string[] exclude, CancellationToken cancellationToken = default)
    {
        var excluded = new HashSet<string>(exclude ?? [], StringComparer.Ordinal);
        var candidates = store.State.Nodes.Values
            .Where(node => node.Online && node.Reputation >= Healthy && !excluded.Contains(node.NodeId))
            .OrderByDescending(node => node.Reputation)
            .ThenBy(_ => Random.Shared.Next())
            .ToArray();

        var chosen = new List<StorageNodeView>();
        var owners = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in candidates) { if (chosen.Count < count && owners.Add(node.OwnerAccount)) { chosen.Add(node); } }
        foreach (var node in candidates) { if (chosen.Count < count && !chosen.Contains(node)) { chosen.Add(node); } }

        if (chosen.Count < count) { throw new ServiceUnavailableException($"Mesh needs {count} healthy storage nodes; {chosen.Count} are available."); }
        return Task.FromResult(chosen.Select(node => node.NodeId).ToArray());
    }

    public Task<StorageNodeView[]> List(CancellationToken cancellationToken = default) =>
        Task.FromResult(store.State.Nodes.Values.ToArray());

    private async Task Update(string nodeId, Func<StorageNodeView, StorageNodeView> change, CancellationToken cancellationToken)
    {
        if (!store.State.Nodes.TryGetValue(nodeId, out var node)) { throw new KeyNotFoundException($"Storage node '{nodeId}' is not registered."); }
        store.State.Nodes[nodeId] = change(node);
        await store.WriteStateAsync(cancellationToken);
    }
}

[GenerateSerializer, Alias("mesh.nodes-state")]
internal sealed class StorageNodesState
{
    [Id(0)] public Dictionary<string, StorageNodeView> Nodes { get; set; } = new(StringComparer.Ordinal);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*PlacementFacts"`
Expected: PASS (3 facts).

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IStorageNodes.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Nodes/StorageNodesNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/PlacementFacts.cs
git commit -m "Mesh: node registry placing shards across distinct owners"
```

---

### Task 6: Object store — put and get

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IMeshObjects.cs`
- Create: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Objects/MeshObjectsNeuron.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshObjectFacts.cs`

**Interfaces:**
- Consumes: `ReedSolomon` (Task 2), `ObjectSeal`, `StorageProof` (Task 3), `IStorageNode` (Task 4), `IStorageNodes`, `MeshKeys` (Task 5), `IOptions<MeshOptions>` (Task 1).
- Produces: `IMeshObjects : INeuron` alias `"mesh.objects"`, key `MeshHost.Key("objects")`, with the registry it uses at `MeshHost.Key("nodes")` — the neuron derives the registry key by replacing its own key's trailing `/objects` with `/nodes`:
  `Task<long> Put(string objectId, byte[] plaintext, byte[] key, CancellationToken)` returns the new version;
  `Task<byte[]?> Get(string objectId, byte[] key, CancellationToken)` — null when unknown;
  `Task Delete(string objectId, CancellationToken)`;
  `Task<ObjectManifestView?> Manifest(string objectId, CancellationToken)`;
  `record ObjectManifestView(string ObjectId, long Version, ShardView[] Shards)`, `record ShardView(int Index, string Cid, string NodeId)`.
  Internal state per object: `ObjectManifest { long Version; int DataShards; int ParityShards; int ShardSize; int CipherLength; byte[] Nonce; ShardLocation[] Shards; }`, `ShardLocation { int Index; string Cid; string NodeId; ShardChallenge[] Challenges; int NextChallenge; }`, `ShardChallenge { byte[] Nonce; byte[] Expected; }`.

- [ ] **Step 1: Write the failing test**

```csharp
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class MeshObjectFacts
{
    private static readonly byte[] Key = RandomNumberGenerator.GetBytes(32);

    internal static async Task<(ModuleBrain Host, IMeshObjects Objects, IStorageNodes Nodes)> StartAsync(int owners, CancellationToken ct)
    {
        var host = await MeshHost.StartAsync(ct, options => { options.DataShards = 4; options.ParityShards = 2; });
        var nodes = host.Get<IStorageNodes>(MeshHost.Key("nodes"));
        for (var i = 0; i < owners; i++) { await nodes.Register($"n{i}", $"owner{i}", ct); }
        return (host, host.Get<IMeshObjects>(MeshHost.Key("objects")), nodes);
    }

    internal static IStorageNode Node(ModuleBrain host, string nodeId) => host.Get<IStorageNode>(MeshKeys.Node(MeshHost.Key("nodes"), nodeId));

    [Fact(Timeout = 60_000)]
    public async Task AnObjectRoundTripsAndNodesHoldOnlyCiphertext()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await StartAsync(8, ct);
        await using var _ = host;
        var secret = Encoding.UTF8.GetBytes("top secret: the cake is a lie. top secret: the cake is a lie.");

        await objects.Put("doc", secret, Key, ct);

        Assert.Equal(secret, await objects.Get("doc", Key, ct));
        var manifest = await objects.Manifest("doc", ct);
        Assert.Equal(6, manifest!.Shards.Select(s => s.NodeId).Distinct().Count());
        foreach (var shard in manifest.Shards)
        {
            var bytes = await Node(host, shard.NodeId).Get(shard.Cid, ct);
            Assert.DoesNotContain("secret", Encoding.UTF8.GetString(bytes!), StringComparison.Ordinal);
        }
    }

    [Fact(Timeout = 60_000)]
    public async Task AnObjectStillReadsWithAsManyShardsLostAsThereIsParity()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await StartAsync(8, ct);
        await using var _ = host;
        var data = RandomNumberGenerator.GetBytes(500);
        await objects.Put("doc", data, Key, ct);
        var manifest = (await objects.Manifest("doc", ct))!;
        foreach (var shard in manifest.Shards.Take(2)) { await Node(host, shard.NodeId).Delete(shard.Cid, ct); }

        Assert.Equal(data, await objects.Get("doc", Key, ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task RewritingAnObjectRemovesTheOldVersionsShards()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await StartAsync(8, ct);
        await using var _ = host;
        await objects.Put("doc", [1, 2, 3], Key, ct);
        var old = (await objects.Manifest("doc", ct))!;

        Assert.Equal(2, await objects.Put("doc", [4, 5, 6], Key, ct));

        foreach (var shard in old.Shards) { Assert.Null(await Node(host, shard.NodeId).Get(shard.Cid, ct)); }
        Assert.Equal(new byte[] { 4, 5, 6 }, await objects.Get("doc", Key, ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task TooFewOwnersRefusesTheWriteAndSavesNothing()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await StartAsync(5, ct);
        await using var _ = host;

        await Assert.ThrowsAsync<ServiceUnavailableException>(() => objects.Put("doc", [1], Key, ct));
        Assert.Null(await objects.Manifest("doc", ct));
    }

    [Fact(Timeout = 60_000)]
    public async Task ReadingWithTheWrongKeyFails()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await StartAsync(8, ct);
        await using var _ = host;
        await objects.Put("doc", [1, 2, 3], Key, ct);

        await Assert.ThrowsAnyAsync<CryptographicException>(() => objects.Get("doc", RandomNumberGenerator.GetBytes(32), ct));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*MeshObjectFacts"`
Expected: build FAIL, `IMeshObjects` not found.

- [ ] **Step 3: Implement**

`IMeshObjects.cs`:
```csharp
using System.ComponentModel;
using Orleans.Concurrency;
using ReadOnly = Orleans.Concurrency.ReadOnlyAttribute;

namespace DigitalBrain.Mesh;

// Objects encrypted with the caller's key and scattered as erasure-coded shards. Manifests hold no plaintext and no key.
[Alias("mesh.objects"), Orleans.Metadata.DefaultGrainType("mesh.objects")]
public interface IMeshObjects : INeuron
{
    [Description("Encrypt an object with the given 32-byte key and store it as shards; returns the new version.")]
    Task<long> Put(string objectId, byte[] plaintext, byte[] key, CancellationToken cancellationToken = default);

    [Description("Gather any sufficient set of verified shards, rebuild and decrypt the object; null when unknown.")]
    Task<byte[]?> Get(string objectId, byte[] key, CancellationToken cancellationToken = default);

    [Description("Delete an object and its shards.")]
    Task Delete(string objectId, CancellationToken cancellationToken = default);

    [Description("Where an object's shards are: version, content ids and nodes.")]
    [ReadOnly, AlwaysInterleave]
    Task<ObjectManifestView?> Manifest(string objectId, CancellationToken cancellationToken = default);
}

[GenerateSerializer, Alias("mesh.manifest-view")]
public sealed record ObjectManifestView(
    [property: Id(0)] string ObjectId,
    [property: Id(1)] long Version,
    [property: Id(2)] ShardView[] Shards);

[GenerateSerializer, Alias("mesh.shard-view")]
public sealed record ShardView(
    [property: Id(0)] int Index,
    [property: Id(1)] string Cid,
    [property: Id(2)] string NodeId);
```

`MeshObjectsNeuron.cs` (`ServiceUnavailableException` namespace from Task 5 Step 1):
```csharp
using System.Collections.Concurrent;
using System.Security.Cryptography;
using DigitalBrain.Framework;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Mesh;

[GrainType("mesh.objects")]
internal sealed partial class MeshObjectsNeuron(
    IOptions<MeshOptions> options,
    [PersistentState("mesh.objects", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<MeshObjectsState> store) : Neuron, IMeshObjects
{
    private string NodesKey => this.GetPrimaryKeyString()[..^"/objects".Length] + "/nodes";

    private IStorageNodes Nodes => GrainFactory.GetGrain<IStorageNodes>(NodesKey);

    private IStorageNode Node(string nodeId) => GrainFactory.GetGrain<IStorageNode>(MeshKeys.Node(NodesKey, nodeId));

    public async Task<long> Put(string objectId, byte[] plaintext, byte[] key, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(objectId);
        var previous = store.State.Objects.GetValueOrDefault(objectId);
        var version = (previous?.Version ?? 0) + 1;
        var rs = new ReedSolomon(options.Value.DataShards, options.Value.ParityShards);
        var nodeIds = await Nodes.Place(rs.TotalShards, [], cancellationToken);

        var cipher = ObjectSeal.Seal(key, objectId, version, plaintext, out var nonce);
        var shards = rs.Encode(cipher, out var shardSize);
        var locations = new ShardLocation[rs.TotalShards];
        await Parallel.ForEachAsync(Enumerable.Range(0, rs.TotalShards), cancellationToken, async (i, token) =>
        {
            var cid = StorageProof.ContentId(shards[i]);
            await Node(nodeIds[i]).Put(cid, shards[i], token);
            locations[i] = new ShardLocation { Index = i, Cid = cid, NodeId = nodeIds[i], Challenges = Challenges(shards[i]) };
        });

        store.State.Objects[objectId] = new ObjectManifest
        {
            Version = version, DataShards = rs.DataShards, ParityShards = rs.ParityShards, ShardSize = shardSize,
            CipherLength = cipher.Length, Nonce = nonce, Shards = locations,
        };
        await store.WriteStateAsync(cancellationToken);
        if (previous is not null) { await DeleteShards(previous, cancellationToken); }
        return version;
    }

    public async Task<byte[]?> Get(string objectId, byte[] key, CancellationToken cancellationToken = default)
    {
        if (!store.State.Objects.TryGetValue(objectId, out var manifest)) { return null; }
        var rs = new ReedSolomon(manifest.DataShards, manifest.ParityShards);
        var (shards, _) = await Fetch(manifest, cancellationToken);
        var cipher = rs.Join(rs.Reconstruct(shards, manifest.ShardSize), manifest.CipherLength);
        return ObjectSeal.Open(key, objectId, manifest.Version, manifest.Nonce, cipher);
    }

    public async Task Delete(string objectId, CancellationToken cancellationToken = default)
    {
        if (!store.State.Objects.Remove(objectId, out var manifest)) { return; }
        await store.WriteStateAsync(cancellationToken);
        await DeleteShards(manifest, cancellationToken);
    }

    public Task<ObjectManifestView?> Manifest(string objectId, CancellationToken cancellationToken = default) =>
        Task.FromResult(store.State.Objects.TryGetValue(objectId, out var m)
            ? new ObjectManifestView(objectId, m.Version, m.Shards.Select(s => new ShardView(s.Index, s.Cid, s.NodeId)).ToArray())
            : null);

    // A shard whose bytes do not hash to its cid is an erasure, never data.
    private async Task<(byte[]?[] Shards, int[] Bad)> Fetch(ObjectManifest manifest, CancellationToken cancellationToken)
    {
        var shards = new byte[]?[manifest.Shards.Length];
        var bad = new ConcurrentBag<int>();
        await Parallel.ForEachAsync(manifest.Shards, cancellationToken, async (location, token) =>
        {
            var bytes = await Node(location.NodeId).Get(location.Cid, token);
            if (bytes is null || StorageProof.ContentId(bytes) != location.Cid) { bad.Add(location.Index); }
            else { shards[location.Index] = bytes; }
        });
        return (shards, bad.Order().ToArray());
    }

    private async Task DeleteShards(ObjectManifest manifest, CancellationToken cancellationToken)
    {
        foreach (var shard in manifest.Shards) { await Node(shard.NodeId).Delete(shard.Cid, cancellationToken); }
    }

    private ShardChallenge[] Challenges(byte[] shard) =>
        Enumerable.Range(0, options.Value.ChallengesPerShard).Select(_ =>
        {
            var nonce = RandomNumberGenerator.GetBytes(16);
            return new ShardChallenge { Nonce = nonce, Expected = StorageProof.Compute(nonce, shard) };
        }).ToArray();
}

[GenerateSerializer, Alias("mesh.objects-state")]
internal sealed class MeshObjectsState
{
    [Id(0)] public Dictionary<string, ObjectManifest> Objects { get; set; } = new(StringComparer.Ordinal);
}

[GenerateSerializer, Alias("mesh.manifest")]
internal sealed class ObjectManifest
{
    [Id(0)] public long Version { get; set; }
    [Id(1)] public int DataShards { get; set; }
    [Id(2)] public int ParityShards { get; set; }
    [Id(3)] public int ShardSize { get; set; }
    [Id(4)] public int CipherLength { get; set; }
    [Id(5)] public byte[] Nonce { get; set; } = [];
    [Id(6)] public ShardLocation[] Shards { get; set; } = [];
}

[GenerateSerializer, Alias("mesh.shard-location")]
internal sealed class ShardLocation
{
    [Id(0)] public int Index { get; set; }
    [Id(1)] public string Cid { get; set; } = "";
    [Id(2)] public string NodeId { get; set; } = "";
    [Id(3)] public ShardChallenge[] Challenges { get; set; } = [];
    [Id(4)] public int NextChallenge { get; set; }
}

[GenerateSerializer, Alias("mesh.shard-challenge")]
internal sealed class ShardChallenge
{
    [Id(0)] public byte[] Nonce { get; set; } = [];
    [Id(1)] public byte[] Expected { get; set; } = [];
}
```
Note: `Put` places shards before saving the manifest, so a refused placement (`ServiceUnavailableException`) leaves no manifest — the fact `TooFewOwnersRefusesTheWriteAndSavesNothing` pins it. Check with LSP whether `Neuron` exposes `GrainFactory` and `GetPrimaryKeyString()`; use whatever accessor `Neuron` provides for the grain factory and key.

- [ ] **Step 4: Run to verify it passes**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*MeshObjectFacts"`
Expected: PASS (5 facts).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IMeshObjects.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Objects/MeshObjectsNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/MeshObjectFacts.cs
git commit -m "Mesh: encrypted objects scattered as shards and rebuilt from any k"
```

---

### Task 7: Audit and repair

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IMeshObjects.cs` (add `Audit`, `Repair`, `AuditResult`, `RepairResult`)
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Objects/MeshObjectsNeuron.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/AuditRepairFacts.cs`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces on `IMeshObjects`:
  `Task<AuditResult[]> Audit(string objectId, CancellationToken)` — challenges every holder with its next pre-computed nonce, reports to `IStorageNodes.ReportAudit`;
  `Task<RepairResult> Repair(string objectId, CancellationToken)` — rebuilds shards that are missing, corrupt, on nodes below reputation 0.25 or offline, or whose challenges are exhausted; places them on new nodes excluding current holders; returns moves. Repair never needs the object key: it rebuilds ciphertext shards.
  `record AuditResult(int Index, string NodeId, bool Passed, string Reason)`; `record RepairResult(ShardMove[] Moved)`; `record ShardMove(int Index, string FromNode, string ToNode)`.

- [ ] **Step 1: Write the failing test**

```csharp
using System.Security.Cryptography;
using DigitalBrain.Mesh;

namespace DigitalBrain.Modules.Mesh.Tests;

public sealed class AuditRepairFacts
{
    private static readonly byte[] Key = RandomNumberGenerator.GetBytes(32);

    [Fact(Timeout = 60_000)]
    public async Task ANodeThatThrewAwayItsShardFailsAuditAndRepairMovesIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, nodes) = await MeshObjectFacts.StartAsync(9, ct);
        await using var _ = host;
        var data = RandomNumberGenerator.GetBytes(300);
        await objects.Put("doc", data, Key, ct);
        var lost = (await objects.Manifest("doc", ct))!.Shards[2];
        await MeshObjectFacts.Node(host, lost.NodeId).Delete(lost.Cid, ct);

        var audit = await objects.Audit("doc", ct);
        Assert.Contains(audit, r => r.Index == 2 && !r.Passed && r.Reason == "shard missing");

        var repair = await objects.Repair("doc", ct);
        var move = Assert.Single(repair.Moved);
        Assert.Equal((2, lost.NodeId), (move.Index, move.FromNode));
        Assert.NotEqual(lost.NodeId, move.ToNode);

        await nodes.SetOnline(lost.NodeId, false, ct);
        Assert.Equal(data, await objects.Get("doc", Key, ct));
        Assert.All(await objects.Audit("doc", ct), r => Assert.True(r.Passed, r.Reason));
    }

    [Fact(Timeout = 60_000)]
    public async Task AHealthyObjectNeedsNoRepair()
    {
        var ct = TestContext.Current.CancellationToken;
        var (host, objects, _) = await MeshObjectFacts.StartAsync(8, ct);
        await using var _ = host;
        await objects.Put("doc", [1, 2, 3], Key, ct);

        Assert.Empty((await objects.Repair("doc", ct)).Moved);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests -- --filter-class "*AuditRepairFacts"`
Expected: build FAIL, `Audit` not defined on `IMeshObjects`.

- [ ] **Step 3: Implement**

Add to `IMeshObjects`:
```csharp
    [Description("Challenge every shard holder with a fresh storage proof.")]
    Task<AuditResult[]> Audit(string objectId, CancellationToken cancellationToken = default);

    [Description("Rebuild shards that are missing, corrupt or on unhealthy nodes and move them to healthy nodes.")]
    Task<RepairResult> Repair(string objectId, CancellationToken cancellationToken = default);
```
and records:
```csharp
[GenerateSerializer, Alias("mesh.audit-result")]
public sealed record AuditResult(
    [property: Id(0)] int Index,
    [property: Id(1)] string NodeId,
    [property: Id(2)] bool Passed,
    [property: Id(3)] string Reason);

[GenerateSerializer, Alias("mesh.repair-result")]
public sealed record RepairResult([property: Id(0)] ShardMove[] Moved);

[GenerateSerializer, Alias("mesh.shard-move")]
public sealed record ShardMove(
    [property: Id(0)] int Index,
    [property: Id(1)] string FromNode,
    [property: Id(2)] string ToNode);
```

Add to `MeshObjectsNeuron`:
```csharp
    public async Task<AuditResult[]> Audit(string objectId, CancellationToken cancellationToken = default)
    {
        var manifest = store.State.Objects.GetValueOrDefault(objectId) ?? throw new KeyNotFoundException(objectId);
        var results = new List<AuditResult>();
        foreach (var shard in manifest.Shards)
        {
            if (shard.NextChallenge >= shard.Challenges.Length)
            {
                results.Add(new(shard.Index, shard.NodeId, false, "challenges exhausted"));
                continue;
            }
            var challenge = shard.Challenges[shard.NextChallenge];
            var proof = await Node(shard.NodeId).Prove(shard.Cid, challenge.Nonce, cancellationToken);
            var passed = proof is not null && CryptographicOperations.FixedTimeEquals(proof, challenge.Expected);
            await Nodes.ReportAudit(shard.NodeId, passed, cancellationToken);
            results.Add(new(shard.Index, shard.NodeId, passed, proof is null ? "shard missing" : passed ? "ok" : "wrong proof"));
            shard.NextChallenge++;
        }
        await store.WriteStateAsync(cancellationToken);
        return [.. results];
    }

    public async Task<RepairResult> Repair(string objectId, CancellationToken cancellationToken = default)
    {
        var manifest = store.State.Objects.GetValueOrDefault(objectId) ?? throw new KeyNotFoundException(objectId);
        var (shards, unreadable) = await Fetch(manifest, cancellationToken);
        var health = (await Nodes.List(cancellationToken)).ToDictionary(n => n.NodeId, StringComparer.Ordinal);
        var bad = unreadable
            .Concat(manifest.Shards.Where(s => !health.TryGetValue(s.NodeId, out var n) || !n.Online || n.Reputation < 0.25
                || s.NextChallenge >= s.Challenges.Length).Select(s => s.Index))
            .Distinct().Order().ToArray();
        if (bad.Length == 0) { return new RepairResult([]); }

        var rs = new ReedSolomon(manifest.DataShards, manifest.ParityShards);
        var full = rs.Reconstruct(shards, manifest.ShardSize);
        var targets = await Nodes.Place(bad.Length, manifest.Shards.Select(s => s.NodeId).ToArray(), cancellationToken);

        var moved = new List<ShardMove>();
        var stale = new List<ShardLocation>();
        for (var i = 0; i < bad.Length; i++)
        {
            var old = manifest.Shards[bad[i]];
            var bytes = full[bad[i]];
            var cid = StorageProof.ContentId(bytes);
            await Node(targets[i]).Put(cid, bytes, cancellationToken);
            manifest.Shards[bad[i]] = new ShardLocation { Index = bad[i], Cid = cid, NodeId = targets[i], Challenges = Challenges(bytes) };
            moved.Add(new ShardMove(bad[i], old.NodeId, targets[i]));
            stale.Add(old);
        }
        await store.WriteStateAsync(cancellationToken);
        foreach (var old in stale) { await Node(old.NodeId).Delete(old.Cid, cancellationToken); }
        return new RepairResult([.. moved]);
    }
```
`Place` excludes every current holder, so a repaired shard never lands on a node already holding one of the object's shards. If fewer healthy nodes exist than shards to move, `Place` throws `ServiceUnavailableException` and the manifest stays unchanged.

- [ ] **Step 4: Run the whole module suite**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests`
Expected: all facts from Tasks 1–7 PASS. Kill any run over 5 minutes and debug the hang (never raise timeouts).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh.Contracts/IMeshObjects.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/DigitalBrain.Modules.Mesh/Objects/MeshObjectsNeuron.cs src/DigitalBrain.Modules/DigitalBrain/Mesh/tests/DigitalBrain.Modules.Mesh.Tests/AuditRepairFacts.cs
git commit -m "Mesh: storage-proof audits and repair onto healthy nodes"
```

---

### Task 8: Compose into the OS and verify live

**Files:**
- Modify: the OS catalog that composes modules (find `OsCatalog` with LSP workspace symbol; add `MeshModule` next to the other `DigitalBrain/*` modules the same way they are added) and the OS project's references.

**Interfaces:**
- Consumes: `MeshModule` (Task 1).

- [ ] **Step 1: Add `MeshModule` to `OsCatalog`** following the existing entries, and the project reference in the OS host project. LSP diagnostics clean; build the OS host project.

- [ ] **Step 2: Run the host composition tests**

Run: `dotnet test --project src/DigitalBrain.OS.Tests.Unit` (path via LSP/workspace if it differs)
Expected: PASS.

- [ ] **Step 3: Live check**

Start `dotnet run digitalbrain.cs` from the repo root; `mcp__aspire__list_resources` all Running/Healthy. Through `digitalbrain-mcp`: `neurons_context` (caller and brain), `neurons_search` for `mesh.nodes`; `neurons_call` `IStorageNodes.Register` for 6 seed nodes with distinct owners; `IMeshObjects.Put` an object with a 32-byte key (4+2 configured via `DigitalBrain:Modules:mesh:Options:DataShards=4`, `ParityShards=2` in the AppHost for the check, then removed); `IMeshObjects.Get` returns the bytes; `IMeshObjects.Manifest` shows six distinct nodes. Confirm `list_traces` shows the `mesh.objects` → `mesh.node` calls.

- [ ] **Step 4: Commit**

```bash
git add <the exact OsCatalog file> <the exact OS host csproj>
git commit -m "OS: compose the mesh storage module"
```
