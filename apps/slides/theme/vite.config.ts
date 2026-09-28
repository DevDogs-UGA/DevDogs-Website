// Slidev merges a `vite.config.*` from each of its roots (this theme and the
// deck's folder) into its own Vite config. Plain object rather than
// `defineConfig`: `vite` isn't a direct dependency of this app, so the config
// can't import it at runtime.
import { fileURLToPath } from 'node:url'
import { readEnv, snippetsWebhook } from './vite/snippets'
import { checkpoints } from './vite/checkpoint'
import { meetingsData } from './vite/meetings'

// apps/slides/, where the gitignored .env (webhook URLs, demo laptop setup)
// lives.
const envDir = fileURLToPath(new URL('..', import.meta.url))
const env = readEnv(envDir)

export default {
  plugins: [snippetsWebhook(envDir), checkpoints(envDir), meetingsData()],
  // A demo laptop's deck (`pnpm follow`) follows the live relay at
  // SLIDES_LIVE_URL as SLIDES_TRACK (lib/live.ts). The hosted build ignores
  // both: it uses its own origin.
  define: {
    __DD_LIVE_URL__: JSON.stringify(env.SLIDES_LIVE_URL ?? ''),
    __DD_TRACK__: JSON.stringify(env.SLIDES_TRACK ?? ''),
  },
}
