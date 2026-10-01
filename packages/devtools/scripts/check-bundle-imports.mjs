#!/usr/bin/env node
// Runs after tsdown (see package.json `build`). Fails the build if the bundled
// output imports a third-party package this package.json does not declare.
//
// The bundle inlines the private @devdogsuga/cli-core and nothing else, so
// every other import is resolved by whoever installs the published tarball.
// One that is declared only on the core (or only in a workspace) installs
// fine here and fails for users with "Cannot find package". tsdown's
// `deps.onlyImport` is the first line of defence; this reads what was actually
// written, so a dynamic import or a chunk that slipped past is caught too.
import { builtinModules } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const BUILTINS = new Set(builtinModules);

/** `@scope/name/sub` becomes `@scope/name`; `name/sub` becomes `name`. */
export function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Whether a specifier names a third-party package (not relative or Node's). */
export function isThirdParty(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return false;
  if (specifier.startsWith("node:") || specifier.startsWith("data:")) {
    return false;
  }
  return !BUILTINS.has(packageName(specifier));
}

/**
 * The third-party packages `source` imports. Parsed rather than scanned, so a
 * path inside a string, a template or a comment is not mistaken for an import:
 * only import and export declarations, `import("x")` and `require("x")` with
 * a literal count.
 */
export function importedPackages(source) {
  const found = new Set();
  const add = (node) => {
    if (node && ts.isStringLiteralLike(node) && isThirdParty(node.text)) {
      found.add(packageName(node.text));
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("bundle.js", source, ts.ScriptTarget.Latest, true));
  return found;
}

/**
 * Packages the output imports but the manifest does not declare, each with
 * the files that import it. The core is never declared (it is inlined), so
 * any import of it is also a finding.
 */
export function findUndeclaredImports(distDir, manifest) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const problems = new Map();
  for (const file of readdirSync(distDir)) {
    if (!file.endsWith(".js")) continue;
    for (const name of importedPackages(
      readFileSync(join(distDir, file), "utf8"),
    )) {
      if (declared.has(name)) continue;
      problems.set(name, [...(problems.get(name) ?? []), file]);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), "..", "..");
  const dist = join(root, "dist");
  if (!existsSync(dist)) {
    console.error("check-bundle-imports: dist/ does not exist; build first.");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const problems = findUndeclaredImports(dist, manifest);
  if (problems.size > 0) {
    console.error(
      "check-bundle-imports: the bundle imports packages package.json does not declare:",
    );
    for (const [name, files] of problems) {
      console.error(`  ${name}  (${files.join(", ")})`);
    }
    console.error(
      "Add each to `dependencies` (or `peerDependencies`), or bundle it.",
    );
    process.exit(1);
  }
}
