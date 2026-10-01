import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCommand, reportRan, runInGroup } from "./process-group.js";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("runInGroup", () => {
  it("resolves the child's exit code", async () => {
    const result = await runInGroup("sh", ["-c", "exit 3"], {
      stdio: "ignore",
    });
    expect(result).toEqual({ code: 3, signal: null });
  });

  it("reports a missing binary as exit 1", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const result = await runInGroup("devtools-no-such-binary", [], {
      stdio: "ignore",
    });
    write.mockRestore();
    expect(result.code).toBe(1);
  });

  it.skipIf(process.platform === "win32")(
    "kills grandchildren too when a stop signal arrives",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "group-"));
      const pidFile = join(dir, "pid");
      try {
        const running = runInGroup(
          "sh",
          ["-c", `sleep 60 & echo $! > ${pidFile}; wait`],
          { stdio: "ignore" },
        );
        await until(() => {
          try {
            return readFileSync(pidFile, "utf8").trim() !== "";
          } catch {
            return false;
          }
        });
        const grandchild = Number(readFileSync(pidFile, "utf8").trim());
        expect(alive(grandchild)).toBe(true);

        process.emit("SIGTERM");
        const result = await running;
        expect(result.signal).toBe("SIGTERM");
        await until(() => !alive(grandchild));
        expect(alive(grandchild)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("formatCommand", () => {
  it("never echoes a database URL", () => {
    expect(
      formatCommand("pnpm", [
        "exec",
        "supabase",
        "db",
        "push",
        "--db-url",
        "postgresql://postgres:hunter2@db.example.com:5432/postgres",
      ]),
    ).toBe("pnpm exec supabase db push --db-url <DB_URL>");
    expect(formatCommand("psql", ["--db-url=postgres://u:p@h/db"])).toBe(
      "psql --db-url=<DB_URL>",
    );
    expect(formatCommand("psql", ["postgresql://u:p@h/db"])).toBe(
      "psql postgresql://***@h/db",
    );
  });

  it("quotes arguments that need it", () => {
    expect(formatCommand("psql", ["-c", "select 1"])).toBe(
      'psql -c "select 1"',
    );
  });
});

describe("reportRan", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the command on stderr with the exit code on failure", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    reportRan("pnpm", ["exec", "supabase", "stop"], { code: 0, signal: null });
    reportRan("pnpm", ["exec", "supabase", "start"], { code: 2, signal: null });
    expect(write.mock.calls.map(([line]) => line)).toEqual([
      "Ran: pnpm exec supabase stop\n",
      "Ran: pnpm exec supabase start  (exit 2)\n",
    ]);
  });
});
