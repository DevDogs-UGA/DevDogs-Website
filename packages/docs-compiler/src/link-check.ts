/**
 * A FAILING check, unlike everything in `check.ts`: a link that does not
 * resolve is not a judgment call about prose length, it is a 404 a reader
 * hits, and the contract (§2 internal links) asks for the build to say so
 * before it ships one.
 *
 * Two shapes are checked, both of them how this content actually links to
 * itself: an absolute `/docs/<project>/<path>(#anchor)` URL, the one a
 * reader's browser bar shows, and a relative `*.md` link, the one a
 * contributor writes while looking at the file next to the one they are
 * editing. Anything else — `https://`, `mailto:`, a bare `#anchor` with no
 * page component when this page itself has no such heading — is either
 * external or already covered by a different rule, and is left alone.
 *
 * Pages are read as markdown (`remark-parse` + `remark-gfm`, matching
 * `parse.ts`) rather than scanned line by line, so a link written inside a
 * fenced sample or a code span is never mistaken for a real one: the parser
 * already drew that line for `parse.ts`'s heading extraction, and a second,
 * looser reading here would only be a second place for the two to disagree.
 *
 * Checked against the compiled `pages` array, after mounting: a `_shared`
 * page that links to a sibling by relative path is checked once per project
 * it mounts into, since the same relative path can resolve to a different
 * page depending which project's tree it lands in.
 */
import type { Link } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { DocsPage } from "./types.js";

const processor = unified().use(remarkParse).use(remarkGfm);

export interface LinkCheckError {
  /** The page the broken link was found on, `.md` included. */
  file: string;
  /** 1-based, relative to the page's body (frontmatter already stripped). */
  line: number | null;
  message: string;
}

/** Where a link resolves to, before it is looked up. */
interface Target {
  /** A `DocsPage.path`: `<project>/<rest>`. */
  path: string;
  anchor: string | null;
}

/**
 * Every internal link that does not resolve, across every page (mounted
 * copies included, each checked against the project it landed in).
 */
export function checkLinks(pages: readonly DocsPage[]): LinkCheckError[] {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const errors: LinkCheckError[] = [];

  for (const page of pages) {
    const file = labelFor(page);
    const tree = processor.parse(page.content);

    visit(tree, "link", (node: Link) => {
      const target = resolveTarget(node.url, page);
      if (target === null) return;

      const line = node.position?.start.line ?? null;
      const targetPage = byPath.get(target.path);

      if (targetPage === undefined) {
        errors.push({
          file,
          line,
          message: `links to "${node.url}", which does not resolve to a page (looked for "${target.path}")`,
        });
        return;
      }

      if (target.anchor !== null) {
        const known = targetPage.headings.some((h) => h.id === target.anchor);
        if (!known) {
          errors.push({
            file,
            line,
            message: `links to "${node.url}" — "${target.path}" has no heading with id "${target.anchor}"`,
          });
        }
      }
    });
  }

  return errors;
}

function labelFor(page: DocsPage): string {
  return page.mountedFrom !== null
    ? `_shared/${page.mountedFrom}.md`
    : `${page.path}.md`;
}

/**
 * What a link's `url` points at, or null when it is out of this check's scope
 * (external, a mailto, an image-only anchor, or a page that carries no
 * anchor at all to be wrong about).
 */
function resolveTarget(url: string, page: DocsPage): Target | null {
  const hash = url.indexOf("#");
  const bare = hash === -1 ? url : url.slice(0, hash);
  const anchor = hash === -1 ? null : url.slice(hash + 1) || null;

  if (bare.startsWith("/docs/")) {
    const rest = bare.slice("/docs/".length).replace(/\/+$/, "");
    if (rest === "") return null; // the landing page itself, not one project's.

    const slash = rest.indexOf("/");
    const project = slash === -1 ? rest : rest.slice(0, slash);
    const tail = slash === -1 ? "" : rest.slice(slash + 1);
    return { path: tail === "" ? `${project}/index` : `${project}/${tail}`, anchor };
  }

  if (bare === "") {
    return anchor === null ? null : { path: page.path, anchor };
  }

  const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(bare) || bare.startsWith("//");
  if (!isExternal && !bare.startsWith("/") && bare.endsWith(".md")) {
    const dir = dirname(page.path);
    return { path: normalise(join(dir, bare.slice(0, -".md".length))), anchor };
  }

  return null;
}

/* Posix-style path helpers, deliberately not `node:path`: every `DocsPage`
 * path is already posix-separated and relative, so pulling in the platform's
 * own path module would only risk it disagreeing with itself on Windows. */

function dirname(p: string): string {
  const at = p.lastIndexOf("/");
  return at === -1 ? "" : p.slice(0, at);
}

function join(dir: string, rel: string): string {
  return dir === "" ? rel : `${dir}/${rel}`;
}

function normalise(p: string): string {
  const out: string[] = [];
  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}
