# Neuron space UI and the local-account startup failure

Date: 2026-10-14. Read of branch `os-runtime` (PR #173) starting from the Flutter shell.
Companion to `2026-10-13-ui-complexity-review.md` (the redesign this branch carries) and
`2026-10-12-vlad-local-identity.md` (the local desktop sign-in this branch no longer completes).

PR #173 also carries the one-host test harness and the trust work. The GitHub diff is over the
300-file cap. This note covers the UI tail and the screen that blocks it.

## The window never reaches the UI

On a clean start the Flutter shell shows **Could not open your local account.** The Flutter
process can still be Healthy. Health means the executable is up, not that a session opened.

### What the shell does

Development config pins the desktop account to `vlad`
(`src/DigitalBrain.AppHost/appsettings.Development.json`, `DigitalBrain:Shell:LocalAccount`).
On a Windows desktop run the AppHost writes a private password file under
`%LocalAppData%\DigitalBrain\local-accounts\` and passes its path as
`DIGITALBRAIN_LOCAL_ACCOUNT_FILE`.

`BrainSessionGate` (`app/shell/lib/auth/brain_session_gate.dart`) reads that file at startup
when no stored Basic credential exists, then calls `signInLocalAccount`
(`app/core/lib/src/ui_client.dart`). That posts `/identity/login`, and on 401 posts
`/identity/register`. Any exception from either call is caught with no log and becomes the
sentence above (`_Phase.localFailed`). Retry runs the same attempt again.

### What the running kernel answered

On the AppHost that was up while this was read, `OperatingSystem-front` showed the same pair
on every attempt: `/identity/login` **401**, then `/identity/register` **409**. The requests
reached the front, so this session is not a race against a kernel that is still down.

A 409 from register is "that username is unavailable"
(`PrincipalGrain.Register` refuses a principal that already has a membership;
`PrincipalPasswords.Register` returns the same conflict when the local hash exists and the
principal is already registered, the password does not match, or another machine registered it).

`PrincipalPasswords.Authenticate` returns a member only after the password matches, this
machine is `RegisteredBy`, and `CompleteRegistration` yields a provision. A wiped password
grain, a mismatched password, or a changed machine id all come back as 401. The client treats
every 401 as "not registered yet."

The clean-start loop:

1. The account file for `vlad` survived in LocalAppData.
2. Trust still has `vlad` (`DefaultMembership` set), or the local hash does not match this machine.
3. Login finds nothing to accept (401).
4. Register finds the name taken (409). On the no-hash path it also deletes the hash it just wrote.
5. Retry repeats 3 and 4.

`BrainBirths.Born` was made idempotent for a registration trust already completed
(commit `1472809e9`). Login never reaches that path while Authenticate returns null.

`FlutterShell` also has no WaitFor on the OS front, so a start that beats the kernel hits the
same screen. The widget test `anUnavailableServerDoesNotEnterOwner` requires that: an
unreachable kernel must not open the shell. Waiting for the front is the fix for that case.
It is not what the 401/409 trace shows.

### Fix

- Same deployment, same password, trust already has `vlad`: sign in and run `BrainBirths.Born` again.
- Surface the HTTP status in `BrainSessionGate`. A 409 and a kernel that is still down are the same sentence today.
- Make `FlutterShell` wait until the front is healthy, so the first attempt is not a connection error.

The 2026-10-12 verification entered `WorkspaceApp` as `vlad` and read the workspace. That path is what this loop blocks.

## How the UI works now

There is one flow. Windows are gone. What the person sees is one derived scene.

1. An app's startup synapse writes its neurons, then calls `IApp.Present` with a `Presentation`:
   a sphere (icon, blackboard keys, optional behavior tree) plus optional side and main
   references (`kind` + neuron name). Files, Calculator, Ino, BrainView, and the other
   first-party apps all do this. Ino and Friends keep `Present` on the shared class. The others
   inline `Present(long.Parse(brain.Setting("ProgramRevision")...), new(new Sphere("icon.svg", []), ...))`.

2. `SpaceWatcher` hears `PresentationChanged`, workspace changes, app activity, and circle
   signals, and calls `ISpace.Rebuild`.

3. `SpaceNeuron.Rebuild` reads the workspace path and every app presentation. `SpaceComposer`
   writes one scene, `{brain}/space`: one sphere per app. The focused sphere carries side,
   main, toolbar, title, and state as JSON parameters on the scene node.

4. The shell's `SpaceController` watches that scene. `NeuronSpace` paints it:
   - `SpaceField` (Flame) draws the spheres and runs each sphere's behavior tree.
   - A tap calls workspace `Show` or `Home`. The watcher rebuilds the scene. The shell reads it again.
   - `SideSlot` and `MainSlot` are `NeuronView`. They load `node?kind&name` and post `event`
     for the focused app's neurons.

`WorkspaceApp` is the host around that: account menu, connections, settings, and the startup error.

## Synapses are not drawn

A synapse never becomes a widget. It is the writer.

- The startup synapse publishes the presentation and fills the neurons the presentation points
  at (layouts, buttons, collections, text). Files composes `/main` and then presents a sphere
  whose side is the storages collection and whose main is that layout. Calculator builds the
  keypad layouts, then presents a sphere whose main is `/main`.
- Later synapses change those neurons, or stamp blackboard keys such as `mood` and `running`.
- Flame runs the behavior tree stored on the sphere. Ino's tree scales and pulses from `mood`.
  That tree is data on the presentation, copied onto the scene node. It is not a synapse.
- `AppActivity` is stamped onto the blackboard (`running`, `attention`) and the tree reacts.
  It is not a separate view.
- The one place a run is shown as text is BrainView. `runs.cs` appends a `Run` record.
  `BrainView.Compose` rebuilds a card plus a markdown list of the last ten runs into the layout
  the presentation names as main. `NeuronView` then renders that layout, card, and text by kind.

The path is: synapse writes neurons and one presentation, the space grain derives one scene,
Flame draws spheres, `NeuronView` draws the focused side and main.

## Cleanup, in this order

1. **Unblock sign-in.** A completed local principal must sign in, and `BrainSessionGate` must
   keep the HTTP status. Retry cannot succeed against the current trust record until then.

2. **One publish helper.** About twenty apps repeat the revision parse and
   `new Sphere("icon.svg", [])`. Ino and Friends already keep `Present` on the shared class.
   Move the revision parse and the sphere defaults there. Leave each `open` synapse as
   "compose my neurons, then present."

3. **Stop encoding the focused app as scene-parameter JSON.** `SpaceComposer` serializes side,
   main, toolbar, and blackboard into strings, and `SpaceView.fromScene` parses them back.
   Those fields already live on `Presentation`. The shell can read the focused presentation
   with the scene.

4. **Split Friends out of `SpaceNeuron`.** Rebuild and `ReadProfile` / `ReadPost` / `ReadPosts`
   are different jobs in one grain.

5. **Leave the `NeuronView` kind switch for a later pass.** The 13 October review already called
   the thirty-eight UI kinds a separate decision. Folding that in here would touch every
   contract the apps compile against.

Nothing in this note was changed in code.
