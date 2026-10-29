# Getting Started

## 1. Install Templates

```bash
dotnet new install DigitalBrain.Templates
```

## 2. Create Your First `App<TState>`

```bash
dotnet new intochat-app -n Counter
cd Counter
dotnet test
```

The `intochat-app` template scaffolds a complete `App<TState>` project with an executable `[Scenario]` test and `TestOS.Local()` unit test suite.

## 3. Create a DDD Module

```bash
dotnet new intochat-module -n Weather
```

This creates the 3-project DDD layout (`Contracts/`, `src/`, `tests/`) with `ModuleOnTestOSFacts<WeatherModule>` pre-wired.
