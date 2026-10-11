/**
 * Smoke test of a Worker VERSION that is not yet serving traffic, for
 * `deploy-worker.yaml`. This is what protects sign-in: a bad build is caught
 * here, before the traffic switch, and the live version is never touched.
 *
 * A version uploaded with `wrangler versions upload` gets no traffic. It can
 * still be reached on the Worker's real hostname by sending the
 * `Cloudflare-Workers-Version-Overrides` header, which pins that request to
 * one version. So the preview is exercised on the production-shaped route, and
 * no preview URL has to be enabled (the slides Worker, behind Cloudflare
 * Access, has none).
 *
 * The checks come from `workers.json` (the one place the hosts live): every
 * public path answers 200, the protected path redirects an anonymous visitor
 * to the sign-in prefix. With `--authorize` (the platform) it also proves the
 * OAuth hand-off that every product's sign-in depends on:
 *
 *   1. register a throwaway development-tier OAuth client on the project,
 *   2. ask `/auth/v1/oauth/authorize` for a code: it must redirect to the
 *      platform's consent page,
 *   3. the consent page must 404 without an `authorization_id`,
 *   4. delete the client (always, even when a check failed).
 *
 * Run with no `--version-id` it checks whatever is live (the post-switch
 * check and the scheduled smoke test).
 *
 * Environment (only for --authorize):
 *   API_URL      the Supabase project's API origin.
 *   SECRET_KEY   the project's secret key.
 *
 * Usage:
 *   node worker-smoke.mjs --path apps/platform --tier staging \
 *     [--workers-json workers.json | --smoke-json '{"hosts":{...},...}'] [--worker-name staging-platform --version-id UUID] \
 *     [--authorize]
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

/**
 * @typedef {{ name: string, ok: boolean, detail: string }} Check
 * @typedef {{
 *   hosts: Record<string, string>,
 *   publicPaths: string[],
 *   protectedPath?: string,
 *   protectedRedirectPrefix?: string,
 * }} SmokeConfig
 */

/** `Cloudflare-Workers-Version-Overrides: worker="version-id"`. */
export function overrideHeader(workerName, versionId) {
  return `${workerName}="${versionId}"`;
}

/**
 * @param {{
 *   smoke: SmokeConfig,
 *   tier: string,
 *   workerName?: string,
 *   versionId?: string,
 *   fetchImpl?: typeof fetch,
 *   authorize?: { apiUrl: string, secretKey: string } | null,
 * }} input
 * @returns {Promise<Check[]>}
 */
export async function runSmoke({
  smoke,
  tier,
  workerName,
  versionId,
  fetchImpl = fetch,
  authorize = null,
}) {
  const host = smoke.hosts?.[tier];
  if (!host)
    throw new Error(`workers.json has no ${tier} host for this Worker`);
  const base = `https://${host}`;
  /** @type {Record<string, string>} */
  const headers = { "user-agent": "devdogs-smoke/1" };
  if (versionId) {
    if (!workerName) throw new Error("--version-id needs --worker-name");
    headers["cloudflare-workers-version-overrides"] = overrideHeader(
      workerName,
      versionId,
    );
  }
  const get = (url) => fetchImpl(url, { redirect: "manual", headers });

  /** @type {Check[]} */
  const checks = [];
  for (const path of smoke.publicPaths ?? []) {
    try {
      const response = await get(`${base}${path}`);
      await response.arrayBuffer().catch(() => {});
      checks.push({
        name: `${path} answers 200`,
        ok: response.status === 200,
        detail: `status ${response.status}`,
      });
    } catch (error) {
      checks.push({
        name: `${path} answers 200`,
        ok: false,
        detail: String(error),
      });
    }
  }
  if (smoke.protectedPath) {
    try {
      const response = await get(`${base}${smoke.protectedPath}`);
      await response.arrayBuffer().catch(() => {});
      const location = response.headers.get("location") ?? "";
      const prefix = smoke.protectedRedirectPrefix ?? "/";
      const redirected = response.status >= 300 && response.status < 400;
      const path = location.startsWith("http")
        ? new URL(location).pathname
        : location;
      checks.push({
        name: `${smoke.protectedPath} sends an anonymous visitor to ${prefix}`,
        ok: redirected && path.startsWith(prefix),
        detail: `status ${response.status}, location ${location || "(none)"}`,
      });
    } catch (error) {
      checks.push({
        name: `${smoke.protectedPath} redirects`,
        ok: false,
        detail: String(error),
      });
    }
  }
  if (authorize)
    checks.push(
      ...(await authorizeChecks({ base, headers, fetchImpl, ...authorize })),
    );
  return checks;
}

/**
 * The OAuth hand-off, with a throwaway client.
 *
 * @param {{ base: string, headers: Record<string, string>, fetchImpl: typeof fetch, apiUrl: string, secretKey: string }} input
 * @returns {Promise<Check[]>}
 */
export async function authorizeChecks({
  base,
  headers,
  fetchImpl,
  apiUrl,
  secretKey,
}) {
  /** @type {Check[]} */
  const checks = [];
  const api = apiUrl.replace(/\/+$/, "");
  const adminHeaders = {
    "content-type": "application/json",
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
  };
  const redirectUri = "https://example.invalid/smoke/callback";
  const created = await fetchImpl(`${api}/auth/v1/admin/oauth/clients`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      client_name: "deploy smoke (throwaway)",
      redirect_uris: [redirectUri],
      client_type: "public",
    }),
  });
  const body = await created.json().catch(() => ({}));
  const clientId = body.client_id;
  checks.push({
    name: "register a throwaway OAuth client",
    ok: created.ok && typeof clientId === "string",
    detail: `status ${created.status}`,
  });
  try {
    if (typeof clientId === "string") {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid",
        state: "smoke",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      const authorize = await fetchImpl(
        `${api}/auth/v1/oauth/authorize?${params}`,
        { redirect: "manual" },
      );
      const location = authorize.headers.get("location") ?? "";
      const target = location ? new URL(location, api) : null;
      checks.push({
        name: "authorize redirects to the platform consent page",
        ok:
          authorize.status >= 300 &&
          authorize.status < 400 &&
          target !== null &&
          target.origin === new URL(base).origin &&
          target.pathname === "/oauth/consent" &&
          target.searchParams.has("authorization_id"),
        detail: `status ${authorize.status}, location ${target ? `${target.origin}${target.pathname}` : "(none)"}`,
      });
    }
    const consent = await fetchImpl(`${base}/oauth/consent`, {
      redirect: "manual",
      headers,
    });
    await consent.arrayBuffer().catch(() => {});
    checks.push({
      name: "the consent page 404s without an authorization_id",
      ok: consent.status === 404,
      detail: `status ${consent.status}`,
    });
  } finally {
    if (typeof clientId === "string") {
      const removed = await fetchImpl(
        `${api}/auth/v1/admin/oauth/clients/${clientId}`,
        {
          method: "DELETE",
          headers: adminHeaders,
        },
      );
      checks.push({
        name: "delete the throwaway OAuth client",
        ok: removed.status === 204 || removed.ok,
        detail: `status ${removed.status}`,
      });
    }
  }
  return checks;
}

/** @param {Check[]} checks */
export function renderChecks(checks, title) {
  return [
    `### ${title}`,
    "",
    ...checks.map(
      (c) => `- ${c.ok ? "pass" : "**FAIL**"}: ${c.name} (${c.detail})`,
    ),
  ].join("\n");
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const path = flag("--path") ?? "(inline config)";
  const tier = flag("--tier");
  if (!tier || (!flag("--path") && !flag("--smoke-json"))) {
    process.stderr.write(
      "--tier and one of --path or --smoke-json are required\n",
    );
    process.exit(2);
  }
  /** @type {SmokeConfig | undefined} */
  let smoke;
  if (flag("--smoke-json")) {
    smoke = JSON.parse(flag("--smoke-json"));
  } else {
    const workers = JSON.parse(
      readFileSync(flag("--workers-json") ?? "workers.json", "utf8"),
    );
    smoke = workers.find((w) => w.path === path)?.smoke;
  }
  if (!smoke) {
    process.stderr.write(`workers.json has no smoke config for ${path}\n`);
    process.exit(2);
  }
  const authorize = argv.includes("--authorize")
    ? {
        apiUrl: process.env.API_URL ?? "",
        secretKey: process.env.SECRET_KEY ?? "",
      }
    : null;
  if (authorize && (!authorize.apiUrl || !authorize.secretKey)) {
    process.stderr.write("--authorize needs API_URL and SECRET_KEY\n");
    process.exit(2);
  }
  runSmoke({
    smoke,
    tier,
    workerName: flag("--worker-name"),
    versionId: flag("--version-id"),
    authorize,
  }).then(
    (checks) => {
      const title = `Smoke test: ${path} (${tier})${flag("--version-id") ? `, version ${flag("--version-id")}` : ", live"}`;
      const text = renderChecks(checks, title);
      process.stdout.write(`${text}\n`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `${text}
`,
        );
      }
      process.exit(checks.every((c) => c.ok) ? 0 : 1);
    },
    (error) => {
      process.stderr.write(`worker-smoke: ${error.message}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
