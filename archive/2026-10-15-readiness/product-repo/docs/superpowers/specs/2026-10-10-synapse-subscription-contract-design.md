# Synapse subscription contract

Date: 2026-10-10. Status: proposed. Amended 2026-10-10 while planning: the merge lives in the
vocabulary as default interface methods, `Sources.Named` names the registry's change signal, and
the `onSubscribed` overload stays (see "Amendments").

## Problem

The rule is "a synapse is one reaction: one `await foreach` over one `brain.On<T>(source)`".
Twelve of the 45 synapse scripts under `features/` cannot obey it, and they are the hard ones
(`Assistant/projection.cs`, `DataVisualizer/run-on-row.cs`, `Settings/connections.cs`,
`Calculator/calculator.cs`, …). They need to react to many sources, or to a set of sources that
changes at runtime. Because `IDigitalBrain.On<T>` takes exactly one neuron, every one of those
scripts rebuilds the same machinery by hand: a `while (!Stopping)` loop, a linked
`CancellationTokenSource`, `Task.WhenAll` over per-source pumps, a `SemaphoreSlim` around the
handler, a registry watcher that cancels the scope, and a dedup cache. Around forty lines of
concurrency plumbing, written five different ways, and the part a generated behavior gets wrong.

Smaller, more frequent costs across the remaining scripts:

| Pattern | Scripts |
|---|---|
| `if (request.Operation != "x") continue;` on every `AppRequested` loop | 22 |
| `On<T>(source, Reconcile, ct)` with `Reconcile` also as the loop body, payload ignored | 9 |

Query-syntax LINQ was considered and rejected: it cannot `await` in a body, cannot merge
sources, cannot express "rebuild on subscribe", and would need System.Linq.Async. It prettifies
the 22 filters and leaves the 12 hard scripts untouched.

## Design

Three additions to the vocabulary ring and one removal. `await foreach` stays; what changes is
what can be iterated.

### 1. `IDigitalBrain.On<T>` over a set of neurons

```csharp
// src/DigitalBrain/Kernel/IDigitalBrain.cs
IAsyncEnumerable<T> On<T>(Sources sources, CancellationToken cancellationToken = default) where T : Signal;
```

```csharp
// src/DigitalBrain/Kernel/Sources.cs
// A set of neurons to watch. Either fixed, or named by one neuron: Select is asked on subscribe
// and again whenever Registry publishes TChange. Select is an ordinary neuron call, so it
// typically reads the registry's state and returns the neurons it names.
public abstract class Sources
{
    public static Sources Of(params INeuron[] neurons);
    public static Sources Named<TRegistry, TChange>(TRegistry registry, Func<TRegistry, CancellationToken, Task<INeuron[]>> select)
        where TRegistry : INeuron where TChange : Signal;
}
```

Semantics, from the script's point of view:

- One stream. A signal from any current member is yielded; which member is in `Signal.Publisher`.
- Membership follows the registry. When `Registry` publishes, `Select` runs again; members that
  left are unsubscribed, members that joined are subscribed from their current position. Members
  that stayed keep their watermark. No signal from a staying member is lost or duplicated by the
  re-selection.
- Each member is a durable per-source subscription exactly as `On<T>(neuron)` is today. The set
  stream is a merge of them, written once as a default interface method on `IDigitalBrain` over
  `On<T>(neuron, onSubscribed, ct)`. A kernel-side single subscription over a set is a later
  optimisation; it does not change this contract.
- Ordering is per member. Across members there is no ordering guarantee, same as two independent
  loops today.
- Cancellation ends every member subscription and the stream.

### 2. `IDigitalBrain.React<T>`

```csharp
// The "any signal means rebuild from state" reaction. Runs rebuild once after the subscription
// is registered, then once per signal, never concurrently, until cancellationToken ends it.
// A rebuild that throws ends React with that exception; cancellation ends it quietly.
Task React<T>(INeuron neuron, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken = default) where T : Signal;
Task React<T>(Sources sources, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken = default) where T : Signal;
```

Default interface methods written once over `On<T>`. Signals that arrive while a rebuild runs
coalesce into one following rebuild: the handler reads authoritative state, so running it once
after a burst is correct and cheaper.

### 3. Operation-filtered requests (Apps contract, not the vocabulary ring)

```csharp
// src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/AppSubscriptions.cs
public static class AppSubscriptions
{
    public static IAsyncEnumerable<AppRequested> On(this IDigitalBrain brain, IApp app, string operation, CancellationToken ct = default);
}
```

Client-side filter on `On<AppRequested>(app)`. Keeps `AppRequested` and the kernel untouched;
the script no longer carries the `continue`. Watermark advances through non-matching requests
the same way it does today when the loop body `continue`s.

### 4. The `onSubscribed` overload stays

`On<T>(INeuron, Func<Task> onSubscribed, CancellationToken)` remains on `IDigitalBrain`: it is
the only way a caller learns that registration completed before the first signal, and both
`React` and the gRPC watch replay (`NeuronsService`) are built on it. Scripts stop using it
directly; the Creator prompt no longer shows it.

## What does not change

- `On<T>(INeuron, CancellationToken)`: untouched.
- `Signal`, `Signal.Publisher`, provenance, watermarks, at-least-once delivery.
- The four words. `Sources` is a neuron plus a function; it names neurons, it is not a fifth concept.
- The Flutter UI contracts. The `Set(definition, (await Read()).Revision)` ceremony (30 sites) is
  a separate, smaller change and is out of scope here.

## Implementations touched

None of the nine `IDigitalBrain` implementations change. `On<T>(Sources)` and both `React`
overloads are default interface methods in `src/DigitalBrain/Kernel/IDigitalBrain.cs`, built on
the two existing `On<T>` methods; the merge is `src/DigitalBrain/Kernel/SourceSet.cs`, internal
to the vocabulary. The two client rings do not reference each other, so this is the only place
one merge can serve both, the silo and the test brains alike.

`DigitalBrain.Architecture.Tests/VocabularyRingFacts` pins `IDigitalBrain`'s member list and
the vocabulary allowlist; both facts change with the contract.

## Scripts after the change

`Calculator/add.cs`:

```csharp
await foreach (var request in brain.On(app, "add", brain.Stopping))
{
    var parts = request.Input.Split('+');
    await brain.Get<IText>(appKey + "/sum").Set(Sum(parts));
}
```

`Calculator/calculator.cs` keypad, no semaphore, no `WhenAll`, no per-key pump:

```csharp
var keys = Enumerable.Range(0, 16).Select(i => brain.Get<IButton>(Name("key-" + i))).ToArray();
await foreach (var clicked in brain.On<ButtonClicked>(Sources.Of(keys), brain.Stopping))
{
    await Press(clicked.Action);
}
```

`DataVisualizer/run-on-row.cs`, from 25 lines of generation scopes to one loop:

```csharp
var tables = Sources.Named(registry, async (r, ct) =>
    Views.Parse((await r.Read()).Markdown).Where(v => v.IsTable).Select(v => brain.Get<ITable>(v.TableId)).ToArray());
await brain.React<RowUpserted>(tables, _ => app.Request("refresh", ""), brain.Stopping);
// Sources.Named<IText, TextChanged>(registry, …): the registry is a text neuron that publishes TextChanged.
```

`Circle/watch.cs`:

```csharp
await brain.React<CircleTouched>(circles, _ => CircleView.Project(brain), brain.Stopping);
```

`Assistant/projection.cs` becomes one `React` over `Sources.Named(pointer, …)` selecting the
agent the pointer names; the six per-signal loops, the generation scope and the writer semaphore
go away. Where a script reacts to two signal types from the same set, it is two scripts, one
per type, as the rule already says.

## Testing

Facts over real grains in `DigitalBrain.Client` tests and `DigitalBrain.Testing.Module`:

- A fixed set yields each member's signals with the member as `Publisher`.
- A registry change adds a member and its later signals are yielded; removes a member and its
  later signals are not.
- A member that stays across a re-selection neither loses nor repeats a signal.
- `React` runs the rebuild once before any signal, once per signal, never concurrently, and a
  burst during a rebuild yields one following rebuild.
- `brain.On(app, "add")` yields only "add" requests.
- `DigitalBrain.Architecture.Tests`: `Sources` stays in `src/DigitalBrain`; `AppSubscriptions`
  stays in the Apps contracts.

Verification is the loop in CLAUDE.md: the rewritten features load and compile at boot
(`FeatureCatalog`), the Calculator keypad and DataVisualizer row refresh are driven through
`digitalbrain-mcp`, and the traces show one subscription per member.

## Order of work

1. Vocabulary: `Sources`, `SourceSet<T>`, `On<T>(Sources)`, `React`; architecture facts.
2. Facts over real grains for the set stream and `React`.
3. `AppSubscriptions.On(app, operation)`.
4. Rewrite the 12 multi-loop scripts, then the 22 filter scripts; `Creator` prompt text that
   shows the old pattern (`Apps/Authoring/AgentPrompts.cs`) updated to the new one.
5. Live verification.

## Amendments (2026-10-10, planning)

- The two client rings (`DigitalBrain.Client`, `DigitalBrain.Client.Orleans`) do not reference
  each other and twin their `WatchStream`. A merge written in one cannot serve the other, so the
  merge and `React` are default interface methods in the vocabulary, over the existing `On<T>`.
- `Sources.Named` takes the registry's change signal as a type argument. `On<T>` is typed; there
  is no "any signal" subscription to build on.
- The `onSubscribed` overload is not removed. `React` needs "registration completed" to run the
  first rebuild at the right moment, and `Platform/Neurons/NeuronsService` uses it for retained
  replay. It becomes runtime machinery scripts no longer touch.
