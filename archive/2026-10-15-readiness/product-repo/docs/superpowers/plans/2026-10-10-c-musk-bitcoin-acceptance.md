# C — "How Musk Moves Bitcoin": the brain builds itself (acceptance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the self-improving loop end to end: a user asks the running brain for an app showing how Elon Musk's posts line up with the Bitcoin price, and the brain builds it **at runtime** — a Twitter module (webhook ingress + mock/real connector), a price module, a chart that can mark posts, and the app — verified by the old version over MCP before the new version takes over.

**Architecture:** Nothing in this plan hand-writes the Twitter module, the price module or the app: they are the Engineer's output (sub-project B) through candidates (sub-project A). This plan writes the acceptance scenario, the oracle the run is judged against, the one platform prerequisite the builders cannot reasonably make alone (a chart that marks events — a Flutter wire change, done by hand here as the reference for the Shell Builder), runs the scenario, and turns every failure into a fix in A/B (playbook, tools, gates) — never into hand-written demo code.

**Tech Stack:** everything from A and B; CoinGecko public API (`/api/v3/coins/bitcoin/market_chart`, `/api/v3/simple/price`); X API v2 shape for posts and its webhook CRC (`crc_token` → `sha256=` base64 HMAC).

**Spec:** this plan's Design section (direction from chat 2026-10-10: "create twitter module with mock connector or even real ITwitter and webhook to receive an event; user asks the system to build itself at runtime to get bitcoin price chart or price data, then add to the chart points with twitter posts of Elon Musk; app named like 'How Musk affects Bitcoin'; older version tests newer version via MCP"). **Requires A plan 1 and B merged.** A plans 2–3 make the promotions roll instead of restart; the scenario passes either way.

## Design

### The request (verbatim, sent to `engineer ask`)

> Build me an app called "How Musk Moves Bitcoin". It shows a line chart of the Bitcoin price in USD
> for the last 30 days, refreshed every 5 minutes, and marks every post by @elonmusk on the chart at
> the time it was posted, with the post text as the marker's label. Posts arrive through a Twitter
> webhook; when there are no Twitter credentials, use a mock Twitter connector I can post to myself.
> Tell me the webhook URL and how to send a mock post.

### Expected decomposition (the oracle, not instructions to the builders)

| Piece | Kind | Owner | Shape that passes |
|---|---|---|---|
| Chart markers | platform, Flutter wire change | **this plan, by hand** (Task 1) | `ChartPoint` gains `Series` and `Note`; series `"markers"` renders as labelled markers over the line |
| Twitter module | module | Module Builder | a neuron per account (e.g. `{brain}/twitter/elonmusk`), a `Posted`-like signal with id, text, time; webhook ingress via `IHttpSurface` with HMAC signature + CRC GET; a mock path (dev integration secret or a `Simulate`-style method) when no credentials |
| Price module | module | Module Builder | a neuron per asset with history (`days`) and current price from CoinGecko; outbound HTTP through `IHttpClientFactory`; optional API key through an Integration |
| App | behavior | Creator | `features`-shaped app in the brain: open → chart rendered from history; reminder every 5 min → append price; on post → append marker at post time with note |

The oracle checks **behavior through MCP**, not names: the acceptance steps discover the Engineer's chosen contracts with `neurons_search` and drive them.

### Why the chart is done by hand

The chart change is a C# record wire change plus a Dart renderer change in the shell, a cross-language edit the Shell Builder has never done. Doing it by hand gives the Shell Builder a reference commit and keeps the acceptance about modules + app. Task 5 re-does a similar marker style change *through* the Shell Builder to cover that path.

## Global Constraints

- All Global Constraints of A plan 1 and B apply.
- **No hand-written Twitter module, price module or demo app.** If the builders cannot produce them, fix A/B and rerun; if blocked after the attempt budget in Task 4, stop and report the gap.
- External calls: CoinGecko public endpoints only; no X API calls unless a real bearer token is present in the dev integration (never commit tokens).
- Mock posts go through the same webhook path as real ones (signed), so the mock exercises the real ingress.

## Review Focus

- A post that arrives before any price point exists: the marker still lands (value = nearest later price when it appears, or placed at the post time with the last known price) — the app must not drop it.
- Duplicate webhook deliveries (same post id): one marker.
- CoinGecko rate limit (HTTP 429): the price neuron reports the failure on its state; the app shows "price unavailable" and keeps the existing chart — no retry loop.
- Webhook with a bad signature → 401, no signal; CRC GET → correct `response_token`.
- Chart point cap (`UIVocabulary.ChartMaxPoints`): 30 days × 288 five-minute samples exceeds it; the app must downsample history (e.g. hourly) so markers are not trimmed away.

---

### Task 1: Chart markers (by hand, reference for the Shell Builder)

**Files:**
- Modify: `src/DigitalBrain.Modules/Google/Flutter/DigitalBrain.Modules.Flutter.Contracts/Chart/IChart.cs` — `ChartPoint` gains `[property: Id(3)] string Series = ""` and `[property: Id(4)] string? Note = null`; comment: series `""` is the line, `"markers"` are labelled markers at `Label` (the x position) with `Note` as text.
- Modify: `.../DigitalBrain.Modules.Flutter/Chart/ChartNeuron.cs` — `Append` dedupe by `EventId` unchanged; trimming keeps markers: trim the oldest *line* points first (`TakeLast` on series `""` only).
- Modify: `.../DigitalBrain.Modules.Flutter/UiKit/ChartRender.cs` — read it fully first; emit markers in the render model.
- Modify: the Dart side — find the chart renderer with the dart LSP (`dart` MCP `lsp` / workspace symbols for `chart` under `src/DigitalBrain.Modules/Google/Flutter/app`) and the Dart mirror of `ChartPoint`; add `series`, `note`; draw markers (vertical tick + label) over the line chart.
- Tests: C# `ChartFacts` (find the Flutter module test project via LSP on `ChartNeuron` references): `MarkersSurviveTrimmingOfOldLinePoints`, `AMarkerKeepsItsNote`; Dart widget test `chart_markers_test.dart`: a line chart with one marker shows the note text.
- This is an additive wire change: no `[Version]` bump needed for `IChart` (method signatures unchanged; record gains fields with new ids).

- [ ] Steps: failing C# facts → implement → pass; failing Dart test → implement → `flutter analyze` + `flutter test` clean (from `src/DigitalBrain.Modules/Google/Flutter/app/shell`) → commit `"Chart: labelled markers over the line"`.

### Task 2: Oracle script

**Files:**
- Create: `docs/superpowers/acceptance/musk-bitcoin.md` — the request (verbatim above), the oracle table, and the exact MCP steps of Task 3/4 with expected observations, so any session can rerun it.
- Create: `scripts/acceptance/musk-bitcoin.cs` — a file-based C# app (`dotnet run scripts/acceptance/musk-bitcoin.cs -- <mcp-url> <brain>`) that speaks raw JSON-RPC to `digitalbrain-mcp` (pattern: memory "digitalbrain-mcp over HTTP"; reuse the JSON-RPC shape of A's verifier) and performs the checks of Task 4 Steps 3–7, printing PASS/FAIL per check and exiting non-zero on any FAIL. It discovers contracts with `neurons_search` ("twitter post webhook", "bitcoin price history", app name "how-musk-moves-bitcoin" or by title).
- Test: run it against a brain where nothing is built yet → every check FAILs with a clear "not found" message (proves the script detects absence).

- [ ] Steps: write → run (expected all FAIL, exit 1) → commit `"Acceptance: How Musk Moves Bitcoin oracle"`.

### Task 3: Prerequisites on the running system

- [ ] **Step 1:** `dotnet run digitalbrain.cs`; Aspire healthy; Docker available; `aspire:Workdir` integration set.
- [ ] **Step 2:** Dev integration for Twitter webhook secret: the Engineer's module will declare its own `IntegrationSchema`; after its candidate is promoted, set `DigitalBrain:Integrations:twitter:WebhookSecret` (or whatever field the module declares — read it from `neurons_search`/the module's connector listing) in the AppHost user secrets and restart once. Record the field name.
- [ ] **Step 3:** Confirm `IDeepSeekV41Flash` answers (`neurons_call` the model's `Describe`).

### Task 4: Run the scenario

- [ ] **Step 1:** `neurons_call` `engineer` `ask` with the request text. Record the request id.
- [ ] **Step 2:** Watch the request state `{engineer}/requests/{id}`: classification `module` with a `then` behavior part; Module Builder runs (traces: `microsoft.roslyn` spans, `aspire.candidate` stages). Expect two modules in one candidate or two candidates sequentially — both are acceptable.
- [ ] **Step 3:** Candidate verified **by the live (old) version over MCP**: in traces, the verifier's `neurons_call`s target the candidate's MCP endpoint; `CandidateVerified` report lists the checks. Then promoted; `ICluster.Read()` on the new sha.
- [ ] **Step 4:** After promotion, the Engineer dispatches the `then` part to the Creator; the app appears (`neurons_list` apps) and opens a window with the chart (`IChart` state has ≥ 1 line point and `Series=""` points within the last 30 days, downsampled under the cap).
- [ ] **Step 5:** Mock post: send the signed webhook as the Engineer's answer instructs (or `Simulate`), text "Bitcoin to the moon". Within one reaction, `IChart` has a `Series="markers"` point with that `Note` at the post time. Re-send the same delivery → still one marker.
- [ ] **Step 6:** Bad signature → 401, no marker. CRC GET → valid `response_token`.
- [ ] **Step 7:** Reminder tick (wait for one 5-minute tick, or call the app's refresh operation if it exposes one) → a new line point.
- [ ] **Step 8:** `dotnet run scripts/acceptance/musk-bitcoin.cs -- http://localhost:5081/mcp <brain>` → all PASS, exit 0.
- [ ] **Step 9: Attempt budget.** If any step fails, diagnose (systematic-debugging): classify the cause as (a) builder playbook/prompt gap, (b) missing tool/contract in B, (c) gate/verification gap in A, (d) model capability. Fix (a)–(c) in their plans' files with tests, rerun from Step 1 with a fresh request. After 5 full attempts without passing, stop and write `docs/superpowers/acceptance/musk-bitcoin-report.md`: each attempt, where it failed, what was fixed, and the remaining gap.

### Task 5: Shell path through the Shell Builder

- [ ] **Step 1:** `engineer ask`: "Make chart markers on line charts show a small dot on the line as well as the label." → `shell` → Shell Builder edits Dart in a candidate using the dart MCP server (`analyze_files`, tests), submits → verified → promoted.
- [ ] **Step 2:** The demo app's chart shows dots (inspect the chart widget through the shell's edge neuron with `digitalbrain-mcp`, per CLAUDE.md "UI changes are verified the same way").
- [ ] **Step 3:** Same attempt budget and report rule as Task 4 Step 9.

### Task 6: Close out

- [ ] **Step 1:** Commit the acceptance report (pass or gap), the oracle script results, and any A/B fixes (explicit files).
- [ ] **Step 2:** Regression suites of every project touched in A, B and C.
- [ ] **Step 3:** Update memory (`kernel-landed`-style project note): what the brain built by itself, model success rate, open gaps.
