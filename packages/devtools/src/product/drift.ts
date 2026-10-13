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

// ── function signatures ─────────────────────────────────────────────────────

const TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int4: "integer",
  int8: "bigint",
  int2: "smallint",
  bool: "boolean",
  float8: "double precision",
  float4: "real",
  varchar: "character varying",
  bpchar: "character",
  timestamptz: "timestamp with time zone",
  timetz: "time with time zone",
  decimal: "numeric",
};

/** `Int4[ ]`, `pg_catalog.text`, `"text"` -> a comparable spelling. */
export function normalizeType(type: string): string {
  let t = type.trim().replace(/\s+/g, " ").toLowerCase();
  const array = /(\s*\[\d*\])+$/.exec(t)?.[0] ?? "";
  t = t.slice(0, t.length - array.length);
  t = t.replace(/^pg_catalog\./, "").replace(/"/g, "");
  t = t.replace(/\s*\(.*\)$/, (m) => m.replace(/\s+/g, ""));
  const base = /^([a-z0-9_ ]+?)(\(.*\))?$/.exec(t);
  const head = base?.[1]?.trim() ?? t;
  const tail = base?.[2] ?? "";
  return `${TYPE_ALIASES[head] ?? head}${tail}${array.replace(/\s/g, "")}`;
}

/** The text inside the first balanced parentheses of `text`, or null. */
function balanced(text: string): string | null {
  const start = text.indexOf("(");
  if (start === -1) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return text.slice(start + 1, i);
  }
  return null;
}

const MULTIWORD_HEADS = new Set([
  "double",
  "timestamp",
  "time",
  "character",
  "bit",
  "national",
  "interval",
]);

/**
 * The argument types of a function's parameter list, as the database spells
 * them: `a int, OUT b text, c text DEFAULT 'x'` -> `(integer, text)`.
 */
export function signatureOf(argList: string): string {
  const types: string[] = [];
  for (let arg of splitTopLevel(argList)) {
    if (/^(OUT|TABLE)\b/i.test(arg)) continue;
    arg = arg.replace(/^(?:IN\s+OUT|INOUT|IN|VARIADIC)\s+/i, "");
    const dflt = /\s+DEFAULT\s|\s*=\s*/i.exec(arg);
    if (dflt) arg = arg.slice(0, dflt.index);
    arg = arg.trim();
    const named = new RegExp(`^(${IDENT})\\s+(.+)$`, "s").exec(arg);
    let type = arg;
    if (named) {
      const head = named[1]!.toLowerCase();
      const second = named[2]!.split(/[\s(]/)[0]!.toLowerCase();
      const wholeType =
        MULTIWORD_HEADS.has(head) &&
        (/^(precision|with|without|varying)$/.test(second) ||
          named[2]!.startsWith("("));
      if (!wholeType) type = named[2]!;
    }
    types.push(normalizeType(type));
  }
  return `(${types.join(", ")})`;
}

/** Normalizes the `function:s.n(types)` spelling the database reports. */
function normalizeKeySignature(types: string): string {
  return signatureOf(types);
}

// ── classification ──────────────────────────────────────────────────────────

interface Drop {
  key: string;
  finding: Finding;
  /** A dropped column: its table (`schema.table`) and name. */
  column?: { table: string; name: string };
}

/** A privilege on a table, a column of it, a function, a schema, ... */
interface PrivUnit {
  priv: string;
  /** Set for a column-level privilege. */
  column?: string;
}

/** A GRANT or REVOKE, in the order the diff has them. */
interface Privilege {
  sql: string;
  revoke: boolean;
  /** What it is on, `schema.table`, `schema.table.column` or `schema.fn(types)`. Empty when unreadable. */
  targets: string[];
  /** The table or function itself, `schema.table` or `schema.fn(types)`; empty when unreadable. */
  base: string;
  /** The table or function the privileges are on, for a person; null when unreadable. */
  object: string | null;
  /** Who loses the privileges (a REVOKE). */
  from: string;
  /** TABLE, SEQUENCE, FUNCTION, SCHEMA, ... (TABLE when the statement does not say). */
  kind: string;
  /** What the statement grants or revokes, upper case; `ALL` stands for every privilege. */
  units: PrivUnit[];
  /** Who it is granted to or revoked from, as written (`raw`) and as the database names them. */
  grantees: { raw: string; name: string }[];
  /** `ON TABLE "s"."t"`, to write the statement again with other privileges. */
  onText: string;
  /** ` WITH GRANT OPTION`, or nothing. */
  option: string;
}

/**
 * What the live database grants: `schema.table`, `schema.table.column`,
 * `schema.fn(types)` or a schema name -> grantee (`public` for PUBLIC) ->
 * privileges, upper case.
 */
export type LivePrivileges = ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
>;

const ALL_PRIVILEGES: Record<string, string[]> = {
  TABLE: [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ],
  COLUMN: ["SELECT", "INSERT", "UPDATE", "REFERENCES"],
  SEQUENCE: ["USAGE", "SELECT", "UPDATE"],
  FUNCTION: ["EXECUTE"],
  PROCEDURE: ["EXECUTE"],
  SCHEMA: ["USAGE", "CREATE"],
  TYPE: ["USAGE"],
  DOMAIN: ["USAGE"],
};

/** Reads what a GRANT or REVOKE is on. */
function privilegeOf(text: string, revoke: boolean): Privilege {
  const on = new RegExp(
    String.raw`\bON\s+(?:(TABLE|SEQUENCE|FUNCTION|PROCEDURE|SCHEMA|TYPE|DOMAIN)\s+)?(${QNAME})(\s*\(.*\))?\s+(?:FROM|TO)\s+(.+)$`,
    "is",
  ).exec(text);
  const base: Privilege = {
    sql: text,
    revoke,
    targets: [],
    base: "",
    object: null,
    from: "",
    kind: "TABLE",
    units: [],
    grantees: [],
    onText: "",
    option: "",
  };
  if (!on) return base;
  const kind = (on[1] ?? "").toUpperCase();
  const name = on[2]!;
  const isFunction = kind === "FUNCTION" || kind === "PROCEDURE";
  const sig = isFunction ? signatureOf(balanced(on[3] ?? "") ?? "") : "";
  const object = `${qualified(name)}${sig}`;
  const head = text
    .slice(0, on.index)
    .replace(/^(?:GRANT|REVOKE)\s+(?:GRANT\s+OPTION\s+FOR\s+)?/i, "");
  const units: PrivUnit[] = [];
  for (const entry of splitTopLevel(head)) {
    const word = entry
      .replace(/\(.*\)/s, "")
      .trim()
      .toUpperCase()
      .replace(/^ALL\s+PRIVILEGES$/, "ALL");
    const cols = /\(([^)]*)\)/.exec(entry)?.[1];
    if (cols && !isFunction) {
      for (const c of cols.split(",")) {
        const column = parts(c)[0];
        if (column) units.push({ priv: word, column });
      }
    } else if (word) units.push({ priv: word });
  }
  const columns = units.flatMap((u) => (u.column ? [u.column] : []));
  const tail = on[4]!;
  const option = /\bWITH\s+GRANT\s+OPTION\b/i.test(tail)
    ? " WITH GRANT OPTION"
    : "";
  const who = tail
    .replace(/\s+WITH\s+GRANT\s+OPTION\b/i, "")
    .replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, "")
    .replace(/\s+GRANTED\s+BY\s+.+$/i, "");
  return {
    ...base,
    base: object,
    targets:
      columns.length > 0 ? columns.map((c) => `${object}.${c}`) : [object],
    object: `privileges on ${isFunction ? "function " : ""}${shown(name)}${sig}`,
    from: tail.replace(/"/g, ""),
    kind: kind || "TABLE",
    units,
    grantees: splitTopLevel(who).map((raw) => {
      const name = raw.replace(/^GROUP\s+/i, "").trim();
      return {
        raw: name,
        name: /^public$/i.test(name) ? "public" : (parts(name)[0] ?? name),
      };
    }),
    onText: `ON ${kind ? kind + " " : ""}${name}${on[3] ?? ""}`,
    option,
  };
}

interface Create {
  key: string;
  sql: string;
  label: string;
  /** An added column: its table (`schema.table`), name and normalized type. */
  column?: { table: string; name: string; type: string };
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
export function classifyDiff(
  sql: string,
  existing: Existing,
  columnTypes: ReadonlyMap<string, string> = new Map(),
  livePrivileges?: LivePrivileges,
): Drift {
  // `signature:schema.fn(types)` entries say which overloads exist.
  const signatures = new Set<string>();
  for (const key of existing) {
    const m = /^signature:(.*?)\((.*)\)$/.exec(key);
    if (m) signatures.add(`${m[1]}${normalizeKeySignature(m[2]!)}`);
  }

  const creates: Create[] = [];
  const drops: Drop[] = [];
  const conflicts = new Map<string, Set<string>>();
  // Keys of objects already listed as conflicting (a function whose body
  // differs); a DROP of the same one in the diff is not a separate extra.
  const conflicted = new Set<string>();
  const extras: Finding[] = [];
  const preamble: string[] = [];
  const privileges: Privilege[] = [];

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
    if (WORD("GRANT").test(text) || WORD("REVOKE").test(text)) {
      const p = privilegeOf(text, WORD("REVOKE").test(text));
      privileges.push({ ...p, sql: statement });
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
      } else if (kindWord === "FUNCTION" || kindWord === "PROCEDURE") {
        const sig = signatureOf(balanced(rest) ?? "");
        key = `function:${qualified(name)}${sig}`;
        label = `function ${shown(name)}${sig}`;
      } else {
        const kind = CREATE_KINDS[kindWord] ?? kindWord.toLowerCase();
        key = `${kind}:${qualified(name)}`;
        label = `${kind} ${shown(name)}`;
      }
      // For a function, the signature says whether this one exists; another
      // overload of the same name is a different function.
      const exists = key.startsWith("function:")
        ? signatures.has(key.slice("function:".length)) ||
          // No signature information (an older session): go by name.
          (signatures.size === 0 && existing.has(`function:${qualified(name)}`))
        : existing.has(key);
      if (replace && exists) {
        conflicted.add(key);
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
      } else if (kindWord === "FUNCTION" || kindWord === "PROCEDURE") {
        const sig = signatureOf(balanced(rest) ?? "");
        drops.push({
          key: `function:${qualified(name)}${sig}`,
          finding: {
            object: `function ${shown(name)}${sig}`,
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

  // A column the record has next to a column of the same type the record does
  // not: far more likely a rename than a drop and an add. Recreating the
  // column would leave an empty one (or one holding its default) beside the
  // member's data, so the sync refuses and says so.
  const renamedCreates = new Set<Create>();
  const renamedDrops = new Set<Drop>();
  for (const c of creates) {
    if (!c.column) continue;
    const from = drops.find((d) => {
      if (!d.column || renamedDrops.has(d)) return false;
      if (d.column.table !== c.column!.table) return false;
      const type = columnTypes.get(`${d.column.table}.${d.column.name}`);
      return type !== undefined && normalizeType(type) === c.column!.type;
    });
    if (!from) continue;
    renamedCreates.add(c);
    renamedDrops.add(from);
    conflict(
      c.label,
      `supabase/schemas has it, and your database has ${from.finding.object} of the same type (${c.column.type}); that looks like a rename, so devtools will not add an empty column beside it. If you renamed it on purpose, rename it in supabase/schemas too; otherwise rename it back`,
    );
  }
  const skipped = new Set(
    [...renamedCreates].map((c) => c.key.slice("column:".length)),
  );
  const liveCreates = creates.filter((c) => !renamedCreates.has(c));
  const liveDrops = drops.filter((d) => !renamedDrops.has(d));

  // A DROP and a CREATE of the same thing is one object defined two ways.
  const created = new Set(liveCreates.map((c) => c.key));
  const dropped = new Set(liveDrops.map((d) => d.key));
  const restoring = liveCreates.filter((c) => !dropped.has(c.key));
  for (const d of liveDrops) {
    if (conflicted.has(d.key)) continue;
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
      .filter((key) => !/^(index|policy|trigger|constraint|rls)/.test(key))
      .map((key) => key.slice(key.indexOf(":") + 1)),
  );
  const tail: string[] = [];
  // Privileges on things that exist. pg-delta writes a difference as REVOKE ALL
  // followed by the GRANTs the record has, which says nothing about WHICH
  // privileges differ, so the statements are not trusted: what the schema
  // grants (the GRANTs) is compared with what the database grants. What the
  // database lacks is granted again (GRANT only adds); what it has beyond that
  // is a member's and is listed, never revoked.
  const regranted = new Set<string>();
  const grants = new Map<string, Set<string>>();
  const revokes = new Map<
    string,
    { p: Privilege; grantee: string; target: string; privs: Set<string> }
  >();
  const grantOf = (target: string, grantee: string) => {
    const key = `${target}|${grantee}`;
    const set = grants.get(key) ?? new Set<string>();
    grants.set(key, set);
    return set;
  };
  const expand = (p: Privilege, u: PrivUnit): string[] =>
    u.priv === "ALL"
      ? (ALL_PRIVILEGES[u.column ? "COLUMN" : p.kind] ?? [])
      : [u.priv];
  const granting: { p: Privilege; grantee: Privilege["grantees"][number] }[] =
    [];
  for (const p of privileges) {
    // Privileges on a column that is not being recreated (a likely rename).
    if (p.targets.length > 0 && p.targets.every((t) => skipped.has(t))) {
      continue;
    }
    const isNew =
      p.targets.length > 0 &&
      (newNames.has(p.base) || p.targets.every((t) => newNames.has(t)));
    if (isNew) {
      tail.push(p.sql);
      continue;
    }
    if (!p.object || p.grantees.length === 0 || p.units.length === 0) {
      // Not readable (a role grant, ...): a GRANT only adds, a REVOKE is not run.
      if (!p.revoke) {
        tail.push(p.sql);
        regranted.add(p.object ?? "privileges");
      } else {
        extras.push({
          object: p.object ?? "privileges",
          detail: "differ from what supabase/schemas grants",
        });
      }
      continue;
    }
    for (const grantee of p.grantees) {
      for (const u of p.units) {
        const target = u.column ? `${p.base}.${u.column}` : p.base;
        if (p.revoke) {
          const key = `${target}|${grantee.name}`;
          const entry = revokes.get(key) ?? {
            p,
            grantee: grantee.name,
            target,
            privs: new Set<string>(),
          };
          for (const priv of u.priv === "ALL" ? ["ALL"] : [u.priv]) {
            entry.privs.add(priv);
          }
          revokes.set(key, entry);
        } else {
          for (const priv of expand(p, u))
            grantOf(target, grantee.name).add(priv);
        }
      }
      if (!p.revoke) granting.push({ p, grantee });
    }
  }
  const liveOf = (target: string, grantee: string) =>
    livePrivileges
      ? (livePrivileges.get(target)?.get(grantee) ?? new Set<string>())
      : null;
  // What is missing: granted by the schema, not by the database.
  const written = new Set<string>();
  for (const { p, grantee } of granting) {
    const byPriv: string[] = [];
    const byColumn: string[] = [];
    for (const u of p.units) {
      const target = u.column ? `${p.base}.${u.column}` : p.base;
      const live = liveOf(target, grantee.name);
      for (const priv of expand(p, u)) {
        if (live?.has(priv)) continue;
        if (u.column) byColumn.push(`${priv} ("${u.column}")`);
        else byPriv.push(u.priv === "ALL" ? priv : u.priv);
      }
    }
    const missing = [...new Set(byPriv)];
    const statements = [
      ...(missing.length > 0
        ? [
            `GRANT ${missing.join(", ")} ${p.onText} TO ${grantee.raw}${p.option}`,
          ]
        : []),
      ...[...new Set(byColumn)].map(
        (c) => `GRANT ${c} ${p.onText} TO ${grantee.raw}${p.option}`,
      ),
    ];
    for (const statement of statements) {
      if (written.has(statement)) continue;
      written.add(statement);
      tail.push(statement);
      regranted.add(p.object!);
    }
  }
  // What is extra: revoked by the diff, and held by the database.
  for (const { p, grantee, target, privs } of revokes.values()) {
    const granted = grants.get(`${target}|${grantee}`) ?? new Set<string>();
    const live = liveOf(target, grantee);
    if (live === null) {
      // Without the database's privileges, a REVOKE the schema does not
      // grant back is taken to be a privilege beyond the schema.
      if (granted.size > 0) continue;
      extras.push({
        object: p.object!,
        detail: `granted to ${grantee} beyond (or instead of) what supabase/schemas grants`,
      });
      continue;
    }
    const revoked = privs.has("ALL") ? [...live] : [...privs];
    const beyond = revoked.filter(
      (priv) => live.has(priv) && !granted.has(priv),
    );
    if (beyond.length === 0) continue;
    const column =
      target === p.base ? "" : ` (column "${target.slice(p.base.length + 1)}")`;
    extras.push({
      object: p.object!,
      detail: `${beyond.sort().join(", ")}${column} granted to ${grantee} beyond what supabase/schemas grants`,
    });
  }

  const restore: string[] = [];
  const restored = [...restoring.map((c) => c.label), ...regranted];
  if (restoring.length > 0 || tail.length > 0) {
    restore.push(...preamble, ...restoring.map((c) => c.sql), ...tail);
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
    const afterName = action.slice(m[0].length).trim();
    const typeText = afterName.split(
      /\s+(?:DEFAULT|NOT\s+NULL|NULL|GENERATED|CONSTRAINT|REFERENCES|CHECK|COLLATE|UNIQUE|PRIMARY)\b/i,
    )[0]!;
    ctx.creates.push({
      key: `column:${t}.${parts(m[1]!)[0]}`,
      sql,
      label: `column ${shown(table)}.${shown(m[1]!)}`,
      column: {
        table: t,
        name: parts(m[1]!)[0]!,
        type: normalizeType(typeText),
      },
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
      column: { table: t, name: parts(m[1]!)[0]! },
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
