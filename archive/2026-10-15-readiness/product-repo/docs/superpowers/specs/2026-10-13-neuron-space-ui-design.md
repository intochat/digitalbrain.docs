# Neuron space: one UI for every neuron

Date: 2026-10-13
Status: design approved in chat on 2026-10-13, section by section. No code changed.
Supersedes: the window/desktop, Home grid, Assistant island and Welcome scene parts of
`2026-10-12-workspace-design-system.md` and `2026-10-12-presentation-hosting-design.md`. Their typed
presentation root in app state, program-revision guard and shared design tokens remain valid and are
built on here. Replaces the `StateMachine` part of `2026-10-11-flame-stage-design.md` with behavior trees.

## Intent

Every neuron the person can look at is drawn the same way: a sphere with its icon, name and
description, and when it has a UI, components in fixed places around the sphere. Ino's chat, a
folder in Files, a friend's posts are the same mechanism. There is one screen, one transition (zoom),
one bottom toolbar that shows the focused neuron's quick actions, and one stable control (Home, bottom
left). Home is the brain itself: a field of every neuron, running ones highlighted. Sign-in lands on
Ino focused with its chat open.

Decisions taken in the brainstorm:

1. Every neuron has its own sphere, not only Ino.
2. Navigation is one continuous space with zoom; Back and Home are the reverse flight. Nested neurons
   (a post inside a friend) are one level deeper in the same space.
3. Sphere behavior is a behavior tree stored as scene data authored in C#, validated by the publish
   gate, run in Dart with the `flame_behavior_tree` package (the robot and traffic examples are the
   reference shapes).
4. Components around the sphere are fixed slots filled by typed neurons: side, main, toolbar.
5. Home is the brain; the field is every neuron, running ones highlighted.
6. Friend and Post are in scope as the third reference app, built on Circle.
7. Sign-in goes straight to Ino focused, chat in main. The Welcome scene and first-run view are deleted.
8. Approach A: the brain's space is one derived scene composed by the Flutter module from workspace
   state and every app's published presentation. Apps describe themselves; they never write Home.

## The four words

- **Neuron:** an app's state holds its presentation; slot neurons hold the contents; the workspace
  neuron holds the navigation path; posts and profiles are neurons in the author's brain.
- **Signal:** presentation and workspace changes invalidate the derived scene; activity signals set
  the module-owned blackboard keys.
- **Behavior:** one synapse composes slot contents and the blackboard, then publishes the presentation.
- **Connector:** the Flutter shell renders the derived scene with Flame, runs the trees, overlays the
  slots with the shared design system and reports taps as workspace operations.

A presentation, a sphere and a behavior tree are data held by neurons, not new runtime objects.

## Section 1: the model

### Presentation

Held in app state under the program-revision guard of the hosting spec:

```
Presentation(
    Sphere Sphere,            // always present
    UiChildRef? Side,         // left column
    UiChildRef? Main)         // large area beside the sphere

Sphere(
    string Icon,              // manifest icon file or shell icon name
    string[] BlackboardKeys,  // keys the app's synapses may write, e.g. mood, unread
    BehaviorTree? Tree)       // null uses the shell's default idle tree
```

`Blackboard` values are a string map on the app's presentation state, written by the app's
synapses for its declared keys and by the Flutter module for the reserved keys `running` and
`attention`. A script write to a reserved key is refused.

Toolbar stays in the manifest (`AppManifest.Toolbar`), unchanged.

Publication rules from the hosting spec hold: null root is "not ready", error is recorded under the
same guard, identical publication is idempotent, program replacement invalidates the prior
presentation, only the executing assignment may publish.

### Workspace

The workspace neuron (`IWorkspace`, per brain) is reshaped to:

```
WorkspaceState(long Revision, string[] Path, string[] Open)

Show(string app, string operationId, long expectedRevision)   // push
Back(string operationId, long expectedRevision)               // pop one
Home(string operationId, long expectedRevision)               // pop to the brain
Close(string app, string operationId, long expectedRevision)  // remove from Open
```

`Path[0]` is always the brain's own key (Home). The focused neuron is `Path[^1]`. `Open` is every
app with a prepared presentation that is running. A fresh brain seeds `Path = [brain, ino]`.
Window ids, titles and references are gone.

### The derived scene

The Flutter module derives one `SceneDefinition` per brain and streams it on the existing scene
stream. It is never stored by a script. Contents:

- one sphere node per neuron in the focused neuron's field (for Home: every installed app, every
  friend; for a friend: their posts), with the icon, blackboard and tree from its presentation;
- the camera targeted at the focused sphere; focus scale on it;
- slot references for the focused neuron, read from its presentation at render time.

Rebuilt whole on every workspace or presentation change. No script subscribes to it.

### Flame contract

`StateMachine` is removed from `SceneDefinition`. A node may carry a `BehaviorTree`:

```
BehaviorTree(TreeNode Root)
TreeNode = Selector(children) | Sequence(children, memory) | Repeat(child)
         | Condition(key, value) | Wait(seconds)
         | MoveTo(x, y, seconds) | Scale(factor, seconds) | Fade(alpha, seconds) | Pulse(amplitude, seconds)
```

`SceneValidation.Check` validates tree shape, that every `Condition.key` is a declared or reserved
blackboard key, and task parameter ranges, per `FlameSchema` (Option A of the Flame redesign
proposal). The schema is emitted by a Flame-module fact and asserted by a Flutter test so both sides
cannot drift. Unknown node types still render as placeholders.

## Section 2: the shell

- **One screen.** A full-bleed Flame layer draws the field and camera. Over it, four fixed regions:
  left column (side slot), centre area (main slot; the focused sphere sits left of centre when main
  is present and dead centre otherwise), bottom toolbar, bottom-left Home button. The focused
  neuron's icon, title and description sit above its sphere.
- **Zoom is the only transition.** `Show` flies the camera to the sphere, scales it to focus size,
  fades and slides the slots in. `Back` and `Home` reverse it. Reduced motion collapses the flight to
  a cut. Arrival animations never replay on reconnect or identical rebuild.
- **Toolbar** is the focused app's manifest toolbar drawn with shared tokens. Home is the only
  stable control. Ino's island is gone; Ino is a sphere whose mood is visible from anywhere.
- **Running and attention** are reserved blackboard keys set by the module from the app's activity;
  the default tree turns `running` into a pulse and `attention` into a badge.
- **Deleted:** `WorkspaceDesktop` and window title bars, the `HomeScreen` tile grid,
  `AssistantIsland`, the Stage navigation stack, the Welcome scene, the first-run view. The Creator
  and app details become a neuron in the field with its surface in main.

## Section 3: the three reference apps

- **Ino.** Sphere with the presence tree (idle, listening, thinking, acting, speaking, error) read
  from blackboard `mood`; the presence synapses write `mood` instead of firing a state machine.
  Main is the assistant's selected conversation rendered as chat with voice input. No side. Toolbar:
  new conversation, voice. Ino is the default focused app.
- **Files.** Sphere with the folder icon. Side is storages and allowed roots. Main is the current
  folder listing with filter and text preview as composed today. Toolbar is breadcrumb navigation
  plus Storages. Folders and files are content, not spheres; Files is one level deep.
- **Friends and posts.** New OS feature app `features/os/Friends` with operations `post` and `open`.
  A friend is a member of a circle the person is in; the Friend sphere is read from the circle brain's
  membership and the member's profile neuron `{brain}/profile`. Focusing a friend shows the profile in
  main and their posts in side. A post is a neuron `{brain}/posts/{id}` in the author's brain with its
  own presentation (sphere plus main showing the post). `post` publishes it into a circle through the
  dedicated `ICircleChat.PublishPost(postKey, requestId)` operation; the circle brain keeps the index every member reads. Posts are
  spheres in the friend's field, so opening one is the same zoom.

## Section 4: data flow, failures, security

- **Flow.** Synapse writes slot neurons and its blackboard keys, then publishes the presentation.
  Workspace changes the path on `Show`, `Back`, `Home`. The module subscribes to workspace and
  presentation changes and rebuilds the derived scene whole. The shell renders, runs trees, and posts
  taps as `Show`. Nothing waits on a script.
- **Not ready and failed.** Null root: dimmed sphere with the icon, no slots. Error: sphere with the
  attention badge and the error text in main. Null tree: the shell's default idle tree. Invalid tree:
  refused at publish.
- **Cross-brain reads.** Friend and post presentations are read from the circle brain and the author's
  brain through typed reads on the viewer-scoped Space neuron, with current shared-circle membership and published-reference checks on every request. The module
  holds references and transient projections, never persisted copies. A member who leaves disappears on the next rebuild and stale slot reads are refused.
- **Provenance.** Only the executing assignment publishes a presentation. Reserved blackboard keys
  are stamped by the module.
- **State.** Concrete arrays, whole rebuilds, no self-calls on the workspace neuron, no migration:
  old window state is dropped.

## Section 5: verification

- **Contract facts** (`TestBrain.Create().WithModule<FlutterModule>()`): a published presentation
  appears in the derived scene with the right sphere and slots; `Show` and `Back` move the camera
  target; a stale-program publish is refused; an invalid tree fails the publish gate; `running`
  follows activity and a script write to it is refused; a circle member's presentation appears in the
  Friend field and vanishes when they leave.
- **Flame facts:** tree validation against the schema; the schema parity emission.
- **Flutter tests:** the tree interpreter on the robot and traffic shapes; zoom moves the camera and
  swaps slots; reduced motion cuts; each slot kind renders in its region; Home pops to the brain.
- **Live loop:** `dotnet run digitalbrain.cs`, all resources Healthy; drive `Show`, `Back`, `post`,
  `open` through `digitalbrain-mcp`; read workspace and derived scene back; matching spans and logs in
  Aspire. Fresh brain lands on Ino with chat; Files shows its folder; a Friend shows a post.
- **Delivery order:** Flame trees and schema; workspace path and derived scene; shell regions and
  zoom; Ino; Files; Friends; old screens deleted as each lands.

## Out of scope

Cross-app subscription scopes, renderable palette / UiPart, run-token tightening (open fronts, as in
CLAUDE.md). Profile editing beyond name and avatar. Post comments and reactions.

## Task 8 authorization decision (2026-10-13)

The previously required stop on own-brain `Say` refusal is superseded by the user's explicit authorization to resolve this conflict. Keep `Say` and `Read` circle-scoped. Add only method-scoped `[Shared] PublishPost`: NeuronCallFilter and CallFilter still verify the original trusted stamp, ambient identity and all policy stages. The operation requires an App stamped for `{personalBrain}/apps/friends`, an identity-verified owner membership of that personal brain, current membership of the target circle, and a canonical post reference under that same owned personal brain. It never restamps the caller as the circle or broadens general cross-brain access. Check membership before replay deduplication. Kernel-only circle-state lookup uses a non-INeuron grain interface unavailable to script/edge contract resolution.

Tradeoff: one narrow public contract operation replaces the impossible reuse of `Say`, avoiding a general authorization exception or widening ordinary chat. Post publication reuses the existing circle chat index and CircleSpoke signal. Existing circle-scoped publication remains valid. Friends/profile/post derivation uses current shared-circle membership on every rebuild; typed viewer-scoped `ISpace.ReadProfile`, `ReadPost`, and `ReadPosts` repeat current membership and published-reference checks for every stale slot request. The HTTP endpoint delegates only canonical profile/post/index shapes to this filter-covered neuron. The friend collection is a transient projection of references published in circles currently shared with the viewer, not the author's global index; legacy references must have an author-owned speaker. Collection activation navigates the viewer workspace after validating the visible reference. The shell watches viewer scene changes and clears cached slots on access denial. `CircleChanged.PreviousMembers` invalidates removed viewers as well as remaining members. No profile/card writes or unrelated access are shared. Removed viewer and author visibility must both disappear, including focused slots.

Publication receipts are durable and separate from the ordinary chat's bounded retry cache, so retained Friends requests do not republish after 64 newer requests. This grows one receipt per publication; chat retains its existing 500-line index limit. Friends is installed by existing defaults on new personal brains; existing brains use the normal Marketplace install flow. No general reconciliation or unrelated authorization change is added.

Typed projection reads retain the original verified viewer caller throughout. Narrow non-INeuron circle state/reference and person/card readers provide module leaf access after current membership and exact reference checks; these are absent from the neuron catalog, script brain.Get constraints and generic edge resolution. No new caller-context removal is used to obtain cross-brain reads. Existing background scene rebuild context handling is unchanged.

Friend derivation resolves the viewer owner from the runtime machine's trust-directory accounts and verified Owner membership, never by reading IBrain during creation. This avoids a defaults/scene creation cycle; a host with no machine identity or no owner account produces no friends. No account access is manufactured.

Read derivation checks both trust-directory circle membership and the actual circle member snapshot for viewer and author. Trust revocation therefore denies access even before a delayed key rotation/circle snapshot commit finishes. The real-grain partial-removal fact preserves the old snapshot intentionally and verifies all three typed reads refuse the revoked author.

Task8 review round1 decision: emit durable CircleMembershipRevoked immediately after successful trust removal, before key rotation/commit. Rebuild previous member brains on that signal. A module-only member-ID snapshot read may interleave solely to return an immutable copy, without waits/writes; ordinary State/Remove stay nonreentrant. Read derivation still intersects trust and snapshot membership because the snapshot may be mid-operation. Cost: one narrow internal read and signal contract. PersonChanged/CardChanged canonical profile/post signals rebuild author and current shared-circle viewers so mounted slots and sphere metadata refresh. Real-grain tests must observe updates and paused-removal invalidation without navigation or explicit rebuild after the triggering mutation.

Final-review fix decision: Friends persists a revision-CAS collection of initial destination circle IDs per request under its app, before card creation/index/fanout. Retries use only that immutable audience (including empty), while PublishPost repeats current membership/ownership/provenance checks. Existing card/index without an audience is recorded with an empty audience, never inferred from current membership; legacy partial publication is intentionally not repaired automatically. Partial new fanout retries retain their original destinations and per-circle receipts prevent duplicates. SpaceWatcher also consumes AppChanged using the kernel publisher key, covering idle create/manifest/delete without changing wire contracts or navigation. Tests exercise real retained requests and signal-driven scenes.

Final scoped follow-up: replay sends only to saved audience IDs still returned by the author's current circle membership. PublishPost retains its own current-membership guard. If a call races with removal and throws UnauthorizedAccessException, re-read current circles and skip only when that exact destination is now absent; otherwise rethrow. Other failures remain visible. The saved audience is never expanded or rewritten, and removal of one destination must not terminate processing of the other destinations or later requests.
