import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/run.js", () => ({
  run: vi.fn(async () => 0),
}));

const { buildWorkerApp, workerBuildCommands } = await import("./build.js");
const { run } = await import("../db/run.js");

describe("workerBuildCommands", () => {
  it("builds a vinext app's workspace deps, then the app itself", () => {
    expect(workerBuildCommands("schedule-builder")).toEqual([
      [
        "-r",
        "--if-present",
        "--filter",
        "schedule-builder^...",
        "run",
        "build",
      ],
      ["--filter", "schedule-builder", "exec", "vinext", "build"],
    ]);
  });

  it("builds only the sandbox app's deps, since it has no framework build", () => {
    expect(workerBuildCommands("sandbox")).toEqual([
      ["-r", "--if-present", "--filter", "sandbox^...", "run", "build"],
    ]);
  });
});

describe("buildWorkerApp", () => {
  beforeEach(() => {
    vi.mocked(run).mockReset().mockResolvedValue(0);
  });

  it("passes the tier env to the framework build only", async () => {
    const env = { CLOUDFLARE_ENV: "staging" };
    await expect(buildWorkerApp("schedule-builder", env)).resolves.toBe(0);
    expect(vi.mocked(run).mock.calls).toEqual([
      [
        [
          "-r",
          "--if-present",
          "--filter",
          "schedule-builder^...",
          "run",
          "build",
        ],
      ],
      [["--filter", "schedule-builder", "exec", "vinext", "build"], env],
    ]);
  });

  it("stops before the framework build when a dependency fails", async () => {
    vi.mocked(run).mockResolvedValueOnce(2);
    await expect(buildWorkerApp("schedule-builder")).resolves.toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
