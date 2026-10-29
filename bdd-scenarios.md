# BDD Scenarios & `BddNeuron` (`IBdd`)

DigitalBrain treats Behavior-Driven Development (BDD) as a first-class runtime and testing primitive.

## Declaring `[Scenario]` Methods on an App

Any public parameterless method on an `App<TState>` marked with `[Scenario("title")]` is an executable specification:

```csharp
[Scenario("Dividing by zero records a validation message without throwing")]
public void VerifyDivideByZeroScenario()
{
    Divide(new CalcBinary(10, 0));
    if (State.Error is null)
        throw new InvalidOperationException("Expected division by zero to set State.Error.");
}
```

## Running Verification with `BddRunner`

`BddRunner.VerifyAsync<TApp>()` runs:
1. Every `[On]` UI operation against the empty-input `AppBaseline`, and
2. Every `[Scenario]` method on a fresh `TestOS.Local()` instance,
3. Recording the resulting `BddReport` into `BddNeuron` (`IBdd`), which emits `[Signal("bdd.verified")] public sealed record BddVerified(string AppId, bool Passed, BddReport Report) : Signal`.

```csharp
var report = await BddRunner.VerifyAsync<CalculatorApp>();
Assert.True(report.Passed);
```
