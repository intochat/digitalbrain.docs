# HTTP surface

This inventory is derived from the committed Kernel and MCP route maps on 2026-08-11. Kernel uses
an authenticated fallback policy; a route is anonymous only when source calls `AllowAnonymous()`.

## Kernel host — port 5080

### Identity

| Method and route | Auth stance | Scope and purpose |
| --- | --- | --- |
| `POST /auth/bootstrap` | Anonymous | Creates the first stored account and Owner membership only while the account table is empty; signs in the new user. Later calls return `409`. |
| `POST /auth/login` | Anonymous | Verifies username/password and issues the persistent `DigitalBrain.Auth` cookie. |
| `POST /auth/logout` | Anonymous | Clears the cookie; idempotent for callers without a session. |
| `GET /auth/me` | Anonymous transport; returns `401` without an actor | Returns username, principal ID, and bootstrap-owner flag. Development loopback impersonation can supply the actor after bootstrap. |
| `POST /auth/users` | Authenticated; Owner or Admin membership required | Creates an Owner, Admin, Builder, or Viewer and adds it to the installation workspace. |

### Commands

`POST /owner/commands` is authenticated and derives its actor from claims. It accepts one JSON
envelope selected by `kind`:

| `kind` | Required fields | Result |
| --- | --- | --- |
| `chat.send` | `chatName`, `text` | Scopes the chat to the principal, starts durable work, and returns SSE event `chat-delta` when the matching response arrives. Request abort detaches only this observer. |
| `chat.cancel-turn` | `chatName`, `commandId`, `turnId` | Sends explicit durable cancellation and returns `202`. |
| `chat.button` | `chatName`, `offerCommandId`, `buttonId`, `action` | Activates the exact offered button neuron and returns `202`. |
| `surface.open` | `surfaceName`, `surfaceKey`, `title` | Scopes the surface to the principal, fires `OpenSurface`, and returns `202`. |

Unknown kinds, missing fields, malformed IDs, whitespace names, or names containing `/` return
`400`. Authentication failure returns `401`.

### Resumable event streams

Each route accepts optional non-negative query parameter `afterSequence`; a negative cursor returns
`400`.

| Method and route | Auth/scope | SSE event and projection |
| --- | --- | --- |
| `GET /chats/{chatName}/events` | Authenticated; chat name rewritten with `PrincipalId` | `chat-turn`: user messages, responses, and turn lifecycle from that private chat's outgoing journal. |
| `GET /surfaces/{surfaceName}/events` | Authenticated; surface name rewritten with `PrincipalId` | `surface-opened`: durable surface key/title/open command projection. |
| `GET /authorizations/events` | Authenticated; each journal fact filtered by matching durable actor | `authorization`: required/completed/denied integration authorization for this principal only. |
| `GET /graph/events` | Authenticated; installation workspace graph | `graph-change`: connected/disconnected facts from the graph journal. |

SSE is an observation surface. A disconnected client resumes from its last sequence; it does not
own the underlying chat, authorization, surface, or graph work.

### Topology, OAuth, and diagnostics

| Method and route | Auth stance | Purpose |
| --- | --- | --- |
| `GET /brain/topology` | Authenticated | Runs a 90-second-bounded Introspection read and returns modules, active neurons, live connections, and broadcast routes. |
| `GET /oauth/callback` | Anonymous transport; known state required | Delivers provider `state`, `code`, `error`, and `iss` to `IMcpAuthorization`. Unknown/missing state returns `400`; valid completion/denial returns plain text. |
| `GET /health` | Anonymous | Readiness health endpoint used by Aspire. |
| `GET /alive` | Anonymous | Liveness-only health endpoint. |
| `/orleans` dashboard family | Authenticated fallback | Orleans diagnostic UI/API. It is not one of the anonymous health exceptions. |

## Northbound MCP host — port 5000

| Route | Auth stance | Purpose |
| --- | --- | --- |
| `/mcp` | **No authentication middleware** | Stateless MCP HTTP transport. The library owns transport methods; a live unauthenticated `initialize` POST returned `200`. |
| `GET /health` | Anonymous | MCP process readiness. |
| `GET /alive` | Anonymous | MCP process liveness. |

The current MCP tools are `send_chat_message`, `activate_chat_button`, `list_active_neurons`,
`read_neuron_journal`, and `read_chat_transcript`. Chat/transcript tools accept a local chat name
without deriving a Kernel principal, and chat send stamps a fixed operator actor. This is the
unresolved northbound security boundary—not a supported anonymous-product mode.

## Source owners

- [Kernel route composition](https://github.com/intochat/digitalbrain/blob/master/src/Kernel/DigitalBrain.Kernel/Program.cs)
- [Route constants](https://github.com/intochat/digitalbrain/blob/master/src/Kernel/DigitalBrain.Kernel/HttpSurfacePaths.cs)
- [Auth routes](https://github.com/intochat/digitalbrain/blob/master/src/Kernel/DigitalBrain.Kernel/Auth/MapAuth.cs)
- [Owner command map](https://github.com/intochat/digitalbrain/blob/master/src/Kernel/DigitalBrain.Kernel/MapOwnerCommands.cs)
- [MCP host](https://github.com/intochat/digitalbrain/blob/master/src/Kernel/DigitalBrain.Mcp/Program.cs)

## Product state

**Implemented now.** Every Kernel route above is protected by fallback auth except the enumerated
anonymous necessities. Product names and authorization events are principal-scoped, and SSE routes
resume by sequence.

**Known limitation.** The separate `/mcp` host is entirely outside that authentication pipeline and
its chat tools bypass principal scoping. Do not expose it as a trusted multi-user endpoint.

**Ratified next.** Northbound MCP must acquire a verified principal and use the same actor/scoping
rules as Kernel product traffic. Anonymous health, bootstrap/session probes, and provider callback
remain deliberate exceptions.
