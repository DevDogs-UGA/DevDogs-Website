// Slidev merges a `vite.config.*` from each of its roots (this theme and the
// deck's folder) into its own Vite config. Plain object rather than
// `defineConfig`: `vite` isn't a direct dependency of this app, so the config
// can't import it at runtime.
import { fileURLToPath } from 'node:url'
import { readEnv, snippetsWebhook } from './vite/snippets'
import { meetingsData } from './vite/meetings'

// apps/slides/, where the gitignored .env (webhook URLs, tunnel hostname,
// presenter password) lives.
const envDir = fileURLToPath(new URL('..', import.meta.url))

// The Cloudflare Tunnel hostname the follower laptops reach this dev server
// through (LAYOUTS.md, "Presenting across two laptops"). Vite rejects Host
// headers it doesn't recognize, so the tunnel's host has to be allow-listed.
const tunnelHostname =
  readEnv(envDir).SLIDES_TUNNEL_HOSTNAME || 'slides.devdogsuga.org'

export default {
  plugins: [snippetsWebhook(envDir), meetingsData()],
  server: {
    allowedHosts: [tunnelHostname],
  },
}
