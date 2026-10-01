/**
 * `pnpm backstage graphics [graphic…] [--format …] [--out …]`
 *
 * Renders the club's pictures from the templates in `@devdogsuga/brand`. Two
 * axes, asked for separately: WHICH picture (`event/2026-09-08`, `app/dogdays`,
 * `brand/club`) and at WHAT SIZE (`gdgc-square`, `og`, `icon-512`). That split
 * is the point of the command: an event poster for the GDG on Campus platform
 * is exactly the pairing "this meeting" x "that platform's banner".
 *
 * Anything the command line leaves out, it asks for; anything it names, it does
 * not. So an officer can type `pnpm backstage graphics` and be walked through
 * it, and a script can pass every flag and never see a prompt.
 *
 * It needs no checkout and no credentials: the templates are in
 * `@devdogsuga/brand`, the meetings in `@devdogsuga/events`, and the files go
 * to `--out` or the current directory, flat, as `<stem>-<format>.png`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { log, note } from "@clack/prompts";
import { FORMATS } from "@devdogsuga/brand";
import { positionals } from "@devdogsuga/cli-core/args";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import {
  errorMessage,
  explainError,
  UsageError,
} from "@devdogsuga/cli-core/ui";
import { configEvents, type EventReader } from "./events.js";
import { pickFormats, pickGraphics } from "./prompts.js";
import { render } from "./render.js";
import {
  assertUniqueStems,
  eventGraphics,
  staticGraphics,
  type Graphic,
} from "./registry.js";
import {
  commaList,
  formatsFor,
  matchGraphics,
  normalizeArgv,
  pair,
  type Selection,
} from "./select.js";

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];

  return value && !value.startsWith("--") ? value : undefined;
}

export interface GraphicsOptions {
  /** Graphic patterns. Empty means ask. */
  patterns: string[];
  /** Format names. Empty with `allFormats` false means ask. */
  formats: string[];
  allFormats: boolean;
  /** An explicit directory; everything lands in it, flat. */
  out?: string;
  /** List what would be written, and write nothing. */
  noOutput: boolean;
}

export function parseGraphicsArgs(argv: readonly string[]): GraphicsOptions {
  const normalized = normalizeArgv(argv);

  return {
    patterns: positionals(normalized),
    formats: commaList(flagValue(normalized, "--format")),
    allFormats: normalized.includes("--all-formats"),
    out: flagValue(normalized, "--out"),
    noOutput:
      normalized.includes("--dry-run") || normalized.includes("--no-output"),
  };
}

/** `~/images` when the shell did not expand it, which quoting prevents. */
export function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/")
    ? resolve(homedir(), path.slice(2))
    : path;
}

/** Whether anything asked for could be an event, so whether to read the schedule. */
export function wantsEvents(patterns: readonly string[]): boolean {
  // No pattern means the picker, and the picker should list meetings.
  if (patterns.length === 0) return true;

  return patterns.some(
    (pattern) =>
      pattern === "*" ||
      pattern === "*/*" ||
      pattern === "event" ||
      pattern.startsWith("event/"),
  );
}

/** Whether a pattern names events specifically, rather than sweeping them up. */
export function namesEvents(patterns: readonly string[]): boolean {
  return patterns.some(
    (pattern) => pattern === "event" || pattern.startsWith("event/"),
  );
}

export interface GraphicsDeps {
  /** Overridden in tests so nothing reads the real schedule or the filesystem. */
  reader?: () => EventReader;
  /** The working directory the default output lands in. */
  cwd?: string;
}

/**
 * Meetings, or a clear account of why there are none.
 *
 * A wildcard means "everything", and everything else is renderable, so an
 * unreadable schedule is reported and skipped; `event/*` asked for exactly the
 * thing that is missing, so it fails.
 */
async function loadEvents(
  patterns: readonly string[],
  deps: GraphicsDeps,
): Promise<{ graphics: Graphic[]; skipped: string | null }> {
  const required = namesEvents(patterns);
  const reader = (deps.reader ?? configEvents)();

  let meetings;
  try {
    meetings = await reader.meetings();
  } catch (err) {
    if (required) throw err;

    return { graphics: [], skipped: errorMessage(err) };
  }

  return { graphics: eventGraphics(meetings), skipped: null };
}

/** Where one selection is written: flat, always `<stem>-<format>.png`. */
export function destinationOf(
  { graphic, format }: Selection,
  out: string,
): string {
  return resolve(out, `${graphic.stem}-${format.name}.png`);
}

export async function runGraphics(
  argv: string[],
  deps: GraphicsDeps = {},
): Promise<void> {
  const options = parseGraphicsArgs(argv);

  try {
    await graphics(options, deps);
  } catch (err) {
    explainError("Could not render that.", err, [
      "pnpm backstage graphics                      # pick from a list",
      "pnpm backstage graphics 'event/*' --all-formats --out ~/images",
    ]);
    process.exitCode = 1;
  }
}

async function graphics(
  options: GraphicsOptions,
  deps: GraphicsDeps,
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();

  // ── Which pictures ────────────────────────────────────────────────────────
  const registry = staticGraphics();
  let skipped: string | null = null;

  if (wantsEvents(options.patterns)) {
    const events = await loadEvents(options.patterns, deps);
    registry.push(...events.graphics);
    skipped = events.skipped;
  }

  assertUniqueStems(registry);

  const chosen =
    options.patterns.length === 0
      ? await pickGraphics(registry)
      : resolvePatterns(options.patterns, registry);

  if (chosen.length === 0) {
    throw new UsageError("Nothing to render.");
  }

  // ── At what sizes ─────────────────────────────────────────────────────────
  const requested = options.allFormats
    ? formatsFor(chosen).map((format) => format.name)
    : options.formats.length > 0
      ? options.formats
      : await pickFormats(chosen);

  const unknown = requested.filter((name) => !FORMATS[name]);
  if (unknown.length > 0) {
    throw new UsageError(
      `No format called ${unknown.join(", ")}. Try one of ${Object.keys(FORMATS).join(", ")}.`,
    );
  }

  const { selections, unsupported } = pair(chosen, requested);

  // Naming one graphic and one format it cannot do is a mistake worth saying
  // out loud; sweeping up combinations that do not exist under a wildcard is
  // not, and reporting every one of those would bury the output.
  if (selections.length === 0 && unsupported.length > 0) {
    throw new UsageError(
      unsupported
        .map((miss) => `${miss.graphic} has no ${miss.format} rendition`)
        .join("; "),
    );
  }
  if (selections.length === 0) throw new UsageError("Nothing to render.");

  // ── Where ─────────────────────────────────────────────────────────────────
  // An empty `--out` counts as absent.
  const out = resolve(
    cwd,
    options.out === undefined || options.out === ""
      ? "."
      : expandHome(options.out),
  );
  const display = (file: string): string => {
    const rel = relative(cwd, file);
    return rel.startsWith("..") ? file : rel;
  };

  if (skipped) log.warn(`event graphics skipped: ${skipped}`);

  if (options.noOutput) {
    note(
      selections
        .map(
          (selection) =>
            `${selection.graphic.name}  ${selection.format.name}\n  ${display(destinationOf(selection, out))}\n  ${selection.format.why}`,
        )
        .join("\n"),
      `${selections.length} image${selections.length === 1 ? "" : "s"}`,
    );
    return;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  let bytes = 0;

  for (const selection of selections) {
    const file = destinationOf(selection, out);
    const { png, width, height } = await render(
      selection.graphic.render(selection.format),
      selection.format,
    );

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, png);
    bytes += png.length;

    log.success(
      `${display(file)}  ${width}x${height}  (${Math.round(png.length / 1024)} KB)`,
    );
  }

  log.info(
    `${selections.length} image${selections.length === 1 ? "" : "s"}, ${Math.round(bytes / 1024)} KB total.`,
  );
}

function resolvePatterns(patterns: string[], registry: Graphic[]): Graphic[] {
  const { matched, unmatched } = matchGraphics(patterns, registry);

  if (unmatched.length === 0) return matched;

  const askedForEvents = unmatched.some(
    (pattern) => pattern === "event" || pattern.startsWith("event/"),
  );
  const haveEvents = registry.some((graphic) => graphic.group === "event");

  // An event pattern that matched nothing is almost never a typo: it is a
  // schedule with no meetings in it, and "try brand/*" sends the reader hunting
  // for a spelling mistake that is not there.
  if (askedForEvents && !haveEvents) {
    throw new UsageError(
      "The published @devdogsuga/events has no meetings, so there are no event images to render.",
    );
  }

  const groups = [...new Set(registry.map((graphic) => `${graphic.group}/*`))];

  throw new UsageError(
    `Nothing called ${unmatched.join(", ")}. Names are group/name. Try ` +
      `${groups.join(", ")}, or * for all of them.`,
  );
}

export const handleGraphics: CommandHandler = async (rest) => {
  await runGraphics(rest);
  return DONE;
};
