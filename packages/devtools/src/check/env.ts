/**
 * `check env`: every env variable is declared, and the registry is
 * consistent. The third enforcement layer from the env model: types check each
 * declaration's SHAPE and `define()`'s required second argument checks its
 * PRESENCE, but neither can see across files. That two apps declaring one key
 * agree, that the shipped Flutter manifest holds no secrets, that a legacy key
 * in `.env.example` was actually declared by somebody: those are runtime facts
 * about the whole registry, so they are checked here, and a failure fails CI.
 *
 * Moved from DevDogsUGA's `packages/repo-checks` (`env-completeness.test.ts`),
 * which also carried its own copy of the manifest discovery. This runs on the
 * discovery everything else in devtools uses (`env/discovery.ts`), so there is
 * one copy.
 *
 * Each problem is one line naming the key and what to do. The pins (the
 * apply-only, minted, narrowed and never-store sets) are deliberate: a new
 * entry re-routes a credential behind a reviewer gate, so the reviewer of that
 * change should have to touch this file and say so out loud.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";

/** Public per-environment values the local stack also supplies. `localStack`
 * describes development only; staging and production have no stack to supply
 * these, so they must still reach a deploy. */
const LOCAL_STACK_VARIABLES = [
  "API_URL",
  "PUBLISHABLE_KEY",
  "REST_URL",
  "S3_PROTOCOL_REGION",
  "STORAGE_S3_URL",
];

export async function checkEnv(root: string): Promise<string[]> {
  await loadRegistry();
  const env = getEnvSync();
  const problems: string[] = [];
  const registry = env.variables();

  // Quantifying over an empty registry passes vacuously, so a discovery bug
  // that imported zero manifests would turn every check below green. 50 is
  // comfortably under the real count and over what any one manifest holds.
  if (registry.size < 50) {
    problems.push(
      `Only ${registry.size} variables are declared; discovery probably found no manifests.`,
    );
  }

  for (const [key, entries] of registry) {
    const [first, ...rest] = entries;
    for (const other of rest) {
      if (JSON.stringify(other.meta) !== JSON.stringify(first!.meta)) {
        problems.push(
          `${key} is declared by both "${first!.source}" and "${other.source}" with diverging metadata. ` +
            "Duplicates must agree on every field, doc string included.",
        );
      }
    }
    for (const entry of entries) {
      if (entry.meta.doc.trim().length === 0) {
        problems.push(
          `${key} (declared by "${entry.source}") has an empty doc.`,
        );
      }
    }
  }

  const everyEntry = [...registry.values()].flat();

  // Everything in the study-group-finder runtime manifest is compiled into the
  // mobile binary, and anything compiled into a binary is extractable.
  const shipped = everyEntry.filter((e) => e.source === "study-group-finder");
  if (shipped.length === 0) {
    problems.push(
      'No variables are declared by "study-group-finder"; the no-secrets-in-the-binary check would be vacuous.',
    );
  }
  for (const entry of shipped) {
    if (entry.meta.secrecy !== "public") {
      problems.push(
        `${entry.key} is in the study-group-finder runtime manifest with secrecy "${entry.meta.secrecy}". ` +
          'Move it to the "study-group-finder:tooling" manifest or make it public.',
      );
    }
  }

  const storable = new Set(env.storableKeys());
  const variableSet = new Set(env.variableKeys());
  const never = env.neverStoreKeys();
  const minted = env.mintedKeys();
  const narrowed = env.narrowedKeys();

  // GitHub Actions refuses secret and variable names beginning GITHUB_ (HTTP
  // 422), and this registry uses one name from env file to vault to GitHub to
  // Worker, so a routed key with the prefix would leave the stores disagreeing.
  for (const [key, entries] of registry) {
    if (
      key.startsWith("GITHUB_") &&
      entries.some((e) => e.meta.scope === "environment")
    ) {
      problems.push(
        `${key} is environment-scoped but starts with GITHUB_, which GitHub reserves. Rename it (the App credentials use GH_*).`,
      );
    }
  }

  for (const key of never) {
    if (storable.has(key)) {
      problems.push(`${key} is never-store yet appears in storableKeys().`);
    }
    if (variableSet.has(key)) {
      problems.push(
        `${key} is never-store yet appears in variableKeys(); env push would publish it in plaintext.`,
      );
    }
    if (narrowed.includes(key)) {
      problems.push(`${key} is never-store and narrowed.`);
    }
  }
  if (JSON.stringify(never) !== JSON.stringify(["BWS_ACCESS_TOKEN"])) {
    problems.push(
      `The never-store set is [${never.join(", ")}]; expected exactly [BWS_ACCESS_TOKEN].`,
    );
  }

  for (const key of minted) {
    if (storable.has(key)) {
      problems.push(`${key} is minted yet appears in storableKeys().`);
    }
    if (narrowed.includes(key)) {
      problems.push(`${key} is minted and narrowed.`);
    }
    for (const entry of registry.get(key) ?? []) {
      if (entry.meta.secrecy !== "secret") {
        problems.push(
          `${key} is minted with secrecy "${entry.meta.secrecy}"; a minted key is still a "secret".`,
        );
      }
    }
  }

  // Pinned, not derived-and-trusted: each of these is a deliberate, reviewed
  // routing decision (see the header).
  const pins: [string, readonly string[], readonly string[]][] = [
    ["apply-only", env.applyOnlyKeys(), ["SUPABASE_ACCESS_TOKEN"]],
    ["minted", minted, []],
    ["narrowed", narrowed, ["DB_URL"]],
  ];
  for (const [label, actual, expected] of pins) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `The ${label} set is [${actual.join(", ")}]; expected exactly [${expected.join(", ")}]. ` +
          "A change here re-routes a credential: update this pin deliberately.",
      );
    }
  }

  // `narrowed` on a key that cannot route anywhere is a marker that grants
  // nothing and documents a lie.
  for (const key of narrowed) {
    for (const entry of registry.get(key) ?? []) {
      if (entry.meta.scope !== "environment") {
        problems.push(`${key} is narrowed with scope "${entry.meta.scope}".`);
      }
    }
  }

  // Bitwarden is the source of truth for a WHOLE environment, not its secret
  // half: every environment-scoped key goes to exactly one remote store.
  let routed = 0;
  for (const [key, entries] of registry) {
    if (!entries.some((e) => e.meta.scope === "environment")) continue;
    if (never.includes(key) || minted.includes(key)) continue;
    routed += 1;
    if (storable.has(key) === variableSet.has(key)) {
      problems.push(
        `${key} is environment-scoped but is in ${storable.has(key) ? "BOTH" : "NEITHER"} of storableKeys() and variableKeys(). One store, exactly.`,
      );
    }
  }
  if (routed < 40) {
    problems.push(
      `Only ${routed} environment-scoped keys were routed (expected 40 or more).`,
    );
  }

  for (const key of variableSet) {
    for (const entry of registry.get(key) ?? []) {
      if (
        entry.meta.scope !== "environment" ||
        entry.meta.secrecy !== "public"
      ) {
        problems.push(
          `${key} is in variableKeys() with scope "${entry.meta.scope}" and secrecy "${entry.meta.secrecy}".`,
        );
      }
    }
  }
  if (variableSet.size < 20) {
    problems.push(
      `Only ${variableSet.size} keys are in variableKeys() (expected 20 or more).`,
    );
  }
  for (const key of ["NEXT_PUBLIC_AVATARS_BUCKET", "DEV_VPN_HOST"]) {
    if (variableSet.has(key)) {
      problems.push(
        `${key} is committed or per-developer and must not be a variable.`,
      );
    }
  }

  // `localStack: true` must never withhold a deployed value.
  for (const key of LOCAL_STACK_VARIABLES) {
    if (!variableSet.has(key)) {
      problems.push(
        `${key} is a public per-environment value the local stack also supplies; it still has to reach staging and production.`,
      );
    }
  }
  if (variableSet.has("S3_PROTOCOL_ACCESS_KEY_SECRET")) {
    problems.push(
      "S3_PROTOCOL_ACCESS_KEY_SECRET is a secret and must not be a variable.",
    );
  }
  if (!storable.has("S3_PROTOCOL_ACCESS_KEY_SECRET")) {
    problems.push("S3_PROTOCOL_ACCESS_KEY_SECRET must be storable.");
  }

  // `.env.example` is generated, so both directions are checkable: every
  // assigned key is declared (the catch for a legacy key), and every declared
  // key appears.
  let example = "";
  try {
    example = await readFile(join(root, ".env.example"), "utf8");
  } catch {
    problems.push(".env.example does not exist; run `devtools env example`.");
  }
  if (example) {
    const assigned = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
      (m) => m[1]!,
    );
    for (const key of assigned) {
      if (!registry.has(key)) {
        problems.push(
          `${key} is assigned in .env.example but no manifest declares it. ` +
            "Declare it (define() + declare() in the owning package's env.ts) or delete the dead line.",
        );
      }
    }
    for (const key of registry.keys()) {
      if (!example.includes(key)) {
        problems.push(
          `${key} is declared but absent from .env.example; regenerate it with \`devtools env example\`.`,
        );
      }
    }
  }

  return problems;
}
