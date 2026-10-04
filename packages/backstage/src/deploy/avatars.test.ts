import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDeployAvatars, seededBuckets, sniffImageType } from "./avatars.js";
import { DeployError } from "./report.js";

/**
 * Insert-only is the whole contract: a seeded headshot is uploaded once and
 * never sent with upsert, so an officer's own photo at the same key survives
 * every deploy. Storage is faked at `fetch`.
 */

const WEBP = new Uint8Array([
  ...Buffer.from("RIFF"),
  0,
  0,
  0,
  0,
  ...Buffer.from("WEBPVP8 "),
]);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-avatars-"));
  mkdirSync(join(root, "supabase/seed/officers/avatars"), { recursive: true });
  writeFileSync(
    join(root, "supabase/config.toml"),
    [
      "[storage.buckets.avatars]",
      "public = true",
      'objects_path = "./seed/officers/avatars"',
      "",
      "[auth]",
      'objects_path = "./not/a/bucket"',
    ].join("\n"),
  );
  for (const id of ["a", "b"]) {
    writeFileSync(join(root, "supabase/seed/officers/avatars", id), WEBP);
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function storage(existing: Set<string>, duplicate: "409" | "400-body" = "409") {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, headers });
    const key = url.split("/storage/v1/object/")[1]!;
    if (existing.has(key)) {
      return duplicate === "409"
        ? new Response('{"error":"Duplicate"}', { status: 409 })
        : new Response(
            '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}',
            { status: 400 },
          );
    }
    existing.add(key);
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const ENV = { API_URL: "https://api.example", SECRET_KEY: "sb_secret_x" };

describe("deploy avatars", () => {
  it("uploads only what is missing, and never with upsert", async () => {
    const { calls, fetchImpl } = storage(new Set(["avatars/a"]));
    await runDeployAvatars(ENV, { root, fetch: fetchImpl });

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.example/storage/v1/object/avatars/a",
      "https://api.example/storage/v1/object/avatars/b",
    ]);
    for (const { headers } of calls) {
      expect(headers["x-upsert"]).toBe("false");
      expect(headers["Content-Type"]).toBe("image/webp");
    }
  });

  it("reads older Storage's 400-with-409-body as already there", async () => {
    const { fetchImpl } = storage(
      new Set(["avatars/a", "avatars/b"]),
      "400-body",
    );
    await expect(
      runDeployAvatars(ENV, { root, fetch: fetchImpl }),
    ).resolves.toBeUndefined();
  });

  it("fails the step on any other refusal", async () => {
    const fetchImpl = (async () =>
      new Response("bad key", { status: 403 })) as unknown as typeof fetch;
    await expect(
      runDeployAvatars(ENV, { root, fetch: fetchImpl }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it("falls back to the project ref for the endpoint", async () => {
    const { calls, fetchImpl } = storage(new Set());
    await runDeployAvatars(
      { PROJECT_REF: "abc", SECRET_KEY: "k" },
      { root, fetch: fetchImpl },
    );
    expect(calls[0]!.url).toBe(
      "https://abc.supabase.co/storage/v1/object/avatars/a",
    );
  });

  it("refuses without the secret key, before reading anything", async () => {
    await expect(
      runDeployAvatars({ API_URL: "https://x" }, { root }),
    ).rejects.toThrow(DeployError);
  });
});

describe("seededBuckets", () => {
  it("takes objects_path from bucket sections only", () => {
    expect(
      seededBuckets(
        '[storage.buckets.avatars]\nobjects_path = "./seed/a"\n[auth]\nobjects_path = "./x"\n',
        "/repo/supabase",
      ),
    ).toEqual([{ bucket: "avatars", dir: "/repo/supabase/seed/a" }]);
  });
});

describe("sniffImageType", () => {
  it("knows WebP, and nothing it was not taught", () => {
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
