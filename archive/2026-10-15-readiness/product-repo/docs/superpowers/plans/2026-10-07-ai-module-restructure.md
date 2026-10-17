# AI Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the AI module's two agent designs into one agent neuron that owns its transcript and runs its own turn, make context a neuron, give models one key and one resolver, and lay the module out like Time and Gmail.

**Architecture:** `AgentNeuron` keeps the transcript and runs the turn through a pull-based iterator (`AgentTurnLoop`) it owns; `Run` streams the events, `Start` drains the same loop on a one-way self-reference and the loop's signals reach scripts. `IAgentContext` is a grain the agent reads at turn time. `ModelCatalog` is the only resolver from a model key (marker name, profile name, `scripted/<key>`) to a client, exposed to other modules as the `IModelCatalog` neuron.

**Tech Stack:** .NET 11 RC (`global.json`), Orleans grains, `Microsoft.Extensions.AI` `IChatClient`, xUnit v3 facts over `ModuleTest.Create().WithModule<AIModule>()`, Flutter shell tests.

**Spec:** `docs/superpowers/specs/2026-10-07-ai-module-restructure-design.md`

## Deviations from the spec (decided while planning, recorded here so the spec is corrected in Task 5)

- `ContextEntry` carries its own `Name` (`ContextEntry(Name, Text, Tools)`) and `IAgentContext.Set(ContextEntry)` takes the whole record, so a snapshot is a plain array.
- No `ScriptedProviderFactory` class. `ILlmProviderFactory` is shaped around `LLMModel` and `AIOptions`; the scripted model is a grain. `ModelCatalog.CreateClient` has a two-line arm for `AiProvider.Scripted` and the scripted files live under `Models/Scripted/`.
- `AiProvider` gains `Scripted` and `Host`. `Host` is the deployment's registered `IChatClient`, used when no provider or default is configured; tests inject it. Today's runner falls back to it in exactly that case.
- `ModelCatalog` is also a neuron, `IModelCatalog` in `Contracts/Models`, because the Assistant module references only AI contracts and lists models through a grain today (`IAgentExecution.Models`). The `{automatic, models}` record the shell reads is renamed `ModelChoices`.
- `AgentState` does not carry the transcript; `IAgent.Transcript()` returns it. The conversation read the shell makes stays small.
- `ModelAddress` is kept (moved to `Contracts/Models`). It is the one place a model key becomes an `ILLM` grain for callers outside the AI module (`CreatorModelWorker`, group chat, scripts).
- The one-way self-reference interface is `IAgentDriver` (module-internal), replacing `IAgentTurnDriver`.

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`).
- Build and test per project, never the `.slnx`: `dotnet build <csproj>`, `dotnet test --project <test csproj>`.
- Grain state uses concrete arrays, never `IReadOnlyList` or collection-expression wrappers.
- No self-calls on non-reentrant grains; signal-triggered work goes through `this.AsReference<T>()` one-way.
- No `/// <summary>` boilerplate; inline comments only for what code cannot say.
- Tests are facts with sentence-shaped names and use `TestContext.Current.CancellationToken`.
- Never raise a timeout or add polling to make a check pass.
- LSP (`csharp-ls` over the gitignored `DigitalBrain-lsp.sln`) for every definition, reference and caller before editing; diagnostics clean before building. Grep only for non-code text (script `using` lines, Dart test fixtures, docs).
- No state compatibility: reshape grain state freely, no migrations.
- Message limits carried over unchanged: user text 1..32000 characters, run id at most 200 characters, `MaxModelCalls` 1..128, `Timeout` at most 10 minutes, `MaxHistoryMessages` 2..4096, tool offers at most 32 tools.

## Review Focus

1. A caller abandons `Run`'s stream mid-turn (client disconnect): the run must end `Cancelled`, the provider call must be cancelled, and the transcript must stay unchanged. Pinned in Task 3 (`AbandonedStreamCancelsTheProviderAndLeavesTheTranscriptUnchanged`).
2. `Start` is called twice on one agent while the first turn runs: the second must throw `InvalidOperationException` and never interleave. Pinned in Task 3 (`ASecondTurnIsRefusedWhileOneRuns`).
3. A run id is replayed with different text: must throw, never return the stored answer. Pinned in Task 3 (`ReplayRequiresTheSameTextAndReturnsTheStoredReply`).
4. A context neuron named in `AgentDefinition.Contexts` does not exist or throws: the turn continues without it and the model still gets the other contexts. Pinned in Task 3 (`AMissingContextIsSkippedAndTheOthersReachTheModel`).
5. A model key that is unknown, or whose provider has no credentials: `Resolve` throws `ArgumentException` or `ProviderUnavailableException` before any provider call. Pinned in Task 1 (`ModelCatalogFacts`).

---

## File structure after the plan

Contracts (`src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts`, namespace equals folder under `DigitalBrain.AI`):

```
Agents/IAgent.cs                      contract
Agents/AgentDefinition.cs             AgentDefinition
Agents/AgentTurn.cs                   AgentTurn (+ Text factory)
Agents/AgentTurnEvent.cs              event union (unchanged shape, ResolvedModel)
Agents/AgentState.cs                  AgentRunStatus, AgentUsage, AgentToolCall, AgentRun, AgentState
Agents/AgentExtensions.cs             Ask / GetResponse / GetResponseStream over Run
Agents/AgentTools.cs                  IAgentToolFactory, IAgentToolSource, IAgentToolSession, AgentToolContext, AgentToolOffer, AgentToolBinding  (moves to Tools/ in Task 5)
Agents/Signals/AgentSignals.cs        AgentConfigured, TurnStarted, TurnProgressed, TurnCompleted, TurnFailed, TranscriptCleared
Agents/Context/IAgentContext.cs       IAgentContext, ContextEntry, ContextSnapshot
Agents/Context/Signals/ContextSignals.cs   ContextUpdated, ContextRemoved
Models/ILLM.cs, AiModel.cs, LLMModel.cs, AiProvider.cs, LlmCapabilities.cs, ModelAddress.cs
Models/ModelSelection.cs              ModelSelection, ResolvedModel
Models/ModelDescriptor.cs             CapabilitySupport, ModelDescriptor
Models/IModelCatalog.cs               IModelCatalog, ModelChoice, ModelChoices
Models/Signals/InferenceSignals.cs
Models/<Vendor>/<Model>.cs            one file per model (Anthropic, Google, OpenAI, OpenRouter, XAI, Ollama, FoundryLocal)
Models/Scripted/IScriptedLLM.cs
Inference/InferenceContracts.cs       AiMessage, AiContent..., InferenceRequest/Result/Update/Options
Tools/                                (Task 5) IAgentToolFactory & co, INativeToolContributor, NativeTools, ScreenedFunction
Media/, Voice/, Embeddings/, GroupChat/, Metering/   unchanged content
```

Module (`src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI`):

```
AIModule.cs                           registrations only
Agents/AgentNeuron.cs                 the agent grain
Agents/AgentTurnLoop.cs               pull-based turn iterator the grain owns
Agents/IAgentDriver.cs                one-way self-reference
Agents/Context/AgentContextNeuron.cs
Models/ModelCatalog.cs                the resolver (service)
Models/ModelCatalogNeuron.cs          IModelCatalog over the service
Models/ModelConnectors.cs             ConnectorDefinition per provider (from AIModule)
Models/InferenceService.cs            Generate / GenerateStreaming
Models/LlmNeuron.cs                   LlmNeuronBase + LlmNeuron
Models/<Vendor>/<Vendor>ProviderFactory.cs, ModelNeurons.cs
Models/Scripted/ScriptedLlmNeuron.cs, ScriptedChatClient.cs
Tools/NativeTools.cs, ScreenedFunction.cs, McpAgentTools.cs, Web/, WebSearch/, Workspace/
Clients/, Configuration/, Integrations/, Metering/, Media/, Voice/, GroupChat/   stay
```

Deleted by the end: `Agents/AgentExecutionNeuron.cs`, `Agents/IAgentTurnDriver.cs`, `Agents/IAgentTurnRunner.cs`, `Agents/AgentTurnRunner.cs`, `Agents/AgentActivation.cs`, `Agents/AgentModelCatalog.cs`, `ModelProfiles.cs`, `Providers.cs`, Contracts `Agents/IAgentExecution.cs`, `Agents/AgentConversation.cs`, `Agents/AgentRequest.cs`, `Agents/AgentReply.cs`, `Agents/AgentTurnStart.cs`, `Agents/AgentTurnRequest.cs`, `Agents/ModelCatalog.cs`, `AgentModelSelection.cs`, `Interactions/` is untouched.

Task order keeps every project green at every commit: Task 1 (models) → Task 2 (context) → Task 3 (agent, with `IAgentExecution` kept as a thin façade) → Task 4 (Assistant, scripts, E2E, Dart fixtures, façade deleted) → Task 5 (folders, namespaces, module slimming, spec corrections) → Task 6 (running-system verification).

---

### Task 1: One model vocabulary — `ModelSelection`, `ResolvedModel`, `ModelCatalog`, `IModelCatalog`

**Files:**
- Create: `DigitalBrain.Modules.AI.Contracts/Models/ModelSelection.cs`
- Create: `DigitalBrain.Modules.AI.Contracts/Models/IModelCatalog.cs`
- Create: `DigitalBrain.Modules.AI/Models/ModelCatalog.cs`
- Create: `DigitalBrain.Modules.AI/Models/ModelCatalogNeuron.cs`
- Create: `tests/DigitalBrain.Modules.AI.Tests/Models/ModelCatalogFacts.cs`
- Modify: `DigitalBrain.Modules.AI.Contracts/AiProvider.cs` (add `Scripted`, `Host`)
- Modify: `DigitalBrain.Modules.AI/Configuration/AIDefaultOptions.cs` (remove `Profile`, `Provider`, `Capabilities`)
- Modify: `DigitalBrain.Modules.AI/Inference/InferenceService.cs` (drop `Resolve`/`HasProfile`, use the catalog)
- Modify: `DigitalBrain.Modules.AI/Inference/InferenceMapping.cs` (`CreateOptions` takes `ResolvedModel`)
- Modify: `DigitalBrain.Modules.AI/Inference/LlmNeuron.cs`, `Inference/ScriptedLlmNeuron.cs`, `Agents/AgentTurnRunner.cs`, `Agents/AgentExecutionNeuron.cs`, `Agents/AgentNeuron.cs`, `Clients/AIClients.cs`, `AIModule.cs`
- Modify: Contracts `Agents/AgentDefinition.cs`, `Agents/AgentRequest.cs`, `Agents/AgentTurnRequest.cs`, `Agents/AgentState.cs`, `Agents/AgentTurnEvent.cs`, `Inference/InferenceContracts.cs`, `ILLM.cs`
- Modify: Assistant `AssistantTurnExecution.cs`, `AssistantNeuron.cs`, `AssistantContracts.cs`; Assistant tests `AgentModelsFacts.cs`, `AgentTurnFacts.cs`, `AssistantStreamFacts.cs`
- Delete: `DigitalBrain.Modules.AI/ModelProfiles.cs`, `Providers.cs`, `Agents/AgentModelCatalog.cs`, Contracts `AgentModelSelection.cs`, `Agents/ModelCatalog.cs`

**Interfaces:**
- Produces `ModelSelection(string? Model, string? Reasoning, int? MaxOutputTokens)`, `ResolvedModel(AiProvider Provider, string Model, string? Endpoint, string? Profile, string Revision, LlmCapabilities Capabilities, string? Reasoning, int? MaxOutputTokens)`, `ModelChoice`, `ModelChoices`, `IModelCatalog`, and the service `ModelCatalog` with `Resolve`, `CreateClient`, `Describe`, `List`, `Select`.

- [ ] **Step 1: Write the contract records**

`DigitalBrain.Modules.AI.Contracts/Models/ModelSelection.cs`:

```csharp
namespace DigitalBrain.AI;

// Model is a marker name ("IFable5"), a configured profile name, or "scripted/<key>"; null is the
// deployment default. Reasoning and MaxOutputTokens override what the model or profile pins.
[GenerateSerializer, Alias("ai.model-selection")]
public sealed record ModelSelection(
    [property: Id(0)] string? Model = null,
    [property: Id(1)] string? Reasoning = null,
    [property: Id(2)] int? MaxOutputTokens = null);

// Everything a turn needs to build its client, minus credentials, which are resolved at use.
[GenerateSerializer, Alias("ai.resolved-model")]
public sealed record ResolvedModel(
    [property: Id(0)] AiProvider Provider,
    [property: Id(1)] string Model,
    [property: Id(2)] string? Endpoint,
    [property: Id(3)] string? Profile,
    [property: Id(4)] string Revision,
    [property: Id(5)] LlmCapabilities Capabilities,
    [property: Id(6)] string? Reasoning,
    [property: Id(7)] int? MaxOutputTokens);
```

`DigitalBrain.Modules.AI.Contracts/Models/IModelCatalog.cs`:

```csharp
using DigitalBrain;
using Orleans.Concurrency;

namespace DigitalBrain.AI;

// The deployment's model list as a neuron, so other modules and the shell read it without
// referencing the AI module. Never carries endpoints or secrets.
[Alias("ai.models"), Orleans.Metadata.DefaultGrainType("ai.models")]
public interface IModelCatalog : INeuron
{
    [ReadOnly, AlwaysInterleave] Task<ModelChoices> List(string? defaultModel = null);
    // Validates a choice id ("profile:<name>", "preset:<Marker>", "scripted/<key>") for a tool-using turn.
    [ReadOnly, AlwaysInterleave] Task<ModelSelection?> Select(string? id, string? defaultModel = null);
}

[GenerateSerializer, Alias("ai.model-choices")]
public sealed record ModelChoices([property: Id(0)] ModelChoice Automatic, [property: Id(1)] ModelChoice[] Models);

[GenerateSerializer, Alias("ai.model-choice")]
public sealed record ModelChoice([property: Id(0)] string? Id, [property: Id(1)] string Label, [property: Id(2)] string? Provider,
    [property: Id(3)] string? Model, [property: Id(4)] bool Available, [property: Id(5)] string[] Capabilities);
```

Edit `AiProvider.cs`:

```csharp
public enum AiProvider
{
    OpenAI, Anthropic, Google, XAI, Ollama, FoundryLocal, OpenRouter,
    // A stand-in model grain (IScriptedLLM) keyed by "scripted/<key>".
    Scripted,
    // The deployment's registered IChatClient, used when nothing names a model and no provider is configured.
    Host,
}
```

- [ ] **Step 2: Write the failing catalog facts**

`tests/DigitalBrain.Modules.AI.Tests/Models/ModelCatalogFacts.cs`:

```csharp
using DigitalBrain.AI;
using DigitalBrain.AI.Scripted;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DigitalBrain.Modules.AI.Tests.Models;

public sealed class ModelCatalogFacts
{
    private static ModelCatalog Catalog(ModuleBrain brain) => brain.SiloServices.GetRequiredService<ModelCatalog>();

    [Fact]
    public async Task AMarkerNameResolvesToItsProviderWhenCredentialsAreReady()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithRegistrations(AiRegistrationSeeds.OpenAI()).StartAsync(ct);
        var resolved = await Catalog(brain).Resolve(new("IGpt56Sol"), requiresTools: true, ct);
        Assert.Equal((AiProvider.OpenAI, "gpt-5.6-sol"), (resolved.Provider, resolved.Model));
        Assert.True(resolved.Capabilities.HasFlag(LlmCapabilities.Tools));
        Assert.NotEmpty(resolved.Revision);
    }

    [Fact]
    public async Task AProfileNameResolvesToTheProfilesProviderModelAndEndpoint()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule, AIOptions>(options =>
            options.ModelProfiles["work"] = new() { Provider = "OpenAI", Model = "private-chat", Endpoint = "https://private.example/v1", Capabilities = LlmCapabilities.Tools })
            .WithRegistrations(AiRegistrationSeeds.OpenAI()).StartAsync(ct);
        var resolved = await Catalog(brain).Resolve(new("work"), requiresTools: true, ct);
        Assert.Equal((AiProvider.OpenAI, "private-chat", "https://private.example/v1", "work"), (resolved.Provider, resolved.Model, resolved.Endpoint, resolved.Profile));
    }

    [Fact]
    public async Task AScriptedKeyResolvesWithoutAnyProviderAndCreatesTheScriptedClient()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        await brain.Get<IScriptedLLM>("turn-model").Script(["ok"]);
        var resolved = await Catalog(brain).Resolve(new(IScriptedLLM.ModelPrefix + "turn-model"), requiresTools: true, ct);
        Assert.Equal((AiProvider.Scripted, "turn-model"), (resolved.Provider, resolved.Model));
        using var client = await Catalog(brain).CreateClient(resolved, ct);
        var reply = await client.GetResponseAsync([new(Microsoft.Extensions.AI.ChatRole.User, "hi")], cancellationToken: ct);
        Assert.Equal("ok", reply.Text);
    }

    [Fact]
    public async Task NoSelectionAndNoConfigurationResolvesToTheHostClient()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        var resolved = await Catalog(brain).Resolve(null, requiresTools: false, ct);
        Assert.Equal(AiProvider.Host, resolved.Provider);
        Assert.False((await Catalog(brain).List(null, ct)).Automatic.Available);
    }

    [Fact]
    public async Task UnknownKeysAndUnconfiguredProvidersAreRefusedBeforeAnyProviderCall()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule, AIOptions>(options =>
            options.ModelProfiles["remote"] = new() { Provider = "Google", Model = "remote-chat", Capabilities = LlmCapabilities.Tools }).StartAsync(ct);
        await Assert.ThrowsAsync<ArgumentException>(() => Catalog(brain).Resolve(new("INoSuchModel"), false, ct));
        await Assert.ThrowsAsync<ArgumentException>(() => Catalog(brain).Resolve(new("https://attacker.example/model"), false, ct));
        await Assert.ThrowsAsync<ProviderUnavailableException>(() => Catalog(brain).Resolve(new("remote"), true, ct));
        await Assert.ThrowsAsync<ProviderUnavailableException>(() => Catalog(brain).Resolve(new("IFable5"), true, ct));
    }

    [Fact]
    public async Task ListOffersOnlyConfiguredToolModelsAndSelectValidatesChoiceIds()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule, AIOptions>(options =>
            {
                options.ModelProfiles["work"] = new() { Provider = "OpenAI", Model = "private-chat", Capabilities = LlmCapabilities.Tools };
                options.ModelProfiles["no-tools"] = new() { Provider = "OpenAI", Model = "text-only", Capabilities = LlmCapabilities.None };
            }).WithRegistrations(AiRegistrationSeeds.OpenAI("secret-api-key", "https://private.example/v1")).StartAsync(ct);
        var catalog = brain.Get<IModelCatalog>("default");
        var choices = await catalog.List();
        Assert.True(choices.Automatic.Available);
        Assert.Contains(choices.Models, choice => choice.Id == "profile:work");
        Assert.Contains(choices.Models, choice => choice.Id == "preset:IGpt56Sol");
        Assert.DoesNotContain(choices.Models, choice => choice.Id == "profile:no-tools");
        var json = System.Text.Json.JsonSerializer.Serialize(choices);
        Assert.DoesNotContain("secret-api-key", json);
        Assert.DoesNotContain("private.example", json);
        Assert.Equal(new ModelSelection("work"), await catalog.Select("profile:work"));
        Assert.Equal(new ModelSelection("IGpt56Sol"), await catalog.Select("preset:IGpt56Sol"));
        Assert.Equal(new ModelSelection("IGpt56Luna"), await catalog.Select(null, "IGpt56Luna"));
        await Assert.ThrowsAsync<ArgumentException>(() => catalog.Select("profile:no-tools"));
        await Assert.ThrowsAsync<ArgumentException>(() => catalog.Select("profile:missing"));
    }
}
```

- [ ] **Step 3: Run the facts to see them fail**

Run: `dotnet build src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/DigitalBrain.Modules.AI.Tests.csproj`
Expected: compile errors, `ModelCatalog`, `ModelSelection`, `IModelCatalog` not found.

- [ ] **Step 4: Write `ModelCatalog`**

`DigitalBrain.Modules.AI/Models/ModelCatalog.cs`. This is `ModelProfiles.Resolve` with provider parsing removed, the scripted and host arms added, and `AgentModelCatalog` folded in.

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DigitalBrain.AI.Scripted;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DigitalBrain.AI;

// The one resolver from a model key to a client. A key is a marker name, a configured profile
// name or "scripted/<key>"; null is the deployment default.
public sealed class ModelCatalog(IServiceProvider services, IOptionsMonitor<AIOptions> options)
{
    private IAiCredentials Credentials => services.GetRequiredService<IAiCredentials>();

    public async Task<ResolvedModel> Resolve(ModelSelection? selection, bool requiresTools, CancellationToken ct)
    {
        selection ??= new();
        var configuration = options.CurrentValue;
        var useDefault = string.IsNullOrWhiteSpace(selection.Model);
        var key = Clean(selection.Model) ?? Clean(configuration.Default.Model);
        var reasoning = Clean(selection.Reasoning) ?? (useDefault ? Clean(configuration.Default.Reasoning) : null);
        var maxTokens = selection.MaxOutputTokens ?? (useDefault ? configuration.Default.MaxOutputTokens : null);

        if (key is not null && key.StartsWith(IScriptedLLM.ModelPrefix, StringComparison.Ordinal))
        {
            var scripted = new ResolvedModel(AiProvider.Scripted, key[IScriptedLLM.ModelPrefix.Length..], null, null, string.Empty, LlmCapabilities.Tools, null, null);
            if (scripted.Model.Length == 0) { throw new ArgumentException("A scripted model needs a key after the prefix.", nameof(selection)); }
            return scripted with { Revision = Revision(scripted) };
        }

        AiProvider provider;
        string modelId;
        string? endpoint = null;
        string? profileName = null;
        LlmCapabilities? declared = null;
        LLMModel? preset = null;
        if (key is null)
        {
            foreach (var candidate in LLMModel.All)
            {
                if (await AIClients.Factory(candidate.Provider).IsConfigured(configuration, Credentials, ct)) { preset = candidate; break; }
            }
            if (preset is null)
            {
                var host = new ResolvedModel(AiProvider.Host, "default", null, null, string.Empty, LlmCapabilities.Tools, reasoning, maxTokens);
                return host with { Revision = Revision(host) };
            }
            provider = preset.Provider;
            modelId = preset.Id;
        }
        else if (configuration.ModelProfiles.TryGetValue(key, out var profile))
        {
            profileName = key;
            provider = ParseProvider(Clean(profile.Provider) ?? throw new ArgumentException($"Model profile '{key}' requires a provider.", nameof(selection)));
            modelId = Clean(profile.Model) ?? throw new ArgumentException($"Model profile '{key}' requires a model ID.", nameof(selection));
            endpoint = Clean(profile.Endpoint);
            reasoning = Clean(selection.Reasoning) ?? Clean(profile.Reasoning);
            maxTokens = selection.MaxOutputTokens ?? profile.MaxOutputTokens;
            declared = profile.Capabilities;
            preset = LLMModel.FindById(modelId);
            if (preset is not null && preset.Provider != provider) { preset = null; }
        }
        else if (LLMModel.FindByMarkerName(key) is { } marker)
        {
            preset = marker;
            provider = marker.Provider;
            modelId = marker.Id;
        }
        else
        {
            throw new ArgumentException($"Unknown model '{key}'. Use a model marker name, a configured profile name or scripted/<key>.", nameof(selection));
        }

        if (provider == AiProvider.Ollama && preset is not null)
        { modelId = Clean(configuration.Ollama.Models.GetValueOrDefault(preset.Marker.Name)?.Model) ?? modelId; }
        if (modelId.Length > 200 || modelId.Any(char.IsControl))
        { throw new ArgumentException("Model ID must contain at most 200 printable characters.", nameof(selection)); }

        var factory = AIClients.Factory(provider);
        if (!await factory.IsConfigured(configuration, Credentials, ct) && !(provider == AiProvider.Ollama && endpoint is not null))
        {
            if (provider == AiProvider.Ollama) { throw new InvalidOperationException($"Provider 'Ollama' is not configured. Set {AIKeys.OllamaEndpoint}."); }
            await Credentials.RequireReady(AiIntegrations.IdOf(provider), ct);
        }
        endpoint ??= provider == AiProvider.Ollama ? Clean(configuration.Ollama.Endpoint) : Clean(configuration.Provider(provider).Endpoint);
        if (endpoint is not null || provider == AiProvider.Ollama) { endpoint = Endpoint(endpoint, provider); }

        var capabilities = declared ?? preset?.Capabilities ?? LlmCapabilities.None;
        if ((capabilities & ~(LlmCapabilities.Tools | LlmCapabilities.Vision | LlmCapabilities.StructuredOutput)) != 0)
        { throw new ArgumentException("Model capabilities contain unknown flags.", nameof(selection)); }
        if (requiresTools && !capabilities.HasFlag(LlmCapabilities.Tools))
        { throw new ArgumentException($"Model '{modelId}' does not declare tool support. Configure Tools capabilities in its model profile before attaching tools.", nameof(selection)); }
        reasoning = NormalizeReasoning(reasoning);
        if (requiresTools && provider == AiProvider.OpenAI && modelId.StartsWith("gpt-5.6", StringComparison.OrdinalIgnoreCase))
        {
            if (reasoning is not null and not "none") { throw new ArgumentException("GPT-5.6 tools through OpenAI Chat Completions require reasoning 'none'.", nameof(selection)); }
            reasoning = "none";
        }
        if (maxTokens is < 1 or > 1_000_000) { throw new ArgumentException("MaxOutputTokens must be between 1 and 1000000.", nameof(selection)); }
        var resolved = new ResolvedModel(provider, modelId, endpoint, profileName, string.Empty, capabilities, reasoning, maxTokens);
        return resolved with { Revision = Revision(resolved) };
    }

    // Inference returns proposed calls; the agent owns the only tool invocation loop, so this
    // pipeline carries GenAI telemetry and metering but never function invocation. The Host
    // client is the deployment's and is not owned by the caller.
    public async Task<IChatClient> CreateClient(ResolvedModel resolved, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(resolved);
        if (!string.Equals(resolved.Revision, Revision(resolved), StringComparison.Ordinal))
        { throw new ArgumentException("The resolved model configuration does not match its revision.", nameof(resolved)); }
        switch (resolved.Provider)
        {
            case AiProvider.Host: return new NonDisposing(services.GetRequiredService<IChatClient>());
            case AiProvider.Scripted: return new ScriptedChatClient(services.GetRequiredService<IGrainFactory>().GetGrain<IScriptedLLM>(resolved.Model));
        }
        var configuration = new AIOptions();
        configuration.Provider(resolved.Provider).Endpoint = resolved.Endpoint;
        var inner = new RebuildingChatClient(
            token => AIClients.Factory(resolved.Provider).CreateChatClient(resolved.Model, configuration, Credentials, resolved.Endpoint, token),
            token => AiIntegrations.KeyedProviders.Contains(resolved.Provider) ? Credentials.GenerationOf(AiIntegrations.IdOf(resolved.Provider), token) : Task.FromResult(0L));
        var pinned = new ChatClientBuilder(inner).ConfigureOptions(request =>
        {
            request.ModelId = resolved.Model;
            if (resolved.Reasoning is not null) { request.Reasoning = Reasoning(resolved.Reasoning); }
            if (resolved.MaxOutputTokens is not null) { request.MaxOutputTokens = resolved.MaxOutputTokens; }
        }).Build();
        ct.ThrowIfCancellationRequested();
        return AIClients.BuildChatPipeline(services, supportsTools: true, resolved.Provider.ToString(), pinned,
            resolved.Provider.ToString(), resolved.Model, rejectUnsupportedTools: false, useFunctionInvocation: false);
    }

    public ModelDescriptor Describe(ResolvedModel model)
    {
        ArgumentNullException.ThrowIfNull(model);
        var profile = model.Profile is not null ? options.CurrentValue.ModelProfiles.GetValueOrDefault(model.Profile) : null;
        if (profile?.ContextWindowTokens is <= 0 || profile?.MaximumOutputTokens is <= 0 || profile?.MaximumOutputTokens > profile?.ContextWindowTokens)
        { throw new ArgumentException("Configured model token limits must be positive and output cannot exceed context."); }
        if (profile?.AllowedReasoning?.Any(value => value is not ("none" or "low" or "medium" or "high" or "xhigh")) == true)
        { throw new ArgumentException("AllowedReasoning contains an unsupported reasoning value."); }
        var declared = profile?.Capabilities;
        CapabilitySupport Support(LlmCapabilities capability) => model.Capabilities.HasFlag(capability)
            ? CapabilitySupport.Supported : declared is null ? CapabilitySupport.Unknown : CapabilitySupport.Unsupported;
        return new(model.Provider.ToString(), model.Model, model.Profile, model.Revision,
            Support(LlmCapabilities.Tools), Support(LlmCapabilities.Vision), Support(LlmCapabilities.StructuredOutput),
            profile?.ContextWindowTokens, profile?.MaximumOutputTokens, SupportFlag(profile?.SupportsTemperature),
            SupportFlag(profile?.SupportsTopP), profile?.AllowedReasoning?.ToArray());
    }

    // The browser's allowlist: never a resolved model, which carries operator endpoints.
    public async Task<ModelChoices> List(string? defaultModel, CancellationToken ct)
    {
        var automatic = await TryResolve(Default(defaultModel), ct);
        var choices = new List<ModelChoice>();
        foreach (var choice in Choices())
        {
            if (await TryResolve(choice.Selection, ct) is { } resolved) { choices.Add(Describe(choice.Id, choice.Label, resolved)); }
        }
        return new(Describe(null, "Automatic (workspace default)", automatic is { Provider: not AiProvider.Host } ? automatic : null), [.. choices]);
    }

    public async Task<ModelSelection?> Select(string? id, string? defaultModel, CancellationToken ct)
    {
        var selection = id is null ? Default(defaultModel)
            : id.StartsWith(IScriptedLLM.ModelPrefix, StringComparison.Ordinal) ? new ModelSelection(id)
            : Choices().FirstOrDefault(choice => string.Equals(choice.Id, id, StringComparison.Ordinal))?.Selection
                ?? throw new ArgumentException("The selected model is unavailable. Choose a model from Settings.");
        try { await Resolve(selection, requiresTools: true, ct); }
        catch (ProviderUnavailableException) { throw; }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or NotSupportedException)
        { throw new ArgumentException("The selected model is unavailable or does not support assistant tools. Choose a model from Settings."); }
        return selection;
    }

    private static ModelSelection? Default(string? defaultModel) => defaultModel is { Length: > 0 } model ? new(model) : null;

    private sealed record Choice(string Id, string Label, ModelSelection Selection);

    private IEnumerable<Choice> Choices()
    {
        foreach (var name in options.CurrentValue.ModelProfiles.Keys.Order(StringComparer.OrdinalIgnoreCase))
        { yield return new("profile:" + name, name, new(name)); }
        foreach (var preset in LLMModel.All)
        {
            // A local server being configured does not imply every compiled local model is installed.
            if (preset.Provider == AiProvider.Ollama && !options.CurrentValue.Ollama.Models.ContainsKey(preset.Marker.Name)) { continue; }
            yield return new("preset:" + preset.Marker.Name, preset.Id, new(preset.Marker.Name));
        }
    }

    private async Task<ResolvedModel?> TryResolve(ModelSelection? selection, CancellationToken ct)
    {
        try { return await Resolve(selection, requiresTools: true, ct); }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or NotSupportedException) { return null; }
    }

    private static ModelChoice Describe(string? id, string label, ResolvedModel? model) => new(id, label,
        model?.Provider.ToString(), model?.Model, model is not null,
        model is null ? [] : [.. Enum.GetValues<LlmCapabilities>().Where(c => c != LlmCapabilities.None && model.Capabilities.HasFlag(c)).Select(c => c.ToString())]);

    private static string Revision(ResolvedModel resolved)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(resolved with { Revision = string.Empty }))));

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static CapabilitySupport SupportFlag(bool? value)
        => value is null ? CapabilitySupport.Unknown : value.Value ? CapabilitySupport.Supported : CapabilitySupport.Unsupported;

    private static AiProvider ParseProvider(string name)
        => Enum.TryParse<AiProvider>(name, ignoreCase: true, out var provider) && Enum.IsDefined(provider)
            && provider is not (AiProvider.FoundryLocal or AiProvider.Scripted or AiProvider.Host)
            ? provider : throw new ArgumentException($"Unknown chat provider '{name}'. Use OpenAI, Anthropic, Google, XAI, OpenRouter or Ollama.", nameof(name));

    private static string? Endpoint(string? endpoint, AiProvider provider)
    {
        endpoint ??= provider switch
        {
            AiProvider.OpenAI => "https://api.openai.com/v1",
            AiProvider.Anthropic => "https://api.anthropic.com",
            AiProvider.Google => "https://generativelanguage.googleapis.com/v1beta/openai/",
            AiProvider.XAI => "https://api.x.ai/v1",
            AiProvider.OpenRouter => "https://openrouter.ai/api/v1",
            _ => null,
        };
        if (endpoint is null || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)
            || uri.Scheme is not ("http" or "https") || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
        { throw new ArgumentException("Provider endpoints must be absolute HTTP(S) URLs without credentials, query strings or fragments.", nameof(endpoint)); }
        return uri.AbsoluteUri;
    }

    internal static string? NormalizeReasoning(string? value) => value?.ToLowerInvariant() switch
    {
        null => null, "none" => "none", "low" => "low", "medium" => "medium", "high" => "high",
        "xhigh" or "extrahigh" or "extra-high" => "xhigh",
        _ => throw new ArgumentException("Reasoning must be none, low, medium, high or xhigh.", nameof(value)),
    };

    internal static ReasoningOptions Reasoning(string value) => new()
    {
        Effort = value switch
        {
            "none" => ReasoningEffort.None, "low" => ReasoningEffort.Low, "medium" => ReasoningEffort.Medium,
            "high" => ReasoningEffort.High, "xhigh" => ReasoningEffort.ExtraHigh,
            _ => throw new ArgumentException("Invalid pinned reasoning effort.", nameof(value)),
        },
    };

    public static ChatOptions CreateOptions(ResolvedModel resolved) => new()
    {
        ModelId = resolved.Provider is AiProvider.Host ? null : resolved.Model,
        Reasoning = resolved.Reasoning is null ? null : Reasoning(resolved.Reasoning),
        MaxOutputTokens = resolved.MaxOutputTokens,
    };

    // The host client is a singleton; a caller's `using` must not dispose it.
    private sealed class NonDisposing(IChatClient inner) : DelegatingChatClient(inner)
    {
        protected override void Dispose(bool disposing) { }
    }
}
```

`DigitalBrain.Modules.AI/Models/ModelCatalogNeuron.cs`:

```csharp
using DigitalBrain.Framework;
using Orleans.Concurrency;
using Orleans.Runtime;

namespace DigitalBrain.AI;

[GrainType("ai.models"), StatelessWorker]
internal sealed class ModelCatalogNeuron(ModelCatalog catalog) : Neuron, IModelCatalog
{
    public override DigitalBrain.Framework.Enforcement.NeuronAccess Access(string operation)
        => DigitalBrain.Framework.Enforcement.NeuronAccess.PublicOperation;
    public Task<ModelChoices> List(string? defaultModel = null) => catalog.List(defaultModel, CancellationToken.None);
    public Task<ModelSelection?> Select(string? id, string? defaultModel = null) => catalog.Select(id, defaultModel, CancellationToken.None);
}
```

Register in `AIModule.Configure`: replace `builder.Services.TryAddSingleton<ModelProfiles>();` with `builder.Services.TryAddSingleton<ModelCatalog>();`.

- [ ] **Step 5: Replace `AgentModelSelection` and `ResolvedAgentModel` everywhere**

With LSP `findReferences` on `AgentModelSelection` and `ResolvedAgentModel`, then edit each site:

| Site | Change |
|---|---|
| `Contracts/Inference/InferenceContracts.cs` `InferenceRequest.Model` | type `ModelSelection?` |
| `Contracts/ILLM.cs` `Describe(AgentModelSelection?)` | `Describe(ModelSelection? selection = null)` |
| `Contracts/Agents/AgentDefinition.cs` `Model` | `ModelSelection?` |
| `Contracts/Agents/AgentRequest.cs` `Model` | `ModelSelection?` |
| `Contracts/Agents/AgentTurnRequest.cs` `Model` | `ModelSelection?` |
| `Contracts/Agents/AgentState.cs` `AgentRunState.Model` | `ResolvedModel?` |
| `Contracts/Agents/AgentTurnEvent.cs` `ModelSelected.Model` | `ResolvedModel` |
| `Inference/InferenceMapping.cs` `CreateOptions(ResolvedAgentModel ...)` | `ResolvedModel`; `model.Provider == "Ollama"` becomes `model.Provider == AiProvider.Ollama`, `"OpenAI"` likewise; `ModelProfiles.CreateOptions(model)` becomes `ModelCatalog.CreateOptions(model)`; delete the `request.Model?.Capabilities` check in `ValidateRequest` (the property is gone) |
| `Inference/InferenceService.cs` | constructor `(ModelCatalog catalog, IOptionsMonitor<AIOptions> settings)`; delete `HasProfile`, `Resolve`, `DescribeResolved`; `Describe(selection, marker)` becomes `catalog.Describe(await ResolveFor(selection, marker, false, ct))`; `Prepare` calls `ResolveFor`; `profiles.CreateInferenceClient` becomes `catalog.CreateClient`. `ResolveFor` keeps the marker pinning: when `marker` is set and `selection?.Model` is null, resolve `new ModelSelection(LLMModel.FindByMarker(marker)!.Marker.Name)`; when both are set, resolve both and throw `ArgumentException` if provider or model differ |
| `Inference/LlmNeuron.cs` `Selection` | `key == "default" || (marker is not null && !settings.CurrentValue.ModelProfiles.ContainsKey(key)) ? null : new ModelSelection(key)` with `IOptionsMonitor<AIOptions>` injected, or pass `catalog` and add `internal bool HasProfile(string name)` to `ModelCatalog`; choose the latter |
| `Inference/ScriptedLlmNeuron.cs` `Describe` | parameter type `ModelSelection?` |
| `Agents/AgentTurnRunner.cs` | replace the `configured` computation and the three-way client selection with: `var catalog = services.GetRequiredService<ModelCatalog>(); var selection = request.Model; if (request.Options?.Reasoning is not null || request.Options?.MaxOutputTokens is not null) { selection = (selection ?? new()) with { Reasoning = request.Options.Reasoning ?? selection?.Reasoning, MaxOutputTokens = request.Options.MaxOutputTokens ?? selection?.MaxOutputTokens }; } var resolved = await catalog.Resolve(selection, tools.Count > 0, ct); var descriptor = catalog.Describe(resolved); if (resolved.Provider is not AiProvider.Host) { InferenceMapping.ValidateRequest(...); await WriteObserved(events, new AgentTurnEvent.ModelSelected(resolved, descriptor), ct); } options = resolved.Provider is AiProvider.Host ? new() : InferenceMapping.CreateOptions(resolved, request.Options is null ? null : request.Options with { Reasoning = null }, descriptor); using var client = await catalog.CreateClient(resolved, ct);` and delete the `scripted`, `owned`, `ownedClient` variables |
| `Agents/AgentExecutionNeuron.cs` | constructor takes `ModelCatalog catalog` instead of `ModelProfiles profiles, IOptionsMonitor<AIOptions> options`; `Models`/`SelectModel` delegate to `catalog.List(defaultModel, ct)` / `catalog.Select(id, defaultModel, ct)`; return type of `Models` is `ModelChoices`; `ModelFor` becomes `model.Length == 0 ? null : await catalog.Select(model, null, CancellationToken.None)` (the catalog handles `scripted/`) |
| `Agents/AgentNeuron.cs` `GetCapabilities` | `inference.Describe(_state.Definition.Model)` is unchanged in shape |
| `Clients/AIClients.cs` `DefaultChatClientAsync` | delete the `Default.Profile/Provider/Reasoning/MaxOutputTokens` branch; keep `Default.Model` marker lookup and `FirstConfiguredModel`; when `Default.Model` names a configured profile instead of a marker, resolve it through `ModelCatalog` and `CreateClient` |
| `Providers.cs` | delete; its only caller is found by `findReferences` on `Providers.Resolve` and switched to `ModelCatalog` |
| `Contracts/Agents/IAgentExecution.cs` `Models` | returns `Task<ModelChoices>`; `SelectModel` returns `Task<ModelSelection?>` |
| `Configuration/AIDefaultOptions.cs` | delete `Profile`, `Provider`, `Capabilities`; then `findReferences` each removed property and fix every site (expected: `AIClients`, hosting `AIHostingExtensions` if it sets them, `AIOptionsRoundTripFacts`, `AssistantStreamFacts`) |
| Assistant `AssistantTurnExecution.cs` | `Models()` returns `Task<ModelChoices>`; `SelectModel` returns `Task<ModelSelection?>`; `PreparedTurn.Model` is `ModelSelection?`; `RunModel`'s `modelSelection` parameter is `ModelSelection?` and the fallback is `new ModelSelection(modelName)` |
| Assistant `AssistantContracts.cs` `IAssistant.Models` | `Task<ModelChoices>` |
| Assistant tests `AgentModelsFacts.cs` | `Catalog(...)` returns `brain.SiloServices.GetRequiredService<ModelCatalog>()`; `.Read()` becomes `.List(null, ct)`; `.Select(id)` becomes `.Select(id, null, ct)`; expected selections become `new ModelSelection("IGpt56Luna")`, `new ModelSelection("work")`, `new ModelSelection("IGpt56Sol")`; `options.ModelProfiles["unconfigured"]` stays and still throws `ProviderUnavailableException` |
| Assistant tests `AgentTurnFacts.cs` | `new AgentModelSelection(Profile: "work")` becomes `new ModelSelection("work")` |
| Assistant tests `AssistantStreamFacts.cs` | `options.Default.Provider = "OpenAI"; options.Default.Model = "gpt-4.1-mini"; options.Default.Capabilities = ...` becomes `options.ModelProfiles["default"] = new() { Provider = "OpenAI", Model = "gpt-4.1-mini", Capabilities = LlmCapabilities.Tools }; options.Default.Model = "default";` |
| AI tests `ScriptedTurnFacts.cs`, `AgentExecutionFacts.cs`, `GroupChatFacts.cs`, `InferenceFacts.cs`, `HostedAgentFacts.cs` | `new AgentModelSelection(Model: x)` becomes `new ModelSelection(x)`; `options.Default.Profile = "fixture"` becomes `options.Default.Model = "fixture"`; `execution.Models()` assertions use `.Models` on `ModelChoices` |

Delete `ModelProfiles.cs`, `Agents/AgentModelCatalog.cs`, `Contracts/AgentModelSelection.cs`, `Contracts/Agents/ModelCatalog.cs`.

- [ ] **Step 6: Build and run the AI, Assistant and Apps suites**

```bash
dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj
```
```bash
dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
```
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
```
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
Expected: all green, including the six new `ModelCatalogFacts`. `AIOptionsRoundTripFacts` and `AIGrammarFacts` may name the removed `Default:Profile` / `Default:Provider` keys; delete those assertions, they describe configuration that no longer exists.

- [ ] **Step 7: Commit**

```bash
git add -A src/DigitalBrain.Modules/AI src/DigitalBrain.Modules/DigitalBrain/Assistant src/DigitalBrain.Modules/DigitalBrain/Apps
git commit -m "AI: one model vocabulary — ModelSelection, ResolvedModel and the ModelCatalog resolver

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The context neuron

**Files:**
- Create: `DigitalBrain.Modules.AI.Contracts/Agents/Context/IAgentContext.cs`
- Create: `DigitalBrain.Modules.AI.Contracts/Agents/Context/Signals/ContextSignals.cs`
- Create: `DigitalBrain.Modules.AI/Agents/Context/AgentContextNeuron.cs`
- Create: `tests/DigitalBrain.Modules.AI.Tests/Agents/Context/AgentContextFacts.cs`

**Interfaces:**
- Produces `IAgentContext { Set(ContextEntry); Remove(string); Read() }`, `ContextEntry(Name, Text, Tools)`, `ContextSnapshot(Revision, Entries)`, signals `ContextUpdated(ContextId, Revision, Name)`, `ContextRemoved(ContextId, Revision, Name)`. Task 3's loop reads `IAgentContext.Read()`.

- [ ] **Step 1: Write the failing facts**

```csharp
using DigitalBrain.AI.Agents.Context;
using DigitalBrain.AI.Agents.Context.Signals;
using DigitalBrain.Testing.Module;
using Xunit;

namespace DigitalBrain.Modules.AI.Tests.Agents.Context;

public sealed class AgentContextFacts
{
    [Fact]
    public async Task SetReplacesAnEntryByNameAndPublishesContextUpdated()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        var context = brain.Get<IAgentContext>("research/agents/assistant/context");
        var updates = brain.On<ContextUpdated>(context, ct).GetAsyncEnumerator(ct);
        await context.Set(new("capabilities", "Available: invoices", ["lookup"]));
        await context.Set(new("workspace", "Workspace: research", []));
        await context.Set(new("capabilities", "Available: invoices, orders", ["lookup", "orders"]));
        var snapshot = await context.Read();
        Assert.Equal(3, snapshot.Revision);
        Assert.Equal(["capabilities", "workspace"], snapshot.Entries.Select(entry => entry.Name));
        Assert.Equal("Available: invoices, orders", snapshot.Entries[0].Text);
        Assert.True(await updates.MoveNextAsync());
        Assert.Equal(("capabilities", 1L), (updates.Current.Name, updates.Current.Revision));
    }

    [Fact]
    public async Task RemoveDropsTheEntryPublishesContextRemovedAndIsIdempotent()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        var context = brain.Get<IAgentContext>("research/agents/assistant/context");
        await context.Set(new("capabilities", "x", []));
        var removed = brain.On<ContextRemoved>(context, ct).GetAsyncEnumerator(ct);
        await context.Remove("capabilities");
        await context.Remove("capabilities");
        Assert.Empty((await context.Read()).Entries);
        Assert.Equal(2, (await context.Read()).Revision);
        Assert.True(await removed.MoveNextAsync());
        Assert.Equal("capabilities", removed.Current.Name);
    }

    [Fact]
    public async Task EntriesSurviveReactivation()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        var context = brain.Get<IAgentContext>("research/agents/assistant/context");
        await context.Set(new("capabilities", "kept", ["lookup"]));
        await brain.DeactivateAsync(context, ct);
        var entry = Assert.Single((await context.Read()).Entries);
        Assert.Equal(("capabilities", "kept"), (entry.Name, entry.Text));
        Assert.Equal(["lookup"], entry.Tools);
    }

    [Fact]
    public async Task AnEntryNeedsABoundedNameAndText()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().StartAsync(ct);
        var context = brain.Get<IAgentContext>("research/agents/assistant/context");
        await Assert.ThrowsAsync<ArgumentException>(() => context.Set(new("", "x", [])));
        await Assert.ThrowsAsync<ArgumentException>(() => context.Set(new(new string('n', 201), "x", [])));
        await Assert.ThrowsAsync<ArgumentException>(() => context.Set(new("big", new string('x', 32001), [])));
    }
}
```

- [ ] **Step 2: Run to see the compile failure**

Run: `dotnet build src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/DigitalBrain.Modules.AI.Tests.csproj`
Expected: `IAgentContext` not found.

- [ ] **Step 3: Write the contract and signals**

`Contracts/Agents/Context/IAgentContext.cs`:

```csharp
using DigitalBrain;
using Orleans.Concurrency;

namespace DigitalBrain.AI.Agents.Context;

// What an agent should know before it answers, as named slices each producer owns. The agent reads
// the latest snapshot at turn time; behaviors subscribe to the signals.
[Alias("agent-context"), Orleans.Metadata.DefaultGrainType("agent-context")]
public interface IAgentContext : INeuron
{
    Task Set(ContextEntry entry);
    Task Remove(string name);
    [ReadOnly, AlwaysInterleave] Task<ContextSnapshot> Read();
}

// Text is what the model should know; Tools are registered tool names it may need for it.
[GenerateSerializer, Alias("agent-context.entry")]
public sealed record ContextEntry([property: Id(0)] string Name, [property: Id(1)] string Text, [property: Id(2)] string[] Tools);

[GenerateSerializer, Alias("agent-context.snapshot")]
public sealed record ContextSnapshot([property: Id(0)] long Revision, [property: Id(1)] ContextEntry[] Entries);
```

`Contracts/Agents/Context/Signals/ContextSignals.cs`:

```csharp
using DigitalBrain;

namespace DigitalBrain.AI.Agents.Context.Signals;

[GenerateSerializer, Alias("agent-context.updated")]
public sealed record ContextUpdated([property: Id(0)] string ContextId, [property: Id(1)] long Revision, [property: Id(2)] string Name) : Signal;

[GenerateSerializer, Alias("agent-context.removed")]
public sealed record ContextRemoved([property: Id(0)] string ContextId, [property: Id(1)] long Revision, [property: Id(2)] string Name) : Signal;
```

- [ ] **Step 4: Write the neuron**

`DigitalBrain.Modules.AI/Agents/Context/AgentContextNeuron.cs`:

```csharp
using DigitalBrain;
using DigitalBrain.AI.Agents.Context.Signals;
using DigitalBrain.Framework;
using Orleans.Runtime;

namespace DigitalBrain.AI.Agents.Context;

[GenerateSerializer, Alias("agent-context.state")]
public sealed record AgentContextState
{
    [Id(0)] public long Revision { get; init; }
    [Id(1)] public ContextEntry[] Entries { get; init; } = [];
}

[GrainType("agent-context")]
internal sealed class AgentContextNeuron(
    [PersistentState("agent-context", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<AgentContextState> store)
    : Neuron<AgentContextState>(store), IAgentContext
{
    public async Task Set(ContextEntry entry)
    {
        ArgumentNullException.ThrowIfNull(entry);
        if (string.IsNullOrWhiteSpace(entry.Name) || entry.Name.Length > 200) { throw new ArgumentException("A context entry needs a name of at most 200 characters.", nameof(entry)); }
        if (entry.Text.Length > 32000) { throw new ArgumentException("A context entry holds at most 32000 characters.", nameof(entry)); }
        if (entry.Tools.Length > 128 || entry.Tools.Any(string.IsNullOrWhiteSpace)) { throw new ArgumentException("A context entry names at most 128 non-empty tools.", nameof(entry)); }
        var kept = entry with { Tools = entry.Tools.ToArray() };
        var index = Array.FindIndex(Snapshot.Entries, item => item.Name == entry.Name);
        ContextEntry[] entries = index < 0 ? [.. Snapshot.Entries, kept] : [.. Snapshot.Entries[..index], kept, .. Snapshot.Entries[(index + 1)..]];
        var revision = Snapshot.Revision + 1;
        await Save(Snapshot with { Revision = revision, Entries = entries }, new ContextUpdated(this.GetPrimaryKeyString(), revision, entry.Name));
    }

    public async Task Remove(string name)
    {
        if (Array.FindIndex(Snapshot.Entries, item => item.Name == name) is var index && index < 0) { return; }
        var revision = Snapshot.Revision + 1;
        ContextEntry[] entries = [.. Snapshot.Entries[..index], .. Snapshot.Entries[(index + 1)..]];
        await Save(Snapshot with { Revision = revision, Entries = entries }, new ContextRemoved(this.GetPrimaryKeyString(), revision, name));
    }

    public Task<ContextSnapshot> Read() => Task.FromResult(new ContextSnapshot(Snapshot.Revision, Snapshot.Entries.ToArray()));
}
```

- [ ] **Step 5: Run the facts**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-method "*AgentContextFacts*"`
Expected: 4 passed. If `RemoveDropsTheEntry...` fails on the revision (idempotent remove must not bump it), the early `return` above already guards it; check `Array.FindIndex` placement.

- [ ] **Step 6: Commit**

```bash
git add -A src/DigitalBrain.Modules/AI
git commit -m "AI: context is a neuron — IAgentContext with named entries and ContextUpdated/ContextRemoved

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The agent neuron — one transcript, one loop, Run and Start

**Files:**
- Rewrite: Contracts `Agents/IAgent.cs`, `Agents/AgentState.cs`, `Agents/AgentDefinition.cs`, `Agents/AgentTurnEvent.cs`, `Agents/Signals/AgentSignals.cs` (replaces `AgentLifecycle.cs`, `AgentReplied.cs`, `AgentTurnSignals.cs`)
- Create: Contracts `Agents/AgentTurn.cs`, `Agents/AgentExtensions.cs`
- Rewrite: `DigitalBrain.Modules.AI/Agents/AgentNeuron.cs`
- Create: `DigitalBrain.Modules.AI/Agents/AgentTurnLoop.cs`, `Agents/IAgentDriver.cs`
- Rewrite as façade: `DigitalBrain.Modules.AI/Agents/AgentExecutionNeuron.cs`, Contracts `Agents/IAgentExecution.cs` (deleted in Task 4)
- Delete: `Agents/AgentTurnRunner.cs`, `Agents/IAgentTurnRunner.cs`, `Agents/IAgentTurnDriver.cs`, `Agents/AgentActivation.cs`, Contracts `Agents/AgentConversation.cs`, `Agents/AgentRequest.cs`, `Agents/AgentReply.cs`, `Agents/AgentTurnStart.cs`, `Agents/AgentTurnRequest.cs`; `IAgentContextProvider`, `AgentContextRequest`, `AgentContext` from `Agents/AgentTools.cs`
- Rewrite tests: `tests/.../Agents/AgentCancellationFacts.cs`, `AgentExecutionFacts.cs`, `AgentHistoryFacts.cs`, `AgentRecoveryFacts.cs`, `AgentStreamingFacts.cs`, `AgentToolFacts.cs`, `AgentToolOfferFacts.cs`, `AgentTurnStartFacts.cs`, `HostedAgentFacts.cs`, `ScriptedTurnFacts.cs`
- Modify: `AIModule.cs` (drop `IAgentTurnRunner` and `AgentActivation` registrations)

**Interfaces:**
- Consumes `ModelCatalog.Resolve/CreateClient/Describe`, `IAgentContext.Read`.
- Produces the `IAgent` contract below, `AgentTurn`, `AgentState`, `AgentRun`, signals; Task 4 switches the Assistant and scripts to them.

- [ ] **Step 1: Write the contracts**

`Contracts/Agents/IAgent.cs`:

```csharp
using DigitalBrain;
using Orleans.Concurrency;

namespace DigitalBrain.AI.Agents;

// The agent keeps the transcript and runs its own turn. Run streams the turn; Start answers the
// run id at once and reports the turn as signals. Both publish the same signals.
[Alias("agent"), Orleans.Metadata.DefaultGrainType("agent")]
public interface IAgent : INeuron
{
    [AlwaysInterleave] Task Configure(AgentDefinition definition, long expectedRevision);
    [AlwaysInterleave, ResponseTimeout("00:10:00")] IAsyncEnumerable<AgentTurnEvent> Run(AgentTurn turn, CancellationToken ct = default);
    [AlwaysInterleave] Task<string> Start(AgentTurn turn);
    [AlwaysInterleave] Task Cancel();
    [ReadOnly, AlwaysInterleave] Task<AgentState> Read();
    [ReadOnly, AlwaysInterleave] Task<AiMessage[]> Transcript();
    [AlwaysInterleave] Task Clear();
}
```

`Contracts/Agents/AgentTurn.cs`:

```csharp
namespace DigitalBrain.AI.Agents;

// One request to the agent. RunId is caller-chosen for replay (at most 200 characters) or null
// for a fresh id. Model, Instructions and Tools override the definition for this turn only.
// Intent names the metering intent; null meters under the run id.
[GenerateSerializer, Alias("ai.agent-turn")]
public sealed record AgentTurn(
    [property: Id(0)] AiMessage Message,
    [property: Id(1)] string? RunId = null,
    [property: Id(2)] ModelSelection? Model = null,
    [property: Id(3)] string? Instructions = null,
    [property: Id(4)] string[]? Tools = null,
    [property: Id(5)] string? Intent = null)
{
    public static AgentTurn Text(string message, string? runId = null, string? model = null, string? instructions = null, string[]? tools = null)
        => new(new AiMessage("user", [new AiText(message)]), runId, model is { Length: > 0 } ? new(model) : null, instructions, tools);
}
```

`Contracts/Agents/AgentState.cs`:

```csharp
namespace DigitalBrain.AI.Agents;

public enum AgentRunStatus { Running, Completed, Failed, Cancelled, Interrupted }

[GenerateSerializer, Alias("ai.agent-usage")]
public sealed record AgentUsage([property: Id(0)] long? InputTokens, [property: Id(1)] long? OutputTokens, [property: Id(2)] long? TotalTokens);

[GenerateSerializer, Alias("ai.agent-tool-call")]
public sealed record AgentToolCall([property: Id(0)] string CallId, [property: Id(1)] string Name, [property: Id(2)] string Arguments,
    [property: Id(3)] string? Result = null, [property: Id(4)] string? Code = null, [property: Id(5)] string? Error = null);

// One turn of the agent, from the user's text to the reply or the reason there is none.
[GenerateSerializer, Alias("ai.agent-run")]
public sealed record AgentRun(
    [property: Id(0)] string RunId,
    [property: Id(1)] AgentRunStatus Status,
    [property: Id(2)] string UserText,
    [property: Id(3)] DateTimeOffset StartedAt,
    [property: Id(4)] DateTimeOffset? EndedAt = null,
    [property: Id(5)] string? Reply = null,
    [property: Id(6)] ResolvedModel? Model = null,
    [property: Id(7)] AgentUsage? Usage = null,
    [property: Id(8)] string? Error = null)
{
    [Id(9)] public AgentToolCall[] ToolCalls { get; init; } = [];
}

// Transcript is read through IAgent.Transcript; it is too large to ride along on every read.
[GenerateSerializer, Alias("ai.agent-state")]
public sealed record AgentState(
    [property: Id(0)] long Revision,
    [property: Id(1)] AgentDefinition Definition,
    [property: Id(2)] string? Summary,
    [property: Id(3)] AgentRun? ActiveRun,
    [property: Id(4)] AgentRun[] Runs);
```

`Contracts/Agents/AgentDefinition.cs`: replace `ContextProviders` with `[Id(11)] public string[] Contexts { get; init; } = [];` (context neuron keys). `Model` is `ModelSelection?` from Task 1. `AgentMetadata` is deleted (its fields are on `Definition`).

`Contracts/Agents/AgentTurnEvent.cs`: unchanged except `ModelSelected(ResolvedModel Model, ModelDescriptor Descriptor)`.

`Contracts/Agents/Signals/AgentSignals.cs` (delete the three old signal files):

```csharp
using DigitalBrain;

namespace DigitalBrain.AI.Agents.Signals;

[GenerateSerializer, Alias("agent.configured")]
public sealed record AgentConfigured([property: Id(0)] string AgentId, [property: Id(1)] long Revision) : Signal;

[GenerateSerializer, Alias("agent.turn-started")]
public sealed record TurnStarted([property: Id(0)] string AgentId, [property: Id(1)] string RunId, [property: Id(2)] string UserText) : Signal;

// Sequence numbers a run's progress from 1; delivery is at-least-once, so handlers key their
// writes by (RunId, Sequence). Kind is text, tool-call, tool-result, card or receipt.
[GenerateSerializer, Alias("agent.turn-progressed")]
public sealed record TurnProgressed([property: Id(0)] string AgentId, [property: Id(1)] string RunId, [property: Id(2)] string Kind,
    [property: Id(3)] string? Text, [property: Id(4)] string? Tool, [property: Id(5)] string? Payload, [property: Id(6)] int Sequence) : Signal;

[GenerateSerializer, Alias("agent.turn-completed")]
public sealed record TurnCompleted([property: Id(0)] string AgentId, [property: Id(1)] string RunId, [property: Id(2)] string Reply) : Signal;

[GenerateSerializer, Alias("agent.turn-failed")]
public sealed record TurnFailed([property: Id(0)] string AgentId, [property: Id(1)] string RunId, [property: Id(2)] string Error, [property: Id(3)] bool Cancelled) : Signal;

[GenerateSerializer, Alias("agent.transcript-cleared")]
public sealed record TranscriptCleared([property: Id(0)] string AgentId, [property: Id(1)] long Revision) : Signal;
```

`Contracts/Agents/AgentExtensions.cs`:

```csharp
using System.Runtime.CompilerServices;
using System.Text;

namespace DigitalBrain.AI.Agents;

[GenerateSerializer, Alias("ai.agent-reply")]
public sealed record AgentReply([property: Id(0)] string Text, [property: Id(1)] AgentUsage? Usage);

public static class AgentExtensions
{
    public static async Task<string> GetResponse(this IAgent agent, string prompt, CancellationToken ct = default)
        => (await agent.Respond(AgentTurn.Text(prompt), ct)).Text;

    public static async Task<AgentReply> Respond(this IAgent agent, AgentTurn turn, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(agent);
        var text = new StringBuilder();
        AgentTurnEvent.Completed? completed = null;
        await foreach (var item in agent.Run(turn, ct))
        {
            switch (item)
            {
                case AgentTurnEvent.Text delta: text.Append(delta.Content); break;
                case AgentTurnEvent.Completed done: completed = done; break;
                case AgentTurnEvent.Failed failed when failed.Cancelled: throw new OperationCanceledException(failed.Message, ct);
                case AgentTurnEvent.Failed failed: throw new InvalidOperationException(failed.Message);
            }
        }
        if (completed is null) { throw new InvalidOperationException("The run ended without a completed response."); }
        return new(text.ToString(), completed.Usage);
    }

    public static async IAsyncEnumerable<string> GetResponseStream(this IAgent agent, string prompt, [EnumeratorCancellation] CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(agent);
        await foreach (var item in agent.Run(AgentTurn.Text(prompt), ct))
        {
            switch (item)
            {
                case AgentTurnEvent.Text delta: yield return delta.Content; break;
                case AgentTurnEvent.Failed failed when failed.Cancelled: throw new OperationCanceledException(failed.Message, ct);
                case AgentTurnEvent.Failed failed: throw new InvalidOperationException(failed.Message);
            }
        }
    }
}
```

In `Agents/AgentTools.cs` delete `IAgentContextProvider`, `AgentContextRequest`, `AgentContext`.

- [ ] **Step 2: Write the failing agent facts**

Replace the ten test files with these (each keeps the fact it carried; helpers `StubChatClient`, `AiRegistrationSeeds`, `LoopbackServer` stay). New file `tests/.../Agents/AgentFacts.cs` carries the shared helpers:

```csharp
using DigitalBrain.AI;
using DigitalBrain.AI.Agents;
using DigitalBrain.Framework.Enforcement;
using DigitalBrain.Testing.Module;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests.Agents;

internal static class Agents
{
    public const string Scope = "research";
    public static string Key(string name) => Scope + "/agents/" + name;

    public static Task<ModuleBrain> Brain(IChatClient client, CancellationToken ct, Action<IServiceCollection>? services = null)
        => ModuleTest.Create().WithModule<AIModule>().ConfigureSilo(silo => { silo.Services.AddSingleton(client); services?.Invoke(silo.Services); }).StartAsync(ct);

    public static async Task<List<AgentTurnEvent>> Collect(IAgent agent, AgentTurn turn, CancellationToken ct)
    {
        var events = new List<AgentTurnEvent>();
        await foreach (var item in agent.Run(turn, ct)) { events.Add(item); }
        return events;
    }

    public static void StampUser() => CallerContextStamper.Stamp(new CallerContext
    { PrincipalId = "owner", AccountId = "owner", BrainId = Scope, Kind = CallerKind.User, StampedBy = TrustedEdge.AuthenticatedHttp });
}
```

`AgentHistoryFacts.cs`:

```csharp
public sealed class AgentHistoryFacts
{
    [Fact]
    public async Task ConfigurationAndTranscriptSurviveReactivationAndClearIsExplicit()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Agents.Brain(HistoryClient(), ct);
        var agent = brain.Get<IAgent>(Agents.Key("durable"));
        await agent.Configure(new() { DisplayName = "Writer", Instructions = "Write carefully" }, 0);
        await Assert.ThrowsAsync<InvalidOperationException>(() => agent.Configure(new(), 0));
        await agent.GetResponse("remember", ct);
        await brain.DeactivateAsync(agent, ct);
        Assert.Equal("Writer", (await agent.Read()).Definition.DisplayName);
        Assert.Equal(2, (await agent.Transcript()).Length);
        Assert.Equal(AgentRunStatus.Completed, Assert.Single((await agent.Read()).Runs).Status);
        await agent.Clear();
        Assert.Empty(await agent.Transcript());
        Assert.Empty((await agent.Read()).Runs);
    }

    [Fact]
    public async Task StreamingCommitsTheTranscriptOnlyAfterCompletion()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Agents.Brain(HistoryClient(), ct);
        var agent = brain.Get<IAgent>(Agents.Key("stream"));
        var text = "";
        await foreach (var delta in agent.GetResponseStream("hello", ct)) { text += delta; }
        Assert.Equal("hello", text);
        Assert.Equal(2, (await agent.Transcript()).Length);
    }

    [Fact]
    public async Task SubsequentQuestionsIncludeTheCommittedTranscriptAndOtherAgentsStayIsolated()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Agents.Brain(HistoryClient(), ct);
        var agent = brain.Get<IAgent>(Agents.Key("history"));
        Assert.Equal("first", await agent.GetResponse("first", ct));
        Assert.Equal("first|first|second", await agent.GetResponse("second", ct));
        Assert.Equal("other", await brain.Get<IAgent>(Agents.Key("separate")).GetResponse("other", ct));
    }

    [Fact]
    public async Task ReplayRequiresTheSameTextAndReturnsTheStoredReply()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = StubChatClient.Replying("stored");
        await using var brain = await Agents.Brain(client, ct);
        var agent = brain.Get<IAgent>(Agents.Key("replay"));
        await Agents.Collect(agent, AgentTurn.Text("hello", runId: "run-1"), ct);
        var replay = await Agents.Collect(agent, AgentTurn.Text("hello", runId: "run-1"), ct);
        Assert.Equal("stored", Assert.Single(replay.OfType<AgentTurnEvent.Text>()).Content);
        Assert.Single(client.Requests);
        await Assert.ThrowsAsync<InvalidOperationException>(() => Agents.Collect(agent, AgentTurn.Text("different", runId: "run-1"), ct));
        Assert.Single((await agent.Read()).Runs);
    }

    [Fact]
    public async Task TheTranscriptFoldsOverflowIntoTheSummary()
    {
        var ct = TestContext.Current.CancellationToken;
        var client = StubChatClient.Replying("ok");
        await using var brain = await Agents.Brain(client, ct);
        var agent = brain.Get<IAgent>(Agents.Key("bounded"));
        await agent.Configure(new() { MaxHistoryMessages = 4 }, 0);
        for (var i = 0; i < 4; i++) { await agent.GetResponse("message " + i, ct); }
        Assert.Equal(4, (await agent.Transcript()).Length);
        Assert.Contains("message 0", (await agent.Read()).Summary);
        Assert.Contains(client.Requests[^1], message => message.Role == ChatRole.System && message.Text.Contains("message 0", StringComparison.Ordinal));
    }

    // Replies with every user text joined by '|', so the test can see what the model was given.
    private static StubChatClient HistoryClient() => new((messages, _, _) => Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant,
        string.Join("|", messages.Where(message => message.Role != ChatRole.System).Select(message => message.Text))))));
}
```

`AgentTurnStartFacts.cs` (replaces the execution-based file; `UntilEnd` keeps its shape with the new signal types):

```csharp
public sealed class AgentTurnStartFacts
{
    [Fact]
    public async Task StartAnswersARunIdAndPublishesTheTextThenCompletion()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Agents.Brain(StubChatClient.Replying("hello there"), ct);
        var agent = brain.Get<IAgent>(Agents.Key("main"));
        using var signals = brain.SiloServices.GetRequiredService<LocalSignalHub>().Subscribe<Signal>();
        var runId = await agent.Start(AgentTurn.Text("hi", instructions: "Be brief."));
        var seen = await UntilEnd(signals, runId, ct);
        var completed = Assert.IsType<TurnCompleted>(seen[^1]);
        Assert.Equal("hello there", completed.Reply);
        var text = Assert.Single(seen.OfType<TurnProgressed>(), step => step.Kind == "text");
        Assert.Equal(("hello there", runId, 1), (text.Text, text.RunId, text.Sequence));
        var state = await agent.Read();
        Assert.Null(state.ActiveRun);
        Assert.Equal(("hi", "hello there"), (Assert.Single(state.Runs).UserText, state.Runs[0].Reply));
    }

    [Fact]
    public async Task AFailingTurnPublishesFailedAndKeepsTheFailureInTheRun()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await Agents.Brain(StubChatClient.Failing("provider down"), ct);
        var agent = brain.Get<IAgent>(Agents.Key("main"));
        using var signals = brain.SiloServices.GetRequiredService<LocalSignalHub>().Subscribe<Signal>();
        var runId = await agent.Start(AgentTurn.Text("hi"));
        var failed = Assert.IsType<TurnFailed>((await UntilEnd(signals, runId, ct))[^1]);
        Assert.Contains("provider down", failed.Error, StringComparison.Ordinal);
        var run = Assert.Single((await agent.Read()).Runs);
        Assert.Equal(AgentRunStatus.Failed, run.Status);
        Assert.Contains("provider down", run.Error, StringComparison.Ordinal);
        Assert.Empty(await agent.Transcript());
    }

    [Fact]
    public async Task StartingATurnIsNotHeldUpByAnotherAgentsRunningTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new StubChatClient(async (_, _, _) => { await release.Task; return new ChatResponse(new ChatMessage(ChatRole.Assistant, "done")); });
        await using var brain = await Agents.Brain(client, ct);
        await brain.Get<IAgent>(Agents.Key("one")).Start(AgentTurn.Text("first"));
        var second = brain.Get<IAgent>(Agents.Key("two")).Start(AgentTurn.Text("second"));
        Assert.Same(second, await Task.WhenAny(second, Task.Delay(TimeSpan.FromSeconds(5), ct)));
        release.TrySetResult();
        Assert.NotEmpty(await second);
    }

    [Fact]
    public async Task ASecondTurnIsRefusedWhileOneRuns()
    {
        var ct = TestContext.Current.CancellationToken;
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var client = new StubChatClient(async (_, _, _) => { await release.Task; return new ChatResponse(new ChatMessage(ChatRole.Assistant, "done")); });
        await using var brain = await Agents.Brain(client, ct);
        var agent = brain.Get<IAgent>(Agents.Key("main"));
        await agent.Start(AgentTurn.Text("first"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => agent.Start(AgentTurn.Text("second"))).WaitAsync(TimeSpan.FromSeconds(5), ct);
        release.TrySetResult();
    }

    private static async Task<List<Signal>> UntilEnd(LocalSignalHub.Subscription<Signal> signals, string runId, CancellationToken ct)
    {
        var seen = new List<Signal>();
        await foreach (var signal in signals.Reader.ReadAllAsync(ct))
        {
            switch (signal)
            {
                case TurnProgressed progressed when progressed.RunId == runId: seen.Add(signal); break;
                case TurnCompleted completed when completed.RunId == runId: seen.Add(signal); return seen;
                case TurnFailed failed when failed.RunId == runId: seen.Add(signal); return seen;
            }
        }
        return seen;
    }
}
```

`AgentStreamingFacts.cs` keeps both facts. `ProviderFailureIsDeliveredEvenAfterABurstOfText` runs the `BurstProvider` through `agent.Run(AgentTurn.Text("hello"))` and asserts exactly one `Failed` with "Provider stopped" and no `Finished`. The abandoned-stream fact:

```csharp
[Fact]
public async Task AbandonedStreamCancelsTheProviderAndLeavesTheTranscriptUnchanged()
{
    var ct = TestContext.Current.CancellationToken;
    var provider = new WaitingStreamProvider();
    await using var brain = await Agents.Brain(provider.Client, ct);
    var agent = brain.Get<IAgent>(Agents.Key("abandoned"));
    var failed = brain.On<TurnFailed>(agent, ct).GetAsyncEnumerator(ct);
    await using (var stream = agent.Run(AgentTurn.Text("hello"), ct).GetAsyncEnumerator(ct))
    {
        while (await stream.MoveNextAsync() && stream.Current is not AgentTurnEvent.Text) { }
        Assert.Equal("partial", Assert.IsType<AgentTurnEvent.Text>(stream.Current).Content);
    }
    await provider.Cancelled.Task.WaitAsync(ct);
    Assert.True(await failed.MoveNextAsync());
    Assert.True(failed.Current.Cancelled);
    var state = await agent.Read();
    Assert.Null(state.ActiveRun);
    Assert.Equal(AgentRunStatus.Cancelled, Assert.Single(state.Runs).Status);
    Assert.Empty(await agent.Transcript());
}
```

`WaitingStreamProvider` is the existing helper (yields "partial", then waits on the token and completes `Cancelled` in `finally`).

`AgentCancellationFacts.cs` keeps its three facts (`CancellationClosesThePersistedToolAttempt`, `CancelInterleavesWithInferenceAndDoesNotCommitAnIncompleteTurn`, `ProviderFailureIsFailedAndNeverCommitsHistory`) with `agent.Cancel()` and `Read().Runs[^1].ToolCalls` in place of `GetEventLog()`: a tool call that was started but never completed carries `Code == "tool_cancelled"` or `"tool_interrupted"`.

`AgentRecoveryFacts.cs`: a run left `Running` in storage is `Interrupted` after reactivation, asserted through `Read().Runs[^1]` after `brain.DeactivateAsync(agent, ct)` while a provider holds the call.

`AgentToolFacts.cs` and `AgentToolOfferFacts.cs`: every fact that built `new AgentTurnRunner(services).RunAsync(new("agent", "run", "scope", [], message, null, ToolNames: [...]))` becomes a brain-hosted `agent.Run(AgentTurn.Text(message, tools: [...]))` with the tool factories registered through `Agents.Brain(client, ct, services => services.AddSingleton<IAgentToolFactory, Tools>())`. The three context facts become:

```csharp
[Fact]
public async Task SelectedContextsReachTheModelBeforeTheMessage()
{
    var ct = TestContext.Current.CancellationToken;
    var client = StubChatClient.Replying("done");
    await using var brain = await Agents.Brain(client, ct);
    await brain.Get<IAgentContext>(Agents.Key("main") + "/context").Set(new("capabilities", "Available: invoices", []));
    await brain.Get<IAgentContext>(Agents.Key("other") + "/context").Set(new("unselected", "must not appear", []));
    var agent = brain.Get<IAgent>(Agents.Key("main"));
    await agent.Configure(new() { Contexts = [Agents.Key("main") + "/context"] }, 0);
    await Agents.Collect(agent, AgentTurn.Text("ask"), ct);
    var messages = Assert.Single(client.Requests);
    Assert.Equal([ChatRole.System, ChatRole.User], messages.Select(message => message.Role));
    Assert.Equal("Available: invoices", messages[0].Text);
}

[Fact]
public async Task AMissingContextIsSkippedAndTheOthersReachTheModel()
{
    var ct = TestContext.Current.CancellationToken;
    var client = StubChatClient.Replying("done");
    await using var brain = await Agents.Brain(client, ct);
    await brain.Get<IAgentContext>(Agents.Key("main") + "/context").Set(new("capabilities", "Available: invoices", []));
    var agent = brain.Get<IAgent>(Agents.Key("main"));
    await agent.Configure(new() { Contexts = [Agents.Key("main") + "/context", "research/agents/nowhere/context"] }, 0);
    var events = await Agents.Collect(agent, AgentTurn.Text("ask"), ct);
    Assert.Single(events.OfType<AgentTurnEvent.Finished>());
    Assert.Equal("Available: invoices", Assert.Single(client.Requests)[0].Text);
}

[Fact]
public async Task ContextToolsJoinTheTurnOnlyWhenTheHostRegistersThem()
{
    var ct = TestContext.Current.CancellationToken;
    await using var brain = await Agents.Brain(ScriptedClient(), ct, services => services.AddSingleton<IAgentToolFactory, Tools>());
    await brain.Get<IAgentContext>(Agents.Key("main") + "/context").Set(new("capabilities", "Available: lookup", ["lookup", "not_registered"]));
    var agent = brain.Get<IAgent>(Agents.Key("main"));
    await agent.Configure(new() { Contexts = [Agents.Key("main") + "/context"] }, 0);
    var events = await Agents.Collect(agent, AgentTurn.Text("ask"), ct);
    Assert.Equal("lookup", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Name);
}
```

An empty context (no entries, or a neuron that was never written) contributes nothing: no system message is added for it.

`ScriptedTurnFacts.cs`: `brain.Get<IAgentExecution>("scripted").Run(new(..., new AgentModelSelection(Model: IScriptedLLM.ModelPrefix + "turn-model"), ToolNames: ["echo"]), "intent", ct)` becomes `brain.Get<IAgent>(Agents.Key("scripted")).Run(AgentTurn.Text("go", model: IScriptedLLM.ModelPrefix + "turn-model", tools: ["echo"]), ct)`; assertions unchanged.

`AgentExecutionFacts.cs` keeps `MeteringStorageFailureDoesNotInvalidateASuccessfulExecution` (through `agent.Run`) and `ExecutionWithoutAProviderReturnsFailureInsteadOfSuccess` (a brain with no `IChatClient` injected: `Run` yields one `Failed`, no `Finished`). The brain-scope refusal fact becomes `AnAgentKeyedUnderAnotherBrainIsRefusedForAStampedUser`: with `Agents.StampUser()` in effect, `brain.Get<IAgent>("elsewhere/agents/x").Run(...)` throws `UnauthorizedAccessException` before the model is called (the framework enforces `Neuron.Access` from the key's first segment).

`HostedAgentFacts.cs`: `agent.GetResponse` stays (extension); `brain.Observe<AgentReplied>` becomes `brain.On<TurnCompleted>(agent, ct)`; `GetHistory(ct)).Count` becomes `Transcript()).Length`.

- [ ] **Step 3: Run the test project build to see it fail**

Run: `dotnet build src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/DigitalBrain.Modules.AI.Tests.csproj`
Expected: errors on `AgentTurn`, `TurnCompleted`, `IAgent.Run`.

- [ ] **Step 4: Write `IAgentDriver` and `AgentTurnLoop`**

`Agents/IAgentDriver.cs`:

```csharp
namespace DigitalBrain.AI.Agents;

// Start hands the turn to this one-way self-reference, so the caller's request ends while the
// turn runs on the agent's own scheduler. Interleaving lets Read and Cancel reach the agent meanwhile.
internal interface IAgentDriver : IGrainWithStringKey
{
    [Orleans.Concurrency.OneWay, Orleans.Concurrency.AlwaysInterleave] Task Drive(AgentTurn turn, string runId);
}
```

`Agents/AgentTurnLoop.cs`. This is `AgentTurnRunner.Execute` as a pull-based iterator: the consumer persists between pulls, so nothing external starts before the agent has written what came before it.

```csharp
using System.Runtime.CompilerServices;
using System.Text.Json;
using DigitalBrain.AI.Agents.Context;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.AI.Agents;

internal sealed record TurnPlan(string ScopeId, string RunId, AiMessage[] Transcript, string? Summary, AiMessage Input, string Instructions,
    string[] ToolNames, string[] Contexts, ModelSelection? Model, InferenceOptions? Options, int MaxModelCalls, bool Streaming);

// Providers propose calls; this is the single, bounded tool invocation loop. It yields events in
// order and throws nothing past Run: a failure becomes the last event.
internal sealed class AgentTurnLoop(IServiceProvider services, IGrainFactory grains)
{
    public async IAsyncEnumerable<AgentTurnEvent> Run(TurnPlan plan, [EnumeratorCancellation] CancellationToken ct)
    {
        await using var steps = Steps(plan, ct).GetAsyncEnumerator(ct);
        AgentTurnEvent.Failed? failure = null;
        while (true)
        {
            try { if (!await steps.MoveNextAsync()) { break; } }
            catch (Exception error)
            {
                failure = new(error is OperationCanceledException ? "The run was interrupted." : error.Message, error is OperationCanceledException);
                break;
            }
            yield return steps.Current;
        }
        if (failure is not null) { yield return failure; }
    }

    private async IAsyncEnumerable<AgentTurnEvent> Steps(TurnPlan plan, [EnumeratorCancellation] CancellationToken ct)
    {
        if (plan.MaxModelCalls is < 1 or > 128) { throw new ArgumentOutOfRangeException(nameof(plan), "MaxModelCalls must be between 1 and 128."); }
        if (plan.ToolNames.Distinct(StringComparer.Ordinal).Count() != plan.ToolNames.Length) { throw new ArgumentException("Tool names must be unique."); }
        var sessions = new List<IAgentToolSession>();
        try
        {
            yield return new AgentTurnEvent.Started(plan.RunId);
            string? currentCall = null;
            AgentToolContext Context() => new(plan.ScopeId, plan.RunId, currentCall ?? throw new InvalidOperationException("No active tool call."));
            var contexts = await ReadContexts(plan.Contexts, ct);
            var factoryTools = services.GetServices<IAgentToolFactory>().SelectMany(f => f.Create(Context)).ToList();
            // Context may name tools this host does not register; only registered ones join the turn.
            string[] selected = [.. plan.ToolNames, .. contexts.SelectMany(c => c.Tools)
                .Where(name => !plan.ToolNames.Contains(name) && factoryTools.Any(tool => tool.Name == name)).Distinct(StringComparer.Ordinal)];
            var tools = new List<AIFunction>();
            async Task AddTools(IReadOnlyList<string> names, AgentToolBinding? binding = null)
            {
                var pending = names.Where(name => tools.All(tool => tool.Name != name)).Distinct(StringComparer.Ordinal).ToArray();
                if (pending.Length == 0) { return; }
                var available = factoryTools.Where(tool => pending.Contains(tool.Name)).ToList();
                if (services.GetService<NativeTools>() is { } native) { available.AddRange(native.Resolve(pending)); }
                foreach (var source in services.GetServices<IAgentToolSource>())
                {
                    if (binding is not null && source.SourceId != binding.Source) { continue; }
                    // Session tools read the live call identity when invoked, after discovery.
                    var session = binding is null
                        ? await source.OpenAsync(pending, () => new(plan.ScopeId, plan.RunId, currentCall ?? ""), ct)
                        : await source.OpenBoundAsync(binding.Resource, pending, () => new(plan.ScopeId, plan.RunId, currentCall ?? ""), ct);
                    sessions.Add(session);
                    available.AddRange(session.Tools.Where(tool => pending.Contains(tool.Name)));
                }
                tools.AddRange(pending.Select(name =>
                {
                    var matches = available.Where(tool => tool.Name == name).ToArray();
                    return matches.Length == 1 ? matches[0] : throw new InvalidOperationException($"Selected or offered tool '{name}' must have exactly one registration (found {matches.Length}).");
                }));
            }
            await AddTools(selected);
            var initialTools = tools.Select(tool => tool.Name).ToHashSet(StringComparer.Ordinal);

            var catalog = services.GetRequiredService<ModelCatalog>();
            var selection = plan.Model;
            if (plan.Options?.Reasoning is not null || plan.Options?.MaxOutputTokens is not null)
            {
                selection = (selection ?? new()) with
                { Reasoning = plan.Options.Reasoning ?? selection?.Reasoning, MaxOutputTokens = plan.Options.MaxOutputTokens ?? selection?.MaxOutputTokens };
            }
            var resolved = await catalog.Resolve(selection, tools.Count > 0, ct);
            ChatOptions options;
            if (resolved.Provider is AiProvider.Host) { options = new(); }
            else
            {
                var descriptor = catalog.Describe(resolved);
                InferenceMapping.ValidateRequest(new InferenceRequest([.. plan.Transcript, plan.Input], selection, plan.Options), descriptor);
                options = InferenceMapping.CreateOptions(resolved, plan.Options is null ? null : plan.Options with { Reasoning = null }, descriptor);
                yield return new AgentTurnEvent.ModelSelected(resolved, descriptor);
            }
            using var client = await catalog.CreateClient(resolved, ct);
            options.Instructions = plan.Instructions;
            options.Tools = tools.Cast<AITool>().ToList();
            var messages = new List<ChatMessage>();
            if (plan.Summary is { Length: > 0 }) { messages.Add(new(ChatRole.System, "Earlier conversation summary: " + plan.Summary)); }
            foreach (var context in contexts.Where(c => !string.IsNullOrEmpty(c.Text))) { messages.Add(new(ChatRole.System, context.Text)); }
            messages.AddRange(plan.Transcript.Select(InferenceMapping.ToChatMessage));
            messages.Add(InferenceMapping.ToChatMessage(plan.Input));
            var generated = new List<ChatMessage>();
            UsageDetails? usage = null;
            var calls = new HashSet<string>(StringComparer.Ordinal);
            for (var step = 0; step < plan.MaxModelCalls; step++)
            {
                ChatResponse response;
                if (plan.Streaming)
                {
                    var updates = new List<ChatResponseUpdate>();
                    await foreach (var update in client.GetStreamingResponseAsync(messages, options, ct))
                    {
                        updates.Add(update);
                        if (!string.IsNullOrEmpty(update.Text)) { yield return new AgentTurnEvent.Text(update.Text); }
                    }
                    response = updates.ToChatResponse();
                }
                else
                {
                    response = await client.GetResponseAsync(messages, options, ct);
                    if (!string.IsNullOrEmpty(response.Text)) { yield return new AgentTurnEvent.Text(response.Text); }
                }
                ct.ThrowIfCancellationRequested();
                if (response.Usage is not null) { (usage ??= new()).Add(response.Usage); }
                if (response.Messages.Count == 0) { throw new InvalidOperationException("The provider returned no messages."); }
                messages.AddRange(response.Messages);
                generated.AddRange(response.Messages);
                var requested = response.Messages.SelectMany(m => m.Contents).OfType<FunctionCallContent>().ToArray();
                if (requested.Length == 0)
                {
                    yield return new AgentTurnEvent.Completed([.. generated.Select(InferenceMapping.FromChatMessage)],
                        usage is null ? null : new(usage.InputTokenCount, usage.OutputTokenCount, usage.TotalTokenCount));
                    yield return new AgentTurnEvent.Finished();
                    yield break;
                }
                foreach (var call in requested)
                {
                    if (string.IsNullOrWhiteSpace(call.CallId) || !calls.Add(call.CallId)) { throw new InvalidOperationException("The model reused or omitted a tool call identity."); }
                    // The consumer persists the started call before pulling the next event, so the tool never runs unrecorded.
                    yield return new AgentTurnEvent.ToolStarted(call.CallId, call.Name, JsonSerializer.Serialize(call.Arguments));
                    var tool = tools.SingleOrDefault(t => t.Name == call.Name);
                    if (tool is null)
                    {
                        var failure = new { isError = true, code = "tool_unavailable", tool = call.Name,
                            message = "This tool is not available in this turn. Use an advertised discovery tool to find registered capabilities before retrying." };
                        var unavailable = new ChatMessage(ChatRole.Tool, [new FunctionResultContent(call.CallId, failure)]);
                        messages.Add(unavailable);
                        generated.Add(unavailable);
                        yield return new AgentTurnEvent.ToolCompleted(call.CallId, call.Name, JsonSerializer.Serialize(failure));
                        continue;
                    }
                    currentCall = call.CallId;
                    object? result;
                    string serializedResult;
                    AgentTurnEvent.ToolFailed? failed = null;
                    try
                    {
                        result = await tool.InvokeAsync(new AIFunctionArguments(call.Arguments ?? new Dictionary<string, object?>()), ct);
                        ct.ThrowIfCancellationRequested();
                        if (result is AgentToolOffer offer)
                        {
                            if (offer.Tools.Count > 32) { throw new InvalidOperationException("A capability may offer at most 32 tools. Select a smaller operation group."); }
                            if (offer.ReplaceSelection) { tools.RemoveAll(t => !initialTools.Contains(t.Name)); }
                            if (tools.Where(t => !initialTools.Contains(t.Name)).Select(t => t.Name).Union(offer.Tools, StringComparer.Ordinal).Count() > 32)
                            { throw new InvalidOperationException("A turn may select at most 32 additional tools."); }
                            await AddTools(offer.Tools, offer.Binding);
                            options.Tools = tools.Cast<AITool>().ToList();
                            result = offer.Result;
                        }
                        serializedResult = JsonSerializer.Serialize(result);
                    }
                    catch (Exception error)
                    {
                        failed = new(call.CallId, call.Name, error is OperationCanceledException ? "tool_cancelled" : "tool_failed",
                            error is OperationCanceledException ? "The tool call was interrupted." : error.Message);
                        result = null;
                        serializedResult = "";
                    }
                    finally { currentCall = null; }
                    if (failed is not null) { yield return failed; throw new InvalidOperationException(failed.Message); }
                    var resultMessage = new ChatMessage(ChatRole.Tool, [new FunctionResultContent(call.CallId, result)]);
                    messages.Add(resultMessage);
                    generated.Add(resultMessage);
                    yield return new AgentTurnEvent.ToolCompleted(call.CallId, call.Name, serializedResult);
                }
            }
            throw new InvalidOperationException("The agent reached its model-call budget.");
        }
        finally
        {
            foreach (var session in sessions.AsEnumerable().Reverse())
            {
                try { await session.DisposeAsync(); }
                catch { /* Cleanup must not replace the already recorded execution outcome. */ }
            }
        }
    }

    // A context that is missing or fails leaves the turn without it rather than failing the turn.
    private async Task<List<ContextEntry>> ReadContexts(string[] keys, CancellationToken ct)
    {
        var entries = new List<ContextEntry>();
        foreach (var key in keys)
        {
            try { entries.AddRange((await grains.GetGrain<IAgentContext>(key).Read().WaitAsync(ct)).Entries); }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                services.GetService<ILoggerFactory>()?.CreateLogger<AgentTurnLoop>().LogWarning(error, "Context {Context} could not be read; the turn continues without it.", key);
            }
        }
        return entries;
    }
}
```

Note on the cancelled-tool path: the old runner threw from inside the `catch` after writing `ToolFailed`; an iterator cannot `yield` inside a `catch`, so the failure is captured and yielded after the `finally`, then thrown so `Run` emits the terminal `Failed`.

- [ ] **Step 5: Write `AgentNeuron`**

```csharp
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using DigitalBrain;
using DigitalBrain.AI.Agents.Signals;
using DigitalBrain.AI.Metering;
using DigitalBrain.Framework;
using DigitalBrain.Framework.Metering;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Orleans.Runtime;

namespace DigitalBrain.AI.Agents;

[GenerateSerializer, Alias("agent.storage")]
public sealed record AgentStorage
{
    [Id(0)] public long Revision { get; init; }
    [Id(1)] public AgentDefinition Definition { get; init; } = new();
    [Id(2)] public AiMessage[] Transcript { get; init; } = [];
    [Id(3)] public string? Summary { get; init; }
    [Id(4)] public AgentRun? ActiveRun { get; init; }
    [Id(5)] public AgentRun[] Runs { get; init; } = [];
}

[GrainType("agent")]
internal sealed class AgentNeuron(
    [PersistentState("agent", DigitalBrainNames.DefaultGrainStorage)] IPersistentState<AgentStorage> store,
    IServiceProvider services) : Neuron, IAgent, IAgentDriver
{
    private const int KeptRuns = 64;
    private CancellationTokenSource? _active;
    private bool _mutating;
    private AgentStorage State => store.State;
    private string Key => this.GetPrimaryKeyString();
    private string Scope => Key.Contains('/') ? Key[..Key.IndexOf('/')] : Key;

    // A run the previous activation left open is interrupted: external tool outcomes may be unknown.
    internal async Task Resume()
    {
        if (State.ActiveRun is { Status: AgentRunStatus.Running } open)
        {
            await Persist(State with { ActiveRun = null, Runs = Keep(State.Runs, open with
            { Status = AgentRunStatus.Interrupted, EndedAt = DateTimeOffset.UtcNow, Error = "Activation ended before the run committed; external tool outcomes may be unknown." }) });
        }
    }

    public async Task Configure(AgentDefinition definition, long expectedRevision)
    {
        EnsureIdle();
        ArgumentNullException.ThrowIfNull(definition);
        if (State.Revision != expectedRevision) { throw new InvalidOperationException("Agent revision conflict."); }
        if (definition.MaxModelCalls is < 1 or > 128 || definition.Timeout <= TimeSpan.Zero || definition.Timeout > TimeSpan.FromMinutes(10)
            || definition.MaxHistoryMessages is < 2 or > 4096) { throw new ArgumentException("Invalid agent execution limits.", nameof(definition)); }
        if (definition.Instructions.Length > 32000 || definition.Tools.Length > 128 || definition.Tools.Any(string.IsNullOrWhiteSpace)
            || definition.Tools.Distinct(StringComparer.Ordinal).Count() != definition.Tools.Length || definition.Contexts.Length > 32)
        { throw new ArgumentException("Instructions, tool selection or contexts are invalid.", nameof(definition)); }
        _mutating = true;
        try
        {
            await Persist(State with { Revision = State.Revision + 1, Definition = definition with
            { Tools = definition.Tools.ToArray(), Capabilities = definition.Capabilities.ToArray(), RoutingExamples = definition.RoutingExamples.ToArray(), Contexts = definition.Contexts.ToArray() } });
            await Notify(new AgentConfigured(Key, State.Revision));
        }
        finally { _mutating = false; }
    }

    public Task<AgentState> Read() => Task.FromResult(new AgentState(State.Revision, State.Definition, State.Summary, State.ActiveRun, State.Runs.ToArray()));
    public Task<AiMessage[]> Transcript() => Task.FromResult(State.Transcript.ToArray());
    public Task Cancel() { _active?.Cancel(); return Task.CompletedTask; }

    public async Task Clear()
    {
        EnsureIdle();
        _mutating = true;
        try
        {
            await Persist(State with { Revision = State.Revision + 1, Transcript = [], Summary = null, Runs = [] });
            await Notify(new TranscriptCleared(Key, State.Revision));
        }
        finally { _mutating = false; }
    }

    public async Task<string> Start(AgentTurn turn)
    {
        var (runId, replay) = Admit(turn);
        if (replay is null)
        {
            await Persist(State with { ActiveRun = new AgentRun(runId, AgentRunStatus.Running, UserText(turn.Message), DateTimeOffset.UtcNow) });
        }
        await this.AsReference<IAgentDriver>().Drive(turn with { RunId = runId }, runId);
        return runId;
    }

    public async Task Drive(AgentTurn turn, string runId)
    {
        try { await foreach (var _ in Run(turn, CancellationToken.None)) { } }
        catch (Exception error) { Logger.LogWarning(error, "Agent turn {RunId} ended with an error.", runId); }
    }

    public async IAsyncEnumerable<AgentTurnEvent> Run(AgentTurn turn, [EnumeratorCancellation] CancellationToken ct = default)
    {
        var (runId, replay) = Admit(turn);
        if (replay is not null)
        {
            yield return new AgentTurnEvent.Started(runId);
            yield return new AgentTurnEvent.Text(replay.Reply ?? "");
            yield return new AgentTurnEvent.Completed([new AiMessage("assistant", [new AiText(replay.Reply ?? "")])], replay.Usage);
            yield return new AgentTurnEvent.Finished();
            yield break;
        }
        var definition = State.Definition;
        var input = turn.Message;
        var run = State.ActiveRun is { RunId: var active } current && active == runId ? current
            : new AgentRun(runId, AgentRunStatus.Running, UserText(input), DateTimeOffset.UtcNow);
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        lifetime.CancelAfter(definition.Timeout);
        _active = lifetime;
        using var intent = IntentContext.Create(turn.Intent ?? runId, Scope);
        var completed = false;
        var text = new StringBuilder();
        var sequence = 0;
        AgentTurnEvent.Failed? failure = null;
        try
        {
            await Persist(State with { ActiveRun = run });
            await Notify(new TurnStarted(Key, runId, run.UserText));
            var bounded = Bound(State.Transcript, Math.Max(1, definition.MaxHistoryMessages - 1), State.Summary);
            var plan = new TurnPlan(Scope, runId, bounded.Messages, bounded.Summary, input,
                turn.Instructions ?? definition.Instructions, turn.Tools ?? definition.Tools, definition.Contexts,
                turn.Model ?? definition.Model, definition.Options, definition.MaxModelCalls, Streaming: true);
            var loop = new AgentTurnLoop(services, GrainFactory).Run(plan, lifetime.Token).GetAsyncEnumerator(lifetime.Token);
            try
            {
                while (true)
                {
                    bool moved;
                    using (intent.Enter()) { moved = await loop.MoveNextAsync(); }
                    if (!moved) { break; }
                    switch (loop.Current)
                    {
                        case AgentTurnEvent.ModelSelected selected:
                            run = run with { Model = selected.Model };
                            await Persist(State with { ActiveRun = run });
                            break;
                        case AgentTurnEvent.Text delta:
                            text.Append(delta.Content);
                            await Notify(new TurnProgressed(Key, runId, "text", delta.Content, null, null, ++sequence));
                            break;
                        case AgentTurnEvent.ToolStarted tool:
                            run = run with { ToolCalls = [.. run.ToolCalls, new AgentToolCall(tool.CallId, tool.Name, tool.Arguments)] };
                            await Persist(State with { ActiveRun = run });
                            await Notify(new TurnProgressed(Key, runId, "tool-call", null, tool.Name, tool.Arguments, ++sequence));
                            break;
                        case AgentTurnEvent.ToolCompleted tool:
                            run = run with { ToolCalls = Settle(run.ToolCalls, tool.CallId, call => call with { Result = tool.Result }) };
                            await Persist(State with { ActiveRun = run });
                            await Notify(new TurnProgressed(Key, runId, "tool-result", null, tool.Name, tool.Result, ++sequence));
                            if (Card(tool.Result) is { } card) { await Notify(new TurnProgressed(Key, runId, "card", null, tool.Name, card, ++sequence)); }
                            break;
                        case AgentTurnEvent.ToolFailed tool:
                            run = run with { ToolCalls = Settle(run.ToolCalls, tool.CallId, call => call with { Code = tool.Code, Error = tool.Message }) };
                            await Persist(State with { ActiveRun = run });
                            await Notify(new TurnProgressed(Key, runId, "tool-result", tool.Message, tool.Name,
                                JsonSerializer.Serialize(new { isError = true, code = tool.Code, message = tool.Message }), ++sequence));
                            break;
                        case AgentTurnEvent.Completed done:
                            run = run with { Status = AgentRunStatus.Completed, EndedAt = DateTimeOffset.UtcNow, Reply = text.ToString(), Usage = done.Usage };
                            var transcript = Bound([.. State.Transcript, input, .. done.Messages], definition.MaxHistoryMessages, State.Summary);
                            await Persist(State with { Transcript = transcript.Messages, Summary = transcript.Summary, ActiveRun = null, Runs = Keep(State.Runs, run) });
                            completed = true;
                            if (done.Usage is not null) { await Notify(new TurnProgressed(Key, runId, "receipt", null, null, JsonSerializer.Serialize(done.Usage), ++sequence)); }
                            break;
                        case AgentTurnEvent.Failed failed:
                            failure = failed;
                            break;
                    }
                    yield return loop.Current;
                }
            }
            finally { using (intent.Enter()) { await loop.DisposeAsync(); } }
        }
        finally
        {
            try
            {
                if (completed) { await Notify(new TurnCompleted(Key, runId, text.ToString())); }
                else
                {
                    // No failure event means the consumer stopped pulling: an abandoned stream is a cancelled run.
                    var cancelled = failure is null || failure.Cancelled || lifetime.IsCancellationRequested;
                    run = run with
                    {
                        Status = cancelled ? AgentRunStatus.Cancelled : AgentRunStatus.Failed,
                        EndedAt = DateTimeOffset.UtcNow,
                        Error = failure?.Message ?? "The response stream was abandoned.",
                        ToolCalls = [.. run.ToolCalls.Select(call => call.Result is null && call.Code is null
                            ? call with { Code = cancelled ? "tool_cancelled" : "tool_interrupted", Error = "Execution ended before the tool call completed." } : call)],
                    };
                    await Persist(State with { ActiveRun = null, Runs = Keep(State.Runs, run) });
                    await Notify(new TurnFailed(Key, runId, run.Error!, cancelled));
                }
            }
            finally
            {
                _active = null;
                try { await services.GetRequiredService<IIntentUsageSink>().FlushAsync(intent.Snapshot(), CancellationToken.None); }
                catch (Exception error) { Logger.LogWarning(error, "Agent usage flush failed for run {RunId}", runId); }
            }
        }
    }

    // Validates the turn and decides whether it is a fresh run or a replay of a retained one.
    private (string RunId, AgentRun? Replay) Admit(AgentTurn turn)
    {
        ArgumentNullException.ThrowIfNull(turn);
        var message = turn.Message;
        if (message.Role != "user" || message.Content.Count == 0) { throw new ArgumentException("An agent accepts a non-empty user message.", nameof(turn)); }
        if (message.Content.Any(c => c is not (AiText or AiImage or AiAudio)) || message.Content.OfType<AiText>().Sum(t => (long)t.Text.Length) is 0 or > 32000)
        { throw new ArgumentException("User messages carry 1-32000 characters of text, images or audio, never tool calls or reasoning.", nameof(turn)); }
        if (turn.RunId is { Length: > 200 }) { throw new ArgumentException("A run id has at most 200 characters.", nameof(turn)); }
        _ = InferenceMapping.ToChatMessage(message);
        var runId = string.IsNullOrWhiteSpace(turn.RunId) ? Guid.NewGuid().ToString("N") : turn.RunId;
        if (State.Runs.FirstOrDefault(run => run.RunId == runId) is { } retained)
        {
            // A retained run replays only for the same text; another text must never get an unrelated answer.
            if (retained.UserText != UserText(message)) { throw new InvalidOperationException("Run ID already belongs to another message."); }
            return (runId, retained.Status == AgentRunStatus.Completed ? retained : throw new InvalidOperationException("Run ID already belongs to a run that did not complete."));
        }
        if (State.ActiveRun is { } active && active.RunId != runId) { throw new InvalidOperationException("This agent already has an active operation."); }
        if (_active is not null || _mutating) { throw new InvalidOperationException("This agent already has an active operation."); }
        return (runId, null);
    }

    private void EnsureIdle() { if (_active is not null || _mutating || State.ActiveRun is not null) { throw new InvalidOperationException("This agent already has an active operation."); } }
    private static string UserText(AiMessage message) => string.Concat(message.Content.OfType<AiText>().Select(text => text.Text));
    private static AgentRun[] Keep(AgentRun[] runs, AgentRun run) => [.. runs.Where(item => item.RunId != run.RunId).TakeLast(KeptRuns - 1), run];
    private static AgentToolCall[] Settle(AgentToolCall[] calls, string callId, Func<AgentToolCall, AgentToolCall> update)
        => [.. calls.Select(call => call.CallId == callId ? update(call) : call)];
    private ILogger Logger => services.GetRequiredService<ILogger<AgentNeuron>>();

    private async Task Persist(AgentStorage next)
    {
        var previous = store.State;
        store.State = next;
        try { await store.WriteStateAsync(); }
        catch { store.State = previous; throw; }
    }

    private async Task Notify(Signal signal)
    {
        try { await PublishAsync(signal); }
        catch (Exception error) { Logger.LogWarning(error, "Agent signal delivery failed; consumers can reconcile through Read and Transcript."); }
    }

    // A tool result may carry a UI card on its "_ui" channel; the card is its own progress item.
    private static string? Card(string result)
    {
        try
        {
            using var payload = JsonDocument.Parse(result);
            return payload.RootElement.ValueKind == JsonValueKind.Object && payload.RootElement.TryGetProperty("_ui", out var card)
                && card.ValueKind == JsonValueKind.Object ? card.GetRawText() : null;
        }
        catch (JsonException) { return null; }
    }

    // Overflow folds the oldest messages into a bounded summary instead of failing the run.
    private static (AiMessage[] Messages, string? Summary) Bound(AiMessage[] messages, int maxMessages, string? summary)
    {
        if (messages.Length <= maxMessages) { return (messages, summary); }
        var drop = messages.Length - maxMessages;
        var added = string.Join(" ", messages.Take(drop).Select(m => string.Concat(m.Content.OfType<AiText>().Select(t => t.Text)))
            .Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Length <= 120 ? t : t[..120]));
        var combined = added.Length == 0 ? summary : string.IsNullOrEmpty(summary) ? added : summary + " " + added;
        return (messages[drop..], combined is { Length: > 4000 } ? combined[^4000..] : combined);
    }
}

// The framework resolves activation handlers from DI; AIModule registers this one.
internal sealed class AgentResume : IActivationHandler<AgentNeuron>
{
    public Task Activated(AgentNeuron neuron, CancellationToken cancellationToken) => neuron.Resume();
}
```

Register in `AIModule.Configure`: `builder.Services.TryAddEnumerable(ServiceDescriptor.Singleton<IActivationHandler<AgentNeuron>, AgentResume>());` (replacing the `AgentActivation` line).

One thing to check while writing it:
- `State.Transcript` holds polymorphic `AiContent`. The old code wrapped storage in a JSON envelope. The reactivation fact in Step 2 proves whether the JSON grain storage round-trips `AiContent` through its `[JsonPolymorphic]` attributes. If it does not, keep `AgentStorage` as the typed record and store it as `AgentStorageEnvelope { string Json }` exactly as the old `Save` did, with `Resume` deserializing it.

- [ ] **Step 6: Reduce `AgentExecutionNeuron` to a façade and fix registrations**

`Contracts/Agents/IAgentExecution.cs` keeps only what Task 4 still needs for one commit:

```csharp
[Alias("ai.agent-execution"), Orleans.Metadata.DefaultGrainType("ai.agent-execution")]
public interface IAgentExecution : INeuron
{
    Task<ModelChoices> Models(string? defaultModel = null);
    Task<ModelSelection?> SelectModel(string? id, string? defaultModel = null);
}
```

`AgentExecutionNeuron` implements both by delegating to `ModelCatalog`; delete `Run`, `Start`, `Drive`, `Card`, `ModelFor`. Delete `AgentTurnRunner.cs`, `IAgentTurnRunner.cs`, `IAgentTurnDriver.cs`, `AgentActivation.cs`. In `AIModule.Configure` delete the `IAgentTurnRunner` and `AgentActivation` registrations and add the `AgentResume` one.

`AssistantTurnExecution` and `AssistantNeuron` still compile against `IAgentExecution.Models/SelectModel`; their `Run` path breaks because `IAgentExecution.Run`, `ReadConversation`, `BeginConversation`, `CompleteConversation` are gone. To keep the Assistant project green at this commit, switch `AssistantTurnExecution` to the new `IAgent` now (it is the same edit Task 4 describes; do it here, Task 4 then only has tests, scripts, E2E and Dart left). The edit:
- `Run(...)`: `var snapshot = await agent.Read(ct)` ; `PrepareTurn(snapshot, input, select)` finds `snapshot.Runs.SingleOrDefault(run => run.RunId == input.RunId && run.Status == AgentRunStatus.Completed)` as the replay.
- `Execute(...)`: drop `BeginConversation`, `CompleteConversation`, `InterruptConversation`, `KeepFailedTurn`, `ownsRun`. Replay emits `replay.Reply`. Otherwise call `RunModel(..., turn => agent.Run(turn, ct), ...)` where `RunModel` now takes `Func<AgentTurn, IAsyncEnumerable<AgentTurnEvent>> runner` and builds `new AgentTurn(new AiMessage("user", [new AiText(message)]), run, model, definition.Instructions, definition.Tools, Intent: usageId)`. The agent commits its own transcript and marks failures itself.
- `define(state.Summary)` keeps working: `AgentState.Summary`.
- The `IntentContext.Begin(usageId, workspace)` in the Assistant stays; the agent's `IntentContext.Create(turn.Intent, scope)` enters the same intent id.
- `AssistantNeuron.ReadConversation(threadId)` returns `Task<AgentState>` via `agent.Read()`; `IAssistant.ReadConversation` signature follows.
- Assistant's `DefineTurn`: `ContextProviders` no longer exists on the definition; `AssistantDefinition.For(...)` sets `Contexts = [workspace + "/applications/assistant/context"]` and `AssistantNeuron.Run` writes the capabilities context into that neuron before running: find the current `IAgentContextProvider` implementation in the Assistant module with LSP (`goToImplementation` on the deleted interface before deleting it, or `findReferences` on `ContextProviders` in `AssistantDefinition.cs`), and move its `Provide` body into a `await GrainFactory.GetGrain<IAgentContext>(Workspace + "/applications/assistant/context").Set(new("capabilities", text, tools))` call at the top of `AssistantNeuron.Run`. If no implementation exists in the Assistant module (the grep in planning found only the AI tests implementing it), set nothing and leave `Contexts` empty.

- [ ] **Step 7: Build and run the AI suite, then the Assistant build**

```bash
dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj
```
```bash
dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
```
```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Assistant/DigitalBrain.Modules.Assistant/DigitalBrain.Modules.Assistant.csproj
```
Expected: AI suite green (every rewritten fact, including the four Review Focus facts). Assistant module builds; its tests are Task 4.

- [ ] **Step 8: Commit**

```bash
git add -A src/DigitalBrain.Modules/AI src/DigitalBrain.Modules/DigitalBrain/Assistant
git commit -m "AI: one agent neuron — the transcript, the turn loop, Run and Start, and the turn signals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Switch the Assistant tests, first-party scripts, E2E facts and Dart fixtures; delete the façade

**Files:**
- Modify: Assistant tests `AssistantStreamFacts.cs`, `AgentTurnFacts.cs`, `AgentModelsFacts.cs`, `ToolReceiptFacts.cs` (if it builds `AgentTurnRequest`)
- Modify: `AssistantTurnExecution.cs`, `AssistantNeuron.cs` (`Models` through `IModelCatalog`), `AssistantContracts.cs`
- Delete: Contracts `Agents/IAgentExecution.cs`, module `Agents/AgentExecutionNeuron.cs`
- Modify: `src/DigitalBrain.OS/Apps/Assistant/synapses/chat.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AgentWorkflowFacts.cs`, `GoldenJourneyFacts.cs`
- Modify: Flutter `shell/test/first_run_test.dart`, `shell/test/workspace_data_window_test.dart`

**Interfaces:**
- Consumes `IAgent.Run/Start/Read/Transcript`, `IModelCatalog.List/Select`, `TurnProgressed/TurnCompleted/TurnFailed`.

- [ ] **Step 1: Rewrite the Assistant stream scenario as a chat client**

`AssistantStreamFacts.StartBrain` registered `IAgentTurnRunner` → `StreamScenarioRunner`. The runner is gone; the seam is the host `IChatClient`. Replace `StreamScenarioRunner` with `StreamScenarioClient : IChatClient` keyed by the last user message's text with the same cases (`ui-wait`, `hold`, `wait`, `fail`, `refuse:`, `long-answer`, `window-handles`, `tools`, `card-actions`, default `Hello world`). Tool cases return a `FunctionCallContent` on the first call and the result text on the second, with the tool registered through an `IAgentToolFactory` that returns the scripted JSON result; `fail`/`refuse:` throw `InvalidOperationException(message)`; `long-answer` streams two updates. Register with `silo.Services.AddSingleton<StreamScenarioClient>(); silo.Services.AddSingleton<IChatClient>(s => s.GetRequiredService<StreamScenarioClient>());` and keep `Count(message)`.

Assertions: `(await app.ReadConversation("one", ct)).Turns` becomes `.Runs`; `.AssistantText` becomes `.Reply`; `.ActiveRunId` becomes `.ActiveRun`; `Assert.Single(state.Turns).UserText` becomes `Assert.Single(state.Runs).UserText`. The replay fact's `Count("replay")` stays equal before and after.

- [ ] **Step 2: Fix `AgentTurnFacts` and `AgentModelsFacts`**

`AgentTurnFacts`: `RecordingRunner`/`ToolEventRunner` implement `Func<AgentTurn, IAsyncEnumerable<AgentTurnEvent>>` directly (a method group), `runner.Request` becomes the recorded `AgentTurn`; `Assert.Equal(definition.Tools, runner.Request.ToolNames)` becomes `.Tools`; `new AgentConversationState(3, null, [new("old-run", "earlier", "answer", [])], "the user asked about invoices")` becomes `new AgentState(3, new(), "the user asked about invoices", null, [new("old-run", AgentRunStatus.Completed, "earlier", DateTimeOffset.UtcNow, Reply: "answer")])`; `EmptyState` becomes `new AgentState(0, new(), null, null, [])`.

`AgentModelsFacts.CompletedTurnReplaysWithoutTheRemovedProviderOrProfile`: the snapshot is `new AgentState(2, new(), null, null, [new("run", AgentRunStatus.Completed, "hello", DateTimeOffset.UtcNow, Reply: "persisted answer")])`; `prepared.Replay` is the `AgentRun`.

- [ ] **Step 3: Delete the façade and route the Assistant's model listing through `IModelCatalog`**

`AssistantTurnExecution`: `Execution` property goes; `Models()` is `grains.GetGrain<IModelCatalog>("default").List(Options.Model)`; `SelectModel(id)` is `grains.GetGrain<IModelCatalog>("default").Select(id, Options.Model)`. Delete `Contracts/Agents/IAgentExecution.cs` and `Agents/AgentExecutionNeuron.cs`. LSP `findReferences` on `IAgentExecution` must be empty before the delete (expected remaining: the chat synapse, handled in Step 5).

- [ ] **Step 4: Run the Assistant and Apps suites**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
```
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
Expected: green.

- [ ] **Step 5: Rewrite the Assistant chat synapse**

`src/DigitalBrain.OS/Apps/Assistant/synapses/chat.cs`. The agent is now the publisher, so the signal loops follow the current conversation and resubscribe when it changes:

```csharp
var conversationChanged = new CancellationTokenSource();
string[] Tools = [...unchanged...];

await Task.WhenAll(Operations(), SendClicks(), NewClicks(), FollowConversation());
return;

async Task<string> Send(string message)
{
    var snapshot = await app.Read();
    var runId = await (await Conversation()).Start(AgentTurn.Text(message,
        model: snapshot.Settings.GetValueOrDefault("Model", ""),
        instructions: snapshot.Files.GetValueOrDefault("prompts/system.md", ""),
        tools: Tools));
    await brain.Get<ICard>(Name($"turn-{runId}-user")).Set("You", message);
    await brain.Get<ICard>(Name($"turn-{runId}-answer")).Set("Assistant", "…");
    await RenderAsync();
    return runId;
}

// "new" swaps the conversation; the loops below are restarted for it.
case "new":
    var id = "c-" + Guid.NewGuid().ToString("N")[..12];
    await brain.Get<IText>(Name("conversation")).Set(id);
    var previous = conversationChanged;
    conversationChanged = new CancellationTokenSource();
    previous.Cancel();
    await RenderAsync();
    await app.Respond(new AppResponse(invoked.InvocationId, id, null));
    break;

async Task FollowConversation()
{
    while (!brain.Stopping.IsCancellationRequested)
    {
        var conversation = await Conversation();
        using var scope = CancellationTokenSource.CreateLinkedTokenSource(brain.Stopping, conversationChanged.Token);
        try { await Task.WhenAll(Progress(conversation, scope.Token), Completions(conversation, scope.Token), Failures(conversation, scope.Token)); }
        catch (OperationCanceledException) when (!brain.Stopping.IsCancellationRequested) { }
    }
}

async Task Progress(IAgent conversation, CancellationToken token)
{
    await foreach (var step in brain.On<TurnProgressed>(conversation, token)) { ...body unchanged... }
}
async Task Completions(IAgent conversation, CancellationToken token)
{
    await foreach (var done in brain.On<TurnCompleted>(conversation, token)) { await SettleAsync(done.RunId); }
}
async Task Failures(IAgent conversation, CancellationToken token)
{
    await foreach (var failed in brain.On<TurnFailed>(conversation, token)) { await SettleAsync(failed.RunId); }
}

async Task SettleAsync(string runId)
{
    var run = (await (await Conversation()).Read()).Runs.FirstOrDefault(item => item.RunId == runId);
    if (run is null) { return; }
    var answer = brain.Get<ICard>(Name($"turn-{runId}-answer"));
    await answer.Set("Assistant", run.Reply ?? "The turn failed: " + run.Error, (await answer.Read()).Children);
    ...
}
```

`RenderAsync` and `TranscriptJson` read `state.Runs` (`run.RunId`, `run.UserText`, `run.Reply`) and `state.ActiveRun?.RunId`; a run's `status` is `"running"` when `Reply is null && Error is null`, `"failed"` when `Error is not null`, else `"done"`. Remove `var execution = ...` and the `IAgentExecution` usage. `app.spec.md` scenarios that mention "turn progressed" signals keep their meaning; the Assistant `tests.cs` uses `IScriptedLLM` only and does not change.

- [ ] **Step 6: Update the E2E facts and Dart fixtures**

`AgentWorkflowFacts.cs`: `(await failedAgent.ReadConversation(ct)).Turns` becomes `(await failedAgent.Read()).Runs`; the `while (ActiveRunId is not null) Task.Delay(100)` poll is replaced by awaiting the first `brain.On<TurnFailed>(conversation, ct)` element (the test already waits for the failure; it must not poll). `GoldenJourneyFacts.cs`: `.ReadConversation(token)` becomes `.Read()`, `.Turns` becomes `.Runs`.

Dart: in `shell/test/first_run_test.dart` line 32 and `shell/test/workspace_data_window_test.dart` line 84 the conversation fixture becomes `{'revision': 1, 'activeRun': null, 'runs': <Object>[]}` and `{'revision': 4, 'activeRun': null, 'runs': history}`; the `history` builder's `turn['userText']`/`turn['assistantText']` become `run['userText']`/`run['reply']`. No `lib/` file reads these keys (checked in planning), so `flutter analyze` and `flutter test` from `src/DigitalBrain.Modules/Google/Flutter/app/shell` are the whole Dart check.

- [ ] **Step 7: Verify the first-party apps still publish**

The OS verifies and publishes first-party apps at startup; `DigitalBrain.OS.Tests.Unit` covers composition. Run:

```bash
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
```
```bash
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E
```
Expected: green. If the E2E suite needs credentials it does not have, its live-gated scenarios must still compile.

- [ ] **Step 8: Commit**

```bash
git add -A src/DigitalBrain.Modules src/DigitalBrain.OS
git commit -m "Assistant, scripts and shell follow the agent: Run streams, Start signals, Read has the runs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Folders become namespaces; the module registers and nothing else

**Files:**
- Move (Contracts): `ILLM.cs`, `AiModel.cs`, `AiProvider.cs`, `IAiMarker.cs`, `LLM/*.cs`, `Anthropic/`, `Google/`, `OpenAI/`, `OpenRouter/`, `XAI/`, `Ollama/`, `FoundryLocal/`, `Scripted/`, `Inference/InferenceSignals.cs`, `ProviderUnavailableException.cs`, `Inference/ProviderInferenceOptions.cs` → `Models/...`; `NativeTools.cs`, `INativeToolContributor.cs`, `ScreenedFunction.cs`, `NativeToolServiceCollectionExtensions.cs`, `Agents/AgentTools.cs` → `Tools/`; `IEmbedding.cs`, `IImageGeneration.cs`, `IImageModel.cs`, `ITranscription.cs` → `Media/` or `Embeddings/` next to their models.
- Move (module): `Inference/{InferenceService,InferenceMapping,LlmNeuron}.cs` → `Models/`; `Providers/<Vendor>/` → `Models/<Vendor>/`; `Providers/Common/` → `Models/`; `Inference/{ScriptedLlmNeuron,ScriptedChatClient}.cs` → `Models/Scripted/`; `WebSearch/`, `Web/`, `Workspace/`, `Agents/McpAgentTools.cs` → `Tools/`.
- Create: `DigitalBrain.Modules.AI/Models/ModelConnectors.cs` (the `Connector(...)` body from `AIModule`).
- Modify: `AIModule.cs`, every moved file's `namespace`, every `using` LSP reports, scripts' `using` lines, `docs/superpowers/specs/2026-10-07-ai-module-restructure-design.md`.

- [ ] **Step 1: Move files and set namespaces**

Namespaces: `DigitalBrain.AI.Models`, `DigitalBrain.AI.Models.<Vendor>` (`Anthropic`, `Google`, `OpenAI`, `OpenRouter`, `XAI`, `Ollama`, `FoundryLocal`, `Scripted`), `DigitalBrain.AI.Models.Signals`, `DigitalBrain.AI.Tools`, `DigitalBrain.AI.Agents`, `DigitalBrain.AI.Agents.Signals`, `DigitalBrain.AI.Agents.Context`, `DigitalBrain.AI.Agents.Context.Signals`, `DigitalBrain.AI.Inference`. `AiMessage` and friends keep `DigitalBrain.AI.Inference`. Use `git mv` so history follows.

- [ ] **Step 2: Fix every reference with LSP diagnostics, then the scripts**

Work through LSP diagnostics project by project: Contracts, module, tests, Assistant, Apps, Compute (if it references `DigitalBrain.AI.Scripted`), OS. Then the scripts, which LSP does not see: update `using` lines in `src/DigitalBrain.OS/Apps/Assistant/synapses/chat.cs`, `src/DigitalBrain.OS/Apps/Assistant/tests.cs`, `src/IntoChat/Apps/CustomerResearcher/synapses/research.cs`, `src/IntoChat/Apps/CustomerResearcher/tests.cs` (`DigitalBrain.AI.Scripted` → `DigitalBrain.AI.Models.Scripted`; `ILLM`, `InferenceRequest` under their new namespaces). Find any other script with:

```bash
grep -rln "DigitalBrain.AI" src/DigitalBrain.OS/Apps src/IntoChat/Apps --include=*.cs
```

- [ ] **Step 3: Slim `AIModule.Configure`**

Move `Integrations`, `Connectors` and `Connector(...)` into `Models/ModelConnectors.cs` as `internal static class ModelConnectors { public static ConnectorDefinition[] All { get; } ... }`; `AIModule.Connectors => ModelConnectors.All`. Move the four `AddNativeTool` calls and the workspace option read into `Tools/NativeToolRegistrations.cs` as `internal static void Add(IServiceCollection services, AIOptions options, AIWorkspaceOptions workspace)`. `RegisterMcpBridge` moves to `Tools/McpAgentTools.cs`. `Configure` is then: options runtime, credentials, `AIClients.Add`, `ModelCatalog`, `InferenceService`, `AgentResume`, `AiModelCapabilities`, media, image generation, voice, web search, `NativeToolRegistrations.Add`, `McpAgentTools.Register(...)`. Target: under 40 lines.

- [ ] **Step 4: Build every touched project and run every suite**

```bash
dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/DigitalBrain.Modules.AI.Contracts.csproj
```
```bash
dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj
```
```bash
dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting/DigitalBrain.Modules.AI.Aspire.Hosting.csproj
```
```bash
dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests
```
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Assistant/tests/DigitalBrain.Modules.Assistant.Tests
```
```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
```bash
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
```bash
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
```
Expected: all green. The architecture tests enforce ring boundaries; a Contracts file that gained a `DigitalBrain.Framework` using during the move will fail there.

- [ ] **Step 5: Correct the spec and commit**

In the spec: `ContextEntry(Name, Text, Tools)` and `Set(ContextEntry)`; no `ScriptedProviderFactory` (catalog arm); `AiProvider.Scripted` and `AiProvider.Host`; `IModelCatalog` neuron and `ModelChoices`; `IAgent.Transcript()`; `ModelAddress` kept under `Models/`; `IAgentDriver`. Then:

```bash
git add -A src docs/superpowers/specs/2026-10-07-ai-module-restructure-design.md
git commit -m "AI: folders are namespaces — Models, Tools, Agents/Context; AIModule only registers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Seen running

**Files:** none changed unless verification finds a defect.

- [ ] **Step 1: Start the host**

From `src/DigitalBrain.AppHost`: `aspire run`. Then `mcp__aspire__list_resources`: every resource Running/Healthy. If one is not, `list_console_logs` for it first.

- [ ] **Step 2: Drive the agent and the context through `digitalbrain-mcp`**

Through `localhost:5081/brains/{brainId}/mcp`:
1. `neurons_context` confirms the caller and brain.
2. `neurons_search` for `agent-context`, `agent`, `ai.models`: all three contracts are listed with the new operations.
3. `neurons_call` `IAgentContext.Set` on `{brain}/agents/verify/context` with `{"name":"capabilities","text":"Available: nothing yet","tools":[]}`; `neurons_get` shows revision 1 and the entry.
4. `neurons_call` `IAgent.Configure` on `{brain}/agents/verify` with `Contexts` naming that context and `Model` set to `scripted/verify-model` after scripting `IScriptedLLM` `verify-model` with one reply; then `IAgent.Start` with a text turn. `neurons_get` on the agent shows the run `Completed` with the reply, and `Transcript` shows two messages.
5. `IModelCatalog.List` on `default` returns the deployment's choices without endpoints.

- [ ] **Step 3: Confirm in telemetry**

`list_traces`: a trace for the `Start` call containing the `agent` grain span, the `IAgentContext.Read` call and the `IScriptedLLM.Generate` call. `list_structured_logs`: no warnings from `AgentNeuron` or `AgentTurnLoop` for that run. `list_trace_structured_logs` on that trace shows the `TurnStarted`, `TurnProgressed`, `TurnCompleted` publications (the signal hub logs each publish at debug level if it does; if it does not, the `neurons_get` run state is the evidence and say so in the report).

- [ ] **Step 4: Regression net**

Run the AI, Assistant, Apps, Architecture, OS unit and OS E2E suites once more, and `flutter analyze` plus `flutter test` from `src/DigitalBrain.Modules/Google/Flutter/app/shell`. Report any failure with its output; do not raise timeouts or add polling.

- [ ] **Step 5: Commit any fix, then finish**

If Step 2 or 3 surfaced a defect, fix it under the task that owns the code, re-run that task's facts and commit with a message naming the defect. Then invoke `superpowers:finishing-a-development-branch`.
