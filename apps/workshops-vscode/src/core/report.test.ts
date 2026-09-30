import { describe, expect, it, vi } from "vitest";
import {
  ExpectedError,
  GitError,
  Reporter,
  guard,
  isExpectedError,
  scrubEvent,
  scrubText,
  type ReportEvent,
} from "./index.js";

const context = {
  paths: ["/home/ada", "/home/ada/code/Web-Workshops", "C:\\Users\\Ada"],
  username: "ada-l",
};

describe("scrubText", () => {
  it("replaces the home dir, the repo and workspace paths", () => {
    expect(
      scrubText("ENOENT: /home/ada/code/Web-Workshops/app/page.tsx", context),
    ).toBe("ENOENT: <path>/app/page.tsx");
    expect(scrubText("open /home/ada/notes.txt failed", context)).toBe(
      "open <path>/notes.txt failed",
    );
  });
  it("handles Windows paths in either slash style", () => {
    expect(scrubText("at C:\\Users\\Ada\\code\\x.ts:1:2", context)).toBe(
      "at <path>\\code\\x.ts:1:2",
    );
    expect(scrubText("C:/Users/ada/code/x.ts", context)).toBe(
      "<path>/code/x.ts",
    );
  });
  it("shrinks other absolute paths to their file name", () => {
    expect(
      scrubText("cannot read /var/tmp/some/dir/file.txt now", context),
    ).toBe("cannot read file.txt now");
  });
  it("redacts the username, emails, tokens and URL credentials", () => {
    expect(scrubText("error: branch ada-l/02-supabase exists", context)).toBe(
      "error: branch <user>/02-supabase exists",
    );
    expect(scrubText("mail ada@example.com", context)).toBe("mail [email]");
    expect(
      scrubText("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 bad", context),
    ).toBe("token [redacted] bad");
    expect(scrubText("fatal: https://ada:secret@github.com/x/y", context)).toBe(
      "fatal: https://github.com/x/y",
    );
  });
  it("leaves ordinary text and a username inside another word alone", () => {
    expect(
      scrubText("Step not in the line: 02-supabase/01-read", context),
    ).toBe("Step not in the line: 02-supabase/01-read");
    expect(scrubText("ada-lovelace", context)).toBe("ada-lovelace");
  });
});

describe("scrubEvent", () => {
  const event: ReportEvent = {
    message: "failed in /home/ada/code/Web-Workshops",
    exception: {
      values: [
        {
          type: "GitError",
          value: `git merge failed: ${"x".repeat(500)}`,
          stacktrace: {
            frames: [
              {
                filename:
                  "/home/ada/.vscode/extensions/devdogsuga.workshops-1.0.0/dist/extension.js",
                abs_path: "/home/ada/.vscode/extensions/x/dist/extension.js",
                lineno: 3,
                context_line: "const secret = readFileSync('/home/ada/.env')",
                pre_context: ["a"],
                post_context: ["b"],
                vars: { token: "abc" },
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [{ message: "file contents" }],
    user: { email: "ada@example.com" },
    request: { url: "x" },
    server_name: "ada-laptop",
    extra: {
      output: "see /home/ada/code/Web-Workshops/.env for ada@example.com",
      nested: { file: "/home/ada/x/y.txt" },
    },
    contexts: { os: { name: "Linux", kernel: "6.1 ada-laptop" } },
  };
  const out = scrubEvent(event, context);

  it("scrubs and truncates messages", () => {
    expect(out.message).toBe("failed in <path>");
    expect(out.exception!.values![0]!.value!.length).toBe(300);
  });
  it("scrubs frames and drops source context", () => {
    const frame = out.exception!.values![0]!.stacktrace!.frames![0]!;
    expect(frame["filename"]).toBe(
      "<path>/.vscode/extensions/devdogsuga.workshops-1.0.0/dist/extension.js",
    );
    expect(frame["abs_path"]).toBe(
      "<path>/.vscode/extensions/x/dist/extension.js",
    );
    expect(frame["lineno"]).toBe(3);
    for (const key of ["context_line", "pre_context", "post_context", "vars"])
      expect(frame).not.toHaveProperty(key);
  });
  it("drops breadcrumbs, user, request and server name", () => {
    for (const key of ["breadcrumbs", "user", "request", "server_name"])
      expect(out).not.toHaveProperty(key);
  });
  it("scrubs extras deeply", () => {
    expect(out.extra).toEqual({
      output: "see <path>/.env for [email]",
      nested: { file: "<path>/x/y.txt" },
    });
  });
  it("keeps only the os and runtime name and version in contexts", () => {
    expect(out.contexts).toEqual({ os: { name: "Linux" } });
  });
  it("does not change the input", () => {
    expect(event.message).toBe("failed in /home/ada/code/Web-Workshops");
    expect(event.breadcrumbs).toBeDefined();
  });
  it("leaves nothing identifying anywhere in the output", () => {
    const text = JSON.stringify(out);
    for (const needle of [
      "/home/ada",
      "ada@example.com",
      "ada-laptop",
      "Web-Workshops/.env",
      "secret",
    ]) {
      expect(text).not.toContain(needle);
    }
  });
});

describe("isExpectedError", () => {
  it("is true for ExpectedError", () => {
    expect(
      isExpectedError(new ExpectedError("That link points outside your clone")),
    ).toBe(true);
  });
  it("is true for git refusing because of the attendee's state", () => {
    const git = (stderr: string) => new GitError(["switch", "x"], 1, stderr);
    expect(
      isExpectedError(
        git(
          "error: Your local changes to the following files would be overwritten by checkout",
        ),
      ),
    ).toBe(true);
    expect(isExpectedError(git("fatal: not a git repository"))).toBe(true);
    expect(
      isExpectedError(
        git(
          "fatal: unable to access 'https://github.com/': Could not resolve host: github.com",
        ),
      ),
    ).toBe(true);
  });
  it("is false for other git failures and ordinary errors", () => {
    expect(
      isExpectedError(
        new GitError(
          ["merge"],
          128,
          "fatal: refusing to merge unrelated histories",
        ),
      ),
    ).toBe(false);
    expect(isExpectedError(new Error("Step not in the line: x"))).toBe(false);
    expect(isExpectedError(new TypeError("undefined is not a function"))).toBe(
      false,
    );
    expect(isExpectedError("a string")).toBe(false);
    expect(isExpectedError(null)).toBe(false);
  });
  it("is true for a file the attendee removed or can't be written", () => {
    expect(
      isExpectedError(Object.assign(new Error("gone"), { code: "ENOENT" })),
    ).toBe(true);
    expect(
      isExpectedError(Object.assign(new Error("full"), { code: "ENOSPC" })),
    ).toBe(true);
  });
});

describe("Reporter", () => {
  const make = (enabled: boolean, dsn = true) => {
    const send = vi.fn();
    const state = { enabled };
    const reporter = new Reporter(
      dsn ? { enabled: () => state.enabled, send } : undefined,
    );
    return { reporter, send, state };
  };

  it("sends an unexpected error while telemetry is on", () => {
    const { reporter, send } = make(true);
    const error = new Error("boom");
    expect(reporter.capture(error, "finish")).toBe(true);
    expect(send).toHaveBeenCalledWith(error, "finish");
  });
  it("sends nothing while telemetry is off, and follows it turning on and off", () => {
    const { reporter, send, state } = make(false);
    expect(reporter.capture(new Error("a"), "x")).toBe(false);
    state.enabled = true;
    expect(reporter.capture(new Error("b"), "x")).toBe(true);
    state.enabled = false;
    expect(reporter.capture(new Error("c"), "x")).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("sends nothing without a DSN (no client)", () => {
    const { reporter } = make(true, false);
    expect(reporter.capture(new Error("a"), "x")).toBe(false);
  });
  it("skips expected errors", () => {
    const { reporter, send } = make(true);
    expect(reporter.capture(new ExpectedError("nope"), "x")).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("never throws itself", () => {
    const reporter = new Reporter({
      enabled: () => true,
      send: () => {
        throw new Error("transport");
      },
    });
    expect(reporter.capture(new Error("a"), "x")).toBe(false);
  });
});

describe("guard", () => {
  it("reports a thrown or rejected error and rethrows it", async () => {
    const capture = vi.fn();
    const boom = new Error("boom");
    expect(() =>
      guard(capture, "cmd", () => {
        throw boom;
      })(),
    ).toThrow(boom);
    await expect(
      guard(capture, "cmd2", async () => {
        throw boom;
      })(),
    ).rejects.toBe(boom);
    expect(capture).toHaveBeenNthCalledWith(1, "cmd", boom);
    expect(capture).toHaveBeenNthCalledWith(2, "cmd2", boom);
  });
  it("passes results through and reports nothing", async () => {
    const capture = vi.fn();
    expect(guard(capture, "c", (a: number) => a + 1)(1)).toBe(2);
    expect(await guard(capture, "c", async () => 5)()).toBe(5);
    expect(capture).not.toHaveBeenCalled();
  });
});
