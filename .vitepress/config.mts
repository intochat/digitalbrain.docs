import { defineConfig } from 'vitepress';
import { guardDetachedOutline } from './outline-guard.mjs';

export default defineConfig({
  title: 'DigitalBrain',
  description: 'Open-source C# framework for building AI-native reactive apps and modular neuron systems',
  base: '/digitalbrain.docs/',
  cleanUrls: true,
  appearance: false,
  vite: {
    plugins: [{ name: 'guard-detached-vitepress-outline', enforce: 'pre', transform: guardDetachedOutline }],
  },
  srcExclude: ['README.md'],
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
      { text: 'Guide', link: '/getting-started' },
      { text: 'Apps (App<TState>)', link: '/apps' },
      { text: 'BDD Scenarios', link: '/bdd-scenarios' },
      { text: 'Modules', link: '/modules' },
      { text: 'GitHub', link: 'https://github.com/intochat/digitalbrain' },
    ],
    sidebar: [
      {
        text: 'Framework Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Neurons & Signals', link: '/neurons-and-signals' },
          { text: 'Apps (App<TState>)', link: '/apps' },
          { text: 'BDD Scenarios (IBdd)', link: '/bdd-scenarios' },
          { text: 'DDD Modules (ModuleManifest)', link: '/modules' },
          { text: 'Calculator Example', link: '/calculator-example' },
          { text: 'Packages & Topologies', link: '/packages' },
        ],
      },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    docFooter: { prev: 'Previous', next: 'Next' },
    footer: {
      message: 'DigitalBrain · Open-source C# framework for AI-native apps',
      copyright: 'MIT Licensed · IntoChat',
    },
  },
});
