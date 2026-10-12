import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localDatabaseUrl } from "./local-env.ts";

describe("localDatabaseUrl", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "catalog-local-env-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("prefers the process environment", () => {
    writeFileSync(join(root, ".env"), "DB_URL=postgresql://from-dotenv\n");
    expect(localDatabaseUrl({ DB_URL: "postgresql://from-shell" }, root)).toBe(
      "postgresql://from-shell",
    );
  });

  it("reads .env, so the documented setup works without exporting DB_URL", () => {
    writeFileSync(
      join(root, ".env"),
      'OTHER=1\nDB_URL="postgresql://postgres:pw@127.0.0.1:54322/postgres"\n',
    );
    expect(localDatabaseUrl({}, root)).toBe(
      "postgresql://postgres:pw@127.0.0.1:54322/postgres",
    );
  });

  it("lets the running stack's .env.generated win over .env", () => {
    writeFileSync(join(root, ".env"), "DB_URL=postgresql://remote\n");
    writeFileSync(join(root, ".env.generated"), "DB_URL=postgresql://local\n");
    expect(localDatabaseUrl({}, root)).toBe("postgresql://local");
  });

  it("is undefined when nothing has one", () => {
    writeFileSync(join(root, ".env"), "OTHER=1\n");
    expect(localDatabaseUrl({}, root)).toBeUndefined();
  });
});
