# Evidence and source inventory

This handbook separates selected strategy, source inspection and demonstrated behavior. **Audit date: 17 October 2026.** The evidence below does not establish production operation, demand, revenue or a completed public marketplace.

## Claim classes

| Class | Meaning | Example |
| --- | --- | --- |
| Founder-stated intent | Direction supplied in the task | Universal workspace, marketplace, deployment first |
| Confirmed by inspected code | A named implementation path exists and was read | Cloud validates runtime identity and protocol |
| Verified by executed check | Behavior or build observed in this audit | 120 cloud tests passed, 66 skipped |
| External primary source | Current official vendor material | Product documentation, license or submission policy; see market research citations |
| Proposed product decision | A reversible choice for validation | Curated first-party catalog before external publishers |
| Unverified hypothesis / unresolved | Evidence still required | Context reuse improves retention; willingness to pay |

## Repository provenance

| ID | Source | Context |
| --- | --- | --- |
| C1 | `intochat-cloud` | Branch `codex/cloud-migration`; HEAD `d9dc9798ca5bfc2b93e2b2b12cd3f3033047d2c6`; inspected working tree includes existing local changes |
| R1 | `digitalbrain` | Branch `master`; HEAD `faddacfc3b5e7cf3a74adfd0efcf8a17e277540b`; initially and finally clean |
| D1 | `digitalbrain.docs` | Branch `main`; initial HEAD `8182b1adf680fd54d1b5a067a9ab37e17bd0f590`; existing modified, deleted and untracked documentation preserved |
| P1 | Sibling `cloud/presentation.pptx` | Sole matching presentation located in the supplied directory family; 37,497 bytes; SHA-256 `3B81DC33CCE71A892EAABCA39A9C9D76B4C646F5AF06454D99E872C7C1CE373D` |
| V1 | Sibling `startup-strategy.html` | Visual reference only; its sample strategy and figures are not product evidence |
| H1 | `plans/intochat-cloud-migration-status.md` in this repository | Historical implementation/check record, with a superseding checkpoint dated 16 October 2026 |

Paths identify repository-relative source material for maintainers. They deliberately do not create broken browser links into private checkouts. See [repository responsibilities and symbols](./repositories).

## Presentation: all slides, diagrams and notes

The requested workspace-relative `cloud/presentation.pptx` was absent. The intended file was located in the sibling `cloud` directory. All four slides and all notes were extracted using installed PowerPoint in read-only mode. Each slide was rendered to PNG and visually inspected. No slide was changed. The source uses the historical DigitalBrain brand; IntoChat is the selected customer-facing name in this handbook.

| Slide | Visible argument and diagram | Speaker-note evidence | Treatment in this handbook |
| --- | --- | --- | --- |
| 1: Universal AI workspace | Workspace plus marketplace; installed applications, shared context, access and cost control. Value hypotheses: reduced repeated setup; initial professionals/small teams segment. Vendor examples: Dify integrations and OpenAI publication. | OS analogy describes an ecosystem, not a replacement operating-system kernel. Notes explicitly deny that competitors prove demand or revenue and ask which audience the founder can recruit. | Strategy and audience remain founder intent/proposals. Vendor references require fresh primary-source checks; no demand inferred. |
| 2: Ecosystem | Six boxes. NuGet modules feed Framework/SDK; Framework/SDK feeds Application; Application feeds Catalog/marketplace and Runtime; Cloud points to Runtime. Separate model/compute/storage/API accounting. | All boundaries are explicitly proposed. SDK includes contracts, templates, CLI and test host. Application has UI/workflow/permissions/dependencies. Cloud manages runtime. External publishers require moderation/commercial terms/payouts. Open SDK/basic runtime plus paid managed cloud is proposed. Acquaintance billing integration is unconfirmed. | Preserve target diagram as target. Current protocol evidence establishes some cloud/runtime implementation, not the entire depicted marketplace. License and pricing remain decisions. |
| 3: First priorities | Deploy current version; own-app catalog; pilot/payment validation; external publishers. Candidate tasks include research, documents and content from a shared brief. | Earlier inspection saw a travel/React folder and could not verify Flutter/Orleans summary. Module/app counts were preliminary. Memory and Workspace are common services. Arbitrary generation and automatic charges may be limited initially. | Current code resolves repository relationship, superseding the old mismatch caveat. Deployment priority remains. Candidate applications require independent readiness and user validation. |
| 4: Stages and success criteria | Deployment reliability, user value, shared environment/payment, marketplace. Every numerical threshold is labeled proposed. | Proposed cohort: 10 users; 7 useful results; 5 returning in 3 of 4 weeks; 4 using linked apps; 3 actual payers; positive variable contribution. Developer test: 2 of 3 independent authors publish, each app has 3 repeat users. Notes define useful result, linked usage, actual payment and variable cost categories. No calendar deadlines. | Retain as optional experimental thresholds, not achieved metrics, forecasts or benchmarks. Expansion depends on quality, permissions and economics as well as count thresholds. |

Slide 2's arrow from Cloud to Runtime denotes management, not that a NuGet module is a hosted application. Slide 4's payment criterion requires money received; a usage screen or ledger record is insufficient. These distinctions are material to the product plan.

## Inspected cloud implementation

| Claim | Source path / symbol in C1 | Evidence boundary |
| --- | --- | --- |
| Cloud has distinct local profiles and disabled external features by default | `src/Aspire/AppHost.cs`: profile validation and feature environment settings | Code inspection; no new Aspire stack or external resources launched |
| Provisioning is scoped and durable | `src/IntoChat.Server.API/Controllers/BrainsController.cs`; infrastructure `Services/Hosting/BrainProvisioningService.cs`, `CreateAsync` | Membership/idempotency/limit path inspected; DB concurrency tests skipped in fresh run |
| Runtime has a concrete management contract | Infrastructure `Services/Hosting/RuntimeManagementClient.cs`, `ObservationAsync`, `IssueWorkspaceAsync`; application `Contracts/Services/Hosting/IRuntimeManagementClient.cs` | Identity/version/readiness validation exists; no deployed provider acceptance claimed |
| Runtime receiver exists in R1 | `src/DigitalBrain.Platform/DigitalBrain.Platform/Hosting/HostedRuntimeEndpoints.cs`, `RuntimeManagementEndpoints.cs` | Cross-repository protocol boundary confirmed |
| Checkout is implemented and gated | Infrastructure `Services/Billing/CloudCheckoutService.cs`, `StartAsync` | Requires membership, enabled checkout and complete catalog; actual payment not observed |
| Recovery and operating guidance exists | `docs/operations/hosted-runtime-recovery.md`; infrastructure hosting/lifecycle/recovery services | Documentation and code presence, not a completed production recovery drill |
| Delivery needs reconciliation | `.github/workflows/preview.yml:57`, `deploy-prod.yml:118` | Both reference absent `src/IntoChat.MiniApp/IntoChat.MiniApp.csproj`; no test command found in inspected workflows |

“Infrastructure” expands to `src/IntoChat.Server.Infrastructure/`; “application” to `src/IntoChat.Server.Application/`.

## Executed checks in this audit

Environment: Windows, .NET SDK `11.0.100-rc.2.26504.105`, Node `v26.8.1`. Existing dependencies were used. Commands ran against the inspected working trees, not clean release checkouts.

| Check | Outcome | Establishes / does not establish |
| --- | --- | --- |
| `git status --short`, `git branch --show-current`, `git rev-parse HEAD` | Baselines captured for all three repositories | Provenance; does not make a dirty tree reproducible from SHA alone |
| Cloud: `dotnet test --project src/IntoChat.Server.Tests/IntoChat.Server.Tests.csproj --configuration Release --no-restore` | Exit 0; **186 total, 120 succeeded, 66 skipped, 0 failed** | Non-DB test coverage passes. `INTOCHAT_PROVISIONING_TEST_DB` was explicitly cleared in this process to avoid an existing DB. DB acceptance was not rerun. |
| Cloud frontend: `npm test` in `src/IntoChat.WebUI` | Exit 0; **62 files, 447 tests passed** | Vitest/jsdom behavior. Does not prove real OAuth callbacks, deployed browser operation or paid checkout. |
| `Test-Path src/IntoChat.MiniApp/IntoChat.MiniApp.csproj` | `False` | Confirms workflow reference is stale in this tree; pipeline was not executed. |
| PowerPoint read-only open, slide/notes extraction and four PNG exports | Four slides rendered and inspected | Presentation coverage, including diagram directions and notes; no external claims thereby verified. |
| Cloud `git status --short` after tests | Same three pre-existing modified paths | No application source change introduced by this audit |

The .NET run emitted dependency-pruning, obsolete EF API and nullability warnings. Tests can pass while warnings and deployment gaps remain. Do not report the run as warning-free.

## Historical checks are separate evidence

H1 reports 186 cloud tests with no skips using disposable PostgreSQL, 248 platform tests, 209 AI tests and 445 frontend tests, plus local migration, browser, mTLS and telemetry checks. These are preserved historical reports, not all freshly reproduced by the cloud audit. The current fresh frontend total is 447 and the cloud DB-free run skips 66. Different environments and changed working trees explain why totals must be dated rather than blended.

The current runtime audit and documentation-site build/browser verification have their own records in the implementation-readiness section. A successful site build proves the documentation artifact compiles; it cannot establish application readiness.

## Remaining evidence gaps

No new production deployment, provider allocation, real payment, live OAuth round trip, production migration or customer experiment was performed. Provider sandbox recovery, wildcard ingress, backup/restore RPO/RTO, operational alert routing, legal/commercial decisions and independent publisher adoption remain gates. Source existence and historical local acceptance do not erase those requirements.

Related: [repository map](./repositories), [decision register](./decisions), [maintenance procedure](./maintenance).
