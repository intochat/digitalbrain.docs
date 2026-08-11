# Run DigitalBrain locally

This path starts the product that is checked into
[`intochat/digitalbrain`](https://github.com/intochat/digitalbrain). It is an operator path, not a
sample-module tutorial.

## Prerequisites

- Windows for the checked-in Flutter window host (the default device target is `windows`).
- .NET SDK `11.0.100-preview.6.26359.118`. The repository's `global.json` allows the latest feature
  band and prerelease SDKs.
- Aspire CLI with the `start` and `stop` commands. The AppHost SDK and hosting packages are pinned
  to `13.5.0-preview.1.26376.5` in source.
- Docker Desktop or another Docker-compatible engine for Azurite, Qdrant, Ollama, and Open WebUI.
- Flutter/Dart compatible with Dart SDK `^3.12.0`, with Windows desktop support enabled.
- Enough disk and memory for `gemma4:12b` and `llama3.2`; their Ollama data is persisted locally.

The full AppHost also declares operator-supplied Google client ID/secret and Salesforce client ID
parameters. Aspire persists entered values in its secret/configuration store. Never commit them.
Provider consent is optional for ordinary local chat, but those parameters are part of the
checked-in graph.

## 1. Start the AppHost

From the product repository root:

```powershell
aspire start --apphost src/Kernel/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj
```

Use the dashboard URL printed by Aspire to watch resource health. `aspire start` runs the AppHost
in the background; it is the supported local lifecycle command. Do not start this AppHost with
`dotnet run`.

The checked-in graph contains these logical resources:

| Resource | Purpose |
| --- | --- |
| `storage` | Persistent Azurite emulator backing the installation |
| `clustering`, `reminders` | Azure Tables used by Orleans membership and reminders |
| `journal` | Azure Blob storage for neuron journals |
| `streams`, `pubsub` | Provisioned Orleans Streams queues and PubSub table; currently no consumers |
| `qdrant` | Vector store used by the Memory module |
| `ollama`, `gemma4-12b`, `llama32-3b` | Local inference server and the two selected models |
| `openwebui` | Persistent Ollama companion UI |
| `kernel` | Authenticated product HTTP/SSE edge on `http://localhost:5080` |
| `mcp` | Separate northbound MCP app on port `5000`, path `/mcp` |
| `flutter` | Windows product shell, configured for shell `desk` and chat `main` |

Kernel and MCP wait on the backing brain resources; Flutter waits on Kernel health. Model downloads
can make the first start substantially slower than later starts.

## 2. Bootstrap the first Owner

A new Azurite volume contains no identity account. The first Owner must be created exactly once
through the anonymous bootstrap route:

```powershell
$bootstrap = @{
  username = 'local-owner'
  password = 'local-only-password'
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:5080/auth/bootstrap' `
  -ContentType 'application/json' `
  -Body $bootstrap `
  -SessionVariable digitalBrainSession
```

The example values are synthetic; choose your own local password of at least eight characters.
Successful bootstrap creates the account, adds it to the workspace as `Owner`, and issues the
`DigitalBrain.Auth` cookie. A second bootstrap attempt returns `409 Conflict`.

To inspect the current principal using the PowerShell cookie session:

```powershell
Invoke-RestMethod `
  -Uri 'http://localhost:5080/auth/me' `
  -WebSession $digitalBrainSession
```

`POST /auth/login` signs in an existing user. An authenticated Owner or Admin can create another
Owner, Admin, Builder, or Viewer with `POST /auth/users`.

## 3. Understand local automatic authentication

Development loopback authentication is enabled by default unless
`DigitalBrain:Auth:AllowLoopbackDev` is explicitly set to `false`. For a request from loopback with
no valid cookie, the Kernel looks up the stored bootstrap Owner and stamps that principal onto the
request.

This is automatic impersonation, not automatic account creation. Before bootstrap there is no
Owner to impersonate, so Flutter's initial SSE connections receive `401` and the shell can show
`chat:main` as disconnected. After bootstrap, restart the `flutter` resource from the Aspire
dashboard, or stop and start the AppHost, so every stream reconnects under the Development Owner.

The local chat label remains `main`. Inside the Kernel it becomes
`{principal-id}.main`, which isolates users who choose the same local chat name.

Outside Development the loopback bypass is disabled. Any non-loopback request must also use HTTPS;
plain HTTP beyond localhost receives `403`.

## 4. Know what persists

Azurite is configured with both a Docker data volume and
`WithLifetime(ContainerLifetime.Persistent)`. Normal AppHost stop/start cycles therefore retain the
identity table, workspace membership, Orleans clustering/reminder tables, neuron journals, stream
queues, and PubSub state. The Ollama container likewise has a data volume and persistent lifetime,
so downloaded models are reused.

Persistent local containers are development durability, not a backup strategy. Removing their
Docker volumes intentionally creates a fresh installation; bootstrap will then be available again.

Qdrant is selected as the Memory provider by the checked-in AppHost. Its lifecycle is separate from
the Azurite volume; do not infer Azurite persistence guarantees for vector data.

## 5. Stop before building

Running DigitalBrain processes can hold build outputs. Stop the AppHost before a source build:

```powershell
aspire stop --apphost src/Kernel/DigitalBrain.AppHost/DigitalBrain.AppHost.csproj
dotnet build DigitalBrain.slnx -warnaserror
```

Production Flutter source can be checked package by package:

```powershell
Push-Location src/Modules/UI/Flutter/core
flutter analyze lib
Pop-Location

Push-Location src/Modules/UI/Flutter/kit
flutter analyze lib
Pop-Location

Push-Location src/Modules/UI/Flutter/shell
flutter analyze lib
Pop-Location
```

No automated test command is part of the current workflow. A module-owned testing framework is
deferred to final hardening.

## Product state

**Implemented now.** Local Aspire composition, persistent Azurite and Ollama, cookie identity,
one-time Owner bootstrap, Development loopback impersonation, principal-scoped chat/surfaces, and
the Flutter window host are present in source. The 2026-08-11 smoke exercised bootstrap, a second
user, private same-name chats, a completed slow turn, OAuth sign-in initiation, and SSE replay.

**Known limitation.** Northbound `/mcp` on port `5000` is unauthenticated and bypasses principal
chat scoping. Salesforce OAuth cannot complete until the External Client App registers the exact
local callback `http://localhost:5080/oauth/callback`.

**Ratified next.** Production hosting adds an HTTPS deployment boundary and the Conversation module
replaces chat ownership in UI. The Behavior host and install rail are future work.
