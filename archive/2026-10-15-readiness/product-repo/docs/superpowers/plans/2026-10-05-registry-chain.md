# Registry removal implementation plan

**Goal:** Execute #146, #147, #148 as three reviewed commits on `os`.
**Spec:** GitHub issues intochat/digitalbrain#146–148 and the user's pasted request, amended by the explicit dev-only data-loss decision.
**Architecture:** Framework owns one reflected contract catalog and embedding search beside ModuleInventory. CSharp projects that catalog as its vocabulary; Apps and MCP consume search directly. Framework also owns capability provider contracts. Assistant owns derived capability federation and a stateless grain keyed by BrainScope, preserving trusted-caller checks.

## Decisions and constraints

- All environments are dev-only. Skip the live Discovered sweep entirely. A dev brain whose Apps index predates self-tracking will not list its legacy installs; reinstalling in dev is acceptable. Record this in #146's commit.
- Work on the requested existing `os` branch. Preserve its six pre-existing commits.
- Reserve InstalledAppsState IDs 1 and 2; never renumber or reuse them.
- Choose Framework over CSharp for the catalog: non-CSharp modules should not depend on a language runtime to discover platform contracts. Exactly one exported-type walk supplies catalog metadata and vocabulary.
- For #148, provider seam in Framework and federation in Assistant follow ownership. A Framework-owned discovery grain would retain an unnecessary platform service; an in-process-only service would not satisfy the requested per-brain grain boundary. Use Assistant's grain with its key checked against the ambient brain; no persisted discovery state.
- Run project tests only, never the solution. Existing aliases of moved DTOs remain stable. Retired persisted registry blobs are orphaned, not actively deleted.

## Tasks

- [x] #146: Remove Apps backfill and ledger, replace legacy-backfill test with index tracking/reactivation coverage, reserve state IDs, retire registry state manifest entries. Run Registry, Apps, Assistant; fresh review; commit.
- [x] #147: Move catalog/search and DTOs into Framework, have ContractVocabulary consume the catalog, repoint CSharp/Builder/MCP, preserve filtering/aliases/descriptions/signal shapes and embedding results. Compare one Builder query before/after. Run CSharp, Apps, MCP, Registry; fresh review; commit.
- [x] #148: Move provider DTOs/interface to Framework and federation to Assistant; implement and test caller/key brain isolation. Repoint tools/providers, remove Registry projects/references/catalog/solution entries, relocate tests and update manifests. Run Assistant, Apps, CSharp, Postgres, Supabase, MCP, OS; fresh review; commit.
- [x] Finish: OS unit, Framework and OS E2E suites, Aspire smoke with all resources healthy. Record evidence and retired-state migration notes; close the three issues only after successful verification.

## Review focus

- Cross-brain direct grain calls cannot enumerate another brain's resources.
- App/untrusted callers remain denied even with a valid brain key.
- Platform-only types and platform assemblies never leak through either catalog consumer.
- Catalog search retains deterministic fixture results and no grain hop.
- Existing dev index state reactivates with Packages at ID 0 and retired IDs untouched.

## Evidence and progress

Baseline: 8fa6f7603221a35fbe2534207926424aaf339b15. Implementation authorized by the user's explicit full-chain instruction; seam choices above resolve the delegated placement decisions.

#146 evidence: replacement Apps test failed on ledger repopulation before removal. Registry 12 passed/1 live Qdrant skip; Apps 114 passed; Assistant 71 passed; Architecture 35 passed. Fresh reviewer found retired-ID baseline and obsolete collection fixtures; both repaired and architecture suite passed. Local Aspire stopped to release DLL locks.

#147 review: Framework placement selected as planned. The catalog includes kernel contracts from ModuleInventory in addition to selected module contracts. Standalone MCP has no local embedding/vector configuration, so it opts into deterministic lexical fallback when those services are absent; silo search retains prior behavior. The standalone regression failed with an empty result before the fix and passes afterward. Builder timer query passed both before and after the move.
#147 evidence: CSharp 81 passed; Apps 115 passed (includes before/after Builder query); MCP 9 passed; Registry 12 passed/1 live Qdrant skip; Architecture 35 passed after sorting moved DTO baseline entries. Fresh review completed and standalone MCP finding fixed with a red-to-green regression.

#148 seam review: provider interface and DTOs moved to Framework; federation and a PlatformOnly discovery grain live in Assistant. The grain key is exactly BrainScope.CurrentId(). Each RPC checks the key before trusted-caller service enforcement, because the kernel intentionally bypasses its ordinary call filter for PlatformOnly contracts. Tool-level scope checks remain. No discovery storage is introduced. The direct cross-brain regression failed before the move and passes afterward. Reviewer found no blocking issues; direct RPC rejection coverage was added for unstamped and App callers.

## Migration notes

The retired global `registry` grain's `registry.state` blob is orphaned. No storage sweep, delete job, backfill-completion branch, or dated migration is introduced. All environments are dev-only and data loss is accepted: an Apps index that predates self-tracking will not list legacy installs; reinstalling in dev is acceptable. Existing tracked package arrays remain at field ID 0; IDs 1 (`Discovered`) and 2 (`DiscoveryOffset`) are permanently reserved in both source and the architecture compatibility baseline.

Contract metadata and capability discovery are derived. The new Assistant discovery grain uses the ambient brain's canonical `BrainScope` key and has no persistent state. Moving discovery DTOs and catalog DTOs preserves their Orleans aliases and field IDs; the manifest records their new Framework CLR names. Registry's obsolete observed-instance compatibility samples are retired with the removed type. MCP exposes only contract search, so there is no MCP capability-discovery tool to repoint or remove.

Final review of the whole chain against the initial baseline found no actionable findings. Per-step reviews were also completed; their findings and repairs are recorded above. The added direct-grain tests cover App, forged-untrusted, unstamped, and cross-brain callers across Discover, Browse, and Select.
#148 unit evidence: Assistant 78 passed; Apps 115 passed plus strengthened Builder query regression; CSharp 89 passed including live Qdrant; Postgres 77 passed including live database cases; Supabase 67 passed; MCP 9 passed; OS unit 44 passed; Architecture 35 passed; Framework unit 114 passed. Disposable task-owned Postgres/Qdrant containers were removed. E2E and final smoke evidence follows.

## Final verification

| Per-project suite | Passed | Skipped |
| --- | ---: | ---: |
| Assistant | 78 | 0 |
| Apps | 115 | 0 |
| CSharp (live Qdrant included) | 89 | 0 |
| Postgres (live database included) | 77 | 0 |
| Supabase | 67 | 0 |
| MCP | 9 | 0 |
| OS unit | 44 | 0 |
| Framework unit | 114 | 0 |
| Architecture | 35 | 0 |
| Framework E2E | 15 | 0 |
| OS E2E | 18 | 2 |

The two OS E2E skips are J1CustomersJourneyPassesGoldenThreshold and J2aCardFormJourneyPassesGoldenThreshold, explicitly gated on live-model credentials and DIGITALBRAIN_E2E_LIVE_MODEL=1. The browser and scripted-model journeys passed. Framework's existing trace budgets passed unchanged. Local raw logs are `.codex-registry-*.log` in the repository root.

`aspire run --detach --non-interactive --format Json` from src/DigitalBrain/AppHost/DigitalBrain.AppHost exited 0. The final resource snapshot showed 39/39 active resources Healthy, including IntoChat, digitalbrain-mcp, FlutterShell, csharp-sandbox, storage, Postgres, ClickHouse, Qdrant and the local transcription model. The Azure deployment control and two on-demand rebuild helpers are inactive control resources. The dev host remains running. Removed 92 obsolete Registry DLL/PDB build artifacts from workspace bin/obj directories so stale assemblies cannot remain in MCP's deployed catalog; MCP's suite passed again after cleanup.

Issues #146, #147 and #148 were closed with per-step and final test evidence. All three reviewed commits remain local on `os`; the six pre-existing local commits are preserved and nothing was pushed.
