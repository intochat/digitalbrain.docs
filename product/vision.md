# Product vision

DigitalBrain should let a person turn an intention into a useful app, keep control of its data and connected accounts, and share that capability with people who can use or adapt it. The same workspace should support social interaction and automation involving external social networks.

All three pillars are product scope. Their completion must be assessed separately: shared architecture reduces duplicated infrastructure, but does not implement provider-specific behavior or settle social-product decisions.

## Users and value

| User | Need | Product outcome |
| --- | --- | --- |
| Personal creator | Turn a repeated task into a tool without assembling infrastructure | Describe, preview, use, and revise an app |
| App recipient | Use someone else's useful workflow safely | Understand an exact release, install a personal copy, connect own accounts |
| Circle member | Work and communicate with trusted people | Join a circle, chat, share posts and apps with a clear audience |
| Social creator or operator | Coordinate activity across external networks | Connect a supported account, observe events, prepare or publish content with explicit authority |
| Runtime operator | Keep the service trustworthy | Recover data, manage access and usage, understand failures |

These are working personas inferred from the implementation and requested direction. Market demand, pricing, and willingness to pay have not been established by a code review.

## Three promises

**Create.** A request becomes a readable specification and an app with visible, usable results. The creator can inspect, revise, and recover it. “Built” must not imply “works as requested” until the required behavior has been observed.

**Connect people.** People discover makers and apps, share exact releases, and communicate within circles. Every social action has a comprehensible audience. A published app must not expose the publisher's private data or connected credentials.

**Connect networks.** An app can react to events and perform supported actions on external social networks through authenticated connectors. Unsupported operations are explained before generation; they are never represented by fixture data.

## Product strategy

Use one shared app lifecycle and identity model across all pillars. Establish a reliable create–use–share–install journey, then prove the same journey with a real external social connector. This is a dependency order within the full scope, not removal of any pillar.

The architecture already supplies typed capabilities, per-brain identity, app state, release provenance, and connector concepts. The next product investment should make these understandable and dependable for users, rather than introduce a separate app language or a second social backend without evidence that one is necessary.

## Decisions still requiring product ownership

1. Which external networks and specific actions are promised at launch? “Social networks” is not a finite acceptance scope.
2. Is the launch audience invited circles, an open public network, or both? Open discovery needs abuse handling and operational ownership.
3. Which external writes require preview and confirmation? Define this per action and delegation policy.
4. Which generated app categories are supported? Start with an explicit palette and task set; avoid a promise of arbitrary software generation.
5. What are the launch thresholds for successful generation, time to first useful result, repair success, and operating cost?
6. Which actions can circle members perform, and what happens to shared content and connected accounts after departure?

## Success measures to establish

Measure completed user journeys: request to useful result, recipient installation to useful result, successful circle participation, and external automation completion. Record failures, repair attempts, permission refusals, and cost alongside success. There is no defensible overall completion percentage until launch requirements and their acceptance results are agreed.
