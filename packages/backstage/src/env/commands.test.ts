import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Restored verbatim from DevDogsUGA's original `src/env/commands.test.ts`
 * (see `../../MOVED-TESTS.md`) — no fixture needed. Every assertion below
 * routes by TARGET NAME and explicit argument maps
 * (`pushToGithub(target, secrets, publicValues)`), never by looking a key up
 * in the registry; the one exception, `SUPABASE_ACCESS_TOKEN`'s `tier:
 * "apply"` classification, comes from devtools' own operator manifest
 * (`packages/devtools/env.ts`), which `env/discovery.ts` now loads
 * unconditionally (`ownManifestPath()`) — the gap this file used to be moved
 * out over.
 *
 * Which GitHub store each half of a push is sent to.
 *
 * `selection.ts` decides WHICH keys are secrets and which are variables, and
 * its own tests cover that thoroughly. This file covers the step after: that
 * the two maps are handed to the two different `gh` commands, and to the right
 * ones. That dispatch is two lines, it has no return value to inspect, and
 * getting it backwards is the one mistake in this design that cannot be undone:
 * a secret written to the variable store is readable by everyone who can see
 * the repository's Actions config, and deleting it afterwards does not unread
 * it.
 *
 * The `gh` client is mocked wholesale, so nothing here can reach the network or
 * spawn a binary. That also means these assertions are about ARGUMENTS, not
 * about GitHub's behaviour: no test in this repository can verify what GitHub
 * does with them.
 */
vi.mock("../gh/client.js", () => ({
  listSecrets: vi.fn(async () => []),
  listVariables: vi.fn(async () => []),
  listRepositoryVariables: vi.fn(async () => []),
  setSecret: vi.fn(async () => undefined),
  setVariable: vi.fn(async () => undefined),
}));

// Nothing here should ever reach Bitwarden. Mocked so that a regression which
// made it try fails as a loud assertion rather than as a token prompt.
vi.mock("../bws/client.js", () => ({
  listSecrets: vi.fn(async () => []),
  createSecret: vi.fn(async () => undefined),
  updateSecret: vi.fn(async () => undefined),
  projectIdFor: vi.fn(async () => {
    throw new Error("pushToGithub must not touch Bitwarden");
  }),
  byKey: () => new Map(),
}));

import { setSecret, setVariable } from "../gh/client.js";
import { pushToGithub } from "./commands.js";
import { loadRegistry } from "@devdogsuga/cli-core/env/discovery";
import { declare, define } from "@devdogsuga/env";
import { z } from "zod";

beforeAll(async () => {
  await loadRegistry();
  declare({
    source: "commands-test",
    server: {
      TEST_BUILD_URL: define(z.string(), {
        doc: "Public, baked into the bundle.",
        scope: "environment",
        secrecy: "public",
        build: true,
      }),
    },
  });
});

beforeEach(() => {
  vi.mocked(setSecret).mockClear();
  vi.mocked(setVariable).mockClear();
});

describe("pushToGithub", () => {
  it("sends secrets to the SECRET store and variables to the VARIABLE store", async () => {
    await pushToGithub(
      "staging",
      new Map([["DISCORD_TOKEN", "tok"]]),
      new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
      true,
    );

    // Whole-call comparisons rather than `toHaveBeenCalledWith`, so a value
    // that reached BOTH stores fails too. That is the outcome that looks
    // healthiest and is worst.
    expect(vi.mocked(setSecret).mock.calls).toEqual([
      ["staging", "DISCORD_TOKEN", "tok"],
    ]);
    expect(vi.mocked(setVariable).mock.calls).toEqual([
      ["staging", "PROJECT_REF", "abcdefghijklmnop"],
    ]);
  });

  it("does nothing at all when both maps are empty", async () => {
    // The negative control for the two above: they assert "exactly these
    // calls", which is only meaningful if some inputs produce none.
    await pushToGithub("staging", new Map(), new Map(), true);
    expect(vi.mocked(setSecret).mock.calls).toEqual([]);
    expect(vi.mocked(setVariable).mock.calls).toEqual([]);
  });

  /**
   * The reviewer gate at the level a push actually performs it.
   *
   * `production` is the one routed production environment and sits behind
   * required reviewers, so it takes the whole project, apply-tier credential
   * included. The gate is what `staging` and `preflight` may NOT hold; the
   * last test asserts that by name.
   */
  describe("the reviewer gate", () => {
    it("sends the whole production project, apply-tier credential included, to production", async () => {
      await pushToGithub(
        "production",
        new Map([
          ["CLOUDFLARE_API_TOKEN", "cf"],
          ["SUPABASE_OAUTH_CLIENT_SECRET", "oauth"],
          ["SUPABASE_ACCESS_TOKEN", "sbp"],
        ]),
        new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
        true,
      );

      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["production", "CLOUDFLARE_API_TOKEN", "cf"],
        ["production", "SUPABASE_OAUTH_CLIENT_SECRET", "oauth"],
        ["production", "SUPABASE_ACCESS_TOKEN", "sbp"],
      ]);
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["production", "PROJECT_REF", "abcdefghijklmnop"],
      ]);
    });

    it("never writes anything to production-apply, or a non-build key to production-build", async () => {
      await pushToGithub(
        "production",
        new Map([["DISCORD_TOKEN", "tok"]]),
        new Map([["BASE_URL", "https://example.org"]]),
        true,
      );
      const written = [
        ...vi.mocked(setSecret).mock.calls,
        ...vi.mocked(setVariable).mock.calls,
      ].map(([env]) => env);
      expect(new Set(written)).toEqual(new Set(["production"]));
    });

    it("writes build: true keys to <target>-build as variables, and only those", async () => {
      for (const [target, build] of [
        ["staging", "staging-build"],
        ["production", "production-build"],
      ] as const) {
        vi.mocked(setSecret).mockClear();
        vi.mocked(setVariable).mockClear();
        await pushToGithub(
          target,
          new Map([["DISCORD_TOKEN", "tok"]]),
          new Map([
            ["TEST_BUILD_URL", "https://example.org"],
            ["PROJECT_REF", "abcdefghijklmnop"],
          ]),
          true,
        );
        // Whole-call comparisons: a secret reaching the build environment, or
        // a runtime-only variable, fails these.
        expect(vi.mocked(setSecret).mock.calls).toEqual([
          [target, "DISCORD_TOKEN", "tok"],
        ]);
        expect(vi.mocked(setVariable).mock.calls).toEqual([
          [target, "TEST_BUILD_URL", "https://example.org"],
          [target, "PROJECT_REF", "abcdefghijklmnop"],
          [build, "TEST_BUILD_URL", "https://example.org"],
        ]);
      }
    });

    it("never hands a secret to a build environment, even one the key set would take", async () => {
      // A build key that somehow arrived as a SECRET (it cannot through
      // `selectForPush`, which sends public keys to the variable map) is still
      // not written to the build environment.
      await pushToGithub(
        "staging",
        new Map([["TEST_BUILD_URL", "https://example.org"]]),
        new Map(),
        true,
      );
      expect(vi.mocked(setSecret).mock.calls.map(([env]) => env)).not.toContain(
        "staging-build",
      );
      expect(vi.mocked(setVariable).mock.calls).toEqual([]);
    });

    it("does not push to the build environments for a preflight push", async () => {
      await pushToGithub(
        "preflight",
        new Map(),
        new Map([["TEST_BUILD_URL", "https://example.org"]]),
        true,
      );
      expect(vi.mocked(setVariable).mock.calls.map(([env]) => env)).toEqual([
        "preflight",
      ]);
    });

    it("keeps the apply-tier credential out of staging and preflight", async () => {
      // The regression that would make this change a widening rather than a
      // fix: `excludeKeys: []` written on the wrong row. An apply-tier key in
      // a staging or preflight file still has nowhere to go.
      await pushToGithub(
        "staging",
        new Map([
          ["SUPABASE_ACCESS_TOKEN", "sbp"],
          ["DISCORD_TOKEN", "tok"],
        ]),
        new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
        true,
      );
      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["staging", "DISCORD_TOKEN", "tok"],
      ]);
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["staging", "PROJECT_REF", "abcdefghijklmnop"],
      ]);

      vi.mocked(setSecret).mockClear();
      vi.mocked(setVariable).mockClear();

      await pushToGithub(
        "preflight",
        new Map([
          ["DB_URL", "postgresql://migrations-only"],
          ["SUPABASE_ACCESS_TOKEN", "sbp"],
        ]),
        new Map([["PROJECT_REF", "abcdefghijklmnop"]]),
        true,
      );
      expect(vi.mocked(setSecret).mock.calls).toEqual([
        ["preflight", "DB_URL", "postgresql://migrations-only"],
      ]);
      expect(vi.mocked(setVariable).mock.calls).toEqual([
        ["preflight", "PROJECT_REF", "abcdefghijklmnop"],
      ]);
    });
  });

  it("passes the value through byte-for-byte", async () => {
    // A variable's value is readable back, so `audit` compares it against
    // Bitwarden. Any trimming, quoting or newline added here would make every
    // later audit report drift against a copy that is actually identical, and
    // re-pushing would not fix it.
    const nasty = "aB3#xY9$k\nline2 ";
    await pushToGithub(
      "staging",
      new Map(),
      new Map([["BASE_URL", nasty]]),
      true,
    );
    expect(vi.mocked(setVariable).mock.calls[0]![2]).toBe(nasty);
  });
});
