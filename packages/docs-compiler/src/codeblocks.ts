/**
 * The frame around every highlighted code block, added while Shiki renders it.
 *
 * ```html
 * <figure class="docs-code" data-kind="code|terminal">
 *   <div class="docs-code-bar">
 *     <span class="docs-code-tab">lib/supabase.ts</span>
 *     <button class="docs-code-copy" data-copy>…</button>
 *   </div>
 *   <pre class="shiki">…</pre>
 * </figure>
 * ```
 *
 * The fence's info string drives it, after the language:
 *
 * - `file=<path>` (or `title=<text>`) names the tab; else the language does.
 * - `lines=7-13,15` numbers the lines as those of the file they come from, so
 *   an excerpt keeps its real line numbers; each skip gets an empty
 *   `docs-code-gap` row. Absent, lines count from 1. It must name one number per
 *   line, or the build fails.
 * - A shell block (`bash`, `sh`, …) is a terminal instead: no line numbers,
 *   and every command gets a prompt, the working directory (`cwd=`, else
 *   none), the git branch once there is one (`branch=`), then ❯. The prompt
 *   follows the commands the way the workshop slides' terminals do
 *   (Backstage apps/slides/theme/lib/shell.ts): `cd` moves it, cloning and
 *   then cd-ing into the clone puts it on `main`, `git switch` changes the
 *   branch. A `#` line is an annotation, dimmed and with no prompt; a line
 *   after one ending in `\` continues the command. An idle prompt closes it.
 *
 * Line numbers ride a `data-line` attribute and prompts are `aria-hidden`
 * elements, so neither is part of the code's own text: the platform's copy
 * button skips prompts and annotations and copies the commands alone.
 */
import type { Element, ElementContent, Root } from "hast";
import type { ShikiTransformer } from "shiki";
import { DocsBuildError } from "./errors.js";

export const SHELL_LANGS = new Set([
  "bash",
  "sh",
  "zsh",
  "shell",
  "shellscript",
  "console",
]);

const LANG_NAMES: Record<string, string> = {
  bash: "Terminal",
  css: "CSS",
  dart: "Dart",
  diff: "Diff",
  dotenv: ".env",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  sql: "SQL",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

/** `name=value` or `name="a value"` from a fence's info string. */
export function metaAttribute(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|(\\S+))`).exec(meta);
  return match ? (match[1] ?? match[2]) : undefined;
}

/** `7-13,15` → [7, …, 13, 15]. */
function lineNumbers(spec: string | undefined, count: number): number[] {
  if (spec === undefined) return Array.from({ length: count }, (_, i) => i + 1);
  const numbers = spec.split(",").flatMap((part) => {
    const [a, b = a] = part.split("-").map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b) || b! < a!) return [NaN];
    return Array.from({ length: b! - a! + 1 }, (_, i) => a! + i);
  });
  if (numbers.some(Number.isNaN) || numbers.length !== count) {
    throw new DocsBuildError(
      `code block lines=${spec}: names ${numbers.length} line(s) for a block of ${count}`,
    );
  }
  return numbers;
}

function span(className: string, children: ElementContent[]): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [className] },
    children,
  };
}

function text(value: string): ElementContent {
  return { type: "text", value };
}

function prompt(cwd: string | undefined, branch: string | undefined): Element {
  const parts: ElementContent[] = [];
  if (cwd) parts.push(span("docs-prompt-cwd", [text(cwd)]));
  if (branch) parts.push(span("docs-prompt-git", [text(` ${branch}`)]));
  parts.push(span("docs-prompt-arrow", [text(cwd || branch ? " ❯ " : "❯ ")]));
  const el = span("docs-prompt", parts);
  el.properties["ariaHidden"] = "true";
  return el;
}

function cdTo(cwd: string | undefined, arg: string): string {
  if (!arg || arg === "~") return "~";
  if (arg.startsWith("~") || arg.startsWith("/")) return arg.replace(/\/$/, "");
  let dir = cwd ?? ".";
  for (const part of arg.split("/")) {
    if (!part || part === ".") continue;
    dir = part === ".." ? dir.replace(/\/[^/]*$/, "") || "~" : `${dir}/${part}`;
  }
  return dir;
}

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/** Shiki's own elements carry `class` as a string; this package's carry
 * `className`. Either way, the element's classes as a list. */
function classesOf(el: Element): string[] {
  const value = el.properties["className"] ?? el.properties["class"];
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function addClass(el: Element, className: string): void {
  const classes = classesOf(el);
  delete el.properties["class"];
  el.properties["className"] = [...classes, className];
}

/** Prompts, annotations and the idle line, per `shell.ts` in the slides. */
function decorateShell(
  code: Element,
  lines: Element[],
  start: { cwd?: string; branch?: string },
): void {
  let { cwd, branch } = start;
  const clones = new Map<string, string>();
  let continues = false;

  for (const line of lines) {
    const raw = textOf(line);
    const trimmed = raw.trim();
    if (continues) {
      addClass(line, "docs-shell-cont");
      continues = raw.trimEnd().endsWith("\\");
      continue;
    }
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      addClass(line, "docs-shell-comment");
      continue;
    }
    line.children.unshift(prompt(cwd, branch));
    continues = raw.trimEnd().endsWith("\\");

    const words = trimmed.replace(/\s+#.*$/, "").split(/\s+/);
    const clone = /^(?:gh repo clone|git clone)\s+(\S+)(?:\s+(\S+))?/.exec(
      trimmed,
    );
    if (clone) {
      const name =
        clone[2] ?? clone[1]!.replace(/\.git$/, "").split("/").pop()!;
      clones.set(cdTo(cwd, name), "main");
    } else if (words[0] === "cd") {
      cwd = cdTo(cwd, words[1] ?? "~");
      branch = clones.get(cwd) ?? (cwd === "~" ? undefined : branch);
    } else if (
      words[0] === "git" &&
      (words[1] === "switch" || words[1] === "checkout")
    ) {
      const target = words
        .slice(2)
        .filter((w) => !w.startsWith("-"))
        .pop();
      if (target) branch = target;
    }
  }

  const idle = span("line", [prompt(cwd, branch), span("docs-shell-cursor", [])]);
  addClass(idle, "docs-shell-idle");
  idle.properties["ariaHidden"] = "true";
  code.children.push(text("\n"), idle);
}

const COPY_ICON: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 256 256",
    width: "14",
    height: "14",
    fill: "currentColor",
    ariaHidden: "true",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        // Phosphor's "copy", regular weight.
        d: "M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z",
      },
      children: [],
    },
  ],
};

export function docsCodeBlocks(): ShikiTransformer {
  return {
    name: "docs-code-blocks",
    code(code) {
      const meta = this.options.meta?.__raw ?? "";
      const lines = code.children.filter(
        (node): node is Element =>
          node.type === "element" && classesOf(node).includes("line"),
      );
      if (SHELL_LANGS.has(this.options.lang)) {
        decorateShell(code, lines, {
          cwd: metaAttribute(meta, "cwd"),
          branch: metaAttribute(meta, "branch"),
        });
        return;
      }
      const numbers = lineNumbers(metaAttribute(meta, "lines"), lines.length);
      lines.forEach((line, i) => {
        line.properties["dataLine"] = String(numbers[i]);
        if (i > 0 && numbers[i] !== numbers[i - 1]! + 1) {
          // A separator row where the excerpt skips lines of the file.
          const gap = span("line", []);
          addClass(gap, "docs-code-gap");
          gap.properties["ariaHidden"] = "true";
          code.children.splice(code.children.indexOf(line), 0, gap, text("\n"));
        }
      });
    },
    root(root: Root) {
      const meta = this.options.meta?.__raw ?? "";
      const lang = this.options.lang;
      const terminal = SHELL_LANGS.has(lang);
      const title =
        metaAttribute(meta, "file") ??
        metaAttribute(meta, "title") ??
        (terminal ? "Terminal" : (LANG_NAMES[lang] ?? lang));

      const tab = span("docs-code-tab", [
        ...(terminal ? [span("docs-code-dots", [])] : []),
        text(title),
      ]);
      const copy: Element = {
        type: "element",
        tagName: "button",
        properties: {
          type: "button",
          className: ["docs-code-copy"],
          dataCopy: "",
          ariaLabel: terminal ? "Copy commands" : "Copy code",
        },
        children: [COPY_ICON, span("docs-code-copy-label", [text("Copy")])],
      };
      root.children = [
        {
          type: "element",
          tagName: "figure",
          properties: {
            className: ["docs-code"],
            dataKind: terminal ? "terminal" : "code",
          },
          children: [
            {
              type: "element",
              tagName: "div",
              properties: { className: ["docs-code-bar"] },
              children: [tab, copy],
            },
            ...(root.children as ElementContent[]),
          ],
        },
      ];
    },
  };
}

/**
 * Keeps each fence's info string within Shiki's reach. `rehype-raw` rebuilds
 * the tree before Shiki runs and drops the `data.meta` remark put on the code
 * element; a `metastring` property survives, and `@shikijs/rehype` reads it.
 */
export function remarkKeepMeta() {
  return (tree: import("mdast").Root) => {
    const visit = (node: import("mdast").Nodes) => {
      if (node.type === "code" && node.meta) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, metastring: node.meta },
        };
      }
      if ("children" in node) node.children.forEach(visit);
    };
    visit(tree);
  };
}
