import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `runIntrospect`'s per-app dispatch (unknown app, missing `DB_URL`, the
 * exact `drizzle-kit pull` invocations in order) and the post-pull fixups it
 * applies to the generated schema file — the cross-schema import re-injection
 * and the suffix-alias appending both differ per app (`platform` has one,
 * `schedule-builder` does not), so both apps are exercised rather than just
 * one. `node:child_process` and `node:fs` are faked at the module boundary,
 * the same way `run.test.ts` fakes `spawn`, so none of this actually shells
 * out to `drizzle-kit` or touches a real file.
 */
const fake = vi.hoisted(() => {
  interface SpawnCall {
    file: string;
    args: string[];
    cwd: string | undefined;
  }

  const state = {
    spawnCalls: [] as SpawnCall[],
    exitCode: 0,
    files: new Map<string, string>(),
    removed: [] as string[],
  };

  function spawn(
    file: string,
    args: string[],
    opts: { cwd?: string } = {},
  ) {
    state.spawnCalls.push({ file, args, cwd: opts.cwd });
    const handlers = new Map<string, (arg?: unknown) => void>();
    queueMicrotask(() => {
      handlers.get("exit")?.(state.exitCode);
    });
    return {
      on: (event: string, cb: (arg?: unknown) => void) => {
        handlers.set(event, cb);
      },
    };
  }

  return { state, spawn };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: fake.spawn };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: string) => fake.state.files.has(path),
    readFileSync: (path: string) => {
      const contents = fake.state.files.get(path);
      if (contents === undefined) throw new Error(`ENOENT: ${path}`);
      return contents;
    },
    writeFileSync: (path: string, contents: string) => {
      fake.state.files.set(path, contents);
    },
    rmSync: (path: string) => {
      fake.state.files.delete(path);
      fake.state.removed.push(path);
    },
  };
});

vi.mock("../repo/root.js", () => ({
  findRepoRoot: () => "/repo",
}));

const resolveLocalToolingEnv = vi.hoisted(() => vi.fn());
vi.mock("./local-env.js", () => ({ resolveLocalToolingEnv }));

const { runIntrospect } = await import("./introspect.js");

beforeEach(() => {
  fake.state.spawnCalls.length = 0;
  fake.state.exitCode = 0;
  fake.state.files.clear();
  fake.state.removed.length = 0;
  resolveLocalToolingEnv.mockReset();
  resolveLocalToolingEnv.mockResolvedValue({ DB_URL: "postgres://local" });
});

describe("runIntrospect", () => {
  it("rejects with no --app", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(await runIntrospect(undefined)).toBe(1);
    expect(fake.state.spawnCalls).toEqual([]);
    stderr.mockRestore();
  });

  it("rejects an unknown app", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(await runIntrospect("sandbox")).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining('unknown app "sandbox"'),
    );
    expect(fake.state.spawnCalls).toEqual([]);
    stderr.mockRestore();
  });

  it("refuses to run with no DB_URL", async () => {
    resolveLocalToolingEnv.mockResolvedValue({});
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(await runIntrospect("platform")).toBe(1);
    expect(fake.state.spawnCalls).toEqual([]);
    stderr.mockRestore();
  });

  it("pulls both configs for platform, in order, from its app directory", async () => {
    expect(await runIntrospect("platform")).toBe(0);
    expect(fake.state.spawnCalls).toEqual([
      {
        file: "pnpm",
        args: [
          "exec",
          "drizzle-kit",
          "pull",
          "--config",
          "drizzle-introspection.config.ts",
        ],
        cwd: "/repo/apps/platform",
      },
      {
        file: "pnpm",
        args: ["exec", "drizzle-kit", "pull", "--config", "drizzle.config.ts"],
        cwd: "/repo/apps/platform",
      },
    ]);
  });

  it("pulls both configs for schedule-builder from its own app directory", async () => {
    expect(await runIntrospect("schedule-builder")).toBe(0);
    expect(fake.state.spawnCalls.map((c) => c.cwd)).toEqual([
      "/repo/apps/schedule-builder",
      "/repo/apps/schedule-builder",
    ]);
  });

  it("stops after the first failing drizzle-kit pull without running the second", async () => {
    fake.state.exitCode = 1;
    expect(await runIntrospect("platform")).toBe(1);
    expect(fake.state.spawnCalls).toHaveLength(1);
  });

  it("re-injects platform's cross-schema import and aliases InPlatform exports", async () => {
    const schemaPath = "/repo/apps/platform/src/server/db/schema/generated/schema.ts";
    fake.state.files.set(
      schemaPath,
      'import { pgSchema } from "drizzle-orm/pg-core"\n\nexport const platform = pgSchema("platform");\nexport const profileInPlatform = platform.table("profile", {});\n',
    );
    fake.state.files.set(
      "/repo/apps/platform/src/server/db/schema/generated/relations.ts",
      "export const relations = {};",
    );

    expect(await runIntrospect("platform")).toBe(0);

    expect(fake.state.removed).toEqual([
      "/repo/apps/platform/src/server/db/schema/generated/relations.ts",
    ]);
    const written = fake.state.files.get(schemaPath)!;
    expect(written).toContain(
      'import { usersInAuth as users, oauthClientsInAuth as oauthClients } from "~/supabase/drizzle/schema"',
    );
    expect(written).toContain("export { profileInPlatform as profile };");
  });

  it("aliases InScheduleBuilder exports without injecting any cross-schema import", async () => {
    const schemaPath =
      "/repo/apps/schedule-builder/src/server/db/schema/generated/schema.ts";
    fake.state.files.set(
      schemaPath,
      'import { pgSchema } from "drizzle-orm/pg-core"\n\nexport const scheduleBuilder = pgSchema("schedule_builder");\nexport const coursesInScheduleBuilder = scheduleBuilder.table("courses", {});\n',
    );

    expect(await runIntrospect("schedule-builder")).toBe(0);

    const written = fake.state.files.get(schemaPath)!;
    expect(written).not.toContain("Cross-schema FK targets");
    expect(written).toContain(
      "export { coursesInScheduleBuilder as courses };",
    );
  });
});
