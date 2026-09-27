/**
 * Wires `link-check.ts` and `command-check.ts` together for the bare mode:
 * gathers what each needs (the compiled pages, the workspace's own packages,
 * devtools' command catalog when it is reachable), runs both, and prints
 * anything either one found in the one shape `cli.ts` needs to decide an exit
 * code from.
 *
 * Both checks are content problems, not code problems, so neither one throws:
 * a page that cannot be parsed already failed earlier, inside
 * `emitDocsModule`. What reaches here are genuine broken links and commands,
 * and `cli.ts` is the only thing that gets to turn that into a failed build.
 */
import { checkCommands } from "./command-check.js";
import type { CommandCheckError } from "./command-check.js";
import { loadDevtoolsCommands } from "./devtools-catalog.js";
import { checkLinks } from "./link-check.js";
import type { LinkCheckError } from "./link-check.js";
import type { DocsPage } from "./types.js";
import {
  appPackagesBySlug,
  discoverWorkspacePackages,
  findWorkspaceRoot,
  readRootPackage,
} from "./workspace.js";

export interface FailingChecksResult {
  linkErrors: LinkCheckError[];
  commandErrors: CommandCheckError[];
}

/**
 * `contentRoot` is where the bare mode is standing (normally `docs/`);
 * `pages` is what `compileDocs` just produced from it, mounting included.
 *
 * The workspace walk and the devtools catalog are both best-effort: a content
 * package built on its own, with no monorepo above it, has no workspace to
 * check `pnpm --filter`/`pnpm run` against and no devtools to check
 * `pnpm devtools` against, so both checks quietly narrow to whichever half
 * they can still answer rather than failing a build that has no way to know.
 */
export async function runFailingChecks(
  contentRoot: string,
  pages: readonly DocsPage[],
): Promise<FailingChecksResult> {
  const linkErrors = checkLinks(pages);

  const repoRoot = findWorkspaceRoot(contentRoot);
  if (repoRoot === null) {
    return { linkErrors, commandErrors: [] };
  }

  const packages = discoverWorkspacePackages(repoRoot);
  const commandErrors = checkCommands(pages, {
    devtoolsCommands: await loadDevtoolsCommands(repoRoot),
    packages,
    appBySlug: appPackagesBySlug(packages),
    rootPackage: readRootPackage(repoRoot),
  });

  return { linkErrors, commandErrors };
}

/** Prints every error found, `path:line: message`, and says how many. */
export function printFailingChecks(result: FailingChecksResult): void {
  const all = [...result.linkErrors, ...result.commandErrors];
  if (all.length === 0) return;

  console.error(`[docs-compiler] ${all.length} error(s):`);
  for (const error of all) {
    const at = error.line === null ? "" : `:${error.line}`;
    console.error(`[docs-compiler] error: ${error.file}${at}: ${error.message}`);
  }
}
