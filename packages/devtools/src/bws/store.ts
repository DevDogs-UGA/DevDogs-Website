/**
 * Saving a prompted value into the developer's own `.env`.
 *
 * The development file only, by construction: the path is fixed to
 * `fileFor("development")`, so no caller can point this at a vault target's
 * file. Those are what `env push` uploads, and the values saved here
 * (`BWS_ACCESS_TOKEN`, `BWS_ORG_ID`) exist so they never ride a push. The
 * token is refused there by name anyway; this keeps the write from ever being
 * the thing that needs refusing.
 *
 * `EnvDocument.set` revives the commented line the rendered file already
 * carries (never-store keys ship as `# KEY=""` with their documentation), so a
 * saved value lands under its own doc comment rather than appended bare.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EnvDocument } from "../env/document.js";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { loadEnv } from "@devdogsuga/cli-core/repo/peers";

export async function saveToDevEnv(key: string, value: string): Promise<void> {
  const { fileFor } = await loadEnv();
  const path = resolve(findRepoRoot(), fileFor("development"));
  let doc: EnvDocument;
  try {
    doc = EnvDocument.parse(await readFile(path, "utf8"));
  } catch {
    doc = EnvDocument.empty();
  }
  doc.set(key, value);
  await writeFile(path, doc.toString());
}
