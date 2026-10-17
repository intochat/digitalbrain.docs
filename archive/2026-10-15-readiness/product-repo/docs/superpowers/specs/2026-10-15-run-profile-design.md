# Run profile

Date: 2026-10-15. Approved in conversation. Implementation plan: `docs/superpowers/plans/2026-10-15-run-profile.md`.

## Problem

A merchant secret is spelled three times: an Aspire parameter name, an `IntegrationSchema` key, and a copy in the integration grain. The product AppHost creates the parameter while composing module options, so a deployment with no vendor account cannot start. `ReferenceBrain` keeps a fixture parameter name for each one so the same AppHost can boot.

The module options themselves are already typed (`AIOptions`, `WithLlm<T>()`, `WithHosting<THosting, TOptions>`). `profiles/local.json` repeats those choices as strings under `DigitalBrain:Profile`.

## Decision

A run profile is a value. `RunProfile.Local` and `RunProfile.Cloud` are static properties that return a new `BrainProfile` on every get. The AppHost applies one of them. Changing the profile means changing the symbol in `AppHost.cs`. There is no `"local"` string.

`BrainProfile` is a record of the module options the product boot sets. `Local` and `Cloud` share Orleans, Postgres, Qdrant, ClickHouse, and Supabase. They differ in `Ai`.

`Local` uses local models (`IQwen35`, `IEmbeddingGemma`, `IWhisperSmall`, `ILocalJev`) and does not enable Tavily. `Cloud` uses `IGpt56Luna`, defaults the LLM to `IDeepSeekV41Flash`, uses `ITextEmbedding3Small` and `IWhisperLargeV3Turbo`, enables Tavily, and calls `WithoutLocalModels()`. The current AppHost also hosts `ILocalJev` beside the cloud LLMs. `Cloud` does not. That mix is retired.

`RunProfile.Reference` is the cloud AI options pointed at `http://127.0.0.1:1/`, with web search off. Reference tests overlay it through the existing `WithOptions<AIModule, AIOptions>`.

`WithHosting<THosting, TOptions>(TOptions options)` takes the ready object, validates it, and flattens it the way the `Action<TOptions>` overload already does. `AIModuleHosting.Configure` still runs. An Ollama model still starts Ollama. A cloud model does not create an Aspire parameter.

Gmail, Salesforce, Monnet, Equifax, RiskSeal, and Twilio are not on `BrainProfile` and are not applied. Their neurons stay registered by `OsCatalog`. Their `Configure` methods do not create parameters.

A merchant secret the deployment does have is `DigitalBrain:Integrations:{id}:{Field}`. Non-empty values are projected onto the silo. The seeder already skips a blank field. The grain, `Seed`, and the operator registration endpoints stay. The master key stays a required parameter. A container this host starts keeps its own resource reference.

The connections public origin is projected once from the silo HTTP endpoint. Gmail and Salesforce used to do that while creating their client-secret parameters.

`DigitalBrain.Aspire.Hosting` does not mention `AIOptions` or any other module options type. `BrainProfile` and `RunProfile` live in the AppHost project, which already references those hosting projects. `AddDigitalBrain(builder, name, profile)` in that project calls the existing `AddDigitalBrain` and then applies the profile.

## Out of scope

- Replacing `OsCatalog` with an assembly scan.
- Replacing the `OsApps` list with a flag on the app.
- Deleting `IntegrationSeeder`, `IIntegration.Seed`, or `PersonFields`.
- Putting the SV modules back into `OsCatalog` or the AppHost.
- Making `DigitalBrain:Profile` select `RunProfile.Local` or `RunProfile.Cloud`.
