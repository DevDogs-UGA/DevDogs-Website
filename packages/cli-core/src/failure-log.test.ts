import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// The log module is TypeScript with `.js` specifiers, so the child runs under tsx.
const tsx = createRequire(import.meta.url).resolve("tsx/esm");
import {
  failureLogDir,
  isFailureCode,
  redact,
  renderFailureLog,
} from "./failure-log.js";

const base = {
  argv: ["supabase", "db", "push"],
  code: 1,
  ran: ["pnpm exec supabase db push  (exit 1)"],
  output: "something went wrong\n",
  error: new Error("boom"),
  eventId: undefined as string | undefined,
  now: new Date("2026-10-01T12:00:00Z"),
  env: { DEPLOY_ENV: "staging" } as NodeJS.ProcessEnv,
};

describe("isFailureCode", () => {
  it("treats a clean exit, Ctrl-C, SIGTERM and drift as not failures", () => {
    for (const code of [0, 2, 130, 143])
      expect(isFailureCode(code)).toBe(false);
  });

  it("treats any other non-zero code as a failure", () => {
    for (const code of [1, 3, 127, 137]) expect(isFailureCode(code)).toBe(true);
  });
});

describe("redact", () => {
  it("hides credentials inside URLs", () => {
    expect(redact("postgres://postgres:hunter22@db.example.com/x", {})).toBe(
      "postgres://***@db.example.com/x",
    );
  });

  it("hides the value of an environment variable named like a secret", () => {
    const env = { SERVICE_KEY: "abcdefgh12345", PLAIN: "zzzzzzzz9999" };
    expect(redact("token abcdefgh12345 here", env)).toBe(
      "token <redacted> here",
    );
    expect(redact("plain zzzzzzzz9999", env)).toBe("plain zzzzzzzz9999");
  });

  it("leaves short values alone, which would shred ordinary words", () => {
    expect(redact("a b c", { SOME_KEY: "b" })).toBe("a b c");
  });
});

describe("renderFailureLog", () => {
  it("records the command, exit code, tier, tools that ran and the error", () => {
    const text = renderFailureLog({ ...base, env: { DEPLOY_ENV: "staging" } });
    expect(text).toContain("command:   devtools supabase db push");
    expect(text).toContain("exit code: 1");
    expect(text).toContain("tier:      staging");
    expect(text).toContain("pnpm exec supabase db push  (exit 1)");
    expect(text).toContain("Error: boom");
    expect(text).toContain("something went wrong");
    expect(text).toContain("#tech-support");
  });

  it("names the Sentry event when telemetry sent one, and says so when not", () => {
    expect(renderFailureLog({ ...base, eventId: "evt-1" })).toContain(
      "sentry:    evt-1",
    );
    expect(renderFailureLog(base)).toContain("sentry:    none");
  });

  it("redacts secrets in the command, output and error", () => {
    const text = renderFailureLog({
      ...base,
      argv: ["psql", "postgres://u:secretpass@h/db"],
      output: "token sk_live_1234567890\n",
      env: { API_TOKEN: "sk_live_1234567890" },
    });
    expect(text).not.toContain("secretpass");
    expect(text).not.toContain("sk_live_1234567890");
  });
});

describe("failureLogDir", () => {
  it("honours DEVTOOLS_LOG_DIR, then XDG_STATE_HOME", () => {
    expect(failureLogDir({ DEVTOOLS_LOG_DIR: "/x" })).toBe("/x");
    expect(failureLogDir({ XDG_STATE_HOME: "/s" })).toBe("/s/devdogs/logs");
  });
});

describe("writing the log on exit", () => {
  it("writes a file and prints its path when the process exits non-zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "failure-log-"));
    const script = join(dir, "run.mjs");
    writeFileSync(
      script,
      `import { installFailureLog, noteError } from ${JSON.stringify(new URL("./failure-log.ts", import.meta.url).href)};
       installFailureLog({ argv: ["demo"], eventId: () => "evt-9" });
       noteError(new Error("kaboom"));
       process.exitCode = 1;`,
    );
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(tsx).href, script],
      { env: { ...process.env, DEVTOOLS_LOG_DIR: dir }, encoding: "utf8" },
    );
    const logs = readdirSync(dir).filter((name) => name.endsWith(".log"));
    try {
      expect(result.status).toBe(1);
      expect(logs).toHaveLength(1);
      expect(result.stderr).toContain(join(dir, logs[0]!));
      expect(result.stderr).toContain("Sentry event: evt-9");
      expect(readFileSync(join(dir, logs[0]!), "utf8")).toContain("kaboom");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing for a clean exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "failure-log-"));
    const script = join(dir, "run.mjs");
    writeFileSync(
      script,
      `import { installFailureLog } from ${JSON.stringify(new URL("./failure-log.ts", import.meta.url).href)};
       installFailureLog({ argv: ["demo"], eventId: () => undefined });`,
    );
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(tsx).href, script],
      { env: { ...process.env, DEVTOOLS_LOG_DIR: dir }, encoding: "utf8" },
    );
    try {
      expect(result.status).toBe(0);
      expect(readdirSync(dir).filter((n) => n.endsWith(".log"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
