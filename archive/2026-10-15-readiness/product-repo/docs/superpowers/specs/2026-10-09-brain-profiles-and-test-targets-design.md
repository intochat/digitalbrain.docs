# Brain profiles and test targets

Ratified 2026-10-09.

## Problem

The system's composition is code in `AppHost.cs` with no variation points, so every test re-builds
or patches it. Result: five ways to stand a brain up (in-process cluster, `E2ETest.For<TAppHost>`,
reflected `ModuleBuilderFactory` topology, `AspireCompositionTest`, raw
`DistributedApplicationTestingBuilder`), two parallel builders (`ModuleTestBuilder`,
`E2ETestBuilder`), environment choices buried in fixtures (`ReferenceBrain` disables local models
and voice; browser chosen by env vars + `Debugger.IsAttached`; ad hoc live-gate env checks), and
product knowledge (shell, IntoChat, TwitterFakes, `openai`, csharp `RunTokenKey`) inside the
packable harness. Tests answer "which environment am I in" instead of "what behavior holds".

## Design

### 1. Profiles: named option presets, one mechanism for AppHost and tests

- A profile is a config layer: `DigitalBrain:Profiles:{name}` sections shipped as
  `profiles/{name}.json` next to the AppHost. Options only, never credentials (those stay
  Integrations).
- Composed with `+`: `aspire run -- --profile local+browser`. Later layers win.
- Built-ins: `dev` (today's composition), `local` (local models + local Whisper, no cloud keys),
  `fake` (FakeModelServer + fake voice, deterministic), `docker` (OS image), `cloud` (remote URL,
  starts nothing), add-ons `+browser`, `+headed`.
- A profile declares requirements (`Requires: ["ollama", "gpu", "docker"]`). An unmet requirement
  is a reported skip, not a per-test env check.
- `AppHost.cs` reads the composed profile to pick models, voice, storage and browser instead of
  hard-coding them.

### 2. Targets: tests receive a brain, never build a host

```csharp
public interface IBrainTarget : IAsyncDisposable
{
    string Profile { get; }
    Task<ITestBrain> BrainAsync(CancellationToken ct);   // IBrain + client + MCP + telemetry
}
```

- `InProcessTarget` — today's `ModuleTest` cluster (module facts).
- `AspireTarget` — starts the AppHost with the profile.
- `RemoteTarget` — docker/cloud; connects to a URL.

Matrix: `[BrainFact(Profiles = "fake,local,docker")]`, overridable by `DIGITALBRAIN_PROFILES`
in CI. Default CI: `fake` per PR; `local`, `docker` nightly.

`AspireCompositionTest` stays as model-only checks — composition is not an environment.

### 3. Packages

| Package | Holds | Depends on |
|---|---|---|
| `DigitalBrain.Testing` | targets, profiles, `BrainFact`, `SignalProbe`, waits, telemetry assertions, in-process target | `DigitalBrain`, `DigitalBrain.Framework` |
| `DigitalBrain.Testing.Aspire` | `AspireTarget`, `RemoteTarget`, profile-driven AppHost start | `DigitalBrain.Testing`, Aspire packages |
| `DigitalBrain.Testing.Playwright` | `+browser` add-on | `DigitalBrain.Testing.Aspire`, Playwright |

Repo-only (not packed, own namespace `DigitalBrain.Testing.Product`): Flutter shell helpers,
shell reset, Workspace, TwitterFakes, IntoChat fixtures.

Removed: Platform `InternalsVisibleTo` for the harness, reflected `ModuleBuilderFactory`,
hard-coded paths in `DigitalBrain.Testing.E2E.targets`, duplicate key validation, duplicate
`AsyncAction`.

## Migration stages

1. Profiles in config + AppHost reads them (`dev` = today, no behavior change). Verify with
   `aspire run --profile dev` and `--profile local`.
2. `IBrainTarget` + `BrainFact` beside the existing builders; `ModuleTest`/`E2ETest` become
   implementations of targets.
3. Collapse fixtures: `ReferenceBrain` and its subclasses, `ProductionBrainFixture`, Gmail/Flutter
   host fixtures → profiles. Unify the live-gated tests under profile requirements.
4. Split packages, move product code out, drop internals/reflection/`.targets` paths; enforce in
   `DigitalBrain.Architecture.Tests` (packable testing projects reference no Platform/OS/AppHost).
5. CI matrix.

Each stage keeps every suite green and is verified per CLAUDE.md.
