/**
 * Plan and apply a database change: the engine of `deploy-database.yaml`.
 *
 * A deploy changes a database in two steps, each with its own plan, its own
 * approval and its own hash (Q9, Q10):
 *
 *   1. HAND-WRITTEN MIGRATIONS (`supabase/migrations/`, plus new seed files
 *      when `--include-seed`): `migrations-plan` lists what the target has not
 *      recorded, `migrations-apply` runs `supabase db push`. These are where
 *      destructive and data-moving changes live.
 *   2. THE DECLARATIVE DIFF (`supabase/schemas/`): `schema-plan` regenerates
 *      the SQL that turns the TARGET's current schema into the schema tree, and
 *      `schema-apply` regenerates it again, refuses if its hash is not the
 *      approved one, and applies it in one transaction. Generated SQL is never
 *      committed, so it is always computed against the database it will run on.
 *
 * How the diff is made. A scratch Postgres (the Supabase image, through
 * `supabase db start`, on ports of its own) is brought to the tree's state:
 * the committed migrations first, then `supabase db schema declarative sync
 * --apply` for whatever the tree adds on top. Then `supabase db diff --from
 * <target> --to <scratch> --use-pg-delta` writes the SQL. Only the schemas the
 * tree declares are compared (cluster-level objects such as roles are not
 * managed by this flow: change them in a hand-written migration).
 *
 * Plan and apply run on different runners. The hash is over the normalized SQL
 * alone; if the target moved between plan and apply, or the diff is not
 * reproducible, the hashes differ and nothing is applied.
 *
 * Environment:
 *   DB_URL          the target (a percent-encoded Postgres URL). Required.
 *   SUPABASE_BIN    the CLI to run; default `supabase`.
 *   PLAN_DIR        where plan files are written; default `./db-plan`.
 *   GITHUB_OUTPUT   step outputs are appended here when set.
 *   GITHUB_STEP_SUMMARY  the markdown summary is appended here when set.
 *   DESTRUCTIVE_APPROVED  `true` lets `schema-apply` run a destructive plan
 *                   (set only by the job behind the destructive gate).
 *
 * Usage:
 *   node db-plan.mjs migrations-plan [--include-seed]
 *   node db-plan.mjs migrations-apply [--include-seed] --expect-hash HASH
 *   node db-plan.mjs schema-plan
 *   node db-plan.mjs schema-apply --expect-hash HASH
 *   node db-plan.mjs check [--base SHA]   # the PR check: no target, see `check`
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isMain } from "./is-main.mjs";
import { classifySql, renderClassification } from "./sql-classify.mjs";

/** The password of the scratch database `supabase db start` creates. */
const LOCAL_PASSWORD = "postgres";

/**
 * Line endings and trailing whitespace do not change SQL, so they must not
 * change its hash.
 *
 * @param {string} sql
 */
export function normalizeSql(sql) {
  const lines = sql
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  return `${lines.join("\n").trim()}\n`;
}

/** @param {string} sql */
export function planHash(sql) {
  const normalized = normalizeSql(sql);
  if (normalized.trim() === "") return "empty";
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * The schemas the tree declares: the directories of `supabase/schemas/` that
 * are not underscore-prefixed (`_cluster` holds roles and extensions, which
 * the diff does not manage).
 *
 * @param {string} schemasDir
 * @returns {string[]}
 */
export function managedSchemas(schemasDir) {
  if (!existsSync(schemasDir)) return [];
  return readdirSync(schemasDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

/**
 * A copy of `config.toml` that cannot collide with a stack the machine
 * already runs: its own project id, every port moved, seeds off. Only the
 * database is started from it.
 *
 * @param {string} toml
 * @param {{ projectId: string, portBase: number }} options
 */
export function rewriteConfig(toml, { projectId, portBase }) {
  let offset = 0;
  const lines = toml.split("\n").map((line) => {
    if (/^project_id\s*=/.test(line)) return `project_id = "${projectId}"`;
    if (/^(shadow_)?port\s*=\s*\d+/.test(line)) {
      offset += 1;
      return line.replace(/\d+/, String(portBase + offset));
    }
    return line;
  });
  const text = lines.join("\n");
  // [db.seed] enabled = true -> false (seeds are not part of the schema).
  return text.replace(/(\[db\.seed\][^\[]*?enabled\s*=\s*)true/, "$1false");
}

/**
 * The first top-level `port = N` under `[db]`, i.e. the one the scratch
 * database listens on after `rewriteConfig`.
 *
 * @param {string} toml
 */
export function dbPort(toml) {
  const match = /\[db\][^\[]*?\bport\s*=\s*(\d+)/.exec(toml);
  if (!match) throw new Error("config.toml has no [db] port");
  return Number(match[1]);
}

/**
 * @param {string} stdout  `supabase db push --output-format json` output,
 *   which may carry log lines around one JSON object.
 */
export function parsePushJson(stdout) {
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .at(-1);
  if (!line) throw new Error(`no JSON in db push output:\n${stdout}`);
  const json = JSON.parse(line);
  const names = (list) =>
    (Array.isArray(list) ? list : []).map((entry) =>
      typeof entry === "string"
        ? entry
        : (entry?.name ?? entry?.path ?? JSON.stringify(entry)),
    );
  return {
    migrations: names(json.migrations),
    seeds: names(json.seeds),
    roles: names(json.roles),
    upToDate: Boolean(json.upToDate),
  };
}

/**
 * @param {string} stdout  `supabase db diff --output-format json` output.
 * @returns {{ diff: string, dropStatements: string[] }}
 */
export function parseDiffJson(stdout) {
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"))
    .at(-1);
  if (!line) throw new Error(`no JSON in db diff output:\n${stdout}`);
  const json = JSON.parse(line);
  if (typeof json.diff !== "string") {
    throw new Error(`db diff reported no diff text: ${line.slice(0, 300)}`);
  }
  return {
    diff: json.diff,
    dropStatements: Array.isArray(json.dropStatements)
      ? json.dropStatements
      : [],
  };
}

/**
 * @typedef {{
 *   cli: string,
 *   env: NodeJS.ProcessEnv,
 *   run: (cmd: string, args: string[], opts?: { cwd?: string, input?: string, env?: NodeJS.ProcessEnv, allowFail?: boolean }) => { status: number, stdout: string, stderr: string },
 *   log: (line: string) => void,
 * }} Runtime
 */

/** @returns {Runtime} */
export function defaultRuntime(env = process.env) {
  return {
    cli: env.SUPABASE_BIN || "supabase",
    env,
    log: (line) => process.stderr.write(`${line}\n`),
    run(cmd, args, opts = {}) {
      const result = spawnSync(cmd, args, {
        cwd: opts.cwd,
        input: opts.input,
        env: opts.env ?? env,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });
      if (result.error) throw result.error;
      const status = result.status ?? 1;
      if (status !== 0 && !opts.allowFail) {
        throw new Error(
          `${cmd} ${args.join(" ")} failed (exit ${status}):\n${(result.stderr || result.stdout).slice(-4000)}`,
        );
      }
      return { status, stdout: result.stdout, stderr: result.stderr };
    },
  };
}

/**
 * Builds the scratch database at the tree's state and returns its URL and a
 * teardown. The migrations are applied first (they are the baseline), then
 * `declarative sync --apply` adds whatever the tree declares beyond them.
 *
 * @param {Runtime} rt
 * @param {{ repoRoot: string, scratch: string }} options
 * @returns {{ url: string, treeMigration: string | null, teardown: () => void }}
 */
export function buildDesired(rt, { repoRoot, scratch }) {
  const source = join(repoRoot, "supabase");
  if (!existsSync(join(source, "config.toml"))) {
    throw new Error(
      `${source}/config.toml not found: run from a repository with a supabase/ directory`,
    );
  }
  const workdir = join(scratch, "desired");
  const target = join(workdir, "supabase");
  mkdirSync(target, { recursive: true });
  for (const entry of ["migrations", "schemas"]) {
    if (existsSync(join(source, entry))) {
      cpSync(join(source, entry), join(target, entry), { recursive: true });
    }
  }
  mkdirSync(join(target, "migrations"), { recursive: true });
  // A port block per run: parallel jobs on one machine do not collide.
  const portBase =
    Number(rt.env.DB_PLAN_PORT_BASE) || 56000 + (process.pid % 400) * 20;
  const projectId = `dbplan${process.pid}`;
  const config = rewriteConfig(
    readFileSync(join(source, "config.toml"), "utf8"),
    {
      projectId,
      portBase,
    },
  );
  writeFileSync(join(target, "config.toml"), config);
  const port = dbPort(config);

  const teardown = () => {
    rt.run(rt.cli, ["stop", "--no-backup", "--project-id", projectId], {
      cwd: workdir,
      allowFail: true,
    });
    rmSync(workdir, { recursive: true, force: true });
  };

  try {
    rt.log("db-plan: starting the scratch database");
    rt.run(rt.cli, ["db", "start"], { cwd: workdir });
    const before = new Set(readdirSync(join(target, "migrations")));
    if (before.size > 0) {
      rt.log(`db-plan: applying ${before.size} committed migration(s)`);
      rt.run(rt.cli, ["db", "reset", "--local", "--no-seed", "--yes"], {
        cwd: workdir,
      });
    }
    rt.log("db-plan: applying the schema tree on top");
    rt.run(
      rt.cli,
      [
        "db",
        "schema",
        "declarative",
        "sync",
        "--apply",
        "--strict-coverage",
        "--name",
        "tree",
      ],
      { cwd: workdir },
    );
    const added = readdirSync(join(target, "migrations")).filter(
      (f) => !before.has(f),
    );
    return {
      url: `postgresql://postgres:${LOCAL_PASSWORD}@127.0.0.1:${port}/postgres?sslmode=disable`,
      treeMigration:
        added.length > 0
          ? readFileSync(join(target, "migrations", added[0]), "utf8")
          : null,
      teardown,
    };
  } catch (error) {
    teardown();
    throw error;
  }
}

/**
 * Regenerates the diff from `targetUrl` to the tree.
 *
 * @param {Runtime} rt
 * @param {{ repoRoot: string, targetUrl: string }} options
 */
export function generateSchemaPlan(rt, { repoRoot, targetUrl }) {
  const schemas = managedSchemas(join(repoRoot, "supabase", "schemas"));
  if (schemas.length === 0) {
    throw new Error(
      "supabase/schemas has no schema directories: nothing to plan",
    );
  }
  const scratch = mkdtempSync(join(tmpdir(), "db-plan-"));
  const desired = buildDesired(rt, { repoRoot, scratch });
  try {
    rt.log(`db-plan: diffing ${schemas.join(", ")}`);
    const result = rt.run(
      rt.cli,
      [
        "db",
        "diff",
        "--from",
        targetUrl,
        "--to",
        desired.url,
        "--use-pg-delta",
        "--schema",
        schemas.join(","),
        "--output-format",
        "json",
      ],
      { cwd: repoRoot },
    );
    const { diff, dropStatements } = parseDiffJson(result.stdout);
    const sql = diff.trim() === "" ? "" : normalizeSql(diff);
    return {
      sql,
      hash: planHash(sql),
      schemas,
      dropStatements,
      classification: classifySql(sql),
    };
  } finally {
    desired.teardown();
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * @param {Runtime} rt
 * @param {{ targetUrl: string, includeSeed: boolean }} options
 */
export function generateMigrationsPlan(rt, { targetUrl, includeSeed }) {
  const args = [
    "db",
    "push",
    "--db-url",
    targetUrl,
    "--dry-run",
    "--output-format",
    "json",
  ];
  if (includeSeed) args.push("--include-seed");
  const result = rt.run(rt.cli, args);
  const push = parsePushJson(result.stdout);
  return {
    ...push,
    hash: planHash(JSON.stringify([push.migrations, push.seeds, push.roles])),
  };
}

/**
 * Hand-written migrations that are pending, read for the destructive check.
 *
 * @param {string} repoRoot
 * @param {string[]} pending  File names or versions from the push dry run.
 */
export function classifyPendingMigrations(repoRoot, pending) {
  const dir = join(repoRoot, "supabase", "migrations");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  /** @type {Array<{ file: string, destructive: boolean, reasons: import("./sql-classify.mjs").Reason[] }>} */
  const out = [];
  for (const entry of pending) {
    const version = String(entry).match(/\d{8,}/)?.[0];
    const file =
      files.find((f) => version && f.startsWith(`${version}_`)) ??
      files.find((f) => f === entry);
    if (!file) continue;
    const classification = classifySql(readFileSync(join(dir, file), "utf8"));
    out.push({
      file,
      destructive: classification.destructive,
      reasons: classification.reasons,
    });
  }
  return out;
}

/**
 * The hand-written migrations a pull request adds or edits, read for the
 * destructive check. The declarative tree is compared with the committed
 * migrations, so a destructive statement written as a migration never shows up
 * in that diff: it has to be read from the files themselves.
 *
 * @param {Runtime} rt
 * @param {string} repoRoot
 * @param {string} base  The commit the change is compared with.
 */
export function changedMigrations(rt, repoRoot, base) {
  const result = rt.run(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=AM",
      `${base}...HEAD`,
      "--",
      "supabase/migrations",
    ],
    { cwd: repoRoot },
  );
  /** @type {Array<{ file: string, destructive: boolean, reasons: import("./sql-classify.mjs").Reason[] }>} */
  const out = [];
  for (const file of result.stdout.split("\n").filter(Boolean)) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    const classification = classifySql(readFileSync(path, "utf8"));
    out.push({
      file,
      destructive: classification.destructive,
      reasons: classification.reasons,
    });
  }
  return out;
}

/* ---------- reporting ---------- */

/**
 * @param {Record<string, string>} values
 * @param {NodeJS.ProcessEnv} env
 */
export function setOutputs(values, env = process.env) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(
    env.GITHUB_OUTPUT,
    `${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
  );
}

/** @param {string} markdown @param {NodeJS.ProcessEnv} env */
export function summarize(markdown, env = process.env) {
  process.stderr.write(`${markdown}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

/** The most SQL a job summary carries; the full file is an artifact. */
const SUMMARY_SQL_LIMIT = 60_000;

/**
 * @param {{ title: string, sql: string, hash: string, classification: ReturnType<typeof classifySql>, schemas?: string[] }} plan
 */
export function renderSchemaPlan({
  title,
  sql,
  hash,
  classification,
  schemas = [],
}) {
  const shown =
    sql.length > SUMMARY_SQL_LIMIT
      ? `${sql.slice(0, SUMMARY_SQL_LIMIT)}\n-- ... truncated, see the db-plan artifact`
      : sql;
  return [
    `### ${title}`,
    "",
    sql === ""
      ? "The target already matches the schema tree: nothing to apply."
      : [
          `Plan hash: \`${hash}\``,
          "",
          `Schemas compared: ${schemas.join(", ")}`,
          "",
          renderClassification(classification),
          "",
          "<details open><summary>The SQL that will run, in one transaction</summary>",
          "",
          "```sql",
          shown.trimEnd(),
          "```",
          "",
          "</details>",
        ].join("\n"),
  ].join("\n");
}

/* ---------- commands ---------- */

/** @param {string[]} argv @param {string} flag */
function flagValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

/**
 * @param {string[]} argv
 * @param {Runtime} rt
 * @param {{ repoRoot?: string }} [options]
 * @returns {number} exit code
 */
export function main(
  argv,
  rt = defaultRuntime(),
  { repoRoot = process.cwd() } = {},
) {
  const [command, ...rest] = argv;
  const env = rt.env;
  const planDir = resolve(env.PLAN_DIR || "db-plan");
  mkdirSync(planDir, { recursive: true });
  const targetUrl = env.DB_URL;
  const need = () => {
    if (!targetUrl)
      throw new Error("DB_URL is not set: refusing to plan against nothing.");
    return targetUrl;
  };
  const includeSeed = rest.includes("--include-seed");
  const expect = flagValue(rest, "--expect-hash");

  if (command === "migrations-plan") {
    const plan = generateMigrationsPlan(rt, { targetUrl: need(), includeSeed });
    const classified = classifyPendingMigrations(repoRoot, plan.migrations);
    const destructive = classified.some((c) => c.destructive);
    const pending =
      plan.migrations.length + plan.seeds.length + plan.roles.length;
    writeFileSync(
      join(planDir, "migrations-plan.json"),
      `${JSON.stringify({ ...plan, classified }, null, 2)}\n`,
    );
    summarize(
      [
        "### Hand-written migrations",
        "",
        pending === 0
          ? "None pending: the target has recorded every migration in this commit."
          : [
              `Plan hash: \`${plan.hash}\``,
              "",
              ...plan.migrations.map((m) => `- migration \`${m}\``),
              ...plan.seeds.map((s) => `- seed \`${s}\``),
              ...plan.roles.map((r) => `- roles \`${r}\``),
              "",
              destructive
                ? `**Destructive:**\n${classified
                    .filter((c) => c.destructive)
                    .flatMap((c) =>
                      c.reasons.map((r) => `- \`${c.file}\`: \`${r.kind}\``),
                    )
                    .join("\n")}`
                : "No destructive statements.",
            ].join("\n"),
      ].join("\n"),
      env,
    );
    setOutputs(
      {
        pending: String(pending),
        hash: plan.hash,
        destructive: String(destructive),
      },
      env,
    );
    return 0;
  }

  if (command === "migrations-apply") {
    const url = need();
    const plan = generateMigrationsPlan(rt, { targetUrl: url, includeSeed });
    if (expect && plan.hash !== expect) {
      rt.log(
        `db-plan: the migrations changed since they were approved (approved ${expect}, now ${plan.hash}). Nothing was applied.`,
      );
      return 1;
    }
    const classified = classifyPendingMigrations(repoRoot, plan.migrations);
    if (
      classified.some((c) => c.destructive) &&
      env.DESTRUCTIVE_APPROVED !== "true"
    ) {
      rt.log(
        "db-plan: a pending migration is destructive and this job is not behind the destructive gate. Nothing was applied.",
      );
      return 1;
    }
    const args = ["db", "push", "--db-url", url, "--yes"];
    if (includeSeed) args.push("--include-seed");
    rt.run(rt.cli, args);
    summarize("### Hand-written migrations\n\nApplied.", env);
    return 0;
  }

  if (command === "schema-plan") {
    const plan = generateSchemaPlan(rt, { repoRoot, targetUrl: need() });
    writeFileSync(join(planDir, "schema-plan.sql"), plan.sql);
    writeFileSync(
      join(planDir, "schema-plan.json"),
      `${JSON.stringify({ hash: plan.hash, schemas: plan.schemas, classification: plan.classification, dropStatements: plan.dropStatements }, null, 2)}\n`,
    );
    summarize(
      renderSchemaPlan({ title: "Schema change (declarative diff)", ...plan }),
      env,
    );
    setOutputs(
      {
        empty: String(plan.sql === ""),
        hash: plan.hash,
        destructive: String(plan.classification.destructive),
      },
      env,
    );
    return 0;
  }

  if (command === "schema-apply") {
    const url = need();
    if (!expect)
      throw new Error(
        "schema-apply needs --expect-hash (the approved plan's hash).",
      );
    const plan = generateSchemaPlan(rt, { repoRoot, targetUrl: url });
    if (plan.hash !== expect) {
      rt.log(
        `db-plan: the plan changed since it was approved (approved ${expect}, now ${plan.hash}). Nothing was applied.`,
      );
      writeFileSync(join(planDir, "schema-plan-changed.sql"), plan.sql);
      return 1;
    }
    if (
      plan.classification.destructive &&
      env.DESTRUCTIVE_APPROVED !== "true"
    ) {
      rt.log(
        "db-plan: the plan is destructive and this job is not behind the destructive gate. Nothing was applied.",
      );
      return 1;
    }
    if (plan.sql === "") {
      summarize("### Schema change\n\nNothing to apply.", env);
      return 0;
    }
    const file = join(planDir, "schema-apply.sql");
    writeFileSync(file, plan.sql);
    rt.run("psql", [
      url,
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "--quiet",
      "-f",
      file,
    ]);
    summarize(`### Schema change\n\nApplied plan \`${plan.hash}\`.`, env);
    return 0;
  }

  if (command === "check") {
    // The pull request check: no target database. The tree is built against
    // the committed migrations in a scratch database, and the SQL the tree
    // adds beyond them is the change under review.
    const base = flagValue(rest, "--base");
    const migrations = base ? changedMigrations(rt, repoRoot, base) : [];
    const scratch = mkdtempSync(join(tmpdir(), "db-check-"));
    const desired = buildDesired(rt, { repoRoot, scratch });
    try {
      const sql = desired.treeMigration
        ? normalizeSql(desired.treeMigration)
        : "";
      const classification = classifySql(sql);
      const migrationsDestructive = migrations.some((m) => m.destructive);
      writeFileSync(join(planDir, "tree-vs-migrations.sql"), sql);
      summarize(
        [
          renderSchemaPlan({
            title: "Schema tree compared with the committed migrations",
            sql,
            hash: planHash(sql),
            classification,
            schemas: managedSchemas(join(repoRoot, "supabase", "schemas")),
          }),
          "",
          "### Hand-written migrations in this change",
          "",
          migrations.length === 0
            ? "None added or edited."
            : migrations
                .map(
                  (m) =>
                    `- \`${m.file}\`: ${
                      m.destructive
                        ? `**destructive** (${m.reasons.map((r) => r.kind).join(", ")})`
                        : "not destructive"
                    }`,
                )
                .join("\n"),
        ].join("\n"),
        env,
      );
      setOutputs(
        {
          destructive: String(
            classification.destructive || migrationsDestructive,
          ),
          empty: String(sql === ""),
        },
        env,
      );
      return 0;
    } finally {
      desired.teardown();
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  process.stderr.write(
    "usage: db-plan.mjs <migrations-plan|migrations-apply|schema-plan|schema-apply|check> [--include-seed] [--expect-hash HASH]\n",
  );
  return 2;
}

/* c8 ignore start */
if (isMain(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(
      `db-plan: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
/* c8 ignore stop */
