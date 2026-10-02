/**
 * `jobs`: which kind a request is about, the one picker over both kinds, and
 * the one list.
 *
 * Discovery is faked at its module boundary (the apps' wrangler configs and
 * `scheduled.ts` maps), and so are the two runners `jobs run` hands off to:
 * what is under test is the hand-off, not a cron fetch or a Workflow trigger,
 * which `cron/commands.test.ts` and `workflows/commands.test.ts` cover.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CronCommands from "../cron/commands.js";
import type * as Discovery from "../cron/discovery.js";
import type * as WorkflowCommands from "../workflows/commands.js";

const select = vi.hoisted(() => vi.fn());
vi.mock("@clack/prompts", () => ({
  select,
  confirm: vi.fn(),
  text: vi.fn(),
  isCancel: () => false,
  cancel: vi.fn(),
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), message: vi.fn() },
  note: vi.fn(),
}));

vi.mock("../cron/discovery.js", async (importOriginal) => ({
  ...(await importOriginal<typeof Discovery>()),
  discoverWranglerConfigs: () => [
    {
      app: "platform",
      path: "/repo/apps/platform/wrangler.jsonc",
      config: { triggers: { crons: ["0 0 * * *"] } },
    },
    {
      app: "schedule-builder",
      path: "/repo/apps/schedule-builder/wrangler.jsonc",
      config: {
        workflows: [
          {
            binding: "SCRAPE_WORKFLOW",
            name: "scrape",
            class_name: "ScrapeWorkflow",
            schedules: ["0 */6 * * *"],
          },
          { binding: "REBUILD_WORKFLOW", name: "rebuild" },
        ],
      },
    },
  ],
  discoverCronMaps: () =>
    Promise.resolve([
      {
        app: "platform",
        path: "/repo/apps/platform/cloudflare/scheduled.ts",
        routes: {
          "0 0 * * *": { label: "Nightly cleanup", routes: ["/cron/cleanup"] },
          "*/15 * * * *": { label: "Sync events", routes: ["/cron/events"] },
        },
        workflows: {},
      },
    ]),
}));

const runCronRun = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));
vi.mock("../cron/commands.js", async (importOriginal) => ({
  ...(await importOriginal<typeof CronCommands>()),
  runCronRun,
}));

const runWorkflowsRun = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));
const runWorkflowsServe = vi.hoisted(() => vi.fn(() => Promise.resolve(0)));
vi.mock("../workflows/commands.js", async (importOriginal) => ({
  ...(await importOriginal<typeof WorkflowCommands>()),
  runWorkflowsRun,
  runWorkflowsServe,
}));

const { collectJobs, kindsOf, pickerRows, renderJobs, runJobs } =
  await import("./commands.js");
const { catalog } = await import("../catalog.js");
const { beginInvocation, reproducibleCommand } =
  await import("@devdogsuga/cli-core/invocation");

/** `jobs <argv>` as dispatch receives it, after an alias is rewritten. */
function typed(...argv: string[]): string[] {
  return catalog.canonicalArgv(argv).slice(1);
}

let stderr: string[];
const ttyBefore = process.stdin.isTTY;

beforeEach(() => {
  stderr = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
  });
  select.mockReset();
  runCronRun.mockClear();
  runWorkflowsRun.mockClear();
  runWorkflowsServe.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process.stdin, "isTTY", {
    value: ttyBefore,
    configurable: true,
  });
});

describe("kindsOf", () => {
  it("covers both kinds unless narrowed", () => {
    expect(kindsOf([], "run")).toEqual(["sync", "long-running"]);
    expect(kindsOf(["--kind", "sync"], "run")).toEqual(["sync"]);
  });

  it("refuses an alias asked for the other kind", () => {
    expect(
      kindsOf(typed("cron", "run", "--kind", "long-running"), "run"),
    ).toBeNull();
    expect(stderr.join("")).toContain("`cron` already means sync");
  });

  it("refuses a kind it does not know", () => {
    expect(kindsOf(["--kind", "slow"], "list")).toBeNull();
  });
});

describe("pickerRows", () => {
  const picks = [
    {
      kind: "sync" as const,
      app: "platform",
      expr: "0 0 * * *",
      label: "Nightly cleanup",
      hint: "daily",
    },
    {
      kind: "long-running" as const,
      app: "schedule-builder",
      binding: "SCRAPE_WORKFLOW",
      label: "scrape",
      hint: "on demand",
    },
  ];

  it("heads each kind with a disabled row carrying its description", () => {
    const rows = pickerRows(picks);
    expect(rows.map((row) => [row.label, row.disabled ?? false])).toEqual([
      ["Quick syncs", true],
      ["  platform · Nightly cleanup", false],
      ["Long-running jobs", true],
      ["  schedule-builder · scrape", false],
    ]);
    expect(rows[0]!.hint).toBe(
      "The platform calls these on a timer; each finishes in seconds.",
    );
  });

  it("draws no heading for a kind with no jobs", () => {
    expect(pickerRows([picks[1]!]).map((row) => row.label)).toEqual([
      "Long-running jobs",
      "  schedule-builder · scrape",
    ]);
  });
});

describe("jobs run", () => {
  it("refuses --cron with --workflow", async () => {
    expect(
      await runJobs(["run", "--cron", "0 0 * * *", "--workflow", "scrape"]),
    ).toBe(1);
    expect(stderr.join("")).toContain("pass one");
    expect(runCronRun).not.toHaveBeenCalled();
    expect(runWorkflowsRun).not.toHaveBeenCalled();
  });

  it("refuses a flag for the kind the alias excludes", async () => {
    expect(
      await runJobs(typed("workflows", "run", "--cron", "0 0 * * *")),
    ).toBe(1);
    expect(await runJobs(typed("cron", "run", "--workflow", "scrape"))).toBe(1);
  });

  it("hands --cron to the sync runner and --workflow to the Workflow one", async () => {
    await runJobs(["run", "--cron", "0 0 * * *", "--app", "platform"]);
    expect(runCronRun).toHaveBeenCalledWith([
      "--cron",
      "0 0 * * *",
      "--app",
      "platform",
    ]);
    await runJobs(["run", "--workflow", "scrape"]);
    expect(runWorkflowsRun).toHaveBeenCalledWith(["--workflow", "scrape"]);
  });

  it("asks for a flag rather than a picker when there is no terminal", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    expect(await runJobs(["run"])).toBe(1);
    expect(stderr.join("")).toContain(
      "pass --cron <expr> or --workflow <name>",
    );
    expect(select).not.toHaveBeenCalled();
  });

  /** The rows the picker drew, from the one `select` call. */
  function drawn(): { label: string; disabled?: boolean }[] {
    const [[{ options }]] = select.mock.calls as [
      [{ options: { label: string; disabled?: boolean }[] }],
    ];
    return options;
  }

  it("offers both kinds under their headings", async () => {
    select.mockResolvedValue("0");
    await runJobs(["run"]);
    expect(drawn().map((row) => row.label)).toEqual([
      "Quick syncs",
      "  platform · Sync events",
      "  platform · Nightly cleanup",
      "Long-running jobs",
      "  schedule-builder · rebuild",
      "  schedule-builder · scrape",
    ]);
  });

  it("offers only the alias's kind", async () => {
    select.mockResolvedValue("0");
    await runJobs(typed("cron", "run"));
    expect(drawn().map((row) => row.label)).toEqual([
      "Quick syncs",
      "  platform · Sync events",
      "  platform · Nightly cleanup",
    ]);

    select.mockClear();
    await runJobs(typed("workflows", "run"));
    expect(drawn()[0]!.label).toBe("Long-running jobs");
    expect(drawn()).toHaveLength(3);
  });

  it("runs the picked sync and records it in canonical form", async () => {
    beginInvocation(["jobs", "run"], false);
    select.mockImplementation(
      ({ options }: { options: { value: string; label: string }[] }) =>
        Promise.resolve(
          options.find((row) => row.label.endsWith("Nightly cleanup"))!.value,
        ),
    );

    expect(await runJobs(["run"])).toBe(0);

    expect(runCronRun).toHaveBeenCalledWith([
      "--app",
      "platform",
      "--cron",
      "0 0 * * *",
    ]);
    expect(reproducibleCommand()).toBe(
      "pnpm devtools jobs run --app platform --cron '0 0 * * *'",
    );
  });

  it("runs the picked Workflow by its binding", async () => {
    beginInvocation(["jobs", "run"], false);
    select.mockImplementation(
      ({ options }: { options: { value: string; label: string }[] }) =>
        Promise.resolve(
          options.find((row) => row.label.endsWith("scrape"))!.value,
        ),
    );

    await runJobs(["run"]);

    expect(runWorkflowsRun).toHaveBeenCalledWith([
      "--app",
      "schedule-builder",
      "--workflow",
      "SCRAPE_WORKFLOW",
    ]);
    expect(reproducibleCommand()).toBe(
      "pnpm devtools jobs run --app schedule-builder --workflow SCRAPE_WORKFLOW",
    );
  });
});

describe("jobs serve", () => {
  it("serves Workflows under any name", async () => {
    await runJobs(typed("cron", "serve", "--app", "schedule-builder"));
    expect(runWorkflowsServe).toHaveBeenCalledWith([
      "--app",
      "schedule-builder",
      "--kind",
      "sync",
    ]);
  });
});

describe("jobs list", () => {
  it("collects both kinds, a Workflow nothing schedules as on demand", async () => {
    const rows = await collectJobs({
      kinds: ["sync", "long-running"],
      tiers: ["development"],
    });
    expect(
      rows.map((row) => [
        row.kind,
        row.app,
        row.schedule,
        row.label,
        row.status,
      ]),
    ).toEqual([
      ["sync", "platform", "0 0 * * *", "Nightly cleanup", "ok"],
      ["sync", "platform", "*/15 * * * *", "Sync events", "never-fires"],
      ["long-running", "schedule-builder", null, "rebuild", "ok"],
      ["long-running", "schedule-builder", "0 */6 * * *", "scrape", "ok"],
    ]);
  });

  it("prints each kind under its heading and description", async () => {
    const text = renderJobs(
      await collectJobs({
        kinds: ["sync", "long-running"],
        tiers: ["development"],
      }),
      ["sync", "long-running"],
    );
    const syncs = text.indexOf("Quick syncs");
    const long = text.indexOf("Long-running jobs");
    expect(syncs).toBeGreaterThan(-1);
    expect(long).toBeGreaterThan(syncs);
    expect(text).toContain(
      "  Multi-step work that retries and resumes where it stopped.",
    );
    expect(text.indexOf("Nightly cleanup")).toBeLessThan(long);
    expect(text).toMatch(/on demand\s+rebuild/);
    expect(text).toContain("never fires");
  });

  it("emits one flat JSON array with a kind on each row", async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    expect(await runJobs(["list", "--tier", "development", "--json"])).toBe(0);
    const rows = JSON.parse(out.join("")) as { kind: string }[];
    expect(new Set(rows.map((row) => row.kind))).toEqual(
      new Set(["sync", "long-running"]),
    );
  });

  it("lists only the alias's kind", async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    await runJobs(typed("workflows", "list", "--tier", "development"));
    expect(out.join("")).toContain("Long-running jobs");
    expect(out.join("")).not.toContain("Quick syncs");
  });
});
