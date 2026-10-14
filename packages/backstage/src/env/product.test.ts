import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prompts would hang on a non-interactive stdin. Every run below passes
// `yes: true` except the ones that test a refusal, which must return before a
// prompt; `confirm` throwing makes a regression that reaches one fail loudly.
vi.mock("@clack/prompts", () => ({
  cancel: vi.fn(),
  confirm: vi.fn(async () => {
    throw new Error("unexpected prompt");
  }),
  isCancel: () => false,
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
  note: vi.fn(),
  select: vi.fn(),
}));

import {
  resolveProduct,
  resolveProductCheckout,
  runProductAudit,
  runProductPull,
  runProductPush,
  selectProductPush,
  type ProductEnvDeps,
} from "./product.js";

/** In-memory Bitwarden and GitHub; records every call for assertions. */
function fakes(initial: {
  bws?: Record<string, Record<string, string>>;
  ghSecrets?: string[];
  ghVariables?: Record<string, string>;
  ghRepoVariables?: string[];
  ghUnreadable?: boolean;
}) {
  const projects = new Map(
    Object.entries(initial.bws ?? {}).map(([name, secrets]) => [
      name,
      new Map(Object.entries(secrets)),
    ]),
  );
  const calls = {
    projectIdFor: [] as string[],
    created: [] as [string, string][],
    updated: [] as [string, string][],
    setSecret: [] as [string, string, string][],
    setVariable: [] as [string, string, string][],
    ghRepos: [] as string[],
  };
  const now = new Date("2026-10-13T00:00:00Z").toISOString();
  const deps: ProductEnvDeps = {
    bws: {
      projectIdFor: async (name) => {
        calls.projectIdFor.push(name);
        if (!projects.has(name)) throw new Error(`No project named "${name}".`);
        return name;
      },
      listSecrets: async (id) =>
        [...(projects.get(id) ?? [])].map(([key, value]) => ({
          id: `${id}/${key}`,
          key,
          value,
          note: "",
          projectId: id,
          revisionDate: now,
        })),
      createSecret: async (id, key, value) => {
        calls.created.push([id, key]);
        projects.get(id)!.set(key, value);
      },
      updateSecret: async (secret, value) => {
        calls.updated.push([secret.projectId, secret.key]);
        projects.get(secret.projectId)!.set(secret.key, value);
      },
    },
    gh: {
      listSecrets: async (env, repo) => {
        calls.ghRepos.push(repo);
        if (initial.ghUnreadable) throw new Error("404");
        return (initial.ghSecrets ?? []).map((name) => ({
          name,
          updatedAt: "2026-10-14T00:00:00Z",
        }));
      },
      listVariables: async (env, repo) => {
        calls.ghRepos.push(repo);
        return Object.entries(initial.ghVariables ?? {}).map(
          ([name, value]) => ({ name, value, updatedAt: now }),
        );
      },
      listRepositoryVariables: async (repo) => {
        calls.ghRepos.push(repo);
        return (initial.ghRepoVariables ?? []).map((name) => ({
          name,
          updatedAt: now,
        }));
      },
      setSecret: async (env, name, _value, repo) => {
        calls.setSecret.push([env, name, repo]);
      },
      setVariable: async (env, name, _value, repo) => {
        calls.setVariable.push([env, name, repo]);
      },
    },
  };
  return { deps, calls, projects };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "product-env-"));
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = undefined;
});

const options = (over: Record<string, unknown> = {}) => ({
  product: "dogdays" as const,
  target: "staging" as const,
  checkout: dir,
  yes: true,
  ...over,
});

describe("selectProductPush", () => {
  it("makes the product's public keys variables and everything else a secret", () => {
    const sel = selectProductPush(
      [
        ["PROJECT_REF", "abc"],
        ["API_URL", "https://x"],
        ["DB_URL", "postgres://secret"],
        ["SECRET_KEY", "sk"],
      ],
      "dogdays",
    );
    expect([...sel.variables.keys()]).toEqual(["PROJECT_REF", "API_URL"]);
    expect([...sel.secrets.keys()]).toEqual(["DB_URL", "SECRET_KEY"]);
  });

  it("fails safe: an unlisted key is sealed, never published", () => {
    const sel = selectProductPush([["SOME_NEW_URL", "https://x"]], "dogdays");
    expect(sel.variables.size).toBe(0);
    expect(sel.secrets.has("SOME_NEW_URL")).toBe(true);
  });

  it("skips empty values, refuses the vault token and GITHUB_ names", () => {
    const sel = selectProductPush(
      [
        ["DB_URL", ""],
        ["BWS_ACCESS_TOKEN", "t"],
        ["GITHUB_TOKEN", "g"],
      ],
      "dogpack",
    );
    expect(sel.secrets.size).toBe(0);
    expect(sel.refused).toEqual(["BWS_ACCESS_TOKEN"]);
    expect(sel.invalid).toEqual(["GITHUB_TOKEN"]);
  });

  it("uses each product's own variable list", () => {
    const pack = selectProductPush([["PLATFORM_API_URL", "u"]], "dogpack");
    const days = selectProductPush([["PLATFORM_API_URL", "u"]], "dogdays");
    expect(pack.variables.size).toBe(1);
    expect(days.secrets.size).toBe(1);
  });
});

describe("resolveProduct", () => {
  it("accepts a product and refuses the rest", () => {
    expect(resolveProduct("dogpack")).toBe("dogpack");
    expect(resolveProduct("platform")).toBeNull();
  });
});

describe("resolveProductCheckout", () => {
  it("prefers --checkout", () => {
    expect(resolveProductCheckout("dogdays", dir, "/")).toEqual({ path: dir });
  });

  it("recognises the working directory as the product by its config", () => {
    writeFileSync(
      join(dir, "devtools.config.json"),
      JSON.stringify({ product: "dogpack" }),
    );
    const nested = join(dir, "lib");
    mkdirSync(nested);
    expect(resolveProductCheckout("dogpack", undefined, nested, null)).toEqual({
      path: dir,
    });
    // The same directory is not DogDays.
    expect(
      "tried" in resolveProductCheckout("dogdays", undefined, nested, null),
    ).toBe(true);
  });

  it("falls back to the product's directory beside the clone", () => {
    const root = join(dir, "DevDogsUGA");
    const sibling = join(dir, "DogDays");
    mkdirSync(root);
    mkdirSync(sibling);
    expect(resolveProductCheckout("dogdays", undefined, root, root)).toEqual({
      path: sibling,
    });
  });

  it("reports where it looked when there is none", () => {
    const root = join(dir, "DevDogsUGA");
    mkdirSync(root);
    const found = resolveProductCheckout("dogpack", undefined, root, root);
    expect(found).toEqual({ tried: [join(dir, "DogPack")] });
  });
});

describe("runProductPush", () => {
  it("writes the product's own project and repo, nothing of the platform's", async () => {
    writeFileSync(
      join(dir, ".env.staging"),
      'PROJECT_REF="abc"\nDB_URL="postgres://x"\n',
    );
    const { deps, calls } = fakes({ bws: { "dogdays-staging": {} } });
    await runProductPush(options(), deps);

    expect(calls.projectIdFor).toEqual(["dogdays-staging"]);
    expect(calls.created).toEqual([
      ["dogdays-staging", "DB_URL"],
      ["dogdays-staging", "PROJECT_REF"],
    ]);
    // Secrets and variables each reach their own store, in the product repo's
    // `staging` environment.
    expect(calls.setSecret).toEqual([
      ["staging", "DB_URL", "DevDogsUGA/DogDays"],
    ]);
    expect(calls.setVariable).toEqual([
      ["staging", "PROJECT_REF", "DevDogsUGA/DogDays"],
    ]);
  });

  it("reads the target's own file, not .env", async () => {
    writeFileSync(join(dir, ".env"), 'DB_URL="dev"\n');
    const { deps, calls } = fakes({ bws: { "dogpack-preflight": {} } });
    await runProductPush(
      options({ product: "dogpack", target: "preflight" }),
      deps,
    );
    // `.env` has a value but `.env.preflight` does not exist: nothing to push.
    expect(calls.created).toEqual([]);
    expect(process.exitCode).toBe(1);
  });

  it("does not create a missing Bitwarden project", async () => {
    writeFileSync(join(dir, ".env.staging"), 'DB_URL="x"\n');
    const { deps, calls } = fakes({});
    await expect(runProductPush(options(), deps)).rejects.toThrow(
      /No project named "dogdays-staging"/,
    );
    expect(calls.created).toEqual([]);
    expect(calls.setSecret).toEqual([]);
  });

  it("refuses production without a prompt, before touching anything", async () => {
    writeFileSync(join(dir, ".env.production"), 'DB_URL="x"\n');
    const { deps, calls } = fakes({ bws: { "dogdays-production": {} } });
    await runProductPush(options({ target: "production" }), deps);
    expect(process.exitCode).toBe(1);
    expect(calls.projectIdFor).toEqual([]);
    expect(calls.setSecret).toEqual([]);
  });

  it("updates changed values and leaves project-only keys alone", async () => {
    writeFileSync(join(dir, ".env.staging"), 'DB_URL="new"\n');
    const { deps, calls, projects } = fakes({
      bws: { "dogdays-staging": { DB_URL: "old", KEEP: "k" } },
    });
    await runProductPush(options(), deps);
    expect(calls.updated).toEqual([["dogdays-staging", "DB_URL"]]);
    expect(projects.get("dogdays-staging")!.get("KEEP")).toBe("k");
  });

  it("never uploads the vault token", async () => {
    writeFileSync(
      join(dir, ".env.staging"),
      'BWS_ACCESS_TOKEN="t"\nDB_URL="x"\n',
    );
    const { deps, calls } = fakes({ bws: { "dogdays-staging": {} } });
    await runProductPush(options(), deps);
    expect(calls.created.map(([, k]) => k)).toEqual(["DB_URL"]);
    expect(calls.setSecret.map(([, k]) => k)).toEqual(["DB_URL"]);
  });
});

describe("runProductPull", () => {
  it("imports the product's project into the product file", async () => {
    const { deps } = fakes({
      bws: {
        "dogpack-production": { DB_URL: "postgres://p", API_URL: "https://a" },
      },
    });
    await runProductPull(
      options({ product: "dogpack", target: "production" }),
      deps,
    );
    const text = readFileSync(join(dir, ".env.production"), "utf8");
    expect(text).toContain("DB_URL=");
    expect(text).toContain("API_URL=");
  });

  it("writes nothing when the project is empty, and says how to start", async () => {
    const { deps } = fakes({ bws: { "dogdays-staging": {} } });
    await runProductPull(options(), deps);
    expect(() => readFileSync(join(dir, ".env.staging"), "utf8")).toThrow();
  });
});

describe("runProductAudit", () => {
  const filled = async () => {
    writeFileSync(
      join(dir, ".env.staging"),
      'PROJECT_REF="abc"\nDB_URL="postgres://x"\n',
    );
  };

  it("reports no drift when file, Bitwarden and GitHub agree", async () => {
    await filled();
    const { deps, calls } = fakes({
      bws: {
        "dogdays-staging": { PROJECT_REF: "abc", DB_URL: "postgres://x" },
      },
      ghSecrets: ["DB_URL"],
      ghVariables: { PROJECT_REF: "abc" },
    });
    await runProductAudit(options(), deps);
    expect(process.exitCode).toBeUndefined();
    // Every GitHub read was against the product repo.
    expect(new Set(calls.ghRepos)).toEqual(new Set(["DevDogsUGA/DogDays"]));
  });

  it("flags a secret missing from the GitHub environment", async () => {
    await filled();
    const { deps } = fakes({
      bws: {
        "dogdays-staging": { PROJECT_REF: "abc", DB_URL: "postgres://x" },
      },
      ghSecrets: [],
      ghVariables: { PROJECT_REF: "abc" },
    });
    await runProductAudit(options(), deps);
    expect(process.exitCode).toBe(1);
  });

  it("flags a variable whose value drifted", async () => {
    await filled();
    const { deps } = fakes({
      bws: {
        "dogdays-staging": { PROJECT_REF: "abc", DB_URL: "postgres://x" },
      },
      ghSecrets: ["DB_URL"],
      ghVariables: { PROJECT_REF: "other" },
    });
    await runProductAudit(options(), deps);
    expect(process.exitCode).toBe(1);
  });

  it("flags a public key sitting in the secret store", async () => {
    await filled();
    const { deps } = fakes({
      bws: {
        "dogdays-staging": { PROJECT_REF: "abc", DB_URL: "postgres://x" },
      },
      ghSecrets: ["DB_URL", "PROJECT_REF"],
      ghVariables: { PROJECT_REF: "abc" },
    });
    await runProductAudit(options(), deps);
    expect(process.exitCode).toBe(1);
  });

  it("does not call an unreadable environment clean", async () => {
    await filled();
    const { deps } = fakes({
      bws: {
        "dogdays-staging": { PROJECT_REF: "abc", DB_URL: "postgres://x" },
      },
      ghUnreadable: true,
    });
    await runProductAudit(options(), deps);
    expect(process.exitCode).toBe(1);
  });
});
