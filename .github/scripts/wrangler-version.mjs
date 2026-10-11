/**
 * Reads the Worker version a `wrangler versions upload` created.
 *
 * Wrangler appends one JSON object per line to the file named by
 * `WRANGLER_OUTPUT_FILE_PATH`; the upload writes an entry of type
 * `version-upload` that carries `version_id` (and `preview_url` when previews
 * are on). The workflow sets that variable, uploads, then asks this for the id,
 * so the preview smoke test and the traffic switch name the exact version that
 * was uploaded and never "whatever is latest".
 *
 * Usage: node wrangler-version.mjs <wrangler-output.ndjson>
 * Prints `{"versionId", "workerName"}` as JSON; exits 1 when the file has no
 * upload entry.
 */
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

/**
 * @param {string} ndjson
 * @returns {{ versionId: string, workerName?: string, previewUrl?: string } | undefined} The last upload in the file.
 */
export function lastUpload(ndjson) {
  /** @type {{ versionId: string, workerName?: string, previewUrl?: string } | undefined} */
  let found;
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      entry?.type === "version-upload" &&
      typeof entry.version_id === "string"
    ) {
      found = {
        versionId: entry.version_id,
        ...(typeof entry.worker_name === "string"
          ? { workerName: entry.worker_name }
          : {}),
        ...(typeof entry.preview_url === "string"
          ? { previewUrl: entry.preview_url }
          : {}),
      };
    }
  }
  return found;
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write(
      "usage: wrangler-version.mjs <wrangler-output.ndjson>\n",
    );
    process.exit(2);
  }
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // No file means wrangler wrote nothing: the same as no upload.
  }
  const upload = lastUpload(text);
  if (!upload) {
    process.stderr.write(
      `wrangler-version: no version upload recorded in ${file}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(upload)}\n`);
}
/* c8 ignore stop */
