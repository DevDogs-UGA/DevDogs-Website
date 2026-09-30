import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

/**
 * Launches a real VS Code with the extension loaded against a throwaway clone
 * of the web workshop repo (the slides submodule, tags included), then runs
 * `suite.ts` inside it. The clone points `origin` at the GitHub URL the
 * extension expects and `insteadOf` back to the local copy, so `git fetch`
 * works offline and nothing here touches the network or the submodule.
 *
 * Run under `xvfb-run -a` on a headless machine: `pnpm test:vscode`.
 */

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/**
 * The VS Code the smoke test downloads: pinned so a run is reproducible and a
 * new VS Code release can't turn CI red by itself. Bump it deliberately (the
 * CI cache key follows this file). `VSCODE_TEST_VERSION` overrides it, e.g.
 * `1.93.0` to try the extension's minimum.
 */
const VSCODE_VERSION = process.env["VSCODE_TEST_VERSION"] ?? "1.139.1";

async function main(): Promise<void> {
  const packageDir = resolve(__dirname, "..");
  const source = resolve(packageDir, "../slides/workshops/web");
  const scratch = mkdtempSync(join(tmpdir(), "workshops-vscode-e2e-"));
  const clone = join(scratch, "Web-Workshops");

  try {
    execFileSync("git", ["clone", "-q", "--no-hardlinks", source, clone], {
      stdio: "inherit",
    });
    const github = "https://github.com/DevDogsUGA/Web-Workshops.git";
    git(clone, "remote", "set-url", "origin", github);
    git(clone, "config", `url.${source}.insteadOf`, github);
    git(clone, "config", "user.name", "Smoke Test");
    git(clone, "config", "user.email", "smoke@example.com");
    git(clone, "checkout", "-q", "--detach", "02-supabase/00-start");
    // A harmless step command, so the terminal path runs for real (the
    // published tag's own command is a network install).
    const message = git(
      clone,
      "tag",
      "-l",
      "--format=%(contents)",
      "02-supabase/01-read",
    ).replace(/^Run: .*$/m, "Run: echo ran > ran.txt");
    writeFileSync(join(scratch, "tag-message"), message);
    git(
      clone,
      "tag",
      "-f",
      "-a",
      "-F",
      join(scratch, "tag-message"),
      "02-supabase/01-read",
      "02-supabase/01-read^{commit}",
    );

    const userData = join(scratch, "user-data");
    mkdirSync(join(userData, "User"), { recursive: true });
    // The extension follows live workshops on its own; the suite turns that on
    // against a fake relay, so nothing here reaches the real one.
    writeFileSync(
      join(userData, "User", "settings.json"),
      JSON.stringify({ "devdogsWorkshops.followLive": false }),
    );
    await runTests({
      version: VSCODE_VERSION,
      extensionDevelopmentPath: packageDir,
      extensionTestsPath: join(__dirname, "suite.js"),
      launchArgs: [
        clone,
        "--user-data-dir",
        userData,
        "--disable-extensions",
        "--disable-workspace-trust",
        "--no-sandbox",
      ],
      extensionTestsEnv: { SMOKE_CLONE: clone, DEVDOGS_WORKSHOPS_DEBUG: "1" },
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
