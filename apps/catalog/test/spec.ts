import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

/**
 * The OpenAPI file, loaded for the tests and `scripts/check-spec.ts`, and a way
 * to validate a real response against the schema it promises.
 *
 * openapi/catalog.yaml is the contract; nothing here restates it.
 */

export const SPEC_PATH = resolve(import.meta.dirname, "../openapi/catalog.yaml");

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Operation = {
  operationId: string;
  parameters?: Json[];
  responses: Record<string, Json>;
};

export type Spec = {
  openapi: string;
  info: { description: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, Json>;
    responses: Record<string, Json>;
    parameters: Record<string, Json>;
    headers: Record<string, Json>;
  };
};

export function loadSpec(): Spec {
  return parse(readFileSync(SPEC_PATH, "utf8")) as Spec;
}

/** Every `$ref` string in the document, so a test can check each one resolves. */
export function refsIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) refsIn(item, found);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else refsIn(value, found);
    }
  }
  return found;
}

/** Follows a local `#/a/b/c` reference to the node it names, or undefined. */
export function resolveRef(spec: Spec, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = spec;
  for (const part of ref.slice(2).split("/")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return node;
}

/** `/subjects/{abbr}/courses` as the router spells it: `/subjects/:abbr/courses`. */
export function routerPattern(openapiPath: string): string {
  return openapiPath.replace(/\{([^}]+)\}/g, ":$1");
}

export type ResponseValidator = {
  /** The schema for this operation's `status` response, if the spec defines one. */
  has(operationId: string, status: number): boolean;
  /** Validates a parsed JSON body; returns the problems, empty when it conforms. */
  check(operationId: string, status: number, body: unknown): string[];
};

/**
 * Compiles every response schema in the spec. Schemas are JSON Schema 2020-12
 * (OpenAPI 3.1's dialect); `example` is a documentation keyword Ajv does not
 * know, hence non-strict.
 */
export function responseValidator(spec: Spec = loadSpec()): ResponseValidator {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ $id: "catalog", ...spec });

  const validators = new Map<string, ValidateFunction>();
  const responseSchema = (response: unknown): unknown => {
    let node = response as { $ref?: string; content?: Record<string, { schema?: unknown }> };
    if (node.$ref) node = resolveRef(spec, node.$ref) as typeof node;
    return node.content?.["application/json"]?.schema;
  };

  for (const methods of Object.values(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method !== "get") continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        const schema = responseSchema(response);
        if (!schema) continue;
        // Rebase local refs onto the spec document, which is registered above.
        const rebased = JSON.parse(
          JSON.stringify(schema).replaceAll('"$ref":"#/', '"$ref":"catalog#/'),
        ) as object;
        validators.set(
          `${operation.operationId}:${status}`,
          ajv.compile(rebased),
        );
      }
    }
  }

  return {
    has: (operationId, status) => validators.has(`${operationId}:${status}`),
    check(operationId, status, body) {
      const validate = validators.get(`${operationId}:${status}`);
      if (!validate) return [`The spec defines no ${status} response for ${operationId}.`];
      if (validate(body)) return [];
      return (validate.errors ?? []).map(
        (e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
      );
    },
  };
}
