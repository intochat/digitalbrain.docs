# Organisation to Authority mapping

## Summary

An organisation is not a separate identity concept. It is an Authority account plus that account's registered brain. Organisation state (members, invites, settings) is stored as neurons in that brain; Authority decides who may reach the brain, and the Organisations module decides the role (Admin or Member) a member holds inside it.

## Mapping

| Organisation concept | Authority / OS concept | Notes |
| --- | --- | --- |
| Organisation id | The founder's `Account.AccountId` | Created by `RegisterPrincipal`, so a personal organisation needs no extra provisioning |
| Organisation brain | Brain `account-<AccountId>` | Holds organisation state only (see Chat privacy) |
| Founder | The only Authority `Owner` (`Member{Role=Owner}`) | Created by `RegisterPrincipal` |
| Member | Authority `Member` added through `IIdentityClient.EnsureMember(Member{AccountId=orgAccount, BrainId=orgBrain, Role=Member})` | Same-account path |
| Admin / Member role | `OrganisationState` neuron state only | Authority `MemberRole` has only `Owner` and `Member`; role changes never touch Authority |
| One organisation per user | Membership index `system-XX/membership/{principalId}` | One tiny neuron per entry in a hash-sharded system brain |
| Grants | Authority grants on the organisation brain | Issued through `IBrainAccess`; sessions come from `ISessionIssuer` |
| Credits wallet | One wallet per account (Phase 14) | Keyed by the organisation's account |

## Lifecycle

- Personal organisation: after verified sign-up, Auth sends an awaited, idempotent `PersonalOrganisationRequest` to Organisations. The `OrganisationCreated` signal is a notification, not the transport.
- Invite and accept: an admin creates an invite; the invitee accepts through a saga that is idempotent at each step and ends with `EnsureMember` on the organisation brain.
- Accepting an invite dissolves the invitee's personal organisation, so every user stays in exactly one organisation.
- Removal: the module calls `IIdentityProvisioning.RemovePrincipalMember` (through `IIdentityClient.RemovePrincipalMember`), then revives the user's original personal organisation.
- Role changes are neuron-only; Authority is not called.

## Signals

| Signal | Raised when |
| --- | --- |
| `OrganisationCreated` | A personal or new organisation is created |
| `MemberInvited` | An admin issues an invite |
| `InviteRevoked` | An admin revokes a pending invite |
| `InviteAccepted` | An invitee completes the accept saga |
| `MemberRemoved` | A member is removed |
| `RoleChanged` | A member's Admin or Member role changes |

Payloads carry hashes or masked addresses. They never carry invite tokens or full email addresses.

## System brains

The brains `system-00` to `system-0F` are never created. They work without creation because the journal and instance registry open for any valid brain id. Creating one would make the OS treat it as a personal brain and install default apps. All methods on these neurons are `[Internal]`, and none of their state is exported.

## Export

| State | Exportable |
| --- | --- |
| `OrganisationState` (members, roles, settings) | Yes, as customer data |
| Invites and invite tokens | No |
| Membership index | No |
| Mail send counters | No |

Invite tokens are 256-bit random values and are stored only as hashes.

## Chat privacy

The organisation brain holds organisation state only: members, invites and settings. Each user's chats stay in their personal account brain and are not moved into the organisation brain. Sharing chats into an organisation is a later product decision and must not happen implicitly.

## Phase 13 handover

- The emailed invite link is `PublicBaseUrl/invite#<token>`. The token is in the URL fragment, so it is not sent to servers or written to access logs.
- The portal `/invite` page reads the fragment and sends JSON `{ "token": "..." }` by POST to three routes: `/organisation/invites/preview`, `/organisation/invites/accept` and `/organisation/invites/decline`.
- The routes accept JSON only and answer 415 for any other content type.
- No landing page exists until Phase 13 builds it.

## Known gaps

- Removal depends on the os increment that exposes `RemovePrincipalMember`. Until a package containing it is pinned, removal is logical only (state and `MemberRemoved` signal) and is a known gap: a removed member's existing session still passes access checks.
- Session revocation that closes that gap belongs to Phase 12.
