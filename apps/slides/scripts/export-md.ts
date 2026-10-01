// Writes a deck out as markdown for the docs site: a folder of step pages per
// track, plus any pages both tracks share.
//
//   pnpm export:md decks/<deck>.md --out <docs>/workshops/<workshop>
//
// A slide deck is a poor handout: its code windows pan and build click by
// click, so a PDF only catches one frame of each. This reads the same slides
// and writes what a reader needs instead, in slide order:
//
// - `<Track>` content and `dual-code` columns for the page's track only.
// - A `{build}` import (theme/setup/transformers.ts) becomes one diff per
//   click group, each after the tip for that click, then a link to the whole
//   file on GitHub at that commit. Each diff holds the whole file, so the docs
//   can expand its context, and links to the commit's compare view. A ranged
//   import becomes one excerpt per range that has a tip, or every range's
//   lines at once when none do, each linking to its lines on GitHub.
// - `<CodeTips>` become the prose between the code; presenter notes are
//   dropped.
//
// Only the tracks the headmatter's `docs.tracks` names are written, so a
// workshop that ran as one room per stack can be one deck per track, each
// exported into the same workshop folder.
//
// A slide with `docsPage` starts a new page (`file`, and optionally `title`,
// `description`, and `shared: true` for one page beside the track folders).
// Each track's folder gets a body-less index.md naming it a course (`steps:
// true`, see the docs compiler), and the headmatter's `docs.scheduled`, which
// the shared pages get too: the docs hide them all until then. The deck headmatter's `docs` key names the
// track folders and the public repos the file links point at. Slides with
// `docs: false` are left out: the preshow, the competition, upcoming events.
//
// Anything else the exporter doesn't know how to write down (a Vue component,
// a layout slot) fails the export rather than leaking into the page.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  fence,
  loadDeck,
  pageContent,
  pagesOf,
  reviewLink,
  TRACK_CWD,
  tracksOf,
  type PageStart,
} from "./deck.ts";

const APP = fileURLToPath(new URL("..", import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" } },
});
if (!positionals[0])
  throw new Error(
    "usage: pnpm export:md decks/<deck>.md --out <docs>/workshops/<workshop>",
  );
const entry = resolve(APP, positionals[0]);

const GENERATED = `<!-- Generated from Backstage apps/slides/${entry.slice(APP.length)} by \`pnpm export:md\`; edit the deck, not this file. -->`;

function frontmatter(
  fields: Record<string, string | number | boolean | undefined>,
): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`,
    );
  return ["---", ...lines, "---"].join("\n");
}

// The docs' version of the slides' checkpoint flag, for anyone who fell
// behind: how to get to where the previous step ended (`ref`, its step tag).
// Catching up merges the tag into their branch, keeping their work, which
// leaves the same history as the VS Code extension's review. Starting over
// throws their work away, as the flag does on a demo laptop.
function catchUp(
  ref: string,
  cwd: string | undefined,
  review: string | undefined,
): string {
  const branch = `<github-username>/${ref.split("/")[0]}`;
  const attributes = cwd ? `cwd=${cwd}` : "";
  // The review button sits beside "Behind?": it opens this step's changes in
  // the VS Code extension. The docs site adds the tab's session on click.
  return [
    ...(review
      ? [
          '<div class="docs-step-actions">',
          "",
          `[Review in VS Code](${review})`,
          "",
        ]
      : []),
    "<details>",
    "<summary>Behind? Catch up to where the last step ended</summary>",
    "",
    "**Catch up, keeping your work.** This saves your changes, then brings in the code from the end of the last step. Where you changed the same lines, git asks you which to keep.",
    "",
    fence(
      "bash",
      [
        "git fetch origin --tags",
        "# Save your own changes first",
        "git add -A",
        'git commit -m "My work"',
        "# Bring in the code from the end of the last step",
        `git merge --no-edit ${ref}`,
      ],
      attributes,
    ),
    "",
    "**Or start over from the last step.** This moves your branch to the end of the last step. Your changes are lost.",
    "",
    fence(
      "bash",
      [
        "git fetch origin --tags",
        "# Moves your branch to the end of the last step",
        `git switch --discard-changes -C ${branch} ${ref}`,
      ],
      attributes,
    ),
    "",
    "</details>",
    ...(review ? ["", "</div>"] : []),
  ].join("\n");
}

// A page's file: frontmatter, the title, then the body.
function pageFile(
  start: PageStart,
  title: string,
  body: string,
  order: number | undefined,
  scheduled?: string,
  checkpoint?: string,
): string {
  // `checkpoint` is the step tag the page ends at: the docs site marks a step
  // done from the tags a finished VS Code review reports.
  const head = frontmatter({
    name: title,
    description: start.description,
    order,
    scheduled,
    checkpoint,
  });
  // The code is the workshop repos' own, formatted their way, so the docs
  // repo's Prettier (which formats code blocks too) is told to leave it.
  return `${head}\n\n${GENERATED}\n\n# ${title}\n\n<!-- prettier-ignore-start -->\n\n${body}\n\n<!-- prettier-ignore-end -->\n`;
}

// Only files this script wrote go, so a hand-written page beside them is safe.
function clearGenerated(dir: string) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (
      name.endsWith(".md") &&
      readFileSync(file, "utf8").includes("by `pnpm export:md`")
    )
      rmSync(file);
  }
}

const deck = await loadDeck(entry);
const { docs, slides } = deck;
// YAML reads an unquoted timestamp as a Date.
const scheduled: unknown = docs.scheduled;
if (scheduled instanceof Date) docs.scheduled = scheduled.toISOString();
const pages = pagesOf(slides);
const out = resolve(values.out ?? join(APP, "export", basename(entry, ".md")));
mkdirSync(out, { recursive: true });
const shared = new Map<string, string>();

for (const track of tracksOf(deck)) {
  const config = docs.tracks![track]!;
  const dir = join(out, config.dir);
  clearGenerated(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.md"),
    `${frontmatter({ name: config.name, description: docs.description, order: config.order, steps: true, scheduled: docs.scheduled })}\n`,
  );

  let step = 0;
  let reached: string | undefined;
  for (const page of pages) {
    const { start, checkpoint } = page;
    // Where this page begins: the last checkpoint before it, or the start
    // tag (`<workshop>/00-start`, see tag-steps.ts) for the first page that
    // has one of its own.
    // A shared page reads the same for both tracks, so its terminals start
    // nowhere in particular.
    const from =
      reached ??
      (checkpoint ? `${checkpoint.split("/")[0]}/00-start` : undefined);
    // A shared page reads the same for both tracks, so it has no one repo.
    const review =
      checkpoint && from && !start.shared
        ? reviewLink(
            track,
            from,
            checkpoint,
            undefined,
            `${start.file} (${track})`,
          )
        : undefined;
    const lead = from
      ? catchUp(from, start.shared ? undefined : TRACK_CWD[track], review)
      : "";
    reached = checkpoint ?? reached;
    const content = pageContent(page, track);
    const body = lead ? `${lead}\n\n${content.body}` : content.body;
    if (start.shared) {
      const seen = shared.get(start.file);
      if (seen !== undefined && seen !== body) {
        throw new Error(
          `docsPage ${start.file}: shared, but it reads differently for ${track}`,
        );
      }
      shared.set(start.file, body);
      writeFileSync(
        join(out, `${start.file}.md`),
        pageFile(start, content.title, body, start.order, docs.scheduled),
      );
      continue;
    }
    const file = join(dir, `${start.file}.md`);
    writeFileSync(
      file,
      pageFile(start, content.title, body, step++, undefined, checkpoint),
    );
    console.log(`wrote ${file}`);
  }
}
for (const file of shared.keys())
  console.log(`wrote ${join(out, `${file}.md`)}`);
