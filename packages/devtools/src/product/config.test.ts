import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findProductRoot,
  parseProductConfig,
  ProductConfigError,
} from "./config.js";
import { makeProduct } from "./fixtures.js";

const VALID = {
  product: "dogdays",
  name: "DogDays",
  supabase: { version: "2.117.0", schemas: ["dogdays"] },
  types: { kind: "typescript", out: "src/database.types.ts" },
};

describe("parseProductConfig", () => {
  it("fills in the defaults a product does not need to spell out", () => {
    const config = parseProductConfig(
      JSON.stringify(VALID),
      "devtools.config.json",
    );
    expect(config.supabase.dir).toBe("supabase");
    expect(config.env).toEqual({
      example: ".env.example",
      file: ".env",
      tooling: ".env.tooling",
      keys: { url: "SUPABASE_URL", publishableKey: "SUPABASE_PUBLISHABLE_KEY" },
    });
    expect(config.oauth.redirectUris).toEqual([]);
    expect(config.production.projects).toEqual([]);
    expect(config.generatedTypes).toBeUndefined();
  });

  it("reads a supadart product with its config file", () => {
    const config = parseProductConfig(
      JSON.stringify({
        ...VALID,
        types: { kind: "supadart", out: "lib/generated" },
        generatedTypes: { repo: "DevDogsUGA/DogPack" },
      }),
      "f",
    );
    expect(config.types).toEqual({
      kind: "supadart",
      out: "lib/generated",
      config: "supadart.yaml",
    });
    expect(config.generatedTypes?.tag).toBe("generated-types");
  });

  it("names every problem with its path", () => {
    try {
      parseProductConfig(
        JSON.stringify({
          ...VALID,
          product: "Dog Days",
          supabase: { version: "latest", schemas: [] },
          types: { kind: "typescript", out: "../escape.ts" },
        }),
        "devtools.config.json",
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProductConfigError);
      const message = (err as Error).message;
      expect(message).toContain("product:");
      expect(message).toContain("supabase.version:");
      expect(message).toContain("supabase.schemas:");
      expect(message).toContain("types.out:");
    }
  });

  it("refuses an unknown generator kind", () => {
    expect(() =>
      parseProductConfig(
        JSON.stringify({ ...VALID, types: { kind: "prisma", out: "x" } }),
        "f",
      ),
    ).toThrow(ProductConfigError);
  });

  it("refuses invalid JSON, naming the file", () => {
    expect(() => parseProductConfig("{", "devtools.config.json")).toThrow(
      /devtools\.config\.json is not valid JSON/,
    );
  });
});

describe("findProductRoot", () => {
  it("searches upward and stops at the config file", () => {
    const product = makeProduct();
    const deep = join(product.root, "lib", "a", "b");
    mkdirSync(deep, { recursive: true });
    expect(findProductRoot(deep)).toBe(product.root);
  });

  it("is null outside a product", () => {
    expect(findProductRoot("/")).toBeNull();
  });
});
