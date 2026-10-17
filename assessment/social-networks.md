# Social features assessment

DigitalBrain already has an internal social foundation. External social-network automation is a separate capability and is not established by the internal circle implementation.

## Internal social functionality

| Area | Implemented behavior | Product gap |
| --- | --- | --- |
| Circles | Separate circle brains; creator, members and invitations; creation and acceptance | Confirm discoverable invite/accept/remove flows for ordinary users |
| Permissions | Membership checks; scripts cannot invite/accept; creator removes others, members can leave | Explain roles and destructive consequences, including creator departure |
| Group chat | Member-scoped Say and Read, sequencing and duplicate handling | Define history, message editing/deletion and moderation |
| Friends | Derived from current shared-circle membership | Decide whether this is the intended relationship model; no separate follow/friend-request promise |
| Posts | Friends records an audience snapshot, creates a card and publishes guarded references to circles | Audience selection, deletion, edits, blocking and reporting need explicit scope |
| Profiles | Person neurons and profile rendering; maker profile navigation in Circle | Distinguish personal profile from app publisher identity in UX |
| App feed | Marketplace and Circle surface published apps and exact releases | App-release discovery is not a complete general social feed |
| Sharing | Personal app installation into circles, selected connection copying or shared binding | Explain credential implications and revoke behavior before confirmation |
| Fork/install | Exact publication digest, recipient-owned state and connection configuration | Explain copy, edit, update and origin semantics consistently |

Sources: CircleNeuron, CircleChatNeuron, Friends.cs, CircleMembers, AppInstaller, and the shipped Circle/CircleRoom apps in the [evidence register](evidence.md).

## Concrete complexity and limits

**Two meanings of a post.** Personal content is a card referenced from circle chat; app publication is a versioned software release. Both are useful, but they need separate product language, audiences, and lifecycle rules.

**Friendship is computed from membership.** Leaving a shared circle changes access and discoverability. A conventional follower graph cannot be assumed.

**Audience and replay.** Friends stores initial destination circles before publication and intersects them with current memberships on replay. This is meaningful privacy logic, not a placeholder. The product still needs to explain whether past content remains available after changes.

**History and retention.** CircleChat keeps 500 lines and 64 ordinary message receipts. Post publication receipts are retained separately without a bound in this class. CircleMembers discovers post references from the retained chat lines. Consequently, an old post reference can disappear from discovery after enough chat traffic even though its card and publication receipt still exist. This is a source-derived consequence requiring a retention decision.

**Connection sharing.** Circle sharing may copy a selected credential into the circle or leave a binding to the sharer's connection. Member removal revokes membership and attempts to unbind connections; the guard remains authoritative if cleanup fails. This requires clear consent and status presentation.

**Partial operations.** Membership and app sharing touch identity, circle state, app installation and connection state. Product outcomes after interruption must be defined; source methods alone do not prove atomic user journeys.

## External social networks

The inspected production OsCatalog registers no Twitter/X, Instagram, Facebook, LinkedIn, Mastodon, Bluesky or Discord module. Its generated extension list is empty. The Twitter account and webhook found in `DigitalBrain.OS.Testing/Demo/TwitterFakes.cs` are fixtures that publish an internal signal. They do not demonstrate provider authentication, real event delivery, or a successful external post.

AI provider XAI support is not X/Twitter social-network support. Generic browser automation and MCP connectivity are useful infrastructure, but do not establish a maintained, reliable social integration.

For each launch provider, specify and deliver:

1. Supported account types, authentication, scopes, token refresh and disconnect.
2. Exact read triggers and write actions; provider identifiers and normalized events.
3. Event ingestion through a real supported mechanism, duplicate handling and missed-event recovery.
4. Write preview, user confirmation or explicit delegation, receipts and uncertain-outcome handling.
5. Rate limits, backoff, quotas, revoked access and user-facing failures.
6. Account and circle isolation, credential ownership and removal behavior.
7. Real provider acceptance for the advertised workflow.

Provider-specific commercial/API eligibility must be checked when choosing providers. This assessment does not estimate it from fixtures.

## Product release position

Keep internal social and external automation in the same vision. Reuse identity, connections, signals and app lifecycle. Track completion per user journey and provider. Do not describe a prototype Twitter event as a shipped integration, or a circle chat as a complete public social network.
