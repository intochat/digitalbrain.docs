# Agent backed chat and Ino design

Status: implementation authorized by the user on 2026-10-15. The code appendix records the approved design; production sources and the implementation plan contain the verified implementation and subsequent correctness fixes.

## Decision and scope

Keep `brain.Get<T>()` and `brain.On<T>()`. Merge the Assistant and Ino app identities into Ino after a data-preserving migration. Reuse IAgent for conversation history and execution, IChat for presentation/read receipts/selected source, IComposer for input, IView for composition, IRouter for routing, and IAppStudio/IApp for app authoring. No IConversation, IChatComponent neuron, effect DSL, reducer framework, or Ino-specific runtime coordinator.

The runtime owns source observation, recovery and version enforcement. Scripts own routing policy, status wording, voice orchestration and authoring choices. A Ui.ChatComponent helper may return an ordinary immutable tree containing chat and composer references; it must not introduce another addressable state owner.

This design removes script-driven transcript replication and the second assistant app. It does not claim to solve the entire J1 span budget. The last measured immutable-view root run was 459.327 seconds, 2061 passed / 3 failed / 4 skipped. The corrected Ino-reference OS-only rerun passed 27 with 1 existing skip in 4m36s. These are measurements of existing code, not this proposal.

## Existing contracts and observed limitations

- IAgent.Configure already accepts model, instructions, contract allowlist, contexts and execution limits with an expected configuration revision. IAgent.Start already accepts a caller-selected run ID, but a completed replay emits lifecycle signals again; an active duplicate fails the idle check; a failed retained run may be retried. Do not describe it as an unconditional exactly-once admission operation.
- IChat.Project stores a versioned transcript and canonical actions; MarkRead records per-principal content hashes. Both remain supported for manually projected chat.
- IComposer already persists pending submissions and voice state; Settle clears only the submitted draft version. Its current context-only interaction calls do not protect A-to-B-to-A selection changes.
- IUiBinding forwards a Signal to a single one-way grain handler. It is not a durable source subscription or a script handler binding. Reusing its name would conceal different semantics.
- IAppStudio already exposes Author and Build. Creator need not become another neuron type. Its current Build has no caller-provided operation ID, so automatic durable retry is not assumed.
- IApp.Request generates a new request ID. Existing forwarding ledgers are not made unnecessary merely by adding chat bindings.

## Contract additions

The following signatures are proposed additions to existing contracts. Serializer IDs/aliases must be allocated during implementation; do not reuse existing IDs.

```csharp
// IChat additions. Keys are neuron identities, not executable callbacks.
Task<ChatSelection> SelectAgent(
    string agent,
    long expectedSelectionRevision,
    Guid operationId);

// ChatState additions.
ChatSelection? Selection { get; init; }
ChatRunSnapshot? Run { get; init; }
long ActivityRevision { get; init; }

record ChatSelection(string Agent, long Revision);
record ChatRunSnapshot(
    string Source, long SelectionRevision, long Version,
    string RunId, ChatRunStatus Status);

enum ChatRunStatus { Running, Completed, Failed, Cancelled, Interrupted }

// Signals on IChat. Selection and activity are distinct from transcript changes.
record ChatSelectionChanged(string Name, ChatSelection Selection) : Signal;
record ChatRunChanged(string Name, long ActivityRevision) : Signal;

// IComposer addition.
Task Follow(string chat);

// Generation-checked overloads for bound composer interactions.
Task Edit(string context, long selectionRevision, string value);
Task<Guid?> Submit(
    Guid requestId, string context, long selectionRevision, string value);
Task BeginVoice(Guid captureId, string context, long selectionRevision);

// ComposerState addition: string? FollowedChat.
// ComposerSubmission addition: long Generation.
// Existing Context, Generation, DraftVersion, Submissions and Voice remain.
```

No new public neuron is introduced. SelectAgent chooses an agent as this chat's presentation source; it does not configure the agent, start a model, route a message, or delete any history.

An AI/UI integration adapter maps IAgent snapshots/signals to existing ChatProjection values. Keep its AI dependency out of the generic Flutter runtime: register the adapter in the module composition that already includes both capabilities. Use a narrow internal adapter seam, not a public arbitrary binding language. Contracts can carry neuron key strings without importing AI implementation types.

### Selection semantics

1. Revision zero means no source selected. The first selection is compare-and-set against zero.
2. The chat stores the new source, a monotonically increasing selection revision, and the operation receipt in one write. Same-source selection is a no-op unless an explicit future reset operation is introduced.
3. Duplicate operation IDs are resolved before revision comparison. The same ID/source returns its original receipt without changing the current selection; an ID reused for another source is refused.
4. A new ID with a stale expected revision gets RevisionConflictException. Scripts re-read and retry only when they still intend that user operation. No blind retries over a newer user action.
5. Retention of selection receipts must cover retained command replay and migration. Evicting an ID while its command can replay is not permitted. Establish a replay horizon/tombstone policy before deleting the corresponding script ledger.
6. The selected source must be authorized for this brain and calling app. An Ino migration may keep old assistant-prefixed agent keys in the same brain. UI observation never widens access.
7. Manual Project remains valid on a never-bound/manual chat. A bound chat refuses public Project writes. An internal adapter commits its projection under the selected revision. Switching bound chat back to manual mode is outside the initial API; use another chat identity.

### Agent observation and presentation

On bind/reactivation, register source observation before reading its current snapshot. A snapshot racing an event is safe because the adapter applies only a matching selection revision and increasing source version. Unsubscribe the retired source and reject already queued stale updates.

Map Runs plus ActiveRun into the existing ChatEntry/ChatActivity shape, preserving stable message IDs, tool activity, partial replies, error/cancellation status and canonical stop/runId actions. Bound projection storage initially stays as a recoverable cache; deleting durable projection storage is a separate optimization.

The adapter listens to existing agent lifecycle signals. It may combine queued invalidations and read the authoritative snapshot once; it does not drop agent facts, commands, or audit records. A failed read/write does not advance its successful-version watermark. Version-zero recovery signals force reconciliation.

ChatChanged remains the renderer's invalidation signal. ChatRunChanged is emitted only when the selected run identity/status changes, not on each token. ActivityRevision orders these changes separately from content versions. It lets a custom app react to working/completed/failed without recreating five projection scripts. Its publication/recovery must be replayable or recoverable from ChatState, including a write-success/publication-failure restart.

The default run/stop/read-receipt projection retains current semantics. More configurable chat actions can still use manual projection; the initial binding is not a generic template engine.

### Composer following

Follow persists one chat identity and performs subscribe-then-read reconciliation. Calling it again with the same chat is idempotent. Retargeting to another chat is refused in the first version; explicit rebinding can be designed separately.

Only ChatSelectionChanged updates Context/Generation. Ordinary ChatChanged/token events do not configure the composer, clear drafts or cancel voice. Bound Configure is refused to prevent two owners of selection. Standalone composers retain Configure and their existing APIs.

On a real selection change, preserve today's semantics: reset the visible draft/voice for the new selection; keep pending submissions with their original context, generation and draft version. Per-conversation draft restoration is not silently introduced by this refactor.

The browser supplies the displayed selection generation for edit/submit/voice-begin. Bound calls without it are refused; standalone legacy calls remain supported. Before admitting a new bound interaction, validate it against the chat's authoritative selection. This has a defined validation point, not an invented cross-grain transaction: a submission validated before a concurrent selection can remain accepted for the old conversation. Never retarget it to the new one.

Duplicate submission IDs resolve to the original captured payload and generation. Completion of an old submission clears the current draft only when context, selection generation and draft version all match. Existing capture IDs continue protecting audio completion; completing old audio cannot write into a newly selected draft.

Follow/Select must not hold a grain turn waiting for a callback from the other neuron. Observation/reconciliation uses existing interleaving and deferred-work patterns, with generation guards. Expose readiness through state and operation results; no settling sleeps.

### UI and read receipts

Keep IChat and IComposer separately addressable. Ui.Reference embeds them inside one immutable IView. One chat watches its selected agent; inline rows/buttons are not remote neurons. Preserve read receipts keyed by person/source/message/content hash; changing selection must not turn them into app-global receipts.

A delayed Stop click is validated against the displayed selection and canonical action. Once validly emitted, the script cancels the captured source/run, even if the UI has since selected another conversation. It must never look up the current agent to reinterpret an old Stop.

## Ino script set

The appendix includes every proposed behavior source and the shared helpers. Top-level behaviors remain independent files because current runtime readiness supports each behavior's outer subscription; this proposal does not hide multiple initializers inside Task.WhenAll.

- open.cs: publish/recover composition; preserve selected agent.
- new.cs: handle new and new-conversation aliases directly on IChat.
- new-button.cs: map the view action directly to the same selection operation, without IApp.Request forwarding.
- send.cs and routed.cs: preserve toolbar routing policy.
- submissions.cs: preserve direct composer admission and draft settlement.
- activity.cs: translate low-frequency chat run state into Ino's custom app activity.
- presence.cs: translate Ino's own app activity into its mood; no other Assistant app.
- stop.cs: cancel the captured agent run.
- voice-begin.cs and voice.cs: preserve recording and recognition orchestration.
- make.cs: preserve focused WriteSynapse behavior and Scratch fallback.
- Ino.cs, InoView.cs, RequestLedger.cs: shared policy, pure layout, and remaining compatibility ledgers.
- app.cs, icon.svg, prompts/system.md: manifest and existing assets.

New-conversation selection owns its deduplication in IChat. The appendix conservatively retains the new/new-button ledgers because those handlers also update the separate status text; the selection receipt alone does not make that entire workflow atomic. Remove these ledgers only after the status side effect and replay horizon are covered. open republishes a view and does not navigate, so repeated open is safe.

Keep toolbar-send routing and direct composer input as distinct explicit policies in this migration. Unifying them is a later product decision. Route fallback, busy-agent handling, tool allowlists, voice errors, focused make and scratch fallback are not deleted to make the samples shorter.

The appendix preserves the existing per-turn model/instruction overrides. It does not Configure an agent every time a view opens. A configuration editor may use the existing IAgent.Configure with its revision guard when idle. No Declare API is required for this UI-binding change.

## Creator and compatibility

Give Ino access to IAppStudio through its explicit capability allowlist, alongside the existing IApp tool surface. This uses the actual authoring neuron; no synthetic ICreator or automatic build retry is introduced. Authoring operations keep their own confirmation, authorization and recovery semantics. A later idempotent Build request contract is needed before a retained script command can safely retry creation after an ambiguous response.

Before cutover, quiesce old Assistant/Ino writers. Adopt the existing selected agent key, transcript/read-receipt state, composer drafts/submissions/audio, settings, prompts and ledgers; do not copy agent histories into new agents. Migration must seed the chat selection revision at or above the old generation, then increment for a changed binding, so old generations are never accidentally current.

Preserve old assistant operation and UI endpoints as compatibility aliases/adapters. They must preserve original operation IDs and caller identity rather than forwarding through Request and creating new IDs. Exactly one set of behaviors processes a request. Retain completed/open operation receipts so replay cannot reopen or switch a closed/retired view.

The script listings below describe steady-state Ino after that migration. The bootstrap main conversation is for a fresh installation; migration must seed selection before these scripts start.

## Removed and retained plumbing

Delete Assistant's projection-cleared/completed/failed/progressed/selected/started scripts, Assistant.Project, Sources.Conversation, pointer-text writes, and manual composer-selection reconciliation. Replace six projection behaviors with native source binding plus one small custom activity behavior.

Delete the duplicate Assistant installation, Ino-to-Assistant new/voice forwarding, and the new-button-to-app-request hop. Preserve legacy aliases during migration.

Retain genuine orchestration: routing guards, direct admission, speech recognition, canonical Stop handling, creator/synapse operations, and status/mood policy. Retain RequestLedger for operations that still lack receiver-side idempotency. Do not claim that moving selection makes multi-neuron workflows atomic.

## Review and verification requirements

- A-to-B-to-A delayed edit/submit/voice-begin refusal.
- Selection/write/subscribe/read races, replayed selection IDs and conflicting payloads.
- Reactor restart after state write but before signal publication; no missed latest state.
- Same-source streaming preserves drafts, voice capture and read receipts.
- Submission accepted before selection keeps its captured agent; old settlement never clears a new draft.
- Old source updates/actions cannot affect the new selected run; valid queued Stop targets its original run.
- Manual projection still works; bound/manual writer conflict refused.
- Same ID while agent running/completed/failed remains covered under the existing admission semantics; do not simplify scripts until that contract is separately improved.
- Replay across request-retention/receipt-retention boundaries.
- Cross-brain source rejection, delegated app authorization, membership revocation, user-only read acknowledgements.
- Voice failure, draft edits during transcription, model failures, busy responses, routing confidence/self-route/no-named-app guards, all make/creator scenarios.
- Migration with old conversations, draft/audio, pending submission, in-flight route/turn, receipts and retained requests.
- Headless Ino and fresh-browser restoration, plus unchanged root suite/span budget. Add a focused trace assertion that token updates do not invoke projection scripts or reconfigure composer.
- Fix runtime history-publication completion before treating global idle as proof all work finished. This is an existing runtime correctness issue, not implemented here.

## Code appendix

These are proposed file contents, not installed scripts. Existing contracts and policies are reused; only SelectAgent, Follow, generation-aware bound interactions, ChatState selection/run metadata, and their signals depend on this design. Existing transient-retry and admission limitations noted above remain visible. Imports supplied by the script compiler remain supplied there. No omitted bodies or ellipses stand in for a new runtime workflow.

The retained orchestration has known limits that this binding design does not conceal: toolbar routing currently chooses the selected conversation when the route finishes (composer submissions instead capture it at submission); RequestLedger has a 256-ID retention limit and is not a multi-neuron transaction; delayed status updates can race selection; IAppStudio.Build has no caller-idempotency contract. These need separate, narrowly scoped contract decisions before claiming universal replay safety. This design preserves current routing/admission/voice policies while removing presentation synchronization. Cancellation propagation is tightened in the draft submission handler so shutdown does not become a deferred user error.

Presence state is persisted through the existing app blackboard. AppActivity remains its existing event source; this design does not assert that an unacknowledged one-way activity publication is a durable global completion barrier.


### app.cs

```csharp
using DigitalBrain.Apps;

static class App
{
    public const string Name = "ino";
    public const string Version = "3.0.0"; // Proposed migration release.
    public static readonly AppManifest Manifest = new(
        Title: "Ino",
        Description: "Talk to your brain, use its capabilities, and create apps.",
        Operations:
        [
            new("open", "Show Ino."),
            new("send", "Route or answer a message."),
            new("new", "Start a new conversation."),
            new("new-conversation", "Alias for new."),
            new("voice", "Begin voice input."),
            new("make", "Apply a sentence to the focused app, or Scratch."),
        ],
        Settings:
        [
            new("Model", "Model catalog id; empty uses the default.", ""),
            new("RouteGate", "Confidence required for a direct route.", "0.8"),
        ],
        Slots: [], Icon: "icon.svg",
        Toolbar:
        [
            new("send", Kind: "text", Label: "Message your brain"),
            new("new-conversation", Icon: "chat", Label: "New conversation"),
            new("voice", Icon: "mic", Label: "Voice"),
        ]);
}
```

### Ino.cs

```csharp
using System.Globalization;
using System.Text.Json;
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models;
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Chat;
using DigitalBrain.Flutter.Views;
using DigitalBrain.Flutter.Workspace;
using DigitalBrain.Flame.Scene;
using DigitalBrain;
using DigitalBrain.Flutter.Text;
using DigitalBrain.Flutter.Form;
using DigitalBrain.Integrations;
using DigitalBrain.Microsoft.Windows;
using DigitalBrain.Microsoft.CSharp.Files;
using DigitalBrain.Postgres;
using DigitalBrain.Mcp;
using DigitalBrain.Microsoft.Playwright;

// Shared by every synapse of the assistant: the app's key, its brain scope, the selected
// conversation and the composed surface. A synapse is one reaction; this is the vocabulary
// they all speak.
public static class Ino
{
    public const double DefaultRouteGate = 0.8;

    // Jev routes short commands; a longer message goes straight to the model.
    public const int MaxRoutedChars = 2000;

    // What the model may act on: the contracts this app composes, checked by the compiler. An app's
    // answer is neuron state (a text, a table, a chart, an image), so those parts are readable too.
    public static readonly string[] Contracts = [typeof(IConnectionRequests).FullName!, typeof(IPostgresServer).FullName!, typeof(IApp).FullName!,
        typeof(IWorkspace).FullName!, typeof(IAppStudio).FullName!, typeof(IForm).FullName!, typeof(ICSharpFile).FullName!,
        typeof(IWindows).FullName!, typeof(IConsole).FullName!, typeof(IFileSystem).FullName!,
        typeof(IMcpServer).FullName!, typeof(IPageTools).FullName!, typeof(IText).FullName!,
        typeof(DigitalBrain.Flutter.Table.ITable).FullName!, typeof(DigitalBrain.Flutter.Chart.IChart).FullName!,
        typeof(DigitalBrain.Flutter.Image.IImage).FullName!];

    public static string Key(DigitalBrainConnection brain) => brain.Setting("App")!;
    public static string Scope(DigitalBrainConnection brain) => brain.Setting("Brain")!;

    public static double RouteGate(AppSnapshot snapshot)
        => double.TryParse(snapshot.Settings.GetValueOrDefault("RouteGate", ""), NumberStyles.Float, CultureInfo.InvariantCulture, out var gate)
            && gate is >= 0 and <= 1 ? gate : DefaultRouteGate;

    public static string Clip(string text) => text.Length <= 200 ? text : text[..200];

    // Starts the model's turn for a sent message, under the request id so a redelivered message replays
    // instead of running twice. A turn that cannot start (a response is already running, the Model
    // setting names an unavailable model) says so on the status line and never stops the synapse.
    public static async Task Answer(DigitalBrainConnection brain, AppSnapshot snapshot, string input, string hint, Guid requestId)
    {
        try
        {
            var runId = requestId.ToString("N");
            var source = (await EnsureSelection(brain)).Agent;
            var conversation = brain.Get<IAgent>(source);
            if ((await conversation.Read()).ActiveRun is { } running)
            {
                // A redelivered message whose turn is still running is already being answered.
                if (running.RunId == runId) { return; }
                // The message is kept in an empty draft, so sending it later is one click; typing is never replaced.
                var composer = brain.Get<IComposer>(Key(brain) + "/composer");
                var draft = await composer.Read();
                var kept = draft.Draft.Length == 0 && draft.Context == source;
                if (kept) { await composer.Edit(source, draft.Generation, input); }
                await Status(brain, kept
                    ? "A response is already running; your message is in the draft, send it when the response finishes."
                    : "A response is already running; send your message again when it finishes.");
                await brain.Get<IApp>(Key(brain)).Progress("attention", "A response is already running");
                return;
            }
            var choice = snapshot.Settings.GetValueOrDefault("Model", "");
            var model = choice.Length > 0 ? await brain.Get<IModelCatalog>("default").Select(choice) : null;
            await conversation.Start(AgentTurn.Text(input, instructions: snapshot.Files.GetValueOrDefault("prompts/system.md", "") + hint, contracts: Contracts)
                with { Model = model, RunId = runId });
        }
        catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
        {
            await Status(brain, "Could not start the answer: " + Clip(error.Message));
            await brain.Get<IApp>(Key(brain)).Progress("attention", "Could not start the answer");
        }
    }

    public static Task Status(DigitalBrainConnection brain, string text)
        => brain.Get<IText>(Key(brain) + "/status").Set(text);

    public static long ProgramRevision(DigitalBrainConnection brain)
        => long.Parse(brain.Setting("ProgramRevision")!, CultureInfo.InvariantCulture);

    public static async Task<ChatSelection> EnsureSelection(DigitalBrainConnection brain)
    {
        var chat = brain.Get<IChat>(Key(brain) + "/transcript");
        if ((await chat.Read()).Selection is { } current) { return current; }
        try
        {
            return await chat.SelectAgent(
                Key(brain) + "/conversations/main", 0, Guid.NewGuid());
        }
        catch (RevisionConflictException)
        {
            return (await chat.Read()).Selection
                ?? throw new InvalidOperationException("Chat selection was not initialized.");
        }
    }

    public static async Task NewConversation(DigitalBrainConnection brain, Guid operationId)
    {
        var chat = brain.Get<IChat>(Key(brain) + "/transcript");
        var current = await EnsureSelection(brain);
        var source = Key(brain) + "/conversations/c-" + operationId.ToString("N");
        var selected = await chat.SelectAgent(source, current.Revision, operationId);
        if ((await chat.Read()).Selection == selected) { await Status(brain, ""); }
    }

    public static async Task ComposeAsync(DigitalBrainConnection brain)
    {
        var key = Key(brain);
        await EnsureSelection(brain);
        await brain.Get<IComposer>(key + "/composer").Follow(key + "/transcript");
        await new ViewPublisher(brain.Get<IView>(key + "/view"),
            ProgramRevision(brain)).Publish(InoView.Render(key));
        await brain.Get<IApp>(key).Present(ProgramRevision(brain),
            new(new Sphere("icon.svg", ["mood"], Presence()),
                Main: new(UIVocabulary.ViewType, key + "/view"),
                Views: [new("full", new(UIVocabulary.ViewType, key + "/view"))]));
    }

    public static BehaviorTree Presence() => new(TreeNode.Selector(
        TreeNode.Sequence(false, TreeNode.Condition("mood", "listening"), TreeNode.Scale(1.08, 0.4), TreeNode.Scale(1.0, 0.4)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "thinking"), TreeNode.Pulse(0.12, 1.0)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "acting"), TreeNode.Pulse(0.2, 0.5)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "speaking"), TreeNode.Fade(0.8, 0.3), TreeNode.Fade(1.0, 0.3)),
        TreeNode.Sequence(false, TreeNode.Condition("mood", "error"), TreeNode.Scale(0.9, 0.2), TreeNode.Wait(0.6), TreeNode.Scale(1.0, 0.2)),
        TreeNode.Repeat(TreeNode.Wait(1))));

    public static string MoodOf(string activityState) => activityState switch
    {
        "listening" or "accepted" => "listening", "working" or "waiting" => "thinking",
        "reading" or "searching" => "acting", "completed" => "speaking", "attention" => "error", _ => "idle",
    };
}
```

### InoView.cs

```csharp
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Views;

// Pure composition: durable references retain their public contracts and local UI identity.
public static class InoView
{
    public static UiNode Render(string appKey) => Ui.Column("main",
    [
        Ui.Row("header",
        [
            Ui.Reference("status", new(UIVocabulary.TextType, appKey + "/status")),
            Ui.Button("new", "New conversation", "new"),
        ], extents: [0, 160]),
        Ui.Reference("transcript", new(UIVocabulary.ChatType, appKey + "/transcript")),
        Ui.Reference("composer", new(UIVocabulary.ComposerType, appKey + "/composer")),
    ], extents: [40, 0, 152]);
}
```

### open.cs

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
await Ino.ComposeAsync(brain);
await foreach (var request in brain.On(app, "open", brain.Stopping))
{
    try { await Ino.ComposeAsync(brain); }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    {
        await app.FailPresentation(Ino.ProgramRevision(brain), error.Message);
        await Ino.Status(brain, "Could not open Ino: " + Ino.Clip(error.Message));
    }
}
```

### new.cs

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Client;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
var ledger = await RequestLedger.LoadAsync(brain, "new");
await foreach (var request in brain.On<AppRequested>(app, brain.Stopping))
{
    if (request.Operation is not ("new" or "new-conversation")
        || ledger.Handled(request.RequestId)) { continue; }
    try { await Ino.NewConversation(brain, request.RequestId); }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Ino.Status(brain, "Could not start a new conversation: " + Ino.Clip(error.Message)); }
    await ledger.Record(request.RequestId);
}
```

### new-button.cs

```csharp
using DigitalBrain.Client;
using DigitalBrain.Flutter.Views;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var view = brain.Get<IView>(Ino.Key(brain) + "/view");
var ledger = await RequestLedger.LoadAsync(brain, "new-button");
await foreach (var clicked in brain.On<ViewAction>(view, brain.Stopping))
{
    if (clicked.Key != "new" || clicked.Action != "new"
        || clicked.RequestId == Guid.Empty || ledger.Handled(clicked.RequestId)) { continue; }
    try { await Ino.NewConversation(brain, clicked.RequestId); }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Ino.Status(brain, "Could not start a new conversation: " + Ino.Clip(error.Message)); }
    await ledger.Record(clicked.RequestId);
}
```

### send.cs

```csharp
using DigitalBrain.AI.Routing;
using DigitalBrain.Apps;

// The assistant tool path: "send" by request. The composer path lives in submissions.cs.
// Jev first: the request is asked of the router and this reaction ends; routed.cs answers it.
// A replayed request is skipped, so Jev is asked once per message.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
var router = brain.Get<IRouter>(Ino.Scope(brain));
var ledger = await RequestLedger.LoadAsync(brain, "send");
await foreach (var request in brain.On(app, "send", brain.Stopping))
{
    if (ledger.Handled(request.RequestId)) { continue; }
    // Jev keeps the requests it was asked: one it already holds was sent before this ledger saw it.
    if (await router.Pending(request.RequestId, brain.Stopping) is not null) { await ledger.Record(request.RequestId); continue; }
    if (string.IsNullOrWhiteSpace(request.Input) || request.Input.Length > 32000) { await ledger.Record(request.RequestId); continue; }
    await app.Progress("listening", "Heard you");
    if (request.Input.Length > Ino.MaxRoutedChars)
    {
        await Ino.Status(brain, "A long message goes straight to the model");
        await Ino.Answer(brain, await app.Read(), request.Input, "", request.RequestId);
    }
    else
    {
        try { await router.Ask(new RouteRequest(request.RequestId, request.Input), brain.Stopping); }
        catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
        {
            await Ino.Status(brain, "Jev unavailable; asking the model. " + Ino.Clip(error.Message));
            await app.Progress("attention", "Jev unavailable; asking the model");
            await Ino.Answer(brain, await app.Read(), request.Input, "", request.RequestId);
        }
    }
    await ledger.Record(request.RequestId);
}
```

### routed.cs

```csharp
using DigitalBrain.AI.Routing;
using DigitalBrain.AI.Routing.Signals;
using DigitalBrain.Apps;
using DigitalBrain.Flutter;
using DigitalBrain.Flutter.Workspace;

// Jev's answer to a request send.cs asked. A confident, direct route is carried out: opening the app
// the message names (the route Jev decided, never decided again), or a pure read through the router.
// Any other operation of a named app needs its input filled from the message, so the model answers with
// the route as a hint. A route back into the assistant, or to any operation of an app the message does
// not name, is not carried out: the model answers the message itself. The request lives in the router's
// state; the status line says which path answered.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = Ino.Key(brain);
var scope = Ino.Scope(brain);
var app = brain.Get<IApp>(key);
var router = brain.Get<IRouter>(scope);
var ledger = await RequestLedger.LoadAsync(brain, "routed");
await foreach (var routed in brain.On<Routed>(router, brain.Stopping))
{
    // A redelivered answer is skipped, so a route is carried out (and a status written) once per message.
    if (ledger.Handled(routed.Id)) { continue; }
    await Carry(routed);
    await ledger.Record(routed.Id);
}

async Task Carry(Routed routed)
{
    if (await router.Pending(routed.Id, brain.Stopping) is not { } asked) { return; }
    var snapshot = await app.Read();
    var hint = "";
    try
    {
        if (asked.Result is not { } route)
        {
            // Routed with no result means Jev answered and nothing fits (unsure, with no hint to give);
            // Failed means Jev itself could not answer.
            await Ino.Status(brain, asked.Status == "Routed"
                ? "Jev unsure (no capability fits); asking the model"
                : "Jev unavailable; asking the model. " + Ino.Clip(asked.Error ?? routed.Error ?? ""));
        }
        else if (route.Confidence < Ino.RouteGate(snapshot) || !route.IsDirect)
        {
            await Ino.Status(brain, $"Jev unsure ({route.Confidence:0.00}); asking the model");
            hint = "\n\n" + route.Hint();
        }
        else if (route.App is null)
        {
            var outcome = await router.Dispatch(asked.State, [route.Contract], brain.Stopping);
            var chosen = $"{route.Contract}.{route.Method}";
            await Ino.Status(brain, outcome.Dispatched
                ? $"Jev: {chosen} ({route.Confidence:0.00}) -> {Ino.Clip(outcome.Result ?? "done")}"
                : $"Jev chose {chosen} but could not carry it out: {Ino.Clip(outcome.Error ?? "")}");
            if (outcome.Dispatched) { return; }
            hint = "\n\n" + route.Hint();
        }
        else if (route.App == "assistant" || IApp.Key(scope, route.App) == key)
        {
            await Ino.Status(brain, $"Jev pointed back at the assistant ({route.App}.{route.Operation}, {route.Confidence:0.00}); asking the model");
            hint = "\n\n" + route.Hint();
        }
        else
        {
            var chosen = $"{route.App}.{route.Operation}";
            var target = brain.Get<IApp>(IApp.Key(scope, route.App));
            var manifest = (await target.Read()).Manifest;
            var title = manifest.Title;
            if (!Names(asked.State, route.App, title))
            {
                // Jev guessed an app the person never named: the model answers the message itself, and the
                // guess is offered only as a weak hint, never as an operation whose input to fill.
                await Ino.Status(brain, $"Jev suggested {chosen} ({route.Confidence:0.00}), but the message does not name {title}; asking the model");
                hint = $"\n\nJev suggested the {title} app's \"{route.Operation}\", but the message does not name that app. "
                    + "Answer the message itself with your tools; use that app only if it clearly fits.";
            }
            else if (route.Operation != "open")
            {
                await Ino.Status(brain, $"Jev suggested {chosen} ({route.Confidence:0.00}); asking the model to fill its input");
                hint = "\n\n" + route.Hint();
            }
            else
            {
                var workspace = brain.Get<IWorkspace>(scope);
                await workspace.Show(IApp.Key(scope, route.App), routed.Id.ToString(), (await workspace.Read()).Revision);
                await Ino.Status(brain, $"Jev: {chosen} ({route.Confidence:0.00}) -> opened {title}");
                return;
            }
        }
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Ino.Status(brain, "Jev could not carry it out; asking the model. " + Ino.Clip(error.Message)); }
    await Ino.Answer(brain, snapshot, asked.State, hint, routed.Id);
}

// Jev is often confident about the wrong app; a message that names the app (by name or title) is not.
static bool Names(string message, string name, string title)
{
    static string Plain(string text) => text.Replace('-', ' ').Replace('_', ' ').Trim();
    return message.Contains(Plain(name), StringComparison.OrdinalIgnoreCase) || message.Contains(name, StringComparison.OrdinalIgnoreCase)
        || (Plain(title).Length > 0 && message.Contains(Plain(title), StringComparison.OrdinalIgnoreCase));
}
```

### submissions.cs

```csharp
using DigitalBrain.AI.Agents;
using DigitalBrain.AI.Models;
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter.Chat;

// The composer path: each pending submission starts a turn in its conversation under the submission id
// and is settled, so a redelivered submission never runs twice. It speaks the same contracts as "send".
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var app = brain.Get<IApp>(appKey);
var composer = brain.Get<IComposer>(appKey + "/composer");

await foreach (var submitted in brain.On<ComposerSubmitted>(composer, Reconcile, brain.Stopping))
{
    await Reconcile();
}

async Task Reconcile()
{
    foreach (var request in (await composer.Read()).Submissions.Where(item => item.Status == "pending"))
    {
        try
        {
            await app.Progress("listening", "Heard you");
            var agent = brain.Get<IAgent>(request.Context);
            var state = await agent.Read();
            var runId = request.Id.ToString("N");
            var retained = state.Runs.FirstOrDefault(run => run.RunId == runId);
            if (retained is not null && retained.Status != AgentRunStatus.Completed)
            {
                await composer.Settle(request.Id, retained.Error ?? "The earlier attempt was interrupted. Review your draft and send again.");
                continue;
            }
            if (retained is null && state.ActiveRun?.RunId != runId)
            {
                if (state.ActiveRun is not null)
                {
                    await composer.Settle(request.Id, "A response is already running. Your draft is saved; send it when the response finishes.");
                    continue;
                }
                var snapshot = await app.Read();
                var choice = snapshot.Settings.GetValueOrDefault("Model", "");
                var model = choice.Length > 0 ? await brain.Get<IModelCatalog>("default").Select(choice) : null;
                await agent.Start(AgentTurn.Text(request.Text, instructions: snapshot.Files.GetValueOrDefault("prompts/system.md", ""), contracts: Ino.Contracts)
                    with { RunId = runId, Model = model });
                // The composer asks the model directly; an earlier route's status no longer applies.
                await Ino.Status(brain, "");
            }
            await composer.Settle(request.Id);
        }
        catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
        {
            // Admission may have committed before its response failed. Keep the same run ID for retry.
            await composer.Defer(request.Id, "Could not confirm delivery. Your draft is saved; Send retries the same message. " + error.Message);
        }
    }
}
```

### activity.cs

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Client;
using DigitalBrain.Flutter.Chat;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
var chat = brain.Get<IChat>(Ino.Key(brain) + "/transcript");
long delivered = -1;
await foreach (var change in brain.On<ChatRunChanged>(chat, Reconcile, brain.Stopping))
{
    await Reconcile();
}

async Task Reconcile()
{
    var state = await chat.Read();
    if (state.ActivityRevision <= delivered) { return; }
    switch (state.Run?.Status)
    {
        case ChatRunStatus.Running:
            await app.Progress("working", "Working on your message");
            break;
        case ChatRunStatus.Completed:
            await app.Progress("completed", "Answered");
            break;
        case ChatRunStatus.Failed:
            await app.Progress("attention", "The turn failed");
            break;
    }
    delivered = state.ActivityRevision;
}
```

### presence.cs

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Apps.Signals;
using DigitalBrain.Client;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var app = brain.Get<IApp>(Ino.Key(brain));
await foreach (var activity in brain.On<AppActivity>(app, brain.Stopping))
{
    await app.WriteBlackboard(Ino.ProgramRevision(brain),
        new() { ["mood"] = Ino.MoodOf(activity.State) });
}
```

### stop.cs

```csharp
using System.Text.Json;
using DigitalBrain.AI.Agents;
using DigitalBrain.Client;
using DigitalBrain.Flutter.Chat;
using DigitalBrain.Flutter.Text;

await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = brain.Setting("App")!;
await foreach (var clicked in brain.On<ChatActionActivated>(brain.Get<IChat>(key + "/transcript"), brain.Stopping))
{
    if (!clicked.ActionId.StartsWith("stop/", StringComparison.Ordinal)) { continue; }
    try
    {
        var command = JsonSerializer.Deserialize<JsonElement>(clicked.Payload);
        var source = clicked.Source;
        var runId = command.GetProperty("runId").GetString() ?? "";
        if (!source.StartsWith(Ino.Scope(brain) + "/", StringComparison.Ordinal) || runId.Length == 0
            || clicked.ActionId != "stop/" + runId) { continue; }
        await brain.Get<IAgent>(source).CancelRun(runId);
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    {
        await brain.Get<IText>(key + "/status").Set("Could not stop the response. Try Stop again. " + error.Message);
    }
}
```

### voice-begin.cs

```csharp
using DigitalBrain.Apps;
using DigitalBrain.Flutter.Chat;

// The dock's mic: "voice" composes the surface and begins a voice message on the composer under the
// request id. The composer captures the recording and voice.cs transcribes it into the draft. A
// recording already being transcribed is never replaced; a capture that only began is begun again.
// A replayed request is skipped, so a finished capture is never begun again.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = Ino.Key(brain);
var app = brain.Get<IApp>(key);
var composer = brain.Get<IComposer>(key + "/composer");
var ledger = await RequestLedger.LoadAsync(brain, "voice");
await foreach (var request in brain.On(app, "voice", brain.Stopping))
{
    if (ledger.Handled(request.RequestId)) { continue; }
    try
    {
        await Ino.ComposeAsync(brain);
        var state = await composer.Read();
        if (state.Voice is not { Status: "transcribing" })
        {
            await composer.BeginVoice(request.RequestId, state.Context, state.Generation);
            await app.Progress("listening", "Listening");
        }
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Ino.Status(brain, "Could not start voice input: " + Ino.Clip(error.Message)); }
    await ledger.Record(request.RequestId);
}
```

### voice.cs

```csharp
using DigitalBrain.AI.Media;
using DigitalBrain.Client;
using DigitalBrain.Flutter.Chat;

// A captured recording is transcribed; the composer's state when recognition returns decides the outcome.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var appKey = brain.Setting("App")!;
var composer = brain.Get<IComposer>(appKey + "/composer");
await foreach (var captured in brain.On<ComposerVoiceCaptured>(composer, () => Transcribe(brain.Stopping), brain.Stopping))
{
    await Transcribe(brain.Stopping);
}

async Task Transcribe(CancellationToken ct)
{
    if ((await composer.Read()).Voice is not { Status: "transcribing" } voice) { return; }
    var audio = await composer.ReadAudio(voice.Id);
    if (audio is null) { return; }
    try
    {
        var result = await brain.Get<ISpeechRecognizer>(appKey + "/recognizer")
            .Recognize(new SpeechRecognitionRequest(new MediaPayload(audio.Bytes, audio.MimeType), "voice.wav"), ct);
        // The person may have cleared or re-recorded meanwhile: the composer's state decides.
        var current = (await composer.Read()).Voice;
        if (current?.Id == voice.Id && current.Status == "transcribing") { await composer.CompleteVoice(voice.Id, result.Text); }
        else { await composer.CancelVoice(voice.Id); }
    }
    catch (Exception) when (!ct.IsCancellationRequested)
    { await composer.CompleteVoice(voice.Id, null, "Transcription failed. Your draft is unchanged. Try recording again or type your message."); }
}
```

### make.cs

```csharp
using System.Text.Json;
using DigitalBrain.Apps;

// "make": the focused thing does what the sentence says. The sentence becomes one synapse through the fast
// path of the focused app, or of the brain's "scratch" app when nothing focused is an app. Nothing waits for
// the writer: the outcome is the target app's synapse record under this request id. A replayed id is skipped,
// and the fast path itself answers a repeated operation id once.
await using var brain = await DigitalBrainClient.ConnectAsync(args);
var key = Ino.Key(brain);
var app = brain.Get<IApp>(key);
var scope = Ino.Scope(brain);
var own = IApp.NameOf(scope, key) ?? "ino";
var ledger = await RequestLedger.LoadAsync(brain, "make");
await foreach (var request in brain.On(app, "make", brain.Stopping))
{
    if (ledger.Handled(request.RequestId)) { continue; }
    try
    {
        var (sentence, focus) = Parse(request.Input);
        var target = await Target(focus);
        await brain.Get<IApp>(IApp.Key(scope, target)).WriteSynapse(sentence, focus, request.RequestId);
        await Ino.Status(brain, $"Making it in {target}: the synapse lands in {target}'s synapse list.");
    }
    catch (Exception error) when (!brain.Stopping.IsCancellationRequested)
    { await Ino.Status(brain, "Could not make it: " + Ino.Clip(error.Message)); }
    await ledger.Record(request.RequestId);
}

// {"focus": ["<key>", …], "sentence": "…"}; plain text is a sentence with no focus.
static (string Sentence, string[] Focus) Parse(string input)
{
    var trimmed = (input ?? "").Trim();
    if (trimmed.Length == 0 || trimmed[0] != '{')
    {
        if (!trimmed.Any(char.IsLetter)) { throw new ArgumentException("say in a sentence what the focused thing should do."); }
        return (trimmed, []);
    }
    using var document = JsonDocument.Parse(trimmed);
    var root = document.RootElement;
    var sentence = root.TryGetProperty("sentence", out var said) && said.ValueKind == JsonValueKind.String ? said.GetString()!.Trim() : "";
    if (!sentence.Any(char.IsLetter)) { throw new ArgumentException("\"sentence\" says in words what the focused thing should do."); }
    string[] focus = root.TryGetProperty("focus", out var keys) && keys.ValueKind == JsonValueKind.Array
        ? [.. keys.EnumerateArray().Where(k => k.ValueKind == JsonValueKind.String).Select(k => k.GetString()!.Trim()).Where(k => k.Length > 0).Distinct(StringComparer.Ordinal).Take(16)]
        : [];
    return (sentence, focus);
}

// The first focus key inside one of this brain's installed apps ({brain}/apps/{name} or a neuron under it, such
// as its window) names the target; the assistant never writes into itself. Otherwise the scratch app.
async Task<string> Target(string[] focus)
{
    var prefix = scope + "/apps/";
    foreach (var focused in focus.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)))
    {
        var rest = focused[prefix.Length..];
        var name = rest.Contains('/') ? rest[..rest.IndexOf('/')] : rest;
        if (name.Length == 0 || name == own || name == "assistant") { continue; }
        if ((await brain.Get<IApp>(IApp.Key(scope, name)).Read()).Manifest.Title.Length > 0) { return name; }
    }
    var scratch = brain.Get<IApp>(IApp.Key(scope, "scratch"));
    if ((await scratch.Read()).Manifest.Title.Length == 0)
    {
        try
        {
            await scratch.Create(new AppManifest("Scratch", "Synapses written from single sentences.",
                [new AppOperation("run", "Free-form input for the synapses written here; each reads what it needs.")], [], []),
                "# Scratch\n\nEach synapse here was written from one sentence through the fast path. "
                + "\"run\" carries free-form input to whichever synapse reacts to it.");
        }
        catch (InvalidOperationException)
        {
            // Created meanwhile by another caller (the Engineer shares this app) is fine.
            if ((await scratch.Read()).Manifest.Title.Length == 0) { throw; }
        }
    }
    return "scratch";
}
```

### RequestLedger.cs

```csharp
using DigitalBrain.Client;
using DigitalBrain.Flutter.Text;

// Delivery is at-least-once, and a fresh subscription is seeded with the requests the app retains, so a
// request synapse would otherwise carry an old request out again: reopen a window the person closed,
// switch back to an old conversation, begin a finished voice capture again or re-ask Jev. Each request
// synapse keeps the ids it has handled in a ledger text of its own and skips a replayed id. The ledger
// is the synapse's state, so a reaped script reads it back on startup (one read).
public sealed class RequestLedger
{
    private const int Kept = 256;
    private readonly IText _text;
    private readonly List<Guid> _ids;

    private RequestLedger(IText text, List<Guid> ids) { _text = text; _ids = ids; }

    public static async Task<RequestLedger> LoadAsync(DigitalBrainConnection brain, string synapse)
    {
        var text = brain.Get<IText>(brain.Setting("App")! + "/handled/" + synapse);
        var ids = (await text.Read()).Markdown.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => Guid.TryParse(line, out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty).ToList();
        return new(text, ids);
    }

    public bool Handled(Guid id) => _ids.Contains(id);

    public Task Record(Guid id)
    {
        _ids.Add(id);
        if (_ids.Count > Kept) { _ids.RemoveRange(0, _ids.Count - Kept); }
        return _text.Set(string.Join('\n', _ids));
    }
}
```

## Unchanged assets

Retain the current Ino icon.svg and the existing Assistant prompts/system.md as Ino's initial prompt asset, preserving any deployed user modifications during migration. The old feature files remain untouched until a separately authorized implementation and migration.

