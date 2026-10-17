# Architecture tests

Run from the repository root:

```powershell
dotnet test --project src/Testing/DigitalBrain.Architecture.Tests -p:CodeGraphRefresh=false
```

The project references production module and contract projects automatically. Its build writes
the assembly manifest consumed by one shared ArchUnitNET graph. Test utilities, deployment,
Aspire hosting, and the sandbox executable are outside the runtime graph. The solution includes
this project in the existing CI test gate. The xUnitV3 adapter matches the repository's runner.

Rules enforce inward kernel dependencies, script-visible contracts depending only on contracts,
feature modules staying outside Platform, SDK placement of credential/identity contract families,
and credential-free module options. The options check uses the runtime's credential-name policy,
including inherited members, nested objects, and collection elements.

Production interfaces cannot expose methods explicitly named as test hooks or depend on test
frameworks/utilities in their signatures or attributes. Static inspection cannot infer whether
an otherwise normally named production operation is used exclusively by tests.

## Persisted state compatibility

The persisted graph starts at `IPersistentState<T>` constructor parameters/fields and closed
`Grain<TState>` bases (including indirect generic inheritance), then follows
serialized members, collection elements, base classes, and serializable polymorphic descendants.
ID checks cover all production `[GenerateSerializer]` types, including records held inside JSON
envelopes and wire contracts. IDs are checked per declaring type, including private fields and record properties.
Known retired IDs are reserved explicitly; they must never be filled or renumbered.

`PersistedStateIds.json` is a reviewed field-ID baseline for those serializer types. Tests emit
`bin/<configuration>/net11.0/PersistedStateIds.actual.json` as a comparison candidate and never
rewrite the source baseline. For new fields, append IDs and review the candidate diff before
updating the baseline. Removing a field requires preserving its ID as retired, updating
`RetiredIds`, and a deliberate compatibility review. Changing the baseline can authorize a
breaking change, so it must not be blindly regenerated to make a failure disappear.

Persisted collection declarations are checked without exceptions. Shared persisted contracts use
concrete arrays or dictionaries; ordinary wire DTOs outside the persisted graph are not subject
to this requirement.

`CollectionCompatibilitySamples.json` contains 94 immutable Orleans binary fixtures captured
from commit `5d4041158` before migrating the 48 interface collection members. For each member,
the old declaration was populated with a one-element array and a one-element list (dictionaries
use a concrete dictionary in both cases); nested serialized members were populated recursively.
Each entry records the original member JSON and the base64 serialized parent object. The test
reads these historical bytes using today's serializers, checks the member contents, then saves
and reads the object again. Do not regenerate these fixtures from the current declarations:
that would replace the compatibility check with a new-format roundtrip. Module tests additionally
exercise populated state through real grain deactivation/reactivation and JSON roundtrips.

The existing packaging, Roslyn composition, catalog visibility, secrets behavior, and storage
reactivation tests remain in their original suites.
