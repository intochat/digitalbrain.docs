# Architecture: Google and Salesforce integrations

This authority owns integration capability boundaries, admission, and provider rationale.

### 4.3 Google

Status: Built

`IGmail` is a semantic capability, not an MCP toolset. It means "Gmail behavior" — it does not mirror
whatever a `tools/list` response happens to contain today. The module owns the official Gmail endpoint,
read-only scope, exact admitted tools, arguments, and semantic result mapping. The shared internal MCP
runtime owns official SDK transport, OAuth/token-cache mechanics, callback lifetime, structured-result
checks, and canonical fingerprint mechanics without exposing any of them as public application
vocabulary.
Raw MCP clients, tool names, protocol DTOs, and tool dictionaries never cross the module interface,
and an MCP tool name never becomes permanent public domain vocabulary just because a server exposes
it.

The public surface is therefore small on purpose. A high-level typed method is added only when a real
deterministic non-agent caller needs one, and today the whole of `IGmail` is one message read that
returns an id, a subject, a sender, and a plaintext body.

Behind that method the MCP boundary is private in the literal sense rather than the aspirational one.
The concrete internal `McpRuntime` opens the official client only inside a bounded callback friend to
provider runtimes and test fixtures. There is no DigitalBrain client interface, factory, returned
session wrapper, or public redirect seam. No contract package, behavior, or application caller can
name the runtime or let the SDK client escape its callback. The neuron is the only semantic door.

Every operation opens a fresh authenticated MCP session, lists what the server advertises, and refuses
to continue unless the exact tool it came for is there. Admission is a positive check rather than a
filter over whatever arrived: the tool must be annotated read-only, must not be annotated destructive,
and its input schema must require the exact typed property the module intends to send. A tool that
fails any of those throws instead of degrading into a best-effort call, because a Gmail server that
has quietly changed what a name means is not a situation to muddle through.

Gmail admits one exact `get_message` tool from the current catalog — name, input, output, and all four
safety annotations — and calls that selected official `McpClientTool` immediately in the same
session. A durable later invocation, such as an approved Salesforce mutation, instead stores a
canonical schema-and-annotation fingerprint, opens a fresh session, re-lists, and compares before the
call. Canonical fingerprinting is shared mechanics; the provider still owns the policy that accepts or
rejects a tool.

The module defines its OAuth client configuration and requested read-only Gmail scope; the shared MCP
runtime performs the protocol and keeps tokens in the neuron's durable state under the shared
purpose-bound protector. Production interactive authorization belongs at an authenticated edge; the
internal runtime fails closed unless the explicit `LocalLoopbackDevelopment` mode selects its private
loopback listener. This keeps a server-side silo from silently turning a developer callback into its
production authentication model.

The `IGmail` Neuron name is the provider-account identity: conceptually,
`IGmail("myemail@gmail.com")`. Each named grain owns its own durable token value, and the protection
purpose includes the complete `NeuronId`, so separate names cannot share authorization/token state.
Callers select the account explicitly; there is no account registry or routing layer.

Google does not depend on AI. An application agent composes `IGmail` with a concrete LLM neuron;
`IGmail` never composes a model.

Settled but not yet standing up. None of the following exists in the repository, and the tool path in
particular should not be read as describing today's code:

- `DigitalBrain.Google.ICalendar` is ratified vocabulary waiting for a concrete calendar story.
- The provider-neutral capability-tool seam through which AI would borrow integration capabilities as
  transient model-facing functions. It is ratified as module-author infrastructure — invisible to
  contract packages, behaviors, and natural-language discovery — handing the model only selected exact
  function schemas and never a raw invoke escape hatch. No such seam, middleware, or context provider
  is implemented.
- Its selection policy: availability bounded by a token budget rather than a fixed tool count, hybrid
  retrieval when the granted catalog does not fit that budget, previously used tools sticky within a
  session, and summaries and embeddings kept as disposable discovery indexes while invocation always
  uses the exact current schema.
- `FindCapabilityTools`, the always-available read-only recovery search over the pinned granted
  catalog. A miss may retrieve only previously unseen tools and rerun with finite progress, and there
  is deliberately no raw string invoke beside it.

When that path is built, every selected tool must still route back through the neuron, so that
authorization, incoming request journals, and approval validation keep exactly one home.

### 4.4 Salesforce

Status: Built

`ISalesforce` follows every integration rule in §4.3 — semantic capability, provider-owned endpoint,
scopes, tool policy and mapping, shared private MCP mechanics, module-owned Aspire selection, and no
AI dependency. What it adds is the mutation story, because Salesforce is where DigitalBrain writes to
a system it does not control.

External mutations use a durable command protocol owned by the integration neuron. Every mutation
carries a `CommandId` and a canonical payload fingerprint. **Public** receipt state
(`SalesforceMutationState`) is only:

```text
AwaitingApproval
  -> Completed
             \-> OutcomeUncertain
```

**Internal** durable status also has an `Invoking` fence (committed before the provider is contacted).
That fence is not a public enum member — non-terminal internal status maps to `AwaitingApproval` on
the receipt. Callers never observe `Invoking` as product vocabulary.

The same command identity and fingerprint resume the work or return the recorded result. Reusing an
identity with different content is rejected. Human approval binds to the exact fingerprint, so an
approved payload cannot be swapped between the moment a person read it and the moment it is sent.

The pause between proposal and approval is not machinery. Proposing a description performs zero MCP
or provider operations, records the mutation once as `AwaitingApproval`, and returns a receipt.
Resuming it is a second ordinary interface call, `ISalesforce.ApproveAccountDescription`,
carrying the approval record together with the durable delivery that proves a human produced it.
Nothing intercepts, wraps, or watches the neuron — which is precisely why the neuron has to do the
checking itself, and does. It requires that the delivery's caller is the approver the approval names,
that the synapse inside that delivery is the same approval record, that terminal replays retain the
originally committed delivery identity, and that the approver is a session neuron belonging to this
neuron's owner. A caller who skips the proposal, mints an approval, reuses someone else's evidence,
or approves a fingerprint that no longer matches the stored payload is
refused before Salesforce is contacted at all. Only after that evidence passes does approval open an
authenticated session and admit the exact read and mutation tools. The approval evidence, admitted
schema fingerprints, and `Invoking` fence are committed in one durable save before the update call.
Approving something already finished returns the recorded receipt instead of writing twice.

Ratified but not built: the operation classification that would let module-declared safe read-only
work be auto-approved while mutating and unknown work still requires a human, and the rule that an
approver agent may advise but never holds authority. The one mutating operation that exists today
always demands human evidence.

Reconciliation is where the design stops being able to bluff. A crash between sending a write and
hearing the answer is ordinary, and the only dishonest response is to assume. So `Invoking` is
committed durably *before* the provider is contacted — the record of "we may already have changed
Salesforce" has to outlive the process that was in the middle of doing it. Recovery then starts by
asking Salesforce what it actually holds: a read-only query for the account, compared field by field
against the payload that was approved. A match is proof and the command becomes `Completed`. A
mismatch, an error, a query that itself fails — none of those prove anything, and each becomes
`OutcomeUncertain` instead of another attempt.

What the module then does is record and return. `ReconcileAsync` persists the uncertain status and
hands back the receipt, and nothing in this module contacts a Task — it could not, because
`DigitalBrain.Modules.Salesforce` has no reference to Tasks contracts or runtime, so Tasks vocabulary
is out of reach by construction. The decision belongs to whoever read the receipt, and the
caller that cannot prove completion must refuse to invent success — treat any non-`Completed`
receipt as failure or uncertainty, never as a silent retry of the mutation. The opt-in sample
`DigitalBrain.AccountEnrichment` is the multi-module process sample (compiled neuron, not a product
Behavior): `IAccountEnrichment` + `EnrichmentModule` (select with `AddModule<EnrichmentModule>()` on a
silo that also selects Google and Salesforce). Flow: Gmail read → Salesforce propose → human approval
→ completed enrichment fact; it refuses any non-`Completed` mutation receipt.

Ratified but not built: parking the owning Task on an `OutcomeUncertain` blocker rather than letting
the uncertainty surface as a caller-side exception. `AttemptOutcomeUncertain` has no producer under
`modules/`, `src/`, or `samples/`; it has no production producer.

The command identity travels as the provider idempotency key wherever a provider offers one;
Salesforce's update tool does not, which is why reconciliation and not the key is what carries this
module. The rule underneath all of it is that a mutation whose outcome cannot be proven is never
repeated, and it is the same reason
DigitalBrain claims no exactly-once external effect anywhere: the provider is the only authority on
its own state, and the most a durable ledger can honestly offer is a correct label for what it does
not know.

The ledger lives in the neuron's durable state and typed journal — not in a new public service.
Read-only operations stay retryable and do not touch it.


