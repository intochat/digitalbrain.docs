# Neurons & Signals

## Stateful Neurons (`Neuron<TState>`)

A **Neuron** is an addressable actor identified by `NeuronId(BrainId, Type, Key)` (written `brain/type/key`). It processes one turn at a time unless a method is explicitly marked `[Interleaves]` or `[ReadOnlyCall]`.

```csharp
[Signal("counter.incremented")]
public sealed record CounterIncremented(int Value) : Signal;

public sealed record CounterState(int Value = 0);

[NeuronAlias("counter"), DefaultNeuronType("counter")]
public interface ICounter
{
    Task<int> Increment(int step = 1);
    [ReadOnlyCall] Task<int> Read();
}

[Neuron("counter")]
public sealed class CounterNeuron : Neuron<CounterState>, ICounter
{
    public async Task<int> Increment(int step = 1)
    {
        var next = new CounterState(State.Value + step);
        await Save(next, new CounterIncremented(next.Value));
        return next.Value;
    }

    public Task<int> Read() => Task.FromResult(State.Value);
}
```

## Atomic State + Signal Journal

Calling `await Save(next, signal)` writes both the new `TState` and the emitted `Signal` in a single atomic journal commit. Subscribers connected via a `Synapse` receive each signal in sequence order with cursor-based deduplication.
