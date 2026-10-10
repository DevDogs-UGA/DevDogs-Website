/**
 * `deploy`'s dispatch: the steps that are gone say where they went, and a deploy
 * needs a tier. The steps themselves have their own tests; what is checked
 * here is the routing and the wording.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDeployCommand, requireTier } from "./commands.js";
import { DeployError } from "./report.js";

let written: string;

beforeEach(() => {
  written = "";
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      written += String(chunk);
      return true;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  delete process.env.DEPLOY_ENV;
});

describe("steps that went away", () => {
  it.each([
    ["require-token", "every command checks for the token it needs"],
    ["require-planner", "`planner status`"],
    ["secrets-file", "folded into `deploy <app>`"],
    ["orphans", "`env audit [--prune]`"],
  ])("%s names its replacement and fails", async (step, replacement) => {
    await runDeployCommand([step]);
    expect(written).toContain(replacement);
    expect(process.exitCode).toBe(1);
  });
});

describe("with no step", () => {
  it("lists them and fails", async () => {
    await runDeployCommand([]);
    expect(written).toContain("which step or app?");
    expect(written).toContain("smoke");
    expect(written).toContain("reconcile");
    expect(process.exitCode).toBe(1);
  });
});

describe("a step that fails", () => {
  it("prints its refusal with the detail indented, and exits 1", async () => {
    delete process.env.PROJECT_REF;
    await runDeployCommand(["preflight"]);
    expect(written).toContain(
      "backstage deploy preflight: PROJECT_REF is not set",
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("requireTier", () => {
  it("takes --tier, then DEPLOY_ENV", () => {
    expect(requireTier(["--tier", "staging"])).toBe("staging");
    process.env.DEPLOY_ENV = "production";
    expect(requireTier([])).toBe("production");
  });

  it("refuses to guess, and refuses development", () => {
    expect(() => requireTier([])).toThrow(DeployError);
    expect(() => requireTier(["--tier", "development"])).toThrow(
      /Unknown tier/,
    );
  });
});
