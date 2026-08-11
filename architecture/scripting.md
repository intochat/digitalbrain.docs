# Scripting

[`DigitalBrain.Scripting`](https://github.com/intochat/digitalbrain/tree/master/src/Kernel/DigitalBrain.Scripting)
is a separate executable client of the brain. Its source lives under `src/Kernel` beside the product
hosts, but it is neither part of the Kernel silo nor a DigitalBrain module. The checked-in AppHost
starts it as its own process after Kernel is ready.

## Boundary

| Component | Responsibility | Explicitly not its responsibility |
| --- | --- | --- |
| `DigitalBrain.Scripting` | Generate a file-based C# app, run it, report its output, and exit | Kernel turns, module composition, durable Behavior storage, or approval |
| Generated `.cs` app | Reference existing client/contracts projects, join the cluster as an Orleans client, and use typed neuron/synapse vocabulary | Defining a new module or loading code into the silo |
| Kernel and modules | Own durable neurons, contracts, journals, graph routing, and Execution | Compiling or hosting generated source inside the silo |

This separation is a security and architecture boundary. An AppHost project reference makes
Scripting a launchable resource; it does not add Scripting to Kernel's `ModuleAssemblies`, discover
an `IModule`, or load a generated assembly into the credentialed silo.

## Current lifecycle

```text
AppHost
  +-- kernel (Orleans silo)
  |
  `-- scripting (separate project process; waits for kernel)
        |
        +-- writes temporary chart-point.cs
        +-- dotnet run --file chart-point.cs
        |       |
        |       `-- DigitalBrainClient.ConnectAsync(args)
        |               |
        |               `-- Orleans client --> brain cluster
        `-- captures output, attempts temporary-directory cleanup, exits
```

AppHost projects `brain.AsClient()` into the Scripting process, including the Orleans client and
Streams connection configuration, and sets `DigitalBrain__Owner=dev`. The generated child process
inherits that configuration. `DigitalBrainClient.ConnectAsync(args)` builds and starts a client
host, activates the owner facade, and returns `IDigitalBrain`.

The restored proof currently generates one `chart-point.cs` app. Its source contains absolute
`#:project` references to `DigitalBrain.Aspire` and the UI Contracts project, connects to the
cluster, fires a typed `ChartPoint` synapse, and exits. The Aspire resource reaching `Completed` is
therefore expected; it is not a long-running service failure.

The directory also retains hand-authored owner apps such as `chat-probe.cs` and
`connect-chat-responder.cs`. They demonstrate the same client boundary with different existing
contracts, but the AppHost-run generator currently emits only the ChartPoint proof. Default compile
items are disabled in the Scripting project, so only `Program.cs` is compiled into the executable;
the owner apps remain independent file-based programs.

## Roslyn and file-based apps

Generation and compilation are deliberately separate in the current implementation:

1. `ChartPointScriptGenerator` writes ordinary C# source with `File.WriteAllText`.
2. `ChartPointScriptRunner` invokes `dotnet run --file <generated.cs> --no-launch-profile`.
3. The .NET SDK resolves `#:project` and `#:property` directives, then compiles the file through
   the Roslyn C# toolchain and runs it as an application.

The Scripting project does **not** currently reference or host `Microsoft.CodeAnalysis` APIs.
“Via Roslyn” describes the compiler path behind the .NET SDK's
[file-based app support](https://learn.microsoft.com/dotnet/core/sdk/file-based-apps), not an
in-process Roslyn generator or a hot-loaded assembly.

## Product state

**Implemented now.** A separate `DigitalBrain.Scripting` executable is in the solution and AppHost
graph. It generates one temporary file-based C# brain client, connects out of process to the
running cluster, fires a typed synapse, captures the script output, attempts to remove the temporary
artifact, and exits.

**Known limitation.** This is a concrete Scripting proof, not the Behavior product boundary. It has
no general authoring API, immutable artifact store, approval/install rail, permission manifest,
sandbox, recovery model, or Execution-mediated effect policy. Source inspection confirms the path;
the earlier Stage-1 smoke predates restoration of this AppHost resource.

**Ratified next.** Behavior authoring builds on the Scripting capability: the assistant creates an
approved, versioned single-file C# app; a killable out-of-process worker runs the exact pinned
artifact with no ambient authority; and durable effects cross Execution. Generated code never
becomes a Module and never loads into the Kernel silo.
