import { defineConfig } from 'vitepress';
import { guardDetachedOutline } from './outline-guard.mjs';

const group = (text: string, prefix: string, pages: [string, string][]) => ({
  text,
  items: pages.map(([title, path]) => ({ text: title, link: `/${prefix}/${path}` })),
});
const vision = group('Product Vision', 'vision', [
  ['Overview', ''],
  ['Users & jobs', 'users'],
  ['Market landscape', 'market'],
  ['First applications', 'experience'],
  ['Ecosystem & architecture', 'ecosystem'],
  ['Catalog & marketplace', 'marketplace'],
  ['Open source & business', 'commercial'],
  ['Pricing & unit economics', 'pricing'],
  ['Hypotheses', 'hypotheses'],
]);
const roadmap = group('Product Roadmap', 'roadmap', [
  ['Overview', ''],
  ['Deployment first', 'deployment'],
  ['Workspace & applications', 'core'],
  ['Pilot & validation', 'pilot'],
  ['SDK & developers', 'developers'],
  ['Marketplace launch', 'marketplace'],
  ['Epics & dependencies', 'epics'],
  ['Metrics & stage gates', 'metrics'],
]);
const readiness = group('Implementation Readiness', 'readiness', [
  ['Implementation overview', ''],
  ['Cloud, accounts & Stripe', 'cloud-inventory'],
  ['AI providers', 'providers'],
  ['Connectors & modules', 'integrations'],
  ['Runtime & clients', 'runtime-inventory'],
  ['Every application', 'applications'],
  ['Coverage & status method', 'matrix'],
  ['Architecture map', 'architecture'],
  ['End-to-end flows', 'flows'],
  ['Security & sandbox', 'security'],
  ['Billing & costs', 'billing'],
  ['Deployment & operations', 'operations'],
  ['Verification log', 'verification'],
  ['Risks & backlog', 'backlog'],
]);
const reference = group('Reference', 'reference', [
  ['Evidence & sources', 'evidence'],
  ['Repository relationship', 'repositories'],
  ['Glossary', 'glossary'],
  ['Founder decisions', 'decisions'],
  ['Maintenance', 'maintenance'],
  ['Site verification', 'site-verification'],
]);
const history = {
  text: 'Preserved records',
  collapsed: true,
  items: [
    { text: 'Earlier handbook overview', link: '/product/previous-overview' },
    { text: 'Earlier product vision', link: '/product/vision' },
    { text: 'Requirements', link: '/product/requirements' },
    { text: 'Readiness assessment', link: '/status' },
    { text: 'Cloud migration status', link: '/plans/intochat-cloud-migration-status' },
    { text: 'Cloud migration plan', link: '/plans/intochat-cloud-migration' },
    { text: 'App journey check', link: '/assessment/app-journey-verification-2026-10-16' },
    { text: 'Architecture', link: '/architecture' },
    { text: 'Capabilities', link: '/modules' },
    { text: 'Operations', link: '/getting-started' },
    { text: 'Documentation migration', link: '/documentation-migration' },
  ],
};
export default defineConfig({
  title: 'IntoChat',
  description: 'Universal AI workspace · Product vision, roadmap and evidence-backed implementation readiness',
  base: '/digitalbrain.docs/',
  cleanUrls: true,
  appearance: false,
  vite: {
    plugins: [{ name: 'guard-detached-vitepress-outline', enforce: 'pre', transform: guardDetachedOutline }],
  },
  srcExclude: ['README.md', 'archive/**', 'docs/**'],
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        if (tokens[index].info.trim() === 'mermaid') {
          const source = md.utils.escapeHtml(JSON.stringify(tokens[index].content));
          return `<MermaidDiagram :source="${source}" />`;
        }
        return fence(tokens, index, options, env, self);
      };
    },
  },
  themeConfig: {
    logo: '/intochat-mark.svg',
    nav: [
      { text: 'Product Vision', link: '/vision/' },
      { text: 'Product Roadmap', link: '/roadmap/' },
      { text: 'Implementation Readiness', link: '/readiness/' },
    ],
    sidebar: [vision, roadmap, readiness, reference, history],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    docFooter: { prev: 'Previous document', next: 'Continue reading' },
    footer: {
      message: 'Code is evidence of implementation. Executed checks are evidence of tested behavior.',
      copyright: 'IntoChat product handbook · Evidence reviewed 17 October 2026',
    },
  },
});
