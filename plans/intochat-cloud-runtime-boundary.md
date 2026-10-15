# Hosted runtime boundary implementation

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
- C2 needs a durable brain/allocation/operation registry, quota reservation, provider Ensure/recovery and worker leases. No fake successful allocation or Ready state exists. Provider credentials and external deployment validation require separate operational access/authorization; registry/driver code is still engineering work, not solely an external blocker.
- C3 needs one-time audience-bound exchange, runtime sessions/revocation and allocation-level isolation. Observation ownership tests are not HOST-03 acceptance for that future flow.
- C4 needs durable mount/blob/key ownership, coordinated consistent backups, restore compatibility and measured recovery. Existing storage primitives are not an implemented backup protocol.
- C5 and U2 depend on actual execution-control/enforcement hooks. Neither a capability string nor the private ledger enforces runtime CPU, memory, concurrency or storage limits.
- Commercial refund/retention/pricing/legal decisions and production rollout evidence remain separate operator/product gates.

No live provider call, infrastructure deployment, persistent database migration, secret disclosure or production deletion is part of this implementation checkpoint.
