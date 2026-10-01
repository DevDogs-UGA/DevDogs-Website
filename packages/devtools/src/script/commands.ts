/**
 * `devtools script [<package> <script> [args…]]`: the package-script picker.
 *
 * Typed with a package and a script it runs them; with nothing, it asks. The
 * choice is made against the real `package.json` scripts, so there is no list
 * here to fall out of step. It runs `pnpm -F <package> run <script>` through
 * the process-group runner (stopping it stops everything it started) and
 * prints the resolved command after it finishes, where the tool's own output
 * cannot bury it.
 */
import { select } from "@clack/prompts";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isNonInteractive } from "@devdogsuga/cli-core/mode";
import { reportRan, runInGroup } from "@devdogsuga/cli-core/process-group";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { explain, unwrap } from "@devdogsuga/cli-core/ui";
import { readScriptPackages } from "../check/scripts.js";
import {
  findPackage,
  packagesWith,
  runnablePackages,
  scriptArgs,
  scriptNames,
  type Runnable,
} from "./pick.js";

/** Long script bodies would push the choice off the line. */
function clip(text: string, max = 58): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function chooseScript(pkg: Runnable): Promise<string> {
  return unwrap(
    await select<string>({
      message: `Which script in ${pkg.name}?`,
      options: Object.entries(pkg.scripts).map(([script, body]) => ({
        value: script,
        label: script,
        hint: clip(body),
      })),
    }),
  );
}

async function chooseByPackage(
  packages: readonly Runnable[],
): Promise<[Runnable, string]> {
  const name = unwrap(
    await select<string>({
      message: "Which package?",
      options: packages.map((pkg) => ({
        value: pkg.name,
        label: pkg.name,
        hint: `${pkg.dir} · ${Object.keys(pkg.scripts).length} scripts`,
      })),
    }),
  );
  const pkg = packages.find((candidate) => candidate.name === name)!;
  return [pkg, await chooseScript(pkg)];
}

async function chooseByScript(
  packages: readonly Runnable[],
): Promise<[Runnable, string]> {
  const script = unwrap(
    await select<string>({
      message: "Which script?",
      options: scriptNames(packages).map(({ script, count }) => ({
        value: script,
        label: script,
        hint: `${count} ${count === 1 ? "package" : "packages"}`,
      })),
    }),
  );
  const having = packagesWith(packages, script);
  if (having.length === 1) return [having[0]!, script];
  const name = unwrap(
    await select<string>({
      message: `Run ${script} in which package?`,
      options: having.map((pkg) => ({
        value: pkg.name,
        label: pkg.name,
        hint: clip(pkg.scripts[script]!),
      })),
    }),
  );
  return [having.find((pkg) => pkg.name === name)!, script];
}

async function choose(
  packages: readonly Runnable[],
): Promise<[Runnable, string]> {
  const how = unwrap(
    await select<"package" | "script">({
      message: "Find it by",
      options: [
        { value: "package", label: "Package", hint: "then pick its script" },
        { value: "script", label: "Script", hint: "then pick a package" },
      ],
    }),
  );
  return how === "package"
    ? chooseByPackage(packages)
    : chooseByScript(packages);
}

export const handleScript: CommandHandler = async (rest) => {
  const root = findRepoRoot();
  const packages = runnablePackages(readScriptPackages(root));
  const [typedPackage, typedScript, ...extra] = rest;

  let pkg: Runnable;
  let script: string;
  if (typedPackage === undefined) {
    if (isNonInteractive()) {
      explain(
        "devtools script: name a package and a script when there is no terminal to ask.",
        "",
        ["pnpm devtools script <package> <script>"],
      );
      process.exitCode = 1;
      return null;
    }
    [pkg, script] = await choose(packages);
  } else {
    const found = findPackage(packages, typedPackage);
    if (
      !found ||
      typedScript === undefined ||
      !(typedScript in found.scripts)
    ) {
      explain(
        !found
          ? `devtools script: no package matches "${typedPackage}".`
          : `devtools script: ${found.name} has no script "${typedScript ?? ""}".`,
        "",
        ["pnpm devtools script   (with no arguments, to pick from a list)"],
      );
      process.exitCode = 1;
      return null;
    }
    [pkg, script] = [found, typedScript];
  }

  const args = scriptArgs(pkg, script, extra);
  const result = await runInGroup("pnpm", args, { cwd: root });
  reportRan("pnpm", args, result);
  process.exitCode = result.code;
  return result.code === 0 ? DONE : null;
};
