/**
 * `export` against a fake production and an in-memory file: the audit row is
 * written before any row is read, attributed through the gh login, and a
 * failure partway discards the partial file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../production/meetings.js";
import {
  runExport,
  type ExportDeps,
  type ExportSource,
  type Sink,
} from "./commands.js";
import type { ExportFilters, ExportKind } from "./queries.js";

let stderr: string;
let events: string[];
let file: { path: string; text: string; discarded: boolean } | undefined;
let officers: string[];
let lastFilters: ExportFilters | undefined;

const ROWS = [
  {
    user_id: "u-1",
    preferred_name: "=Ada, the first",
    email: "ada@uga.edu",
    github_login: null,
    meeting_config_id: "rec1",
    meeting_title: "Build Session",
    meeting_starts_at: new Date("2026-09-09T22:00:00Z"),
    checked_in_at: new Date("2026-09-09T22:05:00Z"),
    check_in_method: "import",
    counts_for_credit: true,
  },
];

function source(fail = false): ExportSource {
  return {
    officersFor: async (login) => {
      events.push(`officer:${login}`);
      return officers;
    },
    findMeetings: async (): Promise<Meeting[]> => [
      {
        id: "m-1",
        slug: "2026-09-09",
        configId: "rec1",
        title: "Build Session",
        startsAt: new Date("2026-09-09T22:00:00Z"),
        endsAt: new Date("2026-09-10T00:00:00Z"),
        cancelledAt: null,
        countsForCredit: true,
      },
    ],
    audit: async (userId, kind: ExportKind, filters) => {
      events.push(`audit:${userId}:${kind}:${JSON.stringify(filters)}`);
      return "audit-1";
    },
    rows: async function* (_kind, filters) {
      lastFilters = filters;
      events.push("rows");
      yield ROWS;
      if (fail) throw Object.assign(new Error("boom"), { code: "57014" });
    },
    finish: async (id, count) => {
      events.push(`finish:${id}:${count}`);
    },
    close: () => Promise.resolve(),
  };
}

function deps(fail = false): ExportDeps {
  return {
    ghLogin: async () => "sloanfinger",
    source: async () => source(fail),
    sink: async (path): Promise<Sink> => {
      file = { path, text: "", discarded: false };
      const f = file;
      return {
        write: async (text) => {
          f.text += text;
        },
        close: () => Promise.resolve(),
        discard: async () => {
          f.discarded = true;
        },
      };
    },
  };
}

beforeEach(() => {
  stderr = "";
  events = [];
  file = undefined;
  officers = ["u-officer"];
  lastFilters = undefined;
  process.exitCode = undefined;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  process.env.CI = "true";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("export", () => {
  it("audits before reading, writes the CSV, then records the count", async () => {
    await runExport(
      [
        "attendance",
        "--meeting",
        "2026-09-09",
        "--from",
        "2026-09-01",
        "--to",
        "2026-09-30",
      ],
      deps(),
    );
    expect(process.exitCode).toBeUndefined();
    expect(file?.path).toBe("attendance-2026-09-09-2026-09-01-2026-09-30.csv");
    expect(events).toEqual([
      "officer:sloanfinger",
      'audit:u-officer:attendance:{"from":"2026-09-01T04:00:00.000Z","to":"2026-10-01T04:00:00.000Z","meetingId":"m-1"}',
      "rows",
      "finish:audit-1:1",
    ]);
    expect(lastFilters?.meetingId).toBe("m-1");
    expect(file?.text).toBe(
      "user_id,preferred_name,email,github_login,meeting_config_id,meeting_title,meeting_starts_at,checked_in_at,check_in_method,counts_for_credit\r\n" +
        'u-1,"\t=Ada, the first",ada@uga.edu,,rec1,Build Session,2026-09-09T22:00:00.000Z,2026-09-09T22:05:00.000Z,import,true\r\n',
    );
  });

  it("refuses an export nobody can be named for, before writing anything", async () => {
    officers = [];
    await runExport(["stars"], deps());
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain(
      "No platform account has linked the GitHub login sloanfinger",
    );
    expect(file).toBeUndefined();
    expect(events.some((e) => e.startsWith("audit"))).toBe(false);
  });

  it("discards the partial file when a read fails partway", async () => {
    await runExport(["stars"], deps(true));
    expect(process.exitCode).toBe(1);
    expect(file?.discarded).toBe(true);
    expect(events).not.toContain("finish:audit-1:1");
  });

  it("takes --meeting only for attendance", async () => {
    await runExport(["stars", "--meeting", "2026-09-09"], deps());
    expect(stderr).toContain("--meeting only applies to the attendance export");
  });

  it("dry-runs without auditing", async () => {
    await runExport(["reflections", "--dry-run"], deps());
    expect(stderr).toContain(
      "Would export reflections to reflections.csv, audited as sloanfinger",
    );
    expect(events).toEqual(["officer:sloanfinger"]);
  });
});
