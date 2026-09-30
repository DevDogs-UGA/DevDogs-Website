import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finishReview,
  MissingIdentityError,
  resolveOutcome,
  type FileOutcome,
} from "./finish.js";
import type { Decision } from "./merge.js";
import { loadFileMerge, planReview } from "./plan.js";
import { findCurrentStep, readStepLine } from "./tags.js";
import { TestRepo } from "./test-repo.js";

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

const lines = (marks: Record<number, string> = {}) =>
  Array.from({ length: 30 }, (_, i) => marks[i] ?? `line ${i}`).join("\n") +
  "\n";

/** 00-start; 01 edits lines 3 and 25; 02 edits line 14; 03 renames/deletes/adds a lockfile. */
function build(): TestRepo {
  const r = TestRepo.init();
  r.commit({
    "a.ts": lines(),
    "other.ts": "other\n",
    "old-name.ts": "renamed\nbody\n",
    "gone.ts": "bye\n",
    "pnpm-lock.yaml": "v1\n",
  });
  r.tag("w/00-start", "Start: ");
  r.commit({ "a.ts": lines({ 3: "STEP1 top", 25: "STEP1 bottom" }) });
  r.tag("w/01-one", "One\n\nRun: pnpm add x\nDocs: /docs/one");
  r.commit({
    "a.ts": lines({ 3: "STEP1 top", 14: "STEP2 middle", 25: "STEP1 bottom" }),
  });
  r.tag("w/02-two", "Two");
  r.git("mv", "old-name.ts", "new-name.ts");
  r.commit({ "gone.ts": null, "pnpm-lock.yaml": "v2\n" });
  r.tag("w/03-three", "Three");
  r.git("checkout", "-q", "--detach", "w/00-start");
  return r;
}

async function review(
  r: TestRepo,
  baseTag: string,
  targetTag: string,
  decide: (path: string, id: number) => Decision | undefined,
  options: { autoCommit?: boolean; beforeWrite?: () => Promise<boolean> } = {},
) {
  const line = await readStepLine(r.dir, "w");
  const base = line.find((s) => s.tag === baseTag)!;
  const target = line.find((s) => s.tag === targetTag)!;
  const plan = await planReview(r.dir, line, base, target);
  const outcomes: FileOutcome[] = [];
  for (const file of plan.files) {
    const merge = await loadFileMerge(r.dir, plan, file);
    if (!merge) continue;
    outcomes.push(
      resolveOutcome(
        file,
        merge,
        (id) => decide(file.path, id),
        existsSync(join(r.dir, file.path)),
      ),
    );
  }
  const title = `${target.title}`;
  return finishReview({
    root: r.dir,
    targetTag,
    message: title,
    outcomes,
    fromTarget: plan.fromTarget,
    autoCommit: options.autoCommit ?? true,
    ...(options.beforeWrite ? { beforeWrite: options.beforeWrite } : {}),
  });
}

const rev = (r: TestRepo, ref: string) => r.git("rev-parse", ref).trim();
const read = (r: TestRepo, path: string) =>
  readFileSync(join(r.dir, path), "utf8");

describe("finishReview", () => {
  it("makes a merge commit whose second parent is the step's tag", async () => {
    repo = build();
    const before = rev(repo, "HEAD");
    const result = await review(repo, "w/00-start", "w/01-one", () => "accept");
    expect(result?.commit).toBeTruthy();
    expect(
      repo.git("rev-list", "--parents", "-n1", "HEAD").trim().split(" "),
    ).toEqual([rev(repo, "HEAD"), before, rev(repo, "w/01-one^{commit}")]);
    expect(repo.git("log", "-1", "--format=%s").trim()).toBe("One");
    expect(read(repo, "a.ts")).toBe(
      lines({ 3: "STEP1 top", 25: "STEP1 bottom" }),
    );
    expect(repo.git("status", "--porcelain")).toBe("");

    const line = await readStepLine(repo.dir, "w");
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("w/01-one");
  });

  it("leaves uncommitted work in other files uncommitted (and staged stays staged)", async () => {
    repo = build();
    repo.write("other.ts", "my edit\n");
    repo.write("staged.ts", "staged\n");
    repo.git("add", "staged.ts");
    repo.write("untracked.ts", "u\n");
    await review(repo, "w/00-start", "w/01-one", () => "accept");
    const status = repo.git("status", "--porcelain");
    expect(status).toContain(" M other.ts");
    expect(status).toContain("A  staged.ts");
    expect(status).toContain("?? untracked.ts");
    expect(repo.git("diff", "--name-only", "HEAD^1", "HEAD").trim()).toBe(
      "a.ts",
    );
    expect(read(repo, "other.ts")).toBe("my edit\n");
  });

  it("keeps a rejected change rejected when the next step is reviewed", async () => {
    repo = build();
    // Reject the step's top edit (change 0), accept the bottom one (change 1).
    await review(repo, "w/00-start", "w/01-one", (_p, id) =>
      id === 0 ? "reject" : "accept",
    );
    expect(read(repo, "a.ts")).toBe(lines({ 25: "STEP1 bottom" }));

    await review(repo, "w/01-one", "w/02-two", () => "accept");
    expect(read(repo, "a.ts")).toBe(
      lines({ 14: "STEP2 middle", 25: "STEP1 bottom" }),
    );
    const line = await readStepLine(repo.dir, "w");
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("w/02-two");
  });

  it("agrees with a later plain git merge about the base", async () => {
    repo = build();
    await review(repo, "w/00-start", "w/01-one", (_p, id) =>
      id === 0 ? "reject" : "accept",
    );
    repo.write("other.ts", "my edit\n");
    expect(repo.git("merge-base", "HEAD", "w/02-two").trim()).toBe(
      rev(repo, "w/01-one^{commit}"),
    );
    repo.git("merge", "--no-edit", "w/02-two");
    // The rejected top edit did not come back through git's merge either.
    expect(read(repo, "a.ts")).toBe(
      lines({ 14: "STEP2 middle", 25: "STEP1 bottom" }),
    );
    expect(read(repo, "other.ts")).toBe("my edit\n");
  });

  it("follows delete and rename outcomes and takes lockfiles from the target", async () => {
    repo = build();
    await review(repo, "w/00-start", "w/03-three", () => "accept");
    expect(existsSync(join(repo.dir, "gone.ts"))).toBe(false);
    expect(existsSync(join(repo.dir, "old-name.ts"))).toBe(false);
    expect(read(repo, "new-name.ts")).toBe("renamed\nbody\n");
    expect(read(repo, "pnpm-lock.yaml")).toBe("v2\n");
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.git("cat-file", "-p", "HEAD^{tree}")).not.toContain("gone.ts");
  });

  it("adds a file the .gitignore matches when the step tracks it", async () => {
    repo = TestRepo.init();
    repo.commit({ ".gitignore": ".env*\n", "a.txt": "a\n" });
    repo.tag("w/00-start", "Start: ");
    repo.commit({ ".env.example": "KEY=\n" });
    repo.git("add", "-f", ".env.example");
    repo.git("commit", "-q", "--amend", "--no-edit");
    repo.tag("w/01-one", "One");
    repo.git("checkout", "-q", "--detach", "w/00-start");
    await review(repo, "w/00-start", "w/01-one", () => "accept");
    expect(repo.git("ls-files").split("\n")).toContain(".env.example");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("keeps their own version when everything is rejected", async () => {
    repo = build();
    repo.write("a.ts", lines({ 3: "MINE" }));
    await review(repo, "w/00-start", "w/01-one", () => "reject");
    expect(read(repo, "a.ts")).toBe(lines({ 3: "MINE" }));
    const line = await readStepLine(repo.dir, "w");
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("w/01-one");
  });

  it("writes nothing when beforeWrite declines", async () => {
    repo = build();
    const before = rev(repo, "HEAD");
    const result = await review(
      repo,
      "w/00-start",
      "w/01-one",
      () => "accept",
      {
        beforeWrite: async () => false,
      },
    );
    expect(result).toBeNull();
    expect(rev(repo, "HEAD")).toBe(before);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("writes nothing when git has no name to commit under", async () => {
    repo = build();
    const before = rev(repo, "HEAD");
    let asked = false;
    vi.stubEnv("GIT_AUTHOR_NAME", ""); // what a fresh install with no user.name looks like
    try {
      await expect(
        review(repo, "w/00-start", "w/01-one", () => "accept", {
          beforeWrite: async () => (asked = true),
        }),
      ).rejects.toBeInstanceOf(MissingIdentityError);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(asked).toBe(false);
    expect(rev(repo, "HEAD")).toBe(before);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("runs beforeWrite before the first write, so a branch switch carries the files", async () => {
    repo = build();
    let hadStepCode = true;
    await review(repo, "w/00-start", "w/01-one", () => "accept", {
      beforeWrite: async () => {
        hadStepCode = read(repo!, "a.ts").includes("STEP1");
        repo!.git("switch", "-c", "me/w");
        return true;
      },
    });
    expect(hadStepCode).toBe(false);
    expect(repo.git("branch", "--show-current").trim()).toBe("me/w");
    expect(
      repo.git("rev-list", "--parents", "-n1", "me/w").trim().split(" "),
    ).toHaveLength(3);
  });

  it("with auto-commit off stages the result and leaves a merge in progress", async () => {
    repo = build();
    const result = await review(
      repo,
      "w/00-start",
      "w/01-one",
      () => "accept",
      { autoCommit: false },
    );
    expect(result?.commit).toBeNull();
    expect(repo.git("status", "--porcelain")).toContain("M  a.ts");
    expect(rev(repo, "MERGE_HEAD")).toBe(rev(repo, "w/01-one^{commit}"));
    repo.git("commit", "-q", "--no-edit");
    expect(
      repo.git("rev-list", "--parents", "-n1", "HEAD").trim().split(" "),
    ).toHaveLength(3);
    expect(repo.git("log", "-1", "--format=%s").trim()).toBe("One");
    const line = await readStepLine(repo.dir, "w");
    expect((await findCurrentStep(repo.dir, line))?.tag).toBe("w/01-one");
  });
});
