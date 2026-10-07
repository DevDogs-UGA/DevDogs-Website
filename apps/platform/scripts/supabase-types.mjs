// Makes sure the platform has DevDogsUGA's generated Supabase `Database` type
// before anything typechecks against it. Runs first in `codegen`.
//
// The type is `devdogsuga/packages/supabase/src/database.types.ts`. Two
// DevDogsUGA pins are supported, and this decides between them by looking at
// the checkout rather than at a version:
//
//   Committed  The file is in the checkout and the package has no `codegen`
//              script (the older pin). Nothing to do.
//   Generated  The package has a `codegen` script (the newer pin, which
//              gitignores the file). It regenerates the file from the local
//              Supabase stack, and only when the hash of supabase/migrations
//              changed, so running it on every `pre*` hook is cheap. It needs
//              the stack running and DB_URL in the environment (with-env).
//
// A checkout that has neither the file nor the script is a stale pin: say so.
//
// BACKSTAGE_SUPABASE_TYPES overrides the decision:
//   provided  CI restored the file from cache; use it as is.
//   skip      The caller needs no types and has no database: the production
//             build, where every import of the type is erased.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sibling = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "devdogsuga",
);
const pkgDir = join(sibling, "packages", "supabase");
const typesFile = join(pkgDir, "src", "database.types.ts");

const mode = process.env.BACKSTAGE_SUPABASE_TYPES;
if (mode === "skip" || (mode === "provided" && existsSync(typesFile))) {
  process.exit(0);
}

const hasCodegen = Boolean(
  JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).scripts
    ?.codegen,
);

if (!hasCodegen) {
  if (existsSync(typesFile)) process.exit(0);
  console.error(
    `${typesFile} is missing and @devdogsuga/supabase has no codegen script.\n` +
      "Check devdogsuga/ out at a commit that either commits the file or can generate it.",
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  ["--filter", "@devdogsuga/supabase", "--fail-if-no-match", "run", "codegen"],
  { cwd: sibling, stdio: "inherit" },
);
if (result.status !== 0) {
  console.error(
    "Generating the Supabase types needs the local stack running " +
      "(`supabase start` in devdogsuga/) and DB_URL in the environment.",
  );
}
process.exit(result.status ?? 1);
