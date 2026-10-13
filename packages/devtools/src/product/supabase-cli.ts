/**
 * Finding the Supabase CLI a product is pinned to.
 *
 * A product repo may have no `package.json` (DogPack has none), so the CLI
 * cannot be assumed to be a dependency. In order:
 *
 *   1. `node_modules/.bin/supabase` in the repo, when its version is the pin;
 *   2. a `supabase` on PATH whose version is the pin;
 *   3. `pnpm dlx supabase@<pin>`, which downloads and caches the right one.
 *      Members are expected to have pnpm (both product repos pin it);
 *   4. `npx --yes supabase@<pin>`, only when pnpm is not on PATH.
 *
 * The pin is also part of the generated-types hash, so a contributor on a
 * different CLI would generate different types than CI; matching it is not
 * cosmetic.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandLine, type Runner } from "./exec.js";

export interface SupabaseCli {
  command: string;
  /** Arguments that come before the caller's (`["dlx", "supabase@2.117.0"]` for pnpm dlx). */
  prefix: readonly string[];
  /** How it was found, for messages. */
  source: "repo" | "path" | "pnpm" | "npx";
}

export function cliLine(cli: SupabaseCli, args: readonly string[]): string {
  return commandLine(cli.command, [...cli.prefix, ...args]);
}

function versionOf(output: string): string | null {
  return /\b(\d+\.\d+\.\d+)\b/.exec(output)?.[1] ?? null;
}

export async function resolveSupabaseCli(
  root: string,
  pin: string,
  run: Runner,
  fileExists: (path: string) => boolean = existsSync,
): Promise<SupabaseCli> {
  const candidates: SupabaseCli[] = [];
  const local = join(root, "node_modules", ".bin", "supabase");
  if (fileExists(local)) {
    candidates.push({ command: local, prefix: [], source: "repo" });
  }
  candidates.push({ command: "supabase", prefix: [], source: "path" });

  for (const candidate of candidates) {
    try {
      const result = await run(candidate.command, ["--version"], { cwd: root });
      if (result.code === 0 && versionOf(result.stdout) === pin)
        return candidate;
    } catch {
      // Not installed there; try the next place.
    }
  }
  try {
    const result = await run("pnpm", ["--version"], { cwd: root });
    if (result.code === 0) {
      return {
        command: "pnpm",
        prefix: ["dlx", `supabase@${pin}`],
        source: "pnpm",
      };
    }
  } catch {
    // No pnpm on PATH; npx is the last resort.
  }
  return {
    command: "npx",
    prefix: ["--yes", `supabase@${pin}`],
    source: "npx",
  };
}
