# Run profile implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The product boot takes a typed `BrainProfile` (`RunProfile.Local` or `RunProfile.Cloud`), and a missing merchant secret no longer refuses to start the OS.

**Architecture:** `BrainProfile` lives in the AppHost project and carries the module options the product sets. An AppHost-local `AddDigitalBrain(builder, name, profile)` calls the existing builder, then `WithHosting<THosting, TOptions>(options)` for each property. Cloud models and connector secrets stop creating Aspire parameters. Non-empty `DigitalBrain:Integrations:*` values are projected onto the silo, and the existing seeder reads them. `OsCatalog` still decides which neurons exist.

**Tech Stack:** C# / .NET 11, Aspire AppHost, Orleans, xUnit v3 facts, `DigitalBrain.Testing`.

**Spec:** `docs/superpowers/specs/2026-10-15-run-profile-design.md`

## Global Constraints

- The master key stays a required Aspire parameter (`MasterKey.Provision`). A Postgres, Azurite, or other container this host starts keeps its resource reference.
- `OsCatalog`, `OsApps`, `IntegrationSeeder`, `IIntegration.Seed`, and `PersonFields` stay. Do not reshape integration grain state.
- Monnet, Equifax, RiskSeal, and Twilio stay unwired in `OsCatalog` and the AppHost.
- `DigitalBrain.Aspire.Hosting` must not gain a project reference to a module options assembly. `BrainProfile` lives in `src/DigitalBrain.AppHost`.
- Every `RunProfile` get allocates a new graph. `AIOptions` extensions mutate the instance they are called on.
- `DigitalBrain:Profile` does not select Local or Cloud. The symbol in `AppHost.cs` does.
- Warnings are errors. Nullable is on. Tests are facts with sentence names and `TestContext.Current.CancellationToken`. Build and test per project, never the `.slnx`.
- Map call sites with LSP (`findReferences`, `goToDefinition`) before editing. Do not grep source for the symbol.

## Review Focus

- A cloud model with no API key in configuration builds a model that contains no merchant `ParameterResource`, and reading that key is not what fails the build.
- `RunProfile.Local` starts Ollama; `RunProfile.Cloud` does not. Two gets of `RunProfile.Local` do not share an `AIOptions` instance.
- A non-empty `DigitalBrain:Integrations:{id}:{Field}` on the AppHost is projected onto the silo. A blank value is not projected.
- `ReferenceBrain` boots without `Parameters:modules-openai-api-key`, `modules-gmail-client-*`, or `modules-salesforce-consumer-*`. The OpenAI key it does pass uses `IntegrationSchema.Key("openai", "ApiKey")`. `WithLocalMcp` does not create a consumer-key parameter.
- The connections public origin is still projected from the silo HTTP endpoint after Gmail and Salesforce hosting are no longer applied.

---

### Task 1: Typed profile and `WithHosting(TOptions)`

**Files:**
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/Composition/DigitalBrainBuilder.cs` (the `WithHosting<THosting, TOptions>(Action<TOptions>?)` overload)
- Create: `src/DigitalBrain.AppHost/RunProfile.cs`
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/RunProfileFacts.cs`

**Interfaces:**
- Consumes: existing `WithHosting(IDigitalBrainModuleHosting, IReadOnlyDictionary<string, string?>?)`, `HostingModuleOptions.Flatten`, `IModuleOptions.Validate`.
- Produces:
  - `DigitalBrainBuilder.WithHosting<THosting, TOptions>(TOptions options)` where `THosting : IDigitalBrainModuleHosting, new()` and `TOptions : class, IModuleOptions, new()`.
  - `DigitalBrain.AppHost.BrainProfile`, a record with `required` `Orleans` (`OrleansOptions`), `Postgres` (`PostgresModuleOptions`), `Qdrant` (`QdrantModuleOptions`), `ClickHouse` (`ClickHouseModuleOptions`), `Supabase` (`SupabaseModuleOptions`), `Ai` (`AIOptions`).
  - `RunProfile.Local`, `RunProfile.Cloud`, `RunProfile.Reference`, each a `BrainProfile` get.
  - `RunProfile.Apply(DigitalBrainBuilder brain, BrainProfile profile)` returning `DigitalBrainBuilder`.
  - `AppHostDigitalBrain.Add(IDistributedApplicationBuilder builder, string name, BrainProfile profile, DigitalBrainHostingOptions? hosting = null)` returning `DigitalBrainBuilder`.

- [ ] **Step 1: Write the failing fact**

`src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj` already references the AppHost with `Aliases="AppHost"`. Add `RunProfileFacts.cs`:

```csharp
extern alias AppHost;
using AppHost::DigitalBrain.AppHost;

namespace DigitalBrain.OS.Tests.Unit;

public sealed class RunProfileFacts
{
    [Fact]
    public void LocalAndCloudAllocateDistinctOptionGraphs()
    {
        var first = RunProfile.Local;
        var second = RunProfile.Local;
        Assert.NotSame(first.Ai, second.Ai);
        first.Ai.Default.Model = "mutated";
        Assert.Equal("IQwen35", RunProfile.Local.Ai.Default.Model);
        Assert.Equal("IDeepSeekV41Flash", RunProfile.Cloud.Ai.Default.Model);
        Assert.Null(RunProfile.Cloud.Ai.Default.SystemOne);
        Assert.Equal("ILocalJev", RunProfile.Local.Ai.Default.SystemOne);
        Assert.False(RunProfile.Local.Ai.Tavily.Enabled);
        Assert.True(RunProfile.Cloud.Ai.Tavily.Enabled);
        Assert.Equal("http://127.0.0.1:1/v1/", RunProfile.Reference.Ai.OpenAI.Endpoint);
        Assert.False(RunProfile.Reference.Ai.Tavily.Enabled);
    }
}
```

- [ ] **Step 2: Run the fact and confirm it fails to compile**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj -- --filter-method "*LocalAndCloudAllocateDistinctOptionGraphs*"`

Expected: compile failure, `RunProfile` is not defined.

- [ ] **Step 3: Add the overload and the profile**

In `DigitalBrainBuilder`, next to the existing `Action<TOptions>` overload:

```csharp
public DigitalBrainBuilder WithHosting<THosting, TOptions>(TOptions options)
    where THosting : IDigitalBrainModuleHosting, new()
    where TOptions : class, DigitalBrain.Framework.Modules.IModuleOptions, new()
{
    ArgumentNullException.ThrowIfNull(options);
    var hosting = new THosting();
    options.Validate();
    return WithHosting(hosting, HostingModuleOptions.Flatten(options, hosting.Module.ToString()));
}
```

Create `src/DigitalBrain.AppHost/RunProfile.cs`. Copy the option calls that `AppHost.cs` makes today for Orleans, Postgres, Qdrant, ClickHouse, and Supabase into `Base()`. `Ai` is the only property `Local` and `Cloud` replace.

```csharp
namespace DigitalBrain.AppHost;

public sealed record BrainProfile
{
    public required OrleansOptions Orleans { get; init; }
    public required PostgresModuleOptions Postgres { get; init; }
    public required QdrantModuleOptions Qdrant { get; init; }
    public required ClickHouseModuleOptions ClickHouse { get; init; }
    public required SupabaseModuleOptions Supabase { get; init; }
    public required AIOptions Ai { get; init; }
}

public static class RunProfile
{
    public static BrainProfile Local => Base() with { Ai = LocalAi() };
    public static BrainProfile Cloud => Base() with { Ai = CloudAi() };
    public static BrainProfile Reference => Base() with
    {
        Ai = CloudAi().WithoutWebSearch().WithModelEndpoint(AiProvider.OpenAI, new Uri("http://127.0.0.1:1/v1/")),
    };

    public static DigitalBrainBuilder Apply(DigitalBrainBuilder brain, BrainProfile profile)
    {
        ArgumentNullException.ThrowIfNull(brain);
        ArgumentNullException.ThrowIfNull(profile);
        return brain
            .WithHosting<OrleansModuleHosting, OrleansOptions>(profile.Orleans)
            .WithHosting<PostgresModuleHosting, PostgresModuleOptions>(profile.Postgres)
            .WithHosting<QdrantModuleHosting, QdrantModuleOptions>(profile.Qdrant)
            .WithHosting<ClickHouseModuleHosting, ClickHouseModuleOptions>(profile.ClickHouse)
            .WithHosting<SupabaseModuleHosting, SupabaseModuleOptions>(profile.Supabase)
            .WithHosting<AIModuleHosting, AIOptions>(profile.Ai)
            .WithHosting<GitHubModuleHosting>()
            .WithHosting<AspireModuleHosting>()
            .WithHosting<CSharpModuleHosting>()
            .WithHosting<ArtCraftModuleHosting, ArtCraftModuleOptions>(artcraft => artcraft.WithHostedApps())
            .WithModule<PlaywrightModule, PlaywrightModuleOptions>(playwright => playwright.AppOrigins = ArtCraftModuleOptions.HostedOrigins);
    }

    private static BrainProfile Base() => new()
    {
        Orleans = new OrleansOptions().WithAzurite(),
        Postgres = new PostgresModuleOptions().WithPostgres(options => options.DatabaseName = "digitalbrain"),
        Qdrant = new QdrantModuleOptions().WithHostedQdrant(),
        ClickHouse = new ClickHouseModuleOptions().WithClickHouse(),
        Supabase = new SupabaseModuleOptions().WithConnection("supabase"),
        Ai = new AIOptions(),
    };

    private static AIOptions LocalAi() => new AIOptions()
        .WithDefaultLlm<IQwen35>()
        .WithDefaultEmbedding<IEmbeddingGemma>()
        .WithVoiceToText<IWhisperSmall>()
        .WithDefaultSystemOne<ILocalJev>()
        .WithoutWebSearch();

    private static AIOptions CloudAi() => new AIOptions()
        .WithLlm<IGpt56Luna>()
        .WithDefaultLlm<IDeepSeekV41Flash>()
        .WithDefaultEmbedding<ITextEmbedding3Small>()
        .WithVoiceToText<IWhisperLargeV3Turbo>()
        .WithoutLocalModels()
        .WithTavilySearch();
}
```

Use the real namespaces and usings from `AppHost.cs`. If `WithPostgres`, `WithClickHouse`, `WithConnection`, or `WithHostedQdrant` is an extension on the options type, call it the same way `AppHost.cs` calls it inside the lambda. Do not invent a second options shape.

Add the entry point beside `RunProfile`:

```csharp
public static class AppHostDigitalBrain
{
    public static DigitalBrainBuilder Add(IDistributedApplicationBuilder builder, string name, BrainProfile profile, DigitalBrainHostingOptions? hosting = null)
    {
        ArgumentNullException.ThrowIfNull(profile);
        return RunProfile.Apply(builder.AddDigitalBrain(name, hosting), profile);
    }
}
```

Gmail, Salesforce, and the four SV modules are not in `Apply`.

- [ ] **Step 4: Run the fact**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj -- --filter-method "*LocalAndCloudAllocateDistinctOptionGraphs*"`

Expected: PASS. `Cloud.Ai.Default.SystemOne` is null because `CloudAi` never calls `WithDefaultSystemOne` and `WithoutLocalModels` clears a local one.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/Composition/DigitalBrainBuilder.cs src/DigitalBrain.AppHost/RunProfile.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/RunProfileFacts.cs
git commit -m "Add a typed run profile for the product boot."
```

---

### Task 2: Merchant parameters stop gating boot

**Files:**
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/AIHostingState.cs` (`EnsureProviderApiKey`, `EnableTavilySearch`, the projection loop that writes `_providerApiKeys` and `_tavilyApiKey`)
- Modify: `src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting/GmailModuleHosting.cs`
- Modify: `src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting/GmailHostingExtensions.cs` (the `AddParameter` lines for client id and client secret)
- Modify: `src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce.Aspire.Hosting/SalesforceModuleHosting.cs`
- Modify: `src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce.Aspire.Hosting/SalesforceHostingExtensions.cs` (the `AddParameter` lines for consumer key and consumer secret)
- Modify: `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs` (`WithReference`, after `brain.Settings` is projected)
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/SystemOneHostingFacts.cs`
- Test: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/CloudModelSecretFacts.cs`

**Interfaces:**
- Consumes: `IntegrationSchema.Key`, `DigitalBrainConfiguration.EnvironmentName`, `AIHostingExtensions.ConfigureDeclaration`.
- Produces: cloud `ConfigureDeclaration` adds no `ParameterResource` for a provider API key or the Tavily key. `WithReference` copies non-whitespace `DigitalBrain:Integrations:*` configuration onto the resource and sets `ConnectionsPublicOriginKey` from the resource HTTP endpoint when that variable is not already set.

- [ ] **Step 1: Write the failing facts**

In `SystemOneHostingFacts.WithDefaultSystemOneJevAsksForTheHostedKeyAndHostsNoContainer`, replace the assertion that `environment[ApiKeyKey]` is a `ParameterResource` with:

```csharp
Assert.DoesNotContain(ApiKeyKey, environment.Keys);
Assert.DoesNotContain(builder.Resources.OfType<ParameterResource>(), resource => resource.Name.Contains("api-key", StringComparison.OrdinalIgnoreCase));
```

Keep the assertion that no systemone container exists and that `DefaultKey` is `IJev`.

Add `CloudModelSecretFacts.cs` in the same project, using `CreateBuilder` and `ConfigurationOf` the way `SystemOneHostingFacts` does:

```csharp
[Fact]
public async Task ACloudModelProjectsNoApiKeyParameterAndForwardsAConfiguredKey()
{
    var ct = TestContext.Current.CancellationToken;
    var builder = CreateBuilder();
    builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
    {
        [IntegrationSchema.Key("openrouter", "ApiKey")] = "sk-test",
        [IntegrationSchema.Key("openai", "ApiKey")] = "  ",
    });
    var brain = builder.AddDigitalBrain("brain", new() { PersistentStorage = false })
        .WithHosting<AIModuleHosting, AIOptions>(ai => ai.WithDefaultLlm<IDeepSeekV41Flash>().WithTavilySearch().WithoutLocalModels());
    var consumer = builder.AddExecutable("consumer", "unused", ".").WithReference(brain);

    Assert.DoesNotContain(builder.Resources.OfType<OllamaModelResource>(), _ => true);
    Assert.DoesNotContain(builder.Resources.OfType<ParameterResource>(), resource =>
        resource.Name.Contains("api-key", StringComparison.OrdinalIgnoreCase));
    var environment = await ConfigurationOf(builder, consumer.Resource, ct);
    Assert.Equal("sk-test", Assert.IsType<string>(environment[IntegrationSchema.Key("openrouter", "ApiKey")]));
    Assert.DoesNotContain(IntegrationSchema.Key("openai", "ApiKey"), environment.Keys);
    Assert.Contains(DigitalBrainConfiguration.ConnectionsPublicOriginKey, environment.Keys);
}
```

`OllamaModelResource` is the type `SystemOneHostingFacts` already asserts for a local model. The option chain in the next fact is the same chain as `RunProfile.LocalAi`.

```csharp
[Fact]
public void ALocalModelStartsOllamaAndCreatesNoApiKeyParameter()
{
    var builder = CreateBuilder();
    builder.AddDigitalBrain("brain", new() { PersistentStorage = false })
        .WithHosting<AIModuleHosting, AIOptions>(ai => ai
            .WithDefaultLlm<IQwen35>()
            .WithDefaultEmbedding<IEmbeddingGemma>()
            .WithVoiceToText<IWhisperSmall>()
            .WithDefaultSystemOne<ILocalJev>()
            .WithoutWebSearch());

    Assert.Contains(builder.Resources.OfType<OllamaModelResource>(), _ => true);
    Assert.DoesNotContain(builder.Resources.OfType<ParameterResource>(), resource =>
        resource.Name.Contains("api-key", StringComparison.OrdinalIgnoreCase));
}
```

- [ ] **Step 2: Run the facts and confirm they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj -- --filter-method "*WithDefaultSystemOneJevAsksForTheHostedKeyAndHostsNoContainer*|*ACloudModelProjectsNoApiKeyParameterAndForwardsAConfiguredKey*|*ALocalModelStartsOllamaAndCreatesNoApiKeyParameter*"`

Expected: FAIL. The Jev fact still finds a `ParameterResource`. The cloud fact finds an `api-key` parameter and does not see `sk-test` on the consumer. The local fact finds an `api-key` parameter if `EnsureProviderApiKey` still runs for a sibling cloud model; with only local models it may already pass the parameter assertion and fail only if Ollama is missing. A failure of either new fact is the signal to implement Step 3.

- [ ] **Step 3: Stop creating the parameters and project integration configuration**

In `AIHostingState.AddModel`, delete the `EnsureProviderApiKey(provider)` call in the non-Ollama branch. Leave the Ollama branch as it is. Delete `EnsureProviderApiKey` and `_providerApiKeys` if nothing else reads them. LSP `findReferences` on both before deleting.

In `EnableTavilySearch`, stop calling `AddParameter`. Tavily stays enabled through the `AIOptions.Tavily.Enabled` value that `Flatten` already projects. Delete `_tavilyApiKey` and its `WithEnvironment` block if no reader remains.

In `GmailModuleHosting.Configure`, do not call `WithGmail`. Leave the method as `ArgumentNullException.ThrowIfNull(brain)`. In `GmailHostingState`, delete the `AddParameter` calls for `gmail-client-id` and `gmail-client-secret` and the `WithEnvironment` lines that bound those parameters. Do not move the public-origin projection into this class.

In `SalesforceModuleHosting.Configure`, do not call `WithHostedMcp`. The `HostMcp` option remains an ordinary module option. In `SalesforceHostingState`, delete the `AddParameter` calls for the consumer key and consumer secret and the `WithEnvironment` lines that bound those parameters.

In `WithReference`, after the `brain.Settings` loop:

```csharp
foreach (var pair in configuration.GetSection(IntegrationSchema.SectionName).AsEnumerable())
{
    if (string.IsNullOrWhiteSpace(pair.Value) || pair.Key.Equals(IntegrationSchema.SectionName, StringComparison.OrdinalIgnoreCase))
    { continue; }
    builder.WithEnvironment(DigitalBrainConfiguration.EnvironmentName(pair.Key), pair.Value);
}
builder.WithEnvironment(context =>
{
    var origin = DigitalBrainConfiguration.EnvironmentName(DigitalBrainConfiguration.ConnectionsPublicOriginKey);
    if (!context.EnvironmentVariables.ContainsKey(origin))
    { context.EnvironmentVariables[origin] = builder.GetEndpoint("http"); }
});
```

`configuration` in this method is `builder.ApplicationBuilder.Configuration` only later in the method. Read it from `brain.ApplicationBuilder.Configuration` here. Skip whitespace so a blank user secret is not projected. `IntegrationSeeder` is unchanged.

LSP `findReferences` on `EnsureProviderApiKey`, `WithGmail`, and `WithHostedMcp`. Update every remaining fact that expects those parameters. `SystemOneHostingFacts` for `ILocalJev` still expects the local adapter and the constant `SystemOneApiKeyLocal` string. Leave that fact's assertions.

- [ ] **Step 4: Run the hosting facts**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj`

Expected: PASS, including the Jev fact, `ACloudModelProjectsNoApiKeyParameterAndForwardsAConfiguredKey`, and `ALocalModelStartsOllamaAndCreatesNoApiKeyParameter`.

Also run the Gmail and Salesforce hosting test projects if LSP showed facts in them:

`dotnet test --project src/DigitalBrain.Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests.Hosting/DigitalBrain.Modules.Google.Gmail.Tests.Hosting.csproj`

`dotnet test --project src/DigitalBrain.Modules/Salesforce/tests/DigitalBrain.Modules.Salesforce.Tests.Hosting/DigitalBrain.Modules.Salesforce.Tests.Hosting.csproj`

Use the path LSP reports if the folder name differs. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/Configuration/AIHostingState.cs src/DigitalBrain.Modules/Google/Gmail/DigitalBrain.Modules.Google.Gmail.Aspire.Hosting src/DigitalBrain.Modules/Salesforce/DigitalBrain.Modules.Salesforce.Aspire.Hosting src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting
git commit -m "Stop merchant secrets from gating the host."
```

---

### Task 3: AppHost applies `RunProfile.Cloud`

**Files:**
- Modify: `src/DigitalBrain.AppHost/AppHost.cs` (the `WithHosting` chain, about lines 39–74)
- Modify: `src/DigitalBrain.AppHost/profiles/local.json`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs` (`ProductMatchesTheReferenceCompositionModuleSet`)
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Testing/ReferenceBrain.cs`
- Test: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/RunProfileFacts.cs`

**Interfaces:**
- Consumes: `AppHostDigitalBrain.Add`, `RunProfile.Cloud`, `RunProfile.Reference`, `IntegrationSchema.Key`.
- Produces: the AppHost entry point applies `RunProfile.Cloud`. Reference boot overlays `RunProfile.Reference.Ai` through `WithOptions<AIModule, AIOptions>` and passes the model key as `IntegrationSchema.Key("openai", "ApiKey")`.

- [ ] **Step 1: Extend the failing product fact**

In `ProductCompositionFacts.ProductMatchesTheReferenceCompositionModuleSet`, replace the `Modules-openrouter-api-key` assertion and the assertion that the OpenRouter `ApiKey` environment entry exists with:

```csharp
Assert.DoesNotContain(appHost.Resources.OfType<ParameterResource>(), resource =>
    resource.Name.Contains("api-key", StringComparison.OrdinalIgnoreCase)
    || resource.Name.Contains("client-secret", StringComparison.OrdinalIgnoreCase)
    || resource.Name.Contains("consumer-key", StringComparison.OrdinalIgnoreCase)
    || resource.Name.Contains("consumer-secret", StringComparison.OrdinalIgnoreCase));
Assert.Contains(appHost.Resources, resource => resource.Name == "Modules-digitalbrain-master-key");
Assert.DoesNotContain(appHost.Resources, resource => resource.Name.Contains("ollama", StringComparison.OrdinalIgnoreCase));
```

Keep the assertion that the default model environment value is `IDeepSeekV41Flash`.

Add to `RunProfileFacts`:

```csharp
[Fact]
public async Task TheProductEntryPointAppliesCloudAndKeepsTheMasterKey()
{
    await using var appHost = await DistributedApplicationTestingBuilder.CreateAsync<AppHost::Projects.DigitalBrain_AppHost>(
        ["Parameters:Modules-digitalbrain-master-key=synthetic-composition-test-key-32chars"], TestContext.Current.CancellationToken);
    Assert.Contains(appHost.Resources, resource => resource.Name == "Modules-digitalbrain-master-key");
    Assert.DoesNotContain(appHost.Resources, resource => resource.Name.Contains("gmail-client", StringComparison.OrdinalIgnoreCase));
    Assert.DoesNotContain(appHost.Resources, resource => resource.Name.Contains("salesforce-consumer", StringComparison.OrdinalIgnoreCase));
}
```

- [ ] **Step 2: Run the facts and confirm they fail**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj -- --filter-method "*ProductMatchesTheReferenceCompositionModuleSet*|*TheProductEntryPointAppliesCloudAndKeepsTheMasterKey*"`

Expected: FAIL while `AppHost.cs` still calls `WithGmail`, `WithHostedMcp`, and `EnsureProviderApiKey` through `WithDefaultLlm<IDeepSeekV41Flash>`.

- [ ] **Step 3: Switch the entry point**

Replace the `WithHosting` chain in `AppHost.cs` with:

```csharp
var digitalBrain = AppHostDigitalBrain.Add(builder, "Modules", RunProfile.Cloud, DigitalBrainHostingOptions.Named(builder.Configuration, "intochat"))
    .WithHttpIdentity();
if (shellEnabled) { digitalBrain = digitalBrain.WithHosting<FlutterModuleHosting, FlutterModuleOptions>(flutter => flutter.RunDesktopApp()); }
var featuresKey = DigitalBrainConfiguration.ModuleOptionsSection("apps") + ":Features";
// keep the existing features-path assignment on digitalBrain here
```

Leave the silo, MCP, storage directory, and features-folder code below that chain as it is. Delete the commented SV `WithHosting` lines. Delete the `WithGmail` and `WithHostedMcp` calls. Do not add them to `RunProfile`.

Replace the comment that says `` `aspire run -- --DigitalBrain:Profile local` `` selects today's composition. The comment says the profile symbol in this file is the selection: `RunProfile.Cloud` or `RunProfile.Local`.

Replace `src/DigitalBrain.AppHost/profiles/local.json` with `{}`. `AddDigitalBrainProfiles` stays, so an unknown profile name still fails, and the file no longer restates the model list.

In `ReferenceBrain.Create`:

- Keep `WithOptions<AIModule, AIOptions>` and make the delegate apply the reference adjustments without a string profile name:

```csharp
.WithOptions<AIModule, AIOptions>(ai =>
{
    ai.WithoutLocalModels().WithoutVoiceToText().WithoutWebSearch()
        .WithDefaultLlm<IGpt56Luna>()
        .WithModelEndpoint(AiProvider.OpenAI, new Uri(UnconfiguredProvider, "v1/"));
})
```

This is the same overlay `RunProfile.Reference` encodes. Keep the other `WithOptions` calls (Qdrant `Host = false`, Postgres and ClickHouse `PersistentStorage = false`, Supabase, Gmail `ProfileEndpoint`, Salesforce `WithLocalMcp`, Flutter `BackendOnly`).

- In the configuration dictionary, delete the four lines `Parameters:modules-openai-api-key`, `Parameters:modules-gmail-client-id`, `Parameters:modules-gmail-client-secret`, `Parameters:modules-salesforce-consumer-key`, and `Parameters:modules-salesforce-consumer-secret`.
- Keep `Parameters:Modules-digitalbrain-master-key`, `IntegrationSchema.Key("csharp", "RunTokenKey")`, and `ConnectionsTokenEndpointKey("gmail")`.
- Add `[IntegrationSchema.Key("openai", "ApiKey")] = modelApiKey` so `Create(modelApiKey)` still delivers the key the parameter used to deliver.

LSP `findReferences` on `ReferenceBrain.Create`. Every caller that passed `modelApiKey` still compiles, because the parameter stays. Callers that set `Parameters:modules-gmail-client-id` through `privateConfiguration` get no parameter to fill. Update those callers to `IntegrationSchema.Key("google-oauth", "ClientId")` and `ClientSecret` only if a fact still needs a seeded Gmail integration. Do not add a fixture key when the fact does not read it.

- [ ] **Step 4: Run the composition facts**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj -- --filter-method "*ProductMatchesTheReferenceCompositionModuleSet*|*TheProductEntryPointAppliesCloudAndKeepsTheMasterKey*|*LocalAndCloudAllocateDistinctOptionGraphs*"`

Expected: PASS. The product model contains `Modules-digitalbrain-master-key`, the default model is `IDeepSeekV41Flash`, and it contains no Gmail, Salesforce, OpenRouter, OpenAI, or Tavily parameter.

Run: `dotnet build src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj`

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.AppHost/AppHost.cs src/DigitalBrain.AppHost/profiles/local.json src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/ProductCompositionFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/RunProfileFacts.cs src/DigitalBrain.OS/DigitalBrain.OS.Testing/ReferenceBrain.cs
git commit -m "Boot the product from RunProfile.Cloud."
```

---

### Task 4: Reference boot and the module suites

**Files:**
- Test: the projects touched above. No new production type.

**Interfaces:**
- Consumes: the profile, the parameter removal, and the `ReferenceBrain` configuration change.
- Produces: the touched test projects pass.

- [ ] **Step 1: Run the suites that construct the AppHost or a provider key**

```bash
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/DigitalBrain.OS.Tests.Unit.csproj
dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests.Hosting/DigitalBrain.Modules.AI.Tests.Hosting.csproj
dotnet test --project src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit/DigitalBrain.Aspire.Hosting.Tests.Unit.csproj
```

Expected: PASS.

LSP `findReferences` for the string `modules-openai-api-key` and `modules-gmail-client-id` from a test that still contains them. The only remaining reads of those parameter names should be gone. A test that still sets one is updated to the `IntegrationSchema` key or deleted when it only existed to satisfy `AddParameter`.

- [ ] **Step 2: Fix what those suites report**

A failure that is "parameter value is missing" means a merchant `AddParameter` is still reached. Remove that call. Do not give it a fixture value.

A failure that is "OpenAI key missing" inside a fact that used `ReferenceBrain.Create("some-key")` means the schema key did not replace the parameter. The fact should read `IntegrationSchema.Key("openai", "ApiKey")`.

A failure that the Gmail or Salesforce module is absent from `OsCatalog` is a mistake in this change. Those modules stay in the catalog. Only their hosting parameters are gone.

- [ ] **Step 3: Commit any repairs**

```bash
git commit -m "Align reference boot with integration configuration keys."
```

Skip the commit when Step 1 passed with a clean tree.
