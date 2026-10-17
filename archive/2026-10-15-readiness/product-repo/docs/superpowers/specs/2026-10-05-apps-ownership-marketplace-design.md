# Apps: real owners, Marketplace, Install — design

Status: approved in conversation 2026-10-05. Supersedes the "Non-goals" of
`2026-10-05-apps-simplification-design.md` (marketplace, cross-brain discovery, forking); every other
part of that spec stands.

## Why

An app's owner is implicit in its key prefix (`{brainId}/apps/{name}`). Everything that is not a real
user brain had to be faked, which produced three kinds of owner and four delivery paths:

| Owner | Reality | How apps arrive |
|---|---|---|
| a user brain (`workspace-<hash>`) | real brain behind an account | Creator, HTTP import |
| `"os"`, `"intochat"` | a string: no account, no login, no enforcement scope | `ShippedAppPublisher` |
| the Assistant | not an app — a built-in module the shell hard-codes | launcher special case |

plus `OsBootService` copying `os/settings` into each brain. The pseudo-brains are why every shipped
app currently stays out: their scratch keys carry no `workspace-` scope, `NeuronAccess.ForBrainKey`
returns Unclassified, and `CallFilter` refuses the test script's own calls
(`OutsideWorkspace`). No user can ever see `intochat/customer-researcher`, verified or not.

The fix is one rule: **every app lives in a real brain owned by a real account, and the only way an
app crosses brains is Install from the Marketplace.**

## Decisions

- Install is a copy that remembers its origin and offers updates; editing the copy ends update offers.
- Publish is an explicit action on a green version. The Marketplace lists published versions only.
- First-party apps are owned by seeded accounts; in development the repo folder and the publisher's
  brain are kept in two-way sync at the published version.
- The Assistant becomes an ordinary OS app (`os/assistant`) installed by default. The agent runner
  (model calls, tool execution, metering, receipts) stays a platform neuron the app calls — scripts
  never hold credentials or price books.
- The shell's home screen is the app launcher: My apps, then Marketplace, then an app detail page.

## 1. Owners are real accounts

**Seeded accounts.** `DigitalBrain:Auth:Accounts:{n}` binds `Username`, `Password` (optional) and
`DisplayName`. A startup task registered beside `IdentityMigrationStartup` (`PlatformHosting.cs`)
calls `IPrincipal.Register` per entry; a repeat with the same password is a no-op, a mismatch is
logged and skipped. An entry without a password creates an account that cannot sign in (`os`).

The AppHost seeds `intochat` (with a development password) and `os` (none). The developer stays the
Open-posture `owner`.

**Switching.** `GET /identity/seeded-accounts` answers the seeded usernames and display names only in
Open posture (404 otherwise). The login screen lists them as "Continue as <DisplayName>"; choosing one
signs in with the seeded credentials server-side (`POST /identity/seeded-accounts/{username}/login`,
Open posture only). Open posture already grants full owner access without a login, so this adds no
reach. In production the screen is the ordinary login.

**Publisher brains.** A shipped source names its account. Its apps are keyed by the account's default
brain scope (`BrainScope.Create(accountId, brainId).Id`), and shipping runs with a caller stamped as
that account and brain. `ShippedContentStartup`'s publisher loop stamps the real account; the
`"os"`/`"intochat"` pseudo-brain keys disappear.

## 2. Publish, Marketplace, Install

### App state (append only)

| Id | Field | Meaning |
|---|---|---|
| 20 | `PublishedVersion` (string?) | the version currently listed |
| 21 | `Origin` (`AppOrigin?`: PublisherAccountId, PublisherBrainId, Name, Version) | where an installed copy came from |
| 22 | `Edited` (bool) | the program changed after install |

`Edited` is set by `SaveSpec`, `SaveManifest`, `WriteBehavior`, `WriteFile`, `CompleteBuild` and
`Rollback`. `Configure` does not set it. `AppSnapshot` gains `PublishedVersion`, `Origin`,
`Edited`.

### Manifest

`AppManifest` gains `Icon` (string?, a bundle file path such as `icon.svg`). `app.json` gains
`"icon"`. The icon file travels in the bundle's `Files` like any other file.

### Publish

`IApp.Publish()` requires the current version to be verified green, keeps that version's bundle as the
published snapshot, sets `PublishedVersion`, upserts its listing in the Marketplace, and publishes
`AppPublished(Name, Version)`. Publishing
again replaces the listing. `Delete` of a published app removes its listing. `IApp.ExportPublished()`
returns the published bundle; it is called only host-side by Install.

`POST /brains/{id}/apps/{name}/publish`.

### Marketplace

`IMarketplace` is a neuron with one constant key. State: `MarketplaceListing[]`
(PublisherAccountId, PublisherBrainId, PublisherName, Name, Title, Description, Version, Icon path,
Scenarios[]). `List()` and `Read(publisher, name)` are `NeuronAccess.PublicOperation`; `Upsert` and
`Remove` accept only the apps neuron as source (same source-grain check as `CSharpFileNeuron`
bound-behavior writes). The listing is platform-wide, not per-brain state, so no inventory provider
enumerates it; the published apps themselves stay in their publishers' brains and inventories.

Endpoints (under `BrainRoutes.Group`, so the caller is a member of `{id}`):

```
GET  /brains/{id}/marketplace                               listings + this brain's install state
GET  /brains/{id}/marketplace/{publisher}/{name}            listing detail (scenarios, version, installed?, update?)
GET  /brains/{id}/marketplace/{publisher}/{name}/icon       the icon file
POST /brains/{id}/marketplace/{publisher}/{name}/install    copy into this brain
POST /brains/{id}/apps/{name}/update                        replace the program with the origin's published version
```

### Install

Host side, as the platform: read the listing, `ExportPublished()` from the publisher's app, then in the
caller's brain `Import(bundle)` and record `Origin` (version = listing version, `Edited = false`).
A name already present in the caller's brain is refused (409). Install of one's own app is refused.

### Update

"Update available" ⇔ `Origin` is set, `!Edited`, and the listing's version is newer than
`Origin.Version`. Update keeps settings and connections: Delete → Import → Configure (the logic now in
`OsBootService.EnsureCurrentAsync`, moved here), then records the new `Origin.Version`. An edited copy
answers 409 to update.

## 3. Repo ↔ brain sync (development)

`DigitalBrain:Modules:apps:Shipped:{source}` gains `Account` (required) and `Writable` (default
false). Embedded sources (OS) name their account in code.

At startup, per bundle: verify on a scratch copy in the publisher's brain (the existing gate); then

- brain missing or repo version newer → import into the publisher's brain and publish;
- brain version newer and source writable → export the brain's published bundle to the folder;
- equal → nothing.

On `AppPublished` from a writable source's account, the bundle is written to `<Path>/<FolderName>/`
(`app.json`, `app.spec.md`, `tests.cs`, `behaviors/*.cs`, other files). The folder name for an app
that already exists is unchanged; a new app gets its PascalCase title. Production configures no
`Writable`.

## 4. Default apps and the Assistant

**Default installs.** `OsAppsOptions.Apps` names marketplace entries (`os/settings`, `os/assistant`).
On a brain's `Activated`, each missing default is installed through the Install path. Present
defaults are left alone; they get "Update available" like any install. `OsBootService`'s
copy/upgrade code is deleted.

**Assistant app (`os/assistant`).** Spec, `tests.cs` and behaviors own the window, the conversation
list, drafts, model choice and rendering. The runner gains what a script needs:

1. **Task-shaped turns.** `IAgentExecution.Start(AgentTurnStart)` returns a run id; progress is
   published as `AgentTurnProgressed` (text delta, tool call, tool result, card) and
   `AgentTurnCompleted` / `AgentTurnFailed` signals the script consumes with `brain.On<T>`. The script
   edge stays Task-only.
2. **Scripted models.** The runner resolves `scripted/<key>` model profiles to `IScriptedLLM`, so
   `tests.cs` drives whole tool-calling turns deterministically in the publish gate.
3. **Tools by name.** The script's agent definition names tools; the runner executes them host-side
   (`app_*`, discovery, form/view tools unchanged). Metering and receipts stay in the runner and are
   delivered as signals.

Deleted: `/applications/assistant/*` endpoints, `AssistantNeuron`'s surface/presentation code, the
shell's hard-coded assistant launcher entry and `ApplicationSurface(application: 'assistant')`.
The docked side panel becomes "dock any app": the shell docks the app named by a `dock` preference
(default `assistant`) by asking it to `open` with a docked target.

## 5. Shell home screen

Home replaces the empty desktop as the start view (`workspace_app.dart` body switch):

- **My apps** — tile grid (icon, title) from `GET /brains/{id}/apps`; tap opens the app window and
  switches to the desktop.
- **Marketplace** — tiles from `GET /brains/{id}/marketplace`.
- **App detail** — name, publisher, description, scenarios (with pass/fail for an installed copy),
  and Install / Open / Update.

A Home island replaces the Applications popup. `AppScreen` shows Publish for one's own app when the
current version is green, and the published version. Dart models mirror the C# records in the same
change.

## 6. Cleanup

Remove the `/packages/` key remnants (`CustomerResearcher/behaviors/surface.cs:29`,
`AppUiEndpoints.cs:114`, test keys), `built_in_app_view.dart`, stale fork/package comments, and the
package section of `CLAUDE.md` (rewritten to this model).

## 7. Testing

- Apps unit: publish refuses red; listing appears/updates/disappears; install records origin and
  refuses clashes and self-install; update keeps settings; edit ends update offers; marketplace
  reads are public, writes from anything but the apps neuron are refused.
- Identity unit: seeding is idempotent; seeded-account endpoints exist only in Open posture.
- Shipping unit: scratch verification passes against a real-brain key (regression for the
  `OutsideWorkspace` refusal); version comparison both directions; writable write-back.
- AI unit: scripted-model profile turns; turn signals.
- `os/assistant/tests.cs` is the assistant's publish gate.
- OS composition: defaults installed on activation.
- Flutter: home, marketplace, detail, publish widget tests; `flutter analyze`.
- Smoke (`aspire run`): Customer Researcher appears in the Marketplace, installs into My apps, opens;
  as `intochat`, edit + publish → owner sees "Update available" and the repo folder changes.
