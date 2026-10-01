/**
 * The TUI presets: the tool calls they make, in order, and the questions they
 * ask between them.
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
  select: vi.fn(),
  text: vi.fn(),
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

const mode = vi.hoisted(() => ({ nonInteractive: false }));
vi.mock("@devdogsuga/cli-core/mode", async (importOriginal) => ({
  ...(await importOriginal<typeof Mode>()),
  isNonInteractive: () => mode.nonInteractive,
}));

const resolveDbConnection = vi.hoisted(() => vi.fn());
vi.mock("@devdogsuga/cli-core/db/connection", async (importOriginal) => ({
  ...(await importOriginal<typeof Connection>()),
  resolveDbConnection,
}));

const runStackCommand = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ code: 0, lines: [] as string[] })),
);
vi.mock("../db/stack.js", () => ({ runStackCommand }));
const runNewMigration = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => 0),
);
vi.mock("../db/new-migration.js", () => ({ runNewMigration }));

import { handlePreset } from "./commands.js";

const HOSTED_URL = "postgresql://u:secret@db.example.com:5432/postgres";
const KEYS = ["DEPLOY_ENV", "DEV_DB", "DB_URL", "PROJECT_REF"] as const;

let saved: Record<string, string | undefined>;
const savedExitCode = process.exitCode;

function session(env: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

function commands(): string[] {
  return runInGroup.mock.calls.map((call) =>
    (call[1] as string[]).filter((arg) => arg !== HOSTED_URL).join(" "),
  );
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  mode.nonInteractive = false;
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  resolveDbConnection.mockResolvedValue({
    tier: "staging",
    devDatabase: undefined,
    dbUrl: HOSTED_URL,
    projectRef: "ref",
  });
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  process.exitCode = savedExitCode;
  vi.restoreAllMocks();
  runInGroup.mockClear();
  confirm.mockReset();
  runStackCommand.mockClear();
  runNewMigration.mockClear();
});

describe("preset restart-stack", () => {
  it("restarts the local stack", async () => {
    await handlePreset(["restart-stack"]);
    expect(runStackCommand).toHaveBeenCalledWith("restart");
  });
});

describe("preset new-migration", () => {
  it("hands the app and description to the migration creator", async () => {
    await handlePreset(["new-migration", "--app", "platform", "add_widgets"]);
    expect(runNewMigration).toHaveBeenCalledWith("platform", "add_widgets");
  });

  it("will not wait on a question nobody can answer", async () => {
    mode.nonInteractive = true;
    await handlePreset(["new-migration"]);
    expect(runNewMigration).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("preset apply-migrations", () => {
  beforeEach(() =>
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" }),
  );

  it("pushes, then offers types:db, and runs it on yes", async () => {
    confirm.mockResolvedValue(true);

    await handlePreset(["apply-migrations"]);

    expect(commands()).toEqual([
      "exec supabase db push --db-url",
      "-F @devdogsuga/supabase run types:db",
    ]);
  });

  it("stops after the push on no", async () => {
    confirm.mockResolvedValue(false);

    await handlePreset(["apply-migrations"]);

    expect(commands()).toEqual(["exec supabase db push --db-url"]);
  });

  it("asks nothing and hints when there is no terminal", async () => {
    mode.nonInteractive = true;

    await handlePreset(["apply-migrations"]);

    expect(confirm).not.toHaveBeenCalled();
    expect(commands()).toEqual(["exec supabase db push --db-url"]);
  });

  it("does not offer types after a failed push", async () => {
    runInGroup.mockResolvedValueOnce({ code: 1, signal: null });

    await handlePreset(["apply-migrations"]);

    expect(confirm).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("preset push-config", () => {
  it("shows the diff, asks, then pushes", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    confirm.mockResolvedValue(true);

    await handlePreset(["push-config"]);

    expect(commands()).toEqual([
      "exec supabase config diff --project-ref ref",
      "exec supabase config push --project-ref ref",
    ]);
  });

  it("pushes nothing when the answer is no", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    confirm.mockResolvedValue(false);

    await handlePreset(["push-config"]);

    expect(commands()).toEqual(["exec supabase config diff --project-ref ref"]);
    expect(process.exitCode).toBe(1);
  });

  it("needs --yes to push with no terminal, diff still shown", async () => {
    session({ DEPLOY_ENV: "staging", DB_URL: HOSTED_URL, PROJECT_REF: "ref" });
    mode.nonInteractive = true;

    await handlePreset(["push-config"]);
    expect(commands()).toEqual(["exec supabase config diff --project-ref ref"]);

    runInGroup.mockClear();
    await handlePreset(["push-config", "--yes"]);
    expect(commands()).toEqual([
      "exec supabase config diff --project-ref ref",
      "exec supabase config push --project-ref ref",
    ]);
  });

  it("refuses on the local tier and offers the restart", async () => {
    session({
      DEPLOY_ENV: "development",
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    confirm.mockResolvedValue(true);

    await handlePreset(["push-config"]);

    expect(commands()).toEqual([]);
    expect(runStackCommand).toHaveBeenCalledWith("restart");
  });
});

describe("preset", () => {
  it("rejects an unknown name", async () => {
    expect(await handlePreset(["nope"])).toBeNull();
    expect(process.exitCode).toBe(1);
  });
});
