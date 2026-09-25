// Slidev merges a `vite.config.*` from each of its roots (this theme and the
// deck's folder) into its own Vite config. Plain object rather than
// `defineConfig`: `vite` isn't a direct dependency of this app, so the config
// can't import it at runtime.
import { fileURLToPath } from 'node:url'
import { snippetsWebhook } from './vite/snippets'
import { meetingsData } from './vite/meetings'

export default {
  // apps/slides/, where the gitignored .env with the webhook URLs lives.
  plugins: [
    snippetsWebhook(fileURLToPath(new URL('..', import.meta.url))),
    meetingsData(),
  ],
}
