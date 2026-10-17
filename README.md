# IntoChat product handbook

This repository owns the product vision, requirements, architecture assessment, implementation status and readiness plan.

Start with [the four-section homepage](index.md), [Product Vision](vision/index.md), [Product Roadmap](roadmap/index.md) and [Implementation Readiness](readiness/index.md). DigitalBrain is the existing technical platform; the sibling intochat-cloud repository supplies the cloud control plane. See [repository boundaries](reference/repositories.md).

Current statements must distinguish implemented source, dated live observations, proposed requirements and unresolved product decisions. The evidence register identifies the reviewed source revision.

Previous documentation and pre-existing working edits are preserved under archive/2026-10-15-readiness and excluded from the active VitePress site. See documentation-migration.md.

The October 15 assessment did not run a site build or publish. The October 17 update explicitly authorized safe local builds, tests and browser checks; [site verification](reference/site-verification.md) and [application verification](readiness/verification.md) record their scope and limitations. Historical requirements and assessments remain addressable with a preserved-record notice.

## Local development

```sh
npm ci
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173/digitalbrain.docs/`. Development and preview bind to loopback. To verify the static artifact:

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm run check:links
npm audit
npm run preview -- --port 4173
```

The lint command checks formatting; Vue type checking and built-link validation are separate. The lockfile pins the reviewed dependency graph. VitePress stays on its existing stable architecture with a patched Vite 6 override; TypeScript 5.9 is required by the current Vue checker. See [maintenance](reference/maintenance.md) before updating evidence or dependency versions. No external publication or push is part of this update.
