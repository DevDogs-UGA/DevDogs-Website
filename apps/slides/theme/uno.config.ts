import { defineConfig } from 'unocss'

// Exposes the DevDogs accent tokens as UnoCSS utilities (text-accent-emerald,
// bg-accent-cyan, border-accent-amber, ...) for use in layouts/components.
// Keep in sync with theme/accents.ts (single source of truth for the hexes).
export default defineConfig({
  theme: {
    colors: {
      accent: {
        purple: '#C27AFF',
        cyan: '#00D3F2',
        amber: '#FFB900',
        emerald: '#00D492',
        red: '#FF6467',
        sky: '#00BCFF',
      },
      dd: {
        bg: '#0c090c',
        panel: '#131317',
        ink: '#f5f5f7',
        muted: '#9a9aa2',
        // The three template greys — see theme/accents.ts GREYS.
        support: '#A89EA9',
        secondary: '#D7D0D7',
        dim: '#79697B',
      },
    },
    fontFamily: {
      heading: '"Alan Sans", "Hanken Grotesk", sans-serif',
    },
  },
})
