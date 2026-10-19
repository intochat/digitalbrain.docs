# Modules

A module is the unit of capability in IntoChat OS. It registers neurons, contracts, configuration and, when needed, infrastructure into the kernel.

## Registered modules

`OsCatalog` in `src/IntoChat.OS.Kernel` registers these modules:

| Area | Modules |
| --- | --- |
| Runtime | Orleans, Aspire, Azure, MCP |
| AI and apps | AI, Apps, Circles, Flame, Tools, ArtCraft |
| Code and automation | CSharp, GitHub, Playwright |
| Data | Postgres, Qdrant, ClickHouse, Supabase |
| Services | Gmail, Salesforce, Time |
| Shell | Flutter |

A Windows module for desktop automation is available to hosts on Windows through `WithWindowsEdge()`. Modules that need a container (Postgres, ClickHouse, Supabase, Qdrant, ArtCraft) are excluded from the in-process test composition.

## Shipped apps

First-party apps live under `features/os`: BrainView, Calculator, Circle, CircleRoom, DataVisualizer, Engineer, Files, FilmCraft, Friends, Ino, Memory, PhotoCraft, Router, SelfImprove, Settings, Usage and Workspace.

## Add a module

Use `src/IntoChat.OS.Modules/Microsoft/GitHub` as the model. Each module is a folder of projects:

```text
GitHub/
  IntoChat.OS.Modules.Microsoft.GitHub/                 implementation
  IntoChat.OS.Modules.Microsoft.GitHub.Contracts/       public types
  IntoChat.OS.Modules.Microsoft.GitHub.Aspire.Hosting/  containers and parameters
  tests/                                                 *.Tests.Hosting, *.Tests.Integration
```

1. Create the implementation and `Contracts` projects. Other modules depend only on `Contracts`.
2. Declare the module class with a stable id and an options type:

   ```csharp
   public sealed class GitHubModule() : Module<GitHubModuleOptions>(new ModuleId("github"))
   ```

3. Bind options to the section from `IntoChatOSConfiguration.ModuleOptionsSection(new ModuleId("github"))`.
4. If the module needs infrastructure, add the `Aspire.Hosting` project and wire it in.
5. Add the module to `OsCatalog` (or a distribution's own composition).
6. Add tests with the shared harness; see [Testing](./reference/testing).

Warnings are errors, nullable is enabled and package versions are central in `Directory.Packages.props`. For the full rules, see [Contributing](./contributing).
