/**
 * Test helpers for the product modules: a throwaway product repository on
 * disk and a recording `Runner`. Not part of the build (only tests import it).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { productAt, type Product } from "./config.js";
import type { RunOptions, RunResult, Runner } from "./exec.js";
import type { SupabaseCli } from "./supabase-cli.js";

export const CLI: SupabaseCli = {
  command: "supabase",
  prefix: [],
  source: "path",
};

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
}

export interface FixtureOptions {
  config?: Record<string, unknown>;
  files?: Record<string, string>;
}

const BASE_CONFIG = {
  product: "dogpack",
  name: "DogPack",
  supabase: { version: "2.117.0", schemas: ["dogpack"] },
  types: { kind: "typescript", out: "lib/database.types.ts" },
  generatedTypes: { repo: "DevDogsUGA/DogPack" },
  oauth: { redirectUris: ["dev.dogpack://login-callback"] },
  devData: { file: "supabase/dev-data.sql" },
  production: { projects: ["dogpack"] },
};

export function makeProduct(options: FixtureOptions = {}): Product {
  const root = mkdtempSync(join(tmpdir(), "devtools-product-"));
  writeFiles(root, {
    "devtools.config.json": JSON.stringify({
      ...BASE_CONFIG,
      ...options.config,
    }),
    ".env.example":
      "# Public values only.\nSUPABASE_URL=\nSUPABASE_PUBLISHABLE_KEY=\nCATALOG_URL=https://api.devdogsuga.org/catalog/v1\n",
    "supabase/schemas/dogpack/schema.sql":
      "create schema if not exists dogpack;\n",
    "supabase/schemas/dogpack/tables/sessions.sql":
      "create table dogpack.sessions (id uuid primary key);\n",
    "supabase/dev-data.sql": "select current_setting('devtools.member_id');\n",
    ...options.files,
  });
  return productAt(root);
}

export interface Call {
  command: string;
  args: readonly string[];
  options: RunOptions;
}

export type Responder = (
  call: Call,
) => Partial<RunResult> | Promise<Partial<RunResult>> | undefined;

/** A `Runner` that records every call and answers from `respond`. */
export function recordingRunner(respond: Responder = () => undefined): {
  run: Runner;
  calls: Call[];
} {
  const calls: Call[] = [];
  const run: Runner = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    const answer = await respond(call);
    return { code: 0, stdout: "", stderr: "", ...answer };
  };
  return { run, calls };
}
