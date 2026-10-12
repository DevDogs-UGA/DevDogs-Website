/**
 * Decides whether a piece of SQL is destructive, for the database deploy's
 * destructive gate and the pull request check (Q10).
 *
 * "Destructive" means the SQL can lose or rewrite data, or break what a
 * deployed app depends on, and so needs a `devops` member in the loop:
 *
 *   - DROP TABLE, SCHEMA, COLUMN, SEQUENCE, EXTENSION, ROLE, DATABASE
 *   - DROP POLICY, FUNCTION, PROCEDURE, VIEW, MATERIALIZED VIEW, TYPE, DOMAIN
 *     UNLESS the same plan creates one of the same name again (a policy or
 *     function being rewritten is not a loss; a policy or view that vanishes
 *     is)
 *   - ALTER COLUMN ... TYPE (a type change)
 *   - RENAME of a table, column, schema, view, type, function or constraint's
 *     table: the generated diff never renames, so a rename is hand-written,
 *     and renames break callers
 *   - TRUNCATE, DELETE and UPDATE (data-moving statements), and an upsert
 *     (`INSERT ... ON CONFLICT ... DO UPDATE` overwrites rows like UPDATE), and
 *     `EXPLAIN ANALYZE` of a statement, which really runs it
 *   - DO blocks (their bodies are not inspected, so they are not trusted),
 *     except the one idiom that cannot lose data: a block whose only statement
 *     is `IF NOT EXISTS (SELECT ... FROM pg_roles ...) THEN CREATE ROLE ...`.
 *     For a SEED file (`inspectDoBlocks`) the body IS read: seeds are insert
 *     only, so a DO block passes unless its body updates, deletes, drops,
 *     alters, truncates, merges, upserts or runs dynamic SQL
 *
 * Everything else is additive or reversible: CREATE, ALTER ... ADD, GRANT,
 * REVOKE, DROP INDEX, DROP TRIGGER, DROP CONSTRAINT, DROP DEFAULT,
 * DROP NOT NULL, COMMENT, INSERT.
 *
 * The statements are split with a small tokenizer that understands comments,
 * quoted strings and identifiers, and dollar-quoted bodies, so a function body
 * that mentions `DROP` or `DELETE` is not a false positive. This is not a SQL
 * parser: anything it cannot classify is non-destructive, and the human
 * approval at the plan step is the backstop for the unusual.
 *
 * Usage:
 *   node .github/scripts/sql-classify.mjs <file.sql> [...]   # JSON on stdout,
 *   exit 3 when destructive (so a step can fail on it)
 */
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

/**
 * The scanner behind `splitStatements` and `splitRawStatements`: one pass over
 * the text, comments and literals understood.
 *
 * @param {string} sql
 * @returns {Array<{ text: string, raw: string, bodies: string[] }>}
 *   `text` is the statement with comments removed, string literals and
 *   dollar-quoted bodies replaced by a placeholder, and whitespace collapsed.
 *   `raw` is the original source of the statement, with its semicolon, so it
 *   can be run. `bodies` are the dollar-quoted bodies, in order.
 */
function scan(sql) {
  /** @type {Array<{ text: string, raw: string, bodies: string[] }>} */
  const statements = [];
  let current = "";
  /** @type {string[]} */
  let bodies = [];
  let startedAt = 0;
  let i = 0;
  const flush = (endAt) => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) {
      statements.push({
        text,
        raw: sql.slice(startedAt, endAt).trim(),
        bodies,
      });
    }
    current = "";
    bodies = [];
    startedAt = endAt;
  };
  /** Whether the character before `at` could be part of an identifier. */
  const afterIdentifier = (at) =>
    at > 0 && /[A-Za-z0-9_$\u0080-\uffff]/.test(sql[at - 1]);
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      // Block comments nest in PostgreSQL.
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else i += 1;
      }
      current += " ";
      continue;
    }
    if (ch === "'") {
      // An escape string (`E'...'`) also takes a backslash before a quote.
      const escapes =
        /^[eE]$/.test(sql[i - 1] ?? "") && !afterIdentifier(i - 1);
      i += 1;
      while (i < sql.length) {
        if (escapes && sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      i += 1;
      current += "''";
      continue;
    }
    if (ch === '"') {
      // Identifiers are kept (with their quotes) because names matter.
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') break;
        else i += 1;
      }
      i += 1;
      current += sql.slice(start, i);
      continue;
    }
    if (ch === "$" && !afterIdentifier(i)) {
      // A dollar quote opens at `$tag$`, where the tag is empty or an
      // identifier (digits allowed after the first character); `a$b$` is an
      // identifier, and `$1` is a parameter.
      const tag =
        /^\$(?:[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(
          sql.slice(i, i + 200),
        );
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        bodies.push(
          end === -1
            ? sql.slice(i + tag[0].length)
            : sql.slice(i + tag[0].length, end),
        );
        i = end === -1 ? sql.length : end + tag[0].length;
        current += "$$";
        continue;
      }
    }
    if (ch === ";") {
      i += 1;
      flush(i);
      continue;
    }
    current += ch;
    i += 1;
  }
  flush(sql.length);
  return statements;
}

/**
 * Splits SQL text into statements, with comments removed and string literals
 * and dollar-quoted bodies replaced by a placeholder, so keyword matching only
 * sees real SQL.
 *
 * @param {string} sql
 * @returns {string[]} Statements, whitespace collapsed, no trailing semicolon.
 */
export function splitStatements(sql) {
  return scan(sql).map((statement) => statement.text);
}

/**
 * Splits SQL text into runnable statements: the original text of each, comments
 * and all, with its semicolon. Function bodies, strings and comments that
 * contain a semicolon stay in one piece.
 *
 * @param {string} sql
 * @returns {string[]}
 */
export function splitRawStatements(sql) {
  return scan(sql).map((statement) => statement.raw);
}

/** Strips one optional `IF [NOT] EXISTS`, `ONLY`, `CONCURRENTLY`. */
const MODIFIERS = /\b(?:IF\s+(?:NOT\s+)?EXISTS|ONLY|CONCURRENTLY)\b/gi;

/**
 * @param {string} name A possibly-quoted, possibly-qualified name.
 */
function normalizeName(name) {
  return name.replace(/\s+/g, "").replace(/"/g, "").toLowerCase();
}

const NAME = String.raw`((?:"(?:[^"]|"")+"|[\w$]+)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[\w$]+))*)`;

/**
 * Objects that may be dropped without it counting as a loss when the same
 * plan creates the same name again.
 */
const REPLACEABLE = new Set([
  "POLICY",
  "FUNCTION",
  "PROCEDURE",
  "VIEW",
  "MATERIALIZED VIEW",
  "TYPE",
  "DOMAIN",
]);

/** Objects whose drop is always a loss. */
const ALWAYS = new Set([
  "OWNED",
  "TABLE",
  "SCHEMA",
  "SEQUENCE",
  "EXTENSION",
  "ROLE",
  "USER",
  "DATABASE",
  "FOREIGN TABLE",
]);

/**
 * Whether an ALTER TABLE has an action that drops a column. The actions are
 * split at top-level commas; one that starts with DROP and is not DROP
 * CONSTRAINT drops a column, with or without the COLUMN keyword. (The
 * ALTER COLUMN ... DROP DEFAULT / NOT NULL / IDENTITY forms do not start an
 * action, so they never match.)
 *
 * @param {string} statement An ALTER statement, modifiers stripped.
 */
function droppedColumn(statement) {
  const head = new RegExp(
    `^ALTER\\s+(?:FOREIGN\\s+)?TABLE\\s+${NAME}\\s*`,
    "i",
  ).exec(statement);
  if (!head) return false;
  const body = statement.slice(head[0].length);
  /** @type {string[]} */
  const actions = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) {
      actions.push(body.slice(start, i));
      start = i + 1;
    }
  }
  actions.push(body.slice(start));
  return actions.some((action) => {
    const a = action.trim();
    return /^DROP\b/i.test(a) && !/^DROP\s+CONSTRAINT\b/i.test(a);
  });
}

/**
 * @typedef {{ kind: string, statement: string }} Reason
 * @typedef {{ destructive: boolean, reasons: Reason[], statements: number }} Classification
 */

/**
 * The guarded role creation, the one DO block that cannot lose data. Roles are
 * cluster objects the declarative tree cannot hold, so a migration creates
 * them, and `CREATE ROLE` has no IF NOT EXISTS, hence the idiom. The body, with
 * comments and strings removed, joined by semicolons, must be exactly this.
 */
const GUARDED_CREATE_ROLE =
  /^(?:begin )?if not exists ?\( ?select (?:(?:1|\*) )?from (?:pg_catalog\.)?pg_(?:roles|authid|user) where (?:rolname|usename) ?= ?'' ?\) then create role [^;]*; ?end if; ?end;?$/i;

/** @param {string} body A DO block's dollar-quoted body. */
function isGuardedCreateRole(body) {
  const text = scan(body)
    .map((statement) => statement.text)
    .join("; ");
  return GUARDED_CREATE_ROLE.test(text);
}

/**
 * What a DO block's body does that a seed may not. Seeds are insert only, so
 * the body is read for the statements that are not: update, delete, truncate,
 * drop, alter, merge, an upsert's DO UPDATE, and dynamic SQL (`EXECUTE`), whose
 * text cannot be read.
 *
 * @param {string} body
 * @returns {string[]} The kinds found; empty when the body is insert only.
 */
function seedBodyReasons(body) {
  const text = scan(body)
    .map((statement) => statement.text)
    .join("; ");
  /** @type {Array<[string, RegExp]>} */
  const rules = [
    ["DELETE", /\bDELETE\s+FROM\b/i],
    [
      "UPDATE",
      new RegExp(
        `\\bUPDATE\\s+(?:ONLY\\s+)?${NAME}(?:\\s+(?:AS\\s+)?\\w+)?\\s+SET\\b`,
        "i",
      ),
    ],
    ["UPSERT", /\bON\s+CONFLICT\b[^;]*?\bDO\s+UPDATE\b/i],
    ["TRUNCATE", /\bTRUNCATE\b/i],
    ["DROP", /\bDROP\b/i],
    ["ALTER", /\bALTER\b/i],
    ["MERGE", /\bMERGE\b/i],
    ["EXECUTE (dynamic SQL)", /\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE)\b)/i],
  ];
  return rules
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

/**
 * @param {string} sql
 * @param {{ inspectDoBlocks?: boolean }} [options]  `inspectDoBlocks` is for
 *   seed files: a DO block is read, not distrusted (see the header).
 * @returns {Classification}
 */
export function classifySql(sql, { inspectDoBlocks = false } = {}) {
  const scanned = scan(sql);
  const statements = scanned.map((statement) => statement.text);
  /** @type {Reason[]} */
  const reasons = [];
  /** @type {Array<{ kind: string, name: string, statement: string }>} */
  const replaceableDrops = [];
  /** @type {Set<string>} */
  const created = new Set();

  const note = (kind, statement) =>
    reasons.push({ kind, statement: statement.slice(0, 160) });

  for (const [index, raw] of statements.entries()) {
    const bodies = scanned[index].bodies;
    const statement = raw.replace(MODIFIERS, " ").replace(/\s+/g, " ").trim();
    const upper = statement.toUpperCase();

    // CREATE [OR REPLACE] <object> <name>: remember the names, so a drop that
    // is re-created below it is not a loss. A policy is named per table.
    const create =
      /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED|RECURSIVE|CONSTRAINT|UNIQUE)\s+)*(POLICY|FUNCTION|PROCEDURE|VIEW|MATERIALIZED\s+VIEW|TYPE|DOMAIN)\s+/i.exec(
        statement,
      );
    if (create) {
      const object = create[1].toUpperCase().replace(/\s+/g, " ");
      const rest = statement.slice(create[0].length);
      if (object === "POLICY") {
        const policy = new RegExp(`^${NAME}\\s+ON\\s+${NAME}`, "i").exec(rest);
        if (policy) {
          created.add(
            `POLICY ${normalizeName(policy[1])} ON ${normalizeName(policy[2])}`,
          );
        }
      } else {
        const named = new RegExp(`^${NAME}`, "i").exec(rest);
        if (named) created.add(`${object} ${normalizeName(named[1])}`);
      }
      continue;
    }

    const drop =
      /^DROP\s+(MATERIALIZED\s+VIEW|FOREIGN\s+TABLE|[A-Z]+)\s+/i.exec(
        statement,
      );
    if (drop) {
      const object = drop[1].toUpperCase().replace(/\s+/g, " ");
      const rest = statement.slice(drop[0].length);
      if (ALWAYS.has(object)) {
        note(`DROP ${object}`, statement);
      } else if (/\bCASCADE\s*$/i.test(statement)) {
        // CASCADE also drops everything that depends on the object (a type's
        // columns, a view's dependents), so it is never a plain rewrite.
        note(`DROP ${object} CASCADE`, statement);
      } else if (REPLACEABLE.has(object)) {
        if (object === "POLICY") {
          const policy = new RegExp(`^${NAME}\\s+ON\\s+${NAME}`, "i").exec(
            rest,
          );
          if (policy) {
            replaceableDrops.push({
              kind: "DROP POLICY",
              name: `POLICY ${normalizeName(policy[1])} ON ${normalizeName(policy[2])}`,
              statement,
            });
            continue;
          }
        }
        const named = new RegExp(`^${NAME}`, "i").exec(rest);
        replaceableDrops.push({
          kind: `DROP ${object}`,
          name: named ? `${object} ${normalizeName(named[1])}` : object,
          statement,
        });
      }
      // DROP INDEX, TRIGGER, RULE, ... and the rest: not destructive.
      continue;
    }

    if (/^ALTER\s+/i.test(statement)) {
      // Every comma-separated action of an ALTER TABLE counts, and the COLUMN
      // keyword is optional: `ALTER TABLE t DROP c` drops a column.
      if (droppedColumn(statement)) {
        note("DROP COLUMN", statement);
      }
      if (
        /^ALTER\s+TYPE\b/i.test(statement) &&
        /\bDROP\s+ATTRIBUTE\b/i.test(statement)
      ) {
        note("DROP ATTRIBUTE", statement);
      }
      if (
        /^ALTER\s+(?:FOREIGN\s+)?TABLE\b/i.test(statement) &&
        /\bALTER\s+(?:COLUMN\s+)?(?:"(?:[^"]|"")+"|\w+)\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(
          statement,
        )
      ) {
        note("ALTER COLUMN TYPE", statement);
      }
      if (
        /^ALTER\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|SCHEMA|TYPE|DOMAIN|FUNCTION|PROCEDURE|SEQUENCE)\b/i.test(
          statement,
        ) &&
        /\bRENAME\b/i.test(statement) &&
        !/\bRENAME\s+CONSTRAINT\b/i.test(statement)
      ) {
        note("RENAME", statement);
      }
      continue;
    }

    // `EXPLAIN ANALYZE <statement>` runs the statement: classify what follows.
    const explained =
      /^EXPLAIN\s+(?:\((?:[^)]*)\)\s*|ANALYZE\s+|VERBOSE\s+)*(?=(?:DELETE|UPDATE|TRUNCATE|INSERT|MERGE|WITH)\b)/i.exec(
        statement,
      );
    if (
      explained &&
      /\bANALYZE\b/i.test(
        explained[0].replace(/\bANALYZE\s+(?:false|off|0)\b/i, ""),
      )
    ) {
      const inner = classifySql(statement.slice(explained[0].length), {
        inspectDoBlocks,
      });
      for (const reason of inner.reasons) {
        note(`EXPLAIN ANALYZE of ${reason.kind}`, statement);
      }
      continue;
    }

    if (/^TRUNCATE\b/i.test(statement)) note("TRUNCATE", statement);
    else if (/^DELETE\s+FROM\b/i.test(statement)) note("DELETE", statement);
    else if (/^UPDATE\b/i.test(statement)) note("UPDATE", statement);
    else if (
      /^INSERT\b/i.test(statement) &&
      /\bON\s+CONFLICT\b.*?\bDO\s+UPDATE\b/i.test(statement)
    ) {
      // An upsert overwrites the rows it conflicts with, exactly as UPDATE does.
      note("UPSERT (ON CONFLICT DO UPDATE)", statement);
    } else if (
      /^WITH\b/i.test(statement) &&
      /\b(?:DELETE\s+FROM|UPDATE\s+\S+(?:\s+(?:AS\s+)?\w+)?\s+SET)\b/i.test(
        statement,
      )
    ) {
      // A data-modifying CTE: `WITH d AS (DELETE FROM t RETURNING *) ...`.
      note("DELETE or UPDATE in a WITH query", statement);
    } else if (
      /^MERGE\b/i.test(statement) &&
      /\bTHEN\s+(?:DELETE|UPDATE)\b/i.test(statement)
    ) {
      note("MERGE", statement);
    } else if (/^CALL\b/i.test(statement)) {
      // A procedure's body is not inspected, like a DO block's.
      note("CALL", statement);
    } else if (/^DO\b/i.test(upper) && /\$\$|^DO\s+''/.test(statement)) {
      if (inspectDoBlocks && bodies.length === 1) {
        for (const kind of seedBodyReasons(bodies[0])) {
          note(`DO block: ${kind}`, statement);
        }
      } else if (!(bodies.length === 1 && isGuardedCreateRole(bodies[0]))) {
        note("DO block", statement);
      }
    }
  }

  for (const drop of replaceableDrops) {
    if (!created.has(drop.name)) note(drop.kind, drop.statement);
  }

  return {
    destructive: reasons.length > 0,
    reasons,
    statements: statements.length,
  };
}

/** Markdown for a job summary: the reasons, one per line, or a clear line. */
export function renderClassification(classification) {
  if (!classification.destructive) {
    return "No destructive statements.";
  }
  return [
    `**Destructive: ${classification.reasons.length} statement(s).**`,
    "",
    ...classification.reasons.map(
      (r) => `- \`${r.kind}\`: \`${r.statement.replace(/`/g, "'")}\``,
    ),
  ].join("\n");
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write("usage: sql-classify.mjs <file.sql> [...]\n");
    process.exit(2);
  }
  const results = files.map((file) => ({
    file,
    ...classifySql(readFileSync(file, "utf8")),
  }));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  process.exit(results.some((r) => r.destructive) ? 3 : 0);
}
/* c8 ignore stop */
