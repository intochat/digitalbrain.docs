# Orchestration prompt: derived runtime

Paste everything below the line into a fresh Claude Code session opened in `E:\intochat\digitalbrain`.

---

You are orchestrating the implementation of `docs/superpowers/plans/2026-10-09-derived-runtime.md`
(spec: `docs/superpowers/specs/2026-10-09-derived-runtime-design.md`) on branch `os-runtime`, in
this tree, with no git worktrees. Read `CLAUDE.md`, the spec and the plan before anything else.
Then read the memory notes `opencode-deepseek-same-branch`, `live-verification-lessons-2026-10-09`
and `commit-explicit-files-shared-tree`.

## Who implements what

Every task in the plan carries an **Executor** line.

- `Claude`: you implement it yourself in this session, test-first, with LSP for every definition
  and reference. These are the contract-shaped changes (the router's one-way `Ask` and `Routed`
  path, `IRetainsSignals` and the runtime's subscription seeding, the `[Routable]` catalog and
  two-tier routing). Do not delegate them: DeepSeek garbles contract work.
- `DeepSeek`: delegate to OpenCode with DeepSeek V4 Flash, one task per session, using the driver
  below. Review the diff and rerun the task's tests yourself before moving on. Relaunch with a
  note about partial state if a session dies mid-task; scan every touched file for non-ASCII
  punctuation before accepting it.

Run at most two sessions at once, and only when their Files lists touch disjoint projects. Never
run a DeepSeek task that edits a file you are editing.

## The driver

Create `oc/run_task.sh` in your scratchpad with this content and use it for every DeepSeek task:

```bash
#!/usr/bin/env bash
# usage: run_task.sh <plan.md> <task-number> <log-name>
set -u
PLAN="$1"; N="$2"; NAME="$3"; S="$(dirname "$0")"
cd /e/intochat/digitalbrain || exit 1
awk -v n="$N" '$0 ~ "^##+ Task "n":" {on=1} on && $0 ~ "^##+ Task "(n+1)":" {exit} on {print}' "$PLAN" > "$S/$NAME.task.md"
[ -s "$S/$NAME.task.md" ] || { echo "task $N not found"; exit 1; }
cat > "$S/$NAME.brief.md" <<BRIEF
You are implementing exactly ONE task of an approved plan in E:\intochat\digitalbrain (branch os-runtime). Read CLAUDE.md first and obey it. The task is attached; the full plan is $PLAN and its spec is in docs/superpowers/specs.
Rules: implement only this task, every step in order (failing test, run, implement, run green, the suite the task names, commit with EXACTLY the task's git add list and message; explicit files only, never directories or git add -A; other sessions share this tree, leave their changes alone). Build and test per project; never the .slnx. Warnings are errors; nullable on; no '/// <summary>'; sentence-named facts with TestContext.Current.CancellationToken. If the plan contradicts the code, adapt minimally and report it. Do not run aspire run or kill processes you did not start; stop any test over 5 minutes and report. Plain ASCII punctuation only in source; scan touched files before committing.
Final message: (1) files changed, (2) exact test commands and results, (3) commit hash, (4) deviations, (5) anything undone.
BRIEF
exec opencode run --model "openrouter/~deepseek/deepseek-v4-flash-latest" --auto --title "$NAME" \
  "Implement the single plan task in the attached task file, following the attached brief exactly. Read the brief, then CLAUDE.md, then the task." \
  -f "$S/$NAME.brief.md" -f "$S/$NAME.task.md" > "$S/$NAME.log" 2>&1
```

Launch it with the Bash tool in the background and read `$NAME.log` when the notification arrives.
Confirm the model id with `opencode models | grep deepseek` before the first run.

## Order and gates

Follow the plan's order: spec sections 2, 3, 1, 4, 5. A section is done only when its
verification-loop task has been run against the live system per `CLAUDE.md`: `aspire run` from
`src/DigitalBrain.AppHost`, every resource Healthy in `mcp__aspire__list_resources`, the named
neurons read and called through `digitalbrain-mcp`, and the named spans present in
`list_traces`. Before `aspire run`, stop any `aspire run` of your own and check `ListAgents` for
other sessions; ask them with `SendMessage` to release the Aspire turn and tell them when you take
and release it. Installed first-party apps are stale until section 1 lands: refresh them with
`curl -X POST http://localhost:5080/brains/owner/apps/{name}/update -H 'content-length: 0'`.

Section 5 consumes the brain-profiles work from the Photocraft session; if `DigitalBrainProfiles.cs`
is not committed when you reach it, message that session and wait rather than writing a second
profile scheme.

## Working with the other sessions

This tree is shared. Commit only files you changed, by explicit path. Never commit `DigitalBrain.slnx`
or `AppHost.cs` without first checking `git diff` for someone else's hunk and staging only yours
(`git add -p` or a patch). When another session reports a build break in your area, fix it before
starting new work.

## Reporting

Keep the user informed with one short line when a task lands or a session dies. End with a
standalone recap: what landed per section with commit hashes, what was verified live and how,
what was not, and the findings that are not visible from the code.
