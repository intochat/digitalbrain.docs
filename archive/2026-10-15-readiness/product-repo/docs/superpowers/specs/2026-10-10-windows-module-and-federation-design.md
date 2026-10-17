> Historical design: distributed runtime portions are superseded for the local-PC deployment by [single-runtime devices](../specs/2026-10-14-single-runtime-devices-design.md). Windows connector functionality remains.

# Windows module and launcher profiles — design (phase 1)

Status: ratified 2026-10-10; revised the same day by the phase 2 grilling
([brain as data](2026-10-10-federation-circles-mesh-design.md), decision Q12: every machine is its own
single-silo Orleans cluster). The "one cluster per owner" and silo-metadata placement of the first draft are
gone; federation, discovery and cross-machine calls belong to phase 2.

## Problem

The Machine module (`IConsole`, `IFileSystem`) claims to be "the person's PC" but runs on whichever silo
activates it — with silo replicas or in production, that is a server, so the assistant gets a shell on the
server. It has no machine identity and no connector.

## Decisions

1. **Every machine runs the OS** (`dotnet run digitalbrain.cs [profile]`); the Flutter shell is optional, the
   human's connector, not a layer.
2. **Per-OS modules with their own contracts.** `Microsoft/Windows` ships `IWindows`, its own `IFileSystem` and
   `IConsole`. A Linux or macOS module ships its own, different contracts. No shared OS-neutral contracts;
   behaviors branch in C# against each OS module's types.
3. **The Machine module is deleted**; its consumers (OS catalog, `features/os` Router and Assistant, AI scenario
   tests) move to the Windows module.

## The Windows module

```
src/DigitalBrain.Modules/Microsoft/Windows/
  DigitalBrain.Modules.Microsoft.Windows.Contracts/   IWindows, IFileSystem, IConsole, records
  DigitalBrain.Modules.Microsoft.Windows/             WindowsModule, connector, neurons, machine identity
  tests/DigitalBrain.Modules.Microsoft.Windows.Tests/
```

### Machine identity

Each install has a stable `machineId` (a GUID, `N` format) created on first run in
`%LOCALAPPDATA%\DigitalBrain\machine-id` (path overridable in options for tests). The silo reads it at start.

### A machine is a connection

- Connector `windows` ("Windows"), auth method `device`, no required Integration. Neurons `IWindows`,
  `IFileSystem`, `IConsole`.
- Connection key `{brain}/connection/windows/{machineId}` (`ConnectionKeys.For`). The connection neuron
  implements `IWindows`.
- Connecting: `Connect("device", machineId)` through the standard connection flow. The probe succeeds only when
  the silo runs on Windows and `machineId` is **this silo's** machine id — a machine can only be connected from
  itself.
- Child neurons: `{connectionKey}/files` (`IFileSystem`), `{connectionKey}/console` (`IConsole`).
- Calls metered as own compute (no price), per the kernel cost meter.

### This machine or nothing

Every operation checks that the neuron's machine id equals the local silo's machine id. Otherwise it throws
`ServiceUnavailableException` (503): the machine is not here. It never runs on another machine. In phase 1 all
of a user's silos run on one PC, so the check passes there and refuses on any server silo. Phase 2 (single-silo
cluster per machine + transport) routes calls to the right machine.

### Roots

The connection holds allowed roots (`AllowRoot`, `RevokeRoot`, `Roots`). With no roots, file and console
operations are refused — no "whole machine" default. Paths compare case-insensitively (Windows).

### Contracts

- `IWindows`: `Facts()` (machine id, machine name, Windows version, processor count, memory), roots.
- `IFileSystem`: `Read`, `Write`, `List` confined to the roots.
- `IConsole`: `Run(command, workingDirectory, timeoutSeconds)` through `cmd.exe`, working directory inside a root.

## Launcher profiles

`dotnet run digitalbrain.cs [profile | path.json] [-- AppHost arguments]`:
- `default` (no argument): everything, shell UI opens.
- `headless`: no shell UI (`DigitalBrain:Shell:Enabled=false`).
- a `.json` path: an extra configuration file the AppHost loads after its own.

## Verification

Module facts on Windows (skipped elsewhere): connect from this machine, refuse another machine id, files and
console confined to roots, refusal without roots, 503 for a foreign machine id. Live: `dotnet run digitalbrain.cs`,
connect the machine through the connections endpoint, call `IWindows.Facts` and `IFileSystem.List` through
`digitalbrain-mcp`, see the spans; the assistant runs a command through `IConsole` on this machine.
