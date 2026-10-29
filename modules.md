# DDD Modules (`ModuleManifest`)

Every capability or third-party connector in DigitalBrain is a self-contained DDD module decorated with `[Module("<id>")]` and exposing a static `ModuleManifest`.

## Declarative Infrastructure Needs

Modules never depend on `.NET Aspire` hosting packages. Instead, a module declares its infrastructure requirements in `ModuleManifest`:

- `Need.State(string storeName)`: Durable neuron state storage.
- `Need.Secrets`: Encrypted secret vault access.
- `Need.Reminders`: Durable timers and reminders.
- `Need.HttpClient(string name, string? baseAddressSetting = null, int requestsPerMinute = 120)`: Rate-limited, metered HTTP client pipeline.
- `Need.Webhook(string path, string targetNeuronType)`: Inbound webhook route mapped to a target neuron type.
- `Need.Container(string name, string image)`: Container dependency for local/cloud orchestrators.
- `ModuleAuth(string Scheme, IReadOnlyList<string> Scopes)`: OAuth2 / token requirement.

```csharp
[Module("gmail")]
public sealed class GmailModule : Module
{
    public static ModuleManifest Manifest { get; } = new(
        Provides: [],
        Requires: [],
        Needs:
        [
            Need.State("IntoChatOS"),
            Need.Secrets,
            Need.HttpClient("gmail", "IntoChatOS:Modules:gmail:BaseUrl", requestsPerMinute: 120),
            Need.Webhook("/webhooks/gmail", "gmail.inbox"),
        ],
        Settings: [new(typeof(GmailModuleOptions), "IntoChatOS:Modules:gmail")],
        Secrets: [])
    {
        Id = "gmail",
        Auth = new ModuleAuth("google", ["https://www.googleapis.com/auth/gmail.readonly"]),
    };
}
```
