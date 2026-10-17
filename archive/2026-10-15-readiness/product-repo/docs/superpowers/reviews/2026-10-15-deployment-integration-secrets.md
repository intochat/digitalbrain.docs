# Deployment integration secrets — complexity review

Date: 2026-10-15. Diagnosis only. No implementation in this note.

## Finding

Both composition and configuration. Composition decides that a third-party secret is required before the process may start. Configuration is a second, hand-maintained list of those secret names. The next connector fails when the two disagree.

The platform already knows how to run with a deployment integration missing. Aspire does not, and it fails first.

## What already works

`IntegrationSeeder.SeedOneAsync` reads `DigitalBrain:Integrations:{id}:{Field}` and skips every blank field. When nothing is set, it returns without seeding.

```csharp
private async Task SeedOneAsync(IntegrationSchema definition)
{
    var values = definition.AllFields
        .Select(field => (Field: field, Value: configuration[definition.Key(field)]))
        .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
        .ToDictionary(pair => pair.Field, pair => pair.Value!, StringComparer.Ordinal);
    if (values.Count == 0)
    {
        return;
    }
```

`IntegrationNeuron` then reports `Unconfigured` until the required fields exist. A user connection on that connector can still carry the user's own account. A missing deployment secret is a valid steady state. The seeder never gets there if Aspire refuses to build the app.

## Where it breaks

`AddParameter` with no value is a process-start failure (`MissingParameterValueException`). That happens while the AppHost model is built, before the seeder runs.

`ReferenceBrain` boots that same AppHost for the product tests. It survives only because it carries its own copy of the parameter names, and because it turns some features back off:

- Filled with fixture strings: `modules-openai-api-key`, `modules-gmail-client-id`, `modules-gmail-client-secret`, `modules-salesforce-consumer-key`, `modules-salesforce-consumer-secret`, and the master key (`ReferenceBrain.cs`).
- Turned off: Tavily, voice, and local models, via `WithoutWebSearch()`, `WithoutVoiceToText()`, and `WithoutLocalModels()`.
- Absent: Monnet, Equifax, RiskSeal, and Twilio.

Gmail and Salesforce look fine because those fixture lines were added when their host flags were turned on. They are not fine because their secrets are optional.

## Three composition styles

Hosting a module and provisioning a vendor account got collapsed into one decision, and each connector implements that decision differently.

| Style | What `Configure` does | Product AppHost | Reference boot |
|---|---|---|---|
| Unconditional | Always calls `WithMonnet()`, `WithEquifax()`, `WithRiskSeal()`, or `WithTwilio()`, which always creates Aspire parameters | `.WithHosting<…ModuleHosting>()` | No fixture values. Startup throws. |
| Flag, on by default | Gmail creates parameters only when `HostGmail` is set. Salesforce only when `HostMcp` is set | Turns both flags on (`gmail.WithGmail()`, `salesforce.WithHostedMcp()`) | Supplies fixture secrets. Forgets a name and the next boot throws. |
| Explicit extra call | GitHub's `Configure` is empty. A GitHub App secret appears only from `WithGitHubApp` | Does not call it | Nothing to fill. Boot continues. |

AI follows the flag style. `AIModuleHosting.ConfigureDeclaration` creates a provider or Tavily parameter only for what the options enable. The product AppHost enables OpenRouter, OpenAI, and Tavily in code. The reference boot disables Tavily and supplies one OpenAI key, so CI does not ask for the rest.

Postgres is a different case. The composition starts the container, and the container mints the credential. The master key is different too: the OS cannot run without it. A third-party account is neither of those. A required Aspire parameter is correct for the master key and for a container the host itself starts. It is the wrong gate for a merchant account the deployment may not have.

## Why the workarounds repeat the bug

`AddOptionalParameter` makes an empty value start the OS and leaves the integration unseeded. The seeder already skips a blank field. The helper does not change the rule a new connector must follow. The next author who copies Gmail's `AddParameter`, or who turns a host flag on in `AppHost` and forgets `ReferenceBrain`, stops the OS the same way.

Commenting Monnet, Equifax, RiskSeal, and Twilio out of `OsCatalog` and the AppHost removes the parameters by also removing the neurons. A user then cannot connect their own account either. That avoids the crash by deleting the connector.

## Rule

`Configure` may start infrastructure the module owns. It does not require a third-party secret.

That secret is read when the deployment set it, and left unconfigured when it did not. `ReferenceBrain` should not grow another fixture name for it. Hosting the connector means the neurons and the user-connection methods exist. Creating an Aspire parameter means this deployment is provisioning its own account. Those stay different calls, and the second one does not live inside unconditional `Configure`.
