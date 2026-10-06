/**
 * A minimal GitHub REST client for the deploy scripts: `fetch`, a token from
 * the environment, and `page=N` pagination. No dependencies, because the jobs
 * that run these scripts do not install the workspace first.
 *
 * Every script takes an `api(path)` function rather than calling this
 * directly, so the tests hand them a fake.
 */

/**
 * @param {{ token: string, baseUrl?: string, fetchImpl?: typeof fetch }} options
 * @returns {(path: string) => Promise<any>} GETs `path` and returns the parsed
 *   body (the first page only; use `apiAll` for every page of a list).
 */
export function createApi({
  token,
  baseUrl = "https://api.github.com",
  fetchImpl = fetch,
}) {
  return async function api(path) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(
        `GET ${path} failed: ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  };
}

/**
 * Every page of an array-returning endpoint, by following `page=N` until a
 * page comes back short.
 *
 * @param {(path: string) => Promise<any>} api
 * @param {string} path  An endpoint without a query string.
 * @returns {Promise<any[]>}
 */
export async function apiAll(api, path) {
  const perPage = 100;
  /** @type {any[]} */
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(`${path}?per_page=${perPage}&page=${page}`);
    if (!Array.isArray(batch)) {
      throw new Error(`GET ${path} did not return a list.`);
    }
    all.push(...batch);
    if (batch.length < perPage) return all;
  }
}
