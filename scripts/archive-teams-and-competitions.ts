/**
 * Exports the platform's Teams and competitions tables to `archive/*.json`,
 * once, before the tables are dropped (the "table-drop PR", lane 3e).
 *
 *   node scripts/archive-teams-and-competitions.ts [options]
 *
 *   --project-ref <ref>   the Supabase project to read (default: production)
 *   --out <dir>           where the public archive goes (default: archive)
 *   --private-out <dir>   also write the unredacted rows here, OUTSIDE the
 *                         repository (join codes, creator and member user ids)
 *   --check               verify archive/ against the manifest and, while the
 *                         tables still exist, against the live row counts
 *
 * Reads production through the Management API's read-only query endpoint with
 * the Supabase CLI's access token (`SUPABASE_ACCESS_TOKEN`, or
 * `~/.supabase/access-token`). It can't write: the endpoint rejects anything
 * but a read.
 *
 * The repository is public, so what lands in `archive/` is what the public
 * competition archive page already showed, and no more: competitions and their
 * entries, and teams without their `joinCode` (a secret) or `createdBy`.
 * Team members are listed by public handle only when that member has a public
 * profile; every other member is a row with a null handle, so the counts still
 * add up to production's without naming anyone who didn't choose to be named.
 * Membership requests were transient invitations and are recorded as a count.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PRODUCTION_REF = "crhqsbngqmwtsplabmhj";

type Row = Record<string, unknown>;

interface Options {
  projectRef: string;
  out: string;
  privateOut: string | null;
  check: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    projectRef: PRODUCTION_REF,
    out: "archive",
    privateOut: null,
    check: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--check") options.check = true;
    else if (arg === "--project-ref") options.projectRef = argv[++i] ?? "";
    else if (arg === "--out") options.out = argv[++i] ?? "";
    else if (arg === "--private-out") options.privateOut = argv[++i] ?? "";
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.projectRef || !options.out) throw new Error("Missing value");
  return options;
}

function accessToken(): string {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN;
  if (fromEnv) return fromEnv;
  const file = join(homedir(), ".supabase", "access-token");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  throw new Error(
    "No Supabase access token: set SUPABASE_ACCESS_TOKEN or run `supabase login`.",
  );
}

/**
 * Runs one SELECT. The read-only endpoint is the default; the members query
 * needs the `publicProfiles` view, whose helper functions that restricted role
 * may not call, so it asks for the ordinary endpoint. Either way the statement
 * must be a bare `select`, which this checks before sending anything.
 */
async function query(
  projectRef: string,
  sql: string,
  endpoint: "read-only" | "default" = "read-only",
): Promise<Row[]> {
  if (!/^\s*select\b/i.test(sql) || sql.includes(";")) {
    throw new Error(
      "Only a single SELECT statement may be sent to production.",
    );
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query${endpoint === "read-only" ? "/read-only" : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(`query failed (${response.status}): ${text}`);
  return JSON.parse(text) as Row[];
}

/** The tables this archive covers, and how many rows each has right now. */
const COUNT_SQL = `
  select
    (select count(*) from platform.teams) as "teams",
    (select count(*) from platform."teamMembers") as "teamMembers",
    (select count(*) from platform."teamMembershipRequests") as "teamMembershipRequests",
    (select count(*) from platform.competitions) as "competitions",
    (select count(*) from platform."competitionEntries") as "competitionEntries"`;

const TABLES = [
  "teams",
  "teamMembers",
  "teamMembershipRequests",
  "competitions",
  "competitionEntries",
] as const;
type Table = (typeof TABLES)[number];
type Counts = Record<Table, number>;

async function liveCounts(projectRef: string): Promise<Counts | null> {
  try {
    const [row] = await query(projectRef, COUNT_SQL);
    const counts = {} as Counts;
    for (const table of TABLES) counts[table] = Number(row![table]);
    return counts;
  } catch (error) {
    if (String(error).includes("does not exist")) return null;
    throw error;
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface Manifest {
  exportedAt: string;
  source: string;
  tables: Record<Table, { rows: number; file: string | null; note?: string }>;
  redactions: string[];
  files: Record<string, string>;
}

async function exportArchive(options: Options): Promise<void> {
  const counts = await liveCounts(options.projectRef);
  if (!counts)
    throw new Error("The tables are already gone; nothing to export.");

  const competitions = await query(
    options.projectRef,
    `select id, slug, title, brief, repo, "issueNumber", "issueNodeId", url,
            "kickedOffAt", "plannedEndAt", "closedAt", "githubSyncedAt"
     from platform.competitions order by "kickedOffAt", slug`,
  );
  const entries = await query(
    options.projectRef,
    `select ce.id, c.slug as "competitionSlug", ce."competitionId",
            t.slug as "teamSlug", ce."teamId", ce."prNumber", ce."prNodeId",
            ce.url, ce."openedAt", ce."mergedAt", ce."closedAt"
     from platform."competitionEntries" ce
     join platform.competitions c on c.id = ce."competitionId"
     join platform.teams t on t.id = ce."teamId"
     order by ce."openedAt", ce."prNumber"`,
  );
  const teams = await query(
    options.projectRef,
    `select id, slug, name, "acceptingRequests", "githubSyncedAt"
     from platform.teams order by slug`,
  );
  const members = await query(
    options.projectRef,
    `select tm."teamId", tm.role, tm."joinedAt", tm."leftAt", pp.handle
     from platform."teamMembers" tm
     left join platform."publicProfiles" pp on pp."userId" = tm."userId"
     order by tm."joinedAt", tm.id`,
    "default",
  );

  const teamsWithMembers = teams.map((team) => ({
    ...team,
    members: members
      .filter((member) => member.teamId === team.id)
      .map(({ teamId: _teamId, ...member }) => member),
  }));

  const memberRows = teamsWithMembers.reduce(
    (total, team) => total + team.members.length,
    0,
  );
  if (
    competitions.length !== counts.competitions ||
    entries.length !== counts.competitionEntries ||
    teams.length !== counts.teams ||
    memberRows !== counts.teamMembers
  ) {
    throw new Error(
      `Export does not match production's counts: ${JSON.stringify({
        counts,
        exported: {
          competitions: competitions.length,
          competitionEntries: entries.length,
          teams: teams.length,
          teamMembers: memberRows,
        },
      })}`,
    );
  }

  const files: Record<string, string> = {
    "competitions.json": json(competitions),
    "competitionEntries.json": json(entries),
    "teams.json": json(teamsWithMembers),
  };
  const manifest: Manifest = {
    exportedAt: new Date().toISOString(),
    source: `production (Supabase project ${options.projectRef})`,
    tables: {
      teams: { rows: counts.teams, file: "teams.json" },
      teamMembers: {
        rows: counts.teamMembers,
        file: "teams.json",
        note: "listed under each team's `members`; a member without a public profile has a null handle",
      },
      teamMembershipRequests: {
        rows: counts.teamMembershipRequests,
        file: null,
        note: "transient invitations; recorded as a count only",
      },
      competitions: { rows: counts.competitions, file: "competitions.json" },
      competitionEntries: {
        rows: counts.competitionEntries,
        file: "competitionEntries.json",
      },
    },
    redactions: [
      "teams.joinCode (a secret) and teams.createdBy are omitted",
      "team members are identified by public handle only, and only when they have a public profile",
    ],
    files: Object.fromEntries(
      Object.entries(files).map(([name, body]) => [name, sha256(body)]),
    ),
  };

  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(out, name), body);
  }
  writeFileSync(join(out, "manifest.json"), json(manifest));

  if (options.privateOut) {
    const privateOut = resolve(options.privateOut);
    mkdirSync(privateOut, { recursive: true, mode: 0o700 });
    for (const [table, statement] of [
      ["teams", `select * from platform.teams order by slug`],
      ["teamMembers", `select * from platform."teamMembers" order by id`],
      [
        "teamMembershipRequests",
        `select * from platform."teamMembershipRequests" order by id`,
      ],
      ["competitions", `select * from platform.competitions order by slug`],
      [
        "competitionEntries",
        `select * from platform."competitionEntries" order by id`,
      ],
    ] as const) {
      writeFileSync(
        join(privateOut, `${table}.json`),
        json(await query(options.projectRef, statement)),
        { mode: 0o600 },
      );
    }
    console.log(
      `Unredacted rows written to ${privateOut} (keep them private).`,
    );
  }

  console.log(`Archived to ${out}:`, counts);
}

/** `--check`: the files match the manifest, and the manifest matches prod. */
async function checkArchive(options: Options): Promise<void> {
  const out = resolve(options.out);
  const manifest = JSON.parse(
    readFileSync(join(out, "manifest.json"), "utf8"),
  ) as Manifest;
  const problems: string[] = [];

  for (const [name, expected] of Object.entries(manifest.files)) {
    const actual = sha256(readFileSync(join(out, name), "utf8"));
    if (actual !== expected) problems.push(`${name} does not match its hash`);
  }

  const read = (name: string) =>
    JSON.parse(readFileSync(join(out, name), "utf8")) as Row[];
  const teams = read("teams.json") as Array<Row & { members: Row[] }>;
  const archived: Counts = {
    teams: teams.length,
    teamMembers: teams.reduce((n, team) => n + team.members.length, 0),
    teamMembershipRequests: manifest.tables.teamMembershipRequests.rows,
    competitions: read("competitions.json").length,
    competitionEntries: read("competitionEntries.json").length,
  };
  for (const table of TABLES) {
    if (archived[table] !== manifest.tables[table].rows) {
      problems.push(
        `${table}: ${archived[table]} archived rows, manifest says ${manifest.tables[table].rows}`,
      );
    }
  }

  const live = await liveCounts(options.projectRef);
  if (live) {
    for (const table of TABLES) {
      if (live[table] !== manifest.tables[table].rows) {
        problems.push(
          `${table}: production has ${live[table]} rows, manifest says ${manifest.tables[table].rows}`,
        );
      }
    }
  } else {
    console.log("The tables are gone from production; checked the files only.");
  }

  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("Archive matches its manifest", live ? "and production." : ".");
}

const options = parseArgs(process.argv.slice(2));
await (options.check ? checkArchive(options) : exportArchive(options));
