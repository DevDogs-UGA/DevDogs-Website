/**
 * The API hostname's route table (Q22, Q90), pinned.
 *
 * `api.devdogsuga.org` (staging: `api-staging.devdogsuga.org`) is one hostname
 * shared by two Workers, each owning a path:
 *
 *   /catalog/v1/*     the catalog Worker      (apps/catalog)
 *   /moderation/v1/*  the platform Worker     (apps/platform)
 *
 * A route is not a custom domain: a custom domain gives a hostname to ONE
 * Worker, and a second Worker claiming the same hostname would take it from the
 * first. Routes need the hostname to be a proxied record in the zone, which is
 * why the production routes are dormant until the Gate (the record is DNS-only,
 * pointing at Supabase, until then).
 *
 * This reads the Workers' wrangler configs and fails if a route is missing,
 * if a path is claimed by the wrong Worker, if two Workers claim overlapping
 * paths, or if an API route is declared as a custom domain. A Worker whose
 * directory does not exist yet (the catalog, before it merges) is skipped, so
 * the check can land with either.
 *
 * Usage: node check-routes.mjs [repo-root]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain } from "./is-main.mjs";

export const ZONE = "devdogsuga.org";

/** Which Worker owns which path, per tier. */
export const API_ROUTES = [
  {
    app: "apps/catalog",
    env: "staging",
    pattern: "api-staging.devdogsuga.org/catalog/v1/*",
  },
  {
    app: "apps/catalog",
    env: "production",
    pattern: "api.devdogsuga.org/catalog/v1/*",
  },
  {
    app: "apps/platform",
    env: "staging",
    pattern: "api-staging.devdogsuga.org/moderation/v1/*",
  },
  {
    app: "apps/platform",
    env: "production",
    pattern: "api.devdogsuga.org/moderation/v1/*",
  },
];

/**
 * Parses JSON with comments and trailing commas, which is what wrangler.jsonc
 * is. String contents are left alone, so a `//` inside a URL survives.
 *
 * @param {string} text
 */
export function parseJsonc(text) {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
        i += 1;
      i += 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean} Whether two route patterns can match the same URL.
 */
export function overlaps(a, b) {
  const [hostA = "", ...pathA] = a.split("/");
  const [hostB = "", ...pathB] = b.split("/");
  if (hostA !== hostB) return false;
  const prefix = (parts) => parts.join("/").replace(/\*$/, "");
  const pa = prefix(pathA);
  const pb = prefix(pathB);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/**
 * @param {string} root
 * @param {(path: string) => string | null} [read]  Test seam.
 * @returns {string[]} One line per problem; empty means the table holds.
 */
export function checkRoutes(
  root,
  read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, string[]>} app -> API patterns it declares */
  const declared = new Map();
  for (const app of new Set(API_ROUTES.map((r) => r.app))) {
    const text = read(join(root, app, "wrangler.jsonc"));
    if (text === null) continue;
    const config = parseJsonc(text);
    for (const env of ["staging", "production"]) {
      const routes = config.env?.[env]?.routes ?? [];
      for (const route of routes) {
        const pattern = typeof route === "string" ? route : route.pattern;
        if (!/^api(-staging)?\.devdogsuga\.org\//.test(pattern)) continue;
        declared.set(`${app}:${env}`, [
          ...(declared.get(`${app}:${env}`) ?? []),
          pattern,
        ]);
        if (typeof route !== "string") {
          if (route.custom_domain) {
            problems.push(
              `${app} ${env}: ${pattern} is a custom domain; a shared API hostname needs a route.`,
            );
          }
          if (route.zone_name !== ZONE) {
            problems.push(
              `${app} ${env}: ${pattern} needs "zone_name": "${ZONE}".`,
            );
          }
        }
      }
    }
    for (const expected of API_ROUTES.filter((r) => r.app === app)) {
      const have = declared.get(`${app}:${expected.env}`) ?? [];
      if (!have.includes(expected.pattern)) {
        problems.push(
          `${app} ${expected.env}: missing the route ${expected.pattern}.`,
        );
      }
    }
  }
  // Every declared API route is the expected one, and none overlaps another's.
  const all = [...declared.entries()].flatMap(([key, patterns]) =>
    patterns.map((pattern) => ({ key, pattern })),
  );
  for (const { key, pattern } of all) {
    const [app, env] = key.split(":");
    const owner = API_ROUTES.find((r) => r.pattern === pattern);
    if (!owner) {
      problems.push(`${app} ${env}: ${pattern} is not in the API route table.`);
    } else if (owner.app !== app) {
      problems.push(`${app} ${env}: ${pattern} belongs to ${owner.app}.`);
    }
  }
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      if (a.key !== b.key && overlaps(a.pattern, b.pattern)) {
        problems.push(
          `${a.key} (${a.pattern}) overlaps ${b.key} (${b.pattern}).`,
        );
      }
    }
  }
  return problems;
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const root = resolve(process.argv[2] ?? ".");
  const problems = checkRoutes(root);
  if (problems.length > 0) {
    for (const line of problems) process.stderr.write(`${line}\n`);
    process.exit(1);
  }
  process.stdout.write("check-routes: the API route table holds.\n");
}
/* c8 ignore stop */
