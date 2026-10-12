/**
 * The two env files a product keeps, and the manifest they come from.
 *
 *   * `.env.example` is committed and holds public values only. It is the
 *     manifest: `setup` writes `.env` from it, and the Flutter build reads
 *     `.env` with `--dart-define-from-file=.env`, so everything in it ships in
 *     the app. CI rejects a secret-looking key in it.
 *   * `.env.tooling` is git-ignored and holds what the tooling needs and the
 *     app must never see: the database URL and the secret key.
 *
 * Values are written unquoted: Flutter's `--dart-define-from-file` reads
 * `KEY=value` lines and keeps quotes as part of the value.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "dotenv";

export function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parse(readFileSync(path, "utf8")) : {};
}

/** Sets `values` in an env file, keeping every other line (comments included) as it was. */
export function upsertEnvFile(
  path: string,
  values: Record<string, string>,
  header?: string,
): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines =
    existing.length > 0 ? existing.replace(/\n$/, "").split("\n") : [];
  if (lines.length === 0 && header) lines.push(header);
  const remaining = new Map(Object.entries(values));
  const updated = lines.map((line) => {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      line,
    )?.[1];
    if (key === undefined || !remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of remaining) updated.push(`${key}=${value}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${updated.join("\n")}\n`, { mode: 0o600 });
}

/**
 * Makes sure `relPath` (relative to `root`) is ignored by git, adding it to
 * the root `.gitignore` when it is not. Returns true when it had to add it.
 *
 * Flutter's default `.gitignore` ignores none of `.env`, `.env.tooling` or
 * `.env.local`, and `.env.tooling` holds the database URL, the secret key and
 * the OAuth client secret, so devtools does not leave that to chance. Outside a
 * git work tree (or with no git) there is nothing to commit to, and it does
 * nothing.
 */
export function ensureGitignored(root: string, relPath: string): boolean {
  const check = spawnSync("git", ["check-ignore", "-q", "--", relPath], {
    cwd: root,
    stdio: "ignore",
  });
  // 0: ignored. 1: inside a work tree and not ignored. Anything else: not a
  // repository, or no git.
  if (check.error || check.status !== 1) return false;
  const file = join(root, ".gitignore");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lead = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  appendFileSync(file, `${lead}/${relPath}\n`);
  return true;
}

/** The keys of a manifest, in order. */
export function manifestKeys(text: string): string[] {
  return Object.keys(parse(text));
}

/**
 * `.env` for a fresh checkout: the manifest's own lines and comments, with
 * `overrides` applied. Keys the manifest does not declare are not added; the
 * file stays public-only by construction.
 */
export function renderEnvFromManifest(
  manifest: string,
  overrides: Record<string, string>,
): string {
  const declared = new Set(manifestKeys(manifest));
  const lines = manifest
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
        line,
      )?.[1];
      if (key === undefined) return line;
      const value = overrides[key];
      return value === undefined ? line : `${key}=${value}`;
    });
  for (const key of Object.keys(overrides)) {
    if (!declared.has(key)) {
      throw new Error(
        `${key} is not in the manifest; add it to .env.example (public values only) first.`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Key names that mean a secret. `API_KEY` is not here: a browser Maps key is public by design. */
const SECRET_KEY_NAME =
  /(?:^|_)(?:SECRET|PASSWORD|PASSWD|PRIVATE|TOKEN|SERVICE_ROLE|CREDENTIALS?)(?:_|$)|(?:^|_)(?:DB|DATABASE|POSTGRES|PG)_(?:URL|URI|PASSWORD)(?:_|$)/i;

/** Values that look like a secret whatever the key is called. */
const SECRET_VALUE: [RegExp, string][] = [
  [/sb_secret_/, "a Supabase secret key"],
  [/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/i, "a database URL with a password"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bwhsec_[A-Za-z0-9+/=]{16,}/, "a webhook signing secret"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
];

export interface SecretFinding {
  key: string;
  reason: string;
}

/** Secret-looking entries in a manifest. The manifest ships in the app, so none may pass. */
export function findSecrets(manifest: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [key, value] of Object.entries(parse(manifest))) {
    if (SECRET_KEY_NAME.test(key)) {
      findings.push({ key, reason: "its name says it is a secret" });
      continue;
    }
    const hit = SECRET_VALUE.find(([pattern]) => pattern.test(value));
    if (hit) findings.push({ key, reason: `its value looks like ${hit[1]}` });
  }
  return findings;
}
