# ADR A3′: an Azure module installs and runs the cloud; Pulumi and the DeploymentKit are retired

Status: proposed 2026-10-18, supersedes ADR A3 in `azure-environments-2026-10-18.md`. Owner decision pending (G0′).

## Context

- The platform's `IntoChat.DeploymentKit` is ~33k lines of TripRadar-era Pulumi; `DigitalBrain.Deployment` plus `.Runtime` in os are ~3.3k more. Together they exist to create about fifteen resources per environment.
- The Pulumi path cannot run today: `Pulumi.production.yaml` uses nested keys (`tripradar:domains:miniAppHost`) that the current CLI rejects, so `pulumi stack select --create production` fails before any preview (checked locally 2026-10-18). Pulumi Cloud has no stack for the project. Making it run means P2 (de-TripRadar, new stacks, ESC) before anything deploys.
- ARM is declarative and idempotent per resource: a PUT on a named resource creates or updates it; a second PUT is a no-op. A state file adds two things: deletes of resources removed from code, and renames. At fifteen resources in one or two environments neither justifies a second tool, a second language, a cloud account, a token, and two environments' worth of ESC.
- The OS already models long-lived things as neurons with their own state. Runtime resources (sandbox sessions, per-brain storage, scaling) appear while the system runs; Pulumi cannot manage those at all, and the kernel already calls Azure directly for sessions (`SessionRunner`).
- Every module already declares its cloud needs through `ModuleDeployment<TModule>` (`IDigitalBrainModuleDeployment`). That hook stays; only its vocabulary changes from Pulumi resource classes to the Azure module's.

## Decision

1. **One Azure module** at `src/DigitalBrain.Modules/Microsoft/Azure/` (`DigitalBrain.Modules.Microsoft.Azure`, `.Contracts`, `.Tests`), module id `azure`, built on `Azure.ResourceManager.*` with `DefaultAzureCredential`. No Pulumi reference anywhere in os or platform.
   - `IAzure` (contract): `Ensure(ResourceSpec)` → `ResourceRef`, `Read(ResourceRef)`, `Remove(ResourceRef)`, `Inventory(tag)`. Specs are records per kind (`ResourceGroupSpec`, `ManagedEnvironmentSpec`, `ContainerAppSpec`, `SessionPoolSpec`, `StorageAccountSpec`, `FileShareSpec`, `BlobContainerSpec`, `KeyVaultSpec`, `SecretSpec`, `IdentitySpec`, `RoleGrantSpec`, `RegistrySpec`, `LogWorkspaceSpec`, `PostgresSpec`, `EventHubsSpec`). Names are deterministic `<prefix>-<env>-<kind>`; every resource is tagged `managed-by=intochat`, `env=<env>`, `owner=<module>`.
   - `AzureNeuron` (grain type `azure`, keyed `{brain}/connection/azure/{subscription}`) implements `IAzure` and remembers what it ensured (concrete arrays) so the inventory is readable without listing Azure. It is the runtime face: the C# module asks it for a session pool, apps ask for a blob container, the OS asks it to scale itself.
   - **Installer mode.** `DigitalBrain.OS` gains `install --env <env> --config <file>`: it starts the kernel with only the Azure module and the module deployments, runs every `ModuleDeployment` against `IAzure` in dependency order (RG → identity → network → environment → storage/vault/registry → grants → apps), prints the plan first (`--dry-run` prints and exits), and exits non-zero on the first failure. It runs in GitHub Actions under the existing OIDC apps (`gh-intochat-platform-test|prod`), never inside the cluster. The same code path, invoked from inside the cluster by the neuron, serves runtime resources. There is no second foundation and no chicken-and-egg: the installer is the kernel before there is a cluster.
   - `ModuleDeployment<TModule>.Deploy(ModuleDeploymentContext)` keeps its name; the context exposes `IAzure` and the foundation refs instead of Pulumi outputs. `CSharpDeployment` becomes ~40 lines of specs (NSG, subnet, environment, session pool, role grant).
2. **Deleted:** `IntoChat.DeploymentKit`, `IntoChat.Infrastructure`, `DigitalBrain.Deployment`, `DigitalBrain.Deployment.Runtime`, `DigitalBrain.Deployment.Tests.Unit`, `preview.yml`, `esc.*.yaml`, `Pulumi.*.yaml`, the `PULUMI_*` secrets and variables, Pulumi ESC environments, and the Pulumi Cloud dependency. Platform's `deploy-prod.yml` (#3) is replaced, not amended; #3 and #6 close.
3. **Platform keeps:** building its images (api, jobs, distribution) into ACR, the portal upload, and a `deployment/<env>.json` config consumed by `install`. Platform's apps are declared as `ModuleDeployment`s in `IntoChat.Distribution` (they are modules of the distribution already).
4. **What we give up, accepted:** previews become a dry-run log of intended PUTs; removing a resource from code leaves it in Azure until `Remove` or `az` deletes it (the `Inventory(tag)` call lists orphans); in-place-impossible changes (Postgres SKU family, VNet address space) fail loudly with the ARM error and are done by hand, which Pulumi would also have required approving.

## CI/CD after A3′

| Workflow | Repo | Trigger | Does |
| --- | --- | --- | --- |
| `publish.yml`, `release.yml` | os | as today | packages, `os`, `os-ui`, `os-sandbox` images |
| `ci.yml` | platform | PR, master | build, test |
| `deploy-test.yml` (new) | platform | push master, dispatch | `azure/login` (env `test`), build images to ACR as `sha-<short>`, `dotnet run --project src/IntoChat.Distribution -- install --env test`, smoke |
| `deploy-prod.yml` (new) | platform | release published, dispatch `tag` | `az acr import` the release commit's images to `:<tag>`, `install --env prod`, smoke |

GitHub environments and the Azure OIDC apps created on 2026-10-18 are reused unchanged. The only platform secrets are `AZURE_*` per environment and `NUGET_GITHUB_TOKEN`. App secrets live in Key Vault, written once by the installer from `--secrets-from <keyvault|file>`.

## UI delivery, including the Windows app

The W2 UI contract (`ui-contract-2026-10-18.md`) makes every renderer a thin client of `digitalbrain.ui.v1`: screens, kinds and state are defined server-side by neurons. That changes what "updating the UI" means:

- **Most UI changes ship with the kernel release**, not with a client binary. A new screen or a changed layout is a neuron change; the renderer draws what the session streams. The web renderer (`os-ui` image) is rebuilt per release anyway.
- **The Windows app is the same Flutter shell built for `windows/`** (the target folder already exists under `app/shell`). It is a renderer binary that changes only when the protocol or the kind set changes. Release it as an MSIX asset of the os GitHub release, published through an `.appinstaller` manifest hosted on GitHub Pages of `intochat/os`; Windows App Installer then auto-updates on launch (`OnLaunch`, `HoursBetweenUpdateChecks=0`, `ShowPrompt=false`). Microsoft Store is a later option on top of the same MSIX. The `windows` module (`Microsoft/Windows`, machine-keyed connection) already gives the desktop app its local identity and file/console roots.
- **Compatibility** is carried by the protocol version, not by lockstep releases: `ui.v1` is frozen once default; a renderer one release behind keeps working (W2 Q3). The desktop app learns the kernel URL the same way the web shell does, from `config.json` or sign-in, so one binary serves local, test and prod kernels.
- Linear INT-17 (one codebase for web and desktop) and INT-25 (desktop app overhead) are the two spikes that validate this; neither is started. They should run after W2 PR 5b (Dart `UiSession` client), because before that the desktop build would carry the legacy transports.

## PR sequence (replaces P1–P3 and S2/S3 of the W5 plan)

| # | Repo | PR |
| --- | --- | --- |
| A1 | os | `Microsoft/Azure` module: contracts, specs, `AzureNeuron`, `IAzure` over `Azure.ResourceManager`, unit facts with a recording fake; `install` command with `--dry-run`; RG, identity, log workspace, storage (share + containers), Key Vault, environment, OS container app, grants |
| A2 | os | `ModuleDeployment` context moves to `IAzure`; `CSharpDeployment` rewritten (session pool); `DigitalBrain.Deployment*` deleted; `Container.pubxml` unchanged |
| A3 | platform | `deployment/test.json`, `IntoChat.Distribution` module deployments for api, jobs, bot, distribution, os-ui; `deploy-test.yml`; `DeploymentKit`, `Infrastructure`, `preview.yml`, `deploy-prod.yml` (old) deleted; #3 and #6 closed |
| A4 | platform | `deploy-prod.yml` (promote by tag), `smoke.sh` |
| — | — | **G2′: owner approves the first `install --env test` run** (cost as W5 §7, option L2) |
| A5 | os | Windows renderer: MSIX packaging in `release.yml`, `.appinstaller` on Pages (after W2 PR 5b) |

## Consequences for the W5 document

ADR A3 and §5 (Pulumi design, stack schema, ESC) are superseded. §4 (identities, roles, Key Vault), §6 smoke tests, §7 costs, O7/O8/O9/O10 and the gates stay. O5′ (Pulumi Cloud) is dropped. O1′ and O2′ were done on 2026-10-18 and are reused.
