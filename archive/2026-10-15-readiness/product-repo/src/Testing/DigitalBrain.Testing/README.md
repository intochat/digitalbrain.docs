# DigitalBrain.Testing

One harness for every DigitalBrain test: `TestBrain.Create()`, signal probes, behavior runs and a fake model endpoint.

```csharp
await using var brain = await TestBrain.Create()
    .WithModule<TimeModule>()                                            // composition (in-process target only)
    .WithIntegration(AIModule.Integration, "Endpoint", model.Endpoint)   // typed, any target
    .StartAsync(ct);

var alice = await brain.PersonAsync("alice", ct);                        // registered account + owned brain
using (alice.AsCaller()) { await brain.Get<IApp>(alice.Key("apps/hello")).Read(); }
```

## Targets

- **InProcess** (default): a real web host built from the same `AddDigitalBrainServer`/`MapDigitalBrainServer` recipe the OS uses, with in-memory storage.
- **Aspire**: add `DigitalBrain.Testing.Aspire` to boot your AppHost behind the same `ITestBrain`.
