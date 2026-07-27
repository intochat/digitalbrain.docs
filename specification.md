---
title: Specification
---

# Specification

Executable product proofs live in the test tiers. Each row names what fails if the behaviour breaks.

| Tier | Project | What it proves |
| --- | --- | --- |
| L0 | `DigitalBrain.Tests` | Public surface and vocabulary: no shipped package exports a MAF type, Aspire hosting exposes no Kernel type, module vocabulary stays within its domain, grain-key encoding rejects malformed identity, client send activates before firing, and the Flutter wire golden matches the Contracts assembly |
| L0 | `DigitalBrain.Behaviors.Tests` | Behavior SDK program, context, manifest, and identity contracts, and deterministic canonical artifacts — not a compiler, broker, worker, or installed execution |
| L1 | `DigitalBrain.TestingTests` | The testing product itself: fixture lifecycle, journals, clock, and closed faults |
| L1 | `DigitalBrain.Quickstart.Tests` | External-author greeter durability |
| L1 | `DigitalBrain.Time.Tests` | Durable `ICountdown` lifecycle and recovery, with the Orleans reminder as wake authority |
| L1 | `DigitalBrain.Tasks.Tests` | Task Start and Cancel lifecycle through a test-only `IWorker` |
| L1 | `DigitalBrain.ModuleTests` | Typed LLM smoke; Concurrent and GroupChat `Respond` with multiple participants and session reuse |
| L1 | `DigitalBrain.Integrations.Tests` | Gmail `ReadMessage` admission and annotation refusal; Salesforce propose, reject, and approve on a scripted MCP edge |
| L1 | `DigitalBrain.Flutter.Tests` | Flutter vocabulary journals (`IShell` / `IScene` facts) |
| L1 | `DigitalBrain.Ui.Tests` | The C# northbound HTTP edge and SSE shell events |
| L1 | `DigitalBrain.Compositions.Tests` | Pre-Behavior-rail OS compositions over `IDigitalBrain` and contracts only |
| L2 | `DigitalBrain.HostTests` | AppHost fixture exclusivity, and an executable health proof for the TestingAppHost silo |

This page is authored markdown. Behavior proposal and installation remain designed and unbuilt —
these tiers prove modules, edges, and samples, not installed Behaviors.

A test belongs here only if it fails when product behaviour breaks. Project counts, package counts,
assembly references, and filesystem layout are not product behaviour, and pins on them were removed.

Current status and authority live in [Architecture](/architecture).
