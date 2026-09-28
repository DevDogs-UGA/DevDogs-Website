// What `wrangler types` can't see in wrangler.jsonc (worker-configuration.d.ts
// covers the rest).
interface Env {
  // Secrets; the Discord endpoint answers 503 while either is unset.
  DISCORD_SNIPPETS_WEBHOOK_WEB?: string
  DISCORD_SNIPPETS_WEBHOOK_MOBILE?: string
  // Only from `pnpm run dev:worker` (worker/access.ts).
  ACCESS_LOCAL_DEV?: string
}
