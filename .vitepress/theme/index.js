import DefaultTheme from 'vitepress/theme'
import ArchitectureMap from './ArchitectureMap.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ArchitectureMap', ArchitectureMap)
  },
}
