import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkBuckets,
  checkEventsSeeded,
  checkPresident,
  checkTypesFresh,
  declaredBuckets,
  lastChanged,
  newestMigration,
  typesFreshness,
  databaseChecks,
} from "./data.js";

describe("checkTypesFresh", () => {
  it("warns when the types predate the newest migration, naming it", () => {
    const check = checkTypesFresh(100, 200, "20261001_x.sql");
    expect(check.status).toBe("warn");
    expect(check.summary).toContain("20261001_x.sql");
    expect(check.fix).toContain("types:db");
  });

  it("is fine when they are as new, or newer", () => {
    expect(checkTypesFresh(200, 200, "m").status).toBe("ok");
    expect(checkTypesFresh(300, 200, "m").status).toBe("ok");
  });

  it("skips rather than guessing when a time is unknown", () => {
    expect(checkTypesFresh(null, 200, "m").status).toBe("skip");
    expect(checkTypesFresh(100, null, null).status).toBe("skip");
  });
});

describe("checkBuckets", () => {
  it("names every missing bucket", () => {
    const check = checkBuckets(["avatars", "posters"], ["avatars"]);
    expect(check.status).toBe("warn");
    expect(check.summary).toContain("posters");
    expect(check.summary).not.toContain("avatars");
    expect(check.fix).toContain("seed buckets");
  });

  it("passes when all exist", () => {
    expect(checkBuckets(["avatars"], ["avatars", "other"]).status).toBe("ok");
  });
});

describe("checkEventsSeeded", () => {
  it("warns on either table being empty, naming which", () => {
    expect(checkEventsSeeded(0, 3).summary).toBe(
      "No meetings in the database yet",
    );
    expect(checkEventsSeeded(2, 0).summary).toContain("workshops");
    expect(checkEventsSeeded(0, 0).summary).toContain("meetings or workshops");
    expect(checkEventsSeeded(0, 0).fix).toContain("cron run --app platform");
  });

  it("passes when both have rows", () => {
    expect(checkEventsSeeded(2, 3).status).toBe("ok");
  });
});

describe("checkPresident", () => {
  it("warns when nobody holds it", () => {
    const check = checkPresident(0);
    expect(check.status).toBe("warn");
    expect(check.fix).toContain("grant-root");
  });

  it("passes when somebody does", () => {
    expect(checkPresident(1).status).toBe("ok");
  });
});

describe("databaseChecks", () => {
  it("runs the three data checks over one set of facts", () => {
    const checks = databaseChecks(
      { buckets: ["avatars"], meetings: 0, workshops: 1, presidents: 0 },
      ["avatars"],
    );
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ["buckets-missing", "ok"],
      ["events-empty", "warn"],
      ["president-missing", "warn"],
    ]);
  });
});

describe("declaredBuckets", () => {
  it("reads [storage.buckets.<name>] tables once each", () => {
    expect(
      declaredBuckets(
        "[storage]\nenabled = true\n\n[storage.buckets.avatars]\npublic = true\n[storage.buckets.posters]\n[storage.buckets.avatars]\n",
      ),
    ).toEqual(["avatars", "posters"]);
  });
});

describe("types freshness against a real checkout", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function write(path: string, text = ""): void {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  }

  it("picks the newest migration by its timestamp", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-types-"));
    write("supabase/migrations/20260101000000_a.sql");
    write("supabase/migrations/20260301000000_c.sql");
    write("supabase/migrations/20260201000000_b.sql");
    expect(newestMigration(root)).toBe("20260301000000_c.sql");
  });

  it("flags a migration newer than the types, using mtime for uncommitted files", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-types-"));
    git("init", "-b", "main");
    write("packages/supabase/src/database.types.ts");
    write("supabase/migrations/20260101000000_a.sql");
    // Neither is committed, so both are judged by mtime.
    utimesSync(
      join(root, "packages/supabase/src/database.types.ts"),
      new Date(1_000_000),
      new Date(1_000_000),
    );
    utimesSync(
      join(root, "supabase/migrations/20260101000000_a.sql"),
      new Date(2_000_000),
      new Date(2_000_000),
    );
    expect(typesFreshness(root).status).toBe("warn");

    utimesSync(
      join(root, "packages/supabase/src/database.types.ts"),
      new Date(3_000_000),
      new Date(3_000_000),
    );
    expect(typesFreshness(root).status).toBe("ok");
  });

  it("uses the commit time for a clean committed file", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-types-"));
    git("init", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    write("a.txt", "x");
    git("add", ".");
    execFileSync("git", ["commit", "-m", "x"], {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
      },
    });
    // The file was just written, so its mtime is now; the commit is 2020.
    expect(lastChanged(root, "a.txt")).toBe(Date.parse("2020-01-01T00:00:00Z"));
  });
});
