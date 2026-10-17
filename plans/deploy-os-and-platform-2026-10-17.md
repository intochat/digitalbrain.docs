# Deploy os and platform: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Releases drive everything: a tagged os release publishes stable packages and three images; platform consumes those packages, builds its own distribution image and deploys to Azure on a GitHub release, never blocked by the test rework.

**Architecture:** Os has two delivery workflows, `publish.yml` (master, prerelease packages) and `release.yml` (tag, stable packages, images, GitHub release); neither runs tests. Platform restores `DigitalBrain.*` from GitHub Packages, hosts the OS in `IntoChat.Distribution`, and `deploy-prod.yml` builds API, Jobs and Distribution images into ACR, uploads the portal, runs Pulumi and smoke checks. The Azure Container App that runs the distribution image is added to the DeploymentKit as the last task.

**Tech Stack:** .NET 11 SDK `11.0.100-rc.1.26425.128`, Aspire 13.6.1, Flutter 3.47.2, GitHub Actions, GitHub Packages, GHCR, Docker Buildx, Pulumi (Azure Native), Azure Container Apps, Azure Container Registry.

**Spec:** `plans/repository-split-2026-10-17.md` (design) and `plans/repository-split-2026-10-17-plan.md` (Tasks 4 to 8 of that plan are superseded by this one where they differ; Tasks 1 to 3 are done).

## State on 2026-10-17 (evidence)

Execution status 2026-10-18: Tasks 1 to 8 implemented and reviewed; os PRs #186, #187; platform PRs #1 to #5 (stacked). Operator steps O1 to O6 and the merge order below are what remains.

- `intochat/os` master `f812121d1`: PR #185 merged. Workflows present: `ci.yml`, `flutter.yml`, `e2e.yml`, `deploy.yml`. `VERSION` = `0.1.0`, `VersionPrefix` reads it, no `VersionSuffix`, NU5104 suppressed. `Container.pubxml` already points at `ghcr.io` / `intochat/digitalbrain-kernel`. `ci` on master is red on 17 pre-existing test failures; format, build and pack are green.
- The kernel does not serve the Flutter web build. No `UseStaticFiles`, `wwwroot` or `build/web` reference exists in the .NET code. Locally Aspire builds `src/DigitalBrain.Modules/Google/Flutter/app/shell/Dockerfile` (nginx, context `app/`) and bind-mounts `/usr/share/nginx/html/config.json` so the kernel URL resolves at serve time (`ShellServedConfig.cs:10`). Production used Azure Static Web Apps with the kernel URL baked in by `--dart-define=DIGITALBRAIN_UI_BASE`.
- Os repo variables: `AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `DOCKERHUB_USERNAME`; secrets `AZURE_STATIC_WEB_APPS_API_TOKEN`, `CHECKPOINT_KEY`, `DOCKERHUB_TOKEN`, `PULUMI_PASSPHRASE`; environment `production` with `AZURE_*`, `AZURE_CONTAINERAPP_NAME`, `AZURE_RESOURCE_GROUP`, `KERNEL_PUBLIC_URL`.
- `intochat/platform` master `24b92f8`: **no repository secrets, no variables, no environments.** Every `deploy-prod` run fails at `azure/login` with empty `client-id`. The prompt's "ACR + OIDC secrets already exist" is true for os, not platform.
- Platform has no `global.json`, no `nuget.config` (both Dockerfiles `COPY nuget.config` and would fail), Dockerfiles on `aspnet:10.0`/`sdk:10.0` with a `RoseXTechnology` feed, `src/IntoChat.MiniApp` still exists on disk and in the solution, Pulumi stack `tripradar-infrastructure` exposes `acrLoginServer`, `resourceGroupName`, `websiteStorageAccountName`, `websiteHost`, `apiHost`, and has Container Apps for api, jobs and bot only. Production defaults to placeholder images (`UsePlaceholderImages`).

## Decisions (ADR style)

### D1. Image topology for os: three images, named after the repository

| Image | Built from | Why it exists | Who pulls it |
| --- | --- | --- | --- |
| `ghcr.io/intochat/os` | `dotnet publish /t:PublishContainer` with `Container.pubxml` | the kernel for self-hosters and for the e2e warm-up; the public face of the runtime | self-hosters, os `e2e.yml`, nobody in platform (platform builds `intochat-distribution` from packages, D4) |
| `ghcr.io/intochat/os-ui` | `src/DigitalBrain.Modules/Google/Flutter/app/shell/Dockerfile`, context `app/` | the kernel does not serve the web build; this nginx image is the only artifact that already exists, is used by Aspire today, and resolves the kernel URL at serve time from `/usr/share/nginx/html/config.json`, so one image serves every deployment | self-hosters, platform's distribution Container App (Task 8) via a sidecar or second app mounting `config.json` |
| `ghcr.io/intochat/os-sandbox` | `src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile`, context repo root | Azure Container Apps session pool image (`CSharpDeployment.cs:87`, setting `sandboxImage`) and the local Aspire sandbox resource | platform's deployment kit (as `sandboxImage`), self-hosters |

Rejected: serving the UI from the kernel (no code does it, and adding static hosting to the kernel is product work outside this plan); keeping Azure Static Web Apps for the UI (bakes the kernel URL into the bundle, so one build serves one deployment, and the SWA token lives on os, which must contain no Azure step). The spec's names `digitalbrain-kernel` and `digitalbrain-csharp-sandbox` are superseded by `os`, `os-ui`, `os-sandbox`; `Container.pubxml` changes one line. Tags: `<VERSION>` and `latest` on every release, nothing on master.

### D2. Registry: GHCR primary, Docker Hub as a post-flip mirror

GHCR works with `GITHUB_TOKEN` and `packages: write`, no secret to rotate, and package visibility follows the repository. Docker Hub is a mirror step (`regctl image copy` or `docker buildx imagetools create`) added to `release.yml` only after os is public and only if wanted for discoverability; it is not in this plan. The `DOCKERHUB_USERNAME` variable and `DOCKERHUB_TOKEN` secret become obsolete in Task 1. While os is private, pulling `ghcr.io/intochat/*` needs a token with `read:packages`; platform's workflows use `GITHUB_TOKEN` of the platform repo, which can read org packages that grant the repo access (operator step O3).

### D3. Versioning: VERSION is truth, tag is release

`VERSION` = `0.1.0` is the only version source. Master: `publish.yml` packs `<VERSION>-pre.<run_number>` and pushes to `https://nuget.pkg.github.com/intochat/index.json`. Tag `v<VERSION>`: `release.yml` guards `v$(VERSION) == $GITHUB_REF_NAME` before any pack, push or login; mismatch exits 1 with both values printed and nothing is published. Images carry `<VERSION>` and `latest`. The GitHub release is created last, with the `.nupkg` files as assets, so a half-finished release leaves no release object. No test step exists in either workflow (prompt constraint: deployment is never blocked by the test rework); `ci.yml` keeps the tests and stays red until the testing workstream fixes them.

### D4. Platform runtime image: platform-built distribution, pinned by package version

Platform builds `intochat-distribution` (os packages + private modules) in `deploy-prod.yml` with `dotnet publish /t:PublishContainer` to ACR, tagged with the release tag. It pins one `DigitalBrainVersion` in `Directory.Packages.props` and never pins an os image digest. `os-ui` and `os-sandbox` are the only os images platform pulls, both by `<VERSION>` tag equal to `DigitalBrainVersion`, so one PR bumps all three.

### D5. Platform deploy: on release published, Azure Container Apps via Pulumi

`deploy-prod.yml` triggers on `release: [published]` and `workflow_dispatch`. It builds API, Jobs and Distribution images to ACR, builds and uploads the WebUI static site, runs `pulumi up` with `IMAGE_TAG = release tag`, and smoke-checks `websiteHost` and `apiHost/health`. The MiniApp publish and upload steps are deleted from both workflows as the prompt and spec require; the `IntoChat.MiniApp` project stays in the solution and keeps building in `ci.yml` (deleting the project is not in scope). `preview.yml` runs only on `src/IntoChat.Infrastructure/**` and `src/IntoChat.DeploymentKit/**`. Tests run in `ci.yml` only; `deploy-prod.yml` has no test step. The distribution Container App (and `os-ui`, `os-sandbox` wiring) is Pulumi work in the DeploymentKit and is the last task, so the API, Jobs and portal deploy is restored first.

## Operator prerequisites (not agent work)

- **O1** Platform secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (same app registration as os), `PULUMI_ACCESS_TOKEN`; variables `PULUMI_STACK=production`, `PULUMI_ESC_ENV` if used. Add a federated credential on the Entra app for subject `repo:intochat/platform:ref:refs/tags/*` or `repo:intochat/platform:environment:production` (OIDC subjects name the repository; the rename changed the os subject too).
- **O2** Delete from os after Task 1 merges: variables `AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `DOCKERHUB_USERNAME`; secrets `AZURE_STATIC_WEB_APPS_API_TOKEN`, `DOCKERHUB_TOKEN`; environment `production` (`AZURE_CONTAINERAPP_NAME`, `AZURE_RESOURCE_GROUP`, `KERNEL_PUBLIC_URL`). `CHECKPOINT_KEY` and `PULUMI_PASSPHRASE` are unknown to any os workflow; confirm before deleting.
- **O3** After the first `publish.yml` run: in GitHub Packages settings of each `DigitalBrain*` package and each container, grant repository `intochat/platform` read access (org packages are private while os is private). `gh api` cannot do this with the current token scopes.
- **O4** Tag `v0.1.0` after Task 3; create a platform GitHub release after Task 7.
- **O5** Pulumi production stack config before the first `pulumi preview`/`up` with the distribution app: `pulumi config set --secret tripradar:ghcrReadToken <PAT with read:packages>` (the os images are private until the public flip; remove the check and the config after it) and `pulumi config set tripradar:usePlaceholderImages false` (the default `true` would run the placeholder image behind the distribution ingress and fail the `/health` smoke check). The bootstrap `pulumi up` with `IMAGE_TAG=bootstrap` predates this plan for api and jobs and now also applies to the distribution; expect it to point at non-existent `:bootstrap` tags until a real tag is rolled out in the second phase.
- **O6** After `v0.1.0` exists: `docker run --rm ghcr.io/intochat/os-ui:0.1.0 ls /usr/share/nginx/html | grep -c config.json` must print `0` (Review Focus 3), and Task 6 must be re-verified against the real feed (`dotnet restore IntoChat.slnx` on a clean clone of platform with `NUGET_GITHUB_*` set), because it was verified against a local pack of os.
- **Merge order** (platform): PR #1 (Task 4) → PR #4 (Task 6) → PR #2 (Task 5) → PR #3 (Task 7) → PR #5 (Task 8). PR #3's `deploy-prod.yml` publishes `src/IntoChat.Distribution`, which exists only after PR #4. PR #4 and PR #5 both insert into `IntoChat.slnx` after the DeploymentKit line; keep both hunks. Os: PR #186 then PR #187, in any order.

## Global Constraints

- Repos: `E:/intochat/os` = `intochat/os` (private), `E:/intochat/platform` = `intochat/platform` (private), plans only in `E:/intochat/digitalbrain.docs`.
- Feed `https://nuget.pkg.github.com/intochat/index.json`; registry `ghcr.io/intochat/`; images `os`, `os-ui`, `os-sandbox`; platform image `intochat-distribution` in ACR.
- SDK pin in both repos: `11.0.100-rc.1.26425.128`, `rollForward: latestFeature`, `allowPrerelease: true`.
- No test step in `publish.yml`, `release.yml`, `deploy-prod.yml`. Build and pack failures must still fail those workflows.
- Never push master or tags; one branch and PR per task; commit explicit files only; `warnings are errors`; central package versions; do not run the product locally; kill any local command over 5 minutes and report.
- Action versions already in use and to reuse: `actions/checkout@v7`, `actions/setup-dotnet@v6`, `actions/cache/restore@v6`, `docker/login-action@v4`, `azure/login@v3`, `subosito/flutter-action@v2`.

## Review Focus

1. A tag `v0.2.0` on a commit whose `VERSION` is `0.1.0` must stop `release.yml` before login or pack; nothing appears on the feed or GHCR. (Task 1, guard step first in the job.)
2. `publish.yml` with `--skip-duplicate` must not mask a pack failure: pack and push are separate steps, pack failure fails the job. (Task 1.)
3. `os-ui` built in CI must not contain a `config.json`; a stale one would silently point every deployment at a dev kernel. (Task 1, verification lists the image root.)
4. Platform restore with no `NUGET_GITHUB_TOKEN` must fail within a minute naming `nuget.pkg.github.com/intochat`, not fall through to nuget.org. (Task 4.)
5. `deploy-prod.yml` must not run `pulumi up` when any image build failed; steps are sequential and no `continue-on-error`. (Task 7.)

---

## Task 1: os `publish.yml`, `release.yml`, delete `deploy.yml`

**Files:**
- Create: `E:/intochat/os/.github/workflows/publish.yml`
- Create: `E:/intochat/os/.github/workflows/release.yml`
- Delete: `E:/intochat/os/.github/workflows/deploy.yml`
- Modify: `E:/intochat/os/src/DigitalBrain.OS/DigitalBrain.OS/Properties/PublishProfiles/Container.pubxml` (`ContainerRepository` → `intochat/os`; header comment names `release.yml`)
- Modify: `E:/intochat/os/Directory.Build.props` (comment that names `deploy.yml` → `release.yml`)

**Interfaces:**
- Produces: packages `<Id>.<VERSION>-pre.<run_number>` on master; `<Id>.<VERSION>` plus images `ghcr.io/intochat/os:<VERSION>|latest`, `ghcr.io/intochat/os-ui:<VERSION>|latest`, `ghcr.io/intochat/os-sandbox:<VERSION>|latest` and a GitHub release with `.nupkg` assets on tag `v<VERSION>`.

- [ ] **Step 1: Branch** `git -C /e/intochat/os switch -c deploy/task-1-release-workflows master`

- [ ] **Step 2: `publish.yml`**

`name: publish`; `on: push: branches: [master]`; `permissions: {contents: read, packages: write}`; `concurrency: publish-master` (no cancel); env `DOTNET_NOLOGO`, `DOTNET_SKIP_FIRST_TIME_EXPERIENCE` as in `ci.yml`. Job `publish`, `timeout-minutes: 30`: checkout (fetch-depth 0), setup-dotnet with `global-json-file: global.json`, NuGet cache restore as in `ci.yml`, `dotnet restore DigitalBrain.slnx`, `dotnet pack DigitalBrain.slnx -c Release --no-restore -o artifacts -p:CodeGraphRefresh=false -p:VersionSuffix=pre.${{ github.run_number }}`, then a separate step:

```bash
dotnet nuget push "artifacts/*.nupkg" --source https://nuget.pkg.github.com/intochat/index.json --api-key "${GITHUB_TOKEN}" --skip-duplicate
```

with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. No test step.

- [ ] **Step 3: `release.yml`**

`name: release`; `on: push: tags: ['v*']`; `permissions: {contents: write, packages: write}`. Job `release`, `timeout-minutes: 60`, steps in this order:

1. checkout, fetch-depth 0.
2. `Guard tag matches VERSION` (before anything else):
   ```bash
   version="$(tr -d '[:space:]' < VERSION)"
   [ "v${version}" = "${GITHUB_REF_NAME}" ] || { echo "::error::tag ${GITHUB_REF_NAME} does not match VERSION ${version}"; exit 1; }
   echo "version=${version}" >> "$GITHUB_OUTPUT"
   ```
   step `id: version`.
3. setup-dotnet, free disk space (copy the step from `e2e.yml`), restore.
4. `dotnet pack DigitalBrain.slnx -c Release --no-restore -o artifacts -p:CodeGraphRefresh=false`.
5. `dotnet nuget push` as in publish.yml.
6. `docker/login-action@v4` with `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`.
7. Kernel image: `dotnet publish src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -c Release -r linux-x64 /t:PublishContainer -p:PublishProfile=Container -p:EnableSdkContainerSupport=true -p:CodeGraphRefresh=false "-p:ContainerImageTags=${VERSION};latest"` with `VERSION: ${{ steps.version.outputs.version }}`. Registry and repository come from the pubxml.
8. UI image: `docker build -f src/DigitalBrain.Modules/Google/Flutter/app/shell/Dockerfile -t ghcr.io/intochat/os-ui:${VERSION} -t ghcr.io/intochat/os-ui:latest src/DigitalBrain.Modules/Google/Flutter/app && docker push --all-tags ghcr.io/intochat/os-ui`.
9. Sandbox image: `docker build -f src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile -t ghcr.io/intochat/os-sandbox:${VERSION} -t ghcr.io/intochat/os-sandbox:latest . && docker push --all-tags ghcr.io/intochat/os-sandbox`.
10. `gh release create "${GITHUB_REF_NAME}" --generate-notes --title "${GITHUB_REF_NAME}" artifacts/*.nupkg` with `GH_TOKEN: ${{ github.token }}`.

- [ ] **Step 4: `git rm .github/workflows/deploy.yml`**; update `Container.pubxml` `ContainerRepository` to `intochat/os` and its header comment; update the `Directory.Build.props` comment that mentions `deploy.yml`.

- [ ] **Step 5: Verify locally**

Run: `actionlint .github/workflows/publish.yml .github/workflows/release.yml` (install with `go install github.com/rhysd/actionlint/cmd/actionlint@latest` or `npx -y actionlint`); expected: no output.
Run: `dotnet msbuild src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -getProperty:ContainerRepository -p:PublishProfile=Container -p:EnableSdkContainerSupport=true`; expected `intochat/os`.
Run: `grep -rn "digitalbrain-kernel\|digitalbrain-csharp-sandbox\|deploy.yml" --include=*.yml --include=*.props --include=*.pubxml --include=*.cs . | grep -v /obj/`; expected: only `src/DigitalBrain.OS/DigitalBrain.OS/Dockerfile` comments and `CSharpModuleHosting` local resource names; fix any workflow or props hit.
Run: `VERSION=0.1.0; echo "v0.1.0" | grep -qx "v${VERSION}" && echo guard-ok`; expected `guard-ok`; then with `0.2.0` expected no output (guard logic sanity).

- [ ] **Step 6: Commit and PR**

```bash
git add .github/workflows/publish.yml .github/workflows/release.yml .github/workflows/deploy.yml src/DigitalBrain.OS/DigitalBrain.OS/Properties/PublishProfiles/Container.pubxml Directory.Build.props
git commit -m "ci: publish prerelease packages on master; packages, images and GitHub release on tags"
git push -u origin deploy/task-1-release-workflows
gh pr create --fill --body-file <body>
```

PR body lists obsolete os settings (O2) and states that `ci` is red on pre-existing tests and is not a gate for this PR. Expected after merge: `gh workflow list --repo intochat/os` shows `ci, flutter, e2e, publish, release`; `publish` run on master succeeds; feed lists `DigitalBrain.OS 0.1.0-pre.<n>` (check with `dotnet nuget list`? No: use `gh api /orgs/intochat/packages?package_type=nuget` once the operator token has `read:packages`, or the Packages tab).

## Task 2: Review-focus 3 check and e2e warm-up uses the new image names

**Files:**
- Modify: `E:/intochat/os/.github/workflows/e2e.yml` (only if it pulls or tags `digitalbrain-kernel` / `csharp-sandbox` images)
- Modify: `E:/intochat/os/src/DigitalBrain.OS/DigitalBrain.OS/Dockerfile` comments (path and image name)

- [ ] **Step 1:** `grep -n "docker\|image" .github/workflows/e2e.yml`; rename any registry image to `ghcr.io/intochat/os*`; local build tags stay.
- [ ] **Step 2:** `docker build -f src/DigitalBrain.Modules/Google/Flutter/app/shell/Dockerfile -t os-ui:check src/DigitalBrain.Modules/Google/Flutter/app && docker run --rm os-ui:check ls /usr/share/nginx/html | grep -c config.json`; expected `0` (Review Focus 3). Allowed to exceed 5 minutes once because the Flutter SDK download is the bulk; if it does, report the time and skip, the CI run proves it instead.
- [ ] **Step 3:** Commit `ci: e2e and kernel Dockerfile use the os image names` on the Task 1 branch if Task 1 is unmerged, else a new branch `deploy/task-2-image-names`.

## Task 3: os public-repository files, operator cuts v0.1.0

**Files:**
- Create: `E:/intochat/os/README.md`, `E:/intochat/os/CONTRIBUTING.md`, `E:/intochat/os/.github/CODEOWNERS`
- Modify: `E:/intochat/os/.github/dependabot.yml`

- [ ] **Step 1:** README: one paragraph (repo description "Runtime for AI apps and agents"), `dotnet run digitalbrain.cs`, feed URL, the three image names with `docker pull` lines, link to `https://github.com/intochat/digitalbrain.docs`. CONTRIBUTING: PRs against `master`, CI must pass, product discussion in the docs repo. CODEOWNERS: `* @intochat/maintainers`. dependabot `pub` directories: `/src/DigitalBrain.Modules/Google/Flutter/app/core`, `/ui`, `/shell`.
- [ ] **Step 2:** `for d in core ui shell; do test -f src/DigitalBrain.Modules/Google/Flutter/app/$d/pubspec.yaml && echo ok $d; done` → three `ok`.
- [ ] **Step 3:** Commit `repo: public-facing README, contributing, code owners, dependabot paths` on `deploy/task-3-repo-files`, PR.
- [ ] **Step 4 (OPERATOR):** after merge, `git -C /e/intochat/os tag v0.1.0 master && git -C /e/intochat/os push origin v0.1.0`. Expected: `gh run list --repo intochat/os --workflow release --limit 1` success; `gh release view v0.1.0 --repo intochat/os` lists `.nupkg`; `docker manifest inspect ghcr.io/intochat/os:0.1.0`, `os-ui:0.1.0`, `os-sandbox:0.1.0` succeed (with `docker login ghcr.io`).

## Task 4: platform restores os packages

**Files:**
- Create: `E:/intochat/platform/global.json`, `E:/intochat/platform/nuget.config`
- Modify: `E:/intochat/platform/Directory.Packages.props`, `src/IntoChat.Server.API/Dockerfile`, `src/IntoChat.Server.Jobs.API/Dockerfile`, `src/IntoChat.Server.Db/Dockerfile` (line 15 RoseXTechnology), `README.md` prerequisites

**Interfaces:**
- Produces: `DigitalBrainVersion` property; `PackageVersion` for `DigitalBrain`, `DigitalBrain.Framework`, `DigitalBrain.Platform`, `DigitalBrain.OS`, `DigitalBrain.Aspire.Server`, `DigitalBrain.Aspire.Hosting`, `DigitalBrain.ServiceDefaults`, `DigitalBrain.Testing` at `$(DigitalBrainVersion)`; source `intochat` with mapping `DigitalBrain` and `DigitalBrain.*`; env vars `NUGET_GITHUB_USERNAME`, `NUGET_GITHUB_TOKEN`.

- [ ] **Step 1:** `global.json` copied verbatim from os. `nuget.config` as in the split plan Task 6 step 2.
- [ ] **Step 2:** `Directory.Packages.props`: `<DigitalBrainVersion>0.1.0</DigitalBrainVersion>` and the eight items.
- [ ] **Step 3:** Dockerfiles: bases `mcr.microsoft.com/dotnet/aspnet:11.0.0-rc.1` and `mcr.microsoft.com/dotnet/sdk:11.0.100-rc.1`; remove `dotnet nuget add source ... RoseXTechnology`; after the `ARG NUGET_GITHUB_USERNAME`/`TOKEN` lines add `ENV NUGET_GITHUB_USERNAME=$NUGET_GITHUB_USERNAME` and `ENV NUGET_GITHUB_TOKEN=$NUGET_GITHUB_TOKEN`; keep `COPY nuget.config`. Db Dockerfile: same source removal.
- [ ] **Step 4:** README prerequisites: `NUGET_GITHUB_USERNAME` = GitHub login, `NUGET_GITHUB_TOKEN` = classic PAT with `read:packages`.
- [ ] **Step 5:** Verify: `dotnet restore IntoChat.slnx` with the two vars unset → fails within one minute, error names `nuget.pkg.github.com/intochat` (Review Focus 4). With vars set → `dotnet restore IntoChat.slnx && dotnet build IntoChat.slnx -c Release --no-restore` succeeds (nothing references DigitalBrain yet). If the package feed is not readable yet because O3 is pending, record the exact error and continue; Task 6 re-verifies.
- [ ] **Step 6:** Commit on `deploy/task-4-os-packages`: `build: pin SDK and restore DigitalBrain packages from GitHub Packages`; PR.

## Task 5: platform `ci.yml` and path-gated `preview.yml`

**Files:**
- Create: `E:/intochat/platform/.github/workflows/ci.yml`
- Modify: `E:/intochat/platform/.github/workflows/preview.yml`

- [ ] **Step 1:** `ci.yml` per split plan Task 8 step 1 (job `ci`, `packages: read`, `NUGET_GITHUB_USERNAME: ${{ github.actor }}`, `NUGET_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, restore, build, test, `npm ci && npm run build`). The test step is `continue-on-error: false`; `ci` is a PR check, not a deploy gate.
- [ ] **Step 2:** `preview.yml`: `on.pull_request.paths: ['src/IntoChat.Infrastructure/**', 'src/IntoChat.DeploymentKit/**']` plus `workflow_dispatch`; `setup-dotnet` `global-json-file: global.json`; delete the MiniApp publish step; delete the `dotnet build src/IntoChat.Server.API` line (CI covers it).
- [ ] **Step 3:** `actionlint .github/workflows/ci.yml .github/workflows/preview.yml` → no output.
- [ ] **Step 4:** Commit on `deploy/task-5-platform-ci`: `ci: build and test on PR; pulumi preview only on infra paths`; PR. Expected: `ci` runs; `preview` does not.

## Task 6: `IntoChat.Distribution` host and AppHost

Exactly split plan Task 7 (test `DistributionCompositionFacts`, `IntoChat.Distribution` web project with `AddOperatingSystem()`, `Container.pubxml` with `ContainerRepository=intochat-distribution`, `IntoChat.Distribution.AppHost`, `features/.gitkeep`, solution entries). Additional pins:

- `Container.pubxml`: no `ContainerRegistry` (passed at deploy time), `ContainerBaseImage=mcr.microsoft.com/dotnet/aspnet:11.0.0-rc.1`, port `8080/tcp`, env `DigitalBrain__Modules__apps__Options__Features=features`.
- Branch `deploy/task-6-distribution`; commit `feat(distribution): host the OS from released packages`.
- Verify: `dotnet test src/IntoChat.Distribution.Tests` PASS; `dotnet build src/IntoChat.Distribution.AppHost -c Release` succeeds; `dotnet publish src/IntoChat.Distribution/IntoChat.Distribution.csproj -c Release -r linux-x64 /t:PublishContainer -p:PublishProfile=Container -p:EnableSdkContainerSupport=true -p:ContainerRegistry= -p:ContainerImageTags=local` produces local image `intochat-distribution:local` (`docker image ls intochat-distribution`).

## Task 7: platform `deploy-prod.yml` on release

**Files:**
- Modify: `E:/intochat/platform/.github/workflows/deploy-prod.yml`

- [ ] **Step 1:** `on: release: types: [published]` and `workflow_dispatch`; `permissions: {id-token: write, contents: read, packages: read}`; env `IMAGE_TAG: ${{ github.event.release.tag_name || github.sha }}`, `NUGET_GITHUB_USERNAME: ${{ github.actor }}`, `NUGET_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; `setup-dotnet` with `global-json-file`; `azure/login@v3`.
- [ ] **Step 2:** Delete: MiniApp publish, `Enable miniapp static host`, miniapp upload, miniapp smoke line, `miniapp_storage`/`miniapp_host` output reads. Keep the two `pulumi up` phases.
- [ ] **Step 3:** After the Jobs image step add `docker/login-action@v4` is not needed (az acr login already present); add:
   ```bash
   dotnet publish src/IntoChat.Distribution/IntoChat.Distribution.csproj -c Release -r linux-x64 /t:PublishContainer -p:PublishProfile=Container -p:EnableSdkContainerSupport=true "-p:ContainerRegistry=${ACR_LOGIN_SERVER}" "-p:ContainerImageTags=${IMAGE_TAG}"
   ```
   with `ACR_LOGIN_SERVER: ${{ steps.outputs.outputs.acr_login_server }}`.
- [ ] **Step 4:** No test step anywhere in the file; `grep -n "dotnet test\|continue-on-error" .github/workflows/deploy-prod.yml` → no output (Review Focus 5). `actionlint` → no output.
- [ ] **Step 5:** Commit on `deploy/task-7-deploy-on-release`: `ci: deploy API, Jobs, Distribution and portal on GitHub release`; PR body lists O1 as the blocker for the first green run and notes `tripradar-api`/`tripradar-jobs` image names stay until the Pulumi stack renames them.
- [ ] **Step 6 (OPERATOR):** after O1 and merge, `gh release create v0.1.0 --repo intochat/platform --generate-notes`; expected `deploy-prod` green, `curl https://<apiHost>/health` 200, `az acr repository show-tags -n <acr> --repository intochat-distribution` lists `v0.1.0`.

## Task 8: distribution Container App in the DeploymentKit

**Files:**
- Modify: `E:/intochat/platform/src/IntoChat.DeploymentKit/Services/ContainerAppsService.cs` (add a `distribution` app next to api/jobs/bot), `TripRadarServerConstants.cs` (`DistributionImagePrefix = "intochat-distribution"`, `OsVersion` from env `DIGITALBRAIN_VERSION`), `TripRadarDeploymentConfiguration.cs` (`DistributionImageTag`, `UiImage = ghcr.io/intochat/os-ui:<OsVersion>`, `SandboxImage = ghcr.io/intochat/os-sandbox:<OsVersion>`), `src/IntoChat.Infrastructure/Program.cs` (output `distributionHost`), `.github/workflows/deploy-prod.yml` (env `DIGITALBRAIN_VERSION` read from `Directory.Packages.props`, smoke `https://<distributionHost>/health`)
- Test: `E:/intochat/platform/src/IntoChat.Server.Tests/...` or a new `IntoChat.DeploymentKit.Tests` facts: `DistributionImageTagUsesImageTag`, `UiAndSandboxImagesPinOsVersion`.

- [ ] **Step 1:** Failing tests for the two facts.
- [ ] **Step 2:** Implement: external ingress 8080, min replicas 1, env `DigitalBrain__Modules__apps__Options__Features=features`, registry credentials from the existing ACR identity; `os-ui` as a second container in the same app serving port 80 with a `config.json` mounted from a secret/volume holding `{"uiBase": "https://<distributionHost>"}` (check `DigitalBrainHostEnv.loadServedConfig` in `app/core` for the exact key). GHCR pull needs a registry credential while os is private: a `ghcr` registry entry with username `intochat` and a `read:packages` PAT secret `GHCR_READ_TOKEN` (operator adds; documented in PR). After the public flip this credential is removed.
- [ ] **Step 3:** `dotnet test` the facts PASS; `dotnet build src/IntoChat.Infrastructure -c Release` succeeds; push to a branch touching `src/IntoChat.DeploymentKit/**` so `preview.yml` runs and shows the new Container App in `pulumi preview`.
- [ ] **Step 4:** Commit on `deploy/task-8-distribution-app`: `feat(infra): distribution container app with os-ui sidecar and sandbox image pin`; PR.

## Done when

- A tagged os release yields `DigitalBrain.* <VERSION>` on the feed, `ghcr.io/intochat/os|os-ui|os-sandbox:<VERSION>`, and a GitHub release with assets, with no test step on the path.
- Platform builds from a clean clone with no os checkout, with `NUGET_GITHUB_*` set.
- A platform GitHub release deploys API, Jobs, portal and the distribution image; `pulumi preview` shows the distribution Container App.
- Os has no Azure or Docker Hub step; obsolete settings are listed for the operator.
