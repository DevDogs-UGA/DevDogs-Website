/**
 * The dispatcher: what every top-level name routes to, and what the retired
 * ones say. The handlers are stubbed; what is under test is the routing and
 * the wording, which is all `cli.ts` owns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Ui from "@devdogsuga/cli-core/ui";

const calls = vi.hoisted(() => ({
  deploy: vi.fn(async (_rest: string[]) => undefined),
  planner: vi.fn(async (_rest: string[]) => undefined),
  env: vi.fn(async (_rest: string[]): Promise<string | null> => "Done."),
}));

vi.mock("./deploy/commands.js", () => ({
  runDeployCommand: calls.deploy,
}));
vi.mock("./planner/commands.js", () => ({
  runPlannerCommand: calls.planner,
}));
vi.mock("./env/commands.js", () => ({ handleEnv: calls.env }));

const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const explain = vi.hoisted(() => vi.fn());
vi.mock("@devdogsuga/cli-core/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof Ui>()),
  explain,
}));

import { HANDLERS, main } from "./cli.js";
import { catalog } from "./catalog.js";

afterEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe("the dispatch table", () => {
  it("has a handler for every top-level command, and no other", () => {
    expect(Object.keys(HANDLERS).sort()).toEqual(
      catalog.topLevel.map((node) => node.name).sort(),
    );
  });
});

describe("main", () => {
  it("runs deploy without a banner, straight to its own command", async () => {
    await main(["deploy", "preflight"]);
    expect(calls.deploy).toHaveBeenCalledWith(["preflight"]);
    // stdout belongs to the machine in the deploy group.
    expect(stdout).not.toHaveBeenCalled();
  });

  it("prints the version alone on stdout", async () => {
    await main(["version"]);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringMatching(/^\d+\.\d+\.\d+/),
    );
  });

  it("answers --help for the command asked about, not the top level", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await main(["env", "pull", "--help"]);
    expect(log.mock.calls[0]![0]).toContain("pnpm backstage env pull");
    log.mockRestore();
  });

  it("names where `bw` went", async () => {
    await main(["bw", "login"]);
    expect(explain).toHaveBeenCalledWith(
      expect.stringContaining("`bw` is gone"),
      "",
      [expect.stringContaining("backstage env")],
    );
    expect(process.exitCode).toBe(1);
  });
});
