# Product readiness

**Assessment: substantial prototype and local product slices; readiness for the full three-pillar release is not established.** The biggest gaps are reliable generated-app behavior, a coherent authoring and presentation contract, complete social lifecycle rules, and real external social connectors.

Assessed on 15 October 2026 against commit `667a0327a8b90cedf95b9a5b73494202b73b424e`. “Implemented” below means identifiable source paths exist. Historical live observations are dated separately and do not certify the current checkout.

## Feature status

| Capability | Current state | What remains before a product promise |
| --- | --- | --- |
| Natural-language specification | Implemented Author flow with bounded retries | Complete visual, failure, permission, and acceptance requirements |
| App code generation | Implemented Builder, contract discovery, compile feedback, attempt tracking | Reliable behavior across a declared app set; understandable repair |
| Parser and compiler | Implemented Roslyn syntax parsing, AST inspection, emit, and synapse shape checks | Semantic acceptance, not a new lexer |
| App appearance | Typed UI vocabulary and revision-bound presentations exist | Align generation prompts with current presentation model; define app UX contract |
| Publish verification | Compile checks exist but can return early without verification | Fail closed or explicitly prevent an unverified release from being presented as verified |
| App release and installation | Versioned releases, digests, provenance, separate recipient configuration | Current end-to-end acceptance and understandable update/fork/recovery choices |
| Circles | Creation, invitation acceptance, membership, chat, app and connection sharing | Complete ordinary-user flows and lifecycle policy |
| Friends and posts | Current shared-circle membership derives friends; guarded post references | Audience controls, retention, deletion, moderation and discovery scope |
| Maker profiles and app feed | Shipped Circle app and marketplace paths exist | Clearly distinguish app releases from personal posts and group chat |
| External social networks | No production social provider registered in inspected OS catalog; Twitter is a fixture | Chosen providers and real authenticated actions/event ingestion |
| Runtime | One local authoritative runtime, persistent app state, sandbox execution machinery | Production acceptance, capacity, recovery and isolation evidence |
| Deployment | Local and cloud model profiles exist | A cloud model profile is not a verified multi-user cloud product deployment |

Sources: [Evidence register](assessment/evidence.md), [Creator assessment](assessment/app-generation.md), [Social assessment](assessment/social-networks.md).

## Release blockers

| Priority | Blocker | User consequence | Exit condition |
| --- | --- | --- | --- |
| P0 | Generator guidance still asks for an entry while current apps publish presentations | Generated logic may exist without a discoverable usable screen | Fresh generated apps publish valid current presentations and expose every promised interaction |
| P0 | Compilation does not prove behavior; historical generation produced loops and missing reactions | “Live” can mislead the creator | Acceptance evidence for each supported app category, including restart and repair |
| P0 | Publish/export compile gate permits compiler absence or an InvalidOperationException | Verification promise is conditional | Unverified bundles cannot cross the chosen release gate silently |
| P0 for external automation | No real external social connector in current composition | Advertised social automations cannot execute | A named provider's complete authenticated journey works with real data |
| P0 for public launch | Social safety and audience lifecycle are not fully specified | Users cannot predict visibility, removal, or abuse handling | Agreed policy and demonstrated enforcement through UI and backend |
| P0 for deployment | Secured-origin, recovery and browser/device execution acceptance is incomplete | A local demonstration may fail for an external recipient | Deployment-specific release checklist completed |
| P1 | Builder work is process-local while status is durable | Interruption can leave a build requiring retrigger | Obvious interrupted state, safe retry and defined recovery behavior |
| P1 | Social post discovery uses a bounded chat history, while publication receipts grow | Old posts can become undiscoverable and retained state can grow | Explicit retention/indexing policy and behavior |
| P1 | Documentation and prompts describe different generations of the product | Development and generation follow contradictory contracts | One current handbook and contract-aligned generation guidance |

P0 means a blocker for the associated promise, not a claim that the entire runtime is unusable.

## Evidence and limits

Historical live checks on 12 October showed a successful uppercase app, a two-note app requiring repair, and a selection app failing through a loop; a corrective selection generation then missed the required reaction. Those findings establish failure modes, not the current generation success rate.

Historical 14 October records describe recipient installation of an exact Customer Researcher release, account isolation, a real local research run, and restart persistence. They establish a meaningful local sharing slice, not a public social-network launch.

Two automated suites completed before the product owner instructed this assessment to stop tests: Apps 264 passed and Circles 33 passed. They are supporting engineering evidence only. The subsequent CSharp run was stopped and is not counted as a verified result. No further tests, builds, or live acceptance were run as part of this assessment.

## Readiness recommendation

Keep all three pillars in the vision. Release claims should be earned by the [requirements](product/requirements.md) and [delivery gates](plans/readiness.md), with a visible status for each. Do not publish a percentage of readiness from file counts, module counts, or passing tests.
