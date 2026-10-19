# Glossary

Technical terms used across the IntoChat OS documentation. See [Concepts](../concepts) for the core model.

| Term | Meaning | Boundary |
| --- | --- | --- |
| IntoChat OS | The open-source AI-native operating system: a .NET 11 / Orleans kernel, modules, a C# sandbox and a Flutter shell | Named DigitalBrain before 0.3.0; see the [0.3.0 release notes](./releases/os-0.3.0) |
| Brain | An ownership scope and state boundary holding a person's apps and state; a circle is a shared brain | Not a synonym for an AI model |
| Workspace | User environment containing applications, conversations and scoped shared context | Access to one workspace does not grant all connectors or data |
| Application | User-facing task with entry points, workflow, UI, dependencies and permissions | A registered module alone is not an installed usable application |
| Module | Developer building block, shipped as .NET projects and NuGet packages | Can supply capabilities or integrations used by multiple applications |
| Connector | Adapter to an external service and its authentication and data interface | An installed adapter does not prove authorized working access |
| Agent | Model-driven execution behavior using instructions and tools | Neither an application package nor an isolation boundary by itself |
| Framework | Runtime contracts and composition primitives | Source and API surface |
| SDK | Framework plus developer tools, templates and test workflow | Compatibility is tracked per release |
| Runtime | Executes application behavior and manages state | Runs independently of any hosted service |
| Catalog | The module composition (`OsCatalog`), or a discoverable inventory of apps | `OsCatalog` is the one place the module composition is named |
| Shared context | Data reused across applications within explicit scope | Provenance, user permission and deletion rules travel with it |
| Provenance | Origin, retrieval time, transformations and permission context of a result | Model-generated text alone does not establish a source |
