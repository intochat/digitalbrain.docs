# Architecture and product complexity

DigitalBrain has a reusable foundation for the three requested product pillars. Most remaining complexity sits at the boundaries: intent to behavior, behavior to presentation, personal ownership to sharing, internal events to external effects, and local operation to public deployment.

## Current system

- **Neuron:** addressable state and typed operations.
- **Signal:** typed event with stamped provenance.
- **Behavior:** compiled C# reacting to signals.
- **Connector:** bridge to an external service, device or user interface.
- **Brain:** identity and ownership scope; circles are shared brains.
- **App:** specification, manifest, program, configuration, presentation, version history and release origin.

The vocabulary lives in `src/DigitalBrain`, authoring/runtime abstractions in Framework, and implementation of platform authorities in Platform. OsCatalog composes modules. First-party apps live under `features/os` and `features/intochat`.

AppHost runs one authoritative OS runtime and a separate MCP client host. Devices are connectors. RunProfile.Cloud selects cloud AI configuration; it does not turn the deployment into a distributed social service. Historical federation/mesh designs are not the current architecture.

## Main sources of complexity

| Boundary | Why it is difficult | Recommended direction |
| --- | --- | --- |
| User intention to code | A readable specification does not guarantee complete or correct reactions | Structured acceptance criteria and supported capability catalog |
| Code to visible app | Generator guidance, typed UI records, app presentations and Flutter rendering can drift | One versioned presentation contract and examples derived from it |
| Replay and effects | Behaviors restart and signals can repeat; external writes may succeed before acknowledgement | Durable receipts, explicit uncertainty and safe retry rules |
| Individual to group | Personal accounts, principals, brains, circle membership and connection ownership differ | Explicit audience and authority in every sharing action |
| Release to installed copy | Exact release, settings, edits, data and updates have different lifecycles | One understandable install/update/fork model |
| Provider abstraction | Platforms differ in auth, delivery, actions and quotas | Thin provider-specific connectors over shared lifecycle and policy |
| Local to public use | Secure origins, storage/key custody and browser/device attachment become deployment concerns | Separate local product acceptance from hosted release acceptance |
| Product breadth | Many modules and apps exist, but each adds an operational surface | Capability status catalog; unsupported/unconfigured should be visible |
| Documentation drift | Old plans and agent prompts coexist with newer runtime contracts | Current handbook with dated evidence and archived history |

## Reuse versus new work

**Reuse:** typed contracts, identity and membership, connection storage, app lifecycle, compiler, runtime assignment, UI primitives, immutable publication references, and installation origin.

**Extend:** presentation authoring, behavioral acceptance, interrupted-build recovery, social audience/lifecycle UX, event ingestion and write receipts for real social providers, and deployment acceptance.

**Avoid without a demonstrated need:** a new lexer, a second app runtime, a separate social identity model, or a distributed mesh. None is a prerequisite for resolving the observed product gaps.

## Contract ownership

| Contract | Product responsibility | Technical responsibility |
| --- | --- | --- |
| App specification | What the user gets and how success is observed | Authoring schema and validation |
| Presentation | Required screens, states and interactions | Presentation records and renderer compatibility |
| Social audience | Who can see or act, and what removal means | Membership checks and publication guards |
| External action | What authority the user grants | Provider auth, receipts, retry and revocation |
| Release | What the recipient installs and trusts | Digest, immutable bundle, origin and configuration isolation |
| Readiness | Which claims may be advertised | Evidence attached to exact build and environment |

These are responsibilities, not proposed new services. Assign people before scheduling the delivery plan.
