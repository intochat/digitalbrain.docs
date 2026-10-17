# Runtime acknowledgement batches

Reduce actual HTTP/RPC/persistence overhead when several behavior subscriptions finish signals together. Preserve per-subscription durable watermarks, stale-session rejection, replay after failure, and all existing telemetry and performance thresholds.

Use one session acknowledgement sender. Send immediately when idle; while a request is in flight, queue completed acknowledgements and drain up to a bounded batch for the next request. Do not introduce a delay timer. Complete each caller only when its batch is durably confirmed. A failed batch faults its callers, allowing existing behavior restart/replay; cancellation of one waiter must not abort unrelated acknowledgements. Disposal cancels outstanding requests and waiters.

Add an optional acknowledgement-array wire member while keeping single acknowledgements compatible. The runtime validates the active session and batch bounds, trims each subscription to its acknowledged watermark, and persists the complete batch once. No changes to business calls, source signals, authorization rules, or exporter sampling.

- [x] Map definitions/references/implementations/callers with LSP before edits.
- [x] Client tests: blocked first report proves queued batching and durable completion; failure/retry; waiter cancellation and session disposal. Observe red, implement sender.
- [x] Runtime and HTTP tests: independent watermarks, duplicates/unknown subscriptions, stale sessions, bounded batches and malformed items, durable reactivation. Observe red, implement wire/edge/runtime batch path.
- [x] Run client and CSharp suites, clean diagnostics, review, OS and unchanged Framework E2E gates.
- [x] Deploy matching client/sandbox/OS/MCP; verify a real normal turn, queues and traces, preserving current data and settings. Record acceptance evidence and remaining limitations; commit locally without PR/push.

Review repair: each report has an independent 30-second deadline, tested with a manual TimeProvider. A hung transport faults its callers and releases the sender for unrelated subscriptions. Capture immutable trace parent IDs and create a scoped child activity so disposed originating activities cannot erase trace context. Client 18/18 and CSharp 131/131 passed; LSP has no errors or warnings (four pre-existing unused-using hints). Reviewer has no remaining Important/Critical findings. Framework E2E 16/16 passed, including the unchanged 140-span gate. OS E2E 3/3 passed. Matching OS/MCP builds and sandbox image deployed; real turn completed with original data/settings preserved and empty app queues. Live AcknowledgeMany traces confirm the new path, without errors. Full-goal native and other acceptance gaps remain open.
