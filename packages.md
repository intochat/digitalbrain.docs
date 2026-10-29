# Packages & Topologies

## NuGet Packages

| Package | Description |
|---|---|
| `DigitalBrain` | Core vocabulary (`Neuron<TState>`, `App<TState>`, `Signal`, `BddNeuron`, `ModuleManifest`, SPI) + Roslyn analyzers. |
| `DigitalBrain.UI` | Declarative UI value trees (`View`, `Column`, `Text`, `Collection`, `Entry`, `TextField`). |
| `DigitalBrain.Testing` | `TestOS.Local()`, `BddRunner`, `AppBaseline`, capability conformance suites, and fakes. |
| `DigitalBrain.Testing.Silo` | Dual-tier harness running facts on both `TestOS.Local()` and `SiloHost.Local()`. |
| `DigitalBrain.Analyzers` | Compile-time Roslyn analyzers (`DB0001`–`DB0027`). |
| `DigitalBrain.Templates` | `dotnet new intochat-app` and `dotnet new intochat-module`. |
| `DigitalBrain.Runtime.Orleans` | Orleans runtime for `local` and `local+cloud` topologies. |
| `DigitalBrain.Runtime.Orleans.Azure` | Azure Storage & Key Vault provider for `cloud` topology. |
| `DigitalBrain.Runtime.Http` | ASP.NET Core edge seam for module routes and session cookies. |

## Runtime Topologies

1. **`TestOS.Local()`**: In-memory, deterministic test runtime with virtual `TestClock`.
2. **`local`**: Single-machine encrypted brain store (`~/.intochat`) on `DigitalBrain.Runtime.Orleans`.
3. **`local+cloud`**: Local filesystem and hardware capabilities bridged to a cloud brain.
4. **`cloud`**: Multi-node distributed Orleans cluster backed by Azure Storage / Postgres / Qdrant.
