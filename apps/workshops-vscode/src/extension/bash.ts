import { win32 } from "node:path";

/**
 * Which bash the "Workshop" terminal runs. Step commands are written for
 * bash (`\` continuations, `$VAR`, `export`), and PowerShell/cmd break that,
 * so the terminal is always bash: the system one on macOS, Linux and WSL, and
 * Git Bash on native Windows, found relative to `git --exec-path`.
 */

export interface BashLookup {
  platform: NodeJS.Platform;
  /** Output of `git --exec-path`; on Windows something like `C:\Program Files\Git\mingw64\libexec\git-core`. */
  gitExecPath: string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  exists(path: string): boolean;
}

/** Where Git Bash may live on Windows, best guess first. */
export function windowsBashCandidates(
  lookup: Pick<BashLookup, "gitExecPath" | "env">,
): string[] {
  const out: string[] = [];
  const exec = lookup.gitExecPath?.trim();
  if (exec) {
    // Git for Windows: <root>\mingw64\libexec\git-core -> <root>\bin\bash.exe (three up);
    // older or portable layouts put it two up, or under usr\bin.
    out.push(
      win32.resolve(exec, "..", "..", "bin", "bash.exe"),
      win32.resolve(exec, "..", "..", "..", "bin", "bash.exe"),
      win32.resolve(exec, "..", "..", "..", "usr", "bin", "bash.exe"),
      win32.resolve(exec, "..", "..", "usr", "bin", "bash.exe"),
    );
  }
  const roots = [
    lookup.env["ProgramFiles"],
    lookup.env["ProgramFiles(x86)"],
    lookup.env["LOCALAPPDATA"] &&
      win32.join(lookup.env["LOCALAPPDATA"], "Programs"),
  ].filter((r): r is string => Boolean(r));
  for (const root of roots)
    out.push(win32.join(root, "Git", "bin", "bash.exe"));
  return [...new Set(out)];
}

/**
 * The bash to launch, or undefined when there is none (native Windows without
 * Git Bash): the caller then falls back to the default shell, one line at a
 * time. Never returns the WSL launcher in System32, which isn't Git Bash.
 */
export function resolveBash(lookup: BashLookup): string | undefined {
  if (lookup.platform !== "win32") return "bash";
  return windowsBashCandidates(lookup).find((path) => lookup.exists(path));
}
