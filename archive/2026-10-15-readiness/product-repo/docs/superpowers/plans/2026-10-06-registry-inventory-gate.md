# Registry Task 0 — blocked feasibility gate

Inspected clean branch `os`, starting at `af596e2cd`. No production code or storage
changes. The instruction to stop when production cannot express the required query
takes precedence over continuing Tasks 1–7.

## Provider evidence

- `src/Aspire/DigitalBrain.Aspire.Hosting/DigitalBrainHostingExtensions.cs:53` selects
  memory storage without Azure; lines 70–73 select Azure Blob grain state with Azure.
- `src/Aspire/DigitalBrain.Aspire.Server/ServerHostingExtensions.cs:44` configures the
  default Azure Blob provider serializer and container.
- `src/Testing/DigitalBrain.Testing.Module/ModuleTest.cs:58` selects Orleans memory storage.
- `src/Modules/Postgres/DigitalBrain.Modules.Postgres/PostgresStorageMigration.cs`
  migrates Postgres table ownership metadata by reading Azure blobs; it does not replace
  default grain storage with a Postgres provider.
- Installed Orleans packages are 10.3.1 (NuGet global cache `E:/nuget`). Their upstream
  source revision is `137d9acc17830f15b13a4eb0058d6cee633cad5e`.
  [Azure provider source](https://github.com/dotnet/orleans/blob/137d9acc17830f15b13a4eb0058d6cee633cad5e/src/Azure/Orleans.Persistence.AzureStorage/Providers/Storage/AzureBlobStorage.cs)
  names blobs with state name before grain identity.
  [Memory storage contract](https://github.com/dotnet/orleans/blob/137d9acc17830f15b13a4eb0058d6cee633cad5e/src/Orleans.Core/Providers/IMemoryStorageGrain.cs)
  exposes only point operations.

A known state-name/type pair could produce a narrower blob prefix, but enumerating only
currently known pairs cannot guarantee coverage of unknown or retired types. A whole
container scan could filter on the brain after listing; it is not the specified
server-side brain-prefix query, and type filtering also cannot generally precede the
unknown state-name component. Neither workaround was implemented.

## Probe output

Run from the repository root:

```powershell
dotnet run --file docs/superpowers/probes/registry-storage-gate.cs
```

Actual output (exit 1):

```text
Azure provider: 10.0.0.0
state-known.type/workspace-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/one.json
other-unknown.type/workspace-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/two.json
Brain-delimited blob prefix selects both state names/types: False
Memory storage contract: DeleteStateAsync, ReadStateAsync, WriteStateAsync
Memory storage has an operation beyond point read/write/delete: False
FAIL: Task 0 is not proven. No storage was written or replaced.
```

The displayed 10.0.0.0 is the assembly version; package versions are pinned to 10.3.1
in the probe. This uses the provider's actual naming method, via reflection for this
read-only probe only. It is not a live storage integration test and does not prove a
working catalog query. No application tests, E2E suites or Aspire smoke were run because
the gate failed before implementation.

## Key audit

| Surface | Actual key/state convention | Consequence |
| --- | --- | --- |
| Brain | `workspace-` + 64 lowercase hex digits | Exact scope key is attributable. |
| App | `{scope}/packages/{package}` (`InstalledPackages.AppKey`) | Parse the first `/` segment exactly. |
| UI parts | `{scope}:...` (`NeuronAccess.ForBrainKey`) | `:` is also a real scope delimiter. |
| Connection | `connection/{escaped-scope}/{connector}/{connection}` (`ConnectionKeys`) | Scope is the second segment, not a leading prefix. |
| Standalone C# file | `csharp-` + SHA256 of JSON `[scope,id]` (`CSharpCatalogStore.FileKey`) | Scope cannot be recovered from its key; ownership lives elsewhere. |
| Reminder | Arbitrary string key; grain type `reminder` (`ReminderNeuron`) | `Start` writes the Orleans reminder service, not a grain-state row. |
| Integration / migration / singleton | e.g. `integration/github`, `table-owners-v1` | Excluded from both catalogs' brain results. |

The exclusion decision is recorded in the design. Opaque brain-owned keys are a coverage
problem, not evidence that those neurons are deployment infrastructure. No Task 4 guard
was claimed or implemented while Task 0 remains blocked.

## Options for a revised ratification

1. Keep the deployed providers and explicitly permit an uncached Azure container scan,
   with exact filtering before returning results. Separately authorize a queryable memory
   provider as the sole test state store (not a mirror). This still requires a decision
   on opaque C# ownership and reminder registrations; a scan alone cannot meet the design.
2. Authorize a separate storage/key migration to a queryable authoritative catalog with
   recoverable brain keys. This is outside the current no-new-state work and still needs
   a reminder-catalog decision.
3. Narrow the inventory promise to currently attributable state rows/activations and defer
   unsupported surfaces. This gives up the ratified total coverage and Time proof, so it
   also requires changing the spec rather than silently proceeding.

No option was selected. No mirror, index neuron, lifecycle observer, cache, or persisted
inventory state was introduced.
