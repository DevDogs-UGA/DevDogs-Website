import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GenerateDatabaseTypesOptions {
  /**
   * Postgres connection string passed to `supabase gen types --db-url`.
   * Always `--db-url` rather than the CLI's `--local`/`--linked` modes,
   * whose defaults can disagree with whatever connection the caller actually
   * resolved.
   */
  dbUrl: string;
  /** Absolute (or cwd-relative) path to write the generated types to. */
  outFile: string;
  /**
   * Working directory `supabase` (and, if `format`, `prettier`) run in. Both
   * are invoked via `pnpm exec`, so this must be a directory inside the
   * consumer's pnpm workspace — never a bundled/dlx'd copy, so the version
   * that runs is always the one the consumer's lockfile pins.
   *
   * Defaults to `process.cwd()`.
   */
  cwd?: string;
  /** Run `pnpm exec prettier --write <outFile>` after writing. Default true. */
  format?: boolean;
}

/**
 * Generates Supabase's `Database` type from a live connection and writes it
 * to `outFile`.
 *
 * This package ships no `database.types.ts` of its own: the generated file is
 * repo data, not framework, and belongs in the consuming repo (see
 * `@devdogsuga/db/client`'s `Database` generic). This function is the
 * machinery a consumer's own `db typegen`-style command calls to produce that
 * file, in its own repo, at whatever path it chooses.
 */
export async function generateDatabaseTypes(
  opts: GenerateDatabaseTypesOptions,
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const format = opts.format ?? true;

  const { stdout } = await execFileAsync(
    "pnpm",
    ["exec", "supabase", "gen", "types", "--db-url", opts.dbUrl],
    { cwd, maxBuffer: 32 * 1024 * 1024 },
  );
  await writeFile(opts.outFile, stdout);

  if (format) {
    await execFileAsync("pnpm", ["exec", "prettier", "--write", opts.outFile], {
      cwd,
    });
  }
}
