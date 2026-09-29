import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Throwaway git repos for tests. Synchronous and shell-free, like the code
 * under test, and isolated from the developer's own git config.
 */

const ISOLATED_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: ISOLATED_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export class TestRepo {
  readonly dir: string;

  constructor(dir = mkdtempSync(join(tmpdir(), "workshops-vscode-"))) {
    this.dir = dir;
  }

  static init(): TestRepo {
    const repo = new TestRepo();
    sh(repo.dir, "init", "-q", "-b", "main");
    return repo;
  }

  git(...args: string[]): string {
    return sh(this.dir, ...args);
  }

  /** Writes files (null deletes), stages everything, commits. Returns the sha. */
  commit(files: Record<string, string | Buffer | null>, message = "commit"): string {
    for (const [path, content] of Object.entries(files)) {
      const full = join(this.dir, path);
      if (content === null) rmSync(full, { force: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
    }
    this.git("add", "-A");
    this.git("commit", "-q", "--allow-empty", "-m", message);
    return this.git("rev-parse", "HEAD").trim();
  }

  /** Annotated tag with `message`, or a lightweight tag when it's omitted. */
  tag(name: string, message?: string): void {
    if (message === undefined) this.git("tag", name);
    else this.git("tag", "-a", name, "-m", message);
  }

  write(path: string, content: string): void {
    const full = join(this.dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }

  dispose(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
