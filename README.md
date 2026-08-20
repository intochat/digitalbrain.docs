# digitalbrain.docs

The VitePress handbook published at [intochat.github.io/digitalbrain.docs](https://intochat.github.io/digitalbrain.docs/). Product source
lives in [intochat/digitalbrain](https://github.com/intochat/digitalbrain); this repository owns the
public explanation, navigation, and GitHub Pages build only.

## Work on the site

```bash
npm ci --no-audit --no-fund
npm run dev
npm run build
```

`npm run build` creates `.vitepress/dist`, checks internal links, renders every page, and generates
the sitemap. There is no documentation test command in the current no-test phase, and no new npm
package should be added without an explicit product-owner grant.

## Source authority

When sources disagree, use this order:

1. committed production source on the current `intochat/digitalbrain` `master` branch;
2. that product repository's `plans/RATIFIED-PRODUCT-DEFINITION.md` for intent, clearly labelled
   when it is future;
3. its `plans/stage1/reports/Stage1-exit-audit.md` for live-smoke evidence and verified limitations;
4. this site, which explains but never overrides the three sources above.

Do not publish an uncommitted product experiment as shipped architecture. Preserve unrelated dirty
work in either repository and stop if it overlaps the page being changed.

Every status-bearing page uses three explicit labels:

- **Implemented now** for behavior present in production source;
- **Known limitation** for an incomplete or unsafe current seam;
- **Ratified next** for approved direction that is not shipped.

## Page ownership

| Page | Owns |
| --- | --- |
| `index.md` | Product entry and current-state warning |
| `getting-started.md` | Real Aspire startup, bootstrap, local auth, persistence, and shutdown |
| `concepts.md` | Current ubiquitous language |
| `architecture.md` | System map and responsibility boundaries |
| `architecture/kernel-runtime.md` | Neuron, journal, outbox, capability, and graph mechanics |
| `architecture/module-system.md` | Contract/runtime/hosting composition |
| `architecture/scripting.md` | Out-of-process cluster clients and generated file-based C# apps |
| `architecture/chat-execution.md` | Authenticated chat through durable Execution |
| `architecture/hosting-security.md` | Aspire graph, identity, OAuth, and host boundaries |
| `modules.md` | Source-linked module inventory |
| `reference/http-surface.md` | Route-map-derived HTTP/MCP surface |
| `reference/wire-contracts.md` | Permanent aliases and identity compatibility |
| `status.md` | Implemented, limited, and ratified-next inventories |
| `contributing.md` | Current change and verification discipline |

Design and implementation records for this refit live under `docs/superpowers/`; they are project
history, not alternate product architecture.

## Publishing

`.github/workflows/pages.yml` installs with Node.js 24, runs the VitePress production build on pull
requests and pushes to `main`, and deploys non-pull-request builds to GitHub Pages at
`https://intochat.github.io/digitalbrain.docs/`. VitePress `base` is `/digitalbrain.docs/` so asset
and page URLs resolve on the default project-pages host. The logo remains in `public/logo.svg`.
