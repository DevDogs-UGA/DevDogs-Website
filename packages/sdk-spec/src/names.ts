/** Splits `listTerms`, `list_terms`, `list-terms` and `ListTerms` into words. */
function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function pascalCase(input: string): string {
  return words(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

export function camelCase(input: string): string {
  const pascal = pascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `SCREAMING_SNAKE` for a TypeScript constant. */
export function constantCase(input: string): string {
  return words(input)
    .map((w) => w.toUpperCase())
    .join("_");
}

/**
 * Words kept as written when a name is built from them. `ID` and `URL` are
 * not special-cased: the generated names follow the spec's own spelling
 * (`courseId`), and only enum values and path-derived names go through here.
 */
export function enumMemberName(value: string): string {
  const base = /^[A-Z0-9_]+$/.test(value) ? value.toLowerCase() : value;
  const name = camelCase(base);
  return /^[a-z]/.test(name) ? name : `v${pascalCase(name)}`;
}

const DART_RESERVED = new Set([
  "abstract",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "covariant",
  "default",
  "deferred",
  "do",
  "dynamic",
  "else",
  "enum",
  "export",
  "extends",
  "extension",
  "external",
  "factory",
  "false",
  "final",
  "finally",
  "for",
  "function",
  "get",
  "hide",
  "if",
  "implements",
  "import",
  "in",
  "interface",
  "is",
  "late",
  "library",
  "mixin",
  "new",
  "null",
  "on",
  "operator",
  "part",
  "required",
  "rethrow",
  "return",
  "set",
  "show",
  "static",
  "super",
  "switch",
  "sync",
  "this",
  "throw",
  "true",
  "try",
  "typedef",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/** A Dart identifier that is not a reserved word; throws rather than guess. */
export function dartIdentifier(name: string): string {
  if (DART_RESERVED.has(name)) {
    throw new Error(
      `"${name}" is a Dart reserved word; rename it in the spec or add a mapping.`,
    );
  }
  return name;
}

/** A single-quoted Dart string literal. */
export function dartString(value: string): string {
  return `'${value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")}'`;
}

/** A double-quoted TypeScript string literal. */
export function tsString(value: string): string {
  return JSON.stringify(value);
}

/** Doc text as `/** ... *\/` lines, or "" when there is none. */
export function jsDoc(text: string | undefined, indent = ""): string {
  if (!text) return "";
  const lines = text
    .trim()
    .split("\n")
    .map((l) => l.replace(/\*\//g, "*\\/").trimEnd());
  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

/** Doc text as `///` lines, or "" when there is none. */
export function dartDoc(text: string | undefined, indent = ""): string {
  if (!text) return "";
  return `${text
    .trim()
    .split("\n")
    .map((l) => `${indent}/// ${l}`.trimEnd())
    .join("\n")}\n`;
}
