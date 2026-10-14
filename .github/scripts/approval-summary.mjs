/**
 * The one production approval's summary: everything the deploy will do, on
 * one page, BEFORE the reviewer is asked. Destructive statements come first.
 *
 * Reads the plan files the plan phase uploaded (`plan-migrations`,
 * `plan-schema`, downloaded into one directory) and prints markdown.
 *
 * Usage:
 *   node approval-summary.mjs --plan-dir DIR --sha SHA --repo OWNER/REPO [--notes TEXT]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "./is-main.mjs";

/** @param {string} path */
const readJson = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
/** @param {string} path */
const readText = (path) =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

/**
 * @param {{
 *   sha: string,
 *   repo?: string,
 *   migrations?: any,
 *   schema?: any,
 *   schemaSql?: string,
 *   approval?: { pr: number, actor: string } | undefined,
 *   notes?: string,
 * }} input
 */
export function renderApprovalSummary({
  sha,
  repo,
  migrations,
  schema,
  schemaSql,
  approval,
  notes,
}) {
  /** @type {string[]} */
  const out = [];
  out.push("## Production deploy: one approval covers all of this", "");
  out.push(
    `Commit \`${sha}\`${repo ? ` ([view](https://github.com/${repo}/commit/${sha}))` : ""}. ` +
      "Approving runs the migrations, the schema and configuration, the seeds, " +
      "and every Worker and function below, in order, with no further pauses. " +
      "Rejecting changes nothing.",
    "",
  );

  /** @type {Array<{ source: string, kind: string, statement: string }>} */
  const destructive = [
    ...(migrations?.classified ?? []).flatMap((/** @type {any} */ c) =>
      (c.reasons ?? []).map((/** @type {any} */ r) => ({
        source: c.file,
        kind: r.kind,
        statement: r.statement,
      })),
    ),
    ...(schema?.classification?.reasons ?? []).map((/** @type {any} */ r) => ({
      source: "schema diff",
      kind: r.kind,
      statement: r.statement,
    })),
  ];
  if (destructive.length > 0) {
    out.push("### DESTRUCTIVE statements", "");
    out.push(
      approval
        ? `Approved on the pull request: [#${approval.pr}](https://github.com/${repo}/pull/${approval.pr}), \`allow-destructive\` applied by @${approval.actor}. The statements below match the plan that pull request showed.`
        : "No pull request approval is on record for these.",
      "",
    );
    for (const d of destructive) {
      out.push(
        `- **${d.kind}** in ${d.source}: \`${String(d.statement).replace(/\s+/g, " ").trim()}\``,
      );
    }
    out.push("");
  } else {
    out.push("No destructive statements.", "");
  }

  const pending = [
    ...(migrations?.migrations ?? []).map((m) => `migration \`${m}\``),
    ...(migrations?.seeds ?? []).map((s) => `seed \`${s}\``),
    ...(migrations?.roles ?? []).map((r) => `roles \`${r}\``),
  ];
  out.push("### Pending migrations and seeds", "");
  out.push(
    pending.length === 0 ? "None." : pending.map((p) => `- ${p}`).join("\n"),
    "",
  );

  out.push("### Schema change (declarative diff)", "");
  if (migrations && pending.length > 0) {
    out.push(
      "Migrations are pending, so the diff is computed after they are applied and is not known yet. It is the commit's schema tree against the real database, checked on the pull request; a destructive result is refused unless that pull request approved it.",
      "",
    );
  } else if (!schema || !schemaSql || schemaSql.trim() === "") {
    out.push(
      "The database already matches the schema tree: nothing to apply.",
      "",
    );
  } else {
    out.push(
      `Plan hash: \`${schema.hash}\`. The apply refuses if the SQL it regenerates has another hash.`,
      "",
      "```sql",
      schemaSql.trimEnd(),
      "```",
      "",
    );
  }

  out.push("### Workers, functions and configuration", "");
  out.push(notes && notes.trim() !== "" ? notes.trim() : "(none listed)", "");
  return out.join("\n");
}

/** @param {string[]} argv @param {string} name */
const flag = (argv, name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

function main() {
  const argv = process.argv.slice(2);
  const dir = flag(argv, "--plan-dir");
  const sha = flag(argv, "--sha");
  if (!dir || !sha) {
    console.error(
      "usage: approval-summary.mjs --plan-dir DIR --sha SHA [--repo OWNER/REPO] [--notes TEXT]",
    );
    process.exit(2);
  }
  // The two plan artifacts are downloaded side by side: each in its own
  // subdirectory, or merged into one. Look in both places.
  /** @param {string} name */
  const find = (name) =>
    [
      join(dir, name),
      ...["plan-migrations", "plan-schema"].map((d) => join(dir, d, name)),
    ].find(existsSync) ?? join(dir, name);
  process.stdout.write(
    renderApprovalSummary({
      sha,
      repo: flag(argv, "--repo"),
      migrations: readJson(find("migrations-plan.json")),
      schema: readJson(find("schema-plan.json")),
      schemaSql: readText(find("schema-plan.sql")),
      approval: readJson(find("destructive-approval.json")),
      notes: flag(argv, "--notes"),
    }) + "\n",
  );
}

if (isMain(import.meta.url)) main();
