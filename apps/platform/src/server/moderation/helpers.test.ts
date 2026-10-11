// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseContentTypes } from "./contentTypes";
import { endpointUrlProblem } from "./endpoint";
import { failureFromError } from "./errors";
import { isDeliveryMessage } from "./queueMessage";
import { deriveClientSecret } from "./secrets";

describe("endpointUrlProblem", () => {
  it("accepts a public https URL", () => {
    expect(
      endpointUrlProblem(
        "https://abcd.supabase.co/functions/v1/platform-moderation",
      ),
    ).toBeNull();
  });

  it.each([
    "not a url",
    "http://app.example.com/hook",
    "https://user:pw@app.example.com/hook",
    "https://app.example.com:8443/hook",
    "https://localhost/hook",
    "https://printer.local/hook",
    "https://db.internal/hook",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://intranet/hook",
    `https://app.example.com/${"a".repeat(600)}`,
  ])("refuses %s", (url) => {
    expect(endpointUrlProblem(url)).not.toBeNull();
  });
});

describe("parseContentTypes", () => {
  it("parses one type per line with an optional link", () => {
    expect(
      parseContentTypes(
        "session | Study session | https://app.example/s/{ref}\n\nprofile | Profile\n",
      ),
    ).toEqual({
      ok: true,
      types: [
        {
          contentType: "session",
          label: "Study session",
          urlTemplate: "https://app.example/s/{ref}",
        },
        { contentType: "profile", label: "Profile", urlTemplate: null },
      ],
    });
  });

  it.each([
    ["", "at least one"],
    ["Session | Label", "not a content type"],
    ["session", "needs a label"],
    ["session | A\nsession | B", "twice"],
    ["session | A | http://insecure.example/{ref}", "https://"],
  ])("refuses %j", (text, message) => {
    const result = parseContentTypes(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });
});

describe("failureFromError", () => {
  it("finds the code on the error or on a wrapped cause", () => {
    expect(
      failureFromError(new Error("moderation:rate_limited")),
    ).toMatchObject({ status: 429 });
    expect(
      failureFromError(
        new Error("Failed query: select ...", {
          cause: new Error("moderation:unknown_user"),
        }),
      ),
    ).toMatchObject({ status: 422, code: "unknown_user" });
  });

  it("returns null for anything that is not ours", () => {
    expect(failureFromError(new Error("deadlock detected"))).toBeNull();
    expect(failureFromError(new Error("moderation:made_up"))).toBeNull();
    expect(failureFromError("moderation:rate_limited")).toBeNull();
    expect(failureFromError(null)).toBeNull();
  });
});

describe("isDeliveryMessage", () => {
  it("accepts only a uuid delivery id", () => {
    expect(
      isDeliveryMessage({ deliveryId: "66666666-6666-4666-8666-666666666666" }),
    ).toBe(true);
    expect(isDeliveryMessage({ deliveryId: "nope" })).toBe(false);
    expect(isDeliveryMessage({})).toBe(false);
    expect(isDeliveryMessage(null)).toBe(false);
  });
});

describe("deriveClientSecret", () => {
  const key = "unit-test-moderation-signing-key-0123456789";
  const client = "11111111-1111-4111-8111-111111111111";

  it("is deterministic, whsec_-shaped and 32 bytes", async () => {
    const a = await deriveClientSecret(key, client, 1);
    expect(a).toBe(await deriveClientSecret(key, client, 1));
    expect(a).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
  });

  it("differs by key, client and version", async () => {
    const base = await deriveClientSecret(key, client, 1);
    expect(await deriveClientSecret(`${key}x`, client, 1)).not.toBe(base);
    expect(
      await deriveClientSecret(key, "22222222-2222-4222-8222-222222222222", 1),
    ).not.toBe(base);
    expect(await deriveClientSecret(key, client, 2)).not.toBe(base);
  });
});
