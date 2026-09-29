import { afterEach, describe, expect, it } from "vitest";
import { findCurrentStep, listWorkshops, parseStepName, parseTagMessage, readStepLine, readSteps } from "./tags.js";
import { TestRepo } from "./test-repo.js";

describe("parseTagMessage", () => {
  it("reads title, Run lines and Docs after a blank line", () => {
    const parsed = parseTagMessage(
      "Read the Guestbook\n\nRun: pnpm add @supabase/supabase-js\nRun: pnpm install\nDocs: /docs/workshops/supabase/nextjs/01-read\n",
    );
    expect(parsed).toEqual({
      title: "Read the Guestbook",
      run: ["pnpm add @supabase/supabase-js", "pnpm install"],
      docs: "/docs/workshops/supabase/nextjs/01-read",
      start: undefined,
    });
  });

  it("reads a Start message", () => {
    expect(parseTagMessage("Start: 01-nextjs-intro\n")).toMatchObject({
      title: "",
      start: "01-nextjs-intro",
      run: [],
    });
  });

  it("tolerates CRLF, extra blank lines, and no trailing newline", () => {
    const parsed = parseTagMessage("\r\nSign in\r\n\r\n\r\nRun: a\r\n\r\nDocs: /docs/x");
    expect(parsed.title).toBe("Sign in");
    expect(parsed.run).toEqual(["a"]);
    expect(parsed.docs).toBe("/docs/x");
  });

  it("handles a title alone and an empty message", () => {
    expect(parseTagMessage("Just a title")).toMatchObject({ title: "Just a title", run: [] });
    expect(parseTagMessage("")).toMatchObject({ title: "", run: [], docs: undefined });
  });

  it("ignores unknown lines and empty Run lines", () => {
    const parsed = parseTagMessage("T\n\nnotes here\nRun:\nRun: x");
    expect(parsed.run).toEqual(["x"]);
  });
});

describe("parseStepName", () => {
  it("splits workshop, number and slug", () => {
    expect(parseStepName("02-supabase/03-insert-naive")).toEqual({
      workshop: "02-supabase",
      number: 3,
      slug: "insert-naive",
    });
    expect(parseStepName("02-supabase/00-start")?.number).toBe(0);
  });
  it("rejects non-step tags", () => {
    expect(parseStepName("v1.0.0")).toBeNull();
    expect(parseStepName("02-supabase/notes")).toBeNull();
  });
});

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

/** 01-intro (no tags) -> 02-supabase steps 0..3 -> 03-auth steps 0..1. */
function buildLine(): TestRepo {
  const r = TestRepo.init();
  r.commit({ "a.txt": "intro\n" }, "intro done");
  r.tag("02-supabase/00-start", "Start: 01-intro");
  r.commit({ "a.txt": "one\n" }, "feat: read");
  r.tag("02-supabase/01-read", "Read it\n\nRun: pnpm add x\nDocs: /docs/workshops/s/01");
  r.commit({ "a.txt": "two\n" }, "feat: sign in");
  r.tag("02-supabase/02-sign-in", "Sign in");
  r.commit({ "a.txt": "three\n" }, "feat: insert");
  r.tag("02-supabase/03-insert", "Insert");
  r.tag("03-auth/00-start", "Start: 02-supabase");
  r.commit({ "a.txt": "four\n" }, "feat: auth one");
  r.tag("03-auth/01-login", "Log in\n\nRun: pnpm add y");
  return r;
}

describe("readSteps / readStepLine", () => {
  it("orders steps and reads messages", async () => {
    repo = buildLine();
    const steps = await readSteps(repo.dir, "02-supabase");
    expect(steps.map((s) => s.tag)).toEqual([
      "02-supabase/00-start",
      "02-supabase/01-read",
      "02-supabase/02-sign-in",
      "02-supabase/03-insert",
    ]);
    expect(steps[0]).toMatchObject({ number: 0, start: "01-intro", title: "Start" });
    expect(steps[1]).toMatchObject({
      title: "Read it",
      run: ["pnpm add x"],
      docs: "/docs/workshops/s/01",
      slug: "read",
    });
    expect(steps[1]!.commit).toBe(repo.git("rev-parse", "02-supabase/01-read^{commit}").trim());
  });

  it("uses the commit subject for lightweight tags", async () => {
    repo = TestRepo.init();
    repo.commit({ f: "1" }, "feat: the first change\n\nbody text");
    repo.tag("w/01-first");
    const [step] = await readSteps(repo.dir, "w");
    expect(step).toMatchObject({ title: "feat: the first change", run: [], docs: undefined });
    expect(step!.commit).toBe(repo.git("rev-parse", "HEAD").trim());
  });

  it("does not mix in a workshop whose name starts with ours", async () => {
    repo = TestRepo.init();
    repo.commit({ f: "1" });
    repo.tag("w/01-a", "A");
    repo.tag("w/x/01-b", "B");
    expect((await readSteps(repo.dir, "w")).map((s) => s.tag)).toEqual(["w/01-a"]);
    expect(await listWorkshops(repo.dir)).toEqual(["w", "w/x"]);
  });

  it("chains workshops through Start:", async () => {
    repo = buildLine();
    const line = await readStepLine(repo.dir, "03-auth");
    expect(line.map((s) => s.tag)).toEqual([
      "02-supabase/00-start",
      "02-supabase/01-read",
      "02-supabase/02-sign-in",
      "02-supabase/03-insert",
      "03-auth/00-start",
      "03-auth/01-login",
    ]);
  });

  it("stops on a Start cycle", async () => {
    repo = TestRepo.init();
    repo.commit({ f: "1" });
    repo.tag("a/00-start", "Start: b");
    repo.tag("b/00-start", "Start: a");
    const line = await readStepLine(repo.dir, "a");
    expect(line.map((s) => s.tag)).toEqual(["b/00-start", "a/00-start"]);
  });
});

describe("findCurrentStep", () => {
  it("is the newest step tag that is an ancestor of HEAD", async () => {
    repo = buildLine();
    const line = await readStepLine(repo.dir, "03-auth");
    repo.git("switch", "-q", "-c", "me", "02-supabase/01-read");
    repo.commit({ mine: "x" });
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("02-supabase/01-read");

    repo.git("merge", "-q", "--no-ff", "-m", "Step 2", "02-supabase/02-sign-in");
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("02-supabase/02-sign-in");
  });

  it("looks back across workshops", async () => {
    repo = buildLine();
    const line = await readStepLine(repo.dir, "03-auth");
    repo.git("switch", "-q", "-c", "me", "02-supabase/03-insert");
    // 03-auth/00-start sits at the same commit, so it is the newest reachable.
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("03-auth/00-start");
  });

  it("is null when no step tag is reachable", async () => {
    repo = buildLine();
    const line = await readStepLine(repo.dir, "02-supabase");
    repo.git("switch", "-q", "--orphan", "fresh");
    repo.commit({ z: "1" });
    expect(await findCurrentStep(repo.dir, line)).toBeNull();
  });
});
