# DigitalBrain.Testing.Playwright

A browser against a brain on the Aspire target: Playwright sessions on the AppHost's web endpoint, locally or in a browser container.

```csharp
await using var brain = await TestBrain.Create()
    .WithModule<TimeModule>()                                            // composition (in-process target only)
    .WithIntegration(AIModule.Integration, "Endpoint", model.Endpoint)   // typed, any target
    .StartAsync(ct);

var alice = await brain.PersonAsync("alice", ct);                        // registered account + owned brain
using (alice.AsCaller()) { await brain.Get<IApp>(alice.Key("apps/hello")).Read(); }
```

## Targets

Runs on the **Aspire** target only (`DigitalBrain.Testing.Aspire`); the in-process target has no web UI.
