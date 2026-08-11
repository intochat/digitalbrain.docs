# Hosting and security

The checked-in AppHost is the authoritative local composition. It creates one logical brain,
projects its dependencies into Kernel, and gives the separate MCP app only the client references it
needs to join Orleans.

## Aspire resource graph

```text
storage (Azurite, data volume, persistent lifetime)
  +-- clustering table ----+
  +-- reminders table -----+--> brain (Orleans)
  +-- journal blobs -------+       |
  +-- streams queues ------+       +--> kernel :5080
  +-- pubsub table --------+       +--> mcp :5000/mcp
                                  |
qdrant ---------------------------+
ollama (data volume, persistent) -+-- gemma4:12b
                                  +-- llama3.2
                                  +-- openwebui (persistent lifetime)

kernel healthy ----------------------> flutter (Windows window host)
```

Azurite is the local implementation of the one storage profile. The same emulator supplies Orleans
clustering and reminders, neuron journal blobs, stream queues, PubSub tables, and the Identity user
table. `WithDataVolume()` plus `WithLifetime(ContainerLifetime.Persistent)` retains that state
across ordinary AppHost stop/start cycles.

Ollama has the same data-volume and persistent-lifetime treatment so models are not downloaded on
every run. The current AppHost selects Gemma4 and Llama32; other AI contract/model definitions in
source are not selected resources. Open WebUI has a persistent container lifetime.

Memory selects Qdrant and waits for it to become healthy. The current Qdrant projection does not
declare the Azurite volume or reuse its lifecycle, so its data durability must be evaluated
separately.

Flutter receives `DIGITALBRAIN_UI_BASE` from Kernel's `http` endpoint plus shell `desk` and chat
`main`. The window launcher resolves the sibling `Flutter/shell` package and runs the Windows
device. It waits for Kernel health before starting.

## Host boundaries

Kernel binds the unproxied local product endpoint to port `5080`. It hosts auth, commands, SSE,
topology, graph observation, OAuth callback, health/liveness, and the authenticated Orleans
dashboard.

`DigitalBrain.Mcp` is a separate ASP.NET Core process on port `5000` with stateless HTTP MCP at
`/mcp`. It gets an Orleans client reference and waits for Kernel, but it does not share Kernel's
authentication middleware.

Google and Salesforce are southbound server definitions inside the Kernel silo. Their OAuth
parameters and one persisted 256-bit state-protection key are projected by AppHost. Provider tokens
and direct AI session state use purpose-separated protected envelopes; clients do not receive the
protection key or journal connection.

## Kernel request security

Kernel middleware runs in this order:

```text
HTTPS stance -> cookie authentication -> Development loopback principal -> authorization
```

- Beyond loopback, insecure HTTP is rejected with `403`; deployment must terminate or forward
  trustworthy HTTPS.
- Cookie auth uses the `DigitalBrain.Auth` HTTP-only, SameSite=Lax cookie with sliding 14-day
  expiration.
- The fallback authorization policy requires an authenticated user unless a route explicitly
  allows anonymous access.
- In Development only, loopback requests with no authenticated cookie can impersonate the stored
  bootstrap Owner. Configuration key `DigitalBrain:Auth:AllowLoopbackDev` can disable this. The
  middleware never creates an account.
- Kernel turns authenticated claims into `ActorContext` and scopes local chat/surface names as
  `{principal:N}.{local}`. Names containing `/` or whitespace are rejected.

The deliberate anonymous Kernel routes are:

- `POST /auth/bootstrap`, `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me`;
- `GET /oauth/callback`, because the external provider cannot carry a local cookie;
- `GET /health` and `GET /alive`.

`POST /auth/users`, owner commands, SSE data routes, topology, graph events, and `/orleans` inherit
the authenticated fallback policy. The OAuth callback's anonymous transport does not make state
anonymous: callback delivery requires a known, unexpired state already bound to an actor.

## Workspace identity and roles

The first bootstrap account is persisted in the `identityusers` table and added to the durable
workspace membership as Owner. Later Owner/Admin calls can create Owner, Admin, Builder, or Viewer
members. `DigitalBrain__Owner=dev` is only the installation's Orleans owner key and is never a user
credential.

Durable user work carries `PrincipalId` plus username. Per-user Google/Salesforce authorization
derives protected state purposes from provider and principal. Begin, callback claim, code exchange,
and token lookup verify that actor; there is no fallback to another user's token.

Authorization SSE reads the installation journal but projects only facts whose durable actor matches
the authenticated principal. This filtering was exercised with separate Owner and Viewer cookies.

## Provider callbacks

The AppHost derives one canonical local callback from the actual Kernel surface:

```text
http://localhost:5080/oauth/callback
```

Google requires a Web application client ID and secret. Salesforce uses a public-client style
External Client App and has no client-secret parameter. Both provider applications must register
the exact callback above. AppHost prefers the composed local value over any historically persisted
callback value.

The last smoke reached Google's real login redirect with state and PKCE S256. Salesforce reached
its authorize endpoint but returned `redirect_uri_mismatch`; the external app registration, not the
Kernel route, must be corrected before consent completes.

## Product state

**Implemented now.** Persistent Azurite and Ollama, Qdrant selection, Gemma4/Llama32, Flutter window
hosting, cookie Identity, one-time bootstrap, roles, Development loopback impersonation,
principal-scoped product resources, actor-bound OAuth, protected state, explicit anonymous routes,
and HTTPS beyond loopback exist in source.

**Known limitation.** Northbound `/mcp` has no authentication challenge or verified principal and
must not be exposed as a trusted multi-user endpoint. Salesforce provider registration is still
misaligned. Local loopback convenience depends on a manually bootstrapped Owner.

**Ratified next.** Close the northbound MCP identity boundary and deploy the product behind a real
HTTPS edge. Conversation and Behavior will reuse verified actor and protected integration rails;
they do not weaken them.
