# CSharp

## Brain runtime

A behavior is C# the brain compiles and loads into the brain's own sandbox session. Nothing
compiles or restores packages inside the sandbox.

- **Compile.** `ICSharpFile` (`{scope}/csharp/{id}`) holds a behavior's source and settings. On Start
  or Swap, the silo compiles it with Roslyn against the installed contracts. It stores the
  deterministic assembly and its PDB by SHA-256 in the `behaviors` blob container
  (`IBehaviorAssemblies`) and assigns the hash to the brain runtime. Stop and Delete retire it.
- **Own.** `IBrainRuntime` (`{scope}/runtime`) is one neuron per brain. It owns the desired set of
  behaviors, their durable subscriptions (watermarks and pending batches), and one sandbox session.
  It starts the session after readiness, through a reminder, and never inside readiness. A session
  that is missing, refused or silent for two minutes is replaced with a new session id. Otherwise the
  reminder re-ensures the session idempotently. Calls to the sandbox run off the grain's turn.
- **Run.** `SessionRunner` asks one host for the session identified by `b-{sha256(brain)[..32]}`:
  the always-on `csharp-sandbox` container locally (`SandboxUrl`), or an Azure Container Apps
  custom-container session pool in production (`SessionPoolEndpoint`). The sandbox host
  (`DigitalBrain.Modules.Microsoft.CSharp.Sandbox`) is a runtime-only image whose session routes start, probe and stop a
  session (`/sessions/{identifier}`), beside `/health`. It dials back to the brain's runtime edge
  (`/brains/{brainId}/runtime/v1/…`) with a session token. Over that edge it reports its contracts
  fingerprint, streams signal batches (SSE) and assign/retire/logs commands, and lets behaviors
  invoke neurons.
- **Load.** The session downloads each assembly, verifies its hash and loads it into a collectible
  `AssemblyLoadContext` that shares the image's contract assemblies. The brain accepts a session
  only when the image's fingerprint covers every contract the brain compiled against.
- **Trace.** A signal's W3C trace context rides its batch down the stream. A behavior's invokes are
  spans of the trace that published the signal, so one click is one trace from `IButton/Click` to
  the app's `Invoke`.

## Connections and deployment credentials

The sandbox is declared as the `csharp` connector: the external system behind the `ICSharpFile`
neuron, whose public signal is `CSharpFileChanged`. It is declared, not offered: no connection
neuron serves it, so it does not appear in `GET /connectors` and a connection key naming it
addresses nothing. Its only credential is the deployment's session-token key, held in the optional
Integration `csharp`. Credential values never belong in module options. Provision deployment
credentials with `DigitalBrain:Integrations:{id}:{Field}`; ordinary options stay under
`DigitalBrain:Modules:{id}:Options`.

Integrations are what the deployment provisions; Connections are what users authorize.

Integration `csharp` supplies the secret `RunTokenKey` (at least 32 bytes, base64), which signs
session tokens (HMAC-SHA256, one hour, rotated over the stream). Signing initializes
asynchronously after Platform Integration seeding. Production fails startup without the key.
Development generates a process-local key and logs a warning that tokens do not survive a
restart.
