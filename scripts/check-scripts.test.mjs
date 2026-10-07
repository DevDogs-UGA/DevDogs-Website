// Every package.json script name is in the club's script vocabulary (TASK-389)
// or explicitly allowed below with a reason. Run with `pnpm check:scripts`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");

const VOCABULARY = new Set([
  "dev",
  "build",
  "start",
  "preview",
  "typecheck",
  "lint",
  "lint:fix",
  "format:check",
  "format:write",
  "test",
  "test:watch",
  "codegen",
]);
// Families: `test:<kind>`, `check:<what>` (CI verification), `types:<source>`
// and `types:<source>:check`, `fetch:<what>`, `populate:<what>`.
const FAMILIES = /^(test|check|types|fetch|populate):[\w-]+(:[\w-]+)*$/;

// Names outside the vocabulary, each with the package that owns it and why:
// `devdogs.scriptExceptions` in the root package.json, shared with
// `devtools check scripts`.
const ALLOWED = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  .devdogs.scriptExceptions;

function manifests() {
  const found = [join(root, "package.json")];
  for (const dir of ["apps", "packages"]) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const file = join(root, dir, entry.name, "package.json");
      if (entry.isDirectory() && existsSync(file)) found.push(file);
    }
  }
  return found.map((file) => {
    const { name, scripts = {} } = JSON.parse(readFileSync(file, "utf8"));
    return { file, name: file === found[0] ? "root" : name, scripts };
  });
}

const inVocabulary = (script) =>
  VOCABULARY.has(script) || FAMILIES.test(script);

test("every script name is in the vocabulary or explicitly allowed", () => {
  const unknown = [];
  for (const { name, scripts } of manifests()) {
    for (const script of Object.keys(scripts)) {
      const base = script.replace(/^(pre|post)(?=\w)/, "");
      const ok =
        inVocabulary(script) ||
        // A hook is named after the script it wraps.
        (base !== script &&
          (inVocabulary(base) || `${name}#${base}` in ALLOWED)) ||
        `${name}#${script}` in ALLOWED;
      if (!ok) unknown.push(`${name}: ${script}`);
    }
  }
  assert.deepEqual(
    unknown,
    [],
    "add to the vocabulary or ALLOWED with a reason",
  );
});

test("ALLOWED has no stale entries", () => {
  const present = new Set();
  for (const { name, scripts } of manifests()) {
    for (const script of Object.keys(scripts)) {
      present.add(`${name}#${script}`);
    }
  }
  const stale = Object.keys(ALLOWED).filter((key) => !present.has(key));
  assert.deepEqual(stale, []);
});
