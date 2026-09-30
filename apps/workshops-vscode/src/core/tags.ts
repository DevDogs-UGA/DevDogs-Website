import { git, gitRaw, isAncestor, tagRef } from "./git.js";

/**
 * Steps from tags. A workshop repo marks its demo steps with tags named
 * `<workshop>/<NN>-<slug>` (plus `<workshop>/00-start`); the tag message
 * carries the title, the commands and the docs page. Tags are annotated once
 * `tag-steps` has run, but lightweight tags (no message) are tolerated: the
 * commit subject becomes the title and there are no commands.
 */

export interface TagMessage {
  /** First line, the step title. Empty for a `Start:` message. */
  title: string;
  /** `Run: <cmd>` lines, in order. */
  run: string[];
  /** `Docs: /docs/workshops/...`, when present. */
  docs: string | undefined;
  /** `Start: <previous workshop branch>`, only on `00-start`. */
  start: string | undefined;
}

/**
 * Parses an annotated tag message: a title line, optional blank lines, then
 * `Run:` lines and one `Docs:` line. `00-start`'s whole message is
 * `Start: <previous workshop>`. Blank lines, CRLF and a trailing newline are
 * tolerated; unrecognised lines are ignored.
 */
export function parseTagMessage(message: string): TagMessage {
  const lines = message.split(/\r?\n/).map((line) => line.trimEnd());
  const parsed: TagMessage = {
    title: "",
    run: [],
    docs: undefined,
    start: undefined,
  };
  let sawTitle = false;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const start = /^Start:\s*(.*)$/.exec(line);
    if (start) {
      const title = start[1]?.trim();
      parsed.start = title === "" ? undefined : title;
      sawTitle = true;
      continue;
    }
    if (!sawTitle) {
      parsed.title = line.trim();
      sawTitle = true;
      continue;
    }
    const run = /^Run:\s*(.*)$/.exec(line);
    if (run) {
      if (run[1]?.trim()) parsed.run.push(run[1].trim());
      continue;
    }
    const docs = /^Docs:\s*(.*)$/.exec(line);
    if (docs?.[1]?.trim()) parsed.docs = docs[1].trim();
  }
  return parsed;
}

export interface Step {
  /** Full tag name, `02-supabase/03-insert-naive`. */
  tag: string;
  workshop: string;
  /** The `NN` in the tag; 0 for `00-start`. */
  number: number;
  slug: string;
  title: string;
  run: string[];
  docs: string | undefined;
  /** The commit the tag points at (peeled if annotated). */
  commit: string;
  /** Previous workshop, on `00-start` only. */
  start: string | undefined;
}

const STEP_NAME = /^(?<workshop>.+)\/(?<number>\d\d)-(?<slug>[^/]+)$/;

/** Field and record separators for `for-each-ref --format` (hex escapes). */
const FIELD = "%1f";
const RECORD = "%1e";

/** Splits `<workshop>/<NN>-<slug>`; null when the name isn't a step tag. */
export function parseStepName(
  tag: string,
): { workshop: string; number: number; slug: string } | null {
  const match = STEP_NAME.exec(tag);
  if (!match?.groups) return null;
  return {
    workshop: match.groups["workshop"]!,
    number: Number(match.groups["number"]),
    slug: match.groups["slug"]!,
  };
}

/**
 * Reads one workshop's step tags, ordered by number. One
 * `for-each-ref` call, so it works offline and costs a single process.
 */
export async function readSteps(
  cwd: string,
  workshop: string,
): Promise<Step[]> {
  const format = [
    "%(refname:lstrip=2)",
    "%(objecttype)",
    "%(*objectname)",
    "%(objectname)",
    "%(contents)",
    "%(contents:subject)",
  ].join(FIELD);
  const out = await git(cwd, [
    "for-each-ref",
    `--format=${format}${RECORD}`,
    `refs/tags/${workshop}/`,
  ]);

  const steps: Step[] = [];
  for (const record of out.split("\x1e")) {
    const [tag, type, peeled, direct, contents, subject] = record
      .replace(/^\n/, "")
      .split("\x1f");
    if (tag?.slice(0, workshop.length + 1) !== `${workshop}/`) continue;
    const name = parseStepName(tag);
    // `<ws>/<NN>-<slug>` only: deeper names like `<ws>/x/01-a` belong to
    // another workshop whose name happens to start with ours.
    if (name?.workshop !== workshop) continue;

    const annotated = type === "tag";
    const parsed = annotated
      ? parseTagMessage(contents ?? "")
      : { title: "", run: [], docs: undefined, start: undefined };
    const fallbackTitle = name.number === 0 ? "Start" : (subject ?? "").trim();
    steps.push({
      tag,
      workshop,
      number: name.number,
      slug: name.slug,
      title: parsed.title || fallbackTitle,
      run: parsed.run,
      docs: parsed.docs,
      commit: (annotated ? peeled : direct) ?? "",
      start: parsed.start,
    });
  }
  return steps.sort((a, b) => a.number - b.number);
}

/** Every workshop that has step tags, e.g. `["02-supabase"]`. */
export async function listWorkshops(cwd: string): Promise<string[]> {
  const out = await git(cwd, [
    "for-each-ref",
    "--format=%(refname:lstrip=2)",
    "refs/tags/",
  ]);
  const workshops = new Set<string>();
  for (const tag of out.split("\n")) {
    const name = parseStepName(tag.trim());
    if (name) workshops.add(name.workshop);
  }
  return [...workshops].sort();
}

/**
 * The whole line of steps ending at `workshop`, oldest first. A workshop's
 * `00-start` names the workshop it grew out of (`Start: 01-nextjs-intro`), so
 * this walks that chain and concatenates each workshop's steps into one line.
 * A cycle or a previous workshop with no tags just ends the walk.
 */
export async function readStepLine(
  cwd: string,
  workshop: string,
): Promise<Step[]> {
  const seen = new Set<string>();
  const segments: Step[][] = [];
  let current: string | undefined = workshop;
  while (current && !seen.has(current)) {
    seen.add(current);
    const steps = await readSteps(cwd, current);
    if (steps.length === 0) break;
    segments.unshift(steps);
    current = steps.find((s) => s.number === 0)?.start;
  }
  return segments.flat();
}

/** Finds a step in a line by tag name. */
export function findStep(line: readonly Step[], tag: string): Step | undefined {
  return line.find((s) => s.tag === tag);
}

/**
 * The last step they have: the newest step in the line whose tag is an
 * ancestor of `head`. A Finish merge puts the step's tag in the branch's
 * history, so this needs no stored state. Null when no tag is reachable
 * (nothing merged yet).
 */
export async function findCurrentStep(
  cwd: string,
  line: readonly Step[],
  head = "HEAD",
): Promise<Step | null> {
  for (let i = line.length - 1; i >= 0; i--) {
    const step = line[i]!;
    if (await isAncestor(cwd, tagRef(step.tag), head)) return step;
  }
  return null;
}

/** Resolves a ref to a commit id; used by callers comparing heads. */
export async function revParse(
  cwd: string,
  ref: string,
): Promise<string | null> {
  const { code, stdout } = await gitRaw(
    cwd,
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    [1],
  );
  return code === 0 ? stdout.toString("utf8").trim() : null;
}
