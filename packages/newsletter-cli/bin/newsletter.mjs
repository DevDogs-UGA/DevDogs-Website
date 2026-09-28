#!/usr/bin/env node
/**
 * Entry point for the `newsletter` bin — see `src/cli.ts`'s header for why
 * this runs built JS directly rather than through `tsx`.
 *
 * Builds this package and everything it depends on first (brand, events,
 * newsletter), so an export or a send always carries the checkout's current
 * issues and club config rather than whatever `dist/` last held. `tsc` is
 * incremental, so a build with nothing to do costs about a second.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const build = spawnSync(
  "pnpm",
  ["--filter", "@devdogsuga/newsletter-cli...", "build"],
  {
    cwd: packageDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  },
);
if (build.error || build.status !== 0) {
  process.stderr.write(build.stdout ?? "");
  process.stderr.write(build.stderr ?? "");
  process.stderr.write(
    `newsletter: build failed${build.error ? ` (${build.error.message})` : ""}; nothing was exported or sent.\n`,
  );
  process.exit(build.status || 1);
}

const { main } = await import(join(packageDir, "dist", "cli.js"));
await main(process.argv.slice(2));
