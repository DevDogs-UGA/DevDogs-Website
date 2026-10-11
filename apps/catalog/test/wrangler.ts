import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

/** The slice of wrangler.jsonc the tests compare with the code. */
export type WranglerTier = {
  name?: string;
  vars?: Record<string, string>;
  routes?: { pattern: string; zone_name?: string }[];
  workflows?: {
    binding: string;
    name: string;
    class_name: string;
    schedules?: string[];
  }[];
  ratelimits?: {
    name: string;
    namespace_id: string;
    simple: { limit: number; period: number };
  }[];
};

export type WranglerConfig = WranglerTier & {
  env: Record<"staging" | "production", WranglerTier>;
};

export const WRANGLER_PATH = resolve(import.meta.dirname, "../wrangler.jsonc");

/** wrangler.jsonc has comments and trailing commas; TypeScript's JSONC reader takes both. */
export function loadWrangler(): WranglerConfig {
  const parsed = ts.parseConfigFileTextToJson(
    WRANGLER_PATH,
    readFileSync(WRANGLER_PATH, "utf8"),
  );
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }
  return parsed.config as WranglerConfig;
}

/** The development block and both environments, labelled. */
export function tiersOf(config: WranglerConfig): [string, WranglerTier][] {
  return [
    ["development", config],
    ["staging", config.env.staging],
    ["production", config.env.production],
  ];
}
