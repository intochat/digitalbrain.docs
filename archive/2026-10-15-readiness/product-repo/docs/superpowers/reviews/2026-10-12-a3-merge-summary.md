# a3 → os-runtime merge summary (2026-10-12)

Read-only. No merge performed. **Fate is the user's decision.**

## Size and fork point

- `a3` = 53 commits (50 non-merge), 142 files, **+4384 / −430**, off the true fork point **`b53109973`** ("Parts: a part
  lease serializes its CASes…"). (`git merge-base master os-runtime` = `53bc06458d` is 198 commits older and is *not*
  a3's fork point; a3's first commit `8074c97d4` parents at `b53109973`.) Since the fork, os-runtime is 406 commits ahead.

## Themes

1. Builders engine + playbooks (`Builders:` 8, `Shell Builder:` 7, `Module Builder:` 5) — ~20 commits.
2. Aspire cluster/candidate/compatibility (`Aspire:` 12, `Policy:` 1) — ~13.
3. Apps / IAppStudio / studio lifecycle — 5.
4. Engineer classifier + app — 4.
5. Roslyn module revival (`Roslyn:` 3, `CSharp:` 1) — 4.
6. Plan/live-verification commits (`Plan:`) — 4.
7. Mcp stdio allowlist (`Mcp:`) — 3.

## Overlap / conflict risk

37 of a3's 142 files also changed on os-runtime since the fork. `git merge-tree --write-tree os-runtime a3` reports
**22 content conflicts + 1 file-location conflict**:

- **Aspire (9, worst):** os-runtime renamed `Cluster/` → `Deployment/`, while a3 adds `Cluster/BuildSandbox.cs` into the
  dead directory (file-location conflict) and edits `Cluster/ClusterNeuron.cs`, colliding with the renamed
  `Deployment/DeploymentNeuron.cs`. Also `AspireModuleHosting.cs`, `AspireModule.cs`, `Candidates/*`, `Deployment/*`,
  `tests/CandidateFacts.cs`.
- **CSharp sandbox (5):** `CSharpScriptCheck.cs`, `BrainRuntimeNeuron.cs`, and three test files.
- **Apps/Studio (3):** `Apps/Creator.cs`, `Features/FeatureReconciler.cs`, `tests/AppStudioFacts.cs`.
- **OS/shell wiring (5):** `features/os/SelfImprove/SelfImprove.cs`, `AppHost.cs`, `DigitalBrain.Mcp.csproj`, `OS/OsApps.cs`,
  `OS.Tests.Unit/{OsBootFacts,OsShippedAppFacts}.cs`.
- Textually clean but semantically risky: `CLAUDE.md`, `DigitalBrain.slnx` (a3 adds a 112-entry `/Modules/Microsoft/Roslyn/`
  block; os-runtime has 137 entries and no Roslyn reference yet still ships the old `src/Modules/Microsoft/Roslyn/*` files),
  `AppHost.csproj`, `OsCatalog.cs`.

## What merging would take (checklist)

1. **Rebase, not merge** — replay the 53 commits; expect recurring conflicts in the ~20 touched areas.
2. Move `Cluster/BuildSandbox.cs` to `Deployment/` by hand; accept a3's `src/Modules/Microsoft/Roslyn/**` → `src/DigitalBrain.Modules/Microsoft/Roslyn/**` move (os-runtime never edited the old files).
3. Reconcile the merged `DigitalBrain.slnx` (no duplicate/reordered projects) and AppHost/OsCatalog (a3's Engineer registration vs os-runtime's newer composition).
4. **Architecture suite is the gate:** a3 touches 0 `src/Testing` files; os-runtime added 88, incl. new `TestingPackageFacts`/`TrustCompositionFacts`. The re-introduced Roslyn/Engineer modules must pass os-runtime's stricter ring/config-key rules — build failures land here first.
5. Re-run: Microsoft.Roslyn.Tests, Microsoft.Aspire.Tests (+E2E), Microsoft.CSharp.Tests, Apps.Tests, Mcp.Tests, OS.Tests.Unit, Architecture.Tests; then live via `dotnet run digitalbrain.cs` + `digitalbrain-mcp`.

## Risk assessment

**Messy rebase shading into a partial rewrite — not a clean lift.** The two branches independently evolved the *same*
Aspire candidate/deployment and Apps/Studio code (os-runtime renamed `Cluster→Deployment` over 406 commits while a3 adds
`Cluster/BuildSandbox.cs` and edits `ClusterNeuron`). What breaks first is the Aspire module, then the CSharp sandbox, then
the Architecture gate. Estimate: ~23 manual conflict resolutions across 8 subsystems + a semantic integration pass —
**2–4 focused days** by someone fluent in both designs, plus a live verification cycle.

## Recommendation

**Cherry-pick / port a curated subset — not a straight merge, and not a full rebase.** a3 is largely *superseded* in
Aspire-cluster and Apps-Studio (the exact 12 files that conflict) but *unique and valuable* in the **Builders engine +
Engineer + Roslyn module**. Strongest single reason: os-runtime has 406 commits of independent evolution in precisely the
areas a3 rewrote, so a merge re-imposes a3's older designs and forces reconciling two parallel ones. Port the genuinely new
parts (Builders/Engineer playbooks, `src/DigitalBrain.Modules/Microsoft/Roslyn/**`, the compatibility gate) onto
os-runtime and leave the rest parked.
