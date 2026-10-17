# App generation assessment

Creator is implemented, and the repository already has a parser, syntax trees, compilation, and generated-code validation. The missing foundation is a consistent product contract connecting user intent, generated behavior, presentation, runtime outcomes, and release readiness.

## What exists

1. **Specification authoring.** `Creator.Author` asks a model for a readable spec, manifest, settings and slots. It creates or revises app state. Requests are bounded to 4,000 characters; malformed author output has bounded retries.
2. **Implementation.** `Creator.Implement` records a build attempt and starts work outside the grain request. Builder has up to 12 rounds, searches installed contracts, reads their definitions, and asks for compile checks.
3. **Parsing.** `AppDeclaration.Read` uses Roslyn's CSharpSyntaxTree and syntax nodes to read the static App declaration without executing it. Manifest values are restricted to supported literal forms.
4. **Compilation.** `CSharpScriptCheck` builds syntax trees, compiles against the carried runtime and contract references, emits assemblies, and caches successful outputs. C# already supplies lexical analysis and grammar.
5. **Structural checks.** `SynapseShape` requires one recognized top-level On or React reaction per behavior file. Shared type files are handled separately.
6. **Lifecycle.** App state holds specification, manifest, files, configuration, version history, build status and activity. Installation tracks origin; edits detach update eligibility; rollback exists.
7. **Presentation.** Apps publish Sphere, Side, Main and named Views through `IApp.Present`, tied to ProgramRevision. Stale assignments cannot publish a new presentation.
8. **Distribution.** Publication stores immutable release references with digests; installation verifies the selected digest and creates recipient-owned state.

See [source references](evidence.md).

## Confirmed gaps and product implications

### Generation instructions lag the current UI contract

`AgentPrompts` and `CSharpScriptSandbox.AuthoringDescription` tell the model to return an entry object. `AuthoredApp` and `BuiltApp` deserialize Entry, but the inspected Author and Build paths do not apply it. The current manifest has no Entry field. Current shipped apps explicitly call Present.

**Implication:** returning the instructed entry is insufficient to make the app appear correctly. Contract discovery might help a model discover Present, but that is not a reliable product guarantee.

**Requirement:** one current authoring contract must define startup presentation, visible results, interactions, empty/loading/error states, permissions, and revision handling. Generator examples must use that contract.

### Compilation is a type check, not behavioral acceptance

Shape validation counts recognized syntax; it does not prove business rules, idempotence, complete interaction coverage or freedom from feedback loops. Historical live evidence includes compile-successful apps with exactly these failures.

**Requirement:** a supported app is accepted by observable scenarios from its specification. Include normal use, invalid input, duplicate delivery, restart, and unavailable connections. “Live” should communicate deployment status separately from scenario acceptance.

### Publication verification has permissive branches

`AppNeuron.RequireCompiles` returns when there are no scripts, when IScriptSandbox is absent, or when compilation throws InvalidOperationException. Ordinary compile errors are rejected, but the absence/failure cases do not uphold an unconditional verification promise.

**Requirement:** define supported bundle types, then require successful applicable verification before publication/export. Missing infrastructure should produce an actionable blocked state. This finding is a source-level path, not a claim that every current publication bypasses compilation.

### Build interruption needs a user-facing recovery contract

`AppWorkQueue` starts process-local work with CancellationToken.None. Build state and attempt IDs are durable; the queued work itself is not. BeginBuild permits replacing an old build after its freshness window. Activation can mark retained working activity as interrupted.

**Requirement:** show interruption clearly, offer safe retry, preserve the last useful version, and reject late results. Do not imply that build execution necessarily resumes after restart.

### Editing is more than adding files

Builder merges returned files into the existing bundle. An omitted old behavior is not thereby removed. A product request to remove a feature needs explicit semantics for removing code, subscriptions, presentation, and possibly stored data.

**Requirement:** distinguish “remove behavior,” “hide control,” and “delete data.” Verify that an edited app no longer performs removed actions.

## App contract to adopt

Each app specification should state:

- Purpose, user, input, output, and supported environment.
- Operations with triggers, preconditions, observable outcomes, and failure behavior.
- Screen structure and the neuron containing each visible result.
- Allowed UI kinds, navigation rules, empty/loading/error states, and accessible labels.
- Data ownership, retention, deletion, and restart behavior.
- Required account slots, exact external actions, and confirmation/delegation policy.
- Duplicate-event handling, concurrency expectations and prevention of feedback loops.
- Acceptance scenarios and a clear unsupported-capability response.

This is a proposed product contract. It is not a claim that all fields are currently enforced.

## Architecture choice

Keep Roslyn as the C# language front end. Extend semantic checks and contract-derived authoring examples where they address demonstrated failures. A new lexer or custom app language would add translation and tooling complexity without resolving the observed presentation and runtime problems.

A future structured app specification may be valuable for completeness checks and UI generation. Introduce it only with a clear schema, versioning and ownership; do not confuse natural-language specifications with a machine-validated behavioral model.
