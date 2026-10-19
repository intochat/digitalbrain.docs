import { defineConfig } from 'vitepress';
import { guardDetachedOutline } from './outline-guard.mjs';

export default defineConfig({
  title: 'IntoChat OS',
  description: 'An open-source, AI-native operating system: a runtime for AI apps and agents on .NET and Orleans.',
  base: '/',
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
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Modules', link: '/modules' },
      { text: 'Write a module', link: '/write-a-module' },
      { text: 'Contributing', link: '/contributing' },
      {
        text: 'Reference',
        items: [
          { text: 'Glossary', link: '/reference/glossary' },
          { text: 'Release 0.3.0', link: '/reference/releases/os-0.3.0' },
          { text: 'Testing', link: '/reference/testing' },
        ],
      },
      { text: 'GitHub', link: 'https://github.com/intochat/os' },
    ],
    sidebar: [
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Modules', link: '/modules' },
      { text: 'Write a module', link: '/write-a-module' },
      { text: 'Contributing', link: '/contributing' },
      {
        text: 'Reference',
        items: [
          { text: 'Glossary', link: '/reference/glossary' },
          { text: 'Release 0.3.0', link: '/reference/releases/os-0.3.0' },
          { text: 'Testing', link: '/reference/testing' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/intochat/os' }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    docFooter: { prev: 'Previous', next: 'Next' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'IntoChat OS · open source',
    },
  },
});
