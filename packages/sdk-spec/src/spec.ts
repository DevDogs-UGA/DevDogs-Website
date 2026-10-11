/**
 * Reads an OpenAPI 3.1 file (and the JSON Schema files it references) into the
 * small intermediate representation both emitters work from.
 *
 * Only the subset the DevDogs specs use is understood, and anything outside it
 * throws instead of being guessed at: objects, arrays, string enums, the four
 * scalar types, `oneOf`/`anyOf` (with `{type: null}` meaning nullable, or a
 * union of objects), `additionalProperties` maps, and `$ref` to
 * `#/components/schemas/*` or to an external file's `#/$defs/*`.
 *
 * Inline objects and enums are hoisted into named declarations, because Dart
 * has no anonymous classes and the two languages should agree on names.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { pascalCase } from "./names.js";

export type Type =
  | { kind: "string"; format?: string }
  | { kind: "integer" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "unknown" }
  | { kind: "array"; item: Type }
  | { kind: "record"; value: Type }
  | { kind: "ref"; name: string }
  | { kind: "nullable"; inner: Type };

export interface Prop {
  name: string;
  type: Type;
  required: boolean;
  doc?: string;
}

export type Decl =
  | { kind: "object"; name: string; doc?: string; props: Prop[] }
  | { kind: "enum"; name: string; doc?: string; values: string[] }
  | {
      kind: "union";
      name: string;
      doc?: string;
      members: string[];
      /** The property every member has, with a distinct enum value each. */
      discriminator: string | null;
    }
  | { kind: "alias"; name: string; doc?: string; type: Type };

export interface Param {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: Type;
  doc?: string;
}

export interface Operation {
  id: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary?: string;
  doc?: string;
  params: Param[];
  body: Type | null;
  /** The first 2xx response with a JSON body. */
  success: { status: number; type: Type } | null;
  /** False for an operation the generated clients must not call (it needs signing). */
  client: boolean;
}

export interface Server {
  key: string;
  url: string;
  doc?: string;
}

export interface Spec {
  title: string;
  version: string;
  servers: Server[];
  decls: Decl[];
  ops: Operation[];
  /** Where each declaration came from: the file (and pointer) that defines it. */
  origins: Record<string, string>;
}

type Json = Record<string, unknown>;

/**
 * Schema names that would shadow a language builtin (`Date` and `Error` in
 * TypeScript, `Error` in `dart:core`) are renamed wherever they appear.
 */
const RENAMES: Readonly<Record<string, string>> = {
  Date: "DateString",
  Time: "TimeString",
  Error: "ErrorBody",
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Files to read from memory instead of disk, keyed by absolute path. */
export type Overrides = Readonly<Record<string, string>>;

class Loader {
  constructor(private readonly overrides: Overrides = {}) {}

  private readonly docs = new Map<string, Json>();
  readonly decls = new Map<string, { decl: Decl; origin: string }>();
  private readonly pending = new Set<string>();

  load(file: string): Json {
    const cached = this.docs.get(file);
    if (cached) return cached;
    const text = this.overrides[file] ?? readFileSync(file, "utf8");
    const parsed: unknown = file.endsWith(".json")
      ? JSON.parse(text)
      : parseYaml(text);
    if (!isObject(parsed)) throw new Error(`${file} is not an object`);
    this.docs.set(file, parsed);
    return parsed;
  }

  /** Follows a JSON pointer such as `/components/schemas/Term`. */
  pointer(file: string, pointer: string): unknown {
    let node: unknown = this.load(file);
    for (const raw of pointer.split("/").slice(1)) {
      const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!isObject(node) || !(key in node)) {
        throw new Error(`${file}${pointer}: no such node`);
      }
      node = node[key];
    }
    return node;
  }

  splitRef(ref: string, file: string): { file: string; pointer: string } {
    const [target = "", pointer = ""] = ref.split("#");
    return {
      file: target ? resolve(dirname(file), target) : file,
      pointer,
    };
  }

  /** Follows `$ref` chains that point at non-schema nodes (parameters, responses). */
  deref(node: unknown, file: string): { node: Json; file: string } {
    let current = node;
    let currentFile = file;
    for (let hops = 0; hops < 10; hops++) {
      if (!isObject(current))
        throw new Error(`${currentFile}: expected object`);
      const ref = str(current["$ref"]);
      if (!ref) return { node: current, file: currentFile };
      const split = this.splitRef(ref, currentFile);
      current = this.pointer(split.file, split.pointer);
      currentFile = split.file;
    }
    throw new Error("$ref chain too long");
  }

  /** A `$ref` to a schema becomes a named declaration, registered on first sight. */
  refTo(ref: string, file: string): Type {
    const { file: targetFile, pointer } = this.splitRef(ref, file);
    const rawName = pointer.split("/").at(-1);
    if (!rawName) throw new Error(`${ref}: no name`);
    const name = RENAMES[rawName] ?? rawName;
    const origin = `${targetFile}${pointer}`;
    const known = this.decls.get(name);
    if (known) {
      if (known.origin !== origin) {
        throw new Error(
          `Two schemas are both called ${name}: ${known.origin} and ${origin}`,
        );
      }
    } else if (!this.pending.has(name)) {
      this.pending.add(name);
      const node = this.pointer(targetFile, pointer);
      this.register(name, node, targetFile, origin);
      this.pending.delete(name);
    }
    return { kind: "ref", name };
  }

  /** Registers a named declaration built from a schema node. */
  register(name: string, node: unknown, file: string, origin: string): void {
    if (!isObject(node)) throw new Error(`${origin}: schema must be an object`);
    const doc = str(node["description"]);
    const set = (decl: Decl): void => {
      this.decls.set(name, { decl, origin });
    };

    const members = this.unionMembers(node);
    if (members && !members.nullable && members.list.length > 1) {
      const names = members.list.map((member, index) => {
        const type = this.type(member, `${name}${index + 1}`, file);
        if (type.kind !== "ref") {
          throw new Error(`${origin}: union members must be objects or refs`);
        }
        return type.name;
      });
      set({
        kind: "union",
        name,
        ...(doc ? { doc } : {}),
        members: names,
        discriminator: this.discriminator(names),
      });
      return;
    }

    if (node["type"] === "object" && isObject(node["properties"])) {
      const required = new Set(
        Array.isArray(node["required"]) ? (node["required"] as string[]) : [],
      );
      // Register the object before its properties, so a self-reference finds it.
      const props: Prop[] = [];
      set({ kind: "object", name, ...(doc ? { doc } : {}), props });
      for (const [propName, propNode] of Object.entries(node["properties"])) {
        const propDoc = isObject(propNode)
          ? str(propNode["description"])
          : undefined;
        props.push({
          name: propName,
          type: this.type(propNode, `${name}${pascalCase(propName)}`, file),
          required: required.has(propName),
          ...(propDoc ? { doc: propDoc } : {}),
        });
      }
      return;
    }

    if (Array.isArray(node["enum"]) && node["type"] === "string") {
      set({
        kind: "enum",
        name,
        ...(doc ? { doc } : {}),
        values: node["enum"] as string[],
      });
      return;
    }

    set({
      kind: "alias",
      name,
      ...(doc ? { doc } : {}),
      type: this.type(node, name, file),
    });
  }

  private unionMembers(
    node: Json,
  ): { list: unknown[]; nullable: boolean } | null {
    const raw = node["oneOf"] ?? node["anyOf"];
    if (!Array.isArray(raw)) return null;
    const list = raw.filter((m) => !(isObject(m) && m["type"] === "null"));
    return { list, nullable: list.length !== raw.length };
  }

  /** The shared property that tells union members apart, if there is one. */
  private discriminator(names: string[]): string | null {
    const members = names.map((n) => this.decls.get(n)?.decl);
    if (members.some((m) => m?.kind !== "object")) return null;
    const first = members[0];
    if (first?.kind !== "object") return null;
    for (const candidate of first.props) {
      const seen = new Set<string>();
      let ok = true;
      for (const member of members) {
        if (member?.kind !== "object") return null;
        const prop = member.props.find((p) => p.name === candidate.name);
        const target =
          prop?.type.kind === "ref"
            ? this.decls.get(prop.type.name)?.decl
            : null;
        if (target?.kind !== "enum") {
          ok = false;
          break;
        }
        for (const value of target.values) {
          if (seen.has(value)) ok = false;
          seen.add(value);
        }
      }
      if (ok) return candidate.name;
    }
    return null;
  }

  /** A schema node as a type, hoisting inline objects and enums under `hint`. */
  type(node: unknown, hint: string, file: string): Type {
    if (!isObject(node)) return { kind: "unknown" };

    const ref = str(node["$ref"]);
    if (ref) return this.refTo(ref, file);

    const union = this.unionMembers(node);
    if (union) {
      const inner: Type =
        union.list.length === 0
          ? { kind: "unknown" }
          : union.list.length === 1
            ? this.type(union.list[0], hint, file)
            : this.hoist(hint, node, file);
      return union.nullable ? { kind: "nullable", inner } : inner;
    }

    const rawType = node["type"];
    if (Array.isArray(rawType)) {
      const rest: unknown[] = rawType.filter((t: unknown) => t !== "null");
      if (rest.length === 1 && rawType.length === 2) {
        const inner = this.type({ ...node, type: rest[0] }, hint, file);
        return { kind: "nullable", inner };
      }
      throw new Error(`${hint}: multiple types are not supported`);
    }

    if (Array.isArray(node["enum"])) {
      if (rawType !== "string" && rawType !== undefined) {
        throw new Error(`${hint}: only string enums are supported`);
      }
      return this.hoist(hint, { ...node, type: "string" }, file);
    }

    switch (rawType) {
      case "string": {
        const format = str(node["format"]);
        return format ? { kind: "string", format } : { kind: "string" };
      }
      case "integer":
        return { kind: "integer" };
      case "number":
        return { kind: "number" };
      case "boolean":
        return { kind: "boolean" };
      case "array":
        return {
          kind: "array",
          item: this.type(node["items"], `${hint}Item`, file),
        };
      case "object": {
        if (isObject(node["properties"])) return this.hoist(hint, node, file);
        const extra = node["additionalProperties"];
        return isObject(extra)
          ? { kind: "record", value: this.type(extra, `${hint}Value`, file) }
          : { kind: "record", value: { kind: "unknown" } };
      }
      case undefined:
        return { kind: "unknown" };
      default:
        throw new Error(`${hint}: unsupported type ${String(rawType)}`);
    }
  }

  private hoist(name: string, node: Json, file: string): Type {
    const origin = `${file}#hoisted:${name}`;
    if (this.decls.has(name)) {
      throw new Error(`Hoisted name ${name} is already taken`);
    }
    this.register(name, node, file, origin);
    return { kind: "ref", name };
  }
}

function serverKey(description: string | undefined, url: string): string {
  return (description ?? url).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function loadSpec(file: string, overrides?: Overrides): Spec {
  const loader = new Loader(overrides);
  const doc = loader.load(file);
  const info = isObject(doc["info"]) ? doc["info"] : {};

  const components = isObject(doc["components"]) ? doc["components"] : {};
  const schemas = isObject(components["schemas"]) ? components["schemas"] : {};
  for (const name of Object.keys(schemas)) {
    loader.refTo(`#/components/schemas/${name}`, file);
  }
  const extra = doc["x-sdk-schemas"];
  if (Array.isArray(extra)) {
    for (const ref of extra) loader.refTo(String(ref), file);
  }

  const ops: Operation[] = [];
  const paths = isObject(doc["paths"]) ? doc["paths"] : {};
  for (const [path, rawItem] of Object.entries(paths)) {
    if (!isObject(rawItem)) continue;
    const shared = Array.isArray(rawItem["parameters"])
      ? (rawItem["parameters"] as unknown[])
      : [];
    for (const method of METHODS) {
      const op = rawItem[method];
      if (!isObject(op)) continue;
      const id = str(op["operationId"]);
      if (!id)
        throw new Error(`${method.toUpperCase()} ${path}: no operationId`);

      const params: Param[] = [];
      const own = Array.isArray(op["parameters"])
        ? (op["parameters"] as unknown[])
        : [];
      for (const rawParam of [...shared, ...own]) {
        const { node, file: paramFile } = loader.deref(rawParam, file);
        const where = str(node["in"]);
        if (where !== "path" && where !== "query" && where !== "header") {
          throw new Error(
            `${id}: unsupported parameter location ${String(where)}`,
          );
        }
        const name = str(node["name"]) ?? "";
        const doc = str(node["description"]);
        params.push({
          name,
          in: where,
          required: where === "path" || node["required"] === true,
          type: loader.type(
            node["schema"],
            `${pascalCase(id)}${pascalCase(name)}`,
            paramFile,
          ),
          ...(doc ? { doc } : {}),
        });
      }

      let body: Type | null = null;
      if (isObject(op["requestBody"])) {
        const { node, file: bodyFile } = loader.deref(op["requestBody"], file);
        const content = isObject(node["content"]) ? node["content"] : {};
        const json = content["application/json"];
        if (isObject(json)) {
          body = loader.type(
            json["schema"],
            `${pascalCase(id)}Request`,
            bodyFile,
          );
        }
      }

      let success: Operation["success"] = null;
      const responses = isObject(op["responses"]) ? op["responses"] : {};
      for (const [status, rawResponse] of Object.entries(responses)) {
        const code = Number(status);
        if (!(code >= 200 && code < 300) || success) continue;
        const { node, file: responseFile } = loader.deref(rawResponse, file);
        const content = isObject(node["content"]) ? node["content"] : {};
        const json = content["application/json"];
        if (isObject(json)) {
          success = {
            status: code,
            type: loader.type(
              json["schema"],
              `${pascalCase(id)}Response`,
              responseFile,
            ),
          };
        }
      }

      // Error responses only need their schemas registered: the clients map a
      // failure to one runtime error type rather than a generated one per code.
      for (const [status, rawResponse] of Object.entries(responses)) {
        if (Number(status) >= 400) {
          const { node, file: responseFile } = loader.deref(rawResponse, file);
          const content = isObject(node["content"]) ? node["content"] : {};
          const json = content["application/json"];
          if (isObject(json)) {
            loader.type(json["schema"], `${pascalCase(id)}Error`, responseFile);
          }
        }
      }

      const summary = str(op["summary"]);
      const description = str(op["description"]);
      ops.push({
        id,
        method,
        path,
        ...(summary ? { summary } : {}),
        ...(description ? { doc: description } : {}),
        params,
        body,
        success,
        client: op["x-sdk-client"] !== false,
      });
    }
  }

  const servers: Server[] = [];
  if (Array.isArray(doc["servers"])) {
    for (const raw of doc["servers"] as unknown[]) {
      if (!isObject(raw)) continue;
      const url = str(raw["url"]) ?? "";
      const description = str(raw["description"]);
      servers.push({
        key: serverKey(description, url),
        url,
        ...(description ? { doc: description } : {}),
      });
    }
  }

  return {
    title: str(info["title"]) ?? "",
    version: str(info["version"]) ?? "",
    servers,
    decls: [...loader.decls.values()]
      .map((entry) => entry.decl)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    ops,
    origins: Object.fromEntries(
      [...loader.decls].map(([name, entry]) => [name, entry.origin]),
    ),
  };
}

/** Loads a JSON Schema file's `$defs` as declarations (the moderation models). */
export function loadSchemaDefs(file: string, overrides?: Overrides): Decl[] {
  const loader = new Loader(overrides);
  const doc = loader.load(file);
  const defs = isObject(doc["$defs"]) ? doc["$defs"] : {};
  for (const name of Object.keys(defs)) {
    loader.refTo(`#/$defs/${name}`, file);
  }
  return [...loader.decls.values()]
    .map((entry) => entry.decl)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
