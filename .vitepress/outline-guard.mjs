/** @param {string} code @param {string} id */
export function guardDetachedOutline(code, id) {
  if (!id.replaceAll('\\', '/').endsWith('/vitepress/dist/client/theme-default/composables/outline.js')) return code;
  const signature = 'function activateLink(hash) {';
  if (!code.includes(signature))
    throw new Error('VitePress outline changed: review the detached-outline compatibility guard.');
  return code.replace(signature, `${signature}\n        if (!container.value || !marker.value) return;`);
}
