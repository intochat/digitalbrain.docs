# Connections Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A connection neuron owns its credential as sealed grain state; the per-brain registry becomes an index; one Platform OAuth flow ends by calling the connection neuron; webhooks route through index neurons; the vault hop, the forged platform stamps and the OAuth side door are deleted.

**Architecture:** `ConnectionNeuron<TState>` in the Framework ring gives every connector the same credential state, status, access rule and operations (`Connect`, `Probe`, `Disconnect`, `Read`, plus `AcceptGrant` on a `[PlatformOnly]` sibling contract). `ISecretSealer` seals bytes with a per-grain data key wrapped by the existing master key. The Platform ring runs one OAuth login/callback pair for every connector that declares `OAuthMethods`, exchanges codes and refresh tokens through `IOAuthTokenExchange`, and calls the connection neuron. Gmail, Postgres, Supabase, ClickHouse, Salesforce and GitHub each become one connection neuron type.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains, ASP.NET minimal APIs, xUnit v3 facts on `ModuleTest.Create().WithModule<X>()`, Flutter shell (`flutter analyze`, `flutter test`).

**Spec:** `docs/superpowers/specs/2026-10-07-connections-restructure-design.md`

## Deviations from the spec (decided while planning; Task 10 corrects the spec)

- `ConnectionState` is a mutable class (`{ get; set; }`), not a record: the base mutates `Snapshot` on a generic `TState`, where `with` is not available. Module states derive from it as classes.
- `SealedSecret.Ciphertext` is a base64 `string` and `KeyId` is the master-wrapped per-grain data key (`mk3:…`), so every sealed secret is self-describing and `SecretCipher`/`MasterKeyWrapper` are reused unchanged.
- `AcceptGrant` lives on `IConnectionInbound`, a `[PlatformOnly]` sibling of `IConnection`, the way `IGmailInbound` sits beside `IGmail`. Platform-only contracts are excluded from untrusted edges and bypass `NeuronCallFilter`, so the base enforces "only the OAuth callback" itself by checking the stamped owner against the key.
- The ASP.NET `OAuthHandler` subclasses, correlation cookies, `BrowserLogins`, `BrowserLoginSurface`, `BrowserLoginCorrelation` and `BrowserLoginDefinition` are deleted. The Platform implements the redirect and the callback directly: a one-use request id is the OAuth `state`, PKCE verifier and target are kept with the pending request, and the code is exchanged by `OAuthTokenExchange`. `LoginPage` stays for the HTML answers.
- Token exchange and refresh are Platform code (`IOAuthTokenExchange`), not module hooks: Gmail and Salesforce both use the standard `refresh_token` grant. The base's default `RefreshAsync` calls it; GitHub overrides because installation tokens are not OAuth refresh. `GmailTokenExchange`, `SalesforceTokenExchange` and `SalesforceTokenRefresh` go.
- The public origin and test-time token-endpoint overrides are one Platform option, `ConnectionsOptions` at `DigitalBrain:Connections:*`, instead of three per-module `PublicOrigin` options.
- `ISecrets`, `SecretRef`, `SecretReferences`, `SecretsNeuron` and `/secrets` **stay**: LSP shows `FormNeuron.cs:153`, `AppUiEndpoints.cs:91`, `TypeCatalog.cs:96`, the Dart `storeSecret` client and `CanarySecretFacts.AFormSecretTravelsOnlyAsAVaultReference` use the vault for form secrets. Only its role in connections and integrations is removed.
- `IConnectionRequests` (script-facing "request a connection of a kind") **stays**: `ModuleInventory.ContractAssemblies` and `ScriptAccountFacts` depend on it and it never touched the registry. Its `/requests` route moves with the other connection routes.
- Salesforce's `iss` check at the callback is dropped: PKCE, the one-use state and a fixed authorization endpoint cover it, and the Platform callback does not expose the raw query to modules.
- The OAuth login body carries an optional `target` (GitHub needs the repository URL); it reaches the module as `OAuthGrant.Target`.

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`.
- Grain state uses concrete arrays; `SealedSecret[]`, `string[]`. No `IReadOnlyList` in state.
- No `/// <summary>`; inline comments only for what code cannot say.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- LSP (`csharp-ls` over `DigitalBrain-lsp.sln`) `findReferences` before every deletion or signature change; text search only for scripts, Dart, docs, csproj.
- No migrations, no compatibility shims, no legacy aliases; reshape state freely.
- Credential bytes never leave a grain turn: not in `Read`, not in a signal, not in a return value, not in a log.
- No module assembly constructs a `CallerContext`. The Platform ring constructs one only in `OAuthCallback` (stamping the owner recorded at login start) and in `ShippedContentHosting` (pre-existing).
- Never raise a timeout or add polling to make a check pass.
- The branch receives concurrent "framework-structure" commits. Before each task, `git pull --rebase` is not available (local branch); instead run `git log --oneline -5` and re-run LSP on the symbols the task touches before editing.

## Review Focus

1. **A connection's sealed secret must not be readable from storage or from `Read()`.** Pinned in Task 2 (`ConnectSealsTheValueAndTheSnapshotNeverShowsIt`).
2. **A user in brain A must not connect, read, probe or disconnect brain B's connection.** Pinned in Task 2 (`ConnectRequiresAMemberOfTheBrainInTheKey`).
3. **A replayed or forged OAuth callback must not connect anything.** Pinned in Task 3 (`ACallbackWithoutAClaimedRequestIsRefused`, `AStaleLoginRequestCannotBeReplayed`).
4. **A restart between login start and callback must fail closed, not connect the wrong brain.** Pinned in Task 3 (`ACallbackAfterARestartIsRefused`).
5. **A webhook for a repository connected before a restart must still route.** Pinned in Task 7 (`AReactivatedRepositoryStillReceivesWebhooks`).

---

## File structure after the plan

Framework ring (`src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/`):

```
Connections/IConnection.cs            IConnection, IConnectionInbound, ConnectionView, ConnectionStatus, OAuthGrant, Credential, ConnectionProbeResult
Connections/ConnectionNeuron.cs       ConnectionNeuron<TState>
Connections/ConnectionState.cs        ConnectionState, SealedSecret
Connections/ConnectionKeys.cs         For / Parse (moved from Integrations/ConnectorDefinition.cs)
Connections/IConnectionIndex.cs       IConnectionIndex
Connections/ISecretSealer.cs
Connections/IOAuthTokenExchange.cs
Connections/OAuthMethod.cs
Connections/Signals/ConnectionSignals.cs   ConnectionConnected, ConnectionExpired, ConnectionFailing, ConnectionDisconnected
Integrations/ConnectorDefinition.cs   gains OAuthMethods; loses IModuleConnectionCredentials and ConnectionKeys
Integrations/IIntegration.cs, IntegrationSchema.cs                 unchanged
Auth/LoginPage.cs                     stays; the other Auth/ files go
```

Platform ring (`src/DigitalBrain.Platform/DigitalBrain.Platform/`):

```
Connections/ConnectionIndexNeuron.cs
Connections/ConnectionEndpoints.cs
Connections/ConnectionsOptions.cs
Connections/ConnectionsInventoryProvider.cs   (moved from Discovery/)
Connections/OAuth/OAuthLoginRequests.cs       pending logins, in process
Connections/OAuth/OAuthLoginFlow.cs           start: mint request, build authorization URL
Connections/OAuth/OAuthCallback.cs            IHttpSurface: claim, exchange, stamp owner, AcceptGrant
Connections/OAuth/OAuthTokenExchange.cs       IOAuthTokenExchange
Secrets/SecretSealer.cs                       ISecretSealer over SecretCipher + IKeyWrapper
Integrations/IntegrationNeuron.cs             state uses SealedSecret[]; Release opens them itself
Integrations/ModuleIntegrations.cs            ModuleIntegrations<T> + IntegrationHandle only; no forged caller
```

Modules: see Tasks 4 to 7 and Task 9.

Task order keeps every project green at every commit: 1 sealer → 2 base beside the old registry → 3 Platform OAuth and routes beside the old ones → 4 Gmail → 5 Postgres, Supabase, ClickHouse → 6 Salesforce → 7 GitHub → 8 Platform deletions and the architecture rule → 9 shell and old routes → 10 folder moves and spec corrections → 11 seen running.

---

### Task 1: The secret sealer

**Files:**
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Connections/ISecretSealer.cs`
- Create: `src/DigitalBrain.Framework/DigitalBrain.Framework/Platform/Connections/ConnectionState.cs` (only `SealedSecret` in this task)
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Secrets/SecretSealer.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Connections/SecretSealerFacts.cs`
- Modify: `src/DigitalBrain.Platform/DigitalBrain.Platform/Secrets/MasterKeyServiceCollectionExtensions.cs`

**Interfaces:**
- Produces `ISecretSealer { SealedSecret Seal(string name, string plaintext); string Open(SealedSecret secret); }` and `SealedSecret(string Name, string KeyId, string Ciphertext)`.

- [ ] **Step 1: Write the failing facts**

`src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Connections/SecretSealerFacts.cs`:

```csharp
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Platform.Secrets;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Platform.Tests.Unit.Connections;

public sealed class SecretSealerFacts
{
    private static SecretSealer Sealer(string masterKey = "master-key-one")
        => new(new MasterKeyWrapper(Options.Create(new MasterKeyOptions { MasterKey = masterKey })));

    [Fact]
    public void ASealedSecretOpensToTheOriginalAndNeverContainsIt()
    {
        var sealer = Sealer();
        var sealed_ = sealer.Seal("value", "hunter2");
        Assert.Equal("value", sealed_.Name);
        Assert.StartsWith("mk3:", sealed_.KeyId, StringComparison.Ordinal);
        Assert.DoesNotContain("hunter2", sealed_.Ciphertext, StringComparison.Ordinal);
        Assert.DoesNotContain("hunter2", sealed_.KeyId, StringComparison.Ordinal);
        Assert.Equal("hunter2", sealer.Open(sealed_));
    }

    [Fact]
    public void TwoSealsOfTheSameValueDifferAndEachOpens()
    {
        var sealer = Sealer();
        var first = sealer.Seal("value", "same");
        var second = sealer.Seal("value", "same");
        Assert.NotEqual(first.Ciphertext, second.Ciphertext);
        Assert.NotEqual(first.KeyId, second.KeyId);
        Assert.Equal("same", sealer.Open(first));
        Assert.Equal("same", sealer.Open(second));
    }

    [Fact]
    public void ADifferentMasterKeyCannotOpenTheSecret()
    {
        var sealed_ = Sealer("master-key-one").Seal("value", "hunter2");
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => Sealer("master-key-two").Open(sealed_));
    }

    [Fact]
    public void SealingRefusesAnEmptyValue()
        => Assert.Throws<ArgumentException>(() => Sealer().Seal("value", ""));
}
```

- [ ] **Step 2: Run them and watch them fail to compile**

```bash
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*SecretSealerFacts*"
```

Expected: build error, `ISecretSealer`, `SealedSecret` and `SecretSealer` do not exist.

- [ ] **Step 3: Write the contract and the record**

`Platform/Connections/ISecretSealer.cs`:

```csharp
namespace DigitalBrain.Framework.Platform.Connections;

// Seals credential bytes for grain state. Every sealed secret carries its own master-wrapped data
// key, so storage holds ciphertext only and rotation is "re-seal on the next successful call".
public interface ISecretSealer
{
    SealedSecret Seal(string name, string plaintext);
    string Open(SealedSecret secret);
}
```

`Platform/Connections/ConnectionState.cs` (the rest of the file arrives in Task 2):

```csharp
namespace DigitalBrain.Framework.Platform.Connections;

[GenerateSerializer, Alias("sealed-secret")]
public sealed record SealedSecret(
    [property: Id(0)] string Name,
    [property: Id(1)] string KeyId,
    [property: Id(2)] string Ciphertext);
```

- [ ] **Step 4: Write the sealer**

`src/DigitalBrain.Platform/DigitalBrain.Platform/Secrets/SecretSealer.cs`:

```csharp
using DigitalBrain.Framework.Platform.Connections;

namespace DigitalBrain.Platform.Secrets;

internal sealed class SecretSealer(IKeyWrapper keys) : ISecretSealer
{
    public SealedSecret Seal(string name, string plaintext)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrEmpty(plaintext);
        var key = SecretCipher.NewKey();
        return new SealedSecret(name, keys.Wrap(key), SecretCipher.Seal(key, plaintext));
    }

    public string Open(SealedSecret secret)
    {
        ArgumentNullException.ThrowIfNull(secret);
        return SecretCipher.Open(keys.Unwrap(secret.KeyId), secret.Ciphertext);
    }
}
```

In `MasterKeyServiceCollectionExtensions.AddMasterKeyWrapper`, after `services.TryAddSingleton<IKeyWrapper, MasterKeyWrapper>();` add `services.TryAddSingleton<ISecretSealer, SecretSealer>();` with `using DigitalBrain.Framework.Platform.Connections;`.

- [ ] **Step 5: Build and run**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*SecretSealerFacts*"
```

Expected: four facts pass.

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Framework src/DigitalBrain.Platform
git commit -m "Platform: ISecretSealer seals credential bytes with a per-secret data key under the master key"
```

---

### Task 2: The connection base, the index and the signals, beside the old registry

**Files:**
- Create: `Platform/Connections/IConnection.cs`, `ConnectionNeuron.cs`, `ConnectionKeys.cs`, `IConnectionIndex.cs`, `Signals/ConnectionSignals.cs` (Framework)
- Modify: `Platform/Connections/ConnectionState.cs` (add `ConnectionState`)
- Modify: `Platform/Integrations/ConnectorDefinition.cs` (remove `ConnectionKeys`; keep `IModuleConnectionCredentials` until Task 8)
- Modify: `Callers/NeuronAccess.cs:17` (`using DigitalBrain.Framework.Platform.Connections;`, same call)
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform/Connections/ConnectionIndexNeuron.cs`
- Create: `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Connections/ConnectionNeuronFacts.cs`, `ConnectionIndexFacts.cs`, `ExampleConnectionModule.cs`
- Modify: callers of `ConnectionKeys` found by LSP: `ModuleIntegrations.cs:59,78,97`, `PostgresServerNeuron.cs:49`, `GmailNeuron.cs:28,38`, `GmailModule.cs:75`, and the test files `GmailConnectedFacts.cs`, `MailReceivedFacts.cs`, `GmailConfiguredRegistrationFacts.cs`, `GmailWatchWebhookFacts.cs`, `ConnectionPostgresFacts.cs`, `ConnectorBindingFacts.cs` (only the `using`)

**Interfaces:**
- Produces: everything in the Framework `Connections/` folder listed above; `IConnectionIndex` at key `{brainScope}/connections`.

- [ ] **Step 1: Write the contracts**

`Platform/Connections/IConnection.cs`:

```csharp
using Orleans.Concurrency;

namespace DigitalBrain.Framework.Platform.Connections;

public enum ConnectionStatus
{
    Connected = 0,
    Expired = 1,
    Failing = 2,
    Disconnected = 3,
}

// The connector's edge neuron is the connection: keyed connection/{brain}/{connector}/{id}, it owns
// its credential as sealed state. The shell, the assistant and module tools talk to this face.
[Alias("connection")]
public interface IConnection : INeuron
{
    [ReadOnly] Task<ConnectionView> Read();
    Task<ConnectionView> Connect(string authMethodId, string value);
    Task<ConnectionView> Probe();
    Task Disconnect();
}

// Reached only by the Platform OAuth callback, which stamps the owner recorded at login start.
[PlatformOnly, Alias("connection.inbound")]
public interface IConnectionInbound : INeuron
{
    Task<ConnectionView> AcceptGrant(OAuthGrant grant);
}

[GenerateSerializer, Alias("connection.view")]
public sealed record ConnectionView(
    [property: Id(0)] string ConnectorId,
    [property: Id(1)] string ConnectionId,
    [property: Id(2)] string AuthMethodId,
    [property: Id(3)] ConnectionStatus Status,
    [property: Id(4)] string? Account,
    [property: Id(5)] DateTimeOffset? ExpiresAt,
    [property: Id(6)] DateTimeOffset? LastProbedAt,
    [property: Id(7)] string? Detail);

// The token response, parsed by the Platform. Target is what the user asked to connect (a repository
// URL, an instance); Response is the raw token JSON for the module's own parsing.
[GenerateSerializer, Alias("connection.oauth-grant")]
public sealed record OAuthGrant(
    [property: Id(0)] string AuthMethodId,
    [property: Id(1)] string AccessToken,
    [property: Id(2)] string? RefreshToken,
    [property: Id(3)] DateTimeOffset? ExpiresAt,
    [property: Id(4)] string Scopes,
    [property: Id(5)] string? Target,
    [property: Id(6)] string Response)
{
    private bool PrintMembers(System.Text.StringBuilder builder) => builder.Append("<redacted>") is not null;
}

// Opened secret, alive for one provider call inside the grain turn.
public sealed record Credential(string Value, string? Refresh)
{
    private bool PrintMembers(System.Text.StringBuilder builder) => builder.Append("<redacted>") is not null;
}

public enum ConnectionProbeOutcome { Connected = 0, Expired = 1, Failing = 2 }

[GenerateSerializer, Alias("connection.probe-result")]
public sealed record ConnectionProbeResult([property: Id(0)] ConnectionProbeOutcome Outcome, [property: Id(1)] string Detail)
{
    public static ConnectionProbeResult Connected(string detail = "The connector probe succeeded.") => new(ConnectionProbeOutcome.Connected, detail);
    public static ConnectionProbeResult Expired(string detail) => new(ConnectionProbeOutcome.Expired, detail);
    public static ConnectionProbeResult Failing(string detail) => new(ConnectionProbeOutcome.Failing, detail);
}
```

Delete the old `ConnectionProbeResult`/`ConnectionProbeOutcome` from `Platform/Integrations/Accounts/ConnectionProbe.cs` only in Task 8; until then the Platform ring's old probe keeps its own copy in its own namespace, and no file imports both.

`Platform/Connections/ConnectionState.cs` (append):

```csharp
// Mutable on purpose: the base mutates the generic TState in place and writes it.
[GenerateSerializer, Alias("connection.state")]
public class ConnectionState
{
    [Id(0)] public string AuthMethodId { get; set; } = "";
    [Id(1)] public ConnectionStatus Status { get; set; } = ConnectionStatus.Disconnected;
    [Id(2)] public SealedSecret[] Secrets { get; set; } = [];
    [Id(3)] public string? Account { get; set; }
    [Id(4)] public string Scopes { get; set; } = "";
    [Id(5)] public DateTimeOffset? ExpiresAt { get; set; }
    [Id(6)] public DateTimeOffset? LastProbedAt { get; set; }
    [Id(7)] public string? Detail { get; set; }
}
```

`Platform/Connections/ConnectionKeys.cs`: move the `ConnectionKeys` class verbatim from `Integrations/ConnectorDefinition.cs` into namespace `DigitalBrain.Framework.Platform.Connections`, and add:

```csharp
    public const string Prefix = "connection/";
    public static bool Is(string key) => key.StartsWith(Prefix, StringComparison.Ordinal);
```

`Platform/Connections/IConnectionIndex.cs`:

```csharp
namespace DigitalBrain.Framework.Platform.Connections;

// One per brain, keyed by the brain scope id: the keys of its connection neurons, nothing else.
[PlatformOnly, Alias("connection.index"), Orleans.Metadata.DefaultGrainType("connection.index")]
public interface IConnectionIndex : INeuron
{
    Task<string[]> List();
    Task Track(string connectionKey);
    Task Untrack(string connectionKey);
}
```

`Platform/Connections/Signals/ConnectionSignals.cs`:

```csharp
namespace DigitalBrain.Framework.Platform.Connections.Signals;

[GenerateSerializer, Alias("connection.connected")]
public sealed record ConnectionConnected([property: Id(0)] string ConnectorId, [property: Id(1)] string ConnectionId, [property: Id(2)] string AuthMethodId, [property: Id(3)] string? Account) : Signal;

[GenerateSerializer, Alias("connection.expired")]
public sealed record ConnectionExpired([property: Id(0)] string ConnectorId, [property: Id(1)] string ConnectionId) : Signal;

[GenerateSerializer, Alias("connection.failing")]
public sealed record ConnectionFailing([property: Id(0)] string ConnectorId, [property: Id(1)] string ConnectionId, [property: Id(2)] string Detail) : Signal;

[GenerateSerializer, Alias("connection.disconnected")]
public sealed record ConnectionDisconnected([property: Id(0)] string ConnectorId, [property: Id(1)] string ConnectionId) : Signal;
```

The Platform's old `ConnectionSignals.cs` declares a `ConnectionDisconnected` in `DigitalBrain.Platform.Integrations.Accounts`; it is deleted in Task 8. No file imports both namespaces before then.

- [ ] **Step 2: Write the failing base facts**

`src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Connections/ExampleConnectionModule.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Framework.Platform.Integrations;
using Orleans.Hosting;

namespace DigitalBrain.Platform.Tests.Unit.Connections;

// A connector whose probe is scripted by the fact: the value "expired" probes Expired, "broken" Failing.
public sealed class ExampleConnectionModule() : Module(new ModuleId("example"))
{
    public static ConnectorDefinition Connector => new("example", "Example", ["api-key"], []) { Neurons = [typeof(IExample)] };
    public override void Configure(ISiloBuilder silo) { }
}

[Alias("example"), Orleans.Metadata.DefaultGrainType("example")]
public interface IExample : INeuron
{
    Task<string> Echo();
    Task<string> SeenValue();
}

[GenerateSerializer, Alias("example.state")]
public sealed class ExampleState : ConnectionState
{
    [Id(8)] public int ProbeCount { get; set; }
}

[GrainType("example")]
internal sealed class ExampleConnectionNeuron(
    [PersistentState("example", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<ExampleState> store)
    : ConnectionNeuron<ExampleState>(store), IExample
{
    private string? _seen;

    protected override Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct)
    {
        Snapshot.ProbeCount++;
        _seen = credential.Value;
        return Task.FromResult(credential.Value switch
        {
            "expired" => ConnectionProbeResult.Expired("expired by script"),
            "broken" => ConnectionProbeResult.Failing("broken by script"),
            _ => ConnectionProbeResult.Connected(),
        });
    }

    public Task<string> Echo() => UseCredentialAsync((credential, _) => Task.FromResult("len:" + credential.Value.Length), CancellationToken.None);
    public Task<string> SeenValue() => Task.FromResult(_seen ?? "");
}
```

`src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit/Connections/ConnectionNeuronFacts.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Framework.Platform.Connections.Signals;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.DependencyInjection;
using Orleans.Storage;

namespace DigitalBrain.Platform.Tests.Unit.Connections;

public sealed class ConnectionNeuronFacts
{
    private static readonly CallerContext Alice = new() { PrincipalId = "alice", AccountId = "alice", BrainId = "home", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp };
    private static string Scope => BrainScope.Create("alice", "home").Id;
    private static string Key(string id = "one") => ConnectionKeys.For(Scope, "example", id);

    private static Task<ModuleBrain> Start() => ModuleTest.Create().WithModule<ExampleConnectionModule>().StartAsync(TestContext.Current.CancellationToken);

    private static void Stamp(CallerContext caller) => CallerContextStamper.Stamp(caller);
    private static void Clear() => Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);

    [Fact]
    public async Task ConnectSealsTheValueAndTheSnapshotNeverShowsIt()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Start();
        Stamp(Alice);
        await brain.AuthorizeCallerAsync();
        try
        {
            var connection = brain.Get<IConnection>(Key());
            var view = await connection.Connect("api-key", "hunter2");
            Assert.Equal(ConnectionStatus.Connected, view.Status);
            Assert.Equal("api-key", view.AuthMethodId);
            Assert.DoesNotContain("hunter2", System.Text.Json.JsonSerializer.Serialize(view), StringComparison.Ordinal);
            Assert.Equal("len:7", await brain.Get<IExample>(Key()).Echo());
            Assert.Equal("hunter2", await brain.Get<IExample>(Key()).SeenValue());
            var storage = brain.SiloServices.GetRequiredKeyedService<IGrainStorage>("Default");
            var state = new GrainState<ExampleState>();
            await storage.ReadStateAsync("example", brain.Get<IExample>(Key()).GetGrainId(), state);
            var sealed_ = Assert.Single(state.State.Secrets);
            Assert.Equal("value", sealed_.Name);
            Assert.DoesNotContain("hunter2", sealed_.Ciphertext, StringComparison.Ordinal);
        }
        finally { Clear(); }
    }

    [Fact]
    public async Task ConnectRequiresAMemberOfTheBrainInTheKey()
    {
        await using var brain = await Start();
        Stamp(Alice with { BrainId = "other" });
        await brain.AuthorizeCallerAsync();
        try
        {
            await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(() => brain.Get<IConnection>(Key()).Connect("api-key", "x"));
            Stamp(Alice with { Kind = CallerKind.App, StampedBy = TrustedEdge.AppProxy, AppId = "app" });
            await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(() => brain.Get<IConnection>(Key()).Connect("api-key", "x"));
        }
        finally { Clear(); }
    }

    [Fact]
    public async Task AcceptGrantIsOnlyReachableWithTheOwnerStampOfTheKeysBrain()
    {
        await using var brain = await Start();
        var grant = new OAuthGrant("oauth", "access", "refresh", DateTimeOffset.UtcNow.AddHours(1), "scope", null, "{}");
        Stamp(Alice with { BrainId = "other" });
        try
        {
            await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(() => brain.Grains.GetGrain<IConnectionInbound>(Key()).AcceptGrant(grant));
            Stamp(Alice);
            var view = await brain.Grains.GetGrain<IConnectionInbound>(Key()).AcceptGrant(grant);
            Assert.Equal(ConnectionStatus.Connected, view.Status);
            Assert.Equal(grant.ExpiresAt, view.ExpiresAt);
        }
        finally { Clear(); }
    }

    [Fact]
    public async Task ProbeMovesStatusAndPublishesExactlyOneSignalPerTransition()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Start();
        Stamp(Alice);
        await brain.AuthorizeCallerAsync();
        try
        {
            var connection = brain.Get<IConnection>(Key());
            await using var expired = await brain.Observe<ConnectionExpired>(connection, ct);
            await using var failing = await brain.Observe<ConnectionFailing>(connection, ct);
            await using var connected = await brain.Observe<ConnectionConnected>(connection, ct);
            await connection.Connect("api-key", "expired");
            Assert.Equal("one", (await connected.NextAsync(ct: ct)).ConnectionId);
            Assert.Equal(ConnectionStatus.Expired, (await connection.Probe()).Status);
            Assert.Equal("one", (await expired.NextAsync(ct: ct)).ConnectionId);
            await connection.Connect("api-key", "broken");
            await connected.NextAsync(ct: ct);
            Assert.Equal(ConnectionStatus.Failing, (await connection.Probe()).Status);
            Assert.Equal("broken by script", (await failing.NextAsync(ct: ct)).Detail);
            await connection.Connect("api-key", "fine");
            await connected.NextAsync(ct: ct);
            Assert.Equal(ConnectionStatus.Connected, (await connection.Probe()).Status);
        }
        finally { Clear(); }
    }

    [Fact]
    public async Task DisconnectClearsSecretsAndUntracksTheKey()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Start();
        Stamp(Alice);
        await brain.AuthorizeCallerAsync();
        try
        {
            var connection = brain.Get<IConnection>(Key());
            await connection.Connect("api-key", "hunter2");
            Assert.Equal([Key()], await brain.Grains.GetGrain<IConnectionIndex>(Scope).List());
            await using var disconnected = await brain.Observe<ConnectionDisconnected>(connection, ct);
            await connection.Disconnect();
            await disconnected.NextAsync(ct: ct);
            Assert.Equal(ConnectionStatus.Disconnected, (await connection.Read()).Status);
            Assert.Empty(await brain.Grains.GetGrain<IConnectionIndex>(Scope).List());
            await Assert.ThrowsAsync<InvalidOperationException>(() => brain.Get<IExample>(Key()).Echo());
        }
        finally { Clear(); }
    }

    [Fact]
    public async Task ConnectRefusesAnAuthMethodTheConnectorDoesNotDeclare()
    {
        await using var brain = await Start();
        Stamp(Alice);
        await brain.AuthorizeCallerAsync();
        try { await Assert.ThrowsAsync<ArgumentException>(() => brain.Get<IConnection>(Key()).Connect("oauth", "x")); }
        finally { Clear(); }
    }
}
```

`ConnectionIndexFacts.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Testing.Module;

namespace DigitalBrain.Platform.Tests.Unit.Connections;

public sealed class ConnectionIndexFacts
{
    [Fact]
    public async Task TheIndexListsOnlyItsOwnBrainsKeysOnceEach()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var mine = brain.Grains.GetGrain<IConnectionIndex>("alice/home");
        var theirs = brain.Grains.GetGrain<IConnectionIndex>("bob/home");
        await mine.Track(ConnectionKeys.For("alice/home", "example", "one"));
        await mine.Track(ConnectionKeys.For("alice/home", "example", "one"));
        await theirs.Track(ConnectionKeys.For("bob/home", "example", "one"));
        Assert.Equal([ConnectionKeys.For("alice/home", "example", "one")], await mine.List());
        await mine.Untrack(ConnectionKeys.For("alice/home", "example", "one"));
        Assert.Empty(await mine.List());
        Assert.Single(await theirs.List());
    }

    [Fact]
    public async Task TheIndexRefusesAKeyFromAnotherBrain()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        await Assert.ThrowsAsync<ArgumentException>(() => brain.Grains.GetGrain<IConnectionIndex>("alice/home").Track(ConnectionKeys.For("bob/home", "example", "one")));
    }
}
```

- [ ] **Step 3: Run and watch them fail to compile**

```bash
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*ConnectionNeuronFacts*" --filter-class "*ConnectionIndexFacts*"
```

Expected: `ConnectionNeuron<TState>` and `IConnectionIndex` missing.

- [ ] **Step 4: Write the base neuron**

`Platform/Connections/ConnectionNeuron.cs`:

```csharp
using DigitalBrain.Framework.Platform.Connections.Signals;
using DigitalBrain.Framework.Platform.Integrations;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Framework.Platform.Connections;

// Every connector's connection neuron derives from this. The credential is sealed state; the hooks
// receive it opened for one provider call inside the grain turn and never return it.
public abstract class ConnectionNeuron<TState>(IPersistentState<TState> store) : Neuron<TState>(store), IConnection, IConnectionInbound
    where TState : ConnectionState
{
    private const string ValueSecret = "value";
    private const string AccessSecret = "access";
    private const string RefreshSecret = "refresh";
    private static readonly TimeSpan RefreshLead = TimeSpan.FromSeconds(30);

    private (string Brain, string Connector, string Connection)? _key;
    protected (string Brain, string Connector, string Connection) Key => _key ??= ConnectionKeys.Parse(this.GetPrimaryKeyString());

    private ISecretSealer Sealer => ServiceProvider.GetRequiredService<ISecretSealer>();
    private TimeProvider Clock => ServiceProvider.GetRequiredService<TimeProvider>();
    private ConnectorDefinition Connector => ServiceProvider.GetRequiredService<IReadOnlyList<ConnectorDefinition>>()
        .FirstOrDefault(c => c.Id == Key.Connector) ?? throw new InvalidOperationException($"No composed module declares connector '{Key.Connector}'.");

    // The module answers: does this credential still work?
    protected abstract Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct);

    // The module may parse provider fields (instance url, mailbox) and refuse a grant.
    protected virtual Task<OAuthGrant> AcceptGrantAsync(OAuthGrant grant) => Task.FromResult(grant);

    // Standard refresh_token grant through the Platform; GitHub overrides.
    protected virtual Task<OAuthGrant> RefreshAsync(Credential credential, CancellationToken ct)
        => credential.Refresh is null
            ? throw new InvalidOperationException("The connection has no refresh token.")
            : ServiceProvider.GetRequiredService<IOAuthTokenExchange>().RefreshAsync(Key.Connector, Snapshot.AuthMethodId, credential.Refresh, ct);

    protected virtual Task OnConnectedAsync() => Task.CompletedTask;
    protected virtual Task OnDisconnectedAsync() => Task.CompletedTask;

    public Task<ConnectionView> Read() => Task.FromResult(View());

    public async Task<ConnectionView> Connect(string authMethodId, string value)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(value);
        RequireMember();
        if (!Connector.AuthMethods.Contains(authMethodId, StringComparer.Ordinal))
        { throw new ArgumentException($"Connector '{Key.Connector}' does not offer authentication method '{authMethodId}'."); }
        Snapshot.AuthMethodId = authMethodId;
        Snapshot.Secrets = [Sealer.Seal(ValueSecret, value)];
        Snapshot.ExpiresAt = null;
        Snapshot.Scopes = "";
        await Transition(ConnectionStatus.Connected, null);
        await Track();
        await OnConnectedAsync();
        return View();
    }

    public async Task<ConnectionView> AcceptGrant(OAuthGrant grant)
    {
        ArgumentNullException.ThrowIfNull(grant);
        RequireMember();
        if (!Connector.AuthMethods.Contains(grant.AuthMethodId, StringComparer.Ordinal))
        { throw new ArgumentException($"Connector '{Key.Connector}' does not offer authentication method '{grant.AuthMethodId}'."); }
        // The module's override sets Snapshot.Account (mailbox, instance url, owner/repo) and may throw.
        var accepted = await AcceptGrantAsync(grant);
        Seal(accepted);
        Snapshot.AuthMethodId = accepted.AuthMethodId;
        await Transition(ConnectionStatus.Connected, null);
        await Track();
        await OnConnectedAsync();
        return View();
    }

    public async Task<ConnectionView> Probe()
    {
        RequireMember();
        if (Snapshot.Status == ConnectionStatus.Disconnected) { throw new InvalidOperationException("The connection is not configured."); }
        ConnectionProbeResult result;
        try { result = await ProbeAsync(Open(), CancellationToken.None); }
        catch (Exception error) when (error is not OperationCanceledException) { result = ConnectionProbeResult.Failing(error.Message); }
        Snapshot.LastProbedAt = Clock.GetUtcNow();
        await Transition(result.Outcome switch
        {
            ConnectionProbeOutcome.Connected => ConnectionStatus.Connected,
            ConnectionProbeOutcome.Expired => ConnectionStatus.Expired,
            _ => ConnectionStatus.Failing,
        }, result.Detail);
        return View();
    }

    public async Task Disconnect()
    {
        RequireMember();
        // The hook runs while Account is still known, so an index keyed by it can be cleaned.
        await OnDisconnectedAsync();
        Snapshot.Secrets = [];
        Snapshot.ExpiresAt = null;
        Snapshot.Account = null;
        await Transition(ConnectionStatus.Disconnected, null);
        await ServiceProvider.GetRequiredService<IGrainFactory>().GetGrain<IConnectionIndex>(Key.Brain).Untrack(this.GetPrimaryKeyString());
    }

    // Opens the credential for one call; refreshes first when the access token is about to expire.
    protected async Task<T> UseCredentialAsync<T>(Func<Credential, CancellationToken, Task<T>> call, CancellationToken ct)
    {
        if (Snapshot.Status == ConnectionStatus.Disconnected || Snapshot.Secrets.Length == 0)
        { throw new InvalidOperationException($"{Key.Connector}/{Key.Connection} is not connected."); }
        var credential = Open();
        if (Snapshot.ExpiresAt is { } expiry && expiry <= Clock.GetUtcNow() + RefreshLead && credential.Refresh is not null)
        {
            var refreshed = await RefreshAsync(credential, ct);
            Seal(refreshed);
            await Transition(ConnectionStatus.Connected, null);
            credential = Open();
        }
        return await call(credential, ct);
    }

    protected Task MarkExpired(string detail) => Transition(ConnectionStatus.Expired, detail);
    protected Task MarkFailing(string detail) => Transition(ConnectionStatus.Failing, detail);

    private Credential Open()
    {
        string? value = null, refresh = null;
        foreach (var secret in Snapshot.Secrets)
        {
            if (secret.Name is ValueSecret or AccessSecret) { value = Sealer.Open(secret); }
            else if (secret.Name == RefreshSecret) { refresh = Sealer.Open(secret); }
        }
        return new(value ?? throw new InvalidOperationException("The connection holds no credential."), refresh);
    }

    private void Seal(OAuthGrant grant)
    {
        Snapshot.Secrets = grant.RefreshToken is null
            ? [Sealer.Seal(AccessSecret, grant.AccessToken)]
            : [Sealer.Seal(AccessSecret, grant.AccessToken), Sealer.Seal(RefreshSecret, grant.RefreshToken)];
        Snapshot.ExpiresAt = grant.ExpiresAt;
        Snapshot.Scopes = grant.Scopes;
    }

    // One function moves status and publishes, so no module can publish a status it did not persist.
    // Every operation that calls it publishes exactly one signal, even when the status repeats.
    private Task Transition(ConnectionStatus status, string? detail)
    {
        Snapshot.Status = status;
        Snapshot.Detail = detail;
        Signal signal = status switch
        {
            ConnectionStatus.Connected => new ConnectionConnected(Key.Connector, Key.Connection, Snapshot.AuthMethodId, Snapshot.Account),
            ConnectionStatus.Expired => new ConnectionExpired(Key.Connector, Key.Connection),
            ConnectionStatus.Failing => new ConnectionFailing(Key.Connector, Key.Connection, detail ?? ""),
            _ => new ConnectionDisconnected(Key.Connector, Key.Connection),
        };
        return Save(Snapshot, signal);
    }

    private Task Track() => ServiceProvider.GetRequiredService<IGrainFactory>().GetGrain<IConnectionIndex>(Key.Brain).Track(this.GetPrimaryKeyString());

    // Members of the brain named in the key; never an installed app.
    private void RequireMember()
    {
        var caller = CallerContextStamper.Require();
        if (caller.Kind == CallerKind.App || caller.StampedBy == TrustedEdge.AppProxy
            || BrainScope.Create(caller.AccountId, caller.BrainId).Id != Key.Brain)
        { throw new UnauthorizedAccessException($"Only a member of the owning brain can manage connection {Key.Connector}/{Key.Connection}."); }
    }

    private ConnectionView View() => new(Key.Connector, Key.Connection, Snapshot.AuthMethodId, Snapshot.Status, Snapshot.Account, Snapshot.ExpiresAt, Snapshot.LastProbedAt, Snapshot.Detail);
}
```

If `GetRequiredKeyedService<IGrainStorage>("Default")` does not resolve in the fact, use `brain.SiloServices.GetKeyedService<IGrainStorage>(DigitalBrainNames.DefaultGrainStorage)`; the storage name constant is the one `[PersistentState]` uses.

`Platform/Connections/IOAuthTokenExchange.cs` (needed by the base now, implemented in Task 3):

```csharp
namespace DigitalBrain.Framework.Platform.Connections;

public interface IOAuthTokenExchange
{
    Task<OAuthGrant> ExchangeCodeAsync(string connectorId, string authMethodId, string code, string codeVerifier, string redirectUri, string? target, CancellationToken ct);
    Task<OAuthGrant> RefreshAsync(string connectorId, string authMethodId, string refreshToken, CancellationToken ct);
}
```

`NeuronAccess.ForBrainKey` already returns the brain scope for `connection/` keys, so `NeuronCallFilter` enforces brain membership for `IConnection` and the module face; `RequireMember` adds the app refusal and guards `IConnectionInbound`, which the filter skips.

- [ ] **Step 5: Write the index neuron**

`src/DigitalBrain.Platform/DigitalBrain.Platform/Connections/ConnectionIndexNeuron.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;

namespace DigitalBrain.Platform.Connections;

[GenerateSerializer, Alias("connection.index-state")]
internal sealed class ConnectionIndexState
{
    [Id(0)] public string[] Keys { get; set; } = [];
}

[GrainType("connection.index")]
internal sealed class ConnectionIndexNeuron(
    [PersistentState("connections", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<ConnectionIndexState> store)
    : Neuron<ConnectionIndexState>(store), IConnectionIndex
{
    public Task<string[]> List() => Task.FromResult<string[]>([.. Snapshot.Keys]);

    public async Task Track(string connectionKey)
    {
        Require(connectionKey);
        if (Snapshot.Keys.Contains(connectionKey, StringComparer.Ordinal)) { return; }
        Snapshot.Keys = [.. Snapshot.Keys, connectionKey];
        await store.WriteStateAsync();
    }

    public async Task Untrack(string connectionKey)
    {
        Require(connectionKey);
        if (!Snapshot.Keys.Contains(connectionKey, StringComparer.Ordinal)) { return; }
        Snapshot.Keys = [.. Snapshot.Keys.Where(key => key != connectionKey)];
        await store.WriteStateAsync();
    }

    private void Require(string connectionKey)
    {
        if (ConnectionKeys.Parse(connectionKey).BrainId != this.GetPrimaryKeyString())
        { throw new ArgumentException("The connection belongs to another brain.", nameof(connectionKey)); }
    }
}
```

- [ ] **Step 6: Move `ConnectionKeys` callers**

Delete `ConnectionKeys` from `Integrations/ConnectorDefinition.cs`. At each LSP-listed caller add `using DigitalBrain.Framework.Platform.Connections;`: `Callers/NeuronAccess.cs`, `Platform/Integrations/ModuleIntegrations.cs`, `Postgres/…/PostgresServerNeuron.cs`, `Gmail/…/GmailNeuron.cs`, `Gmail/…/GmailModule.cs`, and the six test files listed in the task header. No behavior changes.

- [ ] **Step 7: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet build src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail/DigitalBrain.Modules.Google.Gmail.csproj
dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
```

Expected: all green; the old registry facts still pass untouched.

```bash
git add src/DigitalBrain.Framework src/DigitalBrain.Platform src/DigitalBrain.Modules/Google/Gmail src/DigitalBrain.Modules/Postgres
git commit -m "Framework: ConnectionNeuron owns a sealed credential; a per-brain index lists connection keys"
```

---

### Task 3: The Platform OAuth flow, token exchange and the new connection routes

**Files:**
- Create: `Platform/Connections/OAuthMethod.cs` (Framework); modify `Integrations/ConnectorDefinition.cs` (add `OAuthMethods`)
- Create (Platform): `Connections/ConnectionsOptions.cs`, `Connections/OAuth/OAuthLoginRequests.cs`, `Connections/OAuth/OAuthLoginFlow.cs`, `Connections/OAuth/OAuthCallback.cs`, `Connections/OAuth/OAuthTokenExchange.cs`, `Connections/ConnectionEndpoints.cs` (new file; the old `Integrations/Accounts/ConnectionEndpoints.cs` stays until Task 9)
- Modify: `PlatformHosting.cs` (registrations, `MapConnectionNeurons()`), `ConnectorDiscovery.Validate` (validate OAuth methods)
- Create: `DigitalBrain.Platform.Tests.Unit/Connections/OAuthFlowFacts.cs`, `Connections/TokenEndpointStub.cs` (copied from Gmail's test stub)
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/ConfigurationKeyFacts.cs` owner baseline (add `DigitalBrain:Connections`), if the fact refuses the new key

**Interfaces:**
- Produces: `OAuthMethod(string Id, string AuthorizationEndpoint, string TokenEndpoint, string[] Scopes, string IntegrationId, string ClientIdField = "ClientId", string ClientSecretField = "ClientSecret", bool Pkce = true)`; `ConnectionsOptions { Uri? PublicOrigin; Dictionary<string,string> TokenEndpoints }` at `DigitalBrain:Connections`; routes `GET /brains/{b}/connections`, `POST /brains/{b}/connections/{cid}/connect|probe|disconnect|login`, `GET /connections/oauth/{connector}/callback`.

- [ ] **Step 1: Declare OAuth methods on the connector**

`Platform/Connections/OAuthMethod.cs`:

```csharp
namespace DigitalBrain.Framework.Platform.Connections;

// One browser-authorized method of a connector. The client id and secret live in the named
// Integration; the Platform owns the redirect, the callback, the code exchange and refresh.
public sealed record OAuthMethod(
    string Id,
    string AuthorizationEndpoint,
    string TokenEndpoint,
    string[] Scopes,
    string IntegrationId,
    string ClientIdField = "ClientId",
    string ClientSecretField = "ClientSecret",
    bool Pkce = true)
{
    // Extra query parameters on the authorization URL (Google's access_type=offline).
    public Dictionary<string, string> AuthorizationParameters { get; init; } = new(StringComparer.Ordinal);
}
```

In `ConnectorDefinition` add `public OAuthMethod[] OAuthMethods { get; init; } = [];`. In `ConnectorDiscovery.Validate`, after the auth-method check:

```csharp
            foreach (var method in connector.OAuthMethods)
            {
                if (!connector.AuthMethods.Contains(method.Id, StringComparer.Ordinal))
                { throw new InvalidOperationException($"Connector '{connector.Id}' declares OAuth method '{method.Id}' outside its authentication methods."); }
                if (!connector.RequiredIntegrations.Concat(connector.OptionalIntegrations).Contains(method.IntegrationId, StringComparer.Ordinal))
                { throw new InvalidOperationException($"Connector '{connector.Id}' OAuth method '{method.Id}' names an undeclared Integration '{method.IntegrationId}'."); }
            }
```

- [ ] **Step 2: Write the failing round-trip facts**

Copy `src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests/Http/TokenEndpointStub.cs` to `DigitalBrain.Platform.Tests.Unit/Connections/TokenEndpointStub.cs` (namespace `DigitalBrain.Platform.Tests.Unit.Connections`), and make `/token` record the posted form so facts can assert PKCE:

```csharp
        app.MapPost("/token", async (HttpRequest request) =>
        {
            var form = await request.ReadFormAsync();
            LastForm = form.ToDictionary(pair => pair.Key, pair => pair.Value.ToString(), StringComparer.Ordinal);
            return Results.Json(new { token_type = "Bearer", access_token = "integration-access-token", refresh_token = "integration-refresh-token", scope = "read", expires_in = 3600 });
        });
```

with `public static Dictionary<string, string>? LastForm { get; private set; }`.

Add to `ExampleConnectionModule`:

```csharp
    public static ConnectorDefinition Connector => new("example", "Example", ["api-key", "oauth"], ["example-oauth"])
    {
        Neurons = [typeof(IExample)],
        OAuthMethods = [new("oauth", "https://provider.test/authorize", "https://provider.test/token", ["read"], "example-oauth")],
    };
    public static IntegrationSchema Integration => IntegrationSchema.For("example-oauth", "Example OAuth").RequiresSecret("ClientId").RequiresSecret("ClientSecret");
```

`OAuthFlowFacts.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Framework.Platform.Integrations;
using DigitalBrain.Testing.Module;

namespace DigitalBrain.Platform.Tests.Unit.Connections;

public sealed class OAuthFlowFacts : IAsyncLifetime
{
    private TokenEndpointStub _stub = null!;
    private ModuleBrain _brain = null!;

    public async ValueTask InitializeAsync()
    {
        _stub = await TokenEndpointStub.StartAsync(CancellationToken.None);
        _brain = await ModuleTest.Create().WithModule<ExampleConnectionModule>()
            .WithExecution(new()
            {
                PrivateConfiguration = new Dictionary<string, string?>
                {
                    [IntegrationSchema.Key("example-oauth", "ClientId")] = "client-id",
                    [IntegrationSchema.Key("example-oauth", "ClientSecret")] = "client-secret",
                    ["DigitalBrain:Connections:PublicOrigin"] = _stub.Origin.AbsoluteUri,
                    ["DigitalBrain:Connections:TokenEndpoints:example"] = _stub.TokenEndpoint.AbsoluteUri,
                },
            })
            .WithHttpEdge().StartAsync();
    }

    public async ValueTask DisposeAsync() { await _brain.DisposeAsync(); await _stub.DisposeAsync(); }

    private static string Key => ConnectionKeys.For(BrainScope.Create("owner", "owner").Id, "example", "one");

    private async Task<Uri> StartLogin()
    {
        using var response = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/one/login", new { connectorId = "example", authMethodId = "oauth" });
        response.EnsureSuccessStatusCode();
        return new Uri((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!);
    }

    [Fact]
    public async Task AnOAuthLoginRoundTripsIntoAcceptGrant()
    {
        var ct = TestContext.Current.CancellationToken;
        var url = await StartLogin();
        var query = System.Web.HttpUtility.ParseQueryString(url.Query);
        Assert.Equal("https://provider.test/authorize", url.GetLeftPart(UriPartial.Path));
        Assert.Equal("client-id", query["client_id"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.Equal(new Uri(_stub.Origin, "connections/oauth/example/callback").AbsoluteUri, query["redirect_uri"]);
        using var callback = await _brain.HttpClient.GetAsync($"/connections/oauth/example/callback?code=fake-code&state={query["state"]}", ct);
        Assert.Equal(HttpStatusCode.OK, callback.StatusCode);
        Assert.Equal("fake-code", TokenEndpointStub.LastForm!["code"]);
        Assert.Equal("client-secret", TokenEndpointStub.LastForm["client_secret"]);
        Assert.False(string.IsNullOrEmpty(TokenEndpointStub.LastForm["code_verifier"]));
        CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        try
        {
            var view = await _brain.Get<IConnection>(Key).Read();
            Assert.Equal(ConnectionStatus.Connected, view.Status);
            Assert.Equal("oauth", view.AuthMethodId);
            Assert.NotNull(view.ExpiresAt);
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task ACallbackWithoutAClaimedRequestIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        using var unknown = await _brain.HttpClient.GetAsync("/connections/oauth/example/callback?code=x&state=not-a-request", ct);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        using var missing = await _brain.HttpClient.GetAsync("/connections/oauth/example/callback?code=x", ct);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
    }

    [Fact]
    public async Task AStaleLoginRequestCannotBeReplayed()
    {
        var ct = TestContext.Current.CancellationToken;
        var url = await StartLogin();
        var state = System.Web.HttpUtility.ParseQueryString(url.Query)["state"];
        using var first = await _brain.HttpClient.GetAsync($"/connections/oauth/example/callback?code=fake-code&state={state}", ct);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        using var replay = await _brain.HttpClient.GetAsync($"/connections/oauth/example/callback?code=fake-code&state={state}", ct);
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
    }

    [Fact]
    public async Task ALoginStartRequiresADeclaredOAuthMethodAndAConfiguredIntegration()
    {
        var ct = TestContext.Current.CancellationToken;
        using var wrong = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/one/login", new { connectorId = "example", authMethodId = "api-key" }, ct);
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        await _brain.Get<IIntegration>("integration/example-oauth").Clear("ClientSecret");
        using var unconfigured = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/one/login", new { connectorId = "example", authMethodId = "oauth" }, ct);
        Assert.Equal(HttpStatusCode.Conflict, unconfigured.StatusCode);
    }

    [Fact]
    public async Task ThePastedValueRoutesConnectProbeAndDisconnectOneConnection()
    {
        var ct = TestContext.Current.CancellationToken;
        using var connect = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/two/connect", new { connectorId = "example", authMethodId = "api-key", value = "hunter2" }, ct);
        Assert.Equal(HttpStatusCode.OK, connect.StatusCode);
        var row = await connect.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.Equal("Connected", row.GetProperty("status").GetString());
        Assert.DoesNotContain("hunter2", await connect.Content.ReadAsStringAsync(ct), StringComparison.Ordinal);
        var list = await _brain.HttpClient.GetFromJsonAsync<JsonElement>("/brains/owner/connections", ct);
        Assert.Contains(list.EnumerateArray(), item => item.GetProperty("connectionId").GetString() == "two");
        using var probe = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/two/probe", new { }, ct);
        Assert.Equal(HttpStatusCode.OK, probe.StatusCode);
        using var disconnect = await _brain.HttpClient.PostAsJsonAsync("/brains/owner/connections/two/disconnect", new { }, ct);
        Assert.Equal(HttpStatusCode.OK, disconnect.StatusCode);
        list = await _brain.HttpClient.GetFromJsonAsync<JsonElement>("/brains/owner/connections", ct);
        Assert.DoesNotContain(list.EnumerateArray(), item => item.GetProperty("connectionId").GetString() == "two");
    }
}
```

Add the restart fact:

```csharp
    [Fact]
    public async Task ACallbackAfterARestartIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        var url = await StartLogin();
        var state = System.Web.HttpUtility.ParseQueryString(url.Query)["state"];
        await _brain.RestartSiloAsync(ct);
        using var callback = await _brain.HttpClient.GetAsync($"/connections/oauth/example/callback?code=fake-code&state={state}", ct);
        Assert.Equal(HttpStatusCode.BadRequest, callback.StatusCode);
        CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        try { Assert.Equal(ConnectionStatus.Disconnected, (await _brain.Get<IConnection>(Key).Read()).Status); }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }
```

The pending table is in process and dies with the silo, which is the fail-closed behavior the spec accepts. `OAuthLoginRequests` must be a silo service resolved through `ModuleHttpEdge`'s fallback provider (register it in `AddDigitalBrainPlatform`, not in the web host) so the restart empties it; if `RestartSiloAsync` keeps the silo's service provider alive, this fact is the one that proves it and the registration moves to a per-silo lifetime.

The pasted-value routes must bypass the old `/connections/connect` route of the registry; the new routes are `/connections/{cid}/connect`, so the two coexist until Task 9.

- [ ] **Step 3: Run and watch them fail**

```bash
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit -- --filter-class "*OAuthFlowFacts*"
```

Expected: 404 on `/login` and the callback.

- [ ] **Step 4: Options and pending requests**

`Connections/ConnectionsOptions.cs`:

```csharp
namespace DigitalBrain.Platform.Connections;

public sealed class ConnectionsOptions
{
    public const string SectionName = "DigitalBrain:Connections";
    // Where providers send browsers back; null means no OAuth login can start.
    public Uri? PublicOrigin { get; set; }
    // Test hosts point a connector at a stub token endpoint; keyed by connector id.
    public Dictionary<string, string> TokenEndpoints { get; set; } = new(StringComparer.Ordinal);
    public TimeSpan LoginLifetime { get; set; } = TimeSpan.FromMinutes(10);
    public int PendingLoginCapacity { get; set; } = 128;
}
```

`Connections/OAuth/OAuthLoginRequests.cs`:

```csharp
using System.Security.Cryptography;
using DigitalBrain.Framework;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Platform.Connections.OAuth;

internal sealed record PendingLogin(string ConnectionKey, string AuthMethodId, string CodeVerifier, string? Target, CallerContext Owner, DateTimeOffset ExpiresAt);

// A ten-minute capability for an in-flight browser redirect. Process memory on purpose: losing
// it on restart costs the user one more click and can never connect the wrong brain.
internal sealed class OAuthLoginRequests(IOptions<ConnectionsOptions> options, TimeProvider clock)
{
    private readonly Dictionary<string, PendingLogin> _pending = new(StringComparer.Ordinal);

    public (string State, string CodeVerifier) Begin(string connectionKey, string authMethodId, string? target, CallerContext owner)
    {
        lock (_pending)
        {
            var now = clock.GetUtcNow();
            foreach (var expired in _pending.Where(p => p.Value.ExpiresAt <= now).Select(p => p.Key).ToArray()) { _pending.Remove(expired); }
            if (_pending.Count >= options.Value.PendingLoginCapacity)
            { throw new InvalidOperationException("Too many pending logins. Wait for an existing request to expire."); }
            var state = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
            var verifier = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            _pending.Add(state, new(connectionKey, authMethodId, verifier, target, owner, now + options.Value.LoginLifetime));
            return (state, verifier);
        }
    }

    public bool TryClaim(string? state, out PendingLogin login)
    {
        login = null!;
        lock (_pending)
        {
            if (state is null || !_pending.TryGetValue(state, out var pending) || pending.ExpiresAt <= clock.GetUtcNow()) { return false; }
            _pending.Remove(state);
            login = pending;
            return true;
        }
    }
}
```

- [ ] **Step 5: Token exchange**

`Connections/OAuth/OAuthTokenExchange.cs`:

```csharp
using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Framework.Platform.Integrations;
using DigitalBrain.Platform.Integrations;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Platform.Connections.OAuth;

internal sealed class OAuthTokenExchange(
    IReadOnlyList<ConnectorDefinition> connectors, IGrainFactory grains, IOptions<ConnectionsOptions> options,
    TimeProvider clock, IHttpClientFactory clients) : IOAuthTokenExchange
{
    public const string HttpClientName = "DigitalBrain.Connections.OAuth";

    public Task<OAuthGrant> ExchangeCodeAsync(string connectorId, string authMethodId, string code, string codeVerifier, string redirectUri, string? target, CancellationToken ct)
        => PostAsync(connectorId, authMethodId, target, new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["code_verifier"] = codeVerifier,
            ["redirect_uri"] = redirectUri,
        }, ct);

    public Task<OAuthGrant> RefreshAsync(string connectorId, string authMethodId, string refreshToken, CancellationToken ct)
        => PostAsync(connectorId, authMethodId, null, new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
        }, ct);

    internal OAuthMethod Method(string connectorId, string authMethodId)
        => connectors.FirstOrDefault(c => c.Id == connectorId)?.OAuthMethods.FirstOrDefault(m => m.Id == authMethodId)
            ?? throw new ArgumentException($"Connector '{connectorId}' has no OAuth method '{authMethodId}'.");

    internal string TokenEndpoint(string connectorId, OAuthMethod method)
        => options.Value.TokenEndpoints.TryGetValue(connectorId, out var endpoint) ? endpoint : method.TokenEndpoint;

    // The Integration neuron's Release demands a platform stamp: this is one of the two places the
    // Platform ring manufactures one, and it never leaves this method.
    internal async Task<(string Id, string Secret)> ClientAsync(OAuthMethod method, CancellationToken ct)
    {
        var integration = grains.GetGrain<IIntegration>(IntegrationVault.GrainKeyPrefix + method.IntegrationId);
        if ((await integration.Read().WaitAsync(ct)).Status != IntegrationStatus.Ready)
        { throw new InvalidOperationException($"Integration '{method.IntegrationId}' is not configured."); }
        var released = await integration.Release(new CallerContext
        {
            PrincipalId = IntegrationVault.CallerAppId, AccountId = IntegrationVault.Owner, BrainId = IntegrationVault.Owner,
            Kind = CallerKind.Platform, StampedBy = TrustedEdge.Platform, AppId = IntegrationVault.CallerAppId,
        }).WaitAsync(ct);
        return (released.Values[method.ClientIdField], released.Values[method.ClientSecretField]);
    }

    private async Task<OAuthGrant> PostAsync(string connectorId, string authMethodId, string? target, Dictionary<string, string> form, CancellationToken ct)
    {
        var method = Method(connectorId, authMethodId);
        var (id, secret) = await ClientAsync(method, ct);
        form["client_id"] = id;
        form["client_secret"] = secret;
        using var client = clients.CreateClient(HttpClientName);
        using var response = await client.PostAsync(TokenEndpoint(connectorId, method), new FormUrlEncodedContent(form), ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        { throw new InvalidOperationException($"The {connectorId} token endpoint answered HTTP {(int)response.StatusCode}."); }
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        var access = root.GetProperty("access_token").GetString();
        if (string.IsNullOrWhiteSpace(access) || access.Length > 16384 || access.Any(c => char.IsControl(c) || char.IsWhiteSpace(c)))
        { throw new InvalidOperationException($"The {connectorId} token endpoint returned an invalid token."); }
        var refresh = root.TryGetProperty("refresh_token", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null;
        DateTimeOffset? expiresAt = root.TryGetProperty("expires_in", out var e) && double.TryParse(e.ToString(), CultureInfo.InvariantCulture, out var seconds) && seconds > 0
            ? clock.GetUtcNow().AddSeconds(seconds) : null;
        var scopes = root.TryGetProperty("scope", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() ?? "" : string.Join(' ', method.Scopes);
        return new OAuthGrant(authMethodId, access, refresh, expiresAt, scopes, target, body);
    }
}
```

Register `services.AddHttpClient(OAuthTokenExchange.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(30)).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });` in `AddDigitalBrainPlatform`.

Note `IntegrationVault` is `internal` in the Platform ring; `OAuthTokenExchange` is in the same assembly. When Task 8 deletes `IntegrationVault`, keep `GrainKeyPrefix` as `IntegrationNeuron.KeyPrefix` and the platform caller construction moves into a single `IntegrationNeuron.PlatformCaller` static used here and by `IntegrationHandle`.

- [ ] **Step 6: Login flow, callback and routes**

`Connections/OAuth/OAuthLoginFlow.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using Microsoft.Extensions.Options;

namespace DigitalBrain.Platform.Connections.OAuth;

internal sealed class OAuthLoginFlow(OAuthLoginRequests requests, OAuthTokenExchange exchange, IOptions<ConnectionsOptions> options)
{
    public Uri CallbackUri(string connectorId)
        => new(options.Value.PublicOrigin ?? throw new InvalidOperationException("Configure DigitalBrain:Connections:PublicOrigin before starting a browser login."),
            $"connections/oauth/{Uri.EscapeDataString(connectorId)}/callback");

    public async Task<Uri> StartAsync(string connectionKey, string authMethodId, string? target, CallerContext owner, CancellationToken ct)
    {
        var (brain, connector, _) = ConnectionKeys.Parse(connectionKey);
        var method = exchange.Method(connector, authMethodId);
        var (clientId, _) = await exchange.ClientAsync(method, ct);
        var (state, verifier) = requests.Begin(connectionKey, authMethodId, target, owner);
        var query = new Dictionary<string, string>(method.AuthorizationParameters, StringComparer.Ordinal)
        {
            ["response_type"] = "code",
            ["client_id"] = clientId,
            ["redirect_uri"] = CallbackUri(connector).AbsoluteUri,
            ["scope"] = string.Join(' ', method.Scopes),
            ["state"] = state,
        };
        if (method.Pkce)
        {
            query["code_challenge"] = Convert.ToBase64String(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            query["code_challenge_method"] = "S256";
        }
        return new Uri(method.AuthorizationEndpoint + "?" + string.Join('&', query.Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}")));
    }
}
```

`Connections/OAuth/OAuthCallback.cs` (an `IHttpSurface`, mapped before the authentication gate like `BrowserLoginSurface` was; it needs no session):

```csharp
using System.Diagnostics;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Platform.Enforcement;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Platform.Connections.OAuth;

// The browser returns here with a code and the one-use state. The owner was recorded at login
// start; this edge stamps that owner, the way the authenticated edge stamps a cookie.
internal sealed class OAuthCallback : IHttpSurface
{
    private const string Prefix = "/connections/oauth/";
    private const string Suffix = "/callback";

    public void Map(IApplicationBuilder app)
    {
        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? "";
            if (!path.StartsWith(Prefix, StringComparison.Ordinal) || !path.EndsWith(Suffix, StringComparison.Ordinal)) { await next(context); return; }
            Redact(context);
            LoginPage.PrivateHeaders(context);
            var connector = Uri.UnescapeDataString(path[Prefix.Length..^Suffix.Length]);
            var requests = context.RequestServices.GetRequiredService<OAuthLoginRequests>();
            var code = context.Request.Query["code"].ToString();
            if (!HttpMethods.IsGet(context.Request.Method) || string.IsNullOrWhiteSpace(code) || !requests.TryClaim(context.Request.Query["state"], out var login))
            {
                await LoginPage.WriteAsync(context, "This login link expired or was already used", "Return to DigitalBrain and connect again.", 400);
                return;
            }
            var (brain, keyConnector, _) = ConnectionKeys.Parse(login.ConnectionKey);
            if (keyConnector != connector) { await LoginPage.WriteAsync(context, "Invalid callback", "Return to DigitalBrain and connect again.", 400); return; }
            try
            {
                var exchange = context.RequestServices.GetRequiredService<OAuthTokenExchange>();
                var flow = context.RequestServices.GetRequiredService<OAuthLoginFlow>();
                var grant = await exchange.ExchangeCodeAsync(connector, login.AuthMethodId, code, login.CodeVerifier, flow.CallbackUri(connector).AbsoluteUri, login.Target, context.RequestAborted);
                using var _ = CallerContextScope.Scoped(login.Owner);
                await context.RequestServices.GetRequiredService<IGrainFactory>().GetGrain<IConnectionInbound>(login.ConnectionKey).AcceptGrant(grant);
                await LoginPage.WriteAsync(context, $"{connector} connected", "You can close this tab. DigitalBrain is continuing your request.", 200);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                // Provider replies and tokens never reach the browser; the detail lands on the neuron and in logs.
                context.RequestServices.GetRequiredService<Microsoft.Extensions.Logging.ILogger<OAuthCallback>>()
                    .LogWarning(error, "OAuth callback for {Connector} failed.", connector);
                await LoginPage.WriteAsync(context, $"{connector} connection needs attention", "Return to DigitalBrain and connect again.", 400);
            }
            finally { Redact(context); }
        });
    }

    private static void Redact(HttpContext context)
    {
        var activity = Activity.Current;
        activity?.SetTag("url.query", null);
        activity?.SetTag("http.target", context.Request.Path.Value);
        activity?.SetTag("url.full", $"{context.Request.Scheme}://{context.Request.Host}{context.Request.Path}");
    }
}
```

`CallerContextScope` lives in `Platform/Enforcement/CallerContextScope.cs`; confirm its `Scoped(CallerContext)` signature with LSP before use.

`Connections/ConnectionEndpoints.cs` (Platform, new file; namespace `DigitalBrain.Platform.Connections`):

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Platform.Connections.OAuth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace DigitalBrain.Platform.Connections;

internal sealed record ConnectInput(string? ConnectorId, string? AuthMethodId, string? Value);
internal sealed record LoginInput(string? ConnectorId, string? AuthMethodId, string? Target);

internal static class ConnectionEndpoints
{
    internal static void MapConnectionNeurons(this IEndpointRouteBuilder endpoints)
    {
        var group = BrainRoutes.Group(endpoints, "/connections");

        group.MapGet("", async (IGrainFactory grains) =>
        {
            var scope = BrainScope.CurrentId();
            var rows = new List<ConnectionView>();
            foreach (var key in await grains.GetGrain<IConnectionIndex>(scope).List())
            { rows.Add(await grains.GetGrain<IConnection>(key).Read()); }
            return Results.Ok(rows);
        });

        group.MapGet("/requests", async (IGrainFactory grains) =>
            Results.Ok(await grains.GetGrain<DigitalBrain.Integrations.IConnectionRequests>(BrainScope.CurrentId()).ListPending()));

        group.MapPost("/{connectionId}/connect", async (string connectionId, ConnectInput input, IGrainFactory grains) =>
        {
            if (string.IsNullOrWhiteSpace(input.ConnectorId) || string.IsNullOrWhiteSpace(input.AuthMethodId) || string.IsNullOrWhiteSpace(input.Value)) { return Results.BadRequest(); }
            try { return Results.Ok(await grains.GetGrain<IConnection>(ConnectionKeys.For(BrainScope.CurrentId(), input.ConnectorId, connectionId)).Connect(input.AuthMethodId, input.Value)); }
            catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
        });

        group.MapPost("/{connectionId}/login", async (string connectionId, LoginInput input, OAuthLoginFlow flow, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.ConnectorId) || string.IsNullOrWhiteSpace(input.AuthMethodId)) { return Results.BadRequest(); }
            var key = ConnectionKeys.For(BrainScope.CurrentId(), input.ConnectorId, connectionId);
            try { return Results.Ok(new { url = (await flow.StartAsync(key, input.AuthMethodId, input.Target, CallerContextStamper.Require(), ct)).AbsoluteUri }); }
            catch (ArgumentException error) { return Results.BadRequest(new { error = error.Message }); }
            catch (InvalidOperationException error) { return Results.Json(new { error = error.Message }, statusCode: StatusCodes.Status409Conflict); }
        });

        group.MapPost("/{connectionId}/probe", async (string connectionId, IGrainFactory grains) =>
            await Find(grains, connectionId) is { } key ? Results.Ok(await grains.GetGrain<IConnection>(key).Probe()) : Results.NotFound());

        group.MapPost("/{connectionId}/disconnect", async (string connectionId, IGrainFactory grains) =>
        {
            if (await Find(grains, connectionId) is not { } key) { return Results.NotFound(); }
            await grains.GetGrain<IConnection>(key).Disconnect();
            return Results.Ok();
        });
    }

    // The connection id is unique per brain across connectors; the index knows the full key.
    private static async Task<string?> Find(IGrainFactory grains, string connectionId)
        => (await grains.GetGrain<IConnectionIndex>(BrainScope.CurrentId()).List())
            .FirstOrDefault(key => ConnectionKeys.Parse(key).ConnectionId == connectionId);
}
```

`PlatformHosting.AddDigitalBrainPlatform` gains:

```csharp
        services.AddOptions<ConnectionsOptions>().BindConfiguration(ConnectionsOptions.SectionName);
        services.TryAddSingleton<Connections.OAuth.OAuthLoginRequests>();
        services.TryAddSingleton<Connections.OAuth.OAuthTokenExchange>();
        services.TryAddSingleton<IOAuthTokenExchange>(provider => provider.GetRequiredService<Connections.OAuth.OAuthTokenExchange>());
        services.TryAddSingleton<Connections.OAuth.OAuthLoginFlow>();
        services.AddSingleton<IHttpSurface, Connections.OAuth.OAuthCallback>();
```

and `MapDigitalBrainPlatform` calls `endpoints.MapConnectionNeurons();` in addition to the old `MapConnections()` (the old group keeps `/connect`, `/probe`, `/disconnect` on the registry; the new ones are under `/{connectionId}/…`, so no route collides. `GET ""` collides: in this task the new `GET /brains/{b}/connections` replaces the old list route, and `ConnectionEndpoints.MapConnections` loses its `MapGet("")` and `/requests` now, with the old `AccountFacts` facts that read the list switching to the new row shape).

- [ ] **Step 7: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

Expected: all green. If `ConfigurationKeyFacts.ConfigurationKeyLiteralsStayWithinTheOwnerBaseline` rejects `DigitalBrain:Connections`, add it to the Platform owner's baseline in that fact's table.

```bash
git add src/DigitalBrain.Framework src/DigitalBrain.Platform src/Testing
git commit -m "Platform: one OAuth login and callback for every connector; connection routes over the index"
```

---

### Task 4: Gmail switches

**Files:**
- Modify: `DigitalBrain.Modules.Google.Gmail/Gmail/GmailNeuron.cs`, `GmailState.cs`, `IGmailInbound.cs`, `GmailModule.cs`, `Configuration/GmailModuleOptions.cs`
- Delete: `Gmail/GmailCallbackRequests.cs`, `Gmail/GmailOAuthPrivacySurface.cs`, `Gmail/GmailTokenExchange.cs`, `Gmail/IGmailTokenExchange.cs`, `Gmail/GmailTokenGrant.cs`, `Gmail/GmailTokenPolicy.cs`, Contracts `Gmail/Signals/GmailConnected.cs`, Contracts `GmailConnection.cs`
- Modify tests: `Gmail/GmailConnectedFacts.cs`, `Http/GmailHostFixture.cs`, `Http/GmailWatchWebhookFacts.cs`, `Http/GmailConfiguredRegistrationFacts.cs`; delete `Http/GmailOAuthCallbackFacts.cs`, `Http/GmailOAuthPrivacyFacts.cs`
- Modify: `DigitalBrain.Modules.Google.Gmail.Aspire.Hosting/GmailHostingExtensions.cs` (project `PublicOrigin` to `DigitalBrain:Connections:PublicOrigin` as well)

**Interfaces:**
- Consumes `ConnectionNeuron<GmailState>`, `OAuthMethod`, `IOAuthTokenExchange` from Tasks 2 and 3.
- Produces `IGmailInbound { Task AcceptWatchPush(GmailWatchPush push); }` only; `GmailModule.Connector` with `OAuthMethods`.

- [ ] **Step 1: Rewrite the Gmail facts first**

`GmailHostFixture.ConnectForPushAsync` becomes a Platform OAuth round trip:

```csharp
    internal async Task ConnectForPushAsync(string brainName, string connectionId)
    {
        using var start = await Brain.HttpClient.PostAsJsonAsync($"/brains/{brainName}/connections/{connectionId}/login", new { connectorId = "gmail", authMethodId = "google-oauth" });
        start.EnsureSuccessStatusCode();
        var url = new Uri((await start.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!);
        var state = System.Web.HttpUtility.ParseQueryString(url.Query)["state"];
        using var callback = await Brain.HttpClient.GetAsync($"/connections/oauth/gmail/callback?code=fake-code&state={state}");
        callback.EnsureSuccessStatusCode();
    }
```

and its brain configuration adds `["DigitalBrain:Connections:PublicOrigin"] = _stub.Origin.AbsoluteUri, ["DigitalBrain:Connections:TokenEndpoints:gmail"] = _stub.TokenEndpoint.AbsoluteUri` to `PrivateConfiguration`, keeps `ProfileEndpoint` in `GmailModuleOptions`, and drops `TokenEndpoint`/`PublicOrigin` from the module options.

`GmailConnectedFacts.AuthorizationCodePublishesGmailConnected` becomes `AGrantConnectsTheMailboxAndIndexesItsEmail`:

```csharp
    [Fact]
    public async Task AGrantConnectsTheMailboxAndIndexesItsEmail()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var stub = await TokenEndpointStub.StartAsync(ct);
        await using var brain = await ModuleTest.Create().WithModule<GmailModule, GmailModuleOptions>(o => o.ProfileEndpoint = new(stub.Origin, "profile"))
            .WithExecution(new() { PrivateConfiguration = GmailHostFixture.ConfiguredRegistration() })
            .StartAsync(ct);
        var scope = BrainScope.Create("owner", "owner").Id;
        var key = ConnectionKeys.For(scope, "gmail", "primary");
        CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        try
        {
            await using var connected = await brain.Observe<ConnectionConnected>(brain.Get<IGmail>(key), ct);
            var view = await brain.Grains.GetGrain<IConnectionInbound>(key).AcceptGrant(new("google-oauth", "access-token", "refresh-token", DateTimeOffset.UtcNow.AddHours(1), GmailScopes.Read, null, "{}"));
            Assert.Equal("user@gmail.com", view.Account);
            Assert.Equal("user@gmail.com", (await connected.NextAsync(ct: ct)).Account);
            Assert.Equal([key], await brain.Grains.GetGrain<IGmailMailboxIndex>("user@gmail.com").Read());
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task AnExpiredAccessTokenIsRefreshedThroughThePlatformBeforeAPush()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var stub = await TokenEndpointStub.StartAsync(ct);
        await using var brain = await ModuleTest.Create().WithModule<GmailModule, GmailModuleOptions>(o => o.ProfileEndpoint = new(stub.Origin, "profile"))
            .WithExecution(new()
            {
                PrivateConfiguration = new Dictionary<string, string?>(GmailHostFixture.ConfiguredRegistration())
                {
                    ["DigitalBrain:Connections:TokenEndpoints:gmail"] = stub.TokenEndpoint.AbsoluteUri,
                },
            })
            .StartAsync(ct);
        var key = ConnectionKeys.For(BrainScope.Create("owner", "owner").Id, "gmail", "primary");
        CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        try
        {
            await brain.Grains.GetGrain<IConnectionInbound>(key).AcceptGrant(new("google-oauth", "stale-token", "refresh-token", DateTimeOffset.UtcNow.AddSeconds(-1), GmailScopes.Read, null, "{}"));
            await using var mail = await brain.Observe<MailReceived>(brain.Get<IGmail>(key), ct);
            Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
            await brain.Grains.GetGrain<IGmailInbound>(key).AcceptWatchPush(new("h1", "user@gmail.com"));
            Assert.Equal("h1", (await mail.NextAsync(ct: ct)).HistoryId);
            Assert.Equal("refresh_token", TokenEndpointStub.LastForm!["grant_type"]);
            Assert.Equal("refresh-token", TokenEndpointStub.LastForm["refresh_token"]);
            CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
            Assert.True((await brain.Get<IConnection>(key).Read()).ExpiresAt > DateTimeOffset.UtcNow);
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }
```

The `TokenEndpointStub` with `LastForm` from Task 3 is copied into this test project (namespace `DigitalBrain.Modules.Google.Gmail.Tests`), replacing the module's existing stub file.

`GmailWatchWebhookFacts.WrongMailboxAndDisconnectedConnectionsPublishNothing`: replace the `IConnectionRegistry.Disconnect("restricted-push")` line with `await brain.Get<IConnection>(key).Disconnect();` under the same stamp. `GmailConfiguredRegistrationFacts`: `AuthorizationCodeCallbackPublishesGmailConnected` observes `ConnectionConnected` instead of `GmailConnected`; `CallbackRejectsMissingStateAndDoesNotReuseClaimedState` moves to the Platform facts already written in Task 3 and is deleted here. Delete `GmailOAuthCallbackFacts.cs` and `GmailOAuthPrivacyFacts.cs`.

- [ ] **Step 2: Run them and watch them fail**

```bash
dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
```

Expected: compile errors (`IConnectionInbound.AcceptGrant` on a grain that does not implement it) and 404 on the Platform login route for `gmail`.

- [ ] **Step 3: The neuron**

`Gmail/GmailState.cs`:

```csharp
using DigitalBrain.Framework.Platform.Connections;

namespace DigitalBrain.Google.Gmail;

[GenerateSerializer, Alias("db.gmail.state")]
internal sealed class GmailState : ConnectionState
{
    [Id(8)] public bool CanCompose { get; set; }
    [Id(9)] public GmailDraftPreview? PendingDraft { get; set; }
    [Id(10)] public GmailDraftPreview? SubmittingDraft { get; set; }
}
```

`Gmail/IGmailInbound.cs`: drop `AcceptAuthorizationCode`.

`Gmail/GmailNeuron.cs`:

```csharp
using System.Net.Http.Headers;
using System.Text.Json;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Google.Gmail;

[GrainType("gmail")]
internal sealed class GmailNeuron(
    [PersistentState("gmail", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<GmailState> store)
    : ConnectionNeuron<GmailState>(store), IGmail, IGmailInbound
{
    // Verified Pub/Sub delivery arrives unstamped; the connection's own state decides.
    public async Task AcceptWatchPush(GmailWatchPush push)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(push.EmailAddress);
        ArgumentException.ThrowIfNullOrWhiteSpace(push.HistoryId);
        if (Snapshot.Status != ConnectionStatus.Connected) { return; }
        if (!string.Equals(Snapshot.Account, push.EmailAddress, StringComparison.OrdinalIgnoreCase)) { return; }
        // Refreshing here keeps the watch alive across token expiry without a provider call.
        await UseCredentialAsync((_, _) => Task.FromResult(true), CancellationToken.None);
        await PublishAsync(new MailReceived(push.EmailAddress, push.HistoryId));
    }

    // The grant proves the mailbox: Google's profile endpoint names the address the token reads.
    protected override async Task<OAuthGrant> AcceptGrantAsync(OAuthGrant grant)
    {
        var options = ServiceProvider.GetRequiredService<GmailModuleOptions>();
        using var client = ServiceProvider.GetRequiredService<IHttpClientFactory>().CreateClient(GmailModule.HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, options.ProfileEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", grant.AccessToken);
        using var profile = await client.SendAsync(request);
        if (!profile.IsSuccessStatusCode) { throw new GmailUnavailableException("Google did not verify the mailbox identity. Reconnect Gmail."); }
        using var json = JsonDocument.Parse(await profile.Content.ReadAsStringAsync());
        var email = json.RootElement.GetProperty("emailAddress").GetString();
        if (string.IsNullOrWhiteSpace(email)) { throw new GmailUnavailableException("Google did not verify the mailbox identity. Reconnect Gmail."); }
        if (Snapshot.Account is { } previous && !string.Equals(previous, email, StringComparison.OrdinalIgnoreCase))
        { await GrainFactory.GetGrain<IGmailMailboxIndex>(previous.ToLowerInvariant()).Remove(this.GetPrimaryKeyString()); }
        Snapshot.Account = email;
        return grant;
    }

    protected override Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct)
        => Task.FromResult(Snapshot.ExpiresAt is { } expiry && expiry <= DateTimeOffset.UtcNow
            ? ConnectionProbeResult.Expired("The Gmail access token expired.")
            : ConnectionProbeResult.Connected());

    protected override Task OnConnectedAsync()
        => Snapshot.Account is { } email ? GrainFactory.GetGrain<IGmailMailboxIndex>(email.ToLowerInvariant()).Add(this.GetPrimaryKeyString()) : Task.CompletedTask;

    // The base calls this before it clears Account.
    protected override Task OnDisconnectedAsync()
        => Snapshot.Account is { } email ? GrainFactory.GetGrain<IGmailMailboxIndex>(email.ToLowerInvariant()).Remove(this.GetPrimaryKeyString()) : Task.CompletedTask;
}
```

`ProbeAsync` asks Google rather than the clock: `GET ProfileEndpoint` with the opened credential through the same HttpClient as `AcceptGrantAsync`; 200 is `Connected`, 401 is `Expired("The Gmail access token was refused.")`, anything else is `Failing` with the status code. Replace the clock-based body above with that.

`GmailModule.cs` becomes:

```csharp
public sealed class GmailModule() : Module<GmailModuleOptions>(new ModuleId("gmail")), IHttpModule
{
    public const string HttpClientName = "DigitalBrain.Gmail";

    public static IntegrationSchema[] Integrations { get; } = [
        IntegrationSchema.For("google-oauth", "Google OAuth").RequiresSecret("ClientId").RequiresSecret("ClientSecret"),
        IntegrationSchema.For("google-pubsub", "Google Pub/Sub push").RequiresSetting("Audience").RequiresSetting("ServiceAccountEmail"),
    ];

    public static ConnectorDefinition Connector { get; } = new("gmail", "Gmail", ["google-oauth"], ["google-oauth"])
    {
        OptionalIntegrations = ["google-pubsub"],
        Neurons = [typeof(IGmail)],
        Signals = [typeof(MailReceived)],
        OAuthMethods = [new("google-oauth", "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", [GmailScopes.Read], "google-oauth")
            { AuthorizationParameters = { ["access_type"] = "offline", ["prompt"] = "consent" } }],
    };

    public override void Configure(ISiloBuilder silo)
    {
        ArgumentNullException.ThrowIfNull(silo);
        var services = silo.Services;
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton(silo.Configuration.GetModuleOptions<GmailModuleOptions>("gmail"));
        services.TryAddSingleton<GmailRegistration>();
        services.TryAddSingleton<IGmailPushAuthenticator, GmailPushAuthenticator>();
        services.AddHttpClient(HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(30));
    }

    public void Configure(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/google/gmail/watch", /* unchanged body */).AllowAnonymous();
    }
}
```

`GmailModuleOptions` keeps `ProfileEndpoint` (defaults to `https://gmail.googleapis.com/gmail/v1/users/me/profile`) and `PublicOrigin` only if `GmailRegistration.Explain` still needs it; `GmailRegistration` loses `ReleaseAsync` (the Platform exchanges codes) and keeps `ReadAsync`/`Explain` for the push authenticator's readiness; `GmailScopes` stays. Delete the files listed in the task header.

`GmailHostingExtensions`: where it sets `DigitalBrain:Modules:gmail:Options:PublicOrigin`, set `DigitalBrain:Connections:PublicOrigin` to the same value (find the line with text search; it is the only `PublicOrigin` in that file).

- [ ] **Step 4: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail/DigitalBrain.Modules.Google.Gmail.csproj
dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
dotnet build src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting.csproj
```

Expected: all Gmail facts green, including both watch fan-out facts through the new `ConnectForPushAsync`.

```bash
git add src/DigitalBrain.Modules/Google/Gmail
git commit -m "Gmail: the connection neuron owns the grant; login and callback are the Platform's"
```

---

### Task 5: Postgres, Supabase and ClickHouse read their own state

**Files:**
- Modify: `Postgres/DigitalBrain.Modules.Postgres/PostgresServerNeuron.cs`, `PostgresModule.cs` (connector `AuthMethods` stays `connection-string`); tests `ConnectionPostgresFacts.cs`
- Modify: `Supabase/DigitalBrain.Modules.Supabase/Query/SupabaseNeuron.cs`, `SupabaseModule.cs`; delete `Query/ConnectionSupabaseProvider.cs`; tests `ConnectionCredentialFacts.cs`
- Modify: `ClickHouse/DigitalBrain.Modules.ClickHouse/Query/ClickHouseNeuron.cs`, `ClickHouseModule.cs`; tests add `ConnectionClickHouseFacts.cs`

**Interfaces:**
- `PostgresServerNeuron : ConnectionNeuron<PostgresConnectionState>` where `PostgresConnectionState : ConnectionState` (no extra fields); integration keys (`"default"`, platform) keep the stateless path.

- [ ] **Step 1: Postgres facts**

In `ConnectionPostgresFacts.StartAsync`, remove `AddSingleton<IModuleConnectionCredentials<PostgresModule>>(new Credentials())` and the `Credentials` class; keep `Factory`. Add a helper that connects through the neuron:

```csharp
    private static async Task ConnectAsync(ModuleBrain brain)
    {
        CallerContextStamper.Stamp(new() { PrincipalId = "alice", AccountId = "alice", BrainId = "brain", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        await brain.AuthorizeCallerAsync();
        await brain.Get<IConnection>(ConnectionKeys.For(BrainScope.CurrentId(), "postgres", "c1")).Connect("connection-string", ConnectionString);
    }
```

and call it at the top of `AScriptInItsOwnBrainQueriesItsConnectedDatabase` and `AScriptMayNotAddressAnotherBrainsConnection` before `Stamp()`. Add:

```csharp
    [Fact]
    public async Task AUserConnectionResolvesFromTheNeuronsOwnState()
    {
        await using var brain = await StartAsync();
        await ConnectAsync(brain);
        var key = ConnectionKeys.For(BrainScope.CurrentId(), "postgres", "c1");
        Assert.Equal(ConnectionStatus.Connected, (await brain.Get<IConnection>(key).Read()).Status);
        await brain.Get<IConnection>(key).Disconnect();
        await Assert.ThrowsAsync<InvalidOperationException>(() => brain.Get<IPostgresServer>(key).Query(new("select id from people", 10)));
    }
```

- [ ] **Step 2: Postgres neuron**

`PostgresServerNeuron`:

```csharp
[GenerateSerializer, Alias("postgres.connection-state")]
internal sealed class PostgresConnectionState : ConnectionState { }

[GrainType("postgres")]
internal sealed class PostgresServerNeuron(
    IPostgresProvider platform, IConnectionPostgresProviderFactory connections,
    [PersistentState("postgres", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<PostgresConnectionState> store)
    : ConnectionNeuron<PostgresConnectionState>(store), IPostgresServer
{
    protected override async Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct)
    {
        var ping = await connections.ForConnectionString(credential.Value).PingAsync(ct);
        return ping.Connected ? ConnectionProbeResult.Connected() : ConnectionProbeResult.Failing("The database did not answer.");
    }

    // Integration keys ("default") serve the deployment's database; connection keys serve the user's.
    private Task<T> WithProvider<T>(Func<IPostgresProvider, Task<T>> operation)
        => ConnectionKeys.Is(this.GetPrimaryKeyString())
            ? UseCredentialAsync((credential, _) => operation(connections.ForConnectionString(credential.Value)), CancellationToken.None)
            : operation(platform);
    // Query, ReadSchema, ReadConnection: unchanged bodies, each wrapped in WithProvider.
}
```

Keep the existing validation and the "another brain's connection" refusal: `NeuronAccess.ForBrainKey` already scopes `connection/` keys, and `ConnectionNeuron.Key` throws `ArgumentException` on a non-canonical key; map that to `UnauthorizedAccessException` in `WithProvider` as `Resolve()` does today. The `TheDefaultKeyStaysPlatformOnly` fact must still pass: the base only applies to `connection/` keys, and `Access` for `"default"` is unchanged (`NeuronAccess.ForBrainKey("default")` is `Unclassified`; keep the `[PlatformOnly]`-style guard that fact relies on, found with LSP on the fact).

- [ ] **Step 3: Supabase**

`SupabaseNeuron : ConnectionNeuron<SupabaseConnectionState>, ISupabase`; `Provider` becomes: for `connection/` keys, `UseCredentialAsync` building `new SupabaseProvider(NpgsqlDataSource.Create(SupabaseConnectionSettings.Parse(credential.Value).ConnectionString))` per call (today's behavior); for the integration key, `ISupabaseBackingStore`. Delete `ConnectionSupabaseProvider`; in `SupabaseModule.Configure` replace `TryAddSingleton<ISupabaseProvider, ConnectionSupabaseProvider>()` by registering the backing store as `ISupabaseProvider` and leave `ILiveTableSource` on that. `ConnectionCredentialFacts` is rewritten: the first fact is deleted (no provider class), the second becomes `SameNamedConnectionsInTwoBrainsResolveTheirOwnValue` connecting through `brain.Get<IConnection>(ConnectionKeys.For(scope, "supabase", "supabase")).Connect("connection-string", value)` and asserting through a fake `IConnectionPostgresProviderFactory`-style seam the module already lacks: add `ISupabaseSourceFactory { ISupabaseProvider ForConnectionString(string) }` with the Npgsql default, so the fact can assert which value reached it. `SupabaseModule.Connector` neurons gain nothing; its `AuthMethods` stays `["connection-string"]`.

- [ ] **Step 4: ClickHouse**

`ClickHouseNeuron : ConnectionNeuron<ClickHouseConnectionState>, IClickHouse`; for `connection/` keys `UseCredentialAsync` builds `new ClickHouseDriverProvider(new ClickHouseClient(credential.Value, clients, ClickHouseRegistration.HttpClientName), ClickHouseDriverProvider.DatabaseOf(credential.Value))`; integration key keeps the injected `IClickHouseProvider`. New `ConnectionClickHouseFacts.AUserConnectionResolvesFromTheNeuronsOwnState` mirrors the Postgres one with a fake `IClickHouseSourceFactory`.

- [ ] **Step 5: Build, test, commit**

```bash
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test --project src/DigitalBrain.Modules/ClickHouse/tests/DigitalBrain.Modules.ClickHouse.Tests
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Windows.Tests
git add src/DigitalBrain.Modules/Postgres src/DigitalBrain.Modules/Supabase src/DigitalBrain.Modules/ClickHouse
git commit -m "Postgres, Supabase, ClickHouse: a user connection is the neuron's own sealed state"
```

After this task `IModuleConnectionCredentials<T>` has no caller outside the Platform ring (confirm with LSP).

---

### Task 6: Salesforce switches

**Files:**
- Modify: `Salesforce/SalesforceNeuron.cs`, `SalesforceState.cs`, `SalesforceModule.cs`, `Configuration/SalesforceModuleOptions.cs` (absorb `SalesforceMcpOptions`), Contracts `ISalesforce.cs`
- Delete: `Salesforce/SalesforceAuthentication.cs`, `SalesforceOAuthHandler.cs`, `SalesforceLogins.cs`, `SalesforceCredentialStore.cs`, `SalesforceWriteAccess.cs`, `SalesforceTokenRefresh.cs`, `SalesforceTokenExchange.cs`, `ISalesforceTokenExchange.cs`, `SalesforceTokenGrant.cs`, `Configuration/SalesforceOAuthConfiguration.cs`, `Configuration/SalesforceMcpOptions.cs`, `Accounts/SalesforceConnectionEndpoints.cs`; Contracts `ConnectSalesforceConnection.cs`, `RefreshSalesforceConnection.cs`, `DisconnectSalesforce.cs`, `SalesforceConnection.cs`, `Signals/SalesforceConnected.cs`, `SalesforceConnectionRejected.cs`, `SalesforceDisconnected.cs`, `SalesforceRefreshed.cs`
- Tests: rewrite `Salesforce/SalesforceFacts.cs`; delete `SalesforceAccountFacts.cs`, `SalesforceOAuthFacts.cs`; `SalesforceEndpointFacts.cs` asserts the module maps no routes

**Interfaces:**
- `ISalesforce` keeps `PrepareWrite`, `ConfirmWrite`, `Query`, `ReadSchema`, `ReadUserInfo`. Connection management is `IConnection`.

- [ ] **Step 1: Rewrite the facts**

In `SalesforceFacts`: `Fixture` loses `Handoff`; `StartAsync` registers only `ISalesforceProvider`; `ConnectAsync` becomes

```csharp
    private static readonly string Key = ConnectionKeys.For(BrainScope.Create("owner", "owner").Id, "salesforce", "org");

    private static async Task<ISalesforce> ConnectAsync(ModuleBrain brain, DateTimeOffset? expiresAt = null)
    {
        CallerContextStamper.Stamp(new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
        await brain.AuthorizeCallerAsync();
        var grant = new OAuthGrant("org-oauth", "access-token", "refresh-token", expiresAt ?? DateTimeOffset.UtcNow.AddHours(1), "mcp_api refresh_token", null,
            """{"access_token":"access-token","refresh_token":"refresh-token","instance_url":"https://acme.my.salesforce.com"}""");
        await brain.Grains.GetGrain<IConnectionInbound>(Key).AcceptGrant(grant);
        return brain.Get<ISalesforce>(Key);
    }
```

Facts: `ConnectPublishesSalesforceConnectedAndConsumesNonce` → `AGrantConnectsTheOrgAndRecordsItsInstanceUrl` (observe `ConnectionConnected`, assert `Account == "https://acme.my.salesforce.com"`); `ConnectWithoutNoncePublishesRejection` → `AcceptGrantRejectsAGrantWithoutAnHttpsInstanceUrl` (response without `instance_url` throws `SalesforceUnavailableException`, status stays Disconnected); `RefreshPublishesSalesforceRefreshedAndResolvesTheStoredRefreshToken` → `AWriteWithAnExpiredTokenRefreshesFirst`: register a fake `IOAuthTokenExchange` whose `RefreshAsync` records the refresh token and returns a fresh grant, connect with `expiresAt: DateTimeOffset.UtcNow.AddSeconds(-1)`, call `PrepareWrite`, assert the fake saw `"refresh-token"` and `provider.AccessToken == "fresh-access-token"`; `DisconnectPublishesSalesforceDisconnected` → uses `IConnection.Disconnect` and `ConnectionDisconnected`; the write, query and guard facts keep their bodies against `ISalesforce` from `ConnectAsync`.

- [ ] **Step 2: The neuron**

`SalesforceState : ConnectionState` keeps `[Id(8)] PendingWrite`, `[Id(9)] SubmittingWrite`; the instance URL is `Account`. `SalesforceNeuron(ISalesforceProvider provider, TimeProvider time, IPersistentState<SalesforceState> state) : ConnectionNeuron<SalesforceState>(state), ISalesforce`:

```csharp
    protected override Task<OAuthGrant> AcceptGrantAsync(OAuthGrant grant)
    {
        using var json = JsonDocument.Parse(grant.Response);
        if (!json.RootElement.TryGetProperty("instance_url", out var instance) || !Uri.TryCreate(instance.GetString(), UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps)
        { throw new SalesforceUnavailableException("Salesforce did not issue a valid HTTPS instance URL."); }
        if (Snapshot.Account != url.AbsoluteUri) { Snapshot.PendingWrite = null; Snapshot.SubmittingWrite = null; }
        Snapshot.Account = url.AbsoluteUri;
        return Task.FromResult(grant);
    }

    protected override async Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct)
    {
        try { await provider.InvokeAsync("getUserInfo", EmptyArguments(), credential.Value, ct); return ConnectionProbeResult.Connected(); }
        catch (SalesforceNotConnectedException) { return ConnectionProbeResult.Expired("The Salesforce access token was refused."); }
        catch (SalesforceUnavailableException error) { return ConnectionProbeResult.Failing(error.Message); }
    }

    private Task<JsonElement> ReadAsync(string tool, JsonElement arguments, CancellationToken ct)
        => UseCredentialAsync((credential, token) => provider.InvokeAsync(tool, arguments, credential.Value, token), ct);
```

`ReadWriteSchemaAsync` calls `UseCredentialAsync((c, t) => provider.ReadToolSchemaHashAsync(tool, c.Value, t), ct)` and returns `(Snapshot, hash, null)`; `SubmitWriteAsync` resolves the token through `UseCredentialAsync` too. `RejectAsync` becomes `MarkFailing(reason)`. `RequireConnection()` checks `Snapshot.Status == Connected && Snapshot.Account is not null`. Delete `Connect`, `Refresh`, `Disconnect`, `ReadConnection`, `Connection()`.

`SalesforceModule`: `Connectors` gains `OAuthMethods = [new("org-oauth", "https://login.salesforce.com/services/oauth2/authorize", "https://login.salesforce.com/services/oauth2/token", ["mcp_api", "refresh_token"], "salesforce", "ConsumerKey", "ConsumerSecret")]`; `Signals` keeps the four write/record signals; `Configure` registers `TimeProvider`, options, the MCP provider; no `IHttpModule`; `SalesforceModuleOptions` gains `AllowLoopbackMcp` and `ResolveMcpEndpoint()` from `SalesforceMcpOptions`.

- [ ] **Step 3: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce/DigitalBrain.Modules.Salesforce.csproj
dotnet test --project src/DigitalBrain.Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests
dotnet build src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce.Aspire.Hosting/DigitalBrain.Modules.Salesforce.Aspire.Hosting.csproj
git add src/DigitalBrain.Modules/Salesforce
git commit -m "Salesforce: one connection neuron; grant, refresh and routes are the Platform's"
```

---

### Task 7: GitHub switches

**Files:**
- Create: `GitHub/Repository/GitHubRepositoryNeuron.cs`, `GitHubRepositoryState.cs`, `GitHubRepository.cs` (immutable coordinates record replacing `GitHubRepositoryBinding`), `IGitHubInbound.cs`, `GitHubRepositoryIndex.cs`, `IGitHubUserAccess.cs`
- Modify: `Connections/GitHubInstallationTokens.cs` (methods take `GitHubRepository`, slots keyed by connection key), `Connections/GitHubRepositorySource.cs` + `IGitHubRepositorySource.cs` (`GitHubRepository` instead of binding; mismatch throws `GitHubAccessDeniedException` instead of `binding.Revoke()`), `GitHubWebhookIngress.cs` (routes through the index), `GitHubWebhookHandler.cs` (`GitHubRepository`), `GitHubModule.cs`, `Configuration/GitHubModuleOptions.cs` (drop `Repositories`, `ClientId`, `PublicOrigin`), `OAuth/GitHubUserAccess.cs` (becomes the `IGitHubUserAccess` default)
- Delete: `RepositoryNeuron.cs`, `RepositoryState.cs`, `GitHubConnectionsNeuron.cs`, `GitHubConnectionsState.cs`, `Connections/GitHubRepositoryBinding.cs`, `GitHubRepositoryBindings.cs`, `GitHubSetupService.cs`, `Configuration/GitHubRepositoryOptions.cs`, `OAuth/GitHubAuthentication.cs`, `GitHubOAuthHandler.cs`, `GitHubLogins.cs`, `GitHubRepositoryAccess.cs` (folded into `IGitHubUserAccess`), Contracts `IGitHubConnections.cs`, `GitHubConnectionRecord.cs`, `GitHubConnectionList.cs`, `RegisterGitHubConnection.cs`, `ConnectRepository.cs`, `Signals/RepositoryConnected.cs`, `RepositoryRefused.cs`, `RepositoryAccessRevoked.cs`, `GitHubConnectionRegistered.cs`; Aspire.Hosting `GitHub/GitHubHostingExtensions.cs` and `Configuration/GitHubRepositoryHostingOptions.cs`; the `ModelContextProtocol.Core` package reference
- Tests: rewrite `RepositoryFacts.cs` → `Repository/GitHubRepositoryFacts.cs`; delete `GitHubConnectionsFacts.cs`; `AppAuthFacts.cs` and `OAuthCredentialFacts.cs` switch from `GitHubRepositoryBinding` to `GitHubRepository`; delete `OAuthOptionsAreClonedBeforeAsyncSecretRelease`; `Tests.Hosting/GitHubAppHostingFacts.cs` keeps the App projection theory
- Modify: `src/Testing/DigitalBrain.Testing.Reference/ReferenceBrain.cs:43` (drop the GitHub `ConfigureModule` line)

**Interfaces:**
- `IRepository` loses `Connect`, `ResolveRepository`; keeps `Refresh`, `Read`, `ReadPullRequest`, `ReadPullRequests`, `ReadReviewEvidence`, `ReadRequiredChecks`; `AcceptRepositoryEvent` moves to `IGitHubInbound` (`[PlatformOnly]`).
- `RepositoryView(string ConnectionId, bool Connected, IReadOnlyList<PullRequestSnapshot> PullRequests, DateTimeOffset? LastWebhookAt)`.
- `GitHubRepository(string Key, long AppId, long InstallationId, long RepositoryId, string Owner, string Name)` with `RepositoryPath`, `ApiHost => new Uri("https://api.github.com/")`.
- `IGitHubUserAccess.ResolveAsync(string userToken, long appId, string repositoryUrl, CancellationToken ct) : Task<GitHubRepository>` (the `Key` left empty; the neuron fills it).
- `IGitHubRepositoryIndex` keyed by `installation/{id}`: `Add(key)`, `Remove(key)`, `Read()`.

- [ ] **Step 1: Write the failing facts**

`Repository/GitHubRepositoryFacts.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Connections;
using DigitalBrain.Framework.Platform.Connections.Signals;
using DigitalBrain.Framework.Platform.Integrations;
using DigitalBrain.Microsoft.GitHub;
using DigitalBrain.Microsoft.GitHub.Signals;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.Microsoft.GitHub.Tests.Repository;

public sealed class GitHubRepositoryFacts
{
    private static readonly string Scope = BrainScope.Create("owner", "owner").Id;
    private static readonly string Key = ConnectionKeys.For(Scope, "github", "digitalbrain");
    private static readonly CallerContext Owner = new() { PrincipalId = "owner", AccountId = "owner", BrainId = "owner", Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp };

    private static Task<ModuleBrain> StartAsync(CancellationToken ct) => ModuleTest.Create()
        .WithExecution(new() { PrivateConfiguration = new Dictionary<string, string?> { [IntegrationSchema.Key("github", "AppId")] = "7", [IntegrationSchema.Key("github", "PrivateKeyPem")] = "unused", [IntegrationSchema.Key("github", "WebhookSecret")] = "0123456789abcdef" } })
        .WithModule<GitHubModule>()
        .ConfigureSilo(silo =>
        {
            silo.Services.AddSingleton<IGitHubRepositorySource>(new FakeGitHubRepositorySource());
            silo.Services.AddSingleton<IGitHubUserAccess>(new FakeUserAccess());
            silo.Services.AddSingleton<IGitHubInstallationVerifier>(new FakeInstallationVerifier());
        })
        .StartAsync(ct);

    private static async Task<RepositoryView> ConnectAsync(ModuleBrain brain)
    {
        CallerContextStamper.Stamp(Owner);
        await brain.AuthorizeCallerAsync();
        await brain.Grains.GetGrain<IConnectionInbound>(Key).AcceptGrant(new("oauth", "user-token", null, null, "", "https://github.com/intochat/digitalbrain", "{}"));
        return await brain.Get<IRepository>(Key).Read();
    }

    [Fact]
    public async Task AcceptGrantResolvesTheInstallationAndConnects()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        try
        {
            await using var connected = await brain.Observe<ConnectionConnected>(brain.Get<IRepository>(Key), ct);
            var view = await ConnectAsync(brain);
            Assert.True(view.Connected);
            Assert.Equal("intochat/digitalbrain", (await connected.NextAsync(ct: ct)).Account);
            Assert.Equal([Key], await brain.Grains.GetGrain<IGitHubRepositoryIndex>("installation/9").Read());
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task AWebhookRoutesThroughTheRepositoryIndexToTheConnection()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        try
        {
            await ConnectAsync(brain);
            await using var changed = await brain.Observe<PullRequestChanged>(brain.Get<IRepository>(Key), ct);
            var ingress = brain.SiloServices.GetRequiredService<GitHubWebhookIngress>();
            var body = System.Text.Encoding.UTF8.GetBytes("""{"action":"opened","number":1,"installation":{"id":9},"repository":{"id":11,"name":"digitalbrain","owner":{"login":"intochat"}}}""");
            Assert.Equal(GitHubWebhookAcceptance.Accepted, await ingress.HandleAsync(body, Headers(body, "pull_request", "0123456789abcdef"), ct));
            Assert.Equal(1, (await changed.NextAsync(ct: ct)).Number);
            Assert.Equal(GitHubWebhookAcceptance.Duplicate, await ingress.HandleAsync(body, Headers(body, "pull_request", "0123456789abcdef", sameDelivery: true), ct));
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task AReactivatedRepositoryStillReceivesWebhooks()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        try
        {
            await ConnectAsync(brain);
            await brain.RestartSiloAsync(ct);
            await using var changed = await brain.Observe<PullRequestChanged>(brain.Get<IRepository>(Key), ct);
            var body = System.Text.Encoding.UTF8.GetBytes("""{"action":"opened","number":2,"installation":{"id":9},"repository":{"id":11,"name":"digitalbrain","owner":{"login":"intochat"}}}""");
            Assert.Equal(GitHubWebhookAcceptance.Accepted, await brain.SiloServices.GetRequiredService<GitHubWebhookIngress>().HandleAsync(body, Headers(body, "pull_request", "0123456789abcdef"), ct));
            Assert.Equal(2, (await changed.NextAsync(ct: ct)).Number);
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task ARevokedInstallationMarksTheConnectionFailing()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        try
        {
            await ConnectAsync(brain);
            await using var failing = await brain.Observe<ConnectionFailing>(brain.Get<IRepository>(Key), ct);
            var body = System.Text.Encoding.UTF8.GetBytes("""{"action":"deleted","installation":{"id":9}}""");
            await brain.SiloServices.GetRequiredService<GitHubWebhookIngress>().HandleAsync(body, Headers(body, "installation", "0123456789abcdef"), ct);
            await failing.NextAsync(ct: ct);
            Assert.False((await brain.Get<IRepository>(Key).Read()).Connected);
            await Assert.ThrowsAsync<GitHubAccessDeniedException>(() => brain.Get<IRepository>(Key).ReadPullRequests());
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    [Fact]
    public async Task AGrantForARepositoryTheAppCannotReachIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        CallerContextStamper.Stamp(Owner);
        try
        {
            await brain.AuthorizeCallerAsync();
            await Assert.ThrowsAsync<GitHubUnavailableException>(() => brain.Grains.GetGrain<IConnectionInbound>(Key).AcceptGrant(new("oauth", "user-token", null, null, "", "https://github.com/intochat/elsewhere", "{}")));
            Assert.Equal(ConnectionStatus.Disconnected, (await brain.Get<IConnection>(Key).Read()).Status);
        }
        finally { Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey); }
    }

    private static Dictionary<string, string[]> Headers(byte[] body, string eventName, string secret, bool sameDelivery = false) => new()
    {
        ["X-GitHub-Delivery"] = [sameDelivery ? "11111111-1111-1111-1111-111111111111" : Guid.NewGuid().ToString()],
        ["X-GitHub-Event"] = [eventName],
        ["X-Hub-Signature-256"] = ["sha256=" + Convert.ToHexStringLower(System.Security.Cryptography.HMACSHA256.HashData(System.Text.Encoding.UTF8.GetBytes(secret), body))],
    };

    private sealed class FakeUserAccess : IGitHubUserAccess
    {
        public Task<GitHubRepository> ResolveAsync(string userToken, long appId, string repositoryUrl, CancellationToken ct)
            => repositoryUrl.EndsWith("/digitalbrain", StringComparison.Ordinal)
                ? Task.FromResult(new GitHubRepository("", appId, 9, 11, "intochat", "digitalbrain"))
                : throw new GitHubUnavailableException("The user and GitHub App must both have access to the requested repository.");
    }

    private sealed class FakeInstallationVerifier : IGitHubInstallationVerifier
    {
        public Task VerifyAsync(GitHubRepository repository, CancellationToken ct) => Task.CompletedTask;
    }
}
```

The duplicate fact above uses a fixed delivery id for both calls; make the first call use the same fixed id too (pass `sameDelivery: true` on both) so the second is a true replay.

`FakeGitHubRepositorySource` (existing in `RepositoryFacts.cs`) moves to its own file and takes `GitHubRepository` instead of the binding.

- [ ] **Step 2: Run and watch them fail**

```bash
dotnet test --project src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests -- --filter-class "*GitHubRepositoryFacts*"
```

- [ ] **Step 3: The coordinates, the index, the inbound contract**

`Repository/GitHubRepository.cs`:

```csharp
namespace DigitalBrain.Microsoft.GitHub;

[GenerateSerializer, Alias("github.repository-coordinates")]
public sealed record GitHubRepository(
    [property: Id(0)] string Key,
    [property: Id(1)] long AppId,
    [property: Id(2)] long InstallationId,
    [property: Id(3)] long RepositoryId,
    [property: Id(4)] string Owner,
    [property: Id(5)] string Name)
{
    public Uri ApiHost => new("https://api.github.com/");
    public string RepositoryPath => $"repos/{Uri.EscapeDataString(Owner)}/{Uri.EscapeDataString(Name)}";
}
```

`Repository/IGitHubInbound.cs`:

```csharp
[PlatformOnly, Alias("github.inbound"), Orleans.Metadata.DefaultGrainType("github.repository")]
internal interface IGitHubInbound : INeuron
{
    Task<bool> AcceptRepositoryEvent(RepositoryEvent receipt, CancellationToken cancellationToken = default);
    Task Revoke(string reason);
}
```

`Repository/GitHubRepositoryIndex.cs`: same shape as `GmailMailboxIndex` (`IGitHubRepositoryIndex : IGrainWithStringKey { Add, Remove, Read }`, state `string[] Keys`), grain type `github.repository-index`, keyed `installation/{installationId}`.

`Repository/IGitHubUserAccess.cs`: the interface above plus `internal sealed class GitHubUserAccess(IHttpClientFactory clients) : IGitHubUserAccess` holding today's `GitHubUserAccess.ResolveAsync` body, returning `GitHubRepository` with an empty `Key`. `IGitHubInstallationVerifier { Task VerifyAsync(GitHubRepository, ct) }` is implemented by `GitHubInstallationTokens` (today's `VerifyRepositoryAsync`).

- [ ] **Step 4: The neuron**

`Repository/GitHubRepositoryState.cs`:

```csharp
[GenerateSerializer, Alias("github.repository-state")]
internal sealed class GitHubRepositoryState : ConnectionState
{
    [Id(8)] public long AppId { get; set; }
    [Id(9)] public long InstallationId { get; set; }
    [Id(10)] public long RepositoryId { get; set; }
    [Id(11)] public string Owner { get; set; } = "";
    [Id(12)] public string Name { get; set; } = "";
    [Id(13)] public PullRequestSnapshot[] PullRequests { get; set; } = [];
    [Id(14)] public string[] ProcessedDeliveries { get; set; } = [];
    [Id(15)] public DateTimeOffset? LastWebhookAt { get; set; }
}
```

`Repository/GitHubRepositoryNeuron.cs`: `ConnectionNeuron<GitHubRepositoryState>, IRepository, IGitHubInbound`, constructor `(IGitHubRepositorySource source, IGitHubUserAccess access, IGitHubInstallationVerifier verifier, GitHubAppRegistration registration, IPersistentState<GitHubRepositoryState> state)`.

```csharp
    private GitHubRepository Repository => new(this.GetPrimaryKeyString(), Snapshot.AppId, Snapshot.InstallationId, Snapshot.RepositoryId, Snapshot.Owner, Snapshot.Name);

    protected override async Task<OAuthGrant> AcceptGrantAsync(OAuthGrant grant)
    {
        var appId = await registration.ReadAppIdAsync(CancellationToken.None) ?? throw new GitHubUnavailableException("GitHub App integration is unavailable.");
        var target = grant.Target ?? throw new GitHubUnavailableException("Choose one GitHub repository.");
        var resolved = (await access.ResolveAsync(grant.AccessToken, appId, target, CancellationToken.None)) with { Key = this.GetPrimaryKeyString() };
        await verifier.VerifyAsync(resolved, CancellationToken.None);
        if (Snapshot.InstallationId != 0 && Snapshot.InstallationId != resolved.InstallationId)
        { await GrainFactory.GetGrain<IGitHubRepositoryIndex>($"installation/{Snapshot.InstallationId}").Remove(this.GetPrimaryKeyString()); }
        Snapshot.AppId = resolved.AppId; Snapshot.InstallationId = resolved.InstallationId; Snapshot.RepositoryId = resolved.RepositoryId;
        Snapshot.Owner = resolved.Owner; Snapshot.Name = resolved.Name;
        Snapshot.Account = $"{resolved.Owner}/{resolved.Name}";
        // The user token proved access once; installation tokens do the ongoing work.
        return grant with { AccessToken = "installation", RefreshToken = null, ExpiresAt = null };
    }

    protected override Task OnConnectedAsync() => GrainFactory.GetGrain<IGitHubRepositoryIndex>($"installation/{Snapshot.InstallationId}").Add(this.GetPrimaryKeyString());
    protected override Task OnDisconnectedAsync() => GrainFactory.GetGrain<IGitHubRepositoryIndex>($"installation/{Snapshot.InstallationId}").Remove(this.GetPrimaryKeyString());

    protected override async Task<ConnectionProbeResult> ProbeAsync(Credential credential, CancellationToken ct)
    {
        try { await verifier.VerifyAsync(Repository, ct); return ConnectionProbeResult.Connected(); }
        catch (GitHubAccessDeniedException error) { return ConnectionProbeResult.Failing(error.Message); }
    }

    protected override Task<OAuthGrant> RefreshAsync(Credential credential, CancellationToken ct) => throw new InvalidOperationException("GitHub connections mint installation tokens; nothing refreshes.");

    public Task Revoke(string reason) => MarkFailing(reason);
```

`AcceptRepositoryEvent`, `Refresh`, `Read`, `ReadPullRequests`, `ReadPullRequest`, `ReadReviewEvidence`, `ReadRequiredChecks` keep today's bodies with these substitutions: `Binding` → `Repository`; `state.State ?? new()` → `Snapshot`; `Dictionary<int, PullRequestSnapshot>` → the `PullRequestSnapshot[]` ordered by number (convert at the edges of `Apply`); `List<string> ProcessedDeliveries` → array with the 512 cap; `RevokeAsync` → `MarkFailing(reason)` plus the index removal; `RequireAvailable` → `if (Snapshot.Status != ConnectionStatus.Connected) throw new GitHubAccessDeniedException(...)`; `RepositoryRefused` → `MarkFailing(reason)`; `RepositoryConnected` → nothing (the base publishes `ConnectionConnected`). A credential-less `UseCredentialAsync` is never called: the placeholder `"installation"` secret exists so the base's "connected" invariants hold; `GitHubInstallationTokens.GetTokenAsync(GitHubRepository, refresh, ct)` mints from the App key and caches by `repository.Key`.

`GitHubWebhookIngress`: constructor `(IGrainFactory grains, GitHubAppRegistration registration)`; targets are `await grains.GetGrain<IGitHubRepositoryIndex>($"installation/{installation}").Read()` when `installation` is present, filtered by `repository` id through each target neuron's `Read()`; a `ping` without installation validates the signature and returns `Accepted` with no fan-out; per target it calls `grains.GetGrain<IGitHubInbound>(key).AcceptRepositoryEvent(fact)`. `GitHubWebhookHandler.Classify(GitHubRepository, payload, eventName)` is called inside the neuron's `AcceptRepositoryEvent` (it needs the coordinates), so the ingress passes the raw classification inputs in `RepositoryEvent` (`Event`, `Action`, `Number`, `BodyHash`, plus `Installation`, `Repository`, `App` hints as new `long?` fields) and the neuron classifies. `GitHubTelemetry.TagReceipt` takes `GitHubRepository`.

`GitHubModule`:

```csharp
    public static ConnectorDefinition Connector => new("github", "GitHub", ["oauth"], ["github"])
    {
        Neurons = [typeof(IRepository)],
        Signals = [typeof(Signals.PullRequestChanged)],
        OAuthMethods = [new("oauth", "https://github.com/login/oauth/authorize", "https://github.com/login/oauth/access_token", [], "github", "ClientId", "ClientSecret")],
    };
```

with `Integration` gaining `.OffersSetting("ClientId")` (today `ClientId` is a module option; it moves to the integration so the Platform can read it next to the secret). `Configure` registers `GitHubAppRegistration`, `GitHubInstallationTokens` (also as `IGitHubInstallationVerifier`), `IGitHubRepositorySource`, `IGitHubUserAccess`, `GitHubWebhookIngress`, `IHttpSurface GitHubWebhookSurface`, and `AddHttpClient` for the user-access client. `GitHubModuleOptions` keeps `PublicWebhookUrl` only.

`ReferenceBrain.cs:43`: delete the GitHub `ConfigureModule` line and its `using`.

- [ ] **Step 5: Build, test, commit**

```bash
dotnet build src/DigitalBrain.Modules/Microsoft/GitHub/DigitalBrain.Modules.Microsoft.GitHub/DigitalBrain.Modules.Microsoft.GitHub.csproj
dotnet test --project src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests.Hosting
dotnet build src/Testing/DigitalBrain.Testing.Reference/DigitalBrain.Testing.Reference.csproj
dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj
git add src/DigitalBrain.Modules/Microsoft/GitHub src/Testing/DigitalBrain.Testing.Reference
git commit -m "GitHub: a repository connection is a neuron keyed by the brain; webhooks route through the installation index"
```

---

### Task 8: Platform deletions and the architecture rule

**Files:**
- Delete (Framework): `Platform/Auth/IOAuthCredentials.cs`, `ITokenHandoff.cs`, `OAuthTokens.cs`, `TokenHandoffExpiredException.cs`; `Platform/Integrations/Accounts/ExternalAccount.cs`, `IConnectionRegistry.cs`, `Connection.cs`, `ConnectionProbe.cs`; `Integrations/Accounts/ScopedConnections.cs`; `Auth/BrowserLogins.cs`, `BrowserLoginSurface.cs`, `BrowserLoginCorrelation.cs`, `BrowserLoginDefinition.cs`, `BrowserLoginWorkspace.cs`; `IModuleConnectionCredentials<T>` from `ConnectorDefinition.cs`
- Delete (Platform): `Auth/TokenHandoff.cs`, `Auth/OAuthCredentials.cs`; `Integrations/Accounts/ConnectionsNeuron.cs`, `ConnectionsState.cs`, `ConnectionEndpoints.cs`, `ConnectionAuthentication.cs`, `ConnectionCredentialProbe.cs`, `CredentialPresenceProbe.cs`, `ConnectionSignals.cs`, `ConnectConnectionInput.cs`, `ConnectionAction.cs`; `Integrations/IntegrationCredentials.cs`; `ModuleConnectionCredentials<T>` from `ModuleIntegrations.cs`
- Modify (Platform): `Integrations/IntegrationNeuron.cs` + `IntegrationState.cs` (sealed secrets in state), `ModuleIntegrations.cs` (`IntegrationHandle.ReleaseAsync` passes `IntegrationNeuron.PlatformCaller`), `PlatformHosting.cs` (remove the deleted registrations and `MapConnections()`), `Discovery/ConnectionsInventoryProvider.cs` → `Connections/ConnectionsInventoryProvider.cs` over the index, `Integrations/Accounts/ConnectionRequestsNeuron.cs` (unchanged body; move to `Connections/`)
- Modify (AI): `DigitalBrain.Modules.AI/Integrations/AiCredentials.cs` is unchanged (it never forged a caller; the forged one was in `IntegrationHandle`)
- Modify tests: Platform `AccountFacts.cs`, `ConnectionCompatibilityFacts.cs`, `ConnectorBindingFacts.cs`, `TokenHandoffFacts.cs` (delete), `RegistrationFacts.cs` (vault assertions), `SecretsFacts` (unchanged); Framework `Sdk/BrowserLoginsFacts.cs` (delete); CSharp `ScriptEdgeFacts.cs:229-235` (`IConnectionRegistry` → `IConnectionIndex`), `RunTokensFacts.cs:31`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/CredentialBoundaryFacts.cs` (new rule)

- [ ] **Step 1: Confirm with LSP that every symbol above has no production caller left**

For each: `IConnectionRegistry`, `Connection`, `IExternalConnection`, `ConnectionRow`, `IOAuthCredentials`, `ITokenHandoff`, `OAuthTokens`, `BrowserLogins`, `BrowserLoginSurface`, `BrowserLoginWorkspace`, `IModuleConnectionCredentials`, `IConnectionProbe`, `IntegrationCredentials`, `ScopedConnections`. Expected after Tasks 4 to 7: declarations, the Platform files being deleted in this task, and the test files listed. Anything else is a miss in an earlier task.

- [ ] **Step 2: Integration secrets become sealed state**

`IntegrationState`: `[Id(0)] public SealedSecret[] Secrets { get; set; } = [];` replaces `References`; `Settings` and `Revision` stay. `IntegrationNeuron`: constructor takes `ISecretSealer sealer` instead of `IntegrationCredentials`; `Apply` seals each secret field (`next.Secrets = [.. next.Secrets.Where(s => s.Name != field), sealer.Seal(field, value)]`) and keeps settings in `Settings`; `Clear` drops the sealed entry; `Release(CallerContext caller)` keeps its trust check and opens the sealed secrets itself (`values[secret.Name] = sealer.Open(secret)`), no vault call; `SnapshotOf` computes missing fields from `Secrets` names plus `Settings` keys. Add `internal static readonly CallerContext PlatformCaller = new() { PrincipalId = "integration.registration", AccountId = ":integrations", BrainId = ":integrations", Kind = CallerKind.Platform, StampedBy = TrustedEdge.Platform, AppId = "integration.registration" };` and `internal const string KeyPrefix = "integration/";`; `IntegrationHandle.ReleaseAsync` and `OAuthTokenExchange.ClientAsync` use `PlatformCaller`; every `IntegrationVault.GrainKeyPrefix` reference becomes `IntegrationNeuron.KeyPrefix`; `IntegrationVault` is deleted.

Rewrite in `RegistrationFacts`: `ClearingAFieldReturnsToPartialAndRemovesTheVaultEntry` → `ClearingAFieldReturnsToPartialAndReleaseNoLongerHasIt` (assert through `Release`); `TheVaultOwnerCannotBeAPrincipalId` → assert on `IntegrationNeuron.PlatformCaller.AccountId`; `RegistrationReactivationRetainsSecretsSettingsRevisionAndSdkWireIdentity` keeps asserting through `Release` after `brain.DeactivateAsync`.

- [ ] **Step 3: Delete, rewire, rewrite tests**

Delete every file in the task header. `PlatformHosting` loses the `ITokenHandoff`, `IOAuthCredentials`, `IModuleConnectionCredentials<>`, `IConnectionProbe`, `ConnectionCredentialProbe`, `IntegrationCredentials` lines and `endpoints.MapConnections()`; `ConnectionsInventoryProvider` moves and reads `IConnectionIndex.List()` then each `IConnection.Read()`.

Platform tests: delete `TokenHandoffFacts.cs`, `ConnectionCompatibilityFacts.cs` (a state-compatibility fact; the rule forbids it); `AccountFacts.cs` is deleted and its surviving intents already live in `ConnectionNeuronFacts` (`InventoryListsOnlyTheAmbientBrainsConnectionsWithoutSecrets` is re-added there as a fact over `ConnectionsInventoryProvider`); `ConnectorBindingFacts`: delete `ConnectionProbesRequireTheCallersOwnBrainAndMembership`, `LegacyConnectionGetsOnlyAnUnambiguousAuthenticationMethod`; in `CatalogAndConnectFollowAvailabilityAndWarnOnlyOnTransitions` replace the registry `Connect` with `brain.Get<IConnection>(ConnectionKeys.For(scope, "example", "one")).Connect("api-key", "secret")` and keep the catalog assertions; `ScriptAccountFacts` unchanged.

Framework tests: delete `Sdk/BrowserLoginsFacts.cs`. CSharp tests: `ScriptEdgeFacts.ScriptAccountsAreVisibleAndTheCredentialRegistryIsNot` asserts `IConnectionIndex` (platform-only) is not findable and `IConnectionRequests` is; `RunTokensFacts.cs:31` targets `IConnectionIndex` or `IConnection` as appropriate (read the fact; it asserts run-token infrastructure is not a user connector).

- [ ] **Step 4: The architecture rule**

Add to `CredentialBoundaryFacts`:

```csharp
    [Fact]
    public void OnlyTheOAuthCallbackAndTheShippedPublisherConstructAPlatformStamp()
    {
        var platform = ProductionArchitecture.Assemblies.Single(a => a.GetName().Name == "DigitalBrain.Platform");
        var offenders = platform.GetTypes().Where(t => t.Namespace?.StartsWith("OrleansCodeGen", StringComparison.Ordinal) != true)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).Cast<MethodBase>()
                .Concat(t.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static)))
            .Where(m => Calls(m).Any(c => c.IsConstructor && c.DeclaringType == typeof(CallerContext)))
            .Select(m => m.DeclaringType!.FullName!).Distinct().Order().ToArray();
        Assert.Equal(["DigitalBrain.Platform.Integrations.IntegrationNeuron", "DigitalBrain.Platform.Shipping.ShippedContentHosting"], offenders);
    }
```

The constructor call for `PlatformCaller` lives in `IntegrationNeuron`'s static initializer; `OAuthCallback` stamps a context it received, so it constructs none. `NoModuleConstructsACallerContext` already covers modules. Adjust the expected list to whatever LSP and the fact's first run report, provided every entry is one of the two sanctioned sites or the static field.

- [ ] **Step 5: Build everything that referenced the deleted types, test, commit**

```bash
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/DigitalBrain.Platform/DigitalBrain.Platform/DigitalBrain.Platform.csproj
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj
git add -A src/DigitalBrain.Framework src/DigitalBrain.Platform src/Testing src/DigitalBrain.Modules/Microsoft/CSharp/tests
git commit -m "Platform: delete the registry, the vault hop and the OAuth side door; integrations seal their own secrets"
```

---

### Task 9: The shell switches; the old routes die

**Files:**
- Modify (Dart, `src/DigitalBrain.Modules/Google/Flutter/app`): `core/lib/src/ui_client.dart:815-847`, `shell/lib/connections/connect_window.dart`, `shell/lib/connections/connections_settings.dart`, `shell/test/connect_window_test.dart`, `shell/test/connections_settings_test.dart`, `shell/test/connector_client_test.dart`
- Create: `core/lib/src/models/connection.dart` (mirror of `ConnectionView`)
- Modify: `src/Testing/DigitalBrain.Testing.Reference/Workspace/UserConnections.cs:27-37` (new route and row shape)

- [ ] **Step 1: Write the failing Dart tests**

`connector_client_test.dart` expects exactly these paths for catalog, list, connect, probe, disconnect and login:

```dart
    expect(paths, [
      '/connectors',
      '/brains/brain/connections',
      '/brains/brain/connections/one/connect',
      '/brains/brain/connections/one/probe',
      '/brains/brain/connections/one/disconnect',
      '/brains/brain/connections/one/login',
    ]);
```

`connections_settings_test.dart` `'narrow connections hide tokens and request authorization'`: the start action is `connectionsRequest('one/login', body: {'connectorId': 'gmail', 'authMethodId': 'google-oauth'})` and the opened URL has a `state` query parameter. Row fixtures use `connectorId`, `connectionId`, `status` (`Connected`, `Expired`, `Failing`, `Disconnected`), `account`, `authMethodId`.

`connect_window_test.dart` `'lists status and probes and disconnects'`: probe and disconnect post to `/{connectionId}/probe` and `/{connectionId}/disconnect` with an empty body.

- [ ] **Step 2: The Dart client and screens**

`ui_client.dart`: `connectorRequest` keeps only the catalog branch (`GET /connectors`); `workspaceConnectionsRequest` posts to `/brains/{id}/connections/$path` for `connect`, `probe`, `disconnect`, `login` with the connection id as the first path segment. `connect_window.dart`: `connect()` calls `request('${_connectionId.text}/connect', body: {'connectorId': source, 'authMethodId': authMethod, 'value': secret})`; `startOAuth()` calls `request('${_connectionId.text}/login', body: {'connectorId': source, 'authMethodId': authMethod})`; the actions call `request('$id/probe')` and `request('$id/disconnect')`. `connections_settings.dart`: `_start` uses the login route; delete the `connectorId == 'gmail'` caption and the `oauth:` id handling; `connectionStatus` maps the four enum names and keeps "Unavailable" as the fallback.

`core/lib/src/models/connection.dart`:

```dart
class ConnectionView {
  const ConnectionView({required this.connectorId, required this.connectionId, required this.authMethodId, required this.status, this.account, this.expiresAt, this.lastProbedAt, this.detail});
  final String connectorId, connectionId, authMethodId, status;
  final String? account, detail;
  final DateTime? expiresAt, lastProbedAt;
  factory ConnectionView.fromJson(Map<String, dynamic> json) => ConnectionView(
    connectorId: json['connectorId'] as String,
    connectionId: json['connectionId'] as String,
    authMethodId: json['authMethodId'] as String? ?? '',
    status: json['status'] as String? ?? 'Disconnected',
    account: json['account'] as String?,
    expiresAt: json['expiresAt'] == null ? null : DateTime.parse(json['expiresAt'] as String),
    lastProbedAt: json['lastProbedAt'] == null ? null : DateTime.parse(json['lastProbedAt'] as String),
    detail: json['detail'] as String?);
}
```

The C# rows serialize `Status` as a string: add `[JsonConverter(typeof(JsonStringEnumConverter))]` to `ConnectionStatus`, or project rows in `ConnectionEndpoints` to an anonymous object with `status = view.Status.ToString()`. Do the latter and keep the contract clean.

`UserConnections.AuthorizeSupabaseAsync`: post to `/brains/{id}/connections/supabase/connect` with `{ connectorId = "supabase", authMethodId = "connection-string", value = connection }` and assert `status == "Connected"`.

- [ ] **Step 3: Analyze, test, build, commit**

```bash
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter analyze && flutter test
cd ../core && dart analyze
cd ../ui && flutter analyze
dotnet build src/Testing/DigitalBrain.Testing.Reference/DigitalBrain.Testing.Reference.csproj
dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj
git add src/DigitalBrain.Modules/Google/Flutter/app src/Testing/DigitalBrain.Testing.Reference
git commit -m "Shell: one connection row, one connect, one login start; the Supabase fixture connects through the neuron"
```

---

### Task 10: Folder and namespace moves; spec corrections

**Files:**
- Move (Gmail): everything under `DigitalBrain.Modules.Google.Gmail/Gmail/` stays; `Configuration/GmailModuleOptions.cs` → root (`DigitalBrain.Google.Gmail`); Contracts `GmailDraftPreview.cs` → `Gmail/`
- Move (Salesforce): Contracts `Signals/*` → `Salesforce/Signals/` (namespace `DigitalBrain.Salesforce.Signals` stays); module `Configuration/SalesforceModuleOptions.cs` → root; delete the empty `Accounts/` folder
- Move (GitHub): `GitHubWebhookSurface.cs`, `GitHubWebhookAcceptance.cs`, `GitHubWebhookHandler.cs`, `GitHubWebhookIngress.cs` → `Webhook/` (namespace `DigitalBrain.Microsoft.GitHub.Webhook`); `Connections/GitHubInstallationTokens.cs`, `GitHubRepositorySource.cs`, `IGitHubRepositorySource.cs`, `GitHubAppRegistration.cs` → `Repository/`; delete `Connections/` and `OAuth/`; Contracts `GitHub/*` → `Repository/`, `Signals/PullRequestChanged.cs` → `Repository/Signals/`
- Move (Platform): `Integrations/Accounts/ConnectionRequestsNeuron.cs` → `Connections/`; delete `Integrations/Accounts/`
- Modify: `docs/superpowers/specs/2026-10-07-connections-restructure-design.md` (record the deviations listed at the top of this plan in a "Planning corrections" section), `CLAUDE.md` connectors section (one sentence: a connection is the connector's neuron at `connection/{brain}/{connector}/{id}` with sealed credential state; modules receive deployment credentials through `IModuleIntegrations<TModule>`)

- [ ] **Step 1: Move with `git mv`, fix namespaces and usings with LSP, build each project, run each module's suite**

```bash
dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
dotnet test --project src/DigitalBrain.Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```

- [ ] **Step 2: Sweep**

```bash
grep -rn -i 'TokenHandoff\|IOAuthCredentials\|IExternalConnection\|IConnectionRegistry\|BrowserLogin\|IModuleConnectionCredentials\|IntegrationVault\|SecretOwner\|GitHubRepositoryBinding\|services/{provider}' src CLAUDE.md --include='*.cs' --include='*.dart' --include='*.md' | grep -v '/obj/\|/bin/\|docs/superpowers'
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A src CLAUDE.md docs/superpowers/specs/2026-10-07-connections-restructure-design.md
git commit -m "Connections: folders equal namespaces in Gmail, Salesforce, GitHub and the Platform; spec records the planning corrections"
```

---

### Task 11: Seen running

- [ ] **Step 1: Start the host**

```bash
cd src/DigitalBrain.AppHost && aspire run
```

`mcp__aspire__list_resources`: every resource Running/Healthy. If the OS resource is unhealthy, read `list_console_logs` first; a connector whose `OAuthMethods` names an integration it did not declare fails `ConnectorDiscovery.Validate` at startup and says which.

- [ ] **Step 2: Drive it through digitalbrain-mcp**

Through `localhost:5081/mcp` on a real brain:
1. `neurons_context`, then `neurons_search` for `IConnection`.
2. `neurons_call` `IConnection.Connect` on `connection/{brain}/postgres/demo` with `authMethodId = connection-string` and a value pointing at the Aspire Postgres; `neurons_get` the same key: `Status = Connected`, no secret anywhere in the view.
3. `neurons_call` `IPostgresServer.Query` on that key with `select 1`; expect one row.
4. `neurons_call` `IConnection.Probe`; expect `Connected` and `LastProbedAt` set.
5. `POST /brains/{brain}/connections/gmail-demo/login` with `{connectorId: gmail, authMethodId: google-oauth}`; expect a Google URL with `state`, `code_challenge` and the Platform callback as `redirect_uri` when the Google integration is configured, otherwise HTTP 409 naming `google-oauth`.
6. `neurons_call` `IConnection.Disconnect` on the Postgres key; `GET /brains/{brain}/connections` no longer lists it.

- [ ] **Step 3: Telemetry**

`mcp__aspire__list_traces`: spans for `Connect`, `Query`, `Probe`, `Disconnect` on the `postgres` grain and the `connection.index` grain; `list_trace_structured_logs` on the login start shows no token or client secret; `list_structured_logs` filtered to `OAuth` shows the login start line and nothing with a secret value.

- [ ] **Step 4: Regression net**

```bash
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
dotnet test --project src/DigitalBrain.Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/GitHub/tests/DigitalBrain.Modules.Microsoft.GitHub.Tests
dotnet test --project src/DigitalBrain.Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
dotnet test --project src/DigitalBrain.Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test --project src/DigitalBrain.Modules/ClickHouse/tests/DigitalBrain.Modules.ClickHouse.Tests
dotnet test --project src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*GoldenJourneyFacts*"
cd src/DigitalBrain.Modules/Google/Flutter/app/shell && flutter test
```

Expected: all green. The E2E fact needs Docker with Linux containers; if absent, report it rather than skipping silently.
