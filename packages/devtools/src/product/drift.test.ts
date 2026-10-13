import { describe, expect, it } from "vitest";
import { classifyDiff, signatureOf, splitStatements } from "./drift.js";
import * as real from "./drift.fixtures.js";

const NONE = new Set<string>();
const WITH_FUNCTION = new Set([
  "function:dogdays.claim_legacy_data",
  "signature:dogdays.claim_legacy_data()",
]);

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
    // Its grants are part of creating it, not a re-grant on something that existed.
    expect(drift.restored.filter((l) => l.startsWith("privileges"))).toEqual(
      [],
    );
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
        'function "dogdays"."claim_legacy_data"()',
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

  it("re-grants a privilege the database lost, says so, and never revokes", () => {
    const drift = classifyDiff(real.grantRevoked, NONE);
    expect(
      drift.restore.some((s) => s.startsWith("GRANT DELETE, SELECT")),
    ).toBe(true);
    assertOnlyAdditive(drift.restore);
    expect(drift.restore.some((s) => s.startsWith("REVOKE"))).toBe(false);
    expect(drift.restored).toContain(
      'privileges on "dogdays"."userPreferences"',
    );
    // Not "granted beyond" what the schema grants: the member has less.
    expect(drift.extras.map((e) => e.object)).not.toContain(
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

describe("classifyDiff, privileges on things that exist", () => {
  it("reports a narrowing (REVOKE ALL, then the schema's GRANTs) as a re-grant that was applied, not as an extra", () => {
    const drift = classifyDiff(real.privilegesNarrowed, NONE);
    expect(drift.restore).toEqual([
      'GRANT DELETE, SELECT ON TABLE "dogdays"."userPreferences" TO "authenticated"',
    ]);
    expect(drift.restored).toEqual([
      'privileges on "dogdays"."userPreferences"',
    ]);
    expect(drift.extras).toEqual([]);
    expect(drift.conflicts).toEqual([]);
  });

  it("still lists a REVOKE with nothing to grant back as privileges beyond the schema", () => {
    const drift = classifyDiff(
      'REVOKE ALL ON TABLE "dogdays"."userPreferences" FROM "anon";',
      NONE,
    );
    expect(drift.restore).toEqual([]);
    expect(drift.restored).toEqual([]);
    expect(drift.extras).toEqual([
      {
        object: 'privileges on "dogdays"."userPreferences"',
        detail:
          "granted to anon beyond (or instead of) what supabase/schemas grants",
      },
    ]);
  });
});

describe("classifyDiff, overloads", () => {
  const WITH_OVERLOAD = new Set([
    "function:dogdays.claim_legacy_data",
    "signature:dogdays.claim_legacy_data(integer)",
  ]);

  it("creates the missing signature and lists the member's overload as an extra, with signatures", () => {
    const drift = classifyDiff(real.overloadMissing, WITH_OVERLOAD);
    expect(drift.conflicts).toEqual([]);
    expect(drift.restored).toEqual([
      'function "dogdays"."claim_legacy_data"()',
    ]);
    expect(drift.restore.join("\n")).toContain(
      "CREATE OR REPLACE FUNCTION dogdays.claim_legacy_data()",
    );
    expect(drift.extras.map((e) => e.object)).toEqual([
      'function "dogdays"."claim_legacy_data"(integer)',
    ]);
    assertOnlyAdditive(drift.restore);
  });

  it("still refuses a CREATE OR REPLACE of a signature the database has", () => {
    const both = new Set([
      ...WITH_OVERLOAD,
      "signature:dogdays.claim_legacy_data()",
    ]);
    const drift = classifyDiff(real.functionBody, both);
    expect(drift.conflicts.map((c) => c.object)).toEqual([
      'function "dogdays"."claim_legacy_data"()',
    ]);
    expect(drift.restore).toEqual([]);
  });

  it("reads argument lists the way the database spells them", () => {
    expect(signatureOf("")).toBe("()");
    expect(signatureOf("a int, OUT b text, c text DEFAULT 'x'")).toBe(
      "(integer, text)",
    );
    expect(signatureOf("IN p timestamptz, VARIADIC xs int4[]")).toBe(
      "(timestamp with time zone, integer[])",
    );
    expect(signatureOf("integer, timestamp with time zone, text[]")).toBe(
      "(integer, timestamp with time zone, text[])",
    );
    expect(signatureOf('"my arg" character varying(20), time text')).toBe(
      "(character varying(20), text)",
    );
  });
});

describe("classifyDiff, renamed columns", () => {
  const TYPES = new Map([["dogdays.userPlanDrafts.campusInput", "text"]]);

  it("refuses a missing column next to an extra column of the same type, naming both, and recreates nothing", () => {
    const drift = classifyDiff(real.columnRenamed, NONE, TYPES);
    expect(drift.restore).toEqual([]);
    expect(drift.restored).toEqual([]);
    expect(drift.extras).toEqual([]);
    expect(drift.conflicts).toHaveLength(1);
    const [conflict] = drift.conflicts;
    expect(conflict?.object).toBe(
      'column "dogdays"."userPlanDrafts"."inputCampus"',
    );
    expect(conflict?.detail).toContain('"campusInput"');
    expect(conflict?.detail).toContain("rename");
  });

  it("recreates the column when the extra one has another type", () => {
    const drift = classifyDiff(
      real.columnRenamed,
      NONE,
      new Map([["dogdays.userPlanDrafts.campusInput", "integer"]]),
    );
    expect(drift.conflicts).toEqual([]);
    expect(drift.restored).toContain(
      'column "dogdays"."userPlanDrafts"."inputCampus"',
    );
    expect(drift.extras.map((e) => e.object)).toContain(
      'column "dogdays"."userPlanDrafts"."campusInput"',
    );
  });

  it("recreates the column when it cannot tell the extra column's type", () => {
    const drift = classifyDiff(real.columnRenamed, NONE);
    expect(drift.conflicts).toEqual([]);
    expect(drift.restored).toContain(
      'column "dogdays"."userPlanDrafts"."inputCampus"',
    );
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
        'function "dogdays"."member_fn"()',
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
      'function "dogdays"."claim_legacy_data"()',
    );
    expect(changed.restore).toEqual([]);
    const missing = classifyDiff(real.functionBody, NONE);
    expect(missing.conflicts).toEqual([]);
    expect(missing.restored).toContain(
      'function "dogdays"."claim_legacy_data"()',
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

describe("classifyDiff, privileges compared with the live database", () => {
  const diff =
    'REVOKE ALL ON TABLE "dogdays"."userPreferences" FROM "authenticated";\n\nGRANT DELETE, SELECT ON TABLE "dogdays"."userPreferences" TO "authenticated";\n';
  const live = (...privs: string[]) =>
    new Map([
      ["dogdays.userPreferences", new Map([["authenticated", new Set(privs)]])],
    ]);

  it("lists a privilege a member granted as an extra, revokes nothing and grants nothing", () => {
    const drift = classifyDiff(
      diff,
      NONE,
      new Map(),
      live("DELETE", "SELECT", "TRUNCATE"),
    );
    expect(drift.restore).toEqual([]);
    expect(drift.restored).toEqual([]);
    expect(drift.extras).toEqual([
      {
        object: 'privileges on "dogdays"."userPreferences"',
        detail:
          "TRUNCATE granted to authenticated beyond what supabase/schemas grants",
      },
    ]);
  });

  it("grants only the privilege the schema defines and the database lacks", () => {
    const drift = classifyDiff(diff, NONE, new Map(), live("SELECT"));
    expect(drift.restore).toEqual([
      'GRANT DELETE ON TABLE "dogdays"."userPreferences" TO "authenticated"',
    ]);
    expect(drift.restored).toEqual([
      'privileges on "dogdays"."userPreferences"',
    ]);
    expect(drift.extras).toEqual([]);
  });

  it("does both at once, and never writes a REVOKE", () => {
    const drift = classifyDiff(
      diff,
      NONE,
      new Map(),
      live("SELECT", "TRUNCATE"),
    );
    expect(drift.restore).toHaveLength(1);
    expect(drift.restore.join()).not.toMatch(/REVOKE/);
    expect(drift.extras).toHaveLength(1);
  });

  it("finds nothing when the database has exactly what the schema grants", () => {
    const drift = classifyDiff(diff, NONE, new Map(), live("DELETE", "SELECT"));
    expect(drift).toMatchObject({ restore: [], restored: [], extras: [] });
  });

  it("reads a column-level privilege from the column's own grants", () => {
    const sql =
      'REVOKE ALL ("inputCampus") ON TABLE "dogdays"."userPlanDrafts" FROM "authenticated";\n\nGRANT INSERT ("inputCampus"), UPDATE ("inputCampus") ON TABLE "dogdays"."userPlanDrafts" TO "authenticated";\n';
    const liveColumns = new Map([
      [
        "dogdays.userPlanDrafts.inputCampus",
        new Map([["authenticated", new Set(["INSERT", "UPDATE", "SELECT"])]]),
      ],
    ]);
    const drift = classifyDiff(sql, NONE, new Map(), liveColumns);
    expect(drift.restore).toEqual([]);
    expect(drift.extras[0]?.detail).toContain("SELECT");
  });
});

describe("classifyDiff, a function whose body changed", () => {
  it("is listed once, as a conflict with its signature, even when the diff also drops it", () => {
    const body = real.functionBody.slice(
      real.functionBody.indexOf("CREATE OR REPLACE"),
    );
    const sql = `DROP FUNCTION "dogdays"."claim_legacy_data"();\n\n${body}`;
    const drift = classifyDiff(sql, WITH_FUNCTION);
    expect(drift.extras).toEqual([]);
    expect(drift.conflicts.map((c) => c.object)).toEqual([
      'function "dogdays"."claim_legacy_data"()',
    ]);
  });
});
