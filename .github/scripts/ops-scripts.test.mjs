import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  discoverIssuer,
  envRefs,
  lookupFrom,
  registerProvider,
  resolveConfig,
} from "./config-push.mjs";
import {
  classifyPendingMigrations,
  dbPort,
  main as dbPlanMain,
  managedSchemas,
  normalizeSql,
  parseDiffJson,
  parsePushJson,
  planHash,
  renderSchemaPlan,
  rewriteConfig,
} from "./db-plan.mjs";
import {
  evaluateGate,
  evaluateNeed,
  labelState,
  pullFromQueueRef,
} from "./destructive-label.mjs";
import { q39Checks } from "./q39-checks.mjs";
import { classifySql, splitStatements } from "./sql-classify.mjs";
import { overrideHeader, runSmoke } from "./worker-smoke.mjs";
import { activeVersion, lastUpload } from "./wrangler-version.mjs";

/* ---------- sql-classify ---------- */

const kinds = (sql) => classifySql(sql).reasons.map((r) => r.kind);

test("additive SQL is not destructive", () => {
  assert.deepEqual(
    kinds(`
      CREATE TABLE a (id int);
      ALTER TABLE a ADD COLUMN type text;
      ALTER TABLE a ADD CONSTRAINT k UNIQUE (id);
      CREATE INDEX i ON a (id);
      GRANT SELECT ON a TO anon;
      DROP INDEX old_i;
      DROP TRIGGER t ON a;
      ALTER TABLE a DROP CONSTRAINT k;
      ALTER TABLE a ALTER COLUMN id SET NOT NULL;
      ALTER TABLE a ALTER COLUMN id DROP NOT NULL;
      INSERT INTO a VALUES (1);
      COMMENT ON TABLE a IS 'drop table a';
    `),
    [],
  );
});

test("drops, type changes, renames, truncates and data moves are destructive", () => {
  assert.deepEqual(kinds("DROP TABLE x;"), ["DROP TABLE"]);
  assert.deepEqual(kinds("DROP TABLE IF EXISTS x CASCADE;"), ["DROP TABLE"]);
  assert.deepEqual(kinds("DROP SCHEMA s CASCADE;"), ["DROP SCHEMA"]);
  assert.deepEqual(kinds("ALTER TABLE a DROP COLUMN c;"), ["DROP COLUMN"]);
  assert.deepEqual(kinds("ALTER TABLE a DROP COLUMN IF EXISTS c;"), [
    "DROP COLUMN",
  ]);
  assert.deepEqual(kinds("ALTER TABLE a ALTER COLUMN c TYPE bigint;"), [
    "ALTER COLUMN TYPE",
  ]);
  assert.deepEqual(
    kinds('ALTER TABLE ONLY "p"."a" ALTER COLUMN "c" SET DATA TYPE text;'),
    ["ALTER COLUMN TYPE"],
  );
  assert.deepEqual(kinds("ALTER TABLE a RENAME COLUMN b TO c;"), ["RENAME"]);
  assert.deepEqual(kinds("ALTER TABLE a RENAME TO b;"), ["RENAME"]);
  assert.deepEqual(kinds("TRUNCATE a;"), ["TRUNCATE"]);
  assert.deepEqual(kinds("DELETE FROM a WHERE x = 1;"), ["DELETE"]);
  assert.deepEqual(kinds("UPDATE a SET b = 1;"), ["UPDATE"]);
  assert.deepEqual(kinds("DO $$ begin null; end $$;"), ["DO block"]);
});

test("a constraint rename is not a loss", () => {
  assert.deepEqual(kinds("ALTER TABLE a RENAME CONSTRAINT k TO j;"), []);
});

test("a policy, function or view that is re-created is not a loss; one that vanishes is", () => {
  assert.deepEqual(
    kinds(
      'DROP POLICY p ON "s"."t"; CREATE POLICY p ON "s"."t" FOR SELECT USING (true);',
    ),
    [],
  );
  assert.deepEqual(kinds('DROP POLICY p ON "s"."t";'), ["DROP POLICY"]);
  assert.deepEqual(
    kinds(
      'DROP POLICY p ON "s"."t"; CREATE POLICY p ON "s"."other" FOR SELECT USING (true);',
    ),
    ["DROP POLICY"],
  );
  assert.deepEqual(
    kinds(
      "DROP FUNCTION s.f(int); CREATE FUNCTION s.f(text) RETURNS int AS $$ select 1 $$ LANGUAGE sql;",
    ),
    [],
  );
  assert.deepEqual(kinds("DROP FUNCTION s.f(int);"), ["DROP FUNCTION"]);
  assert.deepEqual(kinds("DROP VIEW s.v;"), ["DROP VIEW"]);
  assert.deepEqual(
    kinds(
      "DROP MATERIALIZED VIEW s.v; CREATE MATERIALIZED VIEW s.v AS select 1;",
    ),
    [],
  );
});

test("SQL in comments, strings and function bodies is not mistaken for statements", () => {
  assert.deepEqual(
    kinds(`
      -- DROP TABLE a;
      /* DROP TABLE b; /* nested */ DROP TABLE c; */
      INSERT INTO log VALUES ('DROP TABLE d; DELETE FROM e');
      CREATE FUNCTION f() RETURNS void AS $body$
        begin delete from x; drop table y; end
      $body$ LANGUAGE plpgsql;
    `),
    [],
  );
});

test("splitStatements keeps quoted identifiers and drops comments", () => {
  assert.deepEqual(splitStatements('SELECT "a;b" -- tail\n; SELECT 2;'), [
    'SELECT "a;b"',
    "SELECT 2",
  ]);
});

/* ---------- db-plan ---------- */

test("the plan hash ignores line endings and trailing whitespace, and nothing else", () => {
  assert.equal(
    planHash("ALTER TABLE a ADD COLUMN b int;\r\n"),
    planHash("ALTER TABLE a ADD COLUMN b int;  \n\n"),
  );
  assert.notEqual(
    planHash("ALTER TABLE a ADD COLUMN b int;"),
    planHash("ALTER TABLE a ADD COLUMN c int;"),
  );
  assert.equal(planHash("  \n"), "empty");
  assert.equal(normalizeSql("a  \r\nb\n\n\n"), "a\nb\n");
});

test("managedSchemas lists the schema directories and skips _cluster", () => {
  const dir = mkdtempSync(join(tmpdir(), "schemas-"));
  for (const name of ["_cluster", "platform", "storage"])
    mkdirSync(join(dir, name));
  writeFileSync(join(dir, "stray.sql"), "");
  assert.deepEqual(managedSchemas(dir), ["platform", "storage"]);
  assert.deepEqual(managedSchemas(join(dir, "missing")), []);
});

test("rewriteConfig isolates the scratch stack", () => {
  const toml = [
    'project_id = "Real"',
    "[api]",
    "port = 54321",
    "[db]",
    "port = 54322",
    "shadow_port = 54320",
    "[db.seed]",
    "# a comment",
    "enabled = true",
    'sql_paths = ["./seed/*.sql"]',
    "[auth]",
    "enabled = true",
  ].join("\n");
  const out = rewriteConfig(toml, { projectId: "scratch1", portBase: 60000 });
  assert.match(out, /project_id = "scratch1"/);
  assert.doesNotMatch(out, /5432[0-9]/);
  assert.equal(dbPort(out), 60002);
  assert.match(out, /\[db\.seed\][^[]*enabled = false/);
  assert.match(out, /\[auth\]\nenabled = true/);
});

test("parsePushJson and parseDiffJson read the CLI's JSON through log noise", () => {
  const push = parsePushJson(
    `Initialising login role...\n${JSON.stringify({ upToDate: false, migrations: ["20261201000000_x.sql"], seeds: ["seed/a.sql"], roles: [] })}\nnoise`,
  );
  assert.deepEqual(push.migrations, ["20261201000000_x.sql"]);
  assert.deepEqual(push.seeds, ["seed/a.sql"]);
  assert.throws(() => parsePushJson("no json here"), /no JSON/);
  const diff = parseDiffJson(
    `log\n${JSON.stringify({ diff: "SELECT 1;", dropStatements: ["DROP TABLE a"] })}\n`,
  );
  assert.equal(diff.diff, "SELECT 1;");
  assert.deepEqual(diff.dropStatements, ["DROP TABLE a"]);
  assert.throws(() => parseDiffJson('{"message":"x"}'), /no diff text/);
});

test("pending hand-written migrations are read and classified", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20261201000000_drop.sql"),
    "ALTER TABLE a DROP COLUMN b;",
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20261202000000_add.sql"),
    "ALTER TABLE a ADD COLUMN b int;",
  );
  const out = classifyPendingMigrations(root, [
    "20261201000000_drop.sql",
    "20261202000000_add.sql",
  ]);
  assert.deepEqual(
    out.map((o) => [o.file, o.destructive]),
    [
      ["20261201000000_drop.sql", true],
      ["20261202000000_add.sql", false],
    ],
  );
});

test("the schema plan summary carries the hash, the verdict and the SQL", () => {
  const sql = "ALTER TABLE a DROP COLUMN b;\n";
  const text = renderSchemaPlan({
    title: "Schema change",
    sql,
    hash: planHash(sql),
    classification: classifySql(sql),
    schemas: ["platform"],
  });
  assert.match(text, /Plan hash: `[0-9a-f]{64}`/);
  assert.match(text, /Destructive: 1 statement/);
  assert.match(text, /DROP COLUMN/);
  assert.match(
    renderSchemaPlan({
      title: "t",
      sql: "",
      hash: "empty",
      classification: classifySql(""),
    }),
    /nothing to apply/,
  );
});

/** A fake CLI: `db diff` answers `diff`, `db push` answers the dry-run JSON. */
function fakeRuntime({ diff = "", push, env }) {
  const calls = [];
  const rt = {
    cli: "supabase",
    env: { PLAN_DIR: mkdtempSync(join(tmpdir(), "plan-")), ...env },
    calls,
    log: () => {},
    run(cmd, args) {
      calls.push([cmd, ...args]);
      if (args[0] === "db" && args[1] === "diff") {
        return {
          status: 0,
          stdout: JSON.stringify({ diff, dropStatements: [] }),
          stderr: "",
        };
      }
      if (
        args[0] === "db" &&
        args[1] === "push" &&
        args.includes("--dry-run")
      ) {
        return {
          status: 0,
          stdout: JSON.stringify(
            push ?? { upToDate: true, migrations: [], seeds: [], roles: [] },
          ),
          stderr: "",
        };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  };
  return rt;
}

test("migrations-apply refuses a destructive migration outside the destructive gate, and a changed plan", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "migrations", "20261201000000_drop.sql"),
    "ALTER TABLE a DROP COLUMN b;",
  );
  const push = {
    upToDate: false,
    migrations: ["20261201000000_drop.sql"],
    seeds: [],
    roles: [],
  };
  const url = "postgresql://u:p@db/postgres";

  const plan = fakeRuntime({ push, env: { DB_URL: url } });
  assert.equal(dbPlanMain(["migrations-plan"], plan, { repoRoot: root }), 0);
  const { hash } = JSON.parse(
    readFileSync(join(plan.env.PLAN_DIR, "migrations-plan.json"), "utf8"),
  );

  const ungated = fakeRuntime({ push, env: { DB_URL: url } });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", hash], ungated, {
      repoRoot: root,
    }),
    1,
  );
  assert.ok(
    !ungated.calls.some((c) => c.includes("--yes")),
    "nothing was pushed",
  );

  const gated = fakeRuntime({
    push,
    env: { DB_URL: url, DESTRUCTIVE_APPROVED: "true" },
  });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", hash], gated, {
      repoRoot: root,
    }),
    0,
  );
  assert.ok(
    gated.calls.some((c) => c.includes("--yes")),
    "the push ran",
  );

  const changed = fakeRuntime({
    push,
    env: { DB_URL: url, DESTRUCTIVE_APPROVED: "true" },
  });
  assert.equal(
    dbPlanMain(["migrations-apply", "--expect-hash", "0".repeat(64)], changed, {
      repoRoot: root,
    }),
    1,
  );
  assert.ok(
    !changed.calls.some((c) => c.includes("--yes")),
    "a stale approval pushes nothing",
  );
});

test("db-plan refuses to plan with no DB_URL", () => {
  assert.throws(
    () => dbPlanMain(["migrations-plan"], fakeRuntime({ env: {} })),
    /DB_URL is not set/,
  );
});

/* ---------- destructive-label ---------- */

const labeled = (login, label = "allow-destructive") => ({
  event: "labeled",
  label: { name: label },
  actor: { login },
});
const unlabeled = (login, label = "allow-destructive") => ({
  event: "unlabeled",
  label: { name: label },
  actor: { login },
});

function fakeApi({ timeline, roles }) {
  return async (path) => {
    const [bare] = path.split("?");
    if (bare.endsWith("/timeline")) return timeline;
    const match = /collaborators\/([^/]+)\/permission$/.exec(bare);
    if (match) {
      if (!(match[1] in roles)) throw new Error(`404 ${match[1]}`);
      return { permission: roles[match[1]], role_name: roles[match[1]] };
    }
    throw new Error(`unexpected GET ${path}`);
  };
}

test("labelState follows the most recent labeled or unlabeled event for the one label", () => {
  assert.deepEqual(labelState([]), { present: false });
  assert.deepEqual(labelState([labeled("a"), labeled("b", "other")]), {
    present: true,
    actor: "a",
  });
  assert.deepEqual(labelState([labeled("a"), unlabeled("b")]), {
    present: false,
  });
  assert.deepEqual(labelState([labeled("a"), unlabeled("b"), labeled("c")]), {
    present: true,
    actor: "c",
  });
});

test("the gate rejects a label applied by someone who is not devops", async () => {
  const roles = {
    lathryx: "maintain",
    sloan: "admin",
    member: "write",
    reviewer: "triage",
  };
  const gate = (timeline) =>
    evaluateGate({ api: fakeApi({ timeline, roles }), repo: "O/R", pr: 1 });
  assert.equal((await gate([])).pass, true);
  assert.equal((await gate([labeled("lathryx")])).pass, true);
  assert.equal((await gate([labeled("sloan")])).pass, true);
  const rejected = await gate([labeled("member")]);
  assert.equal(rejected.pass, false);
  assert.equal(rejected.reject, true);
  assert.match(rejected.message, /@member/);
  assert.equal((await gate([labeled("reviewer")])).pass, false);
  // Re-applied by a devops member after a rejected one: the latest applier counts.
  assert.equal(
    (await gate([labeled("member"), unlabeled("lathryx"), labeled("lathryx")]))
      .pass,
    true,
  );
  // A label that was removed is no label.
  assert.equal(
    (await gate([labeled("member"), unlabeled("lathryx")])).pass,
    true,
  );
});

test("destructive SQL needs the label; harmless SQL does not", async () => {
  const api = (timeline) => fakeApi({ timeline, roles: {} });
  assert.equal(
    (
      await evaluateNeed({
        api: api([]),
        repo: "O/R",
        pr: 1,
        destructive: false,
      })
    ).pass,
    true,
  );
  assert.equal(
    (
      await evaluateNeed({
        api: api([]),
        repo: "O/R",
        pr: 1,
        destructive: true,
      })
    ).pass,
    false,
  );
  assert.equal(
    (
      await evaluateNeed({
        api: api([labeled("x")]),
        repo: "O/R",
        pr: 1,
        destructive: true,
      })
    ).pass,
    true,
  );
});

test("the pull request is found from a merge queue branch name", () => {
  assert.equal(
    pullFromQueueRef("gh-readonly-queue/main/pr-123-0123abcdef"),
    123,
  );
  assert.equal(
    pullFromQueueRef("refs/heads/gh-readonly-queue/main/pr-7-abc"),
    7,
  );
  assert.equal(pullFromQueueRef("refs/heads/feature"), undefined);
});

/* ---------- config-push ---------- */

test("env references are found", () => {
  assert.deepEqual(
    envRefs('a = "env(A)"\nb = "x"\n# env(B)\nc = "env(A)"').sort(),
    ["A", "B"],
  );
});

test("an unset env() is dropped from a list, a switched-off section, and refused elsewhere", () => {
  const toml = [
    "[auth]",
    'site_url = "env(BASE_URL)"',
    "additional_redirect_urls = [",
    '  "env(BASE_URL_CALLBACK)",',
    '  "env(STUDY_GROUP_FINDER_URL_CALLBACK)",',
    '  "dev.dogpack://login-callback",',
    "]",
    "[auth.external.linkedin_oidc]",
    "enabled = false",
    'client_id = "env(LINKEDIN_CLIENT_ID)"',
    "[auth.external.github]",
    "enabled = true",
    'client_id = "env(GH_CLIENT_ID)"',
  ].join("\n");
  const set = {
    BASE_URL: "https://x",
    BASE_URL_CALLBACK: "https://x/cb",
    GH_CLIENT_ID: "id",
  };
  const result = resolveConfig(toml, (n) => set[n]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.dropped.sort(), [
    "LINKEDIN_CLIENT_ID",
    "STUDY_GROUP_FINDER_URL_CALLBACK",
  ]);
  assert.doesNotMatch(result.toml, /STUDY_GROUP_FINDER|LINKEDIN_CLIENT_ID/);
  assert.match(result.toml, /dev\.dogpack:\/\/login-callback/);
  assert.match(
    result.toml,
    /env\(BASE_URL_CALLBACK\)/,
    "set ones are left for the CLI",
  );

  const broken = resolveConfig(toml, (n) =>
    n === "GH_CLIENT_ID" ? undefined : set[n],
  );
  assert.deepEqual(broken.missing, ["GH_CLIENT_ID"]);
});

test("an inline array loses only its unset entries", () => {
  const result = resolveConfig('urls = ["a", "env(X)", "b"]', () => undefined);
  assert.equal(result.toml, 'urls = ["a", "b"]');
});

test("secrets win over variables in the lookup", () => {
  const lookup = lookupFrom({
    VARS_JSON: '{"A":"var","B":"b"}',
    SECRETS_JSON: '{"A":"secret"}',
    C: "env",
  });
  assert.equal(lookup("A"), "secret");
  assert.equal(lookup("B"), "b");
  assert.equal(lookup("C"), "env");
  assert.equal(lookup("D"), undefined);
  assert.throws(() => lookupFrom({ SECRETS_JSON: "{" }), /not valid JSON/);
});

/** A fake fetch answering from a list of [matcher, response] pairs, recording calls. */
function scriptedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      body: init.body,
    });
    for (const [method, pattern, respond] of routes) {
      if (method === (init.method ?? "GET") && pattern.test(String(url))) {
        const { status = 200, json = {} } = respond(init);
        return new Response(status === 204 ? null : JSON.stringify(json), {
          status,
          headers: {
            "content-type": "application/json",
            ...(json.__headers ?? {}),
          },
        });
      }
    }
    throw new Error(`unexpected ${init.method ?? "GET"} ${url}`);
  };
  fn.calls = calls;
  return fn;
}

const PROVIDER_ENV = {
  PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_ACCESS_TOKEN: "sbp_x",
  SECRET_KEY: "sb_secret_x",
  DEVDOGS_OAUTH_CLIENT_ID: "client-id",
  DEVDOGS_OAUTH_CLIENT_SECRET: "client-secret",
  DEVDOGS_OAUTH_BASE_URL: "https://api-staging.devdogsuga.org",
};

test("register creates the provider with the platform's discovered issuer, enabling custom OAuth first", async () => {
  const fetchImpl = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: false } }),
    ],
    ["PATCH", /api\.supabase\.com.*config\/auth$/, () => ({ json: {} })],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom%3Adevdogsuga$/,
      () => ({ status: 404, json: {} }),
    ],
    ["POST", /custom-providers$/, () => ({ status: 201, json: {} })],
  ]);
  const result = await registerProvider({ env: PROVIDER_ENV, fetchImpl });
  assert.deepEqual(result, {
    action: "created",
    issuer: "https://platformref.supabase.co/auth/v1",
  });
  const patch = fetchImpl.calls.find((c) => c.method === "PATCH");
  assert.deepEqual(JSON.parse(patch.body), { custom_oauth_enabled: true });
  const post = JSON.parse(
    fetchImpl.calls.find((c) => c.method === "POST").body,
  );
  assert.equal(post.identifier, "custom:devdogsuga");
  assert.equal(post.provider_type, "oidc");
  assert.equal(post.issuer, "https://platformref.supabase.co/auth/v1");
  assert.equal(
    post.attribute_mapping,
    undefined,
    "no attribute mapping: sub must stay the platform user id",
  );
  assert.ok(
    fetchImpl.calls.some(
      (c) =>
        c.url ===
        "https://abcdefghijklmnopqrst.supabase.co/auth/v1/admin/custom-providers",
    ),
  );
});

test("register updates an existing provider, and skips a project with no client", async () => {
  const fetchImpl = scriptedFetch([
    [
      "GET",
      /api\.supabase\.com.*config\/auth$/,
      () => ({ json: { custom_oauth_enabled: true } }),
    ],
    [
      "GET",
      /openid-configuration$/,
      () => ({ json: { issuer: "https://platformref.supabase.co/auth/v1" } }),
    ],
    [
      "GET",
      /custom-providers\/custom%3Adevdogsuga$/,
      () => ({ json: { identifier: "custom:devdogsuga" } }),
    ],
    ["PUT", /custom-providers\/custom%3Adevdogsuga$/, () => ({ json: {} })],
  ]);
  assert.equal(
    (await registerProvider({ env: PROVIDER_ENV, fetchImpl })).action,
    "updated",
  );
  assert.ok(
    !fetchImpl.calls.some((c) => c.method === "PATCH"),
    "already enabled: not patched",
  );

  const none = scriptedFetch([]);
  const env = { ...PROVIDER_ENV };
  delete env.DEVDOGS_OAUTH_CLIENT_ID;
  assert.equal(
    (await registerProvider({ env, fetchImpl: none })).action,
    "skipped",
  );
  assert.equal(none.calls.length, 0);
});

test("discoverIssuer refuses a discovery document without an issuer", async () => {
  const fetchImpl = scriptedFetch([
    ["GET", /openid-configuration$/, () => ({ json: {} })],
  ]);
  await assert.rejects(discoverIssuer("https://x", fetchImpl), /no issuer/);
});

/* ---------- worker-smoke and q39 ---------- */

const SMOKE = {
  hosts: { staging: "staging.example.org" },
  publicPaths: ["/", "/docs"],
  protectedPath: "/console",
  protectedRedirectPrefix: "/auth",
};

test("the version override header pins a request to one version", () => {
  assert.equal(
    overrideHeader("staging-platform", "abc"),
    'staging-platform="abc"',
  );
});

test("smoke passes when public pages load and the protected page redirects", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    const path = new URL(url).pathname;
    if (path === "/console")
      return new Response(null, {
        status: 307,
        headers: { location: "/auth?next=/console" },
      });
    return new Response("ok", { status: 200 });
  };
  const checks = await runSmoke({
    smoke: SMOKE,
    tier: "staging",
    workerName: "staging-platform",
    versionId: "v1",
    fetchImpl,
  });
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
  assert.equal(checks.length, 3);
  assert.ok(
    seen.every(
      (s) =>
        s.headers["cloudflare-workers-version-overrides"] ===
        'staging-platform="v1"',
    ),
  );
});

test("smoke fails on a broken page and on an unprotected protected page", async () => {
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/docs") return new Response("boom", { status: 500 });
    if (path === "/console") return new Response("secret", { status: 200 });
    return new Response("ok", { status: 200 });
  };
  const checks = await runSmoke({ smoke: SMOKE, tier: "staging", fetchImpl });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [true, false, false],
  );
  await assert.rejects(
    runSmoke({ smoke: SMOKE, tier: "production", fetchImpl }),
    /no production host/,
  );
  await assert.rejects(
    runSmoke({ smoke: SMOKE, tier: "staging", versionId: "v", fetchImpl }),
    /needs --worker-name/,
  );
});

test("expected statuses prove a Worker that answers something other than 200", async () => {
  const fetchImpl = async (url) =>
    new Response("x", {
      status: new URL(url).pathname === "/follow" ? 426 : 403,
    });
  const smoke = {
    hosts: { production: "relay.example.org" },
    publicPaths: [],
    expectedStatuses: { "/follow": 426, "/": 403 },
  };
  const checks = await runSmoke({ smoke, tier: "production", fetchImpl });
  assert.deepEqual(
    checks.map((c) => c.ok),
    [true, true],
  );
  const broken = await runSmoke({
    smoke: { ...smoke, expectedStatuses: { "/follow": 200 } },
    tier: "production",
    fetchImpl,
  });
  assert.equal(broken[0].ok, false);
});

test("the uploaded version is read from wrangler's output file", () => {
  const ndjson = [
    JSON.stringify({ type: "wrangler-session", version: 1 }),
    "not json",
    JSON.stringify({
      type: "version-upload",
      version: 1,
      worker_name: "old",
      version_id: "11111111-1111-1111-1111-111111111111",
    }),
    JSON.stringify({
      type: "version-upload",
      version: 1,
      worker_name: "staging-platform",
      version_id: "22222222-2222-2222-2222-222222222222",
    }),
  ].join("\n");
  assert.deepEqual(lastUpload(ndjson), {
    versionId: "22222222-2222-2222-2222-222222222222",
    workerName: "staging-platform",
  });
  assert.equal(lastUpload(""), undefined);
});

test("the active version is the one with the most traffic", () => {
  assert.equal(
    activeVersion(
      JSON.stringify({
        versions: [
          { version_id: "a", percentage: 10 },
          { version_id: "b", percentage: 90 },
        ],
      }),
    ),
    "b",
  );
  assert.equal(activeVersion("not json"), undefined);
  assert.equal(activeVersion("{}"), undefined);
});

/** The OAuth server and the consent page, as a fake. */
function oauthFetch({
  authorizeLocation,
  consentStatus = 404,
  clientOk = true,
}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method ?? "GET"} ${u.pathname}`);
    if (
      u.pathname === "/auth/v1/admin/oauth/clients" &&
      init.method === "POST"
    ) {
      return clientOk
        ? Response.json({ client_id: "cid" }, { status: 201 })
        : new Response("{}", { status: 500 });
    }
    if (u.pathname === "/auth/v1/oauth/authorize") {
      return new Response(null, {
        status: 302,
        headers: { location: authorizeLocation },
      });
    }
    if (u.pathname === "/oauth/consent")
      return new Response("", { status: consentStatus });
    if (
      u.pathname === "/auth/v1/admin/oauth/clients/cid" &&
      init.method === "DELETE"
    )
      return new Response(null, { status: 204 });
    if (u.pathname === "/auth/v1/.well-known/openid-configuration")
      return Response.json({ authorization_endpoint: "x" });
    return new Response("ok", { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

test("the authorize checks pass, and the throwaway client is always deleted", async () => {
  const fetchImpl = oauthFetch({
    authorizeLocation:
      "https://staging.example.org/oauth/consent?authorization_id=1",
  });
  const checks = await runSmoke({
    smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
    tier: "staging",
    fetchImpl,
    authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
  });
  assert.ok(
    checks.every((c) => c.ok),
    JSON.stringify(checks),
  );
  assert.ok(
    fetchImpl.calls.includes("DELETE /auth/v1/admin/oauth/clients/cid"),
  );

  const bad = oauthFetch({
    authorizeLocation: "https://elsewhere.example/login",
    consentStatus: 200,
  });
  const failed = await runSmoke({
    smoke: { ...SMOKE, publicPaths: [], protectedPath: undefined },
    tier: "staging",
    fetchImpl: bad,
    authorize: { apiUrl: "https://api.example.org", secretKey: "k" },
  });
  assert.deepEqual(
    failed.map((c) => c.ok),
    [true, false, false, true],
  );
  assert.ok(
    bad.calls.includes("DELETE /auth/v1/admin/oauth/clients/cid"),
    "deleted even though checks failed",
  );
});

test("Q39 in production only reads; in staging it registers a client and runs the hook check", async () => {
  const prod = oauthFetch({ authorizeLocation: "" });
  const production = await q39Checks({
    tier: "production",
    base: "https://devdogsuga.org",
    apiUrl: "https://api.devdogsuga.org",
    secretKey: "ignored",
    dbUrl: "ignored",
    fetchImpl: prod,
    runHookCheck: () => {
      throw new Error("the hook check must not run in production");
    },
  });
  assert.ok(production.every((c) => c.ok));
  assert.ok(
    !prod.calls.some((c) => c.startsWith("POST") || c.startsWith("DELETE")),
    prod.calls.join(),
  );

  const stg = oauthFetch({
    authorizeLocation:
      "https://staging.devdogsuga.org/oauth/consent?authorization_id=1",
  });
  const staging = await q39Checks({
    tier: "staging",
    base: "https://staging.devdogsuga.org",
    apiUrl: "https://api-staging.devdogsuga.org",
    secretKey: "k",
    dbUrl: "postgres://x",
    fetchImpl: stg,
    runHookCheck: () => ({ ok: true, detail: "stub" }),
  });
  assert.ok(
    staging.every((c) => c.ok),
    JSON.stringify(staging),
  );
  assert.ok(staging.some((c) => /hook downgrades/.test(c.name)));
});
