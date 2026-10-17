# Persistent sharing and launcher implementation plan

**Goal:** Keep marketplace publications across a full local host restart; let a separate authenticated account open a profile link and install an exact app release; verify actual research execution; fix launcher alignment and filtering.

**Architecture:** Retain the existing platform storage volume and encrypted brain journal. C# apps own profile content and eligible launcher apps. Flutter handles generic navigation, option rendering/search and authentication. Profile links use the current origin for future deployment.

**Scope:** User authorized implementation and separate-account verification. Local hosting for now, production readiness documented rather than public exposure.

- [x] Preserve platform storage in an explicit named volume; add marketplace restart/authority regression; restart AppHost and verify listing plus recipient login without republishing.
- [x] Add generic open-only links that preserve target through authentication; render profile/publication links in C# Circle; test invalid links and recipient brain isolation.
- [x] Filter launcher to presentable apps in C#, sort deterministically; align icon/label slots and add generic option search; test search and empty results.
- [x] Authenticate separate `sharing-guest` account, open owner profile, install exact Customer Researcher release, open it and run a real research job using its own browser/model/storage.
- [x] Check telemetry and source-backed result; validate owner private state remains inaccessible; document deployment boundaries.
- [x] Run affected tests/analyzers, inspect live UI, review changes, commit.

Verification and deployment boundaries: `docs/superpowers/reviews/2026-10-14-sharing-deployment.md`.

**Production requirements:** Stable HTTPS origin, durable platform storage and encrypted journal with retained keys, authenticated account entry points, configured model and database, and a supported browser connector. Do not expose development anonymous-owner posture or dev tooling publicly.

**Review focus:** Restart must retain account credentials and publication index; links cannot dispatch arbitrary operations or select another brain; installs preserve exact release and omit publisher connections; launcher must retain user apps while hiding infrastructure; research must report real evidence rather than a simulated result.
