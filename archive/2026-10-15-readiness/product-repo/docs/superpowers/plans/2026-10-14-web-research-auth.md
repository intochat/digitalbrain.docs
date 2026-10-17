# Web research and authentication implementation plan

## Accepted scope

The user requests a locally verified web-only Customer Researcher, proper account entry/exit and an isolated browser worker per account, with all research orchestration in C# apps. This continues the existing sharing implementation; no public deployment is authorized or required.

## Design

Extend the generic Playwright neuron with managed-session lifecycle methods. The server derives account identity from trusted caller/brain context; clients never select a worker account. Each account receives its own headless Chromium process. App sessions use separate ephemeral contexts/pages, with bounded concurrency, teardown and idle cleanup. Retain desktop attachment for other apps. Managed public-web sessions keep existing URL/network restrictions and must not gain deployment-local Evaluate access. Browser installation/configuration is explicit and production portable.

Customer Researcher starts its managed session before research and releases it after completion/cancellation. C# owns progress, source observations and result composition. Web rendering stays generic; no research workflow is added to Flutter. Update published metadata to describe web execution, publish a new immutable release and install it through a separate account.

The existing identity backend remains authoritative. Refine the generic authentication boundary with sign-in/registration validation, password confirmation/visibility, pending/error states, autofill support, session restoration and sign-out. Preserve incoming profile links across authentication. The local verification deployment uses Secured posture; unauthenticated API calls cannot act as owner. Do not invent email recovery or external identity providers.

## Implementation and verification

- [x] Browser module: inspect definitions/callers via LSP; add lifecycle/isolation tests before implementation. Provide managed browser lifecycle, network policy, account process isolation and cleanup. Preserve existing desktop tests.
- [x] Authentication: inspect frontend/backend contracts via LSP; test registration/sign-in failures, logout/session restoration and deep links; improve screens using existing dark/mint design tokens. Evaluate server cookie/session boundaries and fix concrete gaps required for this flow.
- [x] C# app: start/release managed browser, show useful live progress/evidence in web, keep verified extraction and bounded model calls. Bump release and compile through normal runtime gate.
- [x] Integration: retain platform volume, encrypted journal, custody keys and database. Stop desktop, enable Secured posture, launch worker prerequisites, rebuild affected projects and reconnect local web proxy.
- [x] End-to-end: fresh account registers through the real identity API, signs in through the UI, opens owner profile, installs exact release and completes real research from web with desktop stopped. A second account cannot read/control the first worker/app. Logout removes session access; restart preserves account/publication/results while browser sessions are transient.
- [x] Review changes, run relevant tests/analyzers, capture UI and runtime proof, document deployment configuration and actual limitations, commit.

## Review focus

No account identifier accepted from app input may choose worker ownership. Browser cookies/storage/pages cannot cross accounts. No raw CDP endpoint is exposed. Navigation/redirects/subresources must not reach private networks. Resource cleanup must run after failures/cancellation and during shutdown. Authentication failures must not strand the shared route or expose anonymous owner. Passwords and session secrets must never appear in logs/screenshots/committed configuration.

## Integration findings

Secured mode initially intercepted the sandbox's session-token HTTP routes before their own authentication. The runtime edge now explicitly uses its own token gate. Callerless programs are bounded to their brain, including bare brain-root keys; stamped programs retain normal authorization and explicitly bound cross-brain connections. Regressions failed before the fix; all 198 C# module tests pass afterward.

A real desktop-free run from the existing recipient account completed on 2026-10-14 at 17:07 UTC, saved Hwaci with six verified source findings, and released its browser. Two concurrent account sessions also proved cross-account denial, public-network enforcement and independent cleanup. Fresh-account UI verification additionally exposed old durable compiled app artifacts after UI contract changes; app reactivation repair is part of this implementation.

The broader Apps suite has eight existing fixture failures, also present in the earlier baseline run (`214 passed / 8 failed`), involving production custody configuration and invalid unscoped storage keys. Do not describe the full repository test suite as green. Focused reactivation regressions and the real persisted-account workflow are the acceptance checks for this repair.

## Final local verification

The separate `web-research-proof` account opened the owner profile in the web UI, forked Customer Researcher 1.3.0 as `customer-researcher-copy`, and clicked Research company for https://www.hwaci.com/. It completed and saved six verified findings with source links. The installed origin and immutable publication digest match the owner release. Its browser reported released afterward. A page reload restored the authenticated session and saved evidence; the incoming profile route also remained valid. No desktop shell resource was running.

Registration validation, duplicate usernames, incorrect passwords, cookie restoration and logout denial were verified against the real identity API; sign-in and sign-out were also exercised in the UI. Two live accounts proved independent browser sessions, denied cross-account access, rejected private-network navigation and independent cleanup.

Validation: C# runtime edge 198 passed; browser module 40 passed / one existing native smoke skipped; hosting 48 passed; Flutter 157 passed and analyzer clean; shipped-app compilation gate passed; two activation/race regression tests passed. All eight broader Apps failures were reproduced with the restoration fix disabled. Final OS build succeeded. Command-local NuGet audit exception and deployment limitations are documented separately.

The runtime also logs a pre-existing metering warning for retained signals without traces: successful behavior acknowledgements cannot attribute their cost. This is unchanged runtime code and does not block research; the usage total should not be represented as complete until that attribution gap is repaired.

A final 1.3.1 patch removes unnecessary visible punctuation escapes in source evidence, passes the shipped-program gate, and was published and applied to the recipient through the normal update route.
The 1.3.1 UI rerun completed with six verified findings, clean punctuation and a released worker. OS, C# sandbox and systemone reported Healthy; no desktop shell process was present.
