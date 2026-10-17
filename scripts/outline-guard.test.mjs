import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { guardDetachedOutline } from '../.vitepress/outline-guard.mjs';

const id = '/node_modules/vitepress/dist/client/theme-default/composables/outline.js';
const source = await readFile(`.${id}`, 'utf8');
function activateFunction(code) {
  const start = code.indexOf('function activateLink(hash) {');
  let depth = 0;
  const brace = code.indexOf('{', start);
  for (let index = brace; index < code.length; index++) {
    if (code[index] === '{') depth++;
    if (code[index] === '}' && --depth === 0) return code.slice(start, index + 1);
  }
  throw new Error('Outline function not found');
}

test('delayed outline update after navigation tolerates detached refs', () => {
  const code = guardDetachedOutline(source, id);
  const invoke = new Function(
    'container',
    'marker',
    'prevActiveLink',
    `${activateFunction(code)}; activateLink(null);`,
  );
  assert.doesNotThrow(() => invoke({ value: null }, { value: null }, null));
});

test('attached outline still resets its marker', () => {
  const code = guardDetachedOutline(source, id);
  const marker = { value: { style: {} } };
  const invoke = new Function(
    'container',
    'marker',
    'prevActiveLink',
    `${activateFunction(code)}; activateLink(null);`,
  );
  invoke({ value: {} }, marker, null);
  assert.deepEqual(marker.value.style, { top: '33px', opacity: '0' });
});

test('unrelated source is unchanged', () => {
  assert.equal(guardDetachedOutline(source, '/other/outline.js'), source);
});
