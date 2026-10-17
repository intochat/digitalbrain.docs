import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import HandbookLayout from './HandbookLayout.vue';
import HomePresentation from './HomePresentation.vue';
import MermaidDiagram from './MermaidDiagram.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: HandbookLayout,
  enhanceApp({ app }) {
    app.component('HomePresentation', HomePresentation);
    app.component('MermaidDiagram', MermaidDiagram);
  },
} satisfies Theme;
