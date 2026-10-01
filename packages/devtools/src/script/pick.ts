/**
 * The package-script picker's choices: pure, so the lookups are testable
 * without a terminal.
 *
 * Two ways in, one result. By package: pick a package, then one of its
 * scripts. By script: pick a script, then one of the packages that has it.
 * Either way the answer is a package name and a script name, which become
 * `pnpm -F <package> run <script>`.
 */
import type { ScriptPackage } from "../check/scripts.js";

/** A package `pnpm -F` can address, with the scripts it defines. */
export interface Runnable {
  /** The name `-F` takes. */
  name: string;
  /** Workspace-relative directory, for the hint and for matching a typed name. */
  dir: string;
  scripts: Readonly<Record<string, string>>;
}

/** Packages with a name and at least one script, in workspace order. */
export function runnablePackages(
  packages: readonly ScriptPackage[],
): Runnable[] {
  return packages.flatMap((pkg) =>
    pkg.name && Object.keys(pkg.scripts).length > 0
      ? [{ name: pkg.name, dir: pkg.dir, scripts: pkg.scripts }]
      : [],
  );
}

/** Every script name and how many packages define it, most common first. */
export function scriptNames(
  packages: readonly Runnable[],
): { script: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pkg of packages) {
    for (const script of Object.keys(pkg.scripts)) {
      counts.set(script, (counts.get(script) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([script, count]) => ({ script, count }))
    .sort((a, b) => b.count - a.count || a.script.localeCompare(b.script));
}

/** The packages that define `script`. */
export function packagesWith(
  packages: readonly Runnable[],
  script: string,
): Runnable[] {
  return packages.filter((pkg) => script in pkg.scripts);
}

/**
 * Finds a package from what somebody typed: its exact name, its directory, or
 * the last segment of its name (`platform` for `@devdogsuga/platform`).
 * `null` when nothing matches or when the short form is ambiguous.
 */
export function findPackage(
  packages: readonly Runnable[],
  typed: string,
): Runnable | null {
  const exact = packages.find((pkg) => pkg.name === typed || pkg.dir === typed);
  if (exact) return exact;
  const short = packages.filter((pkg) => pkg.name.split("/").pop() === typed);
  return short.length === 1 ? short[0]! : null;
}

/** The arguments `pnpm` gets: `-F <package> run <script> [extra…]`. */
export function scriptArgs(
  pkg: Pick<Runnable, "name">,
  script: string,
  extra: readonly string[] = [],
): string[] {
  return ["-F", pkg.name, "run", script, ...extra];
}
