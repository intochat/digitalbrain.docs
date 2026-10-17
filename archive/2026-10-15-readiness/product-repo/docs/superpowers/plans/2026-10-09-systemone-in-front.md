# System One in Front Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make System One (Jev) a hosted, declared model role beside LLM/embedding/transcription, run the local `systemone-adapter` as an Aspire resource named `systemone`, publish Jev's and the router's decisions as contracts-ring signals, and put Jev in front of the assistant's language model behind a per-brain `RouteGate` setting.

**Architecture:** `SystemOneModel<TMarker>` joins the `AiModel` catalog family with two markers (`IJev` hosted TypeSafe, `ILocalJev` the adapter container backed by Ollama). `AIOptions.WithSystemOne/WithDefaultSystemOne` carry the choice as configuration (`Hosting:SystemOnes`, `Default:SystemOne`), `AIModuleHosting` resolves it at bind into a `SystemOneHostingState` projection that adds the adapter container and sets the `typesafe` integration endpoint/key on the OS project — the module keeps reading credentials only through `IModuleIntegrations<AIModule>`. `SystemOneNeuron.Ask` publishes `SystemOneDecided`, `RouterNeuron.Route` publishes `Routed`. The assistant's `send` synapse asks `IRouter.Route` first; above the gate and on a direct route it dispatches with `IRouter.Dispatch` and writes the outcome to the `{app}/status` text neuron; otherwise it runs the agent turn with `RouteResult.Hint()` appended to the system prompt.

**Tech Stack:** .NET 11 RC, Orleans grains (`Neuron`, `Neuron<TState>`), Aspire 13.6 (`AddDockerfile`, `WithHttpEndpoint`, `WithHttpHealthCheck`, `WaitAnnotation`), CommunityToolkit Ollama hosting, xunit.v3 facts over `ModuleTest.Create().WithModule<AIModule>()`, `FakeModelServer` (already answers `/v1/systemone`), `DigitalBrain.Aspire.Testing.AspireCompositionTest` for hosting facts, OS app scripts compiled by the brain (`send.cs`, `lib/Assistant.cs`).

**Spec:** docs/superpowers/specs/2026-10-09-systemone-in-front-design.md

## Global Constraints

- LSP (`csharp-ls` over `DigitalBrain-lsp.sln`) maps every definition/reference before an edit; diagnostics clean before a build. Never grep for code.
- Build and test per project, never the `.slnx`:
  `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path-to-test-project> -- --filter-method "*SentenceName*"`.
- Tests are sentence-named facts using `TestContext.Current.CancellationToken`; real grains over mocks; no `/// <summary>`; warnings are errors; nullable on.
- Credentials reach the module only through `IModuleIntegrations<AIModule>` (`HttpSystemOne` already does); hosting sets `DigitalBrain:Integrations:typesafe:{Endpoint,ApiKey}` through `IntegrationSchema.Key("typesafe", …)`; options stay under `AIKeys.Options` (`DigitalBrain:Modules:ai:Options:*`), derived from `AIKeys`, never literal roots (enforced by `ModuleKeyGrammarFacts`).
- Grain state uses concrete arrays; signals are `sealed record … : Signal` with `[GenerateSerializer, Alias("…")]` and `[property: Id(n)]` members; `Signal.Publisher` is stamped by `Neuron.PublishAsync`.
- A synapse is one reaction: one `await foreach` over one `brain.On<T>(source)`; results are neuron state. Scripts compile against the installed contracts — `IRouter`, `RouteResult`, `Routed` live in `DigitalBrain.Modules.AI.Contracts`, which scripts see.
- Commit explicit files only (`git add <file> <file>`), never a directory; every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The new test project must be added to both `DigitalBrain.slnx` (under `/Modules/AI/`) and the gitignored `DigitalBrain-lsp.sln` (kill the LSP server to reload).
- Never raise a timeout or add polling to make a check pass.

## Review Focus

1. **`HttpSystemOne` sends `jev-latest` to the local adapter** (`SystemOneOptions.Model` default) and Ollama has no such model. Task 1's fact `TheDefaultSystemOneMarkerNamesItsCatalogIdOnTheWire` pins that the default marker's `Id` (`llama3.1` for `ILocalJev`) is what goes over the wire.
2. **Container-to-container Ollama URL.** The adapter's `OPENAI_BASE_URL` must resolve to the Ollama *container* host, not `localhost`; Aspire 13 resolves `OllamaResource.UriExpression` per consumer network. Task 2's fact `WithDefaultSystemOneLocalJevAddsTheAdapterAndPointsTheTypesafeIntegrationAtIt` asserts the env value is a `ReferenceExpression`, not a literal; the running check in Task 7 confirms `/health` and a real route.
3. **`IRouter.Dispatch` re-routes and fills with a language model.** The gate path therefore still calls System One a second time and runs one `Fill` chat completion (key + arguments). Task 5's fact `AboveTheGateTheAssistantAnswersWithoutAnAgentTurn` asserts "no agent turn" as *no chat request carrying the assistant system prompt*, not zero chat requests. The spec's "no model span" is read as "no agent-turn span" (see Spec gaps).
4. **A `Routed`/`SystemOneDecided` signal published from `Save(..., acted:)` vs `PublishAsync`.** `RouterNeuron.Route` already persists through `Remember` → `Save(next, RouterDecided)`; `Routed` rides as the `acted` signal so one write publishes both. Task 3's fact `RouteIsPublishedAsARoutedSignal` observes it on the router neuron.
5. **The `typesafe` integration must be `Ready` before the assistant's first send**, otherwise `HttpSystemOne` throws `ProviderUnavailableException` and the synapse must still answer. Task 4's gate code catches that and falls through to the agent turn with a status line; Task 5's fact `WhenSystemOneIsUnavailableTheAssistantStillRunsTheAgentTurn` pins it.

---

## Task 1: SystemOneModel family, IJev/ILocalJev markers, AIOptions extensions

**Files**
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/ISystemOneModel.cs`
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/SystemOneModel.cs`
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/TypeSafe/IJev.cs`
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/Ollama/ILocalJev.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/AiProvider.cs` (add `TypeSafe`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIDefaultOptions.cs` (add `SystemOne`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIHostingOptions.cs` (add `SystemOnes`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIKeys.cs` (add `DefaultSystemOne`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIOptionsExtensions.cs` (add `WithSystemOne`, `WithDefaultSystemOne`; extend `WithoutLocalModels`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/HttpSystemOne.cs` (model from the default marker)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneModelFacts.cs` (create)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneFacts.cs` (add one fact)

**Interfaces**
- Consumes: `AiModel` (`Id`, `Provider`, `Marker`, `IsLocal`), `IAiMarker`, `AIOptions.Hosting`/`Default`, `IModuleIntegrations<AIModule>`, `IOptions<AIOptions>`.
- Produces:
  - `public interface ISystemOneModel : IAiMarker;`
  - `public abstract class SystemOneModel : AiModel { public static IReadOnlyList<SystemOneModel> All { get; } public static SystemOneModel? FindByMarker(Type marker); public static SystemOneModel? FindByMarkerName(string markerName); }`
  - `public abstract class SystemOneModel<TMarker> : SystemOneModel where TMarker : ISystemOneModel`
  - `public interface IJev : ISystemOneModel;` / `public sealed class Jev : SystemOneModel<IJev>` (`Id => "jev-latest"`, `Provider => AiProvider.TypeSafe`)
  - `public interface ILocalJev : ISystemOneModel;` / `public sealed class LocalJev : SystemOneModel<ILocalJev>` (`Id => "llama3.1"`, `Provider => AiProvider.Ollama`)
  - `AiProvider.TypeSafe`
  - `AIDefaultOptions.SystemOne : string?`, `AIHostingOptions.SystemOnes : List<string>`, `AIKeys.DefaultSystemOne`
  - `public static AIOptions WithSystemOne<TModel>(this AIOptions options) where TModel : ISystemOneModel`
  - `public static AIOptions WithDefaultSystemOne<TModel>(this AIOptions options) where TModel : ISystemOneModel`

**Steps**

- [ ] Write the failing facts in `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneModelFacts.cs`:

```csharp
using DigitalBrain.AI;
using DigitalBrain.AI.Models;
using DigitalBrain.AI.Models.Ollama;
using DigitalBrain.AI.Models.TypeSafe;
using DigitalBrain.AI.SystemOne;

namespace DigitalBrain.Modules.AI.Tests;

// System One is the fourth model role: declared by marker like an LLM, carried by configuration,
// resolved at bind. Two markers ship: the hosted TypeSafe endpoint and the local adapter container.
public sealed class SystemOneModelFacts
{
    [Fact]
    public void WithSystemOneRecordsTheMarkerUnderHosting()
    {
        var options = new AIOptions().WithSystemOne<IJev>();

        Assert.Equal(["IJev"], options.Hosting.SystemOnes);
        Assert.Null(options.Default.SystemOne);
    }

    [Fact]
    public void WithDefaultSystemOneRecordsTheMarkerAsTheDefault()
    {
        var options = new AIOptions().WithDefaultSystemOne<ILocalJev>();

        Assert.Equal(["ILocalJev"], options.Hosting.SystemOnes);
        Assert.Equal("ILocalJev", options.Default.SystemOne);
    }

    [Fact]
    public void WithSystemOneAddsEachMarkerOnce()
    {
        var options = new AIOptions().WithSystemOne<IJev>().WithDefaultSystemOne<IJev>();

        Assert.Equal(["IJev"], options.Hosting.SystemOnes);
    }

    [Fact]
    public void LocalJevIsLocalAndHostedJevIsNot()
    {
        Assert.True(SystemOneModel.FindByMarker(typeof(ILocalJev))!.IsLocal);
        Assert.False(SystemOneModel.FindByMarker(typeof(IJev))!.IsLocal);
        Assert.Equal(AiProvider.TypeSafe, SystemOneModel.FindByMarkerName("IJev")!.Provider);
        Assert.Equal("llama3.1", SystemOneModel.FindByMarkerName("ILocalJev")!.Id);
    }

    [Fact]
    public void WithoutLocalModelsDropsTheLocalSystemOne()
    {
        var options = new AIOptions().WithDefaultSystemOne<ILocalJev>().WithoutLocalModels();

        Assert.Empty(options.Hosting.SystemOnes);
        Assert.Null(options.Default.SystemOne);
    }

    [Fact]
    public void TheDefaultSystemOneSurvivesCompileAndBind()
    {
        var options = new AIOptions().WithDefaultSystemOne<ILocalJev>();
        var definition = Framework.Configuration.ModuleOptionsSerialization.Compile<AIModule, AIOptions>(options);
        var configuration = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(definition.Settings).Build();

        var bound = Framework.Configuration.ModuleOptionsExtensions.GetModuleOptions<AIOptions>(configuration, "ai");

        Assert.Equal("ILocalJev", bound.Default.SystemOne);
        Assert.Equal(["ILocalJev"], bound.Hosting.SystemOnes);
        Assert.Equal(AIKeys.Options + ":Default:SystemOne", AIKeys.DefaultSystemOne);
    }
}
```
  (The `GetModuleOptions` call lives in `DigitalBrain.Framework.Configuration`; copy the exact `using`s from `AIOptionsRoundTripFacts.cs`, which calls it as `configuration.GetModuleOptions<AIOptions>("ai")`, and use that form.)

- [ ] Add to `SystemOneFacts.cs` (same class, beside `ANoulQuestionIsAnsweredWithATruthValue`):

```csharp
    [Fact]
    public async Task TheDefaultSystemOneMarkerNamesItsCatalogIdOnTheWire()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        var client = Client(server.Url, options => options.Default.SystemOne = "ILocalJev");
        var captured = server.ReplyOnce("application/json",
            """{"model":"llama3.1","answers":{"urgent":{"type":"noul","noul":0.5}}}""", ct);

        await client.Ask(new SystemOneRequest("help", new() { ["urgent"] = new SystemOneQuestion.Noul("Urgent?") }), ct);

        Assert.Contains("\"model\":\"llama3.1\"", (await captured).Body, StringComparison.Ordinal);
    }
```
  and change the helper signature to `private static HttpSystemOne Client(string endpoint, Action<AIOptions>? configure = null)` building `var options = new AIOptions { SystemOne = new() { Endpoint = endpoint } }; configure?.Invoke(options); services.AddSingleton(Options.Create(options));`.

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*SystemOne*"` — expected: build failure (`ISystemOneModel`, `IJev`, `ILocalJev`, `WithSystemOne`, `AiProvider.TypeSafe`, `Default.SystemOne` do not exist).

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/ISystemOneModel.cs`:

```csharp
using DigitalBrain.AI.Models;

namespace DigitalBrain.AI.SystemOne;

// Marker root for System One (decision) model markers. One root for the hosted TypeSafe endpoint
// and the local adapter: which one serves a marker is a matter of AiProvider, not of catalog.
public interface ISystemOneModel : IAiMarker;
```

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/SystemOneModel.cs`:

```csharp
using DigitalBrain.AI.Models;

namespace DigitalBrain.AI.SystemOne;

public abstract class SystemOneModel : AiModel
{
    // Hosted precedes local, matching the other catalogs.
    public static IReadOnlyList<SystemOneModel> All { get; } =
    [
        new Models.TypeSafe.Jev(),
        new Models.Ollama.LocalJev(),
    ];

    public static SystemOneModel? FindByMarker(Type marker)
        => All.FirstOrDefault(model => model.Marker == marker);

    public static SystemOneModel? FindByMarkerName(string markerName)
        => All.FirstOrDefault(model => string.Equals(model.Marker.Name, markerName, StringComparison.Ordinal));
}

public abstract class SystemOneModel<TMarker> : SystemOneModel
    where TMarker : ISystemOneModel
{
    public sealed override Type Marker => typeof(TMarker);
}
```

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/TypeSafe/IJev.cs`:

```csharp
using DigitalBrain.AI.SystemOne;

namespace DigitalBrain.AI.Models.TypeSafe;

// The hosted TypeSafe System One. Needs the `typesafe` integration's ApiKey.
public sealed class Jev : SystemOneModel<IJev>
{
    public override string Id => "jev-latest";

    public override AiProvider Provider => AiProvider.TypeSafe;
}

// Marker for AppHost WithSystemOne<IJev>() / WithDefaultSystemOne<IJev>().
public interface IJev : ISystemOneModel;
```

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/Ollama/ILocalJev.cs`:

```csharp
using DigitalBrain.AI.SystemOne;

namespace DigitalBrain.AI.Models.Ollama;

// The systemone-adapter container speaking Jev's wire shape, answered by this Ollama model.
// Id is the Ollama model the adapter is told to use (SYSTEMONE_MODEL), the compose default.
public sealed class LocalJev : SystemOneModel<ILocalJev>
{
    public override string Id => "llama3.1";

    public override AiProvider Provider => AiProvider.Ollama;
}

// Marker for AppHost WithDefaultSystemOne<ILocalJev>(): hosts the adapter as the `systemone` resource.
public interface ILocalJev : ISystemOneModel;
```

- [ ] In `AiProvider.cs` add `TypeSafe,` after `OpenRouter,` with the comment `// TypeSafe's hosted System One (Jev). Decisions only; never a chat provider.` (`AIOptions.Provider` keeps throwing `NotSupportedException` for it, and `AiIntegrations.IdOf` is not extended — the integration id stays the `HttpSystemOne.IntegrationId` constant.)

- [ ] In `AIDefaultOptions.cs` add `public string? SystemOne { get; set; }` after `Transcription`. In `AIHostingOptions.cs` add `public List<string> SystemOnes { get; set; } = [];`. In `AIKeys.cs` add `public static readonly string DefaultSystemOne = Options + ":Default:SystemOne";` after `DefaultImage`.

- [ ] In `AIOptionsExtensions.cs` add `using DigitalBrain.AI.SystemOne;` and, after `WithoutVoiceToText`:

```csharp
    public static AIOptions WithSystemOne<TModel>(this AIOptions options) where TModel : ISystemOneModel
    {
        var model = SystemOneModel.FindByMarker(typeof(TModel)) ?? throw new ArgumentException("Unknown System One marker.");
        if (!options.Hosting.SystemOnes.Contains(model.Marker.Name)) { options.Hosting.SystemOnes.Add(model.Marker.Name); }
        return options;
    }

    public static AIOptions WithDefaultSystemOne<TModel>(this AIOptions options) where TModel : ISystemOneModel
    {
        options.WithSystemOne<TModel>();
        options.Default.SystemOne = typeof(TModel).Name;
        return options;
    }
```
  and extend `WithoutLocalModels` with:
```csharp
        options.Hosting.SystemOnes.RemoveAll(name => SystemOneModel.FindByMarkerName(name)?.IsLocal == true);
        if (options.Default.SystemOne is { } systemOne && SystemOneModel.FindByMarkerName(systemOne)?.IsLocal == true) { options.Default.SystemOne = null; }
```

- [ ] In `HttpSystemOne.cs` replace the `model` line with:

```csharp
        var model = request.Model is { Length: > 0 } ? request.Model
            : options.Value.Default.SystemOne is { Length: > 0 } marker && SystemOneModel.FindByMarkerName(marker) is { } catalogued ? catalogued.Id
            : options.Value.SystemOne.Model;
```

- [ ] LSP diagnostics clean, then build and test:
  `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj`
  `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*SystemOne*"` — expected: all pass (the new six facts + the existing `SystemOneFacts` and `SystemOneRouterFacts`).

- [ ] Commit:
```
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/ISystemOneModel.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/SystemOneModel.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/TypeSafe/IJev.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/Ollama/ILocalJev.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/AiProvider.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIDefaultOptions.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIHostingOptions.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIKeys.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Configuration/AIOptionsExtensions.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/HttpSystemOne.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneModelFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneFacts.cs
git commit -m "AI: System One is a declared model role (IJev, ILocalJev, WithDefaultSystemOne)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Hosting — the adapter as the `systemone` Aspire resource

**Files**
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/SystemOneHostingState.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/AIHostingState.cs` (`EnsureOllama` → internal; add `AddOllamaBackingModel`)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/AIModuleHosting.cs` (`ConfigureDeclaration` resolves `Hosting.SystemOnes` / `Default.SystemOne`)
- Create: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj`
- Create: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/SystemOneHostingFacts.cs`
- Modify: `DigitalBrain.slnx` (add the project under `/Modules/AI/`), `DigitalBrain-lsp.sln` (gitignored; add the project so LSP sees it)

**Interfaces**
- Consumes: `DigitalBrainModuleBuilder<AIModuleHosting>.GetOrAddProjection`, `DigitalBrainModuleProjection.Apply<TResource>(IResourceBuilder<TResource>)`, `brain.ApplicationBuilder.AddDockerfile(string name, string contextPath, string? dockerfilePath = null)`, `WithHttpEndpoint(targetPort: 8000, name: "http")`, `WithHttpHealthCheck("/health")`, `WithEnvironment(string, ReferenceExpression | EndpointReference | string)`, `WaitAnnotation(resource, WaitType.WaitUntilHealthy, exitCode: 0)`, `OllamaResource.UriExpression`, `OllamaModelResource`, `IntegrationSchema.Key("typesafe", "Endpoint"|"ApiKey")`, `DigitalBrainConfiguration.EnvironmentName`, `AIKeys.DefaultSystemOne`, `SystemOneModel`, `AspireCompositionTest.CreateBuilder/EnvironmentOf`.
- Produces:
  - `AIHostingExtensions.SystemOneResourceName = "systemone"`, `AIHostingExtensions.SystemOneApiKeyLocal = "local"` (public consts the facts read)
  - `private sealed class SystemOneHostingState : DigitalBrainModuleProjection { internal void SetDefault(SystemOneModel model, IResourceBuilder<OllamaModelResource>? backing); public override void Apply<TResource>(IResourceBuilder<TResource> builder); }`
  - `AIHostingState.AddOllamaBackingModel(string id) : IResourceBuilder<OllamaModelResource>` (internal)

**Steps**

- [ ] Create the test project `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Composition facts only: no in-process cluster, no DigitalBrain.Testing. -->
  <PropertyGroup>
    <RuntimeIdentifiers Condition="$([MSBuild]::IsOSPlatform('Windows'))">win-x64</RuntimeIdentifiers>
  </PropertyGroup>
  <ItemGroup><Using Remove="DigitalBrain.Testing" /></ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../../DigitalBrain.Modules.AI.Aspire.Hosting/DigitalBrain.Modules.AI.Aspire.Hosting.csproj" />
    <ProjectReference Include="../../DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj" />
    <ProjectReference Include="../../../../Testing/DigitalBrain.Aspire.Testing/DigitalBrain.Aspire.Testing.csproj" />
  </ItemGroup>
</Project>
```
  (`RuntimeIdentifiers` mirrors `DigitalBrain.Modules.AI.Aspire.Hosting.csproj`, which carries it for `Microsoft.AI.Foundry.Local`.) Add `<Project Path="src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj" />` to `DigitalBrain.slnx` inside `<Folder Name="/Modules/AI/">`, and a matching `Project(...)` entry in `DigitalBrain-lsp.sln` (copy the `DigitalBrain.Modules.AI.Tests` line at line 146, new GUID, new path/name).

- [ ] Write the failing facts `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/SystemOneHostingFacts.cs`:

```csharp
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using DigitalBrain.AI;
using DigitalBrain.AI.Aspire.Hosting;
using DigitalBrain.AI.Models.Ollama;
using DigitalBrain.AI.Models.TypeSafe;
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Framework.Configuration;
using DigitalBrain.Framework.Platform.Integrations;
using static DigitalBrain.Aspire.Testing.AspireCompositionTest;

namespace DigitalBrain.Modules.AI.Tests.Hosting;

// WithDefaultSystemOne<ILocalJev>() hosts the systemone-adapter as the `systemone` container and points the
// OS's `typesafe` integration at it; WithDefaultSystemOne<IJev>() asks for the hosted key instead.
public sealed class SystemOneHostingFacts
{
    private static readonly string EndpointKey = DigitalBrainConfiguration.EnvironmentName(IntegrationSchema.Key("typesafe", "Endpoint"));
    private static readonly string ApiKeyKey = DigitalBrainConfiguration.EnvironmentName(IntegrationSchema.Key("typesafe", "ApiKey"));
    private static readonly string DefaultKey = DigitalBrainConfiguration.EnvironmentName(AIKeys.DefaultSystemOne);

    [Fact]
    public async Task WithDefaultSystemOneLocalJevAddsTheAdapterAndPointsTheTypesafeIntegrationAtIt()
    {
        var ct = TestContext.Current.CancellationToken;
        var builder = CreateBuilder();
        var brain = builder.AddDigitalBrain("brain", new() { UseAzureStorage = true, PersistentStorage = false })
            .WithHosting<AIModuleHosting, AIOptions>(ai => ai.WithDefaultSystemOne<ILocalJev>());
        var consumer = builder.AddExecutable("consumer", "unused", ".").WithReference(brain);

        var adapter = Assert.IsType<ContainerResource>(Assert.Single(builder.Resources, resource => resource.Name == AIHostingExtensions.SystemOneResourceName), exactMatch: false);
        Assert.Contains(adapter.Annotations.OfType<HealthCheckAnnotation>(), _ => true);
        Assert.Contains(adapter.Annotations.OfType<EndpointAnnotation>(), endpoint => endpoint.Name == "http" && endpoint.TargetPort == 8000);
        var backing = Assert.Single(builder.Resources.OfType<OllamaModelResource>());
        Assert.Equal("llama3.1", backing.ModelName);
        Assert.Contains(adapter.Annotations.OfType<WaitAnnotation>(), wait => ReferenceEquals(wait.Resource, backing));
        var adapterEnvironment = await EnvironmentOf(builder, adapter, ct);
        Assert.Equal("llama3.1", adapterEnvironment["SYSTEMONE_MODEL"]);
        Assert.IsType<ReferenceExpression>(adapterEnvironment["OPENAI_BASE_URL"]);

        var environment = await EnvironmentOf(builder, consumer.Resource, ct);
        Assert.IsType<EndpointReference>(environment[EndpointKey]);
        Assert.Equal(AIHostingExtensions.SystemOneApiKeyLocal, environment[ApiKeyKey]);
        Assert.Equal("ILocalJev", environment[DefaultKey]);
        Assert.Contains(consumer.Resource.Annotations.OfType<WaitAnnotation>(), wait =>
            ReferenceEquals(wait.Resource, adapter) && wait.WaitType == WaitType.WaitUntilHealthy);
    }

    [Fact]
    public async Task WithDefaultSystemOneJevAsksForTheHostedKeyAndHostsNoContainer()
    {
        var ct = TestContext.Current.CancellationToken;
        var builder = CreateBuilder();
        var brain = builder.AddDigitalBrain("brain", new() { UseAzureStorage = true, PersistentStorage = false })
            .WithHosting<AIModuleHosting, AIOptions>(ai => ai.WithDefaultSystemOne<IJev>());
        var consumer = builder.AddExecutable("consumer", "unused", ".").WithReference(brain);

        Assert.DoesNotContain(builder.Resources, resource => resource.Name == AIHostingExtensions.SystemOneResourceName);
        var environment = await EnvironmentOf(builder, consumer.Resource, ct);
        var key = Assert.IsType<ParameterResource>(environment[ApiKeyKey]);
        Assert.True(key.Secret);
        Assert.Equal("IJev", environment[DefaultKey]);
        Assert.DoesNotContain(EndpointKey, environment.Keys);
    }

    [Fact]
    public void AnUnknownSystemOneMarkerFailsAtBind()
    {
        var builder = CreateBuilder();
        var brain = builder.AddDigitalBrain("brain", new() { UseAzureStorage = true, PersistentStorage = false });
        var options = new AIOptions();
        options.Hosting.SystemOnes.Add("INotAJev");

        Assert.Throws<InvalidOperationException>(() => AIHostingExtensions.ConfigureDeclaration(brain, options));
    }
}
```
  (`ConfigureDeclaration` is `internal`; add `[assembly: InternalsVisibleTo("DigitalBrain.Modules.AI.Tests.Hosting")]` only if the hosting project does not already expose internals to tests — check with LSP for an existing `InternalsVisibleTo` in `DigitalBrain.Modules.AI.Aspire.Hosting`; if none, add it in a new `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/AssemblyInfo.cs`.)

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting` — expected: build failure (`SystemOneResourceName`, `SystemOneApiKeyLocal` missing; `WithDefaultSystemOne` resolves nothing at bind).

- [ ] In `AIHostingState.cs` (class `AIHostingState`), change `private IResourceBuilder<OllamaResource> EnsureOllama()` to `internal`, and add beside `AddModel`:

```csharp
        // An Ollama model that backs something other than an LLM/embedding neuron (the System One
        // adapter). Not a marker: nothing is keyed by it, so it is not added to _markers.
        internal IResourceBuilder<OllamaModelResource> AddOllamaBackingModel(string id)
            => EnsureOllama().AddModel(brain.ResourceName(OllamaResourceName(id)), id);
```

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/SystemOneHostingState.cs`:

```csharp
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using DigitalBrain.AI.Models;
using DigitalBrain.AI.SystemOne;
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Framework.Configuration;
using DigitalBrain.Framework.Platform.Integrations;

namespace DigitalBrain.AI.Aspire.Hosting;

public static partial class AIHostingExtensions
{
    // The adapter's Aspire name: what the dashboard and the shell's infrastructure strip show.
    public const string SystemOneResourceName = "systemone";
    // The adapter checks no key; the integration still needs one to be Ready.
    public const string SystemOneApiKeyLocal = "local";
    private const string SystemOneAdapterDirectory = "src/DigitalBrain.Modules/AI/systemone-adapter";

    // "typesafe" mirrors the module's internal HttpSystemOne.IntegrationId.
    private static readonly string TypeSafeEndpointEnvironmentKey =
        DigitalBrainConfiguration.EnvironmentName(IntegrationSchema.Key("typesafe", "Endpoint"));
    private static readonly string TypeSafeApiKeyEnvironmentKey =
        DigitalBrainConfiguration.EnvironmentName(IntegrationSchema.Key("typesafe", "ApiKey"));
    private static readonly string DefaultSystemOneEnvironmentKey =
        DigitalBrainConfiguration.EnvironmentName(AIKeys.DefaultSystemOne);

    private sealed class SystemOneHostingState(
        DigitalBrainBuilder brain,
        IResourceBuilder<DigitalBrainModuleResource> module) : DigitalBrainModuleProjection
    {
        private SystemOneModel? _default;
        private IResourceBuilder<OllamaModelResource>? _backing;
        private IResourceBuilder<ContainerResource>? _adapter;

        internal void SetDefault(SystemOneModel model, IResourceBuilder<OllamaModelResource>? backing)
        {
            ArgumentNullException.ThrowIfNull(model);
            if (_default is not null && !string.Equals(_default.Id, model.Id, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    $"System One is already configured on brain '{brain.Name}' as '{_default.Id}'. Call WithDefaultSystemOne once.");
            }
            _default = model;
            _backing = backing;
        }

        public override void Apply<TResource>(IResourceBuilder<TResource> builder)
        {
            ArgumentNullException.ThrowIfNull(builder);
            if (_default is null) { return; }
            builder.WithEnvironment(DefaultSystemOneEnvironmentKey, _default.Marker.Name);
            if (_default.Provider is not AiProvider.Ollama) { return; }

            _adapter ??= AddAdapter();
            builder
                .WithAnnotation(new WaitAnnotation(_adapter.Resource, WaitType.WaitUntilHealthy, exitCode: 0))
                .WithEnvironment(TypeSafeEndpointEnvironmentKey, _adapter.GetEndpoint("http"))
                .WithEnvironment(TypeSafeApiKeyEnvironmentKey, SystemOneApiKeyLocal);
        }

        // The adapter image builds from the repository's systemone-adapter folder; a host composed
        // outside the repository cannot run a local Jev.
        private IResourceBuilder<ContainerResource> AddAdapter()
        {
            var repository = RepositoryRoot() ?? throw new InvalidOperationException(
                "WithDefaultSystemOne<ILocalJev>() builds the adapter from the repository; run the AppHost from inside it or use IJev.");
            var backing = _backing ?? throw new InvalidOperationException("A local System One needs its Ollama model.");
            var ollama = backing.Resource.Parent;
            return brain.ApplicationBuilder
                .AddDockerfile(SystemOneResourceName, Path.Combine(repository, SystemOneAdapterDirectory))
                .WithHttpEndpoint(targetPort: 8000, name: "http")
                .WithHttpHealthCheck("/health")
                .WithEnvironment("OPENAI_BASE_URL", ReferenceExpression.Create($"{ollama.UriExpression}/v1"))
                .WithEnvironment("OPENAI_API_KEY", "not-needed")
                .WithEnvironment("SYSTEMONE_MODEL", _default!.Id)
                .WithAnnotation(new WaitAnnotation(backing.Resource, WaitType.WaitUntilHealthy, exitCode: 0))
                .WithParentRelationship(module);
        }

        private static string? RepositoryRoot()
        {
            for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            { if (File.Exists(Path.Combine(directory.FullName, "DigitalBrain.slnx"))) { return directory.FullName; } }
            return null;
        }
    }
}
```
  If `ReferenceExpression.Create($"{ollama.UriExpression}/v1")` does not compile because `UriExpression` is not interpolatable, use `ReferenceExpression.Create($"{ollama.PrimaryEndpoint.Property(EndpointProperty.Url)}/v1")` (Aspire ≥ 9.5 resolves `Url` per consumer network). Confirm with LSP on `OllamaResource` which member exists.

- [ ] In `AIModuleHosting.cs` `ConfigureDeclaration`, after the transcription block and before `if (options.Tavily.Enabled)`:

```csharp
        foreach (var name in options.Hosting.SystemOnes)
        {
            var model = SystemOneModel.FindByMarkerName(name) ?? throw new InvalidOperationException(
                $"'{name}' is not a catalogued System One model. Known: {string.Join(", ", SystemOneModel.All.Select(static m => m.Marker.Name))}.");
            if (!string.Equals(options.Default.SystemOne, name, StringComparison.Ordinal)) { continue; }
            var systemOne = module.GetOrAddProjection(b => new SystemOneHostingState(b, module.Resource));
            if (model.Provider is AiProvider.Ollama) { systemOne.SetDefault(model, state.AddOllamaBackingModel(model.Id)); }
            else { state.EnsureProviderApiKey(model.Provider); systemOne.SetDefault(model, null); }
        }
```
  with `using DigitalBrain.AI.SystemOne;` added. (`EnsureProviderApiKey(AiProvider.TypeSafe)` creates the `typesafe-api-key` secret parameter and the `DigitalBrain:Integrations:typesafe:ApiKey` environment entry because the key id is `provider.ToString().ToLowerInvariant()`.)

- [ ] LSP diagnostics clean, then:
  `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/DigitalBrain.Modules.AI.Aspire.Hosting.csproj`
  `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting` — expected: 3 pass.
  Also `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` — expected: clean (AppHost unchanged yet).

- [ ] Commit:
```
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/SystemOneHostingState.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/AIHostingState.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/AIModuleHosting.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/SystemOneHostingFacts.cs DigitalBrain.slnx
git commit -m "AI hosting: the systemone adapter is an Aspire resource behind the typesafe integration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
  (add `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/AssemblyInfo.cs` to the `git add` if it was created.)

---

## Task 3: `SystemOneDecided` and `Routed` signals

**Files**
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/Signals/SystemOneSignals.cs`
- Create: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/Signals/RoutingSignals.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/SystemOneNeuron.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs` (`Route` publishes `Routed` through `Remember`)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs` (two facts)

**Interfaces**
- Consumes: `Neuron.PublishAsync(Signal)`, `Neuron<TState>.Save(TState next, Signal changed, Signal? acted = null)`, `SystemOneResult.Answers`, `SystemOneAnswer.Choice/Score.Confidence`, `BrainTestExtensions.Observe<T>(IDigitalBrain, INeuron, ct)` → `SignalProbe<T>.NextAsync(ct: ct)`.
- Produces:
  - `[GenerateSerializer, Alias("ai.systemone-decided")] public sealed record SystemOneDecided([property: Id(0)] string RequestSummary, [property: Id(1)] Dictionary<string, SystemOneAnswer> Answers, [property: Id(2)] double Confidence) : Signal;`
  - `[GenerateSerializer, Alias("ai.routed")] public sealed record Routed([property: Id(0)] string State, [property: Id(1)] string Contract, [property: Id(2)] string Method, [property: Id(3)] double Confidence) : Signal;`

**Steps**

- [ ] Add to `SystemOneRouterFacts.cs` (usings: `DigitalBrain.AI.Routing.Signals`, `DigitalBrain.AI.SystemOne`, `DigitalBrain.AI.SystemOne.Signals`):

```csharp
    [Fact]
    public async Task RouteIsPublishedAsARoutedSignal()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        const string Contract = """{"model":"jev","answers":{"capability_0":{"type":"choice","choice":"timer","confidence":0.91,"probabilities":{"timer":0.91}}}}""";
        const string Method = """{"model":"jev","answers":{"method":{"type":"choice","choice":"Start","confidence":0.88,"probabilities":{"Start":0.88}}}}""";
        var replies = new[] { server.ReplyOnce("application/json", Contract, ct), server.ReplyOnce("application/json", Method, ct) };
        await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        var router = host.Get<IRouter>(Scope);
        await using var routed = await host.Observe<Routed>(router, ct);

        await router.Route("start a countdown please", null, ct);

        var signal = await routed.NextAsync(ct: ct);
        Assert.Equal(typeof(ITimer).FullName, signal.Contract);
        Assert.Equal("Start", signal.Method);
        Assert.Equal(0.91, signal.Confidence);
        Assert.Equal("start a countdown please", signal.State);
        await Task.WhenAll(replies);
    }

    [Fact]
    public async Task ASystemOneAnswerIsPublishedAsADecision()
    {
        var ct = TestContext.Current.CancellationToken;
        using var server = new LoopbackServer();
        var reply = server.ReplyOnce("application/json",
            """{"model":"jev","answers":{"department":{"type":"choice","choice":"technical","confidence":0.78,"probabilities":{"technical":0.85,"billing":0.15}}}}""", ct);
        await using var host = await Start(server.Url, StubChatClient.Replying("{}"), ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        var systemOne = host.Get<ISystemOne>(Scope);
        await using var decided = await host.Observe<SystemOneDecided>(systemOne, ct);

        await systemOne.Ask(new SystemOneRequest("the integration keeps failing",
            new() { ["department"] = new SystemOneQuestion.Choice("Which team?", new() { ["technical"] = null, ["billing"] = null }) }), ct);

        var signal = await decided.NextAsync(ct: ct);
        Assert.Equal("the integration keeps failing", signal.RequestSummary);
        Assert.Equal(0.78, signal.Confidence);
        Assert.Equal("technical", Assert.IsType<SystemOneAnswer.Choice>(signal.Answers["department"]).Value);
        await reply;
    }
```
  (`host.Observe<T>` is the `DigitalBrain.Testing.BrainTestExtensions` helper `BrainRuntimeFacts` uses as `Brain.Observe<ChatChanged>(chat, ct)`; `ModuleBrain` implements `IDigitalBrain` — confirm with LSP; if `Observe` is not reachable from `ModuleBrain`, use `host.SubscribeAsync<Routed>(router, ct)` + `ReadAllAsync(ct).GetAsyncEnumerator(ct)` as `AssistantScenarioFacts` does.)

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*Published*"` — expected: build failure (`Routed`, `SystemOneDecided` missing).

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/Signals/SystemOneSignals.cs`:

```csharp
using DigitalBrain;

namespace DigitalBrain.AI.SystemOne.Signals;

// One System One answer, as a fact apps and the shell can subscribe to. RequestSummary is the state
// clipped to 2000 characters; Confidence is the highest Choice/Score confidence in Answers (0 if none).
[GenerateSerializer, Alias("ai.systemone-decided")]
public sealed record SystemOneDecided(
    [property: Id(0)] string RequestSummary,
    [property: Id(1)] Dictionary<string, SystemOneAnswer> Answers,
    [property: Id(2)] double Confidence) : Signal;
```

- [ ] Create `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/Signals/RoutingSignals.cs`:

```csharp
using DigitalBrain;

namespace DigitalBrain.AI.Routing.Signals;

// The router's decision for one request: which contract and method, and how sure it was.
// Published by Route (and so by Dispatch, which routes first). Contract is the full type name.
[GenerateSerializer, Alias("ai.routed")]
public sealed record Routed(
    [property: Id(0)] string State,
    [property: Id(1)] string Contract,
    [property: Id(2)] string Method,
    [property: Id(3)] double Confidence) : Signal;
```

- [ ] Replace `SystemOneNeuron.cs`:

```csharp
using DigitalBrain.AI.SystemOne;
using DigitalBrain.AI.SystemOne.Signals;
using DigitalBrain.Framework;

namespace DigitalBrain.AI;

[GrainType("ai.systemone")]
internal sealed class SystemOneNeuron(HttpSystemOne client) : Neuron, ISystemOne
{
    private const int MaxSummaryChars = 2000;

    public async Task<SystemOneResult> Ask(SystemOneRequest request, CancellationToken ct = default)
    {
        var result = await client.Ask(request, ct);
        var summary = request.State.Length <= MaxSummaryChars ? request.State : request.State[..MaxSummaryChars];
        await PublishAsync(new SystemOneDecided(summary, result.Answers, Confidence(result)));
        return result;
    }

    private static double Confidence(SystemOneResult result)
    {
        var best = 0.0;
        foreach (var answer in result.Answers.Values)
        {
            var confidence = answer switch
            {
                SystemOneAnswer.Choice choice => choice.Confidence,
                SystemOneAnswer.Score score => score.Confidence,
                _ => 0.0,
            };
            if (confidence > best) { best = confidence; }
        }
        return best;
    }
}
```

- [ ] In `RouterNeuron.cs`: add `using DigitalBrain.AI.Routing.Signals;`; change `Remember` to carry confidence and publish `Routed` as the acted signal:

```csharp
    private async Task Remember(string request, string contract, string method, double confidence)
    {
        var record = new RouteRecord(Clip(request), contract, method);
        var recent = Snapshot.Recent.Where(item => item.Request != record.Request || item.Contract != record.Contract).TakeLast(MaxRecent - 1).ToArray();
        await Save(Snapshot with { Recent = [.. recent, record] }, new RouterDecided(Key, recent.Length + 1), new Routed(Clip(request), contract, method, confidence));
    }
```
  and update its three call sites (LSP `findReferences` on `Remember`): in `Route` the two calls pass `confidence`; in `Achieve` pass `steps[^1].Confidence`.

- [ ] LSP diagnostics clean, then:
  `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj`
  `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*SystemOneRouterFacts*"` — expected: 5 pass.

- [ ] Commit:
```
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/SystemOne/Signals/SystemOneSignals.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/Signals/RoutingSignals.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/SystemOne/SystemOneNeuron.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Routing/RouterNeuron.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/SystemOneRouterFacts.cs
git commit -m "AI: Jev's and the router's decisions are signals (SystemOneDecided, Routed)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: `RouteResult.Hint()` and the assistant's Jev-first `send` synapse

**Files**
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteResult.cs` (add `Hint()`)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RouteResultFacts.cs` (create)
- Modify: `src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs` (add `RouteGate`, `IsDirect`, `Status`)
- Modify: `src/DigitalBrain.OS/Apps/Assistant/synapses/send.cs`
- Modify: `src/DigitalBrain.OS/Apps/Assistant/app.json` (setting `RouteGate`, version `1.4.0`)
- Modify: `src/DigitalBrain.OS/Apps/Assistant/app.spec.md` (three scenarios)
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsAssistantAppFacts.cs` (settings fact)

**Interfaces**
- Consumes: `IRouter.Route(string state, string[]? allowed, CancellationToken)`, `IRouter.Dispatch(string state, string[]? allowed, CancellationToken)`, `RouteOutcome`, `IText.Set(string)`, `IApp.Read().Settings`, `AgentTurn.Text(...)`, `DigitalBrainConnection.Setting("Brain")`.
- Produces:
  - `RouteResult.Hint() : string` — `"Likely capabilities (Jev):\n- {Contract}.{Method} ({Confidence:0.00})\n- {id} ({p:0.00})…"` top 3 by probability excluding the chosen id.
  - `Assistant.RouteGate(AppSnapshot snapshot) : double` (setting `RouteGate`, default `0.8`, invariant parse)
  - `Assistant.IsDirect(RouteResult route) : bool` — `IApp.Request`, or `Read`/`List` on any composed contract.
  - app setting `{"name": "RouteGate", "description": "Confidence (0-1) above which Jev answers a request directly, without the language model.", "default": "0.8"}`

**Steps**

- [ ] Write the failing fact `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RouteResultFacts.cs`:

```csharp
using DigitalBrain.AI.Routing;

namespace DigitalBrain.Modules.AI.Tests;

// What the assistant hands the language model when Jev is unsure: the chosen route first, then the
// next most likely capabilities, so tool choice is anchored without deciding for the model.
public sealed class RouteResultFacts
{
    [Fact]
    public void HintListsTheChosenRouteThenTheNextLikelyCapabilities()
    {
        var route = new RouteResult("DigitalBrain.Time.Timers.ITimer", "Start", 0.62,
            new() { ["timer"] = 0.62, ["apps.app2"] = 0.25, ["ui.text"] = 0.10, ["machine.console"] = 0.03 });

        var hint = route.Hint();

        Assert.StartsWith("Likely capabilities (Jev):\n- DigitalBrain.Time.Timers.ITimer.Start (0.62)", hint, StringComparison.Ordinal);
        Assert.Contains("- apps.app2 (0.25)", hint, StringComparison.Ordinal);
        Assert.Contains("- ui.text (0.10)", hint, StringComparison.Ordinal);
        Assert.DoesNotContain("machine.console", hint, StringComparison.Ordinal);
        Assert.DoesNotContain("- timer (", hint, StringComparison.Ordinal);
    }
}
```

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*HintLists*"` — expected: build failure (`Hint` missing).

- [ ] Add to `RouteResult` in `RouteResult.cs` (inside the record, after the parameter list, with `using System.Globalization;` and `using System.Text;`):

```csharp
{
    private const int MaxAlternatives = 3;

    // The chosen route, then the next most likely catalog ids. Ids are Orleans aliases (what the
    // catalog asked Jev over), so a reader maps them back through the catalog, not by name.
    public string Hint()
    {
        var builder = new StringBuilder("Likely capabilities (Jev):\n");
        builder.Append("- ").Append(Contract).Append('.').Append(Method).Append(" (").Append(Confidence.ToString("0.00", CultureInfo.InvariantCulture)).Append(')');
        var chosen = Probabilities.OrderByDescending(pair => pair.Value).Select(pair => pair.Key).FirstOrDefault();
        foreach (var (id, probability) in Probabilities.Where(pair => pair.Key != chosen).OrderByDescending(pair => pair.Value).Take(MaxAlternatives))
        { builder.Append("\n- ").Append(id).Append(" (").Append(probability.ToString("0.00", CultureInfo.InvariantCulture)).Append(')'); }
        return builder.ToString();
    }
}
```
  (The record's `;` becomes this body.)

- [ ] Run the fact again — expected: pass.

- [ ] Add to `OsAssistantAppFacts.cs`:

```csharp
    [Fact]
    public void TheShippedAssistantDeclaresTheRouteGateSetting()
    {
        var bundle = new EmbeddedShippedAppSource(typeof(OsCatalog).Assembly, "DigitalBrain.OS.Apps/", "os").Load()
            .Single(app => app.Name == "assistant");

        var gate = Assert.Single(bundle.Manifest.Settings, setting => setting.Name == "RouteGate");
        Assert.Equal("0.8", gate.Default);
        Assert.Contains("## Scenario: A confident route answers without the language model", bundle.Files["app.spec.md"], StringComparison.Ordinal);
    }
```

- [ ] Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*RouteGate*"` — expected: fail (no `RouteGate` setting).

- [ ] In `app.json`: bump `"version": "1.4.0"`, and add to `settings` after `Model`:

```json
    {
      "name": "RouteGate",
      "description": "Confidence (0-1) above which Jev answers a request directly, without the language model.",
      "default": "0.8"
    }
```

- [ ] In `app.spec.md`, after the first paragraph add:

```markdown
Before a message reaches the language model, Jev (the router) reads it against the contract catalog.
A route the router is at least `RouteGate` (default 0.8) sure of, and that is an app operation
(`IApp.Request`) or a pure read, is carried out directly through the router; the status line shows
the route and its outcome, and no language model turn runs. Any other route runs the agent turn as
usual, with the likely capabilities appended to the system prompt. Either way the router leaves a
`Routed` signal, so the shell can show which path answered.
```
  and after "## Scenario: A failed turn says so and the next message still works" add:

```markdown
## Scenario: A confident route answers without the language model

Sending "open calculator" while Jev routes it to `IApp.Request` with confidence above `RouteGate`
dispatches the request through the router: the calculator window opens, the status line names the
route and its confidence, and no turn is added to the transcript.

## Scenario: An unsure route runs the agent turn with Jev's hints

Sending a message Jev routes with confidence below `RouteGate` runs the agent turn; the turn's
system prompt ends with the likely capabilities Jev named, and the status line says Jev was unsure.

## Scenario: Jev being unavailable never blocks a message

When the System One integration is not ready, the message runs the agent turn as before and the
status line says Jev was unavailable.
```

- [ ] In `lib/Assistant.cs` add (usings `System.Globalization`, `DigitalBrain.AI.Routing`, `DigitalBrain.Apps`, `DigitalBrain.Apps` already present):

```csharp
    public const double DefaultRouteGate = 0.8;

    public static double RouteGate(AppSnapshot snapshot)
        => double.TryParse(snapshot.Settings.GetValueOrDefault("RouteGate", ""), NumberStyles.Float, CultureInfo.InvariantCulture, out var gate)
            && gate is >= 0 and <= 1 ? gate : DefaultRouteGate;

    // What Jev may carry out without the language model: an app operation, or a read that changes nothing.
    public static bool IsDirect(RouteResult route)
        => (route.Contract == typeof(IApp).FullName && route.Method == nameof(IApp.Request))
            || route.Method is "Read" or "List";

    public static Task Status(DigitalBrainConnection brain, string text)
        => brain.Get<IText>(Key(brain) + "/status").Set(text);
```

- [ ] Replace the body of the `await foreach` in `send.cs` (add usings `DigitalBrain.AI.Routing`, `DigitalBrain.AI.SystemOne`? no — only `DigitalBrain.AI.Routing` and `DigitalBrain.AI.Models` are needed):

```csharp
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation != "send" || request.Input.Length is < 1 or > 32000) { continue; }
    var snapshot = await app.Read();
    var router = brain.Get<IRouter>(Assistant.Scope(brain));
    var hint = "";
    try
    {
        var route = await router.Route(request.Input, null, brain.Stopping);
        if (route.Confidence >= Assistant.RouteGate(snapshot) && Assistant.IsDirect(route))
        {
            var outcome = await router.Dispatch(request.Input, [route.Contract], brain.Stopping);
            await Assistant.Status(brain, outcome.Dispatched
                ? $"Jev: {route.Contract}.{route.Method} ({route.Confidence:0.00}) → {outcome.Result ?? "done"}"
                : $"Jev chose {route.Contract}.{route.Method} but could not carry it out: {outcome.Error}");
            if (outcome.Dispatched) { continue; }
        }
        else { await Assistant.Status(brain, $"Jev unsure ({route.Confidence:0.00}); asking the model"); }
        hint = "\n\n" + route.Hint();
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Assistant.Status(brain, "Jev unavailable; asking the model. " + error.Message[..Math.Min(error.Message.Length, 200)]); }

    var choice = snapshot.Settings.GetValueOrDefault("Model", "");
    var model = choice.Length > 0 ? await brain.Get<IModelCatalog>("default").Select(choice) : null;
    var conversation = brain.Get<IAgent>(Assistant.Key(brain) + "/conversations/" + await Assistant.ConversationId(brain));
    await conversation.Start(AgentTurn.Text(request.Input, instructions: snapshot.Files.GetValueOrDefault("prompts/system.md", "") + hint, contracts: contracts)
        with { Model = model, RunId = request.RequestId.ToString("N") });
}
```
  Keep the existing `contracts` array and header comment; add after the comment: `// Jev first: a confident, direct route is carried out by the router; anything else anchors the model.`

- [ ] Compile the app the way the publish gate does: `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj` (the bundle is embedded; this proves the json/md are included) and `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*Assistant*"` — expected: pass. The script itself compiles at startup (`IBrainPrograms.Assign`); Task 6 proves it against the sandbox.

- [ ] Commit:
```
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Routing/RouteResult.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/RouteResultFacts.cs src/DigitalBrain.OS/Apps/Assistant/lib/Assistant.cs src/DigitalBrain.OS/Apps/Assistant/synapses/send.cs src/DigitalBrain.OS/Apps/Assistant/app.json src/DigitalBrain.OS/Apps/Assistant/app.spec.md src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsAssistantAppFacts.cs
git commit -m "Assistant: Jev routes first; a confident direct route skips the language model (RouteGate)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: Module facts for the gate over real grains with the fake System One

**Files**
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs` (create)

**Interfaces**
- Consumes: `FakeModelServer.StartAsync(ct)`, `FakeModelServer.SystemOneOverride : Func<JsonElement, string>?`, `FakeModelServer.ChatFallback`, `FakeModelServer.Requests(modelId)`, `ModuleTestBuilder.WithFakeModel(FakeModelServer)`, `IRouter.Route/Dispatch`, `IAgent.Run(AgentTurn, ct)`, `IApp.Create`, `host.SubscribeAsync<AppRequested>(app, ct)`, `RouteResult.Hint()`, `LLMModel.All`.
- Produces: three facts that mirror the synapse's two branches and the unavailable path. The synapse body itself runs only in the sandbox; its branch is proven in Task 6.

**Steps**

- [ ] Write `AssistantGateFacts.cs`:

```csharp
using System.Text.Json;
using DigitalBrain.AI;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models;
using DigitalBrain.AI.Routing;
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Platform.Integrations;
using DigitalBrain.Microsoft.CSharp;
using DigitalBrain.Postgres;
using DigitalBrain.Testing.Model;

namespace DigitalBrain.Modules.AI.Tests.Scenarios;

// The assistant's Jev-first gate over real grains: the fake System One answers with a scripted
// confidence; above the gate the router dispatches IApp.Request and no agent turn runs, below it
// the agent turn runs with Jev's hint in its instructions. The branch lives in the assistant's
// send synapse; these facts drive the same calls the synapse makes.
public sealed class AssistantGateFacts
{
    private const string Principal = "alice";
    private const string BrainName = "brain";
    private const string SystemPrompt = "You are the user's assistant.";
    private static readonly string Scope = BrainScope.Create(Principal, BrainName).Id;
    private static readonly string Calculator = IApp.Key(Scope, "calculator");
    private static readonly string Conversation = IApp.Key(Scope, "assistant") + "/conversations/main";

    [Fact]
    public async Task AboveTheGateTheAssistantAnswersWithoutAnAgentTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.SystemOneOverride = request => Choose(request, "apps.app2", "Request", 0.95);
        model.ChatFallback = request => Fill(request, Calculator, """["open",""]""");
        await using var host = await Start(model, ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        var app = host.Get<IApp>(Calculator);
        await app.Create(new AppManifest("Calculator", "keypad", [new("open", "open the keypad")], [], []), "spec");
        await using var requested = await host.SubscribeAsync<AppRequested>(app, ct);
        await using var signals = requested.ReadAllAsync(ct).GetAsyncEnumerator(ct);
        var router = host.Get<IRouter>(Scope);

        var route = await router.Route("open calculator", null, ct);
        Assert.True(route.Confidence >= 0.8 && route.Contract == typeof(IApp).FullName && route.Method == nameof(IApp.Request));
        var outcome = await router.Dispatch("open calculator", [route.Contract], ct);

        Assert.True(outcome.Dispatched, outcome.Error);
        Assert.True(await signals.MoveNextAsync());
        Assert.Equal("open", signals.Current.Operation);
        Assert.DoesNotContain(AllChatRequests(model), request => Text(request).Contains(SystemPrompt, StringComparison.Ordinal));
    }

    [Fact]
    public async Task BelowTheGateTheAgentTurnRunsWithJevsHints()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.SystemOneOverride = request => Choose(request, "apps.app2", "Request", 0.41);
        await using var host = await Start(model, ct);
        Stamp();
        await host.AuthorizeCallerAsync();
        var router = host.Get<IRouter>(Scope);

        var route = await router.Route("what can you do?", null, ct);
        Assert.True(route.Confidence < 0.8);
        var events = new List<AgentTurnEvent>();
        await foreach (var item in host.Get<IAgent>(Conversation).Run(
            AgentTurn.Text("what can you do?", instructions: SystemPrompt + "\n\n" + route.Hint(), contracts: ShippedAssistant.Contracts()), ct))
        { events.Add(item); }

        Assert.Empty(events.OfType<AgentTurnEvent.Failed>());
        var turn = Assert.Single(AllChatRequests(model), request => Text(request).Contains(SystemPrompt, StringComparison.Ordinal));
        Assert.Contains("Likely capabilities (Jev):", Text(turn), StringComparison.Ordinal);
        Assert.Contains(typeof(IApp).FullName + ".Request (0.41)", Text(turn), StringComparison.Ordinal);
    }

    [Fact]
    public async Task WhenSystemOneIsUnavailableTheAssistantStillRunsTheAgentTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        await using var host = await ModuleTest.Create().WithFakeModel(model)
            .WithModule<AIModule>().RequireModules([new AppsModule(), new DigitalBrain.Compute.ComputeModule(), new DigitalBrain.Flutter.FlutterModule()])
            .WithModule<CSharpModule>().WithModule<PostgresModule>().WithModule<DigitalBrain.Machine.MachineModule>().WithReminders()
            .StartAsync(ct);
        Stamp();
        await host.AuthorizeCallerAsync();

        await Assert.ThrowsAsync<ProviderUnavailableException>(() => host.Get<IRouter>(Scope).Route("open calculator", null, ct));
        var events = new List<AgentTurnEvent>();
        await foreach (var item in host.Get<IAgent>(Conversation).Run(AgentTurn.Text("open calculator", instructions: SystemPrompt), ct)) { events.Add(item); }

        Assert.Empty(events.OfType<AgentTurnEvent.Failed>());
        Assert.Single(AllChatRequests(model), request => Text(request).Contains(SystemPrompt, StringComparison.Ordinal));
    }

    private static Task<ModuleBrain> Start(FakeModelServer model, CancellationToken ct)
    {
        var root = new Uri(model.Endpoint, "/").AbsoluteUri.TrimEnd('/');
        return ModuleTest.Create().WithFakeModel(model).WithExecution(new TestExecutionOptions
        {
            PrivateConfiguration = new Dictionary<string, string?>
            {
                [IntegrationSchema.Key("typesafe", "ApiKey")] = "test-key",
                [IntegrationSchema.Key("typesafe", "Endpoint")] = root,
            },
        })
            .WithModule<AIModule>().RequireModules([new AppsModule(), new DigitalBrain.Compute.ComputeModule(), new DigitalBrain.Flutter.FlutterModule()])
            .WithModule<CSharpModule>().WithModule<PostgresModule>().WithModule<DigitalBrain.Machine.MachineModule>().WithReminders()
            .StartAsync(ct);
    }

    // Scripted Jev: the capability question picks `contractId`, the method question picks `method`.
    private static string Choose(JsonElement request, string contractId, string method, double confidence)
    {
        var answers = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var question in request.GetProperty("questions").EnumerateObject())
        {
            var options = question.Value.GetProperty("criteria").EnumerateObject().Select(option => option.Name).ToArray();
            var pick = options.Contains(contractId) ? contractId : options.Contains(method) ? method : options[0];
            var probabilities = options.ToDictionary(option => option, option => option == pick ? confidence : (options.Length > 1 ? (1 - confidence) / (options.Length - 1) : 0.0));
            answers[question.Name] = new { type = "choice", choice = pick, probabilities, confidence };
        }
        return JsonSerializer.Serialize(new { model = "fake-jev", answers });
    }

    // The router's fill prompt gets a valid IApp.Request call; everything else keeps the echo default.
    private static FakeReply? Fill(JsonElement request, string key, string arguments)
        => Text(request).Contains("Fill one neuron call", StringComparison.Ordinal)
            ? FakeReply.Text("{\"key\":\"" + key + "\",\"arguments\":" + arguments + "}")
            : null;

    private static IEnumerable<JsonElement> AllChatRequests(FakeModelServer model)
        => LLMModel.All.SelectMany(catalogued => model.Requests(catalogued.Id));

    private static string Text(JsonElement request)
        => string.Concat(request.GetProperty("messages").EnumerateArray().SelectMany(message =>
            message.GetProperty("content").ValueKind == JsonValueKind.String
                ? [message.GetProperty("content").GetString() ?? ""]
                : message.GetProperty("content").EnumerateArray().Where(part => part.TryGetProperty("text", out _)).Select(part => part.GetProperty("text").GetString() ?? "")));

    private static void Stamp() => CallerContextStamper.Stamp(new()
    { PrincipalId = Principal, AccountId = Principal, BrainId = BrainName, Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
}
```
  Notes for the implementer: `"apps.app2"` is `IApp`'s Orleans alias — the catalog ids Jev chooses over are aliases (`ContractCatalog` line 62). The `instructions` text reaches the chat request as the system message; if `AgentTurnLoop` places instructions elsewhere (check with LSP), adjust `Text` to include that field. If the test project lacks a reference to `DigitalBrain.Testing.Model`, it comes transitively through `DigitalBrain.Testing.Module` (that is where `WithFakeModel` lives); otherwise add the project reference.

- [ ] Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*AssistantGateFacts*"` — expected before Task 4's `Hint()` existed: build failure; now expected: the three facts pass (they exercise Task 1–4 code). If `AboveTheGate…` fails on `Dispatch` with "The model did not supply a neuron key", the fill prompt text changed — align `Fill`'s marker with `RouterNeuron.Fill`'s instructions string.

- [ ] Run the whole AI suite as the regression net: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests` — expected: green (kill and debug anything over 5 minutes).

- [ ] Commit:
```
git add src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Scenarios/AssistantGateFacts.cs
git commit -m "AI tests: the assistant gate over real grains with a scripted System One

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: AppHost line and the end-to-end gate fact

**Files**
- Modify: `src/DigitalBrain.AppHost/AppHost.cs` (`ai.WithDefaultSystemOne<ILocalJev>();`)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/RouterHostFixture.cs` (`Fill` also answers `IApp.Request`)
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssistantGateFacts.cs` (create)

**Interfaces**
- Consumes: `RouterHostFixture` (fake model answers `/v1/systemone` and the fill prompt), `BrainFact`, `Brain.HttpClient.PostAsJsonAsync($"/brains/{scope}/apps/assistant/request", …)`, `Brain.Observe<TextChanged>(IText, ct)`, `IWorkspace.Read().Windows`, `Model.Requests(modelId)`.
- Produces: the AppHost declaration `ai.WithDefaultSystemOne<ILocalJev>();`; an E2E fact proving the real synapse takes the direct path.

**Steps**

- [ ] Write `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssistantGateFacts.cs`:

```csharp
using System.Net.Http.Json;
using DigitalBrain.AI.Models;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Text.Signals;
using DigitalBrain.Flutter.Workspace;

namespace DigitalBrain.OS.Tests.E2E;

// The assistant's send synapse, in the sandbox, asks Jev first: "open calculator" is routed to
// IApp.Request above the gate, dispatched by the router, and never reaches a language-model turn.
public sealed class AssistantGateFacts(RouterHostFixture host) : BrainFact(host)
{
    [Fact(Timeout = 300_000)]
    public async Task OpenCalculatorIsDispatchedByJevWithoutAnAgentTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        var scope = Brain.WorkspaceId;
        var status = Brain.Get<IText>(scope + "/apps/assistant/status");
        await using var changes = await Brain.Observe<TextChanged>(status, ct);
        Host.Model.SystemOneOverride = request => RouterHostFixture.Choose(request, "apps.app2", "Request", 0.95);

        using var sent = await Brain.HttpClient.PostAsJsonAsync($"/brains/{scope}/apps/assistant/request",
            new { operation = "send", input = "open calculator" }, ct);
        sent.EnsureSuccessStatusCode();

        while (!(await status.Read()).Markdown.StartsWith("Jev: ", StringComparison.Ordinal)) { await changes.NextAsync(ct: ct); }
        Assert.Contains(typeof(DigitalBrain.Apps.IApp).FullName + ".Request (0.95)", (await status.Read()).Markdown, StringComparison.Ordinal);
        Assert.Contains((await Brain.Get<IWorkspace>(scope).Read()).Windows, window => window.Reference.NeuronId.EndsWith("/apps/calculator/surface", StringComparison.Ordinal));
        Assert.DoesNotContain(LLMModel.All.SelectMany(model => Host.Model.Requests(model.Id)),
            request => RouterHostFixture.Text(request).Contains("You are the user's assistant", StringComparison.Ordinal));
    }
}
```
  (`Host` is the fixture property `BrainFact` exposes — confirm its name with LSP on `BrainFact`; `ReferenceBrainFixture.Model` is the `FakeModelServer`.)

- [ ] In `RouterHostFixture.cs`: make the fill answer the app call too, and expose the helpers the fact uses:

```csharp
    private static FakeReply? Fill(JsonElement request)
    {
        var text = Text(request);
        if (!text.Contains("Fill one neuron call", StringComparison.Ordinal)) { return null; }
        var scope = Regex.Match(text, @"brain scope is (\S+)\.") is { Success: true } match ? match.Groups[1].Value : "scope";
        return text.Contains("Method: " + nameof(DigitalBrain.Apps.IApp.Request), StringComparison.Ordinal) || text.Contains("Request(", StringComparison.Ordinal)
            ? FakeReply.Text("{\"key\":\"" + scope + "/apps/calculator\",\"arguments\":[\"open\",\"\"]}")
            : FakeReply.Text("{\"key\":\"" + scope + "/timer\",\"arguments\":[\"00:05:00\",null]}");
    }

    internal static string Text(JsonElement request)
        => string.Concat(request.GetProperty("messages").EnumerateArray().SelectMany(message =>
            message.GetProperty("content").ValueKind == JsonValueKind.String
                ? [message.GetProperty("content").GetString() ?? ""]
                : message.GetProperty("content").EnumerateArray()
                    .Where(part => part.TryGetProperty("text", out _))
                    .Select(part => part.GetProperty("text").GetString() ?? "")));

    // Scripted Jev for a fact: the capability question picks contractId, the method question picks method.
    internal static string Choose(JsonElement request, string contractId, string method, double confidence)
    {
        var answers = new Dictionary<string, object>(StringComparer.Ordinal);
        foreach (var question in request.GetProperty("questions").EnumerateObject())
        {
            var options = question.Value.GetProperty("criteria").EnumerateObject().Select(option => option.Name).ToArray();
            var pick = options.Contains(contractId) ? contractId : options.Contains(method) ? method : options[0];
            var probabilities = options.ToDictionary(option => option, option => option == pick ? confidence : (options.Length > 1 ? (1 - confidence) / (options.Length - 1) : 0.0));
            answers[question.Name] = new { type = "choice", choice = pick, probabilities, confidence };
        }
        return JsonSerializer.Serialize(new { model = "fake-jev", answers });
    }
```
  (`RouterHostFacts` keeps using the default System One pick — "timer" — because it never sets the override; `AssistantGateFacts` sets it per test and the fixture is per-class, so the two classes do not share a server.)

- [ ] In `AppHost.cs` add `using DigitalBrain.AI.Models.Ollama;` (already present for `IQwen35`? it is — `DigitalBrain.AI.Models.Ollama` is imported) and inside the `WithHosting<AIModuleHosting, AIOptions>` lambda after `ai.WithVoiceToText<IWhisperLargeV3Turbo>();`:

```csharp
        ai.WithDefaultSystemOne<ILocalJev>();
```

- [ ] Build: `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` and `dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj` — expected: clean.

- [ ] Run (needs Docker with Linux containers; the fixture boots the product with the csharp-sandbox):
  `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*OpenCalculatorIsDispatched*"` — expected: pass. Then the existing router fact for regression: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*ARequestRoutesThroughJev*"` — expected: pass. If the window assertion fails but the status line shows "Jev: … → …", the calculator's `open` synapse opens a different window id — read the calculator's `synapses/calculator.cs` and match its `EnsureOpenAsync` window id.

- [ ] Commit:
```
git add src/DigitalBrain.AppHost/AppHost.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/RouterHostFixture.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssistantGateFacts.cs
git commit -m "AppHost hosts the local Jev; E2E: open calculator is dispatched by Jev without an agent turn

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: Verification loop — seen running

**Files**
- None created or modified (fix forward in the task that owns a failure; never a timeout or polling band-aid).

**Interfaces**
- Consumes: `aspire run` from `src/DigitalBrain.AppHost`, Aspire MCP (`mcp__aspire__list_resources`, `list_console_logs`, `list_traces`, `list_trace_structured_logs`, `list_structured_logs`), `digitalbrain-mcp` at `localhost:5081/mcp` (`neurons_context`, `neurons_search`, `neurons_get`, `neurons_call`).

**Steps**

- [ ] Build clean: LSP diagnostics show no errors; `dotnet build` for `DigitalBrain.Modules.AI.Contracts`, `DigitalBrain.Modules.AI`, `DigitalBrain.Modules.AI.Aspire.Hosting`, `DigitalBrain.OS`, `DigitalBrain.AppHost` (one `dotnet build src/<path>/<Project>.csproj` each).

- [ ] Run it: `aspire run` from `src/DigitalBrain.AppHost`. Then `mcp__aspire__list_resources`: every resource Running/Healthy, and the list contains **`systemone`** (container, health `/health`) and its Ollama backing model `llama3-1` (name through `brain.ResourceName`). If `systemone` is not Healthy, `list_console_logs` for `systemone` first (uvicorn must log `Application startup complete`; a failing image build shows the Docker error here), then for the Ollama model resource (the `llama3.1` pull must finish before the adapter is waited on).

- [ ] Confirm the adapter is the integration target: with `digitalbrain-mcp` (`/brains/{brainId}/mcp`), `neurons_context` to confirm caller and brain; `neurons_search` for `ISystemOne`; `neurons_call` `DigitalBrain.AI.SystemOne.ISystemOne.Ask` on key `{brain}` with
  `[{"state":"open calculator","questions":{"q":{"type":"Choice","instructions":"Which?","criteria":{"apps.app2":"Apps","timer":"Timers"}}}}]`
  — the result's `model` is `llama3.1` (the catalog id, not `jev-latest`), and `Answers.q` carries probabilities and a confidence.

- [ ] Drive the spec's running check: in the shell's dock (or `neurons_call` `DigitalBrain.Apps.IApp.Request` on `{brain}/apps/assistant` with `["send","open calculator"]`), send **"open calculator"**. Then:
  - `neurons_get` `{brain}/apps/assistant/status` — Markdown starts with `Jev: DigitalBrain.Apps.IApp.Request (…)` and ends with the dispatch result.
  - `neurons_get` `DigitalBrain.Flutter.Workspace.IWorkspace` on `{brain}` — a window referencing `{brain}/apps/calculator/surface` is open.
  - `neurons_get` `{brain}/apps/assistant/conversations/main` (`IAgent.Read`) — no new run was added for this request id.
  If the local model's confidence sits below 0.8 for a genuine prompt, do not lower the default: set the brain's `RouteGate` setting through `IApp.Configure` on `{brain}/apps/assistant` (`[{"Model":"","RouteGate":"0.6"}, {}]`) and repeat — that is the per-brain knob the spec asks for; record the observed confidence in the report.

- [ ] Confirm in telemetry with the Aspire MCP: `list_traces` for `OperatingSystem` shows, for that request, spans for `ISystemOne.Ask` (two for `Route`, two more for `Dispatch`'s re-route), the `Routed` publication, the `Fill` chat completion (`chat …` span against `systemone`'s sibling LLM provider), and the `IApp.Request` call on the calculator — and **no `IAgent.Start`/agent-turn span** for the assistant conversation. `list_trace_structured_logs` on that trace follows it end to end; `list_structured_logs` shows no `ProviderUnavailableException`. Then send a vague message ("hmm what now?") and confirm the opposite shape: status says "Jev unsure", the trace has the agent-turn span and the chat request's system message ends with `Likely capabilities (Jev):`.

- [ ] Regression net: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`, `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting`, `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit`, `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-method "*Jev*"` and `… "*OpenCalculatorIsDispatched*"`, `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests` (key grammar; the new hosting file derives every key from `AIKeys`/`IntegrationSchema.Key`). Nothing to commit unless a fix was needed; a fix is committed in its owning task's file set with the same attribution line.

---

## Spec gaps (decided here, confirm with the owner)

- **"No language model is called" / "no model span."** `IRouter.Dispatch` re-routes and runs `RouterNeuron.Fill` (one chat completion for key + arguments) by design of the existing router. This plan keeps that and reads the spec's check as "no *agent-turn* span and no chat request carrying the assistant system prompt" (Tasks 5–7). Removing the fill for `IApp.Request` would need the router to know which app — a router-contract change, so not improvised here.
- **"Step card" for the Jev path.** The assistant transcript is projected from `IAgent` state (`projection.cs`); a turn answered without an agent run has no entry there, and giving `IAgent` a way to record a model-less turn is a contract change. The plan shows the Jev path on the existing `{app}/status` text neuron in the surface header (already composed by `Assistant.ComposeAsync`), and leaves transcript cards for a follow-up design.
- **Which Ollama model backs `ILocalJev`.** The compose file's default `llama3.1` is used as the catalog `Id` (Task 1); the adapter's `SYSTEMONE_MODEL` and the Ollama model resource follow it. Swapping to a model the host already pulls (e.g. `qwen3.5:4b`) is a one-line `Id` change.
- **Resource naming.** The spec names the adapter `systemone`; the plan uses that literal (as `CSharpModuleHosting.ResourceName = "csharp-sandbox"` does) rather than `brain.ResourceName("systemone")`, so the dashboard and the infrastructure strip show exactly `systemone`.
- **Unavailable Jev.** The spec does not say what the assistant does when the `typesafe` integration is not Ready; the plan falls through to the agent turn with a status line (Task 4, pinned in Task 5).
