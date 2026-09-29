import type { Step } from "../core/index.js";

/**
 * After Finish, a review that came from a docs link (one with `session`)
 * opens the next step's docs page in the browser. The URL carries what the
 * docs site needs to continue: the steps just finished (`done`, tag names,
 * comma separated) and the session id of the tab that started the review.
 * A later docs task reads `#done=...&session=...`.
 */

export const DOCS_ORIGIN = "https://devdogsuga.org";

/** Docs paths come from tag messages; only plain `/docs/...` paths are followed. */
const DOCS_PATH = /^\/docs\/[A-Za-z0-9._~\-/]*$/;

/** The step after `target` in the line, skipping `00-start` markers. */
export function nextStep(line: readonly Step[], target: Step): Step | undefined {
  const index = line.findIndex((s) => s.tag === target.tag);
  return index < 0 ? undefined : line.slice(index + 1).find((s) => s.number > 0);
}

/**
 * `https://devdogsuga.org<docs>#done=<tag>,<tag>&session=<id>`, or undefined
 * when there is no session, no next page, or the path isn't a docs path.
 */
export function handoffUrl(input: {
  nextDocs: string | undefined;
  doneTags: readonly string[];
  session: string | undefined;
}): string | undefined {
  const { nextDocs, doneTags, session } = input;
  if (!session || !nextDocs || !DOCS_PATH.test(nextDocs) || nextDocs.includes("//")) return undefined;
  const done = doneTags.map(encodeURIComponent).join(",");
  return `${DOCS_ORIGIN}${nextDocs}#done=${done}&session=${encodeURIComponent(session)}`;
}
