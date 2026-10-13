import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exec, execSync, spawnProcess } from "./spawn.js";

const windows = process.platform === "win32";

/** The same, as `node -e` code, where argv starts one slot earlier. */
const ECHO_E = `process.stdout.write(JSON.stringify(process.argv.slice(1)))`;

/** A program that prints its argv as JSON, so quoting is observable. */
const ECHO = `process.stdout.write(JSON.stringify(process.argv.slice(2)))`;

describe("execSync", () => {
  it("returns stdout of a real program", () => {
    expect(execSync(process.execPath, ["-e", "console.log('hi')"]).trim()).toBe(
      "hi",
    );
  });

  it("passes arguments through untouched, spaces and shell characters included", () => {
    const args = ["a b", "c&d", "e|f", "$HOME", "g'h"];
    const out = execSync(process.execPath, ["-e", ECHO_E, ...args]);
    expect(JSON.parse(out)).toEqual(args);
  });

  it("throws with code ENOENT when the program does not exist", () => {
    expect(() => execSync("devtools-no-such-program-xyz", [])).toThrowError(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("throws with the exit status and stderr on a non-zero exit", () => {
    expect(() =>
      execSync(
        process.execPath,
        ["-e", "console.error('boom'); process.exit(3)"],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    ).toThrowError(expect.objectContaining({ status: 3, stderr: "boom\n" }));
  });
});

describe("exec", () => {
  it("resolves stdout and stderr", async () => {
    const out = await exec(process.execPath, [
      "-e",
      "console.log('o'); console.error('e')",
    ]);
    expect(out).toEqual({ stdout: "o\n", stderr: "e\n" });
  });

  it("rejects with ENOENT for a missing program", async () => {
    await expect(
      exec("devtools-no-such-program-xyz", []),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects with stderr on a non-zero exit", async () => {
    await expect(
      exec(process.execPath, ["-e", "console.error('bad'); process.exit(2)"]),
    ).rejects.toMatchObject({ status: 2, stderr: "bad\n" });
  });
});

describe("spawnProcess", () => {
  it("returns a child that can be waited on", async () => {
    const code = await new Promise<number | null>((resolve) => {
      spawnProcess(process.execPath, ["-e", "process.exit(4)"], {
        stdio: "ignore",
      }).on("close", resolve);
    });
    expect(code).toBe(4);
  });

  it("reports a missing program as an error event, not a throw", async () => {
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
      spawnProcess("devtools-no-such-program-xyz", [], {
        stdio: "ignore",
      }).on("error", resolve);
    });
    expect(error.code).toBe("ENOENT");
  });
});

/**
 * The reason this module exists. On Windows `npx`, `pnpm` and `supabase` are
 * `.cmd` shims that Node cannot start by name. These run only there (the
 * `windows-latest` job in ci.yaml); the quoting is cross-spawn's, and this
 * proves it end to end with a real shim on a real PATH.
 */
describe.skipIf(!windows)("a .cmd shim on PATH (Windows)", () => {
  const original = process.env.PATH;
  afterEach(() => {
    process.env.PATH = original;
  });

  function shimOnPath(): void {
    const dir = mkdtempSync(join(tmpdir(), "devtools-shim-"));
    const bin = join(dir, "bin with space");
    mkdirSync(bin);
    writeFileSync(join(bin, "echo-args.js"), ECHO);
    writeFileSync(
      join(bin, "shimmed.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0echo-args.js" %*\r\n`,
    );
    process.env.PATH = `${bin}${delimiter}${original ?? ""}`;
  }

  it("execSync starts the shim by its bare name", () => {
    shimOnPath();
    expect(JSON.parse(execSync("shimmed", ["one", "two"]))).toEqual([
      "one",
      "two",
    ]);
  });

  it("keeps spaces and cmd metacharacters inside one argument", () => {
    shimOnPath();
    const args = ["a b", "c&d", "e|f", "g^h", "%PATH%"];
    expect(JSON.parse(execSync("shimmed", args))).toEqual(args);
  });

  it("spawnProcess and exec start it too", async () => {
    shimOnPath();
    const { stdout } = await exec("shimmed", ["x y"]);
    expect(JSON.parse(stdout)).toEqual(["x y"]);
    const code = await new Promise<number | null>((resolve) => {
      spawnProcess("shimmed", [], { stdio: "ignore" }).on("close", resolve);
    });
    expect(code).toBe(0);
  });
});
