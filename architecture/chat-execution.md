# Chat and durable execution

The current chat path is an adapter from authenticated product interaction to the general
Execution kernel. A browser connection can observe a turn, but it cannot decide whether the turn
continues to exist.

## One turn end to end

```text
authenticated HTTP request
  -> ActorContext from cookie/Development loopback principal
  -> local chat name scoped as {principal:N}.{name}
  -> Chat persists command + FIFO turn record
  -> Chat starts one IExecution for the queue head
  -> Execution dispatches an allow-listed chat-turn worker
  -> worker renews lease while AI/MCP work runs
  -> worker reports terminal Attempt fact
  -> Execution commits terminal snapshot
  -> Chat re-reads snapshot, emits Responded/TurnLifecycle, advances queue
  -> HTTP response or reconnecting SSE projects the outgoing journal
```

### Admission and identity

`POST /owner/commands` never trusts a client-supplied actor. Kernel authentication creates an
`ActorContext`, and the local name `main` becomes a principal-scoped internal name. `SendMessage`
requires that actor stamp.

The edge creates a `CommandId`. Chat remembers it, returns the existing turn for an identical
duplicate, and refuses command reuse that cannot be reconciled with retained state. It durably
records the user's transcript entry, turn record, and pending queue position before starting work.

### FIFO and Execution

One Chat instance has at most one active turn. Extra turns remain in its durable FIFO queue;
different principal-scoped chats can progress independently. The active record points to an
Execution named from its `TurnId` and a chat-turn worker named from the chat.

Chat calls the narrow `IExecution.Apply`/`Read` surface. A `StartExecution` contains the immutable
chat goal, worker, origin, and policy. The current chat policy permits one attempt, so a model/tool
failure is not silently converted into an unbounded retry loop.

Execution owns revision fencing, command receipts, Attempt state, blocker state, worker dispatch,
reminder-based recovery, cancellation, and terminal snapshots. UI owns only the chat-specific goal,
worker adapter, transcript, queue, and projection back to chat facts.

### Worker and AI

`UiModule` is the sole registrar of the `chat-turn-worker` grain type on Execution's worker
allow-list. The worker reads the chat transcript, invokes the AI Assistant, and reports result or
failure through typed Attempt facts.

A live worker renews a worker-only lease every 5 seconds; the lease expires after 15 seconds. Only
the attributed active worker/attempt/revision can renew it. Recovery can therefore distinguish a
slow healthy model call from an abandoned worker without granting the worker the public Execution
mutation surface.

When an integration tool requires sign-in, the shared MCP rail emits an actor-bound authorization
fact. Chat and the authorization SSE projection can offer the sign-in URL to that principal. A
retry with the same durable command can claim the completed authorization once.

### Terminal bridge

Execution emits a terminal fact back to the originating Chat. Chat does not trust that notification
alone: on a later grain-timer turn it re-reads the authoritative Execution snapshot, applies a
revision idempotently, emits `Responded` or failure/cancellation lifecycle, clears the active queue
head, and starts the next turn.

Activation recovery follows the same principle. Chat re-reads its active Execution rather than
guessing from an orphaned in-memory worker task.

## Observation and reconnect

The streaming POST starts the durable `SendMessage` first, then watches the outgoing chat journal
for the matching command. Its request-aborted token belongs only to that watch. Closing the client
or reaching the observer budget does not cancel the Execution.

Long-lived chat SSE uses `GET /chats/{chatName}/events?afterSequence=N`. Surface,
authorization, and graph streams use the same resume pattern. If the requested sequence has been
compacted, the underlying journal reports a reset snapshot and current resume sequence.

Explicit cancellation is different from observer detachment. A queued turn can be marked cancelled
and removed immediately. A running turn sends a revision-fenced `CancelExecution`; Chat retains it
as FIFO head until the authoritative terminal bridge reports cancellation.

## External operations and uncertainty

Execution retains 64 command receipts and at most 64 operation rows. Operation identity comes from
the worker's stable caller-supplied key, not from the retry Attempt ID. The effect phases are:

```text
Prepared -> Dispatched -> Completed | Failed | Uncertain
```

If cancellation, recovery, worker abandonment, or failure occurs after dispatch but before an
outcome is recorded, every affected row becomes `Uncertain` and the Execution blocks on
`OutcomeUncertain`. It cannot prepare more effect work or auto-retry that write. An explicit
`ResolveOperation` must mark the effect completed, failed, or safe to retry.

This protects the Execution protocol. The direct AI session still has a documented crash window
between a provider effect and its following persisted function-result safe point.

## Product state

**Implemented now.** Principal-scoped chat admission, durable FIFO, one Execution per active turn,
allow-listed worker dispatch, lease renewal, terminal re-read, observer-only HTTP cancellation,
resumable SSE, bounded receipts/operations, and explicit uncertain-outcome resolution exist in
source.

**Known limitation.** Current chat remains in UI, and the separate northbound MCP chat tools bypass
the authenticated Kernel path by accepting an unscoped name and stamping a fixed operator actor.

**Ratified next.** Conversation becomes its own domain module and canonical message history. UI
becomes a projection, AI implements a provider-neutral responder contract, and each Conversation
keeps exactly one responder connection while continuing to use Execution for durable turns.
