# DigitalBrain.Testing.Aspire

The Aspire target for `TestBrain`: boot your AppHost and drive the brain over HTTP and an Orleans client.

```csharp
await using var brain = await TestBrain.Create()
    .WithModule<TimeModule>()                                            // composition (in-process target only)
    .WithIntegration(AIModule.Integration, "Endpoint", model.Endpoint)   // typed, any target
    .StartAsync(ct);

var alice = await brain.PersonAsync("alice", ct);                        // registered account + owned brain
using (alice.AsCaller()) { await brain.Get<IApp>(alice.Key("apps/hello")).Read(); }
```

## Targets

- **Aspire** (this package): the AppHost owns composition, so `WithModule` throws; `WithOptions` and `WithIntegration` configure the AppHost.
- **InProcess**: `DigitalBrain.Testing`, same `ITestBrain`.

## Telemetry

Opt in with `WithDashboardTelemetry()`. The Aspire session owns one authenticated dashboard and its HTTP client; leases reuse it without clearing shared data. Product `E2ETest` exposes this as `Telemetry`.

```csharp
using var operation = brain.Telemetry().BeginOperation("catalog");
using var request = operation.Request(HttpMethod.Get, "/ai/models");
using var response = await operation.SendAsync(brain.HttpClient, request, ct);
response.EnsureSuccessStatusCode();
var capture = await operation.CompleteAsync(ct);
```

Each request gets a distinct W3C parent. Use `operation.SendAsync` so the in-process AppHost's HttpClient instrumentation cannot replace that context. Await application completion before `CompleteAsync`: for persistent script tests this includes the required transcript, runtime acknowledgements, and pricing. The runtime's `IsIdle` describes its own subscriptions and pricing, not arbitrary future distributed work.

Completion flushes each application's trace and log providers through an opt-in per-run capability and awaits their receipts in the dashboard. It also requires every correlated HTTP server span to have ended. No exporter settling delay is used. Normal deployments do not expose the flush endpoint.

`Spans` contains correlated operation spans. `AllSpans` measures application work started during the window, including uncorrelated projections. `PrivacySpans` additionally includes earlier spans that overlap the window; use it with `Logs` for absence assertions. Resource identity comes from the authenticated export receipts, excluding AppHost probes while retaining both servers and sandbox. Typed OTLP values, resource/scope metadata, events, links, and unknown JSON fields remain available.

Dashboard query truncation, reported dropped fields, and retention-capacity exhaustion fail capture. SDK queue capacity is enlarged and sampling is enabled for opted-in resources. Receipts acknowledge export and ingestion; they cannot retrospectively recover SDK queue drops or failed earlier exports. A finite observation such as `ObserveAsync(TimeSpan.FromMinutes(1), ct)` intentionally measures elapsed time and is separate from export completion. Browser requests need explicit W3C propagation; the HTTP operation API does not implicitly trace Playwright's browser process.
