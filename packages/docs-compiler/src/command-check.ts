/**
 * A FAILING check, in the same family as `link-check.ts`: a shell sample that
 * names a command this monorepo does not have is not a style question, it is
 * a step a student will copy into a terminal on the Sunday before
 * competitions and watch fail.
 *
 * Two shapes, both pulled from fenced samples in `sh`, `bash`, `shell`,
 * `console`, `powershell`, `ps1` or `zsh` (parsed the same way
 * `link-check.ts` parses links, so a command mentioned in prose or inside a
 * different language's fence is never mistaken for one to run):
 *
 *   - `pnpm devtools <path...>` is checked against `devtoolsCommands`, every
 *     path `@devdogsuga/devtools`'s own command tree declares. That set is a
 *     parameter rather than anything this file knows on its own — see the
 *     header of `devtools-catalog.ts` for why, and what loads it in practice.
 *   - `pnpm --filter <pkg> [run] <script>` and a bare `pnpm run <script>` are
 *     checked against the workspace's own `package.json`s (`workspace.ts`). A
 *     bare `pnpm run` has no `--filter` to name the package, so it is read as
 *     running inside the app the docs page is about (`apps/<project-slug>`
 *     when it exists), or the workspace root otherwise — the two places a
 *     contributor is actually standing when a written command says `pnpm run`
 *     with nothing else.
 *
 * A fence opts out entirely with a `nocheck` meta word (` ```sh nocheck `),
 * for the rare page that shows a command exactly to say it is wrong.
 */
import type { Code } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { DocsPage } from "./types.js";
import type { WorkspacePackage } from "./workspace.js";

const processor = unified().use(remarkParse).use(remarkGfm);

const SHELL_LANGS = new Set([
  "sh",
  "bash",
  "shell",
  "console",
  "powershell",
  "ps1",
  "zsh",
]);

export interface CommandCheckError {
  file: string;
  line: number | null;
  message: string;
}

export interface CommandCheckOptions {
  /**
   * Every valid `devtools` command path, each one space-joined
   * (`"db migration new"`), intermediate group paths included (`"db"` is in
   * this set as well as `"db migration new"`, matching what
   * `@devdogsuga/devtools`'s own `allPaths()` enumerates). Null means the
   * catalog could not be loaded — an uninstalled or unbuilt `devtools` in
   * this checkout — and every `pnpm devtools` line is left unchecked rather
   * than failing a build that cannot possibly answer the question.
   */
  devtoolsCommands: ReadonlySet<string> | null;
  /** Every workspace package, for `pnpm --filter`. */
  packages: readonly WorkspacePackage[];
  /** `apps/<slug>` packages keyed by slug, for a bare `pnpm run`. */
  appBySlug: ReadonlyMap<string, WorkspacePackage>;
  /** The workspace root's own scripts, a bare `pnpm run`'s other fallback. */
  rootPackage: WorkspacePackage | null;
}

export function checkCommands(
  pages: readonly DocsPage[],
  options: CommandCheckOptions,
): CommandCheckError[] {
  const byPackageName = new Map<string, WorkspacePackage>();
  for (const pkg of options.packages) {
    byPackageName.set(pkg.name, pkg);
    const base = pkg.dir.split("/").at(-1);
    if (base !== undefined && !byPackageName.has(base)) {
      byPackageName.set(base, pkg);
    }
  }

  const errors: CommandCheckError[] = [];

  for (const page of pages) {
    const file =
      page.mountedFrom !== null
        ? `_shared/${page.mountedFrom}.md`
        : `${page.path}.md`;
    const tree = processor.parse(page.content);

    visit(tree, "code", (node: Code) => {
      const lang = (node.lang ?? "").toLowerCase();
      if (!SHELL_LANGS.has(lang)) return;
      if ((node.meta ?? "").split(/\s+/).includes("nocheck")) return;

      const startLine = node.position?.start.line ?? null;
      const lines = node.value.split("\n");

      lines.forEach((raw, index) => {
        const line = startLine === null ? null : startLine + 1 + index;
        checkLine(raw, line, page, file, options, byPackageName, errors);
      });
    });
  }

  return errors;
}

function checkLine(
  raw: string,
  line: number | null,
  page: DocsPage,
  file: string,
  options: CommandCheckOptions,
  byPackageName: ReadonlyMap<string, WorkspacePackage>,
  errors: CommandCheckError[],
): void {
  const trimmed = stripPromptAndComment(raw);
  const tokens = tokenize(trimmed);
  if (tokens[0] !== "pnpm") return;

  if (tokens[1] === "devtools") {
    if (options.devtoolsCommands === null) return;

    const path = takeUntilFlag(tokens.slice(2));
    if (path.length === 0) return; // bare `pnpm devtools`: nothing to check.

    if (!options.devtoolsCommands.has(path.join(" "))) {
      errors.push({
        file,
        line,
        message: `"pnpm devtools ${path.join(" ")}" is not a devtools command`,
      });
    }
    return;
  }

  if (tokens[1] === "--filter") {
    const packageName = tokens[2];
    if (packageName === undefined) return;

    let rest = tokens.slice(3);
    if (rest[0] === "run") rest = rest.slice(1);
    const script = rest[0];
    if (script === undefined) return;

    const pkg = byPackageName.get(packageName);
    if (pkg === undefined) {
      errors.push({
        file,
        line,
        message: `"pnpm --filter ${packageName}" names a package this workspace does not have`,
      });
      return;
    }

    if (!pkg.scripts.has(script)) {
      errors.push({
        file,
        line,
        message: `"${packageName}" has no "${script}" script`,
      });
    }
    return;
  }

  if (tokens[1] === "run") {
    const script = tokens[2];
    if (script === undefined) return;

    const current = options.appBySlug.get(page.project) ?? options.rootPackage;
    if (current === null || current === undefined) return;

    if (!current.scripts.has(script)) {
      errors.push({
        file,
        line,
        message: `"pnpm run ${script}" — ${current.name} has no "${script}" script`,
      });
    }
  }
}

/** Drops a leading shell prompt (`$ `, `> `) and a trailing `# comment`. */
function stripPromptAndComment(line: string): string {
  const withoutPrompt = line.replace(/^\s*[$>]\s+/, "");
  const hash = withoutPrompt.indexOf(" #");
  return (hash === -1 ? withoutPrompt : withoutPrompt.slice(0, hash)).trim();
}

function tokenize(line: string): string[] {
  return line.split(/\s+/).filter((token) => token !== "");
}

/** Tokens up to the first one that looks like a flag. */
function takeUntilFlag(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) break;
    out.push(token);
  }
  return out;
}
