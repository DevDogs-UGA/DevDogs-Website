"use client";

import {
  CopyIcon,
  FileCodeIcon,
  FileCssIcon,
  FileHtmlIcon,
  FileIniIcon,
  FileJsIcon,
  FileJsxIcon,
  FileMdIcon,
  FilePyIcon,
  FileSqlIcon,
  FileTextIcon,
  FileTsIcon,
  FileTsxIcon,
  GithubLogoIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useMemo, useState } from "react";
import type { DocsDiff as DocsDiffData } from "~/lib/docsDiffs";
import VsCodeIcon from "~/components/DocsVscode/VsCodeIcon";
import "~/components/Docs/docs.css";

const MODES = [
  { mode: DiffModeEnum.Unified, label: "Unified" },
  { mode: DiffModeEnum.Split, label: "Split" },
] as const;

/** The compiler's `CodeIcon`s, as the Phosphor icons its code blocks draw
 * (colored by `data-icon` in components/Docs/docs.css). */
const FILE_ICONS: Record<string, Icon> = {
  ts: FileTsIcon,
  tsx: FileTsxIcon,
  js: FileJsIcon,
  jsx: FileJsxIcon,
  css: FileCssIcon,
  html: FileHtmlIcon,
  sql: FileSqlIcon,
  md: FileMdIcon,
  py: FilePyIcon,
  config: FileIniIcon,
  text: FileTextIcon,
  code: FileCodeIcon,
};

/** The code as it stands after the change: every context and added line of
 * the diff's hunks, a blank line between hunks. What "Copy" takes. */
export function newSide(patch: string): string {
  const hunks: string[][] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) hunks.push([]);
    else if (hunks.length > 0 && (line.startsWith(" ") || line.startsWith("+")))
      hunks.at(-1)!.push(line.slice(1));
    else if (hunks.length > 0 && line === "") hunks.at(-1)!.push("");
  }
  return hunks.map((hunk) => hunk.join("\n").trimEnd()).join("\n\n");
}

/**
 * One file diff from a docs page (see ~/lib/docsDiffs), in @git-diff-view's
 * viewer: the file's own highlighting, real line numbers, and a unified/split
 * toggle, under the same file tab and copy button as the page's other code
 * blocks (`.docs-dv-*`, components/Docs/docs.css).
 *
 * The `DiffFile` is built during render rather than in an effect, so the
 * server renders the finished diff into the page and hydration finds the same
 * markup: the diff is there without JavaScript, and for search.
 * A block that held the whole file (the workshop pages' diffs) arrives with
 * both versions of it, which is what lets the viewer expand the context
 * between and around the hunks; one that held only hunks has nothing to
 * expand into. Long lines wrap, as they do in the plain code blocks.
 */
export default function DocsDiff({
  file,
  lang,
  icon = "code",
  patch,
  oldContent = "",
  newContent = "",
  href,
  vscode,
}: DocsDiffData) {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Unified);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(newSide(patch));
      setCopied(true);
    } catch {
      // No clipboard access: nothing to confirm.
    }
  }

  const FileIcon = FILE_ICONS[icon] ?? FileCodeIcon;

  const diffFile = useMemo(() => {
    const diff = new DiffFile(
      file,
      oldContent,
      file,
      newContent,
      [patch],
      lang,
      lang,
    );
    diff.initTheme("dark");
    diff.init();
    diff.buildUnifiedDiffLines();
    diff.buildSplitDiffLines();
    return diff;
  }, [file, lang, patch, oldContent, newContent]);

  const { added, removed } = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      else if (line.startsWith("-") && !line.startsWith("---")) removed++;
    }
    return { added, removed };
  }, [patch]);

  return (
    <figure className="docs-dv not-prose">
      <figcaption className="docs-dv-bar">
        <span className="docs-dv-tab">
          <FileIcon
            weight="fill"
            aria-hidden
            data-icon={icon in FILE_ICONS ? icon : "code"}
            className="docs-dv-icon"
          />
          {file}
        </span>
        <span
          className="docs-dv-stat"
          aria-label={`${added} added, ${removed} removed`}
        >
          <span className="a">+{added}</span>{" "}
          <span className="r">&minus;{removed}</span>
        </span>
        <div className="docs-dv-acts">
          <div
            role="group"
            aria-label="Diff layout"
            className="docs-dv-seg max-sm:hidden"
          >
            {MODES.map(({ mode: value, label }) => (
              <button
                key={label}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {vscode && (
            // DocsVscode adds the tab's session to this on click.
            <a
              href={vscode}
              aria-label="Review this change in VS Code"
              title="Review this change in VS Code"
              className="docs-code-vscode"
            >
              <VsCodeIcon className="size-3.5" />
            </a>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Compare on GitHub"
            >
              <GithubLogoIcon weight="bold" />
              GitHub
            </a>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label="Copy the new code"
            data-copied={copied || undefined}
          >
            <CopyIcon weight="bold" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </figcaption>
      <DiffView
        diffFile={diffFile}
        diffViewMode={mode}
        diffViewTheme="dark"
        diffViewHighlight
        diffViewWrap
        diffViewFontSize={13}
      />
    </figure>
  );
}
