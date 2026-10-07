import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkMigrationOrder,
  MigrationBaseError,
  findOutOfOrderMigrations,
  latestMigrationTimestamp,
  migrationTimestamp,
} from "./migrations.js";

describe("migrationTimestamp", () => {
  it("reads the leading digits", () => {
    expect(migrationTimestamp("20260901120000_platform_add.sql")).toBe(
      "20260901120000",
    );
  });

  it("is null for a name with no timestamp", () => {
    expect(migrationTimestamp("README.md")).toBeNull();
  });
});

describe("latestMigrationTimestamp", () => {
  it("picks the newest, skipping unparseable names", () => {
    expect(
      latestMigrationTimestamp([
        "20260101000000_a.sql",
        "README.md",
        "20260301000000_b.sql",
      ]),
    ).toBe("20260301000000");
  });

  it("is null for none", () => {
    expect(latestMigrationTimestamp([])).toBeNull();
  });
});

describe("findOutOfOrderMigrations", () => {
  it("flags only files older than the base's newest", () => {
    expect(
      findOutOfOrderMigrations(
        ["20260101000000_old.sql", "20260401000000_new.sql"],
        "20260301000000",
      ),
    ).toEqual([
      { filename: "20260101000000_old.sql", timestamp: "20260101000000" },
    ]);
  });

  it("flags nothing when the base has no migrations", () => {
    expect(findOutOfOrderMigrations(["20200101000000_a.sql"], null)).toEqual(
      [],
    );
  });
});

describe("checkMigrationOrder against a real git history", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  }

  it("flags a branch's new migration that predates the base's newest", () => {
    root = mkdtempSync(join(tmpdir(), "check-migrations-"));
    mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
    git("init", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    writeFileSync(
      join(root, "supabase/migrations/20260301000000_platform_base.sql"),
      "",
    );
    git("add", ".");
    git("commit", "-m", "base");
    git("checkout", "-b", "feature");
    writeFileSync(
      join(root, "supabase/migrations/20260101000000_platform_late.sql"),
      "",
    );
    git("add", ".");
    git("commit", "-m", "late");

    const report = checkMigrationOrder(root, "main");
    expect(report.baseLatest).toBe("20260301000000");
    expect(report.violations.map((v) => v.filename)).toEqual([
      "20260101000000_platform_late.sql",
    ]);
  });

  it("says so when the base is not a ref of the checkout", () => {
    root = mkdtempSync(join(tmpdir(), "check-migrations-"));
    git("init", "-b", "main");
    expect(() => checkMigrationOrder(root, "origin/main")).toThrow(
      MigrationBaseError,
    );
  });
});
