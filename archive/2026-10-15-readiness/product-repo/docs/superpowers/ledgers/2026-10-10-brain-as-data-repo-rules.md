# Repo rules for every task (DigitalBrain, branch os-runtime)

- Read `CLAUDE.md` at the repo root once; it binds you (rings, hazards, code style, LSP-first).
- **LSP for code lookup** (`findReferences`, `goToDefinition`, `incomingCalls` via the LSP tool, csharp-ls); never grep source code to find symbols. Text search is fine for non-code text (json, md).
- Build and test **per project, never the `.slnx`**:
  `dotnet build src/<path>/<Project>.csproj`
  `dotnet test --project src/<path-to-test-project> -- --filter-class "*Name*"`
- Kill any test run that exceeds 5 minutes and debug the hang; never raise a timeout or add polling to make a test pass.
- Other sessions edit this same working tree concurrently. **Commit only the files you changed, by explicit path** (`git add <file> <file>`), never `git add -A`/directory adds. Never touch, revert or commit files you did not change. Never push.
- Commit messages: the subject style is `Area: sentence of what is now true` (see `git log --oneline -10`), and the message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No `/// <summary>` boilerplate; comments only for what code can't say. Warnings are errors; nullable on.
- Tests are facts with sentence names and `TestContext.Current.CancellationToken`; real grains through `ModuleTest.Create()`.
- The Architecture test suite (`src/Testing/DigitalBrain.Architecture.Tests`) has 6 pre-existing failures unrelated to this work (WorkshopSandboxFacts path literal, ShellFrontFacts keys, RepositoryLayout Roslyn entries, RouterDecided ids, DigitalBrainProfiles/PlatformHosting key literals, SystemOneHostingFacts env vars). Do not fix them; do not add new ones.
- Another session may be running the AppHost, locking `src/DigitalBrain.AppHost/bin`. A copy-lock error building the AppHost is not a compile error; never stop that process.
- The ledger with controller rulings is `docs/superpowers/ledgers/2026-10-10-brain-as-data.md` (read-only for you).
