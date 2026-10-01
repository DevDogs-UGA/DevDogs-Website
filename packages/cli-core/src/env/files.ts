/**
 * Reading and writing a target's env file, shared by every command that edits
 * one: devtools' `env reset`, and backstage's `env pull|push` and `planner`.
 */
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EnvTarget } from "@devdogsuga/env";
import { getEnvSync } from "../repo/peers.js";
import { findRepoRoot } from "../repo/root.js";
import { EnvDocument } from "./document.js";

/** The parsed file, or an empty document when it is missing or unreadable. */
export async function readDocument(path: string): Promise<EnvDocument> {
  try {
    return EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    return EnvDocument.empty();
  }
}

/**
 * The file a command works on: the target's, unless `--file` overrides it.
 *
 * The default is the whole fix. `--target staging` reads and writes
 * `.env.staging` for pull, push AND audit, where it used to reach the root
 * `.env`. That meant pushing "staging" uploaded the development values, and
 * pulling "staging" overwrote the development file. Every caller passes the
 * target explicitly so no future one can inherit `.env` by omission.
 */
export function pathFor(target: EnvTarget, file?: string): string {
  return resolve(findRepoRoot(), file ?? getEnvSync().fileFor(target));
}

/**
 * Writes the document, tidying first.
 *
 * `group()` runs on every write rather than as its own command: files drift a
 * line at a time, and a tidy pass nobody remembers to run is a tidy pass that
 * never happens.
 *
 * Env files contain credentials and must not be world-readable. The mode
 * parameter only applies on creation, so existing world-readable files are
 * tightened with chmod after each write.
 */
export async function save(path: string, doc: EnvDocument): Promise<boolean> {
  const moved = doc.group();
  await writeFile(path, doc.toString(), { mode: 0o600 });
  await chmod(path, 0o600);
  return moved;
}
