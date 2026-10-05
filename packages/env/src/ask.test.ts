import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LoadModule from "./load.js";

const answers: unknown[] = [];
const asked: string[] = [];
vi.mock("@clack/prompts", () => ({
  select: vi.fn(({ message }: { message: string }) => {
    asked.push(message);
    return Promise.resolve(answers.shift());
  }),
  isCancel: () => false,
  cancel: vi.fn(),
}));
// The stack probe would otherwise reach for a real port.
vi.mock("./load.js", async (original) => ({
  ...(await original<typeof LoadModule>()),
  probeLocalStack: () => Promise.resolve(false),
}));

const { askSession, rememberDevDatabase, rememberedDevDatabase } =
  await import("./ask.js");

let root: string;
const env = () => readFileSync(join(root, ".env"), "utf8");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "with-env-ask-"));
  answers.length = 0;
  asked.length = 0;
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const REMOTE = "DB_URL=postgres://u:p@db.example.com:5432/postgres\n";

function ask(over: Partial<Parameters<typeof askSession>[0]> = {}) {
  return askSession({
    root,
    explicit: undefined,
    deployEnv: undefined,
    devDb: undefined,
    available: ["development"],
    canAsk: true,
    unanswered: "probe",
    name: "test",
    ...over,
  });
}

describe("rememberDevDatabase", () => {
  it("appends DEV_DB to .env and reads it back", async () => {
    writeFileSync(join(root, ".env"), "A=1");
    await rememberDevDatabase(root, "local");
    expect(env()).toMatch(/^A=1\n\n# .*\nDEV_DB=local\n$/);
    expect(await rememberedDevDatabase(root)).toBe("local");
  });

  it("replaces an existing line in place", async () => {
    writeFileSync(join(root, ".env"), "A=1\nexport DEV_DB=local\nB=2\n");
    await rememberDevDatabase(root, "remote");
    expect(env()).toBe("A=1\nDEV_DB=remote\nB=2\n");
  });

  it("remembers nothing when .env has no DEV_DB, or there is no .env", async () => {
    expect(await rememberedDevDatabase(root)).toBeUndefined();
    writeFileSync(join(root, ".env"), REMOTE);
    expect(await rememberedDevDatabase(root)).toBeUndefined();
  });
});

describe("askSession", () => {
  it("asks local or remote the first time, and remembers when told to", async () => {
    writeFileSync(join(root, ".env"), REMOTE);
    answers.push("development:local", true);
    const result = await ask();
    expect(result).toMatchObject({ ok: true, devDatabase: "local" });
    expect(asked).toHaveLength(2);
    expect(env()).toContain("DEV_DB=local");

    asked.length = 0;
    expect(await ask()).toMatchObject({ ok: true, devDatabase: "local" });
    expect(asked).toEqual([]);
  });

  it("writes nothing for just this once, so the next run asks again", async () => {
    writeFileSync(join(root, ".env"), REMOTE);
    answers.push("development:remote", false);
    expect(await ask()).toMatchObject({ ok: true, devDatabase: "remote" });
    expect(env()).toBe(REMOTE);

    answers.push("development:local", false);
    await ask();
    expect(asked).toHaveLength(4);
  });

  it("asks under DEPLOY_ENV=development too", async () => {
    writeFileSync(join(root, ".env"), REMOTE);
    answers.push("development:remote", false);
    expect(await ask({ deployEnv: "development" })).toMatchObject({
      devDatabase: "remote",
    });
  });

  it("lets an exported DEV_DB beat the remembered one", async () => {
    writeFileSync(join(root, ".env"), REMOTE + "DEV_DB=local\n");
    expect(await ask({ devDb: "remote" })).toMatchObject({
      devDatabase: "remote",
    });
    expect(asked).toEqual([]);
  });

  it("refuses an invalid remembered value by name", async () => {
    writeFileSync(join(root, ".env"), REMOTE + "DEV_DB=both\n");
    const result = await ask();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('DEV_DB="both"');
  });

  it("does not offer to remember a tier with no database question", async () => {
    writeFileSync(join(root, ".env"), REMOTE);
    answers.push("staging");
    expect(await ask({ available: ["development", "staging"] })).toMatchObject({
      tier: "staging",
    });
    expect(asked).toHaveLength(1);
  });

  describe("with nobody to ask", () => {
    it("lets the probe decide when unanswered is probe", async () => {
      writeFileSync(join(root, ".env"), REMOTE);
      const result = await ask({ canAsk: false });
      expect(result).toMatchObject({ ok: true, tier: "development" });
      expect(result.ok && result.devDatabase).toBeUndefined();
    });

    it("refuses when unanswered is refuse", async () => {
      writeFileSync(join(root, ".env"), REMOTE);
      const result = await ask({ canAsk: false, unanswered: "refuse" });
      expect(result.ok).toBe(false);
    });

    it("uses the remembered answer either way", async () => {
      writeFileSync(join(root, ".env"), REMOTE + "DEV_DB=remote\n");
      expect(await ask({ canAsk: false, unanswered: "refuse" })).toMatchObject({
        ok: true,
        devDatabase: "remote",
      });
    });
  });
});
