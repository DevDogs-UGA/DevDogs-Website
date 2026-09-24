/**
 * `pnpm newsletter`'s real entry point. Ships built JS (see this package's
 * `build` script) and is run directly with plain `node` via `bin/newsletter.mjs`
 * — no `tsx`, no dev-time compilation. This package is never published (see
 * `package.json`'s `"private": true` and the README), so "built JS" here
 * only ever means "checked into `dist/` for a local Backstage checkout",
 * unlike `@devdogsuga/devtools`' identically-shaped bin, which ships built
 * JS because it publishes to npm.
 */
import { runNewsletter } from "./commands.js";

export async function main(argv: string[]): Promise<void> {
  await runNewsletter(argv);
  process.exit(process.exitCode ?? 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv.slice(2));
}
