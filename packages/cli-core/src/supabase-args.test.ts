import { describe, expect, it } from "vitest";
import {
  classifySupabase,
  isConfigPush,
  planSupabaseArgs,
  type SupabaseSession,
} from "./supabase-args.js";

const hosted: SupabaseSession = {
  label: "staging",
  local: false,
  dbUrl: "postgresql://u:p@db.example.com:5432/postgres",
  projectRef: "abcdefghijklmnopqrst",
};
const local: SupabaseSession = {
  label: "development:local",
  local: true,
  dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  projectRef: "remotedevprojectref00",
};

describe("classifySupabase", () => {
  it.each([
    [["db", "push"], "db-url"],
    [["db", "reset", "--no-seed"], "db-url"],
    [["migration", "list"], "db-url"],
    [["gen", "types", "--lang", "typescript"], "db-url"],
    [["inspect", "db", "bloat"], "db-url"],
    [["config", "push"], "project-ref"],
    [["config", "diff"], "project-ref"],
    [["link"], "project-ref"],
    [["secrets", "set", "A=b"], "project-ref"],
    [["seed", "buckets"], "project-ref-linked"],
    [["start"], "none"],
    [["stop"], "none"],
    [["status", "-o", "env"], "none"],
    [["migration", "new", "x"], "none"],
    [["functions", "serve"], "none"],
  ])("%j is %s", (args, kind) => {
    expect(classifySupabase(args)).toBe(kind);
  });

  it.each(["--local", "--linked", "--db-url", "--project-ref", "--project-id"])(
    "fills nothing when the user typed %s",
    (flag) => {
      expect(classifySupabase(["db", "push", flag, "x"])).toBe("none");
      expect(classifySupabase(["db", "push", `${flag}=x`])).toBe("none");
    },
  );

  it("leaves --help alone", () => {
    expect(classifySupabase(["db", "push", "--help"])).toBe("none");
  });
});

describe("planSupabaseArgs", () => {
  it("adds the tier's --db-url, after the user's own arguments", () => {
    const plan = planSupabaseArgs(["db", "push"], hosted);
    expect(plan).toEqual({
      ok: true,
      args: ["db", "push", "--db-url", hosted.dbUrl],
      filled: ["--db-url"],
    });
  });

  it("uses the local URL on the local tier too", () => {
    const plan = planSupabaseArgs(["db", "reset"], local);
    expect(plan.ok && plan.args).toEqual([
      "db",
      "reset",
      "--db-url",
      local.dbUrl,
    ]);
  });

  it("adds --project-ref for a project-scoped command", () => {
    const plan = planSupabaseArgs(["config", "push"], hosted);
    expect(plan.ok && plan.args).toEqual([
      "config",
      "push",
      "--project-ref",
      "abcdefghijklmnopqrst",
    ]);
  });

  it("never falls back to the linked project: a project command on the local tier stops", () => {
    const plan = planSupabaseArgs(["config", "push"], local);
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.summary).toContain("has none");
      expect(plan.detail).toContain("linked");
    }
  });

  it("stops on a hosted tier with no PROJECT_REF", () => {
    const plan = planSupabaseArgs(["link"], {
      ...hosted,
      projectRef: undefined,
    });
    expect(plan.ok).toBe(false);
  });

  it("stops when a database command has no DB_URL", () => {
    const plan = planSupabaseArgs(["db", "push"], {
      ...hosted,
      dbUrl: undefined,
    });
    expect(plan.ok).toBe(false);
  });

  it("seeds buckets with --local on the local tier and --project-ref --linked on a hosted one", () => {
    const onLocal = planSupabaseArgs(["seed", "buckets"], local);
    expect(onLocal.ok && onLocal.args).toEqual(["seed", "buckets", "--local"]);
    const onHosted = planSupabaseArgs(["seed", "buckets"], hosted);
    expect(onHosted.ok && onHosted.args).toEqual([
      "seed",
      "buckets",
      "--project-ref",
      "abcdefghijklmnopqrst",
      "--linked",
    ]);
  });

  it("never adds --yes", () => {
    for (const args of [
      ["db", "push"],
      ["config", "push"],
      ["seed", "buckets"],
      ["link"],
    ]) {
      const plan = planSupabaseArgs(args, hosted);
      expect(plan.ok && plan.args).not.toContain("--yes");
    }
  });

  it("passes a typed target through untouched", () => {
    const plan = planSupabaseArgs(["db", "push", "--linked"], local);
    expect(plan).toEqual({
      ok: true,
      args: ["db", "push", "--linked"],
      filled: [],
    });
  });
});

describe("isConfigPush", () => {
  it("matches config push only", () => {
    expect(isConfigPush(["config", "push"])).toBe(true);
    expect(isConfigPush(["config", "diff"])).toBe(false);
    expect(isConfigPush(["db", "push"])).toBe(false);
  });
});
