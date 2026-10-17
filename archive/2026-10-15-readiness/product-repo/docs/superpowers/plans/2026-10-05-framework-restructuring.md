# Framework Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the eight-project host lattice into three framework rings — `DigitalBrain` (vocabulary), `DigitalBrain.Framework` (host runtime for module authors), `DigitalBrain.Platform` (credential ring) — cut along the boundaries the system actually enforces.

**Architecture:** The script-visibility boundary is enforced at runtime (`PlatformAssemblyAttribute` + `ContractVocabulary`), not by the project graph, so the compile-time lattice must match the real audiences: scripts/clients see the vocabulary; module authors reference the Framework; host composers additionally reference Platform. `DigitalBrain.Kernel.AspNetCore`, `DigitalBrain.Sdk`, and `DigitalBrain.Platform.Contracts` fold into the Kernel, the Kernel absorbs the host-facing half of `DigitalBrain.Contracts`, the script-facing half folds into `DigitalBrain`, and the merged Kernel renames to `DigitalBrain.Framework`.

**Tech Stack:** .NET 11, Orleans, git mv + sed-driven namespace sync (Git Bash), per-project `dotnet build`/`dotnet test` (never the `.slnx`).

**Spec:** The ratified direction lives in this conversation and extends `docs/superpowers/specs/2026-09-29-programmable-brain-vision-design.md`. Summary of the ratified decisions:

| Package | Persona | Contents |
|---|---|---|
| `DigitalBrain` | scripts (via ScriptContracts), clients, module `*.Contracts` | the four words + Data, Types, Signals, Edge.V1, AccountRef/IConnectionRequests, DigitalBrainNames, DigitalBrainConfiguration, IModuleOptions, ModuleId, Platform attributes |
| `DigitalBrain.Framework` | module authors | neuron runtime, `Module` declaration (ISiloBuilder), enforcement, composition, http (ex-AspNetCore), sdk helpers (ex-Sdk), platform-facing interfaces (ex-Platform.Contracts) |
| `DigitalBrain.Platform` | host composers only | credential-ring implementation; keeps `PlatformAssemblyAttribute` |
| `DigitalBrain.Client` / `.Client.Orleans` | external apps | unchanged; after the split they reference only the vocabulary |

## Audit findings (2026-10-05)

Product strings inside framework rings, and their disposition:

1. `CallerContextStamper.RequestContextKey = "intochat.caller-context"` (Kernel) — **fix in this migration** (Task 7). Orleans `RequestContext` is per-call, transient, never persisted.
2. `"intochat.account"` / `"intochat.brain"` claims (Platform Identity) — **deferred**: baked into issued cookies; renaming invalidates sessions. Needs its own change with a dual-read window.
3. `"intochat-identity-directory"`, `"intochat-grants-"` (Platform.Contracts `Accounts`) — **deferred**: persisted neuron ids; renaming orphans stored state. Needs a data migration.
4. `"x-intochat-*"` schema extension keys (Sdk `SchemaExtensions`) — **deferred**: wire format consumed by the Flutter shell; must be renamed in the same change as the Dart side.
5. `DigitalBrainNames.GrainStateContainer = "digitalbrain-v2-state"` etc. — clean, no action.
6. CLAUDE.md says the module declaration lives in the module's Contracts assembly — **stale**: all 20 `Module` subclasses live in module *runtime* assemblies. Fixed in Task 8.

Deferred items 2–4 are recorded here as named violations ("product strings in the framework") so they aren't lost; none of them block the structural migration because namespaces are not part of any persisted or wire format (Orleans types carry explicit `[Alias]`s, grain state binds by alias/id).

## Global Constraints

- Build/test per project only, never `DigitalBrain.slnx` (Windows handshake bug). The `.slnx` file still must be kept path-correct for IDE use.
- Persisted grain state: never rename an `[Alias]`, never renumber `[Id(n)]`. Namespace/class renames are safe only because aliases are explicit — verify no moved type lacks an alias if it is serialized.
- `DigitalBrain` (vocabulary) may reference only `Microsoft.Orleans.Sdk` (PrivateAssets) + `Microsoft.Orleans.Core.Abstractions`. No Orleans.Runtime, no ASP.NET, ever.
- Module `*.Contracts` projects may reference only `DigitalBrain` after the split; module runtime projects reference `DigitalBrain.Framework` (+ their own contracts).
- Every phase ends green: `dotnet build` of the touched projects + the named test suites pass before the commit.
- All sed/grep commands run in **Git Bash** from the repo root; always exclude `obj/` and `bin/`.
- Architecture-test baselines (`src/Testing/tests/DigitalBrain.Architecture.Tests/*.json`) reference project/type names; update them where the tests demand, never loosen the tests themselves.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Duplicate using directives after folds** — sed replacement produces two identical `using DigitalBrain.Framework;` lines; CS0105 warnings (or errors under warnaserror). Each fold task carries a dedupe step.
2. **Module contracts projects accidentally gaining a Framework reference** — would leak Orleans hosting into script-visible assemblies again. Task 6 ends with a grep gate proving no `*.Contracts.csproj` references Framework.
3. **`ModuleInventory` contract anchors** — it prepends `typeof(DigitalBrainNames).Assembly` and `typeof(INeuron).Assembly`; after the split both types live in one assembly and `ExtractionFacts` asserts the exact assembly list. Task 6 updates both.
4. **Config-bound class names** — `KernelCorsOptions` binds from configuration; this plan renames namespaces, not that class or any configuration key. `ConfigurationKeyOwners.json` must end the migration byte-identical (keys are owned by module ids, not project names) — verified in Task 9.
5. **The sandbox's implicit `<Using Include="DigitalBrain" />`** (`SandboxRuns.cs`) — vocabulary types moving into namespace sub-roots (`DigitalBrain.Signals` etc.) are NOT auto-imported; scripts and generated behaviors import namespaces explicitly. Task 6 runs the CSharp module suite (script edge + sandbox) to prove scripts still compile.

---

### Task 1: Fold DigitalBrain.Kernel.AspNetCore into DigitalBrain.Kernel

**Files:**
- Move: `src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/{Enforcement/BrainAccessFilter.cs, Enforcement/BrainRoutes.cs, IHttpModule.cs, ModuleEndpoints.cs}` → `src/DigitalBrain/Kernel/DigitalBrain.Kernel/Http/` (BrainAccessFilter/BrainRoutes keep going to `Enforcement/`)
- Modify: `src/DigitalBrain/Kernel/DigitalBrain.Kernel/DigitalBrain.Kernel.csproj` (add `<FrameworkReference Include="Microsoft.AspNetCore.App" />`)
- Delete: `src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/` (project + csproj)
- Modify: every csproj referencing `DigitalBrain.Kernel.AspNetCore.csproj` (15 projects: Aspire.Server, Kernel.Tests.Unit, Platform, Sdk, Apps, Assistant, Compute, Files, Flutter, Gmail, Microsoft.Aspire, CSharp, Salesforce, Supabase, Testing.E2E), `DigitalBrain.slnx`
- Modify: the 35 files with `using DigitalBrain.Kernel.AspNetCore;`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: namespace `DigitalBrain.Kernel` now contains `IHttpModule`, `ModuleEndpoints`, `BrainRoutes`, `BrainAccessFilter`. Later tasks assume `DigitalBrain.Kernel.AspNetCore` no longer exists anywhere.

- [ ] **Step 1: git mv the four files**

```bash
cd /e/intochat/digitalbrain
mkdir -p src/DigitalBrain/Kernel/DigitalBrain.Kernel/Http
git mv src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/Enforcement/BrainAccessFilter.cs src/DigitalBrain/Kernel/DigitalBrain.Kernel/Enforcement/
git mv src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/Enforcement/BrainRoutes.cs src/DigitalBrain/Kernel/DigitalBrain.Kernel/Enforcement/
git mv src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/IHttpModule.cs src/DigitalBrain/Kernel/DigitalBrain.Kernel/Http/
git mv src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore/ModuleEndpoints.cs src/DigitalBrain/Kernel/DigitalBrain.Kernel/Http/
```

- [ ] **Step 2: namespace sync + dedupe usings**

```bash
grep -rl 'DigitalBrain\.Kernel\.AspNetCore' --include='*.cs' src | grep -v /obj/ | xargs sed -i 's/DigitalBrain\.Kernel\.AspNetCore/DigitalBrain.Kernel/g'
# dedupe identical using lines produced by the replacement
grep -rl 'using DigitalBrain.Kernel;' --include='*.cs' src | grep -v /obj/ | xargs -I{} perl -i -ne 'print unless $seen{$_}++ && /^using /' {}
```

- [ ] **Step 3: add the ASP.NET framework reference to Kernel.csproj, retarget the 15 referencing csprojs to `DigitalBrain.Kernel.csproj` (dropping the line entirely where a `DigitalBrain.Kernel.csproj` reference already exists), remove the project from `DigitalBrain.slnx`, delete the empty project folder with `git rm -r src/DigitalBrain/Kernel/DigitalBrain.Kernel.AspNetCore`. Move the `InternalsVisibleTo DigitalBrain.Kernel.Tests.Unit` already present in Kernel (no change needed — AspNetCore's only IVT was the same test project).**

- [ ] **Step 4: build + test**

```bash
dotnet build src/DigitalBrain/Kernel/DigitalBrain.Kernel && dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit && dotnet build src/DigitalBrain/OS/DigitalBrain.OS
```
Expected: all green. OS building proves every module still compiles (it references them all).

- [ ] **Step 5: Commit** `refactor: fold Kernel.AspNetCore into the Kernel — one host, one http surface`

### Task 2: Fold DigitalBrain.Platform.Contracts into the Kernel

**Files:**
- Move: all of `src/DigitalBrain/Platform/DigitalBrain.Platform.Contracts/{Auth,Identity,Integrations,Secrets}/*.cs` → `src/DigitalBrain/Kernel/DigitalBrain.Kernel/Platform/{Auth,Identity,Integrations,Secrets}/`
- Delete: `Platform.Contracts` project, its `AssemblyInfo.cs` (`[assembly: PlatformAssembly]` must NOT travel — the Kernel is never a contracts assembly, and Platform impl keeps its own marker in `PlatformAssembly.cs`)
- Modify: csprojs referencing `DigitalBrain.Platform.Contracts.csproj` (Sdk, Platform, AI.Contracts? — re-grep at execution time), `DigitalBrain.slnx`, 99 using-files

**Interfaces:**
- Produces: namespaces `DigitalBrain.Kernel.Platform.{Auth,Identity,Integrations,Secrets}` (e.g. `DigitalBrain.Kernel.Platform.Secrets.ISecrets`, `...Integrations.IntegrationDefinition`). Task 6's script-edge tests (`ScriptEdgeFacts`) reference `DigitalBrain.Platform.Contracts.Secrets.ISecrets` — they change to the new names here, and their platform-invisibility assertions now pass because the Kernel assembly never enters `ContractAssemblies()` at all.

- [ ] **Step 1: git mv the folders, drop AssemblyInfo.cs**

```bash
mkdir -p src/DigitalBrain/Kernel/DigitalBrain.Kernel/Platform
for d in Auth Identity Integrations Secrets; do git mv "src/DigitalBrain/Platform/DigitalBrain.Platform.Contracts/$d" "src/DigitalBrain/Kernel/DigitalBrain.Kernel/Platform/$d"; done
git rm src/DigitalBrain/Platform/DigitalBrain.Platform.Contracts/AssemblyInfo.cs
```

- [ ] **Step 2: namespace sync + dedupe** (same dedupe one-liner as Task 1 Step 2)

```bash
grep -rl 'DigitalBrain\.Platform\.Contracts' --include='*.cs' src | grep -v /obj/ | xargs sed -i 's/DigitalBrain\.Platform\.Contracts/DigitalBrain.Kernel.Platform/g'
```

- [ ] **Step 3: retarget csprojs** — replace every `DigitalBrain.Platform.Contracts.csproj` ProjectReference with `DigitalBrain.Kernel.csproj` (drop when already present); `git rm -r` the empty project; update `.slnx`. Check `ScriptEdgeFacts` assertions that platform contracts contribute nothing: rewrite them against `DigitalBrain.Platform`'s own assembly (which stays `[PlatformAssembly]`-marked).

- [ ] **Step 4: build + test**

```bash
dotnet build src/DigitalBrain/Platform/DigitalBrain.Platform && dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit && dotnet test src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests && dotnet build src/DigitalBrain/OS/DigitalBrain.OS
```

- [ ] **Step 5: Commit** `refactor: platform-facing interfaces join the module-author surface`

### Task 3: Fold DigitalBrain.Sdk into the Kernel

**Files:**
- Move: `src/DigitalBrain/Sdk/DigitalBrain.Sdk/{Auth,Capacity,Data,Http,HttpSurfaces,Integrations,Types,Vectors}/*.cs` → matching folders under `src/DigitalBrain/Kernel/DigitalBrain.Kernel/` (merging with existing `Data/`; `Http/` merges with Task 1's)
- Move: `src/DigitalBrain/Sdk/tests/*` content → `src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit/Sdk/` (keep file names; fix their project references)
- Delete: both Sdk projects; Modify: ~20 csprojs referencing `DigitalBrain.Sdk.csproj`, `.slnx`, 64 using-files, Kernel.csproj IVT `DigitalBrain.Sdk.Tests.Unit` line removed

**Interfaces:**
- Produces: `DigitalBrain.Sdk.X` namespaces become `DigitalBrain.Kernel.X` (e.g. `DigitalBrain.Kernel.Http.ModuleHttp`, `DigitalBrain.Kernel.Data.RowQuerySql`, `DigitalBrain.Kernel.Types.TypeCatalog`).

- [ ] **Step 1: git mv folders (merge-aware)**

```bash
for d in Auth Capacity Data Http HttpSurfaces Integrations Types Vectors; do
  mkdir -p "src/DigitalBrain/Kernel/DigitalBrain.Kernel/$d"
  for f in src/DigitalBrain/Sdk/DigitalBrain.Sdk/$d/*.cs; do git mv "$f" "src/DigitalBrain/Kernel/DigitalBrain.Kernel/$d/"; done
done
```

- [ ] **Step 2: namespace sync + dedupe**

```bash
grep -rl 'DigitalBrain\.Sdk' --include='*.cs' src | grep -v /obj/ | xargs sed -i 's/DigitalBrain\.Sdk/DigitalBrain.Kernel/g'
```
(then the dedupe one-liner)

- [ ] **Step 3: move Sdk tests into the Kernel unit test project, retarget every `DigitalBrain.Sdk.csproj` reference to `DigitalBrain.Kernel.csproj` (drop duplicates), `git rm -r src/DigitalBrain/Sdk`, update `.slnx`, remove the now-dead IVT.**

- [ ] **Step 4: build + test** — same command set as Task 2 Step 4, plus `dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit`.

- [ ] **Step 5: Commit** `refactor: the Sdk was always the Kernel — module helpers come home`

### Task 4: Split DigitalBrain.Contracts — script half into the vocabulary

**Files:**
- Move into `src/DigitalBrain/DigitalBrain/` (namespace `DigitalBrain` + folder sub-namespaces):
  - `Data/{IRowSource,RowQuery,RowSchema,SourceCapabilities}.cs` → `Data/` (ns `DigitalBrain.Data`)
  - `Types/*.cs` → `Types/` (ns `DigitalBrain.Types`)
  - `Signals/{ModuleLoaded,NeuronActivated,NeuronActivity,NeuronDeactivated}.cs` → `Signals/` (ns `DigitalBrain.Signals`) — NOT `ILocalSignalHub.cs`
  - `Edge/V1/ScriptEdgeProtocol.cs` → `Edge/V1/` (ns `DigitalBrain.Edge.V1`)
  - `Integrations/{AccountRef,IConnectionRequests}.cs` → `Integrations/` (ns `DigitalBrain.Integrations`)
  - `DigitalBrainNames.cs`, `DigitalBrainConfiguration.cs`, `IModuleOptions.cs`, `ModuleId.cs`, `PlatformAssemblyAttribute.cs`, `PlatformOnlyAttribute.cs` → root (ns `DigitalBrain`)

**Interfaces:**
- Produces: vocabulary namespaces `DigitalBrain`, `DigitalBrain.Data`, `DigitalBrain.Types`, `DigitalBrain.Signals`, `DigitalBrain.Edge.V1`, `DigitalBrain.Integrations`. `ModuleId`/`IModuleOptions` now in ns `DigitalBrain`. Task 5 depends on these exact namespaces.
- Note: `DigitalBrain.csproj` needs no new packages — all moved types use only Orleans serialization attributes + BCL. If the build says otherwise, the type is in the wrong half; move it to the Kernel instead of adding a package.

- [ ] **Step 1: git mv per the list above** (mkdir folders first; one `git mv` per file, mechanical)

- [ ] **Step 2: namespace sync.** sed, ordered most-specific-first, over all `*.cs` excluding obj:

```bash
S() { grep -rl "$1" --include='*.cs' src | grep -v /obj/ | xargs -r sed -i "s/$1/$2/g"; }
S 'DigitalBrain\.Contracts\.Edge\.V1' 'DigitalBrain.Edge.V1'
S 'DigitalBrain\.Contracts\.Data' 'DigitalBrain.Data'
S 'DigitalBrain\.Contracts\.Types' 'DigitalBrain.Types'
S 'DigitalBrain\.Contracts\.Signals' 'DigitalBrain.Signals'
S 'DigitalBrain\.Contracts\.Integrations' 'DigitalBrain.Integrations'
```
Root-namespace (`DigitalBrain.Contracts`) users are handled in Task 5 where the remaining files get their final home.

- [ ] **Step 3: build the vocabulary alone**

```bash
dotnet build src/DigitalBrain/DigitalBrain
```
Expected: FAILS only if a moved file references a type still in Contracts (e.g. anything importing `DigitalBrain.Contracts`). Fix by trimming the using (the remaining Contracts files are host-half and not needed by the vocabulary). Then: PASS. Do not commit yet — Task 5 completes the split; Contracts no longer compiles mid-split and that is expected.

### Task 5: Split DigitalBrain.Contracts — host half into the Kernel, delete Contracts

**Files:**
- Move into `src/DigitalBrain/Kernel/DigitalBrain.Kernel/`:
  - `Module.cs` → `Composition/` (ns `DigitalBrain.Kernel`)
  - `Enforcement/{CallerContext,ICallFilter}.cs` → `Enforcement/` (ns `DigitalBrain.Kernel.Enforcement`)
  - `IntentContext.cs` (the `IIntentUsageEntry`/`IntentUsageBatch` shapes) → merge into `src/DigitalBrain/Kernel/DigitalBrain.Kernel/IntentContext.cs` (ns `DigitalBrain.Kernel`) — one file, one concept
  - `Signals/ILocalSignalHub.cs` → root (ns `DigitalBrain.Kernel`)
- Delete: `src/DigitalBrain/DigitalBrain.Contracts/` entirely
- Modify: ~24 csprojs referencing `DigitalBrain.Contracts.csproj`; the two-audience retarget is the heart of the task:
  - module `*.Contracts` projects + `Client` + `Client.Orleans` + `Aspire.Hosting` → reference `src/DigitalBrain/DigitalBrain/DigitalBrain.csproj`
  - everything else (runtime projects already referencing Kernel) → drop the line
- Modify: `ModuleInventory.ContractAssemblies()` — the two `Prepend`s collapse to one (`typeof(INeuron).Assembly`); `ContractVocabulary`, `ExtractionFacts`, `CompositionBoundaryFacts` updated to the single-assembly reality.

**Interfaces:**
- Consumes: Task 4's vocabulary namespaces.
- Produces: `DigitalBrain.Contracts` namespace ceases to exist. `Module`, `ModuleId` usage sites: declarations say `using DigitalBrain; using DigitalBrain.Kernel;` (runtime assemblies — verified fine, all 20 declarations are runtime-side).

- [ ] **Step 1: git mv per the list; merge the two IntentContext files by prepending the record + marker interface to the Kernel file.**

- [ ] **Step 2: namespace sync for the leftovers, audience-aware**

```bash
# module contracts projects (+ Client): vocabulary only
grep -rl 'DigitalBrain\.Contracts\.Enforcement' --include='*.cs' src | grep -v /obj/ | xargs -r sed -i 's/DigitalBrain\.Contracts\.Enforcement/DigitalBrain.Kernel.Enforcement/g'
grep -rl 'using DigitalBrain\.Contracts;' --include='*.cs' src | grep -v /obj/ | while read f; do
  case "$f" in
    *Contracts*|*Client*) sed -i 's/using DigitalBrain\.Contracts;/using DigitalBrain;/' "$f" ;;
    *) sed -i 's/using DigitalBrain\.Contracts;/using DigitalBrain;\nusing DigitalBrain.Kernel;/' "$f" ;;
  esac
done
# remaining qualified references
grep -rl 'DigitalBrain\.Contracts' --include='*.cs' src | grep -v /obj/ | xargs -r sed -i 's/DigitalBrain\.Contracts/DigitalBrain/g'
```
(then dedupe; expect a handful of hand-fixes where a Contracts type went to the Kernel but the file is vocabulary-audience — the compiler lists them)

- [ ] **Step 3: retarget the ~24 csprojs per the audience table, `git rm -r src/DigitalBrain/DigitalBrain.Contracts`, update `.slnx`, fix `ModuleInventory`/`ContractVocabulary`/`ExtractionFacts`:** `ExtractionFacts.AnEmptyCompositionStillExposesTheWordsAndTheKernelContracts` asserts `["DigitalBrain"]` only, and `TheDigitalBrainAssemblyExportsOnlyTheWords` extends its expected list with the moved vocabulary types (keep the test — it is the guard on the script surface).

- [ ] **Step 4: build + test the world**

```bash
dotnet build src/DigitalBrain/DigitalBrain && dotnet build src/DigitalBrain/OS/DigitalBrain.OS \
  && dotnet test src/DigitalBrain/Kernel/tests/DigitalBrain.Kernel.Tests.Unit \
  && dotnet test src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests \
  && dotnet test src/DigitalBrain/Client/tests/DigitalBrain.Client.Tests.Unit \
  && dotnet test src/Testing/tests/DigitalBrain.Architecture.Tests
```
Architecture baselines (`PersistedStateIds.json` etc.): if a baseline diff consists purely of namespace renames of the same aliases/ids, regenerate it the way its test instructs; any alias or id change is a STOP — that would be a persisted-state break.

- [ ] **Step 5: gate — no contracts assembly references the Kernel**

```bash
grep -l 'DigitalBrain.Kernel.csproj' src/Modules/*/*Contracts*/*.csproj src/Modules/*/*/*Contracts*/*.csproj src/DigitalBrain/Client/*/*.csproj 2>/dev/null
```
Expected: no output.

- [ ] **Step 6: Commit** `refactor: the vocabulary is whole and the contracts ring is gone`

### Task 6: Script-surface regression proof

**Files:** none new — this task exists so the sandbox reality gets its own gate.

- [ ] **Step 1: run the full CSharp module suite (script edge, sandbox runs, contract vocabulary)**

```bash
dotnet test src/Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests
```
Expected: PASS, including `ScriptEdgeFacts` (platform invisibility via `DigitalBrain.Platform` assembly) and `SandboxRunsFacts` (implicit `using DigitalBrain` still resolves the words).

- [ ] **Step 2: run the Apps verification suite (the publish gate exercises ScriptContracts end to end)**

```bash
dotnet test src/Modules/DigitalBrain/Apps/tests/DigitalBrain.Modules.Apps.Tests
```
(adjust to the actual test project path found at execution time; a compile-only pass is acceptable for live-gated scenarios)

- [ ] **Step 3: Commit** only if fixes were needed; otherwise proceed.

### Task 7: Rename DigitalBrain.Kernel → DigitalBrain.Framework

**Files:**
- Move: `src/DigitalBrain/Kernel/` → `src/DigitalBrain/Framework/`; `DigitalBrain.Kernel.csproj` → `DigitalBrain.Framework.csproj`; tests `DigitalBrain.Kernel.Tests.Unit|E2E` → `DigitalBrain.Framework.Tests.Unit|E2E`
- Modify: every `*.cs` with `DigitalBrain.Kernel` (300+), every csproj/slnx path, IVT lines, `RootNamespace`, `CallerContextStamper.RequestContextKey` → `"digitalbrain.caller-context"` (audit finding 1; transient key, safe)

**Interfaces:**
- Produces: namespace `DigitalBrain.Framework` everywhere the Kernel was; `DigitalBrain.Kernel` token no longer exists in the tree (gate below).

- [ ] **Step 1: git mv the directory and project files**

```bash
git mv src/DigitalBrain/Kernel src/DigitalBrain/Framework
git mv src/DigitalBrain/Framework/DigitalBrain.Kernel src/DigitalBrain/Framework/DigitalBrain.Framework
git mv src/DigitalBrain/Framework/DigitalBrain.Framework/DigitalBrain.Kernel.csproj src/DigitalBrain/Framework/DigitalBrain.Framework/DigitalBrain.Framework.csproj
git mv src/DigitalBrain/Framework/tests/DigitalBrain.Kernel.Tests.Unit src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.Unit
git mv src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.Unit/DigitalBrain.Kernel.Tests.Unit.csproj src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.Unit/DigitalBrain.Framework.Tests.Unit.csproj
git mv src/DigitalBrain/Framework/tests/DigitalBrain.Kernel.Tests.E2E src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E
git mv src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/DigitalBrain.Kernel.Tests.E2E.csproj src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.E2E/DigitalBrain.Framework.Tests.E2E.csproj
```

- [ ] **Step 2: token sync across cs/csproj/slnx/json baselines**

```bash
grep -rl 'DigitalBrain\.Kernel\|Kernel/DigitalBrain' --include='*.cs' --include='*.csproj' --include='*.slnx' --include='*.json' src DigitalBrain.slnx | grep -v /obj/ | grep -v /bin/ \
  | xargs sed -i -e 's/DigitalBrain\.Kernel/DigitalBrain.Framework/g' -e 's|Kernel/DigitalBrain\.Framework|Framework/DigitalBrain.Framework|g' -e 's|/Kernel/|/Framework/|g'
sed -i 's/"intochat\.caller-context"/"digitalbrain.caller-context"/' src/DigitalBrain/Framework/DigitalBrain.Framework/Enforcement/CallerContextStamper.cs
```

- [ ] **Step 3: gate — the old name is gone**

```bash
grep -rn 'DigitalBrain\.Kernel' --include='*.cs' --include='*.csproj' --include='*.slnx' src DigitalBrain.slnx | grep -v /obj/ | grep -v /bin/
```
Expected: no output. (Doc hits are Task 8's.)

- [ ] **Step 4: build + full test sweep**

```bash
dotnet build src/DigitalBrain/OS/DigitalBrain.OS \
  && dotnet test src/DigitalBrain/Framework/tests/DigitalBrain.Framework.Tests.Unit \
  && dotnet test src/DigitalBrain/Platform/tests/DigitalBrain.Platform.Tests.Unit \
  && dotnet test src/DigitalBrain/OS/tests/DigitalBrain.OS.Tests.Unit \
  && dotnet test src/Testing/tests/DigitalBrain.Architecture.Tests
```

- [ ] **Step 5: Commit** `refactor: the Kernel grows up and is named the Framework`

### Task 8: Documentation sync

**Files:**
- Modify: `CLAUDE.md` — Layout line (Kernel ring → Framework ring; the three-package table), fix the stale "module declaration (Contracts)" sentence (declarations live in module runtime assemblies), fix test-path examples
- Modify: `src/DigitalBrain/DigitalBrain/README.md` (whatever references the old lattice)
- Create: `docs/superpowers/specs/2026-10-05-framework-restructuring.md` — a short ratification note: the persona/package table, the "runtime enforces the boundary, projects mirror the audiences" principle, and the deferred audit items (2–4 above) as named follow-ups
- Modify: `docs/superpowers/specs/2026-10-05-module-identity-amendment.md` only where it names project paths that moved (do not rewrite ratified prose)

- [ ] **Step 1: write the edits; grep docs for stragglers**

```bash
grep -rn 'Kernel\.AspNetCore\|DigitalBrain\.Sdk\|Platform\.Contracts\|DigitalBrain\.Contracts' CLAUDE.md docs/superpowers/specs/2026-10-05-module-identity-amendment.md src/DigitalBrain/DigitalBrain/README.md
```
Fix every hit or justify leaving it (historical spec prose describing its own moment stays).

- [ ] **Step 2: Commit** `docs: the three rings, written down`

### Task 9: Final verification — the whole OS breathes

- [ ] **Step 1: clean build of every top-level deliverable**

```bash
dotnet build src/DigitalBrain/OS/DigitalBrain.OS && dotnet build src/DigitalBrain/AppHost/DigitalBrain.AppHost && dotnet build src/DigitalBrain/Client/DigitalBrain.Client && dotnet build src/DigitalBrain/Deployment/DigitalBrain.Deployment && dotnet build src/DigitalBrain/Mcp/DigitalBrain.Mcp
```

- [ ] **Step 2: confirm `ConfigurationKeyOwners.json` unchanged** (`git diff --stat src/Testing/tests/DigitalBrain.Architecture.Tests/ConfigurationKeyOwners.json` → empty): the migration moved code, never configuration keys.

- [ ] **Step 3: aspire smoke** — `aspire run` from `src/DigitalBrain/AppHost/DigitalBrain.AppHost`, wait for all resources Healthy, stop.

- [ ] **Step 4: module suite spot-run** (Time is the smallest full module; Gmail exercises integrations):

```bash
dotnet test src/Modules/Time/tests/DigitalBrain.Modules.Time.Tests && dotnet test src/Modules/Google/Gmail/tests/DigitalBrain.Modules.Google.Gmail.Tests
```
(adjust paths to the actual test project names found at execution time)

- [ ] **Step 5: Commit any verification fixes;** the branch is ready for review.
