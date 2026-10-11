/**
 * The schema hash that names a set of generated types.
 *
 * Generated types are never committed (Q82). CI builds them once per schema
 * change and uploads them to a rolling `generated-types` release; a
 * contributor who cannot (or would rather not) generate them downloads the
 * asset whose name carries the hash of the schema they have checked out. Two
 * checkouts with the same hash have the same types, so the hash must change
 * exactly when the generated output could.
 *
 * It covers:
 *   * every file under `supabase/schemas`, by sorted path (POSIX separators,
 *     relative to the schemas directory) and LF-normalised contents, so a
 *     Windows checkout with CRLF hashes like a Linux one;
 *   * the generator and its version (the pinned Supabase CLI for TypeScript,
 *     supadart for Dart), since a new generator rewrites the output.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Product } from "./config.js";

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(path));
    else found.push(path);
  }
  return found;
}

/** The files a hash covers, as POSIX paths relative to the schemas directory, sorted. */
export function schemaFiles(schemasDir: string): string[] {
  return listFiles(schemasDir)
    .map((path) => relative(schemasDir, path).split(sep).join("/"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function normalise(contents: Buffer): Buffer {
  return Buffer.from(contents.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function hashSchemas(schemasDir: string, generator: string): string {
  const hash = createHash("sha256");
  for (const path of schemaFiles(schemasDir)) {
    hash.update(`file:${path}\0`);
    hash.update(normalise(readFileSync(join(schemasDir, ...path.split("/")))));
    hash.update("\0");
  }
  hash.update(`generator:${generator}`);
  return hash.digest("hex");
}

/**
 * The generator and version string a product's types come from. For supadart
 * it is the version `pubspec.lock` resolved, else the constraint in
 * `pubspec.yaml`, so a Dart SDK bump that changes the models changes the hash.
 */
export function generatorFor(product: Product): string {
  const { types, supabase } = product.config;
  if (types.kind === "typescript") return `supabase@${supabase.version}`;
  const lock = join(product.root, "pubspec.lock");
  if (existsSync(lock)) {
    const match = /^ {2}supadart:\n(?:.*\n)*? {4}version: "([^"]+)"/m.exec(
      readFileSync(lock, "utf8"),
    );
    if (match?.[1]) return `supadart@${match[1]}`;
  }
  const pubspec = join(product.root, "pubspec.yaml");
  if (existsSync(pubspec)) {
    const match = /^\s+supadart:\s*([^\s#]+)/m.exec(
      readFileSync(pubspec, "utf8"),
    );
    if (match?.[1]) return `supadart@${match[1]}`;
  }
  return "supadart@unknown";
}

export function schemaHashFor(product: Product): string {
  return hashSchemas(product.paths.schemasDir, generatorFor(product));
}

/** The release asset CI uploads for a hash, and `db types --download` looks for. */
export function typesAssetName(product: string, hash: string): string {
  return `${product}-types-${hash}.tgz`;
}
