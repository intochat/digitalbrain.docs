<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
const { page } = useData();
const historical = computed(
  () => !/^(index\.md|vision\/|roadmap\/|readiness\/|reference\/)/.test(page.value.relativePath),
);
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-before>
      <aside v-if="historical" class="history-notice">
        <strong>Preserved implementation record</strong>
        <p>
          This page retains earlier terminology, decisions and dated checks. Use the
          <a :href="withBase('/readiness/')">current readiness assessment</a> and
          <a :href="withBase('/vision/')">IntoChat product direction</a> for the current synthesis.
        </p>
      </aside>
      <p v-else class="document-kicker">INTOCHAT / PRODUCT HANDBOOK <span>17 OCT 2026</span></p>
    </template>
  </DefaultTheme.Layout>
</template>
