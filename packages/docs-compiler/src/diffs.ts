/**
 * File diffs: a fenced `diff` block that names its file becomes a placeholder
 * the platform renders as a diff viewer, rather than a highlighted code block.
 *
 * ````md
 * ```diff file=components/Guestbook.tsx lang=tsx
 * --- a/components/Guestbook.tsx
 * +++ b/components/Guestbook.tsx
 * @@ -1,4 +1,5 @@
 *  "use client";
 * -import { useState } from "react";
 * +import { useEffect, useState } from "react";
 * ```
 * ````
 *
 * The body is a real unified diff, `---`/`+++` headers included, so the
 * markdown still reads as a diff anywhere else (GitHub renders it as one).
 * `lang` is the file's language, for highlighting its lines; it defaults to
 * the file's extension.
 *
 * The placeholder is an empty `<div data-docs-diff="…">` whose attribute is
 * the block's `{ file, lang, patch }` as base64 JSON: one attribute, nothing
 * an HTML serializer escapes differently from how the platform reads it back.
 * Only a block at the top level of the page becomes one. The platform swaps
 * placeholders in by splitting the page's HTML around them, which needs each
 * to sit between whole elements, never inside a list item or a quote; a
 * nested one stays an ordinary `diff` code block.
 */
import type { Code, Root } from "mdast";
import { DocsBuildError } from "./errors.js";

/** What a placeholder carries, and what the platform's viewer needs. */
export interface DocsDiff {
  file: string;
  lang: string;
  patch: string;
}

function attribute(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|(\\S+))`).exec(meta);
  return match ? (match[1] ?? match[2]) : undefined;
}

/** The `{ file, lang, patch }` a `diff file=…` block describes, or null for
 * any other code block. */
export function readDiff(node: Code): DocsDiff | null {
  if (node.lang !== "diff" || !node.meta) return null;
  const file = attribute(node.meta, "file");
  if (file === undefined) return null;

  const patch = node.value;
  if (!/^--- /m.test(patch) || !/^\+\+\+ /m.test(patch) || !/^@@ /m.test(patch)) {
    const line = node.position?.start.line;
    throw new DocsBuildError(
      `diff block for ${file}${line === undefined ? "" : ` (line ${line})`}: needs a unified diff with ---/+++ headers and at least one @@ hunk`,
    );
  }
  const lang = attribute(node.meta, "lang") ?? file.split(".").pop() ?? "text";
  return { file, lang, patch };
}

export function encodeDiff(diff: DocsDiff): string {
  return Buffer.from(JSON.stringify(diff), "utf-8").toString("base64");
}

/** Replaces each top-level `diff file=…` block with its placeholder. */
export function remarkDiffs() {
  return (tree: Root) => {
    tree.children = tree.children.map((node) => {
      if (node.type !== "code") return node;
      const diff = readDiff(node);
      if (!diff) return node;
      return {
        type: "html",
        value: `<div data-docs-diff="${encodeDiff(diff)}"></div>`,
      };
    });
  };
}
