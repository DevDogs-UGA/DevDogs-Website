import { describe, expect, it } from "vitest";
import { mergeFile, type ReviewFile, type Step } from "../core/index.js";
import { windowsBashCandidates, resolveBash } from "./bash.js";
import { CommandQueue } from "./command-queue.js";
import { DOCS_ORIGIN, handoffUrl, nextStep } from "./handoff.js";
import {
  changeAtLine,
  fileStatus,
  layoutFor,
  leftText,
  ReviewModel,
} from "./review-model.js";

const L = (...lines: string[]) => lines.map((l) => `${l}\n`).join("");
const file: ReviewFile = {
  path: "a.ts",
  oldPath: undefined,
  status: "modified",
};

/** Two separated step edits (lines 1 and 5) plus their own edit on line 3 (not a change). */
const merge = () =>
  mergeFile({
    base: L("a", "b", "c", "d", "e", "f", "g"),
    ours: L("a", "b", "c", "MINE", "e", "f", "g"),
    theirs: L("a", "B", "c", "d", "e", "F", "g"),
  });

describe("layoutFor", () => {
  it("shows every change accepted until decided, and locates each region", () => {
    const layout = layoutFor(merge(), new Map());
    expect(layout.text).toBe(L("a", "B", "c", "MINE", "e", "F", "g"));
    expect(layout.regions).toEqual([
      { id: 0, start: 1, count: 1, decision: undefined },
      { id: 1, start: 5, count: 1, decision: undefined },
    ]);
    expect(leftText(merge())).toBe(L("a", "b", "c", "MINE", "e", "f", "g"));
  });

  it("snaps a rejected change back to their code and moves later regions", () => {
    const m = mergeFile({
      base: L("a", "b"),
      ours: L("a", "b"),
      theirs: L("a", "x", "y", "b"),
    });
    const accepted = layoutFor(m, new Map([[0, "accept"]]));
    expect(accepted.regions[0]).toMatchObject({
      start: 1,
      count: 2,
      decision: "accept",
    });
    const rejected = layoutFor(m, new Map([[0, "reject"]]));
    expect(rejected.text).toBe(L("a", "b"));
    expect(rejected.regions[0]).toMatchObject({ count: 0, decision: "reject" });
  });

  it("finds the change under a line", () => {
    const layout = layoutFor(merge(), new Map());
    expect(changeAtLine(layout, 1)).toBe(0);
    expect(changeAtLine(layout, 2)).toBe(1); // between: the next one
    expect(changeAtLine(layout, 6)).toBe(1); // past the end: the last
    expect(changeAtLine({ text: "", regions: [] }, 0)).toBeUndefined();
  });
});

describe("ReviewModel", () => {
  const model = () =>
    new ReviewModel([
      { file, merge: merge() },
      { file: { ...file, path: "b.ts" }, merge: merge() },
    ]);

  it("reports pending, accepted, rejected and partial", () => {
    const m = model();
    expect(m.status(0)).toBe("pending");
    m.decide(0, 0, "accept");
    expect(m.status(0)).toBe("partial");
    m.decide(0, 1, "accept");
    expect(m.status(0)).toBe("accepted");
    m.decideFile(1, "reject");
    expect(m.status(1)).toBe("rejected");
    m.decide(1, 0, "accept");
    expect(m.status(1)).toBe("partial");
    expect(fileStatus({ merge: merge(), decisions: new Map() })).toBe(
      "pending",
    );
  });

  it("counts undecided changes and decides in bulk", () => {
    const m = model();
    expect(m.undecided).toBe(4);
    m.decide(0, 0, "reject");
    expect(m.undecided).toBe(3);
    m.decideAll("accept");
    expect(m.undecided).toBe(0);
    expect(m.decider(0)(0)).toBe("accept");
    m.decide(0, 99, "reject"); // unknown change: ignored
    expect(m.files[0]!.decisions.has(99)).toBe(false);
  });

  it("walks to the next file with something left to decide", () => {
    const m = model();
    m.decideFile(1, "accept");
    expect(m.nextFile(0)).toBe(0); // only file 0 is open; wraps to it
    m.decideFile(0, "accept");
    expect(m.nextFile(0)).toBe(1); // all decided: plain next
    expect(new ReviewModel([]).nextFile(0)).toBeUndefined();
  });
});

describe("CommandQueue", () => {
  it("runs in order and only after the previous succeeded", () => {
    const q = new CommandQueue(["one", "two"]);
    expect(q.canRun(1)).toBe(false);
    q.start(0);
    expect(q.items[0]!.state).toBe("running");
    expect(q.canRun(0)).toBe(false); // already running
    q.finish(0, 1);
    expect(q.items[0]).toMatchObject({ state: "failed", exitCode: 1 });
    expect(q.canRun(1)).toBe(false);
    q.retry(0);
    q.start(0);
    q.finish(0, 0);
    expect(q.allDone).toBe(false);
    expect(q.nextIndex).toBe(1);
    q.start(1);
    q.finish(1, 0);
    expect(q.allDone).toBe(true);
    expect(q.nextIndex).toBe(-1);
  });

  it("leaves an unknown exit code for the attendee to confirm", () => {
    const q = new CommandQueue(["x"]);
    q.start(0);
    q.finish(0, undefined);
    expect(q.items[0]!.state).toBe("sent");
    expect(q.allDone).toBe(false);
    q.confirm(0);
    expect(q.allDone).toBe(true);
  });

  it("has nothing to do for an empty list", () => {
    expect(new CommandQueue([]).allDone).toBe(true);
  });
});

describe("bash", () => {
  const base = { env: {}, exists: () => false };

  it("is plain bash off Windows", () => {
    expect(
      resolveBash({ ...base, platform: "linux", gitExecPath: undefined }),
    ).toBe("bash");
    expect(
      resolveBash({ ...base, platform: "darwin", gitExecPath: undefined }),
    ).toBe("bash");
  });

  it("finds Git Bash from git's exec path, else probes standard installs", () => {
    const exec = "C:\\Program Files\\Git\\mingw64\\libexec\\git-core";
    const wanted = "C:\\Program Files\\Git\\bin\\bash.exe";
    expect(
      resolveBash({
        platform: "win32",
        gitExecPath: exec,
        env: {},
        exists: (p) => p === wanted,
      }),
    ).toBe(wanted);
    expect(
      resolveBash({
        platform: "win32",
        gitExecPath: undefined,
        env: { ProgramFiles: "D:\\Apps" },
        exists: (p) => p === "D:\\Apps\\Git\\bin\\bash.exe",
      }),
    ).toBe("D:\\Apps\\Git\\bin\\bash.exe");
  });

  it("gives up rather than picking the WSL launcher", () => {
    expect(
      resolveBash({ ...base, platform: "win32", gitExecPath: "C:\\x" }),
    ).toBeUndefined();
    expect(windowsBashCandidates({ gitExecPath: undefined, env: {} })).toEqual(
      [],
    );
  });
});

describe("handoff", () => {
  const step = (n: number, docs?: string): Step => ({
    tag: `w/${String(n).padStart(2, "0")}-s`,
    workshop: "w",
    number: n,
    slug: "s",
    title: "t",
    run: [],
    docs,
    commit: "c",
    start: undefined,
  });
  const line = [
    step(0),
    step(1),
    step(2, "/docs/workshops/supabase/nextjs/02-sign-in"),
    step(3),
  ];

  it("picks the step after the target, skipping start markers", () => {
    expect(nextStep(line, line[1]!)?.number).toBe(2);
    expect(nextStep(line, line[3]!)).toBeUndefined();
    expect(nextStep([step(1), step(0), step(2)], step(1))?.number).toBe(2);
  });

  it("builds the docs URL with the finished steps and the session", () => {
    expect(
      handoffUrl({
        nextDocs: "/docs/workshops/supabase/nextjs/02-sign-in",
        doneTags: ["02-supabase/01-read", "02-supabase/02-sign-in"],
        session: "abc 123",
      }),
    ).toBe(
      `${DOCS_ORIGIN}/docs/workshops/supabase/nextjs/02-sign-in#done=02-supabase%2F01-read,02-supabase%2F02-sign-in&session=abc%20123`,
    );
  });

  it("does nothing without a session, or for a path that isn't a docs path", () => {
    const ok = { nextDocs: "/docs/a", doneTags: ["t"] };
    expect(handoffUrl({ ...ok, session: undefined })).toBeUndefined();
    expect(
      handoffUrl({ ...ok, session: "s", nextDocs: undefined }),
    ).toBeUndefined();
    for (const bad of [
      "//evil.com/docs/x",
      "/docs//x",
      "https://evil.com",
      "/other/x",
      "/docs/x?y=1",
      "/docs/x y",
    ]) {
      expect(
        handoffUrl({ ...ok, session: "s", nextDocs: bad }),
        bad,
      ).toBeUndefined();
    }
  });
});
