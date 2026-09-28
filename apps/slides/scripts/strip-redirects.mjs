// `pnpm run deploy`, between the build and `wrangler deploy`: drop the
// Netlify-style SPA rule Slidev writes to decks/dist/_redirects. Workers
// reads that file as its own redirect config and rejects the rule as a loop;
// the Worker's `not_found_handling` (wrangler.jsonc) does the same job.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

rmSync(fileURLToPath(new URL('../decks/dist/_redirects', import.meta.url)), { force: true })
