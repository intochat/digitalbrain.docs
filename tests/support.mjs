import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))

export const docsRoot = resolve(testDirectory, '..')

export const read = (...segments) => readFileSync(join(docsRoot, ...segments), 'utf8')

export const linkedPages = () => {
  const config = read('.vitepress', 'config.mts')
  const links = [...config.matchAll(/link:\s*'(\/[^']*)'/g)].map(match => match[1])
  return [...new Set(links)].map(link => ({
    link,
    page: link === '/' ? 'index.md' : `${link.replace(/^\//, '')}.md`,
  }))
}
