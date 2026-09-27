#!/usr/bin/env node

/**
 * Three modes, one binary.
 *
 * Bare `docs-compiler` compiles the markdown in the current working directory into
 * `dist/`. That is the `build` script of a content package (see
 * `docs/package.json`), which is what keeps that package free of any code: it
 * holds markdown and a manifest, and this does the work. It takes no arguments
 * and never will; anything added here has to leave it exactly as it was.
 *
 * `docs-compiler gen` walks the monorepo's shared packages (the `toolkit`
 * project; apps no longer get a generated reference of their own) and writes
 * the result into `docs/toolkit/reference/`, which the bare mode then compiles
 * like any other page. It is a separate subcommand rather than a step of the
 * bare mode because it needs the whole repo, while the bare mode only ever
 * needs the folder it is run in.
 *
 * `docs-compiler check` lints the hand-written pages in the working directory for
 * length and collapsible defects and prints what it found. A subcommand for the
 * same reason `gen` is one: the bare mode's arguments are settled. It does
 * reach one number into the bare mode, the count of what it would say, on the
 * compile summary, because a warning that only appears under a command somebody
 * has to think to run is a warning nobody ever reads.
 *
 * The bare mode also runs two FAILING checks the `check` subcommand does not:
 * `link-check.ts` (internal links have to resolve) and `command-check.ts`
 * (a documented `pnpm …` command has to be a real one). Unlike the prose lint,
 * either one failing sets the exit code — see their own headers for why they
 * are held to a different standard than page length.
 */
import * as path from "node:path";
import { checkDocs, printCheckSummary } from "./check.js";
import { compileDocs, emitDocsModule } from "./compile.js";
import { printFailingChecks, runFailingChecks } from "./failing-checks.js";

const [subcommand, ...args] = process.argv.slice(2);

if (subcommand === undefined) {
  const contentRoot = process.cwd();
  const outDir = path.join(contentRoot, "dist");

  const count = emitDocsModule(contentRoot, outDir);

  // The lint runs here too, and only its count is printed. This line is in
  // front of everyone on every `pnpm dev` and every `pnpm build`, which is the
  // only reason the rules get read at all; it stays to one line because that is
  // the whole of what this mode has ever printed, and the detail is one command
  // away. The exit code does not change: `check` is warn-only, and the bare
  // mode has never had a way to fail that was not a thrown error.
  const lint = checkDocs(contentRoot);
  const budget =
    lint.warnings.length === 0
      ? "no budget warnings"
      : `${lint.warnings.length} budget warning(s) (docs-compiler check for detail)`;

  console.log(
    `[docs-compiler] compiled ${count} page(s) from ${path.basename(contentRoot)}/ — ${budget}`,
  );

  // Re-parses rather than threading `pages` out of `emitDocsModule`: that
  // function's contract is "write dist/ and return a count", and every other
  // caller (the content package's `build` script) still just wants that.
  // `compileDocs` throws on the same authoring mistakes `emitDocsModule` does
  // (an unknown mount target, a bad `section`), so a broken page is reported
  // once, above, and never reaches here a second time.
  const { pages } = compileDocs(contentRoot);
  const failing = await runFailingChecks(contentRoot, pages);
  printFailingChecks(failing);
  if (failing.linkErrors.length + failing.commandErrors.length > 0) {
    process.exitCode = 1;
  }
} else if (subcommand === "check") {
  // Same contract as the bare mode: the working directory is the content root.
  const contentRoot = process.cwd();

  printCheckSummary(checkDocs(contentRoot), contentRoot);

  // Exit 0, warnings or not, and that is the agreed behaviour rather than an
  // oversight. See the head of check.ts for why a prose budget that could fail
  // a build would make the docs worse instead of shorter.
} else if (subcommand === "gen") {
  // Imported here rather than at the top of the file: the generator pulls in
  // the TypeScript compiler, and the bare mode, which every content build runs,
  // has no use for it.
  const { generateReference } = await import("./gen/run.js");
  const { findRepoRoot } = await import("./gen/program.js");

  const repoRoot = findRepoRoot(process.cwd());

  // The generator prints its own summary, and nothing here inspects it, because
  // nothing it reports is a failure: it reports doc-comment coverage on every
  // run and never enforces it, and an extractor that cannot read a file warns
  // and carries on.
  generateReference({
    repoRoot,
    docsRoot: path.join(repoRoot, "docs"),
    dryRun: args.includes("--dry-run"),
  });
} else {
  console.error(`[docs-compiler] unknown command "${subcommand}"`);
  console.error(
    "[docs-compiler] usage: docs-compiler | docs-compiler check | docs-compiler gen [--dry-run]",
  );
  process.exitCode = 1;
}
