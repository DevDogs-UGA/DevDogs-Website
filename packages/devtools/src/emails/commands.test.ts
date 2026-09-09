import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { destination, generateEmails, parseEmailArgs } from "./commands.js";

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

describe("email preview generation", () => {
  it("writes filled HTML and text", async () => {
    const out = await mkdtemp(join(tmpdir(), "devtools-emails-"));
    const parsed = parseEmailArgs(
      ["TeamInvite", "--format", "html,text", "--out", out],
      "/repo",
    );
    if (parsed instanceof Error) throw parsed;

    const written = await generateEmails(parsed);
    expect(written).toEqual([
      join(out, "TeamInvite.html"),
      join(out, "TeamInvite.txt"),
    ]);
    expect(await readFile(written[0]!, "utf8")).toContain("Byte Bulldogs");
    expect(await readFile(written[1]!, "utf8")).toContain(
      "Review the invitation",
    );
  });
});
