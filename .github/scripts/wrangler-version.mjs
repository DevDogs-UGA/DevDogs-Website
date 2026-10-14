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
 * Usage:
 *   node wrangler-version.mjs <wrangler-output.ndjson>
 *     Prints `{"versionId", "workerName"}` as JSON; exits 1 when the file has
 *     no upload entry.
 *   node wrangler-version.mjs --active <deployments-status.json>
 *     Prints the version id serving the most traffic; exits 1 if none.
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

/**
 * The version serving the most traffic, from `wrangler deployments status
 * --json`. This is what the deploy rolls back to if the new version fails
 * after the traffic switch.
 *
 * @param {string} json
 * @returns {string | undefined}
 */
export function activeVersion(json) {
  // `pnpm exec` prints its own lines ("Already up to date", "Done in …") to
  // stdout ahead of wrangler's JSON, so parse from the first line that opens
  // the object when the whole text is not JSON.
  let status;
  try {
    status = JSON.parse(json);
  } catch {
    const start = json.search(/^\{/m);
    if (start < 0) return undefined;
    try {
      status = JSON.parse(json.slice(start));
    } catch {
      return undefined;
    }
  }
  const versions = Array.isArray(status?.versions) ? status.versions : [];
  let best;
  for (const v of versions) {
    if (typeof v?.version_id !== "string") continue;
    if (!best || (v.percentage ?? 0) > (best.percentage ?? 0)) best = v;
  }
  return best?.version_id;
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  if (process.argv[2] === "--active") {
    let text = "";
    try {
      text = readFileSync(process.argv[3] ?? "", "utf8");
    } catch {
      // Nothing to read means no known active version.
    }
    const active = activeVersion(text);
    if (!active) {
      process.stderr.write("wrangler-version: no active version found\n");
      process.exit(1);
    }
    process.stdout.write(`${active}\n`);
    process.exit(0);
  }
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
