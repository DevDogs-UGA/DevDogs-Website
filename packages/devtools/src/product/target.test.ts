import { describe, expect, it } from "vitest";
import { CLI, makeProduct, recordingRunner, writeFiles } from "./fixtures.js";
import {
  assertNotProduction,
  chooseKind,
  hostedTarget,
  localTarget,
  projectNameOf,
  TargetError,
} from "./target.js";

const STATUS = `API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
ANON_KEY="legacy-anon"
PUBLISHABLE_KEY="sb_publishable_local"
SERVICE_ROLE_KEY="legacy-service"
SECRET_KEY="sb_secret_local"
`;

describe("projectNameOf", () => {
  it.each([
    ["https://dogpack.supabase.co", "dogpack"],
    [
      "https://abcdefghijklmnopqrst.supabase.co/auth/v1",
      "abcdefghijklmnopqrst",
    ],
    [
      "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      "abcdefghijklmnopqrst",
    ],
    [
      "postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "abcdefghijklmnopqrst",
    ],
    ["http://127.0.0.1:54321", null],
    ["not a url", null],
  ])("%s", (url, expected) => {
    expect(projectNameOf(url)).toBe(expected);
  });
});

describe("assertNotProduction", () => {
  it("refuses the product's own production project by vanity name or ref", () => {
    const product = makeProduct({
      config: { production: { projects: ["dogpack", "abcdefghijklmnopqrst"] } },
    });
    expect(() =>
      assertNotProduction(product, "https://dogpack.supabase.co"),
    ).toThrow(TargetError);
    expect(() =>
      assertNotProduction(
        product,
        "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      ),
    ).toThrow(/production project/);
  });

  it("lets a contributor's own project and the local stack through", () => {
    const product = makeProduct();
    expect(() =>
      assertNotProduction(
        product,
        "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
        "http://127.0.0.1:54321",
      ),
    ).not.toThrow();
  });
});

describe("localTarget", () => {
  it("reads the running stack, preferring the legacy service role key", async () => {
    const product = makeProduct();
    const { run, calls } = recordingRunner(() => ({ stdout: STATUS }));
    const target = await localTarget(product, CLI, run);
    expect(target).toEqual({
      kind: "local",
      apiUrl: "http://127.0.0.1:54321",
      dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      publishableKey: "sb_publishable_local",
      secretKey: "legacy-service",
    });
    expect(calls[0]?.args).toEqual(["status", "-o", "env"]);
    expect(calls[0]?.options.cwd).toBe(product.root);
  });

  it("falls back to the older key names", async () => {
    const product = makeProduct();
    const { run } = recordingRunner(() => ({
      stdout: STATUS.replace(/^PUBLISHABLE_KEY.*\n/m, "").replace(
        /^SERVICE_ROLE_KEY.*\n/m,
        "",
      ),
    }));
    const target = await localTarget(product, CLI, run);
    expect(target.publishableKey).toBe("legacy-anon");
    expect(target.secretKey).toBe("sb_secret_local");
  });

  it("says how to start the stack when it is not running", async () => {
    const { run } = recordingRunner(() => ({ code: 1 }));
    await expect(localTarget(makeProduct(), CLI, run)).rejects.toThrow(
      /not running/,
    );
  });
});

describe("hostedTarget", () => {
  it("reads .env and .env.tooling", () => {
    const product = makeProduct();
    writeFiles(product.root, {
      ".env":
        "SUPABASE_URL=https://zzzzzzzzzzzzzzzzzzzz.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_x\n",
      ".env.tooling":
        "DB_URL=postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres\nSECRET_KEY=sb_secret_x\n",
    });
    expect(hostedTarget(product)).toMatchObject({
      kind: "hosted",
      apiUrl: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      secretKey: "sb_secret_x",
    });
  });

  it("names what is missing and where it belongs", () => {
    const product = makeProduct();
    writeFiles(product.root, {
      ".env": "SUPABASE_URL=https://zzzzzzzzzzzzzzzzzzzz.supabase.co\n",
    });
    expect(() => hostedTarget(product)).toThrow(
      /SUPABASE_PUBLISHABLE_KEY \(in \.env\), DB_URL \(in \.env\.tooling\), SECRET_KEY \(in \.env\.tooling\)/,
    );
  });

  it("refuses the production project", () => {
    const product = makeProduct();
    writeFiles(product.root, {
      ".env":
        "SUPABASE_URL=https://dogpack.supabase.co\nSUPABASE_PUBLISHABLE_KEY=k\n",
      ".env.tooling":
        "DB_URL=postgresql://postgres:pw@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres\nSECRET_KEY=k\n",
    });
    expect(() => hostedTarget(product)).toThrow(/production project/);
  });
});

describe("chooseKind", () => {
  it("honours an explicit preference over everything", () => {
    const product = makeProduct();
    writeFiles(product.root, { ".env.tooling": "DEVTOOLS_TARGET=hosted\n" });
    expect(chooseKind(product, "local")).toBe("local");
  });

  it("uses what setup recorded", () => {
    const product = makeProduct();
    writeFiles(product.root, {
      ".env.tooling": "DEVTOOLS_TARGET=local\nDB_URL=postgres://x\n",
    });
    expect(chooseKind(product, undefined)).toBe("local");
  });

  it("is hosted when only a DB_URL is there, and local with nothing", () => {
    const hosted = makeProduct({
      files: { ".env.tooling": "DB_URL=postgres://x\n" },
    });
    expect(chooseKind(hosted, undefined)).toBe("hosted");
    expect(chooseKind(makeProduct(), undefined)).toBe("local");
  });
});
