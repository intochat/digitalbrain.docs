# IntoChat OS documentation

Public documentation for [IntoChat OS](https://github.com/intochat/os), an open-source AI-native operating system built on .NET and Orleans. The site is built with VitePress and deployed to Azure Static Web Apps on every push to `main`.

Internal plans and product material live in a private handbook repository, not here.

## Local development

```sh
npm ci
npm run dev -- --port 4173
```

Open `http://127.0.0.1:4173/`. To verify the static artifact:

```sh
npm run typecheck
npm run lint        # npm run format fixes formatting
npm test
npm run build
npm run check:links
npm run preview -- --port 4173
```

## Layout

- `index.md`, `getting-started.md`, `concepts.md`, `architecture.md`, `modules.md`, `contributing.md`: the main pages.
- `reference/`: glossary, testing and release notes.
- `.vitepress/`: configuration, theme and the Mermaid component.

Licensed under the MIT License.
