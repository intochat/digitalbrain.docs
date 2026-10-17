# Fake model server: one test-owned model, no scripted provider in production

Date: 2026-10-08 · Status: approved design, awaiting spec review

## Problem

A test double became a runtime-selectable production feature. "Use a fake model" was modelled as a
model *choice* — `AiProvider.Scripted`, the `scripted/<key>` name prefix and the `IScriptedLLM`
neuron in the AI contracts — instead of being injected at composition. Every consumer of model
names therefore learned about it: `ModelCatalog.Resolve`/`CreateClient`/`Select` (which accepts
`scripted/x` from a user), a keyed-`IChatClient` escape hatch, `AgentTurnLoop`, `ModelAddress`, and
the shipped CustomerResearcher manifest. The scripted path (`ScriptedChatClient` → neuron) also
bypasses the provider factory, streaming, usage and metering, so it never tests what production runs.

The reason it existed — the in-product publish gate driving app scenario tests by naming a model
in data — is being removed. `ScriptedModelServer` (E2E) repeats the mistake across the process
boundary: a second fake that recognises the product's own prompts by string (capital of France,
brainstorm, judge — all dead publish-gate prompts) and carries its own error side channel.

## Decision

Model selection is composition. Tests substitute the model at the provider's HTTP endpoint, a seam
that already exists (`AIOptions.WithModelEndpoint`). One fake serves the whole repo, and every test
runs the real catalog, OpenAI provider factory, streaming, usage, metering and telemetry.

## Removed from production

- AI contracts: `IScriptedLLM`, `AiProvider.Scripted`, `IScriptedLLM.ModelPrefix`, and the
  `scripted/<key>` wording in `ModelSelection`, `IModelCatalog`, `ModelAddress`.
- AI module: `ScriptedLlmNeuron`, `ScriptedLlmState`, `ScriptedChatClient`; the scripted branches in
  `ModelCatalog.Resolve`, `CreateClient` (including the keyed-`IChatClient` hook) and `Select`;
  `case AiProvider.Scripted` in `AgentTurnLoop`; `ModelAddress.IsScripted`.
- CustomerResearcher: the `scripted/<key>` Model-setting text in `app.json` and `app.spec.md`.
- E2E: `ScriptedModelServer`, `BrainFact.Model`, `ReferenceBrainFixture.Model`'s scripted type,
  `AssertNoProtocolErrors`.

Out of scope (follow-up task): CustomerResearcher's `scripted/` Browser override and `IScriptedBrowser`,
the same anti-pattern on the browser side.

## Added: `FakeModelServer`

New project `src/Testing/DigitalBrain.Testing.Model`, referenced by `DigitalBrain.Testing.Module` and
`DigitalBrain.Testing.E2E`. Depends on ASP.NET Core only — never on the AI module.

- An OpenAI Chat Completions server on `127.0.0.1:0`, endpoint `/v1/chat/completions`.
- Keyed by the request's `model` id:
  - `Script(string modelId, params Reply[] replies)` queues replies; `Reply` is text or
    `Reply.Tool(name, argumentsJson)`.
  - With nothing queued for a model, it echoes `"You said: " + lastUserMessage`.
  - `Requests(string modelId)` returns the request bodies that model received (replaces
    `IScriptedLLM.Prompts()`).
- Wire shapes:
  - Text, non-streaming: `chat.completion` with `usage`.
  - Text, streaming: delta chunk → finish chunk → usage chunk → `data: [DONE]`.
  - Tool call: `message.tool_calls` with `finish_reason: "tool_calls"`; streamed as `delta.tool_calls`.
- Errors: an exhausted script or an unparseable body returns HTTP 500 naming the model and reason.
  The product surfaces it as a provider error and the test fails at the call. No error queue, no
  assertions inside the fake, no prompt matching.

## Wiring

- Module tests: `await using var model = await FakeModelServer.StartAsync(ct);` then
  `ModuleTest.Create().WithModule<AIModule>().WithFakeModel(model)` seeds the OpenAI integration's
  `ApiKey` (dummy) and `Endpoint` (the fake) — the same private-configuration keys
  `AiRegistrationSeeds.OpenAI` uses today. Tests select real
  markers, e.g. `IGpt56Luna` and `IGpt56Sol`, and script them by model id.
- E2E: `ReferenceBrainFixture` (and its subclasses `ProductionBrainFixture`, `ProductHostFixture`)
  start the same server in echo mode only. Facts on the shared host do not script it, so there is no
  per-fact routing or shared mutable script state.

## Test migration (LSP-found `IScriptedLLM` users)

- `GroupChatFacts`: participants on `IGpt56Luna` / `IGpt56Sol`; `model.Script`/`model.Requests`.
- `ScriptedTurnFacts`: tool turns via `Reply.Tool`; renamed for what it covers (e.g. `AgentToolTurnFacts`).
- `AppCreatorFacts`, `AppRouteFacts`: same substitution.
- `ModelCatalogFacts`: scripted-resolution facts deleted with the behaviour.
- `PersistedCollectionFacts`: drop the scripted reference.
- `BrainRuntimeFacts`: drop `Model.AssertNoProtocolErrors()`; the echo assertion stays.

## Verification

1. LSP diagnostics clean; build each touched project.
2. Suites: `DigitalBrain.Modules.AI.Tests`, `DigitalBrain.Modules.Apps.Tests`,
   `DigitalBrain.Framework.Tests.E2E`, `DigitalBrain.OS.Tests.E2E` (`BrainRuntimeFacts`).
3. `aspire run`; traces show OpenAI GenAI spans for fake-served calls and metering records usage —
   proving usage flows end to end through the real adapter.
