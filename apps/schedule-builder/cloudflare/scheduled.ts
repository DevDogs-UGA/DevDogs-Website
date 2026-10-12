/// <reference path="../cloudflare-env.d.ts" />
/**
 * Cloudflare cron dispatcher, replacing the vercel.json crons.
 * cloudflare/worker.ts composes it into the deployed worker, the same pattern
 * the platform app uses.
 *
 * Nothing is scheduled today. The daily registrar scrape that used to run here
 * (as a native Workflow schedule) moved to the catalog Worker (apps/catalog),
 * which owns what is scraped from UGA's sites. The route-dispatch mechanism and
 * its `devtools cron` audit stay wired for whenever a route-based cron exists
 * again.
 */
import type { env } from "~/env";

/**
 * The bindings this handler reads. `CRON_SECRET`/`BASE_URL` are derived from
 * the env schema rather than restated -- a hand-written interface cannot fail
 * the build when the schema never declared the key. That is how `BASE_URL`
 * was read here for a while with no manifest supplying it, making every run
 * throw `Invalid URL`. The import is type-only, so nothing lands in the Worker
 * bundle.
 */
export type CronEnv = Pick<typeof env, "CRON_SECRET" | "BASE_URL">;

/**
 * Cron expression to the routes it fires and a one-line description.
 *
 * Route-group segments in parentheses contribute no URL segment, so the
 * handlers under `src/app/(api)/cron/...` are served at `/cron/...`.
 *
 * Keyed by expression so `devtools cron list` can reconcile this map against
 * `wrangler.jsonc triggers.crons` and fire each key's routes as a faithful
 * tick. A flat array and a wildcard `event.cron` match would double-fire every
 * route if a second schedule were ever added — the keyed shape closes that bug.
 *
 * Empty on purpose; see the note at the top of the file.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {};

export async function scheduled(
  event: { cron: string },
  env: CronEnv,
): Promise<void> {
  const entry = CRON_ROUTES[event.cron];
  if (!entry) return;

  for (const path of entry.routes) {
    const url = `${env.BASE_URL}${path}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      });
      // A 404 or a 500 is as quiet as a success to a bare `await fetch`.
      if (!response.ok) {
        console.error(
          `[cron] ${path} responded ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error(`[cron] ${path} failed:`, error);
    }
  }
}
