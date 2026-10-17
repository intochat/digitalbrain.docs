# Connector review remainders

Work on `os`; implement the supplied five review items without approval stops.

- [x] Add regression facts for infrastructure schema handles, hidden CSharp connector, connection membership, caller restoration, and catalog transitions.
- [x] Extend ModuleIntegrations using IntegrationDiscovery declarations; remove CSharp's pseudo-connector; document atomic secret release.
- [x] Guard IsConnectedAsync and audit Gmail's authenticated, unstamped inbound delivery separately from user probes.
- [x] Share caller scope restoration through a Platform-internal disposable helper.
- [x] Serialize catalog refreshes, read each distinct dependency once per refresh, retain snapshots/materialized entries by revision and status, and log unavailable transitions once.
- [x] Run Platform, Framework, Architecture, CSharp, Gmail, OS unit projects, then Framework and OS E2E; smoke Aspire and commit.

No time-based cache: each catalog refresh still reads current Integration status. No change to serializer identities or atomic credential release.

## Implementation notes

- `IntegrationDiscovery.Declared` is shared by composition and handle authorization. Both singular and plural schema declarations work without a ConnectorDefinition; composed-module and connector-dependency checks remain.
- `CallerContextScope` is internal to the Platform assembly. Framework's existing public stamper gains no new module-facing API. Disposal restores arbitrary prior RequestContext values or removes the key, including nested scopes and exceptions.
- Every catalog refresh reads each distinct required Integration once to observe current revision/status. Unchanged snapshots and connector entries are reused; a semaphore prevents overlapping refreshes from racing the transition log. There is no expiry or time-based cache. Unavailable warnings occur initially and on Ready-to-unavailable transitions.
- Gmail's signed anonymous Pub/Sub endpoint has no ambient user identity. Its internal, PlatformOnly inbound contract retains the existing trusted-cluster unstamped registry read path. Any stamped inbound call must pass the guarded scoped credential service. No module constructs or clears caller stamps. Existing cross-brain mailbox fan-out tests and a new stamped cross-brain rejection test pass.
- No runtime or shell consumer of the removed `run-token` authentication method remains. CSharp retains its Integration schema and asynchronous startup key delivery. Its README and the binding design now describe schema-owned handles.

## Verification

The new Platform tests first failed on the unimplemented schema authorization, cross-brain rejection, and catalog reuse; the CSharp test failed on the exposed connector. After implementation:

| Project | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Platform unit | 133 | 0 | 0 |
| Framework unit | 114 | 0 | 0 |
| Architecture | 35 | 0 | 0 |
| CSharp | 81 | 0 | 0 |
| Gmail | 14 | 0 | 0 |
| OS unit | 43 | 0 | 0 |
| Apps (shared startup scope consumer) | 114 | 0 | 0 |
| Framework E2E | 15 | 0 | 0 |
| OS E2E | 19 | 0 | 2 |

Commands: `dotnet test <project-directory> --no-restore --verbosity quiet`, by project, never `.slnx`. Raw output is in ignored `.codex-review-*.log` files. Independent read-only review found no actionable issues. Framework E2E passed in 3m34s; OS E2E passed in 6m52s. The two optional live-model cases remain skipped because live-provider test configuration is not enabled. The final AppHost build passed with zero warnings and zero errors; the final `aspire run --no-build --detach --non-interactive --format Json` smoke reached 38 Healthy monitored resources with no unhealthy or waiting resources. The Azure deployment environment, on-demand CSharp sandbox, and two rebuild helpers correctly remained NotStarted without health checks. The verification host was stopped cleanly; persistent containers and data were preserved.

Final `git diff --check` passed. All changes are scoped to the supplied review remainders; persisted identities and credential-release behavior are unchanged.
