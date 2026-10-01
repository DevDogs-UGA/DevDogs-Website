/**
 * Unit tests for `enterSessionEnvironment` — the block `launch.ts` runs
 * eagerly for a typed command and `menu.ts`'s `runMenu` runs (via the hook
 * below) right before dispatching a menu-chosen one. `envLoad`/`envSession`
 * are hand-rolled fakes rather than the real `@devdogsuga/env` peer, the same
 * shape `launch.test.ts` mocks `./repo/peers.js` with, so every branch —
 * success, the two `LocalStackOfflineError` outcomes, both
 * `MissingEnvFileError` tiers — is reachable without a filesystem, a Docker
 * daemon, or a real terminal.
 *
 * `setMenuEnvHook`/`takeMenuEnvHook` are tested here too: the module-level
 * slot is this file's other export, and its own contract (set once, read and
 * cleared once) is small enough to cover directly rather than only through a
 * full menu walk.
 */
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

const confirm = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("@clack/prompts", () => ({
  confirm: (...args: unknown[]) => confirm(...args),
  isCancel: () => false,
  cancel: vi.fn(),
}));

const runStackCommand = vi.fn<(...args: unknown[]) => unknown>();

const { enterSessionEnvironment, setMenuEnvHook, takeMenuEnvHook } =
  await import("./env-entry.js");

class MissingEnvFileError extends Error {}
class LocalStackOfflineError extends Error {}

const ensureGeneratedEnv = vi.fn(async () => ({ outcome: "skipped" as const }));

function fakeDeps(enterEnvironment: (...args: unknown[]) => unknown) {
  return {
    envLoad: {
      MissingEnvFileError,
      LocalStackOfflineError,
    } as unknown as Parameters<typeof enterSessionEnvironment>[3]["envLoad"],
    envSession: {
      enterEnvironment,
    } as unknown as Parameters<typeof enterSessionEnvironment>[3]["envSession"],
    ensureGeneratedEnv: (...args: Parameters<typeof ensureGeneratedEnv>) =>
      ensureGeneratedEnv(...args),
    startStack: () =>
      runStackCommand("start", null) as Promise<{
        code: number;
        lines: string[];
      }>,
  };
}

describe("enterSessionEnvironment", () => {
  const originalIsTTY = process.stdin.isTTY;
  let exitSpy: MockInstance<typeof process.exit> | undefined;

  afterEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
    exitSpy?.mockRestore();
  });

  function stubExit(): MockInstance<typeof process.exit> {
    class ExitCalled extends Error {}
    const spy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new ExitCalled(`exit(${code})`);
    }) as never);
    exitSpy = spy;
    return spy;
  }

  it("enters the tier and dispatches once, on success", async () => {
    const enterEnvironment = vi.fn(async () => ({
      files: [".env"],
      warnings: [],
      environment: {},
    }));
    const dispatchCommand = vi.fn(async () => "Done.");

    const result = await enterSessionEnvironment(
      "development",
      undefined,
      ["db", "status"],
      fakeDeps(enterEnvironment),
      dispatchCommand,
    );

    expect(result).toBe("Done.");
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
      devDatabase: undefined,
    });
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
  });

  it("prints warnings from a successful entry", async () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const enterEnvironment = vi.fn(async () => ({
      files: [".env"],
      warnings: ["DB_URL differs from .env.example"],
      environment: {},
    }));

    await enterSessionEnvironment(
      "development",
      undefined,
      ["db", "status"],
      fakeDeps(enterEnvironment),
      vi.fn(async () => "Done."),
    );

    expect(
      writeSpy.mock.calls.some(([line]) =>
        String(line).includes("DB_URL differs from .env.example"),
      ),
    ).toBe(true);
    writeSpy.mockRestore();
  });

  describe("the .env.generated regeneration step", () => {
    it("calls ensureGeneratedEnv with the session's tier and devDatabase, before entering", async () => {
      const calls: string[] = [];
      ensureGeneratedEnv.mockImplementation(async () => {
        calls.push("ensureGeneratedEnv");
        return { outcome: "skipped" as const };
      });
      const enterEnvironment = vi.fn(async () => {
        calls.push("enterEnvironment");
        return { files: [".env"], warnings: [], environment: {} };
      });

      await enterSessionEnvironment(
        "development",
        "local",
        ["db", "status"],
        fakeDeps(enterEnvironment),
        vi.fn(async () => "Done."),
      );

      expect(ensureGeneratedEnv).toHaveBeenCalledWith("development", "local");
      expect(calls).toEqual(["ensureGeneratedEnv", "enterEnvironment"]);
    });

    it("prints the line and proceeds when a file was written", async () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      ensureGeneratedEnv.mockResolvedValue({
        outcome: "wrote" as const,
        line: "devtools: wrote .env.generated from the running local stack",
      });
      const enterEnvironment = vi.fn(async () => ({
        files: [".env.generated", ".env"],
        warnings: [],
        environment: {},
      }));
      const dispatchCommand = vi.fn(async () => "Done.");

      const result = await enterSessionEnvironment(
        "development",
        undefined,
        ["db", "status"],
        fakeDeps(enterEnvironment),
        dispatchCommand,
      );

      expect(result).toBe("Done.");
      expect(dispatchCommand).toHaveBeenCalledTimes(1);
      expect(
        writeSpy.mock.calls.some(([line]) =>
          String(line).includes("wrote .env.generated"),
        ),
      ).toBe(true);
      writeSpy.mockRestore();
    });

    it("prints the hint for a foreign stack and still falls through to normal entry", async () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      ensureGeneratedEnv.mockResolvedValue({
        outcome: "foreign" as const,
        projectId: "DevDogs-Website",
        line: 'devtools: The stack on port 54321 belongs to project "DevDogs-Website"…',
      });
      const enterEnvironment = vi.fn(async () => ({
        files: [".env"],
        warnings: [],
        environment: {},
      }));

      await enterSessionEnvironment(
        "development",
        undefined,
        ["db", "status"],
        fakeDeps(enterEnvironment),
        vi.fn(async () => "Done."),
      );

      expect(
        writeSpy.mock.calls.some(([line]) =>
          String(line).includes('project "DevDogs-Website"'),
        ),
      ).toBe(true);
      // Falls through to the unchanged entry — still called normally.
      expect(enterEnvironment).toHaveBeenCalledTimes(1);
      writeSpy.mockRestore();
    });

    it("prints nothing for a plain skip", async () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      ensureGeneratedEnv.mockResolvedValue({ outcome: "skipped" as const });
      const enterEnvironment = vi.fn(async () => ({
        files: [".env"],
        warnings: [],
        environment: {},
      }));

      await enterSessionEnvironment(
        "development",
        undefined,
        ["db", "status"],
        fakeDeps(enterEnvironment),
        vi.fn(async () => "Done."),
      );

      expect(
        writeSpy.mock.calls.some(([line]) =>
          /wrote \.env\.generated|belongs to project/.test(String(line)),
        ),
      ).toBe(false);
      writeSpy.mockRestore();
    });
  });

  describe("MissingEnvFileError", () => {
    it("tolerates a missing file for development and still dispatches", async () => {
      const enterEnvironment = vi.fn(async () => {
        throw new MissingEnvFileError("no .env — run `pnpm devtools setup`");
      });
      const dispatchCommand = vi.fn(async () => "Done.");

      const result = await enterSessionEnvironment(
        "development",
        undefined,
        ["setup"],
        fakeDeps(enterEnvironment),
        dispatchCommand,
      );

      expect(result).toBe("Done.");
      expect(dispatchCommand).toHaveBeenCalledTimes(1);
    });

    it("is fatal for an explicitly selected tier", async () => {
      stubExit();
      const enterEnvironment = vi.fn(async () => {
        throw new MissingEnvFileError(
          "run `pnpm devtools env pull --target staging`",
        );
      });
      const dispatchCommand = vi.fn(async () => "Done.");

      await expect(
        enterSessionEnvironment(
          "staging",
          undefined,
          ["db", "status"],
          fakeDeps(enterEnvironment),
          dispatchCommand,
        ),
      ).rejects.toThrow();

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(dispatchCommand).not.toHaveBeenCalled();
    });
  });

  describe("LocalStackOfflineError", () => {
    function offlineDeps(
      afterOffer: (...args: unknown[]) => unknown = vi.fn(async () => ({
        files: [],
        warnings: [],
        environment: {},
      })),
    ) {
      const enterEnvironment = vi
        .fn()
        .mockImplementationOnce(async () => {
          throw new LocalStackOfflineError("the local stack is not running");
        })
        .mockImplementation(afterOffer);
      return { enterEnvironment, deps: fakeDeps(enterEnvironment) };
    }

    it("skips the offer for a db lifecycle command and enters degraded", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      const { enterEnvironment, deps } = offlineDeps();
      const dispatchCommand = vi.fn(async () => "Done.");

      const result = await enterSessionEnvironment(
        "development",
        undefined,
        ["db", "start"],
        deps,
        dispatchCommand,
      );

      expect(confirm).not.toHaveBeenCalled();
      expect(result).toBe("Done.");
      expect(enterEnvironment).toHaveBeenCalledTimes(2);
      expect(dispatchCommand).toHaveBeenCalledTimes(1);
    });

    it("does not offer on a non-TTY, and refuses a non-db command", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true,
      });
      stubExit();
      const { deps } = offlineDeps();
      const dispatchCommand = vi.fn(async () => "Done.");

      await expect(
        enterSessionEnvironment(
          "development",
          undefined,
          ["cf", "preview"],
          deps,
          dispatchCommand,
        ),
      ).rejects.toThrow();

      expect(confirm).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(dispatchCommand).not.toHaveBeenCalled();
    });

    it("degrades and dispatches a db command when declined on a TTY", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      confirm.mockResolvedValue(false);
      const { deps } = offlineDeps();
      const dispatchCommand = vi.fn(async () => "Done.");

      const result = await enterSessionEnvironment(
        "development",
        undefined,
        ["db", "seed", "buckets"],
        deps,
        dispatchCommand,
      );

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(result).toBe("Done.");
      expect(dispatchCommand).toHaveBeenCalledTimes(1);
    });

    it("offers to start the stack, and dispatches once immediately on success — no second entry", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      confirm.mockResolvedValue(true);
      runStackCommand.mockResolvedValue({ code: 0, lines: ["stack up"] });
      const { enterEnvironment, deps } = offlineDeps();
      const dispatchCommand = vi.fn(async () => "Done.");

      const result = await enterSessionEnvironment(
        "development",
        "local",
        ["db", "seed", "buckets"],
        deps,
        dispatchCommand,
      );

      expect(runStackCommand).toHaveBeenCalledWith("start", null);
      expect(result).toBe("Done.");
      expect(dispatchCommand).toHaveBeenCalledTimes(1);
      // Only the FIRST call (the one that threw) — success skips a second
      // `enterEnvironment`, relying on `runStackCommand("start")`'s own env
      // refresh instead. See this module's header.
      expect(enterEnvironment).toHaveBeenCalledTimes(1);
    });

    it("exits when the offered stack start fails", async () => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: true,
        configurable: true,
      });
      stubExit();
      confirm.mockResolvedValue(true);
      runStackCommand.mockResolvedValue({ code: 1, lines: ["boom"] });
      const { deps } = offlineDeps();
      const dispatchCommand = vi.fn(async () => "Done.");

      await expect(
        enterSessionEnvironment(
          "development",
          undefined,
          ["db", "seed", "buckets"],
          deps,
          dispatchCommand,
        ),
      ).rejects.toThrow();

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(dispatchCommand).not.toHaveBeenCalled();
    });
  });
});

describe("the menu env hook slot", () => {
  afterEach(() => {
    // Never leave a hook registered for the next test/file — mirrors what
    // `takeMenuEnvHook()` itself guarantees on the real path.
    takeMenuEnvHook();
  });

  it("is undefined until launch.ts sets one", () => {
    expect(takeMenuEnvHook()).toBeUndefined();
  });

  it("returns what was set, exactly once", async () => {
    const hook = vi.fn(async () => "Done.");
    setMenuEnvHook(hook);

    expect(takeMenuEnvHook()).toBe(hook);
    // Cleared by the read above — a second read (what a nested launcher's
    // own `runMenu` would do) must not inherit it.
    expect(takeMenuEnvHook()).toBeUndefined();
  });
});
