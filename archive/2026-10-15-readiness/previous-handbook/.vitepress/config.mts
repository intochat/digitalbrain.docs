import { defineConfig } from 'vitepress'

const siteBase = '/digitalbrain.docs/'

export default defineConfig({
  title: 'DigitalBrain',
  description: 'Current handbook for the durable DigitalBrain workspace on Orleans and Aspire',
  base: siteBase,
  cleanUrls: true,
  srcExclude: ['README.md', 'docs/**'],
  sitemap: {
    hostname: 'https://intochat.github.io/digitalbrain.docs/'
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${siteBase}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#080a12' }]
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Start', link: '/getting-started' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'CoreV2', link: '/architecture/corev2' },
      { text: 'Modules', link: '/modules' },
      { text: 'Status', link: '/status' },
      { text: 'GitHub', link: 'https://github.com/intochat/digitalbrain' }
    ],
    sidebar: [
      {
        text: 'Start',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Run locally', link: '/getting-started' },
          { text: 'Concepts', link: '/concepts' }
        ]
      },
      {
        text: 'Architecture',
        items: [
          { text: 'System map', link: '/architecture' },
          { text: 'CoreV2 framework', link: '/architecture/corev2' },
          { text: 'Kernel runtime', link: '/architecture/kernel-runtime' },
          { text: 'Module system', link: '/architecture/module-system' },
          { text: 'Scripting', link: '/architecture/scripting' },
          { text: 'Chat and execution', link: '/architecture/chat-execution' },
          { text: 'Hosting and security', link: '/architecture/hosting-security' }
        ]
      },
      {
        text: 'Product',
        items: [
          { text: 'Modules', link: '/modules' },
          { text: 'Current status', link: '/status' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'HTTP surface', link: '/reference/http-surface' },
          { text: 'Wire contracts', link: '/reference/wire-contracts' }
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
      message: 'Current-source handbook for the private, durable DigitalBrain workspace.',
      copyright: 'DigitalBrain contributors'
    },
    outline: {
      level: [2, 3],
      label: 'On this page'
    }
  }
})
