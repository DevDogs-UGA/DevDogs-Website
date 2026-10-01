import { describe, expect, it } from "vitest";
import { CLUB_MAILBOX, parseNewsletterArgs, sendSummary } from "./commands.js";

const CWD = "/somewhere";

describe("parseNewsletterArgs", () => {
  it("renders both files by default, into ./changelog-exports", () => {
    const options = parseNewsletterArgs(["render", "3.0.0"], CWD);
    expect(options.subcommand).toBe("render");
    expect(options.versions).toEqual(["3.0.0"]);
    expect(options.formats).toEqual(["eml", "html"]);
    expect(options.out).toBe("/somewhere/changelog-exports");
  });

  it("reads --format and --out as values, never as issues", () => {
    const options = parseNewsletterArgs(
      ["render", "--format", "html", "--out", "/tmp/x", "3.0.0", "3.0.1"],
      CWD,
    );
    expect(options.formats).toEqual(["html"]);
    expect(options.out).toBe("/tmp/x");
    expect(options.versions).toEqual(["3.0.0", "3.0.1"]);
  });

  it("refuses a format that is not eml or html", () => {
    expect(() =>
      parseNewsletterArgs(["render", "3.0.0", "--format", "pdf"], CWD),
    ).toThrow("Unknown format pdf");
  });

  it("needs a subcommand, and knows only render, draft and send", () => {
    expect(() => parseNewsletterArgs([], CWD)).toThrow("Name what to do");
    expect(() => parseNewsletterArgs(["3.0.0"], CWD)).toThrow(
      'Unknown newsletter command "3.0.0"',
    );
    // The old flag-shaped spellings are not subcommands.
    expect(() => parseNewsletterArgs(["--send", "a@uga.edu"], CWD)).toThrow(
      "Unknown newsletter command",
    );
  });

  it("drafts with no recipients and no files", () => {
    const options = parseNewsletterArgs(["draft", "3.0.0"], CWD);
    expect(options.subcommand).toBe("draft");
    expect(options.to).toEqual([]);
  });

  describe("send", () => {
    it("requires --to: there is no default audience", () => {
      expect(() => parseNewsletterArgs(["send", "3.0.0"], CWD)).toThrow(
        "needs --to",
      );
    });

    it("reads --to as a recipient list", () => {
      const options = parseNewsletterArgs(
        ["send", "3.0.1", "--to", "a@uga.edu, b@uga.edu"],
        CWD,
      );
      expect(options.to).toEqual(["a@uga.edu", "b@uga.edu"]);
      expect(options.versions).toEqual(["3.0.1"]);
      expect(options.yes).toBe(false);
    });

    it("refuses what is not an address, so a version cannot become a recipient", () => {
      expect(() => parseNewsletterArgs(["send", "--to", "3.0.2"], CWD)).toThrow(
        "email addresses",
      );
    });

    it("carries --yes", () => {
      expect(
        parseNewsletterArgs(
          ["send", "1.0.0", "--to", "a@uga.edu", "--yes"],
          CWD,
        ).yes,
      ).toBe(true);
    });
  });

  it("has no --mailbox: the club mailbox is the only one", () => {
    expect(() =>
      parseNewsletterArgs(["draft", "3.0.0", "--mailbox", "me@uga.edu"], CWD),
    ).toThrow("no --mailbox");
    expect(CLUB_MAILBOX).toBe("devdogs@uga.edu");
  });

  it("keeps each flag to its own subcommand", () => {
    expect(() =>
      parseNewsletterArgs(["draft", "3.0.0", "--to", "a@uga.edu"], CWD),
    ).toThrow("belongs to `newsletter send`");
    expect(() =>
      parseNewsletterArgs(
        ["send", "3.0.0", "--out", "x", "--to", "a@uga.edu"],
        CWD,
      ),
    ).toThrow("belongs to `newsletter render`");
  });
});

describe("sendSummary", () => {
  it("names the issues, the sender and every recipient", () => {
    const text = sendSummary(["3.0.0", "3.0.1"], ["a@uga.edu", "b@uga.edu"]);
    expect(text).toContain("v3.0.0, v3.0.1");
    expect(text).toContain(CLUB_MAILBOX);
    expect(text).toContain("2 recipients: a@uga.edu, b@uga.edu");
  });

  it("says recipient, singular, for one", () => {
    expect(sendSummary(["3.0.0"], ["a@uga.edu"])).toContain("1 recipient:");
  });
});
