import { describe, expect, it } from "vitest";
import {
  PLATFORM_SERVERS,
  createPlatformClient,
  type ReportRequest,
} from "./index.js";
import { createModerationClient } from "../moderation/index.js";

describe("createPlatformClient", () => {
  it("lists the reasons an app can offer", async () => {
    const reasons = [
      { reason: "spam", title: "Spam", description: "Unwanted promotion" },
    ];
    const client = createPlatformClient({
      baseUrl: PLATFORM_SERVERS.staging,
      fetch: (input) => {
        expect(input).toBe(
          "https://api-staging.devdogsuga.org/moderation/v1/reasons",
        );
        return Promise.resolve(Response.json({ reasons }));
      },
    });
    expect(await client.listReportReasons()).toEqual({ reasons });
  });

  it("has no fileReport method: reports are signed by the moderation client", () => {
    const client = createPlatformClient({ baseUrl: "https://x.test" });
    expect(Object.keys(client)).toEqual(["listReportReasons"]);
    expect(typeof createModerationClient).toBe("function");
  });

  it("generated report types are assignable to what the moderation client takes", () => {
    const report: ReportRequest = {
      reporterUserId: "00000000-0000-4000-8000-0000000000b1",
      authorUserId: "00000000-0000-4000-8000-0000000000b2",
      contentType: "session",
      contentRef: "abc",
      contentSnapshot: "text",
      reason: "spam",
    };
    // Typechecked: the zod-inferred type accepts the generated one.
    const client = createModerationClient({
      baseUrl: "https://x.test",
      clientId: "00000000-0000-4000-8000-000000000001",
      secret: "whsec_c2FtcGxlLW1vZGVyYXRpb24tc2VjcmV0LW5vdC1yZWFs",
      fetch: () =>
        Promise.resolve(
          Response.json(
            { reportId: "00000000-0000-4000-8000-0000000000c1", corroborated: false, sandbox: true },
            { status: 201 },
          ),
        ),
    });
    return expect(client.fileReport(report)).resolves.toMatchObject({
      sandbox: true,
    });
  });
});
