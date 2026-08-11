---
title: Contributing
---

# Contributing

DigitalBrain documentation follows production source. A clear page that describes an obsolete
system is still wrong, so accuracy and source ownership come before prose polish.

## Change protocol

Use this sequence for every coherent documentation change:

1. **Characterize.** Read the current owning production files, route maps, AppHost composition,
   contract aliases, and relevant status report. Record the committed product head.
2. **Make the minimal coherent change.** Update the owning page and every navigation/cross-link it
   directly invalidates. Do not mix unrelated cleanup into the same commit.
3. **Adversarially review your own diff.** Look for a current/future mix-up, an invented guarantee,
   a renamed alias, a deleted module boundary, a stale command, and user-owned changes you did not
   make.
4. **Verify statically.** Run `npm run build`, stale-term scans relevant to the change, and
   `git diff --check`. No automated test command is part of this phase.
5. **Commit narrowly.** Stage only the reviewed documentation files and use a message that states
   the page-level outcome.

If a documented rule conflicts with production reality, stop the affected change and record the
conflict in the relevant status/report page. Do not silently rewrite either side to make the diff
look consistent.

## Current source rules

- Production source on committed `master` is behavioral truth. Ratified plans describe future
  intent only when labelled **Ratified next**.
- The former central automated-test project is intentionally deleted. Do not create or run tests
  during this refit. Final hardening will design tests beside each owning module rather than one
  central test project.
- Existing wire aliases and serialized field IDs are permanent. Never rename, reuse, normalize, or
  silently migrate them in documentation or code.
- `DigitalBrain.Modules.Salesforce.Contracts` is a permanent product boundary for Salesforce neuron
  and synapse interfaces. Generic MCP provider discovery does not make that project disposable.
- Handwritten partial implementation classes are not part of the architecture. Source-generated
  partial neuron interfaces are valid permanent contract wiring.
- No package or dependency may be added without an explicit product-owner grant.
- Current chat belongs to UI. Conversation and the Behavior host/install rail are future work, not
  shipped components.
- `DigitalBrain.Scripting` is a separate cluster-client executable, not a Kernel module. Describe
  its current fixed generator separately from the ratified general Behavior host, and do not imply
  an in-process `Microsoft.CodeAnalysis` dependency that source does not contain.

## Product lifecycle while checking a claim

The docs build does not require the product AppHost. If a source change has separately authorized a
product build, stop Aspire first:

```powershell
aspire stop --apphost src/Kernel/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj
dotnet build DigitalBrain.slnx -warnaserror
```

Start local product smoke with `aspire start --apphost ...`; do not run the AppHost with
`dotnet run`. Never run an automated test command, and never build while the AppHost or a
DigitalBrain process still owns output files.

For production Flutter source, use `flutter analyze lib` from each of
`src/Modules/UI/Flutter/core`, `kit`, and `shell`. Analysis is static verification, not a test run.

## Documentation verification

From this repository:

```powershell
npm ci --no-audit --no-fund
npm run build
git diff --check
```

The production build is the required site gate. VitePress must find every navigation target and
internal link. Do not disable dead-link checking to land an incomplete page set.

Before committing, also scan published pages for names removed from the current architecture. A
negative explanation should use current vocabulary rather than preserving an obsolete symbol just
to say it no longer exists.

## Writing current and future state

Prefer exact nouns from source: Workspace, Actor, Neuron, Synapse, Connection, Integration,
Execution, Attempt, Operation, Blocker, Surface, and wire alias. Link to owning source directories
instead of copying every schema into prose.

When a page includes roadmap content, end it with distinct **Implemented now**, **Known
limitation**, and **Ratified next** statements. Smoke evidence must say what was actually observed;
it cannot turn provider login reachability into a claim that consent or token exchange succeeded.

## Security and secrets

Never put a real API key, OAuth client ID/secret, token, cookie, password, state value, or provider
payload in this repository. Examples use clearly synthetic local values. Document anonymous routes
as an explicit allow-list and keep the unauthenticated northbound MCP boundary visible until source
closes it.

## Working with dirty repositories

Uncommitted files belong to their author. Inspect status before editing, preserve unrelated work,
and do not stage a product-repository file as part of a docs commit. When production source changes
after an inventory freeze, keep claims pinned to the recorded committed head until the new work is
committed and deliberately re-characterized.

## Publishing

The Pages workflow builds on pull requests and on `main`; only non-pull-request runs deploy. Keep
`public/CNAME`, `public/logo.svg`, `.github/workflows/pages.yml`, and the default VitePress theme
unless a separately approved site-infrastructure change requires otherwise.
