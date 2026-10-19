# os 0.3.0 release notes: IntoChat.OS rename

**Date: 18 October 2026.** os 0.3.0 renames the `DigitalBrain` prefix to `IntoChat.OS` across the os repository. This is a clean break. There is no compatibility layer for the old names and no migration tool.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Projects, namespaces, NuGet package IDs | `DigitalBrain.*` | `IntoChat.OS.*` |
| Solution file | `DigitalBrain.slnx` | `Intochat.OS.slnx` |
| Kernel host project and package | `DigitalBrain.OS` | `IntoChat.OS.Kernel` |
| Identifiers that embed the brand | `DigitalBrain` | `IntoChatOS` (for example `AddIntoChatOSServer`, `MapIntoChatOSServer`, `IntoChatOSBuilder`) |
| Launcher | `digitalbrain.cs` | `intochat-os.cs` |
| Configuration section and environment prefix | `DigitalBrain:` / `DigitalBrain__` | `IntoChatOS:` / `IntoChatOS__` |
| Environment variable family | `DIGITALBRAIN_*` | `INTOCHATOS_*` |
| Local state directory | `.digitalbrain/` | `.intochat-os/` |
| Local application data | `%LOCALAPPDATA%\DigitalBrain` | `%LOCALAPPDATA%\IntoChatOS` |
| Grain state container | `digitalbrain-v2-state` | `intochat-os-state` |
| Dart packages | `digitalbrain_*` | `intochat_os_*` |
| Protobuf package | `digitalbrain` | `intochat.os` |
| Telemetry sources, meters, HTTP headers | `DigitalBrain` prefix | `IntoChatOS` prefix |

Container images keep their names: `ghcr.io/intochat/os`, `os-ui` and `os-sandbox`.

Orleans type and grain-interface aliases are now brand-neutral (for example `kernel.neuron`, `identity.directory`), and an architecture test requires every serializable type and grain interface to carry one. A later rename of the product prefix will therefore not change stored type identities.

## Clean break

State written by `DigitalBrain`-era builds (0.2.x and earlier) is **not readable** by 0.3.0. There is no migration tool. The owner decision of 18 October 2026 supersedes the earlier rule that hosted v0.1/v0.2 state must survive, for v0.x state only.

- In Development you may delete local state by hand: `.intochat-os/`, the old `.digitalbrain/`, and the old `%LOCALAPPDATA%\DigitalBrain` directory.
- No code path wipes, moves or rewrites a non-Development store. Operators of non-Development environments decide what happens to their data.
- Stored bytes of three Flutter enums (`ChatRole`, `ChatRunStatus`, `BrowserConnection`) are now written under their aliases instead of CLR type names. Old bytes still read; new writes differ.

## Upgrade is stop-the-world

Grain method identifiers include the declaring type name, and the type names changed. A 0.2.x silo and a 0.3.0 silo cannot form one cluster. Stop every 0.2.x node before starting any 0.3.0 node. There is no rolling upgrade across this release.

## Configuration

Every configuration key, environment variable and Aspire parameter that used the old brand must be renamed before you start 0.3.0.

| Old | New |
| --- | --- |
| `DigitalBrain:` configuration keys | `IntoChatOS:` |
| `DigitalBrain__` environment variables | `IntoChatOS__` |
| `DIGITALBRAIN_*` environment variables | `INTOCHATOS_*` |
| Aspire parameter `digitalbrain-master-key` (scoped `{brain}-digitalbrain-master-key`) | `intochat-os-master-key` (scoped `{brain}-intochat-os-master-key`) |
| Aspire parameter `digitalbrain-bootstrap-password` | `intochat-os-bootstrap-password` |
| `%LOCALAPPDATA%\DigitalBrain` | `%LOCALAPPDATA%\IntoChatOS` |

**Copy the master key to the new parameter before upgrading.** If the key is not copied, the new parameter name would otherwise provision a fresh key, and data encrypted under the old key could not be opened.

### Legacy-key guard

Outside Development, the server, MCP and AppHost processes refuse to start when any legacy name above is present. The error lists every offender at once with its replacement, ends with "no compatibility layer; see release notes 0.3.0", and never prints values. The offenders are: configuration keys starting `DigitalBrain:`; environment variables starting `DigitalBrain__` (any case) or `DIGITALBRAIN_`; Aspire parameters containing `digitalbrain-`; and an existing `%LOCALAPPDATA%\DigitalBrain` directory while `%LOCALAPPDATA%\IntoChatOS` does not exist. In Development the same check logs one warning and continues. The key `IntoChatOS:Guard:IgnoreLegacyDataDirectory` disables only the local-directory check and exists for test hosts; operators should not set it. The guard never deletes or moves anything. `DigitalBrainVersion` and the other MSBuild-only properties are not configuration and are not checked.

## Neutral defaults

Branded identity defaults are removed from os. Distributions set their own values through configuration.

| Setting | Default in 0.3.0 | Configuration key |
| --- | --- | --- |
| Session cookie name | `os.session` | `IntoChatOS:Identity:CookieName` |
| Data protection application name | `os.v1` | `IntoChatOS:Identity:ProtectionApplicationName` |
| Data protection container name | `os-protection-v1` | `IntoChatOS:Identity:ProtectionContainerName` |
| Account claim | `os.account` | `IntoChatOS:Identity:AccountClaim` |
| Brain claim | `os.brain` | `IntoChatOS:Identity:BrainClaim` |
| Identity directory key | `identity-directory` | `IntoChatOS:Identity:DirectoryKey` |
| Hosted grant, runtime, cloud-user and cloud-session claims | `os.hosted-grant`, `os.runtime`, `os.cloud-user`, `os.cloud-session` | `IntoChatOS:Hosting:GrantClaim`, `RuntimeClaim`, `CloudUserClaim`, `CloudSessionClaim` |
| Grain state container | `os-state` | `IntoChatOS:Orleans:GrainStateContainer` |
| Development cluster id | `os-{guid}` | `Orleans:ClusterId` |
| AppHost default service id | `os` | `IntoChatOS:Hosting:ServiceId` |
| Hosted workspace page title | `Workspace` | none |

The identity directory key is the persisted account directory. A wrong value makes every account look missing, so a deployment that keeps existing data must pin the value it already uses. The same applies to the grain state container, whose previous default was `digitalbrain-v2-state` before this release, and to the Orleans service and cluster ids.

A distribution that previously relied on the branded defaults must set these explicitly, or its sessions and stored identity directory will not match.

## Open posture is loopback-only

The check applies only when the AppHost marks the process as run mode (`IntoChatOS:Hosting:Mode=run`, written by the AppHost on the kernel and MCP resources in run mode only), the process is not in a container, and the auth posture is Open. In that case a configured non-loopback URL fails before the process binds. Wildcard hosts (`+`, `*`, `0.0.0.0`, `[::]`) and bare `ASPNETCORE_`/`DOTNET_` `HTTP_PORTS`/`HTTPS_PORTS` count as non-loopback. If code binds a wildcard address after startup, the host stops with exit code 1 and an error log. To serve an Open instance on a network you must set `IntoChatOS:Auth:AllowOpenOnNetwork=true`. That setting exposes an unauthenticated server to the network; use it only on networks you control. Listening URLs are logged at startup. Publish and container modes are not affected, and isolated candidate containers and AppHost live builds set the opt-in explicitly.

Do not remove or rename the `IntoChatOS:Hosting:Mode` marker in a distribution: without it the loopback check silently stops applying.

## Frozen cryptographic contexts

Two key-derivation context strings intentionally keep their historical bytes, including the old brand text: the owner-keys context and the deployment key binding context. Changing them would make existing wrapped keys unreadable. They are held in constants and pinned by tests.

## Packages

New packages are published as `IntoChat.OS.*` on GitHub Packages, starting at version 0.3.0. Existing `DigitalBrain.*` package IDs are left in place and are deprecated; they receive no further versions. Reserve the `IntoChat.` prefix on nuget.org before any public publication.

Modules removed by the earlier purge remain available in the archive tag `archive/sv-modules-and-intochat-features-2026-10-18`.

## Upgrade steps

1. Stop all 0.2.x nodes.
2. Copy the master key to `intochat-os-master-key`.
3. Rename every configuration key, environment variable and parameter in the table above.
4. In Development, delete old local state if you do not need it.
5. Set the identity defaults explicitly if your deployment depended on the old branded values.
6. Start 0.3.0 nodes.
