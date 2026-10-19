# Write a module

This tutorial builds a `Weather` module from the `intochat-module` template and ends with a passing test. It needs no clone of the IntoChat OS repository.

## Prerequisites

- The .NET SDK (.NET 11).
- A GitHub personal access token with the `read:packages` scope and nothing else. The `IntoChat.OS.*` packages are served from the IntoChat GitHub Packages feed, which requires a credential regardless of repository visibility.

Export the credential as environment variables. The template's `nuget.config` reads exactly these two names and never stores the token:

```sh
export NUGET_GITHUB_USERNAME=<your-github-username>
export NUGET_GITHUB_TOKEN=<your-token-with-read-packages>
```

Register the feed once so `dotnet new install` can find the template pack:

```sh
dotnet nuget add source https://nuget.pkg.github.com/intochat/index.json \
  --name intochat --username "$NUGET_GITHUB_USERNAME" --password "$NUGET_GITHUB_TOKEN" \
  --store-password-in-clear-text
```

Use a token you can revoke. Never commit it.

## Create the module

```sh
dotnet new install IntoChat.OS.Templates
dotnet new intochat-module -n Weather --ModuleId weather
```

`--ModuleId` is the stable id. It may contain ASCII letters, digits and hyphens only; the SDK generator rejects anything else (diagnostic `IOS0002`) when the project builds. Optional parameters `--Secret` (default `ApiKey`) and `--Setting` (default `Region`) name the first secret and setting.

## What you get

```text
Weather/
  Weather.csproj                       the module project
  WeatherModule.cs                     the module class and its options
Weather.Tests.Integration/
  Weather.Tests.Integration.csproj
  WeatherModuleFacts.cs                one fact that starts a brain with the module
Directory.Build.props, Directory.Packages.props, global.json
nuget.config                           maps IntoChat.OS* to the intochat feed only
```

`nuget.config` clears all sources, maps the `IntoChat.OS*` package pattern to the intochat feed and everything else to nuget.org. A package with that prefix is never restored from nuget.org.

The module class is attributes plus one method:

```csharp
[Module("weather")]
[Integration("weather", "Weather")]
[Secret("ApiKey")]
public sealed partial class WeatherModule : Module<WeatherOptions>
{
    partial void OnConfigure(IModuleServices services) => services.Services.AddSingleton(services.Options<WeatherOptions>());
}

public sealed class WeatherOptions : IModuleOptions
{
    [Setting] public string Region { get; init; } = "eu";

    public void Validate() { }
}
```

- `[Module]` gives the module its id. The SDK source generator writes the module registration and configuration binding from the attributes.
- `[Setting]` declares a configuration value with a default. `[Secret]` declares a secret the module needs; keep its value out of configuration files.
- `OnConfigure` is the only code you write; it registers your services.

## Run the test

```sh
cd Weather
dotnet build Weather.Tests.Integration/Weather.Tests.Integration.csproj -c Release
dotnet test --project Weather.Tests.Integration/Weather.Tests.Integration.csproj -c Release --no-build
```

The fact starts an in-process test brain with your module and checks that the `Region` default resolves. Expected result:

```text
Test run summary: Passed!
  total: 1
  failed: 0
  succeeded: 1
```

You now have a working module with a passing test.

## Add it to IntoChat OS

To ship the module inside the IntoChat OS repository, place the folder under `src/IntoChat.OS.Modules/<Vendor>/Weather` and run the three helper commands from the repository root:

```sh
dotnet run scripts/sync-solution.cs      # add the projects to the solution
pwsh scripts/capture-all.ps1             # refresh captured test output
dotnet run scripts/module-readmes.cs     # regenerate the module README tables
```

Nothing else is needed. Modules are discovered automatically; there is no catalog to edit. See [Modules](./modules) for the shape of a module and [Contributing](./contributing) for the workflow.
