/**
 * The one generator. `pnpm -F @devdogsuga/sdk-spec generate` writes
 * `packages/sdk` (TypeScript) and `packages/sdk_dart` (Dart) from this
 * package's spec files; with `--check` it writes nothing and fails when any
 * file on disk differs from what it would write (the drift check CI runs).
 *
 * Two kinds of spec file feed it. Authored ones (`openapi/*.yaml`,
 * `constants.json`) are read as they are. Exported ones
 * (`moderation/schema.json`, `brand/tokens.json`, `telemetry/scrub.json`) are
 * derived from the TypeScript sources first, so editing a zod schema or a
 * palette value without regenerating is drift too.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DART_ARTWORK,
  brandTokens,
  fontFileName,
  json,
  moderationSchema,
  scrubRules,
} from "./derive.js";
import { emitDart, emitDartModels } from "./emit-dart.js";
import {
  brandTokensDart,
  constantsDart,
  constantsTs,
  scrubRulesDart,
} from "./emit-data.js";
import { emitTs } from "./emit-ts.js";
import { EMBEDDED_FONTS } from "../../sdk/src/brand/generated/fonts.js";
import { loadSchemaDefs, loadSpec } from "./spec.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = resolve(HERE, "..");
const PACKAGES = resolve(SPEC, "..");
const ROOT = resolve(PACKAGES, "..");

export interface Output {
  path: string;
  content: string | Buffer;
}

/** Directories wholly owned by the generator: a file in one that it does not write is stale. */
const OWNED_DIRS = [
  join(PACKAGES, "sdk_dart", "lib", "src", "generated"),
  join(PACKAGES, "sdk_dart", "lib", "assets"),
];

/** Where lane 3b keeps its copy of the catalog spec; it must equal ours. */
const CATALOG_APP_COPY = join(ROOT, "apps", "catalog", "openapi", "catalog.yaml");

export function buildOutputs(): Output[] {
  const outputs: Output[] = [];
  const add = (path: string, content: string | Buffer): void => {
    outputs.push({ path, content });
  };

  // 1. The exported spec files.
  const moderationPath = join(SPEC, "moderation", "schema.json");
  const tokensPath = join(SPEC, "brand", "tokens.json");
  const scrubPath = join(SPEC, "telemetry", "scrub.json");
  const tokens = brandTokens();
  const scrub = scrubRules();
  add(moderationPath, json(moderationSchema()));
  add(tokensPath, json(tokens));
  add(scrubPath, json(scrub));

  // The specs, read with the freshly derived moderation schema standing in for
  // the one on disk, so a stale checkout still describes the current schema.
  const overrides = { [moderationPath]: json(moderationSchema()) };
  const catalogFile = join(SPEC, "openapi", "catalog.yaml");
  const platformFile = join(SPEC, "openapi", "platform.yaml");
  const catalog = loadSpec(catalogFile, overrides);
  const platform = loadSpec(platformFile, overrides);
  const moderationDecls = loadSchemaDefs(moderationPath, overrides);

  // 3. TypeScript.
  const sdkSrc = join(PACKAGES, "sdk", "src");
  add(
    join(sdkSrc, "catalog", "generated.ts"),
    emitTs(catalog, {
      source: "packages/sdk-spec/openapi/catalog.yaml",
      clientName: "Catalog",
    }),
  );
  add(
    join(sdkSrc, "platform", "generated.ts"),
    emitTs(platform, {
      source: "packages/sdk-spec/openapi/platform.yaml",
      clientName: "Platform",
    }),
  );
  const constants = JSON.parse(
    readFileSync(join(SPEC, "constants.json"), "utf8"),
  ) as Record<string, unknown>;
  add(join(sdkSrc, "constants", "generated.ts"), constantsTs(constants));

  // 4. Dart.
  const dartLib = join(PACKAGES, "sdk_dart", "lib");
  const generated = join(dartLib, "src", "generated");
  const moderationNames = new Set(moderationDecls.map((d) => d.name));
  // Declarations the platform spec took from the moderation schema are
  // defined once, in moderation.dart.
  const sharedWithModeration = new Set(
    Object.entries(platform.origins)
      .filter(([, origin]) => origin.includes("moderation/schema.json"))
      .map(([name]) => name),
  );
  add(
    join(generated, "catalog.dart"),
    emitDart(catalog, {
      source: "packages/sdk-spec/openapi/catalog.yaml",
      clientName: "Catalog",
    }),
  );
  add(
    join(generated, "platform.dart"),
    emitDart(platform, {
      source: "packages/sdk-spec/openapi/platform.yaml",
      clientName: "Platform",
      skipDecls: new Set(
        [...sharedWithModeration].filter((n) => moderationNames.has(n)),
      ),
      imports: ["moderation.dart"],
    }),
  );
  add(
    join(generated, "moderation.dart"),
    emitDartModels(moderationDecls, "packages/sdk-spec/moderation/schema.json"),
  );
  add(join(generated, "constants.dart"), constantsDart(constants));
  add(join(generated, "brand_tokens.dart"), brandTokensDart(tokens));
  add(join(generated, "scrub_rules.dart"), scrubRulesDart(scrub));

  // Assets: artwork and fonts travel with the Dart package (Q28).
  for (const file of DART_ARTWORK) {
    add(
      join(dartLib, "assets", "brand", file),
      readFileSync(join(PACKAGES, "sdk", "artwork", file)),
    );
  }
  for (const font of EMBEDDED_FONTS) {
    add(
      join(dartLib, "assets", "fonts", fontFileName(font)),
      Buffer.from(font.data, "base64"),
    );
  }

  return outputs;
}

function same(a: string | Buffer, b: string | Buffer): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

export interface Drift {
  /** Files whose content differs or that do not exist yet. */
  changed: string[];
  /** Files the generator owns but no longer writes. */
  stale: string[];
  /** Other copies of a spec that disagree with the canonical one. */
  copies: string[];
}

export function findDrift(outputs: Output[]): Drift {
  const changed = outputs
    .filter(
      (o) => !existsSync(o.path) || !same(readFileSync(o.path), o.content),
    )
    .map((o) => relative(ROOT, o.path));
  const wanted = new Set(outputs.map((o) => o.path));
  const stale = OWNED_DIRS.flatMap(walk)
    .filter((p) => !wanted.has(p))
    .map((p) => relative(ROOT, p));
  const copies: string[] = [];
  if (existsSync(CATALOG_APP_COPY)) {
    const canonical = readFileSync(join(SPEC, "openapi", "catalog.yaml"));
    if (!readFileSync(CATALOG_APP_COPY).equals(canonical)) {
      copies.push(relative(ROOT, CATALOG_APP_COPY));
    }
  }
  return { changed, stale, copies };
}

export function writeOutputs(outputs: Output[]): void {
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.content);
  }
  const wanted = new Set(outputs.map((o) => o.path));
  for (const path of OWNED_DIRS.flatMap(walk)) {
    if (!wanted.has(path)) rmSync(path);
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const outputs = buildOutputs();
  if (!check) {
    writeOutputs(outputs);
    console.log(`sdk-spec: wrote ${outputs.length} files.`);
    return;
  }
  const drift = findDrift(outputs);
  const problems = [
    ...drift.changed.map((p) => `  out of date: ${p}`),
    ...drift.stale.map((p) => `  stale: ${p}`),
    ...drift.copies.map(
      (p) => `  differs from packages/sdk-spec/openapi/catalog.yaml: ${p}`,
    ),
  ];
  if (problems.length > 0) {
    console.error(
      `sdk-spec: generated files have drifted from the spec.\n${problems.join("\n")}\nRun \`pnpm -F @devdogsuga/sdk-spec generate\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`sdk-spec: ${outputs.length} generated files match the spec.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
