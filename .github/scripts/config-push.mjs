/**
 * `supabase config push` and the DevDogs sign-in provider, for
 * `deploy-database.yaml`.
 *
 * Two commands:
 *
 *   push       Applies `supabase/config.toml` (auth settings, redirect URLs,
 *              hooks) to the project. Before it does, every `env(NAME)` in
 *              the file is resolved from the job's secrets and variables.
 *              The CLI sends an unresolved one verbatim (production's
 *              `uri_allow_list` held the literal text
 *              `env(STUDY_GROUP_FINDER_URL_CALLBACK)` for a while), so an
 *              unset one is dropped from a list and from a section that is
 *              switched off, and refused anywhere it would be sent.
 *
 *   register   Registers the `custom:devdogsuga` OIDC provider on a product
 *              project (DogDays, DogPack) from environment secrets. Hosted
 *              Supabase has no config-file field for custom providers, so it
 *              is two steps: turn `custom_oauth_enabled` on in the
 *              Management API, then create or update the provider through
 *              GoTrue's admin API. The provider's issuer is read from the
 *              platform's own discovery document, because GoTrue rejects a
 *              provider whose issuer differs from what discovery reports.
 *              (That issuer is the platform project's ref host, even while
 *              its custom domain is active; see the vanity-subdomain runbook.)
 *              Never set an attribute mapping on `sub`: the claim must stay
 *              the platform user's id (`auth.identities.provider_id`), which
 *              DogDays' claim function matches on.
 *
 * Environment:
 *   SECRETS_JSON, VARS_JSON   `toJSON(secrets)` and `toJSON(vars)` of the job.
 *   PROJECT_REF               the project to configure.
 *   SUPABASE_ACCESS_TOKEN     for `config push` and the Management API.
 *   API_URL                   the project's API origin (default `https://<ref>.supabase.co`).
 *   SECRET_KEY                the project's service-role / secret key (register).
 *   DEVDOGS_OAUTH_CLIENT_ID, DEVDOGS_OAUTH_CLIENT_SECRET
 *                             the product's client on the platform (register).
 *   DEVDOGS_OAUTH_BASE_URL    where the platform's OAuth server lives
 *                             (default `https://api.devdogsuga.org`).
 *   SUPABASE_BIN              the CLI; default `supabase`.
 *
 * Usage: node config-push.mjs <push|register> [--dry-run]
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMain } from "./is-main.mjs";

export const PROVIDER_IDENTIFIER = "custom:devdogsuga";
export const PROVIDER_NAME = "DevDogs";
export const PROVIDER_SCOPES = ["openid", "email", "profile"];
const DEFAULT_PLATFORM_URL = "https://api.devdogsuga.org";

/** @param {string} toml */
export function envRefs(toml) {
  return [
    ...new Set(
      [...toml.matchAll(/env\(([A-Za-z_][A-Za-z0-9_]*)\)/g)].map((m) => m[1]),
    ),
  ];
}

/**
 * Resolves every `env(NAME)` in a config file.
 *
 * - A set one is left for the CLI to resolve (the caller puts the value in the
 *   CLI's environment); only unset ones are rewritten here.
 * - An unset one that is an element of an array is removed.
 * - An unset one on a scalar line inside a section whose `enabled` is false is
 *   removed with its line.
 * - An unset one anywhere else is an error: pushing it would send the literal.
 *
 * @param {string} toml
 * @param {(name: string) => string | undefined} lookup
 * @returns {{ toml: string, dropped: string[], missing: string[] }}
 */
export function resolveConfig(toml, lookup) {
  const isSet = (name) => {
    const value = lookup(name);
    return value !== undefined && value !== "";
  };
  const lines = toml.split("\n");

  // Which sections are switched off: `[auth.external.x]` with `enabled = false`.
  /** @type {Map<string, boolean>} */
  const enabled = new Map();
  let section = "";
  for (const line of lines) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) section = header[1];
    const flag = /^\s*enabled\s*=\s*(true|false)\b/.exec(line);
    if (flag) enabled.set(section, flag[1] === "true");
  }

  /** @type {string[]} */
  const dropped = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const out = [];
  section = "";
  for (const line of lines) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) section = header[1];
    const refs = envRefs(line.replace(/#.*$/, ""));
    const unset = refs.filter((name) => !isSet(name));
    if (unset.length === 0) {
      out.push(line);
      continue;
    }
    // An array element on a line of its own: `  "env(X)",`
    if (/^\s*"env\([A-Za-z_][A-Za-z0-9_]*\)"\s*,?\s*(#.*)?$/.test(line)) {
      dropped.push(...unset);
      continue;
    }
    // An element inside an inline array: `["a", "env(X)"]`.
    let rewritten = line;
    let touchedInline = false;
    if (/\[[^\]]*env\(/.test(line)) {
      for (const name of unset) {
        const before = rewritten;
        rewritten = rewritten
          .replace(new RegExp(`,\\s*"env\\(${name}\\)"`, "g"), "")
          .replace(new RegExp(`"env\\(${name}\\)"\\s*,?\\s*`, "g"), "");
        if (rewritten !== before) {
          dropped.push(name);
          touchedInline = true;
        }
      }
    }
    if (
      touchedInline &&
      envRefs(rewritten.replace(/#.*$/, "")).filter((n) => !isSet(n)).length ===
        0
    ) {
      out.push(rewritten);
      continue;
    }
    // A scalar: fine to drop only if its whole section is off.
    if (enabled.get(section) === false) {
      dropped.push(...unset);
      continue;
    }
    missing.push(...unset);
    out.push(line);
  }
  return {
    toml: out.join("\n"),
    dropped: [...new Set(dropped)],
    missing: [...new Set(missing)],
  };
}

/**
 * Secrets and variables of the job, as one lookup (a secret wins).
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {(name: string) => string | undefined}
 */
export function lookupFrom(env) {
  /** @type {Record<string, string>} */
  const merged = {};
  for (const key of ["VARS_JSON", "SECRETS_JSON"]) {
    if (!env[key]) continue;
    try {
      Object.assign(merged, JSON.parse(env[key]));
    } catch {
      throw new Error(`${key} is not valid JSON`);
    }
  }
  return (name) => merged[name] ?? env[name];
}

/**
 * The OIDC issuer a platform advertises.
 *
 * @param {string} baseUrl
 * @param {typeof fetch} fetchImpl
 */
export async function discoverIssuer(baseUrl, fetchImpl = fetch) {
  const url = `${baseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/openid-configuration`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  const body = await response.json();
  if (typeof body.issuer !== "string" || !body.issuer) {
    throw new Error(`${url} has no issuer`);
  }
  return body.issuer;
}

/**
 * Registers or updates the provider. Idempotent: the secret is not readable
 * back, so an existing provider is always updated with the current values.
 *
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   log?: (line: string) => void,
 * }} input
 * @returns {Promise<{ action: "skipped" | "created" | "updated", issuer?: string }>}
 */
export async function registerProvider({
  env,
  fetchImpl = fetch,
  log = () => {},
}) {
  const lookup = lookupFrom(env);
  const clientId = lookup("DEVDOGS_OAUTH_CLIENT_ID");
  const clientSecret = lookup("DEVDOGS_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    log(
      "register: DEVDOGS_OAUTH_CLIENT_ID / DEVDOGS_OAUTH_CLIENT_SECRET are not set: this project does not sign in with DevDogs, nothing registered.",
    );
    return { action: "skipped" };
  }
  const ref = lookup("PROJECT_REF");
  const token = lookup("SUPABASE_ACCESS_TOKEN");
  const secretKey = lookup("SECRET_KEY");
  if (!ref || !token || !secretKey) {
    throw new Error(
      "register needs PROJECT_REF, SUPABASE_ACCESS_TOKEN and SECRET_KEY",
    );
  }
  const apiUrl = (lookup("API_URL") || `https://${ref}.supabase.co`).replace(
    /\/+$/,
    "",
  );
  const platformUrl = lookup("DEVDOGS_OAUTH_BASE_URL") || DEFAULT_PLATFORM_URL;
  const identifier =
    lookup("DEVDOGS_PROVIDER_IDENTIFIER") || PROVIDER_IDENTIFIER;

  // 1. custom_oauth_enabled, in the Management API.
  const management = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const authHeaders = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const current = await fetchImpl(management, { headers: authHeaders });
  if (!current.ok) throw new Error(`GET config/auth failed: ${current.status}`);
  const config = await current.json();
  if (config.custom_oauth_enabled !== true) {
    log("register: turning custom_oauth_enabled on");
    const patch = await fetchImpl(management, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ custom_oauth_enabled: true }),
    });
    if (!patch.ok)
      throw new Error(
        `PATCH config/auth failed: ${patch.status} ${await patch.text()}`,
      );
  }

  // 2. The provider itself.
  const issuer = await discoverIssuer(platformUrl, fetchImpl);
  const admin = `${apiUrl}/auth/v1/admin/custom-providers`;
  const adminHeaders = {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    "content-type": "application/json",
  };
  const body = {
    name: PROVIDER_NAME,
    client_id: clientId,
    client_secret: clientSecret,
    issuer,
    scopes: PROVIDER_SCOPES,
    enabled: true,
  };
  const existing = await fetchImpl(
    `${admin}/${encodeURIComponent(identifier)}`,
    { headers: adminHeaders },
  );
  if (existing.status === 404) {
    const created = await fetchImpl(admin, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ provider_type: "oidc", identifier, ...body }),
    });
    if (!created.ok)
      throw new Error(
        `creating ${identifier} failed: ${created.status} ${await created.text()}`,
      );
    log(`register: created ${identifier} (issuer ${issuer})`);
    return { action: "created", issuer };
  }
  if (!existing.ok)
    throw new Error(`GET ${identifier} failed: ${existing.status}`);
  const updated = await fetchImpl(
    `${admin}/${encodeURIComponent(identifier)}`,
    {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify(body),
    },
  );
  if (!updated.ok)
    throw new Error(
      `updating ${identifier} failed: ${updated.status} ${await updated.text()}`,
    );
  log(`register: updated ${identifier} (issuer ${issuer})`);
  return { action: "updated", issuer };
}

/**
 * `supabase config push` from a temporary copy of `supabase/` whose
 * config.toml has no unresolved `env()`.
 *
 * @param {{ env: NodeJS.ProcessEnv, repoRoot: string, dryRun: boolean, log?: (line: string) => void }} input
 * @returns {number} exit code
 */
export function pushConfig({ env, repoRoot, dryRun, log = () => {} }) {
  const lookup = lookupFrom(env);
  const ref = lookup("PROJECT_REF");
  if (!ref) throw new Error("PROJECT_REF is not set");
  const source = join(repoRoot, "supabase", "config.toml");
  if (!existsSync(source)) throw new Error(`${source} not found`);
  const resolved = resolveConfig(readFileSync(source, "utf8"), lookup);
  if (resolved.dropped.length > 0) {
    log(
      `config push: dropped unset env() entries: ${resolved.dropped.join(", ")}`,
    );
  }
  if (resolved.missing.length > 0) {
    throw new Error(
      `config.toml references variables that are not set, in places that would be pushed: ${resolved.missing.join(", ")}. Add them to the environment's secrets or variables, or switch the section off.`,
    );
  }
  const scratch = mkdtempSync(join(tmpdir(), "config-push-"));
  try {
    const target = join(scratch, "supabase");
    mkdirSync(target, { recursive: true });
    cpSync(join(repoRoot, "supabase"), target, {
      recursive: true,
      filter: (path) => !/[/\\](\.temp|\.branches)([/\\]|$)/.test(path),
    });
    writeFileSync(join(target, "config.toml"), resolved.toml);
    // The values the CLI resolves env() with: only the referenced names.
    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...env };
    for (const name of envRefs(resolved.toml)) {
      const value = lookup(name);
      if (value !== undefined) childEnv[name] = value;
    }
    childEnv.SUPABASE_ACCESS_TOKEN = lookup("SUPABASE_ACCESS_TOKEN");
    delete childEnv.SECRETS_JSON;
    delete childEnv.VARS_JSON;
    const args = [
      "config",
      "push",
      "--project-ref",
      ref,
      ...(dryRun ? [] : ["--yes"]),
    ];
    const result = spawnSync(env.SUPABASE_BIN || "supabase", args, {
      cwd: scratch,
      env: childEnv,
      stdio: dryRun ? ["ignore", "inherit", "inherit"] : "inherit",
      input: dryRun ? "n\n" : undefined,
    });
    return result.status ?? 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const log = (line) => process.stderr.write(`${line}\n`);
  try {
    if (command === "push") {
      process.exit(
        pushConfig({
          env: process.env,
          repoRoot: process.cwd(),
          dryRun: rest.includes("--dry-run"),
          log,
        }),
      );
    } else if (command === "register") {
      registerProvider({ env: process.env, log }).then(
        (result) => {
          process.stdout.write(`${JSON.stringify(result)}\n`);
          process.exit(0);
        },
        (error) => {
          log(`config-push: ${error.message}`);
          process.exit(1);
        },
      );
    } else {
      log("usage: config-push.mjs <push|register> [--dry-run]");
      process.exit(2);
    }
  } catch (error) {
    log(`config-push: ${error.message}`);
    process.exit(1);
  }
}
/* c8 ignore stop */
