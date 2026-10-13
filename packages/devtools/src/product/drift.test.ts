import { describe, expect, it } from "vitest";
import { classifyDiff, splitStatements } from "./drift.js";
import * as real from "./drift.fixtures.js";

const NONE = new Set<string>();
const WITH_FUNCTION = new Set(["function:dogdays.claim_legacy_data"]);

/** No statement that drops, alters a type, or rewrites data may ever be in `restore`. */
function assertOnlyAdditive(restore: string[]): void {
  for (const statement of restore) {
    expect(statement).not.toMatch(/^\s*DROP\b/i);
    expect(statement).not.toMatch(
      /\bDROP\s+(COLUMN|CONSTRAINT|DEFAULT|NOT NULL)\b/i,
    );
    expect(statement).not.toMatch(/\bALTER\s+COLUMN\b/i);
  }
}

describe("splitStatements", () => {
  it("keeps dollar-quoted function bodies and quoted semicolons whole", () => {
    const sql = `-- a comment; with a semicolon
create function f() returns int language plpgsql as $f$ begin return 1; end $f$;
comment on table t is 'a; b';
select 1`;
    expect(splitStatements(sql)).toEqual([
      "create function f() returns int language plpgsql as $f$ begin return 1; end $f$",
      "comment on table t is 'a; b'",
      "select 1",
    ]);
  });

  it("reads a real diff with a function body as one statement per change", () => {
    expect(
      splitStatements(real.functionBody).filter((s) =>
        s.startsWith("CREATE OR REPLACE FUNCTION"),
      ),
    ).toHaveLength(1);
  });
});

describe("classifyDiff, MISSING", () => {
  it("recreates a dropped table with its constraints, policy and grants, and nothing else", () => {
    const drift = classifyDiff(real.dropTable, NONE);
    expect(drift.conflicts).toEqual([]);
    expect(drift.extras).toEqual([]);
    expect(drift.restored).toContain('table "dogdays"."userPlanDraftCourses"');
    expect(drift.restore.join("\n")).toContain("CREATE TABLE");
    expect(drift.restore.join("\n")).toContain("CREATE POLICY");
    assertOnlyAdditive(drift.restore);
  });

  it("recreates a dropped schema, its tables and its function", () => {
    const drift = classifyDiff(real.dropSchema, NONE);
    expect(drift.conflicts).toEqual([]);
    expect(drift.extras).toEqual([]);
    expect(drift.restored).toEqual(
      expect.arrayContaining([
        'schema "dogdays"',
        'table "dogdays"."legacyImports"',
        'function "dogdays"."claim_legacy_data"',
      ]),
    );
    expect(drift.restore[0]).toMatch(/^SET local check_function_bodies/);
    assertOnlyAdditive(drift.restore);
  });

  it("treats CREATE OR REPLACE of a function the database lacks as missing", () => {
    const drift = classifyDiff(real.dropSchema, NONE);
    expect(
      drift.restore.some((s) => s.startsWith("CREATE OR REPLACE FUNCTION")),
    ).toBe(true);
  });

  it("restores a dropped column, with its grants", () => {
    const drift = classifyDiff(real.columnDropped, NONE);
    expect(drift.restored).toContain(
      'column "dogdays"."userPlanDrafts"."inputCampus"',
    );
    expect(drift.conflicts).toEqual([]);
    assertOnlyAdditive(drift.restore);
  });

  it("re-grants a privilege the database lost and never revokes", () => {
    const drift = classifyDiff(real.grantRevoked, NONE);
    expect(
      drift.restore.some((s) => s.startsWith("GRANT DELETE, SELECT")),
    ).toBe(true);
    assertOnlyAdditive(drift.restore);
    expect(drift.restore.some((s) => s.startsWith("REVOKE"))).toBe(false);
    expect(drift.extras.map((e) => e.object)).toContain(
      'privileges on "dogdays"."userPreferences"',
    );
  });

  it("applies a REVOKE that belongs to something it creates (a new function is executable by PUBLIC until revoked)", () => {
    const sql = `CREATE OR REPLACE FUNCTION dogdays.f() RETURNS int LANGUAGE sql AS $$ select 1 $$;

REVOKE ALL ON FUNCTION "dogdays"."f"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "dogdays"."f"() TO "authenticated";`;
    const drift = classifyDiff(sql, NONE);
    expect(drift.restore.map((s) => s.split(" ")[0])).toEqual([
      "CREATE",
      "REVOKE",
      "GRANT",
    ]);
    expect(drift.extras).toEqual([]);
  });
});

describe("classifyDiff, EXTRA", () => {
  it("lists a member's table, column, index, sequence, view, function and policy and restores nothing", () => {
    const drift = classifyDiff(real.extras, NONE);
    expect(drift.restore).toEqual([]);
    expect(drift.conflicts).toEqual([]);
    expect(drift.extras.map((e) => e.object)).toEqual(
      expect.arrayContaining([
        'table "dogdays"."member_extra"',
        'column "dogdays"."userPreferences"."nickname"',
        'index "dogdays"."member_idx"',
        'sequence "dogdays"."member_seq"',
        'view "dogdays"."member_view"',
        'function "dogdays"."member_fn"',
        'policy "member_pol" on "dogdays"."userPreferences"',
      ]),
    );
  });

  it("reads an extra index that the schema does not have as extra, not as a conflict", () => {
    const drift = classifyDiff('DROP INDEX "dogdays"."member_idx";', NONE);
    expect(drift.extras).toHaveLength(1);
    expect(drift.conflicts).toEqual([]);
  });
});

describe("classifyDiff, CONFLICTING", () => {
  it("refuses a changed column type, whose diff drops and re-adds the default", () => {
    const drift = classifyDiff(real.columnType, NONE);
    const column = drift.conflicts.find(
      (c) => c.object === 'column "dogdays"."userPlanDrafts"."minCreditHours"',
    );
    expect(column?.detail).toMatch(/type/);
    expect(drift.restore.join("\n")).not.toMatch(/ALTER COLUMN/);
  });

  it("refuses a changed default", () => {
    const drift = classifyDiff(real.columnDefault, NONE);
    expect(drift.conflicts.map((c) => c.object)).toContain(
      'column "dogdays"."userPlanDrafts"."maxCreditHours"',
    );
  });

  it("refuses a changed nullability", () => {
    const drift = classifyDiff(
      'ALTER TABLE "dogdays"."t"\n  ALTER COLUMN "c" SET NOT NULL;\n\nALTER TABLE "dogdays"."t"\n  ALTER COLUMN "d" DROP NOT NULL;',
      NONE,
    );
    expect(drift.conflicts.map((c) => c.detail)).toEqual([
      "its nullability differs from supabase/schemas",
      "its nullability differs from supabase/schemas",
    ]);
  });

  it("refuses a function whose body differs but not one the database lacks", () => {
    const changed = classifyDiff(real.functionBody, WITH_FUNCTION);
    expect(changed.conflicts.map((c) => c.object)).toContain(
      'function "dogdays"."claim_legacy_data"',
    );
    expect(changed.restore).toEqual([]);
    const missing = classifyDiff(real.functionBody, NONE);
    expect(missing.conflicts).toEqual([]);
    expect(missing.restored).toContain(
      'function "dogdays"."claim_legacy_data"',
    );
  });

  it("refuses an index, a policy and a constraint that exist in both but differ (DROP then CREATE)", () => {
    const index = classifyDiff(real.indexChanged, NONE);
    expect(index.conflicts.map((c) => c.object)).toContain(
      'index "dogdays"."userSavedPlans_userId_idx"',
    );
    expect(index.restore.join("\n")).not.toContain("userSavedPlans_userId_idx");
    expect(index.extras.map((e) => e.object)).not.toContain(
      'index "dogdays"."userSavedPlans_userId_idx"',
    );

    const policy = classifyDiff(real.policyChanged, NONE);
    expect(policy.conflicts.map((c) => c.object)).toContain(
      'policy "users_own_prefs" on "dogdays"."userPreferences"',
    );
    expect(policy.restore.join("\n")).not.toContain("users_own_prefs");

    const check = classifyDiff(real.checkChanged, NONE);
    expect(check.conflicts.map((c) => c.object)).toContain(
      'constraint "userPreferences_owner_check" on "dogdays"."userPreferences"',
    );
    expect(check.restore.join("\n")).not.toContain("owner_check");
  });

  it("refuses a statement it does not understand rather than running it", () => {
    const drift = classifyDiff(
      "VACUUM FULL dogdays.t;\n\nALTER TABLE dogdays.t OWNER TO someone;",
      NONE,
    );
    expect(drift.restore).toEqual([]);
    expect(drift.conflicts).toHaveLength(2);
  });
});

describe("classifyDiff, mixed damage", () => {
  it("sorts a missing table, an extra column and a changed type from one diff", () => {
    const drift = classifyDiff(
      [
        real.dropTable,
        real.columnType,
        'ALTER TABLE "dogdays"."userPreferences"\n  DROP COLUMN "nickname";',
      ].join("\n\n"),
      NONE,
    );
    expect(drift.restored).toContain('table "dogdays"."userPlanDraftCourses"');
    expect(drift.extras.map((e) => e.object)).toContain(
      'column "dogdays"."userPreferences"."nickname"',
    );
    expect(drift.conflicts.length).toBeGreaterThan(0);
    assertOnlyAdditive(drift.restore);
  });

  it("finds nothing in an empty diff", () => {
    expect(classifyDiff("", NONE)).toEqual({
      restore: [],
      restored: [],
      extras: [],
      conflicts: [],
    });
  });
});
