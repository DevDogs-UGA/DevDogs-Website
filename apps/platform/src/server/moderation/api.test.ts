// @vitest-environment node
/* eslint-disable @typescript-eslint/unbound-method -- asserting on vi.fn() members of a dependency object */
import {
  CLIENT_ID_HEADER,
  signMessage,
  type ReportRequest,
} from "@devdogsuga/sdk/moderation";
import { describe, expect, it, vi } from "vitest";
import { handleFileReport, type ReportApiDeps } from "./api";
import { deriveClientSecret } from "./secrets";

const KEY = "unit-test-moderation-signing-key-0123456789";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const APP = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "33333333-3333-4333-8333-333333333333";

const report: ReportRequest = {
  reporterUserId: "44444444-4444-4444-8444-444444444444",
  authorUserId: "55555555-5555-4555-8555-555555555555",
  contentType: "session",
  contentRef: "s-1",
  contentSnapshot: "Study session for CSCI 1301",
  reason: "spam",
};

function deps(overrides: Partial<ReportApiDeps> = {}): ReportApiDeps {
  return {
    signingKey: KEY,
    findClient: vi.fn(({ clientId }: never) => clientId),
    fileExternal: vi.fn(() =>
      Promise.resolve({ reportId: REPORT_ID, corroborated: false }),
    ),
    fileSandbox: vi.fn(() => Promise.resolve(REPORT_ID)),
    ...overrides,
  };
}

const production = (overrides: Partial<ReportApiDeps> = {}) =>
  deps({
    findClient: () =>
      Promise.resolve({ clientId: CLIENT, secretVersion: 1, appId: APP }),
    ...overrides,
  });

const development = (overrides: Partial<ReportApiDeps> = {}) =>
  deps({
    findClient: () =>
      Promise.resolve({ clientId: CLIENT, secretVersion: 1, appId: null }),
    ...overrides,
  });

async function signed(
  body: unknown,
  options: { clientId?: string | null; version?: number; key?: string } = {},
): Promise<Request> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const secret = await deriveClientSecret(
    options.key ?? KEY,
    CLIENT,
    options.version ?? 1,
  );
  const headers: Record<string, string> = {
    ...(await signMessage(secret, text)),
    "content-type": "application/json",
  };
  if (options.clientId !== null) {
    headers[CLIENT_ID_HEADER] = options.clientId ?? CLIENT;
  }
  return new Request("https://api.test/moderation/v1/reports", {
    method: "POST",
    headers,
    body: text,
  });
}

async function errorOf(response: Response) {
  const json = (await response.json()) as { error: { code: string } };
  return json.error.code;
}

describe("POST /moderation/v1/reports", () => {
  it("files a production report with the registered app", async () => {
    const d = production();
    const response = await handleFileReport(await signed(report), d);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      reportId: REPORT_ID,
      corroborated: false,
      sandbox: false,
    });
    expect(d.fileExternal).toHaveBeenCalledWith(APP, report);
    expect(d.fileSandbox).not.toHaveBeenCalled();
  });

  it("routes a development client's report to its sandbox, never the moderators", async () => {
    const d = development();
    const response = await handleFileReport(await signed(report), d);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ sandbox: true });
    expect(d.fileSandbox).toHaveBeenCalledWith(CLIENT, report);
    expect(d.fileExternal).not.toHaveBeenCalled();
  });

  it("reports a corroboration", async () => {
    const response = await handleFileReport(
      await signed(report),
      production({
        fileExternal: () =>
          Promise.resolve({ reportId: REPORT_ID, corroborated: true }),
      }),
    );
    expect(await response.json()).toMatchObject({ corroborated: true });
  });

  it("answers 503 until the signing key is configured", async () => {
    const response = await handleFileReport(
      await signed(report),
      production({ signingKey: undefined }),
    );
    expect(response.status).toBe(503);
    expect(await errorOf(response)).toBe("not_configured");
  });

  it("refuses a request that names no client, or one that is unknown", async () => {
    const none = await handleFileReport(
      await signed(report, { clientId: null }),
      production(),
    );
    expect(none.status).toBe(401);
    expect(await errorOf(none)).toBe("missing_client");

    const malformed = await handleFileReport(
      await signed(report, { clientId: "not-a-uuid" }),
      production(),
    );
    expect(await errorOf(malformed)).toBe("unknown_client");

    const unknown = await handleFileReport(
      await signed(report),
      production({ findClient: () => Promise.resolve(null) }),
    );
    expect(unknown.status).toBe(401);
    expect(await errorOf(unknown)).toBe("unknown_client");
  });

  it("refuses a signature from the wrong secret, an old version or a different key", async () => {
    for (const options of [
      { version: 2 },
      { key: "some-other-moderation-signing-key-0123456789" },
    ]) {
      const d = production();
      const response = await handleFileReport(await signed(report, options), d);
      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe("bad_signature");
      expect(d.fileExternal).not.toHaveBeenCalled();
    }
  });

  it("accepts the rotated secret once the version moves", async () => {
    const response = await handleFileReport(
      await signed(report, { version: 2 }),
      production({
        findClient: () =>
          Promise.resolve({ clientId: CLIENT, secretVersion: 2, appId: APP }),
      }),
    );
    expect(response.status).toBe(201);
  });

  it("refuses a tampered body and a stale timestamp", async () => {
    const good = await signed(report);
    const tampered = new Request(good.url, {
      method: "POST",
      headers: good.headers,
      body: JSON.stringify({ ...report, authorUserId: report.reporterUserId }),
    });
    expect(await errorOf(await handleFileReport(tampered, production()))).toBe(
      "bad_signature",
    );

    const late = await handleFileReport(await signed(report), {
      ...production(),
      now: () => Math.floor(Date.now() / 1000) + 3600,
    });
    expect(late.status).toBe(401);
  });

  it("answers 400 for a body that is not JSON or not a report", async () => {
    const notJson = await handleFileReport(await signed("{nope"), production());
    expect(notJson.status).toBe(400);
    expect(await errorOf(notJson)).toBe("invalid_json");

    const invalid = await handleFileReport(
      await signed({ ...report, reason: "annoying" }),
      production(),
    );
    expect(invalid.status).toBe(400);
    expect(await errorOf(invalid)).toBe("invalid_request");

    const huge = await handleFileReport(
      await signed({ ...report, contentSnapshot: "x".repeat(30_000) }),
      production(),
    );
    expect(huge.status).toBe(400);
  });

  it("maps the database's moderation errors to 4xx responses", async () => {
    const cases = [
      ["unknown_content_type", 422],
      ["unknown_user", 422],
      ["reporter_not_allowed", 403],
      ["rate_limited", 429],
    ] as const;
    for (const [code, status] of cases) {
      const response = await handleFileReport(
        await signed(report),
        production({
          // Drizzle wraps the driver error: the text sits on the cause.
          fileExternal: () =>
            Promise.reject(
              new Error("Failed query", {
                cause: new Error(`moderation:${code}`),
              }),
            ),
        }),
      );
      expect(response.status).toBe(status);
      expect(await errorOf(response)).toBe(code);
      if (status === 429)
        expect(response.headers.get("retry-after")).toBe("3600");
    }
  });

  it("lets an unexpected failure surface as a 500, not a made-up 4xx", async () => {
    await expect(
      handleFileReport(
        await signed(report),
        production({
          fileExternal: () => Promise.reject(new Error("connection reset")),
        }),
      ),
    ).rejects.toThrow("connection reset");
  });
});
