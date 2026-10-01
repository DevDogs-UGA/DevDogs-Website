/**
 * `devtools supabase`: the session decides the target, the user's flags win,
 * and `config push` on the local tier never runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProcessGroup from "@devdogsuga/cli-core/process-group";
import type * as RepoRoot from "@devdogsuga/cli-core/repo/root";
import type * as Mode from "@devdogsuga/cli-core/mode";
import type * as Connection from "@devdogsuga/cli-core/db/connection";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("@clack/prompts", () => ({
  confirm,
  isCancel: () => false,
  cancel: vi.fn(),
  log: { error: vi.fn(), message: vi.fn() },
  note: vi.fn(),
}));

const runInGroup = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ code: 0, signal: null })),
);
vi.mock("@devdogsuga/cli-core/process-group", async (importOriginal) => ({
  ...(await importOriginal<typeof ProcessGroup>()),
  runInGroup,
}));

vi.mock("@devdogsuga/cli-core/repo/root", async (importOriginal) => ({
  ...(await importOriginal<typeof RepoRoot>()),
  findRepoRoot: () => "/fake/repo",
}));

const mode = vi.hoisted(() => ({ nonInteractive: true }));
vi.mock("@devdogsuga/cli-core/mode", async (importOriginal) => ({
  ...(await importOriginal<typeof Mode>()),
  isNonInteractive: () => mode.nonInteractive,
}));

const resolveDbConnection = vi.hoisted(() => vi.fn());
vi.mock("@devdogsuga/cli-core/db/connection", async (importOriginal) => ({
  ...(await importOriginal<typeof Connection>()),
  resolveDbConnection,
}));

import { runSupabase } from "./supabase.js";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HOSTED_URL = "postgresql://u:secret@db.example.com:5432/postgres";
const KEYS = ["DEPLOY_ENV", "DEV_DB", "DB_URL", "PROJECT_REF"] as const;

let saved: Record<string, string | undefined>;
let stderr: string[];

function session(env: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

function ranArgs(): string[] {
  const call = runInGroup.mock.calls.at(-1)!;
  return call[1] as string[];
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  stderr = [];
  mode.nonInteractive = true;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  runInGroup.mockClear();
  confirm.mockReset();
  resolveDbConnection.mockReset();
});

describe("devtools supabase", () => {
  it("fills in the staging database for a database command, and prints the command without the URL", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    resolveDbConnection.mockResolvedValue({
      tier: "staging",
      devDatabase: undefined,
      dbUrl: HOSTED_URL,
      projectRef: "ref",
    });

    const code = await runSupabase(["db", "push"], async () => 0);

    expect(code).toBe(0);
    expect(ranArgs()).toEqual([
      "exec",
      "supabase",
      "db",
      "push",
      "--db-url",
      HOSTED_URL,
    ]);
    const printed = stderr.join("");
    expect(printed).toContain(
      "Ran: pnpm exec supabase db push --db-url <DB_URL>",
    );
    expect(printed).not.toContain("secret");
  });

  it("fills in the tier's project ref for a project command", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });

    await runSupabase(["functions", "list"], async () => 0);

    expect(ranArgs()).toEqual([
      "exec",
      "supabase",
      "functions",
      "list",
      "--project-ref",
      "ref",
    ]);
  });

  it("stops a project command on the local tier instead of using the linked project", async () => {
    // `.env` may name the remote dev project even while the session is local.
    session({
      DEPLOY_ENV: "development",
      DB_URL: LOCAL_URL,
      PROJECT_REF: "remotedev",
    });

    const code = await runSupabase(["link"], async () => 0);

    expect(code).toBe(1);
    expect(runInGroup).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("has none");
  });

  it("leaves the user's own target flag alone", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });

    await runSupabase(["db", "push", "--linked"], async () => 0);

    expect(ranArgs()).toEqual(["exec", "supabase", "db", "push", "--linked"]);
    expect(resolveDbConnection).not.toHaveBeenCalled();
  });

  it("forwards commands that target this machine untouched", async () => {
    session({ DEPLOY_ENV: "development", DB_URL: LOCAL_URL });

    await runSupabase(["status", "-o", "env"], async () => 0);

    expect(ranArgs()).toEqual(["exec", "supabase", "status", "-o", "env"]);
  });

  it("never adds --yes", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    resolveDbConnection.mockResolvedValue({
      tier: "staging",
      devDatabase: undefined,
      dbUrl: HOSTED_URL,
      projectRef: "ref",
    });

    await runSupabase(["db", "push"], async () => 0);
    await runSupabase(["config", "push"], async () => 0);

    for (const call of runInGroup.mock.calls) {
      expect(call[1]).not.toContain("--yes");
    }
  });

  it("stops when the session's database cannot be resolved", async () => {
    session({ DEPLOY_ENV: "development" });
    resolveDbConnection.mockResolvedValue(null);

    const code = await runSupabase(["db", "push"], async () => 0);

    expect(code).toBe(1);
    expect(runInGroup).not.toHaveBeenCalled();
  });

  it("passes the exit code through and hints at types:db after a push", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    resolveDbConnection.mockResolvedValue({
      tier: "staging",
      devDatabase: undefined,
      dbUrl: HOSTED_URL,
      projectRef: "ref",
    });
    runInGroup.mockResolvedValueOnce({ code: 0, signal: null });
    await runSupabase(["db", "push"], async () => 0);
    expect(stderr.join("")).toContain("types:db");

    stderr.length = 0;
    runInGroup.mockResolvedValueOnce({ code: 4, signal: null });
    expect(await runSupabase(["db", "push"], async () => 0)).toBe(4);
    expect(stderr.join("")).not.toContain("types:db");
  });
});

describe("config push on the local tier", () => {
  beforeEach(() => session({ DEPLOY_ENV: "development", DB_URL: LOCAL_URL }));

  it("does not run, explains the restart, and names the preset without a terminal", async () => {
    const restart = vi.fn(async () => 0);

    const code = await runSupabase(["config", "push"], restart);

    expect(code).toBe(1);
    expect(runInGroup).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    const printed = stderr.join("");
    expect(printed).toContain("config.toml");
    expect(printed).toContain("preset restart-stack");
  });

  it("offers the restart at a terminal and runs it on yes", async () => {
    mode.nonInteractive = false;
    confirm.mockResolvedValue(true);
    const restart = vi.fn(async () => 0);

    const code = await runSupabase(["config", "push"], restart);

    expect(restart).toHaveBeenCalledOnce();
    expect(code).toBe(0);
    expect(runInGroup).not.toHaveBeenCalled();
  });

  it("leaves the stack alone on no", async () => {
    mode.nonInteractive = false;
    confirm.mockResolvedValue(false);
    const restart = vi.fn(async () => 0);

    expect(await runSupabase(["config", "push"], restart)).toBe(1);
    expect(restart).not.toHaveBeenCalled();
  });
});
