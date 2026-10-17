# Shipped apps as a catalog — plan

Date: 2026-10-08 · Status: approved direction, ready to execute
Supersedes: `config-state-into-neurons.md` (treated the symptom: seeded accounts)

## Problem

First-party apps (`src/DigitalBrain.OS/Apps`, `src/IntoChat/Apps`) are compiled into the image, but
they are modeled as content a person wrote at runtime: a fake account owns a brain, publishes, lists,
and every brain installs a copy. Making build output look like a person costs us:

- seeded accounts, reserved names and dev switch passwords (`SeededAccountOptions`, `Auth:Accounts`)
- startup ordering (`ShippedContentStartup` waits on `ApplicationStarted` and `PublisherDirectory.Resolve`)
- caller impersonation: `PublisherCaller` stamps as `intochat`, and `OsDefaults` stamps `PrincipalId = "os"`
  inside another person's brain, then restores `RequestContext` by hand. That breaks "no
  publish-as-someone-else"
- folder↔brain version sync (`ShippedAppPublisher`, `ShippedAppSync`, `Writable`): a code migration engine
- catch-up machinery (`OsBootService`, `IAppIndex.Offered`, `os-defaults` readiness, "not in the
  Marketplace yet → retry")

## Target

A shipped app is **code from the image**: an immutable in-process `ShippedCatalog`. The Marketplace
lists two kinds of source, a person's brain or the catalog, and `Install`/`Update` read a bundle
from whichever one the listing names. Installed copies, `Origin`, `Edited`, and "updates keep the
data" are unchanged.

## Steps

Each step builds and its suites pass before the next starts. Map every site with LSP
(`findReferences`, `goToImplementation`) before editing. Grain state is reshaped freely (no shims),
so wipe Azurite before verifying.

### 1. Contract: `AppSource`
- Add `AppSource` (`Brain(AccountId, BrainId)` | `Shipped`) to `DigitalBrain.Modules.Apps.Contracts/Apps`.
- `MarketplaceListing`: replace `PublisherAccountId`/`PublisherBrainId` with `AppSource Source`.
- `AppOrigin`: `(Publisher, Source, Name, Version)`.
- Update every site LSP finds: `AppInstaller`, `MarketplaceNeuron.OwnerKey`, `MarketplaceWriteGuard`,
  `MarketplaceEndpoints`, `AppNeuron.Publish`, and the OS `OsDefaults` scope check.
- The Flutter Marketplace/app screens mirror the wire shape in the same change (`flutter analyze`, `flutter test`).
- Behavior is unchanged at this step: everything still uses `AppSource.Brain`.

### 2. `ShippedCatalog`
- `ShippedCatalog(IEnumerable<IShippedAppSource>)`: lazy and read-only, with `Find(publisher, name)` and `Listings`.
- `IShippedAppSource.Account` → `Publisher` (a vendor name, never resolved to a principal).
- `AddShippedApps(..., publisher: "os")` registers the source. The `IShippedContentPublisher`
  registration is gone from this step on.
- Facts: the catalog loads embedded and directory sources, rejects a duplicate `(publisher, name)`, and
  rejects a bundle that fails `IScriptSandbox.Check` (the publish gate moves to load time).

### 3. Marketplace reads both sources
- `MarketplaceView` service: catalog listings first, then `IMarketplace`. Endpoints and the installer
  use it, and the `IMarketplace` grain keeps only user listings.
- `MarketplaceWriteGuard`: an `Upsert` whose publisher is a catalog vendor name is refused (this
  replaces the reserved-username check).
- `AppInstaller.Bundle(AppSource, …)` switch. `Install`/`Update`/`Entry` read through it, and a
  `Shipped` source whose bundle is gone throws "no longer ships".

### 4. OS defaults without impersonation
- `OsDefaults.Created` calls `installer.Install` inside the creating turn: the caller is already the
  owner. Delete the stamping, the `RequestContext` restore, the Marketplace-presence branch and `IAppIndex.Offered`.
- Delete `OsBootService` and `OsDefaultsPublished` (and its `ready` check registration).
- Existing brains pick up new shipped versions through `Update`, the same as for user apps. Whether
  shipped updates auto-apply on activation is out of scope (open question 2).

### 5. Delete the publisher identity
- Platform: `SeededAccountOptions`, `SeededAccount`, `SeededAccountsStartup`, `/identity/seeded-accounts`,
  `SeededLoginAsync`, the reserved-name branch in `RegisterAsync`, `PublisherDirectory`,
  `ShippedContentHosting`/`ShippedContentStartup`/`PublisherCaller`.
- Framework: `PublisherBrain`, `IPublisherDirectory`, `IShippedContentPublisher`.
- Apps: `ShippedAppPublisher`, `ShippedAppSync`, `ShipOnStartupKey` (tests pick catalog contents by
  registering sources instead).
- OS: the `SeededAccountOptions` mutation in `OsApps.AddOperatingSystemApps`.
- AppHost: the `Auth:Accounts:0` and `Shipped:intochat:Account`/`Writable` keys. The source path stays.
- Flutter shell: the account switcher that called `/identity/seeded-accounts`.
- Shrink `ConfigurationKeyOwners.json` for every literal that disappeared.

### 6. "Save to source" for first-party apps (development)
- Editing an installed shipped app works as it does today: it sets `Edited` and detaches from its origin.
- New `IApp.SaveToSource()`: available only in run mode (`IHostEnvironment.IsDevelopment()`) and only
  for an app whose `Origin.Source` is `Shipped`. It writes `Export()` to the catalog's directory
  source for that publisher, bumps the version, reloads the catalog, then re-attaches the copy
  (`Edited = false`, `Origin.Version` = the new version).
- The directory source is writable only when the host registers it as development (it replaces `Writable`).
- The Creator and shell expose it as an explicit action, never a side effect of an ordinary edit.

### 7. Rename the composition overlay (carried over)
- `BrainModuleOptionsSection` → `CompositionModuleOptionsSection`, key `DigitalBrain:Brains:` →
  `DigitalBrain:Compositions:`; update `ModuleOptionOverlayFacts`.
- Delete the dead `ShellNames.OwnerKey`/`OwnerEnvironmentVariable`/`DefaultOwner`.

## Verification

- Unit/E2E (5-minute cap each): Apps tests (catalog, installer for both sources, write guard, save to
  source), Platform unit (identity without seeds), OS unit and E2E, Aspire hosting unit,
  Architecture tests, Flutter `analyze` and `test`.
- Running system: wipe Azurite, `aspire run`, every resource Healthy. Then through `digitalbrain-mcp`:
  - `neurons_context`: a fresh dev brain.
  - The marketplace read lists `os/settings`, `os/assistant`, `os/datavisualizer` and the IntoChat
    apps with `Source = Shipped`. No `os` or `intochat` principal exists.
  - `neurons_get` on the brain's apps: installed at creation, `Origin.Source = Shipped`.
  - Edit an IntoChat app, then `SaveToSource`: the repo folder changes, the version bumps, and the copy re-attaches.
- Telemetry: brain creation shows `Install` spans with no `ShippedContentStartup` or publish spans,
  and no stamped `os`/`intochat` caller appears in the logs.

## Open questions

1. A user listing named the same as a shipped one (`alice/assistant` next to `os/assistant`) is fine,
   because listings key on `(publisher, name)`. Confirm that vendor names `os` and `intochat` stay
   reserved only in the Marketplace and stop being reserved as usernames.
2. Shipped updates on existing brains: manual `Update` (as for user apps), or auto-apply to
   unedited copies on activation? I recommend manual first. Auto-apply is a separate, small follow-up.
3. Is IntoChat as a *vendor* right? Today it's also a product identity (branding). The catalog only
   needs its name, and nothing else depends on it being an account. Verify during step 5.
