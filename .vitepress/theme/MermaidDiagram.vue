<script setup lang="ts">
import { onMounted, ref, useId } from 'vue';
const props = defineProps<{ source: string }>();
const svg = ref('');
const error = ref(false);
const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
onMounted(async () => {
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        primaryColor: '#e3e9ff',
        primaryTextColor: '#14161a',
        primaryBorderColor: '#2457ff',
        lineColor: '#656a72',
        secondaryColor: '#effbc7',
        tertiaryColor: '#f3f2ee',
        fontFamily: 'Inter, sans-serif',
      },
    });
    const rendered = (await mermaid.render(id, props.source)).svg;
    const document = new DOMParser().parseFromString(rendered, 'image/svg+xml');
    const element = document.documentElement;
    const width = Number(element.getAttribute('viewBox')?.split(/\s+/)[2]);
    if (Number.isFinite(width) && width > 0) element.setAttribute('style', `width:${width}px;max-width:none`);
    svg.value = element.outerHTML;
  } catch {
    error.value = true;
  }
});
</script>

<template>
  <figure class="diagram-block">
    <figcaption class="diagram-hint">
      Scroll horizontally to explore wide diagrams. A text alternative follows.
    </figcaption>
    <div
      v-if="svg"
      class="diagram-canvas"
      role="region"
      tabindex="0"
      aria-label="Relationship diagram. Scroll horizontally if needed; text equivalent follows."
      v-html="svg"
    />
    <p v-if="error" role="status">The visual could not render. The complete diagram source is available below.</p>
    <details :open="!svg">
      <summary>Diagram source / text alternative</summary>
      <pre>{{ source }}</pre>
    </details>
  </figure>
</template>
