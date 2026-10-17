# Product requirements

These requirements cover personal app creation, DigitalBrain social features, and external social-network automation. They are proposed acceptance requirements grounded in the current implementation; they are not a statement that the listed behavior is already complete.

## App creation and use

| ID | Requirement | Acceptance criterion | Current assessment |
| --- | --- | --- | --- |
| APP-01 | Turn a request into a readable specification | Before build, user can understand purpose, operations, visible results, required connections and failure behavior | Author exists; specification completeness is not enforced |
| APP-02 | Generate only supported capabilities | Unsupported trigger/action is explained; no fixture or invented capability is presented as real | Contract discovery exists; launch capability catalog needed |
| APP-03 | Produce a usable presentation | Fresh generated app opens with required controls and every visible result reachable; current presentation revision is used | Current presentation machinery exists; authoring guidance mismatches it |
| APP-04 | Preserve state across ordinary restart | Stored results remain; startup does not reset them or duplicate external effects | Runtime and state foundations exist; app-level acceptance required |
| APP-05 | Distinguish build from acceptance | Status clearly distinguishes drafting, building, interrupted/failed, deployed and scenario acceptance | Existing statuses are insufficient as a blanket readiness claim |
| APP-06 | Support safe revision and repair | User can correct an app, remove a behavior explicitly, and retain/recover useful data | Revision and rollback paths exist; merge/removal semantics need clarification |
| APP-07 | Recover interrupted generation | User sees interruption, can retry, and a late prior attempt cannot overwrite the new result | Attempt IDs exist; work queue is process-local |
| APP-08 | Prevent unverified release | Missing compiler or compilation failure prevents the applicable publish/export gate from reporting verification | Permissive paths found |
| APP-09 | Define visual quality | Supported app categories specify layout, labels, empty/loading/error states and interaction behavior | Typed palette exists; product contract incomplete |

## Sharing and social participation

| ID | Requirement | Acceptance criterion | Current assessment |
| --- | --- | --- | --- |
| SOC-01 | Create and join circles | A user can create, invite, accept and enter a circle through discoverable UI; unauthorized people cannot enter | Backend paths exist; full product flow needs acceptance |
| SOC-02 | Make audiences explicit | Before posting/sharing, user knows destination and visibility; unrelated accounts cannot read private content | Audience guards and snapshots exist; policy/UX incomplete |
| SOC-03 | Communicate in a circle | Member sees correctly attributed messages; retry behavior and history limits are explained | Chat exists with bounded history |
| SOC-04 | Manage membership consequences | Leaving/removal revokes access and shared connection authority; creator departure has a clear confirmation and outcome | Revocation paths exist; lifecycle UX needs specification |
| SOC-05 | Define post lifecycle | Product specifies edit/delete, retention, rediscovery, reporting and blocking for launch audience | No complete lifecycle in inspected post/chat contracts |
| SOC-06 | Browse makers and releases | User distinguishes maker profile, personal post, circle chat and published app release | Multiple surfaces exist; terminology and navigation require consolidation |
| SOC-07 | Install an exact release | Recipient confirms publisher/version, gets matching content and personal state; publisher credentials are not copied by normal install | Digest and origin paths implemented; historical local acceptance |
| SOC-08 | Explain updates and forks | Settings retain update eligibility; program edits clearly detach it; updates preserve intended recipient data | Implemented origin/edit logic; user journey needs acceptance |
| SOC-09 | Govern public discovery | Public launch includes reporting, moderation ownership, removal and rate/abuse policy | Launch policy undecided |

## External social automation

| ID | Requirement | Acceptance criterion | Current assessment |
| --- | --- | --- | --- |
| EXT-01 | Declare provider support precisely | Each advertised provider lists supported account types, events, actions and limitations | No production social provider in inspected catalog |
| EXT-02 | Connect and revoke real accounts | Correct user grants required scopes; refresh, expiry and disconnect produce understandable states | Generic connection foundation only |
| EXT-03 | Receive real events reliably | Recorded external event becomes a typed signal with provenance; duplicates and missed-event recovery have defined behavior | Twitter fixture does not satisfy this |
| EXT-04 | Control external writes | User previews/confirms or explicitly delegates the action; result includes durable provider receipt or uncertainty | Provider-specific flow required |
| EXT-05 | Handle provider failures | Rate limits, revoked tokens, rejected content and outage do not silently repeat a write or imply success | Provider-specific flow required |
| EXT-06 | Share automation safely | Installed app uses recipient connection; circle sharing explains authority and revocation | General primitives exist; real provider acceptance missing |

## Operational requirements

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| OPS-01 | Protect a public deployment | Secured origin and authenticated account separation demonstrated for API, shell and MCP |
| OPS-02 | Recover acknowledged state | Restore documented stores and matching custody/identity keys; read acknowledged app, social and account state |
| OPS-03 | Define device-dependent features | Browser-only and desktop/device requirements are visible before installation and execution |
| OPS-04 | Control usage | Per-user/circle policy exposes limits and failed/bounded outcomes without unbounded external activity |
| OPS-05 | Keep claims current | Each shipped claim references current source, environment and acceptance record |
| OPS-06 | Bound retention and growth | Chat, posts, receipts, release history and signals have explicit retention/recovery policies |

## Product acceptance journeys

1. Describe a small app → inspect specification → build → open → interact → restart → inspect preserved result → revise.
2. Publish a release → another account opens its link → installs an exact copy → connects own accounts → uses it → updates or forks.
3. Create a circle → invite → accept → chat/post → share app → remove member → observe access and credential revocation.
4. Connect a chosen external network → receive a real event → prepare a response → confirm/delegate → observe provider receipt → retry safely after an uncertain result.

Release readiness requires these journeys for the selected launch scope. The product owner still needs to set provider names, supported app categories and quantitative quality thresholds.
