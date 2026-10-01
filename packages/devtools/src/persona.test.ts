/**
 * Unit tests for the pure pieces of `persona`: kind parsing and the
 * development-only tier refusal. Everything else here (account creation,
 * cleanup, filing a sample report) talks to `auth.admin` and Postgres and has
 * no local-only path to unit test against, matching `moderation.ts` and
 * `grantRoot.ts`'s own lack of coverage.
 */
import { describe, expect, it, vi } from "vitest";
import { isPersonaKind, refuseUnlessDevelopment } from "./persona.js";
import type { DbConnection } from "@devdogsuga/cli-core/db/connection";

function connection(tier: DbConnection["tier"]): DbConnection {
  return {
    tier,
    devDatabase: undefined,
    dbUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    projectRef: undefined,
  };
}

describe("isPersonaKind", () => {
  it("accepts member and moderator", () => {
    expect(isPersonaKind("member")).toBe(true);
    expect(isPersonaKind("moderator")).toBe(true);
  });

  it("rejects anything else, including the retired author persona", () => {
    expect(isPersonaKind("author")).toBe(false);
    expect(isPersonaKind("")).toBe(false);
  });
});

describe("refuseUnlessDevelopment", () => {
  it("allows development", () => {
    expect(refuseUnlessDevelopment(connection("development"), "x")).toBe(false);
  });

  it("refuses staging and production, naming the tier and the fix on stderr", () => {
    let stderr = "";
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderr += String(chunk);
        return true;
      });

    expect(
      refuseUnlessDevelopment(connection("production"), "devtools persona"),
    ).toBe(true);
    expect(stderr).toContain("devtools persona");
    expect(stderr).toContain("production");
    expect(stderr).toContain("--tier development:local");

    write.mockRestore();
  });
});
