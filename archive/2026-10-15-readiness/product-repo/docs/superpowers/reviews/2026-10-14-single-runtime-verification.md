# Single runtime verification — 2026-10-14

Implementation branch: `codex/single-runtime-devices`, based on `os-runtime` at `1472809e9`.
The original checkout, running deployment, data and unrelated edits were preserved.

## Implemented boundary

- One `OperatingSystem-a` runtime on Windows, one `digitalbrain-mcp-a` client host, existing fronts and Flutter shell.
- Local account/member/grant and marketplace authorities; ordinary circles and shared connections remain.
- Encrypted local neuron state and signals with atomic append, durable cursors, exclusive writer ownership, authenticated recovery and checkpoint generations.
- Removed network trust host, machine registration/signing/transport, part leases/routing, sequencers, volunteer mesh and storage-credit machinery.
- Windows device GUID, explicit connections, allowed folders, filesystem/console contracts and TPM custody remain.
- Single-instance updates no longer wait for a nonexistent peer. They interrupt calls and require reconnecting.
- Candidates use fresh isolated storage and fresh custody/session keys. They do not copy production credentials or an incomplete Azurite-only snapshot.

## Automated checks

Each command is `dotnet test <project-directory> --nologo`, with the indicated filter where applicable. Projects were built individually, not through the solution.

| Project | Result |
|---|---:|
| `src/DigitalBrain.Platform/DigitalBrain.Platform.Tests.Unit` | 225 passed |
| `src/DigitalBrain.Framework/DigitalBrain.Framework.Tests.Unit` | 139 passed |
| `src/DigitalBrain.Modules/Microsoft/CSharp/tests/DigitalBrain.Modules.Microsoft.CSharp.Tests` | 196 passed |
| `src/DigitalBrain.Aspire/DigitalBrain.Aspire.Hosting.Tests.Unit` | 45 passed |
| `src/DigitalBrain.Modules/DigitalBrain/Circles/tests/DigitalBrain.Modules.Circles.Tests` | 30 passed |
| `src/DigitalBrain.OS/DigitalBrain.OS.Tests.Unit` | 43 passed |
| `src/DigitalBrain.Mcp/DigitalBrain.Mcp.Tests.Unit` | 29 passed |
| `src/DigitalBrain.Modules/Microsoft/Windows/tests/DigitalBrain.Modules.Microsoft.Windows.Tests` | 23 passed |
| `src/DigitalBrain.Modules/Microsoft/Aspire/tests/DigitalBrain.Modules.Microsoft.Aspire.Tests` | 72 passed |
| `src/DigitalBrain.Modules/Microsoft/Orleans/tests/DigitalBrain.Modules.Microsoft.Orleans.Tests`, `--filter FullyQualifiedName~StorageSelectionFacts` | 4 passed |
| `src/DigitalBrain.Modules/AI/tests/DigitalBrain.Modules.AI.Tests`, `--filter FullyQualifiedName~ModelAddressFacts` | 4 passed |

These 810 passing tests cover storage/replay, retained identity/security boundaries, Windows operations, single-instance deployment and candidate isolation. OS and AppHost builds also passed with zero warnings/errors. Changed C# files were checked with LSP; two test projects required restoring and refreshing the server before their diagnostics cleared.

The whole architecture suite is **48 passed, 8 failed**. It is not green. Remaining failures are in baseline rules/surfaces: caller stamping in ChatFacts, repository path literals in OsCatalogFacts/WorkshopSandboxFacts, Flutter configuration grammar, a pre-existing Roslyn solution-path mismatch, configuration owner literals, UiChildRef namespace, environment literals in existing hosting/candidate tests, and missing RouterDecided member IDs. Source comparison against the base confirms these offending definitions/literals predate this change. New single-runtime composition and local storage boundary checks pass.

## Live Aspire and MCP

An isolated AppHost used fresh platform storage, a separate local brain directory and private test keys. Aspire showed one OS, one MCP host, their fronts and Flutter Healthy. There was no trust resource or B replica.

Through the public MCP front (`neurons_call`):

- Connected the existing Windows device and explicitly authorized a dedicated test folder.
- Wrote/read/listed a file and ran `cd` with that folder as working directory.
- Observed the corresponding durable `FileWritten` signal.
- Revoked the folder and confirmed the next read failed.
- Used a foreign device ID and confirmed refusal; the trace recorded `ServiceUnavailableException` from the Windows connector.
- Repeated cold AppHost starts without a one-minute registration delay. Device ID, allowed roots, file contents and the same signal cursor survived.
- Created an app through MCP, forcibly terminated only the isolated OS process, started it through Aspire, and read back the acknowledged app state. The full smoke recovery (including roots and signal cursor) passed through the same public front URLs.

The abrupt-stop check exposed a legacy unproxied HTTPS listener mapping that left the UI front broken while MCP reconnected. HTTP/HTTPS endpoints now use stable Aspire proxy listeners; Orleans silo/gateway endpoints remain direct. A regression test first failed then passed, the full 45 hosting tests and 43 OS tests passed, and the same abrupt-stop recovery passed through both fronts without restarting AppHost.

Aspire traces show the MCP client calling the sole OS, with Windows operations and authorization resolved locally; no cross-machine forwarding is involved.

`scripts/verify-single-runtime.py` preserves this procedure as `exercise` and `recover` phases. Supply the actual OS/MCP front URLs, an empty dedicated folder and a proof-file path. Restart with the same stores and keys between phases. The script uses absolute file paths so other allowed roots do not affect the check.

Flutter native plugin compilation encountered Windows include-path limits in the deep managed worktree. An ignored `.flutter` junction to the same source, passed through the existing `DigitalBrain:Modules:flutter:Options:Hosting:WorkingDirectory` option, allowed a clean native Windows build without product source changes. The isolated shell uses ReleaseBuild to avoid the original running shell's fixed debugger ports. The release executable built successfully, Flutter reported an attached running application, and Aspire reports it Healthy.

## Review and limits

One independent final review identified two storage bugs. Regression tests first failed, then passed after fixing missing-manifest recovery to refuse a silent reset and removing obsolete state payloads from retained signal history. The full Platform suite then passed 225 tests. No review findings were deferred.

Existing distributed state has not been migrated or reset. A real cutover needs an explicitly scoped export/import if that state must be retained. Live candidate-image promotion/rollback was not performed; deployment/candidate behavior is covered by tests. Candidates establish fresh-boot behavior, not production-data migration compatibility. All signal history is retained initially; checkpoint support does not yet have an automatic maintenance schedule.

Execution adjustments: Windows-native bookkeeping replaced shell scripts; storage/identity work was committed together because owner birth requires both; single-instance deployment validation followed storage replacement; the live MCP smoke script replaced a second heavyweight E2E host fixture. These changes affect bookkeeping/test orchestration, not the intended runtime boundary.
