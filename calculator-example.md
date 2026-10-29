# Calculator Reference Example

The [`examples/Calculator`](https://github.com/intochat/digitalbrain/tree/main/examples/Calculator) project in `intochat/digitalbrain` demonstrates the complete `App<TState>` + `[Scenario]` BDD workflow in under 100 lines of code.

## Running the Example

```bash
dotnet test examples/Calculator.Tests.Unit/Calculator.Tests.Unit.csproj
```

## Key Highlights

- **Zero Boilerplate**: Inherits `App<CalculatorState>` and uses `Set(next)` to update state.
- **Automatic Presentation**: Implements `public View Render()` which `TestOS` and `AppRunner` evaluate after every `[On]` operation.
- **Executable BDD**: Includes `[Scenario("Adding, multiplying, and handling division by zero")]` verified by `BddRunner.VerifyAsync<CalculatorApp>()`.
