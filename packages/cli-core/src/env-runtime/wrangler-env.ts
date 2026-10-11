/**
 * The mode-0600 env file `wrangler dev --env-file` reads, written to a fresh
 * private temp directory so a credential-bearing file never lands in the repo.
 */

/**
 * dotenv preserves single-quoted values byte-for-byte, including multiline
 * private keys and literal backslash sequences.
 */
export function renderWranglerEnvFile(
  env: Readonly<Record<string, string>>,
): string {
  return (
    Object.entries(env)
      .map(([key, value]) => `${key}='${value}'`)
      .join("\n") + "\n"
  );
}

export interface WranglerEnvFile {
  path: string;
  /** Idempotent; removes the file and its directory. */
  remove: () => void;
}

export async function writeWranglerEnvFile(
  env: Readonly<Record<string, string>>,
): Promise<WranglerEnvFile> {
  const [{ mkdtempSync, rmSync, writeFileSync }, { tmpdir }, { join }] =
    await Promise.all([
      import("node:fs"),
      import("node:os"),
      import("node:path"),
    ]);
  const directory = mkdtempSync(join(tmpdir(), "with-env-wrangler-"));
  const path = join(directory, ".dev.vars");
  writeFileSync(path, renderWranglerEnvFile(env), {
    encoding: "utf8",
    mode: 0o600,
  });
  return {
    path,
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}
