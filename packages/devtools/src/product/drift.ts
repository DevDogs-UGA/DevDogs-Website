/**
 * Sorting what differs between a live database and what `supabase/schemas`
 * describes into three kinds, so `db sync` can fix what is safe and leave the
 * rest alone.
 *
 * The input is the SQL of `supabase db diff --from <database> --to migrations
 * --use-pg-delta`: the statements that would turn the live database into the
 * record. Applying that SQL as is changes a member's column type, drops their
 * tables and sequences. So it is never applied; each statement is read:
 *
 *   - MISSING: the record has it, the database lacks it (`CREATE TABLE`,
 *     `ADD COLUMN`, `ADD CONSTRAINT`, `GRANT`, ...). Only these are applied.
 *   - EXTRA: the database has it, the record does not (`DROP TABLE`,
 *     `DROP COLUMN`, `DROP INDEX`, `REVOKE`, ...). Reported, never applied.
 *   - CONFLICTING: both have it, defined differently (`ALTER COLUMN ... TYPE`,
 *     a `DROP INDEX` followed by `CREATE INDEX` of the same name, a function
 *     whose body differs, ...). Reported; the sync refuses.
 *
 * Anything unrecognized is CONFLICTING: the only safe reading of a statement
 * devtools does not understand is "do not run it".
 */

export interface Finding {
  /** What it is, for a person: `table "dogdays"."notes"`. */
  object: string;
  /** Why it is listed. */
  detail: string;
}

export interface Drift {
  /** SQL to run, in order: only statements that create or add. */
  restore: string[];
  /** Objects `restore` creates, for the message. */
  restored: string[];
  extras: Finding[];
  conflicts: Finding[];
}

/** Objects that exist in the live database, keyed `function:schema.name`; for `CREATE OR REPLACE`. */
export type Existing = ReadonlySet<string>;

// ── splitting ───────────────────────────────────────────────────────────────

/** Splits SQL at top-level semicolons, honoring quotes, dollar quotes and comments. Comments are dropped. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  const push = () => {
    const text = current.trim();
    if (text) out.push(text);
    current = "";
  };
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += " ";
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === ";") {
      push();
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  push();
  return out;
}

/** Splits `text` at commas that are not inside parentheses or quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

// ── names ───────────────────────────────────────────────────────────────────

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})*`;

/** `"a"."b"` -> ["a", "b"]; unquoted names fold to lower case like Postgres. */
function parts(name: string): string[] {
  const found = name.match(new RegExp(IDENT, "g")) ?? [];
  return found.map((part) =>
    part.startsWith('"')
      ? part.slice(1, -1).replace(/""/g, '"')
      : part.toLowerCase(),
  );
}

function qualified(name: string): string {
  return parts(name).join(".");
}

function shown(name: string): string {
  return parts(name)
    .map((part) => `"${part}"`)
    .join(".");
}

// ── classification ──────────────────────────────────────────────────────────

interface Drop {
  key: string;
  finding: Finding;
}

/** A GRANT (`finding` null) or REVOKE, in the order the diff has them. */
interface Privilege {
  sql: string;
  /** What a REVOKE is on, `schema.name`; null for a GRANT. */
  target: string | null;
  finding: Finding | null;
}

interface Create {
  key: string;
  sql: string;
  label: string;
}

const CREATE_KINDS: Record<string, string> = {
  SCHEMA: "schema",
  TABLE: "table",
  "FOREIGN TABLE": "table",
  SEQUENCE: "sequence",
  TYPE: "type",
  DOMAIN: "type",
  VIEW: "view",
  "MATERIALIZED VIEW": "view",
  FUNCTION: "function",
  PROCEDURE: "function",
};

const WORD = (word: string) => new RegExp(`^${word}\\b`, "i");

/**
 * Classifies the statements of a live diff. `existing` is what the live
 * database has (for `CREATE OR REPLACE`, which reads the same whether the
 * object is missing or merely different).
 */
export function classifyDiff(sql: string, existing: Existing): Drift {
  const creates: Create[] = [];
  const drops: Drop[] = [];
  const conflicts = new Map<string, Set<string>>();
  const extras: Finding[] = [];
  const preamble: string[] = [];
  const privileges: Privilege[] = [];
  let sawRevoke = false;

  const conflict = (object: string, why: string) => {
    const set = conflicts.get(object) ?? new Set<string>();
    set.add(why);
    conflicts.set(object, set);
  };

  for (const statement of splitStatements(sql)) {
    const text = statement.replace(/\s+/g, " ");

    if (WORD("SET").test(text)) {
      preamble.push(statement);
      continue;
    }
    if (WORD("GRANT").test(text)) {
      privileges.push({ sql: statement, target: null, finding: null });
      continue;
    }
    if (WORD("REVOKE").test(text)) {
      sawRevoke = true;
      const on = new RegExp(
        String.raw`\bON\s+(?:(?:TABLE|SEQUENCE|FUNCTION|SCHEMA|TYPE|DOMAIN)\s+)?(${QNAME})(?:\s*\([^)]*\))?\s+FROM\s+(.+)$`,
        "i",
      ).exec(text);
      privileges.push({
        sql: statement,
        target: on ? qualified(on[1]!) : "",
        finding: {
          object: on ? `privileges on ${shown(on[1]!)}` : "privileges",
          detail: on
            ? `granted to ${on[2]!.replace(/"/g, "")} beyond (or instead of) what supabase/schemas grants`
            : "differ from what supabase/schemas grants",
        },
      });
      continue;
    }

    const create = new RegExp(
      String.raw`^CREATE\s+(OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TEMP(?:ORARY)?\s+)?(SCHEMA|TABLE|FOREIGN TABLE|SEQUENCE|TYPE|DOMAIN|VIEW|MATERIALIZED VIEW|FUNCTION|PROCEDURE|INDEX|POLICY|TRIGGER|CONSTRAINT TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT}(?:\s*\.\s*${IDENT})*)(.*)$`,
      "is",
    ).exec(text);
    if (create) {
      const replace = Boolean(create[1]);
      const kindWord = create[2]!.toUpperCase().replace(/\s+/g, " ");
      const name = create[3]!;
      const rest = create[4]!;
      let key: string;
      let label: string;
      if (kindWord === "INDEX") {
        key = `index:${parts(name).at(-1)}`;
        label = `index ${shown(name)}`;
      } else if (
        kindWord === "POLICY" ||
        kindWord === "TRIGGER" ||
        kindWord === "CONSTRAINT TRIGGER"
      ) {
        const on = new RegExp(String.raw`\bON\s+(${QNAME})`, "i").exec(rest);
        const table = on ? qualified(on[1]!) : "?";
        const noun = kindWord === "POLICY" ? "policy" : "trigger";
        key = `${noun}:${table}:${parts(name).at(-1)}`;
        label = `${noun} ${shown(name)} on ${on ? shown(on[1]!) : "?"}`;
      } else {
        const kind = CREATE_KINDS[kindWord] ?? kindWord.toLowerCase();
        key = `${kind}:${qualified(name)}`;
        label = `${kind} ${shown(name)}`;
      }
      if (replace && existing.has(key)) {
        conflict(label, "its definition differs from supabase/schemas");
      } else {
        creates.push({ key, sql: statement, label });
      }
      continue;
    }

    const drop = new RegExp(
      String.raw`^DROP\s+(SCHEMA|TABLE|FOREIGN TABLE|SEQUENCE|TYPE|DOMAIN|VIEW|MATERIALIZED VIEW|FUNCTION|PROCEDURE|INDEX|POLICY|TRIGGER|EXTENSION)\s+(?:IF\s+EXISTS\s+)?(${QNAME})(.*)$`,
      "is",
    ).exec(text);
    if (drop) {
      const kindWord = drop[1]!.toUpperCase();
      const name = drop[2]!;
      const rest = drop[3]!;
      if (kindWord === "INDEX") {
        drops.push({
          key: `index:${parts(name).at(-1)}`,
          finding: {
            object: `index ${shown(name)}`,
            detail: "not in supabase/schemas",
          },
        });
      } else if (kindWord === "POLICY" || kindWord === "TRIGGER") {
        const on = new RegExp(String.raw`\bON\s+(${QNAME})`, "i").exec(rest);
        const noun = kindWord.toLowerCase();
        drops.push({
          key: `${noun}:${on ? qualified(on[1]!) : "?"}:${parts(name).at(-1)}`,
          finding: {
            object: `${noun} ${shown(name)} on ${on ? shown(on[1]!) : "?"}`,
            detail: "not in supabase/schemas",
          },
        });
      } else {
        const kind = CREATE_KINDS[kindWord] ?? kindWord.toLowerCase();
        drops.push({
          key: `${kind}:${qualified(name)}`,
          finding: {
            object: `${kind} ${shown(name)}`,
            detail: "not in supabase/schemas",
          },
        });
      }
      continue;
    }

    const alterTable = new RegExp(
      String.raw`^ALTER\s+(?:FOREIGN\s+)?TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QNAME})\s+(.*)$`,
      "is",
    ).exec(text);
    if (alterTable) {
      const table = alterTable[1]!;
      const t = qualified(table);
      for (const action of splitTopLevel(alterTable[2]!)) {
        classifyTableAction(table, t, action, {
          creates,
          drops,
          conflict,
        });
      }
      continue;
    }

    const alterType = new RegExp(
      String.raw`^ALTER\s+TYPE\s+(${QNAME})\s+ADD\s+VALUE\b`,
      "i",
    ).exec(text);
    if (alterType) {
      creates.push({
        key: `enumvalue:${statement}`,
        sql: statement,
        label: `a value of type ${shown(alterType[1]!)}`,
      });
      continue;
    }

    conflict(
      text.slice(0, 80),
      "a difference devtools does not know how to classify, so it will not touch it",
    );
  }

  // A DROP and a CREATE of the same thing is one object defined two ways.
  const created = new Set(creates.map((c) => c.key));
  const dropped = new Set(drops.map((d) => d.key));
  const restoring = creates.filter((c) => !dropped.has(c.key));
  for (const d of drops) {
    if (created.has(d.key)) {
      conflict(
        d.finding.object,
        "it is defined differently from supabase/schemas",
      );
    } else {
      extras.push(d.finding);
    }
  }

  // A REVOKE on something this sync creates is part of creating it as the
  // schema files say (a new function is executable by PUBLIC until revoked).
  // A REVOKE on anything else would take privileges from a member's object.
  const newNames = new Set(
    restoring
      .map((c) => c.key)
      .filter(
        (key) => !/^(index|policy|trigger|column|constraint|rls)/.test(key),
      )
      .map((key) => key.slice(key.indexOf(":") + 1)),
  );
  const tail: string[] = [];
  let grants = 0;
  for (const p of privileges) {
    if (p.target === null) {
      tail.push(p.sql);
      grants++;
    } else if (newNames.has(p.target)) {
      tail.push(p.sql);
    } else if (p.finding) {
      extras.push(p.finding);
    }
  }

  const restore: string[] = [];
  const restored = restoring.map((c) => c.label);
  if (restoring.length > 0 || grants > 0) {
    restore.push(...preamble, ...restoring.map((c) => c.sql), ...tail);
  }
  // Grants only add privileges and are safe to repeat. When nothing was
  // revoked, a GRANT in the diff means the database lacks it.
  if (restoring.length === 0 && grants > 0 && !sawRevoke) {
    restored.push("privileges");
  }

  return {
    restore,
    restored,
    extras: dedupe(extras),
    conflicts: [...conflicts].map(([object, why]) => ({
      object,
      detail: [...why].join("; "),
    })),
  };
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.object}|${f.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyTableAction(
  table: string,
  t: string,
  action: string,
  ctx: {
    creates: Create[];
    drops: Drop[];
    conflict: (object: string, why: string) => void;
  },
): void {
  const sql = `ALTER TABLE ${table} ${action}`;
  let m: RegExpExecArray | null;
  if (
    (m = new RegExp(
      String.raw`^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})`,
      "i",
    ).exec(action))
  ) {
    ctx.creates.push({
      key: `column:${t}.${parts(m[1]!)[0]}`,
      sql,
      label: `column ${shown(table)}.${shown(m[1]!)}`,
    });
  } else if (
    (m = new RegExp(String.raw`^ADD\s+CONSTRAINT\s+(${IDENT})`, "i").exec(
      action,
    ))
  ) {
    ctx.creates.push({
      key: `constraint:${t}.${parts(m[1]!)[0]}`,
      sql,
      label: `constraint ${shown(m[1]!)} on ${shown(table)}`,
    });
  } else if (
    (m = new RegExp(
      String.raw`^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(${IDENT})`,
      "i",
    ).exec(action))
  ) {
    ctx.drops.push({
      key: `column:${t}.${parts(m[1]!)[0]}`,
      finding: {
        object: `column ${shown(table)}.${shown(m[1]!)}`,
        detail: "not in supabase/schemas",
      },
    });
  } else if (
    (m = new RegExp(
      String.raw`^DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${IDENT})`,
      "i",
    ).exec(action))
  ) {
    ctx.drops.push({
      key: `constraint:${t}.${parts(m[1]!)[0]}`,
      finding: {
        object: `constraint ${shown(m[1]!)} on ${shown(table)}`,
        detail: "not in supabase/schemas",
      },
    });
  } else if (
    (m = new RegExp(String.raw`^ALTER\s+COLUMN\s+(${IDENT})\s+(.*)$`, "i").exec(
      action,
    ))
  ) {
    const what = m[2]!;
    const aspect = /^(?:SET\s+DATA\s+)?TYPE\b/i.test(what)
      ? "type"
      : /\bDEFAULT\b/i.test(what)
        ? "default"
        : /\bNOT\s+NULL\b/i.test(what)
          ? "nullability"
          : "definition";
    ctx.conflict(
      `column ${shown(table)}.${shown(m[1]!)}`,
      `its ${aspect} differs from supabase/schemas`,
    );
  } else if (/^(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i.test(action)) {
    ctx.creates.push({
      key: `rls:${t}:${action.toUpperCase()}`,
      sql,
      label: `row level security on ${shown(table)}`,
    });
  } else {
    ctx.conflict(
      `table ${shown(table)}`,
      `a change devtools will not make for you (${action.slice(0, 60)})`,
    );
  }
}
