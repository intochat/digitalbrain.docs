# Repository Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `intochat/digitalbrain` into the public `intochat/os` and `intochat/cloud` into the private `intochat/platform`, each with its own CI/CD, with platform consuming os only through released packages and images.

**Architecture:** Os publishes NuGet packages to GitHub Packages and container images to GHCR on master (prerelease) and on tags (stable). Platform pins one `DigitalBrainVersion`, hosts a `Distribution` web project that calls `AddOperatingSystem()` from the packages and adds the private modules, and builds its own distribution image in its deploy workflow. The SV modules and `features/intochat` move from os to platform once the package flow is proven.

**Tech Stack:** .NET 11 SDK `11.0.100-rc.1.26425.128`, Aspire 13.6.1, GitHub Actions, GitHub Packages (NuGet), GHCR, Flutter 3.47.2, Pulumi (platform infra, unchanged), gitleaks.

**Spec:** `E:/intochat/digitalbrain.docs/plans/repository-split-2026-10-17.md`

## Global Constraints

- Repository names after rename: `intochat/os` (public, MIT) and `intochat/platform` (private). `intochat/digitalbrain.docs` unchanged.
- Local folders after rename: `E:/intochat/os` and `E:/intochat/platform`. `E:/intochat/intochat-cloud` is an older dirty checkout on `codex/cloud-migration`; do not touch it.
- Platform never has a `ProjectReference` or submodule into os. Os never references platform.
- Package feed: `https://nuget.pkg.github.com/intochat/index.json`. Image registry: `ghcr.io/intochat/`. No Docker Hub, no nuget.org.
- Os version source is the `VERSION` file; a tag is `v<VERSION>`. Master packages are `<VERSION>-pre.<run_number>`.
- Both repos pin the same SDK in `global.json`: `11.0.100-rc.1.26425.128`, `rollForward: latestFeature`, `allowPrerelease: true`.
- Warnings are errors, nullable enabled, central package versions in both repos.
- Commit explicit files only (`git add <paths>`), never a directory, in every task.
- No step in this plan runs the product, wipes state or rewrites history.
- The hosted runtime image is the platform-built `intochat-distribution` image (os packages plus private modules). The os `digitalbrain-kernel` image is for self-hosters; platform pins os by `DigitalBrainVersion`, not by kernel image digest. This refines the spec's "one image digest" line.
- Operator-only actions (repo rename, visibility flip, tagging a release, branch protection) are marked **OPERATOR** and are performed by the user, not an agent.

## Review Focus

1. A tag whose version does not equal `VERSION` must fail `release.yml` before anything is pushed, not publish a mismatched package. (Task 4)
2. The existing `VersionSuffix=alpha.1` in `Directory.Build.props` sorts above `pre.N` in NuGet ordering only if removed; a leftover suffix makes master packages look older than a stale local pack. (Task 2)
3. Packing `DigitalBrain.OS` (a `Microsoft.NET.Sdk.Web` exe) must not pack the linked `features/**` items or fail NU5039 on the icon. (Task 2)
4. `dotnet test` with the E2E skip property must still run `DigitalBrain.OS.Tests.Unit`; a wrong condition silently drops the unit suite. (Task 3)
5. A platform developer with no `GITHUB_TOKEN` must get a clear restore error naming the feed, not a hang or a fallback to nuget.org. (Task 6)

---

## Phase A: rename (spec step 1)

### Task 1: Rename repositories, remotes, folders and the docs reference

**Files:**
- Modify: `E:/intochat/digitalbrain.docs/reference/repositories.md`
- Modify: `E:/intochat/digitalbrain.docs/README.md` (only lines naming `intochat/digitalbrain` or `intochat/cloud`)
- Modify: `E:/intochat/digitalbrain/CLAUDE.md` line 3 (sibling path stays `E:/intochat/digitalbrain.docs`; no change unless it names the product repo)

**Interfaces:**
- Produces: remotes `https://github.com/intochat/os.git` and `https://github.com/intochat/platform.git`; local folders `E:/intochat/os`, `E:/intochat/platform`.

- [ ] **Step 1: OPERATOR renames both repositories**

```bash
gh repo rename os --repo intochat/digitalbrain --yes
```

```bash
gh repo rename platform --repo intochat/cloud --yes
```

Expected: `gh repo view intochat/os --json name` and `gh repo view intochat/platform --json name` print the new names.

- [ ] **Step 2: Rename local folders and remotes**

Close every session and process using the two folders first (memory: kill `DigitalBrain*` processes before touching the tree).

```bash
mv /e/intochat/digitalbrain /e/intochat/os && git -C /e/intochat/os remote set-url origin https://github.com/intochat/os.git
```

```bash
mv /e/intochat/cloud /e/intochat/platform && git -C /e/intochat/platform remote set-url origin https://github.com/intochat/platform.git
```

Expected: `git -C /e/intochat/os fetch --dry-run` and `git -C /e/intochat/platform fetch --dry-run` succeed with no output.

- [ ] **Step 3: Update the handbook repository reference**

In `reference/repositories.md`: change the table rows to `intochat/platform` (was `intochat-cloud`) and `intochat/os` (was `digitalbrain`); add one sentence that GitHub redirects the old names and that the split plan is `plans/repository-split-2026-10-17.md`. In `README.md` replace `intochat/digitalbrain` with `intochat/os` and `intochat/cloud` with `intochat/platform` where they appear as repository names. Historical files under `plans/intochat-cloud-*.md`, `assessment/` and `readiness/` keep their original names as dated evidence.

- [ ] **Step 4: Verify no live link points at the old names**

Run: `grep -rn "github.com/intochat/digitalbrain\|github.com/intochat/cloud" /e/intochat/digitalbrain.docs --include=*.md | grep -v node_modules | grep -v archive | grep -v "plans/intochat-cloud-\|assessment/\|readiness/"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git -C /e/intochat/digitalbrain.docs add reference/repositories.md README.md && git -C /e/intochat/digitalbrain.docs commit -m "docs: repositories are intochat/os and intochat/platform"
```

- [ ] **Step 6: OPERATOR sets branch protection on both repos**

For each of `intochat/os` and `intochat/platform`:

```bash
gh api -X PUT repos/intochat/os/branches/master/protection --input - <<'EOF'
{"required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}
EOF
```

Expected: `gh api repos/intochat/os/branches/master/protection --jq .required_linear_history.enabled` prints `true`. The `ci` context name matches the job name set in Task 3 and Task 8.

---

## Phase B: os packaging and pipelines (spec step 2)

### Task 2: VERSION file drives package and image versions; the OS host is packable

**Files:**
- Modify: `E:/intochat/os/VERSION` (content `0.1.0`)
- Modify: `E:/intochat/os/Directory.Build.props` lines 19-32
- Modify: `E:/intochat/os/src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj`
- Modify: `E:/intochat/os/src/DigitalBrain.OS/DigitalBrain.OS/Properties/PublishProfiles/Container.pubxml`
- Test: `E:/intochat/os/src/Testing/DigitalBrain.Architecture.Tests/PackagingFacts.cs` (create)

**Interfaces:**
- Produces: MSBuild property `VersionPrefix` equal to the trimmed `VERSION` file; `VersionSuffix` empty unless passed on the command line; package `DigitalBrain.OS` containing `lib/net11.0/DigitalBrain.OS.dll`; container repository `intochat/digitalbrain-kernel`.

- [ ] **Step 1: Write the failing architecture test**

```csharp
public sealed class PackagingFacts
{
    [Fact]
    public void VersionPrefixEqualsVersionFile()
    {
        var root = RepositoryRoot.Find();
        var version = File.ReadAllText(Path.Combine(root, "VERSION")).Trim();
        var props = File.ReadAllText(Path.Combine(root, "Directory.Build.props"));
        Assert.Contains("<VersionPrefix>$(DigitalBrainVersion)</VersionPrefix>", props);
        Assert.DoesNotContain("<VersionSuffix>", props);
        Assert.Matches(@"^\d+\.\d+\.\d+$", version);
    }

    [Fact]
    public void OsHostIsPackableWithoutFeatures()
    {
        var csproj = File.ReadAllText(Path.Combine(RepositoryRoot.Find(), "src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj"));
        Assert.Contains("<IsPackable>true</IsPackable>", csproj);
        Assert.Contains("Pack=\"false\"", csproj);
    }
}
```

`RepositoryRoot.Find()` walks up from `AppContext.BaseDirectory` until a directory containing `DigitalBrain.slnx`; add it to the same file if the test project has no such helper.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test src/Testing/DigitalBrain.Architecture.Tests -c Release -- --filter-class "*PackagingFacts*"` (from `E:/intochat/os`)
Expected: both facts FAIL.

- [ ] **Step 3: Implement**

`VERSION`: `0.1.0`.

`Directory.Build.props`: replace `<VersionPrefix>0.1.0</VersionPrefix>` and `<VersionSuffix>alpha.1</VersionSuffix>` with

```xml
<DigitalBrainVersion>$([System.IO.File]::ReadAllText('$(MSBuildThisFileDirectory)VERSION').Trim())</DigitalBrainVersion>
<VersionPrefix>$(DigitalBrainVersion)</VersionPrefix>
```

Change `PackageProjectUrl` and `RepositoryUrl` to `https://github.com/intochat/os`.

`DigitalBrain.OS.csproj`: add `<IsPackable>true</IsPackable>` and `<PackageId>DigitalBrain.OS</PackageId>` to the property group; add `Pack="false"` to the `<None Include="../../../features/**/*" ...>` item.

`Container.pubxml`: `ContainerRepository` becomes `intochat/digitalbrain-kernel`; add `<ContainerRegistry>ghcr.io</ContainerRegistry>`.

- [ ] **Step 4: Run the test and a pack to verify**

Run: `dotnet test src/Testing/DigitalBrain.Architecture.Tests -c Release -- --filter-class "*PackagingFacts*"`
Expected: PASS.

Run: `dotnet pack src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -c Release -o artifacts -p:VersionSuffix=pre.0 && unzip -l artifacts/DigitalBrain.OS.0.1.0-pre.0.nupkg`
Expected: lists `lib/net11.0/DigitalBrain.OS.dll` and `icon.png`; lists nothing under `features/`.

- [ ] **Step 5: Commit**

```bash
git add VERSION Directory.Build.props src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj src/DigitalBrain.OS/DigitalBrain.OS/Properties/PublishProfiles/Container.pubxml src/Testing/DigitalBrain.Architecture.Tests/PackagingFacts.cs && git commit -m "build: VERSION file drives package versions; DigitalBrain.OS is packable"
```

### Task 3: Split os CI into a PR job and a master E2E job

**Files:**
- Modify: `E:/intochat/os/Directory.Build.props` (test-project property group, lines 36-45)
- Modify: `E:/intochat/os/.github/workflows/ci.yml`
- Create: `E:/intochat/os/.github/workflows/e2e.yml`
- Create: `E:/intochat/os/.github/workflows/flutter.yml`

**Interfaces:**
- Produces: MSBuild property `DigitalBrainE2E` (default `true`); `-p:DigitalBrainE2E=false` makes every `*.Tests.E2E` project `IsTestProject=false`. Job name `ci` is the required status check from Task 1 step 6.

- [ ] **Step 1: Add the E2E opt-out property**

In `Directory.Build.props`, inside the existing test-project `PropertyGroup`, add:

```xml
<IsTestProject Condition="'$(DigitalBrainE2E)' == 'false' And $(MSBuildProjectName.EndsWith('.Tests.E2E'))">false</IsTestProject>
```

- [ ] **Step 2: Verify the property drops only E2E**

Run: `dotnet msbuild src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -getProperty:IsTestProject -p:DigitalBrainE2E=false` → `false`
Run: `dotnet msbuild src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit -getProperty:IsTestProject -p:DigitalBrainE2E=false` → `true`

- [ ] **Step 3: Rewrite `ci.yml`**

Keep the existing triggers, permissions, concurrency, env, checkout, setup-dotnet with `global-json-file`, free-space, NuGet cache restore and save. The single job is named `ci` with `timeout-minutes: 25` and steps: restore, `dotnet format whitespace DigitalBrain.slnx --verify-no-changes --no-restore --verbosity minimal`, `dotnet build DigitalBrain.slnx -c Release --no-restore -v quiet -p:CodeGraphRefresh=false`, `dotnet pack DigitalBrain.slnx -c Release --no-build -v quiet -o artifacts`, `dotnet test -c Release --no-build -p:DigitalBrainE2E=false`. Remove both Docker warm-up steps and the `flutter-web-build` job.

- [ ] **Step 4: Create `flutter.yml`**

Move the former `flutter-web-build` job unchanged into `flutter.yml` with the same triggers as `ci.yml`, job name `flutter`.

- [ ] **Step 5: Create `e2e.yml`**

Triggers: `push: branches: [master]` and `schedule: - cron: '0 3 * * *'`. One job `e2e`, `timeout-minutes: 60`, same setup steps as `ci`, then the two Docker warm-up steps from the old `ci.yml`, then `dotnet build DigitalBrain.slnx -c Release -v quiet -p:CodeGraphRefresh=false`, then `dotnet test src/DigitalBrain.OS/DigitalBrain.OS.Tests.E2E -c Release --no-build`.

- [ ] **Step 6: Verify locally**

Run: `dotnet test -c Release -p:DigitalBrainE2E=false` from `E:/intochat/os`
Expected: completes under 5 minutes with no `DigitalBrain.OS.Tests.E2E` in the output (memory: kill any run over 5 minutes and debug).

- [ ] **Step 7: Commit and open a PR to observe `ci` and `flutter` green**

```bash
git add Directory.Build.props .github/workflows/ci.yml .github/workflows/e2e.yml .github/workflows/flutter.yml && git commit -m "ci: PR job without containers; E2E on master and nightly"
```

Expected on the PR: checks `ci` and `flutter` pass; `e2e` does not run.

### Task 4: Publish prerelease packages on master and stable packages and images on tags

**Files:**
- Create: `E:/intochat/os/.github/workflows/publish.yml`
- Create: `E:/intochat/os/.github/workflows/release.yml`
- Delete: `E:/intochat/os/.github/workflows/deploy.yml`

**Interfaces:**
- Produces: packages `<Id>.<VERSION>-pre.<run_number>` on master and `<Id>.<VERSION>` on tag `v<VERSION>` at `https://nuget.pkg.github.com/intochat/index.json`; images `ghcr.io/intochat/digitalbrain-kernel:<VERSION>`, `:latest` and `ghcr.io/intochat/digitalbrain-csharp-sandbox:<VERSION>`, `:latest`.

- [ ] **Step 1: Create `publish.yml`**

Trigger `push: branches: [master]`. `permissions: contents: read, packages: write`. Job `publish`: checkout, setup-dotnet with `global-json-file`, restore, `dotnet pack DigitalBrain.slnx -c Release -o artifacts -p:CodeGraphRefresh=false -p:VersionSuffix=pre.${{ github.run_number }}`, then

```bash
dotnet nuget push "artifacts/*.nupkg" --source https://nuget.pkg.github.com/intochat/index.json --api-key ${{ secrets.GITHUB_TOKEN }} --skip-duplicate
```

- [ ] **Step 2: Create `release.yml`**

Trigger `push: tags: ['v*']`. `permissions: contents: write, packages: write`. Job `release`:

1. checkout, setup-dotnet.
2. Guard step:

```bash
test "v$(tr -d '[:space:]' < VERSION)" = "${GITHUB_REF_NAME}" || { echo "tag ${GITHUB_REF_NAME} does not match VERSION $(cat VERSION)"; exit 1; }
```

3. `dotnet pack DigitalBrain.slnx -c Release -o artifacts -p:CodeGraphRefresh=false` and the same `dotnet nuget push` as publish.yml.
4. `docker/login-action@v4` with `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`.
5. Kernel image: the `dotnet publish src/DigitalBrain.OS/DigitalBrain.OS/DigitalBrain.OS.csproj -c Release -r linux-x64 /t:PublishContainer -p:PublishProfile=Container -p:EnableSdkContainerSupport=true` command from the old `deploy.yml`, with `ContainerImageTags: ${{ github.ref_name }};latest` stripped of the leading `v` (`${GITHUB_REF_NAME#v}`), registry and repository now coming from the pubxml.
6. Sandbox image: the old `docker build -f src/DigitalBrain.Modules/Microsoft/CSharp/DigitalBrain.Modules.Microsoft.CSharp.Sandbox/Dockerfile` with tags `ghcr.io/intochat/digitalbrain-csharp-sandbox:${GITHUB_REF_NAME#v}` and `:latest`, then `docker push --all-tags ghcr.io/intochat/digitalbrain-csharp-sandbox`.
7. `gh release create "$GITHUB_REF_NAME" --generate-notes artifacts/*.nupkg` with `GH_TOKEN: ${{ github.token }}`.

- [ ] **Step 3: Delete `deploy.yml`**

```bash
git rm .github/workflows/deploy.yml
```

Azure deployment of the hosted runtime now belongs to platform (Task 8). Record the removed `AZURE_*`, `DOCKERHUB_*` and `KERNEL_PUBLIC_URL` repository variables in the PR description so the operator can delete them.

- [ ] **Step 4: Verify the workflow files parse**

Run: `gh workflow list --repo intochat/os` after the PR merges.
Expected: `ci`, `flutter`, `e2e`, `publish`, `release` listed; `deploy` absent.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/publish.yml .github/workflows/release.yml && git commit -m "ci: publish prerelease packages on master, packages and images on tags"
```

- [ ] **Step 6: Verify the master publish**

After merge: `gh run list --repo intochat/os --workflow publish --limit 1` shows success, and `gh api orgs/intochat/packages?package_type=nuget --jq '.[].name'` lists `DigitalBrain`, `DigitalBrain.Framework`, `DigitalBrain.OS` among others.

### Task 5: Public-repository files and the first release

**Files:**
- Create: `E:/intochat/os/README.md`
- Create: `E:/intochat/os/CONTRIBUTING.md`
- Create: `E:/intochat/os/.github/CODEOWNERS`
- Modify: `E:/intochat/os/.github/dependabot.yml` (pub directories)

- [ ] **Step 1: Write the three files**

`README.md`: one paragraph on what the OS is (the existing repo description "Runtime for AI apps and agents"), the run command `dotnet run digitalbrain.cs`, the package feed URL and image names from Task 4, and a link to `https://github.com/intochat/digitalbrain.docs`. No roadmap, no status (CLAUDE.md: narrative belongs in the docs repo).

`CONTRIBUTING.md`: three lines: PRs against `master`, CI must pass, product discussion happens in the docs repository.

`CODEOWNERS`: `* @intochat/maintainers` (OPERATOR creates the team if absent).

`dependabot.yml`: replace the three `pub` directories with `/src/DigitalBrain.Modules/Google/Flutter/app/core`, `/src/DigitalBrain.Modules/Google/Flutter/app/ui`, `/src/DigitalBrain.Modules/Google/Flutter/app/shell`.

- [ ] **Step 2: Verify dependabot paths exist**

Run: `for d in core ui shell; do test -f src/DigitalBrain.Modules/Google/Flutter/app/$d/pubspec.yaml && echo ok $d; done`
Expected: three `ok` lines.

- [ ] **Step 3: Commit**

```bash
git add README.md CONTRIBUTING.md .github/CODEOWNERS .github/dependabot.yml && git commit -m "repo: public-facing README, contributing and code owners"
```

- [ ] **Step 4: OPERATOR cuts v0.1.0**

```bash
git -C /e/intochat/os tag v0.1.0 master && git -C /e/intochat/os push origin v0.1.0
```

Expected: `gh run list --repo intochat/os --workflow release --limit 1` succeeds; `gh release view v0.1.0 --repo intochat/os` lists `.nupkg` assets; `docker manifest inspect ghcr.io/intochat/digitalbrain-kernel:0.1.0` succeeds.

---

## Phase C: platform consumes os (spec step 3)

### Task 6: Platform restores os packages from GitHub Packages

**Files:**
- Create: `E:/intochat/platform/global.json`
- Create: `E:/intochat/platform/nuget.config`
- Modify: `E:/intochat/platform/Directory.Packages.props`
- Modify: `E:/intochat/platform/src/IntoChat.Server.API/Dockerfile` and `src/IntoChat.Server.Jobs.API/Dockerfile` lines 1-30
- Modify: `E:/intochat/platform/README.md` (prerequisites section)

**Interfaces:**
- Produces: MSBuild property `DigitalBrainVersion` in `Directory.Packages.props`; `PackageVersion` items for `DigitalBrain`, `DigitalBrain.Framework`, `DigitalBrain.Platform`, `DigitalBrain.OS`, `DigitalBrain.Aspire.Server`, `DigitalBrain.Aspire.Hosting`, `DigitalBrain.ServiceDefaults`, `DigitalBrain.Testing`, all at `$(DigitalBrainVersion)`; a package source named `intochat` with source mapping for `DigitalBrain.*`.

- [ ] **Step 1: `global.json`**

Copy `E:/intochat/os/global.json` verbatim.

- [ ] **Step 2: `nuget.config`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="intochat" value="https://nuget.pkg.github.com/intochat/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="intochat"><package pattern="DigitalBrain.*" /><package pattern="DigitalBrain" /></packageSource>
    <packageSource key="nuget.org"><package pattern="*" /></packageSource>
  </packageSourceMapping>
  <packageSourceCredentials>
    <intochat>
      <add key="Username" value="%NUGET_GITHUB_USERNAME%" />
      <add key="ClearTextPassword" value="%NUGET_GITHUB_TOKEN%" />
    </intochat>
  </packageSourceCredentials>
</configuration>
```

- [ ] **Step 3: `Directory.Packages.props`**

Add `<DigitalBrainVersion>0.1.0</DigitalBrainVersion>` to the `PropertyGroup` and the eight `PackageVersion` items listed in Interfaces with `Version="$(DigitalBrainVersion)"`.

- [ ] **Step 4: Dockerfiles**

In both API and Jobs Dockerfiles: base images `mcr.microsoft.com/dotnet/aspnet:11.0.0-rc.1` and `mcr.microsoft.com/dotnet/sdk:11.0.100-rc.1`; delete the `dotnet nuget remove source` and `dotnet nuget add source ... RoseXTechnology ...` lines; the copied `nuget.config` now carries the source and reads the two build args from the environment (`ENV NUGET_GITHUB_USERNAME=$NUGET_GITHUB_USERNAME` after the `ARG` lines, same for the token).

- [ ] **Step 5: README prerequisites**

Add: set `NUGET_GITHUB_USERNAME` to your GitHub login and `NUGET_GITHUB_TOKEN` to a classic PAT with `read:packages` before `dotnet restore`.

- [ ] **Step 6: Verify restore with and without credentials**

Run (no env vars): `dotnet restore IntoChat.slnx`
Expected: fails with an error naming `nuget.pkg.github.com/intochat` and 401, within one minute (Review Focus 5).

Run (env vars set): `dotnet restore IntoChat.slnx && dotnet build IntoChat.slnx -c Release --no-restore`
Expected: succeeds. Nothing references the DigitalBrain packages yet; this proves the feed and mapping only.

- [ ] **Step 7: Commit**

```bash
git add global.json nuget.config Directory.Packages.props src/IntoChat.Server.API/Dockerfile src/IntoChat.Server.Jobs.API/Dockerfile README.md && git commit -m "build: pin SDK and restore DigitalBrain packages from GitHub Packages"
```

### Task 7: Distribution host and AppHost in platform

**Files:**
- Create: `E:/intochat/platform/src/IntoChat.Distribution/IntoChat.Distribution.csproj`
- Create: `E:/intochat/platform/src/IntoChat.Distribution/Program.cs`
- Create: `E:/intochat/platform/src/IntoChat.Distribution/Properties/PublishProfiles/Container.pubxml`
- Create: `E:/intochat/platform/src/IntoChat.Distribution.AppHost/IntoChat.Distribution.AppHost.csproj`
- Create: `E:/intochat/platform/src/IntoChat.Distribution.AppHost/AppHost.cs`
- Create: `E:/intochat/platform/features/.gitkeep`
- Modify: `E:/intochat/platform/IntoChat.slnx`
- Test: `E:/intochat/platform/src/IntoChat.Distribution.Tests/DistributionCompositionFacts.cs` (create, with csproj)

**Interfaces:**
- Consumes: `DigitalBrainServerBuilder.AddOperatingSystem()` and `AddModule(Module)` from package `DigitalBrain.OS`; `AddOperatingSystemApps(Action<OsAppsOptions>)` from `DigitalBrain.OS`; `HostedRecoveryHost` from `DigitalBrain.Platform`.
- Produces: `IntoChat.Distribution.Composition.Modules` (`IReadOnlyList<Module>`), the private modules added on top of the OS; empty in this task, filled in Task 9. `features/` at the platform root, the folder the AppHost hands the OS.

- [ ] **Step 1: Write the failing test**

```csharp
public sealed class DistributionCompositionFacts
{
    [Fact]
    public void DistributionAddsOnlyPrivateModulesOnTopOfTheOs()
    {
        var osIds = DigitalBrain.OS.OsCatalog.Modules.Select(m => m.Id).ToHashSet();
        Assert.All(IntoChat.Distribution.Composition.Modules, m => Assert.DoesNotContain(m.Id, osIds));
    }
}
```

Test csproj: `Microsoft.NET.Sdk`, references `IntoChat.Distribution` and package `DigitalBrain.Testing`; add `xunit.v3.mtp-v2` to `Directory.Packages.props` if absent (copy the version from os).

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test src/IntoChat.Distribution.Tests`
Expected: FAIL, `IntoChat.Distribution.Composition` not found.

- [ ] **Step 3: Implement the host**

`IntoChat.Distribution.csproj`: `Microsoft.NET.Sdk.Web`, `PackageReference` to `DigitalBrain.OS`, `DigitalBrain.Platform`, `DigitalBrain.Aspire.Server`; `<None Include="../../features/**/*" LinkBase="features" CopyToOutputDirectory="Never" CopyToPublishDirectory="PreserveNewest" />`; `InternalsVisibleTo IntoChat.Distribution.Tests`.

`Program.cs`: the body of os `src/DigitalBrain.OS/DigitalBrain.OS/Program.cs` with the server lambda replaced by

```csharp
server => { server.UseOrleansDashboard().AddOperatingSystem(); foreach (var module in Composition.Modules) { server.AddModule(module); } }
```

and a `public static class Composition { public static IReadOnlyList<Module> Modules { get; } = []; }` in the same file.

`Container.pubxml`: copy the os one; `ContainerRepository` is `intochat-distribution` (ACR name space comes from Pulumi outputs at deploy time, Task 8).

- [ ] **Step 4: Implement the AppHost**

`IntoChat.Distribution.AppHost.csproj`: copy `E:/intochat/os/src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj`, replace every `ProjectReference` to a `*.Aspire.Hosting.csproj` with the `PackageReference` of the same id (add their `PackageVersion`s at `$(DigitalBrainVersion)` to `Directory.Packages.props`), replace the `DigitalBrain.OS` reference with `ProjectReference` to `../IntoChat.Distribution/IntoChat.Distribution.csproj`, drop the `DigitalBrain.Mcp` reference and the MCP block of `AppHost.cs`, and use a new `UserSecretsId`.

`AppHost.cs`: copy os `AppHost.cs`; `features` resolves to `Path.Combine(builder.AppHostDirectory, "..", "..", "features")` (unchanged expression, now the platform root); `Projects.DigitalBrain_OS` becomes `Projects.IntoChat_Distribution`; the deployment name stays `"intochat"`.

Add all three projects to `IntoChat.slnx`.

- [ ] **Step 5: Run the test and build the AppHost**

Run: `dotnet test src/IntoChat.Distribution.Tests` → PASS.
Run: `dotnet build src/IntoChat.Distribution.AppHost -c Release` → succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/IntoChat.Distribution src/IntoChat.Distribution.AppHost src/IntoChat.Distribution.Tests features/.gitkeep IntoChat.slnx Directory.Packages.props && git commit -m "feat(distribution): host the OS from released packages"
```

### Task 8: Platform CI and deploy workflows

**Files:**
- Create: `E:/intochat/platform/.github/workflows/ci.yml`
- Modify: `E:/intochat/platform/.github/workflows/preview.yml`
- Modify: `E:/intochat/platform/.github/workflows/deploy-prod.yml`

**Interfaces:**
- Produces: job `ci` (required check from Task 1 step 6); image `<acr>/intochat-distribution:<tag>` built by deploy.

- [ ] **Step 1: `ci.yml`**

Triggers `pull_request` and `push: branches: [master]`. `permissions: contents: read, packages: read`. Env `NUGET_GITHUB_USERNAME: ${{ github.actor }}`, `NUGET_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Job `ci`, `timeout-minutes: 30`: checkout, setup-dotnet `global-json-file: global.json`, setup-node 22 with npm cache on `src/IntoChat.WebUI/package-lock.json`, `dotnet restore IntoChat.slnx`, `dotnet build IntoChat.slnx -c Release --no-restore`, `dotnet test IntoChat.slnx -c Release --no-build`, `npm ci && npm run build` in `src/IntoChat.WebUI`.

- [ ] **Step 2: `preview.yml`**

Change `on:` to

```yaml
on:
  pull_request:
    paths: ['src/IntoChat.Infrastructure/**', 'src/IntoChat.DeploymentKit/**']
  workflow_dispatch:
```

Replace `setup-dotnet` `dotnet-version: 11.0.x` with `global-json-file: global.json`. Delete the `Publish miniapp static site` step.

- [ ] **Step 3: `deploy-prod.yml`**

Change `on:` to `release: types: [published]` plus `workflow_dispatch`. `setup-dotnet` uses `global-json-file`. Delete the four MiniApp steps (`Publish miniapp static site`, `Enable miniapp static host`, `Upload miniapp static assets`, the miniapp line in `Smoke checks`) and the `miniapp_storage` and `miniapp_host` output lines. Add after the Jobs image step:

```bash
dotnet publish src/IntoChat.Distribution/IntoChat.Distribution.csproj -c Release -r linux-x64 /t:PublishContainer -p:PublishProfile=Container -p:EnableSdkContainerSupport=true -p:ContainerRegistry=${{ steps.outputs.outputs.acr_login_server }} -p:ContainerImageTags=$IMAGE_TAG
```

with `IMAGE_TAG: ${{ github.event.release.tag_name || github.sha }}`. Add `NUGET_GITHUB_USERNAME` and `NUGET_GITHUB_TOKEN` env from `github.actor` and `secrets.GITHUB_TOKEN` and `packages: read` to permissions. Image names `tripradar-api` and `tripradar-jobs` stay until the Pulumi stack renames them; note this in the PR.

- [ ] **Step 4: Verify on a PR**

Open the PR; expected: `ci` runs and passes; `preview` does not run (no infra paths touched). Push a whitespace change under `src/IntoChat.Infrastructure/` on the same branch; expected: `preview` runs.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/preview.yml .github/workflows/deploy-prod.yml && git commit -m "ci: build and test on PR, preview only on infra paths, deploy on release"
```

---

## Phase D: move the private pieces (spec step 4)

### Task 9: Move the SV modules and features/intochat into platform

**Files:**
- Move: `E:/intochat/os/src/DigitalBrain.Modules/{Monnet,Equifax,RiskSeal,Twilio}/` → `E:/intochat/platform/src/Modules/{Monnet,Equifax,RiskSeal,Twilio}/`
- Move: `E:/intochat/os/features/intochat/` → `E:/intochat/platform/features/intochat/`
- Modify (os): `DigitalBrain.slnx` (lines 73-77, 145-149, 165-169, 188-192), `src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs` lines 33-37, `src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj` SV comment block, `src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs` line 38, `VERSION`
- Modify (platform): `IntoChat.slnx`, `src/IntoChat.Distribution/Program.cs`, `src/IntoChat.Distribution.AppHost/IntoChat.Distribution.AppHost.csproj`, `Directory.Packages.props`

**Interfaces:**
- Consumes: `Composition.Modules` from Task 7.
- Produces: `Composition.Modules` = `[new MonnetModule(), new EquifaxModule(), new RiskSealModule(), new TwilioModule()]`; default app `("intochat", "customer-researcher")` registered by the Distribution, not the OS.

- [ ] **Step 1: Copy with history into platform**

From `E:/intochat/os`:

```bash
git format-patch --root -o /tmp/sv -- src/DigitalBrain.Modules/Monnet src/DigitalBrain.Modules/Equifax src/DigitalBrain.Modules/RiskSeal src/DigitalBrain.Modules/Twilio features/intochat
```

From `E:/intochat/platform`:

```bash
git am --directory=sv-import /tmp/sv/*.patch && git mv sv-import/src/DigitalBrain.Modules/Monnet src/Modules/Monnet && git mv sv-import/src/DigitalBrain.Modules/Equifax src/Modules/Equifax && git mv sv-import/src/DigitalBrain.Modules/RiskSeal src/Modules/RiskSeal && git mv sv-import/src/DigitalBrain.Modules/Twilio src/Modules/Twilio && git mv sv-import/features/intochat features/intochat && git commit -m "chore: place imported SV modules and intochat features"
```

If `git am` fails on a patch (path outside the filtered set), fall back to a plain copy and one commit; history is nice to have, not required.

- [ ] **Step 2: Rewire the moved projects**

In each moved `.csproj`, replace `ProjectReference` to `DigitalBrain.csproj`, `DigitalBrain.Framework.csproj`, `DigitalBrain.Aspire.Hosting.csproj` and `Testing/DigitalBrain.Testing.csproj` with `PackageReference Include="DigitalBrain"`, `"DigitalBrain.Framework"`, `"DigitalBrain.Aspire.Hosting"`, `"DigitalBrain.Testing"`. Add all sixteen projects to `IntoChat.slnx`.

- [ ] **Step 3: Compose them in the Distribution**

`Program.cs`: `Composition.Modules` lists the four module instances; after `AddOperatingSystem()` add `server.ConfigureServices(s => s.AddOperatingSystemApps(os => os.Apps.Add(new OsApp("intochat", "customer-researcher"))))`. `IntoChat.Distribution.AppHost.csproj`: `ProjectReference` to the four `*.Aspire.Hosting.csproj` with `IsAspireProjectResource="false"`.

- [ ] **Step 4: Verify platform**

Run: `dotnet build IntoChat.slnx -c Release && dotnet test IntoChat.slnx -c Release --no-build`
Expected: builds; `DistributionCompositionFacts` passes; the four module test projects pass with the same counts they had in os (`git -C /e/intochat/os log` of their last CI run is the reference).

- [ ] **Step 5: Commit platform**

```bash
git add IntoChat.slnx src/Modules src/IntoChat.Distribution/Program.cs src/IntoChat.Distribution.AppHost/IntoChat.Distribution.AppHost.csproj Directory.Packages.props && git commit -m "feat: SV modules and intochat apps live in the platform distribution"
```

- [ ] **Step 6: Delete from os**

```bash
git rm -r src/DigitalBrain.Modules/Monnet src/DigitalBrain.Modules/Equifax src/DigitalBrain.Modules/RiskSeal src/DigitalBrain.Modules/Twilio features/intochat
```

Remove the four solution folders from `DigitalBrain.slnx`, the five commented lines in `OsCatalog.cs`, the commented block in `DigitalBrain.AppHost.csproj`, and `new OsApp("intochat", "customer-researcher")` from `OsApps.cs`. Set `VERSION` to `0.2.0`.

- [ ] **Step 7: Verify os**

Run: `grep -rn "Monnet\|Equifax\|RiskSeal\|Twilio\|features/intochat\|customer-researcher" --include=*.cs --include=*.csproj --include=*.slnx --include=*.md . | grep -v /obj/`
Expected: no output.

Run: `dotnet build DigitalBrain.slnx -c Release -p:CodeGraphRefresh=false && dotnet test -c Release --no-build -p:DigitalBrainE2E=false`
Expected: green. `OsCatalogFacts` and `ProductCompositionFacts` still pass.

- [ ] **Step 8: Commit os and OPERATOR cuts v0.2.0**

```bash
git add -A src/DigitalBrain.Modules/Monnet src/DigitalBrain.Modules/Equifax src/DigitalBrain.Modules/RiskSeal src/DigitalBrain.Modules/Twilio features/intochat DigitalBrain.slnx src/DigitalBrain.OS/DigitalBrain.OS/OsCatalog.cs src/DigitalBrain.OS/DigitalBrain.OS/OsApps.cs src/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj VERSION && git commit -m "refactor: SV modules and intochat features moved to the platform repository"
```

After merge: `git tag v0.2.0 master && git push origin v0.2.0`. Expected: release workflow green, `DigitalBrain.OS` 0.2.0 on the feed.

- [ ] **Step 9: Platform pins 0.2.0**

Set `DigitalBrainVersion` to `0.2.0`; run `dotnet restore IntoChat.slnx && dotnet build IntoChat.slnx -c Release --no-restore`; commit `Directory.Packages.props` as `build: DigitalBrain 0.2.0`.

---

## Phase E: public flip (spec step 5)

### Task 10: History scan and visibility change

**Files:**
- Create: `E:/intochat/os/.github/workflows/gitleaks.yml`

- [ ] **Step 1: Add gitleaks to CI**

```yaml
name: gitleaks
on: [pull_request, push]
permissions: { contents: read }
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

Commit as `ci: gitleaks on every push`.

- [ ] **Step 2: Full-history scan locally**

```bash
docker run --rm -v /e/intochat/os:/repo ghcr.io/gitleaks/gitleaks:latest detect --source /repo --log-opts="--all" --report-path /repo/artifacts/gitleaks-report.json --exit-code 1
```

Expected: exit code 0 and an empty `leaks` array. Any finding stops this task; the user decides on history rewriting (out of scope).

- [ ] **Step 3: Attach the report to the v0.2.0 release**

```bash
gh release upload v0.2.0 artifacts/gitleaks-report.json --repo intochat/os
```

- [ ] **Step 4: OPERATOR flips visibility**

```bash
gh repo edit intochat/os --visibility public --accept-visibility-change-consequences
```

Expected: `gh repo view intochat/os --json visibility` prints `PUBLIC`; `ci`, `flutter` and `gitleaks` still pass on the next PR (public-repo runners and `GITHUB_TOKEN` package permissions behave differently from private).

- [ ] **Step 5: Done check against the spec**

- `git clone https://github.com/intochat/platform` into an empty folder with the two env vars set: `dotnet build IntoChat.slnx` succeeds with no os checkout present.
- `git clone https://github.com/intochat/os` into an empty folder: `dotnet test -p:DigitalBrainE2E=false` green; `ls features src/DigitalBrain.Modules` shows no `intochat`, `Monnet`, `Equifax`, `RiskSeal`, `Twilio`.
- `gh release view v0.2.0 --repo intochat/os` lists packages and `gitleaks-report.json`.
