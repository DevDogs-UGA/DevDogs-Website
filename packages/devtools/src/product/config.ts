/**
 * `devtools.config.json`: what makes a repository a product devtools knows how
 * to set up (DogDays, DogPack, and any future one).
 *
 * The file sits at the repo root. Its presence is what switches devtools into
 * product mode: a smaller command set (`setup`, `db sync`, `db types`,
 * `dev-data`, `oauth`) that needs no tiers, no env registry and no workspace.
 * The platform repository has no such file and keeps the full CLI.
 *
 * Nothing in the file is secret. Secrets live in `.env.tooling`, which is
 * git-ignored; the public configuration the app reads at run time lives in
 * `.env`, written from `.env.example`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

export const CONFIG_FILE = "devtools.config.json";

const relativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.includes(".."), {
    message: "must be a relative path inside the repository",
  });

const typesSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("typescript"),
    /** The generated `.ts` file. Git-ignored. */
    out: relativePath,
  }),
  z.object({
    kind: z.literal("supadart"),
    /** The directory supadart writes models to. Git-ignored. */
    out: relativePath,
    /** supadart's own config, whose `output` must match `out`. */
    config: relativePath.default("supadart.yaml"),
  }),
]);

export const productConfigSchema = z.object({
  $schema: z.string().optional(),
  /** Lowercase id: `dogdays`. Names the generated-types assets. */
  product: z.string().regex(/^[a-z][a-z0-9-]*$/),
  /** Display name: `DogDays`. */
  name: z.string().min(1),
  supabase: z.object({
    /** The directory holding `config.toml` and `schemas/`. */
    dir: relativePath.default("supabase"),
    /** The Supabase CLI version this product is built with. Part of the types hash. */
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "an exact version, 2.117.0"),
    /** Schemas that hold the product's tables, for type generation. */
    schemas: z.array(z.string().min(1)).min(1),
  }),
  env: z
    .object({
      /** The committed manifest: public keys only. */
      example: relativePath.default(".env.example"),
      /** What the app reads. Git-ignored. */
      file: relativePath.default(".env"),
      /** Secrets the tooling needs (`DB_URL`, `SECRET_KEY`). Git-ignored. */
      tooling: relativePath.default(".env.tooling"),
      /** Which `.env` keys receive the project's URL and publishable key. */
      keys: z
        .object({
          url: z.string().default("SUPABASE_URL"),
          publishableKey: z.string().default("SUPABASE_PUBLISHABLE_KEY"),
        })
        .default({
          url: "SUPABASE_URL",
          publishableKey: "SUPABASE_PUBLISHABLE_KEY",
        }),
    })
    .default({
      example: ".env.example",
      file: ".env",
      tooling: ".env.tooling",
      keys: { url: "SUPABASE_URL", publishableKey: "SUPABASE_PUBLISHABLE_KEY" },
    }),
  types: typesSchema,
  /** Where CI publishes generated types, for `db types --download`. */
  generatedTypes: z
    .object({
      /** `DevDogsUGA/DogDays`. */
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      tag: z.string().default("generated-types"),
    })
    .optional(),
  oauth: z
    .object({
      /**
       * App return addresses to allow on the project (`dev.dogpack://login-callback`,
       * `http://localhost:3000/auth/callback`). Added to `uri_allow_list` on a
       * hosted project; for local Docker they belong in `supabase/config.toml`.
       */
      redirectUris: z.array(z.string()).default([]),
    })
    .default({ redirectUris: [] }),
  /** `dev-data`: a SQL file that fills a development database. */
  devData: z
    .object({
      file: relativePath,
      /** One line for `--help`. */
      summary: z.string().optional(),
    })
    .optional(),
  /** What `setup` prints as the last step. */
  runHint: z.string().optional(),
  /** Databases `dev-data` must never touch. */
  production: z
    .object({
      /** Hosted project refs and vanity names: `dogpack`, `abcdefghij`. */
      projects: z.array(z.string()).default([]),
    })
    .default({ projects: [] }),
});

export type ProductConfig = z.infer<typeof productConfigSchema>;

export class ProductConfigError extends Error {
  constructor(
    message: string,
    readonly file?: string,
  ) {
    super(message);
    this.name = "ProductConfigError";
  }
}

/** The directory holding `devtools.config.json`, searching upward from `from`. */
export function findProductRoot(from: string = process.cwd()): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function parseProductConfig(text: string, file: string): ProductConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new ProductConfigError(
      `${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      file,
    );
  }
  const result = productConfigSchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ProductConfigError(`${file} is not valid:\n${problems}`, file);
  }
  return result.data;
}

export function loadProductConfig(root: string): ProductConfig {
  const file = join(root, CONFIG_FILE);
  return parseProductConfig(readFileSync(file, "utf8"), file);
}

/** A loaded product: its root and config, with the paths every command needs. */
export interface Product {
  root: string;
  config: ProductConfig;
  paths: {
    supabaseDir: string;
    schemasDir: string;
    migrationsDir: string;
    envExample: string;
    envFile: string;
    toolingFile: string;
    /** Local bookkeeping devtools keeps (git-ignored): the last types hash. */
    stateFile: string;
  };
}

export function productAt(root: string): Product {
  const config = loadProductConfig(root);
  const supabaseDir = join(root, config.supabase.dir);
  return {
    root,
    config,
    paths: {
      supabaseDir,
      schemasDir: join(supabaseDir, "schemas"),
      migrationsDir: join(supabaseDir, "migrations"),
      envExample: join(root, config.env.example),
      envFile: join(root, config.env.file),
      toolingFile: join(root, config.env.tooling),
      stateFile: join(root, ".devtools", "state.json"),
    },
  };
}

/** The product the working directory belongs to, or null outside one. */
export function currentProduct(from: string = process.cwd()): Product | null {
  const root = findProductRoot(from);
  return root === null ? null : productAt(root);
}
