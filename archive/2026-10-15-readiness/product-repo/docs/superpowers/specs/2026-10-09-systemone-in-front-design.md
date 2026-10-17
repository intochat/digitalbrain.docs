# System One in front of the assistant

**Status:** approved in chat 2026-10-09. Sub-project 2 of 3.

## Intent

Jev (`ISystemOne`) already exists and already routes over the contract catalog (`RouterNeuron`),
but it is reachable only through the Router app and configured by hand through the `typesafe`
integration endpoint. Three things are missing: the local adapter is not an Aspire resource; the
assistant does not consult Jev before the language model; and Jev's decisions are not visible.
This spec adds exactly those three. No new model concept: System One is the fourth model role
beside LLM, embedding and transcription.

## Hosting

`AIOptions` gains `WithSystemOne<TModel>()` and `WithDefaultSystemOne<TModel>()` mirroring
`WithVoiceToText<TModel>`, over a `SystemOneModel<TMarker>` family. Two markers ship:

- `IJev`: the hosted TypeSafe endpoint; needs the existing `typesafe` integration.
- `ILocalJev`: the `systemone-adapter` container. `AIModuleHosting` adds it as an Aspire
  container resource built from `src/DigitalBrain.Modules/AI/systemone-adapter/Dockerfile`
  (with its Ollama dependency, as the compose file does), and sets the `typesafe` integration
  endpoint to the container's endpoint and `ApiKey` to `local`, the same way the module
  already sets Tavily keys from hosting. Nothing in the module reads credentials; the
  integration seam stays.

AppHost becomes:

```csharp
ai.WithDefaultSystemOne<ILocalJev>();
```

The adapter appears in Aspire as `systemone`, with `/health` as its health check, and therefore on
the shell's infrastructure strip (sub-project 1).

## Decisions are signals

`SystemOneNeuron.Ask` publishes `SystemOneDecided(RequestSummary, Answers, Confidence)` after each
answer, and `RouterNeuron.Route` publishes `Routed(State, Contract, Method, Confidence)`. Both are
contracts-ring signals, so apps and the shell can subscribe. The Router app's transcript and the
assistant's step cards show them.

## The assistant asks Jev first

In the assistant's `send` synapse, before the agent turn:

1. `IRouter.Route(message, allowed: null)`.
2. If `Confidence >= RouteGate` (an assistant setting, default 0.8) and the route is to an app
   operation (`IApp.Request`) or a pure read, dispatch it with `IRouter.Dispatch` and show the
   outcome as the turn's answer; no language model is called.
3. Otherwise run the agent turn as today, with the top routes passed in the system prompt as
   "likely capabilities" so the model's tool choice is anchored.

Either path leaves a `Routed` signal and a step card, so the user sees which path answered.
The gate is a setting so it can be tightened per brain without a program change.

## Verification

- Module tests with a `FakeSystemOne` scripted to answer with a given confidence: above the gate
  the assistant answers without the LLM (the `FakeModelServer` records zero calls); below it the
  LLM is called and the prompt contains the hints.
- Hosting fact: `WithDefaultSystemOne<ILocalJev>()` adds a `systemone` resource and sets the
  `typesafe` endpoint environment on the OS project.
- Running: Aspire shows `systemone` healthy; "open calculator" in the dock dispatches straight to
  `IApp.Request` with a `Routed` span and no model span in the trace.

## Out of scope

Training or fine-tuning Jev on the catalog; multi-step planning changes in `Achieve`.
