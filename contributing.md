---
title: Contributing
---

# Contributing

These are not style preferences. They are the rules that keep the framework's promises checkable.
`CLAUDE.md` in the repository is the canonical working discipline; [Architecture](/architecture) is
the plan of record.

## The gate

Run it at every phase and before any completion claim:

```powershell
dotnet build DigitalBrain.slnx -c Release
dotnet test DigitalBrain.slnx -c Release --logger "console;verbosity=minimal"
npm --prefix docs test
npm --prefix docs run build
```

**Never narrow the root test with `--filter`** — a project-scoped run has already missed a failing
contract that the root run caught.

## Three tiers of test

**L0 — contract.** No cluster. Public surface, vocabulary, wire goldens, and guarantees provable
without hosting anything.

**L1 — in-process cluster.** Method-scoped `TestBrain` against a real multi-silo Orleans cluster and
typed committed journals. This is where product behaviour is proven, and it is the default depth.

**L2 — hosted proof.** A real Aspire application: AppHost graph health and host proofs. Slow, few,
load-bearing.

### What a test must earn

> A test earns its place by failing when **product behaviour** breaks. It does not earn its place by
> failing when the **build graph** changes.

A pin on project counts, package counts, assembly references, or filesystem layout is theater: it
restates the build system to itself, and it fails on upgrades that broke nothing. Prefer product
types and product constants over test-local string tables, and runtime evidence over source-grep.

If a guard's expected value is a magic number you would update rather than investigate, delete the
guard.

## Writing a change

**Write the failing proof first.** Prefer an L1 test on `TestBrain` / `TestNeuron` with journal
evidence. Watch it fail, then make it pass, then run the gate. When the behaviour is not coming yet,
keep the proof and exclude it with `[Fact(Explicit = true)]` rather than deleting it. The root gate is
never red.

**Grill your own diff before you commit.** Three questions, answered in the commit message:

- What did I add that has no consumer today?
- What did I claim without running a command to check?
- What changed that I did not change?

The third matters more than it sounds. This repository has been modified mid-session by other tools;
if something moved that you did not move, say so and stop rather than sweeping it into your commit.

**Evidence precedes assertion.** "The tests pass" is not a claim you may make without the output in
front of you. If a step was skipped, say so. If something failed, say so with the failure.

## Comments are forbidden

Comments are forbidden as narrative, boilerplate, or commented-out code, in any tracked C#,
PowerShell, YAML, XML, or MSBuild file. No XML documentation comment restating a signature.

A comment is an assertion nothing checks, and it rots silently while the code beside it changes. Put
the meaning where it can be verified: in a name, a type, a test, or a smaller function —
`[Fact(DisplayName = "…")]` is the supported way to make a test self-describing. If a piece of code
needs a paragraph to explain, the paragraph is evidence the code is the wrong shape.

Prose belongs in `README.md`, `CLAUDE.md`, and this website.

## Naming

Names carry the explanation. `committedOutgoing` beats `count` plus a comment saying what was
counted. Reviewers are expected to push back on a name that needs help.

## Dependencies

Every version is pinned exactly in `Directory.Packages.props`. Central Package Management is on, so a
floating range or wildcard is a build error, not a convention.

## The security boundary

Provider SDKs live only in their owning runtime module — today `DigitalBrain.Modules.AI`, with its
Aspire integrations in `DigitalBrain.Modules.AI.Aspire.Hosting`. Kernel, AI Contracts, and every
consumer-path package stay provider-free.

An API key must never appear in the repository, in a test, in a sample, or in a publish manifest.

## Deleting

Delete before you add. Dead code, stale plans, superseded documents, and flaky tests are liabilities.
A flaky test is worse than a missing one: it teaches the team to ignore red. If a scenario cannot be
made deterministic, delete it and record why rather than retrying it in a loop.

## Honesty

Never tick a box that is not fully met, and never describe something as proven when it is merely
implemented. Where a guarantee is incomplete, say so plainly — a limitation a user discovers
themselves costs far more than one you wrote down.

## CI and CD

Two workflows. Nothing packs or pushes to NuGet.org until there is a real consumer and a versioning
design.

| Workflow | When | What |
| --- | --- | --- |
| [`ci.yml`](https://github.com/intochat/digitalbrain/blob/master/.github/workflows/ci.yml) | PR and push to `master` | `framework`: the root test on every event. `docs`: the docs gate on pull requests only. |
| [`docs-pages.yml`](https://github.com/intochat/digitalbrain/blob/master/.github/workflows/docs-pages.yml) | Push to `master`, plus dispatch | The docs gate, then deploy `docs/.vitepress/dist` to https://digitalbrain.tech. |

The website deploy does not wait on the framework job: a red framework check must not block Pages,
though it should still block merge. Master runs the docs gate once, inside `docs-pages`, so the site
is not double-built on every land.
