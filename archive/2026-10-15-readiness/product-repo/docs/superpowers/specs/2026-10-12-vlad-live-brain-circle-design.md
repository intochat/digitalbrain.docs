# Vlad's workspace, live brain and Circle

Date: 2026-10-12.
Status: Build-and-publish and fork/circle user flows approved on 2026-10-12, including public forks without friendship. The implementation mechanisms below remain proposals where explicitly identified; approval of these flows does not authorize public deployment.

## Intended outcome

Vlad can use DigitalBrain as his own operating system: enter the local Aspire workspace without a password, build running apps, see what they are doing, and publish work through a social profile. Visitors should eventually reach `digitalbrain.tech/vlad`, discover his published apps and running synapses, and fork work into their own brains.

Two deliverables share one workspace:

1. A clickable spatial brain visualization built with Flutter/Flame, showing real runtime activity and opening the selected app's live UI.
2. A usable Circle experience with profiles, friends, circles, published work and fork actions, using the same navigation and theme as Files.

The requested futuristic feel comes from spatial navigation, connected objects, transitions and responsive live content. Basic navigation must remain understandable and preserve the user's position.

Interpretation to confirm: the request mentions both Flare and Flame; this proposal uses Flame, matching the later explicit preference and the current codebase. It does not assume a projected 2D sphere satisfies the request for actual 3D.

## Evidence from the current implementation

- The shell already has shared colors, typography and motion infrastructure in `app/ui/lib/src/theme/`. Reuse and finish that system rather than add another palette.
- `features/os/BrainView/BrainView.cs` composes a Flame `brain_graph` with `filter=apps`. The Flutter prefab accepts only nodes with role `app` or `synapse` under that filter.
- `BrainEventsEndpoints.Snapshot` labels every emitted node `observed` and emits empty activity/correlation arrays. A read-only live probe on 2026-10-12 returned 234 nodes, all `observed`, 701 subscription edges, zero activity records, and **zero nodes passing BrainView's filter**. Active Aspire resources were Healthy at that probe. This is a concrete data-contract mismatch, not a GPU-performance diagnosis.
- The current Flame graph uses 3D coordinates projected onto a Canvas, with depth-scaled circles and straight edges. It is not a mesh-rendered 3D brain.
- Circle already has shared-brain membership, invitations, chat, shared apps and compute ownership. The personal Circle UI currently renders an index of cards; it is not a complete profile/friends/feed experience.
- Local Open authentication stamps the synthetic `owner`. Changing the visible label to Vlad would not make Vlad the author or publisher.
- Marketplace installation already obtains a published, compile-checked bundle and records its origin. Circle sharing also uses the feature loader. A social fork must reuse that path.
- Existing Circle decisions explicitly make a circle its own brain. Friendship must not silently mean membership of another person's personal brain.

The recurring complexity is a mismatch between the objects people navigate and the runtime concepts exposed by individual screens. Navigation, projection and ownership need consistent boundaries; changing the drawing engine alone will not provide those boundaries.

## Recommended product shape

Keep the existing apps and neurons underneath, but give the person a small, stable set of destinations:

| Destination | Purpose |
|---|---|
| Brain | Spatial overview and runtime exploration |
| Files | Storage, folders and documents |
| Circle | People, friends, circle rooms and published work |
| Build | My apps, source, versions and publishing |

Assistant remains the shared companion. Settings and technical tools remain accessible through secondary navigation/search. Test and verification apps move out of primary discovery into a development view; do not delete them or their evidence. Existing separate document windows remain supported.

Alternative A: only restyle the current app launcher and Circle cards. Smaller change, but it preserves the fragmented navigation and does not deliver the requested social workflow.

Alternative B, recommended: shared navigation/theme over the existing runtime and app boundaries, with two focused experiences. It addresses the daily workflow without introducing a new app runtime.

Alternative C: rebuild the entire OS shell as a Flame scene. Visually flexible, but it duplicates text editing, focus, accessibility and standard control behavior. Do not take this on as part of these two tasks.

## Shared navigation and visual rules

- A slim left rail provides the stable destinations and recognizable app icons.
- The top bar shows readable aliases and the current path, with Back and contextual actions. Internal IDs belong in inspect/copy details, not the primary breadcrumb.
- Example paths: `Vlad / Files / Documents`, `Vlad / Circle / Friends / Alex`, `Vlad / Build / Weather / Synapses`.
- The center is the current activity. A right-side panel hosts the selected profile, running app UI or synapse details. Selecting Files in the spatial view can show its live UI on the right while its icon and runtime connections remain visible on the left.
- Expand the current shared theme into an explicit set of surface, text, accent, state and motion tokens consumed by both Flutter controls and Flame scenes. Keep dense technical information legible; glow is emphasis, not the only state cue.
- Navigation changes what is being viewed. Runtime events update that view without changing focus, reopening a closed window, resetting an input, or rebuilding the whole shell.
- Preserve a visible path and selected object during transitions. Support keyboard navigation and reduced motion alongside pointer interaction.

Use Flame for the spatial scene and animated relationships. Use existing Flutter controls for readable profiles, breadcrumbs, forms, lists and editable text. This proposal avoids the generic graph widget for the brain visualization; it does not discard the existing typed workspace or surface contracts.

## Deliverable 1: live spatial brain

### Interaction

Start at app-level clusters so the scene is understandable. Selecting an app expands its active synapses and relevant connections; selecting a synapse shows its source, subscriptions, current known state, recent executions and failures. Allow orbit, zoom, selection and return to overview. Keep layout positions stable as events arrive.

Distinguish three facts visually: a subscription exists, a behavior is registered/runnable, and an execution or delivery actually occurred. Do not animate fabricated traffic or label a subscribed behavior as currently executing. Stale or disconnected telemetry must be visible.

The right panel can switch between the app's live UI and runtime details without installing a duplicate app or moving its state into the renderer.

### Data and ownership

Repair the snapshot role/filter mismatch first. Reuse the existing runtime inspection/watch and behavior-run evidence; establish exactly which event data it supplies before promising signal-level animation. Derive the presentation from that evidence. Do not add another runtime registry, create state per animation frame, or use a renderer as the authority for app status.

Neuron state remains authoritative. C# behaviors own domain transitions. Flutter/Flame owns camera, interpolation, particles, picking and frame scheduling. Coalesce display updates while retaining inspectable execution evidence in the existing runtime mechanisms.

### Actual 3D feasibility gate

Official `flame_3d` documentation describes an experimental Flutter GPU/Impeller dependency and lists Android, iOS and macOS as explicitly tested native targets. Its WebGPU path is also experimental. It does not establish native Windows suitability for this workspace.

Before selecting a renderer, run a narrowly scoped Windows feasibility probe: launch a real 3D scene, orbit it, select an object, resize the host, and embed it alongside the normal Flutter workspace. Measure it in profile mode. If this fails, return the result and choose between a supported renderer integration or a different target; do not quietly substitute another projected sphere.

Sources: [Flame 3D getting started](https://github.com/flame-engine/flame/blob/main/doc/bridge_packages/flame_3d/getting_started.md), [Flame 3D package](https://github.com/flame-engine/flame/blob/main/packages/flame_3d/README.md).

### Acceptance

- The actual running brain is visible; the known live snapshot does not collapse to zero nodes because of mismatched roles.
- Selecting a visible app opens its correct existing typed UI; selecting a synapse identifies real source and runtime evidence.
- A deliberately executed local app operation produces a corresponding visible update and inspectable trace. No claim of a per-signal pulse unless the data actually supports it.
- Reconnect and updates preserve selection and do not manufacture activity.
- Performance is profiled on the actual Windows target; report the measured scene size, frame timings and limitations. True 3D acceptance includes depth/occlusion and picking, not only rotating 2D dots.

## Deliverable 2: Circle, friends and living publications

### Vlad's identity

Use `vlad` as the actual development account/publishing identity, with a personal brain belonging to that account. Scope password-free entry to the explicitly local Aspire development posture. Preserve the existing `owner` brain and current work; do not globally replace the synthetic owner constant or relabel all existing authorship.

Inventory any apps Vlad wants to adopt, then use the existing compile-checked transfer/install mechanisms with provenance. Profile alias, account identity and brain identity have distinct jobs; a friendly public URL must not become the internal key for every runtime object.

`digitalbrain.tech/vlad` is the intended public profile route. Implement and verify its local equivalent first. Domain deployment, public identity ownership and hosting must be verified before claiming the public URL is live. Local password-free entry does not define public-site authentication.

### Social navigation

Circle opens on a Twitter-like feed of living apps and synapses people publish. Profiles show what each person is building and chooses to share. Circles are groups where friends build and run things together. Proposed navigation is Feed, People, Circles and My profile. Circle rooms retain their own membership, chat and shared apps.

Friendship is an accepted person-to-person relationship. It is not a grant to inspect the other person's private brain, call arbitrary neurons, spend their compute or inherit their connections. Circle invitations and membership remain explicit existing actions.

### A post points to living code

A publication presents a specific published app version and, when relevant, a synapse within it: a human description, author, version/origin and permitted live status or preview. The executable program remains an app bundle; a feed entry does not create a second code-storage system or make a bare source snippet independently installable.

Viewing a publication does not automatically start arbitrary code in a visitor's brain. Forking creates the visitor's own installed copy through the existing publication/install path, with origin and ownership shown. Any needed connections are bound for that copy. Editing and republishing creates the visitor's version with the existing provenance rules.

For a “live synapse post,” distinguish the publisher's running instance from the visitor's fork. Public presentation exposes only the selected published view/activity, not the owner's unrestricted runtime stream. Automatic replication of every draft edit into others' running copies is not part of this first release.

### Approved first flow: build and publish as Vlad

1. Local Aspire enters Vlad's personal workspace without a password. New apps belong to the actual `vlad` account and publications carry that identity.
2. In Build, New app starts a private draft from a description to Assistant. Its useful interface and Synapses runtime view describe the same app. Compilation, running state and latest execution result are distinct checks.
3. Publish shows exactly what visitors will receive: name, description, icon, code version, public-safe read-only preview or sample output, and the connections a recipient must provide. Private data, credentials and unrestricted runtime activity are excluded.
4. Previews are read-only by default. The publisher may explicitly enable Try live, selecting permitted interactions and whose resources run them. This product choice is approved; the execution isolation, accounting and permission mechanisms still need a technical design.
5. Publishing creates a stable publication on Vlad's profile and the feed, identifying Vlad and version 1. Approved preview output may change while the published code version remains identifiable.
6. Subsequent edits stay drafts until another version is published. A new release may appear in the feed; individual runtime signals do not become feed posts. Existing forks do not silently change.

Navigation: `Vlad / Build / Morning Briefing / Publish`, then `Vlad / Profile / Morning Briefing`. The intended public profile address remains `digitalbrain.tech/vlad`; publication does not imply that this domain has already been deployed.

### Approved second flow: fork or bring into a circle

The visitor opens the same stable publication from the feed or Vlad's profile, inspects its preview, version and required connections, and chooses a destination. Try live, if enabled, is a separate interaction with the published experience; it does not create a fork.

**Fork to my brain:** create an independently owned installed copy of the selected published version through the existing compile-gated loading path. Show its attribution and origin. Ask for missing connections and any execution prerequisites before starting dependent behavior. Never copy the publisher's private data or credentials into this personal fork. Once runnable, the recipient can use it, inspect its synapses, edit it and publish their own version. Resolve an existing app-name collision explicitly rather than overwrite an existing app.

**Bring into a circle:** choose a circle the visitor belongs to. Install one shared copy into that circle's brain, attributed to the original publication and the member who brought it in. Circle members use that shared instance rather than automatically receive personal copies. Reuse existing member-authorized sharing semantics; do not introduce an owner-only install rule without a separate decision. Bind the connections and execution resources explicitly for the circle. The UI must distinguish a copy that is installed but needs setup from one that is running.

The two actions share the existing installation mechanism but have different state owners: the person's brain or the circle brain. A publication remains discovery metadata for its existing versioned app bundle, not another executable object.

Upstream releases are available updates, not automatic replacement of either copy. Preserve the existing rule that edited copies do not take ordinary origin updates. Re-publishing a circle's work must use an authorized, accurately attributed publishing identity; the technical design must establish this before exposing a publish control for circle-owned apps.

Example: Vlad publishes Morning Briefing v1; Alex forks a private copy using Alex's sources, or brings v1 into Friends Lab using explicitly configured circle sources. Both retain Vlad's origin. Neither action grants access to Vlad's personal workspace or causes Vlad's later drafts to execute in those copies.

### Implementation checkpoint: identity and the next Circle slice

Vlad's local native identity is implemented. The running desktop retained the same real account and brain after restart, authenticated native subscriptions worked, and `vlad-identity-check` compiled, ran and published locally as Vlad at version `0.1.2`. The [verification report](../reviews/2026-10-12-vlad-local-identity.md) records the first cold-start failure, the separate MCP membership limitation and all retained evidence. The profile/feed UI and public domain are not delivered by this checkpoint.

The next Circle slice follows one path: **Feed → Vlad's profile → selected publication → preview → destination → setup → running copy**. The publication page shows the exact version, attribution, required connections and a read-only sample. Its two destination actions are **Fork to my brain** and **Bring into a circle**. After installation, breadcrumbs change to the recipient's app or the circle's shared app; the original publication remains reachable through attribution.

The first implementation boundary to resolve is durable retrieval of that selected published version. The current latest-publication export and bounded history cannot guarantee that an older feed card still installs its advertised code. Retain the published bundle through the existing app/publication mechanisms and use the existing installation path for both destinations; do not add a second runtime or executable post format. Public-safe preview output and original-publisher/bringing-member provenance must be explicit before exposing the controls. Try live remains a later, separately bounded execution capability.

### Fork visibility decision

Approved: any signed-in person can fork a public publication without becoming the publisher's friend. Bringing it into a circle requires membership of that destination circle. Neither action grants membership of the publisher's personal brain.

Friends-only publication/export remains a later authorization design, not an already-working feature or a requirement for public forks. Keep public publication and circle-scoped sharing distinct from person-to-person friendship.

### Acceptance

- A fresh local session enters as account `vlad` without a password and shows that account's personal workspace.
- Vlad can navigate friends, a real second local test account's profile and a circle room through readable breadcrumbs, returning without losing position.
- Publish a small working app as Vlad, inspect its profile publication, fork it as the second account, run it, edit it and inspect the preserved origin. Clearly label the second account as a test identity.
- Friendship/invitation accept and remove flows enforce the selected visibility rules through backend calls as well as UI.
- Rendered previews and runtime status reflect the published instance and handle unavailable/offline states honestly.

## Delivery order and boundaries

1. Both social flows are approved, including read-only previews, optional publisher-enabled Try live, public forks without friendship, and member-authorized circle installs. Plan the identity foundation separately from the social UI and renderer; verify Flame's actual Windows 3D capability before committing to its renderer.
2. Map the identity/navigation/publishing code through LSP and specify the small shared foundation. Preserve the existing composition-ownership design: derived UI must not mutate its authoritative inputs.
3. Complete the Windows real-3D feasibility check and repair the observed runtime projection mismatch as a separately verifiable change.
4. Deliver Vlad's local identity and a usable Circle publication/fork journey, reusing existing circles and installation. Establish shared navigation/theme for Files, Circle and Build.
5. Finish the spatial renderer and connect app/synapse selection to those same views. Verify the whole first-user journey in the running Aspire app.

These are two product workstreams, not permission to create additional Codex chats or to deploy a public service. No new runtime coordinator, generic UI DSL, social execution engine, global authorization bypass or replacement routing system is proposed. Self-programming continues through existing authoring, compilation, program assignment and publishing boundaries.

Implementation requires the reviewed design and a concrete plan, following the repository's rule for new identity, contract and ownership behavior. Existing Assistant benchmark changes and evidence are outside this proposal's edits.
