import { describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: unknown,
      result: { stdout: string; stderr: string },
    ) => void;
    execFileMock(...args.slice(0, -1));
    cb(null, { stdout: "export type Database = {};\n", stderr: "" });
  },
}));

const writeFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => {
    writeFileMock(...args);
    return Promise.resolve();
  },
}));

const { generateDatabaseTypes } = await import("./index.js");

describe("generateDatabaseTypes", () => {
  it("runs supabase gen types via pnpm exec, in the given cwd, and writes the output", async () => {
    await generateDatabaseTypes({
      dbUrl: "postgresql://example",
      outFile: "/tmp/database.types.ts",
      cwd: "/repo",
      format: false,
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "supabase", "gen", "types", "--db-url", "postgresql://example"],
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/database.types.ts",
      "export type Database = {};\n",
    );
  });

  it("also formats the output file by default", async () => {
    execFileMock.mockClear();
    await generateDatabaseTypes({
      dbUrl: "postgresql://example",
      outFile: "/tmp/database.types.ts",
      cwd: "/repo",
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "prettier", "--write", "/tmp/database.types.ts"],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });
});
