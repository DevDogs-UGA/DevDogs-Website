/**
 * `backstage export <stars|attendance|reflections>`: the platform's CSV
 * downloads, moved here from `/console/exports`.
 *
 *   pnpm backstage export stars --from 2026-08-17 --to 2026-12-12
 *   pnpm backstage export attendance --meeting 2026-09-09 --out -
 *
 * ## Audited, as the downloads were
 *
 * Each export writes a `platform.exportAudit` row BEFORE the first row is
 * read, as the web routes did: an export that fails halfway still put rows
 * in front of somebody. The row names the officer's platform account, found
 * through the GitHub login `gh` is signed in as (the identity they linked on
 * the platform), so an export nobody can attribute is refused rather than
 * recorded as nobody's. The row count is filled in when the file is done.
 *
 * ## The file
 *
 * Written to `./<kind>[-<meeting>][-<from>][-<to>].csv` by default, created
 * readable by its owner only (it is member PII), never over an existing file
 * without `--yes`. `--out -` streams to stdout without the byte-order mark,
 * for a pipe. A failure partway removes the partial file.
 *
 * `--from`/`--to` take Eastern days, `--to` inclusive (see `production/time.ts`).
 */
import { execFile } from "node:child_process";
import { open, rm } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { isDryRun } from "@devdogsuga/cli-core/dry-run";
import { errorMessage, UsageError } from "@devdogsuga/cli-core/ui";
import { BOM, csvRow } from "../csv/write.js";
import {
  connect,
  dbError,
  ProductionError,
  requireProductionKey,
  type Sql,
} from "../production/access.js";
import { plural, reportFailure, say } from "../production/cli.js";
import {
  describeMeeting,
  findMeetingsWith,
  pickMeeting,
  type FindMeetings,
} from "../production/meetings.js";
import { parseBound } from "../production/time.js";
import {
  auditFilters,
  EXPORT_KINDS,
  EXPORTS,
  exportParams,
  type ExportFilters,
  type ExportKind,
} from "./queries.js";

/** Production, as an export uses it. One connection for the whole run. */
export interface ExportSource {
  /** Platform accounts that linked this GitHub login. */
  officersFor: (login: string) => Promise<string[]>;
  findMeetings: FindMeetings;
  /** Writes the audit row; returns its id. */
  audit: (
    userId: string,
    kind: ExportKind,
    filters: Record<string, string>,
  ) => Promise<string>;
  /** The export's rows, a page at a time, as column-name records. */
  rows: (
    kind: ExportKind,
    filters: ExportFilters,
  ) => AsyncIterable<Record<string, unknown>[]>;
  finish: (auditId: string, rowCount: number) => Promise<void>;
  close: () => Promise<void>;
}

/** Where the CSV goes. */
export interface Sink {
  write: (text: string) => Promise<void>;
  close: () => Promise<void>;
  /** Removes a partial file after a failure; a no-op for stdout. */
  discard: () => Promise<void>;
}

export interface ExportDeps {
  ghLogin?: () => Promise<string>;
  source?: () => Promise<ExportSource>;
  sink?: (path: string, overwrite: boolean) => Promise<Sink>;
}

interface Values {
  from?: string;
  to?: string;
  meeting?: string;
  out?: string;
  yes?: boolean;
  "dry-run"?: boolean;
}

function parse(argv: readonly string[]): { kind: ExportKind; values: Values } {
  const [kind, ...rest] = argv;
  if (!kind || !(EXPORT_KINDS as readonly string[]).includes(kind)) {
    throw new UsageError(
      kind
        ? `Unknown export "${kind}". Try ${EXPORT_KINDS.join(", ")}.`
        : `Name the export: ${EXPORT_KINDS.join(", ")}.`,
    );
  }
  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        meeting: { type: "string" },
        out: { type: "string" },
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    });
    if (values.meeting && kind !== "attendance") {
      throw new UsageError("--meeting only applies to the attendance export.");
    }
    return { kind: kind as ExportKind, values };
  } catch (err) {
    if (err instanceof UsageError) throw err;
    throw new UsageError(errorMessage(err));
  }
}

const run = promisify(execFile);

/** The GitHub login `gh` is signed in as. */
export async function ghLogin(): Promise<string> {
  try {
    const { stdout } = await run("gh", ["api", "user", "--jq", ".login"]);
    const login = stdout.trim();
    if (login) return login;
  } catch {
    // Worded below.
  }
  throw new ProductionError(
    "Exports are audited under your GitHub login, and `gh` could not say " +
      "who you are. Install it from https://cli.github.com and run `gh auth login`.",
  );
}

export const OFFICER_QUERY = `
select distinct i."user_id"::text as "userId"
from "auth"."identities" i
where i."provider" = 'github'
  and lower(i."identity_data" ->> 'user_name') = lower($1)
`;

export function sourceWith(sql: Sql): ExportSource {
  return {
    officersFor: async (login) =>
      (await sql.unsafe(OFFICER_QUERY, [login])).map((r) => String(r.userId)),
    findMeetings: findMeetingsWith(sql),
    audit: async (userId, kind, filters) => {
      const [row] = await sql.unsafe(
        `insert into "platform"."exportAudit" ("userId", "kind", "filters")
         values ($1, $2, $3::text::jsonb) returning "id"::text as "id"`,
        [userId, kind, JSON.stringify(filters)],
      );
      return String(row!.id);
    },
    rows: (kind, filters) =>
      sql.unsafe(EXPORTS[kind].sql, exportParams(filters)).cursor(500),
    finish: async (auditId, rowCount) => {
      await sql.unsafe(
        `update "platform"."exportAudit" set "rowCount" = $1 where "id" = $2::uuid`,
        [rowCount, auditId],
      );
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

async function productionSource(): Promise<ExportSource> {
  return sourceWith(connect(await requireProductionKey("DB_URL")));
}

async function fileSink(path: string, overwrite: boolean): Promise<Sink> {
  if (path === "-") {
    return {
      write: (text) =>
        new Promise((resolve, reject) =>
          process.stdout.write(text, (err) => (err ? reject(err) : resolve())),
        ),
      close: () => Promise.resolve(),
      discard: () => Promise.resolve(),
    };
  }
  let handle;
  try {
    handle = await open(path, overwrite ? "w" : "wx", 0o600);
  } catch (err) {
    if ((err as { code?: string }).code === "EEXIST") {
      throw new UsageError(`${path} already exists. Pass --yes to replace it.`);
    }
    throw new UsageError(`Could not write ${path}.`);
  }
  await handle.write(BOM);
  return {
    write: async (text) => {
      await handle.write(text);
    },
    close: () => handle.close(),
    discard: async () => {
      await handle.close().catch(() => undefined);
      await rm(path, { force: true });
    },
  };
}

function defaultPath(
  kind: ExportKind,
  values: Values,
  meetingSlug?: string,
): string {
  const parts: string[] = [kind];
  if (meetingSlug) parts.push(meetingSlug);
  if (values.from) parts.push(values.from.slice(0, 10));
  if (values.to) parts.push(values.to.slice(0, 10));
  return `${parts.join("-")}.csv`;
}

export async function runExport(
  argv: readonly string[],
  deps: ExportDeps = {},
): Promise<void> {
  let source: ExportSource | undefined;
  let sink: Sink | undefined;
  let done = false;
  try {
    const { kind, values } = parse(argv);
    const filters: ExportFilters = {
      from: parseBound("--from", values.from),
      to: parseBound("--to", values.to),
    };
    if (filters.from && filters.to && filters.from >= filters.to) {
      throw new UsageError("--from must come before --to.");
    }

    const login = await (deps.ghLogin ?? ghLogin)();
    source = await (deps.source ?? productionSource)();
    const officers = await source.officersFor(login);
    if (officers.length !== 1) {
      throw new ProductionError(
        officers.length === 0
          ? `No platform account has linked the GitHub login ${login}. ` +
              "Link GitHub on your platform profile, then export again."
          : `${plural(officers.length, "platform account")} linked the GitHub login ${login}; ` +
              "an export must be attributable to one.",
      );
    }

    let slug: string | undefined;
    if (values.meeting) {
      const meeting = pickMeeting(
        values.meeting,
        await source.findMeetings(values.meeting),
      );
      filters.meetingId = meeting.id;
      slug = meeting.slug;
      say(`Meeting: ${describeMeeting(meeting)}.`);
    }

    const path = values.out ?? defaultPath(kind, values, slug);
    if (values["dry-run"] === true || isDryRun()) {
      say(
        `Would export ${kind} to ${path === "-" ? "stdout" : path}, audited as ${login}.`,
      );
      return;
    }

    sink = await (deps.sink ?? fileSink)(path, values.yes === true);
    const auditId = await source.audit(
      officers[0]!,
      kind,
      auditFilters(filters),
    );

    const { columns } = EXPORTS[kind];
    await sink.write(csvRow(columns));
    let count = 0;
    for await (const page of source.rows(kind, filters)) {
      await sink.write(
        page.map((row) => csvRow(columns.map((c) => row[c]))).join(""),
      );
      count += page.length;
    }
    await sink.close();
    done = true;
    await source.finish(auditId, count);
    say(
      `Exported ${plural(count, "row")} to ${path === "-" ? "stdout" : path}.`,
      "success",
    );
  } catch (err) {
    if (sink && !done) await sink.discard().catch(() => undefined);
    const worded =
      err instanceof UsageError || err instanceof ProductionError
        ? err
        : (err as { code?: string }).code
          ? dbError("The export failed", err)
          : err;
    reportFailure("export", worded);
  } finally {
    await source?.close().catch(() => undefined);
  }
}

export const handleExport: CommandHandler = async (rest) => {
  await runExport(rest);
  return process.exitCode ? null : DONE;
};
