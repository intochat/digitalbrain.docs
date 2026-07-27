# digitalbrain.docs

The VitePress site published at [digitalbrain.tech](https://digitalbrain.tech).

The product itself lives in [intochat/digitalbrain](https://github.com/intochat/digitalbrain). Code and
tests are the source of truth there; this repository carries only the public site.

## Working on the site

```bash
npm ci
npm test          # node --test tests/*.test.mjs
npm run dev       # local preview
npm run build     # vitepress build -> .vitepress/dist
```

`npm test` must pass before the site builds — it holds two invariants:

- every page the navigation links to exists;
- every module in the architecture diagram is typed, links to a section that exists, and composes
  only vocabulary the diagram itself declares as shipped.

## Publishing

`.github/workflows/pages.yml` builds on every push to `main` and deploys to GitHub Pages. The custom
domain is pinned by `public/CNAME`.

## Pages

| File | Page |
| --- | --- |
| `index.md` | landing |
| `quickstart.md` | first neuron and synapse |
| `concepts.md` | neurons, synapses, modules, behaviors |
| `architecture.md` | vision, module status, ratified rules, rejected shapes |
| `specification.md` | published specification |
| `contributing.md` | contributing and the Pages/DNS setup |
