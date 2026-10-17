# AI connector migration report

Implemented in src/Modules/AI only, with no packaging changes or commits.

- AIModule declares IntegrationSchema provisioning and api-key ConnectorDefinition dependencies for OpenAI, Anthropic, Google, xAI, OpenRouter and Tavily.
- RegistrationCredentials and AiModelCapabilities receive IModuleIntegrations<AIModule>. Credentials read scoped handles; fabricated PlatformCaller and direct integration grain calls are removed.
- Provider factories, ModelProfiles resolution and client construction, AgentModelCatalog, InferenceService, streaming chat and embedding rebuilding await credentials natively. DI creates lazy wrappers; no Task.Run or GetAwaiter/GetResult remains in AI runtime.
- Revision comparison and the existing five-second status lifetime retain rotation/revocation rebuilding without invalidating unchanged clients. Async semaphore gates protect construction and status updates; cancellation reaches handle reads and secret releases.
- Image, transcription and speech synthesis capability checks are asynchronous. Public transport readiness uses IsReadyAsync/IsAvailableAsync only. Local concrete Foundry readiness stays an in-process property.
- Aspire credential seed keys use IntegrationSchema.Key. Tests use renamed integration interfaces/status/signals.

Primary changed areas: Integrations/AiCredentials.cs, AiModelCapabilities.cs, RebuildingClients.cs; Providers/*Factory.cs; Clients/AIClients.cs; ModelProfiles.cs; Agents/AgentModelCatalog.cs, AgentTurnRunner.cs and grain adapters; Inference/InferenceService.cs; Media/MediaNeurons.cs and speech transport; Voice transcription transport; AIModule.cs; Aspire.Hosting adapters; tests/CredentialFacts.cs, AsyncCredentialFacts.cs and transport/model tests.

Verification:
- dotnet test src/Modules/AI/tests/DigitalBrain.Modules.AI.Tests --no-restore --verbosity quiet: passed 100, failed 0, skipped 0. Includes AIOptionsPurityFacts and Orleans-hosted loopback inference/media/provider rotation regressions.
- New regressions: delayed scoped secret release does not block provider construction; cancellation reaches handle; streaming awaits construction and rebuilds only on revision change.
- dotnet build src/Modules/AI/DigitalBrain.Modules.AI.Aspire.Hosting --no-restore --verbosity quiet: passed, zero warnings/errors.
- dotnet build src/Modules/AI/DigitalBrain.Modules.AI.Deployment --no-restore --verbosity quiet: passed, zero warnings/errors.
- No separate AI E2E project exists in current tree. The AI suite includes hosted real-grain/loopback tests. Live provider calls and Aspire whole-host smoke were not performed by this worker.

Host API changes needing external caller updates: ModelProfiles.Resolve/CreateClient/CreateInferenceClient/List, AgentModelCatalog.Read/Select and InferenceService.Describe now return Tasks. IAudioTranscriptionService requires IsReadyAsync and ISpeechSynthesisTransport requires IsAvailableAsync. Parent agent notified about Assistant fake implementations outside AI ownership.

## Review corrections (2026-10-05)

Provider construction now obtains `ReleasedIntegration` through the module-scoped `ReleaseAsync` handle and derives endpoint and API key from its coherent snapshot/values. Chat, embedding, Anthropic, transcription, speech synthesis and image generation use this materialization. Resolved model selections retain only explicit endpoint overrides; integration endpoints are read when constructing the provider. Pinned pipelines rebuild on integration generation changes while retaining their selected model/profile settings.

Regression evidence: AI project suite **105 passed**. New coverage includes a paused release while the endpoint changes, a cached-readiness/new-endpoint-and-key real HTTP request, and rotation/clear through keyed, default-provider, and default-profile clients. Existing cancellation/streaming coverage remains passing. Provider catalog metadata lists model and media neuron contracts and emitted inference/media signals; Tavily has no neuron/signal contract.
