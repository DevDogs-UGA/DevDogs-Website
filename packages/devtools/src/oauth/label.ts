/**
 * The connect flow's default `label` — what a contributor sees on the
 * platform's approval page naming which project is asking to connect.
 * `package.json`'s own `name` wins when present (it is the more deliberate
 * answer — someone typed it into a manifest); the working directory's own
 * name is the fallback for a project with no `package.json` at all, or one
 * that failed to parse.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export function defaultLabel(cwd: string): string {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        name?: unknown;
      };
      if (typeof pkg.name === "string" && pkg.name.trim() !== "") {
        return pkg.name.trim();
      }
    } catch {
      // Falls through to the directory name below.
    }
  }
  return basename(cwd);
}
