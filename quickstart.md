---
title: Quickstart
---

# Quickstart

Status: Built (compiled Quickstart contracts/runtime and L1 durability); this page does not claim a
live Quickstart AppHost L2 health result.

The quickstart keeps public vocabulary, compiled module runtime, hosting, and testing in separate projects. Consumers reference the contracts package; hosts compile the runtime module; Aspire owns the infrastructure topology. This is ordinary compiled C# — not a product Behavior install.

## 1. Define leaf contracts

`DigitalBrain.Quickstart.Contracts` is a leaf package. It exposes the public neuron contract `IGreeter` and the public durable facts `SayHello` and `Greeted`:

```csharp
using DigitalBrain.Abstractions;

namespace DigitalBrain.Quickstart;

public partial interface IGreeter : INeuron;

[GenerateSerializer]
[Alias("quickstart.say-hello")]
public sealed record SayHello(
    [property: Id(0)] string Name) : Synapse;

[GenerateSerializer]
[Alias("quickstart.greeted")]
public sealed record Greeted(
    [property: Id(0)] string Message) : Synapse;
```

Synapses are durable facts, so every synapse type has an explicit, stable string alias. If a neuron contract gains semantic methods, use domain names without an `Async` suffix and add `[Alias(nameof(Method))]`. Infrastructure lifecycle APIs keep their `Async` suffixes.

## 2. Compile the module runtime

The packable `DigitalBrain.Quickstart` runtime declares a partial `QuickstartModule` and keeps its `Greeter` handler internal:

```csharp
using DigitalBrain.Abstractions;

namespace DigitalBrain.Quickstart;

public sealed partial class QuickstartModule : IModule;
```

```csharp
using DigitalBrain.Abstractions;
using DigitalBrain.Kernel;

namespace DigitalBrain.Quickstart;

internal sealed class Greeter :
    Neuron,
    IGreeter,
    IHandle<SayHello>,
    IEmit<Greeted>
{
    public Task HandleAsync(
        SayHello request,
        CancellationToken cancellationToken)
        => EmitAsync(new Greeted($"Hello, {request.Name}."));
}
```

The source generator discovers the internal handler and emits the module capsule. Application projects select that capsule instead of reconstructing its handlers or infrastructure.

## 3. Host it with one Aspire composition call

The Quickstart AppHost is intentionally thin:

```csharp
using DigitalBrain.Aspire.Hosting;
using DigitalBrain.Quickstart;

var builder = DistributedApplication.CreateBuilder(args);

var brain = builder.AddDigitalBrain("quickstart")
    .AddModule<QuickstartModule>();

builder.AddProject<Projects.DigitalBrain_Quickstart_Host>("host")
    .WithReference(brain);

builder.Build().Run();
```

`AddDigitalBrain` owns storage, clustering, reminders, and journal provisioning. `AddModule<T>()` is typed application composition, and `WithReference(brain)` connects the compiled host to those resources.

Run the complete topology from the repository root:

```powershell
aspire start --apphost hosts/DigitalBrain.Quickstart.AppHost
```

The compiled host maps `/health`. That source route is not a live Quickstart AppHost L2 health claim;
the executable evidence shown here is the L1 durability proof below.

## 4. Prove durability

Tests subclass `DigitalBrainFixture`, select the same compiled capsule once, and interact through the production client:

```csharp
public sealed class QuickstartFixture : DigitalBrainFixture
{
    protected override void Configure(DigitalBrainTestBuilder brain)
    {
        ArgumentNullException.ThrowIfNull(brain);
        brain.AddModule<QuickstartModule>();
    }
}
```

The L1 test sends a typed fact, observes the emitted fact, calls `RestartHostAsync`, then uses `ReadAsync<Greeted>` to prove the same journal record survives its hosting silo restart:

```csharp
await using var test = await fixture.CreateBrainAsync(cancellationToken);
var greeter = test.Neuron<IGreeter>("welcome");

await test.Client.SendAsync<IGreeter>("welcome", new SayHello("Ada"));

var first = await greeter.Outgoing.NextAsync<Greeted>(cancellationToken);
Assert.Equal("Hello, Ada.", first.Synapse.Message);

await greeter.RestartHostAsync(cancellationToken);

var committed = await greeter.Outgoing.ReadAsync<Greeted>(
    afterSequence: 0,
    cancellationToken);
Assert.Single(committed);
Assert.Equal(first.SynapseId, committed[0].SynapseId);
```

This is durable restart and journal evidence, not a timing-based assertion.

## 5. Connect a production client

In a consuming application, call `AddDigitalBrainClient(owner)` during host setup and inject `IDigitalBrain`:

```csharp
using DigitalBrain.Aspire;
using DigitalBrain.Client;
using DigitalBrain.Quickstart;

var builder = WebApplication.CreateBuilder(args);
const string owner = "contoso";

builder.AddDigitalBrainClient(owner);

var app = builder.Build();

app.MapPost("/greetings/{name}", async (
    string name,
    IDigitalBrain brain) =>
{
    await brain.SendAsync<IGreeter>(
        "welcome",
        new SayHello(name));
    return Results.Accepted();
});

app.Run();
```

In AppHost, give the production client project only the client projection:

```csharp
builder.AddProject<Projects.Contoso_Api>("api")
    .WithReference(brain.AsClient());
```

`IDigitalBrain` is an owner-scoped local facade over the connected client. It is neither a root neuron nor a status object. Consumers address typed neuron contracts by name and exchange typed synapses; hosting and transport details stay behind the facade.

`AsClient()` supplies Orleans client discovery. The production client project never receives silo storage, journal access, module secrets, or the state-protection secret.
