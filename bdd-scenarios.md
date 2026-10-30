# BDD Scenarios & `BddNeuron` (`IBdd`)

DigitalBrain treats Behavior-Driven Development (BDD) as a first-class runtime and testing primitive.

## Declaring `[Scenario]` Methods on an App

Any public parameterless method on an `App<TState>` marked with `[Scenario("title", Language = "en", Steps = ["Given ...", "When ...", "Then ..."])]` is an executable specification with plain-English (and multi-language) step-level reporting:

```csharp
[Scenario(
    "Dividing by zero records a validation message without throwing",
    Language = "en",
    Steps = [
        "Given a calculator at its initial state",
        "When Divide(10, 0) is invoked",
        "Then State.Error records a division-by-zero validation message"
    ])]
public void VerifyDivideByZeroScenario()
{
    Divide(new CalcBinary(10, 0));
    if (State.Error is null)
        throw new InvalidOperationException("Expected division by zero to set State.Error.");
}
```

Each scenario produces a `ScenarioVerdict` containing step-by-step `ScenarioStepVerdict(string Step, bool Passed, string? Error = null, TimeSpan Elapsed = default)` entries so non-technical users can see in plain language what the app does, which steps passed, and which step failed.

## Running Verification with `BddRunner`

`BddRunner.VerifyAsync<TApp>()` runs:
1. Every `[On]` UI operation against the empty-input `AppBaseline`, and
2. Every `[Scenario]` method on a fresh `TestOS.Local()` instance,
3. Recording the resulting `BddReport` into `BddNeuron` (`IBdd`), which emits `[Signal("bdd.verified")] public sealed record BddVerified(string AppId, bool Passed, BddReport Report) : Signal`.

```csharp
var report = await BddRunner.VerifyAsync<CalculatorApp>();
Assert.True(report.Passed);
```
