# IntoChat handbook implementation plan

**Goal:** Complete the evidence-backed VitePress handbook and four-section presentation homepage in the existing checkout.
**Architecture:** Extend VitePress with a custom Vue homepage, shared paper/ink/cobalt/lime theme, and locally rendered Mermaid diagrams. Preserve existing routes and working changes; add vision, roadmap, readiness and reference destinations.
**Spec:** `2026-10-17-intochat-brief.txt` (complete user brief).
**Constraints:** Local only; no push, publication, paid workloads, production migration or unrelated application edits. Explicit autonomous execution supersedes routine skill approval pauses. Work in the requested dirty checkout; preserve original files before replacing entry points.

## Execution and ownership
- [x] Inventory existing content, git state and reference source; render reference in browser.
- [x] Audit DigitalBrain: dedicated agent owns readiness pages; source locations, current counts, safe checks and limits.
- [x] Audit cloud and presentation: dedicated agent owns reference pages; reconcile repositories and provenance.
- [x] Research market and product: dedicated agent owns vision pages; primary citations and proposed decisions.
- [x] Root: implement homepage/theme/navigation and Mermaid; preserve historical routes with context notices.
- [x] Root: write deployment-first roadmap, epic contracts, stage gates and metric definitions.
- [x] Root: integrate evidence, review claims and links; run build, type/lint checks and rendered-page checks.
- [x] Independent final review, fix findings and record verification limitations.

## Review focus
1. Mobile and zoom: no fixed-height clipping, horizontal page overflow or unreadable diagrams.
2. Browser history and keyboard anchors: stable IDs, visible focus and header clearance.
3. Motion unavailable/reduced: all content visible and usable.
4. Historical evidence: prior checks never silently reclassified as new executed checks.
5. Existing dirty work: no destructive replacement, deletion or application changes.

## Decision ledger
- 2026-10-17: Existing VitePress 1.6 project retained; base `/digitalbrain.docs/` retained for route compatibility.
- 2026-10-17: English primary narrative follows existing handbook; required destinations use English names with Russian aliases on landing pages.
- 2026-10-17: Previous homepage/config and tracked diff backed up in system temporary directory. Existing detailed pages remain addressable and discoverable.
- 2026-10-17: No commits made, avoiding accidental inclusion of pre-existing user work.
- 2026-10-17: Final reviewer identified four content issues; all corrected: runtime clean provenance, revised pilot-proposal explanation, current architecture links and cloud payment-code qualification.
- 2026-10-17: Build/typecheck/format checks pass; link checker validates 62 pages and 3,727 internal targets. All 15 new diagrams render. Mobile clipping fixed by intrinsic SVG sizes and scoped line-height. OS reduced-motion toggle, actual browser zoom and full screen-reader testing remain explicitly unexecuted; responsive and keyboard checks performed.
