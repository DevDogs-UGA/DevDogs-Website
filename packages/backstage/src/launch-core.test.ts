/**
 * What the launcher decides before any command runs: the session's tier, when
 * no environment is entered at all, when a checkout is required, and what the
 * hosted-tier gate does. `launchWith` is driven with a stub dispatcher, so
 * nothing past the launcher runs.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type * as RepoRoot from "@devdogsuga/cli-core/repo/root";

const enterEnvironment = vi.fn(async (..._args: unknown[]) => ({
  files: [".env.staging"],
  warnings: [] as string[],
  environment: {},
}));
class MissingEnvFileError extends Error {}

// The env libraries come from the target repo at run time (`repo/peers.ts`);
// here they are stubs, so the launcher's own decisions are what is measured.
vi.mock("@devdogsuga/cli-core/repo/peers", () => ({
  loadEnvSession: async () => ({
    enterEnvironment: (...args: unknown[]) => enterEnvironment(...args),
  }),
  loadEnvLoad: async () => ({
    MissingEnvFileError,
    SHELL_KEYS_ENV: "DEVTOOLS_SHELL_KEYS",
  }),
}));

let inRepo = true;
vi.mock("@devdogsuga/cli-core/repo/root", async (importOriginal) => {
  const actual = await importOriginal<typeof RepoRoot>();
  return {
    ...actual,
    discoverRepoRoot: () => (inRepo ? "/fake/repo" : null),
    findRepoRoot: () => "/fake/repo",
  };
});

const gate = vi.fn<(...args: unknown[]) => Promise<{ proceed: boolean }>>();
vi.mock("@devdogsuga/cli-core/safety-gate", () => ({
  gateHostedTier: (...args: unknown[]) => gate(...args),
  GATE_PASSED_ENV: "DEVTOOLS_GATE_PASSED",
}));

vi.mock("@devdogsuga/cli-core/failure-log", () => ({
  installFailureLog: vi.fn(),
}));

import { resolveSession, launchWith } from "./launch-core.js";

describe("resolveSession", () => {
  it("is plain development, unnamed, when nothing names a tier", () => {
    expect(resolveSession(undefined, undefined)).toEqual({
      ok: true,
      session: { tier: "development", named: false },
    });
    expect(resolveSession(undefined, "")).toEqual({
      ok: true,
      session: { tier: "development", named: false },
    });
  });

  it("takes --tier over DEPLOY_ENV", () => {
    expect(resolveSession("production", "staging")).toEqual({
      ok: true,
      session: { tier: "production", named: true },
    });
  });

  it("falls back to DEPLOY_ENV", () => {
    expect(resolveSession(undefined, "staging")).toEqual({
      ok: true,
      session: { tier: "staging", named: true },
    });
  });

  it("carries a development qualifier", () => {
    expect(resolveSession("development:remote", undefined)).toEqual({
      ok: true,
      session: { tier: "development", devDatabase: "remote", named: true },
    });
  });

  it("refuses a tier it does not know, rather than running as development", () => {
    const result = resolveSession("prod", undefined);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('unknown tier "prod"');
  });
});

describe("launchWith", () => {
  const dispatch = vi.fn(async (_argv: string[]) => undefined);
  let exit: MockInstance;
  let stderr: MockInstance;
  let written: string;
  const saved = { ...process.env };

  beforeEach(() => {
    inRepo = true;
    written = "";
    gate.mockResolvedValue({ proceed: true });
    exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`);
    });
    stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        written += String(chunk);
        return true;
      });
    delete process.env.DEPLOY_ENV;
    delete process.env.DEV_DB;
  });

  afterEach(() => {
    vi.clearAllMocks();
    exit.mockRestore();
    stderr.mockRestore();
    process.env = { ...saved };
    process.exitCode = undefined;
  });

  it("routes --help to the dispatcher with no tier and no checkout", async () => {
    inRepo = false;
    await launchWith(["--tier", "staging", "deploy", "--help"], { dispatch });
    expect(dispatch).toHaveBeenCalledWith(["deploy", "--help"]);
    expect(enterEnvironment).not.toHaveBeenCalled();
  });

  it.each(["version", "completions"])(
    "routes %s to the dispatcher with no checkout",
    async (name) => {
      inRepo = false;
      await launchWith([name], { dispatch });
      expect(dispatch).toHaveBeenCalledWith([name]);
    },
  );

  it("hands a name it does not know to the dispatcher, so it can say what replaced it", async () => {
    inRepo = false;
    await launchWith(["bw", "login"], { dispatch });
    expect(dispatch).toHaveBeenCalledWith(["bw", "login"]);
    expect(written).toBe("");
  });

  it("--no-env names the tier and loads nothing, with no checkout", async () => {
    inRepo = false;
    await launchWith(["--no-env", "--tier", "staging", "deploy", "preflight"], {
      dispatch,
      gate: false,
    });
    expect(enterEnvironment).not.toHaveBeenCalled();
    expect(process.env.DEPLOY_ENV).toBe("staging");
    expect(dispatch).toHaveBeenCalledWith(["deploy", "preflight"]);
  });

  it.each([
    ["graphics", "app/dogdays", "--out", "x"],
    ["qr", "hello"],
    ["github", "rulesets"],
    ["newsletter", "render", "3.0.0"],
    ["newsletter", "send", "3.0.0", "--to", "a@uga.edu"],
  ])(
    "%s needs no checkout, no env file and no tier, with nothing typed",
    async (...argv) => {
      inRepo = false;
      await launchWith(argv, { dispatch });
      expect(enterEnvironment).not.toHaveBeenCalled();
      // The gate sees plain development, which it lets through unasked.
      expect(gate).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "development" }),
      );
      expect(process.env.DEPLOY_ENV).toBe("development");
      expect(dispatch).toHaveBeenCalledWith(argv);
      expect(written).toBe("");
    },
  );

  it("still insists on a checkout for a command that reads one", async () => {
    inRepo = false;
    await expect(launchWith(["env", "audit"], { dispatch })).rejects.toThrow(
      "exit 1",
    );
  });

  it("--no-env needs no tier named, even for deploy", async () => {
    await launchWith(["--no-env", "deploy", "preflight"], {
      dispatch,
      gate: false,
    });
    expect(dispatch).toHaveBeenCalledWith(["deploy", "preflight"]);
  });

  it("says so, and exits 1, when a command needs a checkout and there is none", async () => {
    inRepo = false;
    await expect(
      launchWith(["env", "pull", "--target", "staging"], { dispatch }),
    ).rejects.toThrow("exit 1");
    expect(written).toContain("run this from inside a DevDogsUGA clone");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("never asks which tier: no name means development, entered quietly", async () => {
    await launchWith(["env", "audit", "--target", "staging"], { dispatch });
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
      devDatabase: undefined,
    });
  });

  it("loads the named tier's files and reports which", async () => {
    await launchWith(["--tier", "staging", "deploy", "platform", "--yes"], {
      dispatch,
    });
    expect(enterEnvironment).toHaveBeenCalledWith("staging", {
      override: false,
      devDatabase: undefined,
    });
    expect(written).toContain("loaded .env.staging (staging)");
    expect(dispatch).toHaveBeenCalledWith(["deploy", "platform", "--yes"]);
  });

  it("refuses a deploy with no tier named, before touching any env file", async () => {
    await expect(
      launchWith(["deploy", "platform"], { dispatch }),
    ).rejects.toThrow("exit 1");
    expect(written).toContain("no tier named");
    expect(enterEnvironment).not.toHaveBeenCalled();
  });

  it("lets an alias skip that refusal", async () => {
    await launchWith(["deploy", "platform"], { dispatch, lenientTier: true });
    expect(dispatch).toHaveBeenCalled();
  });

  it("is fatal when a named hosted tier has no env file", async () => {
    enterEnvironment.mockRejectedValueOnce(
      new MissingEnvFileError("no .env.production"),
    );
    await expect(
      launchWith(["--tier", "production", "deploy", "platform", "--yes"], {
        dispatch,
      }),
    ).rejects.toThrow("exit 1");
    expect(written).toContain("no .env.production");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("tolerates a missing development .env on a fresh clone", async () => {
    enterEnvironment.mockRejectedValueOnce(new MissingEnvFileError("no .env"));
    await launchWith(["env", "audit", "--target", "staging"], { dispatch });
    expect(dispatch).toHaveBeenCalled();
  });

  describe("the hosted-tier gate", () => {
    it("asks before a command that is not read-only runs against a hosted tier", async () => {
      await launchWith(["--tier", "production", "deploy", "migrate"], {
        dispatch,
      });
      expect(gate).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "production", yes: false }),
      );
    });

    it("does not run the command when the gate refuses", async () => {
      gate.mockResolvedValue({ proceed: false });
      await launchWith(["--tier", "production", "deploy", "migrate"], {
        dispatch,
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("passes --yes to the gate", async () => {
      await launchWith(["--tier", "staging", "deploy", "migrate", "--yes"], {
        dispatch,
      });
      expect(gate).toHaveBeenCalledWith(
        expect.objectContaining({ tier: "staging", yes: true }),
      );
    });

    it("leaves a read-only command alone", async () => {
      await launchWith(["--tier", "production", "deploy", "preflight"], {
        dispatch,
      });
      expect(gate).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalled();
    });

    it("has nothing to confirm in a dry run", async () => {
      await launchWith(
        ["--tier", "production", "--dry-run", "deploy", "migrate"],
        { dispatch },
      );
      expect(gate).not.toHaveBeenCalled();
    });

    it("is skipped for the aliases, which never had one", async () => {
      await launchWith(["--tier", "production", "deploy", "migrate"], {
        dispatch,
        gate: false,
      });
      expect(gate).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalled();
    });
  });
});
