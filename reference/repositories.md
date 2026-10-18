# Repository boundaries

IntoChat has two complementary implementation surfaces: the cloud control plane and the DigitalBrain runtime. The React cloud portal and Flutter workspace serve different jobs. Their coexistence does not imply a frontend migration or two interchangeable clients.

**Evidence date: 17 October 2026. Classification: inspected code, with executed checks listed separately.**

| Repository | Inspected revision | Responsibility |
| --- | --- | --- |
| `intochat-cloud` | `codex/cloud-migration`, `d9dc9798ca5bfc2b93e2b2b12cd3f3033047d2c6` plus existing local changes | React account portal, authentication, cloud billing, runtime provisioning, workspace access proxy, infrastructure and usage accounting |
| `digitalbrain` | `master`, `faddacfc3b5e7cf3a74adfd0efcf8a17e277540b`, clean checkout | .NET/Orleans platform, modules, application runtime and Flutter workspace |
| `digitalbrain.docs` | `main`, baseline `8182b1adf680fd54d1b5a067a9ab37e17bd0f590` plus existing documentation changes | This handbook, plans and historical audit records |

These are working-tree observations, not claims that every finding is present in the named commit. Cloud already had modifications in `src/Aspire/AppHost.cs`, `src/IntoChat.WebUI/src/features/auth/lib/oauth.test.ts` and `src/IntoChat.WebUI/src/shared/config/env.ts`. They were preserved. Use [the evidence inventory](./evidence) when interpreting verification results.

## Why the travel description is misleading

The cloud `README.md` still calls the project a travel platform with flight and hotel search and a Telegram bot. Historical travel documentation and schema remain. Current implementation contains account-scoped hosting and billing services, runtime management and extensive hosting tests. `src/Aspire/AppHost.cs` sets travel and Telegram messaging off and leaves checkout and provisioning disabled by default. A stale README cannot establish the current architecture.

The presentation's third-slide notes recorded an earlier inability to reconcile the travel README with Flutter/Orleans. Current source resolves the technical relationship: cloud manages a separate runtime through an explicit protocol. It does not prove deployment or establish that every retained travel component is safely retired in every environment.

## Concrete integration boundary

| Direction | Source and symbol | Contract |
| --- | --- | --- |
| Portal to cloud | Cloud `src/IntoChat.Server.API/Controllers/BrainsController.cs`, `Create`, `OpenWorkspace`, `Operation`, `Retry` | Account-scoped brain creation, durable operation status and workspace admission |
| Cloud to runtime | Cloud `src/IntoChat.Server.Infrastructure/Services/Hosting/RuntimeManagementClient.cs`, `ObserveAsync`, `EnsureAsync`, `IssueWorkspaceAsync`, `RevokeWorkspaceAsync` | `/runtime/management/v1/`; mTLS controller credentials and server trust checks |
| Contract validation | Cloud `src/IntoChat.Server.Application/Contracts/Services/Hosting/IRuntimeManagementClient.cs`, `RuntimeManagementTarget`, `RuntimeObservation` | Account, brain, runtime identity and expected runtime version; readiness defaults closed |
| Runtime receiver | Runtime `src/DigitalBrain.Platform/DigitalBrain.Platform/Hosting/HostedRuntimeEndpoints.cs` and `RuntimeManagementEndpoints.cs` | Management endpoints in the hosted runtime |
| Browser workspace transport | Cloud `src/IntoChat.Server.API/Middlewares/WorkspaceProxyMiddleware.cs` | Proxy boundary separate from cloud account authentication |

`RuntimeManagementClient.ObservationAsync` rejects mismatched protocol version, runtime version and identity. `IssueWorkspaceAsync` validates a bounded one-time exchange code. These are concrete code-backed protections; deployed DNS/TLS, routing and actual provider configuration still require environment acceptance.

## Cloud source map

| Area | Repository-relative location | Inspection result |
| --- | --- | --- |
| Local topology | `src/Aspire/AppHost.cs` | API, React/Vite, PostgreSQL and Redis; explicit isolated/sandbox/live profiles; migration opt-in restricted to isolated run mode |
| Cloud account and auth | `src/IntoChat.Server.API/Controllers/AccountsController.cs`, `IdentityLinksController.cs`; infrastructure `Services/Authentication/AuthSessionService.cs` | Account ownership and session lifecycle are separate from runtime workspace identity |
| Provisioning | Infrastructure `Services/Hosting/BrainProvisioningService.cs`, `AzureRuntimeAllocationDriver.cs` | Durable operations, account limits, provider allocation and recovery code |
| Lifecycle | Infrastructure `Services/Hosting/BrainLifecycleService.cs`, `AzureRuntimeLifecycle.cs` | Pause/resume, retention, recovery and deployment lifecycle boundaries |
| Billing | Infrastructure `Services/Billing/CloudCheckoutService.cs`, `CloudBillingWebhookReceiver.cs`, `BillingReconciliationService.cs` | Checkout and durable reconciliation implementation; not proof of actual money received |
| Usage | Infrastructure `Services/Usage/ResourceBudgetService.cs`, `ManagedModelGateway.cs`, `AzureResourceMetering.cs` | Budget admission, managed inference and resource measurement paths |
| Operations | `docs/operations/hosted-runtime-recovery.md` | Existing operator runbook; review privately for deployment-specific details |
| Delivery | `.github/workflows/preview.yml`, `deploy-prod.yml`; `src/IntoChat.Infrastructure`, `src/IntoChat.DeploymentKit` | Pulumi/Azure delivery code exists; no pipeline or deployment was executed in this audit |

Paths abbreviated as “Infrastructure” start at `src/IntoChat.Server.Infrastructure/`. Source paths are lookup references, not browser links to private repositories. This avoids publishing unverifiable GitHub URLs or machine-specific file links.

## CI discrepancy to resolve before release

Both workflow intent and deployment tooling need reconciliation with the cloud migration. The preview workflow still invokes `dotnet publish src/IntoChat.MiniApp/IntoChat.MiniApp.csproj`, but that project file is absent from the inspected tree. Remaining directories do not constitute a buildable project. Treat this as a release-pipeline defect to verify and repair in application work, not a reason to rewrite the runtime. Do not trigger the production workflow merely to test the documentation.

Related: [evidence](./evidence), [decisions](./decisions), [maintenance](./maintenance).

For the 0.3.0 rename (`IntoChat.OS`, `.intochat-os/`, `IntoChatOS__`), see the [os 0.3.0 release notes](./releases/os-0.3.0).
