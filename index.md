# DigitalBrain Framework

**DigitalBrain** is an open-source C# framework for building AI-native reactive applications and modular neuron systems. It powers [IntoChat OS](https://github.com/intochat/os) and [IntoChat Modules](https://github.com/intochat/modules), while remaining completely standalone with zero OS dependencies.

## Architecture at a Glance

```mermaid
flowchart LR
    subgraph Brain["Brain Scope (local / local+cloud / cloud)"]
        N1["Neuron<TState>\n[Neuron('x.feed')]"]
        S1(["[Signal('x.post')]"])
        A1["App<TState>\n[App('tracker')]\n• [On] UI Operations\n• [On('x.feed')] Live Signals\n• Render() / RenderSide()"]
        BDD["BddNeuron (IBdd)\n[Scenario('...')]"]
    end
    N1 -->|Save(next, signal)| S1
    S1 -->|Synapse / Stream| A1
    A1 -->|BddRunner.VerifyAsync| BDD
```

## Core Pillars

1. **Neurons & Signals (`Neuron<TState>`, `[Signal]`)**: Addressable, single-turn actors (`brain/type/key`) that persist state transitions atomically alongside typed signals via `await Save(next, signal)`.
2. **Clean Reactive Apps (`App<TState>`)**: Concise 40-line C# apps with typed immutable `State`, `Set(next)`, `Get<T>(key)` neuron access, `Render()` / `RenderSide()` views, and live background signal subscriptions (`[On("sourceKey")]`).
3. **First-Class BDD Verification (`[Scenario]`, `BddNeuron` / `IBdd`)**: Executable specification methods directly on your `App<TState>` verified in-process via `BddRunner.VerifyAsync<TApp>()` and recorded in `BddNeuron`.
4. **Declarative DDD Modules (`ModuleManifest`)**: Self-contained Bounded Contexts declaring `Provides`, `Requires`, `Needs` (`Need.HttpClient`, `Need.Webhook`, `Need.Container`), `Auth`, `Settings`, and `Secrets`.
5. **Instant In-Process Testing (`TestOS.Local()`)**: Deterministic, zero-Docker test runtime with virtual time (`TestClock`), journal inspection, and capability conformance suites.
