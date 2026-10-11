import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Whether `metaUrl` (a module's `import.meta.url`) is the script node was
 * started with. Symlinks are resolved on both sides: node reports the real
 * path in `import.meta.url` but leaves `process.argv[1]` as typed.
 *
 * @param {string} metaUrl
 */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
