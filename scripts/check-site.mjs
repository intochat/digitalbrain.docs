import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.vitepress/dist');
const base = '/';
const pages = [];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) await collect(target);
    else if (item.name.endsWith('.html')) pages.push(target);
  }
}
await collect(root);
const html = new Map(await Promise.all(pages.map(async (file) => [file, await readFile(file, 'utf8')])));
const errors = [];
let checked = 0;
for (const [file, source] of html) {
  const route = base + path.relative(root, file).replaceAll('\\', '/');
  for (const match of source.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(href)) continue;
    const url = new URL(href, `https://local.invalid${route}`);
    if (!url.pathname.startsWith(base)) {
      errors.push(`${route}: outside base ${href}`);
      continue;
    }
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    const stem = path.join(root, relative);
    const candidates =
      relative.endsWith('/') || !relative
        ? [path.join(stem, 'index.html')]
        : [stem, stem + '.html', path.join(stem, 'index.html')];
    let target;
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isFile()) {
          target = candidate;
          break;
        }
      } catch {}
    }
    if (!target) {
      errors.push(`${route}: missing ${href}`);
      continue;
    }
    if (url.hash && html.has(target)) {
      const fragment = decodeURIComponent(url.hash.slice(1));
      if (!html.get(target).includes(`id="${fragment}"`)) errors.push(`${route}: missing fragment ${href}`);
    }
    checked++;
  }
}
const home = html.get(path.join(root, 'index.html'));
assert.ok(home, 'Built homepage exists');
assert.ok(home.includes('Get started'), 'Homepage has the Get started action');
for (const route of [
  'getting-started.html',
  'concepts.html',
  'architecture.html',
  'modules.html',
  'write-a-module.html',
  'contributing.html',
  '404.html',
])
  assert.ok(html.has(path.join(root, route)), `Destination ${route} exists`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${pages.length} HTML pages; ${checked} internal links/fragments; homepage and primary pages present.`,
  );
