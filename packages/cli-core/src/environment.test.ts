/**
 * The three-valued logic the adaptive menu rests on.
 *
 * The interesting cases are all `"unknown"`. A probe that cannot read the
 * machine must leave the menu exactly as it was, and every assertion below
 * that mentions `"unknown"` guards that. The failure mode to avoid is a tool
 * that hides the command you were looking for because a subprocess timed out.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Condition } from "./catalog.js";
import {
  describeEnvironment,
  holds,
  isOffered,
  probeEnvironment,
  setEnvironmentRoot,
  UNKNOWN_ENVIRONMENT,
  type Environment,
  type Known,
} from "./environment.js";

const CONDITIONS: Condition[] = [
  "docker",
  "instance-running",
  "instance-stopped",
];

/** An environment with one fact set and the rest unreadable. */
function withStack(stack: Known): Environment {
  return { ...UNKNOWN_ENVIRONMENT, stack };
}

describe("holds", () => {
  it("reads the fact each condition names", () => {
    expect(holds("docker", { ...UNKNOWN_ENVIRONMENT, docker: "yes" })).toBe(
      "yes",
    );
    expect(holds("instance-running", withStack("yes"))).toBe("yes");
    expect(holds("instance-running", withStack("no"))).toBe("no");
  });

  it("negates a stack it can read", () => {
    expect(holds("instance-stopped", withStack("no"))).toBe("yes");
    expect(holds("instance-stopped", withStack("yes"))).toBe("no");
  });

  /**
   * The negation of an unreadable fact is still unreadable, not its opposite.
   * Collapsing this to `"yes"` would offer `stop` on a machine where nothing
   * is known to be running, the inverse of the point.
   */
  it("keeps unknown unknown through the negation", () => {
    for (const condition of CONDITIONS) {
      expect(holds(condition, UNKNOWN_ENVIRONMENT), condition).toBe("unknown");
    }
  });
});

describe("isOffered", () => {
  it("offers a command that asks for nothing", () => {
    expect(isOffered({}, withStack("no"))).toBe(true);
  });

  it("withholds one whose condition is definitively unmet", () => {
    expect(isOffered({ when: "instance-running" }, withStack("no"))).toBe(
      false,
    );
  });

  it("offers one whose condition holds", () => {
    expect(isOffered({ when: "instance-running" }, withStack("yes"))).toBe(
      true,
    );
  });

  it("offers everything on a machine it cannot read", () => {
    for (const condition of CONDITIONS) {
      expect(
        isOffered({ when: condition }, UNKNOWN_ENVIRONMENT),
        condition,
      ).toBe(true);
    }
  });
});

describe("describeEnvironment", () => {
  it("reports all three facts on their own lines", () => {
    expect(describeEnvironment(UNKNOWN_ENVIRONMENT).split("\n")).toHaveLength(
      3,
    );
  });

  it("says so plainly when a fact could not be read", () => {
    expect(describeEnvironment(UNKNOWN_ENVIRONMENT)).toContain(
      "could not tell",
    );
  });
});

describe("probeEnvironment", () => {
  /**
   * Total, whatever this machine is.
   *
   * Asserted on shape rather than values because the values are whatever
   * machine the suite runs on: CI has no Docker, a contributor's laptop may.
   * What must hold everywhere is that it answers rather than throwing. Every
   * caller treats it as a fact it can read, and a throw here would take down
   * the menu before it printed anything.
   */
  it("answers with a well-formed environment and never throws", () => {
    const env = probeEnvironment(() => null);
    const valid: Known[] = ["yes", "no", "unknown"];

    expect(valid).toContain(env.docker);
    expect(valid).toContain(env.stack);
    expect(valid).toContain(env.envFile);
  });

  it("rules out a stack when there is no daemon to hold it", () => {
    const env = probeEnvironment(() => null);

    expect(env).toMatchObject({ docker: "no", stack: "no" });
  });

  it("recognizes this project's running database container", () => {
    const env = probeEnvironment((_file, args) =>
      args[0] === "info"
        ? "Docker is running"
        : "supabase_db_DevDogs-Website\n",
    );

    expect(env).toMatchObject({ docker: "yes", stack: "yes" });
  });
});

describe("probeEnvironment in a product repository", () => {
  afterEach(() => setEnvironmentRoot(null));

  it("reads .env from the product root instead of requiring a DevDogsUGA clone", () => {
    const root = mkdtempSync(join(tmpdir(), "devtools-product-env-"));
    setEnvironmentRoot(root);
    expect(probeEnvironment(() => null).envFile).toBe("no");
    writeFileSync(join(root, ".env"), "A=1\n");
    expect(probeEnvironment(() => null).envFile).toBe("yes");
  });

  it("finds the stack by the product's own project id", () => {
    const root = mkdtempSync(join(tmpdir(), "devtools-product-stack-"));
    mkdirSync(join(root, "supabase"));
    writeFileSync(
      join(root, "supabase", "config.toml"),
      'project_id = "dogpack"\n',
    );
    setEnvironmentRoot(root);
    const up = (_file: string, args: string[]) =>
      args[0] === "info" ? "ok" : "supabase_db_dogpack\n";
    expect(probeEnvironment(up).stack).toBe("yes");
    const other = (_file: string, args: string[]) =>
      args[0] === "info" ? "ok" : "supabase_db_dogdays\n";
    expect(probeEnvironment(other).stack).toBe("no");
  });
});
