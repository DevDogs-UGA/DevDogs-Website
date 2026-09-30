// Code on the slides comes straight from the workshop repos, so it can't
// drift from the finished demo. The repos are git submodules under
// apps/slides/workshops/ (web, mobile), pinned to their `02-supabase` answer
// key, and a slide names a file at a demo step:
//
//   <<< web@step-2:components/Guestbook.tsx {39-51|54-69}
//   <<< mobile:lib/guestbook.dart {90-94}
//
// Each line becomes a fenced block holding the whole file as of that commit,
// with line numbers on, so the ranges are the file's own line numbers and
// the code window pans to them (lib/viewport.ts). It works inside a Magic
// Move block too, one line per step.
//
// The revision is optional (default: the pinned commit, i.e. the finished
// demo) and is any git revision in the submodule, or `step-N`: the commit
// whose message says "step N," (the demo's steps are one commit each), or
// `step-0` for the commit before step 1, where the demo starts.
//
// Missing submodules, unknown revisions, and ranges past the end of the file
// fail the build rather than render stale or empty code.
//
// `{build}` in place of ranges builds the step up instead: a Magic Move that
// starts from the file one commit earlier (the lines about to change lit)
// and adds one chunk of the commit's diff per click, each new chunk lit as it
// lands. Copy and the Discord button take every line the step changed, not
// just the last click's. Chunks are the diff's hunks,
// with any hunk taller than the code window split at its blank lines. The
// frames are generated from `git diff`, so they can't drift from the repo
// either.
//
//   <<< web@step-3:components/Guestbook.tsx {build}
//   <<< web@step-3:components/Guestbook.tsx {build:1,2|3|4-5}
//   <<< web@step-4:components/Guestbook.tsx {build:[3,6-10]1,2|4,5|11}
//
// `1,2|3|4-5` groups chunks (numbered from 1 in file order) into frames,
// e.g. to give the web and mobile columns the same number of clicks. A
// `[…]` prefix names chunks already applied when the slide starts (built on
// an earlier slide); chunks named nowhere never appear, so one commit can
// span several slides.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  MarkdownTransformContext,
  TransformersSetup,
} from "@slidev/types";

const WORKSHOPS = fileURLToPath(new URL("../../workshops/", import.meta.url));
const REPOS = ["web", "mobile"] as const;

const LANGS: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  dart: "dart",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  json: "json",
  md: "md",
};

// The fence language for a workshop file, by its name.
export function langOf(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.startsWith(".env")
    ? "dotenv"
    : (LANGS[base.split(".").pop() ?? ""] ?? "");
}

export const RE_IMPORT =
  /^<<<[ \t]+(web|mobile)(?:@(\S+?))?:(\S+)(?:[ \t]+\{([^}]*)\})?(?:[ \t]+(\{.*\}))?[ \t]*$/gm;

// A chunk taller than this doesn't fit the code window beside the helper
// banner, so it's split at its blank lines into pieces that do.
const MAX_CHUNK = 10;

function revision(rev: string | undefined): string {
  if (!rev) return "HEAD";
  const step = rev.match(/^step-(\d+)$/);
  if (!step) return rev;
  const n = Number(step[1]);
  return n === 0 ? "HEAD^{/step 1,}^" : `HEAD^{/step ${n},}`;
}

function git(repo: string, args: string[], where: string): string {
  const dir = `${WORKSHOPS}${repo}`;
  if (!existsSync(`${dir}/.git`)) {
    throw new Error(
      `${where}: workshops/${repo} is not checked out. Run \`git submodule update --init\` in Backstage.`,
    );
  }
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function showAt(
  repo: string,
  gitRev: string,
  file: string,
  where: string,
  label = gitRev,
): string {
  try {
    return git(repo, ["show", `${gitRev}:${file}`], where);
  } catch (e) {
    if ((e as Error).message.includes("is not checked out")) throw e;
    const stderr = (e as { stderr?: string }).stderr?.trim();
    throw new Error(
      `${where}: can't read ${repo}@${label}:${file} (${stderr || e})`,
    );
  }
}

// The commit a revision names, e.g. for a link to the file on GitHub.
export function commitOf(
  repo: string,
  rev: string | undefined,
  where: string,
): string {
  return git(repo, ["rev-parse", `${revision(rev)}^{commit}`], where).trim();
}

// The step tags (`<workshop>/<NN>-<slug>`) that name a commit, if any.
export function stepTagsAt(
  repo: string,
  commit: string,
  where: string,
): string[] {
  return git(repo, ["tag", "--points-at", commit], where)
    .split("\n")
    .filter((t) => /^[^/\s]+\/\d+-[^/\s]+$/.test(t));
}

export function show(
  repo: string,
  rev: string | undefined,
  file: string,
  where: string,
): string {
  return showAt(repo, revision(rev), file, where, rev ?? "HEAD");
}

export function linesOf(text: string): string[] {
  return text.replace(/\n+$/, "").split("\n");
}

export function checkRanges(ranges: string, lines: number, where: string) {
  for (const n of ranges.match(/\d+/g) ?? []) {
    if (Number(n) < 1 || Number(n) > lines) {
      throw new Error(
        `${where}: line ${n} is outside the file (${lines} lines)`,
      );
    }
  }
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

function hunks(
  repo: string,
  rev: string | undefined,
  file: string,
  where: string,
): Hunk[] {
  const r = revision(rev);
  let out: string;
  try {
    out = git(
      repo,
      ["diff", "--no-color", "-U0", `${r}^`, r, "--", file],
      where,
    );
  } catch (e) {
    throw new Error(
      `${where}: can't diff ${repo}@${rev ?? "HEAD"}:${file} (${(e as { stderr?: string }).stderr?.trim() || e})`,
    );
  }
  return Array.from(
    out.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm),
    (m) => ({
      oldStart: Number(m[1]),
      oldCount: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newCount: m[4] === undefined ? 1 : Number(m[4]),
    }),
  );
}

function split(all: Hunk[], after: string[]): Hunk[] {
  return all.flatMap((h) => {
    if (h.newCount <= MAX_CHUNK) return [h];
    const pieces: { start: number; count: number }[] = [];
    let start = h.newStart;
    const end = h.newStart + h.newCount;
    while (start < end) {
      let cut = Math.min(start + MAX_CHUNK, end);
      if (cut < end) {
        // Break after the last blank line that keeps the piece in size.
        for (let k = cut - 1; k > start; k--) {
          if (after[k - 1].trim() === "") {
            cut = k + 1;
            break;
          }
        }
      }
      pieces.push({ start, count: cut - start });
      start = cut;
    }
    // The first piece replaces the old lines; the rest insert after them.
    const anchor = h.oldCount === 0 ? h.oldStart : h.oldStart + h.oldCount - 1;
    return pieces.map((piece, i) =>
      i === 0
        ? { ...h, newStart: piece.start, newCount: piece.count }
        : {
            oldStart: anchor,
            oldCount: 0,
            newStart: piece.start,
            newCount: piece.count,
          },
    );
  });
}

function numbers(spec: string): number[] {
  return spec
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [a, b = a] = part.split("-").map(Number);
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    });
}

function groupsOf(spec: string | undefined, count: number, where: string) {
  if (!spec)
    return {
      done: [] as number[],
      groups: Array.from({ length: count }, (_, i) => [i + 1]),
    };
  const m = spec.match(/^(?:\[([^\]]*)\])?(.*)$/)!;
  const done = numbers(m[1] ?? "");
  const groups = m[2]
    .split("|")
    .map(numbers)
    .filter((g) => g.length);
  const used = [...done, ...groups.flat()];
  if (
    !groups.length ||
    used.some((n) => n < 1 || n > count) ||
    new Set(used).size !== used.length
  ) {
    throw new Error(
      `${where}: build groups "${spec}" must name each of the ${count} chunks at most once`,
    );
  }
  return { done, groups };
}

// The file with the chunks in `applied` taken from `after`, the rest from
// `before`, plus the line numbers (in this frame) of `lit`'s new lines, or
// of the old lines they replace for a chunk not yet applied.
export function frame(
  before: string[],
  after: string[],
  all: Hunk[],
  applied: Set<number>,
  lit: Set<number>,
) {
  const lines: string[] = [];
  const hot: number[] = [];
  let oldPos = 1;
  all.forEach((h, i) => {
    const n = i + 1;
    // Unchanged lines before the chunk. A pure insertion (oldCount 0) goes
    // after line oldStart.
    const copyTo = h.oldCount === 0 ? h.oldStart : h.oldStart - 1;
    while (oldPos <= copyTo) lines.push(before[oldPos++ - 1]);
    if (applied.has(n)) {
      for (let k = 0; k < h.newCount; k++) {
        lines.push(after[h.newStart - 1 + k]);
        if (lit.has(n)) hot.push(lines.length);
      }
      // A pure deletion leaves nothing to light: light the line it closed up on.
      if (lit.has(n) && h.newCount === 0 && lines.length)
        hot.push(lines.length);
    } else {
      for (let k = 0; k < h.oldCount; k++) {
        lines.push(before[h.oldStart - 1 + k]);
        if (lit.has(n)) hot.push(lines.length);
      }
      // About to insert here: light the line it goes after.
      if (lit.has(n) && h.oldCount === 0 && lines.length)
        hot.push(lines.length);
    }
    if (h.oldCount > 0) oldPos = h.oldStart + h.oldCount;
  });
  while (oldPos <= before.length) lines.push(before[oldPos++ - 1]);
  return { lines, hot };
}

function rangeOf(lines: number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(
      sorted[i] === sorted[j] ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`,
    );
    i = j + 1;
  }
  return parts.join(",") || "*";
}

// For tooling (and picking groups): a commit's chunks for one file.
export function chunks(repo: string, rev: string | undefined, file: string) {
  const after = linesOf(show(repo, rev, file, file));
  return split(hunks(repo, rev, file, file), after).map((h, i) => ({
    n: i + 1,
    ...h,
    first: after[h.newStart - 1]?.trim(),
  }));
}

// A `{build}` import's pieces: the file before and after the commit, its
// chunks, and the spec's already-applied chunks and click groups. Also read
// by scripts/export-md.ts, which writes each group as a diff.
export function buildPlan(
  repo: string,
  rev: string | undefined,
  file: string,
  spec: string | undefined,
  where: string,
) {
  const after = linesOf(show(repo, rev, file, where));
  let before: string[] = [];
  try {
    before = linesOf(showAt(repo, `${revision(rev)}^`, file, where));
  } catch {
    // A file the commit creates starts empty.
  }
  const all = split(hunks(repo, rev, file, where), after);
  if (!all.length)
    throw new Error(`${where}: the commit doesn't change ${file}`);
  return { before, after, all, ...groupsOf(spec, all.length, where) };
}

function build(
  repo: string,
  rev: string | undefined,
  file: string,
  spec: string | undefined,
  lang: string,
  where: string,
): string {
  const { before, after, all, done, groups } = buildPlan(
    repo,
    rev,
    file,
    spec,
    where,
  );
  const applied = new Set<number>(done);
  const frames = [
    frame(before, after, all, new Set(applied), new Set(groups[0])),
  ];
  const added = new Set<number>();
  for (const group of groups) {
    group.forEach((n) => {
      added.add(n);
      applied.add(n);
    });
    frames.push(frame(before, after, all, new Set(applied), new Set(group)));
  }
  // Copy and the Discord button take the whole step, not the last click.
  const focus = rangeOf(frame(before, after, all, applied, added).hot);
  const blocks = frames.map(
    (f) =>
      `\`\`\`${lang} {${rangeOf(f.hot)}}{lines:true}\n${f.lines.join("\n")}\n\`\`\``,
  );
  return `\`\`\`\`md magic-move {lines:true,focus:'${focus}'}\n${blocks.join("\n")}\n\`\`\`\``;
}

export function expandWorkshopImports(ctx: MarkdownTransformContext) {
  const code = ctx.s.original;
  for (const m of code.matchAll(RE_IMPORT)) {
    const [line, repo, rev, file, ranges = "", options = ""] = m;
    const where = `${ctx.slide.source.filepath} (${line.trim()})`;
    if (!REPOS.includes(repo as (typeof REPOS)[number])) continue;
    const lang = langOf(file);
    const buildSpec = ranges.match(/^build(?::(.+))?$/);
    if (buildSpec) {
      ctx.s.overwrite(
        m.index,
        m.index + line.length,
        build(repo, rev, file, buildSpec[1], lang, where),
      );
      continue;
    }
    const content = linesOf(show(repo, rev, file, where)).join("\n");
    checkRanges(ranges, content.split("\n").length, where);
    if (/^`{3,}/m.test(content))
      throw new Error(`${where}: the file contains a code fence`);
    const opts = options
      ? options.replace(/^\{/, "{lines:true,")
      : "{lines:true}";
    ctx.s.overwrite(
      m.index,
      m.index + line.length,
      `\`\`\`${lang} {${ranges || "*"}}${opts}\n${content}\n\`\`\``,
    );
  }
}

// "→" in slide text becomes a Phosphor arrow (never inside code: fenced
// blocks, inline code, or HTML comments, i.e. presenter notes). Runs after
// the imports expand, so their code is skipped too.
export function phosphorArrows(ctx: MarkdownTransformContext) {
  const code = ctx.s.original;
  const skip: [number, number][] = [];
  for (const m of code.matchAll(
    /^(`{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$|`[^`\n]*`|<!--[\s\S]*?-->/gm,
  )) {
    skip.push([m.index, m.index + m[0].length]);
  }
  for (const m of code.matchAll(/ ?→ ?/g)) {
    if (skip.some(([a, b]) => m.index >= a && m.index < b)) continue;
    // Non-breaking on both sides: "Settings → API" never wraps at the arrow.
    ctx.s.overwrite(
      m.index,
      m.index + m[0].length,
      '&nbsp;<ph-arrow-right-bold class="dd-arrow" />&nbsp;',
    );
  }
}

const setup: TransformersSetup = () => ({
  pre: [expandWorkshopImports, phosphorArrows],
});

export default setup;
