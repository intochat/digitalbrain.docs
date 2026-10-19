# Testing

`IntoChat.OS.Testing` is the test harness for IntoChat OS modules. It provides a `TestBrain` builder that runs the product recipe in process, a shared host per test assembly, signal probes, bounded waits, and fakes for the model endpoint, an OAuth token endpoint and telemetry.

## Test tiers

Each module splits its tests by project suffix:

| Suffix | Contents |
| --- | --- |
| `*.Tests.Unit` | No host, no network, no sleeps. |
| `*.Tests.Integration` | One `BrainHostFixture` per assembly. |
| `*.Tests.Hosting` | Aspire application model only (see `IntoChat.OS.Aspire.Testing`). |
| `*.Tests.E2E`, `*.Tests.Browser` | The full product on Aspire, run nightly (see `IntoChat.OS.Testing.Aspire`, `IntoChat.OS.Testing.Playwright`). |

## Quick start

```csharp
await using var brain = await TestBrain.Create()
    .WithModule<MyModule>()
    .StartAsync(ct);
```

`StartAsync` boots a silo with the same recipe the product uses. `WithoutHttp()` skips the HTTP surface when a fact only talks to grains.

## One host per assembly

Starting a host is the expensive part. Start one per test assembly and isolate each fact in a fresh person's brain:

```csharp
[assembly: AssemblyFixture(typeof(MyHost))]

public sealed class MyHost : BrainHostFixture
{
    protected override TestBrain Configure(TestBrain brain) => brain.WithModule<MyModule>().WithoutHttp();
}
```

`PersonAsync(name)` creates a fresh principal, account and brain, and `ObserveAsync<T>(source, owner, ct)` subscribes a `SignalProbe<T>` as the owner. The package targets xunit v3.

## Fakes

- `FakeModelServer`: an OpenAI-compatible endpoint with scripted replies.
- `TokenEndpointStub`: an OAuth token and profile endpoint for integration modules.
- `InMemoryTelemetry`: collects spans and log records through `brain.WithInMemoryTelemetry`.
