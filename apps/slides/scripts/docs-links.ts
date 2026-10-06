// Rewrites the site-absolute docs links a deck is written with
// (`/docs/<project>/<path>#anchor`) into the relative `.md` paths the docs
// repository requires (see DevDogsUGA's docs-kit `links.ts`): a path to the
// target's file, resolved against the folder the linking file sits in. Decks
// keep the absolute form, since they are slides too and a slide link has to
// work on the site.
//
// Where a `/docs/<project>/<rest>` link points:
//
// - A page the project has itself: `<project>/<rest>.md`, or
//   `<project>/<rest>/index.md` for a folder's own page.
// - Otherwise a `_shared` page the project mounts (the getting-started pages
//   every workshop and app shares): `_shared/<rest>.md`. A mounted copy has no
//   file of its own, so the link names the shared file, and a link into
//   another project's copy than the page's own adds `?project=<slug>`.
//
// With the docs tree at hand (`exists`), the choice is read off it and a link
// that lands nowhere throws. Without one, only the slug rules apply: a
// `getting-started/` path is shared, anything else is `<rest>.md`.
import { posix } from "node:path";

export const SHARED_DIR = "_shared";

/** Folders every project mounts from `_shared`, when the tree can't say. */
const SHARED_FOLDERS = new Set(["getting-started"]);

export interface RewriteContext {
  /** The output file's path under `docs/`, posix, e.g. `workshops/x/y.md`. */
  file: string;
  /** Whether `docs/<path>` exists. Omitted when the tree isn't available. */
  exists?: (path: string) => boolean;
}

/** The emitted-site path `/docs/...` points at, as a docs-relative file. */
function targetFile(
  project: string,
  rest: string,
  folder: boolean,
  exists: RewriteContext["exists"],
  from: string,
): { file: string; mount: boolean } {
  const own = rest === "" ? project : `${project}/${rest}`;
  const candidates = [`${own}.md`, `${own}/index.md`];
  if (rest === "") candidates.shift();
  if (folder && rest !== "") candidates.reverse();
  const shared = `${SHARED_DIR}/${rest}.md`;

  if (exists) {
    for (const candidate of candidates) {
      if (exists(candidate)) return { file: candidate, mount: false };
    }
    if (rest !== "" && exists(shared)) return { file: shared, mount: true };
    throw new Error(
      `${from}: /docs/${own} matches no page (looked for ${[...candidates, shared].join(", ")})`,
    );
  }
  if (SHARED_FOLDERS.has(rest.split("/")[0]!)) {
    return { file: shared, mount: true };
  }
  return { file: candidates[0]!, mount: false };
}

/** One `/docs/...` URL, as relative from the linking file. */
export function relativeDocsUrl(url: string, context: RewriteContext): string {
  const match = /^\/docs(?:\/([^#?]*))?(\?[^#]*)?(#.*)?$/.exec(url);
  if (!match) return url;
  const path = match[1] ?? "";
  const anchor = match[3] ?? "";
  const folder = path.endsWith("/");
  const segments = path.split("/").filter(Boolean);
  const project = segments[0];
  if (project === undefined) return url;

  const { file, mount } = targetFile(
    project,
    segments.slice(1).join("/"),
    folder,
    context.exists,
    context.file,
  );
  const ownProject = context.file.split("/")[0]!;
  const query = mount && project !== ownProject ? `?project=${project}` : "";
  const relative = posix.relative(posix.dirname(context.file), file);
  const prefixed = relative.startsWith(".") ? relative : `./${relative}`;
  return `${prefixed}${query}${anchor}`;
}

const INLINE_LINK = /\]\((\s*<?)(\/docs(?:[/#?][^)\s>]*)?)(?=[>)\s])/g;
const DEFINITION = /^( {0,3}\[[^\]]+\]:\s*<?)(\/docs(?:[/#?][^\s>]*)?)/;
// A code span: the same run of backticks opens and closes it.
const CODE_SPAN = /(`+)(?:(?!\1)[\s\S])*?\1(?!`)/g;
const FENCE = /^\s*(`{3,}|~{3,})/;

/** Rewrites every `/docs/...` Markdown link in `markdown`, outside code. */
export function rewriteDocsLinks(
  markdown: string,
  context: RewriteContext,
): string {
  let fence: string | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = FENCE.exec(line)?.[1];
      if (fence !== undefined) {
        if (
          marker?.[0] === fence[0] &&
          marker.length >= fence.length &&
          line.trim() === marker
        )
          fence = undefined;
        return line;
      }
      if (marker !== undefined) {
        fence = marker;
        return line;
      }
      const definition = DEFINITION.exec(line);
      if (definition) {
        const [whole, head, url] = definition as unknown as [
          string,
          string,
          string,
        ];
        return head + relativeDocsUrl(url, context) + line.slice(whole.length);
      }
      // Rewrite only between code spans.
      let result = "";
      let last = 0;
      const rewrite = (text: string) =>
        text.replace(INLINE_LINK, (_, head: string, url: string) => {
          return `](${head}${relativeDocsUrl(url, context)}`;
        });
      for (const span of line.matchAll(CODE_SPAN)) {
        result += rewrite(line.slice(last, span.index)) + span[0];
        last = span.index + span[0].length;
      }
      return result + rewrite(line.slice(last));
    })
    .join("\n");
}
