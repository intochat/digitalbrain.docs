# Aspire 3/3 — Compatibility Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every candidate is classified `Compatible` or `Breaking(reasons)` by a Roslyn diff of the live and candidate builds; `Promote` rolls compatible changes and restarts breaking ones; an interface change without a `[Version]` bump fails verification. CLAUDE.md's state-compatibility hazard is rewritten.

**Architecture:** `ContractDiff` (pure, in the Aspire module) loads two build folders' `DigitalBrain.dll` and `*.Contracts.dll` as Roslyn `MetadataReference`s into two `CSharpCompilation`s and compares public types: grain interfaces (methods, `[Alias]`, `[Version]`), `[GenerateSerializer]` types (`[Id]` → name/type), signals. Grain *state* types live in module assemblies, so the module assemblies (`DigitalBrain.Modules.*.dll`, excluding tests) are diffed for `[GenerateSerializer]` types only. `CandidateNeuron.Verify` runs it after the MCP checks and stores the result; `Promote` routes.

**Tech Stack:** Microsoft.CodeAnalysis.CSharp (already central in `Directory.Packages.props` — confirm), Orleans attributes.

**Spec:** `docs/superpowers/specs/2026-10-10-aspire-instance-neuron-design.md` (build order step 3, "Compatibility gate"). **Requires plans 1 and 2 merged.**

## Global Constraints

- All Global Constraints of plan 1 apply.
- Classification is deterministic code; no model is consulted.
- Rule table (verbatim from the spec): added type, member, field with a new `[Id]`, signal, method → compatible. Removed/renamed member, changed `[Id]`, changed parameter or return type, changed grain type alias → breaking, with each reason named. A changed grain interface without a bumped `[Version]` → refused at `Verify` (`Failed(Verify, "version not bumped: …")`).
- Policy text for CLAUDE.md (verbatim from the spec): "Compatible changes roll, breaking changes restart. … Still no migrations and no legacy shims."

## Review Focus

- A method *added* to a grain interface is compatible but still changes the interface: it requires a `[Version]` bump (old silos cannot serve the new method); missing bump → refused.
- A record's positional parameter renamed but `[Id]` unchanged: serialization-compatible; JSON storage uses names — classify as **breaking** for state types (JSON storage) and compatible for wire-only types. State types = types used as `Neuron<TState>`/`IPersistentState<T>` generic arguments in module assemblies.
- Nullable annotation changes only (`string` → `string?`) → compatible, never reported.
- A whole contracts assembly added (new module) → compatible; removed → breaking.
- Generated code (`OrleansCodeGen` namespaces, compiler-generated types) is ignored, otherwise every build looks breaking.

---

### Task 1: ContractDiff

**Files:**
- Create: `src/DigitalBrain.Modules/Microsoft/Aspire/DigitalBrain.Modules.Microsoft.Aspire/Compatibility/ContractDiff.cs`, `Compatibility/Compatibility.cs`
- Create contract: `Contracts/CompatibilityVerdict.cs`
- Test: `tests/.../ContractDiffFacts.cs`

```csharp
[GenerateSerializer, Alias("aspire.compatibility")]
public sealed record CompatibilityVerdict(
    [property: Id(0)] bool Breaking,
    [property: Id(1)] string[] Reasons,       // breaking reasons
    [property: Id(2)] string[] Unversioned);  // grain interfaces changed without a [Version] bump

internal static class ContractDiff
{
    public static CompatibilityVerdict Compare(string liveBuild, string candidateBuild);          // folders
    internal static CompatibilityVerdict Compare(CSharpCompilation live, CSharpCompilation candidate); // for facts
}
```

Facts compile two small C# sources to in-memory compilations (`CSharpCompilation.Create(..., references: Basic.Reference.Assemblies or the test's own runtime references + Orleans.Serialization.Abstractions + Orleans.Core.Abstractions)`) and call the internal overload. One fact per rule:

- [ ] **Step 1: Failing facts:**
  - `AnAddedFieldWithANewIdIsCompatible`
  - `ARemovedFieldIsBreakingAndNamed` → reason `"Foo.Bar removed"`
  - `AChangedIdIsBreaking`
  - `AChangedParameterTypeIsBreaking`
  - `AChangedAliasIsBreaking`
  - `AnAddedGrainMethodWithoutAVersionBumpIsUnversioned`
  - `AnAddedGrainMethodWithAVersionBumpIsCompatible`
  - `ARenamedStatePropertyIsBreakingEvenWithTheSameId` (state type = used as `Neuron<T>` argument)
  - `NullableAnnotationsAloneAreNotAChange`
  - `GeneratedCodeIsIgnored`
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with `INamedTypeSymbol` walks: `GetTypeByMetadataName` across both, member signatures via `SymbolDisplayFormat` with nullable annotations stripped (`SymbolDisplayMiscellaneousOptions` without `IncludeNullableReferenceTypeModifier`), attributes by `AttributeClass.ToDisplayString()` (`Orleans.IdAttribute`, `Orleans.AliasAttribute`, `Orleans.CodeGeneration.VersionAttribute` — confirm names with LSP). **Step 4:** PASS. **Step 5:** Commit `"Aspire: contract diff classifies compatible and breaking changes"`.

### Task 2: Classify in Verify, route in Promote

**Files:**
- Modify: `ICandidateHost` (+ `string BuildPath(string sha)`), `IClusterHost` (+ `string LiveBuildPath()`), fakes, `CandidateState` (+ `[Id(8)] CompatibilityVerdict? Verdict`), `CandidateSnapshot` (+ `[property: Id(9)] CompatibilityVerdict? Verdict`), `CandidateNeuron`
- Add seam `ICompatibilityGate { CompatibilityVerdict Classify(string live, string candidate); }` with `ContractDiffGate` implementation, `FakeGate` in tests.
- Test: `tests/.../CandidatePromotionFacts.cs`

`Verify`: after a passing MCP report, `var verdict = gate.Classify(cluster.LiveBuildPath(), host.BuildPath(Sha))`; if `verdict.Unversioned.Length > 0` → `Fail($"version not bumped: {string.Join(", ", verdict.Unversioned)}", removeContainer: true)`; else save `Verdict` with `Verified`.
`Promote`: `if (Snapshot.Verdict!.Breaking) await Cluster.Restart(Sha); else await Cluster.Roll(Sha);` — a `Roll` failure (`InvalidOperationException`) → `Fail(..., removeContainer: true)` at `Promoting`.

- [ ] **Step 1: Failing facts:** `ACompatibleCandidateIsPromotedByRolling`, `ABreakingCandidateIsPromotedByRestarting`, `AnUnversionedInterfaceChangeFailsVerification`, `AFailedRollFailsThePromotionAndKeepsTheClusterOnThePreviousSha`.
- [ ] Steps 2–4. **Step 5:** Update plan-1 `CandidateFacts` that asserted `Restarts == 1` to set `FakeGate` breaking. **Step 6:** Commit `"Aspire: promote rolls compatible candidates and restarts breaking ones"`.

### Task 3: Version bumps on existing interfaces and the policy text

**Files:**
- Modify: `CLAUDE.md` Hazards — replace the "No state compatibility" bullet and the "A reshaped grain state fails at activation…" bullet with:

```markdown
- **Compatible changes roll, breaking changes restart.** Additive changes (new state fields with new
  `[Id]`s, new methods, grains, signals) roll silo by silo; a changed grain interface bumps its
  `[Version]`. Renames, removals and changed signatures are allowed but promote by a cold restart.
  The Aspire compatibility gate classifies every candidate; no model decides. No migrations, no
  legacy shims.
```

- Modify: `features/os/SelfImprove/failed.cs` / `RenderListAsync` show the verdict (`compatible` / `breaking: reasons`).
- Modify: Creator/Builder prompts that describe state rules — find via text search in `Apps/Authoring/AgentPrompts.cs` for "state" guidance; add the one-sentence rule if they author C# contracts (they author synapses only today → no change; note it).

- [ ] Steps: edit; compile-check features; commit `"Policy: compatible changes roll, breaking changes restart"`.

### Task 4: Verification loop

- [ ] **Step 1:** Run the system (two replicas).
- [ ] **Step 2:** Additive candidate (new Calculator operation, no contract change) → verdict compatible → rolled; health loop shows no downtime.
- [ ] **Step 3:** Candidate adding a method to a grain interface without `[Version]` → `Failed(Verify, "version not bumped: …")`; with `[Version(1)]` → rolled.
- [ ] **Step 4:** Candidate renaming a state property → breaking → restarted; app state survives on live storage (reshape only drops the renamed field).
- [ ] **Step 5:** Traces and logs confirm each path; regression suites of every touched project.
