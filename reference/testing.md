# Testing

How the DigitalBrain repository (`intochat/os`) organises its tests, how a test gets a host, how CI runs them, and which tests the codebase simplification dropped or rewrote. The plan is [codebase-simplification-2026-10-18-plan](../plans/codebase-simplification-2026-10-18-plan.md), Task 2.1 (taxonomy) and Task 5.1 (this page).

**Evidence date: 18 October 2026. Branch `codebase-simplification-phase2`. Timings are from GitHub Actions runs 39097999099 (PR gate) and 39091514026 (per-assembly durations).**

## Taxonomy

Every test project carries one tier suffix. Architecture rules in `DigitalBrain.Architecture.Tests.Unit` enforce it.

| Tier | Contents | Runs | Enforced by |
| --- | --- | --- | --- |
| `*.Tests.Unit` | No host, no network, no sleeps. | PR gate | `TestTierRules.UnitTierStartsNoHost` |
| `*.Tests.Integration` | One shared host per assembly: a `BrainHostFixture` registered with `[assembly: AssemblyFixture]`. Facts that need their own host carry `[Trait("host", "own")]`. | PR gate | `TestTierRules.IntegrationTierUsesTheAssemblyFixture` |
| `*.Tests.Hosting` | The Aspire application model only, through `DigitalBrain.Aspire.Testing`. Nothing starts. | PR gate | tier suffix rule |
| `*.Tests.E2E` | The full product on the Aspire AppHost. | nightly | tier suffix rule |
| `*.Tests.Browser` | Playwright against the Aspire AppHost. The only tier that references Playwright. | nightly | `TestTierRules.BrowserTierOwnsPlaywright` |

- `TestTierFacts.AModuleTestProjectCarriesATierSuffix` refuses a module test project without one of these suffixes.
- `TestShardFacts` holds every PR-gate project to exactly one CI shard.
- Building with `-p:DigitalBrainNightly=false` excludes the E2E and Browser projects. The PR gate builds that way.

## The fixture pattern

Starting a host is the expensive part of an integration test. Each integration assembly starts one host, and each fact isolates itself in a fresh person's brain:

```csharp
[assembly: AssemblyFixture(typeof(TimeHost))]

public sealed class TimeHost : BrainHostFixture
{
    protected override TestBrain Configure(TestBrain brain) => brain.WithModule<TimeModule>().WithoutHttp();
}

public sealed class ClockFacts(TimeHost host)
{
    [Fact]
    public async Task ATickReachesItsOwner()
    {
        var ct = TestContext.Current.CancellationToken;
        var person = await host.PersonAsync("owner", ct);
        // await using var probe = await host.ObserveAsync<Ticked>(clock, person, ct);
        // act as the person, then assert on the probe
    }
}
```

- `PersonAsync(name)` creates a principal, an account and a brain. The name is a prefix made unique within the host.
- `ObserveAsync<T>` subscribes a probe as the owner. The host releases it if the fact does not.
- `WithoutHttp()` skips the HTTP surface for facts that only talk to grains.
- The in-process target retries start-up with a fresh port pair (up to three attempts) when a port is already taken.
- Hosts with their own collaborators (`FakeModelServer`, `TokenEndpointStub`) start them in `InitializeAsync` before the base call and stop them after the base `DisposeAsync`.

## Consuming the packages

The four testing packages are published to the GitHub Packages feed `https://nuget.pkg.github.com/intochat/index.json`:

- `DigitalBrain.Testing`: the in-process `TestBrain`, one host per assembly (`BrainHostFixture`), probes and fakes
- `DigitalBrain.Testing.Aspire`: `TestBrain` on an Aspire AppHost (`AspireTarget<TAppHost>`)
- `DigitalBrain.Testing.Playwright`: Playwright browser sessions against the Aspire target
- `DigitalBrain.Aspire.Testing`: Aspire application-model checks without running anything

Until `os` is public, restoring from the feed needs a GitHub token with the `read:packages` scope. The `DigitalBrain.Testing` README shows a `nuget.config` that reads the token from an environment variable.

Publishing belongs to the deployment workstream's `publish.yml`, which this work does not create. It will run `dotnet nuget push artifacts/packages/*.nupkg --source https://nuget.pkg.github.com/intochat/index.json --api-key $GITHUB_TOKEN --skip-duplicate`.

Consumer documentation for the four packages is in their READMEs: `DigitalBrain.Testing`, `DigitalBrain.Testing.Aspire`, `DigitalBrain.Testing.Playwright` and `DigitalBrain.Aspire.Testing`.

## Nightly workflow

`.github/workflows/e2e.yml` runs at 03:00 UTC:

- `e2e` builds the solution, warms the container image caches, and runs the OS and Framework E2E projects.
- `browser` builds with `-p:DigitalBrainNightly=true`, runs `playwright.ps1 install --with-deps chromium`, and runs the Browser projects.
- `nightly red` opens or comments on one issue per day, labelled `nightly`, when either job fails. A red nightly blocks tags, not merges.

## CI shape

`.github/workflows/ci.yml` builds once with `-p:DigitalBrainNightly=false`, archives the test modules per shard, then runs the shards in parallel. Shard membership lives in `.github/test-shards.json`.

| Shard | Assemblies (current `test-shards.json`) | Wall time, run 39097999099 | Summed assembly durations, run 39091514026 (contention-bound; wall time per shard is lower) | Slowest assembly |
| --- | --- | --- | --- | --- |
| `unit` | Architecture, Aspire.Hosting, Client, Deployment, Modules.Microsoft.Playwright, Modules.Microsoft.Roslyn, Modules.Qdrant and Modules.Tools `.Tests.Unit`, plus every `*.Tests.Hosting` | 2:21 | 1:45 | `DigitalBrain.Architecture.Tests.Unit` 1:15 |
| `integration-a` | `DigitalBrain.Modules.Microsoft.CSharp.Tests.Integration`, `DigitalBrain.Modules.Salesforce.Tests.Integration`, `DigitalBrain.Framework.Tests.Integration`, `DigitalBrain.Modules.Equifax.Tests.Integration`, `DigitalBrain.Modules.Monnet.Tests.Integration`, `DigitalBrain.Modules.Mcp.Tests.Integration`, `DigitalBrain.Modules.ClickHouse.Tests.Integration` | 3:04 | 3:27 | `DigitalBrain.Modules.Microsoft.CSharp.Tests.Integration` 2:38 |
| `integration-b` | `DigitalBrain.Authority.Tests.Integration`, `DigitalBrain.Modules.Apps.Tests.Integration`, `DigitalBrain.Modules.Microsoft.Aspire.Tests.Integration`, `DigitalBrain.Client.Orleans.Tests.Integration`, `DigitalBrain.Modules.Twilio.Tests.Integration`, `DigitalBrain.Modules.Time.Tests.Integration`, `DigitalBrain.Modules.RiskSeal.Tests.Integration`, `DigitalBrain.OS.Tests.Integration`, `DigitalBrain.Modules.Microsoft.Windows.Tests.Integration` | 2:09 | 3:11 (without Authority) | `DigitalBrain.Modules.Apps.Tests.Integration` 2:04 |
| `integration-c` | `DigitalBrain.Modules.AI.Tests.Integration`, `DigitalBrain.OS.Tests.Unit`, `DigitalBrain.Modules.Postgres.Tests.Integration`, `DigitalBrain.Modules.Microsoft.GitHub.Tests.Integration`, `DigitalBrain.Modules.Microsoft.Playwright.Tests.Integration`, `DigitalBrain.Modules.Flame.Tests.Integration`, `DigitalBrain.Modules.Google.Gmail.Tests.Integration`, `DigitalBrain.Mcp.Tests.Integration`, `DigitalBrain.Modules.ArtCraft.Tests.Integration`, `DigitalBrain.Modules.Microsoft.Orleans.Tests.Integration`, `DigitalBrain.Modules.Supabase.Tests.Integration` | 2:15 | 4:49 | `DigitalBrain.Modules.AI.Tests.Integration` 1:59 |
| `integration-d` | `DigitalBrain.Modules.Flutter.Tests.Integration`, `DigitalBrain.Testing.Tests.Integration`, `DigitalBrain.Modules.Circles.Tests.Integration` | 1:22 | 2:37 | `DigitalBrain.Modules.Flutter.Tests.Integration` 1:32 |

The other jobs in run 39097999099 took 6:27 (build) and 2:03 (format). `DigitalBrain.Authority.Tests.Integration` did not exist yet in run 39091514026, so it has no summed duration.

### Measured before and after

| | Before | After |
| --- | --- | --- |
| Shape | one job, every test in sequence | build once, five shards in parallel |
| Wall time | 18:30 | 9:36 critical path (run 39097999099) |
| Failures | 17 | 0 |

The plan's 5:00 target was not reachable on the 2-vCPU hosted runners. The build alone takes 6:02, and the slowest module takes 2:26.

## Dropped or rewritten tests

Collected from the task reports of the simplification (PR bodies 1a, 2c to 2h, 4, and the flake fixes). Folder renames to a tier suffix kept every fact name and are not listed.

| Project | Fact | Change | Reason |
| --- | --- | --- | --- |
| Framework and Platform tests (six fact files) | observer facts | rewritten to `Nudge` plus `source.Read(since, 100)` through a `NudgeReader` helper, polled with `TestWait` | Task 1.4: signals became one-way nudges, so observers read the log instead of receiving the signal |
| Framework tests | `ASlowObserverCoalescesNudgesAndStillReadsEverything` | renamed | its subject became nudge coalescing |
| Framework tests | forged-nudge facts | assert that the observer recorded nothing after a bounded 500 ms wait, instead of `UnauthorizedAccessException` | a one-way nudge cannot return an exception to the sender |
| Modules.Microsoft.CSharp tests | `RunFactsFacts` | the `RunJournal` double now wraps the host's `ISignalJournal` | Task 1.6: the old double had no part log, so probes could not read run facts back (21 facts failed) |
| Modules.Microsoft.Playwright tests | 11 facts in `PageToolsFacts` and `PlaywrightNeuronFacts` | kept on their own `TestBrain`, tagged `[Trait("host", "own")]`; 2 others moved to the shared host | Task 2.6: each registers a scripted browser provider, which is host-wide DI |
| Modules.Microsoft.Playwright tests | `AppPageFacts`, `ManagedBrowserFacts`, `VisibleBrowserFacts` | moved to `*.Tests.Browser` | Task 2.6: real browser, nightly tier |
| Modules.Flutter tests | facts on the `FlutterHostFixture` collections | moved to one assembly host; `FlutterHostFixture` deleted | Task 2.7e: one host per assembly |
| 18 former legacy module test projects | owner-scoped facts | rewritten to run as a fresh `host.PersonAsync` person | Task 2.7f: facts share one host, so each isolates itself in its own brain |
| Modules.Flutter.Tests.Integration | `SpaceFacts.AFailedAppReadIsRetriedByTheNextComposition` | drops the `SpaceWatcher` hosted service, drives `ISpace.Rebuild()` explicitly, and waits out the activation composition | flake fixes: the watcher raced the fact; watcher-to-space wiring was never its subject |
| Client.Orleans.Tests.Integration | own-host facts in `SubscriptionLifetimeFacts` | moved onto a `FastBrain` helper (`WithFastSubscriptions`) | flake fix 3: deterministic subscription timing |
| Framework.Tests.Integration | `LocalObserverFacts.AFlushIsNotHeldByAnObserverThatLeavesWithNudgesQueued` | added | flake fix 2: reproduces the hub bug behind the `ReactFacts` timeout |
| OS.Tests.E2E, Framework.Tests.E2E | `AssemblyInfo.cs` (`Parallelization(Mode = None)`) and the OS `testconfig.json` | deleted | Task 2.9: E2E hosts moved to fixtures and collections |
| OS tests | `LocalDesktopAccountFacts` | deleted | Task 4.3: the Windows local desktop account was removed |
| OS tests | `OsBootFacts.ConnectingAnExistingWorkspaceInstallsAMissingCustomerResearcher` | rewritten as `ConnectingAnExistingWorkspaceRequiresNoVendorAppAndTrustsTheConfiguredPublishers` | Task 4.3: the OS no longer installs the intochat app |
| OS tests | `OsShippedAppFacts` | expected list drops `intochat/customer-researcher` (15 to 14) | Task 4.3: same |
| OS tests | `OsBootFacts.AFreshBrainHasTheOsAppsInstalledFromTheFeaturesFolder` | asserts customer-researcher is not installed | Task 4.3: same |
| OS tests | `VendorAppFacts.EveryShippedProgramCompilesAgainstCurrentContracts`, `FeatureCompileFacts.EveryFeatureScriptCompilesInTheRealSandbox` | skip `intochat/sv-loans` | Task 4.3: it references SV module contracts that the OS no longer loads |
| OS tests | `OsCatalogFacts.InProcessModulesIsModulesMinusTheContainerBackedOnes` | Windows is absent from `Modules`; `WithWindowsEdge()` adds it | Task 4.3: Windows left `BuiltIn()` |

No fact was deleted in Tasks 2.7d, 2.7e or 2.7f.
