# Codebase simplification: testing performance, structure and the signal substrate

Written 2026-10-18 on the `codebase-simplification` branch of `intochat/os` (master `f812121d1`, PR #185 merged). This is the design document produced by the brainstorm; the executable plan with checkbox tasks follows it as a separate file once the open decision in section 9 is settled.

Evidence class: source reading, the CI log of run 39069469722, Microsoft Learn Orleans and Aspire guidance, and two locally timed test runs. No product was run, no files in `os` were changed.

## 1. Intent

Make `intochat/os` a runtime worth open-sourcing and a repository that is fast to work in:

- a PR pipeline measured under 5 minutes on `ubuntu-latest`;
- end-to-end scenarios (sign in, land on the workspace, connect a Google account) that run in milliseconds on a warm in-process host, in parallel;
- a testing framework that is small enough to publish as NuGet packages;
- a project structure with no product-specific code, so the public flip is a visibility change and not a cleanup.

The user's instinct that "something is fundamentally wrong" is confirmed, and it is not in the tests. Section 3 names it.

## 2. Today's numbers

CI run 39069469722 (last run on PR #185, single `ubuntu-latest` job):

| Step | Wall time |
|---|---|
| Checkout, setup-dotnet | 0:21 |
| Free disk space | 1:38 |
| Restore NuGet cache (actions/cache) | 1:54 |
| `dotnet restore` | 0:25 |
| `dotnet format --verify-no-changes` | 0:42 |
| `dotnet build -c Release` | 4:06 |
| `dotnet pack --no-build` | 0:11 |
| `dotnet test -p:DigitalBrainE2E=false` | 8:38 |
| Total | 17:56 |

Tests: 2,102 run, 2,061 passed, 17 failed, 24 skipped. Locally the same set runs in about 60 seconds because the machine has many more cores; the runner has two.

Slowest assemblies on the runner (assemblies run in parallel, so these overlap):

| Assembly | Tests | Time |
|---|---|---|
| DigitalBrain.Modules.Microsoft.CSharp.Tests | 220 | 2:22 |
| DigitalBrain.Modules.Apps.Tests | 264 | 1:59 |
| DigitalBrain.Platform.Tests.Unit | 248 | 1:50 |
| DigitalBrain.Modules.AI.Tests | 209 | 1:39 |
| DigitalBrain.Modules.Flutter.Tests | 185 | 1:20 |
| DigitalBrain.Architecture.Tests | 62 | 1:12 |
| DigitalBrain.OS.Tests.Unit | 62 | 1:10 |
| DigitalBrain.Modules.Circles.Tests | 33 | 0:43 |
| DigitalBrain.Testing.Tests | 44 | 0:35 |

Everything else is under 25 seconds.

### The 17 failures, by cause

| Cause | Tests | What it is |
|---|---|---|
| No Playwright browsers on the runner | 11 in `Modules.Microsoft.Playwright.Tests` | Infrastructure. `Executable doesn't exist at ~/.cache/ms-playwright/...`. These are browser tests mislabelled as module tests. |
| Real regression | 2 in `Modules.Microsoft.GitHub.Tests.Hosting` (`OAuthAndWebhookSecretsAreProjectedOnlyWhenTheirFeaturesAreConfigured`, oauth=false cases) | The hosting projection emits the OAuth secret parameters when OAuth is not configured. Product bug in `GitHubModuleHosting`, introduced with #173. |
| Windows-only file locking assumption | 1 in `Platform.Tests.Unit` (`BrainRecoveryFacts.AFailedAppendAcknowledgesNothingAndRefusesFurtherWritesUntilReopened`) | Opens the log with `FileShare.Read` to force an `IOException`; Linux allows the write. The test needs an injected failure, not an OS lock. |
| Host cleanup race in the shared harness | 1 in `Client.Orleans.Tests.Unit` (`SiloHostedBrainClientReceivesPublication`) | `Test session cleanup failed at 'host': An attempt was made to transition a task to a final state when it had already completed`. Harness bug in host disposal. |
| Architecture baseline drift | 1 in `Architecture.Tests` (`ConfigurationKeyLiteralsStayWithinTheOwnerBaseline`) | Three files use configuration-key literals outside `ConfigurationKeyOwners.json`: two Platform storage facts and `HostedRuntimeOptions.cs`. |
| Address already in use | 1 in `Modules.Microsoft.CSharp.Tests` (`BrainRuntimeNeuronFacts.AReminderEnsuresTheSessionAgainWhenTheHostLostIt`) | The `127.0.0.1:5099` in that file is only a string on a fake `IServer`; nothing binds it. The collision comes from something else in that fact's host start and needs a local reproduction. |

## 3. The fundamental problem: the signal delivery substrate

The neuron, signal and synapse concepts are sound. The delivery layer under them is the main source of complexity in the codebase, and it is the reason tests need a full host per fact.

**What it is.** Signals are delivered through plain Orleans `IGrainObserver` observers managed by `ObserverManager` with a 5-minute lease (`src/DigitalBrain/Neurons/INeuronObserver.cs`, `Framework/.../ObserverOptions.cs`). Microsoft Learn documents observers as best-effort: no delivery guarantee, and the application must build its own reliability. The product needs durable, ordered, reactivation-safe delivery, so the code built that reliability by hand:

- an `ISignalJournal` that attaches pending signals to the next storage write through an `AsyncLocal` side channel (`Framework/.../SignalJournal.cs:24-60`, `Neuron.cs:98-117`);
- two storage decorators stacked on Orleans grain storage (`InstanceRegistration` over `BrainGrainStorage` or memory), coupled through that side channel;
- three in-process delivery paths running side by side in `Neuron.Notify` (`Neuron.cs:85-90`): a process-wide type-filtered `SiloSignalBus`, a `LocalSignalHub` that scans every local subscription linearly on each publish, and `ObserverManager.Notify` for remote clients and observer grains;
- client lease loops that re-call `Watch` every minute and compare the activation id (`Client.Orleans/SignalSubscription.cs:64-77`), and grain timers with `KeepAlive` that pin observer grains in memory;
- per-neuron nudge, catch-up and renewal logic, most visibly in the 1,232-line `BrainRuntimeNeuron`.

**Why it hurts.** `OnSignalAsync` is not `[OneWay]`, so a publisher's turn waits on every observer. When an observer calls back, that is the A→B→A deadlock `CLAUDE.md` warns about. The repo carries about 100 concurrency attributes (68 `AlwaysInterleave`, 22 `OneWay`, 5 `Reentrant`, 4 `MayInterleave`, 2 `StatelessWorker`, by word match on 2026-10-18; an earlier draft said 188) plus "off-turn" tasks, patching that hazard case by case. One publish to a sandboxed program costs about 4 grain hops and 5 to 6 serializations across two serializer families (Orleans wire, then JSON buffered inside Orleans state). A neuron's first write adds an instance-directory hop, a type-registry hop, sometimes a management-grain scan, and a second full publish through `IKernelAnnouncer`.

**What the fix looks like.** Make one durable log the single source of truth. Either subscriptions pull from a journal watermark on a `[OneWay]` nudge, or an Orleans persistent stream provider is written over the part log (a rewindable queue adapter with `StreamSequenceToken`). Either way: `OnSignalAsync` becomes one-way, the nudge and renewal machinery goes, the activation-id reconnect check goes, the three in-process paths collapse into one indexed hub, and the deadlock surface closes. What breaks: the `Watch` contract and its Dart mirrors, at-least-once and ordering semantics that today are implicit, and persisted formats (`BrainRuntimeNeuron` buffers JSON in state). Covering tests: Framework `WatchCycleFacts`, `FilteredWatchFacts`, `LocalObserverFacts`, `PublishManyFacts`, `SignalDeliveryContextFacts`, `TraceFacts`; CSharp `HangingWatchFacts`, `FilteredSubscriptionFacts`; AI `InterleavingFacts`.

Smaller cuts that stand alone: make `OnSignalAsync` one-way now; index `LocalSignalHub` by source and fold `SiloSignalBus` into it; move instance registration out of the storage decorator into an explicit `Save`; keep typed signals in `BrainRuntimeNeuron` state instead of JSON; delete the duplicate `WatchStream` (`Client/Watching` and `Client.Orleans/Watching`, 71 lines each); cache the three services `Neuron` resolves on every publish.

## 4. Why tests are slow (and what is not the cause)

**Measured.** A cold in-process brain (`TestBrain.Create().StartAsync()` through `InProcessTarget`) takes about 2 to 2.5 seconds: JIT, Orleans silo lifecycle, Kestrel. A warm restart in the same process is well under 1 second. There are no fixed waits in the harness.

**The cause is count, not cost.** Nearly every fact starts its own host: roughly 249 start sites in CSharp.Tests, 167 in Flutter.Tests, 122 in Platform.Tests.Unit, 120 in Apps.Tests, 109 in AI.Tests. Each start composes the full platform, binds Kestrel even when the fact never uses HTTP, enables OpenTelemetry tracing, and runs module warm-ups (`LlmWarmupHostedService`, Roslyn `WorkspaceWarmup`, `SpaceWatcher`, `AppMenuHost`). Shared fixtures exist in only three places: `FlutterHostFixture` (collection), `GmailBrain` (collection) and the E2E `HostCollections`. No assembly fixture exists anywhere.

**What is not the cause.** No non-E2E project uses Docker, Testcontainers or a real browser. All fake HTTP servers and the silo bind port 0 or free ports. There is no fixed-port collision between assemblies. Explicit sleeps are few: `Task.Delay(1500)` plus `Thread.Sleep(1500)` in `RuleJudgingFacts.cs:211,219`, 300 ms delays in `SandboxSessionFacts` and `BrainRuntimeNeuronFacts`, a 20 ms poll in `TestWait.UntilAsync`.

**Time control.** Production uses `TimeProvider` in about 50 files, but the harness offers no time hook. `Microsoft.Extensions.TimeProvider.Testing` is referenced by only two test projects; Apps and Salesforce carry hand-written clocks. `InProcessTarget.cs:98-99` notes that placement retries never fire under a fake provider.

**Isolation in one process.** Brains are keyed by `BrainScope(accountId, brainId)`; kernel grains are keyed per brain. Static state in Framework is type caches, weak tables and flow-scoped `AsyncLocal`s, all safe. Two things are cluster-global and must not be mutated by parallel facts: `IManagementGrain(0).GetActiveGrains`, which sees other brains, and `IMarketplaceCatalog.Key`. Deployment-global configuration (identity posture, capture on/off, environment, `FakeModelServer` scripts, which are host-global today) cannot be shared, so each composition variant needs its own assembly.

## 5. The end-to-end tier today

Each E2E collection boots the whole AppHost through `DistributedApplicationTestingBuilder`: two OS silos, two YARP fronts, the MCP server, Azurite, Postgres, a second Postgres for Supabase, ClickHouse, Qdrant (off in Reference), the Aspire dashboard, and images built from Dockerfiles: the Flutter shell, the C# sandbox, four ArtCraft images, the SystemOne adapter when local AI is on, and a Playwright `run-server` container. `e2e.yml` warms only the shell and sandbox images. Collections run serially (`[assembly: Parallelization(Mode = None)]` and `testconfig.json parallelMode: none`), and `dotnet test` runs the two E2E projects one after another. There are about seven boots per run at 1 to 3 minutes warm and up to 15 minutes cold, so boots dominate and facts are cheap.

Of the 21 E2E facts, only `ShellPersistenceFacts` and `ShippedAppFacts` need the shell image and a browser, only `SelfImproveFacts` needs the sandbox and Docker candidate host, only the packaging fact in `Aspire.Hosting.Tests.E2E` genuinely needs Aspire and Docker, and the Framework telemetry facts need an OTLP sink rather than the dashboard. Everything else needs HTTP, Orleans and the model fake.

`AspireTarget` rejects `plan.Modules` and `plan.Services`, so no fake can be injected on that target. `InProcessTarget` accepts both.

## 6. Authentication and the "Google login" scenario

There is no Google sign-in for users. User login is a password cookie flow: `/identity/register`, `/identity/login`, `/identity/session`, `/identity/session/brain`, `/identity/logout`, `/identity/brains` (`Platform/Identity/IdentityEndpoints.cs:28-35`), cookie set in `IdentityHosting.cs:50`, claims read by `AccountSession.ResolveCaller`. The Flutter client posts to these endpoints (`ui_client.dart:114,150`).

Google OAuth exists only as the connection flow for connectors such as Gmail: `POST /connections/{id}/login` → `OAuthLoginFlow.StartAsync` (PKCE, state) → Google authorize URL → `GET /connections/oauth/{connector}/callback` → `OAuthTokenExchange`. The token endpoint is overridable per connector through `DigitalBrain:Connections:TokenEndpoints:{connector}`, which is how `TokenEndpointStub` is injected in `Platform.Tests.Unit` and `Gmail.Tests`.

A fast in-process scenario for both existing flows needs: one warm host, a cookie-keeping `HttpClient`, `TokenEndpointStub` promoted into the shared harness, and `OAuthLoginFlow.PublicOrigin` pointing at the in-process URL. Expected cost after the warm host: tens of milliseconds per scenario. Real "sign in with Google" would be a new product feature (an external OIDC handler) plus stubs for discovery, JWKS and the token endpoint. This document assumes the connector flow is the scenario to cover first; adding user sign-in with Google is a product decision outside this plan.

## 7. Tests as neurons

Evaluated and not recommended as the test-authoring model. Assertions would run inside non-reentrant grain turns with no xunit stack and grain-call timeouts; test code would ship in the product as a new module and grain type; a scenario neuron still needs a real principal because provenance is kernel-stamped; isolation needs are unchanged (one brain per scenario); and the HTTP, cookie and Flutter contract layer, where most end-to-end value lies, is outside the brain. `SignalProbe<T>` and `PulseModule` already observe real signals from outside without changing the product.

The idea that survives: a production self-check canary, a neuron on a reminder that runs a few smoke scenarios in a live brain and publishes a result signal into telemetry. That is a product feature with its own proposal, and it should reuse the same scenario code as the xunit facts through `ITestBrain`.

## 8. Open-source purity and project structure

**No secrets, customer names or Azure resource names in code.** The only Azure names are in `deploy.yml`, which the deployment workstream deletes.

**Things the split spec misses.** `DigitalBrain.Mcp.csproj:31-34` references the four SV Contracts projects; `DigitalBrain.OS.csproj` wildcard-references every module runtime project under `DigitalBrain.Modules/**` on purpose, so the compiler checks that `OsCatalog` names every module in the repo; the consequence is that the SV runtime projects (commented out in `OsCatalog.cs:33-37`) and the Windows module still ship inside the `DigitalBrain.OS` package until they are moved or excluded; `OsApps.cs:41` requires `OsApp("intochat","customer-researcher")` at boot and `OsWorkspaceRoot.cs` trusts the `intochat` publisher; `DigitalBrain.slnx` carries the SV entries.

**Branded defaults in core.** Claim types `intochat.account` and `intochat.brain`, cookie `intochat.session`, data-protection app name `IntoChat.v1` and container `intochat-protection-v1`, the `intochat-identity-directory` store name, hosted-workspace claims and HTML text, `Named(..., "intochat")` in the AppHost, the Flutter login brand text. Renaming claims or the data-protection name invalidates existing cookies and keys and is a persisted-format change that needs explicit coordination.

**Hosted-cloud code in the public Platform layer.** `Platform/Hosting/*` (hosted workspace grants, cloud-user and cloud-session claims, runtime management, machine authentication, hosted recovery) exists only for the private cloud, and `Platform.csproj` depends on `Azure.Extensions.AspNetCore.DataProtection.Blobs`.

**OS-specific code.** `Modules/Microsoft/Windows` (TPM custody, machine id under `%LOCALAPPDATA%`, case-insensitive path roots that are wrong on Linux) is registered unconditionally in `OsCatalog.cs:28`. Flutter hosting creates a Windows-only local desktop account (`ShellHostingExtensions.cs:140-147`), and a test hard-codes the user name `vlad`. There is no macOS or Linux-specific code.

**Naming.** "Platform" means three things: the private repo `intochat/platform`, the public assembly `DigitalBrain.Platform` (identity, storage, secrets, connections, integrations, compute, hosting; 111 files), and the `DigitalBrain.Framework.Platform.*` namespace. Most of `DigitalBrain.Platform` is genuine runtime (per-brain identity, storage, secrets, connections). Rename the public layer before v0.1.0 is published; after that it is a breaking change.

**Project count.** About 137 projects, 105 of them under Modules across 26 modules. The four-way split (Contracts, Module, Aspire.Hosting, Deployment) is justified only for AI, Flutter, Apps, Roslyn and CSharp, whose Contracts are consumed elsewhere. `Qdrant.Contracts` has no code; four `Deployment` projects are 33 to 115 lines; `Aspire.Client`, `Aspire.Testing` and `Platform.Contracts` are at most 55 lines each; about 15 Contracts projects are under 150 lines. Folding these removes 25 to 30 projects and a proportional share of the 4-minute build.

**Dead or stale.** `LocalRuntimeBoundaryFacts.cs` asserts the absence of namespaces that no longer exist; `aspire.config.json` points at an AppHost that does not exist; `Flutter/design-prototype/`; `TestResults/` and `artifacts/` at the repo root.

## 9. Decisions

Decided in this document (the user's calls are marked; the rest are mine and can be overridden):

1. **Taxonomy by project suffix, enforced in `Directory.Build.props` and by architecture tests.** `*.Tests.Unit`: no host, no network, fake time. `*.Tests.Integration`: one shared in-process host per assembly, facts isolated by brain. `*.Tests.E2E`: Aspire target, containers, nightly. `*.Tests.Browser`: Playwright, nightly. `*.Tests.Hosting` stays as the model-only Aspire composition check. Existing `*.Tests` module projects are renamed into the scheme. The 11 Playwright module tests become `Modules.Microsoft.Playwright.Tests.Browser`. Tiers are separate projects, not test categories inside one project, because the build conditions and the assembly fixture are per project; a module whose tests all need a host simply becomes `*.Tests.Integration` with no `Unit` sibling. The extra test projects this creates are offset by the production-project folding in item 8.
2. **One warm host per assembly** through an xunit v3 assembly fixture over `InProcessTarget`, with a slim mode that skips Kestrel and OpenTelemetry for facts that never use HTTP. Facts get a fresh person and brain each. Deployment-global variants (Production, CaptureOff, router overrides) get their own assemblies. `FakeModelServer` becomes scriptable per brain.
3. **The PR-gate end-to-end boundary is the wire API the Flutter shell consumes**, driven by `HttpClient` with the C# wire records, plus a contract check that the Dart mirrors match. Browser and Flutter suites run nightly.
4. **Shared fakes move into the published harness**: `TokenEndpointStub`, `FakeCandidateHost`, the fake `IBrowserSessionProvider`, an in-memory OTLP exporter and in-memory data-protection keys go into `DigitalBrain.Testing` or module-owned testing packages. The `WithOperatingSystem()` entry that composes `OsCatalog.Modules` lives in the internal `DigitalBrain.OS.Testing`, not in a published package, so published testing packages never depend on module packages.
5. **Published testing packages**: `DigitalBrain.Testing`, `DigitalBrain.Testing.Aspire`, `DigitalBrain.Aspire.Testing`, `DigitalBrain.Testing.Playwright`. `DigitalBrain.OS.Testing` stays internal. Module packages wait for the private-module move, as the split spec says. Versioning and feeds follow the deployment workstream; this plan only adds packages to what `publish.yml` and `release.yml` pack and does not change their semantics.
6. **CI shape**: one build job that publishes test binaries as an artifact; a test matrix sharded by measured assembly time (about four shards); restore cache keyed on `Directory.Packages.props` and `global.json`; format check in its own job; pack validated once; the disk-free step removed from the PR job because the PR job builds no containers. Timing per job goes in the PR body from a real run. The 5-minute target is the critical-path wall time of the whole PR pipeline (checkout to last shard green) with a warm restore cache; the cold-cache number is reported alongside and is not the target. Build time is therefore on the critical path, which is why the project folding in item 8 is part of this workstream and not a nicety.
6a. **Nightly tiers are release-blocking by convention.** A red nightly E2E or Browser run opens an issue and blocks cutting the next tag until green or triaged; it does not block PR merges. Nightly runs on `ubuntu-latest` with the Docker image warm-ups extended to the ArtCraft images. The PR gate carries the wire-level scenarios and the Dart mirror contract check, so the only coverage that moves to nightly is browser behaviour, container packaging, self-improve and the cross-host cookie and Postgres canaries.
7. **The 17 failures are handled by the refactor, not patched**: Playwright tests move tiers; the GitHub hosting regression is fixed in the product; the recovery fact injects its failure through an abstraction; the cleanup race is fixed in the harness; the configuration-key baseline is updated deliberately; the address-in-use fact is reproduced locally before any change.
8. **Structure**: the `OS.csproj` wildcard stays for its compiler check, with the SV modules moved to platform before v0.1.0 or excluded from the glob until then; `Mcp` loses its SV Contracts references; the Windows module becomes an opt-in edge module and the Windows local-account code leaves Flutter hosting; tiny projects fold as listed in section 8; dead items are deleted; the public `DigitalBrain.Platform` layer is renamed before v0.1.0 (name to be chosen in the plan; candidates `DigitalBrain.Authority`, `DigitalBrain.Host`); hosted-cloud code in `Platform/Hosting/*` and the Azure data-protection dependency go behind an extension point inside `os` in this workstream (an `IHostedWorkspaceProvider`-style seam with the Azure implementation as a separate optional package); physically moving that code into `intochat/platform` belongs to the repository-split and deployment workstreams once platform consumes os packages, and is not sequenced here; branded defaults become configurable with the old values kept where persisted state depends on them.
9. **Tests are not neurons.** A self-check canary is a separate product proposal.

**Decided by the user on 2026-10-18.**

10. **The signal substrate rewrite is in scope and goes first.** One durable log is the single source of truth; delivery is a one-way nudge with pull from a watermark, or an Orleans persistent stream provider over the part log. Everything else (shared-host harness, scenario tests, CI sharding, structure) is built on the new delivery model, so the harness is not written twice against old lease and renewal machinery. The rewrite is the first track in the plan and gates the rest.
11. **Hosted state must survive.** Every persisted-format change (claims, cookie and data-protection names, `BrainRuntimeNeuron` state, part-log record shapes, instance-directory layout) ships with dual-read code, a migration step and a staged rollout across PRs, following `CLAUDE.md`: never wipe user state, never replace custody keys, coordinate persisted formats explicitly. Consequence: the substrate track must read today's journal and watermarks unchanged and write the new shape alongside, with a cut-over PR that only flips the writer once a release has run with dual-read in production. Branded defaults stay as the stored values and become configurable, with the brand only in configuration.

**Grilled and approved by the user on 2026-10-18.**

12. **No hosted state must survive before v0.1.0.** The deploy workflow mounts no volume and production is not proven; "must survive" is a rule that starts at v0.1.0. The versioned reader and dual-read discipline are built from the first substrate PR, but no migration is spent on pre-v0.1.0 state.
13. **Migration mechanism**: in-process at startup. Part-log segment headers carry a format version; the reader handles both; the writer flips by configuration one release later. The export endpoint stays as the manual escape hatch. On Azure Container Apps the part-log directory is an Azure Files mount, which the deployment workstream must add; this plan records the requirement.
14. **Substrate shape**: pull on nudge. The subscriber keeps a watermark; `OnSignalAsync` becomes `[OneWay]` and carries no payload; the subscriber reads from the brain log. Orleans persistent streams are the fallback if cross-silo fan-out proves hard.
15. **Licence stamp**: keep MIT on contracts, client and testing packages; remove the stamp from runtime packages until the runtime licence is decided; record the decision in the handbook.
16. **Google sign-in is out of scope.** Password login plus the Gmail connector OAuth flow is the scenario.
17. **Multi-silo**: the pull-on-nudge design assumes multiple silos with per-brain log ownership from the start; the PR gate tests one silo, the nightly Aspire tier tests two.
18. **Rename `DigitalBrain.Platform` to `DigitalBrain.Authority` now**, before v0.1.0, and tell the deployment workstream the new package id.

## 10. Non-goals and anti-goals

- No persisted-format change without a migration and a dual-read release first.
- Not changing `publish.yml` or `release.yml` semantics (VERSION guard, GHCR images); the deployment workstream owns them.
- Not making the 17 failing tests pass as they are.
- Not adding user sign-in with Google; the connector OAuth flow is the covered scenario.
- Not running the product locally; measurements come from CI runs and single-fact local timings.
- A failure mode to avoid: reaching 5 minutes by dropping real coverage. Every dropped or rewritten test is listed in the plan with the reason.

## 11. Constraints carried from the prompt

One PR per step; explicit-file commits; never push master or tags, prepare commands and stop; LSP before code changes; warnings are errors; nullable on; central package versions; kill any local command over 5 minutes and report the breakdown; brainstorming, writing-plans, then subagent-driven development with Opus subagents.

## 12. What is left to the builder

- Shard composition for the test matrix, from measured timings after the shared-host change.
- The exact `InProcessTarget` slim-mode switch and how `RestartAsync` behaves under a shared host.
- Which in-memory replacement each of Postgres, ClickHouse and Supabase needs when the full OS composition runs in process, or whether those modules are excluded by a fact category that opts back in.
- The new name of the public Platform layer.
- Whether the Flutter shell ports and ArtCraft ports stay as production constants or move to configuration.

## Sources

- Repository split spec and plan: `plans/repository-split-2026-10-17.md`, `plans/repository-split-2026-10-17-plan.md`.
- Prompts brief: `clients/intochat/projects/briefs/repository-split/2026-10-17_prompts-deploy-and-testing.md` in the agentic-os workspace.
- Orleans observers, streams, broadcast channels and testing guidance on Microsoft Learn (learn.microsoft.com/dotnet/orleans).
- CI run `https://github.com/intochat/os/actions/runs/39069469722`.
