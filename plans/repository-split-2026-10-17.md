# Repository split: public OS and private platform

Date: 2026-10-17. Status: approved design, not executed. No repository was renamed, no code moved, no workflow changed and no release was cut while writing this.

Evidence: `intochat/digitalbrain` at `master` `faddacfc3`, clean; `intochat/cloud` at `master` as listed by the GitHub API on 2026-10-17; the OS catalog in `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs`; the two workflows under `digitalbrain/.github/workflows` and the three under `cloud/.github/workflows`.

## Decision

Two repositories, two pipelines, one direction of dependency.

| Repository | Visibility | Role |
| --- | --- | --- |
| `intochat/os`, renamed from `digitalbrain` | public, MIT | runtime, Framework, Platform authorities, generic modules, Flutter workspace, `features/os` |
| `intochat/platform`, renamed from `cloud` | private | portal, accounts, billing, provisioning, hosted distribution, customer apps and connectors |
| `intochat/digitalbrain.docs` | public, unchanged | handbook; `reference/repositories.md` updated to the new names |

Platform consumes os only through released NuGet packages and container images. Platform never references os source. Os never references platform. `intochat/intochat` and `intochat/Projects` are out of scope.

GitHub keeps redirects for renamed repositories, so existing clones continue to work until remotes are updated. Local folders are renamed to match at the same time to keep sessions and documentation paths honest.

## What moves from os to platform

| Item | From | To |
| --- | --- | --- |
| SvLoans, CustomerResearcher, WordCount | `features/intochat/*` | `platform/features/intochat/*` |
| Monnet, Equifax, RiskSeal, Twilio modules with their `tests/` | `src/DigitalBrain.Modules/<Name>/` | `platform/src/Modules/<Name>/` |
| Four Aspire.Hosting project references | `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` lines 25 to 28 | the platform Distribution AppHost |
| Commented SV lines | `OsCatalog.cs` BuiltIn list | deleted |

The moved modules change their `ProjectReference` to `DigitalBrain` and `DigitalBrain.Framework` into `PackageReference`. Everything else about them stays as it is.

Platform gains a `src/Distribution` AppHost project. It calls `AddOperatingSystem()` from the os packages and then `AddModule` for each private module. This is the "distribution is a diff against the composition" model the catalog already describes, so no public code learns about private modules.

## Versioning and package flow

- The os version is the `VERSION` file. A git tag `v<VERSION>` is a release.
- Master builds push `<VERSION>-pre.<run number>` packages to GitHub Packages under the `intochat` organisation.
- A tag pushes stable packages to the same feed and pushes the `digitalbrain-kernel` and `digitalbrain-csharp-sandbox` images to `ghcr.io/intochat/`, tagged with the version and `latest`. Docker Hub is no longer used.
- Platform pins a single `DigitalBrainVersion` property in `Directory.Packages.props` and one image digest for the hosted runtime. Bumping either is an ordinary pull request.
- Both repositories carry a `global.json` with the same SDK pin. Cloud currently floats on `11.0.x` in its workflows; that stops.
- nuget.org is deferred until there is a public SDK story. Nothing in this plan reserves a package prefix.

## os CI/CD

| Workflow | Trigger | Content |
| --- | --- | --- |
| `ci.yml` | pull request, master | restore, `dotnet format` check, build, unit tests, architecture tests |
| `flutter.yml` | pull request, master | analyze, test, web build, as today |
| `e2e.yml` | master, nightly | the two Docker image warm-ups and the E2E suite, moved out of the PR path |
| `publish.yml` | master | pack and push prerelease packages |
| `release.yml` | tag `v*` | pack and push stable packages, build and push both images |

No Azure step remains in os. Deployment of the hosted runtime belongs to platform, which already owns provisioning in `AzureRuntimeAllocationDriver.cs`. The current 45-minute single job becomes a PR job that does not build containers.

## platform CI/CD

| Workflow | Trigger | Content |
| --- | --- | --- |
| `ci.yml` | pull request, master | .NET build and tests, `npm ci` and build for WebUI, module tests, Distribution AppHost build |
| `preview.yml` | pull request touching `src/IntoChat.Infrastructure/**` or `src/IntoChat.DeploymentKit/**`, manual | Pulumi preview only |
| `deploy-prod.yml` | release | build and push API, Jobs and Distribution images to ACR, upload WebUI static assets, roll out, smoke check |
| `auto-add-to-project.yml` | unchanged | unchanged |

The MiniApp publish steps in `preview.yml` and `deploy-prod.yml` are removed; the project no longer exists and the workflows fail on it today. Restoring os packages uses the workflow `GITHUB_TOKEN` with `packages: read`. Existing Azure OIDC and Pulumi secrets stay.

## Branch rules

Both repositories: `master` protected, pull request required, CI required, linear history, no force push. Os additionally gets a `CODEOWNERS` file and a short `CONTRIBUTING.md` that points to the docs repository. Nothing more is added for the public flip.

## Public history check

Making os public exposes every commit on every branch and tag. Before the flip, run gitleaks over the full history. The SV work was built with fake credentials by decision, but the scan is the evidence, not the decision. If anything real is found the flip waits for a history-rewrite decision, which is out of scope here.

## Order of execution

1. Rename both repositories on GitHub, update local remotes and folder names, update `reference/repositories.md`. No code change.
2. Os: split `ci.yml`, add `e2e.yml`, `publish.yml` and `release.yml`, switch images to GHCR, set `VERSION` to `0.1.0` and cut `v0.1.0` with the SV modules still inside. This proves the package and image flow before anything moves.
3. Platform: add `global.json`, pin os packages at `v0.1.0`, add the Distribution AppHost, remove the MiniApp steps, gate `preview.yml` on paths.
4. Move the SV modules and `features/intochat` into platform, build them against `v0.1.0`, delete them from os, cut `v0.2.0`, bump platform to `v0.2.0`.
5. gitleaks scan of os history, then flip os to public.

Steps 2 and 3 are independent once step 1 is done. Step 4 depends on both. Step 5 depends on step 4.

## Done when

- Platform builds from a clean clone with no os checkout present.
- Os builds and tests from a clean clone with no platform checkout present and contains no `features/intochat` or SV module directory.
- A tagged os release produces packages and images that a platform PR can pin.
- `intochat/os` is public and the gitleaks report for its history is attached to the release that flipped it.

## Out of scope

Portal UI delivery from the design handover, the identity, account and connection model from the concept discussion, nuget.org publication, history rewriting, and any change to the hosted runtime management protocol. Those have their own plans in this handbook.
