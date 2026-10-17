# Synapse Subscription Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a synapse react to a set of neurons, or rebuild from state on any signal, with one `await foreach` or one `React`, and rewrite the 45 feature scripts to that shape.

**Architecture:** `Sources` (fixed, or named by a registry neuron's state) and two default interface methods on `IDigitalBrain`, `On<T>(Sources)` and `React<T>`, built over the existing `On<T>(neuron, onSubscribed, ct)`. The merge is one internal class in the vocabulary ring, so all nine `IDigitalBrain` implementations get it for free. An `On(app, operation)` extension in the Apps contracts filters requests. Scripts then lose their `while`/linked-scope/`WhenAll`/`SemaphoreSlim` plumbing.

**Tech Stack:** .NET 11 RC (preview; `global.json`), C# default interface methods, `System.Threading.Channels`, Orleans grains via `DigitalBrain.Testing.Module`, xunit v3 (`TestContext.Current.CancellationToken`).

**Spec:** `docs/superpowers/specs/2026-10-10-synapse-subscription-contract-design.md`

## Global Constraints

- Warnings are errors, nullable on, central package versions (`Directory.Packages.props`). No new packages.
- `src/DigitalBrain` references only abstractions (`VocabularyRingFacts.VocabularyReferencesOnlyAbstractions`); `System.Threading.Channels` is a System assembly and allowed.
- No `/// <summary>` boilerplate; inline comments only for what code cannot say.
- Build and test per project, never the `.slnx`. Kill any test run over 5 minutes.
- LSP for all code work: `goToDefinition`/`findReferences` before changing a symbol; diagnostics clean before build. Never grep for code (grep for text in `features/*.cs` scripts and prompts is allowed: they are data, not compiled projects).
- A synapse is one reaction: one `await foreach` over one `brain.On<T>(…)` or one `brain.React<T>(…)`. Two signal types from the same set are two scripts.
- Delivery is at-least-once; rewritten scripts keep every dedup that exists today (`Circle/say.cs` request-id check, DataVisualizer deterministic view ids).
- Commit explicit files only (`git add <paths>`), never a directory; parallel sessions share the tree.

## Review Focus

1. **A member leaves and rejoins the set across two re-selections.** Expected: its signals resume from its current position, no replay of what it published while out. Pinned in Task 2 (`AMemberThatLeavesAndReturnsIsNotReplayed`).
2. **`Select` throws (registry state is malformed JSON).** Expected: the set stream ends with that exception, every member subscription is released, nothing leaks. Pinned in Task 2 (`AFailingSelectEndsTheStreamAndReleasesEveryMember`).
3. **A `React` rebuild throws.** Expected: `React` faults with that exception and the subscription is released; the script's own `catch … when (!Stopping)` sees it. Pinned in Task 3 (`AFailingRebuildEndsReactWithThatError`).
4. **Operation names differing only by case.** Expected: `On(app, "open")` matches `"open"` only, ordinal, same as `IApp.Request` validation. Pinned in Task 4 (`TheOperationFilterIsOrdinal`).
5. **Consumer disposes the set stream while a member read is in flight.** Expected: disposal completes without throwing, as `WatchStream` guarantees for one member. Pinned in Task 2 (`DisposingTheSetStreamMidReadDoesNotThrow`).

---

### Task 1: Vocabulary shapes and the architecture facts that pin them

**Files:**
- Create: `src/DigitalBrain/Kernel/Sources.cs`
- Modify: `src/DigitalBrain/Kernel/IDigitalBrain.cs`
- Modify: `src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs`

**Interfaces:**
- Produces: `Sources` (abstract), `Sources.Of(params INeuron[])`, `Sources.Named<TRegistry, TChange>(TRegistry, Func<TRegistry, CancellationToken, Task<INeuron[]>>)`, `IDigitalBrain.On<T>(Sources, CancellationToken)`, `IDigitalBrain.React<T>(INeuron, Func<CancellationToken, Task>, CancellationToken)`, `IDigitalBrain.React<T>(Sources, Func<CancellationToken, Task>, CancellationToken)`. The bodies throw `NotImplementedException` here; Tasks 2 and 3 replace them.

- [ ] **Step 1: Change the architecture fact to the new member list**

In `VocabularyRingFacts.TheBrainSeenByAProgramHasExactlyGetOnSelfAndKernel` replace the method assertions:

```csharp
var methods = typeof(IDigitalBrain).GetMethods().Where(m => !m.IsSpecialName).Select(m => m.Name).Order().ToArray();
Assert.Equal(["Get", "On", "On", "On", "React", "React"], methods);
var watches = typeof(IDigitalBrain).GetMethods().Where(m => m.Name == "On").OrderBy(m => m.GetParameters().Length).ThenBy(m => m.GetParameters()[0].ParameterType.Name).ToArray();
Assert.Equal([typeof(INeuron), typeof(CancellationToken)], watches[0].GetParameters().Select(p => p.ParameterType));
Assert.Equal([typeof(Sources), typeof(CancellationToken)], watches[1].GetParameters().Select(p => p.ParameterType));
Assert.Equal([typeof(INeuron), typeof(Func<Task>), typeof(CancellationToken)], watches[2].GetParameters().Select(p => p.ParameterType));
var reacts = typeof(IDigitalBrain).GetMethods().Where(m => m.Name == "React").OrderBy(m => m.GetParameters()[0].ParameterType.Name).ToArray();
Assert.Equal([typeof(INeuron), typeof(Func<CancellationToken, Task>), typeof(CancellationToken)], reacts[0].GetParameters().Select(p => p.ParameterType));
Assert.Equal([typeof(Sources), typeof(Func<CancellationToken, Task>), typeof(CancellationToken)], reacts[1].GetParameters().Select(p => p.ParameterType));
```

Add `Sources` to the allowlist (it carries a delegate, so it is neither a signal nor serializable):

```csharp
private static readonly Dictionary<Type, string> Allowlist = new()
{
    [typeof(Sources)] = "A set of neurons for IDigitalBrain.On/React: names neurons through a delegate, never crosses the wire (spec 2026-10-10 synapse subscription contract).",
};
```

- [ ] **Step 2: Run the fact to see it fail**

Run: `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -- --filter-method "*TheBrainSeenByAProgram*"`
Expected: FAIL, `Assert.Equal` on the method list (`["Get","On","On"]`).

- [ ] **Step 3: Add `Sources`**

`src/DigitalBrain/Kernel/Sources.cs`:

```csharp
namespace DigitalBrain;

// A set of neurons for IDigitalBrain.On<T>(Sources) and React<T>(Sources, …). Fixed, or named by
// one neuron: Select is asked on subscribe and again whenever Registry publishes TChange, so the
// set follows that neuron's state. Select is an ordinary neuron call and may read the registry.
public abstract class Sources
{
    private protected Sources() { }

    public static Sources Of(params INeuron[] neurons)
    {
        ArgumentNullException.ThrowIfNull(neurons);
        return new Fixed(neurons);
    }

    public static Sources Named<TRegistry, TChange>(TRegistry registry, Func<TRegistry, CancellationToken, Task<INeuron[]>> select)
        where TRegistry : INeuron where TChange : Signal
    {
        ArgumentNullException.ThrowIfNull(registry);
        ArgumentNullException.ThrowIfNull(select);
        return new Registry<TRegistry, TChange>(registry, select);
    }

    internal abstract Task<INeuron[]> SelectAsync(CancellationToken cancellationToken);

    // Every element means "select again". Empty for a fixed set; the merge skips the pump then.
    internal abstract IAsyncEnumerable<Signal> Changes(IDigitalBrain brain, CancellationToken cancellationToken);

    internal bool IsFixed => this is Fixed;

    private sealed class Fixed(INeuron[] neurons) : Sources
    {
        internal override Task<INeuron[]> SelectAsync(CancellationToken cancellationToken) => Task.FromResult(neurons);
        internal override IAsyncEnumerable<Signal> Changes(IDigitalBrain brain, CancellationToken cancellationToken) => Empty();
        private static async IAsyncEnumerable<Signal> Empty() { await Task.CompletedTask; yield break; }
    }

    private sealed class Registry<TRegistry, TChange>(TRegistry registry, Func<TRegistry, CancellationToken, Task<INeuron[]>> select) : Sources
        where TRegistry : INeuron where TChange : Signal
    {
        internal override Task<INeuron[]> SelectAsync(CancellationToken cancellationToken) => select(registry, cancellationToken);
        internal override async IAsyncEnumerable<Signal> Changes(IDigitalBrain brain, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
        {
            await foreach (var change in brain.On<TChange>(registry, cancellationToken).ConfigureAwait(false)) { yield return change; }
        }
    }
}
```

- [ ] **Step 4: Add the new members to `IDigitalBrain`**

In `src/DigitalBrain/Kernel/IDigitalBrain.cs`, after the two `On<T>` methods:

```csharp
    // One stream over a set of neurons; which member spoke is Signal.Publisher. Members are durable
    // per-source subscriptions; the set follows its registry (see Sources).
    IAsyncEnumerable<T> On<T>(Sources sources, CancellationToken cancellationToken = default) where T : Signal
        => throw new NotImplementedException();

    // "Any signal means rebuild from state": rebuild runs once after registration, then once per
    // signal, never concurrently; signals during a rebuild coalesce into one following rebuild.
    Task React<T>(INeuron neuron, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken = default) where T : Signal
        => React<T>(Sources.Of(neuron), rebuild, cancellationToken);

    Task React<T>(Sources sources, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken = default) where T : Signal
        => throw new NotImplementedException();
```

- [ ] **Step 5: LSP diagnostics clean, build, run the architecture suite**

Run: `dotnet build src/DigitalBrain/DigitalBrain.csproj`
Expected: 0 warnings, 0 errors.
Run: `dotnet test --project src/Testing/DigitalBrain.Architecture.Tests`
Expected: PASS, including `EveryPublicVocabularyTypeIsANeuronContractASignalOrAShapeTheyCarry` (the allowlist covers `Sources`) and `TheRingHoldsNoHandles`.

- [ ] **Step 6: Build every `IDigitalBrain` implementer**

Run each; all must be clean (default interface methods add nothing to implement):

```bash
dotnet build src/DigitalBrain.Client/DigitalBrain.Client/DigitalBrain.Client.csproj
dotnet build src/DigitalBrain.Client/DigitalBrain.Client.Orleans/DigitalBrain.Client.Orleans.csproj
dotnet build src/DigitalBrain.Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
dotnet build src/Testing/DigitalBrain.Testing.Module/DigitalBrain.Testing.Module.csproj
dotnet build src/Testing/DigitalBrain.Testing.E2E/DigitalBrain.Testing.E2E.csproj
```

- [ ] **Step 7: Commit**

```bash
git add src/DigitalBrain/Kernel/Sources.cs src/DigitalBrain/Kernel/IDigitalBrain.cs src/Testing/DigitalBrain.Architecture.Tests/VocabularyRingFacts.cs
git commit -m "Vocabulary: Sources, On<T>(Sources) and React<T> on IDigitalBrain; the ring fact pins the new member list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The set stream

**Files:**
- Create: `src/DigitalBrain/Kernel/SourceSet.cs`
- Modify: `src/DigitalBrain/Kernel/IDigitalBrain.cs` (replace the `On<T>(Sources)` body)
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/SourceSetFacts.cs`

**Interfaces:**
- Consumes: `Sources.SelectAsync`, `Sources.Changes`, `Sources.IsFixed`, `IDigitalBrain.On<T>(INeuron, Func<Task>, CancellationToken)`.
- Produces: `internal static IAsyncEnumerable<T> SourceSet.Open<T>(IDigitalBrain brain, Sources sources, Func<Task>? subscribed, bool coalesce, CancellationToken ct)`. `subscribed` runs once when every member of the first selection is registered; with `coalesce`, everything already queued behind a signal is dropped before it is yielded (one element stands for the burst). Task 3 uses both.

Test neurons: `ITestEmitter`/`Number` from `TestNeurons.cs` in the same project. For a registry, add to `TestNeurons.cs`:

```csharp
[GenerateSerializer]
public sealed record MembersChanged : Signal;
[Alias("test.registry")]
public interface ITestRegistry : INeuron
{
    Task Set(string[] members);
    Task<string[]> Members();
}
[GrainType("test-registry")]
public sealed class TestRegistry : Neuron, ITestRegistry
{
    private string[] _members = [];
    public async Task Set(string[] members) { _members = members; await PublishAsync(new MembersChanged()); }
    public Task<string[]> Members() => Task.FromResult(_members);
}
```

- [ ] **Step 1: Write the fixed-set facts**

`SourceSetFacts.cs`:

```csharp
using DigitalBrain;
using DigitalBrain.Testing.Module;
using Xunit;

namespace DigitalBrain.Client.Orleans.Tests.Unit;

public sealed class SourceSetFacts
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task AFixedSetYieldsEachMembersSignalsWithTheMemberAsPublisher()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var a = brain.Get<ITestEmitter>("set-a");
        var b = brain.Get<ITestEmitter>("set-b");
        await using var stream = program.On<Number>(Sources.Of(a, b), ct).GetAsyncEnumerator(ct);
        var first = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct); // both members register before anything is published
        await a.Emit(1);
        await b.Emit(2);
        Assert.True(await first.WaitAsync(Wait, ct));
        var one = (stream.Current.Publisher.Name, stream.Current.Value);
        Assert.True(await stream.MoveNextAsync().AsTask().WaitAsync(Wait, ct));
        var two = (stream.Current.Publisher.Name, stream.Current.Value);
        Assert.Equal([("set-a", 1), ("set-b", 2)], new[] { one, two }.OrderBy(x => x.Item2));
    }

    [Fact]
    public async Task DisposingTheSetStreamMidReadDoesNotThrow()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var stream = program.On<Number>(Sources.Of(brain.Get<ITestEmitter>("set-idle")), ct).GetAsyncEnumerator(ct);
        var pending = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await stream.DisposeAsync();
        Assert.False(await pending.WaitAsync(Wait, ct));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*SourceSetFacts*"`
Expected: FAIL with `NotImplementedException`.

- [ ] **Step 3: Write the merge**

`src/DigitalBrain/Kernel/SourceSet.cs`:

```csharp
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace DigitalBrain;

// The merge behind IDigitalBrain.On<T>(Sources): one pump per member, each a durable On<T>(neuron)
// subscription, all writing to one channel. A registry change re-selects: members that left are
// cancelled, members that joined are pumped from their current position, members that stayed
// keep their subscription (and so their watermark). Any pump or select failure ends the stream
// with that error; cancellation ends it quietly.
internal static class SourceSet
{
    public static async IAsyncEnumerable<T> Open<T>(IDigitalBrain brain, Sources sources, Func<Task>? subscribed, bool coalesce,
        [EnumeratorCancellation] CancellationToken cancellationToken) where T : Signal
    {
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var ct = lifetime.Token;
        var channel = Channel.CreateUnbounded<T>(new UnboundedChannelOptions { SingleReader = true });
        var members = new Dictionary<string, (Task Pump, CancellationTokenSource Stop)>(StringComparer.Ordinal);
        var registered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task Pump(INeuron neuron, Func<Task> onSubscribed, CancellationToken stop)
        {
            try
            {
                await foreach (var signal in brain.On<T>(neuron, onSubscribed, stop).WithCancellation(stop).ConfigureAwait(false))
                { await channel.Writer.WriteAsync(signal, stop).ConfigureAwait(false); }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            catch (Exception error) { channel.Writer.TryComplete(error); }
        }

        async Task Select(bool first)
        {
            var selected = await sources.SelectAsync(ct).ConfigureAwait(false);
            var wanted = selected.ToDictionary(n => n.GetPrimaryKeyString(), n => n, StringComparer.Ordinal);
            foreach (var (key, member) in members.Where(m => !wanted.ContainsKey(m.Key)).ToArray())
            {
                members.Remove(key);
                await member.Stop.CancelAsync().ConfigureAwait(false);
                await member.Pump.ConfigureAwait(false);
                member.Stop.Dispose();
            }
            var joining = wanted.Where(w => !members.ContainsKey(w.Key)).ToArray();
            var ready = new TaskCompletionSource[joining.Length];
            for (var i = 0; i < joining.Length; i++)
            {
                var gate = ready[i] = new(TaskCreationOptions.RunContinuationsAsynchronously);
                var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
                members[joining[i].Key] = (Pump(joining[i].Value, () => { gate.TrySetResult(); return Task.CompletedTask; }, stop.Token), stop);
            }
            if (first)
            {
                await Task.WhenAll(ready.Select(r => r.Task)).WaitAsync(ct).ConfigureAwait(false);
                registered.TrySetResult();
            }
        }

        async Task Follow()
        {
            try
            {
                await Select(first: true).ConfigureAwait(false);
                if (sources.IsFixed) { return; }
                await foreach (var _ in sources.Changes(brain, ct).WithCancellation(ct).ConfigureAwait(false))
                { await Select(first: false).ConfigureAwait(false); }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
            catch (Exception error) { registered.TrySetException(error); channel.Writer.TryComplete(error); }
        }

        var follow = Follow();
        try
        {
            await registered.Task.WaitAsync(ct).ConfigureAwait(false);
            if (subscribed is not null) { await subscribed().ConfigureAwait(false); }
            await foreach (var signal in channel.Reader.ReadAllAsync(ct).ConfigureAwait(false))
            {
                // A rebuild reads authoritative state, so one element covers everything queued behind it.
                if (coalesce) { while (channel.Reader.TryRead(out _)) { } }
                yield return signal;
            }
        }
        finally
        {
            await lifetime.CancelAsync().ConfigureAwait(false);
            try { await follow.ConfigureAwait(false); } catch (Exception) { /* reported through the channel */ }
            foreach (var member in members.Values)
            {
                try { await member.Pump.ConfigureAwait(false); } catch (Exception) { /* reported through the channel */ }
                member.Stop.Dispose();
            }
        }
    }
}
```

`GetPrimaryKeyString()` is an Orleans extension on `IAddressable`; `INeuron` extends it (check with LSP `goToDefinition` on `INeuron`; if the ring's `INeuron` exposes keys differently, use that accessor). The dictionary key is "same neuron" for the stay/leave decision.

Replace the `On<T>(Sources)` body in `IDigitalBrain`:

```csharp
    IAsyncEnumerable<T> On<T>(Sources sources, CancellationToken cancellationToken = default) where T : Signal
        => SourceSet.Open<T>(this, sources, null, coalesce: false, cancellationToken);
```

- [ ] **Step 4: Run the two facts**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*SourceSetFacts*"`
Expected: PASS.

- [ ] **Step 5: Write the registry facts**

Append to `SourceSetFacts`:

```csharp
    private static Sources Members(ModuleBrain brain, string registry)
        => Sources.Named<ITestRegistry, MembersChanged>(brain.Get<ITestRegistry>(registry),
            async (r, ct) => (await r.Members()).Select(id => (INeuron)brain.Get<ITestEmitter>(id)).ToArray());

    [Fact]
    public async Task ARegistryChangeAddsAndRemovesMembers()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var registry = brain.Get<ITestRegistry>("reg-1");
        await registry.Set(["reg-1-a"]);
        await using var stream = program.On<Number>(Members(brain, "reg-1"), ct).GetAsyncEnumerator(ct);
        var next = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await brain.Get<ITestEmitter>("reg-1-a").Emit(1);
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal(("reg-1-a", 1), (stream.Current.Publisher.Name, stream.Current.Value));

        await registry.Set(["reg-1-b"]);
        await Task.Delay(300, ct); // the re-selection registers b and drops a
        next = stream.MoveNextAsync().AsTask();
        await brain.Get<ITestEmitter>("reg-1-a").Emit(2);
        await brain.Get<ITestEmitter>("reg-1-b").Emit(3);
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal(("reg-1-b", 3), (stream.Current.Publisher.Name, stream.Current.Value));
    }

    [Fact]
    public async Task AMemberThatStaysAcrossAReselectionNeitherLosesNorRepeatsASignal()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var registry = brain.Get<ITestRegistry>("reg-2");
        await registry.Set(["reg-2-a"]);
        await using var stream = program.On<Number>(Members(brain, "reg-2"), ct).GetAsyncEnumerator(ct);
        var next = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await registry.Set(["reg-2-a", "reg-2-b"]); // a stays
        await brain.Get<ITestEmitter>("reg-2-a").Emit(1);
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal(1, stream.Current.Value);
        using var silence = CancellationTokenSource.CreateLinkedTokenSource(ct);
        silence.CancelAfter(TimeSpan.FromMilliseconds(500));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => stream.MoveNextAsync().AsTask().WaitAsync(silence.Token));
    }

    [Fact]
    public async Task AMemberThatLeavesAndReturnsIsNotReplayed()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var registry = brain.Get<ITestRegistry>("reg-3");
        var a = brain.Get<ITestEmitter>("reg-3-a");
        await registry.Set(["reg-3-a"]);
        await using var stream = program.On<Number>(Members(brain, "reg-3"), ct).GetAsyncEnumerator(ct);
        var next = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await registry.Set([]);
        await Task.Delay(300, ct);
        await a.Emit(1); // published while out of the set
        await registry.Set(["reg-3-a"]);
        await Task.Delay(300, ct);
        await a.Emit(2);
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal(2, stream.Current.Value);
    }

    [Fact]
    public async Task AFailingSelectEndsTheStreamAndReleasesEveryMember()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var registry = brain.Get<ITestRegistry>("reg-4");
        await registry.Set(["reg-4-a"]);
        var calls = 0;
        var sources = Sources.Named<ITestRegistry, MembersChanged>(registry, async (r, _) =>
        {
            if (Interlocked.Increment(ref calls) > 1) { throw new InvalidOperationException("malformed registry"); }
            return (await r.Members()).Select(id => (INeuron)brain.Get<ITestEmitter>(id)).ToArray();
        });
        await using var stream = program.On<Number>(sources, ct).GetAsyncEnumerator(ct);
        var next = stream.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await registry.Set(["reg-4-b"]);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => next.WaitAsync(Wait, ct));
        Assert.Equal("malformed registry", error.Message);
    }
```

- [ ] **Step 6: Run the whole file**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*SourceSetFacts*"`
Expected: PASS, 6 facts. If `AMemberThatStaysAcrossAReselection…` repeats signal 1, the stay/leave key is wrong: compare by the neuron's grain id string, not by reference.

- [ ] **Step 7: LSP diagnostics clean, build the vocabulary, run the existing subscription suites**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/DigitalBrain/Kernel/SourceSet.cs src/DigitalBrain/Kernel/IDigitalBrain.cs src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/SourceSetFacts.cs src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/TestNeurons.cs
git commit -m "Vocabulary: On<T>(Sources) merges per-member subscriptions and follows a registry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `React`

**Files:**
- Modify: `src/DigitalBrain/Kernel/IDigitalBrain.cs` (replace the `React<T>(Sources, …)` body)
- Test: `src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/ReactFacts.cs`

**Interfaces:**
- Consumes: `SourceSet.Open<T>(brain, sources, subscribed, ct)`.
- Produces: working `IDigitalBrain.React<T>` (both overloads).

- [ ] **Step 1: Write the facts**

```csharp
using DigitalBrain;
using DigitalBrain.Testing.Module;
using Xunit;

namespace DigitalBrain.Client.Orleans.Tests.Unit;

public sealed class ReactFacts
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task RebuildRunsOnceBeforeAnySignalAndOncePerSignal()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var source = brain.Get<ITestEmitter>("react-1");
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var runs = 0;
        var firstRun = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondRun = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var react = program.React<Number>(source, _ =>
        {
            var n = Interlocked.Increment(ref runs);
            if (n == 1) { firstRun.TrySetResult(); }
            if (n == 2) { secondRun.TrySetResult(); }
            return Task.CompletedTask;
        }, stop.Token);
        await firstRun.Task.WaitAsync(Wait, ct);
        Assert.Equal(1, runs);
        await source.Emit(1);
        await secondRun.Task.WaitAsync(Wait, ct);
        Assert.Equal(2, runs);
        await stop.CancelAsync();
        await react.WaitAsync(Wait, ct); // cancellation ends React quietly
    }

    [Fact]
    public async Task SignalsDuringARebuildCoalesceIntoOneFollowingRebuild()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var source = brain.Get<ITestEmitter>("react-2");
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var runs = 0;
        var holding = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var third = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var react = program.React<Number>(source, async _ =>
        {
            var n = Interlocked.Increment(ref runs);
            if (n == 2) { holding.TrySetResult(); await release.Task; }
            if (n == 3) { third.TrySetResult(); }
        }, stop.Token);
        await Task.Delay(300, ct); // first rebuild done, subscription registered
        await source.Emit(1);
        await holding.Task.WaitAsync(Wait, ct); // second rebuild is running
        await source.Emit(2);
        await source.Emit(3);
        await source.Emit(4);
        release.SetResult();
        await third.Task.WaitAsync(Wait, ct);
        await Task.Delay(500, ct);
        Assert.Equal(3, runs); // three signals during the hold became one rebuild
        await stop.CancelAsync();
        await react.WaitAsync(Wait, ct);
    }

    [Fact]
    public async Task AFailingRebuildEndsReactWithThatError()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().StartAsync(ct);
        IDigitalBrain program = brain;
        var source = brain.Get<ITestEmitter>("react-3");
        var runs = 0;
        var react = program.React<Number>(source, _ => Interlocked.Increment(ref runs) == 2 ? throw new InvalidOperationException("boom") : Task.CompletedTask, ct);
        await Task.Delay(300, ct);
        await source.Emit(1);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => react.WaitAsync(Wait, ct));
        Assert.Equal("boom", error.Message);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*ReactFacts*"`
Expected: FAIL with `NotImplementedException`.

- [ ] **Step 3: Implement `React`**

In `IDigitalBrain`:

```csharp
    Task React<T>(Sources sources, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken = default) where T : Signal
        => Reaction.Run<T>(this, sources, rebuild, cancellationToken);
```

Add `src/DigitalBrain/Kernel/Reaction.cs`:

```csharp
namespace DigitalBrain;

// React<T>: rebuild once when registered, then once per signal. The set stream is opened with
// coalesce, so a burst queued behind one signal is one rebuild: the handler reads authoritative
// state, and one run after a burst is both correct and cheaper.
internal static class Reaction
{
    public static async Task Run<T>(IDigitalBrain brain, Sources sources, Func<CancellationToken, Task> rebuild, CancellationToken cancellationToken) where T : Signal
    {
        ArgumentNullException.ThrowIfNull(rebuild);
        try
        {
            await foreach (var _ in SourceSet.Open<T>(brain, sources, () => rebuild(cancellationToken), coalesce: true, cancellationToken)
                .WithCancellation(cancellationToken).ConfigureAwait(false))
            { await rebuild(cancellationToken).ConfigureAwait(false); }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
    }
}
```

- [ ] **Step 4: Run the facts**

Run: `dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit -- --filter-method "*ReactFacts*"`
Expected: PASS, 3 facts.

- [ ] **Step 5: Diagnostics clean, build, full project suites**

```bash
dotnet build src/DigitalBrain/DigitalBrain.csproj
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/DigitalBrain/Kernel/Reaction.cs src/DigitalBrain/Kernel/SourceSet.cs src/DigitalBrain/Kernel/IDigitalBrain.cs src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit/ReactFacts.cs
git commit -m "Vocabulary: React<T> rebuilds from state once on registration and once per coalesced burst

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Operation-filtered requests

**Files:**
- Create: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppSubscriptions.cs`
- Test: `src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppSubscriptionFacts.cs`

**Interfaces:**
- Produces: `public static IAsyncEnumerable<AppRequested> AppSubscriptions.On(this IDigitalBrain brain, IApp app, string operation, CancellationToken ct = default)` in namespace `DigitalBrain.Apps` (the same namespace `IApp` lives in, so scripts need no new `using`).

- [ ] **Step 1: Write the facts**

```csharp
using DigitalBrain.Apps.Signals;

namespace DigitalBrain.Apps.Tests.Apps;

public sealed class AppSubscriptionFacts
{
    private const string Brain = "app-subscription-facts";
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task OnlyTheNamedOperationsRequestsAreYielded()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        IDigitalBrain program = brain;
        var app = brain.Get<IApp>(IApp.Key(Brain, "filtered"));
        await app.Create(new AppManifest("Filtered", "", [new("open", ""), new("add", "")], [], []), "spec");
        await using var adds = program.On(app, "add", ct).GetAsyncEnumerator(ct);
        var next = adds.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await app.Request("open", "");
        var id = await app.Request("add", "2+3");
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal((id, "add", "2+3"), (adds.Current.RequestId, adds.Current.Operation, adds.Current.Input));
    }

    [Fact]
    public async Task TheOperationFilterIsOrdinal()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var brain = await ModuleTest.Create().WithModule<AppsModule>().StartAsync(ct);
        IDigitalBrain program = brain;
        var app = brain.Get<IApp>(IApp.Key(Brain, "cased"));
        await app.Create(new AppManifest("Cased", "", [new("open", ""), new("Open", "")], [], []), "spec");
        await using var lower = program.On(app, "open", ct).GetAsyncEnumerator(ct);
        var next = lower.MoveNextAsync().AsTask();
        await Task.Delay(300, ct);
        await app.Request("Open", "");
        await app.Request("open", "x");
        Assert.True(await next.WaitAsync(Wait, ct));
        Assert.Equal("x", lower.Current.Input);
    }
}
```

If the manifest refuses two operations differing only by case, change the second fact to request `"Open"` and expect `ArgumentException` from `Request`, then request `"open"` and assert it is yielded; the ordinal claim is then carried by the manifest, which is fine.

- [ ] **Step 2: Run to see them fail**

Run: `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*AppSubscriptionFacts*"`
Expected: FAIL to compile (`On` with a string is not defined).

- [ ] **Step 3: Implement**

```csharp
using System.Runtime.CompilerServices;
using DigitalBrain.Apps.Signals;

namespace DigitalBrain.Apps;

// An app's operations arrive as AppRequested; a synapse for one operation watches only that one.
public static class AppSubscriptions
{
    public static async IAsyncEnumerable<AppRequested> On(this IDigitalBrain brain, IApp app, string operation,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(brain);
        ArgumentNullException.ThrowIfNull(app);
        ArgumentException.ThrowIfNullOrWhiteSpace(operation);
        await foreach (var request in brain.On<AppRequested>(app, cancellationToken).WithCancellation(cancellationToken).ConfigureAwait(false))
        {
            if (string.Equals(request.Operation, operation, StringComparison.Ordinal)) { yield return request; }
        }
    }
}
```

- [ ] **Step 4: Run the facts, then the architecture suite (the Contracts ring gains a static class; `VocabularyRingFacts` judges only the `DigitalBrain` assembly, but `ContractRulesFacts` may object to a non-contract type in a Contracts project)**

```bash
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*AppSubscriptionFacts*"
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
```
Expected: PASS. If `ContractRulesFacts` rejects a static class in a Contracts project, read its rule and add `AppSubscriptions` to that rule's allowlist with the reason "script-facing subscription helper over the app's own signal".

- [ ] **Step 5: Commit**

```bash
git add src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps.Contracts/Apps/AppSubscriptions.cs src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests/Apps/AppSubscriptionFacts.cs
git commit -m "Apps: brain.On(app, operation) yields one operation's requests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: DataVisualizer's four reaction scripts

**Files:**
- Modify: `features/os/DataVisualizer/run-on-row.cs`, `run-on-tick.cs`, `run-on-filter.cs`, `run-on-change.cs`
- Modify: `features/os/DataVisualizer/Views.cs` (one helper)
- Regression net: `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit/OsBootFacts.cs` compiles the `features` folder at boot.

**Interfaces:**
- Consumes: `brain.React<T>(Sources, …)`, `Sources.Named<IText, TextChanged>`, `Signal.Publisher`.
- Produces: `Views.Registry(DigitalBrainConnection brain, string appKey, Func<View, IEnumerable<INeuron>> members)` returning `Sources` that follows `appKey + "/views"`.

Scripts are data for the compiled projects: the "never grep" rule does not apply to reading them, but every contract name used must be checked with LSP in its Contracts project (`ITable`, `RowUpserted`, `RowDeleted`, `IReminder`, `ReminderTick`, `ITextField`, `TextFieldChanged`).

- [ ] **Step 1: Add the registry helper to `Views.cs`**

```csharp
    // The set of neurons the views name, following the registry text: a synapse watches it with
    // React<T> and refreshes the views a signal's Publisher belongs to.
    public static Sources Registry(DigitalBrainConnection brain, string appKey, Func<View, IEnumerable<INeuron>> members)
        => Sources.Named<IText, TextChanged>(brain.Get<IText>(appKey + "/views"), async (registry, _) =>
        {
            var text = (await registry.Read()).Markdown;
            var views = text.Length == 0 ? [] : JsonSerializer.Deserialize<View[]>(text, Json) ?? [];
            return views.SelectMany(members).DistinctBy(n => n.GetPrimaryKeyString(), StringComparer.Ordinal).ToArray();
        });
```

Add `using DigitalBrain.Flutter.Text.Signals;` and `using DigitalBrain;` to `Views.cs`.

- [ ] **Step 2: Rewrite `run-on-row.cs`**

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Postgres.Tables;
using DigitalBrain.Postgres.Tables.Signals;

// Any row upsert in a source table refreshes every view; run-on-row-deleted.cs does the same for deletes.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var tables = Views.Registry(brain, appKey, view => view.Source.StartsWith("apptable:", StringComparison.Ordinal)
    ? [brain.Get<ITable>(view.Source[9..])] : []);
await brain.React<RowUpserted>(tables, _ => app.Request("refresh", ""), brain.Stopping);
```

Create `features/os/DataVisualizer/run-on-row-deleted.cs` identical except `React<RowDeleted>` and the comment. Today's script refreshes with `""` (all views) on any row change; keep that.

- [ ] **Step 3: Rewrite `run-on-tick.cs`**

A tick refreshes one view, so this is `On<T>(Sources)` with `Publisher` mapped back to the view:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Time.Reminders;
using DigitalBrain.Time.Reminders.Signals;

// Every view with a refresh interval owns a reminder at {app}/views/{id}/refresh; its tick refreshes that view.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var prefix = appKey + "/views/";
var reminders = Views.Registry(brain, appKey, view => view.RefreshSeconds > 0 ? [brain.Get<IReminder>($"{prefix}{view.Id}/refresh")] : []);
await foreach (var tick in brain.On<ReminderTick>(reminders, brain.Stopping))
{
    var name = tick.Publisher.Name;
    await app.Request("refresh", name[prefix.Length..^"/refresh".Length]);
}
```

- [ ] **Step 4: Rewrite `run-on-filter.cs`**

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Flutter.TextField.Signals;

// Every filter field of every view is watched; a change refreshes each view sharing that field's group.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var fields = Views.Registry(brain, appKey, view => view.Filters.Select(column => (INeuron)brain.Get<ITextField>($"{appKey}/views/{view.FilterGroup ?? view.Id}/filter/{column}")));
await foreach (var changed in brain.On<TextFieldChanged>(fields, brain.Stopping))
{
    // {app}/views/{group}/filter/{column}: the group is the view id or the shared FilterGroup.
    var group = changed.Publisher.Name[(appKey + "/views/").Length..].Split('/')[0];
    foreach (var view in await Views.All(brain, appKey))
    { if ((view.FilterGroup ?? view.Id) == group) { await app.Request("refresh", view.Id); } }
}
```

- [ ] **Step 5: Rewrite `run-on-change.cs`**

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Text.Signals;

// A registry change means the set of views (or their definitions) changed: refresh them all.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
await brain.React<TextChanged>(brain.Get<IText>(appKey + "/views"), _ => app.Request("refresh", ""), brain.Stopping);
```

- [ ] **Step 6: Compile the features folder through the boot fact**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*AFreshBrainHasTheOsAppsInstalled*"`
Expected: PASS. A compile error in any script fails this fact with the Roslyn diagnostics in the message; fix the script, never the fact.

- [ ] **Step 7: Commit**

```bash
git add features/os/DataVisualizer/Views.cs features/os/DataVisualizer/run-on-row.cs features/os/DataVisualizer/run-on-row-deleted.cs features/os/DataVisualizer/run-on-tick.cs features/os/DataVisualizer/run-on-filter.cs features/os/DataVisualizer/run-on-change.cs
git commit -m "DataVisualizer: the reaction synapses follow the registry through Sources, no generation scopes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Fixed-set scripts: Calculator, Settings, Router, CustomerResearcher controls and activity

**Files:**
- Modify: `features/os/Calculator/calculator.cs`
- Modify: `features/os/Settings/preferences.cs`, `features/os/Settings/connections.cs`
- Modify: `features/os/Router/dispatch.cs`
- Modify: `features/intochat/CustomerResearcher/controls.cs`, `features/intochat/CustomerResearcher/activity.cs`
- Create: `features/os/Calculator/open.cs`, `features/os/Settings/preference-clicks.cs`, `features/os/Settings/connection-clicks.cs`, `features/os/Settings/connection-refresh.cs`, `features/os/Router/send.cs`, `features/intochat/CustomerResearcher/stop-click.cs`

**Interfaces:**
- Consumes: `brain.On<T>(Sources.Of(…))`, `brain.On(app, operation)`, `brain.React<T>`.

Each file below is the whole script. Keep every `using` the current file has that the new body still needs; drop the rest (`System.Threading`, `System.Threading.Tasks` are no longer needed where `WhenAll`/`SemaphoreSlim` go).

- [ ] **Step 1: Calculator**

`calculator.cs` keeps `Press`, `Evaluate`, `Compose` and the arrays; its top-level becomes:

```csharp
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var display = brain.Get<IText>(appKey + "/display");
var keys = new[] { "7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "C", "0", "=", "+" };
var buttons = Enumerable.Range(0, keys.Length).Select(index => (INeuron)brain.Get<IButton>(Name("key-" + index))).ToArray();

// Clicks are serialized by the loop itself: one reaction at a time, so no gate.
await foreach (var clicked in brain.On<ButtonClicked>(Sources.Of(buttons), brain.Stopping)) { await Press(clicked.Action); }

string Name(string part) => appKey + "/" + part;

async Task Press(string action)
{
    var expression = (await display.Read()).Markdown;
    await display.Set(action switch { "C" => "", "=" => Evaluate(expression), _ => expression + action });
}
```

Move `Open` and `Compose` (with `labels`) to a new `features/os/Calculator/open.cs`:

```csharp
// "open" composes the display and keypad and shows the window.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
await foreach (var request in brain.On(app, "open", brain.Stopping))
{
    await Compose();
    if (request.Input != "docked")
    {
        await brain.Get<IWorkspace>(brain.Setting("Brain")!).EnsureOpenAsync(appKey + "/window", "Calculator",
            WindowReference.For(new UiChildRef(UIVocabulary.SurfaceType, appKey + "/surface")), brain.Stopping);
    }
}
```

with `Compose`, `keys`, `labels` and `Name` copied verbatim from today's file. The `SemaphoreSlim` gate is gone: a single loop is already one reaction at a time.

- [ ] **Step 2: Settings preferences**

`preferences.cs` keeps `Current`, `ReadBaseline`, `Reload`, `Save` and the records; replace the loops with:

```csharp
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    try
    {
        if (request.Operation == "save-preferences") { await Save(request.Input); }
        else if (request.Operation is "reload-preferences" or "reconcile-preferences") { await Reload(request.Operation == "reload-preferences"); }
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    {
        var message = error is PreferenceConflictException ? error.Message
            : "Preferences could not be saved or loaded. Your draft is preserved. Reload preferences to inspect the stored values before retrying.";
        await status.Set(message);
    }
}
```

(three operations, one state machine: this stays one `AppRequested` loop). New `preference-clicks.cs`:

```csharp
using System.Text.Json;
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Button.Signals;
using DigitalBrain.Flutter.TextField;
using DigitalBrain.Flutter.Text;

// The two preference buttons post the request their action names; Save carries the draft and baseline.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var buttons = Sources.Of(brain.Get<IButton>(appKey + "/save-preferences"), brain.Get<IButton>(appKey + "/reload-preferences"));
await foreach (var clicked in brain.On<ButtonClicked>(buttons, brain.Stopping))
{
    var operation = clicked.Publisher.Name[(appKey.Length + 1)..];
    var input = operation == "save-preferences"
        ? JsonSerializer.Serialize(new Submission((await brain.Get<ITextField>(appKey + "/preferences/display-name").Read()).Value,
            (await brain.Get<ITextField>(appKey + "/preferences/theme").Read()).Value,
            (await brain.Get<IText>(appKey + "/preferences/baseline").Read()).Markdown is { Length: > 0 } json ? JsonSerializer.Deserialize<PreferenceState>(json) : null))
        : "";
    await app.Request(operation, input);
}
```

`PreferenceState` and `Submission` are declared in `preferences.cs` today as script-local records; move them (and `PreferenceConflictException`) to a new shared file `features/os/Settings/Preferences.cs` (type declarations only, so it compiles into every synapse).

- [ ] **Step 3: Settings connections**

`connections.cs` keeps `Project`, `Card`, `Show`, `Key`, `State`; its reactions split into three scripts:

`connections.cs` top-level:
```csharp
await foreach (var _ in brain.On(app, "refresh-connections", brain.Stopping))
{
    try { await Project(); }
    catch (Exception) when (!brain.Stopping.IsCancellationRequested)
    {
        var error = "Connections could not load. Use Refresh connections to try again.";
        await Show([await Card("error", "Connections unavailable", error)]);
        await brain.Get<IText>(appKey + "/status").Set(error);
    }
}
```

`connection-clicks.cs`:
```csharp
await foreach (var _ in brain.On<ButtonClicked>(brain.Get<IButton>(appKey + "/refresh-connections"), brain.Stopping))
{ await app.Request("refresh-connections", ""); }
```

`connection-refresh.cs` (registry signals; two types, so two `React`s would be two files, but both post the same request, so one script per type is the rule): create `connection-refresh.cs` for `ConnectionsChanged` and `connection-requested.cs` for `ConnectionRequested`, each:
```csharp
await brain.React<ConnectionsChanged>(brain.Get<IConnectionRequests>(scope), _ => app.Request("refresh-connections", ""), brain.Stopping);
```
with `scope` computed as today (`brain.Setting("Brain") ?? appKey[..appKey.IndexOf("/apps/", StringComparison.Ordinal)]`).

- [ ] **Step 4: Router**

`dispatch.cs` keeps `Operations` body as its single loop (two operations, `open` and `ask`, share `Compose`/`Ask`; one `AppRequested` loop with a `switch` is still one reaction). Remove `Task.WhenAll(Operations(), SendClicks())` and `SendClicks`; the top-level is the loop body. New `send.cs`:

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Button;
using DigitalBrain.Flutter.Button.Signals;
using DigitalBrain.Flutter.TextField;

// The Send button posts the prompt as an "ask" request.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
await foreach (var clicked in brain.On<ButtonClicked>(brain.Get<IButton>(appKey + "/send"), brain.Stopping))
{
    if (clicked.RequestId == Guid.Empty) { continue; }
    var text = (await brain.Get<ITextField>(appKey + "/prompt").Read()).Value.Trim();
    if (text.Length is >= 1 and <= 32000) { await app.Request("ask", text); }
}
```

- [ ] **Step 5: CustomerResearcher controls and activity**

`controls.cs` becomes the research click only (drop `WhenAll` and `StopClicks`); new `stop-click.cs` holds the stop loop verbatim. `activity.cs`: drop `lifetime`, `loops`, `writer` and the three loop methods; `Project()` loses its semaphore; the top-level becomes one `React` over the three sources, which is three signal types, so three scripts: keep `activity.cs` as

```csharp
await brain.React<AppRequested>(app, _ => Project(), brain.Stopping);
```

and move `Project` and `Add` into a shared `features/intochat/CustomerResearcher/Activity.cs` as `public static class Activity { public static Task Project(DigitalBrainConnection brain, string key) … }` (parameterised on `brain`/`key`, same body minus the semaphore). Create `activity-queue.cs` and `activity-active.cs`:

```csharp
await brain.React<TextChanged>(brain.Get<IText>(key + "/queue"), _ => Activity.Project(brain, key), brain.Stopping);
```
(`active-research` for the second).

- [ ] **Step 6: Compile through the boot fact**

Run: `dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*AFreshBrainHasTheOsAppsInstalled*"`
Expected: PASS. IntoChat apps are not OS defaults; also run `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*FeatureCatalog*"` which compile-checks every folder under `features`.

- [ ] **Step 7: Commit**

```bash
git add features/os/Calculator/calculator.cs features/os/Calculator/open.cs features/os/Settings/preferences.cs features/os/Settings/Preferences.cs features/os/Settings/preference-clicks.cs features/os/Settings/connections.cs features/os/Settings/connection-clicks.cs features/os/Settings/connection-refresh.cs features/os/Settings/connection-requested.cs features/os/Router/dispatch.cs features/os/Router/send.cs features/intochat/CustomerResearcher/controls.cs features/intochat/CustomerResearcher/stop-click.cs features/intochat/CustomerResearcher/activity.cs features/intochat/CustomerResearcher/Activity.cs features/intochat/CustomerResearcher/activity-queue.cs features/intochat/CustomerResearcher/activity-active.cs
git commit -m "Features: fixed-set and rebuild synapses use Sources.Of and React; one reaction per file

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Assistant and Circle

**Files:**
- Modify: `features/os/Assistant/projection.cs`, `voice.cs`, `submissions.cs`
- Modify: `features/os/Circle/watch.cs`

- [ ] **Step 1: projection.cs**

The pointer names the agent; the agent publishes five signal types. Each type is its own `React` script over a registry-named set of one. Add to `Assistant.cs`:

```csharp
    // The selected conversation's agent, following the pointer text.
    public static Sources Conversation(DigitalBrainConnection brain)
        => Sources.Named<IText, TextChanged>(brain.Get<IText>(Key(brain) + "/conversation"), async (pointer, _) =>
        {
            var selected = (await pointer.Read()).Markdown;
            return [brain.Get<IAgent>(Key(brain) + "/conversations/" + (selected.Length == 0 ? "main" : selected))];
        });

    public static async Task Project(DigitalBrainConnection brain)
    {
        var appKey = Key(brain);
        var pointer = await brain.Get<IText>(appKey + "/conversation").Read();
        var source = appKey + "/conversations/" + (pointer.Markdown.Length == 0 ? "main" : pointer.Markdown);
        var state = await brain.Get<IAgent>(source).Read();
        await brain.Get<IComposer>(appKey + "/composer").Configure(source, pointer.Version);
        var runs = state.Runs.ToList();
        if (state.ActiveRun is { } active) { runs.RemoveAll(run => run.RunId == active.RunId); runs.Add(active); }
        await brain.Get<IChat>(appKey + "/transcript").Project(new(source, pointer.Version, state.Version, [.. runs.SelectMany(run => new[]
        {
            new ChatEntry(run.RunId + "/user", ChatRole.User, run.UserText),
            new ChatEntry(run.RunId + "/assistant", ChatRole.Assistant, run.Reply ?? "")
            {
                Status = run.Status.ToString().ToLowerInvariant(), Error = run.Error,
                Activities = [.. run.ToolCalls.Select(call => new ChatActivity(call.CallId, call.Name, call.Arguments, call.Result, call.Error))],
            },
        })])
        {
            Actions = state.ActiveRun is { } running ? [new("stop/" + running.RunId, "Stop", JsonSerializer.Serialize(new { runId = running.RunId }))] : [],
        });
    }
```

The `projected`/`configured` caches go: `React` already coalesces, and `IChat.Project` with an unchanged `(source, generation, version)` identity is a no-op write (confirm with LSP on `IChat.Project`; if it is not idempotent, keep a one-tuple cache inside `Project` as a static field, it is a disposable delivery cache either way).

Scripts (`projection.cs` becomes `projection-started.cs`; delete `projection.cs`):

| File | Body |
|---|---|
| `projection-started.cs` | `await brain.React<TurnStarted>(Assistant.Conversation(brain), async _ => { await app.Progress("working", "Working on your message"); await Assistant.Project(brain); }, brain.Stopping);` |
| `projection-progressed.cs` | `React<TurnProgressed>` → `Assistant.Project(brain)` |
| `projection-completed.cs` | `React<TurnCompleted>` → `Progress("completed", "Answered")` then `Project` |
| `projection-failed.cs` | `React<TurnFailed>` → `Progress("attention", "The turn failed")` then `Project` |
| `projection-cleared.cs` | `React<TranscriptCleared>` → `Project` |
| `projection-selected.cs` | `React<TextChanged>(brain.Get<IText>(appKey + "/conversation"), _ => Assistant.Project(brain), …)` |

The `Progress` calls on the first rebuild (registration, not a signal) are a side effect `React` did not have before. Guard them: `Assistant.Project` returns the agent state; the `Progress` call happens only when `state.ActiveRun is not null` (started/progressed) or when the last run's status matches (completed/failed). Implement as `Task<AgentSnapshot> Project(brain)` and branch on the returned state in each script.

- [ ] **Step 2: voice.cs**

One reaction. The old second loop (`ComposerChanged` cancelling an in-flight transcription through process memory) is replaced by deciding the outcome from state when the recognizer returns, so no cross-script cancellation is needed:

```csharp
await brain.React<ComposerVoiceCaptured>(composer, Transcribe, brain.Stopping);

async Task Transcribe(CancellationToken ct)
{
    if ((await composer.Read()).Voice is not { Status: "transcribing" } voice) { return; }
    var audio = await composer.ReadAudio(voice.Id);
    if (audio is null) { return; }
    try
    {
        var result = await brain.Get<ISpeechRecognizer>(appKey + "/recognizer")
            .Recognize(new SpeechRecognitionRequest(new MediaPayload(audio.Bytes, audio.MimeType), "voice.wav"), ct);
        // The person may have cleared or re-recorded meanwhile: the composer's state decides.
        var current = (await composer.Read()).Voice;
        if (current?.Id == voice.Id && current.Status == "transcribing") { await composer.CompleteVoice(voice.Id, result.Text); }
        else { await composer.CancelVoice(voice.Id); }
    }
    catch (Exception) when (!ct.IsCancellationRequested)
    { await composer.CompleteVoice(voice.Id, null, "Transcription failed. Your draft is unchanged. Try recording again or type your message."); }
}
```

Delete the `activeId`/`active` fields, `Captures`, `Changes` and `CheckCancellation`. Do not create a `voice-cancel.cs`.

- [ ] **Step 3: submissions.cs**

```csharp
await brain.React<ComposerSubmitted>(composer, _ => Reconcile(), brain.Stopping);
```

`Reconcile` unchanged.

- [ ] **Step 4: Circle watch.cs**

```csharp
await brain.React<CircleTouched>(circles, async _ =>
{
    try { await CircleView.Project(brain); }
    catch (Exception) when (!brain.Stopping.IsCancellationRequested) { }
}, brain.Stopping);
```

- [ ] **Step 5: Compile through the boot fact and the catalog fact**

```bash
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -- --filter-method "*AFreshBrainHasTheOsAppsInstalled*"
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests -- --filter-method "*FeatureCatalog*"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/os/Assistant/Assistant.cs features/os/Assistant/projection-started.cs features/os/Assistant/projection-progressed.cs features/os/Assistant/projection-completed.cs features/os/Assistant/projection-failed.cs features/os/Assistant/projection-cleared.cs features/os/Assistant/projection-selected.cs features/os/Assistant/voice.cs features/os/Assistant/submissions.cs features/os/Circle/watch.cs
git rm features/os/Assistant/projection.cs
git commit -m "Assistant, Circle: projections are React over the selected conversation; no generation scopes or writer gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Operation filters and the Creator prompt

**Files:**
- Modify (one line each): the 22 scripts listed by `grep -ln 'request.Operation !=' features -r --include=*.cs` at plan time: `CustomerResearcher/open.cs`, `Assistant/new.cs`, `Assistant/open.cs`, `Assistant/send.cs`, `Calculator/add.cs`, `Calculator/clear.cs`, `Circle/{accept,create,invite,open,say,set-share,share}.cs`, `DataVisualizer/refresh.cs`, `Files/{browse,open,read}.cs`, `FilmCraft/open.cs`, `PhotoCraft/open.cs`, `SelfImprove/{open,request}.cs` (Calculator/open.cs was written filtered in Task 6).
- Modify: `src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs:60-65`

- [ ] **Step 1: Replace each filter**

In each script, `brain.On<AppRequested>(app, brain.Stopping)` becomes `brain.On(app, "<operation>", brain.Stopping)` and the `if (request.Operation != "<operation>") { continue; }` line is deleted. `using DigitalBrain.Apps.Signals;` stays only if the file still names `AppRequested` elsewhere.

- [ ] **Step 2: Update the Creator prompt**

Replace lines 60–65 of `AgentPrompts.cs` with:

```
        Keep each synapse a screen or less and exactly one reaction: one `await foreach` over one
        `brain.On<T>(source, brain.Stopping)`, or one `brain.React<T>(source, rebuild, brain.Stopping)`
        when any signal means "rebuild from state". A synapse is a file with top-level statements;
        shared code is a file of only type declarations, compiled into every synapse. The app's own
        operations arrive as `AppRequested` signals; a synapse for one operation watches only it:
            await foreach (var request in brain.On(app, "open", brain.Stopping))
            { /* compose the UI through neurons */ }
        A set of neurons is one source: `Sources.Of(a, b)` for a fixed set, or
        `Sources.Named<IText, TextChanged>(registry, async (r, ct) => …)` when a neuron's state names
        the members; `signal.Publisher` says which member spoke. Never write a while loop, a
        Task.WhenAll of loops, a SemaphoreSlim or a linked CancellationTokenSource in a synapse.
```

- [ ] **Step 3: Build the Apps module, compile the features, run the Apps suite**

```bash
dotnet build src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/DigitalBrain.Modules.Apps.csproj
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
Expected: PASS. A Creator fact that asserts prompt text verbatim fails here; update its expected string to the new text.

- [ ] **Step 4: Confirm no script still carries the old plumbing**

```bash
grep -rln "Task.WhenAll\|Task.WhenAny\|while (!brain\|SemaphoreSlim\|CreateLinkedTokenSource\|request.Operation !=" features --include=*.cs
```
Expected: only `features/intochat/CustomerResearcher/research.cs` (its queue worker is a real state machine and is out of this plan's scope; note it in the commit message).

- [ ] **Step 5: Commit**

```bash
git add features src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs
```
is forbidden (directory add). List the 22 files and the prompt file explicitly:
```bash
git add features/intochat/CustomerResearcher/open.cs features/os/Assistant/new.cs features/os/Assistant/open.cs features/os/Assistant/send.cs features/os/Calculator/add.cs features/os/Calculator/clear.cs features/os/Circle/accept.cs features/os/Circle/create.cs features/os/Circle/invite.cs features/os/Circle/open.cs features/os/Circle/say.cs features/os/Circle/set-share.cs features/os/Circle/share.cs features/os/DataVisualizer/refresh.cs features/os/Files/browse.cs features/os/Files/open.cs features/os/Files/read.cs features/os/FilmCraft/open.cs features/os/PhotoCraft/open.cs features/os/SelfImprove/open.cs features/os/SelfImprove/request.cs src/DigitalBrain.Modules/DigitalBrain/Apps/DigitalBrain.Modules.Apps/Authoring/AgentPrompts.cs
git commit -m "Features: operation synapses watch brain.On(app, operation); the Creator prompt teaches Sources and React

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Live verification

**Files:** none changed unless a step fails.

- [ ] **Step 1: Start the OS**

Run from the repo root: `dotnet run digitalbrain.cs` (background). Then `mcp__aspire__list_resources`: every resource Running/Healthy. If not, `list_console_logs` for the unhealthy one first.

- [ ] **Step 2: Features loaded**

`mcp__aspire__list_structured_logs` filtered on `FeatureCatalog`: no compile error for any app; the Calculator, DataVisualizer, Assistant, Settings, Router, Circle and CustomerResearcher programs are assigned.

- [ ] **Step 3: Calculator keypad through `digitalbrain-mcp`**

`neurons_context` (confirm brain). `neurons_call` `IApp` `{brain}/apps/calculator` `Request("open","")`. Then `neurons_call` `IButton` `{brain}/apps/calculator/key-1` `Click` (or the contract's click method; find it with `neurons_search IButton`), then `key-15` (`+`), `key-2`, `key-14` (`=`). `neurons_get` `IText` `{brain}/apps/calculator/display` → `"11"`.

- [ ] **Step 4: DataVisualizer registry follow**

`Request("show", {"title":"t","kind":"table","source":"sql","sql":"select 1 as a","refreshSeconds":5})`; `neurons_get` `IText` `{brain}/apps/datavisualizer/last-view` → the view id. `list_traces`: a `ReminderTick` subscription on `{brain}/apps/datavisualizer/views/{id}/refresh` exists (the set re-selected after the registry write). `Request("close", id)`: the subscription ends.

- [ ] **Step 5: Assistant projection**

`Request("send", "hello")`. `neurons_get` `IChat` `{brain}/apps/assistant/transcript` shows the user entry and an assistant entry whose status advances; `list_trace_structured_logs` on the turn's trace shows exactly one `Project` per coalesced burst, not one per `TurnProgressed`.

- [ ] **Step 6: Regression net**

```bash
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Orleans.Tests.Unit
dotnet test --project src/DigitalBrain.Client/DigitalBrain.Client.Tests.Unit
dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
dotnet test --project src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit
dotnet test --project src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit
```
Expected: all PASS. Nothing to commit unless a step changed code; then commit those files explicitly with a message naming what the live run revealed.
