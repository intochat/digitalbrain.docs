Continuation prompt — finish B, then C (faster mode)
Paste everything below the line into a new Claude Code session at E:\intochat\digitalbrain.

---

You are the orchestrator. Finish plan B's live verification, then run plan C, on branch `a3` in the worktree
`E:\intochat\digitalbrain\.digitalbrain\worktrees\a3`. Use Claude subagents as implementers, verifiers and
reviewers. OpenCode is optional: its OpenRouter key has credit again (about $47 left), so give it fully
specified mechanical tasks only. Use the model `openrouter/deepseek/deepseek-v4-flash`; the `-latest` suffix fails.

| Plan | File | State |
|---|---|---|
| A1 | docs/superpowers/plans/2026-10-10-aspire-1-candidate-container.md | DONE |
| A2 | docs/superpowers/plans/2026-10-10-aspire-2-rolling-cluster.md | DONE. Silo-roll 10-21 s gaps accepted as an Aspire 13.6 Windows limit (user-approved) |
| A3 | docs/superpowers/plans/2026-10-10-aspire-3-compatibility-gate.md | DONE, two live checks deferred (user-approved): a completed compatible roll followed by a synapse; a removed-method restart |
| B | docs/superpowers/plans/2026-10-10-b-digitalbrain-engineer.md | Tasks 1-6 done and reviewed; Task 7 live checks partly passed, see below |
| C | docs/superpowers/plans/2026-10-10-c-musk-bitcoin-acceptance.md | not started |

## Read first (binding)
- The a3 worktree's CLAUDE.md, and `.superpowers/sdd/rules.md` (in the main repo). Prepend rules.md to every implementer prompt.
- Ledgers (source of truth; trust them and `git log a3` over memory):
  - `.superpowers/sdd/2026-10-10-b-digitalbrain-engineer/progress.md`: every `Ruling:` line, deferred minors, merge notes.
  - `final-fix-report.md` in that folder: how the live system was booted, published and driven, including the "Budgets removed" section.
  - The A2 and A3 ledgers, for rulings you must carry into the end report.
- Memory: commit-explicit-files-shared-tree, test-runs-five-minute-cap, no-timeout-band-aids, digitalbrain-mcp-over-http, csharp-lsp-needs-root-sln, live-verification-lessons-2026-10-09.

## Where things stand (a3 HEAD ~ e916a7a67)
- **Builder budgets are cancelled** (user ruling). The AI module caps a run at 512 calls / 60 min, and the builders use that maximum. Don't re-add caps.
- **B Step 1: pass. Step 2 (behavior): pass. Step 4 (Failed(Building) via WriteFile): pass.**
- **B Step 3 (Echo module): fail.** DeepSeek explores for 85-170+ calls and never writes.
- **B Step 5 (shell): the builder passed** (candidate d3277f4cfd8d0, 48 calls, verified compatible). **Promotion failed in A2's roll code** with "no other OS instance reachable" while OS-a was serving it (trace f39049e5bd6d40a13e93d3de3eba4388). The rollback failed the same way and left OperatingSystem-b out of rotation.
- **Live environment is down.** At about 02:24 UTC, `*-2339e77e` containers (another session's) started on a3's fixed infra ports, and every a3 container exited at 02:30. An a3 AppHost may still be running degraded in terminal tab c8; it is ours.
- **Uncommitted noise in a3 to ignore:** `Directory.Packages.props` and Flutter `generated_plugin*` files (eol/regeneration).
- **Pending merge (user's call):** a3 -> os-runtime. When merging, reconcile os-runtime b04200749 (ICluster.Read no longer read-only), which breaks A2's resume fact.

## Speed rules for this run (from the slow-run retrospective)
1. **Own environment first.** Before any live work, give the a3 AppHost its own infrastructure ports so it can run beside other sessions. Find the fixed ports (18100-18111, 18271-18279, the dashboard 22146, Ollama/systemone), make them configurable through `DigitalBrain:*` keys with today's values as defaults, and run a3 on a distinct set. Do this as one small reviewed task. If it is too big, ask the user for an exclusive window instead. Never stop another session's AppHost or containers without asking the user; message the session (ListAgents/SendMessage) first.
2. **Stronger builder model for verification.** Run B Steps 3 and 5 and plan C with the builders' `Model` set to IGpt56Luna. Then make one DeepSeek attempt per step only to record its success rate. If Step 3 still won't write on Luna, make the Module Builder brief directive: point at a template module to copy, with an explicit file list.
3. **Shorter live checks.** One attempt per step to find gaps, then fix and do one confirming attempt. Measure success rates separately at the end, three attempts at most.
4. **Fewer review rounds.** Fix diffs under about 50 lines get the controller's own scoped re-review (read the diff, ledger it). New tasks and contract changes still get a dispatched reviewer.
5. **Batch live verification.** Group pending live checks into one AppHost session: A3's two deferred checks, B Step 5's promotion, and B Step 3.
6. **Pre-flight the box before booting:** at least 20 GB free on C:; Docker responds (`docker info`); the ports are free; the shared user-secrets values are as a3 expects. The B fix wave reset `Modules-digitalbrain-master-key` after an outside rewrite at 21:54.

## Next actions, in order
1. Speed rule 1 (own infra ports), reviewed and committed on a3.
2. Fix the A2 roll defect: during promotion the roll can't see the other OS instance while OS-a serves it, and the rollback strands OS-b. Use systematic debugging from trace f39049e5…, and add a fact.
3. One batched live session:
   - B Step 5 promotion end to end;
   - B Step 3 on IGpt56Luna;
   - A3's two deferred checks.

   Record attempts and model calls.
4. Close B: run the final review over the fix range, do one fix wave if needed, then ledger the closure.
5. Plan C, per its plan. The Twitter module, the price module and the demo app must come from the running brain via the Engineer, not be hand-written. Fix failures in A/B code, prompts or tools within C's attempt budget. When the budget runs out, write the report C asks for.

## Hard rules (unchanged)
- Other sessions share the main tree. Commit only with `git commit --only -- <paths>`, in a3 via `git -C <worktree>`. Never use stash, reset, restore, `checkout --` or `add -A`.
- Use LSP before every change (csharp-ls needs DigitalBrain-lsp.sln in the worktree root; copy it there). Build and test per project, never the .slnx.
- Kill any test run longer than 5 minutes. Never retry, raise a timeout or add polling to make a check pass.
- Never change `src/DigitalBrain.Modules/AI/**` (owned by another session).
- Done means seen running: all resources Healthy, driven through digitalbrain-mcp, confirmed in traces and logs.
- Stop and ask only if a design proves infeasible after the plan's fallback, or a change needs a concept beyond neuron/signal/behavior/connector.

## End report (per plan)
- Verification evidence.
- Model success rates: DeepSeek V4.1 Flash vs IGpt56Luna per step, and the OpenCode task success rate.
- Everything deferred.
- Every `Ruling:` line from the A2, A3, B and C ledgers, with its cost if wrong.
