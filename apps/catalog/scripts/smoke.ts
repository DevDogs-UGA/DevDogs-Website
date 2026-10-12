/**
 * The post-deploy smoke test of a deployed catalog (`pnpm -F catalog test:smoke`),
 * run by the deploy workflow after `backstage deploy catalog`:
 *
 *   CATALOG_URL=https://api-staging.devdogsuga.org/catalog/v1 pnpm -F catalog test:smoke
 *
 * It asks for what any database answers, including an empty one, so the first
 * deploy of a new environment (before its first scrape) passes: the Worker is
 * routed, reaches its database as the read-only role, validates requests and
 * refuses writes. The data-dependent contract check is `pnpm test:live`,
 * which the integrator runs once a scrape has filled the environment.
 *
 * Exits 1 listing every check that failed.
 */
import { pathToFileURL } from "node:url";

export type SmokeResult = { name: string; ok: boolean; detail: string };

/** A response body as the shape the check expects; `Response.json()` is typed differently under Node and workers-types. */
const bodyOf = async <T>(response: Response): Promise<T> =>
  JSON.parse(await response.text()) as T;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const attempt = async (
  name: string,
  check: () => Promise<string | null>,
): Promise<SmokeResult> => {
  try {
    const problem = await check();
    return { name, ok: problem === null, detail: problem ?? "ok" };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

/** Retries while a new version propagates: a route that answers 5xx or 404 for a few seconds after a deploy is not broken yet. */
async function settled(
  fetchImpl: Fetch,
  url: string,
  init?: RequestInit,
  attempts = 6,
  waitMs = 5000,
): Promise<Response> {
  let response = await fetchImpl(url, init);
  for (
    let i = 1;
    i < attempts && (response.status >= 500 || response.status === 404);
    i += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetchImpl(url, init);
  }
  return response;
}

export async function smoke(
  base: string,
  fetchImpl: Fetch = fetch,
  waitMs = 5000,
): Promise<SmokeResult[]> {
  const root = base.replace(/\/$/, "");
  const headers = { "X-Client": "catalog-smoke/1" };
  return [
    await attempt("GET /terms answers 200 JSON with a terms list", async () => {
      const response = await settled(
        fetchImpl,
        `${root}/terms`,
        { headers },
        6,
        waitMs,
      );
      if (response.status !== 200) return `status ${response.status}`;
      if (!response.headers.get("content-type")?.includes("application/json"))
        return `content-type ${response.headers.get("content-type")}`;
      if (response.headers.get("access-control-allow-origin") !== "*")
        return "no CORS header";
      if (
        !/^public, max-age=60, s-maxage=\d+$/.test(
          response.headers.get("cache-control") ?? "",
        )
      )
        return `cache-control ${response.headers.get("cache-control")}`;
      const body = await bodyOf<{ terms?: unknown }>(response);
      return Array.isArray(body.terms) ? null : "no terms array";
    }),
    await attempt("a malformed term is a 400, not a 5xx", async () => {
      const response = await fetchImpl(`${root}/subjects?term=nope`, {
        headers,
      });
      if (response.status !== 400) return `status ${response.status}`;
      const body = await bodyOf<{ error?: { code?: string } }>(response);
      return body.error?.code ? null : "no error code in the body";
    }),
    await attempt("a write is refused with 405", async () => {
      const response = await fetchImpl(`${root}/terms`, { method: "POST" });
      return response.status === 405 ? null : `status ${response.status}`;
    }),
  ];
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const base = process.env.CATALOG_URL;
  if (!base) {
    console.error("CATALOG_URL is not set.");
    process.exit(2);
  }
  const results = await smoke(base);
  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `: ${r.detail}`}`,
    );
  }
  if (results.some((r) => !r.ok)) process.exit(1);
}
