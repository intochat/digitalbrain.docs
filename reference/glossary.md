# Glossary and component boundaries

These definitions keep product promises, implementation identifiers and commercial records distinct. Target responsibilities are proposals unless the evidence inventory identifies implemented behavior.

| Term | Meaning in this handbook | Boundary |
| --- | --- | --- |
| IntoChat | Customer-facing universal AI workspace and application ecosystem | Selected strategy; not a claim of confirmed demand |
| DigitalBrain | Existing platform/runtime technical name and source namespace | Preserve identifiers; branding does not authorize a code rename |
| Workspace | User environment containing applications, conversations and scoped shared context | Access to one workspace does not grant all connectors or data |
| Brain | Existing cloud/runtime deployment identity | A technical allocation and state boundary; not a synonym for an AI model |
| Application | User-facing task with entry points, workflow, UI, dependencies and permissions | A registered module alone is not an installed usable application |
| Module | Developer building block, commonly a .NET/NuGet package | Can supply capabilities or integrations used by multiple applications |
| Connector | Adapter to an external service and its authentication/data interface | Installed adapter does not prove authorized working access |
| Agent | Model-driven execution behavior using instructions and tools | Neither an application package nor an isolation boundary by itself |
| Framework | Runtime contracts and composition primitives | Source/API surface; not managed hosting |
| SDK | Framework plus usable developer tools, templates, documentation and test workflow | Proposed stable external experience requires compatibility evidence |
| Runtime | Executes application behavior and manages state | May run independently of the commercial cloud |
| Cloud control plane | Account, entitlement, allocation, lifecycle, proxy and billing management | React portal belongs here; Flutter workspace belongs to runtime experience |
| Catalog | Discoverable approved application inventory | Can begin with first-party applications |
| Marketplace | Catalog plus external publishers, submission/review, support and commercial rules | Requires supply and demand evidence, not merely an install button |
| Shared context | Data reused across applications within explicit scope | Provenance, user permission and deletion rules must travel with it |
| Provenance | Origin, retrieval time, transformations and permission context of a result | Model-generated text alone does not establish a source |
| Metering | Recording quantities such as tokens, seconds or bytes | A measured event need not have an assigned price |
| Pricing | Applying a versioned rate and unit to measured usage | Distinct from a provider invoice and cash settlement |
| Ledger | Durable financial or usage entries with identity, scope and adjustments | Entries are not proof that a payment succeeded |
| Payment | Provider-confirmed transfer of money reconciled to an obligation | An intent, promise, checkout UI or usage event is insufficient |
| Markup | `(price − cost) / cost` | A 25% markup on 100 produces 125 |
| Margin | `(price − cost) / price` | The same example has 20% margin |
| Contribution | Revenue minus attributable variable costs | Include models, compute, storage, APIs, payment fees and variable support |
| Reservation | Budget held before concurrent work is admitted | Ambiguous provider outcomes may require a conservative hold |
| Stage gate | Evidence required to advance scope | No calendar date or completion percentage implied |
| Verified locally | Behavior observed in a named executed check/environment | Does not mean deployed, production-safe or commercially validated |

Related: [repository boundaries](./repositories), [evidence classes](./evidence), [open decisions](./decisions).
