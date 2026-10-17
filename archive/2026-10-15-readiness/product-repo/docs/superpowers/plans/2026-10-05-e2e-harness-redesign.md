# E2E Harness Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the shadow OS from DigitalBrain.Testing.E2E — every E2E suite boots the real AppHost through Aspire testing, the same flow the product uses.

**Architecture:** Testing.E2E today has two launch paths: Path A (`E2ETest.Create()` → `ModuleTestHost` → a relaunched `ModuleHostProgram` fed serialized module type names through `ModuleHostChannel`, with a `ReferenceComposition` flag that impersonates the OS) and Path B (`E2ETest.For<TAppHost>()` → `DistributedApplicationTestingBuilder.CreateAsync<TAppHost>` — the real AppHost; `ProductE2E`/`ProductHostFixture` already run on it). Path A is three hand-kept copies of the OS composition glued by reflection and a config side channel the module-identity amendment ratified against. This plan moves the reference fixture onto Path B, relocates it to a new non-packable `DigitalBrain.Testing.Reference` project (so the packable harness never references the product), and deletes Path A. Test needs flow as ordinary configuration overrides — the thing the options grammar was built for.

**Tech Stack:** .NET 11, Aspire DistributedApplicationTestingBuilder, xUnit v3.

**Spec:** the ratified direction from this conversation, recorded in `docs/superpowers/specs/2026-10-05-framework-restructuring.md` (three rings; product above the frameworks) and the user's ruling: "delete the shadow OS and redesign the harness; E2E uses the same flow as the OS." Authority for details: the recon inventory in this plan's task notes (file:line refs verified 2026-10-05).

## Global Constraints

- Build/test per project, never the `.slnx`.
- `DigitalBrain.Testing.E2E` stays `IsPackable=true` and after this plan references NO module runtime project, NO `DigitalBrain.OS`, NO AppHost. Module `*.Contracts` references are allowed. `DigitalBrain.Testing.Reference` is `IsPackable=false` and holds every product-touching piece.
- The packed-composition consumer keeps compiling against `AspireTestSession` (`StartAsync`, `.Brain`, `.HttpClient`, `.App`) and `DurableStorageVolume` (`CreateAsync`, `.Name`, `WaitUntilReleasedAsync`, `Complete`), and the `ModuleBuilderFactory` buildTransitive targets keep shipping in the package.
- `ShipOnStartupKey` is a product key — keep it and its uses.
- No reflection-by-type-name anywhere new; `ModuleHostChannel`'s pattern dies with it.
- Suites that boot the AppHost are CI-tier; locally verify compile + the cheap boots, and run the full framework E2E suite once before declaring done.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Cookie name**: `CookieProtectionFacts` asserts `digitalbrain.reference.session`; on the AppHost the default is `intochat.session`. The reference builder must override `IdentityHostOptions` CookieName via host configuration, and the fact keeps passing for the right reason (configured name, protected cookie).
2. **Resource selection**: the AppHost has a second http resource (`digitalbrain-mcp`) beside the runtime (`IntoChat`); `SiloHosts`/`ServerResourceName` must select the runtime, as `ProductE2E` does today.
3. **Master key**: Path A never set one; the AppHost path needs `Parameters:Modules-digitalbrain-master-key` (ProductE2E generates random 32-byte hex). The reference builder must do the same or boots fail only in clean environments.
4. **Package shape regression**: after deleting Path A, `PackedCompositionFacts` must pass end-to-end (IsPackable walk, nuspec dependency audit, consumer compile+run) — it is the gate that the harness is finally publishable.
5. **Shipped-apps path**: the AppHost hard-codes the IntoChat apps path env var; with `ShipOnStartup=false` the publisher returns before loading it, so reference boots stay product-content-free — the reference fixture must keep `ShipOnStartup=false` or product apps leak into framework facts.

---

### Task 1: DigitalBrain.Testing.Reference — the reference brain on the real AppHost

**Files:**
- Create: `src/Testing/DigitalBrain.Testing.Reference/DigitalBrain.Testing.Reference.csproj` — `IsPackable=false` (explicit), references `../DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj`, `../../DigitalBrain/AppHost/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` (`IsAspireProjectResource="false"`), `../../DigitalBrain/OS/DigitalBrain.OS/DigitalBrain.OS.csproj` (module closure for ConfigureModule lambdas).
- Move (git mv from `src/Testing/DigitalBrain.Testing.E2E/Reference/`): `ReferenceBrain.cs`, `ReferenceBrainFixture.cs`, `BrainFact.cs` → `src/Testing/DigitalBrain.Testing.Reference/` (keep `namespace DigitalBrain.Testing.E2E` so facts' usings don't churn).
- Modify: `ReferenceBrain.cs` — rewrite `Create()` from Path A to Path B.
- Modify: `DigitalBrain.slnx` (+project), `Directory.Build.props:59` global-using condition if needed (Reference project is not `*.Tests.E2E`, so add its own `<Using Include="DigitalBrain.Testing.E2E" />` in its csproj).

**Interfaces:**
- Consumes: `E2ETest.For<TAppHost>()` (`Host/ApplicationE2ETestBuilder.cs`), `Projects.DigitalBrain_AppHost`.
- Produces: `ReferenceBrain.Create(string modelApiKey = "fixture-key", Dictionary<string, string?>? privateConfiguration = null)` returning `E2ETestBuilder<Projects.DigitalBrain_AppHost>`; `ReferenceBrainFixture`/`BrainFact` unchanged signatures. Task 2's suites compile against these unchanged.

- [ ] **Step 1: create the csproj and move the three files.** The new `ReferenceBrain.Create()` body — same shape as `ProductE2E.Create()` (`src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/ProductE2E.cs:45-81`), which is the proven Path B boot:

```csharp
public static E2ETestBuilder<Projects.DigitalBrain_AppHost> Create(
    string modelApiKey = "fixture-key", Dictionary<string, string?>? privateConfiguration = null)
    => E2ETest.For<Projects.DigitalBrain_AppHost>()
        .ConfigureModule<AIModule, AIOptions>(ai => ai
            .WithoutLocalModels().WithoutVoiceToText().WithoutWebSearch()
            .WithDefaultLlm<IGpt56Luna>()
            .WithModelEndpoint(AiProvider.OpenAI, UnconfiguredProvider("v1/")))
        .ConfigureModule<QdrantModule, QdrantModuleOptions>(qdrant => qdrant.Host = false)
        .ConfigureModule<PostgresModule, PostgresModuleOptions>(postgres =>
        { postgres.DatabaseName = "digitalbrain"; postgres.PersistentStorage = false; })
        .ConfigureModule<ClickHouseModule, ClickHouseModuleOptions>(ch => ch.PersistentStorage = false)
        .ConfigureModule<SupabaseModule, SupabaseModuleOptions>(supabase => supabase.WithPostgres())
        .ConfigureModule<GmailModule, GmailModuleOptions>(gmail => gmail.WithTokenEndpoint(UnconfiguredProvider("token")))
        .ConfigureModule<SalesforceModule, SalesforceModuleOptions>(sf => sf.WithLocalMcp(UnconfiguredProvider("mcp")))
        .ConfigureModule<GitHubModule, GitHubModuleOptions>(gh => gh.WithGitHubRepositories(new Dictionary<string, GitHubRepositoryDeclaration>()))
        .ConfigureModule<FlutterModule, FlutterModuleOptions>(flutter => flutter.BackendOnly())
        // The reference host is the product composition without product-owned shipped content
        // and with its own cookie, so framework facts never depend on IntoChat's.
        .WithHostConfiguration(IdentityHostOptions.Key(nameof(IdentityHostOptions.CookieName)), "digitalbrain.reference.session")
        .WithResourceEnvironment(new Dictionary<string, string>(StringComparer.Ordinal)
        {
            [DigitalBrainConfiguration.EnvironmentName(ShippedAppsServiceCollectionExtensions.ShipOnStartupKey)] = "false",
        })
        .WithExecution(new()
        {
            PrivateConfiguration = Merge(new Dictionary<string, string?>
            {
                ["Parameters:Modules-digitalbrain-master-key"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)),
                ["Parameters:modules-openai-api-key"] = modelApiKey,
                ["Parameters:modules-gmail-client-id"] = "fixture-client",
                ["Parameters:modules-gmail-client-secret"] = "fixture-secret",
                ["Parameters:modules-salesforce-consumer-key"] = "fixture-client",
                ["Parameters:modules-salesforce-consumer-secret"] = "fixture-secret",
            }, privateConfiguration),
        });
```
Keep `UnconfiguredProvider` (`http://127.0.0.1:1/` + path) and `Merge` as private helpers from the old file. Check `E2ETestBuilder<T>`'s actual fluent surface (`Host/ApplicationE2ETestBuilder.cs`) — if `WithHostConfiguration`/`WithResourceEnvironment`/`WithExecution` don't exist on it with these shapes, adopt ProductE2E's exact idiom (it compiles today; copy how it passes ResourceEnvironment and PrivateConfiguration) rather than inventing new surface. If `ServerResourceName` must name the runtime (`"IntoChat"`), set it exactly as ProductE2E does.
`ReferenceBrainFixture.StartBrainAsync` keeps its existing overrides (scripted model endpoint, `RunWebApp`, `WebContainerKey`, browser, 15-minute startup, OTLP env) — they are already expressed as ConfigureModule/host-config calls that exist on Path B (ProductHostFixture proves each one).

- [ ] **Step 2: build** `dotnet build src/Testing/DigitalBrain.Testing.Reference` — expected PASS. Fix compile drift against the real `E2ETestBuilder<T>` surface only by mirroring ProductE2E.

- [ ] **Step 3: commit** `refactor: the reference brain boots the real AppHost`

### Task 2: Rewire the suites onto the relocated reference

**Files:**
- Modify: `src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/DigitalBrain.Framework.Tests.E2E.csproj` — add `DigitalBrain.Testing.Reference` reference.
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj` — add `DigitalBrain.Testing.Reference` reference (keeps AppHost + OS refs).
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/ProductE2E.cs` — its nine `ConfigureModule` overrides duplicate ReferenceBrain's; rebuild `ProductE2E.Create(key)` on top of `ReferenceBrain.Create(key)` + shipped-content differences (`ShipOnStartup` list, no cookie override → delete the duplication; `ProductHostFixture` keeps only its own deltas).
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E/CSharpFileContainerFacts.cs:42-46` — the last Path A subset (`Time+Aspire+CSharp`). Port to the shared reference fixture (class becomes `BrainFact`-derived and uses the leased brain) — the reference composition contains all three modules and the AppHost wires the sandbox container. If a fact-specific host is genuinely needed, use `E2ETest.For<Projects.DigitalBrain_AppHost>()` with `ConfigureModule<CSharpModule, CSharpOptions>(c => c.WithSandbox(RepositoryRoot()))`.

**Interfaces:**
- Consumes: Task 1's `ReferenceBrain.Create`.
- Produces: no suite anywhere still calls `E2ETest.Create()` except `E2EBoundaryFacts` (dies in Task 3).

- [ ] **Step 1: rewire + port per the file list.**
- [ ] **Step 2: build both suites** — `dotnet build src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E && dotnet build src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.E2E`. Expected PASS.
- [ ] **Step 3: commit** `refactor: every e2e suite rides the product boot`

### Task 3: Delete Path A

**Files:**
- Delete from `src/Testing/DigitalBrain.Testing.E2E/`: `Hosted/ModuleTestHost.cs`, `Hosted/ModuleHostChannel.cs`, `Hosted/ModuleHostProgram.cs`, `Hosted/ModuleHostingAdapters.cs`, `Hosted/ModuleHostEndpoints.cs` (first grep `ModuleHostEndpoints` for other users — `E2EBrain`/`AspireTestSession` may use `.Health`; if so, inline the literal or keep the class minus `/process`), `Host/E2ETestBuilder.cs` (non-generic), the `Reference/` folder remnants.
- Modify: `E2ETest.cs` — delete `Create()` and `StartModulesAsync`; keep `For<TAppHost>()`, `ReadyAsync`, `StartAsync<TAppHost>`.
- Modify: `DigitalBrain.Testing.E2E.csproj` — drop `OutputType Exe`/`UseAppHost`; drop every module runtime reference and the `DigitalBrain.OS` reference; keep/add only what the remaining sources need (expect: Testing, Testing.Module?, Aspire.Hosting, Aspire.Server?, Framework or contracts — let the compiler list them, prefer `*.Contracts` over runtime; any runtime module reference that survives must be justified in the commit message or eliminated).
- Delete: `src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/E2EBoundaryFacts.cs` cases at `:67` and `:73` (they test Path A's refusals); keep the `For<>`/`ReadyAsync` cases.
- Delete: `src/Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Testing` (no consumers — verify with a repo grep first; remove from `.slnx`).

**Interfaces:**
- Consumes: Tasks 1–2 (no remaining Path A callers).
- Produces: Testing.E2E = harness only. Task 4 asserts the package graph.

- [ ] **Step 1: grep gates before deleting** — `ModuleHostChannel|ModuleHostProgram|ModuleTestHost|ReferenceCompositionKey|ModuleTypesKey|E2ETest.Create\(` over `src --include=*.cs` must list only the files being deleted in this task.
- [ ] **Step 2: delete + csproj surgery; build Testing.E2E, Testing.Reference, both E2E suites, Aspire.Hosting.Tests.E2E.** Expected PASS each.
- [ ] **Step 3: commit** `refactor: the shadow OS is gone — one composition, one boot path`

### Task 4: Baselines, architecture facts, and the packaging gate

**Files:**
- Modify: `src/Testing/tests/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json` — remove the `ModuleHostChannel.cs` entry; add `DigitalBrain.Testing.Reference/ReferenceBrain.cs` if it carries key literals (the master-key parameter string does not match the `DigitalBrain:`/`DigitalBrain__` regex; check the ShipOnStartup EnvironmentName call — `EnvironmentName(...)` is a call, not a literal, so likely no entry needed; the test will say).
- Modify: `src/Testing/tests/DigitalBrain.Architecture.Tests/TestTierFacts.cs:101` boot patterns — drop `ReferenceBrain.Create(`? No: ReferenceBrain still exists and boots; drop `E2ETest.Create(` only. Update `TestTierBaseline.json` as the test demands (entries are file paths; `E2EBoundaryFacts` and any moved files).
- Modify: `src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs:39` — delete the `referenceModules == catalogModules` assertion and the `ReferenceBrain` usage (nothing left to drift; the catalog-vs-AppHost assertions stay). Remove the project's Testing.E2E/Reference reference if now unused.
- Modify: `src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/Identity/CookieProtectionFacts.cs:46` — keep asserting `digitalbrain.reference.session`; it now comes from the reference builder's host-config override (Review Focus 1).

- [ ] **Step 1: run the near gates**

```bash
dotnet test src/Testing/tests/DigitalBrain.Architecture.Tests && dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit && dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.Unit
```
Expected: all green.

- [ ] **Step 2: the packaging gate**

```bash
dotnet build src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.E2E && dotnet test src/Aspire/tests/DigitalBrain.Aspire.Hosting.Tests.E2E --filter-method '*PackagesCompose*'
```
Expected: PASS — the IsPackable walk no longer reaches the OS, the nuspec audit sees no product dependencies, the consumer compiles (fixtures already ported to the current `AddDigitalBrain` API) and the composition runs.

- [ ] **Step 3: commit** `test: the harness is publishable and the drift tests have nothing to watch`

### Task 5: Boot proof and CI

- [ ] **Step 1: one real reference boot locally** — run the cheapest AppHost-booting fact through the new fixture, e.g.

```bash
dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E --filter-class '*CookieProtectionFacts*'
```
Expected: PASS (Docker required; a 10–15 minute first boot is normal). If the boot fails on resource selection or master key, that is Review Focus 2/3 — fix in the reference builder, not the fixture.

- [ ] **Step 2: full framework E2E suite once** — `dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E`. Expected: green (shared fixture boots once).

- [ ] **Step 3: push and watch CI** — all three E2E legs (`framework`, `os`, `aspire-hosting`) plus unit job green. The `os` leg runs in CI only; if it fails there, fix forward from its logs.

- [ ] **Step 4: docs touch** — `docs/superpowers/specs/2026-10-05-framework-restructuring.md` gains one paragraph under the deferred list: shadow OS deleted on 2026-10-05, Testing.E2E publishable, reference = product boot minus shipped content. Commit `docs: one boot path, written down`.
