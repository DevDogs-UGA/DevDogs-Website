import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import { loadSchemaDefs, loadSpec } from "./spec.js";

const SPEC = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const VIRTUAL = "/virtual/spec.yaml";

function load(yaml: string) {
  return loadSpec(VIRTUAL, { [VIRTUAL]: yaml });
}

const WRAP = (schemas: string, paths = "paths: {}"): string => `
openapi: 3.1.0
info: { title: T, version: "1" }
${paths}
components:
  schemas:
${schemas}
`;

describe("loadSpec on a small spec", () => {
  it("reads objects, required and nullable properties", () => {
    const spec = load(
      WRAP(`
    Thing:
      type: object
      required: [id, name]
      properties:
        id: { type: integer }
        name: { oneOf: [{ type: string }, { type: "null" }] }
        note: { type: string, description: A note. }
`),
    );
    const thing = spec.decls.find((d) => d.name === "Thing");
    expect(thing?.kind).toBe("object");
    if (thing?.kind !== "object") return;
    expect(thing.props).toEqual([
      { name: "id", type: { kind: "integer" }, required: true },
      {
        name: "name",
        type: { kind: "nullable", inner: { kind: "string" } },
        required: true,
      },
      {
        name: "note",
        type: { kind: "string" },
        required: false,
        doc: "A note.",
      },
    ]);
  });

  it("hoists inline objects and enums under the parent's name", () => {
    const spec = load(
      WRAP(`
    Outer:
      type: object
      required: [inner, kind, tags]
      properties:
        inner:
          type: object
          required: [x]
          properties: { x: { type: number } }
        kind: { type: string, enum: [a, b] }
        tags:
          type: array
          items: { type: string, enum: [t1, t2] }
`),
    );
    expect(spec.decls.map((d) => d.name).sort()).toEqual([
      "Outer",
      "OuterInner",
      "OuterKind",
      "OuterTagsItem",
    ]);
  });

  it("finds the discriminator of a union of objects", () => {
    const spec = load(
      WRAP(`
    A:
      type: object
      required: [type]
      properties: { type: { type: string, enum: [a.one, a.two] } }
    B:
      type: object
      required: [type]
      properties: { type: { type: string, enum: [b.one] } }
    Either:
      anyOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }]
`),
    );
    const either = spec.decls.find((d) => d.name === "Either");
    expect(either).toMatchObject({
      kind: "union",
      members: ["A", "B"],
      discriminator: "type",
    });
  });

  it("renames schemas that would shadow a builtin", () => {
    const spec = load(
      WRAP(`
    Error:
      type: object
      required: [message]
      properties: { message: { type: string } }
    Holder:
      type: object
      required: [e]
      properties: { e: { $ref: "#/components/schemas/Error" } }
`),
    );
    expect(spec.decls.map((d) => d.name)).toContain("ErrorBody");
    expect(spec.decls.map((d) => d.name)).not.toContain("Error");
    const holder = spec.decls.find((d) => d.name === "Holder");
    expect(holder).toMatchObject({
      props: [{ type: { kind: "ref", name: "ErrorBody" } }],
    });
  });

  it("reads operations, parameters and the success response", () => {
    const spec = load(
      WRAP(
        `
    Out:
      type: object
      required: [ok]
      properties: { ok: { type: boolean } }
`,
        `
paths:
  /things/{id}:
    get:
      operationId: getThing
      summary: One thing
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
        - { name: limit, in: query, schema: { type: integer } }
        - { name: X-Client, in: header, schema: { type: string } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Out" }
        "404":
          description: no
`,
      ),
    );
    expect(spec.ops).toHaveLength(1);
    const op = spec.ops[0]!;
    expect(op.id).toBe("getThing");
    expect(op.method).toBe("get");
    expect(op.client).toBe(true);
    expect(op.params.map((p) => [p.name, p.in, p.required])).toEqual([
      ["id", "path", true],
      ["limit", "query", false],
      ["X-Client", "header", false],
    ]);
    expect(op.success).toEqual({
      status: 200,
      type: { kind: "ref", name: "Out" },
    });
  });

  it("refuses two different schemas with one name", () => {
    const yaml = `
openapi: 3.1.0
info: { title: T, version: "1" }
x-sdk-schemas:
  - ./other.json#/$defs/Same
components:
  schemas:
    Same: { type: object, properties: { a: { type: string } } }
`;
    const other = JSON.stringify({
      $defs: { Same: { type: "object", properties: { b: { type: "string" } } } },
    });
    expect(() =>
      loadSpec(VIRTUAL, { [VIRTUAL]: yaml, "/virtual/other.json": other }),
    ).toThrow(/Two schemas are both called Same/);
  });

  it("refuses a feature it does not understand", () => {
    expect(() =>
      load(WRAP(`
    Bad:
      type: object
      properties:
        n: { type: [string, integer] }
`)),
    ).toThrow(/multiple types/);
  });
});

describe("the real specs", () => {
  const catalog = loadSpec(join(SPEC, "openapi", "catalog.yaml"));
  const platform = loadSpec(join(SPEC, "openapi", "platform.yaml"));

  it("catalog.yaml parses without YAML errors or warnings", () => {
    const doc = parseDocument(
      readFileSync(join(SPEC, "openapi", "catalog.yaml"), "utf8"),
    );
    expect(doc.errors.map(String)).toEqual([]);
    expect(doc.warnings.map(String)).toEqual([]);
  });

  it("no property in the catalog spec lost its description to a stray comma", () => {
    // A flow-style `{ description: a, b }` silently becomes extra empty keys.
    const doc = parseDocument(
      readFileSync(join(SPEC, "openapi", "catalog.yaml"), "utf8"),
    ).toJS() as unknown;
    const stray: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${path}[${i}]`));
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (value === null && !/^\d+$/.test(key) && /[ .;]/.test(key)) {
            stray.push(`${path}.${key}`);
          }
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(doc, "$");
    expect(stray).toEqual([]);
  });

  it("the catalog has the seven operations the API promises", () => {
    expect(catalog.ops.map((o) => o.id).sort()).toEqual([
      "courseExists",
      "getCourse",
      "listSections",
      "listSubjectCourses",
      "listSubjects",
      "listTerms",
      "searchCourses",
    ]);
    expect(catalog.servers.map((s) => s.key)).toEqual([
      "production",
      "staging",
    ]);
    expect(catalog.decls.map((d) => d.name)).not.toContain("Error");
  });

  it("the search caps are in the spec", () => {
    const search = catalog.ops.find((o) => o.id === "searchCourses");
    expect(search?.params.find((p) => p.name === "q")?.required).toBe(true);
  });

  it("the platform spec shares the moderation schema, and reports are unsigned-client-free", () => {
    expect(platform.ops.map((o) => [o.id, o.client])).toEqual([
      ["listReportReasons", true],
      ["fileReport", false],
    ]);
    expect(Object.keys(platform.origins)).toEqual(
      expect.arrayContaining(["ReportRequest", "ModerationMessage"]),
    );
    const message = platform.decls.find((d) => d.name === "ModerationMessage");
    expect(message).toMatchObject({ kind: "union", discriminator: "type" });
  });

  it("the moderation schema file loads as declarations", () => {
    const decls = loadSchemaDefs(join(SPEC, "moderation", "schema.json"));
    expect(decls.map((d) => d.name)).toEqual(
      expect.arrayContaining([
        "ReportRequest",
        "ContentMessage",
        "UserMessage",
        "ModerationMessage",
      ]),
    );
  });
});
