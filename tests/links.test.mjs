import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { docsRoot, linkedPages } from './support.mjs'

test('every page the site links to exists', () => {
  const pages = linkedPages()
  assert.ok(pages.length > 0, 'the site must link to at least one page')

  for (const { link, page } of pages) {
    assert.ok(existsSync(join(docsRoot, page)), `${link} points at a missing ${page}`)
  }
})
