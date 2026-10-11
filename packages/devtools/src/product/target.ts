/**
 * Which database a product command acts on: the Docker stack on this machine
 * or the contributor's own hosted project.
 *
 * Never production. A hosted target is whatever the contributor wrote into
 * `.env.tooling`, and `assertNotProduction` refuses the product's own
 * production project by name before anything runs against it.
 */
import type { Product } from "./config.js";
import { readEnvFile } from "./env.js";
import type { Runner } from "./exec.js";
import { cliLine, type SupabaseCli } from "./supabase-cli.js";
import { parse } from "dotenv";

export interface DbTarget {
  kind: "local" | "hosted";
  apiUrl: string;
  dbUrl: string;
  publishableKey: string;
  secretKey: string;
}

export const TOOLING_KEYS = {
  /** `local` or `hosted`: what `setup` last chose. Wins over everything else. */
  target: "DEVTOOLS_TARGET",
  dbUrl: "DB_URL",
  secretKey: "SECRET_KEY",
  accessToken: "SUPABASE_ACCESS_TOKEN",
} as const;

export class TargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetError";
  }
}

/** The project ref or vanity name in a Supabase URL or pooler URL, if it has one. */
export function projectNameOf(url: string): string | null {
  try {
    const { hostname, username } = new URL(url);
    const fromHost = /^([a-z0-9-]+)\.supabase\.co$/.exec(hostname)?.[1];
    if (fromHost) return fromHost;
    // Pooler: postgres.<ref>@aws-0-<region>.pooler.supabase.com
    const fromUser = /^postgres\.([a-z0-9]+)$/.exec(username)?.[1];
    if (fromUser) return fromUser;
    // Direct: db.<ref>.supabase.co
    return /^db\.([a-z0-9]+)\.supabase\.co$/.exec(hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Refuses a URL that names one of the product's production projects. */
export function assertNotProduction(product: Product, ...urls: string[]): void {
  const production = new Set(product.config.production.projects);
  for (const url of urls) {
    const name = projectNameOf(url);
    if (name !== null && production.has(name)) {
      throw new TargetError(
        `${url} is ${product.config.name}'s production project (${name}). devtools only acts on your own development project or the local Docker stack.`,
      );
    }
  }
}

/** Reads `supabase status -o env` for the running local stack. */
export async function localTarget(
  product: Product,
  cli: SupabaseCli,
  run: Runner,
): Promise<DbTarget> {
  const args = [...cli.prefix, "status", "-o", "env"];
  const result = await run(cli.command, args, { cwd: product.root });
  if (result.code !== 0) {
    throw new TargetError(
      `The local Supabase stack is not running (${cliLine(cli, ["status"])} failed). Start it with \`devtools supabase start\`, or run \`devtools setup\`.`,
    );
  }
  const env = parse(result.stdout);
  const apiUrl = env["API_URL"];
  const dbUrl = env["DB_URL"];
  const publishableKey = env["PUBLISHABLE_KEY"] ?? env["ANON_KEY"];
  // The legacy service-role JWT first: the local stack always accepts it.
  const secretKey = env["SERVICE_ROLE_KEY"] ?? env["SECRET_KEY"];
  if (!apiUrl || !dbUrl || !publishableKey || !secretKey) {
    throw new TargetError(
      "`supabase status -o env` did not report the API URL, DB URL and keys. Is the stack fully started?",
    );
  }
  return { kind: "local", apiUrl, dbUrl, publishableKey, secretKey };
}

/** The contributor's own hosted project, from `.env` and `.env.tooling`. */
export function hostedTarget(product: Product): DbTarget {
  const pub = readEnvFile(product.paths.envFile);
  const tooling = readEnvFile(product.paths.toolingFile);
  const { keys } = product.config.env;
  const apiUrl = pub[keys.url];
  const publishableKey = pub[keys.publishableKey];
  const dbUrl = tooling[TOOLING_KEYS.dbUrl];
  const secretKey = tooling[TOOLING_KEYS.secretKey];
  const missing = [
    [keys.url, apiUrl, product.config.env.file],
    [keys.publishableKey, publishableKey, product.config.env.file],
    [TOOLING_KEYS.dbUrl, dbUrl, product.config.env.tooling],
    [TOOLING_KEYS.secretKey, secretKey, product.config.env.tooling],
  ].filter(([, value]) => !value);
  if (
    missing.length > 0 ||
    !apiUrl ||
    !publishableKey ||
    !dbUrl ||
    !secretKey
  ) {
    throw new TargetError(
      `A hosted project needs ${missing.map(([key, , file]) => `${String(key)} (in ${String(file)})`).join(", ")}. Run \`devtools setup --hosted\`.`,
    );
  }
  assertNotProduction(product, apiUrl, dbUrl);
  return { kind: "hosted", apiUrl, dbUrl, publishableKey, secretKey };
}

export type TargetPreference = "local" | "hosted" | undefined;

/**
 * `--local` or `--hosted` if given; else what `setup` recorded in
 * `.env.tooling`; else hosted when that file carries a `DB_URL` (the
 * contributor chose their own project) and the local stack when it does not.
 */
export function chooseKind(
  product: Product,
  preference: TargetPreference,
): "local" | "hosted" {
  if (preference) return preference;
  const tooling = readEnvFile(product.paths.toolingFile);
  const recorded = tooling[TOOLING_KEYS.target];
  if (recorded === "local" || recorded === "hosted") return recorded;
  return tooling[TOOLING_KEYS.dbUrl] ? "hosted" : "local";
}

export async function resolveTarget(
  product: Product,
  cli: SupabaseCli,
  run: Runner,
  preference: TargetPreference,
): Promise<DbTarget> {
  return chooseKind(product, preference) === "hosted"
    ? hostedTarget(product)
    : localTarget(product, cli, run);
}
