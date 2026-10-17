# Fake Model Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the runtime-selectable scripted model (`AiProvider.Scripted`, `scripted/<key>`, `IScriptedLLM`) and the E2E `ScriptedModelServer` with one test-owned OpenAI-compatible `FakeModelServer`, so every test runs the real provider path.

**Architecture:** `FakeModelServer` (new project `src/Testing/DigitalBrain.Testing.Model`, ASP.NET Core only) answers `/v1/chat/completions` per request `model` id: scripted replies (text or tool call) when queued, echo otherwise, JSON or SSE with a usage chunk. Module tests point the OpenAI integration at it via `ModuleTestBuilder.WithFakeModel(server)`; E2E fixtures point `WithModelEndpoint(AiProvider.OpenAI, …)` at it in echo mode. Tests are migrated first, then the scripted provider is deleted from production.

**Tech Stack:** .NET 11 RC, Orleans, Microsoft.Extensions.AI, OpenAI .NET SDK (via `OpenAIProviderFactory`), ASP.NET Core minimal APIs, xUnit v3 (Microsoft Testing Platform), Aspire testing.

**Spec:** `docs/superpowers/specs/2026-10-08-fake-model-server-design.md`

## Global Constraints

- LSP for all code work: `findReferences` on every symbol before changing or deleting it; LSP diagnostics clean before each build. Never grep for code.
- Build and test per project, never the `.slnx`: `dotnet build src/<path>/<Project>.csproj`, `dotnet test --project src/<path>`.
- Warnings are errors; nullable on; package versions central (`Directory.Packages.props`) — no `Version=` on `PackageReference`.
- No boilerplate `/// <summary>`; comments only for what code can't say.
- Tests are facts with sentence-shaped names and `TestContext.Current.CancellationToken`.
- Kill any test run over 5 minutes and debug the hang; never raise a timeout or add polling.
- Commit explicit files only (`git add <file> …`), never a directory; parallel sessions share the tree.
- No state compatibility: delete grain state types freely, no shims.
- `FakeModelServer` depends on ASP.NET Core only — never on the AI module, never on xUnit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Streaming tool calls through the real OpenAI SDK** — the agent loop streams; a tool call must arrive as `delta.tool_calls` and be reassembled into a `FunctionCallContent`. Pinned by `FakeModelFacts.AStreamedToolCallReachesTheAgentAsAFunctionCall` (Task 2) and by the migrated tool-turn fact (Task 3).
2. **Usage reaches metering** — the reason we keep the real adapter. Pinned by `FakeModelFacts.AStreamedReplyReportsUsageToTheCaller` (Task 2).
3. **An exhausted script fails the caller, not the test host** — the 500 must surface as a failed turn / failed group chat, never a hang. Pinned by `AModelThatRunsOutOfRepliesFailsTheTurn` (Task 3) and `AFailingParticipantLeavesTheChatFailedWithTheTurnsSoFar` (Task 3).
4. **Two models in one test stay separate** — scripts and request logs are keyed by model id; Luna's script must never answer Sol. Pinned by `FakeModelFacts.ScriptsAreKeptPerModel` (Task 2).
5. **Concurrent requests** — group chat and the Creator call the fake from grain threads concurrently; queues must be thread-safe. `ConcurrentDictionary<string, ConcurrentQueue<…>>` in Task 1; exercised by Task 3/4 suites.

---

### Task 1: `FakeModelServer` project

**Files:**
- Create: `src/Testing/DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj`
- Create: `src/Testing/DigitalBrain.Testing.Model/FakeModelServer.cs`
- Create: `src/Testing/DigitalBrain.Testing.Model/FakeReply.cs`
- Modify: `DigitalBrain.slnx` (add the project under `/Testing/`, alphabetically after `DigitalBrain.Testing.E2E`)

**Interfaces:**
- Produces:
  - `namespace DigitalBrain.Testing.Model`
  - `public sealed class FakeModelServer : IAsyncDisposable`
    - `static Task<FakeModelServer> StartAsync(CancellationToken ct)`
    - `Uri Endpoint` — `http://127.0.0.1:<port>/v1/`
    - `void Script(string modelId, params FakeReply[] replies)` — appends to that model's queue
    - `IReadOnlyList<JsonElement> Requests(string modelId)` — request bodies in arrival order
    - `ValueTask DisposeAsync()`
  - `public abstract record FakeReply` with `static FakeReply Text(string content)`, `static FakeReply Tool(string name, string argumentsJson)`; implicit conversion from `string` to `Text`.
  - Semantics: a model with **no queue ever scripted** echoes `"You said: " + lastUserText`. A model that **was scripted and is now empty** answers HTTP 500 `"Fake model '<id>' ran out of replies after <n>."`.

- [ ] **Step 1: Create the project file**

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>true</IsPackable>
    <Description>An OpenAI-compatible model endpoint for tests: scripted replies per model, echo otherwise.</Description>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
</Project>
```

- [ ] **Step 2: Write `FakeReply.cs`**

```csharp
namespace DigitalBrain.Testing.Model;

public abstract record FakeReply
{
    public static FakeReply Text(string content) => new TextReply(content);
    public static FakeReply Tool(string name, string argumentsJson) => new ToolReply(name, argumentsJson);
    public static implicit operator FakeReply(string content) => Text(content);

    internal sealed record TextReply(string Content) : FakeReply;
    internal sealed record ToolReply(string Name, string ArgumentsJson) : FakeReply;
}
```

- [ ] **Step 3: Write `FakeModelServer.cs`**

```csharp
using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace DigitalBrain.Testing.Model;

// The model behind the real OpenAI adapter in tests. Replies are scripted per request model id;
// a model nobody scripted echoes, so hosts that only need "a model answered" script nothing.
public sealed class FakeModelServer : IAsyncDisposable
{
    private readonly WebApplication _app;
    private readonly ConcurrentDictionary<string, ConcurrentQueue<FakeReply>> _scripts = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, ConcurrentQueue<JsonElement>> _requests = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, int> _answered = new(StringComparer.Ordinal);

    private FakeModelServer(WebApplication app) { _app = app; }

    public Uri Endpoint => new(new Uri(_app.Urls.Single()), "/v1/");

    public static async Task<FakeModelServer> StartAsync(CancellationToken ct)
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        var app = builder.Build();
        var server = new FakeModelServer(app);
        app.MapPost("/v1/chat/completions", server.Respond);
        await app.StartAsync(ct);
        return server;
    }

    public void Script(string modelId, params FakeReply[] replies)
    {
        var queue = _scripts.GetOrAdd(modelId, _ => new());
        foreach (var reply in replies) { queue.Enqueue(reply); }
    }

    public IReadOnlyList<JsonElement> Requests(string modelId)
        => _requests.TryGetValue(modelId, out var requests) ? [.. requests] : [];

    private async Task<IResult> Respond(HttpContext http)
    {
        using var document = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: http.RequestAborted);
        var request = document.RootElement.Clone();
        var model = request.GetProperty("model").GetString() ?? "";
        _requests.GetOrAdd(model, _ => new()).Enqueue(request);

        FakeReply reply;
        if (!_scripts.TryGetValue(model, out var script)) { reply = FakeReply.Text("You said: " + LastUserText(request)); }
        else if (!script.TryDequeue(out reply!))
        { return Results.Problem($"Fake model '{model}' ran out of replies after {_answered.GetValueOrDefault(model)}.", statusCode: 500); }
        _answered.AddOrUpdate(model, 1, (_, count) => count + 1);

        var streaming = request.TryGetProperty("stream", out var stream) && stream.ValueKind == JsonValueKind.True;
        return streaming ? Stream(model, reply) : Complete(model, reply);
    }

    private static string LastUserText(JsonElement request)
    {
        var user = request.GetProperty("messages").EnumerateArray().LastOrDefault(m => m.GetProperty("role").GetString() == "user");
        if (user.ValueKind != JsonValueKind.Object) { return ""; }
        var content = user.GetProperty("content");
        return content.ValueKind == JsonValueKind.String ? content.GetString() ?? ""
            : string.Concat(content.EnumerateArray().Where(part => part.TryGetProperty("text", out _)).Select(part => part.GetProperty("text").GetString()));
    }

    private static readonly object Usage = new { prompt_tokens = 1, completion_tokens = 1, total_tokens = 2 };

    private static IResult Complete(string model, FakeReply reply)
    {
        var (message, finish) = reply switch
        {
            FakeReply.ToolReply tool => ((object)new { role = "assistant", content = (string?)null, tool_calls = new[] { ToolCall(tool) } }, "tool_calls"),
            FakeReply.TextReply text => (new { role = "assistant", content = text.Content }, "stop"),
            _ => throw new InvalidOperationException(reply.GetType().Name),
        };
        return Results.Json(new { id = "fake", @object = "chat.completion", created = 1, model, choices = new[] { new { index = 0, message, finish_reason = finish } }, usage = Usage });
    }

    // Delta, finish, then the usage chunk the SDK reads token counts from.
    private static IResult Stream(string model, FakeReply reply)
    {
        object Chunk(object[] choices, object? usage) => new { id = "fake", @object = "chat.completion.chunk", created = 1, model, choices, usage };
        var (delta, finish) = reply switch
        {
            FakeReply.ToolReply tool => ((object)new { role = "assistant", tool_calls = new[] { new { index = 0, id = "call_fake", type = "function", function = new { name = tool.Name, arguments = tool.ArgumentsJson } } } }, "tool_calls"),
            FakeReply.TextReply text => (new { role = "assistant", content = text.Content }, "stop"),
            _ => throw new InvalidOperationException(reply.GetType().Name),
        };
        var events = new[]
        {
            Chunk([new { index = 0, delta, finish_reason = (string?)null }], null),
            Chunk([new { index = 0, delta = new { }, finish_reason = (string?)finish }], null),
            Chunk([], Usage),
        };
        var body = string.Concat(events.Select(chunk => "data: " + JsonSerializer.Serialize(chunk) + "\n\n")) + "data: [DONE]\n\n";
        return Results.Text(body, "text/event-stream");
    }

    private static object ToolCall(FakeReply.ToolReply tool)
        => new { id = "call_fake", type = "function", function = new { name = tool.Name, arguments = tool.ArgumentsJson } };

    public ValueTask DisposeAsync() => _app.DisposeAsync();
}
```

- [ ] **Step 4: Add to the solution**

In `DigitalBrain.slnx`, inside `<Folder Name="/Testing/">`, after the `DigitalBrain.Testing.E2E` line:

```xml
    <Project Path="src/Testing/DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj" />
```

- [ ] **Step 5: Build**

Run: `dotnet build src/Testing/DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj`
Expected: Build succeeded, 0 warnings. (Behaviour is tested through the real adapter in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/Testing/DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj src/Testing/DigitalBrain.Testing.Model/FakeModelServer.cs src/Testing/DigitalBrain.Testing.Model/FakeReply.cs DigitalBrain.slnx
git commit -m "Testing: FakeModelServer, an OpenAI-compatible model scripted per model id"
```

---

### Task 2: `WithFakeModel` and facts over the real adapter

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj` (reference `DigitalBrain.Testing.Model`)
- Modify: `src/Testing/DigitalBrain.Testing.Module/ModuleTestBuilder.cs` (add `WithFakeModel`)
- Create: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Models/FakeModelFacts.cs`

**Interfaces:**
- Consumes: `FakeModelServer`, `FakeReply` (Task 1); `IntegrationSchema.Key(string integration, string field)` (`DigitalBrain.Framework.Platform.Integrations`, already visible through the Platform reference).
- Produces: `ModuleTestBuilder WithFakeModel(FakeModelServer model)` — merges `integration openai ApiKey = "fake-model-key"` and `Endpoint = model.Endpoint` into `_options.Execution.PrivateConfiguration` (merge, so a later or earlier `WithExecution` keeps its other keys — implement as: on `WithFakeModel` store the server; in `StartAsync` merge its two keys into `Execution.PrivateConfiguration`).

- [ ] **Step 1: Map** — LSP `findReferences` on `ModuleTestBuilder.WithExecution` and `ModuleOptions.Execution` to confirm nothing else rewrites `PrivateConfiguration` after `StartAsync` composes options.

- [ ] **Step 2: Write the failing facts**

```csharp
using System.Text.Json;
using DigitalBrain.AI;
using DigitalBrain.AI.Inference;
using DigitalBrain.AI.Models;
using DigitalBrain.AI.Models.OpenAI;
using DigitalBrain.Testing.Model;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests.Models;

// The fake sits behind the real OpenAI adapter: catalog, provider factory, streaming, usage.
public sealed class FakeModelFacts
{
    private const string Luna = "gpt-5.6-luna";
    private const string Sol = "gpt-5.6-sol";

    private static async Task<IChatClient> Client(ModuleBrain brain, string marker, CancellationToken ct)
    {
        var catalog = brain.SiloServices.GetRequiredService<ModelCatalog>();
        return await catalog.CreateClient(await catalog.Resolve(new(marker), requiresTools: false, ct), ct);
    }

    [Fact]
    public async Task AnUnscriptedModelEchoesTheLastUserMessage()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model).StartAsync(ct);

        var answer = await brain.Get<IGpt56Luna>("default").Generate(new([new("user", [new AiText("hello")])]), ct);

        Assert.Equal("You said: hello", Assert.IsType<AiText>(Assert.Single(Assert.Single(answer.Messages).Content)).Text);
    }

    [Fact]
    public async Task ScriptsAreKeptPerModel()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Luna, "from luna");
        model.Script(Sol, "from sol");
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model).StartAsync(ct);

        using var sol = await Client(brain, nameof(IGpt56Sol), ct);
        using var luna = await Client(brain, nameof(IGpt56Luna), ct);

        Assert.Equal("from sol", (await sol.GetResponseAsync("hi", cancellationToken: ct)).Text);
        Assert.Equal("from luna", (await luna.GetResponseAsync("hi", cancellationToken: ct)).Text);
        Assert.Single(model.Requests(Luna));
        Assert.Single(model.Requests(Sol));
    }

    [Fact]
    public async Task AStreamedReplyReportsUsageToTheCaller()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Luna, "streamed");
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model).StartAsync(ct);
        using var client = await Client(brain, nameof(IGpt56Luna), ct);

        var updates = await client.GetStreamingResponseAsync("hi", cancellationToken: ct).ToListAsync(ct);
        var response = updates.ToChatResponse();

        Assert.Equal("streamed", response.Text);
        Assert.Equal(2, response.Usage?.TotalTokenCount);
    }

    [Fact]
    public async Task AStreamedToolCallReachesTheAgentAsAFunctionCall()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Luna, FakeReply.Tool("lookup", """{"q":"x"}"""));
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model).StartAsync(ct);
        using var client = await Client(brain, nameof(IGpt56Luna), ct);

        var response = (await client.GetStreamingResponseAsync("hi", cancellationToken: ct).ToListAsync(ct)).ToChatResponse();

        var call = Assert.Single(response.Messages.SelectMany(message => message.Contents).OfType<FunctionCallContent>());
        Assert.Equal("lookup", call.Name);
        Assert.Equal("x", call.Arguments!["q"]!.ToString());
    }
}
```

- [ ] **Step 3: Run to verify they fail**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*FakeModelFacts*"`
Expected: build error — `ModuleTestBuilder` has no `WithFakeModel`.

- [ ] **Step 4: Implement `WithFakeModel`**

`DigitalBrain.Testing.Module.csproj`, in the first `<ItemGroup>`:

```xml
    <ProjectReference Include="../DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj" />
```

`ModuleTestBuilder.cs` — add a field, the method, and the merge in `StartAsync`:

```csharp
    private FakeModelServer? _model;

    // The OpenAI integration points at the fake: every model call runs the real adapter against it.
    public ModuleTestBuilder WithFakeModel(FakeModelServer model)
    {
        EnsureMutable();
        _model = model ?? throw new ArgumentNullException(nameof(model));
        return this;
    }
```

In `StartAsync`, before `ModuleTest.StartAsync(...)`:

```csharp
        var options = _model is null ? _options : _options with
        {
            Execution = _options.Execution with
            {
                PrivateConfiguration = new Dictionary<string, string?>(_options.Execution.PrivateConfiguration)
                {
                    [IntegrationSchema.Key("openai", "ApiKey")] = "fake-model-key",
                    [IntegrationSchema.Key("openai", "Endpoint")] = _model.Endpoint.AbsoluteUri,
                },
            },
        };
```

and pass `options with { Modules = …, ConfigureSilo = … }` instead of `_options with { … }` (keep `_options.ConfigureSilo` inside the lambda as today). Add `using DigitalBrain.Framework.Platform.Integrations;` and `using DigitalBrain.Testing.Model;`.

- [ ] **Step 5: Run to verify they pass**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests -- --filter-class "*FakeModelFacts*"`
Expected: 4 passed. If `AStreamedReplyReportsUsageToTheCaller` reports null usage, check the SDK requested `stream_options.include_usage` (`StreamingUsageChatClientExtensions`) — fix the fake's chunk shape, not the assertion.

- [ ] **Step 6: Commit**

```bash
git add src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj src/Testing/DigitalBrain.Testing.Module/ModuleTestBuilder.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Models/FakeModelFacts.cs
git commit -m "Testing: module tests reach FakeModelServer through the real OpenAI adapter"
```

---

### Task 3: Migrate AI module tests off `IScriptedLLM`

**Files:**
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/GroupChat/GroupChatFacts.cs`
- Create: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentModelTurnFacts.cs`
- Delete: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/ScriptedTurnFacts.cs`
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/PersistedCollectionFacts.cs` (delete `ScriptedRepliesAndPromptsSurviveReactivation` and the `Scripted` using)
- Modify: `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Models/ModelCatalogFacts.cs` (delete `AScriptedKeyResolvesWithoutAnyProviderAndCreatesTheScriptedClient` and the `Scripted` using)

**Interfaces:**
- Consumes: `FakeModelServer.StartAsync/Script/Requests`, `FakeReply.Tool`, `ModuleTestBuilder.WithFakeModel` (Tasks 1–2); `Probe.Contract`, `AgentFacts.StampUser/Collect/Key`, `ContractCatalog`, `ILoopProbe` (existing, `Agents/LoopProbe.cs`, `Agents/AgentFacts.cs`).

- [ ] **Step 1: Map** — LSP `findReferences` on `IScriptedLLM` (contracts file line 8) and confirm the AI-test hits are exactly the four files above.

- [ ] **Step 2: Rewrite `GroupChatFacts`**

Replace the `LunaAndGemma` setup and every `IScriptedLLM` use. The participants keep their speaker names; their models become real markers:

```csharp
    private const string LunaModel = "gpt-5.6-luna";
    private const string SolModel = "gpt-5.6-sol";

    private static readonly GroupChatSetup LunaAndGemma = new(
        [new("Luna", nameof(IGpt56Luna)), new("Gemma", nameof(IGpt56Sol))],
        Brief: "Brainstorm product ideas.",
        MaxRounds: 3);
```

Each fact that scripted models starts the fake and the brain like this (shown for the first fact; apply the same to the max-rounds and failing-participant facts with their own replies):

```csharp
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(LunaModel, "Idea: a smart dog bowl.", "AGREE: the smart bowl, with a feeding log.", "Final: a smart dog bowl that logs feeding.");
        model.Script(SolModel, "Building on the bowl: add a feeding log.", "AGREE: bowl plus log.");
        await using var brain = await ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model).StartAsync(ct);
```

Prompt assertion (was `IScriptedLLM.Prompts()[0]`):

```csharp
        Assert.Contains("Luna: Idea: a smart dog bowl.", model.Requests(SolModel)[0].GetRawText(), StringComparison.Ordinal);
```

Max rounds: `model.Script(LunaModel, "A", "B", "C", "Final: A.")`, `model.Script(SolModel, "not A", "not B", "not C")`.

Failing participant: `model.Script(LunaModel, "A")`, `model.Script(SolModel)` (scripted, empty → 500). Change the throw assertion to the provider failure the product surfaces — first run it and read the actual type; assert that exact type (expected `System.ClientModel.ClientResultException`, possibly wrapped by the grain call). Keep the `Failed` status and single-turn assertions unchanged.

Replace `using DigitalBrain.AI.Models.Scripted;` with `using DigitalBrain.AI.Models.OpenAI;` and `using DigitalBrain.Testing.Model;`. `UnknownModelsAreRejectedAtConfiguration` and `AskingBeforeConfiguringIsRejected` are unchanged.

- [ ] **Step 3: Create `AgentModelTurnFacts.cs`, delete `ScriptedTurnFacts.cs`**

```csharp
using DigitalBrain.AI;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models.OpenAI;
using DigitalBrain.Testing.Model;
using Microsoft.Extensions.DependencyInjection;

namespace DigitalBrain.Modules.AI.Tests.Agents;

// Whole agent turns against a provider model: the tool loop, failures and inference options all
// travel the real OpenAI adapter to the fake.
public sealed class AgentModelTurnFacts
{
    private const string Luna = "gpt-5.6-luna";

    private static Task<ModuleBrain> Brain(FakeModelServer model, CancellationToken ct)
    {
        AgentFacts.StampUser();
        return ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model)
            .ConfigureSilo(silo => silo.Services.AddSingleton(new ContractCatalog([typeof(INeuron).Assembly, typeof(ILoopProbe).Assembly])))
            .StartAsync(ct);
    }

    [Fact]
    public async Task AModelPlaysAToolCallThenAnswers()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Luna,
            FakeReply.Tool("neurons_call", $$"""{"contract":"{{Probe.Contract}}","key":"research/probes/main","method":"Echo","arguments":"[\"ping\"]"}"""),
            "Done.");
        await using var brain = await Brain(model, ct);

        var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("tool-turn")),
            AgentTurn.Text("go", model: nameof(IGpt56Luna), contracts: [Probe.Contract]), ct);

        Assert.Equal("neurons_call", Assert.Single(events.OfType<AgentTurnEvent.ToolStarted>()).Name);
        Assert.Contains("echo:ping", Assert.Single(events.OfType<AgentTurnEvent.ToolCompleted>()).Result, StringComparison.Ordinal);
        Assert.Equal("Done.", Assert.Single(events.OfType<AgentTurnEvent.Text>()).Content);
        Assert.Single(events.OfType<AgentTurnEvent.Finished>());
        Assert.Equal(2, model.Requests(Luna).Count);
        Assert.Contains("echo:ping", model.Requests(Luna)[1].GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task AModelThatRunsOutOfRepliesFailsTheTurn()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Luna);
        await using var brain = await Brain(model, ct);

        var events = await AgentFacts.Collect(brain.Get<IAgent>(AgentFacts.Key("empty")),
            AgentTurn.Text("go", model: nameof(IGpt56Luna)), ct);

        Assert.Contains("ran out of replies", Assert.Single(events.OfType<AgentTurnEvent.Failed>()).Message, StringComparison.Ordinal);
    }
}
```

The old `AScriptedTurnRunsWhateverInferenceOptionsTheDefinitionCarries` is deleted, not ported: it pinned that the *scripted* provider ignores sampling options, and that provider no longer exists. Real-provider option validation is already covered by `InferenceMapping.ValidateRequest` facts.

If `AModelThatRunsOutOfRepliesFailsTheTurn` shows a `Failed` message that does not include the provider's error text, assert on what the product actually reports for a provider 500 (read it from the run) — do not change the product to leak more.

- [ ] **Step 4: Trim `PersistedCollectionFacts` and `ModelCatalogFacts`** — delete the two scripted facts and their `using DigitalBrain.AI.Models.Scripted;` lines.

- [ ] **Step 5: LSP diagnostics clean, then run the suite**

Run: `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`
Expected: all pass (the scripted provider still exists in production, unused by these tests).

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/GroupChat/GroupChatFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/AgentModelTurnFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Agents/ScriptedTurnFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/PersistedCollectionFacts.cs src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests/Models/ModelCatalogFacts.cs
git commit -m "AI tests: drive provider models through FakeModelServer instead of IScriptedLLM"
```

---

### Task 4: Migrate Apps tests off `IScriptedLLM`

**Files:**
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppCreatorFacts.cs`
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRouteFacts.cs`

**Interfaces:**
- Consumes: `FakeModelServer`, `FakeReply.Tool`, `WithFakeModel` (Tasks 1–2). Author model = `nameof(IGpt56Luna)` → id `gpt-5.6-luna`; Builder model = `nameof(IGpt56Sol)` → id `gpt-5.6-sol`.

- [ ] **Step 1: Map** — LSP `findReferences` on `AppsOptions.AuthorModel` / `BuilderModel` to confirm they accept marker names (validated through `ModelAddress.IsKnown`).

- [ ] **Step 2: Rewrite `AppCreatorFacts`**

`StartAsync` takes the fake:

```csharp
    private const string Author = "gpt-5.6-luna";
    private const string Builder = "gpt-5.6-sol";

    private static Task<ModuleBrain> StartAsync(FakeModelServer model, CancellationToken ct) => ModuleTest.Create()
        .WithModule<AIModule>()
        .WithModule<AppsModule>()
        .WithFakeModel(model)
        .ConfigureModule<AppsModule, AppsOptions>(apps =>
        {
            apps.AuthorModel = nameof(IGpt56Luna);
            apps.BuilderModel = nameof(IGpt56Sol);
        })
        .ConfigureSilo(silo => silo.Services.AddSingleton<IScriptSandbox>(new CreatorSandbox()))
        .StartAsync(ct);
```

Each fact opens with:

```csharp
        await using var model = await FakeModelServer.StartAsync(ct);
        model.Script(Author, Authored(Spec));
        await using var brain = await StartAsync(model, ct);
```

and every `brain.Get<IScriptedLLM>("author").Script([...])` → `model.Script(Author, ...)`, `"builder"` → `model.Script(Builder, ...)` — scripted **before** `StartAsync` or after, both work since scripts are read per request.

`ABuilderCrashLandsAsFailedNotAsAnUnhandledException`: the builder must fail, so script it empty: `model.Script(Builder);` and update the comment to "An empty builder script: the model answers 500."

`ABuilderThatCallsAToolGetsItsResultAndStillImplements`: the JSON-in-text tool reply becomes

```csharp
        model.Script(Builder,
            FakeReply.Tool("check_csharp", """{"files":{"synapses/shout.cs":"var answer = 1;\nConsole.WriteLine(answer);"}}"""),
            Built("// proof v1", "Shout in capitals."));
```

Usings: drop `DigitalBrain.AI.Models.Scripted`; add `DigitalBrain.AI.Models.OpenAI`, `DigitalBrain.Testing.Model`.

- [ ] **Step 3: Rewrite `AppRouteFacts`** — same pattern: start the fake, `.WithFakeModel(model)`, `AuthorModel = nameof(IGpt56Luna)`, `BuilderModel = nameof(IGpt56Sol)`, `model.Script("gpt-5.6-luna", JsonSerializer.Serialize(new { … }))` and `model.Script("gpt-5.6-sol", …)` with the existing payloads unchanged. Usings as in Step 2.

- [ ] **Step 4: LSP diagnostics clean, then run**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-class "*AppCreatorFacts*"` then `--filter-class "*AppRouteFacts*"`, then the full project.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppCreatorFacts.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppRouteFacts.cs
git commit -m "Apps tests: the Creator's author and builder run against FakeModelServer"
```

---

### Task 5: Delete the scripted provider from production

**Files:**
- Delete: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/Scripted/IScriptedLLM.cs`
- Delete: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/Scripted/ScriptedLlmNeuron.cs`
- Delete: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/Scripted/ScriptedChatClient.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/AiProvider.cs` (remove `Scripted` and its comment)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/ModelAddress.cs`
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/ModelSelection.cs:3` (comment)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/IModelCatalog.cs:12` (comment)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/ModelCatalog.cs` (lines 5, 13, 29–34, 76, 123–126, 177, 227)
- Modify: `src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Agents/AgentTurnLoop.cs:78-82`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/CollectionCompatibilitySamples.json` (remove the four `ScriptedLlmState` entries, lines ~101–125)
- Modify: `src/IntoChat/Apps/CustomerResearcher/app.json:28`, `src/IntoChat/Apps/CustomerResearcher/app.spec.md:18`

**Interfaces:**
- Consumes: nothing new. After this task `ModelAddress.IsKnown(model)` is `LLMModel.FindByMarkerName(model) is not null`, and `ModelAddress.Resolve` only resolves markers.

- [ ] **Step 1: Map** — LSP `findReferences` on `IScriptedLLM`, `IScriptedLLM.ModelPrefix`, `AiProvider.Scripted`, `ScriptedChatClient`, `ScriptedLlmState`. Expected: only the production sites listed above remain (tests were migrated in Tasks 3–4). Any other hit: stop and add it to this task.

- [ ] **Step 2: Delete the three files** listed under Delete.

- [ ] **Step 3: `ModelAddress`**

```csharp
using DigitalBrain.AI.Inference;

namespace DigitalBrain.AI.Models;

// Turns an LLM marker name used in configuration, such as "IGpt56Luna", into its neuron.
public static class ModelAddress
{
    public static bool IsKnown(string model) => LLMModel.FindByMarkerName(model) is not null;

    public static ILLM Resolve(IGrainFactory grains, string model)
    {
        ArgumentNullException.ThrowIfNull(grains);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);
        var marker = LLMModel.FindByMarkerName(model)?.Marker ?? throw new ArgumentException($"Unknown model '{model}'.", nameof(model));
        return (ILLM)grains.GetGrain(marker, "default");
    }

    // Complete(...) unchanged.
}
```

- [ ] **Step 4: `ModelCatalog`**
  - Delete the `if (key is not null && key.StartsWith(IScriptedLLM.ModelPrefix …))` block (lines 29–34).
  - Line 76 message → `$"Unknown model '{key}'. Use a model marker name or a configured profile name."`
  - Delete `case AiProvider.Scripted:` and its comment in `CreateClient` (lines 123–126).
  - `Select` (line 177): remove the `id.StartsWith(IScriptedLLM.ModelPrefix …) ? new ModelSelection(id)` arm.
  - Line 227: `provider is not (AiProvider.FoundryLocal or AiProvider.Host)`.
  - Line 13 comment: drop `or "scripted/<key>"`. Remove `using DigitalBrain.AI.Models.Scripted;`.

- [ ] **Step 5: `AgentTurnLoop`** — delete the `case AiProvider.Scripted:` arm (lines 78–82).

- [ ] **Step 6: Contracts comments** — `ModelSelection.cs:3` → `// Model is a marker name ("IFable5") or a configured profile name; null is the …` (keep the rest of the sentence). `IModelCatalog.cs:12` → `("profile:<name>", "preset:<Marker>")`. `AiProvider.cs` — remove the `Scripted,` member and its comment line.

- [ ] **Step 7: `CollectionCompatibilitySamples.json`** — remove the four objects whose `"Type"` is `DigitalBrain.AI.Models.Scripted.ScriptedLlmState`; keep the JSON array valid.

- [ ] **Step 8: CustomerResearcher** — `app.json` Model description → `"Uses the host default LLM."`; delete line 18 of `app.spec.md` ("Scratch scenario installs may supply scripted/<key> …"). Leave the Browser `scripted/` text (separate follow-up task).

- [ ] **Step 9: LSP diagnostics clean, then build and test**

Run, in order:
- `dotnet build src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/DigitalBrain.Modules.AI.csproj`
- `dotnet test --project src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`
- `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`
- `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/Scripted/IScriptedLLM.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/Scripted/ScriptedLlmNeuron.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/Scripted/ScriptedChatClient.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/AiProvider.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/ModelAddress.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/ModelSelection.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI.Contracts/Models/IModelCatalog.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Models/ModelCatalog.cs src/DigitalBrain.Modules/AI/DigitalBrain.Modules.AI/Agents/AgentTurnLoop.cs src/Testing/DigitalBrain.Architecture.Tests/CollectionCompatibilitySamples.json src/IntoChat/Apps/CustomerResearcher/app.json src/IntoChat/Apps/CustomerResearcher/app.spec.md
git commit -m "AI: remove the scripted provider; models are chosen by composition, never by a test name"
```

---

### Task 6: E2E on `FakeModelServer`; delete `ScriptedModelServer`

**Files:**
- Modify: `src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj` (reference `DigitalBrain.Testing.Model`)
- Delete: `src/Testing/DigitalBrain.Testing.E2E/Agent/ScriptedModelServer.cs`
- Modify: `src/Testing/DigitalBrain.Testing.Reference/ReferenceBrainFixture.cs`
- Modify: `src/Testing/DigitalBrain.Testing.Reference/BrainFact.cs`
- Modify: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs:43`
- Modify: `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/AssemblyInfo.cs:1`, `src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssemblyInfo.cs:1` (comments)

**Interfaces:**
- Consumes: `FakeModelServer.StartAsync`, `.Endpoint` (Task 1).
- Produces: `ReferenceBrainFixture.Model` of type `FakeModelServer` (still used by `ProductionBrainFixture` and `ProductHostFixture` for `Model.Endpoint` — unchanged call sites).

- [ ] **Step 1: Map** — LSP `findReferences` on `ReferenceBrainFixture.Model`, `BrainFact.Model`, `ScriptedModelServer.Reset`, `AssertNoProtocolErrors`. Expected (as found 2026-10-08): `Model` used by the three fixtures for `.Endpoint` and by `BrainFact.InitializeAsync` (`Reset`); `BrainFact.Model` unused; `AssertNoProtocolErrors` only in `BrainRuntimeFacts:43`.

- [ ] **Step 2: Reference the project** — in `DigitalBrain.Testing.E2E.csproj`, next to the `DigitalBrain.Testing` reference:

```xml
    <ProjectReference Include="../DigitalBrain.Testing.Model/DigitalBrain.Testing.Model.csproj" />
```

- [ ] **Step 3: `ReferenceBrainFixture`** — `using DigitalBrain.Testing.Model;` replaces `using DigitalBrain.Testing.E2E.Agent;`; field and property become `FakeModelServer`; `_model = await FakeModelServer.StartAsync(cancellationToken);`. Header comment: "…a web shell, an echoing model endpoint and OTLP collector…".

- [ ] **Step 4: `BrainFact`** — delete `protected ScriptedModelServer Model => Host.Model;`, delete `Host.Model.Reset();`, delete `using DigitalBrain.Testing.E2E.Agent;` and the duplicate `using System.Net.Http.Json;`. Header comment: drop "and the scripted model starts from a clean script".

- [ ] **Step 5: `BrainRuntimeFacts`** — delete line 43 `Model.AssertNoProtocolErrors();`. The `"You said: Remember this conversation"` assertion stays — it is the echo.

- [ ] **Step 6: Delete `ScriptedModelServer.cs`**; fix both `AssemblyInfo.cs` comments to "The reference host shares its model endpoint and shell state; facts run serially."

- [ ] **Step 7: LSP diagnostics clean, then build**

- `dotnet build src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj`
- `dotnet build src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/DigitalBrain.OS.Tests.E2E.csproj`
- `dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/DigitalBrain.Framework.Tests.E2E.csproj`

- [ ] **Step 8: Run E2E** (Docker healthy)

- `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -- --filter-class "*BrainRuntimeFacts*"`
- `dotnet test --project src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E -- --filter-class "*ContentCaptureFacts*"`

Expected: pass. If startup now fails on a request the old server special-cased (capital of France / brainstorm / judge prompts), something still sends them at boot — find the sender with LSP and report; do not re-add prompt matching.

- [ ] **Step 9: Commit**

```bash
git add src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj src/Testing/DigitalBrain.Testing.E2E/Agent/ScriptedModelServer.cs src/Testing/DigitalBrain.Testing.Reference/ReferenceBrainFixture.cs src/Testing/DigitalBrain.Testing.Reference/BrainFact.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/BrainRuntimeFacts.cs src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.E2E/AssemblyInfo.cs src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E/AssemblyInfo.cs
git commit -m "E2E: the reference host's model is FakeModelServer; ScriptedModelServer removed"
```

---

### Task 7: Running-system verification

**Files:** none (verification only).

- [ ] **Step 1:** `aspire run` from `src/DigitalBrain.AppHost`; `mcp__aspire__list_resources` — every resource Running/Healthy. If not, `list_console_logs` for it first. A `wireType`/deserialisation error naming `ai.llm.scripted` means stale grain state: wipe the local Azurite volume (no shims).
- [ ] **Step 2:** Through `digitalbrain-mcp` (`localhost:5081/mcp`): `neurons_context`, then `neurons_search` for `IScriptedLLM` — expected: not found. `neurons_call` `IModelCatalog.Select` with id `scripted/x` — expected: rejected as unavailable.
- [ ] **Step 3:** Telemetry: during the Task 6 E2E run, `list_traces` on the test host shows `chat gpt-5.6-luna` GenAI spans from the OpenAI client, and `list_structured_logs` shows the metering entry with 2 total tokens — usage flowed through the real adapter.
- [ ] **Step 4:** Regression net: rerun the AI, Apps, Architecture and both E2E suites from Tasks 3–6. All green → done.
