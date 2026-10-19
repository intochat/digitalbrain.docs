# Contributing

IntoChat OS is open source under the MIT license. Code contributions go to [intochat/os](https://github.com/intochat/os); contributions to these docs go to this repository.

## Workflow

1. Fork the repository and branch from `master`.
2. Make a focused change. Propose new concepts, contract changes and module-shape changes in an issue before implementing them.
3. Open a pull request against `master`. CI must pass before merge.

## Build and test

- On Windows, build individual projects rather than the whole solution: `dotnet build <project>.csproj`. CI builds `Intochat.OS.slnx` in Release.
- Run tests per project with `dotnet test`. Test projects are split by suffix: `*.Tests.Unit`, `*.Tests.Integration`, `*.Tests.Hosting`, `*.Tests.E2E`. See [Testing](./reference/testing).
- Use the shared module-owned test harness instead of private fixtures.
- For runtime changes, check observed behavior and telemetry as well as automated tests.

## Coding rules

- Warnings are errors, nullable is enabled and package versions are central.
- Name facts as sentences, for example `SomethingHappens`.
- Do not write boilerplate XML summaries. Keep comments accurate and short.
- Follow the existing neuron, signal, behavior and connector model.
- Keep contracts in `IntoChat.OS` and module `Contracts` assemblies, and keep C# wire records and Dart mirrors aligned.
- Preserve per-brain ownership and kernel-stamped provenance. Do not derive authority from settings.
- Use concrete arrays in persisted state, avoid self-calls on non-reentrant grains and renew observer leases.
- Never wipe user state, replace keys or assume stored data is disposable.

## Documentation

Narrative documentation lives in this repository. Edit the Markdown, then run `npm run build` and `npm run check:links`. Product plans are kept in a private handbook and are not part of this site.

## Releases

The `VERSION` file holds the version. Publishing a GitHub release with the tag `v<VERSION>` runs the release workflow, which packs and pushes the `IntoChat.OS.*` NuGet packages and the `os`, `os-ui` and `os-sandbox` images. The workflow refuses a tag that does not match `VERSION` and a commit whose CI has not passed.
