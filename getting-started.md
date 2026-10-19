# Getting started

Run IntoChat OS on your own machine with a local model. The `local` profile needs no cloud account and no provider credentials.

## Prerequisites

- The .NET SDK pinned in `global.json` (.NET 11, with roll-forward).
- Docker Desktop in Linux containers mode, or Docker Engine.
- Ollama installed and running on the host (`http://localhost:11434`).
- Optional: a GPU, and the Flutter SDK for the desktop shell.

## Run it

From the repository root:

```sh
dotnet run intochat-os.cs preflight   # check the machine, change nothing
dotnet run intochat-os.cs local       # preflight, pull the model, start the AppHost
```

`preflight` checks the .NET SDK, Docker reachability and Linux container mode, Ollama reachability, free ports (including Windows excluded port ranges), disk and memory, and optionally GPU and Flutter. A hard failure stops `local` with exit code 1 and a `fix:` line. Soft findings, such as no GPU or no Flutter, are reported and the run continues.

`local` pulls the model as a visible step, then starts only the floor modules (ai, apps, circles, flame, tools, csharp, orleans, aspire, mcp) plus Azurite and the C# sandbox. Postgres, Qdrant, ClickHouse, Supabase, GitHub, Playwright and the other optional modules stay off. The sandbox image is built from source on first run, which takes about 30 to 60 seconds.

## Choose the model

The default model is `qwen3.5:4b`. On a low-RAM machine pick a smaller one:

```sh
dotnet run intochat-os.cs local --model qwen3.5:2b
```

You can also set the configuration key `IntoChatOS:Local:Model`. The GPU flag `IntoChatOS:Local:Gpu` applies only to a container Ollama and is set from preflight detection.

## Chat headlessly

One model turn through the neuron surface is a usable chat; the Flutter shell is optional. Call the MCP tool `neurons_call` on `http://localhost:5081/mcp` (loopback only):

```json
{
  "contract": "IntoChat.OS.AI.Models.ILLM",
  "key": "default",
  "method": "Generate",
  "arguments": "[{\"messages\":[{\"role\":\"user\",\"content\":[{\"$content\":\"text\",\"text\":\"Say hello.\"}]}]}]"
}
```

`arguments` is a JSON array holding one `InferenceRequest` in web casing. The result is an `InferenceResult` whose messages carry the assistant text. The kernel has no plain HTTP chat route; `LocalChatTurnFacts` in the os repository exercises this exact shape.

## Reset

```sh
dotnet run intochat-os.cs reset --list   # print what would be deleted
dotnet run intochat-os.cs reset          # print the list, type yes to delete
```

Reset runs only in the Development environment in run mode. It removes the repository `.intochat-os` workdir, the `%LOCALAPPDATA%\IntoChatOS` runtime directory, this checkout's Aspire containers and volumes, and the shared `intochat-os-csharp-cache` volume, which every checkout uses. Secrets (the user-secrets master key) and the machine id are kept unless you pass `--include-secrets` or `--include-machine-id`. Non-interactive runs need `--yes`.

## Windows notes

- With Docker Desktop on the WSL2 backend, raise the memory limit in `.wslconfig` if the model and containers do not fit.
- In Git Bash, set `MSYS_NO_PATHCONV=1` before Docker commands that use container paths.
- Hyper-V and WSL can reserve port ranges. Preflight reports ports inside an excluded range.

## State and access

The runtime keeps an encrypted local brain journal. Back up the journal together with its keys; the `features` folder alone is not enough to recover.

Local run mode defaults to the Open authentication posture, which accepts only loopback URLs. Serving an instance on a network needs an explicitly secured deployment.

Upgrading from a build before 0.3.0? See the [0.3.0 release notes](./reference/releases/os-0.3.0).

Next: read [Concepts](./concepts) for the vocabulary and [Architecture](./architecture) for how the pieces fit.
