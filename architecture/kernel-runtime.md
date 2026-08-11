# Kernel runtime

The Kernel makes a neuron a durable causal component. Domain modules inherit those mechanics
without moving domain concepts into the runtime.

## One neuron turn

`Neuron` is a public grain adapter over focused internal collaborators: `NeuronJournal`,
`NeuronOutbox`, `NeuronTurnCoordinator`, `NeuronMessagePipeline`, `NeuronCapabilityCoordinator`,
`NeuronDeliveryMemory`, and `NeuronStreamRegistry`. This decomposition keeps the grain contract
small and avoids handwritten partial classes.

A normal synapse delivery proceeds in this order:

1. Reject a duplicate `SynapseId` already present in delivery memory.
2. Snapshot the incoming synapse through Orleans serialization before dispatch.
3. Invoke the matching `IHandle<TSynapse>` handler in the neuron's serialized Orleans turn.
4. Stage emitted facts in the outgoing journal and stage the accepted delivery in the incoming
   journal.
5. Commit the journal/outbox checkpoint durably.
6. Notify journal watchers and schedule outbox drain.

If handling throws an ordinary failure, staged outgoing work and the incoming checkpoint are
retracted so delivery can retry. A failure type marked `SettledDeliveryFailure` instead records the
incoming delivery as settled while retracting its outgoing work. Authorization refusal and MCP
authorization-required/denied outcomes use that path, so a deterministic refusal does not poison
the delivery queue with infinite retries.

The base neuron forbids the interleaving timer API. Long-running adapters that need off-turn work
must make that concurrency explicit and bridge durable outcomes back through neuron messages.

## Dual journals and journal-is-outbox

Each neuron has an incoming and outgoing durable feed. Each feed maintains monotonic sequence and
per-synapse tallies, while retaining at most 512 entries or 512 KiB of payload bytes. A reader whose
cursor fell behind compaction receives a `JournalSnapshot` reset instead of a fabricated complete
history.

Outgoing deliveries are committed with the turn and retained in the durable outbox before network
delivery. Drain retries each target independently. Delivery is at least once, not exactly once:

- one attempt is bounded to 45 seconds;
- retry stops after 1,000 attempts or a 30-minute horizon;
- delivery depth is capped at 16;
- a neuron remembers the most recent 4,096 settled delivery IDs.

Those limits make memory and failure bounded. They also mean idempotency outside the dedupe window
still belongs to domain command IDs, revisions, provider idempotency keys, and explicit
reconciliation.

## Directed send and graph-routed emit

`SendAsync(receiver, synapse)` targets one `NeuronId`. A named client `FireAsync` uses that directed
path. `EmitAsync(synapse)` and receiver-free client `FireAsync` resolve all registered broadcast
handlers plus live connection-graph edges for the synapse's permanent alias.

The connection graph stores `(connectionId, source, synapseAlias, target, transform, expiry)`.
Connections stay inside one owner and cannot target the graph itself. A relay re-reads the live
connection before carrying a fact, applies either a registered transform or a validated declarative
transform, and sends the resulting synapse to the target. Missing connections, unknown transforms,
invalid fields, cross-owner routes, and empty identities are settled refusals.

A connection expresses routing only. It can trigger a neuron that starts work, but it never embeds
the internal steps of an Execution or future Behavior.

## Capability-call reification

Typed neuron methods remain useful for directed request/response APIs. Incoming and outgoing
Orleans filters make those calls visible in causal history:

1. The caller commits `CapabilityRequested` with contract, method, target, and causal identity.
2. The target accepts that committed delivery before the method body runs.
3. Work emitted inside the call inherits the request's correlation and causation.
4. The caller records `CapabilityCompleted`, `CapabilityFailed`, `CapabilityRejected`, or, for an
   abandoned stream, `CapabilityAbandoned`.

Only interfaces marked as a client entry point accept an unattributed external caller. Other
semantic calls must originate from a neuron with a committed capability request. Owner-bound call
filters reject cross-owner access unless the exact runtime rail authorizes it.

The audit facts deliberately omit arguments, return payloads, prompts, tokens, and exception
content. A module that needs payload-level domain evidence must emit its own protected typed facts.

## Correlation and observation

Every `SynapseDelivery` carries its own `SynapseId`, caller, correlation, optional causation,
sequence, depth, and timestamp. Streamed capability calls retain correlation across enumeration
start, continuation, termination, and disposal. Journal readers resume by sequence; OpenTelemetry
is diagnostic and never replaces durable journal evidence.

## Product state

**Implemented now.** Serialized turns, dual bounded journals, journal-is-outbox, at-least-once
delivery, receiver dedupe, directed and graph-routed delivery, capability reification, settled
refusal, transforms, and permanent aliases are production runtime behavior.

**Known limitation.** Journal payload history and dedupe are intentionally windowed. The runtime
does not promise exactly-once delivery, cross-target ordering, or an unbounded event archive.

**Ratified next.** Behaviors will use this runtime only through approved module capabilities and
durable Execution. Generated code will not load into the credentialed silo or acquire direct access
to Kernel internals.
