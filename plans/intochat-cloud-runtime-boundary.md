# Hosted runtime boundary implementation

## Current boundary, 2026-10-16

This section supersedes the historical partial/unavailable-driver notes below. Public runtime changes are provider-neutral; Azure allocation, storage snapshots, billing, credentials custody and orchestration remain private in IntoChat Cloud. The runtime starts locally without a cloud dependency unless explicitly configured for hosted mode.

- `/runtime/management/v1` uses per-allocation mTLS controller pins and exact account/brain/runtime/protocol/version checks. Runtime registration reuses the public identity/brain lifecycle. Readiness additionally requires durable journal health and storage attachment; a capability string is insufficient.
- Cloud privately provisions a digest-pinned Azure Container App, isolated Azure Files share/quota and per-allocation server/controller/workspace/producer credentials. Owned deterministic names and full specification checks recover lost responses. No cloud JWT signing key reaches the runtime.
- Workspace launch uses a one-minute, one-time 256-bit code in a cleared URL fragment. A five-minute absolute host-only session is bound to cloud user/session and runtime. Durable hashed grants, cloud authorization rechecks and revocation workers revoke access; expiry/revocation cancels active streams. A dedicated wildcard HTTPS proxy strips cloud credentials and cannot forward management paths. Active/recovery flags, current entitlement and allocation quota are checked at admission and during proxied work.
- Hosted identity, vault/platform state, integrations and reminders use encrypted durable journals and single-writer locking. The runtime exposes a recovery-only boot path that opens/decrypts storage without starting Orleans, reminders or module background workers. Export is owner-authorized through cloud and mTLS, excludes credentials/platform secret state, and decodes concrete persisted application types.
- Private backup stops execution before the Azure Files snapshot; restore copies snapshot and custody into a separate allocation. Upgrade requires an approved digest, exact version and readable storage format. Candidates remain recovery-only until durable promotion; activation confirms the recovery process stopped before starting the normal revision. Failure never implies an image-only storage rollback.
- Suspension and quota reduction block new work and durably stop allocations. Deletion waits for explicitly configured retention and confirmed provider absence before dropping custody; billing/audit history remains. Recovery export remains possible while ordinary execution is suspended.
- Hosted AI execution is bounded at the actual provider client, including direct workspace requests: shared concurrency, deadline, output-token ceiling and managed gateway budget reservation. Azure configuration enforces CPU/memory/file-share limits. Runtime provider usage receipts and private Azure Monitor measurements use distinct typed immutable records; missing data remains an operator discrepancy.

Local evidence: public platform tests 248/0/0; AI tests 209/0/0; runtime OS Release build succeeds. Cloud integration tests exercise real PostgreSQL and actual local HTTPS/mTLS transport, with external Azure/model/payment doubles confined to tests. Full current verification, commits and acceptance classification are maintained in `intochat-cloud-migration-status.md`.

Awaiting external operational validation: approved runtime artifact/version; Azure identity/private network/storage; wildcard DNS/TLS; measured SMB single-writer/quotas, snapshot/restore/export, CPU/memory limits and recovery objectives on that deployment. No infrastructure was deployed and no production data was migrated or deleted.

## Historical boundary records

Checkpoint: 2026-10-15. This records a partial C1 implementation, not hosted-product acceptance.

## Existing capabilities reused

| Concern | Existing source in public runtime | Decision |
|---|---|---|
| HTTP composition | `DigitalBrain.Aspire.Server/ServerHostingExtensions.cs`, `DigitalBrain.Platform/PlatformHosting.cs` | Add management mapping to the existing platform host; no cloud dependency required to start locally. |
| Account and brain authority | `Framework/Platform/Identity/IIdentityClient.cs`, `Platform/Identity/LocalIdentityClient.cs`, `IdentityEndpoints.cs` | Reuse persisted account ownership, membership and brain registry; never write runtime tables from cloud. |
| Authenticated caller | `Platform/Identity/AccountSession.cs` | Reuse the authenticated runtime owner cookie and trusted caller stamping. Synthetic Open-mode identity cannot manage a brain. Machine credentials and cloud workspace exchanges are still missing. |
| Read-only routing | `Framework/Http/BrainRoutes.cs` | Use SessionGroup and explicit owner authorization. Normal Group runs a create-on-access membership filter and is unsuitable for observation. |
| Health | `DigitalBrain.Aspire.Server/ServerHostingExtensions.cs`, ServiceDefaults health probes | Existing process health remains separate from brain registration. Registration does not prove storage or execution readiness. |
| Integrations | `Platform/Integrations/Capabilities.cs` | Existing connector capabilities are not hosting lifecycle capabilities; do not conflate them. |
| Local durable state | `Platform/Storage/BrainStorageHosting.cs`, `BrainStoreOptions.cs` | Runtime uses a configured local directory for brain logs/state; hosted allocations need stable durable mounts, not container writable layers. Production custody checks must remain intact. |
| Cookie keys | `Platform/Identity/CookieProtectionStorage.cs` | Existing grain-state blob service can persist cookie protection keys. Storage identity/key isolation must be accounted for during allocation/restore. |
| Infrastructure | Cloud `IntoChat.DeploymentKit/Services/ContainerAppsService.cs` | Existing Pulumi composition creates the platform API/jobs/bot environment; it is not a recoverable per-brain Ensure operation. Reuse relevant primitives only after a dedicated allocation driver supplies operation identity, isolated storage/secrets and recovery lookup. |

## Implemented v1 observation

`GET /brains/{brainId}/management/v1/observation` requires an authenticated runtime account owner and existing membership. Non-owner/unknown scope returns 404; anonymous callers return 401. The endpoint performs directory reads only and successful responses are no-store.

Public wire contract: `DigitalBrain.Platform.Contracts/Hosting/RuntimeObservation.cs`.

Fields: `protocolVersion` (1), `runtimeVersion` (assembly informational version), `accountId`, `brainId`, `registered`, `capabilities` (currently only `observe`). No lifecycle capability is advertised speculatively. No Dart consumer or existing mirrored Dart contract is changed.

Private `IRuntimeManagementClient` is registered as a typed HTTP client. It accepts only an internally supplied trusted HTTPS origin and runtime owner session, pins the exact runtime informational version and checks account/brain/protocol/capability identity. Redirects and shared cookie storage are disabled. Responses are limited to 64 KiB with a 15-second overall deadline. Error messages omit response bodies and credentials. There is no customer-facing target URL input or production caller yet.

The caller MUST obtain target, expected version and credential from a trusted allocation/credential registry. The target type alone does not establish that provenance. Existing owner cookies are an interim observation mechanism, not the planned one-time cloud workspace exchange or an autonomous machine enrollment flow. Never forward a customer's cloud cookie or JWT to this client.

## Remaining engineering and operational gates

- C1 remains partial: machine enrollment/authentication, lifecycle capabilities, storage-aware readiness, supported image digest selection and release compatibility are unfinished implementation work. The exact-version comparison exists; no production runtime artifact has been approved/pinned.
- C2 now has a durable brain/allocation/operation registry, atomic quota checks, idempotency, fenced worker leases and persisted allocation recovery. Fifteen PostgreSQL cases with test-only drivers validate orchestration. The registered production driver is deliberately unavailable: provider Ensure/lookup, scoped durable storage/secrets and an authenticated runtime readiness adapter remain engineering work. Provider credentials and external deployment validation additionally require operational access/authorization. No production Ready state is fabricated.
- C3 needs one-time audience-bound exchange, runtime sessions/revocation and allocation-level isolation. Observation ownership tests are not HOST-03 acceptance for that future flow.
- C4 needs durable mount/blob/key ownership, coordinated consistent backups, restore compatibility and measured recovery. Existing storage primitives are not an implemented backup protocol.
- C5 and U2 depend on actual execution-control/enforcement hooks. Neither a capability string nor the private ledger enforces runtime CPU, memory, concurrency or storage limits.
- Commercial refund/retention/pricing/legal decisions and production rollout evidence remain separate operator/product gates.

No live provider call, infrastructure deployment, persistent database migration, secret disclosure or production deletion is part of this implementation checkpoint.

## 2026-10-16 machine and workspace extension

This supersedes the interim private owner-cookie client described above. Public self-host owner observation remains; hosted management uses `/runtime/management/v1` with TLS client-certificate authentication and a configured per-allocation SHA-256 pin. Requests do not supply an account/brain owner. Ensure reuses IIdentityClient and brain birth; observation reports registration only, never storage/execution readiness.

Private cloud client requires exact account/brain/runtime/version/protocol matches and a trusted HTTPS origin from the allocation registry. Operator-controlled per-runtime PEM controller credentials are loaded from `Hosting:Management:CredentialDirectory`; they are not a platform JWT key. Provisioning/rotation of those credentials remains unfinished allocation-driver work.

Workspace issue/revoke is available only through the machine boundary. Browser launch consumes a 256-bit one-time code from a URL fragment, clears the fragment immediately, and posts to the same HTTPS origin. Exchange expires in one minute, the nonrenewing cookie in five minutes. Durable hashed grants bind user/session/account/brain/runtime, serialize one-time consumption across processes, and are checked on each cookie validation. Cloud records a durable lease before issuing, rechecks authorization after I/O, and reconciles revoked authorization from DB state with bounded parallel work. No claim is made that existing long-running work is interrupted; U2 remains unfinished.

Hosted HTTP scope enforcement uses canonical route metadata; IBrainAccess additionally enforces scope for body/gRPC requests. Registration, sign-in, identity switching and brain creation cannot escape the configured hosted brain. Runtime tests: 240 passing platform cases, including a real local HTTPS/mTLS flow; cloud tests: 93 passing including disposable PostgreSQL authorization/revocation races. Provider allocation, storage/backup/lifecycle, actual execution enforcement and deployment acceptance remain incomplete as detailed in the status document.
