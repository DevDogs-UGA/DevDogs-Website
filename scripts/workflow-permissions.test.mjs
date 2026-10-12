// A reusable workflow cannot be granted less than its jobs ask for: GitHub
// validates every nested job's `permissions` against the caller's grant before
// it evaluates any `if:`, so a caller that grants `contents: read` to a
// workflow holding one `contents: write` job fails the whole run at startup
// (`startup_failure`, no jobs at all), even when that job would have been
// skipped. actionlint does not check this, so this test does.
//
// No dependencies (the CI `toolchain` job runs it with plain `node`), so the
// workflows are read with a small indentation scanner that understands the
// shapes these files use: `permissions:` as `read-all`/`write-all`/a mapping,
// and `uses: ./<dir>/workflows/<file>` on a job.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const realWorkflows = join(import.meta.dirname, "..", ".github", "workflows");
const LEVEL = { none: 0, read: 1, write: 2 };

const indentOf = (line) => line.length - line.trimStart().length;
const clean = (value) =>
  value
    .replace(/\s+#.*$/, "")
    .trim()
    .replace(/^["']|["']$/g, "");

/**
 * Reads the `permissions:` block that starts at lines[start]. Returns a map of
 * scope to level (`*` for read-all / write-all).
 */
function readPermissions(lines, start) {
  const inline = clean(lines[start].slice(lines[start].indexOf(":") + 1));
  if (inline === "read-all") return { "*": LEVEL.read };
  if (inline === "write-all") return { "*": LEVEL.write };
  if (inline === "{}") return {};
  const base = indentOf(lines[start]);
  const granted = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (indentOf(line) <= base) break;
    const [scope, level] = line.trim().split(/:\s*/);
    granted[scope] = LEVEL[clean(level ?? "")] ?? 0;
  }
  return granted;
}

export function parseWorkflow(dir, file) {
  const lines = readFileSync(join(dir, file), "utf8").split("\n");
  const parsed = { permissions: undefined, jobs: {} };
  let inJobs = false;
  let job = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = indentOf(line);
    if (indent === 0) {
      inJobs = line.startsWith("jobs:");
      job = null;
      if (line.startsWith("permissions:")) {
        parsed.permissions = readPermissions(lines, i);
      }
      continue;
    }
    if (!inJobs) continue;
    if (indent === 2) {
      job = line.trim().replace(/:.*$/, "");
      parsed.jobs[job] = {};
    } else if (indent === 4 && job) {
      if (line.trim().startsWith("permissions:")) {
        parsed.jobs[job].permissions = readPermissions(lines, i);
      } else if (line.trim().startsWith("uses:")) {
        parsed.jobs[job].uses = clean(line.trim().slice("uses:".length));
      }
    }
  }
  return parsed;
}

const levelOf = (granted, scope) => granted[scope] ?? granted["*"] ?? 0;

/**
 * What a job is granted: its own `permissions`, else the workflow's, else
 * null (the repository default applies; it cannot be judged from the file).
 */
const effective = (parsed, jobName) =>
  parsed.jobs[jobName].permissions ?? parsed.permissions ?? null;

/** Every caller job that grants a called job less than it asks for. */
export function permissionViolations(dir = realWorkflows) {
  const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));
  const byFile = Object.fromEntries(
    files.map((file) => [file, parseWorkflow(dir, file)]),
  );
  const problems = [];
  for (const [file, caller] of Object.entries(byFile)) {
    for (const [callerJob, spec] of Object.entries(caller.jobs)) {
      const target = spec.uses?.match(/^\.\/\.[^/]+\/workflows\/(.+)$/)?.[1];
      if (!target) continue;
      const callee = byFile[target];
      if (!callee) {
        problems.push(`${file} job "${callerJob}" calls missing ${target}`);
        continue;
      }
      const grant = effective(caller, callerJob) ?? {};
      for (const calleeJob of Object.keys(callee.jobs)) {
        const asked = effective(callee, calleeJob) ?? {};
        for (const scope of Object.keys(asked)) {
          if (scope === "*") continue;
          if (asked[scope] > levelOf(grant, scope)) {
            problems.push(
              `${file} job "${callerJob}" grants ${scope} below what ${target} job "${calleeJob}" requests`,
            );
          }
        }
      }
    }
  }
  return problems;
}

test("every reusable-workflow caller grants what every nested job requests", () => {
  assert.deepEqual(permissionViolations(), []);
});

test("the real publish callers are seen (the check is not vacuous)", () => {
  const ci = parseWorkflow(realWorkflows, "ci.yaml");
  for (const caller of ["publish", "publish-next"]) {
    assert.equal(ci.jobs[caller].uses, "./.github/workflows/publish.yaml");
    assert.equal(ci.jobs[caller].permissions?.["id-token"], LEVEL.write);
  }
  const publish = parseWorkflow(realWorkflows, "publish.yaml");
  const asked = Object.keys(publish.jobs).map(
    (name) => effective(publish, name)?.contents,
  );
  assert.ok(asked.includes(LEVEL.write), "stable job requests contents: write");
});

test("the audited failure is reported: read-only caller, write-requesting nested job", () => {
  const dir = mkdtempSync(join(tmpdir(), "wf-perms-"));
  writeFileSync(
    join(dir, "callee.yaml"),
    [
      "on:",
      "  workflow_call:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  stable:",
      "    if: false",
      "    permissions:",
      "      contents: write",
      "      id-token: write",
      "    runs-on: ubuntu-latest",
      "  next:",
      "    permissions:",
      "      contents: read",
      "    runs-on: ubuntu-latest",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "caller.yaml"),
    [
      "on: push",
      "jobs:",
      "  bad:",
      "    permissions:",
      "      contents: read",
      "      id-token: write",
      "    uses: ./.github/workflows/callee.yaml",
      "  good:",
      "    permissions:",
      "      contents: write",
      "      id-token: write",
      "    uses: ./.github/workflows/callee.yaml",
      "",
    ].join("\n"),
  );
  assert.deepEqual(permissionViolations(dir), [
    'caller.yaml job "bad" grants contents below what callee.yaml job "stable" requests',
  ]);
});

test("a caller with no permissions block and a write-requesting nested job is reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "wf-perms-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "callee.yaml"),
    "on:\n  workflow_call:\njobs:\n  a:\n    permissions:\n      contents: write\n    runs-on: x\n",
  );
  writeFileSync(
    join(dir, "caller.yaml"),
    "on: push\npermissions:\n  contents: read\njobs:\n  c:\n    uses: ./.github/workflows/callee.yaml\n",
  );
  assert.equal(permissionViolations(dir).length, 1);
});
