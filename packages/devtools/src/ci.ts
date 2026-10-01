/**
 * `devtools-ci deploy <app|step> [flags]`
 *
 * The CI entry point. No wizard and no `@clack/prompts`. Commands that create
 * the deploy env file run through the bare `ci` package script; commands that
 * consume that file run through `ci:env`, which wraps this same entry point in
 * `with-env`. Every command runs in GitHub Actions and reports failures by
 * exiting non-zero. The commands themselves live in `deploy/commands.ts`.
 *
 * ## Why a separate bin
 *
 * The contributor CLI (`devtools`) prompts interactively and wraps output in
 * clack's box-drawing. None of that belongs in a deploy job. This entry point
 * never imports clack, so a caller that pipes its stdout is never surprised by
 * a banner landing on that stream. `with-env` reports its selected file on
 * stderr, leaving the command's stdout protocol intact.
 */
import { ignoreClosedPipes } from "@devdogsuga/cli-core/pipes";
import {
  captureDevtoolsError,
  initDevtoolsTelemetry,
} from "@devdogsuga/cli-core/telemetry";
import { catalog } from "./catalog.js";
import { runDeployCommand } from "./deploy/commands.js";

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;

  // Same bootstrap point as `cli.ts`'s `main()`: after `argv` is split, before
  // any dispatch below. `[first, rest[0]]` names the step (`deploy
  // secrets-file`, `deploy platform`, …) as the `command` tag rather than just
  // "deploy", which every invocation here would otherwise share.
  ignoreClosedPipes();
  initDevtoolsTelemetry([first, rest[0]].filter(Boolean).join(" ") || "help");

  if (!first || first === "--help" || first === "-h") {
    const steps = catalog.subcommandCiNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    process.stdout.write(
      [
        "devtools-ci <command>",
        "",
        "Commands:",
        `  ${"deploy".padEnd(width)}Deploy an app or run a deploy step.`,
        "",
        "Run `devtools-ci deploy` for the full step list.",
        "",
      ].join("\n"),
    );
    return;
  }

  if (first === "deploy") {
    await runDeployCommand(rest);
    return;
  }

  process.stderr.write(`devtools-ci: unknown command "${first}".\n`);
  process.exitCode = 1;
}

// Run only from `src/launch-ci.ts` (via the `devtools-ci` bin) or from a
// bare `run ci` package script for the steps that must not go through
// `with-env`'s replacement at all — see that file's header. Never
// self-invoking here: importing this module must not run anything, so
// `launch-ci.ts` can resolve the deploy tier and enter its environment
// first.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(async (err) => {
    process.stderr.write(
      `devtools-ci: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    // Report BEFORE exiting — see `captureDevtoolsError`'s header.
    await captureDevtoolsError(err);
    process.exitCode = 1;
  });
}
