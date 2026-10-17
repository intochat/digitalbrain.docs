# Atomic chat projection actions

Goal: compose transcript actions in behaviors and project them atomically with messages, eliminating the assistant's separate Stop updates and redundant selection reads. Preserve authorization, durable state, telemetry, and the unchanged 140-span performance gate.

Design: optional `ChatProjection.Actions` defaults to empty. Each generic action carries a stable ID, label, canonical payload, and enabled flag. `IChat.Activate(source, generation, actionId)` accepts only a currently enabled matching action and publishes `ChatActionActivated`, also dispatching through `IUiBinding`. Version is deliberately excluded from clicks so streaming does not invalidate an otherwise current action. Behaviors bind IDs to immutable run identities. New runs and new conversation generations reject delayed clicks.

- [x] Inspect shared chat, UI endpoint, renderer, and assistant behaviors; map definitions, references, implementations, callers through LSP.
- [x] Add real-neuron tests for durable action projection, canonical signals/bindings, stale/disabled actions, streaming versions, and invalid projections. Observe failures, then implement shared contract and neuron.
- [x] Add HTTP and narrow-widget tests, observe failures, then connect generic actions through AppUiEndpoints and NeuronView. Keep payload server-authoritative.
- [x] Update assistant projection, stop, surface, spec and manifest. Use cancellation scope plus existing generation guards; retain selection reconciliation. Compile actual scripts through Export, with no per-app unit tests.
- [x] Clean LSP diagnostics; run affected Flutter module, Flutter UI/shell, architecture/OS and framework regression suites sequentially where dependencies overlap. Request review and resolve findings.
- [x] Deploy contracts, sandbox, OS, MCP and Flutter as necessary. Preserve installed origins, settings, connections, rows and views. Verify real current/stale Stop, recovery, normal turn, and unchanged performance gate in runtime and traces.
- [x] Record evidence and acceptance status; commit only verified changes. No PR or push. Native visual checks remain pending while the Windows security prompt requires human handling.

Verification outcome: all functional module/UI/shell/hosting/architecture/OS checks passed. Framework E2E remains 15 passed / 1 failed at 142 spans against the unchanged 140 limit; this work reduces the prior 169 measurement but does not close that gate. Native checks remain blocked by the Windows Security prompt. Runtime verification and traces prove two real cancellations, stale action rejection preserving the newer run, and a normal follow-up. See the goal acceptance matrix and chat-actions outputs for evidence.
