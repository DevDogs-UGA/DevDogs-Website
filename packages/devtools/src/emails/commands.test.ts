import { describe, expect, it } from "vitest";
import { destination, parseEmailArgs } from "./commands.js";

describe("email preview arguments", () => {
  it("selects all templates and both formats", () => {
    expect(
      parseEmailArgs(
        ["*", "--format", "html,text", "--out", "previews"],
        "/repo",
      ),
    ).toMatchObject({
      names: ["JoinRequest", "TeamInvite"],
      formats: ["html", "text"],
      out: "/repo/previews",
    });
  });

  it("rejects unknown templates and formats", () => {
    expect(parseEmailArgs(["Missing"], "/repo")).toBeInstanceOf(Error);
    expect(
      parseEmailArgs(["TeamInvite", "--format", "pdf"], "/repo"),
    ).toBeInstanceOf(Error);
  });

  it("uses distinct extensions", () => {
    expect(destination("/out", "TeamInvite", "html")).toBe(
      "/out/TeamInvite.html",
    );
    expect(destination("/out", "TeamInvite", "text")).toBe(
      "/out/TeamInvite.txt",
    );
  });
});

// The "email preview generation" (`generateEmails`) case moved out — see
// MOVED-TESTS.md. It renders the real `@devdogsuga/email` templates, which
// are "private": true and stay in DevDogsUGA; Backstage has no copy to
// render against.
