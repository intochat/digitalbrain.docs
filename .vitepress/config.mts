import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'DigitalBrain',
  description: 'Neurons, synapses, and TestBrain — durable agents for .NET on Orleans and Aspire',
  base: '/',
  cleanUrls: true,
  sitemap: {
    hostname: 'https://digitalbrain.tech'
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#080a12' }]
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Specification', link: '/specification' }
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Concepts', link: '/concepts' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Specification', link: '/specification' }
        ]
      },
      {
        text: 'Project',
        items: [
          { text: 'Contributing', link: '/contributing' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/intochat/digitalbrain' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'The v2 foundation is being rebuilt in the open. Nothing is published yet.',
      copyright: 'DigitalBrain contributors'
    },
    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  }
})
