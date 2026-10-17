# Apps: real owners, Marketplace, Install — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every app lives in a real account's brain; published apps appear in a Marketplace that anyone can install from (copy with origin and update offers); the shell opens on a Home of My apps + Marketplace; the Assistant is the default-installed `os/assistant` app.

**Architecture:** Seeded `intochat` and `os` accounts replace the `"intochat"`/`"os"` pseudo-brains, which fixes the shipped-app verification refusal. The app neuron gains Publish/ExportPublished/Replace and origin/edited state; a constant-key `IMarketplace` neuron holds listings; an `AppInstaller` copies published bundles into the caller's brain. The agent runner gains Task-shaped turns with turn signals and scripted model profiles so a script app can drive it; the Flutter shell gains Home, Marketplace and detail screens and docks any app.

**Tech Stack:** .NET / Orleans neurons, ASP.NET minimal APIs, xunit v3 (Microsoft.Testing.Platform), sandbox C# scripts (`dotnet run app.cs`), Flutter (Dart) shell, Aspire AppHost.

**Spec:** `docs/superpowers/specs/2026-10-05-apps-ownership-marketplace-design.md`

## Global Constraints

- Work on branch `os`; build and test per project, never the `.slnx`.
- Persisted grain state: append `[Id(n)]`, never renumber; concrete arrays, not interface lists.
- No boilerplate `/// <summary>`; sentence-named facts; `TestContext.Current.CancellationToken`; real grains over mocks.
- No LLM in the publish gate or the signal path: tests use `scripted/<key>` models.
- Scripts never see credentials, price books or `[PlatformOnly]` contracts; the script edge stays Task-only.
- Wire-shape changes in C# records are mirrored in Dart in the same change.
- Seeded-account endpoints exist only in Open posture (404 otherwise).
- Publish refuses any version not verified green; Install refuses a name clash and self-install (409); Update refuses an edited copy (409).
- `AppVersions.Compare` is the only version comparer.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Execution order

Parts are grouped by area below; execute tasks in this order (dependencies noted in each task):

1. **B0** guards name the app neuron's real grain type (existing bug: `"apps.app"` vs `"apps.app2"`)
2. **A1** seeded accounts → **A2** seeded-account endpoints → **A3** publishers are real brains (fixes the `OutsideWorkspace` refusal) → **A4** AppHost seeds IntoChat
3. **B1** origin, edited, icon → **A5** app folders round-trip
4. **B2** publish + Marketplace neuron → **B3** install, replace, update → **B4** HTTP routes → **B5** IntoChat apps ship icons
5. **A6** startup sync and write-back
6. **B6** new brains install OS defaults
7. **C1** task-shaped turns → **C2** scripted model profiles → **C3** `os/assistant` app → **C4** retire the built-in Assistant window
8. **D1** … **D9** shell (models, icon, detail, home, publish, home as start view, docking, seeded sign-in, cleanup)
9. **D10** C# package-model leftovers + docked Customer Researcher → **D11** CLAUDE.md
10. Final smoke: `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` — all resources Healthy, no "stays out" lines; Customer Researcher in the Marketplace; Install → My apps → Open; as `intochat` edit + publish → owner sees "Update available" and `src/IntoChat/Apps/CustomerResearcher` changes in `git status`.

## Review Focus

1. **An update must keep the user's data.** Updating an installed Customer Researcher keeps its Postgres rows, settings and connections. Pinned by B3's `StorageHookFacts` Replace fact.
2. **A publish in dev must not silently overwrite uncommitted repo edits.** Write-back (A6) overwrites the app folder. Pinned by A6's facts: equal versions write nothing, and a read-only source is never written. Executors: before writing, log the folder path and the version being replaced.
3. **The tests for a shipped app must actually run against real brains.** The regression fact in A3 (the test script calls its scratch copy through the call filter as an App caller) must fail before A3's fix and pass after. Without it, every shipped app silently stays out again.
4. **Two sends at once in the Assistant.** A second send while a turn is running is refused, not interleaved. C3 checks for this and adds the refusal to `BeginConversation` if it's missing.
5. **The seeded login can't be used in production.** Pinned by A2's facts: the seeded-account routes answer 404 in a non-Open posture, and accounts without a password never appear.

Known pre-existing issue, left out of scope: `Rollback` calls `OnRetired` for removed behaviors, and the Postgres hook then retires app-level tables. File a follow-up.

---

## Part A — Real owners and repo ↔ brain sync

Spec §1 (seeded accounts, seeded-account endpoints, real publisher brains) and §3 (repo ↔ brain sync),
including the regression fix for the `OutsideWorkspace` refusal that keeps every shipped app out.

Test projects touched by Part A:

| Project | Command |
|---|---|
| Platform unit | `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit` |
| Apps unit | `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` |
| OS unit | `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit` |
| AppHost build | `dotnet build src/DigitalBrain/AppHost/DigitalBrain.AppHost` |

Ordering: A1–A4 have no dependency on other parts. **A5 depends on Part B task B1 (`AppManifest.Icon`).
A6 depends on Part B task B2 (`IApp.Publish`, `IApp.ExportPublished`, `AppSnapshot.PublishedVersion`,
`AppPublished`) and on A5.** Execute A5/A6 after B2 lands.

---

### Task A1: Seeded accounts

**Files:**
- Create: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Identity/SeededAccountOptions.cs`
- Create: `src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Directory/SeededAccountsStartup.cs`
- Modify: `src/DigitalBrain/Platform/DigitalBrain.Platform/PlatformHosting.cs` (bind options, add startup task beside `IdentityMigrationStartup`)
- Test: `src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountFacts.cs`

**Interfaces:**
- Consumes: `IPrincipal.Register(string password, string displayName)`, `IPrincipal.Authenticate(string)`, `IPrincipal.DefaultMembership()` (internal, `Platform/Identity/Authority/IdentityActors.cs`).
- Produces:
  - `DigitalBrain.Platform.Identity.Configuration.SeededAccountOptions` (namespace matches `AuthOptions`, same file folder) with `public const string SectionName = AuthOptions.SectionName;` and `public IList<SeededAccount> Accounts { get; } = [];`
  - `public sealed class SeededAccount { public string Username { get; set; } = ""; public string? Password { get; set; } public string DisplayName { get; set; } = ""; }`
  - `internal sealed class SeededAccountsStartup(IGrainFactory grains, IOptions<SeededAccountOptions> options, ILogger<SeededAccountsStartup> logger) : IStartupTask`

- [ ] **Step 1: Write the failing test**

`src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountFacts.cs`:

```csharp
using DigitalBrain.Framework.Platform.Identity;
using DigitalBrain.Platform.Identity.Configuration;
using DigitalBrain.Platform.Identity.Directory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace DigitalBrain.Platform.Tests.Unit.Identity;

public sealed class SeededAccountFacts
{
    [Fact]
    public async Task SeededAccountsAreRegisteredOnceAndKeepTheirAccountAcrossRestarts()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var options = new SeededAccountOptions();
        options.Accounts.Add(new() { Username = "intochat", Password = "intochat-development", DisplayName = "IntoChat" });
        var startup = new SeededAccountsStartup(brain.Grains, Options.Create(options), NullLogger<SeededAccountsStartup>.Instance);

        await startup.Execute(ct);
        var directory = brain.Get<IIdentityDirectory>(IdentityGrains.Directory);
        var first = await directory.AuthenticateAsync("intochat", "intochat-development", ct);
        Assert.NotNull(first);
        Assert.Equal("IntoChat", first.DisplayName);

        await startup.Execute(ct);
        Assert.Equal(first, await directory.AuthenticateAsync("intochat", "intochat-development", ct));
    }

    [Fact]
    public async Task ASeededAccountWithoutAPasswordExistsButCannotSignIn()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var options = new SeededAccountOptions();
        options.Accounts.Add(new() { Username = "os", DisplayName = "DigitalBrain OS" });
        var startup = new SeededAccountsStartup(brain.Grains, Options.Create(options), NullLogger<SeededAccountsStartup>.Instance);

        await startup.Execute(ct);
        await startup.Execute(ct);

        var membership = await brain.Grains.GetGrain<DigitalBrain.Platform.Identity.Authority.IPrincipal>("os").DefaultMembership();
        Assert.NotNull(membership);
        Assert.Null(await brain.Get<IIdentityDirectory>(IdentityGrains.Directory).AuthenticateAsync("os", "", ct));
    }

    [Fact]
    public async Task AChangedSeedPasswordLeavesTheExistingAccountUntouched()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var directory = brain.Get<IIdentityDirectory>(IdentityGrains.Directory);
        var existing = await directory.RegisterAsync("intochat", "original-password", "IntoChat", ct);
        var options = new SeededAccountOptions();
        options.Accounts.Add(new() { Username = "intochat", Password = "different-password", DisplayName = "IntoChat" });

        await new SeededAccountsStartup(brain.Grains, Options.Create(options), NullLogger<SeededAccountsStartup>.Instance).Execute(ct);

        Assert.Equal(existing, await directory.AuthenticateAsync("intochat", "original-password", ct));
        Assert.Null(await directory.AuthenticateAsync("intochat", "different-password", ct));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit --filter "FullyQualifiedName~SeededAccountFacts"`
Expected: build FAIL — `SeededAccountOptions` / `SeededAccountsStartup` do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Identity/SeededAccountOptions.cs`:

```csharp
namespace DigitalBrain.Platform.Identity.Configuration;

// Accounts a deployment brings with it: first-party publishers ("intochat", "os") and, in
// development, accounts to switch into. Bound from DigitalBrain:Auth:Accounts:{n}. An entry
// without a password owns a brain but can never sign in.
public sealed class SeededAccountOptions
{
    public const string SectionName = AuthOptions.SectionName;

    public IList<SeededAccount> Accounts { get; } = [];
}

public sealed class SeededAccount
{
    public string Username { get; set; } = "";
    public string? Password { get; set; }
    public string DisplayName { get; set; } = "";
}
```

`src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Directory/SeededAccountsStartup.cs`:

```csharp
using System.Security.Cryptography;
using DigitalBrain.Platform.Identity.Authority;
using DigitalBrain.Platform.Identity.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Orleans;
using Orleans.Runtime;

namespace DigitalBrain.Platform.Identity.Directory;

// Registers each seeded account once. An account that already exists is left as it is: a seed
// never resets a password someone may have changed.
internal sealed class SeededAccountsStartup(IGrainFactory grains, IOptions<SeededAccountOptions> options, ILogger<SeededAccountsStartup> logger) : IStartupTask
{
    public async Task Execute(CancellationToken cancellationToken)
    {
        foreach (var seed in options.Value.Accounts)
        {
            var principal = grains.GetGrain<IPrincipal>(seed.Username);
            if (await principal.DefaultMembership().WaitAsync(cancellationToken) is not null)
            {
                if (seed.Password is { Length: > 0 } password && await principal.Authenticate(password).WaitAsync(cancellationToken) is null)
                { logger.LogWarning("Seeded account {Username} already exists with another password; it keeps that password.", seed.Username); }
                continue;
            }
            // A password-less seed gets an unguessable one nobody holds.
            var secret = seed.Password is { Length: > 0 } given ? given : Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            await principal.Register(secret, seed.DisplayName.Length > 0 ? seed.DisplayName : seed.Username).WaitAsync(cancellationToken);
        }
    }
}
```

`PlatformHosting.cs`, in `AddDigitalBrainPlatform` directly after `silo.AddStartupTask<IdentityMigrationStartup>();`:

```csharp
        services.AddOptions<DigitalBrain.Platform.Identity.Configuration.SeededAccountOptions>()
            .BindConfiguration(DigitalBrain.Platform.Identity.Configuration.SeededAccountOptions.SectionName);
        silo.AddStartupTask<SeededAccountsStartup>();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit --filter "FullyQualifiedName~SeededAccountFacts"`
Expected: PASS (3 tests). Then the whole project: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Identity/SeededAccountOptions.cs src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Directory/SeededAccountsStartup.cs src/DigitalBrain/Platform/DigitalBrain.Platform/PlatformHosting.cs src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountFacts.cs
git commit -m "feat(identity): seed configured accounts at startup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Seeded-account endpoints (Open posture only)

**Files:**
- Modify: `src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/IdentityEndpoints.cs`
- Test: `src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountEndpointFacts.cs`

**Interfaces:**
- Consumes: `SeededAccountOptions` (A1), `IPrincipal.Authenticate`, existing private `SignInAsync(Member, HttpContext)`.
- Produces:
  - `GET /identity/seeded-accounts` → `200 [{ "username": "...", "displayName": "..." }]` for seeded entries **with** a password; `404` unless posture is Open.
  - `POST /identity/seeded-accounts/{username}/login` → same cookie + `Member` body as `/identity/login`; `404` unless Open posture or unknown/password-less username.
  - `internal sealed record SeededAccountView(string Username, string DisplayName)` inside `IdentityEndpoints`.

- [ ] **Step 1: Write the failing test**

`src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountEndpointFacts.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DigitalBrain;
using DigitalBrain.Platform.Identity;
using DigitalBrain.Platform.Identity.Configuration;
using DigitalBrain.Platform.Identity.Directory;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace DigitalBrain.Platform.Tests.Unit.Identity;

public sealed class SeededAccountEndpointFacts
{
    [Fact]
    public async Task AnOpenHostListsSeededAccountsAndSignsIntoThemWithoutAPassword()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        await using var app = await StartAsync(brain, "Open", ct);
        using var client = new HttpClient(new HttpClientHandler { CookieContainer = new() }) { BaseAddress = new(app.Urls.Single()) };

        using var list = JsonDocument.Parse(await client.GetStringAsync("/identity/seeded-accounts", ct));
        var entry = Assert.Single(list.RootElement.EnumerateArray());
        Assert.Equal("intochat", entry.GetProperty("username").GetString());
        Assert.Equal("IntoChat", entry.GetProperty("displayName").GetString());

        using var login = await client.PostAsync("/identity/seeded-accounts/intochat/login", null, ct);
        login.EnsureSuccessStatusCode();
        using var session = JsonDocument.Parse(await client.GetStringAsync("/identity/session", ct));
        Assert.Equal("intochat", session.RootElement.GetProperty("principalId").GetString());

        using var hidden = await client.PostAsync("/identity/seeded-accounts/os/login", null, ct);
        Assert.Equal(HttpStatusCode.NotFound, hidden.StatusCode);
    }

    [Fact]
    public async Task ASecuredHostDoesNotRevealOrSignIntoSeededAccounts()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        await using var app = await StartAsync(brain, "Secured", ct);
        using var client = new HttpClient(new HttpClientHandler { CookieContainer = new() }) { BaseAddress = new(app.Urls.Single()) };
        // Secured hosts need a session first; a registered stranger still gets nothing.
        await brain.Get<DigitalBrain.Framework.Platform.Identity.IIdentityDirectory>(DigitalBrain.Framework.Platform.Identity.IdentityGrains.Directory)
            .RegisterAsync("stranger", "correct-password", "Stranger", ct);
        (await client.PostAsJsonAsync("/identity/login", new { principalId = "stranger", password = "correct-password" }, ct)).EnsureSuccessStatusCode();

        using var list = await client.GetAsync("/identity/seeded-accounts", ct);
        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        using var login = await client.PostAsync("/identity/seeded-accounts/intochat/login", null, ct);
        Assert.Equal(HttpStatusCode.NotFound, login.StatusCode);
    }

    private static async Task<WebApplication> StartAsync(ModuleBrain brain, string posture, CancellationToken ct)
    {
        var seeds = new SeededAccountOptions();
        seeds.Accounts.Add(new() { Username = "intochat", Password = "intochat-development", DisplayName = "IntoChat" });
        seeds.Accounts.Add(new() { Username = "os", DisplayName = "DigitalBrain OS" });
        await new SeededAccountsStartup(brain.Grains, Options.Create(seeds), NullLogger<SeededAccountsStartup>.Instance).Execute(ct);
        var builder = WebApplication.CreateBuilder();
        builder.Configuration[AuthOptions.PostureKey] = posture;
        builder.Configuration[SeededAccountOptions.SectionName + ":Accounts:0:Username"] = "intochat";
        builder.Configuration[SeededAccountOptions.SectionName + ":Accounts:0:Password"] = "intochat-development";
        builder.Configuration[SeededAccountOptions.SectionName + ":Accounts:0:DisplayName"] = "IntoChat";
        builder.Configuration[SeededAccountOptions.SectionName + ":Accounts:1:Username"] = "os";
        builder.Configuration[SeededAccountOptions.SectionName + ":Accounts:1:DisplayName"] = "DigitalBrain OS";
        builder.Services.AddSingleton<IDigitalBrain>(brain);
        builder.Services.AddSingleton(brain.SiloServices.GetRequiredService<DigitalBrain.Framework.Enforcement.IBrainAccess>());
        builder.Services.AddIdentity();
        var app = builder.Build();
        app.Urls.Add("http://127.0.0.1:0");
        app.UsePlatformHttp();
        IdentityEndpoints.Map(app);
        await app.StartAsync(ct);
        return app;
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit --filter "FullyQualifiedName~SeededAccountEndpointFacts"`
Expected: FAIL — `GET /identity/seeded-accounts` answers 404 in the Open test (route not mapped), then `Assert.Single` fails / `EnsureSuccessStatusCode` throws.

- [ ] **Step 3: Write minimal implementation**

In `IdentityEndpoints.Map`, after `routes.MapPost("/identity/brains", CreateBrainAsync);`:

```csharp
        routes.MapGet("/identity/seeded-accounts", SeededAccounts);
        routes.MapPost("/identity/seeded-accounts/{username}/login", SeededLoginAsync);
```

Add these members to `IdentityEndpoints`:

```csharp
    // Development switching: an Open host already acts as its owner without a login, so naming
    // and entering its seeded accounts adds no reach. Secured hosts answer as if absent.
    private static IResult SeededAccounts(IOptions<AuthOptions> auth, IOptions<SeededAccountOptions> seeds)
        => auth.Value.Posture != IdentityPosture.Open
            ? Results.NotFound()
            : Results.Ok(seeds.Value.Accounts
                .Where(seed => !string.IsNullOrEmpty(seed.Password))
                .Select(seed => new SeededAccountView(seed.Username, seed.DisplayName.Length > 0 ? seed.DisplayName : seed.Username))
                .ToArray());

    private static async Task<IResult> SeededLoginAsync(string username, HttpContext http, IDigitalBrain brain,
        IOptions<AuthOptions> auth, IOptions<SeededAccountOptions> seeds, CancellationToken ct)
    {
        if (auth.Value.Posture != IdentityPosture.Open) { return Results.NotFound(); }
        var seed = seeds.Value.Accounts.FirstOrDefault(entry => entry.Username == username && !string.IsNullOrEmpty(entry.Password));
        if (seed is null) { return Results.NotFound(); }
        var member = await brain.Get<IPrincipal>(seed.Username).Authenticate(seed.Password!).WaitAsync(ct);
        return member is null ? Results.Unauthorized() : await SignInAsync(member, http);
    }

    internal sealed record SeededAccountView(string Username, string DisplayName);
```

(`AuthOptions`, `IdentityPosture`, `SeededAccountOptions` are in the already-imported `DigitalBrain.Platform.Identity.Configuration` namespace; `IOptions` from the already-imported `Microsoft.Extensions.Options`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit --filter "FullyQualifiedName~SeededAccount"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/IdentityEndpoints.cs src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/SeededAccountEndpointFacts.cs
git commit -m "feat(identity): Open hosts list and sign into seeded accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: Publishers are real brains (fixes the shipped-app verification refusal)

Root cause being fixed: `ShippedAppPublisher` keyed apps `"intochat"/apps/...`; `NeuronAccess.ForBrainKey`
recognises only `workspace-<hash>` prefixes, so the scratch copy was Unclassified and `CallFilter`
refused the test script (`CallerKind.App`) with `OutsideWorkspace`. The existing facts never saw it
because `ScriptedTestRunner` never calls the app through the filter.

**Files:**
- Create: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Identity/PublisherDirectory.cs`
- Create: `src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Directory/PublisherDirectory.cs`
- Modify: `src/DigitalBrain/Platform/DigitalBrain.Platform/PlatformHosting.cs`
- Modify: `src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Shipping/IShippedContentPublisher.cs`
- Modify: `src/DigitalBrain/Platform/DigitalBrain.Platform/Shipping/ShippedContentHosting.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/IShippedAppSource.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/DirectoryShippedAppSource.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/EmbeddedShippedAppSource.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppsServiceCollectionExtensions.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppPublisher.cs`
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/OsApps.cs` (embedded source `account: "os"`, seed the `os` account, `OsBootService` reads the real `os` brain)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ShippedAppPublisherFacts.cs`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DirectoryShippedAppSourceFacts.cs`
- Test: `src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/PublisherDirectoryFacts.cs`
- Test: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs`

**Interfaces:**
- Consumes: `IPrincipal.DefaultMembership()`, `SeededAccountOptions` (A1).
- Produces:
  - `namespace DigitalBrain.Framework.Platform.Identity;`
    `public interface IPublisherDirectory { Task<PublisherBrain> Resolve(string username, CancellationToken ct); }`
    `public sealed record PublisherBrain(string Username, string AccountId, string BrainId) { public string ScopeId => BrainScope.Create(AccountId, BrainId).Id; }`
    `Resolve` throws `InvalidOperationException` for an unknown account.
  - `IShippedContentPublisher` becomes `{ string[] Accounts { get; } Task PublishAsync(PublisherBrain publisher, CancellationToken cancellationToken); }`
  - `IShippedAppSource` becomes `{ string Account { get; } IReadOnlyList<AppBundle> Load(); }` (A5 adds `Writable`/`Write`).
  - `DirectoryShippedAppSource(string path, string account, bool writable = false)`; `EmbeddedShippedAppSource(Assembly, string resourcePrefix, string account)`.
  - `AddShippedApps(this IServiceCollection, Assembly assembly, string resourcePrefix, string account)`.
  - Config: `DigitalBrain:Modules:apps:Shipped:{source}:Path` (required), `:Account` (required), `:Writable` (bool, default false).
  - Shipped apps live at `IApp.Key(publisher.ScopeId, name)`.

- [ ] **Step 1: Write the failing tests**

Replace `ShippedAppPublisherFacts.cs` wholesale with:

```csharp
using DigitalBrain;
using DigitalBrain.Apps;
using DigitalBrain.Enforcement;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Framework.Platform.Identity;
using DigitalBrain.Framework.Platform.Shipping;
using DigitalBrain.Platform.Shipping;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace DigitalBrain.Modules.Apps.Tests;

// Shipped apps are bundles the host verifies once and imports at startup into their publisher
// account's own brain: a green bundle lands as a live app there, a red one stays out, and an
// unchanged version is a no-op.
public sealed class ShippedAppPublisherFacts
{
    [Fact]
    public async Task AGreenBundleImportsOnceARedOneStaysOutAndABumpedVersionReimports()
    {
        var ct = TestContext.Current.CancellationToken;
        var runner = new ScriptedTestRunner();
        runner.BySourceMarker["passing"] = (0, "dbtest:pass Echo");
        runner.BySourceMarker["failing"] = (1, "dbtest:fail Echo\tWrong answer");
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<ITestScriptRunner>(runner)).StartAsync(ct);
        var first = await Register(brain, "first", ct);
        var red = await Register(brain, "red", ct);
        var versions = new Dictionary<string, string> { ["first"] = "1.0.0", ["red"] = "1.0.0" };
        IShippedAppSource[] sources = [new Source("first", versions), new Source("red", versions, tests: "failing")];

        await Ship(brain, sources, "false", ct);
        var app = brain.Get<IApp>(IApp.Key(first.ScopeId, "echo"));
        Assert.Equal(AppStatus.Drafted, (await app.Read()).Status);

        await Ship(brain, sources, "true", ct);
        var imported = await app.Read();
        Assert.Equal(AppStatus.Live, imported.Status);
        Assert.Equal("1.0.0", imported.Version);
        Assert.Equal("1.0.0", (await app.Export()).Version);
        Assert.Equal(AppStatus.Drafted, (await brain.Get<IApp>(IApp.Key(red.ScopeId, "echo")).Read()).Status);

        var before = (await app.Read()).Versions.Length;
        await Ship(brain, sources, "true", ct);
        Assert.Equal(before, (await app.Read()).Versions.Length);

        versions["first"] = "1.1.0";
        await Ship(brain, sources, "true", ct);
        Assert.Equal("1.1.0", (await app.Read()).Version);
    }

    // Regression: the tests script runs as an App caller of the publisher's brain and drives its
    // scratch copy through the call filter. A pseudo-brain key ("intochat/apps/...") had no scope
    // and every such call was refused, so no shipped app could ever go green.
    [Fact]
    public async Task TheTestsScriptMayDriveItsScratchCopyInThePublishersBrain()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<ITestScriptRunner>(new EdgeLikeRunner()))
            .StartAsync(ct);
        EdgeLikeRunner.Client = brain.Grains;
        var vendor = await Register(brain, "vendor", ct);

        await Ship(brain, [new Source("vendor", new() { ["vendor"] = "1.0.0" })], "true", ct);

        Assert.Equal(AppStatus.Live, (await brain.Get<IApp>(IApp.Key(vendor.ScopeId, "echo")).Read()).Status);
    }

    [Fact]
    public async Task ADownstreamCancellationFailsThePackageWithoutStoppingThePublisher()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<ITestScriptRunner>(new CancelledRunner())).StartAsync(ct);
        var first = await Register(brain, "first", ct);

        var publisher = await Ship(brain, [new Source("first", new() { ["first"] = "1.0.0" })], "true", ct);

        Assert.True(publisher.ExecuteTask!.IsCompletedSuccessfully);
        Assert.Equal(AppStatus.Drafted, (await brain.Get<IApp>(IApp.Key(first.ScopeId, "echo")).Read()).Status);
    }

    [Fact]
    public async Task PlatformStampsEachPublisherAccountsOwnBrainAndRestoresTheCaller()
    {
        var ct = TestContext.Current.CancellationToken;
        Caller.As("original");
        var original = CallerContextStamper.Require();
        try
        {
            var content = new RecordingContent();
            var directory = new FixedPublishers(new("first", "account-1", "brain-1"), new("second", "account-2", "brain-2"));
            await using var services = PublisherServices(content, directory);
            var publisher = Assert.IsAssignableFrom<BackgroundService>(Assert.Single(services.GetServices<IHostedService>()));
            await publisher.StartAsync(ct);
            await publisher.ExecuteTask!.WaitAsync(ct);
            Assert.Equal(["first", "second"], content.Callers.Select(caller => caller.PrincipalId).ToArray());
            Assert.Equal(["account-1", "account-2"], content.Callers.Select(caller => caller.AccountId).ToArray());
            Assert.Equal(["brain-1", "brain-2"], content.Callers.Select(caller => caller.BrainId).ToArray());
            Assert.All(content.Callers, caller =>
            {
                Assert.Equal(CallerKind.Platform, caller.Kind);
                Assert.Equal(TrustedEdge.Platform, caller.StampedBy);
            });
            Assert.Equal(original, CallerContextStamper.Require());
        }
        finally { Caller.Clear(); }
    }

    [Fact]
    public async Task AnUnknownPublisherAccountIsSkippedAndTheOthersStillShip()
    {
        var ct = TestContext.Current.CancellationToken;
        var content = new RecordingContent(["missing", "second"]);
        await using var services = PublisherServices(content, new FixedPublishers(new("second", "account-2", "brain-2")));
        var publisher = Assert.IsAssignableFrom<BackgroundService>(Assert.Single(services.GetServices<IHostedService>()));
        await publisher.StartAsync(ct);
        await publisher.ExecuteTask!.WaitAsync(ct);
        Assert.Equal(["second"], content.Callers.Select(caller => caller.PrincipalId).ToArray());
    }

    internal static async Task<PublisherBrain> Register(ModuleBrain brain, string username, CancellationToken ct)
    {
        await brain.Get<IIdentityDirectory>(IdentityGrains.Directory).RegisterAsync(username, "correct-password", username, ct);
        return await brain.SiloServices.GetRequiredService<IPublisherDirectory>().Resolve(username, ct);
    }

    internal static async Task<BackgroundService> Ship(ModuleBrain brain, IShippedAppSource[] sources, string selection, CancellationToken ct)
    {
        var content = new ShippedAppPublisher(
            brain.SiloServices.GetRequiredService<IGrainFactory>(),
            brain.SiloServices.GetRequiredService<ITestScriptRunner>(),
            sources, new ConfigurationBuilder().AddInMemoryCollection(
                new Dictionary<string, string?> { [ShippedAppPublisher.ShipOnStartupKey] = selection }).Build(),
            NullLogger<ShippedAppPublisher>.Instance);
        await using var services = PublisherServices(content, brain.SiloServices.GetRequiredService<IPublisherDirectory>());
        var publisher = Assert.IsAssignableFrom<BackgroundService>(Assert.Single(services.GetServices<IHostedService>()));
        await publisher.StartAsync(ct);
        await publisher.ExecuteTask!.WaitAsync(ct);
        return publisher;
    }

    private sealed class RecordingContent(string[]? accounts = null) : IShippedContentPublisher
    {
        public string[] Accounts => accounts ?? ["first", "second"];
        public List<CallerContext> Callers { get; } = [];
        public Task PublishAsync(PublisherBrain publisher, CancellationToken cancellationToken)
        {
            Callers.Add(CallerContextStamper.Require());
            return Task.CompletedTask;
        }
    }

    private sealed class FixedPublishers(params PublisherBrain[] known) : IPublisherDirectory
    {
        public Task<PublisherBrain> Resolve(string username, CancellationToken ct)
            => known.FirstOrDefault(publisher => publisher.Username == username) is { } found
                ? Task.FromResult(found)
                : throw new InvalidOperationException($"Publisher account '{username}' does not exist.");
    }

    internal static ServiceProvider PublisherServices(IShippedContentPublisher content, IPublisherDirectory directory)
        => new ServiceCollection()
            .AddLogging()
            .AddSingleton(content)
            .AddSingleton(directory)
            .AddSingleton<IHostApplicationLifetime>(new StartedLifetime())
            .AddShippedContentPublishing()
            .BuildServiceProvider();

    // Plays the sandbox edge: the script speaks as an App caller of the brain the runner was
    // stamped with, through the client, so every call crosses the neuron call filter.
    private sealed class EdgeLikeRunner : ITestScriptRunner
    {
        public static IGrainFactory? Client { get; set; }

        public async Task<AppTestRun> RunAsync(string appKey, string tests, CancellationToken cancellationToken)
        {
            var owner = CallerContextStamper.Require();
            CallerContextStamper.Stamp(owner with { Kind = CallerKind.App, StampedBy = TrustedEdge.AppProxy });
            try
            {
                await Client!.GetGrain<IApp>(appKey).Configure(new(), new());
                return new([new("Echo", true, "")], 0);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            { return new([new("Echo", false, error.Message)], 1); }
            finally { CallerContextStamper.Stamp(owner); }
        }
    }

    private sealed class CancelledRunner : ITestScriptRunner
    {
        public Task<AppTestRun> RunAsync(string appKey, string tests, CancellationToken cancellationToken)
            => throw new OperationCanceledException("The C# sandbox did not start.");
    }

    internal sealed class Source(string account, Dictionary<string, string> versions, string tests = "passing") : IShippedAppSource
    {
        public string Account => account;
        public IReadOnlyList<AppBundle> Load() =>
        [new("echo", versions[account], new("Echo", "Echo input", [new("ask", "Echo")], [], []),
            "## Scenario: Echo\nEchoes.", new() { [AppFiles.TestsPath] = tests })];
    }

    private sealed class StartedLifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => new(true);
        public CancellationToken ApplicationStopping => CancellationToken.None;
        public CancellationToken ApplicationStopped => CancellationToken.None;
        public void StopApplication() { }
    }
}
```

In `DirectoryShippedAppSourceFacts.ConfigurationNamesThePublishersAndPaths`, rename it to
`ConfigurationNamesTheSourcesAccountsAndPaths`, add the account key and assert it:

```csharp
            [ShippedAppsServiceCollectionExtensions.ConfigurationSection + ":vendor:Path"] = _root,
            [ShippedAppsServiceCollectionExtensions.ConfigurationSection + ":vendor:Account"] = "vendor-account",
```
```csharp
        Assert.Equal("vendor-account", source.Account);
```

and add:

```csharp
    [Fact]
    public void ASourceWithoutAnAccountIsAConfigurationError()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [ShippedAppsServiceCollectionExtensions.ConfigurationSection + ":vendor:Path"] = _root,
        }).Build();
        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddShippedApps(configuration));
    }
```

`src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/PublisherDirectoryFacts.cs`:

```csharp
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Framework.Platform.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DigitalBrain.Platform.Tests.Unit.Identity;

public sealed class PublisherDirectoryFacts
{
    [Fact]
    public async Task APublisherResolvesToItsAccountsDefaultBrainScope()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        var member = await brain.Get<IIdentityDirectory>(IdentityGrains.Directory).RegisterAsync("intochat", "correct-password", "IntoChat", ct);

        var publisher = await brain.SiloServices.GetRequiredService<IPublisherDirectory>().Resolve("intochat", ct);

        Assert.Equal(new PublisherBrain("intochat", member.AccountId, member.BrainId), publisher);
        Assert.Equal(BrainScope.Create(member.AccountId, member.BrainId).Id, publisher.ScopeId);
    }

    [Fact]
    public async Task AnUnknownPublisherIsAnError()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            brain.SiloServices.GetRequiredService<IPublisherDirectory>().Resolve("nobody", ct));
    }
}
```

In `OsBootFacts.cs`: both facts register the `os` publisher before seeding, and `SeedGreen` keys by its scope.
Replace each `await SeedGreen(brain, "...")` call site's brain setup by first calling
`var os = await RegisterOs(brain, ct);` immediately after `StartAsync(ct)` and passing `os` to every
`SeedGreen(brain, os, "...")`. Replace `SeedGreen` and add `RegisterOs`:

```csharp
    private static async Task<PublisherBrain> RegisterOs(ModuleBrain brain, CancellationToken ct)
    {
        await brain.Get<IIdentityDirectory>(IdentityGrains.Directory).RegisterAsync("os", "os-development-password", "DigitalBrain OS", ct);
        return await brain.SiloServices.GetRequiredService<IPublisherDirectory>().Resolve("os", ct);
    }

    // The "os" account's copy: created, built and recorded green so Export is allowed.
    // Seeding plays the platform: an unstamped call rides the trusted internal path.
    private static async Task<IApp> SeedGreen(ModuleBrain brain, PublisherBrain os, string name)
    {
        Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
        var source = brain.Get<IApp>(IApp.Key(os.ScopeId, name));
        await source.Create(new("Hello", "Shows hello world", [new("open", "Open")], [new("Greeting", "what to say", "hello")], []),
            "## Scenario: Greets\nIt greets.");
        await source.BeginBuild(null);
        await source.CompleteBuild(await source.CurrentBuildAttempt(), new() { ["tests.cs"] = "// t", ["behaviors/hello.cs"] = "// b" }, null);
        await source.RecordVerdicts([new("Greets", true, "ok")], green: true);
        return source;
    }
```

(add `using DigitalBrain.Framework.Platform.Identity;` to the file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter "FullyQualifiedName~Shipped"`
Expected: build FAIL — `IPublisherDirectory`, `PublisherBrain`, `IShippedAppSource.Account`, `IShippedContentPublisher.Accounts` do not exist.

(Sanity check of the regression: if you temporarily compile the new `EdgeLikeRunner` fact against the
old key scheme, it fails with "The target operation is not available in the selected brain." — the same
message the live sandbox logged.)

- [ ] **Step 3: Write the implementation**

`src/DigitalBrain/Framework/DigitalBrain.Framework/Platform/Identity/PublisherDirectory.cs`:

```csharp
using DigitalBrain.Framework.Enforcement;

namespace DigitalBrain.Framework.Platform.Identity;

// A publisher is an ordinary account; what it ships lives in that account's default brain.
public sealed record PublisherBrain(string Username, string AccountId, string BrainId)
{
    public string ScopeId => BrainScope.Create(AccountId, BrainId).Id;
}

public interface IPublisherDirectory
{
    Task<PublisherBrain> Resolve(string username, CancellationToken ct);
}
```

`src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Directory/PublisherDirectory.cs`:

```csharp
using DigitalBrain.Framework.Platform.Identity;
using DigitalBrain.Platform.Identity.Authority;
using Orleans;

namespace DigitalBrain.Platform.Identity.Directory;

internal sealed class PublisherDirectory(IGrainFactory grains) : IPublisherDirectory
{
    public async Task<PublisherBrain> Resolve(string username, CancellationToken ct)
    {
        var member = await grains.GetGrain<IPrincipal>(username).DefaultMembership().WaitAsync(ct)
            ?? throw new InvalidOperationException($"Publisher account '{username}' does not exist; seed it under DigitalBrain:Auth:Accounts.");
        return new(username, member.AccountId, member.BrainId);
    }
}
```

`PlatformHosting.cs`, next to the other `TryAddSingleton`s in `AddDigitalBrainPlatform`:

```csharp
        services.TryAddSingleton<DigitalBrain.Framework.Platform.Identity.IPublisherDirectory, PublisherDirectory>();
```

`IShippedContentPublisher.cs`:

```csharp
using DigitalBrain.Framework.Platform.Identity;

namespace DigitalBrain.Framework.Platform.Shipping;

// Implemented by modules for host-registered content sources. Platform resolves each named
// publisher account and owns the startup identity its content is published under.
public interface IShippedContentPublisher
{
    string[] Accounts { get; }
    Task PublishAsync(PublisherBrain publisher, CancellationToken cancellationToken);
}
```

`ShippedContentHosting.cs` — replace `ShippedContentStartup`:

```csharp
internal sealed class ShippedContentStartup(
    IEnumerable<IShippedContentPublisher> content, IPublisherDirectory publishers,
    IHostApplicationLifetime lifetime, ILogger<ShippedContentStartup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!lifetime.ApplicationStarted.IsCancellationRequested)
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            using var registration = lifetime.ApplicationStarted.Register(() => started.TrySetResult());
            await started.Task.WaitAsync(stoppingToken);
        }
        foreach (var source in content)
        {
            foreach (var account in source.Accounts)
            {
                stoppingToken.ThrowIfCancellationRequested();
                ArgumentException.ThrowIfNullOrWhiteSpace(account);
                PublisherBrain publisher;
                try { publisher = await publishers.Resolve(account, stoppingToken); }
                catch (InvalidOperationException error)
                {
                    logger.LogError(error, "Shipped content for {Account} stays out: the account does not exist.", account);
                    continue;
                }
                using var _ = CallerContextScope.Scoped(new CallerContext
                {
                    PrincipalId = publisher.Username,
                    AccountId = publisher.AccountId,
                    BrainId = publisher.BrainId,
                    Kind = CallerKind.Platform,
                    StampedBy = TrustedEdge.Platform,
                });
                await source.PublishAsync(publisher, stoppingToken).WaitAsync(stoppingToken);
            }
        }
    }
}
```

(add `using DigitalBrain.Framework.Platform.Identity;` and `using Microsoft.Extensions.Logging;`).

`IShippedAppSource.cs`:

```csharp
namespace DigitalBrain.Apps;

// Shipped apps are ordinary share bundles the host verifies once and imports at startup into
// the publisher account's own brain.
public interface IShippedAppSource
{
    string Account { get; }
    IReadOnlyList<AppBundle> Load();
}
```

`DirectoryShippedAppSource.cs`: change the primary constructor and property, and the comment/exception:

```csharp
// App folders read from a directory on disk: one subfolder per app, the same shape the
// embedded source reads from resources. Deployments point the host at a folder through
// DigitalBrain:Modules:apps:Shipped:{source}:Path and name its publisher with :Account.
public sealed class DirectoryShippedAppSource(string path, string account, bool writable = false) : IShippedAppSource
{
    public string Account => account;
```
```csharp
        if (!root.Exists) { throw new DirectoryNotFoundException($"Shipped app directory '{path}' for account '{account}' does not exist."); }
```

(`writable` is consumed in A5; until then the compiler warns about the unused parameter — keep it, A5 follows.)

`EmbeddedShippedAppSource.cs`: `(System.Reflection.Assembly assembly, string resourcePrefix, string account)` and `public string Account => account;`.

`ShippedAppsServiceCollectionExtensions.cs`:

```csharp
    public static IServiceCollection AddShippedApps(this IServiceCollection services, Assembly assembly, string resourcePrefix, string account)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        ArgumentException.ThrowIfNullOrWhiteSpace(resourcePrefix);
        ArgumentException.ThrowIfNullOrWhiteSpace(account);
        return services.AddShippedAppSource(new EmbeddedShippedAppSource(assembly, resourcePrefix, account));
    }

    // Configuration names the sources: DigitalBrain:Modules:apps:Shipped:{source}:Path points at a
    // directory of app folders and :Account names the publisher account that owns them; :Writable
    // lets publishing write back into the folder (development). The deployment decides, not the code.
    public static IServiceCollection AddShippedApps(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        foreach (var source in configuration.GetSection(ConfigurationSection).GetChildren())
        {
            var path = source["Path"];
            if (string.IsNullOrWhiteSpace(path))
            { throw new InvalidOperationException($"{ConfigurationSection}:{source.Key} names no Path."); }
            var account = source["Account"];
            if (string.IsNullOrWhiteSpace(account))
            { throw new InvalidOperationException($"{ConfigurationSection}:{source.Key} names no Account."); }
            var writable = bool.TryParse(source["Writable"], out var flag) && flag;
            services.AddShippedAppSource(new DirectoryShippedAppSource(path, account, writable));
        }
        return services;
    }
```

`ShippedAppPublisher.cs` — `Publishers`/`PublishAsync`/`Ship` become:

```csharp
    public string[] Accounts => sources.Select(source => source.Account).Distinct(StringComparer.Ordinal).ToArray();

    public async Task PublishAsync(PublisherBrain publisher, CancellationToken stoppingToken)
    {
        var selection = Selection(configuration[ShipOnStartupKey]);
        if (selection is { Count: 0 })
        {
            logger.LogInformation("Shipped apps stay unpublished: {Key} is off.", ShipOnStartupKey);
            return;
        }
        foreach (var source in sources.Where(source => source.Account == publisher.Username))
        {
            foreach (var bundle in source.Load())
            {
                stoppingToken.ThrowIfCancellationRequested();
                if (selection is not null && !selection.Contains(bundle.Name)) { continue; }
                try { await Ship(publisher, bundle, stoppingToken).WaitAsync(stoppingToken); }
                // Only the host's own shutdown stops shipping; a downstream cancellation or
                // timeout is this bundle's failure, not the process's.
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
                catch (Exception error)
                { logger.LogError(error, "Shipping {Account}/{App} failed.", publisher.Username, bundle.Name); }
            }
        }
    }

    private async Task Ship(PublisherBrain publisher, AppBundle bundle, CancellationToken cancellationToken)
    {
        var app = grains.GetGrain<IApp>(IApp.Key(publisher.ScopeId, bundle.Name));
        var installed = await app.Read();
        if (installed.Manifest.Title.Length > 0 && installed.Version == bundle.Version) { return; }
        var (verdicts, green) = await AppVerifyJob.RunBundle(grains, runner, bundle,
            IApp.Key(publisher.ScopeId, bundle.Name + AppFiles.VerifyMarker + Guid.NewGuid().ToString("N")), cancellationToken);
        if (!green)
        {
            logger.LogWarning("{Account}/{App} stays out: verification failed: {Failures}", publisher.Username, bundle.Name,
                string.Join("; ", verdicts.Where(verdict => !verdict.Passed).Select(verdict => $"{verdict.Name}: {verdict.Message}")));
            return;
        }
        // Replace keeps the publisher brain's settings, connections and stored data (B3).
        if (installed.Manifest.Title.Length > 0) { await app.Replace(bundle); }
        else { await app.Import(bundle); }
        await app.RecordVerdicts(verdicts, green: true, bundle.Version);
    }
```

(add `using DigitalBrain.Framework.Platform.Identity;`. The failure log now names each failing scenario —
today's "verification failed" line hid the 401 behind a sandbox log nobody reads.)

`OsApps.cs`:
- `AddOperatingSystemApps`: `services.AddShippedApps(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", account: "os");` and, right after it, seed the account so every deployment (not just the AppHost) owns the OS apps:

```csharp
        // The OS's apps belong to its own account; every distribution carries it.
        services.Configure<DigitalBrain.Platform.Identity.Configuration.SeededAccountOptions>(seeded =>
        {
            if (!seeded.Accounts.Any(account => account.Username == "os"))
            { seeded.Accounts.Add(new() { Username = "os", DisplayName = "DigitalBrain OS" }); }
        });
```

- `OsBootService` gains `IPublisherDirectory publishers` in its primary constructor and reads the shipped copy from the real brain. In `EnsureCurrentAsync` replace `var shipped = grains.GetGrain<IApp>(IApp.Key("os", name));` with:

```csharp
        var os = await publishers.Resolve("os", cancellationToken);
        var shipped = grains.GetGrain<IApp>(IApp.Key(os.ScopeId, name));
```

(add `using DigitalBrain.Framework.Platform.Identity;`. Part C replaces `OsBootService` wholesale; this
keeps it working in between.)

- [ ] **Step 4: Run tests to verify they pass**

Run, in order:
- `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` — PASS
- `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit` — PASS
- `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit` — PASS

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain/Framework/DigitalBrain.Framework/Platform src/DigitalBrain/Platform/DigitalBrain.Platform src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping src/DigitalBrain/OS/DigitalBrain.OS/OsApps.cs src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/PublisherDirectoryFacts.cs src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs
git commit -m "fix(apps): shipped apps live in their publisher account's real brain

The pseudo-brain keys (\"intochat/apps/...\") carried no brain scope, so the call filter refused
every tests script's calls to its own scratch copy and no shipped app could go green.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: AppHost seeds IntoChat and names it as the shipped publisher

**Files:**
- Modify: `src/DigitalBrain/AppHost/DigitalBrain.AppHost/AppHost.cs`
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/Program.cs` (comment only)

**Interfaces:**
- Consumes: `DigitalBrain:Auth:Accounts:{n}:*` (A1), `DigitalBrain:Modules:apps:Shipped:{source}:Path|Account|Writable` (A3).
- Produces: a local `aspire run` where `intochat` exists with password `intochat-development` (overridable through the AppHost's own configuration key `DigitalBrain:Auth:Accounts:0:Password`) and owns `src/IntoChat/Apps`.

- [ ] **Step 1: Edit the AppHost**

Replace the constant block and the runtime environment lines:

```csharp
// The AppHost owns its deployment keys: the published ports, the seeded IntoChat publisher
// account, and the vendor's shipped-apps binding (leaves under
// ShippedAppsServiceCollectionExtensions.ConfigurationSection).
const string UiPortKey = "DigitalBrain:Http:UiPort";
const string McpPortKey = "DigitalBrain:Http:McpPort";
const string IntoChatAccountKey = "DigitalBrain:Auth:Accounts:0";
const string IntoChatShippedAppsKey = "DigitalBrain:Modules:apps:Shipped:intochat";
```

```csharp
var runtime = builder.AddProject<Projects.DigitalBrain_OS>("IntoChat")
    .WithReference(digitalBrain)
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatAccountKey + ":Username"), "intochat")
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatAccountKey + ":DisplayName"), "IntoChat")
    // Development switching only; an Open host already acts as its owner without a login.
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatAccountKey + ":Password"),
        builder.Configuration[IntoChatAccountKey + ":Password"] ?? "intochat-development")
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatShippedAppsKey + ":Path"), intoChatApps)
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatShippedAppsKey + ":Account"), "intochat")
    .WithEnvironment(DigitalBrain.DigitalBrainConfiguration.EnvironmentName(IntoChatShippedAppsKey + ":Writable"), "true")
    .WaitFor(cookieProtection)
```

(the rest of the chain — `WithHttpEndpoint`, `WithHttpHealthCheck` — is unchanged; delete the old
`IntoChatShippedAppsPathKey` constant and its single use).

`Program.cs` comment above `AddShippedApps`:

```csharp
// Vendors ship through configuration: DigitalBrain:Modules:apps:Shipped:{source}:Path names a
// directory of app folders and :Account the publisher account that owns them. The image carries
// no vendor content of its own.
```

- [ ] **Step 2: Build**

Run: `dotnet build src/DigitalBrain/AppHost/DigitalBrain.AppHost`
Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Smoke**

Run `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`; wait until all resources are Healthy.
Expected in the IntoChat console log: **no** `stays out: verification failed` line for
`intochat/customer-researcher`, `intochat/word-count` or `os/settings`. If a line appears, it now
names each failing scenario and message — fix that cause before continuing. Stop the AppHost.

- [ ] **Step 4: Commit**

```bash
git add src/DigitalBrain/AppHost/DigitalBrain.AppHost/AppHost.cs src/DigitalBrain/OS/DigitalBrain.OS/Program.cs
git commit -m "feat(apphost): seed the IntoChat account and ship its apps into its brain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A5: App folders round-trip (read and write the same shape)

**Depends on Part B task B1** (`AppManifest` gains a trailing `[property: Id(5)] string? Icon = null`).

**Files:**
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/EmbeddedShippedAppSource.cs` (`ShippedAppFolder`: read `icon`, add `ToFiles`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/IShippedAppSource.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/DirectoryShippedAppSource.cs`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DirectoryShippedAppSourceFacts.cs`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ShippedAppPublisherFacts.cs` (`Source` gains the two new members)

**Interfaces:**
- Consumes: `AppManifest.Icon` (B1).
- Produces:
  - `IShippedAppSource` gains `bool Writable { get; }` and `void Write(AppBundle bundle);` (embedded: `Writable => false`, `Write` throws `NotSupportedException`).
  - `DirectoryShippedAppSource.Write(AppBundle)`: writes into the folder whose `app.json` has `"name" == bundle.Name`, else a new folder named `ShippedAppFolder.FolderName(bundle)` (PascalCase of the title, letters/digits only, fallback the name). Files absent from the bundle are deleted from that folder; `bin/`, `obj/` are never touched.
  - `internal static Dictionary<string, string> ShippedAppFolder.ToFiles(AppBundle bundle)` — inverse of `ToBundle`.
  - `internal static string ShippedAppFolder.FolderName(AppBundle bundle)`.

- [ ] **Step 1: Write the failing tests**

Add to `DirectoryShippedAppSourceFacts`:

```csharp
    [Fact]
    public void AWrittenBundleReadsBackIdentically()
    {
        Write("Echo/app.json", """
            {"name":"echo","title":"Echo","description":"Echoes.","version":"1.0.0","icon":"icon.svg","operations":[{"name":"ask","description":"Echo"}],"settings":[{"name":"Tone","description":"how","default":"flat"}]}
            """);
        Write("Echo/app.spec.md", "## Scenario: Echo\nEchoes.\n");
        Write("Echo/tests.cs", "// tests\n");
        Write("Echo/behaviors/echo.cs", "// echo\n");
        Write("Echo/icon.svg", "<svg/>");
        var source = new DirectoryShippedAppSource(_root, "vendor", writable: true);
        var loaded = Assert.Single(source.Load());
        Assert.Equal("icon.svg", loaded.Manifest.Icon);

        var edited = loaded with
        {
            Version = "1.1.0",
            Spec = "## Scenario: Echo\nEchoes twice.\n",
            Files = new(loaded.Files.Where(file => file.Key != "behaviors/echo.cs"), StringComparer.Ordinal) { ["behaviors/twice.cs"] = "// twice\n" },
        };
        source.Write(edited);

        var reread = Assert.Single(source.Load());
        Assert.Equal("1.1.0", reread.Version);
        Assert.Equal(edited.Spec, reread.Spec);
        Assert.Equal(edited.Manifest with { Operations = [], Settings = [], Slots = [] }, reread.Manifest with { Operations = [], Settings = [], Slots = [] });
        Assert.Equal(edited.Manifest.Operations, reread.Manifest.Operations);
        Assert.Equal(edited.Manifest.Settings, reread.Manifest.Settings);
        Assert.Equal(edited.Files.OrderBy(f => f.Key), reread.Files.OrderBy(f => f.Key));
        Assert.False(File.Exists(Path.Combine(_root, "Echo", "behaviors", "echo.cs")));
        Assert.Single(Directory.GetDirectories(_root));
    }

    [Fact]
    public void ANewAppGetsAFolderNamedAfterItsTitle()
    {
        var source = new DirectoryShippedAppSource(_root, "vendor", writable: true);
        source.Write(new("lead-finder", "1.0.0", new("Lead finder", "Finds leads.", [], [], []), "## Scenario: Finds\nIt finds.\n",
            new() { [AppFiles.TestsPath] = "// t\n" }));
        Assert.True(File.Exists(Path.Combine(_root, "LeadFinder", "app.json")));
        Assert.Equal("lead-finder", Assert.Single(source.Load()).Name);
    }

    [Fact]
    public void AReadOnlySourceRefusesToWrite()
        => Assert.Throws<InvalidOperationException>(() => new DirectoryShippedAppSource(_root, "vendor").Write(
            new("echo", "1.0.0", new("Echo", "Echoes.", [], [], []), "", [])));
```

In `ShippedAppPublisherFacts.Source` add:

```csharp
        public bool Writable => false;
        public void Write(AppBundle bundle) => throw new NotSupportedException();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter "FullyQualifiedName~DirectoryShippedAppSourceFacts"`
Expected: build FAIL — `DirectoryShippedAppSource.Write` does not exist.

- [ ] **Step 3: Write the implementation**

`IShippedAppSource.cs`:

```csharp
public interface IShippedAppSource
{
    string Account { get; }
    // Development folders accept the publisher's published versions back.
    bool Writable { get; }
    IReadOnlyList<AppBundle> Load();
    void Write(AppBundle bundle);
}
```

`EmbeddedShippedAppSource`: add

```csharp
    public bool Writable => false;
    public void Write(AppBundle bundle) => throw new NotSupportedException("Embedded shipped apps are read-only.");
```

`ShippedAppFolder` (in `EmbeddedShippedAppSource.cs`): in `ToBundle` pass the icon as the manifest's last
argument — `new AppManifest(..., [.. (manifest.Slots ?? []).Select(...)], manifest.Icon)` — extend the
record and add the writer:

```csharp
    internal static Dictionary<string, string> ToFiles(AppBundle bundle)
    {
        var manifest = new AppJson(bundle.Name, bundle.Manifest.Title, bundle.Manifest.Description,
            [.. bundle.Manifest.Operations.Select(operation => new OperationJson(operation.Name, operation.Description))],
            [.. bundle.Manifest.Settings.Select(setting => new SettingJson(setting.Name, setting.Description, setting.Default))],
            bundle.Version,
            bundle.Manifest.Slots.Length == 0 ? null : [.. bundle.Manifest.Slots.Select(slot => new SlotJson(slot.Name, slot.Connector))],
            bundle.Manifest.Icon);
        var files = new Dictionary<string, string>(bundle.Files, StringComparer.Ordinal)
        {
            [ManifestFile] = JsonSerializer.Serialize(manifest, Pretty) + "\n",
            [AppFiles.SpecPath] = bundle.Spec,
        };
        return files;
    }

    // A new app's folder: its title in PascalCase, the way src/IntoChat/Apps names folders.
    internal static string FolderName(AppBundle bundle)
    {
        var words = bundle.Manifest.Title.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(word => new string([.. word.Where(char.IsLetterOrDigit)]))
            .Where(word => word.Length > 0)
            .Select(word => char.ToUpperInvariant(word[0]) + word[1..]);
        var name = string.Concat(words);
        return name.Length > 0 ? name : bundle.Name;
    }

    private static readonly JsonSerializerOptions Pretty = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private sealed record AppJson(string Name, string Title, string Description, IReadOnlyList<OperationJson> Operations, IReadOnlyList<SettingJson> Settings, string? Version = null, IReadOnlyList<SlotJson>? Slots = null, string? Icon = null);
```

(replace the existing `AppJson` declaration with this one).

`DirectoryShippedAppSource.cs`: add

```csharp
    public bool Writable => writable;

    // Publishing writes the published version back as files, so the repository diff is the change.
    public void Write(AppBundle bundle)
    {
        if (!writable) { throw new InvalidOperationException($"Shipped app directory '{path}' is read-only."); }
        var root = new DirectoryInfo(path);
        root.Create();
        var folder = root.EnumerateDirectories().FirstOrDefault(candidate =>
            File.Exists(Path.Combine(candidate.FullName, "app.json"))
            && ShippedAppFolder.ToBundle(candidate.Name, ReadFolder(candidate)).Name == bundle.Name)
            ?? root.CreateSubdirectory(ShippedAppFolder.FolderName(bundle));
        var files = ShippedAppFolder.ToFiles(bundle);
        foreach (var stale in folder.EnumerateFiles("*", SearchOption.AllDirectories)
            .Where(file => !IsBuildOutput(folder, file)
                && !files.ContainsKey(Path.GetRelativePath(folder.FullName, file.FullName).Replace('\\', '/'))))
        { stale.Delete(); }
        foreach (var (relative, content) in files)
        {
            var target = Path.Combine(folder.FullName, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.WriteAllText(target, content);
        }
    }

    private static bool IsBuildOutput(DirectoryInfo folder, FileInfo file)
        => Path.GetRelativePath(folder.FullName, file.FullName).Replace('\\', '/') is var relative
            && (relative.StartsWith("bin/", StringComparison.Ordinal) || relative.StartsWith("obj/", StringComparison.Ordinal));
```

and make `ReadFolder` skip build output too (`.Where(file => !IsBuildOutput(folder, file))` before the loop body).

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
git commit -m "feat(apps): shipped app folders round-trip, writable folders accept bundles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A6: Startup sync and write-back on publish

**Depends on Part B tasks B1–B3** (`IApp.Publish()`, `IApp.ExportPublished()`, `AppSnapshot.PublishedVersion`,
`AppPublished(string Name, string Version)` signal in `DigitalBrain.Apps`) **and on A5.**

**Files:**
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppPublisher.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppWriteBack.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping/ShippedAppsServiceCollectionExtensions.cs` (register the hosted service once)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ShippedAppSyncFacts.cs`

**Interfaces:**
- Consumes: `IPublisherDirectory`, `PublisherBrain` (A3); `IShippedAppSource.Writable/Write` (A5); `IApp.Publish`, `IApp.ExportPublished`, `AppSnapshot.PublishedVersion`, `AppPublished` (B2); `LocalSignalHub.Subscribe<T>()`.
- Produces:
  - Startup rule per bundle (after the existing `ShipOnStartup` selection):
    `brain missing || repo > brain.PublishedVersion` → verify on scratch → Import → RecordVerdicts → **Publish**;
    `brain.PublishedVersion > repo && source.Writable` → `source.Write(await app.ExportPublished())`;
    equal → nothing. A brain app with no `PublishedVersion` but a title counts as version `0.0.0`.
  - Version order: `AppVersions.Compare` (B1).
  - `internal sealed class ShippedAppWriteBack(LocalSignalHub signals, IGrainFactory grains, IPublisherDirectory publishers, IEnumerable<IShippedAppSource> sources, ILogger<ShippedAppWriteBack> logger) : BackgroundService` — for each `AppPublished` whose `Publisher` equals `grains.GetGrain<IApp>(IApp.Key(scope, signal.Name)).GetGrainId().ToString()` for a writable source's resolved account, writes `ExportPublished()` into that source.

- [ ] **Step 1: Write the failing tests**

`src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ShippedAppSyncFacts.cs`:

```csharp
using DigitalBrain;
using DigitalBrain.Apps;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace DigitalBrain.Modules.Apps.Tests;

// The repository folder and the publisher's brain agree at the published version: whichever is
// newer wins at startup, and publishing in the brain writes the folder.
public sealed class ShippedAppSyncFacts : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("shipped-sync-").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Fact]
    public async Task ANewerRepositoryVersionIsImportedAndPublished()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        var vendor = await ShippedAppPublisherFacts.Register(brain, "vendor", ct);
        var source = new DirectoryShippedAppSource(_root, "vendor", writable: true);
        source.Write(Bundle("1.0.0", "It echoes."));

        await ShippedAppPublisherFacts.Ship(brain, [source], "true", ct);

        var app = await brain.Get<IApp>(IApp.Key(vendor.ScopeId, "echo")).Read();
        Assert.Equal("1.0.0", app.PublishedVersion);
    }

    [Fact]
    public async Task ANewerBrainVersionIsWrittenBackToAWritableFolderAtStartup()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        var vendor = await ShippedAppPublisherFacts.Register(brain, "vendor", ct);
        var source = new DirectoryShippedAppSource(_root, "vendor", writable: true);
        source.Write(Bundle("1.0.0", "It echoes."));
        await ShippedAppPublisherFacts.Ship(brain, [source], "true", ct);
        var app = brain.Get<IApp>(IApp.Key(vendor.ScopeId, "echo"));
        await PublishEdit(app, "It echoes twice.");
        var published = (await app.Read()).PublishedVersion!;
        // The folder went stale behind the brain's back (a checkout of an older commit).
        source.Write(Bundle("1.0.0", "It echoes."));

        await ShippedAppPublisherFacts.Ship(brain, [source], "true", ct);

        var folder = Assert.Single(source.Load());
        Assert.Equal(published, folder.Version);
        Assert.Contains("It echoes twice.", folder.Spec, StringComparison.Ordinal);
    }

    [Fact]
    public async Task PublishingInTheBrainWritesTheFolder()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        var vendor = await ShippedAppPublisherFacts.Register(brain, "vendor", ct);
        var source = new DirectoryShippedAppSource(_root, "vendor", writable: true);
        source.Write(Bundle("1.0.0", "It echoes."));
        await ShippedAppPublisherFacts.Ship(brain, [source], "true", ct);
        var writeBack = new ShippedAppWriteBack(
            brain.SiloServices.GetRequiredService<LocalSignalHub>(), brain.SiloServices.GetRequiredService<IGrainFactory>(),
            brain.SiloServices.GetRequiredService<IPublisherDirectory>(), [source], NullLogger<ShippedAppWriteBack>.Instance);
        await writeBack.StartAsync(ct);
        try
        {
            var app = brain.Get<IApp>(IApp.Key(vendor.ScopeId, "echo"));
            await PublishEdit(app, "It echoes three times.");
            var published = (await app.Read()).PublishedVersion!;

            var deadline = DateTimeOffset.UtcNow.AddSeconds(20);
            while (Assert.Single(source.Load()).Version != published)
            {
                Assert.True(DateTimeOffset.UtcNow < deadline, "The folder never received the published version.");
                await Task.Delay(100, ct);
            }
            Assert.Contains("It echoes three times.", Assert.Single(source.Load()).Spec, StringComparison.Ordinal);
        }
        finally { await writeBack.StopAsync(ct); }
    }

    [Fact]
    public async Task AReadOnlyFolderIsNeverWritten()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await StartAsync(ct);
        var vendor = await ShippedAppPublisherFacts.Register(brain, "vendor", ct);
        new DirectoryShippedAppSource(_root, "vendor", writable: true).Write(Bundle("1.0.0", "It echoes."));
        var readOnly = new DirectoryShippedAppSource(_root, "vendor");
        await ShippedAppPublisherFacts.Ship(brain, [readOnly], "true", ct);
        await PublishEdit(brain.Get<IApp>(IApp.Key(vendor.ScopeId, "echo")), "It echoes twice.");

        await ShippedAppPublisherFacts.Ship(brain, [readOnly], "true", ct);

        Assert.Equal("1.0.0", Assert.Single(readOnly.Load()).Version);
    }

    private static Task<ModuleBrain> StartAsync(CancellationToken ct)
    {
        var runner = new ScriptedTestRunner();
        runner.BySourceMarker["passing"] = (0, "dbtest:pass Echo");
        return ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<ITestScriptRunner>(runner)).StartAsync(ct);
    }

    private static AppBundle Bundle(string version, string behavior) =>
        new("echo", version, new("Echo", "Echo input", [new("ask", "Echo")], [], []),
            $"## Scenario: Echo\n{behavior}\n", new() { [AppFiles.TestsPath] = "passing" });

    // An edit in the brain, verified green and published, as the publisher would do in the shell.
    private static async Task PublishEdit(IApp app, string behavior)
    {
        await app.SaveSpec($"## Scenario: Echo\n{behavior}\n", Guid.NewGuid());
        var version = (await app.Read()).Version;
        await app.RecordVerdicts([new("Echo", true, "")], green: true, version);
        await app.Publish();
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter "FullyQualifiedName~ShippedAppSyncFacts"`
Expected: build FAIL — `ShippedAppWriteBack` does not exist; once stubbed, `PublishedVersion` is null after shipping.

- [ ] **Step 3: Write the implementation**

Version order uses `AppVersions.Compare` (Part B, B1) — the single comparer; there is no `ShippedVersion`.

`ShippedAppPublisher.Ship` becomes (the loop in `PublishAsync` passes `source` through: `await Ship(publisher, source, bundle, stoppingToken)`):

```csharp
    private async Task Ship(PublisherBrain publisher, IShippedAppSource source, AppBundle bundle, CancellationToken cancellationToken)
    {
        var app = grains.GetGrain<IApp>(IApp.Key(publisher.ScopeId, bundle.Name));
        var installed = await app.Read();
        var brainVersion = installed.Manifest.Title.Length == 0 ? null : installed.PublishedVersion ?? "0.0.0";
        var order = brainVersion is null ? 1 : AppVersions.Compare(bundle.Version, brainVersion);
        if (order == 0) { return; }
        if (order < 0)
        {
            // The publisher moved ahead in the brain; a development folder catches up.
            if (source.Writable) { source.Write(await app.ExportPublished()); }
            return;
        }
        var (verdicts, green) = await AppVerifyJob.RunBundle(grains, runner, bundle,
            IApp.Key(publisher.ScopeId, bundle.Name + AppFiles.VerifyMarker + Guid.NewGuid().ToString("N")), cancellationToken);
        if (!green)
        {
            logger.LogWarning("{Account}/{App} stays out: verification failed: {Failures}", publisher.Username, bundle.Name,
                string.Join("; ", verdicts.Where(verdict => !verdict.Passed).Select(verdict => $"{verdict.Name}: {verdict.Message}")));
            return;
        }
        // Replace keeps the publisher brain's settings, connections and stored data (B3).
        if (installed.Manifest.Title.Length > 0) { await app.Replace(bundle); }
        else { await app.Import(bundle); }
        await app.RecordVerdicts(verdicts, green: true, bundle.Version);
        await app.Publish();
    }
```

Note: `Publish` upserts the listing with the new version, so installed copies see it as "Update available" (Part B's update rule). `Replace` is defined in B3.

`ShippedAppWriteBack.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Identity;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.Apps;

// Development: a publish in a writable source's publisher brain writes the published version back
// into the source folder, so editing in the shell shows up as an ordinary repository diff.
internal sealed class ShippedAppWriteBack(
    LocalSignalHub signals, IGrainFactory grains, IPublisherDirectory publishers,
    IEnumerable<IShippedAppSource> sources, ILogger<ShippedAppWriteBack> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var writable = sources.Where(source => source.Writable).ToArray();
        if (writable.Length == 0) { return; }
        using var published = signals.Subscribe<AppPublished>();
        await foreach (var signal in published.Reader.ReadAllAsync(stoppingToken))
        {
            foreach (var source in writable)
            {
                try
                {
                    var publisher = await publishers.Resolve(source.Account, stoppingToken);
                    var app = grains.GetGrain<IApp>(IApp.Key(publisher.ScopeId, signal.Name));
                    if (signal.Publisher != app.GetGrainId().ToString()) { continue; }
                    source.Write(await app.ExportPublished());
                }
                catch (Exception error) when (error is not OperationCanceledException)
                { logger.LogWarning(error, "Writing {App} back to the {Account} folder failed.", signal.Name, source.Account); }
            }
        }
    }
}
```

`ShippedAppsServiceCollectionExtensions.AddShippedAppSource` — register the write-back once beside the publisher:

```csharp
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IHostedService, ShippedAppWriteBack>());
```

(add `using Microsoft.Extensions.Hosting;`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests` — PASS
- `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit` — PASS

- [ ] **Step 5: Smoke**

`aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`, all resources Healthy. Then `git status`
must show **no** changes under `src/IntoChat/Apps` (startup found repo == brain or imported repo).
Stop the AppHost.

- [ ] **Step 6: Commit**

```bash
git add src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Shipping src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/ShippedAppSyncFacts.cs
git commit -m "feat(apps): repository folders and publisher brains sync at the published version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Part B — Publish, Marketplace, Install, default installs

Spec sections: §2 (state fields, Edited, Icon, Publish, Marketplace, Install, Update) and §4 default
installs. Part A supplies real publisher accounts; Part B does not depend on it at test time: every
fact here stamps its own callers.

Test project for B1–B5: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`.
Test project for B6: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`.
The runner is Microsoft.Testing.Platform with xunit v3: a single class runs with
`dotnet test <project> --filter-class "*<ClassName>"`. If your SDK rejects that switch, run the
whole project; never the `.slnx`.

Conventions every B task follows:
- Persisted state: append `[Id(n)]`, never renumber; concrete arrays, not interface lists.
- Unstamped calls from a test ride the trusted internal path (no `NeuronCallFilter` check). A fact
  that needs a caller stamps one through the `Owner` helper (B1) or `Caller.As` (user edge).
- `Respond` in `AppsEndpoints` maps `InvalidOperationException` → 409, `KeyNotFoundException` → 404,
  `ArgumentException`/`InvalidDataException` → 422; B4 adds `UnauthorizedAccessException` → 403.

---

### Task B0: Every guard names the app neuron's real grain type

The app neuron is `[GrainType("apps.app2")]`, but five guards still accept only `"apps.app"` as the
calling app grain. Every check compares `context.SourceId.Type` to that string, so in production:

- `CSharpAppBindingGuard` refuses `BindApp` from `CSharpAppRuntime` (it runs inside `AppNeuron`'s turn),
  so every behavior deployment lands in `BehaviorErrors` with "Only the originating Apps grain may
  bind a behavior." and no behavior ever runs.
- `CSharpFileNeuron.RequireBoundAccess` refuses the app's own Write/Configure/Start/Stop/Delete of a
  bound behavior.
- `PostgresTablesNeuron`'s guard refuses `IPostgresAppStorage.Migrate`, `IPostgresStorageMigration`
  and `IPostgresTables.Retire` from the app (storage hooks run inside `AppNeuron`'s turn).
- `BrainAuthorityGrain` refuses `IAppGrantMigration` from the app.

The test hosts that impersonate the app (`AppBindingTestHost`, the Postgres and Platform facts'
hosts) are declared `[GrainType("apps.app")]`, which is why every suite stays green. The fix is one
vocabulary constant that the neuron and every guard and test host use.

**Files:**
- Create: `src/DigitalBrain/DigitalBrain/AppGrainType.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs:12`
- Modify: `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpAppBindingGuard.cs:19`
- Modify: `src/Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp/Files/CSharpFileNeuron.cs:58`
- Modify: `src/Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresTablesNeuron.cs:119,141,148`
- Modify: `src/DigitalBrain/Platform/DigitalBrain.Platform/Identity/Authority/BrainAuthorityGrain.cs:42`
- Modify (test hosts): `src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests/AppBindingTestHost.cs:15`, `src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresWriteTableFacts.cs:500`, `src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit/Identity/AppGrantMigrationFacts.cs:128`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppGrainTypeFacts.cs`

**Interfaces:**
- Produces: `public static class AppGrainType { public const string Name = "apps.app2"; }` in namespace `DigitalBrain` (vocabulary ring, so CSharp, Postgres and Platform can name it without referencing the Apps module).

- [ ] **Step 1: Point the test hosts at the constant and pin the neuron to it**

In each of the three test-host files replace `[GrainType("apps.app")]` with:

```csharp
[GrainType(DigitalBrain.AppGrainType.Name)]
```

`Apps/AppGrainTypeFacts.cs`:

```csharp
using Orleans.Runtime;

namespace DigitalBrain.Apps.Tests.Apps;

// Guards in other modules recognize the calling app by grain type; the neuron must declare
// exactly the type they check.
public sealed class AppGrainTypeFacts
{
    [Fact]
    public void TheAppNeuronDeclaresTheVocabularysAppGrainType()
    {
        var neuron = typeof(AppsModule).Assembly.GetType("DigitalBrain.Apps.AppNeuron", throwOnError: true)!;
        var declared = (GrainTypeAttribute)Attribute.GetCustomAttribute(neuron, typeof(GrainTypeAttribute))!;
        Assert.Equal(DigitalBrain.AppGrainType.Name, declared.GetGrainType(null!, neuron).ToString());
    }
}
```

- [ ] **Step 2: Run to verify the build fails**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppGrainTypeFacts"`
Expected: build FAILS — `DigitalBrain.AppGrainType` does not exist.

- [ ] **Step 3: Add the constant**

`src/DigitalBrain/DigitalBrain/AppGrainType.cs`:

```csharp
namespace DigitalBrain;

// The app neuron's grain type. Modules that accept calls only from an app's own neuron (behavior
// binding, app storage, grant migration) compare the calling grain's type to this.
public static class AppGrainType
{
    public const string Name = "apps.app2";
}
```

- [ ] **Step 4: Run the impersonating suites to see the bug**

Run: `dotnet test src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`
Expected: FAIL — every fact that binds through `AppBindingTestHost` throws "Only the originating Apps grain may bind a behavior."
Run: `dotnet test src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
Expected: FAIL — the facts whose app host migrates or retires storage are refused ("Only the owning Apps grain may migrate storage." / "Only the owning module may change table lifetime.").
Run: `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit --filter-class "*AppGrantMigrationFacts"`
Expected: FAIL — "Only the originating Apps grain may migrate grants in its current brain."

- [ ] **Step 5: Use the constant in the neuron and every guard**

- `AppNeuron.cs:12`: `[GrainType(DigitalBrain.AppGrainType.Name)]`
- `CSharpAppBindingGuard.cs:19`: `if (source is null || source.Value.Type.ToString() != DigitalBrain.AppGrainType.Name`
- `CSharpFileNeuron.cs:58`: `&& (source?.Type.ToString() != DigitalBrain.AppGrainType.Name || source?.Key.ToString() != app))`
- `PostgresTablesNeuron.cs:119`: `&& (context.SourceId?.Type.ToString() != DigitalBrain.AppGrainType.Name || context.SourceId?.Key.ToString() != scope[1]))`
- `PostgresTablesNeuron.cs:141`: `&& context.SourceId?.Type.ToString() != DigitalBrain.AppGrainType.Name`
- `PostgresTablesNeuron.cs:148`: `: context.InterfaceMethod.Name == nameof(IPostgresTables.Retire) ? DigitalBrain.AppGrainType.Name : "postgres.table";`
- `BrainAuthorityGrain.cs:42`: `if (!CallerContextStamper.IsTrusted(caller) || source?.Type.ToString() != DigitalBrain.AppGrainType.Name`

Then confirm nothing else names the old type:

Run: `git grep -n '"apps.app"' -- src`
Expected: no output.

- [ ] **Step 6: Run every touched suite**

Run each, expecting PASS:
`dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
`dotnet test src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests`
`dotnet test src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests`
`dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit`

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain/DigitalBrain/AppGrainType.cs src/Modules/DigitalBrain/Apps src/Modules/Microsoft/CSharp src/Modules/Postgres src/DigitalBrain/Platform
git commit -m "fix(apps): guards recognize the app neuron by its real grain type

The app neuron became apps.app2 but behavior binding, app storage and grant
migration still admitted only apps.app, so no app behavior could deploy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B1: Origin, Edited and Icon on the app

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppOrigin.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppVersions.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppManifest.cs` (add `Icon`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppSnapshot.cs` (add three fields)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs` (add `RecordOrigin`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppState.cs` (Ids 20–24, `Clone`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs` (Edited on program edits, `RecordOrigin`, `Describe`)
- Create: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Support/Owner.cs`
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppOriginFacts.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `public sealed record AppOrigin(string PublisherAccountId, string PublisherBrainId, string Publisher, string Name, string Version)` (Orleans alias `apps.origin`).
  - `AppManifest(..., AppSlot[] Slots, string? Icon = null)` — `Icon` is `[property: Id(5)]`.
  - `AppSnapshot(..., AppScenarioVerdict[] Verdicts, string? PublishedVersion = null, AppOrigin? Origin = null, bool Edited = false)` — Ids 11, 12, 13.
  - `IApp.RecordOrigin(AppOrigin origin)` → `Task`.
  - `public static class AppVersions { public static int Compare(string left, string right); }` (numeric semver compare; throws `FormatException` on anything but `major.minor.patch`). It is the only version comparer: Installer, boot and Part A's repo sync all use it (A6 drops its own `ShippedVersion.Compare`).
  - `AppState`: `[Id(20)] string? PublishedVersion`, `[Id(21)] AppOrigin? Origin`, `[Id(22)] bool Edited`, `[Id(23)] AppVersionRecord? Published`, `[Id(24)] string? Publisher` (23/24 are written by B2).
  - Test helper `Owner.Scope(string principal)` → `BrainScope.Create("account-" + principal, principal).Id`; `Owner.Stamp(string principal)` stamps a platform caller (`AccountId = "account-" + principal`, `BrainId = principal`).

- [ ] **Step 1: Write the test helper and the failing facts**

`Support/Owner.cs`:

```csharp
using DigitalBrain.Enforcement;
using DigitalBrain.Framework.Enforcement;

namespace DigitalBrain.Modules.Apps.Tests;

// A brain owner acting through the platform edge: publishing and installing act in the
// stamped caller's brain, so facts that cross brains stamp who they speak for.
internal static class Owner
{
    public static string Scope(string principal) => BrainScope.Create("account-" + principal, principal).Id;

    public static void Stamp(string principal) => CallerContextStamper.Stamp(new CallerContext
    {
        PrincipalId = principal,
        AccountId = "account-" + principal,
        BrainId = principal,
        Kind = CallerKind.Platform,
        StampedBy = TrustedEdge.Platform,
    });
}
```

`Apps/AppOriginFacts.cs`:

```csharp
using DigitalBrain.Testing.Module;

namespace DigitalBrain.Apps.Tests.Apps;

// An installed copy remembers where it came from; the first edit makes it the person's own.
public sealed class AppOriginFacts
{
    private static readonly AppOrigin Origin = new("account-intochat", "intochat", "intochat", "echo", "1.0.0");

    private static AppManifest Manifest() =>
        new("Echo", "echoes", [new("ask", "ask it")], [new("Text", "what to say", "hi")], [], Icon: "icon.svg");

    private static Task<ModuleBrain> Start() =>
        ModuleTest.Create().WithModule<AppsModule>().StartAsync(TestContext.Current.CancellationToken);

    private static async Task<IApp> Installed(ModuleBrain brain, string key)
    {
        var app = brain.Get<IApp>(key);
        await app.Import(new("echo", "1.0.0", Manifest(), "## Scenario: Echoes\nIt echoes.",
            new() { ["tests.cs"] = "// t", ["icon.svg"] = "<svg/>" }));
        await app.RecordOrigin(Origin);
        return app;
    }

    [Fact]
    public async Task RecordingAnOriginShowsItOnTheSnapshotAndTheCopyStartsUnedited()
    {
        await using var brain = await Start();
        var snapshot = await (await Installed(brain, IApp.Key("origin-a", "echo"))).Read();
        Assert.Equal(Origin, snapshot.Origin);
        Assert.False(snapshot.Edited);
        Assert.Equal("icon.svg", snapshot.Manifest.Icon);
    }

    [Fact]
    public async Task EveryProgramEditMarksTheCopyEdited()
    {
        await using var brain = await Start();
        var spec = await Installed(brain, IApp.Key("origin-b", "echo"));
        Assert.True((await spec.SaveSpec("## Scenario: Echoes\nIt echoes twice.", Guid.NewGuid())).Edited);

        var manifest = await Installed(brain, IApp.Key("origin-c", "echo"));
        Assert.True((await manifest.SaveManifest(Manifest() with { Title = "Mine" }, Guid.NewGuid())).Edited);

        var file = await Installed(brain, IApp.Key("origin-d", "echo"));
        Assert.True((await file.WriteFile("notes.md", "mine", Guid.NewGuid())).Edited);

        var behavior = await Installed(brain, IApp.Key("origin-e", "echo"));
        Assert.True((await behavior.WriteBehavior("behaviors/echo.cs", "// mine", Guid.NewGuid())).Edited);

        var rolled = await Installed(brain, IApp.Key("origin-f", "echo"));
        Assert.True((await rolled.Rollback("1.0.0")).Edited);

        var built = await Installed(brain, IApp.Key("origin-g", "echo"));
        await built.BeginBuild(null);
        Assert.True((await built.CompleteBuild(await built.CurrentBuildAttempt(), new() { ["behaviors/echo.cs"] = "// built" }, null)).Edited);
    }

    [Fact]
    public async Task ConfiguringSettingsIsNotAnEdit()
    {
        await using var brain = await Start();
        var app = await Installed(brain, IApp.Key("origin-h", "echo"));
        var configured = await app.Configure(new() { ["Text"] = "mine" }, new());
        Assert.False(configured.Edited);
        Assert.Equal(Origin, configured.Origin);
    }

    [Fact]
    public async Task AFailedBuildIsNotAnEdit()
    {
        await using var brain = await Start();
        var app = await Installed(brain, IApp.Key("origin-i", "echo"));
        await app.BeginBuild(null);
        Assert.False((await app.CompleteBuild(await app.CurrentBuildAttempt(), null, "the model gave up")).Edited);
    }

    [Fact]
    public async Task RecordingAnOriginAgainClearsEdited()
    {
        await using var brain = await Start();
        var app = await Installed(brain, IApp.Key("origin-j", "echo"));
        await app.WriteFile("notes.md", "mine", Guid.NewGuid());
        await app.RecordOrigin(Origin with { Version = "1.1.0" });
        var snapshot = await app.Read();
        Assert.False(snapshot.Edited);
        Assert.Equal("1.1.0", snapshot.Origin!.Version);
    }

    [Theory]
    [InlineData("1.10.0", "1.9.0", 1)]
    [InlineData("2.0.0", "10.0.0", -1)]
    [InlineData("1.2.3", "1.2.3", 0)]
    [InlineData("1.2.10", "1.2.9", 1)]
    public void VersionsCompareNumerically(string left, string right, int sign)
        => Assert.Equal(sign, Math.Sign(AppVersions.Compare(left, right)));

    [Fact]
    public void AVersionThatIsNotMajorMinorPatchIsRefused()
        => Assert.Throws<FormatException>(() => AppVersions.Compare("1.0", "1.0.0"));
}
```

- [ ] **Step 2: Run the facts to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppOriginFacts"`
Expected: build FAILS — `AppOrigin`, `AppVersions`, `RecordOrigin`, `AppManifest.Icon`, `AppSnapshot.Edited` do not exist.

- [ ] **Step 3: Add the contracts**

`Contracts/Apps/AppOrigin.cs`:

```csharp
namespace DigitalBrain.Apps;

// Where an installed copy came from: the publisher's account and brain, its name for the app,
// and the published version the copy was taken at.
[GenerateSerializer, Alias("apps.origin")]
public sealed record AppOrigin(
    [property: Id(0)] string PublisherAccountId,
    [property: Id(1)] string PublisherBrainId,
    [property: Id(2)] string Publisher,
    [property: Id(3)] string Name,
    [property: Id(4)] string Version);
```

`Contracts/Apps/AppVersions.cs`:

```csharp
namespace DigitalBrain.Apps;

// Versions are major.minor.patch and compare numerically, so 1.10.0 follows 1.9.0.
public static class AppVersions
{
    public static int Compare(string left, string right)
    {
        var a = Parse(left);
        var b = Parse(right);
        for (var part = 0; part < 3; part++)
        {
            var order = a[part].CompareTo(b[part]);
            if (order != 0) { return order; }
        }
        return 0;
    }

    private static int[] Parse(string version)
        => version?.Split('.') is { Length: 3 } parts && parts.All(part => part.Length > 0 && part.All(char.IsAsciiDigit))
            ? [.. parts.Select(int.Parse)]
            : throw new FormatException($"'{version}' is not a version of the form major.minor.patch.");
}
```

`AppManifest.cs` — replace the `AppManifest` record:

```csharp
// Icon names a bundle file (an SVG: bundle files are text) shown in the Marketplace and on tiles.
[GenerateSerializer, Alias("apps.manifest2")]
public sealed record AppManifest(
    [property: Id(0)] string Title,
    [property: Id(1)] string Description,
    [property: Id(2)] AppOperation[] Operations,
    [property: Id(3)] AppSetting[] Settings,
    [property: Id(4)] AppSlot[] Slots,
    [property: Id(5)] string? Icon = null);
```

`AppSnapshot.cs` — replace the `AppSnapshot` record:

```csharp
[GenerateSerializer, Alias("apps.snapshot2")]
public sealed record AppSnapshot(
    [property: Id(0)] string Name,
    [property: Id(1)] AppManifest Manifest,
    [property: Id(2)] string Spec,
    [property: Id(3)] Dictionary<string, string> Files,
    [property: Id(4)] Dictionary<string, string> Settings,
    [property: Id(5)] Dictionary<string, string> Connections,
    [property: Id(6)] string Version,
    [property: Id(7)] AppStatus Status,
    [property: Id(8)] string[] Activity,
    [property: Id(9)] AppVersionSummary[] Versions,
    [property: Id(10)] AppScenarioVerdict[] Verdicts,
    [property: Id(11)] string? PublishedVersion = null,
    [property: Id(12)] AppOrigin? Origin = null,
    [property: Id(13)] bool Edited = false);
```

`IApp.cs` — add after `Import`:

```csharp
    // Install records where the copy came from; recording it again (after an update) also
    // clears Edited, because the program is the publisher's again.
    Task RecordOrigin(AppOrigin origin);
```

- [ ] **Step 4: Add the state fields**

`AppState.cs` — append after `[Id(19)] Receipts`:

```csharp
    [Id(20)] public string? PublishedVersion { get; set; }
    [Id(21)] public AppOrigin? Origin { get; set; }
    [Id(22)] public bool Edited { get; set; }
    [Id(23)] public AppVersionRecord? Published { get; set; }
    [Id(24)] public string? Publisher { get; set; }
```

and in `Clone()` append after `Receipts = [.. Receipts],`:

```csharp
        PublishedVersion = PublishedVersion,
        Origin = Origin,
        Edited = Edited,
        Published = Published,
        Publisher = Publisher,
```

- [ ] **Step 5: Mark edits, record origins, describe**

In `AppNeuron.cs`:

1. In `SaveSpec`, `SaveManifest`, `WriteBehavior`, `WriteFile` and `Rollback`, add `next.Edited = true;` on the line after `var next = Snapshot.Clone();`.
2. In `CompleteBuild`, add `next.Edited = true;` on the line after `foreach (var (path, source) in files) { next.Files[path] = source; }` (the success path only; both failure branches return before it).
3. Add after `Import`:

```csharp
    public async Task RecordOrigin(AppOrigin origin)
    {
        ArgumentNullException.ThrowIfNull(origin);
        RequireCreated();
        var next = Snapshot.Clone();
        next.Origin = origin;
        next.Edited = false;
        await Persist(next);
    }
```

4. In `Describe`, replace the final argument `[.. state.Verdicts]);` with:

```csharp
        [.. state.Verdicts],
        state.PublishedVersion,
        state.Origin,
        state.Edited);
```

- [ ] **Step 6: Run the facts to verify they pass, then the whole project**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppOriginFacts"`
Expected: PASS (11 facts including theory rows).
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS — the new record parameters are optional, so existing callers compile unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/Modules/DigitalBrain/Apps
git commit -m "feat(apps): installed copies remember their origin and the first edit makes them yours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: Publish and the Marketplace neuron

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Marketplace/IMarketplace.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Marketplace/MarketplaceListing.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Signals/AppPublished.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/MarketplaceNeuron.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/MarketplaceWriteGuard.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs` (add `Publish`, `ExportPublished`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs` (`Access`, `Publish`, `ExportPublished`, `Delete`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppVerifyJob.cs` (ordered scenario names)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs` (register the guard)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppPublishFacts.cs`

**Interfaces:**
- Consumes: B1 (`AppState.Published`, `AppState.Publisher`, `AppState.PublishedVersion`, `Owner`).
- Produces:
  - `IApp.Publish()` → `Task<AppSnapshot>`; refuses (`InvalidOperationException`) unless the current version is verified green or when no caller is stamped; refuses (`UnauthorizedAccessException`) a caller whose brain scope is not the app's.
  - `IApp.ExportPublished()` → `Task<AppBundle>`; `NeuronAccess.PublicOperation`; `InvalidOperationException` when nothing is published.
  - `AppPublished(string Name, string Version) : Signal` (alias `apps.app-published`).
  - `IMarketplace` (alias and grain type `apps.marketplace`), `const string Key = "marketplace"`, `List()`, `Read(publisher, name)`, `Upsert(listing)`, `Remove(publisher, name)`.
  - `MarketplaceListing(string Publisher, string PublisherAccountId, string PublisherBrainId, string Name, string Title, string Description, string Version, string? Icon, string[] Scenarios)` (alias `apps.listing`).
  - `AppVerifyJob.ScenarioNames(string spec)` → `string[]` in spec order.

- [ ] **Step 1: Write the failing facts**

`Apps/AppPublishFacts.cs`:

```csharp
using DigitalBrain.Modules.Apps.Tests;
using DigitalBrain.Testing.Module;

namespace DigitalBrain.Apps.Tests.Apps;

// Publish lists one green version in the Marketplace; the listing belongs to the app that
// published it, and the published bundle stays that version while the publisher keeps editing.
public sealed class AppPublishFacts
{
    private const string Spec = "## Scenario: Echoes\nIt echoes.\n\n## Scenario: Quiet\nEmpty stays empty.";

    private static AppManifest Manifest() =>
        new("Echo", "echoes", [new("ask", "ask it")], [new("Text", "what to say", "hi")], [], Icon: "icon.svg");

    private static Task<ModuleBrain> Start() =>
        ModuleTest.Create().WithModule<AppsModule>().StartAsync(TestContext.Current.CancellationToken);

    private static async Task<IApp> GreenApp(ModuleBrain brain, string publisher, string name = "echo")
    {
        Caller.Clear();
        var app = brain.Get<IApp>(IApp.Key(Owner.Scope(publisher), name));
        await app.Create(Manifest(), Spec);
        await app.BeginBuild(null);
        await app.CompleteBuild(await app.CurrentBuildAttempt(),
            new() { ["tests.cs"] = "// t", ["behaviors/echo.cs"] = "// b", ["icon.svg"] = "<svg/>" }, null);
        await app.RecordVerdicts([new("Echoes", true, "ok"), new("Quiet", true, "ok")], green: true);
        return app;
    }

    private static IMarketplace Marketplace(ModuleBrain brain) => brain.Get<IMarketplace>(IMarketplace.Key);

    [Fact]
    public async Task PublishingARedVersionIsRefused()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        await app.WriteFile("notes.md", "after the green run", Guid.NewGuid());
        Owner.Stamp("intochat");
        var error = await Assert.ThrowsAsync<InvalidOperationException>(app.Publish);
        Assert.Contains("green", error.Message, StringComparison.Ordinal);
        Caller.Clear();
        Assert.Empty(await Marketplace(brain).List());
    }

    [Fact]
    public async Task PublishingListsTheGreenVersionWithItsScenariosInSpecOrderAndItsIcon()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        var published = await app.Publish();
        Caller.Clear();

        Assert.Equal(published.Version, published.PublishedVersion);
        // Records holding arrays compare the array by reference, so the facts compare fields.
        var listing = Assert.Single(await Marketplace(brain).List());
        Assert.Equal(("intochat", "account-intochat", "intochat", "echo", "Echo", "echoes", published.Version, "icon.svg"),
            (listing.Publisher, listing.PublisherAccountId, listing.PublisherBrainId, listing.Name, listing.Title,
             listing.Description, listing.Version, listing.Icon));
        Assert.Equal(["Echoes", "Quiet"], listing.Scenarios);
        Assert.Equal(published.Version, (await Marketplace(brain).Read("intochat", "echo"))!.Version);
    }

    [Fact]
    public async Task ThePublishedBundleStaysTheReleasedVersionWhileThePublisherKeepsEditing()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        var released = (await app.Publish()).Version;
        Caller.Clear();
        await app.WriteFile("notes.md", "work in progress", Guid.NewGuid());

        var bundle = await app.ExportPublished();
        Assert.Equal(released, bundle.Version);
        Assert.False(bundle.Files.ContainsKey("notes.md"));
        Assert.Equal(released, (await Marketplace(brain).Read("intochat", "echo"))!.Version);
    }

    [Fact]
    public async Task RepublishingAGreenEditReplacesTheListing()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        await app.Publish();
        Caller.Clear();
        await app.SaveManifest(Manifest() with { Description = "echoes louder" }, Guid.NewGuid());
        await app.RecordVerdicts([new("Echoes", true, "ok"), new("Quiet", true, "ok")], green: true);
        Owner.Stamp("intochat");
        var republished = await app.Publish();
        Caller.Clear();

        var listing = Assert.Single(await Marketplace(brain).List());
        Assert.Equal(republished.Version, listing.Version);
        Assert.Equal("echoes louder", listing.Description);
    }

    [Fact]
    public async Task DeletingAPublishedAppRemovesItsListing()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        await app.Publish();
        Caller.Clear();
        await app.Delete();
        Assert.Null(await Marketplace(brain).Read("intochat", "echo"));
    }

    [Fact]
    public async Task ExportingPublishedBeforeAnyPublishIsRefused()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        await Assert.ThrowsAsync<InvalidOperationException>(app.ExportPublished);
    }

    [Fact]
    public async Task PublishingWithoutASignedInPublisherIsRefused()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        await Assert.ThrowsAsync<InvalidOperationException>(app.Publish);
    }

    [Fact]
    public async Task OnlyTheBrainThatOwnsAnAppCanPublishIt()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("mallory");
        await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(app.Publish);
        Caller.Clear();
        Assert.Empty(await Marketplace(brain).List());
    }

    [Fact]
    public async Task TheMarketplaceRefusesWritesFromAnythingButTheOwningApp()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        await app.Publish();
        Caller.Clear();

        var forged = new MarketplaceListing("intochat", "account-intochat", "intochat", "echo", "Echo", "forged", "9.9.9", null, []);
        await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(() => Marketplace(brain).Upsert(forged));
        await Assert.ThrowsAnyAsync<UnauthorizedAccessException>(() => Marketplace(brain).Remove("intochat", "echo"));
        Assert.Equal("echoes", (await Marketplace(brain).Read("intochat", "echo"))!.Description);
    }

    [Fact]
    public async Task AnySignedInBrainCanReadTheMarketplace()
    {
        await using var brain = await Start();
        var app = await GreenApp(brain, "intochat");
        Owner.Stamp("intochat");
        await app.Publish();
        Caller.As("alice");
        Assert.Single(await Marketplace(brain).List());
        Assert.NotNull(await Marketplace(brain).Read("intochat", "echo"));
        Caller.Clear();
    }
}
```

- [ ] **Step 2: Run the facts to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppPublishFacts"`
Expected: build FAILS — `IMarketplace`, `MarketplaceListing`, `Publish`, `ExportPublished` do not exist.

- [ ] **Step 3: Add the contracts**

`Contracts/Marketplace/MarketplaceListing.cs`:

```csharp
namespace DigitalBrain.Apps;

// One published app as everyone sees it. Publisher is the publishing account's username; the
// account and brain ids address the publisher's copy for Install.
[GenerateSerializer, Alias("apps.listing")]
public sealed record MarketplaceListing(
    [property: Id(0)] string Publisher,
    [property: Id(1)] string PublisherAccountId,
    [property: Id(2)] string PublisherBrainId,
    [property: Id(3)] string Name,
    [property: Id(4)] string Title,
    [property: Id(5)] string Description,
    [property: Id(6)] string Version,
    [property: Id(7)] string? Icon,
    [property: Id(8)] string[] Scenarios);
```

`Contracts/Marketplace/IMarketplace.cs`:

```csharp
using Orleans.Metadata;

namespace DigitalBrain.Apps;

// The platform-wide list of published apps. Everyone signed in reads it; only the app neuron
// that owns a listing writes it. The apps themselves stay in their publishers' brains.
[Alias("apps.marketplace"), DefaultGrainType("apps.marketplace")]
public interface IMarketplace : INeuron
{
    const string Key = "marketplace";

    [Orleans.Concurrency.ReadOnly, Orleans.Concurrency.AlwaysInterleave] Task<MarketplaceListing[]> List();
    [Orleans.Concurrency.ReadOnly, Orleans.Concurrency.AlwaysInterleave] Task<MarketplaceListing?> Read(string publisher, string name);
    Task Upsert(MarketplaceListing listing);
    Task Remove(string publisher, string name);
}
```

`Contracts/Signals/AppPublished.cs`:

```csharp
namespace DigitalBrain.Apps.Signals;

[GenerateSerializer, Alias("apps.app-published")]
public sealed record AppPublished(
    [property: Id(0)] string Name,
    [property: Id(1)] string Version) : Signal;
```

`IApp.cs` — add after `Export()`:

```csharp
    // Publishes the current green version: it becomes the Marketplace listing and the bundle
    // every Install copies, until the next Publish.
    Task<AppSnapshot> Publish();
    // The published version's bundle, readable by anyone: a published app is public by definition.
    Task<AppBundle> ExportPublished();
```

- [ ] **Step 4: Order scenario names**

In `AppVerifyJob.cs`, replace `Scenarios` with:

```csharp
    internal static HashSet<string> Scenarios(string spec) => new(ScenarioNames(spec), StringComparer.Ordinal);

    // Spec order, each name once: the Marketplace lists scenarios the way the spec reads.
    internal static string[] ScenarioNames(string spec)
    {
        var names = new List<string>();
        foreach (var raw in (spec ?? "").Split('\n'))
        {
            var line = raw.Trim();
            if (!line.StartsWith("## Scenario:", StringComparison.Ordinal)) { continue; }
            var name = line["## Scenario:".Length..].Trim();
            if (!names.Contains(name, StringComparer.Ordinal)) { names.Add(name); }
        }
        return [.. names];
    }
```

- [ ] **Step 5: The Marketplace neuron and its write guard**

`Apps/Marketplace/MarketplaceNeuron.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using Orleans.Runtime;

namespace DigitalBrain.Apps;

[GenerateSerializer, Alias("apps.marketplace-state")]
public sealed class MarketplaceState
{
    [Id(0)] public MarketplaceListing[] Listings { get; set; } = [];
}

// A list, not domain state, so it publishes nothing: AppPublished from the app neuron is the
// fact. Reads are public; writes are checked by MarketplaceWriteGuard against the calling app.
[GrainType("apps.marketplace")]
internal sealed class MarketplaceNeuron(
    [PersistentState("apps.marketplace", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<MarketplaceState> store)
    : Neuron, IMarketplace
{
    private MarketplaceState State => store.State ??= new();

    public override NeuronAccess Access(string operation)
        => operation is nameof(List) or nameof(Read) ? NeuronAccess.PublicOperation : NeuronAccess.Unclassified;

    public Task<MarketplaceListing[]> List() => Task.FromResult<MarketplaceListing[]>([.. State.Listings]);

    public Task<MarketplaceListing?> Read(string publisher, string name) => Task.FromResult(Find(publisher, name));

    public async Task Upsert(MarketplaceListing listing)
    {
        ArgumentNullException.ThrowIfNull(listing);
        State.Listings = [.. State.Listings.Where(item => !(item.Publisher == listing.Publisher && item.Name == listing.Name))
            .Append(listing)
            .OrderBy(item => item.Publisher, StringComparer.Ordinal).ThenBy(item => item.Name, StringComparer.Ordinal)];
        await store.WriteStateAsync();
    }

    public async Task Remove(string publisher, string name)
    {
        if (Find(publisher, name) is null) { return; }
        State.Listings = [.. State.Listings.Where(item => !(item.Publisher == publisher && item.Name == name))];
        await store.WriteStateAsync();
    }

    // The app neuron key that owns a listing, or null when there is no such listing.
    internal string? OwnerKey(string publisher, string name)
        => Find(publisher, name) is { } listing ? OwnerKey(listing) : null;

    internal static string OwnerKey(MarketplaceListing listing)
        => IApp.Key(BrainScope.Create(listing.PublisherAccountId, listing.PublisherBrainId).Id, listing.Name);

    private MarketplaceListing? Find(string publisher, string name)
        => State.Listings.FirstOrDefault(item => item.Publisher == publisher && item.Name == name);
}
```

`Apps/Marketplace/MarketplaceWriteGuard.cs`:

```csharp
using Orleans.Runtime;

namespace DigitalBrain.Apps;

// Only the app neuron a listing names may write it: Upsert's listing must address the calling
// app, and Remove may only take down the caller's own listing. A Remove of a listing that no
// longer exists is a no-op for anyone.
internal sealed class MarketplaceWriteGuard : IIncomingGrainCallFilter
{
    private const string AppGrainType = "apps.app2";

    public async Task Invoke(IIncomingGrainCallContext context)
    {
        if (context.Grain is MarketplaceNeuron marketplace
            && context.InterfaceMethod.Name is nameof(IMarketplace.Upsert) or nameof(IMarketplace.Remove))
        {
            var owner = context.InterfaceMethod.Name == nameof(IMarketplace.Upsert)
                ? MarketplaceNeuron.OwnerKey((MarketplaceListing)context.Request.GetArgument(0)!)
                : marketplace.OwnerKey((string)context.Request.GetArgument(0)!, (string)context.Request.GetArgument(1)!);
            if (owner is not null
                && (context.SourceId is not { } source || source.Type.ToString() != AppGrainType || source.Key.ToString() != owner))
            { throw new UnauthorizedAccessException("Only the app that owns a Marketplace listing may change it."); }
        }
        await context.Invoke();
    }
}
```

In `AppsModule.Configure(ISiloBuilder silo)` add after the options registration:

```csharp
        silo.AddIncomingGrainCallFilter<MarketplaceWriteGuard>();
```

- [ ] **Step 6: Publish, ExportPublished and Delete on the app neuron**

In `AppNeuron.cs`:

1. `CallerContextStamper`, `BrainScope` and `NeuronAccess` live in `DigitalBrain.Framework.Enforcement`, already imported by `AppNeuron.cs`.
2. Add above `Read()`:

```csharp
    // A published version is public by definition: anyone may copy it, nothing more.
    public override NeuronAccess Access(string operation)
        => operation == nameof(IApp.ExportPublished) ? NeuronAccess.PublicOperation : base.Access(operation);
```

3. Add after `Export()`:

```csharp
    public async Task<AppSnapshot> Publish()
    {
        RequireCreated();
        if (!Snapshot.Verified.TryGetValue(Snapshot.Version, out var green) || !green)
        { throw new InvalidOperationException($"Version {Snapshot.Version} has not passed its tests; only green versions can be published."); }
        if (!CallerContextStamper.TryGet(out var caller))
        { throw new InvalidOperationException("Publishing needs a signed-in publisher."); }
        if (BrainScope.Create(caller.AccountId, caller.BrainId).Id != BrainId())
        { throw new UnauthorizedAccessException("Only the brain that owns an app can publish it."); }
        var next = Snapshot.Clone();
        var manifest = next.Manifest!;
        next.PublishedVersion = next.Version;
        next.Published = new AppVersionRecord(next.Version, clock.GetUtcNow(), manifest, next.Spec, new(next.Files, StringComparer.Ordinal));
        next.Publisher = caller.PrincipalId;
        var name = Name();
        await Save(next, new AppChanged(name, next.Version, next.Status), new AppPublished(name, next.Version));
        // State first: a failed listing write is repaired by publishing again, never the reverse
        // (a listing whose bundle Install cannot read).
        await GrainFactory.GetGrain<IMarketplace>(IMarketplace.Key).Upsert(new MarketplaceListing(
            caller.PrincipalId, caller.AccountId, caller.BrainId, name, manifest.Title, manifest.Description,
            next.Version, manifest.Icon, AppVerifyJob.ScenarioNames(next.Spec)));
        return Describe(Snapshot);
    }

    public Task<AppBundle> ExportPublished()
    {
        if (Snapshot.Published is not { } published)
        { throw new InvalidOperationException($"{Name()} has no published version."); }
        return Task.FromResult(new AppBundle(Name(), published.Version, published.Manifest, published.Spec,
            new(published.Files, StringComparer.Ordinal)));
    }
```

4. In `Delete()`, add as the second statement (after the `Manifest is null` return):

```csharp
        if (Snapshot.Publisher is { } publisher)
        { await GrainFactory.GetGrain<IMarketplace>(IMarketplace.Key).Remove(publisher, Name()); }
```

- [ ] **Step 7: Run the facts to verify they pass, then the project**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppPublishFacts"`
Expected: PASS (10 facts).
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/Modules/DigitalBrain/Apps
git commit -m "feat(apps): publish a green version into a Marketplace only its app may write

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: Install, Replace and Update

Update never goes through `Delete`: `Delete` calls every `IAppStorageHook.OnRetired`, and the Postgres
hook's `OnRetired` retires every table the app key owns, so a Delete→Import update would drop the
person's saved rows (Customer Researcher's research table). Update swaps the program in place with
`IApp.Replace` instead. `Replace` stops only the behavior files the new version no longer has
(`IDeployableRuntime.Retire`) and never calls `OnRetired`, because that hook retires the whole app's
storage, not just the removed files. The redeploy's `OnDeployed` then carries the storage ownership
to the current keys, exactly as an edit does.

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Marketplace/MarketplaceEntry.cs`
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/AppInstaller.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/IApp.cs` (add `Replace`)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Apps/AppNeuron.cs` (`Replace`, shared bundle validation)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs` (register `AppInstaller`)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Runtimes/StorageHookFacts.cs` (Replace keeps storage)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppInstallerFacts.cs`

**Interfaces:**
- Consumes: B1 (`AppOrigin`, `AppVersions.Compare`, `RecordOrigin`, `Owner`), B2 (`IMarketplace`, `ExportPublished`, `Publish`).
- Produces:
  - `IApp.Replace(AppBundle bundle)` → `Task<AppSnapshot>` with `[ResponseTimeout("00:10:00")]` (it redeploys). Requires an existing app and a bundle whose name is the app's; installs the bundle's manifest, spec, files and version; keeps Settings (new settings get defaults), Connections and the storage of kept behaviors; retires only removed behavior files; does not touch `Origin` or `Edited` (`RecordOrigin` follows).
  - `public sealed record MarketplaceEntry(MarketplaceListing Listing, bool Installed, bool UpdateAvailable)` (wire record, no Orleans attributes).
  - `public sealed class AppInstaller(IGrainFactory grains)` registered with `TryAddSingleton`:
    - `Task<AppSnapshot> Install(string publisher, string name, CancellationToken ct)`
    - `Task<AppSnapshot> Update(string name, CancellationToken ct)`
    - `Task<MarketplaceEntry> Entry(MarketplaceListing listing, CancellationToken ct)`
    All act in `BrainScope.CurrentId()` of the stamped caller. Errors: missing listing → `KeyNotFoundException`; name clash, self-install, not-installed, edited copy → `InvalidOperationException`.
  - `AppInstaller` is `public` (not internal) because `DigitalBrain.OS`'s boot service (B6) resolves it; it lives in the module runtime assembly, which scripts never see.

- [ ] **Step 1: Write the failing facts**

Append to `Runtimes/StorageHookFacts.cs` (it already defines the private `RecordingHook`):

```csharp
    [Fact]
    public async Task ReplacingTheProgramKeepsStorageSettingsAndConnectionsAndStopsOnlyRemovedBehaviors()
    {
        var ct = TestContext.Current.CancellationToken;
        var hook = new RecordingHook();
        var runtime = new DeployableRuntimeFacts.FakeRuntime();
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo =>
            {
                silo.Services.RemoveAll<IDeployableRuntime>();
                silo.Services.AddSingleton<IDeployableRuntime>(runtime);
                silo.Services.AddSingleton<IAppStorageHook>(hook);
            })
            .StartAsync(ct);
        var key = IApp.Key("hook-facts", "replaced");
        var app = brain.Get<IApp>(key);
        var manifest = new AppManifest("Replaced", "replaced", [], [new("Text", "what to say", "hi")], []);
        await app.Import(new("replaced", "1.0.0", manifest, "## Scenario: Stores\nIt stores.",
            new() { ["tests.cs"] = "// t", ["behaviors/keep.cs"] = "// v1", ["behaviors/drop.cs"] = "// v1" }));
        await app.Configure(new() { ["Text"] = "mine" }, new() { ["gmail"] = "my-gmail" });

        var next = manifest with { Settings = [.. manifest.Settings, new("Mood", "how to say it", "calm")] };
        var replaced = await app.Replace(new("replaced", "1.1.0", next, "## Scenario: Stores\nIt stores more.",
            new() { ["tests.cs"] = "// t", ["behaviors/keep.cs"] = "// v2", ["behaviors/new.cs"] = "// v2" }));

        // The app's storage is never retired: only the removed behavior's file stops.
        Assert.Empty(hook.Retired);
        Assert.Equal(["fake-behaviors/drop.cs"], Assert.Single(runtime.Retired).Keys);
        // Kept behaviors hot-swap, new ones deploy, and ownership moves to the current keys.
        Assert.Equal("// v2", runtime.Swapped.Last(item => item.Programs.ContainsKey("behaviors/keep.cs")).Programs["behaviors/keep.cs"]);
        Assert.Contains(runtime.Deployed, item => item.Programs.ContainsKey("behaviors/new.cs"));
        Assert.Equal(["fake-behaviors/keep.cs", "fake-behaviors/new.cs"], hook.Deployed.Last().Keys.Order(StringComparer.Ordinal).ToArray());
        // What the person chose survives; a newly declared setting gets its default.
        Assert.Equal("1.1.0", replaced.Version);
        Assert.Equal(AppStatus.Live, replaced.Status);
        Assert.Equal("mine", replaced.Settings["Text"]);
        Assert.Equal("calm", replaced.Settings["Mood"]);
        Assert.Equal("my-gmail", replaced.Connections["gmail"]);
        Assert.False(replaced.Files.ContainsKey("behaviors/drop.cs"));
    }

    [Fact]
    public async Task ReplacingAnAppThatDoesNotExistOrWithAnotherAppsBundleIsRefused()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>()
            .ConfigureSilo(silo => { silo.Services.RemoveAll<IDeployableRuntime>(); silo.Services.AddSingleton<IDeployableRuntime>(new DeployableRuntimeFacts.FakeRuntime()); })
            .StartAsync(ct);
        var manifest = new AppManifest("Replaced", "replaced", [], [], []);
        var missing = brain.Get<IApp>(IApp.Key("hook-facts", "missing"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => missing.Replace(new("missing", "1.0.0", manifest, "spec", new())));

        var app = brain.Get<IApp>(IApp.Key("hook-facts", "mine"));
        await app.Import(new("mine", "1.0.0", manifest, "spec", new() { ["tests.cs"] = "// t" }));
        await Assert.ThrowsAsync<InvalidDataException>(() => app.Replace(new("other", "1.1.0", manifest, "spec", new())));
        Assert.Equal("1.0.0", (await app.Read()).Version);
    }
```

`Apps/AppInstallerFacts.cs`:

```csharp
using DigitalBrain.Modules.Apps.Tests;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Apps.Tests.Apps;

// Install copies a published version into the caller's brain and remembers where it came from;
// Update replaces the program and keeps what the person chose, until the person edits it.
public sealed class AppInstallerFacts
{
    private const string Spec = "## Scenario: Echoes\nIt echoes.";
    private static readonly CancellationToken Ct = TestContext.Current.CancellationToken;

    private static AppManifest Manifest() =>
        new("Echo", "echoes", [new("ask", "ask it")], [new("Text", "what to say", "hi")], [new("gmail", "gmail")]);

    private static Task<ModuleBrain> Start() => ModuleTest.Create().WithModule<AppsModule>().StartAsync(Ct);

    private static AppInstaller Installer(ModuleBrain brain) => brain.SiloServices.GetRequiredService<AppInstaller>();

    private static IApp Mine(ModuleBrain brain, string principal, string name = "echo") => brain.Get<IApp>(IApp.Key(Owner.Scope(principal), name));

    private static async Task<IApp> Published(ModuleBrain brain, string publisher = "intochat")
    {
        Caller.Clear();
        var app = Mine(brain, publisher);
        await app.Create(Manifest(), Spec);
        await app.BeginBuild(null);
        await app.CompleteBuild(await app.CurrentBuildAttempt(), new() { ["tests.cs"] = "// t", ["behaviors/echo.cs"] = "// v1" }, null);
        await app.RecordVerdicts([new("Echoes", true, "ok")], green: true);
        Owner.Stamp(publisher);
        await app.Publish();
        Caller.Clear();
        return app;
    }

    private static async Task<string> PublishNewVersion(IApp app, string publisher = "intochat")
    {
        Caller.Clear();
        await app.WriteBehavior("behaviors/echo.cs", "// v2", Guid.NewGuid());
        await app.RecordVerdicts([new("Echoes", true, "ok")], green: true);
        Owner.Stamp(publisher);
        var version = (await app.Publish()).Version;
        Caller.Clear();
        return version;
    }

    [Fact]
    public async Task InstallCopiesThePublishedVersionLiveWithDefaultSettingsAndRecordsItsOrigin()
    {
        await using var brain = await Start();
        var source = await Published(brain);
        await source.Configure(new() { ["Text"] = "publisher's own" }, new() { ["gmail"] = "publisher-gmail" });

        Owner.Stamp("alice");
        var installed = await Installer(brain).Install("intochat", "echo", Ct);
        Caller.Clear();

        Assert.Equal(AppStatus.Live, installed.Status);
        Assert.Equal((await source.ExportPublished()).Version, installed.Version);
        Assert.Equal("hi", installed.Settings["Text"]);
        Assert.Empty(installed.Connections);
        Assert.Equal(new AppOrigin("account-intochat", "intochat", "intochat", "echo", installed.Version), installed.Origin);
        Assert.False(installed.Edited);
        Assert.Equal(installed.Version, (await Mine(brain, "alice").Read()).Version);
    }

    [Fact]
    public async Task InstallingAnAppNotInTheMarketplaceIsNotFound()
    {
        await using var brain = await Start();
        Owner.Stamp("alice");
        await Assert.ThrowsAsync<KeyNotFoundException>(() => Installer(brain).Install("intochat", "echo", Ct));
        Caller.Clear();
    }

    [Fact]
    public async Task InstallingOverAnAppOfTheSameNameIsRefusedAndLeavesItUntouched()
    {
        await using var brain = await Start();
        await Published(brain);
        var own = Mine(brain, "alice");
        await own.Create(Manifest() with { Title = "Alice's echo" }, Spec);

        Owner.Stamp("alice");
        await Assert.ThrowsAsync<InvalidOperationException>(() => Installer(brain).Install("intochat", "echo", Ct));
        Caller.Clear();
        var after = await own.Read();
        Assert.Equal("Alice's echo", after.Manifest.Title);
        Assert.Null(after.Origin);
    }

    [Fact]
    public async Task InstallingYourOwnPublishedAppIsRefused()
    {
        await using var brain = await Start();
        await Published(brain);
        Owner.Stamp("intochat");
        await Assert.ThrowsAsync<InvalidOperationException>(() => Installer(brain).Install("intochat", "echo", Ct));
        Caller.Clear();
    }

    [Fact]
    public async Task UpdateReplacesTheProgramAndKeepsSettingsAndConnections()
    {
        await using var brain = await Start();
        var source = await Published(brain);
        Owner.Stamp("alice");
        await Installer(brain).Install("intochat", "echo", Ct);
        await Mine(brain, "alice").Configure(new() { ["Text"] = "alice's words" }, new() { ["gmail"] = "alice-gmail" });
        var next = await PublishNewVersion(source);

        Owner.Stamp("alice");
        var updated = await Installer(brain).Update("echo", Ct);
        Caller.Clear();

        Assert.Equal(next, updated.Version);
        Assert.Equal("// v2", updated.Files["behaviors/echo.cs"]);
        Assert.Equal("alice's words", updated.Settings["Text"]);
        Assert.Equal("alice-gmail", updated.Connections["gmail"]);
        Assert.Equal(next, updated.Origin!.Version);
        Assert.False(updated.Edited);
    }

    [Fact]
    public async Task AnEditedCopyRefusesUpdates()
    {
        await using var brain = await Start();
        var source = await Published(brain);
        Owner.Stamp("alice");
        await Installer(brain).Install("intochat", "echo", Ct);
        Caller.Clear();
        await Mine(brain, "alice").WriteFile("notes.md", "mine now", Guid.NewGuid());
        await PublishNewVersion(source);

        Owner.Stamp("alice");
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Installer(brain).Update("echo", Ct));
        Caller.Clear();
        Assert.Contains("edits", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task UpdatingWithNothingNewerIsANoOp()
    {
        await using var brain = await Start();
        await Published(brain);
        Owner.Stamp("alice");
        var installed = await Installer(brain).Install("intochat", "echo", Ct);
        var again = await Installer(brain).Update("echo", Ct);
        Caller.Clear();
        Assert.Equal(installed.Version, again.Version);
        Assert.Equal(installed.Versions.Length, again.Versions.Length);
    }

    [Fact]
    public async Task UpdatingAnAppThatWasNotInstalledIsRefused()
    {
        await using var brain = await Start();
        await Mine(brain, "alice").Create(Manifest(), Spec);
        Owner.Stamp("alice");
        await Assert.ThrowsAsync<InvalidOperationException>(() => Installer(brain).Update("echo", Ct));
        Caller.Clear();
    }

    [Fact]
    public async Task AnEntryShowsInstalledAndAnUpdateOnlyForAnUneditedOlderCopy()
    {
        await using var brain = await Start();
        var source = await Published(brain);
        var marketplace = brain.Get<IMarketplace>(IMarketplace.Key);

        Owner.Stamp("alice");
        var before = await Installer(brain).Entry((await marketplace.Read("intochat", "echo"))!, Ct);
        Assert.False(before.Installed);
        Assert.False(before.UpdateAvailable);

        await Installer(brain).Install("intochat", "echo", Ct);
        var current = await Installer(brain).Entry((await marketplace.Read("intochat", "echo"))!, Ct);
        Assert.True(current.Installed);
        Assert.False(current.UpdateAvailable);

        await PublishNewVersion(source);
        Owner.Stamp("alice");
        Assert.True((await Installer(brain).Entry((await marketplace.Read("intochat", "echo"))!, Ct)).UpdateAvailable);

        Caller.Clear();
        await Mine(brain, "alice").WriteFile("notes.md", "mine now", Guid.NewGuid());
        Owner.Stamp("alice");
        var edited = await Installer(brain).Entry((await marketplace.Read("intochat", "echo"))!, Ct);
        Assert.True(edited.Installed);
        Assert.False(edited.UpdateAvailable);

        // The publisher sees its own listing as installed: the app is theirs.
        Owner.Stamp("intochat");
        Assert.True((await Installer(brain).Entry((await marketplace.Read("intochat", "echo"))!, Ct)).Installed);
        Caller.Clear();
    }

    [Fact]
    public async Task AnInstalledCopyKeepsWorkingAfterThePublisherDeletesTheApp()
    {
        await using var brain = await Start();
        var source = await Published(brain);
        Owner.Stamp("alice");
        await Installer(brain).Install("intochat", "echo", Ct);
        Caller.Clear();
        await source.Delete();

        Assert.Equal(AppStatus.Live, (await Mine(brain, "alice").Read()).Status);
        Owner.Stamp("alice");
        await Assert.ThrowsAsync<KeyNotFoundException>(() => Installer(brain).Update("echo", Ct));
        Caller.Clear();
    }
}
```

- [ ] **Step 2: Run the facts to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppInstallerFacts"`
Expected: build FAILS — `IApp.Replace`, `AppInstaller`, `MarketplaceEntry` do not exist.

- [ ] **Step 3: Replace on the app neuron**

`IApp.cs` — add after `Import`:

```csharp
    // An update: the bundle's program replaces this one in place. Settings, connections and the
    // app's stored data stay; behaviors the bundle lacks stop.
    [ResponseTimeout("00:10:00")] Task<AppSnapshot> Replace(AppBundle bundle);
```

In `AppNeuron.cs`, move Import's two validation checks (name, version) into a helper and call it
from both:

```csharp
    private void RequireBundleFor(AppBundle bundle)
    {
        if (bundle.Name != Name() || string.IsNullOrWhiteSpace(bundle.Name)
            || bundle.Name.Any(c => !char.IsAsciiLetterLower(c) && !char.IsAsciiDigit(c) && c != '-'))
        { throw new InvalidDataException($"'{bundle.Name}' is not a valid app name: lowercase letters, digits and dashes, matching the key."); }
        if (bundle.Version.Split('.') is not { Length: 3 } parts || parts.Any(part => !part.All(char.IsAsciiDigit) || part.Length == 0))
        { throw new InvalidDataException($"'{bundle.Version}' is not a version of the form major.minor.patch."); }
    }
```

`Import` now begins with `ArgumentNullException.ThrowIfNull(bundle);` then `RequireBundleFor(bundle);`
followed by its existing `Snapshot.Manifest is not null` check. Add after `Import`:

```csharp
    public async Task<AppSnapshot> Replace(AppBundle bundle)
    {
        ArgumentNullException.ThrowIfNull(bundle);
        RequireCreated();
        RequireBundleFor(bundle);
        var appKey = this.GetPrimaryKeyString();
        var existing = Snapshot.Files.Keys.Where(AppFiles.IsBehavior).ToHashSet(StringComparer.Ordinal);
        var removed = existing.Where(path => !bundle.Files.ContainsKey(path)).ToArray();
        var removedKeys = Deployable()?.Keys(appKey, Snapshot.ProgramGeneration, removed) ?? [];
        // Only the removed behaviors' files stop. The storage hooks are not told: their OnRetired
        // retires everything the app owns, and an update keeps the app's data.
        if (Deployable() is { } runtime && removedKeys.Length > 0)
        { await runtime.Retire(appKey, removedKeys, CancellationToken.None); }
        var next = Snapshot.Clone();
        next.Manifest = bundle.Manifest;
        next.Spec = bundle.Spec;
        next.Files = new(bundle.Files, StringComparer.Ordinal);
        foreach (var setting in bundle.Manifest.Settings)
        { if (!next.Settings.ContainsKey(setting.Name)) { next.Settings[setting.Name] = setting.Default; } }
        var behaviors = next.Files.Keys.Where(AppFiles.IsBehavior).ToArray();
        var keys = Deployable()?.Keys(appKey, next.ProgramGeneration, behaviors) ?? [];
        next.StorageFiles = [.. next.StorageFiles.Except(removedKeys, StringComparer.Ordinal).Concat(keys).Distinct(StringComparer.Ordinal)];
        next.DeployedFiles = [.. next.DeployedFiles.Except(removedKeys, StringComparer.Ordinal)];
        foreach (var path in removed) { next.BehaviorErrors.Remove(path); }
        next.Version = bundle.Version;
        next.Status = AppStatus.Live;
        Record(next);
        await Persist(next);
        foreach (var path in behaviors) { await DeployBehavior(path, next.Files[path], swap: existing.Contains(path)); }
        return Describe(Snapshot);
    }
```

The build still fails on `AppInstallerFacts` until Step 5; continue.

- [ ] **Step 4: The entry record**

`Contracts/Marketplace/MarketplaceEntry.cs`:

```csharp
namespace DigitalBrain.Apps;

// A listing as one brain sees it: whether the brain has it, and whether a newer published
// version is waiting for an unedited copy.
public sealed record MarketplaceEntry(MarketplaceListing Listing, bool Installed, bool UpdateAvailable);
```

- [ ] **Step 5: The installer**

`Apps/Marketplace/AppInstaller.cs`:

```csharp
using DigitalBrain.Framework.Enforcement;

namespace DigitalBrain.Apps;

// The one way an app crosses brains: copy the publisher's published bundle into the caller's
// brain and remember where it came from. The publisher's copy is read through ExportPublished,
// which is public, so Install needs no authority beyond the caller's own brain.
public sealed class AppInstaller(IGrainFactory grains)
{
    public async Task<AppSnapshot> Install(string publisher, string name, CancellationToken ct)
    {
        var scope = BrainScope.CurrentId();
        var listing = await Listing(publisher, name, ct);
        var publisherScope = BrainScope.Create(listing.PublisherAccountId, listing.PublisherBrainId).Id;
        if (publisherScope == scope) { throw new InvalidOperationException($"{name} is already yours: you published it."); }
        var target = grains.GetGrain<IApp>(IApp.Key(scope, name));
        if ((await target.Read().WaitAsync(ct)).Manifest.Title.Length > 0)
        { throw new InvalidOperationException($"You already have an app named {name}."); }
        var bundle = await grains.GetGrain<IApp>(IApp.Key(publisherScope, name)).ExportPublished().WaitAsync(ct);
        await target.Import(bundle).WaitAsync(ct);
        await target.RecordOrigin(new(listing.PublisherAccountId, listing.PublisherBrainId, listing.Publisher, name, bundle.Version)).WaitAsync(ct);
        return await target.Read().WaitAsync(ct);
    }

    public async Task<AppSnapshot> Update(string name, CancellationToken ct)
    {
        var target = grains.GetGrain<IApp>(IApp.Key(BrainScope.CurrentId(), name));
        var current = await target.Read().WaitAsync(ct);
        if (current.Origin is not { } origin)
        { throw new InvalidOperationException($"{name} was not installed from the Marketplace."); }
        if (current.Edited)
        { throw new InvalidOperationException($"{name} has your own edits; it no longer takes updates from {origin.Publisher}."); }
        var listing = await Listing(origin.Publisher, origin.Name, ct);
        if (AppVersions.Compare(listing.Version, origin.Version) <= 0) { return current; }
        var bundle = await grains.GetGrain<IApp>(IApp.Key(BrainScope.Create(origin.PublisherAccountId, origin.PublisherBrainId).Id, origin.Name))
            .ExportPublished().WaitAsync(ct);
        // Replace swaps the program in place: settings, connections and stored data stay.
        await target.Replace(bundle with { Name = name }).WaitAsync(ct);
        await target.RecordOrigin(origin with { Version = bundle.Version }).WaitAsync(ct);
        return await target.Read().WaitAsync(ct);
    }

    public async Task<MarketplaceEntry> Entry(MarketplaceListing listing, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(listing);
        var scope = BrainScope.CurrentId();
        if (BrainScope.Create(listing.PublisherAccountId, listing.PublisherBrainId).Id == scope) { return new(listing, true, false); }
        var local = await grains.GetGrain<IApp>(IApp.Key(scope, listing.Name)).Read().WaitAsync(ct);
        var installed = local.Origin is { } origin && origin.Publisher == listing.Publisher && origin.Name == listing.Name;
        var update = installed && !local.Edited && AppVersions.Compare(listing.Version, local.Origin!.Version) > 0;
        return new(listing, installed, update);
    }

    private async Task<MarketplaceListing> Listing(string publisher, string name, CancellationToken ct)
        => await grains.GetGrain<IMarketplace>(IMarketplace.Key).Read(publisher, name).WaitAsync(ct)
            ?? throw new KeyNotFoundException($"{publisher}/{name} is not in the Marketplace.");
}
```

In `AppsModule.Configure(ISiloBuilder silo)` add next to `Creator`:

```csharp
        silo.Services.TryAddSingleton<AppInstaller>();
```

- [ ] **Step 6: Run the facts to verify they pass, then the project**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*AppInstallerFacts"`
Expected: PASS (10 facts).
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*StorageHookFacts"`
Expected: PASS (3 facts).
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/Modules/DigitalBrain/Apps
git commit -m "feat(apps): install from the Marketplace; updates replace the program in place and keep its data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: Marketplace, publish and update over HTTP

**Files:**
- Create: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Marketplace/MarketplaceEndpoints.cs`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsEndpoints.cs` (publish, update, wire fields, 403, `View`/`Respond` internal)
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/AppsModule.cs` (map marketplace endpoints)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/MarketplaceRouteFacts.cs`

**Interfaces:**
- Consumes: B2 (`Publish`, `ExportPublished`, `IMarketplace`), B3 (`AppInstaller`, `MarketplaceEntry`).
- Produces (wire, consumed by the shell part):
  - `GET  /brains/{id}/marketplace` → `MarketplaceEntry[]` (JSON web casing: `listing{publisher,publisherAccountId,publisherBrainId,name,title,description,version,icon,scenarios}`, `installed`, `updateAvailable`).
  - `GET  /brains/{id}/marketplace/{publisher}/{name}` → `MarketplaceEntry`; 404 when absent.
  - `GET  /brains/{id}/marketplace/{publisher}/{name}/icon` → the published bundle's icon; 404 when the listing has no icon or the bundle lacks the file.
  - `GET  /brains/{id}/apps/{name}/icon` → the installed app's icon from its current files; 404 when the app does not exist, names no icon, or lacks the file.
  - Both icon routes answer the file with a content type by extension (`.svg` → `image/svg+xml`, `.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`, `.webp` → `image/webp`, anything else → `text/plain`). Bundle files are text, so in practice icons are SVG.
  - `POST /brains/{id}/marketplace/{publisher}/{name}/install` → app view; 404 absent, 409 clash/self.
  - `POST /brains/{id}/apps/{name}/publish` → app view; 409 red; 403 not the owner.
  - `POST /brains/{id}/apps/{name}/update` → app view; 409 edited/not installed; 404 listing gone.
  - App view gains `publishedVersion`, `origin` (`AppOrigin` or null), `edited`. List items gain `icon`, `publishedVersion`, `origin` (publisher username or null), `edited`.

- [ ] **Step 1: Write the failing route facts**

`Apps/MarketplaceRouteFacts.cs`:

```csharp
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Enforcement;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Modules.Apps.Tests;
using DigitalBrain.Testing.Module;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Apps.Tests.Apps;

// The Marketplace over HTTP: a publisher publishes, another brain browses, installs, sees an
// update when the publisher publishes again, and updates — all under the brain route.
public sealed class MarketplaceRouteFacts
{
    private const string Spec = "## Scenario: Echoes\nIt echoes.";

    [Fact(Timeout = 120_000)]
    public async Task PublishBrowseInstallAndUpdateAcrossTwoBrains()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        var publisherScope = BrainScope.Create("account-intochat", "intochat").Id;
        var source = brain.Get<IApp>(IApp.Key(publisherScope, "echo"));
        Caller.Clear();
        await source.Create(new("Echo", "echoes", [new("ask", "ask it")], [], [], Icon: "icon.svg"), Spec);
        await source.BeginBuild(null);
        await source.CompleteBuild(await source.CurrentBuildAttempt(),
            new() { ["tests.cs"] = "// t", ["behaviors/echo.cs"] = "// v1", ["icon.svg"] = "<svg id=\"echo\"/>" }, null);
        await source.RecordVerdicts([new("Echoes", true, "ok")], green: true);

        var builder = WebApplication.CreateBuilder();
        builder.Services.AddSingleton<IDigitalBrain>(brain.SiloServices.GetRequiredService<IDigitalBrain>());
        builder.Services.AddSingleton(brain.SiloServices.GetRequiredService<Creator>());
        builder.Services.AddSingleton(brain.SiloServices.GetRequiredService<AppWorkQueue>());
        builder.Services.AddSingleton(brain.SiloServices.GetRequiredService<AppInstaller>());
        builder.Services.AddSingleton<IBrainAccess, OpenBrainAccess>();
        await using var edge = builder.Build();
        new AppsModule().Configure(edge);
        var endpoints = ((IEndpointRouteBuilder)edge).DataSources.SelectMany(item => item.Endpoints).OfType<RouteEndpoint>().ToArray();

        // Publish acts in the caller's own brain: alice has no echo to publish; intochat does.
        var refused = await Invoke("alice", "POST", "/brains/{brainId}/apps/{name}/publish", ("brainId", "alice"), ("name", "echo"));
        Assert.Equal(409, refused.Status);
        var released = (await source.Read()).Version;
        var published = await Invoke("intochat", "POST", "/brains/{brainId}/apps/{name}/publish", ("brainId", "intochat"), ("name", "echo"));
        Assert.True(published.Status == 200, published.Status + ": " + published.Body);
        Assert.Equal(released, Json(published).GetProperty("publishedVersion").GetString());

        // Another brain browses: the listing is there, not installed yet, and its icon serves.
        var listed = await Invoke("alice", "GET", "/brains/{brainId}/marketplace/", ("brainId", "alice"));
        Assert.Equal(200, listed.Status);
        var entry = Assert.Single(Json(listed).EnumerateArray().ToArray());
        Assert.Equal("intochat", entry.GetProperty("listing").GetProperty("publisher").GetString());
        Assert.Equal(["Echoes"], entry.GetProperty("listing").GetProperty("scenarios").EnumerateArray().Select(item => item.GetString()));
        Assert.False(entry.GetProperty("installed").GetBoolean());

        var icon = await Invoke("alice", "GET", "/brains/{brainId}/marketplace/{publisher}/{name}/icon", ("brainId", "alice"), ("publisher", "intochat"), ("name", "echo"));
        Assert.Equal(200, icon.Status);
        Assert.StartsWith("image/svg+xml", icon.ContentType, StringComparison.Ordinal);
        Assert.Equal("<svg id=\"echo\"/>", icon.Body);

        var missing = await Invoke("alice", "GET", "/brains/{brainId}/marketplace/{publisher}/{name}", ("brainId", "alice"), ("publisher", "intochat"), ("name", "nothing"));
        Assert.Equal(404, missing.Status);

        // Install lands in alice's apps with its origin; a second install clashes.
        var installed = await Invoke("alice", "POST", "/brains/{brainId}/marketplace/{publisher}/{name}/install", ("brainId", "alice"), ("publisher", "intochat"), ("name", "echo"));
        Assert.True(installed.Status == 200, installed.Status + ": " + installed.Body);
        Assert.Equal("intochat", Json(installed).GetProperty("origin").GetProperty("publisher").GetString());
        var installedIcon = await Invoke("alice", "GET", "/brains/{brainId}/apps/{name}/icon", ("brainId", "alice"), ("name", "echo"));
        Assert.Equal(200, installedIcon.Status);
        Assert.StartsWith("image/svg+xml", installedIcon.ContentType, StringComparison.Ordinal);
        Assert.Equal("<svg id=\"echo\"/>", installedIcon.Body);
        var noApp = await Invoke("alice", "GET", "/brains/{brainId}/apps/{name}/icon", ("brainId", "alice"), ("name", "nothing"));
        Assert.Equal(404, noApp.Status);
        var apps = await Invoke("alice", "GET", "/brains/{brainId}/apps/", ("brainId", "alice"));
        var item = Assert.Single(Json(apps).EnumerateArray().ToArray());
        Assert.Equal("icon.svg", item.GetProperty("icon").GetString());
        Assert.Equal("intochat", item.GetProperty("origin").GetProperty("publisher").GetString());
        Assert.Equal("1.0.0", item.GetProperty("origin").GetProperty("version").GetString());
        Assert.False(item.GetProperty("updateAvailable").GetBoolean());
        var again = await Invoke("alice", "POST", "/brains/{brainId}/marketplace/{publisher}/{name}/install", ("brainId", "alice"), ("publisher", "intochat"), ("name", "echo"));
        Assert.Equal(409, again.Status);

        // The publisher ships a new green version; alice sees the update and takes it.
        Caller.Clear();
        await source.WriteBehavior("behaviors/echo.cs", "// v2", Guid.NewGuid());
        await source.RecordVerdicts([new("Echoes", true, "ok")], green: true);
        var republished = await Invoke("intochat", "POST", "/brains/{brainId}/apps/{name}/publish", ("brainId", "intochat"), ("name", "echo"));
        var next = Json(republished).GetProperty("publishedVersion").GetString();
        var detail = await Invoke("alice", "GET", "/brains/{brainId}/marketplace/{publisher}/{name}", ("brainId", "alice"), ("publisher", "intochat"), ("name", "echo"));
        Assert.True(Json(detail).GetProperty("updateAvailable").GetBoolean());
        var updated = await Invoke("alice", "POST", "/brains/{brainId}/apps/{name}/update", ("brainId", "alice"), ("name", "echo"));
        Assert.True(updated.Status == 200, updated.Status + ": " + updated.Body);
        Assert.Equal(next, Json(updated).GetProperty("version").GetString());
        Assert.False(Json(updated).GetProperty("edited").GetBoolean());

        async Task<(int Status, string Body, string ContentType)> Invoke(string principal, string method, string pattern, params (string Key, string Value)[] values)
        {
            CallerContextStamper.Stamp(new CallerContext
            {
                PrincipalId = principal,
                AccountId = "account-" + principal,
                BrainId = principal,
                Kind = CallerKind.User,
                StampedBy = TrustedEdge.AuthenticatedHttp,
            });
            var endpoint = endpoints.Single(item => item.RoutePattern.RawText == pattern
                && item.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods.Contains(method));
            var http = new DefaultHttpContext { RequestServices = edge.Services, RequestAborted = ct };
            http.Request.Method = method;
            http.Request.Headers.Authorization = "Basic test";
            foreach (var (key, value) in values) { http.Request.RouteValues[key] = value; }
            http.Response.Body = new MemoryStream();
            http.SetEndpoint(endpoint);
            await endpoint.RequestDelegate!(http);
            http.Response.Body.Position = 0;
            var body = await new StreamReader(http.Response.Body).ReadToEndAsync(ct);
            Caller.Clear();
            return (http.Response.StatusCode, body, http.Response.ContentType ?? "");
        }

        static JsonElement Json((int Status, string Body, string ContentType) result) => JsonDocument.Parse(result.Body).RootElement.Clone();
    }

    private sealed class OpenBrainAccess : IBrainAccess
    {
        public ValueTask<bool> CanAccessAsync(string principalId, string accountId, string brainId, CancellationToken cancellationToken = default)
            => ValueTask.FromResult(true);
    }
}
```

- [ ] **Step 2: Run the facts to verify they fail**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*MarketplaceRouteFacts"`
Expected: FAIL — `Single` finds no endpoint for `/brains/{brainId}/apps/{name}/publish`.

- [ ] **Step 3: Publish, update and the wire fields in AppsEndpoints**

In `AppsEndpoints.cs`:

1. After the `/{name}/rollback` mapping add:

```csharp
        apps.MapPost("/{name}/publish", (string name, IDigitalBrain brain) => Respond(async ()
            => Results.Ok(View(await App(brain, name).Publish()))));

        apps.MapPost("/{name}/update", (string name, [FromServices] AppInstaller installer, CancellationToken ct) => Respond(async ()
            => Results.Ok(View(await installer.Update(name, ct)))));

        apps.MapGet("/{name}/icon", (string name, IDigitalBrain brain, CancellationToken ct) => Respond(async () =>
        {
            var snapshot = await App(brain, name).Read().WaitAsync(ct);
            return Icon(snapshot.Manifest.Icon, snapshot.Files, name);
        }));
```

   and add the shared icon answer next to `View`:

```csharp
    // An icon is a bundle file the manifest names; the shell renders it by its content type.
    internal static IResult Icon(string? path, IReadOnlyDictionary<string, string> files, string app)
    {
        if (path is null || !files.TryGetValue(path, out var content))
        { return Results.NotFound(new { error = $"{app} has no icon." }); }
        var type = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            _ => "text/plain",
        };
        return Results.Text(content, type);
    }
```

2. The list handler reads the Marketplace once (it already receives `IDigitalBrain brain`), before
   building its items:

```csharp
        var listings = await brain.Get<IMarketplace>(IMarketplace.Key).List();
```

   and in the item's anonymous object, after `operations = ...`, adds (the shell's
   `InstalledAppSummary` mirrors exactly these fields, Part D1):

```csharp
                    icon = snapshot.Manifest.Icon,
                    publishedVersion = snapshot.PublishedVersion,
                    origin = snapshot.Origin is { } origin
                        ? new { publisher = origin.Publisher, name = origin.Name, version = origin.Version }
                        : null,
                    edited = snapshot.Edited,
                    // The same rule as AppInstaller.Entry: an unedited copy whose publisher listed a newer version.
                    updateAvailable = snapshot.Origin is { } source && !snapshot.Edited
                        && listings.FirstOrDefault(listing => listing.Publisher == source.Publisher && listing.Name == source.Name) is { } listed
                        && AppVersions.Compare(listed.Version, source.Version) > 0,
```

3. Change `private static object View(AppSnapshot snapshot)` to `internal static object View(AppSnapshot snapshot)` and add after `verdicts = snapshot.Verdicts,`:

```csharp
        publishedVersion = snapshot.PublishedVersion,
        origin = snapshot.Origin,
        edited = snapshot.Edited,
```

4. Change `private static async Task<IResult> Respond(` to `internal static async Task<IResult> Respond(` and add a catch before the `KeyNotFoundException` catch:

```csharp
        catch (UnauthorizedAccessException error) { return Results.Json(new { error = error.Message }, statusCode: 403); }
```

- [ ] **Step 4: The Marketplace endpoints**

`Apps/Marketplace/MarketplaceEndpoints.cs`:

```csharp
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Framework.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace DigitalBrain.Apps;

// Browse, inspect and install published apps from inside one brain.
internal static class MarketplaceEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        var marketplace = BrainRoutes.Group(endpoints, "/marketplace").AddEndpointFilter(ModuleRouteGuard.Guard);

        marketplace.MapGet("", (IDigitalBrain brain, [FromServices] AppInstaller installer, CancellationToken ct) => AppsEndpoints.Respond(async () =>
        {
            var entries = new List<MarketplaceEntry>();
            foreach (var listing in await brain.Get<IMarketplace>(IMarketplace.Key).List().WaitAsync(ct))
            { entries.Add(await installer.Entry(listing, ct)); }
            return Results.Ok(entries);
        }));

        marketplace.MapGet("/{publisher}/{name}", (string publisher, string name, IDigitalBrain brain, [FromServices] AppInstaller installer, CancellationToken ct)
            => AppsEndpoints.Respond(async () => Results.Ok(await installer.Entry(await Listing(brain, publisher, name, ct), ct))));

        marketplace.MapGet("/{publisher}/{name}/icon", (string publisher, string name, IDigitalBrain brain, CancellationToken ct) => AppsEndpoints.Respond(async () =>
        {
            var listing = await Listing(brain, publisher, name, ct);
            if (listing.Icon is null) { return Results.NotFound(new { error = $"{publisher}/{name} has no icon." }); }
            var bundle = await brain.Get<IApp>(IApp.Key(BrainScope.Create(listing.PublisherAccountId, listing.PublisherBrainId).Id, listing.Name))
                .ExportPublished().WaitAsync(ct);
            return AppsEndpoints.Icon(listing.Icon, bundle.Files, $"{publisher}/{name}");
        }));

        marketplace.MapPost("/{publisher}/{name}/install", (string publisher, string name, [FromServices] AppInstaller installer, CancellationToken ct)
            => AppsEndpoints.Respond(async () => Results.Ok(AppsEndpoints.View(await installer.Install(publisher, name, ct)))));
    }

    private static async Task<MarketplaceListing> Listing(IDigitalBrain brain, string publisher, string name, CancellationToken ct)
        => await brain.Get<IMarketplace>(IMarketplace.Key).Read(publisher, name).WaitAsync(ct)
            ?? throw new KeyNotFoundException($"{publisher}/{name} is not in the Marketplace.");
}
```

In `AppsModule.Configure(IEndpointRouteBuilder endpoints)` add after `AppsEndpoints.Map(endpoints);`:

```csharp
        MarketplaceEndpoints.Map(endpoints);
```

- [ ] **Step 5: Run the facts to verify they pass, then the project**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*MarketplaceRouteFacts"`
Expected: PASS.
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS (`AppRouteFacts` still passes: the view only gained fields).

- [ ] **Step 6: Commit**

```bash
git add src/Modules/DigitalBrain/Apps
git commit -m "feat(apps): browse, install, publish and update over the brain route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B5: The IntoChat apps ship icons

Part A's A5 owns `app.json`'s `"icon"` in the shipped-folder parser (`ShippedAppFolder`/`AppJson`):
reading it into `AppManifest.Icon`, refusing a named icon missing from the folder, and writing it
back on sync, with its own round-trip fact. B5 depends on A5 and owns only the content: the SVG
files and the `"icon"` entries of the IntoChat apps.

**Files:**
- Create: `src/IntoChat/Apps/CustomerResearcher/icon.svg`
- Create: `src/IntoChat/Apps/WordCount/icon.svg`
- Modify: `src/IntoChat/Apps/CustomerResearcher/app.json`, `src/IntoChat/Apps/WordCount/app.json` (add `"icon": "icon.svg"`)
- Test: `src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/DirectoryShippedAppSourceFacts.cs`

**Interfaces:**
- Consumes: B1 (`AppManifest.Icon`), A5 (`DirectoryShippedAppSource` reads `"icon"` into `AppManifest.Icon` and keeps the file in the bundle).
- Produces: every app under `src/IntoChat/Apps` names `icon.svg` and ships it.

- [ ] **Step 1: Write the failing fact**

Append to `DirectoryShippedAppSourceFacts`:

```csharp
    [Fact]
    public void TheIntoChatAppsShipTheirIcons()
    {
        var apps = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", "..", "..", "IntoChat", "Apps"));
        var bundles = new DirectoryShippedAppSource(apps, "intochat").Load();
        Assert.NotEmpty(bundles);
        foreach (var app in bundles)
        {
            Assert.Equal("icon.svg", app.Manifest.Icon);
            Assert.StartsWith("<svg", app.Files["icon.svg"], StringComparison.Ordinal);
        }
    }
```

The climb goes from `tests/DigitalBrain.Modules.Apps.Tests/bin/Debug/net11.0/` up to `src/`. If
`Load()` throws `DirectoryNotFoundException`, the message prints the path; adjust the number of
`".."` segments until it resolves to `src/IntoChat/Apps`.

- [ ] **Step 2: Run the fact to verify it fails**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*DirectoryShippedAppSourceFacts"`
Expected: FAIL — `app.Manifest.Icon` is null for `customer-researcher`.

- [ ] **Step 3: Ship the icons**

`src/IntoChat/Apps/CustomerResearcher/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2F6FEB"/><circle cx="28" cy="28" r="13" fill="none" stroke="#fff" stroke-width="5"/><path d="M38 38l12 12" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>
```

`src/IntoChat/Apps/WordCount/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1F9D6B"/><path d="M16 22h32M16 32h24M16 42h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>
```

In both `app.json` files add after the `"version"` line:

```json
  "icon": "icon.svg",
```

- [ ] **Step 4: Run the facts to verify they pass, then the project**

Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests --filter-class "*DirectoryShippedAppSourceFacts"`
Expected: PASS.
Run: `dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/IntoChat/Apps src/Modules/DigitalBrain/Apps/tests
git commit -m "feat(intochat): Customer Researcher and Word count ship Marketplace icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B6: New brains install the OS defaults from the Marketplace

**Files:**
- Modify: `src/DigitalBrain/OS/DigitalBrain.OS/OsApps.cs` (`OsApp(Publisher, Name)`, defaults, `OsBootService` rewrite)
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs` (rewrite)
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsShippedAppFacts.cs` (`OsApp` shape, two defaults)

**Interfaces:**
- Consumes: B2 (`IMarketplace`, `Publish`), B3 (`AppInstaller.Install`).
- Produces: `public sealed record OsApp(string Publisher, string Name)`; `AddOperatingSystemApps` defaults `("os","settings")` and `("os","assistant")`; `OsBootService` installs each missing default on `Activated` and never upgrades a present one.

- [ ] **Step 1: Rewrite the boot facts (failing)**

Replace the `OsBootFacts` class (keep the file's usings unchanged) with:

```csharp
public sealed class OsBootFacts
{
    private static readonly string OsScope = BrainScope.Create("account-os", "os").Id;

    [Fact(Timeout = 60_000)]
    public async Task EstablishingABrainInstallsThePublishedDefaultsWithTheirOrigin()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Boot(ct, new OsApp("os", "hello"));
        var released = await SeedPublished(brain, "hello");

        var scope = await Establish(brain);
        var installed = await WaitForAsync(brain.Get<IApp>(IApp.Key(scope, "hello")), snapshot => snapshot.Status == AppStatus.Live, ct);
        Assert.Equal(released, installed.Version);
        Assert.Equal("os", installed.Origin!.Publisher);
    }

    [Fact(Timeout = 60_000)]
    public async Task ANewPublishedVersionIsOfferedNotForcedOnReactivation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Boot(ct, new OsApp("os", "hello"));
        var source = brain.Get<IApp>(IApp.Key(OsScope, "hello"));
        var released = await SeedPublished(brain, "hello");
        var scope = await Establish(brain);
        var app = brain.Get<IApp>(IApp.Key(scope, "hello"));
        await WaitForAsync(app, snapshot => snapshot.Status == AppStatus.Live, ct);

        Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
        await source.SaveSpec("## Scenario: Greets\nIt greets twice.", Guid.NewGuid());
        await source.RecordVerdicts([new("Greets", true, "ok")], green: true);
        StampOs();
        await source.Publish();

        StampBrainOwner();
        var neuron = brain.Get<IBrain>(scope);
        await brain.DeactivateAsync(neuron, ct);
        await neuron.Read();
        await Task.Delay(500, ct);
        Assert.Equal(released, (await app.Read()).Version);
    }

    [Fact(Timeout = 60_000)]
    public async Task ADefaultMissingFromTheMarketplaceIsSkippedAndInstalledOnALaterActivation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Boot(ct, new OsApp("os", "hello"), new OsApp("os", "later"));
        await SeedPublished(brain, "hello");

        var scope = await Establish(brain);
        await WaitForAsync(brain.Get<IApp>(IApp.Key(scope, "hello")), snapshot => snapshot.Status == AppStatus.Live, ct);
        Assert.Equal(AppStatus.Drafted, (await brain.Get<IApp>(IApp.Key(scope, "later")).Read()).Status);

        await SeedPublished(brain, "later");
        StampBrainOwner();
        var neuron = brain.Get<IBrain>(scope);
        await brain.DeactivateAsync(neuron, ct);
        await neuron.Read();
        await WaitForAsync(brain.Get<IApp>(IApp.Key(scope, "later")), snapshot => snapshot.Status == AppStatus.Live, ct);
    }

    [Fact(Timeout = 60_000)]
    public async Task ADefaultThePersonAlreadyHasIsLeftAlone()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Boot(ct, new OsApp("os", "hello"));
        await SeedPublished(brain, "hello");
        var scope = BrainScope.Create("acct", "home").Id;
        Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
        var own = brain.Get<IApp>(IApp.Key(scope, "hello"));
        await own.Create(new("My hello", "mine", [], [], []), "## Scenario: Mine\nMine.");

        await Establish(brain);
        await Task.Delay(500, ct);
        var after = await own.Read();
        Assert.Equal("My hello", after.Manifest.Title);
        Assert.Null(after.Origin);
    }

    private static Task<ModuleBrain> Boot(CancellationToken ct, params OsApp[] defaults) => ModuleTest.Create()
        .WithModule<AppsModule>()
        .ConfigureSilo(silo =>
        {
            silo.Services.RemoveAll<DigitalBrain.Apps.IDeployableRuntime>();
            silo.Services.AddOperatingSystemBoot(os => { foreach (var app in defaults) { os.Apps.Add(app); } });
        })
        .StartAsync(ct);

    private static async Task<string> Establish(ModuleBrain brain)
    {
        var scope = BrainScope.Create("acct", "home").Id;
        StampBrainOwner();
        await brain.AuthorizeCallerAsync();
        await brain.Get<IBrain>(scope).Establish(new("home", "acct"));
        return scope;
    }

    // The os account's copy: created, built, recorded green and published. Building plays the
    // platform (unstamped); publishing speaks for the os account.
    private static async Task<string> SeedPublished(ModuleBrain brain, string name)
    {
        Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
        var source = brain.Get<IApp>(IApp.Key(OsScope, name));
        await source.Create(new("Hello", "Shows hello world", [new("open", "Open")], [new("Greeting", "what to say", "hello")], []),
            "## Scenario: Greets\nIt greets.");
        await source.BeginBuild(null);
        await source.CompleteBuild(await source.CurrentBuildAttempt(), new() { ["tests.cs"] = "// t", ["behaviors/hello.cs"] = "// b" }, null);
        await source.RecordVerdicts([new("Greets", true, "ok")], green: true);
        StampOs();
        var published = await source.Publish();
        Orleans.Runtime.RequestContext.Remove(CallerContextStamper.RequestContextKey);
        return published.Version;
    }

    private static void StampOs() => CallerContextStamper.Stamp(new()
    {
        PrincipalId = "os",
        AccountId = "account-os",
        BrainId = "os",
        Kind = CallerKind.Platform,
        StampedBy = TrustedEdge.Platform,
    });

    private static void StampBrainOwner() => CallerContextStamper.Stamp(new()
    {
        PrincipalId = "acct",
        AccountId = "acct",
        BrainId = "home",
        Kind = CallerKind.User,
        StampedBy = TrustedEdge.AuthenticatedHttp,
    });

    // The boot behavior reacts to a signal, so the facts wait for the state it converges on.
    private static async Task<AppSnapshot> WaitForAsync(IApp app, Func<AppSnapshot, bool> done, CancellationToken ct)
    {
        var snapshot = await app.Read();
        var started = TimeProvider.System.GetTimestamp();
        while (!done(snapshot) && TimeProvider.System.GetElapsedTime(started) < TimeSpan.FromSeconds(30))
        {
            await Task.Delay(100, ct);
            snapshot = await app.Read();
        }
        Assert.True(done(snapshot), $"The app did not converge; status {snapshot.Status}, version {snapshot.Version}.");
        return snapshot;
    }
}
```

In `OsShippedAppFacts.cs`:
- `AddOperatingSystemAppsNamesItsOwnManifestAndADeploymentOnlyAdds`: change the configure call to `os.Apps.Add(new("intochat", "customer-researcher"))` and the assertion to
  `Assert.Equal(["os/settings", "os/assistant", "intochat/customer-researcher"], options.Apps.Select(app => app.Publisher + "/" + app.Name));`
- `TheOperatingSystemCompositionWiresItsAppsIntoTheHost`: assert `app.Publisher == "os" && app.Name == "settings"`.
- `RegisteringTheOsAppsTwiceDoesNotDuplicateTheManifest`: replace `Assert.Single(...)` with
  `Assert.Equal(2, provider.GetRequiredService<IOptions<OsAppsOptions>>().Value.Apps.Count);`

- [ ] **Step 2: Run the facts to verify they fail**

Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit --filter-class "*OsBootFacts"`
Expected: build FAILS — `OsApp` has one parameter.

- [ ] **Step 3: Rewrite OsApps.cs**

Replace `OsApp`, the defaults block and `OsBootService` in `OsApps.cs`:

```csharp
// The operating system's default apps: Marketplace entries every new brain installs. The list
// is deployment configuration; a distribution names its own.
public sealed record OsApp(string Publisher, string Name);
```

In `AddOperatingSystemApps`, replace the `services.Configure<OsAppsOptions>(os => { ... })` block with:

```csharp
        services.Configure<OsAppsOptions>(os =>
        {
            // Idempotent so a host that both composes the OS and wires the apps explicitly
            // does not install a default twice.
            foreach (var app in new[] { new OsApp("os", "settings"), new OsApp("os", "assistant") })
            { if (!os.Apps.Contains(app)) { os.Apps.Add(app); } }
        });
```

Replace the `OsBootService` class (and the comment above it) with:

```csharp
// The OS boots in the system's own language: the brain neuron publishes Activated, and this
// behavior installs every default the brain does not have yet, through the same Marketplace
// Install anyone uses. A present app is the person's, never replaced here; newer versions are
// offered as updates. A default not yet published is picked up on a later activation.
internal sealed class OsBootService(
    LocalSignalHub signals, IGrainFactory grains, AppInstaller installer, IOptions<OsAppsOptions> options, ILogger<OsBootService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (options.Value.Apps.Count == 0) { return; }
        var apps = options.Value.Apps.ToArray();
        using var activations = signals.Subscribe<Activated>();
        await foreach (var activated in activations.Reader.ReadAllAsync(stoppingToken))
        {
            foreach (var app in apps)
            {
                try { await EnsureInstalledAsync(activated, app, stoppingToken); }
                catch (Exception error) when (error is not OperationCanceledException)
                {
                    // One default failing must not keep the others from installing; the next
                    // activation retries.
                    logger.LogWarning(error, "Default app {Publisher}/{App} did not install in brain {Brain}.", app.Publisher, app.Name, activated.BrainId);
                }
            }
        }
    }

    private async Task EnsureInstalledAsync(Activated activated, OsApp app, CancellationToken cancellationToken)
    {
        // The brain's (owner, name) pair is the scope identity the kernel derives everywhere
        // from the caller; the install must land in the activated brain's own scope.
        CallerContextStamper.Stamp(new CallerContext
        {
            PrincipalId = "os",
            AccountId = activated.OwnerAccountId,
            BrainId = activated.Name,
            Kind = CallerKind.Platform,
            StampedBy = TrustedEdge.Platform,
        });
        var listing = await grains.GetGrain<IMarketplace>(IMarketplace.Key).Read(app.Publisher, app.Name).WaitAsync(cancellationToken);
        if (listing is null)
        {
            logger.LogDebug("Default app {Publisher}/{App} is not in the Marketplace yet.", app.Publisher, app.Name);
            return;
        }
        // The publisher's own brain already owns its apps.
        if (BrainScope.Create(listing.PublisherAccountId, listing.PublisherBrainId).Id == activated.BrainId) { return; }
        if ((await grains.GetGrain<IApp>(IApp.Key(activated.BrainId, app.Name)).Read().WaitAsync(cancellationToken)).Manifest.Title.Length > 0) { return; }
        await installer.Install(app.Publisher, app.Name, cancellationToken);
    }
}
```

- [ ] **Step 4: Run the facts to verify they pass, then the project**

Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit --filter-class "*OsBootFacts"`
Expected: PASS (4 facts).
Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain/OS
git commit -m "feat(os): new brains install the default apps from the Marketplace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Part B review focus (fold into the plan's Review Focus)

1. **An update must keep the person's stored data.** Update goes through `IApp.Replace`, never Delete→Import, because the Postgres hook's `OnRetired` retires every table the app owns. Pinned by `ReplacingTheProgramKeepsStorageSettingsAndConnectionsAndStopsOnlyRemovedBehaviors` (B3). Adjacent, not fixed here: `Rollback` calls `OnRetired` for removed behaviors, and the same hook then also retires the app-level tables — a rollback that drops a behavior loses the app's rows. Raise it with the coordinator.
2. **A publisher deletes a published app.** Installed copies must keep working and stop offering updates — pinned by `AnInstalledCopyKeepsWorkingAfterThePublisherDeletesTheApp` (B3).
3. **Version ordering past 9.** `1.10.0` must beat `1.9.0` for update offers — pinned by `VersionsCompareNumerically` (B1).
4. **A person already has an app with the listing's name.** Install must refuse and leave it untouched; boot must not overwrite it — pinned by `InstallingOverAnAppOfTheSameNameIsRefusedAndLeavesItUntouched` (B3) and `ADefaultThePersonAlreadyHasIsLeftAlone` (B6).
5. **The publisher keeps editing after publishing.** Installers must get the released version, not the work in progress — pinned by `ThePublishedBundleStaysTheReleasedVersionWhileThePublisherKeepsEditing` (B2).


## Part C — The Assistant as the `os/assistant` app (spec §4)

Part C makes the runner callable from scripts and replaces the built-in Assistant's window with an
ordinary OS app. What stays a platform neuron: `IAgentExecution` (model calls, tool execution,
metering), `IAgent` conversations, the discovery/inventory/form tool factories, `/agent` SSE,
`/conversations/{id}`, `/voice`, `/ai/models`, compute-usage routes. What goes: every
window/surface/UI-event member of `IAssistant` and the `/applications/assistant/*` and
`/built-in/*` routes.

Consumes from Parts A/B: `AppManifest.Icon` (Part B) and `app.json` `"icon"`; the embedded source
takes an account (`AddShippedApps(assembly, "DigitalBrain.OS.Apps/", account: "os")`, Part A);
`OsAppsOptions.Apps` lists `("os","assistant")` (Part B installs it on activation).

Produces for Part D: `POST /brains/{id}/apps/assistant/ask {"operation":"open","input":"docked"}`
answers `{"id":"assistant-docked","title":"Assistant","surface":"<surface part name>","docked":true}`
and does **not** open a workspace window; `input:""` answers
`{"id":"assistant","title":"Assistant","surface":"<same name>","docked":false}` after
`IWorkspace.EnsureOpenAsync`. Part D renders `surface` in the side panel for the docked case.

---

### Task C1: Task-shaped agent turns publish turn signals

**Files:**
- Create: `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Agents/AgentTurnStart.cs`
- Create: `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Agents/Signals/AgentTurnSignals.cs`
- Create: `src/Modules/AI/DigitalBrain.Modules.AI/Agents/IAgentTurnDriver.cs`
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI.Contracts/Agents/IAgentExecution.cs`
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/Agents/AgentExecutionNeuron.cs`
- Test: `src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentTurnStartFacts.cs`

**Interfaces:**
- Produces:
  - `Task<string> IAgentExecution.Start(AgentTurnStart turn)` — returns the run id immediately;
    the turn runs in the background on the execution neuron.
  - `record AgentTurnStart(string Conversation, string Model, string SystemPrompt, string[] Tools, string Message)`
  - Signals (publisher = the execution neuron):
    `AgentTurnProgressed(string RunId, string Kind, string? Text, string? Tool, string? Payload, int Sequence)`
    (Kind ∈ `text`, `tool-call`, `tool-result`, `card`, `receipt`; Sequence starts at 1 per run and
    is the dedup key for at-least-once delivery), `AgentTurnCompleted(string RunId)`,
    `AgentTurnFailed(string RunId, string Error)`.
  - The conversation named by `turn.Conversation` is an `IAgent` key; Start opens the turn with
    `BeginConversation(new(runId, message))` and closes it with `CompleteConversation` (assistant
    text on success, `"The turn failed: <error>"` on failure), so the conversation is the
    durable transcript.

- [ ] **Step 1: Write the failing tests**

```csharp
using DigitalBrain;
using DigitalBrain.AI;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Agents.Signals;
using DigitalBrain.Enforcement;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests;

public sealed class AgentTurnStartFacts
{
    private static void StampUser() => CallerContextStamper.Stamp(new CallerContext
    {
        PrincipalId = "owner", AccountId = "owner", BrainId = "research",
        Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp,
    });

    [Fact]
    public async Task StartAnswersARunIdAndPublishesTheTextThenCompletion()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IChatClient>(StubChatClient.Replying("hello there"))).StartAsync(ct);
        StampUser();
        try
        {
            var scope = BrainScope.CurrentId();
            var execution = brain.Get<IAgentExecution>(scope + "/apps/assistant/execution");
            var signals = brain.Record<Signal>(execution);

            var runId = await execution.Start(new(scope + "/apps/assistant/conversations/main", "", "Be brief.", [], "hi"));

            await signals.WaitFor<AgentTurnCompleted>(completed => completed.RunId == runId, ct);
            var text = Assert.Single(signals.Of<AgentTurnProgressed>(), progressed => progressed.Kind == "text");
            Assert.Equal(("hello there", runId, 1), (text.Text, text.RunId, text.Sequence));
            var conversation = await brain.Get<IAgent>(scope + "/apps/assistant/conversations/main").ReadConversation(ct);
            var turn = Assert.Single(conversation.Turns);
            Assert.Equal(("hi", "hello there"), (turn.UserText, turn.AssistantText));
            Assert.Null(conversation.ActiveRunId);
        }
        finally { Orleans.Runtime.RequestContext.Clear(); }
    }

    [Fact]
    public async Task AFailingTurnPublishesFailedAndKeepsTheFailureInTheConversation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IChatClient>(StubChatClient.Failing("provider down"))).StartAsync(ct);
        StampUser();
        try
        {
            var scope = BrainScope.CurrentId();
            var execution = brain.Get<IAgentExecution>(scope + "/apps/assistant/execution");
            var signals = brain.Record<Signal>(execution);

            var runId = await execution.Start(new(scope + "/apps/assistant/conversations/main", "", "", [], "hi"));

            var failed = await signals.WaitFor<AgentTurnFailed>(item => item.RunId == runId, ct);
            Assert.Contains("provider down", failed.Error, StringComparison.Ordinal);
            var turn = Assert.Single((await brain.Get<IAgent>(scope + "/apps/assistant/conversations/main").ReadConversation(ct)).Turns);
            Assert.StartsWith("The turn failed:", turn.AssistantText, StringComparison.Ordinal);
        }
        finally { Orleans.Runtime.RequestContext.Clear(); }
    }

    [Fact]
    public async Task StartRefusesAConversationOutsideTheCallersBrain()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IChatClient>(StubChatClient.Replying("never"))).StartAsync(ct);
        StampUser();
        try
        {
            var execution = brain.Get<IAgentExecution>(BrainScope.CurrentId() + "/apps/assistant/execution");
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
                execution.Start(new("workspace-" + new string('0', 64) + "/conversations/main", "", "", [], "hi")));
        }
        finally { Orleans.Runtime.RequestContext.Clear(); }
    }
}
```

`brain.Record<Signal>(neuron)` / `WaitFor<T>` / `Of<T>()` and `StubChatClient.Failing` — check
`src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Shared/` first. If `StubChatClient` has no
`Failing`, add it there:

```csharp
public static StubChatClient Failing(string message) => new(_ => throw new InvalidOperationException(message));
```

If `ModuleTest` has no signal recorder, write the facts against `LocalSignalHub` instead:
`var hub = brain.Services.GetRequiredService<LocalSignalHub>(); using var subscription = hub.Subscribe<AgentTurnCompleted>();`
and read `subscription.Reader` with a 10-second `CancellationTokenSource`. Keep the assertions as
written.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests --filter "FullyQualifiedName~AgentTurnStartFacts"`
Expected: build FAIL — `IAgentExecution` has no `Start`, `AgentTurnStart` does not exist.

- [ ] **Step 3: Add the contracts**

`AgentTurnStart.cs`:

```csharp
namespace DigitalBrain.AI.Agents;

// What a script asks of one agent turn. Model is empty for the deployment default, a catalog id,
// or "scripted/<key>"; Conversation is the IAgent that keeps the transcript.
[GenerateSerializer, Alias("ai.turn-start")]
public sealed record AgentTurnStart(
    [property: Id(0)] string Conversation,
    [property: Id(1)] string Model,
    [property: Id(2)] string SystemPrompt,
    [property: Id(3)] string[] Tools,
    [property: Id(4)] string Message);
```

`Signals/AgentTurnSignals.cs`:

```csharp
namespace DigitalBrain.AI.Agents.Signals;

// Sequence numbers a run's progress from 1; delivery is at-least-once, so handlers key their
// writes by (RunId, Sequence).
[GenerateSerializer, Alias("ai.agent-turn-progressed")]
public sealed record AgentTurnProgressed(
    [property: Id(0)] string RunId,
    [property: Id(1)] string Kind,
    [property: Id(2)] string? Text,
    [property: Id(3)] string? Tool,
    [property: Id(4)] string? Payload,
    [property: Id(5)] int Sequence) : Signal;

[GenerateSerializer, Alias("ai.agent-turn-completed")]
public sealed record AgentTurnCompleted([property: Id(0)] string RunId) : Signal;

[GenerateSerializer, Alias("ai.agent-turn-failed")]
public sealed record AgentTurnFailed([property: Id(0)] string RunId, [property: Id(1)] string Error) : Signal;
```

In `IAgentExecution.cs` add below `Run`:

```csharp
    Task<string> Start(AgentTurnStart turn);
```

`IAgentTurnDriver.cs` (runtime assembly, internal):

```csharp
namespace DigitalBrain.AI.Agents;

// Start hands the turn to this one-way self-reference, so the caller's request ends while the
// turn runs on the neuron's own scheduler.
internal interface IAgentTurnDriver : IGrainWithStringKey
{
    [Orleans.Concurrency.OneWay] Task Drive(string runId, AgentTurnStart turn);
}
```

- [ ] **Step 4: Implement Start and Drive in `AgentExecutionNeuron`**

Add `IAgentTurnDriver` to the class's interface list, then:

```csharp
    public async Task<string> Start(AgentTurnStart turn)
    {
        ArgumentNullException.ThrowIfNull(turn);
        var scope = BrainScope.CurrentId();
        // The conversation, like every brain neuron key, starts with its brain scope.
        if (!turn.Conversation.StartsWith(scope + "/", StringComparison.Ordinal))
        { throw new UnauthorizedAccessException("The conversation belongs to another brain."); }
        if (turn.Message.Length is 0 or > 32000) { throw new ArgumentException("A message has 1-32000 characters.", nameof(turn)); }
        var runId = Guid.NewGuid().ToString("N");
        await GrainFactory.GetGrain<IAgent>(turn.Conversation).BeginConversation(new(runId, turn.Message));
        await this.AsReference<IAgentTurnDriver>().Drive(runId, turn);
        return runId;
    }

    public async Task Drive(string runId, AgentTurnStart turn)
    {
        var conversation = GrainFactory.GetGrain<IAgent>(turn.Conversation);
        var sequence = 0;
        var text = new System.Text.StringBuilder();
        Task Progress(string kind, string? content, string? tool = null, string? payload = null)
            => PublishAsync(new Signals.AgentTurnProgressed(runId, kind, content, tool, payload, ++sequence));
        try
        {
            var history = (await conversation.ReadConversation()).Turns.Where(item => item.RunId != runId).ToArray();
            var model = await ModelFor(turn.Model);
            var request = new AgentTurnRequest("assistant", runId, BrainScope.CurrentId(), history, turn.Message, model,
                Instructions: turn.SystemPrompt.Length == 0 ? null : turn.SystemPrompt, ToolNames: turn.Tools);
            await foreach (var item in Run(request, runId))
            {
                switch (item)
                {
                    case AgentTurnEvent.Text delta:
                        text.Append(delta.Content);
                        await Progress("text", delta.Content);
                        break;
                    case AgentTurnEvent.ToolStarted started:
                        await Progress("tool-call", null, started.Name, started.Arguments);
                        break;
                    case AgentTurnEvent.ToolCompleted completed:
                        await Progress("tool-result", null, completed.Name, completed.Result);
                        if (Card(completed.Result) is { } card) { await Progress("card", null, completed.Name, card); }
                        break;
                    case AgentTurnEvent.ToolFailed failed:
                        await Progress("tool-result", failed.Message, failed.Name,
                            System.Text.Json.JsonSerializer.Serialize(new { isError = true, code = failed.Code, message = failed.Message }));
                        break;
                    case AgentTurnEvent.Completed done when done.Usage is not null:
                        await Progress("receipt", null, null, System.Text.Json.JsonSerializer.Serialize(done.Usage));
                        break;
                    case AgentTurnEvent.Failed failure:
                        throw new InvalidOperationException(failure.Message);
                }
            }
            await conversation.CompleteConversation(new(runId, turn.Message, text.ToString(), []));
            await PublishAsync(new Signals.AgentTurnCompleted(runId));
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Agent turn {RunId} failed.", runId);
            try { await conversation.CompleteConversation(new(runId, turn.Message, "The turn failed: " + error.Message, [])); }
            catch (Exception) { /* The run is no longer active; nothing to keep. */ }
            await PublishAsync(new Signals.AgentTurnFailed(runId, error.Message));
        }
    }

    private async Task<AgentModelSelection?> ModelFor(string model)
        => model.Length == 0 ? null
        : model.StartsWith(DigitalBrain.AI.Scripted.IScriptedLLM.ModelPrefix, StringComparison.Ordinal) ? new(Model: model)
        : await SelectModel(model) ?? throw new ArgumentException($"Model '{model}' is not in the catalog.");

    // A tool result may carry a UI card on its "_ui" channel; the card is its own progress item.
    private static string? Card(string result)
    {
        try
        {
            using var payload = System.Text.Json.JsonDocument.Parse(result);
            return payload.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object
                && payload.RootElement.TryGetProperty("_ui", out var card) && card.ValueKind == System.Text.Json.JsonValueKind.Object
                ? card.GetRawText() : null;
        }
        catch (System.Text.Json.JsonException) { return null; }
    }
```

`Run(request, runId)` reuses the existing method, so metering flushes through `IIntentUsageSink`
exactly as for the SSE path (the run id is the intent id).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests --filter "FullyQualifiedName~AgentTurnStartFacts|FullyQualifiedName~AgentExecutionFacts"`
Expected: PASS (3 new, existing execution facts unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/Modules/AI
git commit -m "feat(ai): task-shaped agent turns publish progress, completion and failure signals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C2: The runner resolves `scripted/<key>` to the scripted model

**Files:**
- Create: `src/Modules/AI/DigitalBrain.Modules.AI/Inference/ScriptedChatClient.cs`
- Modify: `src/Modules/AI/DigitalBrain.Modules.AI/Agents/AgentTurnRunner.cs` (model resolution block, the `if (request.Model is not null || configured || request.Options is not null)` branch)
- Test: `src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/ScriptedTurnFacts.cs`

**Interfaces:**
- Consumes: `AgentTurnStart`, `IAgentExecution.Start`, turn signals (C1); `IScriptedLLM.Script`/`Prompts`.
- Produces: an `AgentTurnRequest` whose `Model.Model` starts with `scripted/` runs against
  `IScriptedLLM(<rest>)` with every requested tool offered, and no `IChatClient` or provider
  configuration is needed. A scripted reply `{"tool":"<name>","arguments":{...}}` is a tool call.

- [ ] **Step 1: Write the failing tests**

```csharp
using DigitalBrain;
using DigitalBrain.AI;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Agents.Signals;
using DigitalBrain.AI.Scripted;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Enforcement;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests;

public sealed class ScriptedTurnFacts
{
    [Fact]
    public async Task AScriptedProfilePlaysAToolCallThenAnswersWithoutAnyProvider()
    {
        var ct = TestContext.Current.CancellationToken;
        var echo = AIFunctionFactory.Create((string word) => "echo:" + word, "echo");
        await using var brain = await ModuleTest.Create().WithModule<AIModule>()
            .ConfigureSilo(silo => silo.Services.AddSingleton<IAgentToolFactory>(new FixedTools(echo))).StartAsync(ct);
        var model = brain.Get<IScriptedLLM>("turn-model");
        await model.Script(["""{"tool":"echo","arguments":{"word":"ping"}}""", "Done."]);

        var events = new List<AgentTurnEvent>();
        await foreach (var item in brain.Get<IAgentExecution>("scripted").Run(new("agent", "run", "scope", [], "go",
            new AgentModelSelection(Model: IScriptedLLM.ModelPrefix + "turn-model"), ToolNames: ["echo"]), "intent", ct))
        { events.Add(item); }

        Assert.Equal("echo", Assert.Single(events.OfType<AgentTurnEvent.ToolStarted>()).Name);
        Assert.Contains("echo:ping", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Result, StringComparison.Ordinal);
        Assert.Equal("Done.", Assert.Single(events.OfType<AgentTurnEvent.Text>()).Content);
        Assert.Single(events.OfType<AgentTurnEvent.Finished>());
        var prompts = await model.Prompts();
        Assert.Equal(2, prompts.Count);
        Assert.Contains("echo:ping", prompts[1], StringComparison.Ordinal);
    }

    [Fact]
    public async Task AScriptedModelThatRunsOutOfRepliesFailsTheTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        await brain.Get<IScriptedLLM>("empty-model").Script([]);

        var events = new List<AgentTurnEvent>();
        await foreach (var item in brain.Get<IAgentExecution>("scripted-empty").Run(new("agent", "run", "scope", [], "go",
            new AgentModelSelection(Model: IScriptedLLM.ModelPrefix + "empty-model")), "intent", ct))
        { events.Add(item); }

        Assert.Contains("ran out of replies", Assert.Single(events.OfType<AgentTurnEvent.Failed>()).Message, StringComparison.Ordinal);
    }

    private sealed class FixedTools(params AIFunction[] tools) : IAgentToolFactory
    {
        public IEnumerable<AIFunction> Create(Func<AgentToolContext> context) => tools;
    }
}
```

(Check `IAgentToolFactory.Create`'s exact signature in `src/Modules/AI/DigitalBrain.Modules.AI/Agents/`
and match it; the runner calls `f.Create(Context)` with `Func<AgentToolContext>`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests --filter "FullyQualifiedName~ScriptedTurnFacts"`
Expected: FAIL — `ModelProfiles.Resolve` throws "Model 'scripted/turn-model' is not a compiled preset".

- [ ] **Step 3: Add `ScriptedChatClient`**

```csharp
using DigitalBrain.AI.Scripted;
using Microsoft.Extensions.AI;

namespace DigitalBrain.AI;

// The agent loop speaks IChatClient; a scripted model speaks ILLM. This adapter lets the publish
// gate drive whole tool-calling turns through IScriptedLLM without a provider.
internal sealed class ScriptedChatClient(IScriptedLLM model) : IChatClient
{
    public async Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var result = await model.Generate(new InferenceRequest([.. messages.Select(InferenceMapping.FromChatMessage)]), cancellationToken);
        return new ChatResponse([.. result.Messages.Select(InferenceMapping.ToChatMessage)]) { FinishReason = ChatFinishReason.Stop, ModelId = result.Model };
    }

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        foreach (var update in (await GetResponseAsync(messages, options, cancellationToken)).ToChatResponseUpdates())
        { yield return update; }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;
    public void Dispose() { }
}
```

(`InferenceMapping.FromChatMessage`/`ToChatMessage` already map `AiToolCall` ⇄ `FunctionCallContent`
and `AiToolResult` ⇄ `FunctionResultContent`; if `ToContent` lacks the tool-call case, add it in
`InferenceMapping.cs` with a fact in the same file's existing facts.)

- [ ] **Step 4: Route scripted selections in `AgentTurnRunner.Execute`**

Immediately before `if (request.Model is not null || configured || request.Options is not null)`:

```csharp
            var scripted = request.Model?.Model is { } name && name.StartsWith(DigitalBrain.AI.Scripted.IScriptedLLM.ModelPrefix, StringComparison.Ordinal)
                ? name[DigitalBrain.AI.Scripted.IScriptedLLM.ModelPrefix.Length..] : null;
```

and turn the branch into `if (scripted is not null) { ... } else if (...) { existing } else { existing }` with:

```csharp
                client = new ScriptedChatClient(services.GetRequiredService<IGrainFactory>().GetGrain<DigitalBrain.AI.Scripted.IScriptedLLM>(scripted));
                options = new();
                owned = true;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests`
Expected: PASS (whole AI suite — the runner change must not alter provider paths).

- [ ] **Step 6: Commit**

```bash
git add src/Modules/AI
git commit -m "feat(ai): agent turns run against scripted models for deterministic publish gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C3: The `os/assistant` app

**Files:**
- Create: `src/DigitalBrain/OS/Apps/Assistant/app.json`
- Create: `src/DigitalBrain/OS/Apps/Assistant/icon.svg`
- Create: `src/DigitalBrain/OS/Apps/Assistant/app.spec.md`
- Create: `src/DigitalBrain/OS/Apps/Assistant/prompts/system.md` (moved content of `src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/instructions.md`; keep that file until Task C4)
- Create: `src/DigitalBrain/OS/Apps/Assistant/behaviors/surface.cs`
- Create: `src/DigitalBrain/OS/Apps/Assistant/behaviors/chat.cs`
- Create: `src/DigitalBrain/OS/Apps/Assistant/tests.cs`
- No change to `OsApps.cs`: B6 already lists `("os","assistant")` among the defaults; it installs once this app ships.
- Test: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/OsAssistantAppFacts.cs`
- Test: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/OsAssistantAppFacts.cs`

**Interfaces:**
- Consumes: C1 `IAgentExecution.Start`, signals; C2 scripted profiles; Part B `AppManifest.Icon`.
- Produces (app operations):
  - `open` — input `""` or `"docked"`; output JSON `{id,title,surface,docked}` as stated in the Part C header.
  - `send` — input: the message (1–32000 chars); output: the run id. The turn runs in the background.
  - `transcript` — input ignored; output JSON array `[{runId, user, assistant, steps:[{kind,tool,text}] , status}]`
    for the current conversation, oldest first; `status` ∈ `running`, `done`, `failed`.
  - `new` — starts a new conversation; output: the new conversation id.
- Settings: `Model` (default `""` = deployment default; `scripted/<key>` in tests).
- Neuron keys (all under the app key `K`): `K/surface`, `K/main`, `K/transcript` (ILayout column,
  `FollowEnd: true`), `K/draft` (ITextField, submit button `K/send`), `K/send`, `K/new` (IButton),
  `K/status` (IText), `K/conversation` (IText holding the current conversation id; not placed in
  any layout), `K/execution` (IAgentExecution), `K/conversations/<id>` (IAgent),
  `K/turn-<runId>-user`, `K/turn-<runId>-answer` (ICard; the answer's children are its step cards),
  `K/turn-<runId>-step-<sequence>` (ICard).

- [ ] **Step 1: Write the failing unit fact (bundle shape)**

```csharp
using DigitalBrain.Apps;

namespace DigitalBrain.OS.Tests.Unit;

public sealed class OsAssistantAppFacts
{
    [Fact]
    public void TheShippedAssistantDeclaresItsOperationsIconAndOneTestPerScenario()
    {
        var bundle = new EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()
            .Single(app => app.Name == "assistant");

        Assert.Equal(["open", "send", "transcript", "new"], bundle.Manifest.Operations.Select(operation => operation.Name));
        Assert.Equal("icon.svg", bundle.Manifest.Icon);
        Assert.Contains("icon.svg", bundle.Files.Keys);
        Assert.Contains("behaviors/surface.cs", bundle.Files.Keys);
        Assert.Contains("behaviors/chat.cs", bundle.Files.Keys);
        var scenarios = bundle.Spec.Split('\n').Where(line => line.StartsWith("## Scenario:", StringComparison.Ordinal))
            .Select(line => line["## Scenario:".Length..].Trim()).ToArray();
        Assert.Equal(5, scenarios.Length);
        Assert.All(scenarios, scenario => Assert.Contains($"Scenario(\"{scenario}\"", bundle.Files[AppFiles.TestsPath], StringComparison.Ordinal));
    }
}
```

(Match the `EmbeddedShippedAppSource` constructor to Part A's account-taking signature when Part A
has landed.)

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit --filter "FullyQualifiedName~OsAssistantAppFacts"`
Expected: FAIL — no bundle named `assistant`.

- [ ] **Step 3: Write `app.json`, `icon.svg`, `prompts/system.md`**

```json
{
  "name": "assistant",
  "title": "Assistant",
  "description": "Talk to your brain: ask questions, find capabilities and open what you need.",
  "version": "1.0.0",
  "icon": "icon.svg",
  "operations": [
    { "name": "open", "description": "Compose the assistant surface; input \"docked\" answers it for the side panel without opening a window." },
    { "name": "send", "description": "Send a message in the current conversation and answer the run id." },
    { "name": "transcript", "description": "Answer the current conversation as JSON." },
    { "name": "new", "description": "Start a new conversation and answer its id." }
  ],
  "settings": [
    { "name": "Model", "description": "Model catalog id; empty uses the deployment default.", "default": "" }
  ]
}
```

`icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01z"/></svg>
```

`prompts/system.md`: `git mv`-free copy — copy the full text of
`src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/instructions.md` verbatim.

- [ ] **Step 4: Write `app.spec.md`**

```markdown
# Assistant

The brain's conversational assistant. A message runs one agent turn through the brain's agent
runner with the assistant's system prompt and tools (capability discovery, neuron inventory,
forms and views). The transcript shows each message, the tools the turn used and the answer.
Conversations are durable; "new" starts another one. Opening docked answers the same surface for
the shell's side panel without opening a window.

## Scenario: Opening the assistant composes its surface

Invoking "open" answers a window titled "Assistant" whose surface holds the transcript, the draft
field and the send and new-conversation buttons.

## Scenario: Opening docked answers the surface without a window

Invoking "open" with "docked" answers id "assistant-docked", the same surface and docked true.

## Scenario: A message is answered in the transcript

After sending "hello", the transcript's only turn shows "hello" and the model's answer, and its
status is done.

## Scenario: The tools a turn uses appear in the transcript

When the model calls a tool before answering, the turn's steps show that tool's call and result
before the answer.

## Scenario: A failed turn says so and the next message still works

When the model fails, the turn's status is failed with the failure as its answer; a following
message is answered normally in the same conversation.
```

- [ ] **Step 5: Write `behaviors/surface.cs`**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Layout;
using DigitalBrain.Flutter.Surface;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Flutter.Workspace;

// The assistant's window. Composition is plain grain calls, safe to re-run; the transcript's
// children belong to chat.cs, so composing never touches them.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);

await foreach (var invoked in app.Invocations(brain, brain.Stopping))
{ if (invoked.Operation == "open") { await app.Respond(await OpenAsync(invoked.InvocationId, invoked.Input == "docked")); } }
return;

async Task<AppResponse> OpenAsync(Guid id, bool docked)
{
    await ComposeAsync();
    var surface = new UiChildRef(UIVocabulary.SurfaceType, appKey + "/surface");
    if (!docked)
    {
        var brainScope = appKey[..appKey.LastIndexOf("/apps/", StringComparison.Ordinal)];
        await brain.Get<IWorkspace>(brainScope)
            .EnsureOpenAsync("assistant", "Assistant", WindowReference.For(surface), CancellationToken.None);
    }
    return new AppResponse(id, JsonSerializer.Serialize(new
    {
        id = docked ? "assistant-docked" : "assistant", title = "Assistant", surface = surface.Name, docked,
    }), null);
}

async Task ComposeAsync()
{
    string Name(string part) => appKey + "/" + part;
    UiChildRef Ref(string kind, string part) => new(kind, Name(part));

    await brain.Get<ITextField>(Name("draft")).Configure("Message", "multiline", Name("send"));
    await brain.Get<IButton>(Name("send")).Set("Send", "send");
    await brain.Get<IButton>(Name("new")).Set("New conversation", "new");
    var input = brain.Get<ILayout>(Name("input"));
    await input.Set(new LayoutDefinition("row",
        [Ref(UIVocabulary.TextFieldType, "draft"), Ref(UIVocabulary.ButtonType, "send")], Extents: [0, 90]), (await input.Read()).Revision);
    var header = brain.Get<ILayout>(Name("header"));
    await header.Set(new LayoutDefinition("row",
        [Ref(UIVocabulary.TextType, "status"), Ref(UIVocabulary.ButtonType, "new")], Extents: [0, 160]), (await header.Read()).Revision);
    var main = brain.Get<ILayout>(Name("main"));
    await main.Set(new LayoutDefinition("column",
        [Ref(UIVocabulary.LayoutType, "header"), Ref(UIVocabulary.LayoutType, "transcript"), Ref(UIVocabulary.LayoutType, "input")],
        Extents: [40, 0, 96]), (await main.Read()).Revision);
    var surface = brain.Get<ISurface>(Name("surface"));
    await surface.Set(new SurfaceDefinition("Assistant", [Ref(UIVocabulary.LayoutType, "main")]), (await surface.Read()).Revision);
}
```

(If `ITextField.Configure` rejects `"multiline"`, use the kinds listed in
`src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter/TextField/` — `"text"` is always valid.)

- [ ] **Step 6: Write `behaviors/chat.cs`**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
#:project /brain/src/Modules/AI/DigitalBrain.Modules.AI.Contracts/DigitalBrain.Modules.AI.Contracts.csproj
using System.Text.Json;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Agents.Signals;
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Button.Signals;
using DigitalBrain.Flutter.Card;
using DigitalBrain.Flutter.Layout;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.TextField;

// The conversation. The IAgent conversation is the transcript's source of truth; every card is
// derived from it and from progress signals keyed by (run, sequence), so redelivery and a fresh
// run after reaping rewrite the same cards instead of duplicating them.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
string Name(string part) => appKey + "/" + part;
var execution = brain.Get<IAgentExecution>(Name("execution"));
string[] Tools = ["discover_capabilities", "select_capability", "list_neurons", "list_active_neurons", "show_form", "show_view"];

await Task.WhenAll(Operations(), SendClicks(), NewClicks(), Progress(), Completions(), Failures());
return;

async Task<string> ConversationId()
{
    var current = (await brain.Get<IText>(Name("conversation")).Read()).Markdown;
    if (current.Length > 0) { return current; }
    await brain.Get<IText>(Name("conversation")).Set("main");
    return "main";
}

async Task<IAgent> Conversation() => brain.Get<IAgent>(Name("conversations/" + await ConversationId()));

async Task<string> Send(string message)
{
    var snapshot = await app.Read();
    var runId = await execution.Start(new(Name("conversations/" + await ConversationId()),
        snapshot.Settings.GetValueOrDefault("Model", ""), snapshot.Files.GetValueOrDefault("prompts/system.md", ""), Tools, message));
    await brain.Get<ICard>(Name($"turn-{runId}-user")).Set("You", message);
    await brain.Get<ICard>(Name($"turn-{runId}-answer")).Set("Assistant", "…");
    await RenderAsync();
    return runId;
}

async Task Operations()
{
    await foreach (var invoked in app.Invocations(brain, brain.Stopping))
    {
        switch (invoked.Operation)
        {
            case "send" when invoked.Input.Length is >= 1 and <= 32000:
                // A second message while a turn is running is refused by the conversation.
                try { await app.Respond(new AppResponse(invoked.InvocationId, await Send(invoked.Input), null)); }
                catch (Exception error) { await app.Respond(new AppResponse(invoked.InvocationId, null, error.Message)); }
                break;
            case "send":
                await app.Respond(new AppResponse(invoked.InvocationId, null, "A message has 1-32000 characters."));
                break;
            case "transcript":
                await app.Respond(new AppResponse(invoked.InvocationId, await TranscriptJson(), null));
                break;
            case "new":
                var id = "c-" + Guid.NewGuid().ToString("N")[..12];
                await brain.Get<IText>(Name("conversation")).Set(id);
                await RenderAsync();
                await app.Respond(new AppResponse(invoked.InvocationId, id, null));
                break;
        }
    }
}

async Task SendClicks()
{
    await foreach (var _ in brain.On<ButtonClicked>(brain.Get<IButton>(Name("send")), brain.Stopping))
    {
        var draft = brain.Get<ITextField>(Name("draft"));
        var message = (await draft.Read()).Value.Trim();
        if (message.Length is < 1 or > 32000) { continue; }
        await draft.SetValue("");
        await Send(message);
    }
}

async Task NewClicks()
{
    await foreach (var _ in brain.On<ButtonClicked>(brain.Get<IButton>(Name("new")), brain.Stopping))
    { await app.Invoke(new(Guid.NewGuid(), "new", "")); }
}

async Task Progress()
{
    await foreach (var step in brain.On<AgentTurnProgressed>(execution, brain.Stopping))
    {
        var stepKey = Name($"turn-{step.RunId}-step-{step.Sequence}");
        var (title, body) = step.Kind switch
        {
            "text" => ("Answer", step.Text ?? ""),
            "tool-call" => ("Tool: " + step.Tool, step.Payload ?? ""),
            "tool-result" => ("Result: " + step.Tool, step.Text ?? step.Payload ?? ""),
            "card" => ("Card: " + step.Tool, step.Payload ?? ""),
            _ => ("Usage", step.Payload ?? ""),
        };
        await brain.Get<ICard>(stepKey).Set(title, body);
        var answer = brain.Get<ICard>(Name($"turn-{step.RunId}-answer"));
        var current = await answer.Read();
        if (step.Kind != "text" && current.Children.All(child => child.Name != stepKey))
        { await answer.Set(current.Title, current.Body, [.. current.Children, new UiChildRef(UIVocabulary.CardType, stepKey)]); }
        await brain.Get<IText>(Name("status")).Set("Working…");
    }
}

async Task Completions()
{
    await foreach (var done in brain.On<AgentTurnCompleted>(execution, brain.Stopping))
    { await SettleAsync(done.RunId); }
}

async Task Failures()
{
    await foreach (var failed in brain.On<AgentTurnFailed>(execution, brain.Stopping))
    { await SettleAsync(failed.RunId); }
}

// The finished turn's answer is whatever the conversation kept: the reply or the failure text.
async Task SettleAsync(string runId)
{
    var turn = (await (await Conversation()).ReadConversation()).Turns.FirstOrDefault(item => item.RunId == runId);
    if (turn is null) { return; }
    var answer = brain.Get<ICard>(Name($"turn-{runId}-answer"));
    await answer.Set("Assistant", turn.AssistantText, (await answer.Read()).Children);
    await brain.Get<IText>(Name("status")).Set("");
    await RenderAsync();
}

// The transcript layout is re-derived wholesale from the conversation, never patched.
async Task RenderAsync()
{
    var state = await (await Conversation()).ReadConversation();
    var runs = state.Turns.Select(turn => turn.RunId).ToList();
    if (state.ActiveRunId is { } active && !runs.Contains(active)) { runs.Add(active); }
    var transcript = brain.Get<ILayout>(Name("transcript"));
    await transcript.Set(new LayoutDefinition("column",
        [.. runs.SelectMany(run => new[]
        {
            new UiChildRef(UIVocabulary.CardType, Name($"turn-{run}-user")),
            new UiChildRef(UIVocabulary.CardType, Name($"turn-{run}-answer")),
        })], FollowEnd: true), (await transcript.Read()).Revision);
}

async Task<string> TranscriptJson()
{
    var state = await (await Conversation()).ReadConversation();
    var runs = state.Turns.Select(turn => (turn.RunId, turn.UserText, (string?)turn.AssistantText)).ToList();
    if (state.ActiveRunId is { } active && runs.All(run => run.RunId != active))
    { runs.Add((active, (await brain.Get<ICard>(Name($"turn-{active}-user")).Read()).Body, null)); }
    var items = new List<object>();
    foreach (var (runId, user, assistant) in runs)
    {
        var steps = new List<object>();
        foreach (var child in (await brain.Get<ICard>(Name($"turn-{runId}-answer")).Read()).Children)
        {
            var card = await brain.Get<ICard>(child.Name).Read();
            var kind = card.Title.StartsWith("Tool: ", StringComparison.Ordinal) ? "tool-call"
                : card.Title.StartsWith("Result: ", StringComparison.Ordinal) ? "tool-result"
                : card.Title.StartsWith("Card: ", StringComparison.Ordinal) ? "card" : "receipt";
            steps.Add(new { kind, tool = card.Title.Contains(": ", StringComparison.Ordinal) ? card.Title[(card.Title.IndexOf(": ", StringComparison.Ordinal) + 2)..] : null, text = card.Body });
        }
        var status = assistant is null ? "running" : assistant.StartsWith("The turn failed:", StringComparison.Ordinal) ? "failed" : "done";
        items.Add(new { runId, user, assistant = assistant ?? "", steps, status });
    }
    return JsonSerializer.Serialize(items);
}
```

- [ ] **Step 7: Write `tests.cs`**

```csharp
#:project /brain/src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/DigitalBrain.Modules.Apps.Contracts.csproj
#:project /brain/src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/DigitalBrain.Modules.Flutter.Contracts.csproj
#:project /brain/src/Modules/AI/DigitalBrain.Modules.AI.Contracts/DigitalBrain.Modules.AI.Contracts.csproj
using System.Text.Json;
using DigitalBrain.AI.Scripted;
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Surface;

// Scripted models play the provider; each scenario starts its own conversation so turns never mix.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var failures = 0;
var round = 0;

async Task<IScriptedLLM> Scripted(params string[] replies)
{
    var key = appKey + "/scenario-" + ++round + "/model";
    await app.Configure(new Dictionary<string, string> { ["Model"] = IScriptedLLM.ModelPrefix + key }, new Dictionary<string, string>());
    var model = brain.Get<IScriptedLLM>(key);
    await model.Script(replies);
    await app.Ask("new", "");
    return model;
}

async Task<JsonElement> SettledTranscript(int turns)
{
    var deadline = DateTimeOffset.UtcNow.AddMinutes(2);
    while (true)
    {
        var transcript = JsonDocument.Parse(await app.Ask("transcript", "")).RootElement;
        if (transcript.GetArrayLength() == turns && transcript.EnumerateArray().All(turn => turn.GetProperty("status").GetString() != "running"))
        { return transcript; }
        if (DateTimeOffset.UtcNow > deadline) { throw new TimeoutException("The turn did not settle: " + transcript.GetRawText()); }
        await Task.Delay(200);
    }
}

await Scenario("Opening the assistant composes its surface", async () =>
{
    var window = JsonDocument.Parse(await app.Ask("open", "")).RootElement;
    if (window.GetProperty("title").GetString() != "Assistant" || window.GetProperty("docked").GetBoolean())
    { throw new InvalidOperationException("The window contract is wrong: " + window.GetRawText()); }
    var surface = await brain.Get<ISurface>(window.GetProperty("surface").GetString()!).Read();
    if (surface.Definition.Title != "Assistant" || surface.Definition.Children.Length == 0)
    { throw new InvalidOperationException("The assistant surface is not composed."); }
});

await Scenario("Opening docked answers the surface without a window", async () =>
{
    var docked = JsonDocument.Parse(await app.Ask("open", "docked")).RootElement;
    var windowed = JsonDocument.Parse(await app.Ask("open", "")).RootElement;
    if (docked.GetProperty("id").GetString() != "assistant-docked" || !docked.GetProperty("docked").GetBoolean()
        || docked.GetProperty("surface").GetString() != windowed.GetProperty("surface").GetString())
    { throw new InvalidOperationException("Docked open answered " + docked.GetRawText()); }
});

await Scenario("A message is answered in the transcript", async () =>
{
    await Scripted("Hi! How can I help?");
    await app.Ask("send", "hello");
    var turn = (await SettledTranscript(1))[0];
    if (turn.GetProperty("user").GetString() != "hello" || turn.GetProperty("assistant").GetString() != "Hi! How can I help?"
        || turn.GetProperty("status").GetString() != "done")
    { throw new InvalidOperationException("The turn was " + turn.GetRawText()); }
});

await Scenario("The tools a turn uses appear in the transcript", async () =>
{
    await Scripted("""{"tool":"list_neurons","arguments":{}}""", "You have some neurons.");
    await app.Ask("send", "what do I have?");
    var turn = (await SettledTranscript(1))[0];
    var kinds = turn.GetProperty("steps").EnumerateArray().Select(step => step.GetProperty("kind").GetString()).ToArray();
    if (!kinds.Contains("tool-call") || !kinds.Contains("tool-result")
        || turn.GetProperty("steps").EnumerateArray().First().GetProperty("tool").GetString() != "list_neurons")
    { throw new InvalidOperationException("The steps were " + turn.GetProperty("steps").GetRawText()); }
    if (turn.GetProperty("assistant").GetString() != "You have some neurons.") { throw new InvalidOperationException("No answer after the tool."); }
});

await Scenario("A failed turn says so and the next message still works", async () =>
{
    var model = await Scripted();
    await app.Ask("send", "first");
    var failed = (await SettledTranscript(1))[0];
    if (failed.GetProperty("status").GetString() != "failed") { throw new InvalidOperationException("The turn was " + failed.GetRawText()); }
    await model.Script(["Second answer."]);
    await app.Ask("send", "second");
    var second = (await SettledTranscript(2))[1];
    if (second.GetProperty("assistant").GetString() != "Second answer.") { throw new InvalidOperationException("The follow-up was " + second.GetRawText()); }
});

return failures == 0 ? 0 : 1;

async Task Scenario(string name, Func<Task> run)
{
    try
    {
        await run();
        Console.WriteLine($"dbtest:pass {name}");
    }
    catch (Exception error)
    {
        failures++;
        Console.WriteLine($"dbtest:fail {name}\t{error.Message.ReplaceLineEndings(" ")}");
    }
}
```

`IScriptedLLM.Script` replaces the reply list and resets `Answered` (see `ScriptedLlmNeuron.Script`),
so re-scripting the same model for the follow-up is deterministic.

- [ ] **Step 8: Run the unit fact** (B6 already lists `("os","assistant")` as a default — no `OsApps.cs` change)

Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit --filter "FullyQualifiedName~OsAssistantAppFacts"`
Expected: PASS.

- [ ] **Step 9: Write the E2E fact that the shipped assistant verifies green and answers**

`src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/OsAssistantAppFacts.cs` — follow the fixture
used by the existing facts in that project (read `AssistantNeuronUiFacts.cs` for the host fixture
and the stamped-caller helper before writing):

```csharp
namespace DigitalBrain.OS.Tests.E2E;

public sealed class OsAssistantAppFacts(OsHostFixture host) : IClassFixture<OsHostFixture>
{
    [Fact]
    public async Task TheShippedAssistantIsVerifiedGreenAndInstalledInANewBrain()
    {
        var ct = TestContext.Current.CancellationToken;
        var brainId = await host.CreateBrainAsync(ct);

        var app = await host.WaitForAppAsync(brainId, "assistant", ct);

        Assert.Equal("Assistant", app.GetProperty("title").GetString());
        Assert.Equal("Live", app.GetProperty("status").GetString());
        var window = await host.AskAsync(brainId, "assistant", "open", "docked", ct);
        Assert.Equal("assistant-docked", window.GetProperty("id").GetString());
    }
}
```

`OsHostFixture`, `CreateBrainAsync`, `WaitForAppAsync`, `AskAsync` are the names to use if the E2E
project's fixture already offers equivalents under other names — rename the calls to match it;
if it offers none, add these three helpers to the fixture (HTTP: `POST /identity/brains`,
poll `GET /brains/{id}/apps/assistant` until 200 with status `Live` for up to 3 minutes,
`POST /brains/{id}/apps/assistant/ask`).

Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E --filter "FullyQualifiedName~OsAssistantAppFacts"`
Expected: PASS (requires the C# sandbox the E2E host composes).

- [ ] **Step 10: Commit**

```bash
git add src/DigitalBrain/OS
git commit -m "feat(os): ship the Assistant as the os/assistant app, installed by default

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task C4: Retire the built-in Assistant window

**Delete vs keep (exact):**

| File / member | Fate |
|---|---|
| `Assistant/AssistantEndpoints.cs` (`/applications/assistant/start`, `/open`, `/built-in/activate`, `/built-in/assistant/open`) | delete |
| `Assistant/AssistantPresentation.cs` | delete |
| `Assistant/AssistantUi.cs` | delete |
| `AssistantNeuron.cs`: `Activate`, `OpenWindow`, `SetDraft`, `Act`, `Answer`, `Hear`, `HandleUiEvent`, `Draft`, every `AssistantSurface.*Part` use | delete |
| `IAssistant`: `Activate`, `OpenWindow`, `SetDraft`, `Act`, `Answer`, `Hear`, `: IUiEventHandler` | delete |
| `AssistantWindow` record | delete |
| `Contracts/AssistantSurface.cs` | delete except `Key(string workspace)`, which moves to `Contracts/AssistantConversations.cs` as `AssistantConversations.AssistantKey(string workspace)` |
| `AssistantState` record (persisted) | keep unchanged — fields stay for stored state; nothing new writes `Threads`/`Draft` |
| `IAssistant.Run`, `ReadConversation`, `Models`, `Transcribe`, `Configure`, `Conversation`, `DefineTurn`, `Read` | keep (serve `/agent`, `/conversations/{id}`, `/voice`, `/ai/models`) |
| `AssistantTurnExecution`, `AgentReceipts`, `AgentEndpoints`, `ComputeUsageEndpoints`, `AssistantTranscription`, `AssistantUsage`, `IntentActivity`, discovery/inventory/form tools, `CapabilityDiscoveryNeuron`, `instructions.md` | keep |
| Tests `AssistantUiProbe.cs`, `AssistantFeatureFacts.cs`, `AssistantReactivationFacts.cs` (window/UI facts), `AssistantRouteFacts.cs` (open/start routes), `OS.Tests.E2E/AssistantNeuronUiFacts.cs` | delete the facts that call deleted members; keep facts in those files that only use kept members |

**Files:**
- Delete: `src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantEndpoints.cs`, `AssistantPresentation.cs`, `AssistantUi.cs`, `src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/AssistantUiProbe.cs`, `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/AssistantNeuronUiFacts.cs`
- Modify: `AssistantNeuron.cs`, `AssistantModule.cs` (drop `AssistantEndpoints.Map`), `AgentEndpoints.cs` (use `AssistantConversations.AssistantKey`), `Contracts/AssistantContracts.cs`, `Contracts/AssistantSurface.cs` → delete, `Contracts/AssistantConversations.cs`
- Modify tests: `AssistantFeatureFacts.cs`, `AssistantReactivationFacts.cs`, `AssistantRouteFacts.cs`, `AssistantStreamFacts.cs` (only references to deleted members)
- Test: `src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/AssistantRouteFacts.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AssistantConversations.AssistantKey(string workspace) => workspace + "/applications/assistant"`
  (same value as the old `AssistantSurface.Key`, so stored conversations and receipts keep their keys).

- [ ] **Step 1: Write the failing route fact**

Add to `AssistantRouteFacts.cs` (use the file's existing host fixture and client helper):

```csharp
    [Theory]
    [InlineData("/applications/assistant/start")]
    [InlineData("/applications/assistant/open")]
    [InlineData("/built-in/activate")]
    [InlineData("/built-in/assistant/open")]
    public async Task TheBuiltInAssistantWindowRoutesAreGone(string route)
    {
        var ct = TestContext.Current.CancellationToken;
        var response = await Client.PostAsync(BrainPath(route), JsonContent.Create(new { }), ct);
        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }
```

(`Client`/`BrainPath` — use the names the file already uses for its HTTP client and
`/brains/{id}` prefix helper.)

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests --filter "FullyQualifiedName~TheBuiltInAssistantWindowRoutesAreGone"`
Expected: FAIL — routes answer 200.

- [ ] **Step 3: Delete and trim per the table**

```bash
git rm src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantEndpoints.cs \
       src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantPresentation.cs \
       src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/AssistantUi.cs \
       src/Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant.Contracts/AssistantSurface.cs \
       src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests/AssistantUiProbe.cs \
       src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/AssistantNeuronUiFacts.cs
```

`AssistantConversations.cs` gains:

```csharp
    // The assistant neuron behind /agent and /conversations keeps the key the old window used,
    // so stored conversations and usage receipts stay addressable.
    public static string AssistantKey(string workspace) => workspace + "/applications/assistant";
```

`IAssistant` becomes:

```csharp
[Alias("apps.assistant"), Orleans.Metadata.DefaultGrainType("apps.assistant")]
public interface IAssistant : INeuron
{
    [ReadOnly] Task<AssistantState> Read();
    Task<AssistantTranscriptionResult> Transcribe(string? base64, CancellationToken ct = default);
    [AlwaysInterleave, ResponseTimeout("00:10:00")] IAsyncEnumerable<string> Run(AssistantRun request, CancellationToken ct = default);
    Task<AgentConversationState> ReadConversation(string threadId, CancellationToken ct = default);
    Task<ModelCatalog> Models();
    Task Configure(AgentDefinition definition);
    Task<IAgent> Conversation(string threadId);
    Task<AgentDefinition> DefineTurn(string? summary);
}
```

In `AssistantNeuron.cs` remove the deleted members and the `using` lines for Flutter controls that
no longer compile; remove the `partial` modifier once `AssistantPresentation.cs` is gone. In
`AssistantModule.Configure(IEndpointRouteBuilder)` remove `AssistantEndpoints.Map(endpoints);`.
Replace `AssistantSurface.Key(` with `AssistantConversations.AssistantKey(` in `AgentEndpoints.cs`
and remaining tests. Build to find every other reference:

Run: `dotnet build src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests`
Expected: errors only in test facts that exercise deleted members — delete those facts (keep the
rest of each file), then rebuild until clean.

- [ ] **Step 4: Run the Assistant suite and the OS suites**

Run: `dotnet test src/Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests`
Expected: PASS, including `TheBuiltInAssistantWindowRoutesAreGone`.
Run: `dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit`
Expected: PASS.
Run: `dotnet build src/IntoChat` (or the IntoChat E2E test project) to catch remaining references
to `AssistantSurface` / `/applications/assistant` in C#. The Flutter references are Part D's.

- [ ] **Step 5: Commit**

```bash
git add -A src/Modules/DigitalBrain/Assistant src/DigitalBrain/OS
git commit -m "refactor(assistant)!: retire the built-in assistant window; os/assistant replaces it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Part C notes for the plan's Review Focus

- A script restart mid-turn: progress is re-delivered from the watermark; step cards are keyed by
  `(runId, sequence)` and the answer is re-derived from the conversation, so nothing duplicates.
- Two sends in quick succession in one conversation: `BeginConversation` refuses a second active
  run on the same IAgent (existing rule — verify in `AgentNeuron.BeginConversation`; if it does not
  refuse, add the refusal there with a fact) — `send` answers the refusal as the invocation error
  (handled in `chat.cs` `Operations()`).
- Compute receipts: the old window rendered priced receipts (`AgentReceipts` + `IPriceBook`); the
  `receipt` step now carries token usage only. Priced receipts in the app are a follow-up.


## Part D — Shell home, Marketplace UI, docked app, seeded sign-in, cleanup

All Flutter commands run from `src/Modules/Google/Flutter/app/shell` unless stated. Shared wire shapes
are the ones fixed in this plan's Interfaces section; Dart models mirror them exactly.

---

### Task D1: Core models and client calls for apps, Marketplace, docking and seeded accounts

**Files:**
- Modify: `src/Modules/Google/Flutter/app/core/lib/src/models/installed_app.dart`
- Create: `src/Modules/Google/Flutter/app/core/lib/src/models/marketplace.dart`
- Modify: `src/Modules/Google/Flutter/app/core/lib/digitalbrain_flutter.dart` (export)
- Modify: `src/Modules/Google/Flutter/app/core/lib/src/ui_client.dart:166` (comment) and add methods
- Test: `src/Modules/Google/Flutter/app/shell/test/core/marketplace_models_test.dart`

**Interfaces:**
- Consumes: wire shapes `GET /brains/{id}/apps`, `GET /brains/{id}/marketplace`, `GET /identity/seeded-accounts`,
  `POST /identity/seeded-accounts/{username}/login`, `POST /brains/{id}/apps/{name}/ask {operation:"open", input:"docked"}`.
- Produces:
  - `InstalledAppSummary` gains `String? icon`, `String? publishedVersion`, `AppOrigin? origin`, `bool edited`, `bool updateAvailable`.
  - `class AppOrigin { String publisher, name, version; factory AppOrigin.fromJson(Map<String, dynamic>) }`
  - `class MarketplaceListing { String publisher, publisherAccountId, publisherBrainId, name, title, description, version; String? icon; List<String> scenarios; factory fromJson }`
  - `class MarketplaceEntry { MarketplaceListing listing; bool installed, updateAvailable; factory fromJson }`
  - `class SeededAccount { String username, displayName; factory fromJson }`
  - `DigitalBrainUiClient.readBytes(String path) → Future<Uint8List?>` (null on 404)
  - `DigitalBrainUiClient.openDockedApp(String brainId, String appId) → Future<Map<String, dynamic>>` (the surface ref `{kind, name}`)
  - `DigitalBrainUiClient.listSeededAccounts() → Future<List<SeededAccount>>` (empty on 404)
  - `DigitalBrainUiClient.signInSeeded(String username) → Future<void>` (adopts the session like `signIn`)

- [ ] **Step 1: Write the failing test**

`shell/test/core/marketplace_models_test.dart`:

```dart
import 'dart:convert';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('an installed copy carries its origin and update offer', () {
    final app = InstalledAppSummary.fromJson({
      'name': 'customer-researcher',
      'title': 'Customer Researcher',
      'description': 'Research companies',
      'status': 'Live',
      'version': '1.2.0',
      'operations': ['open'],
      'icon': 'icon.svg',
      'publishedVersion': null,
      'origin': {
        'publisher': 'intochat',
        'name': 'customer-researcher',
        'version': '1.2.0',
      },
      'edited': false,
      'updateAvailable': true,
    });
    expect(app.icon, 'icon.svg');
    expect(app.origin!.publisher, 'intochat');
    expect(app.origin!.version, '1.2.0');
    expect(app.edited, isFalse);
    expect(app.updateAvailable, isTrue);
  });

  test('an app of the brain\'s own has no origin and no update offer', () {
    final app = InstalledAppSummary.fromJson({
      'name': 'shouter',
      'status': 'Live',
      'version': '0.2.0',
      'operations': <String>[],
    });
    expect(app.origin, isNull);
    expect(app.icon, isNull);
    expect(app.edited, isFalse);
    expect(app.updateAvailable, isFalse);
  });

  test('a marketplace entry reads its listing and install state', () {
    final entry = MarketplaceEntry.fromJson({
      'listing': {
        'publisher': 'intochat',
        'publisherAccountId': 'acc-1',
        'publisherBrainId': 'account-acc-1',
        'name': 'customer-researcher',
        'title': 'Customer Researcher',
        'description': 'Research companies',
        'version': '1.3.0',
        'icon': 'icon.svg',
        'scenarios': ['Opening the researcher composes its surface'],
      },
      'installed': true,
      'updateAvailable': true,
    });
    expect(entry.listing.title, 'Customer Researcher');
    expect(entry.listing.scenarios, [
      'Opening the researcher composes its surface',
    ]);
    expect(entry.installed, isTrue);
    expect(entry.updateAvailable, isTrue);
    expect(() => entry.listing.scenarios.add('x'), throwsUnsupportedError);
  });

  test('seeded accounts are empty when the server is not in open posture', () async {
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async => http.Response('', 404)),
    );
    expect(await client.listSeededAccounts(), isEmpty);
    client.close();
  });

  test('continuing as a seeded account adopts its session', () async {
    final paths = <String>[];
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async {
        paths.add('${request.method} ${request.url.path}');
        if (request.url.path == '/identity/seeded-accounts') {
          return http.Response(
            jsonEncode([
              {'username': 'intochat', 'displayName': 'IntoChat'},
            ]),
            200,
          );
        }
        return http.Response(
          jsonEncode({
            'principalId': 'intochat',
            'accountId': 'acc-1',
            'brainId': 'account-acc-1',
          }),
          200,
        );
      }),
    );
    final accounts = await client.listSeededAccounts();
    expect(accounts.single.displayName, 'IntoChat');
    await client.signInSeeded('intochat');
    expect(paths.last, 'POST /identity/seeded-accounts/intochat/login');
    expect(client.workspaceIdentity, 'intochat|acc-1');
    expect(client.defaultBrainId, 'account-acc-1');
    client.close();
  });

  test('a docked open asks the app for its surface reference', () async {
    Object? sent;
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async {
        sent = jsonDecode(request.body);
        expect(request.url.path, '/brains/b1/apps/assistant/ask');
        return http.Response(
          jsonEncode({
            'id': 'b1/apps/assistant/window',
            'title': 'Assistant',
            'surface': 'b1/apps/assistant/surface',
          }),
          200,
        );
      }),
    );
    final surface = await client.openDockedApp('b1', 'assistant');
    expect(sent, {'operation': 'open', 'input': 'docked'});
    expect(surface, {'kind': 'surface', 'name': 'b1/apps/assistant/surface'});
    client.close();
  });

  test('a missing icon reads as null', () async {
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async => http.Response('', 404)),
    );
    expect(await client.readBytes('/brains/b1/apps/x/icon'), isNull);
    client.close();
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/core/marketplace_models_test.dart`
Expected: FAIL — compile errors (`MarketplaceEntry`, `listSeededAccounts`, `icon` are not defined).

- [ ] **Step 3: Implement**

Replace `core/lib/src/models/installed_app.dart`:

```dart
import 'marketplace.dart';

class InstalledAppSummary {
  const InstalledAppSummary({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.version,
    required this.operations,
    this.icon,
    this.publishedVersion,
    this.origin,
    this.edited = false,
    this.updateAvailable = false,
  });
  final String id, title, description, status, version;
  final List<String> operations;
  final String? icon, publishedVersion;
  final AppOrigin? origin;
  final bool edited, updateAvailable;
  factory InstalledAppSummary.fromJson(Map<String, dynamic> json) =>
      InstalledAppSummary(
        id: json['name'] as String,
        title: json['title'] as String? ?? json['name'] as String,
        description: json['description'] as String? ?? '',
        status: json['status'] as String? ?? '',
        version: json['version'] as String? ?? '',
        operations: [
          for (final operation in json['operations'] as List? ?? const [])
            operation as String,
        ],
        icon: json['icon'] as String?,
        publishedVersion: json['publishedVersion'] as String?,
        origin: json['origin'] is Map
            ? AppOrigin.fromJson(
                Map<String, dynamic>.from(json['origin'] as Map),
              )
            : null,
        edited: json['edited'] == true,
        updateAvailable: json['updateAvailable'] == true,
      );
}
```

Create `core/lib/src/models/marketplace.dart`:

```dart
// Mirrors the Apps module's Marketplace records; the listing is what a publisher released.
class AppOrigin {
  const AppOrigin({
    required this.publisher,
    required this.name,
    required this.version,
  });
  final String publisher, name, version;
  factory AppOrigin.fromJson(Map<String, dynamic> json) => AppOrigin(
    publisher: json['publisher'] as String? ?? '',
    name: json['name'] as String? ?? '',
    version: json['version'] as String? ?? '',
  );
}

class MarketplaceListing {
  const MarketplaceListing({
    required this.publisher,
    required this.publisherAccountId,
    required this.publisherBrainId,
    required this.name,
    required this.title,
    required this.description,
    required this.version,
    required this.icon,
    required this.scenarios,
  });
  final String publisher, publisherAccountId, publisherBrainId;
  final String name, title, description, version;
  final String? icon;
  final List<String> scenarios;
  factory MarketplaceListing.fromJson(Map<String, dynamic> json) =>
      MarketplaceListing(
        publisher: json['publisher'] as String? ?? '',
        publisherAccountId: json['publisherAccountId'] as String? ?? '',
        publisherBrainId: json['publisherBrainId'] as String? ?? '',
        name: json['name'] as String,
        title: json['title'] as String? ?? json['name'] as String,
        description: json['description'] as String? ?? '',
        version: json['version'] as String? ?? '',
        icon: json['icon'] as String?,
        scenarios: List.unmodifiable([
          for (final scenario in json['scenarios'] as List? ?? const [])
            scenario as String,
        ]),
      );
}

class MarketplaceEntry {
  const MarketplaceEntry({
    required this.listing,
    required this.installed,
    required this.updateAvailable,
  });
  final MarketplaceListing listing;
  final bool installed, updateAvailable;
  factory MarketplaceEntry.fromJson(Map<String, dynamic> json) =>
      MarketplaceEntry(
        listing: MarketplaceListing.fromJson(
          Map<String, dynamic>.from(json['listing'] as Map),
        ),
        installed: json['installed'] == true,
        updateAvailable: json['updateAvailable'] == true,
      );
}

class SeededAccount {
  const SeededAccount({required this.username, required this.displayName});
  final String username, displayName;
  factory SeededAccount.fromJson(Map<String, dynamic> json) => SeededAccount(
    username: json['username'] as String,
    displayName: json['displayName'] as String? ?? json['username'] as String,
  );
}
```

In `core/lib/digitalbrain_flutter.dart` add after the `installed_app.dart` export:

```dart
export 'src/models/marketplace.dart';
```

In `core/lib/src/ui_client.dart`, add `import 'models/marketplace.dart';` beside the other model imports,
replace the comment at line 166 with
`/// This brain's apps, with where each installed copy came from and whether an update is offered.`,
and add after `signIn`:

```dart
  /// Accounts the deployment seeded for development; empty unless the server runs in open posture.
  Future<List<SeededAccount>> listSeededAccounts() async {
    try {
      final response = await _request(
        'GET',
        '/identity/seeded-accounts',
        timeout: const Duration(seconds: 10),
      );
      return [
        for (final item in jsonDecode(response.body) as List)
          SeededAccount.fromJson(Map<String, dynamic>.from(item as Map)),
      ];
    } on UiRequestException catch (error) {
      if (error.statusCode == 404) return const [];
      rethrow;
    }
  }

  Future<void> signInSeeded(String username) async {
    final response = await _request(
      'POST',
      '/identity/seeded-accounts/${Uri.encodeComponent(username)}/login',
      body: const {},
      timeout: const Duration(seconds: 15),
    );
    _useSession(jsonDecode(response.body) as Map<String, dynamic>);
  }
```

and after `openApp`:

```dart
  /// Asks an app to open in the side panel; answers the surface it declared.
  Future<Map<String, dynamic>> openDockedApp(
    String brainId,
    String appId,
  ) async {
    final result = Map<String, dynamic>.from(
      await jsonRequest('POST', appOpenPath(brainId, appId), {
            'operation': 'open',
            'input': 'docked',
          })
          as Map,
    );
    final surface = result['surface'];
    return surface is String
        ? {'kind': 'surface', 'name': surface}
        : Map<String, dynamic>.from(surface as Map);
  }

  /// Raw bytes of a served file such as an app icon; null when the server has none.
  Future<Uint8List?> readBytes(String path) async {
    try {
      final response = await _request(
        'GET',
        path,
        timeout: const Duration(seconds: 30),
      );
      return response.bodyBytes;
    } on UiRequestException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/core/marketplace_models_test.dart`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/core/lib src/Modules/Google/Flutter/app/shell/test/core/marketplace_models_test.dart
git commit -m "feat(shell): core models and calls for Marketplace, docking and seeded accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D2: App icon widget

**Files:**
- Modify: `src/Modules/Google/Flutter/app/shell/pubspec.yaml` (add `flutter_svg: ^2.3.0` under `dependencies`, same constraint as `../ui`)
- Create: `src/Modules/Google/Flutter/app/shell/lib/workspace/home/app_icon.dart`
- Test: `src/Modules/Google/Flutter/app/shell/test/app_icon_test.dart`

**Interfaces:**
- Produces: `typedef IconLoader = Future<Uint8List?> Function(String path);`
  `class AppIcon extends StatefulWidget { AppIcon({Key? key, required String title, String? path, IconLoader? load, double size = 48}) }`
  — `path` is the server path of the icon endpoint; without `path`/`load`, or when loading fails, it shows the title's initial (key `app-icon-fallback`).

- [ ] **Step 1: Write the failing test**

```dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:digitalbrain_flutter_shell/workspace/home/app_icon.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  testWidgets('an app without an icon shows its initial', (tester) async {
    await tester.pumpWidget(host(const AppIcon(title: 'customer researcher')));
    expect(find.byKey(const ValueKey('app-icon-fallback')), findsOneWidget);
    expect(find.text('C'), findsOneWidget);
  });

  testWidgets('an svg icon renders as a picture', (tester) async {
    final loads = <String>[];
    await tester.pumpWidget(
      host(
        AppIcon(
          title: 'Researcher',
          path: '/brains/b1/apps/researcher/icon',
          load: (path) async {
            loads.add(path);
            return Uint8List.fromList(
              utf8.encode(
                '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>',
              ),
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(loads, ['/brains/b1/apps/researcher/icon']);
    expect(find.byType(SvgPicture), findsOneWidget);
    expect(find.byKey(const ValueKey('app-icon-fallback')), findsNothing);
  });

  testWidgets('a failed load falls back to the initial', (tester) async {
    await tester.pumpWidget(
      host(
        AppIcon(
          title: 'Word count',
          path: '/x',
          load: (_) async => throw StateError('offline'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('app-icon-fallback')), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter pub get && flutter test test/app_icon_test.dart`
Expected: FAIL — `app_icon.dart` does not exist (and `flutter_svg` unresolved before the pubspec edit).

- [ ] **Step 3: Implement**

Add to `shell/pubspec.yaml` under `dependencies:` (after `digitalbrain_ui`):

```yaml
  flutter_svg: ^2.3.0
```

Create `lib/workspace/home/app_icon.dart`:

```dart
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

typedef IconLoader = Future<Uint8List?> Function(String path);

// An app's icon file, or its initial when it ships none or the file cannot be read.
class AppIcon extends StatefulWidget {
  const AppIcon({
    super.key,
    required this.title,
    this.path,
    this.load,
    this.size = 48,
  });

  final String title;
  final String? path;
  final IconLoader? load;
  final double size;

  @override
  State<AppIcon> createState() => _AppIconState();
}

class _AppIconState extends State<AppIcon> {
  Future<Uint8List?>? _bytes;

  @override
  void initState() {
    super.initState();
    _bytes = _fetch();
  }

  @override
  void didUpdateWidget(AppIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path) _bytes = _fetch();
  }

  Future<Uint8List?>? _fetch() {
    final path = widget.path, load = widget.load;
    if (path == null || load == null) return null;
    return load(path).then<Uint8List?>((b) => b, onError: (Object _) => null);
  }

  static bool _isSvg(Uint8List bytes) => utf8
      .decode(bytes.take(256).toList(), allowMalformed: true)
      .trimLeft()
      .startsWith('<');

  Widget _fallback(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final initial = widget.title.trim().isEmpty
        ? '?'
        : widget.title.trim()[0].toUpperCase();
    return Container(
      key: const ValueKey('app-icon-fallback'),
      width: widget.size,
      height: widget.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(widget.size / 4),
      ),
      child: Text(
        initial,
        style: TextStyle(
          fontSize: widget.size / 2.2,
          fontWeight: FontWeight.w600,
          color: scheme.onPrimaryContainer,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    if (bytes == null) return _fallback(context);
    return FutureBuilder<Uint8List?>(
      future: bytes,
      builder: (context, snapshot) {
        final data = snapshot.data;
        if (data == null || data.isEmpty) return _fallback(context);
        final size = widget.size;
        return ClipRRect(
          borderRadius: BorderRadius.circular(size / 4),
          child: _isSvg(data)
              ? SvgPicture.memory(data, width: size, height: size)
              : Image.memory(
                  data,
                  width: size,
                  height: size,
                  fit: BoxFit.cover,
                  errorBuilder: (context, _, _) => _fallback(context),
                ),
        );
      },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/app_icon_test.dart`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/shell/pubspec.yaml src/Modules/Google/Flutter/app/shell/lib/workspace/home/app_icon.dart src/Modules/Google/Flutter/app/shell/test/app_icon_test.dart
git commit -m "feat(shell): app icons from the bundle with an initial fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D3: App detail page — name, publisher, description, scenarios, Install / Open / Update

**Files:**
- Create: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/apps_request.dart`
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/app_screen.dart` (import `apps_request.dart` instead of `apps_screen.dart`)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/apps_screen.dart` (remove its `AppsRequest` typedef; import `apps_request.dart` — the file itself is deleted in D6)
- Create: `src/Modules/Google/Flutter/app/shell/lib/workspace/home/app_detail_screen.dart`
- Test: `src/Modules/Google/Flutter/app/shell/test/app_detail_screen_test.dart`

**Interfaces:**
- Consumes: `MarketplaceEntry`, `MarketplaceListing` (D1), `AppIcon`, `IconLoader` (D2), `AppScreen` (existing).
  The icon comes from the listing (`GET /brains/{id}/marketplace/{publisher}/{name}/icon`) when there is
  one, otherwise from the installed copy (`GET /brains/{id}/apps/{name}/icon`, added by Part B4) when the
  copy's manifest names an `icon`.
- Produces:
  - `apps_request.dart`: `typedef AppsRequest = Future<dynamic> Function(String method, String path, [Object? body]);`
  - `AppDetailScreen({Key? key, required String workspaceId, required AppsRequest request, MarketplaceListing? listing, String? installedName, required Future<void> Function(String name) onOpen, IconLoader? loadIcon, String dock = '', ValueChanged<String>? onDock})`
  - Keys: `detail-title`, `detail-publisher`, `detail-description`, `scenario-<name>`, `install-app`, `open-app`, `update-app`, `edit-app`, `dock-app`, `delete-app`, `edited-note`, `detail-notice`, `detail-error`.

- [ ] **Step 1: Write the failing test**

`test/app_detail_screen_test.dart`:

```dart
import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:digitalbrain_flutter_shell/workspace/home/app_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _listingJson = {
  'publisher': 'intochat',
  'publisherAccountId': 'acc-1',
  'publisherBrainId': 'account-acc-1',
  'name': 'customer-researcher',
  'title': 'Customer Researcher',
  'description': 'Research a company and keep verified evidence.',
  'version': '1.3.0',
  'icon': null,
  'scenarios': [
    'Opening the researcher composes its surface',
    'Stopping an idle researcher is safe',
  ],
};

class _FakeMarket {
  _FakeMarket({this.installed = false, this.edited = false, this.update = false});
  bool installed, edited, update;
  final calls = <String>[];

  Map<String, dynamic> get _app => {
    'name': 'customer-researcher',
    'manifest': {
      'title': 'Customer Researcher',
      'description': 'Research a company and keep verified evidence.',
      'operations': [
        {'name': 'open', 'description': 'Open the window'},
      ],
    },
    'status': 'Live',
    'version': '1.2.0',
    'origin': {
      'publisher': 'intochat',
      'name': 'customer-researcher',
      'version': '1.2.0',
    },
    'edited': edited,
    'verdicts': [
      {
        'name': 'Opening the researcher composes its surface',
        'passed': true,
        'message': '',
      },
    ],
  };

  Future<dynamic> request(String method, String path, [Object? body]) async {
    calls.add('$method $path');
    const market = '/brains/b1/marketplace/intochat/customer-researcher';
    if (method == 'GET' && path == market) {
      return {
        'listing': _listingJson,
        'installed': installed,
        'updateAvailable': update && !edited,
      };
    }
    if (method == 'POST' && path == '$market/install') {
      installed = true;
      return _app;
    }
    if (method == 'GET' && path == '/brains/b1/apps/customer-researcher') {
      return _app;
    }
    if (method == 'POST' &&
        path == '/brains/b1/apps/customer-researcher/update') {
      update = false;
      return _app;
    }
    throw StateError('Unexpected $method $path');
  }
}

Widget _host(Widget child) => MaterialApp(home: child);

void main() {
  final listing = MarketplaceListing.fromJson(_listingJson);

  testWidgets('a marketplace app shows what it is and installs in one step', (
    tester,
  ) async {
    final server = _FakeMarket();
    final opened = <String>[];
    await tester.pumpWidget(
      _host(
        AppDetailScreen(
          workspaceId: 'b1',
          request: server.request,
          listing: listing,
          onOpen: (name) async => opened.add(name),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('detail-title')), findsOneWidget);
    expect(find.text('Customer Researcher'), findsWidgets);
    expect(find.text('by intochat · v1.3.0'), findsOneWidget);
    expect(
      find.text('Research a company and keep verified evidence.'),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('scenario-Stopping an idle researcher is safe'),
      ),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('open-app')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('install-app')));
    await tester.pumpAndSettle();
    expect(
      server.calls,
      contains(
        'POST /brains/b1/marketplace/intochat/customer-researcher/install',
      ),
    );
    expect(find.byKey(const ValueKey('install-app')), findsNothing);
    expect(find.text('Installed.'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('open-app')));
    await tester.pumpAndSettle();
    expect(opened, ['customer-researcher']);
  });

  testWidgets('an installed copy offers its update and shows verdicts', (
    tester,
  ) async {
    final server = _FakeMarket(installed: true, update: true);
    await tester.pumpWidget(
      _host(
        AppDetailScreen(
          workspaceId: 'b1',
          request: server.request,
          installedName: 'customer-researcher',
          onOpen: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Reached from My apps: the listing is found through the copy's origin.
    expect(
      server.calls,
      contains('GET /brains/b1/marketplace/intochat/customer-researcher'),
    );
    final passed = tester.widget<ListTile>(
      find.byKey(
        const ValueKey('scenario-Opening the researcher composes its surface'),
      ),
    );
    expect((passed.leading as Icon).icon, Icons.check_circle);

    await tester.tap(find.byKey(const ValueKey('update-app')));
    await tester.pumpAndSettle();
    expect(
      server.calls,
      contains('POST /brains/b1/apps/customer-researcher/update'),
    );
    expect(find.byKey(const ValueKey('update-app')), findsNothing);
  });

  testWidgets('an edited copy says why it no longer updates', (tester) async {
    final server = _FakeMarket(installed: true, update: true, edited: true);
    await tester.pumpWidget(
      _host(
        AppDetailScreen(
          workspaceId: 'b1',
          request: server.request,
          installedName: 'customer-researcher',
          onOpen: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('update-app')), findsNothing);
    expect(find.byKey(const ValueKey('edited-note')), findsOneWidget);
  });

  testWidgets('an installed openable app can be docked and undocked', (
    tester,
  ) async {
    final server = _FakeMarket(installed: true);
    final docks = <String>[];
    await tester.pumpWidget(
      _host(
        AppDetailScreen(
          workspaceId: 'b1',
          request: server.request,
          installedName: 'customer-researcher',
          onOpen: (_) async {},
          onDock: docks.add,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('dock-app')));
    await tester.pumpAndSettle();
    expect(find.text('Undock'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('dock-app')));
    await tester.pumpAndSettle();
    expect(docks, ['customer-researcher', '']);
  });

  testWidgets('a failed install shows the server reason and keeps Install', (
    tester,
  ) async {
    Future<dynamic> refusing(String method, String path, [Object? body]) async {
      if (method == 'GET') {
        return {
          'listing': _listingJson,
          'installed': false,
          'updateAvailable': false,
        };
      }
      throw StateError('An app named customer-researcher is already here.');
    }

    await tester.pumpWidget(
      _host(
        AppDetailScreen(
          workspaceId: 'b1',
          request: refusing,
          listing: listing,
          onOpen: (_) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('install-app')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('detail-error')), findsOneWidget);
    expect(find.textContaining('already here'), findsOneWidget);
    expect(find.byKey(const ValueKey('install-app')), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/app_detail_screen_test.dart`
Expected: FAIL — `app_detail_screen.dart` does not exist.

- [ ] **Step 3: Implement**

Create `lib/workspace/apps/apps_request.dart`:

```dart
typedef AppsRequest =
    Future<dynamic> Function(String method, String path, [Object? body]);
```

In `apps/app_screen.dart` replace `import 'apps_screen.dart';` with `import 'apps_request.dart';`.
In `apps/apps_screen.dart` delete the `typedef AppsRequest = ...;` block and add `import 'apps_request.dart';`
(and `export 'apps_request.dart';` so its existing test still compiles until D6 deletes it).

Create `lib/workspace/home/app_detail_screen.dart`:

```dart
import 'dart:async';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter/material.dart';

import '../apps/app_screen.dart';
import '../apps/apps_request.dart';
import 'app_icon.dart';

// One app before or after install: what it is, who publishes it, the scenarios its tests pin,
// and the single next step — Install, Open or Update. A copy you edited is yours: it keeps
// working but no longer receives the publisher's updates.
class AppDetailScreen extends StatefulWidget {
  const AppDetailScreen({
    super.key,
    required this.workspaceId,
    required this.request,
    this.listing,
    this.installedName,
    required this.onOpen,
    this.loadIcon,
    this.dock = '',
    this.onDock,
  }) : assert(listing != null || installedName != null);

  final String workspaceId;
  final AppsRequest request;
  final MarketplaceListing? listing;
  final String? installedName;
  final Future<void> Function(String name) onOpen;
  final IconLoader? loadIcon;
  final String dock;
  final ValueChanged<String>? onDock;

  @override
  State<AppDetailScreen> createState() => _AppDetailScreenState();
}

class _AppDetailScreenState extends State<AppDetailScreen> {
  MarketplaceEntry? _entry;
  Map<String, dynamic>? _app;
  bool _busy = false;
  String? _error, _notice;
  late String _dock = widget.dock;

  String get _brain => Uri.encodeComponent(widget.workspaceId);
  String _appPath(String name) =>
      '/brains/$_brain/apps/${Uri.encodeComponent(name)}';
  String _marketPath(String publisher, String name) =>
      '/brains/$_brain/marketplace/${Uri.encodeComponent(publisher)}/${Uri.encodeComponent(name)}';

  static Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  MarketplaceListing? get _listing => _entry?.listing ?? widget.listing;
  String? get _installedName =>
      _app == null ? null : '${_app!['name'] ?? widget.installedName}';
  Map<String, dynamic> get _manifest => _map(_app?['manifest']);
  bool get _openable =>
      _app?['status'] == 'Live' &&
      (_manifest['operations'] is List) &&
      (_manifest['operations'] as List).map(_map).any((o) => o['name'] == 'open');

  @override
  void initState() {
    super.initState();
    unawaited(_perform(_load));
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() async {
    MarketplaceEntry? entry;
    Map<String, dynamic>? app;
    var name = widget.installedName;
    final listing = widget.listing;
    if (listing != null) {
      entry = MarketplaceEntry.fromJson(
        _map(
          await widget.request(
            'GET',
            _marketPath(listing.publisher, listing.name),
          ),
        ),
      );
      if (entry.installed) name ??= listing.name;
    }
    if (name != null) {
      app = _map(await widget.request('GET', _appPath(name)));
      final origin = app['origin'];
      if (entry == null && origin is Map) {
        entry = MarketplaceEntry.fromJson(
          _map(
            await widget.request(
              'GET',
              _marketPath('${origin['publisher']}', '${origin['name']}'),
            ),
          ),
        );
      }
    }
    if (!mounted) return;
    setState(() {
      _entry = entry;
      _app = app;
    });
  }

  Future<void> _install() => _perform(() async {
    final listing = _listing!;
    await widget.request(
      'POST',
      '${_marketPath(listing.publisher, listing.name)}/install',
      const <String, dynamic>{},
    );
    await _load();
    if (mounted) setState(() => _notice = 'Installed.');
  });

  Future<void> _update() => _perform(() async {
    await widget.request(
      'POST',
      '${_appPath(_installedName!)}/update',
      const <String, dynamic>{},
    );
    await _load();
    if (mounted) setState(() => _notice = 'Updated to v${_app?['version']}.');
  });

  Future<void> _delete() => _perform(() async {
    await widget.request('DELETE', _appPath(_installedName!));
    if (mounted) Navigator.of(context).pop();
  });

  Future<void> _open() async {
    final name = _installedName!;
    await widget.onOpen(name);
    if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
  }

  Future<void> _edit() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AppScreen(
          workspaceId: widget.workspaceId,
          request: widget.request,
          name: _installedName,
        ),
      ),
    );
    if (mounted) await _perform(_load);
  }

  void _toggleDock() {
    final name = _installedName!;
    final next = _dock == name ? '' : name;
    widget.onDock!(next);
    setState(() => _dock = next);
  }

  @override
  Widget build(BuildContext context) {
    final listing = _listing;
    final app = _app;
    final installed = app != null;
    final title =
        _manifest['title'] as String? ??
        listing?.title ??
        widget.installedName ??
        '';
    final description =
        _manifest['description'] as String? ?? listing?.description ?? '';
    final origin = _map(app?['origin']);
    final publisher = listing?.publisher ?? origin['publisher'] as String?;
    final version = listing?.version ?? '${app?['version'] ?? ''}';
    final verdicts = app?['verdicts'] is List
        ? (app!['verdicts'] as List).map(_map).toList()
        : const <Map<String, dynamic>>[];
    final edited = app?['edited'] == true && origin.isNotEmpty;
    final iconPath = listing?.icon != null
        ? '${_marketPath(listing!.publisher, listing.name)}/icon'
        : _manifest['icon'] != null && _installedName != null
        ? '${_appPath(_installedName!)}/icon'
        : null;
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              if (_busy) const LinearProgressIndicator(),
              Row(
                children: [
                  AppIcon(
                    title: title,
                    path: iconPath,
                    load: widget.loadIcon,
                    size: 64,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          key: const ValueKey('detail-title'),
                          style: textTheme.headlineSmall,
                        ),
                        Text(
                          publisher == null
                              ? 'Yours · v$version'
                              : 'by $publisher · v$version',
                          key: const ValueKey('detail-publisher'),
                          style: textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (description.isNotEmpty)
                Text(description, key: const ValueKey('detail-description')),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (listing != null && !installed)
                    FilledButton(
                      key: const ValueKey('install-app'),
                      onPressed: _busy ? null : _install,
                      child: const Text('Install'),
                    ),
                  if (installed && _openable)
                    FilledButton(
                      key: const ValueKey('open-app'),
                      onPressed: _busy ? null : _open,
                      child: const Text('Open'),
                    ),
                  if (installed && (_entry?.updateAvailable ?? false))
                    FilledButton.tonal(
                      key: const ValueKey('update-app'),
                      onPressed: _busy ? null : _update,
                      child: Text('Update to v${_entry!.listing.version}'),
                    ),
                  if (installed)
                    OutlinedButton(
                      key: const ValueKey('edit-app'),
                      onPressed: _busy ? null : _edit,
                      child: const Text('Edit'),
                    ),
                  if (installed && _openable && widget.onDock != null)
                    OutlinedButton(
                      key: const ValueKey('dock-app'),
                      onPressed: _busy ? null : _toggleDock,
                      child: Text(
                        _dock == _installedName
                            ? 'Undock'
                            : 'Dock beside the desktop',
                      ),
                    ),
                  if (installed)
                    TextButton(
                      key: const ValueKey('delete-app'),
                      onPressed: _busy ? null : _delete,
                      child: const Text('Remove'),
                    ),
                ],
              ),
              if (edited)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    'You changed this copy, so it no longer receives updates from $publisher.',
                    key: const ValueKey('edited-note'),
                  ),
                ),
              if (_notice != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_notice!, key: const ValueKey('detail-notice')),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    key: const ValueKey('detail-error'),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: 24),
              Text('Scenarios', style: textTheme.titleMedium),
              if (verdicts.isNotEmpty)
                for (final verdict in verdicts)
                  ListTile(
                    key: ValueKey('scenario-${verdict['name']}'),
                    dense: true,
                    leading: Icon(
                      verdict['passed'] == true
                          ? Icons.check_circle
                          : Icons.cancel,
                      color: verdict['passed'] == true
                          ? Colors.green
                          : Colors.red,
                    ),
                    title: Text('${verdict['name']}'),
                  )
              else
                for (final scenario in listing?.scenarios ?? const <String>[])
                  ListTile(
                    key: ValueKey('scenario-$scenario'),
                    dense: true,
                    leading: const Icon(Icons.radio_button_unchecked),
                    title: Text(scenario),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/app_detail_screen_test.dart test/app_screen_test.dart test/apps_screen_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/shell/lib/workspace/apps src/Modules/Google/Flutter/app/shell/lib/workspace/home/app_detail_screen.dart src/Modules/Google/Flutter/app/shell/test/app_detail_screen_test.dart
git commit -m "feat(shell): app detail page with Install, Open, Update and Dock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D4: Home screen — My apps, then Marketplace

**Files:**
- Create: `src/Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart`
- Test: `src/Modules/Google/Flutter/app/shell/test/home_screen_test.dart`

**Interfaces:**
- Consumes: `InstalledAppSummary`, `MarketplaceEntry` (D1); `AppIcon`, `IconLoader` (D2); `AppsRequest`, `AppDetailScreen` (D3); `AppScreen`.
  An installed app's tile icon comes from `GET /brains/{id}/apps/{name}/icon` (Part B4 adds it); a
  Marketplace tile's from `GET /brains/{id}/marketplace/{publisher}/{name}/icon`.
- Produces:
  - `class LocalApp { const LocalApp({required String id, required String title, required IconData icon}); }`
  - `HomeScreen({Key? key, required String workspaceId, AppsRequest? request, required Future<void> Function(String name) onOpen, ValueChanged<String>? onLaunchLocal, List<LocalApp> localApps = const [], IconLoader? loadIcon, String dock = '', ValueChanged<String>? onDock, VoidCallback? onAppsChanged})`
  - Keys: `home-my-apps`, `home-marketplace`, `app-<name>`, `details-<name>`, `local-<id>`, `create-app`, `market-<publisher>/<name>`, `home-error`, badge texts `Update` / `Installed`.
  - `request == null` (offline shell) shows local apps only and no Marketplace.

- [ ] **Step 1: Write the failing test**

```dart
import 'package:digitalbrain_flutter_shell/workspace/home/app_detail_screen.dart';
import 'package:digitalbrain_flutter_shell/workspace/home/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeHome {
  final calls = <String>[];
  Future<dynamic> request(String method, String path, [Object? body]) async {
    calls.add('$method $path');
    if (path == '/brains/b1/apps') {
      return [
        {
          'name': 'assistant',
          'title': 'Assistant',
          'description': 'Chat with your brain',
          'status': 'Live',
          'version': '1.0.0',
          'operations': ['open'],
          'origin': {'publisher': 'os', 'name': 'assistant', 'version': '1.0.0'},
          'edited': false,
          'updateAvailable': true,
        },
        {
          'name': 'sketch',
          'title': 'Sketch',
          'description': '',
          'status': 'Drafted',
          'version': '0.1.0',
          'operations': ['open'],
        },
      ];
    }
    if (path == '/brains/b1/marketplace') {
      return [
        {
          'listing': {
            'publisher': 'intochat',
            'publisherAccountId': 'acc-1',
            'publisherBrainId': 'account-acc-1',
            'name': 'customer-researcher',
            'title': 'Customer Researcher',
            'description': 'Research a company',
            'version': '1.3.0',
            'icon': null,
            'scenarios': <String>[],
          },
          'installed': false,
          'updateAvailable': false,
        },
        {
          'listing': {
            'publisher': 'os',
            'publisherAccountId': 'acc-os',
            'publisherBrainId': 'account-acc-os',
            'name': 'assistant',
            'title': 'Assistant',
            'description': 'Chat with your brain',
            'version': '1.1.0',
            'icon': null,
            'scenarios': <String>[],
          },
          'installed': true,
          'updateAvailable': true,
        },
      ];
    }
    if (path == '/brains/b1/marketplace/intochat/customer-researcher') {
      return (await request('GET', '/brains/b1/marketplace') as List).first;
    }
    throw StateError('Unexpected $method $path');
  }
}

void main() {
  testWidgets('my apps come first, then the Marketplace', (tester) async {
    final server = _FakeHome();
    final opened = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeScreen(
            workspaceId: 'b1',
            request: server.request,
            onOpen: (name) async => opened.add(name),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final myApps = tester.getTopLeft(find.byKey(const ValueKey('home-my-apps')));
    final market = tester.getTopLeft(
      find.byKey(const ValueKey('home-marketplace')),
    );
    expect(myApps.dy, lessThan(market.dy));
    expect(find.byKey(const ValueKey('app-assistant')), findsOneWidget);
    expect(
      find.byKey(const ValueKey('market-intochat/customer-researcher')),
      findsOneWidget,
    );
    expect(find.text('Update'), findsOneWidget);
    expect(find.text('Installed'), findsOneWidget);

    // A live app with an open operation opens on tap.
    await tester.tap(find.byKey(const ValueKey('app-assistant')));
    await tester.pumpAndSettle();
    expect(opened, ['assistant']);

    // A drafted app has nothing to open; its tile leads to its details.
    await tester.tap(find.byKey(const ValueKey('app-sketch')));
    await tester.pumpAndSettle();
    expect(opened, ['assistant']);
    expect(find.byType(AppDetailScreen), findsOneWidget);
  });

  testWidgets('a marketplace tile opens its detail page', (tester) async {
    final server = _FakeHome();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeScreen(
            workspaceId: 'b1',
            request: server.request,
            onOpen: (_) async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('market-intochat/customer-researcher')),
    );
    await tester.pumpAndSettle();
    final detail = tester.widget<AppDetailScreen>(find.byType(AppDetailScreen));
    expect(detail.listing!.name, 'customer-researcher');
    expect(find.byKey(const ValueKey('install-app')), findsOneWidget);
  });

  testWidgets('an offline shell shows only its local apps', (tester) async {
    final launched = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeScreen(
            workspaceId: 'local',
            onOpen: (_) async {},
            localApps: const [
              LocalApp(id: 'csharp', title: 'C# files', icon: Icons.code),
            ],
            onLaunchLocal: launched.add,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-marketplace')), findsNothing);
    expect(find.byKey(const ValueKey('create-app')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('local-csharp')));
    expect(launched, ['csharp']);
  });

  testWidgets('a failed load says so and keeps the local apps', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeScreen(
            workspaceId: 'b1',
            request: (method, path, [body]) async =>
                throw StateError('kernel unreachable'),
            onOpen: (_) async {},
            localApps: const [
              LocalApp(id: 'csharp', title: 'C# files', icon: Icons.code),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home-error')), findsOneWidget);
    expect(find.byKey(const ValueKey('local-csharp')), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/home_screen_test.dart`
Expected: FAIL — `home_screen.dart` does not exist.

- [ ] **Step 3: Implement**

Create `lib/workspace/home/home_screen.dart`:

```dart
import 'dart:async';

import 'package:digitalbrain_flutter/digitalbrain_flutter.dart';
import 'package:flutter/material.dart';

import '../apps/app_screen.dart';
import '../apps/apps_request.dart';
import 'app_detail_screen.dart';
import 'app_icon.dart';

// An app the shell runs itself rather than a brain app (C# files in developer mode).
class LocalApp {
  const LocalApp({required this.id, required this.title, required this.icon});
  final String id, title;
  final IconData icon;
}

// The start view: this brain's apps, then everything published to the Marketplace.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.workspaceId,
    this.request,
    required this.onOpen,
    this.onLaunchLocal,
    this.localApps = const [],
    this.loadIcon,
    this.dock = '',
    this.onDock,
    this.onAppsChanged,
  });

  final String workspaceId;
  final AppsRequest? request;
  final Future<void> Function(String name) onOpen;
  final ValueChanged<String>? onLaunchLocal;
  final List<LocalApp> localApps;
  final IconLoader? loadIcon;
  final String dock;
  final ValueChanged<String>? onDock;
  final VoidCallback? onAppsChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<InstalledAppSummary> _apps = const [];
  List<MarketplaceEntry> _market = const [];
  String? _error;
  bool _loading = false;

  String get _brain => Uri.encodeComponent(widget.workspaceId);

  static List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? [for (final item in value) Map<String, dynamic>.from(item as Map)]
      : const [];

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final request = widget.request;
    if (request == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        request('GET', '/brains/$_brain/apps'),
        request('GET', '/brains/$_brain/marketplace'),
      ]);
      if (!mounted) return;
      setState(() {
        _apps = _maps(results[0]).map(InstalledAppSummary.fromJson).toList();
        _market = _maps(results[1]).map(MarketplaceEntry.fromJson).toList();
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _afterChange() async {
    await _load();
    widget.onAppsChanged?.call();
  }

  Future<void> _details({MarketplaceListing? listing, String? installed}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AppDetailScreen(
          workspaceId: widget.workspaceId,
          request: widget.request!,
          listing: listing,
          installedName: installed,
          onOpen: widget.onOpen,
          loadIcon: widget.loadIcon,
          dock: widget.dock,
          onDock: widget.onDock,
        ),
      ),
    );
    if (mounted) await _afterChange();
  }

  Future<void> _create() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AppScreen(
          workspaceId: widget.workspaceId,
          request: widget.request!,
        ),
      ),
    );
    if (mounted) await _afterChange();
  }

  void _tapInstalled(InstalledAppSummary app) {
    if (app.status == 'Live' && app.operations.contains('open')) {
      unawaited(widget.onOpen(app.id));
    } else {
      unawaited(_details(installed: app.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final online = widget.request != null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
      children: [
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              _error!,
              key: const ValueKey('home-error'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        Text(
          'My apps',
          key: const ValueKey('home-my-apps'),
          style: textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            for (final app in widget.localApps)
              _Tile(
                key: ValueKey('local-${app.id}'),
                title: app.title,
                icon: Icon(app.icon, size: 40),
                onTap: () => widget.onLaunchLocal?.call(app.id),
              ),
            for (final app in _apps)
              _Tile(
                key: ValueKey('app-${app.id}'),
                title: app.title,
                subtitle: app.status == 'Live' ? null : app.status,
                badge: app.updateAvailable ? 'Update' : null,
                icon: AppIcon(
                  title: app.title,
                  path: app.icon == null
                      ? null
                      : '/brains/$_brain/apps/${Uri.encodeComponent(app.id)}/icon',
                  load: widget.loadIcon,
                ),
                onTap: () => _tapInstalled(app),
                onDetails: () => _details(installed: app.id),
                detailsKey: ValueKey('details-${app.id}'),
              ),
            if (online)
              _Tile(
                key: const ValueKey('create-app'),
                title: 'Create app',
                icon: const Icon(Icons.add, size: 40),
                onTap: _create,
              ),
          ],
        ),
        if (online) ...[
          const SizedBox(height: 32),
          Text(
            'Marketplace',
            key: const ValueKey('home-marketplace'),
            style: textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (_market.isEmpty && !_loading)
            const Text('Nothing is published yet.')
          else
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                for (final entry in _market)
                  _Tile(
                    key: ValueKey(
                      'market-${entry.listing.publisher}/${entry.listing.name}',
                    ),
                    title: entry.listing.title,
                    subtitle: entry.listing.description,
                    badge: entry.installed ? 'Installed' : null,
                    icon: AppIcon(
                      title: entry.listing.title,
                      path: entry.listing.icon == null
                          ? null
                          : '/brains/$_brain/marketplace/${Uri.encodeComponent(entry.listing.publisher)}/${Uri.encodeComponent(entry.listing.name)}/icon',
                      load: widget.loadIcon,
                    ),
                    onTap: () => _details(listing: entry.listing),
                  ),
              ],
            ),
        ],
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    super.key,
    required this.title,
    required this.icon,
    required this.onTap,
    this.subtitle,
    this.badge,
    this.onDetails,
    this.detailsKey,
  });

  final String title;
  final String? subtitle, badge;
  final Widget icon;
  final VoidCallback onTap;
  final VoidCallback? onDetails;
  final Key? detailsKey;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 168,
    height: 168,
    child: Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  icon,
                  const Spacer(),
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Text(
                      subtitle!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
            if (badge != null)
              Positioned(
                top: 8,
                right: onDetails == null ? 8 : 40,
                child: Chip(
                  label: Text(badge!),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            if (onDetails != null)
              Positioned(
                top: 0,
                right: 0,
                child: IconButton(
                  key: detailsKey,
                  tooltip: 'Details',
                  icon: const Icon(Icons.info_outline, size: 18),
                  onPressed: onDetails,
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/home_screen_test.dart`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/shell/lib/workspace/home/home_screen.dart src/Modules/Google/Flutter/app/shell/test/home_screen_test.dart
git commit -m "feat(shell): home screen with My apps and the Marketplace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D5: Publish and origin in the app screen

**Files:**
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/app_screen.dart`
- Test: `src/Modules/Google/Flutter/app/shell/test/app_screen_test.dart` (add facts)

**Interfaces:**
- Consumes: app read JSON fields `versions[{version, savedAt, green}]`, `publishedVersion`, `origin`; `POST /brains/{id}/apps/{name}/publish`.
- Produces: keys `publish-app`, `published-version`, `app-origin`.

- [ ] **Step 1: Write the failing test**

Append to `test/app_screen_test.dart` inside `main()`:

```dart
  testWidgets('a green version can be published, a red one cannot', (
    tester,
  ) async {
    var green = false;
    String? published;
    final calls = <String>[];
    Future<dynamic> request(String method, String path, [Object? body]) async {
      calls.add('$method $path');
      if (method == 'POST' && path.endsWith('/publish')) {
        published = '1.0.0';
        return {'publishedVersion': published};
      }
      return {
        'name': 'shouter',
        'manifest': {'title': 'Shouter', 'description': 'Shouts back.'},
        'spec': '## Scenario: It shouts',
        'version': '1.0.0',
        'status': 'Live',
        'activity': <String>[],
        'verdicts': <Object>[],
        'versions': [
          {'version': '1.0.0', 'savedAt': '2026-10-05T00:00:00Z', 'green': green},
        ],
        'publishedVersion': published,
      };
    }

    Future<void> show() async {
      await tester.pumpWidget(
        MaterialApp(
          home: AppScreen(
            key: UniqueKey(),
            workspaceId: 'workspace-alice',
            request: request,
            name: 'shouter',
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await show();
    expect(find.byKey(const ValueKey('publish-app')), findsNothing);

    green = true;
    await show();
    await tester.tap(find.byKey(const ValueKey('publish-app')));
    await tester.pumpAndSettle();
    expect(calls, contains('POST /brains/workspace-alice/apps/shouter/publish'));
    expect(find.text('Published v1.0.0'), findsOneWidget);
    // Already published at this version: nothing more to publish.
    expect(find.byKey(const ValueKey('publish-app')), findsNothing);
  });

  testWidgets('an installed copy says where it came from', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: AppScreen(
          workspaceId: 'workspace-alice',
          name: 'customer-researcher',
          request: (method, path, [body]) async => {
            'name': 'customer-researcher',
            'manifest': {'title': 'Customer Researcher'},
            'spec': '',
            'version': '1.2.0',
            'status': 'Live',
            'origin': {
              'publisher': 'intochat',
              'name': 'customer-researcher',
              'version': '1.2.0',
            },
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Installed from intochat/customer-researcher v1.2.0'),
      findsOneWidget,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/app_screen_test.dart`
Expected: FAIL — no widget with key `publish-app`; origin text not found.

- [ ] **Step 3: Implement**

In `_AppScreenState` add:

```dart
  static bool _green(Map<String, dynamic> app) =>
      app['versions'] is List &&
      (app['versions'] as List).map(_map).any(
        (version) =>
            version['version'] == app['version'] && version['green'] == true,
      );

  Future<void> _publish() => _perform('', () async {
    await widget.request(
      'POST',
      '$_appPath/publish',
      const <String, dynamic>{},
    );
    _show(await widget.request('GET', _appPath));
  });
```

In `build`, directly after the `app-status` `Text`, insert:

```dart
              if (app != null && app['origin'] is Map)
                Text(
                  'Installed from ${_map(app['origin'])['publisher']}/'
                  '${_map(app['origin'])['name']} v${_map(app['origin'])['version']}',
                  key: const ValueKey('app-origin'),
                ),
              if (app != null && '${app['publishedVersion'] ?? ''}'.isNotEmpty)
                Text(
                  'Published v${app['publishedVersion']}',
                  key: const ValueKey('published-version'),
                ),
```

and in the button `Wrap`, after the Verify button inside `if (app != null) ...[`:

```dart
                    if (_green(app) && app['publishedVersion'] != app['version'])
                      FilledButton.tonal(
                        key: const ValueKey('publish-app'),
                        onPressed: _busy ? null : _publish,
                        child: const Text('Publish'),
                      ),
```

Update the class comment to: `// The Creator: describe the app and it exists — Drafted, in this brain — then iterate.`
`// Implement and Verify answer immediately and run in the background; the screen follows`
`// the app's status and activity feed. A green version can be published to the Marketplace.`

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/app_screen_test.dart`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/shell/lib/workspace/apps/app_screen.dart src/Modules/Google/Flutter/app/shell/test/app_screen_test.dart
git commit -m "feat(shell): publish a green version and show an install's origin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D6: Home is the start view; the Home island replaces the Applications popup

**Files:**
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart` (state `_home`, `_main`, `_homeScreen`, `_open`, `_openApplication`, `_launchApp`, `_islands`; delete `_openApps`; drop `apps/apps_screen.dart` import, add `home/home_screen.dart`)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_islands.dart` (remove `apps`, `onLaunch`, `onApps`; add `onHome`, `home`)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart` (`WorkspacePreferences.dock`)
- Delete: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/apps_screen.dart`, `src/Modules/Google/Flutter/app/shell/test/apps_screen_test.dart`
- Modify tests: `test/navigation_actions_test.dart`, `test/csharp_developer_mode_test.dart`, `test/customer_researcher_window_test.dart`, `test/local_app_shell_test.dart`, `test/first_run_test.dart` (`FirstRunClient` answers `/marketplace` with `[]`)

**Interfaces:**
- Consumes: `HomeScreen`, `LocalApp` (D4); `client.readBytes` (D1).
- Produces: `WorkspaceIslands({..., required VoidCallback onHome, bool home = false, ...})` without `apps`/`onLaunch`/`onApps`; the Home island button has tooltip `Home`. WorkspaceApp shows `HomeScreen` in the desktop area until an app or window opens; the Home button toggles it.

- [ ] **Step 1: Write the failing test**

Replace the apps portion of `test/navigation_actions_test.dart` (everything from the first
`await tester.tap(find.byTooltip('Applications'));` to the end of the `for (final exit ...)` loop) with:

```dart
      // Home is the start view and the Home island toggles it. On a phone the side panel
      // segment is selected first, so switch to the workspace segment to see Home.
      if (width < 760) {
        await tester.tap(find.text('Workspace'));
        await tester.pumpAndSettle();
      }
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(
        tester.widget<HomeScreen>(find.byType(HomeScreen)).workspaceId,
        store.currentProject.id,
      );
      expect(find.byTooltip('Applications'), findsNothing);
      await tester.tap(find.byTooltip('Home'));
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsNothing);
      await tester.tap(find.byTooltip('Home'));
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
```

and replace its imports/fakes: drop `apps_screen.dart` and the `AppsRefreshClient` class, import
`package:digitalbrain_flutter_shell/workspace/home/home_screen.dart`, and use `final api = FirstRunClient();`.

In `test/first_run_test.dart` `FirstRunClient.send`, before the `/apps` branch add:

```dart
    } else if (request.url.path.endsWith('/marketplace')) {
      value = const <Object>[];
```

In `test/csharp_developer_mode_test.dart` `pumpShell`, delete the two lines tapping `Applications`, and in
the first test replace `expect(find.text('Assistant'), findsWidgets);` with
`expect(find.byType(HomeScreen), findsOneWidget);` (import `home/home_screen.dart`).

In `test/customer_researcher_window_test.dart` delete
`await tester.tap(find.byTooltip('Applications')); await tester.pumpAndSettle();` — the
`Customer Researcher` tile is on the home screen and opening it is a tap on that text.

In `test/local_app_shell_test.dart` replace `find.byTooltip('Applications')` with `find.byTooltip('Home')`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/navigation_actions_test.dart test/csharp_developer_mode_test.dart test/customer_researcher_window_test.dart test/local_app_shell_test.dart`
Expected: FAIL — no `HomeScreen` in the tree, no `Home` tooltip.

- [ ] **Step 3: Implement**

`workspace_islands.dart`:
- Constructor: remove `this.apps = const []`, `required this.onLaunch`, `this.onApps`; add `required this.onHome`, `this.home = false`.
- Fields: remove `final List<InstalledAppSummary> apps;`, change `final ValueChanged<String> onLaunch, onRestore;` to `final ValueChanged<String> onRestore;`, change `final VoidCallback? onSwitchAccount, onApps;` to `final VoidCallback? onSwitchAccount;`, add `final VoidCallback onHome;` and `final bool home;`.
- Remove the `'assistant' => Icons.assistant_outlined,` arm from `appIcon`.
- Replace the whole `PopupMenuButton<String>(tooltip: 'Applications', ...)` with:

```dart
            IconButton(
              tooltip: 'Home',
              onPressed: onHome,
              icon: Icon(
                Icons.apps_rounded,
                size: 23,
                color: home ? Theme.of(context).colorScheme.primary : null,
              ),
            ),
```

`workspace_app.dart`:
- Replace `import 'apps/apps_screen.dart';` with `import 'home/home_screen.dart';`.
- State: change `bool _ready = false, _directory = false, _mobileWork = false;` to
  `bool _ready = false, _directory = false, _mobileWork = false, _home = true;`.
- Add to the state class:

```dart
  // Home stands in for the desktop until something opens; the Home island brings it back.
  Widget _main(BuildContext context) => _home ? _homeScreen() : _work(context);

  Widget _homeScreen() {
    final client = widget.programmingClient;
    final project = store.currentProject;
    return HomeScreen(
      key: ValueKey('${client?.workspaceIdentity}/${project.id}'),
      workspaceId: project.id,
      request: client?.jsonRequest,
      loadIcon: client?.readBytes,
      localApps: [
        if (store.developerMode)
          const LocalApp(id: 'csharp', title: 'C# files', icon: Icons.code),
      ],
      onLaunchLocal: _launchApp,
      onOpen: _openApplication,
      dock: store.settings.dock,
      onDock: (name) {
        store.settings.dock = name;
        store.save();
        setState(() {});
      },
      onAppsChanged: () {
        _apps.remove(project.id);
        _appsLoading.remove(project.id);
        _loadApps(project.id);
      },
    );
  }
```

- `workspace_store.dart` `WorkspacePreferences` (the dock choice the home screen edits; D7 renders it):
  add `String dock = 'assistant';`, add `'dock': dock,` to `toJson`, and add
  `..dock = _text(json['dock'], 'assistant')` to `fromJson`.

- In `_workspace`, replace both `_work(context)` uses (the mobile `IndexedStack` child and `Expanded(child: _work(context))`) with `_main(context)`.
- In `_open(WorkspaceArtifact a)`, add as the first statement: `if (_home) setState(() => _home = false);`
- In `_openApplication`, directly after `_accept(opened, project: project);` add `setState(() => _home = false);`.
- In `_launchApp`, change the `csharp` case to:

```dart
      case 'csharp':
        if (store.developerMode) {
          store.launchLocalApp(appId);
          setState(() => _home = false);
        }
```

- In `_islands`, remove `apps: ...`, `onLaunch: _launchApp,` and `onApps: ...`; add
  `onHome: () => setState(() => _home = !_home),` and `home: _home,`.
- Delete the `_openApps()` method.

Delete `lib/workspace/apps/apps_screen.dart` and `test/apps_screen_test.dart`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/navigation_actions_test.dart test/csharp_developer_mode_test.dart test/customer_researcher_window_test.dart test/local_app_shell_test.dart test/first_run_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/Modules/Google/Flutter/app/shell
git commit -m "feat(shell): home is the start view and replaces the Applications popup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D7: Dock any app in the side panel

**Files:**
- Modify: `src/Modules/Google/Flutter/app/ui/lib/src/composition/application_surface.dart` (start callback)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_store.dart` (`WorkspacePreferences.dock`)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_app.dart` (`_dockedApp`, `_workspace`, `_openApplication`, `_islands`)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_islands.dart` (`sidePanel` flag; labels)
- Modify: `src/Modules/Google/Flutter/app/shell/lib/workspace/workspace_settings.dart:354` (label)
- Modify tests: `test/application_fixture.dart`, `test/application_surface_test.dart`, `test/assistant_app_test.dart`, `test/first_run_test.dart`

**Interfaces:**
- Consumes: `client.openDockedApp` (D1); installed apps list `_apps` (existing `_loadApps`).
- Produces:
  - `ApplicationSurface({Key? key, required DigitalBrainUiClient client, required String workspace, required String application, required Future<Map<String, dynamic>> Function() start, ValueChanged<Map<String, dynamic>>? onActivate})` — `startArguments` removed.
  - Renders `WorkspacePreferences.dock` (added in D6; `''` = nothing docked).
  - `WorkspaceIslands.sidePanel` (`bool`, default `true`): the side-panel toggle shows only when an app is docked; tooltip `Side panel`.
  - `application_fixture.dart` exports `const assistantSummary` (the installed assistant list item).

- [ ] **Step 1: Write the failing tests**

Replace `test/application_fixture.dart`'s top with a docked-open answer and an exported summary:

```dart
import 'dart:convert';

import 'package:http/http.dart' as http;

const assistantSummary = {
  'name': 'assistant',
  'title': 'Assistant',
  'description': 'Chat with your brain',
  'status': 'Live',
  'version': '1.0.0',
  'operations': ['open'],
};

/// A surface composed entirely from generic declared primitives.
Map<String, dynamic>? applicationResponse(http.BaseRequest request) {
  final segments = request.url.pathSegments;
  if (segments.length < 2 || segments.first != 'brains') return null;
  final root = '${segments[1]}/apps/assistant';
  if (request.url.path.endsWith('/apps/assistant/ask') &&
      request is http.Request &&
      (jsonDecode(request.body) as Map)['input'] == 'docked') {
    return {
      'id': '$root/docked',
      'title': 'Assistant',
      'surface': {'kind': 'surface', 'name': '$root/surface'},
    };
  }
  if (!request.url.path.endsWith('/apps/node')) return null;
```

(the remainder of the function — the `switch` over `kind` — is unchanged.)

In `test/first_run_test.dart` change the `/apps` branch of `FirstRunClient` to
`value = const [assistantSummary];` (import `assistantSummary` from `application_fixture.dart`).

Rewrite `test/application_surface_test.dart`'s two `ApplicationSurface` constructions to pass `start:`
instead of relying on `/start`:

```dart
    Widget view(String workspace) => MaterialApp(
      home: Scaffold(
        body: ApplicationSurface(
          client: client,
          workspace: workspace,
          application: 'assistant',
          start: () async {
            starts.add(workspace);
            return {'kind': 'surface', 'name': '$workspace/root'};
          },
        ),
      ),
    );
```

and remove the `/start` branch from that test's `MockClient` (the node loads stay). In the retry test,
replace the `/start` branch with a `start:` that throws on the first call:

```dart
          start: () async {
            if (++attempts == 1) throw StateError('Unavailable');
            return {'kind': 'surface', 'name': 'w/root'};
          },
```

In `test/assistant_app_test.dart`:
- First test: make `/apps` answer `[assistantSummary]` (add
  `if (request.url.path.endsWith('/apps')) return http.Response(jsonEncode([assistantSummary]), 200);`
  before the fallback) and replace the `/applications/assistant/start` expectation with
  `requests.any((path) => path.endsWith('/apps/assistant/ask'))`.
- Second test ("each Assistant launch opens a fresh floating neuron surface"): answer `/apps` the same way;
  change the window branch to
  `if (request.url.path.endsWith('/apps/assistant/ask') && (jsonDecode(request.body) as Map)['input'] != 'docked')`;
  replace the `WorkspaceIslands.onLaunch('assistant')` loop with:

```dart
    final open = tester.widget<HomeScreen>(find.byType(HomeScreen)).onOpen;
    for (var i = 0; i < 2; i++) {
      unawaited(open('assistant'));
      await tester.pumpAndSettle();
    }
```

(imports: `dart:async`, `home/home_screen.dart`, `assistantSummary`).

Add to `test/assistant_app_test.dart`:

```dart
  testWidgets('nothing docked means no side panel', (tester) async {
    final store = WorkspaceStore(persistence: MemoryWorkspacePersistence())
      ..settings.dock = '';
    final requests = <String>[];
    final client = DigitalBrainUiClient(
      baseUri: Uri.parse('http://test'),
      httpClient: MockClient((request) async {
        requests.add(request.url.path);
        if (request.url.path.endsWith('/apps')) {
          return http.Response(jsonEncode([assistantSummary]), 200);
        }
        return http.Response(
          jsonEncode({'revision': 0, 'windows': [], 'apps': []}),
          200,
        );
      }),
    );
    await tester.pumpWidget(
      WorkspaceApp(store: store, programmingClient: client),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ApplicationSurface), findsNothing);
    expect(find.byTooltip('Side panel'), findsNothing);
    expect(requests.any((path) => path.endsWith('/ask')), isFalse);
    await tester.pumpWidget(const SizedBox());
    store.dispose();
  });

  test('the docked app survives a reload', () {
    final prefs = WorkspacePreferences()..dock = 'customer-researcher';
    expect(
      WorkspacePreferences.fromJson(prefs.toJson()).dock,
      'customer-researcher',
    );
    expect(WorkspacePreferences.fromJson(const {}).dock, 'assistant');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `flutter test test/application_surface_test.dart test/assistant_app_test.dart test/first_run_test.dart`
Expected: FAIL — `start` is not a parameter of `ApplicationSurface`; the side panel still starts through
`/applications/assistant/start`. ("the docked app survives a reload" already passes since D6 — it pins
the persisted shape.)

- [ ] **Step 3: Implement**

`ui/lib/src/composition/application_surface.dart`: replace the constructor, fields and `_start`:

```dart
/// Renders the surface an application declares. The host decides how the application is
/// started; the application owns the component tree.
class ApplicationSurface extends StatefulWidget {
  const ApplicationSurface({
    super.key,
    required this.client,
    required this.workspace,
    required this.application,
    required this.start,
    this.onActivate,
  });

  final DigitalBrainUiClient client;
  final String workspace, application;
  final Future<Map<String, dynamic>> Function() start;
  final ValueChanged<Map<String, dynamic>>? onActivate;
```

```dart
  Future<Map<String, dynamic>> _start() => widget.start();
```

`workspace_app.dart`:
- Add:

```dart
  // The side panel holds whichever installed app the person docked, if it can open.
  String? get _dockedApp {
    final name = store.settings.dock;
    final apps = _apps[store.currentProject.id];
    if (widget.programmingClient == null || name.isEmpty || apps == null) {
      return null;
    }
    return apps.any((app) => app.id == name && app.operations.contains('open'))
        ? name
        : null;
  }
```

- In `_workspace`, replace the `chat` construction with:

```dart
      final docked = _dockedApp;
      if (docked == null) return _main(context);
      // _dockedApp is non-null only with a client.
      final api = client!;
      final project = store.currentProject;
      final panel = ApplicationSurface(
        key: ValueKey('${project.id}/$docked'),
        client: api,
        workspace: project.id,
        application: docked,
        start: () => api.openDockedApp(project.id, docked),
        onActivate: (result) => _accept(result),
      );
```

  rename the remaining `chat` references to `panel`, and change the mobile segment label
  `Text('Assistant')` to `Text('Side panel')`.
- No change to `_homeScreen`: its `onDock` (D6) already calls `setState`, which re-evaluates
  `_dockedApp` and swaps the panel.
- In `_openApplication`, replace the `application == 'assistant' ? ... : ...` expression with
  `await client.openApp(project.id, application, arguments)`.
- In `_islands`, add `sidePanel: _dockedApp != null,`.

`workspace_islands.dart`: add `this.sidePanel = true` / `final bool sidePanel;`; wrap the side-panel
`IconButton` (currently `tooltip: 'Assistant'`) in `if (sidePanel)` and change its tooltip to
`'Side panel'`; change the profile entries to `'Side panel on left'` / `'Side panel on right'`.

`workspace_settings.dart:354`: `title: const Text('Side panel on the right'),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `flutter test test/application_surface_test.dart test/assistant_app_test.dart test/first_run_test.dart test/navigation_actions_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/Modules/Google/Flutter/app/ui/lib src/Modules/Google/Flutter/app/shell
git commit -m "feat(shell): dock any installed app in the side panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D8: "Continue as" seeded accounts on the sign-in screen

**Files:**
- Modify: `src/Modules/Google/Flutter/app/shell/lib/auth/login_screen.dart`
- Modify: `src/Modules/Google/Flutter/app/shell/lib/auth/brain_session_gate.dart`
- Test: `src/Modules/Google/Flutter/app/shell/test/account_switching_test.dart` (add a fact)

**Interfaces:**
- Consumes: `client.listSeededAccounts()`, `client.signInSeeded(username)` (D1).
- Produces: `LoginScreen({..., List<SeededAccount> seededAccounts = const [], Future<String?> Function(String username)? onContinueAs})`; buttons keyed `continue-as-<username>`.

- [ ] **Step 1: Write the failing test**

Append to `test/account_switching_test.dart` `main()`:

```dart
  testWidgets('switching offers the seeded accounts and continues as one', (
    tester,
  ) async {
    var principal = 'owner';
    await tester.pumpWidget(
      BrainSessionGate(
        createClient: (_) => DigitalBrainUiClient(
          baseUri: Uri.parse('http://kernel'),
          httpClient: MockClient((request) async {
            switch (request.url.path) {
              case '/auth/check':
                return http.Response('', 204);
              case '/identity/logout':
                return http.Response('', 204);
              case '/identity/seeded-accounts':
                return http.Response(
                  jsonEncode([
                    {'username': 'intochat', 'displayName': 'IntoChat'},
                  ]),
                  200,
                );
              case '/identity/seeded-accounts/intochat/login':
                principal = 'intochat';
              case '/identity/session':
                break;
              default:
                return http.Response('', 404);
            }
            return http.Response(
              jsonEncode({
                'principalId': principal,
                'accountId': '$principal-account',
                'brainId': '$principal-home',
              }),
              200,
            );
          }),
        ),
        builder: (client, status, switchAccount) => MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(client!.workspaceIdentity),
                TextButton(
                  onPressed: switchAccount,
                  child: const Text('Switch account'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('owner|owner-account'), findsOneWidget);
    await tester.tap(find.text('Switch account'));
    await tester.pumpAndSettle();
    expect(find.text('Continue as IntoChat'), findsOneWidget);
    await tester.tap(find.byKey(const Key('continue-as-intochat')));
    await tester.pumpAndSettle();
    expect(find.text('intochat|intochat-account'), findsOneWidget);
  });
```

The existing switching fact keeps passing: its server answers 404 for `/identity/seeded-accounts`, so no
"Continue as" section appears.

- [ ] **Step 2: Run test to verify it fails**

Run: `flutter test test/account_switching_test.dart`
Expected: FAIL — `Continue as IntoChat` not found.

- [ ] **Step 3: Implement**

`login_screen.dart`: add constructor params `this.seededAccounts = const []` and `this.onContinueAs`, fields
`final List<SeededAccount> seededAccounts;` and
`final Future<String?> Function(String username)? onContinueAs;`, import
`package:digitalbrain_flutter/digitalbrain_flutter.dart`, add to the state:

```dart
  Future<void> _continueAs(String username) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final failure = await widget.onContinueAs!(username);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = failure;
    });
  }
```

and, in the `Column` after the `Text('Sign in to reach the kernel.' ...)` and its `SizedBox(height: 24)`:

```dart
                if (widget.onContinueAs != null &&
                    widget.seededAccounts.isNotEmpty) ...[
                  for (final account in widget.seededAccounts)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: OutlinedButton(
                        key: Key('continue-as-${account.username}'),
                        onPressed: _busy
                            ? null
                            : () => _continueAs(account.username),
                        child: Text('Continue as ${account.displayName}'),
                      ),
                    ),
                  const SizedBox(height: 16),
                ],
```

Change the class comment to:
`/// Credential prompt shown when the kernel answers 401 or the person switches account.`
`/// A development deployment also lists its seeded accounts for one-step switching.`

`brain_session_gate.dart`: add state `List<SeededAccount> _seeded = const [];`, and:

```dart
  // Seeded accounts exist only on a development server; any failure simply hides them.
  Future<void> _loadSeeded() async {
    final client = widget.createClient(null);
    try {
      final accounts = await client.listSeededAccounts();
      if (mounted) setState(() => _seeded = accounts);
    } on Object {
      if (mounted) setState(() => _seeded = const []);
    } finally {
      client.close();
    }
  }

  Future<String?> _continueAs(String username) async {
    final client = widget.createClient(null);
    try {
      await client.signInSeeded(username);
      store.clearStoredCredentials();
      _enterShell(client, null);
      return null;
    } on Object {
      client.close();
      return 'Could not continue as $username.';
    }
  }
```

Call `unawaited(_loadSeeded());` where the gate enters the login phase: in `_attempt`'s `!accepted` branch
after its `setState`, and in `_switchAccount` after the `setState` that sets `_Phase.login`. Pass
`seededAccounts: _seeded, onContinueAs: _continueAs,` to `LoginScreen` in `build`.

- [ ] **Step 4: Run test to verify it passes**

Run: `flutter test test/account_switching_test.dart`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Google/Flutter/app/shell/lib/auth src/Modules/Google/Flutter/app/shell/test/account_switching_test.dart
git commit -m "feat(shell): continue as a seeded account when switching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D9: Shell cleanup and the whole shell suite

**Files:**
- Delete: `src/Modules/Google/Flutter/app/shell/lib/workspace/apps/built_in_app_view.dart`, `src/Modules/Google/Flutter/app/shell/test/built_in_app_view_test.dart`

**Interfaces:** none (dead code: its `/built-in/{app}/open` endpoints no longer exist and nothing references the widget).

- [ ] **Step 1: Confirm nothing references the widget**

Run (repo root): `git grep -n "BuiltInAppView\|built_in_app_view" -- src/Modules/Google/Flutter/app`
Expected: only the two files being deleted.

- [ ] **Step 2: Delete both files**

```bash
git rm src/Modules/Google/Flutter/app/shell/lib/workspace/apps/built_in_app_view.dart src/Modules/Google/Flutter/app/shell/test/built_in_app_view_test.dart
```

- [ ] **Step 3: Analyze and run the whole shell suite**

Run: `flutter analyze` then `flutter test`
Expected: `No issues found!` and all tests pass. Any remaining failure that finds `'Applications'`,
`'Assistant'` (tooltip or segment), `/applications/assistant/start` or `AppsScreen` is a missed rename from
D6/D7 — update the finder to `'Home'`, `'Side panel'`, `/apps/assistant/ask` or `HomeScreen` respectively.

- [ ] **Step 4: Format**

Run: `dart format lib test` (from `shell`) and `dart format lib` (from `../ui` and `../core`).
Expected: files formatted; re-run `flutter test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/Modules/Google/Flutter/app
git commit -m "chore(shell): drop the dead built-in app view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D10: C# leftovers from the package model; the researcher can be docked

**Files:**
- Modify: `src/IntoChat/Apps/CustomerResearcher/behaviors/surface.cs:20-34`
- Modify: `src/IntoChat/Apps/CustomerResearcher/app.spec.md` (new scenario after "Opening the researcher composes its surface")
- Modify: `src/IntoChat/Apps/CustomerResearcher/tests.cs` (new scenario after the opening one)
- Modify: `src/IntoChat/Apps/CustomerResearcher/app.json` (`"version": "1.0.0"` → `"1.1.0"`, open description)
- Modify: `src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs:114`
- Modify: `src/DigitalBrain/Mcp/tests/DigitalBrain.Mcp.Tests.Unit/SessionCookieFacts.cs:47`
- Modify: `src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests/PostgresAppSourceFacts.cs:19`
- Modify: `src/Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests/TableWindowToolFacts.cs:25`
- Modify: `src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs:20`

**Interfaces:**
- Consumes: the docking convention from D7 — the shell asks `open` with input `"docked"` and renders the
  answered `surface` in the side panel.
- Produces: for CustomerResearcher, `open` with input `"docked"` composes the surface and answers
  `{id, title, surface}` **without** calling `IWorkspace.EnsureOpenAsync`; any other input keeps opening
  the floating window. App keys are `{brainScope}/apps/{name}` everywhere (`IApp.Key`).

- [ ] **Step 1: Write the failing scenario (spec + test)**

In `app.spec.md`, after the "Opening the researcher composes its surface" section, add:

```markdown
## Scenario: Opening docked answers the surface without a window

Invoking "open" with the input "docked" answers the same composed "Customer Researcher" surface but
opens no window in the workspace: the shell shows it in its side panel instead.
```

In `tests.cs` (the Flutter contracts project is already referenced), add
`using DigitalBrain.Flutter.Workspace;` beside the other usings, and add this scenario **above** the
"Opening the researcher composes its surface" scenario:

```csharp
await Scenario("Opening docked answers the surface without a window", async () =>
{
    await Scripted();
    var workspace = brain.Get<IWorkspace>(appKey[..appKey.IndexOf("/apps/", StringComparison.Ordinal)]);
    var before = (await workspace.Read()).Windows.Count(window => window.Id == "customer-researcher" && window.IsOpen);
    var docked = JsonDocument.Parse(await app.Ask("open", "docked")).RootElement;
    var surface = await brain.Get<ISurface>(docked.GetProperty("surface").GetString()!).Read();
    if (surface.Definition.Title != "Customer Researcher" || surface.Definition.Children.Length == 0)
    { throw new InvalidOperationException("The docked surface is not composed."); }
    var after = (await workspace.Read()).Windows.Count(window => window.Id == "customer-researcher" && window.IsOpen);
    if (after != before) { throw new InvalidOperationException("A docked open opened a workspace window."); }
});
```

It must run before the floating open, which leaves the window open; the before/after comparison keeps
it correct regardless, and verdicts bind by name, so spec heading order does not matter.

In `app.json`: set `"version": "1.1.0"` (a new version makes startup shipping re-verify and re-publish
the bundle) and change the `open` description to
`"Open the researcher window and answer its surface; with input \"docked\", answer the surface only."`.

- [ ] **Step 2: Run the scenario to verify it fails**

The gate runs in the sandbox (the Apps unit suite fakes the runner), so with Part B's shipping fixes in
place run `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost` and read the IntoChat console
log.
Expected: `intochat/customer-researcher stays out: verification failed.` and the sandbox run log shows
`dbtest:fail Opening docked answers the surface without a window	A docked open opened a workspace window.`

- [ ] **Step 3: Implement the docked open and fix the workspace derivation**

The key is `{brainScope}/apps/customer-researcher`; the current fallback takes everything before the last
`/`, which yields `{brainScope}/apps` — not a workspace. Replace the invocation loop and `OpenAsync` in
`behaviors/surface.cs` (lines 20–34) with:

```csharp
await foreach (var invoked in app.Invocations(brain, brain.Stopping))
{ if (invoked.Operation == "open") { await app.Respond(await OpenAsync(invoked.InvocationId, invoked.Input == "docked")); } }
return;

// Docked: the shell renders the surface in its side panel, so no workspace window opens.
async Task<AppResponse> OpenAsync(Guid id, bool docked)
{
    await ComposeAsync();
    var surface = new UiChildRef(UIVocabulary.SurfaceType, appKey + "/surface");
    if (!docked)
    {
        var workspace = appKey[..appKey.IndexOf("/apps/", StringComparison.Ordinal)];
        await brain.Get<IWorkspace>(workspace)
            .EnsureOpenAsync("customer-researcher", "Customer Researcher", WindowReference.For(surface), CancellationToken.None);
    }
    return new AppResponse(id, JsonSerializer.Serialize(new { id = "customer-researcher", title = "Customer Researcher", surface = surface.Name }), null);
}
```

(`app.Invocations` yields `AppInvoked(InvocationId, Operation, Input)`.)

- [ ] **Step 4: Remove the retired UI area**

`AppUiEndpoints.cs:114`:

```csharp
        new[] { "/apps/", "/images/", "/applications/" }.Any(area => name.StartsWith(scope + area, StringComparison.Ordinal));
```

(`/applications/` stays until the built-in Assistant module is deleted in its own task.)

- [ ] **Step 5: Move the test keys to the app key shape**

- `SessionCookieFacts.cs:47`: `BrainScope.Create("someone", "else").Id + "/apps/example"` (still a foreign brain, still refused).
- `PostgresAppSourceFacts.cs:19`: `"workspace/apps/customer-researcher"` and `"workspace/apps/customer-researcher/table"`.
- `TableWindowToolFacts.cs:25`: `"workspace/apps/customer-researcher/table"`.

- [ ] **Step 6: Make the Author prompt's sentence true under install**

`AgentPrompts.cs:20` currently ends "That way most forks are just different settings." Replace with:
`scenarios. Settings are not edits: an installed copy changed only through its settings keeps receiving the publisher's updates.`

- [ ] **Step 7: Run the affected suites and the researcher's gate**

Run:
```
dotnet test src/Modules/Google/Flutter/tests/DigitalBrain.Modules.Flutter.Tests
dotnet test src/DigitalBrain/Mcp/tests/DigitalBrain.Mcp.Tests.Unit
dotnet test src/Modules/Postgres/tests/DigitalBrain.Modules.Postgres.Tests
dotnet test src/Modules/Supabase/tests/DigitalBrain.Modules.Supabase.Tests
dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
Expected: all PASS. Then restart `aspire run` and read the IntoChat console log.
Expected: no `intochat/customer-researcher stays out` line; the sandbox run log shows `dbtest:pass` for
all five checkable scenarios including "Opening docked answers the surface without a window", and the
Marketplace lists Customer Researcher at v1.1.0.

- [ ] **Step 8: Commit**

```bash
git add src/IntoChat/Apps/CustomerResearcher src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter/Shared/AppUiEndpoints.cs src/DigitalBrain/Mcp/tests src/Modules/Postgres/tests src/Modules/Supabase/tests src/Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs
git commit -m "fix(apps): drop the package-key remnants; the researcher opens in its own brain and can be docked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D11: CLAUDE.md describes the real apps model

**Files:**
- Modify: `CLAUDE.md:30-74` (the "The self-programming model" section's package bullet list and the "Install is per brain" bullet)

**Interfaces:** none.

- [ ] **Step 1: Replace lines 32–40 (the package intro and file block)**

```markdown
A user app is an **app neuron** (`IApp`, keyed `{brainScope}/apps/{name}`) in a real brain owned by a
real account. It holds its version history (last 20), settings, connections and verdicts, and contains:

```
app.json         manifest: title, description, icon file, operations, settings, account slots
app.spec.md      the program, in free natural language; "## Scenario: <name>" headings
tests.cs         thin deterministic checks that drive a scratch copy and print dbtest lines
behaviors/*.cs   the implementation: one script per concern
```
```

- [ ] **Step 2: Replace the "Tests are the publish gate." bullet's first two sentences**

```markdown
- **Tests are the publish gate.** `AppVerifyJob` imports the bundle into a scratch copy in the same
  brain and runs `tests.cs` through `ITestScriptRunner` (default: an ordinary sandbox script), which
  drives the copy through real contracts (`IApp`, `IScriptedLLM`, …) and prints one
  `dbtest:pass <name>` / `dbtest:fail <name>\t<message>` (or `dbtest:json <AppScenarioVerdict>`) line
  per scenario. Every `## Scenario:` heading needs a verdict.
```

and replace "`Publish` refuses any revision carrying a spec or tests until its verification is green." with
"`IApp.Publish` refuses any version that is not green; Export likewise."

- [ ] **Step 3: Replace the "Install is per brain" bullet**

```markdown
- **Publish, Marketplace, Install.** An owner publishes a green version; `IMarketplace` (one
  constant-key neuron, readable by every signed-in user) lists published versions. Install copies the
  published bundle into the installer's brain and records its `Origin`; settings and account slots bind
  to the installer's own connections. An installed copy offers "Update available" when its origin
  publishes a newer version, until the copy's program is edited (settings are not edits) — then it is
  simply the installer's own app. Install is the only way an app crosses brains. Each
  `behaviors/*.cs` becomes its own `ICSharpFile` bound to the installed `IApp`; failure isolation is
  per behavior. First-party apps are owned by seeded accounts (`os`, `intochat`): shipped folders
  (`src/IntoChat/Apps/`, the OS's embedded apps) are verified and published in their publisher's brain at
  startup, and a writable development source syncs published versions back to its folder. New brains
  install the OS defaults (`os/settings`, `os/assistant`) through the same Install path.
```

- [ ] **Step 4: Check the file reads as one model**

Run (repo root): `git grep -n "IPackage\|AppScenarioSuite\|app.authoring.json\|IAppVerification" -- CLAUDE.md`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md describes owners, publish, Marketplace and install

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
