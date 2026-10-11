import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSecrets,
  manifestKeys,
  readEnvFile,
  renderEnvFromManifest,
  upsertEnvFile,
} from "./env.js";
import { makeProduct } from "./fixtures.js";

const MANIFEST = `# Public values only.
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
CATALOG_URL=https://api.devdogsuga.org/catalog/v1
`;

describe("renderEnvFromManifest", () => {
  it("keeps the manifest's lines and comments and applies the overrides", () => {
    expect(
      renderEnvFromManifest(MANIFEST, {
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      }),
    ).toBe(
      "# Public values only.\nSUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_x\nCATALOG_URL=https://api.devdogsuga.org/catalog/v1\n",
    );
  });

  it("refuses to add a key the manifest does not declare", () => {
    expect(() =>
      renderEnvFromManifest(MANIFEST, { SUPABASE_SECRET_KEY: "x" }),
    ).toThrow(/not in the manifest/);
  });

  it("lists the manifest's keys in order", () => {
    expect(manifestKeys(MANIFEST)).toEqual([
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "CATALOG_URL",
    ]);
  });
});

describe("upsertEnvFile", () => {
  it("updates keys in place, appends new ones and keeps comments", () => {
    const product = makeProduct();
    const file = join(product.root, ".env.tooling");
    upsertEnvFile(file, { DB_URL: "postgres://a" }, "# Secrets.");
    upsertEnvFile(file, { DB_URL: "postgres://b", SECRET_KEY: "k" });
    expect(readFileSync(file, "utf8")).toBe(
      "# Secrets.\nDB_URL=postgres://b\nSECRET_KEY=k\n",
    );
    expect(readEnvFile(file)).toEqual({
      DB_URL: "postgres://b",
      SECRET_KEY: "k",
    });
  });

  it("writes the file readable by its owner only", () => {
    const product = makeProduct();
    const file = join(product.root, ".env.tooling");
    upsertEnvFile(file, { SECRET_KEY: "k" });
    expect(statSync(file).mode & 0o077).toBe(0);
  });
});

describe("findSecrets", () => {
  it("passes the manifest a product ships", () => {
    expect(findSecrets(MANIFEST)).toEqual([]);
  });

  it("passes a browser Maps key: it is public by design", () => {
    expect(
      findSecrets("GOOGLE_MAPS_BROWSER_KEY=AIzaSyExample\nMAPS_API_KEY=AIza\n"),
    ).toEqual([]);
  });

  it.each([
    "SUPABASE_SECRET_KEY=x",
    "SERVICE_ROLE_KEY=x",
    "SUPABASE_SERVICE_ROLE_KEY=x",
    "DB_URL=x",
    "DATABASE_URL=x",
    "SENTRY_AUTH_TOKEN=x",
    "GITHUB_TOKEN=x",
    "API_PASSWORD=x",
    "SIGNING_PRIVATE_KEY=x",
  ])("flags %s by its name", (line) => {
    expect(findSecrets(`${line}\n`)).toHaveLength(1);
  });

  it.each([
    ["SOME_KEY=sb_secret_abcdef", "a Supabase secret key"],
    [
      "SOME_URL=postgresql://postgres:hunter2@db.example.com:5432/postgres",
      "a database URL with a password",
    ],
    [
      "SOME_VALUE=whsec_c2FtcGxlLW1vZGVyYXRpb24tc2VjcmV0",
      "a webhook signing secret",
    ],
    ["SOME_VALUE=ghp_abcdefghijklmnopqrstuvwxyz0123", "a GitHub token"],
  ])("flags %s by its value", (line, reason) => {
    const [finding] = findSecrets(`${line}\n`);
    expect(finding?.reason).toContain(reason);
  });

  it("does not flag a database URL with no password", () => {
    expect(findSecrets("SOME_URL=postgresql://localhost:5432/app\n")).toEqual(
      [],
    );
  });
});
