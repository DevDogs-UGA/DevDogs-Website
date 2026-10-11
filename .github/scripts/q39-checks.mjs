/**
 * The Q39 smoke checks: three checks that need no login and guard sign-in
 * (the thing every product depends on). They run from `smoke.yaml` on a
 * schedule, and `deploy-worker.yaml` runs the first two before a traffic
 * switch (worker-smoke.mjs `--authorize`).
 *
 *   1. The authorize endpoint redirects to the platform's consent page.
 *   2. The consent page 404s without an `authorization_id`.
 *   3. The access-token hook downgrades a client's token (a database check,
 *      q39-hook-downgrade.sql, in a transaction that is rolled back).
 *
 * What may run where. Staging is ours to poke: check 1 registers and deletes a
 * throwaway client and check 3 writes inside a rolled-back transaction.
 * Production gets only reads: the discovery document must advertise an
 * authorize endpoint, and the consent page must 404. Checks 1 and 3 run in
 * production inside an approved deploy (worker-smoke.mjs), never on a timer.
 *
 * Environment:
 *   API_URL      the project's API origin (required).
 *   SECRET_KEY   staging only: registers the throwaway client (check 1).
 *   DB_URL       staging only: the deploy credential (check 3).
 *
 * Usage: node q39-checks.mjs --tier staging|production [--workers-json workers.json]
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main.mjs";
import { authorizeChecks, renderChecks } from "./worker-smoke.mjs";

/**
 * @param {{
 *   tier: "staging" | "production",
 *   base: string,
 *   apiUrl: string,
 *   secretKey?: string,
 *   dbUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   runHookCheck?: (dbUrl: string) => { ok: boolean, detail: string },
 * }} input
 * @returns {Promise<import("./worker-smoke.mjs").Check[]>}
 */
export async function q39Checks({
  tier,
  base,
  apiUrl,
  secretKey,
  dbUrl,
  fetchImpl = fetch,
  runHookCheck = defaultHookCheck,
}) {
  const headers = { "user-agent": "devdogs-q39/1" };
  /** @type {import("./worker-smoke.mjs").Check[]} */
  const checks = [];

  if (tier === "staging" && secretKey) {
    checks.push(
      ...(await authorizeChecks({
        base,
        headers,
        fetchImpl,
        apiUrl,
        secretKey,
      })),
    );
  } else {
    const discovery = await fetchImpl(
      `${apiUrl.replace(/\/+$/, "")}/auth/v1/.well-known/openid-configuration`,
    );
    const body = await discovery.json().catch(() => ({}));
    checks.push({
      name: "the OAuth server advertises an authorize endpoint",
      ok: discovery.ok && typeof body.authorization_endpoint === "string",
      detail: `status ${discovery.status}${tier === "production" ? " (read-only in production)" : " (no SECRET_KEY: not registering a client)"}`,
    });
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
  }

  if (tier === "staging" && dbUrl) {
    checks.push({
      name: "the access-token hook downgrades client tokens",
      ...runHookCheck(dbUrl),
    });
  }
  return checks;
}

/** @param {string} dbUrl */
function defaultHookCheck(dbUrl) {
  const sql = join(
    dirname(fileURLToPath(import.meta.url)),
    "q39-hook-downgrade.sql",
  );
  const result = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "--quiet", "-f", sql],
    {
      encoding: "utf8",
    },
  );
  return {
    ok: result.status === 0,
    detail:
      result.status === 0
        ? "rolled back, nothing changed"
        : (result.stderr || "psql failed").trim().split("\n").at(-1),
  };
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const tier = flag("--tier");
  if (tier !== "staging" && tier !== "production") {
    process.stderr.write("--tier staging|production is required\n");
    process.exit(2);
  }
  const workers = JSON.parse(
    readFileSync(flag("--workers-json") ?? "workers.json", "utf8"),
  );
  const platform = workers.find((w) => w.path === "apps/platform");
  const host = platform?.smoke?.hosts?.[tier];
  const apiUrl = process.env.API_URL;
  if (!host || !apiUrl) {
    process.stderr.write(
      "workers.json has no platform host for this tier, or API_URL is unset\n",
    );
    process.exit(2);
  }
  q39Checks({
    tier,
    base: `https://${host}`,
    apiUrl,
    secretKey: process.env.SECRET_KEY || undefined,
    dbUrl: process.env.DB_URL || undefined,
  }).then(
    (checks) => {
      const text = renderChecks(checks, `Q39 checks (${tier})`);
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
      process.stderr.write(`q39-checks: ${error.message}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
