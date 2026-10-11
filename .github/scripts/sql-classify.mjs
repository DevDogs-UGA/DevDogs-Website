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
 *   - TRUNCATE, DELETE and UPDATE (data-moving statements)
 *   - DO blocks (their bodies are not inspected, so they are not trusted)
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
 * Splits SQL text into statements, with comments removed and string literals
 * and dollar-quoted bodies replaced by a placeholder, so keyword matching only
 * sees real SQL.
 *
 * @param {string} sql
 * @returns {string[]} Statements, whitespace collapsed, no trailing semicolon.
 */
export function splitStatements(sql) {
  /** @type {string[]} */
  const statements = [];
  let current = "";
  let i = 0;
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) statements.push(text);
    current = "";
  };
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
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
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
    if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? sql.length : end + tag[0].length;
        current += "$$";
        continue;
      }
    }
    if (ch === ";") {
      flush();
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  flush();
  return statements;
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
 * @typedef {{ kind: string, statement: string }} Reason
 * @typedef {{ destructive: boolean, reasons: Reason[], statements: number }} Classification
 */

/**
 * @param {string} sql
 * @returns {Classification}
 */
export function classifySql(sql) {
  const statements = splitStatements(sql);
  /** @type {Reason[]} */
  const reasons = [];
  /** @type {Array<{ kind: string, name: string, statement: string }>} */
  const replaceableDrops = [];
  /** @type {Set<string>} */
  const created = new Set();

  const note = (kind, statement) =>
    reasons.push({ kind, statement: statement.slice(0, 160) });

  for (const raw of statements) {
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
      // Every comma-separated action of an ALTER TABLE counts.
      if (/\bDROP\s+COLUMN\b/i.test(statement)) {
        note("DROP COLUMN", statement);
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

    if (/^TRUNCATE\b/i.test(statement)) note("TRUNCATE", statement);
    else if (/^DELETE\s+FROM\b/i.test(statement)) note("DELETE", statement);
    else if (/^UPDATE\b/i.test(statement)) note("UPDATE", statement);
    else if (/^DO\b/i.test(upper) && /\$\$|^DO\s+''/.test(statement)) {
      note("DO block", statement);
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
