> Historical design: distributed runtime portions are superseded for the local-PC deployment by [single-runtime devices](../specs/2026-10-14-single-runtime-devices-design.md). Windows connector functionality remains.

# Brain as data: parts, leases, circles and the mesh — design (phase 2)

Status: ratified 2026-10-10 through a grilling session (decisions Q1–Q22 below). Supersedes the owner-cluster
parts of [phase 1](2026-10-10-windows-module-and-federation-design.md): the Windows module and per-OS
contracts stand; "one Orleans cluster per owner" is replaced by decision Q12.

## Main source of complexity

The first draft bound data to **places** (a brain lives in an owner cluster; trust, federation and circles
were cluster-to-cluster), so every open item — NAT, discovery, gateways, cross-cluster identity — came from
location. **A brain is data, not a place**: its key plus its encrypted state in the mesh. Any machine trusted
with a part's key loads and runs that part. Machines are caches and compute. The one hard problem left is
**mutable state on a distributed untrusted store**: exactly one writer per part, and no lost writes. Leases
and a log answer it.

## Product rules (unchanged)

Privacy = your own compute: private parts run only on the owner's machines or a circle the part is shared
with. Storage is encrypted everywhere with user-held keys. Anyone can join and earn on public jobs and
storage. Credits link the tiers.

## Decisions

| # | Decision |
|---|---|
| Q1 | A brain is **data**: key + encrypted state in the mesh. No home machine. |
| Q2 | When the owner's machines are off, **private parts sleep** and catch up from watermarks; parts the user marks not private may run on platform silos. |
| Q3 | Identity root is a **user-held key**; the platform account is a login/billing handle linked to the key's public half. |
| Q4 | Platform silos hold plaintext **only for parts marked not private** and deployment Integrations. |
| Q5 | **Many machines run parts** of one brain concurrently. |
| Q6 | **Key hierarchy**: master key wraps a key per part; a circle receives a part key wrapped to each member's public key. Revoking = rotating one part key. |
| Q7 | The **privacy flag is per app**; its behaviors, tables, documents and bound connections inherit it. A not-private app may bind only connections marked not private. |
| Q8 | The running machine keeps a **local encrypted cache**; the mesh is durability, handover and sync. |
| Q9 | A **part = one app** (neurons, tables, documents). The brain's **core** (kernel registry, connections) is its own part. |
| Q10 | A **platform sequencer** holds, per part, an opaque signed record (part id, version, holder, lease expiry) with compare-and-set. It cannot read or forge; it can only withhold, and machines detect rollback by remembering the last version seen. |
| Q11 | Any machine holding a part's key may **hold its lease**: own machines, and circle members' machines for parts shared with them. The core is held only by own machines. |
| Q12 | **Every machine is its own single-silo Orleans cluster**, hosting the parts it leases plus its own device neurons. Calls between parts on different machines go through the DigitalBrain transport, not Orleans clustering. |
| Q13 | **Each part's signals are an encrypted append-only log** in the mesh, sequenced like state. Subscribers on any machine read from their watermark (`brain.On<T>` unchanged). |
| Q14 | Sharing an app with a circle **asks which bound connections go along**; those credentials are wrapped to circle machines, the rest call the owner's core (503 while the owner is offline). |
| Q15 | Transport: **direct QUIC with hole punching**, platform **relay fallback** carrying ciphertext; the sequencer record names the holder. No holder → 503; never start a part without its lease. |
| Q16 | **Volunteer mesh storage is in the MVP** (not platform blob storage first). |
| Q17 | **Lease preference**: own machines first, then circle machines; the lease returns to an own machine at the next quiet moment. |
| Q18 | **A write counts once it is in the part's log and the sequencer accepted the version** (log + periodic snapshots). The local copy is a read cache. |
| Q19 | While the network is small, **platform seed storage nodes** act as ordinary mesh nodes (ciphertext only) to fill missing distinct owners. |
| Q20 | **Wide erasure coding** for home nodes (order of 8-of-24; tuned later) plus the local cache. |
| Q21 | Storage nodes earn **credits only** in the MVP (kernel ledger); cash payout later. |
| Q22 | ComputeMesh storage is **ported into a DigitalBrain module** (it assumes a fully trusted core and a server-held master key, which no longer fit). Superseded in placement by Q23. |
| Q23 | (2026-10-10, after review of plan 1) **Mesh storage holds only immutable, content-addressed ciphertext.** Sealing, erasure coding, the manifest and audits run in the caller's silo with the part key (`IMeshStore`, Framework ring; implemented in Platform); a segment's manifest is itself sealed, and a ref pins it by content id. The only mutable state is the sequencer record (Q10), which names the log head's ref. Storage nodes are untrusted put/get/prove servers in one network-wide directory beside the sequencer (Platform ring), never per brain and never neurons; unreachable segments are reclaimed by reachability from log heads. |
| Q24 | (2026-10-10) **The platform runs two things.** A **trust cluster** (sequencer, node directory, ledger, identity, relay) that sees only signed records and ciphertext and hosts no neuron; and **cloud machines**, ordinary Q12 machines that we own and bill for, leasing only parts marked not private. Users run parts on their own machines or a circle's; our cloud is the paid third option. Platform grains persist in `platform` storage; neurons persist in `cluster` storage, which on a machine is the part log. |
| Q25 | (2026-10-10) **Mesh from day 0, backed by platform seed nodes registered as one owner** (`platform`). Encryption and the protocol are real from day 0; spreading across distinct owners starts with the first volunteer node. |
| Q26 | (2026-10-10) **Own machines hold long leases (days) and journal locally.** While the sequencer is unreachable an own machine keeps writing to its local encrypted journal and commits when it reconnects; nobody else can write a part whose lease is live. A write on an own machine is acknowledged once journaled and durable in the mesh once committed; circle and cloud machines hold short leases and acknowledge only after the commit (Q18). |
| Q27 | (2026-10-10) **The part log is the only truth; one entry is one neuron change**: its new state record (or a clear) and the signals it publishes, committed together. Current state is the latest record per neuron; signals are durable and replayable from a watermark. Neurons keep their state shapes; no event sourcing. A part is the brain neuron (core) or an app neuron (`{brain}/apps/{app}`); a neuron belongs to the part whose key prefix it carries, as it already belongs to its brain. A machine cluster refuses keys outside every brain. |

## Shape

- **Mesh storage** (Q23): immutable content-addressed encrypted segments, Reed–Solomon shards across distinct
  owners, storage proofs, audit and repair, all driven from the caller's silo with the part key; nodes see
  ciphertext and content ids only.
- **Sequencer** (platform, Platform ring): per-part signed CAS records and leases; per-part log heads.
- **Part log** (Q27): entries of one neuron change each (state record + signals), batched into sealed mesh
  segments, plus snapshots; on a machine it is the `cluster` grain storage, so neurons persist through it
  unchanged, and their signals become durable in the same entry. Own machines journal locally first (Q26).
- **Keys**: master key in machine secure hardware or passkey; part keys wrapped by it; recovery via a second own
  machine or Shamir shares.
- **Transport**: machine-to-machine QUIC, relay fallback; routes cross-part calls and carries the `Trace`.
- **Circles**: a circle neuron (members, contributed machines, schedules); sharing a part wraps its key (and the
  chosen connections) to members' machines; lease preference per Q17.
- **Public mesh compute**: Wasmtime workers, deterministic WebAssembly jobs, ComputeMesh-style verification,
  payment by fuel, credits only in the MVP.

## Out of scope

Confidential-cloud tier, FHE/MPC compute, splitting one model across machines, cash payouts, a custom token.

## Open items

1. Exact erasure parameters and repair cadence for home nodes.
2. Sequencer availability and placement (it is availability-critical; Q26 keeps own machines writing through an outage).
3. Relay operation and abuse limits.
4. FilmCraft export as a CPU-only `wasm32-wasip2` job.
5. Cross-brain authorization shape for circles (the existing open front on cross-app scopes and run-token
   tightening) — must fit decisions Q11 and Q14.
