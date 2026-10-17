# Circle authorization — proposal for Task 26 (gate)

## Decision (2026-10-11)

**The user chose shape A: a circle is its own brain** (ledger R120). Shapes B and C below are rejected; the
proposal text is kept as the record of what was weighed. Rulings that settle the consequences:

- **T26-1 — A circle is a brain.** Creating a circle provisions a brain on the trust side
  (`IIdentityClient.CreateBrain` for the creator's account; `IBrain.Owner` = the creator, who pays its compute)
  and births it on the creator's machine through `BrainBirths`. `ICircle` becomes the circle brain's core
  neuron `{circle}/circle` (members, contributed machines, schedules). The circle brain has its own core part
  and its own part keys.
- **T26-2 — Members are accounts, recorded as memberships of the circle brain.** No `circle:{id}` account and no
  pairing secret shared at invite: each member's own account is a trust-side membership of the circle brain
  (`IIdentityClient.EnsureMember`; removal through one additive `RemoveMember`). Reason: R98's machine gate
  already admits a machine bound to an owner *or member* account, the `/brains/{id}` membership filter already
  checks the stamp, and member machines stay bound only to their own accounts (R52/R55 unchanged) — nothing new
  to pair, revoke or rotate on the trust side.
- **T26-3 — Q11 for a circle brain: its "own machines" are the members' contributed own machines**
  (`ICircle` lists them). The circle core is held only by a contributed machine; a Cloud machine never holds a
  circle core (or any circle part: they are private, T26-8). R76's designated core holder for a circle brain is
  the creator's machine at creation; handover is explicit release/acquire, as for any brain.
- **T26-4 — Q17 for a circle brain:** lease preference is the contributing machine of the current operator first,
  then any other contributed machine; "returning to an own machine" becomes "returning to a contributed machine
  of an online member at the next quiet moment". An owner's brain keeps Q11/Q17 unchanged.
- **T26-5 — Q6 applied to the circle brain:** the circle brain's part keys are wrapped to each contributed
  machine (ECDH P-256 + HKDF, context `circle|{circle}|{part}`), not under one custody root (R74 holds per
  owner's machines; a circle spans owners). Revoking a member removes its machines, rotates every circle part
  key and re-snapshots under the new key (Task 27's fixed contract).
- **T26-6 — Sharing an app = installing it into the circle brain** (Install is the only way an app crosses
  brains). Its neurons live in the circle's parts. The owner-copy/member-copy circle neuron, its `[Internal]`
  copy protocol, `CircleCallGuard`, the per-brain `ICircles` index and the chat copies are deleted in Task 27:
  the circle brain is the shared state, so nothing needs a projection. The Circle app's synapses become:
  `create` → create the circle brain; `invite` → `ICircle.Invite(account)`; `accept` → `ICircle.Accept()` as the
  invited account's human, which adds the membership and contributes the caller's machine; `say` → the circle
  brain's `ICircleChat.Say`; `share` → install the named app into the circle brain (T26-7); `set-share` →
  `ICircle.SetComputeShare`; `watch` → `brain.On<CircleChanged>` on each circle brain's `ICircle`.
- **T26-7 — Q14 for a circle brain:** sharing asks which of the owner's bound connections go along; those are
  bound into the circle brain as its own connections `connection/{circle}/{connector}/{id}`, credentials sealed
  under the circle core's part key so any contributed machine opens them. The rest stay with the owner: the
  installed app's slot keeps pointing at the owner's connection, and a call to it routes to the owner's core
  (Task 22 forwarding; 503 while the owner is offline).
- **T26-8 — Authorization is the existing per-brain machinery.** A member's call into the circle brain carries
  `BrainId = circle`; the trust-side membership lists the member's account; the machine gate (R98/R107) admits
  a machine bound to that account; `NeuronCallFilter`'s target-scope check passes because the target is in the
  circle brain. Removal = `RemoveMember` + Task 27 rotation: the removed member's machine is refused at the gate
  on its next call and cannot read anything written after the rotation. Every circle part is private to its
  members (R82 extended: the per-app Private mark lands here; a circle brain's parts are all private).
- **T26-9 — Open fronts untouched.** A member's *other* apps (in the member's own brain) calling the circle brain
  are not admitted in this release (cross-app subscription scopes); only the member's human (shell, MCP) and the
  circle brain's own apps act there. Renderable palette and run-token tightening are untouched.
- **T26-10 — Mesh placement for circle parts** (R123/Task 24): segments spread across distinct owners as for any
  part; the members' volunteer nodes count as distinct owners, and the placement exclusion of "the caller's
  accounts" is the holder machine's account, not every member's.
- **T26-11 — Compute share stays:** `CircleShareGrain` is keyed by the circle brain's `{circle}/circle`; it charges
  `IBrain.Owner` of the circle brain (the creator) up to the configured percent for members' calls.

- **Round 1 (controller rulings R124–R131)**, recorded in the plan as T26-12 to T26-19:
  - **R124 Share path.** Sharing loads the sharer's compile-gated app bundle into the circle brain through `FeatureLoader`, with `Origin` = the sharer's app and no Marketplace listing. It uses a direct, kernel-stamped `AppSource.Brain` used only by Share. Any member may share.
  - **R125 Circle brains are a kind.** Circle brains carry `Kind = Circle` on the trust side and get no OS defaults, only the circle's own app.
  - **R126 Where the Circle app runs.** `os/Circle` in each member's brain keeps the index from `BrainsOf` and creates circles through `ICircleFactory`. Invite and accept go only through the human route at `/brains/{circle}`. The circle brain's own app holds `say`, `watch` and `share`. The shell watches `/brains/{circle}/live`.
  - **R127 Agreement keys.** Each machine registers a P-256 agreement key (TPM-held where the provider supports it). A wrap is ephemeral-static ECDH by the holder. `Contribute` wraps every existing part key to the new machine.
  - **R128 Contributed machines.** They are recorded trust-side (`ContributeMachine`/`WithdrawMachine`) and count as owner machines for that circle brain only.
  - **R129 Membership authority.** The circle core calls `EnsureMember` on `Accept` and `RemoveMember` on `Remove`. The creator cannot be removed; the creator leaving deletes the circle.
  - **R130 Credential re-sealing.** The owner's machine re-seals connection credentials locally and writes them through a forwarded call. No plaintext crosses any call.
  - **R131 No retroactive revocation.** Data written before a rotation stays readable to a removed machine that holds the old key (Q6).
  - **T26-8 source of the stamp.** `BrainId = circle` comes from the `/brains/{circle}` route's membership filter, over HTTP and `/brains/{circle}/mcp`.
- **Round 2 (R132–R134):**
  - **R132.** `ICircle.Share(appName, connectionIds)` is declared and implemented in Task 27; Task 28 keeps the credential re-seal and the live step.
  - **R133.** `RemoveMember` has one gate: the same as `EnsureMember`, plus the brain's owner.
  - **R134 (T26-9 extended).** A shared app's call to a connection left with the sharer is cross-brain by design. It is allowed only through the binding the sharer recorded at Share on the circle brain's app slot; every other cross-brain connection call stays refused.
- **Round 3 (R136).** The circle's own app installed at birth is `features/os/CircleRoom` (T26-13 aligned to R126). R134 is enforced in the Apps module's connection-call gate.
- **T26-6 note.** The synapse list in T26-6 is superseded by R126.

**What the rejected shapes would have cost:**
- **B (grants as call rights):** `Grant` turned into a fifth concept and membership stored twice (circle + grants), with
  divergent revocation writes.
- **C (circle neuron authority + signed snapshot):** a new cross-brain admission rule in `NeuronCallFilter`, a
  signed membership snapshot carried in every shared part, and per-part state still owned by one brain, so Q11
  "own machines only" would keep members' machines from ever holding the owner's core-bound records.

---


Status: decided (shape A, see above); nothing is implemented. Settles spec open item 5 of
`2026-10-10-federation-circles-mesh-design.md`, constrained by Q6, Q11, Q14, Q17, Q24, Q26.

## 1. The question
When an owner shares a part (an app neuron and its neurons) with a circle, what lets a circle member's call
into that part through the holder, and how does that combine with the machine gate, caller stamps, wrapped
part keys, travelling connections and provenance? We need one rule that keeps the four words
(neuron, signal, behavior, connector) and leaves the open fronts (cross-app subscription scopes,
renderable palette, run-token tightening) as they are.

## 2. What exists today
- **Circle neuron per brain copy.** The owner copy `{owner}/circles/{name}` is the authority, and each
  member holds a following copy `{brain}/circles/{name}@{owner}`. `Members` and `SharedApps` are brain ids
  and app names, not accounts or parts. Copies talk only through `[Internal]` methods, and those are
  admitted by the kernel-named `SourceId`
  (`src/DigitalBrain.Modules/DigitalBrain/Circles/DigitalBrain.Modules.Circles/CircleNeuron.cs`,
  `CircleCallGuard.cs`, `features/os/Circle/*`).
- **Caller stamps.** `CallerContext` (`AccountId`, `BrainId`, `Kind`, `ForwardedBy`) is kernel-stamped.
  `NeuronCallFilter` resolves a target scope and refuses calls from outside it, with no cross-brain allowance
  (`src/DigitalBrain.Framework/DigitalBrain.Framework/Callers/`).
- **Grants are data permissions, not call rights.** `Grant` is (AppId, SemanticTypeId, Mode, Workspace),
  meaning "app X may read person.birthDate" (`.../Platform/Identity/Grant.cs`; `BrainAuthorityGrain`
  in Platform.Trust).
- **Machine gate (Task 21/22).** `MachineSigned<T>`. R98: membership, grant and key reads are honoured for
  machines bound to the owner or to a member account. R100/R106: a forward must carry a trusted stamp, and
  only owner machines may send unstamped or kernel forwards. R107: from a non-owner machine, only
  User/App stamps whose principal belongs to the account are accepted.
- **Keys and leases.** Q6 wraps a part key to each member machine. Q11 says the core is held only by own
  machines. R82 makes only the core private today; a per-app Private mark waits for Task 27.

## 3. Three candidate shapes
End-to-end path for each: machine gate → caller stamp → authority check → key.

**A. A circle is a brain** (a shared brain with its own core; members are accounts; the owner is a member).
- **Member call:** the member machine is bound to a member account of the circle brain. The stamp carries
  `BrainId = circle`. The existing `/brains/{id}` membership filter does the check. The key is the circle
  brain's part key.
- **New concepts:** none by name, but sharing becomes *moving* the app into another brain, and the circle
  brain's core needs a holder. Q11 says "own machines only", and a circle has none, so Q11 must be
  reinterpreted.
- **Revocation:** remove the account membership, then rotate.
- **Q14:** connections must be re-bound in the circle brain, so they never "travel".
- **Q17:** works.
- **Risk:** it breaks Q11 and turns the owner's app into a copy. Unshare becomes a migration.

**B. Grants on the owner's brain** (members receive grants scoped to the shared part).
- **Member call:** machine gate, then a User stamp (`BrainId = member`), then the filter looks up a
  grant `(member account, part)` in `BrainAuthorityGrain`, then the key.
- **New concepts:** the meaning of `Grant` changes from semantic-type data permission to call right, so it
  is a fifth concept in disguise. Membership is also stored twice, in the circle neuron and in the grants.
- **Revocation:** revoke the grants and rotate the key. The two writes can diverge.
- **Q14 and Q17:** fit.
- **Risk:** two sources of truth, plus a trust-side write on every invite and leave.

**C. The circle neuron is the authority; the holder's filter checks it** (the R98 pattern extended to calls).
- **Member call, step by step:**
  1. *Machine gate:* the forwarding machine is bound to a member brain's account (R98/R107).
  2. *Stamp:* User/App, `BrainId = member`, and `ForwardedBy` set to that machine.
  3. *Authority:* `NeuronCallFilter`'s target-scope step gains one rule. A caller from another brain is
     admitted when the target's part belongs to an app that some owner circle copy lists in `SharedApps`
     and the circle's `Members` contains `caller.BrainId`. The holder reads this as a version-stamped
     index kept by the owner copy, the same way `CirclesIndexNeuron` is kept today.
  4. *Key:* a member machine holding a lease (Q11/Q17) unwraps the Q6 part key. A member machine without a
     lease simply forwards.
- **New concepts:** zero. The circle is a neuron, and membership is its state.
- **Revocation:** `Leave` or `Drop` on the owner copy bumps `Version`. The holder refuses the next call.
  Task 27 then rotates the part key and re-snapshots. A lease held by the removed machine is revoked first,
  so it can no longer append.
- **Q14:** the chosen connections are wrapped with the part key. The others stay owner-bound, so calls
  from them go to the owner's core and return 503 while it is offline.
- **Q17:** lease preference reads the same circle membership.
- **Risk:** the holder needs a fresh read of the owner's circle. On a member machine that holds the lease,
  the "holder" is the member machine itself, so the check needs a signed membership snapshot the owner
  issued rather than a live read of the owner's core.

**Provenance (all three shapes).** `Signal.Publisher` stays the shared part's neuron, and the caller is
whoever is stamped. A member's call never publishes as the owner. `ForwardedBy` names the machine.

**Kernel records.** A member-held lease must never need the owner's core (R32/R100). Under C, the part
carries what it needs: its type table, its instance directory slice, and the signed circle snapshot.

## 4. Recommendation
Choose **C**. The owner's circle copy is the only authority. The holder's `NeuronCallFilter` admits a
cross-brain User/App stamp when a circle snapshot signed by the owner lists the caller's brain and the
target's app. Keys protect confidentiality at rest and authorization protects calls.

Task 27's fixed test then has two halves:
- *Authorization:* a removed member's calls are refused at the next snapshot version.
- *Keys:* records written after the rotation cannot be decrypted with the old key, even by a machine that
  kept old log segments.

Neither half alone satisfies the test. A member's own apps calling the shared part stay under the open front
on cross-app scopes. Until that front is settled, only the member's *human* (shell, MCP) and the member's
copy of the shared app may call it, never the member's other apps.

**Decisions for the user:**
1. Are circle members brains or accounts? *Default: brains, as today. The machine gate maps each brain to
   its owner account (R98).*
2. How fresh must the membership check be on a member-held lease? *Default: a signed snapshot with a
   version. Revocation takes effect when the owner's next snapshot lands and the lease is pulled. If the
   owner is offline, the removed member's lease is not renewed past its short Q26 term.*
3. Before the cross-app scope front is settled, may a member's other apps call the shared part? *Default:
   no. Only the member's human and the member's copy of the shared app.*

## 5. Additions to Tasks 27 and 28 under C
- Task 27: the owner circle copy issues a `MachineSigned` membership snapshot `(circle, version, member
  brains, shared apps → parts)` and keeps it in the part. `NeuronCallFilter` gains a circle-admission rule
  that reads it; R107 extends from "owner only" to "owner or snapshot member".
- Task 27: revocation order is: drop the member, bump the snapshot version, revoke any lease the removed
  member's machine holds, rotate the part key, then re-snapshot.
- Task 27: add facts (each one is a numbered addition to the fixed tests):
  1. A member's stamped forwarded call is admitted.
  2. A stranger's call is refused, even with a valid stamp.
  3. A removed member's call is refused after the version bump.
  4. A removed member's machine cannot decrypt records written after the rotation.
  5. `Signal.Publisher` is the part's neuron on a member-forwarded call.
- Task 27: add the per-app Private mark (R82). Sharing clears it for the circle's machines only.
- Task 28: travelling connections (Q14) are wrapped under the same rotation, and dropping a member rotates
  them too. Calls from connections that do not travel go to the owner's core (503 while the owner is
  offline), with a fact.
- Task 28: lease preference reads the signed snapshot. A member machine that holds the lease never
  activates owner core grains. Add a fact that a member-held lease serves a shared call with the owner's
  core unreachable.
