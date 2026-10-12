import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cliOverrides,
  loadCliCommands,
  parseCatalog,
  workspaceDevtoolsIdentity,
} from "./cli-catalog.js";

let root: string;

/** A stand-in CLI: a script that prints `stdout` whatever it is given. */
function fakeCli(stdout: string, exitCode = 0): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-cli-"));
  const script = path.join(root, "cli.mjs");
  fs.writeFileSync(
    script,
    `process.stdout.write(${JSON.stringify(stdout)}); process.exit(${exitCode});\n`,
  );
  return `node ${script}`;
}

afterEach(() => {
  if (root !== undefined) fs.rmSync(root, { recursive: true, force: true });
});

describe("parseCatalog", () => {
  it("collects every path, groups included", () => {
    const json = JSON.stringify({
      version: "1.0.0",
      commands: [{ path: "deploy" }, { path: "deploy smoke" }],
    });
    expect([...parseCatalog("backstage", json)].sort()).toEqual([
      "deploy",
      "deploy smoke",
    ]);
  });

  it("skips a line the package manager printed ahead of the JSON", () => {
    const json = JSON.stringify({ commands: [{ path: "setup" }] });
    expect([...parseCatalog("devtools", `Packages: +1\n${json}`)]).toEqual([
      "setup",
    ]);
  });

  it("rejects output that is not a catalog", () => {
    expect(() => parseCatalog("devtools", "usage: devtools")).toThrow(
      /no JSON/,
    );
    expect(() => parseCatalog("devtools", "{ nope")).toThrow(/did not parse/);
    expect(() => parseCatalog("devtools", '{"commands": []}')).toThrow(
      /no commands/,
    );
    expect(() => parseCatalog("devtools", '{"commands": [{}]}')).toThrow(
      /no path/,
    );
  });
});

describe("loadCliCommands", () => {
  it("runs the override command with --help --json", async () => {
    const cmd = fakeCli(
      JSON.stringify({ commands: [{ path: "db" }, { path: "db start" }] }),
    );
    const commands = await loadCliCommands(os.tmpdir(), "devtools", {
      ...process.env,
      DOCS_KIT_DEVTOOLS_CMD: cmd,
    });
    expect([...commands].sort()).toEqual(["db", "db start"]);
  });

  it("uses the backstage override for backstage", async () => {
    const cmd = fakeCli(JSON.stringify({ commands: [{ path: "env audit" }] }));
    const commands = await loadCliCommands(os.tmpdir(), "backstage", {
      ...process.env,
      DOCS_KIT_BACKSTAGE_CMD: cmd,
    });
    expect([...commands]).toEqual(["env audit"]);
  });

  it("fails, naming the override, when the command cannot run", async () => {
    const cmd = fakeCli("", 1);
    await expect(
      loadCliCommands(os.tmpdir(), "devtools", {
        ...process.env,
        DOCS_KIT_DEVTOOLS_CMD: cmd,
      }),
    ).rejects.toThrow(/DOCS_KIT_DEVTOOLS_CMD/);
  });

  it("fails when the command prints something else", async () => {
    const cmd = fakeCli("hello");
    await expect(
      loadCliCommands(os.tmpdir(), "devtools", {
        ...process.env,
        DOCS_KIT_DEVTOOLS_CMD: cmd,
      }),
    ).rejects.toThrow(/no JSON/);
  });
});

describe("the workspace devtools build", () => {
  /** A repo root holding a built `packages/devtools` that prints `stdout`. */
  function workspaceWith(stdout: string): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-ws-"));
    const dir = path.join(root, "packages", "devtools");
    fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
    fs.mkdirSync(path.join(dir, "dist"));
    fs.writeFileSync(path.join(dir, "dist", "launch.js"), "");
    fs.writeFileSync(
      path.join(dir, "bin", "devtools.mjs"),
      `process.stdout.write(${JSON.stringify(stdout)});\n`,
    );
    return root;
  }

  it("is what runs when no override is set, so CI needs no publish", async () => {
    const repo = workspaceWith(
      JSON.stringify({ commands: [{ path: "oauth" }] }),
    );
    const commands = await loadCliCommands(repo, "devtools", {});
    expect([...commands]).toEqual(["oauth"]);
  });

  it("loses to the override", async () => {
    const repo = workspaceWith(
      JSON.stringify({ commands: [{ path: "oauth" }] }),
    );
    const cmd = fakeCli(JSON.stringify({ commands: [{ path: "other" }] }));
    const commands = await loadCliCommands(repo, "devtools", {
      ...process.env,
      DOCS_KIT_DEVTOOLS_CMD: cmd,
    });
    expect([...commands]).toEqual(["other"]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("is part of the build cache identity only while it exists", () => {
    const repo = workspaceWith("{}");
    expect(workspaceDevtoolsIdentity(repo)).toMatch(/^workspace@/);
    expect(workspaceDevtoolsIdentity(os.tmpdir())).toBe("");
  });
});

describe("cliOverrides", () => {
  it("reads both variables, empty when unset", () => {
    expect(cliOverrides({})).toEqual({ devtools: "", backstage: "" });
    expect(
      cliOverrides({ DOCS_KIT_DEVTOOLS_CMD: "a", DOCS_KIT_BACKSTAGE_CMD: "b" }),
    ).toEqual({ devtools: "a", backstage: "b" });
  });
});
