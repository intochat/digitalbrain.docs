# Task I report: an install keeps its origin whatever the deploy does

## Cause
`FeatureLoader.Load` called `IApp.Import`/`Replace` (which persisted program, version and status Live, then deployed) and only afterwards `IApp.RecordOrigin`. When the deploy outlasted Orleans' 30 s response timeout, the caller threw and `RecordOrigin` never ran, but the grain went on to finish. The result was Live, origin null, and `Update` answered 409. Every path had the same shape: Marketplace install, the OS defaults (through `AppInstaller.Install`), the reconciler and the circle room. The reconcile path does pass a Shipped origin, but it is written too late in the same way.

## Change
- `AppStatus` gains `Deploying`, appended at the end.
- `IApp.Import(bundle, AppOrigin? origin = null)` and `IApp.Replace(bundle, AppOrigin? origin = null)`. The origin (with the bundle's version, Edited=false) goes into the same state write as the program.
- `AppNeuron.Land`: persist as Deploying, then deploy. On success it persists Live. On any failure it persists Failed with a "deploy failed: ..." activity line and rethrows.
- `Replace` returns early as a no-op only when the program is identical AND the status is Live. When the program is the same but the origin differs, it attaches the origin without redeploying.
- `FeatureLoader` passes the origin into Import/Replace and no longer calls `RecordOrigin`. `RecordOrigin` stays on the contract because tests and dev paths use it.
- `AppInstaller.Update` and `FeatureReconciler` reload a copy whose status is Deploying or Failed (`AppInstaller.Unconfirmed`), even at the same version. This retry is idempotent.
- No timeout raised. SynapseWriter/StageSynapse/CompleteSynapse are untouched.

## Facts (FeatureReconcilerFacts; the fake runtime's Deploy throws TimeoutException)
- AnInstallWhoseDeployTimesOutKeepsItsOriginAndIsNotLive
- TheNextUpdateAfterATimedOutDeployCompletesIt
- AReconcileInstalledDefaultCarriesItsShippedOrigin

## Tests
- `dotnet test --project src/DigitalBrain.Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests`: 221 passed, 0 failed.
- `dotnet build src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`: 0 errors.

## Not verified / concerns
- I did not watch the facts fail before the fix (I wrote the fix first). By reading the old code, the first fact would have failed: Origin was null and the status was Live.
- Not verified live. The OS was not run, per the brief.
- A Deploying copy whose grain died mid-deploy stays Deploying until the next update or reconcile, which happens on brain activation. There is no timer-driven retry.
- Shell: the new status strings "Deploying"/"Failed" show as plain text in `app_screen.dart`, which special-cases only Building/Live.
