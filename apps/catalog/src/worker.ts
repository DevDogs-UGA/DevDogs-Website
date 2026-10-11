/**
 * The catalog Worker: the public, read-only course catalog API on
 * `api(-staging).devdogsuga.org/catalog/v1/*`, and the home of the scrape that
 * fills it.
 *
 * - `fetch` serves the API (src/api/router.ts), reading as the read-only
 *   `catalog_reader` role (src/db/reader.ts).
 * - `ScrapeWorkflow` is the daily registrar scrape and `ProgramsWorkflow` the
 *   daily Bulletin sync. Both are native Workflow schedules declared in
 *   wrangler.jsonc, so neither passes through a Worker `scheduled` handler.
 *
 * Sentry is wired HERE with `@sentry/cloudflare`'s `withSentry`, as in the other
 * Workers, and the Workflows carry their own instrumentation (a Workflow does
 * not run inside `fetch`).
 */
import * as Sentry from "@sentry/cloudflare";
import { handleApiRequest, type ApiDeps } from "./api/router";
import { withCatalogReader } from "./db/reader";
import { resolveDatabaseUrl } from "./db/url";
import type { CatalogEnv } from "./env";
import { catalogSentryOptions } from "./sentry";

export { ScrapeWorkflow } from "./scrape/ScrapeWorkflow";
export { ProgramsWorkflow } from "./programs/ProgramsWorkflow";

function depsFor(env: CatalogEnv, ctx: ExecutionContext): ApiDeps {
  return {
    read: (fn) => withCatalogReader(resolveDatabaseUrl(env), fn),
    limiter: env.CATALOG_LIMITER,
    searchLimiter: env.SEARCH_LIMITER,
    // The Cache API exists only on a Worker that runs behind a zone route,
    // which the deployed catalog does; `wrangler dev` has it too.
    cache: typeof caches === "undefined" ? undefined : (caches as unknown as { default: ApiDeps["cache"] }).default,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}

export default Sentry.withSentry(
  (env: CatalogEnv) => catalogSentryOptions(env),
  {
    async fetch(request: Request, env: CatalogEnv, ctx: ExecutionContext) {
      const client = request.headers.get("X-Client");
      if (client && /^[A-Za-z0-9._/-]{1,64}$/.test(client)) {
        Sentry.setTag("client", client);
      }
      try {
        return await handleApiRequest(request, depsFor(env, ctx));
      } catch (error) {
        Sentry.captureException(error);
        return new Response(
          JSON.stringify({
            error: { code: "internal", message: "Something went wrong on our side." },
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    },
  } satisfies ExportedHandler<CatalogEnv>,
);
