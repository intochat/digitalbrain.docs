# Documentation website verification

**Executed locally · 17 October 2026.** This record concerns the documentation website. It does not turn application code, tests or proposed strategy into a production-readiness claim. Product check commands and exclusions remain in the [application verification log](../readiness/verification.md).

## Artifact and preservation

### Implementation-inventory correction · 17 October 2026

The readiness landing page was rebuilt around feature implementation, with independent local/external and production verification fields. Added four inventory pages (cloud, AI providers, runtime/clients, all applications), expanded the existing connectors page, replaced the broad matrix with a source coverage map, and corrected the billing page to foreground implemented Stripe services. Navigation and the homepage readiness section now point to these inventories.

Fresh documentation checks passed: `npm run typecheck`, `npm test` (3 tests), `npm run lint`, `npm run build`, and `npm run check:links` (**66 HTML pages, 4,277 internal links/fragments**). This supersedes the earlier 62-page link count below. The existing diagram chunk-size advisory remains. No product test was rerun or promoted to a live/production result by this correction.

Browser verification confirmed the new Stripe/provider statuses and navigation on the rebuilt preview. The overview and all five detailed inventory pages had no document-level horizontal overflow at 390×844 (375 CSS-pixel content width); wide tables scroll within the page. Desktop overview was visually reviewed at 1440×900. All 20 application rows rendered. This is documentation UI verification, not execution of those applications.

The existing VitePress project and `/digitalbrain.docs/` base path were retained. The homepage is a custom Vue component with exactly four top-level sections and stable anchors: `vision`, `ecosystem`, `priorities`, `readiness`. Three primary navigation destinations lead to Product Vision, Product Roadmap and Implementation Readiness.

Existing documentation routes remain available. The previous homepage is preserved as [the earlier overview](../product/previous-overview.md), with relative links adjusted for its new location. Earlier documents display a notice linking to the current synthesis. Pre-existing working changes and deletions were not reverted. No application source change, commit, push or external publication was made by this task.

The visual reference was inspected as source and in the browser. Its paper/ink/cobalt/lime palette, oversized tight headings, dark rounded diagram panel and restrained composition inform the theme. Its sample deadlines and metrics were not copied as product facts.

## Build and tooling

Environment: Windows, Node `26.8.1`, npm `11.19.0`, VitePress `1.6.4`. TypeScript is constrained to `5.9.3` compatibility because the current Vue type checker failed against TypeScript 7's removed `lib/tsc` export. The existing VitePress architecture remains; a Vite `6.4.4` override addresses dependency advisories and is covered by build/browser checks. Both preview commands bind to loopback.

| Check | Outcome and scope |
| --- | --- |
| `npm run typecheck` | Vue/TypeScript configuration and components pass |
| `npm test` | Three compatibility regression cases pass: detached outline refs, normal marker reset, unrelated-source preservation |
| `npm run lint` | Prettier check passes for theme, VitePress configuration and TypeScript configuration; this is a formatting check, not a separate ESLint ruleset |
| `npm run build` | Static generation passes, including VitePress Markdown dead-link checks |
| `npm run check:links` | Passed: 62 emitted HTML pages and 3,727 internal links/fragments; exactly four homepage sections and three destination landing pages |
| `npm audit` | Zero known dependency vulnerabilities after compatible updates; this is a registry advisory check, not a security certification |

The build reports a large-chunk advisory from diagram-related dependencies. Mermaid is dynamically imported only when a diagram mounts; the homepage uses lightweight HTML/CSS diagrams. No remote fonts, paid assets or external rendering services are required.

## Browser review

The local in-app browser was used at desktop and mobile viewport sizes, including requested 1440×900 and 390×844 viewports. Scrollbar space produces a slightly narrower measured content area. The reference and result were visually compared.

- All four Learn more buttons were clicked and reached their substantive destination pages. Browser back navigation returned to the homepage.
- Stable section links update the URL; active-section feedback follows the visible section after smooth scrolling. Keyboard Enter activates section navigation and a visible focus outline remains.
- Mobile homepage and all 14 new diagram-containing pages had no document-level horizontal overflow. The dense readiness table scrolls within its own width rather than widening the page.
- All **15 new Mermaid diagrams** rendered without error across those 14 pages. Diagrams retain readable intrinsic sizing inside focusable horizontal scrolling containers and expose source text alternatives.
- Representative Product Vision, ecosystem and readiness matrix pages were visually inspected on mobile; desktop homepage sections and detailed-page navigation were reviewed.
- The browser error/warning log was empty for the inspected diagram route.

## Motion and accessibility limits

Content is visible in server-rendered HTML before any animation runs. IntersectionObserver only adds a short entrance transform and active-section indication; it does not hide content. The `prefers-reduced-motion: reduce` CSS branch disables animation, transitions and smooth scrolling. The current browser reported reduced motion **false**; an OS preference toggle was not performed. This is source-rule verification, not a claim of browser emulation under that preference.

Responsive reflow was reviewed at narrow widths. Actual browser zoom and a full screen-reader session were not automated. Keyboard navigation, focus, semantic links/headings, readable diagram text and overflow behavior were checked within the available browser controls. These limits should remain explicit in any accessibility handoff.

## Repairs discovered during verification

1. An earlier migration plan contained raw `Result<T>` text interpreted as unclosed Vue tags. Escaping angle brackets preserves the text and restores compilation.
2. Old dynamic localhost addresses in a historical migration log were auto-linked as site routes. They are now code-formatted historical values.
3. The first custom homepage inherited the documentation sidebar. Homepage frontmatter now disables it, while detailed pages keep their navigation.
4. Mermaid labels inherited long prose line-height and diagrams shrank too far on mobile. Scoped line-height and intrinsic SVG dimensions resolve clipping and tiny text.
5. Independent content review corrected clean runtime provenance, clarified revised proposed pilot thresholds, routed architecture links to current evidence and distinguished cloud payment code from unverified settlement.
6. Rapid navigation exposed an upstream VitePress 1.6 outline callback touching a detached marker. A narrowly scoped Vite transform guards absent refs; a regression test reproduced the exact null-style error before the guard and passes afterwards. Review this compatibility guard when upgrading VitePress.

## Repeat the site checks

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run check:links
npm audit
npm run preview -- --port 4173
```

Open the base path `/digitalbrain.docs/`. Runtime and cloud audit commands belong to their respective repositories. Do not run production deployment or migrations as part of a documentation refresh. Follow the [maintenance procedure](maintenance.md) to update sources, dates and status claims together.
